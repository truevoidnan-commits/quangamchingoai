import Icon, { IconBook, IconVideo, IconBookOpen } from '../ui/Icon';
import { useState, useEffect, useRef } from 'react';
import { getSyncStatus } from '../../lib/sync/autoSync.js';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { isVaultSessionUnlocked } from '../../lib/storage.js';
import { useCultivationContext } from '../../context/CultivationContext';
import { unlockComics, unlockVideos } from '../../lib/secretNav.js';
import styles from './Header.module.css';

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const isVideos = location.pathname.startsWith('/videos');
  const isComics = location.pathname.startsWith('/comics');
  const isLobby = location.pathname === '/' || isComics || isVideos;
  const { displayName, cultivation } = useCultivationContext();
  const [syncStatus, setSyncStatusState] = useState(() => getSyncStatus());

  const searchParams = new URLSearchParams(location.search);
  const isVault = (location.pathname === '/' || location.pathname === '/add-novel') && searchParams.get('vault') === '1' && isVaultSessionUnlocked();

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
  } else if (isVideos) {
    headerTitle = 'THẦN THÔNG ẢNH HỌA';
    logoStyleClass = styles.logoVideos;
    homeLink = '/videos';
  }

  useEffect(() => {
    if (isVault) {
      document.title = 'Tàng Kinh Mật Thất · Thiên Cơ Lâu';
    } else if (isComics) {
      document.title = 'Tàng Kinh Họa Các · Thiên Cơ Lâu';
    } else if (isVideos) {
      document.title = 'Thần Thông Ảnh Họa · Thiên Cơ Lâu';
    } else {
      document.title = 'Thiên Cơ Lâu · Trình Đọc Truyện';
    }
  }, [isVault, isComics, isVideos]);

  // Secret Gestures Tracker (4 taps -> Comics, Long-press 2s or 5 taps -> Videos)
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef(null);
  const holdIntervalRef = useRef(null);
  const [holdingProgress, setHoldingProgress] = useState(0);

  const startHold = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    cancelHold();
    let elapsed = 0;
    holdIntervalRef.current = setInterval(() => {
      elapsed += 50;
      const pct = Math.min(100, Math.round((elapsed / 2000) * 100));
      setHoldingProgress(pct);
      if (pct >= 100) {
        clearInterval(holdIntervalRef.current);
        holdIntervalRef.current = null;
        unlockVideos();
        setHoldingProgress(0);
        navigate('/videos');
      }
    }, 50);
  };

  const cancelHold = () => {
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
    setHoldingProgress(0);
  };

  const handleLogoClick = (e) => {
    if (holdingProgress >= 100) {
      e.preventDefault();
      cancelHold();
      return;
    }
    cancelHold();

    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);

    if (tapCountRef.current === 4) {
      e.preventDefault();
      tapCountRef.current = 0;
      unlockComics();
      navigate('/comics');
      return;
    }

    if (tapCountRef.current >= 5) {
      e.preventDefault();
      tapCountRef.current = 0;
      unlockVideos();
      navigate('/videos');
      return;
    }

    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 1500);
  };

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
          <div className={styles.logoWrap}>
            {holdingProgress > 0 && <div className={styles.holdRing} />}
            <Link
              to={homeLink}
              className={`${styles.logo} ${logoStyleClass}`}
              aria-label={`${headerTitle} - Trang chủ`}
              onClick={handleLogoClick}
              onPointerDown={startHold}
              onPointerUp={cancelHold}
              onPointerLeave={cancelHold}
              onPointerCancel={cancelHold}
            >
              {isVideos ? (
                <IconVideo size={15} className={styles.logoIcon} />
              ) : isComics ? (
                <IconBookOpen size={15} className={styles.logoIcon} />
              ) : (
                <Icon name="star" size={13} className={styles.logoIcon} />
              )}
              <span className={styles.logoText}>{headerTitle}</span>
            </Link>
          </div>

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
        <div className={`${styles.neonLine} ${isComics ? styles.neonLineComics : isVideos ? styles.neonLineVideos : ''}`} />
      </header>
    </>
  );
}
