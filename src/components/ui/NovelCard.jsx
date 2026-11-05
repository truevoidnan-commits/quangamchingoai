import { useRef, useState } from 'react';
import { useLongPress } from '../../hooks/useLongPress';
import BottomSheet from './BottomSheet';
import styles from './NovelCard.module.css';

/* SVG Icons - Stroke 1.75, round caps/joins */
function IconDownload({ size = 18, color = 'currentColor', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.75"
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

function IconEdit({ size = 18, color = 'currentColor', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function IconLock({ size = 18, color = 'currentColor', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function IconEye({ size = 18, color = 'currentColor', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconTrash({ size = 18, color = 'currentColor', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function IconClose({ size = 18, color = 'currentColor', style = {} }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/**
 * NovelCard — 3:4 ratio cover card with bottom sheet action menu on long-press
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
    e?.stopPropagation?.();
    setMenuOpen(false);
    onEdit?.(novel);
  };

  const handleDelete = (e) => {
    e?.stopPropagation?.();
    if (confirm(`Bạn có chắc chắn muốn xóa truyện "${novel.title}" khỏi thư viện?`)) {
      setMenuOpen(false);
      onDelete?.(novel);
    }
  };

  const handleHide = (e) => {
    e?.stopPropagation?.();
    setMenuOpen(false);
    onHide?.(novel);
  };

  const handleUnhide = (e) => {
    e?.stopPropagation?.();
    setMenuOpen(false);
    onUnhide?.(novel);
  };

  // Reusable bottom sheet action menu
  const renderActionSheet = () => (
    <BottomSheet isOpen={menuOpen} onClose={() => setMenuOpen(false)}>
      <div className={styles.sheetHeader}>
        <div className={styles.sheetCover}>
          {(novel.coverThumb || novel.coverUrl) ? (
            <img src={novel.coverThumb || novel.coverUrl} alt={novel.title} />
          ) : (
            <div className={styles.sheetDefaultCover}>
              <span>{novel.title ? novel.title.charAt(0).toUpperCase() : '?'}</span>
            </div>
          )}
        </div>
        <div className={styles.sheetInfo}>
          <h3 className={styles.sheetTitle}>{novel.title}</h3>
          <span className={styles.sheetSubtitle}>{novel.chapterCount} chương</span>
        </div>
        <button
          type="button"
          className={styles.sheetCloseBtn}
          onClick={() => setMenuOpen(false)}
          aria-label="Đóng"
        >
          <IconClose size={18} />
        </button>
      </div>

      <div className={styles.sheetActions}>
        {onExport && (
          <button
            type="button"
            className={styles.actionRow}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
              onExport(novel);
            }}
          >
            <div className={styles.actionIconWrap}>
              <IconDownload size={18} />
            </div>
            <span className={styles.actionLabel}>Tải về máy</span>
          </button>
        )}

        <button
          type="button"
          className={styles.actionRow}
          onClick={handleEdit}
        >
          <div className={styles.actionIconWrap}>
            <IconEdit size={18} />
          </div>
          <span className={styles.actionLabel}>Sửa truyện</span>
        </button>

        {novel.isHidden || isVaultMode ? (
          <button
            type="button"
            className={`${styles.actionRow} ${styles.actionUnhide}`}
            onClick={handleUnhide}
          >
            <div className={`${styles.actionIconWrap} ${styles.vaultIconWrap}`}>
              <IconEye size={18} color="#c084fc" />
            </div>
            <span className={styles.actionLabel}>Hiện lại truyện</span>
          </button>
        ) : (
          <button
            type="button"
            className={`${styles.actionRow} ${styles.actionHide}`}
            onClick={handleHide}
          >
            <div className={`${styles.actionIconWrap} ${styles.vaultIconWrap}`}>
              <IconLock size={18} color="#c084fc" />
            </div>
            <span className={styles.actionLabel}>Ẩn vào Mật Thất</span>
          </button>
        )}

        <div className={styles.actionDivider} />

        <button
          type="button"
          className={`${styles.actionRow} ${styles.actionDanger}`}
          onClick={handleDelete}
        >
          <div className={`${styles.actionIconWrap} ${styles.dangerIconWrap}`}>
            <IconTrash size={18} color="#ff6b6b" />
          </div>
          <span className={styles.actionLabel}>Xóa truyện</span>
        </button>
      </div>
    </BottomSheet>
  );

  if (viewMode === 'list') {
    return (
      <>
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
              {novel.isHidden && (
                <span className={styles.hiddenTag}>
                  <IconLock size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                  Ẩn
                </span>
              )}
            </div>
            <span className="text-muted">{novel.chapterCount} chương</span>
          </div>
          <div className={styles.listActions}>
            {novel.isHidden || isVaultMode ? (
              <button
                className="btn-ghost"
                style={{ fontSize: 12, padding: '4px 10px', color: '#c084fc', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                onClick={handleUnhide}
                title="Hiện truyện lại"
              >
                <IconEye size={13} color="#c084fc" />
                Hiện
              </button>
            ) : (
              <button
                className="btn-ghost"
                style={{ fontSize: 12, padding: '4px 10px', color: '#a855f7', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                onClick={handleHide}
                title="Ẩn truyện vào Mật Thất"
              >
                <IconLock size={13} color="#a855f7" />
                Ẩn
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
                <IconDownload size={13} />
                Tải
              </button>
            )}
            <button
              className="btn-ghost"
              style={{ fontSize: 12, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={handleEdit}
            >
              <IconEdit size={13} />
              Sửa
            </button>
            <button
              className="btn-danger"
              style={{ fontSize: 12, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={handleDelete}
            >
              <IconTrash size={13} />
              Xóa
            </button>
          </div>
        </div>

        {menuOpen && renderActionSheet()}
      </>
    );
  }

  return (
    <>
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
      </div>

      {menuOpen && renderActionSheet()}
    </>
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
