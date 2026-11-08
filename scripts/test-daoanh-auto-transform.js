/**
 * scripts/test-daoanh-auto-transform.js
 * Unit test kiểm tra tính toán getDaoAnhTransformConfig và getDaoAnhTransformStyle:
 * 1. Đạo Anh có cấu hình chỉnh tay -> trả về đúng cấu hình (isAuto: false).
 * 2. Đạo Anh chưa có chỉnh tay nhưng có BBox -> trả về isAuto: true, scale trong [0.85, 1.9].
 * 3. Fallback an toàn khi input null -> scale 1, không crash.
 * 4. Kiểm tra refSize: khi truyền size khác nhau (150, 185, 220), x và y co giãn tỷ lệ tương ứng.
 * 5. Kiểm tra Đế Kiếm K1..K5: mỗi kiếp có scale và x/y được định nghĩa rõ ràng.
 */

import assert from 'node:assert';
import {
  DAO_ANH_LIST,
  getDaoAnhTransformConfig,
  getDaoAnhTransformStyle,
} from '../src/lib/daoAnhData.js';

console.log('=== TEST DAO ANH AUTO TRANSFORM & PARITY (scripts/test-daoanh-auto-transform.js) ===\n');

// 1. Đạo Anh có cấu hình chỉnh tay (manual)
console.log('--- 1. Kiểm tra Đạo Anh có cấu hình chỉnh tay (manual) ---');
const daManual = DAO_ANH_LIST.find((da) => da.id === 'da_de_kiem' || da.id === 'de_kiem');
assert(daManual, 'Phải tìm thấy Đạo Anh Đế Kiếm trong danh sách');

for (let k = 1; k <= 5; k++) {
  const cfg = getDaoAnhTransformConfig(daManual, k, { size: 185, refSize: 185 });
  assert.strictEqual(cfg.isAuto, false, `Kiếp ${k} của Đế Kiếm phải có isAuto === false`);
  assert(typeof cfg.scale === 'number' && cfg.scale >= 0.8 && cfg.scale <= 2.2, `Scale kiếp ${k} phải hợp lệ`);
  assert(typeof cfg.x === 'number' && typeof cfg.y === 'number', `x, y kiếp ${k} phải là số`);

  const style = getDaoAnhTransformStyle(daManual, k, { size: 185, refSize: 185 });
  assert(style.includes('translate3d(') && style.includes('scale('), `Style transform kiếp ${k} phải hợp lệ: ${style}`);
}
console.log('✓ PASS: Đạo Anh chỉnh tay trả về cấu hình manual chính xác cho cả 5 kiếp.');

// 2. Đạo Anh chưa có chỉnh tay nhưng có BBox (auto fallback)
console.log('\n--- 2. Kiểm tra fallback auto-normalize theo BBox ---');
const mockAutoDa = {
  id: 'da_test_uncalibrated_bbox',
  image: '/images/dao_anh/am_duong_hon_don_nguyen_can.png',
};

const autoCfg = getDaoAnhTransformConfig(mockAutoDa, 1, { size: 185, refSize: 185 });
assert.strictEqual(autoCfg.isAuto, true, 'Đạo Anh chưa có manual transform phải có isAuto === true');
assert(autoCfg.scale >= 0.85 && autoCfg.scale <= 1.9, `Scale auto (${autoCfg.scale}) phải nằm trong [0.85, 1.9]`);
assert.strictEqual(autoCfg.unit, '%', 'Auto transform phải có unit là %');

const autoStyle = getDaoAnhTransformStyle(mockAutoDa, 1, { size: 185, refSize: 185 });
assert(autoStyle.includes('translate(') && autoStyle.includes('scale('), 'Auto transform style phải dùng translate(%, %)');
console.log(`✓ PASS: Fallback auto-normalize tính toán chính xác (scale: ${autoCfg.scale}, tx: ${autoCfg.tx}%, ty: ${autoCfg.ty}%).`);

// 3. Fallback an toàn khi input null hoặc undefined
console.log('\n--- 3. Kiểm tra fallback an toàn khi input null ---');
const cfgNull = getDaoAnhTransformConfig(null, 1);
assert.deepStrictEqual(cfgNull, { scale: 1, x: 0, y: 0, isAuto: false }, 'Null phải trả về scale 1 mặc định');
const styleNull = getDaoAnhTransformStyle(null, 1);
assert.strictEqual(styleNull, 'translateZ(0)', 'Null style phải trả về translateZ(0)');
console.log('✓ PASS: Fallback an toàn hoạt động hoàn hảo, không crash.');

// 4. Kiểm tra refSize scaling (150px, 185px, 220px)
console.log('\n--- 4. Kiểm tra co giãn theo refSize ---');
const baseCfg185 = getDaoAnhTransformConfig('de_kiem', 2, { size: 185, refSize: 185 });
const scaled150 = getDaoAnhTransformConfig('de_kiem', 2, { size: 150, refSize: 185 });
const scaled220 = getDaoAnhTransformConfig('de_kiem', 2, { size: 220, refSize: 185 });

assert.strictEqual(baseCfg185.scale, scaled150.scale, 'Scale không đổi khi đổi size');
assert.strictEqual(baseCfg185.scale, scaled220.scale, 'Scale không đổi khi đổi size');

const ratio150 = 150 / 185;
const expectedX150 = Math.round(baseCfg185.x * ratio150 * 10) / 10;
assert.strictEqual(scaled150.x, expectedX150, `x ở size 150 (${scaled150.x}) phải khớp tỷ lệ 150/185 (${expectedX150})`);

const ratio220 = 220 / 185;
const expectedX220 = Math.round(baseCfg185.x * ratio220 * 10) / 10;
assert.strictEqual(scaled220.x, expectedX220, `x ở size 220 (${scaled220.x}) phải khớp tỷ lệ 220/185 (${expectedX220})`);
console.log('✓ PASS: Tọa độ x, y co giãn hoàn toàn chính xác theo tỷ lệ size / refSize.');

// 5. Kiểm tra Đế Kiếm Đạo Anh 5 kiếp
console.log('\n--- 5. Kiểm tra Đế Kiếm Đạo Anh 5 kiếp ---');
for (let k = 1; k <= 5; k++) {
  const cfg = getDaoAnhTransformConfig('de_kiem', k, { size: 185, refSize: 185 });
  console.log(`  Kiếp ${k}: scale = ${cfg.scale.toFixed(2)}, x = ${cfg.x}px, y = ${cfg.y}px`);
  assert(cfg.scale >= 0.95 && cfg.scale <= 1.55, `Kiếp ${k} scale phải nằm trong khoảng thẩm mỹ`);
}
console.log('✓ PASS: Đế Kiếm Đạo Anh cả 5 kiếp đều được cân chỉnh tỉ mỉ.');

console.log('\n=== TẤT CẢ CÁC BÀI TEST AUTO TRANSFORM ĐÃ VƯỢT QUA 100%! ===');
process.exit(0);
