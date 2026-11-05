import React from 'react';
import { Link } from 'react-router-dom';
import styles from './LobbyTabs.module.css';

function IconBook({ size = 15 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function IconBookOpen({ size = 15 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

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
