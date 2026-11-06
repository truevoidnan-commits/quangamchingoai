import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon, { GlyphIcon } from '../components/ui/Icon';
import { searchChapters, searchAllNovels } from '../lib/db';
import { getLibrary } from '../lib/storage';
import {
  PageShell,
  PageHeader,
  Card,
  TextInput,
  Button,
} from '../components/ui/FormKit';
import styles from './SearchPage.module.css';

function highlightMatch(text, query) {
  if (!query || !query.trim() || !text) return text;
  const q = query.trim();
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className={styles.highlight}>{part}</mark>
    ) : (
      part
    )
  );
}

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
        const chResults = await searchChapters(selectedNovelId, query.trim());
        setResults({ type: 'chapters', data: chResults, novelId: selectedNovelId });
      } else {
        const novelResults = await searchAllNovels(query.trim());
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
    <PageShell backdrop="text">
      <PageHeader
        backLabel="Quay lại"
        title="Tìm Kiếm"
        subtitle="Tra cứu danh mục truyện và trích đoạn chương"
      />

      {/* SEARCH BOX CARD */}
      <Card
        icon="search"
        title="Bộ Lọc & Từ Khóa"
        subtitle="Tìm kiếm theo tiêu đề tác phẩm hoặc quét sâu vào nội dung từng chương"
      >
        <div className={styles.searchCard}>
          <div className={styles.scopeSelectWrap}>
            <select
              value={selectedNovelId}
              onChange={(e) => setSelectedNovelId(e.target.value)}
              className={styles.scopeSelect}
              aria-label="Chọn truyện để tìm kiếm"
            >
              <option value="">Toàn bộ thư viện (Tất cả truyện)</option>
              {library.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.inputRow}>
            <div>
              <TextInput
                id="search-page-input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Nhập tên truyện, tác giả, hoặc từ khóa trong chương..."
                prefixIcon="search"
                autoFocus
              />
            </div>
            <Button
              id="btn-search"
              variant="primary"
              icon="search"
              loading={searching}
              disabled={searching || !query.trim()}
              onClick={handleSearch}
            >
              {searching ? 'Đang tìm...' : 'Tìm'}
            </Button>
          </div>
        </div>
      </Card>

      {/* EMPTY / INITIAL STATE */}
      {results === null && (
        <Card>
          <div className={styles.emptyState}>
            <div className={styles.emptyIconCircle}>
              <GlyphIcon value="sparkles" size={26} />
            </div>
            <h2 className={styles.emptyTitle}>Sẵn Sàng Tra Cứu Toàn Văn</h2>
            <p className={styles.emptyDesc}>
              Nhập từ khóa bất kỳ để quét qua tiêu đề toàn bộ thư viện hoặc lọc riêng từng tác phẩm để tìm kiếm trích đoạn nội dung chương.
            </p>
          </div>
        </Card>
      )}

      {/* RESULTS DISPLAY */}
      {results !== null && (
        <div className={styles.resultsList}>
          <div className={styles.resultsHeader}>
            <span>
              {results.type === 'novels' ? 'Kết quả truyện:' : 'Chương chứa từ khóa:'}{' '}
              <strong>{results.data.length}</strong> kết quả cho "<strong>{query}</strong>"
            </span>
          </div>

          {results.data.length === 0 && (
            <Card>
              <div className={styles.emptyState}>
                <div className={styles.emptyIconCircle}>
                  <GlyphIcon value="info" size={24} />
                </div>
                <h2 className={styles.emptyTitle}>Không Tìm Thấy Kết Quả Phù Hợp</h2>
                <p className={styles.emptyDesc}>
                  Hãy thử kiểm tra lại chính tả hoặc tìm với từ khóa ngắn hơn, khái quát hơn.
                </p>
              </div>
            </Card>
          )}

          {/* NOVELS RESULTS */}
          {results.type === 'novels' &&
            results.data.map((novel) => (
              <div
                key={novel.id}
                className={styles.novelItem}
                onClick={() => navigate(`/novel/${novel.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigate(`/novel/${novel.id}`);
                }}
              >
                {novel.coverThumb || novel.coverUrl ? (
                  <img
                    src={novel.coverThumb || novel.coverUrl}
                    alt={novel.title}
                    className={styles.novelThumb}
                  />
                ) : (
                  <div className={styles.novelThumbPlaceholder}>
                    {novel.title.charAt(0)}
                  </div>
                )}
                <div className={styles.novelDetails}>
                  <h3 className={styles.novelTitle}>
                    {highlightMatch(novel.title, query)}
                  </h3>
                  {novel.description && (
                    <p className={styles.novelDesc}>
                      {highlightMatch(novel.description, query)}
                    </p>
                  )}
                </div>
                <div style={{ color: 'var(--text-muted, #7e9ec0)', flexShrink: 0 }}>
                  <GlyphIcon value="arrow-right" size={16} />
                </div>
              </div>
            ))}

          {/* CHAPTERS RESULTS */}
          {results.type === 'chapters' &&
            results.data.map((ch) => (
              <div
                key={ch.id}
                className={styles.chapterItem}
                onClick={() => navigate(`/novel/${results.novelId}/read/${ch.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigate(`/novel/${results.novelId}/read/${ch.id}`);
                }}
              >
                <h3 className={styles.chapterTitle}>
                  <GlyphIcon value="file-text" size={14} />
                  <span>{highlightMatch(ch.title, query)}</span>
                </h3>
                {ch.snippet && (
                  <p className={styles.snippet}>
                    {highlightMatch(ch.snippet, query)}
                  </p>
                )}
              </div>
            ))}
        </div>
      )}
    </PageShell>
  );
}
