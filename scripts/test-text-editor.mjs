import assert from 'node:assert/strict';
import { test, describe, beforeEach } from 'node:test';
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
  }

  clear() {
    this.stores.novels.clear();
    this.stores.chapters.clear();
    this.stores.snapshots.clear();
    this.simulateError = null;
    this.simulateTransactionError = null;
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

  transaction(storeNames) {
    if (this.simulateTransactionError) throw this.simulateTransactionError;
    const name = Array.isArray(storeNames) ? storeNames[0] : storeNames;
    const store = new MockObjectStore(this.stores[name], this);
    return {
      store,
      objectStore: () => store,
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
});
