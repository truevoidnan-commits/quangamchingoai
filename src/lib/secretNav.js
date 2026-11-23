/**
 * Secret Mode Navigation Manager for Thiên Cơ Lâu
 * Camouflages Comics and Video subsystems from public view.
 * All state is session-scoped without hardcoded passwords or leaks.
 * Supports HashRouter, React Router locations, and direct page reloads.
 */

export const KEY_COMICS = 'tcl_unlocked_comics';
export const KEY_VIDEOS = 'tcl_unlocked_videos';
export const EVENT_NAME = 'tcl_secret_modes_changed';

/**
 * Parses hash string into route path (e.g. "#/videos/123?page=1" -> "/videos/123")
 */
export function parseHashRoute(hash = '') {
  if (!hash || typeof hash !== 'string') return '/';
  const clean = hash.startsWith('#') ? hash.slice(1) : hash;
  const qIdx = clean.indexOf('?');
  const path = qIdx >= 0 ? clean.slice(0, qIdx) : clean;
  if (!path) return '/';
  return path.startsWith('/') ? path : '/' + path;
}

/**
 * Resolves current route path considering HashRouter, custom React Router location,
 * or fallback window.location.pathname.
 */
export function getCurrentRoutePath(customPath = null) {
  if (typeof customPath === 'string' && customPath.length > 0) {
    return customPath;
  }
  if (typeof window === 'undefined') return '/';
  if (window.location.hash && window.location.hash.length > 0) {
    return parseHashRoute(window.location.hash);
  }
  return window.location.pathname || '/';
}

/**
 * Checks if Comics mode is currently unlocked in this session or on this route.
 */
export function isComicsUnlocked(customPath = null) {
  if (typeof window === 'undefined') return false;
  if (sessionStorage.getItem(KEY_COMICS) === 'true') {
    return true;
  }
  const path = getCurrentRoutePath(customPath);
  return path === '/comics' || path.startsWith('/comics/');
}

/**
 * Checks if Videos mode is currently unlocked in this session or on this route.
 */
export function isVideosUnlocked(customPath = null) {
  if (typeof window === 'undefined') return false;
  if (sessionStorage.getItem(KEY_VIDEOS) === 'true') {
    return true;
  }
  const path = getCurrentRoutePath(customPath);
  return path === '/videos' || path.startsWith('/videos/');
}

/**
 * Unlocks Comics mode for this browser session.
 */
export function unlockComics() {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(KEY_COMICS, 'true');
  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, {
      detail: {
        mode: 'comics',
        comics: true,
        videos: isVideosUnlocked(),
        unlocked: true,
      },
    })
  );
}

/**
 * Unlocks Videos mode for this browser session.
 */
export function unlockVideos() {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(KEY_VIDEOS, 'true');
  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, {
      detail: {
        mode: 'videos',
        comics: isComicsUnlocked(),
        videos: true,
        unlocked: true,
      },
    })
  );
}

/**
 * Locks and hides all secret modes, returning to public novel state.
 */
export function lockSecretModes() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(KEY_COMICS);
  sessionStorage.removeItem(KEY_VIDEOS);
  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, {
      detail: {
        mode: 'none',
        comics: false,
        videos: false,
        unlocked: false,
      },
    })
  );
}

/**
 * Subscribes to secret mode changes and route hash changes.
 */
export function subscribeSecretModes(callback) {
  if (typeof window === 'undefined' || typeof callback !== 'function') return () => {};
  const handler = (e) => {
    if (e?.detail && typeof e.detail.comics === 'boolean' && typeof e.detail.videos === 'boolean') {
      callback({
        comics: e.detail.comics,
        videos: e.detail.videos,
      });
      return;
    }
    callback({
      comics: isComicsUnlocked(),
      videos: isVideosUnlocked(),
    });
  };

  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener('hashchange', handler);

  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener('hashchange', handler);
  };
}
