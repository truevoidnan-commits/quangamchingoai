-- ==============================================================================
-- SUPABASE POSTGRESQL MANUAL OPERATION: UNFREEZE & ENABLE OCC (BƯỚC 6)
-- File: supabase/operations/20261121_cultivation_occ_unfreeze_and_enable.sql
-- Áp dụng: CHẠY THỦ CÔNG SAU KHI FRONTEND MỚI ĐÃ ĐƯỢC TRIỂN KHAI VÀ XÁC MINH
--
-- Mục tiêu:
-- 1. Tắt cờ bảo trì cultivation_maintenance trong app_system_flags
-- 2. Cho phép RPC sync_cultivation_occ xử lý đồng bộ tu vi bình thường
-- 3. Quyền direct write VẪN TIẾP TỤC BỊ KHÓA (chỉ cho phép SELECT và EXECUTE RPC)
-- ==============================================================================

-- 1. Xác nhận quyền DB trước khi unfreeze (Direct write BẮT BUỘC false)
SELECT 
    has_table_privilege('authenticated', 'public.cultivation', 'INSERT') AS can_insert,
    has_table_privilege('authenticated', 'public.cultivation', 'UPDATE') AS can_update,
    has_table_privilege('authenticated', 'public.cultivation', 'SELECT') AS can_select,
    has_function_privilege('authenticated', 'public.sync_cultivation_occ(bigint, jsonb, bigint, text, text, text)', 'EXECUTE') AS can_rpc;

-- 2. Tắt cờ bảo trì để mở lại đồng bộ RPC
UPDATE public.app_system_flags
SET value = '{"enabled": false, "message": "Hệ thống hoạt động bình thường"}'::jsonb,
    updated_at = NOW()
WHERE key = 'cultivation_maintenance';

-- 3. Xác nhận trạng thái cờ bảo trì sau khi cập nhật
SELECT key, value, updated_at 
FROM public.app_system_flags 
WHERE key = 'cultivation_maintenance';
