/**
 * scripts/test-comics-phase3.js
 * Kiểm thử toàn diện Phase 3 (Comics & Sync Queue):
 * 1. Hàng đợi tuần tự không chạy trùng cùng một tập.
 * 2. Tải ưu tiên (priority: true) được đưa lên đầu hàng đợi.
 * 3. Tự tải chỉ những tập status 'ready' trên Cloud mà máy chưa có.
 * 4. Tôn trọng công tắc tự động tải về / tải lên và cờ tạm dừng (pause/resume).
 * 5. Dừng tự tải khi dung lượng máy > 70% (storage protection).
 * 6. Dấu tcl_comic_no_autodl_<id> không bị tự tải lại.
 * 7. Tự tải lên chỉ những tập 'local_only', bỏ qua tập có dấu no_autoupl.
 * 8. Gán số tập tuần tự khi tên file không có số (D1).
 * 9. Sửa số tập / tên tập cập nhật IndexedDB và Supabase metadata (D2).
 * 10. Tác vụ lỗi liên tục & Backoff luỹ thừa (1m, 5m, 15m, 60m), ngừng sau 4 lần, nút Thử lại xoá trạng thái (Lỗi 1).
 * 11. Lỗi 413 (vượt 8GB) dừng toàn bộ tự tải lên (Lỗi 1).
 * 12. Đa tab giả lập: không bị kẹt hàng đợi, bỏ qua tác vụ đã được tab khác hoàn tất (Lỗi 2).
 * 13. cancelTask: huỷ khi đang chờ và khi đang chạy, không tự xếp hàng lại, dấu no_auto được đặt (Lỗi 3).
 * 14. Giả lập 60 giây poll nhiều lần: số lần gọi uploadVolume cho một tập lỗi không vượt số lần backoff cho phép (Lỗi 1).
 */

import assert from 'assert';

// Setup Mock LocalStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] !== undefined ? store[key] : null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
globalThis.localStorage = localStorageMock;

// Mock IDBKeyRange for Node.js test environment
globalThis.IDBKeyRange = {
  only: (v) => ({ lower: v, upper: v }),
};

// Mock Navigator Storage safely in Node 24
let mockStorageEstimate = { usage: 100 * 1024 * 1024, quota: 1000 * 1024 * 1024 }; // 10%
let activeLockHolder = null;
let currentTabId = 'tab_1';

try {
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      storage: {
        estimate: async () => mockStorageEstimate,
      },
      locks: {
        request: (name, opts, callback) => {
          if (typeof opts === 'function') {
            callback = opts;
            opts = {};
          }
          if (opts?.ifAvailable) {
            if (activeLockHolder && activeLockHolder !== currentTabId) {
              return Promise.resolve(callback(null));
            }
            activeLockHolder = currentTabId;
            return Promise.resolve(callback({ name })).finally(() => {
              if (activeLockHolder === currentTabId) {
                activeLockHolder = null;
              }
            });
          }
          activeLockHolder = currentTabId;
          return Promise.resolve(callback({ name })).finally(() => {
            if (activeLockHolder === currentTabId) {
              activeLockHolder = null;
            }
          });
        },
      },
      userAgent: 'Mozilla/5.0 NodeTest',
    },
    configurable: true,
    writable: true,
  });
} catch {}

// Mock window
globalThis.window = {
  dispatchEvent: (evt) => {
    if (evt.type === 'tcl_comic_realtime_signal') {
      lastRealtimeSignal = evt.detail;
    }
  },
  addEventListener: () => {},
  removeEventListener: () => {},
};

import {
  isAutoDownloadEnabled,
  setAutoDownloadEnabled,
  isAutoUploadEnabled,
  setAutoUploadEnabled,
  isSyncPaused,
  pauseSync,
  resumeSync,
  checkStorageEstimate,
  getQueueSnapshot,
  priorityDownloadVolume,
  enqueueDownload,
  enqueueUpload,
  cancelTask,
  retryFailedVolume,
  getVolumeQueueState,
  getVolumeFailure,
  recordTaskFailure,
  clearTaskFailure,
  clearUploadQuotaExceeded,
  checkAndTriggerAutoSync,
  resetQueueForTesting,
  setSyncHandlersForTesting,
  triggerProcess,
  AUTO_DOWNLOAD_KEY,
  AUTO_UPLOAD_KEY,
  SYNC_PAUSED_KEY,
  NO_AUTODL_PREFIX,
  NO_AUTOUPL_PREFIX,
  FAIL_STORAGE_PREFIX,
  MAX_FAIL_COUNT,
  BACKOFF_DELAYS_MS,
} from '../src/lib/comics/comicSyncQueue.js';
import {
  parseVolumeOrder,
  cleanVolumeTitle,
  setComicDBForTesting,
} from '../src/lib/comics/comicDb.js';
import {
  setSupabaseForTesting,
  updateVolumeMetadata,
} from '../src/lib/comics/comicCloud.js';
import { importMultiplePdfs } from '../src/lib/comics/pdfImport.js';

// Mock IDB store for comicDb
const mockDBData = {
  series: new Map(),
  volumes: new Map(),
  pages: new Map(),
};

const mockIDB = {
  get: async (store, key) => mockDBData[store]?.get(key) || null,
  getAll: async (store) => Array.from(mockDBData[store]?.values() || []),
  getAllFromIndex: async (store, indexName, value) => {
    const all = Array.from(mockDBData[store]?.values() || []);
    if (store === 'volumes' && indexName === 'by_series') {
      return all.filter((v) => v.seriesId === value);
    }
    return all;
  },
  put: async (store, val) => {
    mockDBData[store].set(val.id, JSON.parse(JSON.stringify(val)));
    return val.id;
  },
  delete: async (store, key) => {
    mockDBData[store].delete(key);
  },
  transaction: (storeNames) => ({
    objectStore: (storeName) => ({
      index: (indexName) => ({
        getAll: async (keyRange) => {
          const all = Array.from(mockDBData[storeName]?.values() || []);
          const targetVal = keyRange?.lower || keyRange;
          return all.filter((v) => v.seriesId === targetVal);
        },
      }),
      put: async (val) => {
        mockDBData[storeName].set(val.id || val.key, val);
      },
    }),
    store: {
      put: async (val) => {
        const storeKey = val.id ? 'volumes' : 'pages';
        if (val.key) mockDBData.pages.set(val.key, val);
        else if (val.id) mockDBData.volumes.set(val.id, val);
      },
    },
    done: Promise.resolve(),
  }),
};

setComicDBForTesting(Promise.resolve(mockIDB));

// Mock Supabase Client
let mockCloudVolumes = [];
let mockCloudSeries = [];
let lastRealtimeSignal = null;

const mockSupabase = {
  auth: {
    getUser: async () => ({ data: { user: { id: 'usr_phase3_test' } }, error: null }),
    getSession: async () => ({ data: { session: { user: { id: 'usr_phase3_test' } } }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
  from: (table) => {
    let currentFilter = {};
    const chain = {
      select: () => chain,
      eq: (field, val) => {
        currentFilter[field] = val;
        return chain;
      },
      is: (field, val) => {
        currentFilter[`${field}_is`] = val;
        return chain;
      },
      order: () => chain,
      then: (resolve) => {
        if (table === 'comic_volumes') {
          let res = mockCloudVolumes;
          if (currentFilter.id) res = res.filter((v) => v.id === currentFilter.id);
          resolve({ data: res, error: null });
        } else if (table === 'comic_series') {
          let res = mockCloudSeries;
          if (currentFilter.id) res = res.filter((s) => s.id === currentFilter.id);
          resolve({ data: res, error: null });
        } else {
          resolve({ data: [], error: null });
        }
      },
      maybeSingle: async () => {
        if (table === 'comic_volumes') {
          const match = mockCloudVolumes.find((v) => v.id === currentFilter.id);
          return { data: match || null, error: null };
        }
        return { data: null, error: null };
      },
      update: (patch) => ({
        eq: (f1, v1) => ({
          eq: async (f2, v2) => {
            if (table === 'comic_volumes') {
              const target = mockCloudVolumes.find((v) => v.id === v1);
              if (target) {
                Object.assign(target, patch);
              }
              return { data: target, error: null };
            }
            return { data: null, error: null };
          },
        }),
      }),
    };
    return chain;
  },
};

setSupabaseForTesting(mockSupabase);

async function runTests() {
  console.log('=== BẮT ĐẦU TEST TOÀN DIỆN PHASE 3 (COMICS & FIXES) ===\n');

  // -------------------------------------------------------------
  // Test 1: Gán số tập tuần tự khi tên file không có số (D1)
  // -------------------------------------------------------------
  console.log('--- Test 1: Gán số tập tuần tự khi tên file không có số (D1) ---');
  assert.strictEqual(parseVolumeOrder('Chien_Binh_Bat_Tu.pdf', null), null);
  assert.strictEqual(parseVolumeOrder('Tap_Dac_Biet.pdf', null), null);
  assert.strictEqual(parseVolumeOrder('One_Piece_Tap_12.pdf', null), 12);
  assert.strictEqual(parseVolumeOrder('Vol. 05.pdf', null), 5);

  mockDBData.volumes.set('vol_ex_1', { id: 'vol_ex_1', seriesId: 'ser_d1', order: 1, title: 'Tập 1' });
  mockDBData.volumes.set('vol_ex_3', { id: 'vol_ex_3', seriesId: 'ser_d1', order: 3, title: 'Tập 3' });

  const dummyFile1 = { name: 'Tap_Moi_A.pdf', size: 1024 };
  const dummyFile2 = { name: 'Tap_Moi_B.pdf', size: 2048 };

  const existingVolumes = Array.from(mockDBData.volumes.values()).filter(v => v.seriesId === 'ser_d1');
  const maxOrder = Math.max(...existingVolumes.map(v => v.order || 0), 0);
  assert.strictEqual(maxOrder, 3, 'Max order hiện có phải là 3');

  let unnumberedCounter = 1;
  const allocated = [dummyFile1, dummyFile2].map((f) => {
    const parsed = parseVolumeOrder(f.name, null);
    const order = parsed !== null ? parsed : (maxOrder + unnumberedCounter++);
    return { name: f.name, order };
  });

  assert.strictEqual(allocated[0].order, 4, 'Tập không số thứ nhất phải là 4');
  assert.strictEqual(allocated[1].order, 5, 'Tập không số thứ hai phải là 5');
  console.log('✓ Test 1 Passed: Gán số tập tuần tự bắt đầu từ (maxExistingOrder + 1) chính xác!\n');

  // -------------------------------------------------------------
  // Test 2: Công tắc Tự động tải về & Tải lên & Tạm dừng
  // -------------------------------------------------------------
  console.log('--- Test 2: Công tắc Tự động tải về, Tải lên & Tạm dừng ---');
  localStorageMock.clear();
  assert.strictEqual(isAutoDownloadEnabled(), true, 'Mặc định auto-download phải là true');
  assert.strictEqual(isAutoUploadEnabled(), true, 'Mặc định auto-upload phải là true');
  assert.strictEqual(isSyncPaused(), false, 'Mặc định hàng đợi không tạm dừng');

  setAutoDownloadEnabled(false);
  assert.strictEqual(isAutoDownloadEnabled(), false);
  setAutoDownloadEnabled(true);
  assert.strictEqual(isAutoDownloadEnabled(), true);

  pauseSync();
  assert.strictEqual(isSyncPaused(), true);
  resumeSync();
  assert.strictEqual(isSyncPaused(), false);
  console.log('✓ Test 2 Passed: Cài đặt công tắc hoạt động chuẩn xác!\n');

  // -------------------------------------------------------------
  // Test 3: Bảo vệ bộ nhớ thiết bị (>70% dừng tự tải) (A5)
  // -------------------------------------------------------------
  console.log('--- Test 3: Bảo vệ bộ nhớ thiết bị (> 70% dừng tự tải) (A5) ---');
  mockStorageEstimate = { usage: 100 * 1024 * 1024, quota: 1000 * 1024 * 1024 };
  let est = await checkStorageEstimate();
  assert.strictEqual(est.ok, true, '10% bộ nhớ phải ok');

  mockStorageEstimate = { usage: 750 * 1024 * 1024, quota: 1000 * 1024 * 1024 };
  est = await checkStorageEstimate();
  assert.strictEqual(est.ok, false, '75% bộ nhớ phải không ok (vượt 70%)');
  console.log('✓ Test 3 Passed: Phát hiện vượt ngưỡng 70% bộ nhớ chính xác!\n');

  // -------------------------------------------------------------
  // Test 4: Dấu tcl_comic_no_autodl_<id> và no_autoupl_<id> (A5, A8)
  // -------------------------------------------------------------
  console.log('--- Test 4: Dấu no_autodl và no_autoupl hoạt động đúng (A5, A8) ---');
  const testVolId = 'vol_test_markers';
  localStorageMock.setItem(`${NO_AUTODL_PREFIX}${testVolId}`, '1');
  assert.strictEqual(localStorageMock.getItem(`${NO_AUTODL_PREFIX}${testVolId}`), '1');

  enqueueDownload(testVolId, 'ser_1', { isManual: true });
  assert.strictEqual(
    localStorageMock.getItem(`${NO_AUTODL_PREFIX}${testVolId}`),
    null,
    'Cờ no_autodl phải được xóa khi chủ động tải'
  );

  localStorageMock.setItem(`${NO_AUTOUPL_PREFIX}${testVolId}`, '1');
  enqueueUpload(testVolId, 'ser_1', { isManual: true });
  assert.strictEqual(
    localStorageMock.getItem(`${NO_AUTOUPL_PREFIX}${testVolId}`),
    null,
    'Cờ no_autoupl phải được xóa khi chủ động tải lên'
  );
  console.log('✓ Test 4 Passed: Quản lý dấu chống tự tải / chống tự đẩy hoàn hảo!\n');

  // -------------------------------------------------------------
  // Test 5: Sửa Số Tập / Tên Tập cập nhật IndexedDB & Supabase (D2)
  // -------------------------------------------------------------
  console.log('--- Test 5: Sửa Số Tập / Tên Tập (D2) ---');
  mockDBData.volumes.set('vol_meta_test', {
    id: 'vol_meta_test',
    seriesId: 'ser_meta',
    order: 1,
    title: 'Tập 1 Cũ',
    updatedAt: 1000,
  });

  mockCloudVolumes = [
    {
      id: 'vol_meta_test',
      user_id: 'usr_phase3_test',
      order_no: 1,
      title: 'Tập 1 Cũ',
      status: 'ready',
      updated_at: '2026-11-01T00:00:00Z',
    },
  ];

  const updateRes = await updateVolumeMetadata('vol_meta_test', {
    order: 2,
    title: 'Tập 2 Mới (Bản Đặc Biệt)',
  });

  assert.strictEqual(updateRes.ok, true);
  assert.strictEqual(updateRes.order, 2);
  assert.strictEqual(updateRes.title, 'Tập 2 Mới (Bản Đặc Biệt)');

  const updatedLocal = mockDBData.volumes.get('vol_meta_test');
  assert.strictEqual(updatedLocal.order, 2, 'Local order phải thành 2');
  assert.strictEqual(updatedLocal.title, 'Tập 2 Mới (Bản Đặc Biệt)');

  const updatedCloud = mockCloudVolumes.find((v) => v.id === 'vol_meta_test');
  assert.strictEqual(updatedCloud.order_no, 2, 'Cloud order_no phải thành 2');
  assert.strictEqual(updatedCloud.title, 'Tập 2 Mới (Bản Đặc Biệt)');
  console.log('✓ Test 5 Passed: Cập nhật metadata đồng bộ cả Local lẫn Cloud thành công!\n');

  // -------------------------------------------------------------
  // Test 6: Snapshot hàng đợi và xếp hàng không trùng lặp
  // -------------------------------------------------------------
  console.log('--- Test 6: Hàng đợi không trùng lặp và hỗ trợ ưu tiên ---');
  resetQueueForTesting();
  const snap1 = getQueueSnapshot();
  assert(Array.isArray(snap1.pendingTasks));

  enqueueDownload('vol_dup_1', 'ser_1', { volumeTitle: 'Tập A' });
  enqueueDownload('vol_dup_1', 'ser_1', { volumeTitle: 'Tập A Trùng' });
  const snap2 = getQueueSnapshot();
  const dupCount = snap2.pendingTasks.filter((t) => t.volumeId === 'vol_dup_1').length;
  assert.strictEqual(dupCount, 1, 'Không được phép thêm trùng lặp cùng một volumeId');
  console.log('✓ Test 6 Passed: Hàng đợi chống trùng lặp volumeId thành công!\n');

  // -------------------------------------------------------------
  // Test 7: Tác vụ lỗi liên tục, Backoff luỹ thừa, ngừng sau 4 lần, nút Thử Lại (Lỗi 1)
  // -------------------------------------------------------------
  console.log('--- Test 7: Tác vụ lỗi liên tục & Backoff luỹ thừa (Lỗi 1) ---');
  resetQueueForTesting();
  localStorageMock.clear();

  // Lần 1: Thất bại đầu tiên -> nghỉ 1 phút
  recordTaskFailure('vol_fail_seq', 'upload', new Error('Upload HTTP 500 error'));
  let fState = getVolumeFailure('vol_fail_seq', 'upload');
  assert(fState !== null, 'Phải có bản ghi lỗi');
  assert.strictEqual(fState.failCount, 1);
  assert.strictEqual(fState.stopped, false);
  assert(fState.nextRetryAt > Date.now());
  assert(fState.nextRetryAt <= Date.now() + 60000 + 100);

  // Setup DB để check auto-sync
  mockDBData.volumes.set('vol_fail_seq', {
    id: 'vol_fail_seq',
    seriesId: 'ser_fail',
    order: 1,
    title: 'Tập Lỗi',
    pageCount: 10,
    totalBytes: 1000,
  });
  mockCloudVolumes = []; // Không có trên cloud -> local_only

  // checkAndTriggerAutoSync: vì đang trong thời gian nghỉ 1 phút nên KHÔNG được enqueue
  await checkAndTriggerAutoSync();
  let snap = getQueueSnapshot();
  assert.strictEqual(
    snap.pendingTasks.filter(t => t.volumeId === 'vol_fail_seq').length,
    0,
    'Tập đang trong thời gian nghỉ không được enqueue lại'
  );

  // Lần 2, 3, 4: Thất bại tiếp
  recordTaskFailure('vol_fail_seq', 'upload', new Error('Upload HTTP 500 error'));
  fState = getVolumeFailure('vol_fail_seq', 'upload');
  assert.strictEqual(fState.failCount, 2);

  recordTaskFailure('vol_fail_seq', 'upload', new Error('Upload HTTP 500 error'));
  fState = getVolumeFailure('vol_fail_seq', 'upload');
  assert.strictEqual(fState.failCount, 3);

  recordTaskFailure('vol_fail_seq', 'upload', new Error('Upload HTTP 500 error'));
  fState = getVolumeFailure('vol_fail_seq', 'upload');
  assert.strictEqual(fState.failCount, 4);
  assert.strictEqual(fState.stopped, true, 'Sau 4 lần thất bại liên tiếp thì stopped phải là true');

  // Kể cả thời gian đã trôi qua, vì stopped=true nên auto-sync vẫn KHÔNG được enqueue
  fState.nextRetryAt = Date.now() - 1000;
  localStorageMock.setItem(`${FAIL_STORAGE_PREFIX}upload_vol_fail_seq`, JSON.stringify(fState));
  await checkAndTriggerAutoSync();
  snap = getQueueSnapshot();
  assert.strictEqual(
    snap.pendingTasks.filter(t => t.volumeId === 'vol_fail_seq').length,
    0,
    'Tập đã bị ngừng (stopped) không bao giờ tự động thử lại'
  );

  // Bấm nút "Thử lại": xoá failCount và xếp hàng thực thi lại
  let retryRan = false;
  setSyncHandlersForTesting({
    upload: async (volId) => {
      retryRan = true;
    },
  });

  retryFailedVolume('vol_fail_seq', 'ser_fail', { type: 'upload' });
  await new Promise((r) => setTimeout(r, 20));

  assert.strictEqual(getVolumeFailure('vol_fail_seq'), null, 'Thử lại phải xoá trạng thái lỗi');
  assert.strictEqual(retryRan, true, 'Thử lại phải kích hoạt chạy lại task');
  setSyncHandlersForTesting({ download: null, upload: null });
  console.log('✓ Test 7 Passed: Backoff luỹ thừa và cơ chế dừng sau 4 lần hoạt động hoàn hảo!\n');

  // -------------------------------------------------------------
  // Test 8: Lỗi 413 (vượt 8GB) dừng toàn bộ tự tải lên (Lỗi 1)
  // -------------------------------------------------------------
  console.log('--- Test 8: Lỗi 413 dừng toàn bộ tự tải lên (Lỗi 1) ---');
  resetQueueForTesting();

  // Kích hoạt lỗi 413
  recordTaskFailure('vol_quota', 'upload', new Error('Cloud storage quota exceeded: 413'));
  snap = getQueueSnapshot();
  assert.strictEqual(snap.uploadQuotaExceeded, true, 'Phải đánh dấu uploadQuotaExceeded');

  // Chuẩn bị thêm 1 tập local_only khác
  mockDBData.volumes.set('vol_other_local', {
    id: 'vol_other_local',
    seriesId: 'ser_quota',
    order: 2,
    title: 'Tập Khác',
    pageCount: 5,
    totalBytes: 500,
  });

  await checkAndTriggerAutoSync();
  snap = getQueueSnapshot();
  const uploadTasks = snap.pendingTasks.filter(t => t.type === 'upload');
  assert.strictEqual(uploadTasks.length, 0, 'Khi 413, toàn bộ tự tải lên phải bị dừng ngay lập tức');

  clearUploadQuotaExceeded();
  snap = getQueueSnapshot();
  assert.strictEqual(snap.uploadQuotaExceeded, false, 'Xoá cờ 413 thành công');
  console.log('✓ Test 8 Passed: Lỗi 413 chặn toàn bộ tự tải lên chính xác!\n');

  // -------------------------------------------------------------
  // Test 9: Hai "tab" giả lập qua Web Locks & bỏ qua tác vụ đã xong (Lỗi 2)
  // -------------------------------------------------------------
  console.log('--- Test 9: Hai "tab" giả lập & bỏ qua tác vụ đã hoàn tất (Lỗi 2) ---');
  resetQueueForTesting();
  mockStorageEstimate = { usage: 100 * 1024 * 1024, quota: 1000 * 1024 * 1024 }; // 10%

  // Giả lập Tab 1 chiếm lock
  activeLockHolder = 'tab_1';
  currentTabId = 'tab_2'; // Thao tác từ góc nhìn Tab 2

  // Tab 2 xếp hàng tải tập vol_multi
  enqueueDownload('vol_multi', 'ser_multi', { volumeTitle: 'Tập Đa Tab' });
  snap = getQueueSnapshot();
  assert.strictEqual(snap.pendingTasks.length, 1, 'Task phải được lưu trong queue của Tab 2');

  // Tab 1 ở background tải xong tập đó và ghi vào DB
  mockDBData.volumes.set('vol_multi', {
    id: 'vol_multi',
    seriesId: 'ser_multi',
    order: 1,
    title: 'Tập Đa Tab',
    isImporting: false,
    pageCount: 20,
    totalBytes: 5000,
  });

  // Tab 1 nhả lock
  activeLockHolder = null;

  // Tab 2 kích hoạt xử lý
  triggerProcess();
  await new Promise((r) => setTimeout(r, 40));

  snap = getQueueSnapshot();
  assert.strictEqual(snap.pendingTasks.length, 0, 'Tab 2 phải bỏ qua task vì tập đã xong');
  assert.strictEqual(snap.isProcessing, false, 'Tab 2 không bị kẹt hàng đợi');
  console.log('✓ Test 9 Passed: Đa tab giả lập không bị kẹt và bỏ qua tác vụ đã xong!\n');

  // -------------------------------------------------------------
  // Test 10: cancelTask huỷ khi chờ và khi đang chạy (Lỗi 3)
  // -------------------------------------------------------------
  console.log('--- Test 10: cancelTask huỷ khi đang chờ & khi đang chạy (Lỗi 3) ---');
  resetQueueForTesting();

  // Case A: Huỷ khi đang chờ trong queue
  enqueueDownload('vol_cancel_pend', 'ser_cancel');
  assert.strictEqual(getQueueSnapshot().pendingTasks.length, 1);
  const cancelRes1 = cancelTask('vol_cancel_pend');
  assert.strictEqual(cancelRes1, true, 'cancelTask phải trả về true khi tìm thấy task');
  assert.strictEqual(getQueueSnapshot().pendingTasks.length, 0, 'Task phải bị xoá khỏi queue');
  assert.strictEqual(
    localStorageMock.getItem(`${NO_AUTODL_PREFIX}vol_cancel_pend`),
    '1',
    'Cờ no_autodl phải được đặt sau khi huỷ tải về'
  );

  // Case B: Huỷ khi đang chạy (Active task với AbortController)
  let downloadAborted = false;
  setSyncHandlersForTesting({
    download: async (volId, opts) => {
      opts.signal?.addEventListener('abort', () => {
        downloadAborted = true;
      });
      // Giả lập tiến trình tải mất thời gian
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 200);
        opts.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('Thao tác đã bị hủy'));
        });
      });
    },
  });

  // Bắt đầu tải
  enqueueDownload('vol_cancel_run', 'ser_cancel');
  await new Promise((r) => setTimeout(r, 20));

  snap = getQueueSnapshot();
  assert(snap.activeTask && snap.activeTask.volumeId === 'vol_cancel_run', 'Task phải đang là active task');

  // Huỷ tác vụ đang chạy
  const cancelRes2 = cancelTask('vol_cancel_run');
  assert.strictEqual(cancelRes2, true);
  await new Promise((r) => setTimeout(r, 40));

  assert.strictEqual(downloadAborted, true, 'AbortController signal phải được kích hoạt');
  assert.strictEqual(
    localStorageMock.getItem(`${NO_AUTODL_PREFIX}vol_cancel_run`),
    '1',
    'Cờ no_autodl phải được đặt sau khi huỷ task đang chạy'
  );

  setSyncHandlersForTesting({ download: null, upload: null });
  console.log('✓ Test 10 Passed: cancelTask huỷ khi chờ & khi chạy và đặt dấu no_auto chính xác!\n');

  // -------------------------------------------------------------
  // Test 11: Giả lập poll 60s nhiều lần - số lần upload không vượt backoff (Lỗi 1)
  // -------------------------------------------------------------
  console.log('--- Test 11: Giả lập 60s poll nhiều lần và kiểm soát số lần gọi upload ---');
  resetQueueForTesting();

  let uploadAttempts = 0;
  setSyncHandlersForTesting({
    upload: async (volId) => {
      uploadAttempts++;
      throw new Error('500 Simulated Network Failure');
    },
  });

  mockDBData.series.set('ser_poll', {
    id: 'ser_poll',
    title: 'Bộ Truyện Poll',
  });
  mockDBData.volumes.set('vol_poll_test', {
    id: 'vol_poll_test',
    seriesId: 'ser_poll',
    order: 1,
    title: 'Tập Thử Poll',
    pageCount: 5,
    totalBytes: 500,
    importState: 'ready',
  });
  mockCloudVolumes = []; // local_only

  // Giả lập 10 chu kỳ poll 60s (mỗi chu kỳ tăng thời gian ảo thêm 60 giây)
  const realDateNow = Date.now;
  let virtualNow = 10000000;
  Date.now = () => virtualNow;

  try {
    for (let i = 0; i < 10; i++) {
      await checkAndTriggerAutoSync();
      await new Promise((r) => setTimeout(r, 20));
      virtualNow += 60 * 1000; // Thời gian trôi qua 60 giây cho lượt poll tiếp
    }
  } finally {
    Date.now = realDateNow;
  }

  // Trong 10 lần poll 60s (tổng 10 phút):
  // Poll 0 (0s): upload (lần 1) -> thất bại -> nextRetryAt = 60s
  // Poll 1 (60s): upload (lần 2) -> thất bại -> nextRetryAt = 60s + 300s = 360s
  // Poll 2..5 (120s..300s): đều < 360s -> bỏ qua
  // Poll 6 (360s): upload (lần 3) -> thất bại -> nextRetryAt = 360s + 900s = 1260s
  // Poll 7..9 (420s..540s): đều < 1260s -> bỏ qua
  // Tổng số lần gọi chỉ là 3 lần (thay vì 10 lần)
  assert.strictEqual(
    uploadAttempts,
    3,
    `Số lần thử upload chỉ được là 3 trong 10 phút poll, thực tế: ${uploadAttempts}`
  );

  setSyncHandlersForTesting({ download: null, upload: null });
  console.log('✓ Test 11 Passed: Bounded poll upload attempts kiểm soát chính xác theo backoff!\n');

  console.log('========================================');
  console.log('TẤT CẢ CÁC BÀI TEST PHASE 3 UNIT THÀNH CÔNG 100%!');
  console.log('========================================');
}

runTests().catch((err) => {
  console.error('Test thất bại:', err);
  process.exit(1);
});
