// =========================================================================
// THIÊN CƠ LÂU - PERSISTENT SERVICE WORKER (V2 - Auto Cache Busting)
// =========================================================================

const IMAGE_CACHE = 'tcl-images-v2';
const STATIC_CACHE = 'tcl-static-v2';
const CURRENT_CACHES = [IMAGE_CACHE, STATIC_CACHE];

// Install: Activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate: Purge all old caches and take control of clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (!CURRENT_CACHES.includes(key)) {
            console.log('[SW] Xóa cache cũ không tương thích:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => clients.claim())
  );
});

// Fetch: Smart Cache Strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. IMAGE CACHE (Chỉ cache đúng file ảnh, TUYỆT ĐỐI không cache JS/CSS bundles)
  const isImage = 
    request.destination === 'image' || 
    url.pathname.match(/\.(png|jpg|jpeg|webp|svg|gif|ico)(\?.*)?$/i);

  if (isImage) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          // Fetch fresh from network in background or return cache
          const fetchPromise = fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => cachedResponse);

          // If cached and valid, return cache instantly, else wait for network
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }

  // 2. GOOGLE FONTS (Cache-First Strategy)
  if (url.origin.includes('fonts.googleapis.com') || url.origin.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // 3. CODE, HTML & BUNDLES: Luôn lấy mới từ Network để app cập nhật ngay lập tức
});
