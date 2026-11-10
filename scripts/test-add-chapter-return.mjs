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
const outDir = path.resolve(__dirname, '../docs/ui-redesign/reader-return');
const artifactDir = process.env.ARTIFACT_DIR || path.resolve(
  process.env.USERPROFILE || 'C:/Users/ADMIN',
  '.gemini/antigravity/brain/04a8635f-ab90-4862-af83-b6463b1f6a83'
);

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
if (!fs.existsSync(artifactDir)) {
  try {
    fs.mkdirSync(artifactDir, { recursive: true });
  } catch (e) {}
}

const PORT = 4288;
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
};

// Strict static server: 404 on missing assets, serves index.html for SPA routes
function startServer() {
  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/' || !reqPath) reqPath = '/index.html';
    let filePath = path.join(distDir, reqPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      if (reqPath.startsWith('/images/') || reqPath.startsWith('/assets/')) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      filePath = path.join(distDir, 'index.html');
    }
    const ext = path.extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

async function saveOptimizedPng(buffer, targetName) {
  const targetPath = path.join(outDir, targetName);
  let optimized = await sharp(buffer)
    .png({ quality: 85, compressionLevel: 9, palette: true })
    .toBuffer();

  if (optimized.length > 390 * 1024) {
    optimized = await sharp(buffer)
      .png({ colours: 192, compressionLevel: 9, palette: true })
      .toBuffer();
  }

  fs.writeFileSync(targetPath, optimized);
  const kb = optimized.length / 1024;
  console.log(`  📸 Saved screenshot: ${targetName} (${kb.toFixed(1)} KB)`);

  // Copy to artifactDir for user viewing
  try {
    const artPath = path.join(artifactDir, targetName);
    fs.writeFileSync(artPath, optimized);
  } catch (e) {}
}

async function seedTestData(page, novelId = 'test-novel-return') {
  await page.evaluate(async (nId) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('tcl_active_profile', 'real');

    const req = indexedDB.open('thien-co-lau', 1);
    await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('novels')) {
          const s = db.createObjectStore('novels', { keyPath: 'id' });
          s.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('chapters')) {
          const s = db.createObjectStore('chapters', { keyPath: 'id' });
          s.createIndex('novelId', 'novelId');
          s.createIndex('novelId_order', ['novelId', 'order']);
        }
      };
    });

    const db = req.result;
    const tx = db.transaction(['novels', 'chapters'], 'readwrite');
    tx.objectStore('novels').put({
      id: nId,
      title: 'Đại Đạo Triều Thiên',
      author: 'Miêu Nị',
      description: 'Ngàn năm trước, một kiếm tây lai, thiên hạ vô địch...',
      chapterCount: 1,
      totalChapters: 1,
      createdAt: Date.now() - 100000,
      updatedAt: Date.now() - 100000,
    });

    // Content with 40 paragraphs
    const paras = [];
    for (let i = 0; i < 40; i++) {
      paras.push(
        `Đoạn văn thứ ${i + 1}: Thiên địa sơ khai, vạn vật đều do linh khí tạo thành. ` +
        `Tu sĩ bước đi trên con đường nghịch thiên cải mệnh, ngưng tụ kim đan, hóa thành nguyên anh, ` +
        `từng bước bước lên đỉnh cao đại đạo. Gió lạnh thổi qua sườn núi Thiên Trụ, tuyết trắng phủ kín một màu hoang sơ vô tận. ` +
        `Trần Phong khẽ nâng mí mắt, linh lực trong đan điền như thủy triều dâng trào không ngừng nghỉ (${i + 1}).`
      );
    }

    tx.objectStore('chapters').put({
      id: `${nId}-ch-1`,
      novelId: nId,
      order: 1,
      title: 'Chương 1: Bạch Sơn Tuyết Lạc',
      content: paras.join('\n\n'),
      createdAt: Date.now() - 50000,
      updatedAt: Date.now() - 50000,
    });

    await tx.done;

    // Seed library in localStorage
    localStorage.setItem('tcl_library', JSON.stringify([{
      id: nId,
      title: 'Đại Đạo Triều Thiên',
      author: 'Miêu Nị',
      chapterCount: 1,
      totalChapters: 1,
      updatedAt: Date.now() - 100000,
    }]));
  }, novelId);
}

// Scroll to target paragraph and reveal topbar (mimicking natural user swipe to access bar)
async function scrollToParagraphAndRevealTopbar(page, paraId = 'para-15') {
  const info = await page.evaluate((id) => {
    const target = document.getElementById(id);
    if (!target) return { found: false };
    const rect = target.getBoundingClientRect();
    const top = rect.top + window.scrollY;
    window.scrollTo({ top: Math.max(0, top - 85), behavior: 'instant' });
    return { found: true, rectTop: rect.top, top, scrollYAfter: window.scrollY };
  }, paraId);
  console.log('  [SCROLL EVAL]', info);
  await page.waitForTimeout(400);

  // Ensure topbar is visible (if hidden, a slight upward nudge reveals it)
  await page.evaluate(() => {
    window.scrollBy({ top: -5, behavior: 'instant' });
  });
  await page.waitForSelector('div[class*="topBar"]:not([class*="topBarHidden"])', { timeout: 3000 });
  await page.waitForTimeout(400);
}

// Find which paragraph is currently near top of viewport (~60px to 140px)
async function getTopVisibleParagraphIndex(page) {
  return await page.evaluate(() => {
    const paras = Array.from(document.querySelectorAll('[data-para-index]'));
    if (!paras.length) return -1;
    for (let i = 0; i < paras.length; i++) {
      const rect = paras[i].getBoundingClientRect();
      if (rect.bottom >= 60 && rect.top <= 140) {
        return i;
      }
    }
    // Fallback: first paragraph starting from top bar downwards
    for (let i = 0; i < paras.length; i++) {
      const rect = paras[i].getBoundingClientRect();
      if (rect.top >= 60) {
        return Math.max(0, i - 1);
      }
    }
    return 0;
  });
}

async function run() {
  console.log('===========================================================');
  console.log('🧪 TESTING: ADD CHAPTER RETURN TO EXACT READER SPOT');
  console.log('===========================================================');

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  let hasErrors = false;

  try {
    // -------------------------------------------------------------
    // FLOW 1: Desktop 1366x768 - Single chapter add & exact return
    // -------------------------------------------------------------
    console.log('\n--- 1. Testing Desktop 1366x768 (Single Add -> Return Reader) ---');
    const contextDesktop = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      isMobile: false,
    });
    const pageDesktop = await contextDesktop.newPage();
    pageDesktop.on('console', msg => {
      const text = msg.text();
      if (text.includes('READER_SAVE_DEBUG') || text.includes('posData') || text.includes('khôi phục')) {
        console.log('   [PAGE CONSOLE]', text);
      }
    });

    // Open home and seed
    await pageDesktop.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await seedTestData(pageDesktop, 'test-novel-return');

    // Go directly to ReaderPage for Chapter 1
    const readerUrl = `${BASE_URL}/#/novel/test-novel-return/read/test-novel-return-ch-1`;
    await pageDesktop.goto(readerUrl, { waitUntil: 'domcontentloaded' });
    await pageDesktop.waitForSelector('#para-15', { timeout: 10000 });
    await pageDesktop.waitForTimeout(850); // Wait for initial restoration timers (520ms + 700ms) to fully complete

    // Scroll to paragraph 15 and reveal topbar
    await scrollToParagraphAndRevealTopbar(pageDesktop, 'para-15');

    const paraBeforeDesk = await getTopVisibleParagraphIndex(pageDesktop);
    const scrollYBeforeDesk = await pageDesktop.evaluate(() => window.scrollY);
    console.log(`  Targeted paragraph: 15. Visible paragraph: ${paraBeforeDesk}, scrollY: ${scrollYBeforeDesk}px`);
    assert(Math.abs(paraBeforeDesk - 15) <= 1, `Paragraph before must be ~15, got ${paraBeforeDesk}`);

    // Capture screenshot before clicking "+"
    const bufBeforeDesk = await pageDesktop.screenshot();
    await saveOptimizedPng(bufBeforeDesk, 'reader-before-add-1366.png');

    // Click "+" button in top bar
    await pageDesktop.evaluate(() => {
      document.querySelector('button[aria-label="Thêm chương"]').click();
    });

    // Verify URL is add-chapter
    await pageDesktop.waitForURL(/.*#\/novel\/test-novel-return\/add-chapter/, { timeout: 5000 });
    console.log('  ✓ Navigated to AddChapterPage with returnTo in state');

    const storedInAddChapter = await pageDesktop.evaluate(() => {
      return {
        session: sessionStorage.getItem('scroll_pos_test-novel-return_test-novel-return-ch-1'),
        local: localStorage.getItem('scroll_pos_test-novel-return_test-novel-return-ch-1'),
        readingProgress: localStorage.getItem('reading_progress_test-novel-return'),
      };
    });
    console.log('  Stored in AddChapterPage:', storedInAddChapter);

    // Enter single chapter title and content
    await pageDesktop.fill('#ch-title', 'Chương 2: Cửu Kiếm Hoành Không');
    await pageDesktop.fill('#ch-content', 'Nội dung chương 2: Một đạo kiếm quang phá không mà đến, xé rách mây mù...');
    await pageDesktop.click('#btn-save-chapter');

    // Verify it navigates back to reader of ch-1
    await pageDesktop.waitForURL(new RegExp(readerUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 10000 });
    console.log('  ✓ Returned to reader URL: ' + pageDesktop.url());

    // Wait for multi-stage restoration (0, 60, 160, 320, 520, 700ms)
    await pageDesktop.waitForTimeout(900);

    // Capture screenshot after returning
    const bufAfterDesk = await pageDesktop.screenshot();
    await saveOptimizedPng(bufAfterDesk, 'reader-after-add-1366.png');

    const paraAfterDesk = await getTopVisibleParagraphIndex(pageDesktop);
    const scrollYAfterDesk = await pageDesktop.evaluate(() => window.scrollY);
    console.log(`  Restored paragraph: ${paraAfterDesk}, scrollY: ${scrollYAfterDesk}px (Tolerance <= 1 paragraph)`);

    const paraDiffDesk = Math.abs(paraAfterDesk - paraBeforeDesk);
    assert(paraDiffDesk <= 1, `Paragraph restored (${paraAfterDesk}) must be within 1 paragraph of ${paraBeforeDesk}`);
    console.log(`  ✓ Position restored precisely: paragraph delta = ${paraDiffDesk}`);

    // Verify Chapter 2 exists in TOC and Next Chapter button appears
    await pageDesktop.click('button[aria-label="Mục lục chương"]');
    await pageDesktop.waitForSelector('text=Chương 2: Cửu Kiếm Hoành Không', { timeout: 5000 });
    console.log('  ✓ Chapter 2 is present in Table of Contents drawer');

    // Close TOC
    await pageDesktop.keyboard.press('Escape');
    await pageDesktop.waitForTimeout(300);

    // Verify Next Chapter button is present and links to ch-2
    const nextChapterAvailable = await pageDesktop.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button'));
      return links.some(el => el.textContent && el.textContent.includes('Chương sau'));
    });
    assert(nextChapterAvailable, 'Nút Chương sau phải hiển thị sau khi thêm chương kế tiếp');
    console.log('  ✓ Next Chapter button is active and visible');

    await contextDesktop.close();

    // -------------------------------------------------------------
    // FLOW 2: Mobile 390x844 - Single chapter add & exact return
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing Mobile 390x844 (Single Add -> Return Reader) ---');
    const contextMobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
    });
    const pageMobile = await contextMobile.newPage();

    // Open reader directly
    await pageMobile.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await seedTestData(pageMobile, 'test-novel-return-mob');

    const readerUrlMob = `${BASE_URL}/#/novel/test-novel-return-mob/read/test-novel-return-mob-ch-1`;
    await pageMobile.goto(readerUrlMob, { waitUntil: 'domcontentloaded' });
    await pageMobile.waitForSelector('#para-15', { timeout: 10000 });
    await pageMobile.waitForTimeout(850);

    // Scroll to paragraph 15 and reveal topbar
    await scrollToParagraphAndRevealTopbar(pageMobile, 'para-15');

    const paraBeforeMob = await getTopVisibleParagraphIndex(pageMobile);
    console.log(`  Mobile targeted paragraph: 15. Visible paragraph: ${paraBeforeMob}`);
    assert(Math.abs(paraBeforeMob - 15) <= 1, `Mobile paragraph before must be ~15, got ${paraBeforeMob}`);

    const bufBeforeMob = await pageMobile.screenshot();
    await saveOptimizedPng(bufBeforeMob, 'reader-before-add-390.png');

    // Click "+" button
    await pageMobile.evaluate(() => {
      document.querySelector('button[aria-label="Thêm chương"]').click();
    });
    await pageMobile.waitForURL(/.*#\/novel\/test-novel-return-mob\/add-chapter/, { timeout: 5000 });
    console.log('  ✓ Mobile navigated to AddChapterPage');

    // Add chapter
    await pageMobile.fill('#ch-title', 'Chương 2: Hắc Ám Phong Bạo (Mobile)');
    await pageMobile.fill('#ch-content', 'Nội dung chương 2 mobile...');
    await pageMobile.click('#btn-save-chapter');

    // Wait return to reader
    await pageMobile.waitForURL(new RegExp(readerUrlMob.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 10000 });
    await pageMobile.waitForTimeout(900);

    const bufAfterMob = await pageMobile.screenshot();
    await saveOptimizedPng(bufAfterMob, 'reader-after-add-390.png');

    const paraAfterMob = await getTopVisibleParagraphIndex(pageMobile);
    const paraDiffMob = Math.abs(paraAfterMob - paraBeforeMob);
    console.log(`  Mobile restored paragraph: ${paraAfterMob} (Delta: ${paraDiffMob})`);
    assert(paraDiffMob <= 1, `Mobile position restored (${paraAfterMob}) within 1 paragraph of ${paraBeforeMob}`);
    console.log('  ✓ Mobile position restored precisely within tolerance');

    await contextMobile.close();

    // -------------------------------------------------------------
    // FLOW 3: Batch Mode (Thêm nhiều chương từ file -> Return Reader)
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Batch Mode Import -> Return Reader ---');
    const contextBatch = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageBatch = await contextBatch.newPage();

    await pageBatch.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await seedTestData(pageBatch, 'test-novel-batch');

    const readerUrlBatch = `${BASE_URL}/#/novel/test-novel-batch/read/test-novel-batch-ch-1`;
    await pageBatch.goto(readerUrlBatch, { waitUntil: 'domcontentloaded' });
    await pageBatch.waitForSelector('#para-12', { timeout: 10000 });
    await pageBatch.waitForTimeout(850);

    // Scroll to paragraph 12 and reveal topbar
    await scrollToParagraphAndRevealTopbar(pageBatch, 'para-12');
    const paraBeforeBatch = await getTopVisibleParagraphIndex(pageBatch);

    // Click "+"
    await pageBatch.evaluate(() => {
      document.querySelector('button[aria-label="Thêm chương"]').click();
    });
    await pageBatch.waitForURL(/.*#\/novel\/test-novel-batch\/add-chapter/, { timeout: 5000 });

    // Switch to File/Batch mode
    await pageBatch.click('button:has-text("Thêm từ file")');
    await pageBatch.waitForSelector('#batch-novel-file-input', { state: 'attached' });

    // Upload batch text file containing 2 chapters
    const batchContent =
`Chương 3: Hỗn Độn Chi Nhãn
Nội dung chương 3 đầy bí ẩn trong hư vô...

Chương 4: Vô Thượng Thần Thông
Nội dung chương 4 uy lực vô song trấn áp vạn cổ...`;

    await pageBatch.setInputFiles('#batch-novel-file-input', {
      name: 'batch-chapters.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(batchContent, 'utf-8'),
    });

    // Wait for parse results and save button enabled
    const saveBatchBtn = pageBatch.locator('#btn-save-batch-chapters');
    await saveBatchBtn.waitFor({ state: 'visible', timeout: 5000 });
    await saveBatchBtn.click();

    // Verify it returns to reader
    await pageBatch.waitForURL(new RegExp(readerUrlBatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 10000 });
    await pageBatch.waitForTimeout(900);
    console.log('  ✓ Batch mode successfully returned to reader URL');

    const paraAfterBatch = await getTopVisibleParagraphIndex(pageBatch);
    const diffBatch = Math.abs(paraAfterBatch - paraBeforeBatch);
    console.log(`  Batch restored paragraph: ${paraAfterBatch} (Delta: ${diffBatch})`);
    assert(diffBatch <= 1, `Batch return position must be within 1 paragraph, got delta ${diffBatch}`);
    console.log('  ✓ Batch return position verified cleanly');

    // -------------------------------------------------------------
    // FLOW 4: Cancel ("Hủy") Button flow -> Return Reader
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing Cancel ("Hủy") Flow ---');
    // Continue on pageBatch which already has test-novel-batch loaded
    await scrollToParagraphAndRevealTopbar(pageBatch, 'para-18');
    const paraBeforeCancel = await getTopVisibleParagraphIndex(pageBatch);

    // Click "+"
    await pageBatch.evaluate(() => {
      document.querySelector('button[aria-label="Thêm chương"]').click();
    });
    await pageBatch.waitForURL(/.*#\/novel\/test-novel-batch\/add-chapter/, { timeout: 5000 });

    // Click "Hủy" button
    await pageBatch.click('button:has-text("Hủy")');

    // Verify returns to reader
    await pageBatch.waitForURL(new RegExp(readerUrlBatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), { timeout: 5000 });
    await pageBatch.waitForTimeout(900);
    console.log('  ✓ Cancel returned cleanly to reader URL');

    const paraAfterCancel = await getTopVisibleParagraphIndex(pageBatch);
    const diffCancel = Math.abs(paraAfterCancel - paraBeforeCancel);
    assert(diffCancel <= 1, `Cancel return position must be preserved, delta: ${diffCancel}`);
    console.log(`  ✓ Cancel preserved exact reading position (Delta: ${diffCancel})`);

    // -------------------------------------------------------------
    // FLOW 5: Add chapter from NovelDetailPage -> Must stay in NovelDetail
    // -------------------------------------------------------------
    console.log('\n--- 5. Testing Add Chapter from NovelDetailPage (Must Return to Detail) ---');
    const detailUrl = `${BASE_URL}/#/novel/test-novel-batch`;
    await pageBatch.goto(detailUrl, { waitUntil: 'domcontentloaded' });
    await pageBatch.waitForSelector('#btn-more-actions', { timeout: 10000 });

    // Open More Actions popover menu
    await pageBatch.click('#btn-more-actions');
    await pageBatch.waitForSelector('#btn-add-chapter-detail', { timeout: 5000 });

    // Click "Thêm chương" on NovelDetailPage
    await pageBatch.click('#btn-add-chapter-detail');
    await pageBatch.waitForURL(/.*#\/novel\/test-novel-batch\/add-chapter/, { timeout: 5000 });
    console.log('  ✓ Detail page navigated to AddChapterPage without returnTo');

    // Fill title and save
    await pageBatch.fill('#ch-title', 'Chương 5: Thiên Ngoại Hữu Thiên');
    await pageBatch.fill('#ch-content', 'Nội dung chương 5...');
    await pageBatch.click('#btn-save-chapter');

    // Verify it navigates back to NovelDetailPage (TOC / detail), NOT reader!
    await pageBatch.waitForURL(new RegExp(detailUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), { timeout: 10000 });
    console.log('  ✓ Adding from NovelDetailPage successfully returned to NovelDetailPage (mục lục truyện)!');

    await contextBatch.close();

  } catch (err) {
    console.error('🚨 TEST FAILED WITH ERROR:', err);
    hasErrors = true;
  } finally {
    await browser.close();
    server.close();
  }

  if (hasErrors) {
    console.error('\n❌ TEST ADD CHAPTER RETURN FAILED!');
    process.exit(1);
  } else {
    console.log('\n🎉 ALL ADD CHAPTER RETURN-TO-READER TESTS PASSED 100%!');
    process.exit(0);
  }
}

run();
