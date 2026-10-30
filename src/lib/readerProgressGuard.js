/**
 * src/lib/readerProgressGuard.js
 *
 * Hàm thuần bảo vệ tiến độ đọc khi mở ReaderPage,
 * chống việc mở thụ động (reload / mở tab cũ / link trực tiếp) ghi đè tiến độ mới từ Cloud.
 */

import { getActiveProfile } from './cultivation.js';
import { getCachedUserId } from './sync/autoSync.js';

/**
 * Quyết định hành vi khi mở ReaderPage lần đầu trong phiên:
 * - 'jump': Nhảy tự động sang chương mới nhất từ Cloud (khi chưa có thao tác người dùng).
 * - 'propose': Cloud có chương mới hơn nhưng người dùng đã chủ động thao tác trước đó -> hiện toast gợi ý 'Chuyển tới'.
 * - 'stay': Giữ nguyên chương hiện tại (cùng chương, offline, lỗi, chưa đăng nhập, sandbox, hoặc điều hướng trong app).
 *
 * @param {Object} params
 * @param {string} [params.locationKey] - useLocation().key ('default' khi mở tab/reload)
 * @param {string|number} [params.urlChapterId] - chapterId hiện tại trên URL
 * @param {boolean} [params.hasEngaged] - Người dùng đã có tương tác thật với trang chưa
 * @param {Object|null} [params.pullResult] - Kết quả từ pullNovelProgressNow
 * @returns {'stay' | 'jump' | 'propose'}
 */
export function decideInitialOpenAction({ locationKey, urlChapterId, hasEngaged, pullResult }) {
  if (locationKey !== 'default') {
    return 'stay';
  }

  const cloudChapterId = pullResult?.data?.chapterId;
  const isDifferentChapter = Boolean(
    pullResult?.updated &&
    cloudChapterId !== undefined &&
    cloudChapterId !== null &&
    String(cloudChapterId) !== String(urlChapterId)
  );

  if (isDifferentChapter) {
    return hasEngaged ? 'propose' : 'jump';
  }

  return 'stay';
}

/**
 * Kiểm tra xem phiên đọc hiện tại có được phép ghi/flush tiến độ đọc hay không:
 * - Điều hướng trong app (locationKey !== 'default'): luôn được phép (true).
 * - Vào trang lần đầu (locationKey === 'default'): BẮT BUỘC cả pullProgressDone = true VÀ hasEngaged = true.
 *
 * @param {Object} params
 * @param {string} [params.locationKey]
 * @param {boolean} [params.pullProgressDone]
 * @param {boolean} [params.hasEngaged]
 * @returns {boolean}
 */
export function canWriteProgress({ locationKey, pullProgressDone, hasEngaged }) {
  if (locationKey !== 'default') {
    return true;
  }
  return Boolean(pullProgressDone && hasEngaged);
}

/**
 * Kiểm tra xem có phiên đăng nhập Supabase được lưu trên thiết bị hay không
 * @returns {boolean}
 */
export function hasSavedAuthSession() {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const item = localStorage.getItem(key);
        if (item && item.includes('access_token')) {
          return true;
        }
      }
    }
  } catch {}
  return Boolean(getCachedUserId());
}

/**
 * Kiểm tra xem có cần giữ loading/skeleton chờ pull tiến độ trên mount hay không
 * @param {Object} params
 * @param {string} params.locationKey
 * @param {boolean} params.pullProgressDone
 * @returns {boolean}
 */
export function shouldWaitForInitialPull({ locationKey, pullProgressDone }) {
  if (locationKey !== 'default') return false;
  if (pullProgressDone) return false;
  if (getActiveProfile() !== 'real') return false;
  return hasSavedAuthSession();
}
