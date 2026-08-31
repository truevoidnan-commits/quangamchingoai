import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { nanoid } from '../lib/nanoid';
import { getNovel, getChapter, saveChapter, getChapters, saveChaptersBulk, saveNovel } from '../lib/db';
import { updateLibraryItem, getLibrary } from '../lib/storage';
import { normalizeVietnamese, formatChapterContent } from '../lib/textFixer';
import { parseNovelFile, parseTxtFile, analyzeChapterSequence } from '../lib/chapterParser';
import WordCounter from '../components/ui/WordCounter';
import Footer from '../components/layout/Footer';
import styles from './AddChapterPage.module.css';

export default function AddChapterPage() {
  const { id, novelId: rawNovelId, chapterId } = useParams();
  const novelId = rawNovelId || id;
  const navigate = useNavigate();
  const isEdit = Boolean(chapterId);

  // Novel & existing chapters context
  const [novel, setNovel] = useState(null);
  const [existingChapters, setExistingChapters] = useState([]);
  const [, setLoadingContext] = useState(true);

  // Mode: 'single' (Thủ công) | 'file' (Thêm từ file)
  const [mode, setMode] = useState('single');

  // ---- Single Chapter Form State ----
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [order, setOrder] = useState('');
  const [isExtra, setIsExtra] = useState(false);
  const [extraLabel, setExtraLabel] = useState('');
  const [savingSingle, setSavingSingle] = useState(false);
  const [autoFix, setAutoFix] = useState(true);

  // Quick single file input ref for manual mode
  const singleFileRef = useRef(null);

  // ---- File Batch Import State ----
  const [, setBatchFiles] = useState([]);
  const [parsedChapters, setParsedChapters] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [savingBatch, setSavingBatch] = useState(false);
  const [startOrderMode, setStartOrderMode] = useState('end'); // 'end' | 'custom'
  const [customStartOrder, setCustomStartOrder] = useState('');
  const [previewFilter, setPreviewFilter] = useState('');
  const [expandedChapterIdx, setExpandedChapterIdx] = useState(null);
  const [showAllAnomalies, setShowAllAnomalies] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const batchFileInputRef = useRef(null);

  // Load novel & existing chapters
  useEffect(() => {
    async function loadData() {
      if (!novelId) return;
      try {
        const [n, chs] = await Promise.all([getNovel(novelId), getChapters(novelId)]);
        setNovel(n);
        setExistingChapters(chs || []);
      } catch (err) {
        console.error('Error loading novel context:', err);
      } finally {
        setLoadingContext(false);
      }
    }
    loadData();
  }, [novelId]);

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

  // ---- Single Mode Handlers ----
  const handleQuickSingleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      if (file.name.endsWith('.txt')) {
        const text = await file.text();
        const parsed = parseTxtFile(text, file.name);
        if (parsed.chapters && parsed.chapters.length > 0) {
          const firstCh = parsed.chapters[0];
          setTitle(firstCh.title || file.name.replace(/\.[^/.]+$/, ''));
          setContent(firstCh.content || '');
          if (firstCh.isExtra) setIsExtra(true);
        } else {
          setTitle(file.name.replace(/\.[^/.]+$/, ''));
          setContent(autoFix ? normalizeVietnamese(text) : text);
        }
      } else if (file.name.endsWith('.epub')) {
        const parsed = await parseNovelFile(file);
        if (parsed.chapters && parsed.chapters.length > 0) {
          const firstCh = parsed.chapters[0];
          setTitle(firstCh.title || file.name.replace(/\.[^/.]+$/, ''));
          setContent(firstCh.content || '');
          if (firstCh.isExtra) setIsExtra(true);
        }
      }
    } catch (err) {
      alert('Không thể đọc file: ' + err.message);
    } finally {
      if (singleFileRef.current) singleFileRef.current.value = '';
    }
  };

  const handleSaveSingle = async () => {
    if (!title.trim()) {
      alert('Vui lòng nhập tiêu đề chương.');
      return;
    }
    setSavingSingle(true);
    try {
      let processedContent = content;
      if (autoFix) {
        processedContent = normalizeVietnamese(content);
      }

      const defaultEndOrder = existingChapters.length > 0
        ? Math.max(...existingChapters.map(c => typeof c.order === 'number' ? c.order : 0)) + 1
        : 0;

      const newOrder = order !== '' ? Number(order) : defaultEndOrder;

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

      // Update novel chapter count in DB and localStorage
      if (!isEdit) {
        const updatedChapters = await getChapters(novelId);
        const newCount = updatedChapters.length;
        if (novel) {
          await saveNovel({ ...novel, chapterCount: newCount, totalChapters: newCount });
        }
        const lib = getLibrary();
        const libItem = lib.find(n => n.id === novelId);
        if (libItem) {
          updateLibraryItem(novelId, { chapterCount: newCount });
        }
      }

      navigate(`/novel/${novelId}`);
    } catch (err) {
      alert('Lỗi khi lưu chương: ' + err.message);
    } finally {
      setSavingSingle(false);
    }
  };

  const handlePaste = () => {
    if (!autoFix) return;
    setTimeout(() => {
      setContent(prev => normalizeVietnamese(prev));
    }, 0);
  };

  // ---- Batch File Import Handlers ----
  const processUploadedFiles = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    setParsing(true);
    setParseError('');
    setParsedChapters([]);
    setBatchFiles(Array.from(files));

    try {
      const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
      const sortedFiles = Array.from(files).sort((a, b) => collator.compare(a.name, b.name));

      let allChapters = [];

      if (sortedFiles.length === 1) {
        // Single file upload (.txt or .epub)
        const file = sortedFiles[0];
        const res = await parseNovelFile(file);
        if (res.chapters && res.chapters.length > 0) {
          allChapters = res.chapters;
        } else {
          throw new Error('Không tìm thấy chương nào trong file. Hãy kiểm tra định dạng.');
        }
      } else {
        // Multiple files upload (.txt files)
        for (const file of sortedFiles) {
          if (file.name.endsWith('.txt')) {
            const text = await file.text();
            const res = parseTxtFile(text, file.name);
            if (res.chapters && res.chapters.length > 1) {
              allChapters.push(...res.chapters);
            } else {
              const cleanTitle = file.name.replace(/\.[^/.]+$/, '').trim();
              const chContent = res.chapters?.[0]?.content || formatChapterContent(text);
              const isExtraCh = /(?:ngoại\s*truyện|phiên\s*ngoại|extra)/i.test(cleanTitle);
              allChapters.push({
                title: cleanTitle,
                content: chContent,
                isExtra: isExtraCh,
              });
            }
          } else if (file.name.endsWith('.epub')) {
            const res = await parseNovelFile(file);
            if (res.chapters && res.chapters.length > 0) {
              allChapters.push(...res.chapters);
            }
          }
        }
      }

      if (allChapters.length === 0) {
        setParseError('Không tìm thấy nội dung chương hợp lệ từ các file đã chọn.');
      } else {
        // Auto-fix Vietnamese if enabled
        const finalizedChapters = allChapters.map(ch => ({
          ...ch,
          title: autoFix ? normalizeVietnamese(ch.title) : ch.title,
          content: autoFix ? normalizeVietnamese(ch.content) : ch.content,
        }));
        setParsedChapters(finalizedChapters);
      }
    } catch (err) {
      setParseError(err.message || 'Lỗi khi đọc file.');
    } finally {
      setParsing(false);
    }
  }, [autoFix]);

  const handleBatchFileChange = (e) => {
    processUploadedFiles(e.target.files);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUploadedFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveParsedChapter = (indexToRemove) => {
    setParsedChapters(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSaveBatch = async () => {
    if (parsedChapters.length === 0) {
      alert('Không có chương nào để lưu.');
      return;
    }

    setSavingBatch(true);

    try {
      // Calculate starting order
      let nextOrder = 0;
      if (startOrderMode === 'end') {
        if (existingChapters.length > 0) {
          const maxOrder = Math.max(...existingChapters.map(c => typeof c.order === 'number' ? c.order : 0));
          nextOrder = maxOrder + 1;
        } else {
          nextOrder = 0;
        }
      } else {
        nextOrder = customStartOrder !== '' ? parseInt(customStartOrder, 10) : existingChapters.length;
        if (isNaN(nextOrder)) nextOrder = existingChapters.length;
      }

      const chaptersToSave = parsedChapters.map((ch, idx) => ({
        id: nanoid(),
        novelId,
        title: ch.title.trim(),
        content: ch.content,
        order: nextOrder + idx,
        isExtra: Boolean(ch.isExtra),
        extraLabel: ch.isExtra ? (ch.extraLabel || 'Ngoại truyện') : '',
      }));

      // Save to IndexedDB
      await saveChaptersBulk(chaptersToSave);

      // Recalculate total chapters
      const allNewChapters = await getChapters(novelId);
      const totalCount = allNewChapters.length;

      if (novel) {
        await saveNovel({
          ...novel,
          chapterCount: totalCount,
          totalChapters: totalCount,
        });
      }

      // Update library item
      const lib = getLibrary();
      const libItem = lib.find(n => n.id === novelId);
      if (libItem) {
        updateLibraryItem(novelId, { chapterCount: totalCount });
      }

      navigate(`/novel/${novelId}`);
    } catch (err) {
      alert('Lỗi khi lưu danh sách chương: ' + err.message);
    } finally {
      setSavingBatch(false);
    }
  };

  // Sequence check for parsed batch chapters (also checks gap vs existing DB chapters)
  const sequenceAnalysis = analyzeChapterSequence(parsedChapters, existingChapters);

  // Filtered preview chapters
  const filteredChapters = parsedChapters.filter((ch, i) => {
    if (!previewFilter.trim()) return true;
    const q = previewFilter.toLowerCase();
    return ch.title.toLowerCase().includes(q) || String(i + 1).includes(q);
  });

  const nextDefaultOrder = existingChapters.length > 0
    ? Math.max(...existingChapters.map(c => typeof c.order === 'number' ? c.order : 0)) + 1
    : 0;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className="btn-ghost" onClick={() => navigate(-1)}>← Quay lại</button>
        <div className={styles.headerTitleWrap}>
          <h1 className={styles.pageTitle}>
            {isEdit ? 'Sửa chương' : 'Thêm chương mới'}
          </h1>
          {novel && (
            <span className={styles.headerSub}>
              {novel.title} • Hiện có <strong style={{ color: 'var(--accent-gold)' }}>{existingChapters.length}</strong> chương
            </span>
          )}
        </div>
      </div>

      <div className={styles.formContainer}>
        {/* Mode Selector Tabs (only in create mode) */}
        {!isEdit && (
          <div className={styles.modeTabs}>
            <button
              type="button"
              className={`${styles.modeTab} ${mode === 'single' ? styles.modeTabActive : ''}`}
              onClick={() => setMode('single')}
            >
              ✍️ Nhập thủ công (Từng chương)
            </button>
            <button
              type="button"
              className={`${styles.modeTab} ${mode === 'file' ? styles.modeTabActive : ''}`}
              onClick={() => setMode('file')}
            >
              📂 Thêm từ file (.txt / .epub)
            </button>
          </div>
        )}

        {/* ================= MODE 1: NHẬP THỦ CÔNG ================= */}
        {mode === 'single' && (
          <div className={styles.form}>
            {/* Quick single file loader */}
            {!isEdit && (
              <div className={styles.quickFileBar}>
                <span className={styles.quickFileTip}>💡 Có file chương lẻ (.txt)?</span>
                <input
                  ref={singleFileRef}
                  type="file"
                  accept=".txt,.epub"
                  onChange={handleQuickSingleFile}
                  style={{ display: 'none' }}
                  id="single-file-input"
                />
                <button
                  type="button"
                  className={`btn-ghost ${styles.quickFileBtn}`}
                  onClick={() => singleFileRef.current?.click()}
                >
                  📄 Nạp nội dung từ file .txt vào ô nhập
                </button>
              </div>
            )}

            {/* Chapter title */}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="ch-title">Tiêu đề chương *</label>
              <input
                id="ch-title"
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Vd: Chương 1: Khởi đầu..."
                className={styles.input}
                autoFocus={!isEdit}
              />
            </div>

            {/* Order and Extra Chapter */}
            <div className={styles.row}>
              <div className={styles.field} style={{ flex: 1 }}>
                <label className={styles.label} htmlFor="ch-order">Vị trí (thứ tự sắp xếp)</label>
                <input
                  id="ch-order"
                  type="number"
                  value={order}
                  onChange={e => setOrder(e.target.value)}
                  placeholder={`Tự động: #${nextDefaultOrder} (cuối danh sách)`}
                  min={0}
                  className={styles.input}
                />
                <span className={styles.hint}>Để trống = chèn vào cuối (#{nextDefaultOrder}). Nhập số = chèn vị trí tùy ý.</span>
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
                  <span className={`badge ${isExtra ? 'badge-extra' : ''}`} style={{ fontSize: 13, cursor: 'pointer' }}>
                    {isExtra ? '✦ Ngoại truyện / Phiên ngoại' : 'Chương chính'}
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
              <span className={styles.toggleLabel}>🔧 Tự động sửa lỗi dấu tiếng Việt khi dán/gõ</span>
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
                rows={18}
                spellCheck={false}
              />
            </div>

            {/* Actions */}
            <div className={styles.actions}>
              <button className="btn-ghost" onClick={() => navigate(-1)}>Hủy</button>
              <button
                className="btn-gold"
                onClick={handleSaveSingle}
                disabled={savingSingle || !title.trim()}
                id="btn-save-chapter"
              >
                {savingSingle ? '⏳ Đang lưu...' : isEdit ? '💾 Lưu thay đổi' : '💾 Lưu chương'}
              </button>
            </div>
          </div>
        )}

        {/* ================= MODE 2: THÊM TỪ FILE ================= */}
        {mode === 'file' && (
          <div className={styles.form}>
            {/* File Dropzone */}
            <div className={styles.field}>
              <label className={styles.label}>Tải lên file truyện (.txt hoặc .epub)</label>

              <div
                className={`${styles.dropZone} ${isDragOver ? styles.dropZoneActive : ''}`}
                onClick={() => batchFileInputRef.current?.click()}
                onDragOver={e => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
              >
                <input
                  ref={batchFileInputRef}
                  type="file"
                  accept=".txt,.epub"
                  multiple
                  onChange={handleBatchFileChange}
                  style={{ display: 'none' }}
                  id="batch-novel-file-input"
                />
                <div className={styles.dropPlaceholder}>
                  <span className={styles.dropIcon}>📚</span>
                  <span className={styles.dropMainText}>
                    Nhấn vào đây hoặc Kéo thả file <strong>.txt / .epub</strong> vào đây
                  </span>
                  <span className={styles.dropHint}>
                    Hỗ trợ chọn 1 file lớn có nhiều chương HOẶC chọn nhiều file .txt (mỗi file 1 chương)
                  </span>
                </div>
              </div>
            </div>

            {/* Options bar: Auto-fix & Insertion Position */}
            <div className={styles.fileOptionsCard}>
              <div className={styles.optionsRow}>
                <label className={styles.toggleRow} style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={autoFix}
                    onChange={e => setAutoFix(e.target.checked)}
                    className={styles.checkbox}
                  />
                  <span className={styles.toggleLabel}>🔧 Tự động chuẩn hóa dấu tiếng Việt</span>
                </label>
              </div>

              <div className={styles.insertPositionWrap}>
                <span className={styles.subLabel}>Vị trí nối tiếp chương vào truyện:</span>
                <div className={styles.radioGroup}>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="startOrder"
                      value="end"
                      checked={startOrderMode === 'end'}
                      onChange={() => setStartOrderMode('end')}
                    />
                    <span>Nối tiếp vào cuối truyện (Bắt đầu từ thứ tự <strong>#{nextDefaultOrder}</strong>)</span>
                  </label>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="startOrder"
                      value="custom"
                      checked={startOrderMode === 'custom'}
                      onChange={() => setStartOrderMode('custom')}
                    />
                    <span>Tùy chỉnh số thứ tự bắt đầu:</span>
                    {startOrderMode === 'custom' && (
                      <input
                        type="number"
                        value={customStartOrder}
                        onChange={e => setCustomStartOrder(e.target.value)}
                        placeholder={`vd: ${nextDefaultOrder}`}
                        className={styles.customOrderInput}
                        min={0}
                      />
                    )}
                  </label>
                </div>
              </div>
            </div>

            {/* Cảnh báo khi order bị lệch so với số chương thực tế */}
            {existingChapters.length > 0 && nextDefaultOrder > existingChapters.length && (
              <div style={{
                marginTop: 0,
                marginBottom: 4,
                padding: '8px 14px',
                background: 'rgba(234,179,8,0.10)',
                border: '1px solid rgba(234,179,8,0.4)',
                borderRadius: 8,
                fontSize: 13,
                color: '#fbbf24',
                lineHeight: 1.6,
              }}>
                ⚠️ <strong>Phát hiện lệch thứ tự:</strong> Truyện có{' '}
                <strong>{existingChapters.length}</strong> chương nhưng thứ tự (order) cuối cùng là{' '}
                <strong>#{nextDefaultOrder - 1}</strong> — lệch{' '}
                <strong>{nextDefaultOrder - existingChapters.length}</strong> vị trí.
                {' '}Chương mới sẽ được gán thứ tự <strong>#{nextDefaultOrder}</strong> thay vì #{existingChapters.length}.
                {' '}Hãy kiểm tra lại thứ tự các chương trong trang quản lý truyện.
              </div>
            )}

            {/* Parsing State */}
            {parsing && (
              <div className={styles.parsingIndicator}>
                <div className={styles.spinner} />
                <span>⏳ Đang phân tích và bóc tách các chương... Vui lòng đợi trong giây lát</span>
              </div>
            )}

            {/* Parse Error */}
            {parseError && (
              <div className={styles.parseError}>⚠️ {parseError}</div>
            )}

            {/* Parsed Result Display */}
            {parsedChapters.length > 0 && (
              <div className={styles.parseResult}>
                {/* Result Header */}
                <div className={styles.parseResultHeader}>
                  <div className={styles.parseResultSummary}>
                    <span className={styles.parseSuccessBadge}>
                      ✅ Đã tách được <strong>{parsedChapters.length}</strong> chương
                    </span>
                    {parsedChapters.filter(c => c.isExtra).length > 0 && (
                      <span className="badge badge-extra">
                        {parsedChapters.filter(c => c.isExtra).length} ngoại truyện
                      </span>
                    )}
                    <span className={styles.wordCountTotal}>
                      ~{parsedChapters.reduce((acc, c) => acc + (c.content?.length || 0), 0).toLocaleString()} ký tự
                    </span>
                  </div>

                  <button
                    type="button"
                    className={`btn-ghost ${styles.clearBtn}`}
                    onClick={() => {
                      setParsedChapters([]);
                      setBatchFiles([]);
                    }}
                  >
                    🗑️ Xóa danh sách tải lên
                  </button>
                </div>

                {/* Chapter Sequence Check Warnings */}
                {sequenceAnalysis.anomalies.length > 0 ? (
                  <div className={styles.anomalyWarningBox}>
                    <div className={styles.anomalyHeader}>
                      <span className={styles.anomalyIcon}>⚠️</span>
                      <strong>PHÁT HIỆN {sequenceAnalysis.anomalies.length} VỊ TRÍ NHẢY SỐ CHƯƠNG BẤT THƯỜNG:</strong>
                    </div>
                    <p className={styles.anomalyDesc}>
                      Thứ tự số chương trong file không tăng đều đặn (+1). Vui lòng kiểm tra lại trước khi lưu:
                    </p>
                    <div className={styles.anomalyList}>
                      {sequenceAnalysis.anomalies.slice(0, showAllAnomalies ? sequenceAnalysis.anomalies.length : 4).map((a, idx) => (
                        <div key={idx} className={styles.anomalyItem}>
                          <span className={styles.anomalyBadge}>Vị trí #{a.index}</span>
                          <span className={styles.anomalyMsg}>{a.message}</span>
                        </div>
                      ))}
                      {sequenceAnalysis.anomalies.length > 4 && (
                        <button
                          type="button"
                          className={styles.toggleAnomalyBtn}
                          onClick={() => setShowAllAnomalies(!showAllAnomalies)}
                        >
                          {showAllAnomalies ? '▲ Thu gọn cảnh báo' : `▼ Xem toàn bộ ${sequenceAnalysis.anomalies.length} cảnh báo nhảy số...`}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className={styles.perfectSequenceBox}>
                    <span>✨ <strong>Thứ tự số chương liền mạch 100%</strong>: Các chương tăng tiến liên tục (+1){existingChapters.length > 0 ? ', kể cả tại điểm nối với truyện đang có' : ''} — không có nhảy số hay thiếu chương.</span>
                  </div>
                )}

                {/* Chapter Preview & Filter Bar */}
                <div className={styles.previewToolbar}>
                  <span className={styles.previewToolbarTitle}>Danh sách chương chuẩn bị thêm:</span>
                  <input
                    type="text"
                    value={previewFilter}
                    onChange={e => setPreviewFilter(e.target.value)}
                    placeholder="🔍 Lọc theo tên hoặc số..."
                    className={styles.filterInput}
                  />
                </div>

                {/* Chapters List */}
                <div className={styles.chapterPreviewList}>
                  {filteredChapters.length === 0 ? (
                    <div className={styles.emptyFilter}>Không tìm thấy chương khớp với từ khóa lọc.</div>
                  ) : (
                    filteredChapters.slice(0, 100).map((ch, idx) => {
                      const actualOrder = (startOrderMode === 'custom' && customStartOrder !== '' ? parseInt(customStartOrder, 10) : nextDefaultOrder) + idx;
                      const isExpanded = expandedChapterIdx === idx;

                      return (
                        <div key={idx} className={styles.chapterPreviewItem}>
                          <div className={styles.chapterItemMain}>
                            <span className={styles.chapterOrderBadge}>#{actualOrder}</span>
                            <div className={styles.chapterTitleWrap}>
                              <span className={styles.chapterPreviewTitle}>
                                {ch.title}
                              </span>
                              {ch.isExtra && (
                                <span className="badge badge-extra" style={{ fontSize: 10 }}>Ngoại truyện</span>
                              )}
                              <span className={styles.chapterWords}>
                                ~{ch.content ? Math.round(ch.content.split(/\s+/).length) : 0} chữ
                              </span>
                            </div>

                            <div className={styles.itemActions}>
                              <button
                                type="button"
                                className={styles.snippetBtn}
                                onClick={() => setExpandedChapterIdx(isExpanded ? null : idx)}
                                title="Xem trước nội dung"
                              >
                                {isExpanded ? '▲ Đóng' : '👁️ Xem'}
                              </button>
                              <button
                                type="button"
                                className={styles.deleteItemBtn}
                                onClick={() => handleRemoveParsedChapter(idx)}
                                title="Bỏ chương này"
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          {/* Expanded Content Snippet */}
                          {isExpanded && (
                            <div className={styles.contentSnippetBox}>
                              <pre className={styles.contentSnippetText}>
                                {ch.content?.slice(0, 400)}
                                {ch.content?.length > 400 ? '...\n(và còn tiếp)' : ''}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}

                  {filteredChapters.length > 100 && (
                    <div className={styles.chapterPreviewMore}>
                      ...và còn {filteredChapters.length - 100} chương nữa đã được tải sẵn sàng
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions for Batch Mode */}
            <div className={styles.actions}>
              <button className="btn-ghost" onClick={() => navigate(-1)}>Hủy</button>
              <button
                className="btn-gold"
                onClick={handleSaveBatch}
                disabled={savingBatch || parsedChapters.length === 0}
                id="btn-save-batch-chapters"
              >
                {savingBatch
                  ? `⏳ Đang lưu (${parsedChapters.length} chương)...`
                  : `💾 Lưu tất cả ${parsedChapters.length} chương vào truyện`}
              </button>
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
