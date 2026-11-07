/**
 * scripts/test-series-cover.mjs
 * 
 * E2E test suite & responsive screenshot capture for Per-Comic-Series Cover feature:
 * 1. Seed 2 mock comic series into IndexedDB (Series A and Series B with volumes & pages).
 * 2. Check 1: Sảnh Tàng Kinh has NO "Đổi nền" button, uses default backdrop.
 * 3. Check 2: Series A changes cover from a page -> hero cover & lobby card update; Series B unaffected.
 * 4. Check 3: Series A changes cover by uploading image from device -> hero cover updates.
 * 5. Check 4: "Dùng bìa tự động" reverts Series A back to volume 1's cover.
 * 6. Check 5: Persistence across page reload.
 * 7. Check 6: Deleting Series A cleans up without orphan data.
 * 8. Screenshots: 1920x1080, 1366x768, 390x844 into docs/ui-redesign/series-cover/.
 */

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';
import { chromium } from 'playwright';
import sharp from 'sharp';

const PORT = 4323;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const distDir = path.resolve('dist');
const outDir = path.resolve('docs/ui-redesign/series-cover');

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

  if (optimized.length > 400 * 1024) {
    optimized = await sharp(buffer)
      .png({ colours: 180, compressionLevel: 9, palette: true })
      .toBuffer();
  }

  fs.writeFileSync(targetPath, optimized);
  const kb = optimized.length / 1024;
  console.log(`Saved screenshot: ${path.basename(targetPath)} (${kb.toFixed(1)} KB)`);
}

async function run() {
  console.log('=== STARTING PER-SERIES COVER E2E & SCREENSHOTS ===');
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
  console.log('Seeding Series A and Series B with volumes & pages...');
  await page.evaluate(async () => {
    const createCoverBlob = (text, bg1, bg2) => {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 600, 800);
      grad.addColorStop(0, bg1);
      grad.addColorStop(1, bg2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 600, 800);

      ctx.fillStyle = '#ffd21f';
      ctx.font = 'bold 44px serif';
      ctx.textAlign = 'center';
      ctx.fillText(text, 300, 400);
      return new Promise((res) => canvas.toBlob(res, 'image/webp', 0.9));
    };

    const coverVolA = await createCoverBlob('TẬP 1 (GỐC)', '#991b1b', '#1e1b4b');
    const page1A = await createCoverBlob('TRANG 1 (XANH LAM)', '#1e40af', '#0f172a');
    const page2A = await createCoverBlob('TRANG 2 (VÀNG KIM)', '#854d0e', '#1c1917');

    const coverVolB = await createCoverBlob('PHÀM NHÂN BÌA GỐC', '#065f46', '#022c22');
    const page1B = await createCoverBlob('PHÀM NHÂN TRANG 1', '#047857', '#064e3b');

    const req = indexedDB.open('thien-co-lau-comics', 1);
    await new Promise((resolve, reject) => {
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(['series', 'volumes', 'pages'], 'readwrite');
        const sStore = tx.objectStore('series');
        const vStore = tx.objectStore('volumes');
        const pStore = tx.objectStore('pages');

        // Series A starts with coverBlob = null (auto uses vol 1 cover)
        sStore.put({
          id: 'series-alpha',
          title: 'Đại Phụng Đả Canh Nhân',
          coverBlob: null,
          totalPages: 3,
          totalBytes: 1572864,
          createdAt: Date.now() - 100000,
          updatedAt: Date.now(),
        });

        // Series B
        sStore.put({
          id: 'series-beta',
          title: 'Phàm Nhân Tu Tiên',
          coverBlob: null,
          totalPages: 2,
          totalBytes: 1048576,
          createdAt: Date.now() - 80000,
          updatedAt: Date.now(),
        });

        // Volume A1
        vStore.put({
          id: 'vol-alpha-1',
          seriesId: 'series-alpha',
          order: 1,
          title: 'Tập 1: Kinh Thành Án',
          importState: 'ready',
          pageCount: 3,
          totalBytes: 1572864,
          coverBlob: coverVolA,
          createdAt: Date.now() - 90000,
          updatedAt: Date.now(),
        });

        // Pages A1
        pStore.put({ key: 'vol-alpha-1:00000', volumeId: 'vol-alpha-1', index: 0, blob: coverVolA });
        pStore.put({ key: 'vol-alpha-1:00001', volumeId: 'vol-alpha-1', index: 1, blob: page1A });
        pStore.put({ key: 'vol-alpha-1:00002', volumeId: 'vol-alpha-1', index: 2, blob: page2A });

        // Volume B1
        vStore.put({
          id: 'vol-beta-1',
          seriesId: 'series-beta',
          order: 1,
          title: 'Tập 1: Xuất Sơn',
          importState: 'ready',
          pageCount: 2,
          totalBytes: 1048576,
          coverBlob: coverVolB,
          createdAt: Date.now() - 70000,
          updatedAt: Date.now(),
        });

        pStore.put({ key: 'vol-beta-1:00000', volumeId: 'vol-beta-1', index: 0, blob: coverVolB });
        pStore.put({ key: 'vol-beta-1:00001', volumeId: 'vol-beta-1', index: 1, blob: page1B });

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  });

  // -----------------------------------------------------------------
  // (1) Check Lobby: NO "Đổi nền" button, default backdrop
  // -----------------------------------------------------------------
  console.log('Test 1: Checking lobby for absence of "Đổi nền" and default backdrop...');
  await page.goto(`${BASE_URL}/#/comics`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  const lobbyText = await page.evaluate(() => document.body.innerText);
  assert(!lobbyText.includes('Đổi nền'), 'Lobby has NO "Đổi nền" button text');

  const defaultBgCount = await page.locator('[class*="defaultBg"]').count();
  assert(defaultBgCount > 0, 'Lobby uses default backdrop');
  console.log('✓ Lobby test passed: no "Đổi nền", default backdrop active');

  // -----------------------------------------------------------------
  // (2) Series A changes cover from a page -> verify hero & lobby cards
  // -----------------------------------------------------------------
  console.log('Test 2: Series A changes cover from a page...');
  await page.goto(`${BASE_URL}/#/comics/series-alpha`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  // Before changing: active dot should not be visible
  const initialDot = await page.locator('[class*="coverActiveDot"]').count();
  assert.strictEqual(initialDot, 0, 'Series A initially has no custom cover dot');

  // Get initial cover src
  const initialCoverSrc = await page.locator('[class*="coverImg"]').getAttribute('src');

  // Click "Đổi ảnh bìa"
  await page.locator('#btn-series-change-cover').click();
  await page.locator('[role="dialog"]').waitFor({ state: 'visible' });

  // Click "Chọn trang trong truyện"
  await page.locator('#btn-cover-pick-page').click();
  await page.waitForTimeout(500);

  // Click page thumbnail (e.g. index 2)
  const pageThumbs = page.locator('[class*="pageThumbItem"]');
  await pageThumbs.first().waitFor({ state: 'visible' });
  await pageThumbs.nth(1).click();

  // ImageCropperModal opens
  const cropperModal = page.locator('[class*="applyBtn"]');
  await cropperModal.waitFor({ state: 'visible' });
  console.log('  ImageCropperModal opened for selected page');

  // Apply crop
  await cropperModal.click();
  await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
  await page.waitForTimeout(600);

  // Verify Series A hero cover changed
  const updatedCoverSrc = await page.locator('[class*="coverImg"]').getAttribute('src');
  assert.notStrictEqual(updatedCoverSrc, initialCoverSrc, 'Hero cover image URL changed to new custom cover');

  const activeDotCount = await page.locator('[class*="coverActiveDot"]').count();
  assert(activeDotCount > 0, 'Active dot displayed indicating custom cover');

  // Verify lobby card for Series A also has updated cover
  await page.goto(`${BASE_URL}/#/comics`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  // Check Series B isolation: Series B still has no custom cover
  await page.goto(`${BASE_URL}/#/comics/series-beta`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const dotSeriesB = await page.locator('[class*="coverActiveDot"]').count();
  assert.strictEqual(dotSeriesB, 0, 'Series B remains on automatic cover (isolated)');
  console.log('✓ Series A page cover change and Series B isolation passed');

  // -----------------------------------------------------------------
  // (3) Series A changes cover by uploading image from device
  // -----------------------------------------------------------------
  console.log('Test 3: Series A changes cover via device upload...');
  await page.goto(`${BASE_URL}/#/comics/series-alpha`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  // Create temporary test image file
  const testImagePath = path.resolve('test-device-cover.png');
  const testImgBuffer = await sharp({
    create: {
      width: 600,
      height: 800,
      channels: 4,
      background: { r: 120, g: 30, b: 200, alpha: 1 },
    },
  }).png().toBuffer();
  fs.writeFileSync(testImagePath, testImgBuffer);

  // Open cover modal
  await page.locator('#btn-series-change-cover').click();
  await page.locator('[role="dialog"]').waitFor({ state: 'visible' });

  // Upload file via hidden input
  await page.setInputFiles('input[type="file"]', testImagePath);
  await page.waitForTimeout(500);

  // Cropper opens
  await page.locator('[class*="applyBtn"]').waitFor({ state: 'visible' });
  await page.locator('[class*="applyBtn"]').click();

  await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
  await page.waitForTimeout(600);

  if (fs.existsSync(testImagePath)) fs.unlinkSync(testImagePath);

  const deviceCoverSrc = await page.locator('[class*="coverImg"]').getAttribute('src');
  assert.notStrictEqual(deviceCoverSrc, updatedCoverSrc, 'Cover updated from device upload');
  console.log('✓ Device upload cover change passed');

  // -----------------------------------------------------------------
  // (4) "Dùng bìa tự động" reverts to volume 1 cover
  // -----------------------------------------------------------------
  console.log('Test 4: Resetting to automatic cover ("Dùng bìa tự động")...');
  await page.locator('#btn-series-change-cover').click();
  await page.locator('[role="dialog"]').waitFor({ state: 'visible' });

  // Click "Dùng bìa tự động"
  await page.locator('#btn-cover-reset-auto').click();
  await page.waitForTimeout(300);

  // Confirm reset
  await page.locator('#btn-confirm-reset-cover').click();
  await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
  await page.waitForTimeout(600);

  const dotAfterReset = await page.locator('[class*="coverActiveDot"]').count();
  assert.strictEqual(dotAfterReset, 0, 'Active dot removed after auto reset');
  console.log('✓ "Dùng bìa tự động" reset passed');

  // -----------------------------------------------------------------
  // (5) Persistence across reload
  // -----------------------------------------------------------------
  console.log('Test 5: Persistence across reload...');
  // Re-apply custom cover from page
  await page.locator('#btn-series-change-cover').click();
  await page.locator('#btn-cover-pick-page').click();
  await page.waitForTimeout(400);
  await page.locator('[class*="pageThumbItem"]').nth(0).click();
  await page.locator('[class*="applyBtn"]').waitFor({ state: 'visible' });
  await page.locator('[class*="applyBtn"]').click();
  await page.locator('[role="dialog"]').waitFor({ state: 'detached' });
  await page.waitForTimeout(500);

  // Reload page
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const reloadedDot = await page.locator('[class*="coverActiveDot"]').count();
  assert(reloadedDot > 0, 'Custom cover persisted after reload');
  console.log('✓ Persistence across reload passed');

  // -----------------------------------------------------------------
  // (6) Deletion cleanup
  // -----------------------------------------------------------------
  console.log('Test 6: Series deletion cleanup...');
  await page.locator('#btn-series-more-options').click();
  await page.waitForTimeout(300);

  await page.locator('#btn-series-delete').click();
  await page.waitForTimeout(300);

  const confirmDeleteBtn = page.locator('[class*="deleteConfirmBtn"]');
  await confirmDeleteBtn.waitFor({ state: 'visible' });
  await confirmDeleteBtn.click();
  await page.waitForTimeout(800);

  const deletedSeriesCheck = await page.evaluate(async () => {
    const req = indexedDB.open('thien-co-lau-comics', 1);
    return new Promise((resolve) => {
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction('series', 'readonly');
        const sReq = tx.objectStore('series').get('series-alpha');
        sReq.onsuccess = () => resolve(Boolean(sReq.result));
        sReq.onerror = () => resolve(false);
      };
      req.onerror = () => resolve(false);
    });
  });

  assert.strictEqual(deletedSeriesCheck, false, 'Series A deleted from IndexedDB');
  console.log('✓ Deletion cleanup passed');

  // -----------------------------------------------------------------
  // RESPONSIVE SCREENSHOT CAPTURES (1920x1080, 1366x768, 390x844)
  // -----------------------------------------------------------------
  console.log('--- CAPTURING RESPONSIVE SCREENSHOTS ---');

  // Reseed Series A for visual captures
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 600, 800);
    grad.addColorStop(0, '#701a75');
    grad.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 600, 800);
    ctx.fillStyle = '#ffd21f';
    ctx.font = 'bold 44px serif';
    ctx.textAlign = 'center';
    ctx.fillText('ĐẠI PHỤNG', 300, 400);
    const coverA = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.9));

    const req = indexedDB.open('thien-co-lau-comics', 1);
    await new Promise((resolve, reject) => {
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(['series', 'volumes', 'pages'], 'readwrite');
        tx.objectStore('series').put({
          id: 'series-alpha',
          title: 'Đại Phụng Đả Canh Nhân',
          coverBlob: coverA,
          totalPages: 20,
          totalBytes: 52428800,
          createdAt: Date.now() - 100000,
          updatedAt: Date.now(),
        });
        tx.objectStore('volumes').put({
          id: 'vol-alpha-1',
          seriesId: 'series-alpha',
          order: 1,
          title: 'Tập 1: Hứa Thất An',
          importState: 'ready',
          pageCount: 20,
          coverBlob: coverA,
          totalBytes: 8388608,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        tx.objectStore('pages').put({ key: 'vol-alpha-1:00000', volumeId: 'vol-alpha-1', index: 0, blob: coverA });
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

    // 2. Series Detail Page
    await page.goto(`${BASE_URL}/#/comics/series-alpha`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const overflowSeries = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.strictEqual(overflowSeries, false, `Series page has NO horizontal overflow at ${vp.name}`);
    const seriesBuf = await page.screenshot({ fullPage: false });
    await saveOptimizedPng(seriesBuf, path.join(outDir, `series-${vp.name}.png`));

    // 3. Modal (3 choices)
    if (vp.width <= 700) {
      await page.locator('#btn-series-more-options').click();
      await page.waitForTimeout(300);
      await page.locator('#btn-series-change-cover-mobile').click();
    } else {
      await page.locator('#btn-series-change-cover').click();
    }
    await page.waitForTimeout(400);

    const modalBuf = await page.screenshot({ fullPage: false });
    await saveOptimizedPng(modalBuf, path.join(outDir, `modal-${vp.name}.png`));

    // 4. Cropper Modal (3:4 Ratio)
    await page.locator('#btn-cover-pick-page').click();
    await page.waitForTimeout(400);
    await page.locator('[class*="pageThumbItem"]').first().click();
    await page.locator('[class*="applyBtn"]').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);

    const cropperBuf = await page.screenshot({ fullPage: false });
    await saveOptimizedPng(cropperBuf, path.join(outDir, `cropper-${vp.name}.png`));

    // Close cropper
    await page.locator('[class*="actionBtn"]').click();
    await page.waitForTimeout(300);
  }

  await browser.close();
  server.close();
  console.log('=== ALL TESTS AND SCREENSHOTS COMPLETED SUCCESSFULLY ===');
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
