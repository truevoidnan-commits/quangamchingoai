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

const PORT = 4210;
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

const VIEWPORTS = [
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'desktop-1366', width: 1366, height: 768 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-360', width: 360, height: 780 },
];

async function run() {
  console.log('===========================================================');
  console.log('🧪 VERIFYING ROADMAP NO-OVERFLOW FOR CẢ HAI TAB (THỂ + PHÁP)');
  console.log('===========================================================');

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  let hasErrors = false;

  try {
    for (const vp of VIEWPORTS) {
      console.log(`\n--- Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();

      // Seed cultivation state for Ngung Khi with 4500 EXP in both to test all cells including T10
      await page.addInitScript(() => {
        try {
          const mock = {
            realm: 'ngung_khi',
            theExp: 4500,
            phapExp: 4500,
            daoHanhYears: 10,
            battlePower: 50000,
            phapKhieuCount: 0,
            collectedLamps: [],
            daoAnhs: [],
            activeProfile: 'profile_default',
          };
          localStorage.setItem('thien_co_lau_cultivation_state', JSON.stringify(mock));
          localStorage.setItem('thien_co_lau_active_profile', 'profile_default');
        } catch (e) {}
      });

      await page.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'networkidle', timeout: 15000 }).catch(async () => {
        await page.waitForTimeout(1000);
      });
      await page.waitForTimeout(800);

      // On mobile or tablet, switch to right panel tab 'THAO TÁC'
      const mobileActionTab = page.locator('.mobile-tab-btn', { hasText: 'THAO TÁC' });
      if (await mobileActionTab.isVisible()) {
        await mobileActionTab.click();
        await page.waitForTimeout(400);
      }

      // Check Tab 1: THỂ (Hải Sơn Quyết)
      const tabTheBtn = page.locator('button', { hasText: 'Hải Sơn Quyết' });
      if (await tabTheBtn.isVisible()) {
        await tabTheBtn.click();
        await page.waitForTimeout(300);
      }

      const theOverflow = await page.evaluate(() => {
        const panel = document.querySelector('.cultivation-col-right');
        if (!panel) return { error: 'No panel found' };

        const panelRect = panel.getBoundingClientRect();
        const cells = Array.from(panel.querySelectorAll('div[class*="roadmapCell"]'));
        const cellsOver = cells.filter((c) => {
          const r = c.getBoundingClientRect();
          return r.right > panelRect.right + 2;
        });

        const panelScrollOver = panel.scrollWidth > panel.clientWidth + 2;

        return {
          panelScrollWidth: panel.scrollWidth,
          panelClientWidth: panel.clientWidth,
          panelScrollOver,
          totalCells: cells.length,
          cellsOverCount: cellsOver.length,
        };
      });

      console.log(`  [${vp.name}] Tab THỂ:`, theOverflow);
      if (theOverflow.panelScrollOver || theOverflow.cellsOverCount > 0) {
        hasErrors = true;
        console.error(`    🚨 OVERFLOW in Tab THỂ on ${vp.name}!`);
      } else {
        console.log(`    ✅ Tab THỂ passed (0 overflow)`);
      }

      const theScreenshot = path.join(outDir, `roadmap-the-${vp.name}.png`);
      await page.screenshot({ path: theScreenshot, fullPage: false });
      await compressImage(theScreenshot);

      // Check Tab 2: PHÁP (Hóa Hải Kinh)
      const tabPhapBtn = page.locator('button', { hasText: 'Hóa Hải Kinh' });
      if (await tabPhapBtn.isVisible()) {
        await tabPhapBtn.click();
        await page.waitForTimeout(300);
      }

      const phapOverflow = await page.evaluate(() => {
        const panel = document.querySelector('.cultivation-col-right');
        if (!panel) return { error: 'No panel found' };

        const panelRect = panel.getBoundingClientRect();
        const cells = Array.from(panel.querySelectorAll('div[class*="roadmapCell"]'));
        const cellsOver = cells.filter((c) => {
          const r = c.getBoundingClientRect();
          return r.right > panelRect.right + 2;
        });

        const panelScrollOver = panel.scrollWidth > panel.clientWidth + 2;

        return {
          panelScrollWidth: panel.scrollWidth,
          panelClientWidth: panel.clientWidth,
          panelScrollOver,
          totalCells: cells.length,
          cellsOverCount: cellsOver.length,
        };
      });

      console.log(`  [${vp.name}] Tab PHÁP:`, phapOverflow);
      if (phapOverflow.panelScrollOver || phapOverflow.cellsOverCount > 0) {
        hasErrors = true;
        console.error(`    🚨 OVERFLOW in Tab PHÁP on ${vp.name}!`);
      } else {
        console.log(`    ✅ Tab PHÁP passed (0 overflow)`);
      }

      const phapScreenshot = path.join(outDir, `roadmap-phap-${vp.name}.png`);
      await page.screenshot({ path: phapScreenshot, fullPage: false });
      await compressImage(phapScreenshot);

      await context.close();
    }
  } catch (err) {
    console.error('Test error:', err);
    hasErrors = true;
  } finally {
    await browser.close();
    server.close();
  }

  console.log('===========================================================');
  if (hasErrors) {
    console.error('❌ ROADMAP OVERFLOW AUDIT FAILED!');
    process.exit(1);
  } else {
    console.log('✅ ALL ROADMAP TESTS PASSED CLEANLY FOR CẢ HAI TAB!');
    process.exit(0);
  }
}

run();
