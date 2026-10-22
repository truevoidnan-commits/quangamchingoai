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
} from '../storage.js';
import {
  getNovel,
  getChapters,
  saveNovel,
  saveChaptersBulk,
  deleteNovelDB,
} from '../db.js';
import {
  backupCultivationState,
  compressChapters,
  decompressChapters,
  normalizeTitle,
  checkFirstSyncCondition,
  applyCloudReadingProgress,
  syncReadingProgress,
  pullNovelProgressNow,
} from './syncEngine.js';

export { pullNovelProgressNow };

export const AUTO_SYNC_KEY = 'tcl_auto_sync';
export const SYNC_LOCK_KEY = 'tcl_sync_lock_ts';
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
 * Khóa chống chạy trùng giữa nhiều tab hoặc giữa đồng bộ tay và tự động.
 */
export function acquireSyncLock() {
  try {
    const lockRaw = localStorage.getItem(SYNC_LOCK_KEY);
    const lockTs = parseInt(lockRaw || '0', 10);
    const now = Date.now();
    // Nếu lock cũ chưa quá 2 phút thì bị coi là đang bị chiếm giữ
    if (lockTs > 0 && now - lockTs < 120000) {
      return false;
    }
    localStorage.setItem(SYNC_LOCK_KEY, String(now));
    return true;
  } catch {
    return true;
  }
}

export function releaseSyncLock() {
  try {
    localStorage.removeItem(SYNC_LOCK_KEY);
  } catch {}
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

    // Fast-forward
    if (isCloudNewer && isLocalUnchanged && cloudCult.state) {
      backupCultivationState(localState);
      const cloudState = { ...cloudCult.state };
      const pendingSeconds = cloudState.__meta?.pendingSeconds ?? 0;
      delete cloudState.__meta;

      try {
        localStorage.setItem(getCultivationKey('pending_seconds', 'real'), String(pendingSeconds));
        localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(cloudState));
      } catch {}

      ledger.cultivation = {
        lastSyncedRev: cloudRev,
        lastCloudUpdatedAt: cloudCult.updated_at || Date.now(),
      };
      saveSyncLedger(ledger);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cultivation_updated', { detail: cloudState }));
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

  try {
    const ledger = getSyncLedger();
    const dirty = getDirtyNovels();
    const tombstones = getTombstones();
    const localLibrary = getLibrary({ includeHidden: true });
    const localCultivation = getCultivationState();

    // 1. Hỏi thăm nhẹ: KHÔNG select cột cover
    const { data: cloudNovels, error: novelsErr } = await client
      .from('novels')
      .select('id, updated_at, content_updated_at, deleted_at, title, chapter_count')
      .eq('user_id', userId);

    if (novelsErr) throw novelsErr;

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
          if (tombUpdateErr) tombSuccess = false;
        }
        if (tombSuccess) {
          try {
            await client.storage.from('novels').remove([
              `${userId}/${tombNovelId}.json.gz`,
              `${userId}/${tombNovelId}.zip`,
            ]);
          } catch {}
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

    const allNovelIds = Array.from(new Set([...localMap.keys(), ...activeCloudMap.keys()]));
    for (const novelId of allNovelIds) {
      if (cloudNovelsMap.get(novelId)?.deleted_at || tombstones[novelId]) {
        continue;
      }
      const localItem = localMap.get(novelId);
      const cloudRow = activeCloudMap.get(novelId);

      // A. Chỉ có ở Cloud -> Kéo về máy
      if (cloudRow && !localItem) {
        try {
          const { data: blob, error: downloadErr } = await client.storage
            .from('novels')
            .download(`${userId}/${novelId}.json.gz`);
          if (!downloadErr && blob) {
            const rawChapters = await decompressChapters(blob, `${novelId}.json.gz`);
            await saveNovel({
              id: cloudRow.id,
              title: cloudRow.title,
              totalChapters: cloudRow.chapter_count || rawChapters.length,
              updatedAt: cloudRow.updated_at || Date.now(),
            });
            await saveChaptersBulk(rawChapters);
            ledger.novels[novelId] = {
              lastPushedContentAt: cloudRow.content_updated_at || cloudRow.updated_at || Date.now(),
              lastPulledAt: Date.now(),
            };
          }
        } catch (e) {
          console.warn('Auto pull novel error:', e);
        }
        continue;
      }

      // B. Chỉ có ở Local -> Kiểm tra trùng tiêu đề & Đẩy lên Cloud
      if (localItem && !cloudRow) {
        const normLocalTitle = normalizeTitle(localItem.title);
        const matchingCloud = normLocalTitle ? cloudActiveNormMap.get(normLocalTitle) : null;
        if (matchingCloud && matchingCloud.id !== novelId) {
          // Bỏ qua, bật cờ 🔔
          hasAttention = true;
          attentionReason = 'duplicate_skipped';
          continue;
        }

        // Tự động đẩy truyện mới
        try {
          const novel = await getNovel(novelId);
          const chapters = await getChapters(novelId);
          const chaptersJson = JSON.stringify(chapters || []);
          const { blob, ext, contentType } = await compressChapters(chaptersJson);
          const storagePath = `${userId}/${novelId}${ext}`;

          const { error: upErr } = await client.storage
            .from('novels')
            .upload(storagePath, blob, { contentType, upsert: true });

          if (!upErr) {
            const nowTime = Date.now();
            await client.from('novels').upsert({
              id: novelId,
              user_id: userId,
              title: localItem.title || novel?.title || 'Chưa đặt tên',
              chapter_count: (chapters || []).length,
              content_path: storagePath,
              content_updated_at: nowTime,
              updated_at: nowTime,
              deleted_at: null,
            }, { onConflict: 'user_id,id' });

            clearNovelDirty(novelId);
            ledger.novels[novelId] = {
              lastPushedContentAt: nowTime,
              lastPulledAt: nowTime,
            };
          }
        } catch (e) {
          console.warn('Auto push novel error:', e);
        }
        continue;
      }

      // C. Cả 2 bên đều có: Kiểm tra xung đột nội dung
      if (localItem && cloudRow) {
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
          // Chỉ máy sửa -> Đẩy lên
          try {
            const novel = await getNovel(novelId);
            const chapters = await getChapters(novelId);
            const { blob, ext, contentType } = await compressChapters(JSON.stringify(chapters || []));
            const storagePath = `${userId}/${novelId}${ext}`;
            const { error: upErr } = await client.storage
              .from('novels')
              .upload(storagePath, blob, { contentType, upsert: true });
            if (!upErr) {
              const nowTime = Date.now();
              await client.from('novels').upsert({
                id: novelId,
                user_id: userId,
                title: localItem.title || novel?.title || '',
                chapter_count: (chapters || []).length,
                content_path: storagePath,
                content_updated_at: nowTime,
                updated_at: nowTime,
                deleted_at: null,
              }, { onConflict: 'user_id,id' });
              clearNovelDirty(novelId);
              novelLedger.lastPushedContentAt = nowTime;
              ledger.novels[novelId] = novelLedger;
            }
          } catch (e) {}
        } else if (!localDirty && cloudContentChanged) {
          // Chỉ cloud sửa -> Tải về
          try {
            const { data: blob, error: downloadErr } = await client.storage
              .from('novels')
              .download(`${userId}/${novelId}.json.gz`);
            if (!downloadErr && blob) {
              const rawChapters = await decompressChapters(blob, `${novelId}.json.gz`);
              await saveChaptersBulk(rawChapters);
              novelLedger.lastPushedContentAt = cloudRow.content_updated_at;
              novelLedger.lastPulledAt = Date.now();
              ledger.novels[novelId] = novelLedger;
            }
          } catch (e) {}
        }
      }
    }

    // 5. Đồng bộ Tu Vi (Cultivation)
    const localState = getCultivationState();
    let localRev = typeof localState?._rev === 'number' ? localState._rev : 0;
    const lastSyncedRev = ledger.cultivation?.lastSyncedRev || 0;
    const cloudRev = cloudCultivation?.rev || 0;

    const isCloudChanged = cloudRev > lastSyncedRev;
    const isLocalChanged = localRev > lastSyncedRev;

    if (isCloudChanged && isLocalChanged) {
      // Cả hai cùng sửa tu vi -> XUNG ĐỘT, KHÔNG ghi đè, bật cờ 🔔
      hasAttention = true;
      attentionReason = 'cultivation_conflict';
    } else if (isCloudChanged && !isLocalChanged && cloudCultivation?.state) {
      // Cloud mới hơn -> Fast-forward (sao lưu trước khi áp dụng)
      backupCultivationState(localState);
      const cloudState = { ...cloudCultivation.state };
      const pendingSeconds = cloudState.__meta?.pendingSeconds ?? 0;
      delete cloudState.__meta;

      try {
        localStorage.setItem(getCultivationKey('pending_seconds', 'real'), String(pendingSeconds));
        localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(cloudState));
      } catch {}

      ledger.cultivation = {
        lastSyncedRev: cloudRev,
        lastCloudUpdatedAt: cloudCultivation.updated_at || Date.now(),
      };

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('cultivation_updated', { detail: cloudState }));
      }
    } else if (!isCloudChanged && isLocalChanged) {
      // Local mới hơn -> Đẩy lên Cloud
      let pendingSec = 0;
      try {
        pendingSec = parseInt(localStorage.getItem(getCultivationKey('pending_seconds', 'real')) || '0', 10) || 0;
      } catch {}
      const payloadState = { ...localState, __meta: { pendingSeconds: pendingSec } };
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
          lastCloudUpdatedAt: nowTime,
        };
      }
    }

    // 6. Đồng bộ Tiến độ đọc
    try {
      await syncReadingProgress(client, userId, allNovelIds, { mode: 'normal' });
    } catch (e) {
      console.warn('Auto sync reading progress error:', e);
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
    recordBackoffFailure();
    releaseSyncLock();
    setSyncStatus({
      state: 'error',
      message: `Lỗi đồng bộ tự động: ${err.message}`,
    });
    return { success: false, error: err.message };
  }
}

/**
 * Trình kích hoạt tự động theo vòng đời ứng dụng
 */
export function initAutoSync(customSupabase = null) {
  if (_initialized || typeof window === 'undefined') return;
  _initialized = true;

  // 1. Sau khi mở app ~2 giây
  setTimeout(() => {
    runAutoSync(customSupabase).catch(() => {});
  }, 2000);

  // 2. Khi tab chuyển 'visible'
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      runAutoSync(customSupabase).catch(() => {});
    } else if (document.visibilityState === 'hidden') {
      // Khi tab ẩn: quick push progress & cultivation (best effort)
      quickPushProgressAndCultivation(customSupabase).catch(() => {});
    }
  });

  // 3. Sự kiện 'online'
  window.addEventListener('online', () => {
    runAutoSync(customSupabase, { force: true }).catch(() => {});
  });

  // 4. Sự kiện 'pagehide'
  window.addEventListener('pagehide', () => {
    quickPushProgressAndCultivation(customSupabase).catch(() => {});
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

    // Đẩy tu vi nếu dirty
    const ledger = getSyncLedger();
    const localState = getCultivationState();
    const localRev = typeof localState?._rev === 'number' ? localState._rev : 0;
    const lastSyncedRev = ledger.cultivation?.lastSyncedRev || 0;

    if (localRev > lastSyncedRev) {
      let pendingSec = 0;
      try {
        pendingSec = parseInt(localStorage.getItem(getCultivationKey('pending_seconds', 'real')) || '0', 10) || 0;
      } catch {}
      const nowTime = Date.now();
      await client.from('cultivation').upsert({
        user_id: userId,
        state: { ...localState, __meta: { pendingSeconds: pendingSec } },
        rev: localRev,
        updated_at: nowTime,
        device_id: getDeviceId(),
      }, { onConflict: 'user_id' });
    }
  } catch {}
}
