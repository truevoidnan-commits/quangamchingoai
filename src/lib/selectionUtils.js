/**
 * Selection Utilities for Reader
 * Hỗ trợ xác định ranh giới từ và chọn chính xác dấu câu / văn bản
 */

export const PRECISE_SELECTION_STORAGE_KEY = 'tcl_precise_selection';

export const SELECTION_DELIMITERS_REGEX = /[\s,.;:!?"'()\[\]{}…—\-\/\\«»“”‘’]/;

/**
 * Kiểm tra xem một ký tự có phải ký tự từ (word character) hay không.
 * Các ký tự thuộc bộ phân tách (khoảng trắng, dấu câu) trả về false.
 */
export function isWordChar(ch) {
  if (!ch || typeof ch !== 'string') return false;
  return !SELECTION_DELIMITERS_REGEX.test(ch);
}

/**
 * Thoát các ký tự đặc biệt trong biểu thức chính quy (MDN standard)
 */
export function escapeRegExp(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Đọc cấu hình "Chọn chính xác" từ localStorage
 */
export function getPreciseSelectionSetting() {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(PRECISE_SELECTION_STORAGE_KEY) === 'true';
    }
  } catch (e) {}
  return false;
}

/**
 * Lưu cấu hình "Chọn chính xác" vào localStorage
 */
export function setPreciseSelectionSetting(enabled) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PRECISE_SELECTION_STORAGE_KEY, enabled ? 'true' : 'false');
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent('tcl_precise_selection_changed', {
          detail: { enabled: Boolean(enabled) },
        })
      );
    }
  } catch (e) {}
}

/**
 * Mở rộng ranh giới offset của chuỗi văn bản theo nguyên tắc ranh giới từ.
 * Hàm thuần túy để có thể unit test độc lập với môi trường DOM.
 *
 * Quy tắc:
 * 1. Chỉ mở rộng đầu vùng chọn lùi về đầu chữ khi:
 *    Ký tự ĐẦU TIÊN được chọn (text[start]) là ký tự chữ (isWordChar)
 *    VÀ ký tự đứng trước nó (text[start-1]) cũng là ký tự chữ.
 * 2. Chỉ mở rộng đầu cuối tiến tới hết chữ khi:
 *    Ký tự CUỐI CÙNG được chọn (text[end-1]) là ký tự chữ
 *    VÀ ký tự đứng sau (text[end]) cũng là ký tự chữ.
 * 3. Nếu vùng chọn chỉ toàn dấu câu / khoảng trắng, KHÔNG mở rộng cả hai phía.
 * 4. Nếu vùng chọn lai (ví dụ ", rồi"): chỉ mở rộng phía thỏa quy tắc.
 * 5. Nếu chế độ chính xác (isPrecise) bật: giữ nguyên tuyệt đối start và end.
 */
export function expandRangeOffsets(text, start, end, isPrecise = false) {
  if (isPrecise) {
    return { start, end };
  }
  if (!text || typeof text !== 'string') {
    return { start, end };
  }

  let newStart = Math.max(0, Math.min(start, text.length));
  let newEnd = Math.max(newStart, Math.min(end, text.length));

  if (newStart >= newEnd) {
    return { start: newStart, end: newEnd };
  }

  // 1. Mở rộng biên đầu lùi về đầu chữ
  if (newStart > 0 && isWordChar(text[newStart]) && isWordChar(text[newStart - 1])) {
    while (newStart > 0 && isWordChar(text[newStart - 1])) {
      newStart--;
    }
  }

  // 2. Mở rộng biên cuối tiến tới hết chữ
  if (newEnd < text.length && isWordChar(text[newEnd - 1]) && isWordChar(text[newEnd])) {
    while (newEnd < text.length && isWordChar(text[newEnd])) {
      newEnd++;
    }
  }

  return { start: newStart, end: newEnd };
}

/**
 * Tự động mở rộng vùng bôi đen (DOM Selection Range) ra toàn bộ chữ
 * (tránh đứt đoạn như "guy" thay vì "nguyệt"), trừ khi chọn dấu câu hoặc chế độ chính xác được bật.
 */
export function expandSelectionToWordBoundaries(sel, isPrecise = false) {
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!range) return null;

  if (isPrecise) {
    return range;
  }

  let startContainer = range.startContainer;
  let startOffset = range.startOffset;
  let endContainer = range.endContainer;
  let endOffset = range.endOffset;

  let changed = false;

  // Single text node (phần lớn trường hợp bôi đen trong đoạn)
  if (
    startContainer === endContainer &&
    startContainer.nodeType === (typeof Node !== 'undefined' ? Node.TEXT_NODE : 3)
  ) {
    const text = startContainer.textContent || '';
    const res = expandRangeOffsets(text, startOffset, endOffset, false);
    if (res.start !== startOffset || res.end !== endOffset) {
      startOffset = res.start;
      endOffset = res.end;
      changed = true;
    }
  } else {
    // Spanning multiple nodes
    if (startContainer.nodeType === (typeof Node !== 'undefined' ? Node.TEXT_NODE : 3)) {
      const text = startContainer.textContent || '';
      if (
        startOffset > 0 &&
        startOffset < text.length &&
        isWordChar(text[startOffset]) &&
        isWordChar(text[startOffset - 1])
      ) {
        while (startOffset > 0 && isWordChar(text[startOffset - 1])) {
          startOffset--;
          changed = true;
        }
      }
    }
    if (endContainer.nodeType === (typeof Node !== 'undefined' ? Node.TEXT_NODE : 3)) {
      const text = endContainer.textContent || '';
      if (
        endOffset > 0 &&
        endOffset < text.length &&
        isWordChar(text[endOffset - 1]) &&
        isWordChar(text[endOffset])
      ) {
        while (endOffset < text.length && isWordChar(text[endOffset])) {
          endOffset++;
          changed = true;
        }
      }
    }
  }

  if (changed) {
    try {
      const newRange = document.createRange();
      newRange.setStart(startContainer, startOffset);
      newRange.setEnd(endContainer, endOffset);
      sel.removeAllRanges();
      sel.addRange(newRange);
      return newRange;
    } catch (e) {
      return range;
    }
  }

  return range;
}
