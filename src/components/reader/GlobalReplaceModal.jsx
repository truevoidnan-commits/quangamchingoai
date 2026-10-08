import React, { useState, useEffect, useRef } from 'react';
import { countMatchesInNovel, replaceTextInNovel } from '../../lib/db';
import styles from './SelectionEditor.module.css';

export default function GlobalReplaceModal({
  isOpen,
  onClose,
  novelId,
  novelTitle = '',
  initialSearchText = '',
  onSuccess,
}) {
  const [searchText, setSearchText] = useState(initialSearchText || '');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(true);
  const [inTitle, setInTitle] = useState(true);

  const [loadingStats, setLoadingStats] = useState(false);
  const [stats, setStats] = useState(null);
  const [isReplacing, setIsReplacing] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const searchInputRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Focus and init when opening
  useEffect(() => {
    if (isOpen) {
      setSearchText(initialSearchText || '');
      setReplaceText('');
      setLastResult(null);
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
          if (initialSearchText) {
            searchInputRef.current.select();
          }
        }
      }, 70);
    }
  }, [isOpen, initialSearchText]);

  // Live count matches across the novel
  useEffect(() => {
    if (!isOpen || !novelId) return;

    if (!searchText.trim()) {
      setStats(null);
      setLoadingStats(false);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setLoadingStats(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const result = await countMatchesInNovel(novelId, searchText, {
          matchCase,
          inTitle,
        });
        setStats(result);
      } catch (err) {
        console.error('Lỗi đếm số lượng xuất hiện toàn truyện:', err);
        setStats(null);
      } finally {
        setLoadingStats(false);
      }
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isOpen, novelId, searchText, matchCase, inTitle]);

  if (!isOpen) return null;

  const handleExecuteReplace = async () => {
    if (!novelId || !searchText.trim()) return;

    const count = stats?.matchCount || 0;
    const isDelete = !replaceText;
    const confirmMsg = isDelete
      ? `Bạn có chắc chắn muốn XÓA HẲN cụm từ "${searchText}" khỏi toàn bộ ${stats?.matchingChapters || ''} chương (${count} vị trí) trong truyện?`
      : `Bạn có chắc chắn muốn thay thế cụm từ "${searchText}" thành "${replaceText}" trong toàn bộ truyện (${count} vị trí)?`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    setIsReplacing(true);
    try {
      const res = await replaceTextInNovel(novelId, searchText, replaceText, {
        matchCase,
        inTitle,
      });
      setLastResult(res);

      if (onSuccess) {
        onSuccess(res, { searchText, replaceText });
      }

      // Re-scan matches
      const updatedStats = await countMatchesInNovel(novelId, searchText, {
        matchCase,
        inTitle,
      });
      setStats(updatedStats);
    } catch (err) {
      console.error('Lỗi thực hiện thay thế toàn truyện:', err);
      alert('Không thể thực hiện thay thế: ' + (err.message || err));
    } finally {
      setIsReplacing(false);
    }
  };

  const hasMatches = stats && stats.matchCount > 0;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleWrap}>
            <span className={styles.modalIcon}>🔁</span>
            <div>
              <h3 className={styles.modalTitle}>Tìm & Thay Thế Toàn Bộ Truyện</h3>
              {novelTitle && (
                <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                  Áp dụng cho: <span style={{ color: '#38bdf8' }}>{novelTitle}</span>
                </div>
              )}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Đóng">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {/* Cụm từ cần tìm */}
          <div className={styles.inputGroup}>
            <div className={styles.inputHeaderRow}>
              <label className={styles.inputLabel} htmlFor="global-search-text">
                Cụm từ cần tìm kiếm:
              </label>
              {searchText && (
                <button
                  type="button"
                  className={styles.toolMiniBtn}
                  onClick={() => setSearchText('')}
                >
                  ⌫ Xóa
                </button>
              )}
            </div>
            <input
              id="global-search-text"
              ref={searchInputRef}
              type="text"
              className={styles.textInput}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Nhập từ hoặc cụm từ cần tìm trong toàn bộ truyện..."
            />
          </div>

          {/* Cụm từ thay thế */}
          <div className={styles.inputGroup}>
            <div className={styles.inputHeaderRow}>
              <label className={styles.inputLabel} htmlFor="global-replace-text">
                Thay thế bằng (để trống nếu muốn XÓA HẲN cụm từ):
              </label>
              {replaceText && (
                <button
                  type="button"
                  className={styles.toolMiniBtn}
                  onClick={() => setReplaceText('')}
                >
                  ⌫ Xóa
                </button>
              )}
            </div>
            <input
              id="global-replace-text"
              type="text"
              className={styles.textInput}
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Nhập cụm từ mới (hoặc để trống để xóa hoàn toàn)..."
            />
          </div>

          {/* Tùy chọn tìm kiếm */}
          <div className={styles.checkboxRow}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                className={styles.checkboxInput}
                checked={matchCase}
                onChange={(e) => setMatchCase(e.target.checked)}
              />
              <span>Phân biệt chữ hoa / chữ thường</span>
            </label>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                className={styles.checkboxInput}
                checked={inTitle}
                onChange={(e) => setInTitle(e.target.checked)}
              />
              <span>Áp dụng cho cả tiêu đề chương</span>
            </label>
          </div>

          {/* Thống kê số lượng khớp */}
          {searchText.trim() && (
            <div>
              {loadingStats ? (
                <div className={`${styles.statBox} ${styles.statBoxLoading}`}>
                  <span>⏳ Đang quét toàn bộ các chương trong truyện...</span>
                </div>
              ) : hasMatches ? (
                <div className={`${styles.statBox} ${styles.statBoxFound}`}>
                  <span>🎯</span>
                  <div>
                    Tìm thấy <strong>{stats.matchCount}</strong> lần xuất hiện trong{' '}
                    <strong>{stats.matchingChapters}</strong> / {stats.totalChapters} chương của truyện.
                  </div>
                </div>
              ) : (
                <div className={`${styles.statBox} ${styles.statBoxNone}`}>
                  <span>⚠️</span>
                  <div>
                    Không tìm thấy cụm từ "{searchText}" trong bất kỳ chương nào của truyện.
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Báo cáo sau khi thay thế thành công */}
          {lastResult && (
            <div className={styles.resultBoxSuccess}>
              🎉 <strong>Hoàn tất thay thế toàn bộ!</strong>
              <div style={{ marginTop: 4, fontSize: '12.5px' }}>
                Đã cập nhật <strong>{lastResult.totalReplacements}</strong> vị trí tại{' '}
                <strong>{lastResult.modifiedChaptersCount}</strong> chương của truyện.
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className={styles.modalActions}>
          <div className={styles.leftActions}>
            <button
              type="button"
              className={styles.btnCancel}
              onClick={onClose}
              disabled={isReplacing}
            >
              Đóng
            </button>
          </div>

          <div className={styles.rightActions}>
            {hasMatches && !replaceText && (
              <button
                type="button"
                className={styles.btnDeleteDirect}
                onClick={handleExecuteReplace}
                disabled={isReplacing}
              >
                {isReplacing ? '⏳ Đang xóa...' : `🗑️ Xóa cụm từ toàn truyện (${stats.matchCount})`}
              </button>
            )}

            <button
              type="button"
              className={styles.btnSave}
              onClick={handleExecuteReplace}
              disabled={isReplacing || !hasMatches}
              style={{
                opacity: (!hasMatches || isReplacing) ? 0.5 : 1,
                cursor: (!hasMatches || isReplacing) ? 'not-allowed' : 'pointer',
              }}
            >
              {isReplacing
                ? '⏳ Đang thay thế...'
                : (replaceText
                    ? `🔁 Thay thế toàn bộ (${stats ? stats.matchCount : 0} chỗ)`
                    : `🗑️ Xóa rỗng toàn bộ (${stats ? stats.matchCount : 0} chỗ)`
                  )
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
