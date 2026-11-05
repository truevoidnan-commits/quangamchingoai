import React, { useState, useEffect, useRef } from 'react';
import { countMatchesInNovel, replaceTextInNovel } from '../../lib/db';
import styles from './GlobalReplaceModal.module.css';

function IconReplace({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4h6v6" />
      <path d="M4 20h6v-6" />
      <path d="M20 4l-7 7" />
      <path d="M4 20l7-7" />
    </svg>
  );
}

function IconClose({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconCheck({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconSearch({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconAlert({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function IconTrash({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

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
  const isPureDelete = !replaceText;
  const matchCount = stats ? stats.matchCount : 0;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleWrap}>
            <div className={styles.modalIcon} aria-hidden="true">
              <IconReplace size={18} />
            </div>
            <div>
              <h3 className={styles.modalTitle}>Tìm & Thay Thế Toàn Bộ Truyện</h3>
              {novelTitle && (
                <div className={styles.novelBadge}>
                  Áp dụng cho: <span className={styles.novelName}>{novelTitle}</span>
                </div>
              )}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Đóng" aria-label="Đóng">
            <IconClose size={15} />
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
                  Xóa
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
                  Xóa
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
              <span className={styles.customCheck} aria-hidden="true">
                <IconCheck size={11} />
              </span>
              <span>Phân biệt chữ hoa / chữ thường</span>
            </label>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                className={styles.checkboxInput}
                checked={inTitle}
                onChange={(e) => setInTitle(e.target.checked)}
              />
              <span className={styles.customCheck} aria-hidden="true">
                <IconCheck size={11} />
              </span>
              <span>Áp dụng cho cả tiêu đề chương</span>
            </label>
          </div>

          {/* Thống kê số lượng khớp */}
          {searchText.trim() && (
            <div>
              {loadingStats ? (
                <div className={`${styles.statBox} ${styles.statBoxLoading}`}>
                  <span className={styles.statIcon} aria-hidden="true">
                    <IconSearch size={16} />
                  </span>
                  <span>Đang quét toàn bộ các chương trong truyện...</span>
                </div>
              ) : hasMatches ? (
                <div className={`${styles.statBox} ${styles.statBoxFound}`}>
                  <span className={styles.statIcon} aria-hidden="true">
                    <IconCheck size={16} />
                  </span>
                  <div>
                    Tìm thấy <strong>{stats.matchCount}</strong> lần xuất hiện trong{' '}
                    <strong>{stats.matchingChapters}</strong> / {stats.totalChapters} chương của truyện.
                  </div>
                </div>
              ) : (
                <div className={`${styles.statBox} ${styles.statBoxNone}`}>
                  <span className={styles.statIcon} aria-hidden="true">
                    <IconAlert size={16} />
                  </span>
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
              <strong>Hoàn tất cập nhật toàn bộ!</strong>
              <div style={{ marginTop: 4, fontSize: '12.5px' }}>
                Đã cập nhật <strong>{lastResult.totalReplacements}</strong> vị trí tại{' '}
                <strong>{lastResult.modifiedChaptersCount}</strong> chương của truyện.
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.btnCancel}
            onClick={onClose}
            disabled={isReplacing}
          >
            Đóng
          </button>

          <div className={styles.rightActions}>
            <button
              type="button"
              className={isPureDelete ? styles.btnSubmitDelete : styles.btnSubmitReplace}
              onClick={handleExecuteReplace}
              disabled={isReplacing || !hasMatches}
              id="btn-execute-replace"
            >
              {isPureDelete && <IconTrash size={15} />}
              {!isPureDelete && <IconReplace size={15} />}
              <span>
                {isReplacing
                  ? (isPureDelete ? 'Đang xóa...' : 'Đang thay thế...')
                  : (isPureDelete
                      ? `Xóa ${matchCount} chỗ`
                      : `Thay thế ${matchCount} chỗ`
                    )
                }
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
