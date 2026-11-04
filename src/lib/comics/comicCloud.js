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
import { notifyComicsChanged } from '../sync/realtimeSignal.js';

let activeDefaultSupabase = defaultSupabase;

export function setSupabaseForTesting(client) {
  activeDefaultSupabase = client;
}
// =============================================================================
// TOMBSTONE & CLOUD STATE TRACKING (P3)
// =============================================================================
export const TOMBSTONE_VOLUMES_KEY = 'tcl_comic_tombstone_volumes';
export const TOMBSTONE_SERIES_KEY = 'tcl_comic_tombstone_series';
export const KNOWN_CLOUD_VOLS_KEY = 'tcl_comic_known_cloud_vols';

let _tombstoneVolumeIds = new Set();
let _tombstoneSeriesIds = new Set();
let _knownCloudVolumeIds = new Set();

try {
  if (typeof localStorage !== 'undefined') {
    const rawV = localStorage.getItem(TOMBSTONE_VOLUMES_KEY);
    if (rawV) _tombstoneVolumeIds = new Set(JSON.parse(rawV));
    const rawS = localStorage.getItem(TOMBSTONE_SERIES_KEY);
    if (rawS) _tombstoneSeriesIds = new Set(JSON.parse(rawS));
    const rawC = localStorage.getItem(KNOWN_CLOUD_VOLS_KEY);
    if (rawC) _knownCloudVolumeIds = new Set(JSON.parse(rawC));
  }
} catch {}

export function isVolumeTombstoned(volumeId) {
  if (!volumeId) return false;
  return _tombstoneVolumeIds.has(volumeId);
}

export function isSeriesTombstoned(seriesId) {
  if (!seriesId) return false;
  return _tombstoneSeriesIds.has(seriesId);
}

export function isKnownCloudVolume(volumeId) {
  if (!volumeId) return false;
  return _knownCloudVolumeIds.has(volumeId);
}

export function setTombstonesForTesting({ volumes = [], series = [], knownCloud = [] } = {}) {
  _tombstoneVolumeIds = new Set(volumes);
  _tombstoneSeriesIds = new Set(series);
  _knownCloudVolumeIds = new Set(knownCloud);
}

/**
 * P2 bước 3: Xóa bản trên máy này (IndexedDB), gồm trang, bìa, tiến độ localStorage,
 * các dấu tcl_comic_no_auto*, tcl_comic_upload_*, tcl_comic_fail_*.
 */
export async function purgeLocalVolumeData(volumeId) {
  if (!volumeId) return;

  // 1. Xóa trong IndexedDB (pages & volume)
  try {
    const { deleteVolume } = await import('./comicDb.js');
    await deleteVolume(volumeId);
  } catch (err) {
    console.warn('[ComicCloud] Error deleting volume ' + volumeId + ' from IndexedDB:', err);
  }

  // 2. Dọn sạch các key localStorage liên quan
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem('tcl_comic_progress_' + volumeId);
      localStorage.removeItem('tcl_comic_no_autodl_' + volumeId);
      localStorage.removeItem('tcl_comic_no_autoupl_' + volumeId);
      localStorage.removeItem('tcl_comic_upload_' + volumeId);
      localStorage.removeItem('tcl_comic_fail_upload_' + volumeId);
      localStorage.removeItem('tcl_comic_fail_download_' + volumeId);
      localStorage.removeItem('tcl_comic_last_opened_' + volumeId);

      // Quét các key có prefix tcl_comic_ chứa volumeId
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('tcl_comic_') && key.includes(volumeId)) {
          localStorage.removeItem(key);
        }
      }
    } catch {}
  }

  // 3. Xóa failure trong hàng đợi sync nếu có
  try {
    const { clearTaskFailure } = await import('./comicSyncQueue.js');
    clearTaskFailure(volumeId, 'upload');
    clearTaskFailure(volumeId, 'download');
  } catch {}
}

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
  const client = customSupabase || activeDefaultSupabase;
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
  if (signal?.aborted) {
    throw new Error('Thao tác đã bị hủy');
  }

  const client = customSupabase || activeDefaultSupabase;
  const user = await getCloudUser(client);
  if (!user) {
    throw new Error('Chưa đăng nhập Supabase. Vui lòng đăng nhập để sử dụng tính năng Cloud.');
  }

  // Strictly no custom headers passed to functions.invoke to avoid CORS preflight failures
  const { data, error } = await client.functions.invoke('comic-presign', {
    body: payload,
  });

  if (signal?.aborted) {
    throw new Error('Thao tác đã bị hủy');
  }

  if (error) {
    let retryAfterSeconds = 3600;
    let errCode = error.code || null;
    let errMsg = error.message || 'Lỗi kết nối máy chủ Cloud';

    // 1. Check Retry-After header from error.context
    const headers = error.context?.headers;
    let retryHeader = null;
    if (headers) {
      if (typeof headers.get === 'function') {
        retryHeader = headers.get('retry-after') || headers.get('Retry-After');
      } else if (typeof headers === 'object') {
        retryHeader = headers['retry-after'] || headers['Retry-After'];
      }
    }
    if (retryHeader) {
      const parsed = parseInt(retryHeader, 10);
      if (!isNaN(parsed) && parsed > 0) {
        retryAfterSeconds = parsed;
      }
    }

    // 2. Check JSON body in error.context if available
    try {
      if (typeof error.context?.json === 'function') {
        const body = await error.context.json();
        if (body?.retryAfterSeconds) retryAfterSeconds = Number(body.retryAfterSeconds);
        if (body?.code) errCode = body.code;
        if (body?.error) errMsg = body.error;
      } else if (error.context?.body) {
        const parsedBody = typeof error.context.body === 'string' ? JSON.parse(error.context.body) : error.context.body;
        if (parsedBody?.retryAfterSeconds) retryAfterSeconds = Number(parsedBody.retryAfterSeconds);
        if (parsedBody?.code) errCode = parsedBody.code;
        if (parsedBody?.error) errMsg = parsedBody.error;
      }
    } catch {}

    const is429 = error.context?.status === 429 || error.status === 429 || errMsg.includes('429') || errCode === 'RATE_LIMIT_EXCEEDED';
    const is413 = error.context?.status === 413 || error.status === 413 || errMsg.includes('413') || errCode === 'QUOTA_EXCEEDED';

    if (is429) {
      const minutes = Math.ceil(retryAfterSeconds / 60);
      const customErr = new Error(`Đã chạm giới hạn thao tác, tự tiếp tục sau ${minutes} phút`);
      customErr.code = 'RATE_LIMITED';
      customErr.retryAfterSeconds = retryAfterSeconds;
      throw customErr;
    }

    if (is413) {
      const customErr = new Error('Dung lượng lưu trữ truyện tranh trên Cloud đã vượt mức tối đa 8GB.');
      customErr.code = 'QUOTA_EXCEEDED';
      throw customErr;
    }

    throw new Error(errMsg);
  }

  if (data?.error) {
    if (data.code === 'RATE_LIMIT_EXCEEDED' || data.retryAfterSeconds) {
      const retrySec = Number(data.retryAfterSeconds) || 3600;
      const minutes = Math.ceil(retrySec / 60);
      const customErr = new Error(`Đã chạm giới hạn thao tác, tự tiếp tục sau ${minutes} phút`);
      customErr.code = 'RATE_LIMITED';
      customErr.retryAfterSeconds = retrySec;
      throw customErr;
    }
    if (data.code === 'QUOTA_EXCEEDED') {
      const customErr = new Error(data.error || 'Dung lượng lưu trữ truyện tranh trên Cloud đã vượt mức tối đa 8GB.');
      customErr.code = 'QUOTA_EXCEEDED';
      throw customErr;
    }
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
  let {
    onProgress,
    signal,
    customSupabase,
    customFetch,
    verifyDelays,
  } = options;

  if (signal?.aborted) throw new Error('Thao tác đã bị hủy');

  const client = customSupabase || activeDefaultSupabase;
  customFetch = customFetch || (typeof fetch !== 'undefined' ? fetch : (typeof globalThis !== 'undefined' && globalThis.fetch ? globalThis.fetch.bind(globalThis) : null));
  if (typeof customFetch !== 'function') {
    throw new Error('Môi trường không hỗ trợ fetch API để tải ảnh lên Cloud.');
  }
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
    try {
      localStorage.setItem(progressKey, JSON.stringify([...completedPages]));
    } catch {}
    reportProgress();
  }

  // 6. Verification step before setting 'ready':
  // Verify last page and cover exist on Cloud using presigned GET with HEAD (or Range bytes=0-0)
  const lastPageIndex = Math.max(0, (vol.pageCount || 1) - 1);
  const verifyPresign = await callComicPresign(
    {
      action: 'get',
      volumeId,
      pages: [lastPageIndex],
      cover: true,
    },
    { customSupabase: client, signal }
  );

  const checkFileExists = async (signedUrl, label) => {
    if (!signedUrl) return;
    const maxRetries = 3;
    const delays = options.verifyDelays || [1000, 2000, 4000];
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal?.aborted) throw new Error('Thao tác đã bị hủy');

      try {
        const checkRes = await customFetch(signedUrl, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
          signal,
        });

        if (checkRes.status === 200 || checkRes.status === 206) {
          return;
        }

        if (checkRes.status === 404) {
          throw new Error('tệp không tồn tại trên Cloud (404)');
        }

        throw new Error(`HTTP ${checkRes.status}`);
      } catch (err) {
        lastError = err;
        if (signal?.aborted) throw err;

        // 404: file is definitely not on Cloud, do not retry
        if (err.message?.includes('404')) {
          throw new Error(
            `Xác minh ${label} trên Cloud thất bại: tệp không tồn tại trên Cloud (404). Không thể đánh dấu tập hoàn tất.`
          );
        }

        // Network error (TypeError) or transient HTTP error: retry with backoff
        if (attempt < maxRetries) {
          const delay = delays[attempt] || 1000;
          await sleep(delay, signal);
          continue;
        }
      }
    }

    const isNetworkOrCors =
      lastError instanceof TypeError ||
      lastError?.name === 'TypeError' ||
      lastError?.message?.toLowerCase().includes('failed to fetch') ||
      lastError?.message?.toLowerCase().includes('network');

    const reason = isNetworkOrCors
      ? 'không kết nối được tới Cloud (có thể do CORS hoặc mạng)'
      : (lastError?.message || 'lỗi không xác định');

    throw new Error(
      `Xác minh ${label} trên Cloud thất bại: ${reason}. Không thể đánh dấu tập hoàn tất.`
    );
  };

  const lastPageUrl = verifyPresign?.urls?.[lastPageIndex];
  if (lastPageUrl) {
    await checkFileExists(lastPageUrl, `trang cuối (trang ${lastPageIndex + 1})`);
  }

  if (verifyPresign?.coverUrl) {
    await checkFileExists(verifyPresign.coverUrl, 'ảnh bìa');
  }

  // 7. Finalize volume status on Supabase to 'ready'
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

  // A6: Phát tín hiệu realtime thông báo tập đã sẵn sàng trên Cloud
  try {
    notifyComicsChanged();
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
  const client = customSupabase || activeDefaultSupabase;

  const user = await getCloudUser(client);
  if (!user) {
    return {
      isLoggedIn: false,
      remoteSeries: [],
      remoteVolumes: [],
      volumeStatusMap: {},
      cloudUsageBytes: 0,
      cloudQuotaBytes: 8 * 1024 * 1024 * 1024,
    };
  }

  // Helper for tombstone queries with safe fallback for partial mocks
  const fetchTombstones = async (table, selectCols) => {
    try {
      const q = client.from(table).select(selectCols).eq('user_id', user.id);
      if (typeof q?.not === 'function') {
        const res = await q.not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(500);
        return res?.data || [];
      } else {
        const res = await q;
        return (res?.data || []).filter((r) => r && r.deleted_at != null).slice(0, 500);
      }
    } catch {
      return [];
    }
  };

  // 1. Fetch remote active series & volumes AND tombstones (deleted_at IS NOT NULL, limit 500)
  const [seriesRes, volumesRes, deletedSeriesList, deletedVolumesList] = await Promise.all([
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
    fetchTombstones('comic_series', 'id, title, deleted_at, updated_at'),
    fetchTombstones('comic_volumes', 'id, series_id, title, deleted_at, updated_at'),
  ]);

  const rawRemoteSeries = seriesRes.data || [];
  const rawRemoteVolumes = volumesRes.data || [];

  // Update tombstone sets
  for (const ds of deletedSeriesList) {
    if (ds?.id) _tombstoneSeriesIds.add(ds.id);
  }
  for (const dv of deletedVolumesList) {
    if (dv?.id) _tombstoneVolumeIds.add(dv.id);
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TOMBSTONE_SERIES_KEY, JSON.stringify([..._tombstoneSeriesIds]));
      localStorage.setItem(TOMBSTONE_VOLUMES_KEY, JSON.stringify([..._tombstoneVolumeIds]));
    }
  } catch {}

  // P3: Tombstone reconciliation on local storage
  const { getAllSeries, getVolumes, deleteSeries } = await import('./comicDb.js');
  let cancelTaskFn = null;
  try {
    const queueMod = await import('./comicSyncQueue.js');
    cancelTaskFn = queueMod.cancelTask;
  } catch {}

  const localSeries = await getAllSeries();

  for (const ls of localSeries) {
    if (_tombstoneSeriesIds.has(ls.id)) {
      console.log('[ComicCloud] Tombstone: purging local series ' + ls.id);
      const vols = await getVolumes(ls.id, true);
      for (const v of vols) {
        if (cancelTaskFn) cancelTaskFn(v.id);
        await purgeLocalVolumeData(v.id);
      }
      await deleteSeries(ls.id);
    }
  }

  // Refresh local series and build localVolMap
  const refreshedLocalSeries = await getAllSeries();
  const localVolMap = {};
  for (const ls of refreshedLocalSeries) {
    const vols = await getVolumes(ls.id, true);
    for (const lv of vols) {
      if (_tombstoneVolumeIds.has(lv.id)) {
        console.log('[ComicCloud] Tombstone: purging local volume ' + lv.id);
        if (cancelTaskFn) cancelTaskFn(lv.id);
        await purgeLocalVolumeData(lv.id);
      } else {
        localVolMap[lv.id] = lv;
      }
    }
  }

  // Record known cloud volumes
  for (const rv of rawRemoteVolumes) {
    if (rv?.id) _knownCloudVolumeIds.add(rv.id);
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KNOWN_CLOUD_VOLS_KEY, JSON.stringify([..._knownCloudVolumeIds]));
    }
  } catch {}

  // Compute Cloud Usage (sum of ready volumes)
  let cloudUsageBytes = 0;
  const remoteVolMap = {};
  for (const rv of rawRemoteVolumes) {
    if (rv.status === 'ready' && !_tombstoneVolumeIds.has(rv.id)) {
      cloudUsageBytes += Number(rv.total_bytes) || 0;
      remoteVolMap[rv.id] = rv;
    }
  }

  // Compute status for all unique volumes (excluding tombstones)
  const allVolumeIds = new Set([
    ...Object.keys(localVolMap),
    ...Object.keys(remoteVolMap),
  ]);

  const volumeStatusMap = {};

  for (const volId of allVolumeIds) {
    if (_tombstoneVolumeIds.has(volId)) continue;

    const local = localVolMap[volId];
    const remote = remoteVolMap[volId];

    // Check if currently uploading in localStorage
    const uploadProgressKey = 'tcl_comic_upload_' + volId;
    let uploadingCount = 0;
    try {
      const raw = localStorage.getItem(uploadProgressKey);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length > 0) uploadingCount = arr.length;
      }
    } catch {}

    const isRemoteReady = remote && remote.status === 'ready';

    if (uploadingCount > 0 && local && !isRemoteReady) {
      const total = (local.pageCount || 1) + 1;
      const pct = Math.min(99, Math.round((uploadingCount / total) * 100));
      volumeStatusMap[volId] = {
        status: 'interrupted',
        label: 'Tải lên dở dang (' + pct + '%)',
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

  // P4: Filter out empty series (0 non-deleted volumes) and mark deleted_at on Supabase
  const activeRemoteSeries = [];
  for (const rs of rawRemoteSeries) {
    if (_tombstoneSeriesIds.has(rs.id)) continue;
    const volCount = rawRemoteVolumes.filter(
      (v) => v.series_id === rs.id && v.status === 'ready' && !_tombstoneVolumeIds.has(v.id)
    ).length;
    const localCount = Object.values(localVolMap).filter(
      (v) => v.seriesId === rs.id
    ).length;

    if (volCount === 0 && localCount === 0) {
      // Empty series! Best effort mark deleted_at on Supabase and delete locally
      console.log('[ComicCloud] P4: Cleaning up empty series ' + rs.id);
      client
        .from('comic_series')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', rs.id)
        .eq('user_id', user.id)
        .then(() => {})
        .catch(() => {});
      deleteSeries(rs.id).catch(() => {});
    } else {
      activeRemoteSeries.push(rs);
    }
  }

  return {
    isLoggedIn: true,
    remoteSeries: activeRemoteSeries,
    remoteVolumes: rawRemoteVolumes.filter((v) => !_tombstoneVolumeIds.has(v.id)),
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
  let {
    onProgress,
    signal,
    customSupabase,
    customFetch,
  } = options;

  if (signal?.aborted) throw new Error('Thao tác đã bị hủy');

  const client = customSupabase || activeDefaultSupabase;
  customFetch = customFetch || (typeof fetch !== 'undefined' ? fetch : (typeof globalThis !== 'undefined' && globalThis.fetch ? globalThis.fetch.bind(globalThis) : null));
  if (typeof customFetch !== 'function') {
    throw new Error('Môi trường không hỗ trợ fetch API để tải ảnh từ Cloud.');
  }
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

    try {
      localStorage.removeItem(`tcl_comic_no_autodl_${volumeId}`);
    } catch {}

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
  const client = customSupabase || activeDefaultSupabase;

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

  // Ghi dấu để cơ chế tự động tải không kéo lại tập này (A5)
  try {
    localStorage.setItem(`tcl_comic_no_autodl_${volumeId}`, '1');
  } catch {}

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

    const remoteInfo = await listRemote({ ...(customSupabase ? { customSupabase } : {}) });
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
      await evictLocalVolume(v.volumeId, { ...(customSupabase ? { customSupabase } : {}) });
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
 * P1 & P2: Xóa một tập truyện ở mọi nơi (R2 -> Supabase -> Local)
 * Thứ tự nghiêm ngặt:
 *  1) R2 Edge Function delete-volume. Nếu lỗi (non-2xx / 502): STOP ngay lập tức!
 *  2) Đánh dấu deleted_at ở comic_volumes, xóa comic_progress.
 *     Nếu series hết tập: đánh dấu deleted_at cho comic_series.
 *  3) Xóa bản local trong IndexedDB và dọn dẹp localStorage.
 *  4) notifyComicsChanged().
 */
export async function deleteVolumeEverywhere(volumeId, options = {}) {
  if (!volumeId) throw new Error('Thiếu volumeId để xóa');
  const { customSupabase = null } = options;
  const client = customSupabase || activeDefaultSupabase;

  // 0. Cancel active or pending task in sync queue
  try {
    const { cancelTask } = await import('./comicSyncQueue.js');
    cancelTask(volumeId);
  } catch {}

  // Check online status
  const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;

  // Check user and remote record
  let user = null;
  let remoteVol = null;
  let remoteCheckFailed = false;

  try {
    user = await getCloudUser(client);
    if (user) {
      const { data, error } = await client
        .from('comic_volumes')
        .select('id, series_id, status, deleted_at')
        .eq('id', volumeId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        remoteCheckFailed = true;
      } else {
        remoteVol = data;
      }
    }
  } catch (err) {
    remoteCheckFailed = true;
  }

  const isKnownCloud = isKnownCloudVolume(volumeId);

  // If offline or network check failed, and volume was known to be on Cloud: BLOCK!
  if ((!isOnline || remoteCheckFailed) && isKnownCloud) {
    throw new Error('Cần kết nối mạng để xóa tập đã đồng bộ');
  }

  // If not logged in, or volume has never been on Cloud (no remote row and not known cloud):
  // Just delete local copy!
  if (!user || (!remoteVol && !isKnownCloud)) {
    await purgeLocalVolumeData(volumeId);
    return { ok: true, volumeId, localOnly: true };
  }

  // Volume is on Cloud! Execute strict P2 order:
  // Step 1: Call Edge Function to delete R2 files
  try {
    await callComicPresign(
      { action: 'delete-volume', volumeId },
      { customSupabase: client }
    );
  } catch (r2Err) {
    // If R2 deletion fails: STOP immediately! Do not touch Supabase or local!
    console.error('[ComicCloud] R2 delete failed for volume ' + volumeId + ':', r2Err);
    throw r2Err;
  }

  // Step 2: Mark deleted_at in Supabase comic_volumes and delete progress
  const deletedAt = new Date().toISOString();
  const { error: volErr } = await client
    .from('comic_volumes')
    .update({ deleted_at: deletedAt })
    .eq('id', volumeId)
    .eq('user_id', user.id);

  if (volErr) {
    throw new Error('Lỗi cập nhật xóa trên Cloud: ' + volErr.message);
  }

  await client
    .from('comic_progress')
    .delete()
    .eq('volume_id', volumeId)
    .eq('user_id', user.id);

  // Register tombstone
  _tombstoneVolumeIds.add(volumeId);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(TOMBSTONE_VOLUMES_KEY, JSON.stringify([..._tombstoneVolumeIds]));
    }
  } catch {}

  // Check if series has 0 remaining volumes on Supabase
  const seriesId = remoteVol?.series_id;
  if (seriesId) {
    const { data: remainingVols } = await client
      .from('comic_volumes')
      .select('id')
      .eq('series_id', seriesId)
      .eq('user_id', user.id)
      .is('deleted_at', null);

    if (!remainingVols || remainingVols.length === 0) {
      await client
        .from('comic_series')
        .update({ deleted_at: deletedAt })
        .eq('id', seriesId)
        .eq('user_id', user.id);
      _tombstoneSeriesIds.add(seriesId);
    }
  }

  // Step 3: Purge local copy in IndexedDB and localStorage
  await purgeLocalVolumeData(volumeId);

  // Also check if local series is now empty
  if (seriesId) {
    const { getVolumes, deleteSeries } = await import('./comicDb.js');
    const localRemaining = await getVolumes(seriesId, true);
    if (!localRemaining || localRemaining.length === 0) {
      await deleteSeries(seriesId);
    }
  }

  // Step 4: Notify realtime
  try {
    notifyComicsChanged();
  } catch {}

  return { ok: true, volumeId };
}

/**
 * P1 & P2: Xóa toàn bộ một bộ truyện ở mọi nơi (R2 -> Supabase -> Local)
 */
export async function deleteSeriesEverywhere(seriesId, options = {}) {
  if (!seriesId) throw new Error('Thiếu seriesId để xóa');
  const { customSupabase = null } = options;
  const client = customSupabase || activeDefaultSupabase;

  const { getVolumes, deleteSeries } = await import('./comicDb.js');
  const user = await getCloudUser(client);

  // 1. Gather all volume IDs from local and remote
  const volumeIdSet = new Set();
  const localVols = await getVolumes(seriesId, true);
  for (const lv of localVols) {
    volumeIdSet.add(lv.id);
  }

  if (user) {
    try {
      const { data: remoteVols } = await client
        .from('comic_volumes')
        .select('id')
        .eq('series_id', seriesId)
        .eq('user_id', user.id)
        .is('deleted_at', null);

      if (remoteVols) {
        for (const rv of remoteVols) {
          volumeIdSet.add(rv.id);
        }
      }
    } catch (err) {}
  }

  // 2. Delete each volume (stops immediately on any failure)
  for (const volId of volumeIdSet) {
    await deleteVolumeEverywhere(volId, options);
  }

  // 3. Mark deleted_at on comic_series on Supabase if logged in
  if (user) {
    const deletedAt = new Date().toISOString();
    await client
      .from('comic_series')
      .update({ deleted_at: deletedAt })
      .eq('id', seriesId)
      .eq('user_id', user.id);

    _tombstoneSeriesIds.add(seriesId);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(TOMBSTONE_SERIES_KEY, JSON.stringify([..._tombstoneSeriesIds]));
      }
    } catch {}
  }

  // 4. Delete local series record
  await deleteSeries(seriesId);

  // 5. Notify realtime
  try {
    notifyComicsChanged();
  } catch {}

  return { ok: true, seriesId };
}

/**
 * Legacy wrapper: calls deleteVolumeEverywhere
 */
export async function deleteVolumeFromCloud(volumeId, options = {}) {
  return deleteVolumeEverywhere(volumeId, options);
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
  const client = customSupabase || activeDefaultSupabase;

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
  const client = customSupabase || activeDefaultSupabase;

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

// -----------------------------------------------------------------------------
// UPDATE VOLUME METADATA (ORDER & TITLE)
// -----------------------------------------------------------------------------

/**
 * Cập nhật số tập và tên tập (D2).
 * Lưu vào IndexedDB local và, nếu tập đã có trên Cloud, cập nhật bảng comic_volumes,
 * sau đó phát tín hiệu realtime A6.
 */
export async function updateVolumeMetadata(volumeId, { order, title }, options = {}) {
  if (!volumeId) throw new Error('Thiếu volumeId.');
  const { customSupabase = null } = options;
  const client = customSupabase || activeDefaultSupabase;

  const parsedOrder = Number(order) || 1;
  const cleanTitle = String(title || '').trim();

  // 1. Cập nhật local DB nếu có
  const local = await getVolume(volumeId);
  if (local) {
    await updateVolume(volumeId, {
      order: parsedOrder,
      title: cleanTitle,
      updatedAt: Date.now(),
    });
  }

  // 2. Cập nhật Cloud nếu đã đăng nhập và tập đã tồn tại trên Cloud
  const user = await getCloudUser(client);
  if (user) {
    const { data: remoteVol } = await client
      .from('comic_volumes')
      .select('id')
      .eq('id', volumeId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (remoteVol) {
      const { error: updErr } = await client
        .from('comic_volumes')
        .update({
          order_no: parsedOrder,
          title: cleanTitle,
          updated_at: new Date().toISOString(),
        })
        .eq('id', volumeId)
        .eq('user_id', user.id);

      if (updErr) {
        throw new Error(`Lỗi cập nhật thông tin tập trên Cloud: ${updErr.message}`);
      }

      // Phát tín hiệu A6 cho các thiết bị khác đồng bộ
      try {
        notifyComicsChanged();
      } catch {}
    }
  }

  return { ok: true, volumeId, order: parsedOrder, title: cleanTitle };
}

// MULTI-VOLUME BATCH UPLOAD QUEUE
// -----------------------------------------------------------------------------

/**
 * Uploads all unsynced volumes of a series sequentially
 */
export async function uploadAllUnsyncedVolumes(seriesId, options = {}) {
  const { onProgress, signal, customSupabase, customFetch, verifyDelays } = options;
  const remoteInfo = await listRemote({ ...(customSupabase ? { customSupabase } : {}) });
  const { getVolumes } = await import('./comicDb.js');
  const localVolumes = await getVolumes(seriesId);

  const unsynced = localVolumes.filter((v) => {
    const s = remoteInfo.volumeStatusMap[v.id]?.status;
    return s === 'local_only' || s === 'uploading' || s === 'interrupted';
  });

  if (unsynced.length === 0) return { uploadedCount: 0 };

  let currentVolIndex = 0;
  for (let i = 0; i < unsynced.length; i++) {
    if (signal?.aborted) throw new Error('Thao tác đã bị hủy');
    const vol = unsynced[i];
    currentVolIndex = i + 1;

    if (onProgress) {
      onProgress({
        phase: 'start_volume',
        volumeId: vol.id,
        volumeTitle: vol.title,
        percent: 0,
        currentVolumeIndex: currentVolIndex,
        totalVolumesCount: unsynced.length,
        queuedVolumeIds: unsynced.map((u) => u.id),
      });
    }

    try {
      await uploadVolume(vol.id, {
        ...(signal ? { signal } : {}),
        ...(customSupabase ? { customSupabase } : {}),
        ...(customFetch ? { customFetch } : {}),
        ...(verifyDelays ? { verifyDelays } : {}),
        onProgress: (p) => {
          if (onProgress) {
            onProgress({
              ...p,
              volumeTitle: vol.title,
              currentVolumeIndex: currentVolIndex,
              totalVolumesCount: unsynced.length,
              queuedVolumeIds: unsynced.map((u) => u.id),
            });
          }
        },
      });
    } catch (err) {
      if (err.name === 'AbortError' || signal?.aborted) {
        throw new Error('Thao tác đã bị hủy');
      }

      // 413 Quota Exceeded: Stop entire queue immediately and report clearly
      if (err.code === 'QUOTA_EXCEEDED') {
        throw new Error('Đã vượt quá hạn mức lưu trữ Cloud 8GB. Hàng đợi tải lên đã dừng.');
      }

      // 429 Rate Limited: Pause queue, wait until Retry-After expires, then resume this volume
      if (err.code === 'RATE_LIMITED') {
        const waitSec = Math.max(1, Number(err.retryAfterSeconds) || 60);
        const minutes = Math.ceil(waitSec / 60);
        const waitMsg = `Đã chạm giới hạn thao tác, tự tiếp tục sau ${minutes} phút`;

        if (onProgress) {
          onProgress({
            phase: 'rate_limited',
            percent: 0,
            volumeId: vol.id,
            volumeTitle: vol.title,
            currentVolumeIndex: currentVolIndex,
            totalVolumesCount: unsynced.length,
            waitingSeconds: waitSec,
            message: waitMsg,
          });
        }

        // Wait interruptibly with 1s ticks
        const waitStart = Date.now();
        const waitMs = waitSec * 1000;
        while (Date.now() - waitStart < waitMs) {
          if (signal?.aborted) throw new Error('Thao tác đã bị hủy');
          const elapsed = Math.floor((Date.now() - waitStart) / 1000);
          const remain = Math.max(0, waitSec - elapsed);
          const remainMin = Math.ceil(remain / 60);
          if (onProgress && remain % 5 === 0) {
            onProgress({
              phase: 'rate_limited',
              percent: 0,
              volumeId: vol.id,
              volumeTitle: vol.title,
              currentVolumeIndex: currentVolIndex,
              totalVolumesCount: unsynced.length,
              waitingSeconds: remain,
              message: `Đã chạm giới hạn thao tác, tự tiếp tục sau ${remainMin} phút`,
            });
          }
          await new Promise((r) => setTimeout(r, Math.min(1000, waitMs - (Date.now() - waitStart))));
        }

        // Decrement i to retry the same volume without marking subsequent volumes as failed
        // Resume mechanism in uploadVolume will skip pages already uploaded
        i--;
        continue;
      }

      // Other unexpected errors
      throw err;
    }
  }

  return { uploadedCount: unsynced.length };
}
