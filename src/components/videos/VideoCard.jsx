import React from 'react';
import { Link } from 'react-router-dom';
import { IconFilm, IconPlay } from './VideoIcons';
import styles from './VideoCard.module.css';

export default function VideoCard({ series }) {
  if (!series) return null;

  const {
    id,
    title,
    description,
    poster_key,
    genres = [],
    status = 'ongoing',
    published = false,
    episodes_count = 0,
  } = series;

  // Status mapping
  let statusText = 'Đang ra';
  let statusClass = styles.statusOngoing;
  if (status === 'completed') {
    statusText = 'Hoàn thành';
    statusClass = styles.statusCompleted;
  } else if (status === 'upcoming') {
    statusText = 'Sắp chiếu';
    statusClass = styles.statusUpcoming;
  }

  return (
    <Link to={`/videos/${id}`} className={styles.card}>
      <div className={styles.posterWrapper}>
        {poster_key ? (
          <img
            src={poster_key.startsWith('http') ? poster_key : `${poster_key}`}
            alt={title}
            className={styles.posterImg}
            loading="lazy"
          />
        ) : (
          <div className={styles.posterPlaceholder}>
            <IconFilm size={36} />
          </div>
        )}

        <span className={`${styles.statusBadge} ${statusClass}`}>
          {statusText}
        </span>

        {!published && (
          <span className={styles.unpublishedBadge}>Chưa xuất bản</span>
        )}

        <div className={styles.episodesBadge}>
          <IconPlay size={10} />
          <span>{episodes_count > 0 ? `${episodes_count} tập` : 'Tập phim'}</span>
        </div>
      </div>

      <div className={styles.info}>
        <h3 className={styles.title} title={title}>
          {title}
        </h3>

        {genres && genres.length > 0 && (
          <div className={styles.genres}>
            {genres.slice(0, 3).map((g, idx) => (
              <span key={idx} className={styles.genreTag}>
                {g}
              </span>
            ))}
          </div>
        )}

        {description && (
          <p className={styles.desc}>{description}</p>
        )}
      </div>
    </Link>
  );
}
