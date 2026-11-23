import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import {
  isUnicodeWordChar,
  hasWordBoundaries,
  findMatches,
  countOccurrences,
  replaceOccurrences,
} from '../src/lib/textSearch.js';

describe('Text Search & Vietnamese Unicode Boundary Engine', () => {
  describe('isUnicodeWordChar', () => {
    test('recognizes standard ASCII word characters', () => {
      assert.equal(isUnicodeWordChar('a'), true);
      assert.equal(isUnicodeWordChar('Z'), true);
      assert.equal(isUnicodeWordChar('5'), true);
      assert.equal(isUnicodeWordChar('_'), true);
    });

    test('recognizes Vietnamese accented vowels and đ/Đ', () => {
      const viChars = [
        'á', 'à', 'ả', 'ã', 'ạ',
        'ă', 'ắ', 'ằ', 'ẳ', 'ẵ', 'ặ',
        'â', 'ấ', 'ầ', 'ẩ', 'ẫ', 'ậ',
        'é', 'è', 'ẻ', 'ẽ', 'ẹ',
        'ê', 'ế', 'ề', 'ể', 'ễ', 'ệ',
        'í', 'ì', 'ỉ', 'ĩ', 'ị',
        'ó', 'ò', 'ỏ', 'õ', 'ọ',
        'ô', 'ố', 'ồ', 'ổ', 'ỗ', 'ộ',
        'ơ', 'ớ', 'ờ', 'ở', 'ỡ', 'ợ',
        'ú', 'ù', 'ủ', 'ũ', 'ụ',
        'ư', 'ứ', 'ừ', 'ử', 'ữ', 'ự',
        'ý', 'ỳ', 'ỷ', 'ỹ', 'ỵ',
        'đ', 'Đ',
      ];
      for (const char of viChars) {
        assert.equal(isUnicodeWordChar(char), true, `Failed for character: ${char}`);
      }
    });

    test('correctly rejects non-word punctuation, whitespace, and symbols', () => {
      const nonWordChars = [' ', '\t', '\n', '.', ',', ';', ':', '!', '?', '"', "'", '(', ')', '[', ']', '-', '/', '—', '…'];
      for (const char of nonWordChars) {
        assert.equal(isUnicodeWordChar(char), false, `Should reject punctuation: ${char}`);
      }
    });
  });

  describe('hasWordBoundaries', () => {
    test('rejects substring inside larger Vietnamese word', () => {
      const text = 'Đây là câu chuyện tu tiên';
      // "chuy" starts at index 11 ("chuyện")
      const start = text.indexOf('chuy');
      const end = start + 'chuy'.length;
      assert.equal(hasWordBoundaries(text, start, end), false, '"chuy" inside "chuyện" should not have word boundaries');
    });

    test('rejects suffix match without boundary', () => {
      const text = 'chuyển sinh dị giới';
      // "sinh" has boundary, but "chuy" in "chuyển" does not
      const start = text.indexOf('chuy');
      const end = start + 'chuy'.length;
      assert.equal(hasWordBoundaries(text, start, end), false);
    });

    test('accepts whole word surrounded by whitespace or punctuation', () => {
      const text = 'Một câu "chuyện", rất ly kỳ!';
      const start = text.indexOf('chuyện');
      const end = start + 'chuyện'.length;
      assert.equal(hasWordBoundaries(text, start, end), true);
    });

    test('accepts word at string start and end', () => {
      const text1 = 'chuyện này rất dài';
      assert.equal(hasWordBoundaries(text1, 0, 'chuyện'.length), true);

      const text2 = 'đọc một hồi xong chuyện';
      const start2 = text2.indexOf('chuyện');
      assert.equal(hasWordBoundaries(text2, start2, start2 + 'chuyện'.length), true);
    });
  });

  describe('countOccurrences', () => {
    test('defaults to case-insensitive and whole-word matching', () => {
      const text = 'Võ hồn của hắn là Thao Thiết VÕ HỒN. võ hồn vô địch thiên hạ!';
      // Should match all 3 occurrences regardless of casing
      const count = countOccurrences(text, 'võ hồn');
      assert.equal(count, 3);
    });

    test('does NOT match partial words by default (e.g. "chuy" in "chuyện")', () => {
      const text = 'Người kể câu chuyện này đã chuyển kiếp ba lần.';
      assert.equal(countOccurrences(text, 'chuy'), 0);
      assert.equal(countOccurrences(text, 'chuyện'), 1);
      assert.equal(countOccurrences(text, 'chuyển'), 1);
    });

    test('respects matchCase = true when explicitly requested', () => {
      const text = 'Diệp Phàm và diệp phàm cùng tu luyện';
      assert.equal(countOccurrences(text, 'Diệp Phàm', { matchCase: true }), 1);
      assert.equal(countOccurrences(text, 'Diệp Phàm', { matchCase: false }), 2);
    });

    test('matches substring when wholeWord = false', () => {
      const text = 'Người kể câu chuyện này đã chuyển kiếp.';
      assert.equal(countOccurrences(text, 'chuy', { wholeWord: false }), 2);
    });

    test('handles decomposed Unicode (NFD) text', () => {
      // 'chuyện' in NFD vs NFC
      const textNFD = 'chuyện'.normalize('NFD');
      const searchNFC = 'chuyện'.normalize('NFC');
      assert.equal(countOccurrences(textNFD, searchNFC), 1);
    });
  });

  describe('replaceOccurrences', () => {
    test('replaces matching words while preserving user-entered casing', () => {
      const text = 'Hắn kích hoạt VÕ HỒN, võ hồn lập tức gầm thét.';
      const res = replaceOccurrences(text, 'võ hồn', 'Võ Hồn');
      assert.equal(res.count, 2);
      assert.equal(res.newText, 'Hắn kích hoạt Võ Hồn, Võ Hồn lập tức gầm thét.');
    });

    test('does not damage adjacent Vietnamese words', () => {
      const text = 'ngươi đi tìm người quen';
      // Replacing "người" with "bằng hữu" should leave "ngươi" completely untouched
      const res = replaceOccurrences(text, 'người', 'bằng hữu');
      assert.equal(res.count, 1);
      assert.equal(res.newText, 'ngươi đi tìm bằng hữu quen');
    });

    test('handles deletion when replaceText is empty string', () => {
      const text = 'Lâm Phong nhìn thấy Thần Thú Thần Thú xuất hiện';
      const res = replaceOccurrences(text, 'Thần Thú ', '');
      assert.equal(res.count, 2);
      assert.equal(res.newText, 'Lâm Phong nhìn thấy xuất hiện');
    });

    test('returns original text when no matches found', () => {
      const text = 'Vạn Cổ Thần Đế';
      const res = replaceOccurrences(text, 'Thiên Đế', 'Chí Tôn');
      assert.equal(res.count, 0);
      assert.equal(res.newText, text);
    });

    test('is 100% consistent with countOccurrences on complex texts', () => {
      const sample = `
        Đạo sinh nhất, nhất sinh nhị, nhị sinh tam, tam sinh vạn vật.
        Võ hồn của hắn chấn động thiên địa. Ai dám cản đường võ hồn này?
        chuyện tu tiên hay chuyển thế luân hồi, tất cả đều là hư vô.
        Đại đạo vô hình, sinh dục thiên địa; Đại đạo vô tình, vận hành nhật nguyệt.
      `;
      const queries = ['võ hồn', 'đại đạo', 'chuyện', 'chuy', 'nhất', 'sinh', 'sinh nhị'];

      for (const q of queries) {
        const count = countOccurrences(sample, q);
        const replaceRes = replaceOccurrences(sample, q, '[REPLACED]');
        assert.equal(
          replaceRes.count,
          count,
          `Count mismatch for query "${q}": countOccurrences returned ${count}, replaceOccurrences returned ${replaceRes.count}`
        );
      }
    });
  });
});
