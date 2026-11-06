import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import NovelCard from '../components/ui/NovelCard';
import Footer from '../components/layout/Footer';
import TextBackdrop from '../components/layout/TextBackdrop';
import VaultLockModal from '../components/vault/VaultLockModal';
import {
  getLibrary,
  removeFromLibrary,
  hideNovel,
  unhideNovel,
  hasVaultPassword,
  isVaultSessionUnlocked,
  setVaultSessionUnlocked,
  lockVaultSession,
} from '../lib/storage';
import { deleteNovelDB } from '../lib/db';
import { sampleNovel, sampleCatalogEntry, sampleChapters } from '../lib/sampleData';
import { saveNovel, saveChaptersBulk } from '../lib/db';
import { addToLibrary } from '../lib/storage';
import { useCultivation } from '../hooks/useCultivation';
import { runMigrationV2 } from '../lib/migration';
import { clearPersistedSort } from '../hooks/usePersistedSort';
import LobbyTabs from '../components/ui/LobbyTabs';
import {
  IconSearch,
  IconLock,
  IconGrid,
  IconList,
  IconPlus,
  IconBook,
  IconClose,
} from '../components/novel/NovelIcons';
import styles from './LibraryPage.module.css';

const NovelExportModal = lazy(() => import('../components/novel/NovelExportModal'));

export default function LibraryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedVault = searchParams.get('vault') === '1';
  const { displayName } = useCultivation();
  const [allNovels, setAllNovels] = useState([]);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null); // novel to confirm delete
  const [seeded, setSeeded] = useState(false);
  const [novelToExport, setNovelToExport] = useState(null);

  // Hidden Vault States
  const [isVaultUnlocked, setIsVaultUnlocked] = useState(() => isVaultSessionUnlocked());
  const [isVaultMode, setIsVaultMode] = useState(() => {
    return requestedVault && isVaultSessionUnlocked();
  });
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

  // Sync isVaultMode when searchParams or isVaultUnlocked changes
  useEffect(() => {
    if (requestedVault) {
      if (isVaultSessionUnlocked()) {
        setIsVaultUnlocked(true);
        setIsVaultMode(true);
      } else {
        setIsVaultMode(false);
        if (!hasVaultPassword()) {
          setVaultModalMode('set');
        } else {
          setVaultModalMode('unlock');
        }
        setVaultModalOpen(true);
      }
    } else {
      setIsVaultMode(false);
    }
  }, [requestedVault, isVaultUnlocked]);

  // Listen to background library updates
  useEffect(() => {
    const handleLibraryUpdated = () => {
      refreshLibrary();
    };
    window.addEventListener('tcl_library_updated', handleLibraryUpdated);
    return () => {
      window.removeEventListener('tcl_library_updated', handleLibraryUpdated);
    };
  }, [refreshLibrary]);

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

  // Load library & run migration v2
  useEffect(() => {
    let active = true;

    const pendingRecovery = sessionStorage.getItem('tcl_pending_recovery_toast');
    if (pendingRecovery) {
      sessionStorage.removeItem('tcl_pending_recovery_toast');
      showToast(`Đã khôi phục ${pendingRecovery} truyện`);
      refreshLibrary();
    }

    runMigrationV2()
      .then((res) => {
        if (!active) return;
        if (res && res.recoveredCount > 0) {
          showToast(`Đã khôi phục ${res.recoveredCount} truyện`);
          refreshLibrary();
        }
      })
      .catch((err) => {
        console.warn('[LibraryPage] Lỗi migration v2:', err);
      });

    refreshLibrary();

    return () => {
      active = false;
    };
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
    clearPersistedSort('tcl:chapterSort:' + deleteConfirm.id);
    refreshLibrary();
    setDeleteConfirm(null);
    showToast(`Đã xóa "${deleteConfirm.title}"`);
  };

  // ---- Vault Actions ----

  const handleToggleVaultAccess = () => {
    if (isVaultMode) {
      navigate('/');
      return;
    }

    if (isVaultUnlocked) {
      navigate('/?vault=1');
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
    setVaultSessionUnlocked(true);
    setVaultModalOpen(false);

    if (vaultModalMode === 'first_hide' && novelToHidePending) {
      hideNovel(novelToHidePending.id);
      refreshLibrary();
      showToast(`Đã thiết lập mật khẩu & chuyển "${novelToHidePending.title}" vào Mật Thất`);
      setNovelToHidePending(null);
    } else if (vaultModalMode === 'change') {
      showToast('Đã đổi mật khẩu Mật Thất thành công');
    } else {
      setIsVaultMode(true);
      navigate('/?vault=1');
      showToast('Đã mở khóa Tàng Kinh Mật Thất');
    }
  };

  const handleLockVault = () => {
    lockVaultSession();
    setIsVaultUnlocked(false);
    setIsVaultMode(false);
    navigate('/');
    showToast('Đã đóng & khóa Mật Thất');
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
    showToast(`Đã ẩn "${novel.title}" vào Mật Thất`);
  };

  const handleUnhideNovel = (novel) => {
    unhideNovel(novel.id);
    refreshLibrary();
    showToast(`Đã khôi phục "${novel.title}" về Thư Viện Chính`);
  };

  return (
    <div className={styles.page}>
      {/* Background Ink-Wash */}
      <TextBackdrop />

      {/* ===== HERO BANNER ===== */}
      <section className={`${styles.banner} ${isVaultMode ? styles.vaultBanner : ''}`}>
        <div className={styles.bannerContent}>
          <div className={styles.bannerBadge}>
            {isVaultMode ? 'MẬT THẤT' : 'TRUYỆN CHỮ'}
          </div>

          <h1 className={styles.appTitle}>
            {isVaultMode ? 'TÀNG KINH MẬT THẤT' : 'THIÊN CƠ LÂU'}
          </h1>

          <p className={styles.appSubtitle}>
            {isVaultMode
              ? 'Không Gian Truyện Ẩn · Cấm Chế Bảo Hộ'
              : 'Trình Đọc Truyện Chữ · Đồng Bộ Mọi Thiết Bị'}
          </p>

          <div className={styles.neonBar} aria-hidden="true" />
        </div>
      </section>

      {/* ===== TAB SWITCHER ===== */}
      {!isVaultMode && <LobbyTabs activeTab="novels" />}

      {/* ===== VAULT TOP BAR (If in Vault Mode) ===== */}
      {isVaultMode && (
        <div className={styles.vaultTopBar}>
          <button className={styles.vaultBackBtn} onClick={() => navigate('/')}>
            ← Về Thư Viện Chính
          </button>
          <div className={styles.vaultRightActions}>
            <button className={styles.vaultActionBtn} onClick={handleChangePassword} title="Đổi mật khẩu Mật Thất">
              Đổi mật khẩu
            </button>
            <button className={styles.vaultActionBtn} onClick={handleLockVault} title="Khóa Mật Thất ngay">
              Khóa lại
            </button>
          </div>
        </div>
      )}

      {/* ===== CONTAINER ===== */}
      <div className={styles.container}>
        {/* ===== TOOLBAR ===== */}
        <div className={styles.toolbar}>
          {/* Row 1 / Search */}
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon} aria-hidden="true">
              <IconSearch size={16} />
            </span>
            <input
              type="search"
              placeholder={isVaultMode ? 'Tìm truyện trong Mật Thất...' : 'Tìm kiếm truyện...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
              id="search-input"
              aria-label="Tìm kiếm truyện"
            />
            {search && (
              <button
                type="button"
                className={styles.searchClearBtn}
                onClick={() => setSearch('')}
                title="Xóa tìm kiếm"
              >
                <IconClose size={14} />
              </button>
            )}
          </div>

          {/* Toolbar Actions */}
          <div className={styles.toolbarActions}>
            {/* Secret Vault Toggle Button */}
            <button
              className={`${styles.vaultToggleBtn} ${isVaultMode ? styles.vaultActiveBtn : ''}`}
              onClick={handleToggleVaultAccess}
              title={isVaultMode ? 'Quay về Thư Viện Chính' : 'Mở Tàng Kinh Mật Thất (Truyện Ẩn)'}
            >
              <IconLock size={15} />
              <span className={styles.vaultBtnLabel}>{isVaultMode ? 'Thư Viện' : 'Mật Thất'}</span>
              {!isVaultMode && hiddenNovels.length > 0 && (
                <span className={styles.vaultBadgeCount}>{hiddenNovels.length}</span>
              )}
            </button>

            {/* Segmented Grid / List Control */}
            <div className={styles.viewSegmentedControl} role="group" aria-label="Chế độ xem">
              <button
                type="button"
                className={`${styles.viewSegmentBtn} ${viewMode === 'grid' ? styles.viewSegmentActive : ''}`}
                onClick={() => setViewMode('grid')}
                aria-label="Xem dạng lưới"
                title="Xem dạng lưới"
              >
                <IconGrid size={15} />
              </button>
              <button
                type="button"
                className={`${styles.viewSegmentBtn} ${viewMode === 'list' ? styles.viewSegmentActive : ''}`}
                onClick={() => setViewMode('list')}
                aria-label="Xem dạng danh sách"
                title="Xem dạng danh sách"
              >
                <IconList size={15} />
              </button>
            </div>

            {/* Novel count indicator */}
            <div className={styles.novelCountBadge}>
              {currentList.length} truyện
            </div>

            {/* Add Novel Button */}
            {isVaultMode ? (
              <button
                className={styles.addVaultBtn}
                onClick={() => navigate('/add-novel?vault=1')}
                id="btn-add-novel-vault"
              >
                <IconPlus size={15} />
                <span>+ Thêm vào Mật Thất</span>
              </button>
            ) : (
              <button
                className={styles.addBtn}
                onClick={() => navigate('/add-novel')}
                id="btn-add-novel"
              >
                <IconPlus size={15} />
                <span>Thêm truyện</span>
              </button>
            )}
          </div>
        </div>

        {/* ===== NOVEL GRID / LIST ===== */}
        <main className={styles.main}>
          {filteredList.length === 0 && !search && (
            <EmptyState
              isVault={isVaultMode}
              onAdd={() => navigate(isVaultMode ? '/add-novel?vault=1' : '/add-novel')}
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
              {filteredList.map((novel, idx) => (
                <NovelCard
                  key={novel.id}
                  novel={novel}
                  viewMode={viewMode}
                  isVaultMode={isVaultMode}
                  index={idx}
                  onClick={handleNovelClick}
                  onEdit={handleEdit}
                  onDelete={handleDeleteRequest}
                  onHide={handleHideNovel}
                  onUnhide={handleUnhideNovel}
                  onExport={(n) => {
                    if (n.isHidden && !isVaultUnlocked) return;
                    setNovelToExport(n);
                  }}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      <Footer />

      {/* Novel Export Modal */}
      {novelToExport && (
        <Suspense fallback={null}>
          <NovelExportModal
            novel={novelToExport}
            novelId={novelToExport.id}
            onClose={() => setNovelToExport(null)}
          />
        </Suspense>
      )}

      {/* Vault Password Modal */}
      <VaultLockModal
        isOpen={vaultModalOpen}
        mode={vaultModalMode}
        novelToHide={novelToHidePending}
        onSuccess={handleVaultSuccess}
        onClose={() => {
          setVaultModalOpen(false);
          setNovelToHidePending(null);
          if (requestedVault && !isVaultSessionUnlocked()) {
            navigate('/');
          }
        }}
      />

      {/* Floating Toast Notification */}
      {toastMsg && (
        <div className={styles.toast} role="status">
          <span className={styles.toastDot}>•</span>
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
        <div className={styles.emptyIconWrap}>
          <IconLock size={36} color="#c084fc" />
        </div>
        <h2 className={styles.emptyTitle}>Mật Thất trống</h2>
        <p className={styles.emptyDesc}>
          Chưa có truyện nào trong Mật Thất. Bạn có thể nhấn giữ (hoặc nhấp chuột phải) bất kỳ truyện nào ở Thư Viện Chính để ẩn vào đây.
        </p>
        <button
          className={styles.emptyAddBtnVault}
          onClick={onAdd}
          id="empty-add-vault-novel"
        >
          <IconPlus size={15} />
          <span>Thêm truyện vào Mật Thất</span>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIconWrap}>
        <IconBook size={40} />
      </div>
      <h2 className={styles.emptyTitle}>Chưa có truyện nào</h2>
      <p className={styles.emptyDesc}>Hãy thêm tác phẩm đầu tiên để bắt đầu trải nghiệm đọc.</p>
      <button className={styles.emptyAddBtn} onClick={onAdd} id="empty-add-novel">
        <IconPlus size={15} />
        <span>Thêm truyện mới</span>
      </button>
    </div>
  );
}
