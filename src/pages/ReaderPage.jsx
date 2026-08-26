import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getNovel, getChapters, getChapter } from '../lib/db';
import { getReadingProgress, saveReadingProgress } from '../lib/storage';
import { useReadingSettings } from '../hooks/useReadingSettings';
import { READING_THEMES, FONT_OPTIONS } from '../hooks/useReadingSettings';
import { useCultivation } from '../hooks/useCultivation';
import CultivationModal from '../components/cultivation/CultivationModal';
import BreakthroughModal from '../components/cultivation/BreakthroughModal';
import TableOfContents from '../components/reader/TableOfContents';
import ReadingSettings from '../components/reader/ReadingSettings';
import ScrollToTop from '../components/ui/ScrollToTop';
import styles from './ReaderPage.module.css';

export default function ReaderPage() {
  const { id, novelId, chapterId } = useParams();
  const activeNovelId = novelId || id;
  const [searchParams, setSearchParams] = useSearchParams();
  const searchKeyword = searchParams.get('q') || '';
  const navigate = useNavigate();
  const { settings, updateSettings } = useReadingSettings();
  const { gainReadingExp, displayName, LAMP_TIERS, unreadDropsCount, clearUnreadDrops } = useCultivation();

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
    let isMounted = true;
    (async () => {
      try {
        let [n, chs] = await Promise.all([getNovel(activeNovelId), getChapters(activeNovelId)]);
        if (!n || !chs || chs.length === 0) {
          const { sampleNovel, sampleChapters } = await import('../lib/sampleData');
          const { saveNovel, saveChaptersBulk } = await import('../lib/db');
          await saveNovel(sampleNovel);
          await saveChaptersBulk(sampleChapters);
          n = sampleNovel;
          chs = sampleChapters;
        }
        if (isMounted) {
          setNovel(n);
          setChapters(chs || []);
        }
      } catch (e) {
        console.error('Reader load novel error:', e);
      }
    })();
    return () => { isMounted = false; };
  }, [activeNovelId]);

  // Load current chapter
  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      try {
        let ch = await getChapter(chapterId);
        if (!ch) {
          const { sampleChapters } = await import('../lib/sampleData');
          ch = sampleChapters.find(c => c.id === chapterId) || sampleChapters.find(c => c.novelId === activeNovelId) || sampleChapters[0];
        }
        if (isMounted) {
          setChapter(ch);
        }
      } catch (e) {
        console.error('Reader load chapter error:', e);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    })();
    return () => { isMounted = false; };
  }, [chapterId, activeNovelId]);

  // Khôi phục vị trí đọc chính xác (đoạn văn đang đọc dở hoặc %) khi vào lại chương
  useEffect(() => {
    if (!chapter || loading) return;

    // Nếu vào từ thanh tìm kiếm có từ khoá thì cuộn đến từ khoá đầu tiên
    if (searchKeyword) {
      const searchTimer = setTimeout(() => {
        const mark = document.querySelector(`.${styles.readerMark}`);
        if (mark) {
          mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
      return () => clearTimeout(searchTimer);
    }

    let restored = false;
    const tryRestore = () => {
      const savedRaw = localStorage.getItem(`scroll_pos_${activeNovelId}_${chapter.id}`);
      if (savedRaw) {
        try {
          const { percent, scrollY, paraIndex } = JSON.parse(savedRaw);

          // 1. Ưu tiên cuộn đến đúng đoạn văn (paragraph) đang đọc dở
          if (typeof paraIndex === 'number' && paraIndex > 0) {
            const targetPara = document.getElementById(`para-${paraIndex}`);
            if (targetPara) {
              const targetY = Math.max(0, targetPara.offsetTop - 70);
              window.scrollTo({ top: targetY, behavior: 'instant' });
              restored = true;
              return;
            }
          }

          // 2. Dự phòng theo % hoặc tọa độ pixel scrollY
          const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
          if (maxScroll > 60) {
            if (typeof percent === 'number' && percent > 0.005) {
              const targetY = percent * maxScroll;
              window.scrollTo({ top: targetY, behavior: 'instant' });
              restored = true;
              return;
            } else if (typeof scrollY === 'number' && scrollY > 20) {
              window.scrollTo({ top: Math.min(scrollY, maxScroll), behavior: 'instant' });
              restored = true;
              return;
            }
          }
        } catch (e) {
          console.warn('Lỗi khôi phục vị trí đọc:', e);
        }
      }

      if (!restored) {
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    };

    // Delay các nhịp để đảm bảo toàn bộ font chữ và layout đoạn văn đã được render đầy đủ
    const timer1 = setTimeout(tryRestore, 60);
    const timer2 = setTimeout(tryRestore, 180);
    const timer3 = setTimeout(tryRestore, 320);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [chapter?.id, loading, activeNovelId, searchKeyword]);

  // Chu kỳ ngộ đạo 60s lặp lại liên tục (cứ 60s tăng tu vi âm thầm & bắt đầu vòng mới)
  const [cycleSeconds, setCycleSeconds] = useState(0);

  // Reset timer on chapter change & save reading progress
  useEffect(() => {
    setCycleSeconds(0);
    if (chapter) {
      saveReadingProgress(activeNovelId, { chapterId: chapter.id, scrollTop: window.scrollY });
    }
  }, [chapter?.id, activeNovelId]);

  // Bộ đếm ngộ đạo thực tế (mỗi giây tăng 1s, đủ 60s tự động cộng tu vi và rơi cơ duyên)
  useEffect(() => {
    if (!chapter || loading) return;

    const interval = setInterval(() => {
      setCycleSeconds(prev => {
        if (prev + 1 >= 60) {
          try {
            const res = gainReadingExp(activeNovelId, chapter.id, 2000);
            if (res) {
              if (res.breakthrough) {
                setBreakthroughToast(res.breakthrough);
                setTimeout(() => setBreakthroughToast(null), 5000);
              }
              const dropItem = res.droppedLamp || res.droppedArtifact;
              if (dropItem) {
                const isLegendary = dropItem.tier === 'tien_pham' || dropItem.tier === 'than_pham';
                if (isLegendary) {
                  setDroppedLamp(dropItem);
                  setTimeout(() => setDroppedLamp(null), 3000); // 3 giây thông báo màn hình đối với tiên phẩm/thần phẩm
                }
              }
            }
          } catch (err) {
            console.error('Lỗi cộng tu vi ngộ đạo:', err);
          }
          return 0;
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [chapter?.id, loading, activeNovelId, gainReadingExp]);

  // Lưu lại vị trí cuộn (% đọc & đoạn văn đang đọc) real-time khi người đọc lướt trang
  useEffect(() => {
    if (!chapter || loading) return;

    const saveCurrentPosition = () => {
      const scrollY = window.scrollY;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;

      // Tìm đoạn văn đang hiển thị ở phần trên của màn hình
      let currentParaIndex = 0;
      const paraEls = document.querySelectorAll('[data-para-index]');
      if (paraEls.length > 0) {
        const targetOffset = scrollY + 85;
        for (let i = 0; i < paraEls.length; i++) {
          if (paraEls[i].offsetTop <= targetOffset) {
            currentParaIndex = i;
          } else {
            break;
          }
        }
      }

      const percent = maxScroll > 0 ? Math.max(0, Math.min(1, scrollY / maxScroll)) : 0;
      const posData = {
        percent,
        scrollY,
        paraIndex: currentParaIndex,
        time: Date.now()
      };

      localStorage.setItem(`scroll_pos_${activeNovelId}_${chapter.id}`, JSON.stringify(posData));
      saveReadingProgress(activeNovelId, {
        chapterId: chapter.id,
        scrollTop: scrollY,
        percent,
        paraIndex: currentParaIndex
      });
    };

    let throttleTimer = null;
    const handleScroll = () => {
      const currentY = window.scrollY;
      setBarVisible(currentY < lastScrollY.current || currentY < 80);
      lastScrollY.current = currentY;

      if (!throttleTimer) {
        throttleTimer = setTimeout(() => {
          saveCurrentPosition();
          throttleTimer = null;
        }, 180);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('beforeunload', saveCurrentPosition);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('beforeunload', saveCurrentPosition);
      if (throttleTimer) clearTimeout(throttleTimer);
      saveCurrentPosition();
    };
  }, [chapter?.id, loading, activeNovelId]);

  // Navigate to adjacent chapters
  const currentIndex = chapters.findIndex(c => c.id === chapterId);
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

  const goToChapter = useCallback((ch) => {
    if (ch) {
      const queryStr = searchKeyword ? `?q=${encodeURIComponent(searchKeyword)}` : '';
      navigate(`/novel/${activeNovelId}/read/${ch.id}${queryStr}`);
    }
  }, [navigate, activeNovelId, searchKeyword]);

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
            onClick={() => navigate(`/novel/${activeNovelId}`)}
            aria-label="Quay lại"
          >
            ←
          </button>
          <div className={styles.meditationBadgeWrap}>
            <span className={styles.meditationBadge} title="Mỗi chu kỳ 60s tĩnh tâm đọc sẽ hấp thu một luồng linh khí tu vi (lặp lại liên tục)">
              🧘 Ngộ đạo {cycleSeconds}/60s
            </span>
          </div>
          <div className={styles.topBarSpacer} />
          <div className={styles.topBtns}>
            <div className={styles.cultivationBtnWrap}>
              <button
                className={styles.topBtn}
                onClick={() => {
                  sessionStorage.setItem('from_reader', '1');
                  sessionStorage.setItem('last_reading_url', window.location.hash ? window.location.hash.slice(1) : (window.location.pathname + window.location.search));
                  clearUnreadDrops();
                  navigate('/cultivation');
                }}
                title="Xem Bảng Tu Vi"
                aria-label="Tu Vi"
                style={{ color: '#ffcc00' }}
              >
                ⚡
              </button>
              {unreadDropsCount > 0 && (
                <span
                  className={`${styles.unreadRedDot} ${unreadDropsCount === 1 ? styles.unreadRedDotDotOnly : ''}`}
                  title={`${unreadDropsCount} cơ duyên chưa đọc`}
                >
                  {unreadDropsCount > 1 ? (unreadDropsCount > 99 ? '99+' : unreadDropsCount) : ''}
                </span>
              )}
            </div>
            <button
              className={styles.topBtn}
              onClick={() => navigate(`/novel/${activeNovelId}/add-chapter`)}
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

      {/* Full-Screen Breakthrough Celebration Overlay */}
      {breakthroughToast && (
        <BreakthroughModal data={breakthroughToast} onClose={() => setBreakthroughToast(null)} />
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
                  sessionStorage.setItem('from_reader', '1');
                  sessionStorage.setItem('last_reading_url', window.location.hash ? window.location.hash.slice(1) : (window.location.pathname + window.location.search));
                  setDroppedLamp(null);
                  navigate('/cultivation');
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
              <p key={i} id={`para-${i}`} data-para-index={i} className={styles.paragraph}>
                {highlightText(p, searchKeyword, styles.readerMark)}
              </p>
            ))}
          </>
        )}

        {!loading && !chapter && (
          <div className={styles.notFound}>
            <p>Không tìm thấy nội dung chương này.</p>
            <button className="btn-ghost" onClick={() => navigate(`/novel/${activeNovelId}`)}>
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
        onSelectChapter={(ch) => navigate(`/novel/${activeNovelId}/read/${ch.id}`)}
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
