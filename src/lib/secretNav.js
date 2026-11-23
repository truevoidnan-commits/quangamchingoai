/**
 * Secret Mode Navigation Manager for Thiên Cơ Lâu
 * Camouflages Comics and Video subsystems from public view.
 * All state is session-scoped without hardcoded passwords or leaks.
 */

const KEY_COMICS = 'tcl_unlocked_comics';
const KEY_VIDEOS = 'tcl_unlocked_videos';
const EVENT_NAME = 'tcl_secret_modes_changed';

export function isComicsUnlocked() {
  if (typeof window === 'undefined') return false;
  return (
    window.location.pathname.startsWith('/comics') ||
    sessionStorage.getItem(KEY_COMICS) === 'true'
  );
}

export function isVideosUnlocked() {
  if (typeof window === 'undefined') return false;
  return (
    window.location.pathname.startsWith('/videos') ||
    sessionStorage.getItem(KEY_VIDEOS) === 'true'
  );
}

export function unlockComics() {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(KEY_COMICS, 'true');
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { mode: 'comics', unlocked: true } }));
}

export function unlockVideos() {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(KEY_VIDEOS, 'true');
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { mode: 'videos', unlocked: true } }));
}

export function lockSecretModes() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(KEY_COMICS);
  sessionStorage.removeItem(KEY_VIDEOS);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { unlocked: false } }));
}

export function subscribeSecretModes(callback) {
  if (typeof window === 'undefined') return () => {};
  const handler = () => {
    callback({
      comics: isComicsUnlocked(),
      videos: isVideosUnlocked(),
    });
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
