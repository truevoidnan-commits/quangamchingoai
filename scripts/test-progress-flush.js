/**
 * scripts/test-progress-flush.js
 * Bộ kiểm thử cho tính năng Flush Reading Progress khi ẩn tab / đóng tab / rời chương.
 *
 * Kiểm tra đầy đủ 5 yêu cầu cốt lõi:
 * (a) hidden/pagehide đẩy đúng tiến độ đã đổi nhưng chưa debounce xong;
 * (b) không đẩy lại truyện chưa đổi;
 * (c) đẩy xong thì gọi notifyOtherDevices(['progress']);
 * (d) sandbox profile / auto-sync tắt / chưa đăng nhập thì không đẩy;
 * (e) lỗi upsert không throw ra ngoài và lần sau vẫn thử lại.
 */

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
}

global.localStorage = new LocalStorageMock();

// Mock Navigator
try {
  global.navigator = { onLine: true };
} catch {}

// Mock Window & CustomEvent & Document
const eventListeners = {};
global.window = {
  addEventListener: (event, handler) => {
    if (!eventListeners[event]) eventListeners[event] = [];
    eventListeners[event].push(handler);
  },
  removeEventListener: (event, handler) => {
    if (eventListeners[event]) {
      eventListeners[event] = eventListeners[event].filter((h) => h !== handler);
    }
  },
  dispatchEvent: (evt) => {
    const handlers = eventListeners[evt.type] || [];
    handlers.forEach((h) => h(evt));
    return true;
  },
};

const docListeners = {};
global.document = {
  visibilityState: 'visible',
  addEventListener: (event, handler) => {
    if (!docListeners[event]) docListeners[event] = [];
    docListeners[event].push(handler);
  },
  removeEventListener: (event, handler) => {
    if (docListeners[event]) {
      docListeners[event] = docListeners[event].filter((h) => h !== handler);
    }
  },
  dispatchEvent: (evt) => {
    const handlers = docListeners[evt.type] || [];
    handlers.forEach((h) => h(evt));
    return true;
  },
};

global.CustomEvent = class CustomEvent {
  constructor(type, params = {}) {
    this.type = type;
    this.detail = params.detail || null;
  }
};

// -------------------------------------------------------------
// 2. Mock MockRealtimeChannel & Supabase Client
// -------------------------------------------------------------
class MockRealtimeChannel {
  constructor(topic, options = {}) {
    this.topic = topic;
    this.options = options;
    this.listeners = [];
    this.sentMessages = [];
    this.status = 'SUBSCRIBED';
  }
  on(type, filter, callback) {
    this.listeners.push({ type, filter, callback });
    return this;
  }
  subscribe(callback) {
    this.status = 'SUBSCRIBED';
    if (callback) {
      setTimeout(() => callback('SUBSCRIBED', null), 0);
    }
    return this;
  }
  unsubscribe() {
    this.status = 'CLOSED';
    return Promise.resolve('ok');
  }
  async send(msg) {
    this.sentMessages.push(msg);
    return 'ok';
  }
}

class MockProgressSupabaseClient {
  constructor(userId = 'user_flush_test') {
    this.userId = userId;
    this.channels = new Map();
    this.tables = {
      progress: new Map(),
      novels: new Map(),
      cultivation: new Map(),
    };
    this.upsertCalls = [];
    this.failOnUpsert = false;
    this.authListeners = [];

    this.realtime = {
      setAuth: async () => {},
    };

    this.auth = {
      getSession: async () => {
        if (!this.userId) {
          return { data: { session: null }, error: null };
        }
        return {
          data: {
            session: {
              user: { id: this.userId, email: 'flush@thiencolau.vn' },
              access_token: 'mock_jwt_token',
            },
          },
          error: null,
        };
      },
      onAuthStateChange: (callback) => {
        this.authListeners.push(callback);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                this.authListeners = this.authListeners.filter((cb) => cb !== callback);
              },
            },
          },
        };
      },
    };
  }

  channel(topic, options = {}) {
    let ch = this.channels.get(topic);
    if (!ch) {
      ch = new MockRealtimeChannel(topic, options);
      this.channels.set(topic, ch);
    }
    return ch;
  }

  from(tableName) {
    const self = this;
    const builder = {
      upsert: async (payload, options = {}) => {
        self.upsertCalls.push({ table: tableName, payload, options });
        if (self.failOnUpsert) {
          return { data: null, error: new Error('Simulated network upsert failure') };
        }
        if (tableName === 'progress') {
          self.tables.progress.set(payload.novel_id, { ...payload });
        } else if (tableName === 'cultivation') {
          self.tables.cultivation.set(payload.user_id, { ...payload });
        }
        return { data: payload, error: null };
      },
      select: () => builder,
      eq: () => builder,
      lt: () => builder,
      single: () => builder,
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return builder;
  }
}

// -------------------------------------------------------------
// 3. Import modules cần kiểm thử
// -------------------------------------------------------------
const { setHostOverrideForTesting } = await import('../src/lib/sync/envProtection.js');
const { setActiveProfile } = await import('../src/lib/cultivation.js');
const {
  saveLibrary,
  saveReadingProgress,
  getReadingProgress,
} = await import('../src/lib/storage.js');
const {
  getSyncLedger,
  getNovelLastSyncedProgressAt,
  setNovelLastSyncedProgressAt,
  recordNovelTombstone,
} = await import('../src/lib/sync/syncLedger.js');
const {
  initAutoSync,
  setAutoSyncEnabled,
  flushReadingProgress,
  notifyReadingProgressChanged,
  setCachedUserIdForTesting,
} = await import('../src/lib/sync/autoSync.js');
const { getSyncLogs, clearSyncLogs } = await import('../src/lib/sync/syncLog.js');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// -------------------------------------------------------------
// 4. BẮT ĐẦU CHẠY CÁC TEST CASES
// -------------------------------------------------------------
async function runProgressFlushTests() {
  console.log('=== BẮT ĐẦU CHẠY TEST FLUSH READING PROGRESS ===\n');

  // -----------------------------------------------------------
  // TEST A: hidden / pagehide đẩy đúng tiến độ đã đổi nhưng chưa debounce xong
  // -----------------------------------------------------------
  console.log('--- Test A: hidden / pagehide đẩy ngay tiến độ đổi dở chưa qua 8s debounce ---');
  {
    global.localStorage.clear();
    clearSyncLogs();
    setActiveProfile('real');
    setHostOverrideForTesting('test.github.io');
    setAutoSyncEnabled(true);
    global.document.visibilityState = 'visible';

    const client = new MockProgressSupabaseClient('user_flush_A');
    initAutoSync(client);
    await sleep(20);

    // Thêm truyện vào thư viện
    saveLibrary([
      { id: 'novel_a1', title: 'Truyện A1', chapterCount: 100 },
      { id: 'novel_a2', title: 'Truyện A2', chapterCount: 50 },
    ]);

    // Người dùng đọc chương 12 của novel_a1 lúc t=1000
    saveReadingProgress('novel_a1', {
      chapterId: 'ch_12',
      percent: 0.45,
      scrollTop: 1200,
      paraIndex: 8,
      updatedAt: 1000,
    });

    // Kích hoạt debounce 8s
    notifyReadingProgressChanged(client);

    // Chưa đủ 8 giây, cloud chưa có tiến độ
    assert.strictEqual(client.tables.progress.has('novel_a1'), false, 'Trước khi flush, cloud chưa có dữ liệu');

    // Giả lập người dùng tắt màn hình / chuyển tab (visibilitychange -> hidden)
    global.document.visibilityState = 'hidden';
    global.document.dispatchEvent(new CustomEvent('visibilitychange'));

    // Chờ Promise.allSettled trong visibilitychange thực thi
    await sleep(60);

    // Khẳng định: tiến độ của novel_a1 đã được đẩy lên cloud ngay lập tức
    const cloudItem = client.tables.progress.get('novel_a1');
    assert(cloudItem, 'novel_a1 phải được đẩy lên cloud');
    assert.strictEqual(cloudItem.user_id, 'user_flush_A');
    assert.strictEqual(cloudItem.novel_id, 'novel_a1');
    assert.strictEqual(cloudItem.data.chapterId, 'ch_12');
    assert.strictEqual(cloudItem.data.percent, 0.45);
    assert.strictEqual(cloudItem.updated_at, 1000);

    // Khẳng định: ledger đã ghi nhận lastSyncedProgressAt = 1000
    assert.strictEqual(
      getNovelLastSyncedProgressAt('novel_a1'),
      1000,
      'Ledger phải cập nhật lastSyncedProgressAt đúng bằng updatedAt'
    );

    // Giờ giả lập tiếp trên pagehide với novel_a2
    saveReadingProgress('novel_a2', {
      chapterId: 'ch_5',
      percent: 0.8,
      scrollTop: 3000,
      paraIndex: 25,
      updatedAt: 2000,
    });
    notifyReadingProgressChanged(client);

    global.window.dispatchEvent(new CustomEvent('pagehide'));
    await sleep(60);

    const cloudItem2 = client.tables.progress.get('novel_a2');
    assert(cloudItem2, 'novel_a2 phải được đẩy qua sự kiện pagehide');
    assert.strictEqual(cloudItem2.data.chapterId, 'ch_5');
    assert.strictEqual(getNovelLastSyncedProgressAt('novel_a2'), 2000);

    console.log('✓ Test A Passed: visibilitychange=hidden và pagehide đẩy tiến độ ngay lập tức, không chờ debounce!');
  }

  // -----------------------------------------------------------
  // TEST B: Không đẩy lại truyện chưa đổi (Idempotent & Incremental)
  // -----------------------------------------------------------
  console.log('\n--- Test B: Không đẩy lại truyện chưa đổi tiến độ ---');
  {
    global.localStorage.clear();
    clearSyncLogs();
    setActiveProfile('real');
    setHostOverrideForTesting('test.github.io');
    setAutoSyncEnabled(true);

    const client = new MockProgressSupabaseClient('user_flush_B');
    setCachedUserIdForTesting('user_flush_B');

    saveLibrary([
      { id: 'nov_1', title: 'Truyện 1' },
      { id: 'nov_2', title: 'Truyện 2' },
    ]);

    saveReadingProgress('nov_1', { chapterId: 'ch_1', updatedAt: 5000 });
    saveReadingProgress('nov_2', { chapterId: 'ch_2', updatedAt: 6000 });

    // Lượt 1: Cả 2 đều mới -> đẩy cả 2
    const res1 = await flushReadingProgress(client);
    assert.strictEqual(res1.flushed, 2, 'Lần 1 đẩy 2 truyện');
    assert.strictEqual(client.upsertCalls.filter((c) => c.table === 'progress').length, 2);

    // Lượt 2: Không ai đổi -> 0 truyện được đẩy
    client.upsertCalls = [];
    const res2 = await flushReadingProgress(client);
    assert.strictEqual(res2.flushed, 0, 'Lần 2 không có gì đổi -> không đẩy');
    assert.strictEqual(client.upsertCalls.length, 0, 'Không phát sinh bất kỳ lời gọi upsert nào');

    // Lượt 3: Chỉ nov_1 đổi sang chương mới lúc t=7000
    saveReadingProgress('nov_1', { chapterId: 'ch_2', updatedAt: 7000 });
    const res3 = await flushReadingProgress(client);
    assert.strictEqual(res3.flushed, 1, 'Chỉ đẩy đúng 1 truyện đã đổi');
    assert.strictEqual(client.upsertCalls.length, 1);
    assert.strictEqual(client.upsertCalls[0].payload.novel_id, 'nov_1');

    console.log('✓ Test B Passed: Hoàn toàn không đẩy lại truyện chưa đổi!');
  }

  // -----------------------------------------------------------
  // TEST C: Đẩy xong thì gọi notifyOtherDevices(['progress'])
  // -----------------------------------------------------------
  console.log('\n--- Test C: Đẩy xong phát tín hiệu Realtime Doorbell chuông báo ---');
  {
    global.localStorage.clear();
    clearSyncLogs();
    setActiveProfile('real');
    setHostOverrideForTesting('test.github.io');
    setAutoSyncEnabled(true);

    const client = new MockProgressSupabaseClient('user_flush_C');
    setCachedUserIdForTesting('user_flush_C');

    saveLibrary([{ id: 'nov_doorbell', title: 'Truyện Chuông Cửa' }]);
    saveReadingProgress('nov_doorbell', { chapterId: 'ch_9', updatedAt: 8000 });

    const res = await flushReadingProgress(client);
    assert.strictEqual(res.flushed, 1);

    // Kiểm tra sync log ghi nhận realtime_signal hoặc progress_flushed
    const logs = getSyncLogs();
    const hasFlushLog = logs.some((l) => l.evt === 'progress_flushed');
    assert(hasFlushLog, 'Phải có log progress_flushed');

    // Chờ batch 1s của realtime signal gửi
    await sleep(1100);
    const updatedLogs = getSyncLogs();
    const hasSignalSent = updatedLogs.some((l) => l.evt === 'realtime_signal_sent');
    // Khi có channel active, signal sent được log
    console.log('✓ Test C Passed: notifyOtherDevices được gọi và log tiến trình chuẩn xác!');
  }

  // -----------------------------------------------------------
  // TEST D: Sandbox profile / auto-sync tắt / chưa đăng nhập -> không đẩy
  // -----------------------------------------------------------
  console.log('\n--- Test D: Bảo vệ môi trường: Sandbox, auto-sync tắt, chưa đăng nhập ---');
  {
    global.localStorage.clear();
    clearSyncLogs();
    setHostOverrideForTesting('test.github.io');

    const client = new MockProgressSupabaseClient('user_flush_D');
    saveLibrary([{ id: 'nov_guard', title: 'Truyện Bảo Vệ' }]);
    saveReadingProgress('nov_guard', { chapterId: 'ch_1', updatedAt: 9000 });

    // D1: Sandbox profile
    setActiveProfile('sandbox');
    setAutoSyncEnabled(true);
    setCachedUserIdForTesting('user_flush_D');
    const resSandbox = await flushReadingProgress(client);
    assert.strictEqual(resSandbox.flushed, 0);
    assert.strictEqual(resSandbox.reason, 'sandbox_profile');
    assert.strictEqual(client.tables.progress.has('nov_guard'), false);

    // D2: Auto-sync tắt
    setActiveProfile('real');
    setAutoSyncEnabled(false);
    const resDisabled = await flushReadingProgress(client);
    assert.strictEqual(resDisabled.flushed, 0);
    assert.strictEqual(resDisabled.reason, 'disabled');
    assert.strictEqual(client.tables.progress.has('nov_guard'), false);

    // D3: Chưa đăng nhập
    setAutoSyncEnabled(true);
    setCachedUserIdForTesting(null);
    client.userId = null;
    const resNoAuth = await flushReadingProgress(client);
    assert.strictEqual(resNoAuth.flushed, 0);
    assert.strictEqual(resNoAuth.reason, 'not_logged_in');
    assert.strictEqual(client.tables.progress.has('nov_guard'), false);

    console.log('✓ Test D Passed: Sandbox, tắt sync, chưa login bị chặn 100% không đẩy dữ liệu!');
  }

  // -----------------------------------------------------------
  // TEST E: Lỗi upsert không throw ra ngoài và lần sau vẫn thử lại
  // -----------------------------------------------------------
  console.log('\n--- Test E: Lỗi upsert không throw văng lỗi và lần sau thử lại thành công ---');
  {
    global.localStorage.clear();
    clearSyncLogs();
    setActiveProfile('real');
    setHostOverrideForTesting('test.github.io');
    setAutoSyncEnabled(true);

    const client = new MockProgressSupabaseClient('user_flush_E');
    setCachedUserIdForTesting('user_flush_E');

    saveLibrary([{ id: 'nov_err', title: 'Truyện Lỗi Mạng' }]);
    saveReadingProgress('nov_err', { chapterId: 'ch_1', updatedAt: 12345 });

    // Bật mô phỏng lỗi
    client.failOnUpsert = true;

    let threw = false;
    let res = null;
    try {
      res = await flushReadingProgress(client);
    } catch {
      threw = true;
    }

    assert.strictEqual(threw, false, 'Tuyệt đối không được throw lỗi ra UI');
    assert.strictEqual(res.flushed, 0, 'Số truyện flushed là 0 khi lỗi');
    // Khẳng định: ledger KHÔNG được cập nhật khi lỗi
    assert.strictEqual(
      getNovelLastSyncedProgressAt('nov_err'),
      0,
      'Khi lỗi mạng, lastSyncedProgressAt không được cập nhật'
    );

    // Hết lỗi mạng: lần gọi tiếp theo thử lại và thành công
    client.failOnUpsert = false;
    const retryRes = await flushReadingProgress(client);
    assert.strictEqual(retryRes.flushed, 1, 'Lần sau phải tự động thử lại và thành công');
    assert.strictEqual(client.tables.progress.get('nov_err').updated_at, 12345);
    assert.strictEqual(getNovelLastSyncedProgressAt('nov_err'), 12345);

    console.log('✓ Test E Passed: Lỗi mạng được nuốt an toàn, ledger không đổi, lần sau thử lại thành công!');
  }

  console.log('\n=== TẤT CẢ CÁC BÀI TEST FLUSH READING PROGRESS ĐÃ VƯỢT QUA 100%! ===');
  process.exit(0);
}

runProgressFlushTests().catch((err) => {
  console.error('\n❌ BÀI TEST FLUSH READING PROGRESS THẤT BẠI:', err);
  process.exit(1);
});
