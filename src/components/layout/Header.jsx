import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCultivation } from '../../hooks/useCultivation';
import CultivationModal from '../cultivation/CultivationModal';
import styles from './Header.module.css';

export default function Header() {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const { displayName, cultivation } = useCultivation();
  const [modalOpen, setModalOpen] = useState(false);

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
            <button
              className={styles.cultivationBadge}
              onClick={() => setModalOpen(true)}
              title="Mở Bảng Tu Vi"
              aria-label="Bảng Tu Vi"
            >
              <span className={styles.badgeIcon}>
                {cultivation.realm === 'ngung_khi' && '⚡'}
                {cultivation.realm === 'truc_co' && '🔥'}
                {cultivation.realm === 'kim_dan' && '🏛️'}
              </span>
              <span className={styles.badgeText}>{displayName}</span>
            </button>

            {!isHome && (
              <nav className={styles.nav}>
                <Link to="/" className={`btn-ghost ${styles.navBtn}`}>
                  ← Thư viện
                </Link>
              </nav>
            )}
          </div>
        </div>
        {/* Neon divider line */}
        <div className={styles.neonLine} />
      </header>

      {/* Cultivation Center Modal */}
      <CultivationModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
