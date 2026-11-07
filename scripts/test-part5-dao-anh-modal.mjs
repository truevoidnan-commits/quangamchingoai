import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const outDir = path.resolve(__dirname, '../docs/ui-redesign/realms-gallery-followup');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const PORT = 4227;
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

async function compressImage(filePath) {
  const buf = fs.readFileSync(filePath);
  const compressed = await sharp(buf).png({ quality: 80, compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(filePath, compressed);
}

function createLinhTangState() {
  const daoAnhs = [
    { id: 'da_1', name: 'Thái Cổ Hỗn Độn Kiếm Anh', tier: 'than_pham', currentKiep: 5, level: 10, active: true },
    { id: 'da_2', name: 'Vạn Cổ Luân Hồi Tiên Anh', tier: 'than_pham', currentKiep: 5, level: 10, active: true },
    { id: 'da_3', name: 'Cửu U Hoàng Tuyền Ma Anh', tier: 'cuc_pham', currentKiep: 4, level: 9, active: true },
    { id: 'da_4', name: 'Hư Không Tạo Hóa Thần Anh', tier: 'than_pham', currentKiep: 5, level: 10, active: true },
    { id: 'da_5', name: 'Bát Hoang Liệt Diễm Linh Anh', tier: 'thuong_pham', currentKiep: 3, level: 8, active: true },
    { id: 'da_6', name: 'Tử Tiêu Thần Lôi Chân Anh', tier: 'cuc_pham', currentKiep: 4, level: 9, active: true },
    { id: 'da_7', name: 'Băng Phách Huyền Minh Anh', tier: 'trung_pham', currentKiep: 2, level: 6, active: true },
    { id: 'da_8', name: 'Thái Hư Quy Nhất Đạo Anh', tier: 'than_pham', currentKiep: 5, level: 10, active: true },
  ];

  const linhTangs = [
    { id: 1, name: 'Tòa Bí Tàng Thứ Nhất', isInitialized: true, isGateOpen: false, sourceDaoAnhId: 'da_1', sourceDaoAnhName: 'Thái Cổ Hỗn Độn Kiếm Anh' },
    { id: 2, name: 'Tòa Bí Tàng Thứ Hai', isInitialized: true, isGateOpen: false, sourceDaoAnhId: 'da_2', sourceDaoAnhName: 'Vạn Cổ Luân Hồi Tiên Anh' },
    { id: 3, name: 'Tòa Bí Tàng Thứ Ba', isInitialized: true, isGateOpen: false, sourceDaoAnhId: 'da_3', sourceDaoAnhName: 'Cửu U Hoàng Tuyền Ma Anh' },
    { id: 4, name: 'Tòa Bí Tàng Thứ Tư', isInitialized: true, isGateOpen: false, sourceDaoAnhId: 'da_4', sourceDaoAnhName: 'Hư Không Tạo Hóa Thần Anh' },
    { id: 5, name: 'Tòa Bí Tàng Thứ Năm', isInitialized: true, isGateOpen: false, sourceDaoAnhId: 'da_5', sourceDaoAnhName: 'Bát Hoang Liệt Diễm Linh Anh' },
  ];

  return {
    realm: 'linh_tang',
    phapKhieu: 120,
    selfMenhHoa: 4,
    has121st: true,
    maxThienCung: 13,
    realizedThienCung: 13,
    daoAnhs,
    linhTangs,
    activeProfile: 'real',
  };
}

async function run() {
  console.log('===========================================================');
  console.log('🧪 TESTING PHẦN 5: TUYỂN CHỌN 5 ĐẠO ANH HÓA 5 BÍ TÀNG MODAL');
  console.log('===========================================================');

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  let hasErrors = false;

  try {
    const viewports = [
      { name: 'desktop-1920', width: 1920, height: 1080, isMobile: false },
      { name: 'desktop-1366', width: 1366, height: 768, isMobile: false },
      { name: 'mobile-390', width: 390, height: 844, isMobile: true },
    ];

    for (const vp of viewports) {
      console.log(`\n--- Testing ${vp.name} (${vp.width}x${vp.height}) ---`);
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile });
      const page = await context.newPage();

      await page.addInitScript((mockState) => {
        try {
          localStorage.clear();
          localStorage.setItem('tcl_active_profile', 'real');
          localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mockState));
        } catch (e) {}
      }, createLinhTangState());

      await page.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(1000);

      // On mobile, ensure we are on visualizer tab
      if (vp.isMobile) {
        const visTab = page.locator('button.mobile-tab-btn:has-text("TRẬN ĐỒ")');
        if (await visTab.isVisible()) {
          await visTab.click();
          await page.waitForTimeout(400);
        }
      }

      // Click "Tùy Chỉnh 5 Đạo Anh Bí Tàng" button
      const openBtn = page.locator('button:has-text("Tùy Chỉnh 5 Đạo Anh Bí Tàng")').first();
      await openBtn.waitFor({ state: 'visible', timeout: 5000 });
      await openBtn.click();
      await page.waitForTimeout(600);

      // Verify modal is visible
      const modal = page.locator('div[role="dialog"][aria-labelledby="assign-modal-title"]');
      const isModalVisible = await modal.isVisible();
      if (!isModalVisible) {
        console.error(`  🚨 FAIL: Modal dialog not visible on ${vp.name}!`);
        hasErrors = true;
      } else {
        console.log(`  ✅ PASS: Modal dialog opened successfully.`);
      }

      // Audit modal contents
      const audit = await page.evaluate(() => {
        const titleEl = document.querySelector('#assign-modal-title');
        const title = titleEl ? titleEl.textContent : '';

        // Slots
        const slots = Array.from(document.querySelectorAll('[class*="slotCard"]'));
        const slotChips = slots.map(s => s.querySelector('[class*="slotChip"]')?.textContent?.trim());
        const slotNames = slots.map(s => s.querySelector('[class*="slotDaoAnhName"]')?.textContent?.trim() || 'empty');
        const slotAvatars = slots.filter(s => s.querySelector('[class*="slotAvatarRing"] img')).length;
        const unassignBtns = slots.filter(s => s.querySelector('[class*="unassignBtn"]')).length;

        // Repository
        const searchInput = document.querySelector('[class*="searchInput"]');
        const filterPills = Array.from(document.querySelectorAll('[class*="filterPill"]')).map(p => p.textContent.trim());
        const repoCards = Array.from(document.querySelectorAll('[class*="repoCard"]'));
        const assignedRepoCards = document.querySelectorAll('[class*="repoCardAssigned"]').length;
        const rawEnums = Array.from(document.querySelectorAll('*')).filter(el => {
          const t = el.textContent || '';
          return t.includes('THAN_PHAM') || t.includes('CUC_PHAM') || t.includes('HA_PHAM');
        }).length;

        // Footer buttons
        const cancelBtn = document.querySelector('[class*="cancelBtn"]');
        const confirmBtn = document.querySelector('[class*="confirmBtn"]');
        const confirmText = confirmBtn ? confirmBtn.textContent.trim() : '';
        const isConfirmDisabled = confirmBtn ? confirmBtn.disabled : false;

        return {
          title,
          slotCount: slots.length,
          slotChips,
          slotNames,
          slotAvatars,
          unassignBtns,
          hasSearchInput: Boolean(searchInput),
          filterPills,
          repoCardCount: repoCards.length,
          assignedRepoCards,
          rawEnums,
          hasCancelBtn: Boolean(cancelBtn),
          confirmText,
          isConfirmDisabled,
        };
      });

      console.log(`  Audit results for ${vp.name}:`, {
        title: audit.title,
        slotCount: audit.slotCount,
        slotChips: audit.slotChips,
        slotAvatars: audit.slotAvatars,
        unassignBtns: audit.unassignBtns,
        filterPills: audit.filterPills,
        repoCardCount: audit.repoCardCount,
        assignedRepoCards: audit.assignedRepoCards,
        rawEnums: audit.rawEnums,
        confirmText: audit.confirmText,
        isConfirmDisabled: audit.isConfirmDisabled,
      });

      if (!audit.title.includes('TUYỂN CHỌN 5 ĐẠO ANH HÓA 5 BÍ TÀNG')) {
        console.error(`  🚨 FAIL: Modal title incorrect on ${vp.name}!`);
        hasErrors = true;
      }

      if (audit.slotCount !== 5) {
        console.error(`  🚨 FAIL: Expected 5 slots, got ${audit.slotCount} on ${vp.name}!`);
        hasErrors = true;
      }

      if (audit.rawEnums > 0) {
        console.error(`  🚨 FAIL: Raw tier enums found in UI on ${vp.name}!`);
        hasErrors = true;
      } else {
        console.log(`  ✅ PASS: 0 raw enums found; all tiers localized to Vietnamese.`);
      }

      if (audit.assignedRepoCards !== 5) {
        console.error(`  🚨 FAIL: Expected 5 assigned cards in repo, got ${audit.assignedRepoCards} on ${vp.name}!`);
        hasErrors = true;
      } else {
        console.log(`  ✅ PASS: 5 cards highlighted as assigned with checkmarks.`);
      }

      // Take screenshot of 5/5 state
      const shotPath = path.join(outDir, `dao-anh-to-linh-tang-${vp.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
      await compressImage(shotPath);
      console.log(`  📸 Screenshot saved: ${shotPath}`);

      // If desktop-1920, test unassigning, searching, and Escape key
      if (vp.name === 'desktop-1920') {
        console.log(`  Testing unassign slot 1 on desktop-1920...`);
        const firstUnassignBtn = page.locator('[class*="slotCard"]').first().locator('button:has-text("Gỡ")');
        await firstUnassignBtn.click();
        await page.waitForTimeout(300);

        const unassignAudit = await page.evaluate(() => {
          const confirmBtn = document.querySelector('[class*="confirmBtn"]');
          const emptySlots = document.querySelectorAll('[class*="slotCardEmpty"]').length;
          return {
            confirmText: confirmBtn ? confirmBtn.textContent.trim() : '',
            isConfirmDisabled: confirmBtn ? confirmBtn.disabled : false,
            emptySlots,
          };
        });

        console.log(`  After unassigning:`, unassignAudit);
        if (unassignAudit.emptySlots !== 1 || !unassignAudit.isConfirmDisabled) {
          console.error(`  🚨 FAIL: Unassigning did not empty slot or disable confirm button!`);
          hasErrors = true;
        } else {
          console.log(`  ✅ PASS: Unassigned slot is empty and confirm button disabled at (4/5).`);
        }

        const shotUnassigned = path.join(outDir, `dao-anh-to-linh-tang-unassigned.png`);
        await page.screenshot({ path: shotUnassigned, fullPage: false });
        await compressImage(shotUnassigned);
        console.log(`  📸 Screenshot saved: ${shotUnassigned}`);

        // Re-assign by clicking an unassigned card in repo
        const unassignedCard = page.locator('[class*="repoCard"]:not([class*="repoCardAssigned"])').first();
        await unassignedCard.click();
        await page.waitForTimeout(300);

        // Test Escape key closes modal
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        const modalClosed = !(await modal.isVisible());
        if (!modalClosed) {
          console.error(`  🚨 FAIL: Escape key did not close modal!`);
          hasErrors = true;
        } else {
          console.log(`  ✅ PASS: Escape key closes modal.`);
        }
      }

      await context.close();
    }
  } catch (err) {
    console.error('Test execution error:', err);
    hasErrors = true;
  } finally {
    await browser.close();
    server.close();
  }

  console.log('===========================================================');
  if (hasErrors) {
    console.error('❌ PART 5 TUYỂN CHỌN 5 ĐẠO ANH MODAL TEST FAILED!');
    process.exit(1);
  } else {
    console.log('✅ ALL PART 5 TUYỂN CHỌN 5 ĐẠO ANH MODAL VERIFICATIONS PASSED CLEANLY (100%)!');
    process.exit(0);
  }
}

run();
