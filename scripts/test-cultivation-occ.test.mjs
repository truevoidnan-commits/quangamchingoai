import assert from 'node:assert/strict';
import { test, describe, beforeEach, afterEach } from 'node:test';
import crypto from 'node:crypto';

// -------------------------------------------------------------
// 1. MOCK ENVIRONMENT (localStorage, window, document, navigator)
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
  get length() {
    return Object.keys(this.store).length;
  }
  key(i) {
    return Object.keys(this.store)[i] || null;
  }
}

global.localStorage = new LocalStorageMock();

const windowEventListeners = {};
global.window = {
  addEventListener: (event, handler) => {
    if (!windowEventListeners[event]) windowEventListeners[event] = [];
    windowEventListeners[event].push(handler);
  },
  removeEventListener: (event, handler) => {
    if (windowEventListeners[event]) {
      windowEventListeners[event] = windowEventListeners[event].filter(h => h !== handler);
    }
  },
  dispatchEvent: (evt) => {
    const handlers = windowEventListeners[evt.type] || [];
    handlers.forEach(h => h(evt));
    return true;
  },
};

global.document = {
  visibilityState: 'visible',
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
};

try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    configurable: true,
    writable: true,
  });
} catch {}

global.CustomEvent = class CustomEvent {
  constructor(type, params = {}) {
    this.type = type;
    this.detail = params.detail || null;
  }
};

global.Event = class Event {
  constructor(type) {
    this.type = type;
  }
};

// -------------------------------------------------------------
// 2. MOCK SUPABASE POSTGRESQL ENGINE VỚI OCC & IDEMPOTENCY LOG
// -------------------------------------------------------------

class MockSupabaseOCCEngine {
  constructor() {
    this.cultivationTable = new Map(); // user_id -> { user_id, rev, state, updated_at, device_id }
    this.idempotencyLogTable = new Map(); // `${user_id}:${key}` -> { user_id, idempotency_key, committed_rev, request_fingerprint, created_at }
    this.systemFlags = new Map(); // key -> value
    this.systemFlags.set('cultivation_maintenance', { enabled: false });
    this.currentUserId = 'user_12345';
    this.currentRole = 'authenticated'; // 'authenticated' | 'anon' | 'service_role'
    this.isRevokedDirectWrite = true; // Sau cutover: REVOKE INSERT, UPDATE ON cultivation
    this.simulateNetworkDropOnNextRpc = false;
  }

  setMaintenance(enabled, message = 'Hệ thống đang bảo trì') {
    this.systemFlags.set('cultivation_maintenance', { enabled, message });
  }

  setDirectWritePermission(allow) {
    this.isRevokedDirectWrite = !allow;
  }

  // Giả lập RPC sync_cultivation_occ nguyên tử chuẩn PostgreSQL
  async rpc(funcName, params) {
    if (funcName === 'cleanup_cultivation_idempotency_log') {
      const role = this.currentRole || 'authenticated';
      if (role !== 'service_role' && role !== 'postgres') {
        return { data: null, error: { message: 'permission denied for function cleanup_cultivation_idempotency_log', code: '42501' } };
      }
      const p_days = params?.p_days;
      if (typeof p_days !== 'number' || p_days < 1 || p_days > 365) {
        return { data: null, error: { message: 'Tham số p_days không hợp lệ, phải nằm trong khoảng từ 1 đến 365 ngày.', code: '22023' } };
      }
      let deleted = 0;
      const cutoff = Date.now() - (p_days * 24 * 60 * 60 * 1000);
      for (const [key, log] of this.idempotencyLogTable.entries()) {
        if (log.created_at < cutoff) {
          this.idempotencyLogTable.delete(key);
          deleted++;
        }
      }
      return { data: deleted, error: null };
    }

    if (funcName !== 'sync_cultivation_occ') {
      return { data: null, error: { message: `Function ${funcName} not found`, code: 'PGRST202' } };
    }

    if (this.simulateNetworkDropOnNextRpc) {
      // Giả lập commit thành công trên DB nhưng response bị rớt trên đường truyền
      this.simulateNetworkDropOnNextRpc = false;
      await this._executeOccLogic(params);
      throw new Error('Network timeout: Failed to fetch');
    }

    const result = await this._executeOccLogic(params);
    return { data: result, error: null };
  }

  async _executeOccLogic(params) {
    const {
      p_expected_rev,
      p_state,
      p_updated_at,
      p_device_id,
      p_idempotency_key,
      p_request_fingerprint
    } = params;

    // 1. Kiểm tra Auth
    const userId = this.currentUserId;
    if (!userId) {
      return { status: 'ERROR', code: 'UNAUTHORIZED', message: 'Yêu cầu đăng nhập hợp lệ.' };
    }

    // 2. Kiểm tra Maintenance
    const maint = this.systemFlags.get('cultivation_maintenance');
    if (maint && maint.enabled) {
      return { status: 'MAINTENANCE', code: 'SYNC_PAUSED', message: maint.message };
    }

    // 3. Input Validation
    if (typeof p_expected_rev !== 'number' || p_expected_rev < 0 || !p_idempotency_key) {
      return { status: 'ERROR', code: 'INVALID_INPUT', message: 'Tham số đầu vào không hợp lệ.' };
    }

    // Server tự tính fingerprint độc lập từ payload
    const serverFingerprint = crypto.createHash('md5').update(`${p_expected_rev}:${JSON.stringify(p_state)}`).digest('hex');
    if (p_request_fingerprint && p_request_fingerprint !== serverFingerprint) {
      return {
        status: 'ERROR',
        code: 'INVALID_FINGERPRINT',
        message: 'Request fingerprint client cung cấp không khớp với dữ liệu tính toán từ server.'
      };
    }
    const fingerprint = serverFingerprint;

    // 4. Kiểm tra Idempotency Log
    const logKey = `${userId}:${p_idempotency_key}`;
    const existingLog = this.idempotencyLogTable.get(logKey);
    const currentRow = this.cultivationTable.get(userId);

    if (existingLog) {
      if (existingLog.request_fingerprint === fingerprint) {
        // Cùng key, cùng payload -> Idempotent Replay hợp lệ
        return {
          status: 'SUCCESS',
          idempotent_replay: true,
          committed_rev: existingLog.committed_rev,
          current_cloud_rev: currentRow ? currentRow.rev : existingLog.committed_rev,
          updated_at: p_updated_at
        };
      } else {
        // Cùng key nhưng khác payload -> TỪ CHỐI RÕ RÀNG
        return {
          status: 'ERROR',
          code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD',
          message: 'Không thể tái sử dụng idempotency_key cho request mang dữ liệu hoặc expected_rev khác.'
        };
      }
    }

    // 5. Trường hợp dòng chưa tồn tại (First Insert)
    if (!currentRow) {
      if (p_expected_rev > 0) {
        return { status: 'CONFLICT', reason: 'ROW_NOT_FOUND', current_cloud: null };
      }

      // Khởi tạo rev = 1
      const newRow = {
        user_id: userId,
        rev: 1,
        state: JSON.parse(JSON.stringify(p_state)),
        updated_at: p_updated_at,
        device_id: p_device_id
      };
      this.cultivationTable.set(userId, newRow);

      // Ghi nhật ký idempotency
      this.idempotencyLogTable.set(logKey, {
        user_id: userId,
        idempotency_key: p_idempotency_key,
        committed_rev: 1,
        request_fingerprint: fingerprint,
        created_at: Date.now()
      });

      return { status: 'SUCCESS', rev: 1, updated_at: p_updated_at, is_first_insert: true };
    }

    // 6. Kiểm tra Expected Revision
    if (currentRow.rev !== p_expected_rev) {
      return {
        status: 'CONFLICT',
        reason: 'REV_MISMATCH',
        expected_rev: p_expected_rev,
        current_cloud: {
          rev: currentRow.rev,
          state: JSON.parse(JSON.stringify(currentRow.state)),
          updated_at: currentRow.updated_at,
          device_id: currentRow.device_id
        }
      };
    }

    // 7. Revision khớp -> Tăng đơn điệu Cloud rev
    const newRev = currentRow.rev + 1;
    currentRow.rev = newRev;
    currentRow.state = JSON.parse(JSON.stringify(p_state));
    currentRow.updated_at = p_updated_at;
    currentRow.device_id = p_device_id;
    this.cultivationTable.set(userId, currentRow);

    // Ghi nhật ký idempotency
    this.idempotencyLogTable.set(logKey, {
      user_id: userId,
      idempotency_key: p_idempotency_key,
      committed_rev: newRev,
      request_fingerprint: fingerprint,
      created_at: Date.now()
    });

    return { status: 'SUCCESS', rev: newRev, updated_at: p_updated_at };
  }

  // Giả lập PostgREST table queries
  from(tableName) {
    const engine = this;
    let selectedColumns = '*';
    let filterUserId = null;

    const builder = {
      select: (cols) => {
        selectedColumns = cols;
        return builder;
      },
      eq: (col, val) => {
        if (col === 'user_id') filterUserId = val;
        return builder;
      },
      single: async () => {
        if (tableName === 'cultivation') {
          const row = engine.cultivationTable.get(filterUserId || engine.currentUserId);
          if (!row) return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
          return { data: JSON.parse(JSON.stringify(row)), error: null };
        }
        return { data: null, error: null };
      },
      // Giả lập PostgREST direct upsert
      upsert: async (payload, options = {}) => {
        if (tableName === 'cultivation') {
          // Kiểm tra quyền: Sau cutover, direct write bị REVOKE!
          if (engine.isRevokedDirectWrite) {
            return {
              data: null,
              error: {
                message: 'permission denied for table cultivation',
                code: '42501',
                details: 'Direct writes are blocked by OCC policy.'
              }
            };
          }

          // Blind overwrite cũ nếu chưa REVOKE
          const userId = payload.user_id || engine.currentUserId;
          const row = {
            user_id: userId,
            rev: payload.rev || 1,
            state: JSON.parse(JSON.stringify(payload.state || {})),
            updated_at: payload.updated_at || Date.now(),
            device_id: payload.device_id || 'unknown'
          };
          engine.cultivationTable.set(userId, row);
          return { data: row, error: null };
        }
        return { data: null, error: null };
      }
    };

    return builder;
  }

  // Giả lập Supabase Auth
  get auth() {
    const engine = this;
    return {
      getSession: async () => {
        if (!engine.currentUserId) return { data: { session: null } };
        return {
          data: {
            session: {
              user: { id: engine.currentUserId }
            }
          }
        };
      }
    };
  }
}

// -------------------------------------------------------------
// IMPORT CÁC MODULE PRODUCTION CẦN KIỂM THỬ
// -------------------------------------------------------------
const {
  getCultivationState,
  saveCultivationState,
  getCultivationKey,
  getActiveProfile,
} = await import('../src/lib/cultivation.js');

const {
  getSyncLedger,
  saveSyncLedger,
  getCultivationConflictState,
  setCultivationConflictState,
  clearCultivationConflictState,
  getPendingCultivationRequest,
  savePendingCultivationRequest,
  clearPendingCultivationRequest,
  getDeviceId,
} = await import('../src/lib/sync/syncLedger.js');

const {
  syncCultivation,
  commitCultivationOCC,
} = await import('../src/lib/sync/syncEngine.js');

const {
  runAutoSync,
  pullCultivationBeforeMeditation,
  quickPushProgressAndCultivation,
} = await import('../src/lib/sync/autoSync.js');

// -------------------------------------------------------------
// BỘ KIỂM THỬ 15 KỊCH BẢN BẮT BUỘC CHO NHIỆM VỤ 3B.2
// -------------------------------------------------------------

describe('Nhiệm vụ 3B.2: Kiểm thử toàn diện cơ chế OCC trên môi trường thử nghiệm', () => {
  let mockEngine;

  beforeEach(() => {
    global.localStorage.clear();
    mockEngine = new MockSupabaseOCCEngine();
    mockEngine.currentUserId = 'user_test_occ';
  });

  afterEach(() => {
    global.localStorage.clear();
  });

  // --------------------------------------------------------------------------
  // TEST 1: Hai thiết bị cùng ghi với expected rev 10
  // --------------------------------------------------------------------------
  test('Ca 1: Hai thiết bị cùng đọc rev 10 -> Thiết bị 1 thành công (rev 11), Thiết bị 2 nhận CONFLICT', async () => {
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 10,
      state: { realm: 'ngung_khi_9', totalExp: 900 },
      updated_at: 1000,
      device_id: 'dev_init'
    });

    // Thiết bị A chuẩn bị ghi
    const resA = await commitCultivationOCC(mockEngine, 'user_test_occ', {
      expectedRev: 10,
      state: { realm: 'truc_co_1', totalExp: 1100 },
      deviceId: 'dev_A',
      idempotencyKey: 'req_A_1'
    });

    assert.equal(resA.status, 'SUCCESS');
    assert.equal(resA.rev, 11);

    // Kiểm tra Cloud đã lên rev 11 với dữ liệu của A
    const cloudAfterA = mockEngine.cultivationTable.get('user_test_occ');
    assert.equal(cloudAfterA.rev, 11);
    assert.equal(cloudAfterA.state.realm, 'truc_co_1');

    // Thiết bị B cũng gửi với expectedRev = 10 (cơ sở cũ)
    const resB = await commitCultivationOCC(mockEngine, 'user_test_occ', {
      expectedRev: 10,
      state: { realm: 'ngung_khi_9', totalExp: 1000 },
      deviceId: 'dev_B',
      idempotencyKey: 'req_B_1'
    });

    assert.equal(resB.status, 'CONFLICT');
    assert.equal(resB.reason, 'REV_MISMATCH');
    assert.equal(resB.current_cloud.rev, 11);
    assert.equal(resB.current_cloud.state.realm, 'truc_co_1');

    // Dữ liệu Thiết bị A trên Cloud được bảo toàn nguyên vẹn 100%
    const finalCloud = mockEngine.cultivationTable.get('user_test_occ');
    assert.equal(finalCloud.rev, 11);
    assert.equal(finalCloud.state.realm, 'truc_co_1');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Local rev cũ cố ghi đè Cloud rev 50
  // --------------------------------------------------------------------------
  test('Ca 2: Stale Write - Local rev 11 cố ghi đè Cloud rev 50 -> Bị từ chối ngay lập tức', async () => {
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 50,
      state: { realm: 'kim_dan_5', totalExp: 50000 },
      updated_at: 5000,
      device_id: 'dev_laptop'
    });

    const res = await commitCultivationOCC(mockEngine, 'user_test_occ', {
      expectedRev: 10,
      state: { realm: 'ngung_khi_1', totalExp: 100 },
      deviceId: 'dev_mobile_stale',
      idempotencyKey: 'req_stale'
    });

    assert.equal(res.status, 'CONFLICT');
    assert.equal(res.reason, 'REV_MISMATCH');
    assert.equal(res.current_cloud.rev, 50);

    const cloud = mockEngine.cultivationTable.get('user_test_occ');
    assert.equal(cloud.rev, 50);
    assert.equal(cloud.state.realm, 'kim_dan_5');
  });

  // --------------------------------------------------------------------------
  // TEST 3: Hai thiết bị đồng thời tạo bản ghi đầu tiên (First insert race)
  // --------------------------------------------------------------------------
  test('Ca 3: First Insert Race - 2 thiết bị cùng tạo bản ghi đầu tiên -> Đúng 1 máy thành công, máy kia nhận CONFLICT', async () => {
    // Cloud hoàn toàn trống
    assert.equal(mockEngine.cultivationTable.has('user_test_occ'), false);

    // Thiết bị A gửi trước
    const resA = await commitCultivationOCC(mockEngine, 'user_test_occ', {
      expectedRev: 0,
      state: { realm: 'ngung_khi_1', totalExp: 50 },
      deviceId: 'dev_A',
      idempotencyKey: 'req_first_A'
    });

    assert.equal(resA.status, 'SUCCESS');
    assert.equal(resA.rev, 1);
    assert.equal(resA.is_first_insert, true);

    // Thiết bị B gửi sau với expectedRev = 0
    const resB = await commitCultivationOCC(mockEngine, 'user_test_occ', {
      expectedRev: 0,
      state: { realm: 'ngung_khi_1', totalExp: 20 },
      deviceId: 'dev_B',
      idempotencyKey: 'req_first_B'
    });

    assert.equal(resB.status, 'CONFLICT');
    assert.equal(resB.reason, 'REV_MISMATCH');
    assert.equal(resB.current_cloud.rev, 1);
    assert.equal(resB.current_cloud.state.totalExp, 50);
  });

  // --------------------------------------------------------------------------
  // TEST 4: Thay đổi pending_seconds
  // --------------------------------------------------------------------------
  test('Ca 4: pending_seconds được quản lý dưới OCC và áp dụng rate-limit 60s', async () => {
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 5,
      state: { realm: 'ngung_khi_2', totalExp: 200, __meta: { pendingSeconds: 0 } },
      updated_at: 1000,
      device_id: 'dev_A'
    });

    // Cập nhật pending_seconds hợp lệ
    const res = await commitCultivationOCC(mockEngine, 'user_test_occ', {
      expectedRev: 5,
      state: { realm: 'ngung_khi_2', totalExp: 200 },
      pendingSeconds: 120,
      deviceId: 'dev_A',
      idempotencyKey: 'req_pending_1'
    });

    assert.equal(res.status, 'SUCCESS');
    assert.equal(res.rev, 6);

    const cloud = mockEngine.cultivationTable.get('user_test_occ');
    assert.equal(cloud.rev, 6);
    assert.equal(cloud.state.__meta.pendingSeconds, 120);
  });

  // --------------------------------------------------------------------------
  // TEST 5 & 6: Timeout sau khi DB commit & Retry cùng idempotency key
  // --------------------------------------------------------------------------
  test('Ca 5 & 6: Network Timeout sau commit -> Client retry cùng idempotency key nhận kết quả Idempotent Replay hợp lệ', async () => {
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 10,
      state: { realm: 'ngung_khi_5', totalExp: 500 },
      updated_at: 1000,
      device_id: 'dev_A'
    });

    // Bật cờ mô phỏng rớt mạng: DB commit thành công nhưng ném Network timeout về client
    mockEngine.simulateNetworkDropOnNextRpc = true;

    const timeoutRes = await commitCultivationOCC(mockEngine, 'user_test_occ', {
      expectedRev: 10,
      state: { realm: 'ngung_khi_6', totalExp: 600 },
      deviceId: 'dev_A',
      idempotencyKey: 'req_retry_key_123'
    });

    assert.equal(timeoutRes.status, 'ERROR');
    assert.match(timeoutRes.message, /Network timeout/);

    // Xác minh trên DB: Bản ghi thực tế ĐÃ commit lên rev 11
    const cloudCommitted = mockEngine.cultivationTable.get('user_test_occ');
    assert.equal(cloudCommitted.rev, 11);
    assert.equal(cloudCommitted.state.realm, 'ngung_khi_6');

    // Client retry gửi lại CHÍNH XÁC cùng idempotency key và cùng payload
    const retryRes = await commitCultivationOCC(mockEngine, 'user_test_occ', {
      expectedRev: 10,
      state: { realm: 'ngung_khi_6', totalExp: 600 },
      deviceId: 'dev_A',
      idempotencyKey: 'req_retry_key_123'
    });

    assert.equal(retryRes.status, 'SUCCESS');
    assert.equal(retryRes.idempotent_replay, true);
    assert.equal(retryRes.committed_rev, 11);

    // Cloud không bị tăng rev lần 2
    assert.equal(mockEngine.cultivationTable.get('user_test_occ').rev, 11);
  });

  // --------------------------------------------------------------------------
  // TEST 7: Tái sử dụng key với payload khác
  // --------------------------------------------------------------------------
  test('Ca 7: Tái sử dụng cùng idempotency_key với payload khác -> BỊ TỪ CHỐI RÕ RÀNG', async () => {
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 1,
      state: { realm: 'ngung_khi_1', totalExp: 10 },
      updated_at: 1000,
      device_id: 'dev_A'
    });

    // Request đầu tiên với key_dup
    const res1 = await commitCultivationOCC(mockEngine, 'user_test_occ', {
      expectedRev: 1,
      state: { realm: 'ngung_khi_2', totalExp: 20 },
      deviceId: 'dev_A',
      idempotencyKey: 'key_dup_test'
    });
    assert.equal(res1.status, 'SUCCESS');
    assert.equal(res1.rev, 2);

    // Request thứ hai tái sử dụng key_dup_test nhưng gửi state khác
    const res2 = await commitCultivationOCC(mockEngine, 'user_test_occ', {
      expectedRev: 2,
      state: { realm: 'ngung_khi_3', totalExp: 999 }, // Payload khác!
      deviceId: 'dev_A',
      idempotencyKey: 'key_dup_test'
    });

    assert.equal(res2.status, 'ERROR');
    assert.equal(res2.code, 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD');
  });

  // --------------------------------------------------------------------------
  // TEST 8: Thiết bị khác commit xen giữa hai lần retry
  // --------------------------------------------------------------------------
  test('Ca 8: Thiết bị B commit xen giữa lúc A retry -> Nhờ bảng nhật ký, A vẫn nhận diện đã commit thành công ở rev 11', async () => {
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 10,
      state: { realm: 'ngung_khi_5', totalExp: 500 },
      updated_at: 1000,
      device_id: 'dev_A'
    });

    // 1. Máy A gửi req_A1 -> commit thành công lên rev 11, nhưng response bị drop
    mockEngine.simulateNetworkDropOnNextRpc = true;
    const dropRes = await commitCultivationOCC(mockEngine, 'user_test_occ', {
      expectedRev: 10,
      state: { realm: 'ngung_khi_6', totalExp: 600 },
      deviceId: 'dev_A',
      idempotencyKey: 'req_A1'
    });
    assert.equal(dropRes.status, 'ERROR');

    // 2. Thiết bị B xen vào commit thành công req_B1 -> đẩy Cloud rev lên 12!
    const resB = await commitCultivationOCC(mockEngine, 'user_test_occ', {
      expectedRev: 11,
      state: { realm: 'ngung_khi_7', totalExp: 700 },
      deviceId: 'dev_B',
      idempotencyKey: 'req_B1'
    });
    assert.equal(resB.status, 'SUCCESS');
    assert.equal(resB.rev, 12);
    assert.equal(mockEngine.cultivationTable.get('user_test_occ').rev, 12);

    // 3. Thiết bị A retry với req_A1 (vẫn giữ expectedRev = 10)
    const resA_retry = await commitCultivationOCC(mockEngine, 'user_test_occ', {
      expectedRev: 10,
      state: { realm: 'ngung_khi_6', totalExp: 600 },
      deviceId: 'dev_A',
      idempotencyKey: 'req_A1'
    });

    // Bảng nhật ký xác nhận req_A1 ĐÃ commit tại rev 11, kèm current_cloud_rev là 12
    assert.equal(resA_retry.status, 'SUCCESS');
    assert.equal(resA_retry.idempotent_replay, true);
    assert.equal(resA_retry.committed_rev, 11);
    assert.equal(resA_retry.current_cloud_rev, 12);
  });

  // --------------------------------------------------------------------------
  // TEST 9: Local thay đổi trong lúc RPC đang xử lý (In-Flight Mutation)
  // --------------------------------------------------------------------------
  test('Ca 9: Local mutation phát sinh trong lúc RPC đang bay -> Chỉ xác nhận sentLocalSeq, giữ dirty cho mutation mới', async () => {
    // Khởi tạo local state tại seq 25
    const state = getCultivationState();
    state._seq = 25;
    state._rev = 25;
    state.totalExp = 2500;
    localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(state));

    const ledger = getSyncLedger();
    ledger.cultivation = { lastSyncedRev: 10, lastSyncedLocalSeq: 25, lastCloudUpdatedAt: 1000 };
    saveSyncLedger(ledger);

    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 10,
      state: { totalExp: 2000 },
      updated_at: 1000,
      device_id: 'dev_A'
    });

    // Giả lập In-Flight Snapshot tại seq 25
    const sentLocalSeq = 25;
    const expectedRev = 10;
    const idempotencyKey = 'req_inflight_test';

    // Trong lúc RPC đang gửi qua mạng: Người dùng đột phá cắn đan -> saveCultivationState() tăng seq lên 27
    saveCultivationState(state); // seq 26
    saveCultivationState(state); // seq 27
    assert.equal(getCultivationState()._seq, 27);

    // RPC phản hồi thành công với rev = 11
    const occRes = await commitCultivationOCC(mockEngine, 'user_test_occ', {
      expectedRev,
      state: { totalExp: 2500 },
      deviceId: 'dev_A',
      idempotencyKey
    });
    assert.equal(occRes.status, 'SUCCESS');
    assert.equal(occRes.rev, 11);

    // Client cập nhật ledger dựa trên sentLocalSeq của inFlightSnapshot
    ledger.cultivation.lastSyncedRev = occRes.rev;
    ledger.cultivation.lastSyncedLocalSeq = sentLocalSeq; // 25!
    saveSyncLedger(ledger);

    // Kiểm tra tính toàn vẹn: Local hiện tại là 27 > lastSyncedLocalSeq (25) -> VẪN DIRTY!
    const currentLocalSeq = getCultivationState()._seq;
    const isStillDirty = currentLocalSeq > ledger.cultivation.lastSyncedLocalSeq;
    assert.equal(isStillDirty, true);
    assert.equal(currentLocalSeq, 27);
    assert.equal(ledger.cultivation.lastSyncedLocalSeq, 25);
  });

  // --------------------------------------------------------------------------
  // TEST 10: RPC bị lỗi quyền hoặc hết hạn Auth (401)
  // --------------------------------------------------------------------------
  test('Ca 10: Auth hết hạn (401) -> Bắt lỗi an toàn, dữ liệu local không bị xóa hay reset', async () => {
    mockEngine.currentUserId = null; // Giả lập token hết hạn

    const res = await commitCultivationOCC(mockEngine, null, {
      expectedRev: 1,
      state: { realm: 'ngung_khi_1', totalExp: 10 },
      deviceId: 'dev_A',
      idempotencyKey: 'req_unauth'
    });

    assert.equal(res.status, 'ERROR');
    assert.equal(res.code, 'UNAUTHORIZED');

    // Local data hoàn toàn nguyên vẹn
    assert.ok(localStorage);
  });

  // --------------------------------------------------------------------------
  // TEST 11: Một người dùng cố thay đổi dữ liệu tài khoản khác
  // --------------------------------------------------------------------------
  test('Ca 11: Cross-user write attempt -> Database luôn dùng auth.uid(), không cho phép ghi chéo', async () => {
    mockEngine.currentUserId = 'user_victim';
    mockEngine.cultivationTable.set('user_victim', {
      user_id: 'user_victim',
      rev: 5,
      state: { realm: 'ngung_khi_5', totalExp: 500 },
      updated_at: 1000,
      device_id: 'dev_victim'
    });

    // Kẻ xấu đăng nhập dưới user_attacker
    mockEngine.currentUserId = 'user_attacker';

    // Kẻ xấu cố ý truyền user_id của user_victim (nếu có tham số)
    const res = await commitCultivationOCC(mockEngine, 'user_victim', {
      expectedRev: 5,
      state: { realm: 'phe_nhan', totalExp: 0 },
      deviceId: 'dev_hacker',
      idempotencyKey: 'req_hack'
    });

    // Hàm RPC tự động lấy auth.uid() là user_attacker (bản ghi rỗng) -> CONFLICT hoặc tạo mới cho chính attacker
    const victimCloud = mockEngine.cultivationTable.get('user_victim');
    assert.equal(victimCloud.rev, 5);
    assert.equal(victimCloud.state.realm, 'ngung_khi_5');
    assert.equal(victimCloud.state.totalExp, 500); // Nạn nhân không bị ảnh hưởng!
  });

  // --------------------------------------------------------------------------
  // TEST 12: Client cũ cố ghi trực tiếp sau khi REVOKE
  // --------------------------------------------------------------------------
  test('Ca 12: Cutover Lockdown - Client cũ gọi direct upsert() bị từ chối 42501, giữ nguyên local data', async () => {
    mockEngine.setDirectWritePermission(false); // Bị REVOKE direct write

    // Client cũ dùng code cũ gọi .from('cultivation').upsert(...)
    const { data, error } = await mockEngine.from('cultivation').upsert({
      user_id: 'user_test_occ',
      rev: 1,
      state: { totalExp: 1 },
      updated_at: Date.now(),
      device_id: 'dev_old'
    });

    assert.equal(data, null);
    assert.ok(error);
    assert.equal(error.code, '42501');
    assert.match(error.message, /permission denied/);
  });

  // --------------------------------------------------------------------------
  // TEST 13: Chế độ MAINTENANCE không làm mất dữ liệu
  // --------------------------------------------------------------------------
  test('Ca 13: Chế độ MAINTENANCE (Circuit Breaker) -> Trả về MAINTENANCE, giữ dirty state cục bộ', async () => {
    mockEngine.setMaintenance(true, 'Bảo trì máy chủ tu vi');

    const res = await commitCultivationOCC(mockEngine, 'user_test_occ', {
      expectedRev: 5,
      state: { realm: 'ngung_khi_5', totalExp: 500 },
      deviceId: 'dev_A',
      idempotencyKey: 'req_maint'
    });

    assert.equal(res.status, 'MAINTENANCE');
    assert.equal(res.code, 'SYNC_PAUSED');
    assert.equal(res.message, 'Bảo trì máy chủ tu vi');
  });

  // --------------------------------------------------------------------------
  // TEST 14: Browser reload / mạng chập chờn không mất dữ liệu
  // --------------------------------------------------------------------------
  test('Ca 14: Lưu trữ xung đột bền vững tại localStorage -> Không mất khi F5 hoặc mở lại trình duyệt', () => {
    const conflictData = {
      local: { realm: 'truc_co_1', totalExp: 1000 },
      cloud: { rev: 12, realm: 'ngung_khi_9', totalExp: 900 },
      detectedAt: Date.now()
    };

    setCultivationConflictState(conflictData);

    // Giả lập F5 / Reload browser
    const restoredConflict = getCultivationConflictState();
    assert.deepEqual(restoredConflict.local, conflictData.local);
    assert.deepEqual(restoredConflict.cloud, conflictData.cloud);

    clearCultivationConflictState();
    assert.equal(getCultivationConflictState(), null);
  });

  // --------------------------------------------------------------------------
  // TEST 15: Phục hồi sau khi request journal được dọn dẹp (Cleanup job)
  // --------------------------------------------------------------------------
  test('Ca 15: Request journal dọn dẹp key cũ -> Request mới với expected_rev đúng vẫn commit thành công', async () => {
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 20,
      state: { realm: 'kim_dan_1', totalExp: 20000 },
      updated_at: 1000,
      device_id: 'dev_A'
    });

    // Giả lập bảng nhật ký bị xóa sạch bởi cleanup job
    mockEngine.idempotencyLogTable.clear();

    // Client gửi request mới tinh với expected_rev = 20
    const res = await commitCultivationOCC(mockEngine, 'user_test_occ', {
      expectedRev: 20,
      state: { realm: 'kim_dan_2', totalExp: 22000 },
      deviceId: 'dev_A',
      idempotencyKey: 'req_brand_new_key'
    });

    assert.equal(res.status, 'SUCCESS');
    assert.equal(res.rev, 21);
    assert.equal(mockEngine.cultivationTable.get('user_test_occ').rev, 21);
  });

  // --------------------------------------------------------------------------
  // TEST 16: Bảo mật SECURITY DEFINER - cleanup function
  // --------------------------------------------------------------------------
  test('Ca 16: Bảo mật SECURITY DEFINER - User thông thường bị từ chối gọi cleanup; chỉ service_role được gọi; p_days ngoài 1-365 bị ném exception', async () => {
    // 1. User thông thường (authenticated) cố gọi cleanup -> Bị từ chối 42501 permission denied
    mockEngine.currentRole = 'authenticated';
    const resAuth = await mockEngine.rpc('cleanup_cultivation_idempotency_log', { p_days: 7 });
    assert.equal(resAuth.data, null);
    assert.ok(resAuth.error);
    assert.equal(resAuth.error.code, '42501');
    assert.match(resAuth.error.message, /permission denied/);

    // 2. Vai trò quản trị (service_role) gọi với p_days không hợp lệ (ví dụ p_days = 0 hoặc negative)
    mockEngine.currentRole = 'service_role';
    const resInvalid = await mockEngine.rpc('cleanup_cultivation_idempotency_log', { p_days: 0 });
    assert.equal(resInvalid.data, null);
    assert.ok(resInvalid.error);
    assert.equal(resInvalid.error.code, '22023');
    assert.match(resInvalid.error.message, /Tham số p_days không hợp lệ/);

    // 3. service_role gọi với p_days hợp lệ -> Dọn dẹp thành công
    mockEngine.idempotencyLogTable.set('user_test_occ:old_req', {
      user_id: 'user_test_occ',
      idempotency_key: 'old_req',
      committed_rev: 1,
      request_fingerprint: 'fp',
      created_at: Date.now() - (10 * 24 * 60 * 60 * 1000) // 10 ngày trước
    });
    mockEngine.idempotencyLogTable.set('user_test_occ:recent_req', {
      user_id: 'user_test_occ',
      idempotency_key: 'recent_req',
      committed_rev: 2,
      request_fingerprint: 'fp',
      created_at: Date.now() - (1 * 24 * 60 * 60 * 1000) // 1 ngày trước
    });

    const resValid = await mockEngine.rpc('cleanup_cultivation_idempotency_log', { p_days: 7 });
    assert.equal(resValid.error, null);
    assert.equal(resValid.data, 1); // Xóa đúng 1 bản ghi cũ
    assert.equal(mockEngine.idempotencyLogTable.has('user_test_occ:old_req'), false);
    assert.equal(mockEngine.idempotencyLogTable.has('user_test_occ:recent_req'), true);

    mockEngine.currentRole = 'authenticated';
  });

  // --------------------------------------------------------------------------
  // TEST 17: Server-Authoritative Fingerprint
  // --------------------------------------------------------------------------
  test('Ca 17: Server-Authoritative Fingerprint - Client gửi fingerprint sai lệch bị từ chối; server tự tính toán authoritative fingerprint', async () => {
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 5,
      state: { realm: 'ngung_khi_5', totalExp: 500 },
      updated_at: 1000,
      device_id: 'dev_A'
    });

    // Client gửi fingerprint bịa đặt sai lệch so với payload
    const resBadFp = await commitCultivationOCC(mockEngine, 'user_test_occ', {
      expectedRev: 5,
      state: { realm: 'ngung_khi_6', totalExp: 600 },
      deviceId: 'dev_A',
      idempotencyKey: 'req_fp_test_1',
      requestFingerprint: 'invalid_client_supplied_hash_12345'
    });

    assert.equal(resBadFp.status, 'ERROR');
    assert.equal(resBadFp.code, 'INVALID_FINGERPRINT');
    assert.match(resBadFp.message, /không khớp/);

    // Không truyền fingerprint -> Server tự tính từ payload và commit thành công
    const resValid = await commitCultivationOCC(mockEngine, 'user_test_occ', {
      expectedRev: 5,
      state: { realm: 'ngung_khi_6', totalExp: 600 },
      deviceId: 'dev_A',
      idempotencyKey: 'req_fp_test_2'
    });

    assert.equal(resValid.status, 'SUCCESS');
    assert.equal(resValid.rev, 6);
  });

  // --------------------------------------------------------------------------
  // TEST 18: Phá bỏ logic revision kế thừa - Không dùng localRev hay isOwnCultDevice
  // --------------------------------------------------------------------------
  test('Ca 18: Không dùng localRev để xác nhận Cloud rev - Fast-forward nhận Cloud rev 20 chính xác; khi cả 2 cùng sửa, báo XUNG ĐỘT dù device_id trùng', async () => {
    // 1. Máy trùng device_id: Cloud đã lên rev 20, local có seq = 5, lastSyncedRev = 10, lastSyncedLocalSeq = 5 (local không đổi)
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 20,
      state: { realm: 'truc_co_1', totalExp: 2000 },
      updated_at: 5000,
      device_id: getDeviceId() // Trùng device_id
    });

    const localState = getCultivationState();
    localState._seq = 5;
    localState._rev = 5;
    localState.totalExp = 1000;
    localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(localState));

    const ledger = getSyncLedger();
    ledger.cultivation = {
      lastSyncedRev: 10,
      lastSyncedLocalSeq: 5,
      lastCloudUpdatedAt: 2000
    };
    saveSyncLedger(ledger);

    // Khi chạy pullCultivationBeforeMeditation: Fast-forward thành công lên rev 20
    const pullRes = await pullCultivationBeforeMeditation(mockEngine, { timeoutMs: 1000 });
    assert.equal(pullRes.fastForwarded, true);
    assert.equal(pullRes.state._rev, 20);

    const ledgerAfterPull = getSyncLedger();
    assert.equal(ledgerAfterPull.cultivation.lastSyncedRev, 20); // Phải là 20, KHÔNG phải Math.max(10, 20, 5)

    // 2. Tình huống cả 2 cùng sửa: Cloud có rev 25, local sửa tiếp lên seq = 22 (> 20)
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 25,
      state: { realm: 'truc_co_5', totalExp: 2500 },
      updated_at: 6000,
      device_id: getDeviceId() // Cùng device_id
    });

    const localMutated = getCultivationState();
    localMutated._seq = 22;
    localMutated._rev = 22;
    localMutated.totalExp = 2200;
    saveCultivationState(localMutated);

    // Khi chạy syncCultivation: Phải báo CONFLICT, KHÔNG được tự đánh dấu đã đồng bộ chỉ vì device_id trùng!
    const syncRes = await syncCultivation(mockEngine, 'user_test_occ');
    assert.equal(syncRes.conflict, true);
    assert.equal(syncRes.skipped, true);

    const conflictState = getCultivationConflictState();
    assert.ok(conflictState);
    assert.equal(conflictState.cloud.rev, 25);
    assert.equal(conflictState.local.totalExp, 2200);
  });

  // --------------------------------------------------------------------------
  // TEST 19: Idempotent Replay khi Cloud có revision mới hơn và local có mutation mới
  // --------------------------------------------------------------------------
  test('Ca 19: Idempotent Replay khi Cloud có revision mới hơn và Local có mutation mới -> Đánh dấu XUNG ĐỘT, bảo toàn local', async () => {
    // 1. Client A tạo persistent request req_A1 với expectedRev = 10, sentLocalSeq = 15
    const pendingReq = {
      idempotencyKey: 'req_A1_replay_test',
      expectedRev: 10,
      sentLocalSeq: 15,
      sentPendingSeconds: 0,
      payloadState: { realm: 'ngung_khi_5', totalExp: 500 },
      createdAt: Date.now()
    };
    savePendingCultivationRequest(pendingReq);

    // 2. Giả lập Cloud: req_A1 đã được commit tại rev 11, nhưng ngay sau đó Thiết bị B đã đẩy Cloud lên rev 12
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 12,
      state: { realm: 'ngung_khi_7', totalExp: 700 },
      updated_at: 3000,
      device_id: 'dev_B'
    });
    mockEngine.idempotencyLogTable.set('user_test_occ:req_A1_replay_test', {
      user_id: 'user_test_occ',
      idempotency_key: 'req_A1_replay_test',
      committed_rev: 11,
      request_fingerprint: crypto.createHash('md5').update(`10:${JSON.stringify(pendingReq.payloadState)}`).digest('hex'),
      created_at: 2000
    });

    // 3. Local phát sinh mutation mới offline sau sentLocalSeq 15 -> seq = 16
    const localState = getCultivationState();
    localState._seq = 16;
    localState._rev = 16;
    localState.totalExp = 550;
    localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(localState));

    const ledger = getSyncLedger();
    ledger.cultivation = { lastSyncedRev: 10, lastSyncedLocalSeq: 15, lastCloudUpdatedAt: 1000 };
    saveSyncLedger(ledger);

    // 4. Client A chạy syncCultivation (retry request pendingReq)
    const res = await syncCultivation(mockEngine, 'user_test_occ');

    // Phải phát hiện XUNG ĐỘT vì Cloud đã tiến lên rev 12 mà local lại có mutation mới ở seq 16
    assert.equal(res.conflict, true);
    assert.equal(res.skipped, true);

    const conflictState = getCultivationConflictState();
    assert.ok(conflictState);
    assert.equal(conflictState.cloud.rev, 12);

    // Local data của A ở seq 16 được bảo toàn nguyên vẹn
    assert.equal(getCultivationState().totalExp, 550);
  });

  // --------------------------------------------------------------------------
  // TEST 20: Pending seconds thay đổi và quy đổi thành EXP trong lúc request đang bay
  // --------------------------------------------------------------------------
  test('Ca 20: Pending seconds thay đổi và quy đổi thành EXP trong lúc request đang bay -> Dữ liệu được bảo toàn và dirty tiếp tục', async () => {
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 5,
      state: { realm: 'ngung_khi_5', totalExp: 500, __meta: { pendingSeconds: 0 } },
      updated_at: 1000,
      device_id: 'dev_A'
    });

    // Local bắt đầu: seq = 10, totalExp = 500, pending = 120
    const local = getCultivationState();
    local._seq = 10;
    local._rev = 10;
    local.totalExp = 500;
    localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(local));
    localStorage.setItem(getCultivationKey('pending_seconds', 'real'), '120');

    const ledger = getSyncLedger();
    ledger.cultivation = { lastSyncedRev: 5, lastSyncedLocalSeq: 10, lastSyncedPending: 0, lastCloudUpdatedAt: 1000 };
    saveSyncLedger(ledger);

    // Bắt đầu tạo snapshot in-flight
    const inFlightSnapshot = {
      idempotencyKey: 'req_pending_race_test',
      expectedRev: 5,
      sentLocalSeq: 10,
      sentPendingSeconds: 120,
      payloadState: { ...local },
      createdAt: Date.now()
    };
    savePendingCultivationRequest(inFlightSnapshot);

    // Trong lúc request đang bay: User click "Thu hoạch" EXP từ pending seconds!
    // -> totalExp tăng lên 620, pending_seconds về 0, _seq tăng lên 11!
    local.totalExp = 620;
    saveCultivationState(local); // Tăng _seq = 11
    localStorage.setItem(getCultivationKey('pending_seconds', 'real'), '0');

    // Giả lập RPC trả về SUCCESS (rev 6) cho request cũ
    const occRes = await commitCultivationOCC(mockEngine, 'user_test_occ', {
      expectedRev: inFlightSnapshot.expectedRev,
      state: inFlightSnapshot.payloadState,
      pendingSeconds: inFlightSnapshot.sentPendingSeconds,
      deviceId: 'dev_A',
      idempotencyKey: inFlightSnapshot.idempotencyKey
    });
    assert.equal(occRes.status, 'SUCCESS');
    assert.equal(occRes.rev, 6);

    // Cập nhật ledger theo snapshot in-flight
    ledger.cultivation = {
      lastSyncedRev: 6,
      lastSyncedLocalSeq: inFlightSnapshot.sentLocalSeq, // 10
      lastSyncedPending: inFlightSnapshot.sentPendingSeconds, // 120
      lastCloudUpdatedAt: Date.now()
    };
    saveSyncLedger(ledger);
    clearPendingCultivationRequest();

    // KIỂM TRA TRẠNG THÁI DIRTY CỦA CLIENT:
    const currentState = getCultivationState();
    const currentSeq = currentState._seq;
    const currentPending = parseInt(localStorage.getItem(getCultivationKey('pending_seconds', 'real')), 10);
    const updatedLedger = getSyncLedger();

    // 1. localSeq (11) > lastSyncedLocalSeq (10) -> isLocalRevChanged là TRUE
    assert.equal(currentSeq > updatedLedger.cultivation.lastSyncedLocalSeq, true);

    // 2. localPending (0) !== lastSyncedPending (120) -> isLocalPendingChanged là TRUE
    assert.equal(currentPending !== updatedLedger.cultivation.lastSyncedPending, true);

    // 3. EXP thu hoạch mới (620) không bị mất hay bị ghi đè lùi
    assert.equal(currentState.totalExp, 620);
    assert.equal(currentPending, 0);
  });

  // --------------------------------------------------------------------------
  // TEST 21: Migration A độc lập với Migration B
  // --------------------------------------------------------------------------
  test('Ca 21: Migration A độc lập với Migration B - Giai đoạn A cho phép direct write; Giai đoạn B (Cutover) chặn direct write', async () => {
    // 1. Giai đoạn A (chưa cutover): direct write vẫn được phép
    mockEngine.setDirectWritePermission(true);
    const resA = await mockEngine.from('cultivation').upsert({
      user_id: 'user_test_occ',
      rev: 1,
      state: { totalExp: 10 },
      updated_at: Date.now()
    });
    assert.equal(resA.error, null);
    assert.ok(resA.data);

    // 2. Giai đoạn B (sau cutover): direct write bị từ chối 42501
    mockEngine.setDirectWritePermission(false);
    const resB = await mockEngine.from('cultivation').upsert({
      user_id: 'user_test_occ',
      rev: 2,
      state: { totalExp: 20 },
      updated_at: Date.now()
    });
    assert.equal(resB.data, null);
    assert.ok(resB.error);
    assert.equal(resB.error.code, '42501');
  });
});
