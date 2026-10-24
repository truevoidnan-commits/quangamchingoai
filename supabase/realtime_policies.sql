-- ==============================================================================
-- SUPABASE REALTIME AUTHORIZATION POLICIES CHO THIÊN CƠ LÂU
-- ==============================================================================
--
-- TÀI LIỆU THAM KHẢO CHÍNH THỨC CỦA SUPABASE:
-- 1. Realtime Authorization Guide:
--    https://supabase.com/docs/guides/realtime/authorization
-- 2. Broadcast Authorization & Private Channels:
--    https://supabase.com/docs/guides/realtime/broadcast#authorization
-- 3. RLS Performance Best Practices (Wrapping auth.uid() in subquery):
--    https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- GIẢI THÍCH KIẾN TRÚC & CÁC ĐẶC ĐIỂM KỸ THUẬT:
-- 1. Bảng `realtime.messages`:
--    Supabase quản lý quyền truy cập kênh Broadcast/Presence thông qua bảng nội bộ này
--    trong schema `realtime`. Bảng này ĐÃ ĐƯỢC BẬT RLS MẶC ĐỊNH bởi Supabase.
--    LƯU Ý: KHÔNG chạy lệnh `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;`
--    vì tài khoản người dùng thông thường không phải chủ sở hữu bảng, sẽ gây lỗi:
--    "must be owner of table messages".
--
-- 2. Cột `extension`:
--    Phân định tính năng Realtime đang dùng ('broadcast' hoặc 'presence').
--    Chúng ta chỉ áp dụng chính sách cho tính năng 'broadcast'.
--
-- 3. Hàm `realtime.topic()`:
--    Hàm tích hợp sẵn trả về chuỗi tên kênh (topic) mà client yêu cầu kết nối hoặc gửi tin.
--    Ví dụ kênh: 'sync:<user_id>'.
--
-- 4. Bọc `(select auth.uid())::text`:
--    Theo khuyến nghị chính thức của Supabase, bọc `(select auth.uid())` trong subquery
--    giúp PostgreSQL chỉ đánh giá hàm một lần duy nhất per-query thay vì mỗi dòng,
--    tránh nghẽn hiệu năng khi có nhiều kết nối đồng thời. Ép kiểu `::text` để so sánh
--    trực tiếp với chuỗi UUID trong topic.
--
-- 5. Kênh riêng tư (Private Channel):
--    Được đặt tên theo định dạng: 'sync:' || <uuid của user>.
--    Người dùng A tuyệt đối không thể đọc hay gửi tín hiệu vào kênh của người dùng B.
-- ==============================================================================

-- BƯỚC 1: XÓA CHÍNH SÁCH CŨ (NẾU ĐÃ TỪNG TẠO TRƯỚC ĐÓ)
DROP POLICY IF EXISTS "Users can receive broadcast on their own sync topic" ON realtime.messages;
DROP POLICY IF EXISTS "Users can send broadcast to their own sync topic" ON realtime.messages;

-- BƯỚC 2: CHÍNH SÁCH CHO PHÉP NHẬN TÍN HIỆU (SELECT)
-- Người dùng đã đăng nhập chỉ được phép lắng nghe tín hiệu trên đúng kênh 'sync:<auth.uid>' của mình.
CREATE POLICY "Users can receive broadcast on their own sync topic"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Chỉ áp dụng cho tính năng Broadcast
  realtime.messages.extension = 'broadcast'
  -- Tên topic phải khớp chính xác với ID của người dùng đang đăng nhập
  AND realtime.topic() = 'sync:' || (select auth.uid())::text
);

-- BƯỚC 3: CHÍNH SÁCH CHO PHÉP PHÁT TÍN HIỆU (INSERT)
-- Người dùng đã đăng nhập chỉ được phép phát tín hiệu lên đúng kênh 'sync:<auth.uid>' của mình.
CREATE POLICY "Users can send broadcast to their own sync topic"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  -- Chỉ áp dụng cho tính năng Broadcast
  realtime.messages.extension = 'broadcast'
  -- Tên topic phải khớp chính xác với ID của người dùng đang đăng nhập
  AND realtime.topic() = 'sync:' || (select auth.uid())::text
);

-- ==============================================================================
-- HƯỚNG DẪN GỠ BỎ (ROLLBACK / DROP POLICIES)
-- ==============================================================================
-- Khi muốn xóa bỏ các chính sách trên và đưa Realtime về trạng thái mặc định,
-- mở SQL Editor trong Supabase Dashboard và thực thi 2 dòng sau:
--
-- DROP POLICY IF EXISTS "Users can receive broadcast on their own sync topic" ON realtime.messages;
-- DROP POLICY IF EXISTS "Users can send broadcast to their own sync topic" ON realtime.messages;
