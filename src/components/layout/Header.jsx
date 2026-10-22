import { useState, useEffect } from 'react';
import { getSyncStatus } from '../../lib/sync/autoSync.js';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCultivationContext } from '../../context/CultivationContext';
import styles from './Header.module.css';

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
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
      return { icon: '🔄', text: 'Đang sync', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.4)' };
    }
    if (syncStatus.state === 'offline') {
      return { icon: '📴', text: 'Offline', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)', border: 'rgba(148, 163, 184, 0.3)' };
    }
    if (syncStatus.state === 'attention') {
      return { icon: '🔔', text: 'Cần xử lý', color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.18)', border: 'rgba(251, 191, 36, 0.4)' };
    }
    if (syncStatus.state === 'error') {
      return { icon: '⚠️', text: 'Lỗi sync', color: '#f87171', bg: 'rgba(248, 113, 113, 0.18)', border: 'rgba(248, 113, 113, 0.4)' };
    }
    if (syncStatus.lastSyncedAt > 0) {
      const d = new Date(syncStatus.lastSyncedAt);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return { icon: '☁️', text: `Sync ${hh}:${mm}`, color: '#34d399', bg: 'rgba(52, 211, 153, 0.12)', border: 'rgba(52, 211, 153, 0.3)' };
    }
    return { icon: '☁️', text: 'Đồng bộ', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.3)' };
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
              title={syncStatus.message || `Đồng Bộ Cloud (${syncBadge.text})`}
              aria-label="Đồng Bộ Cloud"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '16px',
                fontSize: '0.82rem',
                background: syncBadge.bg,
                border: `1px solid ${syncBadge.border}`,
                color: syncBadge.color,
                textDecoration: 'none',
                fontWeight: '500',
                transition: 'all 0.2s ease',
              }}
            >
              <span>{syncBadge.icon}</span>
              <span>{syncBadge.text}</span>
              {syncStatus.parallelDeviceDetected && (
                <span title="Thiết bị khác vừa cập nhật tu vi" style={{ fontSize: '0.75rem', marginLeft: '2px' }}>📱</span>
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
