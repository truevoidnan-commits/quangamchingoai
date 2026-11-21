-- ==============================================================================
-- SUPABASE POSTGRESQL MIGRATION: OCC SCHEMA & RPC (STAGE A)
-- Môi trường áp dụng: Supabase Local / Staging (TUYỆT ĐỐI CHƯA CHẠY TRÊN PRODUCTION)
-- Phiên bản: 20261120_cultivation_occ_stage_a
-- Tham chiếu thiết kế: docs/CULTIVATION_OCC_DESIGN.md (Commit 2c2e83c / PR #4 & PR #5)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. BẢNG DỮ LIỆU TU VI (CULTIVATION TABLE SCHEMA)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cultivation (
    user_id UUID PRIMARY KEY,
    rev BIGINT NOT NULL DEFAULT 0,
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at BIGINT NOT NULL DEFAULT 0,
    device_id TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- BẢO VỆ TƯƠNG THÍCH SCHEMA PRODUCTION HIỆN HỮU (GATE 1):
-- 1. Nâng cấp rev từ INTEGER sang BIGINT nếu đang là INTEGER (Bảo toàn 100% dữ liệu rev = 4203)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'cultivation' 
          AND column_name = 'rev' AND data_type = 'integer'
    ) THEN
        ALTER TABLE public.cultivation ALTER COLUMN rev TYPE BIGINT;
    END IF;
END $$;

-- 2. Bổ sung created_at nếu bảng cũ chưa có
ALTER TABLE public.cultivation ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 3. Thiết lập default cho device_id nhưng giữ tính tương thích với NULL
ALTER TABLE public.cultivation ALTER COLUMN device_id SET DEFAULT '';

-- Chỉ mục hỗ trợ tối ưu tìm kiếm theo user_id
CREATE INDEX IF NOT EXISTS idx_cultivation_user_id ON public.cultivation (user_id);

-- Bật Row Level Security (RLS)
ALTER TABLE public.cultivation ENABLE ROW LEVEL SECURITY;

-- Đảm bảo có policy SELECT cho chính chủ nếu môi trường mới chưa có policy nào
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'cultivation' 
          AND policyname = 'Users can select own cultivation'
    ) THEN
        CREATE POLICY "Users can select own cultivation"
        ON public.cultivation
        FOR SELECT
        TO authenticated
        USING ((SELECT auth.uid()) = user_id);
    END IF;
END $$;

-- LƯU Ý BẢO VỆ SCHEMA STAGE A:
-- Tuyệt đối KHÔNG thay thế các policy đang có của production.
-- Tuyệt đối KHÔNG cấp thêm GRANT ghi vượt quyền RLS trên bảng cultivation.
-- Quyền đọc/ghi hiện hữu của client cũ trên cultivation được giữ nguyên trạng thái sẵn có
-- cho đến khi thực thi Migration Stage B (Cutover Lockdown).

-- ------------------------------------------------------------------------------
-- 2. BẢNG NHẬT KÝ IDEMPOTENCY (REQUEST JOURNAL)
-- Ngăn chặn rủi ro mất gói tin ACK mạng và request khác xen vào giữa 2 lần retry
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cultivation_idempotency_log (
    user_id UUID NOT NULL,
    idempotency_key TEXT NOT NULL,
    committed_rev BIGINT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, idempotency_key)
);

-- Chỉ mục hỗ trợ dọn dẹp nhật ký cũ
CREATE INDEX IF NOT EXISTS idx_cultivation_idempotency_log_created_at 
ON public.cultivation_idempotency_log (created_at);

-- Bật RLS cho bảng nhật ký
ALTER TABLE public.cultivation_idempotency_log ENABLE ROW LEVEL SECURITY;

-- Thu hồi toàn bộ quyền đọc/ghi trực tiếp từ client trên bảng nhật ký (chỉ RPC/service_role được truy cập)
REVOKE ALL ON TABLE public.cultivation_idempotency_log FROM anon, authenticated, public;

-- Hàm hỗ trợ dọn dẹp các key cũ hơn N ngày (chạy qua pg_cron hoặc job quản trị)
CREATE OR REPLACE FUNCTION public.cleanup_cultivation_idempotency_log(p_days INTEGER DEFAULT 7)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Kiểm tra giới hạn tham số p_days
    IF p_days IS NULL OR p_days < 1 OR p_days > 365 THEN
        RAISE EXCEPTION 'Tham số p_days không hợp lệ, phải nằm trong khoảng từ 1 đến 365 ngày.';
    END IF;

    DELETE FROM public.cultivation_idempotency_log
    WHERE created_at < NOW() - (p_days || ' days')::INTERVAL;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$;

-- BẢO MẬT HÀM CLEANUP: Thu hồi EXECUTE khỏi PUBLIC, anon và authenticated.
-- Chỉ cấp quyền cho vai trò quản trị (service_role, postgres)
REVOKE EXECUTE ON FUNCTION public.cleanup_cultivation_idempotency_log(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_cultivation_idempotency_log(INTEGER) TO service_role;

-- ------------------------------------------------------------------------------
-- 3. BẢNG CẤU HÌNH HỆ THỐNG / CIRCUIT BREAKER (MAINTENANCE MODE)
-- Cho phép bật/tắt bảo trì đồng bộ tu vi tức thì mà không cần DROP FUNCTION
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_system_flags (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_system_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_system_flags FROM anon, authenticated, public;
GRANT SELECT ON TABLE public.app_system_flags TO authenticated;

-- Khởi tạo cờ bảo trì tu vi (mặc định tắt)
INSERT INTO public.app_system_flags (key, value)
VALUES ('cultivation_maintenance', '{"enabled": false, "message": "Hệ thống đang hoạt động bình thường"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 4. RPC FUNCTION NGUYÊN TỬ: sync_cultivation_occ
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_cultivation_occ(
    p_expected_rev BIGINT,
    p_state JSONB,
    p_updated_at BIGINT,
    p_device_id TEXT,
    p_idempotency_key TEXT,
    p_request_fingerprint TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_current_row public.cultivation%ROWTYPE;
    v_new_rev BIGINT;
    v_existing_log public.cultivation_idempotency_log%ROWTYPE;
    v_server_fingerprint TEXT;
    v_maintenance JSONB;
BEGIN
    -- 1. Xác thực người dùng qua Supabase Auth session token
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'ERROR',
            'code', 'UNAUTHORIZED',
            'message', 'Yêu cầu đăng nhập hợp lệ để đồng bộ tu vi.'
        );
    END IF;

    -- 2. Kiểm tra Circuit Breaker (Chế độ bảo trì an toàn)
    SELECT value INTO v_maintenance
    FROM public.app_system_flags
    WHERE key = 'cultivation_maintenance';

    IF v_maintenance IS NOT NULL AND (v_maintenance->>'enabled')::boolean = true THEN
        RETURN jsonb_build_object(
            'status', 'MAINTENANCE',
            'code', 'SYNC_PAUSED',
            'message', COALESCE(v_maintenance->>'message', 'Hệ thống đồng bộ tu vi đang tạm bảo trì nâng cấp. Dữ liệu cục bộ được bảo lưu an toàn 100%.')
        );
    END IF;

    -- 3. Kiểm tra tính hợp lệ của tham số đầu vào (Input Validation)
    IF p_expected_rev < 0 OR p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) = 0 OR length(p_idempotency_key) > 64 THEN
        RETURN jsonb_build_object(
            'status', 'ERROR',
            'code', 'INVALID_INPUT',
            'message', 'Tham số expected_rev hoặc idempotency_key không hợp lệ.'
        );
    END IF;

    IF octet_length(p_state::text) > 524288 THEN
        RETURN jsonb_build_object(
            'status', 'ERROR',
            'code', 'PAYLOAD_TOO_LARGE',
            'message', 'Kích thước dữ liệu tu vi vượt quá giới hạn an toàn (512KB).'
        );
    END IF;

    -- Server TỰ TÍNH fingerprint để không tin một fingerprint tùy ý từ client
    v_server_fingerprint := md5(p_expected_rev::text || ':' || p_state::text);

    -- Nếu client có gửi kèm fingerprint, server xác minh tính trùng khớp
    IF p_request_fingerprint IS NOT NULL AND length(trim(p_request_fingerprint)) > 0 THEN
        IF p_request_fingerprint <> v_server_fingerprint THEN
            RETURN jsonb_build_object(
                'status', 'ERROR',
                'code', 'INVALID_FINGERPRINT',
                'message', 'Request fingerprint client cung cấp không khớp với dữ liệu tính toán từ server.'
            );
        END IF;
    END IF;

    -- 4. Khóa dòng dữ liệu của user để kiểm tra và cập nhật nguyên tử (Row-Level Lock)
    SELECT * INTO v_current_row
    FROM public.cultivation
    WHERE user_id = v_user_id
    FOR UPDATE;

    -- 5. Kiểm tra bảng nhật ký Idempotency Log
    SELECT * INTO v_existing_log
    FROM public.cultivation_idempotency_log
    WHERE user_id = v_user_id AND idempotency_key = p_idempotency_key;

    IF FOUND THEN
        -- Đã có request với cùng idempotency_key
        IF v_existing_log.request_fingerprint = v_server_fingerprint THEN
            -- Cùng key và cùng payload -> Replay kết quả thành công hợp lệ
            RETURN jsonb_build_object(
                'status', 'SUCCESS',
                'idempotent_replay', true,
                'committed_rev', v_existing_log.committed_rev,
                'current_cloud_rev', COALESCE(v_current_row.rev, v_existing_log.committed_rev),
                'updated_at', p_updated_at
            );
        ELSE
            -- Cùng key nhưng khác fingerprint hoặc khác expected_rev -> TỪ CHỐI RÕ RÀNG
            RETURN jsonb_build_object(
                'status', 'ERROR',
                'code', 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
                'message', 'Không thể tái sử dụng idempotency_key cho request mang dữ liệu hoặc expected_rev khác.'
            );
        END IF;
    END IF;

    -- 6. Trường hợp dòng dữ liệu chưa tồn tại trên Cloud (First-time Onboarding)
    IF NOT FOUND AND v_current_row.user_id IS NULL THEN
        IF p_expected_rev > 0 THEN
            RETURN jsonb_build_object(
                'status', 'CONFLICT',
                'reason', 'ROW_NOT_FOUND',
                'current_cloud', NULL
            );
        END IF;

        -- Khởi tạo bản ghi đầu tiên với rev = 1 (Quyết định 4A: Thiết bị đến trước thắng)
        INSERT INTO public.cultivation (
            user_id, rev, state, updated_at, device_id
        ) VALUES (
            v_user_id, 1, p_state, p_updated_at, COALESCE(p_device_id, '')
        )
        ON CONFLICT (user_id) DO NOTHING;

        IF FOUND THEN
            -- Ghi nhận vào nhật ký idempotency trong cùng transaction nguyên tử
            INSERT INTO public.cultivation_idempotency_log (
                user_id, idempotency_key, committed_rev, request_fingerprint
            ) VALUES (
                v_user_id, p_idempotency_key, 1, v_server_fingerprint
            )
            ON CONFLICT (user_id, idempotency_key) DO NOTHING;

            RETURN jsonb_build_object(
                'status', 'SUCCESS',
                'rev', 1,
                'updated_at', p_updated_at,
                'is_first_insert', true
            );
        ELSE
            -- Thiết bị khác vừa chèn trước trong tích tắc -> Trả về CONFLICT kèm dữ liệu Cloud
            SELECT * INTO v_current_row FROM public.cultivation WHERE user_id = v_user_id;
            RETURN jsonb_build_object(
                'status', 'CONFLICT',
                'reason', 'CONCURRENT_FIRST_INSERT',
                'current_cloud', jsonb_build_object(
                    'rev', v_current_row.rev,
                    'state', v_current_row.state,
                    'updated_at', v_current_row.updated_at,
                    'device_id', v_current_row.device_id
                )
            );
        END IF;
    END IF;

    -- 7. Kiểm tra Expected Revision (Cốt lõi Concurrency Control)
    IF v_current_row.rev != p_expected_rev THEN
        RETURN jsonb_build_object(
            'status', 'CONFLICT',
            'reason', 'REV_MISMATCH',
            'expected_rev', p_expected_rev,
            'current_cloud', jsonb_build_object(
                'rev', v_current_row.rev,
                'state', v_current_row.state,
                'updated_at', v_current_row.updated_at,
                'device_id', v_current_row.device_id
            )
        );
    END IF;

    -- 8. Revision hoàn toàn khớp -> Tăng đơn điệu Cloud rev và ghi nhật ký nguyên tử
    v_new_rev := v_current_row.rev + 1;

    UPDATE public.cultivation
    SET rev = v_new_rev,
        state = p_state,
        updated_at = p_updated_at,
        device_id = COALESCE(p_device_id, '')
    WHERE user_id = v_user_id;

    INSERT INTO public.cultivation_idempotency_log (
        user_id, idempotency_key, committed_rev, request_fingerprint
    ) VALUES (
        v_user_id, p_idempotency_key, v_new_rev, v_server_fingerprint
    )
    ON CONFLICT (user_id, idempotency_key) DO NOTHING;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'rev', v_new_rev,
        'updated_at', p_updated_at
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. PHÂN QUYỀN RPC CHO STAGE A
-- ------------------------------------------------------------------------------
-- Cấp quyền thực thi function RPC duy nhất cho authenticated
REVOKE EXECUTE ON FUNCTION public.sync_cultivation_occ(BIGINT, JSONB, BIGINT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_cultivation_occ(BIGINT, JSONB, BIGINT, TEXT, TEXT, TEXT) TO authenticated;
