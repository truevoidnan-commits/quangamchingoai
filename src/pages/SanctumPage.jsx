import React, { useState } from 'react';
import { useCultivationContext } from '../context/CultivationContext';
import { LIFE_LAMPS, SUPPRESSING_ARTIFACTS, getPalaceNameFromArtifact, getCombatPowerDisplay } from '../lib/cultivation';
import { getLampImageUrl, getArtifactImageUrl } from '../lib/artifactIcons';
import { useNavigate } from 'react-router-dom';
import DaoAnhGalleryModal from '../components/cultivation/DaoAnhGalleryModal';
import styles from './SanctumPage.module.css';

function SvgLotusLamp({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ filter: 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.7))', flexShrink: 0 }}>
      <circle cx="24" cy="5" r="3" stroke="#ef4444" strokeWidth="1.5" fill="none" />
      <path d="M24 8 V11" stroke="#ef4444" strokeWidth="2" />
      <path d="M12 14 C16 11 32 11 36 14 L33 17 H15 Z" fill="#ef4444" opacity="0.9" />
      <path d="M16 17 C13 24 13 30 16 34 H32 C35 30 35 24 32 17 Z" fill="url(#lampGlowGradRed)" stroke="#dc2626" strokeWidth="1.5" />
      <path d="M24 20 C22 23 21 26 24 29 C27 26 26 23 24 20 Z" fill="#ffffff" filter="drop-shadow(0 0 4px #ff3fd5)" />
      <path d="M14 34 C12 37 14 41 24 42 C34 41 36 37 34 34 Z" fill="#b91c1c" />
      <path d="M18 35 C20 39 28 39 30 35" stroke="#ef4444" strokeWidth="1.5" fill="none" />
      <path d="M24 42 V47 M22 47 H26" stroke="#ef4444" strokeWidth="1.5" />
      <defs>
        <radialGradient id="lampGlowGradRed" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fecaca" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#ef4444" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#7f1d1d" stopOpacity="0.2" />
        </radialGradient>
      </defs>
    </svg>
  );
}

export default function SanctumPage() {
  const { 
    cultivation, 
    absorbLamp, 
    sellLamp,
    buyLamp,
    anchorPalace, 
    sellArtifact,
    sellMultipleItems,
    buyArtifact,
  } = useCultivationContext();

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('lamps'); // 'lamps' | 'artifacts'
  const [lampFilter, setLampFilter] = useState('all'); // 'all' | 'equipped' | 'bag' | 'unowned'
  const [artifactFilter, setArtifactFilter] = useState('all'); // 'all' | 'equipped' | 'bag' | 'unowned'
  const [hoveredCardId, setHoveredCardId] = useState(null);
  const [isDaoAnhModalOpen, setIsDaoAnhModalOpen] = useState(false);

  const isNguyenAnhStage = cultivation?.realm === 'gia_anh' || cultivation?.realm === 'nguyen_anh';
  const exp = cultivation?.totalExp || cultivation?.expCurrentRealm || 0;
  const storedExp = cultivation?.storedExp || 0;
  const totalThienMenh = cultivation?.totalThienMenh || 0;
  const absorbedLamps = cultivation?.absorbedLamps || [];
  const inventoryLamps = cultivation?.inventoryLamps || [];
  const palaceAnchors = cultivation?.palaceAnchors || {};
  const inventoryArtifacts = cultivation?.inventoryArtifacts || [];
  const anchoredIds = Object.values(palaceAnchors).map(a => a?.id || a).filter(Boolean);
  const unanchoredArtifacts = inventoryArtifacts.filter(id => !anchoredIds.includes(id));
  const pityReadingCycles = cultivation?.pityReadingCycles || 0;

  // Lọc Mệnh Đăng theo danh mục thiết thực
  const displayedLamps = LIFE_LAMPS.filter(l => {
    const isEquipped = absorbedLamps.includes(l.id);
    const isInBag = inventoryLamps.includes(l.id);
    if (lampFilter === 'equipped') return isEquipped;
    if (lampFilter === 'bag') return isInBag;
    if (lampFilter === 'unowned') return !isEquipped && !isInBag;
    return true;
  });

  // Lọc Bảo Vật theo danh mục thiết thực
  const displayedArtifacts = SUPPRESSING_ARTIFACTS.filter(a => {
    const isEquipped = anchoredIds.includes(a.id);
    const isInBag = unanchoredArtifacts.includes(a.id);
    if (artifactFilter === 'equipped') return isEquipped;
    if (artifactFilter === 'bag') return isInBag;
    if (artifactFilter === 'unowned') return !isEquipped && !isInBag;
    return true;
  });

  const calculatedCombatPower = getCombatPowerDisplay(cultivation);

  // Xử lý Luyện Hóa lẻ Mệnh Đăng
  const handleRefineSingleLamp = (lamp) => {
    const rewardDesc = isNguyenAnhStage ? '+50 Thiên Mệnh' : '+3.000 Tu Vi';
    if (!window.confirm(`⚠️ XÁC NHẬN LUYỆN HÓA THẦN ĐĂNG:\n\n• Thần Đăng: [Thần Phẩm] ${lamp.name}\n• Nhận lại: ${rewardDesc}\n\nĐạo hữu có chắc chắn muốn phân giải luyện hóa Thần Đăng này không?`)) {
      return;
    }
    try {
      sellLamp(lamp.id);
    } catch (e) {
      alert(e.message || 'Không thể luyện hóa.');
    }
  };

  // Xử lý Luyện Hóa lẻ Bảo Vật
  const handleRefineSingleArtifact = (art) => {
    const rewardDesc = isNguyenAnhStage ? '+50 Thiên Mệnh' : '+3.000 Tu Vi';
    if (!window.confirm(`⚠️ XÁC NHẬN LUYỆN HÓA THẦN VẬT:\n\n• Thần Vật: [Thần Phẩm] ${art.name}\n• Nhận lại: ${rewardDesc}\n\nĐạo hữu có chắc chắn muốn phân giải luyện hóa Thần Vật này không?`)) {
      return;
    }
    try {
      sellArtifact(art.id);
    } catch (e) {
      alert(e.message || 'Không thể luyện hóa.');
    }
  };

  // Xử lý Luyện Hóa Nhanh toàn bộ đồ thừa trong túi
  const handleQuickRefineAllBag = () => {
    const totalCount = inventoryLamps.length + unanchoredArtifacts.length;
    if (totalCount === 0) {
      alert('Túi trữ vật không có Thần Vật dư thừa để luyện hóa.');
      return;
    }
    const gainDesc = isNguyenAnhStage ? `+${totalCount * 50} Lực Thiên Mệnh` : `+${(totalCount * 3000).toLocaleString()} Tu Vi`;
    if (!window.confirm(`⚡ LUYỆN HÓA TOÀN BỘ ĐỒ THỪA TRONG TÚI:\n\n• Số lượng: ${inventoryLamps.length} Thần Đăng + ${unanchoredArtifacts.length} Thần Vật\n• Hoàn trả: ${gainDesc}\n\nĐạo hữu có muốn luyện hóa ngay toàn bộ?`)) {
      return;
    }
    try {
      sellMultipleItems({ lampIds: inventoryLamps, artifactIds: unanchoredArtifacts });
    } catch (e) {
      alert(e.message || 'Luyện hóa thất bại.');
    }
  };

  // Xử lý Đổi Mệnh Đăng bằng cách Đốt Tu Vi / Thiên Mệnh
  const handleBuyLampWithExp = (lamp) => {
    const costDesc = isNguyenAnhStage ? '200 Lực Thiên Mệnh' : '10.000 Tu Vi (kèm nguy cơ ngã cảnh/tụt tầng)';
    if (!window.confirm(`🔥 NGHỊCH MỆNH HOÁN ĐĂNG (ĐỐT TU VI):\n\n• Thần Đăng: [Thần Phẩm] ${lamp.name}\n• Tiêu hao: Đốt ${costDesc}\n\n⚠️ Đốt tu vi có thể khiến đạo hữu bị ngã cảnh hoặc thoái hóa Thiên Cung/Pháp Khiếu! Có muốn tiếp tục?`)) {
      return;
    }
    try {
      buyLamp(lamp.id);
    } catch (e) {
      alert(e.message || 'Không thể đổi Mệnh Đăng.');
    }
  };

  // Xử lý Đổi Bảo Vật bằng cách Đốt Tu Vi / Thiên Mệnh
  const handleBuyArtifactWithExp = (art) => {
    const costDesc = isNguyenAnhStage ? '200 Lực Thiên Mệnh' : '10.000 Tu Vi (kèm nguy cơ ngã cảnh/tụt tầng)';
    if (!window.confirm(`🔥 NGHỊCH THIÊN HOÁN BẢO (ĐỐT TU VI):\n\n• Thần Vật: [Thần Phẩm] ${art.name}\n• Tiêu hao: Đốt ${costDesc}\n\n⚠️ Đốt tu vi có thể khiến đạo hữu bị ngã cảnh hoặc thoái hóa Thiên Cung/Pháp Khiếu! Có muốn tiếp tục?`)) {
      return;
    }
    try {
      buyArtifact(art.id);
    } catch (e) {
      alert(e.message || 'Không thể đổi Thần Vật.');
    }
  };

  const totalBagItemsCount = inventoryLamps.length + unanchoredArtifacts.length;

  return (
    <div className={styles.sanctumContainer}>
      {/* TOP BANNER & NAVIGATION */}
      <div className={styles.topBanner}>
        <div className={styles.bannerLeft}>
          <button onClick={() => navigate(-1)} className={styles.backBtn}>
            ← Quay lại
          </button>
          <div>
            <h1 className={styles.pageTitle}>
              🏛️ TÀNG BẢO ĐIỆN · BẢO KHỐ THẦN VẬT
            </h1>
            <p className={styles.pageSubtitle}>
              18 Thần Phẩm Mệnh Đăng & 24 Thần Phẩm Trấn Cung Bảo Vật độc bản thượng cổ
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={() => setIsDaoAnhModalOpen(true)}
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              fontSize: 12.5,
              fontWeight: 800,
              cursor: 'pointer',
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(180, 83, 9, 0.15) 100%)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              color: '#fde047',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.2s ease',
              boxShadow: '0 0 12px rgba(245, 158, 11, 0.2)',
            }}
          >
            📜 Đạo Anh Đồ Lục
          </button>

          {totalBagItemsCount > 0 && (
            <button
              onClick={handleQuickRefineAllBag}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                fontSize: 12.5,
                fontWeight: 800,
                cursor: 'pointer',
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                border: 'none',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 0 16px rgba(239, 68, 68, 0.4)',
              }}
              title="Luyện hóa toàn bộ Thần Vật đang nằm trong túi trữ vật"
            >
              ⚡ Luyện Hóa Nhanh ({totalBagItemsCount})
            </button>
          )}
        </div>
      </div>

      {/* STATS OVERVIEW CARDS (3 Ô TINH GỌN, THIẾT THỰC) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 14,
        marginBottom: 24,
      }}>
        {/* Ô 1: Tu Vi / Thiên Mệnh & Uẩn Tích Bình Cảnh */}
        <div className={styles.statCard} style={{ borderColor: 'rgba(56, 189, 248, 0.35)' }}>
          <div className={styles.statCardLabel} style={{ color: '#94a3b8' }}>
            {isNguyenAnhStage ? 'LỰC THIÊN MỆNH HIỆN CÓ' : 'TU VI HIỆN CÓ'}
          </div>
          <div className={styles.statCardValue} style={{ color: '#38bdf8' }}>
            {isNguyenAnhStage ? `${totalThienMenh.toLocaleString()} TM` : `${exp.toLocaleString()} Tu Vi`}
          </div>
          {storedExp > 0 ? (
            <div style={{ fontSize: 11.5, color: '#f59e0b', marginTop: 4, fontWeight: 700 }}>
              🌊 Uẩn tích bình cảnh: +{storedExp.toLocaleString()} (Tự xả khi phá cảnh)
            </div>
          ) : (
            <div className={styles.statCardSub}>
              Đọc sách để tích lũy chân nguyên
            </div>
          )}
        </div>

        {/* Ô 2: Bảo Hiểm Pity Rơi Thần Vật */}
        <div className={styles.statCard} style={{ borderColor: 'rgba(239, 68, 68, 0.35)' }}>
          <div className={styles.statCardLabel} style={{ color: '#fca5a5' }}>
            CƠ CHẾ BẢO HIỂM (PITY)
          </div>
          <div className={styles.statCardValue} style={{ color: '#ef4444' }}>
            {pityReadingCycles} / 45 chu kỳ
          </div>
          <div className={styles.statCardSub}>
            {pityReadingCycles >= 45 ? '✨ Chu kỳ tiếp theo 100% ra Thần Vật!' : `Còn ${45 - pityReadingCycles} chu kỳ đọc nữa`}
          </div>
        </div>

        {/* Ô 3: Tổng Chiến Lực Toàn Thân */}
        <div className={styles.statCard} style={{ borderColor: 'rgba(251, 191, 36, 0.35)' }}>
          <div className={styles.statCardLabel} style={{ color: '#fde68a' }}>
            TỔNG CHIẾN LỰC TOÀN THÂN
          </div>
          <div className={styles.statCardValue} style={{ color: '#fbbf24' }}>
            {calculatedCombatPower}
          </div>
          <div className={styles.statCardSub}>
            Gia trì từ Cảnh Giới, Mệnh Đăng & Cung Thật
          </div>
        </div>
      </div>

      {/* NAVIGATION TABS (2 TAB CHÍNH TỐI THƯỢNG) */}
      <div className={styles.navTabs}>
        <button
          onClick={() => setActiveTab('lamps')}
          className={styles.tabBtn}
          style={{
            background: activeTab === 'lamps' 
              ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(185, 28, 28, 0.15) 100%)' 
              : 'rgba(255, 255, 255, 0.04)',
            border: activeTab === 'lamps' ? '1.5px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
            color: activeTab === 'lamps' ? '#f87171' : '#94a3b8',
            boxShadow: activeTab === 'lamps' ? '0 0 16px rgba(239, 68, 68, 0.3)' : 'none',
          }}
        >
          <SvgLotusLamp size={18} />
          <span>MỆNH ĐĂNG THẦN PHẨM (18)</span>
          <span className={styles.tabCountBadge}>
            {absorbedLamps.length}/18 Đã khảm
          </span>
        </button>

        <button
          onClick={() => setActiveTab('artifacts')}
          className={styles.tabBtn}
          style={{
            background: activeTab === 'artifacts' 
              ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.25) 0%, rgba(3, 105, 161, 0.15) 100%)' 
              : 'rgba(255, 255, 255, 0.04)',
            border: activeTab === 'artifacts' ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
            color: activeTab === 'artifacts' ? '#38bdf8' : '#94a3b8',
            boxShadow: activeTab === 'artifacts' ? '0 0 16px rgba(56, 189, 248, 0.3)' : 'none',
          }}
        >
          <span>🛡️ VẬT TRẤN ÁP THẦN PHẨM (24)</span>
          <span className={styles.tabCountBadge}>
            {anchoredIds.length}/24 Đã khảm
          </span>
        </button>
      </div>

      {/* TAB 1: MỆNH ĐĂNG THẦN PHẨM */}
      {activeTab === 'lamps' && (
        <div>
          {/* Sub-filters thiết thực */}
          <div className={styles.subFilterRow}>
            <button
              onClick={() => setLampFilter('all')}
              className={styles.subFilterBtn}
              style={{
                background: lampFilter === 'all' ? '#ef4444' : 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(239,68,68,0.4)',
                color: '#fff',
              }}
            >
              Tất Cả (18)
            </button>
            <button
              onClick={() => setLampFilter('equipped')}
              className={styles.subFilterBtn}
              style={{
                background: lampFilter === 'equipped' ? '#ef4444' : 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(239,68,68,0.4)',
                color: '#fff',
              }}
            >
              Đã Khảm Nạm ({absorbedLamps.length})
            </button>
            <button
              onClick={() => setLampFilter('bag')}
              className={styles.subFilterBtn}
              style={{
                background: lampFilter === 'bag' ? '#f59e0b' : 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(245,158,11,0.4)',
                color: lampFilter === 'bag' ? '#000' : '#fff',
              }}
            >
              Trong Túi ({inventoryLamps.length})
            </button>
            <button
              onClick={() => setLampFilter('unowned')}
              className={styles.subFilterBtn}
              style={{
                background: lampFilter === 'unowned' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#cbd5e1',
              }}
            >
              Chưa Sở Hữu ({18 - absorbedLamps.length - inventoryLamps.length})
            </button>
          </div>

          <div className={styles.cardsGrid}>
            {displayedLamps.map(lamp => {
              const isAbsorbed = absorbedLamps.includes(lamp.id);
              const isInBag = inventoryLamps.includes(lamp.id);
              const isHovered = hoveredCardId === lamp.id;
              const imgUrl = getLampImageUrl(lamp.id);

              return (
                <div
                  key={lamp.id}
                  onMouseEnter={() => setHoveredCardId(lamp.id)}
                  onMouseLeave={() => setHoveredCardId(null)}
                  className={styles.itemCard}
                  style={{
                    border: `1.5px solid ${isAbsorbed ? '#ef4444' : isInBag ? '#f59e0b' : 'rgba(239, 68, 68, 0.35)'}`,
                    boxShadow: isAbsorbed 
                      ? '0 12px 32px rgba(239, 68, 68, 0.35), 0 0 20px rgba(239, 68, 68, 0.2)' 
                      : isHovered 
                        ? '0 16px 36px rgba(0, 0, 0, 0.75), 0 0 24px rgba(239, 68, 68, 0.3)' 
                        : '0 6px 20px rgba(0, 0, 0, 0.45)',
                    transform: isHovered ? 'translateY(-6px) scale(1.015)' : 'none',
                  }}
                >
                  {/* Background Glow */}
                  <div 
                    className={styles.cardGlowBg}
                    style={{
                      background: 'radial-gradient(circle at 50% 35%, rgba(239, 68, 68, 0.2) 0%, transparent 72%)',
                    }} 
                  />

                  {/* Header Badges */}
                  <div className={styles.cardHeaderBadges}>
                    <span 
                      className={styles.tierBadge}
                      style={{
                        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.35) 0%, rgba(185, 28, 28, 0.2) 100%)',
                        border: '1px solid rgba(239, 68, 68, 0.7)',
                        color: '#fca5a5',
                        boxShadow: '0 0 8px rgba(239, 68, 68, 0.3)',
                      }}
                    >
                      ✦ THẦN PHẨM ✦
                    </span>

                    {isAbsorbed && (
                      <span 
                        className={styles.statusBadge}
                        style={{
                          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                          color: '#fff',
                          boxShadow: '0 0 10px rgba(239, 68, 68, 0.5)',
                        }}
                      >
                        🔥 ĐÃ HẤP THỤ
                      </span>
                    )}

                    {isInBag && (
                      <span 
                        className={styles.statusBadge}
                        style={{
                          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                          color: '#000',
                        }}
                      >
                        📦 TRONG TÚI
                      </span>
                    )}

                    {!isAbsorbed && !isInBag && (
                      <span 
                        className={styles.statusBadge}
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: '#94a3b8',
                        }}
                      >
                        Chưa Sở Hữu
                      </span>
                    )}
                  </div>

                  {/* SQUARE AI ARTWORK STAGE (1:1 ASPECT RATIO - HIỂN THỊ TOÀN VẸN 100%) */}
                  <div 
                    className={styles.stageWrap}
                    style={{
                      border: '1px solid rgba(239, 68, 68, 0.4)',
                      boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8), 0 0 16px rgba(239, 68, 68, 0.25)',
                    }}
                  >
                    <img
                      src={imgUrl}
                      alt={lamp.name}
                      decoding="async"
                      className={styles.stageImage}
                      style={{
                        transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                      }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.parentNode.innerHTML = `<div style="font-size: 54px;">${lamp.icon || '🏮'}</div>`;
                      }}
                    />
                    <div className={styles.stageOverlayGradient} />
                  </div>

                  {/* Details */}
                  <div className={styles.cardContent}>
                    <div>
                      <h3 
                        className={styles.cardTitle}
                        style={{
                          color: '#fecaca',
                          textShadow: '0 0 10px rgba(239, 68, 68, 0.4)',
                        }}
                      >
                        {lamp.name}
                      </h3>
                      <div className={styles.cardTypeTag} style={{ color: '#f87171' }}>
                        ✦ MỆNH ĐĂNG BẢN NGUYÊN ✦
                      </div>

                      <p className={styles.cardDesc}>
                        {lamp.desc}
                      </p>

                      {lamp.poem && (
                        <div className={styles.cardPoem} style={{ color: '#fbbf24' }}>
                          "{lamp.poem}"
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className={styles.cardFooter}>
                      {isAbsorbed ? (
                        <div className={styles.equippedStatus}>
                          ✓ Đã khảm nạm
                        </div>
                      ) : isInBag ? (
                        <>
                          <button
                            onClick={() => {
                              try { absorbLamp(lamp.id); } catch (e) { alert(e.message); }
                            }}
                            className={styles.actionBtnPrimary}
                            style={{
                              flex: 1.2,
                              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                              color: '#fff',
                              boxShadow: '0 0 12px rgba(239,68,68,0.4)',
                            }}
                          >
                            Hấp Thụ
                          </button>
                          <button
                            onClick={() => handleRefineSingleLamp(lamp)}
                            className={styles.actionBtnSecondary}
                            style={{ flex: 1 }}
                            title="Luyện hóa nhận +3.000 Tu Vi"
                          >
                            Luyện Hóa
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleBuyLampWithExp(lamp)}
                          className={styles.burnExpBtn}
                          style={{
                            background: 'linear-gradient(135deg, rgba(239,68,68,0.35) 0%, rgba(185,28,28,0.2) 100%)',
                            border: '1px solid #ef4444',
                            color: '#fecaca',
                            boxShadow: '0 0 10px rgba(239,68,68,0.2)',
                          }}
                        >
                          🔥 Đổi Đèn (Đốt {isNguyenAnhStage ? '200 TM' : '10k Tu Vi'})
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: VẬT TRẤN ÁP THẦN PHẨM */}
      {activeTab === 'artifacts' && (
        <div>
          {/* Sub-filters thiết thực */}
          <div className={styles.subFilterRow}>
            <button
              onClick={() => setArtifactFilter('all')}
              className={styles.subFilterBtn}
              style={{
                background: artifactFilter === 'all' ? '#38bdf8' : 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(56,189,248,0.4)',
                color: '#fff',
              }}
            >
              Tất Cả (24)
            </button>
            <button
              onClick={() => setArtifactFilter('equipped')}
              className={styles.subFilterBtn}
              style={{
                background: artifactFilter === 'equipped' ? '#38bdf8' : 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(56,189,248,0.4)',
                color: '#fff',
              }}
            >
              Đã Khảm Nạm ({anchoredIds.length})
            </button>
            <button
              onClick={() => setArtifactFilter('bag')}
              className={styles.subFilterBtn}
              style={{
                background: artifactFilter === 'bag' ? '#f59e0b' : 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(245,158,11,0.4)',
                color: artifactFilter === 'bag' ? '#000' : '#fff',
              }}
            >
              Trong Túi ({unanchoredArtifacts.length})
            </button>
            <button
              onClick={() => setArtifactFilter('unowned')}
              className={styles.subFilterBtn}
              style={{
                background: artifactFilter === 'unowned' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#cbd5e1',
              }}
            >
              Chưa Sở Hữu ({24 - anchoredIds.length - unanchoredArtifacts.length})
            </button>
          </div>

          <div className={styles.cardsGrid}>
            {displayedArtifacts.map(art => {
              const isAnchored = anchoredIds.includes(art.id);
              const isInBag = unanchoredArtifacts.includes(art.id);
              const palaceName = getPalaceNameFromArtifact(art);
              const isHovered = hoveredCardId === art.id;
              const imgUrl = getArtifactImageUrl(art.id);

              return (
                <div
                  key={art.id}
                  onMouseEnter={() => setHoveredCardId(art.id)}
                  onMouseLeave={() => setHoveredCardId(null)}
                  className={styles.itemCard}
                  style={{
                    border: `1.5px solid ${isAnchored ? '#38bdf8' : isInBag ? '#f59e0b' : 'rgba(56, 189, 248, 0.35)'}`,
                    boxShadow: isAnchored 
                      ? '0 12px 32px rgba(56, 189, 248, 0.35), 0 0 20px rgba(56, 189, 248, 0.2)' 
                      : isHovered 
                        ? '0 16px 36px rgba(0, 0, 0, 0.75), 0 0 24px rgba(56, 189, 248, 0.3)' 
                        : '0 6px 20px rgba(0, 0, 0, 0.45)',
                    transform: isHovered ? 'translateY(-6px) scale(1.015)' : 'none',
                  }}
                >
                  {/* Background Glow */}
                  <div 
                    className={styles.cardGlowBg}
                    style={{
                      background: 'radial-gradient(circle at 50% 35%, rgba(56, 189, 248, 0.2) 0%, transparent 72%)',
                    }} 
                  />

                  {/* Header Badges */}
                  <div className={styles.cardHeaderBadges}>
                    <span 
                      className={styles.tierBadge}
                      style={{
                        background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.35) 0%, rgba(3, 105, 161, 0.2) 100%)',
                        border: '1px solid rgba(56, 189, 248, 0.7)',
                        color: '#7dd3fc',
                        boxShadow: '0 0 8px rgba(56, 189, 248, 0.3)',
                      }}
                    >
                      ✦ {art.type || 'THẦN VẬT'} ✦
                    </span>

                    {isAnchored && (
                      <span 
                        className={styles.statusBadge}
                        style={{
                          background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
                          color: '#000',
                          boxShadow: '0 0 10px rgba(56, 189, 248, 0.5)',
                        }}
                      >
                        🏛️ ĐÃ TRẤN CUNG
                      </span>
                    )}

                    {isInBag && (
                      <span 
                        className={styles.statusBadge}
                        style={{
                          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                          color: '#000',
                        }}
                      >
                        📦 TRONG TÚI
                      </span>
                    )}

                    {!isAnchored && !isInBag && (
                      <span 
                        className={styles.statusBadge}
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: '#94a3b8',
                        }}
                      >
                        Chưa Sở Hữu
                      </span>
                    )}
                  </div>

                  {/* SQUARE AI ARTWORK STAGE (1:1 ASPECT RATIO - HIỂN THỊ TOÀN VẸN 100%) */}
                  <div 
                    className={styles.stageWrap}
                    style={{
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8), 0 0 16px rgba(56, 189, 248, 0.25)',
                    }}
                  >
                    <img
                      src={imgUrl}
                      alt={art.name}
                      decoding="async"
                      className={styles.stageImage}
                      style={{
                        transform: isHovered ? 'scale(1.05)' : 'scale(1)',
                      }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.parentNode.innerHTML = `<div style="font-size: 54px;">${art.icon || '🏛️'}</div>`;
                      }}
                    />
                    <div className={styles.stageOverlayGradient} />
                  </div>

                  {/* Details */}
                  <div className={styles.cardContent}>
                    <div>
                      <h3 
                        className={styles.cardTitle}
                        style={{
                          color: '#e0f2fe',
                          textShadow: '0 0 10px rgba(56, 189, 248, 0.4)',
                        }}
                      >
                        {art.name}
                      </h3>
                      <div className={styles.cardTypeTag} style={{ color: '#38bdf8' }}>
                        🏛️ Khởi sinh: [{palaceName}]
                      </div>

                      <p className={styles.cardDesc}>
                        {art.desc}
                      </p>

                      {art.poem && (
                        <div className={styles.cardPoem} style={{ color: '#fde047' }}>
                          "{art.poem}"
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className={styles.cardFooter}>
                      {isAnchored ? (
                        <div className={styles.equippedStatus}>
                          ✓ Đã khảm nạm
                        </div>
                      ) : isInBag ? (
                        <>
                          <button
                            onClick={() => {
                              if (cultivation?.realm !== 'kim_dan') {
                                alert('Chỉ tu sĩ Kim Đan Kỳ mới có thể khảm nạm Trấn Áp Thiên Cung!');
                                return;
                              }
                              try {
                                anchorPalace(cultivation.realizedThienCung || 0, art.id);
                              } catch (e) {
                                alert(e.message);
                              }
                            }}
                            className={styles.actionBtnPrimary}
                            style={{
                              flex: 1.2,
                              background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
                              color: '#000',
                              boxShadow: '0 0 12px rgba(56,189,248,0.4)',
                            }}
                          >
                            Khảm Nạm
                          </button>
                          <button
                            onClick={() => handleRefineSingleArtifact(art)}
                            className={styles.actionBtnSecondary}
                            style={{ flex: 1 }}
                            title="Luyện hóa nhận +3.000 Tu Vi"
                          >
                            Luyện Hóa
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleBuyArtifactWithExp(art)}
                          className={styles.burnExpBtn}
                          style={{
                            background: 'linear-gradient(135deg, rgba(56,189,248,0.35) 0%, rgba(3,105,161,0.2) 100%)',
                            border: '1px solid #38bdf8',
                            color: '#e0f2fe',
                            boxShadow: '0 0 10px rgba(56,189,248,0.2)',
                          }}
                        >
                          🔥 Đổi Bảo Vật (Đốt {isNguyenAnhStage ? '200 TM' : '10k Tu Vi'})
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL TRA CỨU ĐẠO ANH ĐỒ LỤC */}
      <DaoAnhGalleryModal
        isOpen={isDaoAnhModalOpen}
        onClose={() => setIsDaoAnhModalOpen(false)}
      />
    </div>
  );
}
