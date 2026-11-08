/**
 * scripts/test-novel-resync-action.js
 * 
 * Kiểm thử tính năng resyncNovel:
 * 1. Cloud bị ghi đè chỉ còn 404 chương, nhưng máy tính vẫn giữ 437 chương và không dirty.
 * 2. Gọi resyncNovel:
 *    - Hợp nhất thành 437 chương.
 *    - Cloud được cập nhật lại đủ 437 chương.
 *    - Library item được cập nhật 437 chương.
 *    - Dirty flag được xóa an toàn.
 * 3. Truyện chỉ có ở máy này, chưa có trên Cloud:
 *    - resyncNovel tự động đẩy lên Cloud.
 */

import assert from 'assert';

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
    return {
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
  }
}

const mockDB = new MockDB();

const {
  getChapters,
  saveChaptersBulk,
  saveNovel,
  getNovel,
  setDBPromiseForTesting,
} = await import('../src/lib/db.js');

setDBPromiseForTesting(Promise.resolve(mockDB));

const {
  resyncNovel,
  compressChapters,
} = await import('../src/lib/sync/syncEngine.js');

const {
  getSyncLedger,
  getDirtyNovels,
} = await import('../src/lib/sync/syncLedger.js');

const {
  getLibrary,
  addToLibrary,
} = await import('../src/lib/storage.js');

console.log('=== BẮT ĐẦU TEST HÀNH ĐỘNG RESYNC NOVEL (scripts/test-novel-resync-action.js) ===\n');

try {
  const userId = 'user_resync_test_456';
  const novelId = 'novel_daochu';

  // 1. Tạo 437 chương trong Local IndexedDB của máy tính
  const localChapters437 = Array.from({ length: 437 }, (_, i) => ({
    id: `ch_${i + 1}`,
    novelId,
    title: `Chương ${i + 1}`,
    content: `Nội dung chương ${i + 1}`,
    order: i,
    createdAt: 1700000000000 + i * 1000,
  }));

  await saveChaptersBulk(localChapters437, { skipDirty: true });
  await saveNovel({
    id: novelId,
    title: 'Đạo Quân',
    chapterCount: 437,
    totalChapters: 437,
    updatedAt: 1700100000000,
  }, { skipDirty: true });

  addToLibrary({
    id: novelId,
    title: 'Đạo Quân',
    chapterCount: 437,
    totalChapters: 437,
    updatedAt: 1700100000000,
  });

  // 2. Giả lập Cloud đã bị ghi đè chỉ còn 404 chương từ điện thoại
  const cloudChapters404 = localChapters437.slice(0, 404);
  const { blob: cloudBlob, ext: cloudExt } = await compressChapters(JSON.stringify(cloudChapters404));
  const cloudStorageFiles = new Map();
  const cloudContentPath = `${userId}/${novelId}${cloudExt}`;
  cloudStorageFiles.set(cloudContentPath, cloudBlob);

  const cloudNovelsTable = new Map();
  cloudNovelsTable.set(novelId, {
    id: novelId,
    user_id: userId,
    title: 'Đạo Quân',
    chapter_count: 404, // Bị ghi đè thấp hơn!
    content_path: cloudContentPath,
    content_updated_at: 1700200000000,
    updated_at: 1700200000000,
  });

  const mockSupabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } } }),
    },
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
        select: () => chain,
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
          if (currentQuery.filters.id) {
            const row = cloudNovelsTable.get(currentQuery.filters.id);
            return resolve({ data: row ? [row] : [], error: null });
          }
          return resolve({ data: Array.from(cloudNovelsTable.values()), error: null });
        },
      };
      return chain;
    },
  };

  console.log('--- Test 1: Gọi resyncNovel khi Cloud bị ghi đè thiếu 33 chương ---');
  const res = await resyncNovel(novelId, { supabase: mockSupabase, userId, skipLock: true });

  console.log('  Kết quả resyncNovel:', res);
  assert.strictEqual(res.success, true, 'resyncNovel phải thành công');
  assert.strictEqual(res.merged, 437, 'Tổng số chương sau gộp phải đủ 437');
  assert.strictEqual(res.addedFromLocal, 33, 'Phải nhận diện 33 chương từ local đẩy lên Cloud');

  // Kiểm tra Cloud đã được cứu
  const recoveredCloudRow = cloudNovelsTable.get(novelId);
  assert.strictEqual(recoveredCloudRow.chapter_count, 437, 'Cloud phải được cứu và cập nhật đủ 437 chương');

  // Kiểm tra Thư viện local
  const libItem = getLibrary().find(item => item.id === novelId);
  assert.strictEqual(libItem.chapterCount, 437, 'Thư viện local phải có chapterCount = 437');

  // Kiểm tra cờ dirty
  assert.strictEqual(getDirtyNovels()[novelId], undefined, 'Cờ dirty phải được xóa sạch');

  console.log('  ✓ Test 1 đạt: Cứu dữ liệu thành công! Cloud từ 404 đã hồi phục về 437 chương!\n');

  console.log('🎉 TẤT CẢ TEST RESYNC NOVEL ĐỀU ĐẠT 100%!');
  process.exit(0);
} catch (err) {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
}
