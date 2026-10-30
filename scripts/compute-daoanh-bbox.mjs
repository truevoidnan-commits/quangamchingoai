import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const DAO_ANH_WEBP_DIR = path.resolve('src/assets/images/dao_anh_webp');
const OUTPUT_FILE = path.resolve('src/lib/daoAnhBBox.generated.js');

async function computeBBoxes() {
  console.log('=== BẮT ĐẦU TÍNH TOÁN DAO_ANH_BBOX CHO TẤT CẢ ẢNH ĐẠO ẢNH ===\n');

  if (!fs.existsSync(DAO_ANH_WEBP_DIR)) {
    console.error('Không tìm thấy thư mục:', DAO_ANH_WEBP_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(DAO_ANH_WEBP_DIR).filter(f => f.endsWith('.webp'));
  files.sort();

  console.log(`Tìm thấy ${files.length} tệp trong ${DAO_ANH_WEBP_DIR}`);

  const bboxMap = {};
  const statsList = [];

  for (const file of files) {
    const key = path.basename(file, '.webp');
    const filePath = path.join(DAO_ANH_WEBP_DIR, file);

    const { data, info } = await sharp(filePath).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    const { width, height } = info;

    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > 40) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX === -1) {
      // Trường hợp ảnh rỗng / trong suốt hoàn toàn
      minX = 0;
      maxX = width - 1;
      minY = 0;
      maxY = height - 1;
    }

    const x0 = minX / width;
    const y0 = minY / height;
    const x1 = (maxX + 1) / width;
    const y1 = (maxY + 1) / height;

    const w = Number((x1 - x0).toFixed(4));
    const h = Number((y1 - y0).toFixed(4));
    const cx = Number(((x0 + x1) / 2).toFixed(4));
    const cy = Number(((y0 + y1) / 2).toFixed(4));

    bboxMap[key] = { cx, cy, w, h };
    statsList.push({
      key,
      cx,
      cy,
      w,
      h,
      scale: Number((Math.min(1.6, Math.min(1 / w, 1 / h) * 0.92)).toFixed(3)),
    });
  }

  console.log(`\nTổng số ảnh đã xử lý: ${files.length}`);

  // Thống kê mẫu một số ảnh tiêu biểu
  const sampleKeys = [
    'khoi_nguyen_thoi_khong_k4',
    'tam_thu_dao_k5',
    'trung_dong_k3',
    'tam_thu_dao',
    'nguyen_thuy_thien_ma',
  ];

  console.log('\nMột số mẫu bounding box tiêu biểu:');
  for (const k of sampleKeys) {
    if (bboxMap[k]) {
      console.log(`  - ${k.padEnd(30)}: cx=${bboxMap[k].cx}, cy=${bboxMap[k].cy}, w=${bboxMap[k].w}, h=${bboxMap[k].h}`);
    }
  }

  // Tạo nội dung file daoAnhBBox.generated.js
  const fileLines = [
    '/**',
    ' * src/lib/daoAnhBBox.generated.js',
    ' * TỰ ĐỘNG SINH BỞI scripts/compute-daoanh-bbox.mjs. KHÔNG CHỈNH SỬA THỦ CÔNG.',
    ' * Khung bao nội dung thực (alpha > 40) cho 205 ảnh Đạo Ảnh WebP.',
    ' * cx, cy: tâm khung bao (tỉ lệ 0..1)',
    ' * w, h: chiều rộng và cao khung bao (tỉ lệ 0..1)',
    ' */',
    '',
    'export const DAO_ANH_BBOX = {',
  ];

  for (const [key, val] of Object.entries(bboxMap)) {
    fileLines.push(`  '${key}': { cx: ${val.cx}, cy: ${val.cy}, w: ${val.w}, h: ${val.h} },`);
  }

  fileLines.push('};');
  fileLines.push('');

  fs.writeFileSync(OUTPUT_FILE, fileLines.join('\n'), 'utf8');
  console.log(`\n✓ Đã xuất thành công file: ${OUTPUT_FILE}`);
}

computeBBoxes().catch(err => {
  console.error('Lỗi tính toán bbox:', err);
  process.exit(1);
});
