/**
 * scripts/test-library-reconcile-and-dirty-tracing.js
 * 
 * Kiểm thử Phần 5:
 * 1. Truy vết nguyên nhân cờ bẩn (Dirty reason tracing):
 *    - Các thao tác DB đánh dấu dirty với lý do chuẩn xác (novel_save, chapter_edit, bulk_add, chapter_delete, all_chapters_delete, backup_restore).
 *    - getDirtyNovels() tương thích ngược: vừa so sánh được số (>= timestamp) vừa đọc được .reason.
 * 2. Đối chiếu số chương thư viện chuẩn (reconcileLibraryChapterCounts):
 *    - Sửa số chương "ảo" trên thẻ Thư viện (437) về số chương thực tế trong IndexedDB (404).
 * 3. Kiểm tra tiến độ đọc tuyệt đối KHÔNG làm bẩn cờ dirty.
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
  }
}

const mockDB = new MockDB();

const {
  saveNovel,
  saveChapter,
  saveChaptersBulk,
  deleteChapterDB,
  deleteAllChapters,
  reconcileLibraryChapterCounts,
  setDBPromiseForTesting,
} = await import('../src/lib/db.js');

setDBPromiseForTesting(Promise.resolve(mockDB));

const {
  getDirtyNovels,
  getDirtyNovelDetails,
  clearNovelDirty,
  markNovelDirty,
} = await import('../src/lib/sync/syncLedger.js');

const {
  getLibrary,
  addToLibrary,
  saveReadingProgress,
} = await import('../src/lib/storage.js');

console.log('=== BẮT ĐẦU TEST PHẦN 5: RECONCILE & DIRTY TRACING ===\n');

try {
  const novelId = 'novel_reconcile_test';
  const now = Date.now();

  // 1. Kiểm tra Dirty Reason Tracing
  console.log('--- Test 1: Kiểm tra Dirty Reason Tracing ---');

  // a) saveChapter -> chapter_edit
  await saveChapter({ id: 'ch_1', novelId, title: 'Chương 1', content: 'abc' });
  let dirty = getDirtyNovels();
  assert.ok(dirty[novelId], 'saveChapter phải đánh dấu dirty');
  assert.ok(dirty[novelId] >= now - 5000, 'Tương thích ngược: so sánh số >= timestamp hoạt động tốt');
  assert.strictEqual(dirty[novelId].reason, 'chapter_edit', 'Reason phải là chapter_edit');
  clearNovelDirty(novelId);

  // b) saveChaptersBulk -> bulk_add
  await saveChaptersBulk([
    { id: 'ch_2', novelId, title: 'Chương 2', content: 'def' },
    { id: 'ch_3', novelId, title: 'Chương 3', content: 'ghi' },
  ]);
  dirty = getDirtyNovels();
  assert.strictEqual(dirty[novelId].reason, 'bulk_add', 'Reason phải là bulk_add');
  clearNovelDirty(novelId);

  // c) saveNovel with markDirty -> novel_save
  await saveNovel({ id: novelId, title: 'Test Novel' }, { markDirty: true });
  dirty = getDirtyNovels();
  assert.strictEqual(dirty[novelId].reason, 'novel_save', 'Reason phải là novel_save');
  clearNovelDirty(novelId);

  // d) deleteChapterDB -> chapter_delete
  await deleteChapterDB('ch_3', novelId);
  dirty = getDirtyNovels();
  assert.strictEqual(dirty[novelId].reason, 'chapter_delete', 'Reason phải là chapter_delete');
  clearNovelDirty(novelId);

  // e) backup_restore
  markNovelDirty(novelId, Date.now(), 'backup_restore');
  dirty = getDirtyNovels();
  assert.strictEqual(dirty[novelId].reason, 'backup_restore', 'Reason phải là backup_restore');
  clearNovelDirty(novelId);

  console.log('  ✓ Test 1 đạt: Truy vết nguyên nhân cờ bẩn hoạt động hoàn hảo và tương thích ngược 100%!\n');

  // 2. Kiểm tra Tiến độ đọc tuyệt đối không gây dirty
  console.log('--- Test 2: Tiến độ đọc không bao giờ bật dirty flag ---');
  clearNovelDirty(novelId);
  saveReadingProgress(novelId, { chapterId: 'ch_1', scrollRatio: 0.5, updatedAt: Date.now() });
  dirty = getDirtyNovels();
  assert.strictEqual(dirty[novelId], undefined, 'saveReadingProgress TUYỆT ĐỐI không được đánh dấu dirty');
  console.log('  ✓ Test 2 đạt: Đọc truyện không làm bẩn cờ đồng bộ!\n');

  // 3. Kiểm tra reconcileLibraryChapterCounts
  console.log('--- Test 3: Đối chiếu số chương Thư viện từ dữ liệu thật ---');
  // Hiện tại trong MockDB có 2 chương: ch_1 và ch_2
  // Thư viện đang lưu "ảo" là 437 chương (do metadata cloud kéo về trước đó)
  addToLibrary({
    id: novelId,
    title: 'Test Novel',
    chapterCount: 437, // "Ảo"
    totalChapters: 437,
    updatedAt: now,
  });

  let libItem = getLibrary().find(item => item.id === novelId);
  assert.strictEqual(libItem.chapterCount, 437, 'Trước khi đối chiếu: chapterCount là 437');

  const reconciledCount = await reconcileLibraryChapterCounts([novelId]);
  assert.strictEqual(reconciledCount, 1, 'Phải sửa 1 truyện có số chương lệch');

  libItem = getLibrary().find(item => item.id === novelId);
  assert.strictEqual(libItem.chapterCount, 2, 'Sau khi đối chiếu: chapterCount phải đúng là 2 (từ DB thật)');
  assert.strictEqual(libItem.totalChapters, 2, 'totalChapters cũng phải là 2');
  assert.strictEqual(libItem.updatedAt, now, 'reconcileLibraryChapterCounts TUYỆT ĐỐI không được thay đổi updatedAt của metadata');

  // Gọi lại lần nữa (idempotency) -> không còn truyện nào lệch
  const secondRun = await reconcileLibraryChapterCounts([novelId]);
  assert.strictEqual(secondRun, 0, 'Lần chạy tiếp theo không thay đổi gì (idempotent)');

  console.log('  ✓ Test 3 đạt: Thư viện tự động đối chiếu số chương chuẩn xác từ IndexedDB, bảo toàn updatedAt!\n');

  // 4. Kiểm tra mergeNovelWithCloud không làm sai lệch updatedAt
  console.log('--- Test 4: mergeNovelWithCloud bảo toàn updatedAt ---');
  const cloudMetaTime = 123456789;
  const initialLibTime = 1000000;
  addToLibrary({
    id: 'novel_preserve_time',
    title: 'Preserve Time Novel',
    chapterCount: 1,
    totalChapters: 1,
    updatedAt: initialLibTime,
  });

  const { mergeNovelWithCloud } = await import('../src/lib/sync/syncEngine.js');
  const mockSupabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'usr_test' } } }) },
    storage: {
      from: () => ({
        download: async () => ({ data: new Blob([JSON.stringify([])]), error: null }),
        upload: async () => ({ data: {}, error: null }),
      }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [{ id: 'novel_preserve_time', chapter_count: 1, updated_at: cloudMetaTime }] }) }) }),
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [] }) }) }),
    }),
  };

  const testLedger = { novels: {} };
  await mergeNovelWithCloud(mockSupabase, 'usr_test', 'novel_preserve_time', { id: 'novel_preserve_time', chapter_count: 1, updated_at: cloudMetaTime }, testLedger);

  const afterMergeItem = getLibrary({ includeHidden: true }).find(n => n.id === 'novel_preserve_time');
  assert.strictEqual(afterMergeItem.updatedAt, cloudMetaTime, 'mergeNovelWithCloud phải giữ cloudRow.updated_at, không được bump Date.now()');
  assert.strictEqual(testLedger.novels['novel_preserve_time'].lastSyncedMetaAt, cloudMetaTime, 'lastSyncedMetaAt phải khớp cloudMetaTime');
  console.log('  ✓ Test 4 đạt: mergeNovelWithCloud bảo toàn metadata updatedAt và lastSyncedMetaAt!\n');

  console.log('🎉 TẤT CẢ TEST PHẦN 5 ĐỀU ĐẠT 100%!');
  process.exit(0);
} catch (err) {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
}
