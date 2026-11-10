import { useEffect, useRef } from 'react';
import styles from './BottomSheet.module.css';

/**
 * BottomSheet — slides up from bottom, with backdrop & swipe-to-dismiss
 */
export default function BottomSheet({
  isOpen,
  onClose,
  title,
  customHeader,
  children,
  height = 'auto',
  fullHeight = false,
  className = '',
}) {
  const sheetRef = useRef(null);
  const touchStartY = useRef(0);
  const touchCurrentY = useRef(0);
  const isDragging = useRef(false);
  // Chỉ coi là "kéo sheet" khi cử chỉ bắt đầu ở vùng không cuộn được (tay nắm/tiêu đề)
  // hoặc ở nội dung đang nằm sát đỉnh VÀ nội dung chưa từng cuộn trong cử chỉ này.
  const canDragSheet = useRef(false);
  const sheetDragEngaged = useRef(false);
  const startScrollTop = useRef(0);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Touch gesture handlers for swipe down
  const handleTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
    isDragging.current = true;
    sheetDragEngaged.current = false;
    const contentEl = sheetRef.current?.querySelector('.' + styles.content);
    const startedInContent = Boolean(contentEl && contentEl.contains(e.target));
    startScrollTop.current = contentEl ? contentEl.scrollTop : 0;
    canDragSheet.current = !startedInContent || startScrollTop.current <= 0;
  };

  const handleTouchMove = (e) => {
    if (!isDragging.current || !sheetRef.current) return;
    touchCurrentY.current = e.touches[0].clientY;
    const diff = touchCurrentY.current - touchStartY.current;
    const contentEl = sheetRef.current.querySelector('.' + styles.content);
    // Nội dung đã cuộn trong cử chỉ này => đây là thao tác lướt danh sách, huỷ khả năng kéo đóng sheet
    if (contentEl && contentEl.scrollTop !== startScrollTop.current && !sheetDragEngaged.current) {
      canDragSheet.current = false;
    }
    if (!canDragSheet.current) return;
    if (diff > 0) {
      sheetDragEngaged.current = true;
      sheetRef.current.style.transform = `translateY(${diff}px)`;
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging.current || !sheetRef.current) return;
    isDragging.current = false;
    const diff = touchCurrentY.current - touchStartY.current;
    const engaged = sheetDragEngaged.current;
    sheetDragEngaged.current = false;
    if (engaged && diff > 75) {
      sheetRef.current.style.transition = 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1)';
      sheetRef.current.style.transform = 'translateY(100%)';
      setTimeout(() => {
        if (sheetRef.current) {
          sheetRef.current.style.transform = '';
          sheetRef.current.style.transition = '';
        }
        onClose();
      }, 180);
    } else if (engaged) {
      sheetRef.current.style.transition = 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)';
      sheetRef.current.style.transform = '';
      setTimeout(() => {
        if (sheetRef.current) sheetRef.current.style.transition = '';
      }, 200);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div
        ref={sheetRef}
        className={`${styles.sheet} ${fullHeight ? styles.fullHeight : ''} ${className} animate-slide-up`}
        style={height !== 'auto' ? { height } : {}}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Handle */}
        <div className={styles.handle} />
        {/* Header */}
        {customHeader ? (
          customHeader
        ) : title ? (
          <div className={styles.header}>
            <h3 className={styles.title}>{title}</h3>
            <button className={`btn-icon ${styles.closeBtn}`} onClick={onClose} aria-label="Đóng">
              ✕
            </button>
          </div>
        ) : null}
        {/* Content */}
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
