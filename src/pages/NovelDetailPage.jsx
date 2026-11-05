import { useState, useEffect, useTransition, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getNovel, getChapters, deleteChapterDB, searchChapters } from '../lib/db';
import { getReadingProgress, updateLibraryItem, getLibrary, isVaultSessionUnlocked } from '../lib/storage';
import { pullNovelProgressNow } from '../lib/sync/syncEngine.js';
import Footer from '../components/layout/Footer';
import TextBackdrop from '../components/layout/TextBackdrop';
import BottomSheet from '../components/ui/BottomSheet';
import GlobalReplaceModal from '../components/reader/GlobalReplaceModal';
import {
  IconSearch,
  IconPlay,
  IconRewind,
  IconDownload,
  IconEdit,
  IconTrash,
  IconMoreVertical,
  IconClose,
  IconCheck,
  IconSort,
  IconReplace,
  IconZap,
  IconPlus,
  IconChevronDown,
  IconChevronUp,
} from '../components/novel/NovelIcons';
import styles from './NovelDetailPage.module.css';

const NovelExportModal = lazy(() => import('../components/novel/NovelExportModal'));

/**
 * Format and deduplicate description text
 */
function cleanDescriptionText(desc, title) {
  if (!desc) return '';
  let text = desc.trim();
  if (title && text.toLowerCase().startsWith(title.trim().toLowerCase())) {
    text = text.slice(title.trim().length).trim();
  }
  text = text.replace(/^(?:mô tả|giới thiệu|nội dung)\s*[:：\-—]\s*/i, '').trim();
  return text;
}

export default function NovelDetailPage() {
  const { id, novelId } = useParams();
  const activeNovelId = novelId || id;
  const navigate = useNavigate();
  const [novel, setNovel] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [descExpanded, setDescExpanded] = useState(false);
  const [deleteChapter, setDeleteChapter] = useState(null);

  // Sorting: 'asc' | 'desc'
  const [sortOrder, setSortOrder] = useState('asc');

  // Screen width detection for mobile bottomsheet vs desktop popover
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // More menu & tools popover state
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const moreBtnRef = useRef(null);
  const toolsBtnRef = useRef(null);

  // In-novel full-text search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [, startTransition] = useTransition();

  // Jump to chapter state
  const [jumpInput, setJumpInput] = useState('');
  const [highlightedChapterId, setHighlightedChapterId] = useState(null);

  // Global find & replace modal state
  const [globalReplaceOpen, setGlobalReplaceOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [, setProgressVer] = useState(0);

  useEffect(() => {
    let active = true;
    pullNovelProgressNow(activeNovelId)
      .then((res) => {
        if (active && res?.updated) {
          setProgressVer((v) => v + 1);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [activeNovelId]);

  useEffect(() => {
    async function load() {
      try {
        let [n, chs] = await Promise.all([getNovel(activeNovelId), getChapters(activeNovelId)]);
        if (!n) {
          const { sampleNovel, sampleChapters } = await import('../lib/sampleData');
          const { saveNovel, saveChaptersBulk } = await import('../lib/db');
          await saveNovel(sampleNovel);
          await saveChaptersBulk(sampleChapters);
          n = sampleNovel;
          chs = sampleChapters;
        }
        setNovel(n);
        setChapters(chs || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [activeNovelId]);

  // Handle in-novel full-text search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchChapters(activeNovelId, searchQuery);
      startTransition(() => {
        setSearchResults(results);
        setIsSearching(false);
      });
    }, 180);

    return () => clearTimeout(timer);
  }, [searchQuery, activeNovelId]);

  // Close menus on outside click or Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMoreMenuOpen(false);
        setToolsMenuOpen(false);
      }
    };
    const handleClickOutside = (e) => {
      if (moreMenuOpen && moreBtnRef.current && !moreBtnRef.current.contains(e.target)) {
        setMoreMenuOpen(false);
      }
      if (toolsMenuOpen && toolsBtnRef.current && !toolsBtnRef.current.contains(e.target)) {
        setToolsMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClickOutside);
    };
  }, [moreMenuOpen, toolsMenuOpen]);

  // Smart chapter search/jump
  const findTargetChapter = useCallback(
    (query) => {
      if (!query || !query.trim() || chapters.length === 0) return null;
      const cleanQuery = query.trim().toLowerCase();

      // 1. Number matching
      const numberMatch = cleanQuery.match(/(\d+)/);
      if (numberMatch) {
        const num = parseInt(numberMatch[1], 10);
        const exactTitleMatch = chapters.find((c) => {
          const titleLower = c.title.toLowerCase();
          const m =
            titleLower.match(/(?:chương|thứ|đệ|phiên ngoại|ngoại truyện|hồi|quyển|ch\.|c)\s*(\d+)/i) ||
            titleLower.match(/^(\d+)(?:[\s.:\-]|$)/);
          if (m && parseInt(m[1], 10) === num) return true;
          return false;
        });
        if (exactTitleMatch) return exactTitleMatch;

        if (num >= 1 && num <= chapters.length) {
          return chapters[num - 1];
        }
      }

      // 2. Keyword match
      const textMatch = chapters.find((c) => c.title.toLowerCase().includes(cleanQuery));
      if (textMatch) return textMatch;

      return null;
    },
    [chapters]
  );

  const doScrollToChapter = useCallback((chId) => {
    if (!chId) return;
    setHighlightedChapterId(chId);
    const el = document.getElementById(`chapter-item-${chId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const matchedJumpChapter = jumpInput.trim() ? findTargetChapter(jumpInput) : null;

  const handleJumpSubmit = (e) => {
    if (e) e.preventDefault();
    if (matchedJumpChapter) {
      doScrollToChapter(matchedJumpChapter.id);
    }
  };

  if (loading) return <LoadingState />;
  if (!novel) return <NotFoundState />;

  const progress = getReadingProgress(activeNovelId);
  const isVaultNovel = Boolean(
    novel?.isHidden || getLibrary({ includeHidden: true }).find((n) => n.id === activeNovelId)?.isHidden
  );
  const canShowExport = !isVaultNovel || isVaultSessionUnlocked();

  // Find resume chapter & current reading index
  const resumeIndex = progress.chapterId ? chapters.findIndex((c) => c.id === progress.chapterId) : 0;
  const resumeChapter = resumeIndex >= 0 ? chapters[resumeIndex] : chapters[0];
  const hasProgress = Boolean(progress.chapterId && resumeChapter);
  const currentChapterNum = resumeIndex >= 0 ? resumeIndex + 1 : 1;

  // Sorted chapters
  const sortedChapters = [...chapters].sort((a, b) => {
    const orderA = a.order !== undefined ? a.order : 0;
    const orderB = b.order !== undefined ? b.order : 0;
    return sortOrder === 'asc' ? orderA - orderB : orderB - orderA;
  });

  const mainChapters = sortedChapters.filter((c) => !c.isExtra);
  const extraChapters = sortedChapters.filter((c) => c.isExtra);

  const handleRead = () => {
    if (resumeChapter) navigate(`/novel/${activeNovelId}/read/${resumeChapter.id}`);
  };

  const handleDeleteChapter = async () => {
    if (!deleteChapter) return;
    await deleteChapterDB(deleteChapter.id, activeNovelId);
    const newChapters = chapters.filter((c) => c.id !== deleteChapter.id);
    setChapters(newChapters);
    if (novel) {
      const updatedNovel = {
        ...novel,
        chapterCount: newChapters.length,
        totalChapters: newChapters.length,
      };
      setNovel(updatedNovel);
      updateLibraryItem(activeNovelId, { chapterCount: newChapters.length });
    }
    setDeleteChapter(null);
  };

  const isSearchActive = searchQuery.trim().length > 0;
  const cleanedDesc = cleanDescriptionText(novel.description, novel.title);

  return (
    <div className={styles.page}>
      <TextBackdrop />

      {/* ===== HERO SECTION ===== */}
      <div className={styles.hero}>
        {/* Blurred background cover */}
        <div className={styles.heroBgWrap} aria-hidden="true">
          {(novel.coverUrl || novel.coverThumb) ? (
            <img
              src={novel.coverUrl || novel.coverThumb}
              className={styles.heroBg}
              alt=""
            />
          ) : (
            <div className={styles.heroBgDefault} />
          )}
          <div className={styles.heroBgOverlay} />
        </div>

        <div className={styles.heroContent}>
          {/* Back button */}
          <button
            className={styles.backBtn}
            onClick={() => {
              if (isVaultNovel) {
                navigate('/?vault=1');
              } else {
                navigate('/');
              }
            }}
          >
            {isVaultNovel ? '← Mật Thất' : '← Thư viện'}
          </button>

          <div className={styles.heroMain}>
            {/* Floating Cover */}
            <div className={styles.coverWrap}>
              {(novel.coverUrl || novel.coverThumb) ? (
                <img
                  src={novel.coverUrl || novel.coverThumb}
                  alt={novel.title}
                  className={styles.cover}
                />
              ) : (
                <div className={styles.coverDefault}>
                  <span className={styles.coverChar}>{novel.title.charAt(0)}</span>
                </div>
              )}
            </div>

            {/* Meta & Actions */}
            <div className={styles.meta}>
              <h1 className={styles.title} title={novel.title}>{novel.title}</h1>
              <div className={styles.titleAccentLine} aria-hidden="true" />

              <p className={styles.metaLine}>
                <span>{chapters.length} chương</span>
                {hasProgress && (
                  <>
                    <span className={styles.metaDot}>·</span>
                    <span className={styles.metaReading}>Đang đọc ch. {currentChapterNum}</span>
                  </>
                )}
                {extraChapters.length > 0 && (
                  <>
                    <span className={styles.metaDot}>·</span>
                    <span className={styles.extraTag}>{extraChapters.length} ngoại truyện</span>
                  </>
                )}
              </p>

              {/* Action Buttons */}
              <div className={styles.actionToolbar}>
                {/* Main Action: Read next or Read from start */}
                <div className={styles.mainReadBlock}>
                  <button
                    className={styles.mainReadBtn}
                    onClick={handleRead}
                    id="btn-read-novel"
                    disabled={chapters.length === 0}
                  >
                    <IconPlay size={16} />
                    <span>
                      {hasProgress ? `Đọc tiếp Chương ${currentChapterNum}` : 'Bắt đầu đọc (Chương 1)'}
                    </span>
                  </button>

                  {hasProgress && resumeChapter && (
                    <span className={styles.resumeChapterHint} title={resumeChapter.title}>
                      {resumeChapter.title}
                    </span>
                  )}
                </div>

                {/* Secondary Button: Read from Start */}
                {hasProgress && (
                  <button
                    className={styles.secondaryBtn}
                    onClick={() => navigate(`/novel/${activeNovelId}/read/${chapters[0]?.id}`)}
                    title="Đọc lại từ chương 1"
                    id="btn-read-from-start"
                  >
                    <IconRewind size={15} />
                    <span>Đọc từ đầu</span>
                  </button>
                )}

                {/* More Actions (⋯) Container */}
                <div className={styles.moreActionsContainer} ref={moreBtnRef}>
                  <button
                    type="button"
                    className={styles.moreActionsBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMoreMenuOpen(!moreMenuOpen);
                    }}
                    title="Thao tác khác"
                    aria-label="Thao tác khác"
                    id="btn-more-actions"
                  >
                    <IconMoreVertical size={16} />
                  </button>

                  {/* Desktop Popover Menu */}
                  {moreMenuOpen && !isMobile && (
                    <div className={styles.desktopPopoverMenu} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className={styles.popoverItem}
                        onClick={() => {
                          setMoreMenuOpen(false);
                          navigate(`/novel/${activeNovelId}/add-chapter`);
                        }}
                        id="btn-add-chapter-detail"
                      >
                        <div className={styles.popoverIconWrap}>
                          <IconPlus size={16} />
                        </div>
                        <span>Thêm chương</span>
                      </button>

                      <button
                        type="button"
                        className={styles.popoverItem}
                        onClick={() => {
                          setMoreMenuOpen(false);
                          navigate(`/novel/${activeNovelId}/edit`);
                        }}
                        id="btn-edit-novel-detail"
                      >
                        <div className={styles.popoverIconWrap}>
                          <IconEdit size={16} />
                        </div>
                        <span>Sửa truyện</span>
                      </button>

                      {canShowExport && (
                        <button
                          type="button"
                          className={styles.popoverItem}
                          onClick={() => {
                            setMoreMenuOpen(false);
                            setExportModalOpen(true);
                          }}
                          disabled={chapters.length === 0}
                          title={chapters.length === 0 ? 'Truyện chưa có chương nào để tải về' : 'Tải về máy (EPUB hoặc TXT)'}
                          id="btn-export-novel"
                        >
                          <div className={styles.popoverIconWrap}>
                            <IconDownload size={16} />
                          </div>
                          <span>Tải về máy</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== DESCRIPTION (GIỚI THIỆU) ===== */}
      {cleanedDesc && (
        <section className={styles.sectionWrap}>
          <div className={styles.descCard}>
            <h2 className={styles.sectionTitle}>Giới thiệu</h2>
            <div className={`${styles.descBody} ${descExpanded ? styles.descExpanded : ''}`}>
              <p>{cleanedDesc}</p>
            </div>
            {cleanedDesc.length > 240 && (
              <button
                className={styles.expandBtn}
                onClick={() => setDescExpanded(!descExpanded)}
              >
                {descExpanded ? (
                  <>
                    <span>Thu gọn</span>
                    <IconChevronUp size={14} />
                  </>
                ) : (
                  <>
                    <span>Xem thêm</span>
                    <IconChevronDown size={14} />
                  </>
                )}
              </button>
            )}
          </div>
        </section>
      )}

      {/* ===== TABLE OF CONTENTS (MỤC LỤC) ===== */}
      <section className={styles.sectionWrap}>
        {/* Sticky Toolbar underneath header */}
        <div className={styles.tocStickyHeader}>
          <div className={styles.tocHeaderRow}>
            <h2 className={styles.tocTitle}>
              {isSearchActive ? 'Kết quả tìm kiếm' : 'Mục lục'}
              <span className={styles.chapterBadge}>{chapters.length}</span>
            </h2>

            <div className={styles.tocActionsRow}>
              {/* Sort button */}
              <button
                type="button"
                className={styles.sortBtn}
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                title={`Sắp xếp: ${sortOrder === 'asc' ? 'Tăng dần (1 → N)' : 'Giảm dần (N → 1)'}`}
              >
                <IconSort size={15} />
                <span className={styles.sortBtnLabel}>{sortOrder === 'asc' ? 'Tăng dần' : 'Giảm dần'}</span>
              </button>

              {/* Tools dropdown */}
              <div className={styles.toolsMenuWrap} ref={toolsBtnRef}>
                <button
                  type="button"
                  className={styles.toolsBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setToolsMenuOpen(!toolsMenuOpen);
                  }}
                  title="Công cụ bổ trợ"
                >
                  <IconMoreVertical size={16} />
                  <span className={styles.toolsBtnLabel}>Công cụ</span>
                </button>

                {toolsMenuOpen && (
                  <div className={styles.toolsDropdown} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className={styles.toolsDropdownItem}
                      onClick={() => {
                        setToolsMenuOpen(false);
                        setGlobalReplaceOpen(true);
                      }}
                      title="Tìm và thay thế một cụm từ trên toàn bộ truyện"
                    >
                      <div className={styles.toolsIconWrap}>
                        <IconReplace size={16} />
                      </div>
                      <span>Thay thế toàn truyện</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Jump Bar & Search Row */}
          {!isSearchActive && chapters.length > 0 && (
            <div className={styles.tocControlsRow}>
              {/* Quick Jump Bar */}
              <form className={styles.jumpForm} onSubmit={handleJumpSubmit}>
                <span className={styles.jumpIcon} aria-hidden="true">
                  <IconZap size={14} />
                </span>
                <input
                  type="text"
                  value={jumpInput}
                  onChange={(e) => setJumpInput(e.target.value)}
                  placeholder={`Nhập số chương để nhảy tới (1 - ${chapters.length})...`}
                  className={styles.jumpInput}
                  id="jump-to-chapter-input"
                />
                {jumpInput && (
                  <button
                    type="button"
                    className={styles.jumpClearBtn}
                    onClick={() => {
                      setJumpInput('');
                      setHighlightedChapterId(null);
                    }}
                    title="Xóa tìm kiếm"
                  >
                    <IconClose size={14} />
                  </button>
                )}
                <button
                  type="submit"
                  className={styles.jumpSubmitBtn}
                  disabled={!matchedJumpChapter}
                >
                  Nhảy tới ↵
                </button>
              </form>

              {/* In-novel content search bar */}
              <div className={styles.contentSearchWrap}>
                <span className={styles.searchIcon} aria-hidden="true">
                  <IconSearch size={14} />
                </span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm từ khóa trong nội dung..."
                  className={styles.contentSearchInput}
                  id="novel-content-search"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className={styles.searchClearBtn}
                    onClick={() => setSearchQuery('')}
                    title="Xóa tìm kiếm"
                  >
                    <IconClose size={14} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Live Result Feedback Banner */}
          {!isSearchActive && jumpInput.trim() && (
            <div className={styles.jumpResultBar}>
              {matchedJumpChapter ? (
                <>
                  <span className={styles.jumpFoundLabel}>
                    ✓ Khớp: <strong>{matchedJumpChapter.title}</strong>
                  </span>
                  <div className={styles.jumpResultBtns}>
                    <button
                      type="button"
                      className={styles.jumpGoBtn}
                      onClick={() => doScrollToChapter(matchedJumpChapter.id)}
                    >
                      Cuộn tới
                    </button>
                    <button
                      type="button"
                      className={styles.jumpReadNowBtn}
                      onClick={() => navigate(`/novel/${activeNovelId}/read/${matchedJumpChapter.id}`)}
                    >
                      Đọc luôn
                    </button>
                  </div>
                </>
              ) : (
                <span className={styles.jumpNotFoundLabel}>
                  Không tìm thấy chương phù hợp với "{jumpInput}" (Tổng số: {chapters.length} chương)
                </span>
              )}
            </div>
          )}

          {isSearchActive && (
            <div className={styles.searchActiveBar}>
              <span>
                Đang tìm: <strong>{searchQuery}</strong>
              </span>
              <button className={styles.clearSearchBtn} onClick={() => setSearchQuery('')}>
                ✕ Xem toàn bộ mục lục
              </button>
            </div>
          )}
        </div>

        {/* SEARCH MODE RESULTS */}
        {isSearchActive && (
          <div className={styles.searchResultsContainer}>
            <div className={styles.searchSummary}>
              {isSearching ? (
                <span>Đang tìm kiếm trong {chapters.length} chương...</span>
              ) : searchResults.length > 0 ? (
                <span>
                  Tìm thấy <strong>{searchResults.length}</strong> chương chứa cụm từ "
                  <strong className={styles.queryHighlight}>{searchQuery}</strong>"
                </span>
              ) : (
                <span>
                  Không tìm thấy chương nào chứa cụm từ "
                  <strong className={styles.queryHighlight}>{searchQuery}</strong>"
                </span>
              )}
            </div>

            {searchResults.map((result) => (
              <div
                key={result.id}
                className={styles.searchResultCard}
                onClick={() =>
                  navigate(`/novel/${activeNovelId}/read/${result.id}?q=${encodeURIComponent(searchQuery)}`)
                }
                role="button"
                tabIndex={0}
              >
                <div className={styles.searchResultTop}>
                  <h3 className={styles.searchResultTitle}>
                    {highlightText(result.title, searchQuery, styles.highlightMark)}
                  </h3>
                  <div className={styles.searchResultBadges}>
                    {result.isExtra && <span className={styles.badgeExtra}>Ngoại truyện</span>}
                    <span className={styles.badgeMatch}>{result.matchCount} đoạn khớp</span>
                  </div>
                </div>

                {result.snippets && result.snippets.length > 0 && (
                  <div className={styles.searchSnippetsList}>
                    {result.snippets.map((snip, sIdx) => (
                      <p key={sIdx} className={styles.searchSnippet}>
                        {highlightText(snip, searchQuery, styles.highlightMark)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* NORMAL CHAPTER GRID / LIST (when not searching) */}
        {!isSearchActive && (
          <div className={styles.chapterContainer}>
            {chapters.length === 0 && (
              <div className={styles.emptyChapters}>
                <p>Chưa có chương nào.</p>
                <button
                  className={styles.addFirstChapterBtn}
                  onClick={() => navigate(`/novel/${activeNovelId}/add-chapter`)}
                >
                  <IconPlus size={16} />
                  <span>Thêm chương đầu tiên</span>
                </button>
              </div>
            )}

            {/* Main chapters grid */}
            <div className={styles.chapterGrid}>
              {mainChapters.map((ch, idx) => (
                <ChapterRow
                  key={ch.id}
                  chapter={ch}
                  novelId={activeNovelId}
                  index={sortOrder === 'asc' ? idx + 1 : chapters.length - idx}
                  isLastRead={progress?.chapterId === ch.id}
                  isHighlighted={highlightedChapterId === ch.id}
                  onDelete={() => setDeleteChapter(ch)}
                />
              ))}
            </div>

            {/* Extra chapters divider */}
            {extraChapters.length > 0 && (
              <>
                <div className={styles.extraDivider}>
                  <div className={styles.extraLine} />
                  <span className={styles.extraLabel}>✦ Ngoại truyện / Phiên ngoại ✦</span>
                  <div className={styles.extraLine} />
                </div>
                <div className={styles.chapterGrid}>
                  {extraChapters.map((ch, idx) => (
                    <ChapterRow
                      key={ch.id}
                      chapter={ch}
                      novelId={activeNovelId}
                      index={idx + 1}
                      isExtra
                      isLastRead={progress?.chapterId === ch.id}
                      isHighlighted={highlightedChapterId === ch.id}
                      onDelete={() => setDeleteChapter(ch)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <Footer />

      {/* Mobile More Actions Bottom Sheet */}
      {isMobile && (
        <BottomSheet isOpen={moreMenuOpen} onClose={() => setMoreMenuOpen(false)}>
        <div className={styles.sheetHeader}>
          <h3 className={styles.sheetTitle}>Thao tác truyện</h3>
          <button
            type="button"
            className={styles.sheetCloseBtn}
            onClick={() => setMoreMenuOpen(false)}
            aria-label="Đóng"
          >
            <IconClose size={18} />
          </button>
        </div>
        <div className={styles.sheetActions}>
          <button
            type="button"
            className={styles.sheetActionRow}
            onClick={() => {
              setMoreMenuOpen(false);
              navigate(`/novel/${activeNovelId}/add-chapter`);
            }}
            id="btn-add-chapter-detail-mobile"
          >
            <div className={styles.sheetIconWrap}>
              <IconPlus size={18} />
            </div>
            <span className={styles.sheetActionLabel}>Thêm chương</span>
          </button>

          <button
            type="button"
            className={styles.sheetActionRow}
            onClick={() => {
              setMoreMenuOpen(false);
              navigate(`/novel/${activeNovelId}/edit`);
            }}
            id="btn-edit-novel-detail-mobile"
          >
            <div className={styles.sheetIconWrap}>
              <IconEdit size={18} />
            </div>
            <span className={styles.sheetActionLabel}>Sửa truyện</span>
          </button>

          {canShowExport && (
            <button
              type="button"
              className={styles.sheetActionRow}
              onClick={() => {
                setMoreMenuOpen(false);
                setExportModalOpen(true);
              }}
              disabled={chapters.length === 0}
              title={chapters.length === 0 ? 'Truyện chưa có chương nào để tải về' : 'Tải về máy (EPUB hoặc TXT)'}
              id="btn-export-novel"
            >
              <div className={styles.sheetIconWrap}>
                <IconDownload size={18} />
              </div>
              <span className={styles.sheetActionLabel}>Tải về máy (EPUB/TXT)</span>
            </button>
          )}
        </div>
      </BottomSheet>
      )}

      {/* Novel Export Modal */}
      {exportModalOpen && canShowExport && (
        <Suspense fallback={null}>
          <NovelExportModal
            novel={novel}
            chapters={chapters}
            onClose={() => setExportModalOpen(false)}
          />
        </Suspense>
      )}

      {/* Global Replace Modal */}
      <GlobalReplaceModal
        isOpen={globalReplaceOpen}
        onClose={() => setGlobalReplaceOpen(false)}
        novelId={activeNovelId}
        novelTitle={novel?.title}
        initialSearchText={searchQuery}
        onSuccess={async () => {
          const chs = await getChapters(activeNovelId);
          setChapters(chs);
          if (searchQuery.trim()) {
            const query = searchQuery.trim();
            setIsSearching(true);
            searchChapters(activeNovelId, query)
              .then((results) => {
                setSearchResults(results);
                setIsSearching(false);
              })
              .catch(() => setIsSearching(false));
          }
        }}
      />

      {/* Delete chapter confirm */}
      {deleteChapter && (
        <div className={styles.confirmOverlay} onClick={() => setDeleteChapter(null)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>Xóa chương?</h3>
            <p className={styles.confirmMsg}>
              Xóa "<strong>{deleteChapter.title}</strong>"? Không thể hoàn tác.
            </p>
            <div className={styles.confirmActions}>
              <button className="btn-ghost" onClick={() => setDeleteChapter(null)}>
                Hủy
              </button>
              <button className="btn-danger" onClick={handleDeleteChapter}>
                Xóa chương
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChapterRow({ chapter, novelId, index, isExtra, isLastRead, isHighlighted, onDelete }) {
  const navigate = useNavigate();
  const handleOpen = () => {
    navigate(`/novel/${novelId}/read/${chapter.id}`);
  };

  return (
    <div
      id={`chapter-item-${chapter.id}`}
      className={`${styles.chapterRow} ${isExtra ? styles.chapterExtra : ''} ${
        isLastRead ? styles.chapterLastRead : ''
      } ${isHighlighted ? styles.chapterJumpHighlighted : ''}`}
      onClick={handleOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleOpen();
      }}
    >
      {/* Chapter Number */}
      <span className={styles.chapterNum}>{index}</span>

      {/* Title */}
      <span className={`${styles.chapterTitle} ${isLastRead ? styles.lastReadTitle : ''}`}>
        {chapter.title}
      </span>

      {/* Badges */}
      {isLastRead && <span className={styles.readingBadge}>Đang đọc</span>}
      {isExtra && <span className={styles.badgeExtra}>Ngoại truyện</span>}

      {/* Action buttons (Edit / Delete) */}
      <div className={styles.chapterActions} onClick={(e) => e.stopPropagation()}>
        <button
          className={styles.chapterActionBtn}
          title="Sửa chương"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/novel/${novelId}/edit-chapter/${chapter.id}`);
          }}
        >
          <IconEdit size={14} />
        </button>
        <button
          className={`${styles.chapterActionBtn} ${styles.chapterDeleteBtn}`}
          title="Xóa chương"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <IconTrash size={14} />
        </button>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ padding: '80px 20px', textAlign: 'center' }}>
      <div className="spinner" style={{ margin: '0 auto' }} />
    </div>
  );
}

function NotFoundState() {
  const navigate = useNavigate();
  return (
    <div style={{ padding: '80px 20px', textAlign: 'center' }}>
      <h2 style={{ fontFamily: 'var(--font-serif)', color: 'var(--accent-gold)', marginBottom: 12 }}>
        Không tìm thấy truyện
      </h2>
      <button className="btn-ghost" onClick={() => navigate('/')}>
        ← Về thư viện
      </button>
    </div>
  );
}

function highlightText(text, keyword, markClassName) {
  if (!keyword || !text) return text;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
