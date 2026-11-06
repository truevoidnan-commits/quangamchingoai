import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const outDir = path.resolve(__dirname, '../docs/ui-redesign/formkit');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const PORT = 4202;
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

const PAGES_TO_TEST = [
  { path: '/#/novel/add', name: 'add-novel' },
  { path: '/#/search', name: 'search' },
  { path: '/#/sync', name: 'sync' },
  { path: '/#/backup', name: 'backup' },
  { path: '/#/sanctum', name: 'sanctum' },
];

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'desktop-1366', width: 1366, height: 768 },
];

async function run() {
  console.log('===========================================================');
  console.log('🧪 FORMKIT & REDESIGNED MANAGEMENT PAGES VISUAL AUDIT');
  console.log('===========================================================');

  const server = await startServer();
  console.log(`🚀 Test server listening on ${BASE_URL}`);

  const browser = await chromium.launch({ headless: true });
  let hasErrors = false;

  try {
    for (const vp of VIEWPORTS) {
      console.log(`\n--- Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();

      // Seed localStorage with mock user data so sanctum and sync have realistic state
      await page.addInitScript(() => {
        try {
          localStorage.setItem('thien_co_lau_active_profile', 'profile_default');
          localStorage.setItem('tcl_cloud_user', JSON.stringify({ email: 'daohuu@thiencolau.vn', id: 'usr-123' }));
        } catch (e) {}
      });

      for (const target of PAGES_TO_TEST) {
        const fullUrl = `${BASE_URL}${target.path}`;
        await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 15000 }).catch(async () => {
          await page.waitForTimeout(1000);
        });

        await page.waitForTimeout(800);

        // Check horizontal overflow
        const overflowMetrics = await page.evaluate(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
          const innerWidth = window.innerWidth;
          const delta = scrollWidth - innerWidth;
          return {
            scrollWidth,
            innerWidth,
            hasOverflow: delta > 1, // Allow 1px subpixel rounding tolerance
            delta,
          };
        });

        const statusIcon = !overflowMetrics.hasOverflow ? '✅' : '❌';
        console.log(
          `  ${statusIcon} [${vp.name}] ${target.name}: innerWidth=${overflowMetrics.innerWidth}px, scrollWidth=${overflowMetrics.scrollWidth}px (delta=${overflowMetrics.delta}px)`
        );

        if (overflowMetrics.hasOverflow) {
          hasErrors = true;
          console.error(
            `    🚨 OVERFLOW DETECTED: Page ${target.path} on ${vp.name} overflows by ${overflowMetrics.delta}px!`
          );
        }

        // Capture screenshot
        const screenshotPath = path.join(outDir, `${target.name}-${vp.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        await compressImage(screenshotPath);
      }

      await context.close();
    }
  } catch (err) {
    console.error('Test execution error:', err);
    hasErrors = true;
  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n===========================================================');
  if (hasErrors) {
    console.error('❌ FORMKIT PAGES AUDIT FAILED - Fix overflow before proceeding!');
    process.exit(1);
  } else {
    console.log('✅ ALL PAGES PASSED: 0 horizontal overflow detected across all viewports!');
    console.log(`📸 Screenshots saved & compressed in ${outDir}`);
    process.exit(0);
  }
}

run();
