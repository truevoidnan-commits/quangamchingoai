import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Icon from '../ui/Icon';
import {
  DAO_ANH_LIST,
  DAO_ANH_ELEMENT_TYPES,
  getDaoAnhElementType,
  getDaoAnhEvolutionImage,
  getDaoAnhBBox,
  getDaoAnhTransformConfig,
  setDaoAnhDevTuneOverrides,
} from '../../lib/daoAnhData';
import { buildOwnershipMap, getDaoAnhStats } from '../../lib/daoAnhGalleryUtils';
import { useCultivationContext } from '../../context/CultivationContext';
import { PersistentImage } from '../../lib/persistentImageCache';
import DaoAnhArt from './DaoAnhArt';
import styles from './DaoAnhGalleryModal.module.css';

class DaoAnhErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.error('[DaoAnhGallery] card render failed:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.cardFallback}>
          <Icon name="alert-triangle" size={18} />
          <span>Không hiển thị được Đạo Anh này</span>
        </div>
      );
    }
    return this.props.children;
  }
}



export default function DaoAnhGalleryModal({ isOpen, onClose, cultivation: propCultivation }) {
  const context = useCultivationContext ? useCultivationContext() : {};
  const cultivation = propCultivation || context?.cultivation;

  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'lamp' | 'artifact'
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [selectedId, setSelectedId] = useState(null);
  const [previewKiep, setPreviewKiep] = useState(5);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  // Dev Tuner state
  const [isTuneMode, setIsTuneMode] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const search = window.location.search;
        if (search.includes('tune=1') || search.includes('daoanh_tune=1')) return true;
        if (window.localStorage.getItem('tcl_dao_anh_tune') === '1') return true;
      }
    } catch (e) {}
    return false;
  });

  const [tuneOverrides, setTuneOverrides] = useState(() => {
    try {
      const saved = window.localStorage.getItem('tcl_dao_anh_tune_overrides');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const [copiedTune, setCopiedTune] = useState(false);

  useEffect(() => {
    setDaoAnhDevTuneOverrides(tuneOverrides);
  }, [tuneOverrides]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        setIsTuneMode((prev) => {
          const next = !prev;
          try {
            window.localStorage.setItem('tcl_dao_anh_tune', next ? '1' : '0');
          } catch (err) {}
          return next;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const modalRef = useRef(null);
  const chipsRowRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  // Build ownership lookup map
  const ownershipMap = useMemo(() => buildOwnershipMap(cultivation), [cultivation]);
  const stats = useMemo(() => getDaoAnhStats(ownershipMap), [ownershipMap]);

  // Source item counts
  const sourceCounts = useMemo(() => {
    let lamp = 0;
    let artifact = 0;
    for (const d of DAO_ANH_LIST) {
      if (d.sourceType === 'lamp') lamp++;
      else if (d.sourceType === 'artifact') artifact++;
    }
    return { all: DAO_ANH_LIST.length, lamp, artifact };
  }, []);

  // Category list with counts
  const categoriesWithCounts = useMemo(() => {
    const counts = {};
    for (const d of DAO_ANH_LIST) {
      const cat = d.category || 'khac';
      counts[cat] = (counts[cat] || 0) + 1;
    }

    const list = [
      {
        id: 'all',
        name: 'Tất Cả',
        icon: 'orb',
        count: DAO_ANH_LIST.length,
      },
    ];

    for (const [key, el] of Object.entries(DAO_ANH_ELEMENT_TYPES)) {
      if (el.id === 'all') continue;
      list.push({
        id: el.id,
        name: el.name,
        icon: el.icon || 'sparkle',
        count: counts[el.id] || 0,
      });
    }

    return list;
  }, []);

  // Filtered List
  const filteredList = useMemo(() => {
    return DAO_ANH_LIST.filter((da) => {
      // 1. Source Filter
      if (sourceFilter !== 'all' && da.sourceType !== sourceFilter) return false;
      // 2. Category Filter
      if (categoryFilter !== 'all' && da.category !== categoryFilter) return false;
      // 3. Only Owned Filter
      const own = ownershipMap[da.id];
      if (onlyOwned && (!own || !own.owned)) return false;
      // 4. Search Filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const mName = (da.name || '').toLowerCase().includes(q);
        const mTitle = (da.title || '').toLowerCase().includes(q);
        const mSkill = (da.skillName || '').toLowerCase().includes(q);
        const mPoem = (da.poem || '').toLowerCase().includes(q);
        const catName = getDaoAnhElementType(da.category).name.toLowerCase();
        const mCat = catName.includes(q);
        if (!mName && !mTitle && !mSkill && !mPoem && !mCat) return false;
      }
      return true;
    });
  }, [sourceFilter, categoryFilter, onlyOwned, searchTerm, ownershipMap]);

  // Selected Dao Anh definition
  const selectedDaoAnh = useMemo(() => {
    if (selectedId) {
      const found = DAO_ANH_LIST.find((d) => d.id === selectedId);
      if (found) return found;
    }
    const firstOwned = filteredList.find((d) => ownershipMap[d.id]?.owned);
    return firstOwned || filteredList[0] || DAO_ANH_LIST[0];
  }, [selectedId, filteredList, ownershipMap]);

  // Current index in filtered list
  const currentIndex = useMemo(() => {
    if (!selectedDaoAnh) return -1;
    return filteredList.findIndex((d) => d.id === selectedDaoAnh.id);
  }, [selectedDaoAnh, filteredList]);

  // Sync preview kiếp when selected Dao Anh changes
  useEffect(() => {
    if (selectedDaoAnh) {
      const own = ownershipMap[selectedDaoAnh.id];
      if (own && own.owned) {
        setPreviewKiep(own.kiep || 1);
      } else {
        setPreviewKiep(5);
      }
    }
  }, [selectedDaoAnh?.id, ownershipMap]);

  // Auto scroll category chip into view in mobile horizontal bar
  const handleSelectCategory = (catId) => {
    setCategoryFilter(catId);
    if (chipsRowRef.current) {
      const btn = chipsRowRef.current.querySelector(`[data-cat-id="${catId}"]`);
      if (btn && btn.scrollIntoView) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  };

  // Card click handler
  const handleCardClick = (daId) => {
    setSelectedId(daId);
    setIsMobileDetailOpen(true);
  };

  // Navigation handlers
  const handlePrev = useCallback(() => {
    if (filteredList.length === 0) return;
    const nextIdx = (currentIndex - 1 + filteredList.length) % filteredList.length;
    setSelectedId(filteredList[nextIdx].id);
  }, [currentIndex, filteredList]);

  const handleNext = useCallback(() => {
    if (filteredList.length === 0) return;
    const nextIdx = (currentIndex + 1) % filteredList.length;
    setSelectedId(filteredList[nextIdx].id);
  }, [currentIndex, filteredList]);

  // Touch handlers for mobile detail swipe
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;

    // Horizontal swipe
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
      if (deltaX > 0) {
        handlePrev();
      } else {
        handleNext();
      }
    } else if (deltaY > 80 && Math.abs(deltaY) > Math.abs(deltaX)) {
      // Downward swipe closes detail sheet
      setIsMobileDetailOpen(false);
    }
  };

  // Focus trap & keyboard listeners
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isMobileDetailOpen) {
          setIsMobileDetailOpen(false);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        handlePrev();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocusedRef.current?.focus) {
        previouslyFocusedRef.current.focus();
      }
    };
  }, [isOpen, onClose, isMobileDetailOpen, handlePrev, handleNext]);

  const isFilterActive =
    sourceFilter !== 'all' || categoryFilter !== 'all' || onlyOwned || searchTerm.trim() !== '';

  const handleClearFilters = () => {
    setSourceFilter('all');
    setCategoryFilter('all');
    setOnlyOwned(false);
    setSearchTerm('');
  };

  // Dev Tuner handlers
  const currentCleanId = (selectedDaoAnh?.id || '').replace(/^da_/, '');
  const activeDaoAnhOverride = (selectedDaoAnh ? (tuneOverrides[currentCleanId] || tuneOverrides[selectedDaoAnh.id]) : null) || {};
  const currentKiepTune = activeDaoAnhOverride[previewKiep];
  const baseCfg = selectedDaoAnh ? getDaoAnhTransformConfig(selectedDaoAnh, previewKiep, { size: 185, refSize: 185, ignoreOverrides: true }) : null;
  const currentScale = currentKiepTune?.scale !== undefined ? currentKiepTune.scale : (baseCfg?.scale ?? 1.0);
  const currentX = currentKiepTune?.x !== undefined ? currentKiepTune.x : (baseCfg?.x ?? 0);
  const currentY = currentKiepTune?.y !== undefined ? currentKiepTune.y : (baseCfg?.y ?? 0);

  const handleTuneChange = (field, val) => {
    if (!selectedDaoAnh) return;
    const num = Number(val);
    setTuneOverrides((prev) => {
      const daMap = { ...(prev[currentCleanId] || {}) };
      const existing = daMap[previewKiep] || { scale: currentScale, x: currentX, y: currentY };
      daMap[previewKiep] = {
        ...existing,
        [field]: field === 'scale' ? Math.round(num * 100) / 100 : Math.round(num),
      };
      const next = { ...prev, [currentCleanId]: daMap };
      try {
        window.localStorage.setItem('tcl_dao_anh_tune_overrides', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const handleTuneAutoBBox = () => {
    if (!selectedDaoAnh) return;
    const bb = getDaoAnhBBox(selectedDaoAnh, previewKiep);
    if (!bb || !bb.w || !bb.h) return;
    const TARGET = 0.80;
    const maxDim = Math.max(bb.w, bb.h);
    const rawScale = TARGET / maxDim;
    const s = Math.min(Math.max(rawScale, 0.85), 1.9);
    const scale = Math.round(s * 100) / 100;
    const x = Math.round((0.5 - bb.cx) * scale * 185);
    const y = Math.round((0.5 - bb.cy) * scale * 185);

    setTuneOverrides((prev) => {
      const daMap = { ...(prev[currentCleanId] || {}) };
      daMap[previewKiep] = { scale, x, y };
      const next = { ...prev, [currentCleanId]: daMap };
      try {
        window.localStorage.setItem('tcl_dao_anh_tune_overrides', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const handleTuneReset = () => {
    if (!selectedDaoAnh) return;
    setTuneOverrides((prev) => {
      const daMap = { ...(prev[currentCleanId] || {}) };
      delete daMap[previewKiep];
      const next = { ...prev };
      if (Object.keys(daMap).length === 0) {
        delete next[currentCleanId];
      } else {
        next[currentCleanId] = daMap;
      }
      try {
        window.localStorage.setItem('tcl_dao_anh_tune_overrides', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const handleCopyTuneConfig = async () => {
    if (!selectedDaoAnh) return;
    const lines = [1, 2, 3, 4, 5].map((k) => {
      const cfg = activeDaoAnhOverride[k] || getDaoAnhTransformConfig(selectedDaoAnh, k, { size: 185, refSize: 185 });
      const s = Number(cfg.scale || 1.0).toFixed(2);
      const x = Math.round(cfg.x || 0);
      const y = Math.round(cfg.y || 0);
      return `    ${k}: { scale: ${s}, x: ${x}, y: ${y} },`;
    });

    const code = `  ${currentCleanId}: {\n${lines.join('\n')}\n  },`;
    try {
      await navigator.clipboard.writeText(code);
      setCopiedTune(true);
      setTimeout(() => setCopiedTune(false), 2000);
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  };

  if (!isOpen) return null;

  const currentOwn = selectedDaoAnh ? ownershipMap[selectedDaoAnh.id] : null;
  const currentCategoryObj = getDaoAnhElementType(selectedDaoAnh?.category);
  const glow = selectedDaoAnh?.glowColor || 'rgba(251, 191, 36, 0.6)';

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dao-anh-gallery-title"
    >
      <div
        ref={modalRef}
        className={styles.modalFrame}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {/* Mobile Drag Handle */}
        <div className={styles.dragHandleBar} />

        {/* ================= HEADER ================= */}
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIconWrap}>
              <Icon name="scroll" size={20} />
            </div>
            <h2 id="dao-anh-gallery-title" className={styles.title}>
              Đạo Anh Đồ Lục
              <span className={styles.badgeDien}>Bách Thần Điển</span>
            </h2>
          </div>

          <div className={styles.headerStats}>
            <div className={`${styles.statPill} ${styles.statPillHighlight}`}>
              <Icon name="check" size={14} />
              <span>Đã có {stats.ownedCount} / {stats.totalCount}</span>
            </div>
            <div className={styles.statPill}>
              <Icon name="crown" size={14} />
              <span>Viên mãn Kiếp 5: {stats.maxKiepCount}</span>
            </div>
          </div>

          <div className={styles.headerActions}>
            <button
              className={styles.mobileSearchToggleBtn}
              onClick={() => setIsMobileSearchOpen((prev) => !prev)}
              aria-label="Mở tìm kiếm"
            >
              <Icon name="search" size={18} />
            </button>
            <button
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Đóng Đạo Anh Đồ Lục"
            >
              <Icon name="x" size={18} />
            </button>
          </div>
        </header>

        {/* ================= MOBILE COLLAPSIBLE SEARCH ================= */}
        {(isMobileSearchOpen || searchTerm) && (
          <div className={styles.mobileSearchCollapsible}>
            <div className={styles.searchBox}>
              <Icon name="search" size={16} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Tìm Đạo Anh, thơ, thần thông..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={styles.searchInput}
                aria-label="Tìm kiếm Đạo Anh"
                autoFocus
              />
              {searchTerm && (
                <button
                  className={styles.searchClearBtn}
                  onClick={() => setSearchTerm('')}
                  aria-label="Xóa từ khóa tìm kiếm"
                >
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* ================= MOBILE / TABLET CONTROLS BAR ================= */}
        <div className={styles.mobileControlsBar}>
          {/* Segmented Source Tabs */}
          <div className={styles.sourceSegmented} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={sourceFilter === 'all'}
              className={`${styles.sourceTab} ${sourceFilter === 'all' ? styles.sourceTabActive : ''}`}
              onClick={() => setSourceFilter('all')}
            >
              Tất cả ({sourceCounts.all})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sourceFilter === 'lamp'}
              className={`${styles.sourceTab} ${sourceFilter === 'lamp' ? styles.sourceTabActive : ''}`}
              onClick={() => setSourceFilter('lamp')}
            >
              Mệnh Đăng ({sourceCounts.lamp})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sourceFilter === 'artifact'}
              className={`${styles.sourceTab} ${sourceFilter === 'artifact' ? styles.sourceTabActive : ''}`}
              onClick={() => setSourceFilter('artifact')}
            >
              Trấn Cung ({sourceCounts.artifact})
            </button>
          </div>

          {/* Horizontal Category Chips Row */}
          <div ref={chipsRowRef} className={styles.horizontalChipsRow} role="tablist">
            {/* Only Owned Toggle Chip */}
            <button
              type="button"
              className={`${styles.chipItem} ${onlyOwned ? styles.chipItemActive : ''}`}
              onClick={() => setOnlyOwned((prev) => !prev)}
            >
              <Icon name="check" size={13} />
              <span>Đã có ({stats.ownedCount})</span>
            </button>

            {categoriesWithCounts.map((cat) => {
              const isActive = categoryFilter === cat.id;
              return (
                <button
                  key={cat.id}
                  data-cat-id={cat.id}
                  type="button"
                  className={`${styles.chipItem} ${isActive ? styles.chipItemActive : ''}`}
                  onClick={() => handleSelectCategory(cat.id)}
                  aria-selected={isActive}
                  title={cat.name}
                >
                  <Icon name={cat.icon} size={13} />
                  <span>{cat.name} ({cat.count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ================= 3-COLUMN MASTER-DETAIL BODY ================= */}
        <div className={styles.bodyContainer}>
          {/* ----- 1. LEFT SIDEBAR: DESKTOP FILTERS ----- */}
          <aside className={styles.sidebar}>
            {/* Search Input */}
            <div className={styles.searchBox}>
              <Icon name="search" size={16} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Tìm Đạo Anh, thơ, thần thông..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={styles.searchInput}
                aria-label="Tìm kiếm Đạo Anh"
              />
              {searchTerm && (
                <button
                  className={styles.searchClearBtn}
                  onClick={() => setSearchTerm('')}
                  aria-label="Xóa từ khóa tìm kiếm"
                >
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>

            {/* Source Segmented Control */}
            <div className={styles.sourceSegmented} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={sourceFilter === 'all'}
                className={`${styles.sourceTab} ${sourceFilter === 'all' ? styles.sourceTabActive : ''}`}
                onClick={() => setSourceFilter('all')}
              >
                Tất cả ({sourceCounts.all})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sourceFilter === 'lamp'}
                className={`${styles.sourceTab} ${sourceFilter === 'lamp' ? styles.sourceTabActive : ''}`}
                onClick={() => setSourceFilter('lamp')}
              >
                Mệnh Đăng ({sourceCounts.lamp})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sourceFilter === 'artifact'}
                className={`${styles.sourceTab} ${sourceFilter === 'artifact' ? styles.sourceTabActive : ''}`}
                onClick={() => setSourceFilter('artifact')}
              >
                Trấn Cung ({sourceCounts.artifact})
              </button>
            </div>

            {/* Vertical Category List */}
            <div className={styles.categorySection}>
              <div className={styles.sectionLabel}>Danh Mục Đạo Anh</div>
              {categoriesWithCounts.map((cat) => {
                const isActive = categoryFilter === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    className={`${styles.categoryItem} ${isActive ? styles.categoryItemActive : ''}`}
                    onClick={() => setCategoryFilter(cat.id)}
                    aria-current={isActive ? 'true' : undefined}
                    title={cat.name}
                  >
                    <span className={styles.categoryItemLeft}>
                      <Icon name={cat.icon} size={15} />
                      <span className={styles.categoryItemName}>{cat.name}</span>
                    </span>
                    <span className={styles.categoryItemCount}>{cat.count}</span>
                  </button>
                );
              })}
            </div>

            {/* Sidebar Footer Controls */}
            <div className={styles.sidebarFooter}>
              <label className={styles.toggleLabel}>
                <span>Chỉ hiện đã có</span>
                <input
                  type="checkbox"
                  checked={onlyOwned}
                  onChange={(e) => setOnlyOwned(e.target.checked)}
                  className={styles.toggleInput}
                />
              </label>

              {isFilterActive && (
                <button
                  type="button"
                  className={styles.resetFilterBtn}
                  onClick={handleClearFilters}
                >
                  <Icon name="x" size={13} />
                  Xóa bộ lọc
                </button>
              )}
            </div>
          </aside>

          {/* ----- 2. CENTER REGION: CARDS GRID / LIST ----- */}
          <main className={styles.centerRegion}>
            <div className={styles.centerToolbar}>
              <span className={styles.resultCount}>
                Hiển thị {filteredList.length} / {DAO_ANH_LIST.length} Đạo Anh
              </span>
              <div className={styles.viewModeToggle}>
                <button
                  type="button"
                  className={`${styles.viewModeBtn} ${viewMode === 'grid' ? styles.viewModeBtnActive : ''}`}
                  onClick={() => setViewMode('grid')}
                  title="Hiển thị dạng lưới"
                  aria-label="Hiển thị dạng lưới"
                >
                  <Icon name="grid" size={16} />
                </button>
                <button
                  type="button"
                  className={`${styles.viewModeBtn} ${viewMode === 'list' ? styles.viewModeBtnActive : ''}`}
                  onClick={() => setViewMode('list')}
                  title="Hiển thị dạng danh sách"
                  aria-label="Hiển thị dạng danh sách"
                >
                  <Icon name="list" size={16} />
                </button>
              </div>
            </div>

            <div className={styles.cardsScrollArea}>
              {filteredList.length === 0 ? (
                <div className={styles.emptyState}>
                  <Icon name="search" size={40} style={{ opacity: 0.4 }} />
                  <div className={styles.emptyStateTitle}>Không có Đạo Anh nào khớp</div>
                  <p style={{ margin: 0, fontSize: 12 }}>
                    Hãy thử đổi từ khóa tìm kiếm hoặc điều chỉnh lại bộ lọc danh mục.
                  </p>
                  <button
                    type="button"
                    className={styles.resetFilterBtn}
                    style={{ width: 'auto', padding: '8px 16px', marginTop: 8 }}
                    onClick={handleClearFilters}
                  >
                    <Icon name="refresh" size={14} />
                    Xóa tất cả bộ lọc
                  </button>
                </div>
              ) : viewMode === 'grid' ? (
                /* GRID VIEW MODE */
                <div className={styles.cardsGrid}>
                  {filteredList.map((da) => {
                    const isSelected = selectedDaoAnh?.id === da.id;
                    const own = ownershipMap[da.id];
                    const catObj = getDaoAnhElementType(da.category);
                    const cardGlow = da.glowColor || 'rgba(251, 191, 36, 0.5)';
                    const cardKiep = own?.owned ? own.kiep : 5;

                    return (
                      <DaoAnhErrorBoundary key={da.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSelected}
                          className={`${styles.card} ${isSelected ? styles.cardSelected : ''} ${!own?.owned ? styles.cardUnowned : ''}`}
                          style={{
                            '--card-glow': cardGlow,
                            background: `radial-gradient(circle at 50% 30%, ${da.primaryColor || '#fbbf24'}15 0%, rgba(13, 20, 36, 0.85) 85%)`,
                          }}
                          onClick={() => handleCardClick(da.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleCardClick(da.id);
                            }
                          }}
                        >
                          {/* Top Row: Tier dot & Source badge */}
                          <div className={styles.cardTopRow}>
                            <div
                              className={styles.tierDot}
                              style={{ color: da.primaryColor || '#fbbf24' }}
                            />
                            <span className={styles.sourceBadge}>
                              {da.sourceType === 'lamp' ? 'Mệnh Đăng' : 'Trấn Cung'}
                            </span>
                          </div>

                          {/* Floating Art with glow */}
                          <div className={styles.artContainer}>
                            <div
                              className={styles.artGlowBackdrop}
                              style={{ background: da.glowColor || da.primaryColor }}
                            />
                            <DaoAnhArt
                              fit="contain"
                              daoAnh={da}
                              kiep={cardKiep}
                              size="fill"
                              imageSize="thumb"
                              glow={cardGlow}
                              className={styles.artFrame}
                              imageClassName={styles.artImage}
                            />

                            {/* Ownership Badge */}
                            {own?.owned ? (
                              <div className={`${styles.ownershipBadge} ${styles.badgeOwned}`}>
                                <Icon name="check" size={11} />
                                <span>Kiếp {own.kiep}/5</span>
                              </div>
                            ) : own?.inBag ? (
                              <div className={`${styles.ownershipBadge} ${styles.badgeInBag}`}>
                                <span>Sẵn trong túi</span>
                              </div>
                            ) : (
                              <div className={`${styles.ownershipBadge} ${styles.badgeUnowned}`}>
                                <Icon name="lock" size={10} />
                                <span>Chưa có</span>
                              </div>
                            )}
                          </div>

                          {/* Bottom info */}
                          <div className={styles.cardBottom}>
                            <div className={styles.cardName}>{da.name}</div>
                            {da.title && <div className={styles.cardTitle}>{da.title}</div>}
                            <div className={styles.cardMetaRow}>
                              <span className={styles.categoryPill}>{catObj.name}</span>
                              <span className={styles.sourcePill}>
                                {da.sourceType === 'lamp' ? 'Mệnh Đăng' : 'Trấn Cung'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </DaoAnhErrorBoundary>
                    );
                  })}
                </div>
              ) : (
                /* LIST VIEW MODE */
                <div className={styles.cardsList}>
                  {filteredList.map((da) => {
                    const isSelected = selectedDaoAnh?.id === da.id;
                    const own = ownershipMap[da.id];
                    const catObj = getDaoAnhElementType(da.category);
                    const listKiep = own?.owned ? own.kiep : 5;

                    return (
                      <DaoAnhErrorBoundary key={da.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          aria-pressed={isSelected}
                          className={`${styles.listRow} ${isSelected ? styles.listRowSelected : ''}`}
                          onClick={() => handleCardClick(da.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleCardClick(da.id);
                            }
                          }}
                        >
                          <div className={styles.listThumb}>
                            <DaoAnhArt
                              fit="contain"
                              daoAnh={da}
                              kiep={listKiep}
                              size={44}
                              imageSize="thumb"
                              className={styles.listThumbFrame}
                              imageClassName={styles.listThumbImg}
                            />
                          </div>
                          <div className={styles.listInfo}>
                            <div className={styles.listName}>{da.name}</div>
                            <div className={styles.listSub}>
                              <span style={{ color: '#fde047' }}>{da.title || 'Chí Tôn Thần Thai'}</span>
                              <span>·</span>
                              <span>{catObj.name}</span>
                              <span>·</span>
                              <span>{da.sourceType === 'lamp' ? 'Mệnh Đăng' : 'Vật Trấn Áp'}</span>
                            </div>
                          </div>
                          <div className={styles.listActions}>
                            {own?.owned ? (
                              <span className={`${styles.ownershipBadge} ${styles.badgeOwned}`}>
                                <Icon name="check" size={11} /> Kiếp {own.kiep}/5
                              </span>
                            ) : own?.inBag ? (
                              <span className={`${styles.ownershipBadge} ${styles.badgeInBag}`}>
                                Sẵn trong túi
                              </span>
                            ) : (
                              <span className={`${styles.ownershipBadge} ${styles.badgeUnowned}`}>
                                <Icon name="lock" size={10} /> Chưa có
                              </span>
                            )}
                            <Icon name="chevron-right" size={16} style={{ color: '#64748b' }} />
                          </div>
                        </div>
                      </DaoAnhErrorBoundary>
                    );
                  })}
                </div>
              )}
            </div>
          </main>

          {/* ----- 3. RIGHT COLUMN / MOBILE DETAIL PANEL ----- */}
          {selectedDaoAnh && (
            <aside
              className={`${styles.detailPanel} ${isMobileDetailOpen ? styles.detailPanelOpen : ''}`}
              aria-label="Chi tiết Đạo Anh"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <DaoAnhErrorBoundary>
                {/* Mobile Detail Top Bar with Back Button */}
                <div className={styles.mobileDetailTopBar}>
                  <button
                    type="button"
                    className={styles.backBtn}
                    onClick={() => setIsMobileDetailOpen(false)}
                    aria-label="Quay lại danh sách"
                  >
                    <Icon name="arrow-left" size={16} /> Quay lại
                  </button>
                  <span className={styles.mobileDetailTitle}>
                    {selectedDaoAnh.name}
                  </span>
                  <button
                    type="button"
                    className={styles.closeBtn}
                    onClick={() => setIsMobileDetailOpen(false)}
                    aria-label="Đóng chi tiết"
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>

                {/* Large Art & Aura Section */}
                <div className={styles.detailArtSection}>
                  <div
                    className={styles.detailArtWrapper}
                    style={{ '--detail-glow': glow }}
                  >
                    <div
                      className={styles.detailArtGlow}
                      style={{ background: selectedDaoAnh.primaryColor || glow }}
                    />
                    <DaoAnhArt
                              fit="contain"
                      daoAnh={selectedDaoAnh}
                      kiep={previewKiep}
                      size={220}
                      imageSize="full"
                      glow={glow}
                      className={styles.detailArtFrame}
                      imageClassName={styles.detailArtImg}
                    />
                  </div>

                                      {/* K1 - K5 Evolution Selector */}
                    <div className={styles.evolutionSelector} role="group" aria-label="Chọn tầng kiếp">
                      {[1, 2, 3, 4, 5].map((k) => {
                        const isActive = previewKiep === k;
                        return (
                          <button
                            key={k}
                            type="button"
                            className={`${styles.evolutionBtn} ${isActive ? styles.evolutionBtnActive : ''}`}
                            onClick={() => setPreviewKiep(k)}
                            aria-pressed={isActive}
                          >
                            K{k}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Dev Tuner Section (visible only when isTuneMode is active) */}
                  {isTuneMode && selectedDaoAnh && (
                    <div className={styles.devTunerBox} role="region" aria-label="Bộ tinh chỉnh kích thước ảnh">
                      <div className={styles.tunerHeader}>
                        <span className={styles.tunerTitle}>
                          <Icon name="sliders" size={13} /> Dev Tuner · Kiếp {previewKiep}
                        </span>
                        <button
                          type="button"
                          className={styles.tunerCloseBtn}
                          onClick={() => {
                            setIsTuneMode(false);
                            try {
                              window.localStorage.setItem('tcl_dao_anh_tune', '0');
                            } catch (e) {}
                          }}
                          title="Đóng Tuner (Ctrl+Shift+T để mở lại)"
                        >
                          <Icon name="x" size={12} />
                        </button>
                      </div>

                      <div className={styles.tunerNote}>
                        Chỉnh tay áp dụng cho avatar (Nguyên Anh...), Đồ Lục luôn tự vừa khung
                      </div>

                      <div className={styles.tunerControls}>
                        <div className={styles.tunerRow}>
                          <label className={styles.tunerLabel}>
                            Scale: <strong>{Number(currentScale).toFixed(2)}</strong>
                          </label>
                          <input
                            type="range"
                            min="0.50"
                            max="2.20"
                            step="0.02"
                            value={currentScale}
                            onChange={(e) => handleTuneChange('scale', e.target.value)}
                            className={styles.tunerSlider}
                          />
                        </div>

                        <div className={styles.tunerRow}>
                          <label className={styles.tunerLabel}>
                            X: <strong>{currentX}px</strong>
                          </label>
                          <input
                            type="range"
                            min="-80"
                            max="80"
                            step="1"
                            value={currentX}
                            onChange={(e) => handleTuneChange('x', e.target.value)}
                            className={styles.tunerSlider}
                          />
                        </div>

                        <div className={styles.tunerRow}>
                          <label className={styles.tunerLabel}>
                            Y: <strong>{currentY}px</strong>
                          </label>
                          <input
                            type="range"
                            min="-80"
                            max="80"
                            step="1"
                            value={currentY}
                            onChange={(e) => handleTuneChange('y', e.target.value)}
                            className={styles.tunerSlider}
                          />
                        </div>
                      </div>

                      <div className={styles.tunerActions}>
                        <button
                          type="button"
                          className={styles.tunerActionBtn}
                          onClick={handleTuneAutoBBox}
                          title="Tự tính toán scale và tâm dịch chuyển từ Bounding Box"
                        >
                          <Icon name="sparkle" size={12} /> Tự động (bbox)
                        </button>
                        <button
                          type="button"
                          className={`${styles.tunerActionBtn} ${styles.tunerActionBtnPrimary}`}
                          onClick={handleCopyTuneConfig}
                          title="Sao chép đoạn mã JS để dán vào DAO_ANH_CUSTOM_TRANSFORMS"
                        >
                          <Icon name="copy" size={12} /> {copiedTune ? 'Đã sao chép!' : 'Sao chép cấu hình'}
                        </button>
                        <button
                          type="button"
                          className={`${styles.tunerActionBtn} ${styles.tunerActionBtnDanger}`}
                          onClick={handleTuneReset}
                          title="Xóa override của kiếp này về mặc định"
                        >
                          <Icon name="refresh" size={12} /> Đặt lại
                        </button>
                      </div>
                    </div>
                  )}

                {/* Name, Title, Poem */}
                <div className={styles.detailHeader}>
                  <div className={styles.detailNameRow}>
                    <h3 className={styles.detailName}>{selectedDaoAnh.name}</h3>
                    {currentOwn?.owned ? (
                      <span className={`${styles.detailOwnershipBadge} ${styles.badgeOwned}`}>
                        <Icon name="check" size={11} /> Kiếp {currentOwn.kiep}/5
                      </span>
                    ) : currentOwn?.inBag ? (
                      <span className={`${styles.detailOwnershipBadge} ${styles.badgeInBag}`}>
                        Sẵn trong túi
                      </span>
                    ) : (
                      <span className={`${styles.detailOwnershipBadge} ${styles.badgeUnowned}`}>
                        <Icon name="lock" size={10} /> Chưa sở hữu
                      </span>
                    )}
                  </div>
                  {selectedDaoAnh.title && (
                    <div className={styles.detailTitle}>{selectedDaoAnh.title}</div>
                  )}
                  {selectedDaoAnh.poem && (
                    <div className={styles.detailPoem}>
                      "{selectedDaoAnh.poem}"
                    </div>
                  )}
                </div>

                {/* Card: Cực hạn thần thân */}
                {selectedDaoAnh.tribulationForm && (
                  <div className={styles.detailCard}>
                    <div className={styles.detailCardLabel}>
                      <Icon name="sparkle" size={13} />
                      Cực Hạn Thần Thân
                    </div>
                    <div className={styles.detailCardTitle}>
                      {selectedDaoAnh.tribulationForm}
                    </div>
                  </div>
                )}

                {/* Card: Thần Thông */}
                {(selectedDaoAnh.skillName || selectedDaoAnh.skillDesc) && (
                  <div className={styles.detailCard}>
                    <div className={styles.detailCardLabel}>
                      <Icon name="bolt" size={13} />
                      Thần Thông Bản Mệnh
                    </div>
                    {selectedDaoAnh.skillName && (
                      <div className={styles.detailCardTitle}>
                        {selectedDaoAnh.skillName}
                      </div>
                    )}
                    {selectedDaoAnh.skillDesc && (
                      <div className={styles.detailCardDesc}>
                        {selectedDaoAnh.skillDesc}
                      </div>
                    )}
                  </div>
                )}

                {/* Card: Chân Thân & Khởi Nguyên */}
                {selectedDaoAnh.desc && (
                  <div className={styles.detailCard}>
                    <div className={styles.detailCardLabel}>
                      <Icon name="scroll" size={13} />
                      Chân Thân & Khởi Nguyên
                    </div>
                    <div className={styles.detailCardDesc}>
                      {selectedDaoAnh.desc}
                    </div>
                  </div>
                )}

                {/* Prev / Next Navigation buttons */}
                <div className={styles.navRow}>
                  <button
                    type="button"
                    className={styles.navBtn}
                    onClick={handlePrev}
                    aria-label="Đạo Anh trước"
                  >
                    <Icon name="arrow-left" size={14} /> Trước
                  </button>
                  <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                    {currentIndex + 1} / {filteredList.length}
                  </span>
                  <button
                    type="button"
                    className={styles.navBtn}
                    onClick={handleNext}
                    aria-label="Đạo Anh kế"
                  >
                    Kế <Icon name="arrow-right" size={14} />
                  </button>
                </div>
              </DaoAnhErrorBoundary>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
