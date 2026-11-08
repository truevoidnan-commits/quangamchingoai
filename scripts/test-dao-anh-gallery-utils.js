import assert from 'assert';
import { createServer } from 'vite';

async function run() {
  console.log('=== RUNNING TEST: test-dao-anh-gallery-utils.js ===');

  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

  const daoAnhData = await vite.ssrLoadModule('./src/lib/daoAnhData.js');
  const galleryUtils = await vite.ssrLoadModule('./src/lib/daoAnhGalleryUtils.js');

  const { DAO_ANH_ELEMENT_TYPES, DAO_ANH_LIST, getDaoAnhElementType } = daoAnhData;
  const { buildOwnershipMap, getDaoAnhStats } = galleryUtils;

  // 1. Verify HU_VO and category mappings
  console.log('\n--- 1. Kiểm tra danh mục Hư Vô & Fallback Khác ---');
  assert.ok(DAO_ANH_ELEMENT_TYPES.HU_VO, 'DAO_ANH_ELEMENT_TYPES.HU_VO must exist');
  assert.strictEqual(DAO_ANH_ELEMENT_TYPES.HU_VO.id, 'hu_vo');
  assert.strictEqual(DAO_ANH_ELEMENT_TYPES.HU_VO.name, 'Hư Vô & Tịch Diệt');
  assert.strictEqual(DAO_ANH_ELEMENT_TYPES.HU_VO.icon, 'orb');

  // Verify all categories in DAO_ANH_LIST resolve to a valid element type
  for (const def of DAO_ANH_LIST) {
    const el = getDaoAnhElementType(def.category);
    assert.ok(el, `Category ${def.category} must resolve`);
    assert.ok(el.name, `Category ${def.category} must have name`);
    assert.notStrictEqual(el.name, def.category, `Category name must not be raw id`);
  }

  const unknownEl = getDaoAnhElementType('unknown_galaxy_realm');
  assert.strictEqual(unknownEl.name, 'Khác', 'Unknown category must fall back to "Khác"');
  console.log('  ✓ Danh mục Hư Vô và hàm fallback hoạt động chính xác 100%');

  // 2. Test Empty / Null state
  console.log('\n--- 2. Kiểm tra state rỗng / null ---');
  const emptyMap = buildOwnershipMap(null);
  assert.strictEqual(Object.keys(emptyMap).length, DAO_ANH_LIST.length);
  for (const def of DAO_ANH_LIST) {
    const item = emptyMap[def.id];
    assert.strictEqual(item.owned, false);
    assert.strictEqual(item.statusText, 'Chưa sở hữu');
    assert.strictEqual(item.statusCode, 'unowned');
  }
  const emptyStats = getDaoAnhStats(emptyMap);
  assert.strictEqual(emptyStats.totalCount, 42);
  assert.strictEqual(emptyStats.ownedCount, 0);
  assert.strictEqual(emptyStats.maxKiepCount, 0);
  console.log('  ✓ State rỗng / null trả về 42 thẻ "Chưa sở hữu"');

  // 3. Test Dao Anh from Lamp & Artifact & Bag items
  console.log('\n--- 3. Kiểm tra sở hữu Mệnh Đăng, Vật Trấn Áp và Đồ trong túi ---');
  const mockState = {
    realm: 'nguyen_anh',
    inventoryArtifacts: ['de_kiem'], // Sẵn trong túi
    inventoryLamps: ['nguyen_thuy_thien_ma'], // Đèn trong túi
    palaceAnchors: {
      0: { id: 'tao_hoa_ngoc_diep', name: 'Tạo Hóa Ngọc Điệp Cung', tier: 'than_pham' },
    },
    daoAnhs: [
      {
        id: 'da_inst_1',
        name: 'Tạo Hóa Ngọc Điệp Đạo Anh',
        artifactId: 'tao_hoa_ngoc_diep',
        palaceIndex: 0,
        fromLamp: false,
        currentKiep: 3,
        currentExp: 4500,
        active: true,
      },
      {
        id: 'da_inst_2',
        name: 'Hỗn Độn Sơ Khai Đạo Anh',
        fromLamp: true,
        lampId: 'hon_don_so_khai',
        currentKiep: 5,
        currentExp: 10000,
        active: true,
      },
    ],
  };

  const map = buildOwnershipMap(mockState);
  assert.strictEqual(Object.keys(map).length, 42);

  // Tao Hoa Ngoc Diep (palace) -> owned
  const taoHoaDef = DAO_ANH_LIST.find((d) => d.sourceId === 'tao_hoa_ngoc_diep');
  assert.ok(taoHoaDef, 'Tao Hoa Ngoc Diep def must exist');
  const taoHoaStatus = map[taoHoaDef.id];
  assert.strictEqual(taoHoaStatus.owned, true);
  assert.strictEqual(taoHoaStatus.source, 'palace');
  assert.strictEqual(taoHoaStatus.kiep, 3);
  assert.strictEqual(taoHoaStatus.statusText, 'Đang tọa trấn · Kiếp 3/5');

  // Hon Don So Khai (lamp) -> owned
  const honDonDef = DAO_ANH_LIST.find((d) => d.sourceId === 'hon_don_so_khai');
  assert.ok(honDonDef, 'Hon Don So Khai def must exist');
  const honDonStatus = map[honDonDef.id];
  assert.strictEqual(honDonStatus.owned, true);
  assert.strictEqual(honDonStatus.source, 'lamp');
  assert.strictEqual(honDonStatus.kiep, 5);
  assert.strictEqual(honDonStatus.statusText, 'Đang tọa trấn · Kiếp 5/5');

  // De Kiem (in bag) -> in_bag
  const deKiemDef = DAO_ANH_LIST.find((d) => d.sourceId === 'de_kiem');
  assert.ok(deKiemDef, 'De Kiem def must exist');
  const deKiemStatus = map[deKiemDef.id];
  assert.strictEqual(deKiemStatus.owned, false);
  assert.strictEqual(deKiemStatus.inBag, true);
  assert.strictEqual(deKiemStatus.statusText, 'Sẵn trong túi');

  // Stats
  const stats = getDaoAnhStats(map);
  assert.strictEqual(stats.totalCount, 42);
  assert.strictEqual(stats.ownedCount, 2);
  assert.strictEqual(stats.maxKiepCount, 1);
  console.log('  ✓ Sở hữu và trạng thái đồ trong túi chính xác 100%');

  await vite.close();
  console.log('\n🎉 ALL DAO ANH GALLERY UTILS TESTS PASSED!');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
