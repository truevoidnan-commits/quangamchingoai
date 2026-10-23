const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/ADMIN/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

const screenshotDir = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

const BASE_URL = 'http://localhost:4173';

const MOBILE_WIDTHS = [320, 360, 390, 430];
const PAGES = [
  { name: 'home', path: '/#/' },
  { name: 'novel_detail', path: '/#/novel/sample-001' },
  { name: 'reader', path: '/#/novel/sample-001/read/sample-ch-001' },
  { name: 'sync', path: '/#/sync' },
  { name: 'cultivation', path: '/#/cultivation' },
];

(async () => {
  console.log('--- STARTING VISUAL & RESPONSIVENESS AUDIT ---');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  let allPassed = true;
  const results = [];

  // 1. Audit mobile pages at 320, 360, 390, 430
  for (const p of PAGES) {
    for (const w of MOBILE_WIDTHS) {
      const page = await browser.newPage({ viewport: { width: w, height: 750 } });
      await page.goto(BASE_URL + p.path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);

      const metrics = await page.evaluate(() => {
        const docScrollWidth = document.documentElement.scrollWidth;
        const innerWidth = window.innerWidth;
        const headerEl = document.querySelector('header');
        const headerScrollWidth = headerEl ? headerEl.scrollWidth : 0;
        return {
          docScrollWidth,
          innerWidth,
          headerScrollWidth,
          overflow: docScrollWidth > innerWidth,
        };
      });

      const shotPath = path.join(screenshotDir, `${p.name}_${w}px.png`);
      await page.screenshot({ path: shotPath, fullPage: false });

      const passed = !metrics.overflow;
      if (!passed) allPassed = false;

      results.push({
        page: p.name,
        width: w,
        scrollWidth: metrics.docScrollWidth,
        innerWidth: metrics.innerWidth,
        headerScrollWidth: metrics.headerScrollWidth,
        passed,
      });

      console.log(
        `[${passed ? 'PASS' : 'FAIL'}] Page: ${p.name.padEnd(14)} Width: ${w}px | scrollWidth: ${metrics.docScrollWidth} vs innerWidth: ${metrics.innerWidth}`
      );
      await page.close();
    }
  }

  // 2. Audit desktop cultivation page at 1280
  const deskPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await deskPage.goto(BASE_URL + '/#/cultivation', { waitUntil: 'domcontentloaded' });
  await deskPage.waitForTimeout(1000);

  const desktopMetrics = await deskPage.evaluate(() => {
    const docScrollWidth = document.documentElement.scrollWidth;
    const innerWidth = window.innerWidth;
    return {
      docScrollWidth,
      innerWidth,
      overflow: docScrollWidth > innerWidth,
    };
  });

  const desktopShotPath = path.join(screenshotDir, `cultivation_1280px.png`);
  await deskPage.screenshot({ path: desktopShotPath, fullPage: false });
  const desktopPassed = !desktopMetrics.overflow;
  if (!desktopPassed) allPassed = false;
  results.push({
    page: 'cultivation',
    width: 1280,
    scrollWidth: desktopMetrics.docScrollWidth,
    innerWidth: desktopMetrics.innerWidth,
    passed: desktopPassed,
  });
  console.log(
    `[${desktopPassed ? 'PASS' : 'FAIL'}] Page: cultivation    Width: 1280px | scrollWidth: ${desktopMetrics.docScrollWidth} vs innerWidth: ${desktopMetrics.innerWidth}`
  );
  await deskPage.close();

  // 3. Audit ProfileSwitcher column width from 180px to 320px in CultivationWorkspace
  console.log('\n--- TESTING PROFILE SWITCHER COLUMN WIDTH (180px -> 320px) ---');
  const profPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await profPage.goto(BASE_URL + '/#/cultivation', { waitUntil: 'domcontentloaded' });
  await profPage.waitForTimeout(1000);

  const testColumnWidths = [180, 200, 240, 280, 320];
  for (const colW of testColumnWidths) {
    const switcherMetrics = await profPage.evaluate((width) => {
      const colLeft = document.querySelector('.cultivation-col-left');
      if (colLeft) {
        colLeft.style.width = width + 'px';
        colLeft.style.minWidth = width + 'px';
        colLeft.style.maxWidth = width + 'px';
      }

      const container = document.querySelector('[class*="switcherContainer"]');
      if (!container) return { found: false };

      const label = container.querySelector('[class*="profileLabel"]');
      const val = container.querySelector('[class*="profileValue"]');
      const btn = container.querySelector('[class*="switchBtn"]');

      if (!label || !val || !btn) return { found: false };

      const labelHeight = label.offsetHeight;
      const isLabelSingleLine = labelHeight <= 20;

      const valHeight = val.offsetHeight;
      const isValSingleLine = valHeight <= 26;

      const btnHeight = btn.offsetHeight;
      const isBtnSingleLine = btnHeight <= 38;

      return {
        found: true,
        isLabelSingleLine,
        isValSingleLine,
        isBtnSingleLine,
        labelHeight,
        valHeight,
        btnHeight,
      };
    }, colW);

    const shotColPath = path.join(screenshotDir, `profile_switcher_${colW}px.png`);
    const switcherElem = await profPage.$('[class*="switcherContainer"]');
    if (switcherElem) {
      await switcherElem.screenshot({ path: shotColPath });
    }

    const passed = Boolean(
      switcherMetrics &&
      switcherMetrics.found &&
      switcherMetrics.isLabelSingleLine &&
      switcherMetrics.isValSingleLine &&
      switcherMetrics.isBtnSingleLine
    );
    if (!passed) allPassed = false;

    console.log(
      `[${passed ? 'PASS' : 'FAIL'}] Column width ${colW}px: Label single line: ${switcherMetrics?.isLabelSingleLine} (${switcherMetrics?.labelHeight}px), Value single line: ${switcherMetrics?.isValSingleLine} (${switcherMetrics?.valHeight}px), Button single line: ${switcherMetrics?.isBtnSingleLine} (${switcherMetrics?.btnHeight}px)`
    );
  }

  await profPage.close();
  await browser.close();

  console.log('\n--- VISUAL AUDIT SUMMARY ---');
  if (allPassed) {
    console.log('✅ ALL SCREENSHOTS VERIFIED: scrollWidth <= innerWidth AT ALL RESOLUTIONS!');
    console.log('✅ ALL PROFILE SWITCHER WIDTHS (180px - 320px) VERIFIED: ZERO LINE BREAKS!');
    process.exit(0);
  } else {
    console.error('❌ SOME AUDIT CHECKS FAILED!');
    process.exit(1);
  }
})();
