import { useWordCount } from '../../hooks/useWordCount';
import styles from './WordCounter.module.css';

/**
 * WordCounter — real-time counter with copy/clear buttons
 */
export default function WordCounter({ value, onChange }) {
  const { formatted } = useWordCount(value);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = value;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  };

  const handleClear = () => {
    onChange?.('');
  };

  return (
    <div className={styles.bar}>
      <span className={styles.count}>
        <span className={styles.countNum}>{formatted}</span>
        <span className={styles.countLabel}> chữ</span>
      </span>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={handleCopy}
          title="Copy toàn bộ nội dung"
        >
          📋 Copy tất cả
        </button>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.clearBtn}`}
          onClick={handleClear}
          title="Xóa toàn bộ nội dung"
        >
          🗑 Xóa tất cả
        </button>
      </div>
    </div>
  );
}
