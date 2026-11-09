import { useRef, useState, useMemo } from 'react';
import { useLongPress } from '../../hooks/useLongPress';
import BottomSheet from './BottomSheet';
import { useNovelReadingProgress } from '../../hooks/useNovelReadingProgress';
import {
  IconDownload,
  IconEdit,
  IconLock,
  IconEye,
  IconTrash,
  IconClose,
  IconMoreVertical,
} from '../novel/NovelIcons';
import styles from './NovelCard.module.css';

/**
 * Deterministic gradient based on title hash for default covers
 */
function getCoverGradient(title = '') {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i);
    hash |= 0;
  }
  const gradients = [
    'linear-gradient(145deg, #0e172a 0%, #1e293b 60%, #0f172a 100%)',
    'linear-gradient(145deg, #0f1c32 0%, #1b2e4b 60%, #0c1524 100%)',
    'linear-gradient(145deg, #181528 0%, #29233e 60%, #110e1c 100%)',
    'linear-gradient(145deg, #0d2128 0%, #173742 60%, #0a191f 100%)',
  ];
  const idx = Math.abs(hash) % gradients.length;
  return gradients[idx];
}

/**
 * NovelCard — 3:4 ratio cover card with "Thư Viện Mực Đêm" styling
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
  index = 0,
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

  // Reading progress calculation from real chapter position in IndexedDB
  const progressInfo = useNovelReadingProgress(novel);

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

  const staggerStyle = {
    '--stagger-index': Math.min(index, 12),
  };

  if (viewMode === 'list') {
    return (
      <>
        <div
          className={`${styles.listItem} ${menuOpen ? styles.menuActive : ''}`}
          style={staggerStyle}
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
              <DefaultCover title={novel.title} compact />
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
            <div className={styles.listMetaRow}>
              <span className={styles.listChapterCount}>{novel.chapterCount} chương</span>
              {progressInfo && (
                <>
                  <span className={styles.metaDot}>·</span>
                  <span className={styles.listProgressText}>
                    Ch. {progressInfo.chapterNum}/{novel.chapterCount}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className={styles.listActions} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.moreBtn}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(true);
              }}
              title="Thao tác khác"
              aria-label="Thao tác khác"
            >
              <IconMoreVertical size={16} />
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
        style={staggerStyle}
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
          <div className={styles.coverGradient} aria-hidden="true" />
          {novel.isHidden && (
            <span className={styles.cardHiddenTag}>
              <IconLock size={10} style={{ marginRight: 2 }} />
              Ẩn
            </span>
          )}
        </div>

        {/* Info on Frosted Glass Base */}
        <div className={styles.info}>
          <h3 className={styles.title} title={novel.title}>{novel.title}</h3>

          <div className={styles.metaRow}>
            <span className={styles.chapterCount}>{novel.chapterCount} chương</span>
            {progressInfo && (
              <span className={styles.progressText}>
                Ch. {progressInfo.chapterNum}/{novel.chapterCount}
              </span>
            )}
          </div>

          {progressInfo && (
            <div className={styles.progressBar} aria-hidden="true">
              <div
                className={styles.progressFill}
                style={{ width: `${progressInfo.percent}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {menuOpen && renderActionSheet()}
    </>
  );
}

function DefaultCover({ title = '', compact = false }) {
  const char = title ? title.charAt(0).toUpperCase() : '?';
  const gradient = getCoverGradient(title);

  return (
    <div
      className={`${styles.defaultCover} ${compact ? styles.defaultCoverCompact : ''}`}
      style={{ background: gradient }}
    >
      <div className={styles.inkOverlay} aria-hidden="true" />
      <span className={styles.defaultChar}>{char}</span>
    </div>
  );
}
