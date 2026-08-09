import { useEffect, useRef } from 'react';
import styles from './BottomSheet.module.css';

/**
 * BottomSheet — slides up from bottom, with backdrop
 */
export default function BottomSheet({ isOpen, onClose, title, children, height = 'auto', fullHeight = false }) {
  const sheetRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div
        ref={sheetRef}
        className={`${styles.sheet} ${fullHeight ? styles.fullHeight : ''} animate-slide-up`}
        style={height !== 'auto' ? { height } : {}}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className={styles.handle} />
        {/* Header */}
        {title && (
          <div className={styles.header}>
            <h3 className={styles.title}>{title}</h3>
            <button className={`btn-icon ${styles.closeBtn}`} onClick={onClose} aria-label="Đóng">✕</button>
          </div>
        )}
        {/* Content */}
        <div className={styles.content}>
          {children}
        </div>
      </div>
    </div>
  );
}
