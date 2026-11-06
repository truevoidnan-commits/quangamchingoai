import React from 'react';
import { Link } from 'react-router-dom';
import styles from './LobbyTabs.module.css';
import { IconBook, IconBookOpen } from './Icon';

export default function LobbyTabs({ activeTab = 'novels', active }) {
  const current = active || activeTab;
  const isNovels = current === 'novels';

  return (
    <div className={styles.tabSwitcherWrap}>
      <div className={styles.tabSwitcher} role="tablist">
        {isNovels ? (
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

        {!isNovels ? (
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
      </div>
    </div>
  );
}
