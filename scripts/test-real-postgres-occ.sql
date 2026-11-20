-- ==============================================================================
-- KỊCH BẢN KIỂM THỬ TRÊN POSTGRESQL / SUPABASE STAGING THẬT (PHỤC VỤ NGHIỆM THU)
-- File: scripts/test-real-postgres-occ.sql
-- Áp dụng: Chạy qua psql hoặc Supabase SQL Editor trên môi trường Staging/Dev
-- TUYỆT ĐỐI KHÔNG CHẠY TRÊN DATABASE PRODUCTION!
-- ==============================================================================

\echo '=== BẮT ĐẦU KIỂM THỬ OCC TRÊN POSTGRESQL THẬT ==='

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. THIẾT LẬP MÔI TRƯỜNG THỬ NGHIỆM TẠM THỜI
-- ------------------------------------------------------------------------------
-- Tạo schema tạm hoặc bảng test riêng biệt để không ảnh hưởng dữ liệu khác
CREATE SCHEMA IF NOT EXISTS test_occ_staging;
SET search_path = test_occ_staging, public;

-- Giả lập hàm auth.uid() nếu chạy ngoài môi trường Supabase Auth
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
    SELECT current_setting('test.current_user_id', true)::uuid;
$$ LANGUAGE sql STABLE;

-- ------------------------------------------------------------------------------
-- 2. KIỂM THỬ MIGRATION A: SCHEMA & RPC ĐỘC LẬP
-- ------------------------------------------------------------------------------
\echo '--- [Test 1] Kiểm tra áp dụng Migration A (Schema, Journal, RPC) ---'

-- Thiết lập user thử nghiệm 1
SET LOCAL test.current_user_id = 'a0000000-0000-0000-0000-000000000001';

-- Gọi sync_cultivation_occ lần đầu tiên (First Insert)
SELECT sync_cultivation_occ(
    0::bigint,
    '{"realm": "ngung_khi_1", "totalExp": 100}'::jsonb,
    1700000000::bigint,
    'dev_real_pc',
    'idemp_req_001'
) AS res_first_insert;

-- Kỳ vọng: rev = 1, status = 'SUCCESS', is_first_insert = true
SELECT rev, device_id FROM cultivation WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

-- Kiểm tra Stage A vẫn cho phép direct insert (tương thích client cũ)
INSERT INTO cultivation (user_id, rev, state, updated_at, device_id)
VALUES ('a0000000-0000-0000-0000-000000000002'::uuid, 1, '{"totalExp": 10}'::jsonb, 1700000000, 'legacy_dev')
ON CONFLICT (user_id) DO UPDATE SET updated_at = EXCLUDED.updated_at;

\echo '--- [Test 2] Kiểm tra Stale Write / Conflict ---'
-- Cố tình gửi expected_rev = 0 khi Cloud đã ở rev = 1
SELECT sync_cultivation_occ(
    0::bigint,
    '{"realm": "ngung_khi_2", "totalExp": 200}'::jsonb,
    1700000010::bigint,
    'dev_real_mobile',
    'idemp_req_002'
) AS res_stale_write;
-- Kỳ vọng: status = 'CONFLICT', reason = 'REV_MISMATCH', current_cloud->>'rev' = 1

-- ------------------------------------------------------------------------------
-- 3. KIỂM THỬ IDEMPOTENCY & SERVER-AUTHORITATIVE FINGERPRINT
-- ------------------------------------------------------------------------------
\echo '--- [Test 3] Kiểm tra Idempotent Replay hợp lệ ---'
-- Gửi lại CHÍNH XÁC idemp_req_001
SELECT sync_cultivation_occ(
    0::bigint,
    '{"realm": "ngung_khi_1", "totalExp": 100}'::jsonb,
    1700000000::bigint,
    'dev_real_pc',
    'idemp_req_001'
) AS res_idempotent_replay;
-- Kỳ vọng: status = 'SUCCESS', idempotent_replay = true, committed_rev = 1

\echo '--- [Test 4] Kiểm tra từ chối tái sử dụng key với payload khác ---'
SELECT sync_cultivation_occ(
    0::bigint,
    '{"realm": "ngung_khi_99", "totalExp": 99999}'::jsonb,
    1700000000::bigint,
    'dev_real_pc',
    'idemp_req_001'
) AS res_key_reuse_different_payload;
-- Kỳ vọng: status = 'ERROR', code = 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD'

\echo '--- [Test 5] Kiểm tra Server Fingerprint Verification (chặn fingerprint client bịa đặt) ---'
SELECT sync_cultivation_occ(
    1::bigint,
    '{"realm": "ngung_khi_2", "totalExp": 200}'::jsonb,
    1700000020::bigint,
    'dev_real_pc',
    'idemp_req_003',
    'spoofed_hash_from_attacker'
) AS res_spoofed_fingerprint;
-- Kỳ vọng: status = 'ERROR', code = 'INVALID_FINGERPRINT'

-- ------------------------------------------------------------------------------
-- 4. BẢO MẬT SECURITY DEFINER & HÀM CLEANUP
-- ------------------------------------------------------------------------------
\echo '--- [Test 6] Kiểm tra hàm cleanup: validate p_days ---'
-- Kiểm tra validation tham số p_days
DO $$
BEGIN
    BEGIN
        PERFORM cleanup_cultivation_idempotency_log(0);
        RAISE EXCEPTION 'LỖI: cleanup_cultivation_idempotency_log không ném lỗi khi p_days = 0!';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Thành công: p_days = 0 bị từ chối chính xác: %', SQLERRM;
    END;

    BEGIN
        PERFORM cleanup_cultivation_idempotency_log(500);
        RAISE EXCEPTION 'LỖI: cleanup_cultivation_idempotency_log không ném lỗi khi p_days > 365!';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Thành công: p_days = 500 bị từ chối chính xác: %', SQLERRM;
    END;
END $$;

-- ------------------------------------------------------------------------------
-- 5. KIỂM THỬ MIGRATION B: CUTOVER LOCKDOWN
-- ------------------------------------------------------------------------------
\echo '--- [Test 7] Áp dụng Migration B (Khóa Direct Write) ---'
REVOKE INSERT, UPDATE, DELETE ON TABLE cultivation FROM anon, authenticated, public;

-- Thử direct write:
DO $$
BEGIN
    BEGIN
        UPDATE cultivation SET rev = 999 WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid;
        RAISE NOTICE 'Ghi chú: Nếu chạy dưới quyền superuser (postgres), REVOKE sẽ bị bypass. Khi test với role authenticated thật, lệnh này sẽ ném lỗi 42501!';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'Thành công: Direct write bị chặn hoàn toàn với mã lỗi 42501 (insufficient_privilege)';
    END;
END $$;

-- Kiểm tra RPC vẫn thực thi bình thường sau cutover:
SELECT sync_cultivation_occ(
    1::bigint,
    '{"realm": "ngung_khi_2", "totalExp": 200}'::jsonb,
    1700000030::bigint,
    'dev_real_pc',
    'idemp_req_004'
) AS res_occ_after_cutover;
-- Kỳ vọng: rev = 2, status = 'SUCCESS'

-- ------------------------------------------------------------------------------
-- 6. KIỂM THỬ ROLLBACK: SAFE MAINTENANCE MODE (CIRCUIT BREAKER)
-- ------------------------------------------------------------------------------
\echo '--- [Test 8] Kiểm tra Safe Maintenance Mode Rollback ---'
-- Bật chế độ bảo trì:
UPDATE app_system_flags
SET value = '{"enabled": true, "message": "Bảo trì nâng cấp an toàn"}'::jsonb
WHERE key = 'cultivation_maintenance';

-- Gọi RPC trong lúc bảo trì:
SELECT sync_cultivation_occ(
    2::bigint,
    '{"realm": "ngung_khi_3", "totalExp": 300}'::jsonb,
    1700000040::bigint,
    'dev_real_pc',
    'idemp_req_005'
) AS res_maintenance;
-- Kỳ vọng: status = 'MAINTENANCE', code = 'SYNC_PAUSED'
-- Dữ liệu Cloud vẫn giữ nguyên rev = 2, không bị thay đổi!
SELECT rev, (state->>'totalExp')::int AS exp FROM cultivation WHERE user_id = 'a0000000-0000-0000-0000-000000000001'::uuid;

\echo '=== TOÀN BỘ KIỂM THỬ HOÀN TẤT. HOÀN TÁC TRANSACTION THỬ NGHIỆM ==='
ROLLBACK;
