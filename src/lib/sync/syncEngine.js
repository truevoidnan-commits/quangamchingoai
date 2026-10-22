import JSZip from 'jszip';
import {
  getSyncLedger,
  saveSyncLedger,
  getDeviceId,
  getDirtyNovels,
  clearNovelDirty,
  getTombstones,
  removeTombstone,
  setSyncBypassDirty,
} from './syncLedger.js';
import {
  getNovel,
  getChapters,
  saveNovel,
  saveChaptersBulk,
  deleteNovelDB,
} from '../db.js';
import {
  getLibrary,
  addToLibrary,
  updateLibraryItem,
  removeFromLibrary,
  getReadingProgress,
  saveReadingProgress,
  getReadingSettings,
  saveReadingSettings,
  getVaultPasswordInfo,
  setVaultPasswordRaw,
} from '../storage.js';
import {
  getActiveProfile,
  getCultivationKey,
  getCultivationState,
} from '../cultivation.js';
import { makeCoverThumb } from '../coverImage.js';

const MAX_FILE_SIZE = 45 * 1024 * 1024; // 45MB
const BUCKET_NAME = 'novels';

/**
 * Lấy số lượng chương đã đọc chính xác (hỗ trợ cả chaptersReadCount và dict readChapterIds)
 */
export function getReadChaptersCount(cultivationState) {
  if (!cultivationState) return 0;
  const countFromField = typeof cultivationState.chaptersReadCount === 'number' ? cultivationState.chaptersReadCount : 0;
  let countFromDict = 0;
  if (cultivationState.readChapterIds && typeof cultivationState.readChapterIds === 'object') {
    if (Array.isArray(cultivationState.readChapterIds)) {
      countFromDict = cultivationState.readChapterIds.length;
    } else {
      countFromDict = Object.keys(cultivationState.readChapterIds).length;
    }
  }
  return Math.max(countFromField, countFromDict);
}

/**
 * Nén danh sách chương thành blob
 */
export async function compressChapters(chaptersJsonString) {
  if (typeof CompressionStream !== 'undefined') {
    const stream = new Blob([chaptersJsonString]).stream().pipeThrough(new CompressionStream('gzip'));
    const compressedBlob = await new Response(stream).blob();
    return {
      blob: compressedBlob,
      ext: '.json.gz',
      contentType: 'application/gzip',
    };
  } else {
    const zip = new JSZip();
    zip.file('chapters.json', chaptersJsonString);
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    return {
      blob: zipBlob,
      ext: '.zip',
      contentType: 'application/zip',
    };
  }
}

/**
 * Giải nén danh sách chương từ blob
 */
export async function decompressChapters(blob, path = '') {
  if (path.endsWith('.json.gz') || path.endsWith('.gz') || (!path.endsWith('.zip') && typeof CompressionStream !== 'undefined')) {
    if (typeof DecompressionStream !== 'undefined') {
      const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
      const text = await new Response(stream).text();
      return JSON.parse(text);
    } else if (typeof process !== 'undefined' && process.versions?.node) {
      const zlib = await import(/* @vite-ignore */ 'zlib');
      const arrayBuffer = await blob.arrayBuffer();
      const decompressed = zlib.gunzipSync(Buffer.from(arrayBuffer));
      return JSON.parse(decompressed.toString('utf8'));
    }
  }

  // Fallback to JSZip
  const zip = await JSZip.loadAsync(blob);
  const chapterFile = zip.file('chapters.json') || Object.values(zip.files)[0];
  if (!chapterFile) throw new Error('Không tìm thấy dữ liệu chương trong file nén');
  const text = await chapterFile.async('text');
  return JSON.parse(text);
}

/**
 * Sao lưu Tu Vi cục bộ trước khi ghi đè (giữ tối đa 3 bản)
 */
export function backupCultivationState(state) {
  try {
    const ts = Date.now();
    const backupKey = `tcl_cultivation_backup_${ts}`;
    localStorage.setItem(backupKey, JSON.stringify(state));

    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('tcl_cultivation_backup_')) {
        keys.push(k);
      }
    }
    keys.sort();
    while (keys.length > 3) {
      const oldest = keys.shift();
      localStorage.removeItem(oldest);
    }
  } catch (e) {
    console.warn('Lỗi khi sao lưu tu vi:', e);
  }
}

/**
 * Kiểm tra điều kiện lần đầu đồng bộ khi cả hai bên đều có dữ liệu
 */
export function checkFirstSyncCondition({ cloudNovels = [], cloudCultivation = null, localLibrary = [], localCultivation = null, ledger = {} }) {
  const isFirstSync = !ledger?.lastSyncedAt && Object.keys(ledger?.novels || {}).length === 0 && (!ledger?.cultivation?.lastSyncedRev);

  const localHasNovels = localLibrary.length > 0;
  const localHasCultivation = (localCultivation?.totalExp || 0) > 0 || (localCultivation?._rev || 0) > 0;
  const localHasData = localHasNovels || localHasCultivation;

  const cloudActiveNovels = cloudNovels.filter(n => !n.deleted_at);
  const cloudHasNovels = cloudActiveNovels.length > 0;
  const cloudHasCultivation = (cloudCultivation?.rev || 0) > 0 || (cloudCultivation?.state?.totalExp || 0) > 0;
  const cloudHasData = cloudHasNovels || cloudHasCultivation;

  const bothHaveData = isFirstSync && localHasData && cloudHasData;

  const localExp = localCultivation?.totalExp || 0;
  const cloudExp = cloudCultivation?.state?.totalExp || 0;
  const localReadCount = getReadChaptersCount(localCultivation);
  const cloudReadCount = getReadChaptersCount(cloudCultivation?.state);
  const isLocalAhead = localExp > cloudExp || localReadCount > cloudReadCount;

  // Tìm các cặp truyện nghi trùng (cùng tiêu đề nhưng khác ID)
  const duplicatePairs = [];
  const localTitlesMap = new Map();
  for (const item of localLibrary) {
    const normTitle = (item.title || '').trim().toLowerCase();
    if (normTitle) localTitlesMap.set(normTitle, item);
  }

  for (const cn of cloudActiveNovels) {
    const normTitle = (cn.title || '').trim().toLowerCase();
    const localMatch = localTitlesMap.get(normTitle);
    if (localMatch && localMatch.id !== cn.id) {
      duplicatePairs.push({
        title: cn.title,
        localId: localMatch.id,
        cloudId: cn.id,
      });
    }
  }

  return {
    isFirstSync,
    bothHaveData,
    isLocalAhead,
    duplicatePairs,
    localSummary: {
      novelCount: localLibrary.length,
      realm: localCultivation?.realm || 'ngung_khi',
      totalExp: localExp,
      readChapterCount: localReadCount,
      updatedAt: localCultivation?._updatedAt || 0,
    },
    cloudSummary: {
      novelCount: cloudActiveNovels.length,
      realm: cloudCultivation?.state?.realm || 'ngung_khi',
      totalExp: cloudExp,
      readChapterCount: cloudReadCount,
      updatedAt: cloudCultivation?.updated_at || 0,
    },
  };
}

/**
 * Đồng bộ Mật khẩu Mật Thất (user_settings.data.vault)
 */
export async function syncVaultPassword(supabase, userId, options = {}) {
  const { data: userSettings, error: fetchErr } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  const localVault = getVaultPasswordInfo();
  const cloudVault = userSettings?.data?.vault || null;

  if (options.mode === 'cloud_master') {
    if (cloudVault && cloudVault.hash) {
      setVaultPasswordRaw(cloudVault);
    }
    return;
  }

  if (options.mode === 'local_master') {
    if (localVault.hash) {
      const updatedData = { ...(userSettings?.data || {}), vault: localVault };
      const { error: upsertErr } = await supabase.from('user_settings').upsert({
        user_id: userId,
        data: updatedData,
        updated_at: Date.now(),
      }, { onConflict: 'user_id' });
      if (upsertErr) throw new Error(`Lỗi lưu mật khẩu Mật Thất: ${upsertErr.message}`);
    }
    return;
  }

  // Quy tắc chuẩn:
  // 1. Bên có updatedAt lớn hơn thắng
  // 2. Nếu một bên chưa có mật khẩu thì nhận của bên kia
  // 3. TUYỆT ĐỐI không ghi đè mật khẩu cục bộ bằng giá trị rỗng
  if (!cloudVault?.hash && localVault.hash) {
    // Đẩy lên cloud
    const updatedData = { ...(userSettings?.data || {}), vault: localVault };
    const { error: upsertErr } = await supabase.from('user_settings').upsert({
      user_id: userId,
      data: updatedData,
      updated_at: Date.now(),
    }, { onConflict: 'user_id' });
    if (upsertErr) throw new Error(`Lỗi lưu mật khẩu Mật Thất: ${upsertErr.message}`);
  } else if (cloudVault?.hash && !localVault.hash) {
    // Kéo từ cloud về
    setVaultPasswordRaw(cloudVault);
  } else if (cloudVault?.hash && localVault.hash) {
    if ((cloudVault.updatedAt || 0) > (localVault.updatedAt || 0)) {
      setVaultPasswordRaw(cloudVault);
    } else if ((localVault.updatedAt || 0) > (cloudVault.updatedAt || 0)) {
      const updatedData = { ...(userSettings?.data || {}), vault: localVault };
      const { error: upsertErr } = await supabase.from('user_settings').upsert({
        user_id: userId,
        data: updatedData,
        updated_at: Date.now(),
      }, { onConflict: 'user_id' });
      if (upsertErr) throw new Error(`Lỗi lưu mật khẩu Mật Thất: ${upsertErr.message}`);
    }
  }
}

/**
 * Đồng bộ Cài đặt đọc (user_settings.data.reading_settings)
 */
export async function syncReadingSettings(supabase, userId, options = {}) {
  const { data: userSettings, error: fetchErr } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  const localSettings = getReadingSettings();
  const cloudSettings = userSettings?.data?.reading_settings || null;
  const cloudUpdatedAt = cloudSettings?.updatedAt || userSettings?.updated_at || 0;
  const localUpdatedAt = localSettings?.updatedAt || 0;

  if (options.mode === 'cloud_master') {
    if (cloudSettings) saveReadingSettings(cloudSettings);
    return;
  }

  if (options.mode === 'local_master') {
    const updatedData = { ...(userSettings?.data || {}), reading_settings: localSettings };
    const { error: upsertErr } = await supabase.from('user_settings').upsert({
      user_id: userId,
      data: updatedData,
      updated_at: Date.now(),
    }, { onConflict: 'user_id' });
    if (upsertErr) throw new Error(`Lỗi lưu cài đặt đọc: ${upsertErr.message}`);
    return;
  }

  if (cloudSettings && cloudUpdatedAt > localUpdatedAt) {
    saveReadingSettings(cloudSettings);
  } else if (localUpdatedAt > cloudUpdatedAt || (!cloudSettings && localSettings)) {
    const updatedData = { ...(userSettings?.data || {}), reading_settings: localSettings };
    const { error: upsertErr } = await supabase.from('user_settings').upsert({
      user_id: userId,
      data: updatedData,
      updated_at: Date.now(),
    }, { onConflict: 'user_id' });
    if (upsertErr) throw new Error(`Lỗi lưu cài đặt đọc: ${upsertErr.message}`);
  }
}

/**
 * Đồng bộ Tiến độ đọc (progress table)
 */
export async function syncReadingProgress(supabase, userId, activeNovelIds = [], options = {}) {
  const { data: cloudProgressList, error: fetchErr } = await supabase
    .from('progress')
    .select('*')
    .eq('user_id', userId);

  if (fetchErr) throw new Error(`Lỗi tải tiến độ đọc: ${fetchErr.message}`);

  const cloudMap = new Map((cloudProgressList || []).map(p => [p.novel_id, p]));

  for (const novelId of activeNovelIds) {
    const localProg = getReadingProgress(novelId);
    const cloudItem = cloudMap.get(novelId);
    const localUpdatedAt = localProg?.updatedAt || 0;
    const cloudUpdatedAt = cloudItem?.updated_at || 0;

    if (options.mode === 'cloud_master') {
      if (cloudItem?.data) {
        saveReadingProgress(novelId, cloudItem.data);
      }
      continue;
    }

    if (options.mode === 'local_master') {
      if (localProg && localProg.chapterId) {
        const { error: upsertErr } = await supabase.from('progress').upsert({
          user_id: userId,
          novel_id: novelId,
          data: localProg,
          updated_at: localUpdatedAt || Date.now(),
        }, { onConflict: 'user_id,novel_id' });
        if (upsertErr) throw new Error(`Lỗi lưu tiến độ truyện "${novelId}": ${upsertErr.message}`);
      }
      continue;
    }

    if (cloudItem && cloudUpdatedAt > localUpdatedAt) {
      saveReadingProgress(novelId, cloudItem.data);
    } else if (localProg?.chapterId && localUpdatedAt > cloudUpdatedAt) {
      const { error: upsertErr } = await supabase.from('progress').upsert({
        user_id: userId,
        novel_id: novelId,
        data: localProg,
        updated_at: localUpdatedAt,
      }, { onConflict: 'user_id,novel_id' });
      if (upsertErr) throw new Error(`Lỗi lưu tiến độ truyện "${novelId}": ${upsertErr.message}`);
    }
  }
}

/**
 * Đồng bộ Tu Vi (cultivation table) - CHỈ HỒ SƠ THẬT (REAL)
 */
export async function syncCultivation(supabase, userId, { onConflictCultivation, mode = 'normal', ledger: passedLedger = null } = {}) {
  // KHẲNG ĐỊNH: Chỉ đồng bộ hồ sơ Thật!
  const currentProfile = getActiveProfile();
  if (currentProfile !== 'real') {
    return { skipped: true, reason: 'Sandbox profile never synced' };
  }

  const { data: cloudCultivation, error: fetchErr } = await supabase
    .from('cultivation')
    .select('*')
    .eq('user_id', userId)
    .single();

  const ledger = passedLedger || getSyncLedger();
  const localState = getCultivationState();
  let localRev = typeof localState?._rev === 'number' && !isNaN(localState._rev) ? localState._rev : 0;
  if (localRev === 0 && localState && (localState.totalExp || 0) > 0) {
    localRev = 1;
    localState._rev = 1;
    localState._updatedAt = localState._updatedAt || Date.now();
    try {
      localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(localState));
    } catch {}
  }
  const lastSyncedRev = ledger.cultivation?.lastSyncedRev || 0;
  const cloudRev = cloudCultivation?.rev || 0;

  const getLocalPendingSeconds = () => {
    try {
      return parseInt(localStorage.getItem(getCultivationKey('pending_seconds', 'real')) || '0', 10) || 0;
    } catch {
      return 0;
    }
  };

  const setLocalPendingSeconds = (sec) => {
    try {
      localStorage.setItem(getCultivationKey('pending_seconds', 'real'), String(sec || 0));
    } catch {}
  };

  const applyCloudCultivation = (cloudItem) => {
    backupCultivationState(localState);
    const cloudState = { ...(cloudItem.state || {}) };
    const pendingSeconds = cloudState.__meta?.pendingSeconds ?? 0;
    delete cloudState.__meta;

    setLocalPendingSeconds(pendingSeconds);
    localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(cloudState));

    ledger.cultivation = {
      lastSyncedRev: cloudItem.rev || 0,
      lastCloudUpdatedAt: cloudItem.updated_at || Date.now(),
    };
    saveSyncLedger(ledger);
  };

  const pushLocalCultivation = async () => {
    const pendingSeconds = getLocalPendingSeconds();
    const payloadState = { ...localState, __meta: { pendingSeconds } };
    const now = Date.now();

    const { error: upsertErr } = await supabase.from('cultivation').upsert({
      user_id: userId,
      state: payloadState,
      rev: localRev,
      updated_at: now,
      device_id: getDeviceId(),
    }, { onConflict: 'user_id' });

    if (upsertErr) {
      throw new Error(`Lỗi lưu tu vi lên cloud: ${upsertErr.message}`);
    }

    ledger.cultivation = {
      lastSyncedRev: localRev,
      lastCloudUpdatedAt: now,
    };
    saveSyncLedger(ledger);
  };

  if (mode === 'cloud_master') {
    if (cloudCultivation && cloudCultivation.state) {
      applyCloudCultivation(cloudCultivation);
      return { updatedFromCloud: true };
    }
    return { noop: true };
  }

  if (mode === 'local_master') {
    await pushLocalCultivation();
    return { pushedToCloud: true };
  }

  // Máy hoàn toàn trống mà cloud có -> lấy cloud
  const isLocalEmpty = !localState || (localRev === 0 && (localState.totalExp || 0) === 0);
  if (isLocalEmpty && cloudCultivation && (cloudRev > 0 || (cloudCultivation.state?.totalExp || 0) > 0)) {
    applyCloudCultivation(cloudCultivation);
    return { updatedFromCloud: true };
  }

  // Cloud chưa có gì mà máy có -> đẩy lên cloud
  if (!cloudCultivation && !isLocalEmpty) {
    await pushLocalCultivation();
    return { pushedToCloud: true };
  }

  if (!cloudCultivation) {
    return { noop: true };
  }

  const isCloudChanged = cloudRev > lastSyncedRev;
  const isLocalChanged = localRev > lastSyncedRev;

  if (isCloudChanged && isLocalChanged) {
    // CẢ HAI CÙNG ĐỔI -> Hộp thoại chọn bản (mặc định 'skip' nếu không có handler)
    let choice = 'skip';
    if (typeof onConflictCultivation === 'function') {
      choice = await onConflictCultivation({
        local: {
          realm: localState.realm,
          totalExp: localState.totalExp,
          readChapterCount: getReadChaptersCount(localState),
          updatedAt: localState._updatedAt || 0,
          rev: localRev,
        },
        cloud: {
          realm: cloudCultivation.state?.realm,
          totalExp: cloudCultivation.state?.totalExp,
          readChapterCount: getReadChaptersCount(cloudCultivation.state),
          updatedAt: cloudCultivation.updated_at,
          rev: cloudRev,
        },
      });
    }

    if (choice === 'cloud') {
      applyCloudCultivation(cloudCultivation);
      return { updatedFromCloud: true, conflictResolved: true };
    } else if (choice === 'local') {
      await pushLocalCultivation();
      return { pushedToCloud: true, conflictResolved: true };
    } else {
      // Mặc định 'skip', không tự ý ghi đè
      return { skipped: true, conflict: true };
    }
  }

  if (isCloudChanged && !isLocalChanged) {
    applyCloudCultivation(cloudCultivation);
    return { updatedFromCloud: true };
  }

  if (!isCloudChanged && isLocalChanged) {
    await pushLocalCultivation();
    return { pushedToCloud: true };
  }

  return { noop: true };
}

/**
 * Hàm điều phối đồng bộ chính (Manual Sync)
 */
export async function performSync(supabase, {
  onProgress = () => {},
  onConflictNovel = null,
  onConflictCultivation = null,
  firstSyncChoice = null, // 'cloud_master' | 'local_master' | 'cancel'
} = {}) {
  const { data: { session }, error: authErr } = await supabase.auth.getSession();
  if (authErr || !session?.user) {
    throw new Error('Chưa đăng nhập Supabase. Vui lòng đăng nhập trước khi đồng bộ.');
  }

  const userId = session.user.id;
  const ledger = getSyncLedger();
  const dirty = getDirtyNovels();
  const tombstones = getTombstones();
  const localLibrary = getLibrary({ includeHidden: true });
  const localCultivation = getCultivationState();

  onProgress({ stage: 'fetch_cloud', message: 'Đang kết nối Cloud và tải thông tin đồng bộ...' });

  // 1. Tải metadata truyện & tu vi từ cloud
  const { data: cloudNovels, error: novelsErr } = await supabase
    .from('novels')
    .select('*')
    .eq('user_id', userId);

  if (novelsErr) throw new Error(`Lỗi tải dữ liệu cloud: ${novelsErr.message}`);

  const { data: cloudCultivation } = await supabase
    .from('cultivation')
    .select('*')
    .eq('user_id', userId)
    .single();

  // 2. Kiểm tra nếu là LẦN ĐẦU ĐỒNG BỘ và CẢ HAI BÊN ĐỀU CÓ DỮ LIỆU
  const firstSyncCheck = checkFirstSyncCondition({
    cloudNovels: cloudNovels || [],
    cloudCultivation,
    localLibrary,
    localCultivation,
    ledger,
  });

  if (firstSyncCheck.bothHaveData && !firstSyncChoice) {
    return {
      requireFirstSyncChoice: true,
      firstSyncData: firstSyncCheck,
    };
  }

  if (firstSyncChoice === 'cancel') {
    return { cancelled: true, message: 'Đã hủy đồng bộ theo lựa chọn của người dùng.' };
  }

  const mode = firstSyncChoice || 'normal';

  // 3. Xử lý Bia Mộ (Tombstones)
  onProgress({ stage: 'tombstones', message: 'Đang đồng bộ trạng thái xóa truyện...' });
  const cloudNovelsMap = new Map((cloudNovels || []).map(n => [n.id, n]));
  const errors = [];

  // Đẩy bia mộ cục bộ lên cloud
  for (const [tombNovelId, deletedAtMs] of Object.entries(tombstones)) {
    const cloudRow = cloudNovelsMap.get(tombNovelId);
    let tombSuccess = true;
    if (cloudRow) {
      if (!cloudRow.deleted_at || cloudRow.deleted_at < deletedAtMs) {
        const { error: tombUpdateErr } = await supabase
          .from('novels')
          .update({ deleted_at: deletedAtMs })
          .eq('user_id', userId)
          .eq('id', tombNovelId);

        if (tombUpdateErr) {
          errors.push(`Lỗi cập nhật bia mộ cho truyện "${tombNovelId}": ${tombUpdateErr.message}`);
          tombSuccess = false;
        }
      }

      // Xóa file nén trong bucket
      if (tombSuccess) {
        try {
          const { error: removeErr } = await supabase.storage.from(BUCKET_NAME).remove([
            `${userId}/${tombNovelId}.json.gz`,
            `${userId}/${tombNovelId}.zip`,
          ]);
          if (removeErr) {
            errors.push(`Lỗi xóa file storage của truyện "${tombNovelId}": ${removeErr.message}`);
            tombSuccess = false;
          }
        } catch (e) {
          errors.push(`Lỗi xóa file storage của truyện "${tombNovelId}": ${e.message}`);
          tombSuccess = false;
        }
      }
    }

    if (tombSuccess) {
      removeTombstone(tombNovelId);
    }
  }

  // Nhận bia mộ từ cloud xuống cục bộ
  setSyncBypassDirty(true);
  try {
    for (const cn of cloudNovels || []) {
      if (cn.deleted_at) {
        const localItem = localLibrary.find(l => l.id === cn.id);
        if (localItem && cn.deleted_at > (localItem.updatedAt || 0)) {
          await deleteNovelDB(cn.id, { skipDirty: true });
          removeFromLibrary(cn.id);
        }
      }
    }
  } finally {
    setSyncBypassDirty(false);
  }

  // 4. Đồng bộ từng truyện tuần tự (Tiết kiệm RAM)
  const localMap = new Map(getLibrary({ includeHidden: true }).map(l => [l.id, l]));
  const activeCloudNovels = (cloudNovels || []).filter(n => !n.deleted_at);
  const activeCloudMap = new Map(activeCloudNovels.map(n => [n.id, n]));

  const allNovelIds = Array.from(new Set([...localMap.keys(), ...activeCloudMap.keys()]));
  const totalCount = allNovelIds.length;

  let pushedNovels = 0;
  let pulledNovels = 0;
  let conflicts = 0;

  for (let i = 0; i < totalCount; i++) {
    const novelId = allNovelIds[i];
    // Nếu truyện đã có bia mộ hoặc đã xóa trên cloud thì bỏ qua
    if (cloudNovelsMap.get(novelId)?.deleted_at || tombstones[novelId]) {
      continue;
    }

    const localItem = localMap.get(novelId);
    const cloudRow = activeCloudMap.get(novelId);
    const novelTitle = localItem?.title || cloudRow?.title || novelId;
    const progressPct = Math.round(((i + 1) / totalCount) * 100);

    onProgress({
      stage: 'syncing_novels',
      current: i + 1,
      total: totalCount,
      percent: progressPct,
      novelTitle,
      message: `Đang xử lý truyện [${i + 1}/${totalCount}]: "${novelTitle}" (${progressPct}%)`,
    });

    try {
      // TRƯỜNG HỢP 1: Chỉ có ở Cloud -> Kéo về máy
      if (cloudRow && !localItem) {
        onProgress({ stage: 'pulling_novel', novelTitle, message: `Đang tải nội dung "${novelTitle}" từ cloud...` });
        const { data: blob, error: downloadErr } = await supabase.storage
          .from(BUCKET_NAME)
          .download(cloudRow.content_path);

        if (downloadErr) throw new Error(`Lỗi tải nội dung truyện: ${downloadErr.message}`);

        const chapters = await decompressChapters(blob, cloudRow.content_path);
        const coverThumb = await makeCoverThumb(cloudRow.cover);

        setSyncBypassDirty(true);
        try {
          await saveNovel({
            id: cloudRow.id,
            title: cloudRow.title,
            description: cloudRow.description,
            coverUrl: cloudRow.cover,
            isHidden: cloudRow.is_hidden,
            chapterCount: cloudRow.chapter_count,
            totalChapters: cloudRow.chapter_count,
            updatedAt: cloudRow.updated_at,
          }, { skipDirty: true });

          await saveChaptersBulk(chapters, { skipDirty: true });

          addToLibrary({
            id: cloudRow.id,
            title: cloudRow.title,
            description: cloudRow.description,
            coverThumb,
            isHidden: cloudRow.is_hidden,
            chapterCount: cloudRow.chapter_count,
            totalChapters: cloudRow.chapter_count,
            updatedAt: cloudRow.updated_at,
          });
        } finally {
          setSyncBypassDirty(false);
        }

        ledger.novels[novelId] = {
          lastPulledContentAt: cloudRow.content_updated_at || Date.now(),
          lastPushedContentAt: 0,
          lastSyncedMetaAt: cloudRow.updated_at,
        };
        clearNovelDirty(novelId);
        pulledNovels++;
        continue;
      }

      // TRƯỜNG HỢP 2: Chỉ có ở Local -> Đẩy lên Cloud
      if (localItem && !cloudRow) {
        onProgress({ stage: 'pushing_novel', novelTitle, message: `Đang tải lên "${novelTitle}" lên cloud...` });
        const novel = await getNovel(novelId);
        const chapters = await getChapters(novelId);
        const { blob, ext, contentType } = await compressChapters(JSON.stringify(chapters));

        if (blob.size > MAX_FILE_SIZE) {
          const mbSize = (blob.size / (1024 * 1024)).toFixed(1);
          errors.push(`Truyện "${novelTitle}" có dung lượng nén (${mbSize}MB) vượt quá 45MB. Bỏ qua truyện này.`);
          continue;
        }

        const contentPath = `${userId}/${novelId}${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(contentPath, blob, { upsert: true, contentType });

        if (uploadErr) {
          throw new Error(`Lỗi upload nội dung truyện: ${uploadErr.message}`);
        }

        const now = Date.now();
        const { error: upsertErr } = await supabase.from('novels').upsert({
          user_id: userId,
          id: novelId,
          title: localItem.title || '',
          description: localItem.description || '',
          cover: novel?.coverUrl || '',
          is_hidden: Boolean(localItem.isHidden),
          chapter_count: chapters.length,
          content_path: contentPath,
          content_updated_at: now,
          updated_at: localItem.updatedAt || now,
          deleted_at: null,
        }, { onConflict: 'user_id,id' });

        if (upsertErr) {
          throw new Error(`Lỗi lưu thông tin truyện lên cloud: ${upsertErr.message}`);
        }

        ledger.novels[novelId] = {
          lastPulledContentAt: 0,
          lastPushedContentAt: now,
          lastSyncedMetaAt: localItem.updatedAt || now,
        };
        clearNovelDirty(novelId);
        pushedNovels++;
        continue;
      }

      // TRƯỜNG HỢP 3: Cả hai bên đều có truyện này
      if (localItem && cloudRow) {
        // A. Xử lý Metadata
        const localMetaUpdatedAt = localItem.updatedAt || 0;
        const cloudMetaUpdatedAt = cloudRow.updated_at || 0;

        if (mode === 'cloud_master' || (mode !== 'local_master' && cloudMetaUpdatedAt > localMetaUpdatedAt)) {
          // Cloud metadata thắng
          const coverThumb = await makeCoverThumb(cloudRow.cover);
          setSyncBypassDirty(true);
          try {
            updateLibraryItem(novelId, {
              title: cloudRow.title,
              description: cloudRow.description,
              coverThumb,
              isHidden: cloudRow.is_hidden,
              chapterCount: cloudRow.chapter_count,
              totalChapters: cloudRow.chapter_count,
              updatedAt: cloudRow.updated_at,
            });
            const n = await getNovel(novelId);
            if (n) {
              n.title = cloudRow.title;
              n.description = cloudRow.description;
              n.coverUrl = cloudRow.cover;
              n.isHidden = cloudRow.is_hidden;
              await saveNovel(n, { skipDirty: true });
            }
          } finally {
            setSyncBypassDirty(false);
          }
          if (!ledger.novels[novelId]) ledger.novels[novelId] = {};
          ledger.novels[novelId].lastSyncedMetaAt = cloudRow.updated_at;
        } else if (mode === 'local_master' || localMetaUpdatedAt > cloudMetaUpdatedAt) {
          // Local metadata thắng
          const n = await getNovel(novelId);
          const { error: metaUpdateErr } = await supabase.from('novels').update({
            title: localItem.title,
            description: localItem.description,
            cover: n?.coverUrl || '',
            is_hidden: Boolean(localItem.isHidden),
            chapter_count: localItem.chapterCount,
            updated_at: localMetaUpdatedAt,
          }).eq('user_id', userId).eq('id', novelId);

          if (metaUpdateErr) {
            throw new Error(`Lỗi cập nhật metadata truyện lên cloud: ${metaUpdateErr.message}`);
          }
          if (!ledger.novels[novelId]) ledger.novels[novelId] = {};
          ledger.novels[novelId].lastSyncedMetaAt = localMetaUpdatedAt;
        }

        // B. Xử lý Nội dung chương (Content)
        if (mode === 'cloud_master') {
          // Kéo nội dung từ cloud về
          onProgress({ stage: 'pulling_novel', novelTitle, message: `Đang cập nhật nội dung "${novelTitle}" từ cloud...` });
          const { data: blob, error: downloadErr } = await supabase.storage
            .from(BUCKET_NAME)
            .download(cloudRow.content_path);
          if (downloadErr) throw downloadErr;

          const chapters = await decompressChapters(blob, cloudRow.content_path);
          setSyncBypassDirty(true);
          try {
            await saveChaptersBulk(chapters, { skipDirty: true });
          } finally {
            setSyncBypassDirty(false);
          }
          ledger.novels[novelId] = {
            ...(ledger.novels[novelId] || {}),
            lastPulledContentAt: cloudRow.content_updated_at || Date.now(),
          };
          clearNovelDirty(novelId);
          pulledNovels++;
          continue;
        }

        if (mode === 'local_master') {
          // Đẩy nội dung local lên cloud
          onProgress({ stage: 'pushing_novel', novelTitle, message: `Đang ghi đè nội dung "${novelTitle}" lên cloud...` });
          const chapters = await getChapters(novelId);
          const { blob, ext, contentType } = await compressChapters(JSON.stringify(chapters));

          if (blob.size > MAX_FILE_SIZE) {
            errors.push(`Truyện "${novelTitle}" vượt quá 45MB. Bỏ qua.`);
            continue;
          }

          const contentPath = `${userId}/${novelId}${ext}`;
          const { error: uploadErr } = await supabase.storage.from(BUCKET_NAME).upload(contentPath, blob, { upsert: true, contentType });
          if (uploadErr) throw new Error(`Lỗi upload nội dung truyện: ${uploadErr.message}`);

          const now = Date.now();
          const { error: updateErr } = await supabase.from('novels').update({
            content_path: contentPath,
            content_updated_at: now,
            chapter_count: chapters.length,
          }).eq('user_id', userId).eq('id', novelId);

          if (updateErr) throw new Error(`Lỗi cập nhật dòng truyện lên cloud: ${updateErr.message}`);

          ledger.novels[novelId] = {
            ...(ledger.novels[novelId] || {}),
            lastPushedContentAt: now,
          };
          clearNovelDirty(novelId);
          pushedNovels++;
          continue;
        }

        // Chế độ Normal: Kiểm tra thay đổi nội dung 2 bên
        const isLocalContentDirty = Boolean(dirty[novelId]);
        const novelLedger = ledger.novels[novelId] || {};
        const lastSyncPoint = Math.max(novelLedger.lastPulledContentAt || 0, novelLedger.lastPushedContentAt || 0);
        const hasCloudContentChanged = (cloudRow.content_updated_at || 0) > lastSyncPoint;

        if (isLocalContentDirty && hasCloudContentChanged) {
          // CẢ HAI CÙNG THAY ĐỔI NỘI DUNG -> Xung đột
          conflicts++;
          let choice = 'skip';
          if (typeof onConflictNovel === 'function') {
            choice = await onConflictNovel({
              novelId,
              title: novelTitle,
              localUpdatedAt: localItem.updatedAt,
              cloudUpdatedAt: cloudRow.content_updated_at || cloudRow.updated_at,
            });
          }

          if (choice === 'local') {
            // Giữ bản máy này -> Đẩy lên cloud
            const chapters = await getChapters(novelId);
            const { blob, ext, contentType } = await compressChapters(JSON.stringify(chapters));
            const contentPath = `${userId}/${novelId}${ext}`;
            const { error: uploadErr } = await supabase.storage.from(BUCKET_NAME).upload(contentPath, blob, { upsert: true, contentType });
            if (uploadErr) throw new Error(`Lỗi upload giải quyết xung đột: ${uploadErr.message}`);

            const now = Date.now();
            const { error: updateErr } = await supabase.from('novels').update({
              content_path: contentPath,
              content_updated_at: now,
              chapter_count: chapters.length,
            }).eq('user_id', userId).eq('id', novelId);

            if (updateErr) throw new Error(`Lỗi cập nhật giải quyết xung đột: ${updateErr.message}`);

            ledger.novels[novelId] = {
              ...(ledger.novels[novelId] || {}),
              lastPushedContentAt: now,
            };
            clearNovelDirty(novelId);
            pushedNovels++;
          } else if (choice === 'cloud') {
            // Lấy bản cloud -> Tải về máy
            const { data: blob, error: downloadErr } = await supabase.storage
              .from(BUCKET_NAME)
              .download(cloudRow.content_path);
            if (downloadErr) throw downloadErr;

            const chapters = await decompressChapters(blob, cloudRow.content_path);
            setSyncBypassDirty(true);
            try {
              await saveChaptersBulk(chapters, { skipDirty: true });
            } finally {
              setSyncBypassDirty(false);
            }
            ledger.novels[novelId] = {
              ...(ledger.novels[novelId] || {}),
              lastPulledContentAt: cloudRow.content_updated_at || Date.now(),
            };
            clearNovelDirty(novelId);
            pulledNovels++;
          }
          // choice === 'skip' -> Không làm gì
        } else if (isLocalContentDirty && !hasCloudContentChanged) {
          // Chỉ máy đổi -> Đẩy lên cloud
          const chapters = await getChapters(novelId);
          const { blob, ext, contentType } = await compressChapters(JSON.stringify(chapters));
          if (blob.size > MAX_FILE_SIZE) {
            errors.push(`Truyện "${novelTitle}" vượt quá 45MB. Bỏ qua.`);
            continue;
          }
          const contentPath = `${userId}/${novelId}${ext}`;
          const { error: uploadErr } = await supabase.storage.from(BUCKET_NAME).upload(contentPath, blob, { upsert: true, contentType });
          if (uploadErr) throw new Error(`Lỗi upload nội dung truyện: ${uploadErr.message}`);

          const now = Date.now();
          const { error: updateErr } = await supabase.from('novels').update({
            content_path: contentPath,
            content_updated_at: now,
            chapter_count: chapters.length,
          }).eq('user_id', userId).eq('id', novelId);

          if (updateErr) throw new Error(`Lỗi cập nhật dòng truyện lên cloud: ${updateErr.message}`);

          ledger.novels[novelId] = {
            ...(ledger.novels[novelId] || {}),
            lastPushedContentAt: now,
          };
          clearNovelDirty(novelId);
          pushedNovels++;
        } else if (!isLocalContentDirty && hasCloudContentChanged) {
          // Chỉ cloud đổi -> Kéo về máy
          const { data: blob, error: downloadErr } = await supabase.storage
            .from(BUCKET_NAME)
            .download(cloudRow.content_path);
          if (downloadErr) throw downloadErr;

          const chapters = await decompressChapters(blob, cloudRow.content_path);
          setSyncBypassDirty(true);
          try {
            await saveChaptersBulk(chapters, { skipDirty: true });
          } finally {
            setSyncBypassDirty(false);
          }
          ledger.novels[novelId] = {
            ...(ledger.novels[novelId] || {}),
            lastPulledContentAt: cloudRow.content_updated_at || Date.now(),
          };
          clearNovelDirty(novelId);
          pulledNovels++;
        }
      }
    } catch (err) {
      console.warn(`Lỗi khi xử lý truyện "${novelTitle}":`, err);
      errors.push(`Truyện "${novelTitle}": ${err.message || 'Lỗi không xác định'}`);
    }
  }

  // 5. Đồng bộ Tiến độ đọc
  onProgress({ stage: 'syncing_progress', message: 'Đang đồng bộ tiến độ đọc...' });
  try {
    await syncReadingProgress(supabase, userId, allNovelIds, { mode });
  } catch (err) {
    errors.push(`Lỗi đồng bộ tiến độ đọc: ${err.message}`);
  }

  // 6. Đồng bộ Cài đặt đọc
  onProgress({ stage: 'syncing_settings', message: 'Đang đồng bộ cài đặt đọc...' });
  try {
    await syncReadingSettings(supabase, userId, { mode });
  } catch (err) {
    errors.push(`Lỗi đồng bộ cài đặt đọc: ${err.message}`);
  }

  // 7. Đồng bộ Mật khẩu Mật Thất
  onProgress({ stage: 'syncing_vault', message: 'Đang đồng bộ mật khẩu Mật Thất...' });
  try {
    await syncVaultPassword(supabase, userId, { mode });
  } catch (err) {
    errors.push(`Lỗi đồng bộ mật khẩu Mật Thất: ${err.message}`);
  }

  // 8. Đồng bộ Tu Vi (Chỉ hồ sơ Thật)
  onProgress({ stage: 'syncing_cultivation', message: 'Đang đồng bộ tu vi (hồ sơ Thật)...' });
  let cultivationRes = { noop: true };
  try {
    cultivationRes = await syncCultivation(supabase, userId, { onConflictCultivation, mode, ledger });
  } catch (err) {
    errors.push(`Lỗi đồng bộ tu vi: ${err.message}`);
  }

  // Lưu sổ đồng bộ hoàn tất: CHỈ ĐẶT lastSyncedAt KHI errors.length === 0
  const isAllSuccess = errors.length === 0;
  if (isAllSuccess) {
    ledger.lastSyncedAt = Date.now();
  }
  saveSyncLedger(ledger);

  return {
    success: isAllSuccess,
    pushedNovels,
    pulledNovels,
    conflicts,
    errors,
    cultivationUpdatedFromCloud: Boolean(cultivationRes?.updatedFromCloud),
    cultivationPushedToCloud: Boolean(cultivationRes?.pushedToCloud),
    lastSyncedAt: ledger.lastSyncedAt || 0,
  };
}
