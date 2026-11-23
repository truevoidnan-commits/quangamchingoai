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
  modifiedChapters = [],
}) {
  if (!novelId || !Array.isArray(originalChapters) || originalChapters.length === 0) {
    throw new Error('Dữ liệu snapshot không hợp lệ: thiếu novelId hoặc danh sách chương gốc.');
  }

  // Sanitize original chapters and capture expected post-replacement content
  const sanitizedChapters = originalChapters.map((ch, idx) => {
    const mod =
      (modifiedChapters && (modifiedChapters.find((m) => m.id === ch.id) || modifiedChapters[idx])) || {};
    return {
      id: ch.id,
      novelId: ch.novelId || novelId,
      order: ch.order,
      title: ch.title || '',
      content: ch.content || '',
      originalTitle: ch.title || '',
      originalContent: ch.content || '',
      expectedTitle: mod.title !== undefined ? mod.title : ch.title || '',
      expectedContent: mod.content !== undefined ? mod.content : ch.content || '',
    };
  });

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
 * Guarantees:
 * 1. Single readwrite transaction: Eliminates TOCTOU race conditions by performing
 *    pre-restoration conflict check, validation, and content restoration within
 *    the exact same 'readwrite' transaction on the 'chapters' store.
 * 2. If any conflict or modification is detected, the transaction is immediately aborted.
 * 3. Does NOT perform partial writes and does NOT delete snapshot if restoration fails or conflict is detected.
 * 4. Preserves all other chapter metadata (audioUrl, readProgress, custom tags, etc.)
 *    by only reverting modified title and content fields.
 *
 * @param {string} snapshotId - ID of the snapshot to restore
 * @param {Function} [getMainDBFn] - Function returning main IndexedDB instance
 * @returns {Promise<{ restoredChaptersCount: number, restoredChapters: Array, novelId: string, snapshot: object }>}
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

  // Single atomic readwrite transaction eliminating any TOCTOU window:
  // Both conflict check and restoration writes share this exact same transaction.
  const tx = mainDB.transaction('chapters', 'readwrite');
  const store = tx.objectStore ? tx.objectStore('chapters') : tx.store;

  const conflicts = [];
  const chaptersToRestore = [];

  for (const ch of originalChapters) {
    const currentCh = await store.get(ch.id);
    if (!currentCh) {
      conflicts.push({
        id: ch.id,
        order: ch.order,
        title: ch.originalTitle || ch.title || `Chương ${ch.order}`,
        reason: 'Chương đã bị xóa khỏi hệ thống sau thời điểm thay thế',
      });
      continue;
    }

    const expectedContent = ch.expectedContent !== undefined ? ch.expectedContent : null;
    const expectedTitle = ch.expectedTitle !== undefined ? ch.expectedTitle : null;

    if (expectedContent !== null || expectedTitle !== null) {
      const contentMismatch = expectedContent !== null && currentCh.content !== expectedContent;
      const titleMismatch = expectedTitle !== null && currentCh.title !== expectedTitle;

      if (contentMismatch || titleMismatch) {
        conflicts.push({
          id: ch.id,
          order: currentCh.order ?? ch.order,
          title: currentCh.title || ch.originalTitle || ch.title,
          reason:
            contentMismatch && titleMismatch
              ? 'Cả tiêu đề và nội dung đã được chỉnh sửa hoặc đồng bộ sau thời điểm thay thế'
              : contentMismatch
              ? 'Nội dung đã được chỉnh sửa hoặc đồng bộ sau thời điểm thay thế'
              : 'Tiêu đề đã được chỉnh sửa hoặc đồng bộ sau thời điểm thay thế',
        });
        continue;
      }
    }

    chaptersToRestore.push({
      targetChapter: currentCh,
      originalTitle: ch.originalTitle !== undefined ? ch.originalTitle : ch.title,
      originalContent: ch.originalContent !== undefined ? ch.originalContent : ch.content,
    });
  }

  // If any conflicts detected: abort transaction immediately, do not write, do not delete snapshot!
  if (conflicts.length > 0) {
    if (typeof tx.abort === 'function') {
      try {
        tx.abort();
      } catch (e) {}
    }
    const conflictErr = new Error(
      `Phát hiện xung đột nội dung: ${conflicts.length} chương đã được chỉnh sửa hoặc đồng bộ từ thiết bị khác sau thời điểm thay thế. Thao tác hoàn tác đã bị hủy để bảo vệ dữ liệu.`
    );
    conflictErr.code = 'SNAPSHOT_CONFLICT';
    conflictErr.conflicts = conflicts;
    throw conflictErr;
  }

  // Perform restoration writes within the SAME transaction, preserving existing metadata
  const restoredChapters = [];
  for (const item of chaptersToRestore) {
    const { targetChapter, originalTitle, originalContent } = item;
    const updatedChapter = {
      ...targetChapter,
      title: originalTitle,
      content: originalContent,
      updatedAt: Date.now(),
    };
    await store.put(updatedChapter);
    restoredChapters.push(updatedChapter);
  }

  await tx.done;

  // Mark dirty for sync ledger
  try {
    const { markNovelDirty } = await import('./sync/syncLedger.js');
    markNovelDirty(novelId, Date.now(), 'snapshot_restore');
  } catch (e) {}

  // Delete applied snapshot ONLY upon 100% successful restoration
  await deleteNovelSnapshot(snapshotId);

  return {
    restoredChaptersCount: restoredChapters.length,
    restoredChapters,
    novelId,
    snapshot,
  };
}
