# HƯỚNG DẪN TRIỂN KHAI PHÂN HỆ TRUYỆN VIDEO (CLOUDFLARE R2 + SUPABASE)

Tài liệu này cung cấp quy trình từng bước dành cho Chủ dự án (Project Owner) để thiết lập hạ tầng Cloudflare R2, cấu hình Supabase Edge Function `video-presign`, chạy Database Migration và xác minh vận hành phân hệ Truyện Video trong Thiên Cơ Lâu.

---

## 1. TẠO BUCKET CLOUDFLARE R2 (`tcl-videos`)

Để cách ly hoàn toàn dữ liệu video MP4 khỏi bucket truyện tranh `tcl-comics`, hãy tạo một bucket R2 riêng biệt:

1. Đăng nhập vào [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Chọn **R2** từ menu điều hướng bên trái.
3. Bấm **Create bucket**.
4. Đặt tên Bucket: `tcl-videos`.
5. Vị trí (Location): Chọn **Automatic** (hoặc khu vực gần người dùng nhất, ví dụ APAC).
6. Quyền truy cập: **Private** (Mặc định).
   > [!IMPORTANT]
   > Tuyệt đối KHÔNG bật Public Access (R2.dev subdomain hoặc Custom Domain công khai) cho bucket này. Mọi luồng phát và upload đều được bảo vệ và ký thông qua presigned URL ngắn hạn (SigV4) của Edge Function.

---

## 2. CẤP TOKEN GIỚI HẠN QUYỀN (R2 API TOKEN)

Không dùng API token toàn quyền của tài khoản Cloudflare. Hãy tạo token chỉ có quyền đọc/ghi trên bucket `tcl-videos`:

1. Trong giao diện Cloudflare R2, bấm vào liên kết **Manage R2 API Tokens** ở cột bên phải.
2. Bấm **Create API token**.
3. Cấu hình:
   - **Token name**: `tcl-videos-presign-token`.
   - **Permissions**: **Object Read & Write**.
   - **Specify bucket(s)**: Chọn duy nhất bucket `tcl-videos`.
   - **TTL (Time to live)**: Không đặt hoặc đặt theo chính sách bảo mật nội bộ.
4. Bấm **Create API Token**.
5. Sao chép và lưu trữ an toàn 3 giá trị sau:
   - **Account ID** (Hiển thị ở trang tổng quan R2).
   - **Access Key ID**.
   - **Secret Access Key**.

---

## 3. CÁC BIẾN MÔI TRƯỜNG VÀ SECRETS CẦN THIẾT

Cấu hình các bí mật trên Supabase CLI hoặc Supabase Dashboard (Settings > Edge Functions > Secrets):

```bash
# Lệnh cấu hình qua Supabase CLI:
supabase secrets set \
  R2_ACCOUNT_ID="<your-cloudflare-account-id>" \
  R2_VIDEO_ACCESS_KEY_ID="<your-access-key-id>" \
  R2_VIDEO_SECRET_ACCESS_KEY="<your-secret-access-key>" \
  R2_VIDEO_BUCKET="tcl-videos"
```

> [!NOTE]
> `SUPABASE_URL`, `SUPABASE_ANON_KEY`, và `SUPABASE_SERVICE_ROLE_KEY` được Supabase Edge Runtime tự động inject vào hàm mà không cần cấu hình thủ công.

---

## 4. CẤU HÌNH CORS TRÊN BUCKET R2

Trình duyệt của người dùng tải trực tiếp MP4 lên R2 qua HTTP PUT / Multipart và phát trực tuyến video qua HTTP GET (kèm HTTP Range requests để tua video).

1. Mở bucket `tcl-videos` trên Cloudflare Dashboard.
2. Vào thẻ **Settings** > cuộn xuống mục **CORS Policy** > bấm **Add CORS Policy**.
3. Dán cấu hình JSON sau:

```json
[
  {
    "AllowedOrigins": [
      "https://truevoidnan-commits.github.io",
      "http://localhost:5173",
      "http://localhost:4173"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "HEAD",
      "POST",
      "DELETE"
    ],
    "AllowedHeaders": [
      "authorization",
      "content-type",
      "range",
      "x-amz-date",
      "x-amz-content-sha256",
      "x-amz-user-agent",
      "x-amz-security-token"
    ],
    "ExposeHeaders": [
      "Content-Range",
      "Content-Length",
      "Accept-Ranges",
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

4. Bấm **Save CORS Policy**.

> [!WARNING]
> Trường `ETag` trong `ExposeHeaders` là **bắt buộc**. Nếu thiếu `ETag`, trình duyệt sẽ chặn JavaScript đọc ETag của các phần tải lên, dẫn đến lỗi xác thực multipart upload.

---

## 5. CHẠY DATABASE MIGRATION AN TOÀN

Script SQL độc lập hoàn toàn nằm tại `supabase/video_library_r2.sql`.

### Bước 1: Áp dụng migration

Chạy script trên Supabase SQL Editor:
- Mở Dashboard Supabase > **SQL Editor** > New Query.
- Dán nội dung từ tệp `supabase/video_library_r2.sql` và bấm **Run**.

Script sẽ tạo các bảng:
- `public.video_admins`: Danh sách user có quyền quản trị.
- `public.video_series`: Quản lý bộ phim.
- `public.video_episodes`: Quản lý tập phim, khóa R2, kích thước và trạng thái upload.
- `public.video_subtitles`: Phụ đề VTT kèm ngôn ngữ.
- `public.video_watch_progress`: Lưu vết tiến độ xem phim của từng đạo hữu.
- `public.video_upload_sessions`: Quản lý phiên S3 Multipart Upload.
- Cùng toàn bộ RLS policies bảo mật nhiều tầng.

### Bước 2: Cấp quyền Quản trị viên (Admin)

Để cấp quyền admin cho một tài khoản người dùng:

```sql
-- Lấy user_id từ auth.users và thêm vào video_admins:
INSERT INTO public.video_admins (user_id, email, note)
VALUES (
  '<UUID-CỦA-ADMIN>',
  'admin@example.com',
  'Quản trị viên khởi tạo phân hệ video'
)
ON CONFLICT (user_id) DO NOTHING;
```

Hoặc cập nhật JWT metadata của user:
```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
WHERE id = '<UUID-CỦA-ADMIN>';
```

---

## 6. DEPLOY EDGE FUNCTION `video-presign`

Sử dụng Supabase CLI để deploy:

```bash
supabase functions deploy video-presign --no-verify-jwt
```

> [!NOTE]
> Ta sử dụng `--no-verify-jwt` để Edge Function tự phân tích Authorization header trong mã Deno, cho phép hỗ trợ đồng thời cả người dùng thường (xem phim) và quản trị viên (upload/xóa phim), đồng thời xử lý CORS preflight (OPTIONS) mượt mà.

---

## 7. XÁC MINH VẬN HÀNH THẬT (VERIFICATION)

Sau khi deploy backend và frontend:

1. **Kiểm tra Thư viện (`/videos`)**:
   - Truy cập `/videos`.
   - Giao diện hiển thị tiêu đề "Thần Thông Ảnh Họa", bộ lọc thể loại, thanh tìm kiếm.
2. **Kiểm tra Quyền Admin**:
   - Đăng nhập với tài khoản admin đã cấp quyền ở Mục 5.
   - Thanh điều khiển Admin xuất hiện với nút "Thêm phim mới".
3. **Tạo Phim & Upload Ảnh Bìa**:
   - Nhập tên phim, thể loại, chọn ảnh poster.
   - Bấm lưu: Poster được upload trực tiếp lên R2 qua presigned PUT.
4. **Upload Video MP4 (Multipart)**:
   - Chuyển sang thẻ "Tập phim & Upload MP4".
   - Chọn tệp MP4 bất kỳ từ máy tính.
   - Kiểm tra hộp kiểm soát dung lượng R2:
     - Hiển thị dung lượng video hiện tại.
     - Hiển thị dung lượng truyện tranh ước tính 1.2 GB.
     - Hiển thị kích thước file sắp tải lên.
     - Hiển thị cảnh báo nếu tổng chạm hoặc vượt 8 GB.
   - Bấm "Bắt đầu tải lên R2": Quan sát thanh tiến độ phần trăm, số phần (part) và tốc độ tải lên.
   - Sau khi hoàn thành 100%, tập phim tự động chuyển sang trạng thái sẵn sàng (`ready`).
5. **Upload Phụ Đề**:
   - Chọn tệp WebVTT (.vtt) và tải lên.
6. **Kiểm tra Phát Video (`/videos/:seriesId/watch/:episodeId`)**:
   - Trình phát mở mượt mà, hỗ trợ play/pause, tua qua lại 10s, đổi tốc độ 0.5x - 2x.
   - Phụ đề tiếng Việt hiển thị chính xác.
   - Tua đến giữa tập, tắt trang và vào lại: Kiểm tra tính năng "Tiếp tục xem từ mm:ss".
   - Khi xem xong 95% thời lượng: Tập phim được đánh dấu hoàn thành, tự động chuyển sang tập kế tiếp nếu bật "Tự chuyển tập".

---

## 8. HƯỚNG DẪN KIỂM SOÁT CHI PHÍ R2 & ROLLBACK

### A. Kiểm soát chi phí R2
- Gói Cloudflare R2 miễn phí cung cấp **10 GB lưu trữ/tháng** và 10.000.000 Class B Operations (Đọc).
- Hệ thống đã tích hợp ngưỡng cảnh báo tự động ở mức **8 GB** (khoảng 8.589.934.592 bytes).
- **Phân định rõ ràng nguồn dữ liệu dung lượng**:
  - Khi Edge Function truy vấn thành công S3 ListObjects trên R2: Hiển thị dung lượng thực tế từ R2 API.
  - Khi không kết nối được S3 ListObjects: Hiển thị tổng kích thước `file_size` từ cơ sở dữ liệu và ghi rõ "Ước tính từ DB" chứ không giả mạo là số liệu thật.
  - Dữ liệu truyện tranh: Cố định mức ước tính ~1,2 GB.
- **Cơ chế tải lên**:
  - Hệ thống hỗ trợ chia nhỏ tệp (10 MB/part), tự động thử lại 3 lần (exponential backoff) nếu rớt mạng giữa chừng trong phiên tải lên, và hủy an toàn (`abort-multipart-upload`) nếu người dùng bấm Hủy.
  - Không hỗ trợ tiếp tục phiên sau khi đóng trình duyệt hoặc tải lại trang (nếu tải lại, phiên cũ sẽ được dọn dẹp và bắt đầu phiên mới).
- Hệ thống **tuyệt đối không tự ý mua gói, thay đổi thông tin thanh toán hoặc xóa dữ liệu** của người dùng.

### B. Quy trình Rollback (Nếu cần)
Nếu cần gỡ bỏ phân hệ Video mà không ảnh hưởng đến bất kỳ phần nào khác của Thiên Cơ Lâu:

1. **Xóa Edge Function**:
   ```bash
   supabase functions delete video-presign
   ```
2. **Gỡ bỏ dữ liệu R2**:
   - Vào Cloudflare Dashboard > R2 > chọn bucket `tcl-videos` > **Delete bucket**.
   - Dữ liệu truyện tranh trong bucket `tcl-comics` được bảo toàn nguyên vẹn 100%.
3. **Xóa các bảng Database**:
   Chạy lệnh SQL sau trong Supabase SQL Editor:
   ```sql
   DROP TABLE IF EXISTS public.video_upload_sessions CASCADE;
   DROP TABLE IF EXISTS public.video_watch_progress CASCADE;
   DROP TABLE IF EXISTS public.video_subtitles CASCADE;
   DROP TABLE IF EXISTS public.video_episodes CASCADE;
   DROP TABLE IF EXISTS public.video_series CASCADE;
   DROP TABLE IF EXISTS public.video_admins CASCADE;
   DROP FUNCTION IF EXISTS public.is_video_admin() CASCADE;
   DROP FUNCTION IF EXISTS public.handle_video_updated_at() CASCADE;
   ```
   *Lưu ý: Thao tác này hoàn toàn không tác động đến các bảng tu luyện (cultivation), novel hay comics.*
