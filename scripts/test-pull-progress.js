/**
 * scripts/test-pull-progress.js
 * Kiểm thử cho hàm pullNovelProgressNow(novelId, customSupabase):
 * (a) gọi pullNovelProgressNow('x') KHÔNG truyền client thứ hai -> không được ném ReferenceError (chưa đăng nhập -> updated:false, reason:'not_logged_in');
 * (b) gọi với client giả có session và dòng progress mới hơn -> updated:true, và tiến độ local + scroll_pos_* được cập nhật qua applyCloudReadingProgress;
 * (c) cloud cũ hơn local -> updated:false, không ghi đè;
 * (d) cloud lỗi/timeout 2.5s -> updated:false, không throw.
 */

import assert from 'assert';

// 1. Mock LocalStorage in Node.js
class LocalStorageMock {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] !== undefined ? this.store[key] : null;
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

if (!globalThis.localStorage) {
  globalThis.localStorage = new LocalStorageMock();
}

// Mock window / navigator
if (!globalThis.window) {
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
}
if (!globalThis.navigator) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    configurable: true,
    writable: true,
  });
}

// 2. Import functions to test
const { pullNovelProgressNow, applyCloudReadingProgress } = await import('../src/lib/sync/syncEngine.js');
const { getReadingProgress, saveReadingProgress } = await import('../src/lib/storage.js');

console.log('=== BẮT ĐẦU KIỂM THỬ PULL NOVEL PROGRESS NOW (scripts/test-pull-progress.js) ===\n');

let passedTests = 0;
const totalTests = 4;

// ---------------------------------------------------------------------------
// Test (a): Gọi pullNovelProgressNow KHÔNG truyền client thứ hai
// ---------------------------------------------------------------------------
try {
  console.log('--- Test (a): Gọi pullNovelProgressNow("novel_a") không truyền client thứ hai ---');
  let threwError = false;
  let result = null;

  try {
    result = await pullNovelProgressNow('novel_a');
  } catch (err) {
    threwError = true;
    console.error('Lỗi ném ra ngoài:', err);
  }

  assert.strictEqual(threwError, false, 'pullNovelProgressNow KHÔNG được ném lỗi ra ngoài!');
  assert.ok(result, 'Phải trả về kết quả');
  assert.strictEqual(result.updated, false, 'Khi chưa đăng nhập/môi trường test, updated phải là false');
  assert.strictEqual(
    result.reason,
    'not_logged_in',
    `Reason phải là 'not_logged_in', thực tế nhận: '${result.reason}'`
  );

  console.log('✓ Test (a) Passed: Không ném ReferenceError, trả về { updated: false, reason: "not_logged_in" }!\n');
  passedTests++;
} catch (err) {
  console.error('❌ Test (a) Thất bại:', err.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Test (b): Gọi với client giả có session và dòng progress mới hơn
// ---------------------------------------------------------------------------
try {
  console.log('--- Test (b): Client giả có session và tiến độ cloud mới hơn local ---');
  const novelId = 'novel_test_b';
  const userId = 'user_123';

  // Khởi tạo local progress cũ: updatedAt = 1000
  saveReadingProgress(novelId, {
    chapterId: 'chap_old',
    chapterTitle: 'Chương 1',
    percent: 10,
    paraIndex: 1,
    scrollTop: 100,
    updatedAt: 1000,
  });

  const cloudData = {
    chapterId: 'chap_new_99',
    chapterTitle: 'Chương 99: Đại Đột Phá',
    percent: 75,
    paraIndex: 12,
    scrollTop: 850,
    updatedAt: 5000,
  };

  const mockClient = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: userId } } },
      }),
    },
    from: (table) => {
      assert.strictEqual(table, 'progress');
      return {
        select: () => ({
          eq: (field1, val1) => ({
            eq: (field2, val2) => ({
              single: async () => {
                assert.strictEqual(val1, userId);
                assert.strictEqual(val2, novelId);
                return {
                  data: {
                    user_id: userId,
                    novel_id: novelId,
                    data: cloudData,
                    updated_at: 5000,
                  },
                  error: null,
                };
              },
            }),
          }),
        }),
      };
    },
  };

  const result = await pullNovelProgressNow(novelId, mockClient);

  assert.strictEqual(result.updated, true, 'updated phải là true khi cloud mới hơn local');
  assert.deepStrictEqual(result.data, cloudData, 'Dữ liệu trả về phải là cloudData');
  assert.strictEqual(result.cloudUpdatedAt, 5000, 'cloudUpdatedAt phải khớp');

  // Kiểm tra local progress đã được cập nhật qua applyCloudReadingProgress
  const updatedLocal = getReadingProgress(novelId);
  assert.strictEqual(updatedLocal.chapterId, 'chap_new_99', 'Local reading progress phải được cập nhật');
  assert.strictEqual(updatedLocal.percent, 75);

  // Kiểm tra scroll_pos_${novelId}_${cloudData.chapterId} đã được ghi vào localStorage
  const scrollPosKey = `scroll_pos_${novelId}_${cloudData.chapterId}`;
  const rawScrollPos = localStorage.getItem(scrollPosKey);
  assert.ok(rawScrollPos, `Khóa ${scrollPosKey} phải tồn tại trong localStorage`);
  const parsedScrollPos = JSON.parse(rawScrollPos);
  assert.strictEqual(parsedScrollPos.percent, 75);
  assert.strictEqual(parsedScrollPos.paraIndex, 12);
  assert.strictEqual(parsedScrollPos.scrollY, 850);
  assert.strictEqual(parsedScrollPos.fromCloud, true);

  console.log('✓ Test (b) Passed: updated: true, tiến độ local và scroll_pos_* được cập nhật chính xác!\n');
  passedTests++;
} catch (err) {
  console.error('❌ Test (b) Thất bại:', err.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Test (c): Cloud cũ hơn local -> updated: false, không ghi đè
// ---------------------------------------------------------------------------
try {
  console.log('--- Test (c): Cloud cũ hơn local -> updated: false, giữ nguyên local ---');
  const novelId = 'novel_test_c';
  const userId = 'user_456';

  // Local mới hơn (updatedAt = 9000)
  const localProg = {
    chapterId: 'chap_local_latest',
    chapterTitle: 'Chương mới nhất tại máy',
    percent: 90,
    paraIndex: 20,
    scrollTop: 1200,
    updatedAt: 9000,
  };
  saveReadingProgress(novelId, localProg);

  const mockClient = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: userId } } },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                user_id: userId,
                novel_id: novelId,
                data: {
                  chapterId: 'chap_cloud_stale',
                  percent: 20,
                  updatedAt: 4000,
                },
                updated_at: 4000, // Cũ hơn local (4000 < 9000)
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
  };

  const result = await pullNovelProgressNow(novelId, mockClient);

  assert.strictEqual(result.updated, false, 'updated phải là false khi cloud cũ hơn local');
  assert.deepStrictEqual(result.data, localProg, 'Dữ liệu trả về phải giữ nguyên localProg');

  // Xác nhận local progress không bị đè
  const currentLocal = getReadingProgress(novelId);
  assert.strictEqual(currentLocal.chapterId, 'chap_local_latest', 'Local không bị đè bởi bản cloud cũ');

  console.log('✓ Test (c) Passed: Cloud cũ hơn local -> updated: false, bảo toàn 100% dữ liệu local!\n');
  passedTests++;
} catch (err) {
  console.error('❌ Test (c) Thất bại:', err.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Test (d): Cloud lỗi hoặc timeout -> updated: false, không throw
// ---------------------------------------------------------------------------
try {
  console.log('--- Test (d): Cloud lỗi / timeout -> updated: false, không throw ---');
  const novelId = 'novel_test_d';
  const userId = 'user_789';

  // 1. Giả lập lỗi truy vấn Supabase
  const errorClient = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: userId } } },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: async () => ({
              data: null,
              error: { message: 'Database connection failed' },
            }),
          }),
        }),
      }),
    }),
  };

  let resErr = null;
  try {
    resErr = await pullNovelProgressNow(novelId, errorClient);
  } catch (e) {
    assert.fail(`Không được throw lỗi khi Supabase lỗi: ${e.message}`);
  }
  assert.strictEqual(resErr.updated, false, 'updated phải là false khi gặp lỗi query');

  // 2. Giả lập Exception ném ra từ query / mạng
  const throwingClient = {
    auth: {
      getSession: async () => ({
        data: { session: { user: { id: userId } } },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: async () => {
              throw new Error('Network offline or fetch failed');
            },
          }),
        }),
      }),
    }),
  };

  let resThrow = null;
  try {
    resThrow = await pullNovelProgressNow(novelId, throwingClient);
  } catch (e) {
    assert.fail(`Không được throw lỗi khi network throw: ${e.message}`);
  }
  assert.strictEqual(resThrow.updated, false, 'updated phải là false khi network throw');
  assert.ok(resThrow.error, 'Phải ghi nhận error string');

  console.log('✓ Test (d) Passed: Lỗi truy vấn và lỗi mạng được nuốt an toàn, updated: false, không throw!\n');
  passedTests++;
} catch (err) {
  console.error('❌ Test (d) Thất bại:', err.message);
  process.exit(1);
}

console.log('========================================');
console.log(`HOÀN THÀNH TẤT CẢ ${passedTests}/${totalTests} BÀI TEST PULL NOVEL PROGRESS THÀNH CÔNG!`);
console.log('========================================\n');
