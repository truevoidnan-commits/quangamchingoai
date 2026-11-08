/**
 * src/lib/sync/chapterMerge.js
 * 
 * Thuật toán hợp nhất danh sách chương truyện chữ giữa thiết bị cục bộ (Local) và Cloud.
 * 
 * Nguyên tắc vàng:
 * 1. Chương truyện là dữ liệu CỘNG DỒN — tuyệt đối KHÔNG bao giờ làm mất chương từ bất kỳ bên nào.
 * 2. Bảo toàn chỉnh sửa người dùng đã sửa trong Reader:
 *    - Cùng id khác nội dung: ưu tiên bản có updatedAt lớn hơn.
 *    - Nếu không có updatedAt (hoặc bằng nhau): chọn bản có content dài hơn hoặc khác; nếu hòa ưu tiên local (preferLocalOnTie).
 * 3. Bảo toàn thứ tự đọc (order):
 *    - Giữ nguyên order của các chương đã có, KHÔNG tự ý đánh số lại từ đầu.
 *    - Nếu trùng order khác id: giữ CẢ HAI chương. Chương tạo trước (hoặc id nhỏ hơn) giữ order cũ,
 *      chương đến sau được dời về cuối (order = max + 1) theo thứ tự tạo.
 * 4. Dedupe thông minh:
 *    - Hai chương khác id nhưng cùng title và content giống hệt nhau thì chỉ giữ 1 bản.
 */

/**
 * Hợp nhất hai danh sách chương.
 * 
 * @param {Array<Object>} localChapters - Danh sách chương ở máy này
 * @param {Array<Object>} cloudChapters - Danh sách chương tải từ Cloud
 * @param {Object} [options]
 * @param {boolean} [options.preferLocalOnTie=true] - Ưu tiên bản cục bộ khi mọi tiêu chí hòa nhau
 * @returns {{
 *   merged: Array<Object>,
 *   addedFromCloud: number,
 *   addedFromLocal: number,
 *   updatedFromCloud: number,
 *   updatedFromLocal: number,
 *   conflictsResolved: number
 * }}
 */
export function mergeChapterSets(localChapters = [], cloudChapters = [], options = {}) {
  const { preferLocalOnTie = true } = options;

  const safeLocal = Array.isArray(localChapters) ? localChapters.filter(Boolean) : [];
  const safeCloud = Array.isArray(cloudChapters) ? cloudChapters.filter(Boolean) : [];

  let addedFromCloud = 0;
  let addedFromLocal = 0;
  let updatedFromCloud = 0;
  let updatedFromLocal = 0;
  let conflictsResolved = 0;

  // Bản đồ tra cứu theo ID
  const localById = new Map();
  for (const ch of safeLocal) {
    if (ch && ch.id) {
      localById.set(ch.id, { ...ch });
    }
  }

  const cloudById = new Map();
  for (const ch of safeCloud) {
    if (ch && ch.id) {
      cloudById.set(ch.id, { ...ch });
    }
  }

  // Tập hợp các ID đã xử lý
  const processedIds = new Set();
  const mergedList = [];

  // Helper để tạo chữ ký nội dung phục vụ Dedupe (title + content)
  const getContentSignature = (ch) => {
    const t = (ch?.title || '').trim();
    const c = (ch?.content || '').trim();
    return `${t}:::${c}`;
  };

  // 1. Xử lý các chương có cùng ID ở cả hai bên
  for (const [id, localCh] of localById.entries()) {
    if (cloudById.has(id)) {
      processedIds.add(id);
      const cloudCh = cloudById.get(id);

      const localTitle = (localCh.title || '').trim();
      const cloudTitle = (cloudCh.title || '').trim();
      const localContent = localCh.content || '';
      const cloudContent = cloudCh.content || '';

      // Kiểm tra xem nội dung / tiêu đề có khác nhau không
      const isContentDiff = localContent !== cloudContent || localTitle !== cloudTitle;

      if (!isContentDiff) {
        // Hoàn toàn giống nhau -> Giữ bản có nhiều metadata hơn hoặc bản local
        const chosen = {
          ...cloudCh,
          ...localCh,
          order: typeof localCh.order === 'number' ? localCh.order : cloudCh.order,
        };
        mergedList.push(chosen);
      } else {
        // Cùng ID nhưng nội dung khác nhau -> Xung đột cần giải quyết
        conflictsResolved++;
        const localUp = Number(localCh.updatedAt) || 0;
        const cloudUp = Number(cloudCh.updatedAt) || 0;

        let winner = 'local';
        if (localUp > 0 || cloudUp > 0) {
          if (localUp > cloudUp) {
            winner = 'local';
          } else if (cloudUp > localUp) {
            winner = 'cloud';
          } else {
            // Cùng updatedAt -> so sánh độ dài content
            if (localContent.length !== cloudContent.length) {
              winner = localContent.length > cloudContent.length ? 'local' : 'cloud';
            } else {
              winner = preferLocalOnTie ? 'local' : 'cloud';
            }
          }
        } else {
          // Không có updatedAt -> So sánh độ dài content
          if (localContent.length !== cloudContent.length) {
            winner = localContent.length > cloudContent.length ? 'local' : 'cloud';
          } else {
            winner = preferLocalOnTie ? 'local' : 'cloud';
          }
        }

        if (winner === 'local') {
          updatedFromLocal++;
          mergedList.push({
            ...cloudCh,
            ...localCh,
            order: typeof localCh.order === 'number' ? localCh.order : cloudCh.order,
          });
        } else {
          updatedFromCloud++;
          mergedList.push({
            ...localCh,
            ...cloudCh,
            order: typeof cloudCh.order === 'number' ? cloudCh.order : localCh.order,
          });
        }
      }
    }
  }

  // 2. Xử lý các chương chỉ có ở Local
  const localOnly = [];
  for (const [id, localCh] of localById.entries()) {
    if (!processedIds.has(id)) {
      localOnly.push(localCh);
    }
  }

  // 3. Xử lý các chương chỉ có ở Cloud
  const cloudOnly = [];
  for (const [id, cloudCh] of cloudById.entries()) {
    if (!processedIds.has(id)) {
      cloudOnly.push(cloudCh);
    }
  }

  // 4. Dedupe: Kiểm tra nếu chương chỉ có ở một bên nhưng có cùng title & content với bên kia
  // Xây dựng set chữ ký từ mergedList hiện tại
  const existingSignatures = new Map();
  for (const ch of mergedList) {
    existingSignatures.set(getContentSignature(ch), ch.id);
  }

  // Thêm localOnly
  for (const lch of localOnly) {
    const sig = getContentSignature(lch);
    if (existingSignatures.has(sig)) {
      // Đã có chương với nội dung giống hệt trong mergedList -> Bỏ qua duplicate
      continue;
    }
    existingSignatures.set(sig, lch.id);
    mergedList.push(lch);
    addedFromLocal++;
  }

  // Thêm cloudOnly
  for (const cch of cloudOnly) {
    const sig = getContentSignature(cch);
    if (existingSignatures.has(sig)) {
      // Đã có chương với nội dung giống hệt từ Local -> Bỏ qua duplicate
      continue;
    }
    existingSignatures.set(sig, cch.id);
    mergedList.push(cch);
    addedFromCloud++;
  }

  // 5. Phân giải thứ tự (Order) và xử lý trùng order
  // Tìm order lớn nhất hiện có
  let maxOrder = -1;
  for (const ch of mergedList) {
    if (typeof ch.order === 'number' && !isNaN(ch.order)) {
      if (ch.order > maxOrder) maxOrder = ch.order;
    }
  }

  // Nếu chương nào chưa có order hợp lệ, gán order kế tiếp
  for (const ch of mergedList) {
    if (typeof ch.order !== 'number' || isNaN(ch.order)) {
      maxOrder++;
      ch.order = maxOrder;
    }
  }

  // Nhóm theo order để phát hiện trùng lặp
  const byOrder = new Map();
  for (const ch of mergedList) {
    const list = byOrder.get(ch.order) || [];
    list.push(ch);
    byOrder.set(ch.order, list);
  }

  // Với các order bị trùng lặp: giữ chương tạo sớm nhất ở order cũ, các chương sau gán maxOrder + 1
  for (const [orderVal, chaptersWithSameOrder] of byOrder.entries()) {
    if (chaptersWithSameOrder.length > 1) {
      // Sắp xếp các chương bị trùng order:
      // 1. Chương có createdAt nhỏ hơn (tạo trước)
      // 2. Bản local ưu tiên
      // 3. Theo id ổn định
      chaptersWithSameOrder.sort((a, b) => {
        const aCreated = Number(a.createdAt) || 0;
        const bCreated = Number(b.createdAt) || 0;
        if (aCreated !== bCreated && aCreated > 0 && bCreated > 0) {
          return aCreated - bCreated;
        }
        // Nếu một bên có trong safeLocal và bên kia không
        const aIsLocal = localById.has(a.id);
        const bIsLocal = localById.has(b.id);
        if (aIsLocal !== bIsLocal) {
          return aIsLocal ? -1 : 1;
        }
        return String(a.id).localeCompare(String(b.id));
      });

      // Chương đầu tiên chaptersWithSameOrder[0] giữ nguyên orderVal
      // Các chương tiếp theo nhận order mới nối tiếp
      for (let i = 1; i < chaptersWithSameOrder.length; i++) {
        maxOrder++;
        chaptersWithSameOrder[i].order = maxOrder;
      }
    }
  }

  // Sắp xếp cuối cùng theo order tăng dần
  mergedList.sort((a, b) => a.order - b.order);

  return {
    merged: mergedList,
    addedFromCloud,
    addedFromLocal,
    updatedFromCloud,
    updatedFromLocal,
    conflictsResolved,
  };
}
