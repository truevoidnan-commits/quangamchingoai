/**
 * PDF Import Engine for Thiên Cơ Lâu Comics
 * 
 * Features:
 * - Dynamic import of pdfjs-dist (code-split, zero impact on main bundle)
 * - Object URL streaming for range requests (no 80MB JS memory spike)
 * - Sequential page rendering with immediate canvas/page memory cleanup
 * - Quality tiers by WIDTH (low: rộng 900px, balanced: rộng 1200px, high: rộng 1600px)
 * - Landscape / double-page spread handling (max 1.5x preset width)
 * - Maximum canvas pixel limit (4.2MP standard, 2.5MP on low-RAM / older iOS)
 * - 100% offline raster rendering: zero CDN dependencies
 * - Storage estimate check & persistence request
 * - Progress callback & AbortSignal support
 * - First-page cover thumbnail extraction (~300px WebP)
 */
import {
  saveSeries,
  getSeries,
  updateSeries,
  saveVolume,
  updateVolume,
  deleteVolume,
  savePagesBulk,
  parseVolumeOrder,
  cleanVolumeTitle,
  getComicsStorageStats,
  requestStoragePersistence,
} from './comicDb.js';

export const QUALITY_PRESETS = {
  low: {
    id: 'low',
    label: 'Tiết kiệm (rộng 900px, WebP 70%)',
    maxWidth: 900,
    maxEdge: 900, // Backward compat
    quality: 0.7,
    estimatedSizeMbPerVol: 25,
  },
  balanced: {
    id: 'balanced',
    label: 'Cân bằng (rộng 1200px, WebP 80%)',
    maxWidth: 1200,
    maxEdge: 1200, // Backward compat
    quality: 0.8,
    estimatedSizeMbPerVol: 45,
  },
  high: {
    id: 'high',
    label: 'Sắc nét (rộng 1600px, WebP 90%)',
    maxWidth: 1600,
    maxEdge: 1600, // Backward compat
    quality: 0.9,
    estimatedSizeMbPerVol: 85,
  },
};

/**
 * Returns canvas pixel ceiling:
 * - 4.2 million pixels for modern desktop & phones (fits 1600x2400 ~3.84MP or 1600x2600 ~4.16MP)
 * - 2.5 million pixels for low-RAM devices (<= 2GB) or older iOS
 */
export function getMaxCanvasPixels() {
  if (typeof navigator !== 'undefined') {
    // Detect low-RAM devices (<= 2GB)
    if (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 2) {
      return 2500000;
    }
    // Detect older iOS devices (prior to iOS 15)
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua)) {
      const match = ua.match(/OS (\d+)_/);
      if (match && parseInt(match[1], 10) < 15) {
        return 2500000;
      }
    }
  }
  return 4200000;
}

let pdfjsLibPromise = null;

export async function loadPdfJs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        try {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/build/pdf.worker.min.mjs',
            import.meta.url
          ).toString();
        } catch (e) {
          console.warn('[PDF] Failed to load worker via import.meta.url, falling back to legacy worker:', e);
        }
      }
      return pdfjs;
    })();
  }
  return pdfjsLibPromise;
}

/**
 * Renders an image/canvas to a WebP blob
 */
function canvasToWebpBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            // Fallback for browsers that don't support image/webp in toBlob
            canvas.toBlob((jpegBlob) => {
              if (jpegBlob) resolve(jpegBlob);
              else reject(new Error('Canvas toBlob failed'));
            }, 'image/jpeg', quality);
          }
        },
        'image/webp',
        quality
      );
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Resizes an existing canvas/image to a thumbnail (~300px max edge)
 */
async function generateThumbnailBlob(sourceCanvas, maxThumbEdge = 300) {
  const thumbCanvas = document.createElement('canvas');
  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;
  const scale = Math.min(1, maxThumbEdge / Math.max(srcW, srcH));
  thumbCanvas.width = Math.max(1, Math.round(srcW * scale));
  thumbCanvas.height = Math.max(1, Math.round(srcH * scale));

  const ctx = thumbCanvas.getContext('2d');
  ctx.drawImage(sourceCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

  const blob = await canvasToWebpBlob(thumbCanvas, 0.8);
  thumbCanvas.width = 1;
  thumbCanvas.height = 1;
  return blob;
}

/**
 * Imports a single PDF File into the database
 * 
 * @param {File} file - The uploaded PDF file
 * @param {Object} options
 * @param {string} [options.seriesId] - Existing series ID or null to create new
 * @param {string} [options.seriesTitle] - Title if creating new series
 * @param {string} [options.volumeTitle] - Custom title for this volume
 * @param {number} [options.volumeOrder] - Custom order number
 * @param {'low'|'balanced'|'high'} [options.quality='balanced']
 * @param {AbortSignal} [options.signal]
 * @param {Function} [options.onProgress] - ({ currentVol, totalVols, currentPage, totalPages, phase, currentBytes })
 */
export async function importPdfVolume(file, options = {}) {
  const {
    seriesId: inputSeriesId,
    seriesTitle: inputSeriesTitle,
    volumeTitle: inputVolumeTitle,
    volumeOrder: inputVolumeOrder,
    quality = 'balanced',
    signal,
    onProgress,
    currentVol = 1,
    totalVols = 1,
  } = options;

  if (!file) throw new Error('Không có file PDF để nhập');
  if (signal?.aborted) throw new Error('Đã hủy nhập');

  const qualityConfig = QUALITY_PRESETS[quality] || QUALITY_PRESETS.balanced;
  const presetMaxW = qualityConfig.maxWidth || qualityConfig.maxEdge || 1200;

  // 1. Storage check & persistence
  await requestStoragePersistence();
  const storageStats = await getComicsStorageStats();
  if (storageStats.storageQuota > 0) {
    const freeBytes = storageStats.storageQuota - storageStats.storageUsage;
    const estimatedNeededBytes = (qualityConfig.estimatedSizeMbPerVol || 45) * 1024 * 1024;
    if (freeBytes < estimatedNeededBytes && freeBytes < 50 * 1024 * 1024) {
      console.warn(`[PDF Import] Dung lượng bộ nhớ máy sắp hết (còn lại ~${Math.round(freeBytes / (1024 * 1024))}MB)`);
    }
  }

  // 2. Load PDF.js
  const pdfjs = await loadPdfJs();
  if (signal?.aborted) throw new Error('Đã hủy nhập');

  // 3. Resolve Series
  let seriesId = inputSeriesId;
  let isNewSeries = false;
  if (!seriesId) {
    // Derive series title from file name if not provided
    const baseName = file.name.replace(/\.pdf$/i, '').replace(/[_+]/g, ' ').trim();
    // Try to strip volume/chap part for series name
    const seriesName = inputSeriesTitle || baseName.replace(/(?:tập|vol(?:ume)?\.?|quyển|chap(?:ter)?\.?)\s*\d+.*$/i, '').trim() || baseName;
    const newSeries = await saveSeries({
      title: seriesName,
    });
    seriesId = newSeries.id;
    isNewSeries = true;
  }

  // 4. Derive Volume title & order
  const resolvedOrder = typeof inputVolumeOrder === 'number'
    ? inputVolumeOrder
    : parseVolumeOrder(file.name, 1);
  const resolvedVolumeTitle = inputVolumeTitle || cleanVolumeTitle(file.name, resolvedOrder);

  // 5. Create Volume record in 'importing' state
  const volumeRecord = await saveVolume({
    seriesId,
    title: resolvedVolumeTitle,
    order: resolvedOrder,
    pageCount: 0,
    widthHint: presetMaxW,
    totalBytes: 0,
    quality,
    sourceName: file.name,
    importState: 'importing',
    pageMeta: [],
  });

  const volumeId = volumeRecord.id;

  // 6. Open PDF document with range streaming via blob URL
  // NOTE: Scanned manga/comic PDFs contain 100% full-page raster images (JPEG/PNG/WebP).
  // They do not require cMapUrl or standardFontDataUrl, so we omit external CDN URLs.
  // This guarantees 100% offline import without network dependency.
  let objectUrl = null;
  let pdfDoc = null;

  try {
    objectUrl = URL.createObjectURL(file);
    const loadingTask = pdfjs.getDocument({
      url: objectUrl,
      disableAutoFetch: true, // Only fetch ranges needed for current page
      disableStream: false,
    });

    if (signal) {
      signal.addEventListener('abort', () => {
        try {
          loadingTask.destroy();
        } catch (e) {}
      }, { once: true });
    }

    try {
      pdfDoc = await loadingTask.promise;
    } catch (urlErr) {
      // Fallback: try direct arrayBuffer if blob URL streaming was blocked
      console.warn('[PDF Import] Blob URL streaming failed, falling back to arrayBuffer:', urlErr);
      if (signal?.aborted) throw new Error('Đã hủy nhập');
      const buffer = await file.arrayBuffer();
      pdfDoc = await pdfjs.getDocument({
        data: buffer,
      }).promise;
    }

    const numPages = pdfDoc.numPages;
    if (numPages <= 0) {
      throw new Error('File PDF không chứa trang nào');
    }

    if (onProgress) {
      onProgress({
        currentVol,
        totalVols,
        currentPage: 0,
        totalPages: numPages,
        phase: 'rendering',
        currentBytes: 0,
        volumeTitle: resolvedVolumeTitle,
      });
    }

    // 7. Sequential page rendering loop
    const canvas = document.createElement('canvas');
    let ctx = canvas.getContext('2d', { willReadFrequently: false });
    
    let totalBytes = 0;
    const pageMeta = [];
    const BATCH_SIZE = 5; // Batch write to IndexedDB every 5 pages
    let pageBatch = [];
    let firstPageCoverBlob = null;
    const maxCanvasPixels = getMaxCanvasPixels();

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      if (signal?.aborted) {
        throw new Error('Đã hủy nhập');
      }

      const page = await pdfDoc.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1.0 });

      // Determine dimensions based on WIDTH:
      // - Portrait page (height >= width): targetMaxWidth = preset.maxWidth
      // - Landscape / Double-page spread (width > height): targetMaxWidth = Math.round(preset.maxWidth * 1.5)
      // 1. Luôn render theo chiều rộng mục tiêu: scale = targetMaxWidth / w (cho phép phóng to lẫn thu nhỏ)
      const isLandscape = baseViewport.width > baseViewport.height;
      const targetMaxWidth = isLandscape ? Math.round(presetMaxW * 1.5) : presetMaxW;

      let scale = targetMaxWidth / baseViewport.width;

      // 2. Giới hạn scale tối đa 4 để tránh trang PDF nhỏ bất thường bị phóng quá đà
      if (scale > 4) {
        scale = 4;
      }

      let targetW = Math.round(baseViewport.width * scale);
      let targetH = Math.round(baseViewport.height * scale);

      // 3. Giữ nguyên giới hạn pixel canvas (4.2MP, hoặc 2.5MP trên máy ít RAM / iOS < 15): nếu width*height vượt giới hạn thì giảm scale cho vừa
      if (targetW * targetH > maxCanvasPixels) {
        scale = Math.sqrt(maxCanvasPixels / (baseViewport.width * baseViewport.height));
        targetW = Math.round(baseViewport.width * scale);
        targetH = Math.round(baseViewport.height * scale);
      }

      const viewport = page.getViewport({ scale });
      canvas.width = targetW;
      canvas.height = targetH;

      // Render page to canvas
      await page.render({
        canvasContext: ctx,
        viewport,
      }).promise;

      // Extract cover thumbnail from first page (~320px)
      if (pageNum === 1) {
        firstPageCoverBlob = await generateThumbnailBlob(canvas, 320);
      }

      // Convert page canvas to WebP
      const webpBlob = await canvasToWebpBlob(canvas, qualityConfig.quality);
      const pageByteSize = webpBlob.size;
      totalBytes += pageByteSize;

      const pageItem = {
        volumeId,
        index: pageNum - 1, // 0-based index
        blob: webpBlob,
        w: targetW,
        h: targetH,
      };

      pageMeta.push({
        index: pageNum - 1,
        w: targetW,
        h: targetH,
      });

      pageBatch.push(pageItem);

      // Free page rendering memory immediately
      page.cleanup();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Flush batch to IndexedDB
      if (pageBatch.length >= BATCH_SIZE || pageNum === numPages) {
        await savePagesBulk(pageBatch);
        pageBatch = [];
      }

      if (onProgress) {
        onProgress({
          currentVol,
          totalVols,
          currentPage: pageNum,
          totalPages: numPages,
          phase: 'rendering',
          currentBytes: totalBytes,
          volumeTitle: resolvedVolumeTitle,
        });
      }
    }

    // Cleanup reusable canvas
    canvas.width = 1;
    canvas.height = 1;

    // 8. Update series cover if this series does not have one yet
    if (firstPageCoverBlob) {
      const currentSeries = await getSeries(seriesId);
      if (currentSeries && !currentSeries.coverBlob) {
        await updateSeries(seriesId, { coverBlob: firstPageCoverBlob });
      }
    }

    // 9. Mark Volume as 'ready'
    const finalVolume = await updateVolume(volumeId, {
      pageCount: numPages,
      totalBytes,
      widthHint: presetMaxW,
      importState: 'ready',
      pageMeta,
    });

    if (onProgress) {
      onProgress({
        currentVol,
        totalVols,
        currentPage: numPages,
        totalPages: numPages,
        phase: 'complete',
        currentBytes: totalBytes,
        volumeTitle: resolvedVolumeTitle,
      });
    }

    return {
      seriesId,
      volumeId,
      volume: finalVolume,
      totalPages: numPages,
      totalBytes,
    };
  } catch (err) {
    console.error('[PDF Import] Failed or aborted:', err);
    // Cleanup incomplete volume and its pages
    try {
      await deleteVolume(volumeId);
      if (isNewSeries) {
        const remaining = await getSeries(seriesId);
        if (remaining && remaining.volumeCount === 0) {
          const db = await import('./comicDb.js').then(m => m.getComicDB());
          await db.delete('series', seriesId);
        }
      }
    } catch (cleanupErr) {
      console.warn('[PDF Import] Cleanup error after failure:', cleanupErr);
    }
    throw err;
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
    if (pdfDoc) {
      try {
        pdfDoc.destroy();
      } catch (e) {}
    }
  }
}

/**
 * Batch import multiple PDF files sequentially
 */
export async function importMultiplePdfs(files, options = {}) {
  const { onProgress, signal, seriesId, quality = 'balanced' } = options;
  const fileList = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
  if (fileList.length === 0) {
    throw new Error('Không tìm thấy file PDF nào');
  }

  // Sort files naturally by filename so Volume 1 is imported before Volume 2
  fileList.sort((a, b) => {
    const orderA = parseVolumeOrder(a.name, 9999);
    const orderB = parseVolumeOrder(b.name, 9999);
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });

  const results = [];
  let currentTargetSeriesId = seriesId;

  for (let i = 0; i < fileList.length; i++) {
    if (signal?.aborted) throw new Error('Đã hủy nhập hàng loạt');
    const file = fileList[i];

    const result = await importPdfVolume(file, {
      ...options,
      seriesId: currentTargetSeriesId,
      currentVol: i + 1,
      totalVols: fileList.length,
      quality,
      signal,
      onProgress,
    });

    results.push(result);
    // If the first file created a series, subsequent files join the same series
    if (!currentTargetSeriesId && result.seriesId) {
      currentTargetSeriesId = result.seriesId;
    }
  }

  return {
    seriesId: currentTargetSeriesId,
    importedVolumes: results,
  };
}
