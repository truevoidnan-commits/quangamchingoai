import Icon, { IconBook } from '../ui/Icon';
import { useState, useEffect } from 'react';
import { getSyncStatus } from '../../lib/sync/autoSync.js';
import { Link, useLocation } from 'react-router-dom';
import { isVaultSessionUnlocked } from '../../lib/storage.js';
import { useCultivationContext } from '../../context/CultivationContext';
import styles from './Header.module.css';



export default function Header() {
  const location = useLocation();
  const isLobby = location.pathname === '/' || location.pathname === '/comics';
  const { displayName, cultivation } = useCultivationContext();
  const [syncStatus, setSyncStatusState] = useState(() => getSyncStatus());

  const searchParams = new URLSearchParams(location.search);
  const isVault = (location.pathname === '/' || location.pathname === '/add-novel') && searchParams.get('vault') === '1' && isVaultSessionUnlocked();
  const isComics = location.pathname.startsWith('/comics');

  let headerTitle = 'THIÊN CƠ LÂU';
  let logoStyleClass = styles.logoThienCoLau;
  let homeLink = '/';

  if (isVault) {
    headerTitle = 'TÀNG KINH MẬT THẤT';
    logoStyleClass = styles.logoVault;
    homeLink = '/?vault=1';
  } else if (isComics) {
    headerTitle = 'TÀNG KINH HỌA CÁC';
    logoStyleClass = styles.logoComics;
    homeLink = '/comics';
  }

  useEffect(() => {
    if (isVault) {
      document.title = 'Tàng Kinh Mật Thất · Thiên Cơ Lâu';
    } else if (isComics) {
      document.title = 'Tàng Kinh Họa Các · Thiên Cơ Lâu';
    } else {
      document.title = 'Thiên Cơ Lâu · Trình Đọc Truyện';
    }
  }, [isVault, isComics]);

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
        iconName: 'sync',
        text: 'Đang sync',
        shortText: 'Sync',
        statusClass: styles.syncState_syncing,
      };
    }
    if (syncStatus.state === 'offline') {
      return {
        iconName: 'cloud-off',
        text: 'Offline',
        shortText: 'Offline',
        statusClass: styles.syncState_offline,
      };
    }
    if (syncStatus.state === 'attention') {
      return {
        iconName: 'bell',
        text: 'Cần xử lý',
        shortText: 'Chú ý',
        statusClass: styles.syncState_attention,
      };
    }
    if (syncStatus.state === 'error') {
      return {
        iconName: 'cloud-alert',
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
        iconName: 'cloud-check',
        text: `Sync ${hh}:${mm}`,
        shortText: `${hh}:${mm}`,
        statusClass: styles.syncState_synced,
      };
    }
    return {
      iconName: 'cloud',
      text: 'Đồng bộ',
      shortText: '',
      statusClass: styles.syncState_idle,
    };
  };

  const syncBadge = getSyncBadge();

  return (
    <>
      <header className={`${styles.header} ${!isLobby ? styles.compact : ''}`}>
        <div className={styles.inner}>
          <Link to={homeLink} className={`${styles.logo} ${logoStyleClass}`} aria-label={`${headerTitle} - Trang chủ`}>
            <Icon name="star" size={13} className={styles.logoIcon} />
            <span className={styles.logoText}>{headerTitle}</span>
          </Link>

          <div className={styles.headerRight}>
            {/* Cloud Sync Button & Status Indicator */}
            <Link
              to="/sync"
              className={`${styles.syncBtn} ${syncBadge.statusClass}`}
              title={syncStatus.message || `Đồng Bộ Cloud (${syncBadge.text})`}
              aria-label={syncStatus.message || `Đồng Bộ Cloud (${syncBadge.text})`}
            >
              <span className={styles.syncIcon}><Icon name={syncBadge.iconName} size={14} /></span>
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
                  <Icon name="phone" size={12} />
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
                <Icon
                  name={cultivation.realm === 'ngung_khi' ? 'realm-ngung-khi' : cultivation.realm === 'truc_co' ? 'realm-truc-co' : 'realm-kim-dan'}
                  size={14}
                />
              </span>
              <span className={styles.badgeText}>{displayName}</span>
            </Link>

            {!isLobby && (
              <nav className={styles.nav}>
                <Link
                  to="/"
                  className={styles.navBtn}
                  title="Về Thư viện"
                  aria-label="Thư viện"
                >
                  <span className={styles.navBtnIcon}>
                    <IconBook size={13} />
                  </span>
                  <span className={styles.navBtnText}>Thư viện</span>
                </Link>
              </nav>
            )}
          </div>
        </div>
        {/* Neon divider line */}
        <div className={`${styles.neonLine} ${isComics ? styles.neonLineComics : ''}`} />
      </header>
    </>
  );
}
