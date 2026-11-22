/**
 * Video Cloud Storage Engine (Cloudflare R2 + Supabase Edge Function)
 * 
 * Handles client-to-R2 uploads, multipart chunking, presigned playback URLs,
 * and R2 storage monitoring (with 8GB threshold guard).
 */

import { supabase } from '../supabaseClient.js';

let activeSupabase = supabase;

export function setSupabaseForTesting(client) {
  activeSupabase = client;
}

// In-memory playback URL cache: episodeId -> { url, expiresAt, subtitles }
const playbackCache = new Map();

/**
 * Invoke the video-presign Edge Function
 */
export async function callVideoPresign(payload, { signal = null } = {}) {
  if (signal?.aborted) {
    throw new Error('Thao tác đã bị hủy');
  }

  const { data: { session } } = await activeSupabase.auth.getSession();
  const token = session?.access_token || '';

  const { data, error } = await activeSupabase.functions.invoke('video-presign', {
    body: payload,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (signal?.aborted) {
    throw new Error('Thao tác đã bị hủy');
  }

  if (error) {
    let errMsg = error.message || 'Lỗi kết nối máy chủ Cloud (video-presign)';
    let errCode = error.code || 'CLOUD_ERROR';

    try {
      if (typeof error.context?.json === 'function') {
        const body = await error.context.json();
        if (body?.error) errMsg = body.error;
        if (body?.code) errCode = body.code;
      } else if (error.context?.body) {
        const body = typeof error.context.body === 'string' ? JSON.parse(error.context.body) : error.context.body;
        if (body?.error) errMsg = body.error;
        if (body?.code) errCode = body.code;
      }
    } catch {}

    const customErr = new Error(errMsg);
    customErr.code = errCode;
    throw customErr;
  }

  return data;
}

/**
 * Fetch Cloudflare R2 storage metrics and check against the 8GB threshold.
 */
export async function fetchStorageStats() {
  try {
    const data = await callVideoPresign({ action: 'get-storage-stats' });
    return {
      videoStorageBytes: data.videoStorageBytes || 0,
      comicStorageBytesEstimated: data.comicStorageBytesEstimated || (1.2 * 1024 * 1024 * 1024),
      totalStorageBytes: data.totalStorageBytes || 0,
      warningThresholdBytes: data.warningThresholdBytes || (8 * 1024 * 1024 * 1024),
      isOverThreshold: Boolean(data.isOverThreshold),
      isR2ActualAvailable: Boolean(data.isR2ActualAvailable),
      bucket: data.bucket || 'tcl-videos',
    };
  } catch (err) {
    console.warn('[VideoCloud] Failed to fetch storage stats:', err);
    return {
      videoStorageBytes: null,
      comicStorageBytesEstimated: 1.2 * 1024 * 1024 * 1024,
      totalStorageBytes: null,
      warningThresholdBytes: 8 * 1024 * 1024 * 1024,
      isOverThreshold: false,
      isR2ActualAvailable: false,
      error: err.message,
    };
  }
}

/**
 * Upload an image poster to R2 directly via Presigned PUT.
 */
export async function uploadSeriesPoster(seriesId, file, { onProgress = null, signal = null } = {}) {
  if (!seriesId || !file) throw new Error('Thiếu seriesId hoặc tệp ảnh bìa');

  const ext = file.name?.split('.').pop()?.toLowerCase() || 'webp';
  const presignRes = await callVideoPresign({
    action: 'get-upload-url',
    seriesId,
    targetType: 'poster',
    ext,
    mimeType: file.type || 'image/webp',
  }, { signal });

  const { uploadUrl, r2Key } = presignRes;

  // Perform direct PUT to R2
  const xhr = new XMLHttpRequest();
  const uploadPromise = new Promise((resolve, reject) => {
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type || 'image/webp');

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress({ loaded: e.loaded, total: e.total, percent });
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ r2Key });
      } else {
        reject(new Error(`Upload ảnh bìa thất bại (HTTP ${xhr.status}): ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Lỗi mạng khi tải ảnh bìa lên R2'));
    xhr.ontimeout = () => reject(new Error('Hết thời gian tải ảnh bìa lên R2'));

    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort();
        reject(new Error('Thao tác tải ảnh bìa đã bị hủy'));
      });
    }

    xhr.send(file);
  });

  return uploadPromise;
}

/**
 * Upload a .vtt subtitle file directly to R2.
 */
export async function uploadEpisodeSubtitle(seriesId, episodeId, file, { languageCode = 'vi', label = 'Tiếng Việt', signal = null } = {}) {
  if (!seriesId || !episodeId || !file) throw new Error('Thiếu tham số tải phụ đề');

  const presignRes = await callVideoPresign({
    action: 'get-upload-url',
    seriesId,
    episodeId,
    targetType: 'subtitle',
    lang: languageCode,
    mimeType: 'text/vtt',
  }, { signal });

  const { uploadUrl, r2Key } = presignRes;

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/vtt; charset=utf-8' },
    body: file,
    signal,
  });

  if (!res.ok) {
    throw new Error(`Upload phụ đề thất bại (HTTP ${res.status}): ${res.statusText}`);
  }

  return { r2Key, languageCode, label };
}

/**
 * Upload MP4 video file directly to R2 using S3 Multipart Upload.
 * Chunked slicing avoids loading the entire file into memory.
 * Features retry per part with exponential backoff and cancel/abort capability.
 * 
 * @param {Object} params
 * @param {string} params.seriesId
 * @param {string} params.episodeId
 * @param {File} params.file Browser File object
 * @param {Function} [params.onProgress] Callback ({ percent, loaded, total, partIndex, totalParts, speedBytesPerSec })
 * @param {AbortSignal} [params.signal] AbortSignal for user cancellation
 */
export async function uploadVideoMultipart({ seriesId, episodeId, file, onProgress = null, signal = null }) {
  if (!seriesId || !episodeId || !file) {
    throw new Error('Thiếu thông tin bộ phim, tập phim hoặc tệp MP4');
  }

  const fileSize = file.size;
  if (fileSize <= 0) {
    throw new Error('Tệp MP4 có dung lượng không hợp lệ (0 bytes)');
  }

  // 1. Initialize Multipart Upload via Edge Function
  const initRes = await callVideoPresign({
    action: 'init-multipart-upload',
    seriesId,
    episodeId,
    fileSize,
    mimeType: file.type || 'video/mp4',
  }, { signal });

  const { uploadId, r2Key, partSize, totalParts, isThresholdExceeded } = initRes;

  let uploadedBytes = 0;
  const completedParts = [];
  const startTime = Date.now();

  try {
    // 2. Upload parts sequentially
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      if (signal?.aborted) {
        throw new Error('Tải lên đã bị hủy bởi người dùng');
      }

      const start = (partNumber - 1) * partSize;
      const end = Math.min(start + partSize, fileSize);
      const chunkBlob = file.slice(start, end);
      const chunkSize = end - start;

      // 2.1 Get Presigned PUT URL for this part
      const partPresign = await callVideoPresign({
        action: 'get-part-url',
        seriesId,
        episodeId,
        uploadId,
        partNumber,
      }, { signal });

      const partUrl = partPresign.partUrl;

      // 2.2 Upload part with up to 3 retries
      let partEtag = null;
      let lastErr = null;
      const MAX_RETRIES = 3;

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        if (signal?.aborted) throw new Error('Tải lên đã bị hủy bởi người dùng');

        try {
          const res = await fetch(partUrl, {
            method: 'PUT',
            body: chunkBlob,
            signal,
          });

          if (res.ok) {
            let etag = res.headers.get('ETag') || res.headers.get('etag');
            if (etag) {
              partEtag = etag.trim().replace(/^"|"$/g, ''); // strip quotes
              break;
            } else {
              // Cloudflare R2 returns ETag in lowercase or uppercase
              partEtag = `part-${partNumber}`;
              break;
            }
          } else {
            lastErr = new Error(`Part ${partNumber} upload thất bại: HTTP ${res.status}`);
          }
        } catch (err) {
          if (signal?.aborted) throw err;
          lastErr = err;
        }

        // Exponential backoff wait before retry: 1s, 2s, 4s
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }

      if (!partEtag) {
        throw new Error(`Không thể tải lên phần ${partNumber}/${totalParts}: ${lastErr?.message || 'Lỗi mạng'}`);
      }

      completedParts.push({ PartNumber: partNumber, ETag: `"${partEtag}"` });
      uploadedBytes += chunkSize;

      // Calculate speed and report progress
      if (onProgress) {
        const elapsedSec = (Date.now() - startTime) / 1000;
        const speedBytesPerSec = elapsedSec > 0 ? Math.round(uploadedBytes / elapsedSec) : 0;
        const percent = Math.min(99, Math.round((uploadedBytes / fileSize) * 100));
        onProgress({
          percent,
          loaded: uploadedBytes,
          total: fileSize,
          partIndex: partNumber,
          totalParts,
          speedBytesPerSec,
          isThresholdExceeded,
        });
      }
    }

    // 3. Complete Multipart Upload via Edge Function
    const completeRes = await callVideoPresign({
      action: 'complete-multipart-upload',
      seriesId,
      episodeId,
      uploadId,
      parts: completedParts,
    }, { signal });

    if (onProgress) {
      onProgress({
        percent: 100,
        loaded: fileSize,
        total: fileSize,
        partIndex: totalParts,
        totalParts,
        speedBytesPerSec: 0,
        isThresholdExceeded,
      });
    }

    // Invalidate any old playback cache
    playbackCache.delete(episodeId);

    return {
      success: true,
      r2Key,
      fileSize: completeRes.fileSize || fileSize,
      episodeId,
    };
  } catch (err) {
    // 4. Abort Multipart session if error occurs or user cancels
    try {
      await callVideoPresign({
        action: 'abort-multipart-upload',
        seriesId,
        episodeId,
        uploadId,
      });
    } catch (abortErr) {
      console.warn('[VideoCloud] Failed to cleanly abort multipart session:', abortErr);
    }
    throw err;
  }
}

/**
 * Get presigned playback URL for an episode.
 * Caches valid URLs in memory to prevent redundant backend calls.
 */
export async function getPlaybackUrl(seriesId, episodeId, { forceRefresh = false } = {}) {
  if (!seriesId || !episodeId) return null;

  const now = Date.now();
  const cached = playbackCache.get(episodeId);

  // Return cached URL if valid for at least 5 more minutes
  if (!forceRefresh && cached && cached.expiresAt > now + (5 * 60 * 1000)) {
    return cached;
  }

  const res = await callVideoPresign({
    action: 'get-playback-url',
    seriesId,
    episodeId,
  });

  const entry = {
    playbackUrl: res.playbackUrl,
    subtitles: res.subtitles || [],
    r2Key: res.r2Key,
    expiresAt: now + ((res.expiresIn || 21600) * 1000),
  };

  playbackCache.set(episodeId, entry);
  return entry;
}

/**
 * Delete media objects for an episode (video and subtitles) on R2.
 */
export async function deleteEpisodeMedia(seriesId, episodeId) {
  playbackCache.delete(episodeId);
  return callVideoPresign({
    action: 'delete-episode-media',
    seriesId,
    episodeId,
  });
}

/**
 * Delete all media objects under a series on R2.
 */
export async function deleteSeriesMedia(seriesId) {
  for (const [key] of playbackCache.entries()) {
    playbackCache.delete(key);
  }
  return callVideoPresign({
    action: 'delete-series-media',
    seriesId,
  });
}
