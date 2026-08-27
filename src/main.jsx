import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './styles/globals.css'
import './styles/animations.css'
import App from './App.jsx'

// Register persistent Service Worker to cache all images permanently in local storage
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker.register(swUrl).then(
      (reg) => {
        console.log('[SW] Service Worker Registered successfully:', reg.scope);
      },
      (err) => {
        console.warn('[SW] Service Worker registration failed:', err);
      }
    );
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
