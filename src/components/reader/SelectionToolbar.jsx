import React, { useState } from 'react';
import styles from './SelectionEditor.module.css';

export default function SelectionToolbar({
  position,
  selectedText,
  matchCount = 1,
  onOpenEdit,
  onOpenReplaceAll,
  onDeleteDirect,
  onClose,
}) {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!position) return null;

  const handleCopy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(selectedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  };

  return (
    <div
      className={styles.selectionToolbar}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      onMouseDown={(e) => {
        // Prevent selection from collapsing when clicking toolbar
        e.preventDefault();
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {showConfirmDelete ? (
        <div className={styles.confirmDeleteWrap}>
          <span className={styles.confirmDeleteText}>Xác nhận xóa hẳn đoạn này?</span>
          <button
            className={styles.confirmBtnYes}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDeleteDirect();
            }}
          >
            Xóa
          </button>
          <button
            className={styles.confirmBtnNo}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowConfirmDelete(false);
            }}
          >
            Hủy
          </button>
        </div>
      ) : (
        <>
          <button
            className={`${styles.toolbarBtn} ${styles.toolbarBtnEdit}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenEdit();
            }}
            title="Sửa hoặc thay thế đoạn chữ này"
          >
            ✏️ Sửa / Thay thế
          </button>

          <button
            className={`${styles.toolbarBtn} ${styles.toolbarBtnDelete}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowConfirmDelete(true);
            }}
            title="Xóa hẳn đoạn chữ này khỏi chương"
          >
            🗑️ Xóa hẳn
          </button>

          {matchCount > 1 && (
            <button
              className={styles.toolbarBtn}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenReplaceAll();
              }}
              title={`Tìm thấy ${matchCount} lần xuất hiện trong chương này`}
            >
              🔁 Đổi tất cả ({matchCount})
            </button>
          )}

          <button
            className={styles.toolbarBtn}
            onClick={handleCopy}
            title="Sao chép vào khay nhớ tạm"
          >
            {copied ? '✓ Đã chép' : '📋 Sao chép'}
          </button>

          <div className={styles.toolbarDivider} />

          <button
            className={`${styles.toolbarBtn} ${styles.toolbarBtnClose}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            title="Đóng thanh công cụ"
          >
            ✕
          </button>
        </>
      )}
    </div>
  );
}
