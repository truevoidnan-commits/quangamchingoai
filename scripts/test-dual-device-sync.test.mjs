import assert from 'node:assert/strict';
import { test, describe, beforeEach, afterEach } from 'node:test';

// -------------------------------------------------------------
// 1. MOCK ENVIRONMENT (localStorage, window, document, IndexedDB)
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

global.IDBKeyRange = {
  bound: (lower, upper) => ({ lower, upper }),
  only: (val) => ({ lower: val, upper: val }),
};

const windowEventListeners = {};
const documentEventListeners = {};

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
  addEventListener: (event, handler) => {
    if (!documentEventListeners[event]) documentEventListeners[event] = [];
    documentEventListeners[event].push(handler);
  },
  removeEventListener: (event, handler) => {
    if (documentEventListeners[event]) {
      documentEventListeners[event] = documentEventListeners[event].filter(h => h !== handler);
    }
  },
  dispatchEvent: (evt) => {
    const handlers = documentEventListeners[evt.type] || [];
    handlers.forEach(h => h(evt));
    return true;
  },
};

try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true },
    configurable: true,
    writable: true,
  });
} catch {
  // If navigator is already defined
}

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

  transaction(storeNames) {
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
                let targetNovelId = range?.lower || range;
                if (Array.isArray(targetNovelId)) targetNovelId = targetNovelId[0];
                let count = 0;
                for (const ch of self.chapters.values()) {
                  if (ch.novelId === targetNovelId) count++;
                }
                return count;
              },
              async getAll(range) {
                let targetNovelId = range?.lower || range;
                if (Array.isArray(targetNovelId)) targetNovelId = targetNovelId[0];
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

// -------------------------------------------------------------
// 2. MOCK SUPABASE CLIENT
// -------------------------------------------------------------

class MockSupabaseClient {
  constructor(userId = 'test_user_uuid') {
    this.userId = userId;
    this.tables = {
      novels: new Map(),       // key: user_id:id -> row
      progress: new Map(),     // key: user_id:novel_id -> row
      cultivation: new Map(),  // key: user_id -> row
      user_settings: new Map(),// key: user_id -> row
    };
    this.storageBuckets = {
      novels: new Map(), // key: path -> Blob / Buffer
    };
    this.upsertLog = []; // track upsert calls with timestamp and payload

    this.auth = {
      async getSession() {
        return {
          data: {
            session: {
              user: { id: userId, email: 'test@thiencolau.vn' },
            },
          },
          error: null,
        };
      },
    };

    const self = this;
    this.storage = {
      from(bucketName) {
        const bucket = self.storageBuckets[bucketName] || new Map();
        self.storageBuckets[bucketName] = bucket;
        return {
          async upload(path, blob, options = {}) {
            bucket.set(path, blob);
            return { data: { path }, error: null };
          },
          async download(path) {
            if (!bucket.has(path)) {
              return { data: null, error: new Error('File not found in bucket') };
            }
            return { data: bucket.get(path), error: null };
          },
          async remove(paths) {
            for (const p of paths) bucket.delete(p);
            return { data: paths, error: null };
          },
        };
      },
    };
  }

  from(tableName) {
    const table = this.tables[tableName] || new Map();
    this.tables[tableName] = table;
    const self = this;

    const builder = {
      filters: [],
      selectCols: '*',
      isSingle: false,
      pendingUpdate: null,

      select(cols = '*') {
        builder.selectCols = cols;
        return builder;
      },
      eq(col, val) {
        builder.filters.push({ col, val, op: 'eq' });
        return builder;
      },
      lt(col, val) {
        builder.filters.push({ col, val, op: 'lt' });
        return builder;
      },
      single() {
        builder.isSingle = true;
        return builder;
      },
      update(updates) {
        builder.pendingUpdate = updates;
        return builder;
      },
      async then(resolve, reject) {
        try {
          let rows = Array.from(table.entries());
          for (const f of builder.filters) {
            if (f.op === 'lt') {
              rows = rows.filter(([k, r]) => (r[f.col] || 0) < f.val);
            } else {
              rows = rows.filter(([k, r]) => r[f.col] === f.val);
            }
          }
          if (builder.pendingUpdate) {
            for (const [k, r] of rows) {
              table.set(k, { ...r, ...builder.pendingUpdate });
            }
            return resolve({ data: builder.pendingUpdate, error: null });
          }
          const selectedColsList = builder.selectCols && builder.selectCols !== '*'
            ? builder.selectCols.split(',').map(c => c.trim())
            : null;

          const dataRows = rows.map(([k, r]) => {
            if (!selectedColsList) return { ...r };
            const projected = {};
            for (const col of selectedColsList) {
              projected[col] = r[col];
            }
            return projected;
          });
          if (builder.isSingle) {
            resolve({ data: dataRows[0] || null, error: null });
          } else {
            resolve({ data: dataRows, error: null });
          }
        } catch (e) {
          reject(e);
        }
      },
      async upsert(rowOrRows, options = {}) {
        const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        for (const row of rows) {
          let key;
          if (tableName === 'novels') key = `${row.user_id}:${row.id}`;
          else if (tableName === 'progress') key = `${row.user_id}:${row.novel_id}`;
          else if (tableName === 'cultivation') key = `${row.user_id}`;
          else if (tableName === 'user_settings') key = `${row.user_id}`;
          else key = `${row.user_id || 'default'}`;

          self.upsertLog.push({
            table: tableName,
            key,
            row: JSON.parse(JSON.stringify(row)),
            time: Date.now(),
          });

          table.set(key, { ...(table.get(key) || {}), ...row });
        }
        return { data: rowOrRows, error: null };
      },
      async insert(rowOrRows) {
        const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        for (const row of rows) {
          let key;
          if (tableName === 'progress') key = `${row.user_id}:${row.novel_id}`;
          else key = `${row.user_id}:${row.id || 'default'}`;

          if (table.has(key)) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          }
          table.set(key, { ...row });
        }
        return { data: rowOrRows, error: null };
      },
    };
    return builder;
  }

  async rpc(funcName, params) {
    if (funcName === 'sync_cultivation_occ') {
      const { p_expected_rev, p_state, p_updated_at, p_device_id } = params;
      const uid = this.userId || 'user_123';
      const current = this.tables.cultivation.get(uid);
      if (current && current.rev !== p_expected_rev) {
        return {
          data: {
            status: 'CONFLICT',
            reason: 'REV_MISMATCH',
            expected_rev: p_expected_rev,
            current_cloud: { ...current },
          },
          error: null,
        };
      }
      const newRev = current ? current.rev + 1 : 1;
      const updatedRow = {
        user_id: uid,
        rev: newRev,
        state: p_state,
        updated_at: p_updated_at,
        device_id: p_device_id,
      };
      this.tables.cultivation.set(uid, updatedRow);
      return {
        data: {
          status: 'SUCCESS',
          rev: newRev,
          updated_at: p_updated_at,
        },
        error: null,
      };
    }
    return { data: null, error: { message: `Function ${funcName} not found` } };
  }
}

// -------------------------------------------------------------
// 3. IMPORTS TỪ DỰ ÁN THIÊN CƠ LÂU
// -------------------------------------------------------------

import { setHostOverrideForTesting } from '../src/lib/sync/envProtection.js';
import {
  runAutoSync,
  setAutoSyncEnabled,
  releaseSyncLock,
  resetBackoff,
  setCachedUserIdForTesting,
  initAutoSync,
} from '../src/lib/sync/autoSync.js';
import {
  syncReadingProgress,
  syncCultivation,
  pushNovelToCloud,
} from '../src/lib/sync/syncEngine.js';
import {
  saveReadingProgress,
  getReadingProgress,
  addToLibrary,
  getLibrary,
} from '../src/lib/storage.js';
import {
  saveCultivationState,
  getCultivationState,
  getCultivationKey,
  setActiveProfile,
} from '../src/lib/cultivation.js';
import {
  getSyncLedger,
  saveSyncLedger,
  markNovelDirty,
  DEVICE_ID_KEY,
} from '../src/lib/sync/syncLedger.js';
import {
  setDBPromiseForTesting,
  saveNovel,
  saveChaptersBulk,
} from '../src/lib/db.js';

setDBPromiseForTesting(Promise.resolve(mockDB));
setHostOverrideForTesting('quangamchingoai.github.io');
setAutoSyncEnabled(true);
setActiveProfile('real');
setCachedUserIdForTesting('user_123');

// -------------------------------------------------------------
// 4. BỘ MÔ PHỎNG THIẾT BỊ ĐỘC LẬP (Device Simulation Manager)
// -------------------------------------------------------------

let activeSimulatedDevice = null;
const realDateNow = Date.now;

class SimulatedDevice {
  constructor(name, deviceId, sharedSupabase) {
    this.name = name;
    this.deviceId = deviceId;
    this.supabase = sharedSupabase;
    this.storageStore = {};
    this.novels = new Map();
    this.chapters = new Map();
    this.clockOffset = 0; // ms offset
  }

  now() {
    return realDateNow() + this.clockOffset;
  }

  activate() {
    activeSimulatedDevice = this;
    releaseSyncLock();
    resetBackoff();

    // Map global localStorage proxy to this device's storageStore
    global.localStorage.store = this.storageStore;
    global.localStorage.setItem(DEVICE_ID_KEY, this.deviceId);

    // Map IndexedDB
    mockDB.novels = this.novels;
    mockDB.chapters = this.chapters;
  }
}

// Override Date.now() to allow per-device clock skew simulation
Date.now = () => {
  return activeSimulatedDevice ? activeSimulatedDevice.now() : realDateNow();
};

// -------------------------------------------------------------
// 5. TEST SUITE: PHÂN TÍCH & TÁI HIỆN CÁC TÌNH HUỐNG ĐỒNG BỘ HAI THIẾT BỊ
// -------------------------------------------------------------

describe('Đồng bộ hai thiết bị (Thiết bị A - Laptop vs Thiết bị B - Mobile)', () => {
  let supabaseMock;
  let devA;
  let devB;

  beforeEach(() => {
    supabaseMock = new MockSupabaseClient('user_123');
    devA = new SimulatedDevice('Laptop', 'dev_laptop_111', supabaseMock);
    devB = new SimulatedDevice('Mobile', 'dev_mobile_222', supabaseMock);
    setCachedUserIdForTesting('user_123');
  });

  afterEach(() => {
    releaseSyncLock();
    resetBackoff();
    if (devA) devA.clockOffset = 0;
    if (devB) devB.clockOffset = 0;
  });

  // =========================================================================
  // CA 1: Hai thiết bị cùng tăng EXP / cảnh giới khi OFFLINE -> Tuần tự đồng bộ
  // =========================================================================
  test('Ca 1: Offline Divergence - Cả hai thiết bị cùng tăng EXP/cảnh giới khi offline -> Phát hiện xung đột an toàn nhưng không có cơ chế gộp EXP', async () => {
    // Cloud ban đầu: rev 10, totalExp: 1000, realm: ngung_khi_1
    supabaseMock.tables.cultivation.set('user_123', {
      user_id: 'user_123',
      rev: 10,
      updated_at: Date.now(),
      device_id: 'dev_laptop_111',
      state: { realm: 'ngung_khi_1', totalExp: 1000, _rev: 10 },
    });

    // Cả hai thiết bị ban đầu đều đã đồng bộ rev 10
    for (const d of [devA, devB]) {
      d.activate();
      global.localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify({
        realm: 'ngung_khi_1', totalExp: 1000, _rev: 10,
      }));
      saveSyncLedger({
        novels: {},
        cultivation: { lastSyncedRev: 10, lastCloudUpdatedAt: Date.now() },
        lastSyncedAt: Date.now(),
      });
    }

    // Thiết bị A tu luyện offline: tăng 100 EXP -> rev 11, totalExp: 1100
    devA.activate();
    const stateA = getCultivationState();
    stateA.totalExp += 100;
    saveCultivationState(stateA); // _rev tăng thành 11

    // Thiết bị B đột phá offline: tăng 250 EXP, đổi realm -> rev 11, totalExp: 1250, realm: ngung_khi_2
    devB.activate();
    const stateB = getCultivationState();
    stateB.totalExp += 250;
    stateB.realm = 'ngung_khi_2';
    saveCultivationState(stateB); // _rev tăng thành 11

    // Thiết bị A kết nối mạng và sync trước
    devA.activate();
    const syncResA = await runAutoSync(supabaseMock);
    assert.strictEqual(syncResA.success, true, 'Thiết bị A phải đồng bộ thành công');

    const cloudAfterA = supabaseMock.tables.cultivation.get('user_123');
    assert.strictEqual(cloudAfterA.rev, 11, 'Cloud rev phải được nâng lên 11 từ A');
    assert.strictEqual(cloudAfterA.state.totalExp, 1100, 'Cloud phải ghi nhận 1100 EXP từ A');

    // Thiết bị B kết nối mạng và sync sau
    devB.activate();
    const syncResB = await runAutoSync(supabaseMock);

    // KẾT QUẢ KIỂM TRA:
    // autoSync phát hiện cả Cloud rev tăng (11 > 10) và Local rev tăng (11 > 10)
    assert.strictEqual(syncResB.attention, true, 'Thiết bị B phải bật cờ attention để bảo vệ dữ liệu');
    assert.strictEqual(syncResB.reason, 'cultivation_conflict', 'Lý do phải là cultivation_conflict');

    // Đảm bảo không bên nào tự ý ghi đè mù bên kia
    const localAfterB = getCultivationState();
    assert.strictEqual(localAfterB.realm, 'ngung_khi_2', 'Thiết bị B vẫn giữ nguyên tiến độ cục bộ');
    const cloudCurrent = supabaseMock.tables.cultivation.get('user_123');
    assert.strictEqual(cloudCurrent.state.totalExp, 1100, 'Cloud không bị B âm thầm ghi đè');
  });

  // =========================================================================
  // CA 2: TÌNH HUỐNG ĐẶC BIỆT (MỤC 5) - Hai thiết bị cùng đọc 1 revision trước khi lần lượt upsert
  // =========================================================================
  test('Ca 2 (Mục 5): RACE CONDITION - Hai thiết bị cùng đọc 1 revision trước khi upsert -> LOST UPDATE do thiếu OCC trên Supabase', async () => {
    // Cloud ban đầu: rev 10, totalExp: 1000
    supabaseMock.tables.cultivation.set('user_123', {
      user_id: 'user_123',
      rev: 10,
      updated_at: 1000,
      device_id: 'dev_laptop_111',
      state: { realm: 'ngung_khi_1', totalExp: 1000, _rev: 10 },
    });

    // Cả hai thiết bị cùng có lastSyncedRev = 10
    for (const d of [devA, devB]) {
      d.activate();
      global.localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify({
        realm: 'ngung_khi_1', totalExp: 1000, _rev: 10,
      }));
      saveSyncLedger({
        novels: {},
        cultivation: { lastSyncedRev: 10, lastCloudUpdatedAt: 1000 },
        lastSyncedAt: 1000,
      });
    }

    // Thiết bị A tu luyện: EXP 1100, rev 11
    devA.activate();
    const stateA = getCultivationState();
    stateA.totalExp = 1100;
    saveCultivationState(stateA);

    // Thiết bị B tu luyện: EXP 1200, rev 11
    devB.activate();
    const stateB = getCultivationState();
    stateB.totalExp = 1200;
    saveCultivationState(stateB);

    // MÔ PHỎNG ĐỒNG THỜI (SIMULTANEOUS READ):
    // 1. Thiết bị A đọc Cloud: nhận được rev 10.
    // Vì cloudRev (10) === lastSyncedRev (10) và localRev (11) > lastSyncedRev (10),
    // Thiết bị A xác định an toàn để push!
    devA.activate();
    const readCloudForA = await supabaseMock.from('cultivation').select('*').eq('user_id', 'user_123').single();
    assert.strictEqual(readCloudForA.data.rev, 10);

    // 2. Thiết bị B cũng đọc Cloud ngay tại thời điểm đó (trước khi A kịp upsert):
    // Thiết bị B cũng nhận được rev 10!
    devB.activate();
    const readCloudForB = await supabaseMock.from('cultivation').select('*').eq('user_id', 'user_123').single();
    assert.strictEqual(readCloudForB.data.rev, 10);

    // 3. Thiết bị A gửi upsert lên Supabase:
    devA.activate();
    await supabaseMock.from('cultivation').upsert({
      user_id: 'user_123',
      state: { ...stateA, __meta: { pendingSeconds: 0 } },
      rev: stateA._rev,
      updated_at: 2000,
      device_id: devA.deviceId,
    }, { onConflict: 'user_id' });
    const ledgerA = getSyncLedger();
    ledgerA.cultivation.lastSyncedRev = stateA._rev;
    saveSyncLedger(ledgerA);

    // Lúc này Cloud đã có dữ liệu của A: rev 11, totalExp: 1100
    assert.strictEqual(supabaseMock.tables.cultivation.get('user_123').state.totalExp, 1100);

    // 4. Thiết bị B gửi upsert lên Supabase ngay sau đó (vì B đã đọc Cloud trước đó và tin rằng mình an toàn):
    devB.activate();
    await supabaseMock.from('cultivation').upsert({
      user_id: 'user_123',
      state: { ...stateB, __meta: { pendingSeconds: 0 } },
      rev: stateB._rev,
      updated_at: 2005,
      device_id: devB.deviceId,
    }, { onConflict: 'user_id' });
    const ledgerB = getSyncLedger();
    ledgerB.cultivation.lastSyncedRev = stateB._rev;
    saveSyncLedger(ledgerB);

    // 5. HẬU QUẢ: Dữ liệu của A trên Cloud bị B ghi đè hoàn toàn!
    const cloudFinal = supabaseMock.tables.cultivation.get('user_123');
    assert.strictEqual(cloudFinal.state.totalExp, 1200, 'Cloud đã bị B ghi đè thành 1200');
    assert.strictEqual(cloudFinal.device_id, 'dev_mobile_222', 'Cloud device_id bị chuyển sang Mobile');

    // 6. PHÂN TÍCH HỆ QUẢ NGHIÊM TRỌNG HƠN:
    // Khi Thiết bị A sync lại ở chu kỳ tiếp theo:
    devA.activate();
    const followUpSyncA = await runAutoSync(supabaseMock);

    // Thiết bị A thấy: cloudRev (11) === lastSyncedRev (11), localRev (11) === lastSyncedRev (11)
    // -> Không có cờ xung đột nào được bật!
    assert.strictEqual(followUpSyncA.attention, undefined, 'Thiết bị A KHÔNG phát hiện xung đột vì rev bằng nhau');
    const localStateAfterA = getCultivationState();
    // Thiết bị A vẫn giữ 1100 EXP cục bộ, trong khi Cloud lưu 1200 EXP của B.
    // Hai thiết bị vĩnh viễn phân mảnh dữ liệu âm thầm (Silent Divergence)!
    assert.strictEqual(localStateAfterA.totalExp, 1100, 'A vẫn giữ 1100 EXP và không biết Cloud đã bị mất bản ghi của mình');
  });

  // =========================================================================
  // CA 3: BẢO VỆ DỮ LIỆU - Quick Push (Tab hide / Page hide) KHÔNG ĐƯỢC ghi đè Cloud rev cao (Đã fix ở PR #3)
  // =========================================================================
  test('Ca 3 (Đã fix 3A): BẢO VỆ DỮ LIỆU - Tab hide trên thiết bị mang rev cũ KHÔNG ghi đè Cloud có revision cao hơn', async () => {
    // Thiết bị B đã dùng 1 tuần, đạt Kim Đan, rev 50 trên Cloud
    supabaseMock.tables.cultivation.set('user_123', {
      user_id: 'user_123',
      rev: 50,
      updated_at: 500000,
      device_id: 'dev_mobile_222',
      state: { realm: 'kim_dan', totalExp: 50000, _rev: 50 },
    });

    // Thiết bị A mở lên sau 1 tuần offline, ledger cũ lưu lastSyncedRev = 10, localRev = 10 (Ngưng Khí)
    devA.activate();
    global.localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify({
      realm: 'ngung_khi_1', totalExp: 1000, _rev: 10,
    }));
    saveSyncLedger({
      novels: {},
      cultivation: { lastSyncedRev: 10, lastCloudUpdatedAt: 10000 },
      lastSyncedAt: 10000,
    });

    // Người dùng trên A đọc 1 đoạn truyện, tu vi tăng nhẹ 5 EXP -> localRev thành 11
    const stateA = getCultivationState();
    stateA.totalExp += 5;
    saveCultivationState(stateA); // _rev = 11

    // Người dùng chuyển tab / ẩn trình duyệt trên A -> kích hoạt initAutoSync event handler 'pagehide'
    initAutoSync(supabaseMock);
    global.window.dispatchEvent(new Event('pagehide'));

    // Chờ microtasks hoàn thành
    await new Promise(r => setTimeout(r, 100));

    // KẾT QUẢ KỲ VỌNG SAU KHI SỬA NHIỆM VỤ 3A:
    // Quick Push phát hiện rủi ro và bỏ qua việc ghi đè (bypassed).
    // Cloud rev 50 (Kim Đan) TUYỆT ĐỐI KHÔNG BỊ GHI ĐÈ lùi về rev 11!
    const cloudProtected = supabaseMock.tables.cultivation.get('user_123');

    assert.strictEqual(cloudProtected.rev, 50, 'Cloud rev 50 phải được bảo vệ an toàn, không bị lùi về 11');
    assert.strictEqual(cloudProtected.state.realm, 'kim_dan', 'Cảnh giới Kim Đan trên Cloud phải được bảo toàn');
    assert.strictEqual(cloudProtected.state.totalExp, 50000, 'EXP 50,000 trên Cloud phải được bảo toàn');

    // Dữ liệu cục bộ trên Thiết bị A vẫn giữ nguyên
    const localA = getCultivationState();
    assert.strictEqual(localA._rev, 11, 'Local _rev 11 vẫn được lưu giữ bền vững trên máy A');
    assert.strictEqual(localA.totalExp, 1005, 'Local EXP 1005 vẫn được giữ nguyên');
  });

  // =========================================================================
  // CA 4: Đồng bộ Tiến độ đọc hai thiết bị đọc các chương khác nhau (Tuần tự chuẩn)
  // =========================================================================
  test('Ca 4: Tiến độ đọc tuần tự - Thiết bị A đọc Ch 5 -> B nhận Ch 5 và đọc tiếp Ch 10 -> A nhận Ch 10', async () => {
    addToLibrary({ id: 'nov_1', title: 'Truyện Test', chapterCount: 50 });

    // Thiết bị A đọc Chương 5 (updatedAt = 1000)
    devA.activate();
    saveReadingProgress('nov_1', { chapterId: 'ch_5', percent: 50, updatedAt: 1000 });
    const syncResA = await syncReadingProgress(supabaseMock, 'user_123', ['nov_1']);
    assert.strictEqual(syncResA.progressPushed, 1, 'Thiết bị A phải đẩy tiến độ Ch 5 lên Cloud');

    // Thiết bị B mở app và sync: phải kéo về Ch 5
    devB.activate();
    addToLibrary({ id: 'nov_1', title: 'Truyện Test', chapterCount: 50 });
    const syncResB1 = await syncReadingProgress(supabaseMock, 'user_123', ['nov_1']);
    assert.strictEqual(syncResB1.progressPulled, 1, 'Thiết bị B phải kéo Ch 5 từ Cloud');
    assert.strictEqual(getReadingProgress('nov_1')?.chapterId, 'ch_5');

    // Thiết bị B đọc tiếp đến Chương 10 (updatedAt = 2000)
    saveReadingProgress('nov_1', { chapterId: 'ch_10', percent: 30, updatedAt: 2000 });
    const syncResB2 = await syncReadingProgress(supabaseMock, 'user_123', ['nov_1']);
    assert.strictEqual(syncResB2.progressPushed, 1, 'Thiết bị B phải đẩy Ch 10 lên Cloud');

    // Thiết bị A sync: phải kéo về Ch 10
    devA.activate();
    const syncResA2 = await syncReadingProgress(supabaseMock, 'user_123', ['nov_1']);
    assert.strictEqual(syncResA2.progressPulled, 1, 'Thiết bị A phải kéo Ch 10 từ Cloud');
    assert.strictEqual(getReadingProgress('nov_1')?.chapterId, 'ch_10');
  });

  // =========================================================================
  // CA 5: Đồng bộ Tiến độ đọc khi hai thiết bị đọc hai truyện KHÁC NHAU
  // =========================================================================
  test('Ca 5: Đọc 2 truyện khác nhau trên 2 thiết bị -> Không xung đột, không ghi đè lẫn nhau', async () => {
    // Thiết bị A đọc Truyện nov_1
    devA.activate();
    addToLibrary({ id: 'nov_1', title: 'Truyện 1', chapterCount: 20 });
    addToLibrary({ id: 'nov_2', title: 'Truyện 2', chapterCount: 30 });
    saveReadingProgress('nov_1', { chapterId: 'ch_1_3', percent: 60, updatedAt: 1000 });
    await syncReadingProgress(supabaseMock, 'user_123', ['nov_1', 'nov_2']);

    // Thiết bị B đọc Truyện nov_2
    devB.activate();
    addToLibrary({ id: 'nov_1', title: 'Truyện 1', chapterCount: 20 });
    addToLibrary({ id: 'nov_2', title: 'Truyện 2', chapterCount: 30 });
    saveReadingProgress('nov_2', { chapterId: 'ch_2_7', percent: 40, updatedAt: 1500 });
    await syncReadingProgress(supabaseMock, 'user_123', ['nov_1', 'nov_2']);

    // Thiết bị A sync lại
    devA.activate();
    await syncReadingProgress(supabaseMock, 'user_123', ['nov_1', 'nov_2']);

    // Cả hai thiết bị đều phải có tiến độ độc lập của cả 2 truyện
    for (const d of [devA, devB]) {
      d.activate();
      assert.strictEqual(getReadingProgress('nov_1')?.chapterId, 'ch_1_3', `${d.name} phải giữ Ch 3 của nov_1`);
      assert.strictEqual(getReadingProgress('nov_2')?.chapterId, 'ch_2_7', `${d.name} phải giữ Ch 7 của nov_2`);
    }
  });

  // =========================================================================
  // CA 6: CLOCK SKEW (LỆCH ĐỒNG HỒ) TRONG TIẾN ĐỘ ĐỌC GÂY LOST PROGRESS
  // =========================================================================
  test('Ca 6 (Mục 6): CLOCK SKEW - Thiết bị A đồng hồ nhanh 1 giờ ghi đè làm mất tiến độ mới đọc trên Thiết bị B', async () => {
    addToLibrary({ id: 'nov_1', title: 'Truyện Skew', chapterCount: 50 });

    // Thiết bị A bị lệch đồng hồ: chạy NHANH 1 giờ (+3,600,000 ms)
    devA.clockOffset = 3600000;
    devB.clockOffset = 0; // Thiết bị B đồng hồ chuẩn

    // Thời điểm thực tế: T = 1000000
    // Thiết bị A đọc Chương 5. Do đồng hồ chạy nhanh, updatedAt được gán là: 1000000 + 3600000 = 4600000
    devA.activate();
    saveReadingProgress('nov_1', { chapterId: 'ch_5', percent: 10 });
    const progA = getReadingProgress('nov_1');
    assert(progA.updatedAt >= 3600000, 'updatedAt của A mang mốc tương lai do clock skew');
    await syncReadingProgress(supabaseMock, 'user_123', ['nov_1']);

    // 15 phút sau (thời điểm thực tế T = 1900000):
    // Người dùng cầm Thiết bị B lên đọc tiếp đến Chương 20!
    // Thiết bị B gán updatedAt chuẩn: 1900000
    devB.activate();
    addToLibrary({ id: 'nov_1', title: 'Truyện Skew', chapterCount: 50 });
    saveReadingProgress('nov_1', { chapterId: 'ch_20', percent: 80, updatedAt: 1900000 });

    // Thiết bị B thực hiện sync với Cloud:
    // So sánh: cloudUpdatedAt (4600000) > localUpdatedAt (1900000)
    // -> Thiết bị B kéo Ch 5 từ Cloud về GHI ĐÈ LÊN Chương 20!
    await syncReadingProgress(supabaseMock, 'user_123', ['nov_1']);

    const lostProgressB = getReadingProgress('nov_1');
    assert.strictEqual(lostProgressB.chapterId, 'ch_5', 'Tiến độ Ch 20 của B bị giật lùi về Ch 5 do clock skew!');
  });

  // =========================================================================
  // CA 7: CLOCK SKEW TRONG PHÁT HIỆN THIẾT BỊ DÙNG SONG SONG
  // =========================================================================
  test('Ca 7 (Mục 6): CLOCK SKEW - Lệch đồng hồ làm sai lệch hoàn toàn tính năng phát hiện thiết bị dùng song song', async () => {
    // 7A: Thiết bị A đồng hồ CHẬM 5 phút (-300,000 ms)
    devA.clockOffset = -300000;
    devB.clockOffset = 0;

    devA.activate();
    // Thiết bị A tu luyện và đẩy lên Cloud lúc này (ghi updated_at = now - 300,000)
    const writeTimeA = Date.now();
    supabaseMock.tables.cultivation.set('user_123', {
      user_id: 'user_123',
      rev: 10,
      updated_at: writeTimeA,
      device_id: devA.deviceId,
      state: { realm: 'ngung_khi_1', totalExp: 1000, _rev: 10 },
    });

    // Thiết bị B kiểm tra phát hiện song song:
    // Code autoSync: now - cloudCultivation.updated_at < 120000
    devB.activate();
    const nowB = Date.now();
    const diffSlow = nowB - writeTimeA;
    const detectedSlow = diffSlow < 120000;

    // Dù A vừa ghi trước đó 1 mili-giây, diffSlow >= 300,000 ms > 120,000 ms
    // => FALSE NEGATIVE: Không phát hiện được thiết bị song song!
    assert.strictEqual(detectedSlow, false, 'Clock chậm gây False Negative trong phát hiện song song');

    // 7B: Thiết bị A đồng hồ NHANH 5 phút (+300,000 ms)
    devA.clockOffset = 300000;
    devA.activate();
    const writeTimeFast = Date.now();
    supabaseMock.tables.cultivation.set('user_123', {
      user_id: 'user_123',
      rev: 11,
      updated_at: writeTimeFast,
      device_id: devA.deviceId,
      state: { realm: 'ngung_khi_1', totalExp: 1100, _rev: 11 },
    });

    devB.activate();
    const diffFast = Date.now() - writeTimeFast;
    const detectedFast = diffFast < 120000;

    // diffFast ra số âm (< 120,000 ms) -> Luôn coi là song song ngay cả khi A đã tắt máy từ lâu
    // => FALSE POSITIVE kéo dài 5 phút sau khi A tắt máy!
    assert.strictEqual(detectedFast, true, 'Clock nhanh gây False Positive kéo dài trong phát hiện song song');
  });

  // =========================================================================
  // CA 8: HAI THIẾT BỊ GHI NỘI DUNG TRUYỆN GẦN NHƯ ĐỒNG THỜI
  // =========================================================================
  test('Ca 8: Ghi nội dung truyện đồng thời -> File Storage bị ghi đè do thiếu OCC/ETag', async () => {
    // Khởi tạo truyện có 10 chương trên Cloud Storage
    const baseChapters = Array.from({ length: 10 }, (_, i) => ({
      id: `ch_${i + 1}`, novelId: 'nov_sync', chapterNumber: i + 1, title: `Chương ${i + 1}`, content: `Nội dung ${i + 1}`, order: i + 1,
    }));
    const { blob } = await import('../src/lib/sync/syncEngine.js').then(m => m.compressChapters(JSON.stringify(baseChapters)));
    await supabaseMock.storage.from('novels').upload('user_123/nov_sync.json.gz', blob);

    supabaseMock.tables.novels.set('user_123:nov_sync', {
      user_id: 'user_123',
      id: 'nov_sync',
      title: 'Truyện Đua',
      chapter_count: 10,
      content_path: 'user_123/nov_sync.json.gz',
      content_updated_at: 1000,
      updated_at: 1000,
    });

    // Cả hai thiết bị ban đầu đều có 10 chương và sync ledger ở mốc 1000
    for (const d of [devA, devB]) {
      d.activate();
      await saveNovel({ id: 'nov_sync', title: 'Truyện Đua', chapterCount: 10 });
      await saveChaptersBulk(baseChapters, { skipDirty: true });
      saveSyncLedger({
        novels: { nov_sync: { lastPushedContentAt: 1000, lastPulledContentAt: 1000 } },
        cultivation: { lastSyncedRev: 0 },
        lastSyncedAt: 1000,
      });
    }

    // Thiết bị A viết thêm Chương 11 (A-Exclusive)
    devA.activate();
    await saveChaptersBulk([{
      id: 'ch_11_A', novelId: 'nov_sync', chapterNumber: 11, title: 'Chương 11 Từ A', content: 'Nội dung của A', order: 11,
    }]);
    markNovelDirty('nov_sync', 2000, 'add_ch11_A');

    // Thiết bị B viết thêm Chương 12 (B-Exclusive)
    devB.activate();
    await saveChaptersBulk([{
      id: 'ch_12_B', novelId: 'nov_sync', chapterNumber: 12, title: 'Chương 12 Từ B', content: 'Nội dung của B', order: 12,
    }]);
    markNovelDirty('nov_sync', 2001, 'add_ch12_B');

    // MÔ PHỎNG ĐỒNG THỜI:
    // Cả hai cùng fetch Cloud metadata khi Cloud content_updated_at vẫn là 1000.
    // Cả hai đều thấy: localDirty = true, cloudContentChanged = false.
    // Cả hai đều xếp task: push_dirty (gọi pushNovelToCloud).

    // Thiết bị A push trước:
    devA.activate();
    await pushNovelToCloud(supabaseMock, 'user_123', 'nov_sync', { title: 'Truyện Đua' });

    // Thiết bị B (đã xếp task push_dirty) push tiếp theo:
    devB.activate();
    await pushNovelToCloud(supabaseMock, 'user_123', 'nov_sync', { title: 'Truyện Đua' });

    // HẬU QUẢ KIỂM TRA:
    // Tải file storage trên Cloud về giải nén
    const downloadedBlob = (await supabaseMock.storage.from('novels').download('user_123/nov_sync.json.gz')).data;
    const finalChaptersOnCloud = await (await import('../src/lib/sync/syncEngine.js')).decompressChapters(downloadedBlob);

    // File Storage chỉ có 11 chương (10 chương gốc + ch_12_B của B).
    // Chương ch_11_A của Thiết bị A đã bị B ghi đè mất hoàn toàn trên Cloud Storage!
    const hasCh11A = finalChaptersOnCloud.some(c => c.id === 'ch_11_A');
    const hasCh12B = finalChaptersOnCloud.some(c => c.id === 'ch_12_B');

    assert.strictEqual(hasCh12B, true, 'Chương 12 của B có trên Cloud');
    assert.strictEqual(hasCh11A, false, 'Chương 11 của A đã bị ghi đè mất trên Cloud Storage!');
  });
});
