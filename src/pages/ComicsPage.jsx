import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  getAllSeries,
  deleteSeries,
  cleanOrphanImportingVolumes,
  getComicsStorageStats,
  requestStoragePersistence,
} from '../lib/comics/comicDb.js';
import {
  isCloudAvailable,
  listRemote,
  autoEvictIfStorageFull,
} from '../lib/comics/comicCloud.js';
import { supabase } from '../lib/supabaseClient.js';
import ComicImportModal from '../components/comics/ComicImportModal.jsx';
import Footer from '../components/layout/Footer.jsx';
import styles from './ComicsPage.module.css';

export default function ComicsPage() {
  const navigate = useNavigate();
  const [seriesList, setSeriesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [storageStats, setStorageStats] = useState(null);
  const [cloudInfo, setCloudInfo] = useState({
    isLoggedIn: false,
    cloudUsageBytes: 0,
    cloudQuotaBytes: 8 * 1024 * 1024 * 1024,
  });
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [seriesToDelete, setSeriesToDelete] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const loadData = useCallback(async () => {
    try {
      await cleanOrphanImportingVolumes();
      const [localList, stats, cloudRes] = await Promise.all([
        getAllSeries(),
        getComicsStorageStats(),
        listRemote(),
      ]);

      // Merge local series with remote series (for devices that haven't downloaded series yet)
      const mergedSeries = [...localList];
      const localIds = new Set(localList.map((s) => s.id));

      if (cloudRes.isLoggedIn && cloudRes.remoteSeries) {
        for (const rs of cloudRes.remoteSeries) {
          if (!localIds.has(rs.id)) {
            // Count remote volumes for this series
            const volCount = cloudRes.remoteVolumes?.filter((v) => v.series_id === rs.id && v.status === 'ready').length || 0;
            mergedSeries.push({
              id: rs.id,
              title: rs.title,
              volumeCount: volCount,
              totalPages: 0,
              totalBytes: 0,
              isCloudOnly: true,
              updatedAt: new Date(rs.updated_at || Date.now()).getTime(),
            });
          }
        }
      }

      mergedSeries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      setSeriesList(mergedSeries);
      setStorageStats(stats);
      setCloudInfo(cloudRes);
    } catch (err) {
      console.error('Error loading comics series:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Refresh when tab gains focus
    const handleFocus = () => loadData();
    window.addEventListener('focus', handleFocus);

    // Refresh on Supabase auth change
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      loadData();
    });

    return () => {
      window.removeEventListener('focus', handleFocus);
      authListener?.subscription?.unsubscribe();
    };
  }, [loadData]);

  const handleDeleteSeries = async () => {
    if (!seriesToDelete) return;
    try {
      await deleteSeries(seriesToDelete.id);
      showToast(`Đã xóa bộ truyện "${seriesToDelete.title}"`);
      setSeriesToDelete(null);
      loadData();
    } catch (err) {
      showToast(`Lỗi xóa: ${err.message}`);
    }
  };

  const handleRequestPersist = async () => {
    const granted = await requestStoragePersistence();
    if (granted) {
      showToast('Đã được cấp quyền lưu trữ vĩnh viễn (Persisted Storage) ✨');
    } else {
      showToast('Trình duyệt chưa cho phép cấp quyền vĩnh viễn.');
    }
    const stats = await getComicsStorageStats();
    setStorageStats(stats);
  };

  const handleFreeDeviceSpace = async () => {
    try {
      const initialStats = await getComicsStorageStats();
      await autoEvictIfStorageFull({ threshold: 0, target: 0 }); // Evict LRU synced volumes
      const finalStats = await getComicsStorageStats();
      const freedBytes = Math.max(0, initialStats.comicsBytes - finalStats.comicsBytes);
      if (freedBytes > 0) {
        showToast(`Đã giải phóng ${(freedBytes / (1024 * 1024)).toFixed(1)} MB từ các tập đã đồng bộ Cloud! ✨`);
      } else {
        showToast('Không có tập truyện đã đồng bộ nào cần giải phóng.');
      }
      loadData();
    } catch (err) {
      showToast(`Lỗi giải phóng bộ nhớ: ${err.message}`);
    }
  };

  const formatMb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);
  const formatGb = (bytes) => (bytes / (1024 * 1024 * 1024)).toFixed(2);

  // Storage gauge calculations
  const usedBytes = storageStats?.storageUsage || 0;
  const quotaBytes = storageStats?.storageQuota || 0;
  const usagePercent = quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0;
  const isHighStorage = usagePercent >= 80;

  // Cloud usage calculations
  const cloudUsedGb = (cloudInfo.cloudUsageBytes / (1024 * 1024 * 1024)).toFixed(2);
  const cloudTotalGb = 8.0;
  const cloudPercent = Math.min(100, Math.round((cloudInfo.cloudUsageBytes / (8 * 1024 * 1024 * 1024)) * 100));

  return (
    <div className={styles.page}>
      {/* ===== BANNER ===== */}
      <section className={styles.banner}>
        <div className={styles.bannerBg} aria-hidden="true">
          <div className={styles.bannerGlow1} />
          <div className={styles.bannerGlow2} />
        </div>

        <div className={styles.bannerContent}>
          <h1 className={styles.appTitle}>TÀNG KINH HỌA CÁC</h1>
          <p className={styles.appSubtitle}>
            Trình đọc truyện tranh offline · Đồng bộ Cloudflare R2 & Supabase
          </p>
          <div className={styles.neonBar} aria-hidden="true" />
        </div>
      </section>

      {/* ===== TAB SWITCHER ===== */}
      <div className={styles.tabSwitcherWrap}>
        <div className={styles.tabSwitcher}>
          <Link to="/" className={styles.tabItem}>
            📖 Truyện Chữ
          </Link>
          <div className={`${styles.tabItem} ${styles.tabItemActive}`}>
            🖼️ Truyện Tranh
          </div>
        </div>
      </div>

      <div className={styles.container}>
        {/* ===== STORAGE GAUGE (LOCAL) ===== */}
        {storageStats && (
          <div className={`${styles.storageGauge} ${isHighStorage ? styles.storageGaugeWarning : ''}`}>
            <div className={styles.gaugeHeader}>
              <div className={styles.gaugeInfo}>
                <span className={styles.gaugeIcon}>💾</span>
                <span className={styles.gaugeLabel}>
                  Bộ nhớ truyện tranh trong máy: <strong>{formatMb(storageStats.comicsBytes)} MB</strong> ({storageStats.totalComicsPages} trang)
                </span>
                {quotaBytes > 0 && (
                  <span className={styles.gaugeSub}>
                    · Trình duyệt đã dùng {formatGb(usedBytes)}GB / {formatGb(quotaBytes)}GB ({usagePercent}%)
                  </span>
                )}
              </div>
              <div className={styles.persistWrap}>
                {storageStats.isPersisted ? (
                  <span className={styles.persistBadge} title="Dữ liệu được bảo vệ, trình duyệt không tự xóa khi thiếu bộ nhớ">
                    🛡️ Đã bật lưu vĩnh viễn
                  </span>
                ) : (
                  <button
                    className={styles.persistBtn}
                    onClick={handleRequestPersist}
                    title="Yêu cầu trình duyệt không tự dọn dẹp dữ liệu truyện tranh"
                  >
                    ⚡ Bật lưu vĩnh viễn
                  </button>
                )}
              </div>
            </div>

            {quotaBytes > 0 && (
              <div className={styles.gaugeTrack}>
                <div
                  className={`${styles.gaugeFill} ${isHighStorage ? styles.gaugeFillWarning : ''}`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
            )}

            {isHighStorage && (
              <div className={styles.gaugeWarningText}>
                ⚠️ Bộ nhớ trình duyệt sắp đầy (&gt;80%). Bạn nên giải phóng bớt các tập đã lưu trên Cloud.
              </div>
            )}
          </div>
        )}

        {/* ===== CLOUD STORAGE GAUGE (SHOWN ONLY IF LOGGED IN) ===== */}
        {cloudInfo.isLoggedIn && (
          <div className={styles.cloudStorageGauge}>
            <div className={styles.gaugeHeader}>
              <div className={styles.gaugeInfo}>
                <span className={styles.gaugeIcon}>☁️</span>
                <span className={styles.gaugeLabel}>
                  Cloudflare R2: <strong>Cloud: {cloudUsedGb} / {cloudTotalGb} GB</strong> ({cloudPercent}%)
                </span>
              </div>
              <div className={styles.cloudActions}>
                <button
                  className={styles.evictBtn}
                  onClick={handleFreeDeviceSpace}
                  title="Xóa trang ảnh local của các tập đã lưu an toàn trên Cloud để giải phóng bộ nhớ máy"
                >
                  🧹 Giải Phóng Bộ Nhớ Máy
                </button>
              </div>
            </div>
            <div className={styles.gaugeTrack}>
              <div
                className={styles.cloudGaugeFill}
                style={{ width: `${cloudPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* ===== ACTIONS BAR ===== */}
        <div className={styles.actionsBar}>
          <div className={styles.actionsLeft}>
            <h2 className={styles.sectionTitle}>
              Danh Sách Bộ Truyện ({seriesList.length})
            </h2>
          </div>
          <button
            className={styles.importBtn}
            onClick={() => setIsImportModalOpen(true)}
            id="btn-import-pdf-comics"
          >
            📥 Nhập Truyện Tranh (PDF)
          </button>
        </div>

        {/* ===== SERIES GRID ===== */}
        {loading ? (
          <div className={styles.loadingWrap}>
            <div className={styles.spinner} />
            <p>Đang tải danh sách truyện tranh...</p>
          </div>
        ) : seriesList.length === 0 ? (
          <div className={styles.emptyWrap}>
            <span className={styles.emptyIcon}>📚</span>
            <h3>Chưa có truyện tranh nào</h3>
            <p>
              Nhập file PDF tập truyện để bắt đầu đọc tranh offline mượt mà hoặc đồng bộ giữa các thiết bị.
            </p>
            <button
              className={styles.emptyImportBtn}
              onClick={() => setIsImportModalOpen(true)}
            >
              + Nhập Tập Đầu Tiên
            </button>
          </div>
        ) : (
          <div className={styles.grid}>
            {seriesList.map((series) => (
              <SeriesCard
                key={series.id}
                series={series}
                onClick={() => navigate(`/comics/${series.id}`)}
                onDelete={() => setSeriesToDelete(series)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ===== IMPORT MODAL ===== */}
      <ComicImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        allSeries={seriesList}
        onImportSuccess={(res) => {
          showToast('Nhập truyện tranh thành công! ✨');
          loadData();
          if (res?.seriesId) {
            navigate(`/comics/${res.seriesId}`);
          }
        }}
      />

      {/* ===== DELETE CONFIRM MODAL ===== */}
      {seriesToDelete && (
        <div className={styles.deleteModalOverlay} onClick={() => setSeriesToDelete(null)}>
          <div className={styles.deleteModalBox} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.deleteModalTitle}>Xác nhận xóa bộ truyện</h3>
            <p className={styles.deleteModalDesc}>
              Bạn có chắc muốn xóa bộ truyện <strong>"{seriesToDelete.title}"</strong> cùng toàn bộ{' '}
              {seriesToDelete.volumeCount} tập ({formatMb(seriesToDelete.totalBytes || 0)} MB)?
            </p>
            <p className={styles.deleteModalWarning}>
              Hành động này sẽ xóa vĩnh viễn toàn bộ trang ảnh đã lưu trên máy.
            </p>
            <div className={styles.deleteModalActions}>
              <button
                className={styles.deleteCancelBtn}
                onClick={() => setSeriesToDelete(null)}
              >
                Hủy
              </button>
              <button
                className={styles.deleteConfirmBtn}
                onClick={handleDeleteSeries}
              >
                Xóa Bộ Truyện
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== TOAST ===== */}
      {toastMsg && <div className={styles.toast}>{toastMsg}</div>}

      <Footer />
    </div>
  );
}

function SeriesCard({ series, onClick, onDelete }) {
  const [coverUrl, setCoverUrl] = useState(null);

  useEffect(() => {
    let url = null;
    if (series.coverBlob) {
      try {
        url = URL.createObjectURL(series.coverBlob);
        setCoverUrl(url);
      } catch (e) {}
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [series.coverBlob]);

  const formatMb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

  return (
    <div className={styles.card} onClick={onClick}>
      <div className={styles.coverWrap}>
        {coverUrl ? (
          <img src={coverUrl} alt={series.title} className={styles.coverImg} loading="lazy" />
        ) : (
          <div className={styles.coverPlaceholder}>
            <span>🖼️</span>
          </div>
        )}
        <div className={styles.coverGradient} />
        {!series.isCloudOnly && (
          <button
            className={styles.cardDeleteBtn}
            title="Xóa bộ truyện"
            aria-label="Xóa bộ truyện"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            ✕
          </button>
        )}
      </div>

      <div className={styles.cardBody}>
        <div className={styles.titleRow}>
          <h3 className={styles.cardTitle} title={series.title}>
            {series.title}
          </h3>
          {series.isCloudOnly && (
            <span className={styles.cloudOnlyTag}>☁️ Trên Cloud</span>
          )}
        </div>
        <div className={styles.cardMeta}>
          <span className={styles.cardVolumes}>
            {series.volumeCount} tập {!series.isCloudOnly && `(${series.totalPages || 0} trang)`}
          </span>
          {!series.isCloudOnly && (
            <span className={styles.cardSize}>
              {formatMb(series.totalBytes || 0)} MB
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
