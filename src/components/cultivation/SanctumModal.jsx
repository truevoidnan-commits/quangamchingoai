import React, { useState } from 'react';
import { useCultivationContext } from '../../context/CultivationContext';
import { LIFE_LAMPS, SUPPRESSING_ARTIFACTS, getPalaceNameFromArtifact } from '../../lib/cultivation';
import { getLampImageUrl, getArtifactImageUrl } from '../../lib/artifactIcons';

export default function SanctumModal({ isOpen, onClose, initialTab = 'lamps' }) {
  const { 
    cultivation, 
    absorbLamp, 
    anchorPalace, 
    sellLamp,
    sellArtifact,
    sellMultipleItems,
    buyLamp,
    buyArtifact,
  } = useCultivationContext();

  const [activeTab, setActiveTab] = useState(initialTab === 'inventory' ? 'lamps' : initialTab); // 'lamps' | 'artifacts'
  const [lampFilter, setLampFilter] = useState('all'); // 'all' | 'equipped' | 'bag' | 'unowned'
  const [artifactFilter, setArtifactFilter] = useState('all'); // 'all' | 'equipped' | 'bag' | 'unowned'
  const [hoveredCardId, setHoveredCardId] = useState(null);

  if (!isOpen) return null;

  const is121Unlocked = cultivation?.has121st || false;
  const maxLamps = is121Unlocked ? 5 : 4;
  const absorbedLamps = cultivation?.absorbedLamps || [];
  const palaceAnchors = cultivation?.palaceAnchors || {};
  const inventoryLamps = cultivation?.inventoryLamps || [];
  const inventoryArtifacts = cultivation?.inventoryArtifacts || [];
  const anchoredIds = Object.values(palaceAnchors).map(a => a?.id || a).filter(Boolean);
  const unanchoredArtifacts = inventoryArtifacts.filter(id => !anchoredIds.includes(id));
  const isNguyenAnhStage = cultivation?.realm === 'gia_anh' || cultivation?.realm === 'nguyen_anh';

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

  const totalBagItemsCount = inventoryLamps.length + unanchoredArtifacts.length;

  const handleQuickRefineAllBag = () => {
    if (totalBagItemsCount === 0) return;
    const gainDesc = isNguyenAnhStage ? `+${totalBagItemsCount * 50} Lực Thiên Mệnh` : `+${(totalBagItemsCount * 3000).toLocaleString()} Tu Vi`;
    if (!window.confirm(`⚡ Luyện hóa nhanh ${totalBagItemsCount} món trong túi nhận ${gainDesc}?`)) return;
    try {
      sellMultipleItems({ lampIds: inventoryLamps, artifactIds: unanchoredArtifacts });
    } catch (e) {
      alert(e.message || 'Luyện hóa thất bại.');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(5, 10, 20, 0.9)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      zIndex: 1200,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    }}>
      <div style={{
        background: 'radial-gradient(circle at 50% -10%, #1e153b 0%, #0c0f24 50%, #030712 100%)',
        border: '1.5px solid rgba(239, 68, 68, 0.45)',
        borderRadius: 20,
        width: '94vw',
        maxWidth: 1260,
        height: '90vh',
        maxHeight: 900,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 72px rgba(0, 0, 0, 0.9), 0 0 40px rgba(239, 68, 68, 0.25)',
        overflow: 'hidden',
        fontFamily: "'Noto Serif', serif"
      }}>
        
        {/* MODAL HEADER */}
        <div style={{
          padding: '14px 24px',
          borderBottom: '1px solid rgba(239, 68, 68, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.12) 0%, transparent 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'radial-gradient(circle, rgba(239, 68, 68, 0.3) 0%, rgba(16, 25, 39, 0.8) 100%)',
              border: '1.5px solid #ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              boxShadow: '0 0 16px rgba(239, 68, 68, 0.3)'
            }}>
              🏛️
            </div>
            <div>
              <h2 style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 900,
                background: 'linear-gradient(135deg, #fecaca 0%, #ef4444 50%, #f87171 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: 1,
              }}>
                TÀNG BẢO ĐIỆN · BẢO KHỐ THẦN VẬT
              </h2>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                18 Mệnh Đăng Thần Phẩm · 24 Trấn Cung Thần Vật Thượng Cổ
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {totalBagItemsCount > 0 && (
              <button
                onClick={handleQuickRefineAllBag}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 11.5,
                  fontWeight: 800,
                  cursor: 'pointer',
                  background: '#ef4444',
                  border: 'none',
                  color: '#fff',
                  boxShadow: '0 0 12px rgba(239, 68, 68, 0.4)'
                }}
              >
                ⚡ Luyện Hóa Nhanh ({totalBagItemsCount})
              </button>
            )}

            <button 
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '50%',
                width: 32,
                height: 32,
                color: '#cbd5e1',
                fontSize: 15,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
              title="Đóng (ESC)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* TOP TAB SWITCHER (2 TAB CHÍNH) */}
        <div style={{
          display: 'flex',
          gap: 10,
          padding: '10px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(0, 0, 0, 0.3)'
        }}>
          <button
            onClick={() => setActiveTab('lamps')}
            style={{
              flex: 1,
              padding: '9px 14px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.2s ease',
              background: activeTab === 'lamps' 
                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.25) 0%, rgba(185, 28, 28, 0.15) 100%)' 
                : 'rgba(255, 255, 255, 0.03)',
              border: activeTab === 'lamps' ? '1.5px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.08)',
              color: activeTab === 'lamps' ? '#f87171' : '#94a3b8',
              boxShadow: activeTab === 'lamps' ? '0 0 16px rgba(239, 68, 68, 0.25)' : 'none',
            }}
          >
            <span>🏮 MỆNH ĐĂNG THẦN PHẨM (18)</span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(0,0,0,0.5)', color: '#fff' }}>
              {absorbedLamps.length}/18 Đã khảm
            </span>
          </button>

          <button
            onClick={() => setActiveTab('artifacts')}
            style={{
              flex: 1,
              padding: '9px 14px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.2s ease',
              background: activeTab === 'artifacts' 
                ? 'linear-gradient(135deg, rgba(56, 189, 248, 0.25) 0%, rgba(3, 105, 161, 0.15) 100%)' 
                : 'rgba(255, 255, 255, 0.03)',
              border: activeTab === 'artifacts' ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
              color: activeTab === 'artifacts' ? '#38bdf8' : '#94a3b8',
              boxShadow: activeTab === 'artifacts' ? '0 0 16px rgba(56, 189, 248, 0.25)' : 'none',
            }}
          >
            <span>🛡️ VẬT TRẤN ÁP THẦN PHẨM (24)</span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(0,0,0,0.5)', color: '#fff' }}>
              {anchoredIds.length}/24 Đã khảm
            </span>
          </button>
        </div>

        {/* TAB 1: MỆNH ĐĂNG */}
        {activeTab === 'lamps' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div style={{ padding: '8px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', gap: 8, overflowX: 'auto' }}>
              <button
                onClick={() => setLampFilter('all')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: lampFilter === 'all' ? '#ef4444' : 'rgba(255, 255, 255, 0.05)',
                  color: '#fff',
                  border: 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                Tất Cả (18)
              </button>
              <button
                onClick={() => setLampFilter('equipped')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: lampFilter === 'equipped' ? '#ef4444' : 'rgba(255, 255, 255, 0.05)',
                  color: '#fff',
                  border: 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                Đã Khảm Nạm ({absorbedLamps.length})
              </button>
              <button
                onClick={() => setLampFilter('bag')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: lampFilter === 'bag' ? '#f59e0b' : 'rgba(255, 255, 255, 0.05)',
                  color: lampFilter === 'bag' ? '#000' : '#fff',
                  border: 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                Trong Túi ({inventoryLamps.length})
              </button>
              <button
                onClick={() => setLampFilter('unowned')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: lampFilter === 'unowned' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: '#cbd5e1',
                  border: 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                Chưa Sở Hữu ({18 - absorbedLamps.length - inventoryLamps.length})
              </button>
            </div>

            <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
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
                    style={{
                      background: 'linear-gradient(180deg, rgba(20, 15, 30, 0.95) 0%, rgba(10, 10, 20, 0.98) 100%)',
                      border: `1.5px solid ${isAbsorbed ? '#ef4444' : isInBag ? '#f59e0b' : 'rgba(239, 68, 68, 0.35)'}`,
                      borderRadius: 16,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      textAlign: 'center',
                      position: 'relative',
                      overflow: 'hidden',
                      boxShadow: isAbsorbed ? '0 0 16px rgba(239, 68, 68, 0.3)' : '0 4px 16px rgba(0,0,0,0.35)',
                      transform: isHovered ? 'translateY(-4px)' : 'none',
                      transition: 'all 0.25s ease',
                    }}
                  >
                    {/* Header Badges */}
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, background: 'rgba(239, 68, 68, 0.25)', border: '1px solid rgba(239, 68, 68, 0.6)', color: '#fca5a5' }}>
                        ✦ THẦN PHẨM ✦
                      </span>
                      {isAbsorbed && <span style={{ fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, background: '#ef4444', color: '#fff' }}>ĐÃ HẤP THỤ</span>}
                      {isInBag && <span style={{ fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, background: '#f59e0b', color: '#000' }}>TRONG TÚI</span>}
                    </div>

                    {/* Square Image Stage (1:1 Aspect Ratio - Hiển thị trọn vẹn 100%) */}
                    <div style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      borderRadius: 12,
                      overflow: 'hidden',
                      position: 'relative',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      background: '#0a0a14',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 8,
                    }}>
                      <img
                        src={imgUrl}
                        alt={lamp.name}
                        loading="lazy"
                        decoding="async"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.parentNode.innerHTML = `<div style="font-size: 40px;">${lamp.icon || '🏮'}</div>`;
                        }}
                      />
                    </div>

                    {/* Name & Desc */}
                    <div style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ color: '#fecaca', fontWeight: 900, fontSize: 14, marginBottom: 2 }}>{lamp.name}</div>
                        <p style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.35, margin: '4px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {lamp.desc}
                        </p>
                      </div>

                      {/* Action */}
                      <div style={{ width: '100%', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        {isAbsorbed ? (
                          <div style={{ fontSize: 11.5, color: '#4ade80', fontWeight: 800, textAlign: 'center', padding: '4px 0', background: 'rgba(34,197,94,0.1)', borderRadius: 6, border: '1px solid rgba(34,197,94,0.25)' }}>
                            ✓ Đã khảm nạm
                          </div>
                        ) : isInBag ? (
                          <button
                            onClick={() => {
                              try { absorbLamp(lamp.id); } catch (e) { alert(e.message); }
                            }}
                            style={{
                              width: '100%',
                              padding: '5px 10px',
                              borderRadius: 6,
                              fontSize: 11.5,
                              fontWeight: 800,
                              background: '#ef4444',
                              color: '#fff',
                              border: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            Hấp Thụ
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              if (!window.confirm(`Đổi [${lamp.name}] bằng cách đốt ${isNguyenAnhStage ? '200 TM' : '10.000 Tu Vi'}?`)) return;
                              try { buyLamp(lamp.id); } catch (e) { alert(e.message); }
                            }}
                            style={{
                              width: '100%',
                              padding: '5px 10px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 800,
                              background: 'rgba(239, 68, 68, 0.25)',
                              border: '1px solid #ef4444',
                              color: '#fca5a5',
                              cursor: 'pointer'
                            }}
                          >
                            🔥 Đổi (Đốt {isNguyenAnhStage ? '200 TM' : '10k'})
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

        {/* TAB 2: VẬT TRẤN ÁP */}
        {activeTab === 'artifacts' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div style={{ padding: '8px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', gap: 8, overflowX: 'auto' }}>
              <button
                onClick={() => setArtifactFilter('all')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: artifactFilter === 'all' ? '#38bdf8' : 'rgba(255, 255, 255, 0.05)',
                  color: '#fff',
                  border: 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                Tất Cả (24)
              </button>
              <button
                onClick={() => setArtifactFilter('equipped')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: artifactFilter === 'equipped' ? '#38bdf8' : 'rgba(255, 255, 255, 0.05)',
                  color: '#fff',
                  border: 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                Đã Khảm Nạm ({anchoredIds.length})
              </button>
              <button
                onClick={() => setArtifactFilter('bag')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: artifactFilter === 'bag' ? '#f59e0b' : 'rgba(255, 255, 255, 0.05)',
                  color: artifactFilter === 'bag' ? '#000' : '#fff',
                  border: 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                Trong Túi ({unanchoredArtifacts.length})
              </button>
              <button
                onClick={() => setArtifactFilter('unowned')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: artifactFilter === 'unowned' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: '#cbd5e1',
                  border: 'none',
                  whiteSpace: 'nowrap'
                }}
              >
                Chưa Sở Hữu ({24 - anchoredIds.length - unanchoredArtifacts.length})
              </button>
            </div>

            <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
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
                    style={{
                      background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(8, 14, 28, 0.98) 100%)',
                      border: `1.5px solid ${isAnchored ? '#38bdf8' : isInBag ? '#f59e0b' : 'rgba(56, 189, 248, 0.35)'}`,
                      borderRadius: 16,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      textAlign: 'center',
                      position: 'relative',
                      overflow: 'hidden',
                      boxShadow: isAnchored ? '0 0 16px rgba(56, 189, 248, 0.3)' : '0 4px 16px rgba(0,0,0,0.35)',
                      transform: isHovered ? 'translateY(-4px)' : 'none',
                      transition: 'all 0.25s ease',
                    }}
                  >
                    {/* Header Badges */}
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, background: 'rgba(56, 189, 248, 0.25)', border: '1px solid rgba(56, 189, 248, 0.6)', color: '#7dd3fc' }}>
                        ✦ {art.type || 'THẦN VẬT'} ✦
                      </span>
                      {isAnchored && <span style={{ fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, background: '#38bdf8', color: '#000' }}>ĐÃ TRẤN CUNG</span>}
                      {isInBag && <span style={{ fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, background: '#f59e0b', color: '#000' }}>TRONG TÚI</span>}
                    </div>

                    {/* Square Image Stage (1:1 Aspect Ratio - Hiển thị trọn vẹn 100%) */}
                    <div style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      borderRadius: 12,
                      overflow: 'hidden',
                      position: 'relative',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      background: '#060f1e',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 8,
                    }}>
                      <img
                        src={imgUrl}
                        alt={art.name}
                        loading="lazy"
                        decoding="async"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.parentNode.innerHTML = `<div style="font-size: 40px;">${art.icon || '🏛️'}</div>`;
                        }}
                      />
                    </div>

                    {/* Name & Desc */}
                    <div style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ color: '#e0f2fe', fontWeight: 900, fontSize: 14, marginBottom: 2 }}>{art.name}</div>
                        <div style={{ fontSize: 10.5, color: '#38bdf8', fontWeight: 700 }}>🏛️ [{palaceName}]</div>
                        <p style={{ fontSize: 11, color: '#cbd5e1', lineHeight: 1.35, margin: '4px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {art.desc}
                        </p>
                      </div>

                      {/* Action */}
                      <div style={{ width: '100%', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        {isAnchored ? (
                          <div style={{ fontSize: 11.5, color: '#38bdf8', fontWeight: 800, textAlign: 'center', padding: '4px 0', background: 'rgba(56,189,248,0.1)', borderRadius: 6, border: '1px solid rgba(56,189,248,0.25)' }}>
                            ✓ Đã khảm nạm
                          </div>
                        ) : isInBag ? (
                          <button
                            onClick={() => {
                              if (cultivation?.realm !== 'kim_dan') {
                                alert('Chỉ tu sĩ Kim Đan mới có thể khảm nạm Trấn Áp!');
                                return;
                              }
                              try { anchorPalace(cultivation.realizedThienCung || 0, art.id); } catch (e) { alert(e.message); }
                            }}
                            style={{
                              width: '100%',
                              padding: '5px 10px',
                              borderRadius: 6,
                              fontSize: 11.5,
                              fontWeight: 800,
                              background: '#38bdf8',
                              color: '#000',
                              border: 'none',
                              cursor: 'pointer'
                            }}
                          >
                            Khảm Nạm
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              if (!window.confirm(`Đổi [${art.name}] bằng cách đốt ${isNguyenAnhStage ? '200 TM' : '10.000 Tu Vi'}?`)) return;
                              try { buyArtifact(art.id); } catch (e) { alert(e.message); }
                            }}
                            style={{
                              width: '100%',
                              padding: '5px 10px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 800,
                              background: 'rgba(56, 189, 248, 0.25)',
                              border: '1px solid #38bdf8',
                              color: '#7dd3fc',
                              cursor: 'pointer'
                            }}
                          >
                            🔥 Đổi (Đốt {isNguyenAnhStage ? '200 TM' : '10k'})
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

      </div>
    </div>
  );
}
