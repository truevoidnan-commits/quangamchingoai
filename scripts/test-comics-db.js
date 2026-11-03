/**
 * Unit tests for ComicDB (src/lib/comics/comicDb.js)
 * Run: node scripts/test-comics-db.js
 */
import assert from 'node:assert/strict';
import {
  setComicDBForTesting,
  formatPageKey,
  parseVolumeOrder,
  cleanVolumeTitle,
  compareVolumes,
  saveSeries,
  getSeries,
  getAllSeries,
  deleteSeries,
  saveVolume,
  getVolume,
  getVolumes,
  deleteVolume,
  savePagesBulk,
  getPage,
  getPageRange,
  getVolumePageMeta,
  cleanOrphanImportingVolumes,
  saveComicProgress,
  getComicProgress,
  removeComicProgress,
} from '../src/lib/comics/comicDb.js';

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
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    
    return {
      done: Promise.resolve(),
      objectStore(storeName) {
        return {
          async get(key) {
            return self.get(storeName, key);
          },
          async put(value) {
            return self.put(storeName, value);
          },
          async delete(key) {
            return self.delete(storeName, key);
          },
          index(indexName) {
            return {
              async getAll(keyRange) {
                const targetKey = keyRange ? (keyRange.lower || keyRange) : null;
                const items = Array.from(self.stores[storeName].values());
                return items.filter(item => {
                  if (indexName === 'seriesId') return item.seriesId === targetKey;
                  if (indexName === 'volumeId') return item.volumeId === targetKey;
                  return true;
                }).map(v => JSON.parse(JSON.stringify(v)));
              },
              async openCursor(keyRange) {
                const targetKey = keyRange ? (keyRange.lower || keyRange) : null;
                const allKeys = Array.from(self.stores[storeName].keys());
                const matchingKeys = allKeys.filter(k => {
                  const item = self.stores[storeName].get(k);
                  if (indexName === 'seriesId') return item.seriesId === targetKey;
                  if (indexName === 'volumeId') return item.volumeId === targetKey;
                  return false;
                });

                let idx = 0;
                if (matchingKeys.length === 0) return null;

                const cursorObj = {
                  get value() {
                    return JSON.parse(JSON.stringify(self.stores[storeName].get(matchingKeys[idx])));
                  },
                  get key() {
                    return matchingKeys[idx];
                  },
                  async delete() {
                    self.stores[storeName].delete(matchingKeys[idx]);
                  },
                  async continue() {
                    idx++;
                    if (idx < matchingKeys.length) {
                      return cursorObj;
                    }
                    return null;
                  }
                };
                return cursorObj;
              }
            };
          }
        };
      }
    };
  }
}

// Global mock localStorage
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (k) => (mockStorage.has(k) ? mockStorage.get(k) : null),
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
};

// Global IDBKeyRange mock
globalThis.IDBKeyRange = {
  only: (val) => ({ lower: val, upper: val }),
  bound: (l, u) => ({ lower: l, upper: u }),
};

async function runTests() {
  console.log('🧪 Starting ComicDB Unit Tests...');
  const mockDb = new MockIDB();
  setComicDBForTesting(Promise.resolve(mockDb));

  // 1. Test parseVolumeOrder & title cleaning
  console.log('  1. Testing parseVolumeOrder & cleanVolumeTitle...');
  assert.equal(parseVolumeOrder('One Piece Tập 12.pdf'), 12);
  assert.equal(parseVolumeOrder('Doraemon_Vol_03.pdf'), 3);
  assert.equal(parseVolumeOrder('Naruto Chapter 105.pdf'), 105);
  assert.equal(parseVolumeOrder('Bleach - 54 (Digital).pdf'), 54);
  assert.equal(parseVolumeOrder('Attack on Titan - 002.pdf'), 2);
  assert.equal(parseVolumeOrder('Tập 10.5 ngoại truyện.pdf'), 10.5);
  assert.equal(parseVolumeOrder('Không Có Số Tập.pdf', 99), 99);
  assert.equal(cleanVolumeTitle('One_Piece_Vol_01.pdf'), 'One Piece Vol 01');

  // 2. Test natural comparison
  console.log('  2. Testing compareVolumes natural sorting...');
  const sorted = [
    { title: 'Tập 10', order: 10 },
    { title: 'Tập 2', order: 2 },
    { title: 'Tập 1', order: 1 },
    { title: 'Tập 21', order: 21 },
  ].sort(compareVolumes);
  assert.deepEqual(sorted.map(s => s.order), [1, 2, 10, 21]);

  // 3. Test Series creation & retrieval
  console.log('  3. Testing Series CRUD...');
  const s1 = await saveSeries({ title: 'Đấu Phá Thương Khung' });
  assert.ok(s1.id, 'Series should have an ID');
  assert.equal(s1.title, 'Đấu Phá Thương Khung');

  const fetchedSeries = await getSeries(s1.id);
  assert.equal(fetchedSeries.id, s1.id);
  assert.equal(fetchedSeries.volumeCount, 0);

  // 4. Test Volume creation & retrieval
  console.log('  4. Testing Volume CRUD & indexing...');
  const v1 = await saveVolume({
    seriesId: s1.id,
    title: 'Tập 1: Thiên Tài Biến Phế Vật',
    order: 1,
    pageCount: 3,
    importState: 'ready',
    totalBytes: 500000,
  });
  const v2 = await saveVolume({
    seriesId: s1.id,
    title: 'Tập 2: Dược Lão Xuất Thế',
    order: 2,
    pageCount: 2,
    importState: 'ready',
    totalBytes: 400000,
  });

  const seriesVolumes = await getVolumes(s1.id);
  assert.equal(seriesVolumes.length, 2);
  assert.equal(seriesVolumes[0].order, 1);
  assert.equal(seriesVolumes[1].order, 2);

  const seriesWithCounts = await getSeries(s1.id);
  assert.equal(seriesWithCounts.volumeCount, 2);
  assert.equal(seriesWithCounts.totalPages, 5);
  assert.equal(seriesWithCounts.totalBytes, 900000);

  // 5. Test Pages bulk save & key formatting
  console.log('  5. Testing Pages bulk save & retrieval...');
  assert.equal(formatPageKey('vol123', 5), 'vol123:00005');
  await savePagesBulk([
    { volumeId: v1.id, index: 0, blob: 'blob_page_0', w: 1200, h: 1600 },
    { volumeId: v1.id, index: 1, blob: 'blob_page_1', w: 1200, h: 1600 },
    { volumeId: v1.id, index: 2, blob: 'blob_page_2', w: 1200, h: 1600 },
  ]);

  const p0 = await getPage(v1.id, 0);
  assert.ok(p0);
  assert.equal(p0.blob, 'blob_page_0');
  assert.equal(p0.w, 1200);

  const pRange = await getPageRange(v1.id, 1, 2);
  assert.equal(pRange.length, 2);
  assert.equal(pRange[0].index, 1);
  assert.equal(pRange[1].index, 2);

  const pageMeta = await getVolumePageMeta(v1.id);
  assert.equal(pageMeta.length, 3);
  assert.equal(pageMeta[0].w, 1200);

  // 6. Test LocalStorage Reading Progress
  console.log('  6. Testing Reading Progress storage...');
  saveComicProgress(v1.id, { pageIndex: 1, scrollPercent: 45.5 });
  const prog = getComicProgress(v1.id);
  assert.ok(prog);
  assert.equal(prog.pageIndex, 1);
  assert.equal(prog.scrollPercent, 45.5);
  assert.ok(prog.updatedAt > 0);

  // 7. Test Cascade Delete for Volume
  console.log('  7. Testing Cascade Delete for Volume...');
  await deleteVolume(v1.id);
  assert.equal(await getVolume(v1.id), undefined);
  assert.equal(await getPage(v1.id, 0), undefined);
  assert.equal(await getPage(v1.id, 1), undefined);
  assert.equal(getComicProgress(v1.id), null); // Progress removed

  const remainingVols = await getVolumes(s1.id);
  assert.equal(remainingVols.length, 1);
  assert.equal(remainingVols[0].id, v2.id);

  // 8. Test Cascade Delete for Series
  console.log('  8. Testing Cascade Delete for Series...');
  await savePagesBulk([
    { volumeId: v2.id, index: 0, blob: 'blob_v2_0', w: 1200, h: 1600 },
  ]);
  await deleteSeries(s1.id);
  assert.equal(await getSeries(s1.id), null);
  assert.equal(await getVolume(v2.id), undefined);
  assert.equal(await getPage(v2.id, 0), undefined);

  // 9. Test Orphan Cleanup for stuck importing volumes
  console.log('  9. Testing cleanOrphanImportingVolumes...');
  const s2 = await saveSeries({ title: 'Series Test Cleanup' });
  const stuckVol = await saveVolume({
    seriesId: s2.id,
    title: 'Tập Đang Dở Dang',
    order: 1,
    importState: 'importing',
  });
  await savePagesBulk([
    { volumeId: stuckVol.id, index: 0, blob: 'temp_blob', w: 800, h: 1000 },
  ]);

  // Before cleanup: volume and pages exist
  assert.ok(await getVolume(stuckVol.id));
  assert.ok(await getPage(stuckVol.id, 0));

  // Run orphan cleanup
  await cleanOrphanImportingVolumes();

  // After cleanup: stuck volume and its pages are purged
  assert.equal(await getVolume(stuckVol.id), undefined);
  assert.equal(await getPage(stuckVol.id, 0), undefined);
  // And the empty new series was cleaned up too
  assert.equal(await getSeries(s2.id), null);

  console.log('✅ ALL ComicDB Unit Tests PASSED!');
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
