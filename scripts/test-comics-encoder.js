/**
 * scripts/test-comics-encoder.js
 * 
 * Tests:
 * 1. Native canvas WebP capability detection (recognizes WebP vs false PNG on iOS)
 * 2. 3-tier encoding pipeline (canvas-webp -> wasm-webp -> jpeg -> throw)
 * 3. Never returns or stores uncompressed PNG
 * 4. Page MIME type persistence in database
 * 5. Custom title and order overrides during import (e.g. 'Tập Đặc Biệt', order 7 with filename 'abc_vol3.pdf')
 * 6. Decimal order (e.g. 2.5) support
 * 7. Empty title fallback to cleanVolumeTitle
 */
import assert from 'node:assert/strict';
import {
  isCanvasWebpSupported,
  _setCanvasWebpSupportedForTesting,
  encodeCanvasToBlob,
  importPdfVolume,
  importMultiplePdfs,
  setPdfJsForTesting,
} from '../src/lib/comics/pdfImport.js';
import {
  setComicDBForTesting,
  savePagesBulk,
  getPage,
  getVolume,
  saveSeries,
} from '../src/lib/comics/comicDb.js';

globalThis.IDBKeyRange = {
  only: (val) => ({ lower: val, upper: val }),
  bound: (l, u) => ({ lower: l, upper: u }),
};

// ---- Simple In-Memory Mock IDB ----
class MockIDB {
  constructor() {
    this.stores = {
      series: new Map(),
      volumes: new Map(),
      pages: new Map(),
    };
  }

  async get(storeName, key) {
    const val = this.stores[storeName].get(key);
    return val ? JSON.parse(JSON.stringify(val)) : undefined;
  }

  async getAll(storeName) {
    return Array.from(this.stores[storeName].values()).map(v => JSON.parse(JSON.stringify(v)));
  }

  async put(storeName, value) {
    const key = storeName === 'pages' ? value.key : value.id;
    this.stores[storeName].set(key, JSON.parse(JSON.stringify(value)));
    return key;
  }

  async delete(storeName, key) {
    this.stores[storeName].delete(key);
  }

  transaction(storeNames, mode) {
    const self = this;
    return {
      objectStore(name) {
        return {
          async get(key) { return self.get(name, key); },
          async getAll(query) { return self.getAll(name); },
          async put(val) { return self.put(name, val); },
          async delete(key) { return self.delete(name, key); },
          index(idxName) {
            return {
              async getAll(keyRange) {
                const all = await self.getAll(name);
                if (!keyRange) return all;
                const matchVal = keyRange.lower !== undefined ? keyRange.lower : keyRange;
                return all.filter(item => item[idxName] === matchVal);
              }
            };
          }
        };
      },
      done: Promise.resolve(),
    };
  }
}

async function runTests() {
  console.log('🧪 Bắt đầu kiểm tra WebP Encoder & Custom Title/Order...');

  const mockDb = new MockIDB();
  setComicDBForTesting(mockDb);

  // ==========================================
  // TEST 1: Native Canvas WebP Detection & Encoding
  // ==========================================
  console.log('--- Test 1: Native canvas WebP encoder ---');
  _setCanvasWebpSupportedForTesting(true);

  const mockCanvasNative = {
    width: 50,
    height: 50,
    toBlob(callback, type, quality) {
      if (type === 'image/webp') {
        callback(new Blob(['webp-data'], { type: 'image/webp' }));
      } else {
        callback(null);
      }
    },
    getContext() { return null; },
  };

  const resNative = await encodeCanvasToBlob(mockCanvasNative, 0.8);
  assert.equal(resNative.encoder, 'canvas-webp', 'Phải dùng canvas-webp khi native hỗ trợ');
  assert.equal(resNative.blob.type, 'image/webp', 'MIME type phải là image/webp');
  console.log('  ✓ Test 1 passed: Native WebP encoder hoạt động đúng');

  // ==========================================
  // TEST 2: WebKit/Safari trap -> WASM WebP fallback
  // ==========================================
  console.log('--- Test 2: iOS WebKit trap (toBlob WebP trả về PNG) -> WASM WebP fallback ---');
  
  // Giả lập WebKit: toBlob('image/webp') trả về image/png
  globalThis.document = {
    createElement(tag) {
      if (tag === 'canvas') {
        return {
          width: 1,
          height: 1,
          toBlob(cb, type) {
            // WebKit returns PNG even when 'image/webp' is requested
            cb(new Blob(['png-trap'], { type: 'image/png' }));
          }
        };
      }
      return {};
    }
  };

  _setCanvasWebpSupportedForTesting(null);
  const isSupported = await isCanvasWebpSupported();
  assert.equal(isSupported, false, 'Phải phát hiện WebKit trả về PNG không phải WebP');

  // Canvas cần mã hóa bằng WASM
  const mockCanvasWasm = {
    width: 20,
    height: 20,
    toBlob(callback, type) {
      // If native canvas is asked for webp, it returns PNG trap
      if (type === 'image/webp') {
        callback(new Blob(['png-trap'], { type: 'image/png' }));
      } else {
        callback(null);
      }
    },
    getContext(type) {
      return {
        getImageData(x, y, w, h) {
          return {
            data: new Uint8ClampedArray(w * h * 4),
            width: w,
            height: h,
          };
        }
      };
    }
  };

  const resWasm = await encodeCanvasToBlob(mockCanvasWasm, 0.8);
  assert.equal(resWasm.encoder, 'wasm-webp', 'Phải dùng wasm-webp khi canvas native không hỗ trợ WebP');
  assert.equal(resWasm.blob.type, 'image/webp', 'MIME type phải là image/webp');
  assert.notEqual(resWasm.blob.type, 'image/png', 'Tuyệt đối không bao giờ trả về PNG');
  assert.ok(resWasm.blob.size > 0, 'WASM WebP blob phải có dung lượng');
  console.log('  ✓ Test 2 passed: WASM WebP fallback thành công, vượt qua bẫy PNG của WebKit');

  // ==========================================
  // TEST 3: WASM fails -> JPEG fallback
  // ==========================================
  console.log('--- Test 3: WASM thất bại -> Fallback sang JPEG ---');
  _setCanvasWebpSupportedForTesting(false);

  const mockCanvasJpeg = {
    width: 20,
    height: 20,
    toBlob(callback, type) {
      if (type === 'image/jpeg') {
        callback(new Blob(['jpeg-data'], { type: 'image/jpeg' }));
      } else {
        callback(new Blob(['png-trap'], { type: 'image/png' }));
      }
    },
    getContext() {
      // WASM throws error
      throw new Error('WASM compilation blocked by CSP');
    }
  };

  const resJpeg = await encodeCanvasToBlob(mockCanvasJpeg, 0.8);
  assert.equal(resJpeg.encoder, 'jpeg', 'Phải dùng jpeg khi WASM lỗi');
  assert.equal(resJpeg.blob.type, 'image/jpeg', 'MIME type phải là image/jpeg');
  assert.notEqual(resJpeg.blob.type, 'image/png', 'Không được lưu PNG');
  console.log('  ✓ Test 3 passed: Fallback cấp 3 sang JPEG hoạt động đúng');

  // ==========================================
  // TEST 4: Tất cả thất bại -> Báo lỗi rõ ràng
  // ==========================================
  console.log('--- Test 4: Mọi encoder thất bại -> Báo lỗi rõ ràng ---');
  const mockCanvasFail = {
    width: 20,
    height: 20,
    toBlob(callback) {
      callback(new Blob(['png-trap'], { type: 'image/png' }));
    },
    getContext() {
      throw new Error('Context error');
    }
  };

  let caughtErr = null;
  try {
    await encodeCanvasToBlob(mockCanvasFail, 0.8);
  } catch (err) {
    caughtErr = err;
  }
  assert.ok(caughtErr, 'Phải ném lỗi khi không mã hóa được');
  assert.match(caughtErr.message, /Thiết bị không mã hoá được ảnh/, 'Thông báo lỗi phải rõ ràng');
  console.log('  ✓ Test 4 passed: Báo lỗi chính xác khi không mã hoá được ảnh');

  // ==========================================
  // TEST 5: MIME persistence in savePagesBulk
  // ==========================================
  console.log('--- Test 5: Lưu MIME type vào IndexedDB ---');
  const testPageItem = {
    volumeId: 'vol_test_mime',
    index: 0,
    blob: new Blob(['jpeg-bytes'], { type: 'image/jpeg' }),
    mime: 'image/jpeg',
    w: 1200,
    h: 1800,
  };
  await savePagesBulk([testPageItem]);
  const loadedPage = await getPage('vol_test_mime', 0);
  assert.equal(loadedPage.mime, 'image/jpeg', 'Trường mime phải được lưu đúng trong IndexedDB');
  console.log('  ✓ Test 5 passed: MIME type được lưu chính xác vào DB');

  // ==========================================
  // TEST 6: Custom Title & Order Overrides
  // ==========================================
  console.log('--- Test 6: Nhập với tên tập và số tập tuỳ biến (Tập Đặc Biệt, order 7, file abc_vol3.pdf) ---');

  // Tạo series giả lập
  const s = await saveSeries({ title: 'Bộ Truyện Mẫu' });

  // Tạo mock PDF File
  const mockFile = {
    name: 'abc_vol3.pdf',
    size: 1024,
    arrayBuffer: async () => new ArrayBuffer(100),
  };

  // Mock global document và URL cho importPdfVolume
  globalThis.URL = {
    createObjectURL: () => 'blob:mock-url',
    revokeObjectURL: () => {},
  };

  // Mock pdfjs
  const mockPdfJs = {
    GlobalWorkerOptions: {},
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getViewport: () => ({ width: 100, height: 150 }),
          render: () => ({ promise: Promise.resolve() }),
          cleanup: () => {},
        }),
        destroy: () => {},
      }),
      destroy: () => {},
    }),
  };
  setPdfJsForTesting(mockPdfJs);

  // Mock document.createElement('canvas')
  globalThis.document.createElement = (tag) => {
    if (tag === 'canvas') {
      return {
        width: 100,
        height: 150,
        getContext: () => ({
          drawImage: () => {},
          clearRect: () => {},
          getImageData: (x, y, w, h) => ({
            data: new Uint8ClampedArray(w * h * 4),
            width: w,
            height: h,
          }),
        }),
        toBlob: (cb) => {
          cb(new Blob(['webp-bytes'], { type: 'image/webp' }));
        },
      };
    }
    return {};
  };

  _setCanvasWebpSupportedForTesting(true);

  // Import single file với options: volumeTitle: 'Tập Đặc Biệt', volumeOrder: 7
  const resSingle = await importPdfVolume(mockFile, {
    seriesId: s.id,
    volumeTitle: 'Tập Đặc Biệt',
    volumeOrder: 7,
  });

  const vol1 = await getVolume(resSingle.volumeId);
  assert.equal(vol1.title, 'Tập Đặc Biệt', 'Tên tập phải nhận đúng "Tập Đặc Biệt" thay vì tên file');
  assert.equal(vol1.order, 7, 'Số tập phải nhận đúng 7 thay vì 3');
  console.log('  ✓ Test 6a passed: Đơn lẻ - volumeTitle & volumeOrder được tôn trọng');

  // Test batch import với custom title & order
  const mockItems = [
    {
      file: { name: 'manga_vol10.pdf', size: 1024, arrayBuffer: async () => new ArrayBuffer(100) },
      order: 2.5,
      title: 'Tập 2.5 Ngoại Truyện',
    },
    {
      file: { name: 'manga_vol11.pdf', size: 1024, arrayBuffer: async () => new ArrayBuffer(100) },
      order: 8,
      title: '  ', // Xóa trắng ô tên -> phải tự sinh cleanVolumeTitle
    },
  ];

  const resBatch = await importMultiplePdfs(mockItems, {
    seriesId: s.id,
  });

  assert.equal(resBatch.importedVolumes.length, 2, 'Phải nhập đủ 2 tập');
  
  const volBatch1 = await getVolume(resBatch.importedVolumes[0].volumeId);
  assert.equal(volBatch1.order, 2.5, 'Số tập thập phân 2.5 phải được giữ nguyên');
  assert.equal(volBatch1.title, 'Tập 2.5 Ngoại Truyện', 'Tên tập ngoại truyện phải được giữ nguyên');

  const volBatch2 = await getVolume(resBatch.importedVolumes[1].volumeId);
  assert.equal(volBatch2.order, 8, 'Số tập 8 phải được nhận đúng');
  assert.equal(volBatch2.title, 'manga vol11', 'Ô tên xoá trắng phải tự sinh theo cleanVolumeTitle');

  console.log('  ✓ Test 6b passed: Hàng loạt - Số tập thập phân (2.5) và xóa trắng tên hoạt động đúng');

  console.log('\n🎉 TẤT CẢ 6 TEST ĐỀU THÀNH CÔNG VÀ ĐẠT 100%!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Test thất bại:', err);
  process.exit(1);
});
