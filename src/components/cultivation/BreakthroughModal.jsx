import { useEffect } from 'react';
import styles from './BreakthroughModal.module.css';

export default function BreakthroughModal({ data, onClose }) {
  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(() => {
      // Auto close after 8 seconds if user doesn't click
    }, 8000);
    return () => clearTimeout(timer);
  }, [data]);

  if (!data) return null;

  const icon = data.icon || '⚡';
  const title = data.title || 'ĐỘT PHÁ CẢNH GIỚI!';
  const subtitle = data.subtitle || 'Linh khí cuộn trào, thăng hoa tu vi!';
  const badgeText = data.badge || '✦ CỰC CẢNH THĂNG HOA ✦';
  const theme = data.theme || (data.title?.includes('KIM ĐAN') ? 'gold' : data.title?.includes('TRÚC CƠ') ? 'fire' : data.title?.includes('NGUYÊN ANH') ? 'purple' : 'cyan');

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.container} onClick={(e) => e.stopPropagation()}>
        {/* Background Aura Rays */}
        <div className={`${styles.auraRays} ${styles[theme]}`} />
        
        {/* Rotating Magic Rings */}
        <div className={styles.ringOuter}>
          <svg className={styles.ringSvg} viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="6 8" />
            <circle cx="100" cy="100" r="75" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="14 6" />
            <polygon points="100,20 170,140 30,140" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
            <polygon points="100,180 30,60 170,60" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
          </svg>
        </div>

        {/* Floating Sparks */}
        <div className={styles.particlesContainer}>
          {Array.from({ length: 14 }).map((_, i) => (
            <span key={i} className={styles.particle} style={{ '--i': i }} />
          ))}
        </div>

        {/* Main Content Card */}
        <div className={styles.card}>
          <div className={styles.badgeWrap}>
            <span className={`${styles.badge} ${styles[`badge_${theme}`]}`}>{badgeText}</span>
          </div>

          <div className={`${styles.iconWrap} ${styles[`icon_${theme}`]}`}>
            <span className={styles.icon}>{icon}</span>
            <div className={styles.iconPulse} />
          </div>

          <h2 className={`${styles.title} ${styles[`title_${theme}`]}`}>{title}</h2>

          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}

          {data.cpStr && (
            <div className={styles.cpBadge}>
              <span>Chiến lực hiện tại:</span>
              <strong>{data.cpStr}</strong>
            </div>
          )}

          <button className={`${styles.actionBtn} ${styles[`btn_${theme}`]}`} onClick={onClose}>
            ✨ LĨNH HỘI ĐẠO QUẢ
          </button>
        </div>
      </div>
    </div>
  );
}
