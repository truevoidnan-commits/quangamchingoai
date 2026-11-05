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

const PORT = 4195;
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
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
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

  // Also copy to artifacts dir
  const baseName = path.basename(targetPath);
  const artifactPath = path.join(artifactDir, baseName);
  try {
    fs.writeFileSync(artifactPath, optimized);
  } catch (e) {
    // ignore
  }
}

async function assertNoHorizontalScroll(page, viewportName, contextMsg) {
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
    `LỖI TRÀN VIỀN (${viewportName} - ${contextMsg}): docWidth=${info.docWidth}, bodyWidth=${info.bodyWidth}, winWidth=${info.winWidth}`
  );
  console.log(`  ✓ Không tràn viền tại ${viewportName} (${contextMsg}): docWidth=${info.docWidth}px <= winWidth=${info.winWidth}px`);
}

async function main() {
  console.log('=== BẮT ĐẦU CHỤP ẢNH & KIỂM THỬ GIAO DIỆN TRUYỆN CHỮ ===');
  const server = await startServer();
  console.log(`Server preview running at ${BASE_URL}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[BROWSER ERR]', msg.text());
  });

  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  console.log('Seeding mock novels & chapters into IndexedDB & localStorage...');
  await page.evaluate(async () => {
    // Clear old data
    localStorage.clear();
    localStorage.setItem('tcl_seeded', '1');

    // Create custom canvas cover for Novel 1 (Vũ Động Càn Khôn)
    const createCover = (title, c1, c2) => {
      const c = document.createElement('canvas');
      c.width = 400;
      c.height = 560;
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 400, 560);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 400, 560);
      ctx.strokeStyle = 'rgba(255, 204, 0, 0.4)';
      ctx.lineWidth = 8;
      ctx.strokeRect(16, 16, 368, 528);
      ctx.fillStyle = '#ffcc00';
      ctx.font = 'bold 36px serif';
      ctx.textAlign = 'center';
      ctx.fillText(title, 200, 280);
      return c.toDataURL('image/jpeg', 0.85);
    };

    const coverVuDong = createCover('VŨ ĐỘNG CÀN KHÔN', '#1a233a', '#0a0f1d');
    const coverTienNghich = createCover('TIÊN NGHỊCH', '#251b38', '#0c0a14');

    const novelsList = [
      {
        id: 'novel-vudong',
        title: 'Vũ Động Càn Khôn',
        author: 'Thiên Tằm Thổ Đậu',
        description: 'Vũ Động Càn Khôn: Tu luyện một đường, chính là nghịch thiên mà đi, đoạt tạo hóa, chuyển càn khôn. Lâm Động từ một thiếu niên bình thường của Lâm gia tại Thanh Dương trấn, từng bước bước lên đỉnh phong thiên địa.',
        coverUrl: coverVuDong,
        coverThumb: coverVuDong,
        chapterCount: 284,
        totalChapters: 284,
        createdAt: Date.now() - 10000000,
        updatedAt: Date.now() - 50000,
      },
      {
        id: 'novel-longtitle-3800',
        title: 'Đấu Phá Thương Khung Chi Vô Thượng Cảnh Giới Cực Kỳ Dài Dài Dài Dài Dài Dài Dài Dài Dài Dài Dài',
        author: 'Dạ Vũ Thu Phong',
        description: 'Sau khi trở thành Đấu Đế, Tiêu Viêm phá toái hư không đi tới một thế giới hoàn toàn mới rộng lớn vô tận, bắt đầu con đường chinh phục vạn giới.',
        coverUrl: null,
        chapterCount: 3800,
        totalChapters: 3800,
        createdAt: Date.now() - 20000000,
        updatedAt: Date.now() - 100000,
      },
      {
        id: 'novel-phan-nhan',
        title: 'Phàm Nhân Tu Tiên',
        author: 'Vong Ngữ',
        description: 'Hàn Lập một thiếu niên bình thường từ sơn thôn gia nhập giang hồ môn phái tiểu môn phái, ngẫu nhiên đạt được chưởng thiên bình, mở ra con đường tu tiên đầy gian nan.',
        coverUrl: null,
        chapterCount: 1450,
        totalChapters: 1450,
        createdAt: Date.now() - 30000000,
        updatedAt: Date.now() - 150000,
      },
      {
        id: 'novel-muc-than-ky',
        title: 'Mục Thần Ký',
        author: 'Trạch Trư',
        description: 'Đại Khư tàn lão thôn, Tần Mục được chín vị tàn phế lão nhân nuôi dưỡng trưởng thành, bắt đầu con đường cải cách thiên địa.',
        coverUrl: null,
        chapterCount: 1100,
        totalChapters: 1100,
        createdAt: Date.now() - 40000000,
        updatedAt: Date.now() - 200000,
      },
      {
        id: 'novel-thon-phe',
        title: 'Thôn Phệ Tinh Không',
        author: 'Ngã Cật Tây Hồng Thị',
        description: 'La Phong quật khởi thời kỳ Đại Niết Bàn trên Địa Cầu, gia nhập Vũ Giả, thôn phệ Kim Giác Cự Thú, ngao du vũ trụ.',
        coverUrl: null,
        chapterCount: 850,
        totalChapters: 850,
        createdAt: Date.now() - 50000000,
        updatedAt: Date.now() - 250000,
      },
      {
        id: 'novel-nhat-niem',
        title: 'Nhất Niệm Vĩnh Hằng',
        author: 'Nhĩ Căn',
        description: 'Bạch Tiểu Thuần một lòng cầu trường sinh, sợ chết nhưng nghịch cảnh quật khởi, trở thành bất tử cự đầu.',
        coverUrl: null,
        chapterCount: 920,
        totalChapters: 920,
        createdAt: Date.now() - 60000000,
        updatedAt: Date.now() - 300000,
      },
      {
        id: 'novel-tien-nghich',
        title: 'Tiên Nghịch',
        author: 'Nhĩ Căn',
        description: 'Vương Lâm cầu tiên nghịch mệnh, thuận vi phàm nghịch vi tiên, sát phạt quyết đoán chấn nhiếp tu chân giới.',
        coverUrl: coverTienNghich,
        coverThumb: coverTienNghich,
        chapterCount: 1200,
        totalChapters: 1200,
        createdAt: Date.now() - 70000000,
        updatedAt: Date.now() - 350000,
      },
      {
        id: 'novel-co-chan-nhan',
        title: 'Cổ Chân Nhân',
        author: 'Cổ Chân Nhân',
        description: 'Phương Nguyên 500 năm sau trùng sinh trở lại tuổi thiếu niên, dùng Xuân Thu Thiền mưu đoạt tạo hóa, truy cầu vĩnh sinh.',
        coverUrl: null,
        chapterCount: 2334,
        totalChapters: 2334,
        createdAt: Date.now() - 80000000,
        updatedAt: Date.now() - 400000,
      },
    ];

    // Save catalog to localStorage
    localStorage.setItem('tcl_library', JSON.stringify(novelsList));

    // Save reading progress
    localStorage.setItem('tcl_progress_novel-vudong', JSON.stringify({
      chapterId: 'vd-ch-42',
      chapterNumber: 42,
      scrollTop: 350,
      updatedAt: Date.now(),
    }));

    localStorage.setItem('tcl_progress_novel-longtitle-3800', JSON.stringify({
      chapterId: 'lt-ch-1205',
      chapterNumber: 1205,
      scrollTop: 1200,
      updatedAt: Date.now(),
    }));

    localStorage.setItem('tcl_progress_novel-phan-nhan', JSON.stringify({
      chapterId: 'pn-ch-300',
      chapterNumber: 300,
      scrollTop: 0,
      updatedAt: Date.now(),
    }));

    localStorage.setItem('tcl_progress_novel-thon-phe', JSON.stringify({
      chapterId: 'tp-ch-50',
      chapterNumber: 50,
      scrollTop: 0,
      updatedAt: Date.now(),
    }));

    // Seed IndexedDB for novel-vudong (284 chapters) and novel-longtitle-3800 (3800 chapters)
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
    const novelStore = tx.objectStore('novels');
    const chapterStore = tx.objectStore('chapters');

    for (const n of novelsList) {
      novelStore.put(n);
    }

    // Seed 284 chapters for novel-vudong
    for (let i = 1; i <= 284; i++) {
      chapterStore.put({
        id: `vd-ch-${i}`,
        novelId: 'novel-vudong',
        order: i,
        title: `Chương ${i}: ${i === 1 ? 'Lâm Gia Thiếu Niên' : i === 42 ? 'Ngưng Huyết Quyết Đệ Nhị Trọng Cực Hạn Uy Lực Kinh Người' : 'Tu Luyện Tạo Hóa'}`,
        content: `Nội dung chi tiết của chương ${i} trong bộ truyện Vũ Động Càn Khôn. Dòng chảy linh khí cuồn cuộn...`,
        createdAt: Date.now() - (285 - i) * 10000,
        updatedAt: Date.now() - (285 - i) * 10000,
      });
    }

    // Seed 3800 chapters for novel-longtitle-3800
    for (let i = 1; i <= 3800; i++) {
      chapterStore.put({
        id: `lt-ch-${i}`,
        novelId: 'novel-longtitle-3800',
        order: i,
        title: `Chương ${i}: ${i === 1 ? 'Phá Toái Hư Không' : i === 1205 ? 'Vô Thượng Cảnh Giới Đỉnh Phong Đối Quyết' : 'Đế Chi Cảnh Uy Áp'}`,
        content: `Nội dung chương ${i} Đấu Phá Thương Khung Chi Vô Thượng Cảnh Giới...`,
        createdAt: Date.now() - (3801 - i) * 1000,
        updatedAt: Date.now() - (3801 - i) * 1000,
      });
    }

    await new Promise((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  });

  console.log('Seeding completed.');

  // ==========================================
  // RESPONSIVE TESTS ACROSS 5 VIEWPORTS
  // 360, 390, 768, 1280, 1920px
  // ==========================================
  console.log('\n--- BẮT ĐẦU KIỂM THỬ KHÔNG TRÀN VIỀN (RESPONSIVE CHECK) ---');
  const viewports = [
    { name: '360px Mobile Nhỏ', width: 360, height: 740 },
    { name: '390px Mobile Chuẩn', width: 390, height: 844 },
    { name: '768px Tablet', width: 768, height: 1024 },
    { name: '1280px Desktop', width: 1280, height: 800 },
    { name: '1920px Màn Rộng', width: 1920, height: 1080 },
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    // Check LibraryPage
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=THIÊN CƠ LÂU', { timeout: 10000 });
    await page.waitForTimeout(300);
    await assertNoHorizontalScroll(page, vp.name, 'Sảnh Thư Viện');

    // Check NovelDetailPage with long title (novel-longtitle-3800)
    await page.goto(`${BASE_URL}/#/novel/novel-longtitle-3800`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=3800 chương', { timeout: 10000 });
    await page.waitForTimeout(300);
    await assertNoHorizontalScroll(page, vp.name, 'Trang Chi Tiết (Tên Dài 80+ Ký Tự)');
  }

  console.log('✓ TOÀN BỘ 5 VIEWPORT ĐỀU ĐẠT CHUẨN KHÔNG TRÀN VIỀN (100% PASS)!\n');

  // ==========================================
  // SCREENSHOT 01: 01-library-grid-desktop.png (1280x800)
  // ==========================================
  console.log('Capturing: 01-library-grid-desktop.png...');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Vũ Động Càn Khôn', { timeout: 10000 });
  await page.waitForTimeout(500);

  const shot1Desktop = path.join(outDir, '01-library-grid-desktop.png');
  const buf1Desktop = await page.screenshot();
  await saveOptimizedPng(buf1Desktop, shot1Desktop);

  // ==========================================
  // SCREENSHOT 01b: 01-library-grid-mobile.png (390x844)
  // ==========================================
  console.log('Capturing: 01-library-grid-mobile.png...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);

  const shot1Mobile = path.join(outDir, '01-library-grid-mobile.png');
  const buf1Mobile = await page.screenshot();
  await saveOptimizedPng(buf1Mobile, shot1Mobile);

  // ==========================================
  // SCREENSHOT 02: 02-library-list-mobile.png (390x844)
  // ==========================================
  console.log('Capturing: 02-library-list-mobile.png...');
  // Click list mode button
  const listBtn = page.locator('button[title="Xem dạng danh sách"]');
  await listBtn.click();
  await page.waitForTimeout(400);

  const shot2Mobile = path.join(outDir, '02-library-list-mobile.png');
  const buf2Mobile = await page.screenshot();
  await saveOptimizedPng(buf2Mobile, shot2Mobile);

  // Switch back to grid mode
  const gridBtn = page.locator('button[title="Xem dạng lưới"]');
  await gridBtn.click();
  await page.waitForTimeout(300);

  // ==========================================
  // SCREENSHOT 03: 03-default-covers.png (chụp 4 thẻ truyện dùng bìa mặc định khác nhau cạnh nhau)
  // ==========================================
  console.log('Capturing: 03-default-covers.png...');
  await page.setViewportSize({ width: 1200, height: 750 });
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Phàm Nhân Tu Tiên', { timeout: 10000 });
  await page.waitForTimeout(400);

  const cards = page.locator('div[role="button"][aria-label*="Đọc"]');
  // Cards 1, 2, 3, 4 have 4 distinct default covers (Đấu Phá, Phàm Nhân, Mục Thần Ký, Thôn Phệ Tinh Không)
  const b1 = await cards.nth(1).boundingBox();
  const b4 = await cards.nth(4).boundingBox();

  const shot3Path = path.join(outDir, '03-default-covers.png');
  let buf3;
  if (b1 && b4) {
    const minX = Math.max(0, Math.min(b1.x, b4.x) - 16);
    const minY = Math.max(0, Math.min(b1.y, b4.y) - 16);
    const maxX = Math.max(b1.x + b1.width, b4.x + b4.width) + 16;
    const maxY = Math.max(b1.y + b1.height, b4.y + b4.height) + 16;
    buf3 = await page.screenshot({
      clip: {
        x: Math.round(minX),
        y: Math.round(minY),
        width: Math.round(maxX - minX),
        height: Math.round(maxY - minY),
      },
    });
  } else {
    buf3 = await page.screenshot();
  }
  await saveOptimizedPng(buf3, shot3Path);

  // ==========================================
  // SCREENSHOT 04: 04-novel-menu-bottomsheet.png (390x844, bottomsheet mở)
  // ==========================================
  console.log('Capturing: 04-novel-menu-bottomsheet.png...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Vũ Động Càn Khôn', { timeout: 10000 });
  await page.waitForTimeout(400);

  // Trigger contextmenu on first card to open BottomSheet
  const firstCard = page.locator('div[role="button"][aria-label*="Đọc"]').first();
  await firstCard.click({ button: 'right' });
  await page.waitForSelector('text=Sửa truyện', { timeout: 5000 });
  await page.waitForTimeout(400);

  const shot4Path = path.join(outDir, '04-novel-menu-bottomsheet.png');
  const buf4 = await page.screenshot();
  await saveOptimizedPng(buf4, shot4Path);

  // Close bottomsheet with Escape key
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // ==========================================
  // SCREENSHOT 05: 05-novel-detail-284-chapters.png (390x844)
  // ==========================================
  console.log('Capturing: 05-novel-detail-284-chapters.png...');
  await page.goto(`${BASE_URL}/#/novel/novel-vudong`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Vũ Động Càn Khôn', { timeout: 10000 });
  await page.waitForSelector('text=Chương 42:', { timeout: 10000 });
  await page.waitForTimeout(500);

  const shot5Mobile = path.join(outDir, '05-novel-detail-284-chapters.png');
  const buf5Mobile = await page.screenshot();
  await saveOptimizedPng(buf5Mobile, shot5Mobile);

  // ==========================================
  // SCREENSHOT 05b: 05-novel-detail-desktop.png (1280x800, 284 chapters)
  // ==========================================
  console.log('Capturing: 05-novel-detail-desktop.png...');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(400);

  const shot5Desktop = path.join(outDir, '05-novel-detail-desktop.png');
  const buf5Desktop = await page.screenshot();
  await saveOptimizedPng(buf5Desktop, shot5Desktop);

  // ==========================================
  // SCREENSHOT 06: 06-novel-detail-3800-chapters.png (benchmark cuộn mượt, chụp header sticky + danh sách chương đang cuộn)
  // ==========================================
  console.log('Capturing: 06-novel-detail-3800-chapters.png...');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/#/novel/novel-longtitle-3800`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=3800 chương', { timeout: 10000 });
  await page.waitForSelector('text=Chương 1:', { timeout: 10000 });
  await page.waitForTimeout(400);

  // Scroll down so sticky header is active and chapters are rendering via content-visibility
  await page.evaluate(() => {
    window.scrollTo(0, 650);
  });
  await page.waitForTimeout(500);

  const shot6 = path.join(outDir, '06-novel-detail-3800-chapters.png');
  const buf6 = await page.screenshot();
  await saveOptimizedPng(buf6, shot6);

  // ==========================================
  // SCREENSHOT 07: 07-library-empty.png (390x844, sảnh rỗng khi chưa có truyện)
  // ==========================================
  console.log('Capturing: 07-library-empty.png...');
  await page.evaluate(() => {
    localStorage.setItem('tcl_library', '[]');
  });
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Chưa có truyện nào', { timeout: 10000 });
  await page.waitForTimeout(400);

  const shot7 = path.join(outDir, '07-library-empty.png');
  const buf7 = await page.screenshot();
  await saveOptimizedPng(buf7, shot7);

  console.log('\n======================================================');
  console.log('✅ HOÀN TẤT CHỤP VÀ TỐI ƯU TOÀN BỘ ẢNH CHỨNG MINH GIAO DIỆN!');
  console.log('======================================================');

  await browser.close();
  server.close();
}

main().catch((err) => {
  console.error('LỖI CHỤP ẢNH:', err);
  process.exit(1);
});
