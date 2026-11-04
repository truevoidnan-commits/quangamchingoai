/**
 * scripts/test-comics-sync-fixes.js
 * Kiểm thử toàn diện các sửa đổi:
 * - LỖI 1: Tải về tập 100, 101, 199, 200, 201 trang không vượt giới hạn 100 URL, bìa tải đúng 1 lần.
 * - LỖI 2: Đồng bộ đổi tên (tập, số tập, bộ truyện), Last-Write-Wins, sửa offline, không vòng lặp.
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
  },
  configurable: true,
  writable: true,
});

// Import comicDb & comicCloud
import {
  setComicDBForTesting,
  saveSeries,
  getSeries,
  getAllSeries,
  saveVolume,
  getVolume,
  getVolumes,
  updateVolume,
  updateSeries,
  deleteSeries,
  deleteVolume,
  savePagesBulk,
  getPage,
} from '../src/lib/comics/comicDb.js';

import {
  downloadVolume,
  listRemote,
  updateVolumeMetadata,
  updateSeriesMetadata,
  flushPendingMetadata,
  setTombstonesForTesting,
} from '../src/lib/comics/comicCloud.js';

// Setup In-Memory Mock IndexedDB
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
      const k = val.key || val.id;
      tables[table].set(k, JSON.parse(JSON.stringify(val)));
      return k;
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
          put: async (v) => {
            const k = v.key || v.id || `${v.volumeId}_${v.index}`;
            tables[name]?.set(k, v);
            return k;
          },
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
  const user = { id: 'test-user-sync-fixes-1234', email: 'user@test.com' };
  const db = {
    comic_series: [],
    comic_volumes: [],
  };

  const client = {
    _db: db,
    _user: user,
    _presignCalls: [],
    _supabaseUpdateCalls: [],
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      getSession: async () => ({ data: { session: { user } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    functions: {
      invoke: async (name, options = {}) => {
        const body = options?.body || {};
        client._presignCalls.push(body);

        if (name === 'comic-presign' && (body.action === 'get' || body.action === 'put')) {
          const pageList = body.pages || [];
          const totalOps = pageList.length + (body.cover ? 1 : 0);
          if (totalOps > 100) {
            return {
              data: null,
              error: {
                message: `Số lượng URL tối đa mỗi lần là 100 (đang yêu cầu ${totalOps})`,
                code: 'BATCH_SIZE_EXCEEDED',
              },
            };
          }

          const urls = {};
          pageList.forEach((p) => {
            urls[p] = `https://mock-r2.cloud/${body.volumeId}/${p}.webp?signed=true`;
          });

          return {
            data: {
              urls,
              coverUrl: body.cover ? `https://mock-r2.cloud/${body.volumeId}/cover.webp?signed=true` : null,
            },
            error: null,
          };
        }

        return { data: { success: true }, error: null };
      },
    },
    from: (table) => {
      const rows = client._db[table] || [];
      let filters = [];
      let updatePayload = null;
      let isDelete = false;

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
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          const filtered = rows.filter((r) => filters.every((f) => f(r)));
          return { data: filtered[0] || null, error: null };
        },
        single: async () => {
          const filtered = rows.filter((r) => filters.every((f) => f(r)));
          return { data: filtered[0] || null, error: filtered[0] ? null : { message: 'Not found' } };
        },
        update: (payload) => {
          updatePayload = payload;
          client._supabaseUpdateCalls.push({ table, payload, filters: [...filters] });
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
            client._db[table] = rows.filter((r) => !filters.every((f) => f(r)));
            return Promise.resolve({ data: filtered, error: null }).then(onRes, onRej);
          }
          return Promise.resolve({ data: filtered, error: null }).then(onRes, onRej);
        },
      };
      return chain;
    },
  };

  return client;
}

const mockSupabase = createMockSupabase();

async function runAllTests() {
  console.log('=== BẮT ĐẦU TEST SỬA LỖI TẢI VỀ ≥100 TRANG & ĐỒNG BỘ ĐỔI TÊN ===\n');

  // =========================================================================
  // PHẦN 1: LỖI 1 - TẢI VỀ TẬP 100, 101, 199, 200, 201 TRANG
  // =========================================================================
  console.log('--- PHẦN 1: LỖI 1 - Tải về tập lớn (100, 101, 199, 200, 201 trang) ---');

  const pageCountsToTest = [100, 101, 199, 200, 201];

  for (const pageCount of pageCountsToTest) {
    const volId = `vol_test_${pageCount}`;
    const seriesId = `series_test_${pageCount}`;

    mockDB._tables.series.clear();
    mockDB._tables.volumes.clear();
    mockDB._tables.pages.clear();
    mockSupabase._presignCalls = [];
    localStorage.clear();

    // Setup Remote Series & Volume
    mockSupabase._db.comic_series = [
      {
        id: seriesId,
        user_id: mockSupabase._user.id,
        title: `Bộ Truyện ${pageCount} Trang`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
    ];

    mockSupabase._db.comic_volumes = [
      {
        id: volId,
        series_id: seriesId,
        user_id: mockSupabase._user.id,
        title: `Tập ${pageCount} Trang`,
        order_no: 1,
        page_count: pageCount,
        total_bytes: pageCount * 100000,
        quality: 'balanced',
        status: 'ready',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
    ];

    const mockFetch = async (url) => ({
      ok: true,
      status: 200,
      blob: async () => ({ size: 100000, type: 'image/webp' }),
    });

    const res = await downloadVolume(volId, {
      customSupabase: mockSupabase,
      customFetch: mockFetch,
    });

    assert.strictEqual(res.ok, true, `Tải về tập ${pageCount} trang phải thành công`);

    // 1. Kiểm tra không có lời gọi nào yêu cầu > 100 URL
    for (const call of mockSupabase._presignCalls) {
      const ops = (call.pages || []).length + (call.cover ? 1 : 0);
      assert.ok(
        ops <= 100,
        `Lời gọi presign cho tập ${pageCount} trang yêu cầu ${ops} URL > 100! (Payload: ${JSON.stringify(call)})`
      );
    }

    // 2. Kiểm tra bìa được tải đúng một lần
    const coverCalls = mockSupabase._presignCalls.filter((c) => c.cover === true);
    assert.strictEqual(coverCalls.length, 1, `Bìa phải được yêu cầu đúng 1 lần (thực tế: ${coverCalls.length})`);
    assert.deepStrictEqual(coverCalls[0].pages, [], 'Lời gọi bìa riêng phải có pages: []');

    // 3. Kiểm tra tất cả trang được lưu đủ vào IndexedDB
    const savedVol = await getVolume(volId);
    assert.ok(savedVol, `Volume ${volId} phải có trong IndexedDB`);
    assert.strictEqual(savedVol.importState, 'ready');
    assert.strictEqual(savedVol.pageMeta?.length, pageCount);

    for (let p = 0; p < pageCount; p++) {
      const pageItem = await getPage(volId, p);
      assert.ok(pageItem, `Trang ${p} của tập ${pageCount} trang phải được lưu đầy đủ`);
    }

    console.log(`  ✓ Tập ${pageCount} trang: tải về đủ ${pageCount} trang, ${mockSupabase._presignCalls.length} lần presign (tối đa <= 100 URL), bìa tải đúng 1 lần.`);
  }

  console.log('-> PASS: Phần 1 sửa lỗi 100+ trang thành công 100%!\n');

  // =========================================================================
  // PHẦN 2: LỖI 2 - ĐỒNG BỘ ĐỔI TÊN GIỮA CÁC THIẾT BỊ
  // =========================================================================
  console.log('--- PHẦN 2: LỖI 2 - Đồng bộ đổi tên (Volume order/title & Series title) ---');

  // --- Kịch bản 2.1: A đổi tên/số tập & tên bộ -> B (có bản local) tự nhận và sắp xếp lại ---
  console.log('[Test 2.1] Thiết bị A đổi tên tập, số tập, tên bộ -> Thiết bị B nhận và tự sắp xếp lại');
  {
    const dbA = createMockDB();
    const dbB = createMockDB();
    localStorage.clear();
    setTombstonesForTesting();

    const sId = 'series_sync_meta';
    const v1Id = 'vol_meta_01';
    const v2Id = 'vol_meta_02';

    // Dữ liệu ban đầu trên Supabase
    const t0 = new Date(Date.now() - 60000).toISOString();
    mockSupabase._db.comic_series = [
      { id: sId, user_id: mockSupabase._user.id, title: 'Tên Bộ Ban Đầu', created_at: t0, updated_at: t0, deleted_at: null },
    ];
    mockSupabase._db.comic_volumes = [
      { id: v1Id, series_id: sId, user_id: mockSupabase._user.id, title: 'Tập 1 Cũ', order_no: 1, status: 'ready', created_at: t0, updated_at: t0, deleted_at: null },
      { id: v2Id, series_id: sId, user_id: mockSupabase._user.id, title: 'Tập 2 Cũ', order_no: 2, status: 'ready', created_at: t0, updated_at: t0, deleted_at: null },
    ];

    // Cả A và B đều có bản sao local ban đầu
    for (const db of [dbA, dbB]) {
      setComicDBForTesting(db);
      await saveSeries({ id: sId, title: 'Tên Bộ Ban Đầu', metaUpdatedAt: 1000 });
      await saveVolume({ id: v1Id, seriesId: sId, title: 'Tập 1 Cũ', order: 1, importState: 'ready', metaUpdatedAt: 1000 });
      await saveVolume({ id: v2Id, seriesId: sId, title: 'Tập 2 Cũ', order: 2, importState: 'ready', metaUpdatedAt: 1000 });
    }

    // Thiết bị A thực hiện đổi:
    // - Tập 1 đổi thành order: 5, title: 'Tập 5 Mới'
    // - Bộ truyện đổi thành title: 'Bộ Truyện Siêu Cấp A'
    setComicDBForTesting(dbA);
    lastRealtimeSignal = null;

    await updateVolumeMetadata(v1Id, { order: 5, title: 'Tập 5 Mới' }, { customSupabase: mockSupabase });
    await updateSeriesMetadata(sId, { title: 'Bộ Truyện Siêu Cấp A' }, { customSupabase: mockSupabase });

    // Xác nhận trên Supabase đã cập nhật
    const remVol1 = mockSupabase._db.comic_volumes.find((v) => v.id === v1Id);
    assert.strictEqual(remVol1.order_no, 5);
    assert.strictEqual(remVol1.title, 'Tập 5 Mới');

    const remSeries = mockSupabase._db.comic_series.find((s) => s.id === sId);
    assert.strictEqual(remSeries.title, 'Bộ Truyện Siêu Cấp A');

    // Thiết bị B gọi listRemote() (mô phỏng nhận realtime signal hoặc focus/poll)
    setComicDBForTesting(dbB);
    await listRemote({ customSupabase: mockSupabase });

    // Kiểm tra trên B:
    const bSeries = await getSeries(sId);
    assert.strictEqual(bSeries.title, 'Bộ Truyện Siêu Cấp A', 'Thiết bị B phải nhận tên bộ truyện mới');

    const bVol1 = await getVolume(v1Id);
    assert.strictEqual(bVol1.order, 5, 'Thiết bị B phải nhận số tập mới (5)');
    assert.strictEqual(bVol1.title, 'Tập 5 Mới', 'Thiết bị B phải nhận tên tập mới');

    // Kiểm tra sắp xếp trên B: v2 (order 2) phải đứng trước v1 (order 5)
    const bVolumes = await getVolumes(sId, true);
    assert.strictEqual(bVolumes[0].id, v2Id, 'Tập 2 (order 2) phải đứng trước');
    assert.strictEqual(bVolumes[1].id, v1Id, 'Tập 1 (giờ là order 5) phải đứng sau');

    console.log('  -> PASS: Test 2.1 thành công: B tự động kéo tên/số mới và sắp xếp lại danh sách.\n');
  }

  // --- Kịch bản 2.2: Sửa offline rồi online đẩy lên và A nhận ---
  console.log('[Test 2.2] Thiết bị B sửa offline -> lưu pending -> online tự đẩy lên -> Thiết bị A nhận');
  {
    const dbA = createMockDB();
    const dbB = createMockDB();
    localStorage.clear();
    setTombstonesForTesting();

    const sId = 'series_offline_meta';
    const vId = 'vol_offline_01';

    const t0 = new Date(Date.now() - 60000).toISOString();
    mockSupabase._db.comic_series = [
      { id: sId, user_id: mockSupabase._user.id, title: 'Tên Gốc', created_at: t0, updated_at: t0, deleted_at: null },
    ];
    mockSupabase._db.comic_volumes = [
      { id: vId, series_id: sId, user_id: mockSupabase._user.id, title: 'Tập Gốc', order_no: 1, status: 'ready', created_at: t0, updated_at: t0, deleted_at: null },
    ];

    for (const db of [dbA, dbB]) {
      setComicDBForTesting(db);
      await saveSeries({ id: sId, title: 'Tên Gốc', metaUpdatedAt: 1000 });
      await saveVolume({ id: vId, seriesId: sId, title: 'Tập Gốc', order: 1, importState: 'ready', metaUpdatedAt: 1000 });
    }

    // Thiết bị B mất mạng
    isOnline = false;
    setComicDBForTesting(dbB);

    await updateVolumeMetadata(vId, { order: 9, title: 'Tập Đổi Offline' }, { customSupabase: mockSupabase });
    await updateSeriesMetadata(sId, { title: 'Bộ Đổi Offline' }, { customSupabase: mockSupabase });

    // Xác nhận đã lưu pending trong localStorage của B
    assert.ok(localStorage.getItem(`tcl_comic_meta_pending_${vId}`), 'Phải có pending volume');
    assert.ok(localStorage.getItem(`tcl_comic_meta_pending_${sId}`), 'Phải có pending series');

    // Xác nhận bản local của B đã đổi
    const bVolOffline = await getVolume(vId);
    assert.strictEqual(bVolOffline.title, 'Tập Đổi Offline');
    assert.strictEqual(bVolOffline.order, 9);

    // B gọi listRemote() trong lúc offline: bản sửa local KHÔNG được bị ghi đè!
    await listRemote({ customSupabase: mockSupabase });
    const bVolStillOffline = await getVolume(vId);
    assert.strictEqual(bVolStillOffline.title, 'Tập Đổi Offline', 'Pending edit không được bị ghi đè khi pull');

    // Giờ Thiết bị B có mạng trở lại
    isOnline = true;

    // B gọi listRemote() (hoặc flushPendingMetadata): tự động đẩy lên Supabase
    await listRemote({ customSupabase: mockSupabase });

    // Xác nhận localStorage đã dọn sạch pending
    assert.strictEqual(localStorage.getItem(`tcl_comic_meta_pending_${vId}`), null, 'Pending volume phải được xóa');
    assert.strictEqual(localStorage.getItem(`tcl_comic_meta_pending_${sId}`), null, 'Pending series phải được xóa');

    // Xác nhận trên Supabase đã nhận bản sửa từ B
    const remVol = mockSupabase._db.comic_volumes.find((v) => v.id === vId);
    assert.strictEqual(remVol.title, 'Tập Đổi Offline');
    assert.strictEqual(remVol.order_no, 9);

    // Thiết bị A gọi listRemote(): A nhận được bản sửa của B
    setComicDBForTesting(dbA);
    await listRemote({ customSupabase: mockSupabase });

    const aVol = await getVolume(vId);
    assert.strictEqual(aVol.title, 'Tập Đổi Offline', 'Thiết bị A phải nhận được tên tập B sửa offline');
    assert.strictEqual(aVol.order, 9, 'Thiết bị A phải nhận được số tập B sửa offline');

    const aSeries = await getSeries(sId);
    assert.strictEqual(aSeries.title, 'Bộ Đổi Offline', 'Thiết bị A phải nhận được tên bộ B sửa offline');

    console.log('  -> PASS: Test 2.2 thành công: sửa offline lưu pending, khi online tự đẩy và thiết bị khác nhận.\n');
  }

  // --- Kịch bản 2.3: Sửa đồng thời hai bên theo Last-Write-Wins ---
  console.log('[Test 2.3] Sửa đồng thời hai bên: phân định bằng Last-Write-Wins theo updated_at');
  {
    const dbA = createMockDB();
    const dbB = createMockDB();
    localStorage.clear();
    setTombstonesForTesting();

    const sId = 'series_lww';
    const vId = 'vol_lww_01';

    // A sửa tại T = 1000000000
    // B sửa tại T = 2000000000 (muộn hơn A)
    const timeA = 1000000000;
    const timeB = 2000000000;

    mockSupabase._db.comic_series = [
      { id: sId, user_id: mockSupabase._user.id, title: 'Bản Sửa Của B (Muộn Hơn)', created_at: new Date(timeB).toISOString(), updated_at: new Date(timeB).toISOString(), deleted_at: null },
    ];
    mockSupabase._db.comic_volumes = [
      { id: vId, series_id: sId, user_id: mockSupabase._user.id, title: 'Tập B (Muộn Hơn)', order_no: 2, status: 'ready', created_at: new Date(timeB).toISOString(), updated_at: new Date(timeB).toISOString(), deleted_at: null },
    ];

    // Máy A đang có bản sửa sớm hơn (T = timeA)
    setComicDBForTesting(dbA);
    await saveSeries({ id: sId, title: 'Bản Sửa Của A (Sớm Hơn)', metaUpdatedAt: timeA });
    await saveVolume({ id: vId, seriesId: sId, title: 'Tập A (Sớm Hơn)', order: 1, importState: 'ready', metaUpdatedAt: timeA });

    // A gọi listRemote(): thấy remote có timeB > timeA -> phải áp dụng bản sửa của B
    await listRemote({ customSupabase: mockSupabase });

    const aVol = await getVolume(vId);
    assert.strictEqual(aVol.title, 'Tập B (Muộn Hơn)', 'Bản sửa mới hơn (timeB) phải thắng');
    assert.strictEqual(aVol.order, 2);

    const aSeries = await getSeries(sId);
    assert.strictEqual(aSeries.title, 'Bản Sửa Của B (Muộn Hơn)');

    console.log('  -> PASS: Test 2.3 thành công: Last-Write-Wins phân định chính xác theo mốc thời gian.\n');
  }

  // --- Kịch bản 2.4: Không phát sinh vòng lặp đồng bộ ---
  console.log('[Test 2.4] Không phát sinh vòng lặp đồng bộ (A đẩy -> B kéo -> B không đẩy lại)');
  {
    const dbB = createMockDB();
    localStorage.clear();
    setTombstonesForTesting();

    const sId = 'series_no_loop';
    const vId = 'vol_no_loop_01';

    const t0 = new Date().toISOString();
    mockSupabase._db.comic_series = [
      { id: sId, user_id: mockSupabase._user.id, title: 'Tên A Đã Đổi', created_at: t0, updated_at: t0, deleted_at: null },
    ];
    mockSupabase._db.comic_volumes = [
      { id: vId, series_id: sId, user_id: mockSupabase._user.id, title: 'Tập A Đã Đổi', order_no: 3, status: 'ready', created_at: t0, updated_at: t0, deleted_at: null },
    ];

    setComicDBForTesting(dbB);
    await saveSeries({ id: sId, title: 'Tên Cũ B', metaUpdatedAt: 100 });
    await saveVolume({ id: vId, seriesId: sId, title: 'Tập Cũ B', order: 1, importState: 'ready', metaUpdatedAt: 100 });

    // Theo dõi số lần Supabase update được gọi trong suốt quá trình B kéo
    mockSupabase._supabaseUpdateCalls = [];

    // B gọi listRemote() để kéo dữ liệu
    await listRemote({ customSupabase: mockSupabase });

    // Kiểm tra: B kéo thành công vào local
    const bVol = await getVolume(vId);
    assert.strictEqual(bVol.title, 'Tập A Đã Đổi');
    assert.strictEqual(bVol.order, 3);

    // TUYỆT ĐỐI không có cuộc gọi update nào ngược lên Supabase từ B
    const pushBackCalls = mockSupabase._supabaseUpdateCalls.filter(
      (c) => c.table === 'comic_volumes' || c.table === 'comic_series'
    );
    assert.strictEqual(pushBackCalls.length, 0, 'Thiết bị B kéo về KHÔNG ĐƯỢC phép đẩy ngược lên Supabase!');

    console.log('  -> PASS: Test 2.4 thành công: không phát sinh vòng lặp đồng bộ.\n');
  }

  console.log('========================================================');
  console.log('TẤT CẢ CÁC BÀI TEST TẢI VỀ ≥100 TRANG & ĐỒNG BỘ ĐỔI TÊN ĐÃ ĐẠT 100%!');
  console.log('========================================================\n');
  process.exit(0);
}

runAllTests().catch((err) => {
  console.error('TEST THẤT BẠI:', err);
  process.exit(1);
});
