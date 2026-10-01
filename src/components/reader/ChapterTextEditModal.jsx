import React, { useState, useEffect, useRef } from 'react';
import styles from './SelectionEditor.module.css';

export default function ChapterTextEditModal({
  isOpen,
  targetData,
  initialScope = 'single',
  onSave,
  onDelete,
  onClose,
}) {
  const [newText, setNewText] = useState('');
  const [scope, setScope] = useState(initialScope);
  const [snapshotOriginal, setSnapshotOriginal] = useState('');
  const textareaRef = useRef(null);

  const selectedText = snapshotOriginal || targetData?.selectedText || '';
  const matchCount = targetData?.matchCount || 1;
  const startParaIndex = targetData?.startParaIndex;
  const isTitle = targetData?.isTitle || false;

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
                  <strong>Thay thế toàn bộ trong chương</strong>
                  {' '}
                  <span className={styles.scopeHighlightCount}>
                    ({matchCount} lần xuất hiện trùng khớp)
                  </span>
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
              title="Xóa hẳn đoạn này khỏi chương"
            >
              🗑️ Xóa hẳn đoạn này
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
              className={styles.btnSave}
              onClick={handleSave}
              title="Lưu thay đổi (Ctrl + Enter)"
            >
              💾 {newText === '' ? 'Lưu (Xóa rỗng)' : 'Lưu Thay Đổi'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
