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
  const [isUndoing, setIsUndoing] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmSnapshot, setConfirmSnapshot] = useState(null);

  const searchInputRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const activeRequestIdRef = useRef(0);
  const isExecutingRef = useRef(false);
  const confirmedParamsRef = useRef(null);

  // Focus and init when opening
  useEffect(() => {
    if (isOpen) {
      setSearchText(initialSearchText || '');
      setReplaceText('');
      setLastResult(null);
      setShowConfirmModal(false);
      setConfirmSnapshot(null);
      confirmedParamsRef.current = null;
      setIsReplacing(false);
      setIsUndoing(false);
      isExecutingRef.current = false;
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

  // Live count matches across the novel with race condition guard
  useEffect(() => {
    if (!isOpen || !novelId) return;

    if (!searchText.trim()) {
      activeRequestIdRef.current += 1;
      setStats(null);
      setLoadingStats(false);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Immediately disable execution while counting
    setLoadingStats(true);
    const requestId = ++activeRequestIdRef.current;

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const result = await countMatchesInNovel(novelId, searchText, {
          matchCase,
          wholeWord,
          inTitle,
        });
        // Discard result if query conditions changed in the meantime
        if (requestId === activeRequestIdRef.current) {
          setStats(result);
          setLoadingStats(false);
        }
      } catch (err) {
        if (requestId === activeRequestIdRef.current) {
          console.error('Lỗi đếm số lượng xuất hiện toàn truyện:', err);
          setStats(null);
          setLoadingStats(false);
        }
      }
    }, 250);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [isOpen, novelId, searchText, matchCase, wholeWord, inTitle]);

  if (!isOpen) return null;

  // Re-verify matches before opening confirmation dialog
  const handleOpenConfirm = async () => {
    if (!novelId || !searchText.trim() || loadingStats || isReplacing) return;

    setLoadingStats(true);
    try {
      const freshStats = await countMatchesInNovel(novelId, searchText, {
        matchCase,
        wholeWord,
        inTitle,
      });
      setStats(freshStats);
      setLoadingStats(false);

      if (!freshStats || freshStats.matchCount === 0) {
        alert(`Không tìm thấy kết quả phù hợp cho cụm từ "${searchText}" với thiết lập hiện tại.`);
        return;
      }

      // Snapshot parameters at confirmation time
      const snapParams = {
        searchText,
        replaceText,
        matchCase,
        wholeWord,
        inTitle,
        expectedCount: freshStats.matchCount,
        matchingChapters: freshStats.matchingChapters,
        totalChapters: freshStats.totalChapters,
      };
      confirmedParamsRef.current = snapParams;
      setConfirmSnapshot(snapParams);
      setShowConfirmModal(true);
    } catch (err) {
      setLoadingStats(false);
      console.error('Lỗi kiểm tra số lượng trước khi xác nhận:', err);
      alert('Không thể kiểm tra số lượng khớp: ' + (err.message || err));
    }
  };

  // Re-verify matches before write with anti double-submit and parameter drift guard
  const handleExecuteReplace = async () => {
    if (!novelId || !searchText.trim()) return;
    if (isExecutingRef.current || isReplacing) return; // Strict double-submit guard

    const confirmed = confirmedParamsRef.current;
    if (
      !confirmed ||
      confirmed.searchText !== searchText ||
      confirmed.replaceText !== replaceText ||
      confirmed.matchCase !== matchCase ||
      confirmed.wholeWord !== wholeWord ||
      confirmed.inTitle !== inTitle
    ) {
      setShowConfirmModal(false);
      setConfirmSnapshot(null);
      alert('Điều kiện tìm kiếm hoặc nội dung thay thế đã bị thay đổi so với lúc mở xác nhận. Vui lòng mở lại hộp xác nhận với thông tin mới.');
      return;
    }

    isExecutingRef.current = true;
    setIsReplacing(true);

    try {
      // Re-check matches one last time immediately prior to database write
      const preCheckStats = await countMatchesInNovel(novelId, searchText, {
        matchCase,
        wholeWord,
        inTitle,
      });

      if (!preCheckStats || preCheckStats.matchCount === 0) {
        alert('Không tìm thấy vị trí khớp nào để thay thế. Thao tác đã bị hủy.');
        setShowConfirmModal(false);
        setConfirmSnapshot(null);
        return;
      }

      if (preCheckStats.matchCount !== confirmed.expectedCount) {
        setShowConfirmModal(false);
        setConfirmSnapshot(null);
        setStats(preCheckStats);
        alert(`Số lượng kết quả khớp đã thay đổi (từ ${confirmed.expectedCount} thành ${preCheckStats.matchCount}). Vui lòng xác nhận lại với thông tin mới nhất.`);
        return;
      }

      const res = await replaceTextInNovel(novelId, searchText, replaceText, {
        matchCase,
        wholeWord,
        inTitle,
      });

      setShowConfirmModal(false);
      setConfirmSnapshot(null);
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
      isExecutingRef.current = false;
    }
  };

  // Safe undo handler restoring from snapshot with conflict detection
  const handleUndoLastResult = async () => {
    if (!lastResult?.snapshotId || isUndoing) return;
    setIsUndoing(true);
    try {
      const { restoreNovelSnapshot } = await import('../../lib/db');
      const restoreRes = await restoreNovelSnapshot(lastResult.snapshotId);
      setLastResult(null);

      if (onSuccess) {
        onSuccess(
          {
            totalReplacements: 0,
            modifiedChaptersCount: restoreRes.restoredChaptersCount,
            modifiedChapters: restoreRes.restoredChapters,
          },
          { searchText, replaceText }
        );
      }

      // Re-scan matches after restore
      const updatedStats = await countMatchesInNovel(novelId, searchText, {
        matchCase,
        wholeWord,
        inTitle,
      });
      setStats(updatedStats);
      alert(`Đã khôi phục thành công ${restoreRes.restoredChaptersCount} chương về trạng thái ban đầu!`);
    } catch (err) {
      console.error('Lỗi hoàn tác toàn truyện:', err);
      if (err.code === 'SNAPSHOT_CONFLICT' && Array.isArray(err.conflicts)) {
        const conflictDetails = err.conflicts
          .map((c) => `- ${c.title || `Chương ${c.order}`}: ${c.reason}`)
          .join('\n');
        alert(`HOÀN TÁC BỊ HỦY DO XUNG ĐỘT DỮ LIỆU:\n\n${err.message}\n\nDanh sách xung đột:\n${conflictDetails}\n\nBản sao lưu vẫn được bảo toàn an toàn.`);
      } else {
        alert('Không thể hoàn tác: ' + (err.message || err));
      }
    } finally {
      setIsUndoing(false);
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
                  disabled={loadingStats || isReplacing || showConfirmModal}
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
              disabled={loadingStats || isReplacing || showConfirmModal}
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
                  disabled={loadingStats || isReplacing || showConfirmModal}
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
              disabled={loadingStats || isReplacing || showConfirmModal}
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
                disabled={loadingStats || isReplacing || showConfirmModal}
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
                disabled={loadingStats || isReplacing || showConfirmModal}
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
                disabled={loadingStats || isReplacing || showConfirmModal}
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

          {/* Báo cáo sau khi thay thế thành công kèm nút Hoàn tác an toàn */}
          {lastResult && (
            <div className={styles.resultBoxSuccess}>
              <strong>Hoàn tất cập nhật toàn bộ!</strong>
              <div style={{ marginTop: 4, fontSize: '12.5px' }}>
                Đã cập nhật <strong>{lastResult.totalReplacements}</strong> vị trí tại{' '}
                <strong>{lastResult.modifiedChaptersCount}</strong> chương của truyện.
              </div>
              {lastResult.snapshotId && (
                <div>
                  <button
                    type="button"
                    className={styles.btnUndoNovel}
                    onClick={handleUndoLastResult}
                    disabled={isUndoing}
                    title="Khôi phục nguyên bản các chương từ bản sao lưu an toàn"
                  >
                    <IconReplace size={14} />
                    <span>{isUndoing ? 'Đang khôi phục...' : 'Hoàn tác thay thế này (Khôi phục toàn bộ)'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.btnCancel}
            onClick={onClose}
            disabled={isReplacing || isUndoing}
          >
            Đóng
          </button>

          <div className={styles.rightActions}>
            <button
              type="button"
              className={isPureDelete ? styles.btnSubmitDelete : styles.btnSubmitReplace}
              onClick={handleOpenConfirm}
              disabled={isReplacing || loadingStats || !hasMatches || isUndoing}
              id="btn-execute-replace"
            >
              {isPureDelete && <IconTrash size={15} />}
              {!isPureDelete && <IconReplace size={15} />}
              <span>
                {isReplacing
                  ? isPureDelete
                    ? 'Đang xóa...'
                    : 'Đang thay thế...'
                  : loadingStats
                  ? 'Đang kiểm tra...'
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
                    {confirmSnapshot?.matchingChapters ?? stats?.matchingChapters ?? 0} chương
                  </span>
                </div>
                <div className={styles.confirmDetailRow}>
                  <span className={styles.confirmDetailLabel}>Tổng số lần khớp:</span>
                  <span className={styles.confirmDetailValue}>
                    {confirmSnapshot?.expectedCount ?? matchCount} lần
                  </span>
                </div>
                <div className={styles.confirmDetailRow}>
                  <span className={styles.confirmDetailLabel}>Cụm từ tìm kiếm:</span>
                  <span className={styles.confirmDetailValue}>"{confirmSnapshot?.searchText ?? searchText}"</span>
                </div>
                <div className={styles.confirmDetailRow}>
                  <span className={styles.confirmDetailLabel}>Cụm từ thay thế:</span>
                  <span className={styles.confirmDetailValue}>
                    {!(confirmSnapshot ? confirmSnapshot.replaceText : replaceText) ? (
                      <em style={{ color: '#f87171' }}>(XÓA BỎ HOÀN TOÀN)</em>
                    ) : (
                      `"${confirmSnapshot?.replaceText ?? replaceText}"`
                    )}
                  </span>
                </div>
              </div>

              <div className={styles.confirmWarningBox}>
                Bảo vệ dữ liệu: Hệ thống sẽ tự động tạo một bản sao lưu an toàn (snapshot) trước khi ghi. Bạn có thể bấm "Hoàn tác" để khôi phục lại bất cứ lúc nào.
              </div>

              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className={styles.confirmBtnBack}
                  onClick={() => {
                    setShowConfirmModal(false);
                    setConfirmSnapshot(null);
                  }}
                  disabled={isReplacing}
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  className={
                    isPureDelete ? styles.btnSubmitDelete : styles.btnSubmitReplace
                  }
                  onClick={handleExecuteReplace}
                  disabled={isReplacing}
                >
                  {isReplacing
                    ? 'Đang thực hiện...'
                    : isPureDelete
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
