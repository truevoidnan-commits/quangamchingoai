import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  IconPlay,
  IconPause,
  IconVolume,
  IconVolumeMute,
  IconMaximize,
  IconMinimize,
  IconRotateCcw,
  IconRotateCw,
  IconSkipBack,
  IconSkipForward,
  IconRefresh,
  IconAlertTriangle,
  IconX,
  IconSubtitles,
} from './VideoIcons';
import { recordWatchProgress } from '../../lib/video/videoProgress';
import styles from './VideoPlayer.module.css';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mStr = m < 10 ? `0${m}` : `${m}`;
  const sStr = s < 10 ? `0${s}` : `${s}`;
  if (h > 0) {
    const hStr = h < 10 ? `0${h}` : `${h}`;
    return `${hStr}:${mStr}:${sStr}`;
  }
  return `${mStr}:${sStr}`;
}

export default function VideoPlayer({
  seriesId,
  episodeId,
  src,
  subtitles = [],
  initialPosition = 0,
  onNext = null,
  onPrev = null,
  hasNext = false,
  hasPrev = false,
  autoNext = true,
  onToggleAutoNext = null,
  onRefreshUrl = null,
  episodeTitle = '',
  seriesTitle = '',
  episodeNumber = 1,
  posterKey = '',
}) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const timelineRef = useRef(null);
  const controlsTimeoutRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [resumePromptTime, setResumePromptTime] = useState(null);
  const [activeSubtitle, setActiveSubtitle] = useState('off');

  // 1. Initial Seek / Resume Prompt
  useEffect(() => {
    if (initialPosition && initialPosition > 10) {
      setResumePromptTime(initialPosition);
    }
  }, [episodeId, initialPosition]);

  // 2. Hide controls automatically after 3.5s of inactivity while playing
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3500);
    }
  }, [isPlaying]);

  const handleMouseMove = () => {
    resetControlsTimer();
  };

  // 3. Play / Pause Toggle
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused || video.ended) {
      video.play().catch((err) => {
        console.warn('[VideoPlayer] Play interrupted:', err);
      });
    } else {
      video.pause();
      // Record progress immediately on pause
      recordWatchProgress(seriesId, episodeId, video.currentTime, video.duration, {
        immediate: true,
        extraMeta: { seriesTitle, episodeTitle, episodeNumber, posterKey },
      });
    }
  };

  // 4. Seek Handler
  const handleTimelineClick = (e) => {
    const timeline = timelineRef.current;
    const video = videoRef.current;
    if (!timeline || !video || !duration) return;

    const rect = timeline.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = percent * duration;

    video.currentTime = targetTime;
    setCurrentTime(targetTime);

    // Save seek point immediately
    recordWatchProgress(seriesId, episodeId, targetTime, duration, {
      immediate: true,
      extraMeta: { seriesTitle, episodeTitle, episodeNumber, posterKey },
    });
  };

  // 5. Skip 10 seconds
  const skipTime = (delta) => {
    const video = videoRef.current;
    if (!video) return;
    const newTime = Math.max(0, Math.min(video.currentTime + delta, duration));
    video.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // 6. Volume & Mute
  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isMuted) {
      video.muted = false;
      setIsMuted(false);
      if (volume === 0) setVolume(0.5);
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  };

  // 7. Playback Speed
  const handleSpeedChange = (e) => {
    const speed = parseFloat(e.target.value);
    setPlaybackRate(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  // 8. Fullscreen
  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // 9. Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }

      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
        case 'j':
        case 'J':
          e.preventDefault();
          skipTime(-10);
          break;
        case 'ArrowRight':
        case 'l':
        case 'L':
          e.preventDefault();
          skipTime(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (videoRef.current) {
            const v = Math.min(1, videoRef.current.volume + 0.1);
            videoRef.current.volume = v;
            setVolume(v);
            setIsMuted(false);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (videoRef.current) {
            const v = Math.max(0, videoRef.current.volume - 0.1);
            videoRef.current.volume = v;
            setVolume(v);
            if (v === 0) setIsMuted(true);
          }
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [duration, volume, isMuted, isPlaying]);

  // 10. Video Event Listeners
  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    setCurrentTime(video.currentTime);

    // Update buffered
    if (video.buffered && video.buffered.length > 0) {
      setBufferedEnd(video.buffered.end(video.buffered.length - 1));
    }

    // Debounced watch progress
    recordWatchProgress(seriesId, episodeId, video.currentTime, video.duration, {
      immediate: false,
      extraMeta: { seriesTitle, episodeTitle, episodeNumber, posterKey },
    });
  };

  const onLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration);
    setIsLoading(false);
    setErrorMsg(null);
  };

  const onEnded = () => {
    setIsPlaying(false);
    setShowControls(true);

    // Save 100% completion
    recordWatchProgress(seriesId, episodeId, duration, duration, {
      immediate: true,
      completed: true,
      extraMeta: { seriesTitle, episodeTitle, episodeNumber, posterKey },
    });

    if (autoNext && hasNext && onNext) {
      onNext();
    }
  };

  const onError = () => {
    const video = videoRef.current;
    const err = video?.error;
    let msg = 'Không thể phát video này.';
    if (err?.code === 2) msg = 'Lỗi mạng: Không thể kết nối đến máy chủ lưu trữ R2.';
    if (err?.code === 3) msg = 'Lỗi giải mã: Định dạng video không được hỗ trợ.';
    if (err?.code === 4) msg = 'Đường dẫn video đã hết hạn hoặc tệp không tồn tại.';
    setErrorMsg(msg);
    setIsLoading(false);
  };

  // 11. Subtitle switching
  const handleSubtitleChange = (e) => {
    const lang = e.target.value;
    setActiveSubtitle(lang);

    const video = videoRef.current;
    if (!video || !video.textTracks) return;

    for (let i = 0; i < video.textTracks.length; i++) {
      const track = video.textTracks[i];
      if (lang === 'off') {
        track.mode = 'disabled';
      } else if (track.language === lang) {
        track.mode = 'showing';
      } else {
        track.mode = 'disabled';
      }
    }
  };

  // Calculations for timeline
  const playedPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? Math.min(100, (bufferedEnd / duration) * 100) : 0;

  return (
    <div
      ref={containerRef}
      className={styles.playerContainer}
      onMouseMove={handleMouseMove}
      tabIndex={0}
    >
      <video
        ref={videoRef}
        src={src}
        className={styles.videoElement}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onPlay={() => {
          setIsPlaying(true);
          resetControlsTimer();
        }}
        onPause={() => {
          setIsPlaying(false);
          setShowControls(true);
        }}
        onWaiting={() => setIsLoading(true)}
        onPlaying={() => setIsLoading(false)}
        onEnded={onEnded}
        onError={onError}
        playsInline
      >
        {subtitles.map((sub) => (
          <track
            key={sub.id || sub.languageCode}
            kind="subtitles"
            src={sub.url}
            srcLang={sub.languageCode || 'vi'}
            label={sub.label || 'Tiếng Việt'}
            default={sub.isDefault}
          />
        ))}
      </video>

      {/* Loading Spinner */}
      {isLoading && !errorMsg && (
        <div className={styles.centerOverlay} style={{ pointerEvents: 'none' }}>
          <div className={styles.spinner} />
        </div>
      )}

      {/* Big Center Play Button when paused */}
      {!isPlaying && !isLoading && !errorMsg && (
        <div className={styles.centerOverlay} onClick={togglePlay}>
          <div className={styles.centerPlayBtn}>
            <IconPlay size={32} />
          </div>
        </div>
      )}

      {/* Resume from previous timestamp prompt */}
      {resumePromptTime && (
        <div className={styles.resumeToast}>
          <span>Tiếp tục xem từ <strong>{formatTime(resumePromptTime)}</strong>?</span>
          <button
            className={styles.resumeBtn}
            onClick={() => {
              if (videoRef.current) {
                videoRef.current.currentTime = resumePromptTime;
              }
              setResumePromptTime(null);
              togglePlay();
            }}
          >
            Đồng ý
          </button>
          <button
            className={styles.resumeCloseBtn}
            onClick={() => setResumePromptTime(null)}
          >
            <IconX size={14} />
          </button>
        </div>
      )}

      {/* Error Overlay */}
      {errorMsg && (
        <div className={styles.errorOverlay}>
          <IconAlertTriangle size={48} className={styles.errorIcon} />
          <h3 className={styles.errorTitle}>Lỗi phát tập phim</h3>
          <p className={styles.errorMsg}>{errorMsg}</p>
          {onRefreshUrl && (
            <button className={styles.retryBtn} onClick={onRefreshUrl}>
              <IconRefresh size={16} /> Tải lại URL tập phim
            </button>
          )}
        </div>
      )}

      {/* Custom Bottom Controls Bar */}
      <div className={`${styles.controlsBar} ${!showControls && isPlaying ? styles.controlsHidden : ''}`}>
        {/* Timeline */}
        <div
          ref={timelineRef}
          className={styles.timelineWrapper}
          onClick={handleTimelineClick}
        >
          <div className={styles.timelineTrack}>
            <div
              className={styles.bufferedBar}
              style={{ width: `${bufferedPercent}%` }}
            />
            <div
              className={styles.playedBar}
              style={{ width: `${playedPercent}%` }}
            />
            <div
              className={styles.scrubberThumb}
              style={{ left: `${playedPercent}%` }}
            />
          </div>
        </div>

        {/* Buttons Row */}
        <div className={styles.buttonsRow}>
          <div className={styles.leftControls}>
            {/* Play/Pause */}
            <button className={styles.btn} onClick={togglePlay} title={isPlaying ? 'Tạm dừng (Space)' : 'Phát (Space)'}>
              {isPlaying ? <IconPause size={18} /> : <IconPlay size={18} />}
            </button>

            {/* Prev Episode */}
            {onPrev && (
              <button
                className={styles.btn}
                onClick={onPrev}
                disabled={!hasPrev}
                title="Tập trước"
              >
                <IconSkipBack size={16} />
              </button>
            )}

            {/* Rewind 10s */}
            <button className={styles.btn} onClick={() => skipTime(-10)} title="Tua lùi 10 giây (←)">
              <IconRotateCcw size={16} />
            </button>

            {/* Forward 10s */}
            <button className={styles.btn} onClick={() => skipTime(10)} title="Tua tới 10 giây (→)">
              <IconRotateCw size={16} />
            </button>

            {/* Next Episode */}
            {onNext && (
              <button
                className={styles.btn}
                onClick={onNext}
                disabled={!hasNext}
                title="Tập kế tiếp"
              >
                <IconSkipForward size={16} />
              </button>
            )}

            {/* Volume */}
            <div className={styles.volumeWrapper}>
              <button className={styles.btn} onClick={toggleMute} title="Âm lượng (M)">
                {isMuted || volume === 0 ? <IconVolumeMute size={18} /> : <IconVolume size={18} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className={styles.volumeSlider}
              />
            </div>

            {/* Time Display */}
            <span className={styles.timeDisplay}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className={styles.rightControls}>
            {/* Auto-next toggle */}
            {onToggleAutoNext && (
              <label className={styles.autoNextToggle} title="Tự động chuyển sang tập kế tiếp khi xem xong">
                <input
                  type="checkbox"
                  checked={autoNext}
                  onChange={(e) => onToggleAutoNext(e.target.checked)}
                />
                <span>Tự chuyển tập</span>
              </label>
            )}

            {/* Subtitles dropdown */}
            {subtitles && subtitles.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <IconSubtitles size={14} style={{ color: '#94a3b8' }} />
                <select
                  value={activeSubtitle}
                  onChange={handleSubtitleChange}
                  className={styles.selectMenu}
                  title="Chọn phụ đề"
                >
                  <option value="off">Tắt phụ đề</option>
                  {subtitles.map((s) => (
                    <option key={s.id || s.languageCode} value={s.languageCode || 'vi'}>
                      {s.label || 'Tiếng Việt'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Playback speed */}
            <select
              value={playbackRate}
              onChange={handleSpeedChange}
              className={styles.selectMenu}
              title="Tốc độ phát"
            >
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1">1.0x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x</option>
            </select>

            {/* Fullscreen */}
            <button className={styles.btn} onClick={toggleFullscreen} title="Toàn màn hình (F)">
              {isFullscreen ? <IconMinimize size={18} /> : <IconMaximize size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
