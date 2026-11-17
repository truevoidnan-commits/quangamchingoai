import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

// Tắt bộ nhớ đệm libvips để tránh khóa file trên Windows khi ghi đè
sharp.cache(false);

/**
 * scripts/feather-daoanh-edges.mjs
 * Làm mờ dần (feather) alpha ở 4 mép bounding box cho các ảnh Đạo Ảnh bị cắt vuông ở mép.
 * Giữ nguyên RGB, giữ nguyên kích thước, giữ nguyên định dạng (PNG lossless, WebP quality 90).
 */

const TARGET_IMAGES_DEFAULT = [
  'thuong_thuong_hac_huyet_k5',
  'khoi_nguyen_thoi_khong_k5',
  'thuong_thuong_hac_huyet_k4',
];

const DIRS = [
  { name: 'png', dir: 'src/assets/images/dao_anh', ext: '.png' },
  { name: 'webp', dir: 'src/assets/images/dao_anh_webp', ext: '.webp' },
  { name: 'thumb', dir: 'src/assets/images/dao_anh_thumb', ext: '.webp' },
];

function parseArgs() {
  const args = process.argv.slice(2);
  let factor = 0.10;
  const targetImages = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--factor' || a === '-f') {
      const parsed = parseFloat(args[++i]);
      if (!isNaN(parsed) && parsed > 0) factor = parsed;
    } else if (a.startsWith('--factor=')) {
      const parsed = parseFloat(a.split('=')[1]);
      if (!isNaN(parsed) && parsed > 0) factor = parsed;
    } else if (!a.startsWith('-')) {
      targetImages.push(a);
    }
  }

  return {
    factor,
    images: targetImages.length > 0 ? targetImages : TARGET_IMAGES_DEFAULT,
  };
}

async function featherImage(filePath, factor) {
  if (!fs.existsSync(filePath)) {
    console.warn(`  [CẢNH BÁO] Không tìm thấy file: ${filePath}`);
    return null;
  }

  // Đọc toàn bộ file vào buffer trước để không giữ handle
  const inputBuffer = fs.readFileSync(filePath);
  const { data, info } = await sharp(inputBuffer).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  // 1. Tìm bounding box của pixel có alpha > 40
  let x0 = width;
  let x1 = -1;
  let y0 = height;
  let y1 = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > 40) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }

  if (x1 === -1 || y1 === -1) {
    console.warn(`  [BỎ QUA] Ảnh rỗng hoặc hoàn toàn trong suốt: ${filePath}`);
    return null;
  }

  // 2. F = factor * max(x1 - x0, y1 - y0)
  const bboxW = x1 - x0;
  const bboxH = y1 - y0;
  const maxDim = Math.max(bboxW, bboxH);
  const F = factor * maxDim;

  // 3 & 4 & 5. Áp dụng smoothstep feathering cho alpha
  let modifiedPixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4 + 3;
      const alphaOld = data[idx];
      if (alphaOld === 0) continue;

      // Khoảng cách tới mép bbox gần nhất (tính theo pixel)
      const d = Math.min(x - x0, x1 - x, y - y0, y1 - y);

      let t;
      if (d <= 0) {
        t = 0;
      } else if (d >= F) {
        t = 1;
      } else {
        const u = d / F;
        t = u * u * (3 - 2 * u); // smoothstep
      }

      const alphaNew = Math.round(alphaOld * t);
      if (alphaNew !== alphaOld) {
        data[idx] = alphaNew;
        modifiedPixels++;
      }
    }
  }

  // 6. Lưu lại cùng định dạng và kích thước bằng Buffer để ghi đè an toàn
  const ext = path.extname(filePath).toLowerCase();

  const sharpPipeline = sharp(data, {
    raw: {
      width,
      height,
      channels: 4,
    },
  });

  let outBuffer;
  if (ext === '.png') {
    outBuffer = await sharpPipeline.png({ compressionLevel: 9 }).toBuffer();
  } else if (ext === '.webp') {
    outBuffer = await sharpPipeline
      .webp({
        quality: 90,
        alphaQuality: 100,
        effort: 6,
      })
      .toBuffer();
  } else {
    throw new Error(`Định dạng không hỗ trợ: ${ext}`);
  }

  fs.writeFileSync(filePath, outBuffer);

  return {
    width,
    height,
    bbox: { x0, x1, y0, y1, bboxW, bboxH },
    F: Math.round(F * 10) / 10,
    modifiedPixels,
  };
}

async function main() {
  const { factor, images } = parseArgs();
  console.log('=== LÀM MỜ DẦN (FEATHER) MÉP ĐẠO ẢNH BẰNG SMOOTHSTEP ===');
  console.log(`Hệ số F = ${factor} * max(w, h)`);
  console.log(`Danh sách ảnh xử lý (${images.length}):`, images);
  console.log('');

  const processedList = [];

  for (const imageName of images) {
    console.log(`\n▶ Xử lý: [${imageName}]`);
    for (const d of DIRS) {
      const filePath = path.resolve(d.dir, `${imageName}${d.ext}`);
      const stats = await featherImage(filePath, factor);
      if (stats) {
        processedList.push({
          imageName,
          type: d.name,
          filePath,
          stats,
        });
        console.log(`  ✓ [${d.name}] ${d.ext} (${stats.width}x${stats.height}) | BBox: [${stats.bbox.x0}, ${stats.bbox.y0}]-[${stats.bbox.x1}, ${stats.bbox.y1}] | F=${stats.F}px | Pixel đổi: ${stats.modifiedPixels}`);
      }
    }
  }

  console.log(`\n✅ Đã xử lý thành công ${processedList.length} tệp ảnh!`);
}

main().catch(err => {
  console.error('🚨 Lỗi xử lý:', err);
  process.exit(1);
});
