import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { getNovel, getChapters, getChapter } from '../lib/db';
import { getReadingProgress, saveReadingProgress } from '../lib/storage';
import { pullNovelProgressNow } from '../lib/sync/syncEngine.js';
import { notifyReadingProgressChanged, flushReadingProgress } from '../lib/sync/autoSync.js';
import { useReadingSettings } from '../hooks/useReadingSettings';
import { READING_THEMES, FONT_OPTIONS } from '../hooks/useReadingSettings';
import { useCultivation } from '../hooks/useCultivation';
import { getCultivationKey } from '../lib/cultivation';
import CultivationModal from '../components/cultivation/CultivationModal';
import BreakthroughModal from '../components/cultivation/BreakthroughModal';
import TableOfContents from '../components/reader/TableOfContents';
import ReadingSettings from '../components/reader/ReadingSettings';
import ScrollToTop from '../components/ui/ScrollToTop';
import { startBackgroundPrefetch } from '../lib/backgroundPrefetch';
import { findDaoAnhDefinition } from '../lib/daoAnhData';
import { DaoAnh80Modal, DaoAnhFullModal } from '../components/cultivation/DaoAnhPromptModal';
import SelectionToolbar from '../components/reader/SelectionToolbar';
import ChapterTextEditModal from '../components/reader/ChapterTextEditModal';
import GlobalReplaceModal from '../components/reader/GlobalReplaceModal';
import {
  expandSelectionToWordBoundaries,
  getPreciseSelectionSetting,
  setPreciseSelectionSetting,
  escapeRegExp,
} from '../lib/selectionUtils';
import selectionStyles from '../components/reader/SelectionEditor.module.css';
import styles from './ReaderPage.module.css';

export default function ReaderPage() {
  const { id, novelId, chapterId } = useParams();
  const activeNovelId = novelId || id;
  const [searchParams, setSearchParams] = useSearchParams();
  const searchKeyword = searchParams.get('q') || '';
  const navigate = useNavigate();
  const { settings, updateSettings } = useReadingSettings();
  const { 
    gainReadingExp, 
    displayName, 
    LAMP_TIERS, 
    unreadDropsCount, 
    clearUnreadDrops,
    cultivation,
    chooseSwitchDaoAnhAfter80,
    chooseContinueDaoAnhTo100,
    dismissPromptAllDaoAnhFull
  } = useCultivation();

  const [novel, setNovel] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [chapter, setChapter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cultivationOpen, setCultivationOpen] = useState(false);
  const [barVisible, setBarVisible] = useState(true);
  const [breakthroughToast, setBreakthroughToast] = useState(null);
  const [droppedLamp, setDroppedLamp] = useState(null);
  const scrollRef = useRef(null);
  const lastScrollY = useRef(0);

  // In-reader text selection & editing states
  const [selectionData, setSelectionData] = useState(null);
  const [activeEditTarget, setActiveEditTarget] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [initialEditScope, setInitialEditScope] = useState('single');
  const [globalReplaceOpen, setGlobalReplaceOpen] = useState(false);
  const [editorToast, setEditorToast] = useState(null);
  const [preciseSelection, setPreciseSelection] = useState(() => getPreciseSelectionSetting());

  useEffect(() => {
    const handlePreciseChange = (e) => {
      if (e?.detail && typeof e.detail.enabled === 'boolean') {
        setPreciseSelection(e.detail.enabled);
      } else {
        setPreciseSelection(getPreciseSelectionSetting());
      }
    };
    window.addEventListener('tcl_precise_selection_changed', handlePreciseChange);
    return () => {
      window.removeEventListener('tcl_precise_selection_changed', handlePreciseChange);
    };
  }, []);
  const historyStackRef = useRef([]);
  const [pullProgressDone, setPullProgressDone] = useState(false);
  const [syncToast, setSyncToast] = useState(null);
  const lastUserInteractionTimeRef = useRef(0);
  const prevJumpPosRef = useRef(null);

  // Pull latest progress on mount before restoring position
  useEffect(() => {
    let active = true;
    pullNovelProgressNow(activeNovelId).finally(() => {
      if (active) setPullProgressDone(true);
    });
    return () => { active = false; };
  }, [activeNovelId]);

  // Track user interaction (scroll, touch, keydown)
  useEffect(() => {
    const markInteraction = () => {
      lastUserInteractionTimeRef.current = Date.now();
    };
    window.addEventListener('scroll', markInteraction, { passive: true });
    window.addEventListener('touchstart', markInteraction, { passive: true });
    window.addEventListener('keydown', markInteraction, { passive: true });
    return () => {
      window.removeEventListener('scroll', markInteraction);
      window.removeEventListener('touchstart', markInteraction);
      window.removeEventListener('keydown', markInteraction);
    };
  }, []);

  // Tab switch to 'visible': check if cloud has newer progress for this novel
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        pullNovelProgressNow(activeNovelId).then((res) => {
          if (res?.updated && res?.data) {
            const cloudProg = res.data;
            const now = Date.now();
            const recentlyInteracted = now - lastUserInteractionTimeRef.current < 5000;
            const curPos = {
              chapterId: chapter?.id,
              percent: lastRecordedScrollRef.current?.percent || 0,
              paraIndex: lastRecordedScrollRef.current?.paraIndex || 0,
              scrollY: window.scrollY || 0,
            };

            if (!recentlyInteracted) {
              prevJumpPosRef.current = curPos;
              if (cloudProg.chapterId && cloudProg.chapterId !== chapter?.id) {
                navigate(`/novel/${activeNovelId}/read/${cloudProg.chapterId}`);
              } else if (typeof cloudProg.paraIndex === 'number' && cloudProg.paraIndex >= 0) {
                const el = document.getElementById(`para-${cloudProg.paraIndex}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
              setSyncToast({
                type: 'jumped',
                message: 'Đã nhảy tới vị trí mới nhất từ thiết bị khác',
                canRevert: true,
              });
            } else {
              setSyncToast({
                type: 'proposal',
                message: 'Có tiến độ mới từ thiết bị khác',
                targetProgress: cloudProg,
              });
            }
          }
        }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [activeNovelId, chapter?.id, navigate]);

  // Cultivation fast-forward toast listener from cloud (external devices)
  useEffect(() => {
    const handleCloudApplied = () => {
      setSyncToast({
        message: 'Tu vi đã cập nhật từ thiết bị khác',
        duration: 4000,
      });
    };
    window.addEventListener('cultivation_cloud_applied', handleCloudApplied);
    return () => window.removeEventListener('cultivation_cloud_applied', handleCloudApplied);
  }, []);

  // Auto-dismiss syncToast after duration (default 8s)
  useEffect(() => {
    if (syncToast) {
      const duration = syncToast.duration || 8000;
      const timer = setTimeout(() => setSyncToast(null), duration);
      return () => clearTimeout(timer);
    }
  }, [syncToast]);

  // Auto-dismiss editor toast after 6s
  useEffect(() => {
    if (editorToast) {
      const timer = setTimeout(() => setEditorToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [editorToast]);

  // Background-fetch all cultivation graphics into persistent cache while reading
  useEffect(() => {
    startBackgroundPrefetch();
  }, []);

  // Load novel + chapters list
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        let [n, chs] = await Promise.all([getNovel(activeNovelId), getChapters(activeNovelId)]);
        if (!n || !chs || chs.length === 0) {
          const { sampleNovel, sampleChapters } = await import('../lib/sampleData');
          const { saveNovel, saveChaptersBulk } = await import('../lib/db');
          await saveNovel(sampleNovel);
          await saveChaptersBulk(sampleChapters);
          n = sampleNovel;
          chs = sampleChapters;
        }
        if (isMounted) {
          setNovel(n);
          setChapters(chs || []);
        }
      } catch (e) {
        console.error('Reader load novel error:', e);
      }
    })();
    return () => { isMounted = false; };
  }, [activeNovelId]);

  // Load current chapter
  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      try {
        let ch = await getChapter(chapterId);
        if (!ch) {
          const { sampleChapters } = await import('../lib/sampleData');
          ch = sampleChapters.find(c => c.id === chapterId) || sampleChapters.find(c => c.novelId === activeNovelId) || sampleChapters[0];
        }
        if (isMounted) {
          setChapter(ch);
        }
      } catch (e) {
        console.error('Reader load chapter error:', e);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    })();
    return () => { isMounted = false; };
  }, [chapterId, activeNovelId]);

  const lastRecordedScrollRef = useRef({ scrollY: 0, percent: 0, paraIndex: 0 });
  const isRestoringRef = useRef(true);

  // Vô hiệu hoá tính năng tự động cuộn mặc định của trình duyệt để tránh nhảy lung tung khi back/forward
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  // Lưu vị trí đọc chính xác (đoạn văn, % và pixel scrollY)
  const saveCurrentPositionImmediate = useCallback(() => {
    if (!chapter) return;
    const currentScrollY = window.scrollY;
    // Nếu currentScrollY === 0 mà trước đó đã cuộn được (ví dụ unmount event), giữ vị trí trước đó
    const effectiveScrollY = currentScrollY > 0 ? currentScrollY : lastRecordedScrollRef.current.scrollY;

    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    let currentParaIndex = lastRecordedScrollRef.current.paraIndex || 0;
    const paraEls = document.querySelectorAll('[data-para-index]');
    if (paraEls.length > 0) {
      let found = false;
      // 1. Tìm đoạn văn đang nằm ngay dưới thanh top bar (độ cao bar ~50-60px)
      for (let i = 0; i < paraEls.length; i++) {
        const rect = paraEls[i].getBoundingClientRect();
        if (rect.bottom >= 60 && rect.top <= 140) {
          currentParaIndex = i;
          found = true;
          break;
        }
      }
      // 2. Dự phòng: tìm đoạn văn đầu tiên bắt đầu từ vị trí đọc trở xuống
      if (!found) {
        for (let i = 0; i < paraEls.length; i++) {
          const rect = paraEls[i].getBoundingClientRect();
          if (rect.top >= 60) {
            currentParaIndex = Math.max(0, i - 1);
            found = true;
            break;
          }
        }
      }
      // 3. Chỉ cho phép chỉ định đoạn cuối cùng nếu người dùng thực sự đã cuộn đến sát đáy trang
      if (!found && effectiveScrollY >= maxScroll - 60) {
        currentParaIndex = paraEls.length - 1;
      }
    }

    const percent = maxScroll > 0 ? Math.max(0, Math.min(1, effectiveScrollY / maxScroll)) : (lastRecordedScrollRef.current.percent || 0);
    const posData = {
      percent,
      scrollY: effectiveScrollY,
      paraIndex: currentParaIndex,
      time: Date.now()
    };

    lastRecordedScrollRef.current = posData;
    localStorage.setItem(`scroll_pos_${activeNovelId}_${chapter.id}`, JSON.stringify(posData));
    sessionStorage.setItem(`scroll_pos_${activeNovelId}_${chapter.id}`, JSON.stringify(posData));
    saveReadingProgress(activeNovelId, {
      chapterId: chapter.id,
      scrollTop: effectiveScrollY,
      percent,
      paraIndex: currentParaIndex
    });
    notifyReadingProgressChanged();
  }, [chapter, activeNovelId]);

  const handleGoToCultivationFromReader = useCallback(() => {
    if (dismissPromptAllDaoAnhFull) dismissPromptAllDaoAnhFull();
    saveCurrentPositionImmediate();
    flushReadingProgress();
    sessionStorage.setItem('from_reader', '1');
    sessionStorage.setItem('last_reading_url', window.location.hash ? window.location.hash.slice(1) : (window.location.pathname + window.location.search));
    navigate('/cultivation');
  }, [dismissPromptAllDaoAnhFull, saveCurrentPositionImmediate, navigate]);

  // Khôi phục vị trí đọc chính xác (đoạn văn đang đọc dở hoặc %) khi vào lại chương
  useEffect(() => {
    if (!chapter || loading) return;

    // Nếu vào từ thanh tìm kiếm có từ khoá thì cuộn đến từ khoá đầu tiên
    if (searchKeyword) {
      const searchTimer = setTimeout(() => {
        const mark = document.querySelector(`.${styles.readerMark}`);
        if (mark) {
          mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
      return () => clearTimeout(searchTimer);
    }

    isRestoringRef.current = true;

    const tryRestore = () => {
      const savedRaw = sessionStorage.getItem(`scroll_pos_${activeNovelId}_${chapter.id}`) ||
                       localStorage.getItem(`scroll_pos_${activeNovelId}_${chapter.id}`);
      if (!savedRaw) return;

      try {
        const { percent, scrollY, paraIndex, fromCloud } = JSON.parse(savedRaw);

        // 1. Ưu tiên cuộn đến đúng đoạn văn (paragraph) đang đọc dở (chuẩn xác theo getBoundingClientRect)
        if (typeof paraIndex === 'number' && paraIndex >= 0) {
          const targetPara = document.getElementById(`para-${paraIndex}`);
          if (targetPara) {
            const rect = targetPara.getBoundingClientRect();
            const targetY = Math.max(0, window.scrollY + rect.top - 70);
            window.scrollTo({ top: targetY, behavior: 'instant' });
            lastRecordedScrollRef.current = { percent: percent || 0, scrollY: targetY, paraIndex };
            return;
          }
        }

        // 2. Dự phòng theo % (ưu tiên hơn scrollY, KHÔNG dùng scrollY nếu từ Cloud do khác kích thước màn hình)
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        if (maxScroll > 60) {
          if (typeof percent === 'number' && percent > 0.005) {
            const targetY = Math.min(percent * maxScroll, maxScroll);
            window.scrollTo({ top: targetY, behavior: 'instant' });
            lastRecordedScrollRef.current = { percent, scrollY: targetY, paraIndex: paraIndex || 0 };
          } else if (!fromCloud && typeof scrollY === 'number' && scrollY > 20 && scrollY <= maxScroll) {
            window.scrollTo({ top: scrollY, behavior: 'instant' });
            lastRecordedScrollRef.current = { percent: percent || 0, scrollY, paraIndex: paraIndex || 0 };
          }
        }
      } catch (e) {
        console.warn('Lỗi khôi phục vị trí đọc:', e);
      }
    };

    // Đa nhịp khôi phục theo chu kỳ render DOM và font chữ (không ngắt sớm để bảo đảm font reflow vẫn giữ đúng đoạn văn)
    tryRestore();
    const timer1 = setTimeout(tryRestore, 60);
    const timer2 = setTimeout(tryRestore, 160);
    const timer3 = setTimeout(tryRestore, 320);
    const timer4 = setTimeout(tryRestore, 520);

    // Mở lại cờ cho phép lưu cuộn sau khi hoàn tất khôi phục
    const timerDone = setTimeout(() => {
      isRestoringRef.current = false;
    }, 700);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(timerDone);
    };
  }, [chapter?.id, loading, activeNovelId, searchKeyword, pullProgressDone]);

  // Chu kỳ ngộ đạo 60s lặp lại liên tục (cứ 60s tăng tu vi âm thầm & bắt đầu vòng mới)
  const [cycleSeconds, setCycleSeconds] = useState(() => { const saved = localStorage.getItem(getCultivationKey('pending_seconds')); return saved && !isNaN(parseInt(saved, 10)) ? parseInt(saved, 10) : 0; });

  // Lưu lại thời gian ngộ đạo vào localStorage để không bị mất khi thoát trang
  useEffect(() => {
    localStorage.setItem(getCultivationKey('pending_seconds'), cycleSeconds.toString());
  }, [cycleSeconds]);

  // Reset timer on chapter change & save reading progress (KHÔNG đè scrollTop = 0 lên vị trí đang đọc)
  useEffect(() => {
    // setCycleSeconds(0); // Không reset khi chuyển chương để cộng dồn
    if (chapter) {
      const existing = getReadingProgress(activeNovelId);
      if (existing?.chapterId !== chapter.id) {
        saveReadingProgress(activeNovelId, {
          chapterId: chapter.id,
          scrollTop: 0,
          percent: 0,
          paraIndex: 0
        });
        flushReadingProgress();
      }
    }
  }, [chapter?.id, activeNovelId]);

  // Bộ đếm ngộ đạo thực tế (mỗi giây tăng 1s, đủ 60s tự động cộng tu vi và rơi cơ duyên)
  useEffect(() => {
    if (!chapter || loading) return;

    const interval = setInterval(() => {
      setCycleSeconds(prev => {
        if (prev + 1 >= 60) {
          try {
            const res = gainReadingExp(activeNovelId, chapter.id, 2000);
            if (res) {
              if (res.breakthrough) {
                setBreakthroughToast(res.breakthrough);
                setTimeout(() => setBreakthroughToast(null), 5000);
              }
              const dropItem = res.droppedLamp || res.droppedArtifact;
              if (dropItem) {
                const isLegendary = dropItem.tier === 'tien_pham' || dropItem.tier === 'than_pham';
                if (isLegendary) {
                  setDroppedLamp(dropItem);
                  setTimeout(() => setDroppedLamp(null), 3000); // 3 giây thông báo màn hình đối với tiên phẩm/thần phẩm
                }
              }
            }
          } catch (err) {
            console.error('Lỗi cộng tu vi ngộ đạo:', err);
          }
          return 0;
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [chapter?.id, loading, activeNovelId, gainReadingExp]);

  // Lưu lại vị trí cuộn (% đọc & đoạn văn đang đọc) real-time khi người đọc lướt trang
  useEffect(() => {
    if (!chapter || loading) return;

    let throttleTimer = null;
    const handleScroll = () => {
      const currentY = window.scrollY;
      setBarVisible(currentY < lastScrollY.current || currentY < 80);
      lastScrollY.current = currentY;

      // Không ghi đè nếu trang đang trong giai đoạn khôi phục vị trí lúc đầu
      if (isRestoringRef.current) return;

      if (currentY > 0) {
        lastRecordedScrollRef.current.scrollY = currentY;
      }

      // Ẩn thanh công cụ bôi đen khi người dùng cuộn trang
      setSelectionData(prev => (prev ? null : prev));

      if (!throttleTimer) {
        throttleTimer = setTimeout(() => {
          saveCurrentPositionImmediate();
          throttleTimer = null;
        }, 180);
      }
    };

    const handleBeforeUnload = () => {
      saveCurrentPositionImmediate();
      flushReadingProgress();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (throttleTimer) clearTimeout(throttleTimer);
      flushReadingProgress();
    };
  }, [chapter?.id, loading, activeNovelId, saveCurrentPositionImmediate]);

  // Hoàn tác thay đổi vừa thực hiện
  const handleUndo = useCallback(async () => {
    if (!historyStackRef.current.length) return;
    const previous = historyStackRef.current.pop();
    if (!previous || !chapter) return;

    const restoredChapter = {
      ...chapter,
      title: previous.title,
      content: previous.content,
    };

    try {
      const { saveChapter } = await import('../lib/db');
      await saveChapter(restoredChapter);
      setChapter(restoredChapter);
      setEditorToast({
        message: '↩ Đã hoàn tác lại nội dung trước đó!',
        onUndo: null,
      });
    } catch (err) {
      console.error('Lỗi hoàn tác chương:', err);
    }
  }, [chapter]);

  // Bắt sự kiện người dùng bôi đen chữ trong nội dung chương
  const handleSelection = useCallback(() => {
    // Nếu đang mở hộp thoại chỉnh sửa thì không cập nhật vùng chọn để tránh xóa đè
    if (editModalOpen) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      return;
    }

    // Tự động mở rộng vùng bôi đen ra toàn bộ chữ (tránh đứt đoạn như "guy" thay vì "nguyệt")
    const isPrecise = getPreciseSelectionSetting();
    const range = expandSelectionToWordBoundaries(sel, isPrecise);
    if (!range) return;

    const rawText = sel.toString();
    if (!rawText || !rawText.trim()) {
      setSelectionData(null);
      return;
    }

    if (!scrollRef.current || !scrollRef.current.contains(range.commonAncestorContainer)) {
      setSelectionData(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setSelectionData(null);
      return;
    }

    // Tọa độ hiển thị thanh công cụ nổi ngay trên đoạn chữ (trên desktop)
    const toolbarWidth = 360;
    let x = rect.left + rect.width / 2;
    x = Math.max(16 + toolbarWidth / 2, Math.min(window.innerWidth - 16 - toolbarWidth / 2, x));

    let y = rect.top - 46;
    let placement = 'top';
    if (y < 65) {
      y = rect.bottom + 10;
      placement = 'bottom';
    }

    // Đếm số lần xuất hiện trong chương
    let matchCount = 0;
    if (chapter?.content) {
      const escaped = escapeRegExp(rawText);
      try {
        const matches = chapter.content.match(new RegExp(escaped, 'g'));
        matchCount = matches ? matches.length : 0;
      } catch (e) {}
    }

    // Xác định đoạn văn cụ thể hoặc tiêu đề
    const startPEl = range.startContainer.parentElement?.closest('[data-para-index]');
    const endPEl = range.endContainer.parentElement?.closest('[data-para-index]');
    const titleEl = range.startContainer.parentElement?.closest('h2');

    let isTitle = false;
    let startParaIndex = null;
    let endParaIndex = null;
    let startOffset = 0;
    let endOffset = 0;

    if (titleEl) {
      isTitle = true;
      startOffset = getTextOffsetInNode(titleEl, range.startContainer, range.startOffset);
      endOffset = getTextOffsetInNode(titleEl, range.endContainer, range.endOffset);
    } else if (startPEl && endPEl) {
      startParaIndex = parseInt(startPEl.getAttribute('data-para-index'), 10);
      endParaIndex = parseInt(endPEl.getAttribute('data-para-index'), 10);
      startOffset = getTextOffsetInNode(startPEl, range.startContainer, range.startOffset);
      endOffset = getTextOffsetInNode(endPEl, range.endContainer, range.endOffset);
    }

    setSelectionData({
      selectedText: rawText,
      position: { x, y, placement },
      matchCount,
      isTitle,
      startParaIndex,
      endParaIndex,
      startOffset,
      endOffset,
    });
  }, [chapter, editModalOpen]);

  // Lắng nghe thay đổi vùng chọn (selectionchange)
  useEffect(() => {
    let timeoutId = null;
    const onSelectionChange = () => {
      // Khi hộp thoại sửa đang mở thì hoàn toàn bỏ qua sự kiện chọn văn bản
      if (editModalOpen) return;

      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
          setSelectionData(null);
        } else {
          handleSelection();
        }
      }, 150);
    };

    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [handleSelection, editModalOpen]);

  // Mở hộp thoại sửa và cố định snapshot văn bản đang chọn
  const handleOpenEdit = useCallback((scope = 'single') => {
    if (!selectionData) return;
    setActiveEditTarget({ ...selectionData });
    setInitialEditScope(scope);
    setEditModalOpen(true);
    setSelectionData(null);
  }, [selectionData]);

  // Áp dụng thay đổi nội dung (sửa, xóa hẳn, thay thế toàn bộ)
  const applyTextChange = useCallback(async ({ newText, scope, directTarget }) => {
    const target = directTarget || activeEditTarget || selectionData;
    if (!chapter || !target) return;

    const { selectedText, isTitle, startParaIndex, endParaIndex, startOffset, endOffset } = target;

    // Lưu trạng thái trước khi sửa vào ngăn xếp hoàn tác
    historyStackRef.current.push({
      content: chapter.content,
      title: chapter.title,
    });

    let updatedContent = chapter.content;
    let updatedTitle = chapter.title;

    // Nếu phạm vi là TOÀN BỘ TRUYỆN
    if (scope === 'novel') {
      try {
        const { replaceTextInNovel } = await import('../lib/db');
        const res = await replaceTextInNovel(activeNovelId, selectedText, newText, {
          matchCase: true,
          inTitle: true,
        });

        // Cập nhật chương hiện tại nếu có thay đổi
        if (res.modifiedChapters && res.modifiedChapters.length > 0) {
          const cur = res.modifiedChapters.find(c => c.id === chapter.id);
          if (cur) {
            setChapter(cur);
          }
        }

        // Xóa vùng chọn trên trình duyệt
        if (window.getSelection) {
          window.getSelection().removeAllRanges();
        }
        setSelectionData(null);
        setEditModalOpen(false);
        setActiveEditTarget(null);

        const isDeleted = !newText || newText.trim() === '';
        const message = isDeleted
          ? `🗑️ Đã xóa ${res.totalReplacements} vị trí trong ${res.modifiedChaptersCount} chương toàn bộ truyện!`
          : `✨ Đã thay thế ${res.totalReplacements} vị trí trong ${res.modifiedChaptersCount} chương toàn bộ truyện!`;

        setEditorToast({ message });
      } catch (err) {
        console.error('Lỗi thay thế toàn bộ truyện:', err);
        alert('Không thể thực hiện thay thế toàn truyện: ' + (err.message || err));
      }
      return;
    }

    if (scope === 'all') {
      // Thay thế hoặc xóa toàn bộ lần xuất hiện trong chương
      updatedContent = updatedContent.replaceAll(selectedText, newText);
      if (updatedTitle.includes(selectedText)) {
        updatedTitle = updatedTitle.replaceAll(selectedText, newText);
      }
    } else {
      if (isTitle) {
        const before = updatedTitle.slice(0, startOffset);
        const after = updatedTitle.slice(endOffset);
        updatedTitle = before + newText + after;
      } else if (startParaIndex !== null && endParaIndex !== null) {
        const currentParagraphs = updatedContent.split('\n\n').filter(p => p.trim());

        if (startParaIndex === endParaIndex) {
          const targetP = currentParagraphs[startParaIndex] || '';
          let sOff = startOffset;
          let eOff = endOffset;

          // Kiểm tra khớp chuỗi và tìm vị trí tương ứng nếu có lệch nhẹ
          if (targetP.slice(sOff, eOff) !== selectedText) {
            const idx = targetP.indexOf(selectedText, Math.max(0, sOff - 15));
            if (idx !== -1 && Math.abs(idx - sOff) < 40) {
              sOff = idx;
              eOff = idx + selectedText.length;
            } else {
              const fallbackIdx = targetP.indexOf(selectedText);
              if (fallbackIdx !== -1) {
                sOff = fallbackIdx;
                eOff = fallbackIdx + selectedText.length;
              }
            }
          }

          const newP = targetP.slice(0, sOff) + newText + targetP.slice(eOff);
          const splittedP = newP.split('\n\n').filter(p => p.trim());

          if (splittedP.length === 0) {
            currentParagraphs.splice(startParaIndex, 1);
          } else {
            currentParagraphs.splice(startParaIndex, 1, ...splittedP);
          }
        } else {
          // Bôi đen trải dài nhiều đoạn văn
          const startP = currentParagraphs[startParaIndex] || '';
          const endP = currentParagraphs[endParaIndex] || '';
          const before = startP.slice(0, startOffset);
          const after = endP.slice(endOffset);
          const merged = (before + newText + after).split('\n\n').filter(p => p.trim());

          const deleteCount = endParaIndex - startParaIndex + 1;
          currentParagraphs.splice(startParaIndex, deleteCount, ...merged);
        }

        updatedContent = currentParagraphs.join('\n\n');
      }
    }

    const updatedChapter = {
      ...chapter,
      title: updatedTitle,
      content: updatedContent,
    };

    try {
      const { saveChapter } = await import('../lib/db');
      await saveChapter(updatedChapter);
      setChapter(updatedChapter);

      // Xóa vùng chọn trên trình duyệt
      if (window.getSelection) {
        window.getSelection().removeAllRanges();
      }
      setSelectionData(null);
      setEditModalOpen(false);
      setActiveEditTarget(null);

      const isDeleted = !newText || newText.trim() === '';
      const message = isDeleted
        ? (scope === 'all' ? '🗑️ Đã xóa toàn bộ các đoạn trùng khớp trong chương!' : '🗑️ Đã xóa đoạn chữ thành công!')
        : (scope === 'all' ? '✨ Đã thay thế toàn bộ các vị trí trong chương!' : '✨ Đã lưu thay đổi vào chương thành công!');

      setEditorToast({
        message,
        onUndo: handleUndo,
      });
    } catch (err) {
      console.error('Lỗi lưu chương:', err);
      alert('Không thể lưu nội dung chương: ' + (err.message || err));
    }
  }, [chapter, activeEditTarget, selectionData, handleUndo]);

  // Navigate to adjacent chapters
  const currentIndex = chapters.findIndex(c => c.id === chapterId);
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const nextChapter = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null;

  const goToChapter = useCallback((ch) => {
    if (ch) {
      saveCurrentPositionImmediate();
      flushReadingProgress();
      const queryStr = searchKeyword ? `?q=${encodeURIComponent(searchKeyword)}` : '';
      navigate(`/novel/${activeNovelId}/read/${ch.id}${queryStr}`);
    }
  }, [navigate, activeNovelId, searchKeyword, saveCurrentPositionImmediate]);

  const clearHighlight = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    setSearchParams(next);
  };

  const theme = READING_THEMES[settings.theme] || READING_THEMES.dark;
  const fontCss = FONT_OPTIONS.find(f => f.id === settings.fontFamily)?.css || "'Noto Serif', serif";

  // Split content into paragraphs
  const paragraphs = chapter?.content
    ? chapter.content.split('\n\n').filter(p => p.trim())
    : [];

  return (
    <div
      className={styles.page}
      style={{ backgroundColor: theme.bg, color: theme.text }}
      id="reader-page"
    >
      {/* ===== TOP BAR ===== */}
      <div className={`${styles.topBar} ${!barVisible ? styles.topBarHidden : ''}`}>
        <div className={styles.topBarInner}>
          <button
            className={styles.topBtn}
            onClick={() => {
              saveCurrentPositionImmediate();
              flushReadingProgress();
              navigate(`/novel/${activeNovelId}`);
            }}
            aria-label="Quay lại"
          >
            ←
          </button>
          <div className={styles.meditationBadgeWrap}>
            <span className={styles.meditationBadge} title="Mỗi chu kỳ 60s tĩnh tâm đọc sẽ hấp thu một luồng linh khí tu vi (lặp lại liên tục)">
              🧘 Ngộ đạo {cycleSeconds}/60s
            </span>
          </div>
          <div className={styles.topBarSpacer} />
          <div className={styles.topBtns}>
            <div className={styles.cultivationBtnWrap}>
              <button
                className={styles.topBtn}
                onClick={() => {
                  saveCurrentPositionImmediate();
                  flushReadingProgress();
                  sessionStorage.setItem('from_reader', '1');
                  sessionStorage.setItem('last_reading_url', window.location.hash ? window.location.hash.slice(1) : (window.location.pathname + window.location.search));
                  clearUnreadDrops();
                  navigate('/cultivation');
                }}
                title="Xem Bảng Tu Vi"
                aria-label="Tu Vi"
                style={{ color: '#ffcc00' }}
              >
                ⚡
              </button>
              {unreadDropsCount > 0 && (
                <span
                  className={`${styles.unreadRedDot} ${unreadDropsCount === 1 ? styles.unreadRedDotDotOnly : ''}`}
                  title={`${unreadDropsCount} cơ duyên chưa đọc`}
                >
                  {unreadDropsCount > 1 ? (unreadDropsCount > 99 ? '99+' : unreadDropsCount) : ''}
                </span>
              )}
            </div>
            <button
              className={styles.topBtn}
              onClick={() => setGlobalReplaceOpen(true)}
              title="Tìm & Thay thế toàn bộ truyện"
              aria-label="Tìm & Thay thế toàn bộ truyện"
            >
              🔁
            </button>
            <button
              className={styles.topBtn}
              onClick={() => navigate(`/novel/${activeNovelId}/add-chapter`)}
              title="Thêm chương"
              aria-label="Thêm chương"
            >
              +
            </button>
            <button
              className={styles.topBtn}
              onClick={() => setSettingsOpen(true)}
              title="Tuỳ chỉnh"
              aria-label="Cài đặt đọc"
            >
              ☰
            </button>
            <button
              className={styles.topBtn}
              onClick={() => setTocOpen(true)}
              title="Mục lục"
              aria-label="Mục lục"
            >
              📋
            </button>
          </div>
        </div>
      </div>

      {/* Floating search badge if navigating from search */}
      {searchKeyword && (
        <div className={styles.highlightBadgeBar}>
          <span>🔍 Khớp từ khoá: "<strong>{searchKeyword}</strong>"</span>
          <button className={styles.clearHighlightBtn} onClick={clearHighlight} title="Tắt highlight">
            ✕ Tắt
          </button>
        </div>
      )}

      {/* Full-Screen Breakthrough Celebration Overlay */}
      {breakthroughToast && (
        <BreakthroughModal data={breakthroughToast} onClose={() => setBreakthroughToast(null)} />
      )}

      {/* Lucky Life Lamp Drop Celebration Modal */}
      {droppedLamp && (
        <div className={styles.lampDropOverlay} onClick={() => setDroppedLamp(null)}>
          <div className={styles.lampDropModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.lampDropAura} />
            <span className={styles.lampDropBadge}>✦ THƯỢNG CỔ CƠ DUYÊN ✦</span>
            <span className={styles.lampDropIcon}>{droppedLamp.icon}</span>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, margin: '4px 0' }}>
              <h3 className={styles.lampDropTitle} style={{ color: droppedLamp.color || '#ffcc00', margin: 0 }}>
                {droppedLamp.name}
              </h3>
              {droppedLamp.tier && LAMP_TIERS[droppedLamp.tier] && (
                <span
                  className="badge"
                  style={{
                    backgroundColor: LAMP_TIERS[droppedLamp.tier].bg,
                    color: LAMP_TIERS[droppedLamp.tier].color,
                    borderColor: LAMP_TIERS[droppedLamp.tier].border,
                    fontSize: 10,
                    padding: '2px 8px',
                  }}
                >
                  {LAMP_TIERS[droppedLamp.tier].name}
                </span>
              )}
            </div>
            <p className={styles.lampDropPoem}>"{droppedLamp.poem}"</p>
            <p className={styles.lampDropDesc}>{droppedLamp.desc}</p>
            <div className={styles.lampDropActions}>
              <button
                className="btn-gold"
                onClick={() => {
                  saveCurrentPositionImmediate();
                  flushReadingProgress();
                  sessionStorage.setItem('from_reader', '1');
                  sessionStorage.setItem('last_reading_url', window.location.hash ? window.location.hash.slice(1) : (window.location.pathname + window.location.search));
                  setDroppedLamp(null);
                  navigate('/cultivation');
                }}
              >
                🏮 Xem Trong Bảng Tu Vi
              </button>
              <button className="btn-ghost" onClick={() => setDroppedLamp(null)}>
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== CONTENT ===== */}
      <main
        className={styles.content}
        ref={scrollRef}
        onMouseUp={handleSelection}
        onTouchEnd={handleSelection}
        style={{
          fontSize: `${settings.fontSize}px`,
          fontFamily: fontCss,
          lineHeight: settings.lineHeight,
        }}
      >
        {loading && (
          <div className={styles.loadingWrap}>
            <div className="spinner" style={{ borderTopColor: theme.accent }} />
          </div>
        )}

        {!loading && chapter && (
          <>
            <nav className={styles.chapterNavTop}>
              <button
                className={styles.navBtn}
                style={{ color: prevChapter ? theme.accent : `${theme.text}40`, borderColor: prevChapter ? `${theme.accent}50` : `${theme.text}20` }}
                onClick={() => goToChapter(prevChapter)}
                disabled={!prevChapter}
              >
                ← Chương trước
              </button>
              <button
                className={styles.tocBtn}
                onClick={() => setTocOpen(true)}
                style={{ color: theme.accent, borderColor: `${theme.accent}40` }}
              >
                📋
              </button>
              <button
                className={styles.navBtn}
                style={{ color: nextChapter ? theme.accent : `${theme.text}40`, borderColor: nextChapter ? `${theme.accent}50` : `${theme.text}20` }}
                onClick={() => goToChapter(nextChapter)}
                disabled={!nextChapter}
              >
                Chương sau →
              </button>
            </nav>

            <h2
              className={styles.chapterTitle}
              style={{ color: theme.accent, fontFamily: fontCss }}
            >
              {highlightText(chapter.title, searchKeyword, styles.readerMark)}
            </h2>

            {paragraphs.map((p, i) => (
              <p key={i} id={`para-${i}`} data-para-index={i} className={styles.paragraph}>
                {highlightText(p, searchKeyword, styles.readerMark)}
              </p>
            ))}
          </>
        )}

        {!loading && !chapter && (
          <div className={styles.notFound}>
            <p>Không tìm thấy nội dung chương này.</p>
            <button className="btn-ghost" onClick={() => navigate(`/novel/${activeNovelId}`)}>
              ← Quay lại
            </button>
          </div>
        )}
      </main>

      {/* ===== CHAPTER NAVIGATION ===== */}
      {!loading && (
        <nav className={styles.chapterNav} style={{ borderColor: `${theme.accent}30` }}>
          <button
            className={styles.navBtn}
            style={{ color: prevChapter ? theme.accent : `${theme.text}40`, borderColor: prevChapter ? `${theme.accent}50` : `${theme.text}20` }}
            onClick={() => goToChapter(prevChapter)}
            disabled={!prevChapter}
          >
            ← Chương trước
          </button>
          <button
            className={styles.tocBtn}
            onClick={() => setTocOpen(true)}
            style={{ color: theme.accent, borderColor: `${theme.accent}40` }}
          >
            📋
          </button>
          <button
            className={styles.navBtn}
            style={{ color: nextChapter ? theme.accent : `${theme.text}40`, borderColor: nextChapter ? `${theme.accent}50` : `${theme.text}20` }}
            onClick={() => goToChapter(nextChapter)}
            disabled={!nextChapter}
          >
            Chương sau →
          </button>
        </nav>
      )}

      {/* Footer credit */}
      <div className={styles.footerCredit} style={{ color: `${theme.text}40` }}>
        Thiết kế bởi <span style={{ color: `${theme.text}60` }}>Minh Đỗ</span>
      </div>

      {/* ToC bottom sheet */}
      <TableOfContents
        isOpen={tocOpen}
        onClose={() => setTocOpen(false)}
        chapters={chapters}
        currentChapterId={chapterId}
        onSelectChapter={(ch) => {
          saveCurrentPositionImmediate();
          flushReadingProgress();
          navigate(`/novel/${activeNovelId}/read/${ch.id}`);
        }}
      />

      {/* Reading settings */}
      <ReadingSettings
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdate={updateSettings}
      />

      {/* Cultivation Modal */}
      <CultivationModal
        isOpen={cultivationOpen}
        onClose={() => setCultivationOpen(false)}
      />

      {/* MODAL THÔNG BÁO TIÊN KIẾP: ĐẠO ANH ĐẠT 80% LINH LỰC */}
      {cultivation?.prompt80DaoAnh && !(cultivation?.daoAnhs || []).every(d => (d.currentKiep || 0) >= 5) && (() => {
        const promptTargetDa = (cultivation?.daoAnhs || []).find(d => d.id === cultivation.prompt80DaoAnh?.daoAnhId);
        const resolvedDaoAnhName = findDaoAnhDefinition(promptTargetDa, cultivation)?.name || promptTargetDa?.name || cultivation.prompt80DaoAnh.daoAnhName;
        return (
          <DaoAnh80Modal
            isOpen={true}
            promptData={cultivation.prompt80DaoAnh}
            daoAnh={promptTargetDa}
            resolvedDaoAnhName={resolvedDaoAnhName}
            onSwitch={() => chooseSwitchDaoAnhAfter80 && chooseSwitchDaoAnhAfter80(cultivation.prompt80DaoAnh.daoAnhId)}
            onContinue={() => chooseContinueDaoAnhTo100 && chooseContinueDaoAnhTo100(cultivation.prompt80DaoAnh.daoAnhId)}
          />
        );
      })()}

      {/* MODAL THÔNG BÁO TIÊN KIẾP: TOÀN BỘ ĐẠO ANH ĐÃ VIÊN MÃN 100% */}
      <DaoAnhFullModal
        isOpen={Boolean(cultivation?.promptAllDaoAnhFull && !cultivation?.promptAllDaoAnhFullDismissed && !(cultivation?.daoAnhs || []).every(d => (d.currentKiep || 0) >= 5))}
        daoAnhsCount={(cultivation?.daoAnhs || []).length || 13}
        onGoTribulation={handleGoToCultivationFromReader}
        onDismiss={() => dismissPromptAllDaoAnhFull && dismissPromptAllDaoAnhFull()}
      />

      {/* Floating selection toolbar for in-place edit/delete */}
      {selectionData && !editModalOpen && (
        <SelectionToolbar
          position={selectionData.position}
          selectedText={selectionData.selectedText}
          matchCount={selectionData.matchCount}
          preciseSelection={preciseSelection}
          onTogglePreciseSelection={(val) => {
            setPreciseSelection(val);
            setPreciseSelectionSetting(val);
          }}
          onOpenEdit={() => handleOpenEdit('single')}
          onOpenReplaceAll={() => handleOpenEdit('all')}
          onDeleteDirect={() => {
            if (selectionData) {
              applyTextChange({ newText: '', scope: 'single', directTarget: selectionData });
            }
          }}
          onClose={() => setSelectionData(null)}
        />
      )}

      {/* In-depth text editor modal */}
      <ChapterTextEditModal
        isOpen={editModalOpen}
        targetData={activeEditTarget}
        initialScope={initialEditScope}
        novelId={activeNovelId}
        onSave={applyTextChange}
        onDelete={({ scope }) => applyTextChange({ newText: '', scope })}
        onClose={() => {
          setEditModalOpen(false);
          setActiveEditTarget(null);
        }}
      />

      {/* Global Find & Replace Modal for entire novel */}
      <GlobalReplaceModal
        isOpen={globalReplaceOpen}
        onClose={() => setGlobalReplaceOpen(false)}
        novelId={activeNovelId}
        novelTitle={novel?.title}
        onSuccess={(res) => {
          if (res.modifiedChapters && res.modifiedChapters.length > 0 && chapter) {
            const cur = res.modifiedChapters.find(c => c.id === chapter.id);
            if (cur) {
              setChapter(cur);
            }
          }
          setEditorToast({
            message: `✨ Đã thay thế ${res.totalReplacements} vị trí trong ${res.modifiedChaptersCount} chương toàn bộ truyện!`,
          });
        }}
      />

      {/* Undo / Editor Toast notification */}
      {editorToast && (
        <div className={selectionStyles.editorToast}>
          <span>{editorToast.message}</span>
          {editorToast.onUndo && (
            <button
              type="button"
              className={selectionStyles.undoBtn}
              onClick={editorToast.onUndo}
            >
              ↩ Hoàn tác
            </button>
          )}
          <button
            type="button"
            className={selectionStyles.toastCloseBtn}
            onClick={() => setEditorToast(null)}
            title="Đóng thông báo"
          >
            ✕
          </button>
        </div>
      )}

      {/* Cross-device Sync Toast */}
      {syncToast && (
        <div style={{
          position: 'fixed',
          bottom: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#0f172a',
          color: '#f8fafc',
          border: '1px solid #38bdf8',
          padding: '10px 16px',
          borderRadius: '8px',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          fontSize: '0.88rem',
        }}>
          <span>{syncToast.message}</span>
          {syncToast.canRevert && prevJumpPosRef.current && (
            <button
              onClick={() => {
                const prev = prevJumpPosRef.current;
                if (prev) {
                  if (prev.chapterId && prev.chapterId !== chapter?.id) {
                    navigate(`/novel/${activeNovelId}/read/${prev.chapterId}`);
                  } else {
                    window.scrollTo({ top: prev.scrollY, behavior: 'smooth' });
                  }
                }
                setSyncToast(null);
              }}
              style={{
                background: 'rgba(56, 189, 248, 0.2)',
                color: '#38bdf8',
                border: '1px solid #38bdf8',
                padding: '3px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              Quay lại vị trí cũ
            </button>
          )}
          {syncToast.type === 'proposal' && syncToast.targetProgress && (
            <button
              onClick={() => {
                const target = syncToast.targetProgress;
                if (target.chapterId && target.chapterId !== chapter?.id) {
                  navigate(`/novel/${activeNovelId}/read/${target.chapterId}`);
                } else if (typeof target.paraIndex === 'number' && target.paraIndex >= 0) {
                  const el = document.getElementById(`para-${target.paraIndex}`);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                setSyncToast(null);
              }}
              style={{
                background: '#38bdf8',
                color: '#0f172a',
                border: 'none',
                padding: '3px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              Chuyển tới
            </button>
          )}
          <button
            onClick={() => setSyncToast(null)}
            style={{
              background: 'transparent',
              color: '#94a3b8',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Scroll to top FAB */}
      <ScrollToTop />
    </div>
  );
}

/**
 * Tính toán độ lệch ký tự chính xác (character offset) trong cây DOM của đoạn văn
 */
function getTextOffsetInNode(rootEl, targetNode, targetOffset) {
  let charCount = 0;
  let found = false;

  if (targetNode === rootEl && targetNode.nodeType === Node.ELEMENT_NODE) {
    for (let i = 0; i < targetOffset && i < targetNode.childNodes.length; i++) {
      charCount += targetNode.childNodes[i].textContent.length;
    }
    return charCount;
  }

  function walk(node) {
    if (found) return;
    if (node === targetNode) {
      if (node.nodeType === Node.TEXT_NODE) {
        charCount += targetOffset;
      } else {
        for (let i = 0; i < targetOffset && i < node.childNodes.length; i++) {
          charCount += node.childNodes[i].textContent.length;
        }
      }
      found = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      charCount += node.textContent.length;
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        walk(node.childNodes[i]);
        if (found) return;
      }
    }
  }

  walk(rootEl);
  return charCount;
}

// expandSelectionToWordBoundaries is imported from ../lib/selectionUtils

function highlightText(text, keyword, markClassName) {
  if (!keyword || !text) return text;
  const escaped = escapeRegExp(keyword);
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === keyword.toLowerCase() ? (
      <mark key={i} className={markClassName}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}
