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
