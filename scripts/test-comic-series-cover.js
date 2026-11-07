/**
 * scripts/test-comic-series-cover.js
 * 
 * Unit tests for Per-Series Comic Cover management:
 * 1. Setting custom cover for Series A
 * 2. Series isolation: Series A cover does not affect Series B
 * 3. Clearing cover for Series A (revert to auto cover)
 * 4. Synchronization metadata: metaUpdatedAt increases, pending sync flag set
 * 5. Utility helpers: dataUrlToCoverWebpBlob & cropBlobToCoverWebp
 */

import assert from 'node:assert/strict';
import {
  setComicDBForTesting,
  saveSeries,
  getSeries,
  saveVolume,
  setSeriesCover,
  clearSeriesCover,
  dataUrlToCoverWebpBlob,
  cropBlobToCoverWebp,
  COVER_TARGET_WIDTH,
  COVER_TARGET_HEIGHT,
} from '../src/lib/comics/comicDb.js';

console.log('--- TESTING PER-SERIES COMIC COVER LOGIC ---');

// Mock localStorage in Node
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (k) => mockStorage.get(k) || null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
  get length() { return mockStorage.size; },
  key: (i) => Array.from(mockStorage.keys())[i] || null,
};

// Mock IDB
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
    return val ? { ...val } : undefined;
  }

  async getAll(storeName) {
    return Array.from(this.stores[storeName].values()).map((v) => ({ ...v }));
  }

  async put(storeName, value) {
    const key = storeName === 'pages' ? value.key : value.id;
    this.stores[storeName].set(key, { ...value });
    return key;
  }

  async delete(storeName, key) {
    this.stores[storeName].delete(key);
  }

  transaction(storeNames) {
    const self = this;
    return {
      done: Promise.resolve(),
      objectStore(storeName) {
        return {
          indexNames: { contains: (name) => name === 'seriesId' },
          async get(key) { return self.get(storeName, key); },
          async put(value) { return self.put(storeName, value); },
          async delete(key) { return self.delete(storeName, key); },
          async getAll() { return self.getAll(storeName); },
          index(indexName) {
            return {
              async getAll(keyRange) {
                const targetKey = keyRange?.lower || keyRange;
                const items = Array.from(self.stores[storeName].values());
                return items.filter((item) => {
                  if (indexName === 'seriesId') return item.seriesId === targetKey;
                  return true;
                }).map((v) => ({ ...v }));
              },
            };
          },
        };
      },
    };
  }
}

async function runTests() {
  const mockDb = new MockIDB();
  setComicDBForTesting(Promise.resolve(mockDb));

  // 1. Setup Series A and Series B with volumes
  const t0 = 100000;
  const seriesA = await saveSeries({
    id: 'series-alpha',
    title: 'Đại Phụng Đả Canh Nhân',
    coverBlob: null,
    metaUpdatedAt: t0,
    createdAt: t0,
    updatedAt: t0,
  });

  const seriesB = await saveSeries({
    id: 'series-beta',
    title: 'Phàm Nhân Tu Tiên',
    coverBlob: null,
    metaUpdatedAt: t0,
    createdAt: t0,
    updatedAt: t0,
  });

  await saveVolume({
    id: 'vol-a-1',
    seriesId: 'series-alpha',
    title: 'Tập 1',
    order: 1,
  });

  // Mock an existing upload progress for volume A where cover was already uploaded
  localStorage.setItem('tcl_comic_upload_progress_vol-a-1', JSON.stringify(['p0', 'p1', 'cover']));

  console.log('1. Testing setSeriesCover for Series A...');
  // Dummy WebP Blob
  const dummyCoverBlobA = new Blob([Buffer.from('alpha-cover-content')], { type: 'image/webp' });
  const updatedA = await setSeriesCover('series-alpha', dummyCoverBlobA);

  assert(updatedA.coverBlob !== null, 'Series A has custom cover');
  assert(updatedA.metaUpdatedAt > t0, 'Series A metaUpdatedAt was updated');
  assert(updatedA.updatedAt > t0, 'Series A updatedAt was updated');

  // Verify volume upload progress invalidated 'cover'
  const progressA = JSON.parse(localStorage.getItem('tcl_comic_upload_progress_vol-a-1') || '[]');
  assert.strictEqual(progressA.includes('cover'), false, 'Upload progress invalidated "cover" task');

  // Verify pending meta set in localStorage
  const pendingMetaRaw = localStorage.getItem('tcl_comic_meta_pending_series-alpha');
  assert(pendingMetaRaw !== null, 'Pending metadata key created');
  const pendingMeta = JSON.parse(pendingMetaRaw);
  assert.strictEqual(pendingMeta.hasCustomCover, true, 'Pending meta flags custom cover');

  console.log('✓ setSeriesCover passed');

  console.log('2. Testing Series Isolation (Series B unaffected)...');
  const freshB = await getSeries('series-beta');
  assert.strictEqual(freshB.coverBlob, null, 'Series B cover remains null');
  assert.strictEqual(freshB.metaUpdatedAt, t0, 'Series B metaUpdatedAt unchanged');
  console.log('✓ Series isolation passed');

  console.log('3. Testing clearSeriesCover for Series A...');
  const clearedA = await clearSeriesCover('series-alpha');
  assert.strictEqual(clearedA.coverBlob, null, 'Series A cover reverted to null');
  assert(clearedA.metaUpdatedAt > updatedA.metaUpdatedAt, 'Series A metaUpdatedAt updated on clear');

  const pendingClearedMeta = JSON.parse(localStorage.getItem('tcl_comic_meta_pending_series-alpha'));
  assert.strictEqual(pendingClearedMeta.hasCustomCover, false, 'Pending meta flags no custom cover');
  console.log('✓ clearSeriesCover passed');

  console.log('4. Testing dataUrlToCoverWebpBlob & cropBlobToCoverWebp...');
  const sampleDataUrl = 'data:image/webp;base64,' + Buffer.from('fake-webp-image-bytes').toString('base64');
  const parsedBlob = await dataUrlToCoverWebpBlob(sampleDataUrl);
  assert(parsedBlob instanceof Blob, 'Result is a Blob');
  assert.strictEqual(parsedBlob.type, 'image/webp', 'Blob type is image/webp');

  const croppedBlob = await cropBlobToCoverWebp(parsedBlob, { offsetX: 0.5, offsetY: 0.5 });
  assert(croppedBlob instanceof Blob, 'Cropped result is a Blob');
  assert.strictEqual(COVER_TARGET_WIDTH, 600, 'Target width is 600');
  assert.strictEqual(COVER_TARGET_HEIGHT, 800, 'Target height is 800');
  console.log('✓ Helpers passed');

  console.log('--- ALL COMIC SERIES COVER TESTS PASSED ---');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
