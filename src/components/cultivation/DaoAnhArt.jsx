import React, { useState, useEffect } from 'react';
import { PersistentImage } from '../../lib/persistentImageCache';
import { getDaoAnhEvolutionImage, getDaoAnhTransformStyle } from '../../lib/daoAnhData';
import Icon from '../ui/Icon';

/**
 * DaoAnhArt: Component dùng chung chỉ vẽ ảnh Đạo Anh ở mọi nơi trong Đồ Lục.
 * Đảm bảo quy tắc hiển thị chuẩn đồng nhất với DaoAnhAvatarRenderer:
 * - Khung vuông (hoặc fill theo container)
 * - Khung con chiếm 94% x 94% của khung chính, overflow: visible
 * - Ảnh object-fit: contain, transform lấy từ getDaoAnhTransformStyle
 * - Hỗ trợ refSize để scale x, y khi render ở các kích cỡ khác nhau
 * - Fallback an toàn khi ảnh lỗi hoặc thiếu dữ liệu
 */
export default function DaoAnhArt({
  daoAnh,
  kiep = 5,
  size = 'fill',
  imageSize,
  glow = false,
  className = '',
  style = {},
  imageClassName = '',
  imageStyle = {},
  onClick,
  refSize = 185,
}) {
  const [hasError, setHasError] = useState(false);

  const currentKiep = typeof kiep === 'number' ? kiep : 5;
  const isFill = size === 'fill';
  const effectiveSize = typeof size === 'number' ? size : undefined;
  const resolvedImageSize = imageSize || (typeof size === 'number' && size <= 190 ? 'thumb' : 'full');

  useEffect(() => {
    setHasError(false);
  }, [daoAnh?.id, currentKiep]);

  if (!daoAnh || hasError) {
    const initials = (daoAnh?.name || 'ĐA')
      .split(' ')
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
    return (
      <div
        className={className}
        style={{
          width: isFill ? '100%' : `${size}px`,
          height: isFill ? '100%' : `${size}px`,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255, 255, 255, 0.04)',
          borderRadius: 12,
          border: '1px solid rgba(251, 191, 36, 0.25)',
          padding: 8,
          gap: 4,
          textAlign: 'center',
          ...style,
        }}
        onClick={onClick}
      >
        <Icon name="sparkle" size={typeof size === 'number' && size < 60 ? 16 : 22} style={{ color: daoAnh?.primaryColor || '#fbbf24' }} />
        <span style={{ fontWeight: 800, fontSize: typeof size === 'number' && size < 60 ? 10 : 12, color: '#fde047' }}>{initials}</span>
      </div>
    );
  }

  const src = getDaoAnhEvolutionImage(daoAnh, currentKiep, resolvedImageSize);

  // Transform tính từ bảng getDaoAnhTransformStyle có kèm refSize
  const transformStyle = getDaoAnhTransformStyle(daoAnh, currentKiep, {
    size: effectiveSize,
    refSize,
  });

  const glowColor = glow === true
    ? (daoAnh.glowColor || daoAnh.primaryColor || '#fbbf24')
    : (typeof glow === 'string' ? glow : null);

  const glowFilter = glowColor ? `drop-shadow(0 0 10px ${glowColor})` : 'none';

  return (
    <div
      className={`dao-anh-art-frame ${className}`}
      style={{
        width: isFill ? '100%' : `${size}px`,
        height: isFill ? '100%' : `${size}px`,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'visible',
        flexShrink: 0,
        ...style,
      }}
      onClick={onClick}
    >
      {/* Khung trong 94% x 94% chuẩn DaoAnhAvatarRenderer */}
      <div
        style={{
          width: '94%',
          height: '94%',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2,
          overflow: 'visible',
        }}
      >
        <PersistentImage
          key={`${daoAnh.id || 'da'}_kiep_${currentKiep}`}
          src={src}
          alt={daoAnh.name || 'Đạo Anh'}
          loading="lazy"
          decoding="async"
          onError={() => setHasError(true)}
          className={imageClassName}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            userSelect: 'none',
            transform: transformStyle,
            transformOrigin: 'center center',
            backfaceVisibility: 'hidden',
            pointerEvents: 'none',
            filter: glowFilter,
            ...imageStyle,
          }}
        />
      </div>
    </div>
  );
}
