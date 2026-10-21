import React, { useState, useEffect, useRef } from 'react';
import {
  getCultivationBackupData,
  getCultivationBackupFilename,
  triggerDownloadBackup,
} from '../../lib/cultivationBackup';
import styles from './CultivationBackupModal.module.css';

export default function CultivationBackupModal({ isOpen, onClose }) {
  const [backupData, setBackupData] = useState(null);
  const [jsonString, setJsonString] = useState('');
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      const data = getCultivationBackupData();
      setBackupData(data);
      setJsonString(JSON.stringify(data, null, 2));
      setCopied(false);
    }
  }, [isOpen]);

  if (!isOpen || !backupData) return null;

  const filename = getCultivationBackupFilename(backupData.profile);
  const isSandbox = backupData.profile === 'sandbox';

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(jsonString);
      } else {
        throw new Error('Clipboard API not available');
      }
      setCopied(true);
    } catch {
      // Fallback cho trình duyệt chặn Clipboard API (iOS/Cốc Cốc)
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select();
        try {
          document.execCommand('copy');
          setCopied(true);
        } catch {
          alert('Vui lòng chọn hết văn bản bên dưới và bấm Sao chép.');
        }
      }
    }

    setTimeout(() => setCopied(false), 4500);
  };

  const handleDownload = () => {
    try {
      triggerDownloadBackup(backupData);
    } catch (err) {
      alert('Không thể tự động tải file trên thiết bị này. Vui lòng sử dụng nút "Sao chép toàn bộ" để dán vào Ghi chú!');
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <h2 className={styles.title}>
              <span>📦</span> Xuất Sao Lưu Tu Vi
            </h2>
            <div className={styles.subtitle}>
              Chế độ chỉ đọc • Không tác động hay thay đổi tiến trình tu luyện
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Đóng">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className={styles.body}>
          <div className={styles.noticeBox}>
            <span>🛡️</span>
            <div>
              <strong>An toàn tuyệt đối:</strong> Thao tác này chỉ trích xuất dữ liệu tu vi hiện tại để bạn cất giữ hoặc chuyển đổi thiết bị. Không ghi đè hay xóa bất kỳ chỉ số nào.
            </div>
          </div>

          <div className={styles.metaRow}>
            <div>
              <span>Hồ sơ: </span>
              <strong style={{ color: isSandbox ? '#fb923c' : '#38bdf8' }}>
                {isSandbox ? '🧪 Thử Nghiệm (Sandbox)' : '🛡️ Tu Vi Thật (Chính thức)'}
              </strong>
            </div>
            <div>
              <span>Tên file: </span>
              <span className={styles.badge}>{filename}</span>
            </div>
          </div>

          <div className={styles.textareaWrap}>
            <div className={styles.textareaLabel}>Dữ liệu sao lưu (JSON):</div>
            <textarea
              ref={textareaRef}
              className={styles.jsonArea}
              value={jsonString}
              readOnly
              onClick={(e) => e.target.select()}
              title="Nhấp để bôi đen toàn bộ"
            />
          </div>

          {copied && (
            <div className={styles.toastSuccess}>
              <span>✅</span>
              <span>Đã sao chép toàn bộ JSON vào bộ nhớ tạm! Bạn có thể dán vào Ghi Chú.</span>
            </div>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.copyBtn}
              onClick={handleCopy}
              title="Sao chép toàn bộ JSON vào bộ nhớ tạm"
            >
              <span>📋</span>
              <span>{copied ? 'Đã Sao Chép!' : 'Sao Chép Vào Ghi Chú'}</span>
            </button>

            <button
              type="button"
              className={styles.downloadBtn}
              onClick={handleDownload}
              title="Tải file .json về thiết bị"
            >
              <span>📥</span>
              <span>Tải Tệp (.json)</span>
            </button>
          </div>

          <div className={styles.footerNote}>
            💡 <em>Lưu ý: Trên iOS Safari hoặc Cốc Cốc nếu tính năng tải tệp bị chặn, hãy dùng nút <strong>"Sao Chép Vào Ghi Chú"</strong> để dán và cất giữ an toàn.</em>
          </div>
        </div>
      </div>
    </div>
  );
}
