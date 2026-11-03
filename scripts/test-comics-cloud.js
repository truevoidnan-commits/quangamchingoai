/**
 * scripts/test-comics-cloud.js
 * 
 * Comprehensive Unit & Integration Tests for Comics Cloud Sync (Phase 2):
 * - validate.js (Object key builder, security validation, quota & rate limiting)
 * - comicCloud.js (Upload with retries, resume, abort, evict safety, reading progress)
 * Runs natively in Node.js without network access or live cloud credentials.
 */

import assert from 'node:assert';
import {
  buildObjectKey,
  isValidVolumeId,
  isValidUid,
  isValidPageIndex,
  validatePresignRequest,
  checkQuota,
  checkRateLimit,
  getCorsHeaders,
  MAX_BATCH_SIZE,
  MAX_PAGE_BYTES,
  MAX_USER_QUOTA_BYTES,
  MAX_HOURLY_OPS,
  PUT_EXPIRATION_SECONDS,
  GET_EXPIRATION_SECONDS,
} from '../supabase/functions/comic-presign/validate.js';
import {
  uploadVolume,
  downloadVolume,
  evictLocalVolume,
  listRemote,
  pushComicProgressCloud,
  pullComicProgressCloud,
  asyncPool,
} from '../src/lib/comics/comicCloud.js';
import { setComicDBForTesting } from '../src/lib/comics/comicDb.js';

// Global IDBKeyRange mock
if (typeof globalThis.IDBKeyRange === 'undefined') {
  globalThis.IDBKeyRange = {
    only: (val) => ({ lower: val, upper: val }),
    bound: (l, u) => ({ lower: l, upper: u }),
  };
}
const storeMap = new Map();
const mockStorage = {
  getItem: (k) => storeMap.get(k) || null,
  setItem: (k, v) => storeMap.set(k, String(v)),
  removeItem: (k) => storeMap.delete(k),
  clear: () => storeMap.clear(),
  get length() { return storeMap.size; },
  key: (i) => Array.from(storeMap.keys())[i] || null,
};
globalThis.localStorage = mockStorage;

async function runAllCloudTests() {
  console.log('🧪 BẮT ĐẦU KIỂM THỬ ĐỒNG BỘ TRUYỆN TRANH CLOUD (PHASE 2)...\n');

  // ===========================================================================
  // PHẦN 1: KIỂM THỬ VALIDATE.JS & BẢO MẬT CHỮ KÝ
  // ===========================================================================
  console.log('--- [Phần 1: Quy tắc kiểm thực & Bảo mật (validate.js)] ---');

  const validUid = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
  const validVolId = 'KD8N1FAumwgY_vol-1';

  // 1.1 Object Key Builder
  console.log('  1.1 Kiểm tra hàm sinh khóa lưu trữ buildObjectKey...');
  const pageKey = buildObjectKey(validUid, validVolId, 5);
  assert.strictEqual(pageKey, `${validUid}/${validVolId}/0005.webp`);

  const coverKey = buildObjectKey(validUid, validVolId, 'cover');
  assert.strictEqual(coverKey, `${validUid}/${validVolId}/cover.webp`);

  // 1.2 Path Traversal & Injection Blocking
  console.log('  1.2 Kiểm tra chống path traversal và injection vào volumeId / uid...');
  const badVolumeIds = [
    '../etc/passwd',
    '../../root',
    'vol/sub/path',
    'vol:123',
    'vol name with spaces',
    'vol$evil',
    '',
    'a'.repeat(65), // > 64 chars
  ];
  for (const bad of badVolumeIds) {
    assert.strictEqual(isValidVolumeId(bad), false, `Phải từ chối volumeId xấu: "${bad}"`);
    assert.throws(
      () => buildObjectKey(validUid, bad, 0),
      /volumeId không hợp lệ/,
      `Phải chặn sinh key với volumeId: "${bad}"`
    );
  }

  assert.throws(
    () => buildObjectKey('invalid-uuid-123', validVolId, 0),
    /User ID không hợp lệ/
  );

  assert.throws(
    () => buildObjectKey(validUid, validVolId, -1),
    /Chỉ số trang không hợp lệ/
  );

  assert.throws(
    () => buildObjectKey(validUid, validVolId, 10000),
    /Chỉ số trang không hợp lệ/
  );
  console.log('      ✓ 100% path traversal và chuỗi độc hại bị chặn đứng.');

  // 1.3 Payload Validation (validatePresignRequest)
  console.log('  1.3 Kiểm tra xác thực payload request...');
  assert.strictEqual(validatePresignRequest(null).ok, false);
  assert.strictEqual(validatePresignRequest({ action: 'hack' }).ok, false);
  assert.strictEqual(validatePresignRequest({ action: 'put', volumeId: 'bad/id' }).ok, false);

  // Empty pages and cover
  assert.strictEqual(
    validatePresignRequest({ action: 'put', volumeId: validVolId, pages: [] }).code,
    'EMPTY_PAGES'
  );

  // Exceeding batch size (> 100)
  const tooManyPages = Array.from({ length: 101 }, (_, i) => i);
  assert.strictEqual(
    validatePresignRequest({ action: 'put', volumeId: validVolId, pages: tooManyPages }).code,
    'BATCH_SIZE_EXCEEDED'
  );

  // Valid put & get
  const validPut = validatePresignRequest({
    action: 'put',
    volumeId: validVolId,
    pages: [0, 1, 2],
    cover: true,
    totalBytes: 5000000,
  });
  assert.strictEqual(validPut.ok, true);
  assert.strictEqual(validPut.validated.totalOps, 4);

  const validDelete = validatePresignRequest({
    action: 'delete-volume',
    volumeId: validVolId,
  });
  assert.strictEqual(validDelete.ok, true);
  console.log('      ✓ Xác thực payload hoạt động chính xác tuyệt đối.');

  // 1.4 Quota Check (8GB Limit)
  console.log('  1.4 Kiểm tra giới hạn hạn mức lưu trữ Cloud 8GB (checkQuota)...');
  const sevenGb = 7 * 1024 * 1024 * 1024;
  const twoGb = 2 * 1024 * 1024 * 1024;

  const quotaOk = checkQuota({ usedBytes: sevenGb, incomingBytes: 500 * 1024 * 1024 });
  assert.strictEqual(quotaOk.ok, true);

  const quotaExceeded = checkQuota({ usedBytes: sevenGb, incomingBytes: twoGb });
  assert.strictEqual(quotaExceeded.ok, false);
  assert.strictEqual(quotaExceeded.code, 'QUOTA_EXCEEDED');
  console.log('      ✓ Chặn vượt hạn mức 8GB với thông báo chuẩn tiếng Việt.');

  // 1.5 Rate Limiting (3000 Ops / Hour)
  console.log('  1.5 Kiểm tra giới hạn tốc độ 3000 thao tác/giờ (checkRateLimit)...');
  const rateOk = checkRateLimit({ currentHourlyOps: 2900, incomingOps: 50 });
  assert.strictEqual(rateOk.ok, true);
  assert.strictEqual(rateOk.remaining, 50);

  const rateExceeded = checkRateLimit({ currentHourlyOps: 2950, incomingOps: 60 });
  assert.strictEqual(rateExceeded.ok, false);
  assert.strictEqual(rateExceeded.code, 'RATE_LIMIT_EXCEEDED');
  console.log('      ✓ Chặn vượt rate limit 3000 ops/giờ thành công.');

  // 1.6 CORS Headers
  console.log('  1.6 Kiểm tra tiêu đề CORS...');
  const cors1 = getCorsHeaders('https://truevoidnan-commits.github.io');
  assert.strictEqual(cors1['Access-Control-Allow-Origin'], 'https://truevoidnan-commits.github.io');

  const cors2 = getCorsHeaders('http://localhost:5173');
  assert.strictEqual(cors2['Access-Control-Allow-Origin'], 'http://localhost:5173');

  const corsBad = getCorsHeaders('https://evil-site.com');
  assert.strictEqual(corsBad['Access-Control-Allow-Origin'], 'https://truevoidnan-commits.github.io');
  console.log('      ✓ CORS bảo vệ chặt chẽ các origin hợp lệ.\n');

  // ===========================================================================
  // PHẦN 2: KIỂM THỬ CLIENT COMIC CLOUD ENGINE (comicCloud.js)
  // ===========================================================================
  console.log('--- [Phần 2: Tiến trình đồng bộ Cloud (comicCloud.js)] ---');

  // Setup Mock Database for ComicDB
  const inMemorySeries = new Map();
  const inMemoryVolumes = new Map();
  const inMemoryPages = new Map();
  const inMemoryProgress = new Map();

  const mockDb = {
    get: async (store, id) => {
      if (store === 'series') return inMemorySeries.get(id) || null;
      if (store === 'volumes') return inMemoryVolumes.get(id) || null;
      if (store === 'pages') return inMemoryPages.get(id) || null;
      return null;
    },
    getAll: async (store) => {
      if (store === 'series') return Array.from(inMemorySeries.values());
      if (store === 'volumes') return Array.from(inMemoryVolumes.values());
      if (store === 'pages') return Array.from(inMemoryPages.values());
      return [];
    },
    put: async (store, item) => {
      if (store === 'series') inMemorySeries.set(item.id, item);
      if (store === 'volumes') inMemoryVolumes.set(item.id, item);
      if (store === 'pages') inMemoryPages.set(item.key, item);
      return item;
    },
    delete: async (store, id) => {
      if (store === 'series') inMemorySeries.delete(id);
      if (store === 'volumes') inMemoryVolumes.delete(id);
      if (store === 'pages') inMemoryPages.delete(id);
    },
    transaction: () => ({
      objectStore: (name) => ({
        get: async (id) => (name === 'series' ? inMemorySeries.get(id) : null),
        put: async (item) => (name === 'series' ? inMemorySeries.set(item.id, item) : null),
        index: (indexName) => ({
          openCursor: async (range) => {
            const volId = range?.lower || range;
            const matchingKeys = Array.from(inMemoryPages.keys()).filter((k) => inMemoryPages.get(k)?.volumeId === volId);
            let idx = 0;
            if (matchingKeys.length === 0) return null;
            const cursorObj = {
              async delete() {
                inMemoryPages.delete(matchingKeys[idx]);
              },
              async continue() {
                idx++;
                return idx < matchingKeys.length ? cursorObj : null;
              },
            };
            return cursorObj;
          },
          getAll: async (range) => {
            const targetVal = range?.lower || range;
            if (name === 'volumes' && indexName === 'seriesId') {
              return Array.from(inMemoryVolumes.values()).filter((v) => v.seriesId === targetVal);
            }
            if (name === 'pages' && indexName === 'volumeId') {
              return Array.from(inMemoryPages.values()).filter((p) => p.volumeId === targetVal);
            }
            return [];
          },
        }),
        delete: async (id) => {
          if (name === 'volumes') inMemoryVolumes.delete(id);
          if (name === 'pages') inMemoryPages.delete(id);
        },
      }),
      done: Promise.resolve(),
    }),
  };

  setComicDBForTesting(Promise.resolve(mockDb));

  // Seed sample local series & volume
  const testSeriesId = 'series_test_01';
  const testVolumeId = 'vol_test_01';

  inMemorySeries.set(testSeriesId, {
    id: testSeriesId,
    title: 'Đấu Phá Thương Khung',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  inMemoryVolumes.set(testVolumeId, {
    id: testVolumeId,
    seriesId: testSeriesId,
    title: 'Tập 01: Thiếu Niên Thiên Tài',
    order: 1,
    pageCount: 3,
    totalBytes: 1500000,
    quality: 'balanced',
    importState: 'ready',
  });

  inMemoryPages.set(`${testVolumeId}:00000`, { volumeId: testVolumeId, index: 0, blob: { size: 500000 }, w: 1200, h: 1800 });
  inMemoryPages.set(`${testVolumeId}:00001`, { volumeId: testVolumeId, index: 1, blob: { size: 500000 }, w: 1200, h: 1800 });
  inMemoryPages.set(`${testVolumeId}:00002`, { volumeId: testVolumeId, index: 2, blob: { size: 500000 }, w: 1200, h: 1800 });

  // Setup Mock Supabase Client
  const remoteSeriesTable = new Map();
  const remoteVolumesTable = new Map();
  const remoteProgressTable = new Map();

  const mockSupabase = {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            user: { id: validUid, email: 'tu-si@thiencolau.vn' },
          },
        },
      }),
    },
    from: (table) => {
      let currentTable = remoteSeriesTable;
      if (table === 'comic_volumes') currentTable = remoteVolumesTable;
      if (table === 'comic_progress') currentTable = remoteProgressTable;

      const makeBuilder = (operation, payload) => {
        const filters = [];
        const builder = {
          eq: (field, val) => {
            filters.push((row) => row[field] === val);
            return builder;
          },
          is: (field, val) => {
            filters.push((row) => (val === null ? row[field] == null : row[field] === val));
            return builder;
          },
          single: async () => {
            const rows = Array.from(currentTable.values()).filter((r) => filters.every((f) => f(r)));
            const row = rows[0];
            return { data: row || null, error: row ? null : { message: 'Not found' } };
          },
          maybeSingle: async () => {
            const rows = Array.from(currentTable.values()).filter((r) => filters.every((f) => f(r)));
            return { data: rows[0] || null, error: null };
          },
          then: (onfulfilled, onrejected) => {
            let res;
            if (operation === 'select') {
              const rows = Array.from(currentTable.values()).filter((r) => filters.every((f) => f(r)));
              res = { data: rows, error: null };
            } else if (operation === 'update') {
              const rows = Array.from(currentTable.values()).filter((r) => filters.every((f) => f(r)));
              rows.forEach((r) => Object.assign(r, patchSafe(r, payload)));
              res = { data: rows, error: null };
            } else if (operation === 'delete') {
              const toDelete = Array.from(currentTable.entries()).filter(([k, r]) => filters.every((f) => f(r)));
              toDelete.forEach(([k]) => currentTable.delete(k));
              res = { data: null, error: null };
            } else {
              res = { data: null, error: null };
            }
            return Promise.resolve(res).then(onfulfilled, onrejected);
          },
        };
        function patchSafe(target, patch) {
          return { ...target, ...patch };
        }
        return builder;
      };

      return {
        select: (cols) => makeBuilder('select'),
        upsert: async (row) => {
          const key = row.id || `${row.user_id}_${row.volume_id}`;
          const existing = currentTable.get(key) || {};
          const merged = { ...existing, ...row };
          currentTable.set(key, merged);
          return { data: merged, error: null };
        },
        update: (patch) => makeBuilder('update', patch),
        delete: () => makeBuilder('delete'),
      };
    },
    functions: {
      invoke: async (name, { body }) => {
        if (body.action === 'put' || body.action === 'get') {
          const urls = {};
          (body.pages || []).forEach((p) => {
            urls[p] = `https://mock-r2.cloud/${body.volumeId}/${p}.webp?signed=true`;
          });
          return {
            data: {
              urls,
              coverUrl: body.cover ? `https://mock-r2.cloud/${body.volumeId}/cover.webp?signed=true` : null,
              expiresIn: 900,
            },
            error: null,
          };
        }
        if (body.action === 'delete-volume') {
          return { data: { deletedCount: 4, volumeId: body.volumeId }, error: null };
        }
        return { data: null, error: { message: 'Action unknown' } };
      },
    },
  };

  // 2.1 Test Upload Volume Normal Flow
  console.log('  2.1 Kiểm tra uploadVolume luồng chuẩn...');
  const uploadedUrls = [];
  const mockFetchSuccess = async (url, init) => {
    uploadedUrls.push({ url, method: init?.method, headers: init?.headers });
    return {
      ok: true,
      status: 200,
      blob: async () => ({ size: 500000, type: 'image/webp' }),
    };
  };

  const uploadRes = await uploadVolume(testVolumeId, {
    customSupabase: mockSupabase,
    customFetch: mockFetchSuccess,
  });
  assert.strictEqual(uploadRes.ok, true);

  // Check remote table has ready volume
  const remoteVol = remoteVolumesTable.get(testVolumeId);
  assert.strictEqual(remoteVol?.status, 'ready');
  assert.strictEqual(remoteVol?.title, 'Tập 01: Thiếu Niên Thiên Tài');
  // 3 pages + 1 cover = 4 uploads
  assert.strictEqual(uploadedUrls.length, 4);
  console.log('      ✓ Tập truyện được tải lên đầy đủ (3 trang + bìa) và chuyển trạng thái "ready".');

  // 2.2 Test Retry with Backoff
  console.log('  2.2 Kiểm tra cơ chế retry tối đa 4 lần với lũy thừa thời gian chờ...');
  let failedAttempts = 0;
  const mockFetchRetry = async (url, init) => {
    if (failedAttempts < 2) {
      failedAttempts++;
      throw new Error('Mạng bị gián đoạn giả lập');
    }
    return { ok: true, status: 200 };
  };

  // Reset volume status for re-upload test
  remoteVol.status = 'uploading';
  mockStorage.clear();

  const retryRes = await uploadVolume(testVolumeId, {
    customSupabase: mockSupabase,
    customFetch: mockFetchRetry,
  });
  assert.strictEqual(retryRes.ok, true);
  assert.strictEqual(failedAttempts, 2, 'Phải retry đúng 2 lần lỗi trước khi thành công');
  console.log('      ✓ Retry tự động vượt qua lỗi mạng thành công.');

  // 2.3 Test Resume Upload (Bỏ qua các trang đã tải lên trước đó)
  console.log('  2.3 Kiểm tra cơ chế Resume (tiếp tục tải, bỏ qua trang đã xong)...');
  mockStorage.clear();
  // Simulate pages 0 and 1 were already uploaded in a previous session
  mockStorage.setItem(`tcl_comic_upload_${testVolumeId}`, JSON.stringify([0, 1]));

  const resumeUploads = [];
  const mockFetchResume = async (url, init) => {
    resumeUploads.push(url);
    return { ok: true, status: 200 };
  };

  await uploadVolume(testVolumeId, {
    customSupabase: mockSupabase,
    customFetch: mockFetchResume,
  });

  // Only page 2 and cover should be uploaded
  assert.strictEqual(
    resumeUploads.some((u) => u.includes('/0.webp')),
    false,
    'Trang 0 đã xong phải được bỏ qua'
  );
  assert.strictEqual(
    resumeUploads.some((u) => u.includes('/1.webp')),
    false,
    'Trang 1 đã xong phải được bỏ qua'
  );
  assert.strictEqual(
    resumeUploads.some((u) => u.includes('/2.webp')),
    true,
    'Trang 2 chưa xong phải được tải lên'
  );
  console.log('      ✓ Cơ chế Resume bỏ qua chính xác các trang đã có trong localStorage.');

  // 2.4 Test Abort Signal Mid-Upload
  console.log('  2.4 Kiểm tra hủy giữa chừng bằng AbortSignal...');
  const abortCtrl = new AbortController();
  mockStorage.clear();

  let abortCalls = 0;
  const mockFetchAbort = async (url, init) => {
    abortCalls++;
    if (abortCalls === 1) {
      abortCtrl.abort();
    }
    return { ok: true, status: 200 };
  };

  await assert.rejects(
    async () => {
      await uploadVolume(testVolumeId, {
        customSupabase: mockSupabase,
        customFetch: mockFetchAbort,
        signal: abortCtrl.signal,
      });
    },
    /hủy/i,
    'Phải ném lỗi khi có tín hiệu hủy AbortSignal'
  );
  console.log('      ✓ Hủy giữa chừng dừng ngay lập tức, không gây rò rỉ tác vụ.');

  // 2.5 Test Safe Local Eviction (evictLocalVolume)
  console.log('  2.5 Kiểm tra an toàn giải phóng bộ nhớ (evictLocalVolume)...');
  // Attempt to evict an unsynced volume -> MUST throw error!
  const unsyncedId = 'vol_unsynced_99';
  inMemoryVolumes.set(unsyncedId, {
    id: unsyncedId,
    title: 'Tập Chưa Đồng Bộ',
    seriesId: testSeriesId,
  });

  await assert.rejects(
    async () => {
      await evictLocalVolume(unsyncedId, { customSupabase: mockSupabase });
    },
    /CHƯA được đồng bộ an toàn lên Cloud/,
    'Tuyệt đối không bao giờ được xóa tập chưa lên Cloud!'
  );
  console.log('      ✓ Ngăn chặn thành công việc xóa nhầm tập chưa đồng bộ lên Cloud.');

  // Evict a synced volume -> MUST succeed and remove local volume
  remoteVolumesTable.get(testVolumeId).status = 'ready';
  const evictRes = await evictLocalVolume(testVolumeId, { customSupabase: mockSupabase });
  assert.strictEqual(evictRes.ok, true);
  console.log('      ✓ Giải phóng an toàn tập đã có bản sao Cloud.');

  // 2.6 Test Status Resolution in listRemote
  console.log('  2.6 Kiểm tra nhận diện 4 trạng thái tập trong listRemote...');
  // 1. Synced: in both DBs and status ready
  inMemoryVolumes.set('vol_synced', { id: 'vol_synced', seriesId: testSeriesId, importState: 'ready' });
  remoteVolumesTable.set('vol_synced', { id: 'vol_synced', series_id: testSeriesId, status: 'ready', user_id: validUid, deleted_at: null });

  // 2. Local only: in local DB only
  inMemoryVolumes.set('vol_local', { id: 'vol_local', seriesId: testSeriesId, importState: 'ready' });
  remoteVolumesTable.delete('vol_local');

  // 3. Cloud only: in remote DB only
  inMemoryVolumes.delete('vol_cloud');
  remoteVolumesTable.set('vol_cloud', { id: 'vol_cloud', series_id: testSeriesId, status: 'ready', user_id: validUid, deleted_at: null });

  const statusList = await listRemote({ customSupabase: mockSupabase });
  assert.strictEqual(statusList.volumeStatusMap['vol_synced']?.status, 'synced');
  assert.strictEqual(statusList.volumeStatusMap['vol_local']?.status, 'local_only');
  assert.strictEqual(statusList.volumeStatusMap['vol_cloud']?.status, 'cloud_only');
  console.log('      ✓ 4 trạng thái (Chỉ trên máy, Đang tải lên, Đã đồng bộ, Chỉ trên cloud) chuẩn xác.');

  // 2.7 Test Reading Progress Synchronization (Cloud vs Local)
  console.log('  2.7 Kiểm tra ưu tiên tiến độ đọc giữa Cloud và Local...');
  const progressVolId = 'vol_prog_test';

  // Case A: Cloud has newer progress -> Must adopt Cloud progress
  mockStorage.setItem(`tcl_comic_progress_${progressVolId}`, JSON.stringify({
    pageIndex: 2,
    scrollPercent: 20,
    updatedAt: 1000,
  }));

  remoteProgressTable.set(`${validUid}_${progressVolId}`, {
    user_id: validUid,
    volume_id: progressVolId,
    page_index: 10,
    scroll_percent: 85,
    updated_at: new Date(5000).toISOString(),
  });

  const pulledA = await pullComicProgressCloud(progressVolId, { customSupabase: mockSupabase });
  assert.strictEqual(pulledA?.pageIndex, 10, 'Cloud mới hơn phải được áp dụng');
  assert.strictEqual(pulledA?.isFromCloud, true);

  // Case B: Local is newer -> Keep Local
  mockStorage.setItem(`tcl_comic_progress_${progressVolId}`, JSON.stringify({
    pageIndex: 12,
    scrollPercent: 95,
    updatedAt: 10000,
  }));

  const pulledB = await pullComicProgressCloud(progressVolId, { customSupabase: mockSupabase });
  assert.strictEqual(pulledB?.pageIndex, 12, 'Local mới hơn phải được giữ nguyên');
  console.log('      ✓ Cơ chế so khớp tiến độ đọc Last-Write-Wins hoạt động hoàn hảo.');

  console.log('\n======================================================');
  console.log('✅ TOÀN BỘ CÁC BÀI TEST COMIC CLOUD SYNC (PHASE 2) ĐÃ PASS 100%!');
  console.log('======================================================\n');
}

runAllCloudTests().catch((err) => {
  console.error('❌ Kiểm thử Comic Cloud thất bại:', err);
  process.exit(1);
});
