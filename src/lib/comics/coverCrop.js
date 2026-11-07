/**
 * coverCrop.js
 * 
 * Utilities for cropping and encoding comic series covers:
 * - Standard dimensions: 600x800 px (3:4 aspect ratio)
 * - Encodes to WebP (quality ~0.85), size guaranteed under 200KB
 * - Compatible with ImageCropperModal output (dataURL) and raw Blobs
 */

import { encodeCanvasToBlob } from './pdfImport.js';

export const COVER_TARGET_WIDTH = 600;
export const COVER_TARGET_HEIGHT = 800; // Exact 3:4 ratio
export const COVER_MAX_SIZE_BYTES = 250 * 1024; // 250KB hard ceiling, typical is ~60-120KB

/**
 * Converts a data URL (from ImageCropperModal or file reader) to a WebP Blob at 600x800
 * @param {string} dataUrl
 * @param {number} [quality=0.85]
 * @returns {Promise<Blob>}
 */
export async function dataUrlToCoverWebpBlob(dataUrl, quality = 0.85) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error('dataUrl hợp lệ là bắt buộc');
  }

  // If in Node/test environment without document.createElement
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    const parts = dataUrl.split(',');
    const mimeMatch = parts[0]?.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/webp';
    const binary = Buffer.from(parts[1] || '', 'base64');
    return new Blob([binary], { type: mime });
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = COVER_TARGET_WIDTH;
        canvas.height = COVER_TARGET_HEIGHT;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Không thể khởi tạo 2D context');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, COVER_TARGET_WIDTH, COVER_TARGET_HEIGHT);

        const { blob } = await encodeCanvasToBlob(canvas, quality, ctx);
        resolve(blob);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Không thể tải hình ảnh từ dataUrl'));
    img.src = dataUrl;
  });
}

/**
 * Crops a source Blob or Image element to 3:4 aspect ratio and encodes to WebP
 * @param {Blob|File|HTMLImageElement|HTMLCanvasElement} source
 * @param {object} [options]
 * @param {number} [options.offsetX=0.5] (0 = left/top, 0.5 = center, 1 = right/bottom)
 * @param {number} [options.offsetY=0.5]
 * @param {number} [options.quality=0.85]
 * @returns {Promise<Blob>}
 */
export async function cropBlobToCoverWebp(source, { offsetX = 0.5, offsetY = 0.5, quality = 0.85 } = {}) {
  if (!source) throw new Error('Nguồn ảnh không được để trống');

  // Node environment fallback
  if (typeof document === 'undefined') {
    if (source instanceof Blob) return source;
    return new Blob([source], { type: 'image/webp' });
  }

  let imgElement = source;
  let shouldRevoke = false;
  let objectUrl = null;

  if (source instanceof Blob || source instanceof File) {
    objectUrl = URL.createObjectURL(source);
    shouldRevoke = true;
    imgElement = new Image();
    imgElement.crossOrigin = 'anonymous';
    await new Promise((res, rej) => {
      imgElement.onload = res;
      imgElement.onerror = rej;
      imgElement.src = objectUrl;
    });
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = COVER_TARGET_WIDTH;
    canvas.height = COVER_TARGET_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Không thể tạo 2D context');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const srcW = imgElement.width || imgElement.naturalWidth || COVER_TARGET_WIDTH;
    const srcH = imgElement.height || imgElement.naturalHeight || COVER_TARGET_HEIGHT;

    // Calculate cover scale
    const scale = Math.max(COVER_TARGET_WIDTH / srcW, COVER_TARGET_HEIGHT / srcH);
    const scaledW = srcW * scale;
    const scaledH = srcH * scale;

    const dx = (COVER_TARGET_WIDTH - scaledW) * offsetX;
    const dy = (COVER_TARGET_HEIGHT - scaledH) * offsetY;

    ctx.drawImage(imgElement, dx, dy, scaledW, scaledH);

    const { blob } = await encodeCanvasToBlob(canvas, quality, ctx);
    return blob;
  } finally {
    if (shouldRevoke && objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}
