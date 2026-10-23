import assert from 'assert';
import {
  expandRangeOffsets,
  isWordChar,
  escapeRegExp,
  SELECTION_DELIMITERS_REGEX,
} from '../src/lib/selectionUtils.js';

console.log('=== BẮT ĐẦU CHẠY TOÀN BỘ CÁC BÀI TEST SELECTION VÀ DẤU CÂU ===\n');

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

// -------------------------------------------------------------
// Test 1: Chọn ',' trong "nói, rồi" -> ','
// -------------------------------------------------------------
runTest('Test 1: Chọn riêng dấu phẩy "," trong "nói, rồi" -> "," (không mở rộng sang "nói")', () => {
  const text = 'nói, rồi';
  const commaIndex = text.indexOf(',');
  assert.strictEqual(commaIndex, 3);
  const start = commaIndex;
  const end = commaIndex + 1; // Chọn đúng 1 ký tự ','

  const res = expandRangeOffsets(text, start, end, false);
  assert.strictEqual(res.start, 3, 'startOffset không được lùi về đầu từ "nói"');
  assert.strictEqual(res.end, 4, 'endOffset không được tiến sang "rồi"');
  assert.strictEqual(text.slice(res.start, res.end), ',');
});

// -------------------------------------------------------------
// Test 2: Chọn 'guy' trong "nguyệt" -> 'nguyệt'
// -------------------------------------------------------------
runTest('Test 2: Chọn một phần từ "guy" trong "nguyệt" -> tự mở rộng ra toàn bộ "nguyệt"', () => {
  const text = 'nguyệt';
  const guyIndex = text.indexOf('guy');
  assert.strictEqual(guyIndex, 1);
  const start = guyIndex;
  const end = guyIndex + 'guy'.length; // 4

  const res = expandRangeOffsets(text, start, end, false);
  assert.strictEqual(res.start, 0, 'startOffset phải lùi về đầu chữ "n" (index 0)');
  assert.strictEqual(res.end, text.length, 'endOffset phải tiến tới hết chữ "t" (index 6)');
  assert.strictEqual(text.slice(res.start, res.end), 'nguyệt');
});

// -------------------------------------------------------------
// Test 3: Chọn ',"' -> ',"'
// -------------------------------------------------------------
runTest('Test 3: Chọn cụm toàn dấu câu \',\"\' -> giữ nguyên \',\"\' (không mở rộng hai phía)', () => {
  const text = 'Hắn nói," rồi đi';
  const quoteIndex = text.indexOf(',"');
  assert.ok(quoteIndex !== -1);
  const start = quoteIndex;
  const end = quoteIndex + ',"'.length;

  const res = expandRangeOffsets(text, start, end, false);
  assert.strictEqual(res.start, start, 'startOffset giữ nguyên vị trí dấu phẩy');
  assert.strictEqual(res.end, end, 'endOffset giữ nguyên vị trí dấu ngoặc kép');
  assert.strictEqual(text.slice(res.start, res.end), ',"');
});

// -------------------------------------------------------------
// Test 4: Chọn 'nói,' trong "nói, rồi" -> 'nói,' (chỉ mở rộng trái ra 'nói', không kéo sang 'rồi')
// -------------------------------------------------------------
runTest('Test 4: Chọn "ói," trong "nói, rồi" -> "nói," (mở rộng trái ra "nói", không kéo sang "rồi")', () => {
  const text = 'nói, rồi';
  // Giả sử người dùng quét từ 'ó' đến ','
  const start = text.indexOf('ói,'); // 1
  const end = start + 'ói,'.length; // 4

  const res = expandRangeOffsets(text, start, end, false);
  assert.strictEqual(res.start, 0, 'startOffset phải lùi về chữ "n"');
  assert.strictEqual(res.end, 4, 'endOffset phải dừng ở dấu "," mà không nuốt sang "rồi"');
  assert.strictEqual(text.slice(res.start, res.end), 'nói,');

  // Nếu người dùng chọn đúng "nói," từ đầu
  const res2 = expandRangeOffsets(text, 0, 4, false);
  assert.strictEqual(res2.start, 0);
  assert.strictEqual(res2.end, 4);
  assert.strictEqual(text.slice(res2.start, res2.end), 'nói,');
});

// -------------------------------------------------------------
// Test 5: Bật chế độ chính xác (isPrecise = true) -> giữ nguyên mọi ca
// -------------------------------------------------------------
runTest('Test 5: Khi bật chế độ chính xác (isPrecise = true) -> giữ nguyên tuyệt đối vùng chọn', () => {
  const text1 = 'nói, rồi';
  const commaRes = expandRangeOffsets(text1, 3, 4, true);
  assert.deepStrictEqual(commaRes, { start: 3, end: 4 }, 'Dấu phẩy giữ nguyên 3..4');

  const text2 = 'nguyệt';
  const guyRes = expandRangeOffsets(text2, 1, 4, true);
  assert.deepStrictEqual(guyRes, { start: 1, end: 4 }, '"guy" trong "nguyệt" giữ nguyên 1..4 (không mở rộng)');
  assert.strictEqual(text2.slice(guyRes.start, guyRes.end), 'guy');

  const text3 = 'Hắn nói," rồi đi';
  const quoteStart = text3.indexOf(',"');
  const quoteRes = expandRangeOffsets(text3, quoteStart, quoteStart + 2, true);
  assert.deepStrictEqual(quoteRes, { start: quoteStart, end: quoteStart + 2 });

  const text4 = 'nói, rồi';
  const oiRes = expandRangeOffsets(text4, 1, 4, true);
  assert.deepStrictEqual(oiRes, { start: 1, end: 4 }, '"ói," giữ nguyên 1..4');
});

// -------------------------------------------------------------
// Test 6: Vùng chọn lai: ", rồi" -> mở rộng phía chữ, không lùi phía dấu câu
// -------------------------------------------------------------
runTest('Test 6: Vùng chọn lai (ví dụ ", r" trong "nói, rồi") -> chỉ mở rộng phía chữ thành ", rồi"', () => {
  const text = 'nói, rồi';
  const start = text.indexOf(', r'); // 3
  const end = start + ', r'.length; // 6 (đến hết 'r')

  const res = expandRangeOffsets(text, start, end, false);
  assert.strictEqual(res.start, 3, 'Phía dấu phẩy không được lùi vào chữ "nói"');
  assert.strictEqual(res.end, text.length, 'Phía chữ "r" được tiến tới hết từ "rồi" (index 8)');
  assert.strictEqual(text.slice(res.start, res.end), ', rồi');
});

// -------------------------------------------------------------
// Test 7: Kiểm tra bộ phân tách delimiters đầy đủ
// -------------------------------------------------------------
runTest('Test 7: Bộ ký tự phân tách delimiters đầy đủ chuẩn xác theo yêu cầu', () => {
  const delimiters = [
    ' ', '\t', '\n',
    ',', '.', ';', ':', '!', '?',
    '"', "'",
    '(', ')', '[', ']', '{', '}',
    '…', '—', '-', '/', '\\',
    '«', '»', '“', '”', '‘', '’',
  ];

  for (const d of delimiters) {
    assert.strictEqual(
      isWordChar(d),
      false,
      `Ký tự phân tách "${d}" (code ${d.charCodeAt(0)}) phải được coi là KHÔNG PHẢI ký tự từ`
    );
  }

  // Ký tự chữ tiếng Việt và tiếng Anh
  const wordChars = ['a', 'z', 'A', 'Z', '0', '9', 'à', 'á', 'ả', 'ã', 'ạ', 'ê', 'ế', 'ơ', 'ư', 'đ', 'Nguyệt'];
  for (const w of wordChars) {
    assert.strictEqual(
      isWordChar(w[0]),
      true,
      `Ký tự "${w[0]}" phải được coi là ký tự từ`
    );
  }
});

// -------------------------------------------------------------
// Test 8: Các dấu câu độc lập khác (., ?, !, :, ;, —, …) không kéo chữ bên cạnh
// -------------------------------------------------------------
runTest('Test 8: Các dấu câu đơn lẻ khác (., ?, !, :, ;, —, …) không bao giờ kéo chữ kề bên', () => {
  const cases = [
    { text: 'Chào bạn. Hôm nay', char: '.', offset: 8 },
    { text: 'Thật sao? Đúng vậy', char: '?', offset: 8 },
    { text: 'Mau lên! Nhanh', char: '!', offset: 7 },
    { text: 'Chú ý: điều này', char: ':', offset: 5 },
    { text: 'Một; hai', char: ';', offset: 3 },
    { text: 'Ai đó—chính hắn', char: '—', offset: 5 },
    { text: 'Đợi đã… xong', char: '…', offset: 6 },
  ];

  for (const c of cases) {
    assert.strictEqual(c.text[c.offset], c.char);
    const res = expandRangeOffsets(c.text, c.offset, c.offset + 1, false);
    assert.strictEqual(res.start, c.offset, `Dấu "${c.char}" không được lùi start`);
    assert.strictEqual(res.end, c.offset + 1, `Dấu "${c.char}" không được tiến end`);
    assert.strictEqual(c.text.slice(res.start, res.end), c.char);
  }
});

// -------------------------------------------------------------
// Test 9: escapeRegExp thoát đầy đủ và đếm đúng số lần xuất hiện dấu câu trong chương
// -------------------------------------------------------------
runTest('Test 9: escapeRegExp và đếm số lần xuất hiện dấu câu đặc biệt trong văn bản', () => {
  const sampleContent = 'Nói, rồi, hắn, đi. Bạn có khỏe không? (Thật sao?) [Ghi chú: $100 * 2 + 1 = 201].';

  const checkCount = (token, expected) => {
    const escaped = escapeRegExp(token);
    const matches = sampleContent.match(new RegExp(escaped, 'g'));
    const count = matches ? matches.length : 0;
    assert.strictEqual(count, expected, `Đếm số lần token "${token}" phải là ${expected}`);
  };

  checkCount(',', 3);
  checkCount('.', 2);
  checkCount('?', 2);
  checkCount('(', 1);
  checkCount(')', 1);
  checkCount('[', 1);
  checkCount(']', 1);
  checkCount('$', 1);
  checkCount('*', 1);
  checkCount('+', 1);
});

// -------------------------------------------------------------
// Test 10: Vùng chọn chỉ toàn khoảng trắng hoặc dấu câu không mở rộng cả hai phía
// -------------------------------------------------------------
runTest('Test 10: Vùng chọn chỉ toàn dấu câu và khoảng trắng (" ... ", " — ") không mở rộng', () => {
  const text = 'Từ này ... từ kia — kết thúc';
  const dotsStart = text.indexOf(' ... ');
  const dotsEnd = dotsStart + ' ... '.length;
  const resDots = expandRangeOffsets(text, dotsStart, dotsEnd, false);
  assert.strictEqual(resDots.start, dotsStart);
  assert.strictEqual(resDots.end, dotsEnd);

  const dashStart = text.indexOf(' — ');
  const dashEnd = dashStart + ' — '.length;
  const resDash = expandRangeOffsets(text, dashStart, dashEnd, false);
  assert.strictEqual(resDash.start, dashStart);
  assert.strictEqual(resDash.end, dashEnd);
});

console.log(`\n=== TẤT CẢ ${passedTests} BÀI TEST SELECTION VÀ DẤU CÂU ĐÃ VƯỢT QUA 100%! ===`);
