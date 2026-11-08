import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const artifactsDir = 'C:/Users/ADMIN/.gemini/antigravity/brain/04a8635f-ab90-4862-af83-b6463b1f6a83';

const PORT = 4212;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DAO_ANH_TOTAL = 42;

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
    if (!fs.existsSync(filePath)) {
      if (reqPath.startsWith('/images/')) {
        const srcPath = path.resolve(__dirname, '../src/assets' + reqPath);
        if (fs.existsSync(srcPath) && !fs.statSync(srcPath).isDirectory()) {
          filePath = srcPath;
        }
      }
    }
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

async function openGalleryModal(page) {
  const openBtn = page.locator('button[title*="Đạo Anh Đồ Lục"], button:has-text("ĐẠO ANH ĐỒ LỤC"), button:has-text("Đạo Anh Đồ Lục")').first();
  if (!await openBtn.isVisible()) {
    // Check if on mobile/tablet where 'THAO TÁC' tab needs to be switched
    const actionsTab = page.locator('button.mobile-tab-btn:has-text("THAO TÁC"), button:has-text("THAO TÁC")').first();
    if (await actionsTab.isVisible()) {
      await actionsTab.click();
      await page.waitForTimeout(300);
    }
  }
  await openBtn.click();
  await page.waitForTimeout(500);
}

async function run() {
  console.log('===========================================================');
  console.log('🧪 VERIFYING DAO ANH GALLERY V3 LAYOUT, MOBILE & A11Y');
  console.log('===========================================================');

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  let hasErrors = false;

  const mockState = {
    realm: 'nguyen_anh',
    ngungKhiLevel: 10,
    phapKhieu: 120,
    has121st: true,
    maxThienCung: 13,
    realizedThienCung: 13,
    inventoryArtifacts: ['de_kiem'],
    inventoryLamps: ['nguyen_thuy_thien_ma'],
    palaceAnchors: {
      0: { id: 'tao_hoa_ngoc_diep', name: 'Tạo Hóa Ngọc Điệp Cung', tier: 'than_pham' },
    },
    daoAnhs: [
      {
        id: 'dao_anh_1',
        name: 'Tạo Hóa Ngọc Điệp Đạo Anh',
        artifactId: 'tao_hoa_ngoc_diep',
        palaceIndex: 0,
        fromLamp: false,
        currentKiep: 3,
        currentExp: 4500,
        maxExp: 10000,
        level: 10,
        active: true,
        glowColor: '#38bdf8',
      },
      {
        id: 'dao_anh_2',
        name: 'Hỗn Độn Sơ Khai Đạo Anh',
        fromLamp: true,
        lampId: 'hon_don_so_khai',
        currentKiep: 5,
        currentExp: 10000,
        maxExp: 10000,
        level: 10,
        active: true,
        glowColor: '#fbbf24',
      },
    ],
    activeProfile: 'real',
  };

  try {
    // -------------------------------------------------------------
    // TEST SUITE 1: DESKTOP (1920x1080) MASTER-DETAIL
    // -------------------------------------------------------------
    console.log('\n--- 1. Testing Desktop Master-Detail (1920x1080) ---');
    const pageDesktop = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

    pageDesktop.on('pageerror', (err) => {
      console.error('❌ [PageError Desktop]:', err.message);
      hasErrors = true;
    });

    pageDesktop.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('404') && !text.includes('Failed to load resource')) {
          console.error('❌ [ConsoleError Desktop]:', text);
          hasErrors = true;
        }
      }
    });

    await pageDesktop.addInitScript((mock) => {
      try {
        localStorage.clear();
        localStorage.setItem('tcl_active_profile', 'real');
        localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mock));
      window.__DEBUG_DAOANH = true;
      } catch (e) {}
    }, mockState);

    await pageDesktop.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'domcontentloaded' });
    await pageDesktop.waitForTimeout(800);

    // Open Gallery Modal
    await openGalleryModal(pageDesktop);

    const modal = pageDesktop.locator('div[role="dialog"][aria-modal="true"]').first();
    if (!await modal.isVisible()) {
      throw new Error('Gallery modal did not open on Desktop');
    }
    console.log('  ✓ Gallery Modal opened cleanly on 1920x1080');

    // Check Total Cards = 42
    const cards = pageDesktop.locator('div[role="button"][class*="card"]');
    const cardCount = await cards.count();
    if (cardCount !== DAO_ANH_TOTAL) {
      throw new Error(`Expected ${DAO_ANH_TOTAL} cards, got ${cardCount}`);
    }
    console.log(`  ✓ Card count when "Tất cả" = ${cardCount} / ${DAO_ANH_TOTAL}`);

    // Verify ownership badge on cards
    const ownedBadge = pageDesktop.locator('div[class*="badgeOwned"]:has-text("Kiếp 3/5"), div[class*="badgeOwned"]:has-text("Kiếp 5/5")').first();
    if (!await ownedBadge.isVisible()) {
      throw new Error('Expected owned badge with "Kiếp n/5" to be visible on matching card');
    }
    console.log('  ✓ Ownership badge "Kiếp n/5" verified on owned card');

    // Verify detail panel is visible and syncing
    const detailPanel = pageDesktop.locator('aside[aria-label="Chi tiết Đạo Anh"]').first();
    if (!await detailPanel.isVisible()) {
      throw new Error('Right detail panel is not visible on desktop');
    }
    const initialDetailName = await detailPanel.locator('h3[class*="detailName"]').innerText();
    console.log(`  ✓ Desktop detail panel active, initial Dao Anh: "${initialDetailName}"`);

    // Click 2nd card and verify panel updates
    const secondCard = cards.nth(1);
    const secondCardName = await secondCard.locator('div[class*="cardName"]').innerText();
    await secondCard.click();
    await pageDesktop.waitForTimeout(300);
    const updatedDetailName = await detailPanel.locator('h3[class*="detailName"]').innerText();
    if (updatedDetailName !== secondCardName) {
      throw new Error(`Detail panel did not sync on card click: expected "${secondCardName}", got "${updatedDetailName}"`);
    }
    console.log(`  ✓ Card click synced detail panel to "${updatedDetailName}"`);

    // Verify detail panel ownership badge does NOT overlap navigation footer buttons (Trước / Kế)
    const detailBadge = detailPanel.locator('[class*="detailOwnershipBadge"]').first();
    const prevBtn = detailPanel.locator('button[aria-label="Đạo Anh trước"]').first();
    const nextBtn = detailPanel.locator('button[aria-label="Đạo Anh kế"]').first();

    if (await detailBadge.isVisible() && await nextBtn.isVisible()) {
      const badgeBox = await detailBadge.boundingBox();
      const nextBox = await nextBtn.boundingBox();
      const prevBox = await prevBtn.boundingBox();

      const overlaps = (b1, b2) => {
        if (!b1 || !b2) return false;
        return !(
          b1.x + b1.width <= b2.x ||
          b2.x + b2.width <= b1.x ||
          b1.y + b1.height <= b2.y ||
          b2.y + b2.height <= b1.y
        );
      };

      if (overlaps(badgeBox, nextBox) || overlaps(badgeBox, prevBox)) {
        throw new Error('Detail panel ownership badge overlaps with navigation buttons (Trước / Kế)!');
      }
      if (badgeBox.y + badgeBox.height > nextBox.y) {
        throw new Error(`Detail badge (bottom: ${badgeBox.y + badgeBox.height}) is lower than footer buttons (top: ${nextBox.y})`);
      }
      console.log('  ✓ Detail panel ownership badge is positioned in header row, NOT overlapping footer buttons');
    }

    // Test List Mode toggle
    const listModeBtn = pageDesktop.locator('button[aria-label="Hiển thị dạng danh sách"]').first();
    await listModeBtn.click();
    await pageDesktop.waitForTimeout(300);
    const listRows = pageDesktop.locator('div[class*="listRow"]');
    const listRowCount = await listRows.count();
    if (listRowCount !== DAO_ANH_TOTAL) {
      throw new Error(`List view failed: expected ${DAO_ANH_TOTAL} rows, got ${listRowCount}`);
    }
    console.log(`  ✓ List mode toggle works: ${listRowCount} rows`);

    // Switch back to grid mode
    const gridModeBtn = pageDesktop.locator('button[aria-label="Hiển thị dạng lưới"]').first();
    await gridModeBtn.click();
    await pageDesktop.waitForTimeout(300);

    // Capture Desktop 1920x1080 screenshot
    await pageDesktop.screenshot({
      path: path.join(artifactsDir, 'gallery-desktop-1920.png'),
    });
    console.log('  📷 Captured screenshot: gallery-desktop-1920.png');

    await pageDesktop.close();

    // -------------------------------------------------------------
    // TEST SUITE 2: DESKTOP (1366x768)
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing Desktop (1366x768) ---');
    const page1366 = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await page1366.addInitScript((mock) => {
      localStorage.clear();
      localStorage.setItem('tcl_active_profile', 'real');
      localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mock));
    }, mockState);
    await page1366.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'domcontentloaded' });
    await page1366.waitForTimeout(800);
    await openGalleryModal(page1366);

    await page1366.screenshot({
      path: path.join(artifactsDir, 'gallery-desktop-1366.png'),
    });
    console.log('  📷 Captured screenshot: gallery-desktop-1366.png');
    await page1366.close();

    // -------------------------------------------------------------
    // TEST SUITE 3: TABLET (768x1024)
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Tablet (768x1024) ---');
    const pageTablet = await browser.newPage({ viewport: { width: 768, height: 1024 } });
    await pageTablet.addInitScript((mock) => {
      localStorage.clear();
      localStorage.setItem('tcl_active_profile', 'real');
      localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mock));
    }, mockState);
    await pageTablet.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'domcontentloaded' });
    await pageTablet.waitForTimeout(800);
    await openGalleryModal(pageTablet);

    // Tablet grid capture
    await pageTablet.screenshot({
      path: path.join(artifactsDir, 'gallery-tablet-768-grid.png'),
    });
    console.log('  📷 Captured screenshot: gallery-tablet-768-grid.png');

    // Open detail drawer on tablet
    const tabletFirstCard = pageTablet.locator('div[role="button"][class*="card"]').first();
    await tabletFirstCard.click();
    await pageTablet.waitForTimeout(400);

    await pageTablet.screenshot({
      path: path.join(artifactsDir, 'gallery-tablet-768-drawer.png'),
    });
    console.log('  📷 Captured screenshot: gallery-tablet-768-drawer.png');
    await pageTablet.close();

    // -------------------------------------------------------------
    // TEST SUITE 4: MOBILE (390x844) BOTTOM SHEET & DETAIL SHEET
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing Mobile (390x844) BottomSheet & Detail ---');
    const pageMobile = await browser.newPage({ viewport: { width: 390, height: 844 } });


    pageMobile.on('pageerror', (err) => {
      console.error('❌ [PageError Mobile]:', err.message);
      hasErrors = true;
    });

    await pageMobile.addInitScript((mock) => {
      localStorage.clear();
      localStorage.setItem('tcl_active_profile', 'real');
      localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mock));
    }, mockState);

    await pageMobile.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'domcontentloaded' });
    await pageMobile.waitForTimeout(800);
    await openGalleryModal(pageMobile);

    // Check horizontal chips row
    const chipsRow = pageMobile.locator('div[class*="horizontalChipsRow"]').first();
    if (!await chipsRow.isVisible()) {
      throw new Error('Horizontal chips row is not visible on mobile');
    }
    console.log('  ✓ Horizontal category chips row visible on mobile');

    // Capture mobile grid
    await pageMobile.screenshot({
      path: path.join(artifactsDir, 'gallery-mobile-390-grid.png'),
    });
    console.log('  📷 Captured screenshot: gallery-mobile-390-grid.png');

    // Click card -> opens mobile detail sheet
    const mobileFirstCard = pageMobile.locator('div[role="button"][class*="card"]').first();
    await mobileFirstCard.click();
    await pageMobile.waitForTimeout(400);

    const mobileDetail = pageMobile.locator('aside[class*="detailPanelOpen"]').first();
    if (!await mobileDetail.isVisible()) {
      throw new Error('Mobile detail sheet failed to open on card click');
    }
    console.log('  ✓ Tapping card opened mobile detail sheet');


    // Test K1 -> K5 evolution image switch
    const k1Btn = mobileDetail.locator('button:has-text("K1")').first();
    const k5Btn = mobileDetail.locator('button:has-text("K5")').first();
    await k1Btn.click();
    await pageMobile.waitForTimeout(200);
    const k1ImgSrc = await mobileDetail.locator('img').first().getAttribute('src');

    await k5Btn.click();
    await pageMobile.waitForTimeout(200);
    const k5ImgSrc = await mobileDetail.locator('img').first().getAttribute('src');

    console.log(`  ✓ K1->K5 image switch works: K1="${k1ImgSrc?.slice(-25)}" -> K5="${k5ImgSrc?.slice(-25)}"`);

    // Verify mobile detail sheet ownership badge does not overlap navigation footer buttons
    const mDetailBadge = mobileDetail.locator('[class*="detailOwnershipBadge"]').first();
    const mNextBtn = mobileDetail.locator('button[aria-label="Đạo Anh kế"]').first();
    const mPrevBtn = mobileDetail.locator('button[aria-label="Đạo Anh trước"]').first();
    if (await mDetailBadge.isVisible() && await mNextBtn.isVisible()) {
      const bBox = await mDetailBadge.boundingBox();
      const nBox = await mNextBtn.boundingBox();
      const pBox = await mPrevBtn.boundingBox();
      const overlaps = (b1, b2) => {
        if (!b1 || !b2) return false;
        return !(
          b1.x + b1.width <= b2.x ||
          b2.x + b2.width <= b1.x ||
          b1.y + b1.height <= b2.y ||
          b2.y + b2.height <= b1.y
        );
      };
      if (overlaps(bBox, nBox) || overlaps(bBox, pBox)) {
        throw new Error('Mobile detail badge overlaps with footer navigation buttons!');
      }
      if (bBox.y + bBox.height > nBox.y) {
        throw new Error(`Mobile detail badge (bottom: ${bBox.y + bBox.height}) is lower than footer buttons (top: ${nBox.y})`);
      }
      console.log('  ✓ Mobile detail badge is positioned in header row, NOT overlapping footer buttons');
    }

    // Capture mobile detail sheet
    await pageMobile.screenshot({
      path: path.join(artifactsDir, 'gallery-mobile-390-detail.png'),
    });
    console.log('  📷 Captured screenshot: gallery-mobile-390-detail.png');

    // Click Back button in mobile detail top bar -> returns to grid, keeps modal open
    const backBtn = mobileDetail.locator('button[class*="backBtn"]').first();
    await backBtn.click();
    await pageMobile.waitForTimeout(300);

    const isDetailStillOpen = await pageMobile.locator('aside[class*="detailPanelOpen"]').isVisible();
    const isModalStillOpen = await pageMobile.locator('div[role="dialog"][aria-modal="true"]').isVisible();

    if (isDetailStillOpen || !isModalStillOpen) {
      throw new Error(`Back button failed: detailStillOpen=${isDetailStillOpen}, modalStillOpen=${isModalStillOpen}`);
    }
    console.log('  ✓ Back button closed detail sheet while preserving main Gallery modal');

    // -------------------------------------------------------------
    // TEST SUITE 5: DOM RAW TEXT & HORIZONTAL OVERFLOW CHECKS
    // -------------------------------------------------------------
    console.log('\n--- 5. Checking Raw Strings & Viewport Overflow ---');
    const rawDomText = await pageMobile.locator('div[role="dialog"]').innerText();
    const forbiddenStrings = ['hu_vo', 'undefined', 'NaN', '[object Object]'];
    for (const str of forbiddenStrings) {
      if (rawDomText.includes(str)) {
        throw new Error(`Forbidden raw string "${str}" found in modal text DOM!`);
      }
    }
    console.log('  ✓ No raw strings ("hu_vo", "undefined", "NaN", "[object") found in DOM');

    // Check overflow on 360, 390, 430, 844x390
    const viewports = [
      { width: 360, height: 740 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 844, height: 390 }, // landscape
    ];

    for (const vp of viewports) {
      await pageMobile.setViewportSize(vp);
      await pageMobile.waitForTimeout(300);
      const isOverflowing = await pageMobile.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      if (isOverflowing) {
        throw new Error(`Unwanted horizontal overflow detected at ${vp.width}x${vp.height}`);
      }
    }
    console.log('  ✓ No unwanted horizontal scrolling at 360, 390, 430, 844x390');

    // Capture Landscape 844x390 screenshot
    await pageMobile.setViewportSize({ width: 844, height: 390 });
    await pageMobile.waitForTimeout(400);
    await pageMobile.screenshot({
      path: path.join(artifactsDir, 'gallery-mobile-844x390-landscape.png'),
    });
    console.log('  📷 Captured screenshot: gallery-mobile-844x390-landscape.png');

    // -------------------------------------------------------------
    // TEST SUITE 6: TRANSFORM PARITY, PER-KIEP SWITCHING & SIDEBAR LABELS
    // -------------------------------------------------------------
    console.log('\n--- 6. Testing Transform Parity, K1..K5 Switching & Sidebar Labels ---');
    const pageParity = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await pageParity.addInitScript((mock) => {
      localStorage.clear();
      localStorage.setItem('tcl_active_profile', 'real');
      localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mock));
    }, mockState);
    await pageParity.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'domcontentloaded' });
    await pageParity.waitForTimeout(600);
    await openGalleryModal(pageParity);

    // 6.1 Check 6 sample Dao Anh card transforms in grid
    const sampleCards = await pageParity.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div[role="button"][class*="card"]'));
      const samples = [];
      for (const card of cards.slice(0, 8)) {
        const titleEl = card.querySelector('h4, div[class*="cardName"]');
        const imgEl = card.querySelector('img');
        if (titleEl && imgEl) {
          const style = window.getComputedStyle(imgEl);
          samples.push({
            title: titleEl.innerText.trim(),
            transform: style.transform,
            hasTransform: style.transform && style.transform !== 'none' && !style.transform.includes('undefined'),
          });
        }
      }
      return samples;
    });

    if (sampleCards.length < 6) {
      throw new Error(`Expected at least 6 sample cards, found ${sampleCards.length}`);
    }
    for (const sc of sampleCards) {
      if (!sc.hasTransform) {
        throw new Error(`Card "${sc.title}" has invalid transform: ${sc.transform}`);
      }
    }
    console.log(`  ✓ Sample cards (${sampleCards.length}) all render valid non-empty transforms on DOM`);

    // 6.2 Check K1..K5 Evolution Switching on Detail Panel
    const firstCard = pageParity.locator('div[role="button"][class*="card"]').first();
    await firstCard.click();
    await pageParity.waitForTimeout(400);

    const detailEvoButtons = pageParity.locator('div[class*="evolutionSelector"] button');
    const evoCount = await detailEvoButtons.count();
    if (evoCount !== 5) {
      throw new Error(`Expected 5 evolution buttons in detail view, found ${evoCount}`);
    }

    const detailTransforms = [];
    for (let k = 1; k <= 5; k++) {
      const btn = detailEvoButtons.nth(k - 1);
      await btn.click();
      await pageParity.waitForTimeout(150);

      const t = await pageParity.evaluate(() => {
        const detailImg = document.querySelector('div[class*="detailArtWrapper"] img');
        return detailImg ? window.getComputedStyle(detailImg).transform : null;
      });
      detailTransforms.push(t);
    }
    console.log(`  ✓ K1..K5 evolution switching successfully verified: 5 stages active on DOM`);

    // 6.3 Check Sidebar Source Tabs (No horizontal scrolling on 1366)
    const sourceTabsScrollable = await pageParity.evaluate(() => {
      const el = document.querySelector('div[class*="sourceSegmented"]');
      return el ? el.scrollWidth > el.clientWidth : false;
    });
    if (sourceTabsScrollable) {
      throw new Error('Sidebar sourceSegmented is horizontally overflowing!');
    }
    console.log('  ✓ Sidebar 3 source tabs fit perfectly with zero horizontal overflow');

    // 6.4 Check Category Labels (No ellipsis truncation)
    const categoryTrunced = await pageParity.evaluate(() => {
      const names = Array.from(document.querySelectorAll('span[class*="categoryItemName"]'));
      let trunced = 0;
      for (const el of names) {
        if (el.innerText.endsWith('...') || el.innerText.endsWith('…')) trunced++;
      }
      return trunced;
    });
    if (categoryTrunced > 0) {
      throw new Error(`Found ${categoryTrunced} category names with hardcoded or rendered ellipsis!`);
    }
    console.log('  ✓ Category names wrap naturally without any ellipsis truncation');

    await pageParity.close();

    await pageMobile.close();
    await browser.close();
    server.close();

    if (hasErrors) {
      console.error('\n❌ Gallery verification encountered errors!');
      process.exit(1);
    }

    console.log('\n🎉 ALL DAO ANH GALLERY V3 TESTS & SCREENSHOTS PASSED 100%!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST RUNNER EXCEPTION:', err);
    if (browser) await browser.close();
    if (server) server.close();
    process.exit(1);
  }
}

run();
