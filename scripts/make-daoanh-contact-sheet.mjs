/**
 * scripts/make-daoanh-contact-sheet.mjs
 * Chụp contact sheet của 42 Đạo Anh x 5 Kiếp (210 ảnh) bằng Playwright.
 * 
 * Mỗi hàng 1 Đạo Anh, 5 cột là 5 kiếp. Mỗi ô kích thước 150x150px,
 * có nền card thật của Đồ Lục, có vạch chữ thập đỏ mảnh đánh dấu tâm ô
 * và khung 94% mờ để dễ nhìn độ cân đối.
 * 
 * Kết quả chia thành 5 ảnh:
 * docs/dao-anh-contact-sheets/sheet-01.png -> sheet-05.png
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { DAO_ANH_LIST, getDaoAnhTransformStyle, getDaoAnhTransformConfig } from '../src/lib/daoAnhData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const WEBP_DIR = path.join(ROOT_DIR, 'src/assets/images/dao_anh_webp');
const OUT_DIR = path.join(ROOT_DIR, 'docs/dao-anh-contact-sheets');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

console.log('=== TẠO CONTACT SHEET ĐẠO ẢNH (scripts/make-daoanh-contact-sheet.mjs) ===\n');

// Phân chia 42 Đạo Anh thành 5 sheets: 9, 9, 8, 8, 8
const CHUNKS = [
  DAO_ANH_LIST.slice(0, 9),
  DAO_ANH_LIST.slice(9, 18),
  DAO_ANH_LIST.slice(18, 26),
  DAO_ANH_LIST.slice(26, 34),
  DAO_ANH_LIST.slice(34, 42),
];

function getImageBase64(da, kiep) {
  const rawPath = (Array.isArray(da.evolutionImages) && da.evolutionImages[kiep - 1]) || da.image;
  const cleanKey = path.basename(rawPath).replace(/\.[^.]+$/, '');
  const webpFile = path.join(WEBP_DIR, `${cleanKey}.webp`);
  if (!fs.existsSync(webpFile)) {
    console.warn(`[WARN] Không tìm thấy ảnh WebP: ${webpFile}`);
    return '';
  }
  const buffer = fs.readFileSync(webpFile);
  return `data:image/webp;base64,${buffer.toString('base64')}`;
}

function renderHtmlForChunk(chunkItems, sheetIndex) {
  let rowsHtml = '';
  for (const da of chunkItems) {
    let cellsHtml = '';
    for (let k = 1; k <= 5; k++) {
      const transformStyle = getDaoAnhTransformStyle(da, k, { size: 150, refSize: 185 });
      const cfg = getDaoAnhTransformConfig(da, k, { size: 150, refSize: 185 });
      const imgSrc = getImageBase64(da, k);
      const isAuto = cfg.isAuto ? ' [auto]' : '';
      const scaleText = `s: ${cfg.scale.toFixed(2)}${isAuto}`;

      cellsHtml += `
        <div class="card-cell">
          <!-- Crosshairs -->
          <div class="ch-h"></div>
          <div class="ch-v"></div>
          <!-- 94% box outline -->
          <div class="box-94"></div>
          <!-- Top-right Kiep badge -->
          <div class="kiep-badge">Kiếp ${k}</div>
          <!-- Bottom-left Scale tag -->
          <div class="scale-tag">${scaleText}</div>
          <!-- Inner art frame 94% x 94% -->
          <div class="art-frame">
            <img class="art-img" src="${imgSrc}" style="transform: ${transformStyle};" alt="${da.name} K${k}" />
          </div>
        </div>
      `;
    }

    const sourceLabel = da.sourceType === 'lamp' ? 'Mệnh Đăng' : 'Trấn Cung';
    rowsHtml += `
      <div class="row">
        <div class="row-info">
          <div class="da-name">${da.name}</div>
          <div class="da-id">${da.id}</div>
          <div class="da-meta">
            <span class="source-tag">${sourceLabel}</span>
            <span class="tier-tag">${da.tier || 'Thường'}</span>
          </div>
        </div>
        <div class="cells-container">
          ${cellsHtml}
        </div>
      </div>
    `;
  }

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Đạo Anh Contact Sheet ${sheetIndex + 1}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #070b14;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding: 24px;
      display: inline-block;
    }
    .sheet-header {
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(251, 191, 36, 0.25);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
    }
    .sheet-title {
      font-size: 20px;
      font-weight: 800;
      color: #fde047;
      letter-spacing: 0.5px;
    }
    .sheet-subtitle {
      font-size: 12px;
      color: #94a3b8;
    }
    .rows-container {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 16px;
      background: rgba(15, 23, 42, 0.45);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 12px 16px;
    }
    .row-info {
      width: 190px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .da-name {
      font-size: 14px;
      font-weight: 700;
      color: #f8fafc;
      line-height: 1.3;
    }
    .da-id {
      font-size: 11px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: #94a3b8;
      word-break: break-all;
    }
    .da-meta {
      display: flex;
      gap: 6px;
      margin-top: 4px;
    }
    .source-tag, .tier-tag {
      font-size: 10px;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #cbd5e1;
    }
    .cells-container {
      display: flex;
      gap: 12px;
    }
    .card-cell {
      width: 150px;
      height: 150px;
      position: relative;
      border-radius: 12px;
      background: linear-gradient(180deg, rgba(20, 30, 50, 0.6) 0%, rgba(10, 16, 30, 0.8) 100%);
      border: 1px solid rgba(255, 255, 255, 0.12);
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
      flex-shrink: 0;
    }
    /* Chữ thập đỏ mảnh đánh dấu tâm */
    .ch-h {
      position: absolute;
      top: 50%;
      left: 0;
      right: 0;
      height: 1px;
      background: rgba(239, 68, 68, 0.45);
      z-index: 5;
      pointer-events: none;
    }
    .ch-v {
      position: absolute;
      left: 50%;
      top: 0;
      bottom: 0;
      width: 1px;
      background: rgba(239, 68, 68, 0.45);
      z-index: 5;
      pointer-events: none;
    }
    /* Khung 94% mờ */
    .box-94 {
      position: absolute;
      inset: 3%;
      border: 1px dashed rgba(251, 191, 36, 0.35);
      border-radius: 8px;
      z-index: 4;
      pointer-events: none;
    }
    .kiep-badge {
      position: absolute;
      top: 6px;
      right: 6px;
      font-size: 10px;
      font-weight: 700;
      color: #fde047;
      background: rgba(0, 0, 0, 0.7);
      border: 1px solid rgba(251, 191, 36, 0.35);
      padding: 1px 6px;
      border-radius: 4px;
      z-index: 6;
      line-height: 1.2;
    }
    .scale-tag {
      position: absolute;
      bottom: 6px;
      left: 6px;
      font-size: 9px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: #94a3b8;
      background: rgba(0, 0, 0, 0.65);
      padding: 1px 4px;
      border-radius: 3px;
      z-index: 6;
      line-height: 1.2;
    }
    .art-frame {
      position: absolute;
      inset: 3%;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;
    }
    .art-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      transform-origin: 50% 50%;
      user-select: none;
    }
  </style>
</head>
<body>
  <div class="sheet-header">
    <div class="sheet-title">ĐẠO ANH ĐỒ LỤC — BẢNG KIỂM TRA ĐỒNG BỘ ẢNH (BẢNG ${sheetIndex + 1}/5)</div>
    <div class="sheet-subtitle">Khung 150x150 · Tâm hồng tâm đỏ · Viền vàng 94%</div>
  </div>
  <div class="rows-container">
    ${rowsHtml}
  </div>
</body>
</html>
  `;
}

async function run() {
  console.log('Khởi chạy Chromium headless...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    deviceScaleFactor: 2, // Tạo ảnh sắc nét x2 cho việc kiểm tra
  });

  for (let i = 0; i < CHUNKS.length; i++) {
    const chunk = CHUNKS[i];
    const sheetNum = String(i + 1).padStart(2, '0');
    const outFileName = `sheet-${sheetNum}.png`;
    const outFilePath = path.join(OUT_DIR, outFileName);

    console.log(`Đang sinh ${outFileName} (${chunk.length} Đạo Anh)...`);
    const page = await context.newPage();
    const html = renderHtmlForChunk(chunk, i);
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForTimeout(300); // Đảm bảo render xong toàn bộ hình ảnh

    const bodyHandle = await page.$('body');
    await bodyHandle.screenshot({ path: outFilePath });
    await page.close();
    console.log(`-> Đã lưu ${outFilePath}`);
  }

  await browser.close();
  console.log('\n=== HOÀN TẤT SINH 5 CONTACT SHEETS ===');
}

run().catch((err) => {
  console.error('Lỗi khi sinh contact sheet:', err);
  process.exit(1);
});
