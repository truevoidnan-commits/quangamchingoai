# BÁO CÁO PHÂN TÍCH & BỘ KIỂM THỬ ĐỒNG BỘ HAI THIẾT BỊ (DUAL-DEVICE SYNC)
**Dự án:** Thiên Cơ Lâu  
**Ngày thực hiện:** 20/11/2026 (Cập nhật sau PR #3)  
**Nhánh thực hiện:** `test/dual-device-sync-simulation`  
**Mục tiêu:** Xác định và kiểm thử các tình huống khiến dữ liệu bị ghi đè, giật lùi hoặc thất lạc khi người dùng sử dụng ứng dụng trên cả Máy tính (Laptop) và Điện thoại (Mobile) đồng bộ qua Cloud.

---

## 1. Phân Tích Kiến Trúc & Cơ Chế Quản Lý Đồng Bộ

### 1.1. Các Module Tham Gia Đồng Bộ
1. `src/lib/sync/syncEngine.js`:
   - Điều phối đồng bộ thủ công (`performSync`), đồng bộ Tu Vi (`syncCultivation`), đồng bộ Tiến độ đọc (`syncReadingProgress`), nén/giải nén chương và tải/gộp nội dung truyện chữ (`mergeNovelWithCloud`).
2. `src/lib/sync/autoSync.js`:
   - Điều phối tự động chạy ngầm (`runAutoSync`), cơ chế 2 pha: Pha nhẹ (Metadata/Tiến độ/Tu vi) và Pha nặng (Nội dung chương truyện chữ).
   - Đẩy nhanh khi ẩn tab (`quickPushProgressAndCultivation` - *đã được bảo vệ ở Nhiệm vụ 3A*, `flushReadingProgress`).
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

### 1.2. Phân Biệt Hạ Tầng Lưu Trữ & Cơ Chế Quản Lý Phiên Bản

> [!IMPORTANT]
> **Phân định rõ hạ tầng lưu trữ:**
> - **Supabase Storage (Bucket `novels`):** Lưu trữ các file nén `.json.gz` chứa danh sách chương của **truyện chữ**.
> - **Cloudflare R2:** Lưu trữ hình ảnh và trang **truyện tranh (Comics)**, media dung lượng lớn.  
> Rủi ro ghi đè file chương truyện chữ trong báo cáo này thuộc phạm vi **Supabase Storage**.

| Thực thể | Trường quản lý phiên bản | Hạ tầng & Cơ chế lưu trữ | Cách ghi lên Cloud | Đánh giá hiện tại |
| :--- | :--- | :--- | :--- | :--- |
| **Tu vi (`cultivation`)** | `_rev` (local), `rev` (cloud), `lastSyncedRev` (ledger), `device_id` | Database PostgreSQL (JSONB snapshot) | `supabase.from('cultivation').upsert({ user_id, rev, state, updated_at, device_id }, { onConflict: 'user_id' })` | Lưu nguyên document. Thiếu OCC ở cấp Database. Lệnh `upsert` là ghi mù vô điều kiện (`DO UPDATE`). |
| **Tiến độ đọc (`progress`)** | `updatedAt` (local timestamp), `updated_at` (cloud timestamp) | Database PostgreSQL | `supabase.from('progress').upsert({ user_id, novel_id, data, updated_at }, { onConflict: 'user_id,novel_id' })` | Last-Write-Wins (LWW) hoàn toàn dựa vào client timestamp (`Date.now()`). Không có `_rev`. |
| **Nội dung chương truyện chữ (`novels`)** | `content_updated_at` (cloud), `lastPushedContentAt` / `lastPulledContentAt` (ledger) | **Supabase Storage** (Bucket `novels`) + Bảng `novels` | Upload file nén `.json.gz` với `{ upsert: true }` + `novels.upsert` | Không có ETag / If-Match header chống ghi đè đồng thời trên Storage. |

---

## 2. Kết Quả Bộ Kiểm Thử Mô Phỏng Hai Thiết Bị (`scripts/test-dual-device-sync.test.mjs`)

Đã thiết kế và thực thi 8 ca kiểm thử độc lập mô phỏng hai thiết bị (Laptop vs Mobile) tương tác với mock Supabase backend:

| Mã Ca | Tên Kịch Bản Kiểm Thử | Mục Tiêu / Hành Vi | Trạng Thái / Kết Quả Test |
| :---: | :--- | :--- | :---: |
| **Ca 1** | **Offline Divergence** (EXP/Cảnh giới) | Cả hai thiết bị cùng tăng EXP / đổi cảnh giới khi offline, rồi lần lượt sync | **PASS** *(Phát hiện xung đột `cultivation_conflict`, không tự ý ghi đè)* |
| **Ca 2** | **Race Condition / Concurrent Upsert** (Mục 5) | Hai thiết bị cùng đọc 1 revision rồi lần lượt upsert lên Supabase | **PASS** *(Tái hiện thành công lỗi **Lost Update** do thiếu OCC)* |
| **Ca 3** | **Bảo vệ Quick Push Tab Hide** (Nhiệm vụ 3A / PR #3) | Tab hide trên thiết bị mang rev cũ (11) KHÔNG ghi đè Cloud có rev mới (50) | **PASS** *(Đã khắc phục an toàn: Quick Push bypass, Cloud rev 50 được bảo toàn)* |
| **Ca 4** | **Tuần tự tiến độ đọc** (Chương khác nhau) | Thiết bị A đọc Ch 5 -> B nhận Ch 5 và đọc tiếp Ch 10 -> A nhận Ch 10 | **PASS** *(Hoạt động đúng trong điều kiện đồng hồ chuẩn)* |
| **Ca 5** | **Đọc 2 truyện khác nhau** | Thiết bị A đọc Truyện 1, Thiết bị B đọc Truyện 2 | **PASS** *(Phân tách độc lập theo khóa `user_id, novel_id`)* |
| **Ca 6** | **Clock Skew trong Tiến độ đọc** (Mục 6) | Thiết bị A đồng hồ nhanh 1 giờ ghi đè làm mất tiến độ mới đọc trên Thiết bị B | **PASS** *(Tái hiện thành công lỗi **Lost Reading Progress**)* |
| **Ca 7** | **Clock Skew trong Phát hiện Song song** (Mục 6) | Lệch đồng hồ làm sinh False Positive (kéo dài) hoặc False Negative | **PASS** *(Tái hiện thành công sai lệch logic cảnh báo)* |
| **Ca 8** | **Ghi nội dung truyện chữ đồng thời** | Hai thiết bị cùng thêm chương và đẩy file lên Supabase Storage gần như đồng thời | **PASS** *(Tái hiện thành công lỗi **Storage Overwrite** do thiếu OCC/ETag)* |

---

## 3. Phân Loại Chi Tiết: Vấn Đề Tồn Tại, Đã Khắc Phục & Rủi Ro Suy Luận

### 3.1. LỖI ĐÃ TÁI HIỆN BẰNG TEST NHƯNG CHƯA SỬA (Active Issues)

#### 🔴 Vấn đề 1: Lost Update khi hai thiết bị cùng đọc một revision trước khi lần lượt upsert (Mục 5)
- **Cơ chế gây lỗi:**
  1. Cloud đang ở `rev: N`. Cả Thiết bị A và B đều có `lastSyncedRev: N`.
  2. Cả hai thiết bị tu luyện cục bộ: A lên `rev: N+1` (1100 EXP), B lên `rev: N+1` (1200 EXP).
  3. Cả hai thiết bị cùng gửi truy vấn `SELECT` lên Cloud trước khi bên nào kịp ghi: cả hai đều thấy `cloudRev === lastSyncedRev (N)` -> cả hai đều kết luận `!isCloudChanged && isLocalChanged`.
  4. Thiết bị A gọi `upsert({ rev: N+1, state: { totalExp: 1100 } })` -> Cloud ghi nhận 1100 EXP.
  5. Thiết bị B (đến sau vài ms) gọi `upsert({ rev: N+1, state: { totalExp: 1200 } })`. Do Supabase `upsert` là ghi mù vô điều kiện (`ON CONFLICT (user_id) DO UPDATE`), Supabase ghi đè hoàn toàn dữ liệu của Thiết bị A!
- **Hệ quả phân mảnh âm thầm (Silent Divergence):**
  - Cả hai thiết bị đều lưu `lastSyncedRev = N+1` vào ledger cục bộ.
  - Ở lần sync tiếp theo của Thiết bị A: `cloudRev (N+1) === lastSyncedRev (N+1)` và `localRev (N+1) === lastSyncedRev (N+1)` -> Thiết bị A coi là không có thay đổi (`noop`).
  - Thiết bị A không biết dữ liệu của mình đã bị mất trên Cloud và không nhận được cập nhật của Thiết bị B.

> [!WARNING]
> **Lưu ý quan trọng về tính tương thời (Concurrency):**
> Việc chỉ thực hiện kiểm tra Cloud (`SELECT`) ngay trước khi gọi `UPSERT` từ phía client **hoàn toàn KHÔNG giải quyết triệt để race condition** (lỗi kinh điển *Check-Then-Act*).
> Khoảng trễ mạng (network latency) giữa lúc client nhận response `SELECT` và lúc request `UPSERT` đến được database tạo ra một "cửa sổ lỗ hổng" (time-of-check to time-of-use - TOCTOU). Nếu thiết bị thứ hai chen vào ghi trong khoảng thời gian này, dữ liệu vẫn bị ghi đè.
> Để giải quyết triệt để, **bắt buộc phải có cơ chế kiểm tra điều kiện nguyên tử (Atomic Check) trực tiếp tại Database** (như `UPDATE ... WHERE rev = expected_rev` hoặc Database Transaction / Conditional Function).

#### 🔴 Vấn đề 2: Clock Skew làm đảo lộn thứ tự tiến độ đọc (Mục 6)
- **Cơ chế gây lỗi:** Bảng `progress` dùng `updatedAt` từ client (`Date.now()`). Nếu Thiết bị A đồng hồ chạy nhanh 1 giờ (+3600s), nó đọc Chương 5 và đẩy lên Cloud với timestamp tương lai. Khi người dùng cầm Thiết bị B (đồng hồ chuẩn) đọc tiếp đến Chương 20, cơ chế LWW thấy Cloud có timestamp lớn hơn nên kéo Chương 5 về ghi đè, làm mất tiến độ Chương 20.

#### 🔴 Vấn đề 3: Ghi nội dung truyện chữ đồng thời ghi đè Supabase Storage (Ca 8)
- **Cơ chế gây lỗi:** Khi hai thiết bị cùng sửa/thêm chương và cùng khởi động autoSync, cả hai xếp task `push_dirty`. Hàm `pushNovelToCloud` tải file lên Supabase Storage với `{ upsert: true }` mà không kiểm tra xem `content_updated_at` trên Cloud có vừa bị thay đổi hay không. File nén trên Storage bị thiết bị sau ghi đè, làm mất các chương mới của thiết bị trước.

---

### 3.2. CƠ CHẾ ĐÃ ĐƯỢC BẢO VỆ Ở NHIỆM VỤ 3A

#### 🟢 Đã bảo vệ: Chặn Quick Push giật lùi dữ liệu Cloud (Nhiệm vụ 3A / PR #3)
- **Vấn đề ban đầu:** `quickPushProgressAndCultivation` trước đây gọi blind upsert khi đóng tab khiến máy mang rev cũ giật lùi dữ liệu Cloud của máy khác.
- **Giải pháp đã triển khai tại PR #3:** Quick Push tự động bypass việc ghi đè snapshot tu vi vô điều kiện, bảo toàn Cloud rev 50 (Kim Đan, 50,000 EXP) và giữ nguyên toàn bộ dữ liệu cục bộ (EXP, cảnh giới, `pending_seconds`) cũng như `lastSyncedRev` để luồng đồng bộ chính xử lý an toàn khi mở lại app.

---

### 3.3. RỦI RO SUY LUẬN TỪ MÃ NGUỒN (Inferred Risks)

1. **Tu vi là dữ liệu Snapshot, thiếu cơ chế gộp Delta (CRDT/Additive):** Tu vi gồm EXP tích lũy và số giây ngộ đạo (`pending_seconds`). Khi xảy ra xung đột offline, người dùng chỉ có thể chọn "giữ Cloud" HOẶC "giữ Local". Bất kỳ lựa chọn nào cũng vứt bỏ hoàn toàn EXP của thiết bị còn lại.
2. **`isCloudPendingChanged` kết hợp `isLocalRevChanged` rơi vào Silent No-op:** Trong `syncEngine.js` dòng 654-715, nếu Cloud chỉ đổi `pending_seconds` (`cloudRev === lastSyncedRev`) nhưng Local đổi `localRev`, không nhánh `if` nào xử lý -> rơi thẳng vào dòng 714 `return { noop: true }`.
3. **Storage Upload không có ETag / If-Match Header:** Supabase Storage (S3-compatible) hỗ trợ điều kiện `If-Match` hoặc `ETag` để chống ghi đè khi file đã bị bên khác thay đổi. Hiện tại `supabase.storage.upload` dùng `upsert: true` mù.

---

### 3.4. CÁC CƠ CHẾ ĐÃ ĐƯỢC KIỂM THỬ TRONG MÔ HÌNH GIẢ LẬP

> [!NOTE]
> Các cơ chế dưới đây đã vượt qua các bài kiểm thử giả lập với Mock Supabase in-memory. Tuy nhiên, môi trường production thực tế có các biến số phức tạp hơn (độ trễ mạng dao động, ngắt kết nối đột ngột, pooling kết nối, transaction isolation của PostgreSQL). Do đó, **không thể khẳng định hệ thống an toàn 100% trong mọi điều kiện thực tế chỉ dựa trên mock tests** cho tới khi hoàn tất cơ chế OCC ở cấp database.

1. **Tiến độ đọc của các truyện khác nhau:** Bảng `progress` dùng composite key `(user_id, novel_id)`. Hai thiết bị đọc hai truyện khác nhau phân tách độc lập trong các ca kiểm thử.
2. **Phát hiện xung đột Tu vi trong kịch bản tuần tự (Offline Divergence):** Khi hai thiết bị offline cùng đổi tu vi, nếu sync tuần tự (không đồng thời), Thiết bị B phát hiện đúng `isCloudRevChanged && isLocalRevChanged`, kích hoạt `attentionReason: 'cultivation_conflict'`, chặn đứng việc tự ý ghi đè.
3. **Bảo vệ mở thụ động trong Reader (`readerProgressGuard.js`):** Khi mở tab cũ hoặc reload trang (`locationKey === 'default'`), app chặn không cho tự động ghi tiến độ đọc trừ khi người dùng đã tương tác thật (`hasEngaged`) và đã tải xong tiến độ từ Cloud.
4. **Hợp nhất chương truyện tuần tự (`chapterMerge.js`):** Thuật toán `mergeChapterSets` bảo toàn chương, gộp cả hai bên, dedupe theo chữ ký `title:::content`.
5. **Điểm đồng bộ nội dung đơn điệu tăng dần (`syncLedger.js`):** `getContentSyncPoint` lấy `Math.max(lastPulledContentAt, lastPushedContentAt)`, miễn nhiễm với lỗi lùi thời gian.

---

## 4. Đề Xuất Khắc Phục Theo Thứ Tự Ưu Tiên (Actionable Recommendations)

### 🚨 MỨC ĐỘ 1: KHẨN CẤP / BƯỚC TIẾP THEO (Next Step: OCC Toàn Bộ Đường Ghi Cultivation)

1. **Triển khai Optimistic Concurrency Control (OCC) cho TOÀN BỘ các đường ghi `cultivation`:**
   - Sau khi Nhiệm vụ 3A đã chặn Quick Push, luồng đồng bộ chính (`runAutoSync`, `syncCultivation`, `performSync`) vẫn có nguy cơ race condition nếu hai thiết bị ghi gần như đồng thời (Ca 2).
   - **Yêu cầu cốt lõi:** Việc kiểm tra phiên bản phải diễn ra **nguyên tử (Atomic)** tại Database, không chấp nhận giải pháp check-then-act từ client.
   - *Định hướng giải pháp (Pseudocode / Khái niệm kiến trúc - Cần kiểm chứng kỹ lưỡng trên môi trường staging trước khi triển khai):*
     ```text
     // Pseudocode logic nguyên tử tại Database:
     // Khi Client gửi { rev: newRev, expected_rev: currentCloudRev }:
     UPDATE cultivation
     SET state = new_state, rev = new_rev, updated_at = now_ms, device_id = my_device
     WHERE user_id = my_user_id AND rev = expected_rev;

     // Nếu số dòng affected = 0 -> Phát hiện xung đột phiên bản (OCC Failed) -> Báo về client để mở hộp thoại giải quyết
     ```

---

### ⚠️ MỨC ĐỘ 2: QUAN TRỌNG (Khắc Phục Lệch Đồng Hồ & Ghi Đè Storage Truyện Chữ)

2. **Bảo vệ tiến độ đọc chống Clock Skew:**
   - Không dựa 100% vào `updatedAt` của client.
   - Bổ sung quy tắc so sánh chỉ số chương (`chapterIndex` hoặc `order`). Nếu vị trí đọc chênh lệch đáng kể (ví dụ Ch 20 > Ch 5), cần ưu tiên chương lớn hơn hoặc hỏi xác nhận thay vì tự động giật lùi chỉ vì timestamp client lớn hơn.
   - Chuyển sang sử dụng server timestamp khi lưu dòng progress trên Cloud.

3. **Kiểm tra Precondition trước khi Upload Supabase Storage (`pushNovelToCloud`):**
   - Trước khi upload blob nén lên Supabase Storage bucket `novels`, re-check `novels.content_updated_at`:
     - Nếu `content_updated_at` trên Cloud đã lớn hơn mốc lúc lập task -> Hủy bỏ `push_dirty`, chuyển ngay sang `mergeNovelWithCloud`.

---

### 💡 MỨC ĐỘ 3: CẢI TIẾN TRẢI NGHIỆM (Nâng Cấp Kiến Trúc)

4. **Cơ chế gộp tu vi thông minh (Additive / Delta Cultivation Sync):**
   - Lưu vết delta EXP: `deltaExp = currentExp - lastSyncedExp`. Khi xung đột xảy ra, cung cấp thêm lựa chọn: **"Cộng gộp tu vi cả hai thiết bị"** (`cloudExp + localDeltaExp`).

5. **Điều chỉnh phát hiện Parallel Device chống Clock Skew:**
   - Thay vì `now - cloudCultivation.updated_at < 120000`, dùng hàm toán học khoảng cách tuyệt đối `Math.abs(now - cloudCultivation.updated_at) < 120000` kết hợp tín hiệu heartbeat Realtime để tránh trường hợp đồng hồ máy bạn chạy nhanh sinh cảnh báo song song ảo.
