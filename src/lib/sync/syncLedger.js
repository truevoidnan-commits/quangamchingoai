import { logSyncEvent } from './syncLog.js';
/**
 * Quản lý sổ đồng bộ (Ledger), cờ bẩn (Dirty flags) và bia mộ (Tombstones) cho local-first sync
 */

export const LEDGER_KEY = 'tcl_sync_ledger';
export const DIRTY_KEY = 'tcl_sync_dirty';
export const TOMBSTONES_KEY = 'tcl_sync_tombstones';
export const DEVICE_ID_KEY = 'tcl_device_id';

let _syncBypassDirty = false;

export function setSyncBypassDirty(bypass) {
  _syncBypassDirty = Boolean(bypass);
}

export function isSyncBypassDirty() {
  return _syncBypassDirty;
}

export function getDeviceId() {
  try {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch {
    return 'dev_unknown';
  }
}

export function getSyncLedger() {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    return raw ? JSON.parse(raw) : { novels: {}, cultivation: { lastSyncedRev: 0, lastCloudUpdatedAt: 0 } };
  } catch {
    return { novels: {}, cultivation: { lastSyncedRev: 0, lastCloudUpdatedAt: 0 } };
  }
}

export function saveSyncLedger(ledger) {
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
  } catch (e) {
    console.warn('Lỗi khi lưu tcl_sync_ledger:', e);
  }
}

export function getNovelLastSyncedProgressAt(novelId) {
  if (!novelId) return 0;
  const ledger = getSyncLedger();
  return ledger.novels?.[novelId]?.lastSyncedProgressAt || 0;
}

export function setNovelLastSyncedProgressAt(novelId, timestamp) {
  if (!novelId) return;
  const ledger = getSyncLedger();
  if (!ledger.novels) ledger.novels = {};
  if (!ledger.novels[novelId]) ledger.novels[novelId] = {};
  ledger.novels[novelId].lastSyncedProgressAt = timestamp;
  saveSyncLedger(ledger);
}

/**
 * Lấy điểm mốc đồng bộ nội dung chuẩn cho một truyện:
 * Trả về giá trị lớn nhất giữa lastPulledContentAt và lastPushedContentAt.
 */
export function getContentSyncPoint(ledger, novelId) {
  if (!ledger || !novelId) return 0;
  const novelEntry = ledger.novels?.[novelId];
  if (!novelEntry) return 0;
  return Math.max(novelEntry.lastPulledContentAt || 0, novelEntry.lastPushedContentAt || 0);
}

/**
 * Ghi nhận nội dung đã được PULL thành công từ Cloud.
 * Cập nhật lastPulledContentAt và NÂNG CẢ lastPushedContentAt để không ngộ nhận cần push.
 * Tuyệt đối KHÔNG bao giờ reset trường còn lại về 0.
 */
export function recordContentPulled(ledger, novelId, cloudContentUpdatedAt) {
  if (!ledger || !novelId) return;
  if (!ledger.novels) ledger.novels = {};
  if (!ledger.novels[novelId]) ledger.novels[novelId] = {};
  const entry = ledger.novels[novelId];
  const ts = typeof cloudContentUpdatedAt === 'number' && cloudContentUpdatedAt > 0
    ? cloudContentUpdatedAt
    : Date.now();
  entry.lastPulledContentAt = Math.max(entry.lastPulledContentAt || 0, ts);
  entry.lastPushedContentAt = Math.max(entry.lastPushedContentAt || 0, ts);
}

/**
 * Ghi nhận nội dung đã được PUSH thành công lên Cloud.
 * Cập nhật lastPushedContentAt và NÂNG CẢ lastPulledContentAt.
 * Tuyệt đối KHÔNG bao giờ reset trường còn lại về 0.
 */
export function recordContentPushed(ledger, novelId, timestamp) {
  if (!ledger || !novelId) return;
  if (!ledger.novels) ledger.novels = {};
  if (!ledger.novels[novelId]) ledger.novels[novelId] = {};
  const entry = ledger.novels[novelId];
  const ts = typeof timestamp === 'number' && timestamp > 0
    ? timestamp
    : Date.now();
  entry.lastPushedContentAt = Math.max(entry.lastPushedContentAt || 0, ts);
  entry.lastPulledContentAt = Math.max(entry.lastPulledContentAt || 0, ts);
}

export function getDirtyNovels() {
  try {
    const raw = localStorage.getItem(DIRTY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const result = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'number') {
        const item = { t: val, reason: 'unknown' };
        Object.defineProperty(item, 'valueOf', { value: () => item.t });
        result[key] = item;
      } else if (val && typeof val === 'object') {
        const item = { t: val.t || Date.now(), reason: val.reason || 'unknown' };
        Object.defineProperty(item, 'valueOf', { value: () => item.t });
        result[key] = item;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function getDirtyNovelDetails(novelId) {
  if (!novelId) return null;
  const dirty = getDirtyNovels();
  return dirty[novelId] || null;
}

export function markNovelDirty(novelId, timestamp = Date.now(), reason = 'unknown') {
  if (_syncBypassDirty || !novelId) return;
  try {
    const raw = localStorage.getItem(DIRTY_KEY);
    const dirtyMap = raw ? JSON.parse(raw) : {};
    const ts = typeof timestamp === 'number' && timestamp > 0 ? timestamp : Date.now();
    const finalReason = String(reason || 'unknown');
    dirtyMap[novelId] = {
      t: ts,
      reason: finalReason,
    };
    localStorage.setItem(DIRTY_KEY, JSON.stringify(dirtyMap));

    try {
      logSyncEvent({
        level: 'info',
        src: 'local',
        evt: 'dirty_marked',
        novelId,
        reason: finalReason,
      });
    } catch {}
  } catch (e) {}
}

export function clearNovelDirty(novelId) {
  try {
    const raw = localStorage.getItem(DIRTY_KEY);
    if (!raw) return;
    const dirtyMap = JSON.parse(raw);
    if (novelId) {
      delete dirtyMap[novelId];
    }
    localStorage.setItem(DIRTY_KEY, JSON.stringify(dirtyMap));
  } catch (e) {}
}

export function getTombstones() {
  try {
    const raw = localStorage.getItem(TOMBSTONES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function recordNovelTombstone(novelId, timestamp = Date.now()) {
  if (_syncBypassDirty || !novelId) return;
  try {
    const tombstones = getTombstones();
    tombstones[novelId] = timestamp;
    localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(tombstones));
    clearNovelDirty(novelId);
  } catch (e) {}
}

export function removeTombstone(novelId) {
  try {
    const tombstones = getTombstones();
    if (tombstones[novelId]) {
      delete tombstones[novelId];
      localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(tombstones));
    }
  } catch (e) {}
}

export const SYNC_LOCK_KEY = 'tcl_sync_lock_ts';

export function acquireSyncLock() {
  try {
    const lockRaw = localStorage.getItem(SYNC_LOCK_KEY);
    const lockTs = parseInt(lockRaw || '0', 10);
    const now = Date.now();
    if (lockTs > 0 && now - lockTs < 120000) {
      return false;
    }
    localStorage.setItem(SYNC_LOCK_KEY, String(now));
    return true;
  } catch {
    return true;
  }
}

export function refreshSyncLock() {
  const now = Date.now();
  try {
    localStorage.setItem(SYNC_LOCK_KEY, String(now));
  } catch {}
  try {
    const raw = localStorage.getItem('tcl_sync_status');
    if (raw) {
      const s = JSON.parse(raw);
      if (s.state === 'syncing') {
        s.heartbeatAt = now;
        localStorage.setItem('tcl_sync_status', JSON.stringify(s));
      }
    }
  } catch {}
}

export function releaseSyncLock() {
  try {
    localStorage.removeItem(SYNC_LOCK_KEY);
  } catch {}
}
