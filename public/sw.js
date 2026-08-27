// =========================================================================
// THIÊN CƠ LÂU - PERSISTENT SERVICE WORKER (Cache-First Image Engine)
// Lưu trữ vĩnh viễn toàn bộ hình ảnh và tài nguyên vào ổ cứng thiết bị.
// Tốc độ phản hồi: 0ms (Offline & Instant Local Disk Retrieval).
// =========================================================================

const IMAGE_CACHE = 'tcl-images-v1';
const STATIC_CACHE = 'tcl-static-v1';

// Install: Activate immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate: Take control of all clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    clients.claim().then(() => {
      console.log('[SW] Thiên Cơ Lâu Service Worker đã kích hoạt & quản lý Cache.');
    })
  );
});

// Fetch: Smart Cache Strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. IMAGE CACHE (Cache-First Strategy with Background Cache-Fill)
  const isImage = 
    request.destination === 'image' || 
    url.pathname.match(/\.(png|jpg|jpeg|webp|svg|gif|ico)$/i) ||
    url.pathname.includes('/assets/');

  if (isImage) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            // Found in persistent cache -> Return instantly (0ms)
            return cachedResponse;
          }

          // Not in cache yet -> Fetch once from network, then cache permanently
          return fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            // Fallback if offline
            return cachedResponse;
          });
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

  // 3. CODE & HTML: Default Network-First for seamless app updates
});
