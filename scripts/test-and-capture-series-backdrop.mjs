/**
 * scripts/test-and-capture-series-backdrop.mjs
 *
 * E2E tests & screenshot capture for per-comic series backdrop:
 * 1. Seed 2 comic series (Series A & Series B) with covers & volumes
 * 2. Verify lobby has no "Đổi nền" button and uses default backdrop
 * 3. Set custom backdrop on Series A (using cover); verify Series A uses custom backdrop and active dot is shown
 * 4. Verify Series B remains on default backdrop without active dot
 * 5. Verify "Về nền mặc định" resets Series A to default backdrop
 * 6. Set custom backdrop again and verify persistence across page reload
 * 7. Delete Series A and verify custom backdrop cache & localStorage key are cleaned up
 * 8. Capture screenshots at 1920x1080, 1366x768, 390x844 into docs/ui-redesign/series-backdrop/
 */

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';
import { chromium } from 'playwright';
import sharp from 'sharp';

const PORT = 4321;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const distDir = path.resolve('dist');
const outDir = path.resolve('docs/ui-redesign/series-backdrop');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
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
  '.wasm': 'application/wasm',
};

function createStaticServer() {
  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0].replace(/^\/+/, '');
    if (!reqPath) reqPath = 'index.html';
    let filePath = path.join(distDir, reqPath);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }

    const ext = path.extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`✓ Static server listening on ${BASE_URL}`);
      resolve(server);
    });
  });
}

async function saveOptimizedPng(buffer, targetPath) {
  let optimized = await sharp(buffer)
    .png({ quality: 85, compressionLevel: 9, palette: true })
    .toBuffer();

  if (optimized.length > 390 * 1024) {
    optimized = await sharp(buffer)
      .png({ colours: 160, compressionLevel: 9, palette: true })
      .toBuffer();
  }

  fs.writeFileSync(targetPath, optimized);
  const kb = optimized.length / 1024;
  console.log(`Saved screenshot: ${path.basename(targetPath)} (${kb.toFixed(1)} KB)`);
}

async function run() {
  console.log('=== STARTING PER-SERIES BACKDROP E2E & SCREENSHOTS ===');
  const server = await createStaticServer();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[BROWSER ERR]', msg.text());
  });

  // Navigate to lobby
  await page.goto(`${BASE_URL}/#/comics`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  // 1. Seed 2 mock series into IndexedDB
  console.log('Seeding Series A and Series B into IndexedDB...');
  await page.evaluate(async () => {
    const createCover = (title, color1, color2) => {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 840;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 600, 840);
      grad.addColorStop(0, color1);
      grad.addColorStop(1, color2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 600, 840);

      ctx.fillStyle = '#ffd21f';
      ctx.font = 'bold 44px serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, 300, 420);
      return new Promise((res) => canvas.toBlob(res, 'image/webp', 0.9));
    };

    const coverA = await createCover('ĐẠI PHỤNG', '#701a75', '#1e1b4b');
    const coverB = await createCover('PHÀM NHÂN', '#065f46', '#0f172a');

    const req = indexedDB.open('thien-co-lau-comics', 1);
    await new Promise((resolve, reject) => {
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(['series', 'volumes'], 'readwrite');
        const sStore = tx.objectStore('series');
        const vStore = tx.objectStore('volumes');

        sStore.put({
          id: 'series-alpha',
          title: 'Đại Phụng Đả Canh Nhân',
          coverBlob: coverA,
          totalPages: 120,
          totalBytes: 52428800,
          createdAt: Date.now() - 100000,
          updatedAt: Date.now(),
        });

        sStore.put({
          id: 'series-beta',
          title: 'Phàm Nhân Tu Tiên',
          coverBlob: coverB,
          totalPages: 85,
          totalBytes: 36700160,
          createdAt: Date.now() - 50000,
          updatedAt: Date.now(),
        });

        vStore.put({
          id: 'vol-alpha-1',
          seriesId: 'series-alpha',
          order: 1,
          volumeOrder: 1,
          title: 'Tập 1: Hứa Thất An',
          pageCount: 20,
          totalBytes: 8388608,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        vStore.put({
          id: 'vol-beta-1',
          seriesId: 'series-beta',
          order: 1,
          volumeOrder: 1,
          title: 'Tập 1: Xuất Thân Làng Chài',
          pageCount: 15,
          totalBytes: 6291456,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  });

  // Reload to pick up seeded data
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  // -----------------------------------------------------------------
  // (1) Check lobby: NO "Đổi nền" button, default backdrop active
  // -----------------------------------------------------------------
  console.log('Test 1: Checking lobby toolbar and default backdrop...');
  const changeBackdropBtnCount = await page.locator('[class*="changeBackdropBtn"]').count();
  assert.strictEqual(changeBackdropBtnCount, 0, 'Lobby has NO changeBackdropBtn');

  const lobbyTextMatches = await page.getByRole('button', { name: 'Đổi nền' }).count();
  assert.strictEqual(lobbyTextMatches, 0, 'Lobby has NO button with text "Đổi nền"');

  const lobbyDefaultBgCount = await page.locator('[class*="defaultBg"]').count();
  assert(lobbyDefaultBgCount > 0, 'Lobby backdrop uses defaultBg');
  console.log('✓ Lobby test passed: no "Đổi nền" button, always default backdrop');

  // -----------------------------------------------------------------
  // (2) Navigate to Series A: default backdrop first, then change backdrop
  // -----------------------------------------------------------------
  console.log('Test 2: Checking Series A default -> custom backdrop...');
  await page.goto(`${BASE_URL}/#/comics/series-alpha`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  // Check initial Series A is on default backdrop
  const initialSeriesADefault = await page.locator('[class*="defaultBg"]').count();
  assert(initialSeriesADefault > 0, 'Series A initially uses default backdrop');

  // Desktop "Đổi nền" button exists
  const changeBtn = page.locator('#btn-series-change-backdrop');
  await changeBtn.waitFor({ state: 'visible' });

  // Open modal
  await changeBtn.click();
  await page.waitForTimeout(400);

  // Verify modal title contains series title
  const modalTitle = await page.locator('[class*="headerTitle"]').innerText();
  assert(modalTitle.includes('Đại Phụng Đả Canh Nhân'), `Modal title contains series title: ${modalTitle}`);

  // Click shortcut "Dùng ảnh bìa bộ truyện"
  const useCoverBtn = page.locator('[class*="useCoverBtn"]');
  await useCoverBtn.waitFor({ state: 'visible' });
  await useCoverBtn.click();
  await page.waitForTimeout(400);

  // Now at step 3 (Preview & Sliders), click "Dùng làm nền"
  const saveBtn = page.locator('[class*="saveBackdropBtn"]');
  await saveBtn.waitFor({ state: 'visible' });
  await saveBtn.click();

  // Wait for modal to finish processing and close
  await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
  await page.waitForTimeout(500);

  // Verify Series A now has custom background layer (NOT defaultBg)
  const seriesACustomLayer = page.locator('[class*="imageLayer"]:not([class*="defaultBg"])');
  await seriesACustomLayer.waitFor({ state: 'visible' });
  const bgStyle = await seriesACustomLayer.getAttribute('style');
  assert(bgStyle && bgStyle.includes('url("blob:'), `Series A has custom blob background: ${bgStyle}`);

  // Verify active dot appears on "Đổi nền" button
  const activeDot = page.locator('[class*="backdropActiveDot"]');
  await activeDot.waitFor({ state: 'visible' });
  console.log('✓ Series A custom backdrop applied with active dot');

  // -----------------------------------------------------------------
  // Verify Series B is isolated (remains default backdrop)
  // -----------------------------------------------------------------
  console.log('Checking Series B isolation (should remain default backdrop)...');
  await page.goto(`${BASE_URL}/#/comics/series-beta`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  const seriesBDefaultBg = await page.locator('[class*="defaultBg"]').count();
  assert(seriesBDefaultBg > 0, 'Series B remains on default backdrop');
  const seriesBDotCount = await page.locator('[class*="backdropActiveDot"]').count();
  assert.strictEqual(seriesBDotCount, 0, 'Series B has NO active dot');
  console.log('✓ Series B isolation passed: unaffected by Series A');

  // -----------------------------------------------------------------
  // (3) Reset Series A to default backdrop
  // -----------------------------------------------------------------
  console.log('Test 3: Resetting Series A to default backdrop...');
  await page.goto(`${BASE_URL}/#/comics/series-alpha`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  // Open modal again
  await page.locator('#btn-series-change-backdrop').click();
  await page.waitForTimeout(400);

  // Click "Về nền mặc định"
  await page.locator('[class*="resetBtn"]').click();
  await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
  await page.waitForTimeout(500);

  // Verify Series A is back to defaultBg
  const seriesAResetDefault = await page.locator('[class*="defaultBg"]').count();
  assert(seriesAResetDefault > 0, 'Series A reset to default backdrop');
  const seriesAResetDot = await page.locator('[class*="backdropActiveDot"]').count();
  assert.strictEqual(seriesAResetDot, 0, 'Active dot removed after reset');
  console.log('✓ "Về nền mặc định" passed');

  // -----------------------------------------------------------------
  // (4) Re-apply custom backdrop and test persistence across page reload
  // -----------------------------------------------------------------
  console.log('Test 4: Testing persistence across page reload...');
  await page.locator('#btn-series-change-backdrop').click();
  await page.locator('[class*="useCoverBtn"]').waitFor({ state: 'visible' });
  await page.locator('[class*="useCoverBtn"]').click();
  await page.locator('[class*="saveBackdropBtn"]').waitFor({ state: 'visible' });
  await page.locator('[class*="saveBackdropBtn"]').click();

  // Wait for modal to finish processing and close
  await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
  await page.waitForTimeout(500);

  // Reload page
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const reloadedCustomLayer = page.locator('[class*="imageLayer"]:not([class*="defaultBg"])');
  await reloadedCustomLayer.waitFor({ state: 'visible' });
  const reloadedDot = page.locator('[class*="backdropActiveDot"]');
  await reloadedDot.waitFor({ state: 'visible' });
  console.log('✓ Persistence across reload passed');

  // -----------------------------------------------------------------
  // (5) Test Series Deletion cleanup: deletes backdrop settings & cache
  // -----------------------------------------------------------------
  console.log('Test 5: Testing deletion cleanup...');
  await page.locator('#btn-series-more-options').click();
  await page.waitForTimeout(300);

  await page.locator('#btn-series-delete').click();
  await page.waitForTimeout(300);

  const confirmBtn = page.locator('[class*="deleteConfirmBtn"]');
  await confirmBtn.waitFor({ state: 'visible' });
  await confirmBtn.click();
  await page.waitForTimeout(800);

  const cleanupCheck = await page.evaluate(async () => {
    const raw = localStorage.getItem('tcl_comic_series_backdrops');
    const parsed = raw ? JSON.parse(raw) : {};
    const hasAlphaSettings = Boolean(parsed['series-alpha']);

    let hasAlphaCache = false;
    if ('caches' in window) {
      const cache = await caches.open('tcl-custom-backdrop-cache');
      const res = await cache.match('https://tcl.local/series-backdrop/series-alpha-vertical.webp');
      hasAlphaCache = Boolean(res);
    }

    return { hasAlphaSettings, hasAlphaCache };
  });

  assert.strictEqual(cleanupCheck.hasAlphaSettings, false, 'Series A settings cleaned up from localStorage');
  assert.strictEqual(cleanupCheck.hasAlphaCache, false, 'Series A cache cleaned up from CacheStorage');
  console.log('✓ Deletion cleanup passed: settings and cache deleted');

  // -----------------------------------------------------------------
  // SCREENSHOT CAPTURES: 1920x1080, 1366x768, 390x844
  // -----------------------------------------------------------------
  console.log('--- CAPTURING RESPONSIVE SCREENSHOTS ---');

  // Reseed Series A and apply custom backdrop for screenshotting
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 840;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 600, 840);
    grad.addColorStop(0, '#701a75');
    grad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 600, 840);
    ctx.fillStyle = '#ffd21f';
    ctx.font = 'bold 44px serif';
    ctx.textAlign = 'center';
    ctx.fillText('ĐẠI PHỤNG', 300, 420);
    const coverA = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.9));

    const req = indexedDB.open('thien-co-lau-comics', 1);
    await new Promise((resolve, reject) => {
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(['series', 'volumes'], 'readwrite');
        tx.objectStore('series').put({
          id: 'series-alpha',
          title: 'Đại Phụng Đả Canh Nhân',
          coverBlob: coverA,
          totalPages: 120,
          totalBytes: 52428800,
          createdAt: Date.now() - 100000,
          updatedAt: Date.now(),
        });
        tx.objectStore('volumes').put({
          id: 'vol-alpha-1',
          seriesId: 'series-alpha',
          order: 1,
          volumeOrder: 1,
          title: 'Tập 1: Hứa Thất An',
          pageCount: 20,
          totalBytes: 8388608,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  });

  const viewports = [
    { name: '1920x1080', width: 1920, height: 1080 },
    { name: '1366x768', width: 1366, height: 768 },
    { name: '390x844', width: 390, height: 844 },
  ];

  for (const vp of viewports) {
    console.log(`Capturing for viewport: ${vp.name}...`);
    await page.setViewportSize({ width: vp.width, height: vp.height });

    // 1. Lobby screenshot
    await page.goto(`${BASE_URL}/#/comics`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const overflowLobby = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.strictEqual(overflowLobby, false, `Lobby has NO horizontal overflow at ${vp.name}`);

    const lobbyBuf = await page.screenshot({ fullPage: false });
    await saveOptimizedPng(lobbyBuf, path.join(outDir, `lobby-${vp.name}.png`));

    // 2. Series with default backdrop (Series B)
    await page.goto(`${BASE_URL}/#/comics/series-beta`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const overflowSeriesB = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.strictEqual(overflowSeriesB, false, `Series B has NO horizontal overflow at ${vp.name}`);

    const seriesDefBuf = await page.screenshot({ fullPage: false });
    await saveOptimizedPng(seriesDefBuf, path.join(outDir, `series-default-${vp.name}.png`));

    // 3. Modal open on Series A
    await page.goto(`${BASE_URL}/#/comics/series-alpha`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    if (vp.width <= 700) {
      await page.locator('#btn-series-more-options').click();
      await page.waitForTimeout(300);
      await page.locator('#btn-series-change-backdrop-mobile').click();
      await page.waitForTimeout(400);
    } else {
      await page.locator('#btn-series-change-backdrop').click();
      await page.waitForTimeout(400);
    }

    const modalBuf = await page.screenshot({ fullPage: false });
    await saveOptimizedPng(modalBuf, path.join(outDir, `modal-${vp.name}.png`));

    // 4. Series with custom backdrop: choose cover and save
    await page.locator('[class*="useCoverBtn"]').click();
    await page.locator('[class*="saveBackdropBtn"]').waitFor({ state: 'visible' });
    await page.locator('[class*="saveBackdropBtn"]').click();
    await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
    await page.waitForTimeout(500);

    const overflowSeriesA = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.strictEqual(overflowSeriesA, false, `Series A has NO horizontal overflow at ${vp.name}`);

    const seriesCustomBuf = await page.screenshot({ fullPage: false });
    await saveOptimizedPng(seriesCustomBuf, path.join(outDir, `series-custom-${vp.name}.png`));
  }

  await browser.close();
  server.close();
  console.log('=== ALL TESTS AND SCREENSHOTS COMPLETED SUCCESSFULLY ===');
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
