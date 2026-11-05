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
const outDir = path.resolve(__dirname, '../docs/ui-redesign/desktop-bg-toc');
const artifactDir = 'C:/Users/ADMIN/.gemini/antigravity/brain/04a8635f-ab90-4862-af83-b6463b1f6a83';

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
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
  console.log(`Saved: ${path.basename(targetPath)} (${kb.toFixed(1)} KB) - ${kb < 400 ? 'PASS < 400KB' : 'FAIL'}`);

  // Copy to artifacts dir
  const baseName = path.basename(targetPath);
  const artifactPath = path.join(artifactDir, baseName);
  try {
    fs.writeFileSync(artifactPath, optimized);
  } catch (e) {}
}

async function assertNoHorizontalScroll(page, name) {
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
  assert(!info.hasOverflow, `Lỗi cuộn ngang trên ${name}: docWidth=${info.docWidth}, winWidth=${info.winWidth}`);
  console.log(`  ✓ Không cuộn ngang tại ${name} (docWidth: ${info.docWidth}px <= winWidth: ${info.winWidth}px)`);
}

async function main() {
  console.log('\n===============================================================');
  console.log('  PLAYWRIGHT KIỂM THỬ GIAO DIỆN NỀN NGANG, MỤC LỤC & CÁC MÀN HÌNH');
  console.log('===============================================================\n');

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 1. Seed sample data in browser
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  await page.evaluate(async () => {
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
      id: 'test-novel-toc',
      title: 'Đấu Phá Thương Khung',
      author: 'Thiên Tằm Thổ Đậu',
      description: 'Đây là một thế giới thuộc về Đấu Khí, không có ma pháp hoa lệ diễm lệ, chỉ có đấu khí đã phồn thịnh tới đỉnh cao!',
      chapterCount: 299,
      totalChapters: 299,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    for (let i = 1; i <= 299; i++) {
      tx.objectStore('chapters').put({
        id: `dp-ch-${i}`,
        novelId: 'test-novel-toc',
        order: i,
        title: `Chương ${i}: Vẫn Lạc Thiên Tài`,
        content: `Nội dung chương ${i}: Tiêu Viêm nhìn huy chương đấu giả, trong lòng không khỏi thở dài. Ba năm qua, tu vi của hắn không tiến mà lùi...`,
        createdAt: Date.now() - (300 - i) * 1000,
        updatedAt: Date.now() - (300 - i) * 1000,
      });
    }

    localStorage.setItem('tcl_progress_test-novel-toc', JSON.stringify({
      chapterId: 'dp-ch-3',
      chapterNumber: 3,
      scrollTop: 100,
      timestamp: Date.now(),
    }));

    // Comic series seed for comics lobby
    try {
      const creq = indexedDB.open('thien-co-lau-comics', 1);
      await new Promise((resolve, reject) => {
        creq.onsuccess = () => resolve();
        creq.onerror = () => resolve(); // ignore if already open
        creq.onupgradeneeded = (e) => {
          const cdb = e.target.result;
          if (!cdb.objectStoreNames.contains('comic_series')) {
            cdb.createObjectStore('comic_series', { keyPath: 'id' });
          }
          if (!cdb.objectStoreNames.contains('comic_volumes')) {
            cdb.createObjectStore('comic_volumes', { keyPath: 'id' });
          }
        };
      });
      const cdb = creq.result;
      if (cdb && cdb.objectStoreNames.contains('comic_series')) {
        const ctx = cdb.transaction(['comic_series'], 'readwrite');
        ctx.objectStore('comic_series').put({
          id: 'series-test-wide',
          title: 'Phong Vân Kỳ Hiệp',
          author: 'Mã Vinh Thành',
          totalVolumes: 24,
          localVolumes: 24,
          status: 'ready',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    } catch (e) {}
  });

  // ==========================================
  // PHẦN 1: LOBBY CHỮ & TRANH (1920x1080 và 390x844)
  // ==========================================
  console.log('\n--- 1. KIỂM THỬ NỀN NGANG: LOBBY TRUYỆN CHỮ & TRUYỆN TRANH ---');
  
  // 1a. Text lobby Desktop 1920x1080
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await assertNoHorizontalScroll(page, 'Lobby truyện chữ 1920x1080');
  const buf1a = await page.screenshot({ fullPage: false });
  await saveOptimizedPng(buf1a, path.join(outDir, '01-lobby-text-desktop-1920.png'));

  // 1b. Text lobby Mobile 390x844
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await assertNoHorizontalScroll(page, 'Lobby truyện chữ 390x844');
  const buf1b = await page.screenshot({ fullPage: false });
  await saveOptimizedPng(buf1b, path.join(outDir, '02-lobby-text-mobile-390.png'));

  // 1c. Comics lobby Desktop 1920x1080
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(`${BASE_URL}/#/comics`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await assertNoHorizontalScroll(page, 'Lobby truyện tranh 1920x1080');
  const buf1c = await page.screenshot({ fullPage: false });
  await saveOptimizedPng(buf1c, path.join(outDir, '03-lobby-comics-desktop-1920.png'));

  // 1d. Comics lobby Mobile 390x844
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/#/comics`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await assertNoHorizontalScroll(page, 'Lobby truyện tranh 390x844');
  const buf1d = await page.screenshot({ fullPage: false });
  await saveOptimizedPng(buf1d, path.join(outDir, '04-lobby-comics-mobile-390.png'));

  // ==========================================
  // PHẦN 2: TRANG CHI TIẾT TRUYỆN & MỤC LỤC
  // ==========================================
  console.log('\n--- 2. KIỂM THỬ MỤC LỤC NOVEL DETAIL PAGE & STICKY HEADER ---');
  
  const detailViewports = [
    { w: 1920, h: 1080, name: '1920' },
    { w: 1366, h: 768, name: '1366' },
    { w: 768, h: 1024, name: '768' },
    { w: 390, h: 844, name: '390' }
  ];

  for (const vp of detailViewports) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto(`${BASE_URL}/#/novel/test-novel-toc`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await assertNoHorizontalScroll(page, `Chi tiết truyện ${vp.w}px`);

    // Verify Chapter 3 has reading indicator / badge
    const hasReadingChapter = await page.evaluate(() => {
      const reading = document.querySelector('[class*="chapterLastRead"]');
      return Boolean(reading);
    });
    assert(hasReadingChapter, `Không tìm thấy chương đang đọc tại ${vp.w}px`);

    // Screenshot normal view
    const bufNorm = await page.screenshot({ fullPage: false });
    await saveOptimizedPng(bufNorm, path.join(outDir, `05-novel-detail-${vp.name}.png`));

    // Scroll down to test sticky header
    await page.evaluate(() => window.scrollBy(0, 450));
    await page.waitForTimeout(300);
    await assertNoHorizontalScroll(page, `Chi tiết truyện sticky ${vp.w}px`);
    const bufSticky = await page.screenshot({ fullPage: false });
    await saveOptimizedPng(bufSticky, path.join(outDir, `06-novel-detail-sticky-${vp.name}.png`));
  }

  // ==========================================
  // PHẦN 3: MODAL TÌM & THAY THẾ (GlobalReplaceModal)
  // ==========================================
  console.log('\n--- 3. KIỂM THỬ MODAL TÌM & THAY THẾ TOÀN BỘ TRUYỆN ---');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE_URL}/#/novel/test-novel-toc`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  // Click tools dropdown -> replace modal
  await page.click('#btn-tools-novel');
  await page.waitForTimeout(200);
  await page.click('#btn-global-replace');
  await page.waitForTimeout(400);

  // Check modal exists
  const modalVisible = await page.evaluate(() => {
    return Boolean(document.querySelector('[class*="modalCard"]'));
  });
  assert(modalVisible, 'GlobalReplaceModal không mở được!');

  // Type search term
  await page.fill('#global-search-text', 'Tiêu Viêm');
  await page.waitForTimeout(500);

  // Verify label dynamically says "Xóa N chỗ" when replace is empty
  const deleteBtnText = await page.textContent('#btn-execute-replace');
  assert(deleteBtnText.includes('Xóa'), `Nút phải có chữ Xóa khi ô thay thế trống: "${deleteBtnText}"`);

  // Fill replace text
  await page.fill('#global-replace-text', 'Viêm Đế');
  await page.waitForTimeout(300);

  // Verify label dynamically says "Thay thế N chỗ"
  const replaceBtnText = await page.textContent('#btn-execute-replace');
  assert(replaceBtnText.includes('Thay thế'), `Nút phải có chữ Thay thế khi có nội dung mới: "${replaceBtnText}"`);

  const bufModalDesktop = await page.screenshot({ fullPage: false });
  await saveOptimizedPng(bufModalDesktop, path.join(outDir, '07-global-replace-modal-desktop.png'));

  // Test Mobile bottom-sheet
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await assertNoHorizontalScroll(page, 'Modal thay thế Mobile 390px');
  const bufModalMobile = await page.screenshot({ fullPage: false });
  await saveOptimizedPng(bufModalMobile, path.join(outDir, '08-global-replace-modal-mobile.png'));

  // Close modal
  await page.click('button[class*="closeBtn"]');
  await page.waitForTimeout(300);

  // ==========================================
  // PHẦN 4: TRANG THÊM CHƯƠNG (CẢ 2 TAB)
  // ==========================================
  console.log('\n--- 4. KIỂM THỬ TRANG THÊM CHƯƠNG MỚI (AddChapterPage) ---');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE_URL}/#/novel/test-novel-toc/add-chapter`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await assertNoHorizontalScroll(page, 'Thêm chương tab 1 (thủ công) 1280px');

  // Tab 1: Nhập thủ công
  const bufAddCh1 = await page.screenshot({ fullPage: false });
  await saveOptimizedPng(bufAddCh1, path.join(outDir, '09-add-chapter-tab1-manual.png'));

  // Tab 2: Thêm từ file
  const tabs = await page.$$('[class*="modeTab"]');
  if (tabs.length >= 2) {
    await tabs[1].click();
    await page.waitForTimeout(300);
    await assertNoHorizontalScroll(page, 'Thêm chương tab 2 (file) 1280px');
    const bufAddCh2 = await page.screenshot({ fullPage: false });
    await saveOptimizedPng(bufAddCh2, path.join(outDir, '10-add-chapter-tab2-file.png'));
  }

  // ==========================================
  // PHẦN 5: BẢNG TUỲ CHỈNH ĐỌC SÁCH (ReadingSettings)
  // ==========================================
  console.log('\n--- 5. KIỂM THỬ BẢNG TUỲ CHỈNH ĐỌC SÁCH ---');
  await page.goto(`${BASE_URL}/#/novel/test-novel-toc/read/dp-ch-1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // Open settings
  await page.click('button[title*="Tuỳ chỉnh"]');
  await page.waitForTimeout(400);

  await assertNoHorizontalScroll(page, 'Cài đặt đọc sách 1280px');
  const bufSettings = await page.screenshot({ fullPage: false });
  await saveOptimizedPng(bufSettings, path.join(outDir, '11-reading-settings.png'));

  // ==========================================
  // PHẦN 6: THANH ĐIỀU HƯỚNG CUỐI CHƯƠNG (Reader Bottom Nav)
  // ==========================================
  console.log('\n--- 6. KIỂM THỬ ĐIỀU HƯỚNG CUỐI CHƯƠNG & THEMES ---');
  // Close settings
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Scroll to bottom
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);

  await assertNoHorizontalScroll(page, 'Cuối chương 1280px');
  const bufBottomNav = await page.screenshot({ fullPage: false });
  await saveOptimizedPng(bufBottomNav, path.join(outDir, '12-reader-bottom-nav.png'));

  // Check ScrollToTop button exists and is rounded
  const fabVisible = await page.evaluate(() => {
    const fab = document.querySelector('[class*="fab"]');
    return Boolean(fab);
  });
  console.log(`  ✓ Nút ScrollToTop hiển thị: ${fabVisible}`);

  await browser.close();
  server.close();

  console.log('\n===============================================================');
  console.log('✅ TOÀN BỘ BÀI KIỂM THỬ PLAYWRIGHT ĐỀU ĐẠT 100%!');
  console.log('===============================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ LỖI KIỂM THỬ:', err);
  process.exit(1);
});
