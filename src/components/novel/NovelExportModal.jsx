/**
 * src/components/novel/NovelExportModal.jsx
 *
 * Hộp thoại / Bottom Sheet tải truyện chữ về máy (EPUB hoặc TXT).
 * - Sử dụng hoàn toàn SVG inline, không emoji làm icon.
 * - Tiêu đề viết hoa chữ cái đầu mỗi từ (Title Case).
 * - Mobile-first: tương thích hoàn hảo 360px & 390px, không cuộn ngang.
 * - Hỗ trợ thanh tiến độ, AbortController hủy tải, tự kích hoạt download và Web Share API.
 */

import { useState, useEffect, useRef } from 'react';
import {
  exportNovelToTxt,
  exportNovelToEpub,
  triggerDownload,
  shareFile,
  isNovelInVault,
} from '../../lib/novelExport.js';
import { isVaultSessionUnlocked } from '../../lib/storage.js';
import { getNovel, getChapters } from '../../lib/db.js';
import styles from './NovelExportModal.module.css';

// ---- INLINE SVGS ----

function DownloadIcon({ size = 18, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function BookIcon({ size = 18, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function FileTextIcon({ size = 18, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

function CheckCircleIcon({ size = 18, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function AlertTriangleIcon({ size = 18, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function ShareIcon({ size = 16, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function CloseIcon({ size = 18, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function NovelExportModal({
  novel: initialNovel,
  chapters: initialChapters,
  novelId,
  onClose,
}) {
  const [novel, setNovel] = useState(initialNovel || null);
  const [chapters, setChapters] = useState(initialChapters || []);
  const [loadingData, setLoadingData] = useState(!initialNovel || !initialChapters);

  // Form options
  const [format, setFormat] = useState('epub'); // 'epub' | 'txt'
  const [rangeMode, setRangeMode] = useState('all'); // 'all' | 'custom'
  const [rangeStart, setRangeStart] = useState('1');
  const [rangeEnd, setRangeEnd] = useState('');
  const [includeCover, setIncludeCover] = useState(true);

  // Export progress & execution
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ phase: '', percent: 0, current: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState(null); // { filename, sizeMB, url, blob }

  const abortCtrlRef = useRef(null);

  // Load novel & chapters if not passed directly
  useEffect(() => {
    let active = true;
    if (!novel || !chapters.length) {
      const targetId = novel?.id || novelId;
      if (targetId) {
        setLoadingData(true);
        Promise.all([getNovel(targetId), getChapters(targetId)])
          .then(([n, chs]) => {
            if (!active) return;
            if (n) setNovel(n);
            if (chs) setChapters(chs);
            setLoadingData(false);
          })
          .catch((err) => {
            if (!active) return;
            console.error('Lỗi tải dữ liệu truyện:', err);
            setErrorMsg('Không thể đọc dữ liệu truyện từ cơ sở dữ liệu.');
            setLoadingData(false);
          });
      }
    }
    return () => {
      active = false;
    };
  }, [novelId]);

  // Set default range end when chapters are loaded
  useEffect(() => {
    if (chapters.length > 0) {
      setRangeEnd(String(chapters.length));
    }
  }, [chapters.length]);

  // Set initial includeCover based on cover existence
  useEffect(() => {
    if (novel) {
      setIncludeCover(Boolean(novel.coverUrl || novel.coverThumb));
    }
  }, [novel]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isGenerating && abortCtrlRef.current) {
          abortCtrlRef.current.abort();
        }
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGenerating, onClose]);

  // Clean up object URL when unmounting
  useEffect(() => {
    return () => {
      if (result?.url) {
        try {
          URL.revokeObjectURL(result.url);
        } catch {}
      }
    };
  }, [result]);

  const totalChapters = chapters.length;

  // Validation
  const parsedStart = parseInt(rangeStart, 10);
  const parsedEnd = parseInt(rangeEnd, 10);
  const isCustomRange = rangeMode === 'custom';

  let rangeError = '';
  if (isCustomRange) {
    if (isNaN(parsedStart) || isNaN(parsedEnd)) {
      rangeError = 'Vui lòng nhập số chương hợp lệ.';
    } else if (parsedStart < 1 || parsedStart > totalChapters) {
      rangeError = `Số chương bắt đầu phải từ 1 đến ${totalChapters}.`;
    } else if (parsedEnd < 1 || parsedEnd > totalChapters) {
      rangeError = `Số chương kết thúc phải từ 1 đến ${totalChapters}.`;
    } else if (parsedStart > parsedEnd) {
      rangeError = 'Chương bắt đầu không được lớn hơn chương kết thúc.';
    }
  }

  const isVaultLocked = novel && isNovelInVault(novel) && !isVaultSessionUnlocked();
  const canExport =
    !loadingData &&
    totalChapters > 0 &&
    !isVaultLocked &&
    !isGenerating &&
    (!isCustomRange || !rangeError);

  // Handle Export submission
  const handleExport = async () => {
    if (!canExport) return;

    setErrorMsg('');
    setResult(null);
    setIsGenerating(true);
    setProgress({ phase: 'processing', percent: 0, current: 0, total: 0 });

    const abortCtrl = new AbortController();
    abortCtrlRef.current = abortCtrl;

    try {
      // Determine slice of chapters
      let exportChapters = chapters;
      let startIdx = 1;
      let endIdx = totalChapters;

      if (isCustomRange) {
        startIdx = parsedStart;
        endIdx = parsedEnd;
        exportChapters = chapters.slice(startIdx - 1, endIdx);
      }

      const options = {
        signal: abortCtrl.signal,
        onProgress: (p) => setProgress(p),
        rangeStart: isCustomRange ? startIdx : 1,
        rangeEnd: isCustomRange ? endIdx : totalChapters,
        totalAllChapters: totalChapters,
        includeCover: format === 'epub' && includeCover,
      };

      let res;
      if (format === 'epub') {
        res = await exportNovelToEpub(novel, exportChapters, options);
      } else {
        res = await exportNovelToTxt(novel, exportChapters, options);
      }

      // Kích hoạt tải tự động
      const downloadUrl = triggerDownload(res.blob, res.filename);

      setResult({
        filename: res.filename,
        sizeMB: res.sizeMB,
        url: downloadUrl,
        blob: res.blob,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        setErrorMsg('Đã hủy quá trình xuất file.');
      } else {
        console.error('Lỗi khi xuất truyện:', err);
        setErrorMsg(err.message || 'Có lỗi xảy ra trong quá trình xuất truyện.');
      }
    } finally {
      setIsGenerating(false);
      abortCtrlRef.current = null;
    }
  };

  const handleCancelGeneration = () => {
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort();
    }
  };

  const handleShare = async () => {
    if (!result?.blob || !result?.filename) return;
    await shareFile(result.blob, result.filename, novel?.title);
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-export-title"
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerInfo}>
            <h2 id="modal-export-title" className={styles.title}>
              Tải Truyện Về Máy
            </h2>
            <p className={styles.novelTitle}>{novel?.title || 'Đang tải thông tin...'}</p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            disabled={isGenerating}
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {/* Cảnh báo truyện trong Kho Ẩn */}
        {isVaultLocked && (
          <div className={styles.warningBox}>
            <AlertTriangleIcon size={18} />
            <span>Truyện này nằm trong Kho Ẩn và phiên Mật Thất chưa mở khóa.</span>
          </div>
        )}

        {/* Cảnh báo truyện không có chương */}
        {!loadingData && totalChapters === 0 && (
          <div className={styles.warningBox}>
            <AlertTriangleIcon size={18} />
            <span>Truyện chưa có chương nào để tải về máy.</span>
          </div>
        )}

        {/* Lỗi chung nếu có */}
        {errorMsg && (
          <div className={styles.warningBox}>
            <AlertTriangleIcon size={18} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Thông báo kết quả đã tạo xong */}
        {result && (
          <div className={styles.completedBox}>
            <div className={styles.completedHeader}>
              <CheckCircleIcon size={22} className={styles.completedIcon} />
              <span className={styles.completedTitle}>
                Đã Tạo Xong ({result.sizeMB} MB)
              </span>
            </div>
            <div className={styles.completedFilename}>{result.filename}</div>
            <div className={styles.fallbackActions}>
              <a
                href={result.url}
                download={result.filename}
                className={styles.fallbackLink}
                id="btn-download-fallback"
              >
                <DownloadIcon size={15} />
                Bấm Để Tải Lại
              </a>
              {typeof navigator !== 'undefined' && Boolean(navigator.canShare) && (
                <button
                  type="button"
                  className={styles.shareBtn}
                  onClick={handleShare}
                  id="btn-share-file"
                >
                  <ShareIcon size={15} />
                  Chia Sẻ File
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tiến trình tạo file */}
        {isGenerating && (
          <div className={styles.progressContainer}>
            <div className={styles.progressHeader}>
              <span className={styles.progressStatus}>
                {progress.phase === 'compressing'
                  ? 'Đang nén và đóng gói tập tin...'
                  : `Đang xử lý chương ${progress.current}/${progress.total}...`}
              </span>
              <span className={styles.progressPercent}>{progress.percent}%</span>
            </div>
            <div className={styles.progressBarBg}>
              <div
                className={styles.progressBarFill}
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* 1. Chọn định dạng */}
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Chọn Định Dạng</span>
          <div className={styles.formatGrid}>
            {/* Card EPUB */}
            <div
              className={`${styles.formatCard} ${format === 'epub' ? styles.formatCardActive : ''}`}
              onClick={() => !isGenerating && setFormat('epub')}
              role="radio"
              aria-checked={format === 'epub'}
              tabIndex={0}
              id="export-format-epub"
            >
              <div className={styles.formatHeader}>
                <div className={styles.formatTitleRow}>
                  <BookIcon size={18} className={styles.formatIcon} />
                  <span className={styles.formatName}>EPUB</span>
                </div>
                <div
                  className={`${styles.radioIndicator} ${format === 'epub' ? styles.radioIndicatorActive : ''}`}
                >
                  {format === 'epub' && <div className={styles.radioCheckDot} />}
                </div>
              </div>
              <p className={styles.formatDesc}>Dành cho ứng dụng đọc sách chuyên nghiệp</p>
            </div>

            {/* Card TXT */}
            <div
              className={`${styles.formatCard} ${format === 'txt' ? styles.formatCardActive : ''}`}
              onClick={() => !isGenerating && setFormat('txt')}
              role="radio"
              aria-checked={format === 'txt'}
              tabIndex={0}
              id="export-format-txt"
            >
              <div className={styles.formatHeader}>
                <div className={styles.formatTitleRow}>
                  <FileTextIcon size={18} className={styles.formatIcon} />
                  <span className={styles.formatName}>TXT</span>
                </div>
                <div
                  className={`${styles.radioIndicator} ${format === 'txt' ? styles.radioIndicatorActive : ''}`}
                >
                  {format === 'txt' && <div className={styles.radioCheckDot} />}
                </div>
              </div>
              <p className={styles.formatDesc}>Văn bản thuần, mở nhanh trên mọi thiết bị</p>
            </div>
          </div>
        </div>

        {/* 2. Phạm vi chương */}
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Phạm Vi Chương</span>
          <div className={styles.rangeOptions}>
            <label className={styles.rangeRadioRow}>
              <input
                type="radio"
                name="rangeMode"
                value="all"
                checked={rangeMode === 'all'}
                onChange={() => setRangeMode('all')}
                disabled={isGenerating || totalChapters === 0}
                id="range-all"
              />
              <span>Tất Cả ({totalChapters} chương)</span>
            </label>

            <label className={styles.rangeRadioRow}>
              <input
                type="radio"
                name="rangeMode"
                value="custom"
                checked={rangeMode === 'custom'}
                onChange={() => setRangeMode('custom')}
                disabled={isGenerating || totalChapters === 0}
                id="range-custom"
              />
              <span>Tùy Chọn Khoảng Chương</span>
            </label>
          </div>

          {isCustomRange && (
            <div className={styles.customRangeInputs}>
              <div className={styles.rangeInputGroup}>
                <span className={styles.rangeInputLabel}>Từ Chương:</span>
                <input
                  type="number"
                  min="1"
                  max={totalChapters}
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  className={styles.rangeInput}
                  disabled={isGenerating}
                  id="range-start-input"
                />
              </div>

              <div className={styles.rangeInputGroup}>
                <span className={styles.rangeInputLabel}>Đến Chương:</span>
                <input
                  type="number"
                  min="1"
                  max={totalChapters}
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  className={styles.rangeInput}
                  disabled={isGenerating}
                  id="range-end-input"
                />
              </div>
            </div>
          )}

          {isCustomRange && rangeError && (
            <div className={styles.rangeError}>
              <AlertTriangleIcon size={14} />
              <span>{rangeError}</span>
            </div>
          )}
        </div>

        {/* 3. Tùy chọn Bìa cho EPUB */}
        {format === 'epub' && (
          <div className={styles.section}>
            <label className={styles.toggleRow}>
              <span className={styles.toggleLabel}>
                <BookIcon size={16} />
                Kèm Ảnh Bìa
              </span>
              <input
                type="checkbox"
                checked={includeCover}
                onChange={(e) => setIncludeCover(e.target.checked)}
                disabled={isGenerating || !novel?.coverUrl && !novel?.coverThumb}
                className={styles.toggleCheckbox}
                id="toggle-include-cover"
              />
            </label>
          </div>
        )}

        {/* Actions Footer */}
        <div className={styles.actions}>
          {isGenerating ? (
            <button
              type="button"
              className={styles.btnCancelGeneration}
              onClick={handleCancelGeneration}
              id="btn-cancel-export"
            >
              Hủy Quá Trình Xuất
            </button>
          ) : (
            <>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={onClose}
                id="btn-close-modal"
              >
                {result ? 'Đóng' : 'Hủy'}
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleExport}
                disabled={!canExport}
                id="btn-start-export"
              >
                <DownloadIcon size={17} />
                Tải Về ({format.toUpperCase()})
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
