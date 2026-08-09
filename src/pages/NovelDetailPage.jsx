import { useState, useEffect, useTransition } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getNovel, getChapters, deleteChapterDB, searchChapters } from '../lib/db';
import { getReadingProgress } from '../lib/storage';
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

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [n, chs] = await Promise.all([getNovel(novelId), getChapters(novelId)]);
        setNovel(n);
        setChapters(chs || []);
      } finally {
        setLoading(false);
      }
    })();
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

  if (loading) return <LoadingState />;
  if (!novel) return <NotFoundState />;

  const progress = getReadingProgress(novelId);
  const mainChapters = chapters.filter(c => !c.isExtra);
  const extraChapters = chapters.filter(c => c.isExtra);

  // Find resume chapter
  const resumeChapter = progress.chapterId
    ? chapters.find(c => c.id === progress.chapterId)
    : chapters[0];

  const handleRead = () => {
    if (resumeChapter) navigate(`/novel/${novelId}/read/${resumeChapter.id}`);
  };

  const handleDeleteChapter = async () => {
    if (!deleteChapter) return;
    await deleteChapterDB(deleteChapter.id);
    setChapters(prev => prev.filter(c => c.id !== deleteChapter.id));
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

function ChapterRow({ chapter, novelId, isExtra, onDelete }) {
  const navigate = useNavigate();
  return (
    <div className={`${styles.chapterRow} ${isExtra ? styles.chapterExtra : ''}`}>
      <button
        className={styles.chapterBtn}
        onClick={() => navigate(`/novel/${novelId}/read/${chapter.id}`)}
      >
        <span className={styles.chapterTitle}>{chapter.title}</span>
        {isExtra && <span className="badge badge-extra">Ngoại truyện</span>}
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
