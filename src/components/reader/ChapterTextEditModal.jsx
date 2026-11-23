import Icon from '../ui/Icon';
import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { countMatchesInNovel } from '../../lib/db';
import { toTitleCaseVi } from '../../lib/textFixer';
import styles from './SelectionEditor.module.css';

export default function ChapterTextEditModal({
  isOpen,
  targetData,
  initialScope = 'single',
  novelId,
  novelTitle = '',
  onSave,
  onDelete,
  onClose,
}) {
  const [newText, setNewText] = useState('');
  const [scope, setScope] = useState('single');
  const [snapshotOriginal, setSnapshotOriginal] = useState('');
  const [novelStats, setNovelStats] = useState(null);
  const [loadingNovelStats, setLoadingNovelStats] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // null | { type: 'save' | 'delete', scope: 'all' | 'novel' }

  const textareaRef = useRef(null);
  const caretStateRef = useRef({
    start: 0,
    end: 0,
    direction: 'none',
    needsRestore: false,
  });
  const isComposingRef = useRef(false);

  const selectedText = snapshotOriginal || targetData?.selectedText || '';
  const matchCount = targetData?.matchCount || 1;
  const startParaIndex = targetData?.startParaIndex;
  const isTitle = targetData?.isTitle || false;

  // Query novel-wide occurrences when open
  useEffect(() => {
    if (isOpen && targetData?.selectedText && novelId) {
      let cancelled = false;
      setLoadingNovelStats(true);
      countMatchesInNovel(novelId, targetData.selectedText, { matchCase: false, wholeWord: true })
        .then((stats) => {
          if (!cancelled) {
            setNovelStats(stats);
            setLoadingNovelStats(false);
          }
        })
        .catch((err) => {
          console.error('Lỗi kiểm tra số lượng khớp toàn truyện:', err);
          if (!cancelled) setLoadingNovelStats(false);
        });

      return () => {
        cancelled = true;
      };
    } else {
      setNovelStats(null);
    }
  }, [isOpen, targetData?.selectedText, novelId]);

  // Initialize only once upon opening the modal
  useEffect(() => {
    if (isOpen && targetData) {
      const orig = targetData.selectedText || '';
      setSnapshotOriginal(orig);
      setNewText(orig);
      setScope('single');
      setConfirmAction(null);
      isComposingRef.current = false;
      caretStateRef.current = {
        start: orig.length,
        end: orig.length,
        direction: 'none',
        needsRestore: false,
      };

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          // Only select text on desktop; on mobile, select() causes tap-to-erase glitches
          if (typeof window !== 'undefined' && window.innerWidth > 768) {
            textareaRef.current.select();
            caretStateRef.current = {
              start: 0,
              end: orig.length,
              direction: 'forward',
              needsRestore: false,
            };
          }
        }
      }, 70);
    }
  }, [isOpen]);

  // Caret & selection range tracking:
  // Only restore programmatically when needed (e.g. quick tool transformations).
  // Never disrupt Vietnamese IME composition.
  useLayoutEffect(() => {
    if (!textareaRef.current) return;
    if (isComposingRef.current) return; // Do not touch DOM selection while IME is composing

    if (caretStateRef.current.needsRestore) {
      const len = textareaRef.current.value.length;
      const start = Math.min(Math.max(0, caretStateRef.current.start), len);
      const end = Math.min(Math.max(0, caretStateRef.current.end), len);
      const direction = caretStateRef.current.direction || 'none';
      try {
        textareaRef.current.setSelectionRange(start, end, direction);
      } catch (e) {}
      caretStateRef.current.needsRestore = false;
    }
  }, [newText]);

  // Handle keyboard shortcuts (Escape, Ctrl+Enter)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (confirmAction) {
          setConfirmAction(null);
        } else {
          onClose();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (confirmAction) {
          handleExecuteConfirm();
        } else {
          handleSaveClick();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, newText, scope, confirmAction]);

  if (!isOpen) return null;

  // Track selection changes made by mouse, keyboard arrows, or tap
  const syncCaretState = () => {
    if (textareaRef.current && !isComposingRef.current) {
      caretStateRef.current = {
        start: textareaRef.current.selectionStart,
        end: textareaRef.current.selectionEnd,
        direction: textareaRef.current.selectionDirection,
        needsRestore: false,
      };
    }
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = (e) => {
    isComposingRef.current = false;
    if (textareaRef.current) {
      caretStateRef.current = {
        start: textareaRef.current.selectionStart,
        end: textareaRef.current.selectionEnd,
        direction: textareaRef.current.selectionDirection,
        needsRestore: false,
      };
    }
  };

  const handleTextChange = (e) => {
    // Ordinary typing manages its own caret natively.
    caretStateRef.current = {
      start: e.target.selectionStart,
      end: e.target.selectionEnd,
      direction: e.target.selectionDirection,
      needsRestore: false,
    };
    setNewText(e.target.value);
  };

  const handleSaveClick = () => {
    if (scope === 'novel') {
      setConfirmAction({ type: 'save', scope: 'novel' });
    } else if (scope === 'all' && matchCount > 1) {
      setConfirmAction({ type: 'save', scope: 'all' });
    } else {
      onSave({
        newText,
        scope: 'single',
      });
    }
  };

  const handleDeleteClick = () => {
    if (scope === 'novel') {
      setConfirmAction({ type: 'delete', scope: 'novel' });
    } else if (scope === 'all' && matchCount > 1) {
      setConfirmAction({ type: 'delete', scope: 'all' });
    } else {
      onDelete({
        scope: 'single',
      });
    }
  };

  const handleExecuteConfirm = () => {
    if (!confirmAction) return;
    const { type, scope: confirmScope } = confirmAction;
    setConfirmAction(null);
    if (type === 'delete') {
      onDelete({ scope: confirmScope });
    } else {
      onSave({ newText, scope: confirmScope });
    }
  };

  // Quick formatting helper that preserves active selection range or cursor index
  const applyTextTransformation = (transformFn) => {
    if (!textareaRef.current) return;
    const { selectionStart, selectionEnd, selectionDirection } = textareaRef.current;

    if (selectionStart !== selectionEnd) {
      // User has selected a substring inside textarea
      const before = newText.slice(0, selectionStart);
      const selected = newText.slice(selectionStart, selectionEnd);
      const after = newText.slice(selectionEnd);
      const transformedPart = transformFn(selected);
      const nextText = before + transformedPart + after;

      caretStateRef.current = {
        start: selectionStart,
        end: selectionStart + transformedPart.length,
        direction: selectionDirection,
        needsRestore: true,
      };
      setNewText(nextText);
    } else {
      // Entire text transformation, preserving cursor position
      const transformed = transformFn(newText);
      caretStateRef.current = {
        start: selectionStart,
        end: selectionEnd,
        direction: selectionDirection,
        needsRestore: true,
      };
      setNewText(transformed);
    }
  };

  const handleClear = () => {
    caretStateRef.current = { start: 0, end: 0, direction: 'none', needsRestore: true };
    setNewText('');
  };

  const handleReset = () => {
    caretStateRef.current = {
      start: selectedText.length,
      end: selectedText.length,
      direction: 'none',
      needsRestore: true,
    };
    setNewText(selectedText);
  };

  const handleCapitalize = () => {
    applyTextTransformation((txt) => {
      if (!txt) return '';
      return txt.charAt(0).toUpperCase() + txt.slice(1);
    });
  };

  const handleTitleCase = () => {
    applyTextTransformation(toTitleCaseVi);
  };

  const handleUppercase = () => {
    applyTextTransformation((txt) => txt.toUpperCase());
  };

  const handleLowercase = () => {
    applyTextTransformation((txt) => txt.toLowerCase());
  };

  const wordCount = selectedText.trim() ? selectedText.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'relative' }}
      >
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleWrap}>
            <Icon name="edit" size={18} className={styles.modalIcon} />
            <h3 className={styles.modalTitle}>Chỉnh Sửa Văn Bản Chương</h3>
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Đóng (Esc)">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={styles.modalBody}>
          {/* Original preview */}
          <div className={styles.previewSection}>
            <div className={styles.previewLabel}>
              <span>Đoạn chữ gốc đang chọn:</span>
              <span className={styles.previewBadge}>
                {selectedText.length} ký tự · {wordCount} từ
              </span>
            </div>
            <div className={styles.originalTextQuote}>
              "{selectedText}"
            </div>
          </div>

          {/* New text area */}
          <div className={styles.editSection}>
            <div className={styles.textareaHeader}>
              <div className={styles.previewLabel}>
                <span>Nội dung thay thế / chỉnh sửa:</span>
              </div>
              <div className={styles.textareaQuickTools}>
                <button
                  type="button"
                  className={styles.toolMiniBtn}
                  onClick={handleClear}
                  title="Xóa trắng nội dung"
                >
                  ⌫ Xóa
                </button>
                <button
                  type="button"
                  className={styles.toolMiniBtn}
                  onClick={handleReset}
                  title="Khôi phục nguyên bản"
                >
                  <Icon name="refresh" size={14} /> Đặt lại
                </button>
                <button
                  type="button"
                  className={styles.toolMiniBtn}
                  onClick={handleCapitalize}
                  title="Viết hoa chữ cái đầu"
                >
                  aA
                </button>
                <button
                  type="button"
                  className={styles.toolMiniBtn}
                  onClick={handleTitleCase}
                  title="Viết Hoa Chữ Cái Đầu Mỗi Từ"
                >
                  Aa Aa
                </button>
                <button
                  type="button"
                  className={styles.toolMiniBtn}
                  onClick={handleUppercase}
                  title="VIẾT HOA TOÀN BỘ"
                >
                  AA
                </button>
                <button
                  type="button"
                  className={styles.toolMiniBtn}
                  onClick={handleLowercase}
                  title="viết thường toàn bộ"
                >
                  aa
                </button>
              </div>
            </div>

            <textarea
              ref={textareaRef}
              className={styles.editTextarea}
              value={newText}
              onChange={handleTextChange}
              onSelect={syncCaretState}
              onKeyUp={syncCaretState}
              onMouseUp={syncCaretState}
              onTouchEnd={syncCaretState}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              placeholder="Nhập nội dung mới cần sửa hoặc thay..."
              rows={3}
            />
          </div>

          {/* Scope Selection as separate, isolated cards */}
          <div className={styles.scopeSection}>
            <div className={styles.scopeLabel}>Phạm vi áp dụng thay đổi:</div>

            {/* Option 1: Single Selection */}
            <div
              className={`${styles.scopeOptionCard} ${scope === 'single' ? styles.scopeOptionCardActive : ''}`}
              onClick={() => setScope('single')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') setScope('single');
              }}
            >
              <div className={styles.scopeRadioIndicator}>
                {scope === 'single' && <span className={styles.scopeRadioDot} />}
              </div>
              <div className={styles.scopeCardContent}>
                <div className={styles.scopeCardTitle}>Chỉ đoạn bôi đen này</div>
                <div className={styles.scopeCardDesc}>
                  {isTitle
                    ? 'ở tiêu đề chương'
                    : `vị trí trong đoạn #${(startParaIndex !== null && startParaIndex !== undefined ? startParaIndex : 0) + 1}`}
                </div>
              </div>
            </div>

            {/* Option 2: All in Chapter */}
            {matchCount > 1 && (
              <div
                className={`${styles.scopeOptionCard} ${scope === 'all' ? styles.scopeOptionCardActive : ''}`}
                onClick={() => setScope('all')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') setScope('all');
                }}
              >
                <div className={styles.scopeRadioIndicator}>
                  {scope === 'all' && <span className={styles.scopeRadioDot} />}
                </div>
                <div className={styles.scopeCardContent}>
                  <div className={styles.scopeCardTitle}>
                    Thay thế toàn bộ trong chương này
                    <span className={styles.scopeHighlightCount}> ({matchCount} lần xuất hiện)</span>
                  </div>
                  <div className={styles.scopeCardDesc}>
                    Chỉ áp dụng trong nội dung chương hiện tại
                  </div>
                </div>
              </div>
            )}

            {/* Option 3: Novel-wide */}
            {novelId && (
              <div
                className={`${styles.scopeOptionCard} ${styles.scopeOptionNovel} ${
                  scope === 'novel' ? styles.scopeOptionNovelActive : ''
                }`}
                onClick={() => setScope('novel')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') setScope('novel');
                }}
              >
                <div className={styles.scopeRadioIndicator}>
                  {scope === 'novel' && <span className={styles.scopeRadioDotNovel} />}
                </div>
                <div className={styles.scopeCardContent}>
                  <div className={styles.scopeCardTitleNovel}>
                    Thay thế trong TOÀN BỘ TRUYỆN
                    {loadingNovelStats ? (
                      <span className={styles.scopeLoadingText}> (Đang quét...)</span>
                    ) : novelStats ? (
                      <span className={styles.scopeHighlightCountGold}>
                        {' '}({novelStats.matchCount} lần trong {novelStats.matchingChapters} chương)
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.scopeCardDescWarning}>
                    Cần xác nhận bổ sung trước khi lưu. Sẽ cập nhật toàn bộ các chương trong cơ sở dữ liệu.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className={styles.modalActions}>
          <div className={styles.leftActions}>
            <button
              type="button"
              className={styles.btnDeleteDirect}
              onClick={handleDeleteClick}
              title={
                scope === 'novel'
                  ? 'Xóa cụm từ này khỏi toàn bộ các chương trong truyện'
                  : 'Xóa hẳn đoạn này'
              }
            >
              <Icon name="trash" size={14} />{' '}
              {scope === 'novel'
                ? 'Xóa khỏi TOÀN BỘ TRUYỆN'
                : scope === 'all'
                ? 'Xóa toàn bộ trong chương'
                : 'Xóa hẳn đoạn này'}
            </button>
          </div>

          <div className={styles.rightActions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>
              Hủy
            </button>
            <button
              type="button"
              className={`${styles.btnSave} ${scope === 'novel' ? styles.btnNovelScope : ''}`}
              onClick={handleSaveClick}
              title="Lưu thay đổi (Ctrl + Enter)"
            >
              <Icon name="save" size={14} />{' '}
              {newText === ''
                ? scope === 'novel'
                  ? 'Xác nhận Xóa toàn bộ truyện'
                  : scope === 'all'
                  ? 'Xác nhận Xóa toàn chương'
                  : 'Lưu (Xóa rỗng)'
                : scope === 'novel'
                ? 'Thay thế TOÀN BỘ TRUYỆN'
                : scope === 'all'
                ? 'Thay thế toàn chương'
                : 'Lưu Thay Đổi'}
            </button>
          </div>
        </div>

        {/* Dedicated Confirmation Sub-Modal for Scope All and Novel */}
        {confirmAction && (
          <div className={styles.confirmSubModalOverlay}>
            <div
              className={`${styles.confirmCard} ${
                confirmAction.type === 'delete' || confirmAction.scope === 'novel'
                  ? styles.confirmCardWarning
                  : ''
              }`}
            >
              <h4 className={styles.confirmTitle}>
                <Icon
                  name={confirmAction.type === 'delete' ? 'trash' : 'alert'}
                  size={18}
                />
                {confirmAction.scope === 'novel'
                  ? 'Xác nhận áp dụng cho TOÀN BỘ TRUYỆN'
                  : 'Xác nhận áp dụng cho TOÀN BỘ CHƯƠNG'}
              </h4>

              <div className={styles.confirmDetails}>
                {confirmAction.scope === 'novel' && (
                  <>
                    <div className={styles.confirmDetailRow}>
                      <span className={styles.confirmDetailLabel}>Bộ truyện:</span>
                      <span className={styles.confirmDetailValue}>{novelTitle || 'Bộ truyện'}</span>
                    </div>
                    <div className={styles.confirmDetailRow}>
                      <span className={styles.confirmDetailLabel}>Số chương bị ảnh hưởng:</span>
                      <span className={styles.confirmDetailValue}>
                        {novelStats?.matchingChapters ?? 0} chương
                      </span>
                    </div>
                    <div className={styles.confirmDetailRow}>
                      <span className={styles.confirmDetailLabel}>Tổng số lần khớp:</span>
                      <span className={styles.confirmDetailValue}>
                        {novelStats?.matchCount ?? 0} lần
                      </span>
                    </div>
                  </>
                )}

                {confirmAction.scope === 'all' && (
                  <div className={styles.confirmDetailRow}>
                    <span className={styles.confirmDetailLabel}>Số lần thay thế trong chương:</span>
                    <span className={styles.confirmDetailValue}>{matchCount} lần</span>
                  </div>
                )}

                <div className={styles.confirmDetailRow}>
                  <span className={styles.confirmDetailLabel}>Cụm từ tìm kiếm:</span>
                  <span className={styles.confirmDetailValue}>"{selectedText}"</span>
                </div>

                <div className={styles.confirmDetailRow}>
                  <span className={styles.confirmDetailLabel}>Nội dung thay thế:</span>
                  <span className={styles.confirmDetailValue}>
                    {confirmAction.type === 'delete' || !newText ? (
                      <em style={{ color: '#f87171' }}>(XÓA BỎ HOÀN TOÀN)</em>
                    ) : (
                      `"${newText}"`
                    )}
                  </span>
                </div>
              </div>

              <div className={styles.confirmWarningBox}>
                {confirmAction.scope === 'novel'
                  ? 'Bảo vệ dữ liệu: Hệ thống sẽ tự động tạo một bản sao lưu an toàn (snapshot) trước khi ghi. Bạn có thể bấm "Hoàn tác" ở thông báo sau khi lưu để phục hồi nguyên bản các chương.'
                  : 'Thao tác sẽ thay thế toàn bộ các lần xuất hiện của cụm từ này trong chương hiện tại.'}
              </div>

              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className={styles.confirmBtnBack}
                  onClick={() => setConfirmAction(null)}
                >
                  Quay lại
                </button>
                <button
                  type="button"
                  className={
                    confirmAction.type === 'delete'
                      ? styles.confirmBtnConfirmDelete
                      : styles.confirmBtnConfirmSave
                  }
                  onClick={handleExecuteConfirm}
                >
                  {confirmAction.type === 'delete'
                    ? confirmAction.scope === 'novel'
                      ? 'Xác nhận xóa khỏi toàn bộ truyện'
                      : 'Xác nhận xóa toàn bộ trong chương'
                    : confirmAction.scope === 'novel'
                    ? 'Xác nhận thay thế toàn bộ truyện'
                    : 'Xác nhận thay thế trong chương'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
