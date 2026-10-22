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
  getSyncStatus,
  resetBackoff,
  getBackoffDelay,
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
    };

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
            if (self.simulatedErrors.storageUpload) {
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
        builder.selectCols = cols;
        return builder;
      },
      eq(col, val) {
        builder.filters.push({ col, val });
        return builder;
      },
      single() {
        builder.isSingle = true;
        return builder;
      },
      update(updates) {
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
            rows = rows.filter(([k, r]) => r[f.col] === f.val);
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
          const dataRows = rows.map(([k, r]) => r);
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
        if (tableName === 'cultivation' && self.simulatedErrors.cultivationUpsert) {
          return { data: null, error: new Error('Simulated cultivation upsert error') };
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
} from '../src/lib/storage.js';
import {
  getActiveProfile,
  setActiveProfile,
  getCultivationState,
  getCultivationKey,
  saveCultivationState,
} from '../src/lib/cultivation.js';

console.log('=== BẮT ĐẦU CHẠY TOÀN BỘ CÁC BÀI TEST TỰ ĐỘNG SYNC (1-30) ===\n');

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

console.log('\n=== TẤT CẢ 30 BÀI TEST (PHASE 1 + PHASE 2) ĐÃ VƯỢT QUA 100% HOÀN HẢO! ===');

