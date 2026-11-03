import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getVolume,
  getVolumes,
  getPage,
  getVolumePageMeta,
  getComicProgress,
  saveComicProgress,
} from '../lib/comics/comicDb.js';
import styles from './ComicReaderPage.module.css';

const VIRTUAL_WINDOW_SIZE = 5; // ±5 pages in memory

export default function ComicReaderPage() {
  const { seriesId, volumeId } = useParams();
  const navigate = useNavigate();

  const [volume, setVolume] = useState(null);
  const [allVolumes, setAllVolumes] = useState([]);
  const [pageMeta, setPageMeta] = useState([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [readingMode, setReadingMode] = useState(() => {
    return localStorage.getItem('tcl_comic_mode') || 'vertical'; // 'vertical' | 'page'
  });
  const [showToolbars, setShowToolbars] = useState(true);
  const [loading, setLoading] = useState(true);

  // Map of loaded blob URLs: { [pageIndex]: string }
  const [pageUrls, setPageUrls] = useState({});

  // Passive-open guard: do not write progress until user genuinely interacts
  const hasUserEngagedRef = useRef(false);
  const initialScrollRestoredRef = useRef(false);
  const containerRef = useRef(null);
  const pageRefs = useRef({});
  const hideToolbarTimeoutRef = useRef(null);

  // Auto-hide toolbar after 3.5s of inactivity
  const scheduleHideToolbar = useCallback(() => {
    if (hideToolbarTimeoutRef.current) {
      clearTimeout(hideToolbarTimeoutRef.current);
    }
    hideToolbarTimeoutRef.current = setTimeout(() => {
      setShowToolbars(false);
    }, 4000);
  }, []);

  const toggleToolbars = () => {
    setShowToolbars((prev) => {
      const next = !prev;
      if (next) scheduleHideToolbar();
      return next;
    });
  };

  // 1. Initial Load: Volume, Volumes list (for prev/next), PageMeta, and Progress
  useEffect(() => {
    let isCancelled = false;

    async function loadVolumeData() {
      setLoading(true);
      try {
        const [vol, vols, meta] = await Promise.all([
          getVolume(volumeId),
          getVolumes(seriesId),
          getVolumePageMeta(volumeId),
        ]);

        if (isCancelled) return;
        if (!vol) {
          navigate(`/comics/${seriesId}`, { replace: true });
          return;
        }

        setVolume(vol);
        setAllVolumes(vols);

        const total = vol.pageCount || meta.length || 1;
        // Construct fallback metadata if empty
        const fullMeta = Array.from({ length: total }, (_, i) => {
          return meta[i] || { index: i, w: vol.widthHint || 1200, h: Math.round((vol.widthHint || 1200) * 1.4) };
        });
        setPageMeta(fullMeta);

        // Check saved progress
        const savedProgress = getComicProgress(volumeId);
        const startIdx = savedProgress && typeof savedProgress.pageIndex === 'number'
          ? Math.min(savedProgress.pageIndex, total - 1)
          : 0;

        setCurrentPageIndex(startIdx);
        setLoading(false);
        scheduleHideToolbar();
      } catch (err) {
        console.error('Failed to load comic volume:', err);
        setLoading(false);
      }
    }

    loadVolumeData();

    return () => {
      isCancelled = true;
    };
  }, [seriesId, volumeId, navigate, scheduleHideToolbar]);

  // 2. Virtual Window Loader: Load pages within ±5 range, revoke outside
  useEffect(() => {
    if (loading || pageMeta.length === 0) return;

    const minIdx = Math.max(0, currentPageIndex - VIRTUAL_WINDOW_SIZE);
    const maxIdx = Math.min(pageMeta.length - 1, currentPageIndex + VIRTUAL_WINDOW_SIZE);

    let isSubscribed = true;

    // Identify which pages need to be loaded
    const neededIndices = [];
    for (let i = minIdx; i <= maxIdx; i++) {
      if (!pageUrls[i]) {
        neededIndices.push(i);
      }
    }

    // Load missing pages
    if (neededIndices.length > 0) {
      Promise.all(
        neededIndices.map(async (idx) => {
          try {
            const pageData = await getPage(volumeId, idx);
            if (pageData?.blob) {
              const url = URL.createObjectURL(pageData.blob);
              return { idx, url };
            }
          } catch (e) {}
          return null;
        })
      ).then((loaded) => {
        if (!isSubscribed) return;
        setPageUrls((prev) => {
          const next = { ...prev };
          for (const item of loaded) {
            if (item) next[item.idx] = item.url;
          }
          // Revoke distant URLs
          for (const key of Object.keys(next)) {
            const num = parseInt(key, 10);
            if (num < minIdx - 2 || num > maxIdx + 2) {
              URL.revokeObjectURL(next[num]);
              delete next[num];
            }
          }
          return next;
        });
      });
    }

    return () => {
      isSubscribed = false;
    };
  }, [currentPageIndex, loading, pageMeta.length, volumeId]);

  // Clean up all object URLs on unmount
  useEffect(() => {
    return () => {
      for (const url of Object.values(pageUrls)) {
        if (url) URL.revokeObjectURL(url);
      }
    };
  }, []);

  // 3. Scroll restoration on initial load (vertical mode)
  useEffect(() => {
    if (loading || readingMode !== 'vertical' || initialScrollRestoredRef.current) return;
    if (currentPageIndex > 0) {
      const el = pageRefs.current[currentPageIndex];
      if (el) {
        initialScrollRestoredRef.current = true;
        el.scrollIntoView({ behavior: 'auto' });
      }
    } else {
      initialScrollRestoredRef.current = true;
    }
  }, [loading, readingMode, currentPageIndex]);

  // 4. Save progress only after genuine user interaction
  const recordProgress = useCallback((newPageIndex) => {
    if (!hasUserEngagedRef.current) return;
    saveComicProgress(volumeId, {
      pageIndex: newPageIndex,
      scrollPercent: pageMeta.length > 0 ? Math.round(((newPageIndex + 1) / pageMeta.length) * 100) : 0,
    });
  }, [volumeId, pageMeta.length]);

  // 5. Vertical scroll observer to update active page
  useEffect(() => {
    if (readingMode !== 'vertical' || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find visible page closest to viewport top
        let highestVisible = null;
        let maxRatio = 0;
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            const idx = parseInt(entry.target.getAttribute('data-page-index'), 10);
            highestVisible = idx;
          }
        });

        if (highestVisible !== null && !isNaN(highestVisible)) {
          setCurrentPageIndex((prev) => {
            if (prev !== highestVisible) {
              recordProgress(highestVisible);
              return highestVisible;
            }
            return prev;
          });
        }
      },
      {
        threshold: [0.1, 0.4, 0.7],
        rootMargin: '-10% 0px -40% 0px',
      }
    );

    const observedElements = Object.values(pageRefs.current).filter(Boolean);
    observedElements.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
    };
  }, [readingMode, loading, recordProgress]);

  // Mark user interaction on genuine user scroll or touch
  const handleUserScroll = () => {
    if (initialScrollRestoredRef.current) {
      hasUserEngagedRef.current = true;
    }
  };

  // 6. Navigation: Next / Prev page
  const goToPage = useCallback((newIndex) => {
    hasUserEngagedRef.current = true;
    const clamped = Math.max(0, Math.min(pageMeta.length - 1, newIndex));
    setCurrentPageIndex(clamped);
    recordProgress(clamped);

    if (readingMode === 'vertical') {
      const el = pageRefs.current[clamped];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [pageMeta.length, readingMode, recordProgress]);

  const handleNextPage = useCallback(() => {
    if (currentPageIndex < pageMeta.length - 1) {
      goToPage(currentPageIndex + 1);
    }
  }, [currentPageIndex, pageMeta.length, goToPage]);

  const handlePrevPage = useCallback(() => {
    if (currentPageIndex > 0) {
      goToPage(currentPageIndex - 1);
    }
  }, [currentPageIndex, goToPage]);

  // 7. Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || (readingMode === 'page' && e.key === ' ')) {
        e.preventDefault();
        handleNextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        handlePrevPage();
      } else if (e.key === 'Escape') {
        setShowToolbars((p) => !p);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNextPage, handlePrevPage, readingMode]);

  // Mode switch
  const handleModeChange = (mode) => {
    setReadingMode(mode);
    localStorage.setItem('tcl_comic_mode', mode);
    scheduleHideToolbar();
  };

  // Find Prev / Next Volume
  const sortedVolumes = [...allVolumes].sort((a, b) => (a.order || 0) - (b.order || 0));
  const currentVolIdx = sortedVolumes.findIndex((v) => v.id === volumeId);
  const prevVolume = currentVolIdx > 0 ? sortedVolumes[currentVolIdx - 1] : null;
  const nextVolume = currentVolIdx >= 0 && currentVolIdx < sortedVolumes.length - 1 ? sortedVolumes[currentVolIdx + 1] : null;

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
        <p>Đang chuẩn bị trang truyện...</p>
      </div>
    );
  }

  return (
    <div
      className={styles.readerRoot}
      onWheel={handleUserScroll}
      onTouchMove={handleUserScroll}
      ref={containerRef}
    >
      {/* ===== TOP TOOLBAR ===== */}
      <div className={`${styles.topToolbar} ${showToolbars ? styles.toolbarVisible : styles.toolbarHidden}`}>
        <div className={styles.topToolbarInner}>
          <button
            className={styles.exitBtn}
            onClick={() => navigate(`/comics/${seriesId}`)}
            title="Thoát trình đọc"
          >
            ← Thoát
          </button>

          <div className={styles.topTitleWrap}>
            <span className={styles.topVolumeTitle}>{volume?.title}</span>
            <span className={styles.topPageCount}>
              Trang {currentPageIndex + 1} / {pageMeta.length}
            </span>
          </div>

          <div className={styles.modeSwitcher}>
            <button
              className={`${styles.modeBtn} ${readingMode === 'vertical' ? styles.modeBtnActive : ''}`}
              onClick={() => handleModeChange('vertical')}
              title="Cuộn dọc liên tục"
            >
              📜 Cuộn Dọc
            </button>
            <button
              className={`${styles.modeBtn} ${readingMode === 'page' ? styles.modeBtnActive : ''}`}
              onClick={() => handleModeChange('page')}
              title="Xem từng trang"
            >
              📄 Từng Trang
            </button>
          </div>
        </div>
      </div>

      {/* ===== READER VIEWPORT ===== */}
      {readingMode === 'vertical' ? (
        /* Vertical Scroll Mode */
        <div className={styles.verticalScrollContainer} onClick={toggleToolbars} onScroll={handleUserScroll}>
          <div className={styles.verticalStream}>
            {pageMeta.map((meta, idx) => {
              const url = pageUrls[idx];
              const isNear = Math.abs(idx - currentPageIndex) <= VIRTUAL_WINDOW_SIZE;

              return (
                <div
                  key={idx}
                  ref={(el) => (pageRefs.current[idx] = el)}
                  data-page-index={idx}
                  className={styles.pageContainer}
                  style={{
                    aspectRatio: `${meta.w} / ${meta.h}`,
                  }}
                >
                  {isNear && url ? (
                    <img
                      src={url}
                      alt={`Trang ${idx + 1}`}
                      className={styles.pageImage}
                      loading="lazy"
                    />
                  ) : (
                    <div className={styles.pagePlaceholder}>
                      <span className={styles.placeholderText}>Trang {idx + 1}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Page-by-Page Mode */
        <div className={styles.singlePageContainer}>
          {/* Left half click -> Prev */}
          <div
            className={styles.pageClickZoneLeft}
            onClick={handlePrevPage}
            title="Trang trước"
          />

          {/* Center click -> Toggle toolbars */}
          <div
            className={styles.pageClickZoneCenter}
            onClick={toggleToolbars}
          />

          {/* Right half click -> Next */}
          <div
            className={styles.pageClickZoneRight}
            onClick={handleNextPage}
            title="Trang sau"
          />

          <div
            className={styles.singlePageWrap}
            style={{
              aspectRatio: pageMeta[currentPageIndex]
                ? `${pageMeta[currentPageIndex].w} / ${pageMeta[currentPageIndex].h}`
                : '3 / 4',
            }}
          >
            {pageUrls[currentPageIndex] ? (
              <img
                src={pageUrls[currentPageIndex]}
                alt={`Trang ${currentPageIndex + 1}`}
                className={styles.singlePageImage}
              />
            ) : (
              <div className={styles.pagePlaceholder}>
                <div className={styles.spinner} />
                <span className={styles.placeholderText}>Đang tải trang {currentPageIndex + 1}...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== BOTTOM TOOLBAR ===== */}
      <div className={`${styles.bottomToolbar} ${showToolbars ? styles.toolbarVisible : styles.toolbarHidden}`}>
        <div className={styles.bottomToolbarInner}>
          {/* Jump Slider */}
          <div className={styles.sliderWrap}>
            <span className={styles.sliderPageLabel}>1</span>
            <input
              type="range"
              min="0"
              max={Math.max(0, pageMeta.length - 1)}
              value={currentPageIndex}
              onChange={(e) => goToPage(parseInt(e.target.value, 10))}
              className={styles.sliderInput}
              aria-label="Chuyển nhanh trang"
            />
            <span className={styles.sliderPageLabel}>{pageMeta.length}</span>
          </div>

          {/* Volume Switcher Controls */}
          <div className={styles.volumeNavRow}>
            <button
              className={styles.volNavBtn}
              disabled={!prevVolume}
              onClick={() => {
                if (prevVolume) navigate(`/comics/${seriesId}/read/${prevVolume.id}`);
              }}
            >
              ⏮️ Tập trước: {prevVolume ? prevVolume.title : 'Hết'}
            </button>

            <span className={styles.indicatorPill}>
              {currentPageIndex + 1} / {pageMeta.length}
            </span>

            <button
              className={styles.volNavBtn}
              disabled={!nextVolume}
              onClick={() => {
                if (nextVolume) navigate(`/comics/${seriesId}/read/${nextVolume.id}`);
              }}
            >
              Tập sau: {nextVolume ? nextVolume.title : 'Hết'} ⏭️
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
