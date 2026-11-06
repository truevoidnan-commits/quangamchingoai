import Icon from '../ui/Icon';
import React, { useState, useEffect, useRef } from 'react';
import {
  getAllSeries,
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

export default function CustomBackdropModal({ isOpen, onClose, onToast }) {
  const [step, setStep] = useState(1); // 1: Series, 2: Volumes, 3: Pages, 4: Preview
  const [seriesList, setSeriesList] = useState([]);
  const [selectedSeries, setSelectedSeries] = useState(null);
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

  // Load series on open
  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setSelectedSeries(null);
    setSelectedVolume(null);
    setSelectedPage(null);

    const curSettings = getCustomBackdropSettings();
    if (curSettings) {
      setBlur(curSettings.blur || 0);
      setDim(curSettings.dim || 40);
    } else {
      setBlur(0);
      setDim(40);
    }

    getAllSeries()
      .then((list) => setSeriesList(list || []))
      .catch((err) => console.warn('Could not load series:', err));

    return () => {
      // Clean up object URLs on close
      createdUrlsRef.current.forEach((u) => u && URL.revokeObjectURL(u));
      createdUrlsRef.current = [];
    };
  }, [isOpen]);

  // Load volumes when series is selected
  const handleSelectSeries = async (s) => {
    setSelectedSeries(s);
    try {
      const vols = await getVolumes(s.id);
      setVolumes(vols || []);
      setStep(2);
    } catch (e) {
      console.warn('Could not load volumes:', e);
    }
  };

  // Shortcut: Use Series Cover
  const handleUseCover = () => {
    if (!selectedSeries?.coverBlob) {
      if (onToast) onToast('Bộ truyện này chưa có ảnh bìa');
      return;
    }
    const url = addBlobUrl(selectedSeries.coverBlob);
    setSelectedPage({
      index: 0,
      blob: selectedSeries.coverBlob,
      blobUrl: url,
      isCover: true,
    });
    setStep(4);
  };

  // Load pages when volume is selected
  const handleSelectVolume = async (vol) => {
    setSelectedVolume(vol);
    setPageThumbnails([]);
    setStep(3);

    // Lazy load first batch of thumbnails
    const total = Math.min(vol.pageCount || 20, 60);
    const thumbs = [];
    for (let i = 0; i < total; i++) {
      thumbs.push({ index: i, loading: true, blobUrl: null, blob: null });
    }
    setPageThumbnails(thumbs);

    // Fetch page blobs sequentially/batched
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

  // Select page to preview
  const handleSelectPage = (pageItem) => {
    if (!pageItem.blob && !pageItem.blobUrl) return;
    setSelectedPage(pageItem);
    setStep(4);
  };

  // Save selected page as custom backdrop
  const handleSaveBackdrop = async () => {
    if (!selectedPage) return;
    setIsProcessing(true);

    try {
      // Create image element to crop from
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = selectedPage.blobUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      // 1. Crop vertical 1080x1920 (for mobile)
      const { blob: verticalBlob, brightness: vBrightness } = await cropToBackdropWebp(img, 1080, 1920, 0.5, 0.5);

      // 2. Crop wide 1920x1080 (for desktop)
      const { blob: wideBlob, brightness: wBrightness } = await cropToBackdropWebp(img, 1920, 1080, 0.5, 0.5);

      // Check luminance for auto-dim guarantee: if bright, enforce at least 35% dim
      const maxBrightness = Math.max(vBrightness, wBrightness);
      const effectiveDim = maxBrightness > 0.5 ? Math.max(35, dim) : dim;

      // Store blobs in CacheStorage
      await storeCustomBackdropBlobs({ verticalBlob, wideBlob });

      // Save metadata in localStorage
      saveCustomBackdropSettings({
        comicId: selectedSeries?.id || '',
        volumeId: selectedVolume?.id || 'cover',
        pageIndex: selectedPage.index,
        blur: Number(blur) || 0,
        dim: Number(effectiveDim) || 40,
        offsetX: 0.5,
        offsetY: 0.5,
      });

      if (onToast) onToast('Đã áp dụng hình nền tùy chọn cho Tàng Kinh Họa Các');
      onClose();
    } catch (e) {
      console.error('Error saving backdrop:', e);
      if (onToast) onToast('Không thể lưu ảnh nền: ' + (e.message || 'Lỗi không xác định'));
    } finally {
      setIsProcessing(false);
    }
  };

  // Reset to default backdrop
  const handleResetDefault = async () => {
    await clearCustomBackdrop();
    if (onToast) onToast('Đã khôi phục hình nền mặc định');
    onClose();
  };

  if (!isOpen) return null;

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
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                aria-label="Quay lại bước trước"
              >
                <Icon name="arrow-left" size={18} />
              </button>
            )}
            <div>
              <h3 className={styles.headerTitle}>Chọn Ảnh Nền Tàng Kinh</h3>
              <div className={styles.headerSub}>
                {step === 1 && 'Bước 1: Chọn bộ truyện'}
                {step === 2 && `Bước 2: Chọn tập (${selectedSeries?.title || ''})`}
                {step === 3 && `Bước 3: Chọn trang (${selectedVolume?.title || ''})`}
                {step === 4 && 'Bước 4: Xem trước & Tuỳ chỉnh độ mờ, tối'}
              </div>
            </div>
          </div>

          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Đóng">
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className={styles.modalBody}>
          {/* STEP 1: SERIES SELECTION */}
          {step === 1 && (
            <div>
              {seriesList.length === 0 ? (
                <div className={styles.emptyTip}>Chưa có bộ truyện tranh nào trong thư viện.</div>
              ) : (
                <div className={styles.seriesGrid}>
                  {seriesList.map((s) => {
                    const coverUrl = s.coverBlob ? addBlobUrl(s.coverBlob) : null;
                    return (
                      <div
                        key={s.id}
                        className={styles.seriesCard}
                        onClick={() => handleSelectSeries(s)}
                      >
                        <div className={styles.seriesCoverWrap}>
                          {coverUrl ? (
                            <img src={coverUrl} alt={s.title} className={styles.seriesCoverImg} />
                          ) : (
                            <Icon name="book" size={24} style={{ opacity: 0.5 }} />
                          )}
                        </div>
                        <h4 className={styles.seriesTitle}>{s.title}</h4>
                        <div className={styles.seriesMeta}>{s.volumeCount || 0} tập</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: VOLUME SELECTION */}
          {step === 2 && (
            <div>
              <div className={styles.stepTopActions}>
                <span className={styles.headerSub}>Chọn một tập để duyệt trang:</span>
                {selectedSeries?.coverBlob && (
                  <button type="button" className={styles.useCoverBtn} onClick={handleUseCover}>
                    ✦ Dùng bìa truyện này
                  </button>
                )}
              </div>

              {volumes.length === 0 ? (
                <div className={styles.emptyTip}>Bộ truyện chưa có tập nào.</div>
              ) : (
                <div className={styles.volumeList}>
                  {volumes.map((vol) => (
                    <div
                      key={vol.id}
                      className={styles.volumeItem}
                      onClick={() => handleSelectVolume(vol)}
                    >
                      <div className={styles.volumeItemLeft}>
                        <span className={styles.volOrderBadge}>Tập {vol.volumeOrder}</span>
                        <span className={styles.volItemTitle}>{vol.title || `Tập ${vol.volumeOrder}`}</span>
                      </div>
                      <span className={styles.volItemPages}>{vol.pageCount || 0} trang</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: PAGE THUMBNAILS GRID */}
          {step === 3 && (
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

          {/* STEP 4: PREVIEW & SLIDERS */}
          {step === 4 && selectedPage && (
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
                <div className={styles.previewMockTitle}>TÀNG KINH HỌA CÁC</div>
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
                * Cài đặt này chỉ áp dụng trên thiết bị hiện tại.
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
              Nền mặc định
            </button>
          </div>

          <div className={styles.footerRight}>
            {step === 4 && (
              <button
                type="button"
                className={styles.reselectBtn}
                onClick={() => setStep(3)}
              >
                Chọn lại
              </button>
            )}

            {step === 4 && (
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
