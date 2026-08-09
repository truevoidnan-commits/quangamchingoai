import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { nanoid } from '../lib/nanoid';
import { getChapter, saveChapter, getChapters } from '../lib/db';
import { updateLibraryItem, getLibrary } from '../lib/storage';
import { normalizeVietnamese } from '../lib/textFixer';
import WordCounter from '../components/ui/WordCounter';
import Footer from '../components/layout/Footer';
import styles from './AddChapterPage.module.css';

export default function AddChapterPage() {
  const { novelId, chapterId } = useParams(); // chapterId present = edit mode
  const navigate = useNavigate();
  const isEdit = Boolean(chapterId);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [order, setOrder] = useState('');
  const [isExtra, setIsExtra] = useState(false);
  const [extraLabel, setExtraLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [autoFix, setAutoFix] = useState(true);

  // Load chapter for edit mode
  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      const ch = await getChapter(chapterId);
      if (ch) {
        setTitle(ch.title || '');
        setContent(ch.content || '');
        setOrder(String(ch.order));
        setIsExtra(ch.isExtra || false);
        setExtraLabel(ch.extraLabel || '');
      }
    })();
  }, [chapterId, isEdit]);

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Vui lòng nhập tiêu đề chương.');
      return;
    }
    setSaving(true);
    try {
      let processedContent = content;
      if (autoFix) {
        processedContent = normalizeVietnamese(content);
      }

      const chapters = await getChapters(novelId);
      const newOrder = order !== '' ? Number(order) : chapters.length;

      const chapter = {
        id: isEdit ? chapterId : nanoid(),
        novelId,
        title: title.trim(),
        content: processedContent,
        order: newOrder,
        isExtra,
        extraLabel: isExtra ? extraLabel : '',
      };

      await saveChapter(chapter);

      // Update library chapter count
      if (!isEdit) {
        const lib = getLibrary();
        const libItem = lib.find(n => n.id === novelId);
        if (libItem) {
          updateLibraryItem(novelId, { chapterCount: (libItem.chapterCount || 0) + 1 });
        }
      }

      navigate(`/novel/${novelId}`);
    } catch (err) {
      alert('Lỗi khi lưu: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePaste = (e) => {
    if (!autoFix) return;
    // Let the paste happen, then fix
    setTimeout(() => {
      setContent(prev => normalizeVietnamese(prev));
    }, 0);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className="btn-ghost" onClick={() => navigate(-1)}>← Quay lại</button>
        <h1 className={styles.pageTitle}>
          {isEdit ? 'Sửa chương' : 'Thêm chương'}
        </h1>
      </div>

      <div className={styles.form}>
        {/* Chapter title */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="ch-title">Tiêu đề chương *</label>
          <input
            id="ch-title"
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Vd: Chương 1: Khởi đầu"
            className={styles.input}
          />
        </div>

        {/* Order */}
        <div className={styles.row}>
          <div className={styles.field} style={{ flex: 1 }}>
            <label className={styles.label} htmlFor="ch-order">Vị trí (thứ tự)</label>
            <input
              id="ch-order"
              type="number"
              value={order}
              onChange={e => setOrder(e.target.value)}
              placeholder="Tự động (cuối)"
              min={0}
              className={styles.input}
            />
            <span className={styles.hint}>Để trống = chèn vào cuối. Nhập số = chèn tự do.</span>
          </div>

          {/* Extra toggle */}
          <div className={styles.field} style={{ flexBasis: 'auto' }}>
            <label className={styles.label}>Loại chương</label>
            <label className={styles.toggleRow}>
              <input
                type="checkbox"
                checked={isExtra}
                onChange={e => setIsExtra(e.target.checked)}
                id="ch-is-extra"
                className={styles.checkbox}
              />
              <span className={`badge ${isExtra ? 'badge-extra' : ''}`} style={{ fontSize: 13 }}>
                {isExtra ? '✦ Ngoại truyện' : 'Chương chính'}
              </span>
            </label>
            {isExtra && (
              <input
                type="text"
                value={extraLabel}
                onChange={e => setExtraLabel(e.target.value)}
                placeholder="Nhãn (vd: Phiên ngoại 1)"
                className={styles.input}
                style={{ marginTop: 6 }}
              />
            )}
          </div>
        </div>

        {/* Auto-fix toggle */}
        <label className={styles.toggleRow} style={{ cursor: 'pointer', width: 'fit-content' }}>
          <input
            type="checkbox"
            checked={autoFix}
            onChange={e => setAutoFix(e.target.checked)}
            className={styles.checkbox}
          />
          <span className={styles.toggleLabel}>🔧 Tự động sửa lỗi dấu tiếng Việt khi paste</span>
        </label>

        {/* Content */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="ch-content">Nội dung chương</label>
          <WordCounter value={content} onChange={setContent} />
          <textarea
            id="ch-content"
            value={content}
            onChange={e => setContent(e.target.value)}
            onPaste={handlePaste}
            placeholder="Dán nội dung chương vào đây..."
            className={styles.textarea}
            rows={20}
            spellCheck={false}
          />
        </div>

        {/* Actions */}
        <div className={styles.actions}>
          <button className="btn-ghost" onClick={() => navigate(-1)}>Hủy</button>
          <button
            className="btn-gold"
            onClick={handleSave}
            disabled={saving || !title.trim()}
            id="btn-save-chapter"
          >
            {saving ? '⏳ Đang lưu...' : '💾 Lưu chương'}
          </button>
        </div>
      </div>

      <Footer />
    </div>
  );
}
