import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { DAO_ANH_LIST, DAO_ANH_ELEMENT_TYPES } from '../../lib/daoAnhData';
import DaoAnhAvatarRenderer from './DaoAnhAvatarRenderer';
import styles from './DaoAnhGalleryModal.module.css';

export default function DaoAnhGalleryModal({ isOpen, onClose }) {
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'lamp' | 'artifact'
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [selectedDaoAnh, setSelectedDaoAnh] = useState(null);
  const [previewKiep, setPreviewKiep] = useState(5); // Default to max 5 kiếp for full splendor
  const [hoveredCardId, setHoveredCardId] = useState(null);

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
        const matchName = da.name.toLowerCase().includes(query);
        const matchTitle = (da.title || '').toLowerCase().includes(query);
        const matchSkill = (da.skillName || '').toLowerCase().includes(query);
        const matchPoem = (da.poem || '').toLowerCase().includes(query);
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

  // Keyboard navigation
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
          handlePrev();
        } else if (e.key === 'ArrowRight') {
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

  // Compute category count within current source filter
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

  const getCategoryName = (catId) => {
    const cat = Object.values(DAO_ANH_ELEMENT_TYPES).find((c) => c.id === catId);
    return cat ? `${cat.icon} ${cat.name}` : catId;
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
        
        {/* ========================================================
            1. CELESTIAL HEADER
           ======================================================== */}
        <div className={styles.modalHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIconWrap}>
              <span className={styles.headerIcon}>📜</span>
            </div>
            <div className={styles.headerTitles}>
              <div className={styles.headerMainRow}>
                <h2>VẠN CỔ ĐẠO ANH ĐỒ LỤC</h2>
                <span className={styles.headerTomeBadge}>BÁCH THẦN ĐIỂN</span>
              </div>
              <p>
                42 Thần Phẩm Pháp Tướng Nguyên Anh · Kết Tinh Từ 18 Thần Đăng & 24 Thần Vật Trấn Áp
              </p>
            </div>
          </div>

          <div className={styles.headerRight}>
            <div className={styles.headerStats}>
              <span className={styles.statPill} title="Tổng số Pháp Tướng Thần Phẩm">
                ⚡ <strong>{DAO_ANH_LIST.length}</strong> Đạo Anh
              </span>
              <span className={styles.statPill} title="Kết tinh từ Mệnh Đăng">
                🏮 <strong>{lampTotal}</strong> Mệnh Đăng
              </span>
              <span className={styles.statPill} title="Kết tinh từ Vật Trấn Áp">
                🏛️ <strong>{artifactTotal}</strong> Trấn Áp
              </span>
            </div>
            <button className={styles.closeBtn} onClick={onClose} title="Đóng (ESC)">
              ✕
            </button>
          </div>
        </div>

        {/* ========================================================
            2. CONTROL BAR (SOURCE TABS, VIEW SWITCH & SEARCH)
           ======================================================== */}
        <div className={styles.controlBar}>
          <div className={styles.sourceTabsGroup}>
            <button
              className={`${styles.sourceTabBtn} ${sourceFilter === 'all' ? styles.activeSource : ''}`}
              onClick={() => setSourceFilter('all')}
            >
              <span>🌌 Toàn Bộ ({DAO_ANH_LIST.length})</span>
            </button>
            <button
              className={`${styles.sourceTabBtn} ${sourceFilter === 'lamp' ? styles.activeSource : ''}`}
              onClick={() => setSourceFilter('lamp')}
            >
              <span>🏮 Mệnh Đăng ({lampTotal})</span>
            </button>
            <button
              className={`${styles.sourceTabBtn} ${sourceFilter === 'artifact' ? styles.activeSource : ''}`}
              onClick={() => setSourceFilter('artifact')}
            >
              <span>🏛️ Vật Trấn Áp ({artifactTotal})</span>
            </button>
          </div>

          <div className={styles.controlBarRight}>
            {/* View Mode Switcher */}
            <div className={styles.viewModeToggle}>
              <button
                className={`${styles.viewModeBtn} ${viewMode === 'grid' ? styles.activeViewMode : ''}`}
                onClick={() => setViewMode('grid')}
                title="Dạng Thẻ Tiên Điển"
              >
                🎴 Thẻ Bài
              </button>
              <button
                className={`${styles.viewModeBtn} ${viewMode === 'list' ? styles.activeViewMode : ''}`}
                onClick={() => setViewMode('list')}
                title="Dạng Quyển Trục Thu Gọn"
              >
                📜 Danh Mục
              </button>
            </div>

            {/* Search Input */}
            <div className={styles.searchBox}>
              <span className={styles.searchIcon}>🔍</span>
              <input
                type="text"
                placeholder="Tìm tên Đạo Anh, khẩu quyết, thần thông..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  className={styles.searchClearBtn}
                  onClick={() => setSearchTerm('')}
                  title="Xóa tìm kiếm"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================
            3. ELEMENT CATEGORY CHIP BAR
           ======================================================== */}
        <div className={styles.categoryBar}>
          {Object.values(DAO_ANH_ELEMENT_TYPES).map((cat) => {
            const count = categoryCounts[cat.id] || 0;
            if (count === 0 && cat.id !== 'all' && sourceFilter !== 'all') return null;
            const isActive = categoryFilter === cat.id;
            return (
              <button
                key={`cat-${cat.id}`}
                className={`${styles.categoryChip} ${isActive ? styles.activeCategoryChip : ''}`}
                onClick={() => setCategoryFilter(cat.id)}
              >
                <span className={styles.catIcon}>{cat.icon}</span>
                <span className={styles.catName}>{cat.name}</span>
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
                return (
                  <div
                    key={da.id}
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
                  >
                    {/* Top Badges */}
                    <div className={styles.cardHeaderBadges}>
                      <span className={styles.tierBadge}>THẦN PHẨM</span>
                      <span className={styles.sourceBadge}>
                        {da.sourceType === 'lamp' ? '🏮 MỆNH ĐĂNG' : '🏛️ TRẤN ÁP'}
                      </span>
                    </div>

                    {/* Stage Portrait Mirror - PHÓNG TO NỔI BẬT NGHỆ THUẬT */}
                    <div className={styles.avatarStageWrap}>
                      <DaoAnhAvatarRenderer
                        daoAnh={da}
                        size={200}
                        currentKiep={previewKiep}
                        animate={isHovered}
                        showAura={true}
                      />
                    </div>

                    {/* Text Details - TINH GỌN SANG TRỌNG */}
                    <div className={styles.cardContent}>
                      <h3 className={styles.cardName}>{da.name}</h3>
                      <div className={styles.cardTitle}>{da.title}</div>

                      <div className={styles.skillPreviewTag} title={da.skillDesc}>
                        <span className={styles.skillIcon}>⚡</span>
                        <span className={styles.skillNameText}>{da.skillName}</span>
                      </div>
                    </div>

                    {/* Card Bottom Bar */}
                    <div className={styles.cardFooter}>
                      <span className={styles.kiepLabel}>
                        <span className={styles.kiepDotGlow}>●</span> 5 Kiếp Thần Tướng
                      </span>
                      <span className={styles.inspectBtnText}>
                        Chi Tiết ➔
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* B. COMPACT LIST VIEW */}
          {viewMode === 'list' && (
            <div className={styles.listContainer}>
              {filteredList.map((da, idx) => (
                <div
                  key={da.id}
                  className={styles.listItemRow}
                  style={{
                    '--row-color': da.primaryColor || '#fbbf24',
                    '--row-glow': da.glowColor || 'rgba(251, 191, 36, 0.3)',
                  }}
                  onClick={() => {
                    setSelectedDaoAnh(da);
                    setPreviewKiep(5);
                  }}
                >
                  <div className={styles.listIndex}>#{idx + 1}</div>

                  <div className={styles.listAvatarWrap}>
                    <DaoAnhAvatarRenderer
                      daoAnh={da}
                      size={52}
                      currentKiep={previewKiep}
                      animate={false}
                      showAura={false}
                    />
                  </div>

                  <div className={styles.listMainInfo}>
                    <div className={styles.listTitleRow}>
                      <h4 className={styles.listName}>{da.name}</h4>
                      <span className={styles.listTier}>THẦN PHẨM</span>
                      <span className={styles.listSource}>
                        {da.sourceType === 'lamp' ? '🏮 Mệnh Đăng' : '🏛️ Trấn Áp'}
                      </span>
                    </div>
                    <div className={styles.listSubTitle}>{da.title} · <em>"{da.poem}"</em></div>
                  </div>

                  <div className={styles.listSkillCol}>
                    <div className={styles.listSkillName}>⚡ {da.skillName}</div>
                    <div className={styles.listSkillDesc}>{da.skillDesc}</div>
                  </div>

                  <div className={styles.listActionCol}>
                    <button className={styles.listInspectBtn}>
                      Chi Tiết ➔
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {filteredList.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🔮</div>
              <h3>Không tìm thấy Đạo Anh phù hợp</h3>
              <p>Thử điều chỉnh bộ lọc Mệnh Đăng / Trấn Áp hoặc từ khóa tìm kiếm</p>
              <button
                className={styles.resetFilterBtn}
                onClick={() => {
                  setSourceFilter('all');
                  setCategoryFilter('all');
                  setSearchTerm('');
                }}
              >
                Khôi Phục Bộ Lọc
              </button>
            </div>
          )}
        </div>

        {/* ========================================================
            5. SPOTLIGHT DETAIL INSPECTOR (MODAL DIALOG)
           ======================================================== */}
        {selectedDaoAnh && (
          <div className={styles.spotlightOverlay} onClick={() => setSelectedDaoAnh(null)}>
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
                title="Đóng (ESC)"
              >
                ✕
              </button>

              {/* Spotlight Content Split */}
              <div className={styles.spotlightSplit}>
                
                {/* LEFT PANE: Large Avatar & Tribulation Halo Stage */}
                <div className={styles.spotlightLeft}>
                  <div className={styles.spotlightAvatarBackdrop}>
                    <DaoAnhAvatarRenderer
                      daoAnh={selectedDaoAnh}
                      size={220}
                      currentKiep={previewKiep}
                      animate={true}
                      showAura={true}
                    />
                  </div>

                  {/* Interactive Tribulation Halo Stage Selector */}
                  <div className={styles.haloStageControl}>
                    <div className={styles.haloLabelRow}>
                      <span>HÀO QUANG ĐỘ KIẾP:</span>
                      <strong className={styles.haloCurrentKiep}>
                        {previewKiep === 0 ? 'Sơ Khai' : `Kiếp ${previewKiep}/5 Viên Mãn`}
                      </strong>
                    </div>
                    <div className={styles.haloBtnGroup}>
                      {[0, 1, 2, 3, 4, 5].map((k) => (
                        <button
                          key={`k-btn-${k}`}
                          className={`${styles.haloBtn} ${previewKiep === k ? styles.activeHaloBtn : ''}`}
                          onClick={() => setPreviewKiep(k)}
                        >
                          {k === 0 ? 'Sơ Khai' : `K${k}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Evolution Form Title */}
                  <div className={styles.tribulationFormBadge}>
                    <span className={styles.formTag}>👑 CỰC HẠN THẦN THÂN:</span>
                    <span className={styles.formValue}>{selectedDaoAnh.tribulationForm}</span>
                  </div>
                </div>

                {/* RIGHT PANE: Deep Lore, Skill & Inscriptions */}
                <div className={styles.spotlightRight}>
                  {/* Title & Origin Tags */}
                  <div className={styles.spotlightHeader}>
                    <div className={styles.spotlightBadgesRow}>
                      <span className={styles.spotlightTier}>THẦN PHẨM PHÁP TƯỚNG</span>
                      <span className={styles.spotlightSource}>
                        {selectedDaoAnh.sourceType === 'lamp' ? '🏮 MỆNH ĐĂNG' : '🏛️ VẬT TRẤN ÁP'}
                      </span>
                      <span className={styles.spotlightCategory}>
                        {getCategoryName(selectedDaoAnh.category)}
                      </span>
                    </div>
                    <h2 className={styles.spotlightName}>{selectedDaoAnh.name}</h2>
                    <div className={styles.spotlightHonorific}>{selectedDaoAnh.title}</div>
                  </div>

                  {/* Divine Inscription / Poem */}
                  <div className={styles.spotlightPoemBox}>
                    <span className={styles.poemQuoteMark}>“</span>
                    <p className={styles.spotlightPoemText}>{selectedDaoAnh.poem}</p>
                    <span className={styles.poemQuoteMarkEnd}>”</span>
                  </div>

                  {/* Signature Skill Box */}
                  <div className={styles.spotlightSectionSkill}>
                    <div className={styles.sectionSkillHeader}>
                      <span className={styles.sectionSkillIcon}>⚡</span>
                      <span className={styles.sectionSkillTitle}>THẦN THÔNG BẢN MỆNH</span>
                    </div>
                    <div className={styles.skillCoreName}>{selectedDaoAnh.skillName}</div>
                    <p className={styles.skillCoreDesc}>{selectedDaoAnh.skillDesc}</p>
                  </div>

                  {/* Lore Description */}
                  <div className={styles.spotlightSectionLore}>
                    <div className={styles.sectionLoreHeader}>
                      <span>📜 CHÂN THÂN TẢ TƯỚNG & KHỞI NGUYÊN</span>
                    </div>
                    <p className={styles.loreDescText}>{selectedDaoAnh.desc}</p>
                  </div>

                  {/* Origin Info */}
                  <div className={styles.spotlightSectionOrigin}>
                    <div className={styles.originLabel}>Nguồn Gốc Bản Thể:</div>
                    <div className={styles.originValue}>
                      {selectedDaoAnh.sourceType === 'lamp'
                        ? 'Sinh ra từ uy năng vô thượng của Mệnh Đăng Thần Phẩm tương ứng.'
                        : 'Ngưng tụ từ căn cơ thái cổ của Thần Vật Trấn Áp Thần Phẩm.'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Quick Navigation Between Items */}
              <div className={styles.spotlightNavFooter}>
                <button className={styles.spotlightNavBtn} onClick={handlePrev}>
                  <span>◀ Đạo Anh Trước</span>
                  <span className={styles.navKeyHint}>[←]</span>
                </button>

                <div className={styles.spotlightNavCounter}>
                  {currentIndex >= 0 && (
                    <span>
                      Đạo Anh <strong>{currentIndex + 1}</strong> / {filteredList.length}
                    </span>
                  )}
                </div>

                <button className={styles.spotlightNavBtn} onClick={handleNext}>
                  <span className={styles.navKeyHint}>[→]</span>
                  <span>Đạo Anh Kế Tiếp ▶</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

