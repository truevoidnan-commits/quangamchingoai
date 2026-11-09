import { useState, useEffect, useCallback } from 'react';
import { getReadingProgress } from '../lib/storage';
import { getChapterPosition } from '../lib/db';

// In-memory cache để tránh gọi IndexedDB trùng lặp khi render danh sách nhiều truyện
const progressCache = new Map();

/**
 * Custom hook lấy tiến độ đọc thật của một bộ truyện dựa trên IndexedDB (không regex).
 * 
 * @param {string|Object} novelOrId - novelId hoặc đối tượng novel
 * @param {number} [novelChapterCount] - số chương của truyện (nếu novelOrId là string)
 * @returns {{ chapterNum: number, total: number, percent: number } | null}
 */
export function useNovelReadingProgress(novelOrId, novelChapterCount) {
  const novelId = typeof novelOrId === 'object' ? novelOrId?.id : novelOrId;
  const chapterCount = typeof novelOrId === 'object' ? novelOrId?.chapterCount : novelChapterCount;

  // Lấy tiến độ hiện tại từ localStorage
  const readCurrentProgress = useCallback(() => {
    if (!novelId) return null;
    const prog = getReadingProgress(novelId);
    if (!prog || !prog.chapterId) return null;
    return prog;
  }, [novelId]);

  const [progressState, setProgressState] = useState(() => {
    const prog = readCurrentProgress();
    if (!prog || !prog.chapterId) return null;
    const cacheKey = `${novelId}_${prog.chapterId}_${chapterCount || 0}`;
    return progressCache.get(cacheKey) || null;
  });

  useEffect(() => {
    let isMounted = true;

    async function updateProgress() {
      if (!novelId) {
        if (isMounted) setProgressState(null);
        return;
      }

      const prog = readCurrentProgress();
      if (!prog || !prog.chapterId) {
        if (isMounted) setProgressState(null);
        return;
      }

      const cacheKey = `${novelId}_${prog.chapterId}_${chapterCount || 0}`;
      const cached = progressCache.get(cacheKey);
      if (cached) {
        if (isMounted) setProgressState(cached);
        return;
      }

      try {
        const posInfo = await getChapterPosition(novelId, prog.chapterId);
        if (!posInfo) {
          if (isMounted) setProgressState(null);
          return;
        }

        const currentPos = posInfo.position;
        const total = posInfo.total || chapterCount || 1;
        const rawScroll = typeof prog.percent === 'number' ? prog.percent : (prog.scrollPercent || 0);
        const scrollFrac = rawScroll > 1 ? (rawScroll / 100) : rawScroll;

        // Tính % chính xác: ((vị trí - 1) + tỷ lệ cuộn) / tổng số chương
        const percent = Math.min(
          100,
          Math.max(0, Math.round((((currentPos - 1) + scrollFrac) / total) * 1000) / 10)
        );

        const result = {
          chapterNum: currentPos,
          total,
          percent,
        };

        progressCache.set(cacheKey, result);
        if (isMounted) setProgressState(result);
      } catch (err) {
        console.warn('Lỗi khi tính useNovelReadingProgress:', err);
        if (isMounted) setProgressState(null);
      }
    }

    updateProgress();

    // Lắng nghe sự kiện cập nhật tiến độ
    const handleProgressChanged = (e) => {
      if (!e?.detail?.novelId || e.detail.novelId === novelId) {
        // Xóa cache cũ cho novelId này
        for (const key of progressCache.keys()) {
          if (key.startsWith(`${novelId}_`)) {
            progressCache.delete(key);
          }
        }
        updateProgress();
      }
    };

    const handleStorage = (e) => {
      if (e.key && e.key.includes(novelId)) {
        for (const key of progressCache.keys()) {
          if (key.startsWith(`${novelId}_`)) {
            progressCache.delete(key);
          }
        }
        updateProgress();
      }
    };

    const handleLibraryChanged = (e) => {
      if (!e?.detail?.novelId || e.detail.novelId === novelId) {
        updateProgress();
      }
    };

    window.addEventListener('tcl_reading_progress_changed', handleProgressChanged);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('tcl_library_changed', handleLibraryChanged);

    return () => {
      isMounted = false;
      window.removeEventListener('tcl_reading_progress_changed', handleProgressChanged);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('tcl_library_changed', handleLibraryChanged);
    };
  }, [novelId, chapterCount, readCurrentProgress]);

  return progressState;
}
