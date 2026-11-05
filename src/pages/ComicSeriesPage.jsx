import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import {
  listRemote,
  downloadVolume,
  evictLocalVolume,
  deleteVolumeEverywhere,
  deleteSeriesEverywhere,
  uploadAllUnsyncedVolumes,
  updateVolumeMetadata,
  updateSeriesMetadata,
} from '../lib/comics/comicCloud.js';
import {
  subscribeSyncQueue,
  priorityDownloadVolume,
  enqueueDownload,
  enqueueUpload,
  cancelTask,
  retryFailedVolume,
  getVolumeFailure,
} from '../lib/comics/comicSyncQueue.js';
import { supabase } from '../lib/supabaseClient.js';
import ComicImportModal from '../components/comics/ComicImportModal.jsx';
import ComicsBackdrop from '../components/comics/ComicsBackdrop.jsx';
import Footer from '../components/layout/Footer.jsx';
import {
  IconArrowLeft,
  IconBook,
  IconBookOpen,
  IconDevice,
  IconCloud,
  IconCloudCheck,
  IconCloudUpload,
  IconCloudDownload,
  IconDotsVertical,
  IconEdit,
  IconTrash,
  IconRefresh,
  IconClock,
  IconUpload,
  IconX,
  IconCheck,
  IconAlertTriangle,
  IconPlay,
} from '../components/comics/ComicIcons.jsx';
import styles from './ComicSeriesPage.module.css';

// Unaccent string normalization
const norm = (str) =>
  (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

const formatMb = (bytes) => {
  if (!bytes) return '0 MB';
  return (
    (bytes / (1024 * 1024)).toLocaleString('vi-VN', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + ' MB'
  );
};

const formatTotalBytes = (bytes) => {
  if (!bytes) return '0 MB';
  if (bytes >= 1000 * 1024 * 1024) {
    return (
      (bytes / (1024 * 1024 * 1024)).toLocaleString('vi-VN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + ' GB'
    );
  }
  return (
    (bytes / (1024 * 1024)).toLocaleString('vi-VN', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + ' MB'
  );
};

// ==========================================
// Memoized Volume Row
// ==========================================
const VolumeRow = React.memo(function VolumeRow({
  vol,
  index,
  prog,
  isLatestRead,
  cloudStatus,
  isTaskActive,
  isTaskQueued,
  activeTaskPercent,
  volFailure,
  onRead,
  onOpenMenu,
  onRetry,
  onCancelTask,
  onReimport,
  onDeleteIncomplete,
  onQuickUpload,
  onQuickDownload,
}) {
  const isSynced = cloudStatus.status === 'synced';
  const isCloudOnly = cloudStatus.status === 'cloud_only' || vol.isCloudOnly;
  const isInterrupted = cloudStatus.status === 'interrupted';
  const isImporting = vol.importState === 'importing';

  const isCompleted = prog && prog.pageIndex >= Math.max(0, (vol.pageCount || 1) - 1);
  const hasProgress = !!prog && (prog.pageIndex > 0 || prog.scrollPercent > 0);
  const isReading = hasProgress && !isCompleted;

  const progressPercent = useMemo(() => {
    if (!prog || !vol.pageCount) return 0;
    return Math.min(100, Math.round(((prog.pageIndex + 1) / vol.pageCount) * 100));
  }, [prog, vol.pageCount]);

  const orderDisplay = useMemo(() => {
    if (vol.order == null) return '01';
    const num = Number(vol.order);
    if (Number.isInteger(num)) {
      return num < 10 && num >= 0 ? `0${num}` : String(num);
    }
    return String(vol.order);
  }, [vol.order]);

  return (
    <div
      className={`${styles.volumeRow} ${isLatestRead ? styles.latestReadRow : ''}`}
      style={{ '--i': Math.min(index, 10) }}
      onClick={() => onRead(vol)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRead(vol);
        }
      }}
    >
      {/* 1. Left: Order square (48x48) */}
      <div className={styles.orderBox}>
        <span className={styles.orderNum}>{orderDisplay}</span>
      </div>

      {/* 2. Center: Info */}
      <div className={styles.volInfoCol}>
        <div className={styles.volTitleRow}>
          <h3 className={styles.volTitle} title={vol.title}>
            {vol.title}
          </h3>
          {isLatestRead && <span className={styles.readingBadge}>Đang đọc</span>}
        </div>

        <div className={styles.volSubtitleRow}>
          <span className={styles.volMetaText}>
            {(vol.pageCount || 0).toLocaleString('vi-VN')} trang · {formatMb(vol.totalBytes || 0)}
          </span>
          {isCompleted && (
            <span className={styles.completedMark} title="Đã đọc xong">
              <IconCheck size={13} />
            </span>
          )}
        </div>

        {/* Reading progress bar */}
        {isReading && (
          <div className={styles.progressRow}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className={styles.progressText}>
              Trang {(prog.pageIndex || 0) + 1}/{vol.pageCount || 1}
            </span>
          </div>
        )}
      </div>

      {/* 3. Right: Sync status icon + Action buttons */}
      <div className={styles.volActionsCol} onClick={(e) => e.stopPropagation()}>
        {/* Single 20px sync icon */}
        <div className={styles.syncIconSlot}>
          {isTaskActive ? (
            <span
              className={styles.syncSpinning}
              title={`Đang đồng bộ ${activeTaskPercent}%`}
            >
              <IconRefresh size={18} className={styles.spinIcon} />
              <span className={styles.syncPercentText}>{activeTaskPercent}%</span>
            </span>
          ) : isTaskQueued ? (
            <span
              className={styles.syncIconWrap}
              title={typeof navigator !== 'undefined' && navigator.onLine === false ? 'Chờ mạng' : 'Đang chờ'}
            >
              <IconClock size={18} className={styles.iconQueued} />
            </span>
          ) : volFailure ? (
            <button
              type="button"
              className={styles.syncIconButton}
              title={`Lỗi đồng bộ: ${volFailure.lastError}. Bấm để thử lại.`}
              onClick={() => onRetry(vol, volFailure)}
            >
              <IconAlertTriangle size={18} className={styles.iconError} />
            </button>
          ) : isInterrupted ? (
            <span
              className={styles.syncIconWrap}
              title={`Dở dang (${cloudStatus.percent || 0}%)`}
            >
              <IconAlertTriangle size={18} className={styles.iconInterrupted} />
            </span>
          ) : isSynced ? (
            <span className={styles.syncIconWrap} title="Đã đồng bộ">
              <IconCloudCheck size={20} className={styles.iconSynced} />
            </span>
          ) : isCloudOnly ? (
            <button
              type="button"
              className={styles.syncIconButton}
              title="Chưa tải về máy này - Bấm để tải về"
              aria-label="Chưa tải về máy này"
              onClick={() => onQuickDownload(vol)}
            >
              <IconCloudDownload size={20} className={styles.iconDownload} />
            </button>
          ) : (
            <button
              type="button"
              className={styles.syncIconButton}
              title="Chưa lên Cloud - Bấm để tải lên"
              aria-label="Chưa lên Cloud"
              onClick={() => onQuickUpload(vol)}
            >
              <IconCloudUpload size={20} className={styles.iconUpload} />
            </button>
          )}
        </div>

        {/* Read / Action buttons */}
        {isImporting ? (
          <div className={styles.importingActions}>
            <button
              type="button"
              className={styles.reimportBtn}
              onClick={() => onReimport(vol)}
              title="Nhập lại tập này"
            >
              Nhập lại
            </button>
            <button
              type="button"
              className={styles.deleteIncompleteBtn}
              onClick={() => onDeleteIncomplete(vol)}
              title="Xóa tập dở dang"
            >
              Xóa
            </button>
          </div>
        ) : isTaskActive || isTaskQueued ? (
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() => onCancelTask(vol.id)}
            title="Hủy tác vụ đồng bộ"
          >
            <IconX size={14} />
            <span>Hủy</span>
          </button>
        ) : (
          <button
            type="button"
            className={styles.mainReadBtn}
            onClick={() => onRead(vol)}
            title={hasProgress ? 'Đọc tiếp' : 'Đọc'}
          >
            <IconPlay size={15} className={styles.readIcon} />
            <span className={styles.readLabel}>{hasProgress ? 'Đọc Tiếp' : 'Đọc'}</span>
          </button>
        )}

        {/* More ⋯ */}
        <button
          type="button"
          className={styles.moreBtn}
          onClick={() => onOpenMenu(vol)}
          title="Tùy chọn khác"
          aria-label="Tùy chọn khác"
        >
          <IconDotsVertical size={18} />
        </button>
      </div>
    </div>
  );
});

// ==========================================
// Main ComicSeriesPage Component
// ==========================================
export default function ComicSeriesPage() {
  const { seriesId } = useParams();
  const navigate = useNavigate();

  const [series, setSeries] = useState(null);
  const [volumes, setVolumes] = useState([]);
  const [progressMap, setProgressMap] = useState({});
  const [cloudStatusMap, setCloudStatusMap] = useState({});
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [coverUrl, setCoverUrl] = useState(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleText, setEditTitleText] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  // Queue state
  const [syncSnapshot, setSyncSnapshot] = useState({
    activeTask: null,
    pendingTasks: [],
    completedToday: 0,
    storageWarning: null,
  });

  // Action Menu Sheet (B2)
  const [menuVolume, setMenuVolume] = useState(null);

  // Series Action Dropdown
  const [seriesMenuOpen, setSeriesMenuOpen] = useState(false);

  // Edit Volume Order & Title Modal (D2)
  const [volumeToEdit, setVolumeToEdit] = useState(null);
  const [editVolOrder, setEditVolOrder] = useState(1);
  const [editVolTitle, setEditVolTitle] = useState('');
  const [isSavingMeta, setIsSavingMeta] = useState(false);

  // Priority Download Overlay (A4)
  const [priorityDownloadingVol, setPriorityDownloadingVol] = useState(null);
  const [priorityProgress, setPriorityProgress] = useState(0);

  // Confirmation Modals (P1)
  const [volumeToDelete, setVolumeToDelete] = useState(null);
  const [seriesToDelete, setSeriesToDelete] = useState(null);
  const [volumeToEvict, setVolumeToEvict] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Batch upload state (B5)
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const [batchAbortCtrl, setBatchAbortCtrl] = useState(null);
  const [batchNotice, setBatchNotice] = useState('');

  // Search & Filter & Sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' | 'desc'
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'unread' | 'reading' | 'cloud' | 'local'

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  // Close series menu on outside click
  useEffect(() => {
    if (!seriesMenuOpen) return;
    const handleDocClick = () => setSeriesMenuOpen(false);
    window.addEventListener('click', handleDocClick);
    return () => window.removeEventListener('click', handleDocClick);
  }, [seriesMenuOpen]);

  // Load series & volume details
  const loadData = useCallback(async () => {
    try {
      await cleanOrphanImportingVolumes();
      const s = await getSeries(seriesId);
      if (!s) {
        navigate('/comics');
        return;
      }
      setSeries(s);
      setEditTitleText(s.title);

      const vols = await getVolumes(seriesId);
      setVolumes(vols);

      // Load cover URL
      if (s.coverBlob) {
        const url = URL.createObjectURL(s.coverBlob);
        setCoverUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } else if (vols.length > 0 && vols[0].coverBlob) {
        const url = URL.createObjectURL(vols[0].coverBlob);
        setCoverUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      }

      // Load reading progress
      const pMap = {};
      for (const v of vols) {
        const prog = await getComicProgress(v.id);
        if (prog) pMap[v.id] = prog;
      }
      setProgressMap(pMap);

      // Load cloud sync status
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        setIsLoggedIn(!!user);
        if (user) {
          const remoteMap = await listRemote();
          const remoteSeries = remoteMap[seriesId];
          const csMap = {};
          for (const v of vols) {
            const remoteVol = remoteSeries?.volumes?.[v.id];
            if (remoteVol) {
              if (remoteVol.status === 'ready') {
                csMap[v.id] = { status: v.isCloudOnly ? 'cloud_only' : 'synced' };
              } else if (remoteVol.status === 'uploading') {
                csMap[v.id] = { status: 'uploading', percent: remoteVol.uploadProgress || 0 };
              } else if (remoteVol.status === 'interrupted') {
                csMap[v.id] = { status: 'interrupted', percent: remoteVol.uploadProgress || 0 };
              }
            } else {
              csMap[v.id] = { status: v.isCloudOnly ? 'cloud_only' : 'local_only' };
            }
          }
          setCloudStatusMap(csMap);
        }
      }
    } catch (err) {
      console.error('[ComicSeriesPage] Load error:', err);
      showToast(`Lỗi tải dữ liệu: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [seriesId, navigate]);

  useEffect(() => {
    loadData();
    return () => {
      if (coverUrl) URL.revokeObjectURL(coverUrl);
    };
  }, [loadData]);

  // Subscribe to sync queue
  useEffect(() => {
    const unsub = subscribeSyncQueue((snap) => {
      setSyncSnapshot(snap);
      if (snap.activeTask?.volumeId && priorityDownloadingVol?.id === snap.activeTask.volumeId) {
        setPriorityProgress(snap.activeTask.percent || 0);
      }
    });
    return unsub;
  }, [priorityDownloadingVol]);

  // Handle focus & storage events
  useEffect(() => {
    const handleFocus = () => loadData();
    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleFocus);

    let channel = null;
    if (supabase) {
      channel = supabase
        .channel(`series_detail_${seriesId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'comic_volumes', filter: `series_id=eq.${seriesId}` }, () => loadData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'comic_series', filter: `id=eq.${seriesId}` }, () => loadData())
        .subscribe();
    }

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleFocus);
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadData, seriesId]);

  // Total calculations
  const totalPageCount = useMemo(() => {
    if (series?.totalPages) return series.totalPages;
    return volumes.reduce((acc, v) => acc + (v.pageCount || 0), 0);
  }, [series, volumes]);

  const totalBytes = useMemo(() => {
    if (series?.totalBytes) return series.totalBytes;
    return volumes.reduce((acc, v) => acc + (v.totalBytes || 0), 0);
  }, [series, volumes]);

  // Latest volume to continue reading
  const latestVolumeToRead = useMemo(() => {
    if (volumes.length === 0) return null;

    let latestVol = null;
    let latestTime = 0;

    for (const vol of volumes) {
      const prog = progressMap[vol.id];
      if (prog && (prog.pageIndex > 0 || prog.scrollPercent > 0)) {
        const time = prog.updatedAt ? new Date(prog.updatedAt).getTime() : 0;
        if (time >= latestTime) {
          latestTime = time;
          latestVol = vol;
        }
      }
    }

    if (latestVol) {
      return { vol: latestVol, isContinuing: true };
    }

    const sorted = [...volumes].sort((a, b) => (a.order || 0) - (b.order || 0));
    return { vol: sorted[0], isContinuing: false };
  }, [volumes, progressMap]);

  const latestReadVolId = latestVolumeToRead?.isContinuing ? latestVolumeToRead.vol.id : null;

  // Unsynced count for series
  const unsyncedCount = useMemo(() => {
    return volumes.filter((v) => {
      const s = cloudStatusMap[v.id]?.status;
      return (s === 'local_only' || s === 'uploading' || s === 'interrupted') && !v.isCloudOnly;
    }).length;
  }, [volumes, cloudStatusMap]);

  // Counts for filter chips
  const { unreadCount, readingCount, cloudOnlyCount, localOnlyCount } = useMemo(() => {
    let unread = 0;
    let reading = 0;
    let cloudOnly = 0;
    let localOnly = 0;

    for (const vol of volumes) {
      const prog = progressMap[vol.id];
      const isCompleted = prog && prog.pageIndex >= Math.max(0, (vol.pageCount || 1) - 1);
      const hasProgress = !!prog && (prog.pageIndex > 0 || prog.scrollPercent > 0);

      if (hasProgress && !isCompleted) {
        reading++;
      } else if (!hasProgress && !isCompleted) {
        unread++;
      }

      const cloudStatus = cloudStatusMap[vol.id] || {
        status: vol.isCloudOnly ? 'cloud_only' : 'local_only',
      };
      if (cloudStatus.status === 'cloud_only' || vol.isCloudOnly) {
        cloudOnly++;
      } else if (cloudStatus.status !== 'synced') {
        localOnly++;
      }
    }

    return {
      unreadCount: unread,
      readingCount: reading,
      cloudOnlyCount: cloudOnly,
      localOnlyCount: localOnly,
    };
  }, [volumes, progressMap, cloudStatusMap]);

  // Filtered & Sorted volumes
  const filteredVolumes = useMemo(() => {
    const q = norm(searchQuery.trim());
    return volumes
      .filter((vol) => {
        // Search filter
        if (q) {
          const matchesTitle = norm(vol.title).includes(q);
          const matchesOrder = String(vol.order).includes(q);
          if (!matchesTitle && !matchesOrder) return false;
        }

        // Chip filter
        if (activeFilter === 'all') return true;

        const prog = progressMap[vol.id];
        const isCompleted = prog && prog.pageIndex >= Math.max(0, (vol.pageCount || 1) - 1);
        const hasProgress = !!prog && (prog.pageIndex > 0 || prog.scrollPercent > 0);

        if (activeFilter === 'unread') {
          return !hasProgress && !isCompleted;
        }
        if (activeFilter === 'reading') {
          return hasProgress && !isCompleted;
        }

        const cloudStatus = cloudStatusMap[vol.id] || {
          status: vol.isCloudOnly ? 'cloud_only' : 'local_only',
        };
        if (activeFilter === 'cloud') {
          return cloudStatus.status === 'cloud_only' || vol.isCloudOnly;
        }
        if (activeFilter === 'local') {
          return cloudStatus.status !== 'synced' && !vol.isCloudOnly;
        }

        return true;
      })
      .sort((a, b) => {
        const orderA = a.order != null ? a.order : 0;
        const orderB = b.order != null ? b.order : 0;
        return sortOrder === 'asc' ? orderA - orderB : orderB - orderA;
      });
  }, [volumes, searchQuery, activeFilter, sortOrder, progressMap, cloudStatusMap]);

  // Reading handler
  const handleReadVolume = async (vol) => {
    if (!vol) return;
    if (vol.isCloudOnly) {
      setPriorityDownloadingVol(vol);
      setPriorityProgress(0);
      try {
        await priorityDownloadVolume(vol.id, seriesId, {
          onProgress: (p) => setPriorityProgress(p),
        });
        setPriorityDownloadingVol(null);
        navigate(`/comics/${seriesId}/read/${vol.id}`);
      } catch (err) {
        setPriorityDownloadingVol(null);
        showToast(`Tải tập thất bại: ${err.message}`);
      }
      return;
    }
    navigate(`/comics/${seriesId}/read/${vol.id}`);
  };

  // Open Edit Volume Modal
  const handleOpenEditModal = (vol) => {
    setVolumeToEdit(vol);
    setEditVolOrder(vol.order != null ? vol.order : 1);
    setEditVolTitle(vol.title || '');
    setMenuVolume(null);
  };

  // Save Volume Meta
  const handleSaveVolumeMeta = async () => {
    if (!volumeToEdit) return;
    setIsSavingMeta(true);
    try {
      const parsedOrder = parseFloat(editVolOrder);
      const updates = {
        order: !isNaN(parsedOrder) ? parsedOrder : volumeToEdit.order,
        title: editVolTitle.trim() || volumeToEdit.title,
      };

      await updateVolumeMetadata(volumeToEdit.id, updates);
      showToast('Đã lưu thông tin tập thành công!');
      setVolumeToEdit(null);
      await loadData();
    } catch (err) {
      showToast(`Lỗi lưu thông tin: ${err.message}`);
    } finally {
      setIsSavingMeta(false);
    }
  };

  // Batch upload unsynced
  const handleUploadAllUnsynced = async () => {
    if (isBatchUploading) {
      if (batchAbortCtrl) batchAbortCtrl.abort();
      setIsBatchUploading(false);
      setBatchNotice('');
      return;
    }
    const ac = new AbortController();
    setBatchAbortCtrl(ac);
    setIsBatchUploading(true);
    setBatchNotice('Đang chuẩn bị tải lên...');

    try {
      const res = await uploadAllUnsyncedVolumes(seriesId, {
        signal: ac.signal,
        onProgress: (cur, total, volTitle) => {
          setBatchNotice(`Đang tải ${cur}/${total}: ${volTitle}`);
        },
      });
      if (res.aborted) {
        showToast('Đã dừng tải lên.');
      } else {
        showToast(`Đồng bộ hoàn tất: ${res.succeeded} thành công, ${res.failed} thất bại.`);
      }
      await loadData();
    } catch (err) {
      showToast(`Lỗi tải lên: ${err.message}`);
    } finally {
      setIsBatchUploading(false);
      setBatchAbortCtrl(null);
      setBatchNotice('');
    }
  };

  // Confirm Evict local volume
  const handleConfirmEvict = async () => {
    if (!volumeToEvict) return;
    try {
      await evictLocalVolume(volumeToEvict.id);
      showToast(`Đã giải phóng máy cho tập "${volumeToEvict.title}".`);
      setVolumeToEvict(null);
      await loadData();
    } catch (err) {
      showToast(`Lỗi giải phóng: ${err.message}`);
    }
  };

  // Delete Volume everywhere
  const handleDeleteVolumeEverywhere = async () => {
    if (!volumeToDelete) return;
    setIsDeleting(true);
    try {
      await deleteVolumeEverywhere(volumeToDelete.id, seriesId);
      showToast(`Đã xóa tập "${volumeToDelete.title}".`);
      setVolumeToDelete(null);
      await loadData();
    } catch (err) {
      showToast(`Lỗi xóa tập: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Delete Series everywhere
  const handleDeleteSeriesEverywhere = async () => {
    if (!seriesToDelete) return;
    setIsDeleting(true);
    try {
      await deleteSeriesEverywhere(seriesId);
      showToast(`Đã xóa bộ truyện "${seriesToDelete.title}".`);
      setSeriesToDelete(null);
      navigate('/comics');
    } catch (err) {
      showToast(`Lỗi xóa bộ truyện: ${err.message}`);
      setIsDeleting(false);
    }
  };

  // Rename Series
  const handleSaveTitle = async () => {
    if (!editTitleText.trim() || editTitleText === series.title) {
      setIsEditingTitle(false);
      return;
    }
    try {
      await updateSeriesMetadata(seriesId, { title: editTitleText.trim() });
      setSeries((prev) => ({ ...prev, title: editTitleText.trim() }));
      setIsEditingTitle(false);
      showToast('Đã cập nhật tên bộ truyện!');
    } catch (err) {
      showToast(`Lỗi cập nhật tên: ${err.message}`);
    }
  };

  // Retry failed volume
  const handleRetryVolume = useCallback((vol, fail) => {
    retryFailedVolume(vol.id, seriesId, {
      type: fail?.type || (vol.isCloudOnly ? 'download' : 'upload'),
      volumeTitle: vol.title,
    });
    showToast(`Đang thử lại đồng bộ cho "${vol.title}"...`);
  }, [seriesId]);

  // Quick download
  const handleQuickDownload = useCallback((vol) => {
    enqueueDownload(vol.id, seriesId, { volumeTitle: vol.title, isManual: true });
    showToast(`Đã xếp hàng tải về "${vol.title}"`);
  }, [seriesId]);

  // Quick upload
  const handleQuickUpload = useCallback((vol) => {
    enqueueUpload(vol.id, seriesId, { volumeTitle: vol.title, isManual: true });
    showToast(`Đã xếp hàng tải lên "${vol.title}"`);
  }, [seriesId]);

  // Cancel task
  const handleCancelTask = useCallback((volumeId) => {
    cancelTask(volumeId);
    showToast('Đã hủy tác vụ đồng bộ.');
  }, []);

  // Reimport
  const handleReimport = useCallback(async (vol) => {
    await deleteVolume(vol.id);
    await loadData();
    setIsImportModalOpen(true);
  }, [loadData]);

  // Delete incomplete
  const handleDeleteIncomplete = useCallback(async (vol) => {
    await deleteVolume(vol.id);
    await loadData();
    showToast(`Đã xóa tập dở dang "${vol.title}"`);
  }, [loadData]);

  // ==========================================
  // Render: Loading Skeleton (CLS = 0)
  // ==========================================
  if (loading) {
    return (
      <div className={styles.page}>
        <ComicsBackdrop />
        <div className={styles.topNav}>
          <div className={styles.backBtnSkeleton} />
        </div>

        <div className={styles.container}>
          {/* Hero skeleton */}
          <div className={`${styles.heroSection} ${styles.heroSkeleton}`}>
            <div className={styles.coverSkeleton} />
            <div className={styles.heroInfoSkeleton}>
              <div className={styles.titleSkeleton} />
              <div className={styles.statsSkeleton} />
              <div className={styles.actionsSkeleton}>
                <div className={styles.btnSkeletonPrimary} />
                <div className={styles.btnSkeletonSecondary} />
              </div>
            </div>
          </div>

          {/* Toolbar skeleton */}
          <div className={styles.toolbarSkeleton}>
            <div className={styles.searchSkeleton} />
            <div className={styles.chipsSkeleton} />
          </div>

          {/* 6 VolumeRow skeletons */}
          <div className={styles.volumeGrid}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className={`${styles.volumeRow} ${styles.rowSkeleton}`}>
                <div className={styles.orderBoxSkeleton} />
                <div className={styles.volInfoSkeleton}>
                  <div className={styles.lineSkeleton1} />
                  <div className={styles.lineSkeleton2} />
                </div>
                <div className={styles.actionSkeleton} />
              </div>
            ))}
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!series) return null;

  return (
    <div className={styles.page}>
      <ComicsBackdrop />

      {/* Top Navigation */}
      <div className={styles.topNav}>
        <Link to="/comics" className={styles.backBtn}>
          <IconArrowLeft size={16} />
          <span>Danh Sách Truyện Tranh</span>
        </Link>
      </div>

      <div className={styles.container}>
        {/* ========================================== */}
        {/* HERO SECTION                               */}
        {/* ========================================== */}
        <section className={styles.heroSection}>
          {/* Blurred cover backdrop */}
          <div className={styles.heroBackdrop} aria-hidden="true">
            {coverUrl ? (
              <img src={coverUrl} alt="" className={styles.heroBackdropImg} />
            ) : (
              <div className={styles.heroBackdropGradient} />
            )}
            <div className={styles.heroBackdropOverlay} />
          </div>

          <div className={styles.heroContent}>
            {/* Raised cover */}
            <div className={styles.coverWrap}>
              {coverUrl ? (
                <img src={coverUrl} alt={series.title} className={styles.coverImg} />
              ) : (
                <div className={styles.coverPlaceholder}>
                  <IconBookOpen size={48} />
                </div>
              )}
            </div>

            {/* Info column */}
            <div className={styles.heroInfo}>
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
                    <button type="button" className={styles.saveTitleBtn} onClick={handleSaveTitle}>
                      Lưu
                    </button>
                    <button
                      type="button"
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
                    <span>{series.title}</span>
                    {!series.isCloudOnly && (
                      <button
                        type="button"
                        className={styles.editBtn}
                        title="Đổi tên bộ truyện"
                        onClick={() => setIsEditingTitle(true)}
                        aria-label="Đổi tên bộ truyện"
                      >
                        <IconEdit size={16} />
                      </button>
                    )}
                  </h1>
                )}
              </div>

              {/* Single line muted stats */}
              <div className={styles.statsLine}>
                <span>{volumes.length.toLocaleString('vi-VN')} tập</span>
                <span className={styles.statsDot}>·</span>
                <span>{totalPageCount.toLocaleString('vi-VN')} trang</span>
                <span className={styles.statsDot}>·</span>
                <span>{formatTotalBytes(totalBytes)}</span>
              </div>

              {/* Action buttons */}
              <div className={styles.heroActions}>
                {/* Primary Read button */}
                {latestVolumeToRead && (
                  <button
                    type="button"
                    className={styles.primaryReadBtn}
                    onClick={() => handleReadVolume(latestVolumeToRead.vol)}
                  >
                    <IconPlay size={17} />
                    <span>
                      {latestVolumeToRead.isContinuing
                        ? `Đọc tiếp Tập ${latestVolumeToRead.vol.order || 1}`
                        : 'Bắt đầu đọc'}
                    </span>
                  </button>
                )}

                {/* Import more volumes */}
                <button
                  type="button"
                  className={styles.importMoreBtn}
                  onClick={() => setIsImportModalOpen(true)}
                  id="btn-import-more-volumes"
                >
                  <IconUpload size={16} />
                  <span>Nhập thêm tập</span>
                </button>

                {/* Series More ⋯ Menu */}
                <div className={styles.seriesMenuWrap} onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className={styles.seriesMoreBtn}
                    onClick={() => setSeriesMenuOpen((prev) => !prev)}
                    title="Tùy chọn bộ truyện"
                    aria-label="Tùy chọn bộ truyện"
                  >
                    <IconDotsVertical size={18} />
                  </button>

                  {seriesMenuOpen && (
                    <div className={styles.seriesMenuDropdown}>
                      {isLoggedIn && unsyncedCount > 0 && (
                        <>
                          <button
                            type="button"
                            className={styles.seriesMenuItem}
                            onClick={() => {
                              setSeriesMenuOpen(false);
                              handleUploadAllUnsynced();
                            }}
                            disabled={isBatchUploading}
                          >
                            <IconCloudUpload size={16} />
                            <span>
                              {isBatchUploading
                                ? (batchNotice || 'Đang đồng bộ...')
                                : `Tải lên tất cả (${unsyncedCount} tập)`}
                            </span>
                          </button>
                          <div className={styles.seriesMenuDivider} />
                        </>
                      )}

                      <button
                        type="button"
                        className={`${styles.seriesMenuItem} ${styles.deleteSeriesBtn}`}
                        onClick={() => {
                          setSeriesMenuOpen(false);
                          setSeriesToDelete({
                            ...series,
                            volumeCount: volumes.length,
                            totalBytes: totalBytes,
                          });
                        }}
                      >
                        <IconTrash size={16} />
                        <span>Xóa bộ truyện</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================== */}
        {/* STICKY TOOLBAR & FILTER CHIPS              */}
        {/* ========================================== */}
        <div className={styles.stickyToolbar}>
          {/* Top row: Count header + Search input + Sort toggle */}
          <div className={styles.toolbarRow1}>
            <span className={styles.volumesCountText}>
              {volumes.length.toLocaleString('vi-VN')} tập
            </span>

            <div className={styles.searchWrap}>
              <span className={styles.searchIcon} aria-hidden="true">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="search"
                placeholder="Tìm tập hoặc số..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.searchInput}
                aria-label="Tìm tập hoặc số"
              />
            </div>

            <button
              type="button"
              className={styles.sortBtn}
              onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              title={sortOrder === 'asc' ? 'Đang sắp xếp: Tăng dần (Bấm để giảm dần)' : 'Đang sắp xếp: Giảm dần (Bấm để tăng dần)'}
              aria-label="Đổi chiều sắp xếp"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="m3 16 4 4 4-4" />
                <path d="M7 20V4" />
                <path d="m21 8-4-4-4 4" />
                <path d="M17 4v16" />
              </svg>
              <span>{sortOrder === 'asc' ? 'Tập 1→N' : 'Tập N→1'}</span>
            </button>
          </div>

          {/* Bottom row: Filter Chips */}
          <div className={styles.chipsScroll}>
            <button
              type="button"
              className={`${styles.filterChip} ${activeFilter === 'all' ? styles.chipActive : ''}`}
              onClick={() => setActiveFilter('all')}
            >
              Tất cả <span className={styles.chipCount}>{volumes.length}</span>
            </button>

            {unreadCount > 0 && (
              <button
                type="button"
                className={`${styles.filterChip} ${activeFilter === 'unread' ? styles.chipActive : ''}`}
                onClick={() => setActiveFilter('unread')}
              >
                Chưa đọc <span className={styles.chipCount}>{unreadCount}</span>
              </button>
            )}

            {readingCount > 0 && (
              <button
                type="button"
                className={`${styles.filterChip} ${activeFilter === 'reading' ? styles.chipActive : ''}`}
                onClick={() => setActiveFilter('reading')}
              >
                Đang đọc <span className={styles.chipCount}>{readingCount}</span>
              </button>
            )}

            {cloudOnlyCount > 0 && (
              <button
                type="button"
                className={`${styles.filterChip} ${activeFilter === 'cloud' ? styles.chipActive : ''}`}
                onClick={() => setActiveFilter('cloud')}
              >
                Chưa tải về <span className={styles.chipCount}>{cloudOnlyCount}</span>
              </button>
            )}

            {localOnlyCount > 0 && (
              <button
                type="button"
                className={`${styles.filterChip} ${activeFilter === 'local' ? styles.chipActive : ''}`}
                onClick={() => setActiveFilter('local')}
              >
                Chưa đồng bộ <span className={styles.chipCount}>{localOnlyCount}</span>
              </button>
            )}
          </div>
        </div>

        {/* ========================================== */}
        {/* VOLUME LIST                                */}
        {/* ========================================== */}
        {volumes.length === 0 ? (
          <div className={styles.emptyVolumes}>
            <IconBookOpen size={44} className={styles.emptyIcon} />
            <h3 className={styles.emptyTitle}>Chưa có tập nào</h3>
            <p className={styles.emptyDesc}>Hãy nhập tập truyện tranh đầu tiên từ file PDF.</p>
            <button
              type="button"
              className={styles.emptyImportBtn}
              onClick={() => setIsImportModalOpen(true)}
            >
              + Nhập tập (PDF)
            </button>
          </div>
        ) : filteredVolumes.length === 0 ? (
          <div className={styles.emptyFilter}>
            <IconAlertTriangle size={36} className={styles.emptyFilterIcon} />
            <h3 className={styles.emptyFilterTitle}>Không có tập phù hợp</h3>
            <p className={styles.emptyFilterDesc}>Thử tìm với từ khóa khác hoặc xóa bộ lọc để xem toàn bộ danh sách.</p>
            <button
              type="button"
              className={styles.clearFilterBtn}
              onClick={() => {
                setSearchQuery('');
                setActiveFilter('all');
              }}
            >
              Xóa bộ lọc
            </button>
          </div>
        ) : (
          <div className={styles.volumeGrid}>
            {filteredVolumes.map((vol, index) => {
              const prog = progressMap[vol.id];
              const isTaskActive =
                syncSnapshot.activeTask && syncSnapshot.activeTask.volumeId === vol.id;
              const isTaskQueued = syncSnapshot.pendingTasks.some(
                (t) => t.volumeId === vol.id
              );
              const volFailure = getVolumeFailure(vol.id);
              const cloudStatus = cloudStatusMap[vol.id] || {
                status: vol.isCloudOnly ? 'cloud_only' : 'local_only',
              };

              return (
                <VolumeRow
                  key={vol.id}
                  vol={vol}
                  index={index}
                  prog={prog}
                  isLatestRead={vol.id === latestReadVolId}
                  cloudStatus={cloudStatus}
                  isTaskActive={isTaskActive}
                  isTaskQueued={isTaskQueued}
                  activeTaskPercent={syncSnapshot.activeTask?.percent || 0}
                  volFailure={volFailure}
                  onRead={handleReadVolume}
                  onOpenMenu={(v) => setMenuVolume(v)}
                  onRetry={handleRetryVolume}
                  onCancelTask={handleCancelTask}
                  onReimport={handleReimport}
                  onDeleteIncomplete={handleDeleteIncomplete}
                  onQuickUpload={handleQuickUpload}
                  onQuickDownload={handleQuickDownload}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* VOLUME ACTION BOTTOM SHEET (B2)            */}
      {/* ========================================== */}
      {menuVolume && (
        <div className={styles.menuOverlay} onClick={() => setMenuVolume(null)}>
          <div className={styles.menuSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.menuDragHandle} />
            <div className={styles.menuHeader}>
              <div className={styles.menuHeaderInfo}>
                <span className={styles.menuOrderBadge}>Tập {menuVolume.order || 1}</span>
                <h4 className={styles.menuTitleText}>{menuVolume.title}</h4>
              </div>
              <button
                type="button"
                className={styles.menuCloseBtn}
                onClick={() => setMenuVolume(null)}
                aria-label="Đóng menu"
              >
                <IconX size={18} />
              </button>
            </div>

            <div className={styles.menuList}>
              {/* Failure card if any */}
              {(() => {
                const fail = getVolumeFailure(menuVolume.id);
                if (!fail) return null;
                return (
                  <div className={styles.menuFailureCard}>
                    <div className={styles.menuFailureHeader}>
                      <IconAlertTriangle size={15} />
                      <span>Lỗi Đồng Bộ ({fail.type === 'upload' ? 'Tải lên' : 'Tải về'})</span>
                    </div>
                    <p className={styles.menuFailureReason}>{fail.lastError}</p>
                    <button
                      type="button"
                      className={styles.menuRetryBtn}
                      onClick={() => {
                        handleRetryVolume(menuVolume, fail);
                        setMenuVolume(null);
                      }}
                    >
                      <IconRefresh size={14} />
                      <span>Thử Lại Ngay</span>
                    </button>
                  </div>
                );
              })()}

              {/* 1. Sửa Số Tập / Tên Tập */}
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => handleOpenEditModal(menuVolume)}
              >
                <IconEdit size={16} />
                <span>Sửa Số Tập / Tên Tập</span>
              </button>

              {/* 2. Giải Phóng Máy (chỉ khi đã đồng bộ) */}
              {cloudStatusMap[menuVolume.id]?.status === 'synced' && (
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    setVolumeToEvict(menuVolume);
                    setMenuVolume(null);
                  }}
                >
                  <IconDevice size={16} />
                  <span>Giải Phóng Máy</span>
                </button>
              )}

              {/* 3. Tải Về Máy (khi Chỉ trên cloud) */}
              {(cloudStatusMap[menuVolume.id]?.status === 'cloud_only' || menuVolume.isCloudOnly) && (
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={() => {
                    handleQuickDownload(menuVolume);
                    setMenuVolume(null);
                  }}
                >
                  <IconCloudDownload size={16} />
                  <span>Tải Về Máy</span>
                </button>
              )}

              {/* 4. Tải Lên Cloud (khi Chỉ trên máy) */}
              {cloudStatusMap[menuVolume.id]?.status !== 'synced' &&
                cloudStatusMap[menuVolume.id]?.status !== 'cloud_only' &&
                !menuVolume.isCloudOnly &&
                isLoggedIn && (
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      handleQuickUpload(menuVolume);
                      setMenuVolume(null);
                    }}
                  >
                    <IconCloudUpload size={16} />
                    <span>Tải Lên Cloud</span>
                  </button>
                )}

              <div className={styles.menuDivider} />

              {/* 5. Xóa (đỏ, xóa ở mọi nơi - P1) */}
              <button
                type="button"
                className={`${styles.menuItem} ${styles.menuItemDanger}`}
                onClick={() => {
                  setVolumeToDelete(menuVolume);
                  setMenuVolume(null);
                }}
              >
                <IconTrash size={16} />
                <span>Xóa</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* EDIT VOLUME ORDER & TITLE MODAL (D2)       */}
      {/* ========================================== */}
      {volumeToEdit && (
        <div className={styles.editModalOverlay} onClick={() => setVolumeToEdit(null)}>
          <div className={styles.editModalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.editModalHeader}>
              <IconEdit size={18} />
              <h3>Sửa Số Tập & Tên Tập</h3>
            </div>

            <div className={styles.editModalBody}>
              <div className={styles.editField}>
                <label className={styles.editLabel}>Số Tập</label>
                <input
                  type="number"
                  step="any"
                  min="1"
                  className={styles.editOrderInput}
                  value={editVolOrder}
                  onChange={(e) => setEditVolOrder(e.target.value)}
                  autoFocus
                />
              </div>

              <div className={styles.editField}>
                <label className={styles.editLabel}>Tên Tập</label>
                <input
                  type="text"
                  className={styles.editTitleInput}
                  value={editVolTitle}
                  onChange={(e) => setEditVolTitle(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.editModalFooter}>
              <button
                type="button"
                className={styles.editCancelBtn}
                onClick={() => setVolumeToEdit(null)}
                disabled={isSavingMeta}
              >
                Hủy
              </button>
              <button
                type="button"
                className={styles.editSaveBtn}
                onClick={handleSaveVolumeMeta}
                disabled={isSavingMeta || !editVolTitle.trim()}
              >
                {isSavingMeta ? 'Đang Lưu...' : 'Lưu Thay Đổi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* PRIORITY DOWNLOAD OVERLAY (A4)             */}
      {/* ========================================== */}
      {priorityDownloadingVol && (
        <div className={styles.priorityOverlay}>
          <div className={styles.priorityBox}>
            <div className={styles.priorityIconWrap}>
              <IconCloudDownload size={32} />
            </div>
            <h3 className={styles.priorityTitle}>Đang Tải Tập Về Máy Để Đọc...</h3>
            <p className={styles.priorityVolName}>
              Tập {priorityDownloadingVol.order}: {priorityDownloadingVol.title}
            </p>

            <div className={styles.priorityProgressTrack}>
              <div
                className={styles.priorityProgressFill}
                style={{ width: `${priorityProgress}%` }}
              />
            </div>
            <div className={styles.priorityPercent}>{priorityProgress}%</div>

            <p className={styles.priorityHint}>
              Trình đọc sẽ tự động mở ngay sau khi tải xong. Vui lòng giữ tab này mở.
            </p>

            <button
              type="button"
              className={styles.priorityCancelBtn}
              onClick={() => {
                cancelTask(priorityDownloadingVol.id);
                setPriorityDownloadingVol(null);
                showToast(`Đã hủy tải tập "${priorityDownloadingVol.title}"`);
              }}
            >
              <IconX size={14} />
              <span>Hủy Tải Về</span>
            </button>
          </div>
        </div>
      )}

      {/* Import Modal */}
      <ComicImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        initialSeriesId={seriesId}
        initialSeriesTitle={series.title}
        allSeries={[series]}
        onImportSuccess={() => {
          showToast('Nhập tập mới thành công!');
          loadData();
        }}
      />

      {/* Modal: Xác nhận xóa tập ở mọi nơi (P1) */}
      {volumeToDelete && (
        <div className={styles.deleteModalOverlay} onClick={() => !isDeleting && setVolumeToDelete(null)}>
          <div className={styles.deleteModalBox} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.deleteModalTitle}>Xác Nhận Xóa Tập Truyện</h3>
            <p className={styles.deleteModalDesc}>
              Xóa tập truyện này (Tập {volumeToDelete.order || 1}: {volumeToDelete.title}, {volumeToDelete.pageCount || 0} trang, {formatMb(volumeToDelete.totalBytes || 0)})? Sẽ xóa trên mọi thiết bị và trên Cloud, không thể khôi phục.
            </p>
            <div className={styles.deleteModalActions}>
              <button
                type="button"
                className={styles.deleteCancelBtn}
                disabled={isDeleting}
                onClick={() => setVolumeToDelete(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className={styles.deleteConfirmBtn}
                disabled={isDeleting}
                onClick={handleDeleteVolumeEverywhere}
              >
                {isDeleting ? 'Đang Xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Xác nhận xóa cả bộ truyện (P1) */}
      {seriesToDelete && (
        <div className={styles.deleteModalOverlay} onClick={() => !isDeleting && setSeriesToDelete(null)}>
          <div className={styles.deleteModalBox} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.deleteModalTitle}>Xác Nhận Xóa Bộ Truyện</h3>
            <p className={styles.deleteModalDesc}>
              Xóa bộ truyện này ({seriesToDelete.volumeCount || volumes.length} tập, {formatMb(seriesToDelete.totalBytes || 0)})? Sẽ xóa trên mọi thiết bị và trên Cloud, không thể khôi phục.
            </p>
            <div className={styles.deleteModalActions}>
              <button
                type="button"
                className={styles.deleteCancelBtn}
                disabled={isDeleting}
                onClick={() => setSeriesToDelete(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className={styles.deleteConfirmBtn}
                disabled={isDeleting}
                onClick={handleDeleteSeriesEverywhere}
              >
                {isDeleting ? 'Đang Xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Xác nhận Giải phóng máy (Evict local, keep Cloud) */}
      {volumeToEvict && (
        <div className={styles.deleteModalOverlay} onClick={() => setVolumeToEvict(null)}>
          <div className={styles.deleteModalBox} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.deleteModalTitle}>Giải Phóng Bộ Nhớ Máy</h3>
            <p className={styles.deleteModalDesc}>
              Xóa dữ liệu ảnh trong máy của tập <strong>"{volumeToEvict.title}"</strong> ({formatMb(volumeToEvict.totalBytes || 0)}) để tiết kiệm dung lượng?
            </p>
            <p className={styles.deleteModalDesc} style={{ color: '#38bdf8' }}>
              Bản sao trên Cloud vẫn được giữ nguyên vẹn. Bạn có thể tải lại về máy bất cứ lúc nào.
            </p>
            <div className={styles.deleteModalActions}>
              <button
                type="button"
                className={styles.deleteCancelBtn}
                onClick={() => setVolumeToEvict(null)}
              >
                Hủy
              </button>
              <button
                type="button"
                className={styles.deleteConfirmBtn}
                style={{ background: '#0284c7', borderColor: '#38bdf8' }}
                onClick={handleConfirmEvict}
              >
                Giải Phóng Bộ Nhớ
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
