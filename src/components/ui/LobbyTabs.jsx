import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styles from './LobbyTabs.module.css';
import { IconBook, IconBookOpen, IconVideo, IconLock, IconArrowLeft } from './Icon';
import { isComicsUnlocked, isVideosUnlocked, lockSecretModes, subscribeSecretModes } from '../../lib/secretNav';

export default function LobbyTabs({ activeTab = 'novels', active }) {
  const current = active || activeTab;
  const navigate = useNavigate();

  const [unlocked, setUnlocked] = useState({
    comics: isComicsUnlocked(),
    videos: isVideosUnlocked(),
  });

  useEffect(() => {
    // Sync with secret navigation state
    setUnlocked({
      comics: isComicsUnlocked(),
      videos: isVideosUnlocked(),
    });
    return subscribeSecretModes(setUnlocked);
  }, []);

  const handleLockSecretModes = () => {
    lockSecretModes();
    navigate('/');
  };

  const hasAnySecretUnlocked = unlocked.comics || unlocked.videos;

  // If in main novel lobby and no secret modes are unlocked, do not display redundant tabs
  if (current === 'novels' && !hasAnySecretUnlocked) {
    return null;
  }

  return (
    <div className={styles.tabSwitcherWrap}>
      <div className={styles.tabSwitcher} role="tablist">
        {/* Truyện Chữ (Luôn hiển thị) */}
        {current === 'novels' ? (
          <div className={`${styles.tabItem} ${styles.tabItemActive}`} role="tab" aria-selected="true">
            <IconBook size={14} />
            <span>Truyện Chữ</span>
          </div>
        ) : (
          <Link to="/" className={styles.tabItem} role="tab" aria-selected="false">
            <IconBook size={14} />
            <span>Truyện Chữ</span>
          </Link>
        )}

        {/* Truyện Tranh (Chỉ hiển thị khi đã mở khóa bí mật) */}
        {unlocked.comics && (
          current === 'comics' ? (
            <div
              className={`${styles.tabItem} ${styles.tabItemActive}`}
              id="tab-comics"
              role="tab"
              aria-selected="true"
            >
              <IconBookOpen size={14} />
              <span>Truyện Tranh</span>
            </div>
          ) : (
            <Link
              to="/comics"
              className={styles.tabItem}
              id="tab-comics"
              role="tab"
              aria-selected="false"
            >
              <IconBookOpen size={14} />
              <span>Truyện Tranh</span>
            </Link>
          )
        )}

        {/* Truyện Video (Chỉ hiển thị khi đã mở khóa bí mật) */}
        {unlocked.videos && (
          current === 'videos' ? (
            <div
              className={`${styles.tabItem} ${styles.tabItemActive}`}
              id="tab-videos"
              role="tab"
              aria-selected="true"
            >
              <IconVideo size={14} />
              <span>Truyện Video</span>
            </div>
          ) : (
            <Link
              to="/videos"
              className={styles.tabItem}
              id="tab-videos"
              role="tab"
              aria-selected="false"
            >
              <IconVideo size={14} />
              <span>Truyện Video</span>
            </Link>
          )
        )}

        {/* Lock/Close Secret Modes button when unlocked */}
        {hasAnySecretUnlocked && (
          <button
            type="button"
            className={styles.lockBtn}
            onClick={handleLockSecretModes}
            title="Đóng cấm chế (Ẩn chế độ bí mật)"
            aria-label="Ẩn chế độ bí mật"
          >
            <IconLock size={13} />
          </button>
        )}
      </div>

      {/* Quick return button when inside a secret mode */}
      {current !== 'novels' && (
        <div className={styles.returnRow}>
          <Link to="/" className={styles.returnBtn}>
            <IconArrowLeft size={13} />
            <span>Về Thiên Cơ Lâu</span>
          </Link>
        </div>
      )}
    </div>
  );
}
