import React, { useState, useRef, useEffect } from 'react';
import { QUALITY_PRESETS, importMultiplePdfs } from '../../lib/comics/pdfImport.js';
import styles from './ComicImportModal.module.css';

export default function ComicImportModal({
  isOpen,
  onClose,
  initialSeriesId = null,
  initialSeriesTitle = '',
  allSeries = [],
  onImportSuccess,
}) {
  const [files, setFiles] = useState([]);
  const [targetSeriesMode, setTargetSeriesMode] = useState(initialSeriesId ? 'existing' : 'new');
  const [selectedSeriesId, setSelectedSeriesId] = useState(initialSeriesId || (allSeries[0]?.id || ''));
  const [newSeriesTitle, setNewSeriesTitle] = useState(initialSeriesTitle || '');
  const [quality, setQuality] = useState('balanced');
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  const abortControllerRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (initialSeriesId) {
      setTargetSeriesMode('existing');
      setSelectedSeriesId(initialSeriesId);
    }
  }, [initialSeriesId]);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (selected.length === 0) return;
    setFiles(selected);
    setErrorMsg('');

    // If no series title specified yet and creating new, suggest from first file
    if (!newSeriesTitle && targetSeriesMode === 'new') {
      const baseName = selected[0].name.replace(/\.pdf$/i, '').replace(/[_+]/g, ' ').trim();
      const suggested = baseName.replace(/(?:tập|vol(?:ume)?\.?|quyển|chap(?:ter)?\.?)\s*\d+.*$/i, '').trim() || baseName;
      setNewSeriesTitle(suggested);
    }
  };

  const handleStartImport = async () => {
    if (files.length === 0) {
      setErrorMsg('Vui lòng chọn ít nhất một file PDF.');
      return;
    }

    if (targetSeriesMode === 'new' && !newSeriesTitle.trim()) {
      setErrorMsg('Vui lòng nhập tên bộ truyện.');
      return;
    }

    setIsImporting(true);
    setErrorMsg('');
    abortControllerRef.current = new AbortController();

    try {
      const seriesId = targetSeriesMode === 'existing' ? selectedSeriesId : null;
      const seriesTitle = targetSeriesMode === 'new' ? newSeriesTitle.trim() : '';

      const res = await importMultiplePdfs(files, {
        seriesId,
        seriesTitle,
        quality,
        signal: abortControllerRef.current.signal,
        onProgress: (p) => {
          setProgress(p);
        },
      });

      setIsImporting(false);
      if (onImportSuccess) {
        onImportSuccess(res);
      }
      onClose();
    } catch (err) {
      if (err.name === 'AbortError' || err.message === 'Đã hủy nhập') {
        setErrorMsg('Đã hủy quá trình nhập.');
      } else {
        setErrorMsg(`Lỗi nhập PDF: ${err.message || err.toString()}`);
      }
      setIsImporting(false);
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsImporting(false);
    setProgress(null);
  };

  const formatMb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

  return (
    <div className={styles.modalOverlay} onClick={!isImporting ? onClose : undefined}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div className={styles.titleWrap}>
            <span className={styles.headerIcon}>📚</span>
            <h2 className={styles.modalTitle}>Nhập Truyện Tranh (PDF)</h2>
          </div>
          {!isImporting && (
            <button className={styles.closeBtn} onClick={onClose} aria-label="Đóng">
              ✕
            </button>
          )}
        </div>

        <div className={styles.modalBody}>
          {errorMsg && <div className={styles.errorAlert}>{errorMsg}</div>}

          {!isImporting ? (
            <>
              {/* File Selection Box */}
              <div
                className={styles.dropZone}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf,application/pdf"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <span className={styles.dropIcon}>📥</span>
                {files.length === 0 ? (
                  <>
                    <p className={styles.dropTitle}>Chọn file PDF từ máy</p>
                    <p className={styles.dropSub}>Hỗ trợ chọn nhiều tập cùng lúc (70-80MB/tập)</p>
                  </>
                ) : (
                  <div className={styles.fileListSummary}>
                    <p className={styles.dropTitle}>Đã chọn {files.length} file PDF</p>
                    <ul className={styles.fileNames}>
                      {files.slice(0, 5).map((f, i) => (
                        <li key={i}>{f.name} ({formatMb(f.size)} MB)</li>
                      ))}
                      {files.length > 5 && <li>...và {files.length - 5} file khác</li>}
                    </ul>
                  </div>
                )}
              </div>

              {/* Series Option */}
              <div className={styles.formGroup}>
                <label className={styles.label}>Bộ Truyện</label>
                {allSeries.length > 0 && !initialSeriesId && (
                  <div className={styles.radioGroup}>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="seriesMode"
                        value="new"
                        checked={targetSeriesMode === 'new'}
                        onChange={() => setTargetSeriesMode('new')}
                      />
                      <span>Tạo bộ mới</span>
                    </label>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="seriesMode"
                        value="existing"
                        checked={targetSeriesMode === 'existing'}
                        onChange={() => setTargetSeriesMode('existing')}
                      />
                      <span>Thêm vào bộ có sẵn</span>
                    </label>
                  </div>
                )}

                {targetSeriesMode === 'new' ? (
                  <input
                    type="text"
                    className={styles.textInput}
                    placeholder="Ví dụ: One Piece, Naruto, Đấu Phá..."
                    value={newSeriesTitle}
                    onChange={(e) => setNewSeriesTitle(e.target.value)}
                  />
                ) : (
                  <select
                    className={styles.selectInput}
                    value={selectedSeriesId}
                    onChange={(e) => setSelectedSeriesId(e.target.value)}
                    disabled={!!initialSeriesId}
                  >
                    {allSeries.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title} ({s.volumeCount || 0} tập)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Quality Preset */}
              <div className={styles.formGroup}>
                <label className={styles.label}>Chất Lượng Tối Ưu Hóa</label>
                <div className={styles.qualityGrid}>
                  {Object.values(QUALITY_PRESETS).map((preset) => (
                    <div
                      key={preset.id}
                      className={`${styles.qualityCard} ${quality === preset.id ? styles.qualitySelected : ''}`}
                      onClick={() => setQuality(preset.id)}
                    >
                      <div className={styles.qualityName}>{preset.label}</div>
                      <div className={styles.qualityEstimate}>~{preset.estimatedSizeMbPerVol}MB/tập</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* Progress view during import */
            <div className={styles.progressContainer}>
              <div className={styles.progressPulseIcon}>⚙️</div>
              <h3 className={styles.progressTitle}>
                Đang xử lý truyện tranh...
              </h3>
              
              {progress && (
                <>
                  <div className={styles.progressSubtitle}>
                    {progress.volumeTitle && <strong>{progress.volumeTitle}</strong>}
                    {progress.totalVols > 1 && (
                      <span> (Tập {progress.currentVol}/{progress.totalVols})</span>
                    )}
                  </div>

                  <div className={styles.progressBarWrap}>
                    <div
                      className={styles.progressBarFill}
                      style={{
                        width: `${progress.totalPages ? Math.round((progress.currentPage / progress.totalPages) * 100) : 0}%`,
                      }}
                    />
                  </div>

                  <div className={styles.progressStats}>
                    <span>
                      Trang: {progress.currentPage} / {progress.totalPages} (
                      {progress.totalPages ? Math.round((progress.currentPage / progress.totalPages) * 100) : 0}%)
                    </span>
                    <span>
                      Dung lượng WebP: {formatMb(progress.currentBytes || 0)} MB
                    </span>
                  </div>
                </>
              )}

              <p className={styles.progressNote}>
                ⚡ Đang chuyển đổi trực tiếp trên trình duyệt, không tốn data mạng. Vui lòng giữ tab này mở.
              </p>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          {!isImporting ? (
            <>
              <button className={styles.cancelBtn} onClick={onClose}>
                Đóng
              </button>
              <button
                className={styles.submitBtn}
                onClick={handleStartImport}
                disabled={files.length === 0}
              >
                Bắt Đầu Nhập ({files.length} tập)
              </button>
            </>
          ) : (
            <button className={styles.cancelImportBtn} onClick={handleCancel}>
              🛑 Hủy Quá Trình Nhập
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
