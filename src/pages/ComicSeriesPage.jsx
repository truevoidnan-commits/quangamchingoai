import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getSeries,
  getVolumes,
  deleteVolume,
  deleteSeries,
  updateSeries,
  getComicProgress,
  cleanOrphanImportingVolumes,
} from '../lib/comics/comicDb.js';
import ComicImportModal from '../components/comics/ComicImportModal.jsx';
import Footer from '../components/layout/Footer.jsx';
import styles from './ComicSeriesPage.module.css';

export default function ComicSeriesPage() {
  const { seriesId } = useParams();
  const navigate = useNavigate();

  const [series, setSeries] = useState(null);
  const [volumes, setVolumes] = useState([]);
  const [progressMap, setProgressMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [coverUrl, setCoverUrl] = useState(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [volumeToDelete, setVolumeToDelete] = useState(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleText, setEditTitleText] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const loadData = useCallback(async () => {
    if (!seriesId) return;
    try {
      await cleanOrphanImportingVolumes();
      const s = await getSeries(seriesId);
      if (!s) {
        navigate('/comics', { replace: true });
        return;
      }
      setSeries(s);
      setEditTitleText(s.title);

      const vols = await getVolumes(seriesId);
      setVolumes(vols);

      // Load reading progress for all volumes
      const pMap = {};
      for (const v of vols) {
        const prog = getComicProgress(v.id);
        if (prog) {
          pMap[v.id] = prog;
        }
      }
      setProgressMap(pMap);
    } catch (err) {
      console.error('Error loading comic series:', err);
    } finally {
      setLoading(false);
    }
  }, [seriesId, navigate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Object URL for series cover
  useEffect(() => {
    let url = null;
    if (series?.coverBlob) {
      try {
        url = URL.createObjectURL(series.coverBlob);
        setCoverUrl(url);
      } catch (e) {}
    } else {
      setCoverUrl(null);
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [series?.coverBlob]);

  const handleDeleteVolume = async () => {
    if (!volumeToDelete) return;
    try {
      await deleteVolume(volumeToDelete.id);
      showToast(`Đã xóa "${volumeToDelete.title}"`);
      setVolumeToDelete(null);
      loadData();
    } catch (err) {
      showToast(`Lỗi xóa tập: ${err.message}`);
    }
  };

  const handleDeleteSeriesConfirm = async () => {
    if (!window.confirm(`Xác nhận xóa vĩnh viễn bộ truyện "${series?.title}" cùng tất cả các tập?`)) {
      return;
    }
    try {
      await deleteSeries(seriesId);
      navigate('/comics', { replace: true });
    } catch (err) {
      showToast(`Lỗi xóa bộ truyện: ${err.message}`);
    }
  };

  const handleSaveTitle = async () => {
    if (!editTitleText.trim()) return;
    try {
      await updateSeries(seriesId, { title: editTitleText.trim() });
      setSeries((prev) => ({ ...prev, title: editTitleText.trim() }));
      setIsEditingTitle(false);
      showToast('Đã đổi tên bộ truyện ✨');
    } catch (err) {
      showToast(`Lỗi cập nhật tên: ${err.message}`);
    }
  };

  const formatMb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

  if (loading) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.spinner} />
        <p>Đang tải thông tin bộ truyện...</p>
      </div>
    );
  }

  if (!series) return null;

  return (
    <div className={styles.page}>
      {/* Top Navigation */}
      <div className={styles.topNav}>
        <Link to="/comics" className={styles.backBtn}>
          ← Danh Sách Truyện Tranh
        </Link>
      </div>

      <div className={styles.container}>
        {/* Series Header Card */}
        <div className={styles.seriesHeader}>
          <div className={styles.coverWrap}>
            {coverUrl ? (
              <img src={coverUrl} alt={series.title} className={styles.coverImg} />
            ) : (
              <div className={styles.coverPlaceholder}>🖼️</div>
            )}
          </div>

          <div className={styles.seriesInfo}>
            <div className={styles.titleRow}>
              {isEditingTitle ? (
                <div className={styles.editTitleWrap}>
                  <input
                    type="text"
                    value={editTitleText}
                    onChange={(e) => setEditTitleText(e.target.value)}
                    className={styles.titleInput}
                    autoFocus
                  />
                  <button className={styles.saveTitleBtn} onClick={handleSaveTitle}>
                    Lưu
                  </button>
                  <button
                    className={styles.cancelTitleBtn}
                    onClick={() => {
                      setEditTitleText(series.title);
                      setIsEditingTitle(false);
                    }}
                  >
                    Hủy
                  </button>
                </div>
              ) : (
                <h1 className={styles.seriesTitle}>
                  {series.title}
                  <button
                    className={styles.editBtn}
                    title="Đổi tên bộ truyện"
                    onClick={() => setIsEditingTitle(true)}
                  >
                    ✏️
                  </button>
                </h1>
              )}
            </div>

            <div className={styles.statsBadges}>
              <div className={styles.statBadge}>
                <span className={styles.statIcon}>📚</span>
                <span>{volumes.length} tập</span>
              </div>
              <div className={styles.statBadge}>
                <span className={styles.statIcon}>📄</span>
                <span>{series.totalPages || 0} trang</span>
              </div>
              <div className={styles.statBadge}>
                <span className={styles.statIcon}>💾</span>
                <span>{formatMb(series.totalBytes || 0)} MB</span>
              </div>
            </div>

            <div className={styles.headerActions}>
              <button
                className={styles.importMoreBtn}
                onClick={() => setIsImportModalOpen(true)}
                id="btn-import-more-volumes"
              >
                + Nhập Thêm Tập (PDF)
              </button>
              <button
                className={styles.deleteSeriesBtn}
                onClick={handleDeleteSeriesConfirm}
              >
                🗑️ Xóa Bộ Truyện
              </button>
            </div>
          </div>
        </div>

        {/* Volume List Section */}
        <div className={styles.volumeSection}>
          <div className={styles.volumeSectionHeader}>
            <h2 className={styles.volumeSectionTitle}>
              Danh Sách Tập Truyện ({volumes.length})
            </h2>
          </div>

          {volumes.length === 0 ? (
            <div className={styles.emptyVolumes}>
              <p>Chưa có tập nào trong bộ truyện này.</p>
              <button
                className={styles.emptyImportBtn}
                onClick={() => setIsImportModalOpen(true)}
              >
                + Nhập Tập Đầu Tiên
              </button>
            </div>
          ) : (
            <div className={styles.volumeList}>
              {volumes.map((vol) => {
                const prog = progressMap[vol.id];
                const readPage = prog ? prog.pageIndex + 1 : 0;
                const percent = vol.pageCount > 0 && prog
                  ? Math.round((readPage / vol.pageCount) * 100)
                  : 0;

                return (
                  <div key={vol.id} className={styles.volumeCard}>
                    <div className={styles.volumeLeft}>
                      <span className={styles.volumeOrderBadge}>
                        Tập {vol.order || 1}
                      </span>
                      <div className={styles.volumeMetaInfo}>
                        <h3 className={styles.volumeTitle}>{vol.title}</h3>
                        <div className={styles.volumeSubText}>
                          <span>{vol.pageCount} trang</span>
                          <span>·</span>
                          <span>{formatMb(vol.totalBytes || 0)} MB</span>
                          <span>·</span>
                          <span className={styles.qualityTag}>{vol.quality || 'balanced'}</span>
                        </div>
                        {prog && (
                          <div className={styles.progressIndicator}>
                            <span className={styles.progressText}>
                              Đã đọc trang {readPage}/{vol.pageCount} ({percent}%)
                            </span>
                            <div className={styles.miniProgressBar}>
                              <div
                                className={styles.miniProgressFill}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className={styles.volumeRight}>
                      <button
                        className={styles.readBtn}
                        onClick={() => navigate(`/comics/${seriesId}/read/${vol.id}`)}
                      >
                        {prog ? 'Đọc Tiếp ➔' : 'Bắt Đầu Đọc ➔'}
                      </button>
                      <button
                        className={styles.deleteVolumeBtn}
                        title="Xóa tập này"
                        onClick={() => setVolumeToDelete(vol)}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Import Modal */}
      <ComicImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        initialSeriesId={seriesId}
        initialSeriesTitle={series.title}
        allSeries={[series]}
        onImportSuccess={() => {
          showToast('Nhập tập mới thành công! ✨');
          loadData();
        }}
      />

      {/* Delete Volume Confirm Modal */}
      {volumeToDelete && (
        <div className={styles.deleteModalOverlay} onClick={() => setVolumeToDelete(null)}>
          <div className={styles.deleteModalBox} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.deleteModalTitle}>Xác nhận xóa tập</h3>
            <p className={styles.deleteModalDesc}>
              Bạn có chắc muốn xóa <strong>"{volumeToDelete.title}"</strong> ({volumeToDelete.pageCount} trang, {formatMb(volumeToDelete.totalBytes || 0)} MB)?
            </p>
            <div className={styles.deleteModalActions}>
              <button
                className={styles.deleteCancelBtn}
                onClick={() => setVolumeToDelete(null)}
              >
                Hủy
              </button>
              <button
                className={styles.deleteConfirmBtn}
                onClick={handleDeleteVolume}
              >
                Xóa Tập
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMsg && <div className={styles.toast}>{toastMsg}</div>}

      <Footer />
    </div>
  );
}
