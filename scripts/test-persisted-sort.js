import assert from 'assert';
import { getPersistedSort, clearPersistedSort } from '../src/hooks/usePersistedSort.js';

console.log('=== TEST SUITE: usePersistedSort ===');

// Setup mock window and localStorage
const mockStorage = new Map();
const mockLocalStorage = {
  getItem: (k) => mockStorage.get(k) ?? null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear(),
};

globalThis.window = {
  localStorage: mockLocalStorage,
};

// 1. Fallback to 'asc' when storage is empty
mockStorage.clear();
assert.strictEqual(
  getPersistedSort('tcl:chapterSort:novel1', 'tcl:chapterSortDefault'),
  'asc',
  'Empty storage must return asc'
);
console.log('✓ 1. Empty storage returns "asc"');

// 2. Fallback to defaultKey when itemKey is not set
mockStorage.set('tcl:chapterSortDefault', 'desc');
assert.strictEqual(
  getPersistedSort('tcl:chapterSort:novel1', 'tcl:chapterSortDefault'),
  'desc',
  'Must inherit defaultKey when itemKey is empty'
);
console.log('✓ 2. Inherits defaultKey when itemKey is empty');

// 3. itemKey takes precedence over defaultKey
mockStorage.set('tcl:chapterSort:novel1', 'asc');
assert.strictEqual(
  getPersistedSort('tcl:chapterSort:novel1', 'tcl:chapterSortDefault'),
  'asc',
  'itemKey must override defaultKey'
);
console.log('✓ 3. itemKey overrides defaultKey');

// 4. Invalid values are ignored and fallback
mockStorage.set('tcl:chapterSort:novel1', 'invalid_sort');
assert.strictEqual(
  getPersistedSort('tcl:chapterSort:novel1', 'tcl:chapterSortDefault'),
  'desc',
  'Invalid itemKey must fallback to defaultKey'
);

mockStorage.set('tcl:chapterSortDefault', 'invalid_default');
assert.strictEqual(
  getPersistedSort('tcl:chapterSort:novel1', 'tcl:chapterSortDefault'),
  'asc',
  'Invalid defaultKey must fallback to "asc"'
);
console.log('✓ 4. Invalid values ignored, fallback properly');

// 5. Safe handling when localStorage throws
const brokenStorage = {
  getItem: () => {
    throw new Error('Access denied (SecurityError)');
  },
  setItem: () => {
    throw new Error('QuotaExceeded');
  },
  removeItem: () => {
    throw new Error('Access denied');
  },
};
globalThis.window.localStorage = brokenStorage;
assert.strictEqual(
  getPersistedSort('tcl:chapterSort:novel1', 'tcl:chapterSortDefault'),
  'asc',
  'Must not throw and return "asc" on storage error'
);
assert.doesNotThrow(() => {
  clearPersistedSort('tcl:chapterSort:novel1');
}, 'clearPersistedSort must not throw on storage error');
console.log('✓ 5. Error tolerance on blocked / throwing localStorage');

// Restore working mockStorage
globalThis.window.localStorage = mockLocalStorage;
mockStorage.set('tcl:volumeSort:vol1', 'desc');
assert.strictEqual(mockStorage.get('tcl:volumeSort:vol1'), 'desc');
clearPersistedSort('tcl:volumeSort:vol1');
assert.strictEqual(mockStorage.get('tcl:volumeSort:vol1'), undefined);
console.log('✓ 6. clearPersistedSort removes item key');

console.log('=== ALL usePersistedSort TESTS PASSED (100%) ===');
process.exit(0);
