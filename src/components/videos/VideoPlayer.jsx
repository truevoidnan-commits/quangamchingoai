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
  IconSettings,
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
  const flashTimeoutRef = useRef(null);
  const isScrubbingRef = useRef(false);
  const isHoveringControlsRef = useRef(false);
  const showControlsRef = useRef(true);
  const wereControlsHiddenOnTouchStartRef = useRef(false);
  const isPlayingRef = useRef(false);
  const isMobileOptionsOpenRef = useRef(false);
  const errorMsgRef = useRef(null);

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

  // Keep refs synchronized
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    isMobileOptionsOpenRef.current = isMobileOptionsOpen;
  }, [isMobileOptionsOpen]);

  useEffect(() => {
    errorMsgRef.current = errorMsg;
  }, [errorMsg]);

  useEffect(() => {
    showControlsRef.current = showControls;
  }, [showControls]);

  // Helper: check if device supports true fine-pointer hover (Desktop mouse)
  // Touchscreens / phones (iPhone, Cốc Cốc iOS, Android) return false
  const isTrueHoverDevice = useCallback(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }, []);

  // 1. Initial Seek / Resume Prompt
  useEffect(() => {
    if (initialPosition && initialPosition > 10) {
      setResumePromptTime(initialPosition);
    }
  }, [episodeId, initialPosition]);

  // 2. Hide controls automatically after 3.0s of inactivity while playing
  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    showControlsRef.current = true;
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }

    const isActuallyPlaying =
      isPlayingRef.current ||
      Boolean(videoRef.current && !videoRef.current.paused && !videoRef.current.ended);

    const isHovering = isHoveringControlsRef.current && isTrueHoverDevice();

    // Never auto-hide if:
    // - Video is paused or ended (!isActuallyPlaying)
    // - User is scrubbing timeline (isScrubbingRef.current)
    // - Mobile options sheet is open (isMobileOptionsOpenRef.current)
    // - User is hovering controls bar with real mouse on desktop (isHovering)
    // - Video has error (errorMsgRef.current)
    // Notice: Button focus NEVER blocks auto-hide!
    if (
      isActuallyPlaying &&
      !isScrubbingRef.current &&
      !isMobileOptionsOpenRef.current &&
      !isHovering &&
      !errorMsgRef.current
    ) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
        showControlsRef.current = false;

        // Cleanly blur active element if it's inside player controls (prevents sticky focus rings)
        if (
          typeof document !== 'undefined' &&
          containerRef.current &&
          containerRef.current.contains(document.activeElement) &&
          document.activeElement !== containerRef.current
        ) {
          try {
            document.activeElement.blur();
          } catch {}
        }
      }, 3000);
    }
  }, [isTrueHoverDevice]);

  // React to isPlaying changes for auto-hide controls
  useEffect(() => {
    if (isPlaying) {
      resetControlsTimer();
    } else {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
      setShowControls(true);
      showControlsRef.current = true;
    }
  }, [isPlaying, resetControlsTimer]);

  // Keep controls visible while scrubbing
  useEffect(() => {
    if (isScrubbing) {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
      setShowControls(true);
      showControlsRef.current = true;
    } else if (isPlaying) {
      resetControlsTimer();
    }
  }, [isScrubbing, isPlaying, resetControlsTimer]);

  // Keep controls visible while mobile options menu is open
  useEffect(() => {
    if (isMobileOptionsOpen) {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
      setShowControls(true);
      showControlsRef.current = true;
    } else if (isPlaying) {
      resetControlsTimer();
    }
  }, [isMobileOptionsOpen, isPlaying, resetControlsTimer]);

  // Cleanup timers on unmount or episode/source change
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = null;
      }
    };
  }, [episodeId, src]);

  const handleUserActivity = () => {
    resetControlsTimer();
  };

  // 3. Play / Pause Toggle
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);

    if (video.paused || video.ended) {
      video.play().then(() => {
        setIsPlaying(true);
        setCenterFlash('play');
        resetControlsTimer();
      }).catch((err) => {
        console.warn('[VideoPlayer] Play interrupted:', err);
      });
    } else {
      video.pause();
      setIsPlaying(false);
      setCenterFlash('pause');
      setShowControls(true);
      recordWatchProgress(seriesId, episodeId, video.currentTime, video.duration, {
        immediate: true,
        extraMeta: { seriesTitle, episodeTitle, episodeNumber, posterKey },
      });
    }

    flashTimeoutRef.current = setTimeout(() => {
      setCenterFlash(null);
    }, 650);
  };

  // Tap on video surface:
  // - If controls are hidden while playing: gentle tap reveals controls WITHOUT toggling play/pause.
  // - If controls are already visible or video paused: tap toggles play/pause.
  const handleSurfaceTap = (e) => {
    if (isScrubbingRef.current) return;

    const isVideoPlaying =
      isPlayingRef.current ||
      Boolean(videoRef.current && !videoRef.current.paused && !videoRef.current.ended);

    if (wereControlsHiddenOnTouchStartRef.current || (isVideoPlaying && !showControlsRef.current)) {
      wereControlsHiddenOnTouchStartRef.current = false;
      setShowControls(true);
      showControlsRef.current = true;
      resetControlsTimer();
      return;
    }

    wereControlsHiddenOnTouchStartRef.current = false;
    togglePlay();
  };

  // 4. Smooth Pointer-Events Timeline Scrubber
  const calculateTimeFromPointer = (e) => {
    const timeline = timelineRef.current;
    if (!timeline || !duration) return { time: 0, x: 0 };
    const rect = timeline.getBoundingClientRect();
    const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0]?.clientX) || 0;
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const percent = rect.width > 0 ? x / rect.width : 0;
    return { time: percent * duration, x };
  };

  const handlePointerDown = (e) => {
    if (!duration || duration <= 0) return;
    if (e.button !== undefined && e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
    setShowControls(true);
    showControlsRef.current = true;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    isScrubbingRef.current = true;
    setIsScrubbing(true);
    const { time, x } = calculateTimeFromPointer(e);
    setScrubTime(time);
    setScrubTooltip({ visible: true, x, time });
  };

  const handlePointerMove = (e) => {
    if (isScrubbingRef.current && duration > 0) {
      e.preventDefault();
      e.stopPropagation();
      const { time, x } = calculateTimeFromPointer(e);
      setScrubTime(time);
      setScrubTooltip({ visible: true, x, time });
    } else if (duration > 0 && timelineRef.current) {
      const { time, x } = calculateTimeFromPointer(e);
      setScrubTooltip({ visible: true, x, time });
    }
  };

  const handlePointerUp = (e) => {
    if (isScrubbingRef.current) {
      e.preventDefault();
      e.stopPropagation();
      isScrubbingRef.current = false;
      setIsScrubbing(false);
      setScrubTooltip({ visible: false, x: 0, time: 0 });

      const { time } = calculateTimeFromPointer(e);
      if (videoRef.current) {
        videoRef.current.currentTime = time;
        setCurrentTime(time);
      }

      recordWatchProgress(seriesId, episodeId, time, duration, {
        immediate: true,
        extraMeta: { seriesTitle, episodeTitle, episodeNumber, posterKey },
      });

      if (isPlaying) {
        resetControlsTimer();
      }

      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handlePointerCancel = (e) => {
    if (isScrubbingRef.current) {
      isScrubbingRef.current = false;
      setIsScrubbing(false);
      setScrubTooltip({ visible: false, x: 0, time: 0 });
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handlePointerLeave = () => {
    if (!isScrubbingRef.current) {
      setScrubTooltip({ visible: false, x: 0, time: 0 });
    }
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

  // Screen orientation helpers (landscape lock on mobile fullscreen)
  const tryLockLandscape = () => {
    try {
      if (window.screen?.orientation?.lock) {
        window.screen.orientation.lock('landscape').catch(() => {});
      }
    } catch {}
  };

  const tryUnlockOrientation = () => {
    try {
      if (window.screen?.orientation?.unlock) {
        window.screen.orientation.unlock();
      }
    } catch {}
  };

  // 8. Fullscreen (Universal support: Desktop, Android Chrome, iPhone Safari, iPhone Cốc Cốc)
  const toggleFullscreen = () => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container && !video) return;

    // Check if currently in fullscreen (Standard API, WebKit container, or iOS native video)
    const isDocFs = Boolean(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
    const isVideoFs = Boolean(
      video && (video.webkitDisplayingFullscreen || video.webkitDisplayingFullscreen === true)
    );
    const currentlyInFs = isDocFs || isVideoFs || isFullscreen;

    if (currentlyInFs) {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        try { document.webkitExitFullscreen(); } catch {}
      } else if (document.mozCancelFullScreen) {
        try { document.mozCancelFullScreen(); } catch {}
      } else if (document.msExitFullscreen) {
        try { document.msExitFullscreen(); } catch {}
      }

      if (video && typeof video.webkitExitFullscreen === 'function') {
        try { video.webkitExitFullscreen(); } catch {}
      }

      tryUnlockOrientation();
      setIsFullscreen(false);
      return;
    }

    // ENTER Fullscreen:
    // Helper to enter native video fullscreen (essential for iPhone Safari, iPhone Cốc Cốc, iOS WebKit)
    const tryVideoNativeFullscreen = () => {
      if (!video) return;
      if (typeof video.webkitEnterFullscreen === 'function') {
        try {
          video.webkitEnterFullscreen();
          tryLockLandscape();
          setIsFullscreen(true);
        } catch (err) {
          console.warn('[VideoPlayer] webkitEnterFullscreen error:', err);
        }
      } else if (typeof video.requestFullscreen === 'function') {
        video.requestFullscreen().then(() => {
          tryLockLandscape();
          setIsFullscreen(true);
        }).catch((err) => {
          console.warn('[VideoPlayer] video.requestFullscreen error:', err);
        });
      } else if (typeof video.webkitRequestFullscreen === 'function') {
        try {
          video.webkitRequestFullscreen();
          tryLockLandscape();
          setIsFullscreen(true);
        } catch (err) {
          console.warn('[VideoPlayer] video.webkitRequestFullscreen error:', err);
        }
      }
    };

    // Special handling for iPhone / iPod WebKit (Safari, Cốc Cốc iOS, Chrome iOS):
    // WebKit on iPhone does not support container requestFullscreen; calling it throws or returns undefined.
    // Calling video.webkitEnterFullscreen() MUST be synchronous inside the user gesture.
    const isIPhone = typeof navigator !== 'undefined' && /iPhone|iPod/.test(navigator.userAgent);
    if (isIPhone && video && typeof video.webkitEnterFullscreen === 'function') {
      tryVideoNativeFullscreen();
      return;
    }

    // 1. If standard container.requestFullscreen is supported (Android Chrome, Desktop):
    if (container && typeof container.requestFullscreen === 'function') {
      const fsPromise = container.requestFullscreen();
      if (fsPromise && typeof fsPromise.then === 'function') {
        fsPromise
          .then(() => {
            tryLockLandscape();
            setIsFullscreen(true);
          })
          .catch((err) => {
            console.warn('[VideoPlayer] container.requestFullscreen rejected, falling back to video native:', err);
            tryVideoNativeFullscreen();
          });
      } else {
        tryLockLandscape();
        setIsFullscreen(true);
      }
    } else if (container && typeof container.webkitRequestFullscreen === 'function') {
      try {
        container.webkitRequestFullscreen();
        tryLockLandscape();
        setIsFullscreen(true);
      } catch (err) {
        console.warn('[VideoPlayer] container.webkitRequestFullscreen error, falling back:', err);
        tryVideoNativeFullscreen();
      }
    } else {
      // 2. Container fullscreen not supported (e.g. Cốc Cốc on iPhone, Safari iOS):
      // Call video.webkitEnterFullscreen() directly within user gesture!
      tryVideoNativeFullscreen();
    }
  };

  useEffect(() => {
    const syncFullscreenState = () => {
      const isDocFs = Boolean(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      const isVideoFs = Boolean(
        videoRef.current && videoRef.current.webkitDisplayingFullscreen
      );
      setIsFullscreen(isDocFs || isVideoFs);
    };

    const handleWebkitBegin = () => {
      setIsFullscreen(true);
    };

    const handleWebkitEnd = () => {
      setIsFullscreen(false);
      tryUnlockOrientation();
      setShowControls(true);
      resetControlsTimer();
    };

    document.addEventListener('fullscreenchange', syncFullscreenState);
    document.addEventListener('webkitfullscreenchange', syncFullscreenState);
    document.addEventListener('mozfullscreenchange', syncFullscreenState);
    document.addEventListener('MSFullscreenChange', syncFullscreenState);

    const video = videoRef.current;
    if (video) {
      video.addEventListener('webkitbeginfullscreen', handleWebkitBegin);
      video.addEventListener('webkitendfullscreen', handleWebkitEnd);
    }

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      document.removeEventListener('webkitfullscreenchange', syncFullscreenState);
      document.removeEventListener('mozfullscreenchange', syncFullscreenState);
      document.removeEventListener('MSFullscreenChange', syncFullscreenState);
      if (video) {
        video.removeEventListener('webkitbeginfullscreen', handleWebkitBegin);
        video.removeEventListener('webkitendfullscreen', handleWebkitEnd);
      }
    };
  }, [resetControlsTimer]);

  // 9. Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
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
    if (!video || isScrubbingRef.current) return;

    setCurrentTime(video.currentTime);

    if (video.buffered && video.buffered.length > 0) {
      setBufferedEnd(video.buffered.end(video.buffered.length - 1));
    }

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
  const displayCurrentTime = isScrubbing ? scrubTime : currentTime;
  const playedPercent = duration > 0 ? (displayCurrentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? Math.min(100, (bufferedEnd / duration) * 100) : 0;

  return (
    <div
      ref={containerRef}
      className={`${styles.playerContainer} ${isPlaying && !showControls ? styles.cursorHidden : ''} ${isFullscreen ? styles.playerFullscreen : ''}`}
      onMouseMove={() => {
        if (!isTrueHoverDevice()) return;
        resetControlsTimer();
      }}
      onTouchStart={() => {
        isHoveringControlsRef.current = false;
        resetControlsTimer();
      }}
      tabIndex={0}
    >
      {/* Video Surface Tap Layer */}
      <div
        className={styles.videoSurface}
        onTouchStart={() => {
          isHoveringControlsRef.current = false;
          const isVideoPlaying =
            isPlayingRef.current ||
            Boolean(videoRef.current && !videoRef.current.paused && !videoRef.current.ended);
          if (isVideoPlaying && !showControlsRef.current) {
            wereControlsHiddenOnTouchStartRef.current = true;
          } else {
            wereControlsHiddenOnTouchStartRef.current = false;
          }
        }}
        onPointerDown={() => {
          const isVideoPlaying =
            isPlayingRef.current ||
            Boolean(videoRef.current && !videoRef.current.paused && !videoRef.current.ended);
          if (isVideoPlaying && !showControlsRef.current) {
            wereControlsHiddenOnTouchStartRef.current = true;
          }
        }}
        onClick={handleSurfaceTap}
      >
        <video
          ref={videoRef}
          src={src}
          className={styles.videoElement}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMetadata}
          onPlay={() => {
            setIsPlaying(true);
            isPlayingRef.current = true;
            resetControlsTimer();
          }}
          onPause={() => {
            setIsPlaying(false);
            isPlayingRef.current = false;
            if (controlsTimeoutRef.current) {
              clearTimeout(controlsTimeoutRef.current);
              controlsTimeoutRef.current = null;
            }
            setShowControls(true);
            showControlsRef.current = true;
          }}
          onWaiting={() => setIsLoading(true)}
          onPlaying={() => {
            setIsLoading(false);
            if (showControlsRef.current) {
              resetControlsTimer();
            }
          }}
          onEnded={onEnded}
          onError={onError}
          playsInline
          webkit-playsinline="true"
          x5-playsinline="true"
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
      </div>

      {/* Loading Spinner */}
      {isLoading && !errorMsg && (
        <div className={styles.centerOverlay} style={{ pointerEvents: 'none' }}>
          <div className={styles.spinner} />
        </div>
      )}

      {/* Animated Center Flash Feedback (Play / Pause tap) */}
      {centerFlash && (
        <div className={styles.centerFlashWrap}>
          <div className={styles.centerFlashIcon}>
            {centerFlash === 'play' ? <IconPlay size={36} /> : <IconPause size={36} />}
          </div>
        </div>
      )}

      {/* Big Center Play Button when paused & controls visible */}
      {!isPlaying && !isLoading && !errorMsg && (
        <div
          className={styles.centerOverlay}
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
        >
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
      <div
        className={`${styles.controlsBar} ${
          !showControls && isPlaying && !isScrubbing && !isMobileOptionsOpen
            ? styles.controlsHidden
            : ''
        }`}
        onClick={(e) => {
          e.stopPropagation();
          resetControlsTimer();
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          isHoveringControlsRef.current = false;
          resetControlsTimer();
        }}
        onMouseEnter={() => {
          if (!isTrueHoverDevice()) return;
          isHoveringControlsRef.current = true;
          if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
            controlsTimeoutRef.current = null;
          }
          setShowControls(true);
        }}
        onMouseLeave={() => {
          if (!isTrueHoverDevice()) return;
          isHoveringControlsRef.current = false;
          resetControlsTimer();
        }}
      >
        {/* ROW 1: Timeline Scrubber with Smooth Pointer Dragging */}
        <div
          ref={timelineRef}
          className={`${styles.timelineWrapper} ${isScrubbing ? styles.timelineScrubbing : ''}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerLeave}
        >
          {/* Tooltip on scrub or hover */}
          {scrubTooltip.visible && (
            <div
              className={styles.timelineTooltip}
              style={{ left: `${scrubTooltip.x}px` }}
            >
              {formatTime(scrubTooltip.time)}
            </div>
          )}
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

        {/* ROW 2: Control Buttons Row */}
        <div className={styles.buttonsRow}>
          <div className={styles.leftControls}>
            {/* Play/Pause */}
            <button
              className={`${styles.btn} ${styles.btnMainAction}`}
              onClick={togglePlay}
              title={isPlaying ? 'Tạm dừng (Space)' : 'Phát (Space)'}
              aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
            >
              {isPlaying ? <IconPause size={18} /> : <IconPlay size={18} />}
            </button>

            {/* Prev Episode */}
            {onPrev && (
              <button
                className={`${styles.btn} ${styles.desktopOnlyBtn}`}
                onClick={onPrev}
                disabled={!hasPrev}
                title="Tập trước"
                aria-label="Tập trước"
              >
                <IconSkipBack size={16} />
              </button>
            )}

            {/* Rewind 10s */}
            <button
              className={styles.btn}
              onClick={() => skipTime(-10)}
              title="Tua lùi 10 giây (←)"
              aria-label="Tua lùi 10 giây"
            >
              <IconRotateCcw size={16} />
            </button>

            {/* Forward 10s */}
            <button
              className={styles.btn}
              onClick={() => skipTime(10)}
              title="Tua tới 10 giây (→)"
              aria-label="Tua tới 10 giây"
            >
              <IconRotateCw size={16} />
            </button>

            {/* Next Episode */}
            {onNext && (
              <button
                className={`${styles.btn} ${styles.desktopOnlyBtn}`}
                onClick={onNext}
                disabled={!hasNext}
                title="Tập kế tiếp"
                aria-label="Tập kế tiếp"
              >
                <IconSkipForward size={16} />
              </button>
            )}

            {/* Volume */}
            <div className={styles.volumeWrapper}>
              <button className={styles.btn} onClick={toggleMute} title="Âm lượng (M)" aria-label="Âm lượng">
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
                aria-label="Thanh điều chỉnh âm lượng"
              />
            </div>

            {/* Time Display */}
            <span className={styles.timeDisplay}>
              {formatTime(displayCurrentTime)} / {formatTime(duration)}
            </span>
          </div>

          <div className={styles.rightControls}>
            {/* Desktop: Auto-next toggle */}
            {onToggleAutoNext && (
              <label className={`${styles.autoNextToggle} ${styles.desktopOnly}`} title="Tự động chuyển sang tập kế tiếp khi xem xong">
                <input
                  type="checkbox"
                  checked={autoNext}
                  onChange={(e) => onToggleAutoNext(e.target.checked)}
                />
                <span>Tự chuyển tập</span>
              </label>
            )}

            {/* Desktop: Subtitles dropdown */}
            {subtitles && subtitles.length > 0 && (
              <div className={`${styles.subtitlesWrap} ${styles.desktopOnly}`}>
                <IconSubtitles size={14} style={{ color: '#94a3b8' }} />
                <select
                  value={activeSubtitle}
                  onChange={handleSubtitleChange}
                  className={styles.selectMenu}
                  title="Chọn phụ đề"
                  aria-label="Chọn phụ đề"
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

            {/* Desktop: Playback speed dropdown */}
            <select
              value={playbackRate}
              onChange={handleSpeedChange}
              className={`${styles.selectMenu} ${styles.desktopOnly}`}
              title="Tốc độ phát"
              aria-label="Tốc độ phát"
            >
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1">1.0x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x</option>
            </select>

            {/* Mobile: Options Sheet Toggle Button */}
            <button
              className={`${styles.btn} ${styles.mobileOptionsToggleBtn}`}
              onClick={() => setIsMobileOptionsOpen((prev) => !prev)}
              title="Tùy chọn cài đặt"
              aria-label="Tùy chọn cài đặt"
            >
              <IconSettings size={18} />
            </button>

            {/* Fullscreen */}
            <button
              className={styles.btn}
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Thu nhỏ (F)' : 'Toàn màn hình (F)'}
              aria-label={isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
            >
              {isFullscreen ? <IconMinimize size={18} /> : <IconMaximize size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile Options Menu Sheet Overlay */}
        {isMobileOptionsOpen && (
          <div className={styles.mobileOptionsSheet}>
            <div className={styles.mobileOptionsHeader}>
              <span>Cài Đặt Trình Phát</span>
              <button
                className={styles.mobileOptionsClose}
                onClick={() => setIsMobileOptionsOpen(false)}
                aria-label="Đóng cài đặt"
              >
                <IconX size={16} />
              </button>
            </div>

            {/* Speed Pills */}
            <div className={styles.mobileOptionRow}>
              <span className={styles.mobileOptionLabel}>Tốc độ:</span>
              <div className={styles.speedPills}>
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                  <button
                    key={s}
                    className={`${styles.speedPill} ${playbackRate === s ? styles.speedPillActive : ''}`}
                    onClick={() => {
                      setPlaybackRate(s);
                      if (videoRef.current) videoRef.current.playbackRate = s;
                    }}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            {/* Subtitles Option */}
            {subtitles && subtitles.length > 0 && (
              <div className={styles.mobileOptionRow}>
                <span className={styles.mobileOptionLabel}>Phụ đề:</span>
                <select
                  value={activeSubtitle}
                  onChange={handleSubtitleChange}
                  className={styles.mobileSelectMenu}
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

            {/* Auto Next Option */}
            {onToggleAutoNext && (
              <div className={styles.mobileOptionRow}>
                <span className={styles.mobileOptionLabel}>Tự chuyển tập:</span>
                <label className={styles.mobileToggle}>
                  <input
                    type="checkbox"
                    checked={autoNext}
                    onChange={(e) => onToggleAutoNext(e.target.checked)}
                  />
                  <span>Tự động phát tập tiếp theo</span>
                </label>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
