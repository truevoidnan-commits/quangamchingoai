import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const docArtifactsDir = path.resolve(__dirname, '../docs/ui-redesign/ngung-khi');
const brainArtifactsDir = 'C:/Users/ADMIN/.gemini/antigravity/brain/04a8635f-ab90-4862-af83-b6463b1f6a83';

if (!fs.existsSync(docArtifactsDir)) {
  fs.mkdirSync(docArtifactsDir, { recursive: true });
}
if (!fs.existsSync(brainArtifactsDir)) {
  fs.mkdirSync(brainArtifactsDir, { recursive: true });
}

const PORT = 4218;
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

async function saveScreenshot(page, filename) {
  const docPath = path.join(docArtifactsDir, filename);
  const brainPath = path.join(brainArtifactsDir, filename);
  await page.screenshot({ path: docPath, fullPage: false });
  try {
    fs.copyFileSync(docPath, brainPath);
  } catch (e) {}
  console.log(`  📷 Captured screenshot: ${filename}`);
}

function attachPageMonitors(page, suiteName, totalErrors) {
  page.on('pageerror', (err) => {
    console.error(`❌ [PageError in ${suiteName}]:`, err.message);
    totalErrors.push(`PageError in ${suiteName}: ${err.message}`);
  });
  page.on('console', (msg) => {
    const text = msg.text();
    if (/Unknown icon name/i.test(text)) {
      console.error(`❌ [UnknownIconName in ${suiteName}]:`, text);
      totalErrors.push(`UnknownIconName in ${suiteName}: ${text}`);
    }
  });
}

async function assertNoHelpCircle(page, suiteName, totalErrors) {
  const count = await page.locator('svg.lucide-circle-help, svg.lucide-help-circle, svg[class*="circle-help"], svg[class*="help-circle"]').count();
  if (count > 0) {
    totalErrors.push(`Found ${count} fallback HelpCircle icon(s) in ${suiteName}!`);
  } else {
    console.log(`  ✓ [${suiteName}] Zero HelpCircle icon in DOM.`);
  }
}

async function run() {
  console.log('===========================================================');
  console.log('🧪 VERIFYING NGƯNG KHÍ REDESIGN (UI, BEASTS, DOM, SCREENSHOTS)');
  console.log('===========================================================');

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  let totalErrors = [];

  try {
    // -----------------------------------------------------------------
    // TEST SUITE 1: TẦNG 1 (KHỞI ĐẦU, CHƯA CÓ THẦN THÚ)
    // -----------------------------------------------------------------
    console.log('\n--- 1. Testing Ngưng Khí Tầng 1 (Khởi đầu - Chưa hóa hình thần thú) ---');
    const ctxT1 = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const pageT1 = await ctxT1.newPage();
    attachPageMonitors(pageT1, 'T1 Desktop', totalErrors);

    await pageT1.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify({
        realm: 'ngung_khi',
        ngungKhiActivePath: 'the',
        ngungKhiTheExp: 0,
        ngungKhiPhapExp: 0,
      }));
    });

    await pageT1.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'domcontentloaded' });
    await pageT1.waitForTimeout(800);
    await assertNoHelpCircle(pageT1, 'T1 Desktop (The)', totalErrors);

    // Kiểm tra không có ảnh thần thú xuất hiện ở Tầng 1
    const beastImagesT1 = await pageT1.locator('svg .ngung-khi-beast-layer image').count();
    if (beastImagesT1 > 0) {
      totalErrors.push(`Expected 0 beast images at T1, but found ${beastImagesT1}`);
    } else {
      console.log('  ✓ T1: No beast image rendered as expected (Thần thú chỉ hóa hình từ T7).');
    }

    // Kiểm tra thông số thanh trạng thái T1
    const statusBarTextT1 = await pageT1.locator('div:has-text("Hải Sơn Quyết:")').last().textContent();
    if (!statusBarTextT1.includes('Tầng 1/10')) {
      totalErrors.push(`Expected "Tầng 1/10" in status bar, received: ${statusBarTextT1}`);
    } else {
      console.log('  ✓ T1: Status bar displays "Tầng 1/10".');
    }

    await saveScreenshot(pageT1, 'ngung-khi-the-t1-desktop-1920.png');

    // Chuyển sang góc nhìn Hóa Hải Kinh ở T1
    const hoaHaiBtnT1 = pageT1.locator('button:has-text("Hóa Hải Kinh")').first();
    await hoaHaiBtnT1.click();
    await pageT1.waitForTimeout(400);
    await assertNoHelpCircle(pageT1, 'T1 Desktop (Phap)', totalErrors);
    await saveScreenshot(pageT1, 'ngung-khi-phap-t1-desktop-1920.png');
    await ctxT1.close();

    // -----------------------------------------------------------------
    // TEST SUITE 2: TẦNG 8 (ĐÃ HÓA HÌNH THẦN THÚ)
    // -----------------------------------------------------------------
    console.log('\n--- 2. Testing Ngưng Khí Tầng 8 (Đã hóa hình Thần Thú T7..T9) ---');
    const ctxT8 = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageT8 = await ctxT8.newPage();
    attachPageMonitors(pageT8, 'T8 Laptop', totalErrors);

    await pageT8.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify({
        realm: 'ngung_khi',
        ngungKhiActivePath: 'the',
        ngungKhiTheExp: 2000,
        ngungKhiPhapExp: 2000,
      }));
    });

    await pageT8.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'domcontentloaded' });
    await pageT8.waitForTimeout(800);
    await assertNoHelpCircle(pageT8, 'T8 Laptop (The)', totalErrors);

    // Kiểm tra thần thú Huyết Hổ hiện diện
    const tigerImg = pageT8.locator('svg .ngung-khi-beast-layer image').first();
    if (!(await tigerImg.isVisible())) {
      totalErrors.push('Tiger image is not visible at Tầng 8');
    } else {
      const naturalWidth = await tigerImg.evaluate((el) => {
        const href = el.getAttribute('href');
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img.naturalWidth);
          img.onerror = () => resolve(0);
          img.src = href;
        });
      });
      if (naturalWidth === 0) {
        totalErrors.push('Tiger image failed to load (naturalWidth === 0)');
      } else {
        console.log(`  ✓ Tiger image loaded cleanly (naturalWidth: ${naturalWidth}px).`);
      }
    }

    // Kiểm tra biển tên Thần thú T8 Thể: "HUYẾT HỔ HÓA HÌNH"
    const tigerPlaqueText = await pageT8.locator('svg .ngung-khi-beast-layer text:has-text("HUYẾT HỔ")').textContent();
    if (!tigerPlaqueText.includes('HUYẾT HỔ HÓA HÌNH')) {
      totalErrors.push(`Expected plaque "HUYẾT HỔ HÓA HÌNH", got "${tigerPlaqueText}"`);
    } else {
      console.log('  ✓ Plaque shows correct dynamic title: "HUYẾT HỔ HÓA HÌNH".');
    }

    await saveScreenshot(pageT8, 'ngung-khi-the-t8-laptop-1366.png');

    // Chuyển sang Pháp (Long Kình)
    const phapBtnT8 = pageT8.locator('button:has-text("Hóa Hải Kinh")').first();
    await phapBtnT8.click();
    await pageT8.waitForTimeout(500);
    await assertNoHelpCircle(pageT8, 'T8 Laptop (Phap)', totalErrors);

    const whaleImg = pageT8.locator('svg .ngung-khi-beast-layer image').first();
    if (!(await whaleImg.isVisible())) {
      totalErrors.push('Whale image is not visible at Tầng 8');
    } else {
      const whalePlaqueText = await pageT8.locator('svg .ngung-khi-beast-layer text:has-text("LONG KÌNH")').textContent();
      if (!whalePlaqueText.includes('CẤM HẢI LONG KÌNH')) {
        totalErrors.push(`Expected plaque "CẤM HẢI LONG KÌNH", got "${whalePlaqueText}"`);
      } else {
        console.log('  ✓ Plaque shows correct dynamic title: "CẤM HẢI LONG KÌNH".');
      }
    }

    await saveScreenshot(pageT8, 'ngung-khi-phap-t8-laptop-1366.png');
    await ctxT8.close();

    // -----------------------------------------------------------------
    // TEST SUITE 3: TẦNG 10 VIÊN MÃN (MAX THẦN THÚ) & MOBILE VIEWPORT
    // -----------------------------------------------------------------
    console.log('\n--- 3. Testing Ngưng Khí Tầng 10 Viên Mãn & Mobile Viewport (390x844) ---');
    const ctxT10Mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true
    });
    const pageT10Mobile = await ctxT10Mobile.newPage();
    attachPageMonitors(pageT10Mobile, 'T10 Mobile', totalErrors);

    await pageT10Mobile.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify({
        realm: 'ngung_khi',
        ngungKhiActivePath: 'the',
        ngungKhiTheExp: 4500,
        ngungKhiPhapExp: 4500,
      }));
    });

    await pageT10Mobile.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'domcontentloaded' });
    await pageT10Mobile.waitForTimeout(800);
    await assertNoHelpCircle(pageT10Mobile, 'T10 Mobile (The)', totalErrors);

    // Kiểm tra danh hiệu T10 Thể: "THẦN THÚ HUYẾT HỔ"
    const tigerMaxTitle = await pageT10Mobile.locator('svg .ngung-khi-beast-layer text:has-text("HUYẾT HỔ")').textContent();
    if (!tigerMaxTitle.includes('THẦN THÚ HUYẾT HỔ')) {
      totalErrors.push(`Expected T10 plaque "THẦN THÚ HUYẾT HỔ", got "${tigerMaxTitle}"`);
    } else {
      console.log('  ✓ T10 Plaque title reached supreme status: "THẦN THÚ HUYẾT HỔ".');
    }

    await saveScreenshot(pageT10Mobile, 'ngung-khi-the-t10-mobile-390.png');

    // Chuyển sang Pháp T10
    const phapBtnT10 = pageT10Mobile.locator('button:has-text("Hóa Hải Kinh")').first();
    await phapBtnT10.click();
    await pageT10Mobile.waitForTimeout(500);
    await assertNoHelpCircle(pageT10Mobile, 'T10 Mobile (Phap)', totalErrors);

    const whaleMaxTitle = await pageT10Mobile.locator('svg .ngung-khi-beast-layer text:has-text("LONG KÌNH")').textContent();
    if (!whaleMaxTitle.includes('THÁI CỔ LONG KÌNH')) {
      totalErrors.push(`Expected T10 plaque "THÁI CỔ LONG KÌNH", got "${whaleMaxTitle}"`);
    } else {
      console.log('  ✓ T10 Plaque title reached supreme status: "THÁI CỔ LONG KÌNH".');
    }

    await saveScreenshot(pageT10Mobile, 'ngung-khi-phap-t10-mobile-390.png');
    await ctxT10Mobile.close();

    // Tablet Viewport (768x1024)
    console.log('\n--- 4. Testing Tablet Viewport (768x1024) ---');
    const ctxTablet = await browser.newContext({ viewport: { width: 768, height: 1024 } });
    const pageTablet = await ctxTablet.newPage();
    attachPageMonitors(pageTablet, 'Tablet', totalErrors);

    await pageTablet.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify({
        realm: 'ngung_khi',
        ngungKhiActivePath: 'the',
        ngungKhiTheExp: 4500,
        ngungKhiPhapExp: 4500,
      }));
    });
    await pageTablet.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'domcontentloaded' });
    await pageTablet.waitForTimeout(800);
    await assertNoHelpCircle(pageTablet, 'Tablet (The)', totalErrors);
    await saveScreenshot(pageTablet, 'ngung-khi-the-t10-tablet-768.png');
    await ctxTablet.close();

    // -----------------------------------------------------------------
    // TEST SUITE 5: SIDE PANEL INFO AUDIT (CHECK NO #22c55e & ROADMAP)
    // -----------------------------------------------------------------
    console.log('\n--- 5. Testing SidePanelInfo Audit for Ngưng Khí ---');
    const ctxPanel = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const pagePanel = await ctxPanel.newPage();
    attachPageMonitors(pagePanel, 'SidePanel', totalErrors);

    await pagePanel.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify({
        realm: 'ngung_khi',
        ngungKhiActivePath: 'the',
        ngungKhiTheExp: 2000,
        ngungKhiPhapExp: 2000,
      }));
    });
    await pagePanel.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'domcontentloaded' });
    await pagePanel.waitForTimeout(800);
    await assertNoHelpCircle(pagePanel, 'SidePanel', totalErrors);

    // Mở hoặc tìm panel thông tin
    const sidePanelHtml = await pagePanel.evaluate(() => {
      const panel = document.querySelector('aside') || document.querySelector('[class*="sidePanel"]') || document.body;
      return panel ? panel.innerHTML : '';
    });

    // Nghiêm ngặt kiểm tra không có chuỗi #22c55e trong vùng Ngưng Khí
    const hasForbiddenGreen = await pagePanel.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.includes('Hải Sơn Quyết'));
      if (buttons.length === 0) return false;
      const container = buttons[0].closest('div[style*="display: flex"]') || buttons[0].parentElement.parentElement;
      return container ? container.innerHTML.includes('#22c55e') : false;
    });

    if (hasForbiddenGreen) {
      totalErrors.push('Found forbidden color #22c55e in SidePanelInfo Ngưng Khí DOM!');
    } else {
      console.log('  ✓ PASS: Zero occurrences of #22c55e in SidePanelInfo Ngưng Khí DOM.');
    }

    // Kiểm tra các ô roadmap có hiển thị đủ 10 tầng
    const roadmapCellsCount = await pagePanel.locator('div[class*="roadmapCell"]').count();
    if (roadmapCellsCount !== 10) {
      totalErrors.push(`Expected 10 roadmap cells, found ${roadmapCellsCount}`);
    } else {
      console.log(`  ✓ Roadmap grid has exactly 10 milestone cells.`);
    }

    await saveScreenshot(pagePanel, 'ngung-khi-sidepanel-desktop-1920.png');
    await ctxPanel.close();

  } catch (err) {
    console.error('❌ Exception during test:', err);
    totalErrors.push(err.message);
  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n===========================================================');
  if (totalErrors.length === 0) {
    console.log('🎉 ALL NGƯNG KHÍ REDESIGN TESTS PASSED WITH 0 ERRORS!');
    console.log('===========================================================');
    process.exit(0);
  } else {
    console.error(`💥 TEST FAILED WITH ${totalErrors.length} ERROR(S):`);
    totalErrors.forEach((e) => console.error(`  - ${e}`));
    console.log('===========================================================');
    process.exit(1);
  }
}

run();
