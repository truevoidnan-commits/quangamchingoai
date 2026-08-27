import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import NovelCard from '../components/ui/NovelCard';
import Footer from '../components/layout/Footer';
import VaultLockModal from '../components/vault/VaultLockModal';
import {
  getLibrary,
  removeFromLibrary,
  hideNovel,
  unhideNovel,
  hasVaultPassword,
} from '../lib/storage';
import { deleteNovelDB } from '../lib/db';
import { sampleNovel, sampleCatalogEntry, sampleChapters } from '../lib/sampleData';
import { saveNovel, saveChaptersBulk } from '../lib/db';
import { addToLibrary } from '../lib/storage';
import { useCultivation } from '../hooks/useCultivation';
import styles from './LibraryPage.module.css';

export default function LibraryPage() {
  const navigate = useNavigate();
  const { displayName } = useCultivation();
  const [allNovels, setAllNovels] = useState([]);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null); // novel to confirm delete
  const [seeded, setSeeded] = useState(false);

  // Hidden Vault States
  const [isVaultMode, setIsVaultMode] = useState(false);
  const [isVaultUnlocked, setIsVaultUnlocked] = useState(false);
  const [vaultModalOpen, setVaultModalOpen] = useState(false);
  const [vaultModalMode, setVaultModalMode] = useState('unlock'); // 'unlock' | 'set' | 'change' | 'first_hide'
  const [novelToHidePending, setNovelToHidePending] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3200);
  };

  const refreshLibrary = useCallback(() => {
    setAllNovels(getLibrary({ includeHidden: true }));
  }, []);

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
    refreshLibrary();
  }, [seeded, refreshLibrary]);

  // Split into visible and hidden novels
  const visibleNovels = allNovels.filter((n) => !n.isHidden);
  const hiddenNovels = allNovels.filter((n) => Boolean(n.isHidden));

  // Current active list depending on mode
  const currentList = isVaultMode ? hiddenNovels : visibleNovels;

  const filteredList = search.trim()
    ? currentList.filter((n) => n.title.toLowerCase().includes(search.toLowerCase()))
    : currentList;

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
    refreshLibrary();
    setDeleteConfirm(null);
    showToast(`Đã xóa "${deleteConfirm.title}"`);
  };

  // ---- Vault Actions ----

  const handleToggleVaultAccess = () => {
    if (isVaultMode) {
      setIsVaultMode(false);
      return;
    }

    if (isVaultUnlocked) {
      setIsVaultMode(true);
      return;
    }

    if (!hasVaultPassword()) {
      setVaultModalMode('set');
    } else {
      setVaultModalMode('unlock');
    }
    setVaultModalOpen(true);
  };

  const handleVaultSuccess = () => {
    setIsVaultUnlocked(true);
    setVaultModalOpen(false);

    if (vaultModalMode === 'first_hide' && novelToHidePending) {
      hideNovel(novelToHidePending.id);
      refreshLibrary();
      showToast(`Đã thiết lập mật khẩu & chuyển "${novelToHidePending.title}" vào Mật Thất 🔒`);
      setNovelToHidePending(null);
    } else if (vaultModalMode === 'change') {
      showToast('Đã đổi mật khẩu Mật Thất thành công ✨');
    } else {
      setIsVaultMode(true);
      showToast('Đã mở khóa Tàng Kinh Mật Thất 🔓');
    }
  };

  const handleLockVault = () => {
    setIsVaultUnlocked(false);
    setIsVaultMode(false);
    showToast('Đã khóa Mật Thất 🔒');
  };

  const handleChangePassword = () => {
    setVaultModalMode('change');
    setVaultModalOpen(true);
  };

  // ---- Hide / Unhide Novel ----

  const handleHideNovel = (novel) => {
    if (!hasVaultPassword()) {
      setNovelToHidePending(novel);
      setVaultModalMode('first_hide');
      setVaultModalOpen(true);
      return;
    }

    hideNovel(novel.id);
    refreshLibrary();
    showToast(`Đã ẩn "${novel.title}" vào Mật Thất 🔒`);
  };

  const handleUnhideNovel = (novel) => {
    unhideNovel(novel.id);
    refreshLibrary();
    showToast(`Đã khôi phục "${novel.title}" về Thư Viện Chính 📖`);
  };

  return (
    <div className={styles.page}>
      {/* ===== BANNER ===== */}
      <section className={`${styles.banner} ${isVaultMode ? styles.vaultBanner : ''}`}>
        {/* Decorative background */}
        <div className={styles.bannerBg} aria-hidden="true">
          {isVaultMode ? (
            <div className={styles.vaultBannerGlow} />
          ) : (
            <>
              <div className={styles.bannerGlow1} />
              <div className={styles.bannerGlow2} />
            </>
          )}
        </div>

        <div className={styles.bannerContent}>
          <h1 className={styles.appTitle}>
            {isVaultMode ? 'TÀNG KINH MẬT THẤT' : 'THIÊN CƠ LÂU'}
          </h1>
          <p className={styles.appSubtitle}>
            {isVaultMode
              ? 'Không Gian Truyện Ẩn · Cấm Chế Bảo Hộ'
              : 'Trình đọc truyện chữ'}
          </p>
          <div className={styles.neonBar} aria-hidden="true" />
        </div>
      </section>

      {/* ===== VAULT TOP BAR (If in Vault Mode) ===== */}
      {isVaultMode && (
        <div className={styles.vaultTopBar}>
          <button className={styles.vaultBackBtn} onClick={() => setIsVaultMode(false)}>
            ← Về Thư Viện Chính
          </button>
          <div className={styles.vaultRightActions}>
            <button className={styles.vaultActionBtn} onClick={handleChangePassword} title="Đổi mật khẩu Mật Thất">
              ⚙️ Đổi mật khẩu
            </button>
            <button className={styles.vaultActionBtn} onClick={handleLockVault} title="Khóa Mật Thất ngay">
              🔒 Khóa lại
            </button>
          </div>
        </div>
      )}

      {/* ===== TOOLBAR ===== */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            type="search"
            placeholder={isVaultMode ? 'Tìm truyện trong Mật Thất...' : 'Tìm kiếm truyện...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
            id="search-input"
            aria-label="Tìm kiếm truyện"
          />
        </div>

        <div className={styles.toolbarRight}>
          {/* Secret Vault Toggle Button */}
          <button
            className={`${styles.vaultToggleBtn} ${isVaultMode ? styles.vaultActiveBtn : ''}`}
            onClick={handleToggleVaultAccess}
            title={isVaultMode ? 'Quay về Thư Viện Chính' : 'Mở Tàng Kinh Mật Thất (Truyện Ẩn)'}
          >
            <span>{isVaultMode ? '📖 Thư Viện' : '🔒 Mật Thất'}</span>
            {!isVaultMode && hiddenNovels.length > 0 && (
              <span className={styles.vaultBadgeCount}>{hiddenNovels.length}</span>
            )}
          </button>

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

          {/* Add novel button (only shown in regular library) */}
          {!isVaultMode && (
            <button
              className={`btn-primary ${styles.addBtn} animate-neon-pulse`}
              onClick={() => navigate('/add-novel')}
              id="btn-add-novel"
            >
              + Thêm truyện
            </button>
          )}
        </div>
      </div>

      {/* ===== NOVEL GRID / LIST ===== */}
      <main className={styles.main}>
        {filteredList.length === 0 && !search && (
          <EmptyState
            isVault={isVaultMode}
            onAdd={() => navigate('/add-novel')}
          />
        )}

        {filteredList.length === 0 && search && (
          <div className={styles.noResults}>
            <p>
              Không tìm thấy truyện nào phù hợp với "<strong>{search}</strong>"
            </p>
          </div>
        )}

        {filteredList.length > 0 && (
          <div className={viewMode === 'grid' ? styles.grid : styles.list}>
            {filteredList.map((novel) => (
              <NovelCard
                key={novel.id}
                novel={novel}
                viewMode={viewMode}
                isVaultMode={isVaultMode}
                onClick={handleNovelClick}
                onEdit={handleEdit}
                onDelete={handleDeleteRequest}
                onHide={handleHideNovel}
                onUnhide={handleUnhideNovel}
              />
            ))}
          </div>
        )}
      </main>

      <Footer />

      {/* Vault Password Modal */}
      <VaultLockModal
        isOpen={vaultModalOpen}
        mode={vaultModalMode}
        novelToHide={novelToHidePending}
        onSuccess={handleVaultSuccess}
        onClose={() => {
          setVaultModalOpen(false);
          setNovelToHidePending(null);
        }}
      />

      {/* Floating Toast Notification */}
      {toastMsg && (
        <div className={styles.toast}>
          <span>✨</span>
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Delete confirm dialog */}
      {deleteConfirm && (
        <div className={styles.confirmOverlay} onClick={() => setDeleteConfirm(null)}>
          <div className={styles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.confirmTitle}>Xóa truyện?</h3>
            <p className={styles.confirmMsg}>
              Bạn có chắc muốn xóa "<strong>{deleteConfirm.title}</strong>" và toàn bộ{' '}
              {deleteConfirm.chapterCount} chương? Hành động này không thể hoàn tác.
            </p>
            <div className={styles.confirmActions}>
              <button className="btn-ghost" onClick={() => setDeleteConfirm(null)}>
                Hủy
              </button>
              <button className="btn-danger" onClick={handleDeleteConfirm}>
                Xóa truyện
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ isVault, onAdd }) {
  if (isVault) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIcon}>🔒</div>
        <h2 className={styles.emptyTitle}>Mật Thất trống</h2>
        <p className={styles.emptyDesc}>
          Chưa có truyện nào trong Mật Thất. Bạn có thể nhấn giữ (hoặc nhấp chuột phải) bất kỳ truyện nào ở Thư Viện Chính và chọn "Ẩn truyện" để chuyển vào đây.
        </p>
      </div>
    );
  }

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

