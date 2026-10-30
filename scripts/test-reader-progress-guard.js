/**
 * scripts/test-reader-progress-guard.js
 *
 * Kiểm thử toàn diện ma trận bảo vệ tiến độ đọc:
 * 1. Ma trận quyết định hành động mở trang lần đầu (decideInitialOpenAction)
 * 2. Ma trận quyền ghi tiến độ (canWriteProgress)
 * 3. Mô phỏng kịch bản lỗi thực tế (passive reload ch3 không đè ch36 trên cloud)
 * 4. Kịch bản người dùng bấm "Quay lại vị trí cũ"
 */

import assert from 'node:assert';
import {
  decideInitialOpenAction,
  canWriteProgress,
  hasSavedAuthSession,
  shouldWaitForInitialPull,
} from '../src/lib/readerProgressGuard.js';

console.log('=== BẮT ĐẦU KIỂM THỬ READER PROGRESS GUARD ===\n');

let passedTests = 0;
function test(name, fn) {
  try {
    fn();
    passedTests++;
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ FAILED: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 1. Ma trận kiểm thử decideInitialOpenAction
// ---------------------------------------------------------------------------
test('1.1: default + chưa engaged + pull chương khác -> "jump"', () => {
  const result = decideInitialOpenAction({
    locationKey: 'default',
    urlChapterId: 'ch3',
    hasEngaged: false,
    pullResult: {
      updated: true,
      data: { chapterId: 'ch36', percent: 0.45 },
    },
  });
  assert.strictEqual(result, 'jump');
});

test('1.2: default + đã engaged + pull chương khác -> "propose"', () => {
  const result = decideInitialOpenAction({
    locationKey: 'default',
    urlChapterId: 'ch3',
    hasEngaged: true,
    pullResult: {
      updated: true,
      data: { chapterId: 'ch36', percent: 0.45 },
    },
  });
  assert.strictEqual(result, 'propose');
});

test('1.3: default + pull cùng chương -> "stay"', () => {
  const result = decideInitialOpenAction({
    locationKey: 'default',
    urlChapterId: 'ch3',
    hasEngaged: false,
    pullResult: {
      updated: true,
      data: { chapterId: 'ch3', percent: 0.2 },
    },
  });
  assert.strictEqual(result, 'stay');
});

test('1.4: default + pull thất bại / lỗi mạng / timeout -> "stay"', () => {
  const errResult = decideInitialOpenAction({
    locationKey: 'default',
    urlChapterId: 'ch3',
    hasEngaged: false,
    pullResult: { updated: false, error: 'Timeout 2.5s' },
  });
  assert.strictEqual(errResult, 'stay');

  const nullResult = decideInitialOpenAction({
    locationKey: 'default',
    urlChapterId: 'ch3',
    hasEngaged: false,
    pullResult: null,
  });
  assert.strictEqual(nullResult, 'stay');
});

test('1.5: default + pull không có bản cập nhật mới (updated = false) -> "stay"', () => {
  const result = decideInitialOpenAction({
    locationKey: 'default',
    urlChapterId: 'ch3',
    hasEngaged: false,
    pullResult: {
      updated: false,
      data: { chapterId: 'ch36' },
    },
  });
  assert.strictEqual(result, 'stay');
});

test('1.6: key khác "default" (điều hướng trong app) -> không bao giờ jump, luôn trả về "stay"', () => {
  // Bấm chương trong danh sách
  const navResult1 = decideInitialOpenAction({
    locationKey: 'nav_key_123',
    urlChapterId: 'ch3',
    hasEngaged: false,
    pullResult: { updated: true, data: { chapterId: 'ch36' } },
  });
  assert.strictEqual(navResult1, 'stay');

  // Điều hướng đã engaged
  const navResult2 = decideInitialOpenAction({
    locationKey: 'nav_key_456',
    urlChapterId: 'ch3',
    hasEngaged: true,
    pullResult: { updated: true, data: { chapterId: 'ch36' } },
  });
  assert.strictEqual(navResult2, 'stay');
});

// ---------------------------------------------------------------------------
// 2. Ma trận kiểm thử canWriteProgress
// ---------------------------------------------------------------------------
test('2.1: key khác "default" -> canWriteProgress luôn true trong mọi trường hợp', () => {
  assert.strictEqual(canWriteProgress({ locationKey: 'route_abc', pullProgressDone: false, hasEngaged: false }), true);
  assert.strictEqual(canWriteProgress({ locationKey: 'route_abc', pullProgressDone: true, hasEngaged: false }), true);
  assert.strictEqual(canWriteProgress({ locationKey: 'route_abc', pullProgressDone: false, hasEngaged: true }), true);
  assert.strictEqual(canWriteProgress({ locationKey: 'route_abc', pullProgressDone: true, hasEngaged: true }), true);
});

test('2.2: default + pullProgressDone = false -> canWriteProgress = false kể cả đã engaged', () => {
  assert.strictEqual(canWriteProgress({ locationKey: 'default', pullProgressDone: false, hasEngaged: false }), false);
  assert.strictEqual(canWriteProgress({ locationKey: 'default', pullProgressDone: false, hasEngaged: true }), false);
});

test('2.3: default + pullProgressDone = true + chưa engaged -> canWriteProgress = false', () => {
  assert.strictEqual(canWriteProgress({ locationKey: 'default', pullProgressDone: true, hasEngaged: false }), false);
});

test('2.4: default + pullProgressDone = true + đã engaged -> canWriteProgress = true', () => {
  assert.strictEqual(canWriteProgress({ locationKey: 'default', pullProgressDone: true, hasEngaged: true }), true);
});

// ---------------------------------------------------------------------------
// 3. Kiểm thử kịch bản lỗi thực tế (Passive Open Overwrites Cloud Progress)
// ---------------------------------------------------------------------------
test('3.1: Mô phỏng điện thoại reload ch3, Cloud đang ở ch36 -> Cloud không bị ghi đè, tự nhảy sang ch36', () => {
  // Giả lập trạng thái
  let localProgress = { novelId: 'novel_1', chapterId: 'ch3', percent: 0, updatedAt: 1000 };
  const cloudProgress = { chapterId: 'ch36', percent: 0.72, updatedAt: 2000 };

  let ch3WriteCount = 0;
  let ch3FlushCount = 0;

  // Giả lập các hàm ghi
  const mockSaveReadingProgress = (novelId, data) => {
    if (data.chapterId === 'ch3') ch3WriteCount++;
    localProgress = { novelId, ...data, updatedAt: Date.now() };
  };
  const mockFlushReadingProgress = () => {
    if (localProgress.chapterId === 'ch3') ch3FlushCount++;
  };

  // Mở trang lần đầu (locationKey = 'default', chưa engaged)
  const locationKey = 'default';
  let pullProgressDone = false;
  let hasEngaged = false;
  let currentChapter = { id: 'ch3', title: 'Chương 3' };

  // 1. Component mount: Effect "Reset timer on chapter change & save reading progress" kích hoạt
  if (canWriteProgress({ locationKey, pullProgressDone, hasEngaged })) {
    mockSaveReadingProgress('novel_1', { chapterId: currentChapter.id, percent: 0, scrollTop: 0 });
    mockFlushReadingProgress();
  }

  // Khẳng định: Lúc này chưa được phép ghi gì cho ch3
  assert.strictEqual(ch3WriteCount, 0, 'Không được ghi ch3 lúc mount khi chưa pull xong');
  assert.strictEqual(ch3FlushCount, 0, 'Không được flush ch3 lên cloud');

  // 2. Kéo tiến độ từ Cloud về hoàn tất (Cloud trả về ch36 mới hơn)
  const pullResult = { updated: true, data: cloudProgress, cloudUpdatedAt: 2000 };
  pullProgressDone = true;
  localProgress = { novelId: 'novel_1', ...cloudProgress }; // applyCloudReadingProgress

  const action = decideInitialOpenAction({
    locationKey,
    urlChapterId: currentChapter.id,
    hasEngaged,
    pullResult,
  });

  assert.strictEqual(action, 'jump', 'Hành động phải là tự động jump sang ch36');

  // 3. Thực hiện jump: chuyển URL sang ch36
  currentChapter = { id: 'ch36', title: 'Chương 36' };

  // 4. Giả sử người dùng tắt tab ngay sau đó (beforeunload / unmount) mà không chạm vào màn hình
  if (canWriteProgress({ locationKey, pullProgressDone, hasEngaged })) {
    mockSaveReadingProgress('novel_1', { chapterId: currentChapter.id, percent: 0 });
    mockFlushReadingProgress();
  }

  // Kết quả cuối cùng: ch3 chưa bao giờ bị ghi đè lên cloud!
  assert.strictEqual(ch3WriteCount, 0, 'Tổng số lần ghi ch3 phải là 0');
  assert.strictEqual(ch3FlushCount, 0, 'Tổng số lần flush ch3 phải là 0');
  assert.strictEqual(localProgress.chapterId, 'ch36', 'Tiến độ cuối cùng phải là ch36 của cloud');
});

test('3.2: Người dùng bấm "Quay lại vị trí cũ" -> chuyển về ch3 bằng điều hướng chủ động, lúc này mới ghi nhận', () => {
  let localProgress = { novelId: 'novel_1', chapterId: 'ch36', percent: 0.72 };
  let ch3WriteCount = 0;

  const mockSaveReadingProgress = (novelId, data) => {
    if (data.chapterId === 'ch3') ch3WriteCount++;
    localProgress = { novelId, ...data };
  };

  // Người dùng bấm nút "Quay lại vị trí cũ" trên syncToast -> navigate('/read/ch3')
  // Đây là điều hướng trong app -> locationKey KHÁC 'default'
  const inAppLocationKey = 'revert_action_789';
  const pullProgressDone = true;
  const hasEngaged = false; // Không cần chờ tương tác vì đây là thao tác chủ động

  assert.strictEqual(
    canWriteProgress({ locationKey: inAppLocationKey, pullProgressDone, hasEngaged }),
    true,
    'Điều hướng trong app phải cho phép ghi tiến độ'
  );

  // Ghi nhận tiến độ khi quay lại ch3
  mockSaveReadingProgress('novel_1', { chapterId: 'ch3', percent: 0, scrollTop: 0 });
  assert.strictEqual(ch3WriteCount, 1);
  assert.strictEqual(localProgress.chapterId, 'ch3');
});

console.log(`\n🎉 TOÀN BỘ ${passedTests} BÀI KIỂM THỬ READER PROGRESS GUARD ĐÃ VƯỢT QUA!`);
