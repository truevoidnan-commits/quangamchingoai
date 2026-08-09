/**
 * Sửa lỗi dấu tiếng Việt bị tách rời khi copy từ web
 * Vietnamese diacritics fixer - NFC normalization + common patterns
 */

/**
 * Chuẩn hóa Unicode NFC — hợp nhất ký tự tổ hợp dấu
 * Ví dụ: "o" + combining acute → "ó"
 */
export function normalizeVietnamese(text) {
  if (!text) return text;
  // NFC normalization
  text = text.normalize('NFC');
  // Fix common copy-paste artifacts
  text = fixCommonPatterns(text);
  return text;
}

/**
 * Sửa các pattern lỗi thường gặp khi copy từ web
 */
function fixCommonPatterns(text) {
  // Fix double spaces and weird whitespace
  text = text.replace(/\u00A0/g, ' ');     // non-breaking space → regular space
  text = text.replace(/\u200B/g, '');       // zero-width space → remove
  text = text.replace(/\u200C/g, '');       // zero-width non-joiner → remove
  text = text.replace(/\uFEFF/g, '');       // BOM → remove
  text = text.replace(/\r\n/g, '\n');       // Windows line endings
  text = text.replace(/\r/g, '\n');         // old Mac line endings
  // Fix multiple blank lines (keep at most 2)
  text = text.replace(/\n{3,}/g, '\n\n');
  // Fix spaces around punctuation (common in copy from HTML)
  text = text.replace(/ +,/g, ',');
  text = text.replace(/ +\./g, '.');
  text = text.replace(/ +!/g, '!');
  text = text.replace(/ +\?/g, '?');
  // Remove trailing spaces per line
  text = text.split('\n').map(line => line.trimEnd()).join('\n');
  return text;
}

/**
 * Smart paragraph detection and formatting
 */
export function formatChapterContent(text) {
  if (!text) return text;
  text = normalizeVietnamese(text);
  // Ensure paragraphs are separated by blank lines
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
      current += (current ? ' ' : '') + trimmed;
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
