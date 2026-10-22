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

export function getDirtyNovels() {
  try {
    const raw = localStorage.getItem(DIRTY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function markNovelDirty(novelId, timestamp = Date.now()) {
  if (_syncBypassDirty || !novelId) return;
  try {
    const dirty = getDirtyNovels();
    dirty[novelId] = timestamp;
    localStorage.setItem(DIRTY_KEY, JSON.stringify(dirty));
  } catch (e) {}
}

export function clearNovelDirty(novelId) {
  try {
    const dirty = getDirtyNovels();
    if (novelId) {
      delete dirty[novelId];
    }
    localStorage.setItem(DIRTY_KEY, JSON.stringify(dirty));
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

export function releaseSyncLock() {
  try {
    localStorage.removeItem(SYNC_LOCK_KEY);
  } catch {}
}
