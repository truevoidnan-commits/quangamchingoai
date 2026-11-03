/**
 * Comic Cloud Sync Engine for Thiên Cơ Lâu (Phase 2)
 * 
 * Synchronizes comics with Supabase (metadata & reading progress)
 * and Cloudflare R2 (presigned URL uploads/downloads of WebP pages).
 * 
 * Key Principles:
 * - Client NEVER holds R2 keys; uses short-lived presigned URLs from Supabase Edge Function.
 * - Streams pages one by one; does NOT load whole volume into memory.
 * - Resume support: tracks uploaded page indices in localStorage.
 * - Concurrency: 4 parallel uploads/downloads with exponential backoff retries.
 * - Eviction safety: NEVER evicts local volume if not fully ready on Cloud.
 * - Passive-open guard: only writes reading progress to cloud after genuine user interaction.
 */

import { supabase as defaultSupabase } from '../supabaseClient.js';
import {
  getVolume,
  getSeries,
  saveSeries,
  saveVolume,
  updateVolume,
  deleteVolume,
  savePagesBulk,
  getComicProgress,
  saveComicProgress,
} from './comicDb.js';

const UPLOAD_BATCH_SIZE = 100;
const CONCURRENCY_LIMIT = 4;
const RETRY_DELAYS = [1000, 2000, 4000, 8000]; // 4 retries with exponential backoff

/**
 * Lightweight async pool for controlled concurrency
 */
export async function asyncPool(limit, items, iteratorFn) {
  const executing = new Set();
  const results = [];
  for (const item of items) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

/**
 * Helper sleep with AbortSignal support
 */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Thao tác đã bị hủy'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Thao tác đã bị hủy'));
    }, { once: true });
  });
}

/**
 * Checks if a Supabase user session is active
 */
export async function getCloudUser(customSupabase = null) {
  const client = customSupabase || defaultSupabase;
  try {
    const { data: { session } } = await client.auth.getSession();
    return session?.user || null;
  } catch {
    return null;
  }
}

/**
 * Checks if user is authenticated and cloud features can be shown
 */
export async function isCloudAvailable(customSupabase = null) {
  const user = await getCloudUser(customSupabase);
  return Boolean(user);
}

/**
 * Calls the Supabase Edge Function 'comic-presign'
 */
export async function callComicPresign(payload, { customSupabase = null, signal = null } = {}) {
  const client = customSupabase || defaultSupabase;
  const user = await getCloudUser(client);
  if (!user) {
    throw new Error('Chưa đăng nhập Supabase. Vui lòng đăng nhập để sử dụng tính năng Cloud.');
  }

  const { data, error } = await client.functions.invoke('comic-presign', {
    body: payload,
    headers: signal ? { 'x-signal': 'active' } : undefined,
  });

  if (error) {
    // Check for specific error status or message
    const msg = error.message || 'Lỗi kết nối máy chủ Cloud';
    if (msg.includes('413') || error.context?.status === 413) {
      throw new Error('Dung lượng lưu trữ truyện tranh trên Cloud đã vượt mức tối đa 8GB.');
    }
    if (msg.includes('429') || error.context?.status === 429) {
      throw new Error('Đã vượt quá giới hạn 3000 thao tác/giờ. Vui lòng thử lại sau.');
    }
    throw new Error(msg);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

/**
 * Records the last opened timestamp for volume (used for auto-eviction LRU)
 */
export function recordVolumeOpened(volumeId) {
  if (!volumeId) return;
  try {
    localStorage.setItem(`tcl_comic_last_opened_${volumeId}`, String(Date.now()));
  } catch {}
}

export function getVolumeLastOpened(volumeId) {
  if (!volumeId) return 0;
  try {
    return Number(localStorage.getItem(`tcl_comic_last_opened_${volumeId}`)) || 0;
  } catch {
    return 0;
  }
}

// -----------------------------------------------------------------------------
// UPLOAD VOLUME
// -----------------------------------------------------------------------------

/**
 * Uploads a local volume to Cloudflare R2 and registers it in Supabase
 * 
 * @param {string} volumeId
 * @param {Object} options
 * @param {Function} [options.onProgress] - ({ current, total, phase, percent })
 * @param {AbortSignal} [options.signal]
 * @param {Object} [options.customSupabase]
 * @param {Function} [options.customFetch]
 */
export async function uploadVolume(volumeId, options = {}) {
  const {
    onProgress,
    signal,
    customSupabase = null,
    customFetch = typeof fetch !== 'undefined' ? fetch : null,
  } = options;

  if (signal?.aborted) throw new Error('Thao tác đã bị hủy');

  const client = customSupabase || defaultSupabase;
  const user = await getCloudUser(client);
  if (!user) {
    throw new Error('Cần đăng nhập Supabase để tải truyện lên Cloud.');
  }

  const vol = await getVolume(volumeId);
  if (!vol) throw new Error(`Không tìm thấy tập truyện "${volumeId}" trong bộ nhớ máy.`);
  const series = await getSeries(vol.seriesId);
  if (!series) throw new Error(`Không tìm thấy bộ truyện cho tập "${volumeId}".`);

  // 1. Ensure series is upserted to Supabase
  const { error: seriesErr } = await client.from('comic_series').upsert({
    id: series.id,
    user_id: user.id,
    title: series.title,
    created_at: new Date(series.createdAt || Date.now()).toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (seriesErr) throw new Error(`Lỗi cập nhật bộ truyện trên Cloud: ${seriesErr.message}`);

  // 2. Upsert volume in 'uploading' state
  const { error: volErr } = await client.from('comic_volumes').upsert({
    id: vol.id,
    user_id: user.id,
    series_id: vol.seriesId,
    title: vol.title,
    order_no: vol.order,
    page_count: vol.pageCount,
    total_bytes: vol.totalBytes,
    quality: vol.quality,
    status: 'uploading',
    created_at: new Date(vol.createdAt || Date.now()).toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (volErr) throw new Error(`Lỗi đăng ký tập truyện trên Cloud: ${volErr.message}`);

  // 3. Resume logic: read completed pages from localStorage
  const progressKey = `tcl_comic_upload_${volumeId}`;
  let completedPages = new Set();
  try {
    const raw = localStorage.getItem(progressKey);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) completedPages = new Set(arr);
    }
  } catch {}

  const totalPages = vol.pageCount || 0;
  const totalTasks = totalPages + 1; // +1 for cover

  const reportProgress = () => {
    if (!onProgress) return;
    const current = completedPages.size;
    const percent = Math.min(100, Math.round((current / totalTasks) * 100));
    onProgress({
      current,
      total: totalTasks,
      percent,
      phase: 'uploading',
      volumeId,
      volumeTitle: vol.title,
    });
  };

  reportProgress();

  // Helper to upload a single item with exponential backoff retries
  const uploadWithRetry = async (getUrlFn, getBlobFn, label) => {
    let lastErr = null;
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      if (signal?.aborted) throw new Error('Thao tác đã bị hủy');

      try {
        const presignedUrl = await getUrlFn(attempt > 0);
        const blob = await getBlobFn();
        if (!blob) throw new Error(`Không tìm thấy dữ liệu ảnh cho ${label}`);

        const res = await customFetch(presignedUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'image/webp',
            'Cache-Control': 'public,max-age=31536000,immutable',
          },
          body: blob,
          signal,
        });

        if (!res.ok) {
          if (res.status === 403) {
            // URL likely expired, force fresh URL on next attempt
            throw new Error(`Presigned URL expired (${res.status})`);
          }
          throw new Error(`Upload failed with status ${res.status}`);
        }

        return true; // Success!
      } catch (err) {
        if (signal?.aborted) throw err;
        lastErr = err;
        if (attempt < RETRY_DELAYS.length) {
          const delay = RETRY_DELAYS[attempt];
          await sleep(delay, signal);
        }
      }
    }
    throw new Error(`Tải lên ${label} thất bại sau 4 lần thử: ${lastErr?.message}`);
  };

  // 4. Upload pages in batches of 100
  const remainingPages = [];
  for (let i = 0; i < totalPages; i++) {
    if (!completedPages.has(i)) {
      remainingPages.push(i);
    }
  }

  for (let b = 0; b < remainingPages.length; b += UPLOAD_BATCH_SIZE) {
    if (signal?.aborted) throw new Error('Thao tác đã bị hủy');

    const batch = remainingPages.slice(b, b + UPLOAD_BATCH_SIZE);

    // Request presigned URLs for this batch
    let presignData = await callComicPresign(
      {
        action: 'put',
        volumeId,
        pages: batch,
        cover: false,
        totalBytes: vol.totalBytes,
      },
      { customSupabase: client, signal }
    );

    let urlMap = presignData?.urls || {};

    // Upload batch with concurrency 4
    await asyncPool(CONCURRENCY_LIMIT, batch, async (pageIndex) => {
      const getUrl = async (isRetry) => {
        if (isRetry || !urlMap[pageIndex]) {
          const fresh = await callComicPresign(
            { action: 'put', volumeId, pages: [pageIndex], cover: false },
            { customSupabase: client, signal }
          );
          urlMap[pageIndex] = fresh.urls?.[pageIndex];
        }
        return urlMap[pageIndex];
      };

      const getBlob = async () => {
        const { getPage } = await import('./comicDb.js');
        const pageItem = await getPage(volumeId, pageIndex);
        return pageItem?.blob || null;
      };

      await uploadWithRetry(getUrl, getBlob, `trang ${pageIndex + 1}`);

      completedPages.add(pageIndex);
      try {
        localStorage.setItem(progressKey, JSON.stringify([...completedPages]));
      } catch {}

      reportProgress();
    });
  }

  // 5. Upload Cover
  let coverUploaded = completedPages.has('cover');
  if (!coverUploaded) {
    let coverUrlCache = null;
    const getCoverUrl = async (isRetry) => {
      if (isRetry || !coverUrlCache) {
        const fresh = await callComicPresign(
          { action: 'put', volumeId, pages: [], cover: true },
          { customSupabase: client, signal }
        );
        coverUrlCache = fresh.coverUrl;
      }
      return coverUrlCache;
    };

    const getCoverBlob = async () => {
      if (series.coverBlob) return series.coverBlob;
      const { getPage } = await import('./comicDb.js');
      const firstPage = await getPage(volumeId, 0);
      return firstPage?.blob || null;
    };

    await uploadWithRetry(getCoverUrl, getCoverBlob, 'ảnh bìa');
    completedPages.add('cover');
    reportProgress();
  }

  // 6. Finalize volume status on Supabase to 'ready'
  const coverKey = `${user.id}/${volumeId}/cover.webp`;
  const { error: readyErr } = await client
    .from('comic_volumes')
    .update({
      status: 'ready',
      updated_at: new Date().toISOString(),
    })
    .eq('id', volumeId)
    .eq('user_id', user.id);

  if (readyErr) throw new Error(`Lỗi hoàn tất trạng thái tập trên Cloud: ${readyErr.message}`);

  // Update series cover_key if not set
  await client
    .from('comic_series')
    .update({ cover_key: coverKey, updated_at: new Date().toISOString() })
    .eq('id', vol.seriesId)
    .eq('user_id', user.id)
    .is('cover_key', null);

  // Clean up localStorage upload resume cache
  try {
    localStorage.removeItem(progressKey);
  } catch {}

  if (onProgress) {
    onProgress({
      current: totalTasks,
      total: totalTasks,
      percent: 100,
      phase: 'ready',
      volumeId,
      volumeTitle: vol.title,
    });
  }

  return { ok: true, volumeId };
}

// -----------------------------------------------------------------------------
// LIST REMOTE & SYNC STATUS
// -----------------------------------------------------------------------------

/**
 * Queries Supabase and local DB to compute sync status for each volume:
 * - 'local_only': "Chỉ trên máy này"
 * - 'uploading': "Đang tải lên x%"
 * - 'synced': "Đã đồng bộ"
 * - 'cloud_only': "Chỉ trên cloud"
 */
export async function listRemote(options = {}) {
  const { customSupabase = null } = options;
  const client = customSupabase || defaultSupabase;

  const user = await getCloudUser(client);
  if (!user) {
    return {
      isLoggedIn: false,
      remoteSeries: [],
      volumeStatusMap: {},
      cloudUsageBytes: 0,
      cloudQuotaBytes: 8 * 1024 * 1024 * 1024,
    };
  }

  // 1. Fetch remote series & volumes (ready only, not deleted)
  const [seriesRes, volumesRes] = await Promise.all([
    client
      .from('comic_series')
      .select('id, title, cover_key, created_at, updated_at')
      .eq('user_id', user.id)
      .is('deleted_at', null),
    client
      .from('comic_volumes')
      .select('id, series_id, title, order_no, page_count, total_bytes, quality, status, created_at, updated_at')
      .eq('user_id', user.id)
      .is('deleted_at', null),
  ]);

  const remoteSeries = seriesRes.data || [];
  const remoteVolumes = volumesRes.data || [];

  // Compute Cloud Usage (sum of ready volumes)
  let cloudUsageBytes = 0;
  const remoteVolMap = {};
  for (const rv of remoteVolumes) {
    if (rv.status === 'ready') {
      cloudUsageBytes += Number(rv.total_bytes) || 0;
    }
    remoteVolMap[rv.id] = rv;
  }

  // 2. Fetch local series & volumes from IndexedDB
  const { getAllSeries, getVolumes } = await import('./comicDb.js');
  const localSeries = await getAllSeries();
  const localVolMap = {};

  for (const ls of localSeries) {
    const vols = await getVolumes(ls.id, true);
    for (const lv of vols) {
      localVolMap[lv.id] = lv;
    }
  }

  // 3. Compute status for all unique volumes
  const allVolumeIds = new Set([
    ...Object.keys(localVolMap),
    ...Object.keys(remoteVolMap),
  ]);

  const volumeStatusMap = {};

  for (const volId of allVolumeIds) {
    const local = localVolMap[volId];
    const remote = remoteVolMap[volId];

    // Check if currently uploading in localStorage
    const uploadProgressKey = `tcl_comic_upload_${volId}`;
    let uploadingCount = 0;
    try {
      const raw = localStorage.getItem(uploadProgressKey);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length > 0) uploadingCount = arr.length;
      }
    } catch {}

    if (uploadingCount > 0 && local) {
      const total = (local.pageCount || 1) + 1;
      const pct = Math.min(99, Math.round((uploadingCount / total) * 100));
      volumeStatusMap[volId] = {
        status: 'uploading',
        label: `Đang tải lên ${pct}%`,
        percent: pct,
        local,
        remote,
      };
      continue;
    }

    if (local && local.importState === 'ready') {
      if (remote && remote.status === 'ready') {
        volumeStatusMap[volId] = {
          status: 'synced',
          label: 'Đã đồng bộ',
          local,
          remote,
        };
      } else {
        volumeStatusMap[volId] = {
          status: 'local_only',
          label: 'Chỉ trên máy này',
          local,
          remote: null,
        };
      }
    } else if (remote && remote.status === 'ready') {
      volumeStatusMap[volId] = {
        status: 'cloud_only',
        label: 'Chỉ trên cloud',
        local: null,
        remote,
      };
    }
  }

  return {
    isLoggedIn: true,
    remoteSeries,
    remoteVolumes,
    volumeStatusMap,
    cloudUsageBytes,
    cloudQuotaBytes: 8 * 1024 * 1024 * 1024,
  };
}

// -----------------------------------------------------------------------------
// DOWNLOAD VOLUME
// -----------------------------------------------------------------------------

/**
 * Downloads a volume from Cloudflare R2 into local IndexedDB
 */
export async function downloadVolume(volumeId, options = {}) {
  const {
    onProgress,
    signal,
    customSupabase = null,
    customFetch = typeof fetch !== 'undefined' ? fetch : null,
  } = options;

  if (signal?.aborted) throw new Error('Thao tác đã bị hủy');

  const client = customSupabase || defaultSupabase;
  const user = await getCloudUser(client);
  if (!user) throw new Error('Cần đăng nhập để tải truyện từ Cloud.');

  // 1. Fetch remote volume record
  const { data: remoteVol, error: volErr } = await client
    .from('comic_volumes')
    .select('*')
    .eq('id', volumeId)
    .eq('user_id', user.id)
    .single();

  if (volErr || !remoteVol) {
    throw new Error(`Không tìm thấy tập truyện trên Cloud: ${volErr?.message || ''}`);
  }

  // 2. Fetch or create local series
  let series = await getSeries(remoteVol.series_id);
  if (!series) {
    const { data: remoteSeries } = await client
      .from('comic_series')
      .select('*')
      .eq('id', remoteVol.series_id)
      .eq('user_id', user.id)
      .maybeSingle();

    series = await saveSeries({
      id: remoteVol.series_id,
      title: remoteSeries?.title || 'Bộ truyện Cloud',
    });
  }

  // 3. Create local volume in 'importing' state
  const localVol = await saveVolume({
    id: volumeId,
    seriesId: remoteVol.series_id,
    title: remoteVol.title,
    order: Number(remoteVol.order_no) || 1,
    pageCount: remoteVol.page_count || 0,
    totalBytes: Number(remoteVol.total_bytes) || 0,
    quality: remoteVol.quality || 'balanced',
    importState: 'importing',
    pageMeta: [],
  });

  const totalPages = remoteVol.page_count || 0;
  const pagesList = Array.from({ length: totalPages }, (_, i) => i);
  let downloadedPages = 0;
  const pageMeta = [];

  const reportProgress = () => {
    if (!onProgress) return;
    const percent = Math.min(100, Math.round((downloadedPages / (totalPages || 1)) * 100));
    onProgress({
      current: downloadedPages,
      total: totalPages,
      percent,
      phase: 'downloading',
      volumeId,
      volumeTitle: remoteVol.title,
    });
  };

  reportProgress();

  try {
    // 4. Download in batches of 100 pages
    for (let b = 0; b < pagesList.length; b += UPLOAD_BATCH_SIZE) {
      if (signal?.aborted) throw new Error('Thao tác đã bị hủy');

      const batch = pagesList.slice(b, b + UPLOAD_BATCH_SIZE);
      const presignData = await callComicPresign(
        {
          action: 'get',
          volumeId,
          pages: batch,
          cover: b === 0, // Request cover on first batch
        },
        { customSupabase: client, signal }
      );

      const urlMap = presignData?.urls || {};
      const pageBatchItems = [];

      // Download batch with concurrency 4
      await asyncPool(CONCURRENCY_LIMIT, batch, async (pageIndex) => {
        if (signal?.aborted) throw new Error('Thao tác đã bị hủy');

        const getUrl = urlMap[pageIndex];
        if (!getUrl) throw new Error(`Không nhận được URL tải cho trang ${pageIndex + 1}`);

        const res = await customFetch(getUrl, { signal });
        if (!res.ok) throw new Error(`Tải trang ${pageIndex + 1} thất bại: HTTP ${res.status}`);

        const blob = await res.blob();

        // Extract image dimensions (w, h)
        let w = 1200;
        let h = 1800;
        try {
          if (typeof createImageBitmap === 'function') {
            const bmp = await createImageBitmap(blob);
            w = bmp.width;
            h = bmp.height;
            bmp.close();
          }
        } catch {}

        pageBatchItems.push({
          volumeId,
          index: pageIndex,
          blob,
          w,
          h,
        });

        pageMeta[pageIndex] = { index: pageIndex, w, h };
        downloadedPages++;
        reportProgress();
      });

      // Save batch to IndexedDB
      await savePagesBulk(pageBatchItems);

      // Save Cover on first batch if available
      if (b === 0 && presignData?.coverUrl) {
        try {
          const coverRes = await customFetch(presignData.coverUrl, { signal });
          if (coverRes.ok) {
            const coverBlob = await coverRes.blob();
            const { updateSeries } = await import('./comicDb.js');
            await updateSeries(series.id, { coverBlob });
          }
        } catch (e) {
          console.warn('[ComicCloud] Failed to download cover:', e);
        }
      }
    }

    // 5. Update local volume to ready
    await updateVolume(volumeId, {
      importState: 'ready',
      pageMeta: pageMeta.filter(Boolean),
    });

    if (onProgress) {
      onProgress({
        current: totalPages,
        total: totalPages,
        percent: 100,
        phase: 'ready',
        volumeId,
        volumeTitle: remoteVol.title,
      });
    }

    return { ok: true, volumeId };
  } catch (err) {
    // Cleanup incomplete volume on abort or failure
    console.warn(`[ComicCloud] Download interrupted, cleaning up volume ${volumeId}:`, err);
    try {
      await deleteVolume(volumeId);
    } catch {}
    throw err;
  }
}

// -----------------------------------------------------------------------------
// EVICT LOCAL STORAGE (SAFE CLEANUP)
// -----------------------------------------------------------------------------

/**
 * Frees up local device space for a volume that is safely backed up on Cloud.
 * NEVER evicts a volume that is not on Cloud!
 */
export async function evictLocalVolume(volumeId, options = {}) {
  const { customSupabase = null } = options;
  const client = customSupabase || defaultSupabase;

  const user = await getCloudUser(client);
  if (!user) {
    throw new Error('Chưa đăng nhập. Không thể xác minh bản sao lưu Cloud trước khi xóa.');
  }

  // Verify that volume exists on Cloud with status 'ready'
  const { data: remoteVol, error } = await client
    .from('comic_volumes')
    .select('id, status, deleted_at')
    .eq('id', volumeId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !remoteVol || remoteVol.status !== 'ready') {
    throw new Error('Không thể giải phóng bộ nhớ: Tập truyện này CHƯA được đồng bộ an toàn lên Cloud.');
  }

  // Safe to delete local volume & pages
  await deleteVolume(volumeId);
  return { ok: true, volumeId };
}

/**
 * Auto-evicts least recently opened synced volumes if local storage > 70%
 */
export async function autoEvictIfStorageFull(options = {}) {
  const {
    threshold = 0.7,
    target = 0.6,
    activeVolumeId = null,
    customSupabase = null,
  } = options;

  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return;

  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;

    if (quota === 0 || usage / quota <= threshold) return; // Storage is fine

    const remoteInfo = await listRemote({ customSupabase });
    if (!remoteInfo.isLoggedIn) return;

    // Find all 'synced' volumes, sorted by lastOpenedAt ascending (LRU)
    const syncedVols = [];
    for (const [vId, info] of Object.entries(remoteInfo.volumeStatusMap)) {
      if (info.status === 'synced' && vId !== activeVolumeId) {
        syncedVols.push({
          volumeId: vId,
          lastOpened: getVolumeLastOpened(vId),
          bytes: info.local?.totalBytes || 0,
        });
      }
    }

    syncedVols.sort((a, b) => a.lastOpened - b.lastOpened);

    let currentUsage = usage;
    for (const v of syncedVols) {
      if (currentUsage / quota <= target) break;
      console.log(`[ComicCloud] Auto-evicting synced volume: ${v.volumeId}`);
      await evictLocalVolume(v.volumeId, { customSupabase });
      currentUsage -= v.bytes;
    }
  } catch (err) {
    console.warn('[ComicCloud] Error during auto storage eviction:', err);
  }
}

// -----------------------------------------------------------------------------
// DELETE FROM CLOUD
// -----------------------------------------------------------------------------

/**
 * Permanently deletes a volume from Cloudflare R2 and Supabase
 */
export async function deleteVolumeFromCloud(volumeId, options = {}) {
  const { customSupabase = null } = options;
  const client = customSupabase || defaultSupabase;

  const user = await getCloudUser(client);
  if (!user) throw new Error('Cần đăng nhập để xóa truyện khỏi Cloud.');

  // 1. Delete objects in R2 via Edge Function
  await callComicPresign(
    { action: 'delete-volume', volumeId },
    { customSupabase: client }
  );

  // 2. Mark volume as deleted in Supabase
  const { error: volErr } = await client
    .from('comic_volumes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', volumeId)
    .eq('user_id', user.id);

  if (volErr) throw new Error(`Lỗi cập nhật xóa trên Cloud: ${volErr.message}`);

  // 3. Remove cloud reading progress
  await client
    .from('comic_progress')
    .delete()
    .eq('volume_id', volumeId)
    .eq('user_id', user.id);

  return { ok: true, volumeId };
}

// -----------------------------------------------------------------------------
// READING PROGRESS SYNC
// -----------------------------------------------------------------------------

let progressDebounceTimer = null;

/**
 * Pushes reading progress to Cloud with 5-second debounce.
 * Only called after genuine user interaction!
 */
export function pushComicProgressCloud(volumeId, { pageIndex, scrollPercent }, options = {}) {
  if (!volumeId) return;
  const { customSupabase = null } = options;
  const client = customSupabase || defaultSupabase;

  if (progressDebounceTimer) clearTimeout(progressDebounceTimer);

  progressDebounceTimer = setTimeout(async () => {
    try {
      const user = await getCloudUser(client);
      if (!user) return;

      await client.from('comic_progress').upsert({
        user_id: user.id,
        volume_id: volumeId,
        page_index: Math.max(0, pageIndex),
        scroll_percent: Math.max(0, Math.min(100, scrollPercent)),
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[ComicCloud] Failed to push progress to cloud:', err);
    }
  }, 5000);
}

/**
 * Pulls reading progress from Cloud; if Cloud is newer than local, applies to local
 */
export async function pullComicProgressCloud(volumeId, options = {}) {
  if (!volumeId) return null;
  const { customSupabase = null } = options;
  const client = customSupabase || defaultSupabase;

  try {
    const user = await getCloudUser(client);
    if (!user) return null;

    const { data: cloudRow, error } = await client
      .from('comic_progress')
      .select('page_index, scroll_percent, updated_at')
      .eq('volume_id', volumeId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error || !cloudRow) return null;

    const cloudUpdatedAt = new Date(cloudRow.updated_at).getTime();
    const local = getComicProgress(volumeId);
    const localUpdatedAt = local?.updatedAt || 0;

    if (cloudUpdatedAt > localUpdatedAt) {
      saveComicProgress(volumeId, {
        pageIndex: cloudRow.page_index,
        scrollPercent: cloudRow.scroll_percent,
      });
      return {
        pageIndex: cloudRow.page_index,
        scrollPercent: cloudRow.scroll_percent,
        updatedAt: cloudUpdatedAt,
        isFromCloud: true,
      };
    }

    return local;
  } catch (err) {
    console.warn('[ComicCloud] Failed to pull progress from cloud:', err);
    return null;
  }
}

// -----------------------------------------------------------------------------
// MULTI-VOLUME BATCH UPLOAD QUEUE
// -----------------------------------------------------------------------------

/**
 * Uploads all unsynced volumes of a series sequentially
 */
export async function uploadAllUnsyncedVolumes(seriesId, options = {}) {
  const { onProgress, signal, customSupabase = null } = options;
  const remoteInfo = await listRemote({ customSupabase });
  const { getVolumes } = await import('./comicDb.js');
  const localVolumes = await getVolumes(seriesId);

  const unsynced = localVolumes.filter((v) => {
    const s = remoteInfo.volumeStatusMap[v.id]?.status;
    return s === 'local_only' || s === 'uploading';
  });

  if (unsynced.length === 0) return { uploadedCount: 0 };

  let currentVolIndex = 0;
  for (const vol of unsynced) {
    if (signal?.aborted) throw new Error('Thao tác đã bị hủy');
    currentVolIndex++;

    await uploadVolume(vol.id, {
      signal,
      customSupabase,
      onProgress: (p) => {
        if (onProgress) {
          onProgress({
            ...p,
            currentVolumeIndex: currentVolIndex,
            totalVolumesCount: unsynced.length,
          });
        }
      },
    });
  }

  return { uploadedCount: unsynced.length };
}
