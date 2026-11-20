import assert from 'node:assert/strict';
import { test, describe, beforeEach, afterEach } from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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
    this.simulateNetworkErrorOnRpc = false;
    this.simulateFetchCultivationError = false;
    this.simulateMissingCloudCultivation = false;
    this.simulateStaleCloudRev = null;
  }

  setMaintenance(enabled, message = 'Hệ thống đang bảo trì') {
    this.systemFlags.set('cultivation_maintenance', { enabled, message });
  }

  setDirectWritePermission(allow) {
    this.isRevokedDirectWrite = !allow;
  }

  get storage() {
    return {
      from: () => ({
        remove: async () => ({ error: null }),
        upload: async () => ({ error: null }),
      }),
    };
  }

  // Giả lập RPC sync_cultivation_occ nguyên tử chuẩn PostgreSQL
  async rpc(funcName, params) {
    if (this.simulateNetworkErrorOnRpc) {
      this.simulateNetworkErrorOnRpc = false;
      throw new Error('Network error: Connection timeout / server unreachable');
    }
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
      update: () => builder,
      then: (resolve) => {
        if (tableName === 'novels') {
          return resolve({ data: [], error: null });
        }
        return resolve({ data: null, error: null });
      },
      single: async () => {
        if (tableName === 'cultivation') {
          if (engine.simulateFetchCultivationError) {
            engine.simulateFetchCultivationError = false;
            return { data: null, error: { message: 'Failed to fetch (Network connection dropped)', code: 'FETCH_ERROR' } };
          }
          if (engine.simulateMissingCloudCultivation) {
            engine.simulateMissingCloudCultivation = false;
            return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
          }
          const row = engine.cultivationTable.get(filterUserId || engine.currentUserId);
          if (!row) return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
          const copy = JSON.parse(JSON.stringify(row));
          if (engine.simulateStaleCloudRev !== null) {
            copy.rev = engine.simulateStaleCloudRev;
            engine.simulateStaleCloudRev = null;
          }
          return { data: copy, error: null };
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
  reconcilePendingCultivationRequest,
} = await import('../src/lib/sync/syncEngine.js');

const {
  runAutoSync,
  pullCultivationBeforeMeditation,
  quickPushProgressAndCultivation,
} = await import('../src/lib/sync/autoSync.js');

const { setHostOverrideForTesting } = await import('../src/lib/sync/envProtection.js');
const { getLibrary, addToLibrary, getReadingProgress, saveReadingProgress } = await import('../src/lib/storage.js');

// -------------------------------------------------------------
// BỘ KIỂM THỬ 15 KỊCH BẢN BẮT BUỘC CHO NHIỆM VỤ 3B.2
// -------------------------------------------------------------

describe('Nhiệm vụ 3B.2: Kiểm thử toàn diện cơ chế OCC trên môi trường thử nghiệm', () => {
  let mockEngine;

  beforeEach(() => {
    global.localStorage.clear();
    setHostOverrideForTesting('truevoidnan-commits.github.io');
    global.localStorage.setItem('sync_auto_enabled', 'true');
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
      request_fingerprint: crypto.createHash('md5').update(`10:${JSON.stringify({ ...pendingReq.payloadState, __meta: { pendingSeconds: 0 } })}`).digest('hex'),
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

  // --------------------------------------------------------------------------
  // TEST 22: Quản lý pending_seconds - Chưa commit không được xóa và không được ghi vào lastSyncedPending
  // --------------------------------------------------------------------------
  test('Ca 22: Cloud rev tăng, Local chưa đổi _seq nhưng pending_seconds đã tăng -> pending_seconds không bị xóa và KHÔNG bị ghi vào lastSyncedPending', async () => {
    // 1. Cloud rev 11, realm ngung_khi_2, totalExp 1000
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 11,
      state: { realm: 'ngung_khi_2', totalExp: 1000, __meta: { pendingSeconds: 0 } },
      updated_at: 2000,
      device_id: 'dev_other'
    });

    // 2. Local: seq = 5, rev = 5, totalExp = 900.
    // Local CHƯA đổi _seq (vẫn 5), nhưng pending_seconds đã tăng lên 120 (người dùng thiền offline)!
    const local = getCultivationState();
    local._seq = 5;
    local._rev = 5;
    local.totalExp = 900;
    localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(local));
    localStorage.setItem(getCultivationKey('pending_seconds', 'real'), '120');

    const ledger = getSyncLedger();
    ledger.cultivation = {
      lastSyncedRev: 10,
      lastSyncedLocalSeq: 5,
      lastSyncedPending: 0, // Mốc sync trước đó là 0s
      lastCloudUpdatedAt: 1000
    };
    saveSyncLedger(ledger);

    // 3. Thiết bị khác tăng Cloud lên rev 12
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 12,
      state: { realm: 'ngung_khi_3', totalExp: 1200, __meta: { pendingSeconds: 0 } },
      updated_at: 3000,
      device_id: 'dev_other_2'
    });

    // 4. Chạy pullCultivationBeforeMeditation()
    const pullRes = await pullCultivationBeforeMeditation(mockEngine, { timeoutMs: 1000 });
    assert.equal(pullRes.fastForwarded, true);

    // KẾT QUẢ BẮT BUỘC THEO REVIEW:
    // A. pending_seconds chưa commit (120s) KHÔNG ĐƯỢC BỊ XÓA khỏi localStorage
    const localPendingAfterPull = parseInt(localStorage.getItem(getCultivationKey('pending_seconds', 'real')), 10);
    assert.equal(localPendingAfterPull, 120, 'pending_seconds 120s chưa commit không được bị xóa!');

    // B. lastSyncedPending KHÔNG ĐƯỢC BỊ GHI 120s như thể đã đồng bộ thành công!
    const ledgerAfterPull = getSyncLedger();
    assert.equal(ledgerAfterPull.cultivation.lastSyncedPending, 0, 'lastSyncedPending phải giữ nguyên mốc 0, không được ghi 120s!');
    assert.equal(ledgerAfterPull.cultivation.lastSyncedRev, 12, 'Cloud rev phải là 12');

    // C. Cờ bẩn isLocalPendingChanged (120 !== 0) tiếp tục bật để push ở chu kỳ tiếp theo
    const isPendingStillDirty = localPendingAfterPull !== ledgerAfterPull.cultivation.lastSyncedPending;
    assert.equal(isPendingStillDirty, true, 'isLocalPendingChanged bắt buộc phải là true để không mất dữ liệu thiền!');

    // D. Kiểm tra tương tự với runAutoSync() và syncCultivation()
    // Giả lập Cloud tăng lên rev 13
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 13,
      state: { realm: 'ngung_khi_4', totalExp: 1400, __meta: { pendingSeconds: 0 } },
      updated_at: 4000,
      device_id: 'dev_other_3'
    });

    const syncRes = await syncCultivation(mockEngine, 'user_test_occ');
    const localPendingAfterSync = parseInt(localStorage.getItem(getCultivationKey('pending_seconds', 'real')), 10);
    const ledgerAfterSync = getSyncLedger();

    assert.equal(localPendingAfterSync, 120, 'pending_seconds qua syncCultivation vẫn không bị xóa!');
    assert.notEqual(ledgerAfterSync.cultivation.lastSyncedPending, 120, 'lastSyncedPending không được ghi 120s khi chưa push!');
  });

  // --------------------------------------------------------------------------
  // TEST 23: Hòa giải pending request trước khi fast-forward khi có tcl_cultivation_pending_request
  // --------------------------------------------------------------------------
  test('Ca 23: Tình huống A commit -> mất ACK -> B commit -> A reload: Không kéo đè, ưu tiên hòa giải qua idempotency key', async () => {
    // 1. Máy A gửi request req_A_lost commit thành công lên rev 11, nhưng mất gói tin ACK
    const frozenPayload = { realm: 'ngung_khi_5', totalExp: 550 };
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 11,
      state: frozenPayload,
      updated_at: 2000,
      device_id: 'dev_A'
    });
    mockEngine.idempotencyLogTable.set('user_test_occ:req_A_lost', {
      user_id: 'user_test_occ',
      idempotency_key: 'req_A_lost',
      committed_rev: 11,
      request_fingerprint: crypto.createHash('md5').update(`10:${JSON.stringify({ ...frozenPayload, __meta: { pendingSeconds: 0 } })}`).digest('hex'),
      created_at: 2000
    });

    // 2. Thiết bị B commit đẩy Cloud lên rev 12
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 12,
      state: { realm: 'ngung_khi_6', totalExp: 650 },
      updated_at: 3000,
      device_id: 'dev_B'
    });

    // 3. Máy A bị reload trang: Trong localStorage của A vẫn còn pending request dở dang
    const pendingSnapshot = {
      idempotencyKey: 'req_A_lost',
      expectedRev: 10,
      sentLocalSeq: 15,
      sentPendingSeconds: 0,
      payloadState: frozenPayload,
      createdAt: 2000
    };
    savePendingCultivationRequest(pendingSnapshot);

    const localState = getCultivationState();
    localState._seq = 15;
    localState._rev = 15;
    localState.totalExp = 550;
    localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(localState));

    const ledger = getSyncLedger();
    ledger.cultivation = { lastSyncedRev: 10, lastSyncedLocalSeq: 14, lastSyncedPending: 0, lastCloudUpdatedAt: 1000 };
    saveSyncLedger(ledger);

    // 4. Khi Máy A khởi động lại và chạy pullCultivationBeforeMeditation:
    // Hệ thống hòa giải trước: xác định req_A_lost ĐÃ commit tại rev 11 -> cập nhật lastSyncedRev = 11, lastSyncedLocalSeq = 15, xóa pendingReq
    // Sau đó thấy Cloud đã lên 12 (từ B) mà local không có mutation mới -> fast-forward an toàn lên 12
    const pullRes = await pullCultivationBeforeMeditation(mockEngine, { timeoutMs: 1000 });

    assert.equal(getPendingCultivationRequest(), null, 'Pending request phải được hòa giải và xóa sạch');
    const ledgerAfterReconcile = getSyncLedger();
    assert.equal(ledgerAfterReconcile.cultivation.lastSyncedRev, 12, 'Cloud rev 12 được fast-forward an toàn sau khi đã hòa giải');

    // 5. TRƯỜNG HỢP A CÓ MUTATION MỚI TRƯỚC KHI HÒA GIẢI XONG:
    // Tái lập: req_A_lost_2 commit rev 13, B commit rev 14, local A phát sinh mutation mới offline (seq = 18 > 17)
    const pendingSnapshot2 = {
      idempotencyKey: 'req_A_lost_2',
      expectedRev: 12,
      sentLocalSeq: 17,
      sentPendingSeconds: 0,
      payloadState: { realm: 'ngung_khi_7', totalExp: 750 },
      createdAt: 4000
    };
    savePendingCultivationRequest(pendingSnapshot2);

    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 14, // Cloud đã lên 14 do B commit
      state: { realm: 'ngung_khi_8', totalExp: 850 },
      updated_at: 5000,
      device_id: 'dev_B'
    });
    mockEngine.idempotencyLogTable.set('user_test_occ:req_A_lost_2', {
      user_id: 'user_test_occ',
      idempotency_key: 'req_A_lost_2',
      committed_rev: 13,
      request_fingerprint: crypto.createHash('md5').update(`12:${JSON.stringify({ realm: 'ngung_khi_7', totalExp: 750, __meta: { pendingSeconds: 0 } })}`).digest('hex'),
      created_at: 4000
    });

    // Local phát sinh thay đổi mới seq = 18
    const localNew = getCultivationState();
    localNew._seq = 18;
    localNew._rev = 18;
    localNew.totalExp = 780;
    saveCultivationState(localNew);

    // Khi chạy syncCultivation:
    const syncRes = await syncCultivation(mockEngine, 'user_test_occ');

    // BẮT BUỘC: Không được kéo đè Cloud 14 vào local! Phải báo CONFLICT để bảo toàn dữ liệu local!
    assert.equal(syncRes.conflict, true);
    assert.equal(syncRes.skipped, true);
    assert.equal(getCultivationState().totalExp, 780, 'Dữ liệu local 780 EXP của A được bảo toàn 100%!');
  });

  // --------------------------------------------------------------------------
  // TEST 24: Reconcile NETWORK ERROR -> cultivation bị tạm dừng, novel/progress vẫn chạy
  // --------------------------------------------------------------------------
  test('Ca 24: Reconcile gặp NETWORK ERROR -> Tạm dừng cultivation, novel/progress vẫn đồng bộ bình thường', async () => {
    // 1. Tạo truyện và tiến độ đọc ở local
    addToLibrary({ id: 'novel_net_err', title: 'Thí Luyện Tu Tiên' });
    saveReadingProgress('novel_net_err', { chapterId: 'chap_10', progress: 0.8, updatedAt: Date.now() });

    // 2. Tạo pending request dở dang cho tu vi
    const pendingReq = {
      idempotencyKey: 'req_net_err_01',
      expectedRev: 5,
      sentLocalSeq: 10,
      sentPendingSeconds: 0,
      payloadState: { realm: 'ngung_khi_5', totalExp: 500 },
      createdAt: Date.now() - 1000,
    };
    savePendingCultivationRequest(pendingReq);

    const localCult = getCultivationState();
    localCult._seq = 10;
    localCult.totalExp = 500;
    saveCultivationState(localCult);

    // 3. Giả lập lỗi mạng khi gọi RPC reconcile
    mockEngine.simulateNetworkErrorOnRpc = true;

    // 4. Chạy runAutoSync
    await runAutoSync(mockEngine, { force: true });

    // BẮT BUỘC:
    // - Pending request VẪN NGUYÊN VẸN, không bị xóa vì chưa rõ kết quả commit
    assert.notEqual(getPendingCultivationRequest(), null, 'Pending request phải được bảo lưu khi gặp lỗi mạng');
    assert.equal(getPendingCultivationRequest().idempotencyKey, 'req_net_err_01');

    // - Local cultivation không bị thay đổi hay ghi đè
    assert.equal(getCultivationState().totalExp, 500);

    // - Tiến độ đọc truyện vẫn được đồng bộ và ghi nhận vào ledger
    const ledger = getSyncLedger();
    assert.ok(ledger.novels && ledger.novels['novel_net_err'], 'Phạm vi progress vẫn được đồng bộ khi cultivation bị tạm dừng');
    assert.ok(ledger.novels['novel_net_err'].lastSyncedProgressAt > 0);
  });

  // --------------------------------------------------------------------------
  // TEST 25: Reconcile MAINTENANCE -> Local và pending request nguyên vẹn
  // --------------------------------------------------------------------------
  test('Ca 25: Reconcile gặp MAINTENANCE -> Local và pending request nguyên vẹn, không push', async () => {
    const pendingReq = {
      idempotencyKey: 'req_maint_01',
      expectedRev: 5,
      sentLocalSeq: 10,
      sentPendingSeconds: 0,
      payloadState: { realm: 'ngung_khi_5', totalExp: 500 },
      createdAt: Date.now() - 1000,
    };
    savePendingCultivationRequest(pendingReq);

    const localCult = getCultivationState();
    localCult._seq = 10;
    localCult.totalExp = 500;
    saveCultivationState(localCult);

    // Bật chế độ bảo trì máy chủ
    mockEngine.setMaintenance(true, 'Máy chủ Supabase đang bảo trì nâng cấp OCC');

    await runAutoSync(mockEngine, { force: true });

    // BẮT BUỘC:
    // - Pending request vẫn còn nguyên
    assert.notEqual(getPendingCultivationRequest(), null);
    assert.equal(getPendingCultivationRequest().idempotencyKey, 'req_maint_01');

    // - Local state nguyên vẹn
    assert.equal(getCultivationState().totalExp, 500);
  });

  // --------------------------------------------------------------------------
  // TEST 26: Reconcile CONFLICT -> Không push cultivation mới, lưu conflict state
  // --------------------------------------------------------------------------
  test('Ca 26: Reconcile gặp CONFLICT -> Không push tu vi mới, lưu và bảo toàn conflict state', async () => {
    // Cloud đã lên rev 8 từ thiết bị khác
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 8,
      state: { realm: 'ngung_khi_8', totalExp: 800 },
      updated_at: Date.now(),
      device_id: 'dev_other',
    });

    // Client gửi expectedRev = 5 (không khớp)
    const pendingReq = {
      idempotencyKey: 'req_conflict_uncommitted',
      expectedRev: 5,
      sentLocalSeq: 10,
      sentPendingSeconds: 0,
      payloadState: { realm: 'ngung_khi_5', totalExp: 500 },
      createdAt: Date.now() - 2000,
    };
    savePendingCultivationRequest(pendingReq);

    const initLedger = getSyncLedger();
    initLedger.lastSyncedAt = 1000;
    initLedger.cultivation = { lastSyncedRev: 5, lastSyncedLocalSeq: 10, lastSyncedPending: 0 };
    saveSyncLedger(initLedger);

    const localCult = getCultivationState();
    localCult._seq = 10;
    localCult._rev = 10;
    localCult.totalExp = 500;
    localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(localCult));

    await runAutoSync(mockEngine, { force: true });

    // BẮT BUỘC:
    // - Xung đột được phát hiện và lưu bền vững
    const conflictState = getCultivationConflictState();
    assert.notEqual(conflictState, null, 'Conflict state phải được ghi nhận');
    assert.equal(getSyncLedger().cultivation.conflictPending, true, 'conflictPending phải bật');

    // - Không push mới làm sai lệch Cloud rev 8
    const cloudRow = mockEngine.cultivationTable.get('user_test_occ');
    assert.equal(cloudRow.rev, 8, 'Cloud rev phải giữ nguyên 8');

    // - Local state 500 EXP không bị mất
    assert.equal(getCultivationState().totalExp, 500);
  });

  // --------------------------------------------------------------------------
  // TEST 27: Reconcile SUCCESS -> Ledger nạp lại từ getSyncLedger(), không bị ledger cũ ghi đè
  // --------------------------------------------------------------------------
  test('Ca 27: Reconcile SUCCESS -> Ledger nạp lại chính xác, không bị ledger cũ từ đầu runAutoSync ghi đè', async () => {
    // Thiết lập ledger cũ ban đầu với lastSyncedRev = 5
    const initLedger = getSyncLedger();
    initLedger.cultivation = { lastSyncedRev: 5, lastSyncedLocalSeq: 10, lastSyncedPending: 0 };
    saveSyncLedger(initLedger);

    const frozenPayload = { realm: 'ngung_khi_6', totalExp: 600 };
    const pendingReq = {
      idempotencyKey: 'req_success_01',
      expectedRev: 5,
      sentLocalSeq: 12,
      sentPendingSeconds: 0,
      payloadState: frozenPayload,
      createdAt: Date.now() - 1000,
    };
    savePendingCultivationRequest(pendingReq);

    // Trên Cloud, request này ĐÃ được commit thành công lên rev 6 (mất ACK)
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 6,
      state: frozenPayload,
      updated_at: 1000,
      device_id: getDeviceId(),
    });
    mockEngine.idempotencyLogTable.set('user_test_occ:req_success_01', {
      user_id: 'user_test_occ',
      idempotency_key: 'req_success_01',
      committed_rev: 6,
      request_fingerprint: crypto.createHash('md5').update(`5:${JSON.stringify({ ...frozenPayload, __meta: { pendingSeconds: 0 } })}`).digest('hex'),
      created_at: 1000,
    });

    const localCult = getCultivationState();
    localCult._seq = 12;
    localCult._rev = 12;
    localCult.totalExp = 600;
    localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(localCult));

    await runAutoSync(mockEngine, { force: true });

    // BẮT BUỘC:
    // - Pending request đã được hòa giải và xóa sạch
    assert.equal(getPendingCultivationRequest(), null);

    // - Ledger sau khi runAutoSync kết thúc phải chứa lastSyncedRev = 6 và lastSyncedLocalSeq = 12
    // KHÔNG được bị ledger cũ (lastSyncedRev = 5) ở đầu hàm ghi đè lại!
    const finalLedger = getSyncLedger();
    assert.equal(finalLedger.cultivation.lastSyncedRev, 6, 'lastSyncedRev phải là 6 từ reconcile SUCCESS');
    assert.equal(finalLedger.cultivation.lastSyncedLocalSeq, 12, 'lastSyncedLocalSeq phải là 12');
  });

  // --------------------------------------------------------------------------
  // TEST 28: A commit -> mất ACK -> B commit -> A reload -> Reconcile SUCCESS -> Không ghi đè local/Cloud
  // --------------------------------------------------------------------------
  test('Ca 28: Kịch bản A commit -> mất ACK -> B commit -> A reload -> Reconcile SUCCESS -> Đọc lại Cloud mới nhất', async () => {
    // 1. A gửi req_A_lost lên Cloud (expectedRev = 10, sentLocalSeq = 15). Cloud commit lên rev 11. A mất ACK.
    const payloadA = { realm: 'ngung_khi_5', totalExp: 500 };
    mockEngine.idempotencyLogTable.set('user_test_occ:req_A_lost', {
      user_id: 'user_test_occ',
      idempotency_key: 'req_A_lost',
      committed_rev: 11,
      request_fingerprint: crypto.createHash('md5').update(`10:${JSON.stringify({ ...payloadA, __meta: { pendingSeconds: 0 } })}`).digest('hex'),
      created_at: 2000,
    });

    // 2. B commit tiếp theo đẩy Cloud lên rev 12
    const payloadB = { realm: 'ngung_khi_6', totalExp: 650 };
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 12,
      state: payloadB,
      updated_at: 3000,
      device_id: 'dev_B',
    });

    // 3. Máy A mở lại trang: Trong localStorage của A vẫn còn pending request dở dang
    const pendingSnapshot = {
      idempotencyKey: 'req_A_lost',
      expectedRev: 10,
      sentLocalSeq: 15,
      sentPendingSeconds: 0,
      payloadState: payloadA,
      createdAt: 2000,
    };
    savePendingCultivationRequest(pendingSnapshot);

    const localA = getCultivationState();
    localA._seq = 15;
    localA._rev = 15;
    localA.totalExp = 500;
    localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(localA));

    const ledgerA = getSyncLedger();
    ledgerA.lastSyncedAt = 1000;
    ledgerA.cultivation = { lastSyncedRev: 10, lastSyncedLocalSeq: 14, lastSyncedPending: 0, lastCloudUpdatedAt: 1000 };
    saveSyncLedger(ledgerA);

    // 4. Chạy runAutoSync trên máy A:
    await runAutoSync(mockEngine, { force: true });

    // BẮT BUỘC:
    // - Pending request đã hòa giải thành công và dọn sạch
    assert.equal(getPendingCultivationRequest(), null);

    // - A đọc lại Cloud cultivation mới nhất (rev 12 của B)
    // - Do A không có mutation mới sau snapshot (seq = 15 <= 15), A fast-forward an toàn lên rev 12
    const finalLedgerA = getSyncLedger();
    assert.equal(finalLedgerA.cultivation.lastSyncedRev, 12, 'A nhận diện Cloud rev 12 sau reconcile');
    assert.equal(getCultivationState().totalExp, 650, 'A fast-forward nhận dữ liệu 650 EXP của B an toàn');

    // 5. NẾU A CÓ MUTATION MỚI TRƯỚC KHI HÒA GIẢI (seq = 16 > 15):
    // Tái lập tình huống: A có mutation mới seq = 16
    const pendingSnapshot2 = {
      idempotencyKey: 'req_A_lost_mutated',
      expectedRev: 12,
      sentLocalSeq: 15,
      sentPendingSeconds: 0,
      payloadState: payloadB,
      createdAt: 4000,
    };
    savePendingCultivationRequest(pendingSnapshot2);

    mockEngine.idempotencyLogTable.set('user_test_occ:req_A_lost_mutated', {
      user_id: 'user_test_occ',
      idempotency_key: 'req_A_lost_mutated',
      committed_rev: 13,
      request_fingerprint: crypto.createHash('md5').update(`12:${JSON.stringify({ ...payloadB, __meta: { pendingSeconds: 0 } })}`).digest('hex'),
      created_at: 4000,
    });

    // Cloud lên rev 14 do B commit
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 14,
      state: { realm: 'ngung_khi_7', totalExp: 800 },
      updated_at: 5000,
      device_id: 'dev_B',
    });

    // Local A có thay đổi mới seq = 16 (700 EXP)
    const localNewA = getCultivationState();
    localNewA._seq = 16;
    localNewA._rev = 16;
    localNewA.totalExp = 700;
    localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(localNewA));

    await runAutoSync(mockEngine, { force: true });

    // BẮT BUỘC: Phát hiện xung đột, KHÔNG ghi đè local 700 EXP hay Cloud 800 EXP!
    assert.equal(getSyncLedger().cultivation.conflictPending, true);
    assert.equal(getCultivationState().totalExp, 700, 'Dữ liệu local 700 EXP của A được bảo toàn 100%!');
    assert.equal(mockEngine.cultivationTable.get('user_test_occ').rev, 14, 'Cloud rev 14 của B được bảo toàn 100%!');
  });

  // --------------------------------------------------------------------------
  // TEST 29: Pending_seconds chưa commit không bị đánh dấu đã đồng bộ
  // --------------------------------------------------------------------------
  test('Ca 29: Pending_seconds chưa commit không bị đánh dấu đã đồng bộ khi fast-forward', async () => {
    // Local có 180 giây chưa sync (lastSyncedPending = 0)
    localStorage.setItem(getCultivationKey('pending_seconds', 'real'), '180');

    const localCult = getCultivationState();
    localCult._seq = 10;
    saveCultivationState(localCult);

    const initLedger = getSyncLedger();
    initLedger.cultivation = { lastSyncedRev: 4, lastSyncedLocalSeq: 10, lastSyncedPending: 0 };
    saveSyncLedger(initLedger);

    // Cloud có rev 5 mới hơn từ thiết bị khác (pendingSeconds = 0)
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 5,
      state: { realm: 'ngung_khi_5', totalExp: 500, __meta: { pendingSeconds: 0 } },
      updated_at: Date.now(),
      device_id: 'dev_other',
    });

    await runAutoSync(mockEngine, { force: true });

    // BẮT BUỘC:
    // - Local pending_seconds vẫn là 180 giây (không bị xóa hay reset)
    const localPendingAfter = parseInt(localStorage.getItem(getCultivationKey('pending_seconds', 'real')) || '0', 10);
    assert.equal(localPendingAfter, 180, '180 giây tu luyện chưa commit phải được bảo lưu');

    // - lastSyncedPending trong ledger VẪN PHẢI LÀ 0 để cờ bẩn tiếp tục bật
    const finalLedger = getSyncLedger();
    assert.equal(finalLedger.cultivation.lastSyncedPending, 0, 'lastSyncedPending không được ghi nhận khi chưa commit');
  });

  // --------------------------------------------------------------------------
  // TEST 30: Trạng thái conflict đã lưu không bị xóa bởi lượt autoSync tiếp theo
  // --------------------------------------------------------------------------
  test('Ca 30: Trạng thái conflict đã lưu không bị xóa bởi một lượt autoSync tiếp theo chưa giải quyết', async () => {
    // 1. Tạo trạng thái conflict từ trước
    const conflictData = {
      local: { realm: 'ngung_khi_5', totalExp: 500 },
      cloud: { rev: 8, state: { realm: 'ngung_khi_6', totalExp: 600 } },
      detectedAt: Date.now() - 5000,
    };
    setCultivationConflictState(conflictData);

    const ledger = getSyncLedger();
    ledger.cultivation = { lastSyncedRev: 5, lastSyncedLocalSeq: 10, conflictPending: true };
    saveSyncLedger(ledger);

    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 8,
      state: conflictData.cloud.state,
      updated_at: Date.now(),
      device_id: 'dev_other',
    });

    // 2. Chạy autoSync định kỳ tiếp theo khi user chưa giải quyết conflict
    await runAutoSync(mockEngine, { force: true });

    // BẮT BUỘC:
    // - getCultivationConflictState() KHÔNG bị xóa
    const conflictAfter = getCultivationConflictState();
    assert.notEqual(conflictAfter, null, 'Trạng thái xung đột không được tự xóa');
    assert.equal(conflictAfter.local.totalExp, 500);

    // - ledger.cultivation.conflictPending vẫn là true
    assert.equal(getSyncLedger().cultivation.conflictPending, true);

    // - Không push, không kéo đè
    assert.equal(mockEngine.cultivationTable.get('user_test_occ').rev, 8);
  });

  // --------------------------------------------------------------------------
  // TEST 31: Fail-closed khi Reconcile SUCCESS nhưng Cloud refresh gặp Network Error
  // --------------------------------------------------------------------------
  test('Ca 31: Fail-closed khi Reconcile SUCCESS nhưng Cloud refresh gặp Network Error -> Tạm dừng cultivation, novel/progress vẫn chạy', async () => {
    addToLibrary({ id: 'novel_fail_closed_1', title: 'Tu Tiên Ký' });
    saveReadingProgress('novel_fail_closed_1', { chapterId: 'chap_1', progress: 0.5, updatedAt: Date.now() });

    const frozenPayload = { realm: 'ngung_khi_6', totalExp: 600 };
    const pendingReq = {
      idempotencyKey: 'req_fail_closed_01',
      expectedRev: 5,
      sentLocalSeq: 12,
      sentPendingSeconds: 0,
      payloadState: frozenPayload,
      createdAt: Date.now() - 1000,
    };
    savePendingCultivationRequest(pendingReq);

    // Cloud đã commit thành công lên rev 6
    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 6,
      state: frozenPayload,
      updated_at: 1000,
      device_id: getDeviceId(),
    });
    mockEngine.idempotencyLogTable.set('user_test_occ:req_fail_closed_01', {
      user_id: 'user_test_occ',
      idempotency_key: 'req_fail_closed_01',
      committed_rev: 6,
      request_fingerprint: crypto.createHash('md5').update(`5:${JSON.stringify({ ...frozenPayload, __meta: { pendingSeconds: 0 } })}`).digest('hex'),
      created_at: 1000,
    });

    const initLedger = getSyncLedger();
    initLedger.lastSyncedAt = 1000;
    initLedger.cultivation = { lastSyncedRev: 5, lastSyncedLocalSeq: 10, lastSyncedPending: 0 };
    saveSyncLedger(initLedger);

    const localCult = getCultivationState();
    localCult._seq = 12;
    localCult._rev = 12;
    localCult.totalExp = 600;
    localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify(localCult));

    // Giả lập: sau khi reconcile thành công, bước fetch Cloud cultivation gặp lỗi mạng
    mockEngine.simulateFetchCultivationError = true;

    await runAutoSync(mockEngine, { force: true });

    // BẮT BUỘC (Fail-closed):
    // - Pending request đã được dọn sạch bởi reconcile
    assert.equal(getPendingCultivationRequest(), null);

    // - Novel reading progress vẫn hoàn tất đồng bộ bình thường
    const ledger = getSyncLedger();
    assert.ok(ledger.novels && ledger.novels['novel_fail_closed_1']);

    // - Cultivation state local được giữ nguyên an toàn
    assert.equal(getCultivationState().totalExp, 600);
  });

  // --------------------------------------------------------------------------
  // TEST 32: Fail-closed khi Reconcile SUCCESS nhưng Cloud trả về missing row
  // --------------------------------------------------------------------------
  test('Ca 32: Fail-closed khi Reconcile SUCCESS nhưng Cloud trả về missing row -> Tạm dừng cultivation an toàn', async () => {
    const frozenPayload = { realm: 'ngung_khi_6', totalExp: 600 };
    const pendingReq = {
      idempotencyKey: 'req_fail_closed_02',
      expectedRev: 5,
      sentLocalSeq: 12,
      sentPendingSeconds: 0,
      payloadState: frozenPayload,
      createdAt: Date.now() - 1000,
    };
    savePendingCultivationRequest(pendingReq);

    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 6,
      state: frozenPayload,
      updated_at: 1000,
      device_id: getDeviceId(),
    });
    mockEngine.idempotencyLogTable.set('user_test_occ:req_fail_closed_02', {
      user_id: 'user_test_occ',
      idempotency_key: 'req_fail_closed_02',
      committed_rev: 6,
      request_fingerprint: crypto.createHash('md5').update(`5:${JSON.stringify({ ...frozenPayload, __meta: { pendingSeconds: 0 } })}`).digest('hex'),
      created_at: 1000,
    });

    const initLedger = getSyncLedger();
    initLedger.lastSyncedAt = 1000;
    saveSyncLedger(initLedger);

    // Giả lập Cloud trả về missing row
    mockEngine.simulateMissingCloudCultivation = true;

    await runAutoSync(mockEngine, { force: true });

    // Pending request đã dọn sạch, local an toàn không crash
    assert.equal(getPendingCultivationRequest(), null);
  });

  // --------------------------------------------------------------------------
  // TEST 33: Fail-closed khi Reconcile SUCCESS nhưng Cloud trả về stale revision
  // --------------------------------------------------------------------------
  test('Ca 33: Fail-closed khi Reconcile SUCCESS nhưng Cloud trả về stale revision (< committedRev) -> Tạm dừng', async () => {
    const frozenPayload = { realm: 'ngung_khi_6', totalExp: 600 };
    const pendingReq = {
      idempotencyKey: 'req_fail_closed_03',
      expectedRev: 5,
      sentLocalSeq: 12,
      sentPendingSeconds: 0,
      payloadState: frozenPayload,
      createdAt: Date.now() - 1000,
    };
    savePendingCultivationRequest(pendingReq);

    mockEngine.cultivationTable.set('user_test_occ', {
      user_id: 'user_test_occ',
      rev: 6,
      state: frozenPayload,
      updated_at: 1000,
      device_id: getDeviceId(),
    });
    mockEngine.idempotencyLogTable.set('user_test_occ:req_fail_closed_03', {
      user_id: 'user_test_occ',
      idempotency_key: 'req_fail_closed_03',
      committed_rev: 6,
      request_fingerprint: crypto.createHash('md5').update(`5:${JSON.stringify({ ...frozenPayload, __meta: { pendingSeconds: 0 } })}`).digest('hex'),
      created_at: 1000,
    });

    const initLedger = getSyncLedger();
    initLedger.lastSyncedAt = 1000;
    saveSyncLedger(initLedger);

    // Giả lập đọc trúng replica bị trễ: rev = 5 < committedRev 6
    mockEngine.simulateStaleCloudRev = 5;

    await runAutoSync(mockEngine, { force: true });

    // BẮT BUỘC: Không dùng stale snapshot này để fast-forward local
    assert.equal(getPendingCultivationRequest(), null);
  });

  // --------------------------------------------------------------------------
  // TEST 34: Stage A hoàn toàn độc lập, loại bỏ hoàn toàn rollback mở lại direct write
  // --------------------------------------------------------------------------
  test('Ca 34: Kiểm tra cô lập Stage A & B - Loại bỏ hoàn toàn rollback mở blind upsert', () => {
    const migrationsDir = path.resolve('supabase/migrations');
    const operationsDir = path.resolve('supabase/operations');

    const migrationFiles = fs.readdirSync(migrationsDir);
    assert.ok(migrationFiles.includes('20261120_cultivation_occ_stage_a.sql'), 'Migration A phải có mặt trong supabase/migrations');

    const hasCutoverInMigrations = migrationFiles.some(f => f.includes('cutover') || f.includes('stage_b'));
    assert.equal(hasCutoverInMigrations, false, 'TUYỆT ĐỐI không được có Stage B cutover trong supabase/migrations');

    const operationFiles = fs.readdirSync(operationsDir);
    assert.ok(operationFiles.includes('20261120_cultivation_occ_stage_b_cutover.sql'), 'Stage B cutover phải nằm trong supabase/operations');

    // Kiểm tra loại bỏ hoàn toàn rollback GRANT INSERT, UPDATE trong cả file guide và operations
    const guidePath = path.resolve('docs/DEPLOY_OCC_STAGING_GUIDE.md');
    const guideContent = fs.readFileSync(guidePath, 'utf-8');
    assert.equal(guideContent.includes('GRANT INSERT, UPDATE ON TABLE public.cultivation TO authenticated'), false, 'Guide không được chứa rollback GRANT INSERT, UPDATE');
    assert.ok(guideContent.includes('Safe Maintenance Mode'), 'Guide phải sử dụng Safe Maintenance Mode làm cơ chế dừng ghi');

    // Không được chứa hướng dẫn INSERT trực tiếp vào supabase_migrations.schema_migrations
    assert.equal(guideContent.includes('INSERT INTO supabase_migrations.schema_migrations'), false, 'Tuyệt đối không hướng dẫn INSERT trực tiếp vào schema_migrations');
    assert.ok(guideContent.includes('supabase migration repair'), 'Phải hướng dẫn dùng supabase migration repair chính thức');

    const cutoverSqlPath = path.resolve('supabase/operations/20261120_cultivation_occ_stage_b_cutover.sql');
    const cutoverContent = fs.readFileSync(cutoverSqlPath, 'utf-8');
    assert.equal(cutoverContent.includes('GRANT INSERT, UPDATE ON TABLE public.cultivation TO authenticated'), false, 'Cutover SQL không được chứa rollback GRANT INSERT, UPDATE');
    assert.ok(cutoverContent.includes('cultivation_maintenance'), 'Cutover SQL phải hướng dẫn dùng cờ cultivation_maintenance');
  });

  // --------------------------------------------------------------------------
  // TEST 35: Script test an toàn: không tự thay đổi maintenance, kiểm tra môi trường cô lập
  // --------------------------------------------------------------------------
  test('Ca 35: Script test an toàn - Không tự thay đổi maintenance, khớp schema và kiểm tra môi trường', () => {
    const sqlPath = path.resolve('scripts/test-postgres-sql-editor.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf-8');

    // Không được chứa cột description trong app_system_flags
    assert.equal(sqlContent.includes('description'), false, 'Không được chứa cột description trong app_system_flags');

    // Phải có kiểm tra chống chạy trên database production
    assert.ok(sqlContent.includes("current_database() ILIKE '%prod%'"), 'Phải có kiểm tra bảo vệ database production');

    // Phải có lưu và khôi phục cờ maintenance ban đầu
    assert.ok(sqlContent.includes('v_orig_maintenance'), 'Phải lưu trạng thái cờ maintenance ban đầu');

    // Phải có RAISE EXCEPTION thực sự khi assertion sai
    assert.ok(sqlContent.includes('RAISE EXCEPTION'), 'Phải dùng RAISE EXCEPTION cho assertion');

    // Kiểm tra scripts/test-postgres-concurrent-psql.mjs tuân thủ P1:
    const psqlPath = path.resolve('scripts/test-postgres-concurrent-psql.mjs');
    const psqlContent = fs.readFileSync(psqlPath, 'utf-8');

    // Không được tự ý UPDATE app_system_flags
    assert.equal(psqlContent.includes('UPDATE public.app_system_flags'), false, 'Tuyệt đối không tự ý UPDATE app_system_flags');

    // Phải báo cáo rõ [SKIPPED] khi thiếu DATABASE_URL hoặc khi staging bật maintenance
    assert.ok(psqlContent.includes('[SKIPPED]'), 'Phải báo cáo SKIPPED rõ ràng, không báo PASS giả');
    assert.ok(psqlContent.includes('TUYỆT ĐỐI KHÔNG TÍNH LÀ PASS'), 'Phải nêu rõ không tính là PASS');

    // Phải có kiểm tra cờ cultivation_maintenance và dừng nếu đang bảo trì
    assert.ok(psqlContent.includes('cultivation_maintenance'), 'Phải kiểm tra cờ cultivation_maintenance');
    assert.ok(psqlContent.includes('maintRes.rows[0].value?.enabled === true'), 'Phải kiểm tra trạng thái enabled');

    // Phải có kiểm tra độc lập danh tính database trước mọi thao tác thay đổi dữ liệu
    assert.ok(psqlContent.includes('SELECT current_database() AS dbname'), 'Phải kiểm tra độc lập danh tính database');
    assert.ok(psqlContent.includes('TEST_ENVIRONMENT_IDENTIFIER'), 'Phải yêu cầu TEST_ENVIRONMENT_IDENTIFIER');
    assert.ok(psqlContent.includes("current_setting('app.environment'"), 'Phải truy vấn setting môi trường của database');
  });
});
