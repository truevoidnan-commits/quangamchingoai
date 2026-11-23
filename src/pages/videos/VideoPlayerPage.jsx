import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import VideoPlayer from '../../components/videos/VideoPlayer';
import VideoEpisodeList from '../../components/videos/VideoEpisodeList';
import VideosBackdrop from '../../components/videos/VideosBackdrop';
import {
  IconArrowLeft,
  IconFilm,
  IconAlertTriangle,
  IconRefresh,
} from '../../components/videos/VideoIcons';
import {
  fetchVideoSeriesById,
  fetchEpisodesBySeriesId,
  fetchEpisodeById,
  checkIsVideoAdmin,
  deleteVideoEpisodeEverywhere,
} from '../../lib/video/videoApi';
import { getPlaybackUrl } from '../../lib/video/videoCloud';
import { getEffectiveProgress, getLocalWatchHistory } from '../../lib/video/videoProgress';
import styles from './VideoPlayerPage.module.css';

export default function VideoPlayerPage() {
  const { seriesId, episodeId } = useParams();
  const navigate = useNavigate();

  const [series, setSeries] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [currentEpisode, setCurrentEpisode] = useState(null);
  const [playbackData, setPlaybackData] = useState(null); // { playbackUrl, subtitles }
  const [initialPosition, setInitialPosition] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [autoNext, setAutoNext] = useState(true);
  const [watchHistoryMap, setWatchHistoryMap] = useState({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [deletingEpisodeId, setDeletingEpisodeId] = useState(null);

  useEffect(() => {
    checkIsVideoAdmin().then(setIsAdmin);
  }, []);

  // 1. Load Series, Episodes and Episode Details
  const loadEpisodeData = useCallback(async (isRefresh = false) => {
    if (!seriesId || !episodeId) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const [sData, epList, epDetail, progress] = await Promise.all([
        fetchVideoSeriesById(seriesId),
        fetchEpisodesBySeriesId(seriesId, true),
        fetchEpisodeById(seriesId, episodeId),
        getEffectiveProgress(seriesId, episodeId),
      ]);

      setSeries(sData);
      setEpisodes(epList);
      setCurrentEpisode(epDetail);

      if (progress && progress.positionSeconds > 5 && !progress.completed) {
        setInitialPosition(progress.positionSeconds);
      } else {
        setInitialPosition(0);
      }

      // Map watch history
      const history = getLocalWatchHistory();
      const map = {};
      for (const h of history) {
        if (h.seriesId === seriesId) {
          map[h.episodeId] = h;
        }
      }
      setWatchHistoryMap(map);

      // Fetch Presigned Playback URL
      const pData = await getPlaybackUrl(seriesId, episodeId, { forceRefresh: isRefresh });
      setPlaybackData(pData);
    } catch (err) {
      console.error('[VideoPlayerPage] Error loading playback:', err);
      setErrorMsg(err.message || 'Lỗi khi lấy thông tin phát tập phim');
    } finally {
      setLoading(false);
    }
  }, [seriesId, episodeId]);

  useEffect(() => {
    loadEpisodeData();
  }, [loadEpisodeData]);

  // Next / Prev navigation
  const currentIndex = episodes.findIndex((e) => e.id === episodeId);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < episodes.length - 1;

  const handleNext = () => {
    if (hasNext) {
      const nextEp = episodes[currentIndex + 1];
      navigate(`/videos/${seriesId}/watch/${nextEp.id}`);
    }
  };

  const handlePrev = () => {
    if (hasPrev) {
      const prevEp = episodes[currentIndex - 1];
      navigate(`/videos/${seriesId}/watch/${prevEp.id}`);
    }
  };

  const handleRefreshUrl = () => {
    loadEpisodeData(true);
  };

  const handleDeleteEpisode = async (ep) => {
    if (!window.confirm(`Bạn có chắc muốn xóa Tập ${ep.episode_number}? Video MP4 và phụ đề của tập này cũng sẽ bị xóa vĩnh viễn.`)) {
      return;
    }

    setDeletingEpisodeId(ep.id);
    try {
      await deleteVideoEpisodeEverywhere(seriesId, ep.id);
      if (ep.id === episodeId) {
        // If current playing episode is deleted, navigate safely to series detail page
        navigate(`/videos/${seriesId}`);
      } else {
        await loadEpisodeData();
      }
    } catch (err) {
      console.error('[VideoPlayerPage] Error deleting episode:', err);
      alert(`Xóa tập thất bại: ${err.message}`);
    } finally {
      setDeletingEpisodeId(null);
    }
  };

  return (
    <div className={styles.page}>
      <VideosBackdrop />
      <div className={styles.container}>
        {/* Top Bar */}
        <div className={styles.topBar}>
          <Link to={`/videos/${seriesId}`} className={styles.backBtn}>
            <IconArrowLeft size={16} /> Quay về {series?.title || 'chi tiết phim'}
          </Link>
          <div className={styles.currentTitle}>
            {series?.title} — {currentEpisode?.title || `Tập ${currentEpisode?.episode_number || ''}`}
          </div>
        </div>

        {/* Loading state */}
        {loading ? (
          <div className={styles.loadingBox}>
            <div className={styles.spinner} />
            <span>Đang chuẩn bị luồng phát video từ Cloudflare R2...</span>
          </div>
        ) : errorMsg ? (
          <div className={styles.loadingBox} style={{ color: '#f87171' }}>
            <IconAlertTriangle size={36} />
            <p>{errorMsg}</p>
            <button
              onClick={handleRefreshUrl}
              style={{
                marginTop: 12,
                padding: '8px 18px',
                background: '#f59e0b',
                color: '#0f172a',
                border: 'none',
                borderRadius: 6,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <IconRefresh size={14} /> Thử lại
            </button>
          </div>
        ) : (
          <div className={styles.layout}>
            {/* Left Area: Video Player & Info */}
            <div className={styles.playerArea}>
              <VideoPlayer
                seriesId={seriesId}
                episodeId={episodeId}
                src={playbackData?.playbackUrl}
                subtitles={playbackData?.subtitles || []}
                initialPosition={initialPosition}
                onNext={handleNext}
                onPrev={handlePrev}
                hasNext={hasNext}
                hasPrev={hasPrev}
                autoNext={autoNext}
                onToggleAutoNext={setAutoNext}
                onRefreshUrl={handleRefreshUrl}
                episodeTitle={currentEpisode?.title || `Tập ${currentEpisode?.episode_number || 1}`}
                seriesTitle={series?.title}
                episodeNumber={currentEpisode?.episode_number || 1}
                posterKey={series?.poster_key || ''}
              />

              <div className={styles.infoBox}>
                <h2 className={styles.episodeHeading}>
                  {currentEpisode?.title || `Tập ${currentEpisode?.episode_number || 1}`}
                </h2>
                <Link to={`/videos/${seriesId}`} className={styles.seriesSubheading}>
                  <IconFilm size={14} /> {series?.title}
                </Link>
                {currentEpisode?.description && (
                  <p className={styles.episodeDescription}>
                    {currentEpisode.description}
                  </p>
                )}
              </div>
            </div>

            {/* Right Area: Episode Sidebar */}
            <div className={styles.episodeSidebar}>
              <VideoEpisodeList
                seriesId={seriesId}
                episodes={episodes}
                currentEpisodeId={episodeId}
                watchHistoryMap={watchHistoryMap}
                isAdmin={isAdmin}
                onDeleteEpisode={handleDeleteEpisode}
                deletingEpisodeId={deletingEpisodeId}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
