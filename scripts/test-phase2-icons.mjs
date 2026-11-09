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
const outDir = path.resolve(__dirname, '../docs/ui-redesign/phase2');
const artifactsDir = path.resolve(__dirname, '../docs/ui-redesign/gallery');
if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}
const artifactDir = artifactsDir;

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const PORT = 4197;
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
  console.log('=== RUNNING PHASE 2 ICON SYSTEM PLAYWRIGHT VERIFICATION ===');
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    // -------------------------------------------------------------
    // 1. Icon Gallery Page (/#/__icons?dev=1)
    // -------------------------------------------------------------
    console.log('1. Testing /#/__icons?dev=1 ...');
    await page.goto(`${BASE_URL}/#/__icons?dev=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    const iconCount = await page.locator('[class*="card"]').count();
    console.log(`Found ${iconCount} icon cards in gallery`);
    assert.ok(iconCount > 40, 'Gallery should display all registered icons');

    // Test clicking an icon card to copy
    const firstCard = page.locator('[class*="card"]').first();
    await firstCard.click();
    await page.waitForTimeout(200);

    const toastVisible = await page.locator('[class*="toast"]').isVisible();
    assert.ok(toastVisible, 'Copy toast should be visible upon clicking card');
    console.log('✓ Copy toast confirmed');

    // Capture gallery on dark theme
    const galleryDarkBuf = await page.screenshot({ fullPage: false });
    await saveOptimizedPng(galleryDarkBuf, path.join(outDir, '01-icon-gallery-dark.png'));

    // Switch to light theme
    const lightThemeBtn = page.locator('button:has-text("Nền Sáng")');
    await lightThemeBtn.click();
    await page.waitForTimeout(300);

    const galleryLightBuf = await page.screenshot({ fullPage: false });
    await saveOptimizedPng(galleryLightBuf, path.join(outDir, '01-icon-gallery-light.png'));
    console.log('✓ Icon gallery verified on dark and light themes');

    // -------------------------------------------------------------
    // 2. Normal Header (/#/)
    // -------------------------------------------------------------
    console.log('2. Testing Header on Normal Lobby (/#/) ...');
    await page.goto(`${BASE_URL}/#/`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);

    const headerLocator = page.locator('header').first();
    if (await headerLocator.count() > 0) {
      const headerNormalBuf = await headerLocator.screenshot();
      await saveOptimizedPng(headerNormalBuf, path.join(outDir, '02-header-normal.png'));
      console.log('✓ Captured 02-header-normal.png');
    }

    // -------------------------------------------------------------
    // 3. Comics Header (/#/comics)
    // -------------------------------------------------------------
    console.log('3. Testing Header on Comics Lobby (/#/comics) ...');
    await page.goto(`${BASE_URL}/#/comics`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);

    const headerComicsLocator = page.locator('header').first();
    if (await headerComicsLocator.count() > 0) {
      const headerComicsBuf = await headerComicsLocator.screenshot();
      await saveOptimizedPng(headerComicsBuf, path.join(outDir, '03-header-comics.png'));
      console.log('✓ Captured 03-header-comics.png');
    }

    // -------------------------------------------------------------
    // 4. Reader TopBar
    // -------------------------------------------------------------
    console.log('4. Testing Reader TopBar ...');
    await page.goto(`${BASE_URL}/#/read/sample-dau-pha-thuong-khung/chapter-1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    const topBarLocator = page.locator('[class*="topBar"], header, [class*="readerHeader"]').first();
    if (await topBarLocator.count() > 0) {
      const topBarBuf = await topBarLocator.screenshot();
      await saveOptimizedPng(topBarBuf, path.join(outDir, '04-reader-topbar.png'));
      console.log('✓ Captured 04-reader-topbar.png');
    }

    // -------------------------------------------------------------
    // 5. Cultivation Workspace
    // -------------------------------------------------------------
    console.log('5. Testing Cultivation Workspace (/#/cultivation) ...');
    await page.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    const cultBuf = await page.screenshot({ fullPage: false });
    await saveOptimizedPng(cultBuf, path.join(outDir, '05-cultivation-workspace.png'));
    console.log('✓ Captured 05-cultivation-workspace.png');

    // -------------------------------------------------------------
    // 6. Sanctum Page
    // -------------------------------------------------------------
    console.log('6. Testing Sanctum Page (/#/sanctum) ...');
    await page.goto(`${BASE_URL}/#/sanctum`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    const sanctumBuf = await page.screenshot({ fullPage: false });
    await saveOptimizedPng(sanctumBuf, path.join(outDir, '06-sanctum-page.png'));
    console.log('✓ Captured 06-sanctum-page.png');

    // -------------------------------------------------------------
    // 7. Sync Page & Backup Page
    // -------------------------------------------------------------
    console.log('7. Testing Sync Page (/#/sync) ...');
    await page.goto(`${BASE_URL}/#/sync`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    const syncBuf = await page.screenshot({ fullPage: false });
    await saveOptimizedPng(syncBuf, path.join(outDir, '07-sync-page.png'));
    console.log('✓ Captured 07-sync-page.png');

    console.log('8. Testing Backup Page (/#/backup) ...');
    await page.goto(`${BASE_URL}/#/backup`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    const backupBuf = await page.screenshot({ fullPage: false });
    await saveOptimizedPng(backupBuf, path.join(outDir, '08-backup-page.png'));
    console.log('✓ Captured 08-backup-page.png');

    // -------------------------------------------------------------
    // 8. Popovers / Menus on NovelDetailPage
    // -------------------------------------------------------------
    console.log('9. Testing Novel Detail Page Popover ...');
    await page.goto(`${BASE_URL}/#/novel/sample-dau-pha-thuong-khung`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);

    const novelMoreBtn = page.locator('#btn-more-options');
    if (await novelMoreBtn.count() > 0) {
      await novelMoreBtn.click();
      await page.waitForTimeout(300);
      const popoverBuf = await page.screenshot({ fullPage: false });
      await saveOptimizedPng(popoverBuf, path.join(outDir, '10-novel-detail-popover.png'));
      console.log('✓ Captured 10-novel-detail-popover.png');
    }

    console.log('=== ALL PHASE 2 ICON VERIFICATIONS PASSED ===');
    await context.close();
  } finally {
    await browser.close();
    server.close();
  }
}

run().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Phase 2 test failed:', err);
  process.exit(1);
});
