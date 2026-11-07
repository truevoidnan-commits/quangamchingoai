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

const PORT = 4211;
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

async function run() {
  console.log('===========================================================');
  console.log('🧪 VERIFYING QUICK EXP BUTTON RESTRICTED TO SANDBOX PROFILE');
  console.log('===========================================================');

  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  let hasErrors = false;

  try {
    // -------------------------------------------------------------
    // TEST CASE 1: REAL PROFILE (Tu Vi Thật)
    // -------------------------------------------------------------
    console.log('\n--- 1. Testing REAL profile (Tu Vi Thật) ---');
    const contextReal = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageReal = await contextReal.newPage();

    await pageReal.addInitScript(() => {
      try {
        localStorage.setItem('tcl_active_profile', 'real');
        localStorage.setItem(
          'tcl_cultivation_state_v3',
          JSON.stringify({"realm":"kim_dan","phapKhieu":120,"selfMenhHoa":4,"has121st":true,"absorbedLamps":["l1","l2","l3","l4","l5"],"palaceAnchors":{"1":"a","2":"b","3":"c","4":"d","5":"e","6":"f","7":"g","8":"h"},"currentThienCungExp":500,"daoAnhExp":500})
        );
      } catch (e) {}
    });

    await pageReal.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'networkidle', timeout: 15000 }).catch(async () => {
      await pageReal.waitForTimeout(1000);
    });
    await pageReal.waitForTimeout(1000);

    const hasTuLinhTranReal = await pageReal.evaluate(() => {
      const btn = document.getElementById('btn-quick-tu-linh-tran');
      return Boolean(btn);
    });

    const hasTuKhiReal = await pageReal.evaluate(() => {
      const btn = document.getElementById('btn-quick-tu-khi-thai-nghen');
      return Boolean(btn);
    });

    console.log(`  Real Profile - Tụ Linh Trận button present: ${hasTuLinhTranReal}`);
    console.log(`  Real Profile - Tụ Khí Thai Nghén button present: ${hasTuKhiReal}`);

    if (hasTuLinhTranReal || hasTuKhiReal) {
      console.error('  🚨 FAIL: Quick EXP cheat buttons are visible on REAL profile!');
      hasErrors = true;
    } else {
      console.log('  ✅ PASS: 0 cheat buttons found on REAL profile.');
    }

    const realShot = path.join(outDir, 'sandbox-cheat-real-profile.png');
    await pageReal.screenshot({ path: realShot, fullPage: false });
    await compressImage(realShot);
    await contextReal.close();

    // -------------------------------------------------------------
    // TEST CASE 2: SANDBOX PROFILE (Hồ sơ Thử Nghiệm)
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing SANDBOX profile (Thử Nghiệm) ---');
    const contextSandbox = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const pageSandbox = await contextSandbox.newPage();

    await pageSandbox.addInitScript(() => {
      try {
        localStorage.setItem('tcl_active_profile', 'sandbox');
        localStorage.setItem(
          'tcl_cultivation_state_v3__sandbox',
          JSON.stringify({"realm":"kim_dan","phapKhieu":120,"selfMenhHoa":4,"has121st":true,"absorbedLamps":["l1","l2","l3","l4","l5"],"palaceAnchors":{"1":"a","2":"b","3":"c","4":"d","5":"e","6":"f","7":"g","8":"h"},"currentThienCungExp":500,"daoAnhExp":500})
        );
      } catch (e) {}
    });

    await pageSandbox.goto(`${BASE_URL}/#/cultivation`, { waitUntil: 'networkidle', timeout: 15000 }).catch(async () => {
      await pageSandbox.waitForTimeout(1000);
    });
    await pageSandbox.waitForTimeout(1000);

    const sandboxResults = await pageSandbox.evaluate(() => {
      const tuLinhBtn = document.getElementById('btn-quick-tu-linh-tran');
      const tuKhiBtn = document.getElementById('btn-quick-tu-khi-thai-nghen');
      return {
        hasTuLinhBtn: Boolean(tuLinhBtn),
        tuLinhText: tuLinhBtn ? tuLinhBtn.innerText : '',
        hasTuKhiBtn: Boolean(tuKhiBtn),
        tuKhiText: tuKhiBtn ? tuKhiBtn.innerText : '',
      };
    });

    console.log('  Sandbox Profile Results:', sandboxResults);

    if (!sandboxResults.hasTuLinhBtn || !sandboxResults.tuLinhText.includes('1.000')) {
      console.error('  🚨 FAIL: Tụ Linh Trận (+1.000 EXP) button is missing or text mismatch on SANDBOX profile!');
      hasErrors = true;
    } else {
      console.log('  ✅ PASS: Tụ Linh Trận (+1.000 EXP) is present on SANDBOX profile.');
    }

    if (!sandboxResults.hasTuKhiBtn || !sandboxResults.tuKhiText.includes('1.000')) {
      console.error('  🚨 FAIL: Tụ Khí Thai Nghén (+1.000 EXP) button is missing on SANDBOX profile!');
      hasErrors = true;
    } else {
      console.log('  ✅ PASS: Tụ Khí Thai Nghén (+1.000 EXP) is present on SANDBOX profile.');
    }

    const sandboxShot = path.join(outDir, 'sandbox-cheat-sandbox-profile.png');
    await pageSandbox.screenshot({ path: sandboxShot, fullPage: false });
    await compressImage(sandboxShot);
    await contextSandbox.close();
  } catch (err) {
    console.error('Test error:', err);
    hasErrors = true;
  } finally {
    await browser.close();
    server.close();
  }

  console.log('===========================================================');
  if (hasErrors) {
    console.error('❌ SANDBOX CHEAT RESTRICTION AUDIT FAILED!');
    process.exit(1);
  } else {
    console.log('✅ ALL SANDBOX CHEAT TESTS PASSED CLEANLY (100%)!');
    process.exit(0);
  }
}

run();
