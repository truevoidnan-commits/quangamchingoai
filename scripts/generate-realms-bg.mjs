import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const imgDir = path.resolve(__dirname, '../src/assets/images');

const width = 1920;
const height = 1080;

async function generateNguyenAnhBg() {
  const stars = Array.from({ length: 220 }).map((_, i) => {
    const x = Math.round((Math.sin(i * 997 + 12) * 0.5 + 0.5) * width);
    const y = Math.round((Math.cos(i * 613 + 45) * 0.5 + 0.5) * height);
    const r = ((Math.sin(i * 31) * 0.5 + 0.5) * 2 + 0.6).toFixed(1);
    const op = ((Math.cos(i * 73) * 0.5 + 0.5) * 0.65 + 0.25).toFixed(2);
    const color = i % 5 === 0 ? '#fde047' : (i % 3 === 0 ? '#38bdf8' : (i % 4 === 0 ? '#f472b6' : '#ffffff'));
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${op}" />`;
  }).join('\n    ');

  const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="naVoid" cx="50%" cy="50%" r="75%">
      <stop offset="0%" stop-color="#0f112e" />
      <stop offset="40%" stop-color="#08091a" />
      <stop offset="100%" stop-color="#02030a" />
    </radialGradient>

    <radialGradient id="naNebulaViolet" cx="38%" cy="45%" r="55%">
      <stop offset="0%" stop-color="rgba(126, 34, 206, 0.45)" />
      <stop offset="45%" stop-color="rgba(88, 28, 135, 0.22)" />
      <stop offset="100%" stop-color="rgba(2, 6, 23, 0)" />
    </radialGradient>

    <radialGradient id="naNebulaMagenta" cx="65%" cy="52%" r="50%">
      <stop offset="0%" stop-color="rgba(217, 70, 239, 0.38)" />
      <stop offset="50%" stop-color="rgba(168, 85, 247, 0.16)" />
      <stop offset="100%" stop-color="rgba(2, 6, 23, 0)" />
    </radialGradient>

    <radialGradient id="naNebulaCyan" cx="50%" cy="68%" r="55%">
      <stop offset="0%" stop-color="rgba(14, 165, 233, 0.30)" />
      <stop offset="50%" stop-color="rgba(3, 105, 161, 0.12)" />
      <stop offset="100%" stop-color="rgba(2, 6, 23, 0)" />
    </radialGradient>

    <radialGradient id="naSoulCenter" cx="50%" cy="48%" r="35%">
      <stop offset="0%" stop-color="rgba(253, 224, 71, 0.42)" />
      <stop offset="25%" stop-color="rgba(245, 158, 11, 0.20)" />
      <stop offset="60%" stop-color="rgba(217, 70, 239, 0.08)" />
      <stop offset="100%" stop-color="rgba(15, 23, 42, 0)" />
    </radialGradient>

    <filter id="naGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="50" result="blur" />
    </filter>
  </defs>

  <!-- Deep Background -->
  <rect width="100%" height="100%" fill="url(#naVoid)" />

  <!-- Nebula Clouds -->
  <ellipse cx="760" cy="460" rx="680" ry="440" fill="url(#naNebulaViolet)" filter="url(#naGlow)" />
  <ellipse cx="1200" cy="540" rx="620" ry="400" fill="url(#naNebulaMagenta)" filter="url(#naGlow)" />
  <ellipse cx="960" cy="720" rx="760" ry="360" fill="url(#naNebulaCyan)" filter="url(#naGlow)" />
  <ellipse cx="960" cy="500" rx="480" ry="380" fill="url(#naSoulCenter)" filter="url(#naGlow)" />

  <!-- Subtle Sacred Dao Celestial Geometry & Runes -->
  <g opacity="0.25" stroke="#fef08a" stroke-width="1.2" fill="none">
    <circle cx="960" cy="510" r="220" stroke-dasharray="6 14" />
    <circle cx="960" cy="510" r="340" stroke-dasharray="3 9" stroke="#38bdf8" />
    <circle cx="960" cy="510" r="460" stroke-dasharray="14 28 4 28" stroke="#c084fc" />
    <circle cx="960" cy="510" r="580" stroke-dasharray="4 16" stroke="#fde047" opacity="0.6" />
    
    <!-- Alignment axes -->
    <line x1="460" y1="510" x2="1460" y2="510" stroke-dasharray="4 22" opacity="0.4" />
    <line x1="960" y1="90" x2="960" y2="930" stroke-dasharray="4 22" opacity="0.4" />
    <line x1="600" y1="180" x2="1320" y2="840" stroke-dasharray="3 18" opacity="0.2" />
    <line x1="600" y1="840" x2="1320" y2="180" stroke-dasharray="3 18" opacity="0.2" />
  </g>

  <!-- Stars & Soul Motes -->
  <g>
    ${stars}
  </g>

  <!-- Core Golden Soul Halo Center -->
  <circle cx="960" cy="510" r="100" fill="#fef08a" opacity="0.16" filter="url(#naGlow)" />
  <circle cx="960" cy="510" r="40" fill="#ffffff" opacity="0.26" filter="url(#naGlow)" />
</svg>
`;

  const dest = path.join(imgDir, 'bg_nguyen_anh_thuc_hai.webp');
  const buffer = await sharp(Buffer.from(svg))
    .webp({ quality: 86, effort: 6 })
    .toBuffer();

  fs.writeFileSync(dest, buffer);
  console.log(`✅ Generated bg_nguyen_anh_thuc_hai.webp (${(buffer.length / 1024).toFixed(1)} KB)`);
}

async function generateLinhTangBg() {
  const particles = Array.from({ length: 180 }).map((_, i) => {
    const x = Math.round((Math.sin(i * 853 + 37) * 0.5 + 0.5) * width);
    const y = Math.round((Math.cos(i * 439 + 81) * 0.5 + 0.5) * height);
    const r = ((Math.sin(i * 47) * 0.5 + 0.5) * 2.2 + 0.6).toFixed(1);
    const op = ((Math.cos(i * 61) * 0.5 + 0.5) * 0.6 + 0.2).toFixed(2);
    const color = i % 4 === 0 ? '#38bdf8' : (i % 3 === 0 ? '#2dd4bf' : (i % 5 === 0 ? '#facc15' : '#a5f3fc'));
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${op}" />`;
  }).join('\n    ');

  // 5 Pillars of Light x positions
  const pillarX = [400, 680, 960, 1240, 1520];
  const pillarColors = [
    { start: 'rgba(56, 189, 248, 0.28)', mid: 'rgba(14, 165, 233, 0.14)' }, // Thủy
    { start: 'rgba(52, 211, 153, 0.28)', mid: 'rgba(16, 185, 129, 0.14)' }, // Mộc
    { start: 'rgba(250, 204, 21, 0.32)', mid: 'rgba(234, 179, 8, 0.16)' },   // Thổ / Trung ương
    { start: 'rgba(244, 63, 94, 0.28)',  mid: 'rgba(225, 29, 72, 0.14)' },  // Hỏa
    { start: 'rgba(251, 191, 36, 0.28)', mid: 'rgba(217, 119, 6, 0.14)' },  // Kim
  ];

  const pillarsSvg = pillarX.map((x, idx) => {
    const p = pillarColors[idx];
    return `
      <!-- Pillar ${idx + 1} -->
      <linearGradient id="pilGrad${idx}" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="${p.start}" />
        <stop offset="50%" stop-color="${p.mid}" />
        <stop offset="100%" stop-color="rgba(15, 23, 42, 0)" />
      </linearGradient>
      <rect x="${x - 70}" y="100" width="140" height="900" fill="url(#pilGrad${idx})" filter="url(#ltPillarGlow)" />
      <line x1="${x}" y1="150" x2="${x}" y2="980" stroke="${p.start}" stroke-width="2" stroke-dasharray="10 20" opacity="0.6" />
    `;
  }).join('\n');

  const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="ltVoid" cx="50%" cy="40%" r="75%">
      <stop offset="0%" stop-color="#0a1a28" />
      <stop offset="45%" stop-color="#050e18" />
      <stop offset="100%" stop-color="#010408" />
    </radialGradient>

    <radialGradient id="ltStageGlow" cx="50%" cy="92%" r="50%">
      <stop offset="0%" stop-color="rgba(20, 184, 166, 0.28)" />
      <stop offset="40%" stop-color="rgba(14, 116, 144, 0.15)" />
      <stop offset="100%" stop-color="rgba(2, 6, 23, 0)" />
    </radialGradient>

    <filter id="ltPillarGlow" x="-40%" y="-10%" width="180%" height="120%">
      <feGaussianBlur stdDeviation="35" result="blur" />
    </filter>
  </defs>

  <!-- Deep Temple Void -->
  <rect width="100%" height="100%" fill="url(#ltVoid)" />

  <!-- 5 Divine Secret Treasury Pillars of Light -->
  <g>
    ${pillarsSvg}
  </g>

  <!-- Reflective Astral Temple Floor at bottom -->
  <ellipse cx="960" cy="980" rx="900" ry="240" fill="url(#ltStageGlow)" filter="url(#ltPillarGlow)" />
  <g opacity="0.3" stroke="#2dd4bf" stroke-width="1" fill="none">
    <ellipse cx="960" cy="960" rx="700" ry="140" stroke-dasharray="8 18" />
    <ellipse cx="960" cy="960" rx="500" ry="100" stroke-dasharray="4 12" stroke="#38bdf8" />
    <ellipse cx="960" cy="960" rx="300" ry="60" stroke-dasharray="2 8" stroke="#facc15" />
  </g>

  <!-- Rising Spiritual Particles & Aura -->
  <g>
    ${particles}
  </g>
</svg>
`;

  const dest = path.join(imgDir, 'bg_linh_tang_bi_tang.webp');
  const buffer = await sharp(Buffer.from(svg))
    .webp({ quality: 86, effort: 6 })
    .toBuffer();

  fs.writeFileSync(dest, buffer);
  console.log(`✅ Generated bg_linh_tang_bi_tang.webp (${(buffer.length / 1024).toFixed(1)} KB)`);
}

async function run() {
  await generateNguyenAnhBg();
  await generateLinhTangBg();
}

run().catch(console.error);
