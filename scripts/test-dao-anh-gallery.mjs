import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');

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

async function run() {
  console.log('===========================================================');
  console.log('🧪 VERIFYING DAO ANH GALLERY MODAL FUNCTIONALITY & RESPONSIVE');
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
    daoAnhs: Array.from({ length: 13 }).map((_, i) => ({
      id: `dao_anh_${i + 1}`,
      name: `Đạo Anh #${i + 1}`,
      currentKiep: 5,
      level: 10,
      active: true,
      glowColor: '#fbbf24',
    })),
    activeProfile: 'real',
  };

  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

    page.on('pageerror', (err) => {
      console.error('❌ [PageError]:', err.message);
      hasErrors = true;
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore 404 image load errors if local assets aren't yet in dist
        if (!text.includes('404') && !text.includes('Failed to load resource')) {
          console.error('❌ [ConsoleError]:', text);
          hasErrors = true;
        }
      }
    });

    // 1. Seed Real Profile via addInitScript
    await page.addInitScript((mock) => {
      try {
        localStorage.clear();
        localStorage.setItem('tcl_active_profile', 'real');
        localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mock));
      } catch (e) {}
    }, mockState);

    // Navigate to CultivationWorkspace
    await page.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Open Gallery Modal
    const openBtn = page.locator('button[title*="Đạo Anh Đồ Lục"], button:has-text("ĐẠO ANH ĐỒ LỤC")').first();
    await openBtn.waitFor({ state: 'visible', timeout: 5000 });
    await openBtn.click();
    await page.waitForTimeout(500);

    // Verify Modal Opened
    const modal = page.locator('div[role="dialog"][aria-modal="true"]').first();
    const isModalVisible = await modal.isVisible();
    if (!isModalVisible) {
      throw new Error('Dao Anh Gallery Modal failed to open in Real profile');
    }
    console.log('✅ 1. Gallery Modal opened successfully in Real profile.');

    // 2. Check card count in 'Tất Cả'
    const cards = page.locator('div[class*="daoAnhCard"]');
    const cardCount = await cards.count();
    if (cardCount !== DAO_ANH_TOTAL) {
      throw new Error(`Expected ${DAO_ANH_TOTAL} cards, got ${cardCount}`);
    }
    console.log(`✅ 2. Card count matches DAO_ANH_TOTAL: ${cardCount}/${DAO_ANH_TOTAL}.`);

    // 3. Test Category Filter
    const maDaoChip = page.locator('button[class*="categoryChip"][title*="Ma Đạo"]').first();
    await maDaoChip.click();
    await page.waitForTimeout(300);
    const maDaoExpected = 8;
    const maDaoCardCount = await page.locator('div[class*="daoAnhCard"]').count();
    if (maDaoCardCount !== maDaoExpected) {
      throw new Error(`Category ma_dao filter failed: expected ${maDaoExpected}, got ${maDaoCardCount}`);
    }
    console.log(`✅ 3. Category filter works correctly: ma_dao -> ${maDaoCardCount} cards.`);

    // Reset to 'all' category
    const allCategoryChip = page.locator('button[class*="categoryChip"]').first();
    await allCategoryChip.click();
    await page.waitForTimeout(300);

    // 4. Test Search
    const searchInput = page.locator('input[aria-label="Tìm kiếm Đạo Anh"]');
    await searchInput.fill('Nguyên Thủy');
    await page.waitForTimeout(300);
    const searchCount = await page.locator('div[class*="daoAnhCard"]').count();
    if (searchCount === 0) {
      throw new Error('Search for "Nguyên Thủy" returned 0 results');
    }
    console.log(`✅ 4. Search works correctly: "Nguyên Thủy" returned ${searchCount} results.`);

    // Clear search
    const clearSearchBtn = page.locator('button[aria-label="Xóa tìm kiếm"]');
    await clearSearchBtn.click();
    await page.waitForTimeout(300);

    // 5. Test View Mode (Grid <-> List)
    const listBtn = page.locator('button[aria-label="Hiển thị dạng danh sách"]');
    await listBtn.click();
    await page.waitForTimeout(300);
    const listRows = page.locator('div[class*="listItemRow"]');
    const listCount = await listRows.count();
    if (listCount !== DAO_ANH_TOTAL) {
      throw new Error(`List view failed: expected ${DAO_ANH_TOTAL} rows, got ${listCount}`);
    }
    console.log(`✅ 5. List view toggle works correctly: ${listCount} rows.`);

    // Switch back to grid
    const gridBtn = page.locator('button[aria-label="Hiển thị dạng thẻ"]');
    await gridBtn.click();
    await page.waitForTimeout(300);

    // 6. Test Spotlight Inspection
    const firstCard = page.locator('div[class*="daoAnhCard"]').first();
    await firstCard.click();
    await page.waitForTimeout(500);

    const spotlight = page.locator('div[class*="spotlightDialog"]');
    const isSpotlightVisible = await spotlight.isVisible();
    if (!isSpotlightVisible) {
      throw new Error('Spotlight dialog failed to open on card click');
    }

    // Tribulation K1-K5
    const k3Btn = spotlight.locator('button[aria-label="Kiếp 3"]');
    await k3Btn.click();
    await page.waitForTimeout(200);
    const currentKiepText = await spotlight.locator('strong[class*="haloCurrentKiep"]').innerText();
    if (!currentKiepText.includes('Kiếp 3')) {
      throw new Error(`Tribulation preview failed: expected Kiếp 3, got "${currentKiepText}"`);
    }

    // Prev / Next button navigation
    const nextBtn = spotlight.locator('button[aria-label="Đạo Anh kế tiếp"]');
    const initialName = await spotlight.locator('h2[class*="spotlightName"]').innerText();
    await nextBtn.click();
    await page.waitForTimeout(200);
    const nextName = await spotlight.locator('h2[class*="spotlightName"]').innerText();
    if (initialName === nextName) {
      throw new Error('Spotlight next navigation failed to update Dao Anh');
    }

    // Arrow Left / Right key navigation
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(200);
    const prevName = await spotlight.locator('h2[class*="spotlightName"]').innerText();
    if (prevName !== initialName) {
      throw new Error(`ArrowLeft navigation failed: expected "${initialName}", got "${prevName}"`);
    }
    console.log('✅ 6. Spotlight preview, K1-K5 halo switcher, Next/Prev and Arrow keys work.');

    // ESC to close spotlight
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const spotlightStillOpen = await spotlight.isVisible();
    if (spotlightStillOpen) {
      throw new Error('Escape key failed to close spotlight dialog');
    }
    console.log('✅ 7. ESC successfully closed spotlight dialog.');

    // 8. Raw text scan: Ensure no raw icon names like "crown", "orb", "yin-yang", "sparkle"
    const modalText = await modal.innerText();
    const forbiddenRawWords = ['crown', 'orb', 'yin-yang', 'sparkle', 'hourglass', 'mist'];
    for (const word of forbiddenRawWords) {
      // Check for whole word occurrences in lowercased text
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      if (regex.test(modalText)) {
        throw new Error(`Raw icon key "${word}" found rendered as visible text in modal!`);
      }
    }
    console.log('✅ 8. No raw icon keys found in modal innerText.');

    // 9. ESC to close modal
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const modalStillOpen = await modal.isVisible();
    if (modalStillOpen) {
      throw new Error('Escape key failed to close Dao Anh Gallery modal');
    }
    console.log('✅ 9. ESC successfully closed main Gallery modal.');

    // 10. Check SanctumPage trigger
    await page.goto(`${BASE_URL}/#/sanctum`);
    await page.waitForTimeout(800);
    const sanctumGalleryBtn = page.locator('button:has-text("Đạo Anh Đồ Lục")').first();
    if (await sanctumGalleryBtn.isVisible()) {
      await sanctumGalleryBtn.click();
      await page.waitForTimeout(400);
      const isSanctumModalOpen = await page.locator('div[role="dialog"][aria-modal="true"]').first().isVisible();
      if (!isSanctumModalOpen) {
        throw new Error('Failed to open Dao Anh Gallery Modal from SanctumPage');
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      console.log('✅ 10. Gallery Modal opens and closes properly from SanctumPage (#/sanctum).');
    }

    // 11. Check Sandbox Profile
    await page.evaluate((mock) => {
      localStorage.setItem('tcl_active_profile', 'sandbox');
      localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify({ ...mock, activeProfile: 'sandbox' }));
    }, mockState);
    await page.goto(`${BASE_URL}/#/cultivation`);
    await page.waitForTimeout(800);
    const sandboxOpenBtn = page.locator('button[title*="Đạo Anh Đồ Lục"], button:has-text("ĐẠO ANH ĐỒ LỤC")').first();
    await sandboxOpenBtn.click();
    await page.waitForTimeout(400);
    const isSandboxModalOpen = await page.locator('div[role="dialog"][aria-modal="true"]').first().isVisible();
    if (!isSandboxModalOpen) {
      throw new Error('Failed to open Dao Anh Gallery Modal in Sandbox profile');
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    console.log('✅ 11. Gallery Modal opens and closes properly in Sandbox profile.');

    // 12. Check Responsive & No Horizontal Overflow
    const testViewports = [
      { name: 'Desktop 1920x1080', width: 1920, height: 1080 },
      { name: 'Laptop 1366x768', width: 1366, height: 768 },
      { name: 'Tablet 768x1024', width: 768, height: 1024 },
      { name: 'Mobile 390x844', width: 390, height: 844 },
    ];

    for (const vp of testViewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      if (vp.width <= 1024) {
        const actionsTab = page.locator('button.mobile-tab-btn:has-text("THAO TÁC")').first();
        if (await actionsTab.isVisible()) {
          await actionsTab.click();
          await page.waitForTimeout(300);
        }
      }
      await sandboxOpenBtn.click();
      await page.waitForTimeout(300);

      const hasHScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth;
      });

      if (hasHScroll) {
        throw new Error(`Horizontal scrollbar detected at ${vp.name}!`);
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
    console.log('✅ 12. Responsive checks passed across 1920, 1366, 768, 390 (no horizontal overflow).');

    await browser.close();
    server.close();

    if (hasErrors) {
      console.error('❌ TEST FAILED with errors.');
      process.exit(1);
    } else {
      console.log('🎉 ALL DAO ANH GALLERY TESTS PASSED SUCCESSFULLY!');
      process.exit(0);
    }
  } catch (err) {
    console.error('❌ TEST EXCEPTION:', err);
    if (browser) await browser.close();
    if (server) server.close();
    process.exit(1);
  }
}

run();
