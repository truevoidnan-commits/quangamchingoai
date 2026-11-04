/**
 * Playwright E2E & Flow Test for Comics (Truyện Tranh) - Phase 3
 * Run: node scripts/test-comics-browser-flow.mjs
 */
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert';
import { generateComicBenchmarkPdf } from './make-comic-benchmark-pdf.mjs';

// Screenshots saved strictly in artifacts/ (which is in .gitignore)
const ARTIFACT_DIR = path.resolve('artifacts/comics');
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

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
  const samplePdfPath = path.resolve('artifacts/comics/test-comic-sample.pdf');
  if (fs.existsSync(samplePdfPath)) return samplePdfPath;

  const p = await browser.newPage();
  let html =
    '<html><head><style>@page { size: 1000px 1500px; margin: 0; } body { margin:0; background:#0f172a; font-family:sans-serif; } .p { width:1000px; height:1500px; page-break-after:always; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#38bdf8; border:4px solid #38bdf8; box-sizing:border-box; }</style></head><body>';
  for (let i = 1; i <= 6; i++) {
    html += `<div class="p"><h1>Đấu Phá Thương Khung</h1><h2>Tập 1 - Trang ${i}</h2></div>`;
  }
  html += '</body></html>';
  await p.setContent(html);
  await p.pdf({ path: samplePdfPath, width: '1000px', height: '1500px', printBackground: true });
  await p.close();
  return samplePdfPath;
}

/**
 * Kiểm tra không có thanh cuộn ngang ở bất kỳ phần tử nào
 */
async function assertNoHorizontalScroll(page, pageName) {
  const vp = page.viewportSize();
  const info = await page.evaluate(() => {
    const docWidth = document.documentElement.scrollWidth;
    const bodyWidth = document.body.scrollWidth;
    const winWidth = window.innerWidth;
    return {
      docWidth,
      bodyWidth,
      winWidth,
      hasOverflow: docWidth > winWidth || bodyWidth > winWidth,
    };
  });

  assert(
    !info.hasOverflow,
    `LỖI CUỘN NGANG: Trang "${pageName}" tại ${vp.width}x${vp.height} có docWidth=${info.docWidth}, bodyWidth=${info.bodyWidth} > winWidth=${info.winWidth}`
  );
  console.log(`     ✓ Không cuộn ngang trên ${pageName} (${vp.width}px) [docWidth: ${info.docWidth}px <= ${info.winWidth}px]`);
}

async function runBrowserFlowTests() {
  console.log('🧪 Starting Comics Browser Flow & Performance Tests (Phase 3)...');
  const server = await createStaticServer();

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      hasTouch: true,
    });

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

    // 2. Verify Storage Gauge & Empty State & Mobile viewports (360px & 390px)
    console.log('  2. Verifying ComicsPage storage gauge & responsiveness (360px & 390px)...');
    await page.waitForSelector('text=TÀNG KINH HỌA CÁC');

    // Kiểm tra không cuộn ngang ở 360px và 390px
    await page.setViewportSize({ width: 360, height: 740 });
    await page.waitForTimeout(200);
    await assertNoHorizontalScroll(page, 'ComicsPage');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    await assertNoHorizontalScroll(page, 'ComicsPage');
    const comicsPageMobileShot = path.join(ARTIFACT_DIR, 'comics-page-mobile.png');
    await page.screenshot({ path: comicsPageMobileShot });

    await page.setViewportSize({ width: 1280, height: 800 });
    const comicsPageDesktopShot = path.join(ARTIFACT_DIR, 'comics-page-desktop.png');
    await page.screenshot({ path: comicsPageDesktopShot });

    // 3. Settings Modal / Bottom sheet test
    console.log('  3. Testing Settings bottom sheet / modal...');
    const settingsBtn = await page.locator('button[aria-label="Cài đặt đồng bộ & bộ nhớ"]');
    await settingsBtn.click();
    await page.waitForSelector('text=Cài Đặt Truyện Tranh');
    const autoDlToggle = await page.locator('#toggle-auto-download');
    assert(await autoDlToggle.isChecked(), 'Auto download toggle should be checked by default');
    const doneBtn = await page.locator('button:has-text("Hoàn Tất")');
    await doneBtn.click();
    await page.waitForTimeout(200);

    // 4. Import Modal & File Upload Test (test-comic-sample.pdf, 6 pages)
    console.log('  4. Testing Import PDF Modal with test-comic-sample.pdf...');
    const importBtn = await page.waitForSelector('#btn-import-pdf-comics');
    await importBtn.click();

    await page.waitForSelector('text=Nhập Truyện Tranh (PDF)');
    const fileInput = await page.locator('input[type="file"]');
    const samplePdfPath = await ensureSamplePdf(browser);
    await fileInput.setInputFiles(samplePdfPath);

    // Verify editable file table appears with order and title
    await page.waitForSelector('input[aria-label*="Số tập cho"]');
    const orderInput = await page.locator('input[aria-label*="Số tập cho"]');
    const currentOrderVal = await orderInput.inputValue();
    assert(currentOrderVal, 'Order input should have default recognized/assigned value');

    // Title input
    const seriesTitleInput = await page.locator('input[placeholder*="One Piece"]');
    await seriesTitleInput.fill('Đấu Phá Thương Khung');

    // Click start import
    const startImportBtn = await page.locator('button:has-text("Bắt Đầu Nhập")');
    await startImportBtn.click();

    // Verify progress screen
    await page.waitForSelector('text=Đang xử lý truyện tranh...', { timeout: 10000 });
    console.log('     Progress screen shown during page extraction.');

    const importProgressShot = path.join(ARTIFACT_DIR, 'comics-import-progress.png');
    await page.screenshot({ path: importProgressShot });

    // Wait until import completes and navigates to ComicSeriesPage
    await page.waitForURL(/\/comics\/[A-Za-z0-9_-]+/, { timeout: 30000 });
    console.log(`     Successfully imported and navigated to Series Page: ${page.url()}`);

    // 5. Verify ComicSeriesPage & Menu ⋯ & Edit volume dialog (D2) & 360px fit
    console.log('  5. Testing ComicSeriesPage, Menu ⋯, Edit Volume Dialog (D2)...');
    await page.waitForSelector('text=Đấu Phá Thương Khung');

    // Test viewport 360px & 390px on ComicSeriesPage
    await page.setViewportSize({ width: 360, height: 740 });
    await page.waitForTimeout(200);
    await assertNoHorizontalScroll(page, 'ComicSeriesPage');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    await assertNoHorizontalScroll(page, 'ComicSeriesPage');

    // Test Menu ⋯ button
    const moreBtn = await page.locator('button[aria-label="Tùy chọn khác"]').first();
    await moreBtn.click();
    await page.waitForSelector('text=Sửa Số Tập / Tên Tập');

    // Click "Sửa Số Tập / Tên Tập"
    const editItem = await page.locator('button:has-text("Sửa Số Tập / Tên Tập")');
    await editItem.click();

    // Verify Edit Dialog opens
    await page.waitForSelector('text=Sửa Số Tập & Tên Tập');
    const editOrderIn = await page.locator('input[type="number"][value]');
    await editOrderIn.fill('1');

    const editTitleIn = await page.locator('input[type="text"][value*="test-comic-sample"]');
    await editTitleIn.fill('Tập 1 - Thức Tỉnh Đấu Hồn Cực Kỳ Dài Dài Dài Dài Dài Dài');

    const saveVolBtn = await page.locator('button:has-text("Lưu Thay Đổi")');
    await saveVolBtn.click();
    await page.waitForTimeout(400);

    // Verify no overflow with long title at 360px
    await page.setViewportSize({ width: 360, height: 740 });
    await page.waitForTimeout(200);
    await assertNoHorizontalScroll(page, 'ComicSeriesPage with Long Title');

    const seriesPageShot = path.join(ARTIFACT_DIR, 'comics-series-page.png');
    await page.screenshot({ path: seriesPageShot });
    console.log(`     Saved screenshot: ${seriesPageShot}`);

    // 6. Test ComicReaderPage (C1, C2, C3, C4)
    console.log('  6. Testing ComicReaderPage (Double-tap, Jump Popover, Chevrons)...');
    await page.setViewportSize({ width: 390, height: 844 });
    const mainReadBtn = await page.locator('button:has-text("Đọc")').first();
    await mainReadBtn.click();

    await page.waitForURL(/\/comics\/[A-Za-z0-9_-]+\/read\/[A-Za-z0-9_-]+/, { timeout: 15000 });
    console.log(`     Navigated to Reader: ${page.url()}`);

    // Verify no horizontal overflow in reader on 360px and 390px
    await page.setViewportSize({ width: 360, height: 740 });
    await page.waitForTimeout(300);
    await assertNoHorizontalScroll(page, 'ComicReaderPage (Toolbars Visible 360px)');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
    await assertNoHorizontalScroll(page, 'ComicReaderPage (Toolbars Visible 390px)');

    // Verify image 1 loaded
    await page.waitForSelector('img[alt="Trang 1"]', { timeout: 15000 });

    // Test C1: Double-tap / double-click toolbar toggle
    console.log('     Testing C1: Double-click / double-tap toolbar toggle...');
    const topBar = await page.locator('[class*="topToolbar"]').first();
    const isVisibleBefore = await topBar.evaluate((el) => !el.className.includes('toolbarHidden'));

    // Trigger double click
    await page.mouse.dblclick(200, 300);
    await page.waitForTimeout(400);
    const isVisibleAfterDblClick = await topBar.evaluate((el) => !el.className.includes('toolbarHidden'));
    assert.notStrictEqual(isVisibleBefore, isVisibleAfterDblClick, 'Double-click must toggle toolbars!');

    // Toggle back
    await page.mouse.dblclick(200, 300);
    await page.waitForTimeout(400);

    // Test C3: Numeric Jump Popover
    console.log('     Testing C3: Numeric Page Jump Popover...');
    const pageJumpBtn = await page.locator('button[aria-label="Nhấn để nhảy tới trang"]');
    await pageJumpBtn.click();
    await page.waitForSelector('text=Đến Trang');

    // Test invalid page (99) -> error shown
    const jumpInput = await page.locator('input[type="number"][min="1"]');
    await jumpInput.fill('99');
    const jumpGoBtn = await page.locator('button:has-text("Đi")');
    await jumpGoBtn.click();
    await page.waitForSelector('text=Trang hợp lệ từ 1 đến');
    console.log('     Invalid page range properly rejected with message.');

    // Test valid page (4) -> jumps to page 4
    await jumpInput.fill('4');
    await jumpGoBtn.click();
    await page.waitForTimeout(500);

    // Verify jump button now shows 4 / 6
    const jumpBtnText = await pageJumpBtn.innerText();
    assert(jumpBtnText.includes('4 / 6'), `Expected jump button to show 4 / 6, got "${jumpBtnText}"`);
    console.log('     Page jump succeeded: navigated to page 4!');

    // Test C2: Mode switch icon button
    console.log('     Testing C2: Mode switch toggle button...');
    const modeBtn = await page.locator('button[aria-label*="chế độ"]');
    await modeBtn.click();
    await page.waitForTimeout(400);

    // In single page mode, verify double-click toggles without page advance
    const currentTextInPageMode = await pageJumpBtn.innerText();
    await page.mouse.dblclick(100, 300); // left zone double click
    await page.waitForTimeout(400);
    const textAfterDbl = await pageJumpBtn.innerText();
    assert.strictEqual(
      currentTextInPageMode,
      textAfterDbl,
      'Double click/tap in page mode MUST NOT advance page!'
    );
    console.log('     Verified double-tap in page mode does not cause accidental page turn.');

    // Clean up volume (P1: Unified Xóa, verify no "Xóa Cloud", modal copy, and 0-volume series card removal)
    await page.goto(`${BASE_URL}/#/comics`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Đấu Phá Thương Khung');
    await page.click('text=Đấu Phá Thương Khung');
    await page.waitForSelector('button[aria-label="Tùy chọn khác"]');
    await page.click('button[aria-label="Tùy chọn khác"]');

    // P1: Menu ⋯ must have "Xóa", and must NOT have "Xóa Cloud"
    await page.waitForSelector('[class*="menuSheet"] button:has-text("Xóa")');
    const cloudDelCount = await page.locator('[class*="menuSheet"] button:has-text("Xóa Khỏi Cloud")').count();
    assert.strictEqual(cloudDelCount, 0, 'Menu ⋯ của tập không còn nút "Xóa Khỏi Cloud"');

    await page.locator('[class*="menuSheet"] button:has-text("Xóa")').click();
    await page.waitForSelector('text=Xác Nhận Xóa Tập Truyện');

    // Verify modal text has pages and MB
    const volModalDesc = await page.locator('[class*="deleteModalDesc"]').innerText();
    assert(volModalDesc.includes('trang') && volModalDesc.includes('MB'), `Modal xóa tập phải chứa số trang và dung lượng: ${volModalDesc}`);
    assert(volModalDesc.includes('Sẽ xóa trên mọi thiết bị và trên Cloud'), 'Modal xóa tập phải thông báo xóa ở mọi nơi');

    // Click "Xóa"
    await page.locator('[class*="deleteConfirmBtn"]').click();
    await page.waitForTimeout(800);

    // P4: Return to ComicsPage and verify empty series (0 volumes) has disappeared!
    await page.goto(`${BASE_URL}/#/comics`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const emptySeriesCount = await page.locator('text=Đấu Phá Thương Khung').count();
    assert.strictEqual(emptySeriesCount, 0, 'Thẻ bộ truyện rỗng (0 tập) phải tự biến mất khỏi danh sách!');
    console.log('     ✓ Verified P1 unified delete & P4 0-volume series card disappearance!');

    // 7. Benchmark Realistic Comic PDF at 3 Quality Tiers (Low, Balanced, High)
    console.log('  7. Generating Realistic Manga Benchmark PDF (2000x3000px, 45 pages)...');
    const benchmarkPdf = await generateComicBenchmarkPdf(null, 45);
    console.log(`     Benchmark PDF ready: ${benchmarkPdf.path} (${benchmarkPdf.sizeMb} MB)`);

    const tiers = [
      { id: 'low', expectedW: 900, textPattern: '900px' },
      { id: 'balanced', expectedW: 1200, textPattern: '1200px' },
      { id: 'high', expectedW: 1600, textPattern: '1600px' },
    ];

    const benchmarkResults = [];

    for (const tier of tiers) {
      console.log(`     Testing Quality Tier: ${tier.id.toUpperCase()} (Kỳ vọng width = ${tier.expectedW}px)...`);

      await page.goto(`${BASE_URL}/#/comics`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#btn-import-pdf-comics');
      await page.click('#btn-import-pdf-comics');

      await page.waitForSelector('text=Nhập Truyện Tranh (PDF)');
      const benchFileInput = await page.locator('input[type="file"]');
      await benchFileInput.setInputFiles(benchmarkPdf.path);

      const qualityCard = await page.locator(`div[class*="qualityCard"]:has-text("${tier.textPattern}")`);
      await qualityCard.click();

      const titleInput = await page.locator('input[placeholder*="One Piece"]');
      const seriesTitle = `Benchmark ${tier.id.toUpperCase()}`;
      await titleInput.fill(seriesTitle);

      const startTime = Date.now();
      await page.click('button:has-text("Bắt Đầu Nhập")');

      await page.waitForURL(/\/comics\/[A-Za-z0-9_-]+/, { timeout: 120000 });
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

      const currentUrl = page.url();
      const seriesId = currentUrl.split('/comics/')[1].split(/[?#/]/)[0];

      const volStats = await page.evaluate(async (sId) => {
        return new Promise((resolve) => {
          const req = indexedDB.open('thien-co-lau-comics', 1);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction(['volumes', 'pages'], 'readonly');
            const volStore = tx.objectStore('volumes');
            const volIndex = volStore.index('seriesId');
            const getVols = volIndex.getAll(IDBKeyRange.only(sId));

            getVols.onsuccess = () => {
              const vols = getVols.result || [];
              const vol = vols[0];
              if (!vol) return resolve(null);

              const pageStore = tx.objectStore('pages');
              const pageIndex = pageStore.index('volumeId');
              const getPages = pageIndex.openCursor(IDBKeyRange.only(vol.id));

              getPages.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                  resolve({
                    volumeId: vol.id,
                    totalBytes: vol.totalBytes,
                    pageCount: vol.pageCount,
                    firstPageW: cursor.value.w,
                    firstPageH: cursor.value.h,
                  });
                } else {
                  resolve({
                    volumeId: vol.id,
                    totalBytes: vol.totalBytes,
                    pageCount: vol.pageCount,
                    firstPageW: 0,
                    firstPageH: 0,
                  });
                }
              };
            };
          };
          req.onerror = () => resolve(null);
        });
      }, seriesId);

      const sizeMb = ((volStats?.totalBytes || 0) / (1024 * 1024)).toFixed(2);
      console.log(`     ✓ Tier ${tier.id.toUpperCase()}: Trang đầu = ${volStats?.firstPageW}x${volStats?.firstPageH}px | Thời gian = ${durationSec}s | Dung lượng IDB = ${sizeMb} MB`);

      const diffW = Math.abs((volStats?.firstPageW || 0) - tier.expectedW);
      assert(
        diffW <= 2,
        `Tier ${tier.id.toUpperCase()}: Chiều rộng thực tế ${volStats?.firstPageW}px lệch quá 2px so với kỳ vọng ${tier.expectedW}px (sai số: ${diffW}px)`
      );

      benchmarkResults.push({
        tier: tier.id,
        expectedW: tier.expectedW,
        actualW: volStats?.firstPageW,
        actualH: volStats?.firstPageH,
        durationSec,
        sizeMb,
        totalBytes: volStats?.totalBytes || 0,
        pageCount: volStats?.pageCount || 45,
      });

      await page.waitForSelector('[class*="deleteSeriesBtn"]');
      await page.locator('[class*="deleteSeriesBtn"]').click();
      await page.waitForSelector('[class*="deleteModalBox"]');

      // Verify modal text displays volume count and MB
      const seriesModalDesc = await page.locator('[class*="deleteModalDesc"]').innerText();
      assert(seriesModalDesc.includes('tập') && seriesModalDesc.includes('MB'), `Modal xóa bộ phải hiển thị số tập và dung lượng: ${seriesModalDesc}`);
      assert(seriesModalDesc.includes('Sẽ xóa trên mọi thiết bị và trên Cloud'), 'Modal xóa bộ phải thông báo xóa ở mọi nơi');

      await page.locator('[class*="deleteConfirmBtn"]').click();
      await page.waitForURL('**/comics', { timeout: 10000 });
    }

    if (fs.existsSync(benchmarkPdf.path)) {
      try {
        fs.unlinkSync(benchmarkPdf.path);
      } catch (e) {}
    }

    console.log('\n======================================================');
    console.log('📊 BẢNG KẾT QUẢ BENCHMARK 3 MỨC CHẤT LƯỢNG (45 TRANG MANGA):');
    console.table(benchmarkResults);
    console.log('======================================================\n');

    const lowTier = benchmarkResults.find((r) => r.tier === 'low');
    const balancedTier = benchmarkResults.find((r) => r.tier === 'balanced');
    const highTier = benchmarkResults.find((r) => r.tier === 'high');

    assert(lowTier && balancedTier && highTier, 'Thiếu kết quả của 1 trong 3 mức chất lượng');
    assert(
      lowTier.totalBytes < balancedTier.totalBytes,
      `Dung lượng Thấp (${lowTier.totalBytes} B / ${lowTier.sizeMb} MB) phải nhỏ hơn Cân bằng (${balancedTier.totalBytes} B / ${balancedTier.sizeMb} MB)`
    );
    assert(
      balancedTier.totalBytes < highTier.totalBytes,
      `Dung lượng Cân bằng (${balancedTier.totalBytes} B / ${balancedTier.sizeMb} MB) phải nhỏ hơn Cao (${highTier.totalBytes} B / ${highTier.sizeMb} MB)`
    );
    console.log(`  ✓ Đã kiểm tra tính đúng đắn:
      - Chiều rộng trang đầu khớp chuẩn (sai số <= 2px): Low=${lowTier.actualW}px, Balanced=${balancedTier.actualW}px, High=${highTier.actualW}px
      - Dung lượng tăng dần theo preset: Thấp (${lowTier.sizeMb}MB) < Cân bằng (${balancedTier.sizeMb}MB) < Cao (${highTier.sizeMb}MB)`);

    console.log('✅ ALL Comics Browser Flow & Performance Tests (Phase 3) PASSED!');
  } finally {
    await browser.close();
    server.close();
  }
}

runBrowserFlowTests().catch((err) => {
  console.error('❌ Browser Flow Test failed with error:', err);
  process.exit(1);
});
