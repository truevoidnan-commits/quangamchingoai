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
import {
  recordVolumeOpened,
  autoEvictIfStorageFull,
  pushComicProgressCloud,
  pullComicProgressCloud,
} from '../lib/comics/comicCloud.js';
import {
  IconArrowLeft,
  IconChevronLeft,
  IconChevronRight,
  IconScroll,
  IconPages,
  IconX,
} from '../components/comics/ComicIcons.jsx';
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
    try {
      return localStorage.getItem('tcl_comic_mode') || 'vertical';
    } catch {
      return 'vertical';
    }
  });
  const [showToolbars, setShowToolbars] = useState(true);
  const [loading, setLoading] = useState(true);

  // Map of loaded blob URLs: { [pageIndex]: string }
  const [pageUrls, setPageUrls] = useState({});

  // Jump popover state (C3)
  const [isJumpOpen, setIsJumpOpen] = useState(false);
  const [jumpValue, setJumpValue] = useState('');
  const [jumpError, setJumpError] = useState('');

  // Passive-open guard: do not write progress until user genuinely interacts (C4)
  const hasUserEngagedRef = useRef(false);
  const initialScrollRestoredRef = useRef(false);
  const containerRef = useRef(null);
  const pageRefs = useRef({});
  const hideToolbarTimeoutRef = useRef(null);

  // Double-tap detection refs (C1)
  const lastTouchTimeRef = useRef(0);
  const lastTouchPosRef = useRef({ x: 0, y: 0 });
  const singleTapTimerRef = useRef(null);

  // Auto-hide toolbar after 4s of inactivity
  const scheduleHideToolbar = useCallback(() => {
    if (hideToolbarTimeoutRef.current) {
      clearTimeout(hideToolbarTimeoutRef.current);
    }
    hideToolbarTimeoutRef.current = setTimeout(() => {
      setShowToolbars(false);
    }, 4500);
  }, []);

  const toggleToolbars = useCallback(() => {
    setShowToolbars((prev) => {
      const next = !prev;
      if (next) scheduleHideToolbar();
      return next;
    });
  }, [scheduleHideToolbar]);

  // 1. Initial Load: Volume, Volumes list, PageMeta, and Progress
  useEffect(() => {
    let isCancelled = false;

    async function loadVolumeData() {
      setLoading(true);
      try {
        recordVolumeOpened(volumeId);
        autoEvictIfStorageFull({ activeVolumeId: volumeId }).catch(() => {});

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
        const fullMeta = Array.from({ length: total }, (_, i) => {
          return meta[i] || { index: i, w: vol.widthHint || 1200, h: Math.round((vol.widthHint || 1200) * 1.4) };
        });
        setPageMeta(fullMeta);

        let savedProgress = getComicProgress(volumeId);

        try {
          const cloudProgress = await pullComicProgressCloud(volumeId);
          if (cloudProgress) {
            savedProgress = cloudProgress;
          }
        } catch {}

        const startIdx =
          savedProgress && typeof savedProgress.pageIndex === 'number'
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

    const neededIndices = [];
    for (let i = minIdx; i <= maxIdx; i++) {
      if (!pageUrls[i]) {
        neededIndices.push(i);
      }
    }

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

  // 4. Save progress only after genuine user interaction (Passive-open guard)
  const recordProgress = useCallback(
    (newPageIndex) => {
      if (!hasUserEngagedRef.current) return;
      const scrollPercent =
        pageMeta.length > 0 ? Math.round(((newPageIndex + 1) / pageMeta.length) * 100) : 0;
      saveComicProgress(volumeId, {
        pageIndex: newPageIndex,
        scrollPercent,
      });
      pushComicProgressCloud(volumeId, {
        pageIndex: newPageIndex,
        scrollPercent,
      });
    },
    [volumeId, pageMeta.length]
  );

  // 5. Vertical scroll observer to update active page
  useEffect(() => {
    if (readingMode !== 'vertical' || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
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

  const handleUserScroll = () => {
    if (initialScrollRestoredRef.current) {
      hasUserEngagedRef.current = true;
    }
  };

  // 6. Navigation: Next / Prev page
  const goToPage = useCallback(
    (newIndex) => {
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
    },
    [pageMeta.length, readingMode, recordProgress]
  );

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

  // 7. Touch Double-Tap Handler & Accidental Page-Turn Protection (C1)
  const handleTouchEnd = (e) => {
    if (e.changedTouches.length === 0) return;
    const touch = e.changedTouches[0];
    const now = Date.now();
    const dt = now - lastTouchTimeRef.current;
    const dist = Math.hypot(
      touch.clientX - lastTouchPosRef.current.x,
      touch.clientY - lastTouchPosRef.current.y
    );

    if (dt < 280 && dist < 12) {
      // DOUBLE TAP PHÁT HIỆN!
      // 1. Hủy bỏ hẹn giờ lật trang đơn để tránh lật nhầm (C1)
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      // 2. Chuyển đổi hiện/ẩn thanh điều khiển
      toggleToolbars();
      lastTouchTimeRef.current = 0;
    } else {
      // Cú chạm đầu tiên: lưu tọa độ và thời gian
      lastTouchTimeRef.current = now;
      lastTouchPosRef.current = { x: touch.clientX, y: touch.clientY };

      // Ở chế độ "Từng Trang", nếu chạm vào vùng lật trang bên cạnh thì hoãn thực thi ~285ms
      if (readingMode === 'page') {
        const width = window.innerWidth;
        const ratio = touch.clientX / width;
        if (ratio < 0.35) {
          singleTapTimerRef.current = setTimeout(() => {
            singleTapTimerRef.current = null;
            handlePrevPage();
          }, 285);
        } else if (ratio > 0.65) {
          singleTapTimerRef.current = setTimeout(() => {
            singleTapTimerRef.current = null;
            handleNextPage();
          }, 285);
        }
      }
    }
  };

  // Desktop double-click toggle (C1)
  const handleDoubleClick = () => {
    toggleToolbars();
  };

  // 8. Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isJumpOpen) return; // Không can thiệp phím khi đang mở popover nhập số trang
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
  }, [handleNextPage, handlePrevPage, readingMode, isJumpOpen]);

  // Mode switch: toggle between 'vertical' and 'page'
  const toggleReadingMode = () => {
    const nextMode = readingMode === 'vertical' ? 'page' : 'vertical';
    setReadingMode(nextMode);
    try {
      localStorage.setItem('tcl_comic_mode', nextMode);
    } catch {}
    scheduleHideToolbar();
  };

  // Jump to page confirm (C3)
  const handleConfirmJump = () => {
    const val = parseInt(jumpValue, 10);
    if (isNaN(val) || val < 1 || val > pageMeta.length) {
      setJumpError(`Trang hợp lệ từ 1 đến ${pageMeta.length}`);
      return;
    }
    goToPage(val - 1);
    setIsJumpOpen(false);
    setJumpError('');
  };

  // Find Prev / Next Volume
  const sortedVolumes = [...allVolumes].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  const currentVolIdx = sortedVolumes.findIndex((v) => v.id === volumeId);
  const prevVolume = currentVolIdx > 0 ? sortedVolumes[currentVolIdx - 1] : null;
  const nextVolume =
    currentVolIdx >= 0 && currentVolIdx < sortedVolumes.length - 1
      ? sortedVolumes[currentVolIdx + 1]
      : null;

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
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
      ref={containerRef}
    >
      {/* ===== TOP TOOLBAR (C2) ===== */}
      <div
        className={`${styles.topToolbar} ${showToolbars ? styles.toolbarVisible : styles.toolbarHidden}`}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div className={styles.topToolbarInner}>
          {/* Nút quay lại chỉ có biểu tượng SVG mũi tên, không có chữ Thoát (C2) */}
          <button
            type="button"
            className={styles.backBtn}
            onClick={() => navigate(`/comics/${seriesId}`)}
            title="Quay lại danh sách tập"
            aria-label="Quay lại danh sách tập"
          >
            <IconArrowLeft size={20} />
          </button>

          {/* Tên truyện / tập nằm giữa, nổi bật nhất, ellipsis một dòng, bỏ dòng Trang x/y (C2) */}
          <div className={styles.topCenterTitle} title={volume?.title}>
            <span className={styles.topTitleText}>{volume?.title}</span>
          </div>

          {/* Một nút chuyển chế độ hiển thị icon của chế độ sẽ chuyển sang (C2) */}
          <button
            type="button"
            className={styles.modeToggleBtn}
            onClick={toggleReadingMode}
            title={
              readingMode === 'vertical'
                ? 'Chuyển sang chế độ Từng Trang'
                : 'Chuyển sang chế độ Cuộn Dọc'
            }
            aria-label={
              readingMode === 'vertical'
                ? 'Chuyển sang chế độ Từng Trang'
                : 'Chuyển sang chế độ Cuộn Dọc'
            }
          >
            {readingMode === 'vertical' ? (
              <IconPages size={20} />
            ) : (
              <IconScroll size={20} />
            )}
          </button>
        </div>
      </div>

      {/* ===== READER VIEWPORT ===== */}
      {readingMode === 'vertical' ? (
        /* Vertical Scroll Mode */
        <div
          className={styles.verticalScrollContainer}
          onScroll={handleUserScroll}
        >
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
        /* Page-by-Page Mode (C1) */
        <div className={styles.singlePageContainer}>
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
                <span className={styles.placeholderText}>
                  Đang tải trang {currentPageIndex + 1}...
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== BOTTOM TOOLBAR (C3) ===== */}
      <div
        className={`${styles.bottomToolbar} ${showToolbars ? styles.toolbarVisible : styles.toolbarHidden}`}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <div className={styles.bottomToolbarInner}>
          {/* Nút Tập Trước: icon mũi tên SVG (C3) */}
          <button
            type="button"
            className={styles.volChevronBtn}
            disabled={!prevVolume}
            onClick={() => {
              if (prevVolume) navigate(`/comics/${seriesId}/read/${prevVolume.id}`);
            }}
            title={prevVolume ? `Tập trước: Tập ${prevVolume.order}` : 'Không có tập trước'}
            aria-label="Tập trước"
          >
            <IconChevronLeft size={22} />
            <span className={styles.volMiniLabel}>
              {prevVolume ? `Tập ${prevVolume.order}` : ''}
            </span>
          </button>

          {/* Nút số trang "X / Y" mở popover nhảy trang (C3) */}
          <button
            type="button"
            className={styles.pageJumpBtn}
            onClick={() => {
              setJumpValue(String(currentPageIndex + 1));
              setJumpError('');
              setIsJumpOpen(true);
            }}
            title="Nhấn để nhảy tới trang"
            aria-label="Nhấn để nhảy tới trang"
          >
            <span>{currentPageIndex + 1} / {pageMeta.length}</span>
          </button>

          {/* Nút Tập Tiếp: icon mũi tên SVG (C3) */}
          <button
            type="button"
            className={styles.volChevronBtn}
            disabled={!nextVolume}
            onClick={() => {
              if (nextVolume) navigate(`/comics/${seriesId}/read/${nextVolume.id}`);
            }}
            title={nextVolume ? `Tập tiếp: Tập ${nextVolume.order}` : 'Không có tập kế'}
            aria-label="Tập tiếp"
          >
            <span className={styles.volMiniLabel}>
              {nextVolume ? `Tập ${nextVolume.order}` : ''}
            </span>
            <IconChevronRight size={22} />
          </button>
        </div>
      </div>

      {/* ===== NUMERIC PAGE JUMP POPOVER (C3) ===== */}
      {isJumpOpen && (
        <div
          className={styles.jumpOverlay}
          onClick={() => {
            setIsJumpOpen(false);
            setJumpError('');
          }}
        >
          <div className={styles.jumpPopover} onClick={(e) => e.stopPropagation()}>
            <div className={styles.jumpHeader}>
              <span className={styles.jumpTitle}>Đến Trang</span>
              <span className={styles.jumpRange}>(1 – {pageMeta.length})</span>
              <button
                type="button"
                className={styles.jumpCloseBtn}
                onClick={() => {
                  setIsJumpOpen(false);
                  setJumpError('');
                }}
                aria-label="Đóng"
              >
                <IconX size={16} />
              </button>
            </div>

            <div className={styles.jumpInputRow}>
              <input
                type="number"
                min="1"
                max={pageMeta.length}
                className={styles.jumpInput}
                value={jumpValue}
                onChange={(e) => {
                  setJumpValue(e.target.value);
                  setJumpError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmJump();
                }}
                autoFocus
              />
              <button
                type="button"
                className={styles.jumpSubmitBtn}
                onClick={handleConfirmJump}
              >
                Đi
              </button>
            </div>

            {jumpError && <div className={styles.jumpError}>{jumpError}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
