import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import VideoEpisodeList from '../../components/videos/VideoEpisodeList';
import VideoAdminModal from '../../components/videos/VideoAdminModal';
import {
  IconArrowLeft,
  IconPlay,
  IconEdit,
  IconTrash,
  IconFilm,
  IconClock,
  IconSparkles,
} from '../../components/videos/VideoIcons';
import {
  fetchVideoSeriesById,
  fetchEpisodesBySeriesId,
  checkIsVideoAdmin,
  deleteVideoSeries,
  deleteVideoEpisodeEverywhere,
} from '../../lib/video/videoApi';
import { deleteSeriesMedia } from '../../lib/video/videoCloud';
import { getLocalWatchHistory } from '../../lib/video/videoProgress';
import styles from './VideoDetailPage.module.css';

export default function VideoDetailPage() {
  const { seriesId } = useParams();
  const navigate = useNavigate();

  const [series, setSeries] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [watchHistoryMap, setWatchHistoryMap] = useState({});
  const [deletingEpisodeId, setDeletingEpisodeId] = useState(null);

  // Check admin
  useEffect(() => {
    checkIsVideoAdmin().then(setIsAdmin);
  }, []);

  // Load series & episodes
  const loadData = useCallback(async () => {
    if (!seriesId) return;
    setLoading(true);
    try {
      const [sData, epData] = await Promise.all([
        fetchVideoSeriesById(seriesId),
        fetchEpisodesBySeriesId(seriesId, true),
      ]);
      setSeries(sData);
      setEpisodes(epData);

      // Map watch history for this series
      const history = getLocalWatchHistory();
      const map = {};
      for (const h of history) {
        if (h.seriesId === seriesId) {
          map[h.episodeId] = h;
        }
      }
      setWatchHistoryMap(map);
    } catch (err) {
      console.error('[VideoDetailPage] Error loading series detail:', err);
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Delete Series
  const handleDeleteSeries = async () => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa bộ phim "${series?.title}" cùng tất cả các tập và tệp video trên Cloudflare R2?`)) {
      return;
    }

    try {
      await deleteSeriesMedia(seriesId);
      await deleteVideoSeries(seriesId);
      alert('Đã xóa bộ phim và toàn bộ dữ liệu video trên R2 thành công.');
      navigate('/videos');
    } catch (err) {
      console.error('[VideoDetailPage] Error deleting series:', err);
      alert(`Xóa bộ phim thất bại: ${err.message}`);
    }
  };

  // Handle Delete Single Episode
  const handleDeleteEpisode = async (ep) => {
    if (!window.confirm(`Bạn có chắc muốn xóa Tập ${ep.episode_number}? Video MP4 và phụ đề của tập này cũng sẽ bị xóa vĩnh viễn.`)) {
      return;
    }

    setDeletingEpisodeId(ep.id);
    try {
      await deleteVideoEpisodeEverywhere(seriesId, ep.id);
      await loadData();
    } catch (err) {
      console.error('[VideoDetailPage] Error deleting episode:', err);
      alert(`Xóa tập thất bại: ${err.message}`);
    } finally {
      setDeletingEpisodeId(null);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.container} style={{ textAlign: 'center', padding: '100px 0' }}>
          <IconSparkles size={32} style={{ color: '#fbbf24', animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: 12, color: '#94a3b8' }}>Đang tải thông tin bộ phim...</p>
        </div>
      </div>
    );
  }

  if (!series) {
    return (
      <div className={styles.page}>
        <div className={styles.container} style={{ textAlign: 'center', padding: '100px 0' }}>
          <h2>Không tìm thấy bộ phim</h2>
          <p style={{ color: '#94a3b8' }}>Bộ phim không tồn tại hoặc đã bị gỡ bỏ.</p>
          <Link to="/videos" className={styles.backBtn} style={{ marginTop: 16 }}>
            <IconArrowLeft size={16} /> Quay về Thư viện Video
          </Link>
        </div>
      </div>
    );
  }

  // Find resume episode or first episode
  const publishedEpisodes = episodes.filter((ep) => ep.upload_status === 'ready' && ep.published);
  const firstEpisode = publishedEpisodes[0] || episodes[0];

  // Check if any episode has resume progress
  let resumeEpisode = null;
  for (const ep of publishedEpisodes) {
    const prog = watchHistoryMap[ep.id];
    if (prog && prog.positionSeconds > 10 && !prog.completed) {
      resumeEpisode = ep;
      break;
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Back Link */}
        <Link to="/videos" className={styles.backBtn}>
          <IconArrowLeft size={16} /> Quay về Thần Thông Ảnh Họa
        </Link>

        {/* Hero Card */}
        <div className={styles.heroCard}>
          <div className={styles.posterWrapper}>
            {series.poster_key ? (
              <img src={series.poster_key} alt={series.title} className={styles.posterImg} />
            ) : (
              <div className={styles.posterPlaceholder}>
                <IconFilm size={48} />
              </div>
            )}
          </div>

          <div className={styles.info}>
            <h1 className={styles.title}>{series.title}</h1>

            <div className={styles.metaRow}>
              <span
                className={`${styles.badge} ${
                  series.status === 'completed'
                    ? styles.badgeCompleted
                    : series.status === 'upcoming'
                    ? styles.badgeUpcoming
                    : styles.badgeOngoing
                }`}
              >
                {series.status === 'completed'
                  ? 'Hoàn thành'
                  : series.status === 'upcoming'
                  ? 'Sắp chiếu'
                  : 'Đang ra'}
              </span>

              {!series.published && (
                <span className={styles.badge} style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171' }}>
                  Chưa xuất bản
                </span>
              )}

              {series.genres?.map((g, idx) => (
                <span key={idx} className={styles.genreTag}>
                  {g}
                </span>
              ))}
            </div>

            {series.description && (
              <p className={styles.description}>{series.description}</p>
            )}

            {/* Actions */}
            <div className={styles.actionRow}>
              {resumeEpisode ? (
                <Link
                  to={`/videos/${series.id}/watch/${resumeEpisode.id}`}
                  className={styles.btnPrimary}
                >
                  <IconPlay size={16} /> Tiếp tục xem (Tập {resumeEpisode.episode_number})
                </Link>
              ) : firstEpisode ? (
                <Link
                  to={`/videos/${series.id}/watch/${firstEpisode.id}`}
                  className={styles.btnPrimary}
                >
                  <IconPlay size={16} /> Xem từ đầu (Tập 1)
                </Link>
              ) : null}

              {isAdmin && (
                <>
                  <button
                    className={styles.btnSecondary}
                    onClick={() => setIsAdminModalOpen(true)}
                  >
                    <IconEdit size={14} /> Chỉnh sửa / Thêm tập
                  </button>
                  <button
                    className={styles.btnDanger}
                    onClick={handleDeleteSeries}
                  >
                    <IconTrash size={14} /> Xóa phim
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Episode List */}
        <VideoEpisodeList
          seriesId={series.id}
          episodes={episodes}
          watchHistoryMap={watchHistoryMap}
          isAdmin={isAdmin}
          onDeleteEpisode={handleDeleteEpisode}
          deletingEpisodeId={deletingEpisodeId}
        />

        {/* Admin Modal */}
        <VideoAdminModal
          isOpen={isAdminModalOpen}
          initialSeries={series}
          onClose={() => setIsAdminModalOpen(false)}
          onSuccess={() => {
            loadData();
            setIsAdminModalOpen(false);
          }}
        />
      </div>
    </div>
  );
}
