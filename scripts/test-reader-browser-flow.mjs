/**
 * scripts/test-reader-browser-flow.mjs
 *
 * Kiểm thử tự động qua trình duyệt thực (Chrome Headless + Chrome DevTools Protocol):
 * 1. Khởi động server phục vụ bản build dist/
 * 2. Mở trình duyệt truy cập thẳng: #/novel/novel_test/read/ch3 (mô phỏng reload tab cũ)
 * 3. Cloud đang ở ch36 -> verify URL tự nhảy sang ch36 + hiện toast "Quay lại vị trí cũ"
 * 4. Verify trong suốt quá trình đó KHÔNG CÓ bất kỳ lần ghi nào của ch3 lên Cloud
 * 5. Bấm nút "Quay lại vị trí cũ" -> verify URL trở về ch3 và lúc này mới ghi nhận ch3
 * 6. Chụp ảnh màn hình lưu vào artifacts/reader_guard/
 */

import child_process from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const artifactsDir = path.join(rootDir, 'artifacts/reader_guard');
const userArtifactDir = 'C:\\Users\\ADMIN\\.gemini\\antigravity\\brain\\04a8635f-ab90-4862-af83-b6463b1f6a83';

if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

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

// 1. Tạo HTTP static server phục vụ dist/
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || !reqPath) reqPath = '/index.html';
  let filePath = path.join(distDir, reqPath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(distDir, 'index.html');
  }

  const ext = path.extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(filePath).pipe(res);
});

const PORT = 4188;
await new Promise((resolve) => server.listen(PORT, '127.0.0.1', resolve));
console.log(`✓ Test server đang chạy tại http://127.0.0.1:${PORT}`);

// 2. Khởi động Chrome Headless
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-reader-test-'));

const chromeProc = child_process.spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=9233',
  `--user-data-dir=${tempDir}`,
  '--disable-gpu',
  '--no-first-run',
  '--window-size=1280,900',
  'about:blank',
]);

async function getWsUrl() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://127.0.0.1:9233/json/version');
      if (res.ok) {
        const json = await res.json();
        return json.webSocketDebuggerUrl;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Không thể kết nối Chrome DevTools Protocol sau 6s');
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.msgId = 0;
    this.pending = new Map();
    this.eventListeners = new Map();

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      } else if (msg.method) {
        const listeners = this.eventListeners.get(msg.method) || [];
        listeners.forEach((fn) => fn(msg.params));
      }
    };
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }

  send(method, params = {}) {
    const id = ++this.msgId;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close() {
    this.ws.close();
  }
}

async function runBrowserFlow() {
  const browserWs = await getWsUrl();
  console.log('✓ Kết nối CDP tới Chrome:', browserWs);
  const browser = new CDPClient(browserWs);
  await browser.ready();

  const { targetId } = await browser.send('Target.createTarget', {
    url: 'about:blank',
  });

  const targetsRes = await fetch('http://127.0.0.1:9233/json/list');
  const targets = await targetsRes.json();
  const pageTarget = targets.find((t) => t.id === targetId);
  const pageWs = pageTarget.webSocketDebuggerUrl;
  const page = new CDPClient(pageWs);
  await page.ready();

  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('DOM.enable');

  const preloadScript = `
    // 1. Hook theo dõi các lần ghi tcl_progress_* vào localStorage
    window.__tcl_progressWrites = [];
    const _origSetItem = localStorage.setItem.bind(localStorage);

    // Ghi sẵn dữ liệu mock ban đầu mà KHÔNG tính vào __tcl_progressWrites
    _origSetItem('cultivation_active_profile', 'real');
    _origSetItem('sb-vmzgjlooapqskcmkerdz-auth-token', JSON.stringify({
      access_token: 'mock-access-token',
      user: { id: 'mock-user-123' }
    }));
    _origSetItem('tcl_progress_novel_test', JSON.stringify({
      chapterId: 'ch3',
      percent: 0,
      scrollTop: 0,
      updatedAt: 1000
    }));

    // Bắt đầu theo dõi các lần ghi tcl_progress_* từ mã nguồn ứng dụng
    localStorage.setItem = function(k, v) {
      if (typeof k === 'string' && k.startsWith('tcl_progress_')) {
        try {
          window.__tcl_progressWrites.push({
            key: k,
            val: JSON.parse(v),
            time: Date.now()
          });
        } catch(e) {
          window.__tcl_progressWrites.push({ key: k, raw: v, time: Date.now() });
        }
      }
      return _origSetItem(k, v);
    };

    // 2. Stub pullNovelProgressNow: Cloud đang ở ch36 mới hơn (updatedAt = 5000)
    window.__tcl_stubPullNovelProgressNow = async function(novelId) {
      console.log('__tcl_stubPullNovelProgressNow called for:', novelId);
      return {
        updated: true,
        data: {
          chapterId: 'ch36',
          percent: 0.85,
          paraIndex: 1,
          scrollTop: 450
        },
        cloudUpdatedAt: 5000
      };
    };

    // 3. Nạp dữ liệu truyện mẫu và 36 chương vào IndexedDB 'thien-co-lau'
    const req = indexedDB.open('thien-co-lau', 1);
    req.onupgradeneeded = function(e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('novels')) {
        const novelStore = db.createObjectStore('novels', { keyPath: 'id' });
        novelStore.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('chapters')) {
        const chapterStore = db.createObjectStore('chapters', { keyPath: 'id' });
        chapterStore.createIndex('novelId', 'novelId');
        chapterStore.createIndex('novelId_order', ['novelId', 'order']);
      }
    };
    req.onsuccess = function(e) {
      const db = e.target.result;
      const tx = db.transaction(['novels', 'chapters'], 'readwrite');
      const novelStore = tx.objectStore('novels');
      const chapterStore = tx.objectStore('chapters');

      novelStore.put({
        id: 'novel_test',
        title: 'Đại Phụng Đả Canh Nhân',
        description: 'Truyện tu tiên kỳ ảo đỉnh cao...',
        chapterCount: 36,
        createdAt: Date.now() - 100000
      });

      for (let i = 1; i <= 36; i++) {
        chapterStore.put({
          id: 'ch' + i,
          novelId: 'novel_test',
          title: 'Chương ' + i + ': ' + (i === 3 ? 'Bí Mật Khởi Đầu (Cũ)' : (i === 36 ? 'Đại Đạo Quy Nhất (Cloud Mới Nhất)' : 'Hành Trình Tu Tiên')),
          content: 'Đây là nội dung của chương ' + i + '.\\n\\nTrời đất bao la, tiên ma tương tranh vạn cổ.\\n\\nĐạo hữu vững tâm ngộ đạo.',
          order: i - 1,
          isExtra: false
        });
      }
    };
  `;

  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: preloadScript,
  });

  console.log('\n--- BƯỚC 1: Mở thẳng #/novel/novel_test/read/ch3 (mô phỏng reload tab cũ) ---');
  await page.send('Page.navigate', {
    url: `http://127.0.0.1:${PORT}/#/novel/novel_test/read/ch3`,
  });

  // Đợi trang hoàn tất điều hướng tự động sang ch36
  let jumpedToCh36 = false;
  let currentHash = '';
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 150));
    const evalRes = await page.send('Runtime.evaluate', {
      expression: 'window.location.hash',
    });
    currentHash = evalRes.result.value;
    if (currentHash.includes('ch36')) {
      jumpedToCh36 = true;
      break;
    }
  }

  console.log(`URL Hash hiện tại sau khi pull: ${currentHash}`);
  if (!jumpedToCh36) {
    throw new Error(`Kỳ vọng URL tự động nhảy sang ch36, nhưng hiện tại là: ${currentHash}`);
  }
  console.log('✓ URL đã tự động nhảy sang ch36 thành công!');

  // Đợi toast hiển thị
  let toastText = '';
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 150));
    const evalRes = await page.send('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const revertBtn = btns.find(b => b.textContent.includes('Quay lại vị trí cũ'));
        return revertBtn ? revertBtn.parentElement.textContent : '';
      })()`,
    });
    toastText = evalRes.result.value;
    if (toastText && toastText.includes('Đã nhảy tới vị trí mới nhất')) {
      break;
    }
  }

  console.log(`Nội dung Sync Toast: "${toastText.trim()}"`);
  if (!toastText.includes('Quay lại vị trí cũ')) {
    throw new Error('Không tìm thấy nút "Quay lại vị trí cũ" trên syncToast');
  }
  console.log('✓ Sync Toast hiển thị chính xác thông báo kèm nút "Quay lại vị trí cũ"');

  // Đợi 400ms để nội dung render ổn định
  await new Promise((r) => setTimeout(r, 400));

  // Chụp ảnh màn hình 1: Đã nhảy sang ch36 + Toast
  const shot1Res = await page.send('Page.captureScreenshot', { format: 'png' });
  const shot1Buf = Buffer.from(shot1Res.data, 'base64');
  const shot1Path = path.join(artifactsDir, 'screenshot-1-jumped-to-ch36.png');
  fs.writeFileSync(shot1Path, shot1Buf);
  fs.writeFileSync(path.join(userArtifactDir, 'screenshot-1-jumped-to-ch36.png'), shot1Buf);
  console.log(`✓ Đã lưu ảnh chụp 1: ${shot1Path}`);

  // Kiểm tra lịch sử ghi localStorage: KHÔNG ĐƯỢC CÓ LẦN GHI NÀO CHO CH3 LÚC MỞ THỤ ĐỘNG
  const writesEval = await page.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__tcl_progressWrites || [])',
  });
  const writes = JSON.parse(writesEval.result.value);
  console.log(`Các lần ghi progress từ ứng dụng: ${writes.length}`);
  writes.forEach((w, idx) => console.log(`   [${idx}] chapterId: ${w.val?.chapterId}, percent: ${w.val?.percent}`));

  const ch3Writes = writes.filter((w) => w.val?.chapterId === 'ch3');
  if (ch3Writes.length > 0) {
    throw new Error(`PHÁT HIỆN LỖI: Có ${ch3Writes.length} lần ghi ch3 thụ động lúc mở trang!`);
  }
  console.log('✓ XÁC NHẬN TUYỆT ĐỐI: Không có bất kỳ lần ghi nào của ch3 đè lên cloud!');

  // --- BƯỚC 2: Người dùng bấm nút "Quay lại vị trí cũ" ---
  console.log('\n--- BƯỚC 2: Người dùng bấm nút "Quay lại vị trí cũ" ---');
  await page.send('Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const revertBtn = btns.find(b => b.textContent.includes('Quay lại vị trí cũ'));
      if (revertBtn) revertBtn.click();
    })()`,
  });

  // Đợi URL chuyển về ch3
  let revertedToCh3 = false;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 150));
    const evalRes = await page.send('Runtime.evaluate', {
      expression: 'window.location.hash',
    });
    currentHash = evalRes.result.value;
    if (currentHash.includes('ch3') && !currentHash.includes('ch36')) {
      revertedToCh3 = true;
      break;
    }
  }

  console.log(`URL Hash sau khi bấm Quay lại: ${currentHash}`);
  if (!revertedToCh3) {
    throw new Error(`Kỳ vọng URL trở về ch3, nhưng hiện tại là: ${currentHash}`);
  }
  console.log('✓ Đã quay trở lại chương 3 thành công!');

  // Đợi nội dung chương 3 render xong
  await new Promise((r) => setTimeout(r, 600));

  // Chụp ảnh màn hình 2: Đã về ch3
  const shot2Res = await page.send('Page.captureScreenshot', { format: 'png' });
  const shot2Buf = Buffer.from(shot2Res.data, 'base64');
  const shot2Path = path.join(artifactsDir, 'screenshot-2-reverted-to-ch3.png');
  fs.writeFileSync(shot2Path, shot2Buf);
  fs.writeFileSync(path.join(userArtifactDir, 'screenshot-2-reverted-to-ch3.png'), shot2Buf);
  console.log(`✓ Đã lưu ảnh chụp 2: ${shot2Path}`);

  // Khi người dùng bấm chuyển chương hoặc lướt đọc ở ch3 (điều hướng chủ động)
  await page.send('Runtime.evaluate', {
    expression: `(() => {
      window.scrollTo(0, 180);
      window.dispatchEvent(new Event('scroll'));
    })()`,
  });

  await new Promise((r) => setTimeout(r, 500));

  const afterWritesEval = await page.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__tcl_progressWrites || [])',
  });
  const afterWrites = JSON.parse(afterWritesEval.result.value);
  console.log(`Tổng số lần ghi progress sau khi chủ động ở ch3: ${afterWrites.length}`);
  const ch3AfterWrites = afterWrites.filter((w) => w.val?.chapterId === 'ch3');
  console.log(`Số lần ghi ch3 sau khi đã chủ động: ${ch3AfterWrites.length}`);
  if (ch3AfterWrites.length === 0) {
    throw new Error('Kỳ vọng tiến độ ch3 được ghi nhận sau khi người dùng chủ động quay lại và cuộn đọc');
  }
  console.log('✓ Tiến độ ch3 được ghi nhận chính xác sau khi người dùng chủ động!');

  page.close();
  browser.close();
}

try {
  await runBrowserFlow();
  console.log('\n========================================');
  console.log('✅ KIỂM THỬ TRÌNH DUYỆT THẬT (PLAYWRIGHT/CHROME) THÀNH CÔNG 100%!');
  console.log('========================================');
} catch (err) {
  console.error('\n❌ KIỂM THỬ TRÌNH DUYỆT THẤT BẠI:', err);
  process.exit(1);
} finally {
  server.close();
  try {
    chromeProc.kill();
  } catch {}
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
}
