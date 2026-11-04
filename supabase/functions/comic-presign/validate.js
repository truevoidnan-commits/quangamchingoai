/**
 * Validation and Key Generation Rules for Comic Cloud Sync
 * Pure JS (no Deno or Node-specific dependencies) so it can be tested anywhere.
 */

export const MAX_BATCH_SIZE = 100;
export const MAX_PAGE_BYTES = 15 * 1024 * 1024; // 15MB per page
export const MAX_USER_QUOTA_BYTES = 8 * 1024 * 1024 * 1024; // 8GB total per user
export const MAX_HOURLY_OPS = 12000;
export const MAX_HOURLY_DELETE_OPS = 15000; // Dedicated higher limit for delete (E2)
export const PUT_EXPIRATION_SECONDS = 900; // 15 minutes
export const GET_EXPIRATION_SECONDS = 3600; // 1 hour

export const ALLOWED_ORIGINS = [
  'https://truevoidnan-commits.github.io',
  'http://localhost:5173',
];

const VOLUME_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates volumeId string format
 */
export function isValidVolumeId(volumeId) {
  if (typeof volumeId !== 'string') return false;
  return VOLUME_ID_REGEX.test(volumeId);
}

/**
 * Validates user ID UUID format
 */
export function isValidUid(uid) {
  if (typeof uid !== 'string') return false;
  return UUID_REGEX.test(uid);
}

/**
 * Validates a single page index (0 to 9999)
 */
export function isValidPageIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < 10000;
}

/**
 * Builds standard storage key in Cloudflare R2 bucket:
 * - `<uid>/<volumeId>/<pageIndex 4 chữ số>.webp`
 * - `<uid>/<volumeId>/cover.webp`
 */
export function buildObjectKey(uid, volumeId, pageIndexOrCover) {
  if (!isValidUid(uid)) {
    throw new Error('User ID không hợp lệ');
  }
  if (!isValidVolumeId(volumeId)) {
    throw new Error('volumeId không hợp lệ: chỉ cho phép [A-Za-z0-9_-] tối đa 64 ký tự');
  }

  if (pageIndexOrCover === 'cover') {
    return `${uid}/${volumeId}/cover.webp`;
  }

  if (isValidPageIndex(pageIndexOrCover)) {
    const padded = String(pageIndexOrCover).padStart(4, '0');
    return `${uid}/${volumeId}/${padded}.webp`;
  }

  throw new Error(`Chỉ số trang không hợp lệ: ${pageIndexOrCover}`);
}

/**
 * Parses XML output from S3 ListObjectsV2
 */
export function parseS3ListXml(xml) {
  if (!xml || typeof xml !== 'string') return { keys: [], nextContinuationToken: null };
  const keys = [...xml.matchAll(/<Key>(.*?)<\/Key>/g)].map((m) => m[1]);
  const tokenMatch = xml.match(/<NextContinuationToken>(.*?)<\/NextContinuationToken>/);
  return {
    keys,
    nextContinuationToken: tokenMatch ? tokenMatch[1] : null,
  };
}

/**
 * Validates incoming JSON payload for comic-presign Edge Function
 */
export function validatePresignRequest(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body phải là đối tượng JSON', code: 'INVALID_BODY' };
  }

  const { action, volumeId, pages, cover, totalBytes } = body;

  if (!action || !['put', 'get', 'delete-volume'].includes(action)) {
    return {
      ok: false,
      error: 'action phải là một trong: put, get, delete-volume',
      code: 'INVALID_ACTION',
    };
  }

  if (!isValidVolumeId(volumeId)) {
    return {
      ok: false,
      error: 'volumeId không hợp lệ: phải khớp [A-Za-z0-9_-]{1,64}',
      code: 'INVALID_VOLUME_ID',
    };
  }

  if (action === 'delete-volume') {
    return { ok: true, validated: { action, volumeId } };
  }

  // action === 'put' or 'get'
  const pageList = Array.isArray(pages) ? pages : [];
  for (const p of pageList) {
    if (!isValidPageIndex(p)) {
      return {
        ok: false,
        error: `Trang ${p} không hợp lệ: phải là số nguyên từ 0 đến 9999`,
        code: 'INVALID_PAGE_INDEX',
      };
    }
  }

  const totalOps = pageList.length + (cover ? 1 : 0);
  if (totalOps === 0) {
    return {
      ok: false,
      error: 'Phải yêu cầu ít nhất 1 trang hoặc cover',
      code: 'EMPTY_PAGES',
    };
  }

  if (totalOps > MAX_BATCH_SIZE) {
    return {
      ok: false,
      error: `Số lượng URL tối đa mỗi lần là ${MAX_BATCH_SIZE} (đang yêu cầu ${totalOps})`,
      code: 'BATCH_SIZE_EXCEEDED',
    };
  }

  if (action === 'put' && typeof totalBytes === 'number' && totalBytes < 0) {
    return {
      ok: false,
      error: 'totalBytes không được âm',
      code: 'INVALID_TOTAL_BYTES',
    };
  }

  return {
    ok: true,
    validated: {
      action,
      volumeId,
      pages: pageList,
      cover: Boolean(cover),
      totalBytes: typeof totalBytes === 'number' ? totalBytes : 0,
      totalOps,
    },
  };
}

/**
 * Checks if user total storage will exceed 8GB quota
 */
export function checkQuota({ usedBytes = 0, incomingBytes = 0, maxQuotaBytes = MAX_USER_QUOTA_BYTES }) {
  const projected = Number(usedBytes) + Number(incomingBytes);
  if (projected > maxQuotaBytes) {
    return {
      ok: false,
      error: 'Dung lượng lưu trữ truyện tranh trên Cloud đã vượt mức tối đa 8GB.',
      code: 'QUOTA_EXCEEDED',
      projected,
      maxQuotaBytes,
    };
  }
  return { ok: true, projected, maxQuotaBytes };
}

/**
 * Calculates effective used bytes for quota check, safely excluding the volume
 * currently being uploaded to prevent double-counting.
 */
export function calculateEffectiveUsedBytes(existingVolumeRows, currentVolumeId) {
  if (!Array.isArray(existingVolumeRows)) return 0;
  return existingVolumeRows
    .filter((row) => row && row.id !== currentVolumeId)
    .reduce((acc, row) => acc + (Number(row.total_bytes) || 0), 0);
}

/**
 * Checks rate limit (max 12000 operations per hour per user, or 15000 for delete)
 */
export function checkRateLimit({ action = 'put', currentHourlyOps = 0, incomingOps = 0, maxHourlyOps = null }) {
  const limit = maxHourlyOps ?? (action === 'delete-volume' ? MAX_HOURLY_DELETE_OPS : MAX_HOURLY_OPS);
  const projected = Number(currentHourlyOps) + Number(incomingOps);
  if (projected > limit) {
    return {
      ok: false,
      error: `Đã vượt quá giới hạn ${limit} thao tác/giờ. Vui lòng thử lại sau.`,
      code: 'RATE_LIMIT_EXCEEDED',
      projected,
      maxHourlyOps: limit,
    };
  }
  return {
    ok: true,
    remaining: limit - projected,
  };
}

/**
 * Generates CORS headers based on request origin
 */
export function getCorsHeaders(origin) {
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  const allowedOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
    'Access-Control-Max-Age': '3600',
  };
}
