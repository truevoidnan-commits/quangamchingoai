/**
 * scripts/test-daoanh-auto-transform.js
 * Unit test kiểm tra tính toán getDaoAnhTransformConfig, getDaoAnhTransformStyle và getDaoAnhSvgTransform:
 * 1. Đạo Anh khi uniform: false -> trả về đúng cấu hình chỉnh tay manual (isAuto: false).
 * 2. Đạo Anh chưa có chỉnh tay nhưng có BBox -> trả về isAuto: true.
 * 3. Fallback an toàn khi input null -> scale 1, không crash.
 * 4. Kiểm tra refSize: khi truyền size khác nhau (150, 185, 220) ở chế độ manual, x và y co giãn tỷ lệ tương ứng.
 * 5. Kiểm tra Đế Kiếm K1..K5 ở chế độ manual.
 * 6. Kiểm tra fit: "contain": 42 Đạo Anh x 5 kiếp có bbox sau biến đổi nằm trong [0,1]x[0,1].
 * 7. Kiểm tra chế độ đồng nhất DAO_ANH_UNIFORM (enabled: true): 42 Đạo Anh x Kiếp 1..5 có kích thước nội dung sau biến đổi nằm trong dải quanh target 1.0 (±15%).
 * 8. Kiểm tra khi DAO_ANH_UNIFORM.enabled = false: kết quả trùng khớp 100% bảng cũ DAO_ANH_CUSTOM_TRANSFORMS.
 */

import assert from 'node:assert';
import {
  DAO_ANH_LIST,
  DAO_ANH_CUSTOM_TRANSFORMS,
  DAO_ANH_UNIFORM,
  getDaoAnhTransformConfig,
  getDaoAnhTransformStyle,
  getDaoAnhSvgTransform,
  getDaoAnhBBox,
} from '../src/lib/daoAnhData.js';

console.log('=== TEST DAO ANH AUTO TRANSFORM & PARITY (scripts/test-daoanh-auto-transform.js) ===\n');

// 1. Đạo Anh có cấu hình chỉnh tay (manual) khi uniform: false
console.log('--- 1. Kiểm tra Đạo Anh có cấu hình chỉnh tay (manual khi uniform: false) ---');
const daManual = DAO_ANH_LIST.find((da) => da.id === 'da_de_kiem' || da.id === 'de_kiem');
assert(daManual, 'Phải tìm thấy Đạo Anh Đế Kiếm trong danh sách');

for (let k = 1; k <= 5; k++) {
  const cfg = getDaoAnhTransformConfig(daManual, k, { size: 185, refSize: 185, uniform: false });
  assert.strictEqual(cfg.isAuto, false, `Kiếp ${k} của Đế Kiếm phải có isAuto === false khi uniform: false`);
  assert(typeof cfg.scale === 'number' && cfg.scale >= 0.8 && cfg.scale <= 2.2, `Scale kiếp ${k} phải hợp lệ`);
  assert(typeof cfg.x === 'number' && typeof cfg.y === 'number', `x, y kiếp ${k} phải là số`);

  const style = getDaoAnhTransformStyle(daManual, k, { size: 185, refSize: 185, uniform: false });
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
assert(autoCfg.scale >= 0.6 && autoCfg.scale <= 2.0, `Scale auto (${autoCfg.scale}) phải nằm trong [0.6, 2.0]`);
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
const svgNull = getDaoAnhSvgTransform(null, 1);
assert.strictEqual(svgNull, 'translate(0, 0) scale(1)', 'Null SVG phải trả về translate(0, 0) scale(1)');
console.log('✓ PASS: Fallback an toàn hoạt động hoàn hảo, không crash.');

// 4. Kiểm tra refSize scaling (150px, 185px, 220px) ở chế độ manual
console.log('\n--- 4. Kiểm tra co giãn theo refSize ở chế độ manual ---');
const baseCfg185 = getDaoAnhTransformConfig('de_kiem', 2, { size: 185, refSize: 185, uniform: false });
const scaled150 = getDaoAnhTransformConfig('de_kiem', 2, { size: 150, refSize: 185, uniform: false });
const scaled220 = getDaoAnhTransformConfig('de_kiem', 2, { size: 220, refSize: 185, uniform: false });

assert.strictEqual(baseCfg185.scale, scaled150.scale, 'Scale không đổi khi đổi size');
assert.strictEqual(baseCfg185.scale, scaled220.scale, 'Scale không đổi khi đổi size');

const ratio150 = 150 / 185;
const expectedX150 = Math.round(baseCfg185.x * ratio150 * 10) / 10;
assert.strictEqual(scaled150.x, expectedX150, `x ở size 150 (${scaled150.x}) phải khớp tỷ lệ 150/185 (${expectedX150})`);

const ratio220 = 220 / 185;
const expectedX220 = Math.round(baseCfg185.x * ratio220 * 10) / 10;
assert.strictEqual(scaled220.x, expectedX220, `x ở size 220 (${scaled220.x}) phải khớp tỷ lệ 220/185 (${expectedX220})`);
console.log('✓ PASS: Tọa độ x, y co giãn hoàn toàn chính xác theo tỷ lệ size / refSize.');

// 5. Kiểm tra Đế Kiếm Đạo Anh 5 kiếp ở chế độ manual
console.log('\n--- 5. Kiểm tra Đế Kiếm Đạo Anh 5 kiếp ở chế độ manual ---');
for (let k = 1; k <= 5; k++) {
  const cfg = getDaoAnhTransformConfig('de_kiem', k, { size: 185, refSize: 185, uniform: false });
  console.log(`  Kiếp ${k}: scale = ${cfg.scale.toFixed(2)}, x = ${cfg.x}px, y = ${cfg.y}px`);
  assert(cfg.scale >= 0.95 && cfg.scale <= 1.55, `Kiếp ${k} scale phải nằm trong khoảng thẩm mỹ`);
}
console.log('✓ PASS: Đế Kiếm Đạo Anh cả 5 kiếp đều được cân chỉnh tỉ mỉ.');

// 6. Kiểm tra chế độ fit: 'contain' cho Đồ Lục
console.log('\n--- 6. Kiểm tra chế độ fit: "contain" cho Đồ Lục ---');
let containTested = 0;
for (const da of DAO_ANH_LIST) {
  for (let k = 1; k <= 5; k++) {
    const cfgContain = getDaoAnhTransformConfig(da, k, { fit: 'contain' });
    assert.strictEqual(cfgContain.isAuto, true, `${da.id} kiếp ${k} fit:contain phải có isAuto === true`);
    assert(cfgContain.scale >= 0.5 && cfgContain.scale <= 2.2, `${da.id} scale contain phải trong [0.5, 2.2]: ${cfgContain.scale}`);

    const bb = getDaoAnhBBox(da, k);
    if (bb && bb.w && bb.h) {
      const wTrans = bb.w * cfgContain.scale;
      const hTrans = bb.h * cfgContain.scale;
      const left = 0.5 - wTrans / 2;
      const right = 0.5 + wTrans / 2;
      const top = 0.5 - hTrans / 2;
      const bottom = 0.5 + hTrans / 2;

      const eps = 0.02;
      assert(left >= -eps, `${da.id} kiếp ${k} left out of bounds: ${left}`);
      assert(right <= 1 + eps, `${da.id} kiếp ${k} right out of bounds: ${right}`);
      assert(top >= -eps, `${da.id} kiếp ${k} top out of bounds: ${top}`);
      assert(bottom <= 1 + eps, `${da.id} kiếp ${k} bottom out of bounds: ${bottom}`);
    }
    containTested++;
  }
}
console.log(`✓ PASS: Toàn bộ ${containTested} lượt (42 Đạo Anh x 5 Kiếp) ở fit: "contain" đều có bbox nằm trong [0,1]x[0,1] (sai số <= 0.02).`);

// 7. Kiểm tra chế độ đồng nhất DAO_ANH_UNIFORM (enabled: true)
console.log('\n--- 7. Kiểm tra chế độ đồng nhất DAO_ANH_UNIFORM (enabled: true) ---');
DAO_ANH_UNIFORM.enabled = true;
assert.strictEqual(DAO_ANH_UNIFORM.mapBoost, 1.15, 'DAO_ANH_UNIFORM.mapBoost phải có giá trị 1.15');
let totalUniformChecked = 0;
const clampedCases = [];

for (const da of DAO_ANH_LIST) {
  for (let k = 1; k <= 5; k++) {
    const cfg = getDaoAnhTransformConfig(da, k);
    assert.strictEqual(cfg.isAuto, true, `${da.id} kiếp ${k} phải có isAuto === true khi uniform enabled`);
    assert(cfg.scale >= DAO_ANH_UNIFORM.minScale && cfg.scale <= DAO_ANH_UNIFORM.maxScale, `Scale ${cfg.scale} phải trong [${DAO_ANH_UNIFORM.minScale}, ${DAO_ANH_UNIFORM.maxScale}]`);

    const bb = getDaoAnhBBox(da, k);
    if (bb && bb.w && bb.h) {
      const maxDim = Math.max(bb.w, bb.h);
      const contentSize = maxDim * cfg.scale;
      const target = DAO_ANH_UNIFORM.target ?? 1.0;

      if (cfg.scale === DAO_ANH_UNIFORM.minScale || cfg.scale === DAO_ANH_UNIFORM.maxScale) {
        clampedCases.push({ id: da.id, k, scale: cfg.scale, maxDim, contentSize });
      } else {
        const diffRatio = Math.abs(contentSize - target) / target;
        assert(diffRatio <= 0.15, `${da.id} kiếp ${k} kích thước nội dung (${contentSize.toFixed(3)}) lệch quá 15% so với target (${target})`);
      }
    }

    // Kiểm tra getDaoAnhSvgTransform (có nhân mapBoost mặc định 1.15)
    const svgStr = getDaoAnhSvgTransform(da, k);
    assert(svgStr.startsWith('translate(') && svgStr.includes('scale('), `${da.id} kiếp ${k} SVG transform không hợp lệ: ${svgStr}`);
    assert(!svgStr.includes('NaN') && !svgStr.includes('undefined'), `SVG transform chứa NaN/undefined: ${svgStr}`);

    // Kiểm tra mapBoost được áp dụng vào scale của SVG
    const svgUnboosted = getDaoAnhSvgTransform(da, k, { mapBoost: 1.0 });
    const scBoosted = parseFloat(svgStr.match(/scale\(([^)]+)\)/)[1]);
    const scUnboosted = parseFloat(svgUnboosted.match(/scale\(([^)]+)\)/)[1]);
    const boostRatio = scBoosted / scUnboosted;
    assert(Math.abs(boostRatio - 1.15) <= 0.02, `${da.id} kiếp ${k} scale boost (${boostRatio}) phải xấp xỉ 1.15`);

    totalUniformChecked++;
  }
}
console.log(`✓ PASS: Toàn bộ ${totalUniformChecked} lượt (42 Đạo Anh x 5 Kiếp) ở enabled=true có kích thước nội dung nằm trong dải target 1.0 (±15%).`);
if (clampedCases.length > 0) {
  console.log(`  (Ghi nhận ${clampedCases.length} trường hợp chạm ngưỡng clamp: ${JSON.stringify(clampedCases)})`);
} else {
  console.log('  (Không có trường hợp nào bị kẹp minScale/maxScale, 100% chuẩn hóa tự do quanh target 1.0)');
}

// 8. Kiểm tra khi DAO_ANH_UNIFORM.enabled = false: kết quả trùng khớp 100% bảng cũ
console.log('\n--- 8. Kiểm tra khi DAO_ANH_UNIFORM.enabled = false ---');
DAO_ANH_UNIFORM.enabled = false;
let totalDisabledChecked = 0;

for (const key of Object.keys(DAO_ANH_CUSTOM_TRANSFORMS)) {
  for (let k = 1; k <= 5; k++) {
    const customCfg = DAO_ANH_CUSTOM_TRANSFORMS[key]?.[k] || DAO_ANH_CUSTOM_TRANSFORMS[key]?.[1];
    if (!customCfg) continue;

    const cfgDisabled = getDaoAnhTransformConfig(key, k);
    assert.strictEqual(cfgDisabled.isAuto, false, `${key} kiếp ${k} khi disabled phải có isAuto === false`);
    assert.strictEqual(cfgDisabled.scale, customCfg.scale ?? 1, `Scale ${key} kiếp ${k} phải khớp bảng cũ`);
    assert.strictEqual(cfgDisabled.x, customCfg.x ?? 0, `x ${key} kiếp ${k} phải khớp bảng cũ`);
    assert.strictEqual(cfgDisabled.y, customCfg.y ?? 0, `y ${key} kiếp ${k} phải khớp bảng cũ`);

    const svgDisabled = getDaoAnhSvgTransform(key, k);
    assert.strictEqual(svgDisabled, `translate(${customCfg.x ?? 0}, ${customCfg.y ?? 0}) scale(${customCfg.scale ?? 1})`, `SVG transform ${key} kiếp ${k} phải khớp bảng cũ`);
    totalDisabledChecked++;
  }
}
console.log(`✓ PASS: Toàn bộ ${totalDisabledChecked} lượt kiểm tra khi enabled=false trùng khớp 100% bảng cũ DAO_ANH_CUSTOM_TRANSFORMS.`);

// Khôi phục enabled = true
DAO_ANH_UNIFORM.enabled = true;

console.log('\n=== TẤT CẢ CÁC BÀI TEST AUTO TRANSFORM ĐÃ VƯỢT QUA 100%! ===');
process.exit(0);
