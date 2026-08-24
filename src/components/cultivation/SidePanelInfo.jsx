import React, { useState, useEffect } from 'react';
import { useCultivationContext } from '../../context/CultivationContext';
import { 
  TRUC_CO_KHIEU_THRESHOLDS, 
  NGUNG_KHI_THRESHOLDS,
  HAI_SON_QUYET_LAYERS,
  HOA_HAI_KINH_LAYERS,
  getExpForPhapKhieuIndex,
  LIFE_LAMPS, 
  LAMP_TIERS, 
  SUPPRESSING_ARTIFACTS, 
  getCombatPowerDisplay,
  getPalaceCost,
  getLampPalaceName
} from '../../lib/cultivation';
import { useNavigate } from 'react-router-dom';

export default function SidePanelInfo() {
  const navigate = useNavigate();
  const { 
    cultivation, 
    selectedNode, 
    gainReadingExp,
    absorbLamp,
    unlockNextPhapKhieu,
    khaiKhieu,
    attempt121Breakthrough,
    breakthroughToTrucCo,
    breakthroughToKimDan,
    activateKimDanTrialV2,
    endKimDanTrialV2,
    thangCung,
    manifestDaoAnh,
    injectThienMenh,
    attemptTribulationAll,
    fillAllDaoAnhThienMenh,
    resetCultivation,
    activeRealmView,
    setActiveRealmView,
    activeMeridian,
    setActiveMeridian,
    anchorArtifactToPalace,
    setNgungKhiPath,
    galleryModalOpen,
    setGalleryModalOpen,
    setDaoAnhStrategy,
    anchorPalace,
    anchorModalPalace,
    setAnchorModalPalace
  } = useCultivationContext();

  const [activeModal, setActiveModal] = useState(null); // 'lamps' | 'artifacts' | 'inventory' | null
  const [ngungKhiPanelTab, setNgungKhiPanelTab] = useState(cultivation?.ngungKhiActivePath || 'the');

  useEffect(() => {
    if (cultivation?.ngungKhiActivePath) {
      setNgungKhiPanelTab(cultivation.ngungKhiActivePath);
    }
  }, [cultivation?.ngungKhiActivePath]);

  const currentRealm = cultivation?.realm || 'truc_co';
  const realm = activeRealmView || currentRealm;
  const exp = cultivation?.totalExp || cultivation?.expCurrentRealm || 0;
  const openedCount = cultivation?.phapKhieu !== undefined ? cultivation.phapKhieu : 0;
  const is121Unlocked = cultivation?.has121st || false;
  const absorbedLamps = cultivation?.absorbedLamps || [];
  const maxLamps = is121Unlocked ? 5 : 4;
  const isKimDanTrial = cultivation?.isKimDanTrialV2 || false;
  const realizedThienCung = cultivation?.realizedThienCung || 0;
  const palaceAnchors = cultivation?.palaceAnchors || {};

  // Lục Đại Tinh Tọa (6 Chòm Sao Trúc Cơ)
  const kimNguuCount = Math.min(28, Math.max(0, openedCount));
  const boCapCount = Math.min(22, Math.max(0, openedCount - 28));
  const nhanMaCount = Math.min(21, Math.max(0, openedCount - 50));
  const suTuCount = Math.min(20, Math.max(0, openedCount - 71));
  const bachDuongCount = Math.min(15, Math.max(0, openedCount - 91));
  const thienBinhCount = Math.min(14, Math.max(0, openedCount - 106));

  // Ngưng Khí Dual Path Variables
  const theExp = cultivation?.ngungKhiTheExp !== undefined ? cultivation.ngungKhiTheExp : (exp || 0);
  const phapExp = cultivation?.ngungKhiPhapExp !== undefined ? cultivation.ngungKhiPhapExp : (exp || 0);
  const activePath = cultivation?.ngungKhiActivePath || ngungKhiPanelTab || 'the';

  let theLvl = 1;
  for (let lvl = 10; lvl >= 1; lvl--) {
    if (theExp >= (NGUNG_KHI_THRESHOLDS[lvl - 1] || 0)) {
      theLvl = lvl;
      break;
    }
  }
  const isTheMax = theExp >= 4500;
  const theStartExp = NGUNG_KHI_THRESHOLDS[theLvl - 1] || 0;
  const theTargetExp = NGUNG_KHI_THRESHOLDS[theLvl] || 4500;
  const theCost = theTargetExp - theStartExp;
  const theProg = isTheMax ? theCost : Math.max(0, Math.min(theCost, theExp - theStartExp));
  const thePercent = isTheMax ? 100 : Math.min(100, Math.round((theProg / theCost) * 100 * 10) / 10);
  const hasTiger = theLvl >= 7;

  let phapLvl = 1;
  for (let lvl = 10; lvl >= 1; lvl--) {
    if (phapExp >= (NGUNG_KHI_THRESHOLDS[lvl - 1] || 0)) {
      phapLvl = lvl;
      break;
    }
  }
  const isPhapMax = phapExp >= 4500;
  const phapStartExp = NGUNG_KHI_THRESHOLDS[phapLvl - 1] || 0;
  const phapTargetExp = NGUNG_KHI_THRESHOLDS[phapLvl] || 4500;
  const phapCost = phapTargetExp - phapStartExp;
  const phapProg = isPhapMax ? phapCost : Math.max(0, Math.min(phapCost, phapExp - phapStartExp));
  const phapPercent = isPhapMax ? 100 : Math.min(100, Math.round((phapProg / phapCost) * 100 * 10) / 10);
  const hasWhale = phapLvl >= 7;

  const isBothMax = isTheMax && isPhapMax;
  const canBreakthrough = isTheMax || isPhapMax;

  // Next Node Info
  const nextIndex = openedCount + 1;
  const isMax120 = openedCount >= 120;
  const prevCumulative = TRUC_CO_KHIEU_THRESHOLDS[openedCount] || 0;
  const nextCumulative = TRUC_CO_KHIEU_THRESHOLDS[nextIndex] || 0;
  const nextNodeCost = getExpForPhapKhieuIndex(nextIndex);
  const currentKhieuExp = Math.max(0, exp - prevCumulative);
  const canUnlockNext = !isMax120 && exp >= nextCumulative;
  const khieuProgressPercent = Math.min(100, Math.floor((currentKhieuExp / nextNodeCost) * 100));

  const getNodeElement = (idx) => {
    if (idx <= 20) return 'Kim';
    if (idx <= 40) return 'Hỏa';
    if (idx <= 60) return 'Hỏa';
    if (idx <= 80) return 'Kim';
    if (idx <= 100) return 'Mộc';
    if (idx <= 120) return 'Thủy';
    return 'Hỗn Nguyên';
  };

  const currentDisplayNode = selectedNode || {
    index: isMax120 ? 120 : nextIndex,
    name: isMax120 ? '✦ Trúc Cơ Đại Viên Mãn' : `Pháp Khiếu #${nextIndex} (Kế Tiếp)`,
    category: 'Đạo Cơ Kinh Lạc',
    element: getNodeElement(isMax120 ? 120 : nextIndex),
    color: 'var(--color-kim)',
    cost: nextNodeCost
  };

  // Tính chuẩn xác Chiến Lực theo Cảnh Giới THỰC TẾ của nhân vật (currentRealm)
  const calculatedCombatPower = getCombatPowerDisplay(cultivation);

  // 1. KHAI MỞ KHIẾU TIẾP THEO
  const handleKhaiKhieu = () => {
    if (canUnlockNext) {
      try {
        const fn = unlockNextPhapKhieu || khaiKhieu;
        if (fn) fn();
      } catch (err) {
        alert(err.message || 'Chưa thể xung kích khiếu!');
      }
    }
  };

  // 3. TẢN TU VI (RESET)
  const handleTanTuVi = () => {
    const isConfirmed = window.confirm(
      '☠️ TẢN ĐI TOÀN BỘ TU VI (HÓA PHÀM TRÙNG TU):\n\n' +
      '• Toàn bộ Pháp Khiếu, Mệnh Đăng, Thiên Cung và Đạo Cơ sẽ bị XÓA SẠCH!\n' +
      '• Đạo hữu sẽ quay trở lại làm Phàm Nhân ở tầng Ngưng Khí sơ khai để tu luyện lại từ đầu.\n\n' +
      'Đạo hữu có chắc chắn muốn Tản Tu Vi không?'
    );
    if (isConfirmed) {
      resetCultivation();
    }
  };

  return (
    <div className="side-panel-info">
      
      {/* ========================================================
          KHỐI THÔNG TIN TIÊN ĐẠO THỐNG NHẤT (3 CHỈ SỐ: TU VI - CHIẾN LỰC - TIÊN TINH CĂN GIỮA)
         ======================================================== */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(16, 25, 39, 0.95) 0%, rgba(10, 16, 26, 0.98) 100%)',
        border: '1px solid rgba(255, 204, 0, 0.4)',
        borderRadius: 12,
        padding: '10px 14px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6), inset 0 0 12px rgba(255, 204, 0, 0.08)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14
      }}>
        {/* 1. Tu Vi */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', textAlign: 'center', flex: 1 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: 'var(--text-muted)', textTransform: 'uppercase' }}>TU VI</span>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 13.5, fontWeight: 800, color: 'var(--color-kim)' }}>
            {exp.toLocaleString()} EXP
          </span>
        </div>

        <div style={{ width: 1, height: 24, background: 'linear-gradient(to bottom, transparent, rgba(34, 195, 240, 0.35), transparent)' }} />

        {/* 2. Chiến Lực */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', textAlign: 'center', flex: 1 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: 'var(--text-muted)', textTransform: 'uppercase' }}>CHIẾN LỰC</span>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 13.5, fontWeight: 800, color: 'var(--accent-cyan-bright, #22c3f0)' }}>
            {calculatedCombatPower}
          </span>
        </div>

        <div style={{ width: 1, height: 24, background: 'linear-gradient(to bottom, transparent, rgba(34, 195, 240, 0.35), transparent)' }} />

        {/* 3. Tiên Tinh */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', textAlign: 'center', flex: 1 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: 'var(--text-muted)', textTransform: 'uppercase' }}>TIÊN TINH</span>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 13.5, fontWeight: 800, color: 'var(--color-kim)' }}>
            {(cultivation?.tienTinh || 0).toLocaleString()} TT
          </span>
        </div>
      </div>

      {/* ========================================================
          1. NGƯNG KHÍ VIEW — HAI CON ĐƯỜNG: LUYỆN THỂ & PHÁP TU & SONG TU
         ======================================================== */}
      {realm === 'ngung_khi' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* TAB SELECTOR CÔNG PHÁP NGƯNG KHÍ */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 6,
              padding: 3,
              borderRadius: 10,
              background: 'rgba(10, 16, 26, 0.95)',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              <button
                onClick={() => {
                  setNgungKhiPanelTab('the');
                  if (setNgungKhiPath) setNgungKhiPath('the');
                }}
                style={{
                  padding: '7px 6px',
                  borderRadius: 8,
                  fontSize: 10.5,
                  fontWeight: 800,
                  border: 'none',
                  cursor: 'pointer',
                  background: ngungKhiPanelTab === 'the' ? 'linear-gradient(135deg, #ef4444, #b91c1c)' : 'transparent',
                  color: ngungKhiPanelTab === 'the' ? '#ffffff' : '#94a3b8',
                  boxShadow: ngungKhiPanelTab === 'the' ? '0 0 12px rgba(239, 68, 68, 0.6)' : 'none'
                }}
              >
                ⚔️ Hải Sơn Quyết
              </button>

              <button
                onClick={() => {
                  setNgungKhiPanelTab('phap');
                  if (setNgungKhiPath) setNgungKhiPath('phap');
                }}
                style={{
                  padding: '7px 6px',
                  borderRadius: 8,
                  fontSize: 10.5,
                  fontWeight: 800,
                  border: 'none',
                  cursor: 'pointer',
                  background: ngungKhiPanelTab === 'phap' ? 'linear-gradient(135deg, #06b6d4, #0369a1)' : 'transparent',
                  color: ngungKhiPanelTab === 'phap' ? '#ffffff' : '#94a3b8',
                  boxShadow: ngungKhiPanelTab === 'phap' ? '0 0 12px rgba(6, 182, 212, 0.6)' : 'none'
                }}
              >
                🌊 Hóa Hải Kinh
              </button>
            </div>

            {/* TRẠNG THÁI ĐANG TU LUYỆN */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 12px',
              borderRadius: 8,
              background: 'rgba(0, 0, 0, 0.35)',
              border: `1px solid ${ngungKhiPanelTab === 'the' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(6, 182, 212, 0.2)'}`,
              fontSize: 10.5
            }}>
              <span style={{ color: '#94a3b8' }}>Đang nạp tu vi khi đọc:</span>
              <span style={{
                fontWeight: 800,
                color: activePath === 'the' ? '#f87171' : '#38bdf8',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}>
                {activePath === 'the' ? '⚔️ Hải Sơn Quyết' : '🌊 Hóa Hải Kinh'}
              </span>
            </div>

            {/* TAB 1: LUYỆN THỂ — HẢI SƠN QUYẾT */}
            {ngungKhiPanelTab === 'the' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* THẺ TỔNG QUAN HẢI SƠN QUYẾT */}
                <div style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(30, 10, 10, 0.95) 0%, rgba(15, 6, 6, 0.98) 100%)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: '#f87171' }}>
                      ⚔️ HẢI SƠN QUYẾT (LUYỆN THỂ)
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: isTheMax ? 'rgba(251, 191, 36, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      border: `1px solid ${isTheMax ? '#fbbf24' : '#ef4444'}`,
                      color: isTheMax ? '#fde047' : '#f87171'
                    }}>
                      {isTheMax ? '👑 10 TẦNG VIÊN MÃN' : `TẦNG ${theLvl}/10`}
                    </span>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 6,
                    background: 'rgba(0, 0, 0, 0.35)',
                    padding: '7px 9px',
                    borderRadius: 8
                  }}>
                    <div>
                      <div style={{ fontSize: 9, color: '#94a3b8' }}>KHÍ HUYẾT</div>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#fca5a5', marginTop: 1 }}>
                        {HAI_SON_QUYET_LAYERS[theLvl - 1]?.desc || '1 Hổ Khí Huyết'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: '#94a3b8' }}>EXP KHÍ HUYẾT</div>
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: '#fbbf24', marginTop: 1 }}>
                        {theExp.toLocaleString()} / 4,500 EXP
                      </div>
                    </div>
                  </div>

                  {/* Thanh Tiến Độ */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#cbd5e1', marginBottom: 4 }}>
                      <span>Tiến độ Tầng {theLvl}:</span>
                      <strong style={{ color: '#f87171' }}>
                        {isTheMax ? '4,500/4,500 EXP (100%)' : `${theProg.toLocaleString()}/${theCost.toLocaleString()} EXP (${thePercent}%)`}
                      </strong>
                    </div>
                    <div style={{ height: 6, background: 'rgba(0,0,0,0.5)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${thePercent}%`,
                        background: 'linear-gradient(90deg, #ef4444, #f97316)',
                        boxShadow: '0 0 8px rgba(239, 68, 68, 0.8)',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                    {hasTiger && (
                      <div style={{ fontSize: 9.5, color: '#fca5a5', marginTop: 4, fontWeight: 700 }}>
                        🔥 Dị tượng đã mở: <strong>Huyết Hổ Hóa Hình (Khí Huyết Hóa Ảnh)</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* BẢNG 10 TẦNG HẢI SƠN QUYẾT */}
                <div style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: 'rgba(10, 16, 26, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5
                }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#cbd5e1', marginBottom: 2 }}>
                    📜 LỘ TRÌNH HẢI SƠN QUYẾT (1 HỔ → 1 BẠT)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                    {HAI_SON_QUYET_LAYERS.map(layer => {
                      const isReached = theExp >= layer.target;
                      const isCurrent = !isReached && (layer.level === 1 || theExp >= NGUNG_KHI_THRESHOLDS[layer.level - 1]);
                      return (
                        <div
                          key={layer.level}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '4px 6px',
                            borderRadius: 6,
                            background: isCurrent ? 'rgba(239, 68, 68, 0.15)' : isReached ? 'rgba(16, 185, 129, 0.08)' : 'rgba(0, 0, 0, 0.25)',
                            border: `1px solid ${isCurrent ? '#ef4444' : isReached ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.04)'}`
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                            <span style={{ fontSize: 8.5, fontWeight: 800, padding: '1px 3px', borderRadius: 3, background: isReached ? '#10b981' : isCurrent ? '#ef4444' : '#334155', color: '#fff' }}>
                              T{layer.level}
                            </span>
                            <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                              <div style={{ fontSize: 9.5, fontWeight: isCurrent || isReached ? 700 : 500, color: isReached ? '#a7f3d0' : isCurrent ? '#fca5a5' : '#64748b' }}>
                                {layer.name} {layer.hasPhantom ? '🐯' : ''}
                              </div>
                              <div style={{ fontSize: 8, color: '#94a3b8' }}>{layer.target} EXP</div>
                            </div>
                          </div>
                          <span style={{ fontSize: 9, fontWeight: 700 }}>
                            {isReached ? <span style={{ color: '#34d399' }}>✓</span> : isCurrent ? <span style={{ color: '#ef4444' }}>⚡</span> : <span style={{ color: '#475569' }}>🔒</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: PHÁP TU — HÓA HẢI KINH */}
            {ngungKhiPanelTab === 'phap' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* THẺ TỔNG QUAN HÓA HẢI KINH */}
                <div style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(6, 30, 48, 0.95) 0%, rgba(3, 15, 26, 0.98) 100%)',
                  border: '1px solid rgba(6, 182, 212, 0.35)',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: '#38bdf8' }}>
                      🌊 HÓA HẢI KINH (PHÁP TU)
                    </span>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: isPhapMax ? 'rgba(251, 191, 36, 0.15)' : 'rgba(6, 182, 212, 0.15)',
                      border: `1px solid ${isPhapMax ? '#fbbf24' : '#06b6d4'}`,
                      color: isPhapMax ? '#fde047' : '#38bdf8'
                    }}>
                      {isPhapMax ? '👑 10 TẦNG VIÊN MÃN' : `TẦNG ${phapLvl}/10`}
                    </span>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 6,
                    background: 'rgba(0, 0, 0, 0.35)',
                    padding: '7px 9px',
                    borderRadius: 8
                  }}>
                    <div>
                      <div style={{ fontSize: 9, color: '#94a3b8' }}>LINH LỰC</div>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#7dd3fc', marginTop: 1 }}>
                        {HOA_HAI_KINH_LAYERS[phapLvl - 1]?.desc || '1 Lãng Linh Khí'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: '#94a3b8' }}>EXP LINH LỰC</div>
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: '#fbbf24', marginTop: 1 }}>
                        {phapExp.toLocaleString()} / 4,500 EXP
                      </div>
                    </div>
                  </div>

                  {/* Thanh Tiến Độ */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#cbd5e1', marginBottom: 4 }}>
                      <span>Tiến độ Tầng {phapLvl}:</span>
                      <strong style={{ color: '#38bdf8' }}>
                        {isPhapMax ? '4,500/4,500 EXP (100%)' : `${phapProg.toLocaleString()}/${phapCost.toLocaleString()} EXP (${phapPercent}%)`}
                      </strong>
                    </div>
                    <div style={{ height: 6, background: 'rgba(0,0,0,0.5)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${phapPercent}%`,
                        background: 'linear-gradient(90deg, #06b6d4, #3b82f6)',
                        boxShadow: '0 0 8px rgba(6, 182, 212, 0.8)',
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                    {hasWhale && (
                      <div style={{ fontSize: 9.5, color: '#7dd3fc', marginTop: 4, fontWeight: 700 }}>
                        🌊 Dị tượng đã mở: <strong>Cấm Hải Long Kình (Linh Hải Hóa Kình)</strong>
                      </div>
                    )}
                  </div>
                </div>

                {/* BẢNG 10 TẦNG HÓA HẢI KINH */}
                <div style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: 'rgba(10, 16, 26, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5
                }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, color: '#cbd5e1', marginBottom: 2 }}>
                    📜 LỘ TRÌNH HÓA HẢI KINH (1 LÃNG → 1 CẤM HẢI)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                    {HOA_HAI_KINH_LAYERS.map(layer => {
                      const isReached = phapExp >= layer.target;
                      const isCurrent = !isReached && (layer.level === 1 || phapExp >= NGUNG_KHI_THRESHOLDS[layer.level - 1]);
                      return (
                        <div
                          key={layer.level}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '4px 6px',
                            borderRadius: 6,
                            background: isCurrent ? 'rgba(6, 182, 212, 0.15)' : isReached ? 'rgba(16, 185, 129, 0.08)' : 'rgba(0, 0, 0, 0.25)',
                            border: `1px solid ${isCurrent ? '#06b6d4' : isReached ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.04)'}`
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
                            <span style={{ fontSize: 8.5, fontWeight: 800, padding: '1px 3px', borderRadius: 3, background: isReached ? '#10b981' : isCurrent ? '#06b6d4' : '#334155', color: '#fff' }}>
                              T{layer.level}
                            </span>
                            <div style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                              <div style={{ fontSize: 9.5, fontWeight: isCurrent || isReached ? 700 : 500, color: isReached ? '#a7f3d0' : isCurrent ? '#7dd3fc' : '#64748b' }}>
                                {layer.name} {layer.hasPhantom ? '🐋' : ''}
                              </div>
                              <div style={{ fontSize: 8, color: '#94a3b8' }}>{layer.target} EXP</div>
                            </div>
                          </div>
                          <span style={{ fontSize: 9, fontWeight: 700 }}>
                            {isReached ? <span style={{ color: '#34d399' }}>✓</span> : isCurrent ? <span style={{ color: '#06b6d4' }}>⚡</span> : <span style={{ color: '#475569' }}>🔒</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* NÚT ĐỘT PHÁ TRÚC CƠ THÔNG MINH */}
            {canBreakthrough ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                <button 
                  className="cult-action-btn gold" 
                  onClick={() => {
                    try {
                      breakthroughToTrucCo();
                      setActiveRealmView('truc_co');
                    } catch (e) {
                      alert(e.message || 'Chưa đủ tu vi đột phá Trúc Cơ!');
                    }
                  }}
                  style={{
                    width: '100%',
                    maxWidth: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 8px',
                    fontSize: 11.5,
                    fontWeight: 900,
                    background: isBothMax ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' : (isTheMax ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)'),
                    color: isBothMax ? '#000000' : '#ffffff',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: isBothMax ? '0 0 22px rgba(251, 191, 36, 0.8)' : (isTheMax ? '0 0 18px rgba(239, 68, 68, 0.7)' : '0 0 18px rgba(56, 189, 248, 0.7)'),
                    letterSpacing: 0.3,
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    lineHeight: 1.35,
                    textAlign: 'center'
                  }}
                >
                  {isBothMax ? '👑 ĐỘT PHÁ TRÚC CƠ (THỂ PHÁP SONG TU VIÊN MÃN)' : `⚡ ĐỘT PHÁ TRÚC CƠ (${isTheMax ? 'HẢI SƠN QUYẾT' : 'HÓA HẢI KINH'} VIÊN MÃN)`}
                </button>

                {isBothMax ? (
                  <div style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: 'rgba(251, 191, 36, 0.12)',
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                    fontSize: 9.5,
                    color: '#fde047',
                    lineHeight: 1.4,
                    textAlign: 'center'
                  }}>
                    👑 <strong>Thể Pháp Song Tuyệt</strong>: Giảm 15% Tu Vi mở 120 Pháp Khiếu + Tăng 20% Tốc độ tu luyện vĩnh viễn!
                  </div>
                ) : (
                  <div style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    fontSize: 9.5,
                    color: '#94a3b8',
                    lineHeight: 1.4,
                    textAlign: 'center'
                  }}>
                    💡 <em>Gợi ý: Đạo hữu có thể tu luyện nốt nhánh còn lại lên 10 tầng để nhận đại đặc quyền <strong>Thể Pháp Song Tuyệt</strong> trước khi Trúc Cơ!</em>
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px dashed rgba(255, 255, 255, 0.12)',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 10.5,
                lineHeight: 1.4
              }}>
                🔒 Cần tích lũy đủ <strong>4,500 EXP (10 Tầng Viên Mãn)</strong> ở Hải Sơn Quyết hoặc Hóa Hải Kinh để mở khóa Đột Phá Trúc Cơ!
              </div>
            )}
          </div>
        )}

      {/* ========================================================
          2. TRÚC CƠ VIEW
         ======================================================== */}
      {realm === 'truc_co' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Card Thông Tin Khiếu Hiện Tại / Kế Tiếp */}
          <div style={{
            padding: '14px 16px',
            borderRadius: 12,
            background: 'linear-gradient(145deg, rgba(16, 25, 39, 0.95) 0%, rgba(10, 16, 26, 0.98) 100%)',
            border: '1.5px solid rgba(251, 191, 36, 0.35)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4), inset 0 0 12px rgba(251, 191, 36, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: 8 }}>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--color-kim)', letterSpacing: 0.5 }}>
                {currentDisplayNode.name}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(34, 195, 240, 0.12)', border: '1px solid rgba(34, 195, 240, 0.3)', color: 'var(--accent-cyan-bright, #22c3f0)' }}>
                {currentDisplayNode.category}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: 9.5, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 0.5 }}>NGŨ HÀNH</div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#f0f6fc', marginTop: 2 }}>
                  {currentDisplayNode.element === 'Kim' ? '⚡ Canh Kim' :
                   currentDisplayNode.element === 'Mộc' ? '🌿 Ất Mộc' :
                   currentDisplayNode.element === 'Thủy' ? '🌊 Quý Thủy' :
                   currentDisplayNode.element === 'Hỏa' ? '🔥 Bính Hỏa' :
                   currentDisplayNode.element === 'Thổ' ? '⛰️ Mậu Thổ' :
                   currentDisplayNode.element || '✨ Đạo Cơ'}
                </div>
              </div>
              <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: 9.5, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 0.5 }}>TU VI CẦN</div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--color-kim)', marginTop: 2 }}>
                  {currentDisplayNode.cost ? `${currentDisplayNode.cost.toLocaleString()} EXP` : 'Đã Mở ✓'}
                </div>
              </div>
            </div>

            {/* Thanh tiến độ nạp linh lực từng Pháp Khiếu */}
            {!isMax120 && (
              <div style={{ marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-sub)', marginBottom: 4 }}>
                  <span>Tiến độ nạp linh lực:</span>
                  <strong style={{ color: canUnlockNext ? 'var(--color-kim)' : 'var(--accent-cyan-bright, #22c3f0)' }}>
                    {Math.min(nextNodeCost, currentKhieuExp)}/{nextNodeCost} EXP ({khieuProgressPercent}%)
                  </strong>
                </div>
                <div style={{ height: 6, background: 'rgba(0,0,0,0.5)', borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{
                    height: '100%',
                    width: `${khieuProgressPercent}%`,
                    background: canUnlockNext ? 'linear-gradient(90deg, #fbbf24, #f59e0b)' : 'linear-gradient(90deg, #06b6d4, #3b82f6)',
                    boxShadow: canUnlockNext ? '0 0 8px rgba(251, 191, 36, 0.8)' : 'none',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', width: '100%' }}>
            {!isMax120 ? (
              <button
                onClick={handleKhaiKhieu}
                disabled={!canUnlockNext}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 8,
                  background: canUnlockNext 
                    ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' 
                    : 'rgba(255, 255, 255, 0.05)',
                  border: canUnlockNext ? '1px solid #fef08a' : '1px solid rgba(255, 255, 255, 0.1)',
                  color: canUnlockNext ? '#000' : 'var(--text-muted)',
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: canUnlockNext ? 'pointer' : 'not-allowed',
                  boxShadow: canUnlockNext ? '0 0 18px rgba(251, 191, 36, 0.5)' : 'none',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  letterSpacing: 0.5
                }}
              >
                <span>⚡</span>
                <span>{canUnlockNext ? `XUNG KÍCH KHAI MỞ KHIẾU #${nextIndex}` : `CHƯA ĐỦ TU VI ĐỂ XUNG KÍCH KHIẾU #${nextIndex}`}</span>
              </button>
            ) : (
              !is121Unlocked && (
                <button
                  onClick={() => {
                    try {
                      const fn = attempt121Breakthrough;
                      if (fn) {
                        const res = fn();
                        if (res && res.message) {
                          alert(res.message);
                        }
                      }
                    } catch (e) {
                      alert(e.message || 'Chưa thể xung kích Cực Cảnh 121!');
                    }
                  }}
                  style={{
                    flex: 1.5,
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
                    border: '1px solid #d8b4fe',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 0 16px rgba(168, 85, 247, 0.4)',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <span>🔮</span>
                  <span>XUNG KÍCH 121</span>
                </button>
              )
            )}
          </div>

          {/* Đột Phá Kim Đan */}
          {openedCount >= 30 && (
            <button 
              onClick={() => {
                try {
                  breakthroughToKimDan();
                  setActiveRealmView('kim_dan');
                } catch (e) {
                  alert(e.message || 'Chưa đủ điều kiện Đột Phá Kim Đan!');
                }
              }}
              style={{
                width: '100%',
                padding: '11px 16px',
                borderRadius: 8,
                background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(217, 119, 6, 0.25) 100%)',
                border: '1.5px solid var(--color-kim)',
                color: 'var(--color-kim)',
                fontSize: 12.5,
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 0 14px rgba(251, 191, 36, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 0.2s ease'
              }}
            >
              <span>✨</span>
              <span>ĐỘT PHÁ KIM ĐAN CẢNH</span>
            </button>
          )}

          {/* Tế Đàn Mệnh Đăng (Dẫn đến Tàng Bảo Điện) */}
          <button 
            onClick={() => navigate('/sanctum')}
            style={{
              width: '100%',
              padding: '10px 16px',
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: 'var(--text-sub)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'all 0.2s ease'
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🏮</span>
              <span>TẾ ĐÀN MỆNH ĐĂNG</span>
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-kim)', fontWeight: 800 }}>
              {absorbedLamps.length}/{maxLamps} Mệnh Đăng
            </span>
          </button>

          {/* Khối Lục Đại Tinh Tọa */}
          <div style={{
            padding: '14px 16px',
            borderRadius: 12,
            background: 'rgba(16, 25, 39, 0.7)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                🌌 LỤC ĐẠI TINH TỌA (120 KHIẾU)
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--color-kim)', fontWeight: 800 }}>
                {openedCount}/120
              </span>
            </div>

            {[
              { id: 'all', name: 'Toàn Bộ Tinh Đồ', count: openedCount, total: 120, color: 'var(--accent-cyan-bright, #22c3f0)' },
              { id: 'kim_nguu', name: 'Kim Ngưu (Taurus)', count: kimNguuCount, total: 28, color: '#fbbf24' },
              { id: 'bo_cap', name: 'Bọ Cạp (Scorpio)', count: boCapCount, total: 22, color: '#f87171' },
              { id: 'nhan_ma', name: 'Nhân Mã (Sagittarius)', count: nhanMaCount, total: 21, color: '#fb923c' },
              { id: 'su_tu', name: 'Sư Tử (Leo)', count: suTuCount, total: 20, color: '#facc15' },
              { id: 'bach_duong', name: 'Bạch Dương (Aries)', count: bachDuongCount, total: 15, color: '#4ade80' },
              { id: 'thien_binh', name: 'Thiên Bình (Libra)', count: thienBinhCount, total: 14, color: '#38bdf8' }
            ].map(constel => {
              const isAct = activeMeridian === constel.id;
              const isCompleted = constel.count === constel.total;

              return (
                <button
                  key={constel.id}
                  onClick={() => setActiveMeridian(activeMeridian === constel.id ? 'all' : constel.id)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: isAct ? 'rgba(34, 195, 240, 0.15)' : 'rgba(0, 0, 0, 0.3)',
                    border: `1px solid ${isAct ? 'var(--accent-cyan-bright, #22c3f0)' : 'rgba(255, 255, 255, 0.06)'}`,
                    color: isAct ? '#fff' : 'var(--text-sub)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: isAct ? 700 : 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: constel.color, display: 'inline-block' }} />
                    <span>{constel.name}</span>
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: isCompleted ? 'var(--color-kim)' : 'var(--text-muted)' }}>
                    {constel.count}/{constel.total} {isCompleted ? '✦' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================
          3. KIM ĐAN VIEW
         ======================================================== */}
      {realm === 'kim_dan' && (() => {
        const maxThienCung = cultivation?.maxThienCung || 13;
        const absorbedLamps = cultivation?.absorbedLamps || [];
        const lampCount = absorbedLamps.length;
        const selfPalaceCount = maxThienCung - lampCount;
        const realizedThienCung = cultivation?.realizedThienCung || 0;
        const currentThienCungExp = cultivation?.currentThienCungExp || 0;
        const isAllPalacesRealized = realizedThienCung >= selfPalaceCount;
        const targetExp = getPalaceCost(realizedThienCung + 1);
        const bottleneckExp = targetExp - 1;
        const isBottleneck = currentThienCungExp >= bottleneckExp;
        const expPercent = Math.min(99.99, Math.round((currentThienCungExp / targetExp) * 100 * 100) / 100);

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Thẻ Trạng Thái Tổng Quan Kim Đan */}
            <div className="status-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <h4 style={{ color: 'var(--color-kim)', margin: 0, fontSize: 13.5 }}>THIÊN CUNG KIM ĐAN</h4>
                <span style={{ fontSize: 11, color: '#fde047', fontWeight: 800 }}>
                  {realizedThienCung + lampCount}/{maxThienCung} Cung Thật
                </span>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--text-sub)', margin: '0 0 8px', lineHeight: 1.4 }}>
                Ngưng tụ Kim Đan, khai mở cửu tầng thiên cung, nạp đủ 99.99% linh lực và khảm nạm vật trấn áp để hóa thành Cung Thật 100%.
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
                <span style={{ color: '#94a3b8' }}>Lực Chiến Kim Đan:</span>
                <strong style={{ color: 'var(--color-kim)' }}>{calculatedCombatPower}</strong>
              </div>
            </div>

            {/* DUY NHẤT: THẺ THIÊN CUNG TỰ THÂN ĐANG NẠP LINH LỰC (ACTIVE CULTIVATING PALACE) */}
            {!isAllPalacesRealized && (
              <div style={{
                padding: '16px',
                borderRadius: 14,
                background: isBottleneck 
                  ? 'linear-gradient(165deg, rgba(45, 20, 10, 0.96) 0%, rgba(15, 23, 42, 0.98) 100%)'
                  : 'linear-gradient(165deg, rgba(20, 30, 60, 0.94) 0%, rgba(10, 16, 32, 0.98) 100%)',
                border: isBottleneck ? '1.5px solid #f97316' : '1.5px solid rgba(56, 189, 248, 0.45)',
                boxShadow: isBottleneck ? '0 0 25px rgba(249, 115, 22, 0.4)' : '0 4px 20px rgba(0, 0, 0, 0.4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                position: 'relative'
              }}>
                {/* Header Thẻ Đang Mở */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 20 }}>{isBottleneck ? '⚠️' : '⚡'}</span>
                    <strong style={{ color: isBottleneck ? '#fdba74' : '#38bdf8', fontSize: 13.5, fontFamily: 'var(--font-serif)' }}>
                      Thiên Cung Tự Thân #{realizedThienCung + 1}
                    </strong>
                  </div>
                  <span style={{
                    fontSize: 10.5,
                    padding: '2px 8px',
                    borderRadius: 10,
                    fontWeight: 800,
                    color: isBottleneck ? '#fed7aa' : '#38bdf8',
                    background: isBottleneck ? 'rgba(234, 88, 12, 0.3)' : 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid ' + (isBottleneck ? '#f97316' : 'rgba(56, 189, 248, 0.4)')
                  }}>
                    {isBottleneck ? '99.99% NÚT THẮT' : 'ĐANG NẠP LINH LỰC'}
                  </span>
                </div>

                {/* Thanh Tiến Độ EXP */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 5 }}>
                    <span style={{ color: '#94a3b8' }}>Tiến độ tích lũy linh lực:</span>
                    <strong style={{ color: isBottleneck ? '#fde047' : '#38bdf8' }}>
                      {currentThienCungExp.toLocaleString()} / {targetExp.toLocaleString()} EXP ({expPercent}%)
                    </strong>
                  </div>
                  <div style={{ height: 9, background: 'rgba(0, 0, 0, 0.6)', borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
                    <div style={{
                      height: '100%',
                      width: ((currentThienCungExp / targetExp) * 100) + '%',
                      background: isBottleneck 
                        ? 'linear-gradient(90deg, #f97316, #fde047)' 
                        : 'linear-gradient(90deg, #0284c7, #38bdf8)',
                      boxShadow: isBottleneck ? '0 0 10px #f97316' : '0 0 8px #38bdf8',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>

                {/* THÔNG BÁO & NÚT KHẢM NẠM KHI ĐẠT 99.99% */}
                {isBottleneck ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
                    <div style={{
                      fontSize: 11,
                      color: '#fed7aa',
                      background: 'rgba(234, 88, 12, 0.15)',
                      padding: '9px 11px',
                      borderRadius: 8,
                      border: '1px solid rgba(249, 115, 22, 0.35)',
                      lineHeight: 1.4
                    }}>
                      👑 <strong>ĐÃ ĐẠT 99.99% LINH LỰC!</strong> Nhấp nút bên dưới để chọn một Bảo Vật trong Túi Trữ Vật khảm nạm vào Cung, hoàn tất 100% Cung Thật!
                    </div>

                    <button
                      onClick={() => {
                        if (setAnchorModalPalace) {
                          setAnchorModalPalace(realizedThienCung);
                        }
                      }}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: 8,
                        background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
                        border: '1.5px solid #fef08a',
                        color: '#000000',
                        fontWeight: 900,
                        fontSize: 13,
                        letterSpacing: 0.5,
                        cursor: 'pointer',
                        boxShadow: '0 0 20px rgba(245, 158, 11, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6
                      }}
                    >
                      👑 KHẢM NẠM BẢO VẬT (HÓA CUNG THẬT)
                    </button>
                  </div>
                ) : (
                  /* NÚT NẠP LINH LỰC NHANH KHI CHƯA ĐẦY */
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    <button
                      onClick={() => {
                        if (gainReadingExp) gainReadingExp(500);
                      }}
                      style={{
                        flex: 1,
                        padding: '9px 10px',
                        borderRadius: 8,
                        background: 'rgba(56, 189, 248, 0.12)',
                        border: '1px solid rgba(56, 189, 248, 0.4)',
                        color: '#38bdf8',
                        fontSize: 11.5,
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      🔮 Tụ Khí (+500 EXP)
                    </button>

                    <button
                      onClick={() => {
                        try {
                          if (thangCung) thangCung();
                        } catch (e) {
                          alert(e.message || 'Chưa thể thăng cung.');
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '9px 10px',
                        borderRadius: 8,
                        background: 'rgba(251, 191, 36, 0.15)',
                        border: '1px solid rgba(251, 191, 36, 0.5)',
                        color: '#fde047',
                        fontSize: 11.5,
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      ⚡ Nạp Đầy 99.99%
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* KHỐI THAI NGHÉN ĐẠO ANH (KHI TOÀN BỘ 13 CUNG ĐÃ HOÀN TẤT) */}
            {isAllPalacesRealized && (
              <div style={{
                padding: '16px',
                borderRadius: 14,
                background: 'linear-gradient(165deg, rgba(30, 18, 56, 0.92) 0%, rgba(15, 23, 42, 0.96) 100%)',
                border: '1px solid rgba(217, 70, 239, 0.45)',
                boxShadow: '0 8px 32px -4px rgba(168, 85, 247, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                boxSizing: 'border-box'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 15 }}>👑</span>
                    <span style={{ fontFamily: 'var(--font-serif)', color: '#f5d0fe', fontWeight: 800, fontSize: 12.5, letterSpacing: 0.5 }}>
                      THAI NGHÉN ĐẠO ANH
                    </span>
                  </div>
                  <span style={{
                    fontSize: 11,
                    color: (cultivation?.daoAnhExp || cultivation?.currentThienCungExp || 0) >= 10000 ? '#facc15' : '#e2e8f0',
                    fontWeight: 800,
                    background: 'rgba(0, 0, 0, 0.45)',
                    padding: '3px 8px',
                    borderRadius: 8,
                    border: '1px solid rgba(217, 70, 239, 0.3)'
                  }}>
                    {Math.min(10000, (cultivation?.daoAnhExp || cultivation?.currentThienCungExp || 0)).toLocaleString()} / 10.000
                  </span>
                </div>

                <div style={{ width: '100%', height: 8, background: 'rgba(0,0,0,0.6)', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(217, 70, 239, 0.35)' }}>
                  <div 
                    style={{ 
                      height: '100%', 
                      width: ((Math.min(10000, (cultivation?.daoAnhExp || cultivation?.currentThienCungExp || 0)) / 10000) * 100) + '%',
                      background: 'linear-gradient(90deg, #a855f7 0%, #ec4899 50%, #facc15 100%)',
                      boxShadow: '0 0 12px rgba(236, 72, 153, 0.7)',
                      borderRadius: 4,
                      transition: 'width 0.4s ease'
                    }} 
                  />
                </div>

                <div style={{
                  fontSize: 11.5,
                  color: 'var(--text-sub)',
                  lineHeight: 1.5,
                  background: 'rgba(217, 70, 239, 0.08)',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid rgba(217, 70, 239, 0.2)'
                }}>
                  ✨ Toàn bộ <strong>13 Chân Cung Thần Phẩm</strong> đã viên mãn khai mở. Khi tích lũy đủ 10.000 Tu Vi, đạo hữu có thể Hóa Sinh Đạo Anh để đột phá Nguyên Anh Kỳ!
                </div>

                {(cultivation?.daoAnhExp || cultivation?.currentThienCungExp || 0) >= 10000 ? (
                  <button
                    onClick={() => {
                      try {
                        if (manifestDaoAnh) {
                          manifestDaoAnh();
                        } else if (attemptTribulationAll) {
                          attemptTribulationAll();
                        }
                        if (setActiveRealmView) setActiveRealmView('nguyen_anh');
                      } catch (err) {
                        alert(err.message || 'Lỗi khi hóa sinh Đạo Anh!');
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '11px 14px',
                      borderRadius: 8,
                      background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 50%, #eab308 100%)',
                      border: '1px solid rgba(255, 255, 255, 0.4)',
                      color: '#ffffff',
                      fontWeight: 900,
                      fontSize: 12,
                      cursor: 'pointer',
                      boxShadow: '0 0 20px rgba(236, 72, 153, 0.6)'
                    }}
                  >
                    ⚡ HÓA ĐẠO ANH (ĐỘT PHÁ NGUYÊN ANH)
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (gainReadingExp) gainReadingExp(1000);
                    }}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 8,
                      background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.12) 0%, rgba(217, 70, 239, 0.08) 100%)',
                      border: '1px dashed rgba(217, 70, 239, 0.4)',
                      color: '#f0abfc',
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    🔮 Tụ Khí Thai Nghén (+1.000 EXP)
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })()}{/* ========================================================
          4. NGUYÊN ANH / GIẢ ANH VIEW
         ======================================================== */}
      {(realm === 'nguyen_anh' || realm === 'gia_anh') && (() => {
        const daoAnhs = cultivation?.daoAnhs || [];
        const daoAnhCount = daoAnhs.length;
        const totalPalaces = cultivation?.maxThienCung || 13;
        const totalThienMenh = cultivation?.totalThienMenh || 0;
        const currentStrategy = cultivation?.daoAnhTargetStrategy || 'auto_80';
        const maxKiepCount = daoAnhs.filter(d => (d.currentKiep || 0) >= 5).length;

        const toggleStrategy = () => {
          const next = currentStrategy === 'auto_80' ? 'auto_100' : 'auto_80';
          if (setDaoAnhStrategy) {
            setDaoAnhStrategy(next);
          } else {
            try {
              const state = JSON.parse(localStorage.getItem('cultivation_state_v1') || '{}');
              state.daoAnhTargetStrategy = next;
              localStorage.setItem('cultivation_state_v1', JSON.stringify(state));
              window.dispatchEvent(new CustomEvent('cultivation_updated', { detail: state }));
            } catch (e) {}
          }
        };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Status Card */}
            <div className="status-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 20 }}>👑</span>
                <div>
                  <h4 style={{ color: 'var(--color-kim)', fontSize: 13, fontWeight: 900, margin: 0 }}>
                    THẬP TAM BẢN NGUYÊN ĐẠO ANH
                  </h4>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {daoAnhCount}/{totalPalaces} Đạo Anh Tọa Trấn
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 8 }}>
                <span style={{ color: '#94a3b8' }}>Lực Chiến:</span>
                <strong style={{ color: 'var(--color-cuc-canh, #ff3fd5)' }}>
                  {calculatedCombatPower}
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}>
                <span style={{ color: '#94a3b8' }}>Thiên Mệnh Thu Hoạch:</span>
                <strong style={{ color: '#fde047', fontWeight: 800 }}>
                  {totalThienMenh.toLocaleString()} TM
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}>
                <span style={{ color: '#94a3b8' }}>Đạo Anh Đại Viên Mãn:</span>
                <strong style={{ color: 'var(--color-kim)' }}>
                  {maxKiepCount}/{daoAnhCount} Tôn (5/5 Kiếp)
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}>
                <span style={{ color: '#94a3b8' }}>Tốc Độ Đọc Truyện:</span>
                <strong style={{ color: '#38bdf8' }}>
                  200 - 300 EXP / vòng
                </strong>
              </div>
            </div>

            {/* Action Buttons Group */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* 1. Toggle Chiến Lược Tự Nạp */}
              <button
                onClick={toggleStrategy}
                style={{
                  padding: '9px 12px',
                  borderRadius: 8,
                  background: currentStrategy === 'auto_80' ? 'rgba(168, 85, 247, 0.18)' : 'rgba(2, 132, 199, 0.18)',
                  border: `1px solid ${currentStrategy === 'auto_80' ? '#c084fc' : '#38bdf8'}`,
                  color: currentStrategy === 'auto_80' ? '#f0abfc' : '#7dd3fc',
                  fontSize: 11.5,
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6
                }}
                title="Chế độ tự nạp khi đọc sách: 80% (chuẩn bị độ kiếp) hoặc 100% (an toàn tối đa)"
              >
                <span>⚡ Tự nạp đọc sách:</span>
                <span style={{ fontWeight: 900 }}>
                  {currentStrategy === 'auto_80' ? '80% (Nhanh)' : '100% (Đầy)'}
                </span>
              </button>

              {/* 2. Nạp Đầy Linh Lực Toàn Bộ */}
              <button
                onClick={() => {
                  try {
                    fillAllDaoAnhThienMenh();
                  } catch (e) {
                    alert(e.message || 'Không thể nạp Linh Lực');
                  }
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
                  border: '1px solid #7dd3fc',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 0 12px rgba(56, 189, 248, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <span>⚡ NẠP ĐẦY LINH LỰC</span>
              </button>

              {/* 3. Vạn Kiếp Tề Thăng */}
              <button
                onClick={() => {
                  try {
                    const res = attemptTribulationAll();
                    if (res && res.message) alert(res.message);
                  } catch (e) {
                    alert(e.message || 'Không thể độ kiếp');
                  }
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #a855f7 0%, #ff3fd5 100%)',
                  border: '1px solid #f0abfc',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 0 14px rgba(255, 63, 213, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <span>⛈️ VẠN KIẾP TỀ THĂNG (+50% TM)</span>
              </button>

              {/* 4. Bách Thần Đồ */}
              <button
                onClick={() => {
                  if (setGalleryModalOpen) setGalleryModalOpen(true);
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  border: '1px solid #fde047',
                  color: '#000',
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 0 12px rgba(245, 158, 11, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6
                }}
              >
                <span>🎨 BÁCH THẦN ĐỒ (29 SVG)</span>
              </button>
            </div>
          </div>
        );
      })()}

      {/* ========================================================
          5. NÚT TẢN TU VI (HÓA PHÀM TRÙNG TU)
         ======================================================== */}
      <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <button
          onClick={handleTanTuVi}
          style={{
            width: '100%',
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            fontSize: 11.5,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            transition: 'all 0.2s ease'
          }}
          title="Xóa sạch tu vi, quay về phàm nhân để tu luyện lại từ đầu"
        >
          <span>☠️ TẢN TU VI (HÓA PHÀM TRÙNG TU)</span>
        </button>
      </div>

    </div>
  );
}
