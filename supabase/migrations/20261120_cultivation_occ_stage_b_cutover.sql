-- ==============================================================================
-- SUPABASE POSTGRESQL MIGRATION: OCC CUTOVER LOCKDOWN (STAGE B)
-- Môi trường áp dụng: Supabase Local / Staging (CHỈ THỰC THI SAU KHI STAGE A ĐÃ ĐƯỢC PHÊ DUYỆT)
-- Phiên bản: 20261120_cultivation_occ_stage_b_cutover
-- Tham chiếu thiết kế: docs/CULTIVATION_OCC_DESIGN.md
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- CUTOVER PHÂN QUYỀN: KHÓA CHẶT 100% ĐƯỜNG GHI TRỰC TIẾP (DIRECT WRITES)
-- Ngăn chặn hoàn toàn việc client cũ bypass OCC bằng lệnh REST upsert
-- ------------------------------------------------------------------------------

-- 1. Thu hồi toàn bộ quyền INSERT, UPDATE, DELETE trên bảng cultivation từ mọi role client
REVOKE INSERT, UPDATE, DELETE ON TABLE public.cultivation FROM anon, authenticated, public;

-- 2. Đảm bảo quyền SELECT vẫn mở cho authenticated để đọc dữ liệu qua RLS
GRANT SELECT ON TABLE public.cultivation TO authenticated;

-- Ghi chú kiểm tra:
-- Sau khi áp dụng migration này, mọi client cũ gọi .from('cultivation').upsert()
-- sẽ lập tức nhận lỗi PostgREST 42501 (permission denied for table cultivation).
-- Khối try-catch của client cũ sẽ bảo vệ và giữ nguyên 100% dữ liệu local của người dùng.
