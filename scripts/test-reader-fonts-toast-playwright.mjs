import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const artifactDir = process.env.ARTIFACT_DIR || 'C:/Users/ADMIN/.gemini/antigravity/brain/5badca54-4ca4-4d4f-aa16-774f1b682a2c';
if (!fs.existsSync(artifactDir)) {
  fs.mkdirSync(artifactDir, { recursive: true });
}

console.log('═══════════════════════════════════════════════════════════');
console.log('🧪 PLAYWRIGHT E2E: READER FONTS & REDESIGNED EDITOR TOAST');
console.log('═══════════════════════════════════════════════════════════\n');

// 1. Start Vite Dev Server
const devServer = await createServer({
  server: { port: 5198, host: '127.0.0.1' },
  appType: 'spa'
});
await devServer.listen();
const serverUrl = devServer.resolvedUrls.local[0];
console.log('⚡ Vite dev server listening at:', serverUrl);

// 2. Prepare test harness page HTML
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
    import React, { useState, useRef, useEffect } from 'react';
    import ReactDOM from 'react-dom/client';
    import { FONT_OPTIONS } from '/src/hooks/useReadingSettings.js';
    import selectionStyles from '/src/components/reader/SelectionEditor.module.css';
    import readingStyles from '/src/components/reader/ReadingSettings.module.css';
    import Icon from '/src/components/ui/Icon.jsx';

    function ReaderTestApp() {
      const [currentFontId, setCurrentFontId] = useState('serif');
      const [editorToast, setEditorToast] = useState(null);
      const [undoCount, setUndoCount] = useState(0);

      const fontObj = FONT_OPTIONS.find(f => f.id === currentFontId) || FONT_OPTIONS[1];
      const fontCss = fontObj.css;

      // Paragraph reflow realignment simulation
      const prevFontRef = useRef(currentFontId);
      useEffect(() => {
        if (prevFontRef.current === currentFontId) return;
        prevFontRef.current = currentFontId;

        let targetIndex = 2; // Suppose user reading paragraph 2
        const paraEls = document.querySelectorAll('[data-para-index]');
        for (let i = 0; i < paraEls.length; i++) {
          const r = paraEls[i].getBoundingClientRect();
          if (r.bottom >= 60 && r.top <= 140) {
            targetIndex = i;
            break;
          }
        }

        const realign = () => {
          const target = document.getElementById('para-' + targetIndex);
          if (target) {
            const r = target.getBoundingClientRect();
            const targetY = Math.max(0, window.scrollY + r.top - 70);
            window.scrollTo({ top: targetY, behavior: 'instant' });
            window.__LAST_REALIGNED_PARA = targetIndex;
            window.__LAST_REALIGNED_Y = targetY;
          }
        };

        realign();
        if (document.fonts?.ready) {
          document.fonts.ready.then(realign).catch(() => {});
        }
      }, [currentFontId]);

      return React.createElement('div', { style: { padding: '24px 20px 120px' } }, [
        // Controls Toolbar
        React.createElement('div', { key: 'ctrl', style: { marginBottom: '24px', background: 'rgba(23,35,56,0.8)', padding: '16px', borderRadius: '14px' } }, [
          React.createElement('h3', { key: 'h3', style: { margin: '0 0 12px', fontSize: '15px', color: '#ffcc00' } }, 'Chọn Font Chữ:'),
          React.createElement('div', { key: 'fonts', className: readingStyles.fontRow },
            FONT_OPTIONS.map(f => React.createElement('button', {
              key: f.id,
              id: 'btn-font-' + f.id,
              className: readingStyles.fontBtn + (currentFontId === f.id ? ' ' + readingStyles.fontActive : ''),
              style: { fontFamily: f.css },
              onClick: () => setCurrentFontId(f.id)
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
            }, 'Mở Toast Dài')
          ]),
          React.createElement('div', { key: 'undo-status', id: 'undo-status', style: { marginTop: '10px', fontSize: '13px', color: '#94a3b8' } }, 'Undo Count: ' + undoCount)
        ]),

        // Article / Novel Chapter Content
        React.createElement('article', {
          key: 'art',
          id: 'reading-content',
          style: { fontFamily: fontCss, fontSize: '18px', lineHeight: 1.85, maxWidth: '760px', margin: '0 auto' }
        }, [
          React.createElement('h1', { key: 'title', id: 'chapter-title', style: { fontFamily: fontCss, color: '#ffcc00', marginBottom: '24px' } }, 'Chương 1: Thiên Cơ Tái Hiện'),
          React.createElement('p', { key: 'p0', id: 'para-0', 'data-para-index': 0 }, 'Đêm trăng thanh vắng, trên đỉnh Thiên Cơ Lâu gió lộng thổi tung tà áo bào xanh thẫm. Trần Phàm đứng chắp tay nhìn về phía chân trời vô tận.'),
          React.createElement('p', { key: 'p1', id: 'para-1', 'data-para-index': 1 }, 'Tu tiên chi lộ gian nan muôn trùng, chỉ có người kiên định tâm trí mới có thể vượt qua ngàn tầng kiếp nạn mà chứng đạo trường sinh.'),
          React.createElement('p', { key: 'p2', id: 'para-2', 'data-para-index': 2, style: { background: 'rgba(34, 195, 240, 0.08)', padding: '12px', borderRadius: '8px' } }, 'Thần Thông Ảnh Họa sáng rực trong hư không, từng dòng chữ cổ xưa như rồng bay phượng múa hiện ra trước mắt: "Tâm bất biến giữa dòng đời vạn biến, đạo tại nhân tâm."'),
          React.createElement('p', { key: 'p3', id: 'para-3', 'data-para-index': 3 }, 'Một luồng linh lực ấm áp từ đan điền dâng trào, lan toả khắp kinh mạch kỳ kinh bát mạch, khiến cho toàn thân hắn sảng khoái dị thường.'),
          React.createElement('p', { key: 'p4', id: 'para-4', 'data-para-index': 4 }, 'Dưới chân núi, sương mù lượn lờ bao phủ ngàn dặm giang sơn, báo hiệu một thời kỳ phong vân biến ảo sắp sửa bắt đầu.')
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

const browser = await chromium.launch({ headless: true });

try {
  // -------------------------------------------------------------
  // TEST A: Desktop Viewport (1280x800)
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

  await desktopPage.goto(serverUrl + 'test-reader-runner.html');
  await desktopPage.waitForFunction(() => window.__APP_MOUNTED === true, { timeout: 10000 });
  assert.equal(desktopErrors.length, 0, 'No page errors on mount');

  // Verify all 6 font buttons exist
  const fontBtns = desktopPage.locator('button[id^="btn-font-"]');
  assert.equal(await fontBtns.count(), 6, 'Must display all 6 font options');

  // 1. Test Literata font selection
  console.log('  Testing Literata font selection...');
  await desktopPage.locator('#btn-font-literata').click();
  const contentFamily = await desktopPage.locator('#reading-content').evaluate(el => window.getComputedStyle(el).fontFamily);
  assert.ok(contentFamily.toLowerCase().includes('literata'), `Content font-family must include Literata (got: ${contentFamily})`);

  // 2. Test Patrick Hand font selection
  console.log('  Testing Patrick Hand font selection...');
  await desktopPage.locator('#btn-font-patrick-hand').click();
  const patrickFamily = await desktopPage.locator('#reading-content').evaluate(el => window.getComputedStyle(el).fontFamily);
  assert.ok(patrickFamily.toLowerCase().includes('patrick hand'), `Content font-family must include Patrick Hand (got: ${patrickFamily})`);

  // 3. Test Toast Display & Styling on Desktop
  console.log('  Testing Editor Toast presentation on Desktop...');
  await desktopPage.locator('#btn-trigger-toast').click();
  const toastEl = desktopPage.locator('#editor-toast');
  await toastEl.waitFor({ state: 'visible', timeout: 5000 });

  // Verify toast styles
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
  // TEST B: Mobile Viewport (iPhone 14/15: 390x844)
  // -------------------------------------------------------------
  console.log('\n📱 Testing Mobile Viewport (390x844)...');
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const mobileErrors = [];
  mobilePage.on('pageerror', err => mobileErrors.push(err.message));

  await mobilePage.goto(serverUrl + 'test-reader-runner.html');
  await mobilePage.waitForFunction(() => window.__APP_MOUNTED === true, { timeout: 10000 });
  assert.equal(mobileErrors.length, 0, 'No mobile page errors');

  // Trigger toast
  await mobilePage.locator('#btn-trigger-toast').click();
  const mobileToast = mobilePage.locator('#editor-toast');
  await mobileToast.waitFor({ state: 'visible', timeout: 5000 });

  // Verify mobile bounds (no horizontal scrollbar / overflow)
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
  await smallPage.goto(serverUrl + 'test-reader-runner.html');
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

  console.log('\n🎉 ALL PLAYWRIGHT E2E TESTS PASSED SUCCESSFULLY!\n');
} finally {
  if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath);
  await browser.close();
  await devServer.close();
}
