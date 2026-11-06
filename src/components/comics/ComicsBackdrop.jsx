import React, { useState, useEffect, useRef } from 'react';
import { loadCustomBackdropUrls } from '../../lib/comics/customBackdrop.js';
import styles from './ComicsBackdrop.module.css';

export default function ComicsBackdrop({ seriesId = null }) {
  const [customBackdrop, setCustomBackdrop] = useState(null);
  const activeUrlsRef = useRef([]);

  const loadBackdrop = async () => {
    // If no seriesId is provided (lobby or general views), lobby always uses default backdrop
    if (!seriesId) {
      activeUrlsRef.current.forEach((u) => {
        if (u) URL.revokeObjectURL(u);
      });
      activeUrlsRef.current = [];
      setCustomBackdrop(null);
      return;
    }

    try {
      const data = await loadCustomBackdropUrls(seriesId);
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
      console.warn('[ComicsBackdrop] Error loading backdrop for series:', seriesId, e);
      setCustomBackdrop(null);
    }
  };

  useEffect(() => {
    loadBackdrop();

    const handleBackdropChanged = (e) => {
      // Only reload if this component is attached to a series and the event affects this series (or general reload)
      if (seriesId && (!e?.detail?.seriesId || e.detail.seriesId === seriesId)) {
        loadBackdrop();
      }
    };

    window.addEventListener('tcl_custom_backdrop_changed', handleBackdropChanged);
    return () => {
      window.removeEventListener('tcl_custom_backdrop_changed', handleBackdropChanged);
      activeUrlsRef.current.forEach((u) => {
        if (u) URL.revokeObjectURL(u);
      });
      activeUrlsRef.current = [];
    };
  }, [seriesId]);

  const hasCustom = Boolean(seriesId && customBackdrop && customBackdrop.settings);
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
