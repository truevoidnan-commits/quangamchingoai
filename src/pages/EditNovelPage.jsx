import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Icon, { GlyphIcon } from '../components/ui/Icon';
import { getNovel, saveNovel } from '../lib/db';
import { updateLibraryItem } from '../lib/storage';
import { resizeCoverImage, makeCoverThumb } from '../lib/chapterParser';
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
  Button,
  ActionBar,
} from '../components/ui/FormKit';
import styles from './AddNovelPage.module.css';

export default function EditNovelPage() {
  const { id, novelId: rawNovelId } = useParams();
  const novelId = rawNovelId || id;
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [coverPreview, setCoverPreview] = useState('');
  const [coverUrlInput, setCoverUrlInput] = useState('');
  const [coverTab, setCoverTab] = useState('upload');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [rawImageForCrop, setRawImageForCrop] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (!novelId) return;
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

  const handleCoverFile = async (file) => {
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

  const handleCroppedCover = (croppedDataUrl) => {
    setCoverPreview(croppedDataUrl);
    setCoverUrl(croppedDataUrl);
  };

  const handleSave = async () => {
    if (saving) return;
    if (!title.trim()) {
      alert('Vui lòng nhập tên truyện.');
      return;
    }
    if (!novelId) {
      alert('Không tìm thấy thông tin truyện để sửa.');
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

      const existing = await getNovel(novelId);
      const updated = {
        ...(existing || {}),
        id: novelId,
        title: title.trim(),
        description: description.trim(),
        coverUrl,
        coverThumb,
      };
      await saveNovel(updated);
      updateLibraryItem(novelId, {
        title: updated.title,
        coverThumb,
        coverUrl: /^https?:\/\//i.test(coverUrl) ? coverUrl : undefined,
      });
      navigate(`/novel/${novelId}`);
    } catch (err) {
      alert('Lỗi khi lưu: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell backdrop="text">
      <PageHeader
        backLabel="Quay lại"
        title="Sửa Thông Tin Truyện"
        subtitle={title || 'Chỉnh sửa tiêu đề, mô tả và ảnh bìa'}
      />

      {/* 1. CARD: THÔNG TIN TRUYỆN */}
      <Card
        icon="book"
        title="Thông Tin Cơ Bản"
        subtitle="Cập nhật tên truyện và tóm tắt giới thiệu tác phẩm"
      >
        <Field label="Tên truyện *" id="edit-novel-title">
          <TextInput
            id="edit-novel-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Nhập tên truyện..."
          />
        </Field>

        <Field label="Giới thiệu" optional id="edit-novel-desc">
          <TextArea
            id="edit-novel-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tóm tắt nội dung truyện..."
            rows={4}
            maxLength={3000}
          />
        </Field>
      </Card>

      {/* 2. CARD: ẢNH BÌA */}
      <Card
        icon="image"
        title="Ảnh Bìa Tác Phẩm"
        subtitle="Hiển thị theo tỉ lệ chuẩn 3:4"
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
                      setError('URL ảnh không hợp lệ.');
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

        {error && (
          <div className={styles.parseError}>
            <Icon name="alert-triangle" size={15} />
            <span>{error}</span>
          </div>
        )}
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
          id="btn-update-novel"
          loading={saving}
          disabled={saving || !title.trim()}
          onClick={handleSave}
        >
          {saving ? 'Đang lưu...' : 'Cập nhật'}
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
