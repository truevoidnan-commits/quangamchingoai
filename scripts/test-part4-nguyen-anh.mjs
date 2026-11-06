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

const PORT = 4220;
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

// Generate 13 sample Dao Anh for Nguyen Anh state
function createNguyenAnhState() {
  const daoAnhs = Array.from({ length: 13 }).map((_, i) => ({
    id: `dao_anh_${i + 1}`,
    name: `Đạo Anh #${i + 1}`,
    currentKiep: 5,
    level: 10,
    active: true,
  }));

  return {
    realm: 'nguyen_anh',
    phapKhieu: 120,
    selfMenhHoa: 4,
    has121st: true,
    maxThienCung: 13,
    realizedThienCung: 13,
    daoAnhs,
    currentThienCungExp: 10000,
    activeProfile: 'real',
  };
}

async function run() {
  console.log('===========================================================');
  console.log('🧪 TESTING PHẦN 4: NGUYÊN ANH SWAP ICON & DEDICATED BG');
  console.log('===========================================================');

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  let hasErrors = false;

  try {
    // 1. DESKTOP TEST (1920x1080)
    console.log('\n--- 1. Desktop Test (1920x1080) ---');
    const contextDesktop = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const pageDesktop = await contextDesktop.newPage();

    await pageDesktop.addInitScript((mockState) => {
      try {
        localStorage.clear();
        localStorage.setItem('tcl_active_profile', 'real');
        localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mockState));
      } catch (e) {}
    }, createNguyenAnhState());

    await pageDesktop.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'networkidle', timeout: 15000 }).catch(async () => {
      await pageDesktop.waitForTimeout(1000);
    });
    await pageDesktop.waitForTimeout(1500);

    const desktopData = await pageDesktop.evaluate(() => {
      // Find swap button
      const buttons = Array.from(document.querySelectorAll('button'));
      const swapBtn = buttons.find(b => b.innerText.includes('Hoán vị') || b.title?.includes('hoán vị'));
      const hasSvgBg = Boolean(document.querySelector('image[href*="bg_nguyen_anh_thuc_hai"]'));
      const hasDivBg = Boolean(document.querySelector('div[style*="bg_nguyen_anh_thuc_hai"]'));
      
      return {
        hasSwapBtn: Boolean(swapBtn),
        swapBtnText: swapBtn ? swapBtn.innerText.trim() : '',
        swapBtnHasIcon: swapBtn ? Boolean(swapBtn.querySelector('svg')) : false,
        hasSvgBg,
        hasDivBg,
      };
    });

    console.log('  Desktop Evaluation:', desktopData);

    if (!desktopData.hasSwapBtn || !desktopData.swapBtnText.includes('Hoán vị') || !desktopData.swapBtnHasIcon) {
      console.error('  🚨 FAIL: Desktop swap button missing or malformed!');
      hasErrors = true;
    } else {
      console.log('  ✅ PASS: Desktop swap button has "Hoán vị" text & icon.');
    }

    if (!desktopData.hasSvgBg && !desktopData.hasDivBg) {
      console.error('  🚨 FAIL: Dedicated bg_nguyen_anh_thuc_hai background not detected!');
      hasErrors = true;
    } else {
      console.log('  ✅ PASS: Dedicated Vũ Trụ Thức Hải background applied.');
    }

    const shot1920 = path.join(outDir, 'nguyen-anh-desktop-1920.png');
    await pageDesktop.screenshot({ path: shot1920, fullPage: false });
    await compressImage(shot1920);
    console.log(`  📸 Screenshot saved: ${shot1920}`);
    await contextDesktop.close();

    // 2. MOBILE TEST (390x844)
    console.log('\n--- 2. Mobile Test (390x844) ---');
    const contextMobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const pageMobile = await contextMobile.newPage();

    await pageMobile.addInitScript((mockState) => {
      try {
        localStorage.clear();
        localStorage.setItem('tcl_active_profile', 'real');
        localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mockState));
      } catch (e) {}
    }, createNguyenAnhState());

    await pageMobile.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'networkidle', timeout: 15000 }).catch(async () => {
      await pageMobile.waitForTimeout(1000);
    });
    await pageMobile.waitForTimeout(1500);

    const mobileData = await pageMobile.evaluate(() => {
      const swapBtn = document.querySelector('.mobile-swap-btn');
      return {
        hasMobileSwapBtn: Boolean(swapBtn),
        hasMobileSwapIcon: swapBtn ? Boolean(swapBtn.querySelector('svg')) : false,
      };
    });

    console.log('  Mobile Evaluation:', mobileData);

    if (!mobileData.hasMobileSwapBtn || !mobileData.hasMobileSwapIcon) {
      console.error('  🚨 FAIL: Mobile swap button or icon missing!');
      hasErrors = true;
    } else {
      console.log('  ✅ PASS: Mobile swap button has icon in mobile toolbar.');
    }

    const shot390 = path.join(outDir, 'nguyen-anh-mobile-390.png');
    await pageMobile.screenshot({ path: shot390, fullPage: false });
    await compressImage(shot390);
    console.log(`  📸 Screenshot saved: ${shot390}`);
    await contextMobile.close();
  } catch (err) {
    console.error('Test execution error:', err);
    hasErrors = true;
  } finally {
    await browser.close();
    server.close();
  }

  console.log('===========================================================');
  if (hasErrors) {
    console.error('❌ PART 4 NGUYEN ANH VERIFICATION FAILED!');
    process.exit(1);
  } else {
    console.log('✅ ALL PART 4 NGUYEN ANH VERIFICATIONS PASSED CLEANLY (100%)!');
    process.exit(0);
  }
}

run();
