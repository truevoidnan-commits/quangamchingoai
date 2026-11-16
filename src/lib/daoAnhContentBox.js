import { useEffect, useState } from 'react';

const cache = new Map();     // url -> box
const listeners = new Map(); // url -> Set<fn>

function measure(url) {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      return resolve(null);
    }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      try {
        const nw = img.naturalWidth, nh = img.naturalHeight;
        if (!nw || !nh) return resolve(null);
        const S = 96;
        const k = S / Math.max(nw, nh);
        const cw = Math.max(1, Math.round(nw * k)), ch = Math.max(1, Math.round(nh * k));
        const c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, cw, ch);
        const d = ctx.getImageData(0, 0, cw, ch).data;
        let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
        for (let y = 0; y < ch; y++) {
          for (let x = 0; x < cw; x++) {
            if (d[(y * cw + x) * 4 + 3] > 40) {
              if (x < x0) x0 = x; if (x > x1) x1 = x;
              if (y < y0) y0 = y; if (y > y1) y1 = y;
            }
          }
        }
        if (x1 < 0) return resolve(null);
        resolve({
          aspect: nw / nh,
          w: (x1 - x0 + 1) / cw,
          h: (y1 - y0 + 1) / ch,
          cx: (x0 + x1 + 1) / 2 / cw,
          cy: (y0 + y1 + 1) / 2 / ch,
        });
      } catch (e) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function useDaoAnhContentBox(url) {
  const [box, setBox] = useState(() => (url && cache.get(url)) || null);
  useEffect(() => {
    if (!url) { setBox(null); return undefined; }
    const hit = cache.get(url);
    if (hit) { setBox(hit); return undefined; }
    let alive = true;
    const fn = (b) => { if (alive) setBox(b); };
    if (!listeners.has(url)) {
      listeners.set(url, new Set());
      measure(url).then((b) => {
        if (b) cache.set(url, b);
        (listeners.get(url) || []).forEach((f) => f(b));
        listeners.delete(url);
      });
    }
    listeners.get(url).add(fn);
    return () => { alive = false; listeners.get(url)?.delete(fn); };
  }, [url]);
  return box;
}

// Ảnh nằm trong hộp 144x144 (x=-72, y=-76), preserveAspectRatio="meet".
export function computeNormalizedTransform(box, fallback) {
  if (!box) return fallback;
  const dispW = box.aspect >= 1 ? 1 : box.aspect;
  const dispH = box.aspect >= 1 ? 1 / box.aspect : 1;
  const wb = box.w * dispW, hb = box.h * dispH;
  const metric = Math.sqrt(Math.sqrt(wb * hb) * Math.max(wb, hb)); // cân bằng diện tích và chiều lớn nhất
  const s = Math.min(1.9, Math.max(0.9, 1.0 / metric));
  const dx = (box.cx - 0.5) * dispW * 144;
  const dy = (box.cy - 0.5) * dispH * 144;
  return { scale: s, x: -s * dx, y: -4 + 4 * s - s * dy };
}
