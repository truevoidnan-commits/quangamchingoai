/**
 * scripts/test-chapter-merge.js
 * 
 * Kiểm thử toàn diện hàm gộp chương thuần mergeChapterSets:
 * - Ca 1: 404 local + 437 cloud (404 chung + 33 mới) -> 437
 * - Ca 2: 437 local + 404 cloud -> 437
 * - Ca 3: Hai bên cùng sửa một chương (so sánh updatedAt, content length, tie breaking)
 * - Ca 4: Trùng order khác id -> giữ cả hai, ổn định thứ tự
 * - Ca 5: Hai chương khác id nhưng cùng title & content -> dedupe chỉ giữ 1
 * - Ca 6: Mảng rỗng một bên hoặc cả hai bên
 * - Ca 7: Bất biến: Không bao giờ giảm số chương
 */

import assert from 'assert';
import { mergeChapterSets } from '../src/lib/sync/chapterMerge.js';

console.log('=== BẮT ĐẦU KIỂM THỬ HÀM GỘP CHƯƠNG (scripts/test-chapter-merge.js) ===\n');

try {
  // -------------------------------------------------------------
  // Test 1: Sự cố thực tế - 404 local + 437 cloud (404 chung + 33 mới trên cloud)
  // -------------------------------------------------------------
  console.log('--- Test 1: 404 local + 437 cloud (404 chung + 33 mới trên cloud) ---');
  const base404 = Array.from({ length: 404 }, (_, i) => ({
    id: `ch_${i + 1}`,
    novelId: 'novel_truyentay',
    title: `Chương ${i + 1}: Tiêu đề ${i + 1}`,
    content: `Nội dung chương ${i + 1} của bộ truyện...`,
    order: i,
    createdAt: 1700000000000 + i * 1000,
  }));

  const cloud437 = [
    ...base404,
    ...Array.from({ length: 33 }, (_, i) => ({
      id: `ch_${405 + i}`,
      novelId: 'novel_truyentay',
      title: `Chương ${405 + i}: Tiêu đề mới ${405 + i}`,
      content: `Nội dung mới từ máy tính chương ${405 + i}...`,
      order: 404 + i,
      createdAt: 1700100000000 + i * 1000,
    })),
  ];

  const res1 = mergeChapterSets(base404, cloud437);
  assert.strictEqual(res1.merged.length, 437, 'Tổng số chương sau gộp phải đúng 437');
  assert.strictEqual(res1.addedFromCloud, 33, 'Phải thêm đúng 33 chương từ cloud');
  assert.strictEqual(res1.addedFromLocal, 0, 'Không thêm chương nào từ local');
  // Kiểm tra thứ tự và ID liên tục
  for (let i = 0; i < 437; i++) {
    assert.strictEqual(res1.merged[i].order, i, `Thứ tự chương ${i} phải liên tục`);
    assert.strictEqual(res1.merged[i].id, `ch_${i + 1}`, `ID chương ${i} phải khớp`);
  }
  console.log('  ✓ Test 1 đạt: 404 local + 437 cloud -> 437 chương trọn vẹn, không mất chương nào!');

  // -------------------------------------------------------------
  // Test 2: Ngược lại - 437 local + 404 cloud
  // -------------------------------------------------------------
  console.log('\n--- Test 2: 437 local + 404 cloud ---');
  const res2 = mergeChapterSets(cloud437, base404);
  assert.strictEqual(res2.merged.length, 437, 'Tổng số chương sau gộp phải đúng 437');
  assert.strictEqual(res2.addedFromLocal, 33, 'Phải thêm đúng 33 chương từ local');
  assert.strictEqual(res2.addedFromCloud, 0, 'Không thêm chương nào từ cloud');
  console.log('  ✓ Test 2 đạt: 437 local + 404 cloud -> 437 chương trọn vẹn!');

  // -------------------------------------------------------------
  // Test 3: Cùng ID nhưng nội dung khác nhau (Chỉnh sửa trong Reader)
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Xung đột nội dung cùng ID (ưu tiên updatedAt và độ dài) ---');
  
  // 3a. Local có updatedAt mới hơn
  const localEdited = [{
    id: 'ch_1',
    title: 'Chương 1: Tiêu đề sửa',
    content: 'Nội dung người dùng đã sửa trên Reader máy tính',
    order: 0,
    updatedAt: 2000,
  }];
  const cloudOld = [{
    id: 'ch_1',
    title: 'Chương 1: Tiêu đề cũ',
    content: 'Nội dung cũ',
    order: 0,
    updatedAt: 1000,
  }];
  const res3a = mergeChapterSets(localEdited, cloudOld);
  assert.strictEqual(res3a.merged[0].content, localEdited[0].content, 'Local updatedAt lớn hơn phải thắng');
  assert.strictEqual(res3a.updatedFromLocal, 1);
  assert.strictEqual(res3a.conflictsResolved, 1);

  // 3b. Cloud có updatedAt mới hơn
  const cloudEdited = [{
    id: 'ch_1',
    title: 'Chương 1: Cloud sửa',
    content: 'Nội dung sửa từ Cloud',
    order: 0,
    updatedAt: 3000,
  }];
  const res3b = mergeChapterSets(localEdited, cloudEdited);
  assert.strictEqual(res3b.merged[0].content, cloudEdited[0].content, 'Cloud updatedAt lớn hơn phải thắng');
  assert.strictEqual(res3b.updatedFromCloud, 1);

  // 3c. Không có updatedAt, độ dài dài hơn thắng
  const localLonger = [{
    id: 'ch_2',
    title: 'Chương 2',
    content: 'Nội dung này rất dài và chi tiết hơn nhiều...',
    order: 1,
  }];
  const cloudShorter = [{
    id: 'ch_2',
    title: 'Chương 2',
    content: 'Nội dung ngắn',
    order: 1,
  }];
  const res3c = mergeChapterSets(localLonger, cloudShorter);
  assert.strictEqual(res3c.merged[0].content, localLonger[0].content, 'Content dài hơn phải thắng khi không có updatedAt');

  // 3d. Hòa nhau về mọi mặt -> preferLocalOnTie
  const localTie = [{ id: 'ch_3', title: 'Chương 3', content: 'ABC', order: 2 }];
  const cloudTie = [{ id: 'ch_3', title: 'Chương 3', content: 'XYZ', order: 2 }];
  const res3d = mergeChapterSets(localTie, cloudTie, { preferLocalOnTie: true });
  assert.strictEqual(res3d.merged[0].content, 'ABC', 'Khi hòa phải ưu tiên local khi preferLocalOnTie=true');

  console.log('  ✓ Test 3 đạt: Xung đột nội dung bảo toàn chỉnh sửa văn bản của người dùng chuẩn xác!');

  // -------------------------------------------------------------
  // Test 4: Trùng order khác ID (hai máy cùng thêm chương ở vị trí order 1)
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Trùng order khác ID ---');
  const localChs = [
    { id: 'ch_0', order: 0, title: 'Chương Mở Đầu', content: 'Intro' },
    { id: 'ch_local_1', order: 1, title: 'Chương 1 Local', content: 'Local 1', createdAt: 1000 },
  ];
  const cloudChs = [
    { id: 'ch_0', order: 0, title: 'Chương Mở Đầu', content: 'Intro' },
    { id: 'ch_cloud_1', order: 1, title: 'Chương 1 Cloud', content: 'Cloud 1', createdAt: 2000 },
  ];
  const res4 = mergeChapterSets(localChs, cloudChs);
  assert.strictEqual(res4.merged.length, 3, 'Phải giữ cả hai chương khi trùng order');
  // ch_0 -> order 0
  assert.strictEqual(res4.merged[0].id, 'ch_0');
  // ch_local_1 (createdAt 1000) giữ order 1
  assert.strictEqual(res4.merged[1].id, 'ch_local_1');
  assert.strictEqual(res4.merged[1].order, 1);
  // ch_cloud_1 (createdAt 2000, đến sau) nhận order = max + 1 = 2
  assert.strictEqual(res4.merged[2].id, 'ch_cloud_1');
  assert.strictEqual(res4.merged[2].order, 2);
  console.log('  ✓ Test 4 đạt: Trùng order giữ cả hai chương và phân giải thứ tự an toàn!');

  // -------------------------------------------------------------
  // Test 5: Hai chương khác ID nhưng cùng title & content -> Dedupe
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Dedupe chương trùng nội dung khác ID ---');
  const localDup = [
    { id: 'ch_local_abc', order: 0, title: 'Chương 1: Khởi Đầu', content: 'Nội dung y hệt nhau' },
  ];
  const cloudDup = [
    { id: 'ch_cloud_xyz', order: 0, title: 'Chương 1: Khởi Đầu', content: 'Nội dung y hệt nhau' },
  ];
  const res5 = mergeChapterSets(localDup, cloudDup);
  assert.strictEqual(res5.merged.length, 1, 'Chương cùng title và content phải được dedupe thành 1');
  assert.strictEqual(res5.merged[0].id, 'ch_local_abc', 'Dedupe giữ bản local');
  console.log('  ✓ Test 5 đạt: Dedupe thành công, không tạo chương rác trùng lặp!');

  // -------------------------------------------------------------
  // Test 6: Mảng rỗng một bên hoặc cả hai bên
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Mảng rỗng hoặc null ---');
  const res6a = mergeChapterSets([], cloud437);
  assert.strictEqual(res6a.merged.length, 437);
  assert.strictEqual(res6a.addedFromCloud, 437);

  const res6b = mergeChapterSets(base404, []);
  assert.strictEqual(res6b.merged.length, 404);
  assert.strictEqual(res6b.addedFromLocal, 404);

  const res6c = mergeChapterSets(null, undefined);
  assert.strictEqual(res6c.merged.length, 0);
  console.log('  ✓ Test 6 đạt: Xử lý an toàn mảng rỗng và giá trị null/undefined!');

  // -------------------------------------------------------------
  // Test 7: Bất biến số lượng chương
  // -------------------------------------------------------------
  console.log('\n--- Test 7: Kiểm tra bất biến số lượng chương không bao giờ giảm ---');
  for (let trial = 0; trial < 10; trial++) {
    const lCount = 10 + Math.floor(Math.random() * 50);
    const cCount = 10 + Math.floor(Math.random() * 50);
    const lArr = Array.from({ length: lCount }, (_, i) => ({
      id: `l_${i}`,
      title: `Tiêu đề L ${i}`,
      content: `Nội dung L ${i}`,
      order: i,
    }));
    const cArr = Array.from({ length: cCount }, (_, i) => ({
      id: `c_${i}`,
      title: `Tiêu đề C ${i}`,
      content: `Nội dung C ${i}`,
      order: i,
    }));
    const res7 = mergeChapterSets(lArr, cArr);
    assert(res7.merged.length >= Math.max(lCount, cCount), 'Số chương hợp nhất phải >= max(local, cloud)');
  }
  console.log('  ✓ Test 7 đạt: Bất biến số lượng chương không giảm luôn được đảm bảo 100%!');

  console.log('\n🎉 TẤT CẢ CÁC BÀI KIỂM THỬ GỘP CHƯƠNG ĐỀU VƯỢT QUA 100%!\n');
  process.exit(0);
} catch (err) {
  console.error('\n❌ KIỂM THỬ THẤT BẠI:', err);
  process.exit(1);
}
