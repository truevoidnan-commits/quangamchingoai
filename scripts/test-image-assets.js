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

  console.log(`\n========================================`);
  console.log(`TẤT CẢ ${passedTests} BÀI KIỂM TRA HÌNH ẢNH ĐỀU VƯỢT QUA!`);
  console.log(`========================================\n`);
}

main().catch(err => {
  console.error('LỖI KIỂM THỬ:', err);
  process.exit(1);
});
