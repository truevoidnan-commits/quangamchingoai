/**
 * scripts/test-sync-diagnostics.js
 * Bộ kiểm thử toàn diện cho các tính năng:
 * (A) Đồng bộ ưu tiên việc nhẹ trước, truyện nặng sau
 * (B) Xử lý trạng thái syncing bị kẹt và tiến trình theo truyện
 * (C) Nhật ký chẩn đoán (syncLog ring buffer, sanitization) và cảnh báo Supabase tạm dừng
 */

import assert from 'assert';

// -------------------------------------------------------------
// 1. Mock LocalStorage in Node.js
// -------------------------------------------------------------
class LocalStorageMock {
  constructor() {
    this.store = {};
    this.throwQuotaError = false;
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    if (this.throwQuotaError) {
      const err = new Error('The quota has been exceeded.');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
  get length() {
    return Object.keys(this.store).length;
  }
  key(i) {
    return Object.keys(this.store)[i] || null;
  }
}

global.localStorage = new LocalStorageMock();

global.IDBKeyRange = {
  bound: (lower, upper) => ({ lower, upper }),
  only: (val) => ({ lower: val, upper: val }),
};
try {
  Object.defineProperty(global.navigator, 'onLine', {
    value: true,
    writable: true,
    configurable: true,
  });
} catch {
  // Fallback
}

// Mock Window & CustomEvent for Node.js
const eventListeners = {};
global.window = {
  addEventListener: (event, handler) => {
    if (!eventListeners[event]) eventListeners[event] = [];
    eventListeners[event].push(handler);
  },
  removeEventListener: (event, handler) => {
    if (eventListeners[event]) {
      eventListeners[event] = eventListeners[event].filter(h => h !== handler);
    }
  },
  dispatchEvent: (evt) => {
    const handlers = eventListeners[evt.type] || [];
    handlers.forEach(h => h(evt));
    return true;
  }
};

global.CustomEvent = class CustomEvent {
  constructor(type, params = {}) {
    this.type = type;
    this.detail = params.detail || null;
  }
};

// -------------------------------------------------------------
// 2. Mock In-Memory IndexedDB
// -------------------------------------------------------------
class MockDB {
  constructor() {
    this.novels = new Map();
    this.chapters = new Map();
  }
  async get(storeName, id) {
    if (storeName === 'novels') return this.novels.get(id) || undefined;
    if (storeName === 'chapters') return this.chapters.get(id) || undefined;
  }
  async put(storeName, value) {
    if (storeName === 'novels') this.novels.set(value.id, { ...value });
    if (storeName === 'chapters') this.chapters.set(value.id, { ...value });
  }
  async delete(storeName, id) {
    if (storeName === 'novels') this.novels.delete(id);
    if (storeName === 'chapters') this.chapters.delete(id);
  }
  transaction(storeNames) {
    const self = this;
    return {
      done: Promise.resolve(),
      store: {
        put: async (ch) => self.chapters.set(ch.id, { ...ch }),
      },
      objectStore(name) {
        return {
          async get(id) { return self[name].get(id); },
          async put(val) { self[name].set(val.id, { ...val }); },
          async delete(id) { self[name].delete(id); },
          index() {
            return {
              async count(range) {
                const targetId = range?.lower || range;
                let c = 0;
                for (const ch of self.chapters.values()) if (ch.novelId === targetId) c++;
                return c;
              },
              async getAll(range) {
                const targetId = Array.isArray(range?.lower) ? range.lower[0] : range;
                const res = [];
                for (const ch of self.chapters.values()) if (ch.novelId === targetId) res.push(ch);
                res.sort((a, b) => (a.order || 0) - (b.order || 0));
                return res;
              },
              async openCursor(range) {
                const targetId = range?.lower || range;
                const ids = [];
                for (const ch of self.chapters.values()) if (ch.novelId === targetId) ids.push(ch.id);
                let idx = 0;
                function makeCursor(i) {
                  if (i >= ids.length) return null;
                  return {
                    async delete() { self.chapters.delete(ids[i]); },
                    async continue() { return makeCursor(i + 1); },
                  };
                }
                return makeCursor(0);
              }
            };
          }
        };
      }
    };
  }
}

const mockDB = new MockDB();

import { setHostOverrideForTesting } from '../src/lib/sync/envProtection.js';
import {
  runAutoSync,
  setAutoSyncEnabled,
  acquireSyncLock,
  releaseSyncLock,
  refreshSyncLock,
  getSyncStatus,
  setSyncStatus,
  SYNC_STATUS_KEY,
  SYNC_LOCK_TIMEOUT_MS,
  SYNC_STATUS_STALE_MS,
  SYNC_HEARTBEAT_TIMEOUT_MS,
} from '../src/lib/sync/autoSync.js';
import {
  performSync,
  compressChapters,
} from '../src/lib/sync/syncEngine.js';
import { setDBPromiseForTesting, saveNovel, saveChaptersBulk, getNovel, getChapters } from '../src/lib/db.js';
import {
  getSyncLedger,
  saveSyncLedger,
  recordNovelTombstone,
  getTombstones,
  markNovelDirty,
  SYNC_LOCK_KEY,
} from '../src/lib/sync/syncLedger.js';
import {
  getLibrary,
  getReadingProgress,
  saveReadingProgress,
  addToLibrary,
} from '../src/lib/storage.js';
import {
  getCultivationState,
  getCultivationKey,
  setActiveProfile,
} from '../src/lib/cultivation.js';
import {
  logSyncEvent,
  getSyncLogs,
  clearSyncLogs,
  exportSyncLogsText,
  sanitizeLogMessage,
  recordSyncSuccess,
  recordSyncFailure,
  isSupabasePausedSuspected,
  classifyErrorCode,
  isNetworkOrServerError,
  isAuthError,
  SYNC_LOG_KEY,
  LAST_SUCCESS_KEY,
  CONSECUTIVE_FAILURES_KEY,
} from '../src/lib/sync/syncLog.js';

setDBPromiseForTesting(Promise.resolve(mockDB));

// -------------------------------------------------------------
// 3. Mock Supabase Client with operation order tracking
// -------------------------------------------------------------
class MockDiagnosticsSupabaseClient {
  constructor(userId = 'diag_user_123') {
    this.userId = userId;
    this.callOrder = [];
    this.tables = {
      novels: new Map(),
      progress: new Map(),
      cultivation: new Map(),
      user_settings: new Map(),
      vault: new Map(),
    };
    this.storageBuckets = {
      novels: new Map(),
    };
    this.storageUploadDelayMs = 0;
    this.storageDownloadDelayMs = 0;
    this.throwStorageUploadOnNovelId = null;

    this.auth = {
      async getSession() {
        return {
          data: {
            session: { user: { id: userId, email: 'diag@thiencolau.vn' } },
          },
          error: null,
        };
      },
    };

    const self = this;
    this.storage = {
      from(bucketName) {
        const bucket = self.storageBuckets[bucketName] || new Map();
        self.storageBuckets[bucketName] = bucket;
        return {
          async upload(path, blob) {
            self.callOrder.push({ op: 'storage_upload', path, time: Date.now() });
            if (self.throwStorageUploadOnNovelId && path.includes(self.throwStorageUploadOnNovelId)) {
              throw new Error(`Simulated storage upload error for ${path}`);
            }
            if (self.storageUploadDelayMs > 0) {
              await new Promise(r => setTimeout(r, self.storageUploadDelayMs));
            }
            bucket.set(path, blob);
            return { data: { path }, error: null };
          },
          async download(path) {
            self.callOrder.push({ op: 'storage_download', path, time: Date.now() });
            if (self.storageDownloadDelayMs > 0) {
              await new Promise(r => setTimeout(r, self.storageDownloadDelayMs));
            }
            const blob = bucket.get(path);
            if (!blob) return { data: null, error: new Error('File not found in bucket') };
            return { data: blob, error: null };
          },
          async remove(paths) {
            self.callOrder.push({ op: 'storage_remove', paths, time: Date.now() });
            for (const p of paths) bucket.delete(p);
            return { data: paths, error: null };
          },
        };
      },
    };
  }

  from(tableName) {
    const self = this;
    const table = self.tables[tableName] || new Map();
    self.tables[tableName] = table;

    let filterUserId = null;
    let filterId = null;
    let filterNovelId = null;
    let isSingle = false;

    const builder = {
      select(columns = '*') {
        return builder;
      },
      eq(col, val) {
        if (col === 'user_id') filterUserId = val;
        if (col === 'id') filterId = val;
        if (col === 'novel_id') filterNovelId = val;
        return builder;
      },
      lt() {
        return builder;
      },
      single() {
        isSingle = true;
        return builder;
      },
      async then(resolve, reject) {
        try {
          if (tableName === 'novels') {
            const rows = [];
            for (const [k, v] of table.entries()) {
              if (!filterUserId || v.user_id === filterUserId) {
                if (!filterId || v.id === filterId) {
                  rows.push({ ...v });
                }
              }
            }
            if (isSingle) {
              resolve({ data: rows[0] || null, error: null });
            } else {
              resolve({ data: rows, error: null });
            }
            return;
          }

          if (tableName === 'cultivation') {
            self.callOrder.push({ op: 'cultivation_fetch', time: Date.now() });
            const row = table.get(filterUserId || self.userId);
            resolve({ data: row ? { ...row } : null, error: null });
            return;
          }

          if (tableName === 'progress') {
            self.callOrder.push({ op: 'progress_fetch', time: Date.now() });
            const rows = [];
            for (const [k, v] of table.entries()) {
              if (!filterUserId || v.user_id === filterUserId) {
                if (!filterNovelId || v.novel_id === filterNovelId) {
                  rows.push({ ...v });
                }
              }
            }
            resolve({ data: rows, error: null });
            return;
          }

          if (tableName === 'user_settings') {
            self.callOrder.push({ op: 'settings_fetch', time: Date.now() });
            const row = table.get(filterUserId || self.userId);
            resolve({ data: row ? { ...row } : null, error: null });
            return;
          }

          if (tableName === 'vault') {
            self.callOrder.push({ op: 'vault_fetch', time: Date.now() });
            const row = table.get(filterUserId || self.userId);
            resolve({ data: row ? { ...row } : null, error: null });
            return;
          }

          resolve({ data: [], error: null });
        } catch (err) {
          reject(err);
        }
      },
      async upsert(row, options = {}) {
        if (tableName === 'cultivation') {
          self.callOrder.push({ op: 'cultivation_upsert', row, time: Date.now() });
          table.set(row.user_id, { ...row });
          return { data: row, error: null };
        }
        if (tableName === 'progress') {
          self.callOrder.push({ op: 'progress_upsert', novelId: row.novel_id, time: Date.now() });
          table.set(`${row.user_id}:${row.novel_id}`, { ...row });
          return { data: row, error: null };
        }
        if (tableName === 'novels') {
          self.callOrder.push({ op: 'novels_upsert', id: row.id, time: Date.now() });
          table.set(`${row.user_id}:${row.id}`, { ...row });
          return { data: row, error: null };
        }
        if (tableName === 'user_settings') {
          self.callOrder.push({ op: 'settings_upsert', time: Date.now() });
          table.set(row.user_id, { ...row });
          return { data: row, error: null };
        }
        if (tableName === 'vault') {
          self.callOrder.push({ op: 'vault_upsert', time: Date.now() });
          table.set(row.user_id, { ...row });
          return { data: row, error: null };
        }
        return { data: row, error: null };
      },
      async update(payload) {
        if (tableName === 'novels') {
          self.callOrder.push({ op: 'novels_update', id: filterId, payload, time: Date.now() });
          const key = `${filterUserId || self.userId}:${filterId}`;
          const existing = table.get(key) || {};
          table.set(key, { ...existing, ...payload });
          return { data: payload, error: null };
        }
        return { data: payload, error: null };
      },
    };

    return builder;
  }
}

// =============================================================
// MAIN TEST SUITE
// =============================================================
async function runDiagnosticsTests() {
  console.log('=== BẮT ĐẦU CHẠY TOÀN BỘ CÁC BÀI TEST CHẨN ĐOÁN & ƯU TIÊN ĐỒNG BỘ ===\n');

  // -----------------------------------------------------------
  // TEST 1: Thứ tự ưu tiên (Light Phase diễn ra TRƯỚC Heavy Phase)
  // Trong performSync & runAutoSync: tiến độ/cài đặt/mật thất/tu vi TRƯỚC storage upload/download
  // -----------------------------------------------------------
  console.log('--- Test 1: Thứ tự ưu tiên (Việc nhẹ trước, Truyện nặng sau) ---');
  {
    global.localStorage.clear();
    mockDB.novels.clear();
    mockDB.chapters.clear();
    releaseSyncLock();
    clearSyncLogs();
    setActiveProfile('real');
    setHostOverrideForTesting('test.github.io');
    setAutoSyncEnabled(true);

    const client = new MockDiagnosticsSupabaseClient('user_order_test');

    // Tạo truyện nặng trên máy: 10 chương
    const heavyNovel = { id: 'heavy_nov_1', title: 'Truyện Nặng Số 1', updatedAt: 1000 };
    await saveNovel(heavyNovel);
    addToLibrary({ id: 'heavy_nov_1', title: 'Truyện Nặng Số 1', updatedAt: 1000 });
    const heavyChapters = Array.from({ length: 10 }, (_, i) => ({
      id: `ch_${i + 1}`,
      novelId: 'heavy_nov_1',
      title: `Chương ${i + 1}`,
      content: 'Nội dung rất dài '.repeat(100),
    }));
    await saveChaptersBulk(heavyChapters);
    markNovelDirty('heavy_nov_1');

    // Lưu tiến độ đọc và tu vi trên máy
    saveReadingProgress('heavy_nov_1', { chapterId: 'ch_5', percent: 50, updatedAt: 2000 });
    const cultState = { realm: 'Luyện Khí Tầng 5', totalExp: 500, _rev: 5 };
    global.localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(cultState));
    saveSyncLedger({
      novels: {},
      cultivation: { lastSyncedRev: 0, lastCloudUpdatedAt: 0 },
      lastSyncedAt: 0,
    });

    // Chạy performSync
    const resSync = await performSync(client, { firstSyncChoice: 'local_master' });
    assert.strictEqual(resSync.success, true);

    // Kiểm tra thứ tự gọi trong client.callOrder
    const ops = client.callOrder.map(c => c.op);
    const progressUpsertIdx = ops.indexOf('progress_upsert');
    const cultUpsertIdx = ops.indexOf('cultivation_upsert');
    const storageUploadIdx = ops.indexOf('storage_upload');

    assert(progressUpsertIdx !== -1, 'Phải có thao tác progress_upsert');
    assert(cultUpsertIdx !== -1, 'Phải có thao tác cultivation_upsert');
    assert(storageUploadIdx !== -1, 'Phải có thao tác storage_upload');

    assert(
      progressUpsertIdx < storageUploadIdx,
      `Tiến độ đọc (${progressUpsertIdx}) PHẢI diễn ra TRƯỚC storage upload (${storageUploadIdx})`
    );
    assert(
      cultUpsertIdx < storageUploadIdx,
      `Tu vi (${cultUpsertIdx}) PHẢI diễn ra TRƯỚC storage upload (${storageUploadIdx})`
    );

    console.log('✓ Test 1 Passed: Giai đoạn nhẹ (tiến độ, tu vi) diễn ra trước giai đoạn nặng (storage upload)!');
  }

  // -----------------------------------------------------------
  // TEST 2: Sắp xếp truyện nhỏ trước truyện lớn ở giai đoạn nặng
  // -----------------------------------------------------------
  console.log('\n--- Test 2: Giai đoạn nặng sắp xếp truyện nhỏ trước truyện lớn ---');
  {
    global.localStorage.clear();
    mockDB.novels.clear();
    mockDB.chapters.clear();
    releaseSyncLock();
    clearSyncLogs();
    setActiveProfile('real');

    const client = new MockDiagnosticsSupabaseClient('user_sort_test');

    // Truyện A: 20 chương (lớn)
    await saveNovel({ id: 'nov_large', title: 'Truyện Lớn', chapterCount: 20, updatedAt: 1000 });
    addToLibrary({ id: 'nov_large', title: 'Truyện Lớn', chapterCount: 20, updatedAt: 1000 });
    await saveChaptersBulk(Array.from({ length: 20 }, (_, i) => ({ id: `ch_l_${i}`, novelId: 'nov_large', title: `Chương ${i}` })));
    markNovelDirty('nov_large');

    // Truyện B: 2 chương (nhỏ)
    await saveNovel({ id: 'nov_small', title: 'Truyện Nhỏ', chapterCount: 2, updatedAt: 1000 });
    addToLibrary({ id: 'nov_small', title: 'Truyện Nhỏ', chapterCount: 2, updatedAt: 1000 });
    await saveChaptersBulk(Array.from({ length: 2 }, (_, i) => ({ id: `ch_s_${i}`, novelId: 'nov_small', title: `Chương ${i}` })));
    markNovelDirty('nov_small');

    saveSyncLedger({ novels: {}, cultivation: { lastSyncedRev: 0 }, lastSyncedAt: 0 });

    await performSync(client, { firstSyncChoice: 'local_master' });

    // Kiểm tra upload order: nov_small phải được upload trước nov_large
    const uploads = client.callOrder.filter(c => c.op === 'storage_upload').map(c => c.path);
    assert.strictEqual(uploads.length, 2);
    assert(uploads[0].includes('nov_small'), 'Truyện nhỏ (2 chương) phải được tải lên trước!');
    assert(uploads[1].includes('nov_large'), 'Truyện lớn (20 chương) phải được tải lên sau!');

    console.log('✓ Test 2 Passed: Truyện nhỏ 2 chương được tải lên trước truyện lớn 20 chương!');
  }

  // -----------------------------------------------------------
  // TEST 3: Truyện bị tombstone KHÔNG nhận tiến độ
  // -----------------------------------------------------------
  console.log('\n--- Test 3: Truyện bị tombstone KHÔNG nhận tiến độ ---');
  {
    global.localStorage.clear();
    mockDB.novels.clear();
    mockDB.chapters.clear();
    releaseSyncLock();
    clearSyncLogs();
    setActiveProfile('real');

    const client = new MockDiagnosticsSupabaseClient('user_tomb_test');

    // Cloud có tiến độ đọc cho nov_deleted
    client.tables.progress.set('user_tomb_test:nov_deleted', {
      user_id: 'user_tomb_test',
      novel_id: 'nov_deleted',
      data: { chapterId: 'ch_99', percent: 90, updatedAt: 5000 },
      updated_at: 5000,
    });

    // Cloud có truyện nov_deleted nhưng deleted_at > 0
    client.tables.novels.set('user_tomb_test:nov_deleted', {
      user_id: 'user_tomb_test',
      id: 'nov_deleted',
      title: 'Truyện Đã Xóa',
      deleted_at: 6000,
      updated_at: 1000,
    });

    saveSyncLedger({ novels: {}, cultivation: { lastSyncedRev: 0 }, lastSyncedAt: 1000 });

    await performSync(client);

    // Kiểm tra cục bộ không được lưu tiến độ cho nov_deleted
    const localProg = getReadingProgress('nov_deleted');
    assert(!localProg?.chapterId, 'Truyện đã bị xóa tuyệt đối không được ghi nhận tiến độ đọc!');

    console.log('✓ Test 3 Passed: Tombstone xử lý trước thành công, truyện đã xóa không nhận tiến độ!');
  }

  // -----------------------------------------------------------
  // TEST 4: Truyện mới kéo về ở giai đoạn nặng được áp tiến độ cloud ở lượt bổ sung
  // -----------------------------------------------------------
  console.log('\n--- Test 4: Truyện mới từ Cloud được áp tiến độ ở lượt nhẹ bổ sung ---');
  {
    global.localStorage.clear();
    mockDB.novels.clear();
    mockDB.chapters.clear();
    releaseSyncLock();
    clearSyncLogs();
    setActiveProfile('real');

    const client = new MockDiagnosticsSupabaseClient('user_pull_supp_test');

    // Cloud có truyện nov_cloud_new
    const chapters = [{ id: 'ch_c1', novelId: 'nov_cloud_new', title: 'Chương 1' }];
    const { blob, ext } = await compressChapters(JSON.stringify(chapters));
    const contentPath = `user_pull_supp_test/nov_cloud_new${ext}`;
    client.storageBuckets.novels.set(contentPath, blob);

    client.tables.novels.set('user_pull_supp_test:nov_cloud_new', {
      user_id: 'user_pull_supp_test',
      id: 'nov_cloud_new',
      title: 'Truyện Mới Từ Cloud',
      content_path: contentPath,
      content_updated_at: 2000,
      updated_at: 2000,
      chapter_count: 1,
      deleted_at: null,
    });

    // Cloud có tiến độ đọc cho truyện này
    client.tables.progress.set('user_pull_supp_test:nov_cloud_new', {
      user_id: 'user_pull_supp_test',
      novel_id: 'nov_cloud_new',
      data: { chapterId: 'ch_c1', percent: 80, paraIndex: 5, updatedAt: 3000 },
      updated_at: 3000,
    });

    saveSyncLedger({ novels: {}, cultivation: { lastSyncedRev: 0 }, lastSyncedAt: 1000 });

    const res = await performSync(client);
    assert.strictEqual(res.pulledNovels, 1);

    // Kiểm tra truyện đã vào máy và tiến độ đọc đã được áp dụng
    const localNov = await getNovel('nov_cloud_new');
    assert(localNov, 'Truyện phải được kéo về máy');
    const prog = getReadingProgress('nov_cloud_new');
    assert(prog, 'Tiến độ đọc phải được áp dụng cho truyện mới kéo về');
    assert.strictEqual(prog.chapterId, 'ch_c1');
    assert.strictEqual(prog.percent, 80);

    console.log('✓ Test 4 Passed: Truyện mới kéo về ở giai đoạn nặng được áp tiến độ cloud chuẩn xác!');
  }

  // -----------------------------------------------------------
  // TEST 5: Truyện nặng lỗi giữa chừng -> Phần nhẹ vẫn đã lưu / ledger đúng
  // -----------------------------------------------------------
  console.log('\n--- Test 5: Truyện nặng lỗi giữa chừng, phần nhẹ vẫn giữ nguyên kết quả ---');
  {
    global.localStorage.clear();
    mockDB.novels.clear();
    mockDB.chapters.clear();
    releaseSyncLock();
    clearSyncLogs();
    setActiveProfile('real');

    const client = new MockDiagnosticsSupabaseClient('user_err_test');

    // Tạo truyện lỗi storage upload
    client.throwStorageUploadOnNovelId = 'nov_will_fail';
    await saveNovel({ id: 'nov_will_fail', title: 'Truyện Sẽ Lỗi', chapterCount: 1, updatedAt: 1000 });
    addToLibrary({ id: 'nov_will_fail', title: 'Truyện Sẽ Lỗi', chapterCount: 1, updatedAt: 1000 });
    await saveChaptersBulk([{ id: 'ch_fail', novelId: 'nov_will_fail', title: 'Chương 1' }]);
    markNovelDirty('nov_will_fail');

    // Tu vi cục bộ mới hơn cloud
    const localCult = { realm: 'Kim Đan Tầng 1', totalExp: 10000, _rev: 8 };
    global.localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(localCult));

    saveSyncLedger({ novels: {}, cultivation: { lastSyncedRev: 5 }, lastSyncedAt: 1000 });

    const res = await performSync(client, { mode: 'normal' });
    assert.strictEqual(res.success, false, 'Đồng bộ phải trả về false khi có truyện lỗi');
    assert(res.errors.length > 0, 'Phải có lỗi ghi nhận');

    // Nhưng tu vi đã được upsert lên cloud thành công ở giai đoạn nhẹ
    const cloudCult = client.tables.cultivation.get('user_err_test');
    assert(cloudCult, 'Tu vi phải được đẩy lên cloud');
    assert.strictEqual(cloudCult.rev, 8, 'Tu vi cloud rev phải là 8');

    // Ledger tu vi đã được cập nhật
    const ledgerAfter = getSyncLedger();
    assert.strictEqual(ledgerAfter.cultivation?.lastSyncedRev, 8, 'Ledger phải ghi nhận rev tu vi 8');

    console.log('✓ Test 5 Passed: Truyện nặng lỗi nhưng tu vi và tiến độ ở giai đoạn nhẹ vẫn được bảo toàn!');
  }

  // -----------------------------------------------------------
  // TEST 6: Dọn trạng thái 'syncing' bị kẹt (Lock hết hạn hoặc Heartbeat quá 2 phút)
  // -----------------------------------------------------------
  console.log('\n--- Test 6: Dọn trạng thái "syncing" bị kẹt thành "idle" ---');
  {
    global.localStorage.clear();
    clearSyncLogs();

    // 1. Trạng thái syncing nhưng không có khóa (lock hết hạn)
    const now = Date.now();
    global.localStorage.setItem(
      SYNC_STATUS_KEY,
      JSON.stringify({
        state: 'syncing',
        message: 'Đang tải truyện...',
        startedAt: now - 400000,
        heartbeatAt: now - 360000,
      })
    );
    // Không có tcl_sync_lock_ts
    global.localStorage.removeItem(SYNC_LOCK_KEY);

    const status1 = getSyncStatus();
    assert.strictEqual(status1.state, 'idle', 'Trạng thái kẹt phải được đưa về idle');
    assert(status1.message.includes('gián đoạn'), 'Thông báo phải ghi nhận bị gián đoạn');

    // Kiểm tra có log sync_stuck_cleared
    const logs1 = getSyncLogs();
    assert(logs1.some(l => l.evt === 'sync_stuck_cleared'), 'Phải ghi log sync_stuck_cleared');

    // 2. Trạng thái đang chạy thật (khóa còn hạn và heartbeat mới) -> giữ nguyên syncing
    releaseSyncLock();
    acquireSyncLock(); // Lấy khóa hợp lệ
    setSyncStatus({ state: 'syncing', message: 'Đang xử lý truyện 2/5...' });

    const status2 = getSyncStatus();
    assert.strictEqual(status2.state, 'syncing', 'Trạng thái đang chạy thật phải được giữ nguyên');
    releaseSyncLock();

    console.log('✓ Test 6 Passed: Trạng thái syncing kẹt được dọn tự động, tiến trình thật giữ nguyên!');
  }

  // -----------------------------------------------------------
  // TEST 7: Nhật ký đồng bộ (Ring Buffer, Quota Error & Sanitization)
  // -----------------------------------------------------------
  console.log('\n--- Test 7: Nhật ký đồng bộ (Ring buffer, Cắt 40KB, Lọc Token/Email) ---');
  {
    global.localStorage.clear();
    clearSyncLogs();

    // 1. Lọc dữ liệu nhạy cảm
    const dirtyError = 'Lỗi kết nối Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token123 từ email admin@thiencolau.vn với khóa sb_secret_key_long_string_1234567890';
    const cleanError = sanitizeLogMessage(dirtyError);
    assert(!cleanError.includes('eyJhbGci'), 'JWT phải bị ẩn');
    assert(!cleanError.includes('admin@thiencolau.vn'), 'Email phải bị ẩn');
    assert(!cleanError.includes('sb_secret'), 'Supabase key phải bị ẩn');
    assert(cleanError.includes('[đã ẩn]'), 'Phải có chuỗi thay thế [đã ẩn]');
    assert(cleanError.includes('[email đã ẩn]'), 'Phải có chuỗi thay thế [email đã ẩn]');
    assert(cleanError.length <= 160, 'Độ dài chuỗi lọc tối đa 160 ký tự');

    // 2. Ring buffer tối đa 200 mục
    for (let i = 0; i < 250; i++) {
      logSyncEvent({ level: 'info', src: 'auto', evt: `event_${i}`, count: i });
    }
    const allLogs = getSyncLogs();
    assert.strictEqual(allLogs.length, 200, 'Chỉ giữ tối đa 200 mục mới nhất');
    assert.strictEqual(allLogs[allLogs.length - 1].evt, 'event_249', 'Mục cuối cùng phải là mục mới nhất');

    // 3. Giới hạn dung lượng ~40KB
    for (let i = 0; i < 150; i++) {
      logSyncEvent({
        level: 'info',
        src: 'auto',
        evt: 'heavy_entry',
        msg: 'A'.repeat(150),
      });
    }
    const rawStored = global.localStorage.getItem(SYNC_LOG_KEY);
    assert(rawStored.length <= 40960, `Dung lượng nhật ký (${rawStored.length} bytes) không được vượt quá 40KB`);

    // 4. Lỗi QuotaExceededError không làm sập ứng dụng
    global.localStorage.throwQuotaError = true;
    assert.doesNotThrow(() => {
      logSyncEvent({ level: 'error', src: 'auto', evt: 'quota_test', msg: 'test' });
    }, 'Lỗi quota trong nhật ký không được ném ra ngoài làm chết đồng bộ');
    global.localStorage.throwQuotaError = false;

    // 5. Xuất văn bản thuần (exportSyncLogsText)
    const exportedText = exportSyncLogsText({ appVersion: 'v2.1', profile: 'real' });
    assert(exportedText.includes('NHẬT KÝ ĐỒNG BỘ'), 'Phải có tiêu đề nhật ký');
    assert(exportedText.includes('[v2.1]'), 'Phải có phiên bản');

    console.log('✓ Test 7 Passed: Ring buffer 200 mục, lọc token/email và bảo vệ an toàn 40KB hoàn hảo!');
  }

  // -----------------------------------------------------------
  // TEST 8: Cảnh báo Supabase bị tạm dừng
  // -----------------------------------------------------------
  console.log('\n--- Test 8: Cảnh báo có thể Supabase bị tạm dừng ---');
  {
    global.localStorage.clear();

    // 1. Lần đầu: chưa có lỗi
    assert.strictEqual(isSupabasePausedSuspected(), false);

    // 2. Lỗi xác thực (auth error) -> KHÔNG tính là máy chủ tạm dừng
    recordSyncFailure(new Error('Invalid JWT token or auth error'));
    assert.strictEqual(isSupabasePausedSuspected(), false);

    // 3. Thiết bị offline -> KHÔNG tính là máy chủ tạm dừng
    global.navigator.onLine = false;
    recordSyncFailure(new Error('Failed to fetch'));
    recordSyncFailure(new Error('Failed to fetch'));
    recordSyncFailure(new Error('Failed to fetch'));
    assert.strictEqual(isSupabasePausedSuspected(), false);
    global.navigator.onLine = true;

    // 4. Lỗi mạng liên tiếp 3 lần khi online, lần thành công gần nhất cách đây 2 giờ (> 1h)
    const twoHoursAgo = Date.now() - (2 * 3600 * 1000);
    global.localStorage.setItem(LAST_SUCCESS_KEY, String(twoHoursAgo));

    recordSyncFailure(new Error('Network error connecting to Supabase'));
    recordSyncFailure(new Error('500 Internal Server Error'));
    recordSyncFailure(new Error('Connection reset by peer'));

    assert.strictEqual(
      isSupabasePausedSuspected(),
      true,
      'Phải bật cảnh báo tạm dừng sau >= 3 lỗi mạng liên tiếp và > 1 giờ'
    );

    // 5. Nếu đồng bộ thành công -> cảnh báo tự tắt
    recordSyncSuccess();
    assert.strictEqual(isSupabasePausedSuspected(), false, 'Cảnh báo phải tự tắt ngay khi đồng bộ thành công');

    console.log('✓ Test 8 Passed: Cảnh báo tạm dừng hoạt động chuẩn xác theo số lần và thời gian!');
  }

  // -----------------------------------------------------------
  // TEST 9: Lỗi dữ liệu lặp lại 5 lần (truyện > 45MB) trải dài > 1h
  // -> isSupabasePausedSuspected() vẫn false
  // -----------------------------------------------------------
  console.log('\n--- Test 9: Lỗi dữ liệu lặp lại 5 lần (>45MB) trải dài > 1h -> không nghi ngờ Supabase tạm dừng ---');
  {
    global.localStorage.clear();
    const twoHoursAgo = Date.now() - (2 * 3600 * 1000);
    global.localStorage.setItem(LAST_SUCCESS_KEY, String(twoHoursAgo));

    for (let i = 0; i < 5; i++) {
      recordSyncFailure(new Error('Truyện "Tiên Nghịch" có dung lượng nén (48.5MB) vượt quá 45MB. Bỏ qua truyện này.'));
    }

    assert.strictEqual(
      isSupabasePausedSuspected(),
      false,
      'Lỗi dữ liệu (vượt quá 45MB) 5 lần không được xem là lỗi mạng, không nghi ngờ máy chủ tạm dừng'
    );
    assert.strictEqual(
      parseInt(global.localStorage.getItem(CONSECUTIVE_FAILURES_KEY) || '0', 10),
      0,
      'Bộ đếm lỗi mạng liên tiếp phải bằng 0'
    );
    console.log('✓ Test 9 Passed: 5 lần lỗi dung lượng >45MB không kích hoạt cảnh báo tạm dừng!');
  }

  // -----------------------------------------------------------
  // TEST 10: Lỗi 'Failed to fetch' hoặc HTTP 503 lặp lại 3 lần trải dài > 1 giờ
  // -> isSupabasePausedSuspected() trả về true; gọi recordSyncSuccess() thì trả về false
  // -----------------------------------------------------------
  console.log('\n--- Test 10: Lỗi "Failed to fetch" / HTTP 503 lặp lại 3 lần > 1h -> true; recordSyncSuccess() -> false ---');
  {
    global.localStorage.clear();
    const twoHoursAgo = Date.now() - (2 * 3600 * 1000);
    global.localStorage.setItem(LAST_SUCCESS_KEY, String(twoHoursAgo));

    recordSyncFailure(new Error('TypeError: Failed to fetch'));
    recordSyncFailure(new Error('HTTP 503 Service Unavailable'));
    recordSyncFailure(new Error('Network request failed: project is paused'));

    assert.strictEqual(
      isSupabasePausedSuspected(),
      true,
      'Lỗi fetch/503 lặp lại 3 lần qua 1h phải nghi ngờ tạm dừng'
    );

    recordSyncSuccess();
    assert.strictEqual(
      isSupabasePausedSuspected(),
      false,
      'Sau khi đồng bộ thành công, cảnh báo phải tắt hoàn toàn'
    );
    console.log('✓ Test 10 Passed: Lỗi fetch/503 3 lần kích hoạt cảnh báo và tắt sau khi sync thành công!');
  }

  // -----------------------------------------------------------
  // TEST 11: Vòng đồng bộ có 1 lỗi dung lượng + 1 lỗi fetch -> vẫn được tính là lỗi mạng
  // -----------------------------------------------------------
  console.log('\n--- Test 11: Vòng đồng bộ có 1 lỗi dung lượng + 1 lỗi fetch -> tính là lỗi mạng ---');
  {
    global.localStorage.clear();
    const mixedErrors = [
      new Error('Truyện "Phàm Nhân Tu Tiên" vượt quá 45MB'),
      new Error('Failed to fetch from storage bucket'),
    ];

    recordSyncFailure(mixedErrors);

    assert.strictEqual(
      parseInt(global.localStorage.getItem(CONSECUTIVE_FAILURES_KEY) || '0', 10),
      1,
      'Khi có ít nhất một lỗi mạng trong danh sách errors, bộ đếm lỗi mạng phải tăng lên 1'
    );
    console.log('✓ Test 11 Passed: Mảng lỗi hỗn hợp (dung lượng + fetch) được nhận diện chính xác là có lỗi mạng!');
  }

  // -----------------------------------------------------------
  // TEST 12: Truyện có tên chứa chữ "Author" gây lỗi -> không bị nhận nhầm là auth error
  // -----------------------------------------------------------
  console.log('\n--- Test 12: Truyện có tên chứa chữ "Author" gặp lỗi mạng -> không bị nhầm là auth error ---');
  {
    global.localStorage.clear();
    const twoHoursAgo = Date.now() - (2 * 3600 * 1000);
    global.localStorage.setItem(LAST_SUCCESS_KEY, String(twoHoursAgo));

    const errWithAuthor = new Error('Truyện "Author of the End": Failed to fetch');
    assert.strictEqual(isAuthError(errWithAuthor), false, '"Author of the End" không được xem là auth error');
    assert.strictEqual(isNetworkOrServerError(errWithAuthor), true, 'Phải nhận diện là network error');

    recordSyncFailure(errWithAuthor);
    assert.strictEqual(
      parseInt(global.localStorage.getItem(CONSECUTIVE_FAILURES_KEY) || '0', 10),
      1,
      'Lỗi của truyện chứa "Author" phải làm tăng bộ đếm lỗi mạng'
    );
    console.log('✓ Test 12 Passed: Truyện có tên "Author" không bị nhầm lẫn với lỗi xác thực!');
  }

  // -----------------------------------------------------------
  // TEST 13: Giả lập sync_failed với truyện ẩn "Bí Mật Của Tôi"
  // -> toàn bộ chuỗi JSON trong tcl_sync_log KHÔNG chứa "Bí Mật Của Tôi"
  // -----------------------------------------------------------
  console.log('\n--- Test 13: Toàn bộ nhật ký tcl_sync_log KHÔNG bao giờ chứa tên truyện ẩn ---');
  {
    global.localStorage.clear();
    clearSyncLogs();

    const hiddenTitle = 'Bí Mật Của Tôi';
    const errorMsg = `Truyện "${hiddenTitle}": 500 Internal Server Error`;

    logSyncEvent({
      level: 'error',
      src: 'auto',
      evt: 'sync_failed',
      novelId: 'secret_nov_123',
      code: classifyErrorCode(errorMsg),
      msg: errorMsg,
    });

    const rawLogs = global.localStorage.getItem(SYNC_LOG_KEY) || '';
    assert(
      !rawLogs.includes(hiddenTitle),
      `Chuỗi tcl_sync_log tuyệt đối không được chứa tên "${hiddenTitle}"`
    );
    assert(
      rawLogs.includes('[truyện]'),
      'Tên truyện trong ngoặc kép phải được thay bằng [truyện]'
    );
    const parsedLogs = getSyncLogs();
    assert.strictEqual(parsedLogs[0].code, 'server', 'Mã lỗi phải được phân loại là server');
    assert(
      parsedLogs[0].msg.includes('"[truyện]"'),
      'Thông điệp đã parse phải chứa "[truyện]"'
    );
    console.log('✓ Test 13 Passed: Tiêu đề truyện ẩn được che thành "[truyện]" hoàn toàn trong tcl_sync_log!');
  }

  // -----------------------------------------------------------
  // TEST 14: getSyncStatus với heartbeat 3 phút (lock còn hạn) KHÔNG xóa;
  // heartbeat 6 phút BỊ xóa về idle
  // -----------------------------------------------------------
  console.log('\n--- Test 14: getSyncStatus với heartbeat 3 phút (không xóa) vs 6 phút (bị xóa về idle) ---');
  {
    global.localStorage.clear();
    clearSyncLogs();

    const now = Date.now();

    // 1. Heartbeat 3 phút trước (180.000 ms), lock còn hạn -> KHÔNG bị xóa
    global.localStorage.setItem(SYNC_LOCK_KEY, String(now - 30000)); // lock 30s trước (< 2 phút)
    global.localStorage.setItem(
      SYNC_STATUS_KEY,
      JSON.stringify({
        state: 'syncing',
        message: 'Đang nén truyện nặng...',
        heartbeatAt: now - (3 * 60 * 1000), // 3 phút trước (< 5 phút)
      })
    );

    const status3Min = getSyncStatus();
    assert.strictEqual(
      status3Min.state,
      'syncing',
      'Heartbeat cách đây 3 phút (< 5 phút) và lock còn hạn KHÔNG được xóa về idle'
    );

    // 2. Heartbeat 6 phút trước (360.000 ms), lock hết hạn (> 2 phút) -> BỊ xóa về idle
    global.localStorage.setItem(SYNC_LOCK_KEY, String(now - (6 * 60 * 1000))); // lock 6 phút trước
    global.localStorage.setItem(
      SYNC_STATUS_KEY,
      JSON.stringify({
        state: 'syncing',
        message: 'Đang tải truyện...',
        heartbeatAt: now - (6 * 60 * 1000), // 6 phút trước (> 5 phút)
      })
    );

    const status6Min = getSyncStatus();
    assert.strictEqual(
      status6Min.state,
      'idle',
      'Heartbeat cách đây 6 phút (> 5 phút) và lock hết hạn PHẢI bị xóa về idle'
    );
    assert(status6Min.message.includes('gián đoạn'), 'Thông báo phải nêu rõ bị gián đoạn');

    console.log('✓ Test 14 Passed: Ngưỡng 5 phút tách biệt chuẩn xác: 3 phút giữ nguyên, 6 phút dọn về idle!');
  }

  console.log('\n=== TẤT CẢ 14 BÀI TEST CHẨN ĐOÁN & ƯU TIÊN ĐỒNG BỘ ĐÃ HOÀN TẤT XUẤT SẮC 100%! ===');
}

runDiagnosticsTests().catch(err => {
  console.error('\n❌ BÀI TEST THẤT BẠI:', err);
  process.exit(1);
});
