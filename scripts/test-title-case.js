import assert from 'node:assert';
import { toTitleCaseVi } from '../src/lib/textFixer.js';

console.log('=== BẮT ĐẦU KIỂM THỬ TO TITLE CASE VI (scripts/test-title-case.js) ===\n');

let passedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    passedTests++;
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name} FAILED:`, err);
    process.exit(1);
  }
}

// 1. Kiểm tra cơ bản: "thâm uyên" -> "Thâm Uyên"
runTest('1. Cơ bản: "thâm uyên" -> "Thâm Uyên"', () => {
  assert.strictEqual(toTitleCaseVi('thâm uyên'), 'Thâm Uyên');
  assert.strictEqual(toTitleCaseVi('lửa đồng không cháy hết'), 'Lửa Đồng Không Cháy Hết');
  assert.strictEqual(toTitleCaseVi('đại đạo chí giản'), 'Đại Đạo Chí Giản');
});

// 2. Chuỗi hỗn hợp hoa/thường: "THÂM UYÊN" -> "Thâm Uyên", "tHâM uYêN" -> "Thâm Uyên"
runTest('2. Chuỗi hỗn hợp hoa/thường: "THÂM UYÊN" -> "Thâm Uyên"', () => {
  assert.strictEqual(toTitleCaseVi('THÂM UYÊN'), 'Thâm Uyên');
  assert.strictEqual(toTitleCaseVi('tHâM uYêN'), 'Thâm Uyên');
  assert.strictEqual(toTitleCaseVi('LỬA ĐỒNG KHÔNG CHÁY HẾT'), 'Lửa Đồng Không Cháy Hết');
  assert.strictEqual(toTitleCaseVi('ĐẠI ĐẠO CHÍ GIẢN'), 'Đại Đạo Chí Giản');
});

// 3. Chuỗi NFD: bảo toàn thanh điệu, không làm hỏng dấu
runTest('3. Chuỗi Unicode tổ hợp (NFD): bảo toàn đầy đủ dấu tiếng Việt', () => {
  const nfd1 = 'thâm uyên'.normalize('NFD');
  const result1 = toTitleCaseVi(nfd1);
  assert.strictEqual(result1, 'Thâm Uyên');
  assert.strictEqual(result1.normalize('NFC'), 'Thâm Uyên');

  const nfd2 = 'lửa đồng không cháy hết'.normalize('NFD');
  assert.strictEqual(toTitleCaseVi(nfd2), 'Lửa Đồng Không Cháy Hết');

  const nfd3 = 'đại đạo chí giản'.normalize('NFD');
  assert.strictEqual(toTitleCaseVi(nfd3), 'Đại Đạo Chí Giản');

  const nfdMixed = 'ĐẠI ĐẠO CHÍ GIẢN'.normalize('NFD');
  assert.strictEqual(toTitleCaseVi(nfdMixed), 'Đại Đạo Chí Giản');
});

// 4. Có dấu nháy kép / nháy đơn / ngoặc ở đầu: giữ nguyên dấu
runTest('4. Dấu nháy kép / nháy đơn / ngoặc ở đầu: giữ nguyên dấu', () => {
  assert.strictEqual(toTitleCaseVi('"lửa đồng"'), '"Lửa Đồng"');
  assert.strictEqual(toTitleCaseVi('“lửa đồng”'), '“Lửa Đồng”');
  assert.strictEqual(toTitleCaseVi('‘lửa đồng’'), '‘Lửa Đồng’');
  assert.strictEqual(toTitleCaseVi("'thâm uyên'"), "'Thâm Uyên'");
  assert.strictEqual(toTitleCaseVi('(thâm uyên)'), '(Thâm Uyên)');
  assert.strictEqual(toTitleCaseVi('[đại đạo]'), '[Đại Đạo]');
  assert.strictEqual(toTitleCaseVi('{chí giản}'), '{Chí Giản}');
  assert.strictEqual(toTitleCaseVi('«thâm uyên»'), '«Thâm Uyên»');
});

// 5. Nhiều khoảng trắng và xuống dòng: giữ nguyên 100%
runTest('5. Nhiều khoảng trắng và xuống dòng giữ nguyên vẹn', () => {
  const multiSpace = '  thâm   uyên  \n\n  đại   đạo  \t\n  ';
  const expected = '  Thâm   Uyên  \n\n  Đại   Đạo  \t\n  ';
  assert.strictEqual(toTitleCaseVi(multiSpace), expected);
});

// 6. Chuỗi rỗng, null, undefined
runTest('6. Chuỗi rỗng, null, undefined', () => {
  assert.strictEqual(toTitleCaseVi(''), '');
  assert.strictEqual(toTitleCaseVi(null), '');
  assert.strictEqual(toTitleCaseVi(undefined), '');
  assert.strictEqual(toTitleCaseVi('   '), '   ');
});

// 7. Chuỗi có số: "chương 12 thâm uyên" -> "Chương 12 Thâm Uyên"
runTest('7. Chuỗi có số: "chương 12 thâm uyên" -> "Chương 12 Thâm Uyên"', () => {
  assert.strictEqual(toTitleCaseVi('chương 12 thâm uyên'), 'Chương 12 Thâm Uyên');
  assert.strictEqual(toTitleCaseVi('hồi 108: đại chiến 300 hiệp'), 'Hồi 108: Đại Chiến 300 Hiệp');
});

// 8. Từ có gạch nối: "thiên-địa" -> "Thiên-Địa", gạch ngang dài, gạch chéo
runTest('8. Từ có gạch nối: "thiên-địa" -> "Thiên-Địa", gạch ngang dài, gạch chéo', () => {
  assert.strictEqual(toTitleCaseVi('thiên-địa'), 'Thiên-Địa');
  assert.strictEqual(toTitleCaseVi('thiên–địa'), 'Thiên–Địa'); // en-dash
  assert.strictEqual(toTitleCaseVi('thiên—địa'), 'Thiên—Địa'); // em-dash
  assert.strictEqual(toTitleCaseVi('nam/nữ'), 'Nam/Nữ');
  assert.strictEqual(toTitleCaseVi('âm/dương/hỗn/độn'), 'Âm/Dương/Hỗn/Độn');
});

// 9. Dấu nháy trong từ: "don't" -> "Don't" (không viết hoa sau nháy khi đứng giữa hai chữ)
runTest('9. Dấu nháy trong từ: "don\'t" -> "Don\'t" (không viết hoa chữ t)', () => {
  assert.strictEqual(toTitleCaseVi("don't"), "Don't");
  assert.strictEqual(toTitleCaseVi("DON'T"), "Don't");
  assert.strictEqual(toTitleCaseVi("it's a wonder"), "It's A Wonder");
  assert.strictEqual(toTitleCaseVi("c'est la vie"), "C'est La Vie");
  assert.strictEqual(toTitleCaseVi("rock'n'roll"), "Rock'n'roll");
});

// 10. Tính lũy đẳng (Idempotent): áp 2 lần cho cùng kết quả
runTest('10. Tính lũy đẳng (Idempotent): toTitleCaseVi(toTitleCaseVi(s)) === toTitleCaseVi(s)', () => {
  const samples = [
    'thâm uyên',
    'THÂM UYÊN',
    'lửa đồng không cháy hết',
    'đại đạo chí giản',
    '"lửa đồng"',
    'thiên-địa',
    'chương 12 thâm uyên',
    "don't stop",
    '  nhiều    khoảng  trắng \n\n xuống dòng '
  ];

  for (const s of samples) {
    const once = toTitleCaseVi(s);
    const twice = toTitleCaseVi(once);
    assert.strictEqual(twice, once, `Không đạt tính lũy đẳng cho: ${s}`);
  }
});

console.log(`\n========================================`);
console.log(`TẤT CẢ ${passedTests} BÀI KIỂM THỬ TITLE CASE ĐỀU VƯỢT QUA!`);
console.log(`========================================\n`);
