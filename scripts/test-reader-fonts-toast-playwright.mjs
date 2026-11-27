import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Multi-platform artifact directory (no hardcoded Windows user paths)
const artifactDir = process.env.ARTIFACT_DIR || path.join(os.tmpdir(), 'tcl-reader-test-screenshots');
if (!fs.existsSync(artifactDir)) {
  fs.mkdirSync(artifactDir, { recursive: true });
}

console.log('═══════════════════════════════════════════════════════════');
console.log('🧪 PLAYWRIGHT E2E: READER FONTS & REDESIGNED EDITOR TOAST');
console.log('═══════════════════════════════════════════════════════════\n');

// Generate 25 distinct Vietnamese paragraphs for middle-chapter scrolling tests
const sampleParagraphs = Array.from({ length: 25 }, (_, i) => {
  return `Đoạn thứ ${i + 1}: Thiên Cơ Lâu đứng sừng sững giữa biển mây trùng điệp. Gió rít từng cơn thổi qua đỉnh núi tuyết ngàn năm, mang theo linh khí tinh thuần từ chín tầng trời. Trần Phàm tĩnh tâm ngồi xếp bằng, quanh thân tỏa ra vầng hào quang tím vàng rực rỡ của Thần Thông Ảnh Họa. Từng dòng chữ cổ biến hóa ảo diệu, câu thông cùng thiên địa đạo tắc.`;
});

// Prepare test harness page HTML importing genuine shared modules
const testHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Test Reader Fonts & Toast</title>
  <script type="module" src="/@vite/client"></script>
  <link rel="stylesheet" href="/src/styles/fonts.css" />
  <link rel="stylesheet" href="/src/styles/globals.css" />
</head>
<body style="background: #101927; color: #f0f6fc; margin: 0; padding: 0;">
  <div id="root"></div>
  <script type="module">
    import React, { useState, useRef, useEffect, useCallback } from 'react';
    import ReactDOM from 'react-dom/client';
    import { FONT_OPTIONS } from '/src/hooks/useReadingSettings.js';
    import { FontChangeCoordinator, getReadingAnchor, restoreReadingAnchor } from '/src/lib/readingAnchor.js';
    import selectionStyles from '/src/components/reader/SelectionEditor.module.css';
    import readingStyles from '/src/components/reader/ReadingSettings.module.css';
    import Icon from '/src/components/ui/Icon.jsx';

    const paragraphs = ${JSON.stringify(sampleParagraphs)};

    function ReaderTestApp() {
      const [currentFontId, setCurrentFontId] = useState('serif');
      const [chapterId, setChapterId] = useState('ch-1');
      const [editorToast, setEditorToast] = useState(null);
      const [undoCount, setUndoCount] = useState(0);

      const fontObj = FONT_OPTIONS.find(f => f.id === currentFontId) || FONT_OPTIONS[1];
      const fontCss = fontObj.css;

      if (typeof window.__LATE_FALLBACK_PREPARE_COUNT !== 'number') {
        window.__LATE_FALLBACK_PREPARE_COUNT = 0;
      }

      const fontCoordinatorRef = useRef(null);
      if (!fontCoordinatorRef.current) {
        fontCoordinatorRef.current = new FontChangeCoordinator({
          onRealigned: ({ targetY, paraIndex, offsetY, sessionId }) => {
            window.__LAST_REALIGNED_PARA = paraIndex;
            window.__LAST_REALIGNED_OFFSET = offsetY;
            window.__LAST_REALIGNED_Y = targetY;
            window.__LAST_REALIGNED_SESSION = sessionId;
          }
        });
      }

      // Synchronously prepare anchor BEFORE font change
      const handleFontChange = useCallback((newId) => {
        if (newId && newId !== currentFontId) {
          fontCoordinatorRef.current.prepare(document);
        }
        setCurrentFontId(newId);
      }, [currentFontId]);

      // Realignment effect triggered when font changes (matches ReaderPage.jsx lifecycle)
      const prevFontRef = useRef(currentFontId);
      useEffect(() => {
        if (prevFontRef.current === currentFontId) return;
        prevFontRef.current = currentFontId;

        const coordinator = fontCoordinatorRef.current;
        if (!coordinator.activeAnchor || coordinator.scheduledSessionId === coordinator.currentSessionId) {
          window.__LATE_FALLBACK_PREPARE_COUNT++;
          coordinator.prepare(document);
        }

        const sessionId = coordinator.scheduleRealignments(document);

        return () => {
          if (sessionId !== null) {
            coordinator.cancel(sessionId);
          }
        };
      }, [currentFontId, chapterId]);

      // Cancel pending realignment on chapter change or unmount
      const prevChapterIdRef = useRef(chapterId);
      useEffect(() => {
        if (prevChapterIdRef.current !== chapterId) {
          prevChapterIdRef.current = chapterId;
          fontCoordinatorRef.current.cancel();
        }
      }, [chapterId]);

      useEffect(() => {
        return () => fontCoordinatorRef.current.cancel();
      }, []);

      // User scroll detection
      useEffect(() => {
        const onScroll = () => {
          fontCoordinatorRef.current.handleUserScroll(window.scrollY);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
      }, []);

      window.__APP_COORDINATOR = fontCoordinatorRef.current;
      window.__APP_CURRENT_FONT = currentFontId;
      window.__GET_READING_ANCHOR = () => getReadingAnchor(document);

      return React.createElement('div', { style: { padding: '20px 16px 140px' } }, [
        // Controls Toolbar
        React.createElement('div', {
          key: 'ctrl',
          id: 'test-controls',
          style: {
            position: 'fixed',
            top: '10px',
            right: '10px',
            zIndex: 1000,
            width: '280px',
            maxWidth: 'calc(100vw - 20px)',
            background: 'rgba(23,35,56,0.96)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            padding: '12px 14px',
            borderRadius: '14px',
            border: '1px solid rgba(255,255,255,0.12)'
          }
        }, [
          React.createElement('h3', { key: 'h3', style: { margin: '0 0 12px', fontSize: '14px', color: '#ffcc00' } }, 'Chọn Font Chữ:'),
          React.createElement('div', { key: 'fonts', className: readingStyles.fontRow },
            FONT_OPTIONS.map(f => React.createElement('button', {
              key: f.id,
              id: 'btn-font-' + f.id,
              className: readingStyles.fontBtn + (currentFontId === f.id ? ' ' + readingStyles.fontActive : ''),
              style: { fontFamily: f.css },
              onClick: () => handleFontChange(f.id)
            }, f.label))
          ),
          React.createElement('div', { key: 'toast-triggers', style: { marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
            React.createElement('button', {
              key: 'btn-toast-normal',
              id: 'btn-trigger-toast',
              style: { padding: '8px 14px', borderRadius: '8px', background: '#22c3f0', color: '#04101e', border: 'none', fontWeight: 600, cursor: 'pointer' },
              onClick: () => setEditorToast({
                message: 'Đã lưu thay đổi vào chương thành công!',
                onUndo: () => setUndoCount(c => c + 1)
              })
            }, 'Mở Toast Lưu Chương'),
            React.createElement('button', {
              key: 'btn-toast-long',
              id: 'btn-trigger-long-toast',
              style: { padding: '8px 14px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' },
              onClick: () => setEditorToast({
                message: 'Đã thay thế 28 vị trí từ ngữ trong 12 chương toàn bộ tiểu thuyết!',
                onUndo: () => setUndoCount(c => c + 1)
              })
            }, 'Mở Toast Dài'),
            React.createElement('button', {
              key: 'btn-switch-chapter',
              id: 'btn-switch-chapter',
              style: { padding: '8px 14px', borderRadius: '8px', background: 'rgba(255,204,0,0.18)', color: '#ffcc00', border: '1px solid rgba(255,204,0,0.35)', cursor: 'pointer' },
              onClick: () => setChapterId(prev => prev === 'ch-1' ? 'ch-2' : 'ch-1')
            }, 'Chuyển chương (' + chapterId + ')')
          ]),
          React.createElement('div', { key: 'undo-status', id: 'undo-status', style: { marginTop: '10px', fontSize: '13px', color: '#94a3b8' } }, 'Undo Count: ' + undoCount)
        ]),

        // Article / Novel Chapter Content
        React.createElement('article', {
          key: 'art',
          id: 'reading-content',
          style: { fontFamily: fontCss, fontSize: '18px', lineHeight: 1.85, maxWidth: '720px', margin: '0 auto' }
        }, [
          React.createElement('h1', { key: 'title', id: 'chapter-title', style: { fontFamily: fontCss, color: '#ffcc00', marginBottom: '24px' } }, 'Chương 1: Thiên Cơ Tái Hiện'),
          paragraphs.map((p, i) => React.createElement('p', {
            key: i,
            id: 'para-' + i,
            'data-para-index': i,
            style: { margin: '0 0 1.4em', textIndent: '1.8em', padding: '4px 0' }
          }, p))
        ]),

        // Redesigned Toast
        editorToast && React.createElement('div', {
          key: 'toast',
          id: 'editor-toast',
          className: selectionStyles.editorToast,
          role: 'status',
          'aria-live': 'polite'
        }, [
          React.createElement('span', { key: 'icon', className: selectionStyles.toastIconWrap, 'aria-hidden': 'true' },
            React.createElement(Icon, { name: 'check', size: 13, className: selectionStyles.toastIcon })
          ),
          React.createElement('span', { key: 'msg', id: 'toast-message', className: selectionStyles.toastMessage }, editorToast.message),
          editorToast.onUndo && React.createElement('button', {
            key: 'undo',
            id: 'toast-undo-btn',
            type: 'button',
            className: selectionStyles.undoBtn,
            onClick: editorToast.onUndo
          }, 'Hoàn tác'),
          React.createElement('button', {
            key: 'close',
            id: 'toast-close-btn',
            type: 'button',
            className: selectionStyles.toastCloseBtn,
            onClick: () => setEditorToast(null),
            title: 'Đóng thông báo',
            'aria-label': 'Đóng thông báo'
          }, React.createElement(Icon, { name: 'x', size: 14 }))
        ])
      ]);
    }

    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(ReaderTestApp));
    window.__APP_MOUNTED = true;
  </script>
</body>
</html>`;

const tempHtmlPath = path.join(projectRoot, 'test-reader-runner.html');
fs.writeFileSync(tempHtmlPath, testHtml);

// 1. Start Vite Dev Server with HMR disabled to prevent unwanted reloads
const devServer = await createServer({
  server: {
    port: 5198,
    host: '127.0.0.1',
    hmr: false,
  },
  appType: 'spa'
});
await devServer.listen();
const serverUrl = devServer.resolvedUrls.local[0];
console.log('⚡ Vite dev server listening at:', serverUrl);

const browser = await chromium.launch({ headless: true });

try {
  // -------------------------------------------------------------
  // TEST A: Desktop Viewport (1280x800) — Font Switching & Middle-Chapter Reflow
  // -------------------------------------------------------------
  console.log('🖥️ Testing Desktop Viewport (1280x800)...');
  const desktopPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const desktopErrors = [];
  desktopPage.on('pageerror', err => {
    console.error('DESKTOP_PAGE_ERROR:', err.message);
    desktopErrors.push(err.message);
  });
  desktopPage.on('console', msg => {
    if (msg.type() === 'error') console.error('DESKTOP_CONSOLE_ERROR:', msg.text());
  });

  // Track WOFF2 network requests
  const loadedFonts = [];
  desktopPage.on('response', resp => {
    const url = resp.url();
    if (url.includes('.woff2') || url.includes('fonts/')) {
      loadedFonts.push({ url, status: resp.status() });
    }
  });

  await desktopPage.goto(serverUrl + 'test-reader-runner.html', { waitUntil: 'domcontentloaded' });
  await desktopPage.waitForFunction(() => window.__APP_MOUNTED === true, { timeout: 10000 });
  assert.equal(desktopErrors.length, 0, 'No page errors on mount');

  // Verify all 6 font buttons exist
  const fontBtns = desktopPage.locator('button[id^="btn-font-"]');
  assert.equal(await fontBtns.count(), 6, 'Must display all 6 font options');

  // 1. Scroll down to middle of chapter (Paragraph 12 at non-zero intra-paragraph offset: rect.top = 52px)
  console.log('  Scrolling to middle of long chapter (Paragraph 12 at top ~52px)...');
  const para12 = desktopPage.locator('#para-12');
  await desktopPage.evaluate(() => {
    const el = document.getElementById('para-12');
    if (el) {
      const targetY = Math.max(0, window.scrollY + el.getBoundingClientRect().top - 52);
      window.scrollTo({ top: targetY, behavior: 'instant' });
    }
  });
  await desktopPage.waitForTimeout(100);

  const initialTop12 = await para12.evaluate(el => el.getBoundingClientRect().top);
  const initialScrollY = await desktopPage.evaluate(() => window.scrollY);
  const initialAnchor = await desktopPage.evaluate(() => window.__GET_READING_ANCHOR());
  assert.ok(initialScrollY > 400, 'Initial scroll position must be deep in the chapter');
  assert.equal(initialAnchor.paraIndex, 12, `Initial reading anchor must be paraIndex 12 (got: ${initialAnchor.paraIndex})`);
  assert.ok(Math.abs(initialTop12 - 52) < 5, `Paragraph 12 must start near 52px (got: ${initialTop12})`);

  const verifyParagraph12Anchor = async (label) => {
    const metrics = await desktopPage.evaluate(() => {
      const el = document.getElementById('para-12');
      const rect = el.getBoundingClientRect();
      return {
        scrollY: window.scrollY,
        top12: rect.top,
        anchor: window.__GET_READING_ANCHOR(),
        lastRealignedPara: window.__LAST_REALIGNED_PARA,
        lateFallbackCount: window.__LATE_FALLBACK_PREPARE_COUNT,
      };
    });
    assert.equal(metrics.lateFallbackCount, 0, `${label}: old effect cleanup must NOT wipe pre-reflow activeAnchor`);
    assert.equal(metrics.lastRealignedPara, 12, `${label}: coordinator must realign paraIndex 12 (got: ${metrics.lastRealignedPara})`);
    assert.equal(metrics.anchor.paraIndex, 12, `${label}: reading anchor paraIndex must remain 12 (got: ${metrics.anchor.paraIndex})`);
    assert.ok(
      Math.abs(metrics.top12 - initialTop12) <= 3,
      `${label}: exact offset of paragraph 12 must be preserved (expected top ~${initialTop12}, got ${metrics.top12})`
    );
  };

  // 2. Full sequence: Serif -> Literata -> Patrick Hand -> Serif
  console.log('  Switching Serif -> Literata...');
  await desktopPage.locator('#btn-font-literata').click();
  await desktopPage.waitForFunction(() => window.__APP_CURRENT_FONT === 'literata', { timeout: 5000 });
  await desktopPage.waitForTimeout(550);

  const literataContentFamily = await desktopPage.locator('#reading-content').evaluate(el => window.getComputedStyle(el).fontFamily);
  assert.ok(literataContentFamily.toLowerCase().includes('literata'), `Must apply Literata font-family (got: ${literataContentFamily})`);
  await verifyParagraph12Anchor('Serif -> Literata');

  console.log('  Switching Literata -> Patrick Hand...');
  await desktopPage.locator('#btn-font-patrick-hand').click();
  await desktopPage.waitForFunction(() => window.__APP_CURRENT_FONT === 'patrick-hand', { timeout: 5000 });
  await desktopPage.waitForTimeout(550);

  const patrickContentFamily = await desktopPage.locator('#reading-content').evaluate(el => window.getComputedStyle(el).fontFamily);
  assert.ok(patrickContentFamily.toLowerCase().includes('patrick hand'), `Must apply Patrick Hand (got: ${patrickContentFamily})`);
  await verifyParagraph12Anchor('Literata -> Patrick Hand');

  console.log('  Switching Patrick Hand -> Serif...');
  await desktopPage.locator('#btn-font-serif').click();
  await desktopPage.waitForFunction(() => window.__APP_CURRENT_FONT === 'serif', { timeout: 5000 });
  await desktopPage.waitForTimeout(550);

  const serifContentFamily = await desktopPage.locator('#reading-content').evaluate(el => window.getComputedStyle(el).fontFamily);
  assert.ok(serifContentFamily.toLowerCase().includes('serif'), `Must apply Serif (got: ${serifContentFamily})`);
  await verifyParagraph12Anchor('Patrick Hand -> Serif');

  // 3. Rapid mid-session consecutive switching (30ms intervals BEFORE previous 500ms session finishes)
  console.log('  Testing rapid mid-session switching (Serif -> Literata -> Patrick Hand -> Serif before session end)...');
  await desktopPage.locator('#btn-font-literata').click();
  await desktopPage.waitForTimeout(30);
  await desktopPage.locator('#btn-font-patrick-hand').click();
  await desktopPage.waitForTimeout(30);
  await desktopPage.locator('#btn-font-serif').click();
  await desktopPage.waitForFunction(() => window.__APP_CURRENT_FONT === 'serif', { timeout: 5000 });
  await desktopPage.waitForTimeout(600);

  await verifyParagraph12Anchor('Rapid Serif -> Literata -> Patrick Hand -> Serif');
  assert.equal(desktopErrors.length, 0, 'No errors during rapid mid-session font switching');

  // 4. Verify chapter transition cancels active font session
  console.log('  Testing chapter change cancellation mid-session...');
  await desktopPage.locator('#btn-font-literata').click();
  await desktopPage.waitForTimeout(20);
  await desktopPage.locator('#btn-switch-chapter').click();
  await desktopPage.waitForTimeout(100);
  const afterChapterSwitchState = await desktopPage.evaluate(() => ({
    activeAnchor: window.__APP_COORDINATOR.activeAnchor,
    timersCount: window.__APP_COORDINATOR.timers.length,
  }));
  assert.equal(afterChapterSwitchState.activeAnchor, null, 'Chapter switch must clear activeAnchor');
  assert.equal(afterChapterSwitchState.timersCount, 0, 'Chapter switch must clear pending timers');

  // 5. Test Editor Toast Presentation on Desktop
  console.log('  Testing Editor Toast presentation on Desktop...');
  await desktopPage.locator('#btn-trigger-toast').click();
  const toastEl = desktopPage.locator('#editor-toast');
  await toastEl.waitFor({ state: 'visible', timeout: 5000 });

  const toastStyle = await toastEl.evaluate(el => {
    const cs = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      borderRadius: cs.borderRadius,
      backgroundColor: cs.backgroundColor,
      borderColor: cs.borderColor,
      width: rect.width,
      height: rect.height,
    };
  });
  console.log('  Desktop Toast metrics:', toastStyle);
  assert.equal(toastStyle.borderRadius, '14px', 'Must use 14px border radius (not pill 30px)');
  assert.ok(toastStyle.width < 500, `Desktop toast must be compact, not stretched full width (got: ${toastStyle.width}px)`);

  // Capture Desktop Screenshot
  const desktopShotPath = path.join(artifactDir, 'reader-fonts-toast-desktop.png');
  await desktopPage.screenshot({ path: desktopShotPath });
  console.log('  📸 Saved desktop screenshot to:', desktopShotPath);

  // Close toast via close button
  await desktopPage.locator('#toast-close-btn').click();
  await toastEl.waitFor({ state: 'hidden', timeout: 3000 });
  const statusAfterClose = await desktopPage.locator('#undo-status').textContent();
  assert.equal(statusAfterClose, 'Undo Count: 0', 'Close button must not trigger undo');

  await desktopPage.close();

  // -------------------------------------------------------------
  // TEST B: Mobile Viewport (iPhone 14/15: 390x844) & User Active Scroll
  // -------------------------------------------------------------
  console.log('\n📱 Testing Mobile Viewport (390x844)...');
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const mobileErrors = [];
  mobilePage.on('pageerror', err => mobileErrors.push(err.message));

  await mobilePage.goto(serverUrl + 'test-reader-runner.html', { waitUntil: 'domcontentloaded' });
  await mobilePage.waitForFunction(() => window.__APP_MOUNTED === true, { timeout: 10000 });
  assert.equal(mobileErrors.length, 0, 'No mobile page errors');

  // 1. Mobile font change at paragraph 8 (at non-zero intra-paragraph offset top ~56px)
  const mobilePara8 = mobilePage.locator('#para-8');
  await mobilePage.evaluate(() => {
    const el = document.getElementById('para-8');
    if (el) {
      const targetY = Math.max(0, window.scrollY + el.getBoundingClientRect().top - 56);
      window.scrollTo({ top: targetY, behavior: 'instant' });
    }
  });
  await mobilePage.waitForTimeout(100);
  const mobileInitialTop8 = await mobilePara8.evaluate(el => el.getBoundingClientRect().top);

  await mobilePage.locator('#btn-font-literata').click();
  await mobilePage.waitForFunction(() => window.__APP_CURRENT_FONT === 'literata', { timeout: 5000 });
  await mobilePage.waitForTimeout(550);

  const mobileMetricsAfter = await mobilePage.evaluate(() => ({
    scrollY: window.scrollY,
    top8: document.getElementById('para-8').getBoundingClientRect().top,
    anchor: window.__GET_READING_ANCHOR(),
    lateFallbackCount: window.__LATE_FALLBACK_PREPARE_COUNT,
  }));
  assert.equal(mobileMetricsAfter.lateFallbackCount, 0, 'Mobile must capture anchor pre-reflow');
  assert.equal(mobileMetricsAfter.anchor.paraIndex, 8, `Mobile reading anchor must remain paraIndex 8 (got: ${mobileMetricsAfter.anchor.paraIndex})`);
  assert.ok(
    Math.abs(mobileMetricsAfter.top8 - mobileInitialTop8) <= 3,
    `Mobile paragraph 8 offset must be preserved (expected ~${mobileInitialTop8}, got: ${mobileMetricsAfter.top8})`
  );

  // 2. Test user actively scrolling during font loading (coordinator must NOT fight user)
  console.log('  Testing user actively scrolling (coordinator must yield to user intent)...');
  // Trigger font switch
  await mobilePage.locator('#btn-font-patrick-hand').click();
  // User deliberately scrolls down by 300px immediately
  await mobilePage.evaluate(() => window.scrollBy({ top: 300, behavior: 'instant' }));
  const userMovedY = await mobilePage.evaluate(() => window.scrollY);
  // Wait past all realignment timer windows
  await mobilePage.waitForTimeout(600);
  const finalUserY = await mobilePage.evaluate(() => window.scrollY);
  // The coordinator must not have dragged the user back up to the old position
  assert.ok(Math.abs(finalUserY - userMovedY) < 30, `Coordinator must yield to deliberate user scrolling (final: ${finalUserY}, user moved to: ${userMovedY})`);

  // 3. Mobile Toast verification
  await mobilePage.locator('#btn-trigger-toast').click();
  const mobileToast = mobilePage.locator('#editor-toast');
  await mobileToast.waitFor({ state: 'visible', timeout: 5000 });

  const isOverflowing = await mobilePage.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  assert.equal(isOverflowing, false, 'Mobile page must not horizontally overflow with toast open');

  const mobileMetrics = await mobileToast.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return {
      width: rect.width,
      left: rect.left,
      right: rect.right,
      windowWidth: window.innerWidth
    };
  });
  console.log('  Mobile Toast metrics (390px):', mobileMetrics);
  assert.ok(mobileMetrics.right <= 390, 'Toast must stay within 390px screen');
  assert.ok(mobileMetrics.left >= 0, 'Toast must not be clipped on left');

  // Test Undo button click
  await mobilePage.locator('#toast-undo-btn').click();
  const mobileStatus = await mobilePage.locator('#undo-status').textContent();
  assert.equal(mobileStatus, 'Undo Count: 1', 'Clicking Hoàn tác must trigger undo callback');

  // Capture Mobile Screenshot
  const mobileShotPath = path.join(artifactDir, 'reader-fonts-toast-mobile-390.png');
  await mobilePage.screenshot({ path: mobileShotPath });
  console.log('  📸 Saved mobile screenshot (390px) to:', mobileShotPath);

  await mobilePage.close();

  // -------------------------------------------------------------
  // TEST C: Small Mobile Viewport (iPhone SE: 320x568) with Long Message
  // -------------------------------------------------------------
  console.log('\n📱 Testing Small Mobile Viewport (320x568) with Long Text...');
  const smallPage = await browser.newPage({ viewport: { width: 320, height: 568 } });
  await smallPage.goto(serverUrl + 'test-reader-runner.html', { waitUntil: 'domcontentloaded' });
  await smallPage.waitForFunction(() => window.__APP_MOUNTED === true, { timeout: 10000 });

  // Trigger long toast
  await smallPage.locator('#btn-trigger-long-toast').click();
  const smallToast = smallPage.locator('#editor-toast');
  await smallToast.waitFor({ state: 'visible', timeout: 5000 });

  const smallOverflow = await smallPage.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  assert.equal(smallOverflow, false, 'Small mobile screen (320px) must not overflow with long message');

  const smallMetrics = await smallToast.evaluate(el => {
    const rect = el.getBoundingClientRect();
    return {
      width: rect.width,
      left: rect.left,
      right: rect.right,
      windowWidth: window.innerWidth
    };
  });
  console.log('  Small Mobile Toast metrics (320px):', smallMetrics);
  assert.ok(smallMetrics.right <= 320, 'Toast must stay within 320px screen');

  // Capture Small Mobile Screenshot
  const smallShotPath = path.join(artifactDir, 'reader-fonts-toast-mobile-320.png');
  await smallPage.screenshot({ path: smallShotPath });
  console.log('  📸 Saved small mobile screenshot (320px) to:', smallShotPath);

  await smallPage.close();

  // -------------------------------------------------------------
  // TEST D: WOFF2 Font HTTP 200 Delivery Verification
  // -------------------------------------------------------------
  console.log('\n🔤 Verifying WOFF2 Fonts HTTP 200 delivery...');
  const reqContext = await browser.newContext();
  const litViRes = await reqContext.request.get(serverUrl + 'src/assets/fonts/literata/literata-v40-vietnamese.woff2');
  assert.equal(litViRes.status(), 200, 'Literata vietnamese woff2 must serve HTTP 200');
  assert.ok((await litViRes.body()).length > 5000, 'Literata woff2 must have non-empty binary content');

  const patViRes = await reqContext.request.get(serverUrl + 'src/assets/fonts/patrick-hand/patrick-hand-v25-vietnamese.woff2');
  assert.equal(patViRes.status(), 200, 'Patrick Hand vietnamese woff2 must serve HTTP 200');
  assert.ok((await patViRes.body()).length > 5000, 'Patrick Hand woff2 must have non-empty binary content');
  await reqContext.close();

  console.log('\n🎉 ALL PLAYWRIGHT E2E TESTS PASSED SUCCESSFULLY!\n');
} finally {
  if (fs.existsSync(tempHtmlPath)) {
    try { fs.unlinkSync(tempHtmlPath); } catch {}
  }
  await browser.close();
  await devServer.close();
}
