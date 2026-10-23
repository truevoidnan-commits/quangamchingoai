import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createBackupData,
  parseAndVerifyBackupFile,
  analyzeBackupForPreview,
  performRestore,
  estimateBackupSize,
  getLastBackupTimestamp,
  isBackupOverdue,
  downloadOrShareBackupFile,
} from '../lib/backup/backupEngine.js';
import { getLibrary } from '../lib/storage.js';
import { getActiveProfile } from '../lib/cultivation.js';
import styles from './BackupPage.module.css';

export default function BackupPage() {
  const navigate = useNavigate();
  const profile = getActiveProfile();
  const isSandbox = profile === 'sandbox';

  // Active Tab: 'export' | 'import'
  const [activeTab, setActiveTab] = useState('export');

  // Last backup timestamp
  const [lastBackupAt, setLastBackupAt] = useState(() => getLastBackupTimestamp());

  // -------------------------------------------------------------
  // EXPORT STATE
  // -------------------------------------------------------------
  const [exportParts, setExportParts] = useState({
    novels: true,
    progress: true,
    cultivation: !isSandbox,
    settings: true,
    vault: true,
  });
  const [includeContent, setIncludeContent] = useState(true);
  const [availableNovels, setAvailableNovels] = useState([]);
  const [selectedNovelIds, setSelectedNovelIds] = useState(new Set());
  const [selectAllNovels, setSelectAllNovels] = useState(true);
  const [confirmHiddenExport, setConfirmHiddenExport] = useState(false);
  const [estimatedSize, setEstimatedSize] = useState({ rawBytes: 0, gzBytes: 0 });
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);
  const [exportSuccess, setExportSuccess] = useState(null);
  const [exportError, setExportError] = useState('');

  // -------------------------------------------------------------
  // IMPORT / RESTORE STATE
  // -------------------------------------------------------------
  const [importFile, setImportFile] = useState(null);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [importError, setImportError] = useState('');
  const [parsedBackup, setParsedBackup] = useState(null);
  const [previewData, setPreviewData] = useState(null);

  // Restore Configuration
  const [restoreMode, setRestoreMode] = useState('merge'); // 'merge' | 'replace'
  const [selectedRestoreParts, setSelectedRestoreParts] = useState({
    novels: true,
    progress: true,
    cultivation: false, // Default false to prevent accidental overwrite
    settings: false,
    vault: false,
  });
  const [selectedRestoreNovelIds, setSelectedRestoreNovelIds] = useState(new Set());
  const [titleConflictResolutions, setTitleConflictResolutions] = useState({});
  const [confirmCultivation, setConfirmCultivation] = useState(false);
  const [replaceConfirmInput, setReplaceConfirmInput] = useState('');
  const [deleteUnlistedNovels, setDeleteUnlistedNovels] = useState(false);
  const [autoBackupBeforeReplace, setAutoBackupBeforeReplace] = useState(true);

  // Restore Process
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(null);
  const [restoreReport, setRestoreReport] = useState(null);

  const fileInputRef = useRef(null);

  // Load library novels for export selection
  useEffect(() => {
    const list = getLibrary({ includeHidden: true });
    setAvailableNovels(list);
    setSelectedNovelIds(new Set(list.map(n => n.id)));
  }, []);

  // Update size estimation whenever options change
  useEffect(() => {
    let active = true;
    estimateBackupSize({
      includeContent,
      selectedNovelIds: selectAllNovels ? null : selectedNovelIds,
      parts: exportParts,
    }).then(res => {
      if (active) setEstimatedSize(res);
    });
    return () => { active = false; };
  }, [exportParts, includeContent, selectAllNovels, selectedNovelIds]);

  // Check if any selected novel is hidden in vault
  const hasSelectedHiddenNovels = availableNovels.some(
    n => n.isHidden && (selectAllNovels || selectedNovelIds.has(n.id))
  );

  // -------------------------------------------------------------
  // EXPORT HANDLER
  // -------------------------------------------------------------
  const handleStartExport = async () => {
    if (hasSelectedHiddenNovels && !confirmHiddenExport) {
      setExportError('Vui lòng xác nhận đồng ý xuất cả truyện ẩn trong Mật Thất.');
      return;
    }

    setIsExporting(true);
    setExportProgress({ current: 0, total: 1, title: 'Đang khởi tạo...' });
    setExportError('');
    setExportSuccess(null);

    try {
      const res = await createBackupData(
        {
          includeContent,
          selectedNovelIds: selectAllNovels ? null : selectedNovelIds,
          parts: exportParts,
        },
        (p) => setExportProgress(p)
      );

      setLastBackupAt(Date.now());
      setExportSuccess(res);

      // Trigger download / share
      if (res.blob) {
        await downloadOrShareBackupFile(res.blob, res.filename);
      }
    } catch (err) {
      console.error('Lỗi khi xuất sao lưu:', err);
      setExportError(err.message || 'Đã có lỗi xảy ra khi tạo file sao lưu.');
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  // -------------------------------------------------------------
  // IMPORT FILE SELECTION
  // -------------------------------------------------------------
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setIsReadingFile(true);
    setImportError('');
    setParsedBackup(null);
    setPreviewData(null);
    setRestoreReport(null);

    try {
      const parsed = await parseAndVerifyBackupFile(file);
      const preview = analyzeBackupForPreview(parsed);

      setParsedBackup(parsed);
      setPreviewData(preview);

      // Initialize selected restore novels
      const allFileNovelIds = new Set((parsed.parts?.novels || []).map(n => n.id));
      setSelectedRestoreNovelIds(allFileNovelIds);

      // Default restore parts
      setSelectedRestoreParts({
        novels: Boolean(parsed.parts?.novels?.length),
        progress: Boolean(parsed.parts?.progress?.length),
        cultivation: false,
        settings: false,
        vault: false,
      });
    } catch (err) {
      console.error('Lỗi kiểm tra file sao lưu:', err);
      setImportError(err.message || 'File sao lưu không hợp lệ.');
    } finally {
      setIsReadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // -------------------------------------------------------------
  // RESTORE HANDLER
  // -------------------------------------------------------------
  const handleStartRestore = async () => {
    if (!parsedBackup) return;

    if (restoreMode === 'replace' && replaceConfirmInput.trim().toUpperCase() !== 'THAY THE') {
      alert('Vui lòng gõ chính xác cụm từ "THAY THE" để xác nhận thay thế toàn bộ.');
      return;
    }

    if (selectedRestoreParts.cultivation && !confirmCultivation) {
      alert('Vui lòng đánh dấu xác nhận khôi phục tu vi.');
      return;
    }

    setIsRestoring(true);
    setRestoreProgress({ current: 0, total: 1, title: 'Đang bắt đầu khôi phục...' });
    setImportError('');

    try {
      // 1. Tự động tải bản sao lưu an toàn trước khi thay thế nếu được bật
      if (restoreMode === 'replace' && autoBackupBeforeReplace) {
        setRestoreProgress({ current: 0, total: 1, title: 'Đang tạo bản sao lưu an toàn trước khi thay thế...' });
        try {
          const safetyBackup = await createBackupData({
            includeContent: true,
            parts: {
              novels: true,
              progress: true,
              cultivation: profile === 'real',
              settings: true,
              vault: true,
            },
          });
          if (safetyBackup.blob) {
            const dlRes = await downloadOrShareBackupFile(safetyBackup.blob, safetyBackup.filename);
            if (!dlRes.downloaded && !dlRes.shared) {
              throw new Error('Thao tác tải hoặc chia sẻ file sao lưu an toàn đã bị hủy.');
            }
          }
        } catch (safetyErr) {
          console.error('Lỗi tạo sao lưu an toàn trước khi thay thế:', safetyErr);
          setImportError(`Không thể tạo hoặc tải bản sao lưu an toàn trước khi thay thế (${safetyErr.message}). Đã dừng khôi phục để bảo vệ dữ liệu.`);
          setIsRestoring(false);
          setRestoreProgress(null);
          return;
        }
      }

      const report = await performRestore(
        {
          backupObj: parsedBackup,
          mode: restoreMode,
          selectedParts: selectedRestoreParts,
          selectedNovelIds: selectedRestoreNovelIds,
          deleteUnlistedNovels: restoreMode === 'replace' && deleteUnlistedNovels,
          titleConflictResolutions,
          confirmCultivation,
        },
        (p) => setRestoreProgress(p)
      );

      setRestoreReport(report);
    } catch (err) {
      console.error('Lỗi khi khôi phục dữ liệu:', err);
      setImportError(err.message || 'Đã có lỗi xảy ra khi khôi phục dữ liệu.');
    } finally {
      setIsRestoring(false);
      setRestoreProgress(null);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTimestamp = (ts) => {
    if (!ts || ts <= 0) return 'Chưa từng sao lưu trên máy này';
    return new Date(ts).toLocaleString('vi-VN');
  };

  return (
    <div className={styles.page}>
      {/* Top navigation */}
      <div className={styles.navBar}>
        <Link to="/sync" className={styles.backLink}>
          ← Về Đồng Bộ Cloud
        </Link>
        <Link to="/" className={styles.backLink}>
          📖 Về Thư Viện
        </Link>
      </div>

      {/* Header */}
      <div className={styles.headerTitle}>
        <span className={styles.headerIcon}>💾</span>
        <div>
          <h1 className={styles.title}>Sao Lưu & Khôi Phục</h1>
          <div className={styles.subtitle}>
            Xuất/nhập tập tin dữ liệu an toàn trên thiết bị của bạn. Hoạt động độc lập với Cloud, không phụ thuộc vào Internet.
          </div>
        </div>
      </div>

      {/* Last backup info bar */}
      <div className={styles.lastBackupBar}>
        <div>
          🕒 <strong>Sao lưu gần nhất:</strong> {formatTimestamp(lastBackupAt)}
        </div>
        {isBackupOverdue(14) && (
          <span className={styles.overdueBadge}>⚠️ Đã quá 14 ngày</span>
        )}
      </div>

      {/* Tab Switcher */}
      <div className={styles.tabContainer}>
        <button
          className={`${styles.tabBtn} ${activeTab === 'export' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('export')}
        >
          📥 Sao Lưu (Xuất File)
        </button>
        <button
          className={`${styles.tabBtn} ${activeTab === 'import' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('import')}
        >
          📤 Khôi Phục (Nhập File)
        </button>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: SAO LƯU (EXPORT)                                   */}
      {/* ========================================================= */}
      {activeTab === 'export' && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>📦 Chọn Dữ Liệu Cần Xuất</h2>
          <div className={styles.sectionNote}>
            Dữ liệu sẽ được gói gọn vào một file nén <strong>.tclbackup.json.gz</strong> duy nhất, có mã kiểm tra SHA-256 chống hư hỏng file.
          </div>

          {exportError && <div className={styles.alertDanger}>{exportError}</div>}

          {/* Option: Novels */}
          <div className={styles.partOption} onClick={() => setExportParts(p => ({ ...p, novels: !p.novels }))}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={exportParts.novels}
              onChange={() => {}}
            />
            <div className={styles.partInfo}>
              <div className={styles.partTitle}>
                📚 Truyện Trong Thư Viện ({availableNovels.length} truyện)
              </div>
              <div className={styles.partDesc}>
                Bao gồm tên, tác giả, mô tả, ảnh bìa và danh sách chương.
              </div>
            </div>
          </div>

          {exportParts.novels && (
            <div style={{ marginLeft: 32, marginBottom: 16 }}>
              {/* Option: Include chapter content */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', color: '#cbd5e1', cursor: 'pointer', marginBottom: 10 }}>
                <input
                  type="checkbox"
                  checked={includeContent}
                  onChange={(e) => setIncludeContent(e.target.checked)}
                  className={styles.checkbox}
                />
                <span><strong>Kèm toàn bộ nội dung văn bản của các chương</strong> (khuyên dùng để lưu trữ trọn vẹn)</span>
              </label>
              {!includeContent && (
                <div style={{ fontSize: '0.8rem', color: '#38bdf8', marginBottom: 10 }}>
                  💡 Chế độ "Chỉ danh sách + tiến độ" giúp file siêu nhẹ (~vài chục KB). Khi khôi phục bạn có thể đồng bộ lại nội dung từ Cloud.
                </div>
              )}

              {/* Novels selection */}
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: 6 }}>
                Chọn truyện xuất:
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = !selectAllNovels;
                    setSelectAllNovels(next);
                    if (next) setSelectedNovelIds(new Set(availableNovels.map(n => n.id)));
                    else setSelectedNovelIds(new Set());
                  }}
                  style={{ background: 'none', border: 'none', color: '#38bdf8', cursor: 'pointer', marginLeft: 8, textDecoration: 'underline' }}
                >
                  {selectAllNovels ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                </button>
              </div>

              <div className={styles.novelListCard}>
                {availableNovels.map((novel) => {
                  const isChecked = selectAllNovels || selectedNovelIds.has(novel.id);
                  return (
                    <div key={novel.id} className={styles.novelItemRow}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={isChecked}
                          onChange={(e) => {
                            const newSet = new Set(selectedNovelIds);
                            if (e.target.checked) newSet.add(novel.id);
                            else newSet.delete(novel.id);
                            setSelectedNovelIds(newSet);
                            setSelectAllNovels(newSet.size === availableNovels.length);
                          }}
                        />
                        <span>{novel.title}</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {novel.isHidden && <span className={styles.badgeHidden}>🔒 Mật Thất</span>}
                        <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>{novel.chapterCount || 0}c</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Option: Reading Progress */}
          <div className={styles.partOption} onClick={() => setExportParts(p => ({ ...p, progress: !p.progress }))}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={exportParts.progress}
              onChange={() => {}}
            />
            <div className={styles.partInfo}>
              <div className={styles.partTitle}>
                🔖 Tiến Độ Đọc
              </div>
              <div className={styles.partDesc}>
                Vị trí cuộn trang, đoạn văn và chương đang đọc dở của từng truyện.
              </div>
            </div>
          </div>

          {/* Option: Cultivation */}
          <div
            className={`${styles.partOption} ${isSandbox ? styles.partOptionDisabled : ''}`}
            onClick={() => {
              if (!isSandbox) setExportParts(p => ({ ...p, cultivation: !p.cultivation }));
            }}
          >
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={exportParts.cultivation && !isSandbox}
              disabled={isSandbox}
              onChange={() => {}}
            />
            <div className={styles.partInfo}>
              <div className={styles.partTitle}>
                ⚡ Tu Vi & Thời Gian Ngộ Đạo Đang Chờ
                {isSandbox && <span className={styles.overdueBadge}>Chỉ dành cho Hồ sơ Thật</span>}
              </div>
              <div className={styles.partDesc}>
                Cảnh giới, điểm tu vi, thiên mệnh, số mệnh hỏa và giây ngộ đạo đang chờ.
                {isSandbox && ' (Bạn đang ở Hồ sơ Sandbox nên phần này bị tắt để bảo vệ dữ liệu).'}
              </div>
            </div>
          </div>

          {/* Option: Settings */}
          <div className={styles.partOption} onClick={() => setExportParts(p => ({ ...p, settings: !p.settings }))}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={exportParts.settings}
              onChange={() => {}}
            />
            <div className={styles.partInfo}>
              <div className={styles.partTitle}>
                ⚙️ Cài Đặt Đọc
              </div>
              <div className={styles.partDesc}>
                Cỡ chữ, kiểu font, giãn dòng, khoảng cách đoạn và giao diện nền sáng/tối.
              </div>
            </div>
          </div>

          {/* Option: Vault */}
          <div className={styles.partOption} onClick={() => setExportParts(p => ({ ...p, vault: !p.vault }))}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={exportParts.vault}
              onChange={() => {}}
            />
            <div className={styles.partInfo}>
              <div className={styles.partTitle}>
                🔒 Tàng Kinh Mật Thất
              </div>
              <div className={styles.partDesc}>
                Mã băm mật khẩu, gợi ý mật khẩu và trạng thái bảo vệ mật thất.
              </div>
            </div>
          </div>

          {/* Hidden novels warning if selected */}
          {hasSelectedHiddenNovels && (
            <div className={styles.alertWarning}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                ⚠️ Cảnh báo bảo mật truyện ẩn:
              </div>
              <div>
                Bạn đã chọn sao lưu truyện thuộc <strong>Tàng Kinh Mật Thất</strong>. Lưu ý rằng file sao lưu này <strong>KHÔNG ĐƯỢC MÃ HÓA</strong>; bất kỳ ai có file này đều có thể mở và đọc được các truyện ẩn.
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={confirmHiddenExport}
                  onChange={(e) => setConfirmHiddenExport(e.target.checked)}
                />
                <span>Tôi đã hiểu và đồng ý xuất cả truyện ẩn trong Mật Thất</span>
              </label>
            </div>
          )}

          {/* Estimated size */}
          <div className={styles.estimateSection}>
            <div className={styles.estimateLabel}>
              Dung lượng ước tính:
            </div>
            <div className={styles.estimateValue}>
              ~{formatBytes(estimatedSize.gzBytes)} (.gz)
              <span style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 'normal', marginLeft: 6 }}>
                (Gốc: ~{formatBytes(estimatedSize.rawBytes)})
              </span>
            </div>
          </div>

          {estimatedSize.rawBytes > 150 * 1024 * 1024 && (
            <div className={styles.alertWarning} style={{ marginTop: 12 }}>
              ⚠️ <strong>Cảnh báo dung lượng lớn:</strong> Dung lượng thô ước tính vượt quá 150MB ({formatBytes(estimatedSize.rawBytes)}). Trình duyệt có thể gặp hiện tượng quá tải bộ nhớ (tràn RAM) khi tạo file. Khuyên bạn nên chia nhỏ sao lưu theo từng nhóm truyện hoặc bỏ tùy chọn "Kèm toàn bộ nội dung văn bản của các chương".
            </div>
          )}

          {/* Progress bar */}
          {isExporting && exportProgress && (
            <div className={styles.progressContainer}>
              <div className={styles.progressLabel}>
                <span>{exportProgress.title || 'Đang đóng gói file sao lưu...'}</span>
                <span>{exportProgress.current} / {exportProgress.total}</span>
              </div>
              <div className={styles.progressBarTrack}>
                <div
                  className={styles.progressBarFill}
                  style={{
                    width: `${Math.round((exportProgress.current / Math.max(1, exportProgress.total)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Success card */}
          {exportSuccess && (
            <div className={styles.alertSuccess} style={{ marginTop: 20 }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>
                ✓ Xuất file sao lưu thành công!
              </div>
              <div style={{ fontSize: '0.88rem', marginBottom: 10 }}>
                Tên file: <code>{exportSuccess.filename}</code> ({formatBytes(exportSuccess.compressedSize)})
              </div>
              <button
                type="button"
                className={styles.btnPrimary}
                style={{ width: 'auto', padding: '8px 16px', fontSize: '0.88rem' }}
                onClick={() => downloadOrShareBackupFile(exportSuccess.blob, exportSuccess.filename)}
              >
                📥 Tải xuống / Chia sẻ lại file này
              </button>
            </div>
          )}

          {/* Export button */}
          <div style={{ marginTop: 24 }}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={handleStartExport}
              disabled={isExporting || (hasSelectedHiddenNovels && !confirmHiddenExport)}
            >
              {isExporting ? '⏳ Đang tạo file sao lưu...' : '💾 Bắt Đầu Xuất File Sao Lưu'}
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: KHÔI PHỤC (IMPORT)                                 */}
      {/* ========================================================= */}
      {activeTab === 'import' && (
        <div>
          {/* Step 1: Select file if no preview */}
          {!previewData && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>📂 Chọn File Sao Lưu Cần Khôi Phục</h2>
              <div className={styles.sectionNote}>
                Hỗ trợ cả định dạng file nén <code>.tclbackup.json.gz</code> và file JSON thường <code>.tclbackup.json</code>.
              </div>

              {importError && <div className={styles.alertDanger}>{importError}</div>}

              <div
                className={styles.dropzone}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className={styles.dropzoneIcon}>📁</div>
                <div className={styles.dropzoneText}>
                  {isReadingFile ? 'Đang đọc và kiểm tra tính toàn vẹn của file...' : 'Nhấn vào đây để chọn file sao lưu'}
                </div>
                <div className={styles.dropzoneSubtext}>
                  (Chấp nhận .json, .gz, .tclbackup.json.gz)
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                className={styles.fileInput}
                accept=".json,.gz,.tclbackup"
                onChange={handleFileChange}
              />
            </div>
          )}

          {/* Step 2: Preview & Configuration */}
          {previewData && !restoreReport && (
            <div className={styles.card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 className={styles.cardTitle} style={{ margin: 0 }}>🔍 Xem Trước Dữ Liệu File Sao Lưu</h2>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => {
                    setParsedBackup(null);
                    setPreviewData(null);
                    setImportFile(null);
                  }}
                >
                  ✕ Chọn file khác
                </button>
              </div>

              {importError && <div className={styles.alertDanger}>{importError}</div>}

              {/* File Info Bar */}
              <div className={styles.alertInfo}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                  <div>📅 <strong>Ngày xuất:</strong> {new Date(previewData.exportedAt).toLocaleString('vi-VN')}</div>
                  <div>🏷️ <strong>Hồ sơ gốc:</strong> {previewData.profile === 'real' ? 'Hồ Sơ Thật' : 'Hồ Sơ Sandbox'}</div>
                  <div>📚 <strong>Tổng truyện:</strong> {previewData.totalNovelsInBackup}</div>
                  <div>📖 <strong>Tổng chương:</strong> {previewData.totalChaptersInBackup}</div>
                </div>
              </div>

              {/* Mode Selection */}
              <div style={{ marginTop: 20, marginBottom: 12 }}>
                <label style={{ fontWeight: 700, fontSize: '0.95rem', color: '#f1f5f9' }}>
                  Chọn Chế Độ Khôi Phục:
                </label>
              </div>

              <div className={styles.modeSelector}>
                <div
                  className={`${styles.modeOption} ${restoreMode === 'merge' ? styles.modeOptionActive : ''}`}
                  onClick={() => setRestoreMode('merge')}
                >
                  <div className={styles.modeTitle}>
                    <input
                      type="radio"
                      name="restoreMode"
                      checked={restoreMode === 'merge'}
                      onChange={() => setRestoreMode('merge')}
                    />
                    <span>GỘP (Khuyên dùng)</span>
                  </div>
                  <div className={styles.modeDesc}>
                    Thêm truyện chưa có, giữ nguyên truyện trên máy. Truyện đã có chỉ cập nhật nếu bản trong file có ngày sửa đổi mới hơn. Các chương có trên máy mà file không có sẽ được giữ lại nguyên vẹn.
                  </div>
                </div>

                <div
                  className={`${styles.modeOption} ${restoreMode === 'replace' ? styles.modeOptionActive : ''}`}
                  onClick={() => setRestoreMode('replace')}
                >
                  <div className={styles.modeTitle} style={{ color: '#f87171' }}>
                    <input
                      type="radio"
                      name="restoreMode"
                      checked={restoreMode === 'replace'}
                      onChange={() => setRestoreMode('replace')}
                    />
                    <span>THAY THẾ TOÀN BỘ</span>
                  </div>
                  <div className={styles.modeDesc}>
                    Thay thế toàn bộ các phần được chọn bằng dữ liệu từ file sao lưu. Mặc định không xóa truyện trên máy không có trong file trừ khi bạn chủ động chọn.
                  </div>
                </div>
              </div>

              {/* Replace Mode Safeguards & Confirmation */}
              {restoreMode === 'replace' && (() => {
                const fileNovelIds = new Set((parsedBackup?.parts?.novels || []).map(n => n.id));
                const selectedRestoreNovelIdsSet = selectedRestoreNovelIds ? new Set(selectedRestoreNovelIds) : null;
                const novelsToDelete = availableNovels.filter(n => !fileNovelIds.has(n.id) && (!selectedRestoreNovelIdsSet || !selectedRestoreNovelIdsSet.has(n.id)));

                return (
                  <div className={styles.alertDanger} style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6, fontSize: '0.95rem' }}>
                      ⚠️ Cảnh báo chế độ Thay Thế Toàn Bộ:
                    </div>
                    <div style={{ fontSize: '0.88rem', marginBottom: 12, lineHeight: 1.5 }}>
                      Chế độ này sẽ thay thế các mục đã chọn trên máy bằng dữ liệu từ file sao lưu. Hệ thống sẽ tự động lưu ảnh chụp tu vi an toàn trước khi thay thế.
                    </div>

                    {/* Option 1: Auto backup before replace (default true) */}
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginBottom: 10, fontSize: '0.88rem', color: '#f1f5f9' }}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={autoBackupBeforeReplace}
                        onChange={(e) => setAutoBackupBeforeReplace(e.target.checked)}
                      />
                      <span>
                        🛡️ <strong>Tải bản sao lưu dữ liệu hiện tại về máy trước khi thay thế</strong> (Khuyên dùng để phòng ngừa rủi ro mất dữ liệu).
                      </span>
                    </label>

                    {/* Option 2: Delete unlisted novels (default false) */}
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', marginBottom: 10, fontSize: '0.88rem', color: '#fca5a5' }}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={deleteUnlistedNovels}
                        onChange={(e) => setDeleteUnlistedNovels(e.target.checked)}
                      />
                      <span>
                        🗑️ <strong>Cũng xóa các truyện trên máy không có trong file</strong> (Mặc định: KHÔNG xóa).
                      </span>
                    </label>

                    {/* If deleteUnlistedNovels is checked: preview novels to be deleted */}
                    {deleteUnlistedNovels && (
                      <div style={{ marginTop: 10, padding: 12, background: 'rgba(0, 0, 0, 0.4)', borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                        <div style={{ fontWeight: 700, color: '#f87171', marginBottom: 6 }}>
                          🚨 Danh sách truyện trên máy sẽ bị XÓA ({novelsToDelete.length} truyện):
                        </div>
                        {novelsToDelete.length > 0 ? (
                          <ul style={{ margin: '0 0 8px 0', paddingLeft: 20, maxHeight: 160, overflowY: 'auto' }}>
                            {novelsToDelete.map(n => (
                              <li key={n.id} style={{ fontSize: '0.85rem', color: '#fecaca', marginBottom: 2 }}>
                                <strong>{n.title}</strong> — {n.chapterCount || n.totalChapters || 0} chương
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: 6 }}>
                            (Không có truyện nào trên máy nằm ngoài file sao lưu).
                          </div>
                        )}
                        <div style={{ fontSize: '0.82rem', color: '#f87171', lineHeight: 1.4 }}>
                          ⚠️ <strong>Lưu ý:</strong> Việc xóa các truyện này sẽ được ghi nhận bia mộ (tombstone) và tự động đồng bộ xóa lên Cloud cũng như các thiết bị khác ở lần đồng bộ tiếp theo.
                        </div>
                      </div>
                    )}

                    {/* Typing confirmation */}
                    <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid rgba(239, 68, 68, 0.3)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.88rem' }}>Nhập chính xác cụm từ <strong>THAY THE</strong> để mở khóa:</span>
                      <input
                        type="text"
                        className={styles.input}
                        style={{ maxWidth: 160, padding: '6px 10px', background: '#0f172a', border: '1px solid #ef4444', color: '#fff' }}
                        placeholder="THAY THE"
                        value={replaceConfirmInput}
                        onChange={(e) => setReplaceConfirmInput(e.target.value)}
                      />
                    </div>
                  </div>
                );
              })()}

              {/* Parts Selection & Comparison */}
              <div style={{ marginTop: 24 }}>
                <h3 style={{ fontSize: '1.05rem', color: '#38bdf8', marginBottom: 12 }}>
                  Danh Sách Chi Tiết Các Phần
                </h3>

                {/* 1. Novels */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={selectedRestoreParts.novels}
                      onChange={(e) => setSelectedRestoreParts(p => ({ ...p, novels: e.target.checked }))}
                    />
                    <span>📚 Truyện Trong Thư Viện ({previewData.novels.length})</span>
                  </label>

                  {selectedRestoreParts.novels && previewData.novels.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                      <table className={styles.previewTable}>
                        <thead>
                          <tr>
                            <th style={{ width: 40 }}>Chọn</th>
                            <th>Tên truyện</th>
                            <th>Số chương</th>
                            <th>Trạng thái</th>
                            <th>Xử lý</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.novels.map(({ novel, local, status, chapterCount, hasContent }) => {
                            const isChecked = selectedRestoreNovelIds.has(novel.id);
                            return (
                              <tr key={novel.id}>
                                <td>
                                  <input
                                    type="checkbox"
                                    className={styles.checkbox}
                                    checked={isChecked}
                                    onChange={(e) => {
                                      const newSet = new Set(selectedRestoreNovelIds);
                                      if (e.target.checked) newSet.add(novel.id);
                                      else newSet.delete(novel.id);
                                      setSelectedRestoreNovelIds(newSet);
                                    }}
                                  />
                                </td>
                                <td>
                                  <div style={{ fontWeight: 600 }}>{novel.title}</div>
                                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                    {novel.author || 'Khuyết danh'} {novel.isHidden && '· 🔒 Ẩn'}
                                  </div>
                                </td>
                                <td>
                                  {chapterCount}c {hasContent ? '(có nội dung)' : '(chỉ ds)'}
                                </td>
                                <td>
                                  {status === 'new' && <span className={`${styles.statusBadge} ${styles.statusNew}`}>Mới</span>}
                                  {status === 'newer' && <span className={`${styles.statusBadge} ${styles.statusNewer}`}>Bản mới hơn</span>}
                                  {status === 'older' && <span className={`${styles.statusBadge} ${styles.statusOlder}`}>Cũ hơn máy</span>}
                                  {status === 'identical' && <span className={`${styles.statusBadge} ${styles.statusIdentical}`}>Giống hệt</span>}
                                  {status === 'title_conflict' && <span className={`${styles.statusBadge} ${styles.statusConflict}`}>Trùng tên</span>}
                                </td>
                                <td>
                                  {status === 'title_conflict' && (
                                    <select
                                      value={titleConflictResolutions[novel.id] || 'skip'}
                                      onChange={(e) => setTitleConflictResolutions(r => ({ ...r, [novel.id]: e.target.value }))}
                                      style={{ background: '#1e293b', color: '#fff', border: '1px solid #64748b', borderRadius: 4, padding: '2px 6px', fontSize: '0.8rem' }}
                                    >
                                      <option value="skip">Bỏ qua (Mặc định)</option>
                                      <option value="overwrite">Ghi đè truyện cũ</option>
                                      <option value="create_new">Tạo truyện mới</option>
                                    </select>
                                  )}
                                  {status !== 'title_conflict' && (
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                      {status === 'older' && restoreMode === 'merge' ? 'Sẽ bỏ qua (máy mới hơn)' : 'Sẽ nhập'}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {restoreMode === 'merge' && (
                        <div style={{ fontSize: '0.8rem', color: '#38bdf8', marginTop: 8 }}>
                          💡 <strong>Ghi chú chế độ Gộp:</strong> Nếu truyện đã có trên máy, chỉ ghi đè khi bản trong file mới hơn. Nếu trên máy có các chương mà file sao lưu không có, các chương đó vẫn được giữ lại nguyên vẹn.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. Progress */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={selectedRestoreParts.progress}
                      onChange={(e) => setSelectedRestoreParts(p => ({ ...p, progress: e.target.checked }))}
                    />
                    <span>🔖 Tiến Độ Đọc (Vị trí cuộn trang & chương đang đọc)</span>
                  </label>
                </div>

                {/* 3. Cultivation */}
                {previewData.cultivation && (
                  <div style={{ marginBottom: 20, padding: 14, background: 'rgba(30, 41, 59, 0.4)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={selectedRestoreParts.cultivation}
                        disabled={previewData.cultivation.isSandboxBlocked}
                        onChange={(e) => setSelectedRestoreParts(p => ({ ...p, cultivation: e.target.checked }))}
                      />
                      <span>⚡ Tu Vi & Hồ Sơ Tu Luyện</span>
                    </label>

                    {previewData.cultivation.isSandboxBlocked ? (
                      <div className={styles.alertWarning} style={{ margin: '8px 0 0 0' }}>
                        🚫 Hồ sơ Thử Nghiệm (Sandbox) không thể khôi phục tu vi. Hãy chuyển sang Hồ sơ Thật nếu muốn khôi phục.
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: 8 }}>
                          So sánh Tu Vi trên máy và trong file:
                        </div>
                        <table className={styles.compareTable}>
                          <thead>
                            <tr>
                              <th>Chỉ số</th>
                              <th>Trên máy hiện tại</th>
                              <th>Trong file sao lưu</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td>Cảnh giới</td>
                              <td>{previewData.cultivation.local.realm || 'Ngưng Khí'}</td>
                              <td style={{ color: '#38bdf8', fontWeight: 600 }}>{previewData.cultivation.file.realm || 'Ngưng Khí'}</td>
                            </tr>
                            <tr>
                              <td>Tầng / Pháp Khiếu</td>
                              <td>{previewData.cultivation.local.level || '1'}</td>
                              <td>{previewData.cultivation.file.level || '1'}</td>
                            </tr>
                            <tr>
                              <td>Tu Vi (EXP)</td>
                              <td>{previewData.cultivation.local.exp || 0}</td>
                              <td>{previewData.cultivation.file.exp || 0}</td>
                            </tr>
                            <tr>
                              <td>Thiên Mệnh</td>
                              <td>{previewData.cultivation.local.thienMenh || 0}</td>
                              <td>{previewData.cultivation.file.thienMenh || 0}</td>
                            </tr>
                            <tr>
                              <td>Bản ghi (_rev)</td>
                              <td>{previewData.cultivation.local.rev}</td>
                              <td>{previewData.cultivation.file.rev}</td>
                            </tr>
                          </tbody>
                        </table>

                        {selectedRestoreParts.cultivation && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer', color: '#fef08a', fontSize: '0.88rem' }}>
                            <input
                              type="checkbox"
                              className={styles.checkbox}
                              checked={confirmCultivation}
                              onChange={(e) => setConfirmCultivation(e.target.checked)}
                            />
                            <span><strong>Tôi xác nhận muốn khôi phục bản Tu Vi từ file này</strong> (Bản ghi _rev sẽ được tăng cao hơn để Cloud chấp nhận)</span>
                          </label>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* 4. Settings */}
                {previewData.settings && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={selectedRestoreParts.settings}
                        onChange={(e) => setSelectedRestoreParts(p => ({ ...p, settings: e.target.checked }))}
                      />
                      <span>⚙️ Cài Đặt Đọc (Font, cỡ chữ, giao diện nền) {previewData.settings.isDifferent && '(Khác với máy)'}</span>
                    </label>
                  </div>
                )}

                {/* 5. Vault */}
                {previewData.vault && (
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={selectedRestoreParts.vault}
                        onChange={(e) => setSelectedRestoreParts(p => ({ ...p, vault: e.target.checked }))}
                      />
                      <span>🔒 Mật Khẩu Tàng Kinh Mật Thất {previewData.vault.isDifferent && '(Khác với máy)'}</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Progress Bar */}
              {isRestoring && restoreProgress && (
                <div className={styles.progressContainer}>
                  <div className={styles.progressLabel}>
                    <span>{restoreProgress.title || 'Đang khôi phục dữ liệu...'}</span>
                    <span>{restoreProgress.current} / {restoreProgress.total}</span>
                  </div>
                  <div className={styles.progressBarTrack}>
                    <div
                      className={styles.progressBarFill}
                      style={{
                        width: `${Math.round((restoreProgress.current / Math.max(1, restoreProgress.total)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Restore Action Button */}
              <div style={{ marginTop: 24 }}>
                <button
                  type="button"
                  className={restoreMode === 'replace' ? styles.btnDanger : styles.btnPrimary}
                  onClick={handleStartRestore}
                  disabled={
                    isRestoring ||
                    (restoreMode === 'replace' && replaceConfirmInput.trim().toUpperCase() !== 'THAY THE') ||
                    (selectedRestoreParts.cultivation && !confirmCultivation)
                  }
                >
                  {isRestoring
                    ? '⏳ Đang khôi phục...'
                    : (restoreMode === 'replace' ? '⚠️ Xác Nhận Thay Thế Toàn Bộ' : '🚀 Bắt Đầu Khôi Phục (Gộp)')
                  }
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Result Report */}
          {restoreReport && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle} style={{ color: '#34d399' }}>
                🎉 Khôi Phục Dữ Liệu Hoàn Tất!
              </h2>

              <div className={styles.resultGrid}>
                <div className={styles.resultCard}>
                  <div className={styles.resultNumber}>{restoreReport.addedNovels}</div>
                  <div className={styles.resultLabel}>Truyện mới đã thêm</div>
                </div>
                <div className={styles.resultCard}>
                  <div className={styles.resultNumber}>{restoreReport.updatedNovels}</div>
                  <div className={styles.resultLabel}>Truyện đã cập nhật</div>
                </div>
                <div className={styles.resultCard}>
                  <div className={styles.resultNumber} style={{ color: '#94a3b8' }}>{restoreReport.skippedNovels}</div>
                  <div className={styles.resultLabel}>Truyện cũ hơn bỏ qua</div>
                </div>
                <div className={styles.resultCard}>
                  <div className={styles.resultNumber}>{restoreReport.progressRestored}</div>
                  <div className={styles.resultLabel}>Tiến độ đọc đã khôi phục</div>
                </div>
                {restoreReport.deletedNovels > 0 && (
                  <div className={styles.resultCard}>
                    <div className={styles.resultNumber} style={{ color: '#f87171' }}>{restoreReport.deletedNovels}</div>
                    <div className={styles.resultLabel}>Truyện ngoài file đã xóa</div>
                  </div>
                )}
              </div>

              <div style={{ fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 1.6, marginTop: 12 }}>
                {restoreReport.cultivationRestored && <div>⚡ <strong>Tu vi:</strong> Đã khôi phục thành công.</div>}
                {restoreReport.settingsRestored && <div>⚙️ <strong>Cài đặt đọc:</strong> Đã cập nhật.</div>}
                {restoreReport.vaultRestored && <div>🔒 <strong>Mật thất:</strong> Đã cập nhật mật khẩu.</div>}
                {restoreReport.skippedInvalidKeys > 0 && (
                  <div style={{ color: '#fbbf24' }}>
                    🛡️ Đã bỏ qua {restoreReport.skippedInvalidKeys} khóa không hợp lệ ngoài allowlist.
                  </div>
                )}
              </div>

              {restoreReport.errors.length > 0 && (
                <div className={styles.alertDanger} style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Một số lỗi nhỏ ghi nhận:</div>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {restoreReport.errors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={styles.alertInfo} style={{ marginTop: 20 }}>
                💡 <strong>Đồng bộ Cloud:</strong> Toàn bộ truyện và tiến độ đọc vừa khôi phục đã được cấp nhãn thời gian mới nhất (causal timestamp) và sẽ tự động được đẩy lên Cloud ở lần đồng bộ tiếp theo.
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  style={{ flex: 1 }}
                  onClick={() => navigate('/')}
                >
                  📖 Về Thư Viện Đọc Truyện
                </button>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  style={{ flex: 1 }}
                  onClick={() => navigate('/sync')}
                >
                  ☁️ Mở Trang Đồng Bộ Cloud
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
