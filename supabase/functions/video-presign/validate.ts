/**
 * Validation and Key Generation Rules for Video Subsystem (Cloudflare R2)
 * Pure TypeScript/JavaScript with zero platform dependencies.
 */

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ETAG_REGEX = /^[a-zA-Z0-9_\-:]+$/;

export const ALLOWED_ORIGINS = [
  'https://truevoidnan-commits.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
];

// Free tier Cloudflare R2 is 10GB.
// Warning threshold is strictly 8GB (8,589,934,592 bytes).
export const WARNING_THRESHOLD_BYTES = 8 * 1024 * 1024 * 1024;
export const ESTIMATED_COMIC_STORAGE_BYTES = 1.2 * 1024 * 1024 * 1024; // ~1.2 GB

export const PUT_EXPIRATION_SECONDS = 900; // 15 minutes for uploads
export const PLAYBACK_EXPIRATION_SECONDS = 21600; // 6 hours for video streaming

export const DEFAULT_PART_SIZE = 10 * 1024 * 1024; // 10MB per part (S3 minimum is 5MB)
export const MAX_PARTS = 10000;
export const MAX_POSTER_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024; // 5MB

export function isValidUuid(str: unknown): boolean {
  if (typeof str !== 'string') return false;
  return UUID_REGEX.test(str);
}

export function isValidEtag(etag: unknown): boolean {
  if (typeof etag !== 'string') return false;
  const clean = etag.trim().replace(/^"|"$/g, '');
  if (!clean || clean.length > 256) return false;
  return ETAG_REGEX.test(clean);
}

export function cleanEtag(etag: string): string {
  return etag.trim().replace(/^"|"$/g, '');
}

export function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

export function buildPosterKey(seriesId: string, ext = 'webp'): string {
  if (!isValidUuid(seriesId)) throw new Error('seriesId không hợp lệ');
  const safeExt = ['webp', 'jpg', 'jpeg', 'png'].includes(ext.toLowerCase()) ? ext.toLowerCase() : 'webp';
  return `videos/${seriesId}/poster.${safeExt}`;
}

export function buildVideoSourceKey(seriesId: string, episodeId: string): string {
  if (!isValidUuid(seriesId)) throw new Error('seriesId không hợp lệ');
  if (!isValidUuid(episodeId)) throw new Error('episodeId không hợp lệ');
  return `videos/${seriesId}/${episodeId}/source.mp4`;
}

export function buildSubtitleKey(seriesId: string, episodeId: string, lang = 'vi'): string {
  if (!isValidUuid(seriesId)) throw new Error('seriesId không hợp lệ');
  if (!isValidUuid(episodeId)) throw new Error('episodeId không hợp lệ');
  const safeLang = /^[a-z]{2,5}(-[a-z0-9]{2,5})?$/i.test(lang) ? lang.toLowerCase() : 'vi';
  return `videos/${seriesId}/${episodeId}/subtitles/${safeLang}.vtt`;
}

export function getCorsHeaders(origin: string | null) {
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  const allowedOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range, x-supabase-api-version',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, ETag, Retry-After',
    'Access-Control-Max-Age': '3600',
  };
}

export function validateVideoPresignRequest(body: any): { ok: boolean; error?: string; code?: string; data?: any } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body phải là đối tượng JSON', code: 'INVALID_BODY' };
  }

  const { action } = body;
  const validActions = [
    'get-upload-url',
    'init-multipart-upload',
    'get-part-url',
    'complete-multipart-upload',
    'abort-multipart-upload',
    'verify-episode-upload',
    'get-playback-url',
    'get-storage-stats',
    'test-r2-connection',
    'delete-episode-media',
    'delete-series-media',
  ];

  if (!action || !validActions.includes(action)) {
    return {
      ok: false,
      error: `action không hợp lệ. Cho phép: ${validActions.join(', ')}`,
      code: 'INVALID_ACTION',
    };
  }

  if (action === 'get-storage-stats' || action === 'test-r2-connection') {
    return { ok: true, data: { action } };
  }

  const { seriesId, episodeId } = body;

  if (!seriesId || !isValidUuid(seriesId)) {
    return { ok: false, error: 'seriesId không hợp lệ (phải là UUID)', code: 'INVALID_SERIES_ID' };
  }

  if (['init-multipart-upload', 'get-part-url', 'complete-multipart-upload', 'abort-multipart-upload', 'verify-episode-upload', 'get-playback-url', 'delete-episode-media'].includes(action)) {
    if (!episodeId || !isValidUuid(episodeId)) {
      return { ok: false, error: 'episodeId không hợp lệ (phải là UUID)', code: 'INVALID_EPISODE_ID' };
    }
  }

  if (action === 'verify-episode-upload') {
    const uploadId = typeof body.uploadId === 'string' && body.uploadId.trim() ? body.uploadId.trim() : undefined;
    return { ok: true, data: { action, seriesId, episodeId, uploadId } };
  }

  if (action === 'init-multipart-upload') {
    const fileSize = Number(body.fileSize);
    if (isNaN(fileSize) || fileSize <= 0) {
      return { ok: false, error: 'fileSize phải là số nguyên dương tính theo byte', code: 'INVALID_FILE_SIZE' };
    }
    const mimeType = body.mimeType || 'video/mp4';
    if (!['video/mp4', 'video/quicktime', 'video/webm'].includes(mimeType.toLowerCase())) {
      return { ok: false, error: 'Định dạng video phải là MP4 (video/mp4)', code: 'INVALID_MIME_TYPE' };
    }
    return { ok: true, data: { action, seriesId, episodeId, fileSize, mimeType } };
  }

  if (action === 'get-part-url') {
    const partNumber = parseInt(body.partNumber, 10);
    const uploadId = body.uploadId;
    if (!uploadId || typeof uploadId !== 'string') {
      return { ok: false, error: 'uploadId không được để trống', code: 'INVALID_UPLOAD_ID' };
    }
    if (isNaN(partNumber) || partNumber < 1 || partNumber > MAX_PARTS) {
      return { ok: false, error: `partNumber phải là số nguyên từ 1 đến ${MAX_PARTS}`, code: 'INVALID_PART_NUMBER' };
    }
    return { ok: true, data: { action, seriesId, episodeId, uploadId, partNumber } };
  }

  if (action === 'complete-multipart-upload') {
    const uploadId = body.uploadId;
    const parts = body.parts;
    if (!uploadId || typeof uploadId !== 'string') {
      return { ok: false, error: 'uploadId không được để trống', code: 'INVALID_UPLOAD_ID' };
    }
    if (!Array.isArray(parts) || parts.length === 0) {
      return { ok: false, error: 'Danh sách parts không được rỗng', code: 'EMPTY_PARTS' };
    }

    const seenPartNumbers = new Set<number>();
    const sanitizedParts: Array<{ PartNumber: number; ETag: string }> = [];

    for (const p of parts) {
      if (!p || typeof p.PartNumber !== 'number' || !p.ETag) {
        return { ok: false, error: 'Cấu trúc part không hợp lệ: cần PartNumber và ETag', code: 'INVALID_PART_ENTRY' };
      }
      if (p.PartNumber < 1 || p.PartNumber > MAX_PARTS) {
        return { ok: false, error: `PartNumber ${p.PartNumber} ngoài giới hạn cho phép`, code: 'INVALID_PART_NUMBER' };
      }
      if (seenPartNumbers.has(p.PartNumber)) {
        return { ok: false, error: `PartNumber ${p.PartNumber} bị trùng lặp`, code: 'DUPLICATE_PART_NUMBER' };
      }
      seenPartNumbers.add(p.PartNumber);

      if (!isValidEtag(p.ETag)) {
        return { ok: false, error: `Part ${p.PartNumber} có ETag không hợp lệ hoặc chứa ký tự không an toàn: "${p.ETag}"`, code: 'INVALID_ETAG_FORMAT' };
      }

      sanitizedParts.push({
        PartNumber: p.PartNumber,
        ETag: cleanEtag(p.ETag),
      });
    }

    return { ok: true, data: { action, seriesId, episodeId, uploadId, parts: sanitizedParts } };
  }

  if (action === 'abort-multipart-upload') {
    const uploadId = body.uploadId;
    if (!uploadId || typeof uploadId !== 'string') {
      return { ok: false, error: 'uploadId không được để trống', code: 'INVALID_UPLOAD_ID' };
    }
    return { ok: true, data: { action, seriesId, episodeId, uploadId } };
  }

  if (action === 'get-upload-url') {
    const targetType = body.targetType; // 'poster' | 'subtitle'
    if (!['poster', 'subtitle'].includes(targetType)) {
      return { ok: false, error: 'targetType phải là poster hoặc subtitle', code: 'INVALID_TARGET_TYPE' };
    }
    if (targetType === 'subtitle' && (!episodeId || !isValidUuid(episodeId))) {
      return { ok: false, error: 'episodeId không hợp lệ cho phụ đề', code: 'INVALID_EPISODE_ID' };
    }
    return {
      ok: true,
      data: {
        action,
        seriesId,
        episodeId: targetType === 'subtitle' ? episodeId : null,
        targetType,
        ext: body.ext || 'webp',
        lang: body.lang || 'vi',
        mimeType: body.mimeType,
      },
    };
  }

  return { ok: true, data: { action, seriesId, episodeId } };
}
