import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const galleryDir = path.resolve(__dirname, '../docs/ui-redesign/gallery');
const brainDir = 'C:/Users/ADMIN/.gemini/antigravity/brain/04a8635f-ab90-4862-af83-b6463b1f6a83';

if (!fs.existsSync(galleryDir)) {
  fs.mkdirSync(galleryDir, { recursive: true });
}

const PORT = 4299;
const SUBPATH = '/quangamchingoai';
const BASE_URL = `http://127.0.0.1:${PORT}${SUBPATH}`;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

function startSubpathServer() {
  const server = http.createServer((req, res) => {
    let reqUrl = req.url.split('?')[0];
    if (!reqUrl.startsWith(SUBPATH)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found - outside subpath');
      return;
    }

    let subUrl = reqUrl.slice(SUBPATH.length);
    if (!subUrl || subUrl === '/') subUrl = '/index.html';

    let filePath = path.join(distDir, subUrl);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      if (subUrl.startsWith('/images/') || subUrl.startsWith('/assets/')) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Asset not found in dist');
        return;
      }
      // SPA route fallback
      filePath = path.join(distDir, 'index.html');
    }

    const ext = path.extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

async function compressImage(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    const compressed = await sharp(buf).png({ quality: 80, compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(filePath, compressed);
  } catch (e) {
    console.warn('Could not compress screenshot:', e.message);
  }
}

async function verify() {
  console.log('===========================================================');
  console.log('🌐 SIMULATING GITHUB PAGES SUBPATH PRODUCTION ENVIRONMENT');
  console.log(`URL: ${BASE_URL}/#/cultivation`);
  console.log('===========================================================');

  const server = await startSubpathServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const errors = [];
  page.on('pageerror', (err) => {
    console.error('❌ Page Error:', err.message);
    errors.push(err.message);
  });
  page.on('response', (res) => {
    if (res.status() === 404) {
      console.error(`❌ 404 Response: ${res.url()}`);
      errors.push(`404: ${res.url()}`);
    }
  });

  const mockState = {
    realm: 'nguyen_anh',
    ngungKhiLevel: 10,
    phapKhieu: 120,
    has121st: true,
    maxThienCung: 13,
    realizedThienCung: 13,
    inventoryArtifacts: ['de_kiem', 'tam_thu_dao'],
    inventoryLamps: ['nguyen_thuy_thien_ma', 'hon_don_so_khai'],
    palaceAnchors: {
      0: { id: 'tao_hoa_ngoc_diep', name: 'Tạo Hóa Ngọc Điệp Cung', tier: 'than_pham' },
    },
    daoAnhs: [
      {
        id: 'dao_anh_1',
        name: 'Tạo Hóa Ngọc Điệp Đạo Anh',
        artifactId: 'tao_hoa_ngoc_diep',
        palaceIndex: 0,
        fromLamp: false,
        currentKiep: 3,
        currentExp: 4500,
        maxExp: 10000,
        level: 10,
        active: true,
        glowColor: '#38bdf8',
      },
      {
        id: 'dao_anh_2',
        name: 'Hỗn Độn Sơ Khai Đạo Anh',
        fromLamp: true,
        lampId: 'hon_don_so_khai',
        currentKiep: 5,
        currentExp: 10000,
        maxExp: 10000,
        level: 10,
        active: true,
        glowColor: '#fbbf24',
      },
    ],
    activeProfile: 'real',
  };

  await page.addInitScript((mock) => {
    try {
      localStorage.clear();
      localStorage.setItem('tcl_active_profile', 'real');
      localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mock));
      window.__DEBUG_DAOANH = true;
    } catch (e) {}
  }, mockState);

  console.log('\n[1] Navigating to cultivation page under subpath...');
  await page.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // Check Nguyên Anh realm view
  console.log('[2] Verifying Nguyên Anh Realm view...');
  const nguyenAnhEvaluation = await page.evaluate(() => {
    const svgImages = Array.from(document.querySelectorAll('svg image')).map((img) => ({
      href: img.getAttribute('href') || img.getAttribute('xlink:href'),
      width: img.getAttribute('width'),
      height: img.getAttribute('height'),
    }));

    const htmlImages = Array.from(document.querySelectorAll('img')).map((img) => ({
      src: img.src,
      alt: img.alt || '',
      complete: img.complete,
      naturalWidth: img.naturalWidth,
    }));

    const hasDedicatedBg = Boolean(
      document.querySelector('image[href*="bg_nguyen_anh_thuc_hai"]') ||
      document.querySelector('div[style*="bg_nguyen_anh_thuc_hai"]')
    );

    const swapBtn = Array.from(document.querySelectorAll('button')).find(
      (b) => b.innerText.includes('Hoán vị') || b.title?.includes('hoán vị')
    );

    return {
      svgImages,
      htmlImages,
      hasDedicatedBg,
      hasSwapBtn: Boolean(swapBtn),
    };
  });

  console.log('  Nguyên Anh Evaluation:', {
    svgCount: nguyenAnhEvaluation.svgImages.length,
    htmlCount: nguyenAnhEvaluation.htmlImages.length,
    hasDedicatedBg: nguyenAnhEvaluation.hasDedicatedBg,
    hasSwapBtn: nguyenAnhEvaluation.hasSwapBtn,
    svgImagesSample: nguyenAnhEvaluation.svgImages.slice(0, 3),
  });

  if (!nguyenAnhEvaluation.hasDedicatedBg) {
    throw new Error('Dedicated Vũ Trụ Thức Hải background not found in Nguyên Anh view!');
  }

  // Take screenshot of Nguyên Anh Realm
  const nguyenAnhShot = path.join(galleryDir, 'evidence-nguyen-anh-prod.png');
  await page.screenshot({ path: nguyenAnhShot });
  await compressImage(nguyenAnhShot);
  console.log(`  📷 Screenshot saved & compressed: ${nguyenAnhShot}`);

  if (fs.existsSync(brainDir)) {
    fs.copyFileSync(nguyenAnhShot, path.join(brainDir, 'evidence-nguyen-anh-prod.png'));
    console.log('  ✓ Copied screenshot to artifacts directory');
  }

  // Open Gallery Modal
  console.log('\n[3] Opening Đạo Anh Đồ Lục modal...');
  const openBtn = page.locator('button[title*="Đạo Anh Đồ Lục"], button:has-text("ĐẠO ANH ĐỒ LỤC"), button:has-text("Đạo Anh Đồ Lục")').first();
  await openBtn.click();
  await page.waitForTimeout(1000);

  // Check gallery images
  console.log('[4] Verifying Đồ Lục modal images...');
  const galleryCheck = await page.evaluate(() => {
    const modal = document.querySelector('div[role="dialog"][aria-modal="true"]');
    if (!modal) return { error: 'Modal not found' };
    const imgs = Array.from(modal.querySelectorAll('img')).filter((img) => {
      const r = img.getBoundingClientRect();
      const s = window.getComputedStyle(img);
      const inVp = r.top < window.innerHeight && r.bottom > 0 && r.left < window.innerWidth && r.right > 0;
      return inVp && r.width > 0 && r.height > 0 && s.display !== 'none';
    });
    const broken = imgs.filter((i) => !i.complete || i.naturalWidth === 0);
    return {
      totalVisible: imgs.length,
      brokenCount: broken.length,
      broken: broken.map((b) => ({ src: b.src, alt: b.alt, naturalWidth: b.naturalWidth })),
      samples: imgs.slice(0, 5).map((i) => ({ src: i.src.slice(0, 60), alt: i.alt, naturalWidth: i.naturalWidth })),
    };
  });

  if (galleryCheck.error || galleryCheck.brokenCount > 0) {
    throw new Error(`Gallery image error: ${JSON.stringify(galleryCheck)}`);
  }
  console.log(`  ✓ All ${galleryCheck.totalVisible} visible images in Đồ Lục loaded with naturalWidth > 0!`);
  console.log('  Samples:', galleryCheck.samples);

  // Take screenshot of Đạo Anh Đồ Lục
  const galleryShot = path.join(galleryDir, 'evidence-dao-anh-gallery-prod.png');
  await page.screenshot({ path: galleryShot });
  await compressImage(galleryShot);
  console.log(`  📷 Screenshot saved & compressed: ${galleryShot}`);

  if (fs.existsSync(brainDir)) {
    fs.copyFileSync(galleryShot, path.join(brainDir, 'evidence-dao-anh-gallery-prod.png'));
    console.log('  ✓ Copied screenshot to artifacts directory');
  }

  await browser.close();
  server.close();

  if (errors.length > 0) {
    console.error(`❌ Encountered ${errors.length} network or runtime errors!`);
    process.exit(1);
  }

  console.log('\n🎉 ALL SUBPATH PRODUCTION VERIFICATIONS PASSED 100%!');
  process.exit(0);
}

verify().catch((err) => {
  console.error('\n❌ Verification failed:', err);
  process.exit(1);
});
