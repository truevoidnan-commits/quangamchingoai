import React, { useState } from 'react';
import { useCultivationContext } from '../../context/CultivationContext';
import { LIFE_LAMPS, SUPPRESSING_ARTIFACTS, LAMP_TIERS } from '../../lib/cultivation';
import ArtifactIcon from './ArtifactIcon';

export default function SanctumModal({ isOpen, onClose, initialTab = 'lamps' }) {
  const { 
    cultivation, 
    absorbLamp, 
    anchorPalace, 
    gainReadingExp 
  } = useCultivationContext();

  const [activeTab, setActiveTab] = useState(initialTab); // 'lamps' | 'artifacts' | 'inventory'
  const [lampFilterTier, setLampFilterTier] = useState('all');
  const [artifactFilterTier, setArtifactFilterTier] = useState('all');
  const [inventoryFilterType, setInventoryFilterType] = useState('all'); // 'all' | 'lamps' | 'artifacts'

  if (!isOpen) return null;

  const is121Unlocked = cultivation?.has121st || false;
  const maxLamps = is121Unlocked ? 5 : 4;
  const absorbedLamps = cultivation?.absorbedLamps || [];
  const palaceAnchors = cultivation?.palaceAnchors || {};
  const inventoryLamps = cultivation?.inventoryLamps || [];
  const inventoryArtifacts = cultivation?.inventoryArtifacts || [];
  const anchoredIds = Object.values(palaceAnchors).map(a => a?.id || a).filter(Boolean);

  const TIER_KEYS = ['all', 'ha_pham', 'trung_pham', 'thuong_pham', 'cuc_pham', 'tien_pham', 'than_pham'];

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(5, 10, 20, 0.88)',
      backdropFilter: 'blur(12px)',
      zIndex: 1200,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px'
    }}>
      <div style={{
        background: 'linear-gradient(145deg, rgba(16, 25, 39, 0.98) 0%, rgba(10, 16, 26, 0.99) 100%)',
        border: '1.5px solid rgba(255, 204, 0, 0.4)',
        borderRadius: 20,
        width: '92vw',
        maxWidth: 1320,
        height: '90vh',
        maxHeight: 920,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 72px rgba(0, 0, 0, 0.85), 0 0 36px rgba(255, 204, 0, 0.2)',
        overflow: 'hidden',
        fontFamily: "'Noto Serif', serif"
      }}>
        
        {/* MODAL HEADER */}
        <div style={{
          padding: '18px 28px',
          borderBottom: '1px solid rgba(255, 204, 0, 0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(90deg, rgba(255, 204, 0, 0.08) 0%, transparent 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'radial-gradient(circle, rgba(255, 204, 0, 0.25) 0%, rgba(16, 25, 39, 0.8) 100%)',
              border: '1.5px solid var(--color-kim)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              boxShadow: '0 0 16px rgba(255, 204, 0, 0.3)'
            }}>
              🏛️
            </div>
            <div>
              <h2 style={{
                margin: 0,
                fontSize: 19,
                fontWeight: 800,
                color: 'var(--color-kim)',
                letterSpacing: 1,
                textShadow: '0 0 12px rgba(255, 204, 0, 0.4)'
              }}>
                TÀNG BẢO ĐIỆN · TIÊN GIA BẢO KHỐ
              </h2>
              <div style={{ fontSize: 11.5, color: 'var(--text-sub)', marginTop: 2 }}>
                Không gian chuyên biệt quản lý 72 Mệnh Đăng, Bảo Vật Trấn Áp Thiên Cung & Túi Trữ Vật
              </div>
            </div>
          </div>

          <button 
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '50%',
              width: 34,
              height: 34,
              color: 'var(--text-sub)',
              fontSize: 16,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
            title="Đóng Tàng Bảo Điện"
          >
            ✕
          </button>
        </div>

        {/* TOP TAB SWITCHER (3 CHUYÊN MỤC CHÍNH) */}
        <div style={{
          display: 'flex',
          gap: 12,
          padding: '12px 28px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(0, 0, 0, 0.25)'
        }}>
          <button
            onClick={() => setActiveTab('lamps')}
            style={{
              flex: 1,
              padding: '10px 16px',
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
                ? 'linear-gradient(135deg, rgba(255, 204, 0, 0.25) 0%, rgba(245, 158, 11, 0.15) 100%)' 
                : 'rgba(255, 255, 255, 0.03)',
              border: activeTab === 'lamps' ? '1.5px solid var(--color-kim)' : '1px solid rgba(255, 255, 255, 0.08)',
              color: activeTab === 'lamps' ? 'var(--color-kim)' : 'var(--text-sub)',
              boxShadow: activeTab === 'lamps' ? '0 0 16px rgba(255, 204, 0, 0.2)' : 'none'
            }}
          >
            <span>🏮 TẾ ĐÀN MỆNH ĐĂNG</span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(0,0,0,0.4)', color: '#fff' }}>
              {absorbedLamps.length}/{maxLamps}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('artifacts')}
            style={{
              flex: 1,
              padding: '10px 16px',
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
                ? 'linear-gradient(135deg, rgba(34, 195, 240, 0.25) 0%, rgba(6, 182, 212, 0.15) 100%)' 
                : 'rgba(255, 255, 255, 0.03)',
              border: activeTab === 'artifacts' ? '1.5px solid var(--accent-cyan-bright, #22c3f0)' : '1px solid rgba(255, 255, 255, 0.08)',
              color: activeTab === 'artifacts' ? 'var(--accent-cyan-bright, #22c3f0)' : 'var(--text-sub)',
              boxShadow: activeTab === 'artifacts' ? '0 0 16px rgba(34, 195, 240, 0.2)' : 'none'
            }}
          >
            <span>🛡️ BẢO KHỐ TRẤN ÁP</span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(0,0,0,0.4)', color: '#fff' }}>
              {Object.keys(palaceAnchors).length}/7 CUNG
            </span>
          </button>

          <button
            onClick={() => setActiveTab('inventory')}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: 10,
              fontSize: 13,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'all 0.2s ease',
              background: activeTab === 'inventory' 
                ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.25) 0%, rgba(255, 63, 213, 0.15) 100%)' 
                : 'rgba(255, 255, 255, 0.03)',
              border: activeTab === 'inventory' ? '1.5px solid var(--color-cuc-canh, #ff3fd5)' : '1px solid rgba(255, 255, 255, 0.08)',
              color: activeTab === 'inventory' ? 'var(--color-cuc-canh, #ff3fd5)' : 'var(--text-sub)',
              boxShadow: activeTab === 'inventory' ? '0 0 16px rgba(255, 63, 213, 0.2)' : 'none'
            }}
          >
            <span>🎒 TÚI TRỮ VẬT SỞ HỮU</span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: 'rgba(0,0,0,0.4)', color: '#fff' }}>
              {absorbedLamps.length + Object.keys(palaceAnchors).length + inventoryArtifacts.length}
            </span>
          </button>
        </div>

        {/* TAB 1: TẾ ĐÀN 72 MỆNH ĐĂNG */}
        {activeTab === 'lamps' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            
            {/* Tế Đàn Đài Sen Bản Mệnh (4 or 5 slots) */}
            <div style={{
              padding: '14px 28px',
              background: 'radial-gradient(circle, rgba(255, 204, 0, 0.08) 0%, transparent 80%)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ color: 'var(--color-kim)', fontWeight: 800, fontSize: 13 }}>
                  ĐÀI SEN BẢN MỆNH ({absorbedLamps.length}/{maxLamps} MỆNH ĐĂNG)
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Mỗi ngọn đèn khảm nạp tương ứng 1 Cung Thật hoàng kim trong Thiên Cung
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                {Array.from({ length: maxLamps }).map((_, idx) => {
                  const lampId = absorbedLamps[idx];
                  const lampObj = lampId ? LIFE_LAMPS.find(l => l.id === lampId) : null;
                  const isCucCanh = idx === 4;

                  return (
                    <div
                      key={idx}
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 10,
                        border: `1.5px ${lampObj ? 'solid' : 'dashed'} ${
                          lampObj 
                            ? (LAMP_TIERS[lampObj.tier]?.border || 'var(--color-kim)') 
                            : isCucCanh 
                              ? 'var(--color-cuc-canh, #ff3fd5)' 
                              : 'rgba(255, 204, 0, 0.4)'
                        }`,
                        background: lampObj ? (LAMP_TIERS[lampObj.tier]?.bg || 'rgba(255, 204, 0, 0.1)') : 'rgba(0, 0, 0, 0.3)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: lampObj ? `0 0 10px ${LAMP_TIERS[lampObj.tier]?.border || 'var(--color-kim)'}` : 'none'
                      }}
                      title={lampObj ? `${lampObj.name} (${LAMP_TIERS[lampObj.tier]?.name})` : `Slot #${idx + 1}`}
                    >
                      <span style={{ fontSize: 20 }}>{lampObj ? (lampObj.icon || '🕯️') : (isCucCanh ? '🔮' : '+')}</span>
                      <span style={{ fontSize: 8, color: lampObj ? 'var(--color-kim)' : 'var(--text-muted)', fontWeight: 700 }}>
                        {isCucCanh ? 'Cực Cảnh' : `#${idx + 1}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tier Filter Bar */}
            <div style={{ padding: '8px 28px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', gap: 8, overflowX: 'auto' }}>
              {TIER_KEYS.map(tKey => (
                <button
                  key={tKey}
                  onClick={() => setLampFilterTier(tKey)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: lampFilterTier === tKey ? 'var(--color-kim)' : 'rgba(255, 255, 255, 0.05)',
                    color: lampFilterTier === tKey ? '#000' : 'var(--text-sub)',
                    border: 'none'
                  }}
                >
                  {tKey === 'all' ? 'Toàn Bộ 72 Đèn' : (LAMP_TIERS[tKey]?.name || tKey)}
                </button>
              ))}
            </div>

            {/* Lamp Grid */}
            <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {LIFE_LAMPS
                .filter(l => lampFilterTier === 'all' || l.tier === lampFilterTier)
                .map(lamp => {
                  const isAbsorbed = absorbedLamps.includes(lamp.id);
                  const tierInfo = LAMP_TIERS[lamp.tier] || LAMP_TIERS.ha_pham;
                  const canAbsorb = absorbedLamps.length < maxLamps && !isAbsorbed;

                  return (
                    <div 
                      key={lamp.id}
                      style={{
                        background: 'rgba(16, 25, 39, 0.85)',
                        border: `1.5px solid ${isAbsorbed ? 'var(--color-kim)' : tierInfo.border}`,
                        borderRadius: 12,
                        padding: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 8,
                        boxShadow: isAbsorbed ? '0 0 14px rgba(255, 204, 0, 0.3)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ fontSize: 30, width: 48, height: 48, background: tierInfo.bg, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {lamp.icon || '🕯️'}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: tierInfo.color, fontWeight: 700, fontSize: 13.5 }}>{lamp.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tierInfo.name} · {lamp.shortName}</div>
                        </div>
                      </div>

                      <div style={{ fontSize: 11.5, color: 'var(--text-sub)', fontStyle: 'italic', lineHeight: 1.4 }}>
                        "{lamp.poem || lamp.desc}"
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <span style={{ fontSize: 11, color: 'var(--color-kim)' }}>{tierInfo.priceExp} Tu Vi</span>
                        {isAbsorbed ? (
                          <span style={{ fontSize: 11, color: 'var(--color-kim)', fontWeight: 800 }}>✦ ĐÃ KHẢM NẠP</span>
                        ) : (
                          <button
                            disabled={!canAbsorb}
                            onClick={() => {
                              try {
                                absorbLamp(lamp.id);
                              } catch (err) {
                                alert(err.message || 'Không thể dung hợp.');
                              }
                            }}
                            style={{
                              padding: '5px 14px',
                              borderRadius: 6,
                              fontSize: 11.5,
                              fontWeight: 700,
                              background: canAbsorb ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' : 'rgba(255, 255, 255, 0.08)',
                              color: canAbsorb ? '#000' : 'var(--text-muted)',
                              border: 'none',
                              cursor: canAbsorb ? 'pointer' : 'not-allowed'
                            }}
                          >
                            Khảm Nạp
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* TAB 2: BẢO KHỐ VẬT TRẤN ÁP (DANH SÁCH 16 BẢO VẬT) */}
        {activeTab === 'artifacts' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            
            {/* Header info */}
            <div style={{ padding: '8px 28px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', gap: 8, overflowX: 'auto' }}>
              {TIER_KEYS.map(tKey => (
                <button
                  key={tKey}
                  onClick={() => setArtifactFilterTier(tKey)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 20,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: artifactFilterTier === tKey ? 'var(--accent-cyan-bright, #22c3f0)' : 'rgba(255, 255, 255, 0.05)',
                    color: artifactFilterTier === tKey ? '#000' : 'var(--text-sub)',
                    border: 'none'
                  }}
                >
                  {tKey === 'all' ? 'Toàn Bộ Bảo Vật' : (LAMP_TIERS[tKey]?.name || tKey)}
                </button>
              ))}
            </div>

            {/* Artifact Grid */}
            <div style={{ padding: 24, overflowY: 'auto', flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
              {SUPPRESSING_ARTIFACTS
                .filter(a => artifactFilterTier === 'all' || a.tier === artifactFilterTier)
                .map(art => {
                  const isAnchored = Object.values(palaceAnchors).some(anc => anc.id === art.id);
                  const isOwned = inventoryArtifacts.includes(art.id) || isAnchored;
                  const tierInfo = LAMP_TIERS[art.tier] || LAMP_TIERS.ha_pham;

                  return (
                    <div 
                      key={art.id}
                      style={{
                        background: 'rgba(16, 25, 39, 0.85)',
                        border: `1.5px solid ${isAnchored ? 'var(--color-kim)' : isOwned ? 'var(--accent-cyan-bright, #22c3f0)' : tierInfo.border}`,
                        borderRadius: 12,
                        padding: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 8,
                        boxShadow: isAnchored ? '0 0 14px rgba(255, 204, 0, 0.3)' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', gap: 12 }}>
                        <ArtifactIcon item={art} size={48} />
                        <div style={{ flex: 1 }}>
                          <div style={{ color: tierInfo.color, fontWeight: 700, fontSize: 13.5 }}>{art.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tierInfo.name} · {art.type || 'Trấn Áp'}</div>
                        </div>
                      </div>

                      <div style={{ fontSize: 11.5, color: 'var(--text-sub)' }}>
                        {art.desc}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <span style={{ fontSize: 10.5, color: 'var(--color-kim)', fontStyle: 'italic' }}>"{art.poem}"</span>
                        {isAnchored ? (
                          <span style={{ fontSize: 11, color: 'var(--color-kim)', fontWeight: 800 }}>✦ ĐÃ TRẤN CUNG</span>
                        ) : isOwned ? (
                          <span style={{ fontSize: 11, color: 'var(--accent-cyan-bright, #22c3f0)', fontWeight: 700 }}>✓ ĐÃ CÓ TRONG TÚI</span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Chưa sở hữu</span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* TAB 3: TÚI TRỮ VẬT SỞ HỮU */}
        {activeTab === 'inventory' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: 24, overflowY: 'auto', gap: 20 }}>
            
            {/* Phân Mục 1: Mệnh Đăng Đang Khảm Nạp */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, color: 'var(--color-kim)', fontSize: 14, fontWeight: 800 }}>
                  🏮 MỆNH ĐĂNG BẢN MỆNH ĐÃ KHẢM NẠP ({absorbedLamps.length}/{maxLamps})
                </h3>
              </div>

              {absorbedLamps.length === 0 ? (
                <div style={{ padding: 16, borderRadius: 10, background: 'rgba(0,0,0,0.2)', border: '1px dashed rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
                  Chưa khảm nạp Mệnh Đăng nào. Hãy sang tab Tế Đàn để chọn Đèn.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                  {absorbedLamps.map((lampId, idx) => {
                    const lobj = LIFE_LAMPS.find(l => l.id === lampId);
                    const tierInfo = lobj ? LAMP_TIERS[lobj.tier] : LAMP_TIERS.ha_pham;
                    return (
                      <div key={lampId} style={{ padding: 12, borderRadius: 10, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255, 204, 0, 0.4)', display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{ fontSize: 28, width: 44, height: 44, borderRadius: 8, background: tierInfo?.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {lobj?.icon || '🕯️'}
                        </div>
                        <div>
                          <div style={{ color: tierInfo?.color || '#ffcc00', fontWeight: 700, fontSize: 13 }}>{lobj?.name || lampId}</div>
                          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Mệnh Đăng Cung #{idx + 1} ({tierInfo?.name})</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Phân Mục 2: Bảo Vật Đã Trấn Cung */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, color: 'var(--accent-cyan-bright, #22c3f0)', fontSize: 14, fontWeight: 800 }}>
                  🛡️ BẢO VẬT ĐÃ KHẢM NẠM TRẤN CUNG ({Object.keys(palaceAnchors).length}/7 CUNG TỰ THÂN)
                </h3>
              </div>

              {Object.keys(palaceAnchors).length === 0 ? (
                <div style={{ padding: 16, borderRadius: 10, background: 'rgba(0,0,0,0.2)', border: '1px dashed rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
                  Chưa có Cung Tự Thân nào được khảm nạm Bảo Vật Trấn Áp.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                  {Object.entries(palaceAnchors).map(([pIdx, anchor]) => {
                    const artObj = SUPPRESSING_ARTIFACTS.find(a => a.id === anchor.id) || anchor;
                    const tierInfo = LAMP_TIERS[artObj.tier] || LAMP_TIERS.ha_pham;
                    return (
                      <div key={pIdx} style={{ padding: 12, borderRadius: 10, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(34, 195, 240, 0.4)', display: 'flex', gap: 12, alignItems: 'center' }}>
                        <ArtifactIcon item={artObj} size={44} />
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

            {/* Phân Mục 3: Bảo Vật Trong Túi Trữ Vật Sẵn Sàng Khảm Nạm */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, color: 'var(--color-cuc-canh, #ff3fd5)', fontSize: 14, fontWeight: 800 }}>
                  🎒 BẢO VẬT TRONG TÚI TRỮ VẬT (SẴN SÀNG KHẢM NẠM: {inventoryArtifacts.filter(id => !anchoredIds.includes(id)).length})
                </h3>
              </div>

              {inventoryArtifacts.filter(id => !anchoredIds.includes(id)).length === 0 ? (
                <div style={{ padding: 16, borderRadius: 10, background: 'rgba(0,0,0,0.2)', border: '1px dashed rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
                  Túi trữ vật chưa có thêm bảo vật nào sẵn sàng. Hãy đọc thêm truyện để nhặt bảo vật!
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                  {inventoryArtifacts
                    .filter(id => !anchoredIds.includes(id))
                    .map(artId => {
                      const artObj = SUPPRESSING_ARTIFACTS.find(a => a.id === artId);
                      if (!artObj) return null;
                      const tierInfo = LAMP_TIERS[artObj.tier] || LAMP_TIERS.ha_pham;
                      return (
                        <div key={artId} style={{ padding: 12, borderRadius: 10, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255, 63, 213, 0.4)', display: 'flex', gap: 12, alignItems: 'center' }}>
                          <ArtifactIcon item={artObj} size={44} />
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
