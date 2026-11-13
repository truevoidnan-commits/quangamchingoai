import React from 'react';
import Icon from '../../ui/Icon';
import NgungKhiBackground from './NgungKhiBackground';
import NgungKhiArrayRings from './NgungKhiArrayRings';
import NgungKhiBeast from './NgungKhiBeast';
import styles from './NgungKhiScene.module.css';

export default function NgungKhiScene({
  cultivation,
  viewMode,
  setViewMode,
  setNgungKhiPath,
  theLvl,
  phapLvl,
  theExp,
  phapExp,
  hasTiger,
  hasWhale,
  isMobile,
  playStarChime,
}) {
  const activePath = cultivation?.ngungKhiActivePath || cultivation?.ngungKhiPath || 'the';
  const isThe = viewMode === 'the';
  const currentExp = isThe ? theExp : phapExp;
  const currentLvl = isThe ? theLvl : phapLvl;
  const maxExp = 4500;
  const progressPct = Math.min(100, Math.max(0, (currentExp / maxExp) * 100));

  return (
    <div
      className={styles.container}
      style={{
        background: isThe
          ? 'radial-gradient(circle at 50% 45%, #1a0a0c 0%, #120608 50%, #0c0507 100%)'
          : 'radial-gradient(circle at 50% 40%, #07202c 0%, #051822 50%, #03121a 100%)'
      }}
    >
      {/* LỚP TEXTURE VI HẠT & VIGNETTE CHIỀU SÂU */}
      <div className={styles.noiseOverlay} />
      <div className={styles.vignetteOverlay} />

      {/* 1. BỘ CHUYỂN ĐỔI GÓC NHÌN TU LUYỆN (GLASS SEGMENTED CONTROL) */}
      <div style={{
        position: 'absolute',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5
      }}>
        {/* Thanh chuyển đổi bo tròn liền mạch, không bị đứt viền */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 4px',
          borderRadius: 20,
          background: 'rgba(12, 16, 24, 0.88)',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65)'
        }}>
          {/* Nút Hải Sơn Quyết (Thể) */}
          <button
            onClick={() => {
              setViewMode('the');
              if (setNgungKhiPath) setNgungKhiPath('the');
            }}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              padding: isMobile ? '5px 8px' : '6px 12px',
              width: isMobile ? 126 : 156,
              boxSizing: 'border-box',
              borderRadius: 16,
              border: isThe
                ? '1px solid rgba(217, 164, 65, 0.55)'
                : '1px solid transparent',
              background: isThe ? 'rgba(155, 34, 38, 0.28)' : 'transparent',
              color: isThe ? '#e9d8c4' : '#94a3b8',
              fontWeight: 700,
              fontSize: isMobile ? 11.5 : 12.5,
              cursor: 'pointer',
              boxShadow: isThe ? '0 0 14px rgba(217, 164, 65, 0.15)' : 'none',
              transition: 'all 0.25s ease'
            }}
            title="Tập trung tu luyện và quan sát Thể Phách (Hải Sơn Quyết)"
          >
            <span style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', color: isThe ? '#d9a441' : '#94a3b8' }}>
              <Icon name="tiger" size={13} />
            </span>
            <span style={{ fontFamily: 'serif', letterSpacing: '0.04em' }}>Hải Sơn Quyết</span>
            <span style={{
              fontSize: 10.5,
              padding: '1px 5px',
              borderRadius: 8,
              background: isThe ? 'rgba(217, 164, 65, 0.15)' : 'rgba(255, 255, 255, 0.06)',
              color: isThe ? '#d9a441' : '#cbd5e1',
              border: isThe ? '1px solid rgba(217, 164, 65, 0.3)' : '1px solid transparent'
            }}>
              T{theLvl}
            </span>
          </button>

          {/* Nút Hóa Hải Kinh (Pháp) */}
          <button
            onClick={() => {
              setViewMode('phap');
              if (setNgungKhiPath) setNgungKhiPath('phap');
            }}
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              padding: isMobile ? '5px 8px' : '6px 12px',
              width: isMobile ? 126 : 156,
              boxSizing: 'border-box',
              borderRadius: 16,
              border: !isThe
                ? '1px solid rgba(95, 184, 196, 0.55)'
                : '1px solid transparent',
              background: !isThe ? 'rgba(28, 78, 107, 0.32)' : 'transparent',
              color: !isThe ? '#cfe9ee' : '#94a3b8',
              fontWeight: 700,
              fontSize: isMobile ? 11.5 : 12.5,
              cursor: 'pointer',
              boxShadow: !isThe ? '0 0 14px rgba(95, 184, 196, 0.15)' : 'none',
              transition: 'all 0.25s ease'
            }}
            title="Tập trung tu luyện và quan sát Pháp Lực (Hóa Hải Kinh)"
          >
            <span style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', color: !isThe ? '#5fb8c4' : '#94a3b8' }}>
              <Icon name="whale" size={13} />
            </span>
            <span style={{ fontFamily: 'serif', letterSpacing: '0.04em' }}>Hóa Hải Kinh</span>
            <span style={{
              fontSize: 10.5,
              padding: '1px 5px',
              borderRadius: 8,
              background: !isThe ? 'rgba(95, 184, 196, 0.15)' : 'rgba(255, 255, 255, 0.06)',
              color: !isThe ? '#5fb8c4' : '#cbd5e1',
              border: !isThe ? '1px solid rgba(95, 184, 196, 0.3)' : '1px solid transparent'
            }}>
              T{phapLvl}
            </span>
          </button>
        </div>

        {/* Dòng phụ báo hiệu lộ trình đang nạp tu vi (nằm phía dưới, không đè lên viền thanh chuyển) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 9.5,
          fontWeight: 700,
          color: activePath === 'the' ? '#d9a441' : '#5fb8c4',
          background: 'rgba(10, 14, 22, 0.85)',
          border: activePath === 'the'
            ? '1px solid rgba(217, 164, 65, 0.35)'
            : '1px solid rgba(95, 184, 196, 0.35)',
          padding: '2px 8px',
          borderRadius: 10,
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
          letterSpacing: '0.04em',
          backdropFilter: 'blur(12px)',
          transition: 'all 0.25s ease'
        }}>
          <span style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: activePath === 'the' ? '#e8743b' : '#38bdf8',
            boxShadow: activePath === 'the' ? '0 0 6px #e8743b' : '0 0 6px #38bdf8'
          }} />
          <span>Đang Nạp Tu Vi: {activePath === 'the' ? 'Hải Sơn Quyết' : 'Hóa Hải Kinh'}</span>
        </div>
      </div>

      {/* 2. KHUNG CANVAS SVG HOẠT ẢNH KHÍ HẢI THẦN THÚ CAO CẤP */}
      <svg
        width="100%"
        height="100%"
        viewBox={isMobile ? "110 0 700 640" : "0 0 920 640"}
        preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, overflow: 'hidden' }}
        onClick={() => {
          try { playStarChime(523); } catch (e) {}
        }}
      >
        <defs>
          {/* Bộ lọc phát sáng dịu nhẹ (Refined Soft Glow Filter) */}
          <filter id="nkGlowSoft" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Nền Chuyển Sắc Hải Sơn */}
          <radialGradient id="nkBgGradThe" cx="50%" cy="45%" r="65%">
            <stop offset="0%" stopColor="#1a0a0c" stopOpacity="0.95" />
            <stop offset="45%" stopColor="#120608" stopOpacity="0.98" />
            <stop offset="100%" stopColor="#0c0507" stopOpacity="1" />
          </radialGradient>

          {/* Nền Chuyển Sắc Hóa Hải */}
          <radialGradient id="nkBgGradPhap" cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#07202c" stopOpacity="0.95" />
            <stop offset="45%" stopColor="#051822" stopOpacity="0.98" />
            <stop offset="100%" stopColor="#03121a" stopOpacity="1" />
          </radialGradient>

          {/* Quầng Huyết Nhật Tán Sắc */}
          <radialGradient id="nkBloodSunGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e8743b" stopOpacity="0.30" />
            <stop offset="35%" stopColor="#9b2226" stopOpacity="0.20" />
            <stop offset="70%" stopColor="#5c1316" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#1a0a0c" stopOpacity="0" />
          </radialGradient>

          {/* Quầng Vực Biển Thâm U */}
          <radialGradient id="nkAbyssOceanGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#5fb8c4" stopOpacity="0.25" />
            <stop offset="40%" stopColor="#1c4e6b" stopOpacity="0.17" />
            <stop offset="75%" stopColor="#0c2b3d" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#03121a" stopOpacity="0" />
          </radialGradient>

          {/* Gradient Cho Vòng Linh Mạch Hải Sơn */}
          <linearGradient id="nkRingReachedThe" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9b2226" />
            <stop offset="50%" stopColor="#e8743b" />
            <stop offset="100%" stopColor="#d9a441" />
          </linearGradient>

          {/* Gradient Cho Vòng Linh Mạch Hóa Hải */}
          <linearGradient id="nkRingReachedPhap" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1c4e6b" />
            <stop offset="50%" stopColor="#5fb8c4" />
            <stop offset="100%" stopColor="#cfe9ee" />
          </linearGradient>

          {/* Chuyển sắc Lõi Đan Điền Hải Sơn */}
          <radialGradient id="nkCoreGradThe" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#d9a441" stopOpacity="0.9" />
            <stop offset="35%" stopColor="#e8743b" stopOpacity="0.75" />
            <stop offset="70%" stopColor="#9b2226" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#1a0a0c" stopOpacity="0.2" />
          </radialGradient>

          {/* Chuyển sắc Lõi Đan Điền Hóa Hải */}
          <radialGradient id="nkCoreGradPhap" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#cfe9ee" stopOpacity="0.9" />
            <stop offset="35%" stopColor="#5fb8c4" stopOpacity="0.75" />
            <stop offset="70%" stopColor="#1c4e6b" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#03121a" stopOpacity="0.2" />
          </radialGradient>

          {/* Tia sáng biển */}
          <linearGradient id="nkCausticBeam1" x1="0%" y1="0%" x2="35%" y2="100%">
            <stop offset="0%" stopColor="#cfe9ee" stopOpacity="0.22" />
            <stop offset="50%" stopColor="#5fb8c4" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#03121a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="nkCausticBeam2" x1="0%" y1="0%" x2="20%" y2="100%">
            <stop offset="0%" stopColor="#5fb8c4" stopOpacity="0.18" />
            <stop offset="55%" stopColor="#1c4e6b" stopOpacity="0.07" />
            <stop offset="100%" stopColor="#03121a" stopOpacity="0" />
          </linearGradient>

          {/* Dải hải lưu mềm mại */}
          <linearGradient id="nkCurrentRibbon1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1c4e6b" stopOpacity="0.16" />
            <stop offset="60%" stopColor="#5fb8c4" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#1c4e6b" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="nkCurrentRibbon2" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#0c2b3d" stopOpacity="0.14" />
            <stop offset="45%" stopColor="#5fb8c4" stopOpacity="0.26" />
            <stop offset="85%" stopColor="#cfe9ee" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#03121a" stopOpacity="0" />
          </linearGradient>

          {/* Thần Thú Soft Aura Gradients */}
          <radialGradient id="nkTigerSoftAura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#d9a441" stopOpacity="0.28" />
            <stop offset="40%" stopColor="#e8743b" stopOpacity="0.16" />
            <stop offset="75%" stopColor="#9b2226" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#1a0a0c" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="nkWhaleSoftAura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#5fb8c4" stopOpacity="0.28" />
            <stop offset="45%" stopColor="#1c4e6b" stopOpacity="0.16" />
            <stop offset="80%" stopColor="#07202c" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#03121a" stopOpacity="0" />
          </radialGradient>

          {/* Sương mù che chân hổ & kình */}
          <radialGradient id="nkTigerMistFade" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(155, 34, 38, 0.35)" />
            <stop offset="60%" stopColor="rgba(42, 14, 18, 0.18)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>

          <radialGradient id="nkWhaleAbyssFade" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(28, 78, 107, 0.35)" />
            <stop offset="60%" stopColor="rgba(12, 43, 61, 0.18)" />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>

          {/* Keyframes */}
          <style>{`
            @keyframes nkTrigramRotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes nkSpinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes nkSpinReverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
            @keyframes nkOrbitStar { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes nkPulseSoft { 
              0%, 100% { transform: scale(1); opacity: 0.85; } 
              50% { transform: scale(1.03); opacity: 1; } 
            }
            @keyframes nkPulseAura {
              0%, 100% { opacity: 0.35; transform: scale(1); }
              50% { opacity: 0.65; transform: scale(1.015); }
            }
            @keyframes nkFaintLightning {
              0%, 91%, 100% { opacity: 0; }
              93% { opacity: 0.45; }
              95% { opacity: 0.15; }
              97% { opacity: 0.35; }
            }
            @keyframes nkMistDrift1 {
              0% { transform: translate3d(-35px, 0, 0); }
              50% { transform: translate3d(35px, 0, 0); }
              100% { transform: translate3d(-35px, 0, 0); }
            }
            @keyframes nkMistDrift2 {
              0% { transform: translate3d(25px, 0, 0); }
              50% { transform: translate3d(-25px, 0, 0); }
              100% { transform: translate3d(25px, 0, 0); }
            }
            @keyframes nkEmberRise {
              0% { transform: translate3d(0, 0, 0); opacity: 0; }
              25% { opacity: 0.65; }
              80% { opacity: 0.45; }
              100% { transform: translate3d(6px, -150px, 0); opacity: 0; }
            }
            @keyframes nkCausticSway {
              0%, 100% { opacity: 0.55; transform: skewX(0deg); }
              50% { opacity: 0.85; transform: skewX(2deg); }
            }
            @keyframes nkCurrentDriftA {
              0% { transform: translate3d(-20px, 0, 0); }
              50% { transform: translate3d(20px, -6px, 0); }
              100% { transform: translate3d(-20px, 0, 0); }
            }
            @keyframes nkCurrentDriftB {
              0% { transform: translate3d(20px, 0, 0); }
              50% { transform: translate3d(-20px, 8px, 0); }
              100% { transform: translate3d(20px, 0, 0); }
            }
            @keyframes nkPlanktonDrift {
              0% { transform: translate3d(0, 0, 0); opacity: 0; }
              30% { opacity: 0.7; }
              75% { opacity: 0.55; }
              100% { transform: translate3d(8px, -130px, 0); opacity: 0; }
            }
            @keyframes nkTigerMajestic { 
              0% { transform: translate3d(0, 0px, 0) scale(1) rotate(0deg); } 
              25% { transform: translate3d(2px, -5px, 0) scale(1.01) rotate(-0.5deg); } 
              50% { transform: translate3d(0, -9px, 0) scale(1.02) rotate(0.3deg); } 
              75% { transform: translate3d(-2px, -5px, 0) scale(1.01) rotate(0.5deg); } 
              100% { transform: translate3d(0, 0px, 0) scale(1) rotate(0deg); } 
            }
            @keyframes nkWhaleMajestic { 
              0% { transform: translate3d(0, 0px, 0) rotate(0deg); } 
              25% { transform: translate3d(8px, -6px, 0) rotate(-1.2deg); } 
              50% { transform: translate3d(0, -11px, 0) rotate(0.4deg); } 
              75% { transform: translate3d(-8px, -6px, 0) rotate(1.4deg); } 
              100% { transform: translate3d(0, 0px, 0) rotate(0deg); } 
            }
            @keyframes nkClawShimmer {
              0%, 100% { opacity: 0.45; }
              50% { opacity: 0.85; }
            }
            @keyframes nkWaveRipple {
              0%, 100% { opacity: 0.4; transform: scale(0.98); }
              50% { opacity: 0.75; transform: scale(1.02); }
            }
          `}</style>
        </defs>

        {/* 1. LỚP CẢNH NỀN 3 TẦNG KHÔNG GIAN (HẢI SƠN / HÓA HẢI) */}
        <NgungKhiBackground viewMode={viewMode} isMobile={isMobile} />

        {/* 2. TRẬN ĐỒ ĐAN ĐIỀN TRUNG TÂM — VÒNG LINH TRẬN TRÊN ĐÁ */}
        <NgungKhiArrayRings
          viewMode={viewMode}
          theLvl={theLvl}
          phapLvl={phapLvl}
          playStarChime={playStarChime}
        />

        {/* 3. DỊ TƯỢNG THẦN THÚ HÓA HÌNH & BIỂN HIỆU KHẮC KIM THẠCH */}
        <NgungKhiBeast
          viewMode={viewMode}
          theLvl={theLvl}
          phapLvl={phapLvl}
          hasTiger={hasTiger}
          hasWhale={hasWhale}
        />
      </svg>

      {/* 3. THANH THÔNG SỐ CẢNH GIỚI NGƯNG KHÍ (ENGRAVED GLASS STATUS BAR) */}
      <div
        data-testid="ngung-khi-status-plaque"
        style={{
          position: 'absolute',
          bottom: isMobile ? '80px' : '22px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 25,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: isMobile ? 4 : 6,
          padding: isMobile ? '6px 14px' : '8px 20px',
          borderRadius: 16,
          background: 'rgba(10, 14, 22, 0.90)',
          border: isThe
            ? '1px solid rgba(217, 164, 65, 0.38)'
            : '1px solid rgba(95, 184, 196, 0.38)',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.75)',
          maxWidth: 'calc(100% - 24px)',
          width: 'max-content',
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}
      >
        {/* Hàng thông tin chi tiết */}
        {isMobile ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            color: isThe ? '#e9d8c4' : '#cfe9ee',
            width: '100%',
            boxSizing: 'border-box'
          }}>
            {/* Dòng 1: Tên quyết / kinh + Tầng */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              whiteSpace: 'nowrap'
            }}>
              <span style={{
                fontFamily: 'serif',
                fontWeight: 700,
                fontSize: 12,
                color: isThe ? '#d9a441' : '#5fb8c4',
                letterSpacing: '0.04em'
              }}>
                {isThe ? 'Hải Sơn Quyết:' : 'Hóa Hải Kinh:'}
              </span>
              <span style={{
                fontFamily: 'serif',
                fontWeight: 800,
                fontSize: 12,
                color: isThe ? '#e9d8c4' : '#cfe9ee'
              }}>
                Tầng {currentLvl}/10
              </span>
            </div>

            {/* Dòng 2: Điểm tu vi + Huy hiệu */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              whiteSpace: 'nowrap'
            }}>
              <span style={{
                fontSize: 10,
                color: '#94a3b8'
              }}>
                ({currentExp.toLocaleString()} / 4.500)
              </span>

              {activePath === viewMode && (
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: isThe ? '#d9a441' : '#5fb8c4',
                  background: isThe ? 'rgba(217, 164, 65, 0.12)' : 'rgba(95, 184, 196, 0.12)',
                  padding: '1.5px 6px',
                  borderRadius: 5,
                  border: isThe ? '1px solid rgba(217, 164, 65, 0.4)' : '1px solid rgba(95, 184, 196, 0.4)',
                  letterSpacing: '0.04em'
                }}>
                  Đang nạp
                </span>
              )}

              {theLvl >= 10 && phapLvl >= 10 && (
                <span style={{
                  fontSize: 9,
                  fontWeight: 800,
                  color: '#d9a441',
                  background: 'rgba(217, 164, 65, 0.18)',
                  padding: '1.5px 6px',
                  borderRadius: 5,
                  border: '1px solid rgba(217, 164, 65, 0.6)',
                  letterSpacing: '0.06em'
                }}>
                  Viên Mãn
                </span>
              )}
            </div>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            fontSize: 12.5,
            color: isThe ? '#e9d8c4' : '#cfe9ee'
          }}>
            <span style={{
              fontFamily: 'serif',
              fontWeight: 700,
              fontSize: 13,
              color: isThe ? '#d9a441' : '#5fb8c4',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap'
            }}>
              {isThe ? 'Hải Sơn Quyết:' : 'Hóa Hải Kinh:'}
            </span>
            <span style={{
              fontFamily: 'serif',
              fontWeight: 800,
              color: isThe ? '#e9d8c4' : '#cfe9ee',
              whiteSpace: 'nowrap'
            }}>
              Tầng {currentLvl}/10
            </span>
            <span style={{
              fontSize: 11,
              color: '#94a3b8',
              whiteSpace: 'nowrap'
            }}>
              ({currentExp.toLocaleString()} / 4.500)
            </span>

            {activePath === viewMode && (
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                color: isThe ? '#d9a441' : '#5fb8c4',
                background: isThe ? 'rgba(217, 164, 65, 0.12)' : 'rgba(95, 184, 196, 0.12)',
                padding: '2px 7px',
                borderRadius: 6,
                border: isThe ? '1px solid rgba(217, 164, 65, 0.4)' : '1px solid rgba(95, 184, 196, 0.4)',
                whiteSpace: 'nowrap',
                letterSpacing: '0.04em'
              }}>
                Đang nạp
              </span>
            )}

            {theLvl >= 10 && phapLvl >= 10 && (
              <span style={{
                fontSize: 9,
                fontWeight: 800,
                color: '#d9a441',
                background: 'rgba(217, 164, 65, 0.18)',
                padding: '2px 7px',
                borderRadius: 6,
                border: '1px solid rgba(217, 164, 65, 0.6)',
                whiteSpace: 'nowrap',
                letterSpacing: '0.06em'
              }}>
                Viên Mãn
              </span>
            )}
          </div>
        )}

        {/* Thanh tiến độ mảnh mai 3px với 10 nấc phân tầng */}
        <div style={{
          position: 'relative',
          width: isMobile ? 180 : 260,
          height: 3.5,
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: 2,
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${progressPct}%`,
            height: '100%',
            background: isThe
              ? 'linear-gradient(90deg, #9b2226 0%, #e8743b 50%, #d9a441 100%)'
              : 'linear-gradient(90deg, #1c4e6b 0%, #5fb8c4 50%, #cfe9ee 100%)',
            boxShadow: isThe
              ? '0 0 8px rgba(217, 164, 65, 0.4)'
              : '0 0 8px rgba(95, 184, 196, 0.4)',
            transition: 'width 0.4s ease-out'
          }} />
        </div>
      </div>
    </div>
  );
}
