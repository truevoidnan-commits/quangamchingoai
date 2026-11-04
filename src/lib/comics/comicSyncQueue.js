/**
 * src/lib/comics/comicSyncQueue.js
 * Hàng đợi đồng bộ tuần tự trung tâm cho Truyện Tranh (Phase 3).
 *
 * Chức năng:
 * - Xử lý tuần tự từng tập một (upload hoặc download), mỗi tập tải song song tối đa 4 trang.
 * - Chống xung đột giữa các tab bằng Web Locks API (navigator.locks) với cơ chế tự động thử lại sau 5s khi bị chiếm lock.
 * - Kiểm tra lại trạng thái thực tế trước khi chạy mỗi task để tránh trùng việc giữa nhiều tab.
 * - Tự động tải về (A2) và tự động tải lên (A3) khi có điều kiện phù hợp.
 * - Hỗ trợ ưu tiên (priority) khi người dùng bấm "Đọc" tập trên Cloud (A4).
 * - Bảo vệ bộ nhớ thiết bị: tạm dừng tự tải khi dung lượng máy > 70% (A5).
 * - Cơ chế huỷ bỏ task đang chờ hoặc đang chạy (cancelTask) bằng AbortController.
 * - Tạm dừng (pauseSync) dừng nhẹ task đang chạy, bảo lưu trạng thái để tiếp tục (resumeSync).
 * - Theo dõi lỗi & Backoff luỹ thừa (1m, 5m, 15m, 60m), ngừng tự động sau 4 lần thất bại, hỗ trợ Thử Lại thủ công.
 * - Ngăn chặn vòng lặp vô hạn khi gặp lỗi 413 (vượt 8GB Cloud) hoặc chưa đăng nhập.
 * - Xử lý Rate Limit (429) với hẹn giờ có thể huỷ và cập nhật trạng thái rõ ràng.
 * - Lắng nghe tín hiệu Realtime A6, tab focus, online, và chu kỳ 60s.
 */

import {
  listRemote,
  uploadVolume,
  downloadVolume,
  isCloudAvailable,
} from './comicCloud.js';
import { getVolume } from './comicDb.js';

export const AUTO_DOWNLOAD_KEY = 'tcl_comic_auto_download';
export const AUTO_UPLOAD_KEY = 'tcl_comic_auto_upload';
export const SYNC_PAUSED_KEY = 'tcl_comic_sync_paused';
export const NO_AUTODL_PREFIX = 'tcl_comic_no_autodl_';
export const NO_AUTOUPL_PREFIX = 'tcl_comic_no_autoupl_';
export const FAIL_STORAGE_PREFIX = 'tcl_comic_fail_';
export const STORAGE_LIMIT_RATIO = 0.7; // 70% bộ nhớ
export const MAX_FAIL_COUNT = 4;
export const BACKOFF_DELAYS_MS = [
  60 * 1000,        // Lần 1: 1 phút
  5 * 60 * 1000,    // Lần 2: 5 phút
  15 * 60 * 1000,   // Lần 3: 15 phút
  60 * 60 * 1000,   // Lần 4: 60 phút
];

// Trạng thái hàng đợi
let _queue = []; // Danh sách tác vụ đang chờ: [{ id, type, volumeId, seriesId, priority, volumeTitle, resolve, reject, onProgress }]
let _activeTask = null; // Tác vụ đang thực thi: { id, type, volumeId, seriesId, volumeTitle, current, total, percent, phase, error }
let _activeAbortController = null;
let _isProcessing = false;
let _isPaused = false;
let _isPauseAborting = false;
let _storageWarning = false;
let _uploadQuotaExceeded = false;
let _rateLimitResumeAt = null;
let _rateLimitTimer = null;
let _lockRetryTimer = null;
let _failMap = new Map(); // key: `${type}_${volumeId}` -> failRecord
let _listeners = new Set();
let _pollTimer = null;
let _lifecycleAttached = false;
let _customUploadVolume = null;
let _customDownloadVolume = null;

export function setSyncHandlersForTesting({ upload = null, download = null } = {}) {
  _customUploadVolume = upload;
  _customDownloadVolume = download;
}

// Đọc cài đặt khởi đầu từ localStorage
try {
  if (typeof localStorage !== 'undefined') {
    _isPaused = localStorage.getItem(SYNC_PAUSED_KEY) === 'true';
    _uploadQuotaExceeded = localStorage.getItem('tcl_comic_quota_exceeded') === 'true';
  }
} catch {}

/**
 * Kiểm tra công tắc Tự động tải về (mặc định BẬT)
 */
export function isAutoDownloadEnabled() {
  try {
    if (typeof localStorage === 'undefined') return true;
    const val = localStorage.getItem(AUTO_DOWNLOAD_KEY);
    return val !== 'false';
  } catch {
    return true;
  }
}

/**
 * Bật/tắt công tắc Tự động tải về
 */
export function setAutoDownloadEnabled(enabled) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AUTO_DOWNLOAD_KEY, enabled ? 'true' : 'false');
    }
  } catch {}
  notifySubscribers();
  if (enabled) {
    checkAndTriggerAutoSync().catch(() => {});
  }
}

/**
 * Kiểm tra công tắc Tự động tải lên (mặc định BẬT)
 */
export function isAutoUploadEnabled() {
  try {
    if (typeof localStorage === 'undefined') return true;
    const val = localStorage.getItem(AUTO_UPLOAD_KEY);
    return val !== 'false';
  } catch {
    return true;
  }
}

/**
 * Bật/tắt công tắc Tự động tải lên
 */
export function setAutoUploadEnabled(enabled) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AUTO_UPLOAD_KEY, enabled ? 'true' : 'false');
    }
  } catch {}
  notifySubscribers();
  if (enabled) {
    checkAndTriggerAutoSync().catch(() => {});
  }
}

/**
 * Kiểm tra hàng đợi có đang tạm dừng không
 */
export function isSyncPaused() {
  return _isPaused;
}

/**
 * Tạm dừng toàn bộ hàng đợi tự động (dừng nhẹ tác vụ đang chạy nếu có)
 */
export function pauseSync() {
  _isPaused = true;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SYNC_PAUSED_KEY, 'true');
    }
  } catch {}

  clearLockRetry();
  if (_rateLimitTimer) {
    clearTimeout(_rateLimitTimer);
    _rateLimitTimer = null;
  }

  // Dừng nhẹ tác vụ đang chạy nếu có (abort giữ resume)
  if (_activeTask && _activeAbortController) {
    _isPauseAborting = true;
    _activeAbortController.abort(new Error('Hàng đợi đã tạm dừng'));
  }

  notifySubscribers();
}

/**
 * Tiếp tục chạy hàng đợi tự động
 */
export function resumeSync() {
  _isPaused = false;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SYNC_PAUSED_KEY, 'false');
    }
  } catch {}
  notifySubscribers();
  triggerProcess();
  checkAndTriggerAutoSync().catch(() => {});
}

/**
 * Kiểm tra dung lượng lưu trữ cục bộ
 * @returns {Promise<{ ok: boolean, usage: number, quota: number, ratio: number }>}
 */
export async function checkStorageEstimate() {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { ok: true, usage: 0, quota: 0, ratio: 0 };
  }
  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const ratio = quota > 0 ? usage / quota : 0;
    const ok = ratio <= STORAGE_LIMIT_RATIO;
    return { ok, usage, quota, ratio };
  } catch {
    return { ok: true, usage: 0, quota: 0, ratio: 0 };
  }
}

/**
 * Lấy ảnh chụp trạng thái hiện tại của hàng đợi đồng bộ
 */
export function getQueueSnapshot() {
  return {
    isProcessing: _isProcessing || !!_activeTask,
    isPaused: _isPaused,
    storageWarning: _storageWarning,
    uploadQuotaExceeded: _uploadQuotaExceeded,
    rateLimitInfo: _rateLimitResumeAt
      ? {
          resumeAt: _rateLimitResumeAt,
          waitMinutes: Math.max(1, Math.ceil((_rateLimitResumeAt - Date.now()) / 60000)),
        }
      : null,
    activeTask: _activeTask ? { ..._activeTask } : null,
    pendingTasks: _queue.map((t) => ({
      id: t.id,
      type: t.type,
      volumeId: t.volumeId,
      seriesId: t.seriesId,
      priority: !!t.priority,
      volumeTitle: t.volumeTitle || '',
    })),
    queueLength: _queue.length,
    autoDownload: isAutoDownloadEnabled(),
    autoUpload: isAutoUploadEnabled(),
  };
}

/**
 * Đăng ký lắng nghe thay đổi trạng thái hàng đợi
 */
export function subscribeSyncQueue(callback) {
  _listeners.add(callback);
  initLifecycleListeners();

  try {
    callback(getQueueSnapshot());
  } catch {}

  return () => {
    _listeners.delete(callback);
  };
}

function notifySubscribers() {
  const snapshot = getQueueSnapshot();
  for (const cb of _listeners) {
    try {
      cb(snapshot);
    } catch {}
  }
}

// =============================================================================
// QUẢN LÝ LỖI & BACKOFF LUỸ THỪA (LỖI 1)
// =============================================================================

/**
 * Lấy thông tin lỗi của một tập truyện
 * @param {string} volumeId
 * @param {'upload'|'download'|null} type
 */
export function getVolumeFailure(volumeId, type = null) {
  const types = type ? [type] : ['upload', 'download'];
  for (const t of types) {
    const memKey = `${t}_${volumeId}`;
    let record = _failMap.get(memKey);
    if (!record && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(`${FAIL_STORAGE_PREFIX}${t}_${volumeId}`);
        if (raw) {
          record = JSON.parse(raw);
          _failMap.set(memKey, record);
        }
      } catch {}
    }
    if (record) {
      const now = Date.now();
      const stopped = (record.failCount || 0) >= MAX_FAIL_COUNT || !!record.stopped;
      return {
        ...record,
        type: t,
        volumeId,
        stopped,
        canRetryNow: !stopped && now >= (record.nextRetryAt || 0),
      };
    }
  }
  return null;
}

/**
 * Ghi nhận lỗi cho một tác vụ tập truyện và áp dụng backoff
 */
export function recordTaskFailure(volumeId, type, error) {
  const errStr = error?.message || String(error);

  // Lỗi 413: vượt quá hạn mức Cloud (8GB)
  const is413 =
    error?.status === 413 ||
    error?.code === '413' ||
    errStr.includes('413') ||
    errStr.toLowerCase().includes('dung lượng') ||
    errStr.toLowerCase().includes('vượt') ||
    errStr.toLowerCase().includes('quota');

  if (is413) {
    _uploadQuotaExceeded = true;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('tcl_comic_quota_exceeded', 'true');
      }
    } catch {}
    notifySubscribers();
    return;
  }

  // Lỗi chưa đăng nhập: dừng ngay, không retry
  const isNotLoggedIn =
    error?.status === 401 ||
    errStr.includes('đăng nhập') ||
    errStr.includes('Chưa đăng nhập');

  if (isNotLoggedIn) {
    return;
  }

  const memKey = `${type}_${volumeId}`;
  const existing = getVolumeFailure(volumeId, type) || { failCount: 0 };
  const failCount = (existing.failCount || 0) + 1;
  const stopped = failCount >= MAX_FAIL_COUNT;

  const delayIndex = Math.min(failCount - 1, BACKOFF_DELAYS_MS.length - 1);
  const delayMs = BACKOFF_DELAYS_MS[delayIndex];
  const nextRetryAt = Date.now() + delayMs;

  const record = {
    failCount,
    nextRetryAt,
    lastError: errStr,
    stopped,
    type,
    volumeId,
    timestamp: Date.now(),
  };

  _failMap.set(memKey, record);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`${FAIL_STORAGE_PREFIX}${type}_${volumeId}`, JSON.stringify(record));
    }
  } catch {}

  notifySubscribers();
}

/**
 * Xóa trạng thái lỗi của tập truyện (khi người dùng thử lại hoặc tác vụ thành công)
 */
export function clearTaskFailure(volumeId, type = null) {
  const types = type ? [type] : ['upload', 'download'];
  for (const t of types) {
    const memKey = `${t}_${volumeId}`;
    _failMap.delete(memKey);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(`${FAIL_STORAGE_PREFIX}${t}_${volumeId}`);
      }
    } catch {}
  }
  notifySubscribers();
}

/**
 * Xóa cờ cảnh báo Cloud Quota (khi người dùng xóa dữ liệu cloud hoặc đăng nhập lại)
 */
export function clearUploadQuotaExceeded() {
  _uploadQuotaExceeded = false;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('tcl_comic_quota_exceeded');
    }
  } catch {}
  notifySubscribers();
}

/**
 * Thử lại đồng bộ thủ công cho tập truyện bị lỗi
 */
export function retryFailedVolume(volumeId, seriesId, { type = 'download', volumeTitle = '' } = {}) {
  clearTaskFailure(volumeId);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`${NO_AUTODL_PREFIX}${volumeId}`);
      localStorage.removeItem(`${NO_AUTOUPL_PREFIX}${volumeId}`);
    }
  } catch {}

  if (type === 'upload') {
    enqueueUpload(volumeId, seriesId, { priority: true, volumeTitle });
  } else {
    enqueueDownload(volumeId, seriesId, { priority: true, volumeTitle });
  }
}

// =============================================================================
// QUẢN LÝ HUỶ BỎ TÁC VỤ (LỖI 3)
// =============================================================================

/**
 * Hủy tác vụ của một tập truyện (nếu đang chờ thì xóa, nếu đang chạy thì abort)
 * Sau khi hủy, đánh dấu no_autodl / no_autoupl để không bị tự xếp hàng lại.
 * @param {string} volumeId
 * @returns {boolean} true nếu có tác vụ bị hủy
 */
export function cancelTask(volumeId) {
  let matched = false;

  // 1. Nếu đang chờ trong danh sách _queue
  const idx = _queue.findIndex((t) => t.volumeId === volumeId);
  if (idx !== -1) {
    const [task] = _queue.splice(idx, 1);
    matched = true;
    try {
      if (typeof localStorage !== 'undefined') {
        if (task.type === 'download') {
          localStorage.setItem(`${NO_AUTODL_PREFIX}${volumeId}`, '1');
        } else if (task.type === 'upload') {
          localStorage.setItem(`${NO_AUTOUPL_PREFIX}${volumeId}`, '1');
        }
      }
    } catch {}

    if (task.reject) {
      task.reject(new Error('Tác vụ đã bị hủy bởi người dùng'));
    }
  }

  // 2. Nếu đang là active task đang chạy
  if (_activeTask && _activeTask.volumeId === volumeId) {
    matched = true;
    const taskType = _activeTask.type;
    try {
      if (typeof localStorage !== 'undefined') {
        if (taskType === 'download') {
          localStorage.setItem(`${NO_AUTODL_PREFIX}${volumeId}`, '1');
        } else if (taskType === 'upload') {
          localStorage.setItem(`${NO_AUTOUPL_PREFIX}${volumeId}`, '1');
        }
      }
    } catch {}

    if (_activeAbortController) {
      _activeAbortController.abort(new Error('Tác vụ đã bị hủy bởi người dùng'));
    }
  }

  notifySubscribers();
  return matched;
}

/**
 * Lấy trạng thái của một tập truyện trong hàng đợi
 */
export function getVolumeQueueState(volumeId) {
  if (_activeTask && _activeTask.volumeId === volumeId) {
    return { state: 'active', task: _activeTask };
  }
  const queued = _queue.find((t) => t.volumeId === volumeId);
  if (queued) {
    return { state: 'queued', task: queued };
  }
  const fail = getVolumeFailure(volumeId);
  if (fail) {
    return { state: 'error', task: fail };
  }
  return { state: 'idle', task: null };
}

/**
 * Đưa tác vụ vào hàng đợi (tuần tự, không trùng lặp tập)
 */
function enqueueTask(task) {
  if (_activeTask && _activeTask.volumeId === task.volumeId) {
    triggerProcess();
    return;
  }

  const existingIdx = _queue.findIndex((t) => t.volumeId === task.volumeId);
  if (existingIdx !== -1) {
    // Nếu tác vụ mới có cờ priority thì đưa lên đầu
    if (task.priority && !_queue[existingIdx].priority) {
      const [item] = _queue.splice(existingIdx, 1);
      item.priority = true;
      if (task.onProgress) item.onProgress = task.onProgress;
      if (task.resolve) item.resolve = task.resolve;
      if (task.reject) item.reject = task.reject;
      _queue.unshift(item);
      notifySubscribers();
    }
    // Dù trùng vẫn gọi triggerProcess() để kích hoạt xử lý nếu đang nhàn rỗi (Lỗi 2)
    triggerProcess();
    return;
  }

  if (task.priority) {
    _queue.unshift(task);
  } else {
    _queue.push(task);
  }

  notifySubscribers();
  triggerProcess();
}

/**
 * Tải về ưu tiên (khi bấm Đọc vào tập Chỉ trên Cloud - A4)
 */
export function priorityDownloadVolume(volumeId, seriesId, { volumeTitle = '', onProgress = null } = {}) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`${NO_AUTODL_PREFIX}${volumeId}`);
    }
  } catch {}
  clearTaskFailure(volumeId, 'download');

  return new Promise((resolve, reject) => {
    enqueueTask({
      id: `dl_${volumeId}_${Date.now()}`,
      type: 'download',
      volumeId,
      seriesId,
      priority: true,
      volumeTitle,
      onProgress,
      resolve,
      reject,
    });
  });
}

/**
 * Đưa tập vào hàng đợi tải về
 */
export function enqueueDownload(volumeId, seriesId, { priority = false, volumeTitle = '', isManual = false } = {}) {
  if (isManual) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(`${NO_AUTODL_PREFIX}${volumeId}`);
      }
    } catch {}
    clearTaskFailure(volumeId, 'download');
  }

  enqueueTask({
    id: `dl_${volumeId}_${Date.now()}`,
    type: 'download',
    volumeId,
    seriesId,
    priority,
    volumeTitle,
  });
}

/**
 * Đưa tập vào hàng đợi tải lên
 */
export function enqueueUpload(volumeId, seriesId, { priority = false, volumeTitle = '', isManual = false } = {}) {
  if (isManual) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(`${NO_AUTOUPL_PREFIX}${volumeId}`);
      }
    } catch {}
    clearTaskFailure(volumeId, 'upload');
  }

  enqueueTask({
    id: `upl_${volumeId}_${Date.now()}`,
    type: 'upload',
    volumeId,
    seriesId,
    priority,
    volumeTitle,
  });
}

// =============================================================================
// XỬ LÝ KHÓA ĐA TAB & TIẾN TRÌNH HÀNG ĐỢI (LỖI 2)
// =============================================================================

function scheduleLockRetry() {
  if (_lockRetryTimer || _queue.length === 0) return;
  _lockRetryTimer = setTimeout(() => {
    _lockRetryTimer = null;
    if (_queue.length > 0 && !_isProcessing && !_isPaused) {
      triggerProcess();
    }
  }, 5000);
}

function clearLockRetry() {
  if (_lockRetryTimer) {
    clearTimeout(_lockRetryTimer);
    _lockRetryTimer = null;
  }
}

/**
 * Kiểm tra xem tập truyện đã được tab khác hoàn tất chưa trước khi chạy task
 */
async function isTaskAlreadyCompleted(task) {
  try {
    if (task.type === 'download') {
      const vol = await getVolume(task.volumeId);
      if (vol && !vol.isImporting && (vol.pageCount > 0 || vol.totalBytes > 0)) {
        return true;
      }
    } else if (task.type === 'upload') {
      const remoteInfo = await listRemote();
      if (remoteInfo.isLoggedIn && remoteInfo.remoteVolumes) {
        const rv = remoteInfo.remoteVolumes.find((v) => v.id === task.volumeId);
        if (rv && rv.status === 'ready') {
          return true;
        }
      }
    }
  } catch {}
  return false;
}

/**
 * Kích hoạt xử lý hàng đợi với bảo vệ đa tab bằng Web Locks API
 */
export function triggerProcess() {
  if (_isProcessing) return;
  if (_queue.length === 0) {
    clearLockRetry();
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    navigator.locks
      .request('tcl_comic_sync_queue', { ifAvailable: true }, async (lock) => {
        if (!lock) {
          // Tab khác đang giữ lock và xử lý queue, hẹn giờ 5s thử lại (Lỗi 2)
          scheduleLockRetry();
          return;
        }
        clearLockRetry();
        try {
          await processQueueLoop();
        } finally {
          if (_queue.length > 0 && !_isPaused) {
            scheduleLockRetry();
          }
        }
      })
      .catch(() => {
        processQueueLoop().catch(() => {});
      });
  } else {
    processQueueLoop().catch(() => {});
  }
}

/**
 * Vòng lặp xử lý từng tác vụ trong hàng đợi
 */
async function processQueueLoop() {
  if (_isProcessing) return;
  _isProcessing = true;

  try {
    while (_queue.length > 0) {
      if (_isPaused && !_queue[0].priority) {
        break;
      }

      // Kiểm tra bảo vệ bộ nhớ đối với tác vụ tải về (A5)
      const nextTask = _queue[0];
      if (nextTask.type === 'download' && !nextTask.priority) {
        const est = await checkStorageEstimate();
        if (!est.ok) {
          _storageWarning = true;
          notifySubscribers();
          break; // Tạm dừng tự tải về
        } else {
          _storageWarning = false;
        }
      }

      const task = _queue.shift();

      // Kiểm tra lại trạng thái thực tế: nếu tập đã được tab khác hoàn tất thì bỏ qua (Lỗi 2)
      const alreadyDone = await isTaskAlreadyCompleted(task);
      if (alreadyDone) {
        console.log(`[ComicSyncQueue] Tập ${task.volumeId} đã hoàn tất bởi tab khác, bỏ qua task ${task.type}.`);
        if (task.resolve) task.resolve({ ok: true, volumeId: task.volumeId, alreadyDone: true });
        continue;
      }

      _activeTask = {
        id: task.id,
        type: task.type,
        volumeId: task.volumeId,
        seriesId: task.seriesId,
        volumeTitle: task.volumeTitle || '',
        current: 0,
        total: 100,
        percent: 0,
        phase: 'start',
        error: null,
      };
      _activeAbortController = new AbortController();
      const signal = _activeAbortController.signal;
      notifySubscribers();

      const progressCallback = (p) => {
        if (_activeTask && _activeTask.id === task.id) {
          _activeTask.current = p.current || 0;
          _activeTask.total = p.total || 100;
          _activeTask.percent = p.percent || 0;
          _activeTask.phase = p.phase || 'working';
          notifySubscribers();
        }
        if (task.onProgress) {
          try {
            task.onProgress(p);
          } catch {}
        }
      };

      try {
        if (task.type === 'download') {
          const dlFn = _customDownloadVolume || downloadVolume;
          await dlFn(task.volumeId, {
            onProgress: progressCallback,
            signal,
          });
          clearTaskFailure(task.volumeId, 'download');
          try {
            localStorage.removeItem(`${NO_AUTODL_PREFIX}${task.volumeId}`);
          } catch {}
        } else if (task.type === 'upload') {
          const uplFn = _customUploadVolume || uploadVolume;
          await uplFn(task.volumeId, {
            onProgress: progressCallback,
            signal,
          });
          clearTaskFailure(task.volumeId, 'upload');
          try {
            localStorage.removeItem(`${NO_AUTOUPL_PREFIX}${task.volumeId}`);
          } catch {}
        }

        if (task.resolve) task.resolve({ ok: true, volumeId: task.volumeId });
      } catch (err) {
        const isAbort =
          signal.aborted ||
          err.name === 'AbortError' ||
          err.message?.includes('hủy') ||
          err.message?.includes('tạm dừng');

        if (_isPauseAborting) {
          // Bị dừng bởi pauseSync: trả task về đầu queue để tiếp tục khi resume
          _isPauseAborting = false;
          _queue.unshift(task);
          notifySubscribers();
          break;
        }

        if (isAbort) {
          // Bị hủy bởi cancelTask: không ghi nhận lỗi backoff
          console.log(`[ComicSyncQueue] Task ${task.type} cho tập ${task.volumeId} đã bị hủy.`);
          if (task.reject) task.reject(err);
          continue;
        }

        console.warn(`[ComicSyncQueue] Task ${task.type} cho tập ${task.volumeId} gặp lỗi:`, err);
        if (_activeTask) {
          _activeTask.error = err.message || String(err);
        }

        // Xử lý Rate Limit (429)
        if (err.code === 'RATE_LIMITED' || err.status === 429) {
          const waitSecs = err.retryAfterSeconds || 60;
          _rateLimitResumeAt = Date.now() + waitSecs * 1000;
          console.warn(`[ComicSyncQueue] Rate limited, tạm dừng ${waitSecs}s trước khi tự tiếp tục.`);
          _queue.unshift(task);
          notifySubscribers();

          if (_rateLimitTimer) clearTimeout(_rateLimitTimer);
          _rateLimitTimer = setTimeout(() => {
            _rateLimitTimer = null;
            _rateLimitResumeAt = null;
            notifySubscribers();
            if (!_isPaused) {
              triggerProcess();
            }
          }, waitSecs * 1000);

          break; // Thoát vòng lặp, chờ timer tiếp tục
        }

        // Ghi nhận lỗi và kích hoạt backoff luỹ thừa (Lỗi 1)
        recordTaskFailure(task.volumeId, task.type, err);

        if (task.reject) task.reject(err);
      } finally {
        _activeTask = null;
        _activeAbortController = null;
        notifySubscribers();
      }
    }
  } finally {
    _isProcessing = false;
    notifySubscribers();
  }
}

/**
 * Kiểm tra và kích hoạt tự động đồng bộ (A2, A3)
 */
export async function checkAndTriggerAutoSync() {
  if (_isPaused) return;

  const loggedIn = await isCloudAvailable();
  if (!loggedIn) return;

  try {
    const remoteInfo = await listRemote();
    if (!remoteInfo.isLoggedIn) return;

    const autoDl = isAutoDownloadEnabled();
    const autoUpl = isAutoUploadEnabled();
    const storageEst = await checkStorageEstimate();

    if (!storageEst.ok) {
      _storageWarning = true;
      notifySubscribers();
    } else {
      _storageWarning = false;
    }

    const now = Date.now();

    for (const [volId, info] of Object.entries(remoteInfo.volumeStatusMap)) {
      // A2: Tự tải về các tập 'cloud_only'
      if (info.status === 'cloud_only' && autoDl && storageEst.ok) {
        // Kiểm tra lỗi / backoff của tập này
        const fail = getVolumeFailure(volId, 'download');
        if (fail && (fail.stopped || now < (fail.nextRetryAt || 0))) {
          continue; // Bỏ qua nếu đang trong thời gian nghỉ hoặc đã bị ngừng
        }

        const noDl = typeof localStorage !== 'undefined' && localStorage.getItem(`${NO_AUTODL_PREFIX}${volId}`) === '1';
        if (!noDl) {
          enqueueDownload(volId, info.remote?.series_id, {
            volumeTitle: info.remote?.title || '',
          });
        }
      }

      // A3: Tự tải lên các tập 'local_only' (ngừng toàn bộ nếu vượt hạn mức Cloud 8GB)
      if (info.status === 'local_only' && autoUpl && !_uploadQuotaExceeded) {
        const fail = getVolumeFailure(volId, 'upload');
        if (fail && (fail.stopped || now < (fail.nextRetryAt || 0))) {
          continue; // Bỏ qua nếu đang trong thời gian nghỉ hoặc đã bị ngừng
        }

        const noUpl = typeof localStorage !== 'undefined' && localStorage.getItem(`${NO_AUTOUPL_PREFIX}${volId}`) === '1';
        if (!noUpl) {
          enqueueUpload(volId, info.local?.seriesId, {
            volumeTitle: info.local?.title || '',
          });
        }
      }
    }
  } catch (err) {
    console.warn('[ComicSyncQueue] checkAndTriggerAutoSync gặp lỗi:', err);
  }
}

/**
 * Khởi động các bộ lắng nghe sự kiện vòng đời trình duyệt
 */
export function initLifecycleListeners() {
  if (_lifecycleAttached) return;
  if (typeof window === 'undefined') return;
  _lifecycleAttached = true;

  // Lắng nghe tín hiệu Realtime A6
  window.addEventListener('tcl_comic_realtime_signal', () => {
    checkAndTriggerAutoSync().catch(() => {});
  });

  // Lắng nghe tab visibility và focus: thử lại lock nếu queue còn task
  const onVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      if (_queue.length > 0 && !_isProcessing && !_isPaused) {
        triggerProcess();
      }
      checkAndTriggerAutoSync().catch(() => {});
    }
  };
  window.addEventListener('focus', onVisible);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible);
  }

  // Lắng nghe khi có mạng trở lại
  window.addEventListener('online', () => {
    checkAndTriggerAutoSync().catch(() => {});
  });

  // Chu kỳ thăm dò 60 giây khi ứng dụng đang mở
  if (_pollTimer) clearInterval(_pollTimer);
  _pollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      checkAndTriggerAutoSync().catch(() => {});
    }
  }, 60000);

  // Kích hoạt một lượt kiểm tra ban đầu sau 2 giây
  setTimeout(() => {
    checkAndTriggerAutoSync().catch(() => {});
  }, 2000);
}

/**
 * Reset hàng đợi dùng cho kiểm thử
 */
export function resetQueueForTesting() {
  _queue = [];
  _activeTask = null;
  if (_activeAbortController) {
    try {
      _activeAbortController.abort();
    } catch {}
    _activeAbortController = null;
  }
  _isProcessing = false;
  _isPaused = false;
  _isPauseAborting = false;
  _storageWarning = false;
  _uploadQuotaExceeded = false;
  _rateLimitResumeAt = null;
  if (_rateLimitTimer) {
    clearTimeout(_rateLimitTimer);
    _rateLimitTimer = null;
  }
  clearLockRetry();
  _failMap.clear();
  _customUploadVolume = null;
  _customDownloadVolume = null;
}

// Tự động khởi tạo bộ lắng nghe nếu chạy trong môi trường trình duyệt
if (typeof window !== 'undefined') {
  initLifecycleListeners();
}
