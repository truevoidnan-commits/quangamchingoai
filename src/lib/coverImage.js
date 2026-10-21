/**
 * Utilities for cover image optimization and thumbnail generation
 */

/**
 * Resize cover image file to standard dimensions (default 600x800 @ 0.8 JPEG)
 * Keeps high visual quality for Retina mobile screens while drastically reducing byte size.
 */
export function resizeCoverImage(file, maxWidth = 600, maxHeight = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        const ratio = Math.min(maxWidth / width, maxHeight / height);
        if (ratio < 1) {
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
        }
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Generate a lightweight cover thumbnail for localStorage catalog (default 240x320 @ 0.7 JPEG).
 * Produces tiny images (~5-12KB) to guarantee localStorage never breaches quota.
 * If source is an external http(s) URL, returns it directly.
 */
export function makeCoverThumb(source, w = 240, h = 320, quality = 0.7) {
  return new Promise((resolve) => {
    if (!source || typeof source !== 'string') {
      return resolve('');
    }

    // External http/https links are already lightweight strings
    if (/^https?:\/\//i.test(source)) {
      return resolve(source);
    }

    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      return resolve(source.startsWith('data:') ? '' : source);
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve('');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Fit image into 3:4 aspect box (cover style: scale to fill, center crop)
        const scale = Math.max(w / img.width, h / img.height);
        const nw = img.width * scale;
        const nh = img.height * scale;
        const ox = (w - nw) / 2;
        const oy = (h - nh) / 2;

        ctx.drawImage(img, ox, oy, nw, nh);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (err) {
        console.warn('Lỗi khi tạo cover thumbnail:', err);
        resolve('');
      }
    };
    img.onerror = () => {
      resolve('');
    };
    img.src = source;
  });
}
