import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import NovelCard from '../components/ui/NovelCard';
import Footer from '../components/layout/Footer';
import { getLibrary, removeFromLibrary } from '../lib/storage';
import { deleteNovelDB, getAllNovels } from '../lib/db';
import { sampleNovel, sampleCatalogEntry, sampleChapters, SAMPLE_NOVEL_ID } from '../lib/sampleData';
import { saveNovel, saveChaptersBulk } from '../lib/db';
import { addToLibrary } from '../lib/storage';
import { useCultivation } from '../hooks/useCultivation';
import styles from './LibraryPage.module.css';

export default function LibraryPage() {
  const navigate = useNavigate();
  const { displayName } = useCultivation();
  const [library, setLibrary] = useState([]);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null); // novel to confirm delete
  const [seeded, setSeeded] = useState(false);

  // Seed sample data on first load
  useEffect(() => {
    const hasSeed = localStorage.getItem('tcl_seeded');
    if (!hasSeed) {
      (async () => {
        try {
          await saveNovel(sampleNovel);
          await saveChaptersBulk(sampleChapters);
          addToLibrary(sampleCatalogEntry);
          localStorage.setItem('tcl_seeded', '1');
          setSeeded(true);
        } catch (e) {
          console.warn('Seed failed:', e);
        }
      })();
    }
  }, []);

  // Load library
  useEffect(() => {
    setLibrary(getLibrary());
  }, [seeded]);

  const filteredLibrary = search.trim()
    ? library.filter(n => n.title.toLowerCase().includes(search.toLowerCase()))
    : library;

  const handleNovelClick = (novel) => {
    navigate(`/novel/${novel.id}`);
  };

  const handleEdit = (novel) => {
    navigate(`/novel/${novel.id}/edit`);
  };

  const handleDeleteRequest = (novel) => {
    setDeleteConfirm(novel);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    await deleteNovelDB(deleteConfirm.id);
    removeFromLibrary(deleteConfirm.id);
    setLibrary(getLibrary());
    setDeleteConfirm(null);
  };

  return (
    <div className={styles.page}>
      {/* ===== BANNER ===== */}
      <section className={styles.banner}>
        {/* Decorative background */}
        <div className={styles.bannerBg} aria-hidden="true">
          <div className={styles.bannerGlow1} />
          <div className={styles.bannerGlow2} />
        </div>

        <div className={styles.bannerContent}>
          <h1 className={styles.appTitle}>THIÊN CƠ LÂU</h1>
          <p className={styles.appSubtitle}>Trình đọc truyện chữ</p>
          <div className={styles.neonBar} aria-hidden="true" />
        </div>
      </section>

      {/* ===== TOOLBAR ===== */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            type="search"
            placeholder="Tìm kiếm truyện..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={styles.searchInput}
            id="search-input"
            aria-label="Tìm kiếm truyện"
          />
        </div>

        <div className={styles.toolbarRight}>
          {/* View mode toggle */}
          <button
            className={`btn-icon ${styles.viewToggle} ${viewMode === 'grid' ? styles.viewActive : ''}`}
            onClick={() => setViewMode('grid')}
            aria-label="Xem dạng lưới"
            title="Lưới"
          >
            ▦
          </button>
          <button
            className={`btn-icon ${styles.viewToggle} ${viewMode === 'list' ? styles.viewActive : ''}`}
            onClick={() => setViewMode('list')}
            aria-label="Xem dạng danh sách"
            title="Danh sách"
          >
            ☰
          </button>

          {/* Add novel button */}
          <button
            className={`btn-primary ${styles.addBtn} animate-neon-pulse`}
            onClick={() => navigate('/add-novel')}
            id="btn-add-novel"
          >
            + Thêm truyện
          </button>
        </div>
      </div>

      {/* ===== NOVEL GRID / LIST ===== */}
      <main className={styles.main}>
        {filteredLibrary.length === 0 && !search && (
          <EmptyState onAdd={() => navigate('/add-novel')} />
        )}

        {filteredLibrary.length === 0 && search && (
          <div className={styles.noResults}>
            <p>Không tìm thấy truyện nào phù hợp với "<strong>{search}</strong>"</p>
          </div>
        )}

        {filteredLibrary.length > 0 && (
          <div className={viewMode === 'grid' ? styles.grid : styles.list}>
            {filteredLibrary.map(novel => (
              <NovelCard
                key={novel.id}
                novel={novel}
                viewMode={viewMode}
                onClick={handleNovelClick}
                onEdit={handleEdit}
                onDelete={handleDeleteRequest}
              />
            ))}
          </div>
        )}
      </main>

      <Footer />

      {/* Delete confirm dialog */}
      {deleteConfirm && (
        <div className={styles.confirmOverlay} onClick={() => setDeleteConfirm(null)}>
          <div className={styles.confirmDialog} onClick={e => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>Xóa truyện?</h3>
            <p className={styles.confirmMsg}>
              Bạn có chắc muốn xóa "<strong>{deleteConfirm.title}</strong>" và toàn bộ {deleteConfirm.chapterCount} chương? Hành động này không thể hoàn tác.
            </p>
            <div className={styles.confirmActions}>
              <button className="btn-ghost" onClick={() => setDeleteConfirm(null)}>Hủy</button>
              <button className="btn-danger" onClick={handleDeleteConfirm}>Xóa truyện</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>📖</div>
      <h2 className={styles.emptyTitle}>Thư viện trống</h2>
      <p className={styles.emptyDesc}>Chưa có truyện nào. Hãy thêm truyện đầu tiên của bạn!</p>
      <button className="btn-primary" onClick={onAdd} id="empty-add-novel">
        + Thêm truyện mới
      </button>
    </div>
  );
}
