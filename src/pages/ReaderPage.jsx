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
import { startBackgroundPrefetch } from '../lib/backgroundPrefetch';
import { findDaoAnhDefinition } from '../lib/daoAnhData';
import styles from './ReaderPage.module.css';

export default function ReaderPage() {
  const { id, novelId, chapterId } = useParams();
  const activeNovelId = novelId || id;
  const [searchParams, setSearchParams] = useSearchParams();
  const searchKeyword = searchParams.get('q') || '';
  const navigate = useNavigate();
  const { settings, updateSettings } = useReadingSettings();
  const { 
    gainReadingExp, 
    displayName, 
    LAMP_TIERS, 
    unreadDropsCount, 
    clearUnreadDrops,
    cultivation,
    chooseSwitchDaoAnhAfter80,
    chooseContinueDaoAnhTo100,
    dismissPromptAllDaoAnhFull
  } = useCultivation();

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

  // Background-fetch all cultivation graphics into persistent cache while reading
  useEffect(() => {
    startBackgroundPrefetch();
  }, []);

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

  const lastRecordedScrollRef = useRef({ scrollY: 0, percent: 0, paraIndex: 0 });
  const isRestoringRef = useRef(true);

  // Lưu vị trí đọc chính xác (đoạn văn, % và pixel scrollY)
  const saveCurrentPositionImmediate = useCallback(() => {
    if (!chapter) return;
    const currentScrollY = window.scrollY;
    // Nếu currentScrollY === 0 mà trước đó đã cuộn được (ví dụ unmount event), giữ vị trí trước đó
    const effectiveScrollY = currentScrollY > 0 ? currentScrollY : lastRecordedScrollRef.current.scrollY;

    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    let currentParaIndex = lastRecordedScrollRef.current.paraIndex;
    const paraEls = document.querySelectorAll('[data-para-index]');
    if (paraEls.length > 0) {
      const targetOffset = effectiveScrollY + 85;
      for (let i = 0; i < paraEls.length; i++) {
        if (paraEls[i].offsetTop <= targetOffset) {
          currentParaIndex = i;
        } else {
          break;
        }
      }
    }

    const percent = maxScroll > 0 ? Math.max(0, Math.min(1, effectiveScrollY / maxScroll)) : (lastRecordedScrollRef.current.percent || 0);
    const posData = {
      percent,
      scrollY: effectiveScrollY,
      paraIndex: currentParaIndex,
      time: Date.now()
    };

    lastRecordedScrollRef.current = posData;
    localStorage.setItem(`scroll_pos_${activeNovelId}_${chapter.id}`, JSON.stringify(posData));
    sessionStorage.setItem(`scroll_pos_${activeNovelId}_${chapter.id}`, JSON.stringify(posData));
    saveReadingProgress(activeNovelId, {
      chapterId: chapter.id,
      scrollTop: effectiveScrollY,
      percent,
      paraIndex: currentParaIndex
    });
  }, [chapter, activeNovelId]);

  const handleGoToCultivationFromReader = useCallback(() => {
    if (dismissPromptAllDaoAnhFull) dismissPromptAllDaoAnhFull();
    saveCurrentPositionImmediate();
    sessionStorage.setItem('from_reader', '1');
    sessionStorage.setItem('last_reading_url', window.location.hash ? window.location.hash.slice(1) : (window.location.pathname + window.location.search));
    navigate('/cultivation');
  }, [dismissPromptAllDaoAnhFull, saveCurrentPositionImmediate, navigate]);

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

    isRestoringRef.current = true;
    let restoreSucceeded = false;

    const tryRestore = () => {
      if (restoreSucceeded) return;

      const savedRaw = sessionStorage.getItem(`scroll_pos_${activeNovelId}_${chapter.id}`) ||
                       localStorage.getItem(`scroll_pos_${activeNovelId}_${chapter.id}`);
      if (savedRaw) {
        try {
          const { percent, scrollY, paraIndex } = JSON.parse(savedRaw);

          // 1. Ưu tiên cuộn đến đúng đoạn văn (paragraph) đang đọc dở
          if (typeof paraIndex === 'number' && paraIndex > 0) {
            const targetPara = document.getElementById(`para-${paraIndex}`);
            if (targetPara) {
              const targetY = Math.max(0, targetPara.offsetTop - 70);
              window.scrollTo({ top: targetY, behavior: 'instant' });
              lastRecordedScrollRef.current = { percent: percent || 0, scrollY: targetY, paraIndex };
              restoreSucceeded = true;
              return;
            }
          }

          // 2. Dự phòng theo % hoặc tọa độ pixel scrollY
          const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
          if (maxScroll > 60) {
            if (typeof percent === 'number' && percent > 0.005) {
              const targetY = percent * maxScroll;
              window.scrollTo({ top: targetY, behavior: 'instant' });
              lastRecordedScrollRef.current = { percent, scrollY: targetY, paraIndex: paraIndex || 0 };
              restoreSucceeded = true;
              return;
            } else if (typeof scrollY === 'number' && scrollY > 20) {
              const targetY = Math.min(scrollY, maxScroll);
              window.scrollTo({ top: targetY, behavior: 'instant' });
              lastRecordedScrollRef.current = { percent: percent || 0, scrollY: targetY, paraIndex: paraIndex || 0 };
              restoreSucceeded = true;
              return;
            }
          }
        } catch (e) {
          console.warn('Lỗi khôi phục vị trí đọc:', e);
        }
      }
    };

    // Đa nhịp khôi phục theo chu kỳ render DOM và font chữ
    tryRestore();
    const timer1 = setTimeout(tryRestore, 50);
    const timer2 = setTimeout(tryRestore, 150);
    const timer3 = setTimeout(tryRestore, 300);
    const timer4 = setTimeout(tryRestore, 500);

    // Mở lại cờ cho phép lưu cuộn sau khi hoàn tất khôi phục
    const timerDone = setTimeout(() => {
      isRestoringRef.current = false;
    }, 650);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(timerDone);
    };
  }, [chapter?.id, loading, activeNovelId, searchKeyword]);

  // Chu kỳ ngộ đạo 60s lặp lại liên tục (cứ 60s tăng tu vi âm thầm & bắt đầu vòng mới)
  const [cycleSeconds, setCycleSeconds] = useState(0);

  // Reset timer on chapter change & save reading progress (KHÔNG đè scrollTop = 0 lên vị trí đang đọc)
  useEffect(() => {
    setCycleSeconds(0);
    if (chapter) {
      const existing = getReadingProgress(activeNovelId);
      if (existing?.chapterId !== chapter.id) {
        saveReadingProgress(activeNovelId, {
          chapterId: chapter.id,
          scrollTop: 0,
          percent: 0,
          paraIndex: 0
        });
      }
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

    let throttleTimer = null;
    const handleScroll = () => {
      const currentY = window.scrollY;
      setBarVisible(currentY < lastScrollY.current || currentY < 80);
      lastScrollY.current = currentY;

      // Không ghi đè nếu trang đang trong giai đoạn khôi phục vị trí lúc đầu
      if (isRestoringRef.current) return;

      if (currentY > 0) {
        lastRecordedScrollRef.current.scrollY = currentY;
      }

      if (!throttleTimer) {
        throttleTimer = setTimeout(() => {
          saveCurrentPositionImmediate();
          throttleTimer = null;
        }, 180);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('beforeunload', saveCurrentPositionImmediate);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('beforeunload', saveCurrentPositionImmediate);
      if (throttleTimer) clearTimeout(throttleTimer);
      if (!isRestoringRef.current && window.scrollY > 0) {
        saveCurrentPositionImmediate();
      }
    };
  }, [chapter?.id, loading, activeNovelId, saveCurrentPositionImmediate]);

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
                  saveCurrentPositionImmediate();
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
                  saveCurrentPositionImmediate();
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

      {/* MODAL THÔNG BÁO TIÊN KIẾP: ĐẠO ANH ĐẠT 80% LINH LỰC */}
      {cultivation?.prompt80DaoAnh && (() => {
        const promptTargetDa = (cultivation?.daoAnhs || []).find(d => d.id === cultivation.prompt80DaoAnh?.daoAnhId);
        const resolvedDaoAnhName = findDaoAnhDefinition(promptTargetDa, cultivation)?.name || promptTargetDa?.name || cultivation.prompt80DaoAnh.daoAnhName;
        return (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(2, 6, 23, 0.85)',
            backdropFilter: 'blur(10px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.95) 100%)',
              border: '1.5px solid #fde047',
              boxShadow: '0 0 40px rgba(253, 224, 71, 0.35), 0 20px 40px rgba(0, 0, 0, 0.8)',
              borderRadius: 20,
              maxWidth: 480,
              width: '100%',
              padding: '28px 24px',
              textAlign: 'center',
              color: '#f8fafc',
              animation: 'fadeIn 0.25s ease-out'
            }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>⚡</div>
              <h3 style={{
                fontSize: 18,
                fontWeight: 900,
                color: '#fde047',
                margin: '0 0 10px 0',
                letterSpacing: '0.5px'
              }}>
                ĐẠO ANH ĐÃ ĐẠT 80% LINH LỰC!
              </h3>
              <p style={{
                fontSize: 13.5,
                lineHeight: 1.6,
                color: '#cbd5e1',
                margin: '0 0 14px 0'
              }}>
                <strong style={{ color: '#38bdf8' }}>[{resolvedDaoAnhName}]</strong> đã tích lũy đủ <strong style={{ color: '#fde047' }}>80% Linh Lực</strong> ({cultivation.prompt80DaoAnh.currentExp?.toLocaleString()} / {cultivation.prompt80DaoAnh.maxExp?.toLocaleString()} Tu Vi), sẵn sàng nghênh tiếp Thiên Kiếp!
              </p>
              <p style={{
                fontSize: 12.5,
                color: '#94a3b8',
                margin: '0 0 24px 0',
                fontStyle: 'italic'
              }}>
                Đạo hữu có muốn chuyển quyền nạp sang Đạo Anh khác không, hay tiếp tục nạp đến 100% để đảm bảo độ kiếp viên mãn?
              </p>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  onClick={() => chooseSwitchDaoAnhAfter80 && chooseSwitchDaoAnhAfter80(cultivation.prompt80DaoAnh.daoAnhId)}
                  style={{
                    flex: 1,
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
                    border: '1px solid #7dd3fc',
                    color: '#ffffff',
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 0 16px rgba(56, 189, 248, 0.35)'
                  }}
                >
                  🔄 Chuyển Đạo Anh Khác
                </button>

                <button
                  onClick={() => chooseContinueDaoAnhTo100 && chooseContinueDaoAnhTo100(cultivation.prompt80DaoAnh.daoAnhId)}
                  style={{
                    flex: 1,
                    padding: '12px 14px',
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
                    border: '1px solid #fde047',
                    color: '#0f172a',
                    fontSize: 13,
                    fontWeight: 900,
                    cursor: 'pointer',
                    boxShadow: '0 0 16px rgba(253, 224, 71, 0.35)'
                  }}
                >
                  ⚡ Tiếp Tục Nạp Đến 100%
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL THÔNG BÁO TIÊN KIẾP: TOÀN BỘ ĐẠO ANH ĐÃ VIÊN MÃN 100% */}
      {cultivation?.promptAllDaoAnhFull && !cultivation?.promptAllDaoAnhFullDismissed && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(2, 6, 23, 0.88)',
          backdropFilter: 'blur(12px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.98) 0%, rgba(15, 23, 42, 0.98) 100%)',
            border: '2px solid #f0abfc',
            boxShadow: '0 0 50px rgba(240, 171, 252, 0.35), 0 25px 50px rgba(0, 0, 0, 0.85)',
            borderRadius: 20,
            maxWidth: 500,
            width: '100%',
            padding: '28px 24px',
            textAlign: 'center',
            color: '#f8fafc',
            animation: 'fadeIn 0.25s ease-out'
          }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>⛈️</div>
            <h3 style={{
              fontSize: 18,
              fontWeight: 900,
              background: 'linear-gradient(135deg, #f0abfc 0%, #fde047 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: '0 0 10px 0',
              letterSpacing: '0.5px'
            }}>
              TOÀN BỘ ĐẠO ANH ĐÃ VIÊN MÃN 100%!
            </h3>
            <p style={{
              fontSize: 13.5,
              lineHeight: 1.6,
              color: '#cbd5e1',
              margin: '0 0 12px 0'
            }}>
              Toàn bộ các Đạo Anh đều đã tích lũy đạt <strong style={{ color: '#fde047' }}>100% Linh Lực viên mãn</strong>, sẵn sàng cùng nhau tiến hành Vạn Kiếp Tề Thăng!
            </p>
            <p style={{
              fontSize: 12.5,
              color: '#94a3b8',
              margin: '0 0 24px 0',
              fontStyle: 'italic',
              lineHeight: 1.5
            }}>
              Nếu đạo hữu chưa muốn độ kiếp lúc này, Tu Vi nhận được từ việc đọc truyện và Tụ Linh Trận sẽ được chuyển dồn tích lũy vào <strong style={{ color: '#f59e0b' }}>Uẩn Tích Bình Cảnh</strong>.
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={handleGoToCultivationFromReader}
                style={{
                  flex: 1.2,
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
                  border: '1px solid #f0abfc',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 0 18px rgba(240, 171, 252, 0.4)'
                }}
              >
                ⚡ Đến Độ Kiếp Đài
              </button>

              <button
                onClick={() => dismissPromptAllDaoAnhFull && dismissPromptAllDaoAnhFull()}
                style={{
                  flex: 0.8,
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#cbd5e1',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ❌ Hủy
              </button>
            </div>
          </div>
        </div>
      )}

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
