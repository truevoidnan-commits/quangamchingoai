/**
 * scripts/test-daoanh-bbox.js
 * Verification test for DAO_ANH_BBOX data and getDaoAnhBBox helper.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

import { DAO_ANH_BBOX } from '../src/lib/daoAnhBBox.generated.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webpDir = path.resolve(__dirname, '../src/assets/images/dao_anh_webp');

console.log('=== BẮT ĐẦU KIỂM THỬ DAO_ANH_BBOX (scripts/test-daoanh-bbox.js) ===\n');

async function main() {
  // 1. Check file count vs bbox key count
  const webpFiles = fs.readdirSync(webpDir).filter(f => f.endsWith('.webp'));
  const keys = Object.keys(DAO_ANH_BBOX);
  console.log(`[1] Kiểm tra số lượng: ${webpFiles.length} file WebP trên đĩa, ${keys.length} khóa trong DAO_ANH_BBOX`);
  assert.strictEqual(keys.length, 205, 'BBox table should contain exactly 205 entries');
  assert.strictEqual(keys.length, webpFiles.length, 'BBox entries should match disk WebP file count');
  console.log('    ✓ Khớp chính xác 205 ảnh');

  // 2. Validate bounding box coordinates and sizes for every key
  console.log('[2] Kiểm tra toạ độ hình học và công thức scale/translate...');
  for (const key of keys) {
    const box = DAO_ANH_BBOX[key];
    assert(box, `Box for ${key} must exist`);
    assert(typeof box.cx === 'number' && !Number.isNaN(box.cx), `cx for ${key} must be number`);
    assert(typeof box.cy === 'number' && !Number.isNaN(box.cy), `cy for ${key} must be number`);
    assert(typeof box.w === 'number' && !Number.isNaN(box.w), `w for ${key} must be number`);
    assert(typeof box.h === 'number' && !Number.isNaN(box.h), `h for ${key} must be number`);

    assert(box.cx >= 0 && box.cx <= 1, `cx for ${key} (${box.cx}) must be in [0, 1]`);
    assert(box.cy >= 0 && box.cy <= 1, `cy for ${key} (${box.cy}) must be in [0, 1]`);
    assert(box.w > 0 && box.w <= 1, `w for ${key} (${box.w}) must be in (0, 1]`);
    assert(box.h > 0 && box.h <= 1, `h for ${key} (${box.h}) must be in (0, 1]`);

    // Transform calculation sanity check
    const s = Math.min(1.6, Math.min(1 / box.w, 1 / box.h) * 0.92);
    const tx = (0.5 - box.cx) * 100;
    const ty = (0.5 - box.cy) * 100;

    assert(s >= 0.8 && s <= 1.6, `Scale s for ${key} (${s}) must be within [0.8, 1.6]`);
    assert(Math.abs(tx) <= 50, `tx for ${key} (${tx}%) must be within [-50%, 50%]`);
    assert(Math.abs(ty) <= 50, `ty for ${key} (${ty}%) must be within [-50%, 50%]`);
  }
  console.log('    ✓ Toàn bộ 205 bounding box đều hợp lệ: w,h in (0, 1], cx,cy in [0, 1], s in [0.8, 1.6]');

  // 3. Test specific target Đạo Anh mentioned in requirement
  console.log('[3] Kiểm tra các trường hợp tiêu biểu...');
  const khoiNguyenK4 = DAO_ANH_BBOX['khoi_nguyen_thoi_khong_k4'];
  assert(khoiNguyenK4, 'khoi_nguyen_thoi_khong_k4 must exist');
  console.log('    khoi_nguyen_thoi_khong_k4:', khoiNguyenK4);
  assert(khoiNguyenK4.h > 0.9, 'khoi_nguyen_thoi_khong_k4 height should be tall (>0.9)');

  const tamThuK5 = DAO_ANH_BBOX['tam_thu_dao_k5'];
  assert(tamThuK5, 'tam_thu_dao_k5 must exist');
  console.log('    tam_thu_dao_k5:', tamThuK5);
  assert(tamThuK5.w > 0.9 && tamThuK5.h > 0.9, 'tam_thu_dao_k5 should span both dimensions (>0.9)');

  const trungDongK3 = DAO_ANH_BBOX['trung_dong_k3'];
  assert(trungDongK3, 'trung_dong_k3 must exist');
  console.log('    trung_dong_k3:', trungDongK3);

  // 4. Test getDaoAnhBBox helper via Vite SSR
  console.log('[4] Nạp src/lib/daoAnhData.js qua Vite SSR...');
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const { getDaoAnhBBox, DAO_ANH_LIST } = await vite.ssrLoadModule('/src/lib/daoAnhData.js');

    // Exact key string lookup
    const byString = getDaoAnhBBox('trung_dong_k3');
    assert.deepStrictEqual(byString, trungDongK3, 'Lookup bằng string key phải khớp bbox');

    // Definition object lookup for Kiếp 3 (kiep = 3 -> evolutionImages index 2)
    const defObj = {
      id: 'trung_dong',
      evolutionImages: [
        '/images/dao_anh/trung_dong.png',
        '/images/dao_anh/trung_dong_k2.png',
        '/images/dao_anh/trung_dong_k3.png',
        '/images/dao_anh/trung_dong_k4.png',
        '/images/dao_anh/trung_dong_k5.png',
      ],
    };
    const byDefKiep3 = getDaoAnhBBox(defObj, 3);
    assert.deepStrictEqual(byDefKiep3, trungDongK3, 'Lookup bằng def object + kiep 3 phải khớp trung_dong_k3');

    // Fallback to base key if specific kiep not found
    const fallbackTest = getDaoAnhBBox('khoi_nguyen_thoi_khong_k99');
    assert(fallbackTest !== null, 'Phải fallback về base key khi key kiep cụ thể không có');
    assert.deepStrictEqual(fallbackTest, DAO_ANH_BBOX['khoi_nguyen_thoi_khong'], 'Fallback phải khớp base bbox');

    // Returns null for invalid or null input
    assert.strictEqual(getDaoAnhBBox(null), null, 'getDaoAnhBBox(null) phải trả về null');
    assert.strictEqual(getDaoAnhBBox('unknown_artifact_xyz_999'), null, 'Key lạ phải trả về null');
    console.log('    ✓ getDaoAnhBBox xử lý chính xác chuỗi, object, fallback và input lạ (an toàn tuyệt đối không crash)');

    // 5. Test all DAO_ANH_LIST items across kiep 0..5
    console.log('[5] Kiểm tra getDaoAnhBBox trên toàn bộ DAO_ANH_LIST qua 6 kiếp (0..5)...');
    let resolvedCount = 0;
    let nullCount = 0;
    for (const daoAnh of DAO_ANH_LIST) {
      for (let k = 0; k <= 5; k++) {
        const box = getDaoAnhBBox(daoAnh, k);
        if (box) {
          assert(box.w > 0 && box.h > 0, `Bbox cho ${daoAnh.id} kiếp ${k} phải có kích thước dương`);
          resolvedCount++;
        } else {
          nullCount++;
          // An toàn trả về null cho các item không có hình ảnh trên đĩa (như da_de_kiem)
          assert(daoAnh.id === 'da_de_kiem', `Chỉ da_de_kiem không có ảnh mới trả về null, gặp: ${daoAnh.id}`);
        }
      }
    }
    console.log(`    ✓ Đã phân giải thành công ${resolvedCount} / ${DAO_ANH_LIST.length * 6} (Đạo Anh x Kiếp), ${nullCount} mục trả về null an toàn không crash`);

  } finally {
    await vite.close();
  }

  console.log('\n✅ TẤT CẢ KIỂM THỬ DAO_ANH_BBOX ĐỀU ĐẠT THÀNH CÔNG (100%)!');
}

main().catch((err) => {
  console.error('❌ Kiểm thử thất bại:', err);
  process.exit(1);
});
