import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Icon from '../ui/Icon';
import { DAO_ANH_LIST, DAO_ANH_ELEMENT_TYPES } from '../../lib/daoAnhData';
import DaoAnhAvatarRenderer from './DaoAnhAvatarRenderer';
import styles from './DaoAnhGalleryModal.module.css';

// Fixed icon mapping per category ID
const CATEGORY_ICON = {
  all: 'orb',
  hon_don: 'sparkle',
  ma_dao: 'moon',
  loi_dinh: 'bolt',
  luan_hoi: 'yin-yang',
  thai_duong: 'sun',
  thoi_khong: 'hourglass',
  tao_hoa: 'mist',
  kiem_dao: 'sword',
  than_the: 'crown',
};

class DaoAnhErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.error('[DaoAnhGallery] render failed:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className={this.props.className || styles.cardFallback}>
          <Icon name="alert-triangle" size={16} />
          <span>Không hiển thị được Đạo Anh này</span>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function DaoAnhGalleryModal({ isOpen, onClose }) {
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'lamp' | 'artifact'
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [selectedDaoAnh, setSelectedDaoAnh] = useState(null);
  const [previewKiep, setPreviewKiep] = useState(5);
  const [hoveredCardId, setHoveredCardId] = useState(null);

  const modalRef = useRef(null);
  const previouslyFocusedElementRef = useRef(null);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedElementRef.current = document.activeElement;
      // Focus modal container or close button
      const timer = setTimeout(() => {
        if (modalRef.current) {
          const closeBtn = modalRef.current.querySelector('button[aria-label="Đóng"]');
          if (closeBtn) closeBtn.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    } else {
      if (previouslyFocusedElementRef.current && previouslyFocusedElementRef.current.focus) {
        previouslyFocusedElementRef.current.focus();
      }
    }
  }, [isOpen]);

  // Filtered List
  const filteredList = useMemo(() => {
    return DAO_ANH_LIST.filter((da) => {
      // 1. Source Filter
      if (sourceFilter !== 'all' && da.sourceType !== sourceFilter) return false;
      // 2. Category Filter
      if (categoryFilter !== 'all' && da.category !== categoryFilter) return false;
      // 3. Search Filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchName = da.name ? da.name.toLowerCase().includes(query) : false;
        const matchTitle = da.title ? da.title.toLowerCase().includes(query) : false;
        const matchSkill = da.skillName ? da.skillName.toLowerCase().includes(query) : false;
        const matchPoem = da.poem ? da.poem.toLowerCase().includes(query) : false;
        return matchName || matchTitle || matchSkill || matchPoem;
      }
      return true;
    });
  }, [sourceFilter, categoryFilter, searchTerm]);

  // Current index in filtered list for Next/Prev navigation
  const currentIndex = useMemo(() => {
    if (!selectedDaoAnh) return -1;
    return filteredList.findIndex((da) => da.id === selectedDaoAnh.id);
  }, [selectedDaoAnh, filteredList]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setSelectedDaoAnh(filteredList[currentIndex - 1]);
    } else if (filteredList.length > 0) {
      setSelectedDaoAnh(filteredList[filteredList.length - 1]);
    }
  }, [currentIndex, filteredList]);

  const handleNext = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < filteredList.length - 1) {
      setSelectedDaoAnh(filteredList[currentIndex + 1]);
    } else if (filteredList.length > 0) {
      setSelectedDaoAnh(filteredList[0]);
    }
  }, [currentIndex, filteredList]);

  // Keyboard navigation & Focus trap
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        if (selectedDaoAnh) {
          setSelectedDaoAnh(null);
        } else if (onClose) {
          onClose();
        }
      } else if (selectedDaoAnh) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handlePrev();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleNext();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedDaoAnh, onClose, handlePrev, handleNext]);

  if (!isOpen) return null;

  const lampTotal = DAO_ANH_LIST.filter((d) => d.sourceType === 'lamp').length;
  const artifactTotal = DAO_ANH_LIST.filter((d) => d.sourceType === 'artifact').length;

  // Compute category counts within current source filter
  const categoryCounts = Object.values(DAO_ANH_ELEMENT_TYPES).reduce((acc, cat) => {
    if (cat.id === 'all') {
      acc[cat.id] = sourceFilter === 'all'
        ? DAO_ANH_LIST.length
        : DAO_ANH_LIST.filter((d) => d.sourceType === sourceFilter).length;
    } else {
      acc[cat.id] = DAO_ANH_LIST.filter((d) => {
        const matchSource = sourceFilter === 'all' || d.sourceType === sourceFilter;
        return matchSource && d.category === cat.id;
      }).length;
    }
    return acc;
  }, {});

  const getCategoryShortName = (cat) => {
    if (cat.id === 'all') return cat.name;
    return (cat.name || '').split(' & ')[0];
  };

  return (
    <div
      className={styles.modalOverlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dao-anh-gallery-title"
    >
      <div
        className={styles.modalContainer}
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile handle indicator */}
        <div className={styles.mobileSheetHandle} aria-hidden="true" />

        {/* ========================================================
            1. HEADER
           ======================================================== */}
        <div className={styles.modalHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIconWrap}>
              <Icon name="scroll" size={22} className={styles.headerIcon} />
            </div>
            <div className={styles.headerTitles}>
              <div className={styles.headerMainRow}>
                <h2 id="dao-anh-gallery-title">Đạo Anh Đồ Lục</h2>
                <span className={styles.headerTomeBadge}>BÁCH THẦN ĐIỂN</span>
              </div>
              <div className={styles.headerStatsRow}>
                <span className={styles.statPill}>
                  <strong>{DAO_ANH_LIST.length}</strong> Đạo Anh
                </span>
                <span className={styles.statPill}>
                  <strong>{lampTotal}</strong> Mệnh Đăng
                </span>
                <span className={styles.statPill}>
                  <strong>{artifactTotal}</strong> Trấn Áp
                </span>
              </div>
            </div>
          </div>

          <div className={styles.headerRight}>
            <button
              className={styles.closeBtn}
              onClick={onClose}
              aria-label="Đóng"
              title="Đóng (ESC)"
            >
              <Icon name="x" size={18} />
            </button>
          </div>
        </div>

        {/* ========================================================
            2. CONTROL BAR (SOURCE TABS, SEARCH, VIEW SWITCH)
           ======================================================== */}
        <div className={styles.controlBar}>
          <div className={styles.sourceTabsGroup} role="tablist" aria-label="Nguồn Đạo Anh">
            <button
              role="tab"
              aria-selected={sourceFilter === 'all'}
              className={`${styles.sourceTabBtn} ${sourceFilter === 'all' ? styles.activeSource : ''}`}
              onClick={() => setSourceFilter('all')}
            >
              <Icon name="orb" size={14} />
              <span>Tất Cả ({DAO_ANH_LIST.length})</span>
            </button>
            <button
              role="tab"
              aria-selected={sourceFilter === 'lamp'}
              className={`${styles.sourceTabBtn} ${sourceFilter === 'lamp' ? styles.activeSource : ''}`}
              onClick={() => setSourceFilter('lamp')}
            >
              <Icon name="lantern" size={14} />
              <span>Mệnh Đăng ({lampTotal})</span>
            </button>
            <button
              role="tab"
              aria-selected={sourceFilter === 'artifact'}
              className={`${styles.sourceTabBtn} ${sourceFilter === 'artifact' ? styles.activeSource : ''}`}
              onClick={() => setSourceFilter('artifact')}
            >
              <Icon name="shield" size={14} />
              <span>Vật Trấn Áp ({artifactTotal})</span>
            </button>
          </div>

          <div className={styles.controlBarRight}>
            {/* Search Input */}
            <div className={styles.searchBox}>
              <Icon name="search" size={14} className={styles.searchIcon} />
              <input
                type="text"
                placeholder="Tìm tên, thần thông, hiệu, thơ..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Tìm kiếm Đạo Anh"
              />
              {searchTerm && (
                <button
                  type="button"
                  className={styles.searchClearBtn}
                  onClick={() => setSearchTerm('')}
                  aria-label="Xóa tìm kiếm"
                  title="Xóa tìm kiếm"
                >
                  <Icon name="x" size={12} />
                </button>
              )}
            </div>

            {/* View Mode Switcher */}
            <div className={styles.viewModeToggle} role="group" aria-label="Kiểu hiển thị">
              <button
                type="button"
                className={`${styles.viewModeBtn} ${viewMode === 'grid' ? styles.activeViewMode : ''}`}
                onClick={() => setViewMode('grid')}
                aria-label="Hiển thị dạng thẻ"
                title="Dạng thẻ lưới"
              >
                <Icon name="grid" size={14} />
              </button>
              <button
                type="button"
                className={`${styles.viewModeBtn} ${viewMode === 'list' ? styles.activeViewMode : ''}`}
                onClick={() => setViewMode('list')}
                aria-label="Hiển thị dạng danh sách"
                title="Dạng danh sách thu gọn"
              >
                <Icon name="list" size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================
            3. ELEMENT CATEGORY CHIP BAR
           ======================================================== */}
        <div className={styles.categoryBar} role="tablist" aria-label="Danh mục nguyên tố">
          {Object.values(DAO_ANH_ELEMENT_TYPES).map((cat) => {
            const count = categoryCounts[cat.id] || 0;
            if (count === 0 && cat.id !== 'all' && sourceFilter !== 'all') return null;
            const isActive = categoryFilter === cat.id;
            const iconName = CATEGORY_ICON[cat.id] || 'orb';
            const shortName = getCategoryShortName(cat);

            return (
              <button
                key={`cat-${cat.id}`}
                role="tab"
                aria-selected={isActive}
                className={`${styles.categoryChip} ${isActive ? styles.activeCategoryChip : ''}`}
                onClick={() => setCategoryFilter(cat.id)}
                title={cat.name}
              >
                <span className={styles.catIconWrap}>
                  <Icon name={iconName} size={14} />
                </span>
                <span className={styles.catName}>{shortName}</span>
                <span className={styles.catCount}>({count})</span>
              </button>
            );
          })}
        </div>

        {/* ========================================================
            4. MAIN BODY (GRID OR LIST)
           ======================================================== */}
        <div className={styles.modalBody}>
          {/* A. GRID VIEW */}
          {viewMode === 'grid' && (
            <div className={styles.gridContainer}>
              {filteredList.map((da) => {
                const isHovered = hoveredCardId === da.id;
                const catInfo = DAO_ANH_ELEMENT_TYPES[da.category?.toUpperCase()] || null;
                const catShortName = catInfo ? getCategoryShortName(catInfo) : da.category;

                return (
                  <DaoAnhErrorBoundary key={da.id}>
                    <div
                      className={styles.daoAnhCard}
                      style={{
                        '--card-p-color': da.primaryColor || '#fbbf24',
                        '--card-s-color': da.secondaryColor || '#f97316',
                        '--card-glow': da.glowColor || 'rgba(251, 191, 36, 0.4)',
                      }}
                      onMouseEnter={() => setHoveredCardId(da.id)}
                      onMouseLeave={() => setHoveredCardId(null)}
                      onClick={() => {
                        setSelectedDaoAnh(da);
                        setPreviewKiep(5);
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Chi tiết ${da.name}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedDaoAnh(da);
                          setPreviewKiep(5);
                        }
                      }}
                    >
                      {/* Avatar container */}
                      <div className={styles.avatarStageWrap}>
                        <DaoAnhAvatarRenderer
                          daoAnh={da}
                          size={160}
                          imageSize="thumb"
                          currentKiep={5}
                          animate={isHovered}
                          showAura={isHovered}
                        />
                      </div>

                      {/* Card Content */}
                      <div className={styles.cardContent}>
                        <div className={styles.cardBadgesRow}>
                          <span className={styles.cardCatBadge}>{catShortName}</span>
                          <span className={styles.cardSourceBadge}>
                            {da.sourceType === 'lamp' ? 'Mệnh Đăng' : 'Trấn Áp'}
                          </span>
                        </div>
                        <h3 className={styles.cardName} title={da.name}>
                          {da.name}
                        </h3>
                        {da.title && (
                          <div className={styles.cardHonorificText} title={da.title}>
                            {da.title}
                          </div>
                        )}
                      </div>
                    </div>
                  </DaoAnhErrorBoundary>
                );
              })}
            </div>
          )}

          {/* B. LIST VIEW */}
          {viewMode === 'list' && (
            <div className={styles.listContainer}>
              {filteredList.map((da, idx) => {
                const catInfo = DAO_ANH_ELEMENT_TYPES[da.category?.toUpperCase()] || null;
                const catShortName = catInfo ? getCategoryShortName(catInfo) : da.category;

                return (
                  <DaoAnhErrorBoundary key={da.id}>
                    <div
                      className={styles.listItemRow}
                      style={{
                        '--row-color': da.primaryColor || '#fbbf24',
                        '--row-glow': da.glowColor || 'rgba(251, 191, 36, 0.3)',
                      }}
                      onClick={() => {
                        setSelectedDaoAnh(da);
                        setPreviewKiep(5);
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Chi tiết ${da.name}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedDaoAnh(da);
                          setPreviewKiep(5);
                        }
                      }}
                    >
                      <div className={styles.listIndex}>#{idx + 1}</div>

                      <div className={styles.listAvatarWrap}>
                        <DaoAnhAvatarRenderer
                          daoAnh={da}
                          size={52}
                          imageSize="thumb"
                          currentKiep={5}
                          animate={false}
                          showAura={false}
                        />
                      </div>

                      <div className={styles.listMainInfo}>
                        <div className={styles.listTitleRow}>
                          <h4 className={styles.listName}>{da.name}</h4>
                          <span className={styles.listTier}>THẦN PHẨM</span>
                          <span className={styles.listCatBadge}>{catShortName}</span>
                          <span className={styles.listSource}>
                            {da.sourceType === 'lamp' ? 'Mệnh Đăng' : 'Trấn Áp'}
                          </span>
                        </div>
                        <div className={styles.listSubTitle}>
                          {da.title && <span>{da.title}</span>}
                          {da.poem && <em>"{da.poem}"</em>}
                        </div>
                      </div>

                      {da.skillName && (
                        <div className={styles.listSkillCol}>
                          <div className={styles.listSkillName}>
                            <Icon name="bolt" size={12} /> {da.skillName}
                          </div>
                          {da.skillDesc && <div className={styles.listSkillDesc}>{da.skillDesc}</div>}
                        </div>
                      )}

                      <div className={styles.listActionCol}>
                        <span className={styles.listInspectBtn}>
                          Xem <Icon name="chevron-right" size={14} />
                        </span>
                      </div>
                    </div>
                  </DaoAnhErrorBoundary>
                );
              })}
            </div>
          )}

          {/* C. EMPTY STATE */}
          {filteredList.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <Icon name="orb" size={36} />
              </div>
              <h3>Không tìm thấy Đạo Anh phù hợp</h3>
              <p>Thử đổi bộ lọc nguồn, danh mục hoặc cụm từ tìm kiếm</p>
              <button
                type="button"
                className={styles.resetFilterBtn}
                onClick={() => {
                  setSourceFilter('all');
                  setCategoryFilter('all');
                  setSearchTerm('');
                }}
              >
                <Icon name="refresh" size={14} />
                <span>Xóa bộ lọc</span>
              </button>
            </div>
          )}
        </div>

        {/* ========================================================
            5. SPOTLIGHT DETAIL (MODAL INSPECTOR)
           ======================================================== */}
        {selectedDaoAnh && (
          <div
            className={styles.spotlightOverlay}
            onClick={() => setSelectedDaoAnh(null)}
            role="dialog"
            aria-modal="true"
            aria-label={`Chi tiết Đạo Anh ${selectedDaoAnh.name}`}
          >
            <div
              className={styles.spotlightDialog}
              onClick={(e) => e.stopPropagation()}
              style={{
                '--da-primary': selectedDaoAnh.primaryColor || '#fbbf24',
                '--da-secondary': selectedDaoAnh.secondaryColor || '#f97316',
                '--da-glow': selectedDaoAnh.glowColor || 'rgba(251, 191, 36, 0.6)',
              }}
            >
              {/* Close Button */}
              <button
                className={styles.spotlightCloseBtn}
                onClick={() => setSelectedDaoAnh(null)}
                aria-label="Đóng chi tiết"
                title="Đóng (ESC)"
              >
                <Icon name="x" size={18} />
              </button>

              {/* Spotlight Content Split */}
              <div className={styles.spotlightSplit}>
                {/* LEFT PANE: Art Showcase & Kiếp Selection */}
                <div className={styles.spotlightLeft}>
                  <div className={styles.spotlightAvatarBackdrop}>
                    <DaoAnhAvatarRenderer
                      daoAnh={selectedDaoAnh}
                      size={280}
                      imageSize="full"
                      currentKiep={previewKiep}
                      animate={true}
                      showAura={true}
                    />
                  </div>

                  {/* Tribulation Kiếp Selector */}
                  <div className={styles.haloStageControl}>
                    <div className={styles.haloLabelRow}>
                      <span className={styles.haloHeadingText}>HÀO QUANG ĐỘ KIẾP</span>
                      <strong className={styles.haloCurrentKiep}>
                        Kiếp {previewKiep}/5 {previewKiep === 5 ? 'Viên Mãn' : ''}
                      </strong>
                    </div>

                    <div className={styles.haloBtnGroup} role="group" aria-label="Xem trước kiếp">
                      {[1, 2, 3, 4, 5].map((k) => (
                        <button
                          key={`k-btn-${k}`}
                          type="button"
                          className={`${styles.haloBtn} ${previewKiep === k ? styles.activeHaloBtn : ''}`}
                          onClick={() => setPreviewKiep(k)}
                          aria-label={`Kiếp ${k}`}
                        >
                          K{k}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* RIGHT PANE: Title, Skill & Lore */}
                <div className={styles.spotlightRight}>
                  {/* Title & Honorific */}
                  <div className={styles.spotlightHeader}>
                    <div className={styles.spotlightBadgesRow}>
                      <span className={styles.spotlightTierBadge}>THẦN PHẨM</span>
                      <span className={styles.spotlightSourceBadge}>
                        {selectedDaoAnh.sourceType === 'lamp' ? 'Mệnh Đăng' : 'Vật Trấn Áp'}
                      </span>
                    </div>
                    <h2 className={styles.spotlightName}>{selectedDaoAnh.name}</h2>
                    {selectedDaoAnh.title && (
                      <div className={styles.spotlightHonorific}>{selectedDaoAnh.title}</div>
                    )}
                    {selectedDaoAnh.poem && (
                      <div className={styles.spotlightPoem}>"{selectedDaoAnh.poem}"</div>
                    )}
                  </div>

                  {/* Tribulation Form Title */}
                  {selectedDaoAnh.tribulationForm && (
                    <div className={styles.tribulationFormBadge}>
                      <span className={styles.formTag}>CỰC HẠN THẦN THÂN:</span>
                      <span className={styles.formValue}>{selectedDaoAnh.tribulationForm}</span>
                    </div>
                  )}

                  {/* Signature Skill Box */}
                  {(selectedDaoAnh.skillName || selectedDaoAnh.skillDesc) && (
                    <div className={styles.spotlightSectionSkill}>
                      <div className={styles.sectionSkillHeader}>
                        <Icon name="bolt" size={15} className={styles.sectionSkillIcon} />
                        <span className={styles.sectionSkillTitle}>THẦN THÔNG:</span>
                        <span className={styles.skillCoreName}>{selectedDaoAnh.skillName}</span>
                      </div>
                      {selectedDaoAnh.skillDesc && (
                        <p className={styles.skillCoreDesc}>{selectedDaoAnh.skillDesc}</p>
                      )}
                    </div>
                  )}

                  {/* Lore Description */}
                  {selectedDaoAnh.desc && (
                    <div className={styles.spotlightSectionLore}>
                      <div className={styles.sectionLoreHeader}>
                        <Icon name="scroll" size={14} />
                        <span>CHÂN THÂN & KHỞI NGUYÊN</span>
                      </div>
                      <p className={styles.loreDescText}>{selectedDaoAnh.desc}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Quick Navigation */}
              <div className={styles.spotlightNavFooter}>
                <button
                  type="button"
                  className={styles.spotlightNavBtn}
                  onClick={handlePrev}
                  aria-label="Đạo Anh trước"
                >
                  <Icon name="arrow-left" size={16} />
                  <span>Đạo Anh Trước</span>
                  <span className={styles.navKeyHint}>[←]</span>
                </button>

                <div className={styles.spotlightNavCounter}>
                  {currentIndex >= 0 && (
                    <span>
                      Đạo Anh <strong>{currentIndex + 1}</strong> / {filteredList.length}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  className={styles.spotlightNavBtn}
                  onClick={handleNext}
                  aria-label="Đạo Anh kế tiếp"
                >
                  <span>Đạo Anh Kế Tiếp</span>
                  <span className={styles.navKeyHint}>[→]</span>
                  <Icon name="arrow-right" size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
