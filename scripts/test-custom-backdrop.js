/**
 * scripts/test-custom-backdrop.js
 * 
 * Tests custom backdrop logic:
 * 1. Default settings & validation
 * 2. Settings save and load in localStorage
 * 3. Fallback when invalid or missing
 * 4. Image cover & crop dimension calculation
 * 5. Luminance and auto-dim guarantee (minimum 35% when brightness > 0.5)
 * 6. Always terminates cleanly with process.exit(0)
 */

import assert from 'assert';

console.log('--- TESTING CUSTOM BACKDROP LOGIC ---');

// Mock localStorage if in pure node environment
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

// 1. Test settings retrieval & validation
function validateBackdropSettings(rawSettings) {
  if (!rawSettings || typeof rawSettings !== 'object') return null;
  return {
    comicId: rawSettings.comicId || '',
    volumeId: rawSettings.volumeId || '',
    pageIndex: typeof rawSettings.pageIndex === 'number' ? rawSettings.pageIndex : 0,
    blur: Math.min(20, Math.max(0, Number(rawSettings.blur) || 0)),
    dim: Math.min(80, Math.max(0, Number(rawSettings.dim) || 40)),
    offsetX: typeof rawSettings.offsetX === 'number' ? rawSettings.offsetX : 0.5,
    offsetY: typeof rawSettings.offsetY === 'number' ? rawSettings.offsetY : 0.5,
  };
}

// Test clamp ranges
const clamped1 = validateBackdropSettings({ blur: -10, dim: 120 });
assert.strictEqual(clamped1.blur, 0, 'Blur clamped to min 0');
assert.strictEqual(clamped1.dim, 80, 'Dim clamped to max 80');

const clamped2 = validateBackdropSettings({ blur: 25, dim: 10 });
assert.strictEqual(clamped2.blur, 20, 'Blur clamped to max 20');
assert.strictEqual(clamped2.dim, 10, 'Dim within range');

console.log('✓ Settings validation and clamping passed');

// 2. Test cover crop math
function computeCoverCrop(srcW, srcH, targetW, targetH, offsetX = 0.5, offsetY = 0.5) {
  const scale = Math.max(targetW / srcW, targetH / srcH);
  const scaledW = srcW * scale;
  const scaledH = srcH * scale;
  const dx = (targetW - scaledW) * offsetX;
  const dy = (targetH - scaledH) * offsetY;
  return { scale, scaledW, scaledH, dx, dy };
}

// Mobile vertical 9:16 crop from 4:3 source
const cropMobile = computeCoverCrop(1200, 900, 1080, 1920, 0.5, 0.5);
assert(cropMobile.scaledH >= 1920, 'Scaled height covers target vertical');
assert(cropMobile.scaledW >= 1080, 'Scaled width covers target vertical');
console.log(`✓ Mobile crop: scale=${cropMobile.scale.toFixed(2)}, scaled=${cropMobile.scaledW}x${cropMobile.scaledH}`);

// Desktop wide 16:9 crop from 3:4 portrait source
const cropDesktop = computeCoverCrop(800, 1200, 1920, 1080, 0.5, 0.5);
assert(cropDesktop.scaledW >= 1920, 'Scaled width covers target horizontal');
assert(cropDesktop.scaledH >= 1080, 'Scaled height covers target horizontal');
console.log(`✓ Desktop crop: scale=${cropDesktop.scale.toFixed(2)}, scaled=${cropDesktop.scaledW}x${cropDesktop.scaledH}`);

// 3. Test brightness & auto-dim guarantee
function computeEffectiveDim(userDim, brightness) {
  if (brightness > 0.5) {
    return Math.max(35, userDim);
  }
  return userDim;
}

// Bright page (e.g. brightness 0.85) with user dim 10%
const effectiveDim1 = computeEffectiveDim(10, 0.85);
assert.strictEqual(effectiveDim1, 35, 'Auto-dim enforces minimum 35% for bright pages');

// Dark page (brightness 0.2) with user dim 10%
const effectiveDim2 = computeEffectiveDim(10, 0.2);
assert.strictEqual(effectiveDim2, 10, 'Auto-dim allows lower dim for already dark pages');

// User set dim 50% on bright page
const effectiveDim3 = computeEffectiveDim(50, 0.9);
assert.strictEqual(effectiveDim3, 50, 'User dim higher than 35% is preserved');

console.log('✓ Auto-dim safety guarantee passed');

// 4. Test fallback on missing page or cleared backdrop
localStorage.setItem('tcl_custom_comic_backdrop', JSON.stringify({
  comicId: 'deleted-series',
  volumeId: 'vol-99',
  pageIndex: 5,
  blur: 4,
  dim: 50,
}));

let settings = validateBackdropSettings(JSON.parse(localStorage.getItem('tcl_custom_comic_backdrop')));
assert.strictEqual(settings.comicId, 'deleted-series');

// Simulate clear
localStorage.removeItem('tcl_custom_comic_backdrop');
settings = validateBackdropSettings(JSON.parse(localStorage.getItem('tcl_custom_comic_backdrop')));
assert.strictEqual(settings, null, 'Fallback to null when cleared');

console.log('✓ Fallback on missing/cleared settings passed');

console.log('--- ALL CUSTOM BACKDROP TESTS PASSED ---');
process.exit(0);
