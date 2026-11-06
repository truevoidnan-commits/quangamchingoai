import React, { useState, useRef, useEffect } from 'react';
import { QUALITY_PRESETS, importMultiplePdfs } from '../../lib/comics/pdfImport.js';
import { isCloudAvailable, uploadAllUnsyncedVolumes } from '../../lib/comics/comicCloud.js';
import { getVolumes, parseVolumeOrder, cleanVolumeTitle } from '../../lib/comics/comicDb.js';
import {
  IconBookOpen,
  IconFolder,
  IconX,
  IconCloudUpload,
  IconAlertTriangle,
  IconRefresh,
  IconTrash,
} from './ComicIcons.jsx';
import styles from './ComicImportModal.module.css';

export default function ComicImportModal({
  isOpen,
  onClose,
  initialSeriesId = null,
  initialSeriesTitle = '',
  allSeries = [],
  onImportSuccess,
}) {
  const [fileConfigs, setFileConfigs] = useState([]);
  const [targetSeriesMode, setTargetSeriesMode] = useState(initialSeriesId ? 'existing' : 'new');
  const [selectedSeriesId, setSelectedSeriesId] = useState(initialSeriesId || (allSeries[0]?.id || ''));
  const [newSeriesTitle, setNewSeriesTitle] = useState(initialSeriesTitle || '');
  const [quality, setQuality] = useState('balanced');
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [encoderNotice, setEncoderNotice] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [autoUpload, setAutoUpload] = useState(() => {
    try {
      return localStorage.getItem('tcl_comic_auto_upload') !== 'false';
    } catch {
      return true;
    }
  });
  const [maxExistingOrder, setMaxExistingOrder] = useState(0);

  const abortControllerRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const handleComicToast = (e) => {
      if (e.detail) setEncoderNotice(e.detail);
    };
    window.addEventListener('comic-toast', handleComicToast);
    return () => window.removeEventListener('comic-toast', handleComicToast);
  }, []);

  useEffect(() => {
    isCloudAvailable().then(setIsLoggedIn);
  }, []);

  useEffect(() => {
    if (initialSeriesId) {
      setTargetSeriesMode('existing');
      setSelectedSeriesId(initialSeriesId);
    }
  }, [initialSeriesId]);

  // Lấy số tập lớn nhất hiện có khi chọn bộ truyện có sẵn
  useEffect(() => {
    if (targetSeriesMode === 'existing' && selectedSeriesId) {
      getVolumes(selectedSeriesId)
        .then((vols) => {
          if (vols && vols.length > 0) {
            const max = Math.max(...vols.map((v) => Number(v.order) || 0), 0);
            setMaxExistingOrder(max);
          } else {
            setMaxExistingOrder(0);
          }
        })
        .catch(() => setMaxExistingOrder(0));
    } else {
      setMaxExistingOrder(0);
    }
  }, [targetSeriesMode, selectedSeriesId]);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []).filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    if (selected.length === 0) return;

    let unnumberedCounter = 1;
    const configs = selected.map((file, idx) => {
      const parsed = parseVolumeOrder(file.name, null);
      let order;
      if (parsed !== null) {
        order = parsed;
      } else {
        order = maxExistingOrder + unnumberedCounter++;
      }
      const title = cleanVolumeTitle(file.name, order);
      return {
        id: `${file.name}_${file.size}_${idx}_${Date.now()}`,
        file,
        order,
        title,
      };
    });

    setFileConfigs(configs);
    setErrorMsg('');

    // Gợi ý tên bộ truyện nếu đang tạo mới và chưa nhập
    if (!newSeriesTitle && targetSeriesMode === 'new') {
      const baseName = selected[0].name.replace(/\.pdf$/i, '').replace(/[_+]/g, ' ').trim();
      const suggested =
        baseName.replace(/(?:tập|vol(?:ume)?\.?|quyển|chap(?:ter)?\.?)\s*\d+.*$/i, '').trim() || baseName;
      setNewSeriesTitle(suggested);
    }
  };

  const handleOrderChange = (idx, value) => {
    const num = parseFloat(value);
    setFileConfigs((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], order: isNaN(num) ? value : num };
      return next;
    });
  };

  const handleTitleChange = (idx, value) => {
    setFileConfigs((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], title: value };
      return next;
    });
  };

  const handleRemoveFile = (idx) => {
    setFileConfigs((prev) => prev.filter((_, i) => i !== idx));
  };

  // Phát hiện các số tập bị trùng nhau
  const orderList = fileConfigs.map((c) => Number(c.order)).filter((n) => !isNaN(n));
  const duplicateOrders = [...new Set(orderList.filter((item, index) => orderList.indexOf(item) !== index))];

  const handleStartImport = async () => {
    if (fileConfigs.length === 0) {
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

      const res = await importMultiplePdfs(fileConfigs, {
        seriesId,
        seriesTitle,
        quality,
        signal: abortControllerRef.current.signal,
        onToast: (msg) => setEncoderNotice(msg),
        onProgress: (p) => {
          setProgress(p);
        },
      });

      setIsImporting(false);

      // Tự động tải lên Cloud nếu được bật
      if (autoUpload && isLoggedIn && res?.seriesId) {
        uploadAllUnsyncedVolumes(res.seriesId).catch((err) => {
          console.warn('[ComicCloud] Tự động tải lên thất bại:', err);
        });
      }

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
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.sheetHandle} />
        <div className={styles.modalHeader}>
          <div className={styles.titleWrap}>
            <div className={styles.headerIconCircle}>
              <IconBookOpen size={20} />
            </div>
            <div>
              <h2 className={styles.modalTitle}>Nhập Truyện Tranh (PDF)</h2>
              <p className={styles.modalSubtitle}>Tàng Kinh Họa Các · Chuyển đổi WebP tối ưu</p>
            </div>
          </div>
          {!isImporting && (
            <button className={styles.closeBtn} onClick={onClose} aria-label="Đóng">
              <IconX size={18} />
            </button>
          )}
        </div>

        <div className={styles.modalBody}>
          {errorMsg && <div className={styles.errorAlert}>{errorMsg}</div>}

          {!isImporting ? (
            <>
              {/* File Drop Area */}
              <div className={styles.dropZone} onClick={() => fileInputRef.current?.click()}>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <div className={styles.dropIconWrap}>
                  <IconFolder size={32} />
                </div>
                <p className={styles.dropPrompt}>Nhấn hoặc thả file PDF tập truyện vào đây</p>
                <p className={styles.dropSub}>Mỗi file ứng với 1 tập (hỗ trợ tập lớn 50–100MB+)</p>
              </div>

              {/* Editable File List Table */}
              {fileConfigs.length > 0 && (
                <div className={styles.fileListSection}>
                  <div className={styles.fileListHeader}>
                    <span>Danh sách tập ({fileConfigs.length} tập · ~{formatMb(fileConfigs.reduce((acc, f) => acc + (f.file?.size || 0), 0))} MB)</span>
                  </div>

                  {duplicateOrders.length > 0 && (
                    <div className={styles.duplicateWarning}>
                      <IconAlertTriangle size={16} />
                      <span>
                        Chú ý: Các tập có số {duplicateOrders.join(', ')} đang bị trùng. Hãy điều chỉnh số tập để hiển thị đúng thứ tự.
                      </span>
                    </div>
                  )}

                  <div className={styles.fileListTable}>
                    {fileConfigs.map((item, idx) => (
                      <div key={item.id} className={styles.fileRow}>
                        <div className={styles.fileOrderCol}>
                          <label className={styles.miniLabel}>Số tập</label>
                          <input
                            type="number"
                            step="any"
                            min="1"
                            className={styles.miniNumberInput}
                            value={item.order}
                            onChange={(e) => handleOrderChange(idx, e.target.value)}
                            aria-label={`Số tập cho ${item.file.name}`}
                          />
                        </div>
                        <div className={styles.fileTitleCol}>
                          <label className={styles.miniLabel}>Tên tập hiển thị</label>
                          <input
                            type="text"
                            className={styles.miniTextInput}
                            value={item.title}
                            onChange={(e) => handleTitleChange(idx, e.target.value)}
                            aria-label={`Tên tập cho ${item.file.name}`}
                          />
                          <div className={styles.fileNameHint}>{item.file.name}</div>
                        </div>
                        <button
                          type="button"
                          className={styles.removeFileBtn}
                          onClick={() => handleRemoveFile(idx)}
                          title="Bỏ file này"
                          aria-label="Bỏ file này"
                        >
                          <IconTrash size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                    placeholder="Ví dụ: Tiên Nghịch, Nhất Niệm Vĩnh Hằng..."
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
                <label className={styles.label}>Chất Lượng Tối Ưu Hóa (theo chiều rộng)</label>
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

              {/* Auto Upload Checkbox (shown only when logged in) */}
              {isLoggedIn && (
                <div className={styles.formGroup}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={autoUpload}
                      onChange={(e) => {
                        setAutoUpload(e.target.checked);
                        try {
                          localStorage.setItem('tcl_comic_auto_upload', String(e.target.checked));
                        } catch {}
                      }}
                    />
                    <span className={styles.checkboxContent}>
                      <IconCloudUpload size={16} />
                      <span>Tự động tải lên Cloud sau khi nhập xong</span>
                    </span>
                  </label>
                </div>
              )}
            </>
          ) : (
            /* Progress view during import */
            <div className={styles.progressContainer}>
              <div className={styles.progressPulseIcon}>
                <IconRefresh size={36} />
              </div>
              <h3 className={styles.progressTitle}>Đang xử lý truyện tranh...</h3>

              {progress && (
                <>
                  <div className={styles.progressSubtitle}>
                    {progress.volumeTitle && <strong>{progress.volumeTitle}</strong>}
                    {progress.totalVols > 1 && <span> (Tập {progress.currentVol}/{progress.totalVols})</span>}
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
                    <span>Dung lượng WebP: {formatMb(progress.currentBytes || 0)} MB</span>
                  </div>
                </>
              )}

              {encoderNotice && (
                <div className={styles.encoderNotice}>
                  <IconAlertTriangle size={15} />
                  <span>{encoderNotice}</span>
                </div>
              )}

              <p className={styles.progressNote}>
                Đang chuyển đổi trực tiếp trên trình duyệt, không tốn data mạng. Vui lòng giữ tab này mở.
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
                disabled={fileConfigs.length === 0}
              >
                Bắt Đầu Nhập ({fileConfigs.length} tập)
              </button>
            </>
          ) : (
            <button className={styles.cancelImportBtn} onClick={handleCancel}>
              <IconX size={16} />
              <span>Hủy Quá Trình Nhập</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
