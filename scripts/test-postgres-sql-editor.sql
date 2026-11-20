-- ==============================================================================
-- KỊCH BẢN KIỂM THỬ OCC DÀNH RIÊNG CHO SUPABASE SQL EDITOR (STAGING / ISOLATED)
-- File: scripts/test-postgres-sql-editor.sql
-- Áp dụng: Paste và chạy trực tiếp trên Supabase SQL Editor môi trường Staging/Dev
-- TUYỆT ĐỐI KHÔNG CHẠY TRÊN DATABASE PRODUCTION!
-- ==============================================================================

DO $$
DECLARE
    v_test_user_1 UUID := 'a0000000-0000-0000-0000-000000000001'::uuid;
    v_test_user_2 UUID := 'a0000000-0000-0000-0000-000000000002'::uuid;
    v_res JSONB;
    v_row RECORD;
BEGIN
    RAISE NOTICE '=== BẮT ĐẦU KIỂM THỬ OCC TRÊN SUPABASE SQL EDITOR ===';

    -- --------------------------------------------------------------------------
    -- 1. GIẢ LẬP CONTEXT SUPABASE AUTH ĐÚNG CHUẨN (KHÔNG SỬA HÀM auth.uid())
    -- --------------------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', v_test_user_1::text, true);
    PERFORM set_config('role', 'authenticated', true);

    -- Dọn dẹp dữ liệu thử nghiệm của user 1 nếu đã tồn tại từ trước
    DELETE FROM public.cultivation_idempotency_log WHERE user_id IN (v_test_user_1, v_test_user_2);
    DELETE FROM public.cultivation WHERE user_id IN (v_test_user_1, v_test_user_2);

    -- --------------------------------------------------------------------------
    -- 2. KIỂM THỬ FIRST INSERT (rev = 0 -> rev = 1)
    -- --------------------------------------------------------------------------
    v_res := public.sync_cultivation_occ(
        0::bigint,
        '{"realm": "ngung_khi_1", "totalExp": 100}'::jsonb,
        1700000000::bigint,
        'dev_editor_pc',
        'editor_req_001'
    );

    IF v_res->>'status' <> 'SUCCESS' OR (v_res->>'rev')::bigint <> 1 THEN
        RAISE EXCEPTION 'TEST 1 FAILED: First insert không trả về status SUCCESS rev 1. Kết quả: %', v_res;
    END IF;
    RAISE NOTICE 'Test 1 Passed: First insert thành công rev = 1';

    -- --------------------------------------------------------------------------
    -- 3. KIỂM THỬ STALE WRITE / CONFLICT REJECTION
    -- --------------------------------------------------------------------------
    v_res := public.sync_cultivation_occ(
        0::bigint, -- Cloud đã lên rev 1 nhưng gửi expected_rev = 0
        '{"realm": "ngung_khi_2", "totalExp": 200}'::jsonb,
        1700000010::bigint,
        'dev_editor_mobile',
        'editor_req_002'
    );

    IF v_res->>'status' <> 'CONFLICT' OR v_res->>'reason' <> 'REV_MISMATCH' THEN
        RAISE EXCEPTION 'TEST 2 FAILED: Stale write không bị từ chối CONFLICT. Kết quả: %', v_res;
    END IF;
    RAISE NOTICE 'Test 2 Passed: Stale write bị từ chối chính xác (REV_MISMATCH)';

    -- --------------------------------------------------------------------------
    -- 4. KIỂM THỬ IDEMPOTENT REPLAY HỢP LỆ
    -- --------------------------------------------------------------------------
    v_res := public.sync_cultivation_occ(
        0::bigint,
        '{"realm": "ngung_khi_1", "totalExp": 100}'::jsonb,
        1700000000::bigint,
        'dev_editor_pc',
        'editor_req_001' -- Cùng key và cùng payload với Test 1
    );

    IF v_res->>'status' <> 'SUCCESS' OR (v_res->>'idempotent_replay')::boolean <> true THEN
        RAISE EXCEPTION 'TEST 3 FAILED: Retry cùng key không nhận idempotent_replay = true. Kết quả: %', v_res;
    END IF;
    RAISE NOTICE 'Test 3 Passed: Idempotent replay hợp lệ thành công';

    -- --------------------------------------------------------------------------
    -- 5. KIỂM THỬ TÁI SỬ DỤNG KEY VỚI PAYLOAD KHÁC
    -- --------------------------------------------------------------------------
    v_res := public.sync_cultivation_occ(
        0::bigint,
        '{"realm": "phe_nhan", "totalExp": 9999}'::jsonb, -- Payload khác
        1700000000::bigint,
        'dev_editor_pc',
        'editor_req_001'
    );

    IF v_res->>'status' <> 'ERROR' OR v_res->>'code' <> 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD' THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Tái sử dụng key khác payload không bị từ chối rõ ràng. Kết quả: %', v_res;
    END IF;
    RAISE NOTICE 'Test 4 Passed: Tái sử dụng key với payload khác bị từ chối rõ ràng';

    -- --------------------------------------------------------------------------
    -- 6. KIỂM THỬ SERVER-AUTHORITATIVE FINGERPRINT
    -- --------------------------------------------------------------------------
    v_res := public.sync_cultivation_occ(
        1::bigint,
        '{"realm": "ngung_khi_2", "totalExp": 200}'::jsonb,
        1700000020::bigint,
        'dev_editor_pc',
        'editor_req_003',
        'spoofed_fingerprint_hash_xyz' -- Fingerprint bịa đặt
    );

    IF v_res->>'status' <> 'ERROR' OR v_res->>'code' <> 'INVALID_FINGERPRINT' THEN
        RAISE EXCEPTION 'TEST 5 FAILED: Spoofed fingerprint không bị server từ chối. Kết quả: %', v_res;
    END IF;
    RAISE NOTICE 'Test 5 Passed: Server từ chối client fingerprint không khớp';

    -- --------------------------------------------------------------------------
    -- 7. KIỂM THỬ BẢO MẬT HÀM CLEANUP (SECURITY DEFINER)
    -- --------------------------------------------------------------------------
    -- Role 'authenticated' gọi cleanup -> Phải bị từ chối quyền (nếu gọi trực tiếp qua SQL Editor)
    -- Kiểm tra validation p_days:
    BEGIN
        PERFORM public.cleanup_cultivation_idempotency_log(0);
        RAISE EXCEPTION 'TEST 6 FAILED: cleanup_cultivation_idempotency_log không ném lỗi khi p_days = 0!';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM NOT LIKE '%Tham số p_days không hợp lệ%' THEN
            RAISE EXCEPTION 'TEST 6 FAILED: Lỗi không đúng mong đợi: %', SQLERRM;
        END IF;
        RAISE NOTICE 'Test 6 Passed: Tham số p_days = 0 bị từ chối chính xác';
    END;

    -- --------------------------------------------------------------------------
    -- 8. KIỂM THỬ SAFE MAINTENANCE MODE ROLLBACK
    -- --------------------------------------------------------------------------
    UPDATE public.app_system_flags
    SET value = '{"enabled": true, "message": "Bảo trì nâng cấp an toàn"}'::jsonb,
        updated_at = NOW()
    WHERE key = 'cultivation_maintenance';

    v_res := public.sync_cultivation_occ(
        1::bigint,
        '{"realm": "ngung_khi_2", "totalExp": 200}'::jsonb,
        1700000030::bigint,
        'dev_editor_pc',
        'editor_req_004'
    );

    IF v_res->>'status' <> 'MAINTENANCE' OR v_res->>'code' <> 'SYNC_PAUSED' THEN
        RAISE EXCEPTION 'TEST 7 FAILED: Circuit breaker không trả về MAINTENANCE. Kết quả: %', v_res;
    END IF;
    RAISE NOTICE 'Test 7 Passed: Safe maintenance mode kích hoạt và bảo vệ an toàn';

    -- Khôi phục cờ bảo trì về tắt
    UPDATE public.app_system_flags
    SET value = '{"enabled": false, "message": "Hoạt động bình thường"}'::jsonb,
        updated_at = NOW()
    WHERE key = 'cultivation_maintenance';

    -- --------------------------------------------------------------------------
    -- DỌN DẸP DỮ LIỆU TEST
    -- --------------------------------------------------------------------------
    DELETE FROM public.cultivation_idempotency_log WHERE user_id IN (v_test_user_1, v_test_user_2);
    DELETE FROM public.cultivation WHERE user_id IN (v_test_user_1, v_test_user_2);

    RAISE NOTICE '=== TOÀN BỘ CÁC BÀI TEST PL/pgSQL TRÊN SQL EDITOR ĐÃ PASS 100%% ===';
END $$;
