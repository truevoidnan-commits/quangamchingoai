import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');
const outDir = path.resolve(__dirname, '../docs/ui-redesign/reader-mobile-fixes');
const artifactDir = process.env.ARTIFACT_DIR || path.resolve(
  process.env.USERPROFILE || 'C:/Users/ADMIN',
  '.gemini/antigravity/brain/04a8635f-ab90-4862-af83-b6463b1f6a83'
);

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
if (!fs.existsSync(artifactDir)) {
  try {
    fs.mkdirSync(artifactDir, { recursive: true });
  } catch (e) {}
}

const PORT = 4399;
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
};

function startServer() {
  const server = http.createServer((req, res) => {
    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/' || !reqPath) reqPath = '/index.html';
    let filePath = path.join(distDir, reqPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      if (reqPath.startsWith('/images/') || reqPath.startsWith('/assets/')) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }
      filePath = path.join(distDir, 'index.html');
    }
    const ext = path.extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime, 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

async function saveOptimizedPng(buffer, targetName) {
  const targetPath = path.join(outDir, targetName);
  let optimized = await sharp(buffer)
    .png({ quality: 85, compressionLevel: 9, palette: true })
    .toBuffer();

  if (optimized.length > 390 * 1024) {
    optimized = await sharp(buffer)
      .png({ colours: 192, compressionLevel: 9, palette: true })
      .toBuffer();
  }

  fs.writeFileSync(targetPath, optimized);
  const kb = optimized.length / 1024;
  console.log(`  📸 Saved screenshot: ${targetName} (${kb.toFixed(1)} KB)`);

  try {
    const brainPath = path.join(artifactDir, targetName);
    fs.writeFileSync(brainPath, optimized);
  } catch (e) {}
}

async function seedData(page, novelId, totalChapters = 2) {
  await page.evaluate(async ({ nId, count }) => {
    localStorage.setItem('tcl_active_profile', 'real');
    const req = indexedDB.open('thien-co-lau');
    await new Promise((res, rej) => {
      req.onsuccess = res;
      req.onerror = rej;
    });
    const db = req.result;
    const tx = db.transaction(['novels', 'chapters'], 'readwrite');
    tx.objectStore('novels').put({
      id: nId,
      title: 'Tu Chân Giới Đại Đạo',
      author: 'Thần Bí Đạo Nhân',
      chapterCount: count,
      totalChapters: count,
      createdAt: 1,
      updatedAt: 1,
    });
    const paras = [];
    for (let i = 0; i < 60; i++) {
      paras.push(`Đoạn văn thứ ${i + 1}: Thiên địa sơ khai, vạn vật đều do linh khí tạo thành. Tu sĩ nghịch thiên cải mệnh. (${i + 1})`);
    }
    for (let k = 1; k <= count; k++) {
      tx.objectStore('chapters').put({
        id: `${nId}-ch-${k}`,
        novelId: nId,
        order: k,
        title: `Chương ${k}: Hỗn Độn Sơ Khai Tiên Ma Quyết`,
        content: paras.join('\n\n'),
        createdAt: k,
        updatedAt: k,
      });
    }
    await new Promise((res) => {
      tx.oncomplete = res;
    });
    localStorage.setItem(
      'tcl_library',
      JSON.stringify([
        {
          id: nId,
          title: 'Tu Chân Giới Đại Đạo',
          author: 'Thần Bí Đạo Nhân',
          chapterCount: count,
          totalChapters: count,
          updatedAt: 1,
        },
      ])
    );
  }, { nId: novelId, count: totalChapters });
}

async function dragCDP(cdp, page, x, y0, y1, steps = 20) {
  let y = y0;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 0; i < steps; i++) {
    y += (y1 - y0) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(600);
}

async function swipeDocCDP(cdp, page, dy) {
  const x = 200;
  let y = 700;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  const n = 20;
  for (let i = 0; i < n; i++) {
    y -= dy / n;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: Math.max(y, 10) }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(800);
}

async function run() {
  console.log('===========================================================');
  console.log('🧪 TESTING: MOBILE READER FIXES (TIMER, SHEET SWIPE, ?q=)');
  console.log('===========================================================');

  const server = await startServer();
  console.log(`Server listening on ${BASE_URL}`);

  const browser = await chromium.launch({ headless: true });
  let hasErrors = false;

  try {
    // =========================================================================
    // TEST A: ĐỒNG HỒ NGỘ ĐẠO (NGO DAO TIMER AFTER PROGRESS PULL COMPLETES)
    // =========================================================================
    console.log('\n--- A. Testing Ngo Dao Timer Recovery after Cloud Pull Timeout ---');
    const ctxA = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const pageA = await ctxA.newPage();

    // Mock supabase requests to hang for 6s and abort, forcing pullNovelProgressNow to timeout after ~2.5s
    await pageA.route(
      (url) => !/127\.0\.0\.1/.test(url.hostname),
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 6000));
        try {
          route.abort();
        } catch {}
      }
    );

    await pageA.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await seedData(pageA, 'test-novel-timer', 2);

    // Mock valid auth session in localStorage
    await pageA.evaluate(() => {
      localStorage.setItem(
        'sb-vmzgjlooapqskcmkerdz-auth-token',
        JSON.stringify({
          access_token: 'fake.mock.access_token',
          refresh_token: 'fake.mock.refresh_token',
          token_type: 'bearer',
          expires_in: 99999,
          expires_at: Math.floor(Date.now() / 1000) + 99999,
          user: {
            id: 'mock-user-timer-1',
            aud: 'authenticated',
            email: 'user@example.com',
          },
        })
      );
    });

    const readerUrlA = `${BASE_URL}/#/novel/test-novel-timer/read/test-novel-timer-ch-1`;
    await pageA.goto(readerUrlA);
    console.log('  Navigated to reader URL directly with active user session');

    const getTimerSeconds = async () => {
      return pageA.evaluate(() => {
        const text = document.body.innerText;
        const m = text.match(/Ngộ đạo\s*(\d+)\/60s/);
        return m ? parseInt(m[1], 10) : null;
      });
    };

    // Wait up to 13s for the initial pull timeout (~2.5s) and interval ticks to accumulate >= 5s
    console.log('  Waiting ~12s for pull timeout and Ngo Dao timer progression...');
    let seconds1 = null;
    for (let i = 0; i < 26; i++) {
      await pageA.waitForTimeout(500);
      const s = await getTimerSeconds();
      if (s !== null && s >= 5) {
        seconds1 = s;
        break;
      }
    }

    console.log(`  Initial timer reading after pull: ${seconds1}/60s`);
    assert(seconds1 !== null && seconds1 >= 5, `Expected Ngo Dao timer >= 5s, got: ${seconds1}`);
    console.log('  ✓ Ngo Dao timer started successfully after pull completion!');

    // Wait an additional 3 seconds and verify it continues incrementing
    await pageA.waitForTimeout(3000);
    const seconds2 = await getTimerSeconds();
    console.log(`  Timer reading after 3 more seconds: ${seconds2}/60s`);
    assert(seconds2 !== null && seconds2 >= seconds1 + 2, `Expected timer to continue running (>= ${seconds1 + 2}), got ${seconds2}`);
    console.log('  ✓ Ngo Dao timer continues ticking reliably');

    await ctxA.close();

    // =========================================================================
    // TEST B: BOTTOMSHEET SWIPE-TO-DISMISS & CONTENT SCROLLING
    // =========================================================================
    console.log('\n--- B. Testing BottomSheet Swipe-to-Dismiss vs Content Scrolling ---');
    const ctxB = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const pageB = await ctxB.newPage();
    const cdpB = await ctxB.newCDPSession(pageB);

    await pageB.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await seedData(pageB, 'test-novel-toc', 40);

    const readerUrlB = `${BASE_URL}/#/novel/test-novel-toc/read/test-novel-toc-ch-20`;
    await pageB.goto(readerUrlB, { waitUntil: 'domcontentloaded' });
    await pageB.waitForSelector('#para-10', { timeout: 10000 });
    await pageB.waitForTimeout(800);

    const isSheetOpen = async () => pageB.evaluate(() => !!document.querySelector('[role="dialog"]'));

    // --- B.1: Topbar TOC button ---
    console.log('  Opening TOC from topbar...');
    await pageB.locator('button[aria-label="Mục lục chương"]').first().click();
    await pageB.waitForSelector('[role="dialog"]', { timeout: 5000 });
    assert(await isSheetOpen(), 'TOC dialog must be open');
    console.log('  ✓ TOC dialog opened from top bar');

    // Screenshot TOC before scrolling
    const bufBeforeScroll = await pageB.screenshot();
    await saveOptimizedPng(bufBeforeScroll, 'toc-before-scroll-390.png');

    // Swipe finger down 300px in TOC content list (scrolling list up)
    console.log('  Swiping finger down 300px in content (scroll up)...');
    await dragCDP(cdpB, pageB, 200, 400, 700);
    assert(await isSheetOpen(), 'TOC must NOT close when swiping inside content list');
    console.log('  ✓ TOC remained open after finger swipe down in list');

    // Screenshot TOC after finger swipe down
    const bufAfterScrollDown = await pageB.screenshot();
    await saveOptimizedPng(bufAfterScrollDown, 'toc-after-scroll-down-390.png');

    // Swipe finger up 400px in TOC content list
    console.log('  Swiping finger up 400px in content (scroll down)...');
    await dragCDP(cdpB, pageB, 200, 700, 300);
    assert(await isSheetOpen(), 'TOC must NOT close when swiping finger up');
    console.log('  ✓ TOC remained open after finger swipe up in list');

    // Screenshot TOC after finger swipe up
    const bufAfterScrollUp = await pageB.screenshot();
    await saveOptimizedPng(bufAfterScrollUp, 'toc-after-scroll-up-390.png');

    // Swipe down 250px starting from the handle bar -> Must close
    console.log('  Swiping down 250px from sheet handle...');
    const handleY = await pageB.evaluate(() => {
      const h = document.querySelector('[role="dialog"] [class*="handle"]');
      if (!h) return null;
      const r = h.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    assert(handleY !== null, 'Handle element must be found in sheet');
    await dragCDP(cdpB, pageB, 200, handleY, handleY + 250);
    await pageB.waitForTimeout(500);
    assert(!(await isSheetOpen()), 'TOC must close when swiped from handle');
    console.log('  ✓ TOC closed cleanly when dragged from handle');

    // --- B.2: Bottom navigation TOC button (between Prev / Next Chapter) ---
    console.log('  Opening TOC from bottom navigation bar...');
    const bottomNavTocBtn = pageB.locator('button[aria-label="Mục lục chương"]').last();
    await bottomNavTocBtn.scrollIntoViewIfNeeded();
    await bottomNavTocBtn.click();
    await pageB.waitForSelector('[role="dialog"]', { timeout: 5000 });
    assert(await isSheetOpen(), 'TOC dialog must be open from bottom nav');
    console.log('  ✓ TOC opened from bottom bar');

    await dragCDP(cdpB, pageB, 200, 400, 700);
    assert(await isSheetOpen(), 'TOC must remain open after downward scroll in list');

    const handleY2 = await pageB.evaluate(() => {
      const h = document.querySelector('[role="dialog"] [class*="handle"]');
      const r = h.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    await dragCDP(cdpB, pageB, 200, handleY2, handleY2 + 250);
    await pageB.waitForTimeout(500);
    assert(!(await isSheetOpen()), 'TOC must close when swiped from handle');
    console.log('  ✓ Bottom bar TOC closed cleanly when dragged from handle');

    // --- B.3: Reading Settings Sheet ---
    console.log('  Testing Reading Settings Sheet swipe behavior...');
    await pageB.locator('button[aria-label="Cài đặt đọc"]').click();
    await pageB.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await pageB.waitForTimeout(400); // wait for sheet open animation
    assert(await isSheetOpen(), 'Settings sheet must be open');

    // Swipe finger UP in settings content (diff < 0)
    console.log('  Swiping finger UP in settings content...');
    await dragCDP(cdpB, pageB, 200, 700, 400);
    assert(await isSheetOpen(), 'Settings sheet must NOT close on content swipe');
    console.log('  ✓ Settings sheet remained open after content swipe');

    await pageB.keyboard.press('Escape');
    await pageB.waitForTimeout(400);
    assert(!(await isSheetOpen()), 'Settings sheet closed on Escape');

    await ctxB.close();

    // =========================================================================
    // TEST C: SEARCH PARAM (?q=...) PROGRESS SAVING
    // =========================================================================
    console.log('\n--- C. Testing Reading Progress Saving when opened with ?q= ---');
    const ctxC = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const pageC = await ctxC.newPage();
    const cdpC = await ctxC.newCDPSession(pageC);

    const readerUrlC = `${BASE_URL}/#/novel/test-novel-toc/read/test-novel-toc-ch-1?q=Thi%C3%AAn`;
    await pageC.goto(readerUrlC, { waitUntil: 'domcontentloaded' });
    await pageC.waitForSelector('#para-1', { timeout: 10000 });

    // Wait 1.8s for search highlight scrolling and isRestoringRef.current = false (900ms timer)
    await pageC.waitForTimeout(1800);

    const getProgressC = async () => {
      return pageC.evaluate(() => {
        const raw = localStorage.getItem('tcl_progress_test-novel-toc');
        return raw ? JSON.parse(raw) : null;
      });
    };

    console.log('  Swiping reader content 3 times...');
    for (let i = 0; i < 3; i++) {
      await swipeDocCDP(cdpC, pageC, 550);
    }

    await pageC.waitForTimeout(1000);
    const progAfter = await getProgressC();
    console.log('  Progress in localStorage after swiping with ?q=:', progAfter);

    assert(progAfter !== null, 'Reading progress must be saved to localStorage');
    assert(
      (typeof progAfter.paraIndex === 'number' && progAfter.paraIndex > 0) ||
      (typeof progAfter.percent === 'number' && progAfter.percent > 0.05),
      `Expected paraIndex > 0 or percent > 0.05, got paraIndex=${progAfter.paraIndex}, percent=${progAfter.percent}`
    );
    console.log(`  ✓ Reading progress successfully updated: paraIndex=${progAfter.paraIndex}, percent=${(progAfter.percent * 100).toFixed(1)}%`);

    await ctxC.close();

  } catch (err) {
    console.error('🚨 TEST FAILED WITH ERROR:', err);
    hasErrors = true;
  } finally {
    await browser.close();
    server.close();
  }

  if (hasErrors) {
    console.error('\n❌ TEST READER MOBILE FIXES FAILED!');
    process.exit(1);
  } else {
    console.log('\n🎉 ALL READER MOBILE FIXES TESTS PASSED 100%!');
    process.exit(0);
  }
}

run();
