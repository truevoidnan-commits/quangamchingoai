/**
 * WASM WebP Encoder using @jsquash/webp
 * 
 * Provides offline WebP encoding for platforms lacking native canvas WebP support (such as WebKit / Safari on iOS).
 * Loaded dynamically on-demand, keeping the main app bundle ultra-lean.
 */
import encode, { init } from '@jsquash/webp/encode.js';
import { simd } from 'wasm-feature-detect';

let initPromise = null;

/**
 * Initializes the @jsquash/webp WebAssembly module once.
 * Reuses the compiled module across all pages in the import session.
 */
export async function initWebpWasm() {
  if (!initPromise) {
    initPromise = (async () => {
      const hasSimd = await simd().catch(() => false);

      let wasmModule = null;

      // Browser environment (Vite runtime)
      if (typeof window !== 'undefined') {
        const wasmImport = hasSimd
          ? await import('@jsquash/webp/codec/enc/webp_enc_simd.wasm?url')
          : await import('@jsquash/webp/codec/enc/webp_enc.wasm?url');
        const wasmUrl = wasmImport.default;

        const res = await fetch(wasmUrl);
        if (!res.ok) {
          throw new Error(`Không thể nạp file WASM WebP (${res.status} ${res.statusText})`);
        }
        const buffer = await res.arrayBuffer();
        wasmModule = await WebAssembly.compile(buffer);
      } else {
        // Node.js test environment
        const fs = await import('fs');
        const path = await import('path');
        const wasmFile = hasSimd ? 'webp_enc_simd.wasm' : 'webp_enc.wasm';
        const wasmPath = path.resolve('node_modules/@jsquash/webp/codec/enc', wasmFile);
        const buffer = fs.readFileSync(wasmPath);
        wasmModule = await WebAssembly.compile(buffer);
      }

      await init(wasmModule);
    })();
  }
  return initPromise;
}

/**
 * Encodes a Canvas or ImageData to a WebP Blob using the WASM module.
 * 
 * @param {HTMLCanvasElement} canvas
 * @param {number} quality (0..1, e.g. 0.8)
 * @param {CanvasRenderingContext2D} [ctx]
 * @returns {Promise<Blob>}
 */
export async function encodeCanvasWithWasm(canvas, quality = 0.8, ctx = null) {
  await initWebpWasm();
  const context = ctx || canvas.getContext('2d', { willReadFrequently: true });
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  
  const q = Math.max(1, Math.min(100, Math.round(quality * 100)));
  const arrayBuffer = await encode(imageData, { quality: q });

  // Return standard WebP Blob
  return new Blob([arrayBuffer], { type: 'image/webp' });
}
