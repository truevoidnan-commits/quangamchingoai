/**
 * IndexedDB layer using `idb`
 * Stores: novels, chapters
 */
import { openDB } from 'idb';
import { getHiddenLibrary, notifyLibraryChanged } from './storage.js';
import { markNovelDirty, recordNovelTombstone, setSyncBypassDirty } from './sync/syncLedger.js';
import { countOccurrences, replaceOccurrences } from './textSearch.js';

export { setSyncBypassDirty };

const DB_NAME = 'thien-co-lau';
const DB_VERSION = 1;

let dbPromise = null;

export function setDBPromiseForTesting(p) {
  dbPromise = p;
}

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Novels store
        if (!db.objectStoreNames.contains('novels')) {
          const novelStore = db.createObjectStore('novels', { keyPath: 'id' });
          novelStore.createIndex('createdAt', 'createdAt');
        }
        // Chapters store
        if (!db.objectStoreNames.contains('chapters')) {
          const chapterStore = db.createObjectStore('chapters', { keyPath: 'id' });
          chapterStore.createIndex('novelId', 'novelId');
          chapterStore.createIndex('novelId_order', ['novelId', 'order']);
        }
      },
    });
  }
  return dbPromise;
}

// ---- Novel CRUD ----

export async function getAllNovels() {
  const db = await getDB();
  const novels = await db.getAll('novels');
  
  // Đảm bảo số chương hiển thị ngoài bìa luôn đồng bộ 100% với số chương thực tế
  const novelsWithAccurateCount = await Promise.all(
    novels.map(async (n) => {
      try {
        const tx = db.transaction('chapters');
        const count = await tx.objectStore('chapters').index('novelId').count(IDBKeyRange.only(n.id));
        return {
          ...n,
          chapterCount: count,
          totalChapters: count,
        };
      } catch (e) {
        return n;
      }
    })
  );
  return novelsWithAccurateCount;
}

export async function getNovel(id) {
  const db = await getDB();
  const novel = await db.get('novels', id);
  if (novel) {
    try {
      const tx = db.transaction('chapters');
      const count = await tx.objectStore('chapters').index('novelId').count(IDBKeyRange.only(id));
      novel.chapterCount = count;
      novel.totalChapters = count;
    } catch (e) {}
  }
  return novel;
}

export async function saveNovel(novel, options = {}) {
  const db = await getDB();
  await db.put('novels', novel);
  if (options?.markDirty && !options?.skipDirty && novel?.id) {
    markNovelDirty(novel.id, novel.updatedAt || Date.now(), 'novel_save');
  }
}

export async function deleteNovelDB(id, options = {}) {
  const db = await getDB();
  const tx = db.transaction(['novels', 'chapters'], 'readwrite');
  // Delete novel
  await tx.objectStore('novels').delete(id);
  // Delete all chapters for this novel
  const chapterIndex = tx.objectStore('chapters').index('novelId');
  let cursor = await chapterIndex.openCursor(IDBKeyRange.only(id));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
  if (!options?.skipDirty && id) {
    recordNovelTombstone(id, Date.now());
  }
  notifyLibraryChanged(id);
}

// ---- Chapter CRUD ----

export async function getChapters(novelId) {
  const db = await getDB();
  const index = db.transaction('chapters').objectStore('chapters').index('novelId_order');
  return index.getAll(IDBKeyRange.bound([novelId, -Infinity], [novelId, Infinity]));
}

export async function getChapter(id) {
  const db = await getDB();
  return db.get('chapters', id);
}

export async function saveChapter(chapter, options = {}) {
  const db = await getDB();
  await db.put('chapters', chapter);
  if (!options?.skipDirty && chapter?.novelId) {
    markNovelDirty(chapter.novelId, Date.now(), 'chapter_edit');
  }
}

export async function saveChaptersBulk(chapters, options = {}) {
  const db = await getDB();
  const tx = db.transaction('chapters', 'readwrite');
  await Promise.all(chapters.map(ch => tx.store.put(ch)));
  await tx.done;
  if (!options?.skipDirty && Array.isArray(chapters) && chapters.length > 0) {
    const novelIds = new Set(chapters.map(c => c?.novelId).filter(Boolean));
    const now = Date.now();
    novelIds.forEach(nId => markNovelDirty(nId, now, 'bulk_add'));
  }
}

export async function deleteChapterDB(id, novelId = null, options = {}) {
  const db = await getDB();
  const tx = db.transaction(['novels', 'chapters'], 'readwrite');
  await tx.objectStore('chapters').delete(id);

  if (novelId) {
    const novel = await tx.objectStore('novels').get(novelId);
    if (novel) {
      const count = await tx.objectStore('chapters').index('novelId').count(IDBKeyRange.only(novelId));
      novel.chapterCount = count;
      novel.totalChapters = count;
      await tx.objectStore('novels').put(novel);
    }
  }
  await tx.done;
  if (!options?.skipDirty && novelId) {
    markNovelDirty(novelId, Date.now(), 'chapter_delete');
  }
}

export async function deleteAllChapters(novelId, options = {}) {
  const db = await getDB();
  const tx = db.transaction(['novels', 'chapters'], 'readwrite');
  const index = tx.objectStore('chapters').index('novelId');
  let cursor = await index.openCursor(IDBKeyRange.only(novelId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  const novel = await tx.objectStore('novels').get(novelId);
  if (novel) {
    novel.chapterCount = 0;
    novel.totalChapters = 0;
    await tx.objectStore('novels').put(novel);
  }
  await tx.done;
  if (!options?.skipDirty && novelId) {
    markNovelDirty(novelId, Date.now());
  }
}

/**
 * Xóa toàn bộ chương của một truyện (dùng khi ghi đè truyện trùng tên khác ID)
 */
export async function deleteChaptersOfNovel(novelId, options = {}) {
  return deleteAllChapters(novelId, options);
}

// ---- Full-text search ----

export async function searchChapters(novelId, query) {
  if (!query || query.trim() === '') return [];
  const chapters = await getChapters(novelId);
  const q = query.toLowerCase().trim();
  const results = [];

  for (const ch of chapters) {
    const titleLower = (ch.title || '').toLowerCase();
    const contentLower = (ch.content || '').toLowerCase();
    const titleMatch = titleLower.includes(q);
    
    // Find all occurrences in content
    let matchCount = 0;
    const snippets = [];
    let pos = contentLower.indexOf(q);

    while (pos !== -1 && matchCount < 100) {
      matchCount++;
      if (snippets.length < 3) {
        const start = Math.max(0, pos - 50);
        const end = Math.min(ch.content.length, pos + q.length + 70);
        const snippetText = 
          (start > 0 ? '...' : '') + 
          ch.content.slice(start, end).trim() + 
          (end < ch.content.length ? '...' : '');
        snippets.push(snippetText);
      }
      pos = contentLower.indexOf(q, pos + Math.max(1, q.length));
    }

    if (titleMatch || matchCount > 0) {
      results.push({
        ...ch,
        matchCount: titleMatch ? matchCount + 1 : matchCount,
        titleMatch,
        snippets: snippets.length > 0 ? snippets : [(ch.content || '').slice(0, 100) + '...'],
        snippet: snippets[0] || '',
      });
    }
  }

  return results;
}

export async function searchAllNovels(query) {
  if (!query || query.trim() === '') return [];
  const novels = await getAllNovels();
  const hiddenIds = new Set(getHiddenLibrary().map(n => n.id));
  const q = query.toLowerCase().trim();
  return novels.filter(n =>
    !hiddenIds.has(n.id) &&
    (n.title.toLowerCase().includes(q) ||
     (n.description && n.description.toLowerCase().includes(q)))
  );
}

// ---- Novel-wide Find & Replace ----

export async function countMatchesInNovel(novelId, searchText, options = {}) {
  if (!novelId || !searchText || !searchText.trim()) {
    return { matchCount: 0, matchingChapters: 0, totalChapters: 0 };
  }
  const { matchCase = false, wholeWord = true, inTitle = true } = options;
  const chapters = await getChapters(novelId);
  if (!chapters || chapters.length === 0) {
    return { matchCount: 0, matchingChapters: 0, totalChapters: 0 };
  }

  let matchCount = 0;
  let matchingChapters = 0;

  for (const ch of chapters) {
    let chMatches = 0;
    const content = ch.content || '';
    const title = ch.title || '';

    const contentMatches = countOccurrences(content, searchText, { matchCase, wholeWord });
    chMatches += contentMatches;

    if (inTitle && title) {
      const titleMatches = countOccurrences(title, searchText, { matchCase, wholeWord });
      chMatches += titleMatches;
    }

    if (chMatches > 0) {
      matchCount += chMatches;
      matchingChapters++;
    }
  }

  return {
    matchCount,
    matchingChapters,
    totalChapters: chapters.length,
  };
}

export async function replaceTextInNovel(novelId, searchText, replaceText = '', options = {}) {
  if (!novelId || !searchText || !searchText.trim()) {
    throw new Error('Thiếu thông tin truyện hoặc cụm từ tìm kiếm.');
  }

  const { matchCase = false, wholeWord = true, inTitle = true } = options;
  const chapters = await getChapters(novelId);
  if (!chapters || chapters.length === 0) {
    return {
      totalChapters: 0,
      modifiedChaptersCount: 0,
      totalReplacements: 0,
      modifiedChapters: [],
    };
  }

  let totalReplacements = 0;
  const originalChapters = [];
  const modifiedChapters = [];

  for (const ch of chapters) {
    let contentChanged = false;
    let titleChanged = false;
    let newContent = ch.content || '';
    let newTitle = ch.title || '';

    const contentRes = replaceOccurrences(newContent, searchText, replaceText, { matchCase, wholeWord });
    if (contentRes.count > 0) {
      newContent = contentRes.newText;
      totalReplacements += contentRes.count;
      contentChanged = true;
    }

    if (inTitle && newTitle) {
      const titleRes = replaceOccurrences(newTitle, searchText, replaceText, { matchCase, wholeWord });
      if (titleRes.count > 0) {
        newTitle = titleRes.newText;
        totalReplacements += titleRes.count;
        titleChanged = true;
      }
    }

    if (contentChanged || titleChanged) {
      originalChapters.push({
        id: ch.id,
        novelId: ch.novelId || novelId,
        order: ch.order,
        title: ch.title || '',
        content: ch.content || '',
      });
      modifiedChapters.push({
        ...ch,
        content: newContent,
        title: newTitle,
      });
    }
  }

  let snapshotId = null;
  if (modifiedChapters.length > 0) {
    // 1. Create restorable backup snapshot before writing - STRICT FAIL-CLOSED!
    const { saveNovelSnapshot } = await import('./novelSnapshot.js');
    let snap;
    try {
      snap = await saveNovelSnapshot({
        novelId,
        searchText,
        replaceText,
        options: { matchCase, wholeWord, inTitle },
        totalReplacements,
        originalChapters,
        modifiedChapters,
      });
    } catch (snapErr) {
      console.error('Lỗi nghiêm trọng: Không thể lưu snapshot an toàn trước khi thay thế:', snapErr);
      throw new Error(
        `Không thể tạo bản sao lưu an toàn trước khi thay thế (${snapErr.message || snapErr}). Thao tác đã bị dừng để bảo vệ dữ liệu truyện.`
      );
    }

    if (!snap || !snap.id) {
      throw new Error(
        'Lỗi tạo bản sao lưu an toàn: ID bản sao lưu không hợp lệ. Thao tác đã bị dừng để bảo vệ dữ liệu truyện.'
      );
    }
    snapshotId = snap.id;

    // 2. Atomic write of all modified chapters in IndexedDB - ONLY executed after snapshot is verified!
    await saveChaptersBulk(modifiedChapters);
  }

  return {
    totalChapters: chapters.length,
    modifiedChaptersCount: modifiedChapters.length,
    totalReplacements,
    modifiedChapters,
    snapshotId,
  };
}

/**
 * Khôi phục trạng thái các chương truyện từ bản sao lưu an toàn (snapshot).
 */
export async function restoreNovelSnapshot(snapshotId) {
  const { restoreNovelSnapshot: restore } = await import('./novelSnapshot.js');
  return restore(snapshotId, getDB);
}

/**
 * Tự động đối chiếu và đồng bộ lại số chương trong Thư viện (Library) theo dữ liệu thật trong IndexedDB.
 * Ngăn chặn lỗi số chương "ảo" (khi metadata cloud trả về số chương khác với nội dung thực tế máy đang có).
 *
 * @param {string[]} [novelIds] - Danh sách novelId cụ thể cần đối chiếu, hoặc null để đối chiếu toàn bộ
 * @returns {Promise<number>} Số truyện đã được sửa lại số chương
 */
export async function reconcileLibraryChapterCounts(novelIds = null) {
  try {
    const { getLibrary, updateLibraryItem } = await import('./storage.js');
    const library = getLibrary({ includeHidden: true });
    if (!library || library.length === 0) return 0;

    const db = await getDB();
    const tx = db.transaction(['novels', 'chapters'], 'readonly');
    const chapterStore = tx.objectStore('chapters');
    const chapterIndex = chapterStore.index('novelId');

    const targetList = Array.isArray(novelIds) && novelIds.length > 0
      ? library.filter(item => novelIds.includes(item.id))
      : library;

    let reconciledCount = 0;
    for (const item of targetList) {
      if (!item?.id) continue;
      const realCount = await chapterIndex.count(IDBKeyRange.only(item.id));
      if (realCount > 0 && (item.chapterCount !== realCount || item.totalChapters !== realCount)) {
        updateLibraryItem(item.id, {
          chapterCount: realCount,
          totalChapters: realCount,
          updatedAt: item.updatedAt,
        }, { touch: false });
        reconciledCount++;
      }
    }
    return reconciledCount;
  } catch (err) {
    console.warn('Lỗi khi reconcileLibraryChapterCounts:', err);
    return 0;
  }
}

/**
 * Lấy thứ tự chương THẬT (1-based) và tổng số chương của truyện từ IndexedDB.
 * Đếm theo order trong index 'novelId_order'.
 * 
 * @param {string} novelId 
 * @param {string} chapterId 
 * @returns {Promise<{ position: number, total: number } | null>}
 */
export async function getChapterPosition(novelId, chapterId) {
  if (!novelId || !chapterId) return null;
  try {
    const db = await getDB();
    const chapter = await db.get('chapters', chapterId);
    if (!chapter || chapter.order === undefined || chapter.order === null) {
      return null;
    }
    const targetNovelId = chapter.novelId || novelId;
    const tx = db.transaction('chapters', 'readonly');
    const store = tx.objectStore('chapters');
    const orderIndex = store.index('novelId_order');
    const novelIndex = store.index('novelId');

    const [position, total] = await Promise.all([
      orderIndex.count(IDBKeyRange.bound([targetNovelId, -Infinity], [targetNovelId, chapter.order], false, false)),
      novelIndex.count(IDBKeyRange.only(targetNovelId)),
    ]);

    await tx.done;

    if (position === 0) return null;
    return {
      position,
      total: total || position,
    };
  } catch (err) {
    console.warn('Lỗi khi getChapterPosition:', err);
    return null;
  }
}
