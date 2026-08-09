/**
 * IndexedDB layer using `idb`
 * Stores: novels, chapters
 */
import { openDB } from 'idb';

const DB_NAME = 'thien-co-lau';
const DB_VERSION = 1;

let dbPromise = null;

function getDB() {
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

export async function saveNovel(novel) {
  const db = await getDB();
  await db.put('novels', novel);
}

export async function deleteNovelDB(id) {
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

export async function saveChapter(chapter) {
  const db = await getDB();
  await db.put('chapters', chapter);
}

export async function saveChaptersBulk(chapters) {
  const db = await getDB();
  const tx = db.transaction('chapters', 'readwrite');
  await Promise.all(chapters.map(ch => tx.store.put(ch)));
  await tx.done;
}

export async function deleteChapterDB(id, novelId = null) {
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
}

export async function deleteAllChapters(novelId) {
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
  const q = query.toLowerCase().trim();
  return novels.filter(n =>
    n.title.toLowerCase().includes(q) ||
    (n.description && n.description.toLowerCase().includes(q))
  );
}
