import React, { useState, useEffect } from 'react';
import styles from './TribulationModal.module.css';

/**
 * Phân tích dữ liệu độ kiếp để hiển thị tinh gọn, không rối mắt, zero dấu ngoặc đơn
 */
function parseTribulationData(activeData) {
  if (!activeData) return {};
  const message = activeData.message || '';

  // 1. Số Thiên Mệnh nhận được
  let earnedTM = activeData.totalEarnedTM || activeData.earnedTM;
  if (!earnedTM) {
    const tmMatch = message.match(/\+([\d.,]+)\s*(?:Thiên Mệnh|TM)/i);
    if (tmMatch) earnedTM = tmMatch[1];
  } else if (typeof earnedTM === 'number') {
    earnedTM = earnedTM.toLocaleString();
  }

  // 2. Tầng Kiếp thăng hoa
  const kiepMatch = message.match(/Kiếp(?:\s*thứ)?\s*(\d+)/i);
  const kiep = kiepMatch ? kiepMatch[1] : null;

  // 3. Số lượng Đạo Anh thăng hoa (nếu là Vạn Kiếp)
  let daoAnhCount = activeData.totalCount;
  if (!daoAnhCount) {
    const countMatch = message.match(/(\d+)\s*Đạo Anh/i);
    if (countMatch) daoAnhCount = countMatch[1];
  }

  // 4. Có bonus cộng hưởng không
  const hasBonus = message.includes('Bonus') || message.includes('cộng hưởng');

  // 5. Làm sạch tên Đạo Kiếp và tên Đạo Anh khỏi mọi dấu ngoặc đơn (...)
  const cleanTribulationName = (activeData.tribulationName || 'Nghênh Tiếp Thiên Kiếp')
    .replace(/\s*\([^)]*\)/g, '')
    .trim();
  const cleanDaoAnhName = (activeData.daoAnhName || 'Đạo Anh')
    .replace(/\s*\([^)]*\)/g, '')
    .trim();

  return {
    earnedTM,
    kiep,
    daoAnhCount,
    hasBonus,
    cleanTribulationName,
    cleanDaoAnhName,
  };
}

export default function TribulationModal({ activeData, onClose }) {
  const [stage, setStage] = useState('striking'); // 'striking' | 'result'

  useEffect(() => {
    const timer = setTimeout(() => {
      setStage('result');
    }, 1800);
    return () => clearTimeout(timer);
  }, []);

  if (!activeData) return null;

  const { isSuccess, element, successChance } = activeData;
  const parsed = parseTribulationData(activeData);

  return (
    <div className={styles.overlay}>
      <div className={styles.container}>
        {/* Ambient Backlight Aura */}
        <div className={isSuccess ? styles.auraGlowGold : styles.auraGlowFail} />

        {/* Modal Card */}
        <div className={`${styles.modalCard} ${isSuccess ? styles.modalSuccess : styles.modalFail}`}>
          {/* Thunderstorm Background Effects */}
          <div className={styles.lightningBg} />

          {/* Content Header */}
          <div className={styles.header}>
            <span className={styles.headerBadge}>✦ ĐỘ KIẾP ĐÀI THIÊN CƠ ✦</span>
            <h3 className={styles.title}>{parsed.cleanTribulationName}</h3>
            <p className={styles.subtitle}>
              {parsed.cleanDaoAnhName} • <span style={{ color: '#fde047' }}>{element || 'Thiên Cơ Lôi Kiếp'}</span>
            </p>
          </div>

          {/* Stage 1: Striking Animation */}
          {stage === 'striking' && (
            <div className={styles.strikingBox}>
              <div className={styles.thunderFlash} />
              <div className={styles.daoAnhAvatarStriking}>
                <span className={styles.avatarIcon}>⚡</span>
                <div className={styles.auraRing} />
              </div>
              <div className={styles.strikingText}>
                <span>Thiên lôi cuồn cuộn giáng xuống Đạo Anh...</span>
                <small>Tỉ lệ thành công: {successChance || 100}%</small>
              </div>
            </div>
          )}

          {/* Stage 2: Result Animation */}
          {stage === 'result' && (
            <div className={styles.resultBox}>
              {/* Crest Pedestal */}
              {isSuccess ? (
                <div className={styles.crestPedestal}>
                  <div className={styles.crestHalo} />
                  <div className={styles.crestInner}>
                    <svg viewBox="0 0 100 100" className={styles.crestSvg}>
                      <defs>
                        <radialGradient id="sealGold" cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor="#ffffff" />
                          <stop offset="40%" stopColor="#fde047" />
                          <stop offset="85%" stopColor="#d97706" />
                          <stop offset="100%" stopColor="#78350f" />
                        </radialGradient>
                        <filter id="glowGold" x="-20%" y="-20%" width="140%" height="140%">
                          <feGaussianBlur stdDeviation="2.5" result="blur" />
                          <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>
                      </defs>
                      <g filter="url(#glowGold)" fill="url(#sealGold)">
                        <polygon points="50,6 56,36 86,22 64,44 94,50 64,56 86,78 56,64 50,94 44,64 14,78 36,56 6,50 36,44 14,22 44,36" opacity="0.9" />
                        <circle cx="50" cy="50" r="16" fill="rgba(15, 23, 42, 0.95)" stroke="#fde047" strokeWidth="2" />
                        <polygon points="52,38 43,51 49,51 47,62 57,48 51,48" fill="#fde047" />
                      </g>
                    </svg>
                  </div>
                </div>
              ) : (
                <div className={`${styles.crestPedestal} ${styles.crestPedestalFail}`}>
                  <div className={styles.crestHaloFail} />
                  <div className={styles.crestInner}>
                    <span style={{ fontSize: 38, filter: 'drop-shadow(0 0 10px rgba(239, 68, 68, 0.8))' }}>⚡</span>
                  </div>
                </div>
              )}

              {/* Title */}
              <h4 className={isSuccess ? styles.headingSuccess : styles.headingFail}>
                {isSuccess ? 'ĐỘ KIẾP THÀNH CÔNG!' : 'ĐỘ KIẾP THẤT BẠI!'}
              </h4>

              {/* Structured Reward Card */}
              {isSuccess ? (
                <>
                  <div className={styles.rewardCard}>
                    <div className={styles.rewardRow}>
                      <span className={styles.rewardLabel}>Cảnh Giới Thăng Hoa</span>
                      <span className={styles.rewardValueGold}>
                        {parsed.daoAnhCount 
                          ? `${parsed.daoAnhCount} Đạo Anh • Kiếp ${parsed.kiep || 1}` 
                          : `Kiếp ${parsed.kiep || 1}`}
                      </span>
                    </div>

                    {parsed.earnedTM && (
                      <div className={styles.rewardRow}>
                        <span className={styles.rewardLabel}>Thiên Mệnh Thu Được</span>
                        <div className={styles.rewardBadgeGroup}>
                          <span className={styles.rewardValueTM}>+{parsed.earnedTM} Thiên Mệnh</span>
                          {parsed.hasBonus && (
                            <span className={styles.bonusBadge}>Cộng Hưởng +50%</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <p className={styles.flavourText}>
                    Lôi đình tiêu tán, linh căn tẩy lễ viên mãn, đạo hạnh thăng hoa vượt bậc!
                  </p>
                </>
              ) : (
                <>
                  <div className={styles.rewardCardFail}>
                    <p className={styles.failSummary}>
                      {activeData.message?.replace(/^⚡\s*ĐỘ KIẾP THẤT BẠI!\s*/i, '').replace(/\s*\([^)]*\)/g, '') || 'Thiên lôi quá mạnh, độ kiếp chưa thành!'}
                    </p>
                  </div>

                  <p className={styles.flavourText}>
                    Chân linh được bảo toàn, tích lũy thêm tu vi để tái nghênh thiên kiếp!
                  </p>
                </>
              )}

              {/* Confirm Button (Zero Parentheses!) */}
              <button className={styles.btnPrimary} onClick={onClose}>
                <span>✦</span>
                <span>Thu Lại Thần Niệm</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
