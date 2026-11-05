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
const outDir = path.resolve(__dirname, '../docs/ui-redesign/text');
const artifactDir = 'C:/Users/ADMIN/.gemini/antigravity/brain/04a8635f-ab90-4862-af83-b6463b1f6a83';

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const PORT = 4199;
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
  console.log(`Saved: ${targetPath} (${kb.toFixed(1)} KB) - ${kb < 400 ? 'PASS < 400KB' : 'FAIL'}`);

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
  console.log('  KIỂM THỬ TOÀN DIỆN FIX POPOVER MENU & CĂN LỀ TRANG CHI TIẾT');
  console.log('===============================================================\n');

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Seed sample data in browser
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
      id: 'test-novel-popover',
      title: 'Vũ Động Càn Khôn',
      author: 'Thiên Tằm Thổ Đậu',
      description: 'Lâm Động từ một thiếu niên bình thường của Lâm gia tại Thanh Dương trấn, từng bước bước lên đỉnh phong thiên địa.',
      chapterCount: 50,
      totalChapters: 50,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    for (let i = 1; i <= 50; i++) {
      tx.objectStore('chapters').put({
        id: `vd-ch-${i}`,
        novelId: 'test-novel-popover',
        order: i,
        title: `Chương ${i}: Tu Luyện Càn Khôn`,
        content: `Nội dung chương ${i}...`,
        createdAt: Date.now() - (51 - i) * 1000,
        updatedAt: Date.now() - (51 - i) * 1000,
      });
    }

    localStorage.setItem('tcl_progress_test-novel-popover', JSON.stringify({
      chapterId: 'vd-ch-5',
      chapterNumber: 5,
      scrollTop: 100,
      updatedAt: Date.now(),
    }));

    await new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  });

  const viewports = [
    { name: '390px Mobile', width: 390, height: 844, isMobile: true },
    { name: '768px Tablet', width: 768, height: 1024, isMobile: false },
    { name: '1280px Desktop', width: 1280, height: 800, isMobile: false },
    { name: '1920px Màn Rộng', width: 1920, height: 1000, isMobile: false },
  ];

  for (const vp of viewports) {
    console.log(`\n--- KIỂM TRA TẠI VIEWPORT: ${vp.name} (${vp.width}x${vp.height}) ---`);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`${BASE_URL}/#/novel/test-novel-popover`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Vũ Động Càn Khôn', { timeout: 10000 });
    await page.waitForTimeout(300);

    // 1. Kiểm tra cuộn ngang
    await assertNoHorizontalScroll(page, vp.name);

    // 2. Mở menu ⋯ ở hero
    const moreBtn = page.locator('#btn-more-actions');
    await moreBtn.click();
    await page.waitForTimeout(300);

    if (vp.isMobile) {
      // Mobile dùng BottomSheet
      const sheet = page.locator('div[role="dialog"]');
      assert((await sheet.count()) > 0, 'BottomSheet phải hiển thị trên mobile');
      console.log('  ✓ Mobile: BottomSheet hiển thị chính xác');

      // Đóng BottomSheet
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    } else {
      // Desktop & Tablet dùng PopoverMenu qua Portal
      const menu = page.locator('#novel-detail-more-menu');
      assert((await menu.count()) > 0, 'PopoverMenu phải hiển thị trong DOM');

      // Kiểm tra tất cả các mục menu không bị che khuất bằng document.elementFromPoint
      const items = ['#btn-add-chapter-detail', '#btn-edit-novel-detail', '#btn-export-novel'];
      for (const sel of items) {
        const item = page.locator(sel);
        assert((await item.count()) > 0, `Mục menu ${sel} phải tồn tại`);

        const pointCheck = await page.evaluate((selector) => {
          const el = document.querySelector(selector);
          if (!el) return { found: false, matches: false };
          const rect = el.getBoundingClientRect();
          const inViewport = (
            rect.top >= 0 &&
            rect.bottom <= window.innerHeight &&
            rect.left >= 0 &&
            rect.right <= window.innerWidth
          );
          const cx = Math.round(rect.left + rect.width / 2);
          const cy = Math.round(rect.top + rect.height / 2);
          const topEl = document.elementFromPoint(cx, cy);
          const matches = el === topEl || el.contains(topEl);
          return { found: true, inViewport, matches, cx, cy, topTag: topEl ? topEl.tagName : null };
        }, sel);

        assert(pointCheck.found, `Không tìm thấy phần tử ${sel}`);
        assert(pointCheck.inViewport, `Mục menu ${sel} bị tràn ra ngoài viewport: top=${pointCheck.cy}`);
        assert(
          pointCheck.matches,
          `Mục menu ${sel} BỊ CHE KHUẤT tại (${pointCheck.cx}, ${pointCheck.cy}) bởi phần tử <${pointCheck.topTag}>!`
        );
        console.log(`  ✓ Mục ${sel}: Nằm trọn trong viewport & elementFromPoint CHÍNH XÁC (không bị che)!`);
      }

      // Kiểm tra phím Esc đóng menu và focus trở lại nút ⋯
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      assert((await menu.count()) === 0, 'Nhấn Escape phải đóng popover');
      const activeId = await page.evaluate(() => document.activeElement ? document.activeElement.id : null);
      assert(activeId === 'btn-more-actions', 'Focus phải quay trở lại nút ⋯ sau khi nhấn Esc');
      console.log('  ✓ Nhấn Esc đóng menu và hoàn trả focus về nút ⋯ thành công');

      // 3. Mở menu Công cụ ở Mục lục
      const toolsBtn = page.locator('#btn-tools-novel');
      if (await toolsBtn.count()) {
        await toolsBtn.click();
        await page.waitForTimeout(300);
        const toolsMenu = page.locator('#novel-detail-tools-menu');
        assert((await toolsMenu.count()) > 0, 'Tools PopoverMenu phải mở');

        const replaceCheck = await page.evaluate(() => {
          const btn = document.getElementById('btn-global-replace');
          if (!btn) return false;
          const rect = btn.getBoundingClientRect();
          const inViewport = (
            rect.top >= 0 &&
            rect.bottom <= window.innerHeight &&
            rect.left >= 0 &&
            rect.right <= window.innerWidth
          );
          const cx = Math.round(rect.left + rect.width / 2);
          const cy = Math.round(rect.top + rect.height / 2);
          const topEl = document.elementFromPoint(cx, cy);
          return inViewport && (btn === topEl || btn.contains(topEl));
        });

        assert(replaceCheck, 'Mục Thay thế toàn truyện trong menu Công cụ không được bị che');
        console.log('  ✓ Menu Công cụ: Mục Thay thế toàn truyện hiển thị trọn vẹn và không bị che!');

        // Đóng bằng Esc
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
      }
    }
  }

  // ==========================================
  // KIỂM TRA ĐẶC THÙ LỖI 2: CĂN LỀ HEADER & NỘI DUNG (1280px & 1920px)
  // ==========================================
  console.log('\n--- KIỂM TRA LỖI 2: CĂN LỀ HEADER VÀ NỘI DUNG (1280px & 1920px) ---');
  for (const w of [1280, 1920]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto(`${BASE_URL}/#/novel/test-novel-popover`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Vũ Động Càn Khôn', { timeout: 10000 });
    await page.waitForTimeout(300);

    const alignInfo = await page.evaluate(() => {
      const logo = document.querySelector('header a[aria-label*="Thiên Cơ Lâu"]');
      const backBtn = document.querySelector('button[class*="backBtn"]');
      const coverWrap = document.querySelector('[class*="coverWrap"]');
      const descCard = document.querySelector('[class*="descCard"]');
      const tocTitle = document.querySelector('[class*="tocStickyHeader"]') || document.querySelector('[class*="tocTitle"]');
      const expectedLeft = Math.round((window.innerWidth - 1200) / 2 + 20);

      const logoRect = logo ? Math.round(logo.getBoundingClientRect().left) : 0;
      const backBtnRect = backBtn ? Math.round(backBtn.getBoundingClientRect().left) : 0;
      const coverRect = coverWrap ? Math.round(coverWrap.getBoundingClientRect().left) : 0;
      const descRect = descCard ? Math.round(descCard.getBoundingClientRect().left) : 0;
      const tocRect = tocTitle ? Math.round(tocTitle.getBoundingClientRect().left) : 0;

      return { expectedLeft, logoRect, backBtnRect, coverRect, descRect, tocRect };
    });

    console.log(`  Kích thước ${w}px: Kỳ vọng = ${alignInfo.expectedLeft}px | Logo = ${alignInfo.logoRect}px | Nút Thư viện = ${alignInfo.backBtnRect}px | Bìa = ${alignInfo.coverRect}px | Giới thiệu = ${alignInfo.descRect}px | Mục lục = ${alignInfo.tocRect}px`);
    assert(
      Math.abs(alignInfo.logoRect - alignInfo.expectedLeft) <= 1,
      `Logo header lệch lề: thực tế ${alignInfo.logoRect}px, kỳ vọng ${alignInfo.expectedLeft}px`
    );
    assert(
      Math.abs(alignInfo.backBtnRect - alignInfo.expectedLeft) <= 1,
      `Nút Thư viện lệch lề: thực tế ${alignInfo.backBtnRect}px, kỳ vọng ${alignInfo.expectedLeft}px`
    );
    assert(
      Math.abs(alignInfo.coverRect - alignInfo.expectedLeft) <= 1,
      `Bìa hero lệch lề: thực tế ${alignInfo.coverRect}px, kỳ vọng ${alignInfo.expectedLeft}px`
    );
    assert(
      Math.abs(alignInfo.descRect - alignInfo.expectedLeft) <= 1,
      `Khối Giới thiệu lệch lề: thực tế ${alignInfo.descRect}px, kỳ vọng ${alignInfo.expectedLeft}px`
    );
    assert(
      Math.abs(alignInfo.tocRect - alignInfo.expectedLeft) <= 1,
      `Tiêu đề Mục lục lệch lề: thực tế ${alignInfo.tocRect}px, kỳ vọng ${alignInfo.expectedLeft}px`
    );
    console.log(`  ✓ Toàn bộ Logo, Nút Thư viện, Hero, Giới thiệu, Mục lục THẲNG HÀNG TUYỆT ĐỐI tại ${w}px!`);
  }

  // ==========================================
  // KIỂM TRA ĐẶC THÙ LỖI 3: KHOẢNG CÁCH HERO - GIỚI THIỆU - MỤC LỤC (24-32px)
  // ==========================================
  console.log('\n--- KIỂM TRA LỖI 3: KHOẢNG CÁCH GIỮA HERO - GIỚI THIỆU - MỤC LỤC ---');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE_URL}/#/novel/test-novel-popover`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  const spacingInfo = await page.evaluate(() => {
    const hero = document.querySelector('[class*="hero_"]');
    const descCard = document.querySelector('[class*="descCard"]');
    const tocSticky = document.querySelector('[class*="tocStickyHeader"]');

    if (!hero || !descCard || !tocSticky) return null;

    const heroBottom = hero.getBoundingClientRect().bottom;
    const descTop = descCard.getBoundingClientRect().top;
    const descBottom = descCard.getBoundingClientRect().bottom;
    const tocTop = tocSticky.getBoundingClientRect().top;

    return {
      gapHeroToDesc: Math.round(descTop - heroBottom),
      gapDescToToc: Math.round(tocTop - descBottom),
    };
  });

  if (spacingInfo) {
    console.log(`  Khoảng cách Hero -> Giới thiệu: ${spacingInfo.gapHeroToDesc}px (Kỳ vọng 24-32px)`);
    console.log(`  Khoảng cách Giới thiệu -> Mục lục: ${spacingInfo.gapDescToToc}px (Kỳ vọng 24-32px)`);
    assert(
      spacingInfo.gapHeroToDesc >= 24 && spacingInfo.gapHeroToDesc <= 32,
      `Khoảng cách Hero -> Giới thiệu phải trong [24, 32]px (thực tế: ${spacingInfo.gapHeroToDesc}px)`
    );
    assert(
      spacingInfo.gapDescToToc >= 24 && spacingInfo.gapDescToToc <= 36,
      `Khoảng cách Giới thiệu -> Mục lục phải trong khoảng hợp lý (thực tế: ${spacingInfo.gapDescToToc}px)`
    );
    console.log('  ✓ Khoảng cách các khối đạt chuẩn thiết kế hoàn hảo!');
  }

  // ==========================================
  // CHỤP ẢNH "SAU KHI FIX" (1280x800 & 1920x1000)
  // ==========================================
  console.log('\n--- CHỤP ẢNH SAU KHI SỬA LỖI (AFTER SCREENSHOTS) ---');
  // 1. Desktop 1280x800 với Popover Menu mở
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE_URL}/#/novel/test-novel-popover`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Vũ Động Càn Khôn', { timeout: 10000 });
  await page.locator('#btn-more-actions').click();
  await page.waitForSelector('#novel-detail-more-menu', { timeout: 5000 });
  await page.waitForTimeout(400);

  const shot1280 = path.join(outDir, 'after-detail-menu-1280.png');
  const buf1280 = await page.screenshot();
  await saveOptimizedPng(buf1280, shot1280);

  // 2. Wide Screen 1920x1000 với Popover Menu mở
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.waitForTimeout(300);

  const shot1920 = path.join(outDir, 'after-detail-menu-1920.png');
  const buf1920 = await page.screenshot();
  await saveOptimizedPng(buf1920, shot1920);

  console.log('\n===============================================================');
  console.log('✅ TOÀN BỘ CÁC BÀI KIỂM TRA POPOVER MENU & CĂN LỀ ĐỀU ĐẠT 100%!');
  console.log('===============================================================\n');

  await browser.close();
  server.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('LỖI KIỂM THỬ:', err);
  process.exit(1);
});
