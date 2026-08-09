import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchChapters, searchAllNovels } from '../lib/db';
import { getLibrary } from '../lib/storage';
import styles from './SearchPage.module.css';

export default function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [selectedNovelId, setSelectedNovelId] = useState('');
  const library = getLibrary();

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      if (selectedNovelId) {
        const chResults = await searchChapters(selectedNovelId, query);
        setResults({ type: 'chapters', data: chResults, novelId: selectedNovelId });
      } else {
        const novelResults = await searchAllNovels(query);
        // Also search chapters in all novels (limited)
        setResults({ type: 'novels', data: novelResults });
      }
    } finally {
      setSearching(false);
    }
  }, [query, selectedNovelId]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className="btn-ghost" onClick={() => navigate(-1)}>← Quay lại</button>
        <h1 className={styles.title}>Tìm kiếm</h1>
      </div>

      <div className={styles.searchBox}>
        <select
          value={selectedNovelId}
          onChange={e => setSelectedNovelId(e.target.value)}
          className={styles.select}
          aria-label="Chọn truyện để tìm kiếm"
        >
          <option value="">🔍 Tất cả truyện</option>
          {library.map(n => (
            <option key={n.id} value={n.id}>{n.title}</option>
          ))}
        </select>
        <div className={styles.inputRow}>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nhập từ khóa tìm kiếm..."
            className={styles.input}
            id="search-page-input"
            autoFocus
          />
          <button
            className="btn-primary"
            onClick={handleSearch}
            disabled={searching || !query.trim()}
            id="btn-search"
          >
            {searching ? '⏳' : 'Tìm'}
          </button>
        </div>
      </div>

      {/* Results */}
      {results && (
        <div className={styles.results}>
          {results.type === 'novels' && (
            <>
              <h2 className={styles.resultTitle}>
                {results.data.length} kết quả cho "<em>{query}</em>"
              </h2>
              {results.data.length === 0 && (
                <p className={styles.noResult}>Không tìm thấy truyện nào.</p>
              )}
              {results.data.map(novel => (
                <div
                  key={novel.id}
                  className={styles.novelResult}
                  onClick={() => navigate(`/novel/${novel.id}`)}
                  role="button"
                  tabIndex={0}
                >
                  {novel.coverUrl ? (
                    <img src={novel.coverUrl} alt={novel.title} className={styles.thumb} />
                  ) : (
                    <div className={styles.thumbDefault}>{novel.title.charAt(0)}</div>
                  )}
                  <div className={styles.novelInfo}>
                    <h3 className={styles.novelTitle}>{novel.title}</h3>
                    <p className={styles.novelDesc}>{novel.description?.slice(0, 100)}...</p>
                  </div>
                </div>
              ))}
            </>
          )}

          {results.type === 'chapters' && (
            <>
              <h2 className={styles.resultTitle}>
                {results.data.length} chương chứa "<em>{query}</em>"
              </h2>
              {results.data.length === 0 && (
                <p className={styles.noResult}>Không tìm thấy nội dung nào.</p>
              )}
              {results.data.map(ch => (
                <div
                  key={ch.id}
                  className={styles.chapterResult}
                  onClick={() => navigate(`/novel/${results.novelId}/read/${ch.id}`)}
                  role="button"
                  tabIndex={0}
                >
                  <div className={styles.chapterResultTitle}>{ch.title}</div>
                  {ch.snippet && (
                    <p className={styles.snippet}>{ch.snippet}</p>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
