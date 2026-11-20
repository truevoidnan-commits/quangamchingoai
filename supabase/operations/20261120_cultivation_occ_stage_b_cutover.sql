-- ==============================================================================
-- SUPABASE POSTGRESQL MANUAL OPERATION: OCC CUTOVER LOCKDOWN (STAGE B)
-- Thư mục: supabase/operations/20261120_cultivation_occ_stage_b_cutover.sql
-- Áp dụng: CHẠY THỦ CÔNG KHI CÓ PHÊ DUYỆT (TUYỆT ĐỐI KHÔNG CHẠY TỰ ĐỘNG QUA MIGRATION)
--
-- Mục tiêu:
-- 1. Thu hồi quyền direct write (INSERT, UPDATE, DELETE) trên bảng cultivation từ client
-- 2. Đảm bảo mọi đường ghi bắt buộc phải đi qua RPC sync_cultivation_occ (OCC)
-- 3. Ngăn chặn triệt để client cũ ghi đè dữ liệu Cloud bằng REST upsert
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- BƯỚC 1: XÁC NHẬN QUYỀN TRƯỚC KHI CUTOVER (PRE-CHECK PRIVILEGES)
-- Kết quả mong đợi trước cutover: can_insert = true, can_update = true
-- ------------------------------------------------------------------------------
SELECT 
    has_table_privilege('authenticated', 'public.cultivation', 'INSERT') AS pre_can_insert,
    has_table_privilege('authenticated', 'public.cultivation', 'UPDATE') AS pre_can_update,
    has_table_privilege('authenticated', 'public.cultivation', 'SELECT') AS pre_can_select,
    has_function_privilege('authenticated', 'public.sync_cultivation_occ(bigint, jsonb, bigint, text, text, text)', 'EXECUTE') AS pre_can_rpc;

-- ------------------------------------------------------------------------------
-- BƯỚC 2: THỰC THI CUTOVER - THU HỒI TOÀN BỘ QUYỀN GHI TRỰC TIẾP
-- ------------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON TABLE public.cultivation FROM anon, authenticated, public;

-- Đảm bảo quyền SELECT vẫn giữ cho authenticated để đọc dữ liệu qua RLS
GRANT SELECT ON TABLE public.cultivation TO authenticated;

-- Đảm bảo quyền EXECUTE RPC vẫn mở cho authenticated
GRANT EXECUTE ON FUNCTION public.sync_cultivation_occ(bigint, jsonb, bigint, text, text, text) TO authenticated;

-- ------------------------------------------------------------------------------
-- BƯỚC 3: XÁC NHẬN QUYỀN SAU KHI CUTOVER (POST-CHECK PRIVILEGES)
-- Kết quả bắt buộc sau cutover:
-- post_can_insert = false
-- post_can_update = false
-- post_can_select = true
-- post_can_rpc    = true
-- ------------------------------------------------------------------------------
SELECT 
    has_table_privilege('authenticated', 'public.cultivation', 'INSERT') AS post_can_insert,
    has_table_privilege('authenticated', 'public.cultivation', 'UPDATE') AS post_can_update,
    has_table_privilege('authenticated', 'public.cultivation', 'SELECT') AS post_can_select,
    has_function_privilege('authenticated', 'public.sync_cultivation_occ(bigint, jsonb, bigint, text, text, text)', 'EXECUTE') AS post_can_rpc;

-- ------------------------------------------------------------------------------
-- HƯỚNG DẪN ROLLBACK KHẨN CẤP (EMERGENCY ROLLBACK):
-- Nếu cần tạm thời cho phép client cũ tiếp tục ghi trực tiếp trong lúc xử lý sự cố:
--   GRANT INSERT, UPDATE ON TABLE public.cultivation TO authenticated;
-- Lưu ý: Không cần DROP các bảng hay RPC của Stage A khi rollback Stage B.
-- ------------------------------------------------------------------------------
