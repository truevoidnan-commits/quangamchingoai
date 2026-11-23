import Icon from '../ui/Icon';
import React, { useState } from 'react';
import { getPreciseSelectionSetting, setPreciseSelectionSetting } from '../../lib/selectionUtils';
import styles from './SelectionEditor.module.css';

export default function SelectionToolbar({
  position,
  selectedText,
  matchCount = 1,
  preciseSelection,
  onTogglePreciseSelection,
  onOpenEdit,
  onOpenReplaceAll,
  onDeleteDirect,
  onClose,
}) {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);
  const [localPrecise, setLocalPrecise] = useState(() => getPreciseSelectionSetting());

  if (!position) return null;

  const isPreciseActive = typeof preciseSelection === 'boolean' ? preciseSelection : localPrecise;

  const handleTogglePrecise = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const nextVal = !isPreciseActive;
    setLocalPrecise(nextVal);
    setPreciseSelectionSetting(nextVal);
    if (onTogglePreciseSelection) {
      onTogglePreciseSelection(nextVal);
    }
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  const toolbarStyle = isMobile
    ? {}
    : {
        left: `${position.x}px`,
        top: `${position.y}px`,
      };

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
      style={toolbarStyle}
      onMouseDown={(e) => {
        // Prevent selection from collapsing when clicking toolbar
        e.preventDefault();
      }}
      onTouchStart={(e) => {
        // Prevent mobile touch from collapsing text selection
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {showConfirmDelete ? (
        <div className={styles.confirmDeleteWrap}>
          <span className={styles.confirmDeleteText}>Xác nhận xóa hẳn đoạn này?</span>
          <button
            type="button"
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
            type="button"
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
        <div className={styles.toolbarInner}>
          {/* Hàng 1: Ba thao tác cốt lõi + nút Đóng */}
          <div className={styles.toolbarRowMain}>
            <button
              type="button"
              className={`${styles.toolbarBtn} ${styles.toolbarBtnEdit}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenEdit();
              }}
              title="Sửa hoặc thay thế đoạn chữ này"
            >
              <Icon name="edit" size={13} /> Sửa / Thay thế
            </button>

            <button
              type="button"
              className={styles.toolbarBtn}
              onClick={handleCopy}
              title="Sao chép vào khay nhớ tạm"
            >
              {copied ? (
                <>
                  <Icon name="check" size={13} /> Đã chép
                </>
              ) : (
                <>
                  <Icon name="copy" size={13} /> Sao chép
                </>
              )}
            </button>

            <button
              type="button"
              className={`${styles.toolbarBtn} ${styles.toolbarBtnDelete}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowConfirmDelete(true);
              }}
              title="Xóa hẳn đoạn chữ này khỏi chương"
            >
              <Icon name="trash" size={13} /> Xóa hẳn
            </button>

            <button
              type="button"
              className={`${styles.toolbarBtn} ${styles.toolbarBtnClose}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose();
              }}
              title="Đóng thanh công cụ"
              aria-label="Đóng thanh công cụ"
            >
              ✕
            </button>
          </div>

          {/* Hàng 2: Thao tác mở rộng (Đổi tất cả, Chọn từng ký tự) */}
          {(matchCount > 1 || isMobile) && (
            <div className={styles.toolbarRowSub}>
              {matchCount > 1 && (
                <button
                  type="button"
                  className={`${styles.toolbarBtn} ${styles.toolbarBtnReplaceAll}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenReplaceAll();
                  }}
                  title={`Tìm thấy ${matchCount} lần xuất hiện trùng khớp trong chương này`}
                >
                  <Icon name="replace" size={12} /> Đổi tất cả ({matchCount})
                </button>
              )}

              <button
                type="button"
                className={`${styles.toolbarBtn} ${styles.toolbarBtnPrecise} ${
                  isPreciseActive ? styles.toolbarBtnPreciseActive : ''
                }`}
                onClick={handleTogglePrecise}
                title={
                  isPreciseActive
                    ? 'Chế độ chọn từng ký tự đang BẬT (không tự động mở rộng ra cả từ). Bấm để chuyển về tự bắt dính cả từ.'
                    : 'Chế độ chọn từng ký tự đang TẮT. Bấm để bật chọn chính xác từng ký tự.'
                }
              >
                <Icon name="star" size={12} />
                <span>{isPreciseActive ? 'Từng ký tự (Bật)' : 'Từng ký tự'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
