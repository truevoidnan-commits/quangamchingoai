import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import styles from './LinhTangVisualizer.module.css';
import { 
  getProminentDaoAnhs, 
  getLinhTangNameFromDaoAnh 
} from '../../lib/cultivation';
import { 
  THAN_PHAM_AI_ICONS, 
  LAMP_THAN_PHAM_AI_ICONS 
} from '../../lib/artifactIcons';

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V'];
const TIER_COLORS = {
  than_pham: '#ef4444',
  cuc_pham: '#f59e0b',
  thuong_pham: '#a855f7',
  trung_pham: '#3b82f6',
  ha_pham: '#10b981',
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

  if (!isOpen) return null;

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
    if (nameLower.includes('luân hồi')) return LAMP_THAN_PHAM_AI_ICONS['luc_dao_luan_hoi_tien_can'] || '';
    if (nameLower.includes('hỗn độn')) return THAN_PHAM_AI_ICONS['am_duong_hon_don_nguyen_can'] || '';
    if (nameLower.includes('hồng mông')) return LAMP_THAN_PHAM_AI_ICONS['hong_mong_bat_diet'] || '';
    if (nameLower.includes('tạo hóa')) return THAN_PHAM_AI_ICONS['tao_hoa_ngoc_diep'] || '';
    if (nameLower.includes('kiếm')) return THAN_PHAM_AI_ICONS['thao_tu_kiem_quyet'] || '';
    return THAN_PHAM_AI_ICONS['tam_sinh_luan_hoi_an'] || '';
  };

  // Chọn hoặc bỏ chọn một Đạo Anh
  const handleToggleDaoAnh = (da) => {
    const existingIndex = selectedIds.indexOf(da.id);

    // Nếu đã được chọn -> Bỏ chọn khỏi vị trí đó
    if (existingIndex !== -1) {
      // Kiểm tra nếu ở mode reassign và Tòa này đã mở cổng thì không được bỏ
      if (mode === 'reassign' && currentLinhTangs[existingIndex]?.isGateOpen) {
        alert('Tòa này đã mở Tàng Môn, không thể đổi Đạo Anh nguồn!');
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

    // Nếu slot đó đã mở cổng (ở mode reassign), không cho ghi đè
    if (mode === 'reassign' && currentLinhTangs[targetSlot]?.isGateOpen) {
      alert('Tòa này đã mở Tàng Môn, không thể đổi Đạo Anh nguồn!');
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

  // Nút tự động chọn nhanh 5 Đạo Anh mạnh nhất
  const handleAutoSelectTop5 = () => {
    const top5 = getProminentDaoAnhs(daoAnhs, 5);
    const next = [...selectedIds];
    top5.forEach((da, idx) => {
      // Giữ nguyên các Tòa đã mở cổng
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

  // Số lượng đã chọn
  const selectedCount = selectedIds.filter(Boolean).length;
  const isReady = selectedCount === 5;

  const handleConfirm = () => {
    if (!isReady) {
      alert('Vui lòng chọn đủ 5 Đạo Anh cho cả 5 Tòa Bí Tàng!');
      return;
    }
    if (onConfirm) {
      onConfirm(selectedIds);
    }
    if (onClose) onClose();
  };

  if (!isOpen) return null;

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div 
        className={styles.modalCard} 
        style={{ maxWidth: 940, width: '92vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', gap: 14 }}
        onClick={e => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className={styles.modalHeader} style={{ marginBottom: 4 }}>
          <div>
            <h3 className={styles.modalTitle}>
              <span>🏛️</span>
              <span>TUYỂN CHỌN 5 ĐẠO ANH HÓA 5 BÍ TÀNG</span>
            </h3>
            <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
              Đạo hữu tự tay chọn 5 Tôn Đạo Anh tinh hoa nhất làm nguyên liệu chính đúc nên 5 Cự Tọa Tàng Môn.
            </p>
          </div>
          <button className={styles.modalCloseBtn} onClick={onClose}>✕</button>
        </div>

        {/* PHẦN 1: 5 SLOTS CỰ TỌA BÍ TÀNG */}
        <div style={{
          background: 'rgba(5, 12, 22, 0.75)',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: 14,
          padding: '12px 14px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 1 }}>
              5 CỰ TỌA TÀNG MÔN ({selectedCount}/5 ĐÃ CHỌN)
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                onClick={handleAutoSelectTop5}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: 'rgba(56, 189, 248, 0.15)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  color: '#7dd3fc',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ⚡ Gợi Ý Top 5 Mạnh Nhất
              </button>
              <button 
                onClick={handleClearAll}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#fca5a5',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ✕ Xóa Hết
              </button>
            </div>
          </div>

          {/* 5 Cột tương ứng 5 Tòa */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 10
          }}>
            {Array.from({ length: 5 }).map((_, slotIdx) => {
              const daId = selectedIds[slotIdx];
              const da = daoAnhs.find(d => d.id === daId);
              const isActive = activeSlot === slotIdx;
              const isLocked = mode === 'reassign' && currentLinhTangs[slotIdx]?.isGateOpen;
              const originName = da ? getLinhTangNameFromDaoAnh(da, slotIdx) : null;
              const artUrl = getDaoAnhArt(da);

              return (
                <div
                  key={slotIdx}
                  onClick={() => {
                    if (!isLocked) setActiveSlot(slotIdx);
                  }}
                  style={{
                    borderRadius: 10,
                    padding: '8px 6px',
                    background: isActive 
                      ? 'linear-gradient(180deg, rgba(14, 165, 233, 0.25) 0%, rgba(2, 6, 23, 0.9) 100%)' 
                      : da 
                        ? 'rgba(15, 23, 42, 0.8)' 
                        : 'rgba(255, 255, 255, 0.02)',
                    border: isActive 
                      ? '1.5px solid #38bdf8' 
                      : da 
                        ? '1px solid rgba(56, 189, 248, 0.35)' 
                        : '1px dashed rgba(255, 255, 255, 0.2)',
                    boxShadow: isActive ? '0 0 16px rgba(56, 189, 248, 0.35)' : 'none',
                    cursor: isLocked ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    minHeight: 120,
                    position: 'relative',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: isActive ? '#fde047' : '#94a3b8',
                    marginBottom: 4
                  }}>
                    TÒA {ROMAN_NUMERALS[slotIdx]}
                    {isLocked && <span style={{ color: '#4ade80', marginLeft: 3 }}>✓</span>}
                  </div>

                  {da ? (
                    <>
                      <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        overflow: 'hidden',
                        border: '1.5px solid #38bdf8',
                        background: '#020617',
                        margin: '2px 0 6px 0',
                        boxShadow: '0 0 10px rgba(56, 189, 248, 0.3)'
                      }}>
                        {artUrl ? (
                          <img src={artUrl} alt={da.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                            ⚡
                          </div>
                        )}
                      </div>

                      <div style={{
                        fontSize: 11.5,
                        fontWeight: 900,
                        color: '#f8fafc',
                        lineHeight: 1.2,
                        marginBottom: 2
                      }}>
                        {originName} Bí Tàng
                      </div>

                      <div style={{
                        fontSize: 9.5,
                        color: '#38bdf8',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '100%'
                      }}>
                        {da.name.replace(/Đạo Anh/gi, '').trim()}
                      </div>

                      {!isLocked && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const next = [...selectedIds];
                            next[slotIdx] = null;
                            setSelectedIds(next);
                            setActiveSlot(slotIdx);
                          }}
                          style={{
                            marginTop: 'auto',
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: 'rgba(239, 68, 68, 0.2)',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            color: '#fca5a5',
                            fontSize: 9.5,
                            cursor: 'pointer'
                          }}
                          title="Bỏ chọn slot này"
                        >
                          ✕ Gỡ
                        </button>
                      )}
                    </>
                  ) : (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      paddingTop: 14,
                      color: isActive ? '#38bdf8' : '#64748b'
                    }}>
                      <span style={{ fontSize: 20 }}>+</span>
                      <span style={{ fontSize: 10, fontWeight: 700, marginTop: 4 }}>
                        {isActive ? 'Đang chọn' : 'Trống'}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* PHẦN 2: DANH SÁCH ĐẠO ANH THỨC HẢI ĐỂ LỰA CHỌN */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 220, paddingRight: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.8 }}>
            KHO ĐẠO ANH THỨC HẢI ({daoAnhs.length} TÔN) · NHẤP ĐỂ GÁN VÀO CỰ TỌA
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 10
          }}>
            {daoAnhs.map(da => {
              const assignedSlotIndex = selectedIds.indexOf(da.id);
              const isAssigned = assignedSlotIndex !== -1;
              const isLocked = mode === 'reassign' && isAssigned && currentLinhTangs[assignedSlotIndex]?.isGateOpen;
              const artUrl = getDaoAnhArt(da);
              const tierColor = TIER_COLORS[da.tier] || '#38bdf8';

              return (
                <div
                  key={da.id}
                  onClick={() => {
                    if (!isLocked) handleToggleDaoAnh(da);
                  }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: isAssigned 
                      ? 'linear-gradient(135deg, rgba(14, 165, 233, 0.18) 0%, rgba(15, 23, 42, 0.95) 100%)' 
                      : 'rgba(15, 23, 42, 0.75)',
                    border: isAssigned ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: isAssigned ? '0 0 14px rgba(56, 189, 248, 0.25)' : 'none',
                    cursor: isLocked ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    position: 'relative',
                    transition: 'all 0.2s ease',
                    opacity: isLocked ? 0.75 : 1
                  }}
                >
                  {/* Thumbnail */}
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: 10,
                    overflow: 'hidden',
                    border: `1.5px solid ${isAssigned ? '#38bdf8' : tierColor}`,
                    background: '#020617',
                    flexShrink: 0
                  }}>
                    {artUrl ? (
                      <img src={artUrl} alt={da.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                        ⚡
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: isAssigned ? '#fde047' : '#f8fafc',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>
                      {da.name}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <span style={{
                        fontSize: 9.5,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: `${tierColor}20`,
                        border: `1px solid ${tierColor}60`,
                        color: tierColor,
                        fontWeight: 800,
                        textTransform: 'uppercase'
                      }}>
                        {da.tier || 'Thần Phẩm'}
                      </span>
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>
                        Kiếp {da.currentKiep || 5}/5
                      </span>
                    </div>

                    {/* Vị trí gán */}
                    {isAssigned && (
                      <div style={{
                        marginTop: 4,
                        fontSize: 10.5,
                        fontWeight: 800,
                        color: '#38bdf8',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}>
                        <span>🏛️ Đã gán vào TÒA {ROMAN_NUMERALS[assignedSlotIndex]}</span>
                        {isLocked && <span style={{ color: '#4ade80' }}>(Đã mở cổng)</span>}
                      </div>
                    )}
                  </div>

                  {/* Checkmark icon */}
                  {isAssigned && (
                    <div style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: '#38bdf8',
                      color: '#020617',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      fontSize: 12,
                      flexShrink: 0
                    }}>
                      ✓
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          paddingTop: 12
        }}>
          <button 
            className={styles.modalCloseBtn} 
            onClick={onClose}
            style={{ width: 'auto', padding: '8px 16px', borderRadius: 8 }}
          >
            Hủy Bỏ
          </button>

          <button
            onClick={handleConfirm}
            disabled={!isReady}
            style={{
              padding: '12px 24px',
              borderRadius: 10,
              background: isReady 
                ? 'linear-gradient(135deg, #0284c7 0%, #38bdf8 50%, #f59e0b 100%)' 
                : 'rgba(255, 255, 255, 0.08)',
              border: isReady ? '1.5px solid #fde047' : '1px solid rgba(255, 255, 255, 0.15)',
              color: isReady ? '#ffffff' : '#64748b',
              fontSize: 13.5,
              fontWeight: 900,
              cursor: isReady ? 'pointer' : 'not-allowed',
              boxShadow: isReady ? '0 0 25px rgba(56, 189, 248, 0.6), 0 0 10px rgba(253, 224, 71, 0.4)' : 'none',
              letterSpacing: '0.4px',
              transition: 'all 0.25s ease'
            }}
          >
            {mode === 'reassign' 
              ? `🏛️ XÁC NHẬN THIẾT LẬP 5 BÍ TÀNG (${selectedCount}/5)`
              : `⚡ XÁC NHẬN ĐỘT PHÁ LINH TÀNG (${selectedCount}/5)`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
