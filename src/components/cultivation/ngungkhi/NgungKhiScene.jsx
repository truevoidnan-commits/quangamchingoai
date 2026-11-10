import React from 'react';
import Icon from '../../ui/Icon';
import imgHuyetHoGod from '../../../assets/images/huyet_ho_god.webp';
import imgLongKinhGod from '../../../assets/images/long_kinh_god.webp';
import NgungKhiBackground from './NgungKhiBackground';
import NgungKhiArrayRings from './NgungKhiArrayRings';
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

      {/* 1. BỘ CHUYỂN ĐỔI GÓC NHÌN TU LUYỆN & DẤU HIỆU ĐANG DỒN LINH LỰC */}
      <div style={{
        position: 'absolute',
        top: 14,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 12px',
        borderRadius: 24,
        background: 'rgba(10, 16, 26, 0.94)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.6)'
      }}>
        {/* Nút Hải Sơn Quyết */}
        <button
          onClick={() => {
            setViewMode('the');
            if (setNgungKhiPath) setNgungKhiPath('the');
          }}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 18,
            border: viewMode === 'the'
              ? '1px solid rgba(254, 202, 202, 0.6)'
              : '1px solid transparent',
            background: viewMode === 'the' ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' : 'transparent',
            color: viewMode === 'the' ? '#ffffff' : '#94a3b8',
            fontWeight: 800,
            fontSize: 12.5,
            cursor: 'pointer',
            boxShadow: activePath === 'the'
              ? '0 0 16px rgba(239, 68, 68, 0.75)'
              : (viewMode === 'the' ? '0 0 12px rgba(239, 68, 68, 0.5)' : 'none'),
            transition: 'all 0.25s ease'
          }}
          title="Tập trung tu luyện và quan sát Thể Phách (Hải Sơn Quyết)"
        >
          <span style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center' }}>
            <Icon name="Flame" size={13} />
          </span>
          <span>Hải Sơn Quyết (Thể)</span>
          <span style={{
            fontSize: 11,
            padding: '1px 6px',
            borderRadius: 10,
            background: viewMode === 'the' ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.08)',
            color: viewMode === 'the' ? '#fef08a' : '#cbd5e1'
          }}>
            T{theLvl}
          </span>
          {activePath === 'the' && (
            <span style={{
              position: 'absolute',
              top: -8,
              right: -6,
              background: '#ef4444',
              color: '#ffffff',
              fontSize: 8.5,
              fontWeight: 900,
              padding: '1px 5px',
              borderRadius: 8,
              border: '1px solid #ffffff',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.5)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              animation: 'pulseCore 1.2s ease-in-out infinite alternate'
            }}>
              Đang Nạp Tu Vi
            </span>
          )}
        </button>

        {/* Nút Hóa Hải Kinh */}
        <button
          onClick={() => {
            setViewMode('phap');
            if (setNgungKhiPath) setNgungKhiPath('phap');
          }}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 18,
            border: viewMode === 'phap'
              ? '1px solid rgba(186, 230, 253, 0.6)'
              : '1px solid transparent',
            background: viewMode === 'phap' ? 'linear-gradient(135deg, #06b6d4 0%, #0369a1 100%)' : 'transparent',
            color: viewMode === 'phap' ? '#ffffff' : '#94a3b8',
            fontWeight: 800,
            fontSize: 12.5,
            cursor: 'pointer',
            boxShadow: activePath === 'phap'
              ? '0 0 16px rgba(6, 182, 212, 0.75)'
              : (viewMode === 'phap' ? '0 0 12px rgba(6, 182, 212, 0.5)' : 'none'),
            transition: 'all 0.25s ease'
          }}
          title="Tập trung tu luyện và quan sát Pháp Lực (Hóa Hải Kinh)"
        >
          <span style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center' }}>
            <Icon name="Waves" size={13} />
          </span>
          <span>Hóa Hải Kinh (Pháp)</span>
          <span style={{
            fontSize: 11,
            padding: '1px 6px',
            borderRadius: 10,
            background: viewMode === 'phap' ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.08)',
            color: viewMode === 'phap' ? '#a5f3fc' : '#cbd5e1'
          }}>
            T{phapLvl}
          </span>
          {activePath === 'phap' && (
            <span style={{
              position: 'absolute',
              top: -8,
              right: -6,
              background: '#06b6d4',
              color: '#ffffff',
              fontSize: 8.5,
              fontWeight: 900,
              padding: '1px 5px',
              borderRadius: 8,
              border: '1px solid #ffffff',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.5)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              animation: 'pulseCore 1.2s ease-in-out infinite alternate'
            }}>
              Đang Nạp Tu Vi
            </span>
          )}
        </button>
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

          {/* Nền Chuyển Sắc Hải Sơn (Tông đỏ trầm ấm) */}
          <radialGradient id="nkBgGradThe" cx="50%" cy="45%" r="65%">
            <stop offset="0%" stopColor="#1a0a0c" stopOpacity="0.95" />
            <stop offset="45%" stopColor="#120608" stopOpacity="0.98" />
            <stop offset="100%" stopColor="#0c0507" stopOpacity="1" />
          </radialGradient>

          {/* Nền Chuyển Sắc Hóa Hải (Tông xanh dương thẳm) */}
          <radialGradient id="nkBgGradPhap" cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#07202c" stopOpacity="0.95" />
            <stop offset="45%" stopColor="#051822" stopOpacity="0.98" />
            <stop offset="100%" stopColor="#03121a" stopOpacity="1" />
          </radialGradient>

          {/* Quầng Huyết Nhật Tán Sắc (Blood Sun Glow - không viền gắt) */}
          <radialGradient id="nkBloodSunGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e8743b" stopOpacity="0.22" />
            <stop offset="35%" stopColor="#9b2226" stopOpacity="0.14" />
            <stop offset="70%" stopColor="#5c1316" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#1a0a0c" stopOpacity="0" />
          </radialGradient>

          {/* Quầng Vực Biển Thâm U (Abyss Ocean Glow) */}
          <radialGradient id="nkAbyssOceanGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#5fb8c4" stopOpacity="0.18" />
            <stop offset="40%" stopColor="#1c4e6b" stopOpacity="0.12" />
            <stop offset="75%" stopColor="#0c2b3d" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#03121a" stopOpacity="0" />
          </radialGradient>

          {/* Gradient Cho Vòng Linh Mạch Hải Sơn (Đỏ thẫm -> Hoả chu -> Kim sắc) */}
          <linearGradient id="nkRingReachedThe" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9b2226" />
            <stop offset="50%" stopColor="#e8743b" />
            <stop offset="100%" stopColor="#d9a441" />
          </linearGradient>

          {/* Gradient Cho Vòng Linh Mạch Hóa Hải (Lam thẫm -> Ngọc bích -> Tinh hải) */}
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

          {/* Tia sáng biển (Caustic Beams) */}
          <linearGradient id="nkCausticBeam1" x1="0%" y1="0%" x2="35%" y2="100%">
            <stop offset="0%" stopColor="#cfe9ee" stopOpacity="0.14" />
            <stop offset="50%" stopColor="#5fb8c4" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#03121a" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="nkCausticBeam2" x1="0%" y1="0%" x2="20%" y2="100%">
            <stop offset="0%" stopColor="#5fb8c4" stopOpacity="0.12" />
            <stop offset="55%" stopColor="#1c4e6b" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#03121a" stopOpacity="0" />
          </linearGradient>

          {/* Dải hải lưu mềm mại */}
          <linearGradient id="nkCurrentRibbon1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1c4e6b" stopOpacity="0.1" />
            <stop offset="60%" stopColor="#5fb8c4" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#1c4e6b" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="nkCurrentRibbon2" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#0c2b3d" stopOpacity="0.08" />
            <stop offset="45%" stopColor="#5fb8c4" stopOpacity="0.18" />
            <stop offset="85%" stopColor="#cfe9ee" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#03121a" stopOpacity="0" />
          </linearGradient>

          {/* Thần Thú Aura Gradients */}
          <radialGradient id="tigerAuraGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#d9a441" stopOpacity="0.32" />
            <stop offset="40%" stopColor="#e8743b" stopOpacity="0.2" />
            <stop offset="75%" stopColor="#9b2226" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#1a0a0c" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="whaleAuraGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#5fb8c4" stopOpacity="0.32" />
            <stop offset="45%" stopColor="#1c4e6b" stopOpacity="0.2" />
            <stop offset="80%" stopColor="#07202c" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#03121a" stopOpacity="0" />
          </radialGradient>

          {/* CSS Keyframes tinh tế, mượt mà 60fps */}
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

            /* Chuyển động lơ lửng uy dũng mượt mà */
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

        {/* 3. DỊ TƯỢNG THẦN THÚ HÓA HÌNH */}
        <g transform="translate(460, 290)">
          {/* THẦN THÚ HUYẾT HỔ */}
          {isThe && hasTiger && (
            <g
              transform="translate(0, -25)"
              style={{
                animation: 'nkTigerMajestic 4.5s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite',
                transformOrigin: '0px 0px',
                willChange: 'transform'
              }}
            >
              <circle cx="0" cy="0" r="195" fill="url(#tigerAuraGlow)" />
              <image
                href={imgHuyetHoGod}
                x="-225"
                y="-115"
                width="450"
                height="210"
                preserveAspectRatio="xMidYMid meet"
                style={{
                  filter: 'drop-shadow(0 0 14px rgba(217, 164, 65, 0.45)) drop-shadow(0 0 24px rgba(155, 34, 38, 0.35))',
                  pointerEvents: 'none',
                  willChange: 'transform'
                }}
              />
              <g transform="translate(0, 116)">
                <rect x="-115" y="-14" width="230" height="28" rx="14" fill="rgba(26, 10, 12, 0.95)" stroke="#d9a441" strokeWidth="1.2" />
                <text y="5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#e9d8c4" letterSpacing="1">
                  {theLvl >= 10 ? 'THẦN THÚ HUYẾT HỔ' : 'HUYẾT HỔ HÓA HÌNH'}
                </text>
              </g>
            </g>
          )}

          {/* THẦN THÚ CẤM HẢI LONG KÌNH */}
          {!isThe && hasWhale && (
            <g
              transform="translate(0, -22)"
              style={{
                animation: 'nkWhaleMajestic 5.8s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite',
                transformOrigin: '0px 0px',
                willChange: 'transform'
              }}
            >
              <ellipse cx="0" cy="0" rx="220" ry="120" fill="url(#whaleAuraGlow)" />
              <image
                href={imgLongKinhGod}
                x="-235"
                y="-103"
                width="470"
                height="206"
                preserveAspectRatio="xMidYMid meet"
                style={{
                  filter: 'drop-shadow(0 0 14px rgba(95, 184, 196, 0.45)) drop-shadow(0 0 24px rgba(28, 78, 107, 0.35))',
                  pointerEvents: 'none',
                  willChange: 'transform'
                }}
              />
              <g transform="translate(0, 116)">
                <rect x="-115" y="-14" width="230" height="28" rx="14" fill="rgba(7, 32, 44, 0.95)" stroke="#5fb8c4" strokeWidth="1.2" />
                <text y="5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#cfe9ee" letterSpacing="1">
                  {phapLvl >= 10 ? 'THÁI CỔ LONG KÌNH' : 'CẤM HẢI LONG KÌNH'}
                </text>
              </g>
            </g>
          )}
        </g>
      </svg>

      {/* 3. THANH THÔNG SỐ CẢNH GIỚI NGƯNG KHÍ */}
      <div style={{
        position: 'absolute',
        bottom: isMobile ? '80px' : '22px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 25,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? '5px 12px' : '7px 18px',
        borderRadius: 24,
        background: 'rgba(8, 14, 24, 0.95)',
        border: viewMode === 'the' ? '1.2px solid rgba(239, 68, 68, 0.5)' : '1.2px solid rgba(56, 189, 248, 0.5)',
        backdropFilter: 'blur(12px)',
        boxShadow: viewMode === 'the' 
          ? '0 6px 20px rgba(0, 0, 0, 0.7), 0 0 14px rgba(239, 68, 68, 0.25)' 
          : '0 6px 20px rgba(0, 0, 0, 0.7), 0 0 14px rgba(56, 189, 248, 0.25)',
        maxWidth: 'calc(100% - 24px)',
        width: 'max-content',
        boxSizing: 'border-box'
      }}>
        {viewMode === 'the' ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: isMobile ? 6 : 8,
            fontSize: isMobile ? 11.5 : 12.5,
            fontWeight: 800,
            color: '#f87171'
          }}>
            <span style={{ fontSize: isMobile ? 11.5 : 13, whiteSpace: 'nowrap' }}>Hải Sơn:</span>
            <span style={{ color: '#fca5a5', fontWeight: 900, whiteSpace: 'nowrap' }}>Tầng {theLvl}/10</span>
            <span style={{ fontSize: isMobile ? 10 : 11, color: '#cbd5e1', whiteSpace: 'nowrap' }}>({theExp.toLocaleString()}/4.500)</span>
            {activePath === 'the' && (
              <span style={{
                fontSize: 9,
                fontWeight: 900,
                color: '#fca5a5',
                background: 'rgba(239, 68, 68, 0.2)',
                padding: '2px 6px',
                borderRadius: 8,
                border: '1px solid rgba(239, 68, 68, 0.5)',
                whiteSpace: 'nowrap'
              }}>
                Đang nạp
              </span>
            )}
            {theLvl >= 10 && phapLvl >= 10 && (
              <span style={{
                fontSize: 9,
                fontWeight: 900,
                color: '#fde047',
                background: 'rgba(245, 158, 11, 0.2)',
                padding: '2px 6px',
                borderRadius: 8,
                border: '1px solid rgba(253, 224, 71, 0.5)',
                whiteSpace: 'nowrap'
              }}>
                Viên Mãn
              </span>
            )}
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: isMobile ? 6 : 8,
            fontSize: isMobile ? 11.5 : 12.5,
            fontWeight: 800,
            color: '#38bdf8'
          }}>
            <span style={{ fontSize: isMobile ? 11.5 : 13, whiteSpace: 'nowrap' }}>Hóa Hải:</span>
            <span style={{ color: '#bae6fd', fontWeight: 900, whiteSpace: 'nowrap' }}>Tầng {phapLvl}/10</span>
            <span style={{ fontSize: isMobile ? 10 : 11, color: '#cbd5e1', whiteSpace: 'nowrap' }}>({phapExp.toLocaleString()}/4.500)</span>
            {activePath === 'phap' && (
              <span style={{
                fontSize: 9,
                fontWeight: 900,
                color: '#7dd3fc',
                background: 'rgba(56, 189, 248, 0.2)',
                padding: '2px 6px',
                borderRadius: 8,
                border: '1px solid rgba(186, 230, 253, 0.5)',
                whiteSpace: 'nowrap'
              }}>
                Đang nạp
              </span>
            )}
            {theLvl >= 10 && phapLvl >= 10 && (
              <span style={{
                fontSize: 9,
                fontWeight: 900,
                color: '#fde047',
                background: 'rgba(245, 158, 11, 0.2)',
                padding: '2px 6px',
                borderRadius: 8,
                border: '1px solid rgba(253, 224, 71, 0.5)',
                whiteSpace: 'nowrap'
              }}>
                Viên Mãn
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
