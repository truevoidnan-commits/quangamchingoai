import React from 'react';
import { Link } from 'react-router-dom';
import { IconClock, IconPlay, IconFilm } from './VideoIcons';
import styles from './VideoContinueWatching.module.css';

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function VideoContinueWatching({ history = [] }) {
  if (!history || history.length === 0) return null;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>
          <IconClock size={16} className={styles.titleIcon} />
          Tiếp tục xem
        </h2>
      </div>

      <div className={styles.carousel}>
        {history.map((item) => {
          const percent = item.durationSeconds > 0
            ? Math.min(100, Math.round((item.positionSeconds / item.durationSeconds) * 100))
            : 0;

          const remaining = Math.max(0, (item.durationSeconds || 0) - (item.positionSeconds || 0));

          return (
            <Link
              key={item.episodeId}
              to={`/videos/${item.seriesId}/watch/${item.episodeId}`}
              className={styles.itemCard}
            >
              <div className={styles.thumbWrapper}>
                {item.posterKey ? (
                  <img
                    src={item.posterKey}
                    alt={item.episodeTitle || item.seriesTitle}
                    className={styles.thumbImg}
                  />
                ) : (
                  <div className={styles.thumbPlaceholder}>
                    <IconFilm size={28} />
                  </div>
                )}

                <div className={styles.playOverlay}>
                  <div className={styles.playBtn}>
                    <IconPlay size={16} />
                  </div>
                </div>

                <div className={styles.progressBarContainer}>
                  <div
                    className={styles.progressBarFill}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>

              <div className={styles.itemInfo}>
                <span className={styles.seriesTitle}>{item.seriesTitle || 'Truyện Video'}</span>
                <h4 className={styles.episodeTitle}>
                  {item.episodeTitle || `Tập ${item.episodeNumber || 1}`}
                </h4>
                <span className={styles.timeRemaining}>
                  {remaining > 0 ? `Còn ${formatDuration(remaining)}` : 'Đã xem xong'}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
