import assert from 'assert';

// Mock localStorage in global scope for testing in Node
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

// Import cultivation functions
import { 
  getCultivationState, 
  saveCultivationState, 
  getCultivationKey,
  LEGACY_ITEM_MAP,
  LIFE_LAMPS,
  SUPPRESSING_ARTIFACTS
} from '../src/lib/cultivation.js';

console.log('--- STARTING COMPREHENSIVE MIGRATION TESTS ---\n');

// Verify LEGACY_ITEM_MAP
assert(LEGACY_ITEM_MAP.artifacts.luc_dao_luan_hoi_tien_can === 'de_kiem', 'LEGACY_ITEM_MAP artifacts map missing');
assert(LEGACY_ITEM_MAP.lamps.cuu_khieu_linh_lung === 'hoang_tuyen_bi_ngan', 'LEGACY_ITEM_MAP lamps map missing');
console.log('✓ Check 0: LEGACY_ITEM_MAP correctly exported and defined');

// ---------------------------------------------------------
// Test a: State có 'cuu_khieu_linh_lung' trong inventoryLamps và absorbedLamps -> sau khi nạp thành 'hoang_tuyen_bi_ngan'.
// ---------------------------------------------------------
console.log('\n--- Test A: Migration cuu_khieu_linh_lung in inventoryLamps & absorbedLamps ---');
global.localStorage.clear();

const stateA = {
  totalExp: 100000,
  realm: 'kim_dan',
  _rev: 5,
  inventoryLamps: [
    'thien_dao_chi_ton',
    'cuu_khieu_linh_lung',
    { id: 'cuu_khieu_linh_lung', name: 'Cửu Khiếu Linh Lung Đăng', tier: 'than_pham' }
  ],
  absorbedLamps: ['thien_dao_chi_ton', 'cuu_khieu_linh_lung'],
  logs: [{ text: 'Khởi đầu tu tiên', time: 1000 }],
};
global.localStorage.setItem(getCultivationKey('state'), JSON.stringify(stateA));

const resultA = getCultivationState();
assert.strictEqual(resultA.absorbedLamps[1], 'hoang_tuyen_bi_ngan', 'absorbedLamps[1] must be hoang_tuyen_bi_ngan');
assert.strictEqual(resultA.inventoryLamps[1], 'hoang_tuyen_bi_ngan', 'inventoryLamps[1] must be hoang_tuyen_bi_ngan');
assert.strictEqual(resultA.inventoryLamps[2].id, 'hoang_tuyen_bi_ngan', 'inventoryLamps[2].id must be hoang_tuyen_bi_ngan');
assert.strictEqual(resultA.inventoryLamps[2].name, 'Hoàng Tuyền Bỉ Ngạn Đăng', 'inventoryLamps[2].name must be Hoàng Tuyền Bỉ Ngạn Đăng');
assert(resultA.logs[0].text.includes('Cửu Khiếu Linh Lung Đăng đã hóa thành Hoàng Tuyền Bỉ Ngạn Đăng'), 'Log message must notify lamp transformation');
assert.strictEqual(resultA._rev, 6, '_rev must increment by 1');
console.log('✓ Test A passed: inventoryLamps and absorbedLamps successfully migrated to hoang_tuyen_bi_ngan');


// ---------------------------------------------------------
// Test b: State có 'luc_dao_luan_hoi_tien_can' trong inventoryArtifacts và palaceAnchors -> thành 'de_kiem'.
// ---------------------------------------------------------
console.log('\n--- Test B: Migration luc_dao_luan_hoi_tien_can in inventoryArtifacts & palaceAnchors ---');
global.localStorage.clear();

const stateB = {
  totalExp: 200000,
  realm: 'nguyen_anh',
  _rev: 10,
  inventoryArtifacts: [
    'am_duong_hon_don_nguyen_can',
    'luc_dao_luan_hoi_tien_can',
    { id: 'luc_dao_luan_hoi_tien_can', name: 'Lục Đạo Luân Hồi Tiên Căn', tier: 'than_pham' }
  ],
  palaceAnchors: {
    0: {
      id: 'luc_dao_luan_hoi_tien_can',
      name: 'Lục Đạo Luân Hồi Tiên Căn',
      palaceName: 'Lục Đạo Luân Hồi Cung',
      tier: 'than_pham'
    },
    1: {
      id: 'am_duong_hon_don_nguyen_can',
      name: 'Âm Dương Hỗn Độn Nguyên Căn',
      palaceName: 'Âm Dương Hỗn Độn Cung',
      tier: 'than_pham'
    }
  },
  logs: [{ text: 'Đột phá Nguyên Anh', time: 2000 }],
};
global.localStorage.setItem(getCultivationKey('state'), JSON.stringify(stateB));

const resultB = getCultivationState();
assert.strictEqual(resultB.inventoryArtifacts[1], 'de_kiem', 'inventoryArtifacts[1] must be de_kiem');
assert.strictEqual(resultB.inventoryArtifacts[2].id, 'de_kiem', 'inventoryArtifacts[2].id must be de_kiem');
assert.strictEqual(resultB.inventoryArtifacts[2].name, 'Đế Kiếm', 'inventoryArtifacts[2].name must be Đế Kiếm');
assert.strictEqual(resultB.palaceAnchors[0].id, 'de_kiem', 'palaceAnchors[0].id must be de_kiem');
assert.strictEqual(resultB.palaceAnchors[0].name, 'Đế Kiếm', 'palaceAnchors[0].name must be Đế Kiếm');
assert.strictEqual(resultB.palaceAnchors[0].palaceName, 'Đế Kiếm Cung', 'palaceAnchors[0].palaceName must be Đế Kiếm Cung');
assert(resultB.logs[0].text.includes('Lục Đạo Luân Hồi Tiên Căn đã hóa thành Đế Kiếm'), 'Log message must notify artifact transformation');
assert.strictEqual(resultB._rev, 11, '_rev must increment by 1');
console.log('✓ Test B passed: inventoryArtifacts and palaceAnchors successfully migrated to de_kiem');


// ---------------------------------------------------------
// Test c: State có Đạo Anh cũ -> chuyển sang Đạo Anh mới với đúng thuộc tính.
// (Đặc biệt: Đạo Anh tam_sinh_luan_hoi_an giữ nguyên không bị đổi).
// ---------------------------------------------------------
console.log('\n--- Test C: Migration old Dao Anh to new Dao Anh & preserve other Dao Anh ---');
global.localStorage.clear();

const stateC = {
  totalExp: 300000,
  realm: 'nguyen_anh',
  _rev: 20,
  daoAnhs: [
    {
      id: 'da_3_cuu_khieu',
      lampId: 'cuu_khieu_linh_lung',
      name: 'Cửu Khiếu Linh Lung Đạo Anh',
      palaceName: 'Cửu Khiếu Linh Lung Cung',
      element: 'Thất Sắc Thần Thể',
      tier: 'than_pham',
    },
    {
      id: 'da_luc_dao_luan_hoi_tien_can',
      artifactId: 'luc_dao_luan_hoi_tien_can',
      name: 'Luân Hồi Tiên Căn Đạo Anh',
      palaceName: 'Lục Đạo Luân Hồi Cung',
      element: 'Luân Hồi Tiên Căn Thần Thể',
      tier: 'than_pham',
    },
    {
      id: 'da_tam_sinh_luan_hoi_an',
      artifactId: 'tam_sinh_luan_hoi_an',
      name: 'Tam Sinh Luân Hồi Đạo Anh',
      palaceName: 'Lục Đạo Luân Hồi Cung',
      element: 'Tam Sinh Thần Thể',
      tier: 'than_pham',
    }
  ],
  logs: [{ text: 'Hình thành Đạo Anh', time: 3000 }],
};
global.localStorage.setItem(getCultivationKey('state'), JSON.stringify(stateC));

const resultC = getCultivationState();
// Check cuu khieu -> hoang tuyen
assert.strictEqual(resultC.daoAnhs[0].id, 'da_3_hoang_tuyen', 'da_3_cuu_khieu must become da_3_hoang_tuyen');
assert.strictEqual(resultC.daoAnhs[0].lampId, 'hoang_tuyen_bi_ngan', 'lampId must be hoang_tuyen_bi_ngan');
assert.strictEqual(resultC.daoAnhs[0].name, 'Hoàng Tuyền Bỉ Ngạn Đạo Anh', 'name must be Hoàng Tuyền Bỉ Ngạn Đạo Anh');
assert.strictEqual(resultC.daoAnhs[0].palaceName, 'Hoàng Tuyền Bỉ Ngạn Cung', 'palaceName must be Hoàng Tuyền Bỉ Ngạn Cung');
assert.strictEqual(resultC.daoAnhs[0].element, 'U Minh Thần Thể', 'element must be U Minh Thần Thể');

// Check luc dao luan hoi tien can -> de kiem
assert.strictEqual(resultC.daoAnhs[1].id, 'da_de_kiem', 'da_luc_dao_luan_hoi_tien_can must become da_de_kiem');
assert.strictEqual(resultC.daoAnhs[1].artifactId, 'de_kiem', 'artifactId must be de_kiem');
assert.strictEqual(resultC.daoAnhs[1].name, 'Đế Kiếm Đạo Anh', 'name must be Đế Kiếm Đạo Anh');
assert.strictEqual(resultC.daoAnhs[1].palaceName, 'Đế Kiếm Cung', 'palaceName must be Đế Kiếm Cung');

// Check tam_sinh_luan_hoi_an is UNCHANGED
assert.strictEqual(resultC.daoAnhs[2].id, 'da_tam_sinh_luan_hoi_an', 'tam_sinh_luan_hoi_an id must not change');
assert.strictEqual(resultC.daoAnhs[2].artifactId, 'tam_sinh_luan_hoi_an', 'tam_sinh_luan_hoi_an artifactId must not change');
assert.strictEqual(resultC.daoAnhs[2].palaceName, 'Lục Đạo Luân Hồi Cung', 'tam_sinh_luan_hoi_an palaceName must remain Lục Đạo Luân Hồi Cung');

console.log('✓ Test C passed: old Dao Anh migrated with exact attributes, tam_sinh_luan_hoi_an completely preserved');


// ---------------------------------------------------------
// Test d: Idempotency: chạy lại lần 2 không sinh log mới, state không đổi.
// ---------------------------------------------------------
console.log('\n--- Test D: Idempotency (second run produces NO new logs and NO state mutation) ---');
const logCountBefore = resultC.logs.length;
const revBefore = resultC._rev;
const serializedBefore = global.localStorage.getItem(getCultivationKey('state'));

const resultD = getCultivationState();
assert.strictEqual(resultD.logs.length, logCountBefore, 'Log count must remain strictly unchanged on second run');
assert.strictEqual(resultD._rev, revBefore, '_rev must remain strictly unchanged on second run');
const serializedAfter = global.localStorage.getItem(getCultivationKey('state'));
assert.strictEqual(serializedAfter, serializedBefore, 'localStorage content must be strictly unchanged');
console.log('✓ Test D passed: Idempotency strictly verified (0 new logs, 0 rev change, identical state)');


// ---------------------------------------------------------
// Test e: State không có đồ cũ -> không bị ảnh hưởng, không ghi log.
// ---------------------------------------------------------
console.log('\n--- Test E: Clean state without legacy items ---');
global.localStorage.clear();

const stateE = {
  totalExp: 50000,
  realm: 'truc_co',
  _rev: 1,
  inventoryArtifacts: ['thao_tu_kiem_quyet'],
  inventoryLamps: ['thien_dao_chi_ton'],
  absorbedLamps: ['thien_dao_chi_ton'],
  logs: [{ text: 'Gia nhập tông môn', time: 5000 }],
};
global.localStorage.setItem(getCultivationKey('state'), JSON.stringify(stateE));

const resultE = getCultivationState();
assert.strictEqual(resultE.logs.length, 1, 'Clean state must not produce migration logs');
assert.strictEqual(resultE.logs[0].text, 'Gia nhập tông môn', 'Clean state logs must match original');
assert.strictEqual(resultE._rev, 1, '_rev must remain 1');
console.log('✓ Test E passed: Clean state is completely unaffected, no logs written');

console.log('\n=== ALL TESTS A-E PASSED FLAWLESSLY! ===');
