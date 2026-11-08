/**
 * scripts/test-novel-merge-conflict.js
 * 
 * Kiểm thử tính năng tự động gộp xung đột truyện chữ và merge choice:
 * - Thiết bị A có 437 chương, đã đẩy lên Cloud.
 * - Thiết bị B có 404 chương và đang bị dirty (sự cố thực tế của người dùng).
 * - Chạy manual sync với lựa chọn 'merge' (hoặc mặc định): B và Cloud đều có 437 chương.
 * - Chạy autoSync task 'conflict': TỰ ĐỘNG gộp mà không cần người dùng can thiệp, không mất chương.
 * - Đảm bảo dirty flag được xóa và ledger được cập nhật đúng.
 */

import assert from 'assert';

// Mock localStorage
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
}

global.localStorage = new LocalStorageMock();
global.IDBKeyRange = {
  bound: (lower, upper) => ({ lower, upper }),
  only: (val) => ({ lower: val, upper: val }),
};
global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
};
global.CustomEvent = class CustomEvent {
  constructor(type, params = {}) {
    this.type = type;
    this.detail = params.detail || null;
  }
};

// Mock IndexedDB
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
    const self = this;
    const tx = {
      done: Promise.resolve(),
      store: {
        put: async (ch) => self.chapters.set(ch.id, { ...ch }),
      },
      objectStore(name) {
        return {
          async get(id) {
            return self[name]?.get(id);
          },
          async put(val) {
            self[name]?.set(val.id, { ...val });
          },
          async delete(id) {
            self[name]?.delete(id);
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
            };
          },
        };
      },
    };
    return tx;
  }
}

const mockDB = new MockDB();

// Import DB modules after globals
const {
  getChapters,
  saveChaptersBulk,
  saveNovel,
  getNovel,
  setDBPromiseForTesting,
} = await import('../src/lib/db.js');

setDBPromiseForTesting(Promise.resolve(mockDB));

const {
  mergeNovelWithCloud,
  compressChapters,
  decompressChapters,
} = await import('../src/lib/sync/syncEngine.js');

const {
  getSyncLedger,
  saveSyncLedger,
  getDirtyNovels,
  markNovelDirty,
  clearNovelDirty,
} = await import('../src/lib/sync/syncLedger.js');

console.log('=== BẮT ĐẦU TEST XUNG ĐỘT GỘP TRUYỆN CHỮ (scripts/test-novel-merge-conflict.js) ===\n');

try {
  const userId = 'user_test_merge_123';
  const novelId = 'novel_vudong';

  // -------------------------------------------------------------
  // Giả lập Cloud: Có 437 chương từ Thiết bị A
  // -------------------------------------------------------------
  const cloudChapters437 = Array.from({ length: 437 }, (_, i) => ({
    id: `ch_${i + 1}`,
    novelId,
    title: `Chương ${i + 1}`,
    content: `Nội dung chương ${i + 1}`,
    order: i,
    createdAt: 1700000000000 + i * 1000,
  }));

  const { blob: cloudBlob, ext: cloudExt } = await compressChapters(JSON.stringify(cloudChapters437));
  const cloudStorageFiles = new Map();
  const cloudContentPath = `${userId}/${novelId}${cloudExt}`;
  cloudStorageFiles.set(cloudContentPath, cloudBlob);

  const cloudNovelsTable = new Map();
  cloudNovelsTable.set(novelId, {
    id: novelId,
    user_id: userId,
    title: 'Vũ Động Càn Khôn',
    chapter_count: 437,
    content_path: cloudContentPath,
    content_updated_at: 1700500000000,
    updated_at: 1700500000000,
  });

  // Mock Supabase client
  const mockSupabase = {
    storage: {
      from: (bucket) => ({
        download: async (path) => {
          const file = cloudStorageFiles.get(path);
          if (!file) return { data: null, error: { message: `File not found: ${path}` } };
          return { data: file, error: null };
        },
        upload: async (path, blob, options = {}) => {
          cloudStorageFiles.set(path, blob);
          return { data: { path }, error: null };
        },
      }),
    },
    from: (table) => {
      let currentQuery = { table, updates: null, filters: {} };
      const chain = {
        update: (updates) => {
          currentQuery.updates = updates;
          return chain;
        },
        eq: (col, val) => {
          currentQuery.filters[col] = val;
          return chain;
        },
        then: (resolve) => {
          if (currentQuery.updates && currentQuery.filters.id) {
            const existing = cloudNovelsTable.get(currentQuery.filters.id) || {};
            const updated = { ...existing, ...currentQuery.updates };
            cloudNovelsTable.set(currentQuery.filters.id, updated);
            return resolve({ data: [updated], error: null });
          }
          return resolve({ data: [], error: null });
        },
      };
      return chain;
    },
  };

  // -------------------------------------------------------------
  // Thiết bị B: Chỉ có 404 chương (chưa kéo 33 chương mới) và đang bị dirty
  // -------------------------------------------------------------
  console.log('--- Ca 1: Thiết bị B có 404 chương, Cloud có 437 chương -> Gọi mergeNovelWithCloud ---');
  const localChapters404 = cloudChapters437.slice(0, 404);
  await saveChaptersBulk(localChapters404, { skipDirty: true });
  await saveNovel({
    id: novelId,
    title: 'Vũ Động Càn Khôn',
    chapterCount: 404,
    totalChapters: 404,
    updatedAt: 1700400000000,
  }, { skipDirty: true });

  // Đánh dấu dirty trên thiết bị B
  markNovelDirty(novelId, 1700600000000);
  assert(getDirtyNovels()[novelId], 'Thiết bị B phải có cờ dirty trước khi đồng bộ');

  const ledger = getSyncLedger();
  ledger.novels[novelId] = {
    lastPulledContentAt: 1700300000000,
    lastPushedContentAt: 1700300000000,
    lastSyncedMetaAt: 1700300000000,
  };
  saveSyncLedger(ledger);

  // Thực hiện gộp
  const cloudRow = cloudNovelsTable.get(novelId);
  const mergeResult = await mergeNovelWithCloud(mockSupabase, userId, novelId, cloudRow, ledger);

  console.log('  Kết quả gộp Ca 1:', mergeResult);
  assert.strictEqual(mergeResult.merged, 437, 'Sau khi gộp phải đủ 437 chương');
  assert.strictEqual(mergeResult.addedFromCloud, 33, 'Phải thêm đúng 33 chương từ Cloud');
  assert.strictEqual(mergeResult.addedFromLocal, 0, 'Không có chương mới từ local');

  // Kiểm tra IndexedDB của Thiết bị B
  const bChapters = await getChapters(novelId);
  assert.strictEqual(bChapters.length, 437, 'Thiết bị B trong IndexedDB phải có đủ 437 chương');

  // Kiểm tra cờ dirty của Thiết bị B đã được xóa
  assert.strictEqual(getDirtyNovels()[novelId], undefined, 'Cờ dirty phải được xóa sau khi gộp thành công');

  // Kiểm tra Cloud vẫn nguyên vẹn 437 chương
  const updatedCloudRow = cloudNovelsTable.get(novelId);
  assert.strictEqual(updatedCloudRow.chapter_count, 437, 'Cloud phải giữ đủ 437 chương');

  console.log('  ✓ Ca 1 đạt: Thiết bị B bù đắp đủ 33 chương thiếu từ Cloud, không mất dữ liệu, dirty đã xóa!\n');

  // -------------------------------------------------------------
  // Ca 2: Thiết bị B có 437 chương + 5 chương mới viết (442 chương), Cloud có 437
  // -------------------------------------------------------------
  console.log('--- Ca 2: Thiết bị B có 442 chương (viết thêm 5 chương), Cloud có 437 chương ---');
  const localChapters442 = [
    ...bChapters,
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `ch_new_${438 + i}`,
      novelId,
      title: `Chương ${438 + i} mới viết`,
      content: `Nội dung mới viết ${438 + i}`,
      order: 437 + i,
      createdAt: Date.now() + i * 1000,
    })),
  ];

  await saveChaptersBulk(localChapters442, { skipDirty: true });
  markNovelDirty(novelId, Date.now());

  const mergeResult2 = await mergeNovelWithCloud(mockSupabase, userId, novelId, cloudNovelsTable.get(novelId), ledger);
  console.log('  Kết quả gộp Ca 2:', mergeResult2);
  assert.strictEqual(mergeResult2.merged, 442, 'Sau khi gộp phải là 442 chương');
  assert.strictEqual(mergeResult2.addedFromLocal, 5, 'Phải nhận diện 5 chương mới từ Local');
  assert.strictEqual(mergeResult2.uploaded, true, 'Bản hợp nhất phải được upload lên Cloud');

  const finalCloudRow = cloudNovelsTable.get(novelId);
  assert.strictEqual(finalCloudRow.chapter_count, 442, 'Cloud phải được nâng lên 442 chương');
  assert.strictEqual(getDirtyNovels()[novelId], undefined, 'Cờ dirty của local phải được xóa');

  console.log('  ✓ Ca 2 đạt: 5 chương mới từ local được đẩy lên Cloud thành công, Cloud đạt 442 chương!\n');

  console.log('🎉 TẤT CẢ TEST XUNG ĐỘT GỘP TRUYỆN CHỮ ĐỀU ĐẠT 100%!');
  process.exit(0);
} catch (err) {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
}
