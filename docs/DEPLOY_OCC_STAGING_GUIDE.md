# HƯỚNG DẪN TRIỂN KHAI VÀ VẬN HÀNH OCC TRÊN MÔI TRƯỜNG THỬ NGHIỆM / STAGING

**Dự án:** Thiên Cơ Lâu  
**Tài liệu kỹ thuật:** `docs/CULTIVATION_OCC_DESIGN.md`  
**Draft PR:** #5 (`feat/cultivation-occ-staging`)  

---

> [!WARNING]
> **QUY TẮC AN TOÀN VẬN HÀNH:**
> - Tuyệt đối **KHÔNG** chạy các câu lệnh dưới đây trên Supabase Production khi chưa có phê duyệt chính thức.
> - Tuyệt đối **KHÔNG** chạy Stage B (Cutover) cùng lúc với Stage A.
> - Luôn kiểm tra danh sách migration và cấu trúc database trước và sau khi thực hiện.
> - Tuyệt đối **KHÔNG** cấp lại quyền ghi trực tiếp (INSERT, UPDATE) cho role authenticated làm phương án rollback sau khi đã Cutover.

---

## 1. Tổng quan Kiến trúc Hai Giai đoạn (Staged Rollout)

Hệ thống Optimistic Concurrency Control (OCC) được phân tách thành 2 giai đoạn độc lập:

1. **Giai đoạn A (Migration Tự động / Khởi tạo Hạ tầng):**
   - File: `supabase/migrations/20261120_cultivation_occ_stage_a.sql`
   - Nhiệm vụ: Tạo bảng `cultivation`, bảng nhật ký `cultivation_idempotency_log`, bảng cờ cấu hình `app_system_flags`, và hàm RPC `sync_cultivation_occ`.
   - **Đặc điểm:** Không thu hồi quyền ghi hiện hữu của client cũ. An toàn khi áp dụng qua quy trình migration tiêu chuẩn.
2. **Giai đoạn B (Vận hành Thủ công / Cutover Lockdown):**
   - File: `supabase/operations/20261120_cultivation_occ_stage_b_cutover.sql`
   - Nhiệm vụ: Thu hồi quyền `INSERT, UPDATE, DELETE` trên `cultivation` từ `anon`, `authenticated`, `public`.
   - **Đặc điểm:** Chỉ chạy thủ công khi client mới đã được cập nhật ổn định trên staging và tỷ lệ lỗi RPC bằng 0.

---

## 2. Quy trình Triển khai Chuẩn hóa Giai đoạn A (Staging Migration)

### Bước 2.1: Chuẩn hóa Công cụ Quản lý Migration
- **Quy trình chuẩn thức (Golden Standard):** Sử dụng **Supabase CLI (`supabase db push`)**.
- **Lý do kỹ thuật:** Supabase CLI theo dõi lịch sử migration thông qua bảng hệ thống `supabase_migrations.schema_migrations`. Cơ chế này đảm bảo:
  - Mỗi migration chỉ được thực thi đúng một lần theo thứ tự thời gian.
  - Ngăn ngừa xung đột schema giữa các thành viên trong đội ngũ phát triển.
  - Tự động kiểm tra tính nhất quán trước khi đẩy lên remote staging.

> [!CAUTION]
> **Tác động khi áp dụng trực tiếp qua `psql` hoặc Supabase SQL Editor:**
> - Nếu chạy trực tiếp file SQL bằng `psql` hoặc SQL Editor mà không qua Supabase CLI, các đối tượng schema sẽ được tạo trong database nhưng **bảng `supabase_migrations.schema_migrations` sẽ KHÔNG có bản ghi tương ứng**.
> - **Hậu quả:** Khi pipeline CI/CD hoặc người vận hành khác chạy `supabase db push`, Supabase CLI sẽ phát hiện file `20261120_cultivation_occ_stage_a.sql` chưa có trong lịch sử và sẽ cố gắng áp dụng lại (re-apply). Dù migration đã có `IF NOT EXISTS` / `CREATE OR REPLACE`, việc tái thực thi ngoài dự kiến có thể gây cảnh báo hoặc lỗi không đáng có.
> - **Cách xử lý nếu buộc phải chạy qua `psql`:** Phải đồng bộ thủ công vào bảng lịch sử:
>   ```sql
>   INSERT INTO supabase_migrations.schema_migrations (version, name)
>   VALUES ('20261120', 'cultivation_occ_stage_a')
>   ON CONFLICT (version) DO NOTHING;
>   ```

### Bước 2.2: Tiền kiểm Schema và RLS thực tế (Pre-flight Verification)
Trước khi chạy migration trên môi trường staging đã có dữ liệu, thực thi các câu lệnh sau để đánh giá hiện trạng:
```sql
-- 1. Kiểm tra bảng cultivation đã tồn tại và cấu trúc cột hiện có:
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'cultivation';

-- 2. Kiểm tra trạng thái Row Level Security (RLS):
SELECT relname, relrowsecurity 
FROM pg_class 
WHERE oid = 'public.cultivation'::regclass;

-- 3. Kiểm tra các policies RLS hiện hữu:
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'cultivation';

-- 4. Kiểm tra số lượng bản ghi hiện hữu (đánh giá rủi ro tác động dữ liệu):
SELECT count(*) AS total_cultivation_rows FROM public.cultivation;

-- 5. Kiểm tra quyền của các role đối với bảng:
SELECT grantee, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_schema = 'public' AND table_name = 'cultivation';
```

### Bước 2.3: Kiểm tra Danh sách Migration Pending
```bash
# Kiểm tra qua Supabase CLI:
supabase migration list
```
**Xác nhận bắt buộc:** Chỉ có `20261120_cultivation_occ_stage_a.sql` xuất hiện trong danh sách pending. Thư mục `supabase/migrations/` **tuyệt đối không chứa** file Stage B hoặc bất kỳ file cutover nào.

### Bước 2.4: Áp dụng Migration A
```bash
# Áp dụng theo quy trình chuẩn:
supabase db push
```

### Bước 2.5: Xác nhận Quyền ghi trước Cutover
```sql
SELECT 
    has_table_privilege('authenticated', 'public.cultivation', 'INSERT') AS can_insert,
    has_table_privilege('authenticated', 'public.cultivation', 'UPDATE') AS can_update,
    has_table_privilege('authenticated', 'public.cultivation', 'SELECT') AS can_select,
    has_function_privilege('authenticated', 'public.sync_cultivation_occ(bigint, jsonb, bigint, text, text, text)', 'EXECUTE') AS can_rpc;
```
**Kết quả mong đợi:**
| can_insert | can_update | can_select | can_rpc |
| :---: | :---: | :---: | :---: |
| `true` | `true` | `true` | `true` |

*(Cả client cũ dùng REST upsert lẫn client mới dùng RPC OCC đều có thể ghi và đọc dữ liệu)*.

---

## 3. Quy trình Vận hành Cutover Giai đoạn B (Manual Operation)

Chỉ thực hiện khi:
1. Đã triển khai frontend mới có hỗ trợ OCC lên môi trường staging.
2. Xác nhận 100% request ghi tu vi từ client staging đi qua RPC `sync_cultivation_occ`.
3. Tỷ lệ lỗi RPC trên dashboard Supabase ở mức 0%.

### Bước 3.1: Thực thi File Vận hành Cutover Thủ công
Chạy file [supabase/operations/20261120_cultivation_occ_stage_b_cutover.sql](file:///d:/Downloads/dat-antigravity/Thiên%20Cơ%20Lâu/supabase/operations/20261120_cultivation_occ_stage_b_cutover.sql) qua `psql` hoặc Supabase SQL Editor dưới quyền quản trị (`postgres` / `service_role`):
```bash
psql -d "$STAGING_DATABASE_URL" -f supabase/operations/20261120_cultivation_occ_stage_b_cutover.sql
```

### Bước 3.2: Xác nhận Quyền ghi sau Cutover
```sql
SELECT 
    has_table_privilege('authenticated', 'public.cultivation', 'INSERT') AS post_can_insert,
    has_table_privilege('authenticated', 'public.cultivation', 'UPDATE') AS post_can_update,
    has_table_privilege('authenticated', 'public.cultivation', 'SELECT') AS post_can_select,
    has_function_privilege('authenticated', 'public.sync_cultivation_occ(bigint, jsonb, bigint, text, text, text)', 'EXECUTE') AS post_can_rpc;
```
**Kết quả bắt buộc sau Cutover:**
| post_can_insert | post_can_update | post_can_select | post_can_rpc |
| :---: | :---: | :---: | :---: |
| `false` | `false` | `true` | `true` |

---

## 4. Quy trình Xử lý Sự cố & Dừng Khẩn cấp (Safe Maintenance Mode)

> [!CAUTION]
> **BÁC BỎ HOÀN TOÀN ROLLBACK CẤP LẠI QUYỀN GHI TRỰC TIẾP:**
> - Tuyệt đối **KHÔNG** cấp lại quyền ghi trực tiếp (INSERT, UPDATE) cho role authenticated làm phương án rollback.
> - **Lý do:** Việc cấp lại quyền ghi trực tiếp sẽ mở lại lỗ hổng blind upsert, stale write và lost update. Dữ liệu Cloud có thể bị các client cũ ghi đè âm thầm, gây silent divergence không thể phục hồi.
> - Tuyệt đối **KHÔNG** `DROP FUNCTION public.sync_cultivation_occ`. Việc drop RPC sẽ khiến mọi client frontend mới bị crash (HTTP 404 / function not found).

### 4.1. Phương án Dừng Ghi Tu Vi Mặc định (Safe Maintenance Circuit Breaker)
Khi phát hiện sự cố bất thường sau Cutover (lỗi RPC tăng đột biến, nghi ngờ xung đột logic, v.v.), người vận hành kích hoạt Safe Maintenance Mode:

```sql
-- Kích hoạt dừng đồng bộ tu vi (Circuit Breaker):
INSERT INTO public.app_system_flags (key, value, updated_at)
VALUES (
    'cultivation_maintenance', 
    '{"enabled": true, "message": "Hệ thống tạm dừng đồng bộ tu vi để kiểm tra bảo trì an toàn"}'::jsonb, 
    NOW()
)
ON CONFLICT (key) DO UPDATE
SET value = '{"enabled": true, "message": "Hệ thống tạm dừng đồng bộ tu vi để kiểm tra bảo trì an toàn"}'::jsonb,
    updated_at = NOW();
```

### 4.2. Trạng thái Hệ thống Trong Khi Bật Maintenance
1. **Direct Write vẫn bị TỪ CHỐI:** Quyền `INSERT, UPDATE` trên `public.cultivation` vẫn bị thu hồi (`REVOKE`). Không client nào có thể ghi đè dữ liệu Cloud.
2. **RPC trả về trạng thái kiểm soát:** `sync_cultivation_occ` trả về ngay lập tức:
   ```json
   { "status": "MAINTENANCE", "code": "SYNC_PAUSED", "message": "Hệ thống tạm dừng đồng bộ tu vi..." }
   ```
3. **Bảo toàn dữ liệu Local:** Client frontend nhận trạng thái `MAINTENANCE` sẽ:
   - Giữ nguyên toàn bộ tu vi, exp, realm và `pending_seconds` tại local.
   - Không đánh dấu dữ liệu là đã đồng bộ (`last_synced_at` giữ nguyên).
   - Hiển thị banner cảnh báo nhẹ, không chặn trải nghiệm đọc truyện của người dùng.
   - Các tiến trình đồng bộ khác (tiến độ đọc novel, bookmarks) vẫn diễn ra bình thường.

### 4.3. Thủ tục Xác minh Dữ liệu Local & Cloud Trước Khi Mở Lại Đồng Bộ
Trước khi tắt cờ maintenance để mở lại luồng ghi, người vận hành bắt buộc thực hiện 4 bước đối chiếu dữ liệu:

1. **Kiểm tra Logs & Idempotency Log:**
   ```sql
   SELECT user_id, idempotency_key, committed_rev, created_at 
   FROM public.cultivation_idempotency_log 
   ORDER BY created_at DESC 
   LIMIT 50;
   ```
   Xác định các request bị lỗi hoặc timeout. Đảm bảo không có request bị kẹt ở trạng thái dở dang.

2. **Kiểm tra Tính Toàn vẹn của Bảng Cultivation:**
   ```sql
   SELECT user_id, rev, updated_at, device_id, (state->>'totalExp')::bigint AS exp, state->>'realm' AS realm
   FROM public.cultivation 
   ORDER BY updated_at DESC 
   LIMIT 50;
   ```
   Đảm bảo revision là dãy tăng đơn điệu (`rev >= 1`), các trường trong `state` không bị rỗng (`null`).

3. **Đối chiếu Snapshot Mẫu trên Thiết bị Thử nghiệm:**
   - Mở giao diện client (Desktop và Mobile) của cùng một tài khoản test.
   - Kiểm tra `localStorage.getItem('cultivation_state')` và `localStorage.getItem('sync_ledger')`.
   - Đối chiếu `currentRev` và `totalExp` trên thiết bị với bản ghi Cloud trong database.
   - Xác nhận hai thiết bị không bị silent divergence.

4. **Tắt Cờ Bảo trì để Mở Lại Đồng Bộ:**
   Sau khi hoàn tất xác minh toàn vẹn:
   ```sql
   UPDATE public.app_system_flags
   SET value = '{"enabled": false, "message": "Hệ thống hoạt động bình thường"}'::jsonb,
       updated_at = NOW()
   WHERE key = 'cultivation_maintenance';
   ```
