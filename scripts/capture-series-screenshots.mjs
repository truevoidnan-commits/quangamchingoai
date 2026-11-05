import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const outDir = path.resolve(__dirname, '../docs/ui-redesign/series');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const PORT = 4192;
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
  // Compress PNG with palette mode & compression level 9 to keep file strictly under 400KB
  let optimized = await sharp(buffer)
    .png({ quality: 90, compressionLevel: 9, palette: true })
    .toBuffer();

  if (optimized.length > 390 * 1024) {
    // If still large, resize slightly or reduce colors
    optimized = await sharp(buffer)
      .png({ colours: 192, compressionLevel: 9, palette: true })
      .toBuffer();
  }

  fs.writeFileSync(targetPath, optimized);
  const kb = optimized.length / 1024;
  console.log(`Saved: ${targetPath} (${kb.toFixed(1)} KB) - ${kb < 400 ? 'PASS < 400KB' : 'FAIL'}`);
}

async function capture() {
  console.log('--- BẮT ĐẦU CHỤP ẢNH MINH HỌA GIAO DIỆN COMIC SERIES PAGE ---');
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

  // Navigate to app first
  await page.goto(`${BASE_URL}/#/comics`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // Seed IndexedDB mock data
  console.log('Seeding 121 volumes with color cover and importState: "ready"...');
  await page.evaluate(async () => {
    // Generate color cover blob in browser canvas
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 840;
    const ctx = canvas.getContext('2d');

    // Rich gradient background (purple to dark indigo)
    const grad = ctx.createLinearGradient(0, 0, 600, 840);
    grad.addColorStop(0, '#4c1d95');
    grad.addColorStop(0.45, '#1e1b4b');
    grad.addColorStop(1, '#09090b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 600, 840);

    // Cosmic nebula highlights
    ctx.fillStyle = 'rgba(234, 179, 8, 0.2)';
    ctx.beginPath();
    ctx.arc(300, 300, 240, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(168, 85, 247, 0.3)';
    ctx.beginPath();
    ctx.arc(150, 500, 180, 0, Math.PI * 2);
    ctx.fill();

    // Gold frame
    ctx.strokeStyle = 'rgba(255, 204, 0, 0.6)';
    ctx.lineWidth = 12;
    ctx.strokeRect(20, 20, 560, 800);

    ctx.strokeStyle = 'rgba(255, 204, 0, 0.3)';
    ctx.lineWidth = 3;
    ctx.strokeRect(32, 32, 536, 776);

    // Gold Title text
    ctx.fillStyle = '#ffcc00';
    ctx.shadowColor = '#ffcc00';
    ctx.shadowBlur = 15;
    ctx.font = 'bold 54px serif';
    ctx.textAlign = 'center';
    ctx.fillText('RENAME AI', 300, 380);

    ctx.shadowBlur = 8;
    ctx.font = '28px sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('THÔN PHỆ TINH KHÔNG', 300, 440);

    ctx.font = 'italic 22px serif';
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('121 TẬP HOÀN CHỈNH', 300, 500);

    // Convert to Blob
    const coverBlob = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.9));

    // Open IDB
    const req = indexedDB.open('thien-co-lau-comics', 1);
    await new Promise((resolve, reject) => {
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(['series', 'volumes'], 'readwrite');
        const seriesStore = tx.objectStore('series');
        const volStore = tx.objectStore('volumes');

        // Series with 121 volumes
        const s121 = {
          id: 'series-renameai-121',
          title: 'RenameAI',
          coverBlob,
          totalPages: 8075,
          totalBytes: 1116691456, // 1.04 GB
          createdAt: Date.now() - 30 * 86400000,
          updatedAt: Date.now(),
        };
        seriesStore.put(s121);

        // Empty series
        const sEmpty = {
          id: 'series-empty-test',
          title: 'Bộ Truyện Mới (Chưa Có Tập)',
          coverBlob: null,
          totalPages: 0,
          totalBytes: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        seriesStore.put(sEmpty);

        // Seed 121 volumes with importState = 'ready'
        for (let i = 1; i <= 121; i++) {
          const pages = 40 + (i % 25);
          const bytes = Math.round(pages * 115000 + (i * 1234));
          const volId = `vol-${i}`;
          volStore.put({
            id: volId,
            seriesId: 'series-renameai-121',
            title: i === 1 ? 'Tập 1 - Thức Tỉnh Đấu Hồn' : i === 2 ? 'Tập 2 - Đại Niết Bàn' : `Tập ${i}`,
            order: i,
            pageCount: pages,
            totalBytes: bytes,
            quality: 'balanced',
            importState: 'ready',
            createdAt: Date.now() - (122 - i) * 3600000,
            updatedAt: Date.now() - (122 - i) * 3600000,
          });
        }

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    // Set Reading progress for Volume 1: Page 18/41 (index 17)
    localStorage.setItem(
      'tcl_comic_progress_vol-1',
      JSON.stringify({
        pageIndex: 17, // Page 18
        scrollPercent: 44,
        updatedAt: Date.now(),
      })
    );

    // Set Completed progress for Volume 2
    localStorage.setItem(
      'tcl_comic_progress_vol-2',
      JSON.stringify({
        pageIndex: 44, // Page 45 of 45 -> completed
        scrollPercent: 100,
        updatedAt: Date.now() - 100000,
      })
    );
  });

  console.log('Mock data seeded successfully.');

  // ==========================================
  // 1. Screenshot: Desktop 1280x800 - 121 Volumes
  // ==========================================
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => { window.location.hash = '#/comics/series-renameai-121'; });
  await page.waitForSelector('text=RenameAI', { timeout: 10000 });
  await page.waitForSelector('text=Tập 1 - Thức Tỉnh Đấu Hồn', { timeout: 10000 });
  await page.waitForTimeout(600);

  const shot1Desktop = path.join(outDir, '01-series-121-volumes-desktop.png');
  const buf1Desktop = await page.screenshot();
  await saveOptimizedPng(buf1Desktop, shot1Desktop);

  // ==========================================
  // 1b. Screenshot: Mobile 390x844 - 121 Volumes
  // ==========================================
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const shot1Mobile = path.join(outDir, '01-series-121-volumes.png');
  const buf1Mobile = await page.screenshot();
  await saveOptimizedPng(buf1Mobile, shot1Mobile);

  // ==========================================
  // 2. Screenshot: Volume Action Menu Open (BottomSheet)
  // ==========================================
  const moreBtn = await page.locator('button[aria-label="Tùy chọn khác"]').first();
  await moreBtn.click();
  await page.waitForSelector('[class*="menuSheet"]');
  await page.waitForTimeout(400);

  const shot2Menu = path.join(outDir, '02-volume-menu-bottomsheet.png');
  const buf2Menu = await page.screenshot();
  await saveOptimizedPng(buf2Menu, shot2Menu);

  // Close BottomSheet
  const closeBtn = await page.locator('button[aria-label="Đóng menu"]');
  await closeBtn.click();
  await page.waitForTimeout(300);

  // ==========================================
  // 3. Screenshot: Volume In-Progress State (Trang 18/41 + Gold Bar)
  // ==========================================
  const shot3Progress = path.join(outDir, '03-volume-in-progress.png');
  const firstRow = await page.locator('[class*="volumeRow"]').first();
  await firstRow.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const buf3Progress = await page.screenshot();
  await saveOptimizedPng(buf3Progress, shot3Progress);

  // ==========================================
  // 4. Screenshot: Filter No Results State
  // ==========================================
  const searchInput = await page.locator('input[aria-label="Tìm tập hoặc số"]');
  await searchInput.fill('xyz-khong-ton-tai');
  await page.waitForSelector('text=Không có tập phù hợp');
  await page.waitForTimeout(300);

  const shot4Filter = path.join(outDir, '04-series-filter-no-results.png');
  const buf4Filter = await page.screenshot();
  await saveOptimizedPng(buf4Filter, shot4Filter);

  // Clear filter
  const clearFilterBtn = await page.locator('button:has-text("Xóa bộ lọc")');
  await clearFilterBtn.click();
  await page.waitForTimeout(300);

  // ==========================================
  // 5. Screenshot: Empty Series State
  // ==========================================
  await page.evaluate(() => { window.location.hash = '#/comics/series-empty-test'; });
  await page.waitForSelector('text=Chưa có tập nào');
  await page.waitForTimeout(400);

  const shot5Empty = path.join(outDir, '05-series-empty.png');
  const buf5Empty = await page.screenshot();
  await saveOptimizedPng(buf5Empty, shot5Empty);

  await browser.close();
  server.close();

  // Summary check
  console.log('\n--- BÁO CÁO TỔNG HỢP ẢNH ĐÃ CHỤP (< 400 KB) ---');
  const files = fs.readdirSync(outDir);
  let allPass = true;
  for (const f of files) {
    const s = fs.statSync(path.join(outDir, f));
    const kb = s.size / 1024;
    const ok = kb <= 400;
    if (!ok) allPass = false;
    console.log(`  ✓ ${f}: ${kb.toFixed(1)} KB (Đạt chuẩn < 400KB: ${ok ? 'YES' : 'NO'})`);
  }

  if (allPass) {
    console.log('\n=== TẤT CẢ ẢNH ĐÃ ĐẠT CHUẨN VÀ DƯỚI 400KB 100%! ===');
    process.exit(0);
  } else {
    console.error('Một số ảnh vượt quá 400KB!');
    process.exit(1);
  }
}

capture().catch((err) => {
  console.error('Lỗi khi chụp ảnh:', err);
  process.exit(1);
});
