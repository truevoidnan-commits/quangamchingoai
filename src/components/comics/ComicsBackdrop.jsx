import React, { useState, useEffect, useRef } from 'react';
import { loadCustomBackdropUrls } from '../../lib/comics/customBackdrop.js';
import styles from './ComicsBackdrop.module.css';

export default function ComicsBackdrop() {
  const [customBackdrop, setCustomBackdrop] = useState(null);
  const activeUrlsRef = useRef([]);

  const loadBackdrop = async () => {
    try {
      const data = await loadCustomBackdropUrls();
      // Revoke old object URLs to avoid memory leaks
      activeUrlsRef.current.forEach((u) => {
        if (u) URL.revokeObjectURL(u);
      });
      activeUrlsRef.current = [];

      if (data && data.settings && (data.verticalUrl || data.wideUrl)) {
        if (data.verticalUrl) activeUrlsRef.current.push(data.verticalUrl);
        if (data.wideUrl) activeUrlsRef.current.push(data.wideUrl);
        setCustomBackdrop(data);
      } else {
        setCustomBackdrop(null);
      }
    } catch (e) {
      console.warn('[ComicsBackdrop] Error loading backdrop:', e);
      setCustomBackdrop(null);
    }
  };

  useEffect(() => {
    loadBackdrop();

    const handleBackdropChanged = () => {
      loadBackdrop();
    };

    window.addEventListener('tcl_custom_backdrop_changed', handleBackdropChanged);
    return () => {
      window.removeEventListener('tcl_custom_backdrop_changed', handleBackdropChanged);
      activeUrlsRef.current.forEach((u) => {
        if (u) URL.revokeObjectURL(u);
      });
      activeUrlsRef.current = [];
    };
  }, []);

  const hasCustom = Boolean(customBackdrop && customBackdrop.settings);
  // Auto-dim guarantee: minimum 35% dim for text readability
  const dimPercent = hasCustom
    ? Math.min(80, Math.max(35, Number(customBackdrop.settings.dim) || 40))
    : 0;
  const blurPx = hasCustom ? Number(customBackdrop.settings.blur) || 0 : 0;

  return (
    <div className={styles.backdrop} aria-hidden="true">
      {/* Background image layer with 300ms crossfade transition */}
      {hasCustom ? (
        <div
          className={styles.imageLayer}
          style={{
            backgroundImage: `url(${customBackdrop.wideUrl || customBackdrop.verticalUrl})`,
            filter: blurPx > 0 ? `blur(${blurPx}px)` : 'none',
            transform: blurPx > 0 ? 'scale(1.05)' : 'none',
          }}
        />
      ) : (
        <div className={`${styles.imageLayer} ${styles.defaultBg}`} />
      )}

      {/* Dim overlay for custom background */}
      {hasCustom && (
        <div
          className={styles.dimLayer}
          style={{ backgroundColor: `rgba(8, 10, 20, ${dimPercent / 100})` }}
        />
      )}

      {/* Gradient vignette layer */}
      <div className={styles.overlayLayer} />

      {/* Subtle anti-banding noise layer */}
      <div className={styles.noiseLayer} />
    </div>
  );
}
