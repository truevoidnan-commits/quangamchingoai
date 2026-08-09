import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getNovel, saveNovel } from '../lib/db';
import { updateLibraryItem } from '../lib/storage';
import { resizeCoverImage } from '../lib/chapterParser';
import Footer from '../components/layout/Footer';
import styles from './AddNovelPage.module.css'; // Reuse same styles

export default function EditNovelPage() {
  const { novelId } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  const [coverUrlInput, setCoverUrlInput] = useState('');
  const [coverTab, setCoverTab] = useState('upload');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    (async () => {
      const novel = await getNovel(novelId);
      if (novel) {
        setTitle(novel.title || '');
        setDescription(novel.description || '');
        setCoverUrl(novel.coverUrl || '');
        setCoverPreview(novel.coverUrl || '');
      }
    })();
  }, [novelId]);

  const handleCoverFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resized = await resizeCoverImage(file);
      setCoverPreview(resized);
      setCoverUrl(resized);
    } catch {
      setError('Không thể đọc ảnh bìa.');
    }
  };

  const handleCoverUrl = () => {
    if (!coverUrlInput.trim()) return;
    setCoverPreview(coverUrlInput.trim());
    setCoverUrl(coverUrlInput.trim());
  };

  const handleSave = async () => {
    if (!title.trim()) { alert('Vui lòng nhập tên truyện.'); return; }
    setSaving(true);
    try {
      const existing = await getNovel(novelId);
      const updated = {
        ...existing,
        title: title.trim(),
        description: description.trim(),
        coverUrl,
      };
      await saveNovel(updated);
      updateLibraryItem(novelId, { title: updated.title, coverUrl: updated.coverUrl });
      navigate(`/novel/${novelId}`);
    } catch (err) {
      alert('Lỗi khi lưu: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className="btn-ghost" onClick={() => navigate(-1)}>← Quay lại</button>
        <h1 className={styles.pageTitle}>Sửa truyện</h1>
      </div>

      <div className={styles.form}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="edit-novel-title">Tên truyện *</label>
          <input id="edit-novel-title" type="text" value={title} onChange={e => setTitle(e.target.value)} className={styles.input} />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="edit-novel-desc">Giới thiệu</label>
          <textarea id="edit-novel-desc" value={description} onChange={e => setDescription(e.target.value)} rows={4} className={styles.textarea} />
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Ảnh bìa</label>
          <div className={styles.coverTabs}>
            <button type="button" className={`${styles.coverTab} ${coverTab === 'upload' ? styles.coverTabActive : ''}`} onClick={() => setCoverTab('upload')}>📁 Upload</button>
            <button type="button" className={`${styles.coverTab} ${coverTab === 'url' ? styles.coverTabActive : ''}`} onClick={() => setCoverTab('url')}>🔗 URL</button>
          </div>

          {coverTab === 'upload' && (
            <div className={styles.dropZone} onClick={() => fileRef.current?.click()}>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleCoverFile} style={{ display: 'none' }} />
              {coverPreview ? (
                <img src={coverPreview} alt="Preview" className={styles.coverPreview} />
              ) : (
                <div className={styles.dropPlaceholder}><span>🖼️</span><span>Nhấn để chọn ảnh bìa</span></div>
              )}
            </div>
          )}

          {coverTab === 'url' && (
            <div className={styles.urlRow}>
              <input type="url" value={coverUrlInput} onChange={e => setCoverUrlInput(e.target.value)} placeholder="https://..." className={styles.input} />
              <button type="button" className="btn-ghost" onClick={handleCoverUrl}>Xem trước</button>
              {coverPreview && coverTab === 'url' && (
                <img src={coverPreview} alt="Preview" className={styles.coverPreviewSmall} onError={() => setCoverPreview('')} />
              )}
            </div>
          )}
        </div>

        {error && <div className={styles.parseError}>⚠️ {error}</div>}

        <div className={styles.actions}>
          <button className="btn-ghost" onClick={() => navigate(-1)}>Hủy</button>
          <button className="btn-gold" onClick={handleSave} disabled={saving} id="btn-update-novel">
            {saving ? '⏳ Đang lưu...' : '💾 Cập nhật'}
          </button>
        </div>
      </div>

      <Footer />
    </div>
  );
}
