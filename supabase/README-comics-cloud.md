# Hướng Dẫn Cấu Hình Đồng Bộ Truyện Tranh Cloud (Phase 2)
### Lưu trữ phân tán: Cloudflare R2 (Ảnh WebP) + Supabase (Metadata & Tiến độ)

Tài liệu này hướng dẫn chi tiết từng bước cho người dùng thiết lập hệ thống lưu trữ truyện tranh trên Cloudflare R2 và Supabase. Toàn bộ thiết kế đảm bảo bảo mật tuyệt đối: trình duyệt không bao giờ nắm giữ API key của R2 mà chỉ giao tiếp qua **Presigned URL** có thời hạn sinh từ Supabase Edge Function.

---

## BƯỚC 1: Chạy Script SQL Trên Supabase

1. Truy cập vào [Supabase Dashboard](https://supabase.com/dashboard).
2. Chọn dự án của bạn (`Thiên Cơ Lâu`).
3. Ở menu bên trái, nhấp vào **SQL Editor** (biểu tượng `>_`).
4. Nhấn **New Query**.
5. Mở tệp `supabase/comics_cloud.sql` trong dự án, copy toàn bộ nội dung và dán vào ô soạn thảo.
6. Nhấn nút **Run** (hoặc `Ctrl + Enter` / `Cmd + Enter`).
7. **Kiểm tra kết quả**: Bạn sẽ thấy thông báo `Success. No rows returned`. Bốn bảng mới đã được tạo và kích hoạt bảo mật RLS:
   - `comic_series`
   - `comic_volumes`
   - `comic_progress`
   - `comic_ops_hourly` (quản lý hạn mức tối đa 12.000 thao tác/giờ/người dùng, đảm bảo đồng bộ mượt mà toàn bộ ~125 tập truyện)

---

## BƯỚC 2: Cấu Hình Bucket & CORS Trên Cloudflare R2

### 2.1. Tạo Bucket R2
1. Đăng nhập vào [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Chọn mục **R2 Object Storage** ở thanh menu bên trái.
3. Nhấn **Create bucket**.
4. Đặt tên Bucket là: `tcl-comics` (hoặc tên tùy chọn, nếu đổi tên hãy cập nhật biến môi trường `R2_BUCKET`).
5. Vùng lưu trữ (Location): Chọn **Automatic** (mặc định) và nhấn **Create Bucket**.

### 2.2. Cấu hình CORS cho Bucket
1. Trong trang cài đặt của bucket vừa tạo (`tcl-comics`), chuyển sang tab **Settings**.
2. Cuộn xuống phần **CORS Policy** (Chính sách chia sẻ tài nguyên giữa các nguồn gốc) và chọn **Add CORS policy** (hoặc **Edit CORS policy**).
3. Dán đoạn JSON cấu hình dưới đây vào:

```json
[
  {
    "AllowedOrigins": [
      "https://truevoidnan-commits.github.io",
      "http://localhost:5173"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "HEAD"
    ],
    "AllowedHeaders": [
      "content-type",
      "cache-control"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```
4. Nhấn **Save**.

### 2.3. Tạo API Token cho Cloudflare R2
1. Trở lại trang chủ **R2 Overview** trên Cloudflare.
2. Nhấn vào **Manage R2 API Tokens** ở cột bên phải.
3. Nhấn **Create API Token**.
4. Chọn quyền **Object Read & Write** cho bucket `tcl-comics`.
5. Nhấn **Create API Token**.
6. **LƯU Ý QUAN TRỌNG**: Sao chép và cất giữ an toàn 3 thông số:
   - **Account ID** (tìm thấy ở URL hoặc trang R2 overview)
   - **Access Key ID**
   - **Secret Access Key**

---

## BƯỚC 3: Cấu Hình Biến Môi Trường Trên Supabase

1. Vào [Supabase Dashboard](https://supabase.com/dashboard) -> Chọn dự án -> **Project Settings** -> **Edge Functions** (hoặc tab **Secrets**).
2. Thêm 4 biến môi trường (Secrets) sau:
   - `R2_ACCOUNT_ID`: Mã tài khoản Cloudflare của bạn.
   - `R2_ACCESS_KEY_ID`: Access Key ID vừa tạo ở Bước 2.3.
   - `R2_SECRET_ACCESS_KEY`: Secret Access Key vừa tạo ở Bước 2.3.
   - `R2_BUCKET`: `tcl-comics`

---

## BƯỚC 4: Triển Khai Edge Function `comic-presign`

> [!IMPORTANT]
> **CẬP NHẬT PHASE 4 (Xóa Đồng Bộ Toàn Diện & Dọn Dẹp R2):**
> Trong Phase 4, logic xử lý hành động `delete-volume` đã được nâng cấp để liệt kê prefix và xóa trực tiếp từng object trên R2 với mã trả về HTTP 502 chuẩn xác, đồng thời rate limit xóa được nâng lên 15.000 ops/giờ.
> **Người dùng cần deploy lại Edge Function `comic-presign`** (cập nhật lại cả `index.ts` và `validate.js`).
> **KHÔNG CẦN CHẠY BẤT KỲ FILE SQL MỚI NÀO** (schema Supabase Phase 2 được giữ nguyên vẹn 100%).


Bạn có thể triển khai bằng 1 trong 2 cách sau:

### Cách A: Dán Mã Trực Tiếp Trên Supabase Dashboard (Không cần cài đặt CLI)
1. Trong Supabase Dashboard, chọn mục **Edge Functions** ở menu bên trái.
2. Nhấn **Create Function**, đặt tên là `comic-presign`.
3. Trong trình soạn thảo code của Dashboard:
   - Thay toàn bộ code trong `index.ts` bằng nội dung tệp `supabase/functions/comic-presign/index.ts`.
   - Tạo thêm tệp `validate.js` cạnh `index.ts` và dán nội dung từ `supabase/functions/comic-presign/validate.js`.
4. Bật tùy chọn **Enforce JWT Verification** (Xác thực JWT).
5. Nhấn **Deploy**.

### Cách B: Triển Khai Bằng Supabase CLI (Khuyên Dùng Cho Lập Trình Viên)
Mở terminal tại thư mục gốc của dự án `Thiên Cơ Lâu`:

```bash
# Đăng nhập vào tài khoản Supabase (nếu chưa đăng nhập)
npx supabase login

# Liên kết với dự án Supabase của bạn (lấy Project ID từ URL dashboard)
npx supabase link --project-ref <your-project-id>

# Deploy Edge Function comic-presign
npx supabase functions deploy comic-presign --no-verify-jwt=false
```

---

## BƯỚC 5: Kiểm Tra Hoạt Động Của Hệ Thống

1. Mở ứng dụng Thiên Cơ Lâu trên trình duyệt (hoặc `http://localhost:5173`).
2. Đăng nhập tài khoản Supabase của bạn.
3. Vào mục **Truyện Tranh**:
   - Bạn sẽ thấy thanh trạng thái **Cloud: 0.00 / 8 GB (0%)** hiển thị ở đầu trang kèm nút **🧹 Giải Phóng Bộ Nhớ Máy**.
4. Chọn một bộ truyện và nhấn **Nhập Truyện Tranh (PDF)**:
   - Tùy chọn **☁️ Tự động tải lên Cloud sau khi nhập xong** sẽ tự động được chọn.
   - Sau khi các trang WebP được tách thành công vào máy, hệ thống sẽ tự động đồng bộ lên Cloudflare R2 theo 4 luồng song song.
   - Trên danh sách tập, trạng thái chuyển từ `⏳ Đang tải lên x%` thành `☁️ Đã đồng bộ`.
5. **Kiểm tra trên thiết bị thứ 2 (Điện thoại hoặc máy tính khác)**:
   - Đăng nhập cùng tài khoản trên thiết bị 2.
   - Mở mục Truyện Tranh: Bộ truyện và các tập sẽ hiển thị huy hiệu `☁️ Chỉ trên cloud`.
   - Bấm **⬇️ Tải về** để tải về máy và đọc offline mượt mà.
   - Tiến độ đọc tự động đồng bộ giữa 2 máy (sau 5 giây tương tác).
