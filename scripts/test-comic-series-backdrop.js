/**
 * scripts/test-comic-series-backdrop.js
 *
 * Tests per-series backdrop storage logic:
 * 1. Independent storage per seriesId (series A does not affect series B)
 * 2. Clear series A does not touch series B
 * 3. Event dispatching includes seriesId in detail
 * 4. Migration from legacy single backdrop key & cache to target series
 * 5. Clean exit with code 0
 */

import assert from 'assert';

console.log('--- TESTING PER-SERIES BACKDROP LOGIC ---');

// Mock localStorage
const storageMap = new Map();
globalThis.localStorage = {
  getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
  setItem: (k, v) => storageMap.set(k, String(v)),
  removeItem: (k) => storageMap.delete(k),
  clear: () => storageMap.clear(),
};

// Mock CacheStorage & Response & Blob
class MockResponse {
  constructor(body, init = {}) {
    this._body = body;
    this.headers = init.headers || {};
  }
  async blob() {
    return this._body;
  }
}
globalThis.Response = MockResponse;

class MockBlob {
  constructor(content = [], options = {}) {
    this.content = content;
    this.type = options.type || '';
  }
}
globalThis.Blob = MockBlob;

const cacheMap = new Map();
const mockCache = {
  put: async (url, res) => {
    cacheMap.set(url, res);
  },
  match: async (url) => cacheMap.get(url) || null,
  delete: async (url) => cacheMap.delete(url),
};

globalThis.caches = {
  open: async () => mockCache,
};

// Mock window & CustomEvent
const dispatchedEvents = [];
globalThis.window = {
  dispatchEvent: (event) => {
    dispatchedEvents.push(event);
  },
  addEventListener: () => {},
  removeEventListener: () => {},
};

globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};

globalThis.URL = {
  createObjectURL: (blob) => `blob:mock-${Math.random().toString(36).substring(7)}`,
  revokeObjectURL: () => {},
};

// Now import the module under test
const {
  SERIES_BACKDROPS_KEY,
  LEGACY_BACKDROP_KEY,
  getCustomBackdropSettings,
  saveCustomBackdropSettings,
  clearCustomBackdrop,
  storeCustomBackdropBlobs,
  loadCustomBackdropUrls,
  migrateLegacyBackdropIfNeeded,
  getBackdropUrl,
} = await import('../src/lib/comics/customBackdrop.js');

async function runTests() {
  storageMap.clear();
  cacheMap.clear();
  dispatchedEvents.length = 0;

  // 1. Isolation between Series A and Series B
  console.log('1. Testing per-series settings isolation...');
  assert.strictEqual(getCustomBackdropSettings('series_a'), null, 'Initial series A is null');
  assert.strictEqual(getCustomBackdropSettings('series_b'), null, 'Initial series B is null');

  saveCustomBackdropSettings('series_a', {
    volumeId: 'vol_a1',
    pageIndex: 2,
    blur: 6,
    dim: 45,
  });

  saveCustomBackdropSettings('series_b', {
    volumeId: 'vol_b9',
    pageIndex: 10,
    blur: 15,
    dim: 70,
  });

  const settingsA = getCustomBackdropSettings('series_a');
  const settingsB = getCustomBackdropSettings('series_b');
  const settingsC = getCustomBackdropSettings('series_c');

  assert.strictEqual(settingsA?.comicId, 'series_a', 'Series A comicId matches');
  assert.strictEqual(settingsA?.blur, 6, 'Series A blur is 6');
  assert.strictEqual(settingsA?.dim, 45, 'Series A dim is 45');

  assert.strictEqual(settingsB?.comicId, 'series_b', 'Series B comicId matches');
  assert.strictEqual(settingsB?.blur, 15, 'Series B blur is 15');
  assert.strictEqual(settingsB?.dim, 70, 'Series B dim is 70');

  assert.strictEqual(settingsC, null, 'Unconfigured Series C returns null');
  console.log('✓ Per-series settings isolation passed');

  // 2. Blob caching and loading per series
  console.log('2. Testing per-series blob caching & loading...');
  const blobA1 = new MockBlob(['vertical_a'], { type: 'image/webp' });
  const blobA2 = new MockBlob(['wide_a'], { type: 'image/webp' });
  await storeCustomBackdropBlobs('series_a', { verticalBlob: blobA1, wideBlob: blobA2 });

  const urlsA = await loadCustomBackdropUrls('series_a');
  assert(urlsA.verticalUrl, 'Series A has verticalUrl');
  assert(urlsA.wideUrl, 'Series A has wideUrl');
  assert.strictEqual(urlsA.settings.blur, 6);

  // Series B has settings but no blobs
  const urlsB = await loadCustomBackdropUrls('series_b');
  assert.strictEqual(urlsB.verticalUrl, null);
  assert.strictEqual(urlsB.wideUrl, null);
  assert.strictEqual(urlsB.settings, null, 'No blobs fallback to null settings');
  console.log('✓ Per-series blob caching and loading passed');

  // 3. Clear series A does not touch series B
  console.log('3. Testing clearCustomBackdrop isolation...');
  dispatchedEvents.length = 0;
  await clearCustomBackdrop('series_a');

  assert.strictEqual(getCustomBackdropSettings('series_a'), null, 'Series A settings cleared');
  const urlsAfterClearA = await loadCustomBackdropUrls('series_a');
  assert.strictEqual(urlsAfterClearA.settings, null, 'Series A URLs cleared');

  // Verify series B is untouched
  const settingsBAfter = getCustomBackdropSettings('series_b');
  assert.strictEqual(settingsBAfter?.comicId, 'series_b', 'Series B is untouched');
  assert.strictEqual(settingsBAfter?.dim, 70, 'Series B dim remains 70');

  // Check event dispatch detail
  const lastEvent = dispatchedEvents[dispatchedEvents.length - 1];
  assert.strictEqual(lastEvent?.type, 'tcl_custom_backdrop_changed');
  assert.strictEqual(lastEvent?.detail?.seriesId, 'series_a', 'Event dispatched with correct seriesId');
  console.log('✓ Clear isolation and event dispatch passed');

  // 4. Migration from legacy single backdrop key
  console.log('4. Testing legacy single backdrop migration...');
  storageMap.clear();
  cacheMap.clear();

  // Populate legacy state
  const legacyComicId = 'series_migrated_99';
  storageMap.set(
    LEGACY_BACKDROP_KEY,
    JSON.stringify({
      comicId: legacyComicId,
      volumeId: 'vol_legacy_1',
      pageIndex: 3,
      blur: 8,
      dim: 52,
    })
  );

  const legVBlob = new MockBlob(['legacy_vertical'], { type: 'image/webp' });
  const legWBlob = new MockBlob(['legacy_wide'], { type: 'image/webp' });
  cacheMap.set('https://tcl.local/custom-backdrop-vertical.webp', new MockResponse(legVBlob));
  cacheMap.set('https://tcl.local/custom-backdrop-wide.webp', new MockResponse(legWBlob));

  // Run migration
  await migrateLegacyBackdropIfNeeded();

  // Check legacy key is deleted
  assert.strictEqual(localStorage.getItem(LEGACY_BACKDROP_KEY), null, 'Legacy localStorage key removed');

  // Check new settings exist under target series
  const migratedSettings = getCustomBackdropSettings(legacyComicId);
  assert(migratedSettings, 'Migrated settings found for target series');
  assert.strictEqual(migratedSettings.comicId, legacyComicId);
  assert.strictEqual(migratedSettings.blur, 8);
  assert.strictEqual(migratedSettings.dim, 52);

  // Check cache was migrated to new URL format
  const newVUrl = getBackdropUrl(legacyComicId, 'vertical');
  const newWUrl = getBackdropUrl(legacyComicId, 'wide');
  assert(cacheMap.has(newVUrl), 'New vertical cache entry exists');
  assert(cacheMap.has(newWUrl), 'New wide cache entry exists');
  assert(!cacheMap.has('https://tcl.local/custom-backdrop-vertical.webp'), 'Old vertical cache entry removed');
  assert(!cacheMap.has('https://tcl.local/custom-backdrop-wide.webp'), 'Old wide cache entry removed');
  console.log('✓ Legacy migration passed seamlessly');

  console.log('--- ALL PER-SERIES BACKDROP TESTS PASSED ---');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
