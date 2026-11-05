import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';

const PORT = 4299;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const distDir = path.resolve('dist');
const OUT_DIR = path.resolve('docs/ui-redesign');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
};

function createStaticServer() {
  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/' || !reqPath) reqPath = '/index.html';
    let filePath = path.join(distDir, reqPath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }

    const ext = path.extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
  return server;
}

async function optimizePng(filePath) {
  const statBefore = fs.statSync(filePath);
  const buffer = await sharp(filePath)
    .png({ quality: 85, compressionLevel: 9, effort: 7 })
    .toBuffer();

  let finalBuffer = buffer;
  if (finalBuffer.length > 380 * 1024) {
    finalBuffer = await sharp(filePath)
      .png({ quality: 75, colours: 256, compressionLevel: 9 })
      .toBuffer();
  }

  fs.writeFileSync(filePath, finalBuffer);
  const statAfter = fs.statSync(filePath);
  console.log(`  📸 ${path.basename(filePath)}: ${(statBefore.size / 1024).toFixed(1)} KB -> ${(statAfter.size / 1024).toFixed(1)} KB (< 400KB limit)`);
}

async function main() {
  console.log('🚀 Starting Screenshot Capture for UI Redesign...');
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });

  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.warn('[Page Error]', msg.text());
  });

  // --- 1. Sảnh Truyện Chữ (Library Lobby) ---
  console.log('1. Capturing Sảnh Truyện Chữ (01-library-lobby.png)...');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=THIÊN CƠ LÂU');
  await page.waitForTimeout(600);

  const shot1 = path.join(OUT_DIR, '01-library-lobby.png');
  await page.screenshot({ path: shot1 });
  await optimizePng(shot1);

  // --- 2. Menu Thao Tác Mở (Novel Action BottomSheet) ---
  console.log('2. Capturing Novel Action BottomSheet (02-novel-menu-bottomsheet.png)...');
  const firstCard = page.locator('[class*="card"]').first();
  await firstCard.waitFor({ state: 'visible' });

  const box = await firstCard.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
  }

  await page.waitForSelector('text=Sửa truyện', { timeout: 5000 });
  await page.waitForTimeout(500);

  const shot2 = path.join(OUT_DIR, '02-novel-menu-bottomsheet.png');
  await page.screenshot({ path: shot2 });
  await optimizePng(shot2);

  // Close sheet
  const closeBtn = page.locator('button[aria-label="Đóng"]').first();
  if (await closeBtn.isVisible()) {
    await closeBtn.click();
    await page.waitForTimeout(300);
  }

  // --- 3. Sảnh Truyện Tranh có 6 bộ (03-comics-lobby-6-series.png) ---
  console.log('3. Seeding 6 comic series and capturing Sảnh Truyện Tranh (03-comics-lobby-6-series.png)...');
  await page.goto(`${BASE_URL}/#/comics`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=TÀNG KINH HỌA CÁC');

  await page.evaluate(() => {
    return new Promise((resolve, reject) => {
      const DB_NAME = 'thien-co-lau-comics';
      const DB_VERSION = 1;
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onsuccess = (e) => {
        try {
          const db = e.target.result;
          const tx = db.transaction(['series', 'volumes'], 'readwrite');
          const seriesStore = tx.objectStore('series');
          const volStore = tx.objectStore('volumes');

          seriesStore.clear();
          volStore.clear();

          const sampleSeries = [
            { id: 's1', title: 'Đấu Phá Thương Khung', volumeCount: 42, totalPages: 1260, totalBytes: 850 * 1024 * 1024, createdAt: Date.now() - 1000, updatedAt: Date.now() - 1000 },
            { id: 's2', title: 'Vũ Động Càn Khôn', volumeCount: 28, totalPages: 840, totalBytes: 520 * 1024 * 1024, createdAt: Date.now() - 2000, updatedAt: Date.now() - 2000 },
            { id: 's3', title: 'Thôn Phệ Tinh Không', volumeCount: 35, totalPages: 1050, totalBytes: 710 * 1024 * 1024, createdAt: Date.now() - 3000, updatedAt: Date.now() - 3000 },
            { id: 's4', title: 'Già Thiên', volumeCount: 19, totalPages: 570, totalBytes: 390 * 1024 * 1024, createdAt: Date.now() - 4000, updatedAt: Date.now() - 4000 },
            { id: 's5', title: 'Hoàn Mỹ Thế Giới', volumeCount: 50, totalPages: 1500, totalBytes: 980 * 1024 * 1024, createdAt: Date.now() - 5000, updatedAt: Date.now() - 5000 },
            { id: 's6', title: 'Nhất Niệm Vĩnh Hằng', volumeCount: 15, totalPages: 450, totalBytes: 310 * 1024 * 1024, createdAt: Date.now() - 6000, updatedAt: Date.now() - 6000 },
          ];

          for (const s of sampleSeries) {
            seriesStore.put(s);
            volStore.put({
              id: 'v_' + s.id + '_1',
              seriesId: s.id,
              order: 1,
              title: 'Tập 1',
              importState: 'ready',
              pageCount: 30,
              totalBytes: 20 * 1024 * 1024,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
          }

          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        } catch (err) {
          reject(err);
        }
      };
      req.onerror = () => reject(req.error);
    });
  });

  // Reload to reflect seeded data
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=TÀNG KINH HỌA CÁC');
  await page.waitForSelector('text=Đấu Phá Thương Khung');
  await page.waitForTimeout(800);

  const shot3 = path.join(OUT_DIR, '03-comics-lobby-6-series.png');
  await page.screenshot({ path: shot3 });
  await optimizePng(shot3);

  // --- 4. Sảnh Truyện Tranh Trống (04-comics-lobby-empty.png) ---
  console.log('4. Clearing comic series and capturing Empty State (04-comics-lobby-empty.png)...');
  await page.evaluate(() => {
    return new Promise((resolve, reject) => {
      const DB_NAME = 'thien-co-lau-comics';
      const DB_VERSION = 1;
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onsuccess = (e) => {
        try {
          const db = e.target.result;
          const tx = db.transaction(['series', 'volumes'], 'readwrite');
          tx.objectStore('series').clear();
          tx.objectStore('volumes').clear();
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        } catch (err) {
          reject(err);
        }
      };
      req.onerror = () => reject(req.error);
    });
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Chưa có bộ truyện nào');
  await page.waitForTimeout(600);

  const shot4 = path.join(OUT_DIR, '04-comics-lobby-empty.png');
  await page.screenshot({ path: shot4 });
  await optimizePng(shot4);

  await browser.close();
  server.close();

  console.log('🎉 All 4 screenshots captured and optimized successfully in docs/ui-redesign/!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error capturing screenshots:', err);
  process.exit(1);
});
