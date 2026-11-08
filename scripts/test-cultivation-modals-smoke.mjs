import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');

const PORT = 4213;
const BASE_URL = `http://127.0.0.1:${PORT}`;

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

const mockNguyenAnhState = {
  realm: 'nguyen_anh',
  ngungKhiLevel: 10,
  phapKhieu: 120,
  has121st: true,
  maxThienCung: 13,
  realizedThienCung: 13,
  currentTargetDaoAnhId: 'dao_anh_1',
  inventoryArtifacts: ['de_kiem', 'tam_thu_dao'],
  palaceAnchors: {
    0: { id: 'tao_hoa_ngoc_diep', name: 'Tạo Hóa Ngọc Điệp Cung', tier: 'than_pham' },
    1: { id: 'tran_nguc_minh_vuong_the', name: 'Trấn Ngục Minh Vương Cung', tier: 'than_pham' },
  },
  daoAnhs: Array.from({ length: 13 }).map((_, i) => ({
    id: `dao_anh_${i + 1}`,
    name: `Đạo Anh #${i + 1}`,
    palaceIndex: 12 - i,
    fromLamp: false,
    artifactId: i === 0 ? 'tao_hoa_ngoc_diep' : (i === 1 ? 'tran_nguc_minh_vuong_the' : 'tao_hoa_ngoc_diep'),
    currentKiep: 3,
    currentExp: 2000,
    maxExp: 10000,
    level: 10,
    active: true,
    glowColor: '#fbbf24',
  })),
};

const mockLinhTangState = {
  realm: 'linh_tang',
  ngungKhiLevel: 10,
  phapKhieu: 120,
  has121st: true,
  maxThienCung: 13,
  realizedThienCung: 13,
  linhTangs: [
    { id: 'tang_1', name: 'Thận Tàng Môn', isGateOpen: true, artifactId: 'de_kiem', currentKiep: 5, isInitialized: true, sourceDaoAnhName: 'Đạo Anh #1' },
    { id: 'tang_2', name: 'Can Tàng Môn', isGateOpen: true, artifactId: 'hoang_tuyen_bi_ngan', currentKiep: 5, isInitialized: true, sourceDaoAnhName: 'Đạo Anh #2' },
    { id: 'tang_3', name: 'Tỳ Tàng Môn', isGateOpen: true, artifactId: 'de_kiem', currentKiep: 5, isInitialized: true, sourceDaoAnhName: 'Đạo Anh #3' },
    { id: 'tang_4', name: 'Phế Tàng Môn', isGateOpen: true, artifactId: 'hoang_tuyen_bi_ngan', currentKiep: 5, isInitialized: true, sourceDaoAnhName: 'Đạo Anh #4' },
    { id: 'tang_5', name: 'Tâm Tàng Môn', isGateOpen: true, artifactId: 'de_kiem', currentKiep: 5, isInitialized: true, sourceDaoAnhName: 'Đạo Anh #5' },
  ],
  daoAnhs: Array.from({ length: 13 }).map((_, i) => ({
    id: `dao_anh_${i + 1}`,
    name: `Đạo Anh #${i + 1}`,
    currentKiep: 5,
    level: 10,
    active: true,
    glowColor: '#fbbf24',
  })),
};

async function testProfile(browser, profileName, state) {
  console.log(`\n--- Testing Cultivation Modals Smoke for Profile: [${profileName.toUpperCase()}] ---`);
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  let errors = [];

  page.on('pageerror', (err) => {
    console.error(`❌ [PageError in ${profileName}]:`, err.message);
    errors.push(`PageError: ${err.message}`);
  });

  page.on('console', (msg) => {
    if (msg.type === 'error') {
      const text = msg.text();
      if (!text.includes('404') && !text.includes('Failed to load resource')) {
        console.error(`❌ [ConsoleError in ${profileName}]:`, text);
        errors.push(`ConsoleError: ${text}`);
      }
    }
  });

  await page.addInitScript(({ pName, sData }) => {
    try {
      localStorage.clear();
      localStorage.setItem('tcl_active_profile', pName);
      const stateKey = pName === 'sandbox' ? 'tcl_cultivation_state_v3__sandbox' : 'tcl_cultivation_state_v3';
      localStorage.setItem(stateKey, JSON.stringify({ ...sData, activeProfile: pName }));
    } catch (e) {}
  }, { pName: profileName, sData: state });

  // 1. Open Cultivation Workspace
  await page.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  // 2. Test Modal 1: Dao Anh Gallery Modal
  const galleryBtn = page.locator('button[title*="Đạo Anh Đồ Lục"], button:has-text("ĐẠO ANH ĐỒ LỤC")').first();
  if (await galleryBtn.isVisible()) {
    await galleryBtn.click();
    await page.waitForTimeout(400);
    const galleryModal = page.locator('div[role="dialog"][aria-modal="true"]').first();
    if (!await galleryModal.isVisible()) {
      errors.push('DaoAnhGalleryModal did not become visible');
    } else {
      console.log(`  ✓ [${profileName}] DaoAnhGalleryModal opened successfully.`);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // 3. Test Modal 2: Cultivation Backup Modal
  const backupBtn = page.locator('button:has-text("XUẤT SAO LƯU TU VI")').first();
  if (await backupBtn.isVisible()) {
    await backupBtn.click();
    await page.waitForTimeout(400);
    const backupModal = page.locator('div:has-text("Xuất Sao Lưu Tu Vi")').first();
    if (!await backupModal.isVisible()) {
      errors.push('CultivationBackupModal did not become visible');
    } else {
      console.log(`  ✓ [${profileName}] CultivationBackupModal opened successfully.`);
    }
    const backupCloseBtn = page.locator('button[class*="closeBtn"], button[title="Đóng"]').first();
    if (await backupCloseBtn.isVisible()) {
      await backupCloseBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(300);
  }

  // 4. Test Modal: SwapAnchorModal in Nguyen Anh state
  const swapBtn = page.locator('button:has-text("ĐỔI VẬT TRẤN ÁP"), button:has-text("Đổi Vật Trấn Áp")').first();
  if (await swapBtn.isVisible()) {
    await swapBtn.click();
    await page.waitForTimeout(400);
    const swapModal = page.locator('div[role="dialog"][aria-modal="true"]:has-text("Đổi Vật Trấn Áp")').first();
    if (!await swapModal.isVisible()) {
      errors.push('SwapAnchorModal did not become visible');
    } else {
      console.log(`  ✓ [${profileName}] SwapAnchorModal opened successfully.`);
      // Pick an artifact in the inventory
      const artCard = swapModal.locator('div[role="button"]:has-text("Đế Kiếm"), div[role="button"]:has-text("Tam Thu Đao")').first();
      if (await artCard.isVisible()) {
        await artCard.click();
        await page.waitForTimeout(300);
        // Verify before/after preview block
        const afterBlock = swapModal.locator('text=Sau Khi Đổi').first();
        if (await afterBlock.isVisible()) {
          console.log(`  ✓ [${profileName}] SwapAnchorModal shows "Sau Khi Đổi" preview.`);
        } else {
          errors.push('SwapAnchorModal did not show "Sau Khi Đổi" preview block');
        }
      }
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // 5. Test Modal 3: Breakthrough / Linh Tang Modal if in Nguyen Anh
  const breakthroughBtn = page.locator('button:has-text("ĐỘT PHÁ LINH TÀNG")').first();
  if (await breakthroughBtn.isVisible()) {
    await breakthroughBtn.click();
    await page.waitForTimeout(400);
    const btModal = page.locator('div:has-text("ĐỘT PHÁ"), div:has-text("Tuyển Chọn"), div:has-text("Bí Tàng")').first();
    if (!await btModal.isVisible()) {
      errors.push('BreakthroughModal / DaoAnhToLinhTangModal did not become visible');
    } else {
      console.log(`  ✓ [${profileName}] BreakthroughModal (Đột Phá Linh Tàng) opened successfully.`);
    }
    const closeBtBtn = page.locator('button[class*="modalCloseBtn"], button[aria-label="Đóng"]').first();
    if (await closeBtBtn.isVisible()) {
      await closeBtBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(300);
  }

  // 6. Test Modal 4: DaoAnhToLinhTangModal in Linh Tang state
  await page.evaluate(({ pName, sData }) => {
    const stateKey = pName === 'sandbox' ? 'tcl_cultivation_state_v3__sandbox' : 'tcl_cultivation_state_v3';
    localStorage.setItem(stateKey, JSON.stringify({ ...sData, activeProfile: pName }));
  }, { pName: profileName, sData: mockLinhTangState });

  await page.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const customLinhTangBtn = page.locator('button:has-text("Tùy Chỉnh 5 Đạo Anh Bí Tàng")').first();
  if (await customLinhTangBtn.isVisible()) {
    await customLinhTangBtn.click();
    await page.waitForTimeout(400);
    const customModal = page.locator('div[role="dialog"], div:has-text("Tùy Chỉnh 5 Đạo Anh"), div:has-text("Tuyển Chọn")').first();
    if (!await customModal.isVisible()) {
      errors.push('DaoAnhToLinhTangModal did not become visible');
    } else {
      console.log(`  ✓ [${profileName}] DaoAnhToLinhTangModal opened successfully.`);
    }
    const closeCustomBtn = page.locator('button[class*="modalCloseBtn"], button[aria-label="Đóng"]').first();
    if (await closeCustomBtn.isVisible()) {
      await closeCustomBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(300);
  }

  // 7. Test Modal 5: SanctumPage (Tàng Bảo Điện)
  await page.goto(`${BASE_URL}/#/sanctum`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const sanctumContent = page.locator('h1:has-text("TÀNG BẢO ĐIỆN")').first();
  if (!await sanctumContent.isVisible()) {
    errors.push('SanctumPage content not visible');
  } else {
    console.log(`  ✓ [${profileName}] SanctumPage (Tàng Bảo Điện) rendered cleanly.`);
  }

  await context.close();
  return errors;
}

async function run() {
  console.log('===========================================================');
  console.log('🧪 VERIFYING CULTIVATION MODALS SMOKE TEST (NO RUNTIME ERRORS)');
  console.log('===========================================================');

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });

  try {
    const realErrors = await testProfile(browser, 'real', mockNguyenAnhState);
    const sandboxErrors = await testProfile(browser, 'sandbox', mockNguyenAnhState);

    await browser.close();
    server.close();

    const allErrors = [...realErrors, ...sandboxErrors];
    if (allErrors.length > 0) {
      console.error(`\n❌ CULTIVATION MODALS SMOKE TEST FAILED with ${allErrors.length} error(s):`);
      allErrors.forEach((e) => console.error(`  - ${e}`));
      process.exit(1);
    } else {
      console.log('\n🎉 ALL CULTIVATION MODALS SMOKE TESTS PASSED WITH 0 ERRORS!');
      process.exit(0);
    }
  } catch (err) {
    console.error('❌ CULTIVATION SMOKE TEST EXCEPTION:', err);
    if (browser) await browser.close();
    if (server) server.close();
    process.exit(1);
  }
}

run();
