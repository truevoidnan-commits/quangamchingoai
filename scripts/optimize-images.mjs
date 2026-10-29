import fs from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';

const CONCURRENCY = Math.max(2, Math.min(8, os.cpus().length - 1));

const TASKS = [
  {
    srcDir: path.resolve('src/assets/images/dao_anh'),
    pattern: /\.png$/i,
    fullDir: path.resolve('src/assets/images/dao_anh_webp'),
    thumbDir: path.resolve('src/assets/images/dao_anh_thumb'),
    name: 'Đạo Ảnh (PNG)',
  },
  {
    srcDir: path.resolve('src/assets/icons/than_pham'),
    pattern: /\.jpg$/i,
    fullDir: path.resolve('src/assets/icons/than_pham_webp'),
    thumbDir: path.resolve('src/assets/icons/than_pham_thumb'),
    name: 'Thần Phẩm (JPG)',
  },
];

async function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function formatBytes(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function runPool(items, limit, workerFn) {
  let index = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (index < items.length) {
      const i = index++;
      await workerFn(items[i], i, items.length);
    }
  });
  await Promise.all(workers);
}

async function processImages() {
  console.log(`=== BẮT ĐẦU TỐI ƯU HÓA HÌNH ẢNH SANG WEBP (Concurrency: ${CONCURRENCY}) ===\n`);

  let totalSrcBytes = 0;
  let totalFullBytes = 0;
  let totalThumbBytes = 0;
  let totalFilesProcessed = 0;
  let totalFilesSkipped = 0;

  for (const task of TASKS) {
    await ensureDir(task.fullDir);
    await ensureDir(task.thumbDir);

    const files = fs.readdirSync(task.srcDir).filter(f => task.pattern.test(f));
    console.log(`[${task.name}] Tìm thấy ${files.length} tệp trong ${path.relative('.', task.srcDir)}`);

    const fileItems = files.map(file => {
      const srcPath = path.join(task.srcDir, file);
      const baseName = path.parse(file).name;
      const fullPath = path.join(task.fullDir, `${baseName}.webp`);
      const thumbPath = path.join(task.thumbDir, `${baseName}.webp`);
      const srcStat = fs.statSync(srcPath);
      totalSrcBytes += srcStat.size;

      let needFull = true;
      let needThumb = true;

      if (fs.existsSync(fullPath)) {
        const fullStat = fs.statSync(fullPath);
        if (fullStat.mtimeMs >= srcStat.mtimeMs) {
          needFull = false;
        }
      }

      if (fs.existsSync(thumbPath)) {
        const thumbStat = fs.statSync(thumbPath);
        if (thumbStat.mtimeMs >= srcStat.mtimeMs) {
          needThumb = false;
        }
      }

      return { file, srcPath, fullPath, thumbPath, needFull, needThumb };
    });

    let completed = 0;
    const startTime = Date.now();

    await runPool(fileItems, CONCURRENCY, async (item) => {
      if (!item.needFull && !item.needThumb) {
        totalFilesSkipped++;
        totalFullBytes += fs.statSync(item.fullPath).size;
        totalThumbBytes += fs.statSync(item.thumbPath).size;
        completed++;
        return;
      }

      try {
        // 1. FULL: tối đa 1024px cạnh dài, WebP quality 90, alphaQuality 100, effort 6, giữ kênh alpha
        if (item.needFull) {
          await sharp(item.srcPath)
            .resize(1024, 1024, {
              fit: 'inside',
              withoutEnlargement: true,
            })
            .webp({
              quality: 90,
              alphaQuality: 100,
              effort: 6,
            })
            .toFile(item.fullPath);
        }

        // 2. THUMB: resize cạnh dài 384px (không phóng to nếu nhỏ hơn, giữ tỉ lệ, kernel lanczos3), WebP quality 90, alphaQuality 100
        if (item.needThumb) {
          await sharp(item.srcPath)
            .resize(384, 384, {
              fit: 'inside',
              withoutEnlargement: true,
              kernel: sharp.kernel.lanczos3,
            })
            .webp({
              quality: 90,
              alphaQuality: 100,
            })
            .toFile(item.thumbPath);
        }

        totalFilesProcessed++;
        totalFullBytes += fs.statSync(item.fullPath).size;
        totalThumbBytes += fs.statSync(item.thumbPath).size;
      } catch (err) {
        console.error(`Lỗi xử lý ${item.file}:`, err.message);
        throw err;
      }

      completed++;
      if (completed % 25 === 0 || completed === fileItems.length) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  -> Đã xử lý ${completed}/${fileItems.length} (${elapsed}s)`);
      }
    });
  }

  console.log('\n=== TỔNG KẾT TỐI ƯU HÓA HÌNH ẢNH ===');
  console.log(`- Tệp mới xử lý / tạo lại: ${totalFilesProcessed}`);
  console.log(`- Tệp bỏ qua (đã có bản WebP mới hơn): ${totalFilesSkipped}`);
  console.log(`- Tổng dung lượng gốc (PNG/JPG): ${formatBytes(totalSrcBytes)}`);
  console.log(`- Tổng dung lượng bản FULL (WebP): ${formatBytes(totalFullBytes)} (${((1 - totalFullBytes / totalSrcBytes) * 100).toFixed(1)}% tiết kiệm)`);
  console.log(`- Tổng dung lượng bản THUMB (WebP): ${formatBytes(totalThumbBytes)} (${((1 - totalThumbBytes / totalSrcBytes) * 100).toFixed(1)}% tiết kiệm)`);
  console.log(`- Tổng FULL + THUMB: ${formatBytes(totalFullBytes + totalThumbBytes)}`);
}

processImages().catch(err => {
  console.error('Lỗi khi tối ưu hình ảnh:', err);
  process.exit(1);
});
