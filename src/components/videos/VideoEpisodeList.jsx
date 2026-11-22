import React from 'react';
import { Link } from 'react-router-dom';
import { IconPlay, IconCheck, IconFilm, IconClock } from './VideoIcons';
import styles from './VideoEpisodeList.module.css';

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function VideoEpisodeList({
  seriesId,
  episodes = [],
  currentEpisodeId = null,
  onSelectEpisode = null,
  watchHistoryMap = {},
}) {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>
          <IconFilm size={16} style={{ color: '#fbbf24' }} />
          Danh sách tập
        </h3>
        <span className={styles.countBadge}>{episodes.length} tập</span>
      </div>

      <div className={styles.list}>
        {episodes.length === 0 ? (
          <div className={styles.emptyMsg}>Chưa có tập phim nào.</div>
        ) : (
          episodes.map((ep) => {
            const isActive = ep.id === currentEpisodeId;
            const progress = watchHistoryMap[ep.id];
            const isCompleted = progress?.completed;

            const content = (
              <>
                <div className={styles.itemLeft}>
                  <div className={styles.epNumberBadge}>
                    {isActive ? <IconPlay size={12} /> : ep.episode_number}
                  </div>
                  <div className={styles.epInfo}>
                    <h4 className={styles.epTitle}>{ep.title || `Tập ${ep.episode_number}`}</h4>
                    <div className={styles.epMeta}>
                      {ep.duration_seconds > 0 && (
                        <span>
                          <IconClock size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                          {formatDuration(ep.duration_seconds)}
                        </span>
                      )}
                      {ep.upload_status !== 'ready' && (
                        <span className={styles.statusPending}>
                          {ep.upload_status === 'uploading' ? 'Đang tải...' : 'Chờ tải'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className={styles.itemRight}>
                  {isCompleted && (
                    <div className={styles.progressCircle} title="Đã xem xong">
                      <IconCheck size={10} />
                    </div>
                  )}
                </div>
              </>
            );

            if (onSelectEpisode) {
              return (
                <div
                  key={ep.id}
                  className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
                  onClick={() => onSelectEpisode(ep)}
                >
                  {content}
                </div>
              );
            }

            return (
              <Link
                key={ep.id}
                to={`/videos/${seriesId}/watch/${ep.id}`}
                className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
              >
                {content}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
