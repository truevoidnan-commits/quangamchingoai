import React, { useState, useMemo, useEffect } from 'react';
import Icon from '../ui/Icon';
import DaoAnhAvatarRenderer from './DaoAnhAvatarRenderer';
import {
  SUPPRESSING_ARTIFACTS,
  LAMP_TIERS,
  getPalaceNameFromArtifact,
  formatDaoAnhTitle,
} from '../../lib/cultivation';
import { DAO_ANH_LIST, findDaoAnhDefinition } from '../../lib/daoAnhData';
import styles from './SwapAnchorModal.module.css';

const TIER_ORDER = ['than_pham', 'tien_pham', 'cuc_pham', 'thuong_pham', 'trung_pham', 'ha_pham'];

const FALLBACK_TIER_INFO = {
  than_pham: { id: 'than_pham', name: 'Thần Phẩm', color: '#ef4444', border: '#fbbf24', bg: 'rgba(239, 68, 68, 0.18)' },
  tien_pham: { id: 'tien_pham', name: 'Tiên Phẩm', color: '#eab308', border: '#fde68a', bg: 'rgba(234, 179, 8, 0.18)' },
  cuc_pham: { id: 'cuc_pham', name: 'Cực Phẩm', color: '#c084fc', border: '#e9d5ff', bg: 'rgba(192, 132, 252, 0.18)' },
  thuong_pham: { id: 'thuong_pham', name: 'Thượng Phẩm', color: '#38bdf8', border: '#bae6fd', bg: 'rgba(56, 189, 248, 0.18)' },
  trung_pham: { id: 'trung_pham', name: 'Trung Phẩm', color: '#4ade80', border: '#bbf7d0', bg: 'rgba(74, 222, 128, 0.18)' },
  ha_pham: { id: 'ha_pham', name: 'Hạ Phẩm', color: '#94a3b8', border: '#e2e8f0', bg: 'rgba(148, 163, 184, 0.18)' },
};

function getTierInfo(tierKey) {
  return (tierKey && LAMP_TIERS[tierKey]) || FALLBACK_TIER_INFO[tierKey] || FALLBACK_TIER_INFO.ha_pham;
}

export default function SwapAnchorModal({
  isOpen,
  onClose,
  palaceIndex,
  cultivation,
  onSwap,
  onNavigateToShop,
}) {
  const [selectedArtId, setSelectedArtId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state when opened or palaceIndex changed
  useEffect(() => {
    if (isOpen) {
      setSelectedArtId(null);
      setSearchQuery('');
      setTierFilter('all');
      setErrorMsg('');
      setIsSubmitting(false);
    }
  }, [isOpen, palaceIndex]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const pIdx = palaceIndex !== null && palaceIndex !== undefined ? Number(palaceIndex) : 0;
  const realm = cultivation?.realm || 'kim_dan';
  const rawAnchor = palaceIndex !== null && palaceIndex !== undefined ? cultivation?.palaceAnchors?.[pIdx] : null;

  // Resolve current anchor object
  let currentAnchor = null;
  if (typeof rawAnchor === 'string') {
    const foundArt = (SUPPRESSING_ARTIFACTS || []).find((a) => a.id === rawAnchor);
    currentAnchor = {
      id: rawAnchor,
      name: foundArt?.name || rawAnchor,
      shortName: foundArt?.shortName || foundArt?.name || rawAnchor,
      palaceName: foundArt ? getPalaceNameFromArtifact(foundArt, pIdx, {}) : `Thiên Cung #${pIdx + 1}`,
      tier: foundArt?.tier || 'ha_pham',
      type: foundArt?.type || 'Bảo Vật',
      icon: foundArt?.icon,
      color: foundArt?.color,
    };
  } else if (rawAnchor) {
    currentAnchor = { ...rawAnchor };
  }

  const currentTierInfo = getTierInfo(currentAnchor?.tier);
  const oldArtifactId = currentAnchor?.id;

  // Find Dao Anh for this palace if in Giả Anh or Nguyên Anh
  const isDaoAnhStage = realm === 'gia_anh' || realm === 'nguyen_anh';
  const currentDa = useMemo(() => {
    if (!isDaoAnhStage || !cultivation?.daoAnhs) return null;
    const maxThienCung = cultivation?.maxThienCung || 13;
    const lampCount = (cultivation?.absorbedLamps || []).length;

    let match = cultivation.daoAnhs.find(
      (d) => !d.fromLamp && d.artifactId === oldArtifactId
    );
    if (!match) {
      const expectedIdx = maxThienCung - 1 - pIdx;
      match = cultivation.daoAnhs.find(
        (d) => !d.fromLamp && d.palaceIndex === expectedIdx
      );
    }
    if (!match) {
      const fallbackIdx = pIdx + lampCount;
      match = cultivation.daoAnhs.find(
        (d) => !d.fromLamp && d.palaceIndex === fallbackIdx
      );
    }
    return match || null;
  }, [isDaoAnhStage, cultivation, oldArtifactId, pIdx]);

  const currentDaDef = useMemo(() => {
    if (!currentDa) return null;
    return findDaoAnhDefinition(currentDa, cultivation);
  }, [currentDa, cultivation]);

  const currentSkillName = currentDaDef?.skillName || currentDa?.skillName || 'Thần Thông Trấn Thủ';
  const currentSkillDesc = currentDaDef?.skillDesc || currentDa?.skillDesc || 'Uy áp trấn giữ thiên cung.';

  // Inventory artifacts (excluding the one already anchored in this palace)
  const groupedInventory = useMemo(() => {
    const inv = cultivation?.inventoryArtifacts || [];
    const counts = {};
    for (const id of inv) {
      counts[id] = (counts[id] || 0) + 1;
    }

    const items = [];
    for (const [id, count] of Object.entries(counts)) {
      if (id === oldArtifactId) continue;
      const art = (SUPPRESSING_ARTIFACTS || []).find((a) => a.id === id);
      if (art) {
        items.push({ ...art, count });
      }
    }

    // Sort by tier then name
    items.sort((a, b) => {
      const orderA = TIER_ORDER.indexOf(a.tier);
      const orderB = TIER_ORDER.indexOf(b.tier);
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name, 'vi');
    });

    return items;
  }, [cultivation?.inventoryArtifacts, oldArtifactId]);

  // Filtered inventory
  const filteredInventory = useMemo(() => {
    return groupedInventory.filter((item) => {
      if (tierFilter !== 'all' && item.tier !== tierFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesType = (item.type || '').toLowerCase().includes(q);
        const matchesPoem = (item.poem || '').toLowerCase().includes(q);
        if (!matchesName && !matchesType && !matchesPoem) return false;
      }
      return true;
    });
  }, [groupedInventory, tierFilter, searchQuery]);

  // Selected new artifact details
  const selectedArt = useMemo(() => {
    if (!selectedArtId) return null;
    return (SUPPRESSING_ARTIFACTS || []).find((a) => a.id === selectedArtId) || null;
  }, [selectedArtId]);

  // Preview of new Dao Anh
  const previewNewDaoAnh = useMemo(() => {
    if (!selectedArt || !currentDa) return null;
    const allAnchorsExceptCurrent = { ...(cultivation?.palaceAnchors || {}) };
    delete allAnchorsExceptCurrent[pIdx];
    const newPalaceName = getPalaceNameFromArtifact(selectedArt, pIdx, allAnchorsExceptCurrent);
    const newTitle = formatDaoAnhTitle(newPalaceName);

    const hasDedicatedDef = (DAO_ANH_LIST || []).some(
      (d) => d.sourceType === 'artifact' && d.sourceId === selectedArt.id
    );
    const resolvedDef = findDaoAnhDefinition(
      { artifactId: selectedArt.id, id: selectedArt.id, name: newTitle },
      cultivation
    );

    return {
      def: resolvedDef,
      name: newTitle,
      palaceName: newPalaceName,
      tier: selectedArt.tier,
      tierInfo: getTierInfo(selectedArt.tier),
      isDefaultFallback: !hasDedicatedDef,
      skillName: resolvedDef?.skillName || 'Thần Thông Chưa Rõ',
      skillDesc: resolvedDef?.skillDesc || 'Tăng cường linh lực và uy áp.',
    };
  }, [selectedArt, currentDa, cultivation, pIdx]);

  const handleConfirmSwap = async () => {
    if (!selectedArtId || isSubmitting) return;
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      if (onSwap) {
        await onSwap(pIdx, selectedArtId);
      } else if (cultivation?.swapAnchor) {
        cultivation.swapAnchor(pIdx, selectedArtId);
      }
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Đổi Vật Trấn Áp thất bại. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || palaceIndex === null || palaceIndex === undefined) {
    return null;
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="swap-anchor-title">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitleGroup}>
            <div className={styles.headerIcon}>
              <Icon name="swap" size={22} />
            </div>
            <div>
              <h3 id="swap-anchor-title" className={styles.title}>
                Đổi Vật Trấn Áp · {currentAnchor?.palaceName || `Thiên Cung #${pIdx + 1}`}
              </h3>
              <p className={styles.subtitle}>
                Hoán đổi vật trấn giữ Thiên Cung và đồng bộ Đạo Anh tương ứng
              </p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Đóng">
            <Icon name="x" size={20} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Current Anchored Artifact */}
          <div className={styles.currentAnchorCard}>
            <div className={styles.currentAnchorInfo}>
              <Icon name="shield" size={24} style={{ color: currentTierInfo.color }} />
              <div className={styles.currentAnchorText}>
                <span className={styles.currentAnchorName} style={{ color: currentTierInfo.color }}>
                  {currentAnchor?.name || 'Chưa rõ vật phẩm'}
                </span>
                <span className={styles.currentAnchorMeta}>
                  {currentTierInfo.name} · {currentAnchor?.type || 'Bảo Vật'} · Trấn giữ {currentAnchor?.palaceName}
                </span>
              </div>
            </div>
            <span
              className="badge"
              style={{
                fontSize: 10,
                padding: '2px 8px',
                color: currentTierInfo.color,
                background: currentTierInfo.bg || 'rgba(255,255,255,0.06)',
                borderColor: currentTierInfo.border || currentTierInfo.color,
              }}
            >
              Đang Trấn Áp
            </span>
          </div>

          {/* Before & After Dao Anh Preview (Giả Anh / Nguyên Anh) */}
          {isDaoAnhStage && currentDa && (
            <div className={styles.previewGrid}>
              {/* Before Column */}
              <div className={styles.previewCol}>
                <span className={styles.previewTag}>Hiện Tại</span>
                <div className={styles.previewAvatarBox}>
                  <DaoAnhAvatarRenderer
                    daoAnh={currentDaDef}
                    currentKiep={currentDa.currentKiep || 0}
                    size={72}
                    imageSize={60}
                    animate={false}
                    showAura={false}
                  />
                </div>
                <span className={styles.previewName} title={currentDa.name}>
                  {currentDa.name}
                </span>
                <div className={styles.previewMetaRow}>
                  <span
                    className="badge"
                    style={{
                      fontSize: 9.5,
                      padding: '1px 6px',
                      color: currentTierInfo.color,
                      background: currentTierInfo.bg || 'rgba(255,255,255,0.06)',
                      borderColor: currentTierInfo.border || currentTierInfo.color,
                    }}
                  >
                    {currentTierInfo.name}
                  </span>
                  <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700 }}>
                    Kiếp {currentDa.currentKiep || 0}/5
                  </span>
                </div>
                <div className={styles.previewSkill} title={currentSkillDesc}>
                  {currentSkillName}
                </div>
              </div>

              {/* Arrow */}
              <div className={styles.previewArrow}>
                <Icon name="arrow-right" size={22} />
              </div>

              {/* After Column */}
              <div className={styles.previewCol}>
                <span className={styles.previewTag}>Sau Khi Đổi</span>
                {previewNewDaoAnh ? (
                  <>
                    <div className={styles.previewAvatarBox}>
                      <DaoAnhAvatarRenderer
                        daoAnh={previewNewDaoAnh.def}
                        currentKiep={currentDa.currentKiep || 0}
                        size={72}
                        imageSize={60}
                        animate={false}
                        showAura={false}
                      />
                    </div>
                    <span className={styles.previewName} title={previewNewDaoAnh.name}>
                      {previewNewDaoAnh.name}
                    </span>
                    <div className={styles.previewMetaRow}>
                      <span
                        className="badge"
                        style={{
                          fontSize: 9.5,
                          padding: '1px 6px',
                          color: previewNewDaoAnh.tierInfo.color,
                          background: previewNewDaoAnh.tierInfo.bg,
                          borderColor: previewNewDaoAnh.tierInfo.border,
                        }}
                      >
                        {previewNewDaoAnh.tierInfo.name}
                        {previewNewDaoAnh.isDefaultFallback ? ' (Mặc định)' : ''}
                      </span>
                      <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 700 }}>
                        Kiếp {currentDa.currentKiep || 0}/5
                      </span>
                    </div>
                    <div className={styles.previewSkill} title={previewNewDaoAnh.skillDesc}>
                      {previewNewDaoAnh.skillName}
                    </div>
                  </>
                ) : (
                  <>
                    <div className={`${styles.previewAvatarBox} ${styles.previewAvatarEmpty}`}>
                      <Icon name="swap" size={24} style={{ opacity: 0.4 }} />
                    </div>
                    <span className={`${styles.previewName} ${styles.previewMuted}`}>
                      Chưa chọn bảo vật
                    </span>
                    <div className={styles.previewMetaRow}>
                      <span style={{ fontSize: 10.5, color: '#64748b', fontStyle: 'italic' }}>
                        Kiếp {currentDa.currentKiep || 0}/5 (Bảo toàn)
                      </span>
                    </div>
                    <div className={`${styles.previewSkill} ${styles.previewSkillEmpty}`}>
                      Chọn vật phẩm bên dưới để xem trước
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {isDaoAnhStage && currentDa && (
            <div className={styles.preserveNote}>
              <Icon name="info" size={14} style={{ color: '#38bdf8', verticalAlign: -2, marginRight: 4 }} />
              Kiếp và Tu Vi của Đạo Anh được giữ nguyên. Phần thưởng Thiên Mệnh của các kiếp sau tính theo phẩm cấp mới.
            </div>
          )}

          {/* Inventory Selection */}
          <div className={styles.inventorySection}>
            <div className={styles.searchAndFilter}>
              <div className={styles.searchBox}>
                <div className={styles.searchIcon}>
                  <Icon name="search" size={14} />
                </div>
                <input
                  type="text"
                  placeholder="Tìm theo tên bảo vật, loại..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={styles.searchInput}
                />
              </div>

              {/* Tier Filter Chips */}
              <div className={styles.tierFilterRow}>
                <button
                  type="button"
                  className={`${styles.tierChip} ${tierFilter === 'all' ? styles.tierChipActive : ''}`}
                  onClick={() => setTierFilter('all')}
                >
                  Tất cả ({groupedInventory.length})
                </button>
                {TIER_ORDER.map((tk) => {
                  const tInfo = getTierInfo(tk);
                  const count = groupedInventory.filter((i) => i.tier === tk).length;
                  if (count === 0) return null;
                  return (
                    <button
                      type="button"
                      key={tk}
                      className={`${styles.tierChip} ${tierFilter === tk ? styles.tierChipActive : ''}`}
                      onClick={() => setTierFilter(tk)}
                      style={{ color: tierFilter === tk ? tInfo?.color : undefined }}
                    >
                      {tInfo?.name || tk} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Artifact Cards Grid */}
            {filteredInventory.length > 0 ? (
              <div className={styles.artifactGrid}>
                {filteredInventory.map((item) => {
                  const tInfo = getTierInfo(item.tier);
                  const isSelected = selectedArtId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`${styles.artifactCard} ${isSelected ? styles.artifactCardSelected : ''}`}
                      onClick={() => {
                        setSelectedArtId(item.id);
                        setErrorMsg('');
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setSelectedArtId(item.id);
                          setErrorMsg('');
                        }
                      }}
                      aria-pressed={isSelected}
                    >
                      <Icon name="shield" size={20} style={{ color: tInfo.color }} />
                      <div className={styles.artifactMeta}>
                        <span className={styles.artCardName} style={{ color: isSelected ? '#fde047' : '#f8fafc' }}>
                          {item.name}
                        </span>
                        <div className={styles.artCardSub}>
                          <span style={{ color: tInfo.color }}>{tInfo.name}</span>
                          <span>·</span>
                          <span>{item.type}</span>
                        </div>
                      </div>
                      {item.count > 1 && (
                        <span className={styles.countBadge}>x{item.count}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <Icon name="package" size={28} />
                <span>
                  {groupedInventory.length === 0
                    ? 'Túi Trữ Vật chưa có vật nào để đổi'
                    : 'Không tìm thấy vật phẩm phù hợp bộ lọc'}
                </span>
                {onNavigateToShop && (
                  <button
                    type="button"
                    className="btn-gold"
                    style={{ fontSize: 11.5, padding: '6px 12px' }}
                    onClick={() => {
                      onClose();
                      onNavigateToShop();
                    }}
                  >
                    Đến tab "Trấn Cung Vật"
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Error Banner */}
          {errorMsg && (
            <div className={styles.errorBanner}>
              <Icon name="alert-circle" size={16} />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={isSubmitting}>
            Hủy
          </button>
          <button
            type="button"
            className={styles.confirmBtn}
            onClick={handleConfirmSwap}
            disabled={!selectedArtId || isSubmitting}
          >
            <Icon name="check" size={16} />
            <span>{isSubmitting ? 'Đang Đổi...' : 'Xác Nhận Đổi'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
