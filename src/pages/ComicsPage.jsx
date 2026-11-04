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
import {
  IconCloud,
  IconCloudCheck,
  IconDevice,
  IconBook,
  IconBookOpen,
  IconSettings,
  IconUpload,
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

      // Hợp nhất danh sách bộ truyện local với danh sách trên Cloud (P4 & Sửa 1, 4: tính cả 'uploading' và 10 phút bảo vệ, không delete thụ động)
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

    // Lắng nghe thay đổi hàng đợi đồng bộ
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

  // Tính toán dung lượng
  const cloudUsedGb = (cloudInfo.cloudUsageBytes / (1024 * 1024 * 1024)).toFixed(2);
  const cloudTotalGb = '8.0';
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
            Đọc truyện tranh mượt mà và lưu ngoại tuyến trên mọi thiết bị.
          </p>
          <div className={styles.neonBar} aria-hidden="true" />
        </div>
      </section>

      {/* ===== TAB SWITCHER ===== */}
      <div className={styles.tabSwitcherWrap}>
        <div className={styles.tabSwitcher}>
          <Link to="/" className={styles.tabItem}>
            <IconBook size={15} />
            <span>Truyện Chữ</span>
          </Link>
          <div className={`${styles.tabItem} ${styles.tabItemActive}`}>
            <IconBookOpen size={15} />
            <span>Truyện Tranh</span>
          </div>
        </div>
      </div>

      <div className={styles.container}>
        {/* ===== COMBINED STORAGE BAR & SETTINGS (B4) ===== */}
        <div className={styles.compactStorageCard}>
          <div className={styles.storageTopRow}>
            <div className={styles.storageStatsGroup}>
              {cloudInfo.isLoggedIn && (
                <div className={styles.storagePill} title="Dung lượng đã dùng trên Cloud">
                  <IconCloud size={15} className={styles.cloudIcon} />
                  <span>{cloudUsedGb} / {cloudTotalGb} GB</span>
                </div>
              )}
              {cloudInfo.isLoggedIn && storageStats && (
                <span className={styles.storageDot}>·</span>
              )}
              {storageStats && (
                <div className={styles.storagePill} title="Dung lượng lưu trong máy này">
                  <IconDevice size={15} className={styles.deviceIcon} />
                  <span>{formatMb(storageStats.comicsBytes)} MB trên máy</span>
                </div>
              )}
            </div>

            <button
              type="button"
              className={styles.settingsBtn}
              onClick={() => setIsSettingsOpen(true)}
              title="Cài đặt đồng bộ & bộ nhớ"
              aria-label="Cài đặt đồng bộ & bộ nhớ"
            >
              <IconSettings size={18} />
              <span className={styles.settingsBtnLabel}>Cài Đặt</span>
            </button>
          </div>

          {/* Thin subtle storage bar */}
          <div className={styles.storageTrackMini}>
            <div
              className={styles.storageFillMini}
              style={{ width: `${cloudInfo.isLoggedIn ? cloudPercent : Math.min(100, Math.round(((storageStats?.storageUsage || 0) / (storageStats?.storageQuota || 1)) * 100))}%` }}
            />
          </div>

          {/* ===== AUTO-SYNC STATUS BANNER (A7 & A5) ===== */}
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
            ) : cloudInfo.isLoggedIn ? (
              <div className={styles.syncAlertReady}>
                <IconCloudCheck size={15} />
                <span>Đã đồng bộ đầy đủ</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* ===== ACTIONS BAR ===== */}
        <div className={styles.actionsBar}>
          <div className={styles.actionsLeft}>
            <h2 className={styles.sectionTitle}>
              Danh Sách Bộ Truyện ({seriesList.length})
            </h2>
          </div>
          <button
            type="button"
            className={styles.importBtn}
            onClick={() => setIsImportModalOpen(true)}
            id="btn-import-pdf-comics"
          >
            <IconUpload size={16} />
            <span>Nhập Truyện Tranh (PDF)</span>
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
            <span className={styles.emptyIcon}>
              <IconBookOpen size={48} />
            </span>
            <h3>Chưa có truyện tranh nào</h3>
            <p>
              Nhập file PDF tập truyện để bắt đầu đọc tranh offline mượt mà hoặc đồng bộ giữa các thiết bị.
            </p>
            <button
              type="button"
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

      {/* ===== SETTINGS BOTTOM SHEET / MODAL (B4) ===== */}
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
              {/* Tự động tải về thiết bị (A2) */}
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

              {/* Tự động tải lên Cloud (A3) */}
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
              Hành động này sẽ xóa vĩnh viễn toàn bộ trang ảnh đã lưu trên máy.
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
            <IconBookOpen size={36} />
          </div>
        )}
        <div className={styles.coverGradient} />
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
        <div className={styles.titleRow}>
          <h3 className={styles.cardTitle} title={series.title}>
            {series.title}
          </h3>
          {series.isCloudOnly && (
            <span className={styles.cloudOnlyTag}>
              <IconCloud size={12} />
              <span>Trên Cloud</span>
            </span>
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
