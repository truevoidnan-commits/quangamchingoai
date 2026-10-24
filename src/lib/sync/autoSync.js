/**
 * src/lib/sync/autoSync.js
 * Đồng bộ hai chiều tự động cho Phase 2 (Ưu tiên việc nhẹ trước, truyện nặng sau).
 */

import { isProductionHost } from './envProtection.js';
import { supabase } from '../supabaseClient.js';
import {
  getSyncLedger,
  saveSyncLedger,
  getDirtyNovels,
  clearNovelDirty,
  getTombstones,
  removeTombstone,
  getDeviceId,
  setSyncBypassDirty,
  isSyncBypassDirty,
  acquireSyncLock,
  releaseSyncLock,
  refreshSyncLock,
  SYNC_LOCK_KEY,
} from './syncLedger.js';
import {
  getActiveProfile,
  getCultivationKey,
  getCultivationState,
} from '../cultivation.js';
import {
  getLibrary,
  getReadingProgress,
  removeFromLibrary,
  updateLibraryItem,
} from '../storage.js';
import {
  getNovel,
  saveNovel,
  saveChaptersBulk,
  deleteNovelDB,
} from '../db.js';
import {
  backupCultivationState,
  decompressChapters,
  normalizeTitle,
  checkFirstSyncCondition,
  applyCloudReadingProgress,
  syncReadingProgress,
  pullNovelProgressNow,
  pullNovelFromCloud,
  pushNovelToCloud,
  syncNovelMetadata,
} from './syncEngine.js';
import {
  startRealtime,
  stopRealtime,
  notifyOtherDevices,
} from './realtimeSignal.js';
import {
  logSyncEvent,
  recordSyncSuccess,
  recordSyncFailure,
  classifyErrorCode,
} from './syncLog.js';

export { pullNovelProgressNow, acquireSyncLock, releaseSyncLock, refreshSyncLock };

export const AUTO_SYNC_KEY = 'tcl_auto_sync';
export const SYNC_STATUS_KEY = 'tcl_sync_status';
export const SYNC_LOCK_TIMEOUT_MS = 120000; // 2 phút
export const SYNC_STATUS_STALE_MS = 5 * 60 * 1000; // 5 phút
export const SYNC_HEARTBEAT_TIMEOUT_MS = SYNC_LOCK_TIMEOUT_MS; // alias tương thích ngược

const BACKOFF_DELAYS = [30000, 60000, 120000, 300000, 900000]; // 30s, 1p, 2p, 5p, 15p
let _backoffIndex = 0;
let _nextRetryTimestamp = 0;
let _progressDebounceTimer = null;
let _initialized = false;
let _intervalTimer = null;

// Modal open flags
let _isConflictDialogOpen = false;

export function setConflictDialogOpen(open) {
  _isConflictDialogOpen = Boolean(open);
}

export function isConflictDialogOpen() {
  return _isConflictDialogOpen;
}

/**
 * Kiểm tra trạng thái bật/tắt của công tắc tự động đồng bộ.
 * Trên môi trường test (!isProductionHost()): luôn trả về false.
 * Trên production host: mặc định BẬT sau khi đăng nhập (nếu chưa có giá trị lưu).
 */
export function isAutoSyncEnabled() {
  if (!isProductionHost()) return false;
  try {
    const stored = localStorage.getItem(AUTO_SYNC_KEY);
    if (stored === null) return true;
    return stored === 'true' || stored === '1';
  } catch {
    return false;
  }
}

export function setAutoSyncEnabled(enabled) {
  if (!isProductionHost() && enabled) {
    return false;
  }
  try {
    localStorage.setItem(AUTO_SYNC_KEY, enabled ? 'true' : 'false');
    notifyStatusChange();
    return true;
  } catch {
    return false;
  }
}

/**
 * Quản lý trạng thái đồng bộ cho UI (Header, SyncPage)
 * Tự động phát hiện và dọn dẹp trạng thái 'syncing' bị kẹt (khóa hết hạn hoặc heartbeat quá 2 phút).
 */
export function getSyncStatus() {
  let status = null;
  try {
    const raw = localStorage.getItem(SYNC_STATUS_KEY);
    if (raw) status = JSON.parse(raw);
  } catch {}

  if (!status) {
    status = {
      state: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'idle',
      message: '',
      lastSyncedAt: 0,
      attentionReason: '',
      parallelDeviceDetected: false,
    };
  }

  // B. TRẠNG THÁI KẸT: nếu state là 'syncing' nhưng khóa tcl_sync_lock_ts đã hết hạn VÀ heartbeat cũ quá ngưỡng 5 phút
  if (status.state === 'syncing') {
    const now = Date.now();
    let lockActive = false;
    try {
      const lockRaw = localStorage.getItem(SYNC_LOCK_KEY);
      const lockTs = parseInt(lockRaw || '0', 10);
      if (lockTs > 0 && now - lockTs < SYNC_LOCK_TIMEOUT_MS) {
        lockActive = true;
      }
    } catch {}

    const heartbeatActive = Boolean(
      status.heartbeatAt && now - status.heartbeatAt < SYNC_STATUS_STALE_MS
    );

    // Chỉ xóa trạng thái 'syncing' khi CẢ HAI: lock hết hạn VÀ heartbeat của status > SYNC_STATUS_STALE_MS
    if (!lockActive && !heartbeatActive) {
      status = {
        ...status,
        state: 'idle',
        message: 'Lần đồng bộ trước bị gián đoạn',
      };
      try {
        localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(status));
      } catch {}
      logSyncEvent({
        level: 'warn',
        src: 'auto',
        evt: 'sync_stuck_cleared',
        msg: 'Dọn trạng thái đồng bộ bị kẹt',
      });
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('tcl_sync_status_changed', { detail: status }));
      }
    }
  }

  return status;
}

export function setSyncStatus(patch) {
  const current = getSyncStatus();
  const next = { ...current, ...patch };
  if (next.state === 'syncing') {
    const now = Date.now();
    if (!next.startedAt || current.state !== 'syncing') {
      next.startedAt = now;
    }
    next.heartbeatAt = now;
  }
  try {
    localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(next));
  } catch {}
  notifyStatusChange(next);
}

function notifyStatusChange(status = null) {
  if (typeof window !== 'undefined') {
    const detail = status || getSyncStatus();
    window.dispatchEvent(new CustomEvent('tcl_sync_status_changed', { detail }));
  }
}

export function getBackoffDelay() {
  return BACKOFF_DELAYS[_backoffIndex] || 30000;
}

export function resetBackoff() {
  _backoffIndex = 0;
  _nextRetryTimestamp = 0;
}

export function recordBackoffFailure() {
  _nextRetryTimestamp = Date.now() + (BACKOFF_DELAYS[_backoffIndex] || 30000);
  _backoffIndex = Math.min(_backoffIndex + 1, BACKOFF_DELAYS.length - 1);
}

/**
 * Fast-forward Tu vi khi mở app (chờ tối đa timeoutMs, mặc định 3 giây)
 */
export async function pullCultivationBeforeMeditation(customSupabase = null, { timeoutMs = 3000 } = {}) {
  const client = customSupabase || supabase;
  if (!client || !client.auth) return { skipped: true };
  if (getActiveProfile() !== 'real') return { skipped: true, reason: 'sandbox_profile' };

  let session = null;
  try {
    const { data } = await client.auth.getSession();
    session = data?.session;
  } catch {
    return { skipped: true };
  }
  if (!session?.user) return { skipped: true };

  const userId = session.user.id;
  const ledger = getSyncLedger();
  const localState = getCultivationState();
  const localRev = typeof localState?._rev === 'number' ? localState._rev : 0;
  const lastSyncedRev = ledger.cultivation?.lastSyncedRev || 0;
  const lastSyncedPending = ledger.cultivation?.lastSyncedPending ?? 0;
  const localPending = parseInt(localStorage.getItem(getCultivationKey('pending_seconds', 'real')) || '0', 10) || 0;

  try {
    let timeoutId;
    const fetchPromise = client
      .from('cultivation')
      .select('rev, state, updated_at, device_id')
      .eq('user_id', userId)
      .single();

    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Timeout pull tu vi')), timeoutMs);
    });

    const res = await Promise.race([fetchPromise, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);

    const { data: cloudCult, error } = res || {};
    if (error || !cloudCult) return { skipped: true };

    const cloudRev = cloudCult.rev || 0;
    const isCloudNewer = cloudRev > lastSyncedRev;
    const isLocalUnchanged = localRev <= lastSyncedRev;
    const isOwnDevice = Boolean(cloudCult.device_id && cloudCult.device_id === getDeviceId());

    if (isOwnDevice && cloudRev <= localRev) {
      return { skipped: true, reason: 'own_device_not_newer' };
    }

    // Fast-forward
    if (isCloudNewer && isLocalUnchanged && cloudCult.state) {
      backupCultivationState(localState);
      const cloudState = { ...cloudCult.state };
      cloudState._rev = cloudRev;
      cloudState._updatedAt = cloudCult.updated_at || Date.now();
      const cloudPending = cloudState.__meta?.pendingSeconds ?? 0;
      delete cloudState.__meta;

      let targetPending = localPending;
      if (localPending === lastSyncedPending) {
        targetPending = cloudPending;
        try {
          localStorage.setItem(getCultivationKey('pending_seconds', 'real'), String(cloudPending));
        } catch {}
      }

      try {
        localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(cloudState));
      } catch {}

      ledger.cultivation = {
        lastSyncedRev: cloudRev,
        lastSyncedPending: targetPending,
        lastCloudUpdatedAt: cloudCult.updated_at || Date.now(),
      };
      saveSyncLedger(ledger);

      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(new CustomEvent('cultivation_updated', { detail: cloudState }));
        if (!isOwnDevice && cloudCult.device_id) {
          window.dispatchEvent(new CustomEvent('cultivation_cloud_applied', {
            detail: { rev: cloudRev, fromDeviceId: cloudCult.device_id }
          }));
        }
      }
      return { fastForwarded: true, state: cloudState };
    }

    return { skipped: true };
  } catch {
    return { skipped: true };
  }
}

/**
 * Hàm thực thi Đồng bộ Tự động (Auto Sync Engine)
 * THỨ TỰ ƯU TIÊN: Việc nhẹ trước, Truyện nặng sau.
 */
export async function runAutoSync(customSupabase = null, options = {}) {
  const syncSource = options.src || 'auto';

  // A. BẢO VỆ MÔI TRƯỜNG & ĐIỀU KIỆN TIÊN QUYẾT
  if (!isProductionHost()) {
    return { skipped: true, reason: 'not_production_host' };
  }
  if (!isAutoSyncEnabled() && !options.force) {
    return { skipped: true, reason: 'auto_sync_disabled' };
  }
  if (getActiveProfile() !== 'real') {
    return { skipped: true, reason: 'sandbox_profile' };
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setSyncStatus({ state: 'offline' });
    return { skipped: true, reason: 'offline' };
  }
  if (_isConflictDialogOpen) {
    return { skipped: true, reason: 'conflict_dialog_open' };
  }

  // Backoff check
  const now = Date.now();
  if (now < _nextRetryTimestamp && !options.force) {
    logSyncEvent({
      level: 'warn',
      src: syncSource,
      evt: 'backoff_waiting',
      ms: _nextRetryTimestamp - now,
      count: _backoffIndex,
    });
    return { skipped: true, reason: 'backoff_waiting' };
  }

  // Khóa chống chạy trùng
  const lockAcquired = acquireSyncLock();
  if (!lockAcquired) {
    logSyncEvent({ level: 'info', src: syncSource, evt: 'lock_busy' });
    return { skipped: true, reason: 'locked' };
  }

  const client = customSupabase || supabase;
  let session = null;
  try {
    const { data: { session: s }, error: authErr } = await client.auth.getSession();
    if (authErr || !s?.user) {
      releaseSyncLock();
      return { skipped: true, reason: 'not_logged_in' };
    }
    session = s;
  } catch (err) {
    releaseSyncLock();
    return { skipped: true, reason: 'auth_error' };
  }

  const syncStartTime = Date.now();
  const userId = session.user.id;
  const pushedScopes = new Set();
  setSyncStatus({ state: 'syncing', message: 'Đang đồng bộ tiến độ và tu vi...' });
  logSyncEvent({ level: 'info', src: syncSource, evt: 'sync_started' });

  const errors = [];
  let ledger = null;

  try {
    ledger = getSyncLedger();
    const dirty = getDirtyNovels();
    const tombstones = getTombstones();
    const localLibrary = getLibrary({ includeHidden: true });
    const localCultivation = getCultivationState();

    // 1. Hỏi thăm nhẹ: KHÔNG select cột cover
    const { data: cloudNovels, error: novelsErr } = await client
      .from('novels')
      .select('id, updated_at, content_updated_at, deleted_at, title, chapter_count, content_path, is_hidden')
      .eq('user_id', userId);

    if (novelsErr) {
      errors.push(`Lỗi tải danh sách truyện từ Cloud: ${novelsErr.message}`);
      throw novelsErr;
    }

    const { data: cloudCultivation } = await client
      .from('cultivation')
      .select('rev, updated_at, device_id, state')
      .eq('user_id', userId)
      .single();

    // Cảnh báo dùng song song (Parallel device warning)
    let parallelDeviceDetected = false;
    if (
      cloudCultivation?.device_id &&
      cloudCultivation.device_id !== getDeviceId() &&
      cloudCultivation.updated_at &&
      now - cloudCultivation.updated_at < 120000
    ) {
      parallelDeviceDetected = true;
    }

    // 2. Kiểm tra nếu lần đầu đồng bộ cả 2 bên có dữ liệu -> KHÔNG tự chạy, bật cờ 🔔
    const firstSyncCheck = checkFirstSyncCondition({
      cloudNovels: cloudNovels || [],
      cloudCultivation,
      localLibrary,
      localCultivation,
      ledger,
    });

    if (firstSyncCheck.bothHaveData && (ledger.lastSyncedAt === 0 || !ledger.lastSyncedAt)) {
      setSyncStatus({
        state: 'attention',
        attentionReason: 'first_sync',
        message: 'Cần bạn chọn nguồn dữ liệu lần đầu tại trang Đồng bộ',
        parallelDeviceDetected,
      });
      logSyncEvent({ level: 'warn', src: syncSource, evt: 'first_sync_attention' });
      releaseSyncLock();
      return { attention: true, reason: 'first_sync' };
    }

    let hasAttention = false;
    let attentionReason = '';
    let cloudLibraryModified = false;

    // =========================================================
    // GIAI ĐOẠN 1: VIỆC NHẸ TRƯỚC (Light Phase)
    // 1. Tombstones (Xóa truyện)
    // 2. Metadata truyện nhẹ đã có ở 2 bên
    // 3. Tiến độ đọc
    // 4. Tu vi (hồ sơ Thật)
    // =========================================================
    const lightStartTime = Date.now();
    logSyncEvent({ level: 'info', src: syncSource, evt: 'light_phase_started' });

    // A. Xử lý Bia Mộ (Tombstones) - PHẢI CHẠY TRƯỚC TIẾN ĐỘ ĐỌC
    const cloudNovelsMap = new Map((cloudNovels || []).map(n => [n.id, n]));
    for (const [tombNovelId, deletedAtMs] of Object.entries(tombstones)) {
      const cloudRow = cloudNovelsMap.get(tombNovelId);
      let tombSuccess = true;
      if (cloudRow) {
        if (!cloudRow.deleted_at || cloudRow.deleted_at < deletedAtMs) {
          const { error: tombUpdateErr } = await client
            .from('novels')
            .update({ deleted_at: deletedAtMs })
            .eq('user_id', userId)
            .eq('id', tombNovelId);

          if (tombUpdateErr) {
            console.warn(`Lỗi cập nhật tombstone cho "${tombNovelId}":`, tombUpdateErr.message);
            errors.push(`Lỗi cập nhật tombstone: ${tombUpdateErr.message}`);
            tombSuccess = false;
          }
        }

        if (tombSuccess) {
          try {
            const { error: removeErr } = await client.storage.from('novels').remove([
              `${userId}/${tombNovelId}.json.gz`,
              `${userId}/${tombNovelId}.zip`,
            ]);
            if (removeErr) {
              console.warn(`Lỗi xóa storage của truyện "${tombNovelId}":`, removeErr.message);
              errors.push(`Lỗi xóa storage: ${removeErr.message}`);
              tombSuccess = false;
            }
          } catch (e) {
            console.warn('Lỗi storage remove:', e.message);
            errors.push(e.message);
            tombSuccess = false;
          }
        }
      }
      if (tombSuccess) {
        removeTombstone(tombNovelId);
      }
    }

    // Nhận bia mộ từ cloud xuống cục bộ
    setSyncBypassDirty(true);
    try {
      for (const cn of cloudNovels || []) {
        if (cn.deleted_at) {
          const localItem = localLibrary.find(l => l.id === cn.id);
          if (localItem && cn.deleted_at > (localItem.updatedAt || 0)) {
            await deleteNovelDB(cn.id, { skipDirty: true });
            removeFromLibrary(cn.id);
          }
        }
      }
    } finally {
      setSyncBypassDirty(false);
    }

    // Chuẩn bị danh sách truyện active (đã trừ tombstones)
    const activeCloudNovels = (cloudNovels || []).filter(n => !n.deleted_at);
    const activeCloudMap = new Map(activeCloudNovels.map(n => [n.id, n]));
    const localMap = new Map(getLibrary({ includeHidden: true }).map(l => [l.id, l]));
    const allNovelIds = Array.from(new Set([...localMap.keys(), ...activeCloudMap.keys()]));

    // B. Đồng bộ Metadata nhẹ hai chiều cho các truyện đã có ở cả hai bên
    for (const novelId of allNovelIds) {
      if (cloudNovelsMap.get(novelId)?.deleted_at || tombstones[novelId]) {
        continue;
      }
      const localItem = localMap.get(novelId);
      const cloudRow = activeCloudMap.get(novelId);
      if (localItem && cloudRow) {
        try {
          const metaRes = await syncNovelMetadata(client, userId, novelId, localItem, cloudRow, ledger);
          if (metaRes?.applied === 'cloud') {
            cloudLibraryModified = true;
          } else if (metaRes?.applied === 'local') {
            pushedScopes.add('library');
          }
        } catch (e) {
          console.warn('Auto sync novel metadata error:', e.message);
          errors.push(e.message);
        }
      }
    }

    // C. Đồng bộ Tiến độ đọc
    try {
      const progRes = await syncReadingProgress(client, userId, allNovelIds, { mode: 'normal' });
      if (progRes?.progressPushed > 0) {
        pushedScopes.add('progress');
      }
    } catch (e) {
      console.warn('Auto sync reading progress error:', e.message);
      errors.push(e.message);
    }

    refreshSyncLock();

    // D. Đồng bộ Tu Vi (Cultivation - chỉ hồ sơ Thật)
    const localState = getCultivationState();
    let localRev = typeof localState?._rev === 'number' ? localState._rev : 0;
    const lastSyncedRev = ledger.cultivation?.lastSyncedRev || 0;
    const lastSyncedPending = ledger.cultivation?.lastSyncedPending ?? 0;
    const cloudRev = cloudCultivation?.rev || 0;
    const localPending = parseInt(localStorage.getItem(getCultivationKey('pending_seconds', 'real')) || '0', 10) || 0;

    const cloudPending = cloudCultivation?.state?.__meta?.pendingSeconds ?? 0;
    const isCloudRevChanged = cloudRev > lastSyncedRev;
    const isCloudPendingChanged = cloudRev === lastSyncedRev && (cloudCultivation?.updated_at || 0) > (ledger.cultivation?.lastCloudUpdatedAt || 0) && cloudPending !== lastSyncedPending;
    const isCloudChanged = isCloudRevChanged || isCloudPendingChanged;

    const isLocalRevChanged = localRev > lastSyncedRev;
    const isLocalPendingChanged = localPending !== lastSyncedPending;
    const isLocalChanged = isLocalRevChanged || isLocalPendingChanged;

    const isOwnCultDevice = Boolean(cloudCultivation?.device_id && cloudCultivation.device_id === getDeviceId());

    if (isCloudRevChanged && isLocalRevChanged) {
      // Cả hai cùng sửa tu vi -> XUNG ĐỘT, KHÔNG ghi đè, bật cờ 🔔
      hasAttention = true;
      attentionReason = 'cultivation_conflict';
      logSyncEvent({ level: 'warn', src: syncSource, evt: 'cultivation_conflict' });
    } else if (isCloudChanged && !isLocalRevChanged && cloudCultivation?.state) {
      if (isOwnCultDevice && cloudRev <= localRev) {
        if (!ledger.cultivation) ledger.cultivation = {};
        ledger.cultivation.lastSyncedRev = Math.max(ledger.cultivation.lastSyncedRev || 0, cloudRev, localRev);
        ledger.cultivation.lastCloudUpdatedAt = cloudCultivation.updated_at || Date.now();
      } else {
        backupCultivationState(localState);
        const cloudState = { ...cloudCultivation.state };
        cloudState._rev = cloudRev;
        cloudState._updatedAt = cloudCultivation.updated_at || Date.now();
        const cloudPending = cloudState.__meta?.pendingSeconds ?? 0;
        delete cloudState.__meta;

        let targetPending = localPending;
        if (localPending === lastSyncedPending) {
          targetPending = cloudPending;
          try {
            localStorage.setItem(getCultivationKey('pending_seconds', 'real'), String(cloudPending));
          } catch {}
        }

        try {
          localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(cloudState));
        } catch {}

        ledger.cultivation = {
          lastSyncedRev: cloudRev,
          lastSyncedPending: targetPending,
          lastCloudUpdatedAt: cloudCultivation.updated_at || Date.now(),
        };

        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('cultivation_updated', { detail: cloudState }));
          if (!isOwnCultDevice && cloudCultivation?.device_id) {
            window.dispatchEvent(new CustomEvent('cultivation_cloud_applied', {
              detail: { rev: cloudRev, fromDeviceId: cloudCultivation.device_id }
            }));
          }
        }
      }
    } else if (!isCloudChanged && isLocalChanged) {
      const lastPendingPushAt = ledger.cultivation?.lastPendingPushAt || 0;
      const canPush = isLocalRevChanged || (now - lastPendingPushAt >= 60000) || options.force;
      if (canPush) {
        const payloadState = { ...localState, __meta: { pendingSeconds: localPending } };
        const nowTime = Date.now();

        const { error: cultUpsertErr } = await client.from('cultivation').upsert({
          user_id: userId,
          state: payloadState,
          rev: localRev,
          updated_at: nowTime,
          device_id: getDeviceId(),
        }, { onConflict: 'user_id' });

        if (!cultUpsertErr) {
          pushedScopes.add('cultivation');
          ledger.cultivation = {
            lastSyncedRev: localRev,
            lastSyncedPending: localPending,
            lastCloudUpdatedAt: nowTime,
            lastPendingPushAt: nowTime,
          };
        } else {
          console.warn('Lỗi upsert tu vi lên cloud:', cultUpsertErr.message);
          errors.push(`Lỗi cập nhật tu vi lên cloud: ${cultUpsertErr.message}`);
        }
      }
    }

    // LƯU SỔ ĐỒNG BỘ NGAY SAU GIAI ĐOẠN NHẸ để không mất kết quả nếu giai đoạn nặng sau đó lỗi
    saveSyncLedger(ledger);
    logSyncEvent({
      level: 'info',
      src: syncSource,
      evt: 'light_phase_completed',
      ms: Date.now() - lightStartTime,
    });

    // =========================================================
    // GIAI ĐOẠN 2: TRUYỆN NẶNG (Heavy Phase)
    // Kéo/đẩy nội dung chương (gz) tuần tự, truyện nhỏ trước truyện lớn
    // =========================================================
    const heavyStartTime = Date.now();

    // Map chuẩn hóa tiêu đề cloud để phát hiện trùng
    const cloudActiveNormMap = new Map();
    for (const cn of activeCloudNovels) {
      const norm = normalizeTitle(cn.title);
      if (norm && !cloudActiveNormMap.has(norm)) {
        cloudActiveNormMap.set(norm, cn);
      }
    }

    const heavyTasks = [];
    for (const novelId of allNovelIds) {
      if (cloudNovelsMap.get(novelId)?.deleted_at || tombstones[novelId]) {
        continue;
      }
      const localItem = localMap.get(novelId);
      const cloudRow = activeCloudMap.get(novelId);

      if (cloudRow && !localItem) {
        heavyTasks.push({
          type: 'pull',
          novelId,
          cloudRow,
          localItem: null,
          chapterCount: cloudRow.chapter_count || 0,
          title: cloudRow.title || novelId,
          isHidden: Boolean(cloudRow.is_hidden),
        });
      } else if (localItem && !cloudRow) {
        heavyTasks.push({
          type: 'push_local_only',
          novelId,
          cloudRow: null,
          localItem,
          chapterCount: localItem.chapterCount || localItem.totalChapters || 0,
          title: localItem.title || novelId,
          isHidden: Boolean(localItem.isHidden),
        });
      } else if (localItem && cloudRow) {
        const localDirty = Boolean(dirty[novelId]);
        const novelLedger = ledger.novels[novelId] || {};
        const cloudContentChanged = (cloudRow.content_updated_at || 0) > (novelLedger.lastPushedContentAt || 0);

        if (localDirty && cloudContentChanged) {
          heavyTasks.push({
            type: 'conflict',
            novelId,
            cloudRow,
            localItem,
            chapterCount: Math.max(localItem.chapterCount || 0, cloudRow.chapter_count || 0),
            title: localItem.title || cloudRow.title || novelId,
            isHidden: Boolean(localItem.isHidden || cloudRow.is_hidden),
          });
        } else if (localDirty && !cloudContentChanged) {
          heavyTasks.push({
            type: 'push_dirty',
            novelId,
            cloudRow,
            localItem,
            chapterCount: localItem.chapterCount || localItem.totalChapters || 0,
            title: localItem.title || novelId,
            isHidden: Boolean(localItem.isHidden),
          });
        } else if (!localDirty && cloudContentChanged) {
          heavyTasks.push({
            type: 'pull_changed',
            novelId,
            cloudRow,
            localItem,
            chapterCount: cloudRow.chapter_count || 0,
            title: localItem.title || cloudRow.title || novelId,
            isHidden: Boolean(localItem.isHidden || cloudRow.is_hidden),
          });
        }
      }
    }

    // Sắp xếp: Truyện nhỏ trước, truyện lớn sau (theo số chương)
    heavyTasks.sort((a, b) => a.chapterCount - b.chapterCount);
    logSyncEvent({
      level: 'info',
      src: syncSource,
      evt: 'heavy_phase_started',
      count: heavyTasks.length,
    });

    const newlyPulledNovels = [];
    const totalHeavy = heavyTasks.length;

    for (let i = 0; i < totalHeavy; i++) {
      refreshSyncLock();
      const task = heavyTasks[i];
      const taskStartTime = Date.now();
      const isHidden = task.isHidden;
      const displayMsg = isHidden
        ? `Đang tải truyện ẩn ${i + 1}/${totalHeavy}...`
        : `Đang tải truyện ${i + 1}/${totalHeavy}: "${task.title}"...`;

      setSyncStatus({ state: 'syncing', message: displayMsg });

      if (task.type === 'conflict') {
        hasAttention = true;
        if (attentionReason !== 'cultivation_conflict') {
          attentionReason = 'novel_conflict';
        }
        logSyncEvent({ level: 'warn', src: syncSource, evt: 'novel_conflict', novelId: task.novelId });
        continue;
      }

      if (task.type === 'pull') {
        try {
          refreshSyncLock();
          await pullNovelFromCloud(client, userId, task.cloudRow, ledger);
          refreshSyncLock();
          cloudLibraryModified = true;
          newlyPulledNovels.push(task.novelId);
          saveSyncLedger(ledger);
          logSyncEvent({
            level: 'info',
            src: syncSource,
            evt: 'novel_pull',
            novelId: task.novelId,
            count: task.chapterCount,
            ms: Date.now() - taskStartTime,
          });
        } catch (e) {
          console.warn('Auto pull novel error:', e.message);
          errors.push(e.message);
        }
        continue;
      }

      if (task.type === 'push_local_only') {
        const normLocalTitle = normalizeTitle(task.localItem.title);
        const matchingCloud = normLocalTitle ? cloudActiveNormMap.get(normLocalTitle) : null;
        if (matchingCloud && matchingCloud.id !== task.novelId) {
          hasAttention = true;
          if (!attentionReason) {
            attentionReason = 'duplicate_skipped';
          }
          logSyncEvent({ level: 'warn', src: syncSource, evt: 'duplicate_skipped', novelId: task.novelId });
          continue;
        }

        try {
          refreshSyncLock();
          const pushRes = await pushNovelToCloud(client, userId, task.novelId, task.localItem, ledger);
          refreshSyncLock();
          pushedScopes.add('content');
          pushedScopes.add('library');
          saveSyncLedger(ledger);
          logSyncEvent({
            level: 'info',
            src: syncSource,
            evt: 'novel_push',
            novelId: task.novelId,
            count: task.chapterCount,
            bytes: pushRes?.bytes,
            ms: Date.now() - taskStartTime,
          });
        } catch (e) {
          console.warn('Auto push novel error:', e.message);
          errors.push(e.message);
        }
        continue;
      }

      if (task.type === 'push_dirty') {
        try {
          refreshSyncLock();
          const pushRes = await pushNovelToCloud(client, userId, task.novelId, task.localItem, ledger);
          refreshSyncLock();
          pushedScopes.add('content');
          saveSyncLedger(ledger);
          logSyncEvent({
            level: 'info',
            src: syncSource,
            evt: 'novel_push',
            novelId: task.novelId,
            count: task.chapterCount,
            bytes: pushRes?.bytes,
            ms: Date.now() - taskStartTime,
          });
        } catch (e) {
          console.warn('Auto upload novel content error:', e.message);
          errors.push(e.message);
        }
        continue;
      }

      if (task.type === 'pull_changed') {
        try {
          const { data: blob, error: downloadErr } = await client.storage
            .from('novels')
            .download(`${userId}/${task.novelId}.json.gz`);
          if (downloadErr) throw downloadErr;
          if (blob) {
            refreshSyncLock();
            const rawChapters = await decompressChapters(blob, `${task.novelId}.json.gz`);
            refreshSyncLock();
            setSyncBypassDirty(true);
            try {
              await saveChaptersBulk(rawChapters, { skipDirty: true });
            } finally {
              setSyncBypassDirty(false);
            }
            refreshSyncLock();
            const novelLedger = ledger.novels[task.novelId] || {};
            novelLedger.lastPushedContentAt = task.cloudRow.content_updated_at;
            novelLedger.lastPulledAt = Date.now();
            ledger.novels[task.novelId] = novelLedger;
            saveSyncLedger(ledger);
            newlyPulledNovels.push(task.novelId);
            logSyncEvent({
              level: 'info',
              src: syncSource,
              evt: 'novel_pull',
              novelId: task.novelId,
              count: rawChapters.length,
              ms: Date.now() - taskStartTime,
            });
          }
        } catch (e) {
          console.warn('Auto download novel content error:', e.message);
          errors.push(e.message);
        }
        continue;
      }
    }

    // Lượt bổ sung: Đồng bộ lại tiến độ đọc cho các truyện vừa mới được kéo về ở giai đoạn nặng
    if (newlyPulledNovels.length > 0) {
      try {
        const suppRes = await syncReadingProgress(client, userId, newlyPulledNovels, { mode: 'normal' });
        if (suppRes?.progressPushed > 0) {
          pushedScopes.add('progress');
        }
      } catch (e) {
        console.warn('Auto supplementary sync reading progress error:', e.message);
        errors.push(e.message);
      }
    }

    logSyncEvent({
      level: 'info',
      src: syncSource,
      evt: 'heavy_phase_completed',
      ms: Date.now() - heavyStartTime,
      count: heavyTasks.length,
    });

    if (cloudLibraryModified && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent('tcl_library_updated'));
      } catch {}
    }

    // KIỂM TRA LỖI: nếu có bất kỳ lỗi nào, KHÔNG ghi nhận đã đồng bộ (lastSyncedAt)
    // nhưng lưu những gì đã thật sự thành công để lần sau không bị xung đột giả
    if (errors.length > 0) {
      if (ledger) {
        saveSyncLedger(ledger);
      }
      recordBackoffFailure();
      recordSyncFailure(errors);
      releaseSyncLock();
      setSyncStatus({
        state: 'error',
        message: errors[0],
      });
      logSyncEvent({
        level: 'error',
        src: syncSource,
        evt: 'sync_failed',
        code: classifyErrorCode(errors[0]),
        msg: errors[0],
        ms: Date.now() - syncStartTime,
      });
      return { success: false, errors };
    }

    // Ghi nhận hoàn tất vào ledger và reset backoff
    ledger.lastSyncedAt = Date.now();
    saveSyncLedger(ledger);
    resetBackoff();
    recordSyncSuccess();

    if (pushedScopes.size > 0) {
      notifyOtherDevices(Array.from(pushedScopes));
    }

    if (hasAttention) {
      setSyncStatus({
        state: 'attention',
        attentionReason,
        message: 'Có dữ liệu cần bạn kiểm tra tại trang Đồng bộ',
        lastSyncedAt: ledger.lastSyncedAt,
        parallelDeviceDetected,
      });
      releaseSyncLock();
      return { success: true, attention: true, reason: attentionReason };
    }

    setSyncStatus({
      state: 'idle',
      message: 'Đã đồng bộ',
      lastSyncedAt: ledger.lastSyncedAt,
      parallelDeviceDetected,
    });
    releaseSyncLock();

    logSyncEvent({
      level: 'info',
      src: syncSource,
      evt: 'sync_completed',
      ms: Date.now() - syncStartTime,
    });

    return { success: true, parallelDeviceDetected };
  } catch (err) {
    if (ledger) {
      try {
        saveSyncLedger(ledger);
      } catch {}
    }
    recordBackoffFailure();
    recordSyncFailure(err);
    releaseSyncLock();
    setSyncStatus({
      state: 'error',
      message: `Lỗi đồng bộ tự động: ${err.message}`,
    });
    logSyncEvent({
      level: 'error',
      src: syncSource,
      evt: 'sync_failed',
      code: classifyErrorCode(err),
      msg: err.message,
      ms: Date.now() - syncStartTime,
    });
    return { success: false, error: err.message };
  }
}

let _libraryDebounceTimer = null;

export function isLibraryDebouncePending() {
  return _libraryDebounceTimer !== null;
}

export function cancelLibraryDebounceTimer() {
  if (_libraryDebounceTimer) {
    clearTimeout(_libraryDebounceTimer);
    _libraryDebounceTimer = null;
  }
}

/**
 * Lắng nghe thay đổi thư viện với debounce 8s
 * Chỉ chạy khi isProductionHost() và isAutoSyncEnabled() và không trong Sandbox
 */
export function triggerLibraryDebouncedAutoSync(customSupabase = null) {
  if (isSyncBypassDirty()) return;
  if (!isProductionHost() || !isAutoSyncEnabled()) return;
  if (getActiveProfile() !== 'real') return;
  if (_libraryDebounceTimer) {
    clearTimeout(_libraryDebounceTimer);
  }
  _libraryDebounceTimer = setTimeout(() => {
    _libraryDebounceTimer = null;
    runAutoSync(customSupabase, { src: 'auto' }).catch(() => {});
  }, 8000);
}

/**
 * Đẩy nhanh metadata thư viện khi tab ẩn / pagehide (best effort)
 */
export async function quickPushLibraryMetadata(customSupabase = null) {
  if (!isProductionHost() || !isAutoSyncEnabled()) return;
  if (getActiveProfile() !== 'real') return;
  const client = customSupabase || supabase;
  if (!client?.auth) return;

  try {
    const { data: { session } } = await client.auth.getSession();
    if (!session?.user) return;
    const userId = session.user.id;

    const ledger = getSyncLedger();
    const library = getLibrary({ includeHidden: true });
    let pushedLibrary = false;
    for (const item of library) {
      const lastSyncedMetaAt = ledger.novels?.[item.id]?.lastSyncedMetaAt || 0;
      if ((item.updatedAt || 0) > lastSyncedMetaAt) {
        const n = await getNovel(item.id);
        const updatePayload = {
          title: item.title,
          description: item.description || n?.description || '',
          is_hidden: Boolean(item.isHidden),
          chapter_count: item.chapterCount || (item.totalChapters || 0),
          updated_at: item.updatedAt,
        };

        // Chỉ gửi cover khi cover khác rỗng, tuyệt đối không gửi cover rỗng đè cover có sẵn
        if (n?.coverUrl && typeof n.coverUrl === 'string' && n.coverUrl.trim() !== '') {
          updatePayload.cover = n.coverUrl;
        }

        const { error } = await client
          .from('novels')
          .update(updatePayload)
          .eq('user_id', userId)
          .eq('id', item.id)
          .lt('updated_at', item.updatedAt);

        if (!error) {
          if (!ledger.novels) ledger.novels = {};
          if (!ledger.novels[item.id]) ledger.novels[item.id] = {};
          ledger.novels[item.id].lastSyncedMetaAt = item.updatedAt;
          saveSyncLedger(ledger);
          pushedLibrary = true;
        }
      }
    }
    if (pushedLibrary) {
      notifyOtherDevices(['library']);
    }
  } catch (err) {
    console.warn('Lỗi quickPushLibraryMetadata:', err?.message);
  }
}

/**
 * Kéo nhanh metadata từ cloud khi tab 'visible'
 */
export async function quickSyncCloudMetadata(customSupabase = null) {
  if (!isProductionHost() || !isAutoSyncEnabled()) return false;
  if (getActiveProfile() !== 'real') return false;
  const client = customSupabase || supabase;
  if (!client?.auth) return false;

  try {
    const { data: { session } } = await client.auth.getSession();
    if (!session?.user) return false;
    const userId = session.user.id;

    // Chỉ select id, title, is_hidden, chapter_count, updated_at (KHÔNG select cover và description)
    const { data: cloudNovels, error } = await client
      .from('novels')
      .select('id, title, is_hidden, chapter_count, updated_at')
      .eq('user_id', userId);

    if (error || !cloudNovels) return false;

    let changed = false;
    const ledger = getSyncLedger();
    const localLibrary = getLibrary({ includeHidden: true });
    const localMap = new Map(localLibrary.map((n) => [n.id, n]));

    for (const cloudRow of cloudNovels) {
      const localItem = localMap.get(cloudRow.id);
      if (localItem) {
        if ((cloudRow.updated_at || 0) > (localItem.updatedAt || 0)) {
          try {
            // syncNovelMetadata tự lấy cover/description đầy đủ cho đúng một truyện khi cần
            const res = await syncNovelMetadata(client, userId, cloudRow.id, localItem, cloudRow, ledger);
            if (res?.applied === 'cloud') {
              changed = true;
            }
          } catch (e) {
            console.warn('Lỗi syncNovelMetadata trong quickSyncCloudMetadata:', e.message);
          }
        }
      }
    }

    if (changed) {
      saveSyncLedger(ledger);
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try {
          window.dispatchEvent(new CustomEvent('tcl_library_updated'));
        } catch {}
      }
    }
    return changed;
  } catch (err) {
    console.warn('Lỗi quickSyncCloudMetadata:', err?.message);
    return false;
  }
}

/**
 * Trình kích hoạt tự động theo vòng đời ứng dụng
 */
export function initAutoSync(customSupabase = null) {
  if (_initialized || typeof window === 'undefined') return;
  _initialized = true;

  // Dọn trạng thái kẹt nếu có từ phiên trước
  getSyncStatus();

  // Khởi động kết nối Realtime Signal cho người dùng đã đăng nhập
  const client = customSupabase || supabase;
  if (client?.auth) {
    client.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        startRealtime(client, session.user.id).catch(() => {});
      }
    }).catch(() => {});
  }

  // 0. Lắng nghe thay đổi thư viện
  window.addEventListener('tcl_library_changed', () => {
    triggerLibraryDebouncedAutoSync(customSupabase);
  });

  // 1. Sau khi mở app ~2 giây
  setTimeout(() => {
    runAutoSync(customSupabase, { src: 'startup' }).catch(() => {});
  }, 2000);

  // 2. Khi tab chuyển 'visible'
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      quickSyncCloudMetadata(customSupabase)
        .then(() => runAutoSync(customSupabase, { src: 'visibility' }))
        .catch(() => {});
    } else if (document.visibilityState === 'hidden') {
      Promise.allSettled([
        quickPushProgressAndCultivation(customSupabase),
        quickPushLibraryMetadata(customSupabase),
      ]).catch(() => {});
    }
  });

  // 3. Sự kiện 'online'
  window.addEventListener('online', () => {
    runAutoSync(customSupabase, { force: true, src: 'online' }).catch(() => {});
  });

  // 4. Sự kiện 'pagehide'
  window.addEventListener('pagehide', () => {
    Promise.allSettled([
      quickPushProgressAndCultivation(customSupabase),
      quickPushLibraryMetadata(customSupabase),
    ]).catch(() => {});
  });

  // 5. Mỗi 3 phút khi tab đang hiện
  _intervalTimer = setInterval(() => {
    if (document.visibilityState === 'visible') {
      runAutoSync(customSupabase, { src: 'interval' }).catch(() => {});
    }
  }, 3 * 60 * 1000);
}

/**
 * Lắng nghe thay đổi tiến độ đọc với debounce 30s
 */
export function notifyReadingProgressChanged(customSupabase = null) {
  if (!isProductionHost() || !isAutoSyncEnabled()) return;
  if (_progressDebounceTimer) {
    clearTimeout(_progressDebounceTimer);
  }
  _progressDebounceTimer = setTimeout(() => {
    runAutoSync(customSupabase, { src: 'auto' }).catch(() => {});
  }, 30000);
}

/**
 * Đẩy nhanh tiến độ và tu vi khi tab ẩn / pagehide (best effort)
 */
async function quickPushProgressAndCultivation(customSupabase = null) {
  if (!isProductionHost() || !isAutoSyncEnabled()) return;
  if (getActiveProfile() !== 'real') return;
  const client = customSupabase || supabase;
  if (!client?.auth) return;

  try {
    const { data: { session } } = await client.auth.getSession();
    if (!session?.user) return;
    const userId = session.user.id;

    const ledger = getSyncLedger();
    const localState = getCultivationState();
    const localRev = typeof localState?._rev === 'number' ? localState._rev : 0;
    const lastSyncedRev = ledger.cultivation?.lastSyncedRev || 0;
    const lastSyncedPending = ledger.cultivation?.lastSyncedPending ?? 0;
    const localPending = parseInt(localStorage.getItem(getCultivationKey('pending_seconds', 'real')) || '0', 10) || 0;

    const revChanged = localRev > lastSyncedRev;
    const pendingChanged = localPending !== lastSyncedPending;

    if (revChanged || pendingChanged) {
      const nowTime = Date.now();
      const { error: cultErr } = await client.from('cultivation').upsert({
        user_id: userId,
        state: { ...localState, __meta: { pendingSeconds: localPending } },
        rev: localRev,
        updated_at: nowTime,
        device_id: getDeviceId(),
      }, { onConflict: 'user_id' });

      if (!cultErr) {
        ledger.cultivation = {
          ...ledger.cultivation,
          lastSyncedRev: localRev,
          lastSyncedPending: localPending,
          lastCloudUpdatedAt: nowTime,
        };
        saveSyncLedger(ledger);
        notifyOtherDevices(['cultivation']);
      } else {
        console.warn('Lỗi quick push tu vi:', cultErr.message);
      }
    }
  } catch (err) {
    console.warn('Lỗi quickPushProgressAndCultivation:', err.message);
  }
}
