import React from 'react';
import styles from './ComicsBackdrop.module.css';

export default function ComicsBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={`${styles.imageLayer} ${styles.defaultBg}`} />
      <div className={styles.overlayLayer} />
      <div className={styles.noiseLayer} />
    </div>
  );
}
