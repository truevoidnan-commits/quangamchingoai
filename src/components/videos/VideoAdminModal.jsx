import React, { useState, useEffect, useRef } from 'react';
import {
  IconFilm,
  IconUpload,
  IconCheck,
  IconAlertTriangle,
  IconX,
  IconSubtitles,
  IconHardDrive,
} from './VideoIcons';
import {
  createVideoSeries,
  updateVideoSeries,
  createVideoEpisode,
  prepareVideoEpisodeForUpload,
  updateVideoEpisode,
  addVideoSubtitle,
} from '../../lib/video/videoApi';
import {
  uploadSeriesPoster,
  uploadVideoMultipart,
  uploadEpisodeSubtitle,
  fetchStorageStats,
  testR2Connection,
} from '../../lib/video/videoCloud';
import styles from './VideoAdminModal.module.css';

function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return 'Không xác định';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function VideoAdminModal({
  isOpen,
  onClose,
  initialSeries = null,
  onSuccess = null,
}) {
  const [activeTab, setActiveTab] = useState('series'); // 'series' | 'episode' | 'subtitle'
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Series form state
  const [seriesTitle, setSeriesTitle] = useState('');
  const [seriesDescription, setSeriesDescription] = useState('');
  const [seriesGenres, setSeriesGenres] = useState('');
  const [seriesStatus, setSeriesStatus] = useState('ongoing');
  const [seriesPublished, setSeriesPublished] = useState(false);
  const [posterFile, setPosterFile] = useState(null);
  const [posterPreview, setPosterPreview] = useState('');

  // Episode form state
  const [createdSeriesId, setCreatedSeriesId] = useState(null);
  const [episodeNumber, setEpisodeNumber] = useState(1);
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [episodeDescription, setEpisodeDescription] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const [episodePublished, setEpisodePublished] = useState(false);

  // Subtitle form state
  const [createdEpisodeId, setCreatedEpisodeId] = useState(null);
  const [subtitleFile, setSubtitleFile] = useState(null);
  const [subtitleLang, setSubtitleLang] = useState('vi');
  const [subtitleLabel, setSubtitleLabel] = useState('Tiếng Việt');

  // Storage and Upload Progress State
  const [storageStats, setStorageStats] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null); // { percent, loaded, total, partIndex, totalParts, speedBytesPerSec }
  const [r2TestResult, setR2TestResult] = useState(null);
  const [r2Testing, setR2Testing] = useState(false);
  const abortControllerRef = useRef(null);

  const handleTestR2Connection = async () => {
    setR2Testing(true);
    setR2TestResult(null);
    try {
      const res = await testR2Connection();
      setR2TestResult(res);
    } catch (err) {
      setR2TestResult({
        ok: false,
        error: err.message || 'Lỗi kiểm tra kết nối R2',
        code: err.code,
        stage: err.stage || err.code || 'R2_FAIL',
        runtimeDiagnostics: err.runtimeDiagnostics,
      });
    } finally {
      setR2Testing(false);
    }
  };

  // Load storage stats & populate initialSeries if editing
  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      setSuccessMsg('');
      fetchStorageStats().then(setStorageStats);

      if (initialSeries) {
        setCreatedSeriesId(initialSeries.id);
        setSeriesTitle(initialSeries.title || '');
        setSeriesDescription(initialSeries.description || '');
        setSeriesGenres(Array.isArray(initialSeries.genres) ? initialSeries.genres.join(', ') : '');
        setSeriesStatus(initialSeries.status || 'ongoing');
        setSeriesPublished(Boolean(initialSeries.published));
        setPosterPreview(initialSeries.poster_key || '');
      } else {
        setCreatedSeriesId(null);
        setSeriesTitle('');
        setSeriesDescription('');
        setSeriesGenres('');
        setSeriesStatus('ongoing');
        setSeriesPublished(false);
        setPosterFile(null);
        setPosterPreview('');
      }
    }
  }, [isOpen, initialSeries]);

  if (!isOpen) return null;

  // Handle poster file selection
  const handlePosterSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setPosterFile(file);
      setPosterPreview(URL.createObjectURL(file));
    }
  };

  // Handle MP4 file selection
  const handleVideoSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.mp4') && file.type !== 'video/mp4') {
        setErrorMsg('Vui lòng chọn tệp định dạng MP4 (video/mp4).');
        return;
      }
      setVideoFile(file);
      setErrorMsg('');
    }
  };

  // Handle Subtitle file selection
  const handleSubtitleSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.vtt')) {
        setErrorMsg('Phụ đề phải là định dạng WebVTT (.vtt).');
        return;
      }
      setSubtitleFile(file);
      setErrorMsg('');
    }
  };

  // Projected storage calculations
  const currentVideoBytes = storageStats?.actualR2VideoBytes ?? storageStats?.dbTrackedVideoBytes ?? 0;
  const isR2Verified = Boolean(storageStats?.isR2ActualAvailable);
  const comicBytes = storageStats?.comicStorageBytesEstimated ?? (1.2 * 1024 * 1024 * 1024);
  const selectedFileBytes = videoFile?.size || 0;
  const projectedTotal = currentVideoBytes + comicBytes + selectedFileBytes;
  const WARNING_LIMIT = 8 * 1024 * 1024 * 1024; // 8GB
  const isThresholdAlert = projectedTotal >= WARNING_LIMIT;

  // 1. Submit Series
  const handleSubmitSeries = async (e) => {
    e.preventDefault();
    if (!seriesTitle.trim()) {
      setErrorMsg('Vui lòng nhập tên bộ phim.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const genresArray = seriesGenres
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      let savedSeries;
      if (initialSeries) {
        savedSeries = await updateVideoSeries(initialSeries.id, {
          title: seriesTitle.trim(),
          description: seriesDescription.trim(),
          genres: genresArray,
          status: seriesStatus,
          published: seriesPublished,
        });
      } else {
        savedSeries = await createVideoSeries({
          title: seriesTitle.trim(),
          description: seriesDescription.trim(),
          genres: genresArray,
          status: seriesStatus,
          published: seriesPublished,
        });
      }

      setCreatedSeriesId(savedSeries.id);

      // Upload poster if chosen
      if (posterFile) {
        setSuccessMsg('Đang tải ảnh bìa lên R2...');
        const { r2Key } = await uploadSeriesPoster(savedSeries.id, posterFile);
        await updateVideoSeries(savedSeries.id, { poster_key: r2Key });
      }

      setSuccessMsg('Lưu thông tin bộ phim thành công!');
      if (onSuccess) onSuccess(savedSeries);

      // Move to episode tab if this is a new series
      if (!initialSeries) {
        setTimeout(() => {
          setActiveTab('episode');
          setSuccessMsg('');
        }, 1200);
      }
    } catch (err) {
      console.error('[AdminModal] Error saving series:', err);
      setErrorMsg(err.message || 'Lỗi khi lưu bộ phim');
    } finally {
      setSubmitting(false);
    }
  };

  // 2. Submit Episode and Multipart Upload MP4
  const handleUploadEpisode = async (e) => {
    e.preventDefault();
    const seriesId = createdSeriesId || initialSeries?.id;
    if (!seriesId) {
      setErrorMsg('Chưa xác định bộ phim. Vui lòng lưu bộ phim trước.');
      return;
    }
    if (!videoFile) {
      setErrorMsg('Vui lòng chọn tệp MP4 từ máy tính.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');
    setUploadProgress({ percent: 0, loaded: 0, total: videoFile.size, partIndex: 1, totalParts: 1 });

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let episode = null;

    try {
      // Prepare episode shell (supports clean retry on previous incomplete uploads without uq_series_episode error)
      episode = await prepareVideoEpisodeForUpload({
        seriesId,
        episodeNumber: Number(episodeNumber),
        title: episodeTitle.trim() || `Tập ${episodeNumber}`,
        description: episodeDescription.trim(),
        mimeType: videoFile.type || 'video/mp4',
        published: episodePublished,
      });

      setCreatedEpisodeId(episode.id);

      // Start Multipart Upload directly to R2
      const uploadResult = await uploadVideoMultipart({
        seriesId,
        episodeId: episode.id,
        file: videoFile,
        signal: controller.signal,
        onProgress: (prog) => {
          setUploadProgress(prog);
        },
      });

      // Update episode status
      await updateVideoEpisode(seriesId, episode.id, {
        upload_status: 'ready',
        duration_seconds: 0, // Duration will be detected when played
        published: episodePublished,
      });

      setSuccessMsg(`Tải lên tập ${episodeNumber} thành công và đã sẵn sàng!`);
      if (onSuccess) onSuccess();

      // Reset episode form for next upload
      setVideoFile(null);
      setEpisodeNumber((prev) => Number(prev) + 1);
      setEpisodeTitle('');
      setUploadProgress(null);
    } catch (err) {
      console.error('[AdminModal] Upload error:', err);
      setErrorMsg(err.message || 'Lỗi khi tải tập phim lên R2');
      setUploadProgress(null);
      if (episode?.id) {
        updateVideoEpisode(seriesId, episode.id, { upload_status: 'failed' }).catch(() => {});
      }
    } finally {
      setSubmitting(false);
      abortControllerRef.current = null;
    }
  };

  // 3. Cancel Ongoing Upload
  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setUploadProgress(null);
      setErrorMsg('Đã hủy quá trình tải lên.');
      setSubmitting(false);
    }
  };

  // 4. Submit Subtitle
  const handleUploadSubtitle = async (e) => {
    e.preventDefault();
    const seriesId = createdSeriesId || initialSeries?.id;
    if (!seriesId || !createdEpisodeId) {
      setErrorMsg('Cần chọn bộ phim và tập phim để gắn phụ đề.');
      return;
    }
    if (!subtitleFile) {
      setErrorMsg('Vui lòng chọn tệp phụ đề .vtt');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const { r2Key } = await uploadEpisodeSubtitle(seriesId, createdEpisodeId, subtitleFile, {
        languageCode: subtitleLang,
        label: subtitleLabel,
      });

      await addVideoSubtitle({
        seriesId,
        episodeId: createdEpisodeId,
        languageCode: subtitleLang,
        label: subtitleLabel,
        r2Key,
      });

      setSuccessMsg('Tải lên phụ đề tiếng Việt thành công!');
      setSubtitleFile(null);
    } catch (err) {
      console.error('[AdminModal] Subtitle upload error:', err);
      setErrorMsg(err.message || 'Lỗi khi tải phụ đề');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>
            <IconFilm size={20} />
            {initialSeries ? 'Chỉnh sửa bộ phim' : 'Thêm mới bộ phim'}
          </h2>
          <button className={styles.closeBtn} onClick={onClose} disabled={submitting}>
            <IconX size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'series' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('series')}
            disabled={submitting}
          >
            1. Bộ phim & Ảnh bìa
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'episode' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('episode')}
            disabled={submitting || (!createdSeriesId && !initialSeries)}
          >
            2. Tập phim & Upload MP4
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'subtitle' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('subtitle')}
            disabled={submitting || !createdEpisodeId}
          >
            3. Phụ đề WebVTT
          </button>
        </div>

        {/* Status Messages */}
        {errorMsg && (
          <div className={styles.alertBanner} style={{ margin: '16px 20px 0' }}>
            <IconAlertTriangle size={18} className={styles.alertIcon} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div
            className={styles.alertBanner}
            style={{
              margin: '16px 20px 0',
              background: 'rgba(34, 197, 94, 0.15)',
              borderColor: 'rgba(34, 197, 94, 0.4)',
              color: '#86efac',
            }}
          >
            <IconCheck size={18} style={{ color: '#4ade80' }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* TAB 1: SERIES */}
        {activeTab === 'series' && (
          <form onSubmit={handleSubmitSeries} className={styles.content}>
            <div className={styles.formGroup}>
              <label className={styles.label}>Tên bộ phim *</label>
              <input
                type="text"
                className={styles.input}
                value={seriesTitle}
                onChange={(e) => setSeriesTitle(e.target.value)}
                placeholder="Ví dụ: Phàm Nhân Tu Tiên Chi Vũ Động"
                required
              />
            </div>

            <div className={styles.row}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Thể loại (cách nhau bằng dấu phẩy)</label>
                <input
                  type="text"
                  className={styles.input}
                  value={seriesGenres}
                  onChange={(e) => setSeriesGenres(e.target.value)}
                  placeholder="Tu Tiên, Huyền Huyễn, Hành Động"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Trạng thái</label>
                <select
                  className={styles.select}
                  value={seriesStatus}
                  onChange={(e) => setSeriesStatus(e.target.value)}
                >
                  <option value="ongoing">Đang tiến hành (ongoing)</option>
                  <option value="completed">Đã hoàn thành (completed)</option>
                  <option value="upcoming">Sắp ra mắt (upcoming)</option>
                </select>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Mô tả tóm tắt</label>
              <textarea
                className={styles.textarea}
                value={seriesDescription}
                onChange={(e) => setSeriesDescription(e.target.value)}
                placeholder="Nhập nội dung giới thiệu bộ phim..."
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Ảnh bìa / Poster (WebP, JPG, PNG)</label>
              <label className={styles.dropZone}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePosterSelect}
                  style={{ display: 'none' }}
                />
                <IconUpload size={24} style={{ color: '#fbbf24' }} />
                <p className={styles.dropZoneText}>
                  {posterFile ? posterFile.name : 'Bấm để chọn ảnh bìa từ máy tính'}
                </p>
                <p className={styles.dropZoneHint}>Tỷ lệ khuyến nghị 16:9, tối đa 10 MB</p>
              </label>

              {posterPreview && (
                <div style={{ marginTop: 8, maxWidth: 160, borderRadius: 6, overflow: 'hidden' }}>
                  <img src={posterPreview} alt="Preview" style={{ width: '100%', display: 'block' }} />
                </div>
              )}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={seriesPublished}
                  onChange={(e) => setSeriesPublished(e.target.checked)}
                />
                <span>Xuất bản ngay cho người dùng xem</span>
              </label>
            </div>

            <div className={styles.footer} style={{ padding: 0, marginTop: 12 }}>
              <button type="button" className={styles.btnSecondary} onClick={onClose}>
                Hủy
              </button>
              <button type="submit" className={styles.btnPrimary} disabled={submitting}>
                {submitting ? 'Đang lưu...' : 'Lưu bộ phim'}
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: EPISODE & MP4 UPLOAD */}
        {activeTab === 'episode' && (
          <form onSubmit={handleUploadEpisode} className={styles.content}>
            <div className={styles.row}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Tập số *</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  className={styles.input}
                  value={episodeNumber}
                  onChange={(e) => setEpisodeNumber(e.target.value)}
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Tiêu đề tập</label>
                <input
                  type="text"
                  className={styles.input}
                  value={episodeTitle}
                  onChange={(e) => setEpisodeTitle(e.target.value)}
                  placeholder={`Tập ${episodeNumber}`}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Mô tả tập (không bắt buộc)</label>
              <input
                type="text"
                className={styles.input}
                value={episodeDescription}
                onChange={(e) => setEpisodeDescription(e.target.value)}
                placeholder="Ví dụ: Đại chiến Hắc Huyết..."
              />
            </div>

            {/* MP4 File Selector */}
            <div className={styles.formGroup}>
              <label className={styles.label}>Chọn tệp video MP4 từ máy tính Windows *</label>
              <label className={styles.dropZone}>
                <input
                  type="file"
                  accept="video/mp4"
                  onChange={handleVideoSelect}
                  style={{ display: 'none' }}
                  disabled={submitting}
                />
                <IconFilm size={28} style={{ color: '#fbbf24' }} />
                <p className={styles.dropZoneText}>
                  {videoFile ? `${videoFile.name} (${formatBytes(videoFile.size)})` : 'Bấm để chọn tệp MP4'}
                </p>
                <p className={styles.dropZoneHint}>
                  Tải trực tiếp từ máy lên Cloudflare R2 qua Multipart Upload (10MB/phần, tự động thử lại khi lỗi mạng và hủy an toàn)
                </p>
              </label>
            </div>

            {/* Storage Quota & Cost Control Box */}
            <div className={`${styles.quotaBox} ${isThresholdAlert ? styles.quotaBoxWarning : ''}`}>
              <div className={styles.quotaHeader}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <IconHardDrive size={14} /> Kiểm soát dung lượng & chi phí Cloudflare R2
                </span>
                <span>Ngưỡng cảnh báo: 8.0 GB</span>
              </div>

              <div className={styles.quotaGrid}>
                <div className={styles.quotaItem}>
                  <span className={styles.quotaLabel}>
                    {isR2Verified ? 'Video R2 (Xác thực R2):' : 'Video (Ước tính DB):'}
                  </span>
                  <span className={styles.quotaVal}>
                    {formatBytes(currentVideoBytes)}
                    {!isR2Verified && ' (Ước tính)'}
                  </span>
                </div>
                <div className={styles.quotaItem}>
                  <span className={styles.quotaLabel}>Truyện tranh:</span>
                  <span className={styles.quotaVal}>~1.2 GB (Ước tính)</span>
                </div>
                <div className={styles.quotaItem}>
                  <span className={styles.quotaLabel}>Tệp sắp tải lên:</span>
                  <span className={styles.quotaVal}>{formatBytes(selectedFileBytes)}</span>
                </div>
              </div>

              {/* R2 Connection Diagnostics Probe */}
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <button
                    type="button"
                    onClick={handleTestR2Connection}
                    disabled={r2Testing}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: 4,
                      color: '#e2e8f0',
                      padding: '4px 10px',
                      fontSize: 12,
                      cursor: r2Testing ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {r2Testing ? 'Đang kiểm tra kết nối R2...' : 'Kiểm tra kết nối R2'}
                  </button>
                  {r2TestResult && (
                    <span style={{ fontSize: 12, color: r2TestResult.ok ? '#4ade80' : '#f87171' }}>
                      {r2TestResult.ok ? 'Kết nối R2 sẵn sàng (SigV4 OK)' : `Lỗi: ${r2TestResult.stage || 'R2_FAIL'}`}
                    </span>
                  )}
                </div>

                {r2TestResult && !r2TestResult.ok && (
                  <div
                    style={{
                      background: 'rgba(239, 68, 68, 0.12)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: 4,
                      padding: '6px 10px',
                      fontSize: 12,
                      color: '#fca5a5',
                      lineHeight: 1.4,
                    }}
                  >
                    <div><strong>Chi tiết lỗi:</strong> {r2TestResult.error}</div>
                    {r2TestResult.authSource && (
                      <div style={{ marginTop: 2, fontSize: 11, color: '#cbd5e1' }}>
                        Nguồn key: {r2TestResult.authSource} | Key hint: {r2TestResult.keyHint} | Bucket: {r2TestResult.bucket}
                      </div>
                    )}
                    {r2TestResult.runtimeDiagnostics && (
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed rgba(255, 255, 255, 0.15)', fontSize: 11, color: '#cbd5e1' }}>
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>Trạng thái biến môi trường Edge Function (Bảo mật - chỉ kiểm tra tồn tại và độ dài):</div>
                        <div>• R2_ACCOUNT_ID: {r2TestResult.runtimeDiagnostics.hasR2AccountId ? `Có (${r2TestResult.runtimeDiagnostics.r2AccountIdLength} ký tự)` : '[Chưa có / Rỗng]'}</div>
                        <div>• R2_VIDEO_ACCESS_KEY_ID: {r2TestResult.runtimeDiagnostics.hasR2VideoAccessKeyId ? `Có (${r2TestResult.runtimeDiagnostics.r2VideoAccessKeyIdLength} ký tự)` : '[Chưa có / Rỗng]'}</div>
                        <div>• R2_VIDEO_SECRET_ACCESS_KEY: {r2TestResult.runtimeDiagnostics.hasR2VideoSecretAccessKey ? `Có (${r2TestResult.runtimeDiagnostics.r2VideoSecretAccessKeyLength} ký tự)` : '[Chưa có / Rỗng]'}</div>
                        <div>• R2_VIDEO_BUCKET: {r2TestResult.runtimeDiagnostics.r2VideoBucket || 'tcl-videos'}</div>
                        {r2TestResult.runtimeDiagnostics.hasLegacyComicKeyPresent && (
                          <div style={{ color: '#fbbf24', marginTop: 3 }}>
                            [Lưu ý] Biến R2_ACCESS_KEY_ID (truyện tranh) tồn tại trên môi trường nhưng Edge Function đã cách ly hoàn toàn, không sử dụng làm fallback.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {r2TestResult && r2TestResult.ok && (
                  <div
                    style={{
                      background: 'rgba(34, 197, 94, 0.12)',
                      border: '1px solid rgba(34, 197, 94, 0.3)',
                      borderRadius: 4,
                      padding: '6px 10px',
                      fontSize: 12,
                      color: '#86efac',
                      lineHeight: 1.4,
                    }}
                  >
                    <div><strong>Trạng thái:</strong> {r2TestResult.message}</div>
                    {r2TestResult.runtimeDiagnostics && (
                      <div style={{ marginTop: 4, fontSize: 11, color: '#cbd5e1' }}>
                        <div>• Nguồn xác thực: {r2TestResult.authSource} (Độ dài: {r2TestResult.runtimeDiagnostics.r2VideoAccessKeyIdLength} ký tự)</div>
                        <div>• Bucket: {r2TestResult.bucket} | Số đối tượng mẫu: {r2TestResult.keyCount}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Threshold Warning Banner */}
              {isThresholdAlert && (
                <div className={styles.alertBanner} style={{ marginTop: 4 }}>
                  <IconAlertTriangle size={16} className={styles.alertIcon} />
                  <div>
                    <strong>Cảnh báo ngưỡng 8 GB:</strong> Tổng dung lượng lưu trữ trên Cloudflare R2 sẽ đạt{' '}
                    <strong>{formatBytes(projectedTotal)}</strong> (vượt ngưỡng cảnh báo 8 GB của gói miễn phí 10 GB).
                    Vui lòng lưu ý chi phí phát sinh nếu vượt quá 10 GB.
                  </div>
                </div>
              )}
            </div>

            {/* Upload Progress Bar */}
            {uploadProgress && (
              <div className={styles.progressBox}>
                <div className={styles.progressInfo}>
                  <span>
                    Đang tải lên: Phần {uploadProgress.partIndex}/{uploadProgress.totalParts} ({uploadProgress.percent}%)
                  </span>
                  <span>
                    {formatBytes(uploadProgress.loaded)} / {formatBytes(uploadProgress.total)}
                    {uploadProgress.speedBytesPerSec > 0 && ` • ${formatBytes(uploadProgress.speedBytesPerSec)}/s`}
                  </span>
                </div>
                <div className={styles.progressBarTrack}>
                  <div
                    className={styles.progressBarFill}
                    style={{ width: `${uploadProgress.percent}%` }}
                  />
                </div>
              </div>
            )}

            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={episodePublished}
                  onChange={(e) => setEpisodePublished(e.target.checked)}
                />
                <span>Xuất bản tập này ngay sau khi tải lên thành công</span>
              </label>
            </div>

            <div className={styles.footer} style={{ padding: 0, marginTop: 12 }}>
              {submitting && (
                <button type="button" className={styles.btnDanger} onClick={handleCancelUpload}>
                  Hủy tải lên
                </button>
              )}
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={submitting || !videoFile}
              >
                {submitting ? 'Đang tải lên R2...' : 'Bắt đầu tải lên R2'}
              </button>
            </div>
          </form>
        )}

        {/* TAB 3: SUBTITLE */}
        {activeTab === 'subtitle' && (
          <form onSubmit={handleUploadSubtitle} className={styles.content}>
            <div className={styles.row}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Mã ngôn ngữ</label>
                <input
                  type="text"
                  className={styles.input}
                  value={subtitleLang}
                  onChange={(e) => setSubtitleLang(e.target.value)}
                  placeholder="vi"
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Tên hiển thị phụ đề</label>
                <input
                  type="text"
                  className={styles.input}
                  value={subtitleLabel}
                  onChange={(e) => setSubtitleLabel(e.target.value)}
                  placeholder="Tiếng Việt"
                  required
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Chọn tệp phụ đề .vtt (WebVTT UTF-8) *</label>
              <label className={styles.dropZone}>
                <input
                  type="file"
                  accept=".vtt,text/vtt"
                  onChange={handleSubtitleSelect}
                  style={{ display: 'none' }}
                  disabled={submitting}
                />
                <IconSubtitles size={24} style={{ color: '#fbbf24' }} />
                <p className={styles.dropZoneText}>
                  {subtitleFile ? subtitleFile.name : 'Bấm để chọn tệp .vtt từ máy tính'}
                </p>
                <p className={styles.dropZoneHint}>Định dạng WebVTT tiêu chuẩn UTF-8</p>
              </label>
            </div>

            <div className={styles.footer} style={{ padding: 0, marginTop: 12 }}>
              <button type="button" className={styles.btnSecondary} onClick={onClose}>
                Đóng
              </button>
              <button
                type="submit"
                className={styles.btnPrimary}
                disabled={submitting || !subtitleFile}
              >
                {submitting ? 'Đang tải lên...' : 'Tải lên phụ đề'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
