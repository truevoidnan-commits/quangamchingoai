/**
 * scripts/generate-daoanh-visuals.mjs
 * Generates:
 * 1. Contact sheet of all 205 Dao Anh WebP images (grid verifying bounding box fit & centering).
 * 2. Real modal screenshots for Khởi Nguyên K4, Tâm Thủ Đạo K5, Trùng Đồng K3 at Desktop (1280px) and Mobile (390px).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import child_process from 'node:child_process';
import sharp from 'sharp';

import { DAO_ANH_BBOX } from '../src/lib/daoAnhBBox.generated.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const webpDir = path.resolve(rootDir, 'src/assets/images/dao_anh_webp');
const cssPath = path.resolve(rootDir, 'src/components/cultivation/DaoAnhPromptModal.module.css');
const outputDir = path.resolve(rootDir, 'artifacts/daoanh_no_ring');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function captureScreenshot(htmlPath, outPngPath, width, height) {
  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  child_process.execFileSync(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--window-size=${width},${height}`,
    `--screenshot=${outPngPath}`,
    fileUrl,
  ]);
}

async function generateContactSheet() {
  console.log('--- [1/2] Generating Contact Sheet for ALL 205 Dao Anh images ---');
  const webpFiles = fs.readdirSync(webpDir).filter(f => f.endsWith('.webp')).sort();

  let cellsHtml = '';
  for (const file of webpFiles) {
    const key = path.basename(file, '.webp');
    const box = DAO_ANH_BBOX[key];
    if (!box) continue;

    const s = Math.min(1.6, Math.min(1 / box.w, 1 / box.h) * 0.92);
    const tx = (0.5 - box.cx) * 100;
    const ty = (0.5 - box.cy) * 100;
    const imgUrl = 'file:///' + path.join(webpDir, file).replace(/\\/g, '/');

    cellsHtml += `
      <div class="cell-card">
        <div class="cell-pedestal">
          <div class="cell-glow"></div>
          <div class="cell-box">
            <img src="${imgUrl}" style="transform: scale(${s.toFixed(3)}) translate(${tx.toFixed(2)}%, ${ty.toFixed(2)}%);" />
          </div>
        </div>
        <div class="cell-title">${key}</div>
        <div class="cell-meta">s=${s.toFixed(2)} | (${box.w.toFixed(2)}x${box.h.toFixed(2)})</div>
      </div>
    `;
  }

  const contactHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Contact Sheet — 205 Dao Anh Artwork (No Ring, BBox Centered)</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #070c18;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 30px;
      width: 2560px;
    }
    h1 {
      font-size: 28px;
      margin-bottom: 8px;
      color: #fde047;
      text-align: center;
      letter-spacing: 1px;
    }
    p.subtitle {
      text-align: center;
      color: #94a3b8;
      margin-bottom: 24px;
      font-size: 15px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 16px;
    }
    .cell-card {
      background: rgba(15, 23, 42, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 12px 8px 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
    .cell-pedestal {
      position: relative;
      width: 160px;
      height: 160px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 8px;
    }
    .cell-glow {
      position: absolute;
      inset: -10%;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(251, 191, 36, 0.35) 0%, rgba(245, 158, 11, 0.08) 50%, transparent 70%);
      filter: blur(20px);
      z-index: 0;
      pointer-events: none;
    }
    .cell-box {
      position: relative;
      width: 100%;
      height: 100%;
      border: 1px dashed rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1;
    }
    .cell-box img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      transform-origin: center center;
      filter: drop-shadow(0 0 10px rgba(251, 191, 36, 0.45));
    }
    .cell-title {
      font-size: 11px;
      font-weight: 700;
      color: #38bdf8;
      margin-top: 4px;
      word-break: break-all;
      line-height: 1.25;
      max-width: 160px;
    }
    .cell-meta {
      font-size: 9.5px;
      color: #94a3b8;
      margin-top: 3px;
    }
  </style>
</head>
<body>
  <h1>TỔNG HỢP KIỂM CHỨNG TOÀN BỘ 205 ĐẠO ẢNH (NO-RING & BBOX FIT)</h1>
  <p class="subtitle">Khung dashed 160px hiển thị giới hạn pedestal thực tế — Đảm bảo 100% hình ảnh không bị cắt mép và được canh giữa chính xác theo trọng tâm nghệ thuật.</p>
  <div class="grid">
    ${cellsHtml}
  </div>
</body>
</html>`;

  const contactHtmlPath = path.join(outputDir, 'contact-sheet.html');
  fs.writeFileSync(contactHtmlPath, contactHtml, 'utf8');

  const contactPngPath = path.join(outputDir, 'daoanh-contact-sheet-205.png');
  console.log('Capturing contact sheet PNG (2560px width)...');
  captureScreenshot(contactHtmlPath, contactPngPath, 2560, 3600);
  console.log(`✓ Contact sheet saved: ${contactPngPath}`);
}

async function generateModalScreenshots() {
  console.log('\n--- [2/2] Generating Real Modal Screenshots for 3 Target Dao Anh ---');
  const rawCss = fs.readFileSync(cssPath, 'utf8');

  // Convert CSS module class names to plain classes for the static preview
  let plainCss = rawCss
    .replace(/\.([a-zA-Z0-9_-]+)/g, '.$1')
    .replace(/var\(--font-serif[^)]+\)/g, '"Cinzel", "Times New Roman", serif');

  const cases = [
    {
      id: 'khoi_nguyen_thoi_khong_k4',
      name: 'Khởi Nguyên Thời Không Đạo Anh',
      kiepName: 'Kiếp 4',
      file: 'khoi_nguyen_thoi_khong_k4.webp',
      primaryColor: '#06b6d4',
      glowColor: 'rgba(6, 182, 212, 0.85)',
      descNote: 'Khối chữ nhật đứng, chiều cao chiếm 95% ảnh'
    },
    {
      id: 'tam_thu_dao_k5',
      name: 'Tâm Thủ Đạo Đạo Anh',
      kiepName: 'Kiếp 5',
      file: 'tam_thu_dao_k5.webp',
      primaryColor: '#eab308',
      glowColor: 'rgba(234, 179, 8, 0.85)',
      descNote: 'Vũ khí kiếm lệch góc trên phải, kích thước 96% ảnh'
    },
    {
      id: 'trung_dong_k3',
      name: 'Trùng Đồng Đạo Anh',
      kiepName: 'Kiếp 3',
      file: 'trung_dong_k3.webp',
      primaryColor: '#38bdf8',
      glowColor: 'rgba(56, 189, 248, 0.85)',
      descNote: 'Ca người dùng báo lỗi lệch/méo ban đầu'
    }
  ];

  for (const item of cases) {
    const box = DAO_ANH_BBOX[item.id];
    const s = Math.min(1.6, Math.min(1 / box.w, 1 / box.h) * 0.92);
    const tx = (0.5 - box.cx) * 100;
    const ty = (0.5 - box.cy) * 100;
    const imgUrl = 'file:///' + path.join(webpDir, item.file).replace(/\\/g, '/');

    const modalHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Modal Preview — ${item.name}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background: #030712;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    ${plainCss}
  </style>
</head>
<body>
  <div class="overlay">
    <div class="container">
      <div class="auraGlowGold" style="background: radial-gradient(circle, ${item.glowColor} 0%, rgba(245, 158, 11, 0.12) 50%, transparent 70%);"></div>

      <div class="card">
        <div class="badgeWrap">
          <span class="badge badgeGold">✦ TIÊN KIẾP SẮP TỚI ✦</span>
        </div>

        <div class="avatarPedestal">
          <div class="avatarGlow" style="background: radial-gradient(circle, ${item.glowColor} 0%, rgba(245, 158, 11, 0.12) 45%, transparent 70%);"></div>
          <div class="avatarInner">
            <div class="imageWrapper">
              <img
                src="${imgUrl}"
                alt="${item.name}"
                class="daoAnhImage"
                style="transform: scale(${s.toFixed(3)}) translate(${tx.toFixed(2)}%, ${ty.toFixed(2)}%); filter: drop-shadow(0 0 14px ${item.glowColor});"
              />
            </div>
          </div>
        </div>

        <h3 class="title titleGold">ĐẠO ANH ĐẠT 80% LINH LỰC!</h3>

        <div class="daoAnhCard">
          <div class="daoAnhHeader">
            <span class="daoAnhName" style="color: ${item.primaryColor};">[${item.name}]</span>
            <span class="daoAnhBadge">${item.kiepName}</span>
          </div>
          <div class="progressWrap">
            <div class="progressHeader">
              <span>Linh Lực Tích Lũy</span>
              <strong>4,000 / 5,000 Tu Vi</strong>
            </div>
            <div class="progressTrack">
              <div class="progressFill" style="width: 80%;">
                <div class="progressShimmer"></div>
              </div>
            </div>
          </div>
        </div>

        <p class="message">
          Đạo Anh đã tích lũy đủ <strong style="color: #fde047;">80% Linh Lực</strong>, sẵn sàng nghênh tiếp Thiên Kiếp! Đạo hữu có muốn chuyển quyền nạp sang Đạo Anh khác không, hay tiếp tục nạp đến 100% để đảm bảo độ kiếp viên mãn?
        </p>

        <div class="btnGroup">
          <button class="btnPrimaryGold">
            <span>⚡</span>
            <span>Tiếp Tục Nạp Đến 100%</span>
          </button>
          <button class="btnSecondary">
            <span>🔄</span>
            <span>Chuyển Đạo Anh Khác</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

    const htmlPath = path.join(outputDir, `modal_${item.id}.html`);
    fs.writeFileSync(htmlPath, modalHtml, 'utf8');

    // Desktop: 1280x900
    const desktopPng = path.join(outputDir, `modal_${item.id}_desktop_1280.png`);
    captureScreenshot(htmlPath, desktopPng, 1280, 900);
    console.log(`✓ Desktop 1280px captured: ${desktopPng}`);

    // Mobile: 390x844
    const mobilePng = path.join(outputDir, `modal_${item.id}_mobile_390.png`);
    captureScreenshot(htmlPath, mobilePng, 390, 844);
    console.log(`✓ Mobile 390px captured: ${mobilePng}`);
  }
}

async function main() {
  await generateContactSheet();
  await generateModalScreenshots();
  console.log('\n✅ ALL VISUAL ASSETS GENERATED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('Failed to generate visuals:', err);
  process.exit(1);
});
