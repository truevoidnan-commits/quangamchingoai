/**
 * scripts/test-sync-ledger-unification.js
 * 
 * Kiểm thử tính thống nhất của điểm đồng bộ nội dung (content sync point)
 * giữa manual sync và autoSync:
 * - Sau khi manual PULL thì autoSync không bị ngộ nhận "Cloud có nội dung mới hơn".
 * - Sau khi PUSH thì PULL không bị đảo lộn hoặc reset về 0.
 * - getContentSyncPoint, recordContentPulled, recordContentPushed bảo đảm tính đơn điệu không giảm.
 */

import assert from 'assert';
import {
  getContentSyncPoint,
  recordContentPulled,
  recordContentPushed,
  getSyncLedger,
  saveSyncLedger,
} from '../src/lib/sync/syncLedger.js';

// Setup Mock localStorage
class LocalStorageMock {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

global.localStorage = new LocalStorageMock();

console.log('=== BẮT ĐẦU TEST ĐIỂM ĐỒNG BỘ NỘI DUNG (scripts/test-sync-ledger-unification.js) ===\n');

try {
  const novelId = 'novel_test_unification';

  // 1. Kiểm tra trạng thái rỗng
  console.log('--- Test 1: Khởi tạo rỗng ---');
  const emptyLedger = { novels: {} };
  assert.strictEqual(getContentSyncPoint(emptyLedger, novelId), 0, 'Ledger rỗng phải trả về sync point = 0');
  assert.strictEqual(getContentSyncPoint(null, novelId), 0, 'null ledger phải trả về 0');
  console.log('  ✓ Test 1 đạt: Trạng thái rỗng an toàn.\n');

  // 2. Kiểm tra recordContentPulled
  console.log('--- Test 2: Ghi nhận PULL nội dung ---');
  const ledger = { novels: {} };
  const pullTime1 = 1700100000000;
  recordContentPulled(ledger, novelId, pullTime1);

  assert.strictEqual(ledger.novels[novelId].lastPulledContentAt, pullTime1, 'lastPulledContentAt phải đúng pullTime1');
  assert.strictEqual(ledger.novels[novelId].lastPushedContentAt, pullTime1, 'lastPushedContentAt phải được nâng bằng pullTime1');
  assert.strictEqual(getContentSyncPoint(ledger, novelId), pullTime1, 'Sync point phải = pullTime1');
  console.log('  ✓ Test 2 đạt: PULL nâng cả 2 mốc đồng đều, không để lại mốc 0.\n');

  // 3. Giả lập kịch bản người dùng: Manual PULL xong đến AutoSync chạy
  console.log('--- Test 3: Kịch bản Manual PULL -> AutoSync kiểm tra nội dung Cloud ---');
  const cloudRow = {
    id: novelId,
    content_updated_at: pullTime1, // Cloud vẫn giữ thời điểm cũ
    updated_at: pullTime1,
  };

  // Logic kiểm tra của autoSync:
  const syncPoint = getContentSyncPoint(ledger, novelId);
  const cloudContentChanged = (cloudRow.content_updated_at || 0) > syncPoint;

  assert.strictEqual(cloudContentChanged, false, 'AutoSync KHÔNG được coi là cloud có nội dung mới hơn sau khi vừa manual PULL');
  console.log('  ✓ Test 3 đạt: AutoSync không bị ngộ nhận sau khi manual pull!\n');

  // 4. Kiểm tra recordContentPushed
  console.log('--- Test 4: Ghi nhận PUSH nội dung ---');
  const pushTime = 1700200000000;
  recordContentPushed(ledger, novelId, pushTime);

  assert.strictEqual(ledger.novels[novelId].lastPushedContentAt, pushTime, 'lastPushedContentAt phải = pushTime');
  assert.strictEqual(ledger.novels[novelId].lastPulledContentAt, pushTime, 'lastPulledContentAt phải được nâng lên pushTime');
  assert.strictEqual(getContentSyncPoint(ledger, novelId), pushTime, 'Sync point phải = pushTime');
  console.log('  ✓ Test 4 đạt: PUSH nâng cả 2 mốc đồng đều, không bao giờ reset trường kia về 0.\n');

  // 5. Kiểm tra tính đơn điệu không giảm khi có mốc thời gian cũ hơn truyền vào
  console.log('--- Test 5: Tính đơn điệu không giảm (Monotonicity) ---');
  const olderTime = 1700050000000; // Cũ hơn pushTime
  recordContentPulled(ledger, novelId, olderTime);
  assert.strictEqual(ledger.novels[novelId].lastPulledContentAt, pushTime, 'Không được giảm lastPulledContentAt khi gặp timestamp cũ');
  assert.strictEqual(ledger.novels[novelId].lastPushedContentAt, pushTime, 'Không được giảm lastPushedContentAt');

  recordContentPushed(ledger, novelId, olderTime);
  assert.strictEqual(ledger.novels[novelId].lastPushedContentAt, pushTime, 'Không được giảm lastPushedContentAt');
  assert.strictEqual(ledger.novels[novelId].lastPulledContentAt, pushTime, 'Không được giảm lastPulledContentAt');
  console.log('  ✓ Test 5 đạt: Điểm đồng bộ nội dung luôn đơn điệu tăng dần, miễn nhiễm lỗi lùi thời gian!\n');

  console.log('🎉 TẤT CẢ TEST ĐIỂM ĐỒNG BỘ NỘI DUNG ĐỀU ĐẠT 100%!');
  process.exit(0);
} catch (err) {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
}
