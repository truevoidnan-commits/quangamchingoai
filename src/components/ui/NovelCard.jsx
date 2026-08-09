import { useRef, useState } from 'react';
import { useLongPress } from '../../hooks/useLongPress';
import styles from './NovelCard.module.css';

/**
 * NovelCard — 3:4 ratio cover card with long-press context menu
 */
export default function NovelCard({ novel, onClick, onEdit, onDelete, viewMode = 'grid' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const longPressHandlers = useLongPress(() => {
    setMenuOpen(true);
  });

  const handleClick = (e) => {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    onClick?.(novel);
  };

  const handleEdit = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    onEdit?.(novel);
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    onDelete?.(novel);
  };

  const closeMenu = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
  };

  if (viewMode === 'list') {
    return (
      <div
        className={`${styles.listItem} ${menuOpen ? styles.menuActive : ''}`}
        {...longPressHandlers}
        onClick={handleClick}
        role="button"
        tabIndex={0}
      >
        <div className={styles.listCover}>
          {novel.coverUrl ? (
            <img src={novel.coverUrl} alt={novel.title} loading="lazy" />
          ) : (
            <DefaultCover title={novel.title} />
          )}
        </div>
        <div className={styles.listInfo}>
          <h3 className={styles.listTitle}>{novel.title}</h3>
          <span className="text-muted">{novel.chapterCount} chương</span>
        </div>
        <div className={styles.listActions}>
          <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={handleEdit}>Sửa</button>
          <button className="btn-danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={handleDelete}>Xóa</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.card} ${menuOpen ? styles.menuActive : ''}`}
      {...longPressHandlers}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`Đọc ${novel.title}`}
    >
      {/* Cover */}
      <div className={styles.cover}>
        {novel.coverUrl ? (
          <img src={novel.coverUrl} alt={novel.title} loading="lazy" />
        ) : (
          <DefaultCover title={novel.title} />
        )}
        {/* Gradient overlay */}
        <div className={styles.coverOverlay} />
      </div>

      {/* Info */}
      <div className={styles.info}>
        <h3 className={styles.title}>{novel.title}</h3>
        <span className={styles.chapterCount}>{novel.chapterCount} chương</span>
      </div>

      {/* Context menu overlay */}
      {menuOpen && (
        <div className={styles.contextMenu} onClick={e => e.stopPropagation()}>
          <button className={styles.menuItem} onClick={handleEdit}>
            ✏️ Sửa truyện
          </button>
          <button className={`${styles.menuItem} ${styles.menuDanger}`} onClick={handleDelete}>
            🗑️ Xóa truyện
          </button>
          <button className={styles.menuCancel} onClick={closeMenu}>
            Hủy
          </button>
        </div>
      )}
    </div>
  );
}

function DefaultCover({ title }) {
  const char = title ? title.charAt(0).toUpperCase() : '?';
  return (
    <div className={styles.defaultCover}>
      <span className={styles.defaultChar}>{char}</span>
      <div className={styles.defaultDecor}>✦ THIÊN CƠ ✦</div>
    </div>
  );
}
