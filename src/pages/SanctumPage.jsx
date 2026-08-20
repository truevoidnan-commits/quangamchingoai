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
    buyArtifact,
    gainReadingExp 
  } = useCultivationContext();

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('lamps'); // 'lamps' | 'artifacts' | 'inventory'
  const [lampFilterTier, setLampFilterTier] = useState('owned'); // 'owned' | 'ha_pham' | ...
  const [artifactFilterTier, setArtifactFilterTier] = useState('owned'); // 'owned' | 'ha_pham' | ...

  const currentRealm = cultivation?.realm || 'truc_co';
  const exp = cultivation?.totalExp || cultivation?.expCurrentRealm || 0;
  const is121Unlocked = cultivation?.has121st || false;
  const maxLamps = is121Unlocked ? 5 : 4;
  const absorbedLamps = cultivation?.absorbedLamps || [];
  const inventoryLamps = cultivation?.inventoryLamps || [];
  const palaceAnchors = cultivation?.palaceAnchors || {};
  const inventoryArtifacts = cultivation?.inventoryArtifacts || [];
  const anchoredIds = Object.values(palaceAnchors).map(a => a?.id || a).filter(Boolean);

  const TIER_ORDER = ['owned', 'ha_pham', 'trung_pham', 'thuong_pham', 'cuc_pham', 'tien_pham', 'than_pham'];

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
      <div style={{
        height: 70,
        padding: '0 32px',
        borderBottom: '1px solid rgba(255, 204, 0, 0.25)',
        background: 'rgba(16, 25, 39, 0.9)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        {/* Left: Back Button & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <button
            onClick={() => navigate('/cultivation')}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              background: 'rgba(34, 195, 240, 0.1)',
              border: '1px solid rgba(34, 195, 240, 0.3)',
              color: 'var(--accent-cyan-bright, #22c3f0)',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.2s ease'
            }}
          >
            <span>←</span>
            <span>QUAY LẠI TU LUYỆN</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>🏛️</span>
            <div>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--color-kim)', letterSpacing: 0.5 }}>
                TÀNG BẢO ĐIỆN · TIÊN GIA BẢO KHỐ
              </h1>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Đại sảnh trưng bày Mệnh Đăng, Bảo Vật Trấn Cung & Túi Trữ Vật
              </span>
            </div>
          </div>
        </div>

        {/* Right: Quick HUD Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            background: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 204, 0, 0.3)',
            borderRadius: 10,
            padding: '6px 16px',
            display: 'flex',
            gap: 16,
            alignItems: 'center'
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>TU VI</div>
              <div style={{ fontSize: 13, color: 'var(--color-kim)', fontWeight: 800 }}>{exp.toLocaleString()} EXP</div>
            </div>
            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>CHIẾN LỰC</div>
              <div style={{ fontSize: 13, color: 'var(--accent-cyan-bright, #22c3f0)', fontWeight: 800 }}>{calculatedCombatPower}</div>
            </div>
            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700 }}>TIÊN TINH</div>
              <div style={{ fontSize: 13, color: 'var(--color-kim)', fontWeight: 800 }}>{(cultivation?.tienTinh || 0).toLocaleString()} TT</div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. TAB SWITCHER BAR */}
      <div style={{
        padding: '16px 32px 0 32px',
        display: 'flex',
        gap: 16,
        background: 'rgba(16, 25, 39, 0.6)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
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
            {absorbedLamps.length + Object.keys(palaceAnchors).length + inventoryArtifacts.length}
          </span>
        </button>
      </div>

      {/* 3. MAIN TAB CONTENT AREA */}
      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>

        {/* TAB 1: TẾ ĐÀN 72 MỆNH ĐĂNG */}
        {activeTab === 'lamps' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Đài Sen Bát Quái Bản Mệnh */}
            <div style={{
              padding: '18px 24px',
              borderRadius: 14,
              background: 'radial-gradient(circle at 50% 50%, rgba(255, 204, 0, 0.08) 0%, rgba(16, 25, 39, 0.9) 100%)',
              border: '1.5px solid rgba(255, 204, 0, 0.35)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
            }}>
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
                  const canAbsorb = absorbedLamps.length < maxLamps && !isAbsorbed && isOwnedInBag;

                  return (
                    <div 
                      key={lamp.id}
                      style={{
                        background: 'rgba(16, 25, 39, 0.85)',
                        border: `1.5px solid ${isAbsorbed ? 'var(--color-kim)' : isOwned ? tierInfo.border : 'rgba(255, 255, 255, 0.1)'}`,
                        borderRadius: 14,
                        padding: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 10,
                        opacity: isOwned ? 1 : 0.75,
                        boxShadow: isAbsorbed ? '0 0 16px rgba(255, 204, 0, 0.25)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', gap: 14 }}>
                        <div style={{ width: 52, height: 52, background: tierInfo.bg, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <ArtifactIcon item={lamp} isLamp={true} size={48} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: tierInfo.color, fontWeight: 800, fontSize: 14 }}>{lamp.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tierInfo.name} · {lamp.shortName}</div>
                        </div>
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
                                  onClick={() => {
                                    if (window.confirm(`Bạn có chắc muốn bán [${lamp.name}] lấy Tiên Tinh không?`)) {
                                      try {
                                        sellLamp(lamp.id);
                                      } catch (e) {
                                        alert(e.message || 'Không thể bán.');
                                      }
                                    }
                                  }}
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
                                  title="Phân giải Mệnh Đăng lấy Tiên Tinh"
                                >
                                  Bán
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

                  return (
                    <div 
                      key={art.id}
                      style={{
                        background: 'rgba(16, 25, 39, 0.85)',
                        border: `1.5px solid ${isAnchored ? 'var(--color-kim)' : isOwnedInBag ? 'var(--accent-cyan-bright, #22c3f0)' : tierInfo.border}`,
                        borderRadius: 14,
                        padding: 16,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 10,
                        opacity: isOwned ? 1 : 0.75,
                        boxShadow: isAnchored ? '0 0 16px rgba(255, 204, 0, 0.25)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', gap: 14 }}>
                        <ArtifactIcon item={art} size={52} />
                        <div style={{ flex: 1 }}>
                          <div style={{ color: tierInfo.color, fontWeight: 800, fontSize: 14 }}>{art.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tierInfo.name} · {art.type || 'Trấn Áp'}</div>
                        </div>
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
                                  onClick={() => {
                                    if (window.confirm(`Bạn có chắc muốn bán [${art.name}] lấy Tiên Tinh không?`)) {
                                      try {
                                        sellArtifact(art.id);
                                      } catch (e) {
                                        alert(e.message || 'Không thể bán.');
                                      }
                                    }
                                  }}
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
                                  title="Phân giải Bảo Vật lấy Tiên Tinh"
                                >
                                  Bán
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            
            {/* Phân Mục 1: Mệnh Đăng Bản Mệnh */}
            <div>
              <h3 style={{ color: 'var(--color-kim)', fontSize: 15, fontWeight: 800, marginBottom: 12 }}>
                🏮 MỆNH ĐĂNG ĐÃ HẤP THỤ ({absorbedLamps.length}/{maxLamps})
              </h3>
              {absorbedLamps.length === 0 ? (
                <div style={{ padding: 20, borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: '1px dashed rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
                  Chưa hấp thụ Mệnh Đăng nào.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {absorbedLamps.map((lampId, idx) => {
                    const lobj = LIFE_LAMPS.find(l => l.id === lampId);
                    const tierInfo = lobj ? LAMP_TIERS[lobj.tier] : LAMP_TIERS.ha_pham;
                    return (
                      <div key={lampId} style={{ padding: 14, borderRadius: 10, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255, 204, 0, 0.4)', display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{ width: 46, height: 46, borderRadius: 8, background: tierInfo?.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <ArtifactIcon item={lobj} isLamp={true} size={42} />
                        </div>
                        <div>
                          <div style={{ color: tierInfo?.color || '#ffcc00', fontWeight: 700, fontSize: 13 }}>{lobj?.name || lampId}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{lobj ? getLampPalaceName(lobj) : `Chân Cung #${idx + 1}`} ({tierInfo?.name})</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Phân Mục 2: Bảo Vật Đã Khảm Nạm */}
            <div>
              <h3 style={{ color: 'var(--accent-cyan-bright, #22c3f0)', fontSize: 15, fontWeight: 800, marginBottom: 12 }}>
                🛡️ BẢO VẬT ĐÃ KHẢM NẠM TRẤN CUNG ({Object.keys(palaceAnchors).length}/7 CUNG TỰ THÂN)
              </h3>
              {Object.keys(palaceAnchors).length === 0 ? (
                <div style={{ padding: 20, borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: '1px dashed rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
                  Chưa có Cung Tự Thân nào được khảm nạm Bảo Vật Trấn Áp.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {Object.entries(palaceAnchors).map(([pIdx, anchor]) => {
                    const artObj = SUPPRESSING_ARTIFACTS.find(a => a.id === anchor.id) || anchor;
                    const tierInfo = LAMP_TIERS[artObj.tier] || LAMP_TIERS.ha_pham;
                    return (
                      <div key={pIdx} style={{ padding: 14, borderRadius: 10, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(34, 195, 240, 0.4)', display: 'flex', gap: 12, alignItems: 'center' }}>
                        <ArtifactIcon item={artObj} size={46} />
                        <div>
                          <div style={{ color: tierInfo?.color || '#38bdf8', fontWeight: 700, fontSize: 13 }}>{artObj?.name || anchor.id}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Cung Tự Thân #{parseInt(pIdx) + 1} ({tierInfo?.name})</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Phân Mục 3: Bảo Vật Trong Túi Trữ Vật Sẵn Sàng */}
            <div>
              <h3 style={{ color: 'var(--color-cuc-canh, #ff3fd5)', fontSize: 15, fontWeight: 800, marginBottom: 12 }}>
                🎒 BẢO VẬT TRONG TÚI TRỮ VẬT (SẴN SÀNG KHẢM NẠM: {inventoryArtifacts.filter(id => !anchoredIds.includes(id)).length})
              </h3>
              {inventoryArtifacts.filter(id => !anchoredIds.includes(id)).length === 0 ? (
                <div style={{ padding: 20, borderRadius: 10, background: 'rgba(0,0,0,0.3)', border: '1px dashed rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
                  Túi trữ vật chưa có thêm bảo vật nào. Hãy đọc thêm chương truyện để nhặt bảo vật!
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                  {inventoryArtifacts
                    .filter(id => !anchoredIds.includes(id))
                    .map(artId => {
                      const artObj = SUPPRESSING_ARTIFACTS.find(a => a.id === artId);
                      if (!artObj) return null;
                      const tierInfo = LAMP_TIERS[artObj.tier] || LAMP_TIERS.ha_pham;
                      return (
                        <div key={artId} style={{ padding: 14, borderRadius: 10, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255, 63, 213, 0.4)', display: 'flex', gap: 12, alignItems: 'center' }}>
                          <ArtifactIcon item={artObj} size={46} />
                          <div>
                            <div style={{ color: tierInfo?.color || '#ff3fd5', fontWeight: 700, fontSize: 13 }}>{artObj.name}</div>
                            <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{tierInfo?.name} · {artObj.type}</div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
