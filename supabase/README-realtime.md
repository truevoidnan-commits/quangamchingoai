# Hướng Dẫn Cấu Hình Supabase Realtime Authorization - Thiên Cơ Lâu

Tài liệu này hướng dẫn quản trị viên cấu hình tính năng **Tín hiệu đồng bộ tức thời (Realtime Signal)** giữa các thiết bị thông qua giao diện Supabase Dashboard.

---

## 1. Nguyên Lý Hoạt Động
- Tín hiệu Realtime chỉ hoạt động như một **"chiếc chuông cửa" (doorbell signal)**: khi Thiết bị A vừa đẩy thành công dữ liệu lên Cloud, nó phát một tin broadcast siêu nhẹ. Thiết bị B nhận được tin sẽ kích hoạt ngay một lượt đồng bộ kiểm tra dữ liệu từ Cloud (đọc qua các bảng RLS thông thường).
- **Tuyệt đối không truyền dữ liệu người dùng qua Realtime**: Tin nhắn chỉ gồm mã định danh thiết bị rút gọn, thời điểm phát và phạm vi danh mục.
- Nếu Realtime bị gián đoạn, mất mạng hoặc RLS chưa cấu hình, ứng dụng tự động quay về cơ chế kiểm tra định kỳ 3 phút, khi mở lại app, hoặc khi chuyển tab như bình thường.

---

## 2. Bước 1: Thiết Lập Chính Sách RLS Cho Kênh Riêng Tư (Bắt Buộc)

Supabase Realtime bảo vệ các kênh riêng tư (`private: true`) bằng cách kiểm tra Row Level Security (RLS) trên bảng nội bộ `realtime.messages` thuộc schema `realtime`.

1. Đăng nhập vào [Supabase Dashboard](https://supabase.com/dashboard).
2. Chọn dự án của bạn.
3. Ở menu thanh bên trái, nhấp vào biểu tượng **SQL Editor**.
4. Nhấp vào nút **+ New query**.
5. Mở file `supabase/realtime_policies.sql` trong mã nguồn, sao chép toàn bộ nội dung và dán vào cửa sổ soạn thảo SQL.
6. Nhấp vào nút **Run** (hoặc bấm `Ctrl + Enter` / `Cmd + Enter`).
7. Xác nhận kết quả hiển thị thông báo `Success. No rows returned`.

> [!IMPORTANT]
> **Không chạy lệnh `ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;`**  
> Bảng `realtime.messages` đã được Supabase bật RLS sẵn từ hệ thống. Nếu cố gắng đổi quyền sở hữu hay bật lại RLS, Supabase sẽ báo lỗi `must be owner of table messages`.

---

## 3. Bước 2: Kiểm Tra Cấu Hình Realtime Trên Dashboard

1. Trên menu bên trái của Supabase Dashboard, nhấp vào **Project Settings** (biểu tượng bánh răng ở góc dưới) -> Chọn mục **Realtime**.
2. Kiểm tra các mục cấu hình sau:

### A. Tùy chọn "Allow public access" (Cho phép truy cập công khai)
- **Cơ chế**:  
  Ứng dụng Thiên Cơ Lâu luôn khởi tạo kênh đồng bộ với cấu hình:
  ```javascript
  supabase.channel(`sync:${userId}`, {
    config: {
      private: true,
      broadcast: { self: false }
    }
  })
  ```
  Khi kênh được khai báo `private: true`, Supabase Realtime luôn bắt buộc kiểm tra RLS trên `realtime.messages` bất kể công tắc "Allow public access" đang bật hay tắt.
- **Khuyến nghị**:  
  - Nếu dự án Supabase này chỉ dùng riêng cho Thiên Cơ Lâu, bạn có thể **TẮT (Disable) "Allow public access"** để chặn hoàn toàn mọi kênh public trái phép. Khi tắt, mọi client cố gắng kết nối kênh không có `private: true` sẽ bị chặn với lỗi `PrivateOnly`.
  - Nếu dự án của bạn dùng chung với các dịch vụ khác cần kênh public, bạn có thể **GIỮ BẬT**. Kênh `sync:<userId>` của Thiên Cơ Lâu vẫn được bảo vệ 100% bằng RLS do cờ `private: true`.

### B. Tùy chọn "Database connection pool size"
- Khi người dùng kết nối vào kênh private, Realtime server sẽ sử dụng kết nối database để kiểm tra chính sách RLS.
- Giá trị mặc định (thường là 10) là hoàn toàn đủ dùng cho nhu cầu đọc truyện cá nhân và nhiều thiết bị cùng lúc. Bạn chỉ cần nâng thông số này nếu có hàng nghìn thiết bị kết nối đồng thời và gặp cảnh báo `IncreaseConnectionPool`.

---

## 4. Kiểm Tra Hoạt Động

1. Mở ứng dụng Thiên Cơ Lâu trên trình duyệt máy tính và điện thoại (cùng đăng nhập một tài khoản).
2. Vào trang **Cài Đặt / Đồng Bộ**:
   - Công tắc **Đồng bộ tức thời** mặc định BẬT.
   - Trạng thái hiển thị: **"Đang hoạt động"** màu xanh ngọc.
3. Thử đọc một vài trang truyện hoặc đổi tiến độ ở thiết bị A.
4. Ngay khi thiết bị A lưu (khoảng 1-2 giây), thiết bị B sẽ nhận được tín hiệu và tự động cập nhật tiến độ đọc mới mà không cần đợi chu kỳ 3 phút hay chuyển tab.

---

## 5. Hướng Dẫn Gỡ Bỏ (Rollback)

Nếu vì bất kỳ lý do gì bạn muốn gỡ bỏ chính sách Realtime và quay về cơ chế đồng bộ cũ:
1. Mở **SQL Editor** trong Supabase Dashboard.
2. Chạy 2 câu lệnh sau:
   ```sql
   DROP POLICY IF EXISTS "Users can receive broadcast on their own sync topic" ON realtime.messages;
   DROP POLICY IF EXISTS "Users can send broadcast to their own sync topic" ON realtime.messages;
   ```
3. Trong giao diện ứng dụng Thiên Cơ Lâu, người dùng có thể tắt công tắc **Đồng bộ tức thời** bất cứ lúc nào.
