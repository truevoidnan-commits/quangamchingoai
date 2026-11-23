/**
 * textSearch.js
 * Unicode-aware text searching and replacement engine with full Vietnamese support.
 *
 * Principles:
 * 1. Default case-insensitive (matchCase = false).
 * 2. Default whole-word boundary matching (wholeWord = true), avoiding false matches
 *    like 'chuy' inside 'chuyện' or 'chuyển'.
 * 3. Does not use naive regex \b (which fails on Vietnamese non-ASCII characters).
 * 4. Normalizes all input strings to Unicode NFC.
 * 5. Uses identical matching algorithms for both occurrence counting and actual replacement.
 */

/**
 * Checks whether a character is a Unicode word character (letter, digit, mark, or underscore).
 * Correctly recognizes all Vietnamese characters (đ, Đ, á, ơ, ư, etc.).
 */
export function isUnicodeWordChar(char) {
  if (!char || typeof char !== 'string') return false;
  try {
    return /[\p{L}\p{N}\p{M}_]/u.test(char);
  } catch (e) {
    // Fallback for environments without Unicode property escapes
    return /[a-zA-Z0-9_\u00C0-\u024F\u1EA0-\u1EF9]/.test(char);
  }
}

/**
 * Escapes special regex characters in a string.
 */
export function escapeRegex(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks if the match between startIndex and endIndex in text has valid word boundaries.
 * Word boundary checks only apply to edges of searchText that are actual word characters.
 */
export function hasWordBoundaries(text, startIndex, endIndex, searchText = '') {
  const normSearch = searchText ? searchText.normalize('NFC') : '';
  const firstSearchChar = normSearch.length > 0 ? normSearch[0] : '';
  const lastSearchChar = normSearch.length > 0 ? normSearch[normSearch.length - 1] : '';

  if (!normSearch || isUnicodeWordChar(firstSearchChar)) {
    if (startIndex > 0 && isUnicodeWordChar(text[startIndex - 1])) {
      return false;
    }
  }

  if (!normSearch || isUnicodeWordChar(lastSearchChar)) {
    if (endIndex < text.length && isUnicodeWordChar(text[endIndex])) {
      return false;
    }
  }

  return true;
}

/**
 * Finds all match occurrences in text using the configured options.
 *
 * @param {string} text - Source text
 * @param {string} searchText - String to search for
 * @param {object} options
 * @param {boolean} [options.matchCase=false] - Case-sensitive matching
 * @param {boolean} [options.wholeWord=true] - Only match whole words
 * @returns {Array<{ index: number, length: number, matchText: string }>}
 */
export function findMatches(text, searchText, options = {}) {
  if (!text || !searchText || typeof text !== 'string' || typeof searchText !== 'string') {
    return [];
  }

  const { matchCase = false, wholeWord = true } = options;

  const normalizedText = text.normalize('NFC');
  const normalizedSearch = searchText.normalize('NFC');
  const searchLen = normalizedSearch.length;
  if (searchLen === 0) return [];

  const compareText = matchCase ? normalizedText : normalizedText.toLowerCase();
  const compareSearch = matchCase ? normalizedSearch : normalizedSearch.toLowerCase();

  const matches = [];
  let startIndex = 0;

  while (startIndex < compareText.length) {
    const foundIndex = compareText.indexOf(compareSearch, startIndex);
    if (foundIndex === -1) break;

    const endIndex = foundIndex + searchLen;

    if (!wholeWord || hasWordBoundaries(normalizedText, foundIndex, endIndex, normalizedSearch)) {
      matches.push({
        index: foundIndex,
        length: searchLen,
        matchText: normalizedText.slice(foundIndex, endIndex),
      });
    }

    startIndex = foundIndex + Math.max(1, searchLen);
  }

  return matches;
}

/**
 * Counts the number of occurrences of searchText in text.
 * Guaranteed to use the exact same logic as replaceOccurrences.
 */
export function countOccurrences(text, searchText, options = {}) {
  return findMatches(text, searchText, options).length;
}

/**
 * Replaces all valid occurrences of searchText in text with replaceText.
 *
 * @param {string} text - Source text
 * @param {string} searchText - Text to find
 * @param {string} replaceText - Text to replace with
 * @param {object} options - Options (matchCase, wholeWord)
 * @returns {{ newText: string, count: number }}
 */
export function replaceOccurrences(text, searchText, replaceText = '', options = {}) {
  if (!text || !searchText || typeof text !== 'string' || typeof searchText !== 'string') {
    return { newText: text || '', count: 0 };
  }

  const matches = findMatches(text, searchText, options);
  if (matches.length === 0) {
    return { newText: text, count: 0 };
  }

  const normalizedText = text.normalize('NFC');
  let result = '';
  let lastIndex = 0;

  for (const match of matches) {
    result += normalizedText.slice(lastIndex, match.index);
    result += replaceText;
    lastIndex = match.index + match.length;
  }

  result += normalizedText.slice(lastIndex);

  return {
    newText: result,
    count: matches.length,
  };
}
