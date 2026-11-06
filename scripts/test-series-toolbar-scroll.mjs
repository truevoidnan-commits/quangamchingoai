import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');

const PORT = 4193;
const BASE_URL = `http://127.0.0.1:${PORT}`;

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

async function runTest() {
  console.log('Testing ComicSeriesPage sticky toolbar & horizontal overflow...');
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to comics
  await page.goto(`${BASE_URL}/#/comics`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // Seed series with volumes
  await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const req = indexedDB.open('thien-co-lau-comics');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

    const tx = db.transaction(['series', 'volumes'], 'readwrite');
    const seriesStore = tx.objectStore('series');
    const volStore = tx.objectStore('volumes');

    await new Promise((r) => {
      const req = seriesStore.put({
        id: 'test-series-1',
        title: 'Bộ Truyện Tranh Thử Nghiệm Giao Diện Cực Dài Nhằm Kiểm Tra Không Tràn Ngang',
        author: 'Thiên Cơ Lâu',
        description: 'Mô tả bộ truyện thử nghiệm toolbar kính mờ',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        lastReadAt: Date.now(),
      });
      req.onsuccess = r;
    });

    for (let i = 1; i <= 20; i++) {
      volStore.put({
        id: `vol-${i}`,
        seriesId: 'test-series-1',
        volumeOrder: i,
        title: i % 3 === 0 ? `Tập ${i}: Tiêu Đề Dài Hơn Bình Thường Để Kiểm Tra Ellipsis Và Co Giãn Responsive Không Tràn` : `Tập ${i}`,
        pageCount: 30,
        totalPages: 30,
        totalBytes: 15 * 1024 * 1024,
        createdAt: Date.now() - (20 - i) * 60000,
        updatedAt: Date.now() - (20 - i) * 60000,
      });
    }

    await new Promise((r) => {
      tx.oncomplete = r;
    });
  });

  const widths = [390, 768, 1366, 1920];
  let allPassed = true;

  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(`${BASE_URL}/#/comics/test-series-1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);

    // Disable smooth scroll
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto';
    });

    // Check horizontal scroll at top
    let overflow = await page.evaluate(() => {
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        hasOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });

    if (overflow.hasOverflow) {
      console.error(`FAIL: Horizontal overflow at width ${w}px (top): scrollWidth=${overflow.scrollWidth}, innerWidth=${overflow.innerWidth}`);
      allPassed = false;
    } else {
      console.log(`PASS: No overflow at ${w}px (top)`);
    }

    // Scroll down to make toolbar sticky
    await page.evaluate(() => {
      window.scrollTo(0, 450);
    });
    await page.waitForTimeout(400);

    // Check horizontal scroll when sticky
    overflow = await page.evaluate(() => {
      return {
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        hasOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });

    if (overflow.hasOverflow) {
      console.error(`FAIL: Horizontal overflow at width ${w}px (sticky): scrollWidth=${overflow.scrollWidth}, innerWidth=${overflow.innerWidth}`);
      allPassed = false;
    } else {
      console.log(`PASS: No overflow at ${w}px (sticky)`);
    }
  }

  await browser.close();
  server.close();

  if (!allPassed) {
    console.error('Toolbar scroll test failed!');
    process.exit(1);
  }
  console.log('All width tests passed (390, 768, 1366, 1920: zero horizontal scroll)!');
  process.exit(0);
}

runTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
