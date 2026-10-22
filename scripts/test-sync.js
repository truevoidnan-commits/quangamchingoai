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
import { setDBPromiseForTesting, getNovel, getChapters } from '../src/lib/db.js';
setDBPromiseForTesting(Promise.resolve(mockDB));

// -------------------------------------------------------------
// 3. Mock In-Memory Supabase Client
// -------------------------------------------------------------
class MockSupabaseClient {
  constructor(userId = 'test_user_uuid') {
    this.userId = userId;
    this.tables = {
      novels: new Map(), // key: user_id:id -> row
      progress: new Map(), // key: user_id:novel_id -> row
      cultivation: new Map(), // key: user_id -> row
      user_settings: new Map(), // key: user_id -> row
    };
    this.storageBuckets = {
      novels: new Map(), // key: path -> Blob or Buffer
    };
    this.simulatedErrors = {
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
            if (self.simulatedErrors.storageUpload) {
              return { data: null, error: new Error('Simulated storage upload error') };
            }
            bucket.set(path, blob);
            return { data: { path }, error: null };
          },
          async download(path) {
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
  getCultivationKey,
  saveCultivationState,
} from '../src/lib/cultivation.js';

console.log('=== BẮT ĐẦU CHẠY TOÀN BỘ CÁC BÀI TEST TỰ ĐỘNG SYNC (1-11) ===\n');

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


console.log('\n=== TẤT CẢ 11 BÀI TEST ĐÃ VƯỢT QUA 100% HOÀN HẢO! ===');
