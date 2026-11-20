# BÁO CÁO PHÂN TÍCH & BỘ KIỂM THỬ ĐỒNG BỘ HAI THIẾT BỊ (DUAL-DEVICE SYNC)
**Dự án:** Thiên Cơ Lâu  
**Ngày thực hiện:** 20/11/2026  
**Nhánh thực hiện:** `test/dual-device-sync-simulation`  
**Mục tiêu:** Xác định các tình huống có thể khiến dữ liệu bị ghi đè, giật lùi hoặc thất lạc khi người dùng sử dụng ứng dụng trên cả Máy tính (Laptop) và Điện thoại (Mobile) đồng bộ qua Supabase.

---

## 1. Phân Tích Kiến Trúc & Cơ Chế Quản Lý Đồng Bộ Hiện Tại

### 1.1. Các Module Tham Gia Đồng Bộ
1. `src/lib/sync/syncEngine.js`:
   - Điều phối đồng bộ thủ công (`performSync`), đồng bộ Tu Vi (`syncCultivation`), đồng bộ Tiến độ đọc (`syncReadingProgress`), nén/giải nén chương và tải/gộp nội dung (`mergeNovelWithCloud`).
2. `src/lib/sync/autoSync.js`:
   - Điều phối tự động chạy ngầm (`runAutoSync`), cơ chế phân kỳ (2-phase: Light Phase cho Metadata/Tiến độ/Tu vi; Heavy Phase cho Nội dung chương truyện).
   - Đẩy nhanh khi ẩn tab (`quickPushProgressAndCultivation`, `flushReadingProgress`).
   - Kéo tu vi trước khi ngộ đạo (`pullCultivationBeforeMeditation`).
3. `src/lib/sync/syncLedger.js`:
   - Quản lý sổ đồng bộ cục bộ (`tcl_sync_ledger`): lưu `lastSyncedRev`, `lastSyncedPending`, `lastCloudUpdatedAt`, `lastPushedContentAt`, `lastPulledContentAt`, `device_id`.
   - Quản lý cờ bẩn (`tcl_sync_dirty`) và bia mộ xóa truyện (`tcl_sync_tombstones`).
4. `src/lib/cultivation.js`:
   - Trạng thái tu vi lưu tại `tcl_cultivation_state_real`.
   - Mỗi lần gọi `saveCultivationState(state)`: `_rev = (state._rev || 0) + 1` và `_updatedAt = Date.now()`.
5. `src/lib/storage.js` & `src/hooks/useNovelReadingProgress.js`:
   - Lưu tiến độ đọc tại `tcl_progress_<novelId>` và `scroll_pos_<novelId>_<chapterId>`.
   - Dùng client timestamp `Date.now()` cho `updatedAt`.

---

### 1.2. Cơ Chế Quản Lý `_rev`, `updatedAt`, `lastSyncedRev`, `device_id` & Cách Ghi Lên Supabase

| Thực thể | Trường quản lý phiên bản | Cơ chế lưu trữ | Cách ghi lên Supabase |
| :--- | :--- | :--- | :--- |
| **Tu vi (Cultivation)** | `_rev` (local), `rev` (cloud), `lastSyncedRev` (ledger), `device_id` | Document-level snapshot (JSONB) | `supabase.from('cultivation').upsert({ user_id, rev, state, updated_at, device_id }, { onConflict: 'user_id' })` |
| **Tiến độ đọc (Progress)** | `updatedAt` (local timestamp), `updated_at` (cloud timestamp) | Last-Write-Wins (LWW) dựa trên timestamp | `supabase.from('progress').upsert({ user_id, novel_id, data, updated_at }, { onConflict: 'user_id,novel_id' })` |
| **Nội dung chương (Novels)** | `content_updated_at` (cloud), `lastPushedContentAt` / `lastPulledContentAt` (ledger) | File nén `.json.gz` trên R2/Storage + metadata | Upload storage với `{ upsert: true }` + `novels.upsert({ content_updated_at, chapter_count })` |

---

## 2. Kết Quả Bộ Kiểm Thử Mô Phỏng Hai Thiết Bị (`scripts/test-dual-device-sync.test.mjs`)

Đã thiết kế và thực thi 8 ca kiểm thử độc lập mô phỏng hai thiết bị (Laptop vs Mobile) tương tác với mock Supabase backend:

| Mã Ca | Tên Kịch Bản Kiểm Thử | Mục Tiêu / Hành Vi | Kết Quả Test |
| :---: | :--- | :--- | :---: |
| **Ca 1** | **Offline Divergence** (EXP/Cảnh giới) | Cả hai thiết bị cùng tăng EXP / đổi cảnh giới khi offline, rồi lần lượt sync | **PASS** *(An toàn: phát hiện `cultivation_conflict`, không tự ghi đè)* |
| **Ca 2** | **Race Condition / Concurrent Upsert** (Mục 5) | Hai thiết bị cùng đọc 1 revision rồi lần lượt upsert lên Supabase | **PASS** *(Tái hiện thành công lỗi **Lost Update** do thiếu OCC)* |
| **Ca 3** | **Bảo vệ Quick Push Tab Hide** (Đã sửa tại PR #3) | Tab hide trên thiết bị mang rev cũ (11) KHÔNG ghi đè Cloud có rev mới (50) | **PASS** *(Đã bảo vệ an toàn: Quick Push bypass, Cloud rev 50 được bảo toàn)* |
| **Ca 4** | **Tuần tự tiến độ đọc** (Chương khác nhau) | Thiết bị A đọc Ch 5 -> B nhận Ch 5 và đọc tiếp Ch 10 -> A nhận Ch 10 | **PASS** *(An toàn: hoạt động chuẩn xác)* |
| **Ca 5** | **Đọc 2 truyện khác nhau** | Thiết bị A đọc Truyện 1, Thiết bị B đọc Truyện 2 | **PASS** *(An toàn: phân tách theo khóa `user_id, novel_id`)* |
| **Ca 6** | **Clock Skew trong Tiến độ đọc** (Mục 6) | Thiết bị A đồng hồ nhanh 1 giờ ghi đè làm mất tiến độ mới đọc trên Thiết bị B | **PASS** *(Tái hiện thành công lỗi **Lost Reading Progress**)* |
| **Ca 7** | **Clock Skew trong Phát hiện Song song** (Mục 6) | Lệch đồng hồ làm sinh False Positive (kéo dài) hoặc False Negative | **PASS** *(Tái hiện thành công lỗi **Parallel Detection Flaw**)* |
| **Ca 8** | **Ghi nội dung truyện đồng thời** | Hai thiết bị cùng thêm chương và đẩy nội dung truyện gần như đồng thời | **PASS** *(Tái hiện thành công lỗi **Storage Overwrite** do thiếu OCC)* |

---

## 3. Phân Loại Chi Tiết: Lỗi Đã Tái Hiện, Rủi Ro Suy Luận & Cơ Chế An Toàn

### 3.1. LỖI ĐÃ TÁI HIỆN BẰNG TEST (Confirmed Bugs & Reproductions)

#### 🔴 Lỗi 1: Lost Update khi hai thiết bị cùng đọc một revision trước khi lần lượt upsert (Mục 5)
- **Cơ chế gây lỗi:**
  1. Cloud đang ở `rev: N`. Cả Thiết bị A và B đều có `lastSyncedRev: N`.
  2. Cả hai thiết bị tu luyện cục bộ: A lên `rev: N+1` (1100 EXP), B lên `rev: N+1` (1200 EXP).
  3. Cả hai thiết bị cùng gửi truy vấn `SELECT` lên Cloud trước khi bên nào kịp ghi: cả hai đều thấy `cloudRev === lastSyncedRev (N)` -> cả hai đều kết luận `!isCloudChanged && isLocalChanged`.
  4. Thiết bị A gọi `upsert({ rev: N+1, state: { totalExp: 1100 } })` -> Cloud ghi nhận 1100 EXP.
  5. Thiết bị B (đến sau vài ms) gọi `upsert({ rev: N+1, state: { totalExp: 1200 } })`. Do Supabase `upsert` là ghi mù vô điều kiện (`ON CONFLICT (user_id) DO UPDATE`), Supabase ghi đè hoàn toàn dữ liệu của Thiết bị A!
- **Hệ quả phân mảnh âm thầm (Silent Divergence):**
  - Cả hai thiết bị đều lưu `lastSyncedRev = N+1` vào ledger cục bộ.
  - Ở lần sync tiếp theo của Thiết bị A: `cloudRev (N+1) === lastSyncedRev (N+1)` và `localRev (N+1) === lastSyncedRev (N+1)` -> Thiết bị A coi là không có thay đổi (`noop`).
  - Thiết bị A **vĩnh viễn không biết** dữ liệu của mình đã bị mất trên Cloud, và **vĩnh viễn không nhận được** cập nhật của Thiết bị B.

#### 🟢 Lỗi đã được khắc phục tại PR #3: Chặn Quick Push giật lùi dữ liệu Cloud (Nhiệm vụ 3A)
- **Vấn đề ban đầu:** `quickPushProgressAndCultivation` trước đây gọi blind upsert khi đóng tab khiến máy mang rev cũ giật lùi dữ liệu Cloud của máy khác.
- **Trạng thái:** **ĐÃ ĐƯỢC BẢO VỆ HOÀN TOÀN TẠI PR #3.** Quick Push tự động bypass việc ghi đè mù, bảo toàn Cloud rev 50 (Kim Đan, 50,000 EXP) và giữ nguyên toàn bộ dữ liệu cục bộ để luồng đồng bộ chính xử lý an toàn khi mở lại app.

#### 🔴 Lỗi 2: Clock Skew làm đảo lộn thứ tự tiến độ đọc (Mục 6)
- **Cơ chế gây lỗi:**
  - Bảng `progress` dùng `updatedAt` từ client (`Date.now()`).
  - Nếu Thiết bị A đồng hồ chạy nhanh 1 giờ (+3600s), khi đọc Chương 5 nó gán `updatedAt = T + 3600s`.
  - 15 phút sau, người dùng cầm Thiết bị B (đồng hồ chuẩn) đọc tiếp đến Chương 20 (`updatedAt = T + 900s`).
  - Khi Thiết bị B đồng bộ: so sánh `cloudUpdatedAt (T + 3600s) > localUpdatedAt (T + 900s)` -> Thiết bị B kéo Chương 5 về ghi đè làm mất Chương 20!

#### 🔴 Lỗi 4: Ghi nội dung truyện đồng thời ghi đè Storage (Concurrent Heavy Task)
- **Cơ chế gây lỗi:**
  - Khi hai thiết bị cùng sửa/thêm chương và cùng khởi động autoSync, cả hai cùng đọc danh sách truyện Cloud lúc chưa đổi.
  - Cả hai đều xếp task `push_dirty`.
  - Hàm `pushNovelToCloud` tải file lên Storage với `{ upsert: true }` mà không kiểm tra xem `content_updated_at` trên Cloud có vừa bị thay đổi bởi thiết bị kia hay không.
  - File nén trên Cloud Storage bị thiết bị sau ghi đè, làm mất các chương mới của thiết bị trước.

---

### 3.2. RỦI RO SUY LUẬN TỪ MÃ NGUỒN (Inferred Risks)

1. **Tu vi là dữ liệu Snapshot, thiếu cơ chế gộp Delta (CRDT/Additive):**
   - Tu vi gồm EXP tích lũy và số giây ngộ đạo (`pending_seconds`). Khi xảy ra xung đột (hai thiết bị offline cùng tích lũy), hệ thống chỉ cho phép chọn "giữ Cloud" HOẶC "giữ Local".
   - Bất kể người dùng chọn thế nào, toàn bộ EXP tích lũy ở một bên thiết bị chắc chắn sẽ bị vứt bỏ.
2. **`isCloudPendingChanged` khi kết hợp với `isLocalRevChanged` rơi vào Silent No-op:**
   - Trong `syncEngine.js` dòng 654-715: Nếu Cloud chỉ đổi `pending_seconds` (`cloudRev === lastSyncedRev`) nhưng Local đổi `localRev` (`localRev > lastSyncedRev`), không nhánh `if` nào bắt trường hợp này -> rơi thẳng vào dòng 714 `return { noop: true }`.
3. **Storage Upload không có ETag / If-Match Header:**
   - R2 và S3 hỗ trợ điều kiện `If-Match` hoặc `ETag` để chống ghi đè khi file đã bị bên khác thay đổi. Hiện tại `supabase.storage.upload` dùng `upsert: true` mù.

---

### 3.3. CÁC CƠ CHẾ ĐÃ AN TOÀN (Verified Safe Mechanisms)

1. **Tiến độ đọc của các truyện khác nhau:**
   - Bảng `progress` dùng composite key `(user_id, novel_id)`. Hai thiết bị đọc hai truyện khác nhau hoàn toàn độc lập, an toàn 100%.
2. **Phát hiện xung đột Tu vi trong kịch bản tuần tự (Offline Divergence):**
   - Khi hai thiết bị offline cùng đổi tu vi, nếu sync tuần tự (không đồng thời), Thiết bị B phát hiện đúng `isCloudRevChanged && isLocalRevChanged`, kích hoạt `attentionReason: 'cultivation_conflict'`, chặn đứng việc ghi đè tự động.
3. **Bảo vệ mở thụ động trong Reader (`readerProgressGuard.js`):**
   - Khi mở tab cũ hoặc reload trang (`locationKey === 'default'`), app chặn không cho tự động ghi tiến độ đọc trừ khi người dùng đã có tương tác thật (`hasEngaged`) và đã tải xong tiến độ từ Cloud.
4. **Hợp nhất chương truyện thông minh (`chapterMerge.js`):**
   - Thuật toán `mergeChapterSets` bảo toàn chương, gộp cả hai bên, dedupe theo chữ ký `title:::content`, giữ order an toàn khi được gọi trong luồng xung đột.
5. **Điểm đồng bộ nội dung đơn điệu tăng dần (`syncLedger.js`):**
   - `getContentSyncPoint` lấy `Math.max(lastPulledContentAt, lastPushedContentAt)`, miễn nhiễm với lỗi lùi thời gian.

---

## 4. Đề Xuất Khắc Phục Theo Thứ Tự Ưu Tiên (Actionable Recommendations)

### 🚨 MỨC ĐỘ 1: KHẨN CẤP (Critical - Ngăn Chặn Ngay Mất Dữ Liệu)

1. **Sửa ngay `quickPushProgressAndCultivation` trong `autoSync.js`:**
   - **Tuyệt đối không blind upsert.**
   - Trước khi upsert, bắt buộc phải:
     - Hoặc fetch nhẹ `rev` từ Cloud: nếu `cloudRev > lastSyncedRev` thì ABORT ngay và không được ghi đè.
     - Hoặc chuyển câu lệnh sang RPC / PostgreSQL conditional update: `UPDATE cultivation SET ... WHERE user_id = $1 AND rev <= $2`.

2. **Áp dụng Optimistic Concurrency Control (OCC) cho `cultivation`:**
   - Thay vì `upsert` vô điều kiện, triển khai cơ chế kiểm tra phiên bản:
     - Tạo hàm Supabase RPC (PostgreSQL function):
       ```sql
       create or replace function safe_upsert_cultivation(
         p_user_id text, p_state jsonb, p_rev bigint, p_device_id text, p_expected_rev bigint
       ) returns boolean as $$
       declare v_current_rev bigint;
       begin
         select rev into v_current_rev from cultivation where user_id = p_user_id for update;
         if v_current_rev is not null and v_current_rev != p_expected_rev then
           return false; -- Conflict detected!
         end if;
         insert into cultivation (user_id, state, rev, updated_at, device_id)
         values (p_user_id, p_state, p_rev, extract(epoch from now())*1000, p_device_id)
         on conflict (user_id) do update set
           state = excluded.state,
           rev = excluded.rev,
           updated_at = excluded.updated_at,
           device_id = excluded.device_id;
         return true;
       end;
       $$ language plpgsql;
       ```
     - Khi RPC trả về `false`, client biết ngay là có race condition và chuyển sang quy trình giải quyết xung đột thay vì ghi đè âm thầm.

---

### ⚠️ MỨC ĐỘ 2: QUAN TRỌNG (High - Khắc Phục Lệch Đồng Hồ & Ghi Đè Storage)

3. **Chống Clock Skew trong Tiến độ đọc:**
   - Khi so sánh tiến độ đọc giữa hai thiết bị:
     - Không dựa 100% vào `updatedAt` của client.
     - Sử dụng quy tắc: Nếu cùng một truyện, so sánh chỉ số chương (`chapterIndex` hoặc `order`). Nếu thiết bị đang ở chương lớn hơn đáng kể (ví dụ Ch 20 > Ch 5), cần ưu tiên chương lớn hơn hoặc hỏi người dùng thay vì tự động giật lùi về chương cũ chỉ vì timestamp client lớn hơn.
     - Sử dụng server timestamp (Postgres `now()`) khi lưu dòng progress trên Cloud.

4. **Kiểm tra Precondition trước khi Upload Storage (`pushNovelToCloud`):**
   - Trước khi upload blob nén lên R2/Storage, truy vấn lại `novels.content_updated_at`:
     - Nếu `content_updated_at` trên Cloud đã lớn hơn mốc lúc lập task -> Hủy bỏ `push_dirty`, chuyển ngay sang `mergeNovelWithCloud`.

---

### 💡 MỨC ĐỘ 3: CẢI TIẾN TRẢI NGHIỆM (Medium - Nâng Cấp Kiến Trúc)

5. **Gộp tu vi thông minh (Additive / Delta Cultivation Sync):**
   - Thay vì chỉ chọn bản Local hoặc Cloud, lưu log delta EXP: `deltaExp = currentExp - lastSyncedExp`.
   - Khi giải quyết xung đột, cung cấp thêm tùy chọn: **"Cộng gộp tu vi cả hai thiết bị"** (`mergedExp = cloudExp + localDeltaExp`).

6. **Điều chỉnh phát hiện Parallel Device chống Clock Skew:**
   - Thay vì `now - cloudCultivation.updated_at < 120000`, dùng hàm toán học khoảng cách tuyệt đối `Math.abs(now - cloudCultivation.updated_at) < 120000` kết hợp tín hiệu heartbeat Realtime để loại bỏ số âm do đồng hồ chạy nhanh.
