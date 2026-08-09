import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { nanoid } from '../lib/nanoid';
import { saveNovel, saveChaptersBulk } from '../lib/db';
import { addToLibrary } from '../lib/storage';
import { parseNovelFile, resizeCoverImage } from '../lib/chapterParser';
import Footer from '../components/layout/Footer';
import styles from './AddNovelPage.module.css';

export default function AddNovelPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [coverUrlInput, setCoverUrlInput] = useState('');
  const [coverTab, setCoverTab] = useState('upload'); // 'upload' | 'url'
  const [parsedChapters, setParsedChapters] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const handleCoverFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resized = await resizeCoverImage(file);
      setCoverPreview(resized);
      setCoverUrl(resized);
    } catch {
      setParseError('Không thể đọc ảnh bìa.');
    }
  };

  const handleCoverUrl = () => {
    if (!coverUrlInput.trim()) return;
    setCoverPreview(coverUrlInput.trim());
    setCoverUrl(coverUrlInput.trim());
  };

  const handleFileUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setParseError('');
    setParsedChapters([]);

    // Tự động gán tên truyện mặc định là tên file (bỏ đuôi .txt, .epub)
    const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '').trim();
    if (fileNameWithoutExt) {
      setTitle(fileNameWithoutExt);
    }

    try {
      const res = await parseNovelFile(file);
      const chapters = res.chapters || [];
      if (chapters.length === 0) {
        setParseError('Không tìm thấy chương nào trong file. Hãy kiểm tra định dạng tiêu đề chương.');
      } else {
        setParsedChapters(chapters);
      }

      // Tự động gán phần giới thiệu nếu có nội dung trước chương 1
      if (res.description) {
        setDescription(res.description);
      } else {
        setDescription('');
      }

      // Tự động gán ảnh bìa nếu file EPUB có chứa ảnh bìa
      if (res.coverUrl) {
        setCoverPreview(res.coverUrl);
        setCoverUrl(res.coverUrl);
      }
    } catch (err) {
      setParseError(err.message || 'Lỗi khi đọc file.');
    } finally {
      setParsing(false);
    }
  }, []);

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Vui lòng nhập tên truyện.');
      return;
    }
    setSaving(true);
    try {
      const novelId = nanoid();
      const novel = {
        id: novelId,
        title: title.trim(),
        description: description.trim(),
        coverUrl,
        chapterCount: parsedChapters.length,
        createdAt: Date.now(),
      };
      await saveNovel(novel);

      if (parsedChapters.length > 0) {
        const chapters = parsedChapters.map(ch => ({
          ...ch,
          id: nanoid(),
          novelId,
        }));
        await saveChaptersBulk(chapters);
      }

      addToLibrary({
        id: novelId,
        title: novel.title,
        coverUrl: novel.coverUrl,
        chapterCount: parsedChapters.length,
      });

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
        <h1 className={styles.pageTitle}>Thêm truyện mới</h1>
      </div>

      <div className={styles.form}>
        {/* Title */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="novel-title">Tên truyện *</label>
          <input
            id="novel-title"
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Nhập tên truyện..."
            className={styles.input}
          />
        </div>

        {/* Description */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="novel-desc">Giới thiệu</label>
          <textarea
            id="novel-desc"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Tóm tắt nội dung truyện..."
            rows={4}
            className={styles.textarea}
          />
        </div>

        {/* Cover image */}
        <div className={styles.field}>
          <label className={styles.label}>Ảnh bìa</label>

          <div className={styles.coverTabs}>
            <button
              type="button"
              className={`${styles.coverTab} ${coverTab === 'upload' ? styles.coverTabActive : ''}`}
              onClick={() => setCoverTab('upload')}
            >
              📁 Upload từ máy
            </button>
            <button
              type="button"
              className={`${styles.coverTab} ${coverTab === 'url' ? styles.coverTabActive : ''}`}
              onClick={() => setCoverTab('url')}
            >
              🔗 Nhập URL
            </button>
          </div>

          {coverTab === 'upload' && (
            <div
              className={styles.dropZone}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); }}
              onDrop={e => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleCoverFile({ target: { files: [file] } });
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleCoverFile}
                style={{ display: 'none' }}
                id="cover-file-input"
              />
              {coverPreview && coverTab === 'upload' ? (
                <img src={coverPreview} alt="Preview bìa" className={styles.coverPreview} />
              ) : (
                <div className={styles.dropPlaceholder}>
                  <span>🖼️</span>
                  <span>Nhấn hoặc kéo thả ảnh vào đây</span>
                  <span className={styles.dropHint}>JPG, PNG, WebP — tự động resize về 300×400</span>
                </div>
              )}
            </div>
          )}

          {coverTab === 'url' && (
            <div className={styles.urlRow}>
              <input
                type="url"
                value={coverUrlInput}
                onChange={e => setCoverUrlInput(e.target.value)}
                placeholder="https://example.com/cover.jpg"
                className={styles.input}
                id="cover-url-input"
              />
              <button type="button" className="btn-ghost" onClick={handleCoverUrl}>
                Xem trước
              </button>
              {coverPreview && coverTab === 'url' && (
                <img src={coverPreview} alt="Preview" className={styles.coverPreviewSmall} onError={() => { setCoverPreview(''); setParseError('URL ảnh không hợp lệ.'); }} />
              )}
            </div>
          )}
        </div>

        {/* File upload */}
        <div className={styles.field}>
          <label className={styles.label}>Upload file truyện (.txt / .epub)</label>
          <div className={styles.fileUploadRow}>
            <label className={`btn-ghost ${styles.fileLabel}`} htmlFor="novel-file-input">
              📂 Chọn file...
            </label>
            <input
              id="novel-file-input"
              type="file"
              accept=".txt,.epub"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            {parsing && <span className={styles.parseStatus}>⏳ Đang phân tích...</span>}
          </div>

          {parseError && (
            <div className={styles.parseError}>⚠️ {parseError}</div>
          )}

          {parsedChapters.length > 0 && (
            <div className={styles.parseResult}>
              <div className={styles.parseResultHeader}>
                <span className={styles.parseSuccess}>
                  ✅ Đã tách được <strong>{parsedChapters.length}</strong> chương
                  {parsedChapters.filter(c => c.isExtra).length > 0 && (
                    <span className="badge badge-extra" style={{ marginLeft: 8 }}>
                      {parsedChapters.filter(c => c.isExtra).length} ngoại truyện
                    </span>
                  )}
                </span>
              </div>
              <div className={styles.chapterPreviewList}>
                {parsedChapters.slice(0, 5).map((ch, i) => (
                  <div key={i} className={styles.chapterPreviewItem}>
                    <span className={styles.chapterPreviewNum}>{i + 1}</span>
                    <span className={styles.chapterPreviewTitle}>
                      {ch.title}
                      {ch.isExtra && <span className="badge badge-extra" style={{ marginLeft: 6 }}>Ngoại truyện</span>}
                    </span>
                  </div>
                ))}
                {parsedChapters.length > 5 && (
                  <div className={styles.chapterPreviewMore}>
                    ...và {parsedChapters.length - 5} chương nữa
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Save button */}
        <div className={styles.actions}>
          <button className="btn-ghost" onClick={() => navigate(-1)}>Hủy</button>
          <button
            className="btn-gold"
            onClick={handleSave}
            disabled={saving || !title.trim()}
            id="btn-save-novel"
          >
            {saving ? '⏳ Đang lưu...' : '💾 Lưu truyện'}
          </button>
        </div>
      </div>

      <Footer />
    </div>
  );
}
