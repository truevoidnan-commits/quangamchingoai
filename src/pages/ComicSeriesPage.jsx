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
import {
  listRemote,
  downloadVolume,
  evictLocalVolume,
  deleteVolumeEverywhere,
  deleteSeriesEverywhere,
  uploadAllUnsyncedVolumes,
  updateVolumeMetadata,
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
} from '../components/comics/ComicIcons.jsx';
import styles from './ComicSeriesPage.module.css';

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
  });

  // Action Menu ⋯
  const [menuVolume, setMenuVolume] = useState(null);

  // Edit Volume Order & Title Modal (D2)
  const [volumeToEdit, setVolumeToEdit] = useState(null);
  const [editVolOrder, setEditVolOrder] = useState(1);
  const [editVolTitle, setEditVolTitle] = useState('');
  const [isSavingMeta, setIsSavingMeta] = useState(false);

  // Priority download state (A4)
  const [priorityDownloadingVol, setPriorityDownloadingVol] = useState(null);
  const [priorityProgress, setPriorityProgress] = useState(0);

  // Confirmation Modals (P1)
  const [volumeToDelete, setVolumeToDelete] = useState(null);
  const [seriesToDelete, setSeriesToDelete] = useState(null);
  const [volumeToEvict, setVolumeToEvict] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Batch upload state
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const [batchAbortCtrl, setBatchAbortCtrl] = useState(null);
  const [batchNotice, setBatchNotice] = useState('');

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  const loadData = useCallback(async () => {
    if (!seriesId) return;
    try {
      await cleanOrphanImportingVolumes();
      let s = await getSeries(seriesId);
      const cloudRes = await listRemote();
      setIsLoggedIn(cloudRes.isLoggedIn);

      // Nếu bộ truyện chưa có local, kiểm tra trên Cloud
      if (!s && cloudRes.isLoggedIn) {
        const remoteS = cloudRes.remoteSeries?.find((rs) => rs.id === seriesId);
        if (remoteS) {
          s = {
            id: remoteS.id,
            title: remoteS.title,
            isCloudOnly: true,
            createdAt: new Date(remoteS.created_at || Date.now()).getTime(),
            updatedAt: new Date(remoteS.updated_at || Date.now()).getTime(),
          };
        }
      }

      if (!s) {
        navigate('/comics', { replace: true });
        return;
      }

      setSeries(s);
      setEditTitleText(s.title);

      // Lấy danh sách tập local
      const localVols = await getVolumes(seriesId);
      const localVolMap = {};
      for (const lv of localVols) {
        localVolMap[lv.id] = lv;
      }

      // Hợp nhất các tập trên Cloud thuộc bộ này
      const mergedVols = [...localVols];
      if (cloudRes.isLoggedIn && cloudRes.remoteVolumes) {
        const seriesRemoteVols = cloudRes.remoteVolumes.filter(
          (rv) => rv.series_id === seriesId && rv.status === 'ready'
        );
        for (const rv of seriesRemoteVols) {
          if (!localVolMap[rv.id]) {
            mergedVols.push({
              id: rv.id,
              seriesId: rv.series_id,
              title: rv.title,
              order: Number(rv.order_no) || 1,
              pageCount: rv.page_count || 0,
              totalBytes: Number(rv.total_bytes) || 0,
              quality: rv.quality || 'balanced',
              isCloudOnly: true,
            });
          }
        }
      }

      mergedVols.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
      setVolumes(mergedVols);
      setCloudStatusMap(cloudRes.volumeStatusMap || {});

      // Lấy tiến độ đọc
      const pMap = {};
      for (const v of mergedVols) {
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

    const unsubQueue = subscribeSyncQueue((snap) => {
      setSyncSnapshot(snap);
    });

    const handleFocus = () => loadData();
    window.addEventListener('focus', handleFocus);

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      loadData();
    });

    const handleRealtime = () => loadData();
    window.addEventListener('tcl_comic_realtime_signal', handleRealtime);

    return () => {
      unsubQueue();
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('tcl_comic_realtime_signal', handleRealtime);
      authListener?.subscription?.unsubscribe();
    };
  }, [loadData]);

  // Object URL cho bìa bộ truyện
  useEffect(() => {
    let url = null;
    if (series?.coverBlob) {
      try {
        url = URL.createObjectURL(series.coverBlob);
        setCoverUrl(url);
      } catch (e) {}
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [series?.coverBlob]);

  // Bấm Đọc vào một tập (A4)
  const handleReadVolume = async (vol) => {
    const cloudStatus = cloudStatusMap[vol.id] || {
      status: vol.isCloudOnly ? 'cloud_only' : 'local_only',
    };
    const isCloudOnly = cloudStatus.status === 'cloud_only' || vol.isCloudOnly;

    // Nếu tập đã có trên máy: mở thẳng trình đọc
    if (!isCloudOnly) {
      navigate(`/comics/${seriesId}/read/${vol.id}`);
      return;
    }

    // Nếu tập Chỉ trên Cloud: Tải ưu tiên lên đầu hàng đợi và mở trình đọc khi xong
    setPriorityDownloadingVol(vol);
    setPriorityProgress(0);

    try {
      await priorityDownloadVolume(vol.id, seriesId, {
        volumeTitle: vol.title,
        onProgress: (p) => {
          setPriorityProgress(p.percent || 0);
        },
      });

      setPriorityDownloadingVol(null);
      await loadData();
      navigate(`/comics/${seriesId}/read/${vol.id}`);
    } catch (err) {
      console.error('Priority download error:', err);
      showToast(`Không thể tải tập để đọc: ${err.message || String(err)}`);
      setPriorityDownloadingVol(null);
    }
  };

  // Mở modal sửa thông tin tập (D2)
  const handleOpenEditModal = (vol) => {
    setVolumeToEdit(vol);
    setEditVolOrder(vol.order || 1);
    setEditVolTitle(vol.title || '');
    setMenuVolume(null);
  };

  const handleSaveVolumeMeta = async () => {
    if (!volumeToEdit) return;
    setIsSavingMeta(true);
    try {
      await updateVolumeMetadata(volumeToEdit.id, {
        order: Number(editVolOrder),
        title: editVolTitle,
      });

      // Cập nhật state cục bộ và sắp xếp lại danh sách
      setVolumes((prev) => {
        const next = prev.map((v) =>
          v.id === volumeToEdit.id
            ? { ...v, order: Number(editVolOrder), title: editVolTitle.trim() }
            : v
        );
        next.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
        return next;
      });

      showToast('Đã cập nhật số tập và tên tập!');
      setVolumeToEdit(null);
    } catch (err) {
      showToast(`Lỗi lưu: ${err.message}`);
    } finally {
      setIsSavingMeta(false);
    }
  };

  // Tải lên tất cả các tập chưa đồng bộ
  const handleUploadAllUnsynced = async () => {
    if (isBatchUploading) return;
    const abortCtrl = new AbortController();
    setBatchAbortCtrl(abortCtrl);
    setIsBatchUploading(true);

    const unsyncedList = volumes.filter((v) => {
      const s = cloudStatusMap[v.id]?.status;
      return (s === 'local_only' || s === 'uploading' || s === 'interrupted') && !v.isCloudOnly;
    });
    setBatchNotice(`Chuẩn bị đồng bộ ${unsyncedList.length} tập...`);

    try {
      const res = await uploadAllUnsyncedVolumes(seriesId, {
        signal: abortCtrl.signal,
        onProgress: (p) => {
          if (p.phase === 'rate_limited') {
            setBatchNotice(p.message || 'Đã chạm giới hạn thao tác, tự tiếp tục sau...');
          } else if (p.volumeId) {
            setBatchNotice(
              `Đang tải tập ${p.currentVolumeIndex || 1}/${p.totalVolumesCount || unsyncedList.length}: ${p.volumeTitle || ''}...`
            );
          }
        },
      });
      showToast(`Đã đồng bộ ${res.uploadedCount} tập lên Cloud thành công!`);
    } catch (err) {
      if (err.message?.includes('hủy') || abortCtrl.signal.aborted) {
        showToast('Đã dừng tiến trình tải lên hàng loạt.');
      } else {
        showToast(`Lỗi đồng bộ hàng loạt: ${err.message}`);
      }
    } finally {
      setIsBatchUploading(false);
      setBatchAbortCtrl(null);
      setBatchNotice('');
      await loadData();
    }
  };

  const handleConfirmEvict = async () => {
    if (!volumeToEvict) return;
    try {
      await evictLocalVolume(volumeToEvict.id);
      showToast(`Đã giải phóng bộ nhớ máy cho "${volumeToEvict.title}". Bản sao Cloud vẫn an toàn!`);
      setVolumeToEvict(null);
      loadData();
    } catch (err) {
      showToast(`Lỗi giải phóng bộ nhớ: ${err.message}`);
    }
  };

  const handleDeleteVolumeEverywhere = async () => {
    if (!volumeToDelete) return;
    try {
      setIsDeleting(true);
      await deleteVolumeEverywhere(volumeToDelete.id);
      showToast(`Đã xóa tập "${volumeToDelete.title}" trên mọi thiết bị và Cloud.`);
      setVolumeToDelete(null);
      await loadData();
    } catch (err) {
      showToast(`Lỗi xóa: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSeriesEverywhere = async () => {
    if (!seriesToDelete) return;
    try {
      setIsDeleting(true);
      await deleteSeriesEverywhere(seriesId);
      showToast(`Đã xóa bộ truyện "${series.title}" trên mọi thiết bị và Cloud.`);
      setSeriesToDelete(null);
      navigate('/comics', { replace: true });
    } catch (err) {
      showToast(`Lỗi xóa bộ truyện: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveTitle = async () => {
    if (!editTitleText.trim()) return;
    try {
      await updateSeries(seriesId, { title: editTitleText.trim() });
      setSeries((prev) => ({ ...prev, title: editTitleText.trim() }));
      setIsEditingTitle(false);
      showToast('Đã đổi tên bộ truyện');
    } catch (err) {
      showToast(`Lỗi cập nhật tên: ${err.message}`);
    }
  };

  const formatMb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

  // Đếm các tập chưa sync
  const unsyncedCount = volumes.filter((v) => {
    const s = cloudStatusMap[v.id]?.status;
    return (s === 'local_only' || s === 'uploading' || s === 'interrupted') && !v.isCloudOnly;
  }).length;

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
          <IconArrowLeft size={16} />
          <span>Danh Sách Truyện Tranh</span>
        </Link>
      </div>

      <div className={styles.container}>
        {/* Series Header Card */}
        <div className={styles.seriesHeader}>
          <div className={styles.coverWrap}>
            {coverUrl ? (
              <img src={coverUrl} alt={series.title} className={styles.coverImg} />
            ) : (
              <div className={styles.coverPlaceholder}>
                <IconBookOpen size={40} />
              </div>
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
                    >
                      <IconEdit size={16} />
                    </button>
                  )}
                </h1>
              )}
            </div>

            <div className={styles.statsBadges}>
              <div className={styles.statBadge}>
                <IconBookOpen size={14} />
                <span>{volumes.length} tập</span>
              </div>
              <div className={styles.statBadge}>
                <IconBook size={14} />
                <span>{series.totalPages || 0} trang</span>
              </div>
              <div className={styles.statBadge}>
                <IconDevice size={14} />
                <span>{formatMb(series.totalBytes || 0)} MB</span>
              </div>
            </div>

            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.importMoreBtn}
                onClick={() => setIsImportModalOpen(true)}
                id="btn-import-more-volumes"
              >
                <IconUpload size={15} />
                <span>Nhập Thêm Tập (PDF)</span>
              </button>

              {/* Upload all unsynced button (B5) */}
              {isLoggedIn && unsyncedCount > 0 && (
                <button
                  type="button"
                  className={styles.uploadAllBtn}
                  onClick={handleUploadAllUnsynced}
                  disabled={isBatchUploading}
                >
                  <IconCloudUpload size={15} />
                  <span>
                    {isBatchUploading
                      ? (batchNotice || 'Đang đồng bộ...')
                      : `Tải Lên Tất Cả (${unsyncedCount} tập)`}
                  </span>
                </button>
              )}

              <button
                type="button"
                className={styles.deleteSeriesBtn}
                onClick={() => setSeriesToDelete({ ...series, volumeCount: volumes.length, totalBytes: series.totalBytes || volumes.reduce((acc, v) => acc + (v.totalBytes || 0), 0) })}
              >
                <IconTrash size={15} />
                <span>Xóa Bộ Truyện</span>
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
                type="button"
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
                const hasProgress = !!prog && (prog.pageIndex > 0 || prog.scrollPercent > 0);

                // Queue state check
                const isTaskActive =
                  syncSnapshot.activeTask && syncSnapshot.activeTask.volumeId === vol.id;
                const isTaskQueued = syncSnapshot.pendingTasks.some(
                  (t) => t.volumeId === vol.id
                );
                const volFailure = getVolumeFailure(vol.id);

                const cloudStatus = cloudStatusMap[vol.id] || {
                  status: vol.isCloudOnly ? 'cloud_only' : 'local_only',
                };
                const isSynced = cloudStatus.status === 'synced';
                const isCloudOnly = cloudStatus.status === 'cloud_only' || vol.isCloudOnly;
                const isInterrupted = cloudStatus.status === 'interrupted';
                const isLocalOnly = !isSynced && !isCloudOnly;

                return (
                  <div key={vol.id} className={styles.volumeCard}>
                    {/* B1: Cột thông tin tập */}
                    <div className={styles.volumeMainCol}>
                      {/* Hàng 1: Số tập nhỏ + Tên tập */}
                      <div className={styles.volumeRow1}>
                        <span className={styles.volumeOrderBadge}>
                          Tập {vol.order || 1}
                        </span>
                        <h3 className={styles.volumeTitle} title={vol.title}>
                          {vol.title}
                        </h3>
                      </div>

                      {/* Hàng 2: Trạng thái tinh gọn (S1-S3) + metadata */}
                      <div className={styles.volumeRow2}>
                        {isTaskActive ? (
                          <span className={`${styles.statusBadge} ${styles.statusActive}`}>
                            <IconRefresh size={12} className={styles.spinIcon} />
                            <span>
                              Đang đồng bộ {syncSnapshot.activeTask.percent}%
                            </span>
                          </span>
                        ) : isTaskQueued ? (
                          <span className={`${styles.statusBadge} ${(typeof navigator !== 'undefined' && navigator.onLine === false) ? styles.statusOffline : styles.statusQueued}`}>
                            <IconClock size={12} />
                            <span>{(typeof navigator !== 'undefined' && navigator.onLine === false) ? 'Chờ mạng' : 'Đang chờ'}</span>
                          </span>
                        ) : volFailure ? (
                          <span
                            className={`${styles.statusBadge} ${styles.statusError}`}
                            title={volFailure.lastError}
                          >
                            <IconAlertTriangle size={12} />
                            <span>Lỗi đồng bộ</span>
                            <button
                              type="button"
                              className={styles.inlineRetryBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                retryFailedVolume(vol.id, seriesId, {
                                  type: volFailure.type || (vol.isCloudOnly ? 'download' : 'upload'),
                                  volumeTitle: vol.title,
                                });
                                showToast(`Đang thử lại đồng bộ cho "${vol.title}"...`);
                              }}
                            >
                              Thử lại
                            </button>
                          </span>
                        ) : isInterrupted ? (
                          <span className={`${styles.statusBadge} ${styles.statusInterrupted}`}>
                            <IconAlertTriangle size={12} />
                            <span>Dở dang ({cloudStatus.percent || 0}%)</span>
                          </span>
                        ) : isSynced ? (
                          /* S1: Đã đồng bộ không hiện nhãn chữ, chỉ một dấu tích SVG nhỏ mờ */
                          <span className={styles.statusSyncedMark} title="Đã đồng bộ">
                            <IconCheck size={14} />
                          </span>
                        ) : isCloudOnly ? (
                          /* S3: Chưa tải về máy này */
                          <button
                            type="button"
                            className={styles.quickSyncIconBtn}
                            title="Chưa tải về máy này"
                            aria-label="Chưa tải về máy này"
                            onClick={(e) => {
                              e.stopPropagation();
                              enqueueDownload(vol.id, seriesId, { volumeTitle: vol.title, isManual: true });
                              showToast(`Đã xếp hàng tải về "${vol.title}"`);
                            }}
                          >
                            <IconCloud size={14} />
                          </button>
                        ) : (
                          /* S3: Chưa lên Cloud */
                          <button
                            type="button"
                            className={styles.quickSyncIconBtn}
                            title="Chưa lên Cloud"
                            aria-label="Chưa lên Cloud"
                            onClick={(e) => {
                              e.stopPropagation();
                              enqueueUpload(vol.id, seriesId, { volumeTitle: vol.title, isManual: true });
                              showToast(`Đã xếp hàng tải lên "${vol.title}"`);
                            }}
                          >
                            <IconDevice size={14} />
                          </button>
                        )}

                        <span className={styles.volumeMetaText}>
                          {vol.pageCount || 0} trang · {formatMb(vol.totalBytes || 0)} MB
                        </span>
                      </div>
                    </div>

                    {/* B1: Cột bên phải (Nút Đọc / Hủy + Nút ⋯) */}
                    <div className={styles.volumeActionCol}>
                      {isTaskActive || isTaskQueued ? (
                        <button
                          type="button"
                          className={styles.cancelBtn}
                          onClick={() => {
                            cancelTask(vol.id);
                            showToast(`Đã hủy tác vụ cho "${vol.title}"`);
                          }}
                          title="Hủy tác vụ đồng bộ"
                        >
                          <IconX size={13} />
                          <span>Hủy</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.mainReadBtn}
                          onClick={() => handleReadVolume(vol)}
                        >
                          {hasProgress ? 'Đọc Tiếp' : 'Đọc'}
                        </button>
                      )}

                      <button
                        type="button"
                        className={styles.moreBtn}
                        onClick={() => setMenuVolume(vol)}
                        title="Tùy chọn khác"
                        aria-label="Tùy chọn khác"
                      >
                        <IconDotsVertical size={18} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ===== ACTION MENU ⋯ BOTTOM SHEET / POPOVER (B2) ===== */}
      {menuVolume && (
        <div className={styles.menuOverlay} onClick={() => setMenuVolume(null)}>
          <div className={styles.menuSheet} onClick={(e) => e.stopPropagation()}>
            <div className={styles.menuHeader}>
              <div className={styles.menuHeaderInfo}>
                <span className={styles.menuOrderBadge}>Tập {menuVolume.order || 1}</span>
                <span className={styles.menuTitleText}>{menuVolume.title}</span>
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
              {/* Thông tin lỗi đồng bộ & Nút thử lại nếu có */}
              {(() => {
                const fail = menuVolume ? getVolumeFailure(menuVolume.id) : null;
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
                        retryFailedVolume(menuVolume.id, seriesId, {
                          type: fail.type || (menuVolume.isCloudOnly ? 'download' : 'upload'),
                          volumeTitle: menuVolume.title,
                        });
                        showToast(`Đang thử lại đồng bộ cho "${menuVolume.title}"...`);
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
                    enqueueDownload(menuVolume.id, seriesId, { volumeTitle: menuVolume.title, isManual: true });
                    showToast('Đã xếp hàng tải về máy.');
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
                      enqueueUpload(menuVolume.id, seriesId, { volumeTitle: menuVolume.title, isManual: true });
                      showToast('Đã xếp hàng tải lên Cloud.');
                      setMenuVolume(null);
                    }}
                  >
                    <IconCloudUpload size={16} />
                    <span>Tải Lên Cloud</span>
                  </button>
                )}

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

      {/* ===== EDIT VOLUME ORDER & TITLE MODAL (D2) ===== */}
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

      {/* ===== PRIORITY DOWNLOAD PROGRESS OVERLAY (A4) ===== */}
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
              Xóa tập truyện này (Tập {volumeToDelete.order || 1}: {volumeToDelete.title}, {volumeToDelete.pageCount || 0} trang, {formatMb(volumeToDelete.totalBytes || 0)} MB)? Sẽ xóa trên mọi thiết bị và trên Cloud, không thể khôi phục.
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
              Xóa bộ truyện này ({seriesToDelete.volumeCount || volumes.length} tập, {formatMb(seriesToDelete.totalBytes || 0)} MB)? Sẽ xóa trên mọi thiết bị và trên Cloud, không thể khôi phục.
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
              Xóa dữ liệu ảnh trong máy của tập <strong>"{volumeToEvict.title}"</strong> ({formatMb(volumeToEvict.totalBytes || 0)} MB) để tiết kiệm dung lượng?
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
