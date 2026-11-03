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
  calculateEffectiveUsedBytes,
  getCorsHeaders,
  MAX_BATCH_SIZE,
  MAX_PAGE_BYTES,
  MAX_USER_QUOTA_BYTES,
  MAX_HOURLY_OPS,
  PUT_EXPIRATION_SECONDS,
  GET_EXPIRATION_SECONDS,
} from '../supabase/functions/comic-presign/validate.js';
import {
  callComicPresign,
  uploadVolume,
  downloadVolume,
  evictLocalVolume,
  listRemote,
  pushComicProgressCloud,
  pullComicProgressCloud,
  uploadAllUnsyncedVolumes,
  asyncPool,
  setSupabaseForTesting,
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

  // 1.4.1 Quota Double-Count Check
  console.log('  1.4.1 Kiểm tra chống tính trùng (double-count) quota khi upload volume...');
  const existingRows = [
    { id: 'vol_other_1', total_bytes: 7.6 * 1024 * 1024 * 1024 },
    { id: 'vol_uploading_now', total_bytes: 300 * 1024 * 1024 },
  ];
  // Tập đang upload: loại trừ chính nó -> used = 7.6GB, cộng 0.3GB = 7.9GB <= 8GB
  const effectiveUsed = calculateEffectiveUsedBytes(existingRows, 'vol_uploading_now');
  assert.strictEqual(effectiveUsed, 7.6 * 1024 * 1024 * 1024);
  const quotaNearLimit = checkQuota({
    usedBytes: effectiveUsed,
    incomingBytes: 300 * 1024 * 1024,
  });
  assert.strictEqual(quotaNearLimit.ok, true, 'Volume gần 8GB không được bị từ chối nhầm do tính trùng');

  // Tập mới vượt 8GB: used = 7.9GB, cộng 0.5GB = 8.4GB > 8GB -> Phải bị từ chối
  const effectiveForNew = calculateEffectiveUsedBytes(existingRows, 'vol_brand_new');
  const quotaOverLimit = checkQuota({
    usedBytes: effectiveForNew,
    incomingBytes: 500 * 1024 * 1024,
  });
  assert.strictEqual(quotaOverLimit.ok, false, 'Volume mới vượt 8GB phải bị từ chối');
  assert.strictEqual(quotaOverLimit.code, 'QUOTA_EXCEEDED');
  console.log('      ✓ Chống tính trùng quota thành công: volume gần 8GB hợp lệ, volume mới vượt 8GB bị chặn.');

  // 1.5 Rate Limiting (12000 Ops / Hour)
  console.log('  1.5 Kiểm tra giới hạn tốc độ 12000 thao tác/giờ (checkRateLimit)...');
  const rateOk = checkRateLimit({ currentHourlyOps: 11900, incomingOps: 50 });
  assert.strictEqual(rateOk.ok, true);
  assert.strictEqual(rateOk.remaining, 50);

  const rateExceeded = checkRateLimit({ currentHourlyOps: 11950, incomingOps: 60 });
  assert.strictEqual(rateExceeded.ok, false);
  assert.strictEqual(rateExceeded.code, 'RATE_LIMIT_EXCEEDED');
  console.log('      ✓ Chặn vượt rate limit 12000 ops/giờ thành công.');

  // 1.6 CORS Headers
  console.log('  1.6 Kiểm tra tiêu đề CORS...');
  const cors1 = getCorsHeaders('https://truevoidnan-commits.github.io');
  assert.strictEqual(cors1['Access-Control-Allow-Origin'], 'https://truevoidnan-commits.github.io');
  assert.strictEqual(
    cors1['Access-Control-Allow-Headers'].includes('x-supabase-api-version'),
    true,
    'CORS phải cho phép header x-supabase-api-version'
  );

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
      invoke: async (name, options = {}) => {
        const body = options?.body || {};
        // Assert: Không được truyền bất kỳ header tuỳ biến nào (như x-signal) để tránh lỗi CORS preflight
        if (options?.headers) {
          assert.strictEqual(
            options.headers['x-signal'],
            undefined,
            'Tuyệt đối không được truyền header tuỳ biến x-signal vào functions.invoke'
          );
        }

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
  setSupabaseForTesting(mockSupabase);

  // 2.1 Test Upload Volume Normal Flow (Bỏ HEAD, dùng GET Range bytes=0-0 trả 206)
  console.log('  2.1 Kiểm tra uploadVolume luồng chuẩn (Range GET 206, không gọi HEAD)...');
  const uploadedUrls = [];
  const verifiedUrls = [];
  const mockFetchSuccess = async (url, init) => {
    if (init?.method === 'HEAD') {
      throw new TypeError('HEAD method is strictly forbidden on presigned GET URL (failed to fetch CORS error)');
    }
    if (init?.method === 'GET' && init?.headers?.Range === 'bytes=0-0') {
      verifiedUrls.push({ url, method: init.method, headers: init.headers });
      return { ok: true, status: 206 }; // R2 / S3 returns 206 Partial Content
    }
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
  assert.strictEqual(uploadedUrls.length, 4, '4 tệp ảnh được tải lên (3 trang + bìa)');
  // Verification: 1 last page + 1 cover = 2 verified URLs via Range GET (not HEAD)
  assert.strictEqual(verifiedUrls.length, 2, '2 tệp được kiểm tra Range GET bytes=0-0');
  assert.strictEqual(verifiedUrls.every(v => v.method === 'GET' && v.headers.Range === 'bytes=0-0'), true);
  assert.strictEqual(mockStorage.getItem(`tcl_comic_upload_${testVolumeId}`), null, 'Xoá sạch resume key khi thành công');
  console.log('      ✓ Tập truyện được tải lên đầy đủ, xác minh Range GET thành công và chuyển trạng thái "ready".');

  // 2.1.1 Test Verification Failure (404 Not Found) - Không xoá localStorage để resume
  console.log('  2.1.1 Kiểm tra xác minh 404 thất bại và giữ nguyên localStorage tiến độ...');
  const failVolId = 'vol_test_fail_verify';
  inMemoryVolumes.set(failVolId, {
    id: failVolId,
    seriesId: testSeriesId,
    title: 'Tập Lỗi Xác Minh',
    order: 2,
    pageCount: 2,
    totalBytes: 1000000,
    quality: 'balanced',
    importState: 'ready',
  });
  inMemoryPages.set(`${failVolId}:00000`, { volumeId: failVolId, index: 0, blob: { size: 500000 } });
  inMemoryPages.set(`${failVolId}:00001`, { volumeId: failVolId, index: 1, blob: { size: 500000 } });

  const mockFetchFailVerify404 = async (url, init) => {
    if (init?.method === 'HEAD') {
      throw new TypeError('HEAD method is strictly forbidden');
    }
    if (init?.method === 'GET' && init?.headers?.Range) {
      // Simulate last page or cover not accessible (HTTP 404)
      return { ok: false, status: 404 };
    }
    return { ok: true, status: 200, blob: async () => ({ size: 500000, type: 'image/webp' }) };
  };

  await assert.rejects(
    async () => {
      await uploadVolume(failVolId, {
        customSupabase: mockSupabase,
        customFetch: mockFetchFailVerify404,
      });
    },
    /tệp không tồn tại trên Cloud \(404\)/,
    'Phải phân biệt chính xác lỗi tệp không tồn tại trên Cloud (404)'
  );

  const failRemoteVol = remoteVolumesTable.get(failVolId);
  assert.notStrictEqual(failRemoteVol?.status, 'ready', 'Tập lỗi xác minh tuyệt đối không được chuyển status="ready"');
  const retainedProgress = mockStorage.getItem(`tcl_comic_upload_${failVolId}`);
  assert.notStrictEqual(retainedProgress, null, 'Khi verify thất bại, KHÔNG được xoá key localStorage của tập');
  console.log('      ✓ Xác minh 404 báo lỗi chuẩn loại và giữ nguyên dữ liệu trong localStorage.');

  // 2.1.2 Test Verification Network Error (TypeError) retries 3 times with backoff
  console.log('  2.1.2 Kiểm tra xác minh lỗi mạng (TypeError) retry đúng 3 lần với backoff...');
  let verifyNetworkAttempts = 0;
  const mockFetchFailNetwork = async (url, init) => {
    if (init?.method === 'HEAD') {
      throw new TypeError('HEAD method is strictly forbidden');
    }
    if (init?.method === 'GET' && init?.headers?.Range) {
      verifyNetworkAttempts++;
      throw new TypeError('Failed to fetch (simulated network or CORS error)');
    }
    return { ok: true, status: 200, blob: async () => ({ size: 500000, type: 'image/webp' }) };
  };

  await assert.rejects(
    async () => {
      await uploadVolume(failVolId, {
        customSupabase: mockSupabase,
        customFetch: mockFetchFailNetwork,
        verifyDelays: [5, 10, 15],
      });
    },
    /không kết nối được tới Cloud \(có thể do CORS hoặc mạng\)/,
    'Phải phân biệt lỗi không kết nối được tới Cloud (do CORS hoặc mạng)'
  );
  assert.strictEqual(verifyNetworkAttempts, 4, 'Phải retry đúng 3 lần (tổng 4 lượt gọi) trước khi ném lỗi');
  console.log('      ✓ Lỗi mạng xác minh retry 3 lần và báo thông báo phân biệt CORS/mạng chuẩn xác.');

  // 2.1.3 Test Resume after Verification Failure (Không upload lại trang nào, chỉ verify và set ready)
  console.log('  2.1.3 Kiểm tra Resume sau lỗi xác minh: không tải lại trang nào, chỉ verify rồi đặt ready...');
  const resumeUploadUrls = [];
  const resumeVerifyUrls = [];
  const mockFetchResumeVerify = async (url, init) => {
    if (init?.method === 'HEAD') {
      throw new TypeError('HEAD method is strictly forbidden');
    }
    if (init?.method === 'GET' && init?.headers?.Range) {
      resumeVerifyUrls.push(url);
      return { ok: true, status: 206 };
    }
    resumeUploadUrls.push(url);
    return { ok: true, status: 200 };
  };

  const resumeVerifyRes = await uploadVolume(failVolId, {
    customSupabase: mockSupabase,
    customFetch: mockFetchResumeVerify,
  });
  assert.strictEqual(resumeVerifyRes.ok, true);
  assert.strictEqual(resumeUploadUrls.length, 0, 'Tuyệt đối không upload lại các trang đã xong');
  assert.strictEqual(resumeVerifyUrls.length, 2, 'Chỉ verify 2 tệp (trang cuối + cover)');
  assert.strictEqual(remoteVolumesTable.get(failVolId)?.status, 'ready', 'Tập được chuyển sang "ready"');
  assert.strictEqual(mockStorage.getItem(`tcl_comic_upload_${failVolId}`), null, 'Xoá key localStorage sau khi hoàn tất ready');
  console.log('      ✓ Resume sau lỗi xác minh bỏ qua toàn bộ trang đã upload, chỉ verify thành công và set ready.');

  // 2.2 Test Retry with Backoff
  console.log('  2.2 Kiểm tra cơ chế retry tối đa 4 lần với lũy thừa thời gian chờ...');
  let failedAttempts = 0;
  const mockFetchRetry = async (url, init) => {
    if (init?.method === 'HEAD') {
      throw new TypeError('HEAD method is strictly forbidden');
    }
    if (init?.method === 'GET' && init?.headers?.Range) {
      return { ok: true, status: 206 };
    }
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
    if (init?.method === 'HEAD') {
      throw new TypeError('HEAD method is strictly forbidden');
    }
    if (init?.method === 'GET' && init?.headers?.Range) {
      return { ok: true, status: 206 };
    }
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

  // 2.6 Test Status Resolution in listRemote (interrupted vs local_only vs synced vs cloud_only)
  console.log('  2.6 Kiểm tra nhận diện trạng thái trong listRemote (interrupted, local_only, synced, cloud_only)...');
  // 1. Synced: in both DBs and status ready
  inMemoryVolumes.set('vol_synced', { id: 'vol_synced', seriesId: testSeriesId, importState: 'ready' });
  remoteVolumesTable.set('vol_synced', { id: 'vol_synced', series_id: testSeriesId, status: 'ready', user_id: validUid, deleted_at: null });

  // 2. Local only: in local DB only, no residual progress in localStorage
  inMemoryVolumes.set('vol_local', { id: 'vol_local', seriesId: testSeriesId, importState: 'ready' });
  remoteVolumesTable.delete('vol_local');
  mockStorage.removeItem('tcl_comic_upload_vol_local');

  // 3. Cloud only: in remote DB only
  inMemoryVolumes.delete('vol_cloud');
  remoteVolumesTable.set('vol_cloud', { id: 'vol_cloud', series_id: testSeriesId, status: 'ready', user_id: validUid, deleted_at: null });

  // 4. Interrupted: in local DB, upload incomplete in localStorage, remote not ready
  inMemoryVolumes.set('vol_interrupted', { id: 'vol_interrupted', seriesId: testSeriesId, pageCount: 2, importState: 'ready' });
  remoteVolumesTable.set('vol_interrupted', { id: 'vol_interrupted', series_id: testSeriesId, status: 'uploading', user_id: validUid, deleted_at: null });
  mockStorage.setItem('tcl_comic_upload_vol_interrupted', JSON.stringify([0, 1])); // 2 out of 3 tasks = 67%

  const statusList = await listRemote({ customSupabase: mockSupabase });
  assert.strictEqual(statusList.volumeStatusMap['vol_synced']?.status, 'synced');
  assert.strictEqual(statusList.volumeStatusMap['vol_local']?.status, 'local_only');
  assert.strictEqual(statusList.volumeStatusMap['vol_cloud']?.status, 'cloud_only');
  assert.strictEqual(statusList.volumeStatusMap['vol_interrupted']?.status, 'interrupted', 'Phải nhận diện trạng thái interrupted khi không có task đang chạy');
  assert.strictEqual(statusList.volumeStatusMap['vol_interrupted']?.percent, 67);
  assert.strictEqual(statusList.volumeStatusMap['vol_interrupted']?.label, 'Tải lên dở dang (67%)');

  // Test Bỏ dở (Discard): Xoá localStorage đưa về local_only
  mockStorage.removeItem('tcl_comic_upload_vol_interrupted');
  remoteVolumesTable.delete('vol_interrupted');
  const statusListAfterDiscard = await listRemote({ customSupabase: mockSupabase });
  assert.strictEqual(statusListAfterDiscard.volumeStatusMap['vol_interrupted']?.status, 'local_only', 'Sau khi Bỏ dở đưa về local_only');
  console.log('      ✓ Trạng thái interrupted và chuyển về local_only khi Bỏ dở hoạt động chuẩn xác.');

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

  // 2.8 Test 429 Rate Limiting & 413 Quota in callComicPresign
  console.log('  2.8 Kiểm tra xử lý lỗi 429 (RATE_LIMITED) và 413 (QUOTA_EXCEEDED) trong presign...');

  // 429 rate limit error
  const mockSupabase429 = {
    ...mockSupabase,
    functions: {
      invoke: async () => ({
        data: null,
        error: {
          message: 'Edge Function returned a non-2xx status code',
          context: {
            status: 429,
            headers: { 'Retry-After': '120' },
            json: async () => ({
              error: 'Đã vượt quá giới hạn 12000 thao tác/giờ. Vui lòng thử lại sau.',
              code: 'RATE_LIMIT_EXCEEDED',
              retryAfterSeconds: 120,
            }),
          },
        },
      }),
    },
  };

  try {
    await callComicPresign({ action: 'put', volumeId: 'test_vol_429' }, { customSupabase: mockSupabase429 });
    assert.fail('Phải ném lỗi khi gặp 429');
  } catch (err) {
    assert.strictEqual(err.code, 'RATE_LIMITED');
    assert.strictEqual(err.retryAfterSeconds, 120);
    assert.strictEqual(err.message.includes('2 phút'), true);
  }
  console.log('      ✓ callComicPresign bắt 429 và đọc header Retry-After chuẩn xác (code=RATE_LIMITED).');

  // 413 quota error
  const mockSupabase413 = {
    ...mockSupabase,
    functions: {
      invoke: async () => ({
        data: null,
        error: {
          message: 'Payload Too Large',
          context: {
            status: 413,
            json: async () => ({
              error: 'Dung lượng lưu trữ truyện tranh trên Cloud đã vượt mức tối đa 8GB.',
              code: 'QUOTA_EXCEEDED',
            }),
          },
        },
      }),
    },
  };

  try {
    await callComicPresign({ action: 'put', volumeId: 'test_vol_413' }, { customSupabase: mockSupabase413 });
    assert.fail('Phải ném lỗi khi gặp 413');
  } catch (err) {
    assert.strictEqual(err.code, 'QUOTA_EXCEEDED');
  }
  console.log('      ✓ callComicPresign bắt 413 chuẩn xác (code=QUOTA_EXCEEDED).');

  // 2.9 Test uploadAllUnsyncedVolumes pauses on 429 and resumes
  console.log('  2.9 Kiểm tra uploadAllUnsyncedVolumes tạm dừng khi gặp 429 và tự tiếp tục...');
  const queueSeriesId = 'series_queue_test';
  inMemorySeries.set(queueSeriesId, { id: queueSeriesId, title: 'Hàng Đợi Test' });
  remoteSeriesTable.set(queueSeriesId, { id: queueSeriesId, title: 'Hàng Đợi Test', user_id: validUid, deleted_at: null });

  const qVol1 = 'vol_q_01';
  const qVol2 = 'vol_q_02';

  inMemoryVolumes.set(qVol1, { id: qVol1, seriesId: queueSeriesId, title: 'Tập Q1', order: 1, pageCount: 1, totalBytes: 100000, importState: 'ready' });
  inMemoryVolumes.set(qVol2, { id: qVol2, seriesId: queueSeriesId, title: 'Tập Q2', order: 2, pageCount: 1, totalBytes: 100000, importState: 'ready' });

  inMemoryPages.set(`${qVol1}:00000`, { volumeId: qVol1, index: 0, blob: { size: 100000 } });
  inMemoryPages.set(`${qVol2}:00000`, { volumeId: qVol2, index: 0, blob: { size: 100000 } });

  let qAttempts = 0;
  const queueProgressEvents = [];
  const mockSupabaseQueueRateLimit = {
    ...mockSupabase,
    functions: {
      invoke: async (name, options) => {
        const body = options?.body;
        // Lần đầu tải qVol1: giả lập gặp 429 với Retry-After = 1 giây
        if (body.volumeId === qVol1 && qAttempts === 0) {
          qAttempts++;
          return {
            data: null,
            error: {
              message: 'Rate limit',
              context: {
                status: 429,
                headers: { 'Retry-After': '1' },
                json: async () => ({
                  error: 'Rate limit exceeded',
                  code: 'RATE_LIMIT_EXCEEDED',
                  retryAfterSeconds: 1,
                }),
              },
            },
          };
        }
        return mockSupabase.functions.invoke(name, options);
      },
    },
  };

  const queueRes = await uploadAllUnsyncedVolumes(queueSeriesId, {
    customSupabase: mockSupabaseQueueRateLimit,
    customFetch: async (url, init) => {
      if (init?.method === 'HEAD') throw new TypeError('HEAD forbidden');
      if (init?.method === 'GET' && init?.headers?.Range) return { ok: true, status: 206 };
      return { ok: true, status: 200, blob: async () => ({ size: 100000 }) };
    },
    onProgress: (p) => queueProgressEvents.push(p),
  });

  assert.strictEqual(queueRes.uploadedCount, 2, 'Cả 2 tập đều phải tải lên thành công sau khi hết 429');
  assert.strictEqual(
    queueProgressEvents.some((p) => p.phase === 'rate_limited'),
    true,
    'Hàng đợi phải phát sự kiện rate_limited thông báo cho UI'
  );
  assert.strictEqual(remoteVolumesTable.get(qVol1)?.status, 'ready');
  assert.strictEqual(remoteVolumesTable.get(qVol2)?.status, 'ready');
  console.log('      ✓ Hàng đợi tạm dừng khi gặp 429, chờ hết hạn và tự tiếp tục tải trọn vẹn cả 2 tập.');

  // 2.10 Test uploadAllUnsyncedVolumes stops immediately on 413 Quota
  console.log('  2.10 Kiểm tra uploadAllUnsyncedVolumes dừng ngay khi gặp 413 Quota...');
  const queueSeries413 = 'series_queue_413';
  inMemorySeries.set(queueSeries413, { id: queueSeries413, title: 'Hàng Đợi 413' });
  const q413Vol = 'vol_q_413';
  inMemoryVolumes.set(q413Vol, { id: q413Vol, seriesId: queueSeries413, title: 'Tập Vượt Quota', order: 1, pageCount: 1, totalBytes: 100000, importState: 'ready' });
  inMemoryPages.set(`${q413Vol}:00000`, { volumeId: q413Vol, index: 0, blob: { size: 100000 } });

  await assert.rejects(
    async () => {
      await uploadAllUnsyncedVolumes(queueSeries413, {
        customSupabase: mockSupabase413,
        customFetch: async () => ({ ok: true, status: 200 }),
      });
    },
    /vượt quá hạn mức lưu trữ Cloud 8GB/i
  );
  console.log('      ✓ Hàng đợi dừng ngay lập tức và báo rõ khi chạm 413 Quota.');

  // 2.11 Test Regression: uploadAllUnsyncedVolumes KHÔNG truyền customFetch / customSupabase
  console.log('  2.11 Kiểm tra hồi quy: uploadAllUnsyncedVolumes không truyền customFetch/customSupabase, dùng globalThis.fetch...');
  const regSeriesId = 'series_regression_fetch';
  inMemorySeries.set(regSeriesId, { id: regSeriesId, title: 'Hàng Đợi Hồi Quy Fetch' });
  remoteSeriesTable.set(regSeriesId, { id: regSeriesId, title: 'Hàng Đợi Hồi Quy Fetch', user_id: validUid, deleted_at: null });

  const rVol1 = 'vol_reg_01';
  const rVol2 = 'vol_reg_02';

  inMemoryVolumes.set(rVol1, { id: rVol1, seriesId: regSeriesId, title: 'Tập Reg 1', order: 1, pageCount: 1, totalBytes: 100000, importState: 'ready' });
  inMemoryVolumes.set(rVol2, { id: rVol2, seriesId: regSeriesId, title: 'Tập Reg 2', order: 2, pageCount: 1, totalBytes: 100000, importState: 'ready' });

  inMemoryPages.set(`${rVol1}:00000`, { volumeId: rVol1, index: 0, blob: { size: 100000 } });
  inMemoryPages.set(`${rVol2}:00000`, { volumeId: rVol2, index: 0, blob: { size: 100000 } });

  const globalFetchCalls = [];
  const originalGlobalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (init?.method === 'HEAD') throw new TypeError('HEAD forbidden');
    if (init?.method === 'GET' && init?.headers?.Range) return { ok: true, status: 206 };
    globalFetchCalls.push({ url, method: init?.method });
    return { ok: true, status: 200, blob: async () => ({ size: 100000 }) };
  };

  const regProgressEvents = [];
  try {
    // GỌI HÀNG ĐỢI TUYỆT ĐỐI KHÔNG TRUYỀN customFetch và customSupabase!
    const regRes = await uploadAllUnsyncedVolumes(regSeriesId, {
      verifyDelays: [5, 10, 15],
      onProgress: (p) => regProgressEvents.push(p),
    });

    assert.strictEqual(regRes.uploadedCount, 2, 'Cả 2 tập phải tải lên thành công qua globalThis.fetch');
    assert.strictEqual(remoteVolumesTable.get(rVol1)?.status, 'ready', 'Tập 1 phải hoàn tất ready');
    assert.strictEqual(remoteVolumesTable.get(rVol2)?.status, 'ready', 'Tập 2 phải hoàn tất ready');
    assert.strictEqual(globalFetchCalls.length >= 4, true, 'globalThis.fetch phải được gọi cho các trang và bìa');

    // Khẳng định chạy tuần tự: tập 1 bắt đầu trước tập 2
    const startIdx1 = regProgressEvents.findIndex((p) => p.phase === 'start_volume' && p.volumeId === rVol1);
    const startIdx2 = regProgressEvents.findIndex((p) => p.phase === 'start_volume' && p.volumeId === rVol2);
    assert.strictEqual(startIdx1 !== -1 && startIdx2 !== -1 && startIdx1 < startIdx2, true, 'Hàng đợi phải chạy tuần tự tập 1 trước tập 2');

    console.log('      ✓ Hàng đợi tải lên qua globalThis.fetch thành công 100% cho cả 2 tập tuần tự.');
  } finally {
    globalThis.fetch = originalGlobalFetch;
  }

  console.log('\n======================================================');
  console.log('✅ TOÀN BỘ CÁC BÀI TEST COMIC CLOUD SYNC (PHASE 2) ĐÃ PASS 100%!');
  console.log('======================================================\n');
}

runAllCloudTests().catch((err) => {
  console.error('❌ Kiểm thử Comic Cloud thất bại:', err);
  process.exit(1);
});
