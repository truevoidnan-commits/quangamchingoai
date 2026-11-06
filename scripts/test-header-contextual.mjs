import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');

const PORT = 4194;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
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

async function runTest() {
  console.log('Testing Header contextual logo and document.title...');
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Test at '/'
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${BASE_URL}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  let title = await page.title();
  let logoText = await page.locator('header a[class*="logo"] span[class*="logoText"]').textContent();
  let logoClass = await page.locator('header a[class*="logo"]').getAttribute('class');
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  console.log(`[LOBBY NOVELS] Title: "${title}", Logo: "${logoText}", NoOverflow(390px): ${overflow}`);
  if (!logoText.includes('THIÊN CƠ LÂU') || !overflow) {
    throw new Error('Lobby novel failed header check');
  }

  // Test at '/comics'
  await page.goto(`${BASE_URL}/#/comics`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  title = await page.title();
  logoText = await page.locator('header a[class*="logo"] span[class*="logoText"]').textContent();
  logoClass = await page.locator('header a[class*="logo"]').getAttribute('class');
  overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  console.log(`[LOBBY COMICS] Title: "${title}", Logo: "${logoText}", NoOverflow(390px): ${overflow}`);
  if (!logoText.includes('TÀNG KINH HỌA CÁC') || !overflow) {
    throw new Error('Comics failed header check');
  }

  // Check 1366 and 1920
  for (const w of [1366, 1920]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(200);
    overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    console.log(`[WIDTH ${w}px] NoOverflow: ${overflow}`);
    if (!overflow) throw new Error(`Overflow at ${w}px`);
  }

  await browser.close();
  server.close();
  console.log('Header contextual test PASSED completely!');
  process.exit(0);
}

runTest().catch((e) => {
  console.error(e);
  process.exit(1);
});
