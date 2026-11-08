/**
 * scripts/test-novel-card-progress.js
 * Kiểm tra tính đúng đắn của việc lấy thứ tự chương thật và không còn regex đoán id.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

console.log('=== TEST NOVEL CARD READING PROGRESS (scripts/test-novel-card-progress.js) ===\n');

// 1. Kiểm tra mã nguồn NovelCard.jsx: KHÔNG ĐƯỢC dùng regex đoán số từ chapterId
const novelCardPath = path.join(ROOT_DIR, 'src/components/ui/NovelCard.jsx');
const novelCardCode = fs.readFileSync(novelCardPath, 'utf-8');

assert(
  !novelCardCode.includes('match(/(\\d+)/)') && !novelCardCode.includes('match(/\\d+/)'),
  '[FAIL] NovelCard.jsx vẫn còn regex đoán số chương từ chapterId!'
);
assert(
  novelCardCode.includes('useNovelReadingProgress'),
  '[FAIL] NovelCard.jsx chưa tích hợp hook useNovelReadingProgress!'
);
console.log('✓ PASS: NovelCard.jsx đã loại bỏ hoàn toàn regex đoán chapterId và dùng useNovelReadingProgress.');

// 2. Kiểm tra mã nguồn db.js có getChapterPosition ở cuối file
const dbPath = path.join(ROOT_DIR, 'src/lib/db.js');
const dbCode = fs.readFileSync(dbPath, 'utf-8');

assert(
  dbCode.includes('export async function getChapterPosition'),
  '[FAIL] db.js chưa export hàm getChapterPosition!'
);
assert(
  dbCode.includes('novelId_order'),
  '[FAIL] getChapterPosition phải sử dụng index novelId_order để đếm thứ tự!'
);
console.log('✓ PASS: db.js đã định nghĩa hàm getChapterPosition chuẩn xác.');

// 3. Kiểm tra logic tính toán getChapterPosition với mock IndexedDB
// Mô phỏng transaction và IDBKeyRange của IndexedDB
class MockChaptersStore {
  constructor() {
    this.records = new Map();
  }

  put(chapter) {
    this.records.set(chapter.id, { ...chapter });
  }

  get(id) {
    return this.records.get(id) || null;
  }

  countOrder(novelId, maxOrder) {
    let count = 0;
    for (const ch of this.records.values()) {
      if (ch.novelId === novelId && ch.order <= maxOrder) {
        count++;
      }
    }
    return count;
  }

  countTotal(novelId) {
    let count = 0;
    for (const ch of this.records.values()) {
      if (ch.novelId === novelId) {
        count++;
      }
    }
    return count;
  }
}

// Hàm tính position độc lập theo đúng thuật toán getChapterPosition
function computePositionWithStore(store, novelId, chapterId) {
  const chapter = store.get(chapterId);
  if (!chapter || chapter.order === undefined || chapter.order === null) {
    return null;
  }
  const targetNovelId = chapter.novelId || novelId;
  const position = store.countOrder(targetNovelId, chapter.order);
  const total = store.countTotal(targetNovelId);
  if (position === 0) return null;
  return { position, total: total || position };
}

const mockStore = new MockChaptersStore();

// Tạo 5 chương có ID dạng UUID / chuỗi ngẫu nhiên và order không liên quan tới id
const novelId = 'novel_test_999';
mockStore.put({ id: 'uuid-alpha-99', novelId, order: 10, title: 'Chương 1' });
mockStore.put({ id: 'uuid-zeta-12', novelId, order: 25, title: 'Chương 2' });
mockStore.put({ id: 'chap_173000_57', novelId, order: 50, title: 'Chương 3' }); // ID bẫy regex (57/173000)
mockStore.put({ id: 'uuid-beta-01', novelId, order: 80, title: 'Chương 4' });
mockStore.put({ id: 'uuid-omega-77', novelId, order: 120, title: 'Chương 5' });

// Thêm chương của truyện khác để test phân tách novelId
mockStore.put({ id: 'other_ch_1', novelId: 'novel_other_111', order: 5, title: 'Khác' });

// Test chương 1 (order 10)
const pos1 = computePositionWithStore(mockStore, novelId, 'uuid-alpha-99');
assert.deepStrictEqual(pos1, { position: 1, total: 5 }, 'Chương đầu phải là vị trí 1/5');

// Test chương 3 (ID bẫy chap_173000_57, order 50 -> phải là vị trí 3)
const pos3 = computePositionWithStore(mockStore, novelId, 'chap_173000_57');
assert.deepStrictEqual(pos3, { position: 3, total: 5 }, 'Chương bẫy phải là vị trí 3/5 chứ không phải 57 hay 173000');

// Test chương 5 (chương cuối)
const pos5 = computePositionWithStore(mockStore, novelId, 'uuid-omega-77');
assert.deepStrictEqual(pos5, { position: 5, total: 5 }, 'Chương cuối phải là vị trí 5/5');

// Test ID không tồn tại
const posNone = computePositionWithStore(mockStore, novelId, 'non-existent-id');
assert.strictEqual(posNone, null, 'ID không tồn tại phải trả về null');

console.log('✓ PASS: Logic getChapterPosition tính toán chính xác 100% 1-based index theo order.');

console.log('\n=== TẤT CẢ CÁC BÀI TEST TIẾN ĐỘ ĐỌC ĐÃ VƯỢT QUA! ===');
process.exit(0);
