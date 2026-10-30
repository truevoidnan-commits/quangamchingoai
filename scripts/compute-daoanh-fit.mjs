import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const DAO_ANH_WEBP_DIR = path.resolve('src/assets/images/dao_anh_webp');
const OUTPUT_FILE = path.resolve('src/lib/daoAnhFit.generated.js');

async function computeFit() {
  console.log('=== BẮT ĐẦU TÍNH TOÁN DAO_ANH_FIT CHO TẤT CẢ ẢNH ĐẠO ẢNH ===\n');

  if (!fs.existsSync(DAO_ANH_WEBP_DIR)) {
    console.error('Không tìm thấy thư mục:', DAO_ANH_WEBP_DIR);
    process.exit(1);
  }

  const files = fs.readdirSync(DAO_ANH_WEBP_DIR).filter(f => f.endsWith('.webp'));
  files.sort();

  console.log(`Tìm thấy ${files.length} tệp trong ${DAO_ANH_WEBP_DIR}`);

  const fitMap = {};
  const scaledList = [];
  const belowFloorList = [];

  for (const file of files) {
    const key = path.basename(file, '.webp');
    const filePath = path.join(DAO_ANH_WEBP_DIR, file);

    const { data, info } = await sharp(filePath).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
    const { width, height } = info;

    const cx = (width - 1) / 2;
    const cy = (height - 1) / 2;

    let maxDist = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > 40) {
          const d = Math.hypot(x - cx, y - cy);
          if (d > maxDist) {
            maxDist = d;
          }
        }
      }
    }

    const rmax_ratio = maxDist / width;
    const rawFit = 0.47 / (rmax_ratio * 0.92 * 1.02);
    const roundedFit = Math.round(rawFit * 1000) / 1000;
    const fit = Math.max(0.6, Math.min(1, roundedFit));

    fitMap[key] = fit;

    if (roundedFit < 0.6) {
      belowFloorList.push({ key, roundedFit, rmax_ratio });
    }

    if (fit < 1) {
      scaledList.push({
        key,
        fit,
        rmax_ratio: Number(rmax_ratio.toFixed(4)),
        effBefore: Number((rmax_ratio * 0.92 * 1.02).toFixed(4)),
        effAfter: Number((rmax_ratio * 0.92 * 1.02 * fit).toFixed(4))
      });
    }
  }

  // Sắp xếp danh sách cần scale theo mức độ fit từ nhỏ nhất đến lớn nhất
  scaledList.sort((a, b) => a.fit - b.fit);

  console.log(`\nTổng số ảnh xử lý: ${files.length}`);
  console.log(`Số ảnh cần scale (fit < 1): ${scaledList.length}`);
  console.log(`Số ảnh giữ nguyên (fit = 1): ${files.length - scaledList.length}`);
  console.log(`Số ảnh có fit < 0.6 (chạm sàn 0.6): ${belowFloorList.length}`);

  if (belowFloorList.length > 0) {
    console.warn('\n⚠️ CẢNH BÁO: Các ảnh có fit lý thuyết < 0.6 bị chạm sàn:');
    belowFloorList.forEach(item => {
      console.warn(`  - ${item.key}: rawFit = ${item.roundedFit}, rmax_ratio = ${item.rmax_ratio.toFixed(4)}`);
    });
  }

  console.log('\nTop 15 ảnh cần co nhỏ nhiều nhất (fit thấp nhất):');
  scaledList.slice(0, 15).forEach(item => {
    console.log(`  - ${item.key.padEnd(42)}: fit = ${item.fit.toFixed(3)} | r_eff: ${item.effBefore} -> ${item.effAfter}`);
  });

  // Tạo nội dung file daoAnhFit.generated.js
  const fileLines = [
    '/**',
    ' * src/lib/daoAnhFit.generated.js',
    ' * TỰ ĐỘNG SINH BỞI scripts/compute-daoanh-fit.mjs. KHÔNG CHỈNH SỬA THỦ CÔNG.',
    ' * Hệ số scale vừa vặn khung tròn (avatarInner) cho 205 ảnh Đạo Ảnh WebP.',
    ' * Công thức: fit = Math.max(0.6, Math.min(1, Math.round(0.47 / (rmax_ratio * 0.92 * 1.02) * 1000) / 1000))',
    ' */',
    '',
    'export const DAO_ANH_FIT = {',
  ];

  for (const [key, val] of Object.entries(fitMap)) {
    fileLines.push(`  '${key}': ${val},`);
  }

  fileLines.push('};');
  fileLines.push('');

  fs.writeFileSync(OUTPUT_FILE, fileLines.join('\n'), 'utf8');
  console.log(`\n✓ Đã xuất thành công file: ${OUTPUT_FILE}`);
}

computeFit().catch(err => {
  console.error('Lỗi khi tính toán fit:', err);
  process.exit(1);
});
