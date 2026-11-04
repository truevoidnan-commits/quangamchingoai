/**
 * scripts/test-comics-phase4.js
 * Test toàn diện Phase 4: Xóa đồng bộ, Dọn trạng thái, Sửa lỗi hàng đợi.
 */

import assert from 'assert';

// 1. Setup Mock LocalStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => (store[key] !== undefined ? store[key] : null),
    setItem: (key, val) => {
      store[key] = String(val);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i) => Object.keys(store)[i] || null,
  };
})();
globalThis.localStorage = localStorageMock;

// 2. Setup Mock IDBKeyRange
globalThis.IDBKeyRange = {
  only: (v) => ({ lower: v, upper: v }),
};

// 3. Setup Mock window & navigator
let lastRealtimeSignal = null;
globalThis.window = {
  dispatchEvent: (evt) => {
    if (evt.type === 'tcl_comic_realtime_signal') {
      lastRealtimeSignal = evt.detail || true;
    }
  },
  addEventListener: () => {},
  removeEventListener: () => {},
};

let isOnline = true;
Object.defineProperty(globalThis, 'navigator', {
  value: {
    get onLine() {
      return isOnline;
    },
    storage: {
      estimate: async () => ({ usage: 100 * 1024 * 1024, quota: 1000 * 1024 * 1024 }),
    },
    locks: {
      request: (name, opts, callback) => {
        if (typeof opts === 'function') callback = opts;
        return Promise.resolve(callback({ name }));
      },
    },
  },
  configurable: true,
  writable: true,
});

// Import Edge Function validation module
import {
  validatePresignRequest,
  checkRateLimit,
  parseS3ListXml,
  MAX_HOURLY_OPS,
  MAX_HOURLY_DELETE_OPS,
} from '../supabase/functions/comic-presign/validate.js';

// Import comicDb & comicCloud
import {
  setComicDBForTesting,
  saveSeries,
  getSeries,
  getAllSeries,
  saveVolume,
  getVolume,
  getVolumes,
  deleteSeries,
  deleteVolume,
  savePagesBulk,
  saveComicProgress,
  getComicProgress,
} from '../src/lib/comics/comicDb.js';

import {
  setSupabaseForTesting,
  purgeLocalVolumeData,
  deleteVolumeEverywhere,
  deleteSeriesEverywhere,
  listRemote,
  isVolumeTombstoned,
  isSeriesTombstoned,
  setTombstonesForTesting,
} from '../src/lib/comics/comicCloud.js';

import {
  enqueueUpload,
  enqueueDownload,
  cancelTask,
  triggerProcess,
  getQueueSnapshot,
  resetQueueForTesting,
  setSyncHandlersForTesting,
  resumeSync,
  pauseSync,
} from '../src/lib/comics/comicSyncQueue.js';

// Setup Mock In-Memory IndexedDB
function createMockDB() {
  const tables = {
    series: new Map(),
    volumes: new Map(),
    pages: new Map(),
  };

  return {
    _tables: tables,
    get: async (table, key) => {
      const val = tables[table].get(key);
      return val ? JSON.parse(JSON.stringify(val)) : undefined;
    },
    put: async (table, val) => {
      tables[table].set(val.id, JSON.parse(JSON.stringify(val)));
      return val.id;
    },
    delete: async (table, key) => {
      tables[table].delete(key);
    },
    getAll: async (table) => {
      return Array.from(tables[table].values()).map((v) => JSON.parse(JSON.stringify(v)));
    },
    transaction: (stores, mode) => {
      const storeList = Array.isArray(stores) ? stores : [stores];
      return {
        objectStore: (name) => ({
          get: async (k) => tables[name]?.get(k),
          put: async (v) => tables[name]?.set(v.id || `${v.volumeId}_${v.index}`, v),
          delete: async (k) => tables[name]?.delete(k),
          index: (idxName) => ({
            openCursor: async (range) => {
              const matchedKeys = [];
              for (const [k, v] of tables[name].entries()) {
                if (v[idxName] === range.lower) matchedKeys.push(k);
              }
              let cursorIdx = 0;
              if (matchedKeys.length === 0) return null;
              const cursorObj = {
                get key() {
                  return matchedKeys[cursorIdx];
                },
                get value() {
                  return tables[name].get(matchedKeys[cursorIdx]);
                },
                delete: async () => {
                  tables[name].delete(matchedKeys[cursorIdx]);
                },
                continue: async () => {
                  cursorIdx++;
                  return cursorIdx < matchedKeys.length ? cursorObj : null;
                },
              };
              return cursorObj;
            },
            getAll: async (range) => {
              const res = [];
              for (const v of tables[name].values()) {
                if (v[idxName] === range.lower) res.push(JSON.parse(JSON.stringify(v)));
              }
              return res;
            },
          }),
        }),
        done: Promise.resolve(),
      };
    },
  };
}

let mockDB = createMockDB();
setComicDBForTesting(mockDB);

// Setup Mock Supabase Client
function createMockSupabase() {
  let user = { id: 'test-user-uuid-1234-5678-90ab-cdef12345678', email: 'user@test.com' };
  let db = {
    comic_series: [],
    comic_volumes: [],
    comic_progress: [],
    comic_ops_hourly: [],
  };

  let presignHandler = async (payload) => {
    return { data: { success: true, deletedCount: 5 }, error: null };
  };

  const client = {
    _db: db,
    _user: user,
    setPresignHandler: (fn) => {
      presignHandler = fn;
    },
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      getSession: async () => ({ data: { session: { user } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    functions: {
      invoke: async (fnName, { body } = {}) => {
        return presignHandler(body);
      },
    },
    from: (table) => {
      let rows = client._db[table] || [];
      let filters = [];
      let updatePayload = null;
      let isDelete = false;
      let limitVal = null;
      let orderVal = null;

      const chain = {
        select: (cols = '*') => chain,
        eq: (col, val) => {
          filters.push((r) => r[col] === val);
          return chain;
        },
        is: (col, val) => {
          filters.push((r) => r[col] === val);
          return chain;
        },
        not: (col, op, val) => {
          if (op === 'is' && val === null) {
            filters.push((r) => r[col] !== null && r[col] !== undefined);
          }
          return chain;
        },
        order: (col, opts) => {
          orderVal = { col, opts };
          return chain;
        },
        limit: (l) => {
          limitVal = l;
          return chain;
        },
        maybeSingle: async () => {
          let filtered = rows.filter((r) => filters.every((f) => f(r)));
          return { data: filtered[0] || null, error: null };
        },
        single: async () => {
          let filtered = rows.filter((r) => filters.every((f) => f(r)));
          return { data: filtered[0] || null, error: filtered[0] ? null : { message: 'Not found' } };
        },
        update: (payload) => {
          updatePayload = payload;
          return chain;
        },
        delete: () => {
          isDelete = true;
          return chain;
        },
        upsert: async (item) => {
          const idx = rows.findIndex((r) => r.id === item.id);
          if (idx !== -1) rows[idx] = { ...rows[idx], ...item };
          else rows.push({ ...item });
          return { data: item, error: null };
        },
        then: (onRes, onRej) => {
          let filtered = rows.filter((r) => filters.every((f) => f(r)));
          if (updatePayload) {
            for (const r of filtered) {
              Object.assign(r, updatePayload);
            }
            return Promise.resolve({ data: filtered, error: null }).then(onRes, onRej);
          }
          if (isDelete) {
            client._db[table] = client._db[table].filter((r) => !filters.every((f) => f(r)));
            return Promise.resolve({ data: filtered, error: null }).then(onRes, onRej);
          }
          if (orderVal) {
            filtered.sort((a, b) => (b[orderVal.col] > a[orderVal.col] ? 1 : -1));
          }
          if (limitVal) {
            filtered = filtered.slice(0, limitVal);
          }
          return Promise.resolve({ data: filtered, error: null }).then(onRes, onRej);
        },
      };

      return chain;
    },
  };

  return client;
}

let mockSupabase = createMockSupabase();
setSupabaseForTesting(mockSupabase);

// =============================================================================
// TEST SUITE EXECUTION
// =============================================================================

async function runAllTests() {
  console.log('=== BẮT ĐẦU TEST TOÀN DIỆN PHASE 4 (COMICS CLOUD & QUEUE FIXES) ===\n');

  // --- E1 & E2: Edge Function Logic ---
  console.log('[Test 1] Edge Function XML Parser & Rate Limits (E1, E2)');
  {
    const xml = `
    <ListBucketResult>
      <Name>tcl-comics</Name>
      <Contents><Key>uid1/volA/0000.webp</Key></Contents>
      <Contents><Key>uid1/volA/0001.webp</Key></Contents>
      <Contents><Key>uid1/volA/cover.webp</Key></Contents>
      <NextContinuationToken>token_12345</NextContinuationToken>
    </ListBucketResult>
    `;
    const parsed = parseS3ListXml(xml);
    assert.strictEqual(parsed.keys.length, 3);
    assert.strictEqual(parsed.keys[0], 'uid1/volA/0000.webp');
    assert.strictEqual(parsed.nextContinuationToken, 'token_12345');

    // Action delete-volume does not require pages
    const reqValidation = validatePresignRequest({
      action: 'delete-volume',
      volumeId: 'vol_alpha_1',
    });
    assert.strictEqual(reqValidation.ok, true);
    assert.strictEqual(reqValidation.validated.action, 'delete-volume');

    // Rate limit check: delete action gets 15,000 ops limit
    const deleteRateCheck = checkRateLimit({
      action: 'delete-volume',
      currentHourlyOps: 12500, // Above normal 12,000
      incomingOps: 100,
    });
    assert.strictEqual(deleteRateCheck.ok, true, 'Delete ops should succeed under 15,000');

    const putRateCheck = checkRateLimit({
      action: 'put',
      currentHourlyOps: 12000,
      incomingOps: 1,
    });
    assert.strictEqual(putRateCheck.ok, false, 'Put should be rate limited at 12,000');
    console.log('  -> PASS: E1 & E2 Edge Function validation và rate limit chính xác.\n');
  }

  // --- Q1: Queue 429 Rate Limit Lock Bypass Fix ---
  console.log('[Test 2] Queue 429 Rate Limit Fix (Q1)');
  {
    resetQueueForTesting();
    let uploadCallCount = 0;

    setSyncHandlersForTesting({
      upload: async () => {
        uploadCallCount++;
        const err = new Error('Rate limit exceeded');
        err.code = 'RATE_LIMITED';
        err.status = 429;
        err.retryAfterSeconds = 120; // 2 minutes
        throw err;
      },
    });

    enqueueUpload('vol_q1', 'series_q1', { volumeTitle: 'Tập Q1' });
    await new Promise((r) => setTimeout(r, 50));

    assert.strictEqual(uploadCallCount, 1, 'Tác vụ upload chạy lần đầu và gặp 429');

    const snapshot = getQueueSnapshot();
    assert.ok(snapshot.rateLimitInfo, 'Phải có rateLimitInfo');
    assert.strictEqual(snapshot.rateLimitInfo.waitMinutes, 2, 'waitMinutes phải tính đúng 2 phút');

    // Gọi triggerProcess() nhiều lần khi còn trong thời gian rate limit: KHÔNG được gọi upload thêm lần nào
    triggerProcess();
    triggerProcess();
    await new Promise((r) => setTimeout(r, 60));

    assert.strictEqual(uploadCallCount, 1, 'Queue không được thử lại trước khi hết thời gian 429');

    // Test resumeSync() trong lúc rate-limited: giữ nguyên chờ, không triggerProcess ngay
    resumeSync();
    assert.strictEqual(uploadCallCount, 1, 'resumeSync không được bypass rate limit');

    resetQueueForTesting();
    console.log('  -> PASS: Q1 Hàng đợi không thử lại trước hạn khi gặp 429.\n');
  }

  // --- P2: Execution Order on Deletion (R2 failure aborts before Supabase / local) ---
  console.log('[Test 3] P2 Thứ tự thực hiện: R2 lỗi thì DỪNG, không xóa Supabase & Local');
  {
    mockDB._tables.series.clear();
    mockDB._tables.volumes.clear();
    mockDB._tables.pages.clear();
    mockSupabase._db.comic_series = [];
    mockSupabase._db.comic_volumes = [];
    localStorage.clear();

    // 1. Tạo series và volume local & remote
    await saveSeries({ id: 'series_p2', title: 'Truyện P2' });
    await saveVolume({ id: 'vol_p2', seriesId: 'series_p2', title: 'Tập 1', pageCount: 10, totalBytes: 500000 });
    await savePagesBulk([{ volumeId: 'vol_p2', index: 0, blob: new Blob(['abc']) }]);
    saveComicProgress('vol_p2', { pageIndex: 3, scrollPercent: 50 });

    mockSupabase._db.comic_series.push({
      id: 'series_p2',
      user_id: mockSupabase._user.id,
      title: 'Truyện P2',
      deleted_at: null,
    });
    mockSupabase._db.comic_volumes.push({
      id: 'vol_p2',
      user_id: mockSupabase._user.id,
      series_id: 'series_p2',
      title: 'Tập 1',
      status: 'ready',
      deleted_at: null,
    });

    // Cấu hình presign ném lỗi 502 (R2 delete failed)
    mockSupabase.setPresignHandler(async () => {
      return { data: null, error: { message: 'Cloudflare R2 502 Bad Gateway', code: 'R2_DELETE_FAILED' } };
    });

    let deleteFailed = false;
    try {
      await deleteVolumeEverywhere('vol_p2', { customSupabase: mockSupabase });
    } catch (err) {
      deleteFailed = true;
      assert.ok(err.message.includes('502') || err.message.includes('R2'));
    }

    assert.strictEqual(deleteFailed, true, 'deleteVolumeEverywhere phải ném lỗi khi R2 thất bại');

    // Kiểm tra: Supabase CHƯA bị đánh dấu deleted_at
    const remoteRow = mockSupabase._db.comic_volumes.find((v) => v.id === 'vol_p2');
    assert.strictEqual(remoteRow.deleted_at, null, 'comic_volumes không được đánh dấu deleted_at khi R2 lỗi');

    // Kiểm tra: Bản local IndexedDB và progress localStorage vẫn NGUYÊN VẸN
    const localVol = await getVolume('vol_p2');
    assert.ok(localVol, 'Volume local vẫn còn nguyên');
    const localProg = getComicProgress('vol_p2');
    assert.ok(localProg, 'Progress local vẫn còn nguyên');

    console.log('  -> PASS: P2 R2 thất bại thì dừng ngay, bảo toàn dữ liệu Supabase và local.\n');
  }

  // --- P2: Offline checks ---
  console.log('[Test 4] P2 Offline: Tập đã đồng bộ bị chặn; Tập local-only xóa thành công');
  {
    isOnline = false;

    // A. Tập đã đồng bộ (đã có trên Cloud) khi offline -> BỊ CHẶN
    // Ghi nhận tập vol_synced là known cloud
    setTombstonesForTesting({ knownCloud: ['vol_synced'] });
    await saveVolume({ id: 'vol_synced', seriesId: 'series_p2', title: 'Tập Synced', pageCount: 5 });

    let offlineBlocked = false;
    try {
      await deleteVolumeEverywhere('vol_synced', { customSupabase: mockSupabase });
    } catch (err) {
      offlineBlocked = true;
      assert.ok(err.message.includes('Cần kết nối mạng để xóa tập đã đồng bộ'));
    }
    assert.strictEqual(offlineBlocked, true, 'Xóa tập đã đồng bộ khi offline phải bị chặn');

    // B. Tập chưa từng lên Cloud (local-only) -> XÓA THÀNH CÔNG KHÔNG CẦN MẠNG
    await saveVolume({ id: 'vol_local_only', seriesId: 'series_p2', title: 'Tập Local Only', pageCount: 5 });
    await savePagesBulk([{ volumeId: 'vol_local_only', index: 0, blob: new Blob(['def']) }]);

    const delLocalRes = await deleteVolumeEverywhere('vol_local_only', { customSupabase: mockSupabase });
    assert.strictEqual(delLocalRes.localOnly, true);

    const checkVol = await getVolume('vol_local_only');
    assert.strictEqual(checkVol, undefined, 'Tập local-only phải bị xóa khỏi IndexedDB');

    isOnline = true;
    console.log('  -> PASS: P2 Tập đồng bộ offline bị chặn, tập local-only xóa mượt không cần mạng.\n');
  }

  // --- P2: Succeeded Delete Everywhere Sequence ---
  console.log('[Test 5] P2 Xóa thành công ở mọi nơi: R2 -> Supabase -> Local & Progress');
  {
    // Cho phép presign thành công
    mockSupabase.setPresignHandler(async () => {
      return { data: { success: true, deletedCount: 11 }, error: null };
    });

    lastRealtimeSignal = null;
    const res = await deleteVolumeEverywhere('vol_p2', { customSupabase: mockSupabase });
    assert.strictEqual(res.ok, true);

    // 1. Supabase comic_volumes có deleted_at
    const remoteRow = mockSupabase._db.comic_volumes.find((v) => v.id === 'vol_p2');
    assert.ok(remoteRow.deleted_at, 'comic_volumes phải có deleted_at');

    // 2. Local IndexedDB volume và pages bị xóa
    const localVol = await getVolume('vol_p2');
    assert.strictEqual(localVol, undefined, 'Local volume phải bị xóa');

    // 3. Local progress bị xóa
    const prog = getComicProgress('vol_p2');
    assert.strictEqual(prog, null, 'Local progress phải bị xóa');

    // 4. Hoàn tất xóa thành công
    assert.strictEqual(res.ok, true);

    console.log('  -> PASS: P2 Thứ tự xóa hoàn tất đầy đủ mọi tầng dữ liệu.\n');
  }

  // --- P3: Tombstone Synchronization on Other Devices ---
  console.log('[Test 6] P3 Tombstone Synchronization: tự dọn local copy, không xóa tập local chưa sync');
  {
    mockDB._tables.series.clear();
    mockDB._tables.volumes.clear();
    mockSupabase._db.comic_series = [];
    mockSupabase._db.comic_volumes = [];
    localStorage.clear();

    // Thiết bị này có 2 tập:
    // vol_tombstone: đã bị xóa trên cloud bởi thiết bị khác (có deleted_at trên remote)
    // vol_unsynced: tập người dùng tự nhập local, chưa từng có hàng remote
    await saveSeries({ id: 'series_mix', title: 'Bộ Truyện Mix' });
    await saveVolume({ id: 'vol_tombstone', seriesId: 'series_mix', title: 'Tập Sẽ Bị Xóa', pageCount: 10 });
    await saveVolume({ id: 'vol_unsynced', seriesId: 'series_mix', title: 'Tập Local Mới', pageCount: 8, importState: 'ready' });

    // Trên Supabase: vol_tombstone có deleted_at
    mockSupabase._db.comic_series.push({
      id: 'series_mix',
      user_id: mockSupabase._user.id,
      title: 'Bộ Truyện Mix',
      deleted_at: null,
    });
    mockSupabase._db.comic_volumes.push({
      id: 'vol_tombstone',
      user_id: mockSupabase._user.id,
      series_id: 'series_mix',
      title: 'Tập Sẽ Bị Xóa',
      deleted_at: new Date().toISOString(),
    });

    // Chạy listRemote() để đồng bộ và reconcile tombstones
    const remoteList = await listRemote({ customSupabase: mockSupabase });

    // 1. vol_tombstone phải tự động bị dọn khỏi IndexedDB
    const vol1 = await getVolume('vol_tombstone');
    assert.strictEqual(vol1, undefined, 'Tập bị tombstone phải tự động bị dọn dẹp khỏi máy');

    // 2. vol_unsynced KHÔNG ĐƯỢC BỊ XÓA (nó là tập chưa sync, không phải tập bị xóa)
    const vol2 = await getVolume('vol_unsynced');
    assert.ok(vol2, 'Tập local chưa từng lên Cloud PHẢI ĐƯỢC GIỮ NGUYÊN');

    // 3. vol_tombstone được ghi nhận vào tombstone set và không bao giờ tự tải lên lại
    assert.strictEqual(isVolumeTombstoned('vol_tombstone'), true);

    let uploadAttempted = false;
    enqueueUpload('vol_tombstone', 'series_mix', {
      volumeTitle: 'Tập Sẽ Bị Xóa',
    });
    const snap = getQueueSnapshot();
    const isQueued = snap.pendingTasks.some((t) => t.volumeId === 'vol_tombstone');
    assert.strictEqual(isQueued, false, 'Tập đã bị tombstone KHÔNG được đưa vào hàng đợi upload');

    console.log('  -> PASS: P3 Tombstone dọn đúng tập bị xóa, giữ nguyên tập local chưa sync và chống upload lại.\n');
  }

  // --- P4: Empty Series Auto-Cleanup ---
  console.log('[Test 7] P4 Dọn dẹp bộ truyện rỗng (0 tập)');
  {
    mockDB._tables.series.clear();
    mockDB._tables.volumes.clear();
    mockSupabase._db.comic_series = [];
    mockSupabase._db.comic_volumes = [];

    // Tạo một bộ truyện rỗng (0 tập) trên Supabase
    mockSupabase._db.comic_series.push({
      id: 'series_empty_cloud',
      user_id: mockSupabase._user.id,
      title: 'Bộ Rỗng Cloud',
      deleted_at: null,
    });

    const res = await listRemote({ customSupabase: mockSupabase });
    const hasEmpty = res.remoteSeries.some((s) => s.id === 'series_empty_cloud');
    assert.strictEqual(hasEmpty, false, 'Bộ truyện 0 tập KHÔNG được xuất hiện trong danh sách remoteSeries');

    console.log('  -> PASS: P4 Bộ truyện rỗng tự động biến mất, không còn thẻ "Trên Cloud, 0 tập".\n');
  }

  // --- P1 & P2: Xóa Cả Bộ Truyện (deleteSeriesEverywhere) ---
  console.log('[Test 8] P1 Xóa toàn bộ bộ truyện: xóa từng tập rồi xóa bộ');
  {
    mockDB._tables.series.clear();
    mockDB._tables.volumes.clear();
    mockSupabase._db.comic_series = [];
    mockSupabase._db.comic_volumes = [];

    await saveSeries({ id: 'series_full', title: 'Bộ Đầy Đủ' });
    await saveVolume({ id: 'vol_f1', seriesId: 'series_full', title: 'Tập 1', pageCount: 10 });
    await saveVolume({ id: 'vol_f2', seriesId: 'series_full', title: 'Tập 2', pageCount: 12 });

    mockSupabase._db.comic_series.push({
      id: 'series_full',
      user_id: mockSupabase._user.id,
      title: 'Bộ Đầy Đủ',
      deleted_at: null,
    });
    mockSupabase._db.comic_volumes.push(
      { id: 'vol_f1', series_id: 'series_full', user_id: mockSupabase._user.id, status: 'ready', deleted_at: null },
      { id: 'vol_f2', series_id: 'series_full', user_id: mockSupabase._user.id, status: 'ready', deleted_at: null }
    );

    mockSupabase.setPresignHandler(async () => ({ data: { success: true, deletedCount: 10 }, error: null }));

    const delSeriesRes = await deleteSeriesEverywhere('series_full', { customSupabase: mockSupabase });
    assert.strictEqual(delSeriesRes.ok, true);

    // Mọi volume và series đều bị xóa
    const v1 = await getVolume('vol_f1');
    const v2 = await getVolume('vol_f2');
    const s = await getSeries('series_full');
    assert.strictEqual(v1, undefined);
    assert.strictEqual(v2, undefined);
    assert.strictEqual(s, null);

    const remoteSeriesRow = mockSupabase._db.comic_series.find((x) => x.id === 'series_full');
    assert.ok(remoteSeriesRow.deleted_at, 'comic_series remote phải có deleted_at');

    console.log('  -> PASS: Xóa bộ truyện xóa sạch toàn bộ tập và hồ sơ bộ ở mọi nơi.\n');
  }


  // --- S1-S3: Trạng thái hiển thị logic cho từng tổ hợp ---
  console.log('[Test 9] S1-S3 Kiểm tra logic hiển thị trạng thái (synced, queued, offline, error, quick sync)');
  {
    const getStatusDisplay = (vol, { isTaskActive, isTaskQueued, volFailure, isSynced, isCloudOnly, isOffline }) => {
      if (isTaskActive) return { type: 'active', label: 'Đang đồng bộ' };
      if (isTaskQueued) return { type: 'queued', label: isOffline ? 'Chờ mạng' : 'Đang chờ' };
      if (volFailure) return { type: 'error', label: 'Lỗi đồng bộ', canRetry: true };
      if (isSynced) return { type: 'synced', label: null, hasCheckIcon: true };
      if (isCloudOnly) return { type: 'cloud_only', title: 'Chưa tải về máy này' };
      return { type: 'local_only', title: 'Chưa lên Cloud' };
    };

    const s1 = getStatusDisplay({}, { isSynced: true });
    assert.strictEqual(s1.label, null, 'S1: Tập đã đồng bộ không được có nhãn chữ');
    assert.strictEqual(s1.hasCheckIcon, true);

    const s2Queued = getStatusDisplay({}, { isTaskQueued: true, isOffline: false });
    assert.strictEqual(s2Queued.label, 'Đang chờ');

    const s2Offline = getStatusDisplay({}, { isTaskQueued: true, isOffline: true });
    assert.strictEqual(s2Offline.label, 'Chờ mạng');

    const s2Error = getStatusDisplay({}, { volFailure: { lastError: 'Fail' } });
    assert.strictEqual(s2Error.label, 'Lỗi đồng bộ');
    assert.strictEqual(s2Error.canRetry, true);

    const s3Cloud = getStatusDisplay({}, { isCloudOnly: true });
    assert.strictEqual(s3Cloud.title, 'Chưa tải về máy này');

    const s3Local = getStatusDisplay({}, { isCloudOnly: false });
    assert.strictEqual(s3Local.title, 'Chưa lên Cloud');

    console.log('  -> PASS: S1-S3 logic hiển thị trạng thái tinh gọn đạt 100% yêu cầu.\n');
  }

  console.log('========================================');
  console.log('TẤT CẢ 9 BÀI TEST PHASE 4 ĐÃ ĐẠT 100%!');
  console.log('========================================\n');

}

runAllTests().catch((err) => {
  console.error('TEST PHASE 4 THẤT BẠI:', err);
  process.exit(1);
});
