import { useRef, useState } from 'react';
import { useLongPress } from '../../hooks/useLongPress';
import styles from './NovelCard.module.css';

function DownloadIcon({ size = 14, style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/**
 * NovelCard — 3:4 ratio cover card with persistent long-press context menu
 */
export default function NovelCard({
  novel,
  onClick,
  onEdit,
  onDelete,
  onHide,
  onUnhide,
  onExport,
  isVaultMode = false,
  viewMode = 'grid',
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const suppressClickRef = useRef(false);

  const { handlers } = useLongPress(() => {
    suppressClickRef.current = true;
    setMenuOpen(true);
  }, 450);

  const handleContextMenu = (e) => {
    e.preventDefault();
    setMenuOpen(true);
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (menuOpen) {
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
    if (confirm(`Bạn có chắc chắn muốn xóa truyện "${novel.title}" khỏi thư viện?`)) {
      setMenuOpen(false);
      onDelete?.(novel);
    }
  };

  const handleHide = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    onHide?.(novel);
  };

  const handleUnhide = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
    onUnhide?.(novel);
  };

  const closeMenu = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
  };

  if (viewMode === 'list') {
    return (
      <div
        className={`${styles.listItem} ${menuOpen ? styles.menuActive : ''}`}
        {...handlers}
        onContextMenu={handleContextMenu}
        onClick={handleClick}
        role="button"
        tabIndex={0}
      >
        <div className={styles.listCover}>
          {(novel.coverThumb || novel.coverUrl) ? (
            <img src={novel.coverThumb || novel.coverUrl} alt={novel.title} loading="lazy" />
          ) : (
            <DefaultCover title={novel.title} />
          )}
        </div>
        <div className={styles.listInfo}>
          <div className={styles.listTitleRow}>
            <h3 className={styles.listTitle}>{novel.title}</h3>
            {novel.isHidden && <span className={styles.hiddenTag}>🔒 Ẩn</span>}
          </div>
          <span className="text-muted">{novel.chapterCount} chương</span>
        </div>
        <div className={styles.listActions}>
          {novel.isHidden || isVaultMode ? (
            <button
              className="btn-ghost"
              style={{ fontSize: 12, padding: '4px 10px', color: '#c084fc' }}
              onClick={handleUnhide}
              title="Hiện truyện lại"
            >
              👁️ Hiện
            </button>
          ) : (
            <button
              className="btn-ghost"
              style={{ fontSize: 12, padding: '4px 10px', color: '#a855f7' }}
              onClick={handleHide}
              title="Ẩn truyện vào Mật Thất"
            >
              🔒 Ẩn
            </button>
          )}
          {onExport && (
            <button
              className="btn-ghost"
              style={{ fontSize: 12, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={(e) => {
                e.stopPropagation();
                onExport(novel);
              }}
              title="Tải về máy"
            >
              <DownloadIcon size={12} />
              Tải
            </button>
          )}
          <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }} onClick={handleEdit}>
            Sửa
          </button>
          <button className="btn-danger" style={{ fontSize: 12, padding: '4px 10px' }} onClick={handleDelete}>
            Xóa
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${styles.card} ${menuOpen ? styles.menuActive : ''}`}
      {...handlers}
      onContextMenu={handleContextMenu}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`Đọc ${novel.title}`}
    >
      {/* Cover */}
      <div className={styles.cover}>
        {(novel.coverThumb || novel.coverUrl) ? (
            <img src={novel.coverThumb || novel.coverUrl} alt={novel.title} className={styles.coverImg} loading="lazy" />
        ) : (
          <DefaultCover title={novel.title} />
        )}
      </div>

      {/* Info */}
      <div className={styles.info}>
        <h3 className={styles.title}>{novel.title}</h3>
        <span className={styles.chapterCount}>{novel.chapterCount} chương</span>
      </div>

      {/* Persistent Context menu overlay upon long-press */}
      {menuOpen && (
        <div className={styles.contextMenu} onClick={(e) => e.stopPropagation()}>
          {novel.isHidden || isVaultMode ? (
            <button className={`${styles.menuItem} ${styles.menuUnhide}`} onClick={handleUnhide}>
              👁️ Bỏ ẩn (Hiện truyện)
            </button>
          ) : (
            <button className={`${styles.menuItem} ${styles.menuHide}`} onClick={handleHide}>
              🔒 Ẩn truyện (Mật Thất)
            </button>
          )}
          {onExport && (
            <button
              className={styles.menuItem}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onExport(novel);
              }}
            >
              <DownloadIcon size={14} style={{ marginRight: 6 }} />
              Tải Về Máy
            </button>
          )}
          <button className={styles.menuItem} onClick={handleEdit}>
            ✏️ Sửa truyện
          </button>
          <button className={`${styles.menuItem} ${styles.menuDanger}`} onClick={handleDelete}>
            🗑️ Xóa truyện
          </button>
          <button className={styles.menuCancel} onClick={closeMenu}>
            ✕ Hủy
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
