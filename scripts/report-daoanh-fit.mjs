/**
 * scripts/report-daoanh-fit.mjs
 * Báo cáo nhất quán kích thước và vị trí hiển thị của 42 Đạo Anh x 5 Kiếp (210 ảnh).
 * 
 * Tính toán kích thước w', h' và độ lệch tâm dx, dy sau khi áp transform.
 * Gắn cờ:
 * - LỆCH: |dx| > 6% hoặc |dy| > 6%
 * - NHỎ: max(w', h') < 0.55
 * - LỚN: max(w', h') > 0.96 (nguy cơ tràn viền)
 * - NHẢY KIẾP: cỡ nội dung giữa 2 kiếp liền kề chênh > 18%
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DAO_ANH_LIST, getDaoAnhBBox, getDaoAnhTransformConfig } from '../src/lib/daoAnhData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DOCS_DIR = path.join(ROOT_DIR, 'docs');
const REPORT_FILE = path.join(DOCS_DIR, 'dao-anh-fit-report.md');

if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

console.log('=== BẮT ĐẦU TÍNH TOÁN BÁO CÁO ĐỒNG BỘ ĐẠO ẢNH (scripts/report-daoanh-fit.mjs) ===\n');

const results = [];
let totalFlags = {
  LECH: 0,
  NHO: 0,
  LON: 0,
  NHAY_KIEP: 0,
};

for (const da of DAO_ANH_LIST) {
  let prevSize = null;
  for (let kiep = 1; kiep <= 5; kiep++) {
    const bb = getDaoAnhBBox(da, kiep) || { cx: 0.5, cy: 0.5, w: 0.8, h: 0.8 };
    const cfg = getDaoAnhTransformConfig(da, kiep, { size: 185, refSize: 185 });
    const scale = cfg.scale || 1.0;

    // Chiều dài và rộng sau khi áp transform trong khung 1x1 (khung ảnh = 94% khung ngoài)
    const wPrime = bb.w * scale * 0.94;
    const hPrime = bb.h * scale * 0.94;
    const maxDimPrime = Math.max(wPrime, hPrime);

    // Tính độ dịch chuyển tâm
    let txFrame = 0;
    let tyFrame = 0;
    if (cfg.isAuto || cfg.unit === '%') {
      const tx = cfg.tx !== undefined ? cfg.tx : cfg.x;
      const ty = cfg.ty !== undefined ? cfg.ty : cfg.y;
      txFrame = (tx / 100) * 0.94;
      tyFrame = (ty / 100) * 0.94;
    } else {
      txFrame = (cfg.x || 0) / 185;
      tyFrame = (cfg.y || 0) / 185;
    }

    const cxPrime = 0.5 + ((bb.cx - 0.5) * scale * 0.94) + txFrame;
    const cyPrime = 0.5 + ((bb.cy - 0.5) * scale * 0.94) + tyFrame;
    const dx = (cxPrime - 0.5) * 100;
    const dy = (cyPrime - 0.5) * 100;

    // Đánh giá cờ
    const flags = [];
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      flags.push('LỆCH');
      totalFlags.LECH++;
    }
    if (maxDimPrime < 0.55) {
      flags.push('NHỎ');
      totalFlags.NHO++;
    }
    if (maxDimPrime > 0.96) {
      flags.push('LỚN');
      totalFlags.LON++;
    }
    if (prevSize !== null) {
      const jumpPercent = Math.abs(maxDimPrime - prevSize) / prevSize * 100;
      if (jumpPercent > 18) {
        flags.push(`NHẢY KIẾP (${jumpPercent.toFixed(0)}%)`);
        totalFlags.NHAY_KIEP++;
      }
    }
    prevSize = maxDimPrime;

    // Điểm độ lệch (để xếp hạng 15 ảnh cần chú ý nhất)
    let score = 0;
    if (Math.abs(dx) > 6) score += (Math.abs(dx) - 6) * 3;
    if (Math.abs(dy) > 6) score += (Math.abs(dy) - 6) * 3;
    if (maxDimPrime > 0.96) score += (maxDimPrime - 0.96) * 150;
    if (maxDimPrime < 0.55) score += (0.55 - maxDimPrime) * 150;

    results.push({
      id: da.id,
      name: da.name,
      kiep,
      isAuto: Boolean(cfg.isAuto),
      scale: scale.toFixed(2),
      x: cfg.x,
      y: cfg.y,
      wPrime: wPrime.toFixed(3),
      hPrime: hPrime.toFixed(3),
      maxDim: maxDimPrime.toFixed(3),
      dx: dx.toFixed(1),
      dy: dy.toFixed(1),
      flags,
      score,
    });
  }
}

// Sắp xếp tìm 15 ảnh có điểm sai lệch cao nhất
const sortedByScore = [...results].sort((a, b) => b.score - a.score);
const worst15 = sortedByScore.filter(r => r.score > 0).slice(0, 15);

// Tạo nội dung Markdown
let md = `# Báo Cáo Nhất Quán Hiển Thị Đạo Ảnh (Dao Anh Fit Report)\n\n`;
md += `*Thời gian tạo:* ${new Date().toISOString()}\n`;
md += `*Tổng số Đạo Ảnh:* ${DAO_ANH_LIST.length} mục (${results.length} ảnh qua 5 kiếp)\n\n`;

md += `## 1. Tổng Kết Các Cờ Cảnh Báo\n\n`;
md += `| Loại Cảnh Báo | Tiêu Chuẩn Phát Hiện | Số Lượng |\n`;
md += `| :--- | :--- | :--- |\n`;
md += `| **LỆCH** | Tâm lệch \\|dx\\| > 6% hoặc \\|dy\\| > 6% so với tâm khung | ${totalFlags.LECH} |\n`;
md += `| **NHỎ** | Kích thước tối đa max(w', h') < 0.55 chiều khung | ${totalFlags.NHO} |\n`;
md += `| **LỚN** | Kích thước tối đa max(w', h') > 0.96 (nguy cơ tràn) | ${totalFlags.LON} |\n`;
md += `| **NHẢY KIẾP** | Kích thước giữa 2 kiếp liền kề chênh > 18% | ${totalFlags.NHAY_KIEP} |\n\n`;

md += `## 2. Top 15 Ảnh Có Độ Sai Lệch Cao Nhất\n\n`;
if (worst15.length === 0) {
  md += `*Không có ảnh nào vi phạm các ngưỡng cảnh báo độ lệch.* Tuyệt đối đồng đều!\n\n`;
} else {
  md += `| # | Đạo Ảnh | Kiếp | Scale | Lệch Tâm (dx, dy) | Cỡ Sau Scale (w' x h') | Cơ Chế | Cảnh Báo |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
  worst15.forEach((item, idx) => {
    md += `| ${idx + 1} | **${item.name}** (\`${item.id}\`) | K${item.kiep} | ${item.scale} | dx: ${item.dx}%, dy: ${item.dy}% | ${item.wPrime} x ${item.hPrime} | ${item.isAuto ? 'Tự động (BBox)' : 'Chỉnh tay'} | ${item.flags.join(', ')} |\n`;
  });
  md += `\n`;
}

md += `## 3. Bảng Chi Tiết Toàn Bộ 210 Ảnh\n\n`;
md += `| Đạo Ảnh | Kiếp | Cơ Chế | Scale | dx (%) | dy (%) | w' | h' | Cảnh Báo |\n`;
md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
for (const item of results) {
  const flagStr = item.flags.length > 0 ? `**${item.flags.join(', ')}**` : '✓ Chuẩn';
  md += `| ${item.name} | K${item.kiep} | ${item.isAuto ? 'BBox Auto' : 'Chỉnh tay'} | ${item.scale} | ${item.dx}% | ${item.dy}% | ${item.wPrime} | ${item.hPrime} | ${flagStr} |\n`;
}

fs.writeFileSync(REPORT_FILE, md, 'utf8');
console.log(`✓ Đã xuất báo cáo chi tiết ra: ${REPORT_FILE}`);
console.log(`  - Cờ LỆCH: ${totalFlags.LECH}`);
console.log(`  - Cờ NHỎ: ${totalFlags.NHO}`);
console.log(`  - Cờ LỚN: ${totalFlags.LON}`);
console.log(`  - Cờ NHẢY KIẾP: ${totalFlags.NHAY_KIEP}`);
console.log(`  - Top 15 ảnh cần rà soát: ${worst15.length} mục\n`);
