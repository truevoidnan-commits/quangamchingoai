/**
 * src/lib/migration.js
 * Migration v2:
 * 1. Thu nhỏ coverUrl (Base64) trong tcl_library thành coverThumb để bảo vệ localStorage quota (~5MB).
 * 2. Lưu coverUrl đầy đủ vào IndexedDB nếu IndexedDB chưa có.
 * 3. Quét IndexedDB và khôi phục các truyện mồ côi (chưa có trong catalog).
 * 4. Giữ nguyên 100% cờ isHidden của Mật Thất.
 * 5. Dọn dẹp các khóa scroll_pos_* cũ hơn 90 ngày.
 * 6. Đặt cờ tcl_migrated_v2 để chỉ chạy một lần duy nhất.
 */
import { getNovel, getAllNovels, saveNovel } from './db.js';
import { getLibrary, saveLibrary } from './storage.js';
import { makeCoverThumb } from './coverImage.js';

const MIGRATION_V2_FLAG = 'tcl_migrated_v2';
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export async function runMigrationV2(deps = {}) {
  const _getNovel = deps.getNovel || getNovel;
  const _getAllNovels = deps.getAllNovels || getAllNovels;
  const _saveNovel = deps.saveNovel || saveNovel;
  const _getLibrary = deps.getLibrary || getLibrary;
  const _saveLibrary = deps.saveLibrary || saveLibrary;
  const _makeCoverThumb = deps.makeCoverThumb || makeCoverThumb;

  if (typeof localStorage === 'undefined') return { ran: false, recoveredCount: 0 };
  if (localStorage.getItem(MIGRATION_V2_FLAG)) {
    return { ran: false, recoveredCount: 0 };
  }

  let recoveredCount = 0;

  try {
    // Đọc danh mục hiện tại một cách an toàn
    let currentLib;
    try {
      currentLib = _getLibrary({ includeHidden: true });
    } catch (readErr) {
      console.error('[MigrationV2] Không thể đọc catalog từ localStorage, hủy migration:', readErr);
      return { ran: false, recoveredCount: 0, error: readErr };
    }

    if (!Array.isArray(currentLib)) {
      currentLib = [];
    }

    // a. Với mỗi mục trong tcl_library còn coverUrl dạng data: URL:
    // nếu bản ghi tương ứng trong IndexedDB chưa có cover thì ghi cover đó vào IndexedDB trước,
    // sau đó tạo coverThumb, rồi xóa coverUrl khỏi catalog.
    for (let i = 0; i < currentLib.length; i++) {
      const item = currentLib[i];
      if (!item) continue;
      try {
        if (item.coverUrl && /^data:/i.test(item.coverUrl)) {
          // Kiểm tra và bảo toàn vào IndexedDB
          try {
            const dbNovel = await _getNovel(item.id);
            if (dbNovel) {
              let needSave = false;
              if (!dbNovel.coverUrl) {
                dbNovel.coverUrl = item.coverUrl;
                needSave = true;
              }
              if (needSave) {
                await _saveNovel(dbNovel);
              }
            }
          } catch (dbErr) {
            console.warn(`[MigrationV2] Lỗi kiểm tra cover trong IndexedDB cho item ${item.id}:`, dbErr);
          }

          // Tạo thumbnail nhỏ nếu chưa có
          if (!item.coverThumb) {
            try {
              item.coverThumb = await _makeCoverThumb(item.coverUrl, 240, 320, 0.7);
            } catch (thumbErr) {
              console.warn(`[MigrationV2] Lỗi tạo coverThumb cho item ${item.id}:`, thumbErr);
            }
          }

          // Xóa coverUrl dạng data: URL khỏi catalog
          delete item.coverUrl;
        } else if (item.coverUrl && /^https?:\/\//i.test(item.coverUrl)) {
          if (!item.coverThumb) {
            item.coverThumb = item.coverUrl;
          }
        }
      } catch (itemErr) {
        console.warn(`[MigrationV2] Lỗi xử lý item ${item?.id}:`, itemErr);
      }
    }

    // b. Quét IndexedDB (getAllNovels): truyện nào không có trong catalog thì thêm lại vào catalog
    // (id, title, coverThumb, chapterCount, isHidden: false).
    try {
      const allDbNovels = await _getAllNovels();
      const existingIds = new Set(currentLib.map((n) => n && n.id).filter(Boolean));

      for (const dbNovel of allDbNovels) {
        if (!dbNovel || !dbNovel.id) continue;
        if (!existingIds.has(dbNovel.id)) {
          try {
            let thumb = dbNovel.coverThumb || '';
            if (!thumb && dbNovel.coverUrl) {
              if (/^https?:\/\//i.test(dbNovel.coverUrl)) {
                thumb = dbNovel.coverUrl;
              } else {
                thumb = await _makeCoverThumb(dbNovel.coverUrl, 240, 320, 0.7);
              }
            }

            // Thêm lại vào catalog
            // c. Tuyệt đối giữ nguyên cờ isHidden của các truyện đã có; truyện mồ côi thì isHidden: false
            currentLib.push({
              id: dbNovel.id,
              title: dbNovel.title || 'Truyện không tên',
              coverThumb: thumb || '',
              chapterCount: dbNovel.chapterCount || 0,
              isHidden: false,
            });
            existingIds.add(dbNovel.id);
            recoveredCount++;
          } catch (orphanErr) {
            console.warn(`[MigrationV2] Lỗi khôi phục truyện mồ côi ${dbNovel.id}:`, orphanErr);
          }
        }
      }
    } catch (scanErr) {
      console.warn('[MigrationV2] Lỗi quét IndexedDB để khôi phục truyện:', scanErr);
    }

    // Lưu lại catalog đã cập nhật an toàn
    try {
      _saveLibrary(currentLib);
    } catch (saveErr) {
      console.error('[MigrationV2] Không thể ghi lại catalog vào localStorage:', saveErr);
      return { ran: false, recoveredCount: 0, error: saveErr };
    }

    // d. Dọn khóa scroll_pos_* trong localStorage cũ hơn 90 ngày (dựa vào trường time trong giá trị JSON)
    try {
      const now = Date.now();
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('scroll_pos_')) {
          try {
            const raw = localStorage.getItem(key);
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed.time === 'number' && Number.isFinite(parsed.time)) {
                if (now - parsed.time > NINETY_DAYS_MS) {
                  keysToRemove.push(key);
                }
              }
            }
          } catch {
            // Khóa không parse được thì bỏ qua, đừng xóa
          }
        }
      }
      for (const k of keysToRemove) {
        localStorage.removeItem(k);
      }
    } catch (cleanErr) {
      console.warn('[MigrationV2] Lỗi khi dọn khóa scroll_pos:', cleanErr);
    }

    // Đánh dấu migration đã hoàn thành
    if (recoveredCount > 0) {
      try {
        sessionStorage.setItem('tcl_pending_recovery_toast', String(recoveredCount));
      } catch {}
    }
    localStorage.setItem(MIGRATION_V2_FLAG, '1');
    return { ran: true, recoveredCount };
  } catch (err) {
    console.error('[MigrationV2] Lỗi migration toàn cục:', err);
    return { ran: false, recoveredCount: 0, error: err };
  }
}
