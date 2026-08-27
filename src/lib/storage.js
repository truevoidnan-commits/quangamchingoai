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

export function setVaultPassword(password, hint = '') {
  if (!password || !password.trim()) return false;
  const hashed = hashString(password.trim());
  localStorage.setItem(VAULT_PWD_KEY, hashed);
  if (hint && hint.trim()) {
    localStorage.setItem(VAULT_HINT_KEY, hint.trim());
  } else {
    localStorage.removeItem(VAULT_HINT_KEY);
  }
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
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
}

export function addToLibrary(item) {
  const library = getLibrary({ includeHidden: true });
  const exists = library.findIndex(n => n.id === item.id);
  if (exists !== -1) {
    library[exists] = { ...library[exists], ...item };
  } else {
    library.unshift(item);
  }
  saveLibrary(library);
}

export function removeFromLibrary(id) {
  const library = getLibrary({ includeHidden: true }).filter(n => n.id !== id);
  saveLibrary(library);
}

export function updateLibraryItem(id, updates) {
  const library = getLibrary({ includeHidden: true });
  const idx = library.findIndex(n => n.id === id);
  if (idx !== -1) {
    library[idx] = { ...library[idx], ...updates };
    saveLibrary(library);
  }
}

export function hideNovel(id) {
  updateLibraryItem(id, { isHidden: true });
}

export function unhideNovel(id) {
  updateLibraryItem(id, { isHidden: false });
}

export function toggleHideNovel(id) {
  const library = getLibrary({ includeHidden: true });
  const item = library.find(n => n.id === id);
  if (item) {
    const willHide = !item.isHidden;
    updateLibraryItem(id, { isHidden: willHide });
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
  localStorage.setItem(`${PROGRESS_KEY}_${novelId}`, JSON.stringify(progress));
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
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

