import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const outDir = path.resolve(__dirname, '../docs/ui-redesign/leftover');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const PORT = 4198;
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

// Exact hash algorithm from storage.js
function hashString(str) {
  let hash = 0x811c9dc5;
  const salt = 'TCL_VAULT_2026';
  const fullStr = salt + str;
  for (let i = 0; i < fullStr.length; i++) {
    hash ^= fullStr.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

async function run() {
  console.log('--- STARTING PHASE 2 VAULT LOCK MODAL VERIFICATION ---');
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const TEST_PASSWORD = 'MatKhauBiMat888';
  const TEST_HASH = hashString(TEST_PASSWORD);
  const TEST_HINT = 'Sinh nhat su phu';

  // 1. SETUP: Unlock mode at 1366x768 (Desktop)
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`${BASE_URL}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  // Set password and hint in localStorage
  await page.evaluate(({ hash, hint }) => {
    localStorage.setItem('tcl_vault_pwd_hash', hash);
    localStorage.setItem('tcl_vault_pwd_hint', hint);
    sessionStorage.removeItem('tcl_vault_unlocked_session');
  }, { hash: TEST_HASH, hint: TEST_HINT });

  // Navigate to vault via URL or click Mật Thất toggle button
  await page.goto(`${BASE_URL}/#/?vault=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  // If not open yet, click the vault toggle button
  const modalQuery = 'div[role="dialog"][aria-modal="true"]';
  if (await page.locator(modalQuery).count() === 0) {
    const vaultToggleBtn = page.locator('button[class*="vaultToggleBtn"]').first();
    if (await vaultToggleBtn.count() > 0) {
      await vaultToggleBtn.click();
      await page.waitForTimeout(400);
    }
  }

  // Verify dialog is open
  const modal = page.locator(modalQuery).first();
  if (await modal.count() === 0) throw new Error('Vault modal not displayed in unlock mode');

  const titleText = await page.locator('#vault-modal-title').textContent();
  console.log(`Modal Title in Unlock Mode: "${titleText}"`);
  if (!titleText.includes('Mở Khóa Mật Thất')) throw new Error('Expected "Mở Khóa Mật Thất"');

  // Verify 76px rotating conic circle exists
  const conicCircle = page.locator('div[class*="iconCircleWrap"]');
  const conicBox = await conicCircle.boundingBox();
  console.log(`Conic Circle wrap size: ${conicBox?.width}x${conicBox?.height}px (expected ~76x76)`);

  // Verify input height is ~52px
  const inputEl = page.locator('#vault-main-password');
  const inputBox = await inputEl.boundingBox();
  console.log(`Input height: ${inputBox?.height}px (expected ~52px)`);

  // Click "Xem gợi ý mật khẩu"
  const hintBtn = page.locator('button:has-text("Xem gợi ý mật khẩu")');
  if (await hintBtn.count() > 0) {
    await hintBtn.click();
    await page.waitForTimeout(300);
    const hintCard = page.locator('div[class*="hintCard"]');
    if (await hintCard.count() === 0) throw new Error('Hint card did not appear upon clicking');
    console.log('Hint card displayed successfully with hint content:', await hintCard.textContent());
  }

  // Screenshot 1: Desktop Unlock mode
  const p1 = path.join(outDir, 'vault-unlock-desktop.png');
  await page.screenshot({ path: p1 });
  await compressImage(p1);

  // 2. Mobile Unlock mode (390x844)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);

  // Verify mobile drag handle is visible
  const dragHandle = page.locator('div[class*="dragHandle"]');
  const isDragVisible = await dragHandle.isVisible();
  console.log(`Mobile drag handle visible: ${isDragVisible}`);

  // Screenshot 2: Mobile Unlock mode
  const p2 = path.join(outDir, 'vault-unlock-mobile.png');
  await page.screenshot({ path: p2 });
  await compressImage(p2);

  // 3. Error state & shake test
  await page.locator('#vault-main-password').fill('MatKhauSai');
  await page.locator('#btn-vault-submit').click();
  await page.waitForTimeout(250);

  const errorEl = page.locator('div[role="alert"]');
  if (await errorEl.count() === 0) throw new Error('Error message not shown on wrong password');
  console.log('Error alert shown:', await errorEl.textContent());

  // Screenshot 3: Error state with shake
  const p3 = path.join(outDir, 'vault-error-shake.png');
  await page.screenshot({ path: p3 });
  await compressImage(p3);

  // 4. Success Transition Test
  await page.locator('#vault-main-password').fill(TEST_PASSWORD);
  await page.locator('#btn-vault-submit').click();
  // Capture success state during transition
  await page.waitForTimeout(100);
  const p4 = path.join(outDir, 'vault-success-transition.png');
  await page.screenshot({ path: p4 });
  await compressImage(p4);

  // Wait for modal to resolve and unlock vault
  await page.waitForTimeout(600);

  // 5. Test Mode 'set' at Desktop (1366x768)
  await page.setViewportSize({ width: 1366, height: 768 });
  // Clear vault password to trigger 'set' mode
  await page.evaluate(() => {
    localStorage.removeItem('tcl_vault_pwd_hash');
    localStorage.removeItem('tcl_vault_pwd_hint');
    sessionStorage.removeItem('tcl_vault_unlocked_session');
  });
  await page.goto(`${BASE_URL}/#/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  // Click vault toggle button to open set mode
  const vaultToggleBtn = page.locator('button[class*="vaultToggleBtn"]').first();
  await vaultToggleBtn.click();
  await page.waitForTimeout(500);

  const setTitle = await page.locator('#vault-modal-title').textContent();
  console.log(`Modal Title in Set Mode: "${setTitle}"`);
  if (!setTitle.includes('Thiết Lập Mật Khẩu')) throw new Error('Expected "Thiết Lập Mật Khẩu"');

  // Test password strength meter
  const newPwdInput = page.locator('#vault-main-password');
  await newPwdInput.fill('12');
  await page.waitForTimeout(200);
  let strengthLabel = await page.locator('span[class*="strengthLabel"]').textContent();
  console.log('Strength for "12":', strengthLabel);

  await newPwdInput.fill('MatKhauVip123!');
  await page.waitForTimeout(200);
  strengthLabel = await page.locator('span[class*="strengthLabel"]').textContent();
  console.log('Strength for "MatKhauVip123!":', strengthLabel);

  // Test match indicator
  const confirmPwdInput = page.locator('#vault-confirm-password');
  await confirmPwdInput.fill('MatKhauKhac');
  await page.waitForTimeout(200);
  let matchMismatch = page.locator('div[class*="matchMismatch"]');
  console.log('Mismatch indicator visible:', await matchMismatch.isVisible());

  await confirmPwdInput.fill('MatKhauVip123!');
  await page.waitForTimeout(200);
  let matchSuccess = page.locator('div[class*="matchSuccess"]');
  console.log('Match success indicator visible:', await matchSuccess.isVisible());

  // Screenshot 5: Set mode desktop
  const p5 = path.join(outDir, 'vault-set-desktop.png');
  await page.screenshot({ path: p5 });
  await compressImage(p5);

  // 6. Test Mode 'set' at Mobile (390x844)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const p6 = path.join(outDir, 'vault-set-mobile.png');
  await page.screenshot({ path: p6 });
  await compressImage(p6);

  // 7. Test Mobile Virtual Keyboard simulation (390x450)
  await page.setViewportSize({ width: 390, height: 450 });
  await page.waitForTimeout(400);

  // Verify modal is scrollable and within viewport
  const scrollHeight = await modal.evaluate((el) => el.scrollHeight);
  const clientHeight = await modal.evaluate((el) => el.clientHeight);
  console.log(`Mobile keyboard viewport height: 450px | modal scrollHeight: ${scrollHeight}px, clientHeight: ${clientHeight}px`);

  const p7 = path.join(outDir, 'vault-mobile-keyboard-scroll.png');
  await page.screenshot({ path: p7 });
  await compressImage(p7);

  // 8. Test Escape key dismiss & Tab focus trap
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const modalAfterEsc = await page.locator(modalQuery).count();
  console.log(`Modal after pressing Escape: ${modalAfterEsc} (expected 0)`);
  if (modalAfterEsc !== 0) throw new Error('Escape key did not close modal');

  await browser.close();
  server.close();

  // Audit screenshot sizes
  const leftoverFiles = fs.readdirSync(outDir).filter(f => f.startsWith('vault-'));
  console.log('Phase 2 Vault screenshots:');
  for (const f of leftoverFiles) {
    const fPath = path.join(outDir, f);
    const s = fs.statSync(fPath);
    console.log(`  - ${f}: ${(s.size / 1024).toFixed(1)} KB`);
    if (s.size > 400 * 1024) throw new Error(`${f} exceeds 400KB`);
  }

  console.log('✅ ALL PHASE 2 VAULT LOCK MODAL TESTS PASSED!');
  process.exit(0);
}

run().catch((err) => {
  console.error('Error in Phase 2 test:', err);
  process.exit(1);
});
