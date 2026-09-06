import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './styles/globals.css'
import './styles/animations.css'
import App from './App.jsx'

// Clean up and unregister any legacy Service Worker to guarantee 0 white screens
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().catch(() => {});
    }
  }).catch(() => {});
  if ('caches' in window) {
    caches.keys().then((keys) => {
      keys.forEach((key) => {
        if (key.startsWith('tcl-')) {
          caches.delete(key).catch(() => {});
        }
      });
    }).catch(() => {});
  }
}

const rootElement = document.getElementById('root');
let reactRoot = null;

function renderApp() {
  if (!rootElement) return;
  if (!reactRoot) {
    reactRoot = createRoot(rootElement);
  }
  reactRoot.render(
    <StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </StrictMode>
  );
}

renderApp();

// Handle iOS Safari / mobile BFCache & Tab Suspend-Resume gracefully
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    // Restored from BFCache (khi mở lại tab từ background)
    renderApp();
  }
});
