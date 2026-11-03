/**
 * scripts/make-comic-benchmark-pdf.mjs
 * 
 * Sinh file PDF truyện tranh giả lập thực tế:
 * - Khổ trang lớn: 2000x3000 px
 * - Phong cách manga xám (grayscale / screentone):
 *   + Nét vẽ mực đen (ink borders, action speedlines, speech bubbles)
 *   + Chấm lưới (screentone halftones) góc 45 độ
 *   + KHÔNG dùng nhiễu ngẫu nhiên (noise) làm sai lệch tỉ lệ nén
 * - 40 - 60 trang, ghi ra thư mục tạm (không commit vào repo)
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'node:http';
import { chromium } from 'playwright';

/**
 * Tạo buffer ảnh JPEG của một trang manga mẫu 2000x3000 với panel, nét vẽ và chấm lưới
 */
export async function createMangaPageBuffer(pageNum, totalPages, width = 2000, height = 3000) {
  // SVG template với panel manga, speedlines và screentone pattern chuẩn
  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Chấm lưới Screentone tiêu chuẩn manga (Pitch 16px, Dot r=3.5px) -->
        <pattern id="screentone-light" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <circle cx="8" cy="8" r="3" fill="#555555" />
        </pattern>
        <!-- Chấm lưới Screentone đậm hơn (Dot r=5.5px) -->
        <pattern id="screentone-dark" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <circle cx="8" cy="8" r="5.5" fill="#333333" />
        </pattern>
        <!-- Đường gạch chéo hành động (Speedlines pattern) -->
        <pattern id="speedlines" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(60)">
          <line x1="0" y1="0" x2="0" y2="20" stroke="#222222" stroke-width="2.5" />
        </pattern>
      </defs>

      <!-- Nền giấy truyện tranh trắng/xám nhẹ -->
      <rect width="${width}" height="${height}" fill="#fcfcfc" />

      <!-- Viền khung trang (Margin 80px) -->
      <!-- Panel 1: Trên cùng (Rộng ngang) -->
      <g transform="translate(100, 100)">
        <rect width="1800" height="750" fill="#ffffff" stroke="#111111" stroke-width="8" />
        <!-- Vùng screentone trời đêm -->
        <rect x="10" y="10" width="1780" height="400" fill="url(#screentone-dark)" />
        <circle cx="1500" cy="180" r="100" fill="#ffffff" stroke="#111111" stroke-width="6" />
        <!-- Nét vẽ kiếm khí / tia sét -->
        <path d="M 100 650 L 500 300 L 700 450 L 1200 150 L 1700 600" fill="none" stroke="#111111" stroke-width="12" />
        <text x="120" y="700" font-family="sans-serif" font-size="48" font-weight="900" fill="#111111">
          HỒI ${pageNum}: VẠN KIẾM QUY TÔNG (TRANG ${pageNum}/${totalPages})
        </text>
      </g>

      <!-- Panel 2: Trái giữa (Hành động & Speedlines) -->
      <g transform="translate(100, 900)">
        <rect width="870" height="950" fill="#ffffff" stroke="#111111" stroke-width="8" />
        <!-- Lớp speedlines nền -->
        <rect x="10" y="10" width="850" height="930" fill="url(#speedlines)" opacity="0.6" />
        <!-- Hình bóng nhân vật thi triển chưởng pháp -->
        <polygon points="435,200 550,500 700,750 170,750 320,500" fill="#111111" />
        <!-- Bong bóng thoại gào thét -->
        <ellipse cx="600" cy="280" rx="200" ry="120" fill="#ffffff" stroke="#111111" stroke-width="6" />
        <text x="470" y="270" font-family="sans-serif" font-size="36" font-weight="bold" fill="#111111">
          PHÁ CHO TA!
        </text>
        <text x="460" y="320" font-family="sans-serif" font-size="30" font-weight="bold" fill="#666666">
          THIÊN ĐỊA BIẾN HÓA
        </text>
      </g>

      <!-- Panel 3: Phải giữa (Đặc tả chi tiết / Screentone) -->
      <g transform="translate(1030, 900)">
        <rect width="870" height="950" fill="#ffffff" stroke="#111111" stroke-width="8" />
        <rect x="10" y="10" width="850" height="930" fill="url(#screentone-light)" />
        <circle cx="435" cy="450" r="280" fill="#ffffff" stroke="#111111" stroke-width="7" />
        <!-- Mắt thần thức / trận pháp -->
        <circle cx="435" cy="450" r="160" fill="none" stroke="#111111" stroke-width="10" />
        <line x1="200" y1="450" x2="670" y2="450" stroke="#111111" stroke-width="8" />
        <line x1="435" y1="200" x2="435" y2="700" stroke="#111111" stroke-width="8" />
      </g>

      <!-- Panel 4: Dưới cùng (Toàn cảnh) -->
      <g transform="translate(100, 1900)">
        <rect width="1800" height="950" fill="#ffffff" stroke="#111111" stroke-width="8" />
        <!-- Dãy núi viền mực & screentone -->
        <polygon points="0,900 300,500 600,700 950,400 1300,650 1600,450 1800,900" fill="url(#screentone-light)" stroke="#111111" stroke-width="6" />
        <!-- Chú thích người dẫn truyện -->
        <rect x="1200" y="70" width="520" height="160" fill="#ffffff" stroke="#111111" stroke-width="5" />
        <text x="1230" y="130" font-family="sans-serif" font-size="34" font-weight="bold" fill="#111111">
          Thiên Cơ Lâu · Quyển ${Math.ceil(pageNum / 20)}
        </text>
        <text x="1230" y="180" font-family="sans-serif" font-size="28" fill="#444444">
          Tập truyện tranh chuẩn manga
        </text>
      </g>

      <!-- Số trang góc dưới -->
      <text x="${width / 2}" y="${height - 40}" text-anchor="middle" font-family="sans-serif" font-size="32" font-weight="bold" fill="#666666">
        — ${pageNum} —
      </text>
    </svg>
  `;

  // Render SVG thành JPEG chất lượng cao
  return sharp(Buffer.from(svg))
    .jpeg({ quality: 88, chromaSubsampling: '4:2:0' })
    .toBuffer();
}

/**
 * Sinh file PDF truyện tranh giả lập với số trang chỉ định
 * 
 * @param {string} [outputPath] - Đường dẫn xuất file PDF (mặc định trong os.tmpdir())
 * @param {number} [pageCount=45] - Số trang cần tạo (40-60 trang)
 * @returns {Promise<{ path: string, sizeBytes: number, sizeMb: string, pageCount: number }>}
 */
export async function generateComicBenchmarkPdf(outputPath, pageCount = 45) {
  const targetPath = outputPath || path.join(os.tmpdir(), `comic-benchmark-${Date.now()}.pdf`);
  const tmpDir = path.join(os.tmpdir(), `tcl_comic_pages_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  console.log(`[make-comic-benchmark-pdf] Đang sinh ${pageCount} trang manga thực tế (2000x3000px)...`);

  const width = 2000;
  const height = 3000;
  const pageFiles = [];

  // Để sinh 40-60 trang nhanh chóng mà vẫn đa dạng trang, tạo 6 trang layout khác nhau và lặp lại
  const distinctVariations = 6;
  const variationFiles = [];

  for (let v = 1; v <= distinctVariations; v++) {
    const filename = `template_${v}.jpg`;
    const filepath = path.join(tmpDir, filename);
    const buf = await createMangaPageBuffer(v, pageCount, width, height);
    fs.writeFileSync(filepath, buf);
    variationFiles.push(filename);
  }

  // Khởi động server HTTP tạm để Chromium kéo ảnh render PDF
  const server = http.createServer((req, res) => {
    const cleanName = path.basename(req.url);
    const filepath = path.join(tmpDir, cleanName);
    if (fs.existsSync(filepath)) {
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      fs.createReadStream(filepath).pipe(res);
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  const port = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server.address().port);
    });
  });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const widthIn = `${(width / 72).toFixed(4)}in`;
  const heightIn = `${(height / 72).toFixed(4)}in`;

  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @page { size: ${widthIn} ${heightIn}; margin: 0; }
        body { margin: 0; padding: 0; background: #000; }
        .manga-page {
          width: ${widthIn};
          height: ${heightIn};
          page-break-after: always;
          position: relative;
        }
        img { width: 100%; height: 100%; display: block; }
      </style>
    </head>
    <body>
  `;

  for (let i = 1; i <= pageCount; i++) {
    const vIndex = (i - 1) % distinctVariations;
    html += `
      <div class="manga-page">
        <img src="http://127.0.0.1:${port}/${variationFiles[vIndex]}" />
      </div>
    `;
  }
  html += '</body></html>';

  await page.setContent(html, { waitUntil: 'load' });
  await page.pdf({
    path: targetPath,
    width: widthIn,
    height: heightIn,
    printBackground: true,
  });

  await browser.close();
  server.close();

  // Dọn dẹp thư mục ảnh tạm
  fs.rmSync(tmpDir, { recursive: true, force: true });

  const stat = fs.statSync(targetPath);
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
  console.log(`[make-comic-benchmark-pdf] ✓ Đã sinh xong PDF benchmark: ${targetPath} (${sizeMb} MB, ${pageCount} trang)`);

  return {
    path: targetPath,
    sizeBytes: stat.size,
    sizeMb,
    pageCount,
  };
}

// Nếu gọi trực tiếp từ dòng lệnh
if (process.argv[1] && process.argv[1].endsWith('make-comic-benchmark-pdf.mjs')) {
  const count = parseInt(process.argv[2], 10) || 45;
  const out = process.argv[3] || path.join(os.tmpdir(), `comic-benchmark-${count}p.pdf`);
  generateComicBenchmarkPdf(out, count).then((res) => {
    console.log('Result:', res);
  }).catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
}
