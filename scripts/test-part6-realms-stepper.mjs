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

const PORT = 4230;
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

// Generate state where current realm is Kim Dan (ranks: Ngung Khi=1, Truc Co=2, Kim Dan=3, Nguyen Anh=4, Linh Tang=5)
function createKimDanState() {
  return {
    realm: 'kim_dan',
    ngungKhiLevel: 10,
    ngungKhiActivePath: 'the',
    phapKhieu: 120,
    selfMenhHoa: 4,
    has121st: true,
    maxThienCung: 13,
    realizedThienCung: 10,
    absorbedLamps: ['l1', 'l2', 'l3'],
    currentThienCungExp: 500,
    activeProfile: 'real',
  };
}

async function run() {
  console.log('===========================================================');
  console.log('🧪 TESTING PHẦN 6: UNIFIED FROSTED REALM STEPPER AUDIT');
  console.log('===========================================================');

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  let hasErrors = false;

  try {
    // 1. DESKTOP 1920x1080 AUDIT
    console.log('\n--- 1. Desktop 1920x1080 Stepper State Audit ---');
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();

    await page.addInitScript((mockState) => {
      try {
        localStorage.clear();
        localStorage.setItem('tcl_active_profile', 'real');
        localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mockState));
      } catch (e) {}
    }, createKimDanState());

    await page.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'networkidle', timeout: 15000 }).catch(async () => {
      await page.waitForTimeout(1000);
    });
    await page.waitForTimeout(1500);

    const stepperAudit = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.stepper-card'));
      return cards.map(c => {
        const title = c.querySelector('.stepper-title')?.innerText || '';
        const isCurrent = c.classList.contains('current');
        const isCompleted = c.classList.contains('completed');
        const isLocked = c.classList.contains('locked');
        const isViewing = c.classList.contains('viewing');
        const has121Chip = Boolean(c.querySelector('.cuc-canh-chip'));
        const hasProgressBar = Boolean(c.querySelector('.stepper-progress-wrap'));
        const badgeText = c.querySelector('.stepper-badge')?.innerText || '';
        const hasIcon = Boolean(c.querySelector('.stepper-icon-wrap svg'));

        return {
          title,
          isCurrent,
          isCompleted,
          isLocked,
          isViewing,
          has121Chip,
          hasProgressBar,
          badgeText,
          hasIcon,
        };
      });
    });

    console.log('  Cards Audit:', JSON.stringify(stepperAudit, null, 2));

    if (stepperAudit.length !== 5) {
      console.error(`  🚨 FAIL: Expected exactly 5 stepper cards, found ${stepperAudit.length}!`);
      hasErrors = true;
    } else {
      console.log('  ✅ PASS: Exactly 5 realm cards found (Cực Cảnh 121 unified as a badge).');
    }

    // Check states for Kim Dan state (Ngung Khi: completed, Truc Co: completed, Kim Dan: current, Nguyen Anh: locked, Linh Tang: locked)
    const ngungKhi = stepperAudit.find(c => c.title.includes('NGƯNG KHÍ'));
    const trucCo = stepperAudit.find(c => c.title.includes('TRÚC CƠ'));
    const kimDan = stepperAudit.find(c => c.title.includes('KIM ĐAN'));
    const nguyenAnh = stepperAudit.find(c => c.title.includes('NGUYÊN ANH'));
    const linhTang = stepperAudit.find(c => c.title.includes('LINH TÀNG'));

    if (!ngungKhi?.isCompleted || !ngungKhi?.badgeText.includes('Đã đạt')) {
      console.error('  🚨 FAIL: Ngưng Khí card state mismatch (expected completed)!');
      hasErrors = true;
    } else {
      console.log('  ✅ PASS: Ngưng Khí card is ĐÃ ĐẠT.');
    }

    if (!trucCo?.isCompleted || !trucCo?.has121Chip) {
      console.error('  🚨 FAIL: Trúc Cơ card state or Cực Cảnh 121 badge mismatch!');
      hasErrors = true;
    } else {
      console.log('  ✅ PASS: Trúc Cơ card has Cực Cảnh 121 badge attached.');
    }

    if (!kimDan?.isCurrent || !kimDan?.badgeText.includes('Hiện tại') || !kimDan?.isViewing) {
      console.error('  🚨 FAIL: Kim Đan card state mismatch (expected current + viewing)!');
      hasErrors = true;
    } else {
      console.log('  ✅ PASS: Kim Đan card is ĐANG ĐỨNG (Hiện tại) & ĐANG XEM.');
    }

    if (!nguyenAnh?.isLocked || !nguyenAnh?.badgeText.includes('Chưa mở')) {
      console.error('  🚨 FAIL: Nguyên Anh card state mismatch (expected locked)!');
      hasErrors = true;
    } else {
      console.log('  ✅ PASS: Nguyên Anh card is CHƯA MỞ.');
    }

    if (!linhTang?.isLocked || !linhTang?.badgeText.includes('Chưa mở')) {
      console.error('  🚨 FAIL: Linh Tàng card state mismatch (expected locked)!');
      hasErrors = true;
    } else {
      console.log('  ✅ PASS: Linh Tàng card is CHƯA MỞ.');
    }

    // Capture initial Kim Dan 1920
    const shotKimDan = path.join(outDir, 'stepper-kim-dan-desktop-1920.png');
    await page.screenshot({ path: shotKimDan, fullPage: false });
    await compressImage(shotKimDan);
    console.log(`  📸 Screenshot saved: ${shotKimDan}`);

    // Click Trúc Cơ to test activeRealmView previewing
    console.log('\n--- 2. Testing Previewing Other Realm (Clicking Trúc Cơ) ---');
    await page.click('button:has-text("TRÚC CƠ KỲ")');
    await page.waitForTimeout(500);

    const viewingAudit = await page.evaluate(() => {
      const trucCoCard = Array.from(document.querySelectorAll('.stepper-card')).find(c => c.innerText.includes('TRÚC CƠ'));
      return {
        isViewing: trucCoCard?.classList.contains('viewing'),
        hasViewingTag: Boolean(trucCoCard?.querySelector('.stepper-viewing-tag')),
        hasProgressBar: Boolean(trucCoCard?.querySelector('.stepper-progress-wrap')),
      };
    });

    console.log('  Trúc Cơ Viewing Audit:', viewingAudit);

    if (!viewingAudit.isViewing || !viewingAudit.hasViewingTag || !viewingAudit.hasProgressBar) {
      console.error('  🚨 FAIL: Trúc Cơ viewing state or progress bar missing after click!');
      hasErrors = true;
    } else {
      console.log('  ✅ PASS: Trúc Cơ is now ĐANG XEM with progress bar & viewing tag.');
    }

    const shotTrucCoView = path.join(outDir, 'stepper-truc-co-preview-1920.png');
    await page.screenshot({ path: shotTrucCoView, fullPage: false });
    await compressImage(shotTrucCoView);
    console.log(`  📸 Screenshot saved: ${shotTrucCoView}`);
    await context.close();

    // 3. LAPTOP 1366x768 AUDIT
    console.log('\n--- 3. Testing Laptop (1366x768) ---');
    const context1366 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const page1366 = await context1366.newPage();
    await page1366.addInitScript((mockState) => {
      try {
        localStorage.clear();
        localStorage.setItem('tcl_active_profile', 'real');
        localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mockState));
      } catch (e) {}
    }, createKimDanState());
    await page1366.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'networkidle', timeout: 15000 }).catch(async () => {
      await page1366.waitForTimeout(1000);
    });
    await page1366.waitForTimeout(1000);

    const shot1366 = path.join(outDir, 'stepper-desktop-1366.png');
    await page1366.screenshot({ path: shot1366, fullPage: false });
    await compressImage(shot1366);
    console.log(`  📸 Screenshot saved: ${shot1366}`);
    await context1366.close();

    // 4. MOBILE 390x844 AUDIT
    console.log('\n--- 4. Testing Mobile (390x844) Cảnh Giới Tab ---');
    const contextMobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const pageMobile = await contextMobile.newPage();
    await pageMobile.addInitScript((mockState) => {
      try {
        localStorage.clear();
        localStorage.setItem('tcl_active_profile', 'real');
        localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mockState));
      } catch (e) {}
    }, createKimDanState());
    await pageMobile.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'networkidle', timeout: 15000 }).catch(async () => {
      await pageMobile.waitForTimeout(1000);
    });
    await pageMobile.waitForTimeout(1000);

    // Switch to Cảnh Giới mobile tab
    await pageMobile.click('button:has-text("CẢNH GIỚI")');
    await pageMobile.waitForTimeout(600);

    const mobileVisible = await pageMobile.evaluate(() => {
      const leftCol = document.querySelector('.cultivation-col-left');
      const cards = document.querySelectorAll('.stepper-card');
      return {
        colVisible: leftCol ? window.getComputedStyle(leftCol).display !== 'none' : false,
        cardCount: cards.length,
      };
    });

    console.log('  Mobile Stepper Audit:', mobileVisible);

    if (!mobileVisible.colVisible || mobileVisible.cardCount !== 5) {
      console.error('  🚨 FAIL: Mobile realm tab failed to show 5 cards!');
      hasErrors = true;
    } else {
      console.log('  ✅ PASS: Mobile realm tab displays all 5 frosted cards cleanly.');
    }

    const shotMobile = path.join(outDir, 'stepper-mobile-390.png');
    await pageMobile.screenshot({ path: shotMobile, fullPage: false });
    await compressImage(shotMobile);
    console.log(`  📸 Screenshot saved: ${shotMobile}`);
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
    console.error('❌ PART 6 STEPPER AUDIT FAILED!');
    process.exit(1);
  } else {
    console.log('✅ ALL PART 6 STEPPER AUDIT CHECKS PASSED CLEANLY (100%)!');
    process.exit(0);
  }
}

run();
