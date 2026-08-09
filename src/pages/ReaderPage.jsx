import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getNovel, getChapters, getChapter } from '../lib/db';
import { getReadingProgress, saveReadingProgress } from '../lib/storage';
import { useReadingSettings } from '../hooks/useReadingSettings';
import { READING_THEMES, FONT_OPTIONS } from '../hooks/useReadingSettings';
import { useCultivation } from '../hooks/useCultivation';
import CultivationModal from '../components/cultivation/CultivationModal';
import TableOfContents from '../components/reader/TableOfContents';
import ReadingSettings from '../components/reader/ReadingSettings';
import ScrollToTop from '../components/ui/ScrollToTop';
import styles from './ReaderPage.module.css';

export default function ReaderPage() {
  const { novelId, chapterId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchKeyword = searchParams.get('q') || '';
  const navigate = useNavigate();
  const { settings, updateSettings } = useReadingSettings();
  const { gainReadingExp, displayName, LAMP_TIERS } = useCultivation();

  const [novel, setNovel] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [chapter, setChapter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cultivationOpen, setCultivationOpen] = useState(false);
  const [barVisible, setBarVisible] = useState(true);
  const [breakthroughToast, setBreakthroughToast] = useState(null);
  const [droppedLamp, setDroppedLamp] = useState(null);
  const scrollRef = useRef(null);
  const lastScrollY = useRef(0);

  // Load novel + chapters list
  useEffect(() => {
    (async () => {
      const [n, chs] = await Promise.all([getNovel(novelId), getChapters(novelId)]);
      setNovel(n);
      setChapters(chs || []);
    })();
  }, [novelId]);

  // Load current chapter
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const ch = await getChapter(chapterId);
        setChapter(ch);
        window.scrollTo({ top: 0 });
      } finally {
        setLoading(false);
      }
    })();
  }, [chapterId]);

  // Chu kỳ ngộ đạo 60s lặp lại liên tục (cứ 60s tăng tu vi âm thầm & bắt đầu vòng mới)
  const [cycleSeconds, setCycleSeconds] = useState(0);
  const [cycleCount, setCycleCount] = useState(0);

  // Reset timer on chapter change & save reading progress
  useEffect(() => {
    setCycleSeconds(0);
    if (chapter) {
      saveReadingProgress(novelId, { chapterId: chapter.id, scrollTop: 0 });
    }
  }, [chapter?.id, novelId]);

  // Đếm chu kỳ 60 giây ngộ đạo tu vi lặp lại vô tận
  useEffect(() => {
    if (!chapter) return;
    const timer = setInterval(() => {
      setCycleSeconds(prev => {
        if (prev + 1 >= 60) {
          // Hoàn thành chu kỳ 60s: Tự động cộng tu vi âm thầm
          const wordCount = chapter.content ? chapter.content.length : 0;
          const res = gainReadingExp(novelId, chapter.id, wordCount);
          if (res) {
            if (res.droppedLamp) {
              setDroppedLamp(res.droppedLamp);
            }
            // Chỉ khi đột phá tầng / cảnh giới mới hiện thông báo 1 giây rồi tự tiêu tán
            if (res.breakthrough) {
              setBreakthroughToast(res.breakthrough);
              setTimeout(() => setBreakthroughToast(null), 1200);
            }
          }
          setCycleCount(c => c + 1);
          return 0; // Bắt đầu vòng 60s mới
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [chapter?.id, novelId, gainReadingExp]);

  // Auto-hide top bar on scroll down
  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      setBarVisible(currentY < lastScrollY.current || currentY < 80);
      lastScrollY.current = currentY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Navigate to adjacent chapters
  const currentIndex = chapters.findIndex(c => c.id === chapterId);
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

  const goToChapter = useCallback((ch) => {
    if (ch) {
      const queryStr = searchKeyword ? `?q=${encodeURIComponent(searchKeyword)}` : '';
      navigate(`/novel/${novelId}/read/${ch.id}${queryStr}`);
    }
  }, [navigate, novelId, searchKeyword]);

  const clearHighlight = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    setSearchParams(next);
  };

  const theme = READING_THEMES[settings.theme] || READING_THEMES.dark;
  const fontCss = FONT_OPTIONS.find(f => f.id === settings.fontFamily)?.css || "'Noto Serif', serif";

  // Split content into paragraphs
  const paragraphs = chapter?.content
    ? chapter.content.split('\n\n').filter(p => p.trim())
    : [];

  return (
    <div
      className={styles.page}
      style={{ backgroundColor: theme.bg, color: theme.text }}
      id="reader-page"
    >
      {/* ===== TOP BAR ===== */}
      <div className={`${styles.topBar} ${!barVisible ? styles.topBarHidden : ''}`}>
        <div className={styles.topBarInner}>
          <button
            className={styles.topBtn}
            onClick={() => navigate(`/novel/${novelId}`)}
            aria-label="Quay lại"
          >
            ←
          </button>
          <span className={styles.chapterLabel} title={chapter?.title}>
            {chapter?.title || '...'}
          </span>
          <div className={styles.meditationBadgeWrap}>
            <span className={styles.meditationBadge} title="Mỗi chu kỳ 60s tĩnh tâm đọc sẽ hấp thu một luồng linh khí tu vi (lặp lại liên tục)">
              🧘 Ngộ đạo {cycleSeconds}/60s {cycleCount > 0 ? `(Vòng ${cycleCount + 1})` : ''}
            </span>
          </div>
          <div className={styles.topBtns}>
            <button
              className={styles.topBtn}
              onClick={() => setCultivationOpen(true)}
              title="Xem Bảng Tu Vi"
              aria-label="Tu Vi"
              style={{ color: '#ffcc00' }}
            >
              ⚡
            </button>
            <button
              className={styles.topBtn}
              onClick={() => navigate(`/novel/${novelId}/add-chapter`)}
              title="Thêm chương"
              aria-label="Thêm chương"
            >
              +
            </button>
            <button
              className={styles.topBtn}
              onClick={() => setSettingsOpen(true)}
              title="Tuỳ chỉnh"
              aria-label="Cài đặt đọc"
            >
              ☰
            </button>
            <button
              className={styles.topBtn}
              onClick={() => setTocOpen(true)}
              title="Mục lục"
              aria-label="Mục lục"
            >
              📋
            </button>
          </div>
        </div>
      </div>

      {/* Floating search badge if navigating from search */}
      {searchKeyword && (
        <div className={styles.highlightBadgeBar}>
          <span>🔍 Khớp từ khoá: "<strong>{searchKeyword}</strong>"</span>
          <button className={styles.clearHighlightBtn} onClick={clearHighlight} title="Tắt highlight">
            ✕ Tắt
          </button>
        </div>
      )}

      {/* Breakthrough Banner — Xuất hiện chớp nhoáng 1 giây rồi tự tiêu tán */}
      {breakthroughToast && (
        <div className={styles.breakthroughToast}>
          <span className={styles.breakthroughIcon}>{breakthroughToast.icon || '⚡'}</span>
          <div className={styles.breakthroughContent}>
            <span className={styles.breakthroughTitle}>{breakthroughToast.title}</span>
            {breakthroughToast.subtitle && (
              <span className={styles.breakthroughSubtitle}>{breakthroughToast.subtitle}</span>
            )}
          </div>
        </div>
      )}

      {/* Lucky Life Lamp Drop Celebration Modal */}
      {droppedLamp && (
        <div className={styles.lampDropOverlay} onClick={() => setDroppedLamp(null)}>
          <div className={styles.lampDropModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.lampDropAura} />
            <span className={styles.lampDropBadge}>✦ THƯỢNG CỔ CƠ DUYÊN ✦</span>
            <span className={styles.lampDropIcon}>{droppedLamp.icon}</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, margin: '4px 0' }}>
              <h3 className={styles.lampDropTitle} style={{ color: droppedLamp.color || '#ffcc00', margin: 0 }}>
                {droppedLamp.name}
              </h3>
              {droppedLamp.tier && LAMP_TIERS[droppedLamp.tier] && (
                <span
                  className="badge"
                  style={{
                    backgroundColor: LAMP_TIERS[droppedLamp.tier].bg,
                    color: LAMP_TIERS[droppedLamp.tier].color,
                    borderColor: LAMP_TIERS[droppedLamp.tier].border,
                    fontSize: 10,
                    padding: '2px 8px',
                  }}
                >
                  {LAMP_TIERS[droppedLamp.tier].name}
                </span>
              )}
            </div>
            <p className={styles.lampDropPoem}>"{droppedLamp.poem}"</p>
            <p className={styles.lampDropDesc}>{droppedLamp.desc}</p>
            <div className={styles.lampDropActions}>
              <button
                className="btn-gold"
                onClick={() => {
                  setDroppedLamp(null);
                  setCultivationOpen(true);
                }}
              >
                🏮 Xem Trong Bảng Tu Vi
              </button>
              <button className="btn-ghost" onClick={() => setDroppedLamp(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== CONTENT ===== */}
      <main
        className={styles.content}
        ref={scrollRef}
        style={{
          fontSize: `${settings.fontSize}px`,
          fontFamily: fontCss,
          lineHeight: settings.lineHeight,
        }}
      >
        {loading && (
          <div className={styles.loadingWrap}>
            <div className="spinner" style={{ borderTopColor: theme.accent }} />
          </div>
        )}

        {!loading && chapter && (
          <>
            <h2
              className={styles.chapterTitle}
              style={{ color: theme.accent, fontFamily: fontCss }}
            >
              {highlightText(chapter.title, searchKeyword, styles.readerMark)}
            </h2>

            {paragraphs.map((p, i) => (
              <p key={i} className={styles.paragraph}>
                {highlightText(p, searchKeyword, styles.readerMark)}
              </p>
            ))}
          </>
        )}

        {!loading && !chapter && (
          <div className={styles.notFound}>
            <p>Không tìm thấy nội dung chương này.</p>
            <button className="btn-ghost" onClick={() => navigate(`/novel/${novelId}`)}>
              ← Quay lại
            </button>
          </div>
        )}
      </main>

      {/* ===== CHAPTER NAVIGATION ===== */}
      {!loading && (
        <nav className={styles.chapterNav} style={{ borderColor: `${theme.accent}30` }}>
          <button
            className={styles.navBtn}
            style={{ color: prevChapter ? theme.accent : `${theme.text}40`, borderColor: prevChapter ? `${theme.accent}50` : `${theme.text}20` }}
            onClick={() => goToChapter(prevChapter)}
            disabled={!prevChapter}
          >
            ← Chương trước
          </button>
          <button
            className={styles.tocBtn}
            onClick={() => setTocOpen(true)}
            style={{ color: theme.accent, borderColor: `${theme.accent}40` }}
          >
            📋
          </button>
          <button
            className={styles.navBtn}
            style={{ color: nextChapter ? theme.accent : `${theme.text}40`, borderColor: nextChapter ? `${theme.accent}50` : `${theme.text}20` }}
            onClick={() => goToChapter(nextChapter)}
            disabled={!nextChapter}
          >
            Chương sau →
          </button>
        </nav>
      )}

      {/* Footer credit */}
      <div className={styles.footerCredit} style={{ color: `${theme.text}40` }}>
        Thiết kế bởi <span style={{ color: `${theme.text}60` }}>Minh Đỗ</span>
      </div>

      {/* ToC bottom sheet */}
      <TableOfContents
        isOpen={tocOpen}
        onClose={() => setTocOpen(false)}
        chapters={chapters}
        currentChapterId={chapterId}
        onSelectChapter={(ch) => navigate(`/novel/${novelId}/read/${ch.id}`)}
      />

      {/* Reading settings */}
      <ReadingSettings
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdate={updateSettings}
      />

      {/* Cultivation Modal */}
      <CultivationModal
        isOpen={cultivationOpen}
        onClose={() => setCultivationOpen(false)}
      />

      {/* Scroll to top FAB */}
      <ScrollToTop />
    </div>
  );
}

function highlightText(text, keyword, markClassName) {
  if (!keyword || !text) return text;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === keyword.toLowerCase() ? (
      <mark key={i} className={markClassName}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}
