# HƯỚNG DẪN TRIỂN KHAI VÀ VẬN HÀNH OCC TRÊN MÔI TRƯỜNG THỬ NGHIỆM / STAGING

**Dự án:** Thiên Cơ Lâu  
**Tài liệu kỹ thuật:** `docs/CULTIVATION_OCC_DESIGN.md`  
**Draft PR:** #5 (`feat/cultivation-occ-staging`)  

---

> [!WARNING]
> **QUY TẮC AN TOÀN:**
> - Tuyệt đối **KHÔNG** chạy các câu lệnh dưới đây trên Supabase Production khi chưa có phê duyệt chính thức.
> - Tuyệt đối **KHÔNG** chạy Stage B (Cutover) cùng lúc với Stage A.
> - Luôn kiểm tra danh sách migration trước và sau khi thực hiện.

---

## 1. Tổng quan Kiến trúc Hai Giai đoạn (Staged Rollout)

Hệ thống OCC được tách làm 2 giai đoạn độc lập:
1. **Giai đoạn A (Migration tự động / Khởi tạo):**
   - File: `supabase/migrations/20261120_cultivation_occ_stage_a.sql`
   - Nhiệm vụ: Tạo bảng `cultivation`, bảng nhật ký `cultivation_idempotency_log`, bảng cờ cấu hình `app_system_flags`, và hàm RPC `sync_cultivation_occ`.
   - **Đặc điểm:** Không làm gián đoạn quyền ghi của client cũ. An toàn khi áp dụng qua `supabase db push`.
2. **Giai đoạn B (Vận hành thủ công / Cutover Lockdown):**
   - File: `supabase/operations/20261120_cultivation_occ_stage_b_cutover.sql`
   - Nhiệm vụ: Thu hồi quyền `INSERT, UPDATE, DELETE` trên `cultivation` từ `anon`, `authenticated`, `public`.
   - **Đặc điểm:** Chỉ chạy thủ công khi client mới đã được cập nhật ổn định trên staging.

---

## 2. Quy trình Triển khai Giai đoạn A (Staging Migration)

### Bước 2.1: Kiểm tra Migration Pending
Trước khi áp dụng, kiểm tra trạng thái migration trên môi trường staging:
```bash
# Sử dụng Supabase CLI:
supabase migration list

# Hoặc kiểm tra qua PostgreSQL query:
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC;
```
Xác nhận chỉ có file `20261120_cultivation_occ_stage_a.sql` xuất hiện trong danh sách pending. Không có file Stage B trong thư mục `supabase/migrations/`.

### Bước 2.2: Áp dụng Migration A
```bash
# Áp dụng tự động qua Supabase CLI:
supabase db push

# Hoặc áp dụng thủ công qua psql / SQL Editor:
psql -d "$STAGING_DATABASE_URL" -f supabase/migrations/20261120_cultivation_occ_stage_a.sql
```

### Bước 2.3: Xác nhận Quyền ghi trước Cutover
Chạy câu lệnh kiểm tra quyền:
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

*(Cả client cũ dùng REST upsert lẫn client mới dùng RPC OCC đều có thể hoạt động bình thường)*.

---

## 3. Quy trình Vận hành Cutover Giai đoạn B (Manual Operation)

Chỉ thực hiện khi:
1. Client staging đã được deploy phiên bản frontend mới (hỗ trợ OCC).
2. Tỷ lệ lỗi RPC trên dashboard Supabase ở mức 0%.

### Bước 3.1: Thực thi File Vận hành Cutover
Chạy file `supabase/operations/20261120_cultivation_occ_stage_b_cutover.sql` qua psql hoặc SQL Editor dưới quyền `postgres` / `service_role`:
```bash
psql -d "$STAGING_DATABASE_URL" -f supabase/operations/20261120_cultivation_occ_stage_b_cutover.sql
```

### Bước 3.2: Xác nhận Quyền ghi sau Cutover
Chạy câu lệnh kiểm tra quyền:
```sql
SELECT 
    has_table_privilege('authenticated', 'public.cultivation', 'INSERT') AS can_insert,
    has_table_privilege('authenticated', 'public.cultivation', 'UPDATE') AS can_update,
    has_table_privilege('authenticated', 'public.cultivation', 'SELECT') AS can_select,
    has_function_privilege('authenticated', 'public.sync_cultivation_occ(bigint, jsonb, bigint, text, text, text)', 'EXECUTE') AS can_rpc;
```
**Kết quả bắt buộc sau Cutover:**
| can_insert | can_update | can_select | can_rpc |
| :---: | :---: | :---: | :---: |
| `false` | `false` | `true` | `true` |

---

## 4. Quy trình Khôi phục Khẩn cấp (Emergency Rollback)

Nếu phát hiện sự cố sau khi Cutover:
```sql
-- Mở lại quyền ghi trực tiếp cho authenticated mà KHÔNG cần xóa schema hay RPC của Stage A:
GRANT INSERT, UPDATE ON TABLE public.cultivation TO authenticated;
```
Kiểm tra lại: `has_table_privilege('authenticated', 'public.cultivation', 'INSERT')` -> `true`.
