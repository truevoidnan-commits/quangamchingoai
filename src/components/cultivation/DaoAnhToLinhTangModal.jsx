import Icon from '../ui/Icon';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './DaoAnhToLinhTangModal.module.css';
import { 
  getProminentDaoAnhs, 
  getLinhTangNameFromDaoAnh 
} from '../../lib/cultivation';
import { 
  THAN_PHAM_AI_ICONS, 
  LAMP_THAN_PHAM_AI_ICONS 
} from '../../lib/artifactIcons';

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V'];

const TIER_LABELS = {
  than_pham: 'Thần Phẩm',
  THAN_PHAM: 'Thần Phẩm',
  tien_pham: 'Tiên Phẩm',
  TIEN_PHAM: 'Tiên Phẩm',
  cuc_pham: 'Cực Phẩm',
  CUC_PHAM: 'Cực Phẩm',
  thuong_pham: 'Thượng Phẩm',
  THUONG_PHAM: 'Thượng Phẩm',
  trung_pham: 'Trung Phẩm',
  TRUNG_PHAM: 'Trung Phẩm',
  ha_pham: 'Hạ Phẩm',
  HA_PHAM: 'Hạ Phẩm',
};

const TIER_COLORS = {
  than_pham: '#ef4444',
  THAN_PHAM: '#ef4444',
  tien_pham: '#f59e0b',
  TIEN_PHAM: '#f59e0b',
  cuc_pham: '#eab308',
  CUC_PHAM: '#eab308',
  thuong_pham: '#a855f7',
  THUONG_PHAM: '#a855f7',
  trung_pham: '#38bdf8',
  TRUNG_PHAM: '#38bdf8',
  ha_pham: '#10b981',
  HA_PHAM: '#10b981',
};

export default function DaoAnhToLinhTangModal({
  isOpen,
  onClose,
  daoAnhs = [],
  currentLinhTangs = [],
  onConfirm,
  mode = 'breakthrough' // 'breakthrough' | 'reassign'
}) {
  const [selectedIds, setSelectedIds] = useState([null, null, null, null, null]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'unassigned' | 'assigned'
  const modalRef = useRef(null);

  // Khởi tạo lựa chọn ban đầu
  useEffect(() => {
    if (!isOpen) return;

    // 1. Nếu đang ở mode reassign và đã có linhTangs
    if (mode === 'reassign' && currentLinhTangs && currentLinhTangs.length >= 5) {
      const initial = currentLinhTangs.slice(0, 5).map(t => t.sourceDaoAnhId || null);
      setSelectedIds(initial);
      const firstEmpty = initial.findIndex(id => !id);
      setActiveSlot(firstEmpty !== -1 ? firstEmpty : 0);
      return;
    }

    // 2. Mặc định: Gợi ý trước 5 Đạo Anh nổi bật nhất nhưng cho phép người dùng tùy ý chọn lại
    const top5 = getProminentDaoAnhs(daoAnhs, 5);
    const initial = [null, null, null, null, null];
    top5.forEach((da, idx) => {
      if (idx < 5) initial[idx] = da.id;
    });
    setSelectedIds(initial);
    setActiveSlot(0);
  }, [isOpen, daoAnhs, currentLinhTangs, mode]);

  // Phím Escape đóng modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Helper lấy ảnh đại diện của Đạo Anh
  const getDaoAnhArt = (da) => {
    if (!da) return '';
    if (da.lampId && LAMP_THAN_PHAM_AI_ICONS[da.lampId]) {
      return LAMP_THAN_PHAM_AI_ICONS[da.lampId];
    }
    if (da.artifactId && THAN_PHAM_AI_ICONS[da.artifactId]) {
      return THAN_PHAM_AI_ICONS[da.artifactId];
    }
    const nameLower = (da.name || '').toLowerCase();
    if (nameLower.includes('thiên đạo')) return LAMP_THAN_PHAM_AI_ICONS['thien_dao_chi_ton'] || '';
    if (nameLower.includes('thời không')) return LAMP_THAN_PHAM_AI_ICONS['khoi_nguyen_thoi_khong'] || '';
    if (nameLower.includes('hoàng tuyền') || nameLower.includes('bỉ ngạn')) return LAMP_THAN_PHAM_AI_ICONS['hoang_tuyen_bi_ngan'] || '';
    if (nameLower.includes('đế kiếm')) return THAN_PHAM_AI_ICONS['de_kiem'] || '';
    if (nameLower.includes('luân hồi')) return THAN_PHAM_AI_ICONS['tam_sinh_luan_hoi_an'] || '';
    if (nameLower.includes('hỗn độn')) return THAN_PHAM_AI_ICONS['am_duong_hon_don_nguyen_can'] || '';
    if (nameLower.includes('hồng mông')) return LAMP_THAN_PHAM_AI_ICONS['hong_mong_bat_diet'] || '';
    if (nameLower.includes('tạo hóa')) return THAN_PHAM_AI_ICONS['tao_hoa_ngoc_diep'] || '';
    if (nameLower.includes('kiếm')) return THAN_PHAM_AI_ICONS['de_kiem'] || THAN_PHAM_AI_ICONS['thao_tu_kiem_quyet'] || '';
    return THAN_PHAM_AI_ICONS['tam_sinh_luan_hoi_an'] || '';
  };

  // Chọn hoặc bỏ chọn một Đạo Anh
  const handleToggleDaoAnh = (da) => {
    const existingIndex = selectedIds.indexOf(da.id);

    // Nếu đã được chọn -> Bỏ chọn khỏi vị trí đó
    if (existingIndex !== -1) {
      if (mode === 'reassign' && currentLinhTangs[existingIndex]?.isGateOpen) {
        return;
      }
      const next = [...selectedIds];
      next[existingIndex] = null;
      setSelectedIds(next);
      setActiveSlot(existingIndex);
      return;
    }

    // Nếu chưa được chọn -> Gán vào slot đang active hoặc slot trống đầu tiên
    let targetSlot = activeSlot;
    if (selectedIds[targetSlot] !== null) {
      const firstEmpty = selectedIds.findIndex(id => id === null);
      if (firstEmpty !== -1) {
        targetSlot = firstEmpty;
      }
    }

    if (mode === 'reassign' && currentLinhTangs[targetSlot]?.isGateOpen) {
      return;
    }

    const next = [...selectedIds];
    next[targetSlot] = da.id;
    setSelectedIds(next);

    // Tự động nhảy sang slot trống kế tiếp
    const nextEmpty = next.findIndex((id, idx) => id === null && idx !== targetSlot);
    if (nextEmpty !== -1) {
      setActiveSlot(nextEmpty);
    }
  };

  // Gợi ý Top 5 mạnh nhất
  const handleAutoSelectTop5 = () => {
    const top5 = getProminentDaoAnhs(daoAnhs, 5);
    const next = [...selectedIds];
    top5.forEach((da, idx) => {
      if (mode === 'reassign' && currentLinhTangs[idx]?.isGateOpen) return;
      if (idx < 5) next[idx] = da.id;
    });
    setSelectedIds(next);
  };

  // Xóa trắng lựa chọn
  const handleClearAll = () => {
    const next = selectedIds.map((id, idx) => {
      if (mode === 'reassign' && currentLinhTangs[idx]?.isGateOpen) return id;
      return null;
    });
    setSelectedIds(next);
    const firstEmpty = next.findIndex(id => !id);
    setActiveSlot(firstEmpty !== -1 ? firstEmpty : 0);
  };

  // Lọc danh sách Đạo Anh kho
  const filteredDaoAnhs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return daoAnhs.filter(da => {
      const isAssigned = selectedIds.includes(da.id);
      if (statusFilter === 'assigned' && !isAssigned) return false;
      if (statusFilter === 'unassigned' && isAssigned) return false;

      if (!q) return true;
      const nameMatch = (da.name || '').toLowerCase().includes(q);
      const tierMatch = (TIER_LABELS[da.tier] || '').toLowerCase().includes(q);
      return nameMatch || tierMatch;
    });
  }, [daoAnhs, selectedIds, statusFilter, searchQuery]);

  const assignedCount = selectedIds.filter(Boolean).length;
  const isReady = assignedCount === 5;

  const handleConfirm = () => {
    if (!isReady) return;
    if (onConfirm) onConfirm(selectedIds);
    if (onClose) onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div 
      className={styles.modalOverlay} 
      onClick={onClose}
      role="presentation"
    >
      <div 
        ref={modalRef}
        className={styles.modalCard}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-modal-title"
      >
        {/* HEADER */}
        <div className={styles.modalHeader}>
          <div className={styles.headerInfo}>
            <h3 id="assign-modal-title" className={styles.modalTitle}>
              <Icon name="shield" size={18} />
              <span>TUYỂN CHỌN 5 ĐẠO ANH HÓA 5 BÍ TÀNG</span>
            </h3>
            <p className={styles.modalSubtitle}>
              Tự tay chọn 5 Tôn Đạo Anh tinh hoa nhất làm nguyên liệu chính đúc nên 5 Cự Tọa Tàng Môn Thức Hải.
            </p>
          </div>
          <button 
            type="button"
            className={styles.closeBtn} 
            onClick={onClose}
            aria-label="Đóng bảng chọn"
            title="Đóng (Escape)"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* BODY */}
        <div className={styles.modalBody}>
          {/* PHẦN 1: 5 SLOTS BÍ TÀNG */}
          <div className={styles.slotsSection}>
            <div className={styles.slotsSectionHeader}>
              <span className={styles.slotsTitle}>
                <Icon name="planet" size={15} />
                5 CỰ TỌA TÀNG MÔN ({assignedCount}/5 ĐÃ CHỌN)
              </span>
              <div className={styles.slotsActions}>
                <button 
                  type="button"
                  className={styles.quickActionBtn}
                  onClick={handleAutoSelectTop5}
                  title="Gợi ý 5 Đạo Anh phẩm cấp cao nhất"
                >
                  <Icon name="bolt" size={13} />
                  Gợi Ý Top 5 Mạnh Nhất
                </button>
                <button 
                  type="button"
                  className={styles.clearActionBtn}
                  onClick={handleClearAll}
                  title="Gỡ toàn bộ Đạo Anh đang chọn"
                >
                  <Icon name="trash" size={13} />
                  Xóa Hết
                </button>
              </div>
            </div>

            {/* 5 Cột tương ứng 5 Tòa */}
            <div className={styles.slotsGrid}>
              {Array.from({ length: 5 }).map((_, slotIdx) => {
                const daId = selectedIds[slotIdx];
                const da = daoAnhs.find(d => d.id === daId);
                const isActive = activeSlot === slotIdx;
                const isLocked = mode === 'reassign' && currentLinhTangs[slotIdx]?.isGateOpen;
                const originName = da ? getLinhTangNameFromDaoAnh(da, slotIdx) : null;
                const artUrl = getDaoAnhArt(da);

                let cardClass = styles.slotCard;
                if (isActive) cardClass += ` ${styles.slotCardActive}`;
                if (isLocked) cardClass += ` ${styles.slotCardLocked}`;
                if (!da) {
                  cardClass += ` ${styles.slotCardEmpty}`;
                  if (isActive) cardClass += ` ${styles.slotCardEmptyActive}`;
                }

                return (
                  <div
                    key={slotIdx}
                    className={cardClass}
                    onClick={() => {
                      if (!isLocked) setActiveSlot(slotIdx);
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Tòa ${ROMAN_NUMERALS[slotIdx]}: ${da ? da.name : 'Chưa an bài'}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (!isLocked) setActiveSlot(slotIdx);
                      }
                    }}
                  >
                    <div className={`${styles.slotChip} ${isActive ? styles.slotChipActive : ''}`}>
                      TÒA {ROMAN_NUMERALS[slotIdx]}
                      {isLocked && <span style={{ color: '#4ade80', marginLeft: 4 }}>✓</span>}
                    </div>

                    {da ? (
                      <>
                        <div className={styles.slotAvatarRing}>
                          {artUrl ? (
                            <img src={artUrl} alt={da.name} className={styles.slotAvatarImg} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Icon name="orb" size={24} />
                            </div>
                          )}
                        </div>

                        <div className={styles.slotDaoAnhName}>
                          {da.name}
                        </div>

                        {originName && (
                          <div className={styles.slotOriginTreasury}>
                            {originName} Bí Tàng
                          </div>
                        )}

                        {!isLocked && (
                          <button
                            type="button"
                            className={styles.unassignBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              const next = [...selectedIds];
                              next[slotIdx] = null;
                              setSelectedIds(next);
                              setActiveSlot(slotIdx);
                            }}
                            title="Gỡ khỏi slot này"
                            aria-label={`Gỡ ${da.name} khỏi Tòa ${ROMAN_NUMERALS[slotIdx]}`}
                          >
                            <Icon name="x" size={11} />
                            Gỡ
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <div className={styles.emptySlotIcon}>
                          <Icon name="plus" size={18} />
                        </div>
                        <div className={styles.emptySlotText}>
                          {isActive ? 'Đang chọn' : 'Chưa an bài'}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* PHẦN 2: KHO ĐẠO ANH THỨC HẢI (REPOSITORY) */}
          <div className={styles.repoSection}>
            <div className={styles.repoToolbar}>
              <div className={styles.searchBox}>
                <Icon name="search" size={15} />
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Tìm kiếm Đạo Anh theo tên, phẩm cấp..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Tìm kiếm Đạo Anh"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
                    aria-label="Xóa tìm kiếm"
                  >
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>

              <div className={styles.filterPills}>
                <button
                  type="button"
                  className={`${styles.filterPill} ${statusFilter === 'all' ? styles.filterPillActive : ''}`}
                  onClick={() => setStatusFilter('all')}
                >
                  Tất cả ({daoAnhs.length})
                </button>
                <button
                  type="button"
                  className={`${styles.filterPill} ${statusFilter === 'unassigned' ? styles.filterPillActive : ''}`}
                  onClick={() => setStatusFilter('unassigned')}
                >
                  Chưa gán ({daoAnhs.filter(da => !selectedIds.includes(da.id)).length})
                </button>
                <button
                  type="button"
                  className={`${styles.filterPill} ${statusFilter === 'assigned' ? styles.filterPillActive : ''}`}
                  onClick={() => setStatusFilter('assigned')}
                >
                  Đã gán ({daoAnhs.filter(da => selectedIds.includes(da.id)).length})
                </button>
              </div>
            </div>

            {/* Grid Đạo Anh kho */}
            <div className={styles.daoAnhGrid}>
              {filteredDaoAnhs.length === 0 ? (
                <div className={styles.emptyRepoState}>
                  <Icon name="inbox" size={32} />
                  <p style={{ marginTop: 8 }}>Không tìm thấy Đạo Anh nào phù hợp với bộ lọc.</p>
                </div>
              ) : (
                filteredDaoAnhs.map(da => {
                  const assignedSlotIndex = selectedIds.indexOf(da.id);
                  const isAssigned = assignedSlotIndex !== -1;
                  const isLocked = mode === 'reassign' && isAssigned && currentLinhTangs[assignedSlotIndex]?.isGateOpen;
                  const artUrl = getDaoAnhArt(da);
                  const tierColor = TIER_COLORS[da.tier] || '#38bdf8';
                  const tierLabel = TIER_LABELS[da.tier] || 'Thần Phẩm';

                  let repoClass = styles.repoCard;
                  if (isAssigned) repoClass += ` ${styles.repoCardAssigned}`;
                  if (isLocked) repoClass += ` ${styles.repoCardLocked}`;

                  return (
                    <div
                      key={da.id}
                      className={repoClass}
                      onClick={() => {
                        if (!isLocked) handleToggleDaoAnh(da);
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`${da.name}, ${tierLabel}, Kiếp ${da.currentKiep || 5}/5${isAssigned ? `, đang an bài tại Tòa ${ROMAN_NUMERALS[assignedSlotIndex]}` : ''}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          if (!isLocked) handleToggleDaoAnh(da);
                        }
                      }}
                    >
                      {/* Thumbnail */}
                      <div 
                        className={styles.repoThumbnail}
                        style={{ borderColor: isAssigned ? '#22c55e' : tierColor }}
                      >
                        {artUrl ? (
                          <img src={artUrl} alt={da.name} className={styles.repoImg} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon name="orb" size={20} />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className={styles.repoInfo}>
                        <div className={styles.repoName}>
                          {da.name}
                        </div>

                        <div className={styles.repoMetaRow}>
                          <span 
                            className={styles.tierBadge}
                            style={{
                              background: `${tierColor}20`,
                              border: `1px solid ${tierColor}60`,
                              color: tierColor,
                            }}
                          >
                            {tierLabel}
                          </span>
                          <span className={styles.kiepBadge}>
                            Kiếp {da.currentKiep || 5}/5
                          </span>
                        </div>

                        {/* Vị trí gán */}
                        {isAssigned && (
                          <div className={styles.assignedStatusTag}>
                            <Icon name="shield" size={13} />
                            <span>Đang an bài tại Tòa {ROMAN_NUMERALS[assignedSlotIndex]}</span>
                            {isLocked && <span style={{ color: '#4ade80' }}>(Đã mở cổng)</span>}
                          </div>
                        )}
                      </div>

                      {/* Checkmark icon */}
                      {isAssigned && (
                        <div className={styles.checkBadge}>
                          ✓
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className={styles.modalFooter}>
          <button 
            type="button"
            className={styles.cancelBtn} 
            onClick={onClose}
          >
            Hủy Bỏ
          </button>

          <button
            type="button"
            className={styles.confirmBtn}
            onClick={handleConfirm}
            disabled={!isReady}
          >
            {mode === 'reassign' 
              ? `Xác Nhận Thiết Lập 5 Bí Tàng (${assignedCount}/5)`
              : `Xác Nhận Đột Phá Linh Tàng (${assignedCount}/5)`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
