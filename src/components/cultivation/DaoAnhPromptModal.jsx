import React, { useState, useEffect } from 'react';
import { findDaoAnhDefinition, getDaoAnhEvolutionImage, getDaoAnhTransformStyle } from '../../lib/daoAnhData';
import styles from './DaoAnhPromptModal.module.css';

/**
 * DaoAnh80Modal — Modal Thông Báo Khi Đạo Anh Đạt 80% Linh Lực
 */
export function DaoAnh80Modal({ 
  isOpen, 
  promptData, 
  daoAnh, 
  resolvedDaoAnhName, 
  onSwitch, 
  onContinue 
}) {
  if (!isOpen || !promptData) return null;

  const currentExp = promptData.currentExp || 0;
  const maxExp = promptData.maxExp || 5000;
  const percent = Math.min(100, Math.floor((currentExp / maxExp) * 100));
  const currentKiep = promptData.currentKiep !== undefined ? promptData.currentKiep : (daoAnh?.currentKiep || 0);

  // Phân giải định nghĩa Đạo Anh đầy đủ
  const targetId = daoAnh?.id || promptData?.daoAnhId;
  const daoAnhDef = findDaoAnhDefinition(
    (daoAnh?.sourceId || daoAnh?.lampId || daoAnh?.artifactId) ? daoAnh : { id: targetId, ...(daoAnh || {}) },
    null
  );
  const displayName = resolvedDaoAnhName || daoAnhDef?.name || 'Đạo Anh';
  
  // Lấy hình ảnh artwork chân thực theo đúng Đạo Anh và Kiếp hiện tại
  const daoAnhImage = getDaoAnhEvolutionImage(daoAnhDef, currentKiep);
  const primaryColor = daoAnhDef?.primaryColor || '#fbbf24';
  const glowColor = daoAnhDef?.glowColor || 'rgba(251, 191, 36, 0.7)';
  const transformStyle = getDaoAnhTransformStyle(daoAnhDef, currentKiep);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [daoAnhImage]);

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        {/* Ambient Backlight Aura */}
        <div 
          className={styles.auraGlowGold} 
          style={{ background: `radial-gradient(circle, ${glowColor} 0%, rgba(245, 158, 11, 0.12) 50%, transparent 70%)` }} 
        />

        {/* Main Card */}
        <div className={styles.card}>
          {/* Top Badge */}
          <div className={styles.badgeWrap}>
            <span className={`${styles.badge} ${styles.badgeGold}`}>
              ✦ TIÊN KIẾP SẮP TỚI ✦
            </span>
          </div>

          {/* Avatar / Artwork Pedestal */}
          <div className={styles.avatarPedestal}>
            <div 
              className={styles.avatarHalo}
              style={{ borderColor: `${primaryColor}66` }}
            />
            <div 
              className={styles.avatarInner}
              style={{
                borderColor: `${primaryColor}88`,
                boxShadow: `0 0 25px ${glowColor}, inset 0 0 16px ${primaryColor}25`
              }}
            >
              {daoAnhImage && !imgError ? (
                <div className={styles.imageWrapper}>
                  <img
                    src={daoAnhImage}
                    alt={displayName}
                    className={styles.daoAnhImage}
                    style={{
                      transform: transformStyle,
                      filter: `drop-shadow(0 0 12px ${glowColor})`
                    }}
                    onError={() => setImgError(true)}
                  />
                </div>
              ) : (
                <span style={{ fontSize: 40 }}>⚡</span>
              )}
            </div>
          </div>

          {/* Title */}
          <h3 className={`${styles.title} ${styles.titleGold}`}>
            ĐẠO ANH ĐẠT 80% LINH LỰC!
          </h3>

          {/* Dao Anh Showcase Card */}
          <div className={styles.daoAnhCard}>
            <div className={styles.daoAnhHeader}>
              <span className={styles.daoAnhName} style={{ color: primaryColor }}>
                [{displayName}]
              </span>
              <span className={styles.daoAnhBadge}>
                Kiếp {currentKiep + 1}
              </span>
            </div>

            {/* Progress Bar */}
            <div className={styles.progressWrap}>
              <div className={styles.progressHeader}>
                <span>Linh Lực Tích Lũy</span>
                <strong>{currentExp.toLocaleString()} / {maxExp.toLocaleString()} Tu Vi</strong>
              </div>
              <div className={styles.progressTrack}>
                <div 
                  className={styles.progressFill}
                  style={{ width: `${percent}%` }}
                >
                  <div className={styles.progressShimmer} />
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <p className={styles.message}>
            Đạo Anh đã tích lũy đủ <strong style={{ color: '#fde047' }}>80% Linh Lực</strong>, sẵn sàng nghênh tiếp Thiên Kiếp! Đạo hữu có muốn chuyển quyền nạp sang Đạo Anh khác không, hay tiếp tục nạp đến 100% để đảm bảo độ kiếp viên mãn?
          </p>

          {/* Action Buttons */}
          <div className={styles.btnGroup}>
            <button 
              className={styles.btnPrimaryGold}
              onClick={onContinue}
            >
              <span>⚡</span>
              <span>Tiếp Tục Nạp Đến 100%</span>
            </button>

            <button 
              className={styles.btnSecondary}
              onClick={onSwitch}
            >
              <span>🔄</span>
              <span>Chuyển Đạo Anh Khác</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * DaoAnhFullModal — Modal Thông Báo Khi Toàn Bộ Đạo Anh Đã Viên Mãn 100%
 */
export function DaoAnhFullModal({
  isOpen,
  daoAnhsCount = 13,
  onGoTribulation,
  onDismiss
}) {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        {/* Ambient Backlight Aura */}
        <div className={styles.auraGlowPurple} />

        {/* Main Card */}
        <div className={`${styles.card} ${styles.cardPurple}`}>
          {/* Top Badge */}
          <div className={styles.badgeWrap}>
            <span className={`${styles.badge} ${styles.badgePurple}`}>
              ✦ VẠN KIẾP TỀ THĂNG ✦
            </span>
          </div>

          {/* Icon Pedestal */}
          <div className={styles.avatarPedestal}>
            <div className={styles.avatarHaloPurple} />
            <div className={`${styles.avatarInner} ${styles.avatarInnerPurple}`}>
              <span style={{ fontSize: 44, filter: 'drop-shadow(0 0 12px rgba(240, 171, 252, 0.8))' }}>⛈️</span>
            </div>
          </div>

          {/* Title */}
          <h3 className={`${styles.title} ${styles.titlePurple}`}>
            TOÀN BỘ ĐẠO ANH ĐÃ VIÊN MÃN 100%!
          </h3>

          {/* Info Card */}
          <div className={styles.daoAnhCard}>
            <p style={{
              margin: 0,
              fontSize: 12.5,
              lineHeight: 1.6,
              color: '#cbd5e1'
            }}>
              Toàn bộ <strong style={{ color: '#fde047' }}>{daoAnhsCount} Đạo Anh</strong> đều đã tích lũy đạt <strong style={{ color: '#f0abfc' }}>100% Linh Lực viên mãn</strong>, sẵn sàng cùng nhau tiến hành Vạn Kiếp Tề Thăng!
            </p>
          </div>

          {/* Sub Message */}
          <p className={styles.subMessage}>
            Nếu đạo hữu chưa muốn độ kiếp lúc này, Tu Vi nhận được từ việc đọc truyện và Tụ Linh Trận sẽ được chuyển dồn tích lũy vào <strong style={{ color: '#f59e0b' }}>Uẩn Tích Bình Cảnh</strong>.
          </p>

          {/* Action Buttons */}
          <div className={styles.btnGroup}>
            <button
              className={styles.btnPrimaryPurple}
              onClick={onGoTribulation}
            >
              <span>⚡</span>
              <span>Đến Độ Kiếp Đài</span>
            </button>

            <button
              className={styles.btnSecondary}
              onClick={onDismiss}
            >
              <span>❌</span>
              <span>Hủy</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
