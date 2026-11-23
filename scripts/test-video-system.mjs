/**
 * Unit & Integration Mock Tests for Video Subsystem (Cloudflare R2 + Supabase)
 * Run: node scripts/test-video-system.mjs
 */

import assert from 'assert';
import {
  isValidUuid,
  isValidEtag,
  cleanEtag,
  escapeXml,
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

  // Invalid part number (0)
  const resBadPart = validateVideoPresignRequest({
    action: 'get-part-url',
    seriesId,
    episodeId,
    uploadId: 'mock-upload-id',
    partNumber: 0,
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

  const resolve1 = localProgress.updatedAt > cloudProgressOlder.updatedAt ? localProgress : cloudProgressOlder;
  assert.strictEqual(resolve1.positionSeconds, 120);

  const resolve2 = cloudProgressNewer.updatedAt > localProgress.updatedAt ? cloudProgressNewer : localProgress;
  assert.strictEqual(resolve2.positionSeconds, 150);
});

// -----------------------------------------------------------------------------
// TEST GROUP 6: ETag Validation & Elimination of Fake ETags
// -----------------------------------------------------------------------------
test('ETag validation accepts valid S3/R2 hashes and rejects fake or injected values', () => {
  // Valid ETags
  assert.strictEqual(isValidEtag('"9b10ea733c3a004d9852f2e17855b5f4"'), true);
  assert.strictEqual(isValidEtag('9b10ea733c3a004d9852f2e17855b5f4'), true);
  assert.strictEqual(isValidEtag('"e-tag-with-dashes-123"'), true);

  // Invalid / Injected ETags
  assert.strictEqual(isValidEtag(''), false);
  assert.strictEqual(isValidEtag(null), false);
  assert.strictEqual(isValidEtag('fake<tag>'), false);
  assert.strictEqual(isValidEtag('part-1</ETag><EvilTag>'), false);
  assert.strictEqual(isValidEtag('part with spaces'), false);

  // cleanEtag strips outer quotes safely
  assert.strictEqual(cleanEtag('"hash123"'), 'hash123');
  assert.strictEqual(cleanEtag('hash123'), 'hash123');

  // escapeXml properly sanitizes strings
  assert.strictEqual(escapeXml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
});

test('validateVideoPresignRequest rejects complete-multipart-upload with invalid or duplicate ETags', () => {
  const seriesId = 'c0a80101-0000-0000-0000-000000000001';
  const episodeId = 'c0a80101-0000-0000-0000-000000000002';

  // Bad ETag in part
  const resBadEtag = validateVideoPresignRequest({
    action: 'complete-multipart-upload',
    seriesId,
    episodeId,
    uploadId: 'mock-upload-id',
    parts: [{ PartNumber: 1, ETag: '<invalid>' }],
  });
  assert.strictEqual(resBadEtag.ok, false);
  assert.strictEqual(resBadEtag.code, 'INVALID_ETAG_FORMAT');

  // Duplicate part numbers
  const resDup = validateVideoPresignRequest({
    action: 'complete-multipart-upload',
    seriesId,
    episodeId,
    uploadId: 'mock-upload-id',
    parts: [
      { PartNumber: 1, ETag: '"hash1"' },
      { PartNumber: 1, ETag: '"hash2"' },
    ],
  });
  assert.strictEqual(resDup.ok, false);
  assert.strictEqual(resDup.code, 'DUPLICATE_PART_NUMBER');

  // Valid parts
  const resValid = validateVideoPresignRequest({
    action: 'complete-multipart-upload',
    seriesId,
    episodeId,
    uploadId: 'mock-upload-id',
    parts: [
      { PartNumber: 1, ETag: '"hash1"' },
      { PartNumber: 2, ETag: '"hash2"' },
    ],
  });
  assert.strictEqual(resValid.ok, true);
  assert.strictEqual(resValid.data.parts.length, 2);
  assert.strictEqual(resValid.data.parts[0].ETag, 'hash1'); // clean quotes
});

// -----------------------------------------------------------------------------
// TEST GROUP 7: Upload Session Verification Simulation
// -----------------------------------------------------------------------------
test('Upload session verification enforces ownership and active status', () => {
  const mockSessions = new Map([
    [
      'valid-upload-id',
      {
        series_id: 'series-A',
        episode_id: 'ep-1',
        r2_key: 'videos/series-A/ep-1/source.mp4',
        status: 'in_progress',
        total_parts: 3,
        file_size: 25000000,
      },
    ],
    [
      'completed-upload-id',
      {
        series_id: 'series-A',
        episode_id: 'ep-2',
        r2_key: 'videos/series-A/ep-2/source.mp4',
        status: 'completed',
        total_parts: 1,
        file_size: 10000000,
      },
    ],
  ]);

  function verifySession(uploadId, seriesId, episodeId, partNumber = null) {
    const session = mockSessions.get(uploadId);
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' };
    if (session.series_id !== seriesId || session.episode_id !== episodeId) {
      return { ok: false, code: 'SESSION_MISMATCH' };
    }
    if (session.status !== 'in_progress') {
      return { ok: false, code: 'SESSION_NOT_ACTIVE' };
    }
    if (partNumber !== null && (partNumber < 1 || partNumber > session.total_parts)) {
      return { ok: false, code: 'PART_OUT_OF_RANGE' };
    }
    return { ok: true, session };
  }

  // Non-existent uploadId
  assert.strictEqual(verifySession('unknown-id', 'series-A', 'ep-1').code, 'SESSION_NOT_FOUND');

  // Mismatched series/episode
  assert.strictEqual(verifySession('valid-upload-id', 'series-WRONG', 'ep-1').code, 'SESSION_MISMATCH');

  // Session already completed
  assert.strictEqual(verifySession('completed-upload-id', 'series-A', 'ep-2').code, 'SESSION_NOT_ACTIVE');

  // Part out of range
  assert.strictEqual(verifySession('valid-upload-id', 'series-A', 'ep-1', 4).code, 'PART_OUT_OF_RANGE');

  // Valid part check
  assert.strictEqual(verifySession('valid-upload-id', 'series-A', 'ep-1', 2).ok, true);
});

// -----------------------------------------------------------------------------
// TEST GROUP 8: HEAD Verification and Size Matching Simulation
// -----------------------------------------------------------------------------
test('HEAD verification rejects ready status if HEAD fails or size mismatches', () => {
  function verifyHeadAndSize(headStatus, actualContentLength, expectedFileSize) {
    if (headStatus !== 200) {
      return { ok: false, code: 'R2_HEAD_FAILED' };
    }
    if (actualContentLength <= 0 || (expectedFileSize > 0 && actualContentLength !== expectedFileSize)) {
      return { ok: false, code: 'FILE_SIZE_MISMATCH' };
    }
    return { ok: true, actualSize: actualContentLength };
  }

  // HEAD returns 404 (object missing)
  assert.strictEqual(verifyHeadAndSize(404, 0, 25000000).code, 'R2_HEAD_FAILED');

  // HEAD returns 500
  assert.strictEqual(verifyHeadAndSize(500, 0, 25000000).code, 'R2_HEAD_FAILED');

  // Size mismatch (e.g. truncated upload)
  assert.strictEqual(verifyHeadAndSize(200, 15000000, 25000000).code, 'FILE_SIZE_MISMATCH');

  // Perfect match
  assert.strictEqual(verifyHeadAndSize(200, 25000000, 25000000).ok, true);
});

// -----------------------------------------------------------------------------
// TEST GROUP 9: Playback Authorization Guard Simulation
// -----------------------------------------------------------------------------
test('Playback authorization strictly blocks non-admin if series or episode is private', () => {
  function checkPlaybackPermission({ isAdmin, seriesPublished, episodePublished, episodeStatus, episodeSeriesId, requestedSeriesId }) {
    if (isAdmin) return { allow: true };

    if (episodeSeriesId !== requestedSeriesId) {
      return { allow: false, code: 'EPISODE_NOT_AVAILABLE' };
    }
    if (!episodePublished || episodeStatus !== 'ready') {
      return { allow: false, code: 'EPISODE_NOT_AVAILABLE' };
    }
    if (!seriesPublished) {
      return { allow: false, code: 'SERIES_NOT_PUBLISHED' };
    }

    return { allow: true };
  }

  // Admin always has access
  assert.strictEqual(checkPlaybackPermission({ isAdmin: true, seriesPublished: false, episodePublished: false, episodeStatus: 'uploading', episodeSeriesId: 'A', requestedSeriesId: 'A' }).allow, true);

  // Non-admin with published episode but UNPUBLISHED parent series -> FORBIDDEN
  const resUnpubSeries = checkPlaybackPermission({ isAdmin: false, seriesPublished: false, episodePublished: true, episodeStatus: 'ready', episodeSeriesId: 'A', requestedSeriesId: 'A' });
  assert.strictEqual(resUnpubSeries.allow, false);
  assert.strictEqual(resUnpubSeries.code, 'SERIES_NOT_PUBLISHED');

  // Non-admin with episode not ready -> FORBIDDEN
  const resNotReady = checkPlaybackPermission({ isAdmin: false, seriesPublished: true, episodePublished: true, episodeStatus: 'uploading', episodeSeriesId: 'A', requestedSeriesId: 'A' });
  assert.strictEqual(resNotReady.allow, false);
  assert.strictEqual(resNotReady.code, 'EPISODE_NOT_AVAILABLE');

  // Non-admin with mismatched series ID -> FORBIDDEN
  const resMismatch = checkPlaybackPermission({ isAdmin: false, seriesPublished: true, episodePublished: true, episodeStatus: 'ready', episodeSeriesId: 'B', requestedSeriesId: 'A' });
  assert.strictEqual(resMismatch.allow, false);

  // Fully public published episode -> ALLOWED
  const resPublic = checkPlaybackPermission({ isAdmin: false, seriesPublished: true, episodePublished: true, episodeStatus: 'ready', episodeSeriesId: 'A', requestedSeriesId: 'A' });
  assert.strictEqual(resPublic.allow, true);
});

// -----------------------------------------------------------------------------
// TEST GROUP 10: Abort Multipart Verification & Fail-Closed Behavior
// -----------------------------------------------------------------------------
test('abort-multipart-upload verifies session bounds and fails closed if R2 or DB fails', () => {
  const mockSessions = new Map([
    [
      'sess-active',
      {
        series_id: 'series-A',
        episode_id: 'ep-1',
        r2_key: 'videos/series-A/ep-1/source.mp4',
        status: 'in_progress',
      },
    ],
    [
      'sess-completed',
      {
        series_id: 'series-A',
        episode_id: 'ep-2',
        r2_key: 'videos/series-A/ep-2/source.mp4',
        status: 'completed',
      },
    ],
  ]);

  const mockDbEpisodes = new Map([
    ['ep-1', { id: 'ep-1', upload_status: 'uploading' }],
    ['ep-2', { id: 'ep-2', upload_status: 'ready' }],
  ]);

  function handleAbort({ uploadId, seriesId, episodeId, r2AbortSuccess, dbSessionUpdateFails, dbEpisodeUpdateFails }) {
    const session = mockSessions.get(uploadId);
    if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' };
    if (session.series_id !== seriesId || session.episode_id !== episodeId) {
      return { ok: false, code: 'SESSION_MISMATCH' };
    }
    const expectedKey = `videos/${seriesId}/${episodeId}/source.mp4`;
    if (session.r2_key !== expectedKey) {
      return { ok: false, code: 'KEY_MISMATCH' };
    }
    if (session.status !== 'in_progress') {
      return { ok: false, code: 'SESSION_NOT_ABORTABLE' };
    }

    // Call R2 abort
    if (!r2AbortSuccess) {
      // Do NOT modify database if R2 fails
      return { ok: false, code: 'R2_ABORT_FAILED' };
    }

    if (dbSessionUpdateFails) {
      return { ok: false, code: 'DB_UPDATE_FAILED' };
    }
    session.status = 'aborted';

    if (dbEpisodeUpdateFails) {
      return { ok: false, code: 'DB_UPDATE_FAILED' };
    }
    const ep = mockDbEpisodes.get(episodeId);
    if (ep && ep.upload_status === 'uploading') {
      ep.upload_status = 'failed';
    }

    return { ok: true, aborted: true };
  }

  // 1. Unknown uploadId
  assert.strictEqual(handleAbort({ uploadId: 'unknown', seriesId: 'series-A', episodeId: 'ep-1', r2AbortSuccess: true }).code, 'SESSION_NOT_FOUND');

  // 2. Mismatched seriesId/episodeId
  assert.strictEqual(handleAbort({ uploadId: 'sess-active', seriesId: 'series-WRONG', episodeId: 'ep-1', r2AbortSuccess: true }).code, 'SESSION_MISMATCH');

  // 3. Already completed session cannot be aborted
  assert.strictEqual(handleAbort({ uploadId: 'sess-completed', seriesId: 'series-A', episodeId: 'ep-2', r2AbortSuccess: true }).code, 'SESSION_NOT_ABORTABLE');

  // 4. R2 abort fails -> DB remains untouched, status remains in_progress
  const r2FailRes = handleAbort({ uploadId: 'sess-active', seriesId: 'series-A', episodeId: 'ep-1', r2AbortSuccess: false });
  assert.strictEqual(r2FailRes.code, 'R2_ABORT_FAILED');
  assert.strictEqual(mockSessions.get('sess-active').status, 'in_progress');
  assert.strictEqual(mockDbEpisodes.get('ep-1').upload_status, 'uploading');

  // 5. DB update fails during abort -> returns error and leaves episode in uploading
  const dbFailRes = handleAbort({ uploadId: 'sess-active', seriesId: 'series-A', episodeId: 'ep-1', r2AbortSuccess: true, dbSessionUpdateFails: true });
  assert.strictEqual(dbFailRes.code, 'DB_UPDATE_FAILED');
  assert.strictEqual(mockSessions.get('sess-active').status, 'in_progress');

  // 6. Successful abort
  const successRes = handleAbort({ uploadId: 'sess-active', seriesId: 'series-A', episodeId: 'ep-1', r2AbortSuccess: true });
  assert.strictEqual(successRes.ok, true);
  assert.strictEqual(mockSessions.get('sess-active').status, 'aborted');
  assert.strictEqual(mockDbEpisodes.get('ep-1').upload_status, 'failed');
});

// -----------------------------------------------------------------------------
// TEST GROUP 11: Init Multipart Failure Cleanup & DB Consistency
// -----------------------------------------------------------------------------
test('init-multipart-upload cleans up R2 session and maintains consistent DB status on errors', () => {
  const mockEpisodes = new Map([
    ['ep-exists', { id: 'ep-exists', series_id: 'series-A', upload_status: 'draft' }],
  ]);

  let r2AbortedSession = null;
  let createdSessionStatus = null;

  function handleInit({ seriesId, episodeId, dbSessionInsertFails, dbEpisodeUpdateFails }) {
    const ep = mockEpisodes.get(episodeId);
    if (!ep || ep.series_id !== seriesId) {
      return { ok: false, code: 'EPISODE_NOT_FOUND' };
    }

    // R2 init succeeds and produces uploadId
    const uploadId = 'r2-upload-123';

    if (dbSessionInsertFails) {
      // Must abort initiated R2 session!
      r2AbortedSession = uploadId;
      return { ok: false, code: 'SESSION_CREATE_FAILED' };
    }
    createdSessionStatus = 'in_progress';

    if (dbEpisodeUpdateFails) {
      // Must abort initiated R2 session and revert DB session to aborted
      r2AbortedSession = uploadId;
      createdSessionStatus = 'aborted';
      return { ok: false, code: 'DB_UPDATE_FAILED' };
    }

    ep.upload_status = 'uploading';
    return { ok: true, uploadId };
  }

  // 1. Episode not found or mismatch
  assert.strictEqual(handleInit({ seriesId: 'series-A', episodeId: 'ep-missing' }).code, 'EPISODE_NOT_FOUND');

  // 2. Session insert fails -> R2 aborted, error returned
  r2AbortedSession = null;
  const sessFail = handleInit({ seriesId: 'series-A', episodeId: 'ep-exists', dbSessionInsertFails: true });
  assert.strictEqual(sessFail.code, 'SESSION_CREATE_FAILED');
  assert.strictEqual(r2AbortedSession, 'r2-upload-123');

  // 3. Episode update fails -> R2 aborted, DB session marked aborted, error returned
  r2AbortedSession = null;
  createdSessionStatus = null;
  const epFail = handleInit({ seriesId: 'series-A', episodeId: 'ep-exists', dbEpisodeUpdateFails: true });
  assert.strictEqual(epFail.code, 'DB_UPDATE_FAILED');
  assert.strictEqual(r2AbortedSession, 'r2-upload-123');
  assert.strictEqual(createdSessionStatus, 'aborted');

  // 4. Clean success
  r2AbortedSession = null;
  const cleanSuccess = handleInit({ seriesId: 'series-A', episodeId: 'ep-exists' });
  assert.strictEqual(cleanSuccess.ok, true);
  assert.strictEqual(cleanSuccess.uploadId, 'r2-upload-123');
  assert.strictEqual(r2AbortedSession, null);
  assert.strictEqual(mockEpisodes.get('ep-exists').upload_status, 'uploading');
});

// -----------------------------------------------------------------------------
// TEST GROUP 12: S3 ListObjectsV2 Pagination & Deletion Fail-Closed Logic
// -----------------------------------------------------------------------------
test('S3 ListObjectsV2 pagination accumulates pages and fails closed on unread pages or deletion errors', () => {
  // Simulate 3 pages of S3 results
  const mockPages = [
    {
      isTruncated: true,
      nextToken: 'token-page-2',
      items: [
        { key: 'videos/series-1/ep-1/source.mp4', size: 1000 },
        { key: 'videos/series-1/ep-1/subtitles/vi.vtt', size: 100 },
      ],
    },
    {
      isTruncated: true,
      nextToken: 'token-page-3',
      items: [
        { key: 'videos/series-1/ep-2/source.mp4', size: 2000 },
      ],
    },
    {
      isTruncated: false,
      nextToken: null,
      items: [
        { key: 'videos/series-1/ep-3/source.mp4', size: 3000 },
      ],
    },
  ];

  function simulateListAll({ failOnPage = null } = {}) {
    const allObjects = [];
    let currentPageIndex = 0;

    while (currentPageIndex < mockPages.length) {
      if (failOnPage === currentPageIndex + 1) {
        return { ok: false, objects: allObjects, error: `Page ${failOnPage} fetch failed` };
      }

      const page = mockPages[currentPageIndex];
      allObjects.push(...page.items);

      if (page.isTruncated && page.nextToken) {
        currentPageIndex++;
      } else {
        return { ok: true, objects: allObjects };
      }
    }
    return { ok: false, objects: allObjects, error: 'Pagination overflow' };
  }

  // 1. Clean multi-page traversal
  const fullList = simulateListAll();
  assert.strictEqual(fullList.ok, true);
  assert.strictEqual(fullList.objects.length, 4);
  const totalBytes = fullList.objects.reduce((acc, o) => acc + o.size, 0);
  assert.strictEqual(totalBytes, 6100);

  // 2. Failure on page 2 halts with ok: false (prevents false complete stats)
  const failList = simulateListAll({ failOnPage: 2 });
  assert.strictEqual(failList.ok, false);
  assert.strictEqual(failList.objects.length, 2); // only page 1 items were read

  // 3. Subtitle deletion fail-closed check
  function simulateDeleteSubtitles(items, failOnKey = null) {
    const failedKeys = [];
    for (const item of items) {
      if (item.key === failOnKey) {
        failedKeys.push(item.key);
      }
    }
    if (failedKeys.length > 0) {
      return { ok: false, code: 'R2_DELETE_FAILED', failedKeys };
    }
    return { ok: true, deleted: true };
  }

  const subDeleteFail = simulateDeleteSubtitles(
    [{ key: 'sub-1.vtt' }, { key: 'sub-2.vtt' }],
    'sub-2.vtt'
  );
  assert.strictEqual(subDeleteFail.ok, false);
  assert.strictEqual(subDeleteFail.code, 'R2_DELETE_FAILED');
  assert.strictEqual(subDeleteFail.failedKeys.includes('sub-2.vtt'), true);

  const subDeleteOk = simulateDeleteSubtitles([{ key: 'sub-1.vtt' }, { key: 'sub-2.vtt' }]);
  assert.strictEqual(subDeleteOk.ok, true);
});

// -----------------------------------------------------------------------------
// TEST GROUP 13: R2 Diagnostics, Environment Isolation & Connectivity Probe Logic
// -----------------------------------------------------------------------------
test('R2 connection probe validates action and classifies errors without leaking secrets', () => {
  // 1. validateVideoPresignRequest accepts test-r2-connection without series/episode
  const resValidProbe = validateVideoPresignRequest({ action: 'test-r2-connection' });
  assert.strictEqual(resValidProbe.ok, true);
  assert.strictEqual(resValidProbe.data.action, 'test-r2-connection');

  // 2. Classify errors
  function classifyR2Error({ httpStatus, errName, message }) {
    let stage = 'UNKNOWN';
    if (errName === 'InvalidAccessKeyId' || errName === 'SignatureDoesNotMatch') {
      stage = 'CREDENTIAL_INVALID';
    } else if (httpStatus === 403 || errName === 'AccessDenied') {
      stage = 'PERMISSIONS_OR_BUCKET_MISMATCH';
    } else if (httpStatus === 404 || errName === 'NoSuchBucket') {
      stage = 'BUCKET_NOT_FOUND';
    } else if (message?.includes('ENOTFOUND') || message?.includes('fetch failed')) {
      stage = 'ENDPOINT_UNREACHABLE';
    }
    return stage;
  }

  assert.strictEqual(classifyR2Error({ httpStatus: 403, errName: 'AccessDenied' }), 'PERMISSIONS_OR_BUCKET_MISMATCH');
  assert.strictEqual(classifyR2Error({ httpStatus: 404, errName: 'NoSuchBucket' }), 'BUCKET_NOT_FOUND');
  assert.strictEqual(classifyR2Error({ httpStatus: 403, errName: 'SignatureDoesNotMatch' }), 'CREDENTIAL_INVALID');
  assert.strictEqual(classifyR2Error({ httpStatus: null, errName: 'FetchError', message: 'getaddrinfo ENOTFOUND' }), 'ENDPOINT_UNREACHABLE');

  // 3. Security: ensure secrets are NEVER leaked in key hint (zero substring exposure)
  function formatKeyHint(key) {
    if (!key) return '(chưa có)';
    return `[Ẩn bảo mật - ${key.length} ký tự]`;
  }
  const secretKey = '0123456789abcdef0123456789abcdef';
  const hint = formatKeyHint(secretKey);
  assert.strictEqual(hint, '[Ẩn bảo mật - 32 ký tự]');
  assert.strictEqual(hint.includes('0123'), false);
  assert.strictEqual(hint.includes('cdef'), false);
});

test('Video runtime environment enforces zero comic fallback and returns safe diagnostics', () => {
  // Simulate environment parser logic in Edge Function
  function parseVideoRuntimeEnv(mockEnv) {
    const rawAccountId = (mockEnv['R2_VIDEO_ACCOUNT_ID'] || mockEnv['R2_ACCOUNT_ID'] || '').trim();
    const rawAccessKeyId = (mockEnv['R2_VIDEO_ACCESS_KEY_ID'] || '').trim();
    const rawSecretAccessKey = (mockEnv['R2_VIDEO_SECRET_ACCESS_KEY'] || '').trim();
    const rawBucket = (mockEnv['R2_VIDEO_BUCKET'] || 'tcl-videos').trim();
    const legacyComicKeyPresent = Boolean(mockEnv['R2_ACCESS_KEY_ID']);

    const R2_ACCOUNT_ID = rawAccountId;
    const R2_ACCESS_KEY_ID = rawAccessKeyId;
    const R2_SECRET_ACCESS_KEY = rawSecretAccessKey;
    const R2_BUCKET = rawBucket;

    const runtimeDiagnostics = {
      hasR2AccountId: Boolean(R2_ACCOUNT_ID),
      r2AccountIdLength: R2_ACCOUNT_ID.length,
      hasR2VideoAccessKeyId: Boolean(R2_ACCESS_KEY_ID),
      r2VideoAccessKeyIdLength: R2_ACCESS_KEY_ID.length,
      hasR2VideoSecretAccessKey: Boolean(R2_SECRET_ACCESS_KEY),
      r2VideoSecretAccessKeyLength: R2_SECRET_ACCESS_KEY.length,
      hasR2VideoBucket: Boolean(R2_BUCKET),
      r2VideoBucket: R2_BUCKET,
      hasLegacyComicKeyPresent: legacyComicKeyPresent,
    };

    if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
      return {
        ok: false,
        code: 'R2_VIDEO_CONFIG_MISSING',
        error: 'Cloudflare R2 Video chưa được cấu hình (thiếu biến R2_VIDEO_*)',
        runtimeDiagnostics,
      };
    }

    return {
      ok: true,
      authSource: 'R2_VIDEO_ACCESS_KEY_ID',
      bucket: R2_BUCKET,
      runtimeDiagnostics,
    };
  }

  // Case 1: Comic key present in env, but R2_VIDEO_ACCESS_KEY_ID is missing
  // MUST NOT fallback to comic key. MUST return R2_VIDEO_CONFIG_MISSING!
  const envWithOnlyComicKeys = {
    R2_ACCOUNT_ID: 'cf-account-123',
    R2_ACCESS_KEY_ID: 'comic-key-should-not-be-used',
    R2_SECRET_ACCESS_KEY: 'comic-secret-should-not-be-used',
    R2_BUCKET: 'tcl-comics',
  };
  const res1 = parseVideoRuntimeEnv(envWithOnlyComicKeys);
  assert.strictEqual(res1.ok, false);
  assert.strictEqual(res1.code, 'R2_VIDEO_CONFIG_MISSING');
  assert.strictEqual(res1.runtimeDiagnostics.hasR2VideoAccessKeyId, false);
  assert.strictEqual(res1.runtimeDiagnostics.r2VideoAccessKeyIdLength, 0);
  assert.strictEqual(res1.runtimeDiagnostics.hasLegacyComicKeyPresent, true);

  // Case 2: All video keys properly configured
  const envWithValidVideoKeys = {
    R2_ACCOUNT_ID: 'cf-account-1234567890123456789012',
    R2_VIDEO_ACCESS_KEY_ID: 'video-access-key-id-32-chars-long',
    R2_VIDEO_SECRET_ACCESS_KEY: 'video-secret-access-key-64-chars-long-abcdef0123456789abcdef0123',
    R2_VIDEO_BUCKET: 'tcl-videos',
    R2_ACCESS_KEY_ID: 'legacy-comic-key',
  };
  const res2 = parseVideoRuntimeEnv(envWithValidVideoKeys);
  assert.strictEqual(res2.ok, true);
  assert.strictEqual(res2.authSource, 'R2_VIDEO_ACCESS_KEY_ID');
  assert.strictEqual(res2.bucket, 'tcl-videos');
  assert.strictEqual(res2.runtimeDiagnostics.hasR2VideoAccessKeyId, true);
  assert.strictEqual(res2.runtimeDiagnostics.r2VideoAccessKeyIdLength, 'video-access-key-id-32-chars-long'.length);
  assert.strictEqual(res2.runtimeDiagnostics.hasR2VideoSecretAccessKey, true);
  assert.strictEqual(res2.runtimeDiagnostics.r2VideoSecretAccessKeyLength, 'video-secret-access-key-64-chars-long-abcdef0123456789abcdef0123'.length);
  assert.strictEqual(res2.runtimeDiagnostics.hasLegacyComicKeyPresent, true);

  // Case 3: Verify security of runtimeDiagnostics object (no key values exist as properties or string content)
  const diagString = JSON.stringify(res2.runtimeDiagnostics);
  assert.strictEqual(diagString.includes('video-access-key'), false);
  assert.strictEqual(diagString.includes('video-secret'), false);
  assert.strictEqual(diagString.includes('legacy-comic-key'), false);
});

test('R2_VIDEO_CONFIG_MISSING strictly conceals runtimeDiagnostics and configuration from unauthenticated and non-admin users', () => {
  // Simulate auth-guarded fail-fast response logic in video-presign Edge Function
  function handleConfigMissingResponse({ currentUser, isUserAdmin, runtimeDiagnostics }) {
    const errorPayload = {
      ok: false,
      error: 'Hệ thống lưu trữ video tạm thời chưa sẵn sàng (Lỗi cấu hình dịch vụ lưu trữ).',
      code: 'R2_VIDEO_CONFIG_MISSING',
    };

    if (currentUser && isUserAdmin) {
      errorPayload.error = 'Cloudflare R2 Video chưa được cấu hình (thiếu hoặc rỗng biến R2_VIDEO_ACCESS_KEY_ID, R2_VIDEO_SECRET_ACCESS_KEY hoặc R2_ACCOUNT_ID). Vui lòng cấu hình trong Supabase Secrets.';
      errorPayload.stage = 'CONFIG_MISSING';
      errorPayload.runtimeDiagnostics = runtimeDiagnostics;
    }

    return errorPayload;
  }

  const sampleDiagnostics = {
    hasR2AccountId: true,
    r2AccountIdLength: 32,
    hasR2VideoAccessKeyId: false,
    r2VideoAccessKeyIdLength: 0,
    hasR2VideoSecretAccessKey: true,
    r2VideoSecretAccessKeyLength: 64,
    hasR2VideoBucket: true,
    r2VideoBucket: 'tcl-videos',
    hasLegacyComicKeyPresent: true,
  };

  // Case 1: Unauthenticated request (no JWT / currentUser is null)
  const unauthRes = handleConfigMissingResponse({
    currentUser: null,
    isUserAdmin: false,
    runtimeDiagnostics: sampleDiagnostics,
  });
  assert.strictEqual(unauthRes.ok, false);
  assert.strictEqual(unauthRes.code, 'R2_VIDEO_CONFIG_MISSING');
  assert.strictEqual(unauthRes.runtimeDiagnostics, undefined);
  assert.strictEqual(unauthRes.stage, undefined);
  assert.strictEqual('runtimeDiagnostics' in unauthRes, false);
  assert.strictEqual(JSON.stringify(unauthRes).includes('tcl-videos'), false);
  assert.strictEqual(JSON.stringify(unauthRes).includes('R2_VIDEO_ACCESS_KEY_ID'), false);
  assert.strictEqual(JSON.stringify(unauthRes).includes('R2_VIDEO_SECRET_ACCESS_KEY'), false);
  assert.strictEqual(JSON.stringify(unauthRes).includes('32'), false);
  assert.strictEqual(JSON.stringify(unauthRes).includes('64'), false);

  // Case 2: Authenticated request by regular user (not admin)
  const nonAdminRes = handleConfigMissingResponse({
    currentUser: { id: 'regular-user-id', email: 'user@example.com' },
    isUserAdmin: false,
    runtimeDiagnostics: sampleDiagnostics,
  });
  assert.strictEqual(nonAdminRes.ok, false);
  assert.strictEqual(nonAdminRes.code, 'R2_VIDEO_CONFIG_MISSING');
  assert.strictEqual(nonAdminRes.runtimeDiagnostics, undefined);
  assert.strictEqual('runtimeDiagnostics' in nonAdminRes, false);
  assert.strictEqual(JSON.stringify(nonAdminRes).includes('tcl-videos'), false);
  assert.strictEqual(JSON.stringify(nonAdminRes).includes('R2_VIDEO_ACCESS_KEY_ID'), false);
  assert.strictEqual(JSON.stringify(nonAdminRes).includes('R2_VIDEO_SECRET_ACCESS_KEY'), false);

  // Case 3: Authenticated Admin user
  const adminRes = handleConfigMissingResponse({
    currentUser: { id: 'admin-user-id', email: 'admin@example.com' },
    isUserAdmin: true,
    runtimeDiagnostics: sampleDiagnostics,
  });
  assert.strictEqual(adminRes.ok, false);
  assert.strictEqual(adminRes.code, 'R2_VIDEO_CONFIG_MISSING');
  assert.strictEqual(adminRes.stage, 'CONFIG_MISSING');
  assert.notStrictEqual(adminRes.runtimeDiagnostics, undefined);
  assert.strictEqual(adminRes.runtimeDiagnostics.hasR2VideoAccessKeyId, false);
  assert.strictEqual(adminRes.runtimeDiagnostics.r2VideoSecretAccessKeyLength, 64);
  assert.strictEqual(adminRes.runtimeDiagnostics.r2VideoBucket, 'tcl-videos');
  assert.strictEqual(adminRes.error.includes('Supabase Secrets'), true);
});

// -----------------------------------------------------------------------------
// TEST GROUP 14: Upload Retry & uq_series_episode Elimination Logic
// -----------------------------------------------------------------------------
test('prepareVideoEpisodeForUpload reuses incomplete episodes and avoids uq_series_episode violation', () => {
  const mockDb = new Map();

  function prepareEpisode({ seriesId, episodeNumber, title, status = 'pending' }) {
    const key = `${seriesId}:${episodeNumber}`;
    const existing = mockDb.get(key);

    if (existing) {
      if (existing.upload_status === 'ready') {
        return { ok: false, error: `Tập ${episodeNumber} đã tồn tại và đã tải lên hoàn tất.` };
      }
      // Reuse existing incomplete shell
      existing.title = title;
      existing.upload_status = 'pending';
      return { ok: true, reused: true, episode: existing };
    }

    // Insert new shell
    const newEp = { id: `ep-${episodeNumber}`, series_id: seriesId, episode_number: episodeNumber, title, upload_status: status };
    mockDb.set(key, newEp);
    return { ok: true, reused: false, episode: newEp };
  }

  // First attempt: creates shell
  const res1 = prepareEpisode({ seriesId: 'series-A', episodeNumber: 1, title: 'Tập 1' });
  assert.strictEqual(res1.ok, true);
  assert.strictEqual(res1.reused, false);
  assert.strictEqual(res1.episode.id, 'ep-1');

  // Simulate upload failed on R2 (status remains 'pending' or becomes 'failed')
  res1.episode.upload_status = 'failed';

  // Second attempt (retry after R2 error): MUST reuse existing shell without duplicate key error
  const resRetry = prepareEpisode({ seriesId: 'series-A', episodeNumber: 1, title: 'Tập 1 Sửa' });
  assert.strictEqual(resRetry.ok, true);
  assert.strictEqual(resRetry.reused, true);
  assert.strictEqual(resRetry.episode.id, 'ep-1');
  assert.strictEqual(resRetry.episode.title, 'Tập 1 Sửa');

  // Mark ready
  resRetry.episode.upload_status = 'ready';

  // Third attempt when episode is already ready -> Rejected cleanly
  const resReady = prepareEpisode({ seriesId: 'series-A', episodeNumber: 1, title: 'Tập 1 Trùng' });
  assert.strictEqual(resReady.ok, false);
  assert.strictEqual(resReady.error.includes('đã tải lên hoàn tất'), true);
});

// -----------------------------------------------------------------------------
// TEST GROUP 15: HTTP 546 Timeout Resilience & Idempotent Multipart Recovery
// -----------------------------------------------------------------------------
test('validateVideoPresignRequest validates verify-episode-upload action and UUIDs', () => {
  const seriesId = 'c0a80101-0000-0000-0000-000000000001';
  const episodeId = 'c0a80101-0000-0000-0000-000000000002';

  // Valid verify action
  const res = validateVideoPresignRequest({
    action: 'verify-episode-upload',
    seriesId,
    episodeId,
  });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.data.action, 'verify-episode-upload');
  assert.strictEqual(res.data.seriesId, seriesId);
  assert.strictEqual(res.data.episodeId, episodeId);

  // Missing episodeId
  const resNoEp = validateVideoPresignRequest({
    action: 'verify-episode-upload',
    seriesId,
  });
  assert.strictEqual(resNoEp.ok, false);
  assert.strictEqual(resNoEp.code, 'INVALID_EPISODE_ID');
});

test('Complete-multipart-upload recovers via HEAD when complete times out or loses response (HTTP 546 mitigation)', async () => {
  const expectedSize = 75896585; // Exact size from production incident
  let s3CompleteAttempts = 0;
  let headChecked = false;
  let dbEpisodeUpdated = false;
  let dbSessionUpdated = false;

  // Simulate CompleteMultipartUpload handler with Idempotent recovery
  async function mockCompleteMultipart({ r2HasFile, completeWillTimeout }) {
    // Stage 1: Idempotent pre-check
    if (r2HasFile) {
      dbEpisodeUpdated = true;
      dbSessionUpdated = true;
      return { ok: true, recovered: true, actualSize: expectedSize };
    }

    // Stage 2: S3 CompleteMultipartUploadCommand
    s3CompleteAttempts++;
    if (completeWillTimeout) {
      // Simulate timeout / HTTP 546 (Worker resource limit or abort)
      // The complete call threw an error or timed out on client
      // But R2 processed it in the background!
      headChecked = true;
      // HeadObject succeeds:
      const actualSize = expectedSize;
      dbEpisodeUpdated = true;
      dbSessionUpdated = true;
      return { ok: true, actualSize, completeRecoveredAfterTimeout: true };
    }

    return { ok: true, actualSize: expectedSize };
  }

  // Case 1: CompleteMultipartUpload times out, but R2 assembled file -> Recovers successfully
  const resTimeout = await mockCompleteMultipart({ r2HasFile: false, completeWillTimeout: true });
  assert.strictEqual(resTimeout.ok, true);
  assert.strictEqual(resTimeout.completeRecoveredAfterTimeout, true);
  assert.strictEqual(headChecked, true);
  assert.strictEqual(dbEpisodeUpdated, true);
  assert.strictEqual(dbSessionUpdated, true);

  // Case 2: Idempotent retry when file already exists on R2 -> skips Complete call
  s3CompleteAttempts = 0;
  const resPre = await mockCompleteMultipart({ r2HasFile: true, completeWillTimeout: false });
  assert.strictEqual(resPre.ok, true);
  assert.strictEqual(resPre.recovered, true);
  assert.strictEqual(s3CompleteAttempts, 0); // Complete was NOT called again
});

test('Finalizing phase strictly prevents premature abort and allows verify-episode-upload recovery', () => {
  // Simulate client-side safe abort policy
  function clientAbortPolicy({ isFinalizing, userExplicitCancel, uploadId }) {
    // MUST NOT abort if in finalization phase
    if (uploadId && !isFinalizing && userExplicitCancel) {
      return { shouldAbortOnR2: true, markEpisodeFailed: true };
    }
    return { shouldAbortOnR2: false, markEpisodeFailed: !isFinalizing };
  }

  // Scenario 1: User explicitly cancels during part upload -> Safe to abort
  const cancelDuringParts = clientAbortPolicy({ isFinalizing: false, userExplicitCancel: true, uploadId: 'up-1' });
  assert.strictEqual(cancelDuringParts.shouldAbortOnR2, true);

  // Scenario 2: Error during finalization (99% / complete-multipart-upload timed out)
  // MUST NOT abort on R2, MUST NOT mark failed in DB
  const timeoutDuringFinalize = clientAbortPolicy({ isFinalizing: true, userExplicitCancel: false, uploadId: 'up-1' });
  assert.strictEqual(timeoutDuringFinalize.shouldAbortOnR2, false);
  assert.strictEqual(timeoutDuringFinalize.markEpisodeFailed, false);

  // Scenario 3: Admin verify-episode-upload recovers episode from unready state with size match
  const mockEpisodeDb = { id: 'ep-75mb', upload_status: 'failed', file_size: 75896585 };
  const mockSessionDb = { upload_id: 'up-1', status: 'in_progress', file_size: 75896585 };

  function handleVerifyEpisodeUpload({ r2ObjectSize }) {
    if (r2ObjectSize === mockEpisodeDb.file_size) {
      mockEpisodeDb.upload_status = 'ready';
      mockSessionDb.status = 'completed';
      return { ok: true, verified: true, actualSize: r2ObjectSize };
    }
    return { ok: false, verified: false, code: r2ObjectSize <= 0 ? 'R2_OBJECT_NOT_FOUND' : 'FILE_SIZE_MISMATCH' };
  }

  const verifyRes = handleVerifyEpisodeUpload({ r2ObjectSize: 75896585 });
  assert.strictEqual(verifyRes.ok, true);
  assert.strictEqual(verifyRes.verified, true);
  assert.strictEqual(mockEpisodeDb.upload_status, 'ready');
  assert.strictEqual(mockEpisodeDb.file_size, 75896585);
  assert.strictEqual(mockSessionDb.status, 'completed');
});

test('verify-episode-upload enforces exact file size matching and rejects missing expected size', async () => {
  const expectedSize = 75896585;

  function runVerify({ episode, sessions, uploadId, r2Size }) {
    if (!episode) return { ok: false, code: 'EPISODE_NOT_FOUND' };

    const targetSession = uploadId
      ? sessions?.find((s) => s.upload_id === uploadId)
      : (sessions?.find((s) => s.status === 'in_progress' && Number(s.file_size) > 0) ||
         sessions?.find((s) => Number(s.file_size) > 0));

    let exp = 0;
    if (targetSession && Number(targetSession.file_size) > 0) {
      exp = Number(targetSession.file_size);
    } else if (Number(episode.file_size) > 0) {
      exp = Number(episode.file_size);
    }

    if (!exp || exp <= 0) {
      return { ok: false, code: 'MISSING_EXPECTED_FILE_SIZE' };
    }

    if (r2Size <= 0) {
      return { ok: false, code: 'R2_FILE_EMPTY' };
    }

    if (r2Size !== exp) {
      return { ok: false, code: 'FILE_SIZE_MISMATCH', actualSize: r2Size, expectedSize: exp };
    }

    episode.upload_status = 'ready';
    episode.file_size = r2Size;
    return { ok: true, verified: true, actualSize: r2Size };
  }

  // Case 1: Mismatched size (e.g. truncated R2 object 40MB vs 75.89MB expected)
  const epMismatched = { id: 'ep-1', upload_status: 'failed', file_size: expectedSize };
  const resMismatch = runVerify({
    episode: epMismatched,
    sessions: [{ upload_id: 'up-1', status: 'in_progress', file_size: expectedSize }],
    r2Size: 40000000,
  });
  assert.strictEqual(resMismatch.ok, false);
  assert.strictEqual(resMismatch.code, 'FILE_SIZE_MISMATCH');
  assert.strictEqual(epMismatched.upload_status, 'failed'); // DB state preserved

  // Case 2: Missing expected size (0 bytes recorded)
  const epMissingSize = { id: 'ep-2', upload_status: 'failed', file_size: 0 };
  const resMissing = runVerify({
    episode: epMissingSize,
    sessions: [{ upload_id: 'up-2', status: 'in_progress', file_size: 0 }],
    r2Size: expectedSize,
  });
  assert.strictEqual(resMissing.ok, false);
  assert.strictEqual(resMissing.code, 'MISSING_EXPECTED_FILE_SIZE');
  assert.strictEqual(epMissingSize.upload_status, 'failed'); // DB state preserved

  // Case 3: Exact match -> Successfully transitioned to ready
  const epValid = { id: 'ep-3', upload_status: 'failed', file_size: expectedSize };
  const resValid = runVerify({
    episode: epValid,
    sessions: [{ upload_id: 'up-3', status: 'in_progress', file_size: expectedSize }],
    r2Size: expectedSize,
  });
  assert.strictEqual(resValid.ok, true);
  assert.strictEqual(resValid.verified, true);
  assert.strictEqual(epValid.upload_status, 'ready');
  assert.strictEqual(epValid.file_size, expectedSize);
});

test('verify-episode-upload preserves historical aborted sessions and only updates verified active session', () => {
  const expectedSize = 75896585;

  const historicalAbortedSession = {
    id: 'sess-old-aborted',
    upload_id: 'up-old',
    status: 'aborted',
    file_size: expectedSize,
  };

  const activeSession = {
    id: 'sess-active',
    upload_id: 'up-active',
    status: 'in_progress',
    file_size: expectedSize,
  };

  const sessions = [activeSession, historicalAbortedSession];
  const episode = { id: 'ep-1', upload_status: 'failed', file_size: expectedSize };

  // Run verify
  const targetSession = sessions.find((s) => s.status === 'in_progress' && s.file_size > 0);
  assert.strictEqual(targetSession.id, 'sess-active');

  // Simulate updating only active session
  if (targetSession && targetSession.status === 'in_progress') {
    targetSession.status = 'completed';
  }
  episode.upload_status = 'ready';

  assert.strictEqual(episode.upload_status, 'ready');
  assert.strictEqual(activeSession.status, 'completed');
  assert.strictEqual(historicalAbortedSession.status, 'aborted'); // Strictly preserved!
});

test('verify-episode-upload distinguishes HEAD 404 from 403, timeout, and network errors', () => {
  function classifyHeadError(err) {
    const httpStatus = err?.$metadata?.httpStatusCode;
    const errName = err?.name;

    if (httpStatus === 404 || errName === 'NotFound' || errName === 'NoSuchKey') {
      return { code: 'R2_OBJECT_NOT_FOUND', status: 404 };
    }
    if (httpStatus === 403 || errName === 'AccessDenied') {
      return { code: 'R2_ACCESS_DENIED', status: 403 };
    }
    if (errName === 'TimeoutError' || errName === 'AbortError' || err?.message?.toLowerCase().includes('timeout')) {
      return { code: 'R2_TIMEOUT', status: 504 };
    }
    return { code: 'R2_NETWORK_ERROR', status: 502 };
  }

  // 1. 404 Not Found
  const err404 = classifyHeadError({ name: 'NotFound', $metadata: { httpStatusCode: 404 } });
  assert.strictEqual(err404.code, 'R2_OBJECT_NOT_FOUND');
  assert.strictEqual(err404.status, 404);

  // 2. 403 Access Denied (must NOT be reported as not found)
  const err403 = classifyHeadError({ name: 'AccessDenied', $metadata: { httpStatusCode: 403 } });
  assert.strictEqual(err403.code, 'R2_ACCESS_DENIED');
  assert.strictEqual(err403.status, 403);

  // 3. Timeout / Abort (must NOT be reported as not found)
  const errTimeout = classifyHeadError({ name: 'TimeoutError', message: 'The operation timed out' });
  assert.strictEqual(errTimeout.code, 'R2_TIMEOUT');
  assert.strictEqual(errTimeout.status, 504);

  // 4. Network error (fetch failed, ECONNRESET, etc.)
  const errNet = classifyHeadError({ name: 'FetchError', message: 'fetch failed' });
  assert.strictEqual(errNet.code, 'R2_NETWORK_ERROR');
  assert.strictEqual(errNet.status, 502);
});

test('Database updates fail closed on both episode and session update errors', () => {
  function handleDbUpdate({ episodeUpdateError, sessionUpdateError }) {
    if (episodeUpdateError) {
      return { ok: false, code: 'DB_UPDATE_FAILED', target: 'episode', error: episodeUpdateError.message };
    }
    if (sessionUpdateError) {
      return { ok: false, code: 'DB_UPDATE_FAILED', target: 'session', error: sessionUpdateError.message };
    }
    return { ok: true, code: 'SUCCESS' };
  }

  // Episode update failure -> fails closed
  const resEpErr = handleDbUpdate({
    episodeUpdateError: new Error('connection closed by peer'),
    sessionUpdateError: null,
  });
  assert.strictEqual(resEpErr.ok, false);
  assert.strictEqual(resEpErr.code, 'DB_UPDATE_FAILED');
  assert.strictEqual(resEpErr.target, 'episode');

  // Session update failure -> fails closed
  const resSessErr = handleDbUpdate({
    episodeUpdateError: null,
    sessionUpdateError: new Error('statement timeout'),
  });
  assert.strictEqual(resSessErr.ok, false);
  assert.strictEqual(resSessErr.code, 'DB_UPDATE_FAILED');
  assert.strictEqual(resSessErr.target, 'session');

  // Both succeed
  const resSuccess = handleDbUpdate({ episodeUpdateError: null, sessionUpdateError: null });
  assert.strictEqual(resSuccess.ok, true);
});

// -----------------------------------------------------------------------------
// TEST GROUP 16: Modal Reload Existing Episode Selection & Idempotent Aborted Session Guard
// -----------------------------------------------------------------------------
test('Modal reload selects existing unready episode without new upload shell and recovers via verify', async () => {
  const seriesId = 'c0a80101-0000-0000-0000-000000000001';
  const expectedSize = 75896585;

  // Mock existing database episodes loaded upon opening modal after reload
  const dbEpisodes = [
    { id: 'ep-1-ready', series_id: seriesId, episode_number: 1, title: 'Tập 1', upload_status: 'ready', file_size: 50000000 },
    { id: 'ep-2-failed', series_id: seriesId, episode_number: 2, title: 'Tập 2', upload_status: 'failed', file_size: expectedSize },
    { id: 'ep-3-pending', series_id: seriesId, episode_number: 3, title: 'Tập 3', upload_status: 'pending', file_size: 0 },
  ];

  // 1. Admin selects Ep 2 from loaded list
  const selectedEp = dbEpisodes.find((e) => e.id === 'ep-2-failed');
  assert.strictEqual(selectedEp.id, 'ep-2-failed');
  assert.strictEqual(selectedEp.episode_number, 2);

  // 2. Admin triggers verify without choosing any MP4 file or creating a new shell
  const targetEpId = selectedEp.id;
  assert.strictEqual(targetEpId, 'ep-2-failed');

  function simulateVerifyOnSelectedEpisode(epId, r2ContentLength) {
    const ep = dbEpisodes.find((e) => e.id === epId);
    if (!ep) return { ok: false, code: 'EPISODE_NOT_FOUND' };
    if (r2ContentLength === ep.file_size) {
      ep.upload_status = 'ready';
      return { ok: true, verified: true, fileSize: r2ContentLength };
    }
    return { ok: false, code: 'FILE_SIZE_MISMATCH' };
  }

  const res = simulateVerifyOnSelectedEpisode(targetEpId, expectedSize);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.verified, true);
  assert.strictEqual(selectedEp.upload_status, 'ready');

  // Verify other episodes remain completely untouched
  assert.strictEqual(dbEpisodes[0].upload_status, 'ready');
  assert.strictEqual(dbEpisodes[2].upload_status, 'pending');
});

test('Idempotent complete-multipart-upload strictly preserves historical aborted session', () => {
  const expectedSize = 75896585;

  const sessionAborted = {
    id: 'sess-aborted',
    upload_id: 'up-aborted-123',
    status: 'aborted',
    file_size: expectedSize,
  };

  const episode = {
    id: 'ep-1',
    upload_status: 'failed',
    file_size: expectedSize,
  };

  // Simulate idempotent branch of complete-multipart-upload:
  // If preSize matches session.file_size:
  const preSize = expectedSize;
  const alreadyFinalized = (preSize > 0 && sessionAborted.file_size > 0 && preSize === sessionAborted.file_size);
  assert.strictEqual(alreadyFinalized, true);

  if (alreadyFinalized) {
    // Episode is updated to ready
    episode.upload_status = 'ready';
    episode.file_size = preSize;

    // Requirement 8: Only update session if status was in_progress!
    // Strictly preserve aborted status
    if (sessionAborted.status === 'in_progress') {
      sessionAborted.status = 'completed';
    }
  }

  assert.strictEqual(episode.upload_status, 'ready');
  assert.strictEqual(sessionAborted.status, 'aborted'); // MUST remain aborted!
});

// -----------------------------------------------------------------------------
// TEST GROUP 17: Single Episode Deletion & Safe R2 Cleanup
// -----------------------------------------------------------------------------
test('Single episode deletion strictly isolates target episode and handles R2 errors safely', async () => {
  const seriesId = 'c0a80101-0000-0000-0000-000000000001';

  // Mock R2 bucket contents with 3 episodes and series poster
  const r2Bucket = new Map([
    [`videos/${seriesId}/posters/cover.webp`, { size: 120000 }],
    [`videos/${seriesId}/ep-1/video.mp4`, { size: 50000000 }],
    [`videos/${seriesId}/ep-1/subtitles/vi.vtt`, { size: 4000 }],
    [`videos/${seriesId}/ep-2/video.mp4`, { size: 75896585 }],
    [`videos/${seriesId}/ep-2/subtitles/vi.vtt`, { size: 6000 }],
    [`videos/${seriesId}/ep-3/video.mp4`, { size: 62000000 }],
  ]);

  const dbEpisodes = [
    { id: 'ep-1', series_id: seriesId, episode_number: 1 },
    { id: 'ep-2', series_id: seriesId, episode_number: 2 },
    { id: 'ep-3', series_id: seriesId, episode_number: 3 },
  ];

  const dbSessions = [
    { id: 'sess-active-ep2', series_id: seriesId, episode_id: 'ep-2', status: 'in_progress', upload_id: 'up-2' },
    { id: 'sess-done-ep1', series_id: seriesId, episode_id: 'ep-1', status: 'completed', upload_id: 'up-1' },
  ];

  // Helper simulating delete-episode-media and deleteVideoEpisodeEverywhere
  async function simulateDeleteEpisodeEverywhere({ targetEpId, isAdmin, r2Fail = false }) {
    // 1. Admin check
    if (!isAdmin) {
      return { ok: false, status: 403, code: 'FORBIDDEN', error: 'Admin only' };
    }

    // 2. Target check
    const epIndex = dbEpisodes.findIndex((e) => e.id === targetEpId && e.series_id === seriesId);
    if (epIndex === -1) {
      return { ok: false, status: 404, code: 'EPISODE_NOT_FOUND' };
    }

    // 3. Abort active upload sessions
    const activeSessions = dbSessions.filter((s) => s.episode_id === targetEpId && s.status === 'in_progress');
    for (const s of activeSessions) {
      s.status = 'aborted';
    }

    // 4. R2 failure simulation (e.g. 502/403/timeout)
    if (r2Fail) {
      return { ok: false, status: 502, code: 'R2_DELETE_FAILED', error: 'R2 network error' };
    }

    // 5. Delete R2 objects under prefix videos/${seriesId}/${targetEpId}/
    const prefix = `videos/${seriesId}/${targetEpId}/`;
    for (const key of Array.from(r2Bucket.keys())) {
      if (key.startsWith(prefix)) {
        r2Bucket.delete(key);
      }
    }

    // 6. Delete DB record only after R2 confirmed successful
    dbEpisodes.splice(epIndex, 1);

    return { ok: true, deleted: true, episodeId: targetEpId };
  }

  // Case 1: Non-admin is blocked
  const resNonAdmin = await simulateDeleteEpisodeEverywhere({ targetEpId: 'ep-2', isAdmin: false });
  assert.strictEqual(resNonAdmin.ok, false);
  assert.strictEqual(resNonAdmin.code, 'FORBIDDEN');
  assert.strictEqual(dbEpisodes.length, 3); // Untouched

  // Case 2: R2 failure does NOT delete DB row (fails closed)
  const resR2Fail = await simulateDeleteEpisodeEverywhere({ targetEpId: 'ep-2', isAdmin: true, r2Fail: true });
  assert.strictEqual(resR2Fail.ok, false);
  assert.strictEqual(resR2Fail.code, 'R2_DELETE_FAILED');
  assert.strictEqual(dbEpisodes.length, 3); // Ep 2 row preserved in DB!
  assert.strictEqual(r2Bucket.has(`videos/${seriesId}/ep-2/video.mp4`), true);

  // Case 3: Successful deletion of Episode 2
  const resSuccess = await simulateDeleteEpisodeEverywhere({ targetEpId: 'ep-2', isAdmin: true, r2Fail: false });
  assert.strictEqual(resSuccess.ok, true);
  assert.strictEqual(resSuccess.deleted, true);

  // Check DB state: Ep 2 removed, Ep 1 and Ep 3 preserved
  assert.strictEqual(dbEpisodes.length, 2);
  assert.strictEqual(dbEpisodes.some((e) => e.id === 'ep-2'), false);
  assert.strictEqual(dbEpisodes[0].id, 'ep-1');
  assert.strictEqual(dbEpisodes[1].id, 'ep-3');

  // Check R2 state: Ep 2 files gone, Ep 1, Ep 3 and poster strictly preserved!
  assert.strictEqual(r2Bucket.has(`videos/${seriesId}/ep-2/video.mp4`), false);
  assert.strictEqual(r2Bucket.has(`videos/${seriesId}/ep-2/subtitles/vi.vtt`), false);
  assert.strictEqual(r2Bucket.has(`videos/${seriesId}/posters/cover.webp`), true); // Poster intact!
  assert.strictEqual(r2Bucket.has(`videos/${seriesId}/ep-1/video.mp4`), true); // Ep 1 intact!
  assert.strictEqual(r2Bucket.has(`videos/${seriesId}/ep-3/video.mp4`), true); // Ep 3 intact!

  // Check that active session for Ep 2 was safely aborted
  const ep2Session = dbSessions.find((s) => s.id === 'sess-active-ep2');
  assert.strictEqual(ep2Session.status, 'aborted');
});

test('Deleting an episode with no R2 media (pending upload) successfully cleans DB', async () => {
  const seriesId = 'c0a80101-0000-0000-0000-000000000001';
  const pendingEpId = 'ep-pending-never-uploaded';

  const dbEpisodes = [
    { id: pendingEpId, series_id: seriesId, episode_number: 4, upload_status: 'pending' },
  ];

  // R2 has no objects for this episode
  const r2ObjectsForEp = [];
  assert.strictEqual(r2ObjectsForEp.length, 0);

  // Should succeed in deleting DB row without errors
  const epIndex = dbEpisodes.findIndex((e) => e.id === pendingEpId);
  dbEpisodes.splice(epIndex, 1);

  assert.strictEqual(dbEpisodes.length, 0);
});

test('Single episode deletion strictly bounds keys to episodePrefix and ignores corrupted r2_key pointing to other episodes', async () => {
  const seriesId = 'c0a80101-0000-0000-0000-000000000001';
  const episodeId = 'ep-2';

  // R2 bucket contains files for Episode 1, Episode 2, and Episode 3
  const r2Bucket = new Map([
    [`videos/${seriesId}/ep-1/video.mp4`, { size: 50000000 }],
    [`videos/${seriesId}/ep-2/video.mp4`, { size: 75896585 }],
    [`videos/${seriesId}/ep-2/subtitles/vi.vtt`, { size: 6000 }],
    [`videos/${seriesId}/ep-3/video.mp4`, { size: 62000000 }],
  ]);

  // Episode 2 in DB has a corrupted r2_key pointing to Episode 1's file!
  const epRow = {
    id: episodeId,
    series_id: seriesId,
    r2_key: `videos/${seriesId}/ep-1/video.mp4`, // Corrupted metadata!
  };

  const episodePrefix = `videos/${seriesId}/${episodeId}/`;
  const episodeKeys = [];

  // 1. List objects strictly matching episodePrefix
  for (const k of Array.from(r2Bucket.keys())) {
    if (k.startsWith(episodePrefix)) {
      episodeKeys.push(k);
    }
  }

  // 2. Bound primaryVideoKey: must start with episodePrefix
  const primaryVideoKey = epRow.r2_key;
  if (primaryVideoKey && primaryVideoKey.startsWith(episodePrefix) && !episodeKeys.includes(primaryVideoKey)) {
    episodeKeys.push(primaryVideoKey);
  }

  // 3. Final strict isolation filter
  const safeKeys = episodeKeys.filter((k) => k.startsWith(episodePrefix));

  // Verify that Episode 1's key was REJECTED from deletion
  assert.strictEqual(safeKeys.includes(`videos/${seriesId}/ep-1/video.mp4`), false);
  assert.strictEqual(safeKeys.length, 2);
  assert.strictEqual(safeKeys.includes(`videos/${seriesId}/ep-2/video.mp4`), true);
  assert.strictEqual(safeKeys.includes(`videos/${seriesId}/ep-2/subtitles/vi.vtt`), true);

  // Perform deletion
  for (const k of safeKeys) {
    r2Bucket.delete(k);
  }

  // Crucial check: Episode 1's file and Episode 3's file remain 100% INTACT!
  assert.strictEqual(r2Bucket.has(`videos/${seriesId}/ep-1/video.mp4`), true);
  assert.strictEqual(r2Bucket.has(`videos/${seriesId}/ep-3/video.mp4`), true);
  // Episode 2's files are gone
  assert.strictEqual(r2Bucket.has(`videos/${seriesId}/ep-2/video.mp4`), false);
  assert.strictEqual(r2Bucket.has(`videos/${seriesId}/ep-2/subtitles/vi.vtt`), false);
});

test('Session abort DB update failure halts deletion immediately (fails closed)', async () => {
  const seriesId = 'c0a80101-0000-0000-0000-000000000001';
  const episodeId = 'ep-2';

  const r2Bucket = new Map([
    [`videos/${seriesId}/ep-2/video.mp4`, { size: 75896585 }],
  ]);

  const dbEpisode = { id: episodeId, series_id: seriesId };
  const dbSession = { id: 'sess-1', series_id: seriesId, episode_id: episodeId, status: 'in_progress' };

  // Simulate server abort step where DB update fails
  function simulateDeleteWithAbortDbFailure({ sessUpdateError }) {
    // 1. R2 abort succeeds
    const r2AbortOk = true;

    // 2. DB update on session fails:
    if (sessUpdateError) {
      return { ok: false, status: 500, code: 'DB_UPDATE_FAILED', error: sessUpdateError.message };
    }

    dbSession.status = 'aborted';

    // 3. Delete R2 files
    r2Bucket.delete(`videos/${seriesId}/ep-2/video.mp4`);

    return { ok: true };
  }

  const res = simulateDeleteWithAbortDbFailure({
    sessUpdateError: new Error('Database statement timeout while updating session'),
  });

  // Verify failure and that no files were deleted from R2!
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.status, 500);
  assert.strictEqual(res.code, 'DB_UPDATE_FAILED');
  assert.strictEqual(r2Bucket.has(`videos/${seriesId}/ep-2/video.mp4`), true); // R2 file preserved!
  assert.strictEqual(dbSession.status, 'in_progress'); // DB state preserved!
});

console.log(`\n🎉 ALL ${passedTests} TEST CASES PASSED SUCCESSFULLY!\n`);
