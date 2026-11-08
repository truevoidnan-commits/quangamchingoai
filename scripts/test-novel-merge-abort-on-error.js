/**
 * scripts/test-novel-merge-abort-on-error.js
 * 
 * Kiểm thử cơ chế bảo vệ chống ghi đè Cloud khi gặp lỗi tải/giải nén:
 * 1. download trả lỗi mạng -> mergeNovelWithCloud ném lỗi, Cloud KHÔNG bị ghi, dirty còn nguyên.
 * 2. file bị hỏng (corrupted gzip/json) -> ném lỗi, Cloud KHÔNG bị ghi, dirty còn nguyên.
 * 3. file không tồn tại (404) VÀ Cloud chưa có chương (chapter_count = 0) -> đẩy bình thường.
 * 4. Chốt an toàn: Cloud có 437 chương, tải được 404 chương -> KHÔNG upload, Cloud không bị ghi đè.
 * 5. resyncNovel bắt lỗi đúng cách và trả về { success: false }, dirty còn nguyên.
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
  resyncNovel,
  compressChapters,
  isStorageNotFoundError,
} = await import('../src/lib/sync/syncEngine.js');

const {
  getDirtyNovels,
  markNovelDirty,
  clearNovelDirty,
  getSyncLedger,
} = await import('../src/lib/sync/syncLedger.js');

const {
  getLibrary,
  saveLibrary,
} = await import('../src/lib/storage.js');

console.log('=== BẮT ĐẦU TEST BẢO VỆ DỮ LIỆU KHI TẢI CLOUD LỖI (scripts/test-novel-merge-abort-on-error.js) ===\n');

try {
  const userId = 'user_abort_test_999';
  const novelId = 'novel_daochuyen';

  // 0. Test hàm isStorageNotFoundError
  console.log('--- Test 0: isStorageNotFoundError nhận diện đúng lỗi 404/not found ---');
  assert.strictEqual(isStorageNotFoundError(null), false);
  assert.strictEqual(isStorageNotFoundError({ status: 404 }), true);
  assert.strictEqual(isStorageNotFoundError({ statusCode: '404' }), true);
  assert.strictEqual(isStorageNotFoundError({ message: 'Object not found' }), true);
  assert.strictEqual(isStorageNotFoundError({ message: 'The resource was not found' }), true);
  assert.strictEqual(isStorageNotFoundError({ message: 'The specified key does not exist.' }), true);
  assert.strictEqual(isStorageNotFoundError({ message: 'Failed to fetch', status: 500 }), false);
  assert.strictEqual(isStorageNotFoundError({ message: 'Network connection timeout' }), false);
  console.log('✓ Test 0 PASSED: isStorageNotFoundError hoạt động chuẩn xác.\n');

  // Khởi tạo truyện cục bộ: 404 chương
  const localChapters404 = Array.from({ length: 404 }, (_, i) => ({
    id: `ch_${i + 1}`,
    novelId,
    title: `Chương ${i + 1}`,
    content: `Nội dung chương ${i + 1}`,
    order: i,
  }));
  await saveChaptersBulk(localChapters404, { skipDirty: true });
  await saveNovel({
    id: novelId,
    title: 'Đạo Uyển',
    chapterCount: 404,
    totalChapters: 404,
  }, { skipDirty: true });
  saveLibrary([{
    id: novelId,
    title: 'Đạo Uyển',
    chapterCount: 404,
    totalChapters: 404,
    updatedAt: 1700000000000,
  }]);

  // -------------------------------------------------------------
  // Test 1: Download trả lỗi mạng -> ném lỗi, Cloud KHÔNG bị ghi, dirty còn nguyên
  // -------------------------------------------------------------
  console.log('--- Test 1: Lỗi mạng khi download file Cloud -> Ném lỗi và giữ nguyên dirty ---');
  markNovelDirty(novelId, 'manual_test');
  assert.strictEqual(Boolean(getDirtyNovels()[novelId]), true, 'Trước test 1, truyện phải dirty');

  let cloudUploadCalled = false;
  let cloudTableUpdateCalled = false;

  const mockSupabaseNetworkError = {
    storage: {
      from: () => ({
        download: async () => ({
          data: null,
          error: { message: 'Network connection timeout', status: 504 },
        }),
        upload: async () => {
          cloudUploadCalled = true;
          return { data: { path: 'test' }, error: null };
        },
      }),
    },
    from: () => ({
      update: () => {
        cloudTableUpdateCalled = true;
        return {
          eq: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      },
    }),
  };

  const cloudRow437 = {
    id: novelId,
    user_id: userId,
    title: 'Đạo Uyển',
    chapter_count: 437,
    content_path: `${userId}/${novelId}.json.gz`,
    content_updated_at: 1700500000000,
    updated_at: 1700500000000,
  };

  let threwError1 = false;
  try {
    await mergeNovelWithCloud(mockSupabaseNetworkError, userId, novelId, cloudRow437);
  } catch (err) {
    threwError1 = true;
    assert.match(err.message, /Không tải được nội dung truyện từ Cloud/);
  }

  assert.strictEqual(threwError1, true, 'mergeNovelWithCloud phải ném lỗi khi mạng hỏng');
  assert.strictEqual(cloudUploadCalled, false, 'Cloud Storage upload TUYỆT ĐỐI không được gọi');
  assert.strictEqual(cloudTableUpdateCalled, false, 'Bảng novels TUYỆT ĐỐI không được update');
  assert.strictEqual(Boolean(getDirtyNovels()[novelId]), true, 'Cờ dirty PHẢI còn nguyên để thử lại');
  console.log('✓ Test 1 PASSED: Khi lỗi mạng, merge ném lỗi, Cloud không bị ghi, dirty còn nguyên.\n');

  // -------------------------------------------------------------
  // Test 2: File bị hỏng (corrupted gzip/json) -> ném lỗi, Cloud KHÔNG bị ghi, dirty còn nguyên
  // -------------------------------------------------------------
  console.log('--- Test 2: File trên Cloud bị hỏng -> Ném lỗi và giữ nguyên dirty ---');
  markNovelDirty(novelId, 'manual_test');
  cloudUploadCalled = false;
  cloudTableUpdateCalled = false;

  const mockSupabaseCorruptedBlob = {
    storage: {
      from: () => ({
        download: async () => ({
          data: new Blob(['NOT_A_VALID_GZIP_CONTENT_ABCXYZ_123456789']),
          error: null,
        }),
        upload: async () => {
          cloudUploadCalled = true;
          return { data: { path: 'test' }, error: null };
        },
      }),
    },
    from: () => ({
      update: () => {
        cloudTableUpdateCalled = true;
        return {
          eq: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      },
    }),
  };

  let threwError2 = false;
  try {
    await mergeNovelWithCloud(mockSupabaseCorruptedBlob, userId, novelId, cloudRow437);
  } catch (err) {
    threwError2 = true;
    assert.match(err.message, /Lỗi giải nén nội dung truyện từ Cloud/);
  }

  assert.strictEqual(threwError2, true, 'mergeNovelWithCloud phải ném lỗi khi file bị hỏng');
  assert.strictEqual(cloudUploadCalled, false, 'Cloud Storage upload TUYỆT ĐỐI không được gọi khi file hỏng');
  assert.strictEqual(cloudTableUpdateCalled, false, 'Bảng novels TUYỆT ĐỐI không được update khi file hỏng');
  assert.strictEqual(Boolean(getDirtyNovels()[novelId]), true, 'Cờ dirty PHẢI còn nguyên khi file hỏng');
  console.log('✓ Test 2 PASSED: Khi file hỏng, merge ném lỗi, Cloud không bị ghi, dirty còn nguyên.\n');

  // -------------------------------------------------------------
  // Test 3: File không tồn tại (404) VÀ Cloud chưa có chương (chapter_count = 0) -> Đẩy bình thường
  // -------------------------------------------------------------
  console.log('--- Test 3: File 404 VÀ Cloud chưa có chương (chapter_count = 0) -> Cho phép đẩy lên ---');
  clearNovelDirty(novelId);
  cloudUploadCalled = false;
  cloudTableUpdateCalled = false;

  const cloudRowEmpty = {
    id: novelId,
    user_id: userId,
    title: 'Đạo Uyển',
    chapter_count: 0,
    content_path: `${userId}/${novelId}.json.gz`,
    content_updated_at: 1700100000000,
    updated_at: 1700100000000,
  };

  const mockSupabase404Empty = {
    storage: {
      from: () => ({
        download: async () => ({
          data: null,
          error: { message: 'Object not found', status: 404 },
        }),
        upload: async () => {
          cloudUploadCalled = true;
          return { data: { path: 'test' }, error: null };
        },
      }),
    },
    from: () => ({
      update: () => {
        cloudTableUpdateCalled = true;
        return {
          eq: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      },
    }),
  };

  const res3 = await mergeNovelWithCloud(mockSupabase404Empty, userId, novelId, cloudRowEmpty);
  assert.strictEqual(res3.merged, 404, 'Gộp ra đúng 404 chương');
  assert.strictEqual(res3.uploaded, true, 'Được phép upload khi Cloud thực sự rỗng');
  assert.strictEqual(cloudUploadCalled, true, 'Storage upload PHẢI được gọi');
  assert.strictEqual(cloudTableUpdateCalled, true, 'Bảng novels PHẢI được cập nhật');
  console.log('✓ Test 3 PASSED: Khi Cloud chưa có chương và file 404, đẩy truyện lên thành công.\n');

  // -------------------------------------------------------------
  // Test 4: Chốt an toàn: Cloud có 437 chương, tải về được 404 chương -> KHÔNG upload
  // -------------------------------------------------------------
  console.log('--- Test 4: Chốt an toàn: Cloud có 437 chương, file tải về chỉ có 404 chương -> KHÔNG upload ---');
  cloudUploadCalled = false;
  cloudTableUpdateCalled = false;

  // Giả lập file trên Cloud chỉ giải nén ra 404 chương (ít hơn 437 của cloudRow)
  const { blob: blob404, ext: ext404 } = await compressChapters(JSON.stringify(localChapters404));

  const mockSupabase404FileWith437Row = {
    storage: {
      from: () => ({
        download: async () => ({
          data: blob404,
          error: null,
        }),
        upload: async () => {
          cloudUploadCalled = true;
          return { data: { path: 'test' }, error: null };
        },
      }),
    },
    from: () => ({
      update: () => {
        cloudTableUpdateCalled = true;
        return {
          eq: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      },
    }),
  };

  const res4 = await mergeNovelWithCloud(mockSupabase404FileWith437Row, userId, novelId, cloudRow437);
  assert.strictEqual(res4.merged, 404, 'Vẫn hợp nhất về cục bộ');
  assert.strictEqual(res4.uploaded, false, 'Chốt an toàn PHẢI ngăn upload để bảo vệ Cloud');
  assert.strictEqual(cloudUploadCalled, false, 'Storage upload TUYỆT ĐỐI không được gọi');
  assert.strictEqual(cloudTableUpdateCalled, false, 'Bảng novels TUYỆT ĐỐI không được hạ số chương xuống 404');
  console.log('✓ Test 4 PASSED: Chốt an toàn ngăn chặn upload khi Cloud có 437 nhưng file chỉ tải được 404.\n');

  // -------------------------------------------------------------
  // Test 5: resyncNovel xử lý lỗi an toàn
  // -------------------------------------------------------------
  console.log('--- Test 5: resyncNovel trả về { success: false } và giữ dirty khi lỗi mạng ---');
  markNovelDirty(novelId, 'manual_test');
  const resyncClient = {
    ...mockSupabaseNetworkError,
    auth: {
      getUser: async () => ({ data: { user: { id: userId } } }),
    },
    from: (table) => {
      if (table === 'novels') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: [cloudRow437], error: null }),
            }),
          }),
        };
      }
      return mockSupabaseNetworkError.from(table);
    },
  };

  const resyncResult = await resyncNovel(novelId, { supabase: resyncClient, userId, skipLock: true });
  assert.strictEqual(resyncResult.success, false, 'resyncNovel phải trả về success: false');
  assert.match(resyncResult.error, /Không tải được nội dung truyện từ Cloud/);
  assert.strictEqual(Boolean(getDirtyNovels()[novelId]), true, 'Cờ dirty PHẢI còn nguyên sau khi resyncNovel thất bại');
  console.log('✓ Test 5 PASSED: resyncNovel xử lý lỗi mượt mà, trả về thông báo lỗi, bảo vệ cờ dirty.\n');

  console.log('================================================================');
  console.log('TOÀN BỘ 5 BÀI TEST BẢO VỆ DỮ LIỆU ĐÃ PASS 100%!');
  console.log('================================================================\n');
  process.exit(0);
} catch (error) {
  console.error('\n❌ TEST THẤT BẠI:', error);
  process.exit(1);
}
