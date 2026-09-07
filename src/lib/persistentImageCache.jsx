// =========================================================================
// THIÊN CƠ LÂU - PERSISTENT INDEXEDDB IMAGE CACHE
// Lưu trữ toàn bộ ảnh AI (Đạo Ảnh, Thần Vật, Mệnh Đăng, Bìa, Background...)
// vĩnh viễn vào bộ nhớ máy (IndexedDB).
// Khi cập nhật code lên GitHub, toàn bộ ảnh nạp từ bộ nhớ máy với tốc độ 0ms!
// =========================================================================

import { useState, useEffect } from 'react';

const DB_NAME = 'tcl_image_cache_v2';
const STORE_NAME = 'images';
const DB_VERSION = 1;

// Purge old obsolete v1 cache
if (typeof window !== 'undefined' && window.indexedDB) {
  try {
    window.indexedDB.deleteDatabase('tcl_image_cache_v1');
  } catch (e) {}
}

// In-memory cache for 0ms synchronous access
const _memoryBlobMap = new Map();
let _dbPromise = null;

export function clearImageCache() {
  _memoryBlobMap.clear();
  _dbPromise = null;
  if (typeof window !== 'undefined' && window.indexedDB) {
    try {
      window.indexedDB.deleteDatabase(DB_NAME);
    } catch (e) {}
  }
}

if (typeof window !== 'undefined') {
  window.clearTCLImageCache = clearImageCache;
}

function getDB() {
  if (typeof window === 'undefined' || !window.indexedDB) return Promise.resolve(null);
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'url' });
        }
      };

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (err) => {
        console.warn('[ImageCache] IndexedDB open error:', err);
        resolve(null);
      };

      request.onblocked = () => {
        console.warn('[ImageCache] IndexedDB blocked');
        resolve(null);
      };
    } catch {
      resolve(null);
    }
  });

  return _dbPromise;
}

/**
 * Lấy Blob URL từ IndexedDB nếu đã từng tải trước đó
 */
export async function getCachedBlobUrl(url) {
  if (import.meta.env.DEV) return null;
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  // 1. Check in-memory first (0ms)
  if (_memoryBlobMap.has(url)) {
    return _memoryBlobMap.get(url);
  }

  const db = await getDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(url);

      request.onsuccess = () => {
        if (request.result && request.result.blob) {
          try {
            const blobUrl = URL.createObjectURL(request.result.blob);
            _memoryBlobMap.set(url, blobUrl);
            resolve(blobUrl);
          } catch {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };

      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Tải ảnh từ mạng và lưu vĩnh viễn vào IndexedDB
 */
export async function saveImageToCache(url, blob) {
  if (!url || !blob) return;
  const db = await getDB();
  if (!db) return;

  try {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put({ url, blob, savedAt: Date.now() });
    
    if (!_memoryBlobMap.has(url)) {
      try {
        const blobUrl = URL.createObjectURL(blob);
        _memoryBlobMap.set(url, blobUrl);
      } catch {}
    }
  } catch (e) {
    // Quota or transaction error
  }
}

/**
 * Tải ảnh và lưu cache tự động
 */
export async function fetchAndCacheImage(url) {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  // Check cache first
  const cached = await getCachedBlobUrl(url);
  if (cached) return cached;

  try {
    const res = await fetch(url);
    if (res.ok) {
      const blob = await res.blob();
      await saveImageToCache(url, blob);
      try {
        const blobUrl = _memoryBlobMap.get(url) || URL.createObjectURL(blob);
        _memoryBlobMap.set(url, blobUrl);
        return blobUrl;
      } catch {
        return url;
      }
    }
  } catch {
    // Fallback to original network URL
  }

  return url;
}

/**
 * React Hook: Tự động dùng ảnh từ IndexedDB nếu có, hoặc tải ngầm lưu vào máy
 */
export function usePersistentImage(src) {
  if (import.meta.env.DEV) {
    return src;
  }

  // Đồng bộ tức thì nếu đã có trong memory
  const initial = src && _memoryBlobMap.has(src) ? _memoryBlobMap.get(src) : src;
  const [currentSrc, setCurrentSrc] = useState(initial);

  useEffect(() => {
    if (!src) {
      setCurrentSrc('');
      return;
    }

    if (src.startsWith('data:') || src.startsWith('blob:')) {
      setCurrentSrc(src);
      return;
    }

    if (_memoryBlobMap.has(src)) {
      setCurrentSrc(_memoryBlobMap.get(src));
      return;
    }

    let isCancelled = false;

    getCachedBlobUrl(src).then((cached) => {
      if (isCancelled) return;
      if (cached) {
        setCurrentSrc(cached);
      } else {
        // Chưa có trong máy -> Tải ngầm và lưu vào IndexedDB
        fetchAndCacheImage(src).then((loaded) => {
          if (!isCancelled && loaded) {
            setCurrentSrc(loaded);
          }
        });
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [src]);

  return currentSrc || src;
}

/**
 * React Component: Persistent Image (Tự động nạp từ IndexedDB ổ cứng máy)
 */
export function PersistentImage({ src, alt = '', onError, ...props }) {
  const cachedSrc = usePersistentImage(src);

  return (
    <img
      src={cachedSrc}
      alt={alt}
      onError={onError}
      {...props}
    />
  );
}
