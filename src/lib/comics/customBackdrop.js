/**
 * customBackdrop.js
 * 
 * Manages custom user-selected backdrop per comic series for Tàng Kinh Họa Các.
 * Allows user to pick a comic page, crop to 9:16 (mobile) and 16:9 (desktop),
 * tune blur (0-20px) and dim (0-80%), and store locally via CacheStorage & localStorage.
 * Guarantees minimum 35% dim if page is too bright.
 */

import { encodeCanvasToBlob } from './pdfImport.js';

export const SERIES_BACKDROPS_KEY = 'tcl_comic_series_backdrops';
export const LEGACY_BACKDROP_KEY = 'tcl_custom_comic_backdrop';
const CACHE_NAME = 'tcl-custom-backdrop-cache';

const LEGACY_VERTICAL_URL = 'https://tcl.local/custom-backdrop-vertical.webp';
const LEGACY_WIDE_URL = 'https://tcl.local/custom-backdrop-wide.webp';

export function getBackdropUrl(seriesId, type) {
  return `https://tcl.local/series-backdrop/${encodeURIComponent(seriesId)}-${type}.webp`;
}

// In-memory / storage fallback Map: seriesId -> { verticalBlob, wideBlob }
const memoryFallback = new Map();

function getAllSeriesBackdrops() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(SERIES_BACKDROPS_KEY);
    return raw ? JSON.parse(raw) || {} : {};
  } catch (e) {
    return {};
  }
}

function setAllSeriesBackdrops(map) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SERIES_BACKDROPS_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('[CustomBackdrop] Could not save series backdrops map:', e);
  }
}

// Internal sync migration to ensure immediate read availability
function migrateSyncStorage() {
  try {
    if (typeof localStorage === 'undefined') return;
    const oldRaw = localStorage.getItem(LEGACY_BACKDROP_KEY);
    if (!oldRaw) return;
    const parsed = JSON.parse(oldRaw);
    const targetSeriesId = parsed?.comicId;
    if (targetSeriesId) {
      const map = getAllSeriesBackdrops();
      if (!map[targetSeriesId]) {
        map[targetSeriesId] = {
          ...parsed,
          comicId: targetSeriesId,
          updatedAt: parsed.updatedAt || Date.now(),
        };
        setAllSeriesBackdrops(map);
      }
    }
  } catch (e) {
    // Ignore migration parse error
  }
}

let migrationPromise = null;

/**
 * Migrates legacy single backdrop to per-series backdrop once.
 * Copies cached blobs from old URLs to series URLs, then removes old key & blobs.
 */
export async function migrateLegacyBackdropIfNeeded() {
  if (typeof localStorage === 'undefined') return;
  const oldRaw = localStorage.getItem(LEGACY_BACKDROP_KEY);
  if (!oldRaw) return;

  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    try {
      migrateSyncStorage();

      const raw = localStorage.getItem(LEGACY_BACKDROP_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      const targetSeriesId = parsed?.comicId;

      if (targetSeriesId) {
        const hasCaches = typeof caches !== 'undefined';
        if (hasCaches) {
          try {
            const cache = await caches.open(CACHE_NAME);
            const oldVRes = await cache.match(LEGACY_VERTICAL_URL);
            if (oldVRes) {
              const vBlob = await oldVRes.blob();
              await cache.put(getBackdropUrl(targetSeriesId, 'vertical'), new Response(vBlob, {
                headers: { 'Content-Type': 'image/webp' },
              }));
              await cache.delete(LEGACY_VERTICAL_URL);
            }
            const oldWRes = await cache.match(LEGACY_WIDE_URL);
            if (oldWRes) {
              const wBlob = await oldWRes.blob();
              await cache.put(getBackdropUrl(targetSeriesId, 'wide'), new Response(wBlob, {
                headers: { 'Content-Type': 'image/webp' },
              }));
              await cache.delete(LEGACY_WIDE_URL);
            }
          } catch (cacheErr) {
            console.warn('[CustomBackdrop] Migration cache copy warning:', cacheErr);
          }
        }
      }

      localStorage.removeItem(LEGACY_BACKDROP_KEY);
    } catch (err) {
      console.warn('[CustomBackdrop] Migration warning:', err);
    } finally {
      migrationPromise = null;
    }
  })();

  return migrationPromise;
}

// Quiet startup migration
if (typeof window !== 'undefined') {
  migrateLegacyBackdropIfNeeded().catch(() => {});
}

/**
 * Returns custom backdrop settings for a given series, or null if none
 * @param {string} seriesId
 * @returns {{ comicId: string, volumeId: string, pageIndex: number, blur: number, dim: number, offsetX: number, offsetY: number, updatedAt: number } | null}
 */
export function getCustomBackdropSettings(seriesId) {
  if (!seriesId) return null;
  migrateSyncStorage();
  try {
    const map = getAllSeriesBackdrops();
    const raw = map[seriesId];
    if (!raw || typeof raw !== 'object') return null;
    return {
      comicId: seriesId,
      volumeId: raw.volumeId || '',
      pageIndex: typeof raw.pageIndex === 'number' ? raw.pageIndex : 0,
      blur: Math.min(20, Math.max(0, Number(raw.blur) || 0)),
      dim: Math.min(80, Math.max(0, Number(raw.dim) || 40)),
      offsetX: typeof raw.offsetX === 'number' ? raw.offsetX : 0.5,
      offsetY: typeof raw.offsetY === 'number' ? raw.offsetY : 0.5,
      updatedAt: raw.updatedAt || Date.now(),
    };
  } catch (e) {
    return null;
  }
}

/**
 * Saves custom backdrop settings for a given series to localStorage and dispatches change event
 * @param {string} seriesId
 * @param {object} settings
 */
export function saveCustomBackdropSettings(seriesId, settings) {
  if (!seriesId) return;
  try {
    const map = getAllSeriesBackdrops();
    map[seriesId] = {
      ...settings,
      comicId: seriesId,
      updatedAt: Date.now(),
    };
    setAllSeriesBackdrops(map);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tcl_custom_backdrop_changed', { detail: { seriesId } }));
    }
  } catch (e) {
    console.warn('[CustomBackdrop] Could not save settings:', e);
  }
}

/**
 * Clears custom backdrop images and settings for a given series, returning to default
 * @param {string} seriesId
 */
export async function clearCustomBackdrop(seriesId) {
  if (!seriesId) return;
  try {
    const map = getAllSeriesBackdrops();
    delete map[seriesId];
    setAllSeriesBackdrops(map);
    memoryFallback.delete(seriesId);

    if (typeof caches !== 'undefined') {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.delete(getBackdropUrl(seriesId, 'vertical'));
        await cache.delete(getBackdropUrl(seriesId, 'wide'));
      } catch (ce) {
        console.warn('[CustomBackdrop] Cache deletion error:', ce);
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tcl_custom_backdrop_changed', { detail: { seriesId } }));
    }
  } catch (e) {
    console.warn('[CustomBackdrop] Could not clear backdrop:', e);
  }
}

/**
 * Stores cropped WebP blobs into CacheStorage for a given series
 * @param {string} seriesId
 * @param {{ verticalBlob: Blob|null, wideBlob: Blob|null }} blobs
 */
export async function storeCustomBackdropBlobs(seriesId, { verticalBlob, wideBlob }) {
  if (!seriesId) return;
  memoryFallback.set(seriesId, { verticalBlob, wideBlob });

  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(CACHE_NAME);
      const vUrl = getBackdropUrl(seriesId, 'vertical');
      const wUrl = getBackdropUrl(seriesId, 'wide');
      if (verticalBlob) {
        await cache.put(vUrl, new Response(verticalBlob, {
          headers: { 'Content-Type': 'image/webp' },
        }));
      }
      if (wideBlob) {
        await cache.put(wUrl, new Response(wideBlob, {
          headers: { 'Content-Type': 'image/webp' },
        }));
      }
    } catch (e) {
      console.warn('[CustomBackdrop] Cache storage put failed, using memory fallback:', e);
    }
  }
}

/**
 * Loads custom backdrop Blobs and creates object URLs for rendering a specific series
 * @param {string} seriesId
 * @returns {Promise<{ verticalUrl: string|null, wideUrl: string|null, settings: object|null }>}
 */
export async function loadCustomBackdropUrls(seriesId) {
  if (!seriesId) {
    return { verticalUrl: null, wideUrl: null, settings: null };
  }
  const settings = getCustomBackdropSettings(seriesId);
  if (!settings) {
    return { verticalUrl: null, wideUrl: null, settings: null };
  }

  const mem = memoryFallback.get(seriesId);
  let verticalBlob = mem?.verticalBlob || null;
  let wideBlob = mem?.wideBlob || null;

  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(CACHE_NAME);
      const vUrl = getBackdropUrl(seriesId, 'vertical');
      const wUrl = getBackdropUrl(seriesId, 'wide');
      if (!verticalBlob) {
        const vRes = await cache.match(vUrl);
        if (vRes) verticalBlob = await vRes.blob();
      }
      if (!wideBlob) {
        const wRes = await cache.match(wUrl);
        if (wRes) wideBlob = await wRes.blob();
      }
    } catch (e) {
      console.warn('[CustomBackdrop] Cache storage read error:', e);
    }
  }

  // If no cached blobs found, fallback to null
  if (!verticalBlob && !wideBlob) {
    return { verticalUrl: null, wideUrl: null, settings: null };
  }

  const verticalUrl = verticalBlob && typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(verticalBlob) : null;
  const wideUrl = wideBlob && typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(wideBlob) : null;

  return { verticalUrl, wideUrl, settings };
}

/**
 * Measures average brightness (0..1) of canvas image data
 */
export function calculateImageBrightness(ctx, width, height) {
  try {
    const sampleW = Math.min(width, 100);
    const sampleH = Math.min(height, 100);
    const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
    const data = imgData.data;
    let totalLuma = 0;
    const pixelCount = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      // Relative luminance formula
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      totalLuma += luma;
    }
    return (totalLuma / pixelCount) / 255;
  } catch (e) {
    return 0.5; // neutral fallback
  }
}

/**
 * Crops source image element to target aspect ratio (cover fit)
 * and exports as WebP Blob (~85 quality) with WASM fallback.
 * 
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} source
 * @param {number} targetW
 * @param {number} targetH
 * @param {number} [offsetX=0.5] (0 = left/top, 0.5 = center, 1 = right/bottom)
 * @param {number} [offsetY=0.5]
 * @returns {Promise<{ blob: Blob, brightness: number }>}
 */
export async function cropToBackdropWebp(source, targetW, targetH, offsetX = 0.5, offsetY = 0.5) {
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');

  const srcW = source.width || source.naturalWidth;
  const srcH = source.height || source.naturalHeight;

  // Compute cover scale
  const scale = Math.max(targetW / srcW, targetH / srcH);
  const scaledW = srcW * scale;
  const scaledH = srcH * scale;

  // Offset within crop
  const dx = (targetW - scaledW) * offsetX;
  const dy = (targetH - scaledH) * offsetY;

  ctx.drawImage(source, dx, dy, scaledW, scaledH);
  const brightness = calculateImageBrightness(ctx, targetW, targetH);

  const { blob } = await encodeCanvasToBlob(canvas, 0.85, ctx);
  return { blob, brightness };
}
