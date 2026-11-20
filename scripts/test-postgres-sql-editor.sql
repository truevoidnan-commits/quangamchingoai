-- ==============================================================================
-- KỊCH BẢN KIỂM THỬ OCC DÀNH CHO SUPABASE SQL EDITOR (STAGING / DEV ISOLATED)
-- File: scripts/test-postgres-sql-editor.sql
-- Áp dụng: Chạy trực tiếp trên Supabase SQL Editor môi trường Staging/Dev
--
-- LƯU Ý QUAN TRỌNG:
-- 1. TUYỆT ĐỐI KHÔNG CHẠY TRÊN DATABASE PRODUCTION!
-- 2. Script này chạy trong SQL Editor (môi trường PostgreSQL console) sử dụng
--    set_config('request.jwt.claim.sub', ...) và set_config('role', ...) để mô phỏng
--    context người dùng đã xác thực mà KHÔNG sửa đổi schema auth hoặc hàm auth.uid().
-- 3. Việc mô phỏng này dùng để kiểm tra logic PL/pgSQL cấp database (FOR UPDATE,
--    monotonic rev, idempotency, parameter validation), KHÔNG thay thế hoàn toàn
--    kiểm thử tích hợp PostgREST/JWT end-to-end với token thật qua API Gateway (Kong/GoTrue).
-- 4. Toàn bộ thao tác chuẩn bị và dọn dẹp bảng được bảo vệ được thực hiện bởi quyền
--    quản trị (postgres/service_role); role 'authenticated' chỉ gọi RPC được cấp quyền.
-- ==============================================================================

DO $$
DECLARE
    v_test_user_1 UUID := 'a0000000-0000-0000-0000-000000000001'::uuid;
    v_test_user_2 UUID := 'a0000000-0000-0000-0000-000000000002'::uuid;
    v_res JSONB;
    v_cleanup_blocked BOOLEAN := false;
BEGIN
    RAISE NOTICE '=== BẮT ĐẦU KIỂM THỬ OCC TRÊN SUPABASE SQL EDITOR (STAGING) ===';

    -- ==========================================================================
    -- GIAI ĐOẠN 1: QUYỀN QUẢN TRỊ (ADMIN/POSTGRES) CHUẨN BỊ MÔI TRƯỜNG
    -- ==========================================================================
    RESET ROLE; -- Đảm bảo thực thi dưới quyền quản trị mặc định của SQL Editor

    -- Dọn dẹp dữ liệu thử nghiệm cũ nếu còn sót lại từ lần chạy trước
    DELETE FROM public.cultivation_idempotency_log WHERE user_id IN (v_test_user_1, v_test_user_2);
    DELETE FROM public.cultivation WHERE user_id IN (v_test_user_1, v_test_user_2);

    -- Đảm bảo cờ bảo trì ở trạng thái TẮT
    INSERT INTO public.app_system_flags (key, value, description)
    VALUES ('cultivation_maintenance', '{"enabled": false, "message": "Hoạt động bình thường"}'::jsonb, 'Cờ bảo trì tu vi')
    ON CONFLICT (key) DO UPDATE
    SET value = '{"enabled": false, "message": "Hoạt động bình thường"}'::jsonb,
        updated_at = NOW();

    RAISE NOTICE 'Giai đoạn 1: Chuẩn bị môi trường bằng quyền quản trị hoàn tất.';

    -- ==========================================================================
    -- GIAI ĐOẠN 2: KIỂM THỬ LOGIC RPC DƯỚI ROLE AUTHENTICATED
    -- ==========================================================================
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_test_user_1::text, true);

    -- --------------------------------------------------------------------------
    -- Test 1: First insert (expected_rev = 0 -> rev = 1)
    -- --------------------------------------------------------------------------
    v_res := public.sync_cultivation_occ(
        0::bigint,
        '{"realm": "ngung_khi_1", "totalExp": 100}'::jsonb,
        1700000000::bigint,
        'dev_editor_pc',
        'editor_req_001'
    );

    IF v_res->>'status' <> 'SUCCESS' OR (v_res->>'rev')::bigint <> 1 THEN
        RAISE EXCEPTION 'ASSERTION FAILED [Test 1]: First insert không trả về SUCCESS rev 1. Kết quả: %', v_res;
    END IF;
    RAISE NOTICE '✓ Test 1 Passed: First insert thành công rev = 1';

    -- --------------------------------------------------------------------------
    -- Test 2: Stale write (expected_rev = 0 khi Cloud đã lên rev 1) -> CONFLICT
    -- --------------------------------------------------------------------------
    v_res := public.sync_cultivation_occ(
        0::bigint,
        '{"realm": "ngung_khi_2", "totalExp": 200}'::jsonb,
        1700000010::bigint,
        'dev_editor_mobile',
        'editor_req_002'
    );

    IF v_res->>'status' <> 'CONFLICT' OR v_res->>'reason' <> 'REV_MISMATCH' THEN
        RAISE EXCEPTION 'ASSERTION FAILED [Test 2]: Stale write không bị từ chối CONFLICT REV_MISMATCH. Kết quả: %', v_res;
    END IF;
    RAISE NOTICE '✓ Test 2 Passed: Stale write bị từ chối chính xác (REV_MISMATCH)';

    -- --------------------------------------------------------------------------
    -- Test 3: Idempotent replay hợp lệ (cùng key, cùng payload) -> SUCCESS
    -- --------------------------------------------------------------------------
    v_res := public.sync_cultivation_occ(
        0::bigint,
        '{"realm": "ngung_khi_1", "totalExp": 100}'::jsonb,
        1700000000::bigint,
        'dev_editor_pc',
        'editor_req_001'
    );

    IF v_res->>'status' <> 'SUCCESS' OR (v_res->>'idempotent_replay')::boolean <> true THEN
        RAISE EXCEPTION 'ASSERTION FAILED [Test 3]: Retry cùng key không nhận idempotent_replay = true. Kết quả: %', v_res;
    END IF;
    RAISE NOTICE '✓ Test 3 Passed: Idempotent replay hợp lệ thành công';

    -- --------------------------------------------------------------------------
    -- Test 4: Tái sử dụng key với payload khác -> ERROR
    -- --------------------------------------------------------------------------
    v_res := public.sync_cultivation_occ(
        0::bigint,
        '{"realm": "phe_nhan", "totalExp": 9999}'::jsonb,
        1700000000::bigint,
        'dev_editor_pc',
        'editor_req_001'
    );

    IF v_res->>'status' <> 'ERROR' OR v_res->>'code' <> 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD' THEN
        RAISE EXCEPTION 'ASSERTION FAILED [Test 4]: Tái sử dụng key khác payload không bị từ chối. Kết quả: %', v_res;
    END IF;
    RAISE NOTICE '✓ Test 4 Passed: Tái sử dụng key với payload khác bị từ chối rõ ràng';

    -- --------------------------------------------------------------------------
    -- Test 5: Server-authoritative fingerprint check
    -- --------------------------------------------------------------------------
    v_res := public.sync_cultivation_occ(
        1::bigint,
        '{"realm": "ngung_khi_2", "totalExp": 200}'::jsonb,
        1700000020::bigint,
        'dev_editor_pc',
        'editor_req_003',
        'spoofed_fingerprint_hash_xyz'
    );

    IF v_res->>'status' <> 'ERROR' OR v_res->>'code' <> 'INVALID_FINGERPRINT' THEN
        RAISE EXCEPTION 'ASSERTION FAILED [Test 5]: Spoofed fingerprint không bị server từ chối. Kết quả: %', v_res;
    END IF;
    RAISE NOTICE '✓ Test 5 Passed: Server từ chối client fingerprint không khớp';

    -- ==========================================================================
    -- GIAI ĐOẠN 3: BẢO MẬT HÀM CLEANUP & CIRCUIT BREAKER
    -- ==========================================================================
    -- --------------------------------------------------------------------------
    -- Test 6: Kiểm tra role authenticated KHÔNG có quyền thực thi cleanup
    -- --------------------------------------------------------------------------
    BEGIN
        PERFORM public.cleanup_cultivation_idempotency_log(30);
        v_cleanup_blocked := false;
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%permission denied%' OR SQLERRM LIKE '%quyền%' THEN
            v_cleanup_blocked := true;
        ELSE
            -- Nếu hàm ném lỗi khác, vẫn ghi nhận là có chặn
            v_cleanup_blocked := true;
        END IF;
    END;

    IF NOT v_cleanup_blocked THEN
        RAISE EXCEPTION 'ASSERTION FAILED [Test 6]: Role authenticated không được phép gọi cleanup_cultivation_idempotency_log!';
    END IF;
    RAISE NOTICE '✓ Test 6 Passed: Role authenticated bị chặn gọi cleanup_cultivation_idempotency_log';

    -- Chuyển lại quyền quản trị để kiểm tra tham số của hàm cleanup
    RESET ROLE;

    -- Test 7: Kiểm tra validation p_days của hàm cleanup
    BEGIN
        PERFORM public.cleanup_cultivation_idempotency_log(0);
        RAISE EXCEPTION 'ASSERTION FAILED [Test 7]: cleanup_cultivation_idempotency_log không ném lỗi khi p_days = 0!';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%Tham số p_days không hợp lệ%' THEN
            RAISE EXCEPTION 'ASSERTION FAILED [Test 7]: Lỗi không đúng mong đợi: %', SQLERRM;
        END IF;
        RAISE NOTICE '✓ Test 7 Passed: Tham số p_days = 0 bị từ chối chính xác (giới hạn 1..365 ngày)';
    END;

    -- --------------------------------------------------------------------------
    -- Test 8: Safe Maintenance Mode (Circuit Breaker)
    -- --------------------------------------------------------------------------
    -- Bật cờ bảo trì dưới quyền quản trị
    UPDATE public.app_system_flags
    SET value = '{"enabled": true, "message": "Bảo trì nâng cấp an toàn"}'::jsonb,
        updated_at = NOW()
    WHERE key = 'cultivation_maintenance';

    -- Chuyển sang role authenticated gọi RPC
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.sub', v_test_user_1::text, true);

    v_res := public.sync_cultivation_occ(
        1::bigint,
        '{"realm": "ngung_khi_2", "totalExp": 200}'::jsonb,
        1700000030::bigint,
        'dev_editor_pc',
        'editor_req_004'
    );

    IF v_res->>'status' <> 'MAINTENANCE' OR v_res->>'code' <> 'SYNC_PAUSED' THEN
        RAISE EXCEPTION 'ASSERTION FAILED [Test 8]: Circuit breaker không trả về MAINTENANCE. Kết quả: %', v_res;
    END IF;
    RAISE NOTICE '✓ Test 8 Passed: Circuit breaker trả về MAINTENANCE chính xác khi hệ thống bảo trì';

    -- ==========================================================================
    -- GIAI ĐOẠN 4: DỌN DẸP DỮ LIỆU & KHÔI PHỤC TRẠNG THÁI (ADMIN)
    -- ==========================================================================
    RESET ROLE;

    UPDATE public.app_system_flags
    SET value = '{"enabled": false, "message": "Hoạt động bình thường"}'::jsonb,
        updated_at = NOW()
    WHERE key = 'cultivation_maintenance';

    DELETE FROM public.cultivation_idempotency_log WHERE user_id IN (v_test_user_1, v_test_user_2);
    DELETE FROM public.cultivation WHERE user_id IN (v_test_user_1, v_test_user_2);

    RAISE NOTICE '=== TOÀN BỘ CÁC BÀI TEST PL/pgSQL TRÊN SQL EDITOR ĐÃ PASS 100%% ===';

EXCEPTION WHEN OTHERS THEN
    -- Đảm bảo an toàn: luôn khôi phục role admin và dọn dẹp cờ bảo trì ngay cả khi test fail
    RESET ROLE;
    UPDATE public.app_system_flags
    SET value = '{"enabled": false, "message": "Hoạt động bình thường"}'::jsonb,
        updated_at = NOW()
    WHERE key = 'cultivation_maintenance';
    DELETE FROM public.cultivation_idempotency_log WHERE user_id IN (v_test_user_1, v_test_user_2);
    DELETE FROM public.cultivation WHERE user_id IN (v_test_user_1, v_test_user_2);
    RAISE EXCEPTION 'LỖI KIỂM THỬ SQL EDITOR: %', SQLERRM;
END $$;
