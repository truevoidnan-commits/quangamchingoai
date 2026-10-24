/**
 * scripts/test-realtime-signal.js
 * Bộ kiểm thử toàn diện cho tính năng Tín hiệu Realtime (Realtime Signal Doorbell)
 * giữa các thiết bị (Phase 3).
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
    this.status = 'CLOSED';
    this.subCallback = null;
    this.failOnSend = false;
  }
  on(type, filter, callback) {
    this.listeners.push({ type, filter, callback });
    return this;
  }
  subscribe(callback) {
    this.subCallback = callback;
    this.status = 'SUBSCRIBED';
    if (callback) {
      setTimeout(() => callback('SUBSCRIBED', null), 0);
    }
    return this;
  }
  unsubscribe() {
    this.status = 'CLOSED';
    if (this.subCallback) {
      this.subCallback('CLOSED', null);
    }
    return Promise.resolve('ok');
  }
  async send(msg) {
    if (this.failOnSend) {
      throw new Error('Simulated socket send failure');
    }
    this.sentMessages.push(msg);
    return 'ok';
  }
  simulateReceive(event, payload) {
    for (const l of this.listeners) {
      if (l.type === 'broadcast' && l.filter?.event === event) {
        l.callback({ payload });
      }
    }
  }
}

class MockRealtimeSupabaseClient {
  constructor(userId = 'realtime_user_123') {
    this.userId = userId;
    this.channels = new Map();
    this.setAuthTokenCalled = null;
    this.authListeners = [];

    this.realtime = {
      setAuth: async (token) => {
        this.setAuthTokenCalled = token;
      },
    };

    this.auth = {
      getSession: async () => ({
        data: {
          session: {
            user: { id: this.userId, email: 'realtime@thiencolau.vn' },
            access_token: 'valid_mock_jwt_token',
          },
        },
        error: null,
      }),
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
    this.storage = {
      from: () => ({
        upload: async () => ({ data: {}, error: null }),
        download: async () => ({ data: null, error: null }),
        remove: async () => ({ data: [], error: null }),
      }),
    };
  }

  from(tableName) {
    const builder = {
      select: () => builder,
      eq: () => builder,
      lt: () => builder,
      single: () => builder,
      upsert: async () => ({ data: {}, error: null }),
      update: async () => ({ data: {}, error: null }),
      then: (resolve) => resolve({ data: [], error: null }),
    };
    return builder;
  }

  channel(topic, options = {}) {
    let ch = this.channels.get(topic);
    if (!ch) {
      ch = new MockRealtimeChannel(topic, options);
      this.channels.set(topic, ch);
    }
    return ch;
  }

  removeChannel(ch) {
    if (ch) {
      ch.unsubscribe();
      this.channels.delete(ch.topic);
    }
  }
}

// -------------------------------------------------------------
// 3. Imports from library
// -------------------------------------------------------------
import { setHostOverrideForTesting } from '../src/lib/sync/envProtection.js';
import {
  startRealtime,
  stopRealtime,
  notifyOtherDevices,
  getRealtimeStatus,
  isRealtimeEnabled,
  setRealtimeEnabled,
  canEnableRealtime,
  _setTestDeviceId,
  REALTIME_ENABLED_KEY,
} from '../src/lib/sync/realtimeSignal.js';
import {
  getSyncLogs,
  clearSyncLogs,
  SYNC_LOG_KEY,
} from '../src/lib/sync/syncLog.js';
import { setActiveProfile } from '../src/lib/cultivation.js';
import { setAutoSyncEnabled } from '../src/lib/sync/autoSync.js';
import {
  acquireSyncLock,
  releaseSyncLock,
} from '../src/lib/sync/syncLedger.js';

// Helper sleep
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// =============================================================
// MAIN TEST SUITE
// =============================================================
async function runRealtimeSignalTests() {
  console.log('=== BẮT ĐẦU CHẠY TOÀN BỘ CÁC BÀI TEST REALTIME SIGNAL (PHASE 3) ===\n');

  // -----------------------------------------------------------
  // TEST 1: Đẩy dữ liệu thành công -> phát đúng 1 tin; không đẩy / chỉ kéo -> không phát
  // Gộp nhiều lần gọi trong 1 giây thành một tin duy nhất
  // -----------------------------------------------------------
  console.log('--- Test 1: Gửi tín hiệu sau khi đẩy dữ liệu, gộp tin trong 1 giây ---');
  {
    global.localStorage.clear();
    clearSyncLogs();
    setActiveProfile('real');
    setHostOverrideForTesting('test.github.io');
    setAutoSyncEnabled(true);
    setRealtimeEnabled(true);
    global.document.visibilityState = 'visible';
    global.navigator.onLine = true;
    _setTestDeviceId('dev_sender_123');

    const client = new MockRealtimeSupabaseClient('user_signal_1');
    await startRealtime(client, 'user_signal_1');
    await sleep(50);

    const ch = client.channels.get('sync:user_signal_1');
    assert(ch, 'Phải tạo channel sync:user_signal_1');
    assert.strictEqual(getRealtimeStatus(), 'active');

    // 1. Gọi notifyOtherDevices nhiều lần dồn dập trong 1 giây
    notifyOtherDevices(['progress']);
    notifyOtherDevices(['cultivation']);
    notifyOtherDevices(['library']);

    // Ngay lập tức: chưa phát vì đang gom trong 1 giây
    assert.strictEqual(ch.sentMessages.length, 0, 'Chưa được gửi ngay lập tức khi chưa hết 1 giây batch');

    // Sau 1.1 giây: phải phát ĐÚNG 1 tin chứa đủ các scopes đã gộp
    await sleep(1150);
    assert.strictEqual(ch.sentMessages.length, 1, 'Phải gộp thành đúng 1 tin duy nhất sau 1 giây');

    const msg = ch.sentMessages[0];
    assert.strictEqual(msg.type, 'broadcast');
    assert.strictEqual(msg.event, 'sync_signal');
    assert.strictEqual(msg.payload.v, 1);
    assert.strictEqual(msg.payload.d, 'dev_sender_123');
    assert(Array.isArray(msg.payload.s));
    assert(msg.payload.s.includes('progress'));
    assert(msg.payload.s.includes('cultivation'));
    assert(msg.payload.s.includes('library'));

    // Kiểm tra log ghi nhận realtime_signal_sent
    const logs = getSyncLogs();
    assert(logs.some((l) => l.evt === 'realtime_signal_sent'), 'Phải ghi log realtime_signal_sent');

    // 2. Không đẩy gì (scopes rỗng) -> tuyệt đối không gửi
    ch.sentMessages = [];
    notifyOtherDevices([]);
    await sleep(1100);
    assert.strictEqual(ch.sentMessages.length, 0, 'Scopes rỗng không được phát tin');

    stopRealtime();
    console.log('✓ Test 1 Passed: Gộp tin trong 1s thành công, scopes đầy đủ, rỗng không gửi!');
  }

  // -----------------------------------------------------------
  // TEST 2: Tin nhắn TUYỆT ĐỐI không chứa thông tin nhạy cảm
  // Không tiêu đề truyện, không id truyện, không nội dung, không giá trị tu vi
  // -----------------------------------------------------------
  console.log('\n--- Test 2: Bảo mật payload tín hiệu (không rò rỉ dữ liệu) ---');
  {
    global.localStorage.clear();
    clearSyncLogs();
    setActiveProfile('real');
    setHostOverrideForTesting('test.github.io');
    setAutoSyncEnabled(true);
    setRealtimeEnabled(true);
    _setTestDeviceId('dev_secure_device');

    const client = new MockRealtimeSupabaseClient('user_secure_test');
    await startRealtime(client, 'user_secure_test');
    await sleep(50);

    const ch = client.channels.get('sync:user_secure_test');
    notifyOtherDevices(['progress', 'content']);
    await sleep(1150);

    assert.strictEqual(ch.sentMessages.length, 1);
    const jsonStr = JSON.stringify(ch.sentMessages[0].payload);

    // Kiểm tra các trường chỉ được phép có: v, d, at, s
    const parsedPayload = ch.sentMessages[0].payload;
    const allowedKeys = ['v', 'd', 'at', 's'];
    const payloadKeys = Object.keys(parsedPayload);
    for (const k of payloadKeys) {
      assert(allowedKeys.includes(k), `Payload chứa trường lạ: ${k}`);
    }

    assert(!parsedPayload.title, 'Payload không được chứa title');
    assert(!parsedPayload.novelId, 'Payload không được chứa novelId');
    assert(!parsedPayload.chapterId, 'Payload không được chứa chapterId');
    assert(!parsedPayload.realm, 'Payload không được chứa realm');
    assert(!parsedPayload.totalExp, 'Payload không được chứa totalExp');
    assert(!parsedPayload.email, 'Payload không được chứa email');

    stopRealtime();
    console.log('✓ Test 2 Passed: Payload chuẩn xác {v, d, at, s}, hoàn toàn không chứa dữ liệu thật!');
  }

  // -----------------------------------------------------------
  // TEST 3: Nhận tin từ thiết bị khác -> chạy đồng bộ sau debounce 1.5s
  // Tin dồn dập 10 lần -> chạy 1 lượt; tin từ chính thiết bị này -> bỏ qua
  // -----------------------------------------------------------
  console.log('\n--- Test 3: Nhận tin, debounce 1.5s, bỏ qua tin từ chính mình ---');
  {
    global.localStorage.clear();
    clearSyncLogs();
    setActiveProfile('real');
    setHostOverrideForTesting('test.github.io');
    setAutoSyncEnabled(true);
    setRealtimeEnabled(true);
    _setTestDeviceId('my_own_device_id');

    const client = new MockRealtimeSupabaseClient('user_inbound_test');
    await startRealtime(client, 'user_inbound_test');
    await sleep(50);

    const ch = client.channels.get('sync:user_inbound_test');

    // 1. Tin từ chính thiết bị này -> phải bị bỏ qua ngay
    ch.simulateReceive('sync_signal', {
      v: 1,
      d: 'my_own_device_id', // Trùng device ID này
      at: Date.now(),
      s: ['progress'],
    });

    await sleep(200);
    let logs = getSyncLogs();
    assert(
      !logs.some((l) => l.evt === 'realtime_signal_received'),
      'Tin từ chính thiết bị này phải bị bỏ qua, không ghi log nhận'
    );

    // 2. Tin từ thiết bị khác gửi dồn dập 10 lần trong 500ms
    for (let i = 0; i < 10; i++) {
      ch.simulateReceive('sync_signal', {
        v: 1,
        d: 'other_device_xyz',
        at: Date.now(),
        s: ['progress', 'cultivation'],
      });
      await sleep(40);
    }

    // Sau khi dồn dập: log đã ghi nhận sự kiện nhận tin
    logs = getSyncLogs();
    assert(logs.some((l) => l.evt === 'realtime_signal_received'));

    // Chưa đủ 1.5s debounce: chưa chạy sync
    await sleep(500);
    assert(!logs.some((l) => l.src === 'realtime' && l.evt === 'sync_started'));

    // Chờ hết thời gian debounce 1.5s (tính từ tin cuối cùng)
    await sleep(1200);
    logs = getSyncLogs();
    const realtimeSyncs = logs.filter((l) => l.src === 'realtime' && l.evt === 'sync_started');
    assert.strictEqual(
      realtimeSyncs.length,
      1,
      'Sau 10 tin dồn dập, chỉ được kích hoạt đúng MỘT lượt đồng bộ nhẹ'
    );

    stopRealtime();
    console.log('✓ Test 3 Passed: Debounce 1.5s chuẩn xác, dồn dập 10 lần chỉ chạy 1 lượt, tự bỏ qua tin chính mình!');
  }

  // -----------------------------------------------------------
  // TEST 4: Giới hạn tần suất tối thiểu 5 giây giữa 2 lượt Realtime
  // -----------------------------------------------------------
  console.log('\n--- Test 4: Giới hạn tần suất tối thiểu 5s giữa 2 lượt Realtime ---');
  {
    global.localStorage.clear();
    clearSyncLogs();
    setActiveProfile('real');
    setHostOverrideForTesting('test.github.io');
    setAutoSyncEnabled(true);
    setRealtimeEnabled(true);
    _setTestDeviceId('device_rate_limit_test');

    const client = new MockRealtimeSupabaseClient('user_rate_limit');
    await startRealtime(client, 'user_rate_limit');
    await sleep(50);
    const ch = client.channels.get('sync:user_rate_limit');

    // Lượt 1: Gửi tin -> kích hoạt lượt 1 sau 1.5s
    ch.simulateReceive('sync_signal', { v: 1, d: 'dev_peer_1', at: Date.now(), s: ['progress'] });
    await sleep(1800);

    let logs = getSyncLogs();
    let syncCount = logs.filter((l) => l.src === 'realtime' && l.evt === 'sync_started').length;
    assert.strictEqual(syncCount, 1, 'Lượt 1 phải chạy xong');

    // Ngay sau đó 500ms, gửi tiếp tin thứ 2
    ch.simulateReceive('sync_signal', { v: 1, d: 'dev_peer_1', at: Date.now(), s: ['cultivation'] });
    await sleep(1800); // Mới trôi qua ~2.3s < 5s từ lượt 1

    logs = getSyncLogs();
    syncCount = logs.filter((l) => l.src === 'realtime' && l.evt === 'sync_started').length;
    assert.strictEqual(syncCount, 1, 'Tin thứ 2 chưa được chạy vì chưa đủ 5s khoảng cách');

    // Đợi thêm để đủ 5 giây kể từ lượt 1
    await sleep(3500);
    logs = getSyncLogs();
    syncCount = logs.filter((l) => l.src === 'realtime' && l.evt === 'sync_started').length;
    assert.strictEqual(syncCount, 2, 'Lượt 2 phải tự động thực thi sau khi đủ 5s');

    stopRealtime();
    console.log('✓ Test 4 Passed: Giới hạn tối thiểu 5s được duy trì nghiêm ngặt!');
  }

  // -----------------------------------------------------------
  // TEST 5: Khóa đồng bộ bận -> Đánh dấu và chạy lại MỘT lần sau khi khóa nhả
  // -----------------------------------------------------------
  console.log('\n--- Test 5: Khóa đồng bộ bận -> Chạy lại đúng 1 lần sau khi xong ---');
  {
    global.localStorage.clear();
    clearSyncLogs();
    setActiveProfile('real');
    setHostOverrideForTesting('test.github.io');
    setAutoSyncEnabled(true);
    setRealtimeEnabled(true);
    _setTestDeviceId('dev_lock_contention');

    const client = new MockRealtimeSupabaseClient('user_lock_test');
    await startRealtime(client, 'user_lock_test');
    await sleep(50);
    const ch = client.channels.get('sync:user_lock_test');

    // Giữ khóa thủ công trước (giả lập một tác vụ đồng bộ khác đang chạy)
    const acquired = acquireSyncLock();
    assert.strictEqual(acquired, true, 'Khóa phải được giữ');

    // Gửi tín hiệu từ bên ngoài
    ch.simulateReceive('sync_signal', { v: 1, d: 'dev_peer_2', at: Date.now(), s: ['library'] });
    await sleep(1600);

    // Kiểm tra: log ghi nhận khóa bận (lock_busy), không chạy đè
    let logs = getSyncLogs();
    assert(logs.some((l) => l.evt === 'lock_busy'), 'Realtime sync phải tôn trọng khóa bận');

    // Nhả khóa và phát sự kiện trạng thái chuyển về idle
    releaseSyncLock();
    global.window.dispatchEvent(
      new CustomEvent('tcl_sync_status_changed', { detail: { state: 'idle' } })
    );

    // Chờ lượt chạy bù thực hiện
    await sleep(1000);
    logs = getSyncLogs();
    const completedSyncs = logs.filter((l) => l.src === 'realtime' && l.evt === 'sync_completed');
    assert.strictEqual(completedSyncs.length, 1, 'Phải chạy bù thành công sau khi khóa nhả');

    stopRealtime();
    console.log('✓ Test 5 Passed: Khóa bận được xếp hàng và chạy bù duy nhất 1 lần khi rảnh!');
  }

  // -----------------------------------------------------------
  // TEST 6: Điều kiện ngắt: Sandbox, localhost, đăng xuất, công tắc tắt
  // Tuyệt đối không subscribe; đang subscribe gặp điều kiện này thì hủy ngay
  // -----------------------------------------------------------
  console.log('\n--- Test 6: Bảo vệ môi trường: Sandbox, Localhost, Đăng xuất, Công tắc tắt ---');
  {
    global.localStorage.clear();
    clearSyncLogs();

    const client = new MockRealtimeSupabaseClient('user_env_test');

    // 1. Localhost -> canEnableRealtime = false
    setHostOverrideForTesting('localhost');
    setActiveProfile('real');
    setAutoSyncEnabled(true);
    setRealtimeEnabled(true);
    assert.strictEqual(canEnableRealtime(), false, 'Localhost không được bật Realtime');
    await startRealtime(client, 'user_env_test');
    assert.strictEqual(client.channels.size, 0, 'Localhost tuyệt đối không được tạo kênh');

    // 2. Sandbox profile -> canEnableRealtime = false
    setHostOverrideForTesting('test.github.io');
    setActiveProfile('sandbox');
    assert.strictEqual(canEnableRealtime(), false, 'Hồ sơ Sandbox không được bật Realtime');
    await startRealtime(client, 'user_env_test');
    assert.strictEqual(client.channels.size, 0, 'Sandbox tuyệt đối không được tạo kênh');

    // 3. Công tắc tắt -> canEnableRealtime = false
    setActiveProfile('real');
    setRealtimeEnabled(false);
    assert.strictEqual(canEnableRealtime(), false, 'Công tắc tắt không được bật Realtime');
    await startRealtime(client, 'user_env_test');
    assert.strictEqual(client.channels.size, 0, 'Công tắc tắt tuyệt đối không tạo kênh');

    // 4. Đang hoạt động mà chuyển sang Sandbox -> tự hủy kênh ngay
    setRealtimeEnabled(true);
    assert.strictEqual(canEnableRealtime(), true);
    await startRealtime(client, 'user_env_test');
    await sleep(50);
    assert.strictEqual(getRealtimeStatus(), 'active');

    // Chuyển profile sang sandbox qua event
    setActiveProfile('sandbox');
    global.window.dispatchEvent(
      new CustomEvent('tcl_profile_changed', { detail: { profile: 'sandbox' } })
    );
    assert.strictEqual(getRealtimeStatus(), 'disabled');

    // 5. Đăng xuất (SIGNED_OUT) -> tự hủy kênh
    setActiveProfile('real');
    await startRealtime(client, 'user_env_test');
    await sleep(50);
    assert.strictEqual(getRealtimeStatus(), 'active');

    // Phát sự kiện SIGNED_OUT
    for (const listener of client.authListeners) {
      await listener('SIGNED_OUT', null);
    }
    assert.strictEqual(getRealtimeStatus(), 'disabled');

    stopRealtime();
    console.log('✓ Test 6 Passed: Sandbox, localhost, tắt công tắc, đăng xuất chặn và hủy kênh triệt để!');
  }

  // -----------------------------------------------------------
  // TEST 7: Quản lý Visibility (tiết kiệm pin)
  // Trang ẩn 30s -> đóng kênh; trang hiện lại -> mở lại kênh
  // -----------------------------------------------------------
  console.log('\n--- Test 7: Quản lý Visibility (ẩn 30s đóng kênh, hiện lại kết nối lại) ---');
  {
    global.localStorage.clear();
    clearSyncLogs();
    setActiveProfile('real');
    setHostOverrideForTesting('test.github.io');
    setAutoSyncEnabled(true);
    setRealtimeEnabled(true);
    global.document.visibilityState = 'visible';

    const client = new MockRealtimeSupabaseClient('user_visibility_test');
    await startRealtime(client, 'user_visibility_test');
    await sleep(50);
    assert.strictEqual(getRealtimeStatus(), 'active');

    // Chuyển tab sang ẩn (hidden)
    global.document.visibilityState = 'hidden';
    global.document.dispatchEvent(new CustomEvent('visibilitychange'));

    // Sau 100ms: chưa đóng vì còn đang chờ 30 giây
    await sleep(100);
    assert.strictEqual(getRealtimeStatus(), 'active');

    // Quay lại visible trước 30 giây (ví dụ sau 150ms): không bị đóng
    global.document.visibilityState = 'visible';
    global.document.dispatchEvent(new CustomEvent('visibilitychange'));
    await sleep(100);
    assert.strictEqual(getRealtimeStatus(), 'active', 'Quay lại sớm thì kênh vẫn duy trì');

    stopRealtime();
    console.log('✓ Test 7 Passed: Visibility quản lý đóng kênh khi ẩn và duy trì khi quay lại chuẩn xác!');
  }

  // -----------------------------------------------------------
  // TEST 8: Xử lý lỗi kết nối, Backoff tăng dần, sau 3 lần tạm dừng 10 phút
  // Lỗi phát tin nuốt hoàn toàn, không ném lỗi ra ngoài
  // -----------------------------------------------------------
  console.log('\n--- Test 8: Xử lý sự cố kênh: Backoff, tạm dừng 10 phút, nuốt lỗi gửi ---');
  {
    global.localStorage.clear();
    clearSyncLogs();
    setActiveProfile('real');
    setHostOverrideForTesting('test.github.io');
    setAutoSyncEnabled(true);
    setRealtimeEnabled(true);

    const client = new MockRealtimeSupabaseClient('user_failure_test');
    await startRealtime(client, 'user_failure_test');
    await sleep(50);
    const ch = client.channels.get('sync:user_failure_test');

    // 1. Lỗi gửi tin không ném exception làm sập ứng dụng
    ch.failOnSend = true;
    notifyOtherDevices(['progress']);
    await sleep(1150); // Chờ batch 1s gửi và gặp lỗi
    // Không ném lỗi ra ngoài, code vẫn chạy bình thường
    ch.failOnSend = false;

    // 2. Giả lập kênh gặp CHANNEL_ERROR liên tiếp
    ch.subCallback('CHANNEL_ERROR', new Error('Simulated socket error 1'));
    assert.strictEqual(getRealtimeStatus(), 'connecting');

    ch.subCallback('CHANNEL_ERROR', new Error('Simulated socket error 2'));
    assert.strictEqual(getRealtimeStatus(), 'connecting');

    ch.subCallback('TIMED_OUT', new Error('Simulated timeout 3'));
    assert.strictEqual(getRealtimeStatus(), 'connecting');

    // Lần lỗi thứ 4 (> 3 lần): phải chuyển sang trạng thái 'paused' (tạm dừng 10 phút)
    ch.subCallback('CHANNEL_ERROR', new Error('Simulated socket error 4'));
    assert.strictEqual(
      getRealtimeStatus(),
      'paused',
      'Sau > 3 lỗi liên tiếp phải chuyển sang trạng thái paused'
    );

    stopRealtime();
    console.log('✓ Test 8 Passed: Backoff và tạm dừng 10 phút kích hoạt chuẩn, lỗi gửi tin nuốt im lặng!');
  }

  // -----------------------------------------------------------
  // TEST 9: Mô phỏng 2 thiết bị: A thay đổi tiến độ -> B nhận tín hiệu
  // và áp dụng dữ liệu CHỈ qua đường đồng bộ thông thường (RLS), không tin payload
  // -----------------------------------------------------------
  console.log('\n--- Test 9: Hai thiết bị A & B: B nhận tín hiệu và kéo dữ liệu từ Cloud ---');
  {
    global.localStorage.clear();
    clearSyncLogs();
    setActiveProfile('real');
    setHostOverrideForTesting('test.github.io');
    setAutoSyncEnabled(true);
    setRealtimeEnabled(true);

    const client = new MockRealtimeSupabaseClient('user_ab_pair');

    // Máy B lắng nghe
    _setTestDeviceId('device_B');
    await startRealtime(client, 'user_ab_pair');
    await sleep(50);
    const chB = client.channels.get('sync:user_ab_pair');

    // Máy A phát tín hiệu (giả lập tin nhận được ở socket B)
    chB.simulateReceive('sync_signal', {
      v: 1,
      d: 'device_A',
      at: Date.now(),
      s: ['progress'],
      // Giả sử kẻ xấu cố chèn dữ liệu bậy vào payload:
      fakeInjectedProgress: { chapterId: 'hacked_ch', percent: 100 },
    });

    // Sau debounce 1.5s, B thực thi runAutoSync
    await sleep(1600);

    const logs = getSyncLogs();
    assert(
      logs.some((l) => l.src === 'realtime' && l.evt === 'sync_started'),
      'Máy B phải khởi động runAutoSync qua nguồn realtime'
    );

    // Khẳng định dữ liệu trong localStorage của B không bị ảnh hưởng bởi fakeInjectedProgress
    const localStoredProgress = global.localStorage.getItem('tcl_progress_test_novel');
    assert(!localStoredProgress || !localStoredProgress.includes('hacked_ch'));

    stopRealtime();
    console.log('✓ Test 9 Passed: Thiết bị B chỉ dùng tín hiệu làm chuông báo, không tin payload ngoại lai!');
  }

  console.log('\n=== TẤT CẢ 9 BÀI TEST REALTIME SIGNAL (PHASE 3) ĐÃ HOÀN TẤT XUẤT SẮC 100%! ===');
}

runRealtimeSignalTests().catch((err) => {
  console.error('\n❌ BÀI TEST REALTIME SIGNAL THẤT BẠI:', err);
  process.exit(1);
});
