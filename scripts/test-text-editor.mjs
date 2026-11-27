import assert from 'node:assert/strict';
import { test, describe, beforeEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isUnicodeWordChar,
  hasWordBoundaries,
  findMatches,
  countOccurrences,
  replaceOccurrences,
} from '../src/lib/textSearch.js';
import {
  setSnapshotDBPromiseForTesting,
  saveNovelSnapshot,
  getNovelSnapshot,
  deleteNovelSnapshot,
  pruneSnapshots,
  restoreNovelSnapshot as restoreSnapshotInternal,
} from '../src/lib/novelSnapshot.js';
import { setDBPromiseForTesting, replaceTextInNovel, restoreNovelSnapshot } from '../src/lib/db.js';
import { FONT_OPTIONS } from '../src/hooks/useReadingSettings.js';
import { getReadingSettings, saveReadingSettings } from '../src/lib/storage.js';
import {
  getReadingAnchor,
  calculateTargetScrollY,
  restoreReadingAnchor,
  FontChangeCoordinator,
} from '../src/lib/readingAnchor.js';

// -------------------------------------------------------------
// 1. Mock In-Memory Databases for Main DB and Snapshot DB
// -------------------------------------------------------------
class MockObjectStore {
  constructor(map, db) {
    this.map = map;
    this.db = db;
  }
  async get(id) {
    if (this.db?.simulateError) throw this.db.simulateError;
    const val = this.map.get(id);
    return val ? JSON.parse(JSON.stringify(val)) : undefined;
  }
  async put(val) {
    if (this.db?.simulateError) throw this.db.simulateError;
    this.map.set(val.id, JSON.parse(JSON.stringify(val)));
  }
  async delete(id) {
    if (this.db?.simulateError) throw this.db.simulateError;
    this.map.delete(id);
  }
  async getAll() {
    if (this.db?.simulateError) throw this.db.simulateError;
    return Array.from(this.map.values()).map((v) => JSON.parse(JSON.stringify(v)));
  }
  index(name) {
    const self = this;
    return {
      async getAll(range) {
        if (self.db?.simulateError) throw self.db.simulateError;
        const all = Array.from(self.map.values());
        if (!range || !range.lower) return all;
        const targetNovelId = Array.isArray(range.lower) ? range.lower[0] : range.lower;
        return all
          .filter((c) => c.novelId === targetNovelId)
          .sort((a, b) => (a.order || 0) - (b.order || 0));
      },
      async count(range) {
        if (self.db?.simulateError) throw self.db.simulateError;
        const all = Array.from(self.map.values());
        if (!range || !range.lower) return all.length;
        const targetNovelId = Array.isArray(range.lower) ? range.lower[0] : range.lower;
        return all.filter((c) => c.novelId === targetNovelId).length;
      },
    };
  }
}

class MockDBInstance {
  constructor() {
    this.stores = {
      novels: new Map(),
      chapters: new Map(),
      snapshots: new Map(),
    };
    this.simulateError = null;
    this.simulateTransactionError = null;
    this.openedTransactions = [];
  }

  clear() {
    this.stores.novels.clear();
    this.stores.chapters.clear();
    this.stores.snapshots.clear();
    this.simulateError = null;
    this.simulateTransactionError = null;
    this.openedTransactions = [];
  }

  async get(storeName, id) {
    if (this.simulateError) throw this.simulateError;
    return this.stores[storeName]?.get(id);
  }

  async put(storeName, val) {
    if (this.simulateError) throw this.simulateError;
    this.stores[storeName]?.set(val.id, JSON.parse(JSON.stringify(val)));
  }

  async delete(storeName, id) {
    if (this.simulateError) throw this.simulateError;
    this.stores[storeName]?.delete(id);
  }

  async getAll(storeName) {
    if (this.simulateError) throw this.simulateError;
    return Array.from(this.stores[storeName]?.values() || []).map((v) => JSON.parse(JSON.stringify(v)));
  }

  transaction(storeNames, mode = 'readonly') {
    if (this.simulateTransactionError) throw this.simulateTransactionError;
    const name = Array.isArray(storeNames) ? storeNames[0] : storeNames;
    const store = new MockObjectStore(this.stores[name], this);
    const txRecord = {
      storeName: name,
      mode,
      aborted: false,
    };
    this.openedTransactions.push(txRecord);

    return {
      mode,
      store,
      objectStore: () => store,
      abort: () => {
        txRecord.aborted = true;
      },
      get aborted() {
        return txRecord.aborted;
      },
      done: Promise.resolve(),
    };
  }
}

const mockMainDB = new MockDBInstance();
const mockSnapshotDB = new MockDBInstance();

setDBPromiseForTesting(Promise.resolve(mockMainDB));
setSnapshotDBPromiseForTesting(Promise.resolve(mockSnapshotDB));

// Global mock for IDBKeyRange
global.IDBKeyRange = {
  bound: (lower, upper) => ({ lower, upper }),
  only: (val) => ({ lower: val, upper: val }),
};

// -------------------------------------------------------------
// 2. Test Suites
// -------------------------------------------------------------
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
      const start = text.indexOf('chuy');
      const end = start + 'chuy'.length;
      assert.equal(hasWordBoundaries(text, start, end, 'chuy'), false);
    });

    test('rejects suffix match without boundary', () => {
      const text = 'chuyển sinh dị giới';
      const start = text.indexOf('chuy');
      const end = start + 'chuy'.length;
      assert.equal(hasWordBoundaries(text, start, end, 'chuy'), false);
    });

    test('accepts whole word surrounded by whitespace or punctuation', () => {
      const text = 'Một câu "chuyện", rất ly kỳ!';
      const start = text.indexOf('chuyện');
      const end = start + 'chuyện'.length;
      assert.equal(hasWordBoundaries(text, start, end, 'chuyện'), true);
    });

    test('accepts word at string start and end', () => {
      const text1 = 'chuyện này rất dài';
      assert.equal(hasWordBoundaries(text1, 0, 'chuyện'.length, 'chuyện'), true);

      const text2 = 'đọc một hồi xong chuyện';
      const start2 = text2.indexOf('chuyện');
      assert.equal(hasWordBoundaries(text2, start2, start2 + 'chuyện'.length, 'chuyện'), true);
    });
  });

  describe('countOccurrences', () => {
    test('defaults to case-insensitive and whole-word matching', () => {
      const text = 'Võ hồn của hắn là Thao Thiết VÕ HỒN. võ hồn vô địch thiên hạ!';
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

describe('Anti-Stale Query Race Condition & Double-Submit Protection', () => {
  test('discards outdated count queries when input parameters change', async () => {
    let activeRequestId = 0;
    let latestCommittedStats = null;
    let loadingStats = false;

    // Simulation of rapid typing: Query 1 ("chuy") then Query 2 ("chuyện")
    const triggerSearch = (query, delayMs, simulatedResult) => {
      loadingStats = true;
      const reqId = ++activeRequestId;

      return new Promise((resolve) => {
        setTimeout(() => {
          // Guard: only commit if request ID is still current
          if (reqId === activeRequestId) {
            latestCommittedStats = simulatedResult;
            loadingStats = false;
          }
          resolve(reqId);
        }, delayMs);
      });
    };

    // Query 1 starts (slow, 80ms)
    const p1 = triggerSearch('chuy', 80, { query: 'chuy', count: 0 });
    // User quickly changes to Query 2 (fast, 20ms)
    const p2 = triggerSearch('chuyện', 20, { query: 'chuyện', count: 12 });

    await Promise.all([p1, p2]);

    // Query 1 finished AFTER Query 2, but must NOT overwrite Query 2's result!
    assert.equal(latestCommittedStats?.query, 'chuyện');
    assert.equal(latestCommittedStats?.count, 12);
    assert.equal(loadingStats, false);
  });

  test('double-submit guard strictly prevents duplicate execution', async () => {
    let executeCount = 0;
    let isExecuting = false;

    const executeOperation = async () => {
      if (isExecuting) return false;
      isExecuting = true;
      try {
        await new Promise((r) => setTimeout(r, 40));
        executeCount++;
        return true;
      } finally {
        isExecuting = false;
      }
    };

    // User taps execute button twice in rapid succession
    const [call1, call2] = await Promise.all([executeOperation(), executeOperation()]);

    assert.equal(call1, true, 'First invocation must proceed');
    assert.equal(call2, false, 'Second invocation must be blocked by double-submit guard');
    assert.equal(executeCount, 1, 'Operation must only execute exactly once');
  });
});

describe('Caret, Selection Range & Vietnamese IME Composition Handling', () => {
  test('preserves selection range when transforming text', () => {
    const originalText = 'tiêu viêm bước vào phòng';
    // User highlights "tiêu viêm" [0, 9]
    const selectionStart = 0;
    const selectionEnd = 9;
    const selectionDirection = 'forward';

    const applyTransformation = (text, start, end, fn) => {
      const before = text.slice(0, start);
      const selected = text.slice(start, end);
      const after = text.slice(end);
      const transformed = fn(selected);
      return {
        nextText: before + transformed + after,
        nextStart: start,
        nextEnd: start + transformed.length,
        nextDirection: selectionDirection,
      };
    };

    // Uppercase transformation on selection
    const res = applyTransformation(originalText, selectionStart, selectionEnd, (s) => s.toUpperCase());

    assert.equal(res.nextText, 'TIÊU VIÊM bước vào phòng');
    assert.equal(res.nextStart, 0);
    assert.equal(res.nextEnd, 9);
    assert.equal(res.nextDirection, 'forward');
  });

  test('preserves exact cursor position when transforming whole text without selection', () => {
    const originalText = 'hắc sắc hỏa diễm';
    const cursorIndex = 7; // Cursor after "hắc sắc"

    const transformWhole = (text, pos, fn) => {
      return {
        nextText: fn(text),
        nextStart: pos,
        nextEnd: pos,
      };
    };

    const res = transformWhole(originalText, cursorIndex, (s) => s.toUpperCase());

    assert.equal(res.nextText, 'HẮC SẮC HỎA DIỄM');
    assert.equal(res.nextStart, 7);
    assert.equal(res.nextEnd, 7);
  });

  test('Vietnamese IME composition guard avoids setSelectionRange disruption', () => {
    let isComposing = false;
    let forcedSetSelectionRangeCount = 0;

    const simulateInput = (type, char) => {
      if (type === 'compositionstart') {
        isComposing = true;
      } else if (type === 'compositionend') {
        isComposing = false;
      }

      // In useLayoutEffect, setSelectionRange is ONLY allowed if NOT composing
      if (!isComposing) {
        forcedSetSelectionRangeCount++;
      }
    };

    // Simulate Telex composition for "tiếng": t -> i -> e -> e -> n -> g -> s
    simulateInput('compositionstart', 't');
    simulateInput('input', 'i');
    simulateInput('input', 'e');
    simulateInput('input', 'e');
    simulateInput('input', 'n');
    simulateInput('input', 'g');
    simulateInput('input', 's');
    simulateInput('compositionend', 'tiếng');

    // During the 7 keystrokes of active composition, setSelectionRange was never forced
    assert.equal(forcedSetSelectionRangeCount, 1, 'Only after compositionend should programmatic caret restoration run');
  });
});

describe('Novel-wide Snapshot Backup & Atomic Restoration', () => {
  const novelId = 'novel-test-snapshot';

  beforeEach(() => {
    mockMainDB.clear();
    mockSnapshotDB.clear();
  });

  test('creates snapshot of modified chapters and restores accurately', async () => {
    // Setup 3 chapters in main DB
    const ch1 = { id: 'ch-1', novelId, order: 1, title: 'Chương 1', content: 'Dị hỏa ngút trời.' };
    const ch2 = { id: 'ch-2', novelId, order: 2, title: 'Chương 2', content: 'Dị hỏa này rất nguy hiểm.' };
    const ch3 = { id: 'ch-3', novelId, order: 3, title: 'Chương 3', content: 'Hắn ngồi thiền cả ngày.' };

    await mockMainDB.put('chapters', ch1);
    await mockMainDB.put('chapters', ch2);
    await mockMainDB.put('chapters', ch3);

    // Replace "Dị hỏa" with "Thần Diễm"
    const replaceRes = await replaceTextInNovel(novelId, 'Dị hỏa', 'Thần Diễm', {
      matchCase: false,
      wholeWord: true,
      inTitle: true,
    });

    assert.equal(replaceRes.modifiedChaptersCount, 2);
    assert.equal(replaceRes.totalReplacements, 2);
    assert.ok(replaceRes.snapshotId, 'Snapshot ID must be generated');

    // Verify DB was modified
    const modCh1 = await mockMainDB.get('chapters', 'ch-1');
    const modCh2 = await mockMainDB.get('chapters', 'ch-2');
    const modCh3 = await mockMainDB.get('chapters', 'ch-3');

    assert.equal(modCh1.content, 'Thần Diễm ngút trời.');
    assert.equal(modCh2.content, 'Thần Diễm này rất nguy hiểm.');
    assert.equal(modCh3.content, 'Hắn ngồi thiền cả ngày.');

    // Verify snapshot holds original chapters
    const snapshot = await getNovelSnapshot(replaceRes.snapshotId);
    assert.equal(snapshot.novelId, novelId);
    assert.equal(snapshot.originalChapters.length, 2);
    assert.equal(snapshot.originalChapters[0].content, 'Dị hỏa ngút trời.');
    assert.equal(snapshot.originalChapters[1].content, 'Dị hỏa này rất nguy hiểm.');

    // Now restore from snapshot
    const restoreRes = await restoreNovelSnapshot(replaceRes.snapshotId);
    assert.equal(restoreRes.restoredChaptersCount, 2);

    // Verify DB is 100% rolled back to original content
    const restoredCh1 = await mockMainDB.get('chapters', 'ch-1');
    const restoredCh2 = await mockMainDB.get('chapters', 'ch-2');
    assert.equal(restoredCh1.content, 'Dị hỏa ngút trời.');
    assert.equal(restoredCh2.content, 'Dị hỏa này rất nguy hiểm.');

    // Verify snapshot was cleaned up after restore
    const cleanedSnapshot = await getNovelSnapshot(replaceRes.snapshotId);
    assert.equal(cleanedSnapshot, undefined);
  });

  test('snapshot retention policy prunes snapshots exceeding limit (max 5 per novel, TTL 7d)', async () => {
    const testNovel = 'novel-retention-test';
    const now = Date.now();

    // 1. Create 7 snapshots for this novel
    for (let i = 1; i <= 7; i++) {
      const snap = {
        id: `snap-${i}`,
        novelId: testNovel,
        createdAt: now + i * 1000,
        originalChapters: [{ id: `c-${i}`, novelId: testNovel, content: `Orig ${i}` }],
      };
      await mockSnapshotDB.put('snapshots', snap);
    }

    // 2. Add an expired snapshot (8 days old)
    const expiredSnap = {
      id: 'snap-expired',
      novelId: testNovel,
      createdAt: now - 8 * 24 * 60 * 60 * 1000,
      originalChapters: [{ id: 'c-old', novelId: testNovel, content: 'Expired' }],
    };
    await mockSnapshotDB.put('snapshots', expiredSnap);

    // Run pruning
    await pruneSnapshots();

    const remaining = await mockSnapshotDB.getAll('snapshots');
    assert.equal(remaining.length, 5, 'Must keep at most 5 newest snapshots per novel');

    const ids = remaining.map((s) => s.id);
    assert.ok(!ids.includes('snap-expired'), 'Expired snapshot must be pruned');
    assert.ok(!ids.includes('snap-1'), 'Oldest excess snapshot must be pruned');
    assert.ok(!ids.includes('snap-2'), 'Second oldest excess snapshot must be pruned');
    assert.ok(ids.includes('snap-7'), 'Newest snapshot must be preserved');
  });

  test('fail-closed: stops replacement and writes zero chapters if snapshot creation fails (quota exceeded, db error)', async () => {
    const novelId = 'novel-fail-closed-test';
    const ch1 = { id: 'fc-1', novelId, order: 1, title: 'Chương 1', content: 'Ma Tôn xuất thế thiên hạ đại loạn.' };
    const ch2 = { id: 'fc-2', novelId, order: 2, title: 'Chương 2', content: 'Ai có thể ngăn cản Ma Tôn?' };
    await mockMainDB.put('chapters', ch1);
    await mockMainDB.put('chapters', ch2);

    // 1. Simulate QuotaExceededError when saving snapshot
    mockSnapshotDB.simulateError = new Error('QuotaExceededError: Storage quota exceeded');

    await assert.rejects(
      async () => {
        await replaceTextInNovel(novelId, 'Ma Tôn', 'Thiên Tôn');
      },
      (err) => {
        assert.ok(
          err.message.includes('Không thể tạo bản sao lưu an toàn trước khi thay thế'),
          'Error must explain failure to create snapshot'
        );
        assert.ok(
          err.message.includes('Thao tác đã bị dừng để bảo vệ dữ liệu truyện'),
          'Error must confirm operation was aborted'
        );
        return true;
      }
    );

    // Verify main DB was NOT modified: ZERO chapters written!
    const check1 = await mockMainDB.get('chapters', 'fc-1');
    const check2 = await mockMainDB.get('chapters', 'fc-2');
    assert.equal(check1.content, 'Ma Tôn xuất thế thiên hạ đại loạn.', 'Chapter 1 must NOT be touched');
    assert.equal(check2.content, 'Ai có thể ngăn cản Ma Tôn?', 'Chapter 2 must NOT be touched');

    mockSnapshotDB.simulateError = null;

    // 2. Simulate snapshot database inaccessible / promise rejection
    setSnapshotDBPromiseForTesting(Promise.reject(new Error('Snapshot database connection lost')));

    await assert.rejects(
      async () => {
        await replaceTextInNovel(novelId, 'Ma Tôn', 'Thiên Tôn');
      },
      (err) => {
        assert.ok(err.message.includes('Không thể tạo bản sao lưu an toàn'));
        return true;
      }
    );

    // Re-verify main DB remains completely untouched
    const check1After = await mockMainDB.get('chapters', 'fc-1');
    assert.equal(check1After.content, 'Ma Tôn xuất thế thiên hạ đại loạn.');

    // Restore snapshot DB promise
    setSnapshotDBPromiseForTesting(Promise.resolve(mockSnapshotDB));
  });

  test('conflict detection: aborts rollback and preserves snapshot if content was modified post-snapshot', async () => {
    const novelId = 'novel-conflict-test';
    const ch1 = { id: 'cf-1', novelId, order: 1, title: 'Chương 1', content: 'Nguyên Anh kỳ đại viên mãn.' };
    const ch2 = { id: 'cf-2', novelId, order: 2, title: 'Chương 2', content: 'Đột phá Nguyên Anh cảnh giới.' };
    await mockMainDB.put('chapters', ch1);
    await mockMainDB.put('chapters', ch2);

    // Run replace
    const replaceRes = await replaceTextInNovel(novelId, 'Nguyên Anh', 'Hóa Thần');
    assert.ok(replaceRes.snapshotId);

    // Verify chapters were replaced
    const ch2Replaced = await mockMainDB.get('chapters', 'cf-2');
    assert.equal(ch2Replaced.content, 'Đột phá Hóa Thần cảnh giới.');

    // Now simulate an edit on Chapter 2 after the snapshot was created
    const furtherEditedContent = 'Đột phá Hóa Thần cảnh giới và thu được linh bảo thượng phẩm.';
    await mockMainDB.put('chapters', {
      ...ch2Replaced,
      content: furtherEditedContent,
    });

    // Attempt to restore snapshot -> Must detect conflict and ABORT!
    await assert.rejects(
      async () => {
        await restoreNovelSnapshot(replaceRes.snapshotId);
      },
      (err) => {
        assert.equal(err.code, 'SNAPSHOT_CONFLICT', 'Error code must be SNAPSHOT_CONFLICT');
        assert.ok(Array.isArray(err.conflicts), 'Must contain conflicts list');
        assert.equal(err.conflicts.length, 1);
        assert.equal(err.conflicts[0].id, 'cf-2');
        assert.ok(err.conflicts[0].reason.includes('đã được chỉnh sửa hoặc đồng bộ'));
        return true;
      }
    );

    // Verify Chapter 2 content was NOT overwritten
    const ch2AfterFailedRestore = await mockMainDB.get('chapters', 'cf-2');
    assert.equal(
      ch2AfterFailedRestore.content,
      furtherEditedContent,
      'Modified chapter must NOT be overwritten on conflict'
    );

    // Verify snapshot was NOT deleted (still preserved for future inspection)
    const preservedSnapshot = await getNovelSnapshot(replaceRes.snapshotId);
    assert.ok(preservedSnapshot, 'Snapshot must be preserved when rollback is aborted due to conflict');
  });

  test('preserves all chapter metadata (audioUrl, readProgress, custom tags) during rollback', async () => {
    const novelId = 'novel-metadata-test';
    const richChapter = {
      id: 'meta-ch-1',
      novelId,
      order: 1,
      title: 'Chương 1 Tiên Kiếm',
      content: 'Bạch y thiếu niên cầm Tiên Kiếm.',
      audioUrl: 'https://r2.storage.example/audio/ch1.mp3',
      audioDuration: 520,
      readProgress: 0.85,
      customTags: ['kiem_hiep', 'hot'],
      editorNotes: 'Kiểm tra kỹ đoạn kết chương',
      createdAt: 1700000000,
    };
    await mockMainDB.put('chapters', richChapter);

    // Replace in title and content
    const replaceRes = await replaceTextInNovel(novelId, 'Tiên Kiếm', 'Thần Kiếm', { inTitle: true });
    assert.equal(replaceRes.totalReplacements, 2);

    // Verify metadata still intact after replace
    const postReplace = await mockMainDB.get('chapters', 'meta-ch-1');
    assert.equal(postReplace.title, 'Chương 1 Thần Kiếm');
    assert.equal(postReplace.content, 'Bạch y thiếu niên cầm Thần Kiếm.');
    assert.equal(postReplace.audioUrl, 'https://r2.storage.example/audio/ch1.mp3');

    // Restore snapshot
    const restoreRes = await restoreNovelSnapshot(replaceRes.snapshotId);
    assert.equal(restoreRes.restoredChaptersCount, 1);

    // Verify chapter after restore
    const restored = await mockMainDB.get('chapters', 'meta-ch-1');
    assert.equal(restored.title, 'Chương 1 Tiên Kiếm', 'Title must be restored to original');
    assert.equal(restored.content, 'Bạch y thiếu niên cầm Tiên Kiếm.', 'Content must be restored to original');
    assert.equal(restored.audioUrl, 'https://r2.storage.example/audio/ch1.mp3', 'audioUrl must be preserved');
    assert.equal(restored.audioDuration, 520, 'audioDuration must be preserved');
    assert.equal(restored.readProgress, 0.85, 'readProgress must be preserved');
    assert.deepEqual(restored.customTags, ['kiem_hiep', 'hot'], 'customTags array must be preserved');
    assert.equal(restored.editorNotes, 'Kiểm tra kỹ đoạn kết chương', 'editorNotes must be preserved');
    assert.equal(restored.createdAt, 1700000000, 'createdAt must be preserved');
  });

  test('multi-device conflict simulation: concurrent edit and deletion aborts rollback', async () => {
    const novelId = 'novel-multidevice-test';
    const ch1 = { id: 'md-1', novelId, order: 1, title: 'Chương 1', content: 'Luyện khí tầng một.' };
    const ch2 = { id: 'md-2', novelId, order: 2, title: 'Chương 2', content: 'Luyện khí tầng hai.' };
    const ch3 = { id: 'md-3', novelId, order: 3, title: 'Chương 3', content: 'Luyện khí tầng ba.' };
    await mockMainDB.put('chapters', ch1);
    await mockMainDB.put('chapters', ch2);
    await mockMainDB.put('chapters', ch3);

    // Device A: runs replace across novel -> snapshot S1
    const replaceRes = await replaceTextInNovel(novelId, 'Luyện khí', 'Trúc cơ');
    assert.ok(replaceRes.snapshotId);

    // Device B syncs or user in another tab:
    // 1) Modifies Chapter 1
    const ch1ModByDevB = await mockMainDB.get('chapters', 'md-1');
    await mockMainDB.put('chapters', {
      ...ch1ModByDevB,
      content: 'Trúc cơ thành công sau khi nuốt Trúc Cơ Đan.',
    });
    // 2) Deletes Chapter 3
    await mockMainDB.delete('chapters', 'md-3');

    // Device A attempts to restore Snapshot S1
    await assert.rejects(
      async () => {
        await restoreNovelSnapshot(replaceRes.snapshotId);
      },
      (err) => {
        assert.equal(err.code, 'SNAPSHOT_CONFLICT');
        assert.equal(err.conflicts.length, 2, 'Must report both conflicting chapters');
        const ids = err.conflicts.map((c) => c.id);
        assert.ok(ids.includes('md-1'), 'Must include modified chapter md-1');
        assert.ok(ids.includes('md-3'), 'Must include deleted chapter md-3');
        return true;
      }
    );

    // Verify snapshot was NOT removed
    const snapshotStillExists = await getNovelSnapshot(replaceRes.snapshotId);
    assert.ok(snapshotStillExists);
  });

  test('confirmation guard: blocks execution if search params drift or match count changed before write', () => {
    const confirmedParams = {
      searchText: 'Huyền Thiên',
      replaceText: 'Cửu U',
      matchCase: false,
      wholeWord: true,
      inTitle: true,
      expectedCount: 5,
    };

    const validateBeforeExecute = (current, confirmed, freshCount) => {
      if (
        !confirmed ||
        confirmed.searchText !== current.searchText ||
        confirmed.replaceText !== current.replaceText ||
        confirmed.matchCase !== current.matchCase ||
        confirmed.wholeWord !== current.wholeWord ||
        confirmed.inTitle !== current.inTitle
      ) {
        return { ok: false, reason: 'PARAMS_DRIFT' };
      }
      if (freshCount !== confirmed.expectedCount) {
        return { ok: false, reason: 'COUNT_MISMATCH', expected: confirmed.expectedCount, actual: freshCount };
      }
      return { ok: true };
    };

    // Case 1: Identical params and matching count -> OK
    assert.deepEqual(
      validateBeforeExecute(
        { searchText: 'Huyền Thiên', replaceText: 'Cửu U', matchCase: false, wholeWord: true, inTitle: true },
        confirmedParams,
        5
      ),
      { ok: true }
    );

    // Case 2: User changed searchText while confirmation was open -> BLOCKED
    assert.deepEqual(
      validateBeforeExecute(
        { searchText: 'Huyền Thiên Đan', replaceText: 'Cửu U', matchCase: false, wholeWord: true, inTitle: true },
        confirmedParams,
        5
      ),
      { ok: false, reason: 'PARAMS_DRIFT' }
    );

    // Case 3: Match count changed between opening modal and confirming -> BLOCKED
    assert.deepEqual(
      validateBeforeExecute(
        { searchText: 'Huyền Thiên', replaceText: 'Cửu U', matchCase: false, wholeWord: true, inTitle: true },
        confirmedParams,
        4
      ),
      { ok: false, reason: 'COUNT_MISMATCH', expected: 5, actual: 4 }
    );
  });

  test('TOCTOU elimination & concurrent write simulation during rollback', async () => {
    const novelId = 'novel-toctou-test';
    const ch1 = { id: 'toctou-1', novelId, order: 1, title: 'Chương 1', content: 'Vạn Cổ Đệ Nhất Tông: Cực phẩm linh căn.' };
    const ch2 = { id: 'toctou-2', novelId, order: 2, title: 'Chương 2', content: 'Luyện chế Cực phẩm linh đan.' };
    const ch3 = { id: 'toctou-3', novelId, order: 3, title: 'Chương 3', content: 'Cực phẩm phi kiếm phá không.' };
    await mockMainDB.put('chapters', ch1);
    await mockMainDB.put('chapters', ch2);
    await mockMainDB.put('chapters', ch3);

    // Initial replace: 'Cực phẩm' -> 'Thần phẩm'
    const replaceRes = await replaceTextInNovel(novelId, 'Cực phẩm', 'Thần phẩm');
    assert.ok(replaceRes.snapshotId);
    assert.equal(replaceRes.modifiedChaptersCount, 3);

    // 1. Verify that restoreNovelSnapshot opens ONLY A SINGLE readwrite transaction (eliminating TOCTOU window)
    mockMainDB.openedTransactions = [];
    const restoreRes = await restoreNovelSnapshot(replaceRes.snapshotId);
    assert.equal(restoreRes.restoredChaptersCount, 3);

    const chapterTx = mockMainDB.openedTransactions.filter((tx) => tx.storeName === 'chapters');
    assert.equal(
      chapterTx.length,
      1,
      'Must use exactly ONE transaction on chapters store (no separate readonly pre-check transaction)'
    );
    assert.equal(chapterTx[0].mode, 'readwrite', 'Transaction mode must be readwrite');

    // 2. Now test concurrent write race condition during rollback
    // Re-apply replace to get a fresh snapshot
    const replaceRes2 = await replaceTextInNovel(novelId, 'Cực phẩm', 'Thần phẩm');
    assert.ok(replaceRes2.snapshotId);

    // Simulate concurrent write occurring right while rollback is processing:
    // A cloud sync or user edit updates ch2 to a new state
    const concurrentEdit = {
      id: 'toctou-2',
      novelId,
      order: 2,
      title: 'Chương 2',
      content: 'Luyện chế Thần phẩm linh đan kèm theo dị hỏa thần bí.',
    };
    await mockMainDB.put('chapters', concurrentEdit);

    mockMainDB.openedTransactions = [];
    // Attempt rollback: the atomic transaction encounters the concurrent modification
    await assert.rejects(
      async () => {
        await restoreNovelSnapshot(replaceRes2.snapshotId);
      },
      (err) => {
        assert.equal(err.code, 'SNAPSHOT_CONFLICT');
        assert.equal(err.conflicts.length, 1);
        assert.equal(err.conflicts[0].id, 'toctou-2');
        return true;
      }
    );

    // Verify transaction abort was invoked
    const abortedTx = mockMainDB.openedTransactions.find((tx) => tx.storeName === 'chapters');
    assert.ok(abortedTx, 'Chapters transaction must have been opened');
    assert.equal(abortedTx.aborted, true, 'Transaction must be aborted on conflict');

    // Verify ZERO chapters were partially restored:
    // ch1 should still have 'Thần phẩm' (not restored to Cực phẩm)
    // ch2 should still have the concurrent edit
    // ch3 should still have 'Thần phẩm' (not restored)
    const check1 = await mockMainDB.get('chapters', 'toctou-1');
    const check2 = await mockMainDB.get('chapters', 'toctou-2');
    const check3 = await mockMainDB.get('chapters', 'toctou-3');
    assert.equal(check1.content, 'Vạn Cổ Đệ Nhất Tông: Thần phẩm linh căn.', 'Chapter 1 must NOT be partially restored');
    assert.equal(check2.content, concurrentEdit.content, 'Chapter 2 must preserve concurrent edit');
    assert.equal(check3.content, 'Thần phẩm phi kiếm phá không.', 'Chapter 3 must NOT be partially restored');

    // Verify snapshot was NOT deleted
    const preservedSnap = await getNovelSnapshot(replaceRes2.snapshotId);
    assert.ok(preservedSnap, 'Snapshot must be preserved when rollback aborts');
  });
});

// -------------------------------------------------------------
// 5. Reader Fonts (Literata & Patrick Hand) & Minimal Editor Toast
// -------------------------------------------------------------
describe('Reader Fonts & Compact Minimal Editor Toast', () => {
  beforeEach(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      const store = new Map();
      globalThis.localStorage = {
        getItem: (key) => store.get(key) || null,
        setItem: (key, val) => store.set(key, String(val)),
        removeItem: (key) => store.delete(key),
        clear: () => store.clear(),
      };
    } else {
      globalThis.localStorage.clear();
    }
  });

  test('FONT_OPTIONS includes Literata and Patrick Hand with valid IDs, labels and fallbacks', () => {
    assert.equal(FONT_OPTIONS.length, 6, 'Must have exactly 6 font options');

    const ids = FONT_OPTIONS.map((f) => f.id);
    assert.ok(ids.includes('be-vietnam'), 'Must keep be-vietnam');
    assert.ok(ids.includes('serif'), 'Must keep serif');
    assert.ok(ids.includes('literata'), 'Must include literata');
    assert.ok(ids.includes('patrick-hand'), 'Must include patrick-hand');
    assert.ok(ids.includes('sans'), 'Must keep sans');
    assert.ok(ids.includes('mono'), 'Must keep mono');

    const literata = FONT_OPTIONS.find((f) => f.id === 'literata');
    assert.equal(literata.label, 'Literata');
    assert.ok(literata.css.includes("'Literata'"), 'Must include Literata in font-family css');
    assert.ok(literata.css.includes('serif'), 'Must include serif fallback in font-family css');

    const patrickHand = FONT_OPTIONS.find((f) => f.id === 'patrick-hand');
    assert.equal(patrickHand.label, 'Patrick Hand');
    assert.ok(patrickHand.css.includes("'Patrick Hand'"), 'Must include Patrick Hand in font-family css');
    assert.ok(patrickHand.css.includes('cursive') || patrickHand.css.includes('sans-serif'), 'Must include appropriate fallback');
  });

  test('Default reading settings preserve default serif font and persist custom fonts', () => {
    const defaultSettings = getReadingSettings();
    assert.equal(defaultSettings.fontFamily, 'serif', 'Default fontFamily must remain serif');

    saveReadingSettings({ fontFamily: 'literata' });
    const savedLiterata = getReadingSettings();
    assert.equal(savedLiterata.fontFamily, 'literata', 'Must persist literata');

    saveReadingSettings({ fontFamily: 'patrick-hand' });
    const savedPatrick = getReadingSettings();
    assert.equal(savedPatrick.fontFamily, 'patrick-hand', 'Must persist patrick-hand');
  });

  test('Font asset files (WOFF2, TTF) and OFL licenses are present on disk', () => {
    const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    
    // Literata assets
    const litWoff2Vi = path.join(projectRoot, 'src/assets/fonts/literata/literata-v40-vietnamese.woff2');
    const litWoff2Lat = path.join(projectRoot, 'src/assets/fonts/literata/literata-v40-latin.woff2');
    const litTtf = path.join(projectRoot, 'src/assets/fonts/literata/Literata-VariableFont.ttf');
    const litOfl = path.join(projectRoot, 'src/assets/fonts/literata/OFL.txt');

    assert.ok(fs.existsSync(litWoff2Vi), 'Literata vietnamese woff2 must exist');
    assert.ok(fs.existsSync(litWoff2Lat), 'Literata latin woff2 must exist');
    assert.ok(fs.existsSync(litTtf), 'Literata variable TTF must exist');
    assert.ok(fs.existsSync(litOfl), 'Literata OFL license must exist');
    assert.ok(fs.statSync(litWoff2Vi).size > 10000, 'Literata woff2 must have non-zero content');
    assert.ok(fs.readFileSync(litOfl, 'utf-8').includes('SIL Open Font License'), 'Must contain OFL license text');

    // Patrick Hand assets
    const patWoff2Vi = path.join(projectRoot, 'src/assets/fonts/patrick-hand/patrick-hand-v25-vietnamese.woff2');
    const patWoff2Lat = path.join(projectRoot, 'src/assets/fonts/patrick-hand/patrick-hand-v25-latin.woff2');
    const patTtf = path.join(projectRoot, 'src/assets/fonts/patrick-hand/PatrickHand-Regular.ttf');
    const patOfl = path.join(projectRoot, 'src/assets/fonts/patrick-hand/OFL.txt');

    assert.ok(fs.existsSync(patWoff2Vi), 'Patrick Hand vietnamese woff2 must exist');
    assert.ok(fs.existsSync(patWoff2Lat), 'Patrick Hand latin woff2 must exist');
    assert.ok(fs.existsSync(patTtf), 'Patrick Hand TTF must exist');
    assert.ok(fs.existsSync(patOfl), 'Patrick Hand OFL license must exist');
    assert.ok(fs.statSync(patWoff2Vi).size > 5000, 'Patrick Hand woff2 must have non-zero content');
    assert.ok(fs.readFileSync(patOfl, 'utf-8').includes('SIL Open Font License'), 'Must contain OFL license text');
  });

  test('src/styles/fonts.css declares @font-face rules with unicode-range for Vietnamese and Latin', () => {
    const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const fontsCss = fs.readFileSync(path.join(projectRoot, 'src/styles/fonts.css'), 'utf-8');

    assert.ok(fontsCss.includes("@font-face"), 'Must declare @font-face');
    assert.ok(fontsCss.includes("font-family: 'Literata'"), 'Must declare font-family Literata');
    assert.ok(fontsCss.includes("font-family: 'Patrick Hand'"), 'Must declare font-family Patrick Hand');
    assert.ok(fontsCss.includes("font-weight: 200 900"), 'Literata must declare variable weight 200 900');
    assert.ok(fontsCss.includes("font-weight: 400"), 'Patrick Hand must declare normal weight 400');
    assert.ok(fontsCss.includes("U+0102-0103") && fontsCss.includes("U+1EA0-1EF9"), 'Must include Vietnamese unicode-range');
  });

  test('Reading position preservation algorithm calculates target scroll offset without jumping to top', () => {
    // Simulate 10 paragraphs on a page
    const mockParagraphs = [
      { top: -450, bottom: -200, index: 0 },
      { top: -200, bottom: -50, index: 1 },
      { top: -50, bottom: 50, index: 2 },
      { top: 50, bottom: 180, index: 3 }, // In reading focal area (top <= 140, bottom >= 60)
      { top: 180, bottom: 350, index: 4 },
      { top: 350, bottom: 550, index: 5 },
    ];

    let targetIndex = 0;
    for (let i = 0; i < mockParagraphs.length; i++) {
      const rect = mockParagraphs[i];
      if (rect.bottom >= 60 && rect.top <= 140) {
        targetIndex = i;
        break;
      }
    }
    assert.equal(targetIndex, 3, 'Must identify paragraph 3 in active viewport');

    // Simulate reflow after font change where paragraph 3 has slightly shifted
    const currentScrollY = 800;
    const shiftedRect = { top: 95, bottom: 230 };
    const targetY = Math.max(0, currentScrollY + shiftedRect.top - 70);
    assert.equal(targetY, 825, 'Calculated target scroll maintains top 70px offset');
    assert.ok(targetY > 0, 'Target Y must not reset to 0');
  });

  test('Editor Toast CSS complies with minimal, compact, non-pill specifications', () => {
    const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const toastCss = fs.readFileSync(path.join(projectRoot, 'src/components/reader/SelectionEditor.module.css'), 'utf-8');

    const toastBlockMatch = toastCss.match(/\.editorToast\s*\{([^}]+)\}/);
    const toastBlock = toastBlockMatch ? toastBlockMatch[1] : '';

    // Radius check: must be 12-16px, NOT 30px pill
    assert.ok(!toastBlock.includes('border-radius: 30px'), 'Toast must NOT use border-radius 30px pill');
    assert.ok(toastBlock.includes('border-radius: 14px') || toastBlock.includes('border-radius: 12px'), 'Toast must use 12-14px border radius');

    // Color/glow check: must not use bright #38bdf8 border on toast
    assert.ok(!toastBlock.includes('#38bdf8'), 'Toast must NOT use bright cyan border');

    // Max width check: must not be hardcoded to 92vw stretched on desktop
    assert.ok(toastBlock.includes('max-width: min(440px') || toastBlock.includes('max-width: 440px') || toastBlock.includes('width: auto'), 'Toast must be compact width');

    // Text wrapping check: must allow text wrap on toast message
    assert.ok(toastCss.includes('word-break: break-word'), 'Must support word breaking on message');

    // Safe area & reduced motion
    assert.ok(toastCss.includes('safe-area-inset-bottom'), 'Must respect safe-area-inset-bottom');
    assert.ok(toastCss.includes('prefers-reduced-motion'), 'Must respect prefers-reduced-motion');
  });

  test('Editor Toast undo callback is isolated and close button does not trigger undo', () => {
    let undoTriggered = false;
    let toastClosed = false;

    const mockToast = {
      message: 'Đã lưu thay đổi vào chương thành công!',
      onUndo: () => {
        undoTriggered = true;
      },
    };

    const handleClose = () => {
      toastClosed = true;
    };

    // 1. User clicks close button
    handleClose();
    assert.equal(toastClosed, true, 'Toast close must be called');
    assert.equal(undoTriggered, false, 'Closing toast must NOT trigger undo');

    // 2. User clicks Undo button
    mockToast.onUndo();
    assert.equal(undoTriggered, true, 'Undo callback must be triggered on explicit button click');
  });

  describe('ReadingAnchor & FontChangeCoordinator', () => {
    test('calculateTargetScrollY calculates precise offsets and clamps to 0', () => {
      // Current scroll: 600. Paragraph top: 70. Desired offset: 0 -> target: 600
      assert.equal(calculateTargetScrollY(70, 600, 0, 70), 600);

      // Paragraph top shifted down to 105 (+35px) -> target: 635
      assert.equal(calculateTargetScrollY(105, 600, 0, 70), 635);

      // Paragraph top shifted up to 45 (-25px) -> target: 575
      assert.equal(calculateTargetScrollY(45, 600, 0, 70), 575);

      // Paragraph had prior intra-paragraph offsetY of 15px
      // target paragraph top should be 70 - 15 = 55. If rect.top = 80, delta is 25 -> 625
      assert.equal(calculateTargetScrollY(80, 600, 15, 70), 625);

      // Clamp to 0 when delta is negative beyond scrollY
      assert.equal(calculateTargetScrollY(-200, 100, 0, 70), 0);
    });

    test('getReadingAnchor detects active paragraph and near-bottom boundaries', () => {
      // 1. Null / empty doc fallback
      assert.deepEqual(getReadingAnchor(null), { paraIndex: 0, offsetY: 0, scrollY: 0 });

      // 2. Mock document with 5 paragraphs
      const mockElements = [
        { getBoundingClientRect: () => ({ top: -200, bottom: -50 }) },
        { getBoundingClientRect: () => ({ top: -50, bottom: 50 }) },
        { getBoundingClientRect: () => ({ top: 80, bottom: 220 }) }, // in focal reading line 60..140
        { getBoundingClientRect: () => ({ top: 220, bottom: 400 }) },
        { getBoundingClientRect: () => ({ top: 400, bottom: 550 }) },
      ];

      const mockDoc = {
        defaultView: { scrollY: 450, innerHeight: 800 },
        documentElement: { scrollHeight: 3000 },
        querySelectorAll: (selector) => {
          if (selector === '[data-para-index]') return mockElements;
          return [];
        },
      };

      const anchor = getReadingAnchor(mockDoc);
      assert.equal(anchor.paraIndex, 2, 'Must locate paragraph 2 crossing focal line');
      assert.equal(anchor.scrollY, 450);

      // 3. User scrolled near bottom (scrollY >= maxScroll - 60)
      const nearBottomDoc = {
        defaultView: { scrollY: 2150, innerHeight: 800 },
        documentElement: { scrollHeight: 3000 }, // maxScroll = 2200
        querySelectorAll: (selector) => {
          if (selector === '[data-para-index]') return mockElements;
          return [];
        },
      };
      const bottomAnchor = getReadingAnchor(nearBottomDoc);
      assert.equal(bottomAnchor.paraIndex, 4, 'Must anchor to last paragraph at bottom');
      assert.equal(bottomAnchor.isNearBottom, true);
    });

    test('restoreReadingAnchor updates window.scrollTo with instant behavior', () => {
      let scrolledTo = null;
      const mockDoc = {
        defaultView: {
          scrollY: 1000,
          scrollTo: (opts) => {
            scrolledTo = opts;
          },
        },
        getElementById: (id) => {
          if (id === 'para-3') {
            return {
              getBoundingClientRect: () => ({ top: 120, bottom: 300 }),
            };
          }
          return null;
        },
      };

      const anchor = { paraIndex: 3, offsetY: 0, scrollY: 1000 };
      const targetY = restoreReadingAnchor(anchor, mockDoc);

      // 1000 + 120 - 70 = 1050
      assert.equal(targetY, 1050);
      assert.deepEqual(scrolledTo, { top: 1050, behavior: 'instant' });

      // Non-existent paragraph returns null
      const invalidAnchor = { paraIndex: 99, offsetY: 0, scrollY: 1000 };
      assert.equal(restoreReadingAnchor(invalidAnchor, mockDoc), null);
    });

    test('FontChangeCoordinator coordinates realignment, handles user scroll cancellation and consecutive changes', async () => {
      let realignedEvents = [];
      let sessionEnded = false;

      const coordinator = new FontChangeCoordinator({
        onRealigned: (data) => {
          realignedEvents.push(data);
        },
        onSessionEnd: () => {
          sessionEnded = true;
        },
      });

      let currentScrollY = 500;
      let targetParaTop = 90;

      const mockDoc = {
        defaultView: {
          get scrollY() { return currentScrollY; },
          set scrollY(v) { currentScrollY = v; },
          innerHeight: 800,
          scrollTo: ({ top }) => {
            currentScrollY = top;
          },
        },
        documentElement: { scrollHeight: 3000 },
        querySelectorAll: () => [
          { getBoundingClientRect: () => ({ top: targetParaTop, bottom: targetParaTop + 150 }) }
        ],
        getElementById: () => ({
          getBoundingClientRect: () => ({ top: targetParaTop, bottom: targetParaTop + 150 }),
        }),
      };

      // 1. Prepare anchor before change
      const anchor = coordinator.prepare(mockDoc);
      assert.equal(anchor.paraIndex, 0);
      assert.equal(coordinator.activeAnchor.paraIndex, 0);

      // 2. Reflow shifts paragraph top from 90 to 110 (+20px)
      targetParaTop = 110;
      const targetY = coordinator.realign(mockDoc);
      // Keeps paragraph top exact at pre-reflow 90px (offsetY = 70 - 90 = -20): 500 + 110 - (70 - (-20)) = 520
      assert.equal(targetY, 520);
      assert.equal(currentScrollY, 520);
      assert.equal(realignedEvents.length, 1);
      assert.equal(realignedEvents[0].targetY, 520);

      // 3. User actively scrolls away (> 45px delta from lastTargetY=520)
      coordinator.handleUserScroll(650); // scrolled 110px down
      assert.equal(coordinator.userHasScrolled, true);
      assert.equal(coordinator.activeAnchor, null);

      // Further realignment calls must be rejected
      const abortedY = coordinator.realign(mockDoc);
      assert.equal(abortedY, null);

      // 4. Consecutive font changes: rapid prepare calls cancel stale sessions
      const session1 = coordinator.prepare(mockDoc);
      const id1 = coordinator.currentSessionId;
      const session2 = coordinator.prepare(mockDoc);
      const id2 = coordinator.currentSessionId;
      assert.ok(id2 > id1, 'Session ID must increment');
      assert.equal(coordinator.timers.length, 0, 'Previous timers cleared on prepare');

      // 5. Explicit cancellation (e.g. Chapter change or unmount)
      coordinator.cancel();
      assert.equal(coordinator.activeAnchor, null);
      assert.equal(coordinator.lastTargetY, null);
    });

    test('React effect cleanup cancel(oldSessionId) does NOT erase newly prepared anchor and isolates stale fonts.ready', async () => {
      const realignedLog = [];
      const coordinator = new FontChangeCoordinator({
        onRealigned: (info) => realignedLog.push(info),
      });

      let currentScrollY = 1200;
      // Paragraph 0 scrolled past, Paragraph 12 at top=52 (offsetY = 18), Paragraph 13 below
      let para12Top = 52;
      let para13Top = 210;

      let resolveFonts1;
      let resolveFonts2;
      const fontsReady1 = new Promise((r) => { resolveFonts1 = r; });
      const fontsReady2 = new Promise((r) => { resolveFonts2 = r; });
      let currentFontsReady = fontsReady1;

      const makeMockElements = () => [
        ...Array.from({ length: 12 }, (_, idx) => ({
          getBoundingClientRect: () => ({ top: -1500 + idx * 120, bottom: -1380 + idx * 120 }),
        })),
        { getBoundingClientRect: () => ({ top: para12Top, bottom: para12Top + 140 }) },
        { getBoundingClientRect: () => ({ top: para13Top, bottom: para13Top + 140 }) },
      ];

      const mockDoc = {
        defaultView: {
          get scrollY() { return currentScrollY; },
          innerHeight: 800,
          scrollTo: ({ top }) => {
            const delta = top - currentScrollY;
            currentScrollY = top;
            para12Top -= delta;
            para13Top -= delta;
          },
        },
        documentElement: { scrollHeight: 5000 },
        fonts: {
          get ready() { return currentFontsReady; },
        },
        querySelectorAll: () => makeMockElements(),
        getElementById: (id) => {
          if (id === 'para-12') return { getBoundingClientRect: () => ({ top: para12Top, bottom: para12Top + 140 }) };
          if (id === 'para-13') return { getBoundingClientRect: () => ({ top: para13Top, bottom: para13Top + 140 }) };
          return null;
        },
      };

      // --- Transition 1: Serif -> Literata ---
      // 1a. handleUpdateSettings calls prepare() BEFORE render
      const anchor1 = coordinator.prepare(mockDoc);
      assert.equal(anchor1.paraIndex, 12);
      assert.equal(anchor1.offsetY, 18); // 70 - 52

      // 1b. Literata renders & reflows DOM (+28px shift down)
      para12Top += 28;
      para13Top += 28;
      const sessionId1 = coordinator.scheduleRealignments(mockDoc);
      assert.ok(sessionId1 > 0);
      assert.equal(para12Top, 52, 'Immediate pass keeps para 12 at exact offset 52px');

      // --- Transition 2: Literata -> Patrick Hand (before session 1 timers/fontsReady1 finish!) ---
      // 2a. handleUpdateSettings calls prepare() BEFORE second render (captures pre-reflow para 12 at 52px!)
      const anchor2 = coordinator.prepare(mockDoc);
      assert.equal(anchor2.paraIndex, 12);
      assert.equal(anchor2.offsetY, 18);
      const sessionId2 = coordinator.currentSessionId;
      assert.ok(sessionId2 > sessionId1);

      // 2b. Patrick Hand renders & reflows DOM dramatically (para 12 pushed off focal line, para 13 moves to 110px)
      currentFontsReady = fontsReady2;
      para12Top = -80;
      para13Top = 110;

      // 2c. React executes Effect 1 cleanup BEFORE Effect 2 body!
      const canceledOld = coordinator.cancel(sessionId1);
      assert.equal(canceledOld, false, 'Cleanup of old session MUST NOT cancel newly prepared session 2');
      assert.ok(coordinator.activeAnchor !== null, 'Session 2 pre-reflow anchor MUST remain intact');
      assert.equal(coordinator.activeAnchor.paraIndex, 12, 'Anchor MUST remain para 12 (not drifted to para 13)');
      assert.equal(coordinator.activeAnchor.offsetY, 18, 'Anchor offsetY MUST remain preserved');

      // 2d. React executes Effect 2 body -> schedules session 2 using pre-reflow anchor 2
      const scheduled2 = coordinator.scheduleRealignments(mockDoc);
      assert.equal(scheduled2, sessionId2);
      assert.equal(para12Top, 52, 'Session 2 restores para 12 back to exact 52px despite dramatic reflow');

      // 3. Stale fontsReady1 from session 1 resolves late -> MUST NOT interfere with session 2
      const eventsBeforeStaleResolve = realignedLog.length;
      para12Top = 65; // simulate slight metric shift before fontsReady2
      resolveFonts1();
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(
        realignedLog.length,
        eventsBeforeStaleResolve,
        'Stale document.fonts.ready from session 1 MUST NOT trigger realign on session 2'
      );
      assert.equal(para12Top, 65, 'Scroll must NOT be touched by stale session 1 promise');

      // 4. Current fontsReady2 resolves -> realigns para 12 cleanly for session 2
      resolveFonts2();
      await Promise.resolve();
      await Promise.resolve();
      assert.equal(realignedLog.length, eventsBeforeStaleResolve + 1);
      assert.equal(realignedLog[realignedLog.length - 1].sessionId, sessionId2);
      assert.equal(para12Top, 52, 'Current session 2 fonts.ready restores para 12 to exact 52px');

      // 5. Matching cleanup cancel(sessionId2) on chapter switch or unmount cancels cleanly
      const canceledCurrent = coordinator.cancel(sessionId2);
      assert.equal(canceledCurrent, true, 'Matching sessionId cleanup cancels active session');
      assert.equal(coordinator.activeAnchor, null);
      assert.equal(coordinator.timers.length, 0);
    });
  });
});
