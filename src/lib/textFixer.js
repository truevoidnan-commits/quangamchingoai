/**
 * Sửa lỗi dấu tiếng Việt bị tách rời khi copy từ web
 * Vietnamese diacritics fixer - NFC normalization + Tone mark reconstruction
 */

function fixBrokenToneMarks(s) {
  const TONE_MAP = {
    "\u0060": "\u0300", // `  -> dấu huyền
    "\u00B4": "\u0301", // ´  -> dấu sắc
    "\u02CB": "\u0300", // ˋ  -> dấu huyền
    "\u02CA": "\u0301", // ˊ  -> dấu sắc
    "\u02DC": "\u0303", // ˜  -> dấu ngã
    "~": "\u0303",       // ~  -> dấu ngã
    "\u02C7": "\u0309", // ˇ  -> dấu hỏi
  };
  const VOWELS = "aăâeêioôơuưyAĂÂEÊIOÔƠUƯY";
  for (const bad in TONE_MAP) {
    const comb = TONE_MAP[bad];
    const escaped = bad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("([" + VOWELS + "])" + escaped + "(?=[a-zA-ZÀ-ỹ])", "g");
    s = s.replace(re, (m, v) => v + comb);
  }
  return s;
}

/**
 * Chuẩn hóa Unicode NFC — hợp nhất ký tự tổ hợp dấu & lọc ký tự vô hình
 */
export function normalizeVietnamese(s) {
  if (!s) return s || '';
  // Lọc các ký tự vô hình (zero-width, soft hyphen...) gây ra lỗi chữ bị tách rời "mắ t", "liê n"
  s = s.replace(/[\u200B\u200C\u200D\u2060\uFEFF\u00AD]/g, '');
  // Gộp các khoảng trắng lạ về khoảng trắng thường
  s = s.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
  // Sửa lỗi dấu thanh bị tách rời "Trâ`n" -> "Trần"
  s = fixBrokenToneMarks(s);
  // Standardize newlines
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return s.normalize('NFC');
}

/**
 * In hoa chữ cái đầu tiên và chữ cái sau dấu hai chấm
 */
export function capFirstLetters(title) {
  let t = title || '';
  if (t.length) t = t.charAt(0).toUpperCase() + t.slice(1);
  t = t.replace(/(:\s+)(\S)/, (m, sep, ch) => sep + ch.toUpperCase());
  return t;
}

/**
 * Chuyển văn bản sang Title Case (Viết hoa chữ cái đầu của mỗi từ) chuẩn tiếng Việt
 * - Dùng cờ Unicode u và \p{L}/\p{M} để hiểu đầy đủ dấu tiếng Việt (không dùng \b hay \w)
 * - Tách từ theo ranh giới đầu chuỗi, khoảng trắng, các dấu mở/nối (" “ ‘ ' ( [ { - – — / ;)
 * - Chuẩn hóa NFC bảo toàn thanh điệu (kể cả khi đầu vào là NFD)
 * - Giữ nguyên toàn bộ khoảng trắng, xuống dòng, dấu câu, số và ký tự không phải chữ
 * - Dấu nháy trong từ như "don't" giữ nguyên dạng viết thường sau nháy (chỉ coi nháy là ranh giới khi đứng đầu từ)
 */
export function toTitleCaseVi(text) {
  if (!text) return text ?? '';
  const normalized = String(text).normalize('NFC');

  return normalized.replace(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu, (word) => {
    const chars = Array.from(word);
    if (chars.length === 0) return '';
    const first = chars[0].toUpperCase();
    const rest = chars.slice(1).join('').toLocaleLowerCase('vi');
    return first + rest;
  });
}

/**
 * Smart paragraph detection and formatting
 */
export function formatChapterContent(text) {
  if (!text) return text || '';
  text = normalizeVietnamese(text);
  const lines = text.split('\n');
  const paragraphs = [];
  let current = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      if (current.trim()) {
        paragraphs.push(current.trim());
        current = '';
      }
    } else {
      current += (current ? '\n' : '') + trimmed;
    }
  }
  if (current.trim()) paragraphs.push(current.trim());
  return paragraphs.join('\n\n');
}

/**
 * Count words (Vietnamese-aware)
 */
export function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Format number with dot separator (Vietnamese style)
 * 12345 → "12.345"
 */
export function formatWordCount(count) {
  return count.toLocaleString('vi-VN');
}
