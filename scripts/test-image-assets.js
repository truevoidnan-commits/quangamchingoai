import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import sharp from 'sharp';
import { createServer } from 'vite';

console.log('=== BẮT ĐẦU KIỂM THỬ TÀI NGUYÊN HÌNH ẢNH (scripts/test-image-assets.js) ===\n');

const ROOT_DIR = process.cwd();
const DAO_ANH_SRC = path.join(ROOT_DIR, 'src/assets/images/dao_anh');
const DAO_ANH_WEBP = path.join(ROOT_DIR, 'src/assets/images/dao_anh_webp');
const DAO_ANH_THUMB = path.join(ROOT_DIR, 'src/assets/images/dao_anh_thumb');

const THAN_PHAM_SRC = path.join(ROOT_DIR, 'src/assets/icons/than_pham');
const THAN_PHAM_WEBP = path.join(ROOT_DIR, 'src/assets/icons/than_pham_webp');
const THAN_PHAM_THUMB = path.join(ROOT_DIR, 'src/assets/icons/than_pham_thumb');

const STATIC_IMAGES_DIR = path.join(ROOT_DIR, 'src/assets/images');

let passedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    passedTests++;
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name} FAILED:`, err);
    process.exit(1);
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    passedTests++;
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name} FAILED:`, err);
    process.exit(1);
  }
}

async function main() {
  // -------------------------------------------------------------------------
  // Test A: Kiểm tra mọi file gốc đều có đủ bản _webp và _thumb
  // -------------------------------------------------------------------------
  runTest('A.1: Kiểm tra Đạo Ảnh PNG (205 files) có đủ bản full webp và thumb webp', () => {
    const pngFiles = fs.readdirSync(DAO_ANH_SRC).filter(f => f.endsWith('.png'));
    assert.ok(pngFiles.length > 0, 'Phải có file PNG trong dao_anh');
    
    for (const file of pngFiles) {
      const baseName = path.parse(file).name;
      const webpFile = path.join(DAO_ANH_WEBP, `${baseName}.webp`);
      const thumbFile = path.join(DAO_ANH_THUMB, `${baseName}.webp`);
      
      assert.ok(fs.existsSync(webpFile), `Thiếu bản full webp cho Đạo Ảnh: ${file}`);
      assert.ok(fs.existsSync(thumbFile), `Thiếu bản thumb webp cho Đạo Ảnh: ${file}`);
    }
    console.log(`    -> Đã kiểm tra ${pngFiles.length} file PNG Đạo Ảnh: Đủ 100% full và thumb.`);
  });

  runTest('A.2: Kiểm tra Thần Phẩm JPG (42 files) có đủ bản full webp và thumb webp', () => {
    const jpgFiles = fs.readdirSync(THAN_PHAM_SRC).filter(f => f.endsWith('.jpg'));
    assert.ok(jpgFiles.length > 0, 'Phải có file JPG trong than_pham');
    
    for (const file of jpgFiles) {
      const baseName = path.parse(file).name;
      const webpFile = path.join(THAN_PHAM_WEBP, `${baseName}.webp`);
      const thumbFile = path.join(THAN_PHAM_THUMB, `${baseName}.webp`);
      
      assert.ok(fs.existsSync(webpFile), `Thiếu bản full webp cho Thần Phẩm: ${file}`);
      assert.ok(fs.existsSync(thumbFile), `Thiếu bản thumb webp cho Thần Phẩm: ${file}`);
    }
    console.log(`    -> Đã kiểm tra ${jpgFiles.length} file JPG Thần Phẩm: Đủ 100% full và thumb.`);
  });

  // -------------------------------------------------------------------------
  // Test A.3: Kiểm tra các file WebP tĩnh gốc (Mục A: bg-thien-co-lau, huyet_ho, long_kinh)
  // -------------------------------------------------------------------------
  await runAsyncTest('A.3: Kiểm tra các file WebP tĩnh gốc trong src/assets/images', async () => {
    const expectedWebP = [
      'bg-thien-co-lau.webp',
      'huyet_ho_god.webp',
      'long_kinh_god.webp'
    ];

    for (const name of expectedWebP) {
      const filePath = path.join(STATIC_IMAGES_DIR, name);
      assert.ok(fs.existsSync(filePath), `Thiếu file tĩnh WebP: ${name}`);
      const meta = await sharp(filePath).metadata();
      assert.strictEqual(meta.format, 'webp', `${name} không phải định dạng WebP`);
      assert.ok(meta.width > 0 && meta.height > 0, `${name} kích thước không hợp lệ`);
    }

    // Kiểm tra globals.css đã dùng bg-thien-co-lau.webp
    const globalsCss = fs.readFileSync(path.join(ROOT_DIR, 'src/styles/globals.css'), 'utf8');
    assert.ok(globalsCss.includes('bg-thien-co-lau.webp'), 'globals.css chưa trỏ vào bg-thien-co-lau.webp');
    assert.ok(!globalsCss.includes('bg-thien-co-lau.png'), 'globals.css vẫn còn trỏ vào bg-thien-co-lau.png');

    console.log(`    -> 3/3 file tĩnh WebP tồn tại hợp lệ; globals.css đã dùng WebP.`);
  });

  // -------------------------------------------------------------------------
  // Test B: Mọi file webp đọc được và có kích thước hợp lệ
  // -------------------------------------------------------------------------
  await runAsyncTest('B.1: Đọc và kiểm tra kích thước Đạo Ảnh (thumb <= 384px, full <= 1024px)', async () => {
    const thumbFiles = fs.readdirSync(DAO_ANH_THUMB).filter(f => f.endsWith('.webp'));
    const fullFiles = fs.readdirSync(DAO_ANH_WEBP).filter(f => f.endsWith('.webp'));

    for (const f of thumbFiles) {
      const meta = await sharp(path.join(DAO_ANH_THUMB, f)).metadata();
      assert.strictEqual(meta.format, 'webp', `${f} không phải định dạng webp`);
      assert.ok(meta.width <= 384 && meta.height <= 384, `Thumb ${f} vượt quá 384px: ${meta.width}x${meta.height}`);
    }

    for (const f of fullFiles) {
      const meta = await sharp(path.join(DAO_ANH_WEBP, f)).metadata();
      assert.strictEqual(meta.format, 'webp', `${f} không phải định dạng webp`);
      assert.ok(meta.width <= 1024 && meta.height <= 1024, `Full ${f} vượt quá 1024px: ${meta.width}x${meta.height}`);
    }
    console.log(`    -> Đã xác thực metadata: ${thumbFiles.length} thumb và ${fullFiles.length} full Đạo Ảnh.`);
  });

  await runAsyncTest('B.2: Đọc và kiểm tra kích thước Thần Phẩm (thumb <= 384px, full <= 1024px)', async () => {
    const thumbFiles = fs.readdirSync(THAN_PHAM_THUMB).filter(f => f.endsWith('.webp'));
    const fullFiles = fs.readdirSync(THAN_PHAM_WEBP).filter(f => f.endsWith('.webp'));

    for (const f of thumbFiles) {
      const meta = await sharp(path.join(THAN_PHAM_THUMB, f)).metadata();
      assert.strictEqual(meta.format, 'webp', `${f} không phải định dạng webp`);
      assert.ok(meta.width <= 384 && meta.height <= 384, `Thumb ${f} vượt quá 384px: ${meta.width}x${meta.height}`);
    }

    for (const f of fullFiles) {
      const meta = await sharp(path.join(THAN_PHAM_WEBP, f)).metadata();
      assert.strictEqual(meta.format, 'webp', `${f} không phải định dạng webp`);
      assert.ok(meta.width <= 1024 && meta.height <= 1024, `Full ${f} vượt quá 1024px: ${meta.width}x${meta.height}`);
    }
    console.log(`    -> Đã xác thực metadata: ${thumbFiles.length} thumb và ${fullFiles.length} full Thần Phẩm.`);
  });

  // -------------------------------------------------------------------------
  // Test C: Kiểm tra resolveDaoAnhImage & getDaoAnhEvolutionImage qua Vite SSR
  // -------------------------------------------------------------------------
  await runAsyncTest('C.1: resolveDaoAnhImage trả về URL hợp lệ cho toàn bộ DAO_ANH_LIST (full & thumb)', async () => {
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });

    try {
      const { resolveDaoAnhImage, getDaoAnhEvolutionImage, DAO_ANH_LIST } = await vite.ssrLoadModule('/src/lib/daoAnhData.js');
      const { getLampImageUrl, getArtifactImageUrl, THAN_PHAM_AI_ICONS, LAMP_THAN_PHAM_AI_ICONS } = await vite.ssrLoadModule('/src/lib/artifactIcons.js');

      assert.ok(Array.isArray(DAO_ANH_LIST) && DAO_ANH_LIST.length > 0, 'DAO_ANH_LIST không rỗng');

      for (const da of DAO_ANH_LIST) {
        // Kiểm tra ảnh gốc
        const fullRoot = resolveDaoAnhImage(da.image, 'full');
        const thumbRoot = resolveDaoAnhImage(da.image, 'thumb');
        assert.ok(typeof fullRoot === 'string' && fullRoot.length > 0, `fullRoot rỗng cho ${da.id}`);
        assert.ok(typeof thumbRoot === 'string' && thumbRoot.length > 0, `thumbRoot rỗng cho ${da.id}`);

        // Kiểm tra từng kiếp 0 đến 5
        for (let k = 0; k <= 5; k++) {
          const imgFull = getDaoAnhEvolutionImage(da, k, 'full');
          const imgThumb = getDaoAnhEvolutionImage(da, k, 'thumb');

          assert.ok(typeof imgFull === 'string' && imgFull.length > 0, `imgFull rỗng cho ${da.id} kiếp ${k}`);
          assert.ok(typeof imgThumb === 'string' && imgThumb.length > 0, `imgThumb rỗng cho ${da.id} kiếp ${k}`);
        }
      }

      // Test fallback cơ chế: key không có kiếp fallback về baseKey
      const testFallbackThumb = resolveDaoAnhImage('nguyen_thuy_thien_ma_k99', 'thumb');
      const testFallbackFull = resolveDaoAnhImage('nguyen_thuy_thien_ma_k99', 'full');
      // k99 không có dạng _k[1-5], fallback getAssetUrl
      assert.ok(testFallbackThumb.length > 0, 'Fallback không được trả về rỗng');
      assert.ok(testFallbackFull.length > 0, 'Fallback không được trả về rỗng');

      // Test key có _k5 nhưng giả sử thiếu thì fallback về baseKey
      const testK5 = resolveDaoAnhImage('nguyen_thuy_thien_ma_k5', 'thumb');
      assert.ok(testK5.length > 0, 'resolveDaoAnhImage _k5 hợp lệ');

      // Test Thần Phẩm icons map
      for (const [key, url] of Object.entries(THAN_PHAM_AI_ICONS)) {
        assert.ok(typeof url === 'string' && url.length > 0, `THAN_PHAM_AI_ICONS[${key}] rỗng`);
      }
      for (const [key, url] of Object.entries(LAMP_THAN_PHAM_AI_ICONS)) {
        assert.ok(typeof url === 'string' && url.length > 0, `LAMP_THAN_PHAM_AI_ICONS[${key}] rỗng`);
      }

      // Test getLampImageUrl & getArtifactImageUrl
      const lampImgThumb = getLampImageUrl('nguyen_thuy_thien_ma', 'thumb');
      const lampImgFull = getLampImageUrl('nguyen_thuy_thien_ma', 'full');
      assert.ok(lampImgThumb.length > 0 && lampImgFull.length > 0, 'getLampImageUrl trả về ảnh');

      const artImgThumb = getArtifactImageUrl('tao_hoa_ngoc_diep', 'thumb');
      const artImgFull = getArtifactImageUrl('tao_hoa_ngoc_diep', 'full');
      assert.ok(artImgThumb.length > 0 && artImgFull.length > 0, 'getArtifactImageUrl trả về ảnh');

      console.log(`    -> Đã kiểm tra ${DAO_ANH_LIST.length} Đạo Ảnh x 6 Kiếp (0-5) x 2 size: 100% hợp lệ, không có chuỗi rỗng.`);
    } finally {
      await vite.close();
    }
  });

  // -------------------------------------------------------------------------
  // Test D: Kiểm tra an toàn chuỗi rỗng trong resolve
  // -------------------------------------------------------------------------
  await runAsyncTest('D.1: An toàn tuyệt đối: resolveDaoAnhImage khi truyền null / rỗng trả về chuỗi rỗng (không throw), getDaoAnhEvolutionImage(null) an toàn', async () => {
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });

    try {
      const { resolveDaoAnhImage, getDaoAnhEvolutionImage } = await vite.ssrLoadModule('/src/lib/daoAnhData.js');
      assert.strictEqual(resolveDaoAnhImage(null), '');
      assert.strictEqual(resolveDaoAnhImage(undefined), '');
      assert.strictEqual(resolveDaoAnhImage(''), '');
      assert.strictEqual(getDaoAnhEvolutionImage(null), '');
      assert.strictEqual(getDaoAnhEvolutionImage(undefined), '');
    } finally {
      await vite.close();
    }
  });

  // -------------------------------------------------------------------------
  // Test E: Kiểm tra dọn dẹp public/ và không còn đường dẫn tĩnh gãy trong src/
  // -------------------------------------------------------------------------
  runTest('E.1: Thư mục public/ đã được dọn sạch, chỉ giữ lại các tệp hệ thống cần thiết', () => {
    const publicDir = path.join(ROOT_DIR, 'public');
    const keptFiles = ['error-log.js', 'favicon.svg', 'sw.js'];
    
    // Kiểm tra không còn các thư mục / tệp cũ nặng
    assert.ok(!fs.existsSync(path.join(publicDir, 'images')), 'public/images vẫn còn tồn tại!');
    assert.ok(!fs.existsSync(path.join(publicDir, 'icons')), 'public/icons vẫn còn tồn tại!');
    assert.ok(!fs.existsSync(path.join(publicDir, 'assets')), 'public/assets vẫn còn tồn tại!');
    assert.ok(!fs.existsSync(path.join(publicDir, 'bg-thien-co-lau.png')), 'public/bg-thien-co-lau.png vẫn còn tồn tại!');

    // Kiểm tra các tệp bắt buộc giữ lại
    for (const f of keptFiles) {
      assert.ok(fs.existsSync(path.join(publicDir, f)), `Thiếu tệp bắt buộc giữ lại trong public: ${f}`);
    }

    const remainingItems = fs.readdirSync(publicDir);
    assert.deepStrictEqual(remainingItems.sort(), keptFiles.sort(), `public/ chứa các tệp ngoài danh mục cho phép: ${remainingItems.join(', ')}`);
    console.log(`    -> public/ đã tinh gọn: chỉ còn ${keptFiles.length} tệp (${keptFiles.join(', ')}).`);
  });

  runTest('E.2: Quét toàn bộ mã nguồn src/ không còn đường dẫn tĩnh gãy đến các tệp đã xóa', () => {
    const srcDir = path.join(ROOT_DIR, 'src');
    const brokenPatterns = [
      /url\(['"]?\/images\//,
      /url\(['"]?\/icons\//,
      /getAssetUrl\(['"]icons\/than_pham\//,
      /\/images\/thien_cung\//,
    ];

    function scanDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (/\.(jsx?|tsx?|css|html)$/.test(entry.name)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          for (const pattern of brokenPatterns) {
            const match = content.match(pattern);
            assert.ok(!match, `Phát hiện đường dẫn tĩnh gãy trong ${path.relative(ROOT_DIR, fullPath)}: ${pattern}`);
          }
        }
      }
    }

    scanDir(srcDir);
    console.log(`    -> Quét toàn bộ src/: 100% sạch, không còn url('/images/...') hay trỏ tĩnh vào public.`);
  });

  // -------------------------------------------------------------------------
  // Test F: Kiểm tra Đạo Ảnh Fit Scale cho Modal Avatar
  // -------------------------------------------------------------------------
  await runAsyncTest('F.1: (a) Mọi key ảnh dao_anh_webp đều có hoặc fallback về fit hợp lệ trong (0.6, 1]', async () => {
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });

    try {
      const { DAO_ANH_FIT, getDaoAnhFitScale, DAO_ANH_LIST } = await vite.ssrLoadModule('/src/lib/daoAnhData.js');
      const webpFiles = fs.readdirSync(DAO_ANH_WEBP).filter(f => f.endsWith('.webp'));
      assert.ok(webpFiles.length > 0, 'Phải có file webp trong dao_anh_webp');

      for (const file of webpFiles) {
        const key = path.basename(file, '.webp');
        const fitDirect = DAO_ANH_FIT[key];
        assert.ok(typeof fitDirect === 'number' && !isNaN(fitDirect), `Key ${key} không có trong DAO_ANH_FIT`);
        assert.ok(fitDirect >= 0.6 && fitDirect <= 1.0, `Key ${key} có fit ${fitDirect} ngoài khoảng [0.6, 1]`);

        const fitFn = getDaoAnhFitScale(key);
        assert.strictEqual(fitFn, fitDirect, `getDaoAnhFitScale('${key}') trả về ${fitFn} khác DAO_ANH_FIT ${fitDirect}`);
      }

      // Kiểm tra fallback cho key không tồn tại hoặc rỗng
      assert.strictEqual(getDaoAnhFitScale(null), 1, 'getDaoAnhFitScale(null) phải trả về 1');
      assert.strictEqual(getDaoAnhFitScale(undefined), 1, 'getDaoAnhFitScale(undefined) phải trả về 1');
      assert.strictEqual(getDaoAnhFitScale(''), 1, 'getDaoAnhFitScale("") phải trả về 1');
      assert.strictEqual(getDaoAnhFitScale('non_existent_key_xyz'), 1, 'Key không tồn tại phải fallback về 1');

      // Kiểm tra fallback key kiếp không tồn tại -> baseKey
      const baseKey = 'tam_thu_dao';
      const fakeKiepKey = `${baseKey}_k99`;
      assert.strictEqual(getDaoAnhFitScale(fakeKiepKey), DAO_ANH_FIT[baseKey] ?? 1, 'Key kiếp lạ phải fallback về baseKey');

      // Kiểm tra DAO_ANH_LIST qua các kiếp 0..5
      for (const da of DAO_ANH_LIST) {
        for (let k = 0; k <= 5; k++) {
          const fit = getDaoAnhFitScale(da, k);
          assert.ok(typeof fit === 'number' && !isNaN(fit), `fit không hợp lệ cho ${da.id} kiếp ${k}`);
          assert.ok(fit >= 0.6 && fit <= 1.0, `fit ${fit} ngoài [0.6, 1] cho ${da.id} kiếp ${k}`);
        }
      }

      console.log(`    -> Đã kiểm tra ${webpFiles.length} key dao_anh_webp: 100% có fit hợp lệ trong [0.6, 1]; fallback hoạt động đúng.`);
    } finally {
      await vite.close();
    }
  });

  await runAsyncTest('F.2: (b) Bán kính nội dung * 0.92 * 1.02 * fit <= 0.495 cho 100% ảnh có fit >= 0.6', async () => {
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });

    try {
      const { getDaoAnhFitScale } = await vite.ssrLoadModule('/src/lib/daoAnhData.js');
      const webpFiles = fs.readdirSync(DAO_ANH_WEBP).filter(f => f.endsWith('.webp'));

      let scaledCount = 0;
      let minFit = 1;
      let maxEffAfter = 0;
      let floorTouchedCount = 0;

      for (const file of webpFiles) {
        const key = path.basename(file, '.webp');
        const filePath = path.join(DAO_ANH_WEBP, file);

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
              if (d > maxDist) maxDist = d;
            }
          }
        }

        const rmax_ratio = maxDist / width;
        const fit = getDaoAnhFitScale(key);
        if (fit < minFit) minFit = fit;
        if (fit < 1) scaledCount++;

        const effBefore = rmax_ratio * 0.92 * 1.02;
        const effAfter = effBefore * fit;
        if (effAfter > maxEffAfter) maxEffAfter = effAfter;

        if (fit >= 0.6) {
          if (effAfter > 0.495) {
            if (fit === 0.6) {
              floorTouchedCount++;
              console.warn(`    ⚠️ [CẢNH BÁO SÀN 0.6] Ảnh ${key} chạm sàn fit=0.6 và effAfter vẫn vượt 0.495: ${effAfter.toFixed(4)}`);
            } else {
              assert.fail(`Ảnh ${key} có fit=${fit} >= 0.6 nhưng effAfter=${effAfter.toFixed(4)} > 0.495 (trước fit=${effBefore.toFixed(4)})`);
            }
          }
        }
      }

      assert.strictEqual(floorTouchedCount, 0, 'Có ảnh chạm sàn 0.6 vẫn vượt ngưỡng 0.495!');
      console.log(`    -> Đã quét ${webpFiles.length} ảnh: ${scaledCount} ảnh co nhỏ (fit < 1), minFit = ${minFit}, max effAfter = ${maxEffAfter.toFixed(4)} <= 0.495 (100% đạt chuẩn).`);
    } finally {
      await vite.close();
    }
  });

  console.log(`\n========================================`);
  console.log(`TẤT CẢ ${passedTests} BÀI KIỂM TRA HÌNH ẢNH ĐỀU VƯỢT QUA!`);
  console.log(`========================================\n`);
}

main().catch(err => {
  console.error('LỖI KIỂM THỬ:', err);
  process.exit(1);
});
