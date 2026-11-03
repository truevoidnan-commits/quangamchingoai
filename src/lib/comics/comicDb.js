/**
 * Dedicated IndexedDB layer for Comics ('thien-co-lau-comics')
 * Completely isolated from main 'thien-co-lau' text novel database.
 * 
 * Stores:
 * - series: { id, title, coverBlob, createdAt, updatedAt }
 * - volumes: { id, seriesId, title, order, pageCount, widthHint, totalBytes, quality, sourceName, createdAt, updatedAt, importState }
 * - pages: { key: `${volumeId}:${String(index).padStart(5, '0')}`, volumeId, index, blob, w, h }
 */
import { openDB } from 'idb';
import { nanoid } from '../nanoid.js';

const DB_NAME = 'thien-co-lau-comics';
const DB_VERSION = 1;

let dbPromise = null;

export function setComicDBForTesting(p) {
  dbPromise = p;
}

export function getComicDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Series store
        if (!db.objectStoreNames.contains('series')) {
          const seriesStore = db.createObjectStore('series', { keyPath: 'id' });
          seriesStore.createIndex('createdAt', 'createdAt');
          seriesStore.createIndex('updatedAt', 'updatedAt');
        }
        // Volumes store
        if (!db.objectStoreNames.contains('volumes')) {
          const volumeStore = db.createObjectStore('volumes', { keyPath: 'id' });
          volumeStore.createIndex('seriesId', 'seriesId');
          volumeStore.createIndex('seriesId_order', ['seriesId', 'order']);
          volumeStore.createIndex('importState', 'importState');
        }
        // Pages store
        if (!db.objectStoreNames.contains('pages')) {
          const pageStore = db.createObjectStore('pages', { keyPath: 'key' });
          pageStore.createIndex('volumeId', 'volumeId');
        }
      },
    });
  }
  return dbPromise;
}

export function formatPageKey(volumeId, index) {
  return `${volumeId}:${String(index).padStart(5, '0')}`;
}

// ---- Title & Order parsing helpers ----

/**
 * Extracts a numeric volume/chapter order from a filename or title string.
 * Examples:
 * "One Piece Tập 12.pdf" -> 12
 * "Vol. 03" -> 3
 * "Chap 105" -> 105
 * "Bleach - 54 (Digital)" -> 54
 * Fallback to 1 if no number found.
 */
export function parseVolumeOrder(titleOrFilename, defaultOrder = 1) {
  if (!titleOrFilename) return defaultOrder;
  const cleaned = titleOrFilename.replace(/\.pdf$/i, '').trim();

  // 1. Explicit keyword matches: Tập/Vol/Volume/Chương/Hồi/Quyển/Book followed by number
  const keywordMatch = cleaned.match(/(?:tập|vol(?:ume)?\.?|chương|quyển|chap(?:ter)?\.?|hồi|bk|book)\s*(\d+(?:\.\d+)?)/i);
  if (keywordMatch && keywordMatch[1]) {
    const num = parseFloat(keywordMatch[1]);
    if (!isNaN(num)) return num;
  }

  // 2. Trailing number or standalone number after dash/underscore/space
  const trailingMatch = cleaned.match(/(?:^|[\s_\-#[\]()])(\d+(?:\.\d+)?)(?:\s*(?:\[|\(|END|HẾT|RAW|HD|WebP|HQ|Digital)?\s*)*$/i);
  if (trailingMatch && trailingMatch[1]) {
    const num = parseFloat(trailingMatch[1]);
    if (!isNaN(num)) return num;
  }

  // 3. Any isolated number
  const anyNumMatch = cleaned.match(/\b(\d+(?:\.\d+)?)\b/);
  if (anyNumMatch && anyNumMatch[1]) {
    const num = parseFloat(anyNumMatch[1]);
    if (!isNaN(num)) return num;
  }

  return defaultOrder;
}

/**
 * Formats a clean volume display title from a filename if not provided.
 * "One_Piece_Vol_01.pdf" -> "Tập 01" or clean name
 */
export function cleanVolumeTitle(filename, order) {
  if (!filename) return `Tập ${order || 1}`;
  const base = filename.replace(/\.pdf$/i, '').replace(/[_+]/g, ' ').trim();
  return base;
}

/**
 * Natural comparator for volume sorting by order then title
 */
export function compareVolumes(a, b) {
  if (a.order !== b.order) {
    return (a.order || 0) - (b.order || 0);
  }
  return (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' });
}

// ---- Reading Progress (LocalStorage) ----

export function getComicProgress(volumeId) {
  if (!volumeId) return null;
  try {
    const raw = localStorage.getItem(`tcl_comic_progress_${volumeId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      pageIndex: typeof parsed.pageIndex === 'number' ? parsed.pageIndex : 0,
      scrollPercent: typeof parsed.scrollPercent === 'number' ? parsed.scrollPercent : 0,
      updatedAt: parsed.updatedAt || 0,
    };
  } catch (e) {
    return null;
  }
}

export function saveComicProgress(volumeId, { pageIndex = 0, scrollPercent = 0 }) {
  if (!volumeId) return;
  try {
    const data = {
      pageIndex: Math.max(0, pageIndex),
      scrollPercent: Math.max(0, Math.min(100, scrollPercent)),
      updatedAt: Date.now(),
    };
    localStorage.setItem(`tcl_comic_progress_${volumeId}`, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save comic progress:', e);
  }
}

export function removeComicProgress(volumeId) {
  if (!volumeId) return;
  try {
    localStorage.removeItem(`tcl_comic_progress_${volumeId}`);
  } catch (e) {}
}

// ---- Series CRUD ----

export async function getAllSeries() {
  const db = await getComicDB();
  const allSeries = await db.getAll('series');

  // Count volumes and total bytes for each series
  const seriesWithMeta = await Promise.all(
    allSeries.map(async (s) => {
      try {
        const tx = db.transaction('volumes', 'readonly');
        const volIndex = tx.objectStore('volumes').index('seriesId');
        let cursor = await volIndex.openCursor(IDBKeyRange.only(s.id));
        let volumeCount = 0;
        let totalPages = 0;
        let totalBytes = 0;
        while (cursor) {
          if (cursor.value.importState === 'ready') {
            volumeCount++;
            totalPages += cursor.value.pageCount || 0;
            totalBytes += cursor.value.totalBytes || 0;
          }
          cursor = await cursor.continue();
        }
        return {
          ...s,
          volumeCount,
          totalPages,
          totalBytes,
        };
      } catch (e) {
        return {
          ...s,
          volumeCount: 0,
          totalPages: 0,
          totalBytes: 0,
        };
      }
    })
  );

  // Sort by updatedAt descending
  return seriesWithMeta.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function getSeries(id) {
  if (!id) return null;
  const db = await getComicDB();
  const s = await db.get('series', id);
  if (!s) return null;

  try {
    const tx = db.transaction('volumes', 'readonly');
    const volIndex = tx.objectStore('volumes').index('seriesId');
    let cursor = await volIndex.openCursor(IDBKeyRange.only(id));
    let volumeCount = 0;
    let totalPages = 0;
    let totalBytes = 0;
    while (cursor) {
      if (cursor.value.importState === 'ready') {
        volumeCount++;
        totalPages += cursor.value.pageCount || 0;
        totalBytes += cursor.value.totalBytes || 0;
      }
      cursor = await cursor.continue();
    }
    return {
      ...s,
      volumeCount,
      totalPages,
      totalBytes,
    };
  } catch (e) {
    return s;
  }
}

export async function saveSeries(series) {
  const db = await getComicDB();
  const now = Date.now();
  const toSave = {
    id: series.id || nanoid(),
    title: (series.title || 'Bộ truyện chưa đặt tên').trim(),
    coverBlob: series.coverBlob || null,
    createdAt: series.createdAt || now,
    updatedAt: now,
  };
  await db.put('series', toSave);
  return toSave;
}

export async function updateSeries(id, patch) {
  const db = await getComicDB();
  const existing = await db.get('series', id);
  if (!existing) return null;
  const updated = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  };
  await db.put('series', updated);
  return updated;
}

// ---- Volume CRUD ----

export async function getVolumes(seriesId, includeAllStates = false) {
  if (!seriesId) return [];
  const db = await getComicDB();
  const tx = db.transaction('volumes', 'readonly');
  const index = tx.objectStore('volumes').index('seriesId');
  const list = await index.getAll(IDBKeyRange.only(seriesId));
  const filtered = includeAllStates ? list : list.filter((v) => v.importState === 'ready');
  return filtered.sort(compareVolumes);
}

export async function getVolume(id) {
  if (!id) return null;
  const db = await getComicDB();
  return db.get('volumes', id);
}

export async function saveVolume(volume) {
  const db = await getComicDB();
  const now = Date.now();
  const toSave = {
    id: volume.id || nanoid(),
    seriesId: volume.seriesId,
    title: (volume.title || `Tập ${volume.order || 1}`).trim(),
    order: typeof volume.order === 'number' ? volume.order : 1,
    pageCount: volume.pageCount || 0,
    widthHint: volume.widthHint || 1200,
    totalBytes: volume.totalBytes || 0,
    quality: volume.quality || 'balanced',
    sourceName: volume.sourceName || '',
    createdAt: volume.createdAt || now,
    updatedAt: now,
    importState: volume.importState || 'importing',
    pageMeta: volume.pageMeta || [], // [{ w, h }] for fast placeholder sizing
  };
  await db.put('volumes', toSave);
  return toSave;
}

export async function updateVolume(id, patch) {
  const db = await getComicDB();
  const existing = await db.get('volumes', id);
  if (!existing) return null;
  const updated = {
    ...existing,
    ...patch,
    updatedAt: Date.now(),
  };
  await db.put('volumes', updated);

  // Touch series updatedAt so library sorting reflects activity
  if (updated.seriesId) {
    try {
      const series = await db.get('series', updated.seriesId);
      if (series) {
        series.updatedAt = Date.now();
        if (!series.coverBlob && patch.coverBlob) {
          series.coverBlob = patch.coverBlob;
        }
        await db.put('series', series);
      }
    } catch (e) {}
  }

  return updated;
}

// ---- Pages CRUD ----

export async function savePagesBulk(pages) {
  if (!pages || pages.length === 0) return;
  const db = await getComicDB();
  const tx = db.transaction('pages', 'readwrite');
  const store = tx.objectStore('pages');
  for (const page of pages) {
    const key = page.key || formatPageKey(page.volumeId, page.index);
    await store.put({
      key,
      volumeId: page.volumeId,
      index: page.index,
      blob: page.blob,
      w: page.w,
      h: page.h,
    });
  }
  await tx.done;
}

export async function getPage(volumeId, index) {
  if (!volumeId || typeof index !== 'number') return null;
  const db = await getComicDB();
  const key = formatPageKey(volumeId, index);
  return db.get('pages', key);
}

export async function getPageRange(volumeId, startIndex, endIndex) {
  if (!volumeId) return [];
  const db = await getComicDB();
  const promises = [];
  for (let i = startIndex; i <= endIndex; i++) {
    promises.push(db.get('pages', formatPageKey(volumeId, i)));
  }
  const results = await Promise.all(promises);
  return results.filter(Boolean);
}

export async function getVolumePageMeta(volumeId) {
  if (!volumeId) return [];
  const db = await getComicDB();
  // Check if volume record already has pageMeta cached
  const vol = await db.get('volumes', volumeId);
  if (vol?.pageMeta && vol.pageMeta.length > 0) {
    return vol.pageMeta;
  }

  // Otherwise scan index
  const tx = db.transaction('pages', 'readonly');
  const index = tx.objectStore('pages').index('volumeId');
  let cursor = await index.openCursor(IDBKeyRange.only(volumeId));
  const meta = [];
  while (cursor) {
    meta.push({
      index: cursor.value.index,
      w: cursor.value.w,
      h: cursor.value.h,
    });
    cursor = await cursor.continue();
  }
  meta.sort((a, b) => a.index - b.index);
  return meta;
}

// ---- Cascade Deletion ----

export async function deleteVolume(volumeId) {
  if (!volumeId) return;
  const db = await getComicDB();
  const vol = await db.get('volumes', volumeId);

  // 1. Delete all pages in 'pages' store with volumeId
  const tx = db.transaction(['volumes', 'pages', 'series'], 'readwrite');
  const pageIndex = tx.objectStore('pages').index('volumeId');
  let cursor = await pageIndex.openCursor(IDBKeyRange.only(volumeId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }

  // 2. Delete the volume
  await tx.objectStore('volumes').delete(volumeId);

  // 3. Touch series updatedAt
  if (vol?.seriesId) {
    const series = await tx.objectStore('series').get(vol.seriesId);
    if (series) {
      series.updatedAt = Date.now();
      await tx.objectStore('series').put(series);
    }
  }

  await tx.done;

  // 4. Remove local reading progress
  removeComicProgress(volumeId);
}

export async function deleteSeries(seriesId) {
  if (!seriesId) return;
  const db = await getComicDB();
  
  // 1. Find all volumes for this series
  const volIndex = db.transaction('volumes', 'readonly').objectStore('volumes').index('seriesId');
  const volumes = await volIndex.getAll(IDBKeyRange.only(seriesId));

  // 2. Delete each volume (and its pages & progress)
  for (const vol of volumes) {
    await deleteVolume(vol.id);
  }

  // 3. Delete series
  await db.delete('series', seriesId);
}

// ---- Orphan Cleanup ----

/**
 * Cleans up any leftover volumes stuck in 'importing' state
 * (e.g. if the tab was closed or user aborted mid-import).
 */
export async function cleanOrphanImportingVolumes() {
  try {
    const db = await getComicDB();
    const allVolumes = await db.getAll('volumes');
    const stuck = allVolumes.filter((v) => v.importState === 'importing');
    
    for (const vol of stuck) {
      console.warn(`[ComicDB] Cleaning up incomplete importing volume: ${vol.id} (${vol.title})`);
      await deleteVolume(vol.id);

      // If series now has zero volumes, check if it was newly created
      if (vol.seriesId) {
        const remaining = await getVolumes(vol.seriesId, true);
        if (remaining.length === 0) {
          const s = await db.get('series', vol.seriesId);
          // Only auto-delete empty series if it was created very recently (within 1 hour)
          if (s && Date.now() - (s.createdAt || 0) < 3600000) {
            console.warn(`[ComicDB] Cleaning empty newly-created series: ${vol.seriesId}`);
            await db.delete('series', vol.seriesId);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[ComicDB] Error during orphan cleanup:', err);
  }
}

// ---- Storage Estimate Helper ----

export async function getComicsStorageStats() {
  let usage = 0;
  let quota = 0;
  let persisted = false;

  if (typeof navigator !== 'undefined' && navigator.storage) {
    if (navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        usage = estimate.usage || 0;
        quota = estimate.quota || 0;
      } catch (e) {}
    }
    if (navigator.storage.persisted) {
      try {
        persisted = await navigator.storage.persisted();
      } catch (e) {}
    }
  }

  // Calculate comics-only totalBytes from DB
  let comicsBytes = 0;
  let totalComicsPages = 0;
  try {
    const db = await getComicDB();
    const vols = await db.getAll('volumes');
    for (const v of vols) {
      if (v.importState === 'ready') {
        comicsBytes += v.totalBytes || 0;
        totalComicsPages += v.pageCount || 0;
      }
    }
  } catch (e) {}

  return {
    comicsBytes,
    totalComicsPages,
    storageUsage: usage,
    storageQuota: quota,
    isPersisted: persisted,
  };
}

export async function requestStoragePersistence() {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      return await navigator.storage.persist();
    } catch (e) {
      return false;
    }
  }
  return false;
}
