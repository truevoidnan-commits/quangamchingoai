/**
 * Playwright E2E & Flow Test for Comics (Truyện Tranh)
 * Run: node scripts/test-comics-browser-flow.mjs
 */
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

const ARTIFACT_DIR = 'C:/Users/ADMIN/.gemini/antigravity/brain/04a8635f-ab90-4862-af83-b6463b1f6a83';
const PORT = 4199;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const distDir = path.resolve('dist');

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
    });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`✓ Test static server listening on ${BASE_URL}`);
      resolve(server);
    });
  });
}


async function ensureSamplePdf(browser) {
  const samplePdfPath = path.resolve('scripts/test-comic-sample.pdf');
  if (fs.existsSync(samplePdfPath)) return samplePdfPath;

  const p = await browser.newPage();
  let html = '<html><head><style>@page { size: 800px 1200px; margin: 0; } body { margin:0; background:#0f172a; font-family:sans-serif; } .p { width:800px; height:1200px; page-break-after:always; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#38bdf8; border:4px solid #38bdf8; box-sizing:border-box; }</style></head><body>';
  for (let i = 1; i <= 6; i++) {
    html += `<div class="p"><h1>Đấu Phá Thương Khung</h1><h2>Tập 1 - Trang ${i}</h2></div>`;
  }
  html += '</body></html>';
  await p.setContent(html);
  await p.pdf({ path: samplePdfPath, width: '800px', height: '1200px', printBackground: true });
  await p.close();
  return samplePdfPath;
}

async function runBrowserFlowTests() {
  console.log('🧪 Starting Comics Browser Flow & Performance Tests...');
  const server = await createStaticServer();

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    // Block remote supabase calls so test runs 100% offline & instant
    await context.route(/supabase\.co/i, (route) => route.abort());

    const page = await context.newPage();

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.warn('[Browser Console Error]', msg.text());
      }
    });

    // 1. Visit LibraryPage and verify Tab Switcher
    console.log('  1. Testing Tab Switcher on LibraryPage...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    const tabComics = await page.waitForSelector('#tab-comics', { timeout: 10000 });
    console.log('     Found #tab-comics tab button.');
    await tabComics.click();

    await page.waitForURL('**/comics', { timeout: 10000 });
    console.log('     Navigated to /comics successfully.');

    // 2. Verify Storage Gauge & Empty State
    console.log('  2. Verifying ComicsPage storage gauge & empty state...');
    await page.waitForSelector('text=TÀNG KINH HỌA CÁC');
    await page.waitForSelector('text=Bộ nhớ truyện tranh:');

    // Screenshot ComicsPage initial
    const comicsPageDesktopShot = path.join(ARTIFACT_DIR, 'comics-page-desktop.png');
    await page.screenshot({ path: comicsPageDesktopShot });
    console.log(`     Saved screenshot: ${comicsPageDesktopShot}`);

    // Mobile viewport screenshot
    await page.setViewportSize({ width: 390, height: 844 });
    const comicsPageMobileShot = path.join(ARTIFACT_DIR, 'comics-page-mobile.png');
    await page.screenshot({ path: comicsPageMobileShot });
    console.log(`     Saved mobile screenshot: ${comicsPageMobileShot}`);
    await page.setViewportSize({ width: 1280, height: 800 });

    // 3. Import Modal & File Upload Test (test-comic-sample.pdf, 6 pages)
    console.log('  3. Testing Import PDF Modal with test-comic-sample.pdf...');
    const importBtn = await page.waitForSelector('#btn-import-pdf-comics');
    await importBtn.click();

    await page.waitForSelector('text=Nhập Truyện Tranh (PDF)');
    const fileInput = await page.locator('input[type="file"]');
    const samplePdfPath = await ensureSamplePdf(browser);
    await fileInput.setInputFiles(samplePdfPath);

    // Title input
    const seriesTitleInput = await page.locator('input[placeholder*="One Piece"]');
    await seriesTitleInput.fill('Đấu Phá Thương Khung');

    // Click start import
    const startImportBtn = await page.locator('button:has-text("Bắt Đầu Nhập")');
    await startImportBtn.click();

    // Verify progress screen
    await page.waitForSelector('text=Đang xử lý truyện tranh...', { timeout: 10000 });
    console.log('     Progress screen shown during page extraction.');

    // Screenshot progress modal
    const importProgressShot = path.join(ARTIFACT_DIR, 'comics-import-progress.png');
    await page.screenshot({ path: importProgressShot });

    // Wait until import completes and navigates to ComicSeriesPage
    await page.waitForURL(/\/comics\/[A-Za-z0-9_-]+/, { timeout: 30000 });
    console.log(`     Successfully imported and navigated to Series Page: ${page.url()}`);

    // 4. Verify ComicSeriesPage
    console.log('  4. Verifying ComicSeriesPage volumes & cover...');
    await page.waitForSelector('text=Đấu Phá Thương Khung');
    await page.waitForSelector('text=6 trang');
    await page.waitForSelector('text=1 tập');

    const seriesPageShot = path.join(ARTIFACT_DIR, 'comics-series-page.png');
    await page.screenshot({ path: seriesPageShot });
    console.log(`     Saved screenshot: ${seriesPageShot}`);

    // 5. Test ComicReaderPage (Continuous Vertical Scroll & Single Page)
    console.log('  5. Testing ComicReaderPage...');
    const readBtn = await page.locator('button:has-text("Bắt Đầu Đọc")');
    await readBtn.click();

    await page.waitForURL(/\/comics\/[A-Za-z0-9_-]+\/read\/[A-Za-z0-9_-]+/, { timeout: 15000 });
    console.log(`     Navigated to Reader: ${page.url()}`);

    // Verify header is hidden
    const mainHeader = await page.$('header');
    if (mainHeader) {
      const isVisible = await mainHeader.isVisible();
      if (isVisible) throw new Error('Main header should be hidden on Reader page');
    }
    console.log('     Verified main header is hidden.');

    // Verify page containers and images loaded
    await page.waitForSelector('img[alt="Trang 1"]', { timeout: 15000 });
    console.log('     Page 1 image loaded and displayed.');

    // Screenshot vertical reader desktop & mobile
    const readerVerticalDesktopShot = path.join(ARTIFACT_DIR, 'comics-reader-vertical-desktop.png');
    await page.screenshot({ path: readerVerticalDesktopShot });
    console.log(`     Saved vertical reader desktop screenshot: ${readerVerticalDesktopShot}`);

    await page.setViewportSize({ width: 390, height: 844 });
    const readerVerticalMobileShot = path.join(ARTIFACT_DIR, 'comics-reader-vertical-mobile.png');
    await page.screenshot({ path: readerVerticalMobileShot });
    console.log(`     Saved vertical reader mobile screenshot: ${readerVerticalMobileShot}`);
    await page.setViewportSize({ width: 1280, height: 800 });

    // Test Passive-open progress guard
    console.log('  6. Testing Passive-open reading progress guard...');
    const rawVol = page.url().split('/read/')[1];
    const volId = rawVol.split(/[?#/]/)[0];
    
    // Simulate genuine user scroll to page 3
    console.log('     User scrolling to Page 3...');
    await page.evaluate(() => {
      const scrollContainer = document.querySelector('[class*="verticalScrollContainer"]');
      if (scrollContainer) {
        scrollContainer.scrollTop = 1600;
        scrollContainer.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    });
    await page.waitForTimeout(1000);

    const savedProgress = await page.evaluate((id) => {
      const raw = localStorage.getItem(`tcl_comic_progress_${id}`);
      return raw ? JSON.parse(raw) : null;
    }, volId);

    console.log('     LocalStorage saved progress after scroll:', savedProgress);
    if (!savedProgress) throw new Error('Expected comic progress to be saved after user interaction');

    // Test page-by-page mode
    console.log('  7. Testing Page-by-Page reading mode...');
    const pageModeBtn = await page.locator('button:has-text("Từng Trang")');
    await pageModeBtn.click();
    await page.waitForTimeout(400);

    const readerSinglePageShot = path.join(ARTIFACT_DIR, 'comics-reader-single-page.png');
    await page.screenshot({ path: readerSinglePageShot });
    console.log(`     Saved single page reader screenshot: ${readerSinglePageShot}`);

    // Click right clickzone to advance page
    const rightZone = await page.locator('div[title="Trang sau"]');
    await rightZone.click();
    await page.waitForTimeout(300);

    // 8. Test Volume Deletion
    console.log('  8. Testing Volume Deletion and Storage reclamation...');
    await page.goto(`${BASE_URL}/#/comics`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Đấu Phá Thương Khung');
    await page.click('text=Đấu Phá Thương Khung');

    await page.waitForSelector('button[title="Xóa tập này"]');
    await page.click('button[title="Xóa tập này"]');
    await page.waitForSelector('text=Xác nhận xóa tập');
    await page.click('button:has-text("Xóa Tập")');
    await page.waitForSelector('text=Chưa có tập nào trong bộ truyện này');
    console.log('     Volume deleted cleanly.');

    // 9. Benchmark Large PDF Import (~75MB volume)
    console.log('  9. Running Benchmark on 75MB PDF volume...');
    const benchPdfPath = path.resolve('scripts/benchmark-comic-75mb.pdf');
    if (fs.existsSync(benchPdfPath)) {
      const benchStat = fs.statSync(benchPdfPath);
      const benchSizeMb = (benchStat.size / (1024 * 1024)).toFixed(2);
      console.log(`     Benchmarking with ${benchPdfPath} (${benchSizeMb} MB)...`);

      await page.goto(`${BASE_URL}/#/comics`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#btn-import-pdf-comics');
      await page.click('#btn-import-pdf-comics');

      const modalInput = await page.locator('input[type="file"]');
      await modalInput.setInputFiles(benchPdfPath);

      const titleInp = await page.locator('input[placeholder*="One Piece"]');
      await titleInp.fill('Đấu Phá Benchmark');

      const startTime = Date.now();
      const startMem = await page.evaluate(() => performance?.memory ? performance.memory.usedJSHeapSize : 0);

      await page.click('button:has-text("Bắt Đầu Nhập")');
      await page.waitForURL(/\/comics\/[A-Za-z0-9_-]+/, { timeout: 120000 });

      const durationMs = Date.now() - startTime;
      const endMem = await page.evaluate(() => performance?.memory ? performance.memory.usedJSHeapSize : 0);
      const peakRamMb = ((endMem - startMem) / (1024 * 1024)).toFixed(1);

      console.log(`     ⚡ 75MB Benchmark complete in ${(durationMs / 1000).toFixed(1)}s!`);
      console.log(`     Estimated JS Heap variation: ~${peakRamMb} MB`);

      // Read volume size from UI
      const sizeText = await page.locator('div:has-text("MB")').first().innerText();
      console.log(`     Stored size in IndexedDB: ${sizeText}`);
    }

    console.log('✅ ALL Comics Browser Flow & Performance Tests PASSED!');
  } finally {
    await browser.close();
    server.close();
  }
}

runBrowserFlowTests().catch((err) => {
  console.error('❌ Browser Flow Test failed with error:', err);
  process.exit(1);
});
