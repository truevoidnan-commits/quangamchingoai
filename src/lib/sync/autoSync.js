/**
 * src/lib/sync/autoSync.js
 * Đồng bộ hai chiều tự động cho Phase 2.
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

export { pullNovelProgressNow, acquireSyncLock, releaseSyncLock, refreshSyncLock };

export const AUTO_SYNC_KEY = 'tcl_auto_sync';
export const SYNC_STATUS_KEY = 'tcl_sync_status';

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
 */
export function getSyncStatus() {
  try {
    const raw = localStorage.getItem(SYNC_STATUS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    state: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'idle',
    message: '',
    lastSyncedAt: 0,
    attentionReason: '',
    parallelDeviceDetected: false,
  };
}

export function setSyncStatus(patch) {
  const current = getSyncStatus();
  const next = { ...current, ...patch };
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
 */
export async function runAutoSync(customSupabase = null, options = {}) {
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
    return { skipped: true, reason: 'backoff_waiting' };
  }

  // Khóa chống chạy trùng
  const lockAcquired = acquireSyncLock();
  if (!lockAcquired) {
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

  const userId = session.user.id;
  setSyncStatus({ state: 'syncing', message: 'Đang đồng bộ tự động...' });

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
      .select('id, updated_at, content_updated_at, deleted_at, title, chapter_count, content_path')
      .eq('user_id', userId);

    if (novelsErr) {
      errors.push(`Lỗi tải danh sách truyện từ Cloud: ${novelsErr.message}`);
      throw novelsErr;
    }

    const { data: cloudCultivation, error: cultErr } = await client
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
      releaseSyncLock();
      return { attention: true, reason: 'first_sync' };
    }

    let hasAttention = false;
    let attentionReason = '';

    // 3. Xử lý Bia Mộ (Tombstones)
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
            console.warn(`Lỗi cập nhật bia mộ cho truyện "${tombNovelId}":`, tombUpdateErr.message);
            errors.push(`Lỗi cập nhật bia mộ: ${tombUpdateErr.message}`);
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

    // 4. Đồng bộ Truyện (Novels)
    const activeCloudNovels = (cloudNovels || []).filter(n => !n.deleted_at);
    const activeCloudMap = new Map(activeCloudNovels.map(n => [n.id, n]));
    const localMap = new Map(getLibrary({ includeHidden: true }).map(l => [l.id, l]));

    // Map chuẩn hóa tiêu đề cloud để phát hiện trùng
    const cloudActiveNormMap = new Map();
    for (const cn of activeCloudNovels) {
      const norm = normalizeTitle(cn.title);
      if (norm && !cloudActiveNormMap.has(norm)) {
        cloudActiveNormMap.set(norm, cn);
      }
    }

    let cloudLibraryModified = false;
    const allNovelIds = Array.from(new Set([...localMap.keys(), ...activeCloudMap.keys()]));
    for (const novelId of allNovelIds) {
      if (cloudNovelsMap.get(novelId)?.deleted_at || tombstones[novelId]) {
        continue;
      }
      const localItem = localMap.get(novelId);
      const cloudRow = activeCloudMap.get(novelId);

      // A. Chỉ có ở Cloud -> Kéo về máy đầy đủ
      if (cloudRow && !localItem) {
        try {
          await pullNovelFromCloud(client, userId, cloudRow, ledger);
          cloudLibraryModified = true;
        } catch (e) {
          console.warn('Auto pull novel error:', e.message);
          errors.push(e.message);
        }
        continue;
      }

      // B. Chỉ có ở Local -> Kiểm tra trùng tiêu đề & Đẩy lên Cloud đầy đủ
      if (localItem && !cloudRow) {
        const normLocalTitle = normalizeTitle(localItem.title);
        const matchingCloud = normLocalTitle ? cloudActiveNormMap.get(normLocalTitle) : null;
        if (matchingCloud && matchingCloud.id !== novelId) {
          // Bỏ qua, bật cờ 🔔
          hasAttention = true;
          attentionReason = 'duplicate_skipped';
          continue;
        }

        try {
          await pushNovelToCloud(client, userId, novelId, localItem, ledger);
        } catch (e) {
          console.warn('Auto push novel error:', e.message);
          errors.push(e.message);
        }
        continue;
      }

      // C. Cả 2 bên đều có:
      if (localItem && cloudRow) {
        // 1. Đồng bộ Metadata hai chiều trước (tiêu đề, mô tả, bìa, is_hidden, chapter_count)
        try {
          const metaRes = await syncNovelMetadata(client, userId, novelId, localItem, cloudRow, ledger);
          if (metaRes?.applied === 'cloud') {
            cloudLibraryModified = true;
          }
        } catch (e) {
          console.warn('Auto sync novel metadata error:', e.message);
          errors.push(e.message);
        }

        // 2. Kiểm tra xung đột và thay đổi Nội dung chương (Content)
        const localDirty = Boolean(dirty[novelId]);
        const novelLedger = ledger.novels[novelId] || {};
        const cloudContentChanged = (cloudRow.content_updated_at || 0) > (novelLedger.lastPushedContentAt || 0);

        if (localDirty && cloudContentChanged) {
          // Xung đột nội dung -> KHÔNG tự giải quyết, bật cờ 🔔
          hasAttention = true;
          attentionReason = 'novel_conflict';
          continue;
        }

        if (localDirty && !cloudContentChanged) {
          // Chỉ máy sửa nội dung chương -> Tải lên Cloud
          try {
            await pushNovelToCloud(client, userId, novelId, localItem, ledger);
          } catch (e) {
            console.warn('Auto upload novel content error:', e.message);
            errors.push(e.message);
          }
        } else if (!localDirty && cloudContentChanged) {
          // Chỉ cloud sửa nội dung chương -> Tải nội dung từ Cloud về
          try {
            const { data: blob, error: downloadErr } = await client.storage
              .from('novels')
              .download(`${userId}/${novelId}.json.gz`);
            if (downloadErr) throw downloadErr;
            if (blob) {
              const rawChapters = await decompressChapters(blob, `${novelId}.json.gz`);
              setSyncBypassDirty(true);
              try {
                await saveChaptersBulk(rawChapters, { skipDirty: true });
              } finally {
                setSyncBypassDirty(false);
              }
              novelLedger.lastPushedContentAt = cloudRow.content_updated_at;
              novelLedger.lastPulledAt = Date.now();
              ledger.novels[novelId] = novelLedger;
            }
          } catch (e) {
            console.warn('Auto download novel content error:', e.message);
            errors.push(e.message);
          }
        }
      }
    }

    refreshSyncLock();
    // 5. Đồng bộ Tu Vi (Cultivation)
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
    } else if (isCloudChanged && !isLocalRevChanged && cloudCultivation?.state) {
      if (isOwnCultDevice && cloudRev <= localRev) {
        // Chặn tiếng vang: nếu cloud.device_id === getDeviceId() và cloud.rev <= local._rev thì không cần ghi đè local
        if (!ledger.cultivation) ledger.cultivation = {};
        ledger.cultivation.lastSyncedRev = Math.max(ledger.cultivation.lastSyncedRev || 0, cloudRev, localRev);
        ledger.cultivation.lastCloudUpdatedAt = cloudCultivation.updated_at || Date.now();
      } else {
        // Cloud mới hơn -> Fast-forward (sao lưu trước khi áp dụng)
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
      // Local mới hơn (rev hoặc pendingSeconds)
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

    refreshSyncLock();
    // 6. Đồng bộ Tiến độ đọc
    try {
      await syncReadingProgress(client, userId, allNovelIds, { mode: 'normal' });
    } catch (e) {
      console.warn('Auto sync reading progress error:', e.message);
      errors.push(e.message);
    }

    if (cloudLibraryModified && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent('tcl_library_updated'));
      } catch {}
    }

    // KIỂM TRA LỖI: nếu có bất kỳ lỗi nào, KHÔNG ghi nhận đã đồng bộ (lastSyncedAt)
    // nhưng lưu những gì đã thật sự thành công (tu vi, truyện đã đẩy/kéo) để lần sau không bị xung đột giả
    if (errors.length > 0) {
      if (ledger) {
        saveSyncLedger(ledger);
      }
      recordBackoffFailure();
      releaseSyncLock();
      setSyncStatus({
        state: 'error',
        message: errors[0],
      });
      return { success: false, errors };
    }

    // Ghi nhận hoàn tất vào ledger
    ledger.lastSyncedAt = Date.now();
    saveSyncLedger(ledger);
    resetBackoff();

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
    return { success: true, parallelDeviceDetected };
  } catch (err) {
    if (ledger) {
      try {
        saveSyncLedger(ledger);
      } catch {}
    }
    recordBackoffFailure();
    releaseSyncLock();
    setSyncStatus({
      state: 'error',
      message: `Lỗi đồng bộ tự động: ${err.message}`,
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
    runAutoSync(customSupabase).catch(() => {});
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
        }
      }
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

  // 0. Lắng nghe thay đổi thư viện
  window.addEventListener('tcl_library_changed', () => {
    triggerLibraryDebouncedAutoSync(customSupabase);
  });

  // 1. Sau khi mở app ~2 giây
  setTimeout(() => {
    runAutoSync(customSupabase).catch(() => {});
  }, 2000);

  // 2. Khi tab chuyển 'visible'
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      quickSyncCloudMetadata(customSupabase)
        .then(() => runAutoSync(customSupabase))
        .catch(() => {});
    } else if (document.visibilityState === 'hidden') {
      // Khi tab ẩn: quick push progress, cultivation & library metadata (best effort)
      Promise.allSettled([
        quickPushProgressAndCultivation(customSupabase),
        quickPushLibraryMetadata(customSupabase),
      ]).catch(() => {});
    }
  });

  // 3. Sự kiện 'online'
  window.addEventListener('online', () => {
    runAutoSync(customSupabase, { force: true }).catch(() => {});
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
      runAutoSync(customSupabase).catch(() => {});
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
    runAutoSync(customSupabase).catch(() => {});
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

    // Đẩy tu vi nếu dirty hoặc pendingSeconds thay đổi
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
      } else {
        console.warn('Lỗi quick push tu vi:', cultErr.message);
      }
    }
  } catch (err) {
    console.warn('Lỗi quickPushProgressAndCultivation:', err.message);
  }
}
