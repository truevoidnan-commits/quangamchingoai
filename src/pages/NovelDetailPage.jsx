import { useState, useEffect, useTransition, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getNovel, getChapters, deleteChapterDB, searchChapters } from '../lib/db';
import { getReadingProgress, updateLibraryItem } from '../lib/storage';
import Footer from '../components/layout/Footer';
import styles from './NovelDetailPage.module.css';

export default function NovelDetailPage() {
  const { id, novelId } = useParams();
  const activeNovelId = novelId || id;
  const navigate = useNavigate();
  const [novel, setNovel] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [descExpanded, setDescExpanded] = useState(false);
  const [deleteChapter, setDeleteChapter] = useState(null);

  // In-novel full-text search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [, startTransition] = useTransition();

  // Jump to chapter state
  const [jumpInput, setJumpInput] = useState('');
  const [highlightedChapterId, setHighlightedChapterId] = useState(null);

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

  if (loading) return <LoadingState />;
  if (!novel) return <NotFoundState />;

  const progress = getReadingProgress(activeNovelId);
  const mainChapters = chapters.filter(c => !c.isExtra);
  const extraChapters = chapters.filter(c => c.isExtra);

  // Tìm kiếm chương thông minh đa chiến lược
  const findTargetChapter = useCallback((query) => {
    if (!query || !query.trim() || chapters.length === 0) return null;
    const cleanQuery = query.trim().toLowerCase();

    // 1. Nếu có chứa số (ví dụ: '483', 'chương 483', 'thứ 483', 'hồi 483', 'ngoại truyện 2')
    const numberMatch = cleanQuery.match(/(\d+)/);
    if (numberMatch) {
      const num = parseInt(numberMatch[1], 10);

      // 1.1 Khớp chính xác số chương theo các mẫu tiêu đề chuẩn
      const exactTitleMatch = chapters.find(c => {
        const titleLower = c.title.toLowerCase();
        const m = titleLower.match(/(?:chương|thứ|đệ|phiên ngoại|ngoại truyện|hồi|quyển|ch\.|c)\s*(\d+)/i)
               || titleLower.match(/^(\d+)(?:[\s.:\-]|$)/);
        if (m && parseInt(m[1], 10) === num) return true;
        return false;
      });
      if (exactTitleMatch) return exactTitleMatch;

      // 1.2 Nếu tìm theo số thứ tự (1-based index)
      if (num >= 1 && num <= chapters.length) {
        return chapters[num - 1];
      }
    }

    // 2. Tìm theo từ khóa trong tiêu đề (ví dụ "kết cục", "ngoại truyện")
    const textMatch = chapters.find(c => c.title.toLowerCase().includes(cleanQuery));
    if (textMatch) return textMatch;

    return null;
  }, [chapters]);

  // Cuộn mượt đến chương chỉ định và làm nổi bật
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

  // Find resume chapter
  const resumeChapter = progress.chapterId
    ? chapters.find(c => c.id === progress.chapterId)
    : chapters[0];

  const handleRead = () => {
    if (resumeChapter) navigate(`/novel/${activeNovelId}/read/${resumeChapter.id}`);
  };

  const handleDeleteChapter = async () => {
    if (!deleteChapter) return;
    await deleteChapterDB(deleteChapter.id, activeNovelId);
    const newChapters = chapters.filter(c => c.id !== deleteChapter.id);
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

  return (
    <div className={styles.page}>
      {/* Hero */}
      <div className={styles.hero}>
        {novel.coverUrl ? (
          <div className={styles.heroBgWrap}>
            <img src={novel.coverUrl} className={styles.heroBg} alt="" aria-hidden="true" />
            <div className={styles.heroBgOverlay} />
          </div>
        ) : (
          <div className={styles.heroBgDefault} />
        )}

        <div className={styles.heroContent}>
          {/* Back */}
          <button
            className={`btn-ghost ${styles.backBtn}`}
            onClick={() => {
              if (novel?.isHidden) {
                navigate('/?vault=1');
              } else {
                navigate('/');
              }
            }}
          >
            {novel?.isHidden ? '← Mật Thất' : '← Thư viện'}
          </button>

          <div className={styles.heroMain}>
            {/* Cover */}
            <div className={styles.coverWrap}>
              {novel.coverUrl ? (
                <img src={novel.coverUrl} alt={novel.title} className={styles.cover} />
              ) : (
                <div className={styles.coverDefault}>
                  <span className={styles.coverChar}>{novel.title.charAt(0)}</span>
                </div>
              )}
            </div>

            {/* Meta */}
            <div className={styles.meta}>
              <h1 className={styles.title}>{novel.title}</h1>
              <p className={styles.chapterCount}>
                <span className={styles.count}>{chapters.length}</span> chương
                {extraChapters.length > 0 && (
                  <span className="badge badge-extra" style={{ marginLeft: 8 }}>
                    {extraChapters.length} ngoại truyện
                  </span>
                )}
              </p>

              {/* Reading Progress Action Card */}
              {progress.chapterId && resumeChapter ? (
                <div className={styles.progressCard}>
                  <div className={styles.progressCardHeader}>
                    <span className={styles.progressTag}>📍 TIẾP TỤC ĐỌC</span>
                    <span className={styles.progressHint}>Đang dừng tại:</span>
                  </div>
                  <div className={styles.progressChapterTitle}>
                    {resumeChapter.title}
                  </div>
                  <div className={styles.progressActions}>
                    <button
                      className={`btn-gold ${styles.mainReadBtn}`}
                      onClick={handleRead}
                      id="btn-read-novel"
                    >
                      ▶ Đọc tiếp ngay
                    </button>
                    <button
                      className="btn-ghost"
                      onClick={() => navigate(`/novel/${activeNovelId}/read/${chapters[0]?.id}`)}
                      title="Đọc lại từ chương 1"
                      id="btn-read-from-start"
                    >
                      ⏮️ Đọc từ đầu
                    </button>
                    <button
                      className="btn-ghost"
                      onClick={() => navigate(`/novel/${activeNovelId}/add-chapter`)}
                      id="btn-add-chapter-detail"
                    >
                      + Thêm chương
                    </button>
                    <button
                      className="btn-ghost"
                      onClick={() => navigate(`/novel/${activeNovelId}/edit`)}
                    >
                      ✏️ Sửa truyện
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.heroActions}>
                  <button
                    className={`btn-gold ${styles.readBtn}`}
                    onClick={handleRead}
                    id="btn-read-novel"
                    disabled={chapters.length === 0}
                  >
                    ▶ Bắt đầu đọc (Chương 1)
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => navigate(`/novel/${activeNovelId}/add-chapter`)}
                    id="btn-add-chapter-detail"
                  >
                    + Thêm chương
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => navigate(`/novel/${activeNovelId}/edit`)}
                  >
                    ✏️ Sửa truyện
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      {novel.description && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Giới thiệu</h2>
          <div className={`${styles.desc} ${descExpanded ? styles.descExpanded : ''}`}>
            <p>{novel.description}</p>
          </div>
          {novel.description.length > 200 && (
            <button
              className={styles.expandBtn}
              onClick={() => setDescExpanded(!descExpanded)}
            >
              {descExpanded ? 'Thu gọn ▲' : 'Xem thêm ▼'}
            </button>
          )}
        </div>
      )}

      {/* ===== IN-NOVEL SEARCH & TABLE OF CONTENTS ===== */}
      <div className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <h2 className={styles.sectionTitle}>
            {isSearchActive ? 'Kết quả tìm kiếm' : 'Mục lục'}
          </h2>
          {isSearchActive && (
            <button className={styles.clearSearchBtn} onClick={() => setSearchQuery('')}>
              ✕ Xem toàn bộ mục lục
            </button>
          )}
        </div>

        {/* Ô Nhảy Nhanh Đến Số Chương / Tên Chương */}
        {!isSearchActive && chapters.length > 0 && (
          <div className={styles.jumpSection}>
            <form className={styles.jumpBarWrap} onSubmit={handleJumpSubmit}>
              <span className={styles.jumpIcon}>⚡</span>
              <input
                type="text"
                value={jumpInput}
                onChange={e => setJumpInput(e.target.value)}
                placeholder={`Nhập số chương hoặc tên chương để nhảy đến (1 - ${chapters.length})...`}
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
                  ✕
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

            {/* Live Result Feedback Banner */}
            {jumpInput.trim() && (
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
                        📍 Cuộn tới
                      </button>
                      <button
                        type="button"
                        className={styles.jumpReadNowBtn}
                        onClick={() => navigate(`/novel/${activeNovelId}/read/${matchedJumpChapter.id}`)}
                      >
                        ▶ Đọc luôn
                      </button>
                    </div>
                  </>
                ) : (
                  <span className={styles.jumpNotFoundLabel}>
                    ⚠️ Không tìm thấy chương phù hợp với "{jumpInput}" (Tổng số: {chapters.length} chương)
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Search bar inside novel */}
        <div className={styles.novelSearchWrap}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Nhập từ khoá / cụm từ để tìm trong nội dung tất cả các chương..."
            className={styles.novelSearchInput}
            id="novel-content-search"
          />
          {searchQuery && (
            <button className={styles.searchClearIcon} onClick={() => setSearchQuery('')} title="Xóa tìm kiếm">
              ✕
            </button>
          )}
        </div>

        {/* SEARCH MODE RESULTS */}
        {isSearchActive && (
          <div className={styles.searchResultsContainer}>
            <div className={styles.searchSummary}>
              {isSearching ? (
                <span>⏳ Đang tìm kiếm trong {chapters.length} chương...</span>
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

            {searchResults.map(result => (
              <div
                key={result.id}
                className={styles.searchResultCard}
                onClick={() => navigate(`/novel/${activeNovelId}/read/${result.id}?q=${encodeURIComponent(searchQuery)}`)}
                role="button"
                tabIndex={0}
              >
                <div className={styles.searchResultTop}>
                  <h3 className={styles.searchResultTitle}>
                    {highlightText(result.title, searchQuery, styles.highlightMark)}
                  </h3>
                  <div className={styles.searchResultBadges}>
                    {result.isExtra && <span className="badge badge-extra">Ngoại truyện</span>}
                    <span className="badge badge-cyan">{result.matchCount} đoạn khớp</span>
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

        {/* NORMAL TABLE OF CONTENTS (when not searching) */}
        {!isSearchActive && (
          <>
            {chapters.length === 0 && (
              <div className={styles.emptyChapters}>
                <p>Chưa có chương nào.</p>
                <button className="btn-primary" onClick={() => navigate(`/novel/${activeNovelId}/add-chapter`)}>
                  + Thêm chương đầu tiên
                </button>
              </div>
            )}

            {/* Main chapters */}
            {mainChapters.map(ch => (
              <ChapterRow
                key={ch.id}
                chapter={ch}
                novelId={activeNovelId}
                isLastRead={progress?.chapterId === ch.id}
                isHighlighted={highlightedChapterId === ch.id}
                onDelete={() => setDeleteChapter(ch)}
              />
            ))}

            {/* Extra divider */}
            {extraChapters.length > 0 && (
              <>
                <div className={styles.extraDivider}>
                  <div className={styles.extraLine} />
                  <span className={styles.extraLabel}>✦ Ngoại truyện / Phiên ngoại ✦</span>
                  <div className={styles.extraLine} />
                </div>
                {extraChapters.map(ch => (
                  <ChapterRow
                    key={ch.id}
                    chapter={ch}
                    novelId={activeNovelId}
                    isExtra
                    isLastRead={progress?.chapterId === ch.id}
                    isHighlighted={highlightedChapterId === ch.id}
                    onDelete={() => setDeleteChapter(ch)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>

      <Footer />

      {/* Delete chapter confirm */}
      {deleteChapter && (
        <div className={styles.confirmOverlay} onClick={() => setDeleteChapter(null)}>
          <div className={styles.confirmDialog} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#ff6b6b', fontFamily: 'var(--font-serif)', marginBottom: 10 }}>Xóa chương?</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
              Xóa "<strong style={{ color: 'var(--text-primary)' }}>{deleteChapter.title}</strong>"? Không thể hoàn tác.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setDeleteChapter(null)}>Hủy</button>
              <button className="btn-danger" onClick={handleDeleteChapter}>Xóa chương</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChapterRow({ chapter, novelId, isExtra, isLastRead, isHighlighted, onDelete }) {
  const navigate = useNavigate();
  const handleOpen = () => {
    navigate(`/novel/${novelId}/read/${chapter.id}`);
  };

  return (
    <div
      id={`chapter-item-${chapter.id}`}
      className={`${styles.chapterRow} ${isExtra ? styles.chapterExtra : ''} ${isLastRead ? styles.chapterLastRead : ''} ${isHighlighted ? styles.chapterJumpHighlighted : ''}`}
      onClick={handleOpen}
      style={{ cursor: 'pointer', userSelect: 'none' }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOpen(); }}
    >
      <div className={styles.chapterBtn} style={{ display: 'flex', alignItems: 'center', flex: 1, pointerEvents: 'none' }}>
        <span className={`${styles.chapterTitle} ${isLastRead ? styles.lastReadTitle : ''}`}>{chapter.title}</span>
        {isLastRead && <span className="badge badge-gold badge-reading-pulse" style={{ marginLeft: 8, flexShrink: 0 }}>✦ Đang đọc</span>}
        {isExtra && <span className="badge badge-extra" style={{ marginLeft: 6, flexShrink: 0 }}>Ngoại truyện</span>}
      </div>
      <div className={styles.chapterActions} onClick={(e) => e.stopPropagation()}>
        <button
          className="btn-icon"
          title="Sửa chương"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/novel/${novelId}/edit-chapter/${chapter.id}`);
          }}
          style={{ fontSize: 13 }}
        >
          ✏️
        </button>
        <button
          className="btn-icon"
          title="Xóa chương"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{ fontSize: 13, color: '#ff6b6b' }}
        >
          🗑
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
      <button className="btn-ghost" onClick={() => navigate('/')}>← Về thư viện</button>
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
