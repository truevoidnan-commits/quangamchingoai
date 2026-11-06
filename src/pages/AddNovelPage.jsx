import React, { useState, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Icon, { GlyphIcon } from '../components/ui/Icon';
import { nanoid } from '../lib/nanoid';
import { saveNovel, saveChaptersBulk, deleteNovelDB } from '../lib/db';
import { addToLibrary } from '../lib/storage';
import { parseNovelFile, resizeCoverImage, makeCoverThumb, analyzeChapterSequence } from '../lib/chapterParser';
import Footer from '../components/layout/Footer';
import ImageCropperModal from '../components/ui/ImageCropperModal';
import {
  PageShell,
  PageHeader,
  Card,
  Field,
  TextInput,
  TextArea,
  SegmentedControl,
  Dropzone,
  FileButton,
  Button,
  ActionBar,
} from '../components/ui/FormKit';
import styles from './AddNovelPage.module.css';

export { analyzeChapterSequence };

export default function AddNovelPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isVaultParam = searchParams.get('vault') === '1';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [coverUrlInput, setCoverUrlInput] = useState('');
  const [coverTab, setCoverTab] = useState('upload'); // 'upload' | 'url'
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedFileSize, setUploadedFileSize] = useState('');

  const [parsedChapters, setParsedChapters] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [saving, setSaving] = useState(false);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [rawImageForCrop, setRawImageForCrop] = useState('');
  const [showAllAnomalies, setShowAllAnomalies] = useState(false);

  const fileRef = useRef(null);

  const handleCoverFile = async (file) => {
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

  const handleCroppedCover = (croppedDataUrl) => {
    setCoverPreview(croppedDataUrl);
    setCoverUrl(croppedDataUrl);
  };

  const handleFileUpload = useCallback(async (file) => {
    if (!file) return;
    setParsing(true);
    setParseError('');
    setParsedChapters([]);
    setUploadedFileName(file.name);
    setUploadedFileSize(`${(file.size / (1024 * 1024)).toFixed(2)} MB`);

    // Tự động gán tên truyện mặc định là tên file (bỏ đuôi .txt, .epub)
    const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '').trim();
    if (fileNameWithoutExt && !title.trim()) {
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
      if (res.description && !description.trim()) {
        setDescription(res.description);
      }

      // Tự động gán ảnh bìa nếu file EPUB có chứa ảnh bìa
      if (res.coverUrl && !coverPreview) {
        setCoverPreview(res.coverUrl);
        setCoverUrl(res.coverUrl);
      }
    } catch (err) {
      setParseError(err.message || 'Lỗi khi đọc file.');
    } finally {
      setParsing(false);
    }
  }, [title, description, coverPreview]);

  const handleRemoveFile = () => {
    setParsedChapters([]);
    setUploadedFileName('');
    setUploadedFileSize('');
    setParseError('');
  };

  const handleSave = async () => {
    if (saving) return;
    if (!title.trim()) {
      alert('Vui lòng nhập tên truyện.');
      return;
    }
    setSaving(true);
    try {
      // 1. Tạo thumbnail ảnh bìa trước
      let coverThumb = '';
      if (coverUrl) {
        if (/^https?:\/\//i.test(coverUrl)) {
          coverThumb = coverUrl;
        } else {
          coverThumb = await makeCoverThumb(coverUrl, 240, 320, 0.7);
        }
      }

      const novelId = nanoid();
      const novel = {
        id: novelId,
        title: title.trim(),
        description: description.trim(),
        coverUrl,
        coverThumb,
        chapterCount: parsedChapters.length,
        createdAt: Date.now(),
        isHidden: isVaultParam,
      };

      // 2. Ghi IndexedDB
      await saveNovel(novel);

      if (parsedChapters.length > 0) {
        const chapters = parsedChapters.map(ch => ({
          ...ch,
          id: nanoid(),
          novelId,
        }));
        await saveChaptersBulk(chapters);
      }

      // 3. Ghi catalog localStorage (kèm rollback nếu lỗi)
      try {
        addToLibrary({
          id: novelId,
          title: novel.title,
          coverThumb,
          coverUrl: /^https?:\/\//i.test(novel.coverUrl) ? novel.coverUrl : undefined,
          chapterCount: parsedChapters.length,
          isHidden: isVaultParam,
        });
      } catch (catalogErr) {
        console.error('Lỗi khi ghi danh mục, đang rollback xóa truyện khỏi IndexedDB:', catalogErr);
        try {
          await deleteNovelDB(novelId);
        } catch (delErr) {
          console.error('Lỗi rollback deleteNovelDB:', delErr);
        }
        throw catalogErr;
      }

      navigate(`/novel/${novelId}`);
    } catch (err) {
      alert('Lỗi khi lưu: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const sequenceAnalysis = analyzeChapterSequence(parsedChapters);

  return (
    <PageShell backdrop="text">
      <PageHeader
        backLabel="Quay lại"
        title={isVaultParam ? 'Thêm Truyện Vào Mật Thất' : 'Thêm Truyện Mới'}
        subtitle={isVaultParam ? 'Lưu trữ riêng tư và bảo mật' : 'Thêm tác phẩm vào thư viện đọc'}
      />

      {/* 1. CARD: THÔNG TIN TRUYỆN */}
      <Card
        icon="book"
        title="Thông Tin Cơ Bản"
        subtitle="Tên truyện và tóm tắt giới thiệu tác phẩm"
      >
        <Field label="Tên truyện *" id="novel-title">
          <TextInput
            id="novel-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nhập tên truyện..."
            autoFocus
          />
        </Field>

        <Field label="Giới thiệu tóm tắt" optional id="novel-desc" hint="Có thể tự động điền nếu file EPUB/TXT có phần giới thiệu ban đầu">
          <TextArea
            id="novel-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tóm tắt bối cảnh, giới thiệu cốt truyện..."
            rows={4}
            maxLength={3000}
          />
        </Field>
      </Card>

      {/* 2. CARD: ẢNH BÌA */}
      <Card
        icon="image"
        title="Ảnh Bìa Tác Phẩm"
        subtitle="Hiển thị ở sảnh thư viện và trang chi tiết (tỉ lệ chuẩn 3:4)"
        actions={
          <SegmentedControl
            options={[
              { value: 'upload', label: 'Tải từ máy', icon: 'upload' },
              { value: 'url', label: 'Nhập URL', icon: 'link' },
            ]}
            value={coverTab}
            onChange={setCoverTab}
          />
        }
      >
        {coverTab === 'upload' && (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.[0]) handleCoverFile(e.target.files[0]);
              }}
              id="cover-file-input"
            />
            {coverPreview ? (
              <div className={styles.coverPreviewContainer}>
                <div className={styles.coverFrame34}>
                  <img src={coverPreview} alt="Preview bìa" className={styles.coverImg} />
                </div>
                <div className={styles.coverActions}>
                  <Button
                    variant="secondary"
                    size="small"
                    icon="refresh"
                    onClick={() => fileRef.current?.click()}
                  >
                    Đổi ảnh khác
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    icon="scissors"
                    onClick={() => {
                      setRawImageForCrop(coverPreview);
                      setCropModalOpen(true);
                    }}
                  >
                    Căn chỉnh lại
                  </Button>
                </div>
              </div>
            ) : (
              <Dropzone
                icon="image"
                title="Kéo thả ảnh bìa vào đây hoặc bấm để chọn"
                hint="Tự động mở công cụ căn chỉnh chuẩn tỉ lệ 3:4"
                accept="image/*"
                onSelectFile={handleCoverFile}
              />
            )}
          </div>
        )}

        {coverTab === 'url' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <TextInput
                  id="cover-url-input"
                  type="url"
                  value={coverUrlInput}
                  onChange={(e) => setCoverUrlInput(e.target.value)}
                  placeholder="https://example.com/cover.jpg"
                  prefixIcon="link"
                />
              </div>
              <Button
                variant="secondary"
                icon="scissors"
                onClick={handleCoverUrl}
              >
                Cắt & Căn chỉnh
              </Button>
            </div>

            {coverPreview && (
              <div className={styles.coverPreviewContainer}>
                <div className={styles.coverFrame34}>
                  <img
                    src={coverPreview}
                    alt="Preview bìa"
                    className={styles.coverImg}
                    onError={() => {
                      setCoverPreview('');
                      setParseError('URL ảnh không hợp lệ.');
                    }}
                  />
                </div>
                <Button
                  variant="secondary"
                  size="small"
                  icon="scissors"
                  onClick={() => {
                    setRawImageForCrop(coverPreview);
                    setCropModalOpen(true);
                  }}
                >
                  Căn chỉnh lại
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 3. CARD: FILE TRUYỆN */}
      <Card
        icon="file-text"
        title="Tập Tin Truyện"
        subtitle="Hỗ trợ file văn bản .txt hoặc sách điện tử .epub"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FileButton
            id="novel-file-input"
            icon="folder"
            label="Chọn file truyện..."
            accept=".txt,.epub"
            filename={uploadedFileName}
            sizeStr={uploadedFileSize}
            onSelect={handleFileUpload}
            onRemove={handleRemoveFile}
          />

          {parsing && (
            <div className={styles.parseStatus}>
              <span className={styles.spinnerIcon} /> Đang phân tích cấu trúc chương...
            </div>
          )}

          {parseError && (
            <div className={styles.parseError}>
              <Icon name="alert-triangle" size={15} />
              <span>{parseError}</span>
            </div>
          )}

          {parsedChapters.length > 0 && (
            <div className={styles.parseResult}>
              <div className={styles.parseResultHeader}>
                <span className={styles.parseSuccess}>
                  <GlyphIcon value="check-circle" size={16} /> Đã nhận diện được <strong>{parsedChapters.length}</strong> chương
                  {parsedChapters.filter((c) => c.isExtra).length > 0 && (
                    <span className={styles.extraBadge}>
                      {parsedChapters.filter((c) => c.isExtra).length} ngoại truyện
                    </span>
                  )}
                </span>
              </div>

              {/* Anomaly Check */}
              {sequenceAnalysis.anomalies.length > 0 ? (
                <div className={styles.anomalyWarningBox}>
                  <div className={styles.anomalyHeader}>
                    <Icon name="alert-triangle" size={15} />
                    <strong>Phát hiện {sequenceAnalysis.anomalies.length} vị trí nhảy số bất thường:</strong>
                  </div>
                  <div className={styles.anomalyList}>
                    {sequenceAnalysis.anomalies.slice(0, showAllAnomalies ? sequenceAnalysis.anomalies.length : 5).map((a, idx) => (
                      <div key={idx} className={styles.anomalyItem}>
                        <span className={styles.anomalyBadge}>Mục #{a.index}</span>
                        <span className={styles.anomalyMsg}>{a.message}</span>
                      </div>
                    ))}
                    {sequenceAnalysis.anomalies.length > 5 && (
                      <button
                        type="button"
                        className={styles.toggleAnomalyBtn}
                        onClick={() => setShowAllAnomalies(!showAllAnomalies)}
                      >
                        {showAllAnomalies ? '▲ Thu gọn' : `▼ Xem toàn bộ ${sequenceAnalysis.anomalies.length} cảnh báo`}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className={styles.perfectSequenceBox}>
                  <GlyphIcon value="check-circle" size={15} />
                  <span><strong>Thứ tự số chương liền mạch:</strong> Các chương tăng tiến liên tục (+1), không nhảy số.</span>
                </div>
              )}

              <div className={styles.chapterPreviewList}>
                {parsedChapters.slice(0, 5).map((ch, i) => (
                  <div key={i} className={styles.chapterPreviewItem}>
                    <span className={styles.chapterPreviewNum}>{i + 1}</span>
                    <span className={styles.chapterPreviewTitle}>
                      {ch.title}
                      {ch.isExtra && <span className={styles.extraTag}>Ngoại truyện</span>}
                    </span>
                  </div>
                ))}
                {parsedChapters.length > 5 && (
                  <div className={styles.chapterPreviewMore}>
                    ...và {parsedChapters.length - 5} chương tiếp theo
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Sticky Bottom Action Bar */}
      <ActionBar>
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
        >
          Hủy
        </Button>
        <Button
          variant="primary"
          icon="save"
          id="btn-save-novel"
          loading={saving}
          disabled={saving || !title.trim()}
          onClick={handleSave}
        >
          {saving ? 'Đang lưu...' : 'Lưu truyện'}
        </Button>
      </ActionBar>

      <Footer />

      {/* Image Cropper Modal */}
      {cropModalOpen && (
        <ImageCropperModal
          imageSrc={rawImageForCrop}
          onCrop={handleCroppedCover}
          onClose={() => setCropModalOpen(false)}
        />
      )}
    </PageShell>
  );
}
