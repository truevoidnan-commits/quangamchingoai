import React, { useState, useEffect, useRef } from 'react';
import Icon from '../ui/Icon.jsx';
import {
  getVolumes,
  getPage,
} from '../../lib/comics/comicDb.js';
import {
  getCustomBackdropSettings,
  saveCustomBackdropSettings,
  clearCustomBackdrop,
  storeCustomBackdropBlobs,
  cropToBackdropWebp,
} from '../../lib/comics/customBackdrop.js';
import styles from './CustomBackdropModal.module.css';

export default function CustomBackdropModal({ isOpen, onClose, series, onToast }) {
  // Step 1: Chọn tập (Volume) - with shortcut "Dùng bìa truyện này"
  // Step 2: Chọn trang (Page)
  // Step 3: Xem trước & Tuỳ chỉnh (Preview, Blur, Dim)
  const [step, setStep] = useState(1);
  const [volumes, setVolumes] = useState([]);
  const [selectedVolume, setSelectedVolume] = useState(null);

  const [pageThumbnails, setPageThumbnails] = useState([]);
  const [selectedPage, setSelectedPage] = useState(null);

  const [blur, setBlur] = useState(0);
  const [dim, setDim] = useState(40);
  const [isProcessing, setIsProcessing] = useState(false);

  const createdUrlsRef = useRef([]);

  const addBlobUrl = (blob) => {
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    createdUrlsRef.current.push(url);
    return url;
  };

  // Load volumes and existing backdrop settings when opened
  useEffect(() => {
    if (!isOpen || !series?.id) return;
    setStep(1);
    setSelectedVolume(null);
    setSelectedPage(null);

    const curSettings = getCustomBackdropSettings(series.id);
    if (curSettings) {
      setBlur(curSettings.blur || 0);
      setDim(curSettings.dim || 40);
    } else {
      setBlur(0);
      setDim(40);
    }

    getVolumes(series.id)
      .then((vols) => setVolumes(vols || []))
      .catch((err) => console.warn('Could not load volumes for series:', err));

    return () => {
      // Clean up object URLs on close
      createdUrlsRef.current.forEach((u) => u && URL.revokeObjectURL(u));
      createdUrlsRef.current = [];
    };
  }, [isOpen, series?.id]);

  // Shortcut: Use Series Cover
  const handleUseCover = () => {
    if (!series?.coverBlob) {
      if (onToast) onToast('Bộ truyện này chưa có ảnh bìa');
      return;
    }
    const url = addBlobUrl(series.coverBlob);
    setSelectedPage({
      index: 0,
      blob: series.coverBlob,
      blobUrl: url,
      isCover: true,
    });
    setStep(3);
  };

  // Select volume -> step 2 (Pages)
  const handleSelectVolume = async (vol) => {
    setSelectedVolume(vol);
    setPageThumbnails([]);
    setStep(2);

    const total = Math.min(vol.pageCount || 20, 60);
    const thumbs = [];
    for (let i = 0; i < total; i++) {
      thumbs.push({ index: i, loading: true, blobUrl: null, blob: null });
    }
    setPageThumbnails(thumbs);

    for (let i = 0; i < total; i++) {
      getPage(vol.id, i).then((pageRecord) => {
        if (!pageRecord?.blob) return;
        const url = addBlobUrl(pageRecord.blob);
        setPageThumbnails((prev) => {
          const next = [...prev];
          if (next[i]) {
            next[i] = { index: i, loading: false, blobUrl: url, blob: pageRecord.blob };
          }
          return next;
        });
      });
    }
  };

  // Select page -> step 3 (Preview)
  const handleSelectPage = (pageItem) => {
    if (!pageItem.blob && !pageItem.blobUrl) return;
    setSelectedPage(pageItem);
    setStep(3);
  };

  // Back button handler
  const handleBack = () => {
    if (step === 3) {
      if (selectedPage?.isCover) {
        setStep(1);
      } else {
        setStep(2);
      }
    } else if (step === 2) {
      setStep(1);
    }
  };

  // Save selected page as custom backdrop for this series
  const handleSaveBackdrop = async () => {
    if (!selectedPage || !series?.id) return;
    setIsProcessing(true);

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = selectedPage.blobUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      // 1. Crop vertical 1080x1920 (mobile)
      const { blob: verticalBlob, brightness: vBrightness } = await cropToBackdropWebp(img, 1080, 1920, 0.5, 0.5);

      // 2. Crop wide 1920x1080 (desktop)
      const { blob: wideBlob, brightness: wBrightness } = await cropToBackdropWebp(img, 1920, 1080, 0.5, 0.5);

      // Enforce at least 35% dim if page is bright
      const maxBrightness = Math.max(vBrightness, wBrightness);
      const effectiveDim = maxBrightness > 0.5 ? Math.max(35, dim) : dim;

      // Store blobs in CacheStorage for this series
      await storeCustomBackdropBlobs(series.id, { verticalBlob, wideBlob });

      // Save metadata in localStorage under this seriesId
      saveCustomBackdropSettings(series.id, {
        comicId: series.id,
        volumeId: selectedVolume?.id || 'cover',
        pageIndex: selectedPage.index,
        blur: Number(blur) || 0,
        dim: Number(effectiveDim) || 40,
        offsetX: 0.5,
        offsetY: 0.5,
      });

      if (onToast) onToast(`Đã áp dụng hình nền riêng cho «${series.title}»`);
      onClose();
    } catch (e) {
      console.error('Error saving backdrop:', e);
      if (onToast) onToast('Không thể lưu ảnh nền: ' + (e.message || 'Lỗi không xác định'));
    } finally {
      setIsProcessing(false);
    }
  };

  // Reset to default backdrop for this series
  const handleResetDefault = async () => {
    if (!series?.id) return;
    await clearCustomBackdrop(series.id);
    if (onToast) onToast(`Đã khôi phục hình nền mặc định cho «${series.title}»`);
    onClose();
  };

  if (!isOpen || !series) return null;

  const seriesTitle = series.title || 'Bộ truyện';

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className={styles.modalHeader}>
          <div className={styles.headerLeft}>
            {step > 1 && (
              <button
                type="button"
                className={styles.backBtn}
                onClick={handleBack}
                aria-label="Quay lại bước trước"
              >
                <Icon name="arrow-left" size={18} />
              </button>
            )}
            <div>
              <h3 className={styles.headerTitle}>Nền cho «{seriesTitle}»</h3>
              <div className={styles.headerSub}>
                {step === 1 && `Bước 1: Chọn tập (${volumes.length} tập)`}
                {step === 2 && `Bước 2: Chọn trang (${selectedVolume?.title || ''})`}
                {step === 3 && 'Bước 3: Xem trước & Tuỳ chỉnh độ mờ, tối'}
              </div>
            </div>
          </div>

          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Đóng">
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className={styles.modalBody}>
          {/* STEP 1: VOLUME SELECTION */}
          {step === 1 && (
            <div>
              <div className={styles.stepTopActions}>
                <span className={styles.headerSub}>Chọn một tập để duyệt trang ảnh:</span>
                {series?.coverBlob && (
                  <button type="button" className={styles.useCoverBtn} onClick={handleUseCover}>
                    <Icon name="image" size={14} />
                    <span>Dùng ảnh bìa bộ truyện</span>
                  </button>
                )}
              </div>

              {volumes.length === 0 ? (
                <div className={styles.emptyTip}>Bộ truyện chưa có tập nào. Bạn có thể dùng ảnh bìa làm nền.</div>
              ) : (
                <div className={styles.volumeList}>
                  {volumes.map((vol) => (
                    <div
                      key={vol.id}
                      className={styles.volumeItem}
                      onClick={() => handleSelectVolume(vol)}
                    >
                      <div className={styles.volumeItemLeft}>
                        <span className={styles.volOrderBadge}>Tập {vol.volumeOrder || vol.order || 1}</span>
                        <span className={styles.volItemTitle}>{vol.title || `Tập ${vol.volumeOrder || vol.order || 1}`}</span>
                      </div>
                      <span className={styles.volItemPages}>{vol.pageCount || 0} trang</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: PAGE THUMBNAILS GRID */}
          {step === 2 && (
            <div>
              <div className={styles.pagesGrid}>
                {pageThumbnails.map((p) => (
                  <div
                    key={p.index}
                    className={styles.pageThumbCard}
                    onClick={() => handleSelectPage(p)}
                  >
                    {p.blobUrl ? (
                      <img src={p.blobUrl} alt={`Trang ${p.index + 1}`} className={styles.pageThumbImg} />
                    ) : (
                      <div style={{ padding: 10, textAlign: 'center', fontSize: 11, color: '#888' }}>
                        Đang tải...
                      </div>
                    )}
                    <span className={styles.pageNumberBadge}>{p.index + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW & SLIDERS */}
          {step === 3 && selectedPage && (
            <div className={styles.previewWrap}>
              {/* Interactive Live Preview Frame */}
              <div className={styles.previewFrame}>
                <div
                  className={styles.previewImgLayer}
                  style={{
                    backgroundImage: `url(${selectedPage.blobUrl})`,
                    filter: blur > 0 ? `blur(${blur}px)` : 'none',
                    transform: blur > 0 ? 'scale(1.08)' : 'none',
                  }}
                />
                <div
                  className={styles.previewDimLayer}
                  style={{ backgroundColor: `rgba(8, 10, 20, ${dim / 100})` }}
                />
                <div className={styles.previewOverlay} />
                <div className={styles.previewMockTitle}>{seriesTitle}</div>
              </div>

              {/* Sliders */}
              <div className={styles.controlsGrid}>
                <div className={styles.controlItem}>
                  <div className={styles.controlLabelRow}>
                    <span>Độ mờ (Blur)</span>
                    <span className={styles.controlVal}>{blur}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="1"
                    value={blur}
                    onChange={(e) => setBlur(Number(e.target.value))}
                    className={styles.sliderInput}
                    aria-label="Độ mờ"
                  />
                </div>

                <div className={styles.controlItem}>
                  <div className={styles.controlLabelRow}>
                    <span>Độ tối (Dim)</span>
                    <span className={styles.controlVal}>{dim}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="80"
                    step="5"
                    value={dim}
                    onChange={(e) => setDim(Number(e.target.value))}
                    className={styles.sliderInput}
                    aria-label="Độ tối"
                  />
                </div>
              </div>

              <div className={styles.noticeText}>
                * Cài đặt này chỉ áp dụng trên thiết bị hiện tại (không đồng bộ cloud).
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className={styles.modalFooter}>
          <div className={styles.footerLeft}>
            <button
              type="button"
              className={styles.resetBtn}
              onClick={handleResetDefault}
              title="Đặt lại về nền Tàng Kinh mặc định"
            >
              Về nền mặc định
            </button>
          </div>

          <div className={styles.footerRight}>
            {step === 3 && (
              <button
                type="button"
                className={styles.reselectBtn}
                onClick={handleBack}
              >
                Chọn lại
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                className={styles.saveBackdropBtn}
                onClick={handleSaveBackdrop}
                disabled={isProcessing}
              >
                {isProcessing ? 'Đang xử lý...' : 'Dùng làm nền'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
