import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './ImageCropperModal.module.css';

/**
 * ImageCropperModal
 * Allows user to drag, zoom, and rotate an image to crop it to a strict 3:4 aspect ratio.
 */
export default function ImageCropperModal({ imageSrc, onCrop, onClose }) {
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(0.5);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [imgElement, setImgElement] = useState(null);
  const [imgDimensions, setImgDimensions] = useState({ width: 0, height: 0 });

  const cropAreaRef = useRef(null);
  const isDragging = useRef(false);
  const startDragPos = useRef({ x: 0, y: 0 });
  const initialPos = useRef({ x: 0, y: 0 });

  // Standard crop window size in modal viewport
  const CROP_W = 210;
  const CROP_H = 280; // 3:4 ratio

  // Load image
  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImgElement(img);
      const nw = img.naturalWidth || 600;
      const nh = img.naturalHeight || 800;
      setImgDimensions({ width: nw, height: nh });

      // Calculate initial scale to cover crop window
      const scaleW = CROP_W / nw;
      const scaleH = CROP_H / nh;
      const initialScale = Math.max(scaleW, scaleH);
      setScale(initialScale);
      setMinScale(initialScale * 0.7);
      setPosition({ x: 0, y: 0 });
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Pointer drag events for Pan
  const handlePointerDown = (e) => {
    isDragging.current = true;
    startDragPos.current = { x: e.clientX, y: e.clientY };
    initialPos.current = { ...position };
    e.target.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging.current) return;
    const dx = e.clientX - startDragPos.current.x;
    const dy = e.clientY - startDragPos.current.y;
    setPosition({
      x: initialPos.current.x + dx,
      y: initialPos.current.y + dy,
    });
  };

  const handlePointerUp = (e) => {
    isDragging.current = false;
    e.target.releasePointerCapture?.(e.pointerId);
  };

  // Wheel to zoom
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    setScale((prev) => Math.max(minScale, Math.min(prev * zoomFactor, minScale * 6)));
  };

  // Rotate 90 deg
  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  // Reset to center
  const handleReset = () => {
    const nw = imgDimensions.width || 600;
    const nh = imgDimensions.height || 800;
    const isRotated = rotation % 180 !== 0;
    const effectiveW = isRotated ? nh : nw;
    const effectiveH = isRotated ? nw : nh;
    const scaleW = CROP_W / effectiveW;
    const scaleH = CROP_H / effectiveH;
    const baseScale = Math.max(scaleW, scaleH);
    setScale(baseScale);
    setPosition({ x: 0, y: 0 });
  };

  // Generate cropped output canvas
  const handleApply = () => {
    if (!imgElement) return;

    const OUTPUT_W = 900;
    const OUTPUT_H = 1200; // Exact 3:4 HD ratio

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_W;
    canvas.height = OUTPUT_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Scale ratio between canvas output and screen preview
    const screenToCanvasFactor = OUTPUT_W / CROP_W;

    ctx.save();
    // Move origin to center of canvas
    ctx.translate(OUTPUT_W / 2, OUTPUT_H / 2);

    // Apply pan translated to canvas coordinate system
    ctx.translate(position.x * screenToCanvasFactor, position.y * screenToCanvasFactor);

    // Apply rotation
    ctx.rotate((rotation * Math.PI) / 180);

    // Apply scale & draw image centered
    const drawW = imgDimensions.width * scale * screenToCanvasFactor;
    const drawH = imgDimensions.height * scale * screenToCanvasFactor;
    ctx.drawImage(imgElement, -drawW / 2, -drawH / 2, drawW, drawH);

    ctx.restore();

    // Export as high quality JPEG
    const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    onCrop(croppedDataUrl);
    onClose();
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleWrap}>
            <span className={styles.icon}>✂️</span>
            <h3 className={styles.title}>Căn chỉnh bìa truyện (Tỷ lệ 3:4)</h3>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        {/* Viewport Crop Area */}
        <div
          className={styles.cropArea}
          ref={cropAreaRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
        >
          <div className={styles.hint}>🖐️ Kéo ảnh hoặc lăn chuột để phóng to/thu nhỏ</div>

          {/* Render draggable image */}
          {imgElement && (
            <img
              src={imgElement.src}
              alt="Crop preview"
              style={{
                position: 'absolute',
                width: `${imgDimensions.width * scale}px`,
                height: `${imgDimensions.height * scale}px`,
                transform: `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
                pointerEvents: 'none',
                maxWidth: 'none',
                maxHeight: 'none',
              }}
            />
          )}

          {/* 3:4 Crop Window Mask */}
          <div className={styles.cropWindow}>
            <div className={styles.gridLines} />
            <span className={styles.cropRatioBadge}>3:4</span>
          </div>
        </div>

        {/* Controls Bar */}
        <div className={styles.controls}>
          {/* Zoom Slider */}
          <div className={styles.sliderRow}>
            <span className={styles.sliderLabel}>🔍 Thu phóng</span>
            <input
              type="range"
              min={minScale}
              max={minScale * 4}
              step={minScale * 0.02}
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className={styles.zoomSlider}
              aria-label="Thu phóng ảnh"
            />
          </div>

          {/* Quick tool buttons + action buttons */}
          <div className={styles.btnRow}>
            <div className={styles.toolBtns}>
              <button className={styles.toolBtn} onClick={handleRotate} title="Xoay ảnh 90 độ">
                🔄 Xoay
              </button>
              <button className={styles.toolBtn} onClick={handleReset} title="Đặt lại vị trí giữa">
                ⤢ Giữa
              </button>
            </div>

            <div className={styles.actions}>
              <button className={`btn-ghost ${styles.cancelBtn}`} onClick={onClose}>
                Hủy
              </button>
              <button className={`btn-primary ${styles.applyBtn}`} onClick={handleApply}>
                ✓ Áp dụng bìa
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
