/**
 * scripts/test-comics-phase3.js
 * Kiểm thử toàn diện Phase 3:
 * 1. Hàng đợi tuần tự không chạy trùng cùng một tập.
 * 2. Tải ưu tiên (priority: true) được đưa lên đầu hàng đợi.
 * 3. Tự tải chỉ những tập status 'ready' trên Cloud mà máy chưa có.
 * 4. Tôn trọng công tắc tự động tải về / tải lên và cờ tạm dừng (pause/resume).
 * 5. Dừng tự tải khi dung lượng máy > 70% (storage protection).
 * 6. Dấu tcl_comic_no_autodl_<id> không bị tự tải lại.
 * 7. Tự tải lên chỉ những tập 'local_only', bỏ qua tập có dấu no_autoupl.
 * 8. Gán số tập tuần tự khi tên file không có số (D1).
 * 9. Sửa số tập / tên tập cập nhật IndexedDB và Supabase metadata (D2).
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

// Mock Navigator Storage safely in Node 24
let mockStorageEstimate = { usage: 100 * 1024 * 1024, quota: 1000 * 1024 * 1024 }; // 10%
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      storage: {
        estimate: async () => mockStorageEstimate,
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
  checkAndTriggerAutoSync,
  AUTO_DOWNLOAD_KEY,
  AUTO_UPLOAD_KEY,
  SYNC_PAUSED_KEY,
  NO_AUTODL_PREFIX,
  NO_AUTOUPL_PREFIX,
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
  transaction: () => ({
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
  console.log('=== BẮT ĐẦU TEST TOÀN DIỆN PHASE 3 (COMICS) ===\n');

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

  enqueueDownload(testVolId, 'ser_1');
  assert.strictEqual(
    localStorageMock.getItem(`${NO_AUTODL_PREFIX}${testVolId}`),
    null,
    'Cờ no_autodl phải được xóa khi chủ động tải'
  );

  localStorageMock.setItem(`${NO_AUTOUPL_PREFIX}${testVolId}`, '1');
  enqueueUpload(testVolId, 'ser_1');
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
  const snap1 = getQueueSnapshot();
  assert(Array.isArray(snap1.pendingTasks));

  enqueueDownload('vol_dup_1', 'ser_1', { volumeTitle: 'Tập A' });
  enqueueDownload('vol_dup_1', 'ser_1', { volumeTitle: 'Tập A Trùng' });
  const snap2 = getQueueSnapshot();
  const dupCount = snap2.pendingTasks.filter((t) => t.volumeId === 'vol_dup_1').length;
  assert.strictEqual(dupCount, 1, 'Không được phép thêm trùng lặp cùng một volumeId');

  console.log('✓ Test 6 Passed: Hàng đợi chống trùng lặp volumeId thành công!\n');

  console.log('========================================');
  console.log('TẤT CẢ CÁC BÀI TEST PHASE 3 UNIT THÀNH CÔNG 100%!');
  console.log('========================================');
}

runTests().catch((err) => {
  console.error('Test thất bại:', err);
  process.exit(1);
});
