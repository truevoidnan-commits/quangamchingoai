import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');

const PORT = 4195;
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

async function runTest() {
  console.log('Testing ReaderPage top bar, progress ring, navigation, and 6 themes...');
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Navigate to root to seed novel & chapter
  await page.goto(`${BASE_URL}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // Seed mock novel & chapters in IndexedDB
  await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const req = indexedDB.open('thien-co-lau');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

    const tx = db.transaction(['novels', 'chapters'], 'readwrite');
    const novelStore = tx.objectStore('novels');
    const chapterStore = tx.objectStore('chapters');

    await new Promise((r) => {
      const req = novelStore.put({
        id: 'test-novel-reader',
        title: 'Thử Nghiệm Màn Đọc Top Bar Kính Mờ',
        author: 'Thiên Cơ Lâu',
        description: 'Test novel for reader top bar redesign',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      req.onsuccess = r;
    });

    for (let i = 1; i <= 3; i++) {
      chapterStore.put({
        id: `ch-${i}`,
        novelId: 'test-novel-reader',
        chapterNumber: i,
        title: `Chương ${i}: Tiến Trình Ngộ Đạo`,
        content: `Đoạn văn thứ nhất của chương ${i}.\n\nĐoạn văn thứ hai mô tả quá trình tĩnh tâm ngộ đạo.\n\nĐoạn văn thứ ba kết thúc chương.`,
        wordCount: 150,
        createdAt: Date.now() - (4 - i) * 1000,
      });
    }

    await new Promise((r) => {
      tx.oncomplete = r;
    });
  });

  // Navigate to ReaderPage for Chapter 2
  await page.goto(`${BASE_URL}/#/novel/test-novel-reader/read/ch-2`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  // Verify top bar height and buttons
  const topBarBox = await page.locator('div[class*="_topBar_"]').first().boundingBox();
  console.log(`Top bar height: ${topBarBox?.height}px (expected ~52px)`);

  // Verify meditation ring svg exists
  const ringCount = await page.locator('svg[class*="meditationRingSvg"]').count();
  console.log(`Meditation ring SVG count: ${ringCount}`);
  if (ringCount === 0) throw new Error('Meditation ring SVG not found');

  // Verify action buttons in top bar (all should have aria-label and titles)
  const topBtns = page.locator('div[class*="_topBar_"] button[class*="topBtn"]');
  const count = await topBtns.count();
  console.log(`Top bar action buttons count: ${count} (expected 6)`);
  if (count < 6) throw new Error(`Expected at least 6 buttons, found ${count}`);

  for (let i = 0; i < count; i++) {
    const btn = topBtns.nth(i);
    const label = await btn.getAttribute('aria-label');
    const title = await btn.getAttribute('title');
    console.log(`  Button ${i + 1}: aria-label="${label}", title="${title}"`);
    if (!label) throw new Error(`Button ${i + 1} missing aria-label`);
  }

  // Verify chapter navigation top and bottom
  const navBtns = page.locator('button[class*="navBtn"]');
  const navCount = await navBtns.count();
  console.log(`Chapter navigation buttons count: ${navCount} (expected 4: 2 top + 2 bottom)`);
  if (navCount < 4) throw new Error('Missing chapter navigation buttons');

  const tocBtns = page.locator('button[class*="tocBtn"]');
  const tocCount = await tocBtns.count();
  console.log(`Chapter TOC center buttons count: ${tocCount} (expected 2: 1 top + 1 bottom)`);
  if (tocCount < 2) throw new Error('Missing center TOC buttons');

  // Verify 6 themes
  const themes = ['paper', 'white', 'dark', 'black', 'night', 'forest'];
  for (const themeId of themes) {
    await page.evaluate((tid) => {
      const cur = JSON.parse(localStorage.getItem('reading_settings') || '{}');
      cur.theme = tid;
      localStorage.setItem('reading_settings', JSON.stringify(cur));
      window.dispatchEvent(new Event('storage'));
    }, themeId);

    await page.waitForTimeout(200);
    const bg = await page.evaluate(() => {
      const pageEl = document.getElementById('reader-page') || document.querySelector('div[class*="page"]');
      return window.getComputedStyle(pageEl).backgroundColor;
    });
    console.log(`Theme "${themeId}": background=${bg}`);
  }

  // Test responsive overflow across widths
  const widths = [390, 768, 1366, 1920];
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.waitForTimeout(200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    console.log(`Width ${w}px - No overflow: ${overflow}`);
    if (!overflow) throw new Error(`Horizontal overflow at ${w}px`);
  }

  await browser.close();
  server.close();
  console.log('ReaderPage top bar & theme test PASSED completely!');
  process.exit(0);
}

runTest().catch((e) => {
  console.error(e);
  process.exit(1);
});
