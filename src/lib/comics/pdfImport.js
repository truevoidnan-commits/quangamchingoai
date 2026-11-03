/**
 * PDF Import Engine for Thiên Cơ Lâu Comics
 * 
 * Features:
 * - Dynamic import of pdfjs-dist (code-split, zero impact on main bundle)
 * - Object URL streaming for range requests (no 80MB JS memory spike)
 * - Sequential page rendering with immediate canvas/page memory cleanup
 * - Quality tiers (low: 900px/0.7, balanced: 1200px/0.8, high: 1600px/0.9)
 * - Maximum pixel clamping (2.5MP max)
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
import { nanoid } from '../nanoid.js';

export const QUALITY_PRESETS = {
  low: {
    id: 'low',
    label: 'Tiết kiệm (900px, WebP 70%)',
    maxEdge: 900,
    quality: 0.7,
    estimatedSizeMbPerVol: 20,
  },
  balanced: {
    id: 'balanced',
    label: 'Cân bằng (1200px, WebP 80%)',
    maxEdge: 1200,
    quality: 0.8,
    estimatedSizeMbPerVol: 35,
  },
  high: {
    id: 'high',
    label: 'Sắc nét (1600px, WebP 90%)',
    maxEdge: 1600,
    quality: 0.9,
    estimatedSizeMbPerVol: 65,
  },
};

const MAX_CANVAS_PIXELS = 2500000; // ~2.5 megapixels max to avoid mobile canvas memory crashes

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

  // 1. Storage check & persistence
  await requestStoragePersistence();
  const storageStats = await getComicsStorageStats();
  if (storageStats.storageQuota > 0) {
    const freeBytes = storageStats.storageQuota - storageStats.storageUsage;
    const estimatedNeededBytes = (qualityConfig.estimatedSizeMbPerVol || 35) * 1024 * 1024;
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
    widthHint: qualityConfig.maxEdge,
    totalBytes: 0,
    quality,
    sourceName: file.name,
    importState: 'importing',
    pageMeta: [],
  });

  const volumeId = volumeRecord.id;

  // 6. Open PDF document with range streaming via blob URL
  let objectUrl = null;
  let pdfDoc = null;

  try {
    objectUrl = URL.createObjectURL(file);
    const loadingTask = pdfjs.getDocument({
      url: objectUrl,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',
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
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',
        cMapPacked: true,
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

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      if (signal?.aborted) {
        throw new Error('Đã hủy nhập');
      }

      const page = await pdfDoc.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1.0 });

      // Determine optimal scale
      let scale = qualityConfig.maxEdge / Math.max(baseViewport.width, baseViewport.height);
      let targetW = Math.round(baseViewport.width * scale);
      let targetH = Math.round(baseViewport.height * scale);

      // Clamp max pixels if extreme aspect ratio
      if (targetW * targetH > MAX_CANVAS_PIXELS) {
        scale = Math.sqrt(MAX_CANVAS_PIXELS / (baseViewport.width * baseViewport.height));
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

      // Extract cover thumbnail from first page
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
      widthHint: qualityConfig.maxEdge,
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
