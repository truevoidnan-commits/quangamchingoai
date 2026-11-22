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

Cấu hình các bí mật trên Supabase CLI hoặc Supabase Dashboard (Settings > Edge Functions > Secrets).

> [!IMPORTANT]
> **Project Ref Production**: `vmzgjlooapqskcmkerdz`
>
> Phân hệ video sử dụng bộ khóa riêng biệt (`R2_VIDEO_*`), hoàn toàn cách ly với bộ khóa truyện tranh (`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`). Edge Function `video-presign` không tự động fallback sang khóa truyện tranh để tránh lỗi 403 do sai lệch quyền bucket.
>
> Luôn chỉ định `--project-ref vmzgjlooapqskcmkerdz` để đảm bảo tác vụ ghi vào đúng project Production của Thiên Cơ Lâu.

```bash
# 1. Kiểm tra danh sách secrets hiện tại của project:
supabase secrets list --project-ref vmzgjlooapqskcmkerdz

# 2. Cấu hình các biến cho video (thay các giá trị trong dấu ngoặc kép bằng thông tin thật):
supabase secrets set \
  R2_ACCOUNT_ID="<your-cloudflare-account-id>" \
  R2_VIDEO_ACCESS_KEY_ID="<your-video-access-key-id>" \
  R2_VIDEO_SECRET_ACCESS_KEY="<your-video-secret-access-key>" \
  R2_VIDEO_BUCKET="tcl-videos" \
  --project-ref vmzgjlooapqskcmkerdz
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

Sử dụng Supabase CLI để deploy lên project production:

```bash
supabase functions deploy video-presign --project-ref vmzgjlooapqskcmkerdz --no-verify-jwt
```

> [!IMPORTANT]
> - Sau khi cập nhật Secrets trên Supabase Dashboard hoặc Supabase CLI, các worker Deno đang chạy có thể giữ cache biến môi trường cũ. Chạy lại lệnh deploy trên sẽ kích hoạt phiên bản Edge Function mới nhất và tải các Secrets mới một cách tức thì.
> - Ta sử dụng `--no-verify-jwt` để Edge Function tự phân tích Authorization header trong mã Deno, cho phép hỗ trợ đồng thời cả người dùng thường (xem phim) và quản trị viên (upload/xóa phim), đồng thời xử lý CORS preflight (OPTIONS) mượt mà.

---

## 7. XÁC MINH VẬN HÀNH THẬT & CHẨN ĐOÁN R2

### 7.1 Chẩn đoán kết nối Cloudflare R2 (Khắc phục lỗi 403 AccessDenied)

Hàm `video-presign` được nâng cấp sử dụng **AWS SDK v3 (`@aws-sdk/client-s3` & `@aws-sdk/s3-request-presigner`)** với `forcePathStyle: true` và `region: 'auto'` chuẩn của Cloudflare R2, loại bỏ hoàn toàn các lỗi ký thủ công SigV4 (lỗi stripped `Host` header, canonical query `?uploads` và XML serialization).

Để chẩn đoán trạng thái kết nối Cloudflare R2 ngay trên giao diện:
1. Đăng nhập với tài khoản Admin và mở **Thêm phim mới / Chỉnh sửa**.
2. Chọn thẻ **2. Tập phim & Upload MP4**.
3. Trong hộp **Kiểm soát dung lượng & chi phí Cloudflare R2**, bấm nút **Kiểm tra kết nối R2**.
4. Edge Function sẽ thực hiện một thao tác đọc an toàn (`ListObjectsV2` với `MaxKeys: 1, prefix: 'videos/'` - không ghi, không sửa dữ liệu) và phân loại lỗi:
   - **CONNECTED (Xanh lá)**: Token, endpoint và bucket hợp lệ 100%, sẵn sàng upload.
   - **PERMISSIONS_OR_BUCKET_MISMATCH (HTTP 403)**: Token R2 không có quyền `Object Read & Write` trên bucket `tcl-videos`, hoặc `R2_ACCOUNT_ID` không khớp với tài khoản sở hữu token.
   - **CREDENTIAL_INVALID**: Access Key ID hoặc Secret Access Key sai.
   - **BUCKET_NOT_FOUND (HTTP 404)**: Tên bucket trên Cloudflare Dashboard không khớp với biến `R2_VIDEO_BUCKET` (mặc định: `tcl-videos`).
   - **ENDPOINT_UNREACHABLE**: Sai Account ID hoặc mạng không kết nối được đến Cloudflare R2.
   > [!NOTE]
   > Công cụ chẩn đoán hiển thị nguồn biến môi trường đang dùng (`R2_VIDEO_ACCESS_KEY_ID` hoặc `R2_ACCESS_KEY_ID`) và 4 ký tự đầu/cuối của Access Key để đối chiếu với Cloudflare Dashboard, tuyệt đối **không log hoặc để lộ Secret Access Key**.

### 7.2 Cơ chế tự động thử lại khi tải lên thất bại (Loại bỏ lỗi uq_series_episode)

Khi upload MP4 thất bại giữa chừng (do rớt mạng hoặc lỗi R2), hệ thống đánh dấu trạng thái tập phim là `failed`. Lần tải lên tiếp theo với cùng số tập sẽ **tự động tái sử dụng và cập nhật vỏ tập phim hiện có (`prepareVideoEpisodeForUpload`)**, không cố chèn mới (insert) nên hoàn toàn không bị lỗi trùng khóa `duplicate key value violates unique constraint "uq_series_episode"`.

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
