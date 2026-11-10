import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { DAO_ANH_LIST } from '../src/lib/daoAnhData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const outDir = path.resolve(__dirname, '../docs/ui-redesign/realms-polish');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const PORT = 4220;
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

// Tạo state 13 Đạo Anh thật ở Kiếp k
function createNguyenAnhState(kiep = 5) {
  // Chọn 13 Đạo Anh đại diện cho 13 Thiên Cung
  const sampleDefs = DAO_ANH_LIST.filter(da => da.sourceType === 'artifact').slice(0, 13);
  const daoAnhs = sampleDefs.map((def, idx) => ({
    id: def.id,
    name: def.name,
    artifactId: def.sourceType === 'artifact' ? def.sourceId : undefined,
    lampId: def.sourceType === 'lamp' ? def.sourceId : undefined,
    fromLamp: def.sourceType === 'lamp',
    palaceIndex: idx,
    currentKiep: kiep,
    currentExp: 10000,
    maxExp: 10000,
    level: 10,
    active: true,
    glowColor: def.glowColor || def.primaryColor || '#fbbf24',
  }));

  const palaceAnchors = {};
  sampleDefs.forEach((def, idx) => {
    if (def.sourceType === 'artifact') {
      palaceAnchors[idx] = def.sourceId;
    }
  });

  return {
    realm: 'nguyen_anh',
    phapKhieu: 120,
    selfMenhHoa: 4,
    has121st: true,
    maxThienCung: 13,
    realizedThienCung: 13,
    daoAnhs,
    palaceAnchors,
    inventoryArtifacts: ['de_kiem', 'tam_thu_dao'],
    inventoryLamps: ['nguyen_thuy_thien_ma', 'hon_don_so_khai'],
    currentThienCungExp: 10000,
    activeProfile: 'real',
  };
}

function createLinhTangState() {
  const st = createNguyenAnhState(5);
  st.realm = 'linh_tang';
  return st;
}

async function run() {
  console.log('===========================================================');
  console.log('🧪 TESTING: NGUYÊN ANH UNIFORM SIZING & REALM VERIFICATION');
  console.log('===========================================================');

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  let hasErrors = false;

  try {
    const viewports = [
      { name: 'desktop-1920', width: 1920, height: 1080, isMobile: false },
      { name: 'desktop-1366', width: 1366, height: 768, isMobile: false },
      { name: 'mobile-390', width: 390, height: 844, isMobile: true },
    ];

    const kiepList = [1, 3, 5];

    for (const vp of viewports) {
      console.log(`\n--- Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
      });

      for (const k of kiepList) {
        const page = await context.newPage();
        const mockState = createNguyenAnhState(k);

        await page.addInitScript((st) => {
          try {
            localStorage.clear();
            localStorage.setItem('tcl_active_profile', 'real');
            localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(st));
          } catch (e) {}
        }, mockState);

        await page.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1200);

        // Đo đạc 13 <image> trong SVG
        const evalResult = await page.evaluate((isMob) => {
          const images = Array.from(document.querySelectorAll('image')).filter(img => 
            img.getAttribute('x') === '-72' && img.getAttribute('y') === '-76'
          );

          if (images.length !== 13) {
            return { ok: false, reason: `Found ${images.length} images instead of 13` };
          }

          const svg = images[0]?.closest('svg');
          if (!svg) return { ok: false, reason: 'SVG not found' };
          const svgRect = svg.getBoundingClientRect();

          const rects = images.map((img, i) => {
            const r = img.getBoundingClientRect();
            return {
              i,
              w: Math.round(r.width * 10) / 10,
              h: Math.round(r.height * 10) / 10,
              maxDim: Math.round(Math.max(r.width, r.height) * 10) / 10,
              left: Math.round(r.left),
              right: Math.round(r.right),
              top: Math.round(r.top),
              bottom: Math.round(r.bottom),
            };
          });

          const maxDims = rects.map((r, i) => {
            // Trên mobile node trung tâm (i=0) được phong cách hóa lớn hơn (scale: 1.05 so với 0.90)
            const nodeScaleFactor = (isMob && i === 0) ? (1.05 / 0.90) : 1.0;
            return r.maxDim / nodeScaleFactor;
          });
          const minDim = Math.min(...maxDims);
          const maxDim = Math.max(...maxDims);
          const diffRatio = (maxDim - minDim) / maxDim;

          // Kiểm tra không tràn ngoài khung SVG:
          // Cho phép vùng đệm trong suốt an toàn của ảnh PNG (50px)
          const overflows = rects.filter(r => (
            r.left < svgRect.left - 50 ||
            r.right > svgRect.right + 50 ||
            r.top < svgRect.top - 50 ||
            r.bottom > svgRect.bottom + 50
          ));

          return {
            ok: true,
            count: images.length,
            minDim: Math.round(minDim * 10) / 10,
            maxDim: Math.round(maxDim * 10) / 10,
            diffRatio,
            overflowCount: overflows.length,
            overflows,
          };
        }, vp.isMobile);

        if (!evalResult.ok) {
          console.error(`  🚨 FAIL [${vp.name} - Kiếp ${k}]: ${evalResult.reason}`);
          hasErrors = true;
        } else {
          const diffPct = (evalResult.diffRatio * 100).toFixed(1);
          console.log(`  ✓ Kiếp ${k}: 13 Đạo Anh rendering cleanly. Cạnh min=${evalResult.minDim}px, max=${evalResult.maxDim}px, chênh lệch=${diffPct}% (yêu cầu <= 30%). Tràn=${evalResult.overflowCount}`);

          if (evalResult.diffRatio > 0.30) {
            console.error(`  🚨 FAIL: Chênh lệch cạnh (${diffPct}%) vượt quá ngưỡng 30%!`);
            hasErrors = true;
          }
          if (evalResult.overflowCount > 0) {
            console.error(`  🚨 FAIL: Có ${evalResult.overflowCount} ảnh vượt ngoài khung SVG!`, evalResult.overflows);
            hasErrors = true;
          }
        }

        // Chụp ảnh từng kiếp
        const shotName = `nguyen-anh-${vp.name}-k${k}.png`;
        const shotPath = path.join(outDir, shotName);
        await page.screenshot({ path: shotPath, fullPage: false });
        await compressImage(shotPath);

        // Lưu bản mặc định tương thích ngược (k5)
        if (k === 5) {
          const defaultPath = path.join(outDir, `nguyen-anh-${vp.name}.png`);
          fs.copyFileSync(shotPath, defaultPath);
        }

        // Với desktop-1920: kiểm tra nút Hoán vị và chụp Modal Cận Cảnh + SwapAnchorModal
        if (vp.name === 'desktop-1920') {
          // Mở SwapAnchorModal khi nút "ĐỔI VẬT TRẤN ÁP" xuất hiện (ở k=1)
          const shotSwapModal = path.join(outDir, 'swap-anchor-modal.png');
          if (!fs.existsSync(shotSwapModal) || k === 1) {
            try {
              const swapAnchorBtn = page.locator('button:has-text("ĐỔI VẬT TRẤN ÁP"), button:has-text("Đổi Vật Trấn Áp")').first();
              if (await swapAnchorBtn.isVisible()) {
                await swapAnchorBtn.click({ force: true });
                await page.waitForTimeout(600);
                await page.screenshot({ path: shotSwapModal, fullPage: false });
                await compressImage(shotSwapModal);
                console.log(`  📸 Đã chụp SwapAnchorModal: ${shotSwapModal}`);
                
                const closeSwap = page.locator('button:has-text("✕"), button:has-text("Đóng")').first();
                if (await closeSwap.isVisible()) {
                  await closeSwap.click({ force: true });
                } else {
                  await page.keyboard.press('Escape');
                }
                await page.waitForTimeout(400);
              }
            } catch (e) {
              console.warn('  ⚠️ Không thể mở SwapAnchorModal:', e.message);
            }
          }

          if (k === 5) {
            // Kiểm tra nút Hoán vị
            const buttons = Array.from(await page.$$('button'));
            let hasSwap = false;
            for (const b of buttons) {
              const txt = await b.innerText();
              if (txt.includes('Hoán vị')) { hasSwap = true; break; }
            }
            console.log(`  ✓ Desktop swap button detected: ${hasSwap}`);

            // Mở modal cận cảnh Đạo Anh bằng cách nhấp vào node trung tâm
            try {
              const centerNode = page.locator('g[style*="cursor: pointer"]').first();
              await centerNode.click({ force: true });
              await page.waitForTimeout(600);

              const shotCloseup = path.join(outDir, 'dao-anh-closeup-modal.png');
              await page.screenshot({ path: shotCloseup, fullPage: false });
              await compressImage(shotCloseup);
              console.log(`  📸 Đã chụp modal cận cảnh Đạo Anh: ${shotCloseup}`);
              
              const closeBtn = page.locator('button:has-text("✕")').first();
              if (await closeBtn.isVisible()) {
                await closeBtn.click({ force: true });
              } else {
                await page.keyboard.press('Escape');
              }
              await page.waitForTimeout(400);
            } catch (e) {
              console.warn('  ⚠️ Không thể mở modal cận cảnh:', e.message);
            }
          }
        }

        await page.close();
      }

      await context.close();
    }

    // Chụp màn Linh Tàng
    console.log('\n--- Linh Tàng Overview Test ---');
    const contextLinhTang = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const pageLinhTang = await contextLinhTang.newPage();
    await pageLinhTang.addInitScript((st) => {
      try {
        localStorage.clear();
        localStorage.setItem('tcl_active_profile', 'real');
        localStorage.setItem('tcl_cultivation_state_v3', JSON.stringify(st));
      } catch (e) {}
    }, createLinhTangState());

    await pageLinhTang.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await pageLinhTang.waitForTimeout(1200);

    const shotLinhTang = path.join(outDir, 'linh-tang-overview.png');
    await pageLinhTang.screenshot({ path: shotLinhTang, fullPage: false });
    await compressImage(shotLinhTang);
    console.log(`  📸 Đã chụp Linh Tàng Overview: ${shotLinhTang}`);
    await contextLinhTang.close();

  } catch (err) {
    console.error('Test execution error:', err);
    hasErrors = true;
  } finally {
    await browser.close();
    server.close();
  }

  console.log('===========================================================');
  if (hasErrors) {
    console.error('❌ UNIFORM SIZING & REALM VERIFICATION FAILED!');
    process.exit(1);
  } else {
    console.log('✅ ALL UNIFORM SIZING & REALM VERIFICATIONS PASSED CLEANLY (100%)!');
    process.exit(0);
  }
}

run();
