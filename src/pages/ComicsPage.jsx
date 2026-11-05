import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAllSeries,
  deleteSeries,
  cleanOrphanImportingVolumes,
  getComicsStorageStats,
  requestStoragePersistence,
} from '../lib/comics/comicDb.js';
import {
  listRemote,
  autoEvictIfStorageFull,
  deleteSeriesEverywhere,
} from '../lib/comics/comicCloud.js';
import {
  subscribeSyncQueue,
  isAutoDownloadEnabled,
  setAutoDownloadEnabled,
  isAutoUploadEnabled,
  setAutoUploadEnabled,
  pauseSync,
  resumeSync,
  cancelTask,
  clearUploadQuotaExceeded,
} from '../lib/comics/comicSyncQueue.js';
import { supabase } from '../lib/supabaseClient.js';
import ComicImportModal from '../components/comics/ComicImportModal.jsx';
import Footer from '../components/layout/Footer.jsx';
import LobbyTabs from '../components/ui/LobbyTabs.jsx';
import ComicsBackdrop from '../components/comics/ComicsBackdrop.jsx';
import {
  IconCloud,
  IconCloudCheck,
  IconDevice,
  IconBookOpen,
  IconSettings,
  IconTrash,
  IconAlertTriangle,
  IconRefresh,
  IconPause,
  IconPlay,
  IconX,
  IconCheck,
} from '../components/comics/ComicIcons.jsx';
import styles from './ComicsPage.module.css';

export default function ComicsPage() {
  const navigate = useNavigate();
  const [seriesList, setSeriesList] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [storageStats, setStorageStats] = useState(null);
  const [cloudInfo, setCloudInfo] = useState({
    isLoggedIn: false,
    cloudUsageBytes: 0,
    cloudQuotaBytes: 8 * 1024 * 1024 * 1024,
  });
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [seriesToDelete, setSeriesToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [syncSnapshot, setSyncSnapshot] = useState({
    isProcessing: false,
    isPaused: false,
    storageWarning: false,
    activeTask: null,
    pendingTasks: [],
    queueLength: 0,
    autoDownload: true,
    autoUpload: true,
  });

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const loadData = useCallback(async () => {
    try {
      await cleanOrphanImportingVolumes();
      const [stats, cloudRes] = await Promise.all([
        getComicsStorageStats(),
        listRemote(),
      ]);
      const localList = await getAllSeries();

      const TEN_MINUTES_MS = 10 * 60 * 1000;
      const isRecentTime = (t) => {
        if (!t) return false;
        const time = typeof t === 'number' ? t : new Date(t).getTime();
        return !isNaN(time) && (Date.now() - time) < TEN_MINUTES_MS;
      };

      const mergedSeries = [];
      const localIds = new Set();

      for (const s of localList) {
        if ((s.volumeCount || 0) > 0) {
          mergedSeries.push(s);
          localIds.add(s.id);
        }
      }

      if (cloudRes.isLoggedIn && cloudRes.remoteSeries) {
        for (const rs of cloudRes.remoteSeries) {
          if (!localIds.has(rs.id)) {
            const volCount =
              cloudRes.remoteVolumes?.filter(
                (v) =>
                  v.series_id === rs.id &&
                  (v.status === 'ready' || v.status === 'uploading' || isRecentTime(v.updated_at) || isRecentTime(v.created_at))
              ).length || 0;
            const isRecentSeries = isRecentTime(rs.updated_at) || isRecentTime(rs.created_at);

            if (volCount > 0 || isRecentSeries) {
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
      }

      mergedSeries.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      setSeriesList(mergedSeries);
      setStorageStats(stats);
      setCloudInfo(cloudRes);
      if (cloudRes.cloudUsageBytes < 8 * 1024 * 1024 * 1024) {
        clearUploadQuotaExceeded();
      }
    } catch (err) {
      console.error('Error loading comics series:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    const unsubQueue = subscribeSyncQueue((snap) => {
      setSyncSnapshot(snap);
    });

    const handleFocus = () => loadData();
    window.addEventListener('focus', handleFocus);

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      loadData();
    });

    return () => {
      unsubQueue();
      window.removeEventListener('focus', handleFocus);
      authListener?.subscription?.unsubscribe();
    };
  }, [loadData]);

  const handleDeleteSeries = async () => {
    if (!seriesToDelete) return;
    try {
      setIsDeleting(true);
      await deleteSeriesEverywhere(seriesToDelete.id);
      showToast(`Đã xóa bộ truyện "${seriesToDelete.title}" trên mọi thiết bị và Cloud.`);
      setSeriesToDelete(null);
      await loadData();
    } catch (err) {
      showToast(`Lỗi xóa: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRequestPersist = async () => {
    const granted = await requestStoragePersistence();
    if (granted) {
      showToast('Đã được cấp quyền lưu trữ vĩnh viễn trên thiết bị.');
    } else {
      showToast('Trình duyệt chưa cho phép cấp quyền lưu trữ vĩnh viễn.');
    }
    const stats = await getComicsStorageStats();
    setStorageStats(stats);
  };

  const handleFreeDeviceSpace = async () => {
    try {
      const initialStats = await getComicsStorageStats();
      await autoEvictIfStorageFull({ threshold: 0, target: 0 });
      const finalStats = await getComicsStorageStats();
      const freedBytes = Math.max(0, initialStats.comicsBytes - finalStats.comicsBytes);
      if (freedBytes > 0) {
        showToast(`Đã giải phóng ${(freedBytes / (1024 * 1024)).toFixed(1)} MB từ các tập đã đồng bộ Cloud.`);
      } else {
        showToast('Không có tập truyện đã đồng bộ nào cần giải phóng.');
      }
      loadData();
    } catch (err) {
      showToast(`Lỗi giải phóng bộ nhớ: ${err.message}`);
    }
  };

  const formatMb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

  // Unaccent normalize for client search
  const norm = (str) =>
    String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .trim();

  const filteredSeries = seriesList.filter((s) => {
    if (!search.trim()) return true;
    return norm(s.title).includes(norm(search));
  });

  const cloudUsedGb = (cloudInfo.cloudUsageBytes / (1024 * 1024 * 1024)).toFixed(2);
  const cloudTotalGb = '8.0';

  const storageUsagePercent = Math.min(
    100,
    Math.round(((storageStats?.storageUsage || 0) / (storageStats?.storageQuota || 1)) * 100)
  );
  const showStorageProgressBar = storageUsagePercent >= 70 || syncSnapshot.storageWarning;

  return (
    <div className={styles.page}>
      <ComicsBackdrop />
      {/* ===== BANNER ===== */}
      <section className={styles.banner}>
        <div className={styles.bannerBg} aria-hidden="true">
          <div className={styles.bannerGlow1} />
          <div className={styles.bannerGlow2} />
        </div>

        <div className={styles.bannerContent}>
          <div className={styles.bannerBadge}>TRUYỆN TRANH</div>
          <h1 className={styles.appTitle}>TÀNG KINH HỌA CÁC</h1>
          <p className={styles.appSubtitle}>
            ĐỌC MƯỢT · NGOẠI TUYẾN · ĐỒNG BỘ MỌI THIẾT BỊ
          </p>
          <div className={styles.neonBar} aria-hidden="true" />
        </div>
      </section>

      {/* ===== TAB SWITCHER ===== */}
      <LobbyTabs activeTab="comics" />

      <div className={styles.container}>
        {/* ===== TOOLBAR ===== */}
        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon} aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="search"
              placeholder="Tìm bộ truyện..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
              id="search-input"
              aria-label="Tìm bộ truyện"
            />
          </div>

          <button
            type="button"
            className={`btn-primary ${styles.importBtn} animate-neon-pulse`}
            onClick={() => setIsImportModalOpen(true)}
            id="btn-import-pdf-comics"
          >
            + Nhập PDF
          </button>
        </div>

        {/* Count text */}
        <div className={styles.countText}>
          {filteredSeries.length} bộ
        </div>

        {/* ===== COMPACT STORAGE BAR ===== */}
        <div className={styles.compactStorageBar}>
          <div className={styles.storageBarContent}>
            <div className={styles.storageInfo}>
              <IconDevice size={14} className={styles.deviceIcon} />
              <span className={styles.storageText}>
                {storageStats ? `${formatMb(storageStats.comicsBytes)} MB trên máy` : 'Đang tính dung lượng...'}
              </span>
              {cloudInfo.isLoggedIn && (
                <>
                  <span className={styles.storageDot}>·</span>
                  <IconCloud size={14} className={styles.cloudIcon} />
                  <span className={styles.storageText}>
                    {cloudUsedGb} / {cloudTotalGb} GB
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              className={styles.settingsBtn}
              onClick={() => setIsSettingsOpen(true)}
              title="Cài đặt đồng bộ & bộ nhớ"
              aria-label="Cài đặt đồng bộ & bộ nhớ"
            >
              <IconSettings size={15} />
            </button>
          </div>

          {showStorageProgressBar && (
            <div className={styles.storageTrackMini}>
              <div
                className={styles.storageFillMini}
                style={{ width: `${storageUsagePercent}%` }}
              />
            </div>
          )}
        </div>

        {/* ===== AUTO-SYNC ALERTS / PROGRESS ===== */}
        <div className={styles.syncStatusWrap}>
          {syncSnapshot.storageWarning ? (
            <div className={styles.syncAlertWarning}>
              <div className={styles.syncAlertLeft}>
                <IconAlertTriangle size={15} />
                <span>Bộ nhớ máy gần đầy, đã tạm dừng tự tải.</span>
              </div>
              <button
                type="button"
                className={styles.syncCleanBtn}
                onClick={handleFreeDeviceSpace}
              >
                Giải Phóng
              </button>
            </div>
          ) : syncSnapshot.uploadQuotaExceeded ? (
            <div className={styles.syncAlertWarning}>
              <div className={styles.syncAlertLeft}>
                <IconAlertTriangle size={15} />
                <span>Dung lượng Cloud đã đầy (vượt 8GB), đã dừng tự tải lên.</span>
              </div>
            </div>
          ) : syncSnapshot.rateLimitInfo ? (
            <div className={styles.syncAlertWarning}>
              <div className={styles.syncAlertLeft}>
                <IconAlertTriangle size={15} />
                <span>Đã chạm giới hạn, tự tiếp tục sau {syncSnapshot.rateLimitInfo.waitMinutes} phút.</span>
              </div>
            </div>
          ) : syncSnapshot.isProcessing && syncSnapshot.activeTask ? (
            <div className={styles.syncAlertActive}>
              <div className={styles.syncAlertLeft}>
                <IconRefresh size={15} className={styles.spinIcon} />
                <span className={styles.syncProgressText}>
                  Đang {syncSnapshot.activeTask.type === 'download' ? 'tải về' : 'tải lên'}{' '}
                  {syncSnapshot.activeTask.volumeTitle || 'tập'}{' '}
                  ({syncSnapshot.activeTask.percent}%)
                  {syncSnapshot.pendingTasks.length > 0 && ` · Còn ${syncSnapshot.pendingTasks.length} tập chờ`}
                </span>
              </div>
              <div className={styles.syncActionsRight}>
                <button
                  type="button"
                  className={styles.syncCancelTaskBtn}
                  onClick={() => {
                    cancelTask(syncSnapshot.activeTask.volumeId);
                    showToast(`Đã hủy tác vụ cho "${syncSnapshot.activeTask.volumeTitle}"`);
                  }}
                  title="Hủy tác vụ đang chạy"
                >
                  <IconX size={12} />
                  <span>Hủy</span>
                </button>
                <button
                  type="button"
                  className={styles.syncPauseBtn}
                  onClick={pauseSync}
                  title="Tạm dừng tự động"
                >
                  <IconPause size={13} />
                  <span>Tạm dừng</span>
                </button>
              </div>
            </div>
          ) : syncSnapshot.isPaused ? (
            <div className={styles.syncAlertPaused}>
              <div className={styles.syncAlertLeft}>
                <IconPause size={15} />
                <span>Đã tạm dừng tự động đồng bộ</span>
              </div>
              <button
                type="button"
                className={styles.syncResumeBtn}
                onClick={resumeSync}
                title="Tiếp tục tự động đồng bộ"
              >
                <IconPlay size={13} />
                <span>Tiếp tục</span>
              </button>
            </div>
          ) : null}
        </div>

        {/* ===== SERIES GRID ===== */}
        {loading ? (
          <div className={styles.grid}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={styles.skeletonCard}>
                <div className={styles.skeletonCover} />
                <div className={styles.skeletonBody}>
                  <div className={styles.skeletonTitle} />
                  <div className={styles.skeletonMeta} />
                </div>
              </div>
            ))}
          </div>
        ) : filteredSeries.length === 0 ? (
          <div className={styles.emptyWrap}>
            <div className={styles.emptyIcon}>
              <IconBookOpen size={48} />
            </div>
            <h3 className={styles.emptyTitle}>Chưa có bộ truyện nào</h3>
            <button
              type="button"
              className={`btn-primary ${styles.emptyImportBtn} animate-neon-pulse`}
              onClick={() => setIsImportModalOpen(true)}
            >
              + Nhập PDF
            </button>
          </div>
        ) : (
          <div className={styles.grid}>
            {filteredSeries.map((series) => (
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

      {/* ===== SETTINGS BOTTOM SHEET / MODAL ===== */}
      {isSettingsOpen && (
        <div className={styles.settingsOverlay} onClick={() => setIsSettingsOpen(false)}>
          <div className={styles.settingsBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.settingsHeader}>
              <div className={styles.settingsHeaderTitle}>
                <IconSettings size={20} />
                <h3>Cài Đặt Truyện Tranh</h3>
              </div>
              <button
                type="button"
                className={styles.settingsCloseBtn}
                onClick={() => setIsSettingsOpen(false)}
                aria-label="Đóng cài đặt"
              >
                <IconX size={18} />
              </button>
            </div>

            <div className={styles.settingsBody}>
              {/* Tự động tải về thiết bị */}
              <div className={styles.settingItem}>
                <div className={styles.settingText}>
                  <label htmlFor="toggle-auto-download" className={styles.settingLabel}>
                    Tự Động Tải Về Thiết Bị Này
                  </label>
                  <p className={styles.settingHint}>
                    Tự động kéo các tập mới trên Cloud về máy để đọc mượt mà ngoại tuyến.
                  </p>
                </div>
                <input
                  id="toggle-auto-download"
                  type="checkbox"
                  className={styles.settingToggle}
                  checked={syncSnapshot.autoDownload}
                  onChange={(e) => setAutoDownloadEnabled(e.target.checked)}
                />
              </div>

              {/* Tự động tải lên Cloud */}
              <div className={styles.settingItem}>
                <div className={styles.settingText}>
                  <label htmlFor="toggle-auto-upload" className={styles.settingLabel}>
                    Tự Động Tải Lên Cloud
                  </label>
                  <p className={styles.settingHint}>
                    Tự động sao lưu các tập truyện mới nhập vào máy lên Cloud khi có mạng.
                  </p>
                </div>
                <input
                  id="toggle-auto-upload"
                  type="checkbox"
                  className={styles.settingToggle}
                  checked={syncSnapshot.autoUpload}
                  onChange={(e) => setAutoUploadEnabled(e.target.checked)}
                />
              </div>

              {/* Lưu trữ vĩnh viễn trên máy */}
              <div className={styles.settingItem}>
                <div className={styles.settingText}>
                  <span className={styles.settingLabel}>Lưu Trữ Vĩnh Viễn Trong Máy</span>
                  <p className={styles.settingHint}>
                    {storageStats?.isPersisted
                      ? 'Dữ liệu truyện tranh đã được bảo vệ, trình duyệt không tự xóa khi thiếu dung lượng.'
                      : 'Yêu cầu trình duyệt cấp quyền lưu trữ bền vững, chống bị xóa nhầm.'}
                  </p>
                </div>
                {storageStats?.isPersisted ? (
                  <span className={styles.persistActiveBadge}>
                    <IconCheck size={14} />
                    <span>Đã Bật</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    className={styles.persistActionBtn}
                    onClick={handleRequestPersist}
                  >
                    Bật Lưu
                  </button>
                )}
              </div>

              {/* Giải phóng bộ nhớ máy */}
              {cloudInfo.isLoggedIn && (
                <div className={styles.settingItem}>
                  <div className={styles.settingText}>
                    <span className={styles.settingLabel}>Giải Phóng Bộ Nhớ Máy</span>
                    <p className={styles.settingHint}>
                      Xóa các trang ảnh cục bộ của các tập đã lưu an toàn trên Cloud để thu hồi bộ nhớ thiết bị.
                    </p>
                  </div>
                  <button
                    type="button"
                    className={styles.freeSpaceBtn}
                    onClick={handleFreeDeviceSpace}
                  >
                    Dọn Dẹp
                  </button>
                </div>
              )}
            </div>

            <div className={styles.settingsFooter}>
              <button
                type="button"
                className={styles.settingsDoneBtn}
                onClick={() => setIsSettingsOpen(false)}
              >
                Hoàn Tất
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== IMPORT MODAL ===== */}
      <ComicImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        allSeries={seriesList}
        onImportSuccess={(res) => {
          showToast('Nhập truyện tranh thành công!');
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
            <h3 className={styles.deleteModalTitle}>Xác Nhận Xóa Bộ Truyện</h3>
            <p className={styles.deleteModalDesc}>
              Bạn có chắc muốn xóa bộ truyện <strong>"{seriesToDelete.title}"</strong> cùng toàn bộ{' '}
              {seriesToDelete.volumeCount} tập ({formatMb(seriesToDelete.totalBytes || 0)} MB)?
            </p>
            <p className={styles.deleteModalWarning}>
              Sẽ xóa trên mọi thiết bị và trên Cloud. Hành động này không thể hoàn tác.
            </p>
            <div className={styles.deleteModalActions}>
              <button
                type="button"
                className={styles.deleteCancelBtn}
                onClick={() => setSeriesToDelete(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className={styles.deleteConfirmBtn}
                onClick={handleDeleteSeries}
                disabled={isDeleting}
              >
                {isDeleting ? 'Đang Xóa...' : 'Xóa Bộ Truyện'}
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
            <IconBookOpen size={36} />
          </div>
        )}
        <div className={styles.coverGradient} />
        {series.isCloudOnly && (
          <span className={styles.cloudOnlyTag}>
            <IconCloud size={11} />
            <span>Trên Cloud</span>
          </span>
        )}
        <button
          type="button"
          className={styles.cardDeleteBtn}
          title="Xóa bộ truyện"
          aria-label="Xóa bộ truyện"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <IconTrash size={14} />
        </button>
      </div>

      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle} title={series.title}>
          {series.title}
        </h3>
        <div className={styles.cardMeta}>
          <span>
            {series.volumeCount} tập
            {!series.isCloudOnly && series.totalBytes ? ` · ${formatMb(series.totalBytes)} MB` : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
