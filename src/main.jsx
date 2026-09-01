import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './styles/globals.css'
import './styles/animations.css'
import App from './App.jsx'

// Register persistent Service Worker with auto-update detection
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker.register(swUrl).then(
      (reg) => {
        // Tự động kiểm tra bản cập nhật mới
        reg.update().catch(() => {});
        
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // Đã có phiên bản mới -> tự động áp dụng ngay
                window.location.reload();
              }
            });
          }
        });
      },
      (err) => {
        console.warn('[SW] Service Worker registration failed:', err);
      }
    );
  });

  // Tự động reload khi Service Worker mới kích hoạt
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
