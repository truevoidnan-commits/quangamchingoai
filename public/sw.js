// =========================================================================
// THIÊN CƠ LÂU - SELF-DESTRUCTING SERVICE WORKER
// Hủy đăng ký Service Worker để ngăn chặn hiện tượng treo màn hình trắng trên iOS Safari / Chrome Mobile.
// =========================================================================

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll())
      .then((clients) => {
        clients.forEach((client) => {
          if (client.navigate) {
            client.navigate(client.url);
          }
        });
      })
  );
});
