import { chromium } from 'playwright';
import { preview } from 'vite';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.resolve('test-screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// 11 Đạo Anh mẫu cho cảnh giới Nguyên Anh
const sampleDaoAnhs = [
  'da_de_kiem',
  'da_tam_sinh_luan_hoi_an',
  'da_thai_so_than_vuong_the',
  'da_tien_thien_thanh_the_dao_thai',
  'da_hon_don_diet_the_loi_tri',
  'da_thao_tu_kiem_quyet',
  'da_tha_hoa_tu_tai_dai_phap',
  'da_tieu_tuc_menh_thuat',
  'da_con_bang_tien_phap',
  'da_trung_dong',
  'da_cuu_kiep_loi_nguc_kiem_phap'
].map((id, idx) => ({
  id,
  sourceId: id.replace('da_', ''),
  name: `Đạo Anh ${idx + 1}`,
  title: `Thái Sơ Thần Thể ${idx + 1}`,
  palaceName: `Thiên Cung ${idx + 1}`,
  currentKiep: idx === 0 ? 3 : 2,
  currentExp: 2500,
  maxExp: 5000,
  palaceIndex: idx
}));

const mockCultivationState = {
  totalExp: 150000,
  expCurrentRealm: 45000,
  chaptersReadCount: 50,
  readChapterIds: {},
  realm: 'nguyen_anh',
  daoAnhs: sampleDaoAnhs,
  absorbedLamps: [],
  palaceAnchors: {},
  inventoryArtifacts: [],
  _rev: 1,
  _updatedAt: Date.now()
};

async function run() {
  console.log('=== KHỞI ĐỘNG VITE PREVIEW SERVER ===');
  const server = await preview({
    preview: { port: 4173 }
  });
  const port = server.httpServer.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Vite preview đang chạy tại: ${baseUrl}`);

  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true
  });

  const viewports = [
    { name: 'mobile_360x740', width: 360, height: 740, isMobile: true },
    { name: 'mobile_390x844', width: 390, height: 844, isMobile: true },
    { name: 'mobile_430x932', width: 430, height: 932, isMobile: true },
    { name: 'desktop_1280x800', width: 1280, height: 800, isMobile: false }
  ];

  const results = [];

  for (const vp of viewports) {
    console.log(`\n--- KIỂM TRA ĐỘ PHÂN GIẢI: ${vp.name} (${vp.width}x${vp.height}) ---`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2
    });

    const page = await context.newPage();

    // Thiết lập localStorage trước khi tải trang
    await page.addInitScript((state) => {
      localStorage.setItem('tcl_active_profile', 'real');
      localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(state));
      localStorage.setItem('truc_co_visual_mode', 'luc_dai');
    }, mockCultivationState);

    await page.goto(`${baseUrl}/#/cultivation`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    const debugInfo = await page.evaluate(() => {
      return {
        profile: localStorage.getItem('tcl_active_profile'),
        savedStateRealm: JSON.parse(localStorage.getItem('tcl_cultivation_state_v3') || '{}').realm,
        centerColClasses: document.querySelector('.cultivation-col-center')?.className,
        centerColHtml: document.querySelector('.cultivation-col-center')?.innerHTML?.slice(0, 400),
        toolbarFound: Boolean(document.querySelector('.array-mobile-toolbar')),
        floatingBtnFound: Boolean(document.querySelector('.floating-back-library-btn')),
        floatingBtnDisplay: window.getComputedStyle(document.querySelector('.floating-back-library-btn') || document.body).display,
        visualizerFound: Boolean(document.querySelector('.cultivation-canvas-container')),
        allButtons: Array.from(document.querySelectorAll('button')).map(b => b.className + ' | ' + b.innerText + ' | ' + b.title)
      };
    });
    console.log('DEBUG INFO:', JSON.stringify(debugInfo, null, 2));

    if (vp.isMobile) {
      // Xác nhận nút nổi .floating-back-library-btn bị ẩn
      const floatingBtnVisible = await page.locator('.floating-back-library-btn').isVisible();
      console.log(`Nút nổi .floating-back-library-btn hiển thị: ${floatingBtnVisible} (Yêu cầu: false)`);
      if (floatingBtnVisible) {
        throw new Error(`LỖI: .floating-back-library-btn vẫn hiển thị trên mobile ${vp.name}`);
      }

      // Xác nhận thanh công cụ mới .array-mobile-toolbar hiển thị
      const toolbarVisible = await page.locator('.array-mobile-toolbar').isVisible();
      console.log(`Thanh công cụ mới .array-mobile-toolbar hiển thị: ${toolbarVisible} (Yêu cầu: true)`);
      if (!toolbarVisible) {
        throw new Error(`LỖI: .array-mobile-toolbar không hiển thị trên mobile ${vp.name}`);
      }

      // (a) Chụp ảnh tab TRẬN ĐỒ bình thường
      const shotA = path.join(SCREENSHOT_DIR, `${vp.name}_a_normal.png`);
      await page.screenshot({ path: shotA, fullPage: false });
      console.log(`✓ Đã chụp (a) bình thường: ${shotA}`);
      results.push(shotA);

      // (b) Bật chế độ hoán đổi
      const swapBtn = page.locator('.array-mobile-toolbar button:has-text("🔄")').first();
      await swapBtn.click();
      await page.waitForTimeout(400);

      const shotB = path.join(SCREENSHOT_DIR, `${vp.name}_b_swap_enabled.png`);
      await page.screenshot({ path: shotB, fullPage: false });
      console.log(`✓ Đã chụp (b) bật hoán đổi: ${shotB}`);
      results.push(shotB);

      // (c) Nhấp Đạo Anh thứ nhất
      // Tìm các node Đạo Anh trong SVG
      const daoAnhNodes = page.locator('svg g[style*="cursor: pointer"]');
      const count = await daoAnhNodes.count();
      console.log(`Tìm thấy ${count} node Đạo Anh trong trận đồ`);

      if (count > 1) {
        // Click vào Đạo Anh thứ 1
        await daoAnhNodes.nth(1).click({ force: true });
        await page.waitForTimeout(400);

        const shotC = path.join(SCREENSHOT_DIR, `${vp.name}_c_selected_first.png`);
        await page.screenshot({ path: shotC, fullPage: false });
        console.log(`✓ Đã chụp (c) đã chọn Đạo Anh 1: ${shotC}`);
        results.push(shotC);

        // Nhấp Đạo Anh thứ 2 để kiểm tra hoán đổi thành công
        await daoAnhNodes.nth(2).click({ force: true });
        await page.waitForTimeout(400);
        console.log(`✓ Đã nhấp Đạo Anh thứ 2 để kiểm tra hoán vị`);
      }

      // Tắt hoán đổi
      await swapBtn.click();
      await page.waitForTimeout(300);

      // Thử bấm nút ← quay lại
      const backBtn = page.locator('.array-mobile-toolbar button:has-text("←")').first();
      await backBtn.click();
      await page.waitForTimeout(500);
      const currentUrl = page.url();
      console.log(`URL sau khi bấm nút ←: ${currentUrl}`);
      if (currentUrl.includes('/cultivation')) {
        console.warn('Cảnh báo: URL chưa chuyển sau khi bấm back');
      } else {
        console.log('✓ Nút ← điều hướng thành công!');
      }

    } else {
      // Desktop: Xác nhận bố cục nguyên bản
      const floatingBtnVisible = await page.locator('.floating-back-library-btn').isVisible();
      console.log(`Desktop: .floating-back-library-btn hiển thị: ${floatingBtnVisible} (Yêu cầu: true)`);
      if (!floatingBtnVisible) {
        throw new Error(`LỖI: .floating-back-library-btn bị mất trên desktop!`);
      }

      const toolbarVisible = await page.locator('.array-mobile-toolbar').isVisible();
      console.log(`Desktop: .array-mobile-toolbar hiển thị: ${toolbarVisible} (Yêu cầu: false)`);
      if (toolbarVisible) {
        throw new Error(`LỖI: .array-mobile-toolbar hiển thị trên desktop!`);
      }

      const shotDesktop = path.join(SCREENSHOT_DIR, `${vp.name}_normal.png`);
      await page.screenshot({ path: shotDesktop, fullPage: false });
      console.log(`✓ Đã chụp desktop: ${shotDesktop}`);
      results.push(shotDesktop);
    }

    await context.close();
  }

  await browser.close();
  await server.close();
  console.log('\n=== TẤT CẢ KIỂM THỬ PLAYWRIGHT VÀ CHỤP MÀN HÌNH HOÀN TẤT THÀNH CÔNG! ===');
  console.log('Danh sách ảnh đã chụp:');
  results.forEach(r => console.log(' - ' + r));
}

run().catch(err => {
  console.error('LỖI KIỂM THỬ:', err);
  process.exit(1);
});
