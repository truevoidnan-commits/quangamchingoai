import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const outDir = path.resolve(__dirname, '../docs/ui-redesign/realms-gallery-followup');

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

async function verifyNoTruncation(page, label) {
  const truncationAudit = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.stepper-card'));
    return cards.map((c) => {
      const titleEl = c.querySelector('.stepper-title');
      const subEl = c.querySelector('.stepper-sub');
      return {
        title: titleEl?.textContent?.trim() || '',
        titleScrollWidth: titleEl?.scrollWidth || 0,
        titleClientWidth: titleEl?.clientWidth || 0,
        titleTruncated: titleEl ? titleEl.scrollWidth > titleEl.clientWidth + 2 : false,
        subText: subEl?.textContent?.trim() || '',
        subScrollWidth: subEl?.scrollWidth || 0,
        subClientWidth: subEl?.clientWidth || 0,
        subTruncated: subEl ? subEl.scrollWidth > subEl.clientWidth + 2 : false,
      };
    });
  });

  console.log(`  [${label}] Truncation Audit:`, JSON.stringify(truncationAudit, null, 2));
  let hasTruncation = false;
  for (const item of truncationAudit) {
    if (item.titleTruncated) {
      console.error(`  🚨 FAIL: Realm title "${item.title}" is truncated on ${label}! (scroll=${item.titleScrollWidth} > client=${item.titleClientWidth})`);
      hasTruncation = true;
    }
  }
  if (!hasTruncation) {
    console.log(`  ✅ PASS: All realm titles never truncate on ${label}!`);
  }
  return !hasTruncation;
}

async function run() {
  console.log('===========================================================');
  console.log('🧪 TESTING PHẦN 6: BREATHABLE REALM STEPPER & SCROLLABLE LEFT COLUMN');
  console.log('===========================================================');

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  let hasErrors = false;

  try {
    // 1. DESKTOP 1920x1080
    console.log('\n--- 1. Desktop 1920x1080 Stepper Audit ---');
    const context1080 = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page1080 = await context1080.newPage();

    await page1080.addInitScript((mockState) => {
      try {
        localStorage.clear();
        localStorage.setItem('tcl_active_profile', 'real');
        localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mockState));
      } catch (e) {}
    }, createKimDanState());

    await page1080.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'networkidle', timeout: 15000 }).catch(async () => {
      await page1080.waitForTimeout(1000);
    });
    await page1080.waitForTimeout(1000);

    const cardsAudit = await page1080.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.stepper-card'));
      return cards.map((c) => ({
        title: c.querySelector('.stepper-title')?.innerText || '',
        isCurrent: c.classList.contains('current'),
        isCompleted: c.classList.contains('completed'),
        isLocked: c.classList.contains('locked'),
        isViewing: c.classList.contains('viewing'),
        has121Chip: Boolean(c.querySelector('.cuc-canh-chip')),
        badgeText: c.querySelector('.stepper-badge')?.innerText || '',
      }));
    });

    if (cardsAudit.length !== 5) {
      console.error(`  🚨 FAIL: Expected 5 cards, got ${cardsAudit.length}!`);
      hasErrors = true;
    } else {
      console.log('  ✅ PASS: Exactly 5 realm cards found.');
    }

    const noTrunc1080 = await verifyNoTruncation(page1080, 'Desktop 1920x1080');
    if (!noTrunc1080) hasErrors = true;

    const shot1080 = path.join(outDir, 'stepper-desktop-1920.png');
    await page1080.screenshot({ path: shot1080, fullPage: false });
    await compressImage(shot1080);
    console.log(`  📸 Screenshot saved: ${shot1080}`);
    await context1080.close();

    // 2. LAPTOP 1920x915 (Compact height)
    console.log('\n--- 2. Laptop 1920x915 (Compact height with scrollable left column) ---');
    const context915 = await browser.newContext({ viewport: { width: 1920, height: 915 } });
    const page915 = await context915.newPage();

    await page915.addInitScript((mockState) => {
      try {
        localStorage.clear();
        localStorage.setItem('tcl_active_profile', 'real');
        localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mockState));
      } catch (e) {}
    }, createKimDanState());

    await page915.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'networkidle', timeout: 15000 }).catch(async () => {
      await page915.waitForTimeout(1000);
    });
    await page915.waitForTimeout(1000);

    const scrollAudit915 = await page915.evaluate(() => {
      const colLeft = document.querySelector('.cultivation-col-left');
      const sanctumBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('TÀNG BẢO ĐIỆN'));
      const backupBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('XUẤT SAO LƯU'));
      return {
        hasColLeft: Boolean(colLeft),
        overflowY: colLeft ? window.getComputedStyle(colLeft).overflowY : '',
        scrollHeight: colLeft ? colLeft.scrollHeight : 0,
        clientHeight: colLeft ? colLeft.clientHeight : 0,
        hasSanctumBtn: Boolean(sanctumBtn),
        hasBackupBtn: Boolean(backupBtn),
      };
    });

    console.log('  Scroll Audit 1920x915:', scrollAudit915);
    if (!scrollAudit915.overflowY.includes('auto') && !scrollAudit915.overflowY.includes('scroll')) {
      console.error('  🚨 FAIL: Left column does not have overflow-y: auto!');
      hasErrors = true;
    } else {
      console.log('  ✅ PASS: Left column has independent overflow-y: auto.');
    }

    if (!scrollAudit915.hasSanctumBtn || !scrollAudit915.hasBackupBtn) {
      console.error('  🚨 FAIL: Action buttons missing in left column!');
      hasErrors = true;
    } else {
      console.log('  ✅ PASS: Action buttons (Tàng Bảo Điện, Xuất Sao Lưu) present and accessible.');
    }

    const noTrunc915 = await verifyNoTruncation(page915, 'Laptop 1920x915');
    if (!noTrunc915) hasErrors = true;

    const shot915 = path.join(outDir, 'stepper-laptop-1920-915.png');
    await page915.screenshot({ path: shot915, fullPage: false });
    await compressImage(shot915);
    console.log(`  📸 Screenshot saved: ${shot915}`);
    await context915.close();

    // 3. LAPTOP 1366x768
    console.log('\n--- 3. Laptop 1366x768 Stepper Audit ---');
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

    const noTrunc1366 = await verifyNoTruncation(page1366, 'Laptop 1366x768');
    if (!noTrunc1366) hasErrors = true;

    const shot1366 = path.join(outDir, 'stepper-desktop-1366.png');
    await page1366.screenshot({ path: shot1366, fullPage: false });
    await compressImage(shot1366);
    console.log(`  📸 Screenshot saved: ${shot1366}`);
    await context1366.close();

    // 4. MOBILE 390x844
    console.log('\n--- 4. Mobile 390x844 Cảnh Giới Tab ---');
    const context390 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const page390 = await context390.newPage();

    await page390.addInitScript((mockState) => {
      try {
        localStorage.clear();
        localStorage.setItem('tcl_active_profile', 'real');
        localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mockState));
      } catch (e) {}
    }, createKimDanState());

    await page390.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'networkidle', timeout: 15000 }).catch(async () => {
      await page390.waitForTimeout(1000);
    });
    await page390.waitForTimeout(1000);

    // Click CẢNH GIỚI mobile tab
    await page390.click('button:has-text("CẢNH GIỚI")');
    await page390.waitForTimeout(500);

    const noTrunc390 = await verifyNoTruncation(page390, 'Mobile 390x844');
    if (!noTrunc390) hasErrors = true;

    const shot390 = path.join(outDir, 'stepper-mobile-390.png');
    await page390.screenshot({ path: shot390, fullPage: false });
    await compressImage(shot390);
    console.log(`  📸 Screenshot saved: ${shot390}`);
    await context390.close();

    // 5. MOBILE 360x740 (Small Android)
    console.log('\n--- 5. Mobile 360x740 Cảnh Giới Tab ---');
    const context360 = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true });
    const page360 = await context360.newPage();

    await page360.addInitScript((mockState) => {
      try {
        localStorage.clear();
        localStorage.setItem('tcl_active_profile', 'real');
        localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mockState));
      } catch (e) {}
    }, createKimDanState());

    await page360.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'networkidle', timeout: 15000 }).catch(async () => {
      await page360.waitForTimeout(1000);
    });
    await page360.waitForTimeout(1000);

    // Click CẢNH GIỚI mobile tab
    await page360.click('button:has-text("CẢNH GIỚI")');
    await page360.waitForTimeout(500);

    const noTrunc360 = await verifyNoTruncation(page360, 'Mobile 360x740');
    if (!noTrunc360) hasErrors = true;

    const shot360 = path.join(outDir, 'stepper-mobile-360-740.png');
    await page360.screenshot({ path: shot360, fullPage: false });
    await compressImage(shot360);
    console.log(`  📸 Screenshot saved: ${shot360}`);
    await context360.close();

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
