/**
 * novelSnapshot.js
 * Safe snapshot and rollback mechanism for novel-wide text replacement operations.
 *
 * Guarantees:
 * 1. Takes pre-mutation snapshots of ONLY affected chapters before batch writes.
 * 2. Dedicated IndexedDB database ('tcl-editor-snapshots') prevents schema migration
 *    risks on the main reading database.
 * 3. Enforces strict retention policy (max 5 snapshots per novel, max 15 overall, 7-day TTL)
 *    to prevent unbounded storage growth.
 * 4. Atomic restoration through a single IndexedDB transaction.
 */

import { openDB } from 'idb';

const SNAPSHOT_DB_NAME = 'tcl-editor-snapshots';
const SNAPSHOT_DB_VERSION = 1;
const MAX_SNAPSHOTS_PER_NOVEL = 5;
const MAX_TOTAL_SNAPSHOTS = 15;
const SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

let snapshotDbPromise = null;

export function setSnapshotDBPromiseForTesting(p) {
  snapshotDbPromise = p;
}

export function getSnapshotDB() {
  if (!snapshotDbPromise) {
    snapshotDbPromise = openDB(SNAPSHOT_DB_NAME, SNAPSHOT_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('snapshots')) {
          const store = db.createObjectStore('snapshots', { keyPath: 'id' });
          store.createIndex('novelId', 'novelId');
          store.createIndex('createdAt', 'createdAt');
        }
      },
    });
  }
  return snapshotDbPromise;
}

/**
 * Prunes expired or excess snapshots to prevent storage bloat.
 */
export async function pruneSnapshots() {
  try {
    const sdb = await getSnapshotDB();
    const tx = sdb.transaction('snapshots', 'readwrite');
    const store = tx.objectStore('snapshots');
    const all = await store.getAll();

    const now = Date.now();
    const toDeleteIds = new Set();

    // 1. Remove expired snapshots (> 7 days)
    for (const snap of all) {
      if (!snap.createdAt || now - snap.createdAt > SNAPSHOT_TTL_MS) {
        toDeleteIds.add(snap.id);
      }
    }

    // 2. Enforce max per novel
    const novelGroups = {};
    for (const snap of all) {
      if (toDeleteIds.has(snap.id)) continue;
      const nId = snap.novelId || 'unknown';
      if (!novelGroups[nId]) novelGroups[nId] = [];
      novelGroups[nId].push(snap);
    }

    for (const nId of Object.keys(novelGroups)) {
      const list = novelGroups[nId].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      if (list.length > MAX_SNAPSHOTS_PER_NOVEL) {
        const excess = list.slice(MAX_SNAPSHOTS_PER_NOVEL);
        excess.forEach((s) => toDeleteIds.add(s.id));
      }
    }

    // 3. Enforce global total cap
    const surviving = all.filter((s) => !toDeleteIds.has(s.id));
    if (surviving.length > MAX_TOTAL_SNAPSHOTS) {
      surviving.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const globalExcess = surviving.slice(MAX_TOTAL_SNAPSHOTS);
      globalExcess.forEach((s) => toDeleteIds.add(s.id));
    }

    // Execute deletions in current transaction
    for (const id of toDeleteIds) {
      await store.delete(id);
    }

    await tx.done;
  } catch (err) {
    console.warn('Lỗi khi dọn dẹp snapshot cũ:', err);
  }
}

/**
 * Saves a pre-mutation snapshot of chapters before applying a batch replacement.
 *
 * @param {object} params
 * @param {string} params.novelId - Novel ID
 * @param {string} params.searchText - Search term
 * @param {string} params.replaceText - Replacement text
 * @param {object} [params.options] - Matching options
 * @param {number} params.totalReplacements - Match count
 * @param {Array<object>} params.originalChapters - Original state of modified chapters
 * @returns {Promise<object>} The saved snapshot record
 */
export async function saveNovelSnapshot({
  novelId,
  searchText,
  replaceText = '',
  options = {},
  totalReplacements = 0,
  originalChapters = [],
}) {
  if (!novelId || !Array.isArray(originalChapters) || originalChapters.length === 0) {
    throw new Error('Dữ liệu snapshot không hợp lệ: thiếu novelId hoặc danh sách chương gốc.');
  }

  // Sanitize original chapters to store only essential content fields
  const sanitizedChapters = originalChapters.map((ch) => ({
    id: ch.id,
    novelId: ch.novelId || novelId,
    order: ch.order,
    title: ch.title || '',
    content: ch.content || '',
  }));

  const snapshotId = `snap_${novelId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const snapshotRecord = {
    id: snapshotId,
    novelId,
    createdAt: Date.now(),
    searchText,
    replaceText,
    options,
    totalReplacements,
    chaptersCount: sanitizedChapters.length,
    originalChapters: sanitizedChapters,
  };

  const sdb = await getSnapshotDB();
  await sdb.put('snapshots', snapshotRecord);

  // Background pruning of old snapshots
  pruneSnapshots().catch(() => {});

  return snapshotRecord;
}

/**
 * Retrieves a snapshot by ID.
 */
export async function getNovelSnapshot(snapshotId) {
  if (!snapshotId) return null;
  const sdb = await getSnapshotDB();
  return sdb.get('snapshots', snapshotId);
}

/**
 * Deletes a snapshot by ID.
 */
export async function deleteNovelSnapshot(snapshotId) {
  if (!snapshotId) return;
  const sdb = await getSnapshotDB();
  return sdb.delete('snapshots', snapshotId);
}

/**
 * Restores all original chapters from a snapshot in a single atomic transaction.
 *
 * @param {string} snapshotId - ID of the snapshot to restore
 * @param {Function} [getMainDBFn] - Function returning main IndexedDB instance
 * @returns {Promise<{ restoredChaptersCount: number, restoredChapters: Array, novelId: string }>}
 */
export async function restoreNovelSnapshot(snapshotId, getMainDBFn) {
  const snapshot = await getNovelSnapshot(snapshotId);
  if (!snapshot || !Array.isArray(snapshot.originalChapters) || snapshot.originalChapters.length === 0) {
    throw new Error('Không tìm thấy bản sao lưu hoặc bản sao lưu không còn nguyên vẹn.');
  }

  const { originalChapters, novelId } = snapshot;

  // Obtain main DB reference
  let mainDB;
  if (getMainDBFn) {
    mainDB = await getMainDBFn();
  } else {
    const { getDB } = await import('./db.js');
    mainDB = await getDB();
  }

  // Atomic transaction on 'chapters' store in main DB
  const tx = mainDB.transaction('chapters', 'readwrite');
  for (const ch of originalChapters) {
    await tx.store.put(ch);
  }
  await tx.done;

  // Mark dirty for sync ledger
  try {
    const { markNovelDirty } = await import('./sync/syncLedger.js');
    markNovelDirty(novelId, Date.now(), 'snapshot_restore');
  } catch (e) {}

  // Delete applied snapshot after successful restore
  await deleteNovelSnapshot(snapshotId);

  return {
    restoredChaptersCount: originalChapters.length,
    restoredChapters: originalChapters,
    novelId,
    snapshot,
  };
}
