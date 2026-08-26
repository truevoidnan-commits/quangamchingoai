import { useEffect } from 'react';
import styles from './TableOfContents.module.css';
import BottomSheet from '../ui/BottomSheet';

/**
 * TableOfContents — bottom-sheet mục lục
 */
export default function TableOfContents({ isOpen, onClose, chapters, currentChapterId, onSelectChapter }) {
  const mainChapters = chapters.filter(c => !c.isExtra);
  const extraChapters = chapters.filter(c => c.isExtra);

  // Tự động cuộn đến chương đang đọc dở khi mở mục lục
  useEffect(() => {
    if (isOpen && currentChapterId) {
      const timer = setTimeout(() => {
        const el = document.getElementById(`toc-chapter-${currentChapterId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOpen, currentChapterId]);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Mục lục" fullHeight>
      <div className={styles.inner}>
        {/* Main chapters */}
        {mainChapters.length > 0 && (
          <section>
            {mainChapters.map(ch => (
              <ChapterItem
                key={ch.id}
                chapter={ch}
                isActive={ch.id === currentChapterId}
                onSelect={() => { onSelectChapter(ch); onClose(); }}
              />
            ))}
          </section>
        )}

        {/* Extra chapters */}
        {extraChapters.length > 0 && (
          <>
            <div className={styles.sectionDivider}>
              <div className={styles.sectionLine} />
              <span className={styles.sectionLabel}>✦ Ngoại truyện / Phiên ngoại ✦</span>
              <div className={styles.sectionLine} />
            </div>
            <section>
              {extraChapters.map(ch => (
                <ChapterItem
                  key={ch.id}
                  chapter={ch}
                  isActive={ch.id === currentChapterId}
                  isExtra
                  onSelect={() => { onSelectChapter(ch); onClose(); }}
                />
              ))}
            </section>
          </>
        )}

        {chapters.length === 0 && (
          <div className={styles.empty}>
            <p>Chưa có chương nào</p>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

function ChapterItem({ chapter, isActive, isExtra, onSelect }) {
  return (
    <button
      id={`toc-chapter-${chapter.id}`}
      className={`${styles.item} ${isActive ? styles.active : ''} ${isExtra ? styles.extra : ''}`}
      onClick={onSelect}
    >
      <span className={styles.itemTitle}>{chapter.title}</span>
      {isActive && (
        <span className="badge badge-gold badge-reading-pulse" style={{ flexShrink: 0, marginLeft: 6 }}>
          ✦ Đang đọc
        </span>
      )}
      {isExtra && <span className="badge badge-extra" style={{ flexShrink: 0, marginLeft: 6 }}>Ngoại truyện</span>}
      {isActive && <span className={styles.activeIndicator}>▶</span>}
    </button>
  );
}
