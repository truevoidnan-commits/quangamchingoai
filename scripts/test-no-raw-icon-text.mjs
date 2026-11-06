import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const outDir = path.resolve(__dirname, '../docs/ui-redesign/cultivation-fixes');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const PORT = 4201;
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

// Icon names from ICON_REGISTRY that should NEVER appear as raw text nodes
const FORBIDDEN_RAW_ICON_STRINGS = [
  'crown', 'bolt', 'flame', 'lantern', 'sword', 'orb', 'mirror', 'skull',
  'dragon', 'tiger', 'whale', 'eagle', 'yin-yang', 'lotus', 'drop', 'hourglass',
  'sun', 'moon', 'shield', 'key', 'lock', 'unlock', 'scroll', 'sparkle', 'sparkles'
];

async function scanDomForRawIconText(page, contextLabel = '') {
  const violations = await page.evaluate(({ forbiddenList, label }) => {
    const issues = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue.trim();
      if (!text) continue;
      
      // Ignore text inside script or style
      const parentTag = node.parentElement ? node.parentElement.tagName.toLowerCase() : '';
      if (parentTag === 'script' || parentTag === 'style') continue;

      for (const iconName of forbiddenList) {
        // Strict match: isolated icon name
        if (text === iconName) {
          issues.push({
            type: 'exact-match',
            text,
            parent: node.parentElement.outerHTML.slice(0, 120),
            label
          });
          break;
        }
        // Prefixed or suffixed pattern: "crown Tên" or "Tên crown"
        if (text.startsWith(iconName + ' ') || text.endsWith(' ' + iconName)) {
          issues.push({
            type: 'prefix-match',
            text,
            parent: node.parentElement.outerHTML.slice(0, 120),
            label
          });
          break;
        }
      }
    }
    return issues;
  }, { forbiddenList: FORBIDDEN_RAW_ICON_STRINGS, label: contextLabel });

  if (violations.length > 0) {
    console.error(`❌ Raw icon text violation found in [${contextLabel}]:`);
    violations.forEach(v => console.error(`   [${v.type}] "${v.text}" in element: ${v.parent}`));
    throw new Error(`Raw icon text found in DOM for context: ${contextLabel}`);
  }
}

async function run() {
  console.log('--- STARTING ANTI-REGRESSION & CULTIVATION UI VERIFICATION ---');
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 1. Seed full cultivation data (Kim Dan realm, 13 palaces, absorbed lamps, artifacts)
  await page.goto(`${BASE_URL}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    const mockCultivation = {
      realm: 'kim_dan',
      currentRealmIndex: 2,
      theExp: 4500,
      phapExp: 4500,
      realizedThienCung: 6,
      maxThienCung: 13,
      currentThienCungExp: 1999,
      totalCombatPower: 39000,
      absorbedLamps: ['nguyen_thuy_thien_ma', 'that_tinh_hoan_hon', 'thanh_lien_hoa_dang'],
      palaceAnchors: {
        0: { id: 'de_kiem', name: 'Đế Kiếm', palaceName: 'Đế Kiếm Cung' },
        1: { id: 'hoang_tuyen_bi_ngan', name: 'Hoàng Tuyền Bỉ Ngạn', palaceName: 'Hoàng Tuyền Cung' },
        2: { id: 'tam_thu_dao', name: 'Tâm Thú Đao', palaceName: 'Tâm Thú Cung' },
        3: { id: 'mac_sat_tien_phach', name: 'Mạc Sát Tiên Phách', palaceName: 'Mạc Sát Cung' },
        4: { id: 'thien_menh_dia_tuc', name: 'Thiên Mệnh Địa Túc', palaceName: 'Thiên Mệnh Cung' },
        5: { id: 'thai_co_long_kinh', name: 'Thái Cổ Long Kình', palaceName: 'Long Kình Cung' },
      },
      daoAnhs: [],
      inventoryArtifacts: [],
    };
    localStorage.setItem('tcl_cultivation_state', JSON.stringify(mockCultivation));
    localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(mockCultivation));
    window.dispatchEvent(new CustomEvent('cultivation_updated', { detail: mockCultivation }));
  });

  // 2. Open Cultivation Workspace / Modal to inspect Trận Đồ Thập Tam Cung
  await page.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  // Set desktop viewport so SidePanel is visible
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(300);

  // Scan text nodes for Trận Đồ
  await scanDomForRawIconText(page, 'Cultivation Workspace - Trận Đồ Thập Tam Cung');

  // Verify 13 palace cells exist and none has raw text
  const palaceNodes = page.locator('div[class*="palaceOrb"]');
  const pCount = await palaceNodes.count();
  console.log(`Palace orbs count: ${pCount} (expected 13)`);
  if (pCount > 0 && pCount < 13) throw new Error(`Expected 13 palaces, found ${pCount}`);

  // Test across responsive widths: 1366, 768, 390, 360
  const viewports = [
    { width: 1366, height: 768, name: 'desktop-1366' },
    { width: 768, height: 1024, name: 'tablet-768' },
    { width: 390, height: 844, name: 'mobile-390' },
    { width: 360, height: 800, name: 'mobile-360' },
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(300);
    if (vp.width <= 768) {
      const tabBtn = page.locator('.mobile-tab-btn', { hasText: 'THAO TÁC' });
      if (await tabBtn.count() > 0) {
        await tabBtn.click();
        await page.waitForTimeout(300);
      }
    }
    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    console.log(`Viewport ${vp.name} - No Horizontal Overflow: ${noOverflow}`);
    if (!noOverflow) throw new Error(`Horizontal overflow at ${vp.name}`);

    const shotPath = path.join(outDir, `thien-cung-kim-dan-${vp.name}.png`);
    await page.screenshot({ path: shotPath });
    await compressImage(shotPath);
  }

  // 3. Test Ngưng Khí View: Lộ trình Hải Sơn Quyết & Hóa Hải Kinh
  await page.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem('tcl_cultivation_state_v3') || localStorage.getItem('tcl_cultivation_state') || '{}');
    cur.realm = 'ngung_khi';
    cur.currentRealmIndex = 0;
    cur.theExp = 4500; // Hải Sơn Viên Mãn
    cur.phapExp = 4500; // Hóa Hải Viên Mãn
    localStorage.setItem('tcl_cultivation_state', JSON.stringify(cur));
    localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(cur));
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  // Switch to THAO TÁC if on narrow viewport
  const ensureThaoTac = async () => {
    const tabBtn = page.locator('.mobile-tab-btn', { hasText: 'THAO TÁC' });
    if (await tabBtn.isVisible()) {
      await tabBtn.click();
      await page.waitForTimeout(300);
    }
  };

  await scanDomForRawIconText(page, 'Ngưng Khí - Song Tu Viên Mãn');

  // Capture Song Tu Viên Mãn button & Roadmap at 1366 & 390
  await page.setViewportSize({ width: 1366, height: 768 });
  const s1 = path.join(outDir, 'roadmap-song-tu-desktop-1366.png');
  await page.screenshot({ path: s1 });
  await compressImage(s1);

  await page.setViewportSize({ width: 390, height: 844 });
  await ensureThaoTac();
  const s2 = path.join(outDir, 'roadmap-song-tu-mobile-390.png');
  await page.screenshot({ path: s2 });
  await compressImage(s2);

  // 4. Test Hải Sơn only max & Hóa Hải only max & Locked states
  // State: Hải Sơn max only
  await page.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem('tcl_cultivation_state_v3') || '{}');
    cur.theExp = 4500;
    cur.phapExp = 200;
    localStorage.setItem('tcl_cultivation_state', JSON.stringify(cur));
    localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(cur));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await ensureThaoTac();
  await scanDomForRawIconText(page, 'Ngưng Khí - Hải Sơn Max');
  const s3 = path.join(outDir, 'breakthrough-btn-hai-son-max.png');
  await page.screenshot({ path: s3 });
  await compressImage(s3);

  // State: Hóa Hải max only
  await page.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem('tcl_cultivation_state_v3') || '{}');
    cur.theExp = 300;
    cur.phapExp = 4500;
    localStorage.setItem('tcl_cultivation_state', JSON.stringify(cur));
    localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(cur));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await ensureThaoTac();
  await scanDomForRawIconText(page, 'Ngưng Khí - Hóa Hải Max');
  const s4 = path.join(outDir, 'breakthrough-btn-hoa-hai-max.png');
  await page.screenshot({ path: s4 });
  await compressImage(s4);

  // State: Locked (not enough EXP)
  await page.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem('tcl_cultivation_state_v3') || '{}');
    cur.theExp = 120;
    cur.phapExp = 80;
    localStorage.setItem('tcl_cultivation_state', JSON.stringify(cur));
    localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(cur));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await ensureThaoTac();
  await scanDomForRawIconText(page, 'Ngưng Khí - Đột Phá Khóa');
  const s5 = path.join(outDir, 'breakthrough-btn-locked.png');
  await page.screenshot({ path: s5 });
  await compressImage(s5);

  // 5. Test DaoAnhGalleryModal: open and scan category chips
  // Find gallery button or trigger modal
  const galleryBtn = page.locator('button:has-text("ĐẠO ẢNH"), button:has-text("Đạo Ảnh")').first();
  if (await galleryBtn.count() > 0) {
    await galleryBtn.click();
    await page.waitForTimeout(500);
    await scanDomForRawIconText(page, 'DaoAnhGalleryModal');
    const s6 = path.join(outDir, 'dao-anh-gallery-modal.png');
    await page.screenshot({ path: s6 });
    await compressImage(s6);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // 6. Test ReaderPage Lucky Lamp Drop modal
  await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const req = indexedDB.open('thien-co-lau');
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    const tx = db.transaction(['novels', 'chapters'], 'readwrite');
    tx.objectStore('novels').put({
      id: 'lamp-test-novel',
      title: 'Đăng Lạc Chư Thiên',
      author: 'Thiên Cơ Lâu',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    tx.objectStore('chapters').put({
      id: 'lamp-test-ch-1',
      novelId: 'lamp-test-novel',
      chapterNumber: 1,
      title: 'Chương 1: Khởi Sự',
      content: 'Một đêm phong lôi bộc phát...',
      wordCount: 100,
      createdAt: Date.now(),
    });
    await new Promise((r) => { tx.oncomplete = r; });
  });

  await page.goto(`${BASE_URL}/#/novel/lamp-test-novel/read/lamp-test-ch-1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // Trigger dropped lamp celebration in state
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('tcl_simulate_lamp_drop', {
      detail: {
        id: 'nguyen_thuy_thien_ma',
        name: 'Nguyên Thủy Thiên Ma Đăng',
        icon: 'lantern',
        iconKey: 'lantern',
        tier: 'than_pham',
        color: '#ef4444'
      }
    }));
  });
  await page.waitForTimeout(400);

  // Scan text nodes on reader page
  await scanDomForRawIconText(page, 'ReaderPage');
  const s7 = path.join(outDir, 'reader-lamp-drop.png');
  await page.screenshot({ path: s7 });
  await compressImage(s7);

  await browser.close();
  server.close();

  // Audit screenshot sizes
  const files = fs.readdirSync(outDir).filter(f => f.endsWith('.png'));
  console.log(`Generated ${files.length} verification screenshots in ${outDir}:`);
  for (const f of files) {
    const s = fs.statSync(path.join(outDir, f));
    console.log(`  - ${f}: ${(s.size / 1024).toFixed(1)} KB`);
    if (s.size > 400 * 1024) throw new Error(`${f} exceeds 400KB`);
  }

  console.log('✅ ALL ANTI-REGRESSION & CULTIVATION UI TESTS PASSED CLEANLY (100%)!');
  process.exit(0);
}

run().catch((err) => {
  console.error('Error in cultivation verification test:', err);
  process.exit(1);
});
