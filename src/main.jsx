import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './styles/globals.css'
import './styles/animations.css'
import App from './App.jsx'

// Register persistent Service Worker safely for image caching
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker.register(swUrl).catch((err) => {
      console.warn('[SW] Service Worker registration failed:', err);
    });
  });
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
