/**
 * localStorage helpers for catalog and reading settings
 */

const LIBRARY_KEY = 'tcl_library';
const PROGRESS_KEY = 'tcl_progress';
const SETTINGS_KEY = 'tcl_reading_settings';

// ---- Library catalog (lightweight — id, title, coverThumb, chapterCount) ----

export function getLibrary() {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLibrary(library) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
}

export function addToLibrary(item) {
  const library = getLibrary();
  const exists = library.findIndex(n => n.id === item.id);
  if (exists !== -1) {
    library[exists] = item;
  } else {
    library.unshift(item);
  }
  saveLibrary(library);
}

export function removeFromLibrary(id) {
  const library = getLibrary().filter(n => n.id !== id);
  saveLibrary(library);
}

export function updateLibraryItem(id, updates) {
  const library = getLibrary();
  const idx = library.findIndex(n => n.id === id);
  if (idx !== -1) {
    library[idx] = { ...library[idx], ...updates };
    saveLibrary(library);
  }
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
