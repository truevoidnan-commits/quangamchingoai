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

const PORT = 4225;
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

function createLinhTangState() {
  const linhTangs = [
    { id: 1, name: 'Tòa Bí Tàng Thứ Nhất', isInitialized: true, isGateOpen: true, type: 'than_tang', sourceDaoAnhName: 'Đạo Anh Thần Thoại' },
    { id: 2, name: 'Tòa Bí Tàng Thứ Hai', isInitialized: true, isGateOpen: true, type: 'bi_tang', sourceDaoAnhName: 'Hỗn Độn Kiếm Anh' },
    { id: 3, name: 'Tòa Bí Tàng Thứ Ba', isInitialized: true, isGateOpen: false, type: 'bi_tang', sourceDaoAnhName: 'Huyết Hổ Đạo Anh', currentThienDaoExp: 500 },
    { id: 4, name: 'Tòa Bí Tàng Thứ Tư', isInitialized: false, isGateOpen: false },
    { id: 5, name: 'Tòa Bí Tàng Thứ Năm', isInitialized: false, isGateOpen: false },
  ];

  const daoAnhs = Array.from({ length: 13 }).map((_, i) => ({
    id: `dao_anh_${i + 1}`,
    name: `Đạo Anh #${i + 1}`,
    currentKiep: 5,
    level: 10,
    active: true,
  }));

  return {
    realm: 'linh_tang',
    phapKhieu: 120,
    selfMenhHoa: 4,
    has121st: true,
    maxThienCung: 13,
    realizedThienCung: 13,
    daoAnhs,
    linhTangs,
    activeProfile: 'real',
  };
}

async function run() {
  console.log('===========================================================');
  console.log('🧪 TESTING PHẦN 4: LINH TÀNG 5 TÒA TÀNG MÔN BỀ THẾ');
  console.log('===========================================================');

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  let hasErrors = false;

  try {
    const viewports = [
      { name: 'desktop-1920', width: 1920, height: 1080, minHeight: 560, isMobile: false },
      { name: 'desktop-1920-915', width: 1920, height: 915, minHeight: 560, isMobile: false },
      { name: 'laptop-1536', width: 1536, height: 730, minHeight: 450, isMobile: false },
      { name: 'desktop-1366', width: 1366, height: 768, minHeight: 450, isMobile: false },
      { name: 'mobile-390', width: 390, height: 844, minHeight: 520, isMobile: true },
    ];

    for (const vp of viewports) {
      console.log(`\n--- Testing ${vp.name} (${vp.width}x${vp.height}) ---`);
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile });
      const page = await context.newPage();

      await page.addInitScript((mockState) => {
        try {
          localStorage.clear();
          localStorage.setItem('tcl_active_profile', 'real');
          localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mockState));
        } catch (e) {}
      }, createLinhTangState());

      await page.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'networkidle', timeout: 15000 }).catch(async () => {
        await page.waitForTimeout(1000);
      });
      await page.waitForTimeout(1500);

      const audit = await page.evaluate((expectedMinHeight) => {
        const text = document.body.innerText;
        const hasRedundantTitle = text.includes('NGŨ ĐẠI BÍ TÀNG KHAI THIÊN');
        const reassignBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Tùy Chỉnh 5 Đạo Anh'));
        const container = document.querySelector('[class*="pantheonStage"]')?.parentElement || document.querySelector('[class*="container"]');
        const stage = document.querySelector('[class*="pantheonStage"]');
        const computedStyle = container ? window.getComputedStyle(container) : null;
        const gates = Array.from(document.querySelectorAll('[class*="celestialGateEntity"]'));

        const stageRect = stage ? stage.getBoundingClientRect() : null;
        const gateRects = gates.map((g, idx) => {
          const r = g.getBoundingClientRect();
          return {
            index: idx + 1,
            width: Math.round(r.width),
            height: Math.round(r.height),
            top: Math.round(r.top),
            bottom: Math.round(r.bottom),
            left: Math.round(r.left),
            right: Math.round(r.right),
          };
        });

        // Check horizontal overflow
        const cScrollWidth = container ? container.scrollWidth : 0;
        const cClientWidth = container ? container.clientWidth : 0;
        const hasHOverflow = container ? cScrollWidth > cClientWidth + 2 : false;

        const overflowingChildren = container ? Array.from(container.children).map(c => {
          const cr = c.getBoundingClientRect();
          const pr = container.getBoundingClientRect();
          return {
            className: c.className.split(' ')[0],
            scrollWidth: c.scrollWidth,
            clientWidth: c.clientWidth,
            rectRight: Math.round(cr.right),
            containerRight: Math.round(pr.right),
            isOverflowing: cr.right > pr.right + 2 || cr.left < pr.left - 2
          };
        }) : [];

        // Check overlap between consecutive gates on desktop
        let hasOverlap = false;
        if (!window.matchMedia('(max-width: 768px)').matches) {
          for (let i = 0; i < gateRects.length - 1; i++) {
            if (gateRects[i + 1].left < gateRects[i].right - 2) {
              hasOverlap = true;
            }
          }
        }

        const minGateHeight = gateRects.length > 0 ? Math.min(...gateRects.map(g => g.height)) : 0;
        const centerGate = gateRects[2];
        const sideGate = gateRects[0];
        const isCenterTaller = centerGate && sideGate ? centerGate.height >= sideGate.height : false;

        return {
          hasRedundantTitle,
          hasReassignBtn: Boolean(reassignBtn),
          borderRadius: computedStyle?.borderRadius,
          hasBgImage: computedStyle?.backgroundImage?.includes('bg_linh_tang_bi_tang'),
          gateCount: gates.length,
          stageRect: stageRect ? { width: Math.round(stageRect.width), height: Math.round(stageRect.height) } : null,
          minGateHeight,
          centerGate,
          sideGate,
          isCenterTaller,
          hasHOverflow,
          cScrollWidth,
          cClientWidth,
          overflowingChildren,
          hasOverlap,
          gateRects,
        };
      }, vp.minHeight);

      console.log(`  Audit for ${vp.name}:`, {
        gateCount: audit.gateCount,
        minGateHeight: audit.minGateHeight,
        requiredMinHeight: vp.minHeight,
        centerGate: audit.centerGate,
        sideGate: audit.sideGate,
        hasHOverflow: audit.hasHOverflow,
        cScrollWidth: audit.cScrollWidth,
        cClientWidth: audit.cClientWidth,
        overflowingChildren: audit.overflowingChildren,
        hasOverlap: audit.hasOverlap,
      });

      if (audit.hasRedundantTitle) {
        console.error(`  🚨 FAIL: Redundant title NGŨ ĐẠI BÍ TÀNG KHAI THIÊN still present on ${vp.name}!`);
        hasErrors = true;
      }

      if (!audit.hasReassignBtn) {
        console.error(`  🚨 FAIL: Reassign button missing on ${vp.name}!`);
        hasErrors = true;
      }

      if (audit.gateCount !== 5) {
        console.error(`  🚨 FAIL: Expected 5 gates, found ${audit.gateCount} on ${vp.name}!`);
        hasErrors = true;
      }

      if (audit.minGateHeight < vp.minHeight) {
        console.error(`  🚨 FAIL: Gate height (${audit.minGateHeight}px) below required minimum ${vp.minHeight}px on ${vp.name}!`);
        hasErrors = true;
      } else {
        console.log(`  ✅ PASS: Gate height ${audit.minGateHeight}px >= ${vp.minHeight}px threshold.`);
      }

      if (audit.hasHOverflow && !vp.isMobile) {
        console.error(`  🚨 FAIL: Horizontal overflow detected on stage for ${vp.name}!`);
        hasErrors = true;
      } else {
        console.log(`  ✅ PASS: No horizontal overflow on stage.`);
      }

      if (audit.hasOverlap) {
        console.error(`  🚨 FAIL: Gates overlapping each other on ${vp.name}!`);
        hasErrors = true;
      } else {
        console.log(`  ✅ PASS: Gates do not overlap each other.`);
      }

      const shotPath = path.join(outDir, `linh-tang-${vp.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
      await compressImage(shotPath);
      console.log(`  📸 Screenshot saved: ${shotPath}`);
      await context.close();
    }
  } catch (err) {
    console.error('Test execution error:', err);
    hasErrors = true;
  } finally {
    await browser.close();
    server.close();
  }

  console.log('===========================================================');
  if (hasErrors) {
    console.error('❌ PART 4 LINH TÀNG 5 TÒA VERIFICATION FAILED!');
    process.exit(1);
  } else {
    console.log('✅ ALL PART 4 LINH TÀNG 5 TÒA VERIFICATIONS PASSED CLEANLY (100%)!');
    process.exit(0);
  }
}

run();
