-- ==============================================================================
-- SUPABASE POSTGRESQL MANUAL OPERATION: FAIL-CLOSED UNFREEZE & ENABLE OCC (BƯỚC 6)
-- File: supabase/operations/20261121_cultivation_occ_unfreeze_and_enable.sql
-- Áp dụng: CHẠY THỦ CÔNG SAU KHI FRONTEND MỚI ĐÃ ĐƯỢC TRIỂN KHAI VÀ XÁC MINH
--
-- CƠ CHẾ BẢO MẬT FAIL-CLOSED:
-- 1. Bọc trong một giao dịch (BEGIN ... COMMIT).
-- 2. Kiểm tra bắt buộc sự tồn tại của hàm RPC sync_cultivation_occ.
-- 3. Kiểm tra quyền hiệu lực (kể cả quyền kế thừa từ PUBLIC/roles):
--    - authenticated: can_insert=false, can_update=false, can_delete=false, can_truncate=false, can_trigger=false, can_select=true, can_rpc=true
--    - anon: không có bất kỳ quyền ghi nào (insert=false, update=false, delete=false, truncate=false, trigger=false)
-- 4. NẾU BẤT KỲ ĐIỀU KIỆN NÀO THẤT BẠI: RAISE EXCEPTION và ROLLBACK ngay lập tức,
--    GIỮ NGUYÊN maintenance = true (Fail-Closed).
-- 5. CHỈ KHI 100% PRECONDITIONS THỎA MÃN: Mới cập nhật cultivation_maintenance = false.
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    v_auth_can_insert boolean;
    v_auth_can_update boolean;
    v_auth_can_delete boolean;
    v_auth_can_truncate boolean;
    v_auth_can_trigger boolean;
    v_auth_can_select boolean;
    v_auth_can_rpc boolean;
    v_anon_can_write boolean;
BEGIN
    -- 1. Precondition 1: Hàm RPC sync_cultivation_occ BẮT BUỘC phải tồn tại
    IF to_regprocedure('public.sync_cultivation_occ(bigint, jsonb, bigint, text, text, text)') IS NULL THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Hàm RPC public.sync_cultivation_occ(bigint, jsonb, bigint, text, text, text) CHƯA TỒN TẠI! Giữ nguyên bảo trì.'
        USING ERRCODE = '55000';
    END IF;

    -- 2. Precondition 2: Kiểm tra quyền hiệu lực (effective privileges) của role authenticated
    SELECT 
        has_table_privilege('authenticated', 'public.cultivation', 'INSERT'),
        has_table_privilege('authenticated', 'public.cultivation', 'UPDATE'),
        has_table_privilege('authenticated', 'public.cultivation', 'DELETE'),
        has_table_privilege('authenticated', 'public.cultivation', 'TRUNCATE'),
        has_table_privilege('authenticated', 'public.cultivation', 'TRIGGER'),
        has_table_privilege('authenticated', 'public.cultivation', 'SELECT'),
        has_function_privilege('authenticated', 'public.sync_cultivation_occ(bigint, jsonb, bigint, text, text, text)', 'EXECUTE')
    INTO 
        v_auth_can_insert, v_auth_can_update, v_auth_can_delete, v_auth_can_truncate, v_auth_can_trigger, v_auth_can_select, v_auth_can_rpc;

    IF v_auth_can_insert OR v_auth_can_update OR v_auth_can_delete OR v_auth_can_truncate OR v_auth_can_trigger THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Role "authenticated" vẫn còn quyền ghi trực tiếp trên public.cultivation (insert=%, update=%, delete=%, truncate=%, trigger=%)! Giữ nguyên bảo trì.'
        , v_auth_can_insert, v_auth_can_update, v_auth_can_delete, v_auth_can_truncate, v_auth_can_trigger
        USING ERRCODE = '55000';
    END IF;

    IF NOT v_auth_can_select THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Role "authenticated" THIẾU quyền SELECT trên public.cultivation! Giữ nguyên bảo trì.'
        USING ERRCODE = '55000';
    END IF;

    IF NOT v_auth_can_rpc THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Role "authenticated" THIẾU quyền EXECUTE RPC sync_cultivation_occ! Giữ nguyên bảo trì.'
        USING ERRCODE = '55000';
    END IF;

    -- 3. Precondition 3: Kiểm tra role anon không có bất kỳ quyền ghi/truncate/trigger nào
    SELECT (
        has_table_privilege('anon', 'public.cultivation', 'INSERT') OR
        has_table_privilege('anon', 'public.cultivation', 'UPDATE') OR
        has_table_privilege('anon', 'public.cultivation', 'DELETE') OR
        has_table_privilege('anon', 'public.cultivation', 'TRUNCATE') OR
        has_table_privilege('anon', 'public.cultivation', 'TRIGGER')
    ) INTO v_anon_can_write;

    IF v_anon_can_write THEN
        RAISE EXCEPTION 'PRECONDITION_FAILED: Role "anon" vẫn còn quyền ghi trực tiếp trên public.cultivation! Giữ nguyên bảo trì.'
        USING ERRCODE = '55000';
    END IF;

    -- 4. KHI 100% PRECONDITIONS ĐỀU THỎA MÃN: Tắt cờ bảo trì an toàn
    UPDATE public.app_system_flags
    SET value = '{"enabled": false, "message": "Hệ thống hoạt động bình thường"}'::jsonb,
        updated_at = NOW()
    WHERE key = 'cultivation_maintenance';

    RAISE NOTICE 'UNFREEZE_SUCCESS: Toàn bộ điều kiện an toàn đã thỏa mãn. Cờ bảo trì đã tắt, mở đồng bộ RPC OCC an toàn 100%%.';
END $$;

COMMIT;

-- Xác nhận trạng thái cuối cùng
SELECT key, value, updated_at 
FROM public.app_system_flags 
WHERE key = 'cultivation_maintenance';
