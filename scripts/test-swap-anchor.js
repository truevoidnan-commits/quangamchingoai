import assert from 'assert';
import { createServer } from 'vite';

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
global.window = {
  dispatchEvent: () => {},
};

console.log('=== BẮT ĐẦU TEST: LOGIC SWAP ANCHORED ARTIFACT (scripts/test-swap-anchor.js) ===\n');

const vite = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
});

const {
  getCultivationState,
  saveCultivationState,
  getCultivationKey,
  swapAnchoredArtifact,
  anchorPalaceWithArtifact,
} = await vite.ssrLoadModule('src/lib/cultivation.js');

const { findDaoAnhDefinition } = await vite.ssrLoadModule('src/lib/daoAnhData.js');

// Helper to set mock state
function setTestState(state) {
  global.localStorage.clear();
  const fullState = {
    realm: 'kim_dan',
    maxThienCung: 13,
    realizedThienCung: 0,
    currentThienCungExp: 0,
    storedExp: 0,
    daoAnhExp: 0,
    absorbedLamps: [],
    inventoryLamps: [],
    inventoryArtifacts: [],
    palaceAnchors: {},
    daoAnhs: [],
    logs: [],
    ...state,
  };
  global.localStorage.setItem(getCultivationKey('state'), JSON.stringify(fullState));
}

// -------------------------------------------------------------
// CA 1: Kim Đan, đã khảm 2 cung, đổi cung 0 sang vật khác trong túi
// -------------------------------------------------------------
console.log('Test 1: Kim Đan, đổi cung 0 sang vật khác trong túi');
{
  setTestState({
    realm: 'kim_dan',
    realizedThienCung: 2,
    currentThienCungExp: 450,
    inventoryArtifacts: ['tam_thu_dao', 'thao_tu_kiem_quyet'],
    palaceAnchors: {
      0: { id: 'tao_hoa_ngoc_diep', name: 'Tạo Hóa Ngọc Điệp Cung', tier: 'than_pham' },
      1: { id: 'tran_nguc_minh_vuong_the', name: 'Trấn Ngục Minh Vương Cung', tier: 'than_pham' },
    },
  });

  const res = swapAnchoredArtifact(0, 'tam_thu_dao');
  const state = getCultivationState();

  assert.strictEqual(state.palaceAnchors[0].id, 'tam_thu_dao', 'Palace 0 anchor id phải đổi sang tam_thu_dao');
  assert.ok(state.inventoryArtifacts.includes('tao_hoa_ngoc_diep'), 'Vật cũ (tao_hoa_ngoc_diep) phải trả về túi');
  assert.ok(!state.inventoryArtifacts.includes('tam_thu_dao'), 'Vật mới (tam_thu_dao) phải rút khỏi túi');
  assert.strictEqual(state.inventoryArtifacts.length, 2, 'Số lượng trong túi phải bảo toàn');
  assert.strictEqual(state.realizedThienCung, 2, 'realizedThienCung không được đổi');
  assert.strictEqual(state.currentThienCungExp, 450, 'currentThienCungExp không được đổi');
  console.log('  ✓ Đổi cung 0 thành công: vật cũ về túi, vật mới rời túi, exp bảo toàn');
}

// -------------------------------------------------------------
// CA 2: Nguyên Anh có Đạo Anh (currentKiep=3, currentExp>0)
// -------------------------------------------------------------
console.log('\nTest 2: Nguyên Anh có Đạo Anh đồng bộ Đạo Anh tương ứng');
{
  setTestState({
    realm: 'nguyen_anh',
    maxThienCung: 13,
    realizedThienCung: 13,
    absorbedLamps: ['ha_pham_lamp_1', 'ha_pham_lamp_2'], // 2 lamps
    inventoryArtifacts: ['de_kiem'],
    palaceAnchors: {
      0: { id: 'tao_hoa_ngoc_diep', name: 'Tạo Hóa Ngọc Điệp', palaceName: 'Tạo Hóa Ngọc Điệp Cung', tier: 'than_pham' },
      1: { id: 'tran_nguc_minh_vuong_the', name: 'Trấn Ngục Minh Vương Thể', palaceName: 'Trấn Ngục Minh Vương Cung', tier: 'than_pham' },
    },
    daoAnhs: [
      {
        id: 'da_palace_0',
        palaceIndex: 12, // selfLocalIdx = (13 - 1) - 12 = 0
        palaceName: 'Tạo Hóa Ngọc Điệp Cung',
        name: 'Đạo Anh · Tạo Hóa Ngọc Điệp',
        element: 'Ngọc Điệp Thần Thể',
        fromLamp: false,
        artifactId: 'tao_hoa_ngoc_diep',
        tier: 'than_pham',
        currentKiep: 3,
        currentExp: 2450,
        maxExp: 15000,
      },
      {
        id: 'da_palace_1',
        palaceIndex: 11,
        palaceName: 'Trấn Ngục Minh Vương Cung',
        name: 'Đạo Anh · Minh Vương Thể',
        element: 'Minh Vương Thần Thể',
        fromLamp: false,
        artifactId: 'tran_nguc_minh_vuong_the',
        tier: 'than_pham',
        currentKiep: 1,
        currentExp: 500,
        maxExp: 5000,
      },
    ],
  });

  const res = swapAnchoredArtifact(0, 'de_kiem');
  const state = getCultivationState();

  const targetDa = state.daoAnhs.find(d => d.id === 'da_palace_0');
  assert.ok(targetDa, 'Đạo Anh da_palace_0 phải tồn tại');
  assert.strictEqual(targetDa.id, 'da_palace_0', 'ID Đạo Anh phải giữ nguyên');
  assert.strictEqual(targetDa.artifactId, 'de_kiem', 'artifactId Đạo Anh phải đổi sang de_kiem');
  assert.strictEqual(targetDa.tier, 'than_pham', 'Tier Đạo Anh phải cập nhật theo de_kiem');
  assert.strictEqual(targetDa.currentKiep, 3, 'currentKiep phải giữ nguyên là 3');
  assert.strictEqual(targetDa.currentExp, 2450, 'currentExp phải giữ nguyên là 2450');
  assert.strictEqual(state.daoAnhs[0].id, 'da_palace_0', 'Thứ tự trong mảng daoAnhs phải giữ nguyên');

  // Verify findDaoAnhDefinition resolves to de_kiem definition
  const def = findDaoAnhDefinition(targetDa, state);
  assert.strictEqual(def.sourceId, 'de_kiem', 'findDaoAnhDefinition phải trả về định nghĩa de_kiem');
  assert.strictEqual(def.category, 'kiem_dao', 'Category phải là kiem_dao');
  console.log('  ✓ Đạo Anh đồng bộ hoàn hảo: id/kiếp/exp giữ nguyên, thuộc tính/tier/def theo vật mới');
}

// -------------------------------------------------------------
// CA 3: Có cả Đạo Anh Mệnh Đăng và Đạo Anh vật trấn áp
// -------------------------------------------------------------
console.log('\nTest 3: Không ảnh hưởng Đạo Anh Mệnh Đăng hoặc Đạo Anh cung khác');
{
  setTestState({
    realm: 'nguyen_anh',
    maxThienCung: 13,
    absorbedLamps: ['lamp_alpha', 'lamp_beta'],
    inventoryArtifacts: ['tam_thu_dao'],
    palaceAnchors: {
      0: { id: 'tao_hoa_ngoc_diep', name: 'Tạo Hóa Ngọc Điệp', palaceName: 'Tạo Hóa Ngọc Điệp Cung', tier: 'than_pham' },
      1: { id: 'tran_nguc_minh_vuong_the', name: 'Trấn Ngục Minh Vương Thể', palaceName: 'Trấn Ngục Minh Vương Cung', tier: 'than_pham' },
    },
    daoAnhs: [
      {
        id: 'da_lamp_0',
        palaceIndex: 0,
        palaceName: 'Mệnh Đăng Cung Alpha',
        name: 'Đạo Anh · Alpha',
        fromLamp: true,
        lampId: 'lamp_alpha',
        tier: 'than_pham',
        currentKiep: 4,
      },
      {
        id: 'da_lamp_1',
        palaceIndex: 1,
        palaceName: 'Mệnh Đăng Cung Beta',
        name: 'Đạo Anh · Beta',
        fromLamp: true,
        lampId: 'lamp_beta',
        tier: 'than_pham',
        currentKiep: 2,
      },
      {
        id: 'da_self_0',
        palaceIndex: 12, // selfLocalIdx 0
        fromLamp: false,
        artifactId: 'tao_hoa_ngoc_diep',
        currentKiep: 2,
      },
      {
        id: 'da_self_1',
        palaceIndex: 11, // selfLocalIdx 1
        fromLamp: false,
        artifactId: 'tran_nguc_minh_vuong_the',
        currentKiep: 1,
      },
    ],
  });

  swapAnchoredArtifact(0, 'tam_thu_dao');
  const state = getCultivationState();

  const lampDa0 = state.daoAnhs.find(d => d.id === 'da_lamp_0');
  const lampDa1 = state.daoAnhs.find(d => d.id === 'da_lamp_1');
  const selfDa1 = state.daoAnhs.find(d => d.id === 'da_self_1');
  const selfDa0 = state.daoAnhs.find(d => d.id === 'da_self_0');

  assert.strictEqual(lampDa0.lampId, 'lamp_alpha', 'Đạo Anh Mệnh Đăng 0 không bị đổi');
  assert.strictEqual(lampDa1.lampId, 'lamp_beta', 'Đạo Anh Mệnh Đăng 1 không bị đổi');
  assert.strictEqual(selfDa1.artifactId, 'tran_nguc_minh_vuong_the', 'Đạo Anh cung 1 không bị đổi');
  assert.strictEqual(selfDa0.artifactId, 'tam_thu_dao', 'Chỉ Đạo Anh cung 0 bị đổi');
  console.log('  ✓ Đạo Anh Mệnh Đăng và Đạo Anh cung khác được cách ly an toàn 100%');
}

// -------------------------------------------------------------
// CA 4: Các ca lỗi và bảo đảm không rò rỉ trạng thái
// -------------------------------------------------------------
console.log('\nTest 4: Kiểm tra các ca ném lỗi và tính nguyên tử');
{
  const baseState = {
    realm: 'kim_dan',
    maxThienCung: 13,
    absorbedLamps: ['lamp_1'],
    inventoryArtifacts: ['tam_thu_dao'],
    palaceAnchors: {
      0: { id: 'tao_hoa_ngoc_diep', name: 'Tạo Hóa Ngọc Điệp' },
    },
  };

  // 4.1 Đổi sang chính vật đang khảm
  setTestState(baseState);
  assert.throws(() => {
    swapAnchoredArtifact(0, 'tao_hoa_ngoc_diep');
  }, /phải khác/, 'Phải ném lỗi khi đổi sang chính nó');
  assert.strictEqual(getCultivationState().palaceAnchors[0].id, 'tao_hoa_ngoc_diep', 'State không bị đổi khi lỗi');

  // 4.2 Vật không có trong túi
  assert.throws(() => {
    swapAnchoredArtifact(0, 'not_in_inventory');
  }, /Túi Trữ Vật/, 'Phải ném lỗi khi vật không có trong túi');
  assert.deepStrictEqual(getCultivationState().inventoryArtifacts, ['tam_thu_dao'], 'Túi không bị rò rỉ khi lỗi');

  // 4.3 Cung Mệnh Đăng
  assert.throws(() => {
    swapAnchoredArtifact(12, 'tam_thu_dao'); // index >= 13 - 1 = 12 là Mệnh Đăng
  }, /Mệnh Đăng/, 'Phải ném lỗi khi chọn cung Mệnh Đăng');

  // 4.4 Cung chưa khảm
  assert.throws(() => {
    swapAnchoredArtifact(3, 'tam_thu_dao');
  }, /chưa được khảm nạm/, 'Phải ném lỗi khi cung chưa khảm');

  // 4.5 Realm Linh Tàng
  setTestState({
    ...baseState,
    realm: 'linh_tang',
  });
  assert.throws(() => {
    swapAnchoredArtifact(0, 'tam_thu_dao');
  }, /Linh Tàng/, 'Phải ném lỗi thân thiện khi ở cảnh giới Linh Tàng');
  console.log('  ✓ Mọi ca vi phạm đều ném lỗi chính xác và trạng thái không bị rò rỉ');
}

// -------------------------------------------------------------
// CA 5: palaceAnchors dạng chuỗi (kiểu migration cũ)
// -------------------------------------------------------------
console.log('\nTest 5: palaceAnchors dạng chuỗi (dữ liệu legacy migration)');
{
  setTestState({
    realm: 'kim_dan',
    maxThienCung: 13,
    inventoryArtifacts: ['tam_thu_dao'],
    palaceAnchors: {
      0: 'tao_hoa_ngoc_diep', // chuỗi id
    },
  });

  const res = swapAnchoredArtifact(0, 'tam_thu_dao');
  const state = getCultivationState();

  assert.strictEqual(typeof state.palaceAnchors[0], 'object', 'Anchor sau đổi phải là object chuẩn');
  assert.strictEqual(state.palaceAnchors[0].id, 'tam_thu_dao', 'ID mới phải là tam_thu_dao');
  assert.ok(state.inventoryArtifacts.includes('tao_hoa_ngoc_diep'), 'Vật cũ dạng chuỗi phải được hoàn về túi');
  console.log('  ✓ Hỗ trợ chuỗi legacy hoàn hảo');
}

// -------------------------------------------------------------
// CA 6: Đổi hai lần liên tiếp (A -> B -> A)
// -------------------------------------------------------------
console.log('\nTest 6: Đổi hai lần liên tiếp A -> B -> A');
{
  setTestState({
    realm: 'kim_dan',
    maxThienCung: 13,
    inventoryArtifacts: ['tam_thu_dao'],
    palaceAnchors: {
      0: { id: 'tao_hoa_ngoc_diep', name: 'Tạo Hóa Ngọc Điệp' },
    },
  });

  // A -> B
  swapAnchoredArtifact(0, 'tam_thu_dao');
  let state = getCultivationState();
  assert.strictEqual(state.palaceAnchors[0].id, 'tam_thu_dao');
  assert.deepStrictEqual(state.inventoryArtifacts, ['tao_hoa_ngoc_diep']);

  // B -> A
  swapAnchoredArtifact(0, 'tao_hoa_ngoc_diep');
  state = getCultivationState();
  assert.strictEqual(state.palaceAnchors[0].id, 'tao_hoa_ngoc_diep');
  assert.deepStrictEqual(state.inventoryArtifacts, ['tam_thu_dao']);
  console.log('  ✓ Đổi 2 chiều A -> B -> A nhất quán, túi đồ không bị nhân đôi hay mất mát');
}

await vite.close();
console.log('\n✅ TẤT CẢ 6 CA KIỂM THỬ LOGIC SWAP ANCHOR ĐỀU ĐẠT 100%!');
process.exit(0);
