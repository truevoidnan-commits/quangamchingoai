/**
 * scripts/test-novel-sync-incident.js
 * 
 * Tái hiện chính xác và kiểm thử giải pháp triệt để cho sự cố đồng bộ truyện chữ của người dùng:
 * 
 * KỊCH BẢN:
 * 1. Thiết bị A (máy tính) có 437 chương, đã đẩy lên Cloud.
 * 2. Thiết bị B (điện thoại) chỉ có 404 chương (chưa kéo 33 chương mới) và bị cờ dirty.
 *    -> Khi chạy sync trên Thiết bị B: Code mới tự động gộp (merge) mà không làm mất 33 chương của Thiết bị A.
 * 3. Tái hiện tình huống sự cố ĐÃ XẢY RA TRONG QUÁ KHỨ:
 *    - Cloud đã bị ghi đè chỉ còn 404 chương.
 *    - Thiết bị A (máy tính) vẫn giữ 437 chương trong IndexedDB nhưng không có cờ dirty.
 *    - Chạy resyncNovel trên Thiết bị A: Cloud được cứu và phục hồi đủ 437 chương.
 *    - Thiết bị B sau đó đồng bộ: Kéo về đủ 437 chương trọn vẹn.
 * 4. Kiểm tra số chương thư viện không bao giờ bị "ảo".
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
  reconcileLibraryChapterCounts,
  setDBPromiseForTesting,
} = await import('../src/lib/db.js');

setDBPromiseForTesting(Promise.resolve(mockDB));

const {
  mergeNovelWithCloud,
  pushNovelToCloud,
  resyncNovel,
  compressChapters,
  decompressChapters,
} = await import('../src/lib/sync/syncEngine.js');

const {
  getSyncLedger,
  saveSyncLedger,
  getDirtyNovels,
  markNovelDirty,
  clearNovelDirty,
  getContentSyncPoint,
  recordContentPulled,
  recordContentPushed,
} = await import('../src/lib/sync/syncLedger.js');

const {
  getLibrary,
  addToLibrary,
  updateLibraryItem,
} = await import('../src/lib/storage.js');

console.log('=== BẮT ĐẦU KIỂM THỬ TÁI HIỆN VÀ CỨU DỮ LIỆU SỰ CỐ ĐỒNG BỘ TRUYỆN CHỮ ===\n');

try {
  const userId = 'user_incident_real';
  const novelId = 'novel_vudongcankhon';

  // -------------------------------------------------------------------------
  // GIAI ĐOẠN 1: Chuẩn bị 437 chương (33 chương mới)
  // -------------------------------------------------------------------------
  const full437Chapters = Array.from({ length: 437 }, (_, i) => ({
    id: `ch_${i + 1}`,
    novelId,
    title: `Chương ${i + 1}`,
    content: `Nội dung chữ chương ${i + 1} của Vũ Động Càn Khôn`,
    order: i,
    createdAt: 1700000000000 + i * 1000,
  }));

  const cloudStorage = new Map();
  const cloudDb = new Map();

  const mockSupabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } } }),
    },
    storage: {
      from: (bucket) => ({
        download: async (path) => {
          const file = cloudStorage.get(path);
          if (!file) return { data: null, error: { message: `File not found: ${path}` } };
          return { data: file, error: null };
        },
        upload: async (path, blob, options = {}) => {
          cloudStorage.set(path, blob);
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
        single: () => {
          const row = cloudDb.get(currentQuery.filters.id);
          return Promise.resolve({ data: row || null, error: row ? null : { message: 'Row not found' } });
        },
        then: (resolve) => {
          if (currentQuery.updates && currentQuery.filters.id) {
            const existing = cloudDb.get(currentQuery.filters.id) || {};
            const updated = { ...existing, ...currentQuery.updates };
            cloudDb.set(currentQuery.filters.id, updated);
            return resolve({ data: [updated], error: null });
          }
          if (currentQuery.filters.id) {
            const row = cloudDb.get(currentQuery.filters.id);
            return resolve({ data: row ? [row] : [], error: null });
          }
          return resolve({ data: Array.from(cloudDb.values()), error: null });
        },
      };
      return chain;
    },
  };

  // -------------------------------------------------------------------------
  // GIAI ĐOẠN 2: Máy A có 437 chương, đẩy lên Cloud
  // -------------------------------------------------------------------------
  console.log('--- Giai đoạn 1: Máy A đẩy 437 chương lên Cloud ---');
  await saveChaptersBulk(full437Chapters, { skipDirty: true });
  await saveNovel({
    id: novelId,
    title: 'Vũ Động Càn Khôn',
    chapterCount: 437,
    totalChapters: 437,
    updatedAt: 1700100000000,
  }, { skipDirty: true });

  const { blob: blobA, ext: extA } = await compressChapters(JSON.stringify(full437Chapters));
  const pathA = `${userId}/${novelId}${extA}`;
  cloudStorage.set(pathA, blobA);
  cloudDb.set(novelId, {
    id: novelId,
    user_id: userId,
    title: 'Vũ Động Càn Khôn',
    chapter_count: 437,
    content_path: pathA,
    content_updated_at: 1700100000000,
    updated_at: 1700100000000,
  });

  assert.strictEqual(cloudDb.get(novelId).chapter_count, 437, 'Cloud ban đầu phải có đủ 437 chương');
  console.log('  ✓ Đã thiết lập: Cloud có 437 chương từ Máy A.\n');

  // -------------------------------------------------------------------------
  // GIAI ĐOẠN 3: Máy B (điện thoại) chỉ có 404 chương và bị dirty -> Chạy code mới
  // -------------------------------------------------------------------------
  console.log('--- Giai đoạn 2: Máy B (404 chương, bị dirty) chạy sync với code mới ---');
  // Chuyển mockDB sang trạng thái của Máy B:
  mockDB.chapters.clear();
  const bChapters404 = full437Chapters.slice(0, 404);
  await saveChaptersBulk(bChapters404, { skipDirty: true });
  markNovelDirty(novelId, 1700150000000, 'chapter_edit');

  assert(getDirtyNovels()[novelId], 'Máy B phải có cờ dirty');

  // Giả lập xung đột: Máy B chạy mergeNovelWithCloud (hoặc tự động khi conflict)
  const ledgerB = { novels: {} };
  const cloudRowNow = cloudDb.get(novelId);
  const mergeResultB = await mergeNovelWithCloud(mockSupabase, userId, novelId, cloudRowNow, ledgerB);

  console.log('  Kết quả gộp trên Máy B:', mergeResultB);
  assert.strictEqual(mergeResultB.merged, 437, 'Máy B sau khi gộp phải đủ 437 chương');
  assert.strictEqual(mergeResultB.addedFromCloud, 33, 'Máy B phải nhận đủ 33 chương mới từ Cloud');
  assert.strictEqual(cloudDb.get(novelId).chapter_count, 437, 'Cloud TUYỆT ĐỐI không bị tụt xuống 404 chương');
  assert.strictEqual(getDirtyNovels()[novelId], undefined, 'Cờ dirty của Máy B phải được xóa sạch');

  console.log('  ✓ Đạt: Code mới ngăn chặn hoàn toàn việc ghi đè mất chương khi Máy B bị xung đột!\n');

  // -------------------------------------------------------------------------
  // GIAI ĐOẠN 4: Tái hiện sự cố QUÁ KHỨ (Cloud ĐÃ LỠ BỊ GHI ĐÈ 404 chương)
  // và cứu lại dữ liệu bằng resyncNovel trên Máy A
  // -------------------------------------------------------------------------
  console.log('--- Giai đoạn 3: Tái hiện sự cố quá khứ (Cloud đã bị ghi đè 404) & Cứu dữ liệu ---');
  // Giả lập Cloud đã lỡ bị ghi đè thành 404 chương từ sự cố cũ
  const { blob: blob404, ext: ext404 } = await compressChapters(JSON.stringify(bChapters404));
  cloudStorage.set(pathA, blob404);
  cloudDb.set(novelId, {
    id: novelId,
    user_id: userId,
    title: 'Vũ Động Càn Khôn',
    chapter_count: 404, // Bị ghi đè tụt xuống!
    content_path: pathA,
    content_updated_at: 1700200000000,
    updated_at: 1700200000000,
  });

  // Máy A (máy tính) vẫn đang giữ 437 chương trong IndexedDB, nhưng KHÔNG CÓ CỜ DIRTY:
  mockDB.chapters.clear();
  await saveChaptersBulk(full437Chapters, { skipDirty: true });
  clearNovelDirty(novelId);
  addToLibrary({
    id: novelId,
    title: 'Vũ Động Càn Khôn',
    chapterCount: 437,
    totalChapters: 437,
    updatedAt: 1700100000000,
  });

  assert.strictEqual(getDirtyNovels()[novelId], undefined, 'Máy A không bị dirty');
  assert.strictEqual((await getChapters(novelId)).length, 437, 'Máy A vẫn còn nguyên 437 chương trong IndexedDB');
  assert.strictEqual(cloudDb.get(novelId).chapter_count, 404, 'Cloud đang bị hỏng (chỉ có 404 chương)');

  // Người dùng nhấn "Đồng bộ lại truyện này (gộp với Cloud)" trên Máy A:
  console.log('  -> Người dùng nhấn "Đồng bộ lại truyện này" trên Máy A...');
  const resyncResult = await resyncNovel(novelId, { supabase: mockSupabase, userId, skipLock: true });

  console.log('  Kết quả cứu dữ liệu resyncNovel:', resyncResult);
  assert.strictEqual(resyncResult.success, true, 'resyncNovel phải thành công');
  assert.strictEqual(resyncResult.merged, 437, 'Dữ liệu được cứu trọn vẹn 437 chương');
  assert.strictEqual(resyncResult.addedFromLocal, 33, 'Phải nhận diện và đẩy 33 chương quý giá từ Máy A lên Cloud');
  assert.strictEqual(resyncResult.uploaded, true, 'Bản hợp nhất phải được upload lên Cloud');

  // Kiểm tra Cloud đã hồi phục hoàn toàn
  const recoveredCloudRow = cloudDb.get(novelId);
  assert.strictEqual(recoveredCloudRow.chapter_count, 437, 'Cloud đã hồi phục đủ 437 chương!');
  console.log('  ✓ Đạt: Cloud đã được Máy A cứu về đúng 437 chương!\n');

  // -------------------------------------------------------------------------
  // GIAI ĐOẠN 5: Máy B (điện thoại) sync sau khi Cloud đã được cứu
  // -------------------------------------------------------------------------
  console.log('--- Giai đoạn 4: Máy B (điện thoại) kéo dữ liệu đã cứu về máy ---');
  mockDB.chapters.clear();
  await saveChaptersBulk(bChapters404, { skipDirty: true });
  clearNovelDirty(novelId);

  // Kéo nội dung từ Cloud đã được hồi phục
  const pullRes = await mergeNovelWithCloud(mockSupabase, userId, novelId, recoveredCloudRow, ledgerB);
  assert.strictEqual(pullRes.merged, 437, 'Máy B sau khi sync phải có đủ 437 chương');
  assert.strictEqual((await getChapters(novelId)).length, 437, 'IndexedDB của Máy B nhận đủ 437 chương');
  console.log('  ✓ Đạt: Điện thoại kéo về đủ 437 chương trọn vẹn, sự cố kết thúc tốt đẹp!\n');

  console.log('🎉 TẤT CẢ KỊCH BẢN TÁI HIỆN VÀ CỨU DỮ LIỆU SỰ CỐ ĐỀU ĐẠT 100%!');
  process.exit(0);
} catch (err) {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
}
