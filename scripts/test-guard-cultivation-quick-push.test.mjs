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
      novels: new Map(),
      progress: new Map(),
      cultivation: new Map(),
      user_settings: new Map(),
    };
    this.storageBuckets = {
      novels: new Map(),
    };
    this.cultivationUpsertCalls = 0;

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
          async upload(path, blob) {
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
        if (tableName === 'cultivation') {
          self.cultivationUpsertCalls++;
        }
        const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        for (const row of rows) {
          let key;
          if (tableName === 'novels') key = `${row.user_id}:${row.id}`;
          else if (tableName === 'progress') key = `${row.user_id}:${row.novel_id}`;
          else if (tableName === 'cultivation') key = `${row.user_id}`;
          else if (tableName === 'user_settings') key = `${row.user_id}`;
          else key = `${row.user_id || 'default'}`;

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
}

// -------------------------------------------------------------
// 3. IMPORTS
// -------------------------------------------------------------

import { setHostOverrideForTesting } from '../src/lib/sync/envProtection.js';
import {
  runAutoSync,
  setAutoSyncEnabled,
  releaseSyncLock,
  resetBackoff,
  setCachedUserIdForTesting,
  initAutoSync,
  quickPushProgressAndCultivation,
  flushReadingProgress,
} from '../src/lib/sync/autoSync.js';
import {
  saveReadingProgress,
  getReadingProgress,
  addToLibrary,
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
  DEVICE_ID_KEY,
} from '../src/lib/sync/syncLedger.js';
import {
  setDBPromiseForTesting,
} from '../src/lib/db.js';

setDBPromiseForTesting(Promise.resolve(mockDB));
setHostOverrideForTesting('quangamchingoai.github.io');
setAutoSyncEnabled(true);
setActiveProfile('real');
setCachedUserIdForTesting('user_123');

// -------------------------------------------------------------
// 4. TEST SUITE CHO NHIỆM VỤ 3A: BẢO VỆ QUICK PUSH TU VI
// -------------------------------------------------------------

describe('Nhiệm vụ 3A: Chặn Quick Push ghi đè tu vi cũ', () => {
  let supabaseMock;

  beforeEach(() => {
    supabaseMock = new MockSupabaseClient('user_123');
    global.localStorage.clear();
    releaseSyncLock();
    resetBackoff();
    setCachedUserIdForTesting('user_123');
    global.localStorage.setItem(DEVICE_ID_KEY, 'dev_test_123');
    global.navigator.onLine = true;
    global.document.visibilityState = 'visible';
  });

  afterEach(() => {
    releaseSyncLock();
    resetBackoff();
  });

  // =========================================================================
  // TEST 1: Cloud có rev 50, Local có rev 11 -> Quick Push không được làm lùi Cloud
  // =========================================================================
  test('Test 1: Cloud có revision 50 (Kim Đan), Local có revision 11 (Ngưng Khí) -> Quick Push không làm Cloud lùi về revision 11', async () => {
    // 1. Cloud ban đầu có rev 50, cảnh giới Kim Đan, 50,000 EXP
    supabaseMock.tables.cultivation.set('user_123', {
      user_id: 'user_123',
      rev: 50,
      updated_at: 500000,
      device_id: 'other_device_phone',
      state: { realm: 'kim_dan', totalExp: 50000, _rev: 50 },
    });

    // 2. Máy này mở lên với dữ liệu cục bộ cũ: rev 10, Ngưng Khí
    global.localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify({
      realm: 'ngung_khi_1', totalExp: 1000, _rev: 10,
    }));
    global.localStorage.setItem(getCultivationKey('pending_seconds', 'real'), '15');
    saveSyncLedger({
      novels: {},
      cultivation: { lastSyncedRev: 10, lastSyncedPending: 15, lastCloudUpdatedAt: 10000 },
      lastSyncedAt: 10000,
    });

    // 3. Người dùng đọc truyện làm tu vi tăng nhẹ thành rev 11, totalExp: 1005
    const localState = getCultivationState();
    localState.totalExp += 5;
    saveCultivationState(localState); // _rev tăng thành 11

    // 4. Kích hoạt Quick Push trực tiếp
    const pushRes = await quickPushProgressAndCultivation(supabaseMock);

    // KẾT QUẢ KỲ VỌNG:
    // a. Quick push trả về bypassed do cơ chế bảo vệ
    assert.strictEqual(pushRes.bypassed, true, 'Quick Push phải được bypass vì lý do an toàn');
    assert.strictEqual(pushRes.reason, 'guard_against_blind_upsert');

    // b. Cloud TUYỆT ĐỐI KHÔNG BỊ GHI ĐÈ, vẫn giữ nguyên rev 50, Kim Đan, 50,000 EXP
    const cloudAfter = supabaseMock.tables.cultivation.get('user_123');
    assert.strictEqual(cloudAfter.rev, 50, 'Cloud rev phải giữ nguyên 50, không bị giật lùi về 11');
    assert.strictEqual(cloudAfter.state.realm, 'kim_dan', 'Cảnh giới Kim Đan trên Cloud phải được bảo toàn');
    assert.strictEqual(cloudAfter.state.totalExp, 50000, 'EXP 50,000 trên Cloud phải được bảo toàn');

    // c. Không có cuộc gọi upsert cultivation nào lên Supabase
    assert.strictEqual(supabaseMock.cultivationUpsertCalls, 0, 'Không được gọi upsert cultivation');
  });

  // =========================================================================
  // TEST 2: Local EXP, cảnh giới và pending_seconds được giữ nguyên 100%
  // =========================================================================
  test('Test 2: Toàn bộ dữ liệu tu vi cục bộ (EXP, cảnh giới, pending_seconds) và ledger lastSyncedRev được giữ nguyên vẹn', async () => {
    global.localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify({
      realm: 'truc_co_vien_man', totalExp: 8888, pillCount: 5, _rev: 15,
    }));
    global.localStorage.setItem(getCultivationKey('pending_seconds', 'real'), '45');
    saveSyncLedger({
      novels: {},
      cultivation: { lastSyncedRev: 14, lastSyncedPending: 30, lastCloudUpdatedAt: 20000 },
      lastSyncedAt: 20000,
    });

    await quickPushProgressAndCultivation(supabaseMock);

    // Dữ liệu cục bộ phải còn nguyên vẹn
    const stateAfter = getCultivationState();
    assert.strictEqual(stateAfter.realm, 'truc_co_vien_man', 'Cảnh giới cục bộ phải giữ nguyên');
    assert.strictEqual(stateAfter.totalExp, 8888, 'EXP cục bộ phải giữ nguyên');
    assert.strictEqual(stateAfter.pillCount, 5, 'Tài nguyên cục bộ phải giữ nguyên');
    assert.strictEqual(stateAfter._rev, 15, '_rev cục bộ phải giữ nguyên');

    const pendingAfter = parseInt(global.localStorage.getItem(getCultivationKey('pending_seconds', 'real')), 10);
    assert.strictEqual(pendingAfter, 45, 'pending_seconds cục bộ phải giữ nguyên');

    // Ledger lastSyncedRev KHÔNG ĐƯỢC tự động tăng lên 15
    const ledgerAfter = getSyncLedger();
    assert.strictEqual(ledgerAfter.cultivation.lastSyncedRev, 14, 'lastSyncedRev không được tăng khi chưa sync thành công');
  });

  // =========================================================================
  // TEST 3: Đóng tab (pagehide) và chuyển ứng dụng (visibilitychange=hidden)
  // =========================================================================
  test('Test 3: Sự kiện pagehide và visibilitychange=hidden không ghi đè Cloud và kích hoạt bảo vệ an toàn', async () => {
    supabaseMock.tables.cultivation.set('user_123', {
      user_id: 'user_123',
      rev: 20,
      updated_at: 100000,
      device_id: 'dev_laptop',
      state: { realm: 'ngung_khi_9', totalExp: 2000, _rev: 20 },
    });

    global.localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify({
      realm: 'ngung_khi_1', totalExp: 100, _rev: 5,
    }));
    saveSyncLedger({
      novels: {},
      cultivation: { lastSyncedRev: 4, lastCloudUpdatedAt: 5000 },
      lastSyncedAt: 5000,
    });

    initAutoSync(supabaseMock);

    // Kích hoạt sự kiện visibilitychange -> hidden (chuyển app trên mobile)
    global.document.visibilityState = 'hidden';
    global.document.dispatchEvent(new Event('visibilitychange'));

    // Kích hoạt sự kiện pagehide (đóng tab)
    global.window.dispatchEvent(new Event('pagehide'));

    await new Promise(r => setTimeout(r, 100));

    // Cloud vẫn phải an toàn
    const cloudCheck = supabaseMock.tables.cultivation.get('user_123');
    assert.strictEqual(cloudCheck.rev, 20, 'Cloud rev phải giữ nguyên 20');
    assert.strictEqual(cloudCheck.state.totalExp, 2000, 'Cloud EXP phải giữ nguyên 2000');
    assert.strictEqual(supabaseMock.cultivationUpsertCalls, 0, 'Zero upsert calls on cultivation');
  });

  // =========================================================================
  // TEST 4: Khi mở lại ứng dụng (Reopening App) -> Đồng bộ chính phát hiện chưa đồng bộ
  // =========================================================================
  test('Test 4: Khi mở lại ứng dụng, luồng đồng bộ chính (runAutoSync) phát hiện xung đột và bảo vệ an toàn', async () => {
    // Cloud có rev 50, Kim Đan, 50000 EXP
    supabaseMock.tables.cultivation.set('user_123', {
      user_id: 'user_123',
      rev: 50,
      updated_at: 500000,
      device_id: 'device_mobile',
      state: { realm: 'kim_dan', totalExp: 50000, _rev: 50 },
    });

    // Local có rev 11, Ngưng Khí, 1005 EXP
    global.localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify({
      realm: 'ngung_khi_1', totalExp: 1005, _rev: 11,
    }));
    saveSyncLedger({
      novels: {},
      cultivation: { lastSyncedRev: 10, lastCloudUpdatedAt: 10000 },
      lastSyncedAt: 10000,
    });

    // Lúc đóng tab: Quick Push được bypass an toàn
    await quickPushProgressAndCultivation(supabaseMock);

    // Khi người dùng mở lại ứng dụng (runAutoSync chạy):
    // Cả Cloud rev (50 > 10) và Local rev (11 > 10) đều đã thay đổi
    const syncRes = await runAutoSync(supabaseMock, { src: 'startup' });

    // Đồng bộ chính phát hiện xung đột, kích hoạt attention flag thay vì ghi đè mù!
    assert.strictEqual(syncRes.attention, true, 'runAutoSync phải bật cờ attention để bảo vệ người dùng');
    assert.strictEqual(syncRes.reason, 'cultivation_conflict', 'Lý do phải là cultivation_conflict');

    // Cả hai bên đều được bảo toàn
    const cloudAfter = supabaseMock.tables.cultivation.get('user_123');
    assert.strictEqual(cloudAfter.rev, 50, 'Cloud vẫn là rev 50');
    const localAfter = getCultivationState();
    assert.strictEqual(localAfter._rev, 11, 'Local vẫn là rev 11');
  });

  // =========================================================================
  // TEST 5: Đồng bộ chính vẫn đẩy được tu vi lên Cloud an toàn khi chỉ có Local đổi
  // =========================================================================
  test('Test 5: Đồng bộ chính (runAutoSync) vẫn đẩy tu vi mới lên Cloud thành công khi chỉ có Local thay đổi', async () => {
    // Cloud ban đầu: rev 10, 1000 EXP
    supabaseMock.tables.cultivation.set('user_123', {
      user_id: 'user_123',
      rev: 10,
      updated_at: 10000,
      device_id: 'dev_test_123',
      state: { realm: 'ngung_khi_1', totalExp: 1000, _rev: 10 },
    });

    // Local ban đầu: rev 10, đã sync
    global.localStorage.setItem(getCultivationKey('state', 'real'), JSON.stringify({
      realm: 'ngung_khi_1', totalExp: 1000, _rev: 10,
    }));
    saveSyncLedger({
      novels: {},
      cultivation: { lastSyncedRev: 10, lastCloudUpdatedAt: 10000 },
      lastSyncedAt: 10000,
    });

    // Local tu luyện lên rev 11, 1100 EXP (Cloud không đổi)
    const localState = getCultivationState();
    localState.totalExp = 1100;
    saveCultivationState(localState); // _rev = 11

    // Khi chạy đồng bộ chính đầy đủ:
    const syncRes = await runAutoSync(supabaseMock, { src: 'auto' });
    assert.strictEqual(syncRes.success, true, 'runAutoSync phải thành công');

    // Cloud phải nhận được rev 11, 1100 EXP từ đồng bộ chính
    const cloudAfter = supabaseMock.tables.cultivation.get('user_123');
    assert.strictEqual(cloudAfter.rev, 11, 'Cloud rev phải được nâng lên 11');
    assert.strictEqual(cloudAfter.state.totalExp, 1100, 'Cloud phải ghi nhận 1100 EXP');

    // Ledger cục bộ được cập nhật đúng mốc
    const ledger = getSyncLedger();
    assert.strictEqual(ledger.cultivation.lastSyncedRev, 11, 'lastSyncedRev phải là 11');
  });

  // =========================================================================
  // TEST 6: Không làm hỏng cơ chế đồng bộ tiến độ đọc (flushReadingProgress)
  // =========================================================================
  test('Test 6: Cơ chế đồng bộ tiến độ đọc (flushReadingProgress) vẫn hoạt động hoàn hảo khi đóng tab', async () => {
    addToLibrary({ id: 'nov_reading', title: 'Truyện Đang Đọc', chapterCount: 30 });
    saveReadingProgress('nov_reading', { chapterId: 'ch_8', percent: 75, updatedAt: 25000 });
    saveSyncLedger({
      novels: { nov_reading: { lastSyncedProgressAt: 10000 } },
      cultivation: { lastSyncedRev: 10 },
      lastSyncedAt: 10000,
    });

    // Gọi flushReadingProgress (như trong sự kiện pagehide)
    const flushRes = await flushReadingProgress(supabaseMock);
    assert.strictEqual(flushRes.flushed, 1, 'Phải flush thành công 1 truyện');

    // Kiểm tra dòng tiến độ trên Cloud
    const cloudProgress = supabaseMock.tables.progress.get('user_123:nov_reading');
    assert(cloudProgress, 'Dòng tiến độ trên Cloud phải tồn tại');
    assert.strictEqual(cloudProgress.data.chapterId, 'ch_8', 'Tiến độ Ch 8 phải được lưu lên Cloud');
    assert.strictEqual(cloudProgress.data.percent, 75, 'Phần trăm 75% phải được lưu lên Cloud');
  });
});
