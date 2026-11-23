import React, { useState, useEffect, useRef } from 'react';
import { countMatchesInNovel, replaceTextInNovel } from '../../lib/db';
import styles from './GlobalReplaceModal.module.css';
import { IconReplace, IconClose, IconCheck, IconSearch, IconAlert, IconTrash } from '../ui/Icon';

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
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(true);
  const [inTitle, setInTitle] = useState(true);

  const [loadingStats, setLoadingStats] = useState(false);
  const [stats, setStats] = useState(null);
  const [isReplacing, setIsReplacing] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const searchInputRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Focus and init when opening
  useEffect(() => {
    if (isOpen) {
      setSearchText(initialSearchText || '');
      setReplaceText('');
      setLastResult(null);
      setShowConfirmModal(false);
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
          wholeWord,
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
  }, [isOpen, novelId, searchText, matchCase, wholeWord, inTitle]);

  if (!isOpen) return null;

  const handleOpenConfirm = () => {
    if (!novelId || !searchText.trim() || !hasMatches) return;
    setShowConfirmModal(true);
  };

  const handleExecuteReplace = async () => {
    if (!novelId || !searchText.trim()) return;
    setShowConfirmModal(false);

    setIsReplacing(true);
    try {
      const res = await replaceTextInNovel(novelId, searchText, replaceText, {
        matchCase,
        wholeWord,
        inTitle,
      });
      setLastResult(res);

      if (onSuccess) {
        onSuccess(res, { searchText, replaceText });
      }

      // Re-scan matches
      const updatedStats = await countMatchesInNovel(novelId, searchText, {
        matchCase,
        wholeWord,
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
      <div
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{ position: 'relative' }}
      >
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
                checked={wholeWord}
                onChange={(e) => setWholeWord(e.target.checked)}
              />
              <span className={styles.customCheck} aria-hidden="true">
                <IconCheck size={11} />
              </span>
              <span>Chỉ khớp từ hoàn chỉnh (nguyên từ)</span>
            </label>

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
              onClick={handleOpenConfirm}
              disabled={isReplacing || !hasMatches}
              id="btn-execute-replace"
            >
              {isPureDelete && <IconTrash size={15} />}
              {!isPureDelete && <IconReplace size={15} />}
              <span>
                {isReplacing
                  ? isPureDelete
                    ? 'Đang xóa...'
                    : 'Đang thay thế...'
                  : isPureDelete
                  ? `Xóa ${matchCount} chỗ`
                  : `Thay thế ${matchCount} chỗ`}
              </span>
            </button>
          </div>
        </div>

        {/* Dedicated Modal Confirmation Dialog */}
        {showConfirmModal && (
          <div className={styles.confirmSubModalOverlay}>
            <div
              className={`${styles.confirmCard} ${
                isPureDelete ? styles.confirmCardWarning : ''
              }`}
            >
              <h4 className={styles.confirmTitle}>
                {isPureDelete ? (
                  <IconTrash size={18} />
                ) : (
                  <IconAlert size={18} />
                )}
                Xác nhận áp dụng cho TOÀN BỘ TRUYỆN
              </h4>

              <div className={styles.confirmDetails}>
                <div className={styles.confirmDetailRow}>
                  <span className={styles.confirmDetailLabel}>Bộ truyện:</span>
                  <span className={styles.confirmDetailValue}>{novelTitle || 'Bộ truyện'}</span>
                </div>
                <div className={styles.confirmDetailRow}>
                  <span className={styles.confirmDetailLabel}>Số chương bị ảnh hưởng:</span>
                  <span className={styles.confirmDetailValue}>
                    {stats?.matchingChapters ?? 0} chương
                  </span>
                </div>
                <div className={styles.confirmDetailRow}>
                  <span className={styles.confirmDetailLabel}>Tổng số lần khớp:</span>
                  <span className={styles.confirmDetailValue}>{matchCount} lần</span>
                </div>
                <div className={styles.confirmDetailRow}>
                  <span className={styles.confirmDetailLabel}>Cụm từ tìm kiếm:</span>
                  <span className={styles.confirmDetailValue}>"{searchText}"</span>
                </div>
                <div className={styles.confirmDetailRow}>
                  <span className={styles.confirmDetailLabel}>Cụm từ thay thế:</span>
                  <span className={styles.confirmDetailValue}>
                    {isPureDelete ? (
                      <em style={{ color: '#f87171' }}>(XÓA BỎ HOÀN TOÀN)</em>
                    ) : (
                      `"${replaceText}"`
                    )}
                  </span>
                </div>
              </div>

              <div className={styles.confirmWarningBox}>
                Cảnh báo: Thao tác này sẽ ghi đè nội dung trên toàn bộ các chương đã lưu trong cơ sở dữ liệu. Thao tác toàn truyện không thể hoàn tác tự động!
              </div>

              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className={styles.confirmBtnBack}
                  onClick={() => setShowConfirmModal(false)}
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  className={
                    isPureDelete ? styles.btnSubmitDelete : styles.btnSubmitReplace
                  }
                  onClick={handleExecuteReplace}
                >
                  {isPureDelete
                    ? 'Xác nhận xóa khỏi toàn bộ truyện'
                    : 'Xác nhận thay thế toàn bộ truyện'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
