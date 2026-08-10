import { useState, useEffect, useTransition } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getNovel, getChapters, deleteChapterDB, searchChapters } from '../lib/db';
import { getReadingProgress, updateLibraryItem } from '../lib/storage';
import Footer from '../components/layout/Footer';
import styles from './NovelDetailPage.module.css';

export default function NovelDetailPage() {
  const { novelId } = useParams();
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
        const [n, chs] = await Promise.all([getNovel(novelId), getChapters(novelId)]);
        setNovel(n);
        setChapters(chs || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [novelId]);

  // Handle in-novel full-text search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchChapters(novelId, searchQuery);
      startTransition(() => {
        setSearchResults(results);
        setIsSearching(false);
      });
    }, 180);

    return () => clearTimeout(timer);
  }, [searchQuery, novelId]);

  // Tự động cuộn đến chương đang đọc dở khi vào trang thông tin truyện
  useEffect(() => {
    if (!loading && chapters.length > 0) {
      const prog = getReadingProgress(novelId);
      if (prog?.chapterId) {
        const timer = setTimeout(() => {
          const el = document.getElementById(`chapter-item-${prog.chapterId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 350);
        return () => clearTimeout(timer);
      }
    }
  }, [loading, chapters.length, novelId]);

  if (loading) return <LoadingState />;
  if (!novel) return <NotFoundState />;

  const progress = getReadingProgress(novelId);
  const mainChapters = chapters.filter(c => !c.isExtra);
  const extraChapters = chapters.filter(c => c.isExtra);

  // Xử lý nhảy nhanh đến số chương mong muốn
  const handleJumpToChapter = (val) => {
    setJumpInput(val);
    if (!val.trim()) {
      setHighlightedChapterId(null);
      return;
    }
    const num = parseInt(val.trim(), 10);
    if (isNaN(num)) return;

    // Tìm theo số thứ tự chương hoặc tên chương
    let found = chapters.find(c => {
      const m = c.title.match(/(?:chương|ch\.|hồi|c)\s*(\d+)/i);
      if (m && parseInt(m[1], 10) === num) return true;
      return false;
    });

    if (!found && num >= 1 && num <= chapters.length) {
      found = chapters[num - 1];
    }

    if (found) {
      setHighlightedChapterId(found.id);
      const el = document.getElementById(`chapter-item-${found.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  // Find resume chapter
  const resumeChapter = progress.chapterId
    ? chapters.find(c => c.id === progress.chapterId)
    : chapters[0];

  const handleRead = () => {
    if (resumeChapter) navigate(`/novel/${novelId}/read/${resumeChapter.id}`);
  };

  const handleDeleteChapter = async () => {
    if (!deleteChapter) return;
    await deleteChapterDB(deleteChapter.id, novelId);
    const newChapters = chapters.filter(c => c.id !== deleteChapter.id);
    setChapters(newChapters);
    if (novel) {
      const updatedNovel = {
        ...novel,
        chapterCount: newChapters.length,
        totalChapters: newChapters.length,
      };
      setNovel(updatedNovel);
      updateLibraryItem(novelId, { chapterCount: newChapters.length });
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
          <button className={`btn-ghost ${styles.backBtn}`} onClick={() => navigate('/')}>
            ← Thư viện
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

              <div className={styles.heroActions}>
                <button
                  className={`btn-gold ${styles.readBtn}`}
                  onClick={handleRead}
                  id="btn-read-novel"
                  disabled={chapters.length === 0}
                >
                  {progress.chapterId ? '⟳ Đọc tiếp' : '▶ Bắt đầu đọc'}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => navigate(`/novel/${novelId}/add-chapter`)}
                  id="btn-add-chapter-detail"
                >
                  + Thêm chương
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => navigate(`/novel/${novelId}/edit`)}
                >
                  ✏️ Sửa truyện
                </button>
              </div>
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

        {/* Ô Nhảy Nhanh Đến Số Chương */}
        {!isSearchActive && chapters.length > 0 && (
          <div className={styles.jumpBarWrap}>
            <span className={styles.jumpIcon}>⚡</span>
            <input
              type="number"
              min="1"
              max={chapters.length}
              value={jumpInput}
              onChange={e => handleJumpToChapter(e.target.value)}
              placeholder={`Nhập số chương để nhảy đến (1 - ${chapters.length})...`}
              className={styles.jumpInput}
              id="jump-to-chapter-input"
            />
            {jumpInput && (
              <button
                className={styles.jumpClearBtn}
                onClick={() => {
                  setJumpInput('');
                  setHighlightedChapterId(null);
                }}
                title="Xóa"
              >
                ✕
              </button>
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
                onClick={() => navigate(`/novel/${novelId}/read/${result.id}?q=${encodeURIComponent(searchQuery)}`)}
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
                <button className="btn-primary" onClick={() => navigate(`/novel/${novelId}/add-chapter`)}>
                  + Thêm chương đầu tiên
                </button>
              </div>
            )}

            {/* Main chapters */}
            {mainChapters.map(ch => (
              <ChapterRow
                key={ch.id}
                chapter={ch}
                novelId={novelId}
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
                    novelId={novelId}
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
  return (
    <div
      id={`chapter-item-${chapter.id}`}
      className={`${styles.chapterRow} ${isExtra ? styles.chapterExtra : ''} ${isLastRead ? styles.chapterLastRead : ''} ${isHighlighted ? styles.chapterJumpHighlighted : ''}`}
    >
      <button
        className={styles.chapterBtn}
        onClick={() => navigate(`/novel/${novelId}/read/${chapter.id}`)}
      >
        <span className={styles.chapterTitle}>{chapter.title}</span>
        {isLastRead && <span className="badge badge-gold" style={{ marginLeft: 6 }}>✦ Đang đọc</span>}
        {isExtra && <span className="badge badge-extra" style={{ marginLeft: 6 }}>Ngoại truyện</span>}
      </button>
      <div className={styles.chapterActions}>
        <button
          className="btn-icon"
          title="Sửa chương"
          onClick={() => navigate(`/novel/${novelId}/edit-chapter/${chapter.id}`)}
          style={{ fontSize: 13 }}
        >
          ✏️
        </button>
        <button
          className="btn-icon"
          title="Xóa chương"
          onClick={onDelete}
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
