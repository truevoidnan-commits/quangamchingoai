# THIẾT KẾ KIẾN TRÚC OPTIMISTIC CONCURRENCY CONTROL (OCC) CHO HỆ THỐNG ĐỒNG BỘ TU VI
## (Cập nhật sau Review Nhiệm vụ 3B.1)

**Dự án:** Thiên Cơ Lâu  
**Repository:** `https://github.com/truevoidnan-commits/quangamchingoai`  
**Nhánh thiết kế:** `design/cultivation-occ`  
**Trạng thái Pull Request:** Draft PR #4 (`https://github.com/truevoidnan-commits/quangamchingoai/pull/4`)  
**Ngày cập nhật:** 20/11/2026  
**Mục đích:** TÀI LIỆU THIẾT KẾ KIẾN TRÚC CHÍNH THỨC (CHƯA THỰC THI SQL TRÊN SUPABASE / CHƯA SỬA LOGIC PRODUCTION)  

---

> [!IMPORTANT]
> **Cam kết an toàn tuyệt đối:**
> - Tài liệu này **CHỈ** phục vụ mục đích phân tích kỹ thuật, mô hình hóa dữ liệu và thiết kế kiến trúc chuẩn bị cho giai đoạn triển khai.
> - **Tuyệt đối KHÔNG** chạy SQL migration trên Supabase production, không tự ý thay đổi quyền RLS/GRANT, không can thiệp API keys, Supabase Auth hoặc Cloudflare R2.
> - **Tuyệt đối KHÔNG** sửa đổi mã nguồn production trong PR này. Mọi đoạn mã SQL hoặc RPC trong tài liệu này được trình bày dưới dạng đặc tả kỹ thuật mẫu (Technical Specification & Pseudocode) phục vụ thẩm định.

---

## 1. Kiến Trúc Hiện Tại & Thiết Kế Tách Biệt Revision

### 1.1. Kiến Trúc Lưu Trữ 3 Tầng
Hệ thống tu vi của Thiên Cơ Lâu được lưu trữ và đồng bộ hóa qua 3 tầng dữ liệu:

```mermaid
flowchart TD
    subgraph Client ["Client (Trình duyệt Máy tính / Điện thoại)"]
        UI["Giao diện Tu Vi & Đọc Truyện"] --> Context["CultivationContext.jsx"]
        Context --> CultLib["src/lib/cultivation.js"]
        CultLib --> LocalStorage["localStorage:\n- tcl_cultivation_state_real (Snapshot)\n- cultivation_pending_seconds (Bộ đếm đọc)\n- tcl_sync_ledger (Sổ cái đồng bộ)\n- tcl_cultivation_conflict_state (Xung đột bền vững)\n- tcl_cultivation_backup_* (3 bản xoay vòng)"]
        
        SyncEngine["src/lib/sync/syncEngine.js"] --> LocalStorage
        AutoSync["src/lib/sync/autoSync.js"] --> LocalStorage
        SyncLedger["src/lib/sync/syncLedger.js"] --> LocalStorage
    end

    subgraph Supabase ["Cloud (Supabase PostgreSQL)"]
        RPC["RPC Function: sync_cultivation_occ()\n(Atomic Transaction & Row Lock)"]
        TableCult["Bảng public.cultivation:\n(user_id, rev, state, updated_at, device_id,\nlast_idempotency_key, last_request_at)"]
        RPC --> TableCult
    end

    AutoSync -- "1. runAutoSync() gọi RPC" --> RPC
    SyncEngine -- "2. syncCultivation() gọi RPC" --> RPC
    TableCult -- "3. SELECT (Pull / Read-only)" --> AutoSync
    TableCult -. "4. REST Direct Upsert (BỊ CHẶN BỞI REVOKE)" .-x TableCult
```

### 1.2. Thiết Kế Tách Biệt Hoàn Toàn Giữa Local Revision và Cloud Revision (Quyết định 1A & Yêu cầu B)

Trong kiến trúc cũ, `saveCultivationState()` tự tăng `state._rev = (state._rev || 0) + 1` mỗi khi lưu vào `localStorage`. Việc này khiến revision cục bộ bị phụ thuộc vào số lần người dùng thao tác trên máy đó thay vì phản ánh phiên bản dữ liệu trên Cloud, dẫn đến xung đột giả tạo hoặc nhảy cóc revision khi một máy offline nhiều ngày.

Để triển khai **Server-managed Monotonic Revision (Quyết định 1A)** một cách chuẩn mực, hệ thống thiết kế lại toàn bộ mối quan hệ giữa các biến trạng thái:

1. **`localSequenceNumber` (hoặc `localMutationSeq`)**:
   - Là bộ đếm số lần thay đổi dữ liệu cục bộ trong `localStorage`.
   - Mỗi lần gọi `saveCultivationState()` (tăng EXP, đột phá, cắn đan, quy đổi pending seconds), `localSequenceNumber` tăng thêm 1 đơn vị.
   - **Chỉ có ý nghĩa nội bộ tại máy khách**, tuyệt đối không dùng số này để gán vào `rev` của Cloud.
2. **`cloudRevision` (`cloud_rev`)**:
   - Là phiên bản chính thức, duy nhất và có thẩm quyền tối cao do PostgreSQL Server quản lý.
   - Tăng đơn điệu đúng 1 đơn vị ($1, 2, 3, 4\dots$) sau mỗi lần commit thành công qua RPC nguyên tử trên Supabase.
3. **`lastSyncedCloudRev`**:
   - Lưu trong `tcl_sync_ledger.cultivation.lastSyncedRev`.
   - Ghi nhận giá trị `cloudRevision` tại thời điểm thiết bị này đồng bộ thành công gần nhất với Cloud.
4. **`lastSyncedLocalSeq`**:
   - Lưu trong `tcl_sync_ledger.cultivation.lastSyncedLocalSeq`.
   - Ghi nhận giá trị `localSequenceNumber` tại thời điểm thiết bị này đồng bộ thành công gần nhất.
5. **`expectedRevision`**:
   - Concurrency Token mà Client gửi lên RPC trong mỗi request đồng bộ.
   - **Luôn luôn bằng `lastSyncedCloudRev`**. Đây là lời khẳng định của Client: *"Tôi muốn commit dữ liệu mới dựa trên nền tảng Cloud revision này"*.
6. **Trạng thái bẩn (`isDirty`) & Thay đổi chờ đồng bộ (`pendingChanges`)**:
   - Client được xác định là có dữ liệu mới chưa đẩy lên Cloud khi và chỉ khi:
     $$\text{isDirty} = (\text{localSequenceNumber} > \text{lastSyncedLocalSeq}) \lor (\text{localPending} \neq \text{lastSyncedPending})$$

### 1.3. Sơ Đồ Chuyển Đổi Trạng Thái Khi Thiết Bị Offline Tích Lũy Nhiều Thay Đổi

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng (Mobile Offline)
    participant Local as LocalStorage & SyncLedger
    participant Cloud as Supabase PostgreSQL

    Note over Local, Cloud: Trạng thái ban đầu: Cloud rev = 10. Local: lastSyncedCloudRev = 10, localSeq = 5, lastSyncedLocalSeq = 5

    Note over User, Local: 📴 THIẾT BỊ MẤT MẠNG (OFFLINE)
    User->>Local: Thao tác 1: Cắn Đan Dược -> localSeq = 6
    User->>Local: Thao tác 2: Đột phá Cảnh Giới -> localSeq = 7
    User->>Local: Thao tác ...: Đọc truyện tích lũy EXP -> localSeq = 25
    Note over Local: Local tích lũy 20 thay đổi (localSeq: 5 -> 25).<br/>lastSyncedCloudRev VẪN LÀ 10.<br/>isDirty = true (25 > 5).

    Note over User, Local: 🌐 CÓ MẠNG TRỞ LẠI (ONLINE)
    Local->>Cloud: Gọi RPC sync_cultivation_occ(expected_rev = 10, state, idempotency_key)
    Note over Cloud: Server kiểm tra: current_rev (10) == expected_rev (10) -> KHỚP!<br/>Server tăng đơn điệu Cloud rev = 11.<br/>Ghi nhận state mới nhất và last_idempotency_key.
    Cloud-->>Local: Trả về { status: 'SUCCESS', rev: 11 }
    
    Note over Local: Cập nhật sổ đồng bộ:<br/>lastSyncedCloudRev = 11<br/>lastSyncedLocalSeq = 25<br/>isDirty = false.<br/>Toàn bộ 20 thay đổi offline được gom thành 1 commit duy nhất!
```

---

## 2. Kiểm Kê Toàn Bộ Đường Ghi (Inventory of All Write Paths)

Bảng kiểm kê 9 đường ghi và thao tác truy cập dữ liệu tu vi trong mã nguồn Thiên Cơ Lâu:

| STT | Tên Hàm / Thao Tác | Vị Trí Code | Loại Thao Tác | Điều Kiện Kích Hoạt | Dữ Liệu Ghi Nhận (Payload) | Revision Sử Dụng | Rủi Ro Trước Khi Có OCC | Trạng Thái Hiện Tại |
|:---|:---|:---|:---|:---|:---|:---|:---|:---|
| **1** | `runAutoSync()` (Light Phase) | [autoSync.js:655-661](file:///d:/Downloads/dat-antigravity/Thiên%20Cơ%20Lâu/src/lib/sync/autoSync.js#L655-L661) | **REMOTE WRITE** (Supabase `upsert`) | Tự động chạy nền khi khởi động, online, visibility visible, interval 3 phút; khi `!isCloudChanged && isLocalChanged`. | `{ user_id, state: { ...localState, __meta: { pendingSeconds } }, rev: localRev, updated_at, device_id }` | `localRev` (từ `localState._rev`) | **Lost Update (Nghiêm trọng):** Giữa lúc đọc Cloud ở đầu hàm và lúc gọi `upsert`, nếu thiết bị khác đã commit rev mới lên Cloud, lệnh `upsert` vô điều kiện sẽ ghi đè mù toàn bộ tiến độ của thiết bị kia. | **Đang hoạt động (Bắt buộc thay bằng RPC)** |
| **2** | `syncCultivation()` -> `pushLocalCultivation()` | [syncEngine.js:598-614](file:///d:/Downloads/dat-antigravity/Thiên%20Cơ%20Lâu/src/lib/sync/syncEngine.js#L598-L614) | **REMOTE WRITE** (Supabase `upsert`) | Gọi từ SyncPage ("Đồng bộ ngay"), hoặc `mode='local_master'`, hoặc Cloud chưa có dữ liệu, hoặc user chọn giải quyết conflict là `'local'`. | `{ user_id, state: { ...localState, __meta: { pendingSeconds } }, rev: localRev, updated_at, device_id }` | `localRev` | **Stale Write / Lost Update:** `upsert({ ... }, { onConflict: 'user_id' })` không kiểm tra revision trên server tại thời điểm ghi. Nếu 2 thiết bị bấm đồng bộ gần như đồng thời, thiết bị gửi sau sẽ xóa sổ dữ liệu của thiết bị trước. | **Đang hoạt động (Bắt buộc thay bằng RPC)** |
| **3** | `performSync()` | [syncEngine.js:1502](file:///d:/Downloads/dat-antigravity/Thiên%20Cơ%20Lâu/src/lib/sync/syncEngine.js#L1502) | **REMOTE WRITE** (Ủy quyền) | Người dùng nhấn nút đồng bộ toàn diện trên giao diện. | Ủy quyền toàn bộ cho `syncCultivation()`. | `localRev` | Tương tự mục 2. | **Đang hoạt động (Bắt buộc thay bằng RPC)** |
| **4** | `quickPushProgressAndCultivation()` | [autoSync.js:1336-1385](file:///d:/Downloads/dat-antigravity/Thiên%20Cơ%20Lâu/src/lib/sync/autoSync.js#L1336-L1385) | **LOCAL LOG ONLY** *(Trước đây là REMOTE WRITE)* | Khi tab bị ẩn (`visibilitychange=hidden`), trình duyệt đóng (`pagehide`, `beforeunload`). | Không gửi payload lên Cloud. Chỉ ghi log sự kiện `cultivation_quick_push_bypassed`. | Giữ nguyên `localRev`, không tăng `lastSyncedRev`. | **Đã bảo vệ an toàn ở Nhiệm vụ 3A (PR #3):** Không còn rủi ro ghi đè mù Cloud khi đóng tab/ẩn trình duyệt. Giữ nguyên local state và dirty flag để luồng chính xử lý. | **Đã bảo vệ an toàn (Tạm thời)** |
| **5** | `pullCultivationBeforeMeditation()` | [autoSync.js:238-330](file:///d:/Downloads/dat-antigravity/Thiên%20Cơ%20Lâu/src/lib/sync/autoSync.js#L238-L330) | **READ-ONLY** (Cloud) / **LOCAL WRITE** (`localStorage`) | Trước khi mở giao diện Tu Luyện / Thiền Định. | Đọc `cultivation.select()`. Nếu `cloudRev > lastSyncedRev` và `localRev <= lastSyncedRev`, fast-forward ghi đè `localStorage`. | Cập nhật `lastSyncedRev = cloudRev`. | **An toàn:** Hàm chỉ đọc từ Cloud, không phát sinh bất kỳ lệnh ghi nào lên Supabase. Có backup cục bộ trước khi ghi đè. | **Đang hoạt động (An toàn)** |
| **6** | `applyCloudCultivation()` | [syncEngine.js:564](file:///d:/Downloads/dat-antigravity/Thiên%20Cơ%20Lâu/src/lib/sync/syncEngine.js#L564) & [autoSync.js:614](file:///d:/Downloads/dat-antigravity/Thiên%20Cơ%20Lâu/src/lib/sync/autoSync.js#L614) | **LOCAL WRITE ONLY** (`localStorage` & `syncLedger`) | Khi Cloud có revision mới hơn và Local không thay đổi, hoặc khi người dùng chọn nhận Cloud. | Backup local -> Ghi `cloudState` vào `tcl_cultivation_state_real` -> Cập nhật `ledger.cultivation.lastSyncedRev`. | Ghi nhận `cloudRev`. | **An toàn:** Chỉ ghi dữ liệu cục bộ, không gửi lệnh lên Supabase. Tự động backup 3 bản gần nhất. | **Đang hoạt động (An toàn)** |
| **7** | `saveCultivationState()` | [cultivation.js:1241](file:///d:/Downloads/dat-antigravity/Thiên%20Cơ%20Lâu/src/lib/cultivation.js#L1241) | **LOCAL WRITE ONLY** (`localStorage`) | Mọi thao tác tu luyện trong ứng dụng (tăng exp, đột phá, dùng đan dược). | Ghi chuỗi JSON vào `tcl_cultivation_state_real`. | Tăng `localMutationSeq`. | **Không rủi ro Cloud:** Chỉ thao tác trên bộ nhớ client. | **Đang hoạt động** |
| **8** | `performRestore()` | [backupEngine.js:935-960](file:///d:/Downloads/dat-antigravity/Thiên%20Cơ%20Lâu/src/lib/backup/backupEngine.js#L935-L960) | **LOCAL WRITE ONLY** (`localStorage`) | Người dùng chủ động khôi phục dữ liệu từ tệp sao lưu `.json`. | Ghi đè `tcl_cultivation_state_v3` và `cultivation_pending_seconds`. | Tăng `localMutationSeq`. | **Xung đột tiềm ẩn:** Không ghi trực tiếp lên Supabase, nhưng lần `runAutoSync` kế tiếp sẽ kích hoạt OCC và đối chiếu với Cloud. | **Đang hoạt động** |
| **9** | Giải quyết xung đột (`onConflictCultivation`) | [syncEngine.js:664-694](file:///d:/Downloads/dat-antigravity/Thiên%20Cơ%20Lâu/src/lib/sync/syncEngine.js#L664-L694) | **REMOTE WRITE** (nếu chọn `'local'`) | Khi phát hiện xung đột giữa Local và Cloud. | Nếu chọn `'cloud'`: gọi `applyCloudCultivation()`. Nếu chọn `'local'`: gọi force-commit có OCC. | Dùng `conflict_cloud_snapshot.rev` làm `expectedRevision`. | **Cần bảo vệ bằng OCC:** Nếu chọn `'local'`, bắt buộc phải dùng RPC kèm expected revision của Cloud snapshot vừa xem. Tuyệt đối không dùng blind upsert. | **Cần thiết kế lại theo Mục 8** |

---

## 3. Schema Đã Xác Minh & Những Thông Tin Còn Thiếu (Gap Analysis)

### 3.1. Các Trường Đã Xác Minh Qua Mã Nguồn Frontend
Dựa trên các câu lệnh truy vấn `.select('*')` và `.upsert({ ... })` trong `syncEngine.js` và `autoSync.js`, cấu trúc logic của bảng `cultivation` gồm các trường sau:

| Tên Cột | Kiểu Dữ Liệu Frontend | Mục Đích Sử Dụng | Ràng Buộc Quan Sát Được |
|:---|:---|:---|:---|
| `user_id` | `string` (UUID v4) | Khóa định danh người dùng từ Supabase Auth (`session.user.id`). | Sử dụng làm khóa xung đột `onConflict: 'user_id'`. |
| `rev` | `number` (Số nguyên >= 0) | Phiên bản sửa đổi của bản ghi tu vi. Dùng để so sánh độ mới (`cloudRev > lastSyncedRev`). | Client gửi số nguyên `localRev`. |
| `state` | `object` (JSONB) | Snapshot toàn bộ trạng thái tu vi (`realm`, `totalExp`, `_rev`, `_updatedAt`, `inventory`, `readChapterIds`, `__meta: { pendingSeconds }`). | Dữ liệu cấu trúc JSON linh hoạt. |
| `updated_at` | `number` (Timestamp ms) | Thời gian cập nhật do client sinh ra (`Date.now()`). | Sử dụng để so sánh thời gian thay đổi `pending_seconds`. |
| `device_id` | `string` (`dev_...`) | Định danh thiết bị thực hiện ghi dữ liệu gần nhất. | Chuỗi văn bản ASCII. |

### 3.2. Những Thông Tin Bắt Buộc Xác Minh Trước Khi Migration (Missing Schema Details)
Repository hiện tại **KHÔNG chứa tệp DDL migration (`.sql`) tạo bảng `cultivation`** (bảng được khởi tạo trên Supabase Dashboard trước đây). Do đó, các thông số kỹ thuật sau bắt buộc phải được DBA hoặc chủ dự án xác minh trước khi áp dụng SQL:

1. **Kiểu dữ liệu SQL thực tế của các cột:**
   - Cột `rev` trong PostgreSQL là `INTEGER` (4-byte, max 2.1 tỷ) hay `BIGINT` (8-byte)? -> Khuyến nghị migration chuẩn hóa về `BIGINT`.
   - Cột `updated_at` là `BIGINT` (timestamp mili-giây dạng số) hay `TIMESTAMPTZ`? (Frontend truyền `Date.now()`, cần đảm bảo không bị lỗi ép kiểu).
   - Cột `user_id` có ràng buộc khóa ngoại `REFERENCES auth.users(id) ON DELETE CASCADE` hay chỉ là `UUID`/`TEXT` tự do?
2. **Khóa chính và Chỉ mục (Constraints & Indexes):**
   - Bảng có `PRIMARY KEY (user_id)` hay là `id UUID PRIMARY KEY` kết hợp `UNIQUE (user_id)`?
   - Đã có Index B-tree trên cột `user_id` hay chưa?
3. **Cấu hình RLS Policies hiện có:**
   - Bảng `cultivation` đã được `ALTER TABLE cultivation ENABLE ROW LEVEL SECURITY;` hay chưa?
   - Các chính sách SELECT/INSERT/UPDATE hiện hữu đang được viết như thế nào?
4. **Quyền hạn của role `authenticated` trên schema `public`:**
   - Role `authenticated` có quyền tạo bảng/trigger không (thường là không)?
   - Role `authenticated` có quyền `EXECUTE` trên các function mới tạo trong schema `public` không?
5. **Dung lượng trung bình bản ghi `state` JSONB:**
   - Kích thước snapshot hiện tại của người dùng là bao nhiêu KB để định hình giới hạn validation đầu vào (`max_bytes`).

> [!CAUTION]
> **Nguyên tắc an toàn:** Tuyệt đối không tự suy đoán và không chạy các câu lệnh SQL thăm dò trên môi trường Supabase production thật. Việc xác minh phải được thực hiện thông qua tài liệu cấu hình hoặc kiểm tra trên bản sao Staging an toàn.

---

## 4. Nguyên Nhân Race Condition & Lỗ Hổng Client Check (TOCTOU)

### 4.1. Lỗ Hổng TOCTOU (Time-of-Check to Time-of-Use)
Mọi cơ chế kiểm tra trước khi ghi hiện tại của ứng dụng đều diễn ra tại **Client** theo chuỗi 3 bước tách rời:
1. **Check (Kiểm tra):** Client gửi lệnh `SELECT` kéo `cloudCultivation` về máy, so sánh `cloudRev` với `lastSyncedRev`.
2. **Compute (Tính toán):** Nếu client thấy `cloudRev === lastSyncedRev`, client kết luận Cloud chưa bị thay đổi bởi ai khác.
3. **Act (Ghi dữ liệu):** Client gửi lệnh `UPSERT` lên Supabase với dữ liệu mới của mình.

Giữa Bước 1 và Bước 3 luôn tồn tại một **cửa sổ thời gian trễ mạng (Network Window)** kéo dài từ 50ms đến hàng giây. Trong khoảng thời gian này, dữ liệu trên Cloud hoàn toàn không được khóa.

### 4.2. Sơ Đồ Minh Họa Xảy Ra Lost Update

```mermaid
sequenceDiagram
    autonumber
    actor DevA as Thiết bị A (Máy tính)
    participant Cloud as Supabase PostgreSQL (Bảng cultivation)
    actor DevB as Thiết bị B (Điện thoại)

    Note over Cloud: Trạng thái Cloud: rev = 10, totalExp = 1000

    DevA->>Cloud: 1. SELECT (Đọc dữ liệu Cloud)
    Cloud-->>DevA: Trả về rev = 10
    Note over DevA: DevA thấy Cloud rev = 10 (khớp lastSyncedRev)<br/>Tính toán EXP mới: rev = 11, totalExp = 1200

    DevB->>Cloud: 2. SELECT (Đọc dữ liệu Cloud)
    Cloud-->>DevB: Trả về rev = 10
    Note over DevB: DevB cũng thấy Cloud rev = 10<br/>Đột phá cảnh giới mới: rev = 11, realm = 'truc_co_1'

    DevA->>Cloud: 3. UPSERT { rev: 11, totalExp: 1200 } ON CONFLICT (user_id) DO UPDATE
    Note over Cloud: Cloud cập nhật thành công: rev = 11, totalExp = 1200

    DevB->>Cloud: 4. UPSERT { rev: 11, realm: 'truc_co_1' } ON CONFLICT (user_id) DO UPDATE
    Note over Cloud: ⚠️ NGUY HIỂM: PostgreSQL thực hiện DO UPDATE vô điều kiện!<br/>Ghi đè bản ghi của DevA. Cloud giữ rev = 11, realm = 'truc_co_1'.<br/>Toàn bộ 200 EXP của DevA bị MẤT HOÀN TOÀN (Lost Update)!
    Cloud-->>DevB: Thành công (HTTP 200 / 201)
```

- **Kết luận:** Mệnh đề `ON CONFLICT (user_id) DO UPDATE` là **ghi đè mù (Blind Overwrite)**. Việc kiểm tra ở Client trước khi UPSERT **không thể giải quyết race condition**. OCC bắt buộc phải kiểm tra điều kiện nguyên tử tại Database ngay trong cùng câu lệnh cập nhật.

---

## 5. Giải Pháp Ngăn Chặn Client Cũ Bypass OCC (Yêu Cầu A)

### 5.1. Nguy Cơ Client Cũ Ghi Đè Mù (The Legacy Client Bypass Threat)
Khi triển khai cơ chế OCC mới qua RPC, một rủi ro chí mạng phát sinh:
- Người dùng có một thiết bị (ví dụ tab trình duyệt trên điện thoại) đang mở mã nguồn cũ chưa tải lại bundle mới.
- Thiết bị cũ này không biết đến RPC `sync_cultivation_occ`. Nó tiếp tục chạy mã nguồn cũ và gọi trực tiếp:
  ```javascript
  supabase.from('cultivation').upsert({ user_id, state, rev, updated_at, device_id }, { onConflict: 'user_id' });
  ```
- Nếu Database vẫn mở quyền ghi trực tiếp cho role `authenticated`, câu lệnh `upsert` này sẽ **bỏ qua hoàn toàn cơ chế OCC**, thực hiện ghi đè mù và phá hủy toàn bộ dữ liệu đã được bảo vệ bởi thiết bị mới!

### 5.2. So Sánh Các Phương Án Bảo Vệ Tầng Database

| Tiêu Chí | Phương Án 1: Phân Quyền GRANT/REVOKE (Khuyến nghị chuẩn mực) ⭐ | Phương Án 2: Database Trigger Chặn Direct Writes |
|:---|:---|:---|
| **Cơ chế** | Thu hồi quyền `INSERT, UPDATE, DELETE` trên bảng `cultivation` đối với role `authenticated` và `anon`. Chỉ giữ quyền `SELECT`. Chỉ cấp quyền `EXECUTE` function RPC cho `authenticated`. | Tạo Trigger `BEFORE INSERT OR UPDATE` kiểm tra cờ session (ví dụ `current_setting('app.via_occ_rpc', true)`). Nếu không có cờ, ném `RAISE EXCEPTION`. |
| **Tính triệt để** | **100% Triệt để:** Được thực thi ở tầng nhân PostgreSQL (Kernel permission check). Không một câu lệnh REST API nào có thể lách qua. | Triệt để, nhưng phụ thuộc vào việc hàm RPC phải set cờ session trước khi ghi. |
| **Hiệu năng** | **Tối ưu:** Kiểm tra quyền một lần khi lập kế hoạch truy vấn, 0% overhead CPU lúc thực thi. | Tốn thêm chi phí CPU chạy hàm trigger trên từng dòng dữ liệu được ghi. |
| **Phản hồi cho Client cũ** | PostgREST trả về HTTP 403 Forbidden với mã lỗi PostgreSQL `42501 permission denied for table cultivation`. Code client cũ sẽ bắt lỗi an toàn qua `catch` block, không xóa dữ liệu cục bộ. | PostgREST trả về HTTP 400 Bad Request kèm message lỗi từ trigger. |

### 5.3. Thiết Kế Phương Án Khuyến Nghị (GRANT/REVOKE Encasulation)

> [!NOTE]
> Đoạn mã dưới đây là đặc tả phân quyền mẫu phục vụ thiết kế, **CHƯA ĐƯỢC CHẠY TRÊN DATABASE PRODUCTION**.

```sql
-- ĐẶC TẢ PHÂN QUYỀN KHÓA CHẶT ĐƯỜNG GHI TRỰC TIẾP (PSEUDOCODE)
-- 1. Cho phép client đọc dữ liệu tu vi qua PostgREST SELECT thông thường
GRANT SELECT ON TABLE public.cultivation TO authenticated;

-- 2. TƯỚC BỎ TOÀN BỘ QUYỀN GHI TRỰC TIẾP CỦA CLIENT TRÊN BẢNG
REVOKE INSERT, UPDATE, DELETE ON TABLE public.cultivation FROM anon, authenticated;

-- 3. CHỈ CHO PHÉP GHI DỮ LIỆU DUY NHẤT THÔNG QUA HÀM RPC OCC ĐƯỢC ỦY QUYỀN
GRANT EXECUTE ON FUNCTION public.sync_cultivation_occ TO authenticated;
```

**Cơ chế Fail-Safe của Client cũ:**
Khi client cũ gọi `.from('cultivation').upsert()`, Supabase PostgREST sẽ từ chối với lỗi `42501`. Trong mã nguồn client cũ ([autoSync.js:672](file:///d:/Downloads/dat-antigravity/Thiên%20Cơ%20Lâu/src/lib/sync/autoSync.js#L672)):
```javascript
if (!cultUpsertErr) {
  // Chỉ cập nhật ledger nếu ghi thành công
  ledger.cultivation = { lastSyncedRev: localRev, ... };
} else {
  console.warn('Lỗi upsert tu vi lên cloud:', cultUpsertErr.message);
  errors.push(`Lỗi cập nhật tu vi lên cloud: ${cultUpsertErr.message}`);
}
```
Client cũ bắt được lỗi, ghi nhận cảnh báo và **KHÔNG cập nhật `lastSyncedRev`**, **KHÔNG xóa dữ liệu cục bộ**. Dữ liệu Cloud được bảo vệ nguyên vẹn 100% khỏi việc bị ghi đè mù.

---

## 6. Thiết Kế Được Đề Xuất: RPC Nguyên Tử `sync_cultivation_occ`

### 6.1. Quy Trình Xử Lý Nguyên Tử Trong Database
Đặc tả kỹ thuật hàm RPC `public.sync_cultivation_occ` xử lý trọn vẹn trong một giao dịch nguyên tử (ACID transaction) với các bước:

```mermaid
flowchart TD
    Start(["Client gọi RPC: sync_cultivation_occ(\nexpected_rev, payload_state, updated_at,\ndevice_id, idempotency_key\n)"]) --> AuthCheck{"auth.uid() có hợp lệ không?"}
    
    AuthCheck -- Không --> ReturnAuthErr["Trả về ERROR: UNAUTHORIZED (401)"]
    AuthCheck -- Có --> InputVal{"Kiểm tra Input Validation:\n- expected_rev >= 0\n- size(payload_state) <= 512KB\n- idempotency_key hợp lệ"}
    
    InputVal -- Không hợp lệ --> ReturnBadInput["Trả về ERROR: INVALID_INPUT (400)"]
    InputVal -- Hợp lệ --> LockRow["Khóa dòng người dùng độc quyền:\nSELECT * FROM cultivation WHERE user_id = auth.uid() FOR UPDATE"]
    
    LockRow --> CheckExist{"Bản ghi đã tồn tại chưa?"}
    
    CheckExist -- "Chưa tồn tại (First Insert)" --> CheckFirstRev{"expected_rev có là 0 hoặc NULL?"}
    CheckFirstRev -- "Sai (expected > 0)" --> ReturnConflictNotFound["Trả về CONFLICT: ROW_NOT_FOUND"]
    CheckFirstRev -- "Đúng (First Onboarding)" --> DoInsert["INSERT INTO cultivation (\nuser_id, rev=1, state, updated_at,\ndevice_id, last_idempotency_key, last_request_at\n) VALUES (...) ON CONFLICT (user_id) DO NOTHING"]
    DoInsert --> CheckInsertSuccess{"Insert thành công?"}
    CheckInsertSuccess -- "Có (Thắng First Insert)" --> ReturnSuccessFirst["Trả về SUCCESS: rev = 1"]
    CheckInsertSuccess -- "Không (Máy khác vừa chèn trước)" --> FetchNewRow["SELECT lại dòng vừa được chèn"]
    FetchNewRow --> ReturnConflictConcurrent["Trả về CONFLICT: CONCURRENT_FIRST_INSERT\nkèm current_cloud để so sánh"]
    
    CheckExist -- "Đã tồn tại" --> CheckIdempotent{"v_row.last_idempotency_key == p_idempotency_key?"}
    CheckIdempotent -- "Trùng Idempotency Key" --> ReturnIdempotentReplay["Trả về SUCCESS: rev = v_row.rev\n(IDEMPOTENT_REPLAY, không ghi lại)"]
    
    CheckIdempotent -- "Key mới" --> CheckRevMatch{"v_row.rev == p_expected_rev?"}
    CheckRevMatch -- "Lệch Revision (Mismatch)" --> ReturnConflictRev["Trả về CONFLICT: REV_MISMATCH\nkèm current_cloud snapshot để đối chiếu"]
    
    CheckRevMatch -- "Khớp Revision" --> DoUpdate["UPDATE cultivation SET\nrev = v_row.rev + 1,\nstate = p_payload_state,\nupdated_at = p_updated_at,\ndevice_id = p_device_id,\nlast_idempotency_key = p_idempotency_key,\nlast_request_at = p_updated_at\nWHERE user_id = auth.uid()"]
    DoUpdate --> ReturnSuccessUpdate["Trả về SUCCESS: rev = v_row.rev + 1"]
```

### 6.2. Cơ Chế Idempotency & Request ID (Yêu Cầu D)
Theo yêu cầu nghiêm ngặt của Người dùng: **Tuyệt đối không được xem cùng `device_id` hoặc cùng `rev` là bằng chứng chắc chắn một request đã commit thành công.**

Hệ thống thiết kế cơ chế **Idempotency Key độc lập (UUID v4 do client sinh cho mỗi lượt sync)**:
- Mỗi khi client chuẩn bị gửi một request đồng bộ, client sinh ra một `idempotency_key = crypto.randomUUID()`.
- Cơ sở dữ liệu lưu trữ `last_idempotency_key` và `last_request_at` trực tiếp trên bản ghi `cultivation`.

#### Phân Tích Kịch Bản Sự Cố Mạng 4 Bước:
1. **Bước 1:** Database commit thành công dữ liệu của Client A, tăng Cloud rev từ $10 \to 11$, lưu `last_idempotency_key = req_A_123`.
2. **Bước 2:** Mạng kết nối bị ngắt đột ngột (Network drop / Timeout) ngay sau khi commit nhưng trước khi Client A nhận được gói tin phản hồi HTTP.
3. **Bước 3:** Client A rơi vào timeout, tự động retry gửi lại request với cùng `expected_rev = 10` và cùng `idempotency_key = req_A_123`.
4. **Bước 4 (Đối chiếu tại Database):**
   - **Trường hợp 4.1 (Không có thiết bị khác xen vào):**
     - Database thấy `current_rev = 11` (khác `expected_rev = 10`), NHƯNG kiểm tra thấy `last_idempotency_key === req_A_123`.
     - Database nhận diện đây chính xác là request vừa được thực hiện thành công của chính Client A bị mất gói tin phản hồi!
     - Database trả về ngay: `{ status: 'SUCCESS', rev: 11, updated_at, idempotent_replay: true }`.
     - Client A nhận được kết quả thành công, cập nhật `lastSyncedCloudRev = 11`, xóa cờ dirty. Hệ thống phục hồi hoàn hảo mà không sinh lỗi giả!
   - **Trường hợp 4.2 (Có Thiết bị B đã xen vào commit thành công giữa lúc A retry):**
     - Thiết bị B đã commit làm Cloud rev tăng lên 12, và ghi đè `last_idempotency_key = req_B_456`.
     - Khi Client A retry gửi `expected_rev = 10` và `idempotency_key = req_A_123`:
     - Database kiểm tra thấy `current_rev = 12 != 10` VÀ `last_idempotency_key (req_B_456) != req_A_123`.
     - Database **TỪ CHỐI** yêu cầu của A, trả về: `{ status: 'CONFLICT', reason: 'REV_MISMATCH', current_cloud: { rev: 12, ... } }`.
     - Client A không thể vô tình ghi đè dữ liệu của B! Client A nhận diện được Cloud đã có thay đổi mới từ B và kích hoạt giao diện so sánh xung đột cho người dùng.

### 6.3. An Toàn Thực Thi RPC & RLS (Yêu Cầu E)
Mô hình bảo vệ Defense-in-Depth cho RPC:
1. **`SECURITY DEFINER` và Quyền Sở Hữu:**
   - Hàm được tạo với quyền sở hữu thuộc về superuser tin cậy (`postgres`).
   - Mặc định thu hồi toàn bộ quyền chạy hàm từ role public: `REVOKE EXECUTE ON FUNCTION public.sync_cultivation_occ FROM PUBLIC;`.
   - Chỉ cấp quyền chạy hàm cho người dùng đã đăng nhập: `GRANT EXECUTE ON FUNCTION public.sync_cultivation_occ TO authenticated;`.
2. **Ngăn chặn Search Path Hijacking:**
   - Hàm bắt buộc khai báo cố định: `SET search_path = public, pg_temp;`. Ngăn chặn kẻ tấn công tạo các bảng hoặc hàm giả mạo trong schema khác nhằm chiếm quyền thực thi.
3. **Kiểm tra danh tính `auth.uid()` bắt buộc:**
   - Database tự động trích xuất `v_user_id := auth.uid();`.
   - Nếu `v_user_id IS NULL`, lập tức trả về lỗi `UNAUTHORIZED`. Tuyệt đối không nhận tham số `user_id` từ client gửi lên để ngăn chặn việc người dùng A ghi đè tu vi của người dùng B.
4. **Input Validation nghiêm ngặt:**
   - Kiểm tra `p_expected_rev >= 0`.
   - Kiểm tra kích thước payload JSON: `octet_length(p_state::text) <= 524288` (giới hạn tối đa 512KB để chống tấn công làm cạn kiệt bộ nhớ database).
   - Kiểm tra `p_idempotency_key IS NOT NULL AND length(p_idempotency_key) <= 64`.
5. **Xử lý First Insert Race (Quyết định 4A):**
   - Thiết bị gửi lệnh insert đầu tiên thành công sẽ khởi tạo bản ghi Cloud với rev = 1.
   - Thiết bị thứ hai gửi insert cùng lúc sẽ gặp lệnh `ON CONFLICT (user_id) DO NOTHING` -> Hàm phát hiện không insert được, lập tức đọc lại bản ghi vừa được tạo và trả về mã `CONFLICT` kèm snapshot để thiết bị thứ hai kích hoạt màn hình đối chiếu dữ liệu cho người dùng.

### 6.4. Đặc Tả Kỹ Thuật SQL RPC Mẫu (Technical Specification Pseudocode)

> [!NOTE]
> Đoạn mã dưới đây là **đặc tả kỹ thuật mẫu (Pseudocode)** phục vụ thiết kế kiến trúc, **CHƯA ĐƯỢC CHẠY TRÊN DATABASE PRODUCTION**.

```sql
-- ĐẶC TẢ THIẾT KẾ RPC: sync_cultivation_occ (PSEUDOCODE / KHÔNG TỰ ĐỘNG THỰC THI)
CREATE OR REPLACE FUNCTION public.sync_cultivation_occ(
    p_expected_rev BIGINT,
    p_state JSONB,
    p_updated_at BIGINT,
    p_device_id TEXT,
    p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_current_row public.cultivation%ROWTYPE;
    v_new_rev BIGINT;
BEGIN
    -- 1. Xác thực người dùng qua Supabase Auth session token
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'status', 'ERROR',
            'code', 'UNAUTHORIZED',
            'message', 'Yêu cầu đăng nhập hợp lệ để đồng bộ tu vi.'
        );
    END IF;

    -- 2. Kiểm tra tính hợp lệ của dữ liệu đầu vào (Input Validation)
    IF p_expected_rev < 0 OR p_idempotency_key IS NULL OR length(p_idempotency_key) > 64 THEN
        RETURN jsonb_build_object(
            'status', 'ERROR',
            'code', 'INVALID_INPUT',
            'message', 'Tham số expected_rev hoặc idempotency_key không hợp lệ.'
        );
    END IF;

    IF octet_length(p_state::text) > 524288 THEN
        RETURN jsonb_build_object(
            'status', 'ERROR',
            'code', 'PAYLOAD_TOO_LARGE',
            'message', 'Kích thước dữ liệu tu vi vượt quá giới hạn an toàn (512KB).'
        );
    END IF;

    -- 3. Khóa dòng dữ liệu của user để kiểm tra và cập nhật nguyên tử
    SELECT * INTO v_current_row
    FROM public.cultivation
    WHERE user_id = v_user_id
    FOR UPDATE;

    -- 4. Trường hợp 1: Bản ghi chưa tồn tại trên Cloud (First-time Onboarding)
    IF NOT FOUND THEN
        IF p_expected_rev > 0 THEN
            RETURN jsonb_build_object(
                'status', 'CONFLICT',
                'reason', 'ROW_NOT_FOUND',
                'current_cloud', NULL
            );
        END IF;

        -- Khởi tạo bản ghi đầu tiên với rev = 1 (Quyết định 4A: Máy đến trước thắng)
        INSERT INTO public.cultivation (
            user_id, rev, state, updated_at, device_id, last_idempotency_key, last_request_at
        ) VALUES (
            v_user_id, 1, p_state, p_updated_at, p_device_id, p_idempotency_key, p_updated_at
        )
        ON CONFLICT (user_id) DO NOTHING;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'status', 'SUCCESS',
                'rev', 1,
                'updated_at', p_updated_at,
                'is_first_insert', true
            );
        ELSE
            -- Máy khác vừa chèn trước trong tích tắc -> Trả về CONFLICT để đối chiếu
            SELECT * INTO v_current_row FROM public.cultivation WHERE user_id = v_user_id;
            RETURN jsonb_build_object(
                'status', 'CONFLICT',
                'reason', 'CONCURRENT_FIRST_INSERT',
                'current_cloud', jsonb_build_object(
                    'rev', v_current_row.rev,
                    'state', v_current_row.state,
                    'updated_at', v_current_row.updated_at,
                    'device_id', v_current_row.device_id
                )
            );
        END IF;
    END IF;

    -- 5. Trường hợp 2: Kiểm tra Idempotency Replay (Mất kết nối mạng ở client)
    IF v_current_row.last_idempotency_key IS NOT NULL AND v_current_row.last_idempotency_key = p_idempotency_key THEN
        RETURN jsonb_build_object(
            'status', 'SUCCESS',
            'rev', v_current_row.rev,
            'updated_at', v_current_row.updated_at,
            'idempotent_replay', true
        );
    END IF;

    -- 6. Trường hợp 3: Kiểm tra Expected Revision (Cốt lõi OCC)
    IF v_current_row.rev != p_expected_rev THEN
        RETURN jsonb_build_object(
            'status', 'CONFLICT',
            'reason', 'REV_MISMATCH',
            'expected_rev', p_expected_rev,
            'current_cloud', jsonb_build_object(
                'rev', v_current_row.rev,
                'state', v_current_row.state,
                'updated_at', v_current_row.updated_at,
                'device_id', v_current_row.device_id
            )
        );
    END IF;

    -- 7. Trường hợp 4: Revision hoàn toàn khớp -> Tăng đơn điệu rev và cập nhật nguyên tử
    v_new_rev := v_current_row.rev + 1;

    UPDATE public.cultivation
    SET rev = v_new_rev,
        state = p_state,
        updated_at = p_updated_at,
        device_id = p_device_id,
        last_idempotency_key = p_idempotency_key,
        last_request_at = p_updated_at
    WHERE user_id = v_user_id;

    RETURN jsonb_build_object(
        'status', 'SUCCESS',
        'rev', v_new_rev,
        'updated_at', p_updated_at
    );
END;
$$;
```

---

## 7. Cơ Chế Quản Lý `pending_seconds` (Yêu Cầu C & Quyết Định 2B)

Theo **Quyết định 2B**, tạm thời quản lý `pending_seconds` dưới cùng cơ chế Concurrency Control với tu vi (tăng phiên bản Cloud khi thay đổi).

### 7.1. Chu Trình Tích Lũy Và Quy Đổi `pending_seconds`
1. **Tích lũy khi đọc truyện:**
   - Trong quá trình đọc truyện, `cultivation_pending_seconds` tăng dần trong `localStorage`.
   - Để tránh việc ghi đĩa liên tục gây suy giảm hiệu năng trình duyệt, giá trị này chỉ được lưu vào `localStorage` theo nhịp chuyển chương hoặc debounce.
2. **Kiểm soát tần suất ghi lên Cloud (Rate-Limiting & Throttling):**
   - Nếu `localSequenceNumber` chưa tăng (người dùng chưa cắn đan hay đột phá), mà chỉ có `pending_seconds` tăng: Client áp dụng rate-limit **tối thiểu 60 giây/lần** mới kích hoạt đẩy ngầm lên Cloud.
   - Khi người dùng thoát trang đọc hoặc đổi sang truyện khác, hàm `flushReadingProgress` sẽ thực hiện flush đồng thời tiến độ đọc và `pending_seconds`.
3. **Quy đổi `pending_seconds` thành EXP (Meditation / Claim):**
   - Khi người dùng vào màn hình Tu Luyện và nhấn "Luyện Hóa EXP" hoặc hệ thống tự động quy đổi:
     - `pending_seconds` được trừ về `0` cục bộ.
     - `localState.totalExp` được cộng thêm số EXP tương ứng.
     - `localSequenceNumber` tăng thêm 1 đơn vị.
     - Lần sync kế tiếp sẽ gửi toàn bộ state mới (EXP cao hơn) kèm `pendingSeconds: 0` lên Cloud trong cùng một payload nguyên tử.
4. **Ngăn chặn cộng trùng lặp (Anti-Duplication) khi có 2 thiết bị:**
   - Khi Device A và Device B cùng đọc truyện:
     - Device A đọc 300s -> đẩy lên Cloud thành công (Cloud rev tăng từ $10 \to 11$, pending = 300s).
     - Device B đọc 400s -> gửi với expected_rev = 10 -> **Bị Server từ chối (`CONFLICT`)**.
     - Hệ thống **tuyệt đối không tự động cộng dồn** $300 + 400 = 700s$ (vì có thể người dùng mở 2 máy cùng đọc song song một chương truyện). Thay vào đó, xung đột được ghi nhận để người dùng kiểm tra hoặc Device B fast-forward lấy số lớn hơn có xác nhận.

### 7.2. Điều Kiện Chứng Minh Tính Nguyên Tử Nếu Đề Xuất Sub-Revision Trong Tương Lai
Nếu trong tương lai hệ thống muốn tối ưu tách `pending_seconds` không làm tăng rev chính của tu vi, kiến trúc bắt buộc phải thỏa mãn 3 điều kiện toán học độc lập:
1. **Tách biệt cột lưu trữ:** Bảng `cultivation` phải tách thành 2 cột độc lập: `state JSONB` (quản lý bởi `cultivation_rev BIGINT`) và `pending_seconds BIGINT` (quản lý bởi `pending_rev BIGINT`).
2. **RPC độc lập:** Tạo hàm `sync_pending_seconds_occ(p_expected_pending_rev, p_pending_seconds)` chỉ cập nhật duy nhất 2 cột trên, không khóa và không can thiệp vào `state`.
3. **Không phụ thuộc chéo (Decoupled Invariants):** Thao tác quy đổi pending thành EXP bắt buộc phải là một transaction gộp khóa cả hai revision (`cultivation_rev` và `pending_rev`) cùng lúc để đảm bảo tính toàn vẹn (không thể có chuyện EXP đã cộng mà pending chưa bị trừ).

---

## 8. Phương Án Xử Lý Xung Đột (Yêu Cầu F & Quyết Định 3A)

### 8.1. Trạng Thái Xung Đột Bền Vững & Giao Diện Cảnh Báo (Quyết định 3A)
Theo **Quyết định 3A**, khi phát hiện xung đột OCC, hệ thống sẽ:
1. **Không chặn việc đọc truyện:** Không hiển thị modal popup ép buộc giải quyết ngay lập tức. Người dùng vẫn có thể đọc truyện bình thường.
2. **Lưu trạng thái xung đột bền vững:**
   - Khi nhận `CONFLICT`, client ghi nhận toàn bộ thông tin vào `localStorage.setItem('tcl_cultivation_conflict_state', JSON.stringify({ localSnapshot, cloudSnapshot, detectedAt }))`.
   - Dù người dùng F5, đóng trình duyệt hay chuyển tab, trạng thái xung đột vẫn được lưu giữ nguyên vẹn, không bị mất đi.
3. **Hiển thị Banner cảnh báo nhẹ:**
   - Hiển thị thanh Banner màu vàng/hổ phách thanh thoát ở góc trên màn hình hoặc trên thanh trạng thái: *"Phát hiện tu vi giữa thiết bị này và Cloud chưa đồng nhất. Nhấn vào đây để xem so sánh và dung hợp."*
4. **Bảo vệ chống vòng lặp (Sync Loop Prevention):**
   - Đặt cờ `ledger.cultivation.conflictPending = true`.
   - Trong các chu kỳ `runAutoSync` ngầm kế tiếp (định kỳ 3 phút hay khi đổi tab), hệ thống **bỏ qua việc tự động thử push tu vi**, chỉ thực hiện đồng bộ tiến độ đọc truyện và thư viện.

### 8.2. Xử Lý Lựa Chọn "Giữ Bản Trên Máy Này" (Force Push Có Bảo Vệ)
Người dùng chỉ đạo: **Khi người dùng chọn “Giữ bản trên máy này”, không được gửi `expected_rev` cũ mà không kiểm tra lại.**

Quy trình giải quyết xung đột khi người dùng chọn "Giữ bản trên máy này":
1. **Lưu sao lưu an toàn trước tiên:** Tự động tạo bản sao lưu cục bộ bền vững `tcl_cultivation_backup_<timestamp>` chứa toàn bộ `localState` và `cloudSnapshot`.
2. **Kiểm tra Concurrency Token mới:**
   - Client **KHÔNG** gửi `expected_rev` cũ (rev 10).
   - Client lấy chính `rev` của Cloud Snapshot vừa được hiển thị trên hộp thoại (ví dụ: `cloudSnapshot.rev = 11`) làm `expected_rev` cho lượt ghi đè này.
3. **Chống Race Condition trong thời gian người dùng suy nghĩ:**
   - Giả sử trong 2 phút người dùng đang đọc bảng so sánh trên hộp thoại, một thiết bị C khác lại vừa đẩy thêm một revision mới nữa lên Cloud làm Cloud nhảy từ $11 \to 12$.
   - Khi người dùng bấm "Xác nhận giữ bản máy này", client gửi `expected_rev = 11`.
   - Database kiểm tra thấy `current_rev = 12 != 11` -> **TIẾP TỤC TỪ CHỐI (`CONFLICT`)**.
   - Client nhận mã lỗi, cập nhật lại Cloud snapshot mới nhất (rev 12) lên hộp thoại và thông báo cho người dùng: *"Dữ liệu Cloud vừa có thay đổi mới từ thiết bị khác trong lúc bạn đang thao tác. Vui lòng kiểm tra lại trước khi xác nhận."*
   - **Cam kết:** Tuyệt đối không bao giờ xảy ra tình trạng ghi đè mù âm thầm.

---

## 9. Kế Hoạch Triển Khai, Tương Thích Ngược & Rollback Thực Tế (Yêu Cầu G)

### 9.1. Tại Sao `DROP FUNCTION` Không Phải Là Rollback An Toàn?
Đặc biệt lưu ý theo phản biện kiến trúc:
- Nếu frontend phiên bản mới đã phát hành và hàng ngàn client đang gọi `client.rpc('sync_cultivation_occ')`, việc chạy lệnh `DROP FUNCTION sync_cultivation_occ` trên database sẽ khiến toàn bộ các client này lập tức nhận lỗi PostgREST `PGRST202 (Could not find the function sync_cultivation_occ)`.
- Kết quả: Toàn bộ hệ thống đồng bộ tu vi của người dùng sẽ bị sụp đổ (hard failure), sinh ra hàng loạt báo lỗi trên giao diện.
- Trình duyệt người dùng cache mã nguồn JavaScript (Vite bundle). Dù có sửa code frontend, các tab đang mở vẫn tiếp tục gọi RPC cũ cho đến khi người dùng reload trang.

### 9.2. Kế Hoạch Rollout 3 Giai Đoạn (Phased Rollout)
1. **Giai đoạn 1 (Database Migration):**
   - Triển khai function `sync_cultivation_occ` trên Supabase PostgreSQL.
   - Vẫn giữ nguyên quyền `GRANT INSERT, UPDATE` trên bảng `cultivation` (chưa thu hồi) để các client cũ chưa kịp cập nhật vẫn hoạt động tạm thời.
2. **Giai đoạn 2 (Frontend Deployment với Graceful Degradation):**
   - Triển khai mã nguồn Frontend mới hỗ trợ gọi RPC `sync_cultivation_occ`.
   - Nếu RPC gặp lỗi hệ thống (mạng đứt, lỗi cú pháp): Client rơi vào chế độ **Safe Degraded Mode (CHỈ ĐỌC, giữ dirty state cục bộ, tuyệt đối KHÔNG fallback sang blind upsert)**.
3. **Giai đoạn 3 (Khóa Chặt Quyền Ghi Trực Tiếp - Hardening):**
   - Sau khi theo dõi log thấy 98%+ lượng request đã chuyển sang dùng RPC, thực hiện lệnh `REVOKE INSERT, UPDATE ON cultivation FROM authenticated`.
   - Chấm dứt vĩnh viễn nguy cơ ghi đè mù từ client cũ.

### 9.3. Kế Hoạch Rollback Khẩn Cấp (Circuit Breaker / Safe Maintenance)
Nếu phát hiện hàm RPC phát sinh lỗi logic nghiêm trọng trên Production:
- **Tuyệt đối KHÔNG chạy DROP FUNCTION.**
- Thay vào đó, áp dụng cơ chế **Circuit Breaker** bằng cách cập nhật nội dung hàm RPC sang chế độ bảo trì an toàn:
  ```sql
  -- LỆNH ROLLBACK AN TOÀN: CHUYỂN HÀM SANG SAFE MAINTENANCE MODE
  CREATE OR REPLACE FUNCTION public.sync_cultivation_occ(...)
  RETURNS JSONB AS $$
  BEGIN
      RETURN jsonb_build_object(
          'status', 'MAINTENANCE',
          'code', 'SYNC_PAUSED',
          'message', 'Hệ thống đồng bộ tu vi đang tạm bảo trì nâng cấp. Toàn bộ tu vi trên máy của bạn được bảo lưu an toàn 100% và sẽ tự động đồng bộ khi bảo trì hoàn tất.'
      );
  END;
  $$ LANGUAGE plpgsql;
  ```
- **Tác dụng:** Mọi client gọi RPC đều nhận được phản hồi lịch sự `MAINTENANCE`. Client sẽ giữ nguyên dữ liệu trong `localStorage`, không xóa dirty flag, không báo lỗi đỏ màn hình, và tự động thử lại sau. Cloud không bị thay đổi bất kỳ byte nào.
- Khi sự cố được sửa chữa xong, chạy script cập nhật lại logic RPC chuẩn và hệ thống tự động hoạt động bình thường trở lại.

### 9.4. Kế Hoạch Backup Dữ Liệu Trước Khi Migration
Trước khi thực hiện bất kỳ lệnh DDL nào trên Supabase production:
1. Thực hiện xuất toàn bộ dữ liệu bảng `cultivation` ra tệp sao lưu:
   ```bash
   # Sao lưu toàn bộ bảng cultivation trước migration
   supabase db dump --table cultivation > backup_cultivation_pre_occ_$(date +%Y%m%d).sql
   ```
2. Lưu bản sao lưu an toàn tại kho lưu trữ độc lập để có thể khôi phục trong tình huống xấu nhất.

---

## 10. Đánh Giá Hiệu Năng & Độ Tin Cậy Dựa Trên Đo Lường Thực Tế (Yêu Cầu H)

Theo yêu cầu nghiêm ngặt của Người dùng, loại bỏ toàn bộ các khẳng định cảm tính chưa kiểm chứng ("chắc chắn 1-3ms", "an toàn tuyệt đối"). Thay bằng các giả thuyết kỹ thuật có thể định lượng và tiêu chí nghiệm thu rõ ràng:

### 10.1. Các Giả Thuyết Kỹ Thuật Cần Đo Lường
1. **Thời gian thực thi của RPC (Database Latency):**
   - *Giả thuyết:* Do truy vấn theo Khóa chính `user_id` có chỉ mục B-tree độc quyền và bảng chỉ chứa 1 dòng per user, thời gian thực thi nội bộ PostgreSQL kỳ vọng đạt:
     - Median (p50): $< 10\text{ ms}$
     - 95th Percentile (p95): $< 50\text{ ms}$
   - *Phương pháp đo lường:* Cần đo trực tiếp trên môi trường Staging thông qua extension `pg_stat_statements` của PostgreSQL và bảng điều khiển Supabase Database Performance.
2. **Thời gian giữ Row-level Lock (`FOR UPDATE` Duration):**
   - *Giả thuyết:* Transaction chỉ thực hiện 1 câu lệnh SELECT và 1 câu lệnh UPDATE trên cùng 1 dòng, thời gian giữ khóa độc quyền kỳ vọng $< 5\text{ ms}$.
   - *Phương pháp kiểm chứng:* Chạy kịch bản 50 worker đồng thời trên Staging để theo dõi chỉ số `pg_locks` và xác nhận không có Deadlock xảy ra.
3. **Mức độ tương thích Connection Pooler:**
   - *Giả thuyết:* Supabase Supavisor ở chế độ Transaction Pooler hoàn toàn tương thích do hàm RPC hoàn tất trong một transaction đơn lẻ. Cần kiểm chứng qua load test 100 request/giây trên Staging.

### 10.2. Tiêu Chí Nghiệm Thu Cụ Thể (Acceptance Criteria)
Một giải pháp OCC chỉ được xem là đạt chuẩn triển khai khi thỏa mãn đầy đủ các chỉ số định lượng sau trên Staging:
- **Tỷ lệ Lost Update:** Đạt chính xác **$0\%$** trong bài kiểm thử 2 thiết bị ghi đồng thời 100 lần.
- **Tỷ lệ lỗi 5xx:** Đạt $< 0.01\%$ trong điều kiện mạng bình thường.
- **Thời gian phản hồi đầu cuối (Client End-to-End Latency p95):** $< 350\text{ ms}$ (bao gồm cả độ trễ mạng).
- **Tính trọn vẹn của Idempotency:** $100\%$ các request retry có cùng `idempotency_key` phải nhận lại kết quả thành công mà không làm tăng revision lần thứ hai.

---

## 11. Bảng Đánh Giá Rủi Ro Còn Lại (Risk Assessment Matrix)

Bảng tổng hợp toàn diện ma trận rủi ro của hệ thống đồng bộ tu vi:

| Phân Nhóm Rủi Ro | Rủi Ro Cụ Thể | Rủi Ro Đã Có Thiết Kế Xử Lý | Rủi Ro Chưa Giải Quyết / Cần Theo Dõi | Thông Tin Schema Cần Xác Minh & Điều Kiện Bắt Buộc Trước Migration |
|:---|:---|:---|:---|:---|
| **1. Concurrency & Lost Update** | Hai thiết bị cùng đọc một revision và cùng ghi đè lên Cloud. | **ĐÃ XỬ LÝ TRIỆT ĐỂ:** Khóa dòng nguyên tử `FOR UPDATE` trong RPC `sync_cultivation_occ`. Máy đến sau bị từ chối với mã `CONFLICT` rõ ràng. | Cần theo dõi trải nghiệm người dùng khi tần suất xung đột tăng cao nếu họ dùng 2 máy liên tục. | **Bắt buộc:** Bảng `cultivation` phải có Unique Index hoặc Primary Key trên cột `user_id`. |
| **2. Legacy Client Bypass** | Thiết bị chạy frontend cũ tiếp tục gọi direct `upsert` ghi đè mù Cloud. | **ĐÃ XỬ LÝ TRIỆT ĐỂ:** Thu hồi quyền ghi trực tiếp `REVOKE INSERT, UPDATE ON cultivation FROM authenticated;` chỉ cho phép ghi qua RPC. | Client cũ sẽ bị lỗi 403 khi cố ghi trực tiếp (nhưng an toàn, không mất dữ liệu local). | **Bắt buộc:** Kiểm tra quyền sở hữu bảng và quyền hạn cấp phát GRANT/REVOKE trên Supabase project. |
| **3. Mất Gói Tin Mạng & Retry (Network Drop)** | Mạng ngắt sau khi DB commit nhưng trước khi Client nhận ACK. | **ĐÃ XỬ LÝ TRIỆT ĐỂ:** Thiết kế `idempotency_key` độc lập (UUID v4) kết hợp lưu `last_idempotency_key` tại DB. Xử lý phân nhánh kịch bản có/không có thiết bị khác xen vào. | Nếu client đóng trình duyệt vĩnh viễn trước khi kịp retry, lần sau mở lại sẽ đối chiếu lại từ đầu. | **Bắt buộc:** Bổ sung 2 cột `last_idempotency_key TEXT` và `last_request_at BIGINT` vào bảng `cultivation`. |
| **4. Lệch Revision Giữa Local & Cloud** | Thiết bị offline thực hiện 20 thay đổi làm local rev tăng vọt. | **ĐÃ XỬ LÝ TRIỆT ĐỂ:** Tách biệt `localSequenceNumber` (nội bộ client) và `cloudRevision` (server-managed monotonic). Offline 20 lần vẫn chỉ commit 1 lần với expected_rev cũ. | Cần điều chỉnh lại logic lưu trữ trong `cultivation.js` ở Nhiệm vụ 3B.2. | **Bắt buộc:** Xác định kiểu dữ liệu của cột `rev` trên DB là `BIGINT` để tránh tràn số sau nhiều năm sử dụng. |
| **5. Bảo Mật & Phân Quyền RPC** | Kẻ xấu gọi RPC giả mạo để sửa tu vi của tài khoản khác hoặc gửi payload khổng lồ. | **ĐÃ XỬ LÝ TRIỆT ĐỂ:** Ép buộc lấy `auth.uid()` từ Supabase JWT session, `SET search_path = public, pg_temp;`, kiểm tra giới hạn kích thước payload $\le 512\text{KB}$. | Chưa tích hợp rate-limit ở tầng API Gateway (Kong/Cloudflare) chống spam gọi RPC liên tục. | **Bắt buộc:** Supabase Auth phải hoạt động ổn định và token JWT chứa `sub` (user_id) hợp lệ. |
| **6. First-time Onboarding Race** | Hai thiết bị cùng khởi tạo bản ghi Cloud rỗng đồng thời. | **ĐÃ XỬ LÝ TRIỆT ĐỂ:** Sử dụng `INSERT ... ON CONFLICT (user_id) DO NOTHING`. Thiết bị đến trước tạo rev 1, thiết bị sau nhận CONFLICT và được thông báo đối chiếu dữ liệu (Quyết định 4A). | Người dùng cần xem hộp thoại chọn nếu 2 máy có tiến độ offline ban đầu khác nhau. | **Bắt buộc:** Ràng buộc `UNIQUE (user_id)` phải tồn tại trên bảng để `ON CONFLICT` hoạt động. |
| **7. Quản Lý Pending Seconds** | Mất thời gian đọc truyện tích lũy khi 2 máy cùng đọc song song. | **ĐÃ XỬ LÝ:** Quản lý chung concurrency control (Quyết định 2B), áp dụng rate-limit 60s cho các lần đẩy chỉ có pending, hiển thị cả 2 bên khi có xung đột. | Chưa có cơ chế tự động tách sub-revision độc lập (để dành cho giai đoạn tối ưu sau). | **Bắt buộc:** Client phải đóng gói đúng trường `pendingSeconds` vào snapshot hoặc cột dữ liệu. |
| **8. Rollback & Vận Hành Khẩn Cấp** | RPC gặp sự cố logic sau khi deploy trên Production. | **ĐÃ XỬ LÝ TRIỆT ĐỂ:** Bác bỏ quan điểm `DROP FUNCTION`. Thay bằng cơ chế Circuit Breaker (cập nhật RPC trả về `MAINTENANCE` an toàn). Dump backup DB trước khi chạy. | Phụ thuộc vào việc người vận hành có quyền truy cập Supabase SQL Editor khi có sự cố. | **Bắt buộc:** Phải chạy thử nghiệm kịch bản rollback trên môi trường Staging trước khi lên Production. |

---

## 12. Kế Hoạch Kiểm Thử Cần Thiết Trước Khi Triển Khai (Testing Roadmap)

Trước khi tiến hành Nhiệm vụ 3B.2 (viết code production và migration), toàn bộ giải pháp OCC phải vượt qua ma trận kiểm thử nghiêm ngặt:

### 12.1. Kiểm Thử Mock (Unit & Component Test - Node.js Test Runner)
- [ ] **Test Case 1:** Kiểm tra logic `localSequenceNumber` tăng độc lập khi offline mà không làm sai lệch `lastSyncedCloudRev`.
- [ ] **Test Case 2:** Kiểm tra cơ chế sinh `idempotency_key` duy nhất cho mỗi lượt sync và giữ nguyên khi retry cùng một request.
- [ ] **Test Case 3:** Giả lập Mock RPC xử lý thành công Idempotent Replay khi mạng bị ngắt ở bước nhận phản hồi.
- [ ] **Test Case 4:** Giả lập Mock RPC từ chối Stale Write (Cloud rev 50 vs Local rev 11).
- [ ] **Test Case 5:** Giả lập First Insert Race giữa 2 thiết bị cùng online lần đầu.
- [ ] **Test Case 6:** Kiểm tra lưu trữ trạng thái xung đột bền vững trong `localStorage` và hiển thị Banner cảnh báo nhẹ (Quyết định 3A).

### 12.2. Kiểm Thử Tích Hợp Trên PostgreSQL Staging (Integration Test)
- [ ] **Test Case 7:** Cài đặt migration SQL trên Supabase Local CLI (Docker) hoặc Staging instance.
- [ ] **Test Case 8:** Dùng script Node.js kích hoạt 50 worker đồng thời gọi RPC `sync_cultivation_occ` với cùng `expected_rev` -> Xác minh chỉ đúng 1 worker thành công, 49 worker còn lại nhận mã `CONFLICT` chính xác.
- [ ] **Test Case 9:** Thử nghiệm gọi direct `.from('cultivation').upsert()` bằng tài khoản `authenticated` -> Xác nhận nhận lỗi `42501 permission denied`.
- [ ] **Test Case 10:** Đo lường thời gian thực thi p50/p95 qua `pg_stat_statements` để kiểm chứng giả thuyết hiệu năng.

---

## 13. Kết Luận

Tài liệu thiết kế kiến trúc OCC đã được cập nhật toàn diện theo đúng toàn bộ ý kiến chỉ đạo và phê duyệt từ Người dùng:
- **Đã chọn và áp dụng trọn vẹn 4 quyết định:** 1A (Server monotonic revision), 2B (quản lý pending trong cùng OCC), 3A (Banner cảnh báo nhẹ & trạng thái bền vững), 4A (máy ghi trước thắng first-insert).
- **Đã giải quyết triệt để 8 vấn đề cốt tử:** Ngăn chặn client cũ bypass qua REVOKE phân quyền, Tách bạch Local Seq và Cloud Rev, Cơ chế Request ID / Idempotency độc lập chống rủi ro rớt mạng, An toàn RPC & RLS theo chiều sâu, Xử lý conflict có kiểm tra revision mới, Bác bỏ sai lầm DROP FUNCTION và thay bằng Circuit Breaker Rollback, Loại bỏ các nhận định chủ quan chưa kiểm chứng.
- **Bổ sung đầy đủ:** Sơ đồ chuyển đổi trạng thái (Mermaid), Sơ đồ luồng nguyên tử trong RPC, Sơ đồ giải quyết kịch bản mạng rớt, và Ma trận đánh giá rủi ro còn lại.

**Trạng thái hiện tại:**
- Toàn bộ thiết kế đã sẵn sàng trên branch `design/cultivation-occ`.
- **Dừng lại tại đây** để Người dùng review tài liệu thiết kế đã cập nhật.
- **Tuyệt đối KHÔNG merge, KHÔNG deploy, KHÔNG chạy SQL trên Supabase thật trước khi có lệnh.**
