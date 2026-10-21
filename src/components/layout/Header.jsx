import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCultivationContext } from '../../context/CultivationContext';
import styles from './Header.module.css';

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === '/';
  const { displayName, cultivation } = useCultivationContext();

  return (
    <>
      <header className={`${styles.header} ${!isHome ? styles.compact : ''}`}>
        <div className={styles.inner}>
          <Link to="/" className={styles.logo} aria-label="Thiên Cơ Lâu - Trang chủ">
            <span className={styles.logoIcon}>✦</span>
            <span className={styles.logoText}>THIÊN CƠ LÂU</span>
          </Link>

          <div className={styles.headerRight}>
            {/* Cloud Sync Button */}
            <Link
              to="/sync"
              title="Đồng Bộ Cloud"
              aria-label="Đồng Bộ Cloud"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '16px',
                fontSize: '0.82rem',
                background: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                color: '#38bdf8',
                textDecoration: 'none',
                fontWeight: '500',
              }}
            >
              <span>☁️</span>
              <span>Đồng bộ</span>
            </Link>

            {/* Cultivation Pill Button */}
            <Link
              to="/cultivation"
              className={styles.cultivationBadge}
              title="Mở Bảng Tu Vi"
              aria-label="Bảng Tu Vi"
            >
              <span className={styles.badgeIcon}>
                {cultivation.realm === 'ngung_khi' && '💭'}
                {cultivation.realm === 'truc_co' && '🔥'}
                {cultivation.realm === 'kim_dan' && '🪐'}
              </span>
              <span className={styles.badgeText}>{displayName}</span>
            </Link>

            {!isHome && (
              <nav className={styles.nav}>
                <Link to="/" className={`btn-ghost ${styles.navBtn}`}>
                  📖 Thư viện
                </Link>
              </nav>
            )}
          </div>
        </div>
        {/* Neon divider line */}
        <div className={styles.neonLine} />
      </header>
    </>
  );
}
