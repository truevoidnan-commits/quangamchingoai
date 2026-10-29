/**
 * scripts/test-realtime-lifecycle.js
 * Kiểm thử vòng đời kết nối Supabase Realtime Signal:
 * (a) Khởi động không có session, sau đó phát sự kiện SIGNED_IN -> startRealtime được gọi đúng 1 lần;
 * (b) SIGNED_OUT -> stopRealtime, trạng thái disabled đúng;
 * (c) setAutoSyncEnabled(false) khi đang active -> stopRealtime, trạng thái 'disabled'; setAutoSyncEnabled(true) -> start lại;
 * (d) Khi realtime bị tắt riêng (REALTIME_ENABLED_KEY=false) thì bật autoSync không làm Realtime chạy;
 * (e) Sandbox profile không bao giờ start;
 * (f) Không start trùng khi SIGNED_IN lặp / TOKEN_REFRESHED nhiều lần.
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

globalThis.localStorage = new LocalStorageMock();

// Mock Navigator
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    configurable: true,
    writable: true,
  });
} catch {}

// Mock Window & CustomEvent & Document
const eventListeners = {};
globalThis.window = {
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
globalThis.document = {
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

globalThis.CustomEvent = class CustomEvent {
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
    this.sentMessages.push(msg);
    return 'ok';
  }
}

// -------------------------------------------------------------
// 3. Import dynamic modules
// -------------------------------------------------------------
const { setHostOverrideForTesting } = await import('../src/lib/sync/envProtection.js');
const {
  initAutoSync,
  setAutoSyncEnabled,
  isAutoSyncEnabled,
  _resetAutoSyncForTesting,
} = await import('../src/lib/sync/autoSync.js');
const {
  startRealtime,
  stopRealtime,
  reconcileRealtime,
  getRealtimeStatus,
  isRealtimeEnabled,
  setRealtimeEnabled,
  REALTIME_ENABLED_KEY,
  _resetRealtimeForTesting,
} = await import('../src/lib/sync/realtimeSignal.js');

console.log('=== BẮT ĐẦU KIỂM THỬ VÒNG ĐỜI REALTIME (scripts/test-realtime-lifecycle.js) ===\n');

setHostOverrideForTesting('test.github.io');

function createMockClient(initialSession = null) {
  let session = initialSession;
  const authListeners = [];
  const channelsCreated = [];

  return {
    auth: {
      getSession: async () => ({
        data: { session },
        error: null,
      }),
      onAuthStateChange: (callback) => {
        authListeners.push(callback);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                const idx = authListeners.indexOf(callback);
                if (idx !== -1) authListeners.splice(idx, 1);
              },
            },
          },
        };
      },
      _emitAuthChange: (event, newSession) => {
        session = newSession;
        authListeners.forEach((cb) => {
          try {
            cb(event, newSession);
          } catch (e) {
            console.error('Lỗi listener auth:', e);
          }
        });
      },
    },
    realtime: {
      setAuth: async (token) => {},
    },
    channel: (topic, options) => {
      const ch = new MockRealtimeChannel(topic, options);
      channelsCreated.push(ch);
      return ch;
    },
    removeChannel: (channel) => {
      channel.unsubscribe();
    },
    _channelsCreated: channelsCreated,
  };
}

let passedTests = 0;
const totalTests = 6;

// ---------------------------------------------------------------------------
// Test (a): Khởi động không có session, sau đó phát sự kiện SIGNED_IN -> startRealtime gọi đúng 1 lần
// ---------------------------------------------------------------------------
try {
  console.log('--- Test (a): Khởi động không có session, SIGNED_IN giữa phiên bật Realtime đúng 1 lần ---');
  _resetRealtimeForTesting();
  _resetAutoSyncForTesting();
  localStorage.clear();
  localStorage.setItem('tcl_active_profile', 'real');

  const mockClient = createMockClient(null); // Không có session ban đầu

  initAutoSync(mockClient);

  // Đợi một chút cho promise getSession() xử lý
  await new Promise((r) => setTimeout(r, 50));

  assert.strictEqual(
    getRealtimeStatus(),
    'disabled',
    'Khi chưa có session đăng nhập, Realtime phải ở trạng thái disabled'
  );
  assert.strictEqual(
    mockClient._channelsCreated.length,
    0,
    'Chưa đăng nhập thì tuyệt đối không tạo kênh Realtime'
  );

  // Người dùng đăng nhập giữa phiên
  const userSession = {
    user: { id: 'user_alice_999' },
    access_token: 'fake_jwt_token_alice',
  };
  mockClient.auth._emitAuthChange('SIGNED_IN', userSession);

  // Chờ channel.subscribe() callback chạy (setTimeout 0)
  await new Promise((r) => setTimeout(r, 80));

  assert.strictEqual(
    mockClient._channelsCreated.length,
    1,
    'Sau SIGNED_IN, kênh Realtime phải được tạo đúng 1 lần duy nhất'
  );
  assert.strictEqual(
    mockClient._channelsCreated[0].topic,
    'sync:user_alice_999',
    'Topic phải khớp với user ID của người dùng đăng nhập'
  );
  assert.strictEqual(
    getRealtimeStatus(),
    'active',
    'Trạng thái Realtime phải chuyển sang active'
  );

  console.log('✓ Test (a) Passed: Đăng nhập giữa phiên khởi động Realtime thành công và đúng 1 lần!\n');
  passedTests++;
} catch (err) {
  console.error('❌ Test (a) Thất bại:', err);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Test (b): SIGNED_OUT -> stopRealtime, trạng thái disabled đúng
// ---------------------------------------------------------------------------
try {
  console.log('--- Test (b): SIGNED_OUT -> stopRealtime, chuyển về disabled ---');
  _resetRealtimeForTesting();
  _resetAutoSyncForTesting();
  localStorage.clear();
  localStorage.setItem('tcl_active_profile', 'real');

  const userSession = {
    user: { id: 'user_bob' },
    access_token: 'jwt_bob',
  };
  const mockClient = createMockClient(userSession);

  initAutoSync(mockClient);
  await new Promise((r) => setTimeout(r, 80));

  assert.strictEqual(getRealtimeStatus(), 'active');
  assert.strictEqual(mockClient._channelsCreated.length, 1);

  // Phát sự kiện đăng xuất SIGNED_OUT
  mockClient.auth._emitAuthChange('SIGNED_OUT', null);
  await new Promise((r) => setTimeout(r, 50));

  assert.strictEqual(
    getRealtimeStatus(),
    'disabled',
    'Sau khi đăng xuất, trạng thái Realtime phải là disabled'
  );
  assert.strictEqual(
    mockClient._channelsCreated[0].status,
    'CLOSED',
    'Kênh active trước đó phải được unsubscribe/closed'
  );

  console.log('✓ Test (b) Passed: SIGNED_OUT dừng Realtime chuẩn xác và đóng kết nối!\n');
  passedTests++;
} catch (err) {
  console.error('❌ Test (b) Thất bại:', err);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Test (c): setAutoSyncEnabled(false) -> stopRealtime; setAutoSyncEnabled(true) -> start lại
// ---------------------------------------------------------------------------
try {
  console.log('--- Test (c): Công tắc Auto-Sync điều khiển dừng và bật lại Realtime tức thì ---');
  _resetRealtimeForTesting();
  _resetAutoSyncForTesting();
  localStorage.clear();
  localStorage.setItem('tcl_active_profile', 'real');

  const userSession = {
    user: { id: 'user_carol' },
    access_token: 'jwt_carol',
  };
  const mockClient = createMockClient(userSession);

  initAutoSync(mockClient);
  await new Promise((r) => setTimeout(r, 80));
  assert.strictEqual(getRealtimeStatus(), 'active');

  // 1. Tắt công tắc Auto-Sync
  console.log('  -> Gọi setAutoSyncEnabled(false)...');
  const disabledOk = setAutoSyncEnabled(false);
  assert.strictEqual(disabledOk, true);
  await new Promise((r) => setTimeout(r, 50));

  assert.strictEqual(
    isAutoSyncEnabled(),
    false,
    'isAutoSyncEnabled phải trả về false'
  );
  assert.strictEqual(
    getRealtimeStatus(),
    'disabled',
    'Khi tắt Auto-Sync, Realtime phải lập tức bị disabled'
  );

  // 2. Bật lại công tắc Auto-Sync
  console.log('  -> Gọi setAutoSyncEnabled(true)...');
  const enabledOk = setAutoSyncEnabled(true);
  assert.strictEqual(enabledOk, true);
  await new Promise((r) => setTimeout(r, 80));

  assert.strictEqual(
    isAutoSyncEnabled(),
    true,
    'isAutoSyncEnabled phải trả về true'
  );
  assert.strictEqual(
    getRealtimeStatus(),
    'active',
    'Khi bật lại Auto-Sync, Realtime phải tự động kết nối lại thành active'
  );

  console.log('✓ Test (c) Passed: Công tắc Auto-Sync điều khiển Realtime bật/tắt chuẩn xác!\n');
  passedTests++;
} catch (err) {
  console.error('❌ Test (c) Thất bại:', err);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Test (d): Khi realtime bị tắt riêng (REALTIME_ENABLED_KEY=false) thì bật autoSync không làm Realtime chạy
// ---------------------------------------------------------------------------
try {
  console.log('--- Test (d): Realtime bị tắt riêng thì bật autoSync KHÔNG làm Realtime chạy ---');
  _resetRealtimeForTesting();
  _resetAutoSyncForTesting();
  localStorage.clear();
  localStorage.setItem('tcl_active_profile', 'real');

  const userSession = {
    user: { id: 'user_david' },
    access_token: 'jwt_david',
  };
  const mockClient = createMockClient(userSession);

  initAutoSync(mockClient);
  await new Promise((r) => setTimeout(r, 80));
  assert.strictEqual(getRealtimeStatus(), 'active');

  // Tắt riêng Realtime
  setRealtimeEnabled(false);
  assert.strictEqual(isRealtimeEnabled(), false);
  assert.strictEqual(getRealtimeStatus(), 'disabled');

  const beforeChannels = mockClient._channelsCreated.length;

  // Giờ bật/tắt autoSync
  setAutoSyncEnabled(false);
  setAutoSyncEnabled(true);
  await new Promise((r) => setTimeout(r, 80));

  assert.strictEqual(
    getRealtimeStatus(),
    'disabled',
    'Dù bật autoSync, nhưng do realtime bị tắt riêng nên Realtime vẫn phải disabled'
  );
  assert.strictEqual(
    mockClient._channelsCreated.length,
    beforeChannels,
    'Không được tạo thêm kênh socket mới khi realtime bị tắt riêng'
  );

  // Bật lại Realtime riêng
  setRealtimeEnabled(true);
  await new Promise((r) => setTimeout(r, 80));
  assert.strictEqual(getRealtimeStatus(), 'active');

  console.log('✓ Test (d) Passed: Tôn trọng công tắc riêng Realtime, không bị ghi đè bởi Auto-Sync!\n');
  passedTests++;
} catch (err) {
  console.error('❌ Test (d) Thất bại:', err);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Test (e): Sandbox profile không bao giờ start
// ---------------------------------------------------------------------------
try {
  console.log('--- Test (e): Sandbox profile tuyệt đối không bao giờ khởi động Realtime ---');
  _resetRealtimeForTesting();
  _resetAutoSyncForTesting();
  localStorage.clear();

  // Đặt profile sandbox trước khi chạy
  localStorage.setItem('tcl_active_profile', 'sandbox');

  const userSession = {
    user: { id: 'user_sandboxer' },
    access_token: 'jwt_sandbox',
  };
  const mockClient = createMockClient(userSession);

  initAutoSync(mockClient);
  await new Promise((r) => setTimeout(r, 80));

  assert.strictEqual(
    getRealtimeStatus(),
    'disabled',
    'Sandbox profile phải luôn disabled'
  );
  assert.strictEqual(
    mockClient._channelsCreated.length,
    0,
    'Tuyệt đối không kết nối channel trong sandbox profile'
  );

  // Thử gọi startRealtime thủ công cũng phải bị chặn
  await startRealtime(mockClient, 'user_sandboxer');
  assert.strictEqual(getRealtimeStatus(), 'disabled');

  // Thử bật Auto-Sync trong sandbox cũng không được kích hoạt
  setAutoSyncEnabled(true);
  assert.strictEqual(getRealtimeStatus(), 'disabled');

  // Đổi sang real profile
  localStorage.setItem('tcl_active_profile', 'real');
  window.dispatchEvent(new CustomEvent('tcl_profile_changed', { detail: { profile: 'real' } }));
  await new Promise((r) => setTimeout(r, 80));

  assert.strictEqual(
    getRealtimeStatus(),
    'active',
    'Khi chuyển sang real profile thì Realtime tự động kết nối lại'
  );

  console.log('✓ Test (e) Passed: Sandbox profile chặn Realtime 100% an toàn!\n');
  passedTests++;
} catch (err) {
  console.error('❌ Test (e) Thất bại:', err);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Test (f): Không start trùng khi SIGNED_IN lặp hoặc TOKEN_REFRESHED nhiều lần
// ---------------------------------------------------------------------------
try {
  console.log('--- Test (f): Không tạo trùng kênh khi SIGNED_IN lặp hoặc TOKEN_REFRESHED nhiều lần ---');
  _resetRealtimeForTesting();
  _resetAutoSyncForTesting();
  localStorage.clear();
  localStorage.setItem('tcl_active_profile', 'real');

  const userSession = {
    user: { id: 'user_frank' },
    access_token: 'jwt_frank_1',
  };
  const mockClient = createMockClient(userSession);

  initAutoSync(mockClient);
  await new Promise((r) => setTimeout(r, 80));

  assert.strictEqual(getRealtimeStatus(), 'active');
  const initialChannelsCount = mockClient._channelsCreated.length;
  assert.strictEqual(initialChannelsCount, 1);

  // Phát nhiều sự kiện TOKEN_REFRESHED
  for (let i = 2; i <= 5; i++) {
    mockClient.auth._emitAuthChange('TOKEN_REFRESHED', {
      user: { id: 'user_frank' },
      access_token: `jwt_frank_${i}`,
    });
  }

  // Phát lại sự kiện SIGNED_IN với cùng user ID
  mockClient.auth._emitAuthChange('SIGNED_IN', {
    user: { id: 'user_frank' },
    access_token: 'jwt_frank_reauth',
  });

  await new Promise((r) => setTimeout(r, 80));

  assert.strictEqual(
    mockClient._channelsCreated.length,
    initialChannelsCount,
    'Số lượng kênh không được tăng thêm khi refresh token hoặc SIGNED_IN lặp cùng user'
  );
  assert.strictEqual(
    getRealtimeStatus(),
    'active',
    'Trạng thái vẫn giữ active liên tục'
  );

  console.log('✓ Test (f) Passed: Tính bất biến (idempotency) hoàn hảo, không trùng lặp kênh!\n');
  passedTests++;
} catch (err) {
  console.error('❌ Test (f) Thất bại:', err);
  process.exit(1);
}

console.log('========================================');
console.log(`HOÀN THÀNH TẤT CẢ ${passedTests}/${totalTests} BÀI KIỂM THỬ VÒNG ĐỜI REALTIME THÀNH CÔNG!`);
console.log('========================================\n');
process.exit(0);
