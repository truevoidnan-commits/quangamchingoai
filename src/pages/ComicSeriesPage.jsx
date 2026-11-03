import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getSeries,
  getVolumes,
  deleteVolume,
  deleteSeries,
  updateSeries,
  getComicProgress,
  cleanOrphanImportingVolumes,
  saveSeries,
} from '../lib/comics/comicDb.js';
import {
  isCloudAvailable,
  listRemote,
  uploadVolume,
  downloadVolume,
  evictLocalVolume,
  deleteVolumeFromCloud,
  uploadAllUnsyncedVolumes,
} from '../lib/comics/comicCloud.js';
import { supabase } from '../lib/supabaseClient.js';
import ComicImportModal from '../components/comics/ComicImportModal.jsx';
import Footer from '../components/layout/Footer.jsx';
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

  // Active tasks for up/down: { [volumeId]: { phase: 'uploading'|'downloading'|'rate_limited', percent, abortCtrl, message } }
  const [activeTasks, setActiveTasks] = useState({});
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const [batchAbortCtrl, setBatchAbortCtrl] = useState(null);
  const [batchNotice, setBatchNotice] = useState('');
  const [queuedVolumeIds, setQueuedVolumeIds] = useState([]);

  // Modals for confirmations
  const [volumeToDeleteLocal, setVolumeToDeleteLocal] = useState(null);
  const [volumeToEvict, setVolumeToEvict] = useState(null);
  const [volumeToDeleteCloud, setVolumeToDeleteCloud] = useState(null);

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

      // If series not found in local IndexedDB, check if it exists on Cloud
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

      // Fetch local volumes
      const localVols = await getVolumes(seriesId);
      const localVolMap = {};
      for (const lv of localVols) {
        localVolMap[lv.id] = lv;
      }

      // Merge remote volumes for this series
      const mergedVols = [...localVols];
      if (cloudRes.isLoggedIn && cloudRes.remoteVolumes) {
        const seriesRemoteVols = cloudRes.remoteVolumes.filter((rv) => rv.series_id === seriesId && rv.status === 'ready');
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

      mergedVols.sort((a, b) => (a.order || 0) - (b.order || 0));
      setVolumes(mergedVols);
      setCloudStatusMap(cloudRes.volumeStatusMap || {});

      // Load reading progress for local volumes
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

    const handleFocus = () => loadData();
    window.addEventListener('focus', handleFocus);

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      loadData();
    });

    return () => {
      window.removeEventListener('focus', handleFocus);
      authListener?.subscription?.unsubscribe();
    };
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

  // ---------------------------------------------------------------------------
  // CLOUD ACTIONS
  // ---------------------------------------------------------------------------

  const handleUploadSingle = async (volumeId) => {
    if (isBatchUploading || activeTasks[volumeId]) return;
    const abortCtrl = new AbortController();
    setActiveTasks((prev) => ({
      ...prev,
      [volumeId]: { phase: 'uploading', percent: 0, abortCtrl },
    }));

    try {
      await uploadVolume(volumeId, {
        signal: abortCtrl.signal,
        onProgress: (p) => {
          setActiveTasks((prev) => {
            if (!prev[volumeId]) return prev;
            return {
              ...prev,
              [volumeId]: { ...prev[volumeId], percent: p.percent },
            };
          });
        },
      });

      showToast('Tải lên Cloud thành công! ✨');
    } catch (err) {
      const isAbort = err.name === 'AbortError' || err.message?.includes('hủy');
      if (isAbort) {
        // If 0 pages were uploaded, clear empty progress key
        try {
          const raw = localStorage.getItem(`tcl_comic_upload_${volumeId}`);
          if (raw) {
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr) || arr.length === 0) {
              localStorage.removeItem(`tcl_comic_upload_${volumeId}`);
            }
          }
        } catch {}
        showToast('Đã dừng tải lên.');
      } else {
        showToast(`Lỗi tải lên: ${err.message}`);
      }
    } finally {
      setActiveTasks((prev) => {
        const next = { ...prev };
        delete next[volumeId];
        return next;
      });
      await loadData();
    }
  };

  const handleDiscardUpload = async (volumeId) => {
    try {
      localStorage.removeItem(`tcl_comic_upload_${volumeId}`);
    } catch {}
    setCloudStatusMap((prev) => ({
      ...prev,
      [volumeId]: {
        ...(prev[volumeId] || {}),
        status: 'local_only',
        label: 'Chỉ trên máy này',
        percent: 0,
      },
    }));
    showToast('Đã hủy bỏ tiến độ dở dang, đưa về chỉ trên máy.');
    await loadData();
  };

  const handleDownloadSingle = async (volumeId) => {
    if (isBatchUploading || activeTasks[volumeId]) return;
    const abortCtrl = new AbortController();
    setActiveTasks((prev) => ({
      ...prev,
      [volumeId]: { phase: 'downloading', percent: 0, abortCtrl },
    }));

    try {
      await downloadVolume(volumeId, {
        signal: abortCtrl.signal,
        onProgress: (p) => {
          setActiveTasks((prev) => {
            if (!prev[volumeId]) return prev;
            return {
              ...prev,
              [volumeId]: { ...prev[volumeId], percent: p.percent },
            };
          });
        },
      });

      showToast('Tải về máy thành công! Bạn có thể đọc offline. ✨');
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('hủy')) {
        showToast('Đã hủy tải về.');
      } else {
        showToast(`Lỗi tải về: ${err.message}`);
      }
    } finally {
      setActiveTasks((prev) => {
        const next = { ...prev };
        delete next[volumeId];
        return next;
      });
      await loadData();
    }
  };

  const handleCancelTask = (volumeId) => {
    if (isBatchUploading) {
      handleCancelBatchUpload();
      return;
    }
    const task = activeTasks[volumeId];
    if (task?.abortCtrl) {
      task.abortCtrl.abort();
    }
  };

  const handleUploadAllUnsynced = async () => {
    if (isBatchUploading) return;
    const abortCtrl = new AbortController();
    setBatchAbortCtrl(abortCtrl);
    setIsBatchUploading(true);

    const unsyncedList = volumes.filter((v) => {
      const s = cloudStatusMap[v.id]?.status;
      return (s === 'local_only' || s === 'uploading' || s === 'interrupted') && !v.isCloudOnly;
    });
    const unsyncedIds = unsyncedList.map((v) => v.id);
    setQueuedVolumeIds(unsyncedIds);
    setBatchNotice(`Chuẩn bị đồng bộ ${unsyncedIds.length} tập...`);

    try {
      const res = await uploadAllUnsyncedVolumes(seriesId, {
        signal: abortCtrl.signal,
        onProgress: (p) => {
          if (p.phase === 'rate_limited') {
            const msg = p.message || 'Đã chạm giới hạn thao tác, tự tiếp tục sau...';
            setBatchNotice(msg);
            if (p.volumeId) {
              setActiveTasks({
                [p.volumeId]: { phase: 'rate_limited', percent: 0, message: msg },
              });
            }
          } else if (p.volumeId) {
            setBatchNotice(
              `Đang tải tập ${p.currentVolumeIndex || 1}/${p.totalVolumesCount || unsyncedIds.length}: ${p.volumeTitle || ''}...`
            );
            setActiveTasks({
              [p.volumeId]: { phase: 'uploading', percent: p.percent || 0 },
            });
            if (p.queuedVolumeIds) {
              const currentIdx = (p.currentVolumeIndex || 1) - 1;
              setQueuedVolumeIds(p.queuedVolumeIds.slice(currentIdx));
            }
          }
        },
      });
      showToast(`Đã đồng bộ ${res.uploadedCount} tập lên Cloud thành công! ✨`);
    } catch (err) {
      if (err.message?.includes('hủy') || abortCtrl.signal.aborted) {
        showToast('Đã dừng tiến trình tải lên hàng loạt.');
      } else {
        showToast(`Lỗi đồng bộ hàng loạt: ${err.message}`);
      }
    } finally {
      setIsBatchUploading(false);
      setQueuedVolumeIds([]);
      setActiveTasks({});
      setBatchAbortCtrl(null);
      setBatchNotice('');
      await loadData();
    }
  };

  const handleCancelBatchUpload = () => {
    if (batchAbortCtrl) {
      batchAbortCtrl.abort();
    }
  };

  const handleConfirmEvict = async () => {
    if (!volumeToEvict) return;
    try {
      await evictLocalVolume(volumeToEvict.id);
      showToast(`Đã giải phóng bộ nhớ máy cho "${volumeToEvict.title}". Bản sao Cloud vẫn an toàn! 🧹`);
      setVolumeToEvict(null);
      loadData();
    } catch (err) {
      showToast(`Lỗi giải phóng bộ nhớ: ${err.message}`);
    }
  };

  const handleConfirmDeleteCloud = async () => {
    if (!volumeToDeleteCloud) return;
    try {
      await deleteVolumeFromCloud(volumeToDeleteCloud.id);
      showToast(`Đã xóa vĩnh viễn "${volumeToDeleteCloud.title}" khỏi Cloud.`);
      setVolumeToDeleteCloud(null);
      loadData();
    } catch (err) {
      showToast(`Lỗi xóa khỏi Cloud: ${err.message}`);
    }
  };

  const handleDeleteLocalVolume = async () => {
    if (!volumeToDeleteLocal) return;
    try {
      await deleteVolume(volumeToDeleteLocal.id);
      showToast(`Đã xóa "${volumeToDeleteLocal.title}" khỏi máy.`);
      setVolumeToDeleteLocal(null);
      loadData();
    } catch (err) {
      showToast(`Lỗi xóa: ${err.message}`);
    }
  };

  const handleDeleteSeriesConfirm = async () => {
    if (!window.confirm(`Xác nhận xóa bộ truyện "${series?.title}" cùng tất cả các tập trên máy?`)) {
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

  // Check how many volumes are unsynced
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
                  {!series.isCloudOnly && (
                    <button
                      className={styles.editBtn}
                      title="Đổi tên bộ truyện"
                      onClick={() => setIsEditingTitle(true)}
                    >
                      ✏️
                    </button>
                  )}
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

              {/* Upload all unsynced button */}
              {isLoggedIn && unsyncedCount > 0 && (
                <>
                  <button
                    className={styles.uploadAllBtn}
                    onClick={handleUploadAllUnsynced}
                    disabled={isBatchUploading}
                  >
                    ☁️ {isBatchUploading ? (batchNotice || 'Đang đồng bộ...') : `Tải lên tất cả (${unsyncedCount} tập)`}
                  </button>
                  {isBatchUploading && (
                    <button
                      className={styles.cancelBatchBtn}
                      onClick={handleCancelBatchUpload}
                      title="Hủy hàng đợi tải lên"
                    >
                      🛑 Hủy
                    </button>
                  )}
                </>
              )}

              {!series.isCloudOnly && (
                <button
                  className={styles.deleteSeriesBtn}
                  onClick={handleDeleteSeriesConfirm}
                >
                  🗑️ Xóa Khỏi Máy
                </button>
              )}
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

                const activeTask = activeTasks[vol.id];
                const cloudStatus = cloudStatusMap[vol.id] || { status: vol.isCloudOnly ? 'cloud_only' : 'local_only' };
                const isSynced = cloudStatus.status === 'synced';
                const isCloudOnly = cloudStatus.status === 'cloud_only' || vol.isCloudOnly;
                const isActivelyUploading = activeTask?.phase === 'uploading';
                const isActivelyDownloading = activeTask?.phase === 'downloading';
                const isRateLimited = activeTask?.phase === 'rate_limited';
                const isQueued = isBatchUploading && queuedVolumeIds.includes(vol.id) && !activeTask;
                const isInterrupted = !activeTask && !isQueued && cloudStatus.status === 'interrupted';
                const isLocalOnly = !isSynced && !isCloudOnly && !isInterrupted && !isQueued && !activeTask;

                return (
                  <div key={vol.id} className={styles.volumeCard}>
                    <div className={styles.volumeLeft}>
                      <span className={styles.volumeOrderBadge}>
                        Tập {vol.order || 1}
                      </span>
                      <div className={styles.volumeMetaInfo}>
                        <div className={styles.titleRow}>
                          <h3 className={styles.volumeTitle}>{vol.title}</h3>
                          {/* Sync Status Badge (only if logged in) */}
                          {isLoggedIn && (
                            <span
                              className={`${styles.statusBadge} ${
                                isSynced
                                  ? styles.statusSynced
                                  : (isActivelyUploading || isRateLimited)
                                  ? styles.statusUploading
                                  : isQueued
                                  ? styles.statusQueued
                                  : isInterrupted
                                  ? styles.statusInterrupted
                                  : isCloudOnly
                                  ? styles.statusCloud
                                  : styles.statusLocal
                              }`}
                            >
                              {isSynced && '☁️ Đã đồng bộ'}
                              {isRateLimited && '⏳ Tạm dừng (chờ giới hạn)'}
                              {isActivelyUploading && `⏳ Đang tải lên ${activeTask?.percent || 0}%`}
                              {isQueued && '⏳ Đang chờ'}
                              {isInterrupted && `⚠ Tải lên dở dang (${cloudStatus.percent || 0}%)`}
                              {isCloudOnly && '☁️ Chỉ trên cloud'}
                              {isLocalOnly && '💾 Chỉ trên máy này'}
                            </span>
                          )}
                        </div>

                        <div className={styles.volumeSubText}>
                          <span>{vol.pageCount} trang</span>
                          <span>·</span>
                          <span>{formatMb(vol.totalBytes || 0)} MB</span>
                          <span>·</span>
                          <span className={styles.qualityTag}>{vol.quality || 'balanced'}</span>
                        </div>

                        {/* Active Progress Bar for Upload / Download */}
                        {(isActivelyUploading || isActivelyDownloading || isRateLimited) && (
                          <div className={styles.taskProgressContainer}>
                            <div className={styles.taskProgressTrack}>
                              <div
                                className={styles.taskProgressFill}
                                style={{ width: `${activeTask?.percent || 0}%` }}
                              />
                            </div>
                            <div className={styles.taskProgressText}>
                              <span>
                                {isRateLimited
                                  ? (activeTask?.message || 'Đã chạm giới hạn thao tác, tự tiếp tục sau...')
                                  : isActivelyUploading
                                  ? 'Đang tải lên Cloudflare R2...'
                                  : 'Đang tải về máy...'}
                              </span>
                              <span>{isRateLimited ? '⏳' : `${activeTask?.percent || 0}%`}</span>
                            </div>
                          </div>
                        )}

                        {/* Reading Progress */}
                        {prog && !isCloudOnly && (
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
                      {/* Active Cancel Button */}
                      {(isActivelyUploading || isActivelyDownloading || isRateLimited) ? (
                        <button
                          className={`${styles.syncBtn} ${styles.syncBtnDanger}`}
                          onClick={() => handleCancelTask(vol.id)}
                        >
                          ✕ Hủy
                        </button>
                      ) : isQueued ? (
                        <span className={styles.queuedHint}>Đang trong hàng đợi...</span>
                      ) : (
                        <>
                          {/* If on machine: Read button */}
                          {!isCloudOnly && (
                            <button
                              className={styles.readBtn}
                              onClick={() => navigate(`/comics/${seriesId}/read/${vol.id}`)}
                            >
                              {prog ? 'Đọc Tiếp ➔' : 'Bắt Đầu Đọc ➔'}
                            </button>
                          )}

                          {/* Cloud Sync Actions (Only if logged in) */}
                          {isLoggedIn && (
                            <>
                              {/* Interrupted Actions: Resume & Discard */}
                              {isInterrupted && (
                                <>
                                  <button
                                    className={`${styles.syncBtn} ${styles.syncBtnResume}`}
                                    title="Tiếp tục tải lên các trang còn lại"
                                    disabled={isBatchUploading}
                                    onClick={() => handleUploadSingle(vol.id)}
                                  >
                                    ▶ Tiếp tục
                                  </button>
                                  <button
                                    className={`${styles.syncBtn} ${styles.syncBtnDiscard}`}
                                    title="Hủy bỏ tiến độ dở dang, đưa về chỉ trên máy"
                                    disabled={isBatchUploading}
                                    onClick={() => handleDiscardUpload(vol.id)}
                                  >
                                    ✕ Bỏ dở
                                  </button>
                                </>
                              )}

                              {/* Upload Button */}
                              {isLocalOnly && (
                                <button
                                  className={`${styles.syncBtn} ${styles.syncBtnPrimary}`}
                                  title="Tải tập này lên Cloud"
                                  disabled={isBatchUploading}
                                  onClick={() => handleUploadSingle(vol.id)}
                                >
                                  ☁️ Tải lên
                                </button>
                              )}

                              {/* Download Button */}
                              {isCloudOnly && (
                                <button
                                  className={`${styles.syncBtn} ${styles.syncBtnPrimary}`}
                                  title="Tải tập này về máy để đọc offline"
                                  disabled={isBatchUploading}
                                  onClick={() => handleDownloadSingle(vol.id)}
                                >
                                  ⬇️ Tải về
                                </button>
                              )}

                              {/* Evict Local Volume (Only if Synced) */}
                              {isSynced && (
                                <button
                                  className={styles.syncBtn}
                                  title="Xóa trang ảnh trên máy để tiết kiệm dung lượng, vẫn giữ nguyên trên Cloud"
                                  disabled={isBatchUploading}
                                  onClick={() => setVolumeToEvict(vol)}
                                >
                                  💾 Giải phóng máy
                                </button>
                              )}

                              {/* Delete from Cloud (Only if on cloud) */}
                              {(isSynced || isCloudOnly) && (
                                <button
                                  className={`${styles.syncBtn} ${styles.syncBtnDanger}`}
                                  title="Xóa tập này khỏi Cloud"
                                  disabled={isBatchUploading}
                                  onClick={() => setVolumeToDeleteCloud(vol)}
                                >
                                  ☁️ Xóa Cloud
                                </button>
                              )}
                            </>
                          )}

                          {/* Delete Local Volume (if on machine and not synced) */}
                          {!isCloudOnly && !isSynced && !isBatchUploading && (
                            <button
                              className={styles.deleteVolumeBtn}
                              title="Xóa tập này khỏi máy"
                              onClick={() => setVolumeToDeleteLocal(vol)}
                            >
                              🗑️
                            </button>
                          )}
                        </>
                      )}
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

      {/* Modal: Xác nhận xóa tập cục bộ */}
      {volumeToDeleteLocal && (
        <div className={styles.deleteModalOverlay} onClick={() => setVolumeToDeleteLocal(null)}>
          <div className={styles.deleteModalBox} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.deleteModalTitle}>Xác nhận xóa tập khỏi máy</h3>
            <p className={styles.deleteModalDesc}>
              Bạn có chắc muốn xóa <strong>"{volumeToDeleteLocal.title}"</strong> ({volumeToDeleteLocal.pageCount} trang, {formatMb(volumeToDeleteLocal.totalBytes || 0)} MB)?
            </p>
            <p className={styles.deleteModalWarning}>
              Tập này chưa được tải lên Cloud. Thao tác này sẽ xóa vĩnh viễn trên máy.
            </p>
            <div className={styles.deleteModalActions}>
              <button
                className={styles.deleteCancelBtn}
                onClick={() => setVolumeToDeleteLocal(null)}
              >
                Hủy
              </button>
              <button
                className={styles.deleteConfirmBtn}
                onClick={handleDeleteLocalVolume}
              >
                Xóa Tập
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Xác nhận Giải phóng máy (Evict local, keep Cloud) */}
      {volumeToEvict && (
        <div className={styles.deleteModalOverlay} onClick={() => setVolumeToEvict(null)}>
          <div className={styles.deleteModalBox} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.deleteModalTitle}>Giải phóng bộ nhớ máy</h3>
            <p className={styles.deleteModalDesc}>
              Xóa dữ liệu ảnh trong máy của tập <strong>"{volumeToEvict.title}"</strong> ({formatMb(volumeToEvict.totalBytes || 0)} MB) để tiết kiệm dung lượng?
            </p>
            <p className={styles.deleteModalDesc} style={{ color: '#38bdf8' }}>
              🛡️ <strong>Bản sao trên Cloudflare R2 vẫn được giữ nguyên vẹn 100%.</strong> Bạn có thể tải lại về máy bất cứ lúc nào.
            </p>
            <div className={styles.deleteModalActions}>
              <button
                className={styles.deleteCancelBtn}
                onClick={() => setVolumeToEvict(null)}
              >
                Hủy
              </button>
              <button
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

      {/* Modal: Xác nhận Xóa khỏi Cloud */}
      {volumeToDeleteCloud && (
        <div className={styles.deleteModalOverlay} onClick={() => setVolumeToDeleteCloud(null)}>
          <div className={styles.deleteModalBox} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.deleteModalTitle}>Xóa tập khỏi Cloud</h3>
            <p className={styles.deleteModalDesc}>
              Xác nhận xóa tập <strong>"{volumeToDeleteCloud.title}"</strong> khỏi Cloudflare R2 và Supabase?
            </p>
            <p className={styles.deleteModalWarning}>
              Thao tác này sẽ xóa toàn bộ trang ảnh đã lưu trên Cloud và không thể khôi phục từ Cloud.
            </p>
            <div className={styles.deleteModalActions}>
              <button
                className={styles.deleteCancelBtn}
                onClick={() => setVolumeToDeleteCloud(null)}
              >
                Hủy
              </button>
              <button
                className={styles.deleteConfirmBtn}
                onClick={handleConfirmDeleteCloud}
              >
                Xóa Khỏi Cloud
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
