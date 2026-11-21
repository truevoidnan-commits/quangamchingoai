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
-- HƯỚNG DẪN XỬ LÝ SỰ CỐ KHẨN CẤP (SAFE MAINTENANCE MODE & INCIDENT RESPONSE):
-- TUYỆT ĐỐI KHÔNG cấp lại quyền direct write (INSERT, UPDATE) cho authenticated.
-- TUYỆT ĐỐI KHÔNG DROP hàm RPC sync_cultivation_occ.
-- TUYỆT ĐỐI KHÔNG quay lại cơ chế blind upsert không an toàn.
--
-- Khi phát hiện sự cố bất thường sau Cutover:
-- BƯỚC 1: Kích hoạt Safe Maintenance Mode để dừng toàn bộ ghi tu vi (Circuit Breaker):
--   INSERT INTO public.app_system_flags (key, value, updated_at)
--   VALUES ('cultivation_maintenance', '{"enabled": true, "message": "Hệ thống tạm dừng đồng bộ tu vi để xử lý sự cố"}'::jsonb, NOW())
--   ON CONFLICT (key) DO UPDATE
--   SET value = '{"enabled": true, "message": "Hệ thống tạm dừng đồng bộ tu vi để xử lý sự cố"}'::jsonb,
--       updated_at = NOW();
--
--   LƯU Ý AN TOÀN:
--   - Khi bật maintenance, direct write VẪN BỊ TỪ CHỐI (không có quyền INSERT, UPDATE).
--   - Hàm RPC sync_cultivation_occ sẽ trả về {"status": "MAINTENANCE", "code": "SYNC_PAUSED"}.
--   - Client frontend giữ nguyên dữ liệu local, hiển thị cảnh báo nhẹ, không mất tu vi.
--
-- BƯỚC 2: Thực hiện thủ tục đối chiếu và xác minh dữ liệu local và Cloud:
--   1. Truy vấn log lỗi và nhật ký idempotency gần nhất:
--      SELECT * FROM public.cultivation_idempotency_log ORDER BY created_at DESC LIMIT 20;
--   2. Kiểm tra tính toàn vẹn của bảng cultivation:
--      SELECT user_id, rev, updated_at, device_id FROM public.cultivation ORDER BY updated_at DESC LIMIT 20;
--   3. Đối chiếu snapshot local và Cloud trên các thiết bị client mẫu để đảm bảo không bị phân kỳ.
--
-- BƯỚC 3: Sau khi sự cố được xử lý và dữ liệu được xác minh toàn vẹn, mở lại đồng bộ:
--   UPDATE public.app_system_flags
--   SET value = '{"enabled": false, "message": "Hoạt động bình thường"}'::jsonb,
--       updated_at = NOW()
--   WHERE key = 'cultivation_maintenance';
-- ------------------------------------------------------------------------------
