import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const outDir = path.resolve(__dirname, '../docs/ui-redesign/realms-polish');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const PORT = 4240;
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

async function compressImage(filePath) {
  const buf = fs.readFileSync(filePath);
  const compressed = await sharp(buf).png({ quality: 80, compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(filePath, compressed);
}

const REALM_STATES = {
  'ngung-khi-the': {
    realm: 'ngung_khi',
    ngungKhiActivePath: 'the',
    ngungKhiPath: 'the',
    ngungKhiLevel: 10,
    theExp: 4500,
    phapExp: 0,
    activeProfile: 'real',
  },
  'ngung-khi-phap': {
    realm: 'ngung_khi',
    ngungKhiActivePath: 'phap',
    ngungKhiPath: 'phap',
    ngungKhiLevel: 10,
    theExp: 0,
    phapExp: 4500,
    activeProfile: 'real',
  },
  'truc-co': {
    realm: 'truc_co',
    ngungKhiLevel: 10,
    ngungKhiActivePath: 'the',
    phapKhieu: 120,
    has121st: true,
    activeProfile: 'real',
  },
  'kim-dan': {
    realm: 'kim_dan',
    ngungKhiLevel: 10,
    phapKhieu: 120,
    has121st: true,
    maxThienCung: 13,
    realizedThienCung: 10,
    absorbedLamps: ['hoang_tuyen_bi_ngan', 'de_kiem', 'l3'],
    palaceAnchors: { 1: 'de_kiem', 2: 'hoang_tuyen_bi_ngan' },
    currentThienCungExp: 500,
    activeProfile: 'real',
  },
  'nguyen-anh': {
    realm: 'nguyen_anh',
    ngungKhiLevel: 10,
    phapKhieu: 120,
    has121st: true,
    maxThienCung: 13,
    realizedThienCung: 13,
    daoAnhs: Array.from({ length: 13 }).map((_, i) => ({
      id: `dao_anh_${i + 1}`,
      name: `Đạo Anh #${i + 1}`,
      currentKiep: 5,
      level: 10,
      active: true,
      glowColor: '#fbbf24',
    })),
    activeProfile: 'real',
  },
  'linh-tang': {
    realm: 'linh_tang',
    ngungKhiLevel: 10,
    phapKhieu: 120,
    has121st: true,
    maxThienCung: 13,
    realizedThienCung: 13,
    linhTangs: [
      { id: 'tang_1', name: 'Thận Tàng Môn', isGateOpen: true, artifactId: 'de_kiem', currentKiep: 5 },
      { id: 'tang_2', name: 'Can Tàng Môn', isGateOpen: true, artifactId: 'hoang_tuyen_bi_ngan', currentKiep: 5 },
      { id: 'tang_3', name: 'Tỳ Tàng Môn', isGateOpen: true, artifactId: 'de_kiem', currentKiep: 5 },
      { id: 'tang_4', name: 'Phế Tàng Môn', isGateOpen: true, artifactId: 'hoang_tuyen_bi_ngan', currentKiep: 5 },
      { id: 'tang_5', name: 'Tâm Tàng Môn', isGateOpen: true, artifactId: 'de_kiem', currentKiep: 5 },
    ],
    activeProfile: 'real',
  },
};

const VIEWPORTS = [
  { key: 'desktop-1920', width: 1920, height: 1080, isMobile: false },
  { key: 'desktop-1366', width: 1366, height: 768, isMobile: false },
  { key: 'mobile-390', width: 390, height: 844, isMobile: true },
];

async function capture() {
  console.log('===========================================================');
  console.log('📸 CAPTURING ALL FRESH ACCEPTANCE SCREENSHOTS (LỖI 3)');
  console.log('===========================================================');

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const capturedFiles = [];

  try {
    // Clean old files in outDir first
    const existingFiles = fs.readdirSync(outDir);
    for (const f of existingFiles) {
      if (f.endsWith('.png')) {
        fs.unlinkSync(path.join(outDir, f));
      }
    }
    console.log('🧹 Cleaned old screenshots in docs/ui-redesign/realms-polish/');

    // 1. Capture 6 Realm states x 3 viewports = 18 screenshots
    for (const [realmKey, state] of Object.entries(REALM_STATES)) {
      for (const vp of VIEWPORTS) {
        const filename = `${realmKey}-${vp.key}.png`;
        const filepath = path.join(outDir, filename);

        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          isMobile: vp.isMobile,
        });
        const page = await context.newPage();

        await page.addInitScript((mock) => {
          try {
            localStorage.clear();
            localStorage.setItem('tcl_active_profile', 'real');
            localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mock));
          } catch (e) {}
        }, state);

        await page.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'networkidle', timeout: 15000 }).catch(async () => {
          await page.waitForTimeout(1000);
        });
        await page.waitForTimeout(1200);

        await page.screenshot({ path: filepath, fullPage: false });
        await compressImage(filepath);
        capturedFiles.push(filepath);
        console.log(`  📸 Saved: ${filename}`);

        await context.close();
      }
    }

    // 2. Capture Profile Tu Vi Thật (Desktop 1920 - No cheat buttons, unified stepper)
    {
      const filepath = path.join(outDir, 'profile-real.png');
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await context.newPage();

      await page.addInitScript((mock) => {
        try {
          localStorage.clear();
          localStorage.setItem('tcl_active_profile', 'real');
          localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mock));
        } catch (e) {}
      }, REALM_STATES['kim-dan']);

      await page.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'networkidle', timeout: 15000 }).catch(async () => {
        await page.waitForTimeout(1000);
      });
      await page.waitForTimeout(1200);

      await page.screenshot({ path: filepath, fullPage: false });
      await compressImage(filepath);
      capturedFiles.push(filepath);
      console.log(`  📸 Saved: profile-real.png`);
      await context.close();
    }

    // 3. Capture Profile Sandbox (Desktop 1920 - Shows +1.000 EXP buttons)
    {
      const filepath = path.join(outDir, 'profile-sandbox-cheat-exp.png');
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await context.newPage();

      const sandboxState = {
        ...REALM_STATES['kim-dan'],
        activeProfile: 'sandbox',
      };

      await page.addInitScript((mock) => {
        try {
          localStorage.clear();
          localStorage.setItem('tcl_active_profile', 'sandbox');
          localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mock));
        } catch (e) {}
      }, sandboxState);

      await page.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'networkidle', timeout: 15000 }).catch(async () => {
        await page.waitForTimeout(1000);
      });
      await page.waitForTimeout(1200);

      await page.screenshot({ path: filepath, fullPage: false });
      await compressImage(filepath);
      capturedFiles.push(filepath);
      console.log(`  📸 Saved: profile-sandbox-cheat-exp.png`);
      await context.close();
    }
  } catch (err) {
    console.error('Screenshot capture failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
    server.close();
  }

  console.log('===========================================================');
  console.log(`✅ SUCCESS: Captured and compressed all ${capturedFiles.length} screenshots!`);
  process.exit(0);
}

capture();
