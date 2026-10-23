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

// Mock Window & CustomEvent for Node.js
const eventListeners = {};
global.window = {
  addEventListener: (event, handler) => {
    if (!eventListeners[event]) eventListeners[event] = [];
    eventListeners[event].push(handler);
  },
  removeEventListener: (event, handler) => {
    if (eventListeners[event]) {
      eventListeners[event] = eventListeners[event].filter(h => h !== handler);
    }
  },
  dispatchEvent: (evt) => {
    const handlers = eventListeners[evt.type] || [];
    handlers.forEach(h => h(evt));
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
// 2. Mock In-Memory IndexedDB for db.js
// -------------------------------------------------------------
class MockDB {
  constructor() {
    this.novels = new Map();
    this.chapters = new Map();
  }

  clear() {
    this.novels.clear();
    this.chapters.clear();
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

  async getAll(storeName) {
    if (storeName === 'novels') return Array.from(this.novels.values());
    if (storeName === 'chapters') return Array.from(this.chapters.values());
    return [];
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
            return self[name].get(id);
          },
          async put(val) {
            self[name].set(val.id, { ...val });
          },
          async delete(id) {
            self[name].delete(id);
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
                return res.sort((a, b) => (a.order || 0) - (b.order || 0));
              },
              async openCursor(range) {
                const targetNovelId = range?.lower || range;
                const matched = [];
                for (const ch of self.chapters.values()) {
                  if (ch.novelId === targetNovelId) matched.push(ch);
                }
                let idx = 0;
                if (matched.length === 0) return null;
                const makeCursor = (i) => {
                  if (i >= matched.length) return null;
                  return {
                    value: matched[i],
                    async delete() {
                      self.chapters.delete(matched[i].id);
                    },
                    async continue() {
                      idx++;
                      return makeCursor(idx);
                    },
                  };
                };
                return makeCursor(0);
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

// Dynamic imports of app modules after mocks are set up
const { setDBPromiseForTesting, saveNovel, saveChaptersBulk, getNovel, getChapters, deleteChaptersOfNovel } = await import('../src/lib/db.js');
setDBPromiseForTesting(Promise.resolve(mockDB));

const {
  addToLibrary,
  saveReadingProgress,
  getReadingProgress,
  saveReadingSettings,
  getReadingSettings,
  setVaultPassword,
  getVaultPasswordInfo,
  getLibrary,
} = await import('../src/lib/storage.js');

const {
  setActiveProfile,
  getActiveProfile,
  saveCultivationState,
  getCultivationState,
} = await import('../src/lib/cultivation.js');

const {
  recordNovelTombstone,
  getTombstones,
  getDirtyNovels,
} = await import('../src/lib/sync/syncLedger.js');

const {
  createBackupData,
  parseAndVerifyBackupFile,
  performRestore,
  analyzeBackupForPreview,
  mapChapterIdForNovel,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  PRE_RESTORE_SNAPSHOT_KEY,
  isAllowlistedStorageKey,
  canonicalJsonStringify,
  computeSHA256,
  isGzip,
} = await import('../src/lib/backup/backupEngine.js');

console.log('=== BẮT ĐẦU CHẠY TOÀN BỘ CÁC BÀI TEST SAO LƯU & KHÔI PHỤC (1-19) ===\n');

let passedTests = 0;

async function runTest(name, fn) {
  try {
    await fn();
    passedTests++;
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name} THẤT BẠI:`, err);
    process.exit(1);
  }
}

// -------------------------------------------------------------
// Test 1: Xuất rồi nhập vào môi trường trống cho dữ liệu y hệt
// -------------------------------------------------------------
await runTest('Test 1: Xuất rồi nhập vào môi trường trống cho dữ liệu y hệt (truyện, chương, tiến độ, cài đặt, mật thất, tu vi)', async () => {
  localStorage.clear();
  mockDB.clear();
  setActiveProfile('real');

  // Khởi tạo dữ liệu mẫu
  const novel1 = {
    id: 'novel_1',
    title: 'Truyện Tiên Hiệp 1',
    author: 'Tác Giả A',
    description: 'Mô tả truyện 1',
    cover: 'cover_data_1',
    coverThumb: 'thumb_1',
    isHidden: false,
    updatedAt: 1000,
    createdAt: 900,
  };
  const chapters1 = [
    { id: 'ch_1_1', novelId: 'novel_1', title: 'Chương 1', content: 'Nội dung chương 1', order: 1 },
    { id: 'ch_1_2', novelId: 'novel_1', title: 'Chương 2', content: 'Nội dung chương 2', order: 2 },
  ];
  await saveNovel(novel1);
  await saveChaptersBulk(chapters1);
  addToLibrary({ ...novel1, chapterCount: 2, totalChapters: 2 });

  const novel2 = {
    id: 'novel_hidden',
    title: 'Truyện Mật Thất Ẩn',
    author: 'Tác Giả B',
    description: 'Bí mật cấm kỵ',
    cover: 'cover_hidden',
    coverThumb: 'thumb_hidden',
    isHidden: true,
    updatedAt: 2000,
    createdAt: 1900,
  };
  const chapters2 = [
    { id: 'ch_h_1', novelId: 'novel_hidden', title: 'Cấm Chương 1', content: 'Nội dung mật', order: 1 },
  ];
  await saveNovel(novel2);
  await saveChaptersBulk(chapters2);
  addToLibrary({ ...novel2, chapterCount: 1, totalChapters: 1 });

  // Tiến độ đọc
  saveReadingProgress('novel_1', { chapterId: 'ch_1_2', scrollTop: 500, updatedAt: 1200 });
  localStorage.setItem('scroll_pos_novel_1_ch_1_2', JSON.stringify({ percent: 0.6, paraIndex: 5, scrollY: 500, time: 1200 }));

  // Cài đặt đọc
  saveReadingSettings({ fontSize: 20, theme: 'sepia', fontFamily: 'sans-serif' });

  // Mật thất PIN
  setVaultPassword('123456', 'Gợi ý ngày sinh');

  // Tu vi
  saveCultivationState({
    currentRealm: 'Trúc Cơ',
    level: 5,
    currentLevelName: '5 Khiếu',
    exp: 3500,
    thienMenh: 150,
    _rev: 4,
  });
  localStorage.setItem('cultivation_pending_seconds', '45');

  // Xuất sao lưu
  const exportRes = await createBackupData({ includeContent: true });
  assert.ok(exportRes.backupObj);
  assert.strictEqual(exportRes.backupObj.format, BACKUP_FORMAT);
  assert.strictEqual(exportRes.backupObj.version, BACKUP_VERSION);
  assert.ok(exportRes.backupObj.checksum);
  assert.strictEqual(exportRes.backupObj.parts.novels.length, 2);

  // Xóa sạch môi trường (giả lập máy mới hoàn toàn trống)
  localStorage.clear();
  mockDB.clear();

  // Đọc và kiểm tra file
  const verifiedBackup = await parseAndVerifyBackupFile(exportRes.bytes);
  assert.strictEqual(verifiedBackup.checksum, exportRes.backupObj.checksum);

  // Khôi phục vào máy trống
  const restoreReport = await performRestore({
    backupObj: verifiedBackup,
    mode: 'merge',
    selectedParts: { novels: true, progress: true, cultivation: true, settings: true, vault: true },
    confirmCultivation: true,
  });

  assert.strictEqual(restoreReport.addedNovels, 2);
  assert.strictEqual(restoreReport.errors.length, 0);

  // Xác minh dữ liệu sau khôi phục
  const restoredLib = getLibrary({ includeHidden: true });
  assert.strictEqual(restoredLib.length, 2);
  assert.ok(restoredLib.find(n => n.id === 'novel_1'));
  const restoredHidden = restoredLib.find(n => n.id === 'novel_hidden');
  assert.ok(restoredHidden && restoredHidden.isHidden === true);

  const dbNov1 = await getNovel('novel_1');
  assert.strictEqual(dbNov1.title, 'Truyện Tiên Hiệp 1');
  const chs1 = await getChapters('novel_1');
  assert.strictEqual(chs1.length, 2);
  assert.strictEqual(chs1[0].content, 'Nội dung chương 1');

  const prog = getReadingProgress('novel_1');
  assert.strictEqual(prog.chapterId, 'ch_1_2');
  assert.strictEqual(prog.scrollTop, 500);

  const settings = getReadingSettings();
  assert.strictEqual(settings.fontSize, 20);
  assert.strictEqual(settings.theme, 'sepia');

  const vault = getVaultPasswordInfo();
  assert.ok(vault.hash);
  assert.strictEqual(vault.hint, 'Gợi ý ngày sinh');

  const cult = getCultivationState();
  assert.strictEqual(cult.currentRealm, 'Trúc Cơ');
  assert.strictEqual(cult.exp, 3500);
  assert.strictEqual(cult.thienMenh, 150);
  assert.strictEqual(localStorage.getItem('cultivation_pending_seconds'), '45');
});

// -------------------------------------------------------------
// Test 2: File KHÔNG chứa bất kỳ khóa tcl_sync_*, token, phiên đăng nhập nào
// -------------------------------------------------------------
await runTest('Test 2: File KHÔNG chứa bất kỳ khóa tcl_sync_*, token, hoặc phiên đăng nhập', async () => {
  // Cố tình nhồi các khóa nhạy cảm vào localStorage
  localStorage.setItem('sb-test-auth-token', JSON.stringify({ access_token: 'SECRET_JWT_TOKEN_123', user: { email: 'admin@tcl.vn' } }));
  localStorage.setItem('tcl_sync_dirty_novels', JSON.stringify({ novel_1: 123456 }));
  localStorage.setItem('tcl_sync_tombstones', JSON.stringify({ novel_deleted: 654321 }));
  localStorage.setItem('tcl_sync_ledger', JSON.stringify({ lastSyncedAt: 999999 }));
  localStorage.setItem('tcl_sync_lock_ts', '1729670000000');
  localStorage.setItem('tcl_sync_status', JSON.stringify({ status: 'synced' }));
  localStorage.setItem('tcl_auto_sync', 'true');
  localStorage.setItem('tcl_device_id', 'device_super_secret_id');
  localStorage.setItem('tcl_active_profile', 'real');
  localStorage.setItem('tcl_vault_unlocked_session', '1');
  localStorage.setItem('tcl_vault_active_tab', '1');

  const exportRes = await createBackupData({ includeContent: true });
  const rawJson = exportRes.jsonStr;

  assert.strictEqual(rawJson.includes('SECRET_JWT_TOKEN_123'), false, 'Không được lộ JWT Token');
  assert.strictEqual(rawJson.includes('admin@tcl.vn'), false, 'Không được lộ Email người dùng');
  assert.strictEqual(rawJson.includes('tcl_sync_dirty_novels'), false, 'Không chứa dirty novels');
  assert.strictEqual(rawJson.includes('tcl_sync_tombstones'), false, 'Không chứa tombstones');
  assert.strictEqual(rawJson.includes('tcl_sync_ledger'), false, 'Không chứa sync ledger');
  assert.strictEqual(rawJson.includes('tcl_sync_lock_ts'), false, 'Không chứa sync lock');
  assert.strictEqual(rawJson.includes('device_super_secret_id'), false, 'Không chứa device id');
  assert.strictEqual(rawJson.includes('tcl_auto_sync'), false, 'Không chứa auto sync setting');
  assert.strictEqual(rawJson.includes('tcl_vault_unlocked_session'), false, 'Không chứa session unlock');
  assert.strictEqual(rawJson.includes('tcl_vault_active_tab'), false, 'Không chứa active tab');

  // Dọn dẹp
  localStorage.removeItem('sb-test-auth-token');
  localStorage.removeItem('tcl_sync_dirty_novels');
  localStorage.removeItem('tcl_sync_tombstones');
  localStorage.removeItem('tcl_sync_ledger');
  localStorage.removeItem('tcl_sync_lock_ts');
  localStorage.removeItem('tcl_sync_status');
  localStorage.removeItem('tcl_auto_sync');
  localStorage.removeItem('tcl_device_id');
});

// -------------------------------------------------------------
// Test 3: Sandbox không xuất tu vi và từ chối nhập tu vi vào sandbox
// -------------------------------------------------------------
await runTest('Test 3: Hồ sơ Sandbox không xuất tu vi và từ chối nhập tu vi vào sandbox', async () => {
  localStorage.clear();
  setActiveProfile('sandbox');

  // Lưu tu vi sandbox giả lập
  localStorage.setItem('tcl_cultivation_state_v3__sandbox', JSON.stringify({ currentRealm: 'Sandbox Realm', exp: 999999 }));
  localStorage.setItem('cultivation_pending_seconds__sandbox', '120');

  // 1. Xuất khi đang ở Sandbox
  const exportRes = await createBackupData({ includeContent: false });
  assert.strictEqual(exportRes.backupObj.parts.cultivation, null, 'Tu vi trong file phải là null khi ở sandbox');
  assert.strictEqual(exportRes.backupObj.profile, 'sandbox');

  // 2. Thử khôi phục tu vi vào Sandbox
  const dummyRealBackup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    profile: 'real',
    parts: {
      novels: [],
      progress: [],
      cultivation: { state: { currentRealm: 'Kim Đan', exp: 50000 }, pendingSeconds: 30 },
      settings: null,
      vault: null,
    },
    checksum: '',
  };
  dummyRealBackup.checksum = await computeSHA256(canonicalJsonStringify(dummyRealBackup.parts));

  let threw = false;
  try {
    await performRestore({
      backupObj: dummyRealBackup,
      mode: 'merge',
      selectedParts: { cultivation: true },
      confirmCultivation: true,
    });
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes('Sandbox'), 'Phải từ chối khôi phục tu vi vào sandbox');
  }
  assert.strictEqual(threw, true, 'Bắt buộc phải ném lỗi khi khôi phục tu vi vào sandbox');

  setActiveProfile('real');
});

// -------------------------------------------------------------
// Test 4: Checksum sai bị từ chối
// -------------------------------------------------------------
await runTest('Test 4: Checksum sai bị từ chối với thông báo rõ ràng', async () => {
  const exportRes = await createBackupData({ includeContent: false });
  const backupObj = JSON.parse(exportRes.jsonStr);

  // Giả mạo hoặc làm sai lệch 1 ký tự trong parts
  backupObj.parts.novels.push({ id: 'fake_novel', title: 'Truyện Lậu' });
  const tamperedJson = JSON.stringify(backupObj);

  let threw = false;
  try {
    await parseAndVerifyBackupFile(tamperedJson);
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes('checksum'), `Thông báo lỗi phải nhắc tới checksum: ${err.message}`);
  }
  assert.strictEqual(threw, true, 'Phải từ chối file bị sai checksum');
});

// -------------------------------------------------------------
// Test 5: Phiên bản file cao hơn bị từ chối
// -------------------------------------------------------------
await runTest('Test 5: File có version cao hơn phiên bản ứng dụng bị từ chối', async () => {
  const futureBackup = {
    format: BACKUP_FORMAT,
    version: 99, // Version 99 tương lai
    exportedAt: Date.now(),
    profile: 'real',
    parts: { novels: [], progress: [], cultivation: null, settings: null, vault: null },
    checksum: '',
  };
  futureBackup.checksum = await computeSHA256(canonicalJsonStringify(futureBackup.parts));

  let threw = false;
  try {
    await parseAndVerifyBackupFile(JSON.stringify(futureBackup));
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes('Cập nhật ứng dụng') || err.message.includes('cập nhật ứng dụng'), `Thông báo phải nhắc cập nhật: ${err.message}`);
  }
  assert.strictEqual(threw, true, 'Phải từ chối version cao hơn');
});

// -------------------------------------------------------------
// Test 6: Khóa ngoài allowlist bị bỏ qua
// -------------------------------------------------------------
await runTest('Test 6: Khóa ngoài allowlist bị bỏ qua và không ghi vào localStorage', async () => {
  assert.strictEqual(isAllowlistedStorageKey('tcl_library'), true);
  assert.strictEqual(isAllowlistedStorageKey('tcl_progress_novel_123'), true);
  assert.strictEqual(isAllowlistedStorageKey('scroll_pos_novel1_chap2'), true);
  assert.strictEqual(isAllowlistedStorageKey('tcl_reading_settings'), true);
  assert.strictEqual(isAllowlistedStorageKey('tcl_vault_pwd_hash'), true);
  assert.strictEqual(isAllowlistedStorageKey('tcl_vault_pwd_hint'), true);
  assert.strictEqual(isAllowlistedStorageKey('tcl_vault_pwd_updated_at'), true);
  assert.strictEqual(isAllowlistedStorageKey('tcl_cultivation_state_v3'), true);
  assert.strictEqual(isAllowlistedStorageKey('cultivation_pending_seconds'), true);

  // Các khóa nguy hiểm / không thuộc allowlist
  assert.strictEqual(isAllowlistedStorageKey('tcl_sync_dirty_novels'), false);
  assert.strictEqual(isAllowlistedStorageKey('tcl_sync_tombstones'), false);
  assert.strictEqual(isAllowlistedStorageKey('tcl_auto_sync'), false);
  assert.strictEqual(isAllowlistedStorageKey('sb-auth-token'), false);
  assert.strictEqual(isAllowlistedStorageKey('random_malicious_script'), false);
  assert.strictEqual(isAllowlistedStorageKey('scroll_pos_bad;alert(1)'), false);

  // Thử khôi phục một scroll position có key không hợp lệ
  const fakeBackup = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: Date.now(),
    profile: 'real',
    parts: {
      novels: [],
      progress: [
        {
          novelId: 'safe_nov',
          progress: { chapterId: 'c1', updatedAt: 100 },
          scrollPositions: [
            { chapterId: 'c1', data: { scrollY: 10 } },
            { chapterId: 'c2/../../bad_key', data: { malicious: true } },
          ],
        },
      ],
      cultivation: null,
      settings: null,
      vault: null,
    },
    checksum: '',
  };
  fakeBackup.checksum = await computeSHA256(canonicalJsonStringify(fakeBackup.parts));

  const report = await performRestore({
    backupObj: fakeBackup,
    mode: 'merge',
    selectedParts: { progress: true },
  });

  assert.ok(report.skippedInvalidKeys > 0, 'Phải ghi nhận số lượng khóa không hợp lệ bị bỏ qua');
  assert.strictEqual(localStorage.getItem('scroll_pos_safe_nov_c2/../../bad_key'), null);
});

// -------------------------------------------------------------
// Test 7: Chế độ GỘP giữ bản mới hơn, không ghi đè bản mới bằng bản cũ
// -------------------------------------------------------------
await runTest('Test 7: Chế độ GỘP giữ bản mới hơn theo updatedAt, không ghi đè bản mới bằng bản cũ', async () => {
  localStorage.clear();
  mockDB.clear();

  // Truyện trên máy có updatedAt = 5000 (mới hơn)
  const localNovel = {
    id: 'novel_conflict_time',
    title: 'Truyện Bản Mới',
    updatedAt: 5000,
  };
  await saveNovel(localNovel);
  addToLibrary(localNovel);

  // File sao lưu có truyện trùng ID nhưng updatedAt = 3000 (cũ hơn)
  const backupNovelOld = {
    id: 'novel_conflict_time',
    title: 'Truyện Bản Cũ Trong File',
    updatedAt: 3000,
  };
  const backupObj = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: Date.now(),
    profile: 'real',
    parts: {
      novels: [backupNovelOld],
      progress: [],
      cultivation: null,
      settings: null,
      vault: null,
    },
    checksum: '',
  };
  backupObj.checksum = await computeSHA256(canonicalJsonStringify(backupObj.parts));

  // Phân tích xem trước
  const preview = analyzeBackupForPreview(backupObj);
  assert.strictEqual(preview.novels[0].status, 'older', 'Xem trước phải xác định truyện là cũ hơn');

  // Khôi phục chế độ merge
  const report = await performRestore({
    backupObj,
    mode: 'merge',
    selectedParts: { novels: true },
  });

  assert.strictEqual(report.skippedNovels, 1, 'Truyện cũ hơn phải bị bỏ qua trong chế độ merge');
  const curNovel = await getNovel('novel_conflict_time');
  assert.strictEqual(curNovel.title, 'Truyện Bản Mới', 'Tiêu đề không bị ghi đè bởi bản cũ');

  // Bây giờ thử trường hợp file có updatedAt = 7000 (mới hơn)
  backupObj.parts.novels[0].updatedAt = 7000;
  backupObj.parts.novels[0].title = 'Truyện Đã Được Cập Nhật Mới';
  backupObj.checksum = await computeSHA256(canonicalJsonStringify(backupObj.parts));

  const report2 = await performRestore({
    backupObj,
    mode: 'merge',
    selectedParts: { novels: true },
  });

  assert.strictEqual(report2.updatedNovels, 1, 'Bản mới hơn phải được cập nhật');
  const curNovelUpdated = await getNovel('novel_conflict_time');
  assert.strictEqual(curNovelUpdated.title, 'Truyện Đã Được Cập Nhật Mới');
});

// -------------------------------------------------------------
// Test 8: Nhập hai lần liên tiếp không nhân đôi truyện/chương (Idempotent)
// -------------------------------------------------------------
await runTest('Test 8: Nhập hai lần liên tiếp không nhân đôi truyện hay chương (Idempotent)', async () => {
  localStorage.clear();
  mockDB.clear();

  const novelItem = {
    id: 'novel_idempotent',
    title: 'Truyện Idempotent',
    updatedAt: 1000,
    chapters: [
      { id: 'ch_idem_1', title: 'Chương 1', content: 'C1', order: 1 },
      { id: 'ch_idem_2', title: 'Chương 2', content: 'C2', order: 2 },
    ],
  };

  const backupObj = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: Date.now(),
    profile: 'real',
    parts: {
      novels: [novelItem],
      progress: [],
      cultivation: null,
      settings: null,
      vault: null,
    },
    checksum: '',
  };
  backupObj.checksum = await computeSHA256(canonicalJsonStringify(backupObj.parts));

  // Nhập lần 1
  await performRestore({
    backupObj,
    mode: 'merge',
    selectedParts: { novels: true },
  });
  const chsAfter1 = await getChapters('novel_idempotent');
  assert.strictEqual(chsAfter1.length, 2);

  // Nhập lần 2
  // Ở lần 2, vì updatedAt bằng nhau nên merge mode sẽ bỏ qua
  await performRestore({
    backupObj,
    mode: 'merge',
    selectedParts: { novels: true },
  });
  const chsAfter2 = await getChapters('novel_idempotent');
  assert.strictEqual(chsAfter2.length, 2, 'Số chương không được bị nhân lên 4');
  assert.strictEqual(getLibrary().length, 1, 'Số truyện trong thư viện vẫn là 1');
});

// -------------------------------------------------------------
// Test 9: Khôi phục tu vi tăng _rev và không ghi đè khi chưa xác nhận
// -------------------------------------------------------------
await runTest('Test 9: Khôi phục tu vi tăng _rev cao hơn và không ghi đè khi chưa xác nhận', async () => {
  localStorage.clear();
  setActiveProfile('real');

  saveCultivationState({
    currentRealm: 'Ngưng Khí',
    level: 3,
    exp: 200,
    thienMenh: 10,
    _rev: 15,
  });

  const fileCultState = {
    currentRealm: 'Kim Đan',
    level: 1,
    exp: 50000,
    thienMenh: 200,
    _rev: 8,
  };

  const backupObj = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: Date.now(),
    profile: 'real',
    parts: {
      novels: [],
      progress: [],
      cultivation: { state: fileCultState, pendingSeconds: 15 },
      settings: null,
      vault: null,
    },
    checksum: '',
  };
  backupObj.checksum = await computeSHA256(canonicalJsonStringify(backupObj.parts));

  // Trường hợp 1: confirmCultivation = false -> KHÔNG ghi đè
  await performRestore({
    backupObj,
    mode: 'merge',
    selectedParts: { cultivation: true },
    confirmCultivation: false,
  });
  let curCult = getCultivationState();
  assert.strictEqual(curCult.currentRealm, 'Ngưng Khí', 'Không được ghi đè khi chưa xác nhận');
  assert.strictEqual(curCult._rev, 16);

  // Trường hợp 2: confirmCultivation = true -> Ghi đè và _rev tăng > max(16, 8)
  await performRestore({
    backupObj,
    mode: 'merge',
    selectedParts: { cultivation: true },
    confirmCultivation: true,
  });
  curCult = getCultivationState();
  assert.strictEqual(curCult.currentRealm, 'Kim Đan', 'Đã ghi đè sau khi xác nhận');
  assert.ok(curCult._rev > 16, `_rev mới (${curCult._rev}) phải lớn hơn 16`);
  assert.strictEqual(localStorage.getItem('cultivation_pending_seconds'), '15');
});

// -------------------------------------------------------------
// Test 10: Truyện khôi phục gỡ tombstone và đánh dấu dirty
// -------------------------------------------------------------
await runTest('Test 10: Truyện khôi phục gỡ tombstone cục bộ và được đánh dấu dirty causal', async () => {
  localStorage.clear();
  mockDB.clear();

  // Đặt tombstone cho novel_tomb
  recordNovelTombstone('novel_tomb', 1000);
  assert.ok(getTombstones()['novel_tomb'], 'Tombstone ban đầu phải tồn tại');

  const novelItem = {
    id: 'novel_tomb',
    title: 'Truyện Đã Từng Bị Xóa',
    updatedAt: 2000,
  };

  const backupObj = {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: Date.now(),
    profile: 'real',
    parts: {
      novels: [novelItem],
      progress: [],
      cultivation: null,
      settings: null,
      vault: null,
    },
    checksum: '',
  };
  backupObj.checksum = await computeSHA256(canonicalJsonStringify(backupObj.parts));

  await performRestore({
    backupObj,
    mode: 'merge',
    selectedParts: { novels: true },
  });

  // Kiểm tra tombstone đã được gỡ
  const tombstones = getTombstones();
  assert.strictEqual(tombstones['novel_tomb'], undefined, 'Tombstone phải được gỡ bỏ hoàn toàn');

  // Kiểm tra dirty novels có chứa novel_tomb
  const dirty = getDirtyNovels();
  assert.ok(dirty['novel_tomb'], 'Truyện khôi phục phải được đánh dấu dirty để đồng bộ cloud');
  assert.ok(dirty['novel_tomb'] >= Date.now() - 5000, 'Dirty timestamp phải là causal thời gian thực');
});

// -------------------------------------------------------------
// Test 11: Tải file .json thường và .json.gz đều đọc và nhập thành công
// -------------------------------------------------------------
await runTest('Test 11: Đọc và nhập thành công từ cả định dạng JSON thường và nén Gzip (.gz)', async () => {
  localStorage.clear();
  mockDB.clear();

  const novelItem = {
    id: 'novel_multi_format',
    title: 'Truyện Kiểm Tra Định Dạng',
    updatedAt: 1000,
  };

  const exportRes = await createBackupData({
    includeContent: false,
    parts: { novels: true, progress: false, cultivation: false, settings: false, vault: false },
  });

  // 1. Kiểm tra đọc từ chuỗi JSON thường
  const fromPlainJson = await parseAndVerifyBackupFile(exportRes.jsonStr);
  assert.strictEqual(fromPlainJson.format, BACKUP_FORMAT);
  assert.strictEqual(fromPlainJson.parts.novels.length, 0); // Chưa add truyện vào lib nên len 0

  // 2. Thêm truyện và xuất dạng nén Gzip
  await saveNovel(novelItem);
  addToLibrary(novelItem);
  const exportGzRes = await createBackupData({
    includeContent: false,
    parts: { novels: true, progress: false, cultivation: false, settings: false, vault: false },
  });

  assert.strictEqual(isGzip(exportGzRes.bytes), true, 'Magic bytes phải nhận diện là Gzip');

  // Kiểm tra giải nén và parse
  const fromGz = await parseAndVerifyBackupFile(exportGzRes.bytes);
  assert.strictEqual(fromGz.format, BACKUP_FORMAT);
  assert.strictEqual(fromGz.parts.novels.length, 1);
  assert.strictEqual(fromGz.parts.novels[0].id, 'novel_multi_format');
});

// -------------------------------------------------------------
// Test 12: Trùng tên khác id mặc định là 'skip' (truyện cũ và chương cũ nguyên vẹn)
// -------------------------------------------------------------
await runTest("Test 12: Trùng tên khác id mặc định là 'skip' (truyện cũ và chương cũ nguyên vẹn)", async () => {
  localStorage.clear();
  mockDB.clear();

  // Truyện trên máy
  const localNovel = {
    id: 'local_novel_id',
    title: 'Phàm Nhân Tu Tiên',
    author: 'Vong Ngữ',
    updatedAt: 1000,
    chapterCount: 2,
    totalChapters: 2,
  };
  const localChapters = [
    { id: 'ch_local_1', novelId: 'local_novel_id', title: 'Chương 1 Gốc', content: 'Gốc 1' },
    { id: 'ch_local_2', novelId: 'local_novel_id', title: 'Chương 2 Gốc', content: 'Gốc 2' },
  ];
  await saveNovel(localNovel);
  await saveChaptersBulk(localChapters);
  addToLibrary(localNovel);

  // File sao lưu chứa truyện cùng tên chuẩn hóa nhưng ID khác
  const backupNovel = {
    id: 'backup_novel_id',
    title: '  phàm nhân  tu tiên  ', // Cùng tên sau chuẩn hóa
    author: 'Vong Ngữ 2',
    updatedAt: 5000, // Dù updatedAt mới hơn
    chapterCount: 2,
    totalChapters: 2,
    chapters: [
      { id: 'ch_backup_1', novelId: 'backup_novel_id', title: 'Chương 1 File', content: 'File 1' },
      { id: 'ch_backup_2', novelId: 'backup_novel_id', title: 'Chương 2 File', content: 'File 2' },
    ],
  };

  const backupObj = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: 5000,
    profile: 'real',
    parts: {
      novels: [backupNovel],
      progress: [],
      cultivation: null,
      settings: null,
      vault: null,
    },
    checksum: 'mock',
  };

  // Khôi phục không truyền titleConflictResolutions (hoặc {} rỗng) -> mặc định phải là 'skip'
  const report = await performRestore({
    backupObj,
    mode: 'merge',
  });

  assert.strictEqual(report.skippedNovels, 1, 'Truyện trùng tên khác ID phải bị skip theo mặc định');
  assert.strictEqual(report.addedNovels, 0);
  assert.strictEqual(report.updatedNovels, 0);

  // Kiểm tra truyện trên máy nguyên vẹn
  const lib = getLibrary();
  assert.strictEqual(lib.length, 1);
  assert.strictEqual(lib[0].id, 'local_novel_id');
  assert.strictEqual(lib[0].author, 'Vong Ngữ');

  // Kiểm tra chương truyện cũ nguyên vẹn
  const chaptersInDB = await getChapters('local_novel_id');
  assert.strictEqual(chaptersInDB.length, 2);
  assert.strictEqual(chaptersInDB[0].title, 'Chương 1 Gốc');
  assert.strictEqual(chaptersInDB[1].title, 'Chương 2 Gốc');

  // Chương từ file tuyệt đối không được ghi vào
  const backupCh1 = await mockDB.get('chapters', 'ch_backup_1');
  assert.strictEqual(backupCh1, undefined);
});

// -------------------------------------------------------------
// Test 13: Trùng tên khác id khi chọn 'overwrite': chương cũ bị xóa sạch, chương mới được ghi, id truyện đích giữ nguyên, không có tombstone
// -------------------------------------------------------------
await runTest("Test 13: Trùng tên khác id khi chọn 'overwrite': chương cũ bị xóa sạch, chương mới được ghi, id truyện đích giữ nguyên, không có tombstone", async () => {
  localStorage.clear();
  mockDB.clear();

  const localNovel = {
    id: 'local_tn_id',
    title: 'Tiên Nghịch',
    author: 'Nhĩ Căn',
    updatedAt: 1000,
    chapterCount: 2,
    totalChapters: 2,
  };
  const localChapters = [
    { id: 'tn_old_1', novelId: 'local_tn_id', title: 'Chương 1 Cũ', content: 'Nội dung cũ 1' },
    { id: 'tn_old_2', novelId: 'local_tn_id', title: 'Chương 2 Cũ', content: 'Nội dung cũ 2' },
  ];
  await saveNovel(localNovel);
  await saveChaptersBulk(localChapters);
  addToLibrary(localNovel);

  const backupNovel = {
    id: 'file_tn_id',
    title: 'Tiên Nghịch',
    author: 'Nhĩ Căn (Bản Mới)',
    updatedAt: 2000,
    chapterCount: 3,
    totalChapters: 3,
    chapters: [
      { id: 'tn_new_1', novelId: 'file_tn_id', title: 'Chương 1 Mới', content: 'Mới 1' },
      { id: 'tn_new_2', novelId: 'file_tn_id', title: 'Chương 2 Mới', content: 'Mới 2' },
      { id: 'tn_new_3', novelId: 'file_tn_id', title: 'Chương 3 Mới', content: 'Mới 3' },
    ],
  };

  const backupObj = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: 2000,
    profile: 'real',
    parts: {
      novels: [backupNovel],
      progress: [],
      cultivation: null,
      settings: null,
      vault: null,
    },
    checksum: 'mock',
  };

  // Người dùng CHỦ ĐỘNG chọn 'overwrite' cho truyện trùng tên
  const report = await performRestore({
    backupObj,
    mode: 'merge',
    titleConflictResolutions: {
      file_tn_id: 'overwrite',
    },
  });

  assert.strictEqual(report.updatedNovels, 1);
  assert.strictEqual(report.skippedNovels, 0);

  // ID truyện đích được giữ nguyên
  const lib = getLibrary();
  assert.strictEqual(lib.length, 1);
  assert.strictEqual(lib[0].id, 'local_tn_id');
  assert.strictEqual(lib[0].author, 'Nhĩ Căn (Bản Mới)');
  assert.strictEqual(lib[0].chapterCount, 3);

  // Không có tombstone nào được tạo
  const tombstones = getTombstones();
  assert.strictEqual(tombstones['local_tn_id'], undefined);
  assert.strictEqual(tombstones['file_tn_id'], undefined);

  // Kiểm tra: toàn bộ chương cũ bị xóa sạch
  const oldCh1 = await mockDB.get('chapters', 'tn_old_1');
  const oldCh2 = await mockDB.get('chapters', 'tn_old_2');
  assert.strictEqual(oldCh1, undefined, 'Chương cũ tn_old_1 phải bị xóa hoàn toàn');
  assert.strictEqual(oldCh2, undefined, 'Chương cũ tn_old_2 phải bị xóa hoàn toàn');

  // Kiểm tra: toàn bộ chương mới được ghi với novelId là local_tn_id
  const chaptersInDB = await getChapters('local_tn_id');
  assert.strictEqual(chaptersInDB.length, 3);
  assert.strictEqual(chaptersInDB[0].id, 'tn_new_1');
  assert.strictEqual(chaptersInDB[0].novelId, 'local_tn_id');
  assert.strictEqual(chaptersInDB[2].id, 'tn_new_3');
  assert.strictEqual(chaptersInDB[2].novelId, 'local_tn_id');
});

// -------------------------------------------------------------
// Test 14: 'create_new' không đè chương của truyện khác (kể cả khi trùng chapter.id)
// -------------------------------------------------------------
await runTest("Test 14: 'create_new' không đè chương của truyện khác (kể cả khi trùng chapter.id)", async () => {
  localStorage.clear();
  mockDB.clear();

  // Truyện A trên máy có chương 'shared_ch_1'
  const novelA = {
    id: 'novel_A',
    title: 'Cầu Ma',
    author: 'Tác Giả Gốc',
    updatedAt: 1000,
    chapterCount: 1,
    totalChapters: 1,
  };
  const chaptersA = [
    { id: 'shared_ch_1', novelId: 'novel_A', title: 'Chương 1 Gốc của Truyện A', content: 'Nội dung gốc A' },
  ];
  await saveNovel(novelA);
  await saveChaptersBulk(chaptersA);
  addToLibrary(novelA);

  // File sao lưu chứa truyện B (cùng tên) nhưng cũng có chapter.id là 'shared_ch_1'
  const novelB = {
    id: 'novel_B',
    title: 'Cầu Ma',
    author: 'Tác Giả Khác',
    updatedAt: 2000,
    chapterCount: 1,
    totalChapters: 1,
    chapters: [
      { id: 'shared_ch_1', novelId: 'novel_B', title: 'Chương 1 của Truyện B', content: 'Nội dung file B' },
    ],
  };

  const backupObj = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: 2000,
    profile: 'real',
    parts: {
      novels: [novelB],
      progress: [],
      cultivation: null,
      settings: null,
      vault: null,
    },
    checksum: 'mock',
  };

  // Người dùng chọn 'create_new'
  const report = await performRestore({
    backupObj,
    mode: 'merge',
    titleConflictResolutions: {
      novel_B: 'create_new',
    },
  });

  assert.strictEqual(report.addedNovels, 1);

  // Thư viện bây giờ có 2 truyện
  const lib = getLibrary();
  assert.strictEqual(lib.length, 2);
  const createdNovel = lib.find(n => n.id !== 'novel_A');
  assert.ok(createdNovel, 'Phải tạo một truyện mới với ID khác novel_A');

  // Truyện A và chương của truyện A không hề bị đè
  const chA = await mockDB.get('chapters', 'shared_ch_1');
  assert.strictEqual(chA.novelId, 'novel_A');
  assert.strictEqual(chA.title, 'Chương 1 Gốc của Truyện A');

  // Truyện mới có chương riêng được gán id an toàn với tiền tố targetId
  const chNewInDB = await getChapters(createdNovel.id);
  assert.strictEqual(chNewInDB.length, 1);
  assert.strictEqual(chNewInDB[0].id, `${createdNovel.id}_shared_ch_1`);
  assert.strictEqual(chNewInDB[0].title, 'Chương 1 của Truyện B');
});

// -------------------------------------------------------------
// Test 15: Thay thế mặc định không xóa truyện ngoài file; khi bật cờ mới xóa và ghi tombstone
// -------------------------------------------------------------
await runTest("Test 15: Thay thế mặc định không xóa truyện ngoài file; khi bật cờ mới xóa và ghi tombstone", async () => {
  localStorage.clear();
  mockDB.clear();

  const novelKeep = { id: 'novel_keep', title: 'Truyện Trong File', updatedAt: 1000 };
  const novelUnlisted1 = { id: 'novel_unlisted_1', title: 'Truyện Ngoài File 1', updatedAt: 1000 };
  const novelUnlisted2 = { id: 'novel_unlisted_2', title: 'Truyện Ngoài File 2', updatedAt: 1000 };

  await saveNovel(novelKeep);
  await saveNovel(novelUnlisted1);
  await saveNovel(novelUnlisted2);
  addToLibrary(novelKeep);
  addToLibrary(novelUnlisted1);
  addToLibrary(novelUnlisted2);

  const backupObj = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: 2000,
    profile: 'real',
    parts: {
      novels: [{ ...novelKeep, updatedAt: 2000, title: 'Truyện Trong File (Đã Cập Nhật)' }],
      progress: [],
      cultivation: null,
      settings: null,
      vault: null,
    },
    checksum: 'mock',
  };

  // 1. Chạy chế độ replace nhưng KHÔNG bật cờ deleteUnlistedNovels
  const reportDefault = await performRestore({
    backupObj,
    mode: 'replace',
    // deleteUnlistedNovels: false (mặc định)
  });

  assert.strictEqual(reportDefault.deletedNovels, 0, 'Mặc định không được xóa truyện ngoài file');
  const libAfterDefault = getLibrary();
  assert.strictEqual(libAfterDefault.length, 3, 'Cả 3 truyện phải còn nguyên trong thư viện');
  assert.ok(libAfterDefault.some(n => n.id === 'novel_unlisted_1'));
  assert.ok(libAfterDefault.some(n => n.id === 'novel_unlisted_2'));

  // 2. Chạy chế độ replace VÀ CHỦ ĐỘNG bật deleteUnlistedNovels: true
  const reportWithFlag = await performRestore({
    backupObj,
    mode: 'replace',
    deleteUnlistedNovels: true,
  });

  assert.strictEqual(reportWithFlag.deletedNovels, 2, 'Phải xóa 2 truyện ngoài file');
  const libAfterDelete = getLibrary();
  assert.strictEqual(libAfterDelete.length, 1);
  assert.strictEqual(libAfterDelete[0].id, 'novel_keep');

  // Kiểm tra tombstones được ghi nhận để đồng bộ xóa lên cloud
  const tombstones = getTombstones();
  assert.ok(tombstones['novel_unlisted_1'], 'Phải ghi tombstone cho novel_unlisted_1');
  assert.ok(tombstones['novel_unlisted_2'], 'Phải ghi tombstone cho novel_unlisted_2');
});

// -------------------------------------------------------------
// Test 16: Snapshot an toàn không chứa library (tránh QuotaExceededError)
// -------------------------------------------------------------
await runTest("Test 16: Snapshot an toàn không chứa library (tránh QuotaExceededError)", async () => {
  localStorage.clear();
  mockDB.clear();

  const novel = {
    id: 'novel_with_heavy_cover',
    title: 'Truyện Bìa Nặng',
    coverThumb: 'data:image/jpeg;base64,' + 'A'.repeat(5000), // Bìa nặng
    updatedAt: 1000,
  };
  await saveNovel(novel);
  addToLibrary(novel);

  const backupObj = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: 2000,
    profile: 'real',
    parts: { novels: [], progress: [], cultivation: null, settings: null, vault: null },
    checksum: 'mock',
  };

  await performRestore({
    backupObj,
    mode: 'merge',
  });

  const rawSnapshot = localStorage.getItem(PRE_RESTORE_SNAPSHOT_KEY);
  assert.ok(rawSnapshot, 'Phải lưu snapshot trước khi khôi phục');
  const snapshot = JSON.parse(rawSnapshot);

  assert.strictEqual(snapshot.library, undefined, 'Snapshot KHÔNG ĐƯỢC chứa object library đầy đủ');
  assert.ok(Array.isArray(snapshot.novelIds), 'Snapshot phải chứa mảng novelIds');
  assert.strictEqual(snapshot.novelIds[0], 'novel_with_heavy_cover');
  assert.ok(snapshot.timestamp > 0);
  assert.strictEqual(snapshot.mode, 'merge');
});

// -------------------------------------------------------------
// Test 17: Xuất file JSON compact (không thụt lề, không hardcode commit) vẫn khôi phục và kiểm tra checksum đúng
// -------------------------------------------------------------
await runTest("Test 17: Xuất file JSON compact (không thụt lề, không hardcode commit) vẫn khôi phục và kiểm tra checksum đúng", async () => {
  localStorage.clear();
  mockDB.clear();

  const novelItem = {
    id: 'novel_compact_test',
    title: 'Truyện Thử Nghiệm Compact',
    author: 'Tác Giả C',
    updatedAt: 1500,
  };
  await saveNovel(novelItem);
  addToLibrary(novelItem);

  const exportRes = await createBackupData({
    includeContent: false,
    parts: { novels: true, progress: false, cultivation: false, settings: false, vault: false },
  });

  // Kiểm tra không còn hardcode appCommit
  assert.strictEqual(exportRes.backupObj.appCommit, undefined, 'appCommit hardcode 0296b90 phải được gỡ bỏ');

  // Chuỗi JSON không chứa thụt lề định dạng 2-space
  assert.strictEqual(exportRes.jsonStr.includes('\n  "format"'), false, 'JSON không được thụt lề 2 space');

  // Đọc và verify checksum từ chuỗi compact
  const verified = await parseAndVerifyBackupFile(exportRes.jsonStr);
  assert.strictEqual(verified.format, BACKUP_FORMAT);
  assert.strictEqual(verified.parts.novels[0].id, 'novel_compact_test');

  // Khôi phục thành công vào môi trường mới
  localStorage.clear();
  mockDB.clear();
  const report = await performRestore({ backupObj: verified, mode: 'merge' });
  assert.strictEqual(report.addedNovels, 1);
  assert.strictEqual(getLibrary()[0].id, 'novel_compact_test');
});

// -------------------------------------------------------------
// Test 18: Trùng tên khác id chọn 'overwrite': tiến độ và scroll_pos giữ nguyên chapterId gốc
// -------------------------------------------------------------
await runTest("Test 18: Trùng tên khác id chọn 'overwrite': tiến độ và scroll_pos giữ nguyên chapterId gốc, trỏ đúng chương trong DB", async () => {
  localStorage.clear();
  mockDB.clear();

  // Máy có truyện đích 'local_tn_id' với 2 chương cũ
  const localNovel = {
    id: 'local_tn_id',
    title: 'Tiên Nghịch',
    author: 'Nhĩ Căn',
    updatedAt: 1000,
    chapterCount: 2,
    totalChapters: 2,
  };
  const localChapters = [
    { id: 'tn_old_1', novelId: 'local_tn_id', title: 'Chương 1 Cũ', content: 'Cũ 1' },
    { id: 'tn_old_2', novelId: 'local_tn_id', title: 'Chương 2 Cũ', content: 'Cũ 2' },
  ];
  await saveNovel(localNovel);
  await saveChaptersBulk(localChapters);
  addToLibrary(localNovel);

  // File sao lưu chứa truyện 'file_tn_id' có chương 'tn_new_2' kèm tiến độ & vị trí cuộn
  const backupNovel = {
    id: 'file_tn_id',
    title: 'Tiên Nghịch',
    author: 'Nhĩ Căn',
    updatedAt: 2000,
    chapterCount: 3,
    totalChapters: 3,
    chapters: [
      { id: 'tn_new_1', novelId: 'file_tn_id', title: 'Chương 1 Mới', content: 'Mới 1' },
      { id: 'tn_new_2', novelId: 'file_tn_id', title: 'Chương 2 Mới', content: 'Mới 2' },
      { id: 'tn_new_3', novelId: 'file_tn_id', title: 'Chương 3 Mới', content: 'Mới 3' },
    ],
  };

  const backupProgress = {
    novelId: 'file_tn_id',
    progress: {
      chapterId: 'tn_new_2',
      chapterTitle: 'Chương 2 Mới',
      progressPercent: 45,
      updatedAt: 2000,
    },
    scrollPositions: [
      { chapterId: 'tn_new_2', data: { scrollY: 350, paragraphIndex: 5 } },
    ],
  };

  const backupObj = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: 2000,
    profile: 'real',
    parts: {
      novels: [backupNovel],
      progress: [backupProgress],
      cultivation: null,
      settings: null,
      vault: null,
    },
    checksum: 'mock',
  };

  const report = await performRestore({
    backupObj,
    mode: 'merge',
    selectedParts: { novels: true, progress: true },
    titleConflictResolutions: {
      file_tn_id: 'overwrite',
    },
  });

  assert.strictEqual(report.updatedNovels, 1);
  assert.strictEqual(report.progressRestored, 1);

  // 1. Kiểm tra tiến độ được lưu cho id truyện đích 'local_tn_id'
  const restoredProg = getReadingProgress('local_tn_id');
  assert.ok(restoredProg, 'Phải có tiến độ đọc cho truyện đích local_tn_id');
  // 2. chapterId của tiến độ PHẢI giữ nguyên gốc 'tn_new_2' (KHÔNG được có tiền tố local_tn_id_)
  assert.strictEqual(restoredProg.chapterId, 'tn_new_2', 'Tiến độ chapterId phải là tn_new_2 nguyên gốc');

  // 3. Khóa scroll_pos_<id truyện đích>_<chapterId gốc> phải tồn tại
  const expectedScrollKey = 'scroll_pos_local_tn_id_tn_new_2';
  const rawScrollData = localStorage.getItem(expectedScrollKey);
  assert.ok(rawScrollData, `Khóa ${expectedScrollKey} phải tồn tại trong localStorage`);
  const scrollData = JSON.parse(rawScrollData);
  assert.strictEqual(scrollData.scrollY, 350);

  // Khóa sai có tiền tố không được tồn tại
  const wrongScrollKey = 'scroll_pos_local_tn_id_local_tn_id_tn_new_2';
  assert.strictEqual(localStorage.getItem(wrongScrollKey), null, 'Không được tạo khóa sai có tiền tố trùng lặp');

  // 4. Chương 'tn_new_2' phải thật sự tồn tại trong DB cho novelId 'local_tn_id'
  const chapterInDB = await mockDB.get('chapters', 'tn_new_2');
  assert.ok(chapterInDB, 'Chương tn_new_2 phải tồn tại trong DB');
  assert.strictEqual(chapterInDB.novelId, 'local_tn_id');
  assert.strictEqual(chapterInDB.title, 'Chương 2 Mới');
});

// -------------------------------------------------------------
// Test 19: Trùng tên khác id chọn 'create_new': tiến độ và scroll_pos trỏ đúng id chương mới có tiền tố
// -------------------------------------------------------------
await runTest("Test 19: Trùng tên khác id chọn 'create_new': tiến độ và scroll_pos trỏ đúng id chương mới có tiền tố và có trong DB", async () => {
  localStorage.clear();
  mockDB.clear();

  // Máy có truyện đích 'local_tn_id'
  const localNovel = {
    id: 'local_tn_id',
    title: 'Tiên Nghịch',
    author: 'Nhĩ Căn',
    updatedAt: 1000,
    chapterCount: 2,
    totalChapters: 2,
  };
  const localChapters = [
    { id: 'tn_old_1', novelId: 'local_tn_id', title: 'Chương 1 Cũ', content: 'Cũ 1' },
    { id: 'tn_old_2', novelId: 'local_tn_id', title: 'Chương 2 Cũ', content: 'Cũ 2' },
  ];
  await saveNovel(localNovel);
  await saveChaptersBulk(localChapters);
  addToLibrary(localNovel);

  // File sao lưu chứa truyện 'file_tn_id' có chương 'tn_new_2'
  const backupNovel = {
    id: 'file_tn_id',
    title: 'Tiên Nghịch',
    author: 'Nhĩ Căn',
    updatedAt: 2000,
    chapterCount: 2,
    totalChapters: 2,
    chapters: [
      { id: 'tn_new_1', novelId: 'file_tn_id', title: 'Chương 1 Mới', content: 'Mới 1' },
      { id: 'tn_new_2', novelId: 'file_tn_id', title: 'Chương 2 Mới', content: 'Mới 2' },
    ],
  };

  const backupProgress = {
    novelId: 'file_tn_id',
    progress: {
      chapterId: 'tn_new_2',
      chapterTitle: 'Chương 2 Mới',
      progressPercent: 60,
      updatedAt: 2000,
    },
    scrollPositions: [
      { chapterId: 'tn_new_2', data: { scrollY: 500, paragraphIndex: 8 } },
    ],
  };

  const backupObj = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: 2000,
    profile: 'real',
    parts: {
      novels: [backupNovel],
      progress: [backupProgress],
      cultivation: null,
      settings: null,
      vault: null,
    },
    checksum: 'mock',
  };

  const report = await performRestore({
    backupObj,
    mode: 'merge',
    selectedParts: { novels: true, progress: true },
    titleConflictResolutions: {
      file_tn_id: 'create_new',
    },
  });

  assert.strictEqual(report.addedNovels, 1);
  assert.strictEqual(report.progressRestored, 1);

  // Tìm truyện mới được tạo trong thư viện
  const lib = getLibrary();
  assert.strictEqual(lib.length, 2);
  const createdNovel = lib.find(n => n.id !== 'local_tn_id');
  assert.ok(createdNovel, 'Phải tạo novel mới với ID khác local_tn_id');
  const targetId = createdNovel.id;

  // 1. Tiến độ của truyện mới tạo phải có chapterId mang tiền tố targetId
  const expectedChapterId = `${targetId}_tn_new_2`;
  const restoredProg = getReadingProgress(targetId);
  assert.ok(restoredProg, `Phải có tiến độ đọc cho truyện mới ${targetId}`);
  assert.strictEqual(restoredProg.chapterId, expectedChapterId, `chapterId trong tiến độ phải là ${expectedChapterId}`);

  // 2. Khóa scroll_pos_<targetId>_<targetId_tn_new_2> phải tồn tại
  const expectedScrollKey = `scroll_pos_${targetId}_${expectedChapterId}`;
  const rawScrollData = localStorage.getItem(expectedScrollKey);
  assert.ok(rawScrollData, `Khóa ${expectedScrollKey} phải tồn tại trong localStorage`);
  const scrollData = JSON.parse(rawScrollData);
  assert.strictEqual(scrollData.scrollY, 500);

  // 3. Chương với ID mang tiền tố phải thật sự tồn tại trong DB với novelId là targetId
  const chapterInDB = await mockDB.get('chapters', expectedChapterId);
  assert.ok(chapterInDB, `Chương ${expectedChapterId} phải tồn tại trong DB`);
  assert.strictEqual(chapterInDB.novelId, targetId);
  assert.strictEqual(chapterInDB.title, 'Chương 2 Mới');
});

console.log(`\n=== TẤT CẢ ${passedTests}/19 BÀI TEST SAO LƯU & KHÔI PHỤC ĐÃ ĐẠT 100% HOÀN HẢO! ===`);
