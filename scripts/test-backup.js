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
const { setDBPromiseForTesting, saveNovel, saveChaptersBulk, getNovel, getChapters } = await import('../src/lib/db.js');
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
  BACKUP_FORMAT,
  BACKUP_VERSION,
  isAllowlistedStorageKey,
  canonicalJsonStringify,
  computeSHA256,
  isGzip,
} = await import('../src/lib/backup/backupEngine.js');

console.log('=== BẮT ĐẦU CHẠY TOÀN BỘ CÁC BÀI TEST SAO LƯU & KHÔI PHỤC (1-11) ===\n');

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

console.log(`\n=== TẤT CẢ ${passedTests}/11 BÀI TEST SAO LƯU & KHÔI PHỤC ĐÃ ĐẠT 100% HOÀN HẢO! ===`);
