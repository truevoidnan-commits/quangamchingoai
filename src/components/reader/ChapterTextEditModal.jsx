import React, { useState, useEffect, useRef } from 'react';
import { countMatchesInNovel } from '../../lib/db';
import styles from './SelectionEditor.module.css';

export default function ChapterTextEditModal({
  isOpen,
  targetData,
  initialScope = 'single',
  novelId,
  onSave,
  onDelete,
  onClose,
}) {
  const [newText, setNewText] = useState('');
  const [scope, setScope] = useState(initialScope);
  const [snapshotOriginal, setSnapshotOriginal] = useState('');
  const [novelStats, setNovelStats] = useState(null);
  const [loadingNovelStats, setLoadingNovelStats] = useState(false);
  const textareaRef = useRef(null);

  const selectedText = snapshotOriginal || targetData?.selectedText || '';
  const matchCount = targetData?.matchCount || 1;
  const startParaIndex = targetData?.startParaIndex;
  const isTitle = targetData?.isTitle || false;

  // Query novel-wide occurrences when open
  useEffect(() => {
    if (isOpen && targetData?.selectedText && novelId) {
      let cancelled = false;
      setLoadingNovelStats(true);
      countMatchesInNovel(novelId, targetData.selectedText)
        .then(stats => {
          if (!cancelled) {
            setNovelStats(stats);
            setLoadingNovelStats(false);
          }
        })
        .catch(err => {
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
      setScope(initialScope);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          // Only select all text on desktop; on mobile, select() causes tap-to-erase glitches
          if (typeof window !== 'undefined' && window.innerWidth > 768) {
            textareaRef.current.select();
          }
        }
      }, 70);
    }
  }, [isOpen]);

  // Handle keyboard shortcuts (Escape, Ctrl+Enter)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, newText, scope]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      newText,
      scope,
    });
  };

  const handleDelete = () => {
    onDelete({
      scope,
    });
  };

  // Quick text formatting helpers
  const handleClear = () => setNewText('');
  const handleReset = () => setNewText(selectedText);
  const handleCapitalize = () => {
    if (!newText) return;
    setNewText(newText.charAt(0).toUpperCase() + newText.slice(1));
  };
  const handleUppercase = () => setNewText(newText.toUpperCase());
  const handleLowercase = () => setNewText(newText.toLowerCase());

  const wordCount = selectedText.trim() ? selectedText.trim().split(/\s+/).filter(Boolean).length : 0;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleWrap}>
            <span className={styles.modalIcon}>✏️</span>
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
                  🔄 Đặt lại
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
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Nhập nội dung mới cần sửa hoặc thay..."
              rows={3}
            />
          </div>

          {/* Scope selection */}
          <div className={styles.scopeSection}>
            <div className={styles.scopeLabel}>Phạm vi áp dụng thay đổi:</div>

            <label className={styles.scopeOption}>
              <input
                type="radio"
                name="editScope"
                value="single"
                checked={scope === 'single'}
                onChange={() => setScope('single')}
                className={styles.scopeRadio}
              />
              <span>
                <strong>Chỉ đoạn bôi đen này</strong>
                {' '}
                <span style={{ color: '#94a3b8', fontSize: 11.5 }}>
                  ({isTitle ? 'ở tiêu đề chương' : `vị trí trong đoạn #${(startParaIndex !== null && startParaIndex !== undefined ? startParaIndex : 0) + 1}`})
                </span>
              </span>
            </label>

            {matchCount > 1 && (
              <label className={styles.scopeOption}>
                <input
                  type="radio"
                  name="editScope"
                  value="all"
                  checked={scope === 'all'}
                  onChange={() => setScope('all')}
                  className={styles.scopeRadio}
                />
                <span>
                  <strong>Thay thế toàn bộ trong chương này</strong>
                  {' '}
                  <span className={styles.scopeHighlightCount}>
                    ({matchCount} lần xuất hiện trùng khớp)
                  </span>
                </span>
              </label>
            )}

            {novelId && (
              <label className={styles.scopeOption}>
                <input
                  type="radio"
                  name="editScope"
                  value="novel"
                  checked={scope === 'novel'}
                  onChange={() => setScope('novel')}
                  className={styles.scopeRadio}
                />
                <span>
                  <strong style={{ color: '#38bdf8' }}>Thay thế trong TOÀN BỘ TRUYỆN</strong>
                  {' '}
                  {loadingNovelStats ? (
                    <span style={{ color: '#94a3b8', fontSize: 11.5 }}>(Đang quét toàn bộ chương...)</span>
                  ) : novelStats ? (
                    <span className={styles.scopeHighlightCount} style={{ borderColor: 'rgba(255, 204, 0, 0.45)', color: '#ffcc00' }}>
                      ({novelStats.matchCount} lần trong {novelStats.matchingChapters} chương)
                    </span>
                  ) : null}
                </span>
              </label>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className={styles.modalActions}>
          <div className={styles.leftActions}>
            <button
              type="button"
              className={styles.btnDeleteDirect}
              onClick={handleDelete}
              title={scope === 'novel' ? 'Xóa cụm từ này khỏi toàn bộ các chương trong truyện' : 'Xóa hẳn đoạn này'}
            >
              🗑️ {scope === 'novel' ? 'Xóa khỏi TOÀN BỘ TRUYỆN' : (scope === 'all' ? 'Xóa toàn bộ trong chương' : 'Xóa hẳn đoạn này')}
            </button>
          </div>

          <div className={styles.rightActions}>
            <button
              type="button"
              className={styles.btnCancel}
              onClick={onClose}
            >
              Hủy
            </button>
            <button
              type="button"
              className={`${styles.btnSave} ${scope === 'novel' ? styles.btnNovelScope : ''}`}
              onClick={handleSave}
              title="Lưu thay đổi (Ctrl + Enter)"
            >
              💾 {newText === ''
                ? (scope === 'novel' ? 'Xác nhận Xóa toàn bộ truyện' : (scope === 'all' ? 'Xác nhận Xóa toàn chương' : 'Lưu (Xóa rỗng)'))
                : (scope === 'novel' ? 'Thay thế TOÀN BỘ TRUYỆN' : (scope === 'all' ? 'Thay thế toàn chương' : 'Lưu Thay Đổi'))
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
