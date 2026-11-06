import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const outDir = path.resolve(__dirname, '../docs/ui-redesign/leftover');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const PORT = 4197;
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

async function run() {
  console.log('--- STARTING PHASE 1 VISUAL VERIFICATION ---');
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Navigate to root to seed novel & chapters
  await page.goto(`${BASE_URL}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // Seed sample data in IndexedDB
  await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const req = indexedDB.open('thien-co-lau');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

    const tx = db.transaction(['novels', 'chapters'], 'readwrite');
    const novelStore = tx.objectStore('novels');
    const chapterStore = tx.objectStore('chapters');

    await new Promise((r) => {
      const req = novelStore.put({
        id: 'icon-test-novel',
        title: 'Phàm Nhân Tu Tiên Chi Phong Lôi Biến',
        author: 'Vong Ngữ',
        description: 'Bộ truyện kinh điển tu tiên giới mô tả hành trình từ phàm nhân đến đại năng.',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      req.onsuccess = r;
    });

    for (let i = 1; i <= 5; i++) {
      chapterStore.put({
        id: `icon-ch-${i}`,
        novelId: 'icon-test-novel',
        chapterNumber: i,
        title: `Chương ${i}: Huyền Thiên Trảm Linh Kiếm`,
        content: `Đoạn văn thứ nhất của chương ${i}.\n\nHàn Lập ngồi xếp bằng trên bồ đoàn, khí tức toàn thân nội liễm...\n\nThần niệm đảo qua, vạn vật đều hiện rõ mồn một.`,
        wordCount: 180,
        createdAt: Date.now() - (6 - i) * 1000,
      });
    }

    await new Promise((r) => {
      tx.oncomplete = r;
    });
  });

  // 1. Reader top bar at 390px (Mobile)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}/#/novel/icon-test-novel/read/icon-ch-1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, 'reader-topbar-mobile-390.png') });

  // 2. Reader top bar at 1366px (Desktop)
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, 'reader-topbar-desktop-1366.png') });

  // 3. Global Replace Modal (click button 3)
  const replaceBtn = page.locator('button[aria-label="Tìm & Thay thế toàn bộ truyện"]').first();
  await replaceBtn.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, 'global-replace-modal-desktop.png') });

  // Mobile replace modal
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, 'global-replace-modal-mobile.png') });

  // Close replace modal
  const closeReplaceBtn = page.locator('button[aria-label="Đóng"]').first();
  await closeReplaceBtn.click();
  await page.waitForTimeout(300);

  // 4. Reading Settings modal
  const settingsBtn = page.locator('button[aria-label="Cài đặt đọc"]').first();
  await settingsBtn.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, 'reading-settings-mobile.png') });
  // Close settings modal by pressing Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 5. Add Chapter Page - Tab 1 (Manual)
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`${BASE_URL}/#/novel/icon-test-novel/add-chapter`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, 'add-chapter-tab1-manual.png') });

  // Add Chapter Page - Tab 2 (From file)
  const fileTabBtn = page.locator('button:has-text("Thêm từ file"), button:has-text("File TXT / ZIP")').first();
  if (await fileTabBtn.count() > 0) {
    await fileTabBtn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, 'add-chapter-tab2-file.png') });
  }

  // 6. LobbyTabs (LibraryPage)
  await page.goto(`${BASE_URL}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, 'lobby-tabs-library.png') });

  // 7. ComicsPage (Tàng Kinh Họa Các)
  await page.goto(`${BASE_URL}/#/comics`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, 'comics-lobby.png') });

  // 8. Novel Export Modal
  await page.goto(`${BASE_URL}/#/novel/icon-test-novel`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  // Click export/download button if present or test popover
  const moreBtn = page.locator('button[aria-label*="Tùy chọn"], button[aria-label*="Thao tác"]').first();
  if (await moreBtn.count() > 0) {
    await moreBtn.click();
    await page.waitForTimeout(300);
    const exportOpt = page.locator('button:has-text("Tải truyện về máy"), button:has-text("Xuất truyện")').first();
    if (await exportOpt.count() > 0) {
      await exportOpt.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(outDir, 'novel-export-modal.png') });
    }
  }

  await browser.close();
  server.close();

  // Audit screenshot files
  const generatedFiles = fs.readdirSync(outDir);
  console.log(`Generated screenshots in ${outDir}:`, generatedFiles);
  for (const f of generatedFiles) {
    const fPath = path.join(outDir, f);
    const stat = fs.statSync(fPath);
    console.log(`  - ${f}: ${(stat.size / 1024).toFixed(1)} KB`);
    if (stat.size > 400 * 1024) {
      console.warn(`Warning: ${f} exceeds 400KB`);
    }
  }

  console.log('✅ Phase 1 Visual Verification Complete!');
  process.exit(0);
}

run().catch((err) => {
  console.error('Error in phase 1 test:', err);
  process.exit(1);
});
