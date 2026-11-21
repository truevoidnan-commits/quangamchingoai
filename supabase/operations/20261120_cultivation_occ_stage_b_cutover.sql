-- ==============================================================================
-- SUPABASE POSTGRESQL MANUAL OPERATION: OCC CUTOVER LOCKDOWN (STAGE B)
-- File: supabase/operations/20261120_cultivation_occ_stage_b_cutover.sql
-- Áp dụng: CHẠY THỦ CÔNG KHI CÓ PHÊ DUYỆT (BƯỚC 5 TRONG RUNBOOK)
--
-- Mục tiêu:
-- 1. Thu hồi triệt để ALL PRIVILEGES (INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES) từ anon, authenticated, public
-- 2. Chỉ cấp duy nhất quyền SELECT cho authenticated để đọc dữ liệu
-- 3. Đảm bảo quyền EXECUTE trên RPC sync_cultivation_occ cho authenticated
-- 4. Xác nhận quyền hiệu lực (effective privileges) bao gồm cả quyền kế thừa
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- BƯỚC 1: XÁC NHẬN QUYỀN TRƯỚC KHI CUTOVER (PRE-CHECK EFFECTIVE PRIVILEGES)
-- ------------------------------------------------------------------------------
SELECT 
    has_table_privilege('authenticated', 'public.cultivation', 'INSERT') AS pre_can_insert,
    has_table_privilege('authenticated', 'public.cultivation', 'UPDATE') AS pre_can_update,
    has_table_privilege('authenticated', 'public.cultivation', 'DELETE') AS pre_can_delete,
    has_table_privilege('authenticated', 'public.cultivation', 'TRUNCATE') AS pre_can_truncate,
    has_table_privilege('authenticated', 'public.cultivation', 'TRIGGER') AS pre_can_trigger,
    has_table_privilege('authenticated', 'public.cultivation', 'SELECT') AS pre_can_select,
    has_function_privilege('authenticated', 'public.sync_cultivation_occ(bigint, jsonb, bigint, text, text, text)', 'EXECUTE') AS pre_can_rpc;

-- ------------------------------------------------------------------------------
-- BƯỚC 2: THỰC THI CUTOVER - THU HỒI TOÀN BỘ QUYỀN GHI, TRUNCATE, TRIGGER
-- ------------------------------------------------------------------------------
BEGIN;

-- Thu hồi toàn bộ quyền dư thừa từ anon, authenticated và public (xóa cả quyền kế thừa)
REVOKE ALL PRIVILEGES ON TABLE public.cultivation FROM anon, authenticated, public;

-- Cấp lại duy nhất quyền SELECT cho authenticated
GRANT SELECT ON TABLE public.cultivation TO authenticated;

-- Đảm bảo quyền EXECUTE RPC sync_cultivation_occ mở cho authenticated
GRANT EXECUTE ON FUNCTION public.sync_cultivation_occ(bigint, jsonb, bigint, text, text, text) TO authenticated;

COMMIT;

-- Báo PostgREST cập nhật cache
NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------------------------
-- BƯỚC 3: XÁC NHẬN QUYỀN HIỆU LỰC SAU CUTOVER (POST-CHECK EFFECTIVE PRIVILEGES)
-- Kết quả bắt buộc sau cutover:
-- post_can_insert   = false
-- post_can_update   = false
-- post_can_delete   = false
-- post_can_truncate = false
-- post_can_trigger  = false
-- post_can_select   = true
-- post_can_rpc      = true
-- ------------------------------------------------------------------------------
SELECT 
    has_table_privilege('authenticated', 'public.cultivation', 'INSERT') AS post_can_insert,
    has_table_privilege('authenticated', 'public.cultivation', 'UPDATE') AS post_can_update,
    has_table_privilege('authenticated', 'public.cultivation', 'DELETE') AS post_can_delete,
    has_table_privilege('authenticated', 'public.cultivation', 'TRUNCATE') AS post_can_truncate,
    has_table_privilege('authenticated', 'public.cultivation', 'TRIGGER') AS post_can_trigger,
    has_table_privilege('authenticated', 'public.cultivation', 'SELECT') AS post_can_select,
    has_function_privilege('authenticated', 'public.sync_cultivation_occ(bigint, jsonb, bigint, text, text, text)', 'EXECUTE') AS post_can_rpc;

-- ------------------------------------------------------------------------------
-- HƯỚNG DẪN XỬ LÝ SỰ CỐ KHẨN CẤP (SAFE MAINTENANCE MODE & INCIDENT RESPONSE):
-- TUYỆT ĐỐI KHÔNG cấp lại quyền direct write (INSERT, UPDATE) cho authenticated.
-- TUYỆT ĐỐI KHÔNG DROP hàm RPC sync_cultivation_occ.
--
-- Khi phát hiện sự cố bất thường sau Cutover:
-- BƯỚC 1: Kích hoạt Safe Maintenance Mode để dừng toàn bộ ghi tu vi (Circuit Breaker):
--   UPDATE public.app_system_flags
--   SET value = '{"enabled": true, "message": "Hệ thống tạm dừng đồng bộ tu vi để xử lý sự cố"}'::jsonb,
--       updated_at = NOW()
--   WHERE key = 'cultivation_maintenance';
--
-- BƯỚC 2: Sau khi xử lý và kiểm tra dữ liệu, chạy script Unfreeze:
--   \i supabase/operations/20261121_cultivation_occ_unfreeze_and_enable.sql
-- ------------------------------------------------------------------------------
