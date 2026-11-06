import React from 'react';

/**
 * Hand-drawn unified SVG Icon System for Thiên Cơ Lâu.
 * 
 * Rules:
 * - viewBox: 0 0 24 24
 * - stroke: currentColor
 * - fill: none (unless specifically required for accent dots)
 * - strokeWidth: default 1.75
 * - strokeLinecap: round
 * - strokeLinejoin: round
 * - aria-hidden="true" by default (or receives aria-label / role="img")
 */
export default function Icon({
  name,
  size = 20,
  strokeWidth = 1.75,
  className = '',
  style = {},
  'aria-label': ariaLabel,
  ...props
}) {
  const isAccessible = Boolean(ariaLabel);

  const renderPath = () => {
    switch (name) {
      // --- Cloud & Sync ---
      case 'cloud':
        return (
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
        );
      case 'cloud-check':
        return (
          <>
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
            <polyline points="9 13.5 11.5 16 15.5 11" />
          </>
        );
      case 'cloud-off':
        return (
          <>
            <path d="M2 2l20 20" />
            <path d="M5.78 5.78A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 4.1-2.7" />
            <path d="M19.8 13.8A4.5 4.5 0 0 0 17.5 10h-1.79A7 7 0 0 0 9.8 5.2" />
          </>
        );
      case 'cloud-alert':
        return (
          <>
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
            <line x1="12" y1="11" x2="12" y2="14" />
            <circle cx="12" cy="16.5" r="0.75" fill="currentColor" stroke="none" />
          </>
        );
      case 'cloud-upload':
        return (
          <>
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
            <polyline points="9 13 12 10 15 13" />
            <line x1="12" y1="10" x2="12" y2="16" />
          </>
        );
      case 'cloud-download':
        return (
          <>
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
            <polyline points="9 13 12 16 15 13" />
            <line x1="12" y1="10" x2="12" y2="16" />
          </>
        );
      case 'phone':
      case 'device':
        return (
          <>
            <rect x="6" y="2" width="12" height="20" rx="2.5" />
            <line x1="11" y1="18" x2="13" y2="18" />
          </>
        );
      case 'sync':
      case 'refresh':
        return (
          <>
            <path d="M21 4v6h-6" />
            <path d="M3 20v-6h6" />
            <path d="M19 10a9 9 0 0 0-14.8-2.6L3 10" />
            <path d="M5 14a9 9 0 0 0 14.8 2.6L21 14" />
          </>
        );

      // --- Navigation & Core Actions ---
      case 'bolt':
      case 'flash':
        return (
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        );
      case 'search':
        return (
          <>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </>
        );
      case 'replace':
        return (
          <>
            <path d="M14 4h6v6" />
            <path d="M4 20h6v-6" />
            <path d="M20 4l-7 7" />
            <path d="M4 20l7-7" />
          </>
        );
      case 'plus':
        return (
          <>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </>
        );
      case 'menu':
        return (
          <>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </>
        );
      case 'list':
        return (
          <>
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" />
          </>
        );
      case 'clipboard':
        return (
          <>
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          </>
        );
      case 'trash':
        return (
          <>
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </>
        );
      case 'edit':
        return (
          <>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </>
        );
      case 'save':
      case 'disc':
        return (
          <>
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </>
        );
      case 'download':
        return (
          <>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </>
        );
      case 'upload':
        return (
          <>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </>
        );
      case 'folder':
        return (
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        );
      case 'book':
        return (
          <>
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </>
        );
      case 'books':
      case 'library':
        return (
          <>
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <line x1="2" y1="6" x2="2" y2="20" />
          </>
        );
      case 'scroll':
        return (
          <>
            <path d="M8 2h8a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4Z" />
            <path d="M8 6h8M8 10h8M8 14h5" />
          </>
        );
      case 'lock':
        return (
          <>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </>
        );
      case 'unlock':
        return (
          <>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 9.9-1" />
          </>
        );
      case 'key':
        return (
          <>
            <circle cx="7.5" cy="15.5" r="4.5" />
            <path d="M10.7 12.3L20 3m-4 0h4v4m-2 2l2 2" />
          </>
        );
      case 'shield':
        return (
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        );
      case 'settings':
        return (
          <>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </>
        );
      case 'eye':
        return (
          <>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </>
        );
      case 'eye-off':
        return (
          <>
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </>
        );
      case 'close':
      case 'x':
        return (
          <>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </>
        );
      case 'check':
        return (
          <polyline points="20 6 9 17 4 12" />
        );
      case 'check-circle':
        return (
          <>
            <circle cx="12" cy="12" r="10" />
            <polyline points="16 9 10.5 14.5 8 12" />
          </>
        );
      case 'alert':
      case 'alert-triangle':
        return (
          <>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <circle cx="12" cy="17" r="0.75" fill="currentColor" stroke="none" />
          </>
        );
      case 'alert-circle':
        return (
          <>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <circle cx="12" cy="16" r="0.75" fill="currentColor" stroke="none" />
          </>
        );
      case 'info':
        return (
          <>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <circle cx="12" cy="8" r="0.75" fill="currentColor" stroke="none" />
          </>
        );
      case 'lightbulb':
        return (
          <>
            <path d="M9 18h6" />
            <path d="M10 22h4" />
            <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.76.76 1.23 1.52 1.41 2.5" />
          </>
        );
      case 'arrow-right':
        return (
          <>
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </>
        );
      case 'arrow-left':
        return (
          <>
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </>
        );
      case 'arrow-up':
        return (
          <>
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </>
        );
      case 'arrow-down':
        return (
          <>
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </>
        );
      case 'external-link':
        return (
          <>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </>
        );
      case 'image':
        return (
          <>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </>
        );
      case 'scissors':
        return (
          <>
            <circle cx="6" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <line x1="20" y1="4" x2="8.12" y2="15.88" />
            <line x1="14.47" y1="14.48" x2="20" y2="20" />
            <line x1="8.12" y1="8.12" x2="12" y2="12" />
          </>
        );
      case 'copy':
        return (
          <>
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </>
        );
      case 'bell':
        return (
          <>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </>
        );
      case 'star':
      case 'star-four':
        // Four-pointed star glyph (✦ replacement)
        return (
          <path d="M12 2C12 7.52 7.52 12 2 12C7.52 12 12 16.48 12 22C12 16.48 16.48 12 22 12C16.48 12 12 7.52 12 2Z" />
        );
      case 'crown':
        return (
          <path d="M3 18h18L20 8l-5 4-3-6-3 6-5-4 1 10z" />
        );
      case 'flame':
      case 'fire':
        return (
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        );
      case 'wave':
        return (
          <>
            <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
            <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
            <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
          </>
        );
      case 'moon':
        return (
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        );
      case 'sun':
        return (
          <>
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </>
        );
      case 'yin-yang':
        return (
          <>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a5 5 0 0 1 0 10 5 5 0 0 0 0 10" />
            <circle cx="12" cy="7" r="1.5" fill="currentColor" stroke="none" />
            <circle cx="12" cy="17" r="1.5" fill="currentColor" stroke="none" />
          </>
        );
      case 'lantern':
        return (
          <>
            <line x1="12" y1="2" x2="12" y2="5" />
            <rect x="7" y="5" width="10" height="2" rx="1" />
            <path d="M7 7c0 5 2.5 8 5 8s5-3 5-8" />
            <rect x="8" y="15" width="8" height="2" rx="1" />
            <line x1="12" y1="17" x2="12" y2="22" />
          </>
        );
      case 'sword':
        return (
          <>
            <line x1="14.5" y1="17.5" x2="3" y2="6" />
            <line x1="2" y1="3" x2="5" y2="2" />
            <line x1="22" y1="19" x2="21" y2="22" />
            <polyline points="18 13 19 14 16 17 15 16" />
            <line x1="18" y1="18" x2="21" y2="21" />
          </>
        );
      case 'dragon':
        return (
          <>
            <path d="M4 18c3-1 5-4 5-8 0-4 3-7 7-7s6 3 6 7c0 5-4 9-9 9-3 0-5 3-7 4" />
            <path d="M15 6l2-3 2 3" />
            <circle cx="17" cy="8" r="1" fill="currentColor" stroke="none" />
          </>
        );
      case 'tiger':
        return (
          <>
            <circle cx="12" cy="13" r="8" />
            <path d="M6 7L4 4" />
            <path d="M18 7l2-3" />
            <path d="M9 13l3 2 3-2" />
            <line x1="12" y1="9" x2="12" y2="12" />
          </>
        );
      case 'whale':
      case 'kinh':
        return (
          <>
            <path d="M2 13c3-4 8-6 14-4 3 1 5 3 6 6-4 1-9 1-13-1-3-1-5-1-7-1z" />
            <path d="M19 12c1-3 3-5 5-5-1 3-1 6 0 8" />
            <circle cx="7" cy="12" r="1" fill="currentColor" stroke="none" />
          </>
        );
      case 'eagle':
      case 'ung':
        return (
          <>
            <path d="M2 10c4-3 10-4 15-2 3 1 5 4 5 7-4-1-8-1-12 1-3 1-6 0-8-6z" />
            <polyline points="17 8 20 6 19 10" />
          </>
        );
      case 'skull':
        return (
          <>
            <path d="M12 2a7 7 0 0 0-7 7c0 3 2 5 3 6v4h8v-4c1-1 3-3 3-6a7 7 0 0 0-7-7z" />
            <circle cx="9.5" cy="10.5" r="1.25" fill="currentColor" stroke="none" />
            <circle cx="14.5" cy="10.5" r="1.25" fill="currentColor" stroke="none" />
            <line x1="10" y1="18" x2="10" y2="16" />
            <line x1="14" y1="18" x2="14" y2="16" />
          </>
        );
      case 'drop':
      case 'blood':
        return (
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
        );
      case 'mirror':
        return (
          <>
            <circle cx="12" cy="9" r="6" />
            <line x1="12" y1="15" x2="12" y2="22" />
            <line x1="9" y1="19" x2="15" y2="19" />
          </>
        );
      case 'orb':
        return (
          <>
            <circle cx="12" cy="12" r="9" />
            <ellipse cx="12" cy="12" rx="9" ry="3.5" />
          </>
        );
      case 'planet':
      case 'realm-kim-dan':
        return (
          <>
            <circle cx="12" cy="12" r="6" />
            <ellipse cx="12" cy="12" rx="10" ry="3.5" transform="rotate(-20 12 12)" />
          </>
        );
      case 'realm-ngung-khi':
      case 'mist':
        return (
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
        );
      case 'realm-truc-co':
        return (
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        );
      case 'sparkle':
        return (
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
        );
      case 'hourglass':
      case 'clock':
        return (
          <>
            <path d="M5 22h14" />
            <path d="M5 2h14" />
            <path d="M17 22v-4.17a5 5 0 0 0-1.46-3.54L12 11l-3.54 3.29A5 5 0 0 0 7 17.83V22" />
            <path d="M7 2v4.17a5 5 0 0 0 1.46 3.54L12 13l3.54-3.29A5 5 0 0 0 17 6.17V2" />
          </>
        );
      case 'package':
      case 'box':
        return (
          <>
            <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </>
        );
      case 'link':
        return (
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        );
      case 'hammer':
        return (
          <>
            <path d="M15 12l-8.5 8.5a2.12 2.12 0 0 1-3-3L12 9" />
            <path d="M17.64 15L22 10.64l-4.24-4.24-2.83 2.83" />
            <path d="M9.88 9.88l2.83-2.83L14.83 9" />
          </>
        );
      case 'pill':
      case 'flask':
        return (
          <>
            <path d="M10 2v4h4V2" />
            <path d="M6 22h12a2 2 0 0 0 1.7-3L14 7H10L4.3 19A2 2 0 0 0 6 22z" />
          </>
        );
      case 'meditation':
      case 'lotus':
        return (
          <>
            <circle cx="12" cy="5" r="2.5" />
            <path d="M12 9v4" />
            <path d="M6 13l3-2 3 3 3-3 3 2" />
            <path d="M4 19c2-2 5-3 8-3s6 1 8 3" />
          </>
        );

      default:
        // Default star 4-point glyph
        return (
          <path d="M12 2C12 7.52 7.52 12 2 12C7.52 12 12 16.48 12 22C12 16.48 16.48 12 22 12C16.48 12 12 7.52 12 2Z" />
        );
    }
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
      aria-hidden={!isAccessible ? 'true' : undefined}
      aria-label={ariaLabel}
      role={isAccessible ? 'img' : undefined}
      {...props}
    >
      {renderPath()}
    </svg>
  );
}

/**
 * Maps legacy emoji strings stored in cultivation / profile data to SVG Icon keys
 */
export function toIconKey(emojiOrStr) {
  if (!emojiOrStr) return 'star';
  const s = String(emojiOrStr).trim();
  if (s.includes('\u{1F4AD}')) return 'realm-ngung-khi';
  if (s.includes('\u{1F525}')) return 'realm-truc-co';
  if (s.includes('\u{1FA90}')) return 'realm-kim-dan';
  if (s.includes('\u{1F432}') || s.includes('\u{1F409}')) return 'dragon';
  if (s.includes('\u{1F42F}') || s.includes('\u{1F405}')) return 'tiger';
  if (s.includes('\u{1F40B}') || s.includes('\u{1F433}')) return 'whale';
  if (s.includes('\u{1F985}')) return 'eagle';
  if (s.includes('\u{2694}️') || s.includes('\u{1F5E1}️')) return 'sword';
  if (s.includes('\u{262F}️')) return 'yin-yang';
  if (s.includes('\u{1F3EE}')) return 'lantern';
  if (s.includes('\u{1FA78}')) return 'drop';
  if (s.includes('\u{1FA9E}')) return 'mirror';
  if (s.includes('\u{1F52E}')) return 'orb';
  if (s.includes('\u{1F451}')) return 'crown';
  if (s.includes('\u{26A1}')) return 'bolt';
  if (s.includes('\u{1F480}')) return 'skull';
  if (s.includes('\u{1F4E6}')) return 'package';
  if (s.includes('\u{1F528}')) return 'hammer';
  if (s.includes('\u{1F48A}')) return 'pill';
  if (s.includes('\u{23F3}') || s.includes('\u{23F0}')) return 'hourglass';
  if (s.includes('\u{2601}️')) return 'cloud';
  if (s.includes('\u{1F4F1}')) return 'phone';
  if (s.includes('\u{1F504}')) return 'sync';
  if (s.includes('\u{1F514}')) return 'bell';
  if (s.includes('\u{26A0}️')) return 'alert';
  if (s.includes('\u{1F4A1}')) return 'lightbulb';
  if (s.includes('\u{1F4D6}') || s.includes('\u{1F4DA}')) return 'book';
  return 'star';
}
