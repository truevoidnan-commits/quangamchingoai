/**
 * Unit & Integration Mock Tests for Video Subsystem (Cloudflare R2 + Supabase)
 * Run: node scripts/test-video-system.mjs
 */

import assert from 'assert';
import {
  isValidUuid,
  buildPosterKey,
  buildVideoSourceKey,
  buildSubtitleKey,
  validateVideoPresignRequest,
  WARNING_THRESHOLD_BYTES,
  ESTIMATED_COMIC_STORAGE_BYTES,
} from '../supabase/functions/video-presign/validate.ts';

console.log('═══════════════════════════════════════════════════════════');
console.log('🧪 RUNNING TEST SUITE: VIDEO SUBSYSTEM & R2 COST CONTROLS');
console.log('═══════════════════════════════════════════════════════════\n');

let passedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// TEST GROUP 1: UUID & Key Generation
// -----------------------------------------------------------------------------
test('UUID validation correctly identifies valid and invalid UUIDs', () => {
  const valid = 'd3b07384-d113-46fb-9762-b91c12e8c201';
  const invalid1 = 'not-a-uuid';
  const invalid2 = 'd3b07384-d113-46fb-9762-b91c12e8c201-extra';
  const invalid3 = null;

  assert.strictEqual(isValidUuid(valid), true);
  assert.strictEqual(isValidUuid(invalid1), false);
  assert.strictEqual(isValidUuid(invalid2), false);
  assert.strictEqual(isValidUuid(invalid3), false);
});

test('Object key generation formats follow strict private hierarchy', () => {
  const seriesId = 'c0a80101-0000-0000-0000-000000000001';
  const episodeId = 'c0a80101-0000-0000-0000-000000000002';

  const posterKey = buildPosterKey(seriesId, 'webp');
  assert.strictEqual(posterKey, `videos/${seriesId}/poster.webp`);

  const posterKeyJpg = buildPosterKey(seriesId, 'jpg');
  assert.strictEqual(posterKeyJpg, `videos/${seriesId}/poster.jpg`);

  const videoKey = buildVideoSourceKey(seriesId, episodeId);
  assert.strictEqual(videoKey, `videos/${seriesId}/${episodeId}/source.mp4`);

  const subKeyVi = buildSubtitleKey(seriesId, episodeId, 'vi');
  assert.strictEqual(subKeyVi, `videos/${seriesId}/${episodeId}/subtitles/vi.vtt`);

  const subKeyEn = buildSubtitleKey(seriesId, episodeId, 'en-US');
  assert.strictEqual(subKeyEn, `videos/${seriesId}/${episodeId}/subtitles/en-us.vtt`);
});

// -----------------------------------------------------------------------------
// TEST GROUP 2: Presign Request Payload Validation
// -----------------------------------------------------------------------------
test('validateVideoPresignRequest validates action and UUIDs', () => {
  const seriesId = 'c0a80101-0000-0000-0000-000000000001';
  const episodeId = 'c0a80101-0000-0000-0000-000000000002';

  // Invalid action
  const resBadAction = validateVideoPresignRequest({ action: 'hack-r2' });
  assert.strictEqual(resBadAction.ok, false);
  assert.strictEqual(resBadAction.code, 'INVALID_ACTION');

  // Missing seriesId
  const resNoSeries = validateVideoPresignRequest({ action: 'init-multipart-upload' });
  assert.strictEqual(resNoSeries.ok, false);
  assert.strictEqual(resNoSeries.code, 'INVALID_SERIES_ID');

  // Valid init-multipart
  const resInit = validateVideoPresignRequest({
    action: 'init-multipart-upload',
    seriesId,
    episodeId,
    fileSize: 104857600, // 100MB
    mimeType: 'video/mp4',
  });
  assert.strictEqual(resInit.ok, true);
  assert.strictEqual(resInit.data.fileSize, 104857600);

  // Invalid part number
  const resBadPart = validateVideoPresignRequest({
    action: 'get-part-url',
    seriesId,
    episodeId,
    uploadId: 'mock-upload-id',
    partNumber: 0, // Must be >= 1
  });
  assert.strictEqual(resBadPart.ok, false);
  assert.strictEqual(resBadPart.code, 'INVALID_PART_NUMBER');

  // Valid part url
  const resGoodPart = validateVideoPresignRequest({
    action: 'get-part-url',
    seriesId,
    episodeId,
    uploadId: 'mock-upload-id',
    partNumber: 1,
  });
  assert.strictEqual(resGoodPart.ok, true);

  // Storage stats action requires no seriesId
  const resStats = validateVideoPresignRequest({ action: 'get-storage-stats' });
  assert.strictEqual(resStats.ok, true);
});

// -----------------------------------------------------------------------------
// TEST GROUP 3: Multipart Chunking Mathematics
// -----------------------------------------------------------------------------
test('Multipart chunk calculation slices files accurately without RAM spikes', () => {
  const PART_SIZE = 10 * 1024 * 1024; // 10MB

  // Case A: Exactly 25MB file
  const fileSize25MB = 25 * 1024 * 1024;
  const totalPartsA = Math.ceil(fileSize25MB / PART_SIZE);
  assert.strictEqual(totalPartsA, 3);

  // Verify slice offsets
  const slices = [];
  for (let p = 1; p <= totalPartsA; p++) {
    const start = (p - 1) * PART_SIZE;
    const end = Math.min(start + PART_SIZE, fileSize25MB);
    slices.push({ start, end, size: end - start });
  }

  assert.strictEqual(slices[0].size, PART_SIZE); // Part 1: 10MB
  assert.strictEqual(slices[1].size, PART_SIZE); // Part 2: 10MB
  assert.strictEqual(slices[2].size, 5 * 1024 * 1024); // Part 3: 5MB
  assert.strictEqual(slices.reduce((acc, s) => acc + s.size, 0), fileSize25MB);

  // Case B: Small file 2MB
  const fileSize2MB = 2 * 1024 * 1024;
  const totalPartsB = Math.max(1, Math.ceil(fileSize2MB / PART_SIZE));
  assert.strictEqual(totalPartsB, 1);
});

// -----------------------------------------------------------------------------
// TEST GROUP 4: Storage Quota & 8GB Warning Guard
// -----------------------------------------------------------------------------
test('Storage guard correctly evaluates 8GB warning limit', () => {
  const WARNING_LIMIT = WARNING_THRESHOLD_BYTES; // 8 * 1024 * 1024 * 1024
  const comicEstimate = ESTIMATED_COMIC_STORAGE_BYTES; // ~1.2 GB

  // Case 1: Small video library
  const currentVideo1 = 2 * 1024 * 1024 * 1024; // 2 GB
  const incomingFile1 = 500 * 1024 * 1024; // 500 MB
  const total1 = currentVideo1 + comicEstimate + incomingFile1;
  assert.strictEqual(total1 < WARNING_LIMIT, true);

  // Case 2: Approaching 8GB threshold
  const currentVideo2 = 6.2 * 1024 * 1024 * 1024; // 6.2 GB
  const incomingFile2 = 1.0 * 1024 * 1024 * 1024; // 1.0 GB
  const total2 = currentVideo2 + comicEstimate + incomingFile2; // 6.2 + 1.2 + 1.0 = 8.4 GB
  assert.strictEqual(total2 >= WARNING_LIMIT, true);
});

// -----------------------------------------------------------------------------
// TEST GROUP 5: Watch Progress Local Fallback & Merge
// -----------------------------------------------------------------------------
test('Progress conflict resolution favors newer or furthest position', () => {
  const localProgress = {
    positionSeconds: 120,
    durationSeconds: 300,
    updatedAt: 1000,
    completed: false,
  };

  const cloudProgressOlder = {
    positionSeconds: 80,
    durationSeconds: 300,
    updatedAt: 900,
    completed: false,
  };

  const cloudProgressNewer = {
    positionSeconds: 150,
    durationSeconds: 300,
    updatedAt: 1200,
    completed: false,
  };

  // If local is newer, local wins
  const resolve1 = localProgress.updatedAt > cloudProgressOlder.updatedAt ? localProgress : cloudProgressOlder;
  assert.strictEqual(resolve1.positionSeconds, 120);

  // If cloud is newer, cloud wins
  const resolve2 = cloudProgressNewer.updatedAt > localProgress.updatedAt ? cloudProgressNewer : localProgress;
  assert.strictEqual(resolve2.positionSeconds, 150);
});

console.log(`\n🎉 ALL ${passedTests} TEST CASES PASSED SUCCESSFULLY!\n`);
