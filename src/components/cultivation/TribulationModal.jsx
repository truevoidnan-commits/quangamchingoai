import React, { useState, useEffect } from 'react';
import styles from './TribulationModal.module.css';

/**
 * TribulationModal — Modal Hoạt Ảnh Interactive Khi Đạo Anh Nghênh Tiếp Thiên Kiếp:
 * - Phủ hiệu ứng mây đen lôi kiếp, sấm sét giáng xuống Đạo Anh.
 * - Hiệu ứng nổ hạt hoàng kim khi thành công, hoặc Chân Hỏa Mệnh Đăng che chắn khi thất bại.
 */
export default function TribulationModal({ activeData, onClose }) {
  const [stage, setStage] = useState('striking'); // 'striking' | 'result'

  useEffect(() => {
    const timer = setTimeout(() => {
      setStage('result');
    }, 1800);
    return () => clearTimeout(timer);
  }, []);

  if (!activeData) return null;

  const { isSuccess, tribulationName, daoAnhName, element, message, successChance } = activeData;

  return (
    <div className={styles.overlay}>
      <div className={`${styles.modalCard} ${isSuccess ? styles.modalSuccess : styles.modalFail}`}>
        {/* Thunderstorm Background Effects */}
        <div className={styles.lightningBg} />
        <div className={styles.cloudVortex} />

        {/* Content Header */}
        <div className={styles.header}>
          <span className={styles.headerBadge}>⚡ ĐỘ KIẾP ĐÀI THIÊN CƠ</span>
          <h3 className={styles.title}>{tribulationName || 'Nghênh Tiếp Thiên Kiếp'}</h3>
          <p className={styles.subtitle}>
            {daoAnhName} • <span style={{ color: '#ffcc00' }}>{element || 'Thần Thể'}</span>
          </p>
        </div>

        {/* Stage 1: Striking Animation */}
        {stage === 'striking' && (
          <div className={styles.strikingBox}>
            <div className={styles.thunderFlash} />
            <div className={styles.daoAnhAvatarStriking}>
              <span className={styles.avatarIcon}>👑</span>
              <div className={styles.auraRing} />
            </div>
            <div className={styles.strikingText}>
              <span>⚡ Thiên lôi cuồn cuộn giáng xuống Đạo Anh...</span>
              <small>Tỉ lệ thành công: {successChance || 70}%</small>
            </div>
          </div>
        )}

        {/* Stage 2: Result Animation */}
        {stage === 'result' && (
          <div className={styles.resultBox}>
            <div className={styles.resultIconWrap}>
              {isSuccess ? (
                <span className={styles.successIcon}>🌟</span>
              ) : (
                <span className={styles.failIcon}>⚡</span>
              )}
            </div>

            <h4 className={isSuccess ? styles.successHead : styles.failHead}>
              {isSuccess ? 'ĐỘ KIẾP THÀNH CÔNG!' : 'ĐỘ KIẾP THẤT BẠI!'}
            </h4>

            <p className={styles.resultMsg}>{message}</p>

            <button className="btn-gold" style={{ width: '100%', marginTop: 16 }} onClick={onClose}>
              ✨ Thu Lại Thần Niệm (Đóng)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
