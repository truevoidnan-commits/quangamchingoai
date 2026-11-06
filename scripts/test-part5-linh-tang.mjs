import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const outDir = path.resolve(__dirname, '../docs/ui-redesign/realms-polish');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const PORT = 4225;
const BASE_URL = `http://127.0.0.1:${PORT}`;

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

function startServer() {
  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/' || !reqPath) reqPath = '/index.html';
    let filePath = path.join(distDir, reqPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }
    const ext = path.extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

async function compressImage(filePath) {
  const buf = fs.readFileSync(filePath);
  const compressed = await sharp(buf).png({ quality: 80, compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(filePath, compressed);
}

function createLinhTangState() {
  const linhTangs = [
    { id: 1, name: 'Tòa Bí Tàng Thứ Nhất', isInitialized: true, isGateOpen: true, type: 'than_tang', sourceDaoAnhName: 'Đạo Anh Thần Thoại' },
    { id: 2, name: 'Tòa Bí Tàng Thứ Hai', isInitialized: true, isGateOpen: true, type: 'bi_tang', sourceDaoAnhName: 'Hỗn Độn Kiếm Anh' },
    { id: 3, name: 'Tòa Bí Tàng Thứ Ba', isInitialized: true, isGateOpen: false, type: 'bi_tang', sourceDaoAnhName: 'Huyết Hổ Đạo Anh', currentThienDaoExp: 500 },
    { id: 4, name: 'Tòa Bí Tàng Thứ Tư', isInitialized: false, isGateOpen: false },
    { id: 5, name: 'Tòa Bí Tàng Thứ Năm', isInitialized: false, isGateOpen: false },
  ];

  const daoAnhs = Array.from({ length: 13 }).map((_, i) => ({
    id: `dao_anh_${i + 1}`,
    name: `Đạo Anh #${i + 1}`,
    currentKiep: 5,
    level: 10,
    active: true,
  }));

  return {
    realm: 'linh_tang',
    phapKhieu: 120,
    selfMenhHoa: 4,
    has121st: true,
    maxThienCung: 13,
    realizedThienCung: 13,
    daoAnhs,
    linhTangs,
    activeProfile: 'real',
  };
}

async function run() {
  console.log('===========================================================');
  console.log('🧪 TESTING PHẦN 5: LINH TÀNG FULL-BLEED & TITLE CLEANUP');
  console.log('===========================================================');

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  let hasErrors = false;

  try {
    const viewports = [
      { name: 'desktop-1920', width: 1920, height: 1080, isMobile: false },
      { name: 'desktop-1366', width: 1366, height: 768, isMobile: false },
      { name: 'mobile-390', width: 390, height: 844, isMobile: true },
    ];

    for (const vp of viewports) {
      console.log(`\n--- Testing ${vp.name} (${vp.width}x${vp.height}) ---`);
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile });
      const page = await context.newPage();

      await page.addInitScript((mockState) => {
        try {
          localStorage.clear();
          localStorage.setItem('tcl_active_profile', 'real');
          localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mockState));
        } catch (e) {}
      }, createLinhTangState());

      await page.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'networkidle', timeout: 15000 }).catch(async () => {
        await page.waitForTimeout(1000);
      });
      await page.waitForTimeout(1500);

      const audit = await page.evaluate(() => {
        const text = document.body.innerText;
        const hasRedundantTitle = text.includes('NGŨ ĐẠI BÍ TÀNG KHAI THIÊN');
        const reassignBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Tùy Chỉnh 5 Đạo Anh'));
        const container = document.querySelector('[class*="container"]');
        const computedStyle = container ? window.getComputedStyle(container) : null;
        const gates = document.querySelectorAll('[class*="celestialGateEntity"]');

        return {
          hasRedundantTitle,
          hasReassignBtn: Boolean(reassignBtn),
          borderRadius: computedStyle?.borderRadius,
          hasBgImage: computedStyle?.backgroundImage?.includes('bg_linh_tang_bi_tang'),
          gateCount: gates.length,
        };
      });

      console.log(`  Audit for ${vp.name}:`, audit);

      if (audit.hasRedundantTitle) {
        console.error(`  🚨 FAIL: Redundant title NGŨ ĐẠI BÍ TÀNG KHAI THIÊN still present on ${vp.name}!`);
        hasErrors = true;
      } else {
        console.log(`  ✅ PASS: Redundant title removed cleanly on ${vp.name}.`);
      }

      if (!audit.hasReassignBtn) {
        console.error(`  🚨 FAIL: Reassign button missing on ${vp.name}!`);
        hasErrors = true;
      } else {
        console.log(`  ✅ PASS: Reassign button is present on ${vp.name}.`);
      }

      if (audit.borderRadius && audit.borderRadius !== '0px') {
        console.error(`  🚨 FAIL: Container still has border-radius (${audit.borderRadius}) on ${vp.name}!`);
        hasErrors = true;
      } else {
        console.log(`  ✅ PASS: Container has 0px border-radius (full-bleed) on ${vp.name}.`);
      }

      if (audit.gateCount !== 5) {
        console.error(`  🚨 FAIL: Expected 5 gates, found ${audit.gateCount} on ${vp.name}!`);
        hasErrors = true;
      } else {
        console.log(`  ✅ PASS: 5 divine gate portals present on ${vp.name}.`);
      }

      const shotPath = path.join(outDir, `linh-tang-${vp.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
      await compressImage(shotPath);
      console.log(`  📸 Screenshot saved: ${shotPath}`);
      await context.close();
    }
  } catch (err) {
    console.error('Test execution error:', err);
    hasErrors = true;
  } finally {
    await browser.close();
    server.close();
  }

  console.log('===========================================================');
  if (hasErrors) {
    console.error('❌ PART 5 LINH TÀNG VERIFICATION FAILED!');
    process.exit(1);
  } else {
    console.log('✅ ALL PART 5 LINH TÀNG VERIFICATIONS PASSED CLEANLY (100%)!');
    process.exit(0);
  }
}

run();
