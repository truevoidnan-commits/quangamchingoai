/**
 * localStorage helpers for catalog, reading settings, and Hidden Vault
 */

const LIBRARY_KEY = 'tcl_library';
const PROGRESS_KEY = 'tcl_progress';
const SETTINGS_KEY = 'tcl_reading_settings';
const VAULT_PWD_KEY = 'tcl_vault_pwd_hash';
const VAULT_HINT_KEY = 'tcl_vault_pwd_hint';

// ---- Simple Client-Side Hash Helper ----
function hashString(str) {
  let hash = 0x811c9dc5;
  const salt = 'TCL_VAULT_2026';
  const fullStr = salt + str;
  for (let i = 0; i < fullStr.length; i++) {
    hash ^= fullStr.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

// ---- Hidden Vault Password Management ----

export function hasVaultPassword() {
  return Boolean(localStorage.getItem(VAULT_PWD_KEY));
}

export const VAULT_PWD_UPDATED_AT_KEY = 'tcl_vault_pwd_updated_at';

export function getVaultPasswordInfo() {
  try {
    return {
      hash: localStorage.getItem(VAULT_PWD_KEY) || null,
      hint: localStorage.getItem(VAULT_HINT_KEY) || null,
      updatedAt: parseInt(localStorage.getItem(VAULT_PWD_UPDATED_AT_KEY) || '0', 10) || 0,
    };
  } catch {
    return { hash: null, hint: null, updatedAt: 0 };
  }
}

export function setVaultPasswordRaw({ hash, hint, updatedAt }) {
  if (!hash) return;
  try {
    localStorage.setItem(VAULT_PWD_KEY, hash);
    if (hint && hint.trim()) {
      localStorage.setItem(VAULT_HINT_KEY, hint.trim());
    } else {
      localStorage.removeItem(VAULT_HINT_KEY);
    }
    if (updatedAt) {
      localStorage.setItem(VAULT_PWD_UPDATED_AT_KEY, String(updatedAt));
    }
  } catch {}
}

export function setVaultPassword(password, hint = '') {
  if (!password || !password.trim()) return false;
  const hashed = hashString(password.trim());
  localStorage.setItem(VAULT_PWD_KEY, hashed);
  if (hint && hint.trim()) {
    localStorage.setItem(VAULT_HINT_KEY, hint.trim());
  } else {
    localStorage.removeItem(VAULT_HINT_KEY);
  }
  localStorage.setItem(VAULT_PWD_UPDATED_AT_KEY, String(Date.now()));
  return true;
}

export function verifyVaultPassword(password) {
  if (!password) return false;
  const storedHash = localStorage.getItem(VAULT_PWD_KEY);
  if (!storedHash) return false;
  return hashString(password.trim()) === storedHash;
}

export function changeVaultPassword(oldPassword, newPassword, newHint = '') {
  if (!verifyVaultPassword(oldPassword)) {
    return { success: false, message: 'Mật khẩu cũ không chính xác' };
  }
  if (!newPassword || !newPassword.trim()) {
    return { success: false, message: 'Mật khẩu mới không được để trống' };
  }
  setVaultPassword(newPassword, newHint);
  return { success: true, message: 'Đổi mật khẩu thành công' };
}

// ---- Hidden Vault Session & Active Mode ----
const VAULT_SESSION_KEY = 'tcl_vault_unlocked_session';
const VAULT_ACTIVE_TAB_KEY = 'tcl_vault_active_tab';

export function isVaultSessionUnlocked() {
  try {
    return sessionStorage.getItem(VAULT_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function setVaultSessionUnlocked(unlocked) {
  try {
    if (unlocked) {
      sessionStorage.setItem(VAULT_SESSION_KEY, '1');
    } else {
      sessionStorage.removeItem(VAULT_SESSION_KEY);
    }
  } catch {}
}

export function isVaultModeActive() {
  try {
    return sessionStorage.getItem(VAULT_ACTIVE_TAB_KEY) === '1';
  } catch {
    return false;
  }
}

export function setVaultModeActive(active) {
  try {
    if (active) {
      sessionStorage.setItem(VAULT_ACTIVE_TAB_KEY, '1');
    } else {
      sessionStorage.removeItem(VAULT_ACTIVE_TAB_KEY);
    }
  } catch {}
}

export function lockVaultSession() {
  try {
    sessionStorage.removeItem(VAULT_SESSION_KEY);
    sessionStorage.removeItem(VAULT_ACTIVE_TAB_KEY);
  } catch {}
}

export function getVaultHint() {
  return localStorage.getItem(VAULT_HINT_KEY) || '';
}

// ---- Library catalog (lightweight — id, title, coverThumb, chapterCount, isHidden) ----

export function getLibrary(options = {}) {
  const { includeHidden = false, onlyHidden = false } = options;
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (onlyHidden) {
      return list.filter(n => Boolean(n.isHidden));
    }
    if (includeHidden) {
      return list;
    }
    return list.filter(n => !n.isHidden);
  } catch {
    return [];
  }
}

export function getVisibleLibrary() {
  return getLibrary({ includeHidden: false });
}

export function getHiddenLibrary() {
  return getLibrary({ onlyHidden: true });
}

export function saveLibrary(library) {
  if (!Array.isArray(library)) return;
  // Lớp phòng thủ: loại bỏ trường coverUrl dạng data: URL (Base64 lớn) trước khi ghi vào localStorage
  const sanitized = library.map((item) => {
    if (!item) return item;
    const clean = { ...item };
    if (clean.coverUrl && /^data:/i.test(clean.coverUrl)) {
      delete clean.coverUrl;
    }
    return clean;
  });

  try {
    localStorage.setItem(LIBRARY_KEY, JSON.stringify(sanitized));
  } catch (err) {
    const isQuota =
      err?.name === 'QuotaExceededError' ||
      err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err?.code === 22 ||
      err?.code === 1014 ||
      err?.number === -2147024882 ||
      /quota/i.test(err?.message || '');
    if (isQuota) {
      throw new Error(
        'Bộ nhớ trình duyệt (localStorage) đã đầy. Vui lòng xóa bớt truyện không đọc hoặc giải phóng dữ liệu duyệt web để tiếp tục.'
      );
    }
    throw err;
  }
}

// ---- Library change event notification ----
const _libraryChangeListeners = new Set();

export function onLibraryChange(callback) {
  _libraryChangeListeners.add(callback);
  return () => _libraryChangeListeners.delete(callback);
}

export function notifyLibraryChanged(novelId = null) {
  _libraryChangeListeners.forEach((fn) => {
    try { fn(novelId); } catch {}
  });
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      const evt = typeof CustomEvent !== 'undefined'
        ? new CustomEvent('tcl_library_changed', { detail: { novelId } })
        : { type: 'tcl_library_changed', detail: { novelId } };
      window.dispatchEvent(evt);
    } catch {}
  }
}

export function addToLibrary(item) {
  const library = getLibrary({ includeHidden: true });
  const exists = library.findIndex((n) => n.id === item.id);
  const existingUpdatedAt = exists !== -1 ? (library[exists]?.updatedAt || 0) : 0;
  const newUpdatedAt = item.updatedAt !== undefined
    ? item.updatedAt
    : Math.max(Date.now(), existingUpdatedAt + 1);

  const cleanItem = { ...item, updatedAt: newUpdatedAt };
  if (cleanItem.coverUrl && /^data:/i.test(cleanItem.coverUrl)) {
    delete cleanItem.coverUrl;
  }
  if (exists !== -1) {
    library[exists] = { ...library[exists], ...cleanItem };
  } else {
    library.unshift(cleanItem);
  }
  saveLibrary(library);
  notifyLibraryChanged(cleanItem.id);
}

export function removeFromLibrary(id) {
  const library = getLibrary({ includeHidden: true }).filter((n) => n.id !== id);
  saveLibrary(library);
  notifyLibraryChanged(id);
}

export function updateLibraryItem(id, updates) {
  const library = getLibrary({ includeHidden: true });
  const idx = library.findIndex((n) => n.id === id);
  if (idx !== -1) {
    const existingUpdatedAt = library[idx]?.updatedAt || 0;
    const newUpdatedAt = updates.updatedAt !== undefined
      ? updates.updatedAt
      : Math.max(Date.now(), existingUpdatedAt + 1);

    const cleanUpdates = { ...updates, updatedAt: newUpdatedAt };
    if (cleanUpdates.coverUrl && /^data:/i.test(cleanUpdates.coverUrl)) {
      delete cleanUpdates.coverUrl;
    }
    library[idx] = { ...library[idx], ...cleanUpdates };
    saveLibrary(library);
    notifyLibraryChanged(id);
  }
}

async function syncNovelIsHiddenToDB(id, isHidden) {
  try {
    const { getNovel, saveNovel } = await import('./db.js');
    const dbNovel = await getNovel(id);
    if (dbNovel) {
      await saveNovel({ ...dbNovel, isHidden }, { skipDirty: true });
    }
  } catch (err) {
    // IDB might not be active or available in unit tests
  }
}

export function hideNovel(id) {
  updateLibraryItem(id, { isHidden: true });
  return syncNovelIsHiddenToDB(id, true);
}

export function unhideNovel(id) {
  updateLibraryItem(id, { isHidden: false });
  return syncNovelIsHiddenToDB(id, false);
}

export function toggleHideNovel(id) {
  const library = getLibrary({ includeHidden: true });
  const item = library.find(n => n.id === id);
  if (item) {
    const willHide = !item.isHidden;
    updateLibraryItem(id, { isHidden: willHide });
    syncNovelIsHiddenToDB(id, willHide);
    return willHide;
  }
  return false;
}

// ---- Reading Progress ----

export function getReadingProgress(novelId) {
  try {
    const raw = localStorage.getItem(`${PROGRESS_KEY}_${novelId}`);
    return raw ? JSON.parse(raw) : { chapterId: null, scrollTop: 0 };
  } catch {
    return { chapterId: null, scrollTop: 0 };
  }
}

export function saveReadingProgress(novelId, progress) {
  const current = getReadingProgress(novelId);
  const currentUpdatedAt = current?.updatedAt || 0;
  const newUpdatedAt = progress?.updatedAt !== undefined
    ? progress.updatedAt
    : Math.max(Date.now(), currentUpdatedAt + 1);

  const dataToSave = { ...progress, updatedAt: newUpdatedAt };
  localStorage.setItem(`${PROGRESS_KEY}_${novelId}`, JSON.stringify(dataToSave));
}

// ---- Reading Settings ----

const DEFAULT_SETTINGS = {
  fontSize: 17,
  lineHeight: 1.85,
  fontFamily: 'serif',
  theme: 'dark',
  paragraphSpacing: 1.2,
};

export function getReadingSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveReadingSettings(settings) {
  const dataToSave = { ...settings, updatedAt: settings?.updatedAt || Date.now() };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(dataToSave));
}

