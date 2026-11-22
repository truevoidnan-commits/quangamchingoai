import React from 'react';
import { Link } from 'react-router-dom';
import styles from './LobbyTabs.module.css';
import { IconBook, IconBookOpen, IconVideo } from './Icon';

export default function LobbyTabs({ activeTab = 'novels', active }) {
  const current = active || activeTab;

  return (
    <div className={styles.tabSwitcherWrap}>
      <div className={styles.tabSwitcher} role="tablist">
        {current === 'novels' ? (
          <div className={`${styles.tabItem} ${styles.tabItemActive}`} role="tab" aria-selected="true">
            <IconBook size={15} />
            <span>Truyện Chữ</span>
          </div>
        ) : (
          <Link to="/" className={styles.tabItem} role="tab" aria-selected="false">
            <IconBook size={15} />
            <span>Truyện Chữ</span>
          </Link>
        )}

        {current === 'comics' ? (
          <div
            className={`${styles.tabItem} ${styles.tabItemActive}`}
            id="tab-comics"
            role="tab"
            aria-selected="true"
          >
            <IconBookOpen size={15} />
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
            <IconBookOpen size={15} />
            <span>Truyện Tranh</span>
          </Link>
        )}

        {current === 'videos' ? (
          <div
            className={`${styles.tabItem} ${styles.tabItemActive}`}
            id="tab-videos"
            role="tab"
            aria-selected="true"
          >
            <IconVideo size={15} />
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
            <IconVideo size={15} />
            <span>Truyện Video</span>
          </Link>
        )}
      </div>
    </div>
  );
}
