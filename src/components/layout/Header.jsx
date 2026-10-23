import { useState, useEffect } from 'react';
import { getSyncStatus } from '../../lib/sync/autoSync.js';
import { Link, useLocation } from 'react-router-dom';
import { useCultivationContext } from '../../context/CultivationContext';
import styles from './Header.module.css';

export default function Header() {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const { displayName, cultivation } = useCultivationContext();
  const [syncStatus, setSyncStatusState] = useState(() => getSyncStatus());

  useEffect(() => {
    const handleStatus = (e) => {
      setSyncStatusState(e.detail || getSyncStatus());
    };
    window.addEventListener('tcl_sync_status_changed', handleStatus);
    return () => window.removeEventListener('tcl_sync_status_changed', handleStatus);
  }, []);

  const getSyncBadge = () => {
    if (syncStatus.state === 'syncing') {
      return {
        icon: '🔄',
        text: 'Đang sync',
        shortText: 'Sync',
        statusClass: styles.syncState_syncing,
      };
    }
    if (syncStatus.state === 'offline') {
      return {
        icon: '📴',
        text: 'Offline',
        shortText: 'Offline',
        statusClass: styles.syncState_offline,
      };
    }
    if (syncStatus.state === 'attention') {
      return {
        icon: '🔔',
        text: 'Cần xử lý',
        shortText: 'Chú ý',
        statusClass: styles.syncState_attention,
      };
    }
    if (syncStatus.state === 'error') {
      return {
        icon: '⚠️',
        text: 'Lỗi sync',
        shortText: 'Lỗi',
        statusClass: styles.syncState_error,
      };
    }
    if (syncStatus.lastSyncedAt > 0) {
      const d = new Date(syncStatus.lastSyncedAt);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return {
        icon: '☁️',
        text: `Sync ${hh}:${mm}`,
        shortText: `${hh}:${mm}`,
        statusClass: styles.syncState_synced,
      };
    }
    return {
      icon: '☁️',
      text: 'Đồng bộ',
      shortText: '',
      statusClass: styles.syncState_idle,
    };
  };

  const syncBadge = getSyncBadge();

  return (
    <>
      <header className={`${styles.header} ${!isHome ? styles.compact : ''}`}>
        <div className={styles.inner}>
          <Link to="/" className={styles.logo} aria-label="Thiên Cơ Lâu - Trang chủ">
            <span className={styles.logoIcon}>✦</span>
            <span className={styles.logoText}>THIÊN CƠ LÂU</span>
          </Link>

          <div className={styles.headerRight}>
            {/* Cloud Sync Button & Status Indicator */}
            <Link
              to="/sync"
              className={`${styles.syncBtn} ${syncBadge.statusClass}`}
              title={syncStatus.message || `Đồng Bộ Cloud (${syncBadge.text})`}
              aria-label={syncStatus.message || `Đồng Bộ Cloud (${syncBadge.text})`}
            >
              <span className={styles.syncIcon}>{syncBadge.icon}</span>
              <span className={styles.syncTextFull}>{syncBadge.text}</span>
              {syncBadge.shortText ? (
                <span className={styles.syncTextShort}>{syncBadge.shortText}</span>
              ) : null}
              {syncStatus.parallelDeviceDetected && (
                <span
                  title="Thiết bị khác vừa cập nhật tu vi"
                  aria-label="Thiết bị khác vừa cập nhật tu vi"
                  className={styles.syncParallelIcon}
                >
                  📱
                </span>
              )}
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
                <Link
                  to="/"
                  className={`btn-ghost ${styles.navBtn}`}
                  title="Về Thư viện"
                  aria-label="Thư viện"
                >
                  <span className={styles.navBtnIcon}>📖</span>
                  <span className={styles.navBtnText}> Thư viện</span>
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
