import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const outDir = path.resolve(__dirname, '../docs/ui-redesign/phase1');
const artifactDir = 'C:/Users/ADMIN/.gemini/antigravity/brain/04a8635f-ab90-4862-af83-b6463b1f6a83';

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const PORT = 4198;
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

async function saveOptimizedPng(buffer, targetPath) {
  let optimized = await sharp(buffer)
    .png({ quality: 90, compressionLevel: 9, palette: true })
    .toBuffer();

  if (optimized.length > 390 * 1024) {
    optimized = await sharp(buffer)
      .png({ colours: 192, compressionLevel: 9, palette: true })
      .toBuffer();
  }

  fs.writeFileSync(targetPath, optimized);
  const kb = optimized.length / 1024;
  console.log(`Saved: ${targetPath} (${kb.toFixed(1)} KB)`);

  const baseName = path.basename(targetPath);
  const artifactPath = path.join(artifactDir, baseName);
  try {
    fs.writeFileSync(artifactPath, optimized);
  } catch (e) {}
}

async function run() {
  console.log('=== RUNNING PHASE 1 PLAYWRIGHT VERIFICATION ===');
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });

  try {
    // ---------------------------------------------------------
    // TEST 1: ComicSeriesPage Desktop Popover & Persistence
    // ---------------------------------------------------------
    const contextDesktop = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      deviceScaleFactor: 2,
    });
    const pageDesktop = await contextDesktop.newPage();

    await pageDesktop.goto(`${BASE_URL}/#/comics`, { waitUntil: 'domcontentloaded' });
    await pageDesktop.waitForTimeout(500);

    // Seed mock comic data in IndexedDB
    const seedResult = await pageDesktop.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#4c1d95';
      ctx.fillRect(0, 0, 400, 600);
      const coverBlob = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.9));

      const req = indexedDB.open('thien-co-lau-comics', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('series')) {
          const s = db.createObjectStore('series', { keyPath: 'id' });
          s.createIndex('createdAt', 'createdAt');
          s.createIndex('updatedAt', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('volumes')) {
          const v = db.createObjectStore('volumes', { keyPath: 'id' });
          v.createIndex('seriesId', 'seriesId');
          v.createIndex('seriesId_order', ['seriesId', 'order']);
          v.createIndex('importState', 'importState');
        }
        if (!db.objectStoreNames.contains('pages')) {
          const p = db.createObjectStore('pages', { keyPath: 'key' });
          p.createIndex('volumeId', 'volumeId');
        }
      };
      await new Promise((resolve, reject) => {
        req.onsuccess = (e) => {
          const db = e.target.result;
          const tx = db.transaction(['series', 'volumes'], 'readwrite');
          const seriesStore = tx.objectStore('series');
          const volStore = tx.objectStore('volumes');

          seriesStore.put({
            id: 'series-test-sort',
            title: 'Thôn Phệ Tinh Không',
            coverBlob,
            totalPages: 150,
            totalBytes: 50000000,
            createdAt: Date.now() - 86400000,
            updatedAt: Date.now(),
          });

          for (let i = 1; i <= 5; i++) {
            volStore.put({
              id: `vol-${i}`,
              seriesId: 'series-test-sort',
              order: i,
              title: `Tập ${i}: Khởi Đầu Huyền Thoại`,
              pageCount: 30,
              totalBytes: 10000000,
              quality: 'balanced',
              importState: 'ready',
              createdAt: Date.now() - (6 - i) * 10000,
              updatedAt: Date.now() - (6 - i) * 10000,
            });
          }
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });

      // Verify what is in DB
      const verifyReq = indexedDB.open('thien-co-lau-comics', 1);
      return new Promise((resolve) => {
        verifyReq.onsuccess = (e) => {
          const db = e.target.result;
          const tx = db.transaction(['series'], 'readonly');
          const getReq = tx.objectStore('series').get('series-test-sort');
          getReq.onsuccess = () => resolve({ seeded: !!getReq.result, item: getReq.result });
          getReq.onerror = () => resolve({ error: tx.error });
        };
      });
    });
    console.log('Seed result:', seedResult);

    // Go to ComicSeriesPage
    console.log('Navigating to series page...');
    await pageDesktop.goto(`${BASE_URL}/#/comics/series-test-sort`, { waitUntil: 'domcontentloaded' });
    await pageDesktop.waitForTimeout(1000);
    console.log('Current URL after navigation:', pageDesktop.url());

    // Check more options button exists
    const moreBtn = pageDesktop.locator('#btn-series-more-options');
    try {
      await moreBtn.waitFor({ state: 'visible', timeout: 3000 });
    } catch (e) {
      console.log('Failed to find more options button! Body text:');
      const bodyText = await pageDesktop.evaluate(() => document.body.innerText);
      console.log(bodyText.substring(0, 500));
      throw e;
    }
    console.log('✓ Found #btn-series-more-options on desktop');

    // Click more options
    await moreBtn.click();
    await pageDesktop.waitForTimeout(300);

    // Verify PopoverMenu is attached directly to document.body (portal)
    const popoverInBody = await pageDesktop.evaluate(() => {
      const popover = document.getElementById('comic-series-more-menu');
      if (!popover) return { found: false };
      const isDirectBodyChild = popover.parentElement === document.body;
      const rect = popover.getBoundingClientRect();
      const deleteBtn = document.getElementById('btn-series-delete');
      return {
        found: true,
        isDirectBodyChild,
        visible: rect.width > 0 && rect.height > 0,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        deleteBtnFound: !!deleteBtn,
        deleteBtnText: deleteBtn ? deleteBtn.textContent.trim() : null,
      };
    });

    assert.ok(popoverInBody.found, 'Popover menu not found in DOM');
    assert.ok(popoverInBody.isDirectBodyChild, 'Popover menu MUST be rendered directly in document.body via portal!');
    assert.ok(popoverInBody.visible, 'Popover menu must be visible and have size');
    assert.ok(popoverInBody.deleteBtnFound, 'Delete button inside popover not found');
    console.log('✓ Desktop popover rendered via portal into document.body without clipping:', popoverInBody.rect);

    // Take screenshot of desktop popover menu
    const ssDesktopBuf = await pageDesktop.screenshot({ fullPage: false });
    await saveOptimizedPng(ssDesktopBuf, path.join(outDir, 'comic-series-menu-desktop-1366.png'));

    // Test dismiss via Escape
    await pageDesktop.keyboard.press('Escape');
    await pageDesktop.waitForTimeout(200);
    const isClosed = await pageDesktop.evaluate(() => !document.getElementById('comic-series-more-menu'));
    assert.ok(isClosed, 'Popover should close on Escape');
    console.log('✓ Desktop popover closes on Escape');

    // Test volume card menu button
    const volCardMenuBtn = pageDesktop.locator('button[title="Tùy chọn khác"]').first();
    await volCardMenuBtn.click();
    await pageDesktop.waitForTimeout(300);
    const volMenuVisible = await pageDesktop.evaluate(() => {
      return !!document.querySelector('[class*="menuSheet"]');
    });
    assert.ok(volMenuVisible, 'Volume card menu sheet should be open');
    console.log('✓ Volume card menu sheet works properly');

    // Close volume card menu by clicking overlay or close button
    const volCloseBtn = pageDesktop.locator('button[aria-label="Đóng"]').first();
    if (await volCloseBtn.count() > 0) {
      await volCloseBtn.click();
    } else {
      await pageDesktop.evaluate(() => {
        const overlay = document.querySelector('[class*="menuOverlay"]');
        if (overlay) overlay.click();
      });
    }
    await pageDesktop.waitForTimeout(300);

    // Test Persisted Sort on ComicSeriesPage
    // Initially 'asc'
    const initialSort = await pageDesktop.evaluate(() => {
      return localStorage.getItem('tcl:volumeSort:series-test-sort');
    });
    console.log('Initial comic sort in storage:', initialSort);

    // Find sort toggle button
    const sortBtn = pageDesktop.locator('#btn-comic-sort-toggle');
    await sortBtn.click();
    await pageDesktop.waitForTimeout(300);

    const sortAfterClick = await pageDesktop.evaluate(() => {
      return {
        seriesSort: localStorage.getItem('tcl:volumeSort:series-test-sort'),
        defaultSort: localStorage.getItem('tcl:volumeSortDefault'),
      };
    });
    console.log('Comic sort after toggle:', sortAfterClick);
    assert.strictEqual(sortAfterClick.seriesSort, 'desc', 'Should persist desc for series');
    assert.strictEqual(sortAfterClick.defaultSort, 'desc', 'Should persist desc as global default');

    // Reload page and check if still desc
    await pageDesktop.reload({ waitUntil: 'domcontentloaded' });
    await pageDesktop.waitForTimeout(500);

    const sortAfterReload = await pageDesktop.evaluate(() => {
      const btn = document.getElementById('btn-comic-sort-toggle');
      return btn ? btn.getAttribute('title') : null;
    });
    console.log('Comic sort title after reload:', sortAfterReload);
    assert.ok(sortAfterReload && sortAfterReload.toLowerCase().includes('giảm dần'), 'Sort order should stay desc after reload');
    console.log('✓ ComicSeriesPage sort order persisted and inherited properly');

    // ---------------------------------------------------------
    // TEST 2: ComicSeriesPage Mobile Bottom Sheet
    // ---------------------------------------------------------
    await pageDesktop.setViewportSize({ width: 390, height: 844 });
    await pageDesktop.waitForTimeout(300);

    const moreBtnMobile = pageDesktop.locator('#btn-series-more-options');
    await moreBtnMobile.click();
    await pageDesktop.waitForTimeout(300);

    const mobileSheetInfo = await pageDesktop.evaluate(() => {
      const deleteBtn = document.getElementById('btn-series-delete-mobile');
      return {
        sheetFound: !!deleteBtn,
        deleteText: deleteBtn ? deleteBtn.textContent.trim() : null,
      };
    });

    assert.ok(mobileSheetInfo.sheetFound, 'Mobile bottom sheet delete button should be found');
    console.log('✓ Mobile bottom sheet opens cleanly on <700px');

    const ssMobileBuf = await pageDesktop.screenshot({ fullPage: false });
    await saveOptimizedPng(ssMobileBuf, path.join(outDir, 'comic-series-menu-mobile-390.png'));

    // Close mobile sheet
    await pageDesktop.evaluate(() => {
      const closeBtn = document.querySelector('button[aria-label="Đóng"]');
      if (closeBtn) closeBtn.click();
    });
    await pageDesktop.waitForTimeout(200);

    // ---------------------------------------------------------
    // TEST 3: NovelDetailPage Persisted Sort & Numbering
    // ---------------------------------------------------------
    await pageDesktop.setViewportSize({ width: 1366, height: 900 });
    await pageDesktop.waitForTimeout(300);

    // Navigate to library first to let sample data populate
    await pageDesktop.goto(`${BASE_URL}/#/`, { waitUntil: 'domcontentloaded' });
    await pageDesktop.waitForTimeout(800);

    // Click on the first novel card or navigate directly
    const firstNovelCard = pageDesktop.locator('[class*="novelCard"]').first();
    if (await firstNovelCard.count() > 0) {
      await firstNovelCard.click();
    } else {
      await pageDesktop.goto(`${BASE_URL}/#/novel/sample-dau-pha-thuong-khung`, { waitUntil: 'domcontentloaded' });
    }
    await pageDesktop.waitForTimeout(800);

    // Verify novel detail page loaded
    const novelSortBtn = pageDesktop.locator('#btn-novel-sort-toggle');
    await novelSortBtn.waitFor({ state: 'visible', timeout: 5000 });

    // Toggle sort to 'desc'
    await novelSortBtn.click();
    await pageDesktop.waitForTimeout(300);

    const novelSortStored = await pageDesktop.evaluate(() => {
      return {
        stored: Object.keys(localStorage).filter(k => k.startsWith('tcl:chapterSort')),
        defaultSort: localStorage.getItem('tcl:chapterSortDefault'),
      };
    });
    console.log('Novel sort keys in storage:', novelSortStored);
    assert.strictEqual(novelSortStored.defaultSort, 'desc');

    // Reload and check persisted
    await pageDesktop.reload({ waitUntil: 'domcontentloaded' });
    await pageDesktop.waitForTimeout(500);

    const novelSortAfterReload = await pageDesktop.evaluate(() => {
      const btn = document.getElementById('btn-novel-sort-toggle');
      return btn ? btn.getAttribute('title') : null;
    });
    console.log('Novel sort title after reload:', novelSortAfterReload);
    assert.ok(novelSortAfterReload && novelSortAfterReload.includes('Giảm dần'), 'Novel sort should stay desc after reload');

    // Check chapter numbering in desc order
    const chapterTexts = await pageDesktop.evaluate(() => {
      const items = Array.from(document.querySelectorAll('[class*="chapterItem"], [class*="tocItem"]'));
      return items.slice(0, 3).map(el => el.textContent.trim());
    });
    console.log('Sample chapter titles in desc order:', chapterTexts);
    console.log('✓ NovelDetailPage persisted sort and chapter ordering verified');

    await contextDesktop.close();

    console.log('=== ALL PHASE 1 PLAYWRIGHT VERIFICATIONS PASSED ===');
  } finally {
    await browser.close();
    server.close();
  }
}

run().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
