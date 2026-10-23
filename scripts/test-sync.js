import assert from 'assert';

// -------------------------------------------------------------
// 1. Mock LocalStorage in Node.js
// -------------------------------------------------------------
class LocalStorageMock {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
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
// 2. Mock In-Memory IndexedDB for db.js
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

  transaction(storeNames, mode) {
    const stores = Array.isArray(storeNames) ? storeNames : [storeNames];
    const self = this;

    const tx = {
      done: Promise.resolve(),
      store: {
        put: async (ch) => self.chapters.set(ch.id, { ...ch }),
      },
      objectStore(name) {
        return {
          async get(id) {
            return self[name].get(id);
          },
          async put(val) {
            self[name].set(val.id, { ...val });
          },
          async delete(id) {
            self[name].delete(id);
          },
          index(indexName) {
            return {
              async count(range) {
                const targetNovelId = range?.lower || range;
                let c = 0;
                for (const ch of self.chapters.values()) {
                  if (ch.novelId === targetNovelId) c++;
                }
                return c;
              },
              async getAll(range) {
                const targetNovelId = Array.isArray(range?.lower) ? range.lower[0] : range;
                const res = [];
                for (const ch of self.chapters.values()) {
                  if (ch.novelId === targetNovelId) res.push(ch);
                }
                res.sort((a, b) => (a.order || 0) - (b.order || 0));
                return res;
              },
              async openCursor(range) {
                const targetNovelId = range?.lower || range;
                const matchingIds = [];
                for (const ch of self.chapters.values()) {
                  if (ch.novelId === targetNovelId) matchingIds.push(ch.id);
                }
                let idx = 0;
                function makeCursor(i) {
                  if (i >= matchingIds.length) return null;
                  return {
                    async delete() {
                      self.chapters.delete(matchingIds[i]);
                    },
                    async continue() {
                      return makeCursor(i + 1);
                    },
                  };
                }
                return makeCursor(0);
              },
            };
          },
        };
      },
    };
    return tx;
  }
}

const mockDB = new MockDB();

// Import db.js and set mock
import { setHostOverrideForTesting, isProductionHost } from '../src/lib/sync/envProtection.js';
import {
  runAutoSync,
  isAutoSyncEnabled,
  setAutoSyncEnabled,
  acquireSyncLock,
  releaseSyncLock,
  refreshSyncLock,
  getSyncStatus,
  resetBackoff,
  getBackoffDelay,
  triggerLibraryDebouncedAutoSync,
  isLibraryDebouncePending,
  cancelLibraryDebounceTimer,
  quickSyncCloudMetadata,
  quickPushLibraryMetadata,
  pullCultivationBeforeMeditation,
} from '../src/lib/sync/autoSync.js';
import { pullNovelProgressNow } from '../src/lib/sync/syncEngine.js';
import { setDBPromiseForTesting, getNovel, getChapters } from '../src/lib/db.js';
setDBPromiseForTesting(Promise.resolve(mockDB));

// -------------------------------------------------------------
// 3. Mock In-Memory Supabase Client
// -------------------------------------------------------------
class MockSupabaseClient {
  constructor(userId = 'test_user_uuid') {
    this.userId = userId;
    this.storageUploadCount = 0;
    this.storageDownloadCount = 0;
    this.tables = {
      novels: new Map(), // key: user_id:id -> row
      progress: new Map(), // key: user_id:novel_id -> row
      cultivation: new Map(), // key: user_id -> row
      user_settings: new Map(), // key: user_id -> row
    };
    this.storageBuckets = {
      novels: new Map(), // key: path -> Blob or Buffer
    };
    this.lastSelectColumns = {};
    this.selectHistory = [];
    this.lastUpdatePayload = null;
    this.simulatedErrors = {
      novelsSelect: false,
      storageUpload: false,
      storageDownload: false,
      storageRemove: false,
      novelsUpsert: false,
      novelsUpdate: false,
      cultivationUpsert: false,
      progressUpsert: false,
      userSettingsUpsert: false,
      errorOnNovelId: null,
    };
    this.cultivationUpsertCount = 0;

    this.auth = {
      async getSession() {
        return {
          data: {
            session: {
              user: { id: userId, email: 'test@thiencolau.vn' },
            },
          },
          error: null,
        };
      },
      async signInWithPassword() {
        return { data: { session: { user: { id: userId, email: 'test@thiencolau.vn' } } }, error: null };
      },
      async signOut() {
        return { error: null };
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() {} } } };
      },
    };

    const self = this;
    this.storage = {
      from(bucketName) {
        const bucket = self.storageBuckets[bucketName] || new Map();
        self.storageBuckets[bucketName] = bucket;
        return {
          async upload(path, blob) {
            self.storageUploadCount++;
            if (self.simulatedErrors.storageUpload || (self.simulatedErrors.errorOnNovelId && path.includes(self.simulatedErrors.errorOnNovelId))) {
              return { data: null, error: new Error('Simulated storage upload error') };
            }
            bucket.set(path, blob);
            return { data: { path }, error: null };
          },
          async download(path) {
            self.storageDownloadCount++;
            if (self.simulatedErrors.storageDownload) {
              return { data: null, error: new Error('Simulated storage download error') };
            }
            if (!bucket.has(path)) {
              return { data: null, error: new Error('File not found in bucket') };
            }
            return { data: bucket.get(path), error: null };
          },
          async remove(paths) {
            if (self.simulatedErrors.storageRemove) {
              return { data: null, error: new Error('Simulated storage remove error') };
            }
            for (const p of paths) bucket.delete(p);
            return { data: paths, error: null };
          },
        };
      },
    };
  }

  from(tableName) {
    const table = this.tables[tableName] || new Map();
    this.tables[tableName] = table;
    const self = this;

    const builder = {
      filters: [],
      selectCols: '*',
      isSingle: false,
      pendingUpdate: null,

      select(cols = '*') {
        self.lastSelectColumns[tableName] = cols;
        self.selectHistory.push({ tableName, cols, isSingle: false, novelId: null });
        builder.selectCols = cols;
        return builder;
      },
      eq(col, val) {
        builder.filters.push({ col, val, op: 'eq' });
        if (col === 'id' && self.selectHistory.length > 0) {
          self.selectHistory[self.selectHistory.length - 1].novelId = val;
        }
        return builder;
      },
      lt(col, val) {
        builder.filters.push({ col, val, op: 'lt' });
        return builder;
      },
      single() {
        builder.isSingle = true;
        if (self.selectHistory.length > 0) {
          self.selectHistory[self.selectHistory.length - 1].isSingle = true;
        }
        return builder;
      },
      update(updates) {
        self.lastUpdatePayload = updates;
        builder.pendingUpdate = updates;
        return builder;
      },
      async then(resolve, reject) {
        try {
          if (tableName === 'novels' && self.simulatedErrors.novelsSelect) {
            return resolve({ data: null, error: new Error('Simulated novels select error') });
          }
          let rows = Array.from(table.entries());
          for (const f of builder.filters) {
            if (f.op === 'lt') {
              rows = rows.filter(([k, r]) => (r[f.col] || 0) < f.val);
            } else {
              rows = rows.filter(([k, r]) => r[f.col] === f.val);
            }
          }
          if (builder.pendingUpdate) {
            if (tableName === 'novels' && self.simulatedErrors.novelsUpdate) {
              return resolve({ data: null, error: new Error('Simulated novels update error') });
            }
            for (const [k, r] of rows) {
              table.set(k, { ...r, ...builder.pendingUpdate });
            }
            return resolve({ data: builder.pendingUpdate, error: null });
          }
          const selectedColsList = builder.selectCols && builder.selectCols !== '*'
            ? builder.selectCols.split(',').map(c => c.trim())
            : null;

          const dataRows = rows.map(([k, r]) => {
            if (!selectedColsList) return { ...r };
            const projected = {};
            for (const col of selectedColsList) {
              projected[col] = r[col];
            }
            return projected;
          });
          if (builder.isSingle) {
            resolve({ data: dataRows[0] || null, error: null });
          } else {
            resolve({ data: dataRows, error: null });
          }
        } catch (e) {
          reject(e);
        }
      },
      async upsert(rowOrRows, options = {}) {
        if (tableName === 'novels' && self.simulatedErrors.novelsUpsert) {
          return { data: null, error: new Error('Simulated novels upsert error') };
        }
        if (tableName === 'novels' && self.simulatedErrors.errorOnNovelId) {
          const rowsList = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
          if (rowsList.some(r => r.id === self.simulatedErrors.errorOnNovelId)) {
            return { data: null, error: new Error(`Simulated novels upsert error on ${self.simulatedErrors.errorOnNovelId}`) };
          }
        }
        if (tableName === 'cultivation') {
          self.cultivationUpsertCount++;
          if (self.simulatedErrors.cultivationUpsert) {
            return { data: null, error: new Error('Simulated cultivation upsert error') };
          }
        }
        if (tableName === 'progress' && self.simulatedErrors.progressUpsert) {
          return { data: null, error: new Error('Simulated progress upsert error') };
        }
        if (tableName === 'user_settings' && self.simulatedErrors.userSettingsUpsert) {
          return { data: null, error: new Error('Simulated user_settings upsert error') };
        }
        const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        for (const row of rows) {
          let key;
          if (tableName === 'novels') key = `${row.user_id}:${row.id}`;
          else if (tableName === 'progress') key = `${row.user_id}:${row.novel_id}`;
          else if (tableName === 'cultivation' || tableName === 'user_settings') key = row.user_id;
          else key = JSON.stringify(row);

          const existing = table.get(key) || {};
          table.set(key, { ...existing, ...row });
        }
        return { data: rowOrRows, error: null };
      },
      async delete() {
        let rows = Array.from(table.entries());
        for (const f of builder.filters) {
          rows = rows.filter(([k, r]) => r[f.col] === f.val);
        }
        for (const [k] of rows) {
          table.delete(k);
        }
        return { error: null };
      },
    };

    return builder;
  }
}

// -------------------------------------------------------------
// 4. Import modules under test
// -------------------------------------------------------------
import {
  performSync,
  checkFirstSyncCondition,
  syncVaultPassword,
  syncCultivation,
  syncReadingSettings,
  syncReadingProgress,
  compressChapters,
  decompressChapters,
  normalizeTitle,
} from '../src/lib/sync/syncEngine.js';
import {
  getSyncLedger,
  saveSyncLedger,
  getDirtyNovels,
  markNovelDirty,
  clearNovelDirty,
  getTombstones,
  recordNovelTombstone,
  removeTombstone,
  getDeviceId,
} from '../src/lib/sync/syncLedger.js';
import {
  saveNovel,
  saveChaptersBulk,
  deleteNovelDB,
} from '../src/lib/db.js';
import {
  addToLibrary,
  getLibrary,
  updateLibraryItem,
  saveReadingProgress,
  getReadingProgress,
  saveReadingSettings,
  getReadingSettings,
  setVaultPassword,
  getVaultPasswordInfo,
  hideNovel,
  unhideNovel,
  notifyLibraryChanged,
  onLibraryChange,
} from '../src/lib/storage.js';
import {
  getActiveProfile,
  setActiveProfile,
  getCultivationState,
  getCultivationKey,
  saveCultivationState,
} from '../src/lib/cultivation.js';

console.log('=== BẮT ĐẦU CHẠY TOÀN BỘ CÁC BÀI TEST TỰ ĐỘNG SYNC (1-40) ===\n');

// -------------------------------------------------------------
// TEST 1: Truyện mới ở máy -> Đẩy lên Cloud
// -------------------------------------------------------------
console.log('--- Test 1: Truyện mới ở máy -> Đẩy lên cloud ---');
global.localStorage.clear();
mockDB.novels.clear();
mockDB.chapters.clear();

const supabaseMock = new MockSupabaseClient('user_123');

// Tạo truyện ở local
const novel1 = { id: 'nov_1', title: 'Truyện Mới 1', description: 'Mô tả 1', coverUrl: 'data:image/jpeg;base64,abc' };
const chaps1 = [
  { id: 'ch_1_1', novelId: 'nov_1', chapterNumber: 1, title: 'Chương 1', content: 'Nội dung chương 1', order: 1 },
  { id: 'ch_1_2', novelId: 'nov_1', chapterNumber: 2, title: 'Chương 2', content: 'Nội dung chương 2', order: 2 },
];
await saveNovel(novel1);
await saveChaptersBulk(chaps1);
addToLibrary({ id: 'nov_1', title: 'Truyện Mới 1', chapterCount: 2, coverThumb: '' });

// Đồng bộ
const res1 = await performSync(supabaseMock);
assert.strictEqual(res1.pushedNovels, 1, 'Phải đẩy 1 truyện mới lên cloud');
assert.strictEqual(res1.pulledNovels, 0);

// Kiểm tra cloud
const cloudRow1 = supabaseMock.tables.novels.get('user_123:nov_1');
assert(cloudRow1, 'Dòng novels trên cloud phải tồn tại');
assert.strictEqual(cloudRow1.title, 'Truyện Mới 1');
assert.strictEqual(cloudRow1.chapter_count, 2);
assert(supabaseMock.storageBuckets.novels.has(cloudRow1.content_path), 'File nén trong bucket phải tồn tại');

// Kiểm tra ledger
const ledger1 = getSyncLedger();
assert(ledger1.novels.nov_1.lastPushedContentAt > 0, 'Ledger phải ghi nhận lastPushedContentAt');
console.log('✓ Test 1 Passed: Truyện mới ở máy được nén và đẩy lên cloud thành công!');


// -------------------------------------------------------------
// TEST 2: Truyện mới ở cloud -> Kéo về máy
// -------------------------------------------------------------
console.log('\n--- Test 2: Truyện mới ở cloud -> Kéo về máy ---');
// Giả lập máy 2 (local trống)
global.localStorage.clear();
mockDB.novels.clear();
mockDB.chapters.clear();

// Trên cloud đã có truyện nov_1 từ Test 1
const res2 = await performSync(supabaseMock);
assert.strictEqual(res2.pulledNovels, 1, 'Máy 2 phải kéo 1 truyện từ cloud về');

const localNov1 = await getNovel('nov_1');
assert(localNov1, 'Truyện nov_1 phải có trong IndexedDB máy 2');
assert.strictEqual(localNov1.title, 'Truyện Mới 1');

const localChaps1 = await getChapters('nov_1');
assert.strictEqual(localChaps1.length, 2, 'Cả 2 chương phải được lưu đầy đủ');
assert.strictEqual(localChaps1[0].id, 'ch_1_1', 'ID chương phải được bảo toàn nguyên vẹn');
assert.strictEqual(localChaps1[0].content, 'Nội dung chương 1');

const lib2 = getLibrary();
assert.strictEqual(lib2.length, 1, 'Thư viện local phải có 1 truyện');
console.log('✓ Test 2 Passed: Truyện mới ở cloud được tải về, giải nén và bảo toàn ID chương thành công!');


// -------------------------------------------------------------
// TEST 3: Cả hai cùng sửa nội dung -> Báo xung đột, không tự ghi đè
// -------------------------------------------------------------
console.log('\n--- Test 3: Cả hai cùng sửa nội dung -> Xung đột & lựa chọn ---');
// Local sửa nội dung
await saveChaptersBulk([
  { id: 'ch_1_1', novelId: 'nov_1', chapterNumber: 1, title: 'Chương 1 Sửa Local', content: 'Local edit', order: 1 },
]);
markNovelDirty('nov_1');

// Cloud cũng sửa nội dung
const cloudContentPath = supabaseMock.tables.novels.get('user_123:nov_1').content_path;
const updatedCloudChaps = [
  { id: 'ch_1_1', novelId: 'nov_1', chapterNumber: 1, title: 'Chương 1 Sửa Cloud', content: 'Cloud edit', order: 1 },
];
const { blob: cloudBlob } = await compressChapters(JSON.stringify(updatedCloudChaps));
await supabaseMock.storage.from('novels').upload(cloudContentPath, cloudBlob);
await supabaseMock.from('novels').update({
  content_updated_at: Date.now() + 10000,
}).eq('user_id', 'user_123').eq('id', 'nov_1');

// Đồng bộ với callback xung đột chọn 'skip'
let conflictTriggered = false;
const res3 = await performSync(supabaseMock, {
  onConflictNovel: async (conflictInfo) => {
    conflictTriggered = true;
    assert.strictEqual(conflictInfo.novelId, 'nov_1');
    return 'skip'; // Người dùng chọn bỏ qua
  },
});

assert(conflictTriggered, 'Phải kích hoạt callback xung đột khi cả 2 bên cùng sửa');
assert.strictEqual(res3.conflicts, 1, 'Số xung đột phải là 1');

// Kiểm tra nội dung local vẫn giữ bản local edit
const chapAfterSkip = (await getChapters('nov_1'))[0];
assert.strictEqual(chapAfterSkip.content, 'Local edit', 'Khi chọn skip, nội dung local không bị ghi đè');
console.log('✓ Test 3 Passed: Phát hiện xung đột nội dung chính xác, tôn trọng quyết định người dùng!');


// -------------------------------------------------------------
// TEST 4: Xóa truyện lan sang máy kia qua bia mộ (Tombstone)
// -------------------------------------------------------------
console.log('\n--- Test 4: Xóa truyện lan sang máy kia qua Tombstone ---');
// Máy 1 xóa nov_1
recordNovelTombstone('nov_1', Date.now());
await deleteNovelDB('nov_1');
import { removeFromLibrary } from '../src/lib/storage.js';
removeFromLibrary('nov_1');

// Máy 1 đồng bộ
await performSync(supabaseMock);
const cloudDeletedNov = supabaseMock.tables.novels.get('user_123:nov_1');
assert(cloudDeletedNov.deleted_at > 0, 'Cloud row phải được gắn deleted_at');
assert(!supabaseMock.storageBuckets.novels.has(cloudContentPath), 'File nén trong bucket phải bị xóa');

// Giả lập máy 2 (vẫn đang có nov_1)
mockDB.novels.set('nov_1', { id: 'nov_1', title: 'Truyện Mới 1' });
addToLibrary({ id: 'nov_1', title: 'Truyện Mới 1', updatedAt: Date.now() - 5000 });

// Máy 2 đồng bộ -> Nhận bia mộ và xóa truyện local
await performSync(supabaseMock);
assert(!mockDB.novels.has('nov_1'), 'Máy 2 phải tự động xóa nov_1 trong IndexedDB');
assert(!getLibrary().some(n => n.id === 'nov_1'), 'Máy 2 phải tự động xóa nov_1 khỏi Library');
console.log('✓ Test 4 Passed: Bia mộ (Tombstones) lan truyền và dọn dẹp chính xác trên các thiết bị!');


// -------------------------------------------------------------
// TEST 5: Mật khẩu Mật Thất (mới hơn / cũ hơn / một bên trống)
// -------------------------------------------------------------
console.log('\n--- Test 5: Đồng bộ Mật khẩu Mật Thất ---');
global.localStorage.clear();

// A. Local có mật khẩu, Cloud trống -> Đẩy lên cloud
setVaultPassword('mat_khau_1', 'goi_y_1');
await syncVaultPassword(supabaseMock, 'user_123');
let cloudSettings = (await supabaseMock.from('user_settings').select('*').eq('user_id', 'user_123').single()).data;
assert(cloudSettings.data.vault.hash, 'Cloud phải nhận mật khẩu từ local');
assert.strictEqual(cloudSettings.data.vault.hint, 'goi_y_1');

// B. Cloud có mật khẩu mới hơn -> Kéo về local
const olderLocalTime = Date.now() - 10000;
global.localStorage.setItem('tcl_vault_pwd_updated_at', String(olderLocalTime));
cloudSettings.data.vault.hint = 'goi_y_moi_tu_cloud';
cloudSettings.data.vault.updatedAt = Date.now();
await supabaseMock.from('user_settings').upsert(cloudSettings);

await syncVaultPassword(supabaseMock, 'user_123');
const localVault = getVaultPasswordInfo();
assert.strictEqual(localVault.hint, 'goi_y_moi_tu_cloud', 'Local phải cập nhật gợi ý mới từ cloud');

// C. TUYỆT ĐỐI không ghi đè mật khẩu local bằng giá trị rỗng
cloudSettings.data.vault = { hash: null, hint: null, updatedAt: Date.now() + 5000 };
await supabaseMock.from('user_settings').upsert(cloudSettings);
await syncVaultPassword(supabaseMock, 'user_123');
assert(getVaultPasswordInfo().hash, 'Mật khẩu local không bao giờ bị xóa trắng bởi cloud rỗng');

console.log('✓ Test 5 Passed: Đồng bộ mật khẩu Mật Thất an toàn, không bao giờ mất mật khẩu cục bộ!');


// -------------------------------------------------------------
// TEST 6: Tu luyện (Hồ sơ Thật vs Sandbox; một bên đổi; cả hai đổi)
// -------------------------------------------------------------
console.log('\n--- Test 6: Đồng bộ Tu Vi (Sandbox KHÔNG BAO GIỜ bị gửi) ---');
global.localStorage.clear();

// A. THỬ NGHIỆM SANDBOX: Phải bỏ qua 100%
setActiveProfile('sandbox');
global.localStorage.setItem('tcl_cultivation_state_v3__sandbox', JSON.stringify({ realm: 'kim_dan', totalExp: 999999, _rev: 50 }));
const sandRes = await syncCultivation(supabaseMock, 'user_123');
assert(sandRes.skipped, 'Hồ sơ sandbox phải bị từ chối đồng bộ');
assert(!supabaseMock.tables.cultivation.has('user_123'), 'Cloud không bao giờ có dữ liệu của sandbox');

// B. HỒ SƠ THẬT: Chỉ máy đổi -> Đẩy lên cloud
setActiveProfile('real');
const realState = { realm: 'truc_co', totalExp: 50000, _rev: 3, readChapterIds: { 'ch_1': Date.now() } };
global.localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(realState));
const realRes1 = await syncCultivation(supabaseMock, 'user_123');
assert(realRes1.pushedToCloud, 'Hồ sơ Thật phải được đẩy lên cloud');

const cloudCult = supabaseMock.tables.cultivation.get('user_123');
assert.strictEqual(cloudCult.rev, 3);
assert.strictEqual(cloudCult.state.totalExp, 50000);

// C. CẢ HAI CÙNG ĐỔI -> Xung đột, người dùng chọn cloud
realState._rev = 5;
realState.totalExp = 60000;
realState.readChapterIds = { 'ch_1': 1000, 'ch_2': 2000 };
global.localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(realState));

cloudCult.rev = 6;
cloudCult.state.totalExp = 80000;
cloudCult.state.readChapterIds = { 'ch_1': 1000, 'ch_2': 2000, 'ch_3': 3000 };
cloudCult.updated_at = Date.now() + 5000;
supabaseMock.tables.cultivation.set('user_123', cloudCult);

let cultConflictTriggered = false;
const realRes2 = await syncCultivation(supabaseMock, 'user_123', {
  onConflictCultivation: async (info) => {
    cultConflictTriggered = true;
    assert.strictEqual(info.local.totalExp, 60000);
    assert.strictEqual(info.local.readChapterCount, 2, 'Local phải đếm được 2 chương đọc dạng dict');
    assert.strictEqual(info.cloud.totalExp, 80000);
    assert.strictEqual(info.cloud.readChapterCount, 3, 'Cloud phải đếm được 3 chương đọc dạng dict');
    return 'cloud'; // Người dùng chọn cloud
  },
});

assert(cultConflictTriggered, 'Phải kích hoạt hộp thoại xung đột tu vi');
assert(realRes2.updatedFromCloud, 'Phải cập nhật từ cloud khi chọn cloud');

// Kiểm tra backup tự động được tạo trước khi ghi đè
let hasBackup = false;
for (let i = 0; i < localStorage.length; i++) {
  if (localStorage.key(i).startsWith('tcl_cultivation_backup_')) hasBackup = true;
}
assert(hasBackup, 'Phải tự động sao lưu tu vi cục bộ cũ trước khi nhận bản cloud');
console.log('✓ Test 6 Passed: Sandbox không bao giờ gửi, giải quyết xung đột tu vi và sao lưu tự động hoàn hảo!');


// -------------------------------------------------------------
// TEST 7: Đồng hồ ngộ đạo (cultivation_pending_seconds) đi kèm tu vi
// -------------------------------------------------------------
console.log('\n--- Test 7: Đồng hồ ngộ đạo đi cùng bản tu vi thắng ---');
global.localStorage.clear();
supabaseMock.tables.cultivation.clear();
setActiveProfile('real');

// Khi máy đẩy lên: pending_seconds được đính kèm vào __meta
global.localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify({ realm: 'truc_co', totalExp: 10000, _rev: 1, readChapterIds: { 'ch_1': 123 } }));
global.localStorage.setItem('cultivation_pending_seconds', '42');

await syncCultivation(supabaseMock, 'user_123');
const cloudRowCult = supabaseMock.tables.cultivation.get('user_123');
assert.strictEqual(cloudRowCult.state.__meta?.pendingSeconds, 42, 'Cloud phải nhận pendingSeconds trong __meta');

// Khi kéo về máy khác: __meta được tách ra và lưu vào cultivation_pending_seconds, không lẫn vào state
global.localStorage.clear();
setActiveProfile('real');
await syncCultivation(supabaseMock, 'user_123');

const pulledSeconds = global.localStorage.getItem('cultivation_pending_seconds');
assert.strictEqual(pulledSeconds, '42', 'Máy kéo về phải nhận đúng 42 giây');

const pulledState = JSON.parse(global.localStorage.getItem('tcl_cultivation_state_v3'));
assert.strictEqual(pulledState.__meta, undefined, '__meta không được lưu lẫn vào state tu luyện cục bộ');
console.log('✓ Test 7 Passed: Đồng hồ ngộ đạo đi kèm tu vi và phân tách payload chuẩn xác!');


// -------------------------------------------------------------
// TEST 8: Lần đầu đồng bộ khi cả 2 bên đều có dữ liệu (dict readChapterIds)
// -------------------------------------------------------------
console.log('\n--- Test 8: Lần đầu đồng bộ khi cả 2 bên có dữ liệu (3 lựa chọn & cảnh báo) ---');
const localLib = [{ id: 'local_1', title: 'Tiêu Đề Trùng', updatedAt: 1000 }];
const localCult = { realm: 'kim_dan', totalExp: 100000, readChapterIds: { '1': 1, '2': 2, '3': 3 } };
const cloudNovList = [{ id: 'cloud_1', title: 'Tiêu Đề Trùng', updated_at: 1000 }];
const cloudCultObj = { rev: 2, updated_at: 1000, state: { realm: 'truc_co', totalExp: 30000, readChapterIds: { '1': 1 } } };

const firstCheck = checkFirstSyncCondition({
  cloudNovels: cloudNovList,
  cloudCultivation: cloudCultObj,
  localLibrary: localLib,
  localCultivation: localCult,
  ledger: {},
});

assert(firstCheck.bothHaveData, 'Phải phát hiện cả 2 bên đều có dữ liệu');
assert(firstCheck.isLocalAhead, 'Phải phát hiện máy này đang tiến xa hơn cloud (100k > 30k tu vi)');
assert.strictEqual(firstCheck.localSummary.readChapterCount, 3, 'Đếm đúng số chương đã đọc dạng dict ở local');
assert.strictEqual(firstCheck.cloudSummary.readChapterCount, 1, 'Đếm đúng số chương đã đọc dạng dict ở cloud');
assert.strictEqual(firstCheck.duplicatePairs.length, 1, 'Phải phát hiện cặp truyện trùng tiêu đề');
assert.strictEqual(firstCheck.duplicatePairs[0].title, 'Tiêu Đề Trùng');

console.log('✓ Test 8 Passed: Phát hiện đúng lần đầu đồng bộ, cảnh báo đỏ và đếm chương đọc dict chính xác!');


// -------------------------------------------------------------
// TEST 9: Đồng bộ 2 lần liên tiếp không đổi gì (Idempotency & Không hỏi xung đột)
// -------------------------------------------------------------
console.log('\n--- Test 9: Đồng bộ 2 lần liên tiếp không đổi gì (Idempotency & Không hỏi xung đột) ---');
global.localStorage.clear();
mockDB.novels.clear();
mockDB.chapters.clear();
supabaseMock.tables.novels.clear();
supabaseMock.tables.progress.clear();
supabaseMock.tables.cultivation.clear();
supabaseMock.storageBuckets.novels.clear();

// Chuẩn bị truyện local và tu vi
const novel9 = { id: 'nov_9', title: 'Truyện Idempotent', description: 'Mô tả', coverUrl: '' };
await saveNovel(novel9);
await saveChaptersBulk([{ id: 'ch_9_1', novelId: 'nov_9', chapterNumber: 1, title: 'C1', content: 'Cont', order: 1 }]);
addToLibrary({ id: 'nov_9', title: 'Truyện Idempotent', chapterCount: 1, updatedAt: 1000 });

setActiveProfile('real');
const cultState9 = { realm: 'nguyen_anh', totalExp: 250000, _rev: 5, readChapterIds: { 'ch_9_1': 1000 } };
global.localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(cultState9));

// Lần 1: Đồng bộ bình thường
const run1 = await performSync(supabaseMock);
assert.strictEqual(run1.success, true);
assert.strictEqual(run1.pushedNovels, 1);
assert.strictEqual(run1.cultivationPushedToCloud, true);

// Kiểm tra ledger sau lần 1: cultivation.lastSyncedRev phải bằng _rev (5)
const ledgerAfterRun1 = getSyncLedger();
assert.strictEqual(ledgerAfterRun1.cultivation?.lastSyncedRev, 5, 'ledger.cultivation.lastSyncedRev phải bằng _rev (5)');
assert(ledgerAfterRun1.lastSyncedAt > 0, 'lastSyncedAt phải được ghi nhận khi thành công');

// Lần 2: Chạy lại ngay lập tức (không đổi gì)
// Đặt handler ném lỗi nếu bị kích hoạt hỏi xung đột
const run2 = await performSync(supabaseMock, {
  onConflictNovel: () => { throw new Error('Không được hỏi xung đột novel khi không có thay đổi!'); },
  onConflictCultivation: () => { throw new Error('Không được hỏi xung đột cultivation khi không có thay đổi!'); },
});

assert.strictEqual(run2.success, true, 'Lần 2 phải thành công');
assert.strictEqual(run2.pushedNovels, 0, 'Lần 2 không được đẩy truyện nào');
assert.strictEqual(run2.pulledNovels, 0, 'Lần 2 không được kéo truyện nào');
assert.strictEqual(run2.conflicts, 0, 'Lần 2 không có xung đột');
assert.strictEqual(run2.cultivationPushedToCloud, false, 'Lần 2 không được đẩy lại tu vi');
assert.strictEqual(run2.cultivationUpdatedFromCloud, false, 'Lần 2 không được kéo lại tu vi');
assert.strictEqual(run2.errors.length, 0, 'Lần 2 không có lỗi');
assert.strictEqual(getSyncLedger().cultivation?.lastSyncedRev, 5, 'lastSyncedRev vẫn được giữ nguyên là 5');
console.log('✓ Test 9 Passed: Hai lần sync liên tiếp không đổi gì thì lần 2 không đẩy lại và không hỏi xung đột!');


// -------------------------------------------------------------
// TEST 10: Giả lập lỗi Supabase ({error}) -> nothing-marked-synced, giữ dirty & tombstones
// -------------------------------------------------------------
console.log('\n--- Test 10: Giả lập lỗi Supabase ({error}) -> Không ghi nhận đã đồng bộ, giữ dirty flag & tombstones ---');

// A. Lỗi upload storage khi đẩy truyện mới
const novel10 = { id: 'nov_10_err', title: 'Truyện Lỗi Storage', description: 'Mô tả', coverUrl: '' };
await saveNovel(novel10);
await saveChaptersBulk([{ id: 'ch_10_1', novelId: 'nov_10_err', chapterNumber: 1, title: 'C1', content: 'Cont', order: 1 }]);
addToLibrary({ id: 'nov_10_err', title: 'Truyện Lỗi Storage', chapterCount: 1, updatedAt: 2000 });
markNovelDirty('nov_10_err');

// Bật cờ lỗi storage upload
supabaseMock.simulatedErrors.storageUpload = true;

const resErr1 = await performSync(supabaseMock);
assert.strictEqual(resErr1.success, false, 'Khi có lỗi ghi Supabase, performSync phải trả success: false');
assert(resErr1.errors.length > 0, 'Phải có lỗi trong danh sách errors');
assert(resErr1.errors.some(e => e.includes('Simulated storage upload error')), 'Phải chứa thông báo lỗi storage upload');

// Kiểm tra: Không được đánh dấu đã đồng bộ
const dirtyAfterErr = getDirtyNovels();
assert(dirtyAfterErr['nov_10_err'], 'Dirty flag của nov_10_err KHÔNG được xóa khi gặp lỗi upload');
const ledgerAfterErr = getSyncLedger();
assert(!ledgerAfterErr.novels['nov_10_err']?.lastPushedContentAt, 'Ledger KHÔNG được ghi nhận lastPushedContentAt khi gặp lỗi');

// B. Lỗi xóa storage khi xử lý tombstone
supabaseMock.simulatedErrors.storageUpload = false;
// Giả lập nov_tomb đang có trên cloud
supabaseMock.tables.novels.set('user_123:nov_tomb', {
  user_id: 'user_123',
  id: 'nov_tomb',
  title: 'Truyện Bị Xóa',
  content_path: 'user_123/nov_tomb.json.gz',
  deleted_at: null,
});
supabaseMock.storageBuckets.novels.set('user_123/nov_tomb.json.gz', 'content');
recordNovelTombstone('nov_tomb', Date.now());

// Bật cờ lỗi storage remove
supabaseMock.simulatedErrors.storageRemove = true;
const resErr2 = await performSync(supabaseMock);
assert.strictEqual(resErr2.success, false);
assert(resErr2.errors.some(e => e.includes('Simulated storage remove error')), 'Phải bắt lỗi storage remove');
const tombstonesAfterErr = getTombstones();
assert(tombstonesAfterErr['nov_tomb'], 'Tombstone KHÔNG được xóa khi thao tác xóa trên Supabase bị lỗi');

// C. Lỗi upsert tu vi
supabaseMock.simulatedErrors.storageRemove = false;
// Thay đổi tu vi cục bộ
const cultState10 = { realm: 'hoa_than', totalExp: 500000, _rev: 10, readChapterIds: { 'ch_1': 1 } };
global.localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(cultState10));

// Bật cờ lỗi cultivation upsert
supabaseMock.simulatedErrors.cultivationUpsert = true;
const resErr3 = await performSync(supabaseMock);
assert.strictEqual(resErr3.success, false);
assert(resErr3.errors.some(e => e.includes('Simulated cultivation upsert error')), 'Phải bắt lỗi cultivation upsert');
const ledgerAfterCultErr = getSyncLedger();
assert.notStrictEqual(ledgerAfterCultErr.cultivation?.lastSyncedRev, 10, 'lastSyncedRev KHÔNG được cập nhật lên 10 khi upsert lỗi');

console.log('✓ Test 10 Passed: Kiểm tra chặt chẽ {error} Supabase, nothing-marked-synced, giữ nguyên dirty & tombstone!');


// -------------------------------------------------------------
// TEST 11: Khôi phục sau lỗi -> Sync lại thành công trọn vẹn
// -------------------------------------------------------------
console.log('\n--- Test 11: Sau khi hết lỗi, sync lại lần nữa thì toàn bộ dữ liệu lên cloud đủ ---');

// Tắt toàn bộ giả lập lỗi
supabaseMock.simulatedErrors.storageUpload = false;
supabaseMock.simulatedErrors.storageRemove = false;
supabaseMock.simulatedErrors.cultivationUpsert = false;
supabaseMock.simulatedErrors.novelsUpsert = false;
supabaseMock.simulatedErrors.novelsUpdate = false;

// Sync lại
const resRecover = await performSync(supabaseMock);
assert.strictEqual(resRecover.success, true, 'Sau khi sửa lỗi kết nối, performSync phải thành công 100%');
assert.strictEqual(resRecover.errors.length, 0, 'Không còn lỗi nào');

// Kiểm tra nov_10_err đã được đẩy lên cloud và xóa dirty
const cloudNov10 = supabaseMock.tables.novels.get('user_123:nov_10_err');
assert(cloudNov10, 'Truyện nov_10_err phải được đưa lên bảng novels');
assert(supabaseMock.storageBuckets.novels.has(cloudNov10.content_path), 'File nén của nov_10_err phải được tải lên storage');
assert(!getDirtyNovels()['nov_10_err'], 'Dirty flag của nov_10_err phải được xóa sạch sau khi sync thành công');

// Kiểm tra tombstone nov_tomb đã hoàn tất dọn dẹp
const cloudTombRow = supabaseMock.tables.novels.get('user_123:nov_tomb');
assert(cloudTombRow.deleted_at > 0, 'deleted_at của nov_tomb phải được ghi nhận');
assert(!supabaseMock.storageBuckets.novels.has('user_123/nov_tomb.json.gz'), 'File storage của nov_tomb phải bị xóa');
assert(!getTombstones()['nov_tomb'], 'Tombstone nov_tomb cục bộ phải được xóa sạch');

// Kiểm tra tu vi đã lên cloud với _rev = 10
const cloudCultRecovered = supabaseMock.tables.cultivation.get('user_123');
assert.strictEqual(cloudCultRecovered.rev, 10, 'Cloud cultivation rev phải đạt 10');
assert.strictEqual(cloudCultRecovered.state.totalExp, 500000, 'Cloud cultivation totalExp phải đạt 500.000');
assert.strictEqual(getSyncLedger().cultivation?.lastSyncedRev, 10, 'lastSyncedRev trong ledger phải bằng 10');
assert(getSyncLedger().lastSyncedAt > 0, 'lastSyncedAt phải được ghi nhận');

console.log('✓ Test 11 Passed: Khôi phục sau lỗi hoàn hảo, toàn bộ dữ liệu tồn đọng được đồng bộ trọn vẹn lên cloud!');



// -------------------------------------------------------------
// TEST 12: Phục hồi updatedAt cho tiến độ cũ & normalizeTitle
// -------------------------------------------------------------
console.log('\n--- Test 12: Tiến độ đọc cũ không có updatedAt được bù và đẩy lên cloud ---');

// Kiểm tra normalizeTitle
assert.strictEqual(normalizeTitle('Thần Đạo Đan Tôn'), 'than dao dan ton');
assert.strictEqual(normalizeTitle('  ĐẠI KỶ NGUYÊN (Bản Chuẩn)!! '), 'dai ky nguyen ban chuan');
assert.strictEqual(normalizeTitle('Đế Bá'), 'de ba');
assert.strictEqual(normalizeTitle('dế bá'), 'de ba');

// Thêm novel vào local
await saveNovel({ id: 'nov_prog_old', title: 'Truyện Tiến Độ Cũ 1', totalChapters: 20 });
addToLibrary({ id: 'nov_prog_old', title: 'Truyện Tiến Độ Cũ 1', totalChapters: 20 });
await saveNovel({ id: 'nov_prog_old2', title: 'Truyện Tiến Độ Cũ 2', totalChapters: 10 });
addToLibrary({ id: 'nov_prog_old2', title: 'Truyện Tiến Độ Cũ 2', totalChapters: 10 });

// Giả lập tiến độ đọc cũ KHÔNG có updatedAt
global.localStorage.setItem('tcl_progress_nov_prog_old', JSON.stringify({ chapterId: 'ch_10', title: 'Chương 10' }));
// Có scroll_pos với trường time
global.localStorage.setItem('scroll_pos_nov_prog_old_ch_10', JSON.stringify({ pos: 500, time: 1600000000000 }));

// nov_prog_old2 không có scroll_pos
global.localStorage.setItem('tcl_progress_nov_prog_old2', JSON.stringify({ chapterId: 'ch_1', title: 'Chương 1' }));

// Đồng bộ tiến độ đọc khi cloud chưa có dòng nào
const progSyncRes = await syncReadingProgress(supabaseMock, 'user_123', ['nov_prog_old', 'nov_prog_old2'], {});
assert.strictEqual(progSyncRes.progressPushed, 2, 'Cả 2 tiến độ đọc phải được đẩy lên cloud');

// Kiểm tra local đã được bù updatedAt
const localProg1 = getReadingProgress('nov_prog_old');
assert.strictEqual(localProg1.updatedAt, 1600000000000, 'updatedAt phải được lấy từ scroll_pos');
assert.strictEqual(localProg1.chapterId, 'ch_10', 'Giữ nguyên chapterId');

const localProg2 = getReadingProgress('nov_prog_old2');
assert(localProg2.updatedAt > 0, 'updatedAt phải được bù bằng Date.now()');
assert.strictEqual(localProg2.chapterId, 'ch_1', 'Giữ nguyên chapterId');

// Kiểm tra cloud nhận được đúng row
const cloudProg1 = supabaseMock.tables.progress.get('user_123:nov_prog_old');
assert(cloudProg1, 'Cloud phải có row progress cho nov_prog_old');
assert.strictEqual(cloudProg1.data.chapterId, 'ch_10');
assert.strictEqual(cloudProg1.updated_at, 1600000000000);

const cloudProg2 = supabaseMock.tables.progress.get('user_123:nov_prog_old2');
assert(cloudProg2, 'Cloud phải có row progress cho nov_prog_old2');
assert.strictEqual(cloudProg2.data.chapterId, 'ch_1');

console.log('✓ Test 12 Passed: Tiến độ cũ không có updatedAt được bù chính xác và đẩy lên cloud!');


// -------------------------------------------------------------
// TEST 13: Trùng tên chuẩn hóa khác ID bị chặn không đẩy (duplicateSkipped)
// -------------------------------------------------------------
console.log('\n--- Test 13: Trùng tên chuẩn hóa khác ID bị chặn không đẩy (duplicateSkipped) ---');

// Giả lập trên cloud có truyện "Thần Đạo Đan Tôn" id: "cloud_tddt"
supabaseMock.tables.novels.set('user_123:cloud_tddt', {
  user_id: 'user_123',
  id: 'cloud_tddt',
  title: 'Thần Đạo Đan Tôn',
  content_path: 'user_123/cloud_tddt.json.gz',
  deleted_at: null,
  updated_at: Date.now(),
});
const { blob: dummyBlob } = await compressChapters(JSON.stringify([{ id: 'ch_tddt_cloud_1', novelId: 'cloud_tddt', title: 'Chương 1', order: 1, content: 'test cloud' }]));
supabaseMock.storageBuckets.novels.set('user_123/cloud_tddt.json.gz', dummyBlob);

// Giả lập ở local có truyện id: "local_tddt", tên không dấu / chữ hoa "THAN DAO DAN TON"
await saveNovel({ id: 'local_tddt', title: 'THAN DAO DAN TON', totalChapters: 5 });
await saveChaptersBulk([{ id: 'ch_tddt_1', novelId: 'local_tddt', title: 'Chương 1', order: 1, content: 'test' }]);
addToLibrary({ id: 'local_tddt', title: 'THAN DAO DAN TON', totalChapters: 5 });
markNovelDirty('local_tddt');

// Kiểm tra checkFirstSyncCondition
const firstSyncCheck = checkFirstSyncCondition({
  cloudNovels: [{ id: 'cloud_tddt', title: 'Thần Đạo Đan Tôn' }],
  localLibrary: [{ id: 'local_tddt', title: 'THAN DAO DAN TON' }],
  cloudCultivation: null,
  localCultivation: null,
});
assert.strictEqual(firstSyncCheck.duplicatePairs.length, 1, 'checkFirstSyncCondition phải phát hiện cặp trùng');
assert.strictEqual(firstSyncCheck.duplicatePairs[0].localId, 'local_tddt');
assert.strictEqual(firstSyncCheck.duplicatePairs[0].cloudId, 'cloud_tddt');

// Chạy performSync
const resDup = await performSync(supabaseMock);
assert(resDup.duplicateSkipped.length >= 1, 'Phải ghi nhận duplicateSkipped');
const dupItem = resDup.duplicateSkipped.find(d => d.localId === 'local_tddt');
assert(dupItem, 'local_tddt phải nằm trong danh sách duplicateSkipped');
assert.strictEqual(dupItem.cloudId, 'cloud_tddt');

// Đảm bảo local_tddt KHÔNG được đẩy lên cloud
assert(!supabaseMock.tables.novels.has('user_123:local_tddt'), 'Truyện trùng tên local_tddt không được đẩy lên cloud');
assert(!supabaseMock.storageBuckets.novels.has('user_123/local_tddt.json.gz'), 'Storage không được upload local_tddt');

// Đảm bảo truyện trên máy không bị tự động xóa
const localNovelStillExists = await getNovel('local_tddt');
assert(localNovelStillExists, 'Truyện local không bị tự động xóa khi chưa có tương tác người dùng');

console.log('✓ Test 13 Passed: Trùng tên chuẩn hóa khác ID bị chặn thành công, ghi nhận duplicateSkipped!');


// -------------------------------------------------------------
// TEST 14: Chế độ cloud_master không đẩy local-only và không xóa progress local khi cloud rỗng
// -------------------------------------------------------------
console.log('\n--- Test 14: Chế độ cloud_master không đẩy local-only và không xóa progress local khi cloud rỗng ---');

// Tạo truyện local-only không trùng tên ai
await saveNovel({ id: 'nov_local_master_only', title: 'Truyện Của Riêng Máy Này', totalChapters: 3 });
addToLibrary({ id: 'nov_local_master_only', title: 'Truyện Của Riêng Máy Này', totalChapters: 3 });
markNovelDirty('nov_local_master_only');

// Lưu tiến độ đọc cho truyện này
saveReadingProgress('nov_local_master_only', { chapterId: 'ch_m_2', title: 'Chương 2', updatedAt: Date.now() });

// Trên cloud KHÔNG có truyện này và KHÔNG có progress cho truyện này
assert(!supabaseMock.tables.novels.has('user_123:nov_local_master_only'));
assert(!supabaseMock.tables.progress.has('user_123:nov_local_master_only'));

// Chạy sync với mode: 'cloud_master'
const resMaster = await performSync(supabaseMock, { mode: 'cloud_master' });
assert(resMaster.localOnlySkipped >= 1, 'localOnlySkipped phải ghi nhận ít nhất 1 truyện');
assert(!supabaseMock.tables.novels.has('user_123:nov_local_master_only'), 'cloud_master không được đẩy truyện local-only lên cloud');

// Tiến độ đọc của nov_local_master_only trên local KHÔNG bị xóa
const keptProgress = getReadingProgress('nov_local_master_only');
assert(keptProgress, 'Tiến độ đọc trên máy phải được giữ nguyên');
assert.strictEqual(keptProgress.chapterId, 'ch_m_2', 'chapterId phải còn nguyên vẹn');

// Giả lập cloud CÓ progress cho truyện nov_prog_old (được cập nhật trên cloud với chapter mới hơn)
supabaseMock.tables.progress.set('user_123:nov_prog_old', {
  user_id: 'user_123',
  novel_id: 'nov_prog_old',
  data: { chapterId: 'ch_99', title: 'Chương 99', updatedAt: 2000000000000 },
  updated_at: 2000000000000,
});

// Chạy lại cloud_master
const resMasterPull = await performSync(supabaseMock, { mode: 'cloud_master' });
assert(resMasterPull.progressPulled >= 1, 'Phải kéo tiến độ đọc từ cloud về khi cloud có');
const pulledProgress = getReadingProgress('nov_prog_old');
assert.strictEqual(pulledProgress.chapterId, 'ch_99', 'Tiến độ đã được ghi đè từ cloud');

console.log('✓ Test 14 Passed: cloud_master không đẩy local-only và không xóa progress local khi cloud rỗng!');



// =============================================================
// PHASE 2 TESTS (15 - 23)
// =============================================================

// -------------------------------------------------------------
// TEST 15 (a): Host không phải github.io: auto không chạy
// -------------------------------------------------------------
console.log('\n--- Test 15 (a): Host không phải github.io -> auto không chạy ---');
setHostOverrideForTesting('localhost');
assert.strictEqual(isProductionHost(), false);
assert.strictEqual(isAutoSyncEnabled(), false, 'Trên localhost, isAutoSyncEnabled luôn trả về false');
const resHost1 = await runAutoSync(supabaseMock);
assert.strictEqual(resHost1.skipped, true);
assert.strictEqual(resHost1.reason, 'not_production_host');

setHostOverrideForTesting('preview.vercel.app');
assert.strictEqual(isProductionHost(), false);
const resHost2 = await runAutoSync(supabaseMock);
assert.strictEqual(resHost2.skipped, true);
assert.strictEqual(resHost2.reason, 'not_production_host');
console.log('✓ Test 15 Passed: Host không phải github.io tự động bỏ qua hoàn toàn!');

// -------------------------------------------------------------
// TEST 16 (b): Sandbox: auto không chạy
// -------------------------------------------------------------
console.log('\n--- Test 16 (b): Hồ sơ Sandbox -> auto không chạy ---');
setHostOverrideForTesting('my-user.github.io');
assert.strictEqual(isProductionHost(), true);
setActiveProfile('sandbox');
assert.strictEqual(getActiveProfile(), 'sandbox');
const resSandbox = await runAutoSync(supabaseMock);
assert.strictEqual(resSandbox.skipped, true);
assert.strictEqual(resSandbox.reason, 'sandbox_profile');
setActiveProfile('real');
console.log('✓ Test 16 Passed: Hồ sơ Sandbox tuyệt đối không bao giờ chạy auto sync!');

// -------------------------------------------------------------
// TEST 17 (c): Hai lần chạy chồng chỉ chạy một (concurrency lock)
// -------------------------------------------------------------
console.log('\n--- Test 17 (c): Hai lần chạy chồng chỉ chạy một (concurrency lock) ---');
releaseSyncLock();
const lock1 = acquireSyncLock();
assert.strictEqual(lock1, true, 'Lần đầu xin lock phải thành công');
const lock2 = acquireSyncLock();
assert.strictEqual(lock2, false, 'Lần 2 xin lock khi lock đang giữ phải trả về false');
const resLocked = await runAutoSync(supabaseMock);
assert.strictEqual(resLocked.skipped, true);
assert.strictEqual(resLocked.reason, 'locked');
releaseSyncLock();
assert.strictEqual(acquireSyncLock(), true, 'Sau khi nhả lock, xin lock lại thành công');
releaseSyncLock();
console.log('✓ Test 17 Passed: Cơ chế khóa chống chạy trùng hoạt động chính xác!');

// -------------------------------------------------------------
// TEST 18 (d): Xung đột tu vi không bị ghi đè, cờ 🔔 bật
// -------------------------------------------------------------
console.log('\n--- Test 18 (d): Xung đột tu vi không bị ghi đè, cờ 🔔 bật ---');
setHostOverrideForTesting('test.github.io');
releaseSyncLock();
resetBackoff();

// Đặt cloud tu vi rev 50, exp 900.000
supabaseMock.tables.cultivation.set('user_123', {
  user_id: 'user_123',
  rev: 50,
  updated_at: Date.now(),
  device_id: 'other_device_abc',
  state: { realm: 'hoa_than', totalExp: 900000, _rev: 50 },
});

// Đặt ledger lastSyncedRev = 30
const ledger18 = getSyncLedger();
ledger18.cultivation = { lastSyncedRev: 30, lastCloudUpdatedAt: Date.now() - 10000 };
ledger18.lastSyncedAt = Date.now() - 10000;
saveSyncLedger(ledger18);

// Đặt local tu vi _rev = 45, exp 800.000
const localState18 = { realm: 'nguyen_anh', totalExp: 800000, _rev: 45 };
global.localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(localState18));

const resConflict = await runAutoSync(supabaseMock);
assert.strictEqual(resConflict.attention, true, 'Phải bật cờ attention');
assert.strictEqual(resConflict.reason, 'cultivation_conflict');
const currentLocalCult = getCultivationState();
assert.strictEqual(currentLocalCult.totalExp, 800000, 'Tu vi local KHÔNG bị ghi đè khi xung đột');
const currentCloudCult = supabaseMock.tables.cultivation.get('user_123');
assert.strictEqual(currentCloudCult.state.totalExp, 900000, 'Tu vi cloud KHÔNG bị ghi đè khi xung đột');
assert.strictEqual(getSyncStatus().state, 'attention');
assert.strictEqual(getSyncStatus().attentionReason, 'cultivation_conflict');
console.log('✓ Test 18 Passed: Xung đột tu vi không bị ghi đè, cờ 🔔 bật chuẩn xác!');

// -------------------------------------------------------------
// TEST 19 (e): Fast-forward tu vi có sao lưu (backupCultivationState)
// -------------------------------------------------------------
console.log('\n--- Test 19 (e): Fast-forward tu vi có sao lưu ---');
releaseSyncLock();
resetBackoff();

// Dọn các bản sao lưu cũ trong mock storage
for (let i = 0; i < global.localStorage.length; i++) {
  const k = global.localStorage.key(i);
  if (k && k.startsWith('tcl_cultivation_backup_')) {
    global.localStorage.removeItem(k);
  }
}

// Đặt local _rev = 50 (bằng lastSyncedRev)
const localState19 = { realm: 'hoa_than', totalExp: 850000, _rev: 50 };
global.localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(localState19));
const ledger19 = getSyncLedger();
ledger19.cultivation = { lastSyncedRev: 50, lastCloudUpdatedAt: Date.now() - 5000 };
ledger19.lastSyncedAt = Date.now() - 5000;
saveSyncLedger(ledger19);

// Đặt cloud rev 60, exp 1.000.000
supabaseMock.tables.cultivation.set('user_123', {
  user_id: 'user_123',
  rev: 60,
  updated_at: Date.now(),
  device_id: 'device_phone',
  state: { realm: 'luyen_hu', totalExp: 1000000, _rev: 60 },
});

const resFF = await runAutoSync(supabaseMock);
assert.strictEqual(resFF.success, true);
const cultAfterFF = getCultivationState();
assert.strictEqual(cultAfterFF.totalExp, 1000000, 'Local đã fast-forward lên 1.000.000 exp từ Cloud');
assert.strictEqual(cultAfterFF._rev, 60);

// Kiểm tra bản sao lưu được tạo tự động
let backupFound = false;
for (let i = 0; i < global.localStorage.length; i++) {
  const k = global.localStorage.key(i);
  if (k && k.startsWith('tcl_cultivation_backup_')) {
    const bData = JSON.parse(global.localStorage.getItem(k));
    if (bData && bData.totalExp === 850000) {
      backupFound = true;
      break;
    }
  }
}
assert.strictEqual(backupFound, true, 'Phải có bản sao lưu tu vi trước khi fast-forward');
console.log('✓ Test 19 Passed: Fast-forward tu vi tự động sao lưu bản local trước khi áp dụng!');

// -------------------------------------------------------------
// TEST 20 (f): Hỏi thăm nhẹ không select cover
// -------------------------------------------------------------
console.log('\n--- Test 20 (f): Hỏi thăm nhẹ không select cover ---');
releaseSyncLock();
resetBackoff();
await runAutoSync(supabaseMock);
const novelsCols = supabaseMock.lastSelectColumns['novels'];
assert(novelsCols, 'Phải có truy vấn select bảng novels');
assert(!novelsCols.includes('cover'), 'Tuyệt đối KHÔNG được select cột cover khi hỏi thăm nhẹ');
console.log('✓ Test 20 Passed: Kiểm tra cột truy vấn chặt chẽ, hoàn toàn không select cover!');

// -------------------------------------------------------------
// TEST 21 (g): Lỗi mạng backoff và không ghi nhận đã đồng bộ
// -------------------------------------------------------------
console.log('\n--- Test 21 (g): Lỗi mạng backoff và không ghi nhận đã đồng bộ ---');
releaseSyncLock();
resetBackoff();
const lastSyncedBeforeErr = getSyncLedger().lastSyncedAt;

// Bật lỗi select
supabaseMock.simulatedErrors.novelsSelect = true;
const resNetErr = await runAutoSync(supabaseMock);
assert.strictEqual(resNetErr.success, false, 'Khi mạng lỗi, runAutoSync trả success: false');
assert.strictEqual(getSyncLedger().lastSyncedAt, lastSyncedBeforeErr, 'lastSyncedAt KHÔNG được cập nhật khi lỗi mạng');
assert(getBackoffDelay() > 0, 'Backoff delay phải lớn hơn 0');

// Gọi lại ngay không force -> phải bị backoff chặn
const resWaiting = await runAutoSync(supabaseMock);
assert.strictEqual(resWaiting.skipped, true);
assert.strictEqual(resWaiting.reason, 'backoff_waiting');

// Tắt lỗi & reset backoff
supabaseMock.simulatedErrors.novelsSelect = false;
resetBackoff();
console.log('✓ Test 21 Passed: Backoff tăng dần chuẩn xác, không ghi nhận đã đồng bộ khi có lỗi!');

// -------------------------------------------------------------
// TEST 22 (h): pullNovelProgressNow ghi cả tcl_progress và scroll_pos
// -------------------------------------------------------------
console.log('\n--- Test 22 (h): pullNovelProgressNow ghi cả tcl_progress và scroll_pos ---');
supabaseMock.tables.progress.set('user_123:nov_prog_fast', {
  user_id: 'user_123',
  novel_id: 'nov_prog_fast',
  data: { chapterId: 'ch_fast_5', percent: 0.75, paraIndex: 12, scrollTop: 1200 },
  updated_at: Date.now() + 5000,
});
global.localStorage.removeItem('tcl_progress_nov_prog_fast');
global.localStorage.removeItem('scroll_pos_nov_prog_fast_ch_fast_5');

const pullRes = await pullNovelProgressNow('nov_prog_fast', supabaseMock);
assert.strictEqual(pullRes.updated, true, 'pullNovelProgressNow phải cập nhật khi cloud mới hơn');
const localProgPulled = getReadingProgress('nov_prog_fast');
assert.strictEqual(localProgPulled.chapterId, 'ch_fast_5', 'tcl_progress phải có chapterId mới');
const savedScrollRaw = global.localStorage.getItem('scroll_pos_nov_prog_fast_ch_fast_5');
assert(savedScrollRaw, 'scroll_pos phải được ghi vào localStorage');
const savedScroll = JSON.parse(savedScrollRaw);
assert.strictEqual(savedScroll.percent, 0.75);
assert.strictEqual(savedScroll.paraIndex, 12);
assert.strictEqual(savedScroll.fromCloud, true);
console.log('✓ Test 22 Passed: pullNovelProgressNow ghi nhận cả tcl_progress và scroll_pos hoàn hảo!');

// -------------------------------------------------------------
// TEST 23 (i): Lần đầu đồng bộ cả 2 bên có dữ liệu -> không tự chạy, bật cờ 🔔
// -------------------------------------------------------------
console.log('\n--- Test 23 (i): Lần đầu đồng bộ cả 2 bên có dữ liệu -> không tự chạy, bật cờ 🔔 ---');
releaseSyncLock();
resetBackoff();
saveSyncLedger({ novels: {}, cultivation: { lastSyncedRev: 0, lastCloudUpdatedAt: 0 }, lastSyncedAt: 0 });

const resFirst = await runAutoSync(supabaseMock);
assert.strictEqual(resFirst.attention, true);
assert.strictEqual(resFirst.reason, 'first_sync');
assert.strictEqual(getSyncStatus().state, 'attention');
assert.strictEqual(getSyncStatus().attentionReason, 'first_sync');
console.log('✓ Test 23 Passed: Lần đầu đồng bộ được phát hiện an toàn, không tự ý ghi đè, bật cờ 🔔!');


// -------------------------------------------------------------
// TEST 24 (a): Ẩn truyện ở máy A, chạy autoSync, máy B autoSync thấy truyện bị ẩn
// -------------------------------------------------------------
console.log('\n--- Test 24 (a): Ẩn truyện ở máy A, chạy autoSync, máy B autoSync thấy truyện bị ẩn ---');
releaseSyncLock();
resetBackoff();
setHostOverrideForTesting('test-user.github.io');
setAutoSyncEnabled(true);
setActiveProfile('real');
saveSyncLedger({ novels: {}, cultivation: { lastSyncedRev: 0, lastCloudUpdatedAt: 0 }, lastSyncedAt: 1000 });

// Setup Máy A có truyện nov_hide_test
const novHideA = {
  id: 'nov_hide_test',
  title: 'Bạch Nguyệt Quang',
  description: 'Mô tả truyện',
  coverUrl: 'data:image/png;base64,coverA',
  isHidden: false,
  updatedAt: 1000,
};
await saveNovel(novHideA);
await saveChaptersBulk([
  { id: 'ch_h_1', novelId: 'nov_hide_test', chapterNumber: 1, title: 'Chương 1', content: 'Chương 1', order: 1 }
]);
addToLibrary({
  id: 'nov_hide_test',
  title: 'Bạch Nguyệt Quang',
  chapterCount: 1,
  coverThumb: 'thumb_a',
  isHidden: false,
  updatedAt: 1000,
});

// Đẩy lên cloud lần đầu
await runAutoSync(supabaseMock, { force: true });
assert.strictEqual(supabaseMock.tables.novels.get('user_123:nov_hide_test').is_hidden, false);

// Máy A ẩn truyện
updateLibraryItem('nov_hide_test', { isHidden: true, updatedAt: 2000 });
const novADb = await getNovel('nov_hide_test');
novADb.isHidden = true;
novADb.updatedAt = 2000;
await saveNovel(novADb);

// Máy A chạy autoSync -> đẩy trạng thái ẩn lên cloud
await runAutoSync(supabaseMock, { force: true });
const cloudHideRow = supabaseMock.tables.novels.get('user_123:nov_hide_test');
assert.strictEqual(cloudHideRow.is_hidden, true, 'Cloud phải cập nhật is_hidden = true');
assert.strictEqual(cloudHideRow.updated_at, 2000);

// Giả lập chuyển sang Máy B:
// Máy B hiện đang có truyện nov_hide_test với isHidden = false và updatedAt = 1000
global.localStorage.clear();
mockDB.novels.clear();
mockDB.chapters.clear();
releaseSyncLock();
resetBackoff();
setHostOverrideForTesting('test-user.github.io');
setAutoSyncEnabled(true);
setActiveProfile('real');

await saveNovel({
  id: 'nov_hide_test',
  title: 'Bạch Nguyệt Quang',
  description: 'Mô tả truyện',
  coverUrl: 'data:image/png;base64,coverA',
  isHidden: false,
  updatedAt: 1000,
});
await saveChaptersBulk([
  { id: 'ch_h_1', novelId: 'nov_hide_test', chapterNumber: 1, title: 'Chương 1', content: 'Chương 1', order: 1 }
]);
addToLibrary({
  id: 'nov_hide_test',
  title: 'Bạch Nguyệt Quang',
  chapterCount: 1,
  coverThumb: 'thumb_a',
  isHidden: false,
  updatedAt: 1000,
});
saveSyncLedger({
  novels: {
    nov_hide_test: {
      lastPulledContentAt: 1000,
      lastPushedContentAt: 1000,
      lastSyncedMetaAt: 1000,
    },
  },
  cultivation: { lastSyncedRev: 0, lastCloudUpdatedAt: 0 },
  lastSyncedAt: 1000,
});

// Máy B chạy autoSync
await runAutoSync(supabaseMock, { force: true });

// Kiểm tra Máy B: truyện phải được ẩn cả trong Library và IndexedDB
const libB = getLibrary({ includeHidden: true });
const itemB = libB.find(x => x.id === 'nov_hide_test');
assert(itemB, 'Truyện phải có trong thư viện máy B');
assert.strictEqual(itemB.isHidden, true, 'Máy B thư viện phải thấy truyện bị ẩn (isHidden = true)');

const dbNovelB = await getNovel('nov_hide_test');
assert(dbNovelB, 'Truyện phải có trong DB máy B');
assert.strictEqual(dbNovelB.isHidden, true, 'Máy B DB phải thấy truyện bị ẩn (isHidden = true)');
console.log('✓ Test 24 Passed: Ẩn truyện ở máy A, máy B autoSync thấy truyện bị ẩn hoàn hảo!');

// -------------------------------------------------------------
// TEST 25 (b): Truyện mới ẩn ở máy A đẩy lên có is_hidden=true
// -------------------------------------------------------------
console.log('\n--- Test 25 (b): Truyện mới ẩn ở máy A đẩy lên có is_hidden=true ---');
releaseSyncLock();
resetBackoff();
global.localStorage.clear();
mockDB.novels.clear();
mockDB.chapters.clear();
setHostOverrideForTesting('test-user.github.io');
setAutoSyncEnabled(true);
setActiveProfile('real');
saveSyncLedger({ novels: {}, cultivation: { lastSyncedRev: 0, lastCloudUpdatedAt: 0 }, lastSyncedAt: 1000 });

const novNewHidden = {
  id: 'nov_secret_99',
  title: 'Bí Kíp Thượng Cổ',
  description: 'Bí kíp tuyệt mật không thể công khai',
  coverUrl: 'data:image/jpeg;base64,secretcoverdata',
  isHidden: true,
  chapterCount: 1,
  updatedAt: Date.now(),
};
await saveNovel(novNewHidden);
await saveChaptersBulk([
  { id: 'ch_sec_1', novelId: 'nov_secret_99', chapterNumber: 1, title: 'Chương 1', content: 'Tuyệt kỹ thượng thừa', order: 1 }
]);
addToLibrary({
  id: 'nov_secret_99',
  title: 'Bí Kíp Thượng Cổ',
  description: 'Bí kíp tuyệt mật không thể công khai',
  chapterCount: 1,
  coverThumb: 'thumb_secret',
  isHidden: true,
  updatedAt: Date.now(),
});

await runAutoSync(supabaseMock, { force: true });

const cloudSecretRow = supabaseMock.tables.novels.get('user_123:nov_secret_99');
assert(cloudSecretRow, 'Dòng truyện bí mật phải tồn tại trên Cloud');
assert.strictEqual(cloudSecretRow.is_hidden, true, 'Truyện mới ẩn đẩy lên BẮT BUỘC có is_hidden = true');
assert.strictEqual(cloudSecretRow.title, 'Bí Kíp Thượng Cổ');
assert.strictEqual(cloudSecretRow.description, 'Bí kíp tuyệt mật không thể công khai');
assert.strictEqual(cloudSecretRow.cover, 'data:image/jpeg;base64,secretcoverdata', 'Phải có cover đầy đủ');
assert.strictEqual(cloudSecretRow.chapter_count, 1);
assert(supabaseMock.storageBuckets.novels.has(cloudSecretRow.content_path), 'Nội dung truyện phải được tải lên storage');
console.log('✓ Test 25 Passed: Truyện mới ẩn ở máy A đẩy lên có is_hidden=true, bìa và mô tả đầy đủ!');

// -------------------------------------------------------------
// TEST 26 (c): Truyện mới từ Cloud về máy B hiển thị đúng trong thư viện (có bìa, tên, trạng thái ẩn)
// -------------------------------------------------------------
console.log('\n--- Test 26 (c): Truyện mới từ Cloud về máy B hiển thị đúng trong thư viện ---');
releaseSyncLock();
resetBackoff();
global.localStorage.clear();
mockDB.novels.clear();
mockDB.chapters.clear();
setHostOverrideForTesting('test-user.github.io');
setAutoSyncEnabled(true);
setActiveProfile('real');
saveSyncLedger({ novels: {}, cultivation: { lastSyncedRev: 0, lastCloudUpdatedAt: 0 }, lastSyncedAt: 1000 });

// Máy B ban đầu trống, Cloud đã có nov_secret_99 từ Test 25
await runAutoSync(supabaseMock, { force: true });

const libPullB = getLibrary({ includeHidden: true });
const pulledItem = libPullB.find(x => x.id === 'nov_secret_99');
assert(pulledItem, 'Thư viện máy B phải nhận được truyện mới từ cloud');
assert.strictEqual(pulledItem.title, 'Bí Kíp Thượng Cổ');
assert.strictEqual(pulledItem.isHidden, true, 'Trạng thái ẩn phải là true');
assert(pulledItem.coverThumb !== undefined, 'Phải có coverThumb trong thư viện');

const pulledDbNov = await getNovel('nov_secret_99');
assert(pulledDbNov, 'IndexedDB phải có truyện');
assert.strictEqual(pulledDbNov.isHidden, true);
assert.strictEqual(pulledDbNov.coverUrl, 'data:image/jpeg;base64,secretcoverdata');
assert.strictEqual(pulledDbNov.description, 'Bí kíp tuyệt mật không thể công khai');

const pulledChaps = await getChapters('nov_secret_99');
assert.strictEqual(pulledChaps.length, 1);
assert.strictEqual(pulledChaps[0].content, 'Tuyệt kỹ thượng thừa');

const ledgerB = getSyncLedger();
assert(ledgerB.novels['nov_secret_99'].lastPulledContentAt > 0, 'Ledger phải ghi nhận đã kéo');
assert(!getDirtyNovels()['nov_secret_99'], 'Dirty flag phải được xóa');
console.log('✓ Test 26 Passed: Truyện mới từ Cloud về máy B hiển thị đúng trong thư viện (có bìa, tên, trạng thái ẩn)!');

// -------------------------------------------------------------
// TEST 27 (d): Mock Supabase trả {error} ở upsert truyện: dirty không bị xóa, ledger không đổi, syncStatus thành error
// -------------------------------------------------------------
console.log('\n--- Test 27 (d): Mock Supabase trả {error} ở upsert truyện ---');
releaseSyncLock();
resetBackoff();
global.localStorage.clear();
mockDB.novels.clear();
mockDB.chapters.clear();
supabaseMock.tables.novels.clear();
supabaseMock.storageBuckets.novels.clear();
supabaseMock.tables.cultivation.clear();
setHostOverrideForTesting('test-user.github.io');
setAutoSyncEnabled(true);
setActiveProfile('real');
saveSyncLedger({ novels: {}, cultivation: { lastSyncedRev: 0, lastCloudUpdatedAt: 0 }, lastSyncedAt: 1000 });

const novErrTest = {
  id: 'nov_upsert_fail',
  title: 'Truyện Lỗi Upsert',
  description: 'Mô tả',
  coverUrl: '',
  updatedAt: 5000,
};
await saveNovel(novErrTest);
await saveChaptersBulk([
  { id: 'ch_err_1', novelId: 'nov_upsert_fail', chapterNumber: 1, title: 'C1', content: 'Nội dung', order: 1 }
]);
addToLibrary({
  id: 'nov_upsert_fail',
  title: 'Truyện Lỗi Upsert',
  chapterCount: 1,
  updatedAt: 5000,
});
markNovelDirty('nov_upsert_fail');

const ledgerBeforeErr = JSON.stringify(getSyncLedger());

// Kích hoạt lỗi upsert truyện
supabaseMock.simulatedErrors.novelsUpsert = true;

const resErrUpsert = await runAutoSync(supabaseMock, { force: true });
assert.strictEqual(resErrUpsert.success, false, 'Khi có lỗi ghi Supabase, runAutoSync phải trả success: false');
assert(getDirtyNovels()['nov_upsert_fail'], 'Dirty flag TUYỆT ĐỐI KHÔNG được xóa khi upsert lỗi');
assert.strictEqual(JSON.stringify(getSyncLedger()), ledgerBeforeErr, 'Ledger TUYỆT ĐỐI KHÔNG được cập nhật khi có lỗi');
assert.strictEqual(getSyncStatus().state, 'error', 'syncStatus phải chuyển thành error');

// Phục hồi lỗi
supabaseMock.simulatedErrors.novelsUpsert = false;
resetBackoff();
console.log('✓ Test 27 Passed: Mock Supabase {error} được xử lý nghiêm ngặt: dirty giữ nguyên, ledger không đổi, syncStatus = error!');

// -------------------------------------------------------------
// TEST 28 (e): Đồng bộ tay đang chạy thì autoSync bỏ qua (báo locked) và ngược lại
// -------------------------------------------------------------
console.log('\n--- Test 28 (e): Đồng bộ tay đang chạy thì autoSync bỏ qua (báo locked) và ngược lại ---');
releaseSyncLock();
resetBackoff();

// 1. Giả lập manual sync đang giữ khóa -> autoSync phải bỏ qua
const lockGotten = acquireSyncLock();
assert.strictEqual(lockGotten, true, 'Phải lấy được khóa ban đầu');

const resAutoSkipped = await runAutoSync(supabaseMock);
assert.strictEqual(resAutoSkipped.skipped, true);
assert.strictEqual(resAutoSkipped.reason, 'locked');

// 2. Giả lập autoSync đang giữ khóa (hoặc tab khác) -> performSync phải báo locked
const resManualLocked = await performSync(supabaseMock);
assert.strictEqual(resManualLocked.locked, true, 'performSync phải trả locked: true khi đã có khóa');
assert.strictEqual(resManualLocked.success, false);
assert(resManualLocked.message.includes('Đang có một lần đồng bộ khác chạy'));

// 3. Giải phóng khóa -> cả hai đều có thể chạy lại
releaseSyncLock();
assert.strictEqual(acquireSyncLock(), true);
releaseSyncLock();
console.log('✓ Test 28 Passed: Khóa dùng chung giữa autoSync và performSync hoạt động trơn tru!');

// -------------------------------------------------------------
// TEST 29 (f): Chỉ pending_seconds thay đổi: đẩy lên Cloud và máy B nhận được
// -------------------------------------------------------------
console.log('\n--- Test 29 (f): Chỉ pending_seconds thay đổi: đẩy lên Cloud và máy B nhận được ---');
releaseSyncLock();
resetBackoff();
global.localStorage.clear();
mockDB.novels.clear();
mockDB.chapters.clear();
setHostOverrideForTesting('test-user.github.io');
setAutoSyncEnabled(true);
setActiveProfile('real');

// Khởi tạo tu vi máy A: rev = 10, pending = 60
const cultStateA = { realm: 'Luyện Khí Tầng 3', totalExp: 350, _rev: 10 };
localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(cultStateA));
localStorage.setItem(getCultivationKey('pending_seconds', 'real'), '60');
saveSyncLedger({
  novels: {},
  cultivation: { lastSyncedRev: 10, lastSyncedPending: 60, lastPendingPushAt: 0, lastCloudUpdatedAt: 1000 },
  lastSyncedAt: 1000,
});

// Giả lập Cloud đang có cùng rev = 10 và pending = 60
supabaseMock.tables.cultivation.set('user_123', {
  user_id: 'user_123',
  rev: 10,
  state: { ...cultStateA, __meta: { pendingSeconds: 60 } },
  updated_at: 1000,
});

// Người dùng ngồi thiền tiếp ở máy A: pending_seconds tăng lên 180 (rev vẫn là 10)
localStorage.setItem(getCultivationKey('pending_seconds', 'real'), '180');

// Máy A chạy autoSync (với force)
await runAutoSync(supabaseMock, { force: true });

// Kiểm tra Cloud nhận được pendingSeconds = 180
const cloudCultRow = supabaseMock.tables.cultivation.get('user_123');
assert(cloudCultRow, 'Dòng tu vi trên cloud phải tồn tại');
assert.strictEqual(cloudCultRow.rev, 10, 'Rev không đổi');
assert.strictEqual(cloudCultRow.state.__meta.pendingSeconds, 180, 'Cloud phải nhận pendingSeconds = 180');

// Kiểm tra ledger máy A
assert.strictEqual(getSyncLedger().cultivation.lastSyncedPending, 180);

// Giả lập Máy B: local pending = 60, lastSyncedPending = 60 (chưa bị lệch)
global.localStorage.clear();
releaseSyncLock();
resetBackoff();
setHostOverrideForTesting('test-user.github.io');
setAutoSyncEnabled(true);
setActiveProfile('real');

localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(cultStateA));
localStorage.setItem(getCultivationKey('pending_seconds', 'real'), '60');
saveSyncLedger({
  novels: {},
  cultivation: { lastSyncedRev: 10, lastSyncedPending: 60, lastPendingPushAt: 0, lastCloudUpdatedAt: 1000 },
  lastSyncedAt: 1000,
});

// Máy B chạy autoSync -> nhận pending 180 từ Cloud
await runAutoSync(supabaseMock, { force: true });

const pulledPendingB = parseInt(localStorage.getItem(getCultivationKey('pending_seconds', 'real')) || '0', 10);
assert.strictEqual(pulledPendingB, 180, 'Máy B phải nhận đúng số giây đang thiền 180 từ Cloud');
assert.strictEqual(getSyncLedger().cultivation.lastSyncedPending, 180);
console.log('✓ Test 29 Passed: Chỉ pending_seconds thay đổi được đẩy lên Cloud và máy B nhận được chính xác!');

// -------------------------------------------------------------
// TEST 30 (g): Sửa metadata (đổi tên) không tải lại chương
// -------------------------------------------------------------
console.log('\n--- Test 30 (g): Sửa metadata (đổi tên) không tải lại chương ---');
releaseSyncLock();
resetBackoff();
global.localStorage.clear();
mockDB.novels.clear();
mockDB.chapters.clear();
setHostOverrideForTesting('test-user.github.io');
setAutoSyncEnabled(true);
setActiveProfile('real');

// Xóa các truyện cũ trên cloud để chỉ tập trung test riêng nov_meta_test
supabaseMock.tables.novels.clear();
supabaseMock.storageBuckets.novels.clear();
supabaseMock.tables.cultivation.clear();

// Setup truyện nov_meta_test đã đồng bộ sẵn ở cả 2 bên
const baseNovel = {
  id: 'nov_meta_test',
  title: 'Tiêu Đề Cũ',
  description: 'Mô tả gốc',
  coverUrl: 'data:image/jpeg;base64,mockcover',
  chapterCount: 2,
  updatedAt: 1000,
};
await saveNovel(baseNovel);
await saveChaptersBulk([
  { id: 'ch_m_1', novelId: 'nov_meta_test', chapterNumber: 1, title: 'C1', content: 'Chương 1 nội dung dài...', order: 1 },
  { id: 'ch_m_2', novelId: 'nov_meta_test', chapterNumber: 2, title: 'C2', content: 'Chương 2 nội dung dài...', order: 2 },
]);
addToLibrary({
  id: 'nov_meta_test',
  title: 'Tiêu Đề Cũ',
  description: 'Mô tả gốc',
  chapterCount: 2,
  coverThumb: 'thumb_old',
  updatedAt: 1000,
});

supabaseMock.tables.novels.set('user_123:nov_meta_test', {
  user_id: 'user_123',
  id: 'nov_meta_test',
  title: 'Tiêu Đề Cũ',
  description: 'Mô tả gốc',
  cover: 'data:image/jpeg;base64,mockcover',
  is_hidden: false,
  chapter_count: 2,
  content_path: 'user_123/nov_meta_test.json.gz',
  content_updated_at: 1000,
  updated_at: 1000,
});
supabaseMock.storageBuckets.novels.set('user_123/nov_meta_test.json.gz', Buffer.from('mock zipped chapters'));

saveSyncLedger({
  novels: {
    nov_meta_test: {
      lastPulledContentAt: 1000,
      lastPushedContentAt: 1000,
      lastSyncedMetaAt: 1000,
    },
  },
  cultivation: { lastSyncedRev: 0, lastCloudUpdatedAt: 0 },
  lastSyncedAt: 1000,
});
clearNovelDirty('nov_meta_test');

// Đặt lại bộ đếm storage
supabaseMock.storageUploadCount = 0;
supabaseMock.storageDownloadCount = 0;

// TRƯỜNG HỢP 1: Cloud sửa tiêu đề (updated_at = 2000 > local 1000)
const cloudRow = supabaseMock.tables.novels.get('user_123:nov_meta_test');
cloudRow.title = 'Tiêu Đề Mới Từ Cloud';
cloudRow.updated_at = 2000;

await runAutoSync(supabaseMock, { force: true });

// Local phải cập nhật tiêu đề mới
const localLibUpdated = getLibrary().find(x => x.id === 'nov_meta_test');
assert.strictEqual(localLibUpdated.title, 'Tiêu Đề Mới Từ Cloud');
const localDbUpdated = await getNovel('nov_meta_test');
assert.strictEqual(localDbUpdated.title, 'Tiêu Đề Mới Từ Cloud');

// KHÔNG ĐƯỢC phép tải lại file chương từ storage
assert.strictEqual(supabaseMock.storageDownloadCount, 0, 'Sửa metadata từ Cloud tuyệt đối không được download nội dung chương');

// TRƯỜNG HỢP 2: Local sửa tiêu đề (updatedAt = 3000 > cloud 2000)
updateLibraryItem('nov_meta_test', {
  title: 'Tiêu Đề Mới Đổi Tại Local',
  updatedAt: 3000,
});
localDbUpdated.title = 'Tiêu Đề Mới Đổi Tại Local';
localDbUpdated.updatedAt = 3000;
await saveNovel(localDbUpdated);

await runAutoSync(supabaseMock, { force: true });

// Cloud phải cập nhật tiêu đề mới
const cloudRowAfterLocal = supabaseMock.tables.novels.get('user_123:nov_meta_test');
assert.strictEqual(cloudRowAfterLocal.title, 'Tiêu Đề Mới Đổi Tại Local');
assert.strictEqual(cloudRowAfterLocal.updated_at, 3000);

// KHÔNG ĐƯỢC phép upload lại file chương lên storage
assert.strictEqual(supabaseMock.storageUploadCount, 0, 'Sửa metadata tại Local tuyệt đối không được upload lại nội dung chương');

console.log('✓ Test 30 Passed: Sửa metadata hai chiều không tải lại chương (downloadCount = 0, uploadCount = 0)!');


// -------------------------------------------------------------
// TEST 31 (a): Tu vi đẩy thành công rồi một truyện lỗi -> Lần sau không báo cultivation_conflict & không đẩy lại
// -------------------------------------------------------------
console.log('\n--- Test 31 (a): Tu vi đẩy thành công rồi một truyện lỗi ---');
releaseSyncLock();
resetBackoff();
global.localStorage.clear();
mockDB.novels.clear();
mockDB.chapters.clear();
supabaseMock.tables.novels.clear();
supabaseMock.storageBuckets.novels.clear();
supabaseMock.tables.cultivation.clear();
setHostOverrideForTesting('test-user.github.io');
setAutoSyncEnabled(true);
setActiveProfile('real');

// Setup máy: có 1 truyện sẽ lỗi nov_err_31
const novErr31 = { id: 'nov_err_31', title: 'Truyện Lỗi Sau Tu Vi', description: '', coverUrl: '', updatedAt: 1000 };
await saveNovel(novErr31);
await saveChaptersBulk([{ id: 'ch_31_1', novelId: 'nov_err_31', chapterNumber: 1, title: 'C1', content: 'Cont', order: 1 }]);
addToLibrary({ id: 'nov_err_31', title: 'Truyện Lỗi Sau Tu Vi', chapterCount: 1, updatedAt: 1000 });
markNovelDirty('nov_err_31');

// Setup tu vi máy: rev = 8, cloud đang là rev = 4
const cultState31 = { realm: 'Kim Đan Sơ Kỳ', totalExp: 2000, _rev: 8 };
localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(cultState31));
localStorage.setItem(getCultivationKey('pending_seconds', 'real'), '0');

saveSyncLedger({
  novels: {},
  cultivation: { lastSyncedRev: 4, lastSyncedPending: 0, lastCloudUpdatedAt: 500 },
  lastSyncedAt: 1000,
});

supabaseMock.tables.cultivation.set('user_123', {
  user_id: 'user_123',
  rev: 4,
  state: { realm: 'Trúc Cơ Hậu Kỳ', totalExp: 1000, _rev: 4 },
  updated_at: 500,
});

// Giả lập lỗi khi đẩy nov_err_31 lên cloud
supabaseMock.simulatedErrors.errorOnNovelId = 'nov_err_31';
supabaseMock.cultivationUpsertCount = 0;

// Lần chạy 1: Truyện nov_err_31 lỗi, nhưng tu vi vẫn đẩy thành công
const res31_1 = await runAutoSync(supabaseMock, { force: true });
assert.strictEqual(res31_1.success, false, 'Lần 1 phải báo lỗi do có truyện lỗi');
assert(res31_1.errors.length > 0, 'Phải có lỗi trong danh sách errors');

// Kiểm tra: Tu vi trên Cloud đã được cập nhật lên rev 8
const cloudCult31 = supabaseMock.tables.cultivation.get('user_123');
assert(cloudCult31, 'Tu vi phải được lưu trên cloud');
assert.strictEqual(cloudCult31.rev, 8, 'Rev tu vi trên cloud phải là 8');

// Kiểm tra: Ledger đã lưu lastSyncedRev = 8 mặc dù lần chạy có lỗi
const ledgerAfter31_1 = getSyncLedger();
assert.strictEqual(ledgerAfter31_1.cultivation.lastSyncedRev, 8, 'Ledger phải ghi nhớ lastSyncedRev = 8');
assert.strictEqual(ledgerAfter31_1.lastSyncedAt, 1000, 'lastSyncedAt KHÔNG được cập nhật khi có lỗi');

// Lần chạy 2: Hết lỗi truyện
supabaseMock.simulatedErrors.errorOnNovelId = null;
resetBackoff();
const cultUpsertCountBefore = supabaseMock.cultivationUpsertCount;

const res31_2 = await runAutoSync(supabaseMock, { force: true });
assert.strictEqual(res31_2.success, true, 'Lần 2 phải thành công khi hết lỗi');
assert.notStrictEqual(res31_2.reason, 'cultivation_conflict', 'KHÔNG được báo cultivation_conflict');
assert.strictEqual(getSyncStatus().state, 'idle', 'Trạng thái sync phải là idle');
assert.strictEqual(supabaseMock.cultivationUpsertCount, cultUpsertCountBefore, 'TUYỆT ĐỐI không được đẩy lại tu vi khi không đổi gì');
console.log('✓ Test 31 Passed: Tu vi đẩy thành công dù truyện lỗi, lần sau không báo xung đột giả và không đẩy lại!');

// -------------------------------------------------------------
// TEST 32 (b): Truyện A đẩy thành công, truyện B lỗi -> Lần sau A không bị coi là xung đột nội dung
// -------------------------------------------------------------
console.log('\n--- Test 32 (b): Truyện A đẩy thành công, truyện B lỗi ---');
releaseSyncLock();
resetBackoff();
global.localStorage.clear();
mockDB.novels.clear();
mockDB.chapters.clear();
supabaseMock.tables.novels.clear();
supabaseMock.storageBuckets.novels.clear();
setHostOverrideForTesting('test-user.github.io');
setAutoSyncEnabled(true);
setActiveProfile('real');

// Setup máy có 2 truyện A và B
await saveNovel({ id: 'nov_32_A', title: 'Truyện 32 A', description: 'Mô tả A', coverUrl: '', updatedAt: 1000 });
await saveChaptersBulk([{ id: 'ch_32_a1', novelId: 'nov_32_A', chapterNumber: 1, title: 'C1', content: 'Nội dung A', order: 1 }]);
addToLibrary({ id: 'nov_32_A', title: 'Truyện 32 A', chapterCount: 1, updatedAt: 1000 });
markNovelDirty('nov_32_A');

await saveNovel({ id: 'nov_32_B', title: 'Truyện 32 B', description: 'Mô tả B', coverUrl: '', updatedAt: 1000 });
await saveChaptersBulk([{ id: 'ch_32_b1', novelId: 'nov_32_B', chapterNumber: 1, title: 'C1', content: 'Nội dung B', order: 1 }]);
addToLibrary({ id: 'nov_32_B', title: 'Truyện 32 B', chapterCount: 1, updatedAt: 1000 });
markNovelDirty('nov_32_B');

saveSyncLedger({
  novels: {},
  cultivation: { lastSyncedRev: 0, lastCloudUpdatedAt: 0 },
  lastSyncedAt: 1000,
});

// Giả lập lỗi ở truyện B (errorOnNovelId = 'nov_32_B')
supabaseMock.simulatedErrors.errorOnNovelId = 'nov_32_B';

// Lần chạy 1: A thành công, B lỗi
const res32_1 = await runAutoSync(supabaseMock, { force: true });
assert.strictEqual(res32_1.success, false, 'Lần 1 phải trả false vì truyện B lỗi');

// Kiểm tra truyện A đã lên cloud và ledger đã ghi nhận A
assert(supabaseMock.tables.novels.get('user_123:nov_32_A'), 'Truyện A phải có trên cloud');
const ledgerAfter32_1 = getSyncLedger();
assert(ledgerAfter32_1.novels['nov_32_A']?.lastPushedContentAt > 0, 'Ledger phải lưu lastPushedContentAt của truyện A');
assert(!getDirtyNovels()['nov_32_A'], 'Dirty flag của truyện A phải được xóa');

// Kiểm tra truyện B chưa xong, dirty vẫn còn
assert(getDirtyNovels()['nov_32_B'], 'Dirty flag của truyện B vẫn phải giữ nguyên');

// Lần chạy 2: Sửa xong lỗi ở B, chạy lại
supabaseMock.simulatedErrors.errorOnNovelId = null;
resetBackoff();

const res32_2 = await runAutoSync(supabaseMock, { force: true });
assert.strictEqual(res32_2.success, true, 'Lần 2 phải thành công trọn vẹn');
assert.notStrictEqual(res32_2.reason, 'novel_conflict', 'Truyện A tuyệt đối KHÔNG bị coi là xung đột nội dung!');
assert.strictEqual(getSyncStatus().state, 'idle');
assert(supabaseMock.tables.novels.get('user_123:nov_32_B'), 'Truyện B bây giờ cũng đã lên cloud');
console.log('✓ Test 32 Passed: Truyện A đẩy thành công, B lỗi: lần sau A không bị coi là xung đột nội dung!');

// -------------------------------------------------------------
// TEST 33 (c): Khóa không hết hạn khi một lần đồng bộ kéo dài hơn 2 phút (dùng đồng hồ giả)
// -------------------------------------------------------------
console.log('\n--- Test 33 (c): Khóa không hết hạn khi đồng bộ kéo dài hơn 2 phút ---');
releaseSyncLock();
resetBackoff();

const originalDateNow = Date.now;
try {
  let fakeTime = 1000000;
  Date.now = () => fakeTime;

  // 1. Lấy khóa ban đầu tại fakeTime = 1,000,000
  const lock1 = acquireSyncLock();
  assert.strictEqual(lock1, true, 'Phải lấy được khóa ban đầu');

  // Kiểm tra không lấy lại được khóa trong cùng thời điểm
  assert.strictEqual(acquireSyncLock(), false, 'Không thể lấy khóa khi đang có tiến trình chiếm giữ');

  // 2. Trôi qua 80 giây (fakeTime = 1,080,000 < 120,000 timeout)
  fakeTime += 80000;

  // Gọi refreshSyncLock() (giả lập vừa tải/đẩy xong 1 truyện lớn)
  refreshSyncLock();

  // 3. Trôi tiếp 80 giây nữa (fakeTime = 1,160,000. Tổng thời gian trôi qua là 160s > 120s / 2 phút!)
  fakeTime += 80000;

  // Nếu KHÔNG có refreshSyncLock, khóa đã hết hạn ở 120s.
  // Nhưng VÌ ĐÃ CÓ refreshSyncLock ở thời điểm 80s, khoảng cách hiện tại chỉ là 80s (< 120s).
  // Do đó acquireSyncLock BẮT BUỘC vẫn phải trả false (khóa không bị cướp)!
  assert.strictEqual(acquireSyncLock(), false, 'Khóa KHÔNG được hết hạn sau 160 giây (> 2 phút) vì đã được refresh!');

  // 4. Tiếp tục trôi qua 90 giây nữa kèm refresh (fakeTime = 1,250,000)
  refreshSyncLock();
  fakeTime += 60000; // Tổng thời gian đã là 220s (~3.7 phút)
  assert.strictEqual(acquireSyncLock(), false, 'Sau gần 4 phút khóa vẫn được bảo vệ nhờ refresh liên tục');

  // 5. Kết thúc đồng bộ: gọi releaseSyncLock()
  releaseSyncLock();
  assert.strictEqual(acquireSyncLock(), true, 'Sau khi releaseSyncLock thì tiến trình khác lấy khóa bình thường');
  releaseSyncLock();
} finally {
  Date.now = originalDateNow;
}
console.log('✓ Test 33 Passed: Cơ chế refreshSyncLock giữ khóa liên tục qua các lần đồng bộ dài hơn 2 phút thành công!');

// -------------------------------------------------------------
// TEST 34 (a): Causal timestamp chống lệch đồng hồ:
// A ẩn -> B nhận -> B hiện -> A nhận, kể cả khi đồng hồ B chậm hơn A 10 phút (mock Date.now)
// -------------------------------------------------------------
console.log('\n--- Test 34 (a): Causal timestamp chống lệch đồng hồ: A ẩn -> B nhận -> B hiện -> A nhận ---');
releaseSyncLock();
resetBackoff();
setHostOverrideForTesting('user-test.github.io');
setActiveProfile('real');

const dateNowOriginal = Date.now;
try {
  // 1. Setup ban đầu: Máy A có truyện nov_34 (isHidden: false), đã đồng bộ lên cloud
  global.localStorage.clear();
  mockDB.novels.clear();
  mockDB.chapters.clear();
  supabaseMock.tables.novels.clear();
  supabaseMock.storageBuckets.novels.clear();
  setAutoSyncEnabled(true);
  setActiveProfile('real');
  saveSyncLedger({ novels: {}, cultivation: { lastSyncedRev: 0, lastCloudUpdatedAt: 0 }, lastSyncedAt: 1000 });

  const novel34 = {
    id: 'nov_34',
    title: 'Truyện 34 Causal Clock',
    description: 'Mô tả truyện 34',
    coverUrl: '',
    isHidden: false,
    updatedAt: 1000,
  };
  await saveNovel(novel34);
  addToLibrary({
    id: 'nov_34',
    title: 'Truyện 34 Causal Clock',
    description: 'Mô tả truyện 34',
    isHidden: false,
    chapterCount: 1,
    updatedAt: 1000,
  });
  await saveChaptersBulk([{
    id: 'ch_34_1',
    novelId: 'nov_34',
    chapterNumber: 1,
    title: 'Chương 1',
    content: 'Nội dung chương 1',
    order: 1,
  }]);

  // Đẩy ban đầu lên cloud
  const initSync = await runAutoSync(supabaseMock, { force: true });
  assert.strictEqual(initSync.success, true, 'Setup đẩy truyện 34 lên cloud phải thành công');

  // Lưu snapshot trạng thái Cloud sau init
  const cloudRowInit = supabaseMock.tables.novels.get('user_123:nov_34');
  assert(cloudRowInit, 'Cloud phải có nov_34');
  assert.strictEqual(cloudRowInit.is_hidden, false);

  // 2. Máy A: Lúc 12:10 (mock Time = 1000000), A ẩn truyện
  let machineATime = 1000000;
  Date.now = () => machineATime;

  await hideNovel('nov_34');
  assert.strictEqual(getLibrary({ includeHidden: true })[0].isHidden, true, 'Máy A: truyện phải bị ẩn');
  assert.strictEqual((await getNovel('nov_34')).isHidden, true, 'Máy A: IndexedDB phải cập nhật isHidden=true');
  assert.strictEqual(getLibrary({ includeHidden: true })[0].updatedAt, 1000000);

  // Máy A autoSync lên cloud
  const aSyncRes = await runAutoSync(supabaseMock, { force: true });
  assert.strictEqual(aSyncRes.success, true, 'Máy A sync ẩn lên cloud phải thành công');

  const cloudRowAfterHide = supabaseMock.tables.novels.get('user_123:nov_34');
  assert.strictEqual(cloudRowAfterHide.is_hidden, true, 'Cloud phải ghi nhận is_hidden = true');
  assert.strictEqual(cloudRowAfterHide.updated_at, 1000000, 'Cloud updatedAt phải là 1000000');

  // Lưu trạng thái Local của Máy A (để giả lập sau này A nhận lại từ B)
  const machineALocalStorage = JSON.stringify(global.localStorage.store);
  const machineANovels = new Map(mockDB.novels);

  // 3. Giả lập Máy B:
  // Máy B trước đó đã có truyện 34 (ở trạng thái cũ isHidden: false, updatedAt: 1000)
  global.localStorage.clear();
  mockDB.novels.clear();
  setAutoSyncEnabled(true);
  setActiveProfile('real');
  saveSyncLedger({ novels: {}, cultivation: { lastSyncedRev: 0, lastCloudUpdatedAt: 0 }, lastSyncedAt: 1000 });
  await saveNovel({ ...novel34 });
  addToLibrary({
    id: 'nov_34',
    title: 'Truyện 34 Causal Clock',
    description: 'Mô tả truyện 34',
    isHidden: false,
    chapterCount: 1,
    updatedAt: 1000,
  });

  // Máy B autoSync kéo từ cloud về
  const bPullRes = await runAutoSync(supabaseMock, { force: true });
  assert.strictEqual(bPullRes.success, true, 'Máy B kéo từ cloud phải thành công');

  const bLibAfterPull = getLibrary({ includeHidden: true }).find(n => n.id === 'nov_34');
  assert.strictEqual(bLibAfterPull.isHidden, true, 'Máy B phải nhận được trạng thái ẩn từ A');
  assert.strictEqual(bLibAfterPull.updatedAt, 1000000, 'Máy B phải giữ đúng updatedAt của cloud');
  assert.strictEqual((await getNovel('nov_34')).isHidden, true, 'Máy B IndexedDB phải cập nhật isHidden = true');

  // 4. Máy B unhide truyện, nhưng ĐỒNG HỒ MÁY B CHẬM HƠN A 10 PHÚT!
  // Đồng hồ máy B: 12:00 (mock Time = 400000, chậm hơn 1000000 những 600,000ms = 10 phút)
  let machineBTime = 400000;
  Date.now = () => machineBTime;

  await unhideNovel('nov_34');

  const bLibAfterUnhide = getLibrary({ includeHidden: true }).find(n => n.id === 'nov_34');
  assert.strictEqual(bLibAfterUnhide.isHidden, false, 'Máy B: truyện phải được hiện');
  // Causal monotonic timestamp: Math.max(Date.now(), 1000000 + 1) = 1000001 > 1000000!
  assert.strictEqual(bLibAfterUnhide.updatedAt, 1000001, 'Causal timestamp phải lớn hơn timestamp cũ của A dù đồng hồ B chậm 10 phút!');
  assert.strictEqual((await getNovel('nov_34')).isHidden, false, 'Máy B: IndexedDB phải cập nhật isHidden = false');

  // Máy B autoSync đẩy lên cloud
  const bPushRes = await runAutoSync(supabaseMock, { force: true });
  assert.strictEqual(bPushRes.success, true, 'Máy B sync hiện lên cloud phải thành công');

  const cloudRowAfterUnhide = supabaseMock.tables.novels.get('user_123:nov_34');
  assert.strictEqual(cloudRowAfterUnhide.is_hidden, false, 'Cloud phải ghi nhận is_hidden = false từ máy B');
  assert.strictEqual(cloudRowAfterUnhide.updated_at, 1000001, 'Cloud updated_at phải là 1000001');

  // 5. Máy A mở lại (kéo từ cloud về)
  // Khôi phục localStorage và DB của Máy A trước khi B unhide
  global.localStorage.store = JSON.parse(machineALocalStorage);
  mockDB.novels = new Map(machineANovels);

  const aLibBeforePull = getLibrary({ includeHidden: true }).find(n => n.id === 'nov_34');
  assert.strictEqual(aLibBeforePull.isHidden, true, 'Trước khi kéo, Máy A vẫn đang ở trạng thái ẩn');

  // Máy A autoSync
  const aPullRes = await runAutoSync(supabaseMock, { force: true });
  assert.strictEqual(aPullRes.success, true, 'Máy A sync kéo từ cloud phải thành công');

  const aLibAfterPull = getLibrary({ includeHidden: true }).find(n => n.id === 'nov_34');
  assert.strictEqual(aLibAfterPull.isHidden, false, 'Máy A PHẢI nhận được trạng thái hiện từ B!');
  assert.strictEqual(aLibAfterPull.updatedAt, 1000001, 'Máy A phải có updatedAt mới nhất = 1000001');
  assert.strictEqual((await getNovel('nov_34')).isHidden, false, 'Máy A: IndexedDB phải cập nhật isHidden = false');
} finally {
  Date.now = dateNowOriginal;
}
console.log('✓ Test 34 Passed: Causal timestamp hoạt động hoàn hảo: A ẩn -> B nhận -> B hiện -> A nhận kể cả khi đồng hồ B chậm hơn 10 phút!');

// -------------------------------------------------------------
// TEST 35 (b): updateLibraryItem dispatch notifyLibraryChanged
// -------------------------------------------------------------
console.log('\n--- Test 35 (b): updateLibraryItem dispatch notifyLibraryChanged ---');
global.localStorage.clear();
addToLibrary({ id: 'nov_35', title: 'Truyện 35', updatedAt: 1000 });

let windowEventReceived = null;
let callbackEventReceived = null;

const listener = (e) => {
  windowEventReceived = e.detail?.novelId;
};
window.addEventListener('tcl_library_changed', listener);
const unsubscribe = onLibraryChange((novelId) => {
  callbackEventReceived = novelId;
});

updateLibraryItem('nov_35', { title: 'Truyện 35 Mới' });

window.removeEventListener('tcl_library_changed', listener);
unsubscribe();

assert.strictEqual(windowEventReceived, 'nov_35', 'window dispatchEvent phải nhận được sự kiện tcl_library_changed với novelId');
assert.strictEqual(callbackEventReceived, 'nov_35', 'onLibraryChange listener phải nhận được novelId');
console.log('✓ Test 35 Passed: updateLibraryItem đã dispatch notifyLibraryChanged thành công!');

// -------------------------------------------------------------
// TEST 36 (c): Không trigger autoSync trên non-github.io hoặc Sandbox
// -------------------------------------------------------------
console.log('\n--- Test 36 (c): Không trigger trên non-github.io hoặc Sandbox ---');
cancelLibraryDebounceTimer();

// 1. Trên non-github.io (localhost)
setHostOverrideForTesting('localhost');
setActiveProfile('real');
triggerLibraryDebouncedAutoSync();
assert.strictEqual(isLibraryDebouncePending(), false, 'Trên localhost tuyệt đối không được kích hoạt debounce autoSync');

// 2. Trên github.io nhưng là profile Sandbox
setHostOverrideForTesting('user.github.io');
setActiveProfile('sandbox');
triggerLibraryDebouncedAutoSync();
assert.strictEqual(isLibraryDebouncePending(), false, 'Trong profile Sandbox tuyệt đối không được kích hoạt debounce autoSync');

// 3. Trên github.io và profile Thật (real) -> kích hoạt thành công
setActiveProfile('real');
triggerLibraryDebouncedAutoSync();
assert.strictEqual(isLibraryDebouncePending(), true, 'Trên github.io và profile Thật phải kích hoạt debounce autoSync');
cancelLibraryDebounceTimer();
assert.strictEqual(isLibraryDebouncePending(), false, 'Sau khi hủy, timer không còn pending');

console.log('✓ Test 36 Passed: Không bao giờ trigger autoSync trên non-github.io hoặc Sandbox!');

// -------------------------------------------------------------
// TEST 37 (a): quickSyncCloudMetadata không select cover/description và chỉ gọi tải đầy đủ cho truyện thật sự đổi
// -------------------------------------------------------------
console.log('\n--- Test 37 (a): quickSyncCloudMetadata không select cover/description và chỉ gọi tải đầy đủ cho truyện đổi ---');
releaseSyncLock();
resetBackoff();
setHostOverrideForTesting('user-test.github.io');
setAutoSyncEnabled(true);
setActiveProfile('real');

global.localStorage.clear();
mockDB.novels.clear();
mockDB.chapters.clear();
supabaseMock.tables.novels.clear();
saveSyncLedger({ novels: {}, cultivation: { lastSyncedRev: 0, lastCloudUpdatedAt: 0 }, lastSyncedAt: 1000 });

// Setup trên cloud 2 truyện:
// nov_37_1: updated_at 1000 (khớp với máy A, không đổi)
supabaseMock.tables.novels.set('user_123:nov_37_1', {
  user_id: 'user_123',
  id: 'nov_37_1',
  title: 'Truyện 37_1 Không Đổi',
  description: 'Mô tả 1',
  cover: 'cover1.jpg',
  is_hidden: false,
  chapter_count: 5,
  updated_at: 1000,
});

// nov_37_2: updated_at 2000 (cloud mới hơn máy A có updatedAt 1000)
supabaseMock.tables.novels.set('user_123:nov_37_2', {
  user_id: 'user_123',
  id: 'nov_37_2',
  title: 'Truyện 37_2 Đã Đổi',
  description: 'Mô tả 2 Mới',
  cover: 'cover2_new.jpg',
  is_hidden: true,
  chapter_count: 6,
  updated_at: 2000,
});

// Setup trên máy A:
addToLibrary({ id: 'nov_37_1', title: 'Truyện 37_1 Không Đổi', updatedAt: 1000 });
addToLibrary({ id: 'nov_37_2', title: 'Truyện 37_2 Cũ', updatedAt: 1000 });
await saveNovel({ id: 'nov_37_1', title: 'Truyện 37_1 Không Đổi', updatedAt: 1000 });
await saveNovel({ id: 'nov_37_2', title: 'Truyện 37_2 Cũ', updatedAt: 1000 });

// Reset lịch sử select của mock
supabaseMock.selectHistory = [];

await quickSyncCloudMetadata(supabaseMock);

// 1. Kiểm tra truy vấn danh sách ban đầu KHÔNG select cover và description
const listQuery = supabaseMock.selectHistory.find(q => q.tableName === 'novels' && !q.isSingle);
assert(listQuery, 'Phải có truy vấn select danh sách bảng novels');
assert(!listQuery.cols.includes('cover'), 'Truy vấn danh sách KHÔNG được select cover');
assert(!listQuery.cols.includes('description'), 'Truy vấn danh sách KHÔNG được select description');
assert(listQuery.cols.includes('id') && listQuery.cols.includes('updated_at'), 'Truy vấn danh sách phải select id và updated_at');

// 2. Kiểm tra chỉ gọi tải đầy đủ cho truyện thật sự đổi (nov_37_2), nov_37_1 KHÔNG được tải riêng
const singleQueries = supabaseMock.selectHistory.filter(q => q.tableName === 'novels' && q.isSingle);
assert.strictEqual(singleQueries.length, 1, 'Chỉ được gọi truy vấn tải đầy đủ cho đúng 1 truyện thật sự đổi');
assert.strictEqual(singleQueries[0].novelId, 'nov_37_2', 'Truyện được tải đầy đủ phải là nov_37_2');

// 3. Kiểm tra máy A đã nhận được dữ liệu của nov_37_2 và ledger được lưu
const lib37_2 = getLibrary({ includeHidden: true }).find(n => n.id === 'nov_37_2');
assert.strictEqual(lib37_2.title, 'Truyện 37_2 Đã Đổi');
assert.strictEqual(lib37_2.isHidden, true);
assert.strictEqual(lib37_2.updatedAt, 2000);

const ledger37 = getSyncLedger();
assert.strictEqual(ledger37.novels?.['nov_37_2']?.lastSyncedMetaAt, 2000, 'Ledger phải ghi nhận lastSyncedMetaAt sau khi áp dụng');
console.log('✓ Test 37 Passed: quickSyncCloudMetadata không select cover/description và chỉ tải đầy đủ truyện thật sự đổi!');

// -------------------------------------------------------------
// TEST 38 (b): máy B đổi cover/description ở cloud: máy A sau quickSync + runAutoSync nhận được cover và description mới
// -------------------------------------------------------------
console.log('\n--- Test 38 (b): Máy B đổi cover/description ở cloud -> Máy A nhận được ---');
global.localStorage.clear();
mockDB.novels.clear();
saveSyncLedger({ novels: {}, cultivation: { lastSyncedRev: 0, lastCloudUpdatedAt: 0 }, lastSyncedAt: 1000 });

// Setup Máy A có nov_38 với cover và description cũ
const nov38Old = {
  id: 'nov_38',
  title: 'Truyện 38 Bìa & Mô Tả',
  description: 'Mô tả cũ máy A',
  coverUrl: 'http://cdn.old/cover_old.jpg',
  updatedAt: 1000,
};
await saveNovel(nov38Old);
addToLibrary({
  id: 'nov_38',
  title: nov38Old.title,
  description: nov38Old.description,
  coverThumb: 'data:image/jpeg;base64,thumb_old',
  updatedAt: 1000,
});

// Giả lập máy B đổi cover và description trên cloud (updated_at = 3000 > 1000)
supabaseMock.tables.novels.set('user_123:nov_38', {
  user_id: 'user_123',
  id: 'nov_38',
  title: 'Truyện 38 Bìa & Mô Tả',
  description: 'Mô tả MỚI toanh từ máy B',
  cover: 'http://cdn.new/cover_new.jpg',
  is_hidden: false,
  chapter_count: 10,
  updated_at: 3000,
});

// Máy A chạy quickSyncCloudMetadata + runAutoSync
await quickSyncCloudMetadata(supabaseMock);
await runAutoSync(supabaseMock, { force: true });

// Kiểm tra Máy A nhận được description và cover mới
const lib38After = getLibrary({ includeHidden: true }).find(n => n.id === 'nov_38');
assert.strictEqual(lib38After.description, 'Mô tả MỚI toanh từ máy B', 'Library máy A phải nhận description mới');
assert.strictEqual(lib38After.updatedAt, 3000, 'Library máy A phải có updatedAt mới');

const dbNovel38After = await getNovel('nov_38');
assert.strictEqual(dbNovel38After.description, 'Mô tả MỚI toanh từ máy B', 'IndexedDB máy A phải nhận description mới');
assert.strictEqual(dbNovel38After.coverUrl, 'http://cdn.new/cover_new.jpg', 'IndexedDB máy A phải nhận coverUrl mới');
console.log('✓ Test 38 Passed: Máy B đổi cover/description ở cloud -> Máy A nhận được trọn vẹn!');

// -------------------------------------------------------------
// TEST 39 (c): quickPushLibraryMetadata không ghi đè khi cloud updated_at lớn hơn
// -------------------------------------------------------------
console.log('\n--- Test 39 (c): quickPushLibraryMetadata không ghi đè khi cloud updated_at lớn hơn ---');
global.localStorage.clear();
mockDB.novels.clear();
saveSyncLedger({
  novels: { nov_39: { lastSyncedMetaAt: 3000 } },
  cultivation: { lastSyncedRev: 0, lastCloudUpdatedAt: 0 },
  lastSyncedAt: 1000,
});

// Trên cloud: nov_39 có updated_at = 5000, title = 'Tiêu đề Cloud Mới'
supabaseMock.tables.novels.set('user_123:nov_39', {
  user_id: 'user_123',
  id: 'nov_39',
  title: 'Tiêu đề Cloud Mới',
  description: 'Mô tả Cloud',
  cover: 'cloud_cover.jpg',
  is_hidden: false,
  chapter_count: 10,
  updated_at: 5000,
});

// Trên máy A: nov_39 có updatedAt = 4000 (nhỏ hơn 5000 của cloud, nhưng > 3000 của lastSyncedMetaAt)
await saveNovel({ id: 'nov_39', title: 'Tiêu đề Cũ Máy A', updatedAt: 4000 });
addToLibrary({ id: 'nov_39', title: 'Tiêu đề Cũ Máy A', updatedAt: 4000 });

// Gọi quickPushLibraryMetadata
await quickPushLibraryMetadata(supabaseMock);

// Kiểm tra: Cloud row KHÔNG bị ghi đè, vẫn giữ nguyên updated_at 5000 và tiêu đề mới
const cloudRow39After = supabaseMock.tables.novels.get('user_123:nov_39');
assert.strictEqual(cloudRow39After.title, 'Tiêu đề Cloud Mới', 'Cloud row không được bị đè bởi tiêu đề cũ');
assert.strictEqual(cloudRow39After.updated_at, 5000, 'Cloud row phải giữ nguyên updated_at 5000');
console.log('✓ Test 39 Passed: quickPushLibraryMetadata không ghi đè khi cloud updated_at lớn hơn!');

// -------------------------------------------------------------
// TEST 40 (d): quickPushLibraryMetadata không gửi cover rỗng
// -------------------------------------------------------------
console.log('\n--- Test 40 (d): quickPushLibraryMetadata không gửi cover rỗng ---');
global.localStorage.clear();
mockDB.novels.clear();
saveSyncLedger({
  novels: { nov_40: { lastSyncedMetaAt: 1000 } },
  cultivation: { lastSyncedRev: 0, lastCloudUpdatedAt: 0 },
  lastSyncedAt: 1000,
});

// Trên Cloud: nov_40 đã có sẵn bìa xịn
supabaseMock.tables.novels.set('user_123:nov_40', {
  user_id: 'user_123',
  id: 'nov_40',
  title: 'Truyện 40 Có Bìa Sẵn',
  description: 'Mô tả',
  cover: 'https://cdn.example.com/existing_cover.png',
  is_hidden: false,
  chapter_count: 5,
  updated_at: 1000,
});

// Trên máy A: sửa thông tin (updatedAt = 2000), nhưng coverUrl trong IndexedDB là rỗng
await saveNovel({ id: 'nov_40', title: 'Truyện 40 Đổi Tên', coverUrl: '', updatedAt: 2000 });
addToLibrary({ id: 'nov_40', title: 'Truyện 40 Đổi Tên', updatedAt: 2000 });

supabaseMock.lastUpdatePayload = null;
await quickPushLibraryMetadata(supabaseMock);

// Kiểm tra: update payload tuyệt đối KHÔNG có trường cover (hoặc cover !== '')
assert(
  !supabaseMock.lastUpdatePayload || supabaseMock.lastUpdatePayload.cover === undefined,
  'Payload cập nhật không được chứa trường cover rỗng'
);

// Kiểm tra: Cloud row vẫn giữ nguyên cover có sẵn, không bị đè thành rỗng
const cloudRow40After = supabaseMock.tables.novels.get('user_123:nov_40');
assert.strictEqual(
  cloudRow40After.cover,
  'https://cdn.example.com/existing_cover.png',
  'Cover trên Cloud phải được bảo toàn, không bị đè thành rỗng!'
);
assert.strictEqual(cloudRow40After.title, 'Truyện 40 Đổi Tên', 'Title phải được cập nhật thành công');
console.log('✓ Test 40 Passed: quickPushLibraryMetadata tuyệt đối không gửi cover rỗng!');

// -------------------------------------------------------------
// TEST 41 (a): saveCultivationState chỉ phát 'cultivation_updated', KHÔNG phát 'cultivation_cloud_applied'
// -------------------------------------------------------------
console.log('\n--- Test 41 (a): saveCultivationState chỉ phát cultivation_updated, KHÔNG phát cultivation_cloud_applied ---');
let updatedFired41 = false;
let cloudAppliedFired41 = false;

const onUpdated41a = () => { updatedFired41 = true; };
const onCloudApplied41a = () => { cloudAppliedFired41 = true; };

global.window.addEventListener('cultivation_updated', onUpdated41a);
global.window.addEventListener('cultivation_cloud_applied', onCloudApplied41a);

try {
  const curState = getCultivationState();
  saveCultivationState(curState);
  assert.strictEqual(updatedFired41, true, 'saveCultivationState phải phát cultivation_updated');
  assert.strictEqual(cloudAppliedFired41, false, 'saveCultivationState tuyệt đối KHÔNG phát cultivation_cloud_applied');
} finally {
  global.window.removeEventListener('cultivation_updated', onUpdated41a);
  global.window.removeEventListener('cultivation_cloud_applied', onCloudApplied41a);
}
console.log('✓ Test 41 Passed: saveCultivationState chỉ phát cultivation_updated, KHÔNG phát cultivation_cloud_applied!');

// -------------------------------------------------------------
// TEST 42 (b): fast-forward từ thiết bị khác phát cả hai sự kiện, 'cultivation_cloud_applied' có detail.rev đúng
// -------------------------------------------------------------
console.log('\n--- Test 42 (b): Fast-forward từ thiết bị khác phát cả hai sự kiện, cultivation_cloud_applied có detail.rev đúng ---');
releaseSyncLock();
resetBackoff();
supabaseMock.tables.novels.clear();
mockDB.novels.clear();

let cultUpdatedDetail42 = null;
let cloudAppliedDetail42 = null;

const onUpdated42b = (e) => { cultUpdatedDetail42 = e.detail; };
const onCloudApplied42b = (e) => { cloudAppliedDetail42 = e.detail; };

global.window.addEventListener('cultivation_updated', onUpdated42b);
global.window.addEventListener('cultivation_cloud_applied', onCloudApplied42b);

try {
  // Local đang ở rev 70
  const local42 = { realm: 'ngung_khi', totalExp: 500, _rev: 70 };
  global.localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(local42));
  saveSyncLedger({
    novels: {},
    cultivation: { lastSyncedRev: 70, lastCloudUpdatedAt: Date.now() - 10000 },
    lastSyncedAt: Date.now() - 10000,
  });

  // Cloud từ thiết bị khác (device_laptop) có rev 85
  supabaseMock.tables.cultivation.set('user_123', {
    user_id: 'user_123',
    rev: 85,
    updated_at: Date.now(),
    device_id: 'device_laptop',
    state: { realm: 'truc_co', totalExp: 2000, _rev: 85 },
  });

  const res42 = await runAutoSync(supabaseMock);
  assert.strictEqual(res42.success, true);
  assert(cultUpdatedDetail42, 'Phải phát cultivation_updated');
  assert(cloudAppliedDetail42, 'Phải phát cultivation_cloud_applied');
  assert.strictEqual(cloudAppliedDetail42.rev, 85, 'detail.rev phải bằng rev của Cloud (85)');
  assert.strictEqual(cloudAppliedDetail42.fromDeviceId, 'device_laptop', 'detail.fromDeviceId phải là device_laptop');
} finally {
  global.window.removeEventListener('cultivation_updated', onUpdated42b);
  global.window.removeEventListener('cultivation_cloud_applied', onCloudApplied42b);
}
console.log('✓ Test 42 Passed: Fast-forward từ thiết bị khác phát cả hai sự kiện với detail.rev chuẩn xác!');

// -------------------------------------------------------------
// TEST 43 (c): fast-forward khi cloud.device_id trùng thiết bị này không phát 'cultivation_cloud_applied'
// -------------------------------------------------------------
console.log('\n--- Test 43 (c): Fast-forward khi cloud.device_id trùng thiết bị này không phát cultivation_cloud_applied ---');
releaseSyncLock();
resetBackoff();
supabaseMock.tables.novels.clear();
mockDB.novels.clear();

let cloudAppliedFired43 = false;
const onCloudApplied43c = () => { cloudAppliedFired43 = true; };
global.window.addEventListener('cultivation_cloud_applied', onCloudApplied43c);

try {
  const currentDevId = getDeviceId();
  // Cloud có rev 90 nhưng device_id chính là currentDevId
  const local43 = { realm: 'truc_co', totalExp: 2000, _rev: 85 };
  global.localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(local43));
  saveSyncLedger({
    novels: {},
    cultivation: { lastSyncedRev: 85, lastCloudUpdatedAt: Date.now() - 10000 },
    lastSyncedAt: Date.now() - 10000,
  });

  supabaseMock.tables.cultivation.set('user_123', {
    user_id: 'user_123',
    rev: 90,
    updated_at: Date.now(),
    device_id: currentDevId,
    state: { realm: 'truc_co', totalExp: 2500, _rev: 90 },
  });

  await runAutoSync(supabaseMock);
  assert.strictEqual(cloudAppliedFired43, false, 'Không được phát cultivation_cloud_applied khi device_id là chính thiết bị này');

  // Test cả nhánh pullCultivationBeforeMeditation
  cloudAppliedFired43 = false;
  await pullCultivationBeforeMeditation(supabaseMock);
  assert.strictEqual(cloudAppliedFired43, false, 'pullCultivationBeforeMeditation không được phát cultivation_cloud_applied cho chính thiết bị này');
} finally {
  global.window.removeEventListener('cultivation_cloud_applied', onCloudApplied43c);
}
console.log('✓ Test 43 Passed: Fast-forward khi trùng device_id tuyệt đối không phát cultivation_cloud_applied!');

// -------------------------------------------------------------
// TEST 44 (d): sau fast-forward, saveCultivationState dùng _rev từ state cloud (rev+1)
// -------------------------------------------------------------
console.log('\n--- Test 44 (d): Sau fast-forward, saveCultivationState dùng _rev từ state cloud (rev+1) ---');
releaseSyncLock();
resetBackoff();
supabaseMock.tables.novels.clear();
mockDB.novels.clear();

// Local trước khi FF đang ở rev 10
const local44 = { realm: 'ngung_khi', totalExp: 100, _rev: 10 };
global.localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(local44));
saveSyncLedger({
  novels: {},
  cultivation: { lastSyncedRev: 10, lastCloudUpdatedAt: Date.now() - 10000 },
  lastSyncedAt: Date.now() - 10000,
});

// Cloud có rev 100
supabaseMock.tables.cultivation.set('user_123', {
  user_id: 'user_123',
  rev: 100,
  updated_at: Date.now(),
  device_id: 'other_device_tablet',
  state: { realm: 'kim_dan', totalExp: 50000, _rev: 100 },
});

// Chạy fast-forward từ cloud
const resFF44 = await runAutoSync(supabaseMock);
assert.strictEqual(resFF44.success, true);

// Lấy state sau fast-forward và gọi saveCultivationState (mô phỏng chu kỳ ngộ đạo hoặc thao tác tiếp theo)
const stateAfterFF = getCultivationState();
assert.strictEqual(stateAfterFF._rev, 100, 'State sau FF phải có _rev = 100 từ Cloud');

saveCultivationState(stateAfterFF);
const savedState = getCultivationState();
assert.strictEqual(savedState._rev, 101, 'Sau khi lưu cục bộ kế tiếp, _rev phải là rev Cloud + 1 (100 + 1 = 101)');
console.log('✓ Test 44 Passed: Sau fast-forward, saveCultivationState sử dụng chuẩn xác _rev từ Cloud (rev+1)!');

console.log('\n=== TẤT CẢ 44 BÀI TEST (PHASE 1 + PHASE 2 + VAULT & HIDE SYNC + QUICK METADATA SYNC + CULTIVATION BANNER FIX) ĐÃ VƯỢT QUA 100% HOÀN HẢO! ===');


