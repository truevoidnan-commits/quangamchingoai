/**
 * customBackdrop.js
 * 
 * Manages custom user-selected backdrop for Tàng Kinh Họa Các (Comics Lobby).
 * Allows user to pick a comic page, crop to 9:16 (mobile) and 16:9 (desktop),
 * tune blur (0-20px) and dim (0-80%), and store locally via CacheStorage & localStorage.
 * Guarantee minimum 35% dim if page is too bright.
 */

import { encodeCanvasToBlob } from './pdfImport.js';

export const CUSTOM_BACKDROP_KEY = 'tcl_custom_comic_backdrop';
const CACHE_NAME = 'tcl-custom-backdrop-cache';
const VERTICAL_URL = 'https://tcl.local/custom-backdrop-vertical.webp';
const WIDE_URL = 'https://tcl.local/custom-backdrop-wide.webp';

// In-memory / storage fallback if CacheStorage is unavailable
const memoryFallback = {
  verticalBlob: null,
  wideBlob: null,
};

/**
 * Returns current custom backdrop settings from localStorage, or null if none
 * @returns {{ comicId: string, volumeId: string, pageIndex: number, blur: number, dim: number, offsetX: number, offsetY: number, updatedAt: number } | null}
 */
export function getCustomBackdropSettings() {
  try {
    const raw = localStorage.getItem(CUSTOM_BACKDROP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      comicId: parsed.comicId || '',
      volumeId: parsed.volumeId || '',
      pageIndex: typeof parsed.pageIndex === 'number' ? parsed.pageIndex : 0,
      blur: Math.min(20, Math.max(0, Number(parsed.blur) || 0)),
      dim: Math.min(80, Math.max(0, Number(parsed.dim) || 40)),
      offsetX: typeof parsed.offsetX === 'number' ? parsed.offsetX : 0.5,
      offsetY: typeof parsed.offsetY === 'number' ? parsed.offsetY : 0.5,
      updatedAt: parsed.updatedAt || Date.now(),
    };
  } catch (e) {
    return null;
  }
}

/**
 * Saves custom backdrop settings to localStorage and dispatches change event
 */
export function saveCustomBackdropSettings(settings) {
  try {
    localStorage.setItem(CUSTOM_BACKDROP_KEY, JSON.stringify({
      ...settings,
      updatedAt: Date.now(),
    }));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tcl_custom_backdrop_changed', { detail: settings }));
    }
  } catch (e) {
    console.warn('[CustomBackdrop] Could not save settings:', e);
  }
}

/**
 * Clears custom backdrop images and settings, returning to default
 */
export async function clearCustomBackdrop() {
  try {
    localStorage.removeItem(CUSTOM_BACKDROP_KEY);
    memoryFallback.verticalBlob = null;
    memoryFallback.wideBlob = null;
    if (typeof window !== 'undefined' && 'caches' in window) {
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(VERTICAL_URL);
      await cache.delete(WIDE_URL);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tcl_custom_backdrop_changed', { detail: null }));
    }
  } catch (e) {
    console.warn('[CustomBackdrop] Could not clear cache:', e);
  }
}

/**
 * Stores cropped WebP blobs into CacheStorage
 */
export async function storeCustomBackdropBlobs({ verticalBlob, wideBlob }) {
  memoryFallback.verticalBlob = verticalBlob;
  memoryFallback.wideBlob = wideBlob;

  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      if (verticalBlob) {
        await cache.put(VERTICAL_URL, new Response(verticalBlob, {
          headers: { 'Content-Type': 'image/webp' },
        }));
      }
      if (wideBlob) {
        await cache.put(WIDE_URL, new Response(wideBlob, {
          headers: { 'Content-Type': 'image/webp' },
        }));
      }
    } catch (e) {
      console.warn('[CustomBackdrop] Cache storage put failed, using memory fallback:', e);
    }
  }
}

/**
 * Loads custom backdrop Blobs and creates object URLs for rendering
 * @returns {Promise<{ verticalUrl: string|null, wideUrl: string|null, settings: object|null }>}
 */
export async function loadCustomBackdropUrls() {
  const settings = getCustomBackdropSettings();
  if (!settings) {
    return { verticalUrl: null, wideUrl: null, settings: null };
  }

  let verticalBlob = memoryFallback.verticalBlob;
  let wideBlob = memoryFallback.wideBlob;

  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await caches.open(CACHE_NAME);
      if (!verticalBlob) {
        const vRes = await cache.match(VERTICAL_URL);
        if (vRes) verticalBlob = await vRes.blob();
      }
      if (!wideBlob) {
        const wRes = await cache.match(WIDE_URL);
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

  const verticalUrl = verticalBlob ? URL.createObjectURL(verticalBlob) : null;
  const wideUrl = wideBlob ? URL.createObjectURL(wideBlob) : null;

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
