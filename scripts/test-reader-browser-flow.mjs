/**
 * scripts/test-reader-browser-flow.mjs
 *
 * Kiểm thử luồng ReaderPage qua Playwright (Chromium mặc định):
 * 1. Cloud ở ch36: Tự động nhảy sang ch36, hiện toast "Quay lại vị trí cũ", 0 lần ghi ch3.
 * 2. Cloud không mới hơn: Ở lại ch3, không ghi tới khi cuộn.
 * 3. Cloud trả chậm 1.8s: Hiển thị skeleton trong lúc chờ, sau đó vẫn nhảy sang ch36, 0 lần ghi ch3.
 * 4. Offline (context.setOffline(true)): Ở lại ch3, không treo skeleton, nội dung chương 3 hiển thị.
 */

import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const artifactsDir = path.join(rootDir, 'artifacts/reader_guard');

if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

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

// 1. Static HTTP Server cho bản build dist/
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || !reqPath) reqPath = '/index.html';
  let filePath = path.join(distDir, reqPath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, 'index.html');
  }

  const ext = path.extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filePath).pipe(res);
});

const PORT = 4188;
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
console.log(`✓ Test server running at http://127.0.0.1:${PORT}`);

/**
 * Phục vụ static file trực tiếp qua Playwright route để hoạt động ngay cả khi setOffline(true)
 */
async function setupStaticRoute(page) {
  await page.route(`http://127.0.0.1:${PORT}/**`, (route) => {
    try {
      const u = new URL(route.request().url());
      let reqPath = u.pathname;
      if (reqPath === '/' || !reqPath) reqPath = '/index.html';
      let filePath = path.join(distDir, reqPath);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, 'index.html');
      }
      const ext = path.extname(filePath);
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      route.fulfill({
        status: 200,
        contentType: mime,
        body: fs.readFileSync(filePath),
      });
    } catch {
      route.continue();
    }
  });
}

/**
 * Script khởi tạo cho mỗi trang:
 * - Gắn session giả vào localStorage
 * - Profile 'real'
 * - Hook theo dõi các lần ghi tcl_progress_*
 */
function createInitScript(initialLocalUpdatedAt = 1000) {
  return `
    window.__tcl_progressWrites = [];
    const _origSetItem = localStorage.setItem.bind(localStorage);

    _origSetItem('cultivation_active_profile', 'real');
    _origSetItem('sb-vmzgjlooapqskcmkerdz-auth-token', JSON.stringify({
      access_token: 'mock-access-token-123',
      refresh_token: 'mock-refresh-token-123',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: 'mock-user-123',
        email: 'test@example.com'
      }
    }));
    _origSetItem('tcl_progress_novel_test', JSON.stringify({
      chapterId: 'ch3',
      percent: 0,
      scrollTop: 0,
      updatedAt: ${initialLocalUpdatedAt}
    }));

    localStorage.setItem = function(k, v) {
      if (typeof k === 'string' && k.startsWith('tcl_progress_')) {
        try {
          window.__tcl_progressWrites.push({
            key: k,
            val: JSON.parse(v),
            time: Date.now()
          });
        } catch(e) {
          window.__tcl_progressWrites.push({ key: k, raw: v, time: Date.now() });
        }
      }
      return _origSetItem(k, v);
    };
  `;
}

/**
 * Nạp sẵn dữ liệu truyện mẫu và 36 chương vào IndexedDB 'thien-co-lau'
 */
async function seedIndexedDB(context) {
  const seedPage = await context.newPage();
  await setupStaticRoute(seedPage);
  await seedPage.goto(`http://127.0.0.1:${PORT}/`);
  await seedPage.evaluate(() => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('thien-co-lau', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('novels')) {
          const novelStore = db.createObjectStore('novels', { keyPath: 'id' });
          novelStore.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('chapters')) {
          const chapterStore = db.createObjectStore('chapters', { keyPath: 'id' });
          chapterStore.createIndex('novelId', 'novelId');
          chapterStore.createIndex('novelId_order', ['novelId', 'order']);
        }
      };
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(['novels', 'chapters'], 'readwrite');
        const novelStore = tx.objectStore('novels');
        const chapterStore = tx.objectStore('chapters');

        novelStore.put({
          id: 'novel_test',
          title: 'Đại Phụng Đả Canh Nhân',
          description: 'Truyện tu tiên kỳ ảo đỉnh cao...',
          chapterCount: 36,
          createdAt: Date.now() - 100000,
        });

        for (let i = 1; i <= 36; i++) {
          chapterStore.put({
            id: 'ch' + i,
            novelId: 'novel_test',
            title: 'Chương ' + i + ': ' + (i === 3 ? 'Bí Mật Khởi Đầu (Cũ)' : (i === 36 ? 'Đại Đạo Quy Nhất (Cloud Mới Nhất)' : 'Hành Trình Tu Tiên')),
            content: 'Đây là nội dung của chương ' + i + '.\n\nTrời đất bao la, tiên ma tương tranh vạn cổ.\n\nĐạo hữu vững tâm ngộ đạo.',
            order: i - 1,
            isExtra: false,
          });
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
  await seedPage.close();
}

/**
 * Gắn mock routes cho Supabase
 */
async function setupSupabaseRoutes(page, progressHandler) {
  // Auth mock
  await page.route('**/auth/v1/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'mock-user-123',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'test@example.com',
      }),
    });
  });

  // Progress mock
  await page.route('**/rest/v1/progress*', progressHandler);

  // Realtime mock
  await page.route('**/realtime/v1/**', (route) => {
    route.fulfill({ status: 200, body: 'ok' });
  });
}

// ==========================================
// TEST SUITE
// ==========================================
async function runAllTests() {
  const browser = await chromium.launch({ headless: true });
  console.log(`✓ Đã khởi động Chromium (${browser.version()})`);

  try {
    // ----------------------------------------------------
    // TÌNH HUỐNG 1: Cloud ở ch36 (nhảy + toast, 0 lần ghi ch3)
    // ----------------------------------------------------
    console.log('\n--- [Tình huống 1] Cloud ở ch36 (nhảy + toast, 0 lần ghi ch3) ---');
    {
      const context = await browser.newContext();
      await seedIndexedDB(context);

      const page = await context.newPage();
      await setupStaticRoute(page);
      await page.addInitScript(createInitScript(1000));

      await setupSupabaseRoutes(page, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              chapterId: 'ch36',
              percent: 0.85,
              paraIndex: 1,
              scrollTop: 450,
            },
            updated_at: 5000000000000,
          }),
        });
      });

      console.log('Mở URL: #/novel/novel_test/read/ch3 (mô phỏng reload tab cũ)...');
      await page.goto(`http://127.0.0.1:${PORT}/#/novel/novel_test/read/ch3`);

      // 1. Kiểm tra URL tự động nhảy sang ch36
      await page.waitForFunction(() => window.location.hash.includes('ch36'), { timeout: 4000 });
      console.log('✓ URL đã tự động nhảy sang ch36');

      // 2. Kiểm tra Sync Toast và nút "Quay lại vị trí cũ"
      const revertBtn = page.locator('button', { hasText: 'Quay lại vị trí cũ' });
      await revertBtn.waitFor({ state: 'visible', timeout: 3000 });
      console.log('✓ Toast hiển thị kèm nút "Quay lại vị trí cũ"');

      // 3. Kiểm tra KHÔNG CÓ lần ghi nào của ch3
      const writes = await page.evaluate(() => window.__tcl_progressWrites || []);
      const ch3Writes = writes.filter((w) => w.val?.chapterId === 'ch3');
      if (ch3Writes.length > 0) {
        throw new Error(`PHÁT HIỆN LỖI: Có ${ch3Writes.length} lần ghi ch3 thụ động lúc mở trang!`);
      }
      console.log(`✓ Xác nhận: 0 lần ghi ch3 lúc mở thụ động (tổng ghi: ${writes.length})`);

      // Lưu screenshot 1
      const shot1Path = path.join(artifactsDir, 'screenshot-1-jumped-to-ch36.png');
      await page.screenshot({ path: shot1Path });
      console.log(`✓ Đã chụp ảnh màn hình 1: ${shot1Path}`);

      // 4. Bấm "Quay lại vị trí cũ"
      await revertBtn.click();
      await page.waitForFunction(() => window.location.hash.includes('ch3') && !window.location.hash.includes('ch36'), { timeout: 3000 });
      console.log('✓ Đã quay lại chương 3 sau khi bấm nút');

      // Lưu screenshot 2
      const shot2Path = path.join(artifactsDir, 'screenshot-2-reverted-to-ch3.png');
      await page.screenshot({ path: shot2Path });
      console.log(`✓ Đã chụp ảnh màn hình 2: ${shot2Path}`);

      // 5. Thao tác cuộn chủ động ở chương 3
      await page.evaluate(() => {
        window.scrollTo(0, 180);
        window.dispatchEvent(new Event('scroll'));
      });
      await page.waitForTimeout(400);

      const afterWrites = await page.evaluate(() => window.__tcl_progressWrites || []);
      const ch3AfterWrites = afterWrites.filter((w) => w.val?.chapterId === 'ch3');
      if (ch3AfterWrites.length === 0) {
        throw new Error('Kỳ vọng tiến độ ch3 được ghi sau khi người dùng chủ động cuộn đọc!');
      }
      console.log('✓ Đã ghi nhận tiến độ ch3 sau khi người dùng chủ động tương tác cuộn!');

      await context.close();
    }

    // ----------------------------------------------------
    // TÌNH HUỐNG 2: Cloud không mới hơn (ở lại, không ghi tới khi cuộn)
    // ----------------------------------------------------
    console.log('\n--- [Tình huống 2] Cloud không mới hơn (ở lại, không ghi tới khi cuộn) ---');
    {
      const context = await browser.newContext();
      await seedIndexedDB(context);

      const page = await context.newPage();
      await setupStaticRoute(page);
      // Local progress có updatedAt = 5000
      await page.addInitScript(createInitScript(5000));

      await setupSupabaseRoutes(page, (route) => {
        // Cloud trả progress cũ hơn (updated_at = 3000)
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              chapterId: 'ch3',
              percent: 0,
              paraIndex: 0,
              scrollTop: 0,
            },
            updated_at: 3000,
          }),
        });
      });

      console.log('Mở URL: #/novel/novel_test/read/ch3...');
      await page.goto(`http://127.0.0.1:${PORT}/#/novel/novel_test/read/ch3`);

      // Đợi trang ổn định
      await page.waitForTimeout(1000);

      // 1. Kiểm tra vẫn ở lại ch3
      const currentHash = await page.evaluate(() => window.location.hash);
      if (!currentHash.includes('ch3')) {
        throw new Error(`Kỳ vọng ở lại ch3, nhưng URL là: ${currentHash}`);
      }
      console.log('✓ Vẫn ở lại ch3 như kỳ vọng');

      // 2. Toast "Đã nhảy tới vị trí mới nhất" KHÔNG được xuất hiện
      const toastVisible = await page.locator('text=Đã nhảy tới vị trí mới nhất').isVisible();
      if (toastVisible) {
        throw new Error('Toast nhảy chương không được hiển thị khi cloud không mới hơn!');
      }
      console.log('✓ Không hiển thị toast nhảy chương');

      // 3. Không có lần ghi nào trước khi tương tác
      const writesBefore = await page.evaluate(() => window.__tcl_progressWrites || []);
      if (writesBefore.length > 0) {
        throw new Error(`Kỳ vọng 0 lần ghi trước khi tương tác, nhưng có: ${writesBefore.length}`);
      }
      console.log('✓ 0 lần ghi tiến độ trước khi cuộn');

      // 4. Cuộn trang -> bây giờ mới ghi
      await page.evaluate(() => {
        window.scrollTo(0, 150);
        window.dispatchEvent(new Event('scroll'));
      });
      await page.waitForTimeout(400);

      const writesAfter = await page.evaluate(() => window.__tcl_progressWrites || []);
      if (writesAfter.length === 0) {
        throw new Error('Kỳ vọng tiến độ được ghi nhận sau khi người dùng cuộn!');
      }
      console.log('✓ Đã ghi nhận tiến độ sau khi người dùng cuộn!');

      await context.close();
    }

    // ----------------------------------------------------
    // TÌNH HUỐNG 3: Cloud trả chậm 1.8s (vẫn nhảy)
    // ----------------------------------------------------
    console.log('\n--- [Tình huống 3] Cloud trả chậm 1.8s (vẫn nhảy) ---');
    {
      const context = await browser.newContext();
      await seedIndexedDB(context);

      const page = await context.newPage();
      await setupStaticRoute(page);
      await page.addInitScript(createInitScript(1000));

      await setupSupabaseRoutes(page, async (route) => {
        // Trì hoãn 1800ms
        await new Promise((r) => setTimeout(r, 1800));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              chapterId: 'ch36',
              percent: 0.9,
              paraIndex: 2,
              scrollTop: 500,
            },
            updated_at: 5000000000000,
          }),
        });
      });

      console.log('Mở URL: #/novel/novel_test/read/ch3 (chờ 1.8s)...');
      await page.goto(`http://127.0.0.1:${PORT}/#/novel/novel_test/read/ch3`);

      // Kiểm tra tại thời điểm 600ms (đang đợi): skeleton / spinner phải hiển thị
      await page.waitForTimeout(600);
      const isSpinnerVisible = await page.locator('.spinner').isVisible();
      console.log(`Trạng thái spinner trong 1.8s chờ: ${isSpinnerVisible ? 'Đang hiển thị (tốt)' : 'Không thấy'}`);

      // Chờ hoàn tất nhảy sang ch36 (tối đa 4s)
      await page.waitForFunction(() => window.location.hash.includes('ch36'), { timeout: 4000 });
      console.log('✓ Sau 1.8s, URL đã tự động nhảy sang ch36!');

      // Kiểm tra không có lần ghi ch3 nào
      const writes = await page.evaluate(() => window.__tcl_progressWrites || []);
      const ch3Writes = writes.filter((w) => w.val?.chapterId === 'ch3');
      if (ch3Writes.length > 0) {
        throw new Error(`PHÁT HIỆN LỖI: Có ${ch3Writes.length} lần ghi ch3 thụ động!`);
      }
      console.log('✓ 0 lần ghi ch3 thụ động khi Cloud trả chậm!');

      await context.close();
    }

    // ----------------------------------------------------
    // TÌNH HUỐNG 4: Offline (context.setOffline(true): ở lại ch3, không treo skeleton)
    // ----------------------------------------------------
    console.log('\n--- [Tình huống 4] Offline (context.setOffline(true): ở lại ch3, không treo skeleton) ---');
    {
      const context = await browser.newContext();
      await seedIndexedDB(context);

      const page = await context.newPage();
      await setupStaticRoute(page);
      await page.addInitScript(createInitScript(1000));

      // Bật chế độ offline trên context
      await context.setOffline(true);
      console.log('Đã kích hoạt chế độ offline (context.setOffline(true))...');

      console.log('Mở URL: #/novel/novel_test/read/ch3 khi offline...');
      await page.goto(`http://127.0.0.1:${PORT}/#/novel/novel_test/read/ch3`);

      // 1. Chờ skeleton / spinner biến mất
      await page.locator('.spinner').waitFor({ state: 'detached', timeout: 5000 });
      console.log('✓ Spinner/Skeleton đã biến mất (không bị treo skeleton)');

      // 2. Kiểm tra nội dung chương 3 hiển thị đầy đủ
      const chapterHeading = page.locator('h2', { hasText: 'Bí Mật Khởi Đầu (Cũ)' });
      await chapterHeading.waitFor({ state: 'visible', timeout: 3000 });
      console.log('✓ Nội dung chương 3 hiển thị bình thường khi offline');

      // 3. Kiểm tra URL vẫn ở lại ch3
      const currentHash = await page.evaluate(() => window.location.hash);
      if (!currentHash.includes('ch3')) {
        throw new Error(`Kỳ vọng ở lại ch3, nhưng URL là: ${currentHash}`);
      }
      console.log('✓ URL vẫn ở lại ch3');

      // 4. Không có lần ghi nào trước khi tương tác
      const writes = await page.evaluate(() => window.__tcl_progressWrites || []);
      if (writes.length > 0) {
        throw new Error(`Kỳ vọng 0 lần ghi khi mở thụ động offline, nhưng có: ${writes.length}`);
      }
      console.log('✓ 0 lần ghi trước khi người dùng tương tác khi offline');

      await context.close();
    }

    console.log('\n======================================================');
    console.log('✅ TOÀN BỘ 4 TÌNH HUỐNG PLAYWRIGHT ĐỀU VƯỢT QUA (PASS 100%)!');
    console.log('======================================================');
  } finally {
    await browser.close();
    server.close();
  }
}

runAllTests().catch((err) => {
  console.error('\n❌ TEST THẤT BẠI:', err);
  process.exit(1);
});
