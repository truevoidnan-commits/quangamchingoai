import assert from 'node:assert';
import { isChunkLoadError, lazyWithRetry, prefetchLazyRoutes } from '../src/lib/lazyWithRetry.js';

console.log('=== BẮT ĐẦU KIỂM THỬ LAZY WITH RETRY & PREFETCH (scripts/test-lazy-retry.js) ===\n');

let passedTests = 0;
function test(name, fn) {
  try {
    fn();
    passedTests++;
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name} FAILED:`, err);
    process.exit(1);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passedTests++;
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name} FAILED:`, err);
    process.exit(1);
  }
}

// Mock sessionStorage
const sessionStore = new Map();
globalThis.sessionStorage = {
  getItem: (k) => sessionStore.get(k) || null,
  setItem: (k, v) => sessionStore.set(k, String(v)),
  removeItem: (k) => sessionStore.delete(k),
  clear: () => sessionStore.clear(),
};

// Mock window
let reloadCount = 0;
globalThis.window = {
  location: {
    reload: () => { reloadCount++; }
  },
  sessionStorage: globalThis.sessionStorage,
};

async function main() {
  // Test 1: isChunkLoadError detection
  test('1. isChunkLoadError nhận diện chính xác các biến thể lỗi tải chunk / module', () => {
    assert.strictEqual(isChunkLoadError(new Error('Failed to fetch dynamically imported module: https://domain/assets/chunk.js')), true);
    assert.strictEqual(isChunkLoadError(new Error('error loading dynamically imported module')), true);
    assert.strictEqual(isChunkLoadError(new Error('Loading chunk 404 failed')), true);
    assert.strictEqual(isChunkLoadError(new Error('Loading CSS chunk failed')), true);
    assert.strictEqual(isChunkLoadError(new Error('Importing a module script failed')), true);
    assert.strictEqual(isChunkLoadError(new TypeError('Failed to fetch')), true);
    
    // Không nhận nhầm lỗi code logic thông thường
    assert.strictEqual(isChunkLoadError(new Error('Variable undefined')), false);
    assert.strictEqual(isChunkLoadError(new ReferenceError('x is not defined')), false);
    assert.strictEqual(isChunkLoadError(null), false);
  });

  // Test 2: Successful import without errors
  await testAsync('2. lazyWithRetry tải thành công ngay lần đầu: không retry, không reload', async () => {
    sessionStore.clear();
    reloadCount = 0;
    let importAttempts = 0;

    const mockComp = { default: () => 'MockComponent' };
    const LazyComp = lazyWithRetry(async () => {
      importAttempts++;
      return mockComp;
    }, 'TestPage1');

    // React.lazy stores the promise resolver in _init / _payload
    const res = await LazyComp._payload._result();
    assert.strictEqual(res, mockComp);
    assert.strictEqual(importAttempts, 1);
    assert.strictEqual(reloadCount, 0);
    assert.strictEqual(sessionStore.has('tcl_chunk_retry_TestPage1'), false);
  });

  // Test 3: First attempt fails, second attempt succeeds
  await testAsync('3. lazyWithRetry thất bại lần 1, retry lần 2 thành công: không reload', async () => {
    sessionStore.clear();
    reloadCount = 0;
    let importAttempts = 0;

    const mockComp = { default: () => 'MockComponent' };
    const LazyComp = lazyWithRetry(async () => {
      importAttempts++;
      if (importAttempts === 1) {
        throw new Error('Temporary network glitch');
      }
      return mockComp;
    }, 'TestPage2');

    const res = await LazyComp._payload._result();
    assert.strictEqual(res, mockComp);
    assert.strictEqual(importAttempts, 2);
    assert.strictEqual(reloadCount, 0);
    assert.strictEqual(sessionStore.has('tcl_chunk_retry_TestPage2'), false);
  });

  // Test 4: Fails twice with chunk error -> sets flag and reloads 1 time
  await testAsync('4. lazyWithRetry lỗi chunk 2 lần và chưa từng reload: đặt cờ sessionStorage và gọi reload() đúng 1 lần', async () => {
    sessionStore.clear();
    reloadCount = 0;
    let importAttempts = 0;

    const LazyComp = lazyWithRetry(async () => {
      importAttempts++;
      throw new Error('Failed to fetch dynamically imported module: chunk-123.js');
    }, 'TestPage3');

    // Promise should hang waiting for reload
    const pendingPromise = LazyComp._payload._result();
    
    // Give it a small tick to process
    await new Promise(r => setTimeout(r, 900));

    assert.strictEqual(importAttempts, 2, 'Phải thử lại đúng 1 lần (tổng 2 lần)');
    assert.strictEqual(reloadCount, 1, 'Phải gọi reload() đúng 1 lần');
    assert.strictEqual(sessionStore.has('tcl_chunk_retry_TestPage3'), true, 'Phải ghi nhận cờ sessionStorage');
  });

  // Test 5: Fails twice with chunk error AFTER reload -> does NOT reload again, throws error for ErrorBoundary
  await testAsync('5. lazyWithRetry lỗi chunk sau khi ĐÃ reload (cờ sessionStorage = true): KHÔNG reload lặp vô hạn, ném lỗi cho ErrorBoundary', async () => {
    // Giả lập trạng thái sau khi đã reload
    sessionStore.clear();
    sessionStore.set('tcl_chunk_retry_TestPage4', String(Date.now()));
    reloadCount = 0;
    let importAttempts = 0;

    const chunkErr = new Error('Failed to fetch dynamically imported module: chunk-456.js');
    const LazyComp = lazyWithRetry(async () => {
      importAttempts++;
      throw chunkErr;
    }, 'TestPage4');

    let caughtError = null;
    try {
      await LazyComp._payload._result();
    } catch (e) {
      caughtError = e;
    }

    assert.strictEqual(caughtError, chunkErr, 'Phải ném ra đúng lỗi để ErrorBoundary hứng');
    assert.strictEqual(reloadCount, 0, 'Tuyệt đối KHÔNG được reload lần thứ 2 (chống lặp vô hạn)');
    assert.strictEqual(sessionStore.has('tcl_chunk_retry_TestPage4'), false, 'Cờ phải được dọn dẹp để không chặn các lần thử sau');
  });

  // Test 6: prefetchLazyRoutes respects Data Saver & connection
  test('6. prefetchLazyRoutes kiểm tra đúng navigator.connection (bỏ qua khi Data Saver hoặc mạng 2G)', () => {
    let prefetchedCount = 0;
    const mockFns = [
      () => { prefetchedCount++; return Promise.resolve(); },
      () => { prefetchedCount++; return Promise.resolve(); },
    ];

    // Mock requestIdleCallback
    globalThis.window.requestIdleCallback = (cb) => cb();

    const setMockNavigator = (nav) => {
      Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
    };

    // Data Saver on
    setMockNavigator({ connection: { saveData: true, effectiveType: '4g' } });
    prefetchLazyRoutes(mockFns);
    assert.strictEqual(prefetchedCount, 0, 'Không được prefetch khi bật saveData');

    // 2G connection
    setMockNavigator({ connection: { saveData: false, effectiveType: '2g' } });
    prefetchLazyRoutes(mockFns);
    assert.strictEqual(prefetchedCount, 0, 'Không được prefetch khi mạng 2g');

    // Normal fast connection
    setMockNavigator({ connection: { saveData: false, effectiveType: '4g' } });
    prefetchLazyRoutes(mockFns);
    assert.strictEqual(prefetchedCount, 2, 'Phải prefetch khi mạng bình thường');
  });

  console.log(`\n========================================`);
  console.log(`TẤT CẢ ${passedTests} BÀI KIỂM THỬ LAZY WITH RETRY ĐỀU VƯỢT QUA!`);
  console.log(`========================================\n`);
}

main().catch(err => {
  console.error('LỖI:', err);
  process.exit(1);
});
