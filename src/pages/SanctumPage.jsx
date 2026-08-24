import React, { useState } from 'react';
import { useCultivationContext } from '../context/CultivationContext';
import { LIFE_LAMPS, SUPPRESSING_ARTIFACTS, LAMP_TIERS, getLampPalaceName, getCombatPowerDisplay } from '../lib/cultivation';
import ArtifactIcon from '../components/cultivation/ArtifactIcon';
import { useNavigate } from 'react-router-dom';

function SvgLotusLamp({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ filter: 'drop-shadow(0 0 8px rgba(251, 191, 36, 0.7))' }}>
      {/* Top hook & ring */}
      <circle cx="24" cy="5" r="3" stroke="#fbbf24" strokeWidth="1.5" fill="none" />
      <path d="M24 8 V11" stroke="#fbbf24" strokeWidth="2" />
      {/* Top Canopy Roof */}
      <path d="M12 14 C16 11 32 11 36 14 L33 17 H15 Z" fill="#fbbf24" opacity="0.9" />
      {/* Lantern Body Cage & Flame Glow */}
      <path d="M16 17 C13 24 13 30 16 34 H32 C35 30 35 24 32 17 Z" fill="url(#lampGlowGrad)" stroke="#f59e0b" strokeWidth="1.5" />
      {/* Inner Eternal Flame */}
      <path d="M24 20 C22 23 21 26 24 29 C27 26 26 23 24 20 Z" fill="#ffffff" filter="drop-shadow(0 0 4px #ff3fd5)" />
      {/* Bottom Lotus Base Petals */}
      <path d="M14 34 C12 37 14 41 24 42 C34 41 36 37 34 34 Z" fill="#d97706" />
      <path d="M18 35 C20 39 28 39 30 35" stroke="#fbbf24" strokeWidth="1.5" fill="none" />
      {/* Tassels */}
      <path d="M24 42 V47 M22 47 H26" stroke="#fbbf24" strokeWidth="1.5" />
      <defs>
        <radialGradient id="lampGlowGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fef08a" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#b45309" stopOpacity="0.2" />
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
    gainReadingExp 
  } = useCultivationContext();

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('lamps'); // 'lamps' | 'artifacts' | 'inventory'
  const [inventorySubTab, setInventorySubTab] = useState('lamps'); // 'lamps' | 'artifacts'
  const [lampFilterTier, setLampFilterTier] = useState('owned'); // 'owned' | 'ha_pham' | ...
  const [artifactFilterTier, setArtifactFilterTier] = useState('owned'); // 'owned' | 'ha_pham' | ...
  const [selectedLamps, setSelectedLamps] = useState([]);
  const [selectedArtifacts, setSelectedArtifacts] = useState([]);

  const currentRealm = cultivation?.realm || 'truc_co';
  const exp = cultivation?.totalExp || cultivation?.expCurrentRealm || 0;
  const is121Unlocked = cultivation?.has121st || false;
  const maxLamps = is121Unlocked ? 5 : 4;
  const absorbedLamps = cultivation?.absorbedLamps || [];
  const inventoryLamps = cultivation?.inventoryLamps || [];
  const palaceAnchors = cultivation?.palaceAnchors || {};
  const inventoryArtifacts = cultivation?.inventoryArtifacts || [];
  const anchoredIds = Object.values(palaceAnchors).map(a => a?.id || a).filter(Boolean);
  const unanchoredArtifacts = inventoryArtifacts.filter(id => !anchoredIds.includes(id));

  const TIER_ORDER = ['owned', 'ha_pham', 'trung_pham', 'thuong_pham', 'cuc_pham', 'tien_pham', 'than_pham'];

  // Helper kiểm tra vật phẩm quý hiếm cần hỏi lại xác nhận
  const shouldConfirm = (tier) => tier === 'tien_pham' || tier === 'than_pham';

  // Danh sách Mệnh Đăng sở hữu vs Danh sách hiển thị theo bộ lọc
  const ownedLampIds = Array.from(new Set([...absorbedLamps, ...inventoryLamps]));
  const ownedLampsList = LIFE_LAMPS.filter(l => ownedLampIds.includes(l.id));
  const displayedLamps = lampFilterTier === 'owned'
    ? ownedLampsList
    : LIFE_LAMPS.filter(l => l.tier === lampFilterTier);

  // Danh sách Bảo Vật sở hữu vs Danh sách hiển thị theo bộ lọc
  const ownedArtifactIds = Array.from(new Set([...anchoredIds, ...inventoryArtifacts]));
  const ownedArtifactsList = SUPPRESSING_ARTIFACTS.filter(a => ownedArtifactIds.includes(a.id));
  const displayedArtifacts = artifactFilterTier === 'owned'
    ? ownedArtifactsList
    : SUPPRESSING_ARTIFACTS.filter(a => a.tier === artifactFilterTier);

  // Chiến lực thực tế đồng bộ 100% với hệ thống
  const calculatedCombatPower = getCombatPowerDisplay(cultivation);

  // Xử lý bán lẻ Mệnh Đăng (Hạ-Cực bán ngay, Tiên-Thần hỏi lại)
  const handleSellSingleLamp = (lamp) => {
    const tierInfo = LAMP_TIERS[lamp.tier] || LAMP_TIERS.ha_pham;
    const priceTT = tierInfo.tienTinh || Math.floor(tierInfo.priceExp / 5);
    if (shouldConfirm(lamp.tier)) {
      if (!window.confirm(`⚠️ CẢNH BÁO MỆNH ĐĂNG CAO CẤP!\n\nĐạo hữu có CHẮC CHẮN muốn bán [${tierInfo.name}] ${lamp.name} để nhận +${priceTT.toLocaleString()} Tiên Tinh không?`)) {
        return;
      }
    }
    try {
      sellLamp(lamp.id);
      setSelectedLamps(prev => prev.filter(id => id !== lamp.id));
    } catch (e) {
      alert(e.message || 'Không thể bán.');
    }
  };

  // Xử lý bán lẻ Bảo Vật (Hạ-Cực bán ngay, Tiên-Thần hỏi lại)
  const handleSellSingleArtifact = (art) => {
    const tierInfo = LAMP_TIERS[art.tier] || LAMP_TIERS.ha_pham;
    const priceTT = tierInfo.tienTinh || Math.floor(tierInfo.priceExp / 5);
    if (shouldConfirm(art.tier)) {
      if (!window.confirm(`⚠️ CẢNH BÁO BẢO VẬT CAO CẤP!\n\nĐạo hữu có CHẮC CHẮN muốn bán [${tierInfo.name}] ${art.name} để nhận +${priceTT.toLocaleString()} Tiên Tinh không?`)) {
        return;
      }
    }
    try {
      sellArtifact(art.id);
      setSelectedArtifacts(prev => prev.filter(id => id !== art.id));
    } catch (e) {
      alert(e.message || 'Không thể bán.');
    }
  };

  // Toggle chọn đèn / bảo vật
  const toggleSelectLamp = (lampId) => {
    setSelectedLamps(prev => 
      prev.includes(lampId) ? prev.filter(id => id !== lampId) : [...prev, lampId]
    );
  };

  const toggleSelectArtifact = (artId) => {
    setSelectedArtifacts(prev => 
      prev.includes(artId) ? prev.filter(id => id !== artId) : [...prev, artId]
    );
  };

  // Chọn nhanh phẩm Hạ -> Cực (Loại trừ Tiên/Thần)
  const selectNormalLamps = () => {
    const normalInBag = inventoryLamps.filter(id => {
      const l = LIFE_LAMPS.find(item => item.id === id);
      return l && !shouldConfirm(l.tier);
    });
    setSelectedLamps(normalInBag);
  };

  const selectNormalArtifacts = () => {
    const normalInBag = unanchoredArtifacts.filter(id => {
      const a = SUPPRESSING_ARTIFACTS.find(item => item.id === id);
      return a && !shouldConfirm(a.tier);
    });
    setSelectedArtifacts(normalInBag);
  };

  // Tính tổng Tiên Tinh và kiểm tra vật phẩm hiếm khi bán hàng loạt
  const selectedLampsList = selectedLamps.map(id => LIFE_LAMPS.find(l => l.id === id)).filter(Boolean);
  const selectedArtsList = selectedArtifacts.map(id => SUPPRESSING_ARTIFACTS.find(a => a.id === id)).filter(Boolean);
  const allSelectedItems = [...selectedLampsList, ...selectedArtsList];
  const totalSelectedCount = allSelectedItems.length;

  let totalSelectedTT = 0;
  const rareSelectedItems = [];
  allSelectedItems.forEach(item => {
    const t = LAMP_TIERS[item.tier] || LAMP_TIERS.ha_pham;
    totalSelectedTT += (t.tienTinh || Math.floor(t.priceExp / 5));
    if (shouldConfirm(item.tier)) {
      rareSelectedItems.push({ name: item.name, tierName: t.name });
    }
  });

  // Bán hàng loạt các mục đã chọn
  const handleBatchSell = () => {
    if (totalSelectedCount === 0) return;

    if (rareSelectedItems.length > 0) {
      const rareListStr = rareSelectedItems.map(r => `• [${r.tierName}] ${r.name}`).join('\n');
      const confirmMsg = `⚠️ CẢNH BÁO BẢO VẬT CAO CẤP!\n\nTrong danh sách ${totalSelectedCount} vật phẩm bạn chọn, CÓ CHỨA ${rareSelectedItems.length} vật phẩm quý hiếm [Tiên Phẩm / Thần Phẩm]:\n\n${rareListStr}\n\nĐạo hữu có CHẮC CHẮN muốn bán tất cả để nhận +${totalSelectedTT.toLocaleString()} Tiên Tinh không?`;
      if (!window.confirm(confirmMsg)) {
        return;
      }
    }
    // Nếu chỉ có Hạ, Trung, Thượng, Cực -> Bán ngay không hỏi lại

    try {
      if (sellMultipleItems) {
        sellMultipleItems({ lampIds: selectedLamps, artifactIds: selectedArtifacts });
      } else {
        selectedLamps.forEach(id => sellLamp(id));
        selectedArtifacts.forEach(id => sellArtifact(id));
      }
      setSelectedLamps([]);
      setSelectedArtifacts([]);
    } catch (err) {
      alert(err.message || 'Lỗi khi bán hàng loạt.');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      background: 'radial-gradient(circle at 50% 20%, rgba(34, 195, 240, 0.08) 0%, rgba(16, 25, 39, 0.98) 60%, #0a0f18 100%)',
      color: '#f0f6fc',
      fontFamily: "'Noto Serif', serif",
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box'
    }}>
      
      {/* 1. TOP NAVIGATION HEADER */}
      <div className="sanctum-header-wrapper">
        <div className="sanctum-header-left">
          <button
            onClick={() => navigate('/cultivation', { replace: true })}
            className="sanctum-back-btn"
          >
            <span>←</span>
            <span className="sanctum-back-text">QUAY LẠI</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 20 }}>🏛️</span>
            <div style={{ minWidth: 0 }}>
              <h1 className="sanctum-header-title">
                TÀNG BẢO ĐIỆN
              </h1>
              <span className="sanctum-header-sub">
                Mệnh Đăng, Bảo Vật & Túi Đồ
              </span>
            </div>
          </div>
        </div>

        {/* Right: Quick HUD Stats */}
        <div className="sanctum-header-stats">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 8.5, color: 'var(--text-muted)', fontWeight: 700 }}>TU VI</div>
            <div style={{ fontSize: 11.5, color: 'var(--color-kim)', fontWeight: 800 }}>{exp.toLocaleString()}</div>
          </div>
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 8.5, color: 'var(--text-muted)', fontWeight: 700 }}>CHIẾN LỰC</div>
            <div style={{ fontSize: 11.5, color: 'var(--accent-cyan-bright, #22c3f0)', fontWeight: 800 }}>{calculatedCombatPower}</div>
          </div>
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 8.5, color: 'var(--text-muted)', fontWeight: 700 }}>TIÊN TINH</div>
            <div style={{ fontSize: 11.5, color: 'var(--color-kim)', fontWeight: 800 }}>{(cultivation?.tienTinh || 0).toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* 2. TAB SWITCHER BAR */}
      <div className="sanctum-tabs-container">
        <button
          onClick={() => setActiveTab('lamps')}
          style={{
            padding: '12px 24px',
            borderRadius: '10px 10px 0 0',
            fontSize: 14,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: activeTab === 'lamps' 
              ? 'linear-gradient(180deg, rgba(255, 204, 0, 0.2) 0%, rgba(16, 25, 39, 0.9) 100%)' 
              : 'transparent',
            border: activeTab === 'lamps' ? '1.5px solid var(--color-kim)' : '1px solid transparent',
            borderBottom: activeTab === 'lamps' ? '2px solid transparent' : 'none',
            color: activeTab === 'lamps' ? 'var(--color-kim)' : 'var(--text-sub)',
            transition: 'all 0.2s ease'
          }}
        >
          <span>🏮 TẾ ĐÀN 72 MỆNH ĐĂNG</span>
        </button>

        <button
          onClick={() => setActiveTab('artifacts')}
          style={{
            padding: '12px 24px',
            borderRadius: '10px 10px 0 0',
            fontSize: 14,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: activeTab === 'artifacts' 
              ? 'linear-gradient(180deg, rgba(34, 195, 240, 0.2) 0%, rgba(16, 25, 39, 0.9) 100%)' 
              : 'transparent',
            border: activeTab === 'artifacts' ? '1.5px solid var(--accent-cyan-bright, #22c3f0)' : '1px solid transparent',
            borderBottom: activeTab === 'artifacts' ? '2px solid transparent' : 'none',
            color: activeTab === 'artifacts' ? 'var(--accent-cyan-bright, #22c3f0)' : 'var(--text-sub)',
            transition: 'all 0.2s ease'
          }}
        >
          <span>🛡️ BẢO KHỐ VẬT TRẤN ÁP</span>
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          style={{
            padding: '12px 24px',
            borderRadius: '10px 10px 0 0',
            fontSize: 14,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: activeTab === 'inventory' 
              ? 'linear-gradient(180deg, rgba(168, 85, 247, 0.2) 0%, rgba(16, 25, 39, 0.9) 100%)' 
              : 'transparent',
            border: activeTab === 'inventory' ? '1.5px solid var(--color-cuc-canh, #ff3fd5)' : '1px solid transparent',
            borderBottom: activeTab === 'inventory' ? '2px solid transparent' : 'none',
            color: activeTab === 'inventory' ? 'var(--color-cuc-canh, #ff3fd5)' : 'var(--text-sub)',
            transition: 'all 0.2s ease'
          }}
        >
          <span>🎒 TÚI TRỮ VẬT SỞ HỮU</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(0,0,0,0.5)', color: '#fff' }}>
            {inventoryLamps.length + unanchoredArtifacts.length}
          </span>
        </button>
      </div>

      {/* 3. MAIN TAB CONTENT AREA */}
      <div className="sanctum-content-area">

        {/* TAB 1: TẾ ĐÀN 72 MỆNH ĐĂNG */}
        {activeTab === 'lamps' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Đài Sen Bát Quái Bản Mệnh */}
            <div className="sanctum-altar-box">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <SvgLotusLamp size={26} />
                  <h3 style={{ margin: 0, color: 'var(--color-kim)', fontSize: 16, fontWeight: 800, letterSpacing: 0.5 }}>
                    ĐÀI SEN BẢN MỆNH
                  </h3>
                </div>
                <p style={{ margin: '6px 0 0 0', fontSize: 12.5, color: 'var(--text-sub)', lineHeight: 1.5 }}>
                  Mỗi ngọn mệnh đăng đều được hình thành từ huyết mạch của các vị{' '}
                  <strong style={{ color: '#fbbf24', textShadow: '0 0 10px rgba(251,191,36,0.6)', fontWeight: 800, letterSpacing: '0.5px' }}>
                    Cổ Hoàng
                  </strong>
                  ,{' '}
                  <strong style={{ color: '#ff3fd5', textShadow: '0 0 10px rgba(255,63,213,0.6)', fontWeight: 800, letterSpacing: '0.5px' }}>
                    Chúa Tể
                  </strong>
                </p>
              </div>

              <div style={{ display: 'flex', gap: 14 }}>
                {Array.from({ length: maxLamps }).map((_, idx) => {
                  const lampId = absorbedLamps[idx];
                  const lampObj = lampId ? LIFE_LAMPS.find(l => l.id === lampId) : null;
                  const isCucCanh = idx === 4;

                  return (
                    <div
                      key={idx}
                      style={{
                        width: 60,
                        height: 60,
                        borderRadius: 12,
                        border: `1.5px ${lampObj ? 'solid' : 'dashed'} ${
                          lampObj 
                            ? (LAMP_TIERS[lampObj.tier]?.border || 'var(--color-kim)') 
                            : isCucCanh 
                              ? 'var(--color-cuc-canh, #ff3fd5)' 
                              : 'rgba(255, 204, 0, 0.4)'
                        }`,
                        background: lampObj ? (LAMP_TIERS[lampObj.tier]?.bg || 'rgba(255, 204, 0, 0.1)') : 'rgba(0, 0, 0, 0.4)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: lampObj ? `0 0 12px ${LAMP_TIERS[lampObj.tier]?.border || 'var(--color-kim)'}` : 'none'
                      }}
                      title={lampObj ? `${lampObj.name} (${LAMP_TIERS[lampObj.tier]?.name})` : `Slot #${idx + 1}`}
                    >
                      {lampObj ? (
                        <ArtifactIcon item={lampObj} isLamp={true} size={42} />
                      ) : (
                        <span style={{ fontSize: 20, color: isCucCanh ? '#ff3fd5' : 'rgba(255, 204, 0, 0.4)' }}>
                          {isCucCanh ? '🔮' : '+'}
                        </span>
                      )}
                      <span style={{ fontSize: 8.5, color: lampObj ? 'var(--color-kim)' : 'var(--text-muted)', fontWeight: 700, marginTop: 1 }}>
                        {isCucCanh ? 'Cực Cảnh' : `Đèn #${idx + 1}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Filter Bar (Mục Lục Toàn Cảnh) */}
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
              {TIER_ORDER.map(tKey => {
                const isOwnedTab = tKey === 'owned';
                const label = isOwnedTab ? `Đã Sở Hữu (${ownedLampsList.length})` : (LAMP_TIERS[tKey]?.name || tKey);

                return (
                  <button
                    key={tKey}
                    onClick={() => setLampFilterTier(tKey)}
                    style={{
                      padding: '6px 18px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: lampFilterTier === tKey ? 'var(--color-kim)' : 'rgba(255, 255, 255, 0.05)',
                      color: lampFilterTier === tKey ? '#000' : 'var(--text-sub)',
                      border: 'none',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Thanh công cụ Chọn nhiều bán hàng loạt Mệnh Đăng (khi ở tab Đã sở hữu) */}
            {lampFilterTier === 'owned' && inventoryLamps.length > 0 && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '10px 16px',
                background: 'rgba(255, 204, 0, 0.06)',
                border: '1px solid rgba(255, 204, 0, 0.25)',
                borderRadius: 12
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-kim)' }}>
                    ⚡ Chọn Nhiều Bán (Túi: {inventoryLamps.length} Đèn):
                  </span>
                  <button
                    onClick={selectNormalLamps}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 8,
                      fontSize: 11.5,
                      fontWeight: 700,
                      background: 'rgba(16, 185, 129, 0.2)',
                      color: '#10b981',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      cursor: 'pointer'
                    }}
                    title="Chọn tất cả Mệnh Đăng phẩm Hạ, Trung, Thượng, Cực trong túi để bán nhanh không cần hỏi lại"
                  >
                    ⚡ Chọn tất cả phẩm Hạ → Cực ({inventoryLamps.filter(id => {
                      const l = LIFE_LAMPS.find(item => item.id === id);
                      return l && !shouldConfirm(l.tier);
                    }).length})
                  </button>
                  <button
                    onClick={() => setSelectedLamps([...inventoryLamps])}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 8,
                      fontSize: 11.5,
                      fontWeight: 600,
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: '#fff',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      cursor: 'pointer'
                    }}
                  >
                    Chọn tất cả ({inventoryLamps.length})
                  </button>
                  {selectedLamps.length > 0 && (
                    <button
                      onClick={() => setSelectedLamps([])}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 8,
                        fontSize: 11.5,
                        fontWeight: 600,
                        background: 'rgba(239, 68, 68, 0.15)',
                        color: '#f87171',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        cursor: 'pointer'
                      }}
                    >
                      Bỏ chọn ({selectedLamps.length})
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Lamp Showcase Grid */}
            {displayedLamps.length === 0 ? (
              <div style={{ padding: 40, borderRadius: 14, background: 'rgba(0,0,0,0.3)', border: '1px dashed rgba(255,255,255,0.1)', color: 'var(--text-muted)', textAlign: 'center', fontSize: 13 }}>
                Không có Mệnh Đăng nào trong mục này. Hãy đọc thêm chương truyện để thu thập Mệnh Đăng!
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 18 }}>
                {displayedLamps.map(lamp => {
                  const isAbsorbed = absorbedLamps.includes(lamp.id);
                  const isOwnedInBag = inventoryLamps.includes(lamp.id);
                  const isOwned = isAbsorbed || isOwnedInBag;
                  const tierInfo = LAMP_TIERS[lamp.tier] || LAMP_TIERS.ha_pham;
                  const priceTT = tierInfo.tienTinh || Math.floor((tierInfo.priceExp || 100) / 10);
                  const isSelected = selectedLamps.includes(lamp.id);

                  return (
                    <div 
                      key={lamp.id}
                      style={{
                        background: isSelected ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 25, 39, 0.85)',
                        border: `1.5px solid ${isAbsorbed ? 'var(--color-kim)' : isSelected ? '#ef4444' : isOwned ? tierInfo.border : 'rgba(255, 255, 255, 0.1)'}`,
                        borderRadius: 14,
                        padding: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 10,
                        opacity: isOwned ? 1 : 0.75,
                        boxShadow: isAbsorbed ? '0 0 16px rgba(255, 204, 0, 0.25)' : isSelected ? '0 0 14px rgba(239, 68, 68, 0.25)' : 'none',
                        position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                        <div style={{ width: 52, height: 52, background: tierInfo.bg, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <ArtifactIcon item={lamp} isLamp={true} size={48} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: tierInfo.color, fontWeight: 800, fontSize: 14 }}>{lamp.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tierInfo.name} · {lamp.shortName}</div>
                        </div>

                        {/* Checkbox chọn nhiều bán khi ở trong túi */}
                        {isOwnedInBag && (
                          <div 
                            onClick={(e) => { e.stopPropagation(); toggleSelectLamp(lamp.id); }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 5,
                              cursor: 'pointer',
                              padding: '4px 8px',
                              borderRadius: 6,
                              background: isSelected ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                              border: `1px solid ${isSelected ? '#ef4444' : 'rgba(255, 255, 255, 0.15)'}`
                            }}
                            title="Chọn Mệnh Đăng này để bán"
                          >
                            <input 
                              type="checkbox" 
                              checked={isSelected} 
                              onChange={() => {}} 
                              style={{ cursor: 'pointer', accentColor: '#ef4444' }} 
                            />
                            <span style={{ fontSize: 11, color: isSelected ? '#f87171' : 'var(--text-muted)', fontWeight: 600 }}>
                              {isSelected ? 'Đã chọn' : 'Chọn'}
                            </span>
                          </div>
                        )}
                      </div>

                      <div style={{ fontSize: 12, color: 'var(--text-sub)', fontStyle: 'italic', lineHeight: 1.5 }}>
                        "{lamp.poem || lamp.desc}"
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <span style={{ fontSize: 11.5, color: 'var(--color-kim)', fontWeight: 700 }}>{priceTT.toLocaleString()} Tiên Tinh</span>
                        
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {isAbsorbed ? (
                            <span style={{ fontSize: 11.5, color: 'var(--color-kim)', fontWeight: 800 }}>✦ ĐÃ KHẢM NẠP</span>
                          ) : isOwnedInBag ? (
                            <>
                              <button
                                disabled={absorbedLamps.length >= maxLamps}
                                onClick={() => {
                                  try {
                                    absorbLamp(lamp.id);
                                  } catch (err) {
                                    alert(err.message || 'Không thể dung hợp.');
                                  }
                                }}
                                style={{
                                  padding: '6px 14px',
                                  borderRadius: 6,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  background: absorbedLamps.length < maxLamps ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' : 'rgba(255, 255, 255, 0.08)',
                                  color: absorbedLamps.length < maxLamps ? '#000' : 'var(--text-muted)',
                                  border: 'none',
                                  cursor: absorbedLamps.length < maxLamps ? 'pointer' : 'not-allowed'
                                }}
                              >
                                Khảm Nạp
                              </button>

                              {sellLamp && (
                                <button
                                  onClick={() => handleSellSingleLamp(lamp)}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    fontSize: 11.5,
                                    fontWeight: 600,
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    color: '#f87171',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    cursor: 'pointer'
                                  }}
                                  title={shouldConfirm(lamp.tier) ? 'Bán Mệnh Đăng (Hỏi xác nhận)' : 'Bán Mệnh Đăng (Bán ngay)'}
                                >
                                  Bán (+{priceTT.toLocaleString()} TT)
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              onClick={() => {
                                const priceTT = tierInfo.tienTinh || Math.floor(tierInfo.priceExp / 5);
                                const userTT = cultivation?.tienTinh || 0;
                                let confirmMsg = `Đạo hữu có muốn dùng ${priceTT.toLocaleString()} Tiên Tinh để ngưng tụ [${lamp.name}] vào Túi Trữ Vật không?`;
                                if (userTT < priceTT) {
                                  const deficitTT = priceTT - userTT;
                                  const deficitExp = deficitTT * 5;
                                  confirmMsg = `Đạo hữu đang có ${userTT.toLocaleString()} TT (thiếu ${deficitTT.toLocaleString()} TT).\n\n⚠️ Đạo hữu có muốn dùng hết ${userTT.toLocaleString()} TT và ĐỐT BÙ ${deficitExp.toLocaleString()} Tu Vi (tỉ lệ 1 TT = 5 Tu Vi) để đổi [${lamp.name}] không?`;
                                }
                                if (window.confirm(confirmMsg)) {
                                  try {
                                    buyLamp(lamp.id);
                                  } catch (e) {
                                    alert(e.message || 'Không thể đổi Mệnh Đăng.');
                                  }
                                }
                              }}
                              style={{
                                padding: '5px 12px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(245, 158, 11, 0.3) 100%)',
                                color: 'var(--color-kim)',
                                border: '1px solid rgba(251, 191, 36, 0.5)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                            >
                              <span>✨ Đổi</span>
                              <span style={{ fontSize: 10, opacity: 0.85 }}>({(tierInfo.tienTinh || Math.floor(tierInfo.priceExp / 5)).toLocaleString()} TT)</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: BẢO KHỐ VẬT TRẤN ÁP */}
        {activeTab === 'artifacts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Filter Bar (Mục Lục Toàn Cảnh) */}
            <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
              {TIER_ORDER.map(tKey => {
                const isOwnedTab = tKey === 'owned';
                const label = isOwnedTab ? `Đã Sở Hữu (${ownedArtifactsList.length})` : (LAMP_TIERS[tKey]?.name || tKey);

                return (
                  <button
                    key={tKey}
                    onClick={() => setArtifactFilterTier(tKey)}
                    style={{
                      padding: '6px 18px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: artifactFilterTier === tKey ? 'var(--accent-cyan-bright, #22c3f0)' : 'rgba(255, 255, 255, 0.05)',
                      color: artifactFilterTier === tKey ? '#000' : 'var(--text-sub)',
                      border: 'none',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Thanh công cụ Chọn nhiều bán hàng loạt Bảo Vật Trấn Áp (khi ở tab Đã sở hữu) */}
            {artifactFilterTier === 'owned' && unanchoredArtifacts.length > 0 && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '10px 16px',
                background: 'rgba(34, 195, 240, 0.06)',
                border: '1px solid rgba(34, 195, 240, 0.25)',
                borderRadius: 12
              }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-cyan-bright, #22c3f0)' }}>
                    ⚡ Chọn Nhiều Bán (Túi: {unanchoredArtifacts.length} Bảo Vật):
                  </span>
                  <button
                    onClick={selectNormalArtifacts}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 8,
                      fontSize: 11.5,
                      fontWeight: 700,
                      background: 'rgba(16, 185, 129, 0.2)',
                      color: '#10b981',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      cursor: 'pointer'
                    }}
                    title="Chọn tất cả Bảo Vật phẩm Hạ, Trung, Thượng, Cực trong túi để bán nhanh không cần hỏi lại"
                  >
                    ⚡ Chọn tất cả phẩm Hạ → Cực ({unanchoredArtifacts.filter(id => {
                      const a = SUPPRESSING_ARTIFACTS.find(item => item.id === id);
                      return a && !shouldConfirm(a.tier);
                    }).length})
                  </button>
                  <button
                    onClick={() => setSelectedArtifacts([...unanchoredArtifacts])}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 8,
                      fontSize: 11.5,
                      fontWeight: 600,
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: '#fff',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      cursor: 'pointer'
                    }}
                  >
                    Chọn tất cả ({unanchoredArtifacts.length})
                  </button>
                  {selectedArtifacts.length > 0 && (
                    <button
                      onClick={() => setSelectedArtifacts([])}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 8,
                        fontSize: 11.5,
                        fontWeight: 600,
                        background: 'rgba(239, 68, 68, 0.15)',
                        color: '#f87171',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        cursor: 'pointer'
                      }}
                    >
                      Bỏ chọn ({selectedArtifacts.length})
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Artifact Showcase Grid */}
            {displayedArtifacts.length === 0 ? (
              <div style={{ padding: 40, borderRadius: 14, background: 'rgba(0,0,0,0.3)', border: '1px dashed rgba(255,255,255,0.1)', color: 'var(--text-muted)', textAlign: 'center', fontSize: 13 }}>
                Không có Bảo Vật Trấn Áp nào trong mục này. Hãy đọc thêm chương truyện để thu thập Bảo Vật!
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 18 }}>
                {displayedArtifacts.map(art => {
                  const isAnchored = Object.values(palaceAnchors).some(anc => anc.id === art.id);
                  const isOwnedInBag = inventoryArtifacts.includes(art.id) && !isAnchored;
                  const isOwned = isAnchored || isOwnedInBag;
                  const tierInfo = LAMP_TIERS[art.tier] || LAMP_TIERS.ha_pham;
                  const priceTT = tierInfo.tienTinh || Math.floor((tierInfo.priceExp || 100) / 10);
                  const isSelected = selectedArtifacts.includes(art.id);

                  return (
                    <div 
                      key={art.id}
                      style={{
                        background: isSelected ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 25, 39, 0.85)',
                        border: `1.5px solid ${isAnchored ? 'var(--color-kim)' : isSelected ? '#ef4444' : isOwnedInBag ? 'var(--accent-cyan-bright, #22c3f0)' : tierInfo.border}`,
                        borderRadius: 14,
                        padding: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 10,
                        opacity: isOwned ? 1 : 0.75,
                        boxShadow: isAnchored ? '0 0 16px rgba(255, 204, 0, 0.25)' : isSelected ? '0 0 14px rgba(239, 68, 68, 0.25)' : 'none',
                        position: 'relative'
                      }}
                    >
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                        <ArtifactIcon item={art} size={52} />
                        <div style={{ flex: 1 }}>
                          <div style={{ color: tierInfo.color, fontWeight: 800, fontSize: 14 }}>{art.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tierInfo.name} · {art.type || 'Trấn Áp'}</div>
                        </div>

                        {/* Checkbox chọn nhiều bán khi ở trong túi */}
                        {isOwnedInBag && (
                          <div 
                            onClick={(e) => { e.stopPropagation(); toggleSelectArtifact(art.id); }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 5,
                              cursor: 'pointer',
                              padding: '4px 8px',
                              borderRadius: 6,
                              background: isSelected ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                              border: `1px solid ${isSelected ? '#ef4444' : 'rgba(255, 255, 255, 0.15)'}`
                            }}
                            title="Chọn Bảo Vật này để bán"
                          >
                            <input 
                              type="checkbox" 
                              checked={isSelected} 
                              onChange={() => {}} 
                              style={{ cursor: 'pointer', accentColor: '#ef4444' }} 
                            />
                            <span style={{ fontSize: 11, color: isSelected ? '#f87171' : 'var(--text-muted)', fontWeight: 600 }}>
                              {isSelected ? 'Đã chọn' : 'Chọn'}
                            </span>
                          </div>
                        )}
                      </div>

                      <div style={{ fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.5 }}>
                        {art.desc}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <span style={{ fontSize: 11, color: 'var(--color-kim)', fontStyle: 'italic' }}>"{art.poem}"</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          {isAnchored ? (
                            <span style={{ fontSize: 11.5, color: 'var(--color-kim)', fontWeight: 800 }}>✦ ĐÃ TRẤN CUNG</span>
                          ) : isOwnedInBag ? (
                            <>
                              <span style={{ fontSize: 11.5, color: 'var(--accent-cyan-bright, #22c3f0)', fontWeight: 700 }}>✓ TRONG TÚI</span>
                              {sellArtifact && (
                                <button
                                  onClick={() => handleSellSingleArtifact(art)}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    fontSize: 11.5,
                                    fontWeight: 600,
                                    background: 'rgba(239, 68, 68, 0.15)',
                                    color: '#f87171',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    cursor: 'pointer'
                                  }}
                                  title={shouldConfirm(art.tier) ? 'Bán Bảo Vật (Hỏi xác nhận)' : 'Bán Bảo Vật (Bán ngay)'}
                                >
                                  Bán (+{priceTT.toLocaleString()} TT)
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              onClick={() => {
                                const priceTT = tierInfo.tienTinh || Math.floor(tierInfo.priceExp / 5);
                                const userTT = cultivation?.tienTinh || 0;
                                let confirmMsg = `Đạo hữu có muốn dùng ${priceTT.toLocaleString()} Tiên Tinh để ngưng tụ [${art.name}] vào Túi Trữ Vật không?`;
                                if (userTT < priceTT) {
                                  const deficitTT = priceTT - userTT;
                                  const deficitExp = deficitTT * 5;
                                  confirmMsg = `Đạo hữu đang có ${userTT.toLocaleString()} TT (thiếu ${deficitTT.toLocaleString()} TT).\n\n⚠️ Đạo hữu có muốn dùng hết ${userTT.toLocaleString()} TT và ĐỐT BÙ ${deficitExp.toLocaleString()} Tu Vi (tỉ lệ 1 TT = 5 Tu Vi) để đổi [${art.name}] không?`;
                                }
                                if (window.confirm(confirmMsg)) {
                                  try {
                                    buyArtifact(art.id);
                                  } catch (e) {
                                    alert(e.message || 'Không thể đổi Bảo Vật.');
                                  }
                                }
                              }}
                              style={{
                                padding: '5px 12px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                background: 'linear-gradient(135deg, rgba(34, 195, 240, 0.2) 0%, rgba(14, 116, 144, 0.3) 100%)',
                                color: 'var(--accent-cyan-bright, #22c3f0)',
                                border: '1px solid rgba(34, 195, 240, 0.5)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                            >
                              <span>✨ Đổi</span>
                              <span style={{ fontSize: 10, opacity: 0.85 }}>({(tierInfo.tienTinh || Math.floor(tierInfo.priceExp / 5)).toLocaleString()} TT)</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: TÚI TRỮ VẬT SỞ HỮU */}
        {activeTab === 'inventory' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Sub-Tab Navigation Bar (Chuyển đổi 2 trang Túi Đồ) */}
            <div style={{
              display: 'flex',
              gap: 12,
              background: 'rgba(0, 0, 0, 0.35)',
              padding: '6px 8px',
              borderRadius: 12,
              border: '1px solid rgba(255, 255, 255, 0.08)',
              width: 'fit-content',
              flexWrap: 'wrap'
            }}>
              <button
                onClick={() => setInventorySubTab('lamps')}
                style={{
                  padding: '8px 20px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: inventorySubTab === 'lamps' 
                    ? 'linear-gradient(135deg, rgba(255, 204, 0, 0.25) 0%, rgba(245, 158, 11, 0.35) 100%)' 
                    : 'transparent',
                  color: inventorySubTab === 'lamps' ? 'var(--color-kim)' : 'var(--text-sub)',
                  border: inventorySubTab === 'lamps' ? '1px solid rgba(255, 204, 0, 0.5)' : '1px solid transparent',
                  transition: 'all 0.2s ease'
                }}
              >
                <span>🏮 MỆNH ĐĂNG TRONG TÚI</span>
                <span style={{ 
                  fontSize: 11, 
                  padding: '2px 7px', 
                  borderRadius: 10, 
                  background: inventorySubTab === 'lamps' ? 'rgba(255, 204, 0, 0.3)' : 'rgba(255,255,255,0.08)', 
                  color: '#fff' 
                }}>
                  {inventoryLamps.length}
                </span>
              </button>

              <button
                onClick={() => setInventorySubTab('artifacts')}
                style={{
                  padding: '8px 20px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: inventorySubTab === 'artifacts' 
                    ? 'linear-gradient(135deg, rgba(34, 195, 240, 0.25) 0%, rgba(14, 116, 144, 0.35) 100%)' 
                    : 'transparent',
                  color: inventorySubTab === 'artifacts' ? 'var(--accent-cyan-bright, #22c3f0)' : 'var(--text-sub)',
                  border: inventorySubTab === 'artifacts' ? '1px solid rgba(34, 195, 240, 0.5)' : '1px solid transparent',
                  transition: 'all 0.2s ease'
                }}
              >
                <span>🛡️ VẬT TRẤN ÁP SẴN SÀNG</span>
                <span style={{ 
                  fontSize: 11, 
                  padding: '2px 7px', 
                  borderRadius: 10, 
                  background: inventorySubTab === 'artifacts' ? 'rgba(34, 195, 240, 0.3)' : 'rgba(255,255,255,0.08)', 
                  color: '#fff' 
                }}>
                  {unanchoredArtifacts.length}
                </span>
              </button>
            </div>

            {/* TRANG 1: MỆNH ĐĂNG TRONG TÚI */}
            {inventorySubTab === 'lamps' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <h3 style={{ color: 'var(--color-kim)', fontSize: 15, fontWeight: 800, margin: 0 }}>
                    🏮 DANH SÁCH MỆNH ĐĂNG TRONG TÚI TRỮ VẬT ({inventoryLamps.length})
                  </h3>
                  {inventoryLamps.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        onClick={selectNormalLamps}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 6,
                          fontSize: 11.5,
                          fontWeight: 700,
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#10b981',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          cursor: 'pointer'
                        }}
                      >
                        ⚡ Chọn Hạ → Cực
                      </button>
                      <button
                        onClick={() => setSelectedLamps([...inventoryLamps])}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 6,
                          fontSize: 11.5,
                          fontWeight: 600,
                          background: 'rgba(255, 255, 255, 0.06)',
                          color: '#fff',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          cursor: 'pointer'
                        }}
                      >
                        Chọn tất cả
                      </button>
                      {selectedLamps.length > 0 && (
                        <button
                          onClick={() => setSelectedLamps([])}
                          style={{
                            padding: '5px 10px',
                            borderRadius: 6,
                            fontSize: 11.5,
                            fontWeight: 600,
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#f87171',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            cursor: 'pointer'
                          }}
                        >
                          Bỏ chọn ({selectedLamps.length})
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {inventoryLamps.length === 0 ? (
                  <div style={{ padding: 40, borderRadius: 14, background: 'rgba(0,0,0,0.3)', border: '1px dashed rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                    Túi trữ vật chưa có Mệnh Đăng nào. Hãy ngộ đạo 60s hoặc đọc truyện để nhận Mệnh Đăng!
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                    {inventoryLamps.map(lampId => {
                      const lobj = LIFE_LAMPS.find(l => l.id === lampId);
                      if (!lobj) return null;
                      const tierInfo = LAMP_TIERS[lobj.tier] || LAMP_TIERS.ha_pham;
                      const priceTT = tierInfo.tienTinh || Math.floor((tierInfo.priceExp || 100) / 10);
                      const isSelected = selectedLamps.includes(lampId);

                      return (
                        <div 
                          key={lampId} 
                          style={{ 
                            padding: 14, 
                            borderRadius: 10, 
                            background: isSelected ? 'rgba(239, 68, 68, 0.08)' : 'rgba(0,0,0,0.4)', 
                            border: `1px solid ${isSelected ? '#ef4444' : 'rgba(255, 204, 0, 0.3)'}`, 
                            display: 'flex', 
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 10
                          }}
                        >
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <div style={{ width: 44, height: 44, borderRadius: 8, background: tierInfo?.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <ArtifactIcon item={lobj} isLamp={true} size={40} />
                            </div>
                            <div>
                              <div style={{ color: tierInfo?.color || '#ffcc00', fontWeight: 700, fontSize: 13 }}>{lobj.name}</div>
                              <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{tierInfo.name} · +{priceTT.toLocaleString()} TT</div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <div 
                              onClick={() => toggleSelectLamp(lampId)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                cursor: 'pointer',
                                padding: '4px 6px',
                                borderRadius: 4,
                                background: isSelected ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                                border: `1px solid ${isSelected ? '#ef4444' : 'rgba(255, 255, 255, 0.15)'}`
                              }}
                            >
                              <input type="checkbox" checked={isSelected} onChange={() => {}} style={{ cursor: 'pointer', accentColor: '#ef4444' }} />
                            </div>

                            {sellLamp && (
                              <button
                                onClick={() => handleSellSingleLamp(lobj)}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  color: '#f87171',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  cursor: 'pointer'
                                }}
                              >
                                Bán
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TRANG 2: VẬT TRẤN ÁP SẴN SÀNG */}
            {inventorySubTab === 'artifacts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <h3 style={{ color: 'var(--accent-cyan-bright, #22c3f0)', fontSize: 15, fontWeight: 800, margin: 0 }}>
                    🛡️ DANH SÁCH VẬT TRẤN ÁP SẴN SÀNG ({unanchoredArtifacts.length})
                  </h3>
                  {unanchoredArtifacts.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        onClick={selectNormalArtifacts}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 6,
                          fontSize: 11.5,
                          fontWeight: 700,
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#10b981',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          cursor: 'pointer'
                        }}
                      >
                        ⚡ Chọn Hạ → Cực
                      </button>
                      <button
                        onClick={() => setSelectedArtifacts([...unanchoredArtifacts])}
                        style={{
                          padding: '5px 12px',
                          borderRadius: 6,
                          fontSize: 11.5,
                          fontWeight: 600,
                          background: 'rgba(255, 255, 255, 0.06)',
                          color: '#fff',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          cursor: 'pointer'
                        }}
                      >
                        Chọn tất cả
                      </button>
                      {selectedArtifacts.length > 0 && (
                        <button
                          onClick={() => setSelectedArtifacts([])}
                          style={{
                            padding: '5px 10px',
                            borderRadius: 6,
                            fontSize: 11.5,
                            fontWeight: 600,
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#f87171',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            cursor: 'pointer'
                          }}
                        >
                          Bỏ chọn ({selectedArtifacts.length})
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {unanchoredArtifacts.length === 0 ? (
                  <div style={{ padding: 40, borderRadius: 14, background: 'rgba(0,0,0,0.3)', border: '1px dashed rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                    Túi trữ vật chưa có vật trấn áp nào sẵn sàng. Hãy đọc thêm chương truyện để nhặt hoặc đổi bằng Tiên Tinh!
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                    {unanchoredArtifacts.map(artId => {
                      const artObj = SUPPRESSING_ARTIFACTS.find(a => a.id === artId);
                      if (!artObj) return null;
                      const tierInfo = LAMP_TIERS[artObj.tier] || LAMP_TIERS.ha_pham;
                      const priceTT = tierInfo.tienTinh || Math.floor((tierInfo.priceExp || 100) / 10);
                      const isSelected = selectedArtifacts.includes(artId);

                      return (
                        <div 
                          key={artId} 
                          style={{ 
                            padding: 14, 
                            borderRadius: 10, 
                            background: isSelected ? 'rgba(239, 68, 68, 0.08)' : 'rgba(0,0,0,0.4)', 
                            border: `1px solid ${isSelected ? '#ef4444' : 'rgba(34, 195, 240, 0.35)'}`, 
                            display: 'flex', 
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 10
                          }}
                        >
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <ArtifactIcon item={artObj} size={46} />
                            <div>
                              <div style={{ color: tierInfo?.color || '#38bdf8', fontWeight: 700, fontSize: 13 }}>{artObj.name}</div>
                              <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{tierInfo?.name} · +{priceTT.toLocaleString()} TT</div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <div 
                              onClick={() => toggleSelectArtifact(artId)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                cursor: 'pointer',
                                padding: '4px 6px',
                                borderRadius: 4,
                                background: isSelected ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.06)',
                                border: `1px solid ${isSelected ? '#ef4444' : 'rgba(255, 255, 255, 0.15)'}`
                              }}
                            >
                              <input type="checkbox" checked={isSelected} onChange={() => {}} style={{ cursor: 'pointer', accentColor: '#ef4444' }} />
                            </div>

                            {sellArtifact && (
                              <button
                                onClick={() => handleSellSingleArtifact(artObj)}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  color: '#f87171',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  cursor: 'pointer'
                                }}
                              >
                                Bán
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

          </div>
        )}

      </div>

      {/* FLOATING ACTION BAR FOR BATCH SELL */}
      {totalSelectedCount > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 999,
          background: 'linear-gradient(135deg, rgba(20, 29, 45, 0.98) 0%, rgba(10, 16, 26, 0.99) 100%)',
          border: '1.5px solid var(--color-kim)',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.85), 0 0 24px rgba(255, 204, 0, 0.35)',
          borderRadius: 16,
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          backdropFilter: 'blur(12px)',
          maxWidth: '94vw',
          animation: 'slideUp 0.25s ease'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: '#fff' }}>
              Đã chọn: <span style={{ color: 'var(--color-kim)' }}>{totalSelectedCount}</span> vật phẩm
              {selectedLamps.length > 0 && ` (${selectedLamps.length} Đèn)`}
              {selectedArtifacts.length > 0 && ` (${selectedArtifacts.length} Bảo Vật)`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-kim)', fontWeight: 700 }}>
              Thu hồi: +{totalSelectedTT.toLocaleString()} Tiên Tinh
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={handleBatchSell}
              style={{
                padding: '10px 22px',
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 800,
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap'
              }}
            >
              💰 BÁN {totalSelectedCount} MỤC (+{totalSelectedTT.toLocaleString()} TT)
            </button>

            <button
              onClick={() => {
                setSelectedLamps([]);
                setSelectedArtifacts([]);
              }}
              style={{
                padding: '10px 16px',
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 600,
                background: 'rgba(255, 255, 255, 0.08)',
                color: 'var(--text-sub)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              ✕ Bỏ chọn
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
