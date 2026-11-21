-- ==============================================================================
-- SUPABASE POSTGRESQL MANUAL OPERATION: ATOMIC WRITE FREEZE (BƯỚC 3)
-- File: supabase/operations/20261121_cultivation_occ_atomic_write_freeze.sql
-- Áp dụng: CHẠY THỦ CÔNG TRƯỚC KHI TRIỂN KHAI FRONTEND MỚI (CỬA SỔ FREEZE 5-15 PHÚT)
--
-- Mục tiêu:
-- 1. Khóa an toàn ACCESS EXCLUSIVE với lock_timeout = 2s chống nghẽn DB
-- 2. Đợi toàn bộ in-flight transactions kết thúc
-- 3. Thu hồi quyền direct write (INSERT, UPDATE, DELETE) từ anon, authenticated, public
-- 4. Tạo bảng app_system_flags (nếu chưa có) và BẬT cờ cultivation_maintenance = true
-- 5. Báo hiệu PostgREST reload schema cache
-- ==============================================================================

BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '5s';

-- 1. Khóa bảng để đợi toàn bộ in-flight transactions kết thúc
LOCK TABLE public.cultivation IN ACCESS EXCLUSIVE MODE;

-- 2. Thu hồi quyền direct write ngay trong transaction
REVOKE INSERT, UPDATE, DELETE ON TABLE public.cultivation FROM anon, authenticated, public;
GRANT SELECT ON TABLE public.cultivation TO authenticated;

-- 3. Tạo bảng cờ bảo trì hệ thống (nếu chưa có) và BẬT bảo trì
CREATE TABLE IF NOT EXISTS public.app_system_flags (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.app_system_flags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_system_flags FROM anon, authenticated, public;
GRANT SELECT ON TABLE public.app_system_flags TO authenticated;

INSERT INTO public.app_system_flags (key, value, updated_at)
VALUES ('cultivation_maintenance', '{"enabled": true, "message": "Hệ thống đang bảo trì nâng cấp đồng bộ tu vi an toàn."}'::jsonb, NOW())
ON CONFLICT (key) DO UPDATE
SET value = '{"enabled": true, "message": "Hệ thống đang bảo trì nâng cấp đồng bộ tu vi an toàn."}'::jsonb, updated_at = NOW();

COMMIT;

-- 4. Báo cho PostgREST làm mới schema cache tức thì
NOTIFY pgrst, 'reload schema';
