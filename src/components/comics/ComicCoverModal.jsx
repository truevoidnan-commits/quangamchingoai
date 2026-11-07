import React, { useState, useEffect, useRef } from 'react';
import Icon from '../ui/Icon.jsx';
import ImageCropperModal from '../ui/ImageCropperModal.jsx';
import {
  getVolumes,
  getPage,
  setSeriesCover,
  clearSeriesCover,
  dataUrlToCoverWebpBlob,
} from '../../lib/comics/comicDb.js';
import styles from './ComicCoverModal.module.css';

/**
 * ComicCoverModal
 * Allows changing the comic series cover with 3 choices:
 * 1) Pick any page from inside the comic series volumes -> 3:4 crop -> save
 * 2) Upload image file from device (JPG/PNG/WebP) -> 3:4 crop -> save
 * 3) Reset to automatic cover (first volume's cover)
 */
export default function ComicCoverModal({
  isOpen,
  onClose,
  series,
  hasCustomCover = false,
  onToast,
  onCoverChanged,
}) {
  // mode: 'menu' | 'volumes' | 'pages' | 'confirm-reset'
  const [mode, setMode] = useState('menu');
  const [volumes, setVolumes] = useState([]);
  const [selectedVolume, setSelectedVolume] = useState(null);
  const [pageThumbnails, setPageThumbnails] = useState([]);

  // Cropper states
  const [cropperImageSrc, setCropperImageSrc] = useState(null);
  const [isCropperOpen, setIsCropperOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef(null);
  const createdUrlsRef = useRef([]);

  const addBlobUrl = (blob) => {
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    createdUrlsRef.current.push(url);
    return url;
  };

  const clearCreatedUrls = () => {
    createdUrlsRef.current.forEach((u) => {
      if (u) URL.revokeObjectURL(u);
    });
    createdUrlsRef.current = [];
  };

  useEffect(() => {
    if (!isOpen || !series?.id) return;
    setMode('menu');
    setSelectedVolume(null);
    setPageThumbnails([]);
    setCropperImageSrc(null);
    setIsCropperOpen(false);

    getVolumes(series.id)
      .then((vols) => setVolumes(vols || []))
      .catch((err) => console.warn('Could not load volumes:', err));

    return () => {
      clearCreatedUrls();
    };
  }, [isOpen, series?.id]);

  if (!isOpen || !series) return null;

  // -------------------------------------------------------------
  // Mode 1: Browse Volumes & Pages
  // -------------------------------------------------------------
  const handleOpenPagePicker = () => {
    if (volumes.length === 0) {
      if (onToast) onToast('Bộ truyện chưa có tập nào để chọn trang');
      return;
    }
    if (volumes.length === 1) {
      handleSelectVolume(volumes[0]);
    } else {
      setMode('volumes');
    }
  };

  const handleSelectVolume = (vol) => {
    setSelectedVolume(vol);
    setPageThumbnails([]);
    setMode('pages');

    const total = Math.min(vol.pageCount || 20, 80);
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

  const handleSelectPageForCrop = (pageItem) => {
    if (!pageItem?.blobUrl) return;
    setCropperImageSrc(pageItem.blobUrl);
    setIsCropperOpen(true);
  };

  // -------------------------------------------------------------
  // Mode 2: Device Upload
  // -------------------------------------------------------------
  const handleTriggerDeviceUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so same file can be selected again
    e.target.value = '';

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      if (onToast) onToast('Định dạng không hợp lệ. Vui lòng chọn ảnh JPG, PNG hoặc WebP.');
      return;
    }

    const MAX_SIZE = 15 * 1024 * 1024; // 15MB
    if (file.size > MAX_SIZE) {
      if (onToast) onToast('Dung lượng ảnh vượt quá 15MB. Vui lòng chọn ảnh nhẹ hơn.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      if (dataUrl) {
        setCropperImageSrc(dataUrl);
        setIsCropperOpen(true);
      }
    };
    reader.onerror = () => {
      if (onToast) onToast('Không thể đọc tệp ảnh từ thiết bị');
    };
    reader.readAsDataURL(file);
  };

  // -------------------------------------------------------------
  // Mode 3: Reset to Automatic Cover
  // -------------------------------------------------------------
  const handleConfirmResetAuto = async () => {
    setIsSaving(true);
    try {
      await clearSeriesCover(series.id);
      if (onCoverChanged) onCoverChanged(null);
      if (onToast) onToast(`Đã quay về ảnh bìa tự động cho «${series.title}»`);
      onClose();
    } catch (err) {
      console.error('Error resetting cover:', err);
      if (onToast) onToast('Lỗi khôi phục ảnh bìa tự động: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // -------------------------------------------------------------
  // Apply Crop Result
  // -------------------------------------------------------------
  const handleApplyCroppedCover = async (croppedDataUrl) => {
    setIsCropperOpen(false);
    setIsSaving(true);
    try {
      const webpBlob = await dataUrlToCoverWebpBlob(croppedDataUrl, 0.85);
      await setSeriesCover(series.id, webpBlob);
      if (onCoverChanged) onCoverChanged(webpBlob);
      if (onToast) onToast(`Đã đổi ảnh bìa cho «${series.title}»`);
      onClose();
    } catch (err) {
      console.error('Error saving cropped cover:', err);
      if (onToast) onToast('Không thể lưu ảnh bìa: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (mode === 'pages') {
      if (volumes.length > 1) {
        setMode('volumes');
      } else {
        setMode('menu');
      }
    } else if (mode === 'volumes' || mode === 'confirm-reset') {
      setMode('menu');
    }
  };

  return (
    <>
      <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          {/* Modal Header */}
          <div className={styles.modalHeader}>
            <div className={styles.headerLeft}>
              {mode !== 'menu' && (
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={handleBack}
                  aria-label="Quay lại"
                >
                  <Icon name="arrow-left" size={18} />
                </button>
              )}
              <div>
                <h3 className={styles.headerTitle}>Ảnh bìa cho «{series.title}»</h3>
                <div className={styles.headerSub}>
                  {mode === 'menu' && 'Chọn cách thức cập nhật ảnh bìa'}
                  {mode === 'volumes' && `Chọn tập (${volumes.length} tập)`}
                  {mode === 'pages' && `Chọn trang ảnh từ ${selectedVolume?.title || 'tập'}`}
                  {mode === 'confirm-reset' && 'Xác nhận khôi phục'}
                </div>
              </div>
            </div>

            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Đóng">
              <Icon name="x" size={20} />
            </button>
          </div>

          {/* Modal Body */}
          <div className={styles.modalBody}>
            {/* 1. MAIN MENU: 3 CHOICES */}
            {mode === 'menu' && (
              <div className={styles.optionsGrid}>
                {/* Option 1: Pick from Pages */}
                <button
                  type="button"
                  className={styles.optionCard}
                  onClick={handleOpenPagePicker}
                  id="btn-cover-pick-page"
                >
                  <div className={styles.optionIconWrap}>
                    <Icon name="pages" size={22} />
                  </div>
                  <div className={styles.optionTextWrap}>
                    <div className={styles.optionTitle}>Chọn trang trong truyện</div>
                    <div className={styles.optionDesc}>
                      Duyệt qua các tập và cắt bất kỳ trang ảnh nào thành bìa tỷ lệ 3:4
                    </div>
                  </div>
                  <Icon name="chevron-right" size={18} style={{ color: 'var(--text-muted)' }} />
                </button>

                {/* Option 2: Upload from Device */}
                <button
                  type="button"
                  className={styles.optionCard}
                  onClick={handleTriggerDeviceUpload}
                  id="btn-cover-upload-device"
                >
                  <div className={styles.optionIconWrap}>
                    <Icon name="upload" size={22} />
                  </div>
                  <div className={styles.optionTextWrap}>
                    <div className={styles.optionTitle}>Tải ảnh từ máy</div>
                    <div className={styles.optionDesc}>
                      Tải lên hình ảnh từ thiết bị (JPG, PNG, WebP) và căn chỉnh khung 3:4
                    </div>
                  </div>
                  <Icon name="chevron-right" size={18} style={{ color: 'var(--text-muted)' }} />
                </button>

                {/* Option 3: Reset to Automatic Cover (only if currently custom) */}
                {hasCustomCover && (
                  <button
                    type="button"
                    className={`${styles.optionCard} ${styles.optionCardReset}`}
                    onClick={() => setMode('confirm-reset')}
                    id="btn-cover-reset-auto"
                  >
                    <div className={styles.optionIconWrap}>
                      <Icon name="refresh" size={20} />
                    </div>
                    <div className={styles.optionTextWrap}>
                      <div className={styles.optionTitle}>Dùng bìa tự động</div>
                      <div className={styles.optionDesc}>
                        Hủy bìa tùy chỉnh và quay về dùng ảnh bìa tự động của tập đầu tiên
                      </div>
                    </div>
                    <Icon name="chevron-right" size={18} style={{ color: 'var(--text-muted)' }} />
                  </button>
                )}

                <div className={styles.currentCoverNote}>
                  <Icon name="info" size={14} />
                  <span>
                    {hasCustomCover
                      ? 'Bộ truyện này đang sử dụng ảnh bìa tùy chỉnh.'
                      : 'Bộ truyện đang sử dụng ảnh bìa tự động trích xuất từ tập 1.'}
                  </span>
                </div>
              </div>
            )}

            {/* 2. VOLUME SELECTION */}
            {mode === 'volumes' && (
              <div className={styles.volumeList}>
                {volumes.map((vol) => (
                  <div
                    key={vol.id}
                    className={styles.volumeItem}
                    onClick={() => handleSelectVolume(vol)}
                  >
                    <div>
                      <span className={styles.volOrderBadge}>Tập {vol.order || 1}</span>
                      <span className={styles.volItemTitle}>{vol.title}</span>
                    </div>
                    <span className={styles.volItemMeta}>{vol.pageCount || 0} trang</span>
                  </div>
                ))}
              </div>
            )}

            {/* 3. PAGE THUMBNAILS GRID */}
            {mode === 'pages' && (
              <>
                {pageThumbnails.length === 0 ? (
                  <div className={styles.emptyTip}>Đang tải danh sách trang...</div>
                ) : (
                  <div className={styles.pageGrid}>
                    {pageThumbnails.map((p) => (
                      <div
                        key={p.index}
                        className={styles.pageThumbItem}
                        onClick={() => handleSelectPageForCrop(p)}
                        title={`Chọn trang ${p.index + 1}`}
                      >
                        {p.loading || !p.blobUrl ? (
                          <div className={styles.thumbSkeleton} />
                        ) : (
                          <img
                            src={p.blobUrl}
                            alt={`Trang ${p.index + 1}`}
                            className={styles.thumbImg}
                            loading="lazy"
                          />
                        )}
                        <span className={styles.pageBadge}>Trang {p.index + 1}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* 4. CONFIRM RESET AUTO COVER */}
            {mode === 'confirm-reset' && (
              <div className={styles.confirmBox}>
                <div className={styles.confirmIconWrap}>
                  <Icon name="refresh" size={26} />
                </div>
                <h4 className={styles.confirmTitle}>Khôi phục ảnh bìa tự động?</h4>
                <p className={styles.confirmDesc}>
                  Bìa tùy chỉnh sẽ bị xóa. Hệ thống sẽ tự động dùng lại ảnh bìa của tập đầu tiên.
                </p>
                <div className={styles.confirmActions}>
                  <button
                    type="button"
                    className={styles.btnCancel}
                    onClick={() => setMode('menu')}
                    disabled={isSaving}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    className={styles.btnConfirm}
                    onClick={handleConfirmResetAuto}
                    disabled={isSaving}
                    id="btn-confirm-reset-cover"
                  >
                    {isSaving ? 'Đang khôi phục...' : 'Xác nhận khôi phục'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Image Cropper Modal (3:4 Ratio) */}
      {isCropperOpen && cropperImageSrc && (
        <ImageCropperModal
          imageSrc={cropperImageSrc}
          onCrop={handleApplyCroppedCover}
          onClose={() => setIsCropperOpen(false)}
        />
      )}
    </>
  );
}
