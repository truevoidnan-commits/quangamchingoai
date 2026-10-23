/**
 * src/lib/backup/backupEngine.js
 * Engine Sao lưu & Khôi phục (Backup & Restore) độc lập với Cloud Sync
 */

import { getActiveProfile, getCultivationState, saveCultivationState, getCultivationKey } from '../cultivation.js';
import {
  getLibrary,
  addToLibrary,
  removeFromLibrary,
  getReadingProgress,
  saveReadingProgress,
  getReadingSettings,
  saveReadingSettings,
  getVaultPasswordInfo,
  setVaultPasswordRaw,
  notifyLibraryChanged,
} from '../storage.js';
import { getNovel, saveNovel, deleteNovelDB, getChapters, saveChaptersBulk, deleteChaptersOfNovel } from '../db.js';
import { recordNovelTombstone, removeTombstone, markNovelDirty } from '../sync/syncLedger.js';
import { normalizeTitle } from '../sync/syncEngine.js';

export const BACKUP_FORMAT = 'thien-co-lau-backup';
export const BACKUP_VERSION = 1;
export const LAST_BACKUP_STORAGE_KEY = 'tcl_last_backup_at';
export const PRE_RESTORE_SNAPSHOT_KEY = 'tcl_pre_restore_snapshot';

/**
 * Danh sách allowlist các khóa localStorage được phép thao tác khi nhập file.
 * Tuyệt đối không cho phép ghi bất kỳ khóa tùy ý nào từ bên ngoài.
 */
export function isAllowlistedStorageKey(key) {
  if (!key || typeof key !== 'string') return false;
  if (key === 'tcl_library') return true;
  if (key === 'tcl_reading_settings') return true;
  if (key === 'tcl_vault_pwd_hash') return true;
  if (key === 'tcl_vault_pwd_hint') return true;
  if (key === 'tcl_vault_pwd_updated_at') return true;
  if (key === 'tcl_cultivation_state_v3') return true;
  if (key === 'cultivation_pending_seconds') return true;
  if (/^tcl_progress_[a-zA-Z0-9_\-]+$/.test(key)) return true;
  if (/^scroll_pos_[a-zA-Z0-9_\-]+_[a-zA-Z0-9_\-]+$/.test(key)) return true;
  return false;
}

/**
 * Ánh xạ ID chương khi khôi phục (thêm tiền tố nếu truyện thuộc nhánh create_new)
 */
export function mapChapterIdForNovel(fileNovelId, chapterId, prefixMap = null) {
  if (!chapterId) return chapterId;
  const prefix = prefixMap instanceof Map ? prefixMap.get(fileNovelId) : prefixMap;
  return prefix ? `${prefix}_${chapterId}` : chapterId;
}

/**
 * Chuỗi hóa JSON theo thứ tự key đã sắp xếp (deterministic canonical JSON)
 * để SHA-256 checksum luôn khớp bất kể engine JSON serialize thứ tự key ra sao.
 */
export function canonicalJsonStringify(obj) {
  if (obj === null || obj === undefined) {
    return 'null';
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj);
  }
  if (typeof obj === 'string') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalJsonStringify(item ?? null)).join(',') + ']';
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort();
    const pairs = keys.map(k => JSON.stringify(k) + ':' + canonicalJsonStringify(obj[k]));
    return '{' + pairs.join(',') + '}';
  }
  return 'null';
}

/**
 * Tính mã băm SHA-256 (hỗ trợ cả Web Crypto API và Node.js crypto module)
 */
export async function computeSHA256(str) {
  if (typeof crypto !== 'undefined' && crypto?.subtle?.digest) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  try {
    const nodeCrypto = await import('crypto');
    return nodeCrypto.createHash('sha256').update(str).digest('hex');
  } catch (e) {
    throw new Error('Môi trường không hỗ trợ thuật toán SHA-256.');
  }
}

/**
 * Kiểm tra magic bytes của gzip (0x1f 0x8b)
 */
export function isGzip(bytes) {
  if (!bytes || bytes.byteLength < 2) return false;
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return view[0] === 0x1f && view[1] === 0x8b;
}

/**
 * Nén mảng byte sang gzip (ưu tiên Web CompressionStream, fallback zlib trên Node.js)
 */
export async function compressData(uint8Array) {
  if (typeof CompressionStream !== 'undefined') {
    const stream = new Blob([uint8Array]).stream();
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    const response = new Response(compressedStream);
    const blob = await response.blob();
    return new Uint8Array(await blob.arrayBuffer());
  }
  try {
    const zlib = await import('zlib');
    return new Uint8Array(zlib.gzipSync(uint8Array));
  } catch (e) {
    return null; // Không hỗ trợ nén
  }
}

/**
 * Giải nén mảng byte gzip (ưu tiên Web DecompressionStream, fallback zlib trên Node.js)
 */
export async function decompressData(uint8Array) {
  if (typeof DecompressionStream !== 'undefined') {
    const stream = new Blob([uint8Array]).stream();
    const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
    const response = new Response(decompressedStream);
    const blob = await response.blob();
    return new Uint8Array(await blob.arrayBuffer());
  }
  try {
    const zlib = await import('zlib');
    return new Uint8Array(zlib.gunzipSync(uint8Array));
  } catch (e) {
    throw new Error('Môi trường không hỗ trợ giải nén Gzip.');
  }
}

/**
 * Đọc thời điểm sao lưu gần nhất từ localStorage
 */
export function getLastBackupTimestamp() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LAST_BACKUP_STORAGE_KEY);
      const ts = parseInt(raw || '0', 10);
      return !isNaN(ts) ? ts : 0;
    }
  } catch (e) {}
  return 0;
}

/**
 * Lưu thời điểm sao lưu vừa hoàn thành vào localStorage
 */
export function saveLastBackupTimestamp(timestamp = Date.now()) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LAST_BACKUP_STORAGE_KEY, String(timestamp));
    }
  } catch (e) {}
}

/**
 * Kiểm tra xem đã quá hạn sao lưu hay chưa (mặc định > 14 ngày hoặc chưa từng sao lưu)
 */
export function isBackupOverdue(days = 14) {
  const lastAt = getLastBackupTimestamp();
  if (!lastAt || lastAt <= 0) return true;
  const now = Date.now();
  const diffDays = (now - lastAt) / (1000 * 60 * 60 * 24);
  return diffDays >= days;
}

/**
 * Ước tính dung lượng file sao lưu trước khi xuất
 */
export async function estimateBackupSize(options = {}) {
  const {
    includeContent = true,
    selectedNovelIds = null,
    parts = {
      novels: true,
      progress: true,
      cultivation: true,
      settings: true,
      vault: true,
    },
  } = options;

  let estimatedBytes = 2048; // Base JSON structure & overhead

  if (parts.novels) {
    const library = getLibrary({ includeHidden: true });
    const targetNovels = selectedNovelIds
      ? library.filter(n => selectedNovelIds.has(n.id))
      : library;

    for (const item of targetNovels) {
      // Metadata ~ 2KB
      estimatedBytes += 2048;
      // If content included: average ~ 3KB per chapter
      if (includeContent) {
        const chapterCount = item.chapterCount || item.totalChapters || 0;
        estimatedBytes += chapterCount * 3072;
      }
    }
  }

  if (parts.progress) {
    estimatedBytes += 2048;
  }
  if (parts.cultivation) {
    estimatedBytes += 8192; // Cultivation state & dao anHS
  }
  if (parts.settings) {
    estimatedBytes += 512;
  }
  if (parts.vault) {
    estimatedBytes += 512;
  }

  const estimatedGzBytes = Math.round(estimatedBytes * 0.28); // Average gzip ratio for text/JSON
  return {
    rawBytes: estimatedBytes,
    gzBytes: estimatedGzBytes,
  };
}

/**
 * Tạo dữ liệu file sao lưu hoàn chỉnh và tính SHA-256 checksum
 */
export async function createBackupData(options = {}, onProgress = null) {
  const {
    includeContent = true,
    selectedNovelIds = null,
    parts = {
      novels: true,
      progress: true,
      cultivation: true,
      settings: true,
      vault: true,
    },
  } = options;

  const currentProfile = getActiveProfile();

  const backupParts = {
    novels: [],
    progress: [],
    cultivation: null,
    settings: null,
    vault: null,
  };

  // 1. Phần Novels
  if (parts.novels) {
    const allLibrary = getLibrary({ includeHidden: true });
    const targetLibrary = selectedNovelIds
      ? allLibrary.filter(n => selectedNovelIds.has(n.id))
      : allLibrary;

    const total = targetLibrary.length;
    for (let i = 0; i < total; i++) {
      const item = targetLibrary[i];
      if (onProgress) {
        onProgress({ step: 'novels', current: i + 1, total, title: item.title });
      }

      let dbNovel = null;
      try {
        dbNovel = await getNovel(item.id);
      } catch (e) {}

      let chapters = null;
      if (includeContent) {
        try {
          chapters = await getChapters(item.id);
        } catch (e) {}
      }

      backupParts.novels.push({
        id: item.id,
        title: item.title,
        author: item.author || '',
        description: item.description || dbNovel?.description || '',
        cover: dbNovel?.cover || item.coverUrl || '',
        coverThumb: item.coverThumb || '',
        isHidden: Boolean(item.isHidden),
        updatedAt: item.updatedAt || dbNovel?.updatedAt || Date.now(),
        createdAt: item.createdAt || dbNovel?.createdAt || Date.now(),
        chapterCount: chapters ? chapters.length : (item.chapterCount || 0),
        totalChapters: chapters ? chapters.length : (item.totalChapters || 0),
        chapters: chapters || null,
      });

      // Nhường luồng cho UI vẽ mượt mà
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // 2. Phần Progress
  if (parts.progress) {
    const allLibrary = getLibrary({ includeHidden: true });
    const targetLibrary = selectedNovelIds
      ? allLibrary.filter(n => selectedNovelIds.has(n.id))
      : allLibrary;

    for (const item of targetLibrary) {
      const prog = getReadingProgress(item.id);
      const scrollPositions = [];
      try {
        if (typeof localStorage !== 'undefined') {
          const prefix = `scroll_pos_${item.id}_`;
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(prefix)) {
              const chapterId = key.slice(prefix.length);
              try {
                const data = JSON.parse(localStorage.getItem(key));
                scrollPositions.push({ chapterId, data });
              } catch (e) {}
            }
          }
        }
      } catch (e) {}

      backupParts.progress.push({
        novelId: item.id,
        progress: prog,
        scrollPositions,
      });
    }
  }

  // 3. Phần Tu vi
  // Ràng buộc bảo mật: Sandbox KHÔNG BAO GIỜ được xuất tu vi!
  if (parts.cultivation && currentProfile === 'real') {
    try {
      const rawState = localStorage.getItem('tcl_cultivation_state_v3');
      const state = rawState ? JSON.parse(rawState) : null;
      const rawPending = localStorage.getItem('cultivation_pending_seconds');
      const pendingSeconds = rawPending ? parseInt(rawPending, 10) : 0;
      backupParts.cultivation = {
        state,
        pendingSeconds: isNaN(pendingSeconds) ? 0 : pendingSeconds,
      };
    } catch (e) {
      backupParts.cultivation = null;
    }
  } else {
    backupParts.cultivation = null;
  }

  // 4. Phần Cài đặt đọc
  if (parts.settings) {
    backupParts.settings = getReadingSettings();
  }

  // 5. Phần Mật Thất
  if (parts.vault) {
    backupParts.vault = getVaultPasswordInfo();
  }

  // Tính checksum SHA-256 chuẩn trên canonical JSON của parts
  const canonicalPartsJson = canonicalJsonStringify(backupParts);
  const checksum = await computeSHA256(canonicalPartsJson);

  const backupObj = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    profile: currentProfile === 'real' ? 'real' : 'sandbox',
    parts: backupParts,
    checksum,
  };

  const finalJsonStr = JSON.stringify(backupObj);
  const jsonBytes = new TextEncoder().encode(finalJsonStr);

  let compressedBytes = null;
  try {
    compressedBytes = await compressData(jsonBytes);
  } catch (e) {
    compressedBytes = null;
  }

  const isGzipCompressed = Boolean(compressedBytes);
  const finalBytes = isGzipCompressed ? compressedBytes : jsonBytes;
  const mimeType = isGzipCompressed ? 'application/gzip' : 'application/json';
  const ext = isGzipCompressed ? '.tclbackup.json.gz' : '.tclbackup.json';

  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `thien-co-lau-backup-${dateStr}${ext}`;

  let blob = null;
  if (typeof Blob !== 'undefined') {
    blob = new Blob([finalBytes], { type: mimeType });
  }

  saveLastBackupTimestamp(backupObj.exportedAt);

  return {
    backupObj,
    jsonStr: finalJsonStr,
    bytes: finalBytes,
    blob,
    filename,
    isGzip: isGzipCompressed,
    uncompressedSize: jsonBytes.length,
    compressedSize: finalBytes.length,
  };
}

/**
 * Tải file hoặc chia sẻ trên thiết bị di động
 */
export async function downloadOrShareBackupFile(blob, filename) {
  if (typeof window === 'undefined' || !blob) return { downloaded: false };

  // Trên thiết bị di động hỗ trợ Web Share API với tệp
  try {
    if (typeof File !== 'undefined' && typeof navigator !== 'undefined' && navigator.canShare && navigator.share) {
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Thiên Cơ Lâu - Sao Lưu Dữ Liệu',
          text: `Bản sao lưu Thiên Cơ Lâu: ${filename}`,
        });
        return { shared: true };
      }
    }
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { shared: false, cancelled: true };
    }
    console.warn('Navigator share error, falling back to download:', err);
  }

  // Tải xuống bằng thẻ a[download]
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return { downloaded: true };
}

/**
 * Đọc, giải nén và kiểm tra tính toàn vẹn (checksum) file sao lưu
 */
export async function parseAndVerifyBackupFile(input) {
  let rawBytes = null;
  if (typeof input === 'string') {
    rawBytes = new TextEncoder().encode(input);
  } else if (input instanceof Uint8Array) {
    rawBytes = input;
  } else if (input instanceof ArrayBuffer) {
    rawBytes = new Uint8Array(input);
  } else if (input && typeof input.arrayBuffer === 'function') {
    rawBytes = new Uint8Array(await input.arrayBuffer());
  } else {
    throw new Error('Dữ liệu file không hợp lệ.');
  }

  let jsonStr = '';
  if (isGzip(rawBytes)) {
    const decompressed = await decompressData(rawBytes);
    jsonStr = new TextDecoder('utf-8').decode(decompressed);
  } else {
    jsonStr = new TextDecoder('utf-8').decode(rawBytes);
  }

  let parsed = null;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error('File không thể đọc được dưới dạng JSON hợp lệ: ' + err.message);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Cấu trúc file sao lưu không hợp lệ.');
  }

  if (parsed.format !== BACKUP_FORMAT) {
    throw new Error('Định dạng file không hợp lệ (không phải file sao lưu của Thiên Cơ Lâu).');
  }

  if (typeof parsed.version === 'number' && parsed.version > BACKUP_VERSION) {
    throw new Error(
      `Phiên bản file sao lưu (v${parsed.version}) cao hơn phiên bản ứng dụng hỗ trợ (v${BACKUP_VERSION}). Hãy cập nhật ứng dụng!`
    );
  }

  if (!parsed.parts || typeof parsed.parts !== 'object') {
    throw new Error('Dữ liệu các phần sao lưu (parts) bị thiếu hoặc không hợp lệ.');
  }

  if (!parsed.checksum) {
    throw new Error('File sao lưu thiếu mã kiểm tra tính toàn vẹn (checksum SHA-256).');
  }

  const canonicalPartsJson = canonicalJsonStringify(parsed.parts);
  const calculatedChecksum = await computeSHA256(canonicalPartsJson);

  if (calculatedChecksum !== parsed.checksum) {
    throw new Error(
      'Mã kiểm tra tính toàn vẹn (checksum SHA-256) không khớp! File sao lưu có thể đã bị chỉnh sửa hoặc hư hỏng.'
    );
  }

  return parsed;
}

/**
 * Phân tích và so sánh file sao lưu với dữ liệu hiện tại trên máy để tạo màn hình XEM TRƯỚC (Preview)
 */
export function analyzeBackupForPreview(backupObj) {
  const currentProfile = getActiveProfile();
  const localLibrary = getLibrary({ includeHidden: true });
  const localMapById = new Map(localLibrary.map(n => [n.id, n]));
  const localMapByNormTitle = new Map(localLibrary.map(n => [normalizeTitle(n.title), n]));

  // 1. Phân tích truyện
  const novelComparisons = [];
  const backupNovels = backupObj.parts.novels || [];
  for (const novel of backupNovels) {
    const local = localMapById.get(novel.id);
    let status = 'new';
    let localMatch = null;

    if (local) {
      localMatch = local;
      const localUpdated = local.updatedAt || 0;
      const fileUpdated = novel.updatedAt || 0;
      if (fileUpdated > localUpdated) {
        status = 'newer';
      } else if (fileUpdated === localUpdated) {
        status = 'identical';
      } else {
        status = 'older';
      }
    } else {
      const normTitle = normalizeTitle(novel.title);
      const titleMatch = localMapByNormTitle.get(normTitle);
      if (titleMatch) {
        status = 'title_conflict';
        localMatch = titleMatch;
      } else {
        status = 'new';
      }
    }

    novelComparisons.push({
      novel,
      local: localMatch,
      status, // 'new' | 'newer' | 'older' | 'identical' | 'title_conflict'
      chapterCount: novel.chapterCount || (novel.chapters ? novel.chapters.length : 0),
      hasContent: Boolean(novel.chapters && novel.chapters.length > 0),
    });
  }

  // 2. Phân tích Tu vi
  let cultivationComparison = null;
  if (backupObj.parts.cultivation?.state) {
    const localState = getCultivationState();
    const fileState = backupObj.parts.cultivation.state;
    const filePending = backupObj.parts.cultivation.pendingSeconds || 0;
    const localPending = parseInt(
      (typeof localStorage !== 'undefined' ? localStorage.getItem(getCultivationKey('pending_seconds')) : '0') || '0',
      10
    ) || 0;

    const fileRev = typeof fileState._rev === 'number' ? fileState._rev : 0;
    const localRev = typeof localState._rev === 'number' ? localState._rev : 0;

    let status = 'identical';
    if (fileRev > localRev) status = 'newer';
    else if (fileRev < localRev) status = 'older';
    else if (fileState.exp !== localState.exp || fileState.currentRealm !== localState.currentRealm) {
      status = 'conflict';
    }

    cultivationComparison = {
      isSandboxBlocked: currentProfile === 'sandbox',
      status,
      local: {
        realm: localState.currentRealm,
        level: localState.currentLevelName || localState.level,
        exp: localState.exp,
        thienMenh: localState.thienMenh,
        rev: localRev,
        updatedAt: localState._updatedAt || 0,
        pendingSeconds: localPending,
      },
      file: {
        realm: fileState.currentRealm,
        level: fileState.currentLevelName || fileState.level,
        exp: fileState.exp,
        thienMenh: fileState.thienMenh,
        rev: fileRev,
        updatedAt: fileState._updatedAt || 0,
        pendingSeconds: filePending,
      },
    };
  }

  // 3. Phân tích Cài đặt
  let settingsComparison = null;
  if (backupObj.parts.settings) {
    const localSettings = getReadingSettings();
    const fileSettings = backupObj.parts.settings;
    settingsComparison = {
      local: localSettings,
      file: fileSettings,
      isDifferent: JSON.stringify(localSettings) !== JSON.stringify(fileSettings),
    };
  }

  // 4. Phân tích Mật Thất
  let vaultComparison = null;
  if (backupObj.parts.vault) {
    const localVault = getVaultPasswordInfo();
    const fileVault = backupObj.parts.vault;
    vaultComparison = {
      local: localVault,
      file: fileVault,
      isDifferent: localVault.hash !== fileVault.hash,
    };
  }

  return {
    exportedAt: backupObj.exportedAt,
    profile: backupObj.profile,
    appCommit: backupObj.appCommit,
    novels: novelComparisons,
    cultivation: cultivationComparison,
    settings: settingsComparison,
    vault: vaultComparison,
    totalNovelsInBackup: backupNovels.length,
    totalChaptersInBackup: backupNovels.reduce(
      (sum, n) => sum + (n.chapterCount || (n.chapters ? n.chapters.length : 0)),
      0
    ),
  };
}

/**
 * Thực hiện khôi phục dữ liệu từ file sao lưu đã kiểm tra
 */
export async function performRestore(options = {}, onProgress = null) {
  const {
    backupObj,
    mode = 'merge', // 'merge' | 'replace'
    selectedParts = {
      novels: true,
      progress: true,
      cultivation: false,
      settings: false,
      vault: false,
    },
    selectedNovelIds = null, // Set hoặc Array các novelId được chọn
    deleteUnlistedNovels = false,
    deleteUnlisted = false,
    titleConflictResolutions = {}, // { [novelId]: 'overwrite' | 'create_new' | 'skip' }
    confirmCultivation = false,
  } = options;

  const currentProfile = getActiveProfile();

  // Ràng buộc bảo mật: Khôi phục tu vi vào hồ sơ sandbox tuyệt đối bị từ chối
  if (selectedParts.cultivation && confirmCultivation && currentProfile === 'sandbox') {
    throw new Error('Khôi phục tu vi vào hồ sơ Sandbox bị từ chối. Hãy chuyển sang Hồ sơ Thật trước khi khôi phục.');
  }

  // Tự động tạo bản chụp an toàn dữ liệu hiện tại trước khi khôi phục
  // Bỏ qua lưu library đầy đủ (tránh QuotaExceededError trên trình duyệt), chỉ lưu novelIds
  try {
    if (typeof localStorage !== 'undefined') {
      const currentCultivation = getCultivationState();
      const currentPending = localStorage.getItem('cultivation_pending_seconds') || '0';
      const localLibrary = getLibrary({ includeHidden: true });
      const snapshot = {
        cultivation: currentCultivation,
        pendingSeconds: currentPending,
        novelIds: localLibrary.map(n => n.id),
        timestamp: Date.now(),
        mode,
      };
      localStorage.setItem(PRE_RESTORE_SNAPSHOT_KEY, JSON.stringify(snapshot));
    }
  } catch (e) {
    // QuotaExceededError: bỏ qua không chặn khôi phục
  }

  const selectedIdSet = selectedNovelIds ? new Set(selectedNovelIds) : null;
  const shouldDeleteUnlisted = Boolean(deleteUnlistedNovels || deleteUnlisted);

  const report = {
    addedNovels: 0,
    updatedNovels: 0,
    skippedNovels: 0,
    deletedNovels: 0,
    progressRestored: 0,
    cultivationRestored: false,
    settingsRestored: false,
    vaultRestored: false,
    skippedInvalidKeys: 0,
    errors: [],
  };

  // Nếu là chế độ THAY THẾ TOÀN BỘ VÀ người dùng CHỦ ĐỘNG bật tùy chọn xóa truyện ngoài file:
  // Chỉ xóa các truyện ở máy không nằm trong backupObj và không nằm trong selectedNovelIds
  if (mode === 'replace' && selectedParts.novels && shouldDeleteUnlisted) {
    const fileNovelIds = new Set((backupObj.parts?.novels || []).map(n => n.id));
    const localLibrary = getLibrary({ includeHidden: true });
    for (const local of localLibrary) {
      if (!fileNovelIds.has(local.id) && (!selectedIdSet || !selectedIdSet.has(local.id))) {
        try {
          await deleteNovelDB(local.id);
          removeFromLibrary(local.id);
          recordNovelTombstone(local.id, Date.now());
          notifyLibraryChanged(local.id);
          report.deletedNovels++;
        } catch (e) {
          report.errors.push(`Lỗi xóa truyện "${local.title}": ${e.message}`);
        }
      }
    }
  }

  // Ánh xạ fileNovelId -> targetId để chuyển tiếp progress cho truyện được đổi ID
  const novelIdMap = new Map();
  const skippedDueToConflict = new Set();
  const createNewChapterPrefix = new Map();

  // 1. Khôi phục Truyện (Novels)
  if (selectedParts.novels && Array.isArray(backupObj.parts?.novels)) {
    const novelsToProcess = selectedIdSet
      ? backupObj.parts.novels.filter(n => selectedIdSet.has(n.id))
      : backupObj.parts.novels;

    const total = novelsToProcess.length;
    for (let i = 0; i < total; i++) {
      const item = novelsToProcess[i];
      if (onProgress) {
        onProgress({ step: 'novels', current: i + 1, total, title: item.title });
      }

      try {
        const localLibrary = getLibrary({ includeHidden: true });
        const existing = localLibrary.find(n => n.id === item.id);

        let targetId = item.id;
        let shouldApply = false;
        let isOverwriteTitleConflict = false;
        let isCreateNew = false;

        if (existing) {
          if (mode === 'replace') {
            shouldApply = true;
          } else {
            // Gộp: chỉ thay khi bản trong file mới hơn
            const fileUpdated = item.updatedAt || 0;
            const localUpdated = existing.updatedAt || 0;
            if (fileUpdated > localUpdated) {
              shouldApply = true;
            } else {
              report.skippedNovels++;
              continue;
            }
          }
        } else {
          // Kiểm tra trùng tên chuẩn hóa
          const normTitle = normalizeTitle(item.title);
          const titleConflict = localLibrary.find(n => normalizeTitle(n.title) === normTitle);
          if (titleConflict) {
            // Mặc định xử lý khi trùng tên chuẩn hóa nhưng khác ID PHẢI là 'skip'
            const resolution = titleConflictResolutions[item.id] || 'skip';
            if (resolution === 'skip') {
              report.skippedNovels++;
              skippedDueToConflict.add(item.id);
              continue;
            } else if (resolution === 'create_new') {
              targetId = `${item.id}_${Date.now()}`;
              shouldApply = true;
              isCreateNew = true;
              createNewChapterPrefix.set(item.id, targetId);
            } else if (resolution === 'overwrite') {
              targetId = titleConflict.id;
              shouldApply = true;
              isOverwriteTitleConflict = true;
            } else {
              report.skippedNovels++;
              continue;
            }
          } else {
            shouldApply = true;
          }
        }

        if (shouldApply) {
          novelIdMap.set(item.id, targetId);

          const now = Date.now();
          const existingUpdated = existing?.updatedAt || 0;
          const fileUpdated = item.updatedAt || 0;
          const causalUpdatedAt = Math.max(now, existingUpdated + 1, fileUpdated + 1);

          // Khi ghi đè truyện do trùng tên khác ID: Xóa toàn bộ chương cũ của truyện đích trước khi ghi
          // (skipDirty: true để không sinh dirty dư thừa, không tạo tombstone, giữ nguyên targetId)
          if (isOverwriteTitleConflict) {
            await deleteChaptersOfNovel(targetId, { skipDirty: true });
          }

          const chapterCount = item.chapterCount || (item.chapters ? item.chapters.length : 0);
          const novelDoc = {
            id: targetId,
            title: item.title,
            author: item.author || '',
            description: item.description || '',
            cover: item.cover || '',
            isHidden: Boolean(item.isHidden),
            updatedAt: causalUpdatedAt,
            createdAt: item.createdAt || now,
            chapterCount,
            totalChapters: item.totalChapters || chapterCount,
          };

          await saveNovel(novelDoc, { markDirty: true });

          if (item.chapters && Array.isArray(item.chapters)) {
            const chaptersToSave = item.chapters.map(ch => ({
              ...ch,
              id: mapChapterIdForNovel(item.id, ch.id, createNewChapterPrefix),
              novelId: targetId,
            }));
            await saveChaptersBulk(chaptersToSave, { skipDirty: false });
          }

          addToLibrary({
            id: targetId,
            title: item.title,
            author: item.author || '',
            coverThumb: item.coverThumb || '',
            chapterCount: novelDoc.chapterCount,
            totalChapters: novelDoc.totalChapters,
            isHidden: novelDoc.isHidden,
            updatedAt: causalUpdatedAt,
          });

          // Gỡ tombstone nếu truyện này từng bị xóa ở máy này
          removeTombstone(targetId);
          // Đánh dấu dirty để đồng bộ cloud ở lần chạy tới
          markNovelDirty(targetId, causalUpdatedAt);
          notifyLibraryChanged(targetId);

          if (existing || isOverwriteTitleConflict) {
            report.updatedNovels++;
          } else {
            report.addedNovels++;
          }
        }
      } catch (err) {
        report.errors.push(`Lỗi khi khôi phục truyện "${item.title}": ${err.message}`);
      }

      await new Promise(r => setTimeout(r, 0));
    }
  }

  // 2. Khôi phục Tiến độ đọc (Progress)
  if (selectedParts.progress && Array.isArray(backupObj.parts?.progress)) {
    for (const progEntry of backupObj.parts.progress) {
      try {
        const { novelId, progress, scrollPositions } = progEntry;
        if (!novelId || !progress) continue;

        // Nếu truyện này đã được ánh xạ sang targetId khác (do create_new hoặc overwrite title conflict)
        const actualNovelId = novelIdMap.get(novelId) || novelId;

        // Nếu truyện bị bỏ qua do trùng tên khác ID thì không khôi phục tiến độ của file
        if (skippedDueToConflict.has(novelId)) {
          continue;
        }

        const currentProg = getReadingProgress(actualNovelId);
        const currentUpdated = currentProg?.updatedAt || 0;
        const fileUpdated = progress?.updatedAt || 0;

        // Chế độ gộp: bản mới hơn thắng
        if (mode === 'merge' && currentUpdated > fileUpdated) {
          continue;
        }

        const mappedProgress = { ...progress };
        if (mappedProgress.chapterId) {
          mappedProgress.chapterId = mapChapterIdForNovel(novelId, mappedProgress.chapterId, createNewChapterPrefix);
        }

        saveReadingProgress(actualNovelId, mappedProgress);
        report.progressRestored++;

        if (Array.isArray(scrollPositions) && typeof localStorage !== 'undefined') {
          for (const sp of scrollPositions) {
            if (sp.chapterId && sp.data) {
              const mappedChapterId = mapChapterIdForNovel(novelId, sp.chapterId, createNewChapterPrefix);
              const spKey = `scroll_pos_${actualNovelId}_${mappedChapterId}`;
              if (isAllowlistedStorageKey(spKey)) {
                localStorage.setItem(spKey, JSON.stringify(sp.data));
              } else {
                report.skippedInvalidKeys++;
              }
            }
          }
        }
      } catch (e) {
        report.errors.push(`Lỗi khôi phục tiến độ truyện ${progEntry.novelId}: ${e.message}`);
      }
    }
  }

  // 3. Khôi phục Tu vi (Cultivation)
  if (selectedParts.cultivation && confirmCultivation && backupObj.parts.cultivation?.state) {
    if (currentProfile === 'sandbox') {
      report.errors.push('Bị từ chối: không thể khôi phục tu vi vào hồ sơ Sandbox.');
    } else {
      try {
        const localState = getCultivationState();
        const fileState = backupObj.parts.cultivation.state;
        const localRev = typeof localState._rev === 'number' ? localState._rev : 0;
        const fileRev = typeof fileState._rev === 'number' ? fileState._rev : 0;
        // _rev tăng cao hơn cả bản hiện tại và bản trong file kèm causal stamp
        const newRev = Math.max(localRev, fileRev) + 1;

        const restoredState = {
          ...fileState,
          _rev: newRev,
          _updatedAt: Date.now(),
        };

        saveCultivationState(restoredState);

        const filePending = backupObj.parts.cultivation.pendingSeconds;
        if (typeof filePending === 'number' && typeof localStorage !== 'undefined') {
          localStorage.setItem('cultivation_pending_seconds', String(filePending));
        }

        report.cultivationRestored = true;
      } catch (e) {
        report.errors.push(`Lỗi khôi phục tu vi: ${e.message}`);
      }
    }
  }

  // 4. Khôi phục Cài đặt đọc (Settings)
  if (selectedParts.settings && backupObj.parts.settings) {
    try {
      saveReadingSettings(backupObj.parts.settings);
      report.settingsRestored = true;
    } catch (e) {
      report.errors.push(`Lỗi khôi phục cài đặt đọc: ${e.message}`);
    }
  }

  // 5. Khôi phục Mật Thất (Vault)
  if (selectedParts.vault && backupObj.parts.vault) {
    try {
      setVaultPasswordRaw(backupObj.parts.vault);
      report.vaultRestored = true;
    } catch (e) {
      report.errors.push(`Lỗi khôi phục mật khẩu Mật Thất: ${e.message}`);
    }
  }

  // Phát sự kiện giao diện làm mới
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('tcl_library_updated'));
      window.dispatchEvent(new CustomEvent('cultivation_updated'));
    } catch (e) {}
  }

  return report;
}
