/**
 * src/lib/comics/comicSyncQueue.js
 * Hàng đợi đồng bộ tuần tự trung tâm cho Truyện Tranh (Phase 3).
 *
 * Chức năng:
 * - Xử lý tuần tự từng tập một (upload hoặc download), mỗi tập tải song song tối đa 4 trang.
 * - Chống xung đột giữa các tab bằng Web Locks API (navigator.locks).
 * - Tự động tải về (A2) và tự động tải lên (A3) khi có điều kiện phù hợp.
 * - Hỗ trợ ưu tiên (priority) khi người dùng bấm "Đọc" tập trên Cloud (A4).
 * - Bảo vệ bộ nhớ thiết bị: tạm dừng tự tải khi dung lượng máy > 70% (A5).
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
export const STORAGE_LIMIT_RATIO = 0.7; // 70% bộ nhớ

// Trạng thái hàng đợi
let _queue = []; // Danh sách tác vụ đang chờ: [{ id, type, volumeId, seriesId, priority, volumeTitle, resolve, reject, onProgress }]
let _activeTask = null; // Tác vụ đang thực thi: { id, type, volumeId, seriesId, volumeTitle, current, total, percent, phase, error }
let _isProcessing = false;
let _isPaused = false;
let _storageWarning = false;
let _listeners = new Set();
let _pollTimer = null;
let _lifecycleAttached = false;

// Đọc cài đặt khởi đầu từ localStorage
try {
  if (typeof localStorage !== 'undefined') {
    _isPaused = localStorage.getItem(SYNC_PAUSED_KEY) === 'true';
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
 * Tạm dừng toàn bộ hàng đợi tự động
 */
export function pauseSync() {
  _isPaused = true;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SYNC_PAUSED_KEY, 'true');
    }
  } catch {}
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
  // Khởi động các bộ lắng nghe sự kiện ngoại cảnh nếu chưa bật
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

/**
 * Lấy trạng thái của một tập truyện trong hàng đợi
 * @param {string} volumeId
 * @returns {{ state: 'active'|'queued'|'idle', task: Object|null }}
 */
export function getVolumeQueueState(volumeId) {
  if (_activeTask && _activeTask.volumeId === volumeId) {
    return { state: 'active', task: _activeTask };
  }
  const queued = _queue.find((t) => t.volumeId === volumeId);
  if (queued) {
    return { state: 'queued', task: queued };
  }
  return { state: 'idle', task: null };
}

/**
 * Đưa tác vụ vào hàng đợi (tuần tự, không trùng lặp tập)
 */
function enqueueTask(task) {
  // Nếu tập này đang là active task, không thêm trùng
  if (_activeTask && _activeTask.volumeId === task.volumeId) {
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
    return;
  }

  if (task.priority) {
    // Đưa lên đầu danh sách chờ
    _queue.unshift(task);
  } else {
    _queue.push(task);
  }

  notifySubscribers();
  triggerProcess();
}

/**
 * Tải về ưu tiên (khi bấm Đọc vào tập Chỉ trên Cloud - A4)
 * Trả về Promise để màn hình hiển thị tiến độ và tự mở reader khi hoàn tất.
 */
export function priorityDownloadVolume(volumeId, seriesId, { volumeTitle = '', onProgress = null } = {}) {
  // Xóa dấu no_autodl để cho phép tải về
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`${NO_AUTODL_PREFIX}${volumeId}`);
    }
  } catch {}

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
export function enqueueDownload(volumeId, seriesId, { priority = false, volumeTitle = '' } = {}) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`${NO_AUTODL_PREFIX}${volumeId}`);
    }
  } catch {}

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
export function enqueueUpload(volumeId, seriesId, { priority = false, volumeTitle = '' } = {}) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`${NO_AUTOUPL_PREFIX}${volumeId}`);
    }
  } catch {}

  enqueueTask({
    id: `upl_${volumeId}_${Date.now()}`,
    type: 'upload',
    volumeId,
    seriesId,
    priority,
    volumeTitle,
  });
}

/**
 * Kích hoạt xử lý hàng đợi với bảo vệ đa tab bằng Web Locks API
 */
function triggerProcess() {
  if (_isProcessing) return;

  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    navigator.locks
      .request('tcl_comic_sync_queue', { ifAvailable: true }, async (lock) => {
        if (!lock) {
          // Tab khác đang giữ lock và xử lý queue
          return;
        }
        await processQueueLoop();
      })
      .catch(() => {
        // Fallback khi Web Locks ném ngoại lệ
        processQueueLoop().catch(() => {});
      });
  } else {
    // Môi trường không có Web Locks (NodeJS/kiểm thử)
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
      // Nếu hàng đợi bị tạm dừng, chỉ cho phép tác vụ ưu tiên (priority: true)
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
          await downloadVolume(task.volumeId, { onProgress: progressCallback });
          // Xóa dấu no_autodl khi tải về thành công
          try {
            localStorage.removeItem(`${NO_AUTODL_PREFIX}${task.volumeId}`);
          } catch {}
        } else if (task.type === 'upload') {
          await uploadVolume(task.volumeId, { onProgress: progressCallback });
          // Xóa dấu no_autoupl khi tải lên thành công
          try {
            localStorage.removeItem(`${NO_AUTOUPL_PREFIX}${task.volumeId}`);
          } catch {}
        }

        if (task.resolve) task.resolve({ ok: true, volumeId: task.volumeId });
      } catch (err) {
        console.warn(`[ComicSyncQueue] Task ${task.type} cho tập ${task.volumeId} gặp lỗi:`, err);
        if (_activeTask) {
          _activeTask.error = err.message || String(err);
        }

        // Xử lý Rate Limit
        if (err.code === 'RATE_LIMITED' || err.status === 429) {
          const waitSecs = err.retryAfterSeconds || 60;
          console.warn(`[ComicSyncQueue] Rate limited, tạm dừng ${waitSecs}s trước khi thử lại.`);
          // Đưa lại tác vụ vào đầu hàng đợi
          _queue.unshift(task);
          notifySubscribers();
          await new Promise((r) => setTimeout(r, waitSecs * 1000));
          continue;
        }

        if (task.reject) task.reject(err);
      } finally {
        _activeTask = null;
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

    for (const [volId, info] of Object.entries(remoteInfo.volumeStatusMap)) {
      // A2: Tự tải về các tập 'cloud_only'
      if (info.status === 'cloud_only' && autoDl && storageEst.ok) {
        const noDl = typeof localStorage !== 'undefined' && localStorage.getItem(`${NO_AUTODL_PREFIX}${volId}`) === '1';
        if (!noDl) {
          enqueueDownload(volId, info.remote?.series_id, {
            volumeTitle: info.remote?.title || '',
          });
        }
      }

      // A3: Tự tải lên các tập 'local_only'
      if (info.status === 'local_only' && autoUpl) {
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
 * Khởi động các bộ lắng nghe sự kiện vòng đời trình duyệt (Realtime, Focus, 60s poll)
 */
export function initLifecycleListeners() {
  if (_lifecycleAttached) return;
  if (typeof window === 'undefined') return;
  _lifecycleAttached = true;

  // Lắng nghe tín hiệu Realtime A6
  window.addEventListener('tcl_comic_realtime_signal', () => {
    checkAndTriggerAutoSync().catch(() => {});
  });

  // Lắng nghe tab visibility và focus
  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      checkAndTriggerAutoSync().catch(() => {});
    }
  };
  window.addEventListener('focus', onVisible);
  document.addEventListener('visibilitychange', onVisible);

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

// Tự động khởi tạo bộ lắng nghe nếu chạy trong môi trường trình duyệt
if (typeof window !== 'undefined') {
  initLifecycleListeners();
}
