import React from 'react';
import Icon from '../../ui/Icon';
import imgHuyetHoGod from '../../../assets/images/huyet_ho_god.webp';
import imgLongKinhGod from '../../../assets/images/long_kinh_god.webp';
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

  return (
    <div
      className={styles.container}
      style={{
        background: viewMode === 'the'
          ? 'radial-gradient(circle at 50% 45%, #450a0a 0%, #280507 40%, #140203 80%, #050001 100%)'
          : 'radial-gradient(circle at 50% 40%, #083344 0%, #042033 40%, #02101e 80%, #01060e 100%)'
      }}
    >
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
            try { playStarChime(440); } catch (e) {}
          }}
          style={{
            position: 'relative',
            padding: '6px 16px',
            borderRadius: 18,
            fontSize: 12,
            fontWeight: 800,
            border: activePath === 'the' 
              ? '1.5px solid #f87171' 
              : '1px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.25s ease',
            background: viewMode === 'the' ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' : 'transparent',
            color: viewMode === 'the' ? '#ffffff' : '#94a3b8',
            boxShadow: activePath === 'the' 
              ? '0 0 16px rgba(239, 68, 68, 0.8)' 
              : (viewMode === 'the' ? '0 0 12px rgba(239, 68, 68, 0.5)' : 'none'),
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <span className="ngung-khi-btn-text"><Icon name="sword" size={14} /> Hải Sơn (Thể)</span>
          {activePath === 'the' && (
            <span style={{
              fontSize: 9.5,
              fontWeight: 900,
              color: '#fef08a',
              background: 'rgba(0, 0, 0, 0.5)',
              padding: '2px 6px',
              borderRadius: 10,
              border: '1px solid #fef08a',
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
            try { playStarChime(587); } catch (e) {}
          }}
          style={{
            position: 'relative',
            padding: '6px 16px',
            borderRadius: 18,
            fontSize: 12,
            fontWeight: 800,
            border: activePath === 'phap' 
              ? '1.5px solid #38bdf8' 
              : '1px solid transparent',
            cursor: 'pointer',
            transition: 'all 0.25s ease',
            background: viewMode === 'phap' ? 'linear-gradient(135deg, #06b6d4 0%, #0369a1 100%)' : 'transparent',
            color: viewMode === 'phap' ? '#ffffff' : '#94a3b8',
            boxShadow: activePath === 'phap' 
              ? '0 0 16px rgba(56, 189, 248, 0.8)' 
              : (viewMode === 'phap' ? '0 0 12px rgba(6, 182, 212, 0.5)' : 'none'),
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <span className="ngung-khi-btn-text"><Icon name="wave" size={14} /> Hóa Hải (Pháp)</span>
          {activePath === 'phap' && (
            <span style={{
              fontSize: 9.5,
              fontWeight: 900,
              color: '#bae6fd',
              background: 'rgba(0, 0, 0, 0.5)',
              padding: '2px 6px',
              borderRadius: 10,
              border: '1px solid #38bdf8',
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
          {/* High-Performance GPU-Optimized Glow Filters */}
          <filter id="nkGlowRed" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="nkGlowCyan" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="nkGlowGold" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="4.0" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Tiger Blood & Golden Flame Aura Gradients */}
          <radialGradient id="tigerAuraGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.45" />
            <stop offset="40%" stopColor="#ef4444" stopOpacity="0.3" />
            <stop offset="75%" stopColor="#991b1b" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#450a0a" stopOpacity="0" />
          </radialGradient>

          {/* Whale Celestial Ocean Aura Gradients */}
          <radialGradient id="whaleAuraGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
            <stop offset="45%" stopColor="#06b6d4" stopOpacity="0.28" />
            <stop offset="80%" stopColor="#0369a1" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#082f49" stopOpacity="0" />
          </radialGradient>

          {/* Core & Atmosphere Gradients */}
          <radialGradient id="bloodVortexCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="20%" stopColor="#fca5a5" stopOpacity="1" />
            <stop offset="50%" stopColor="#ef4444" stopOpacity="0.95" />
            <stop offset="80%" stopColor="#991b1b" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#450a0a" stopOpacity="0" />
          </radialGradient>

          {/* Cấm Hải Deep Abyss Gradient */}
          <radialGradient id="abyssOceanCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="15%" stopColor="#e0f2fe" stopOpacity="1" />
            <stop offset="35%" stopColor="#38bdf8" stopOpacity="0.95" />
            <stop offset="65%" stopColor="#0369a1" stopOpacity="0.8" />
            <stop offset="90%" stopColor="#0c4a6e" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#020617" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="oceanBgGrad" cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#083344" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#042033" stopOpacity="0.95" />
            <stop offset="80%" stopColor="#02101e" stopOpacity="0.98" />
            <stop offset="100%" stopColor="#01060e" stopOpacity="1" />
          </radialGradient>

          <radialGradient id="bloodBgGrad" cx="50%" cy="45%" r="65%">
            <stop offset="0%" stopColor="#450a0a" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#280507" stopOpacity="0.95" />
            <stop offset="80%" stopColor="#140203" stopOpacity="0.98" />
            <stop offset="100%" stopColor="#050001" stopOpacity="1" />
          </radialGradient>

          {/* Gradients cho Vòng Linh Mạch Cao Cấp */}
          <linearGradient id="layerReachedThe" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fca5a5" />
            <stop offset="50%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
          <linearGradient id="layerReachedPhap" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#bae6fd" />
            <stop offset="50%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>

          {/* Shimmering Sun / Starlight Caustics for Ocean */}
          <linearGradient id="causticRay1" x1="0%" y1="0%" x2="40%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
            <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#082f49" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="causticRay2" x1="0%" y1="0%" x2="20%" y2="100%">
            <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.2" />
            <stop offset="60%" stopColor="#0284c7" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#082f49" stopOpacity="0" />
          </linearGradient>

          {/* Beast Body Gradients */}
          <linearGradient id="tigerBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fca5a5" />
            <stop offset="25%" stopColor="#ef4444" />
            <stop offset="65%" stopColor="#b91c1c" />
            <stop offset="100%" stopColor="#450a0a" />
          </linearGradient>

          <linearGradient id="whaleBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="35%" stopColor="#0284c7" />
            <stop offset="75%" stopColor="#0369a1" />
            <stop offset="100%" stopColor="#082f49" />
          </linearGradient>

          {/* Deep Ocean Current Ribbons */}
          <linearGradient id="oceanRibbon1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.25" />
            <stop offset="70%" stopColor="#38bdf8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="oceanRibbon2" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#0284c7" stopOpacity="0.08" />
            <stop offset="40%" stopColor="#38bdf8" stopOpacity="0.28" />
            <stop offset="80%" stopColor="#7dd3fc" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#082f49" stopOpacity="0" />
          </linearGradient>

          {/* High-Performance 60fps Keyframe Animations */}
          <style>{`
            @keyframes nkSpinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes nkSpinReverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
            @keyframes nkRuneSpinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes nkOrbitStar1 { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes nkPulseBreathing { 
              0%, 100% { transform: scale(1); opacity: 0.85; } 
              50% { transform: scale(1.04); opacity: 1; } 
            }

            /* THẦN THÚ HUYẾT HỔ: Chuyển động lơ lửng uy dũng mượt mà 60fps */
            @keyframes nkTigerMajestic { 
              0% { transform: translate3d(0, 0px, 0) scale(1) rotate(0deg); } 
              25% { transform: translate3d(2px, -6px, 0) scale(1.015) rotate(-0.6deg); } 
              50% { transform: translate3d(0, -11px, 0) scale(1.028) rotate(0.4deg); } 
              75% { transform: translate3d(-2px, -6px, 0) scale(1.015) rotate(0.7deg); } 
              100% { transform: translate3d(0, 0px, 0) scale(1) rotate(0deg); } 
            }
            @keyframes nkTigerClawSlash { 
              0%, 100% { opacity: 0.25; transform: scale(0.95); } 
              50% { opacity: 0.95; transform: scale(1.05); } 
            }

            /* THÁI CỔ LONG KÌNH: Bơi lượn uốn lượn sâu trong Cấm Hải mượt như lụa */
            @keyframes nkWhaleMajestic { 
              0% { transform: translate3d(0, 0px, 0) rotate(0deg); } 
              25% { transform: translate3d(10px, -7px, 0) rotate(-1.4deg); } 
              50% { transform: translate3d(0, -14px, 0) rotate(0.5deg); } 
              75% { transform: translate3d(-10px, -7px, 0) rotate(1.6deg); } 
              100% { transform: translate3d(0, 0px, 0) rotate(0deg); } 
            }
            @keyframes nkWhaleSpoutSpray { 
              0% { opacity: 0.25; transform: scaleY(0.7) translateY(4px); } 
              50% { opacity: 0.95; transform: scaleY(1.15) translateY(-4px); } 
              100% { opacity: 0.25; transform: scaleY(0.7) translateY(4px); } 
            }

            @keyframes causticsShimmer { 0%, 100% { opacity: 0.45; transform: skewX(0deg); } 50% { opacity: 0.85; transform: skewX(3deg); } }
            @keyframes currentDrift1 { 0% { transform: translate3d(-30px, 0px, 0); } 50% { transform: translate3d(30px, -8px, 0); } 100% { transform: translate3d(-30px, 0px, 0); } }
            @keyframes currentDrift2 { 0% { transform: translate3d(30px, 0px, 0); } 50% { transform: translate3d(-30px, 10px, 0); } 100% { transform: translate3d(30px, 0px, 0); } }
            @keyframes nkEmberFloat1 { 0% { transform: translate3d(0, 0px, 0); opacity: 0; } 30% { opacity: 0.9; } 80% { opacity: 0.7; } 100% { transform: translate3d(8px, -170px, 0); opacity: 0; } }
            @keyframes nkEmberFloat2 { 0% { transform: translate3d(0, 0px, 0); opacity: 0; } 30% { opacity: 0.9; } 80% { opacity: 0.7; } 100% { transform: translate3d(-10px, -200px, 0); opacity: 0; } }
            @keyframes nkDeepBubbleFloat { 0% { transform: translate3d(0, 0px, 0); opacity: 0; } 30% { opacity: 0.85; } 70% { opacity: 0.7; } 100% { transform: translate3d(10px, -160px, 0); opacity: 0; } }
            @keyframes nkMountainMist { 0%, 100% { transform: translate3d(-15px, 0, 0); opacity: 0.35; } 50% { transform: translate3d(15px, 0, 0); opacity: 0.6; } }
            @keyframes nkLightningFlash1 { 0%, 88%, 100% { opacity: 0; } 90%, 93% { opacity: 0.95; } }
            @keyframes nkLightningFlash2 { 0%, 75%, 100% { opacity: 0; } 78%, 81% { opacity: 0.9; } }
            @keyframes nkLightningFlash3 { 0%, 92%, 100% { opacity: 0; } 94%, 97% { opacity: 0.95; } }
          `}</style>
        </defs>

        {/* NỀN ĐẠI DƯƠNG / KHÍ HUYẾT SÂU THẲM - PHỦ KÍN 100% CANVAS */}
        <rect x="-300" y="-300" width="1600" height="1300" fill={viewMode === 'the' ? 'url(#bloodBgGrad)' : 'url(#oceanBgGrad)'} />

        {/* ========================================================
            HIỆU ỨNG NỀN 1: HẢI SƠN QUYẾT (LUYỆN THỂ — HUYẾT SƠN HÙNG VĨ & LÔI ĐIỆN KHÍ HUYẾT)
           ======================================================== */}
        {viewMode === 'the' && (
          <g>
            {/* 1. DÃY NÚI HẢI SƠN HÙNG VĨ (ANCIENT BLOOD MOUNTAIN RANGES) */}
            <g opacity="0.75">
              {/* Núi xa trùng điệp */}
              <polygon points="0,640 100,430 260,540 460,370 660,520 810,410 920,640" fill="rgba(35, 5, 8, 0.7)" />
              {/* Núi giữa uy nghi */}
              <polygon points="0,640 80,480 200,590 350,440 500,570 670,430 820,560 920,640" fill="rgba(55, 8, 12, 0.85)" stroke="#ef4444" strokeWidth="1.2" strokeOpacity="0.4" />
              {/* Đường viền khí huyết rực sáng trên đỉnh núi */}
              <polyline points="0,510 150,420 300,500 460,360 620,480 770,400 920,520" fill="none" stroke="#fca5a5" strokeWidth="2" strokeOpacity="0.6" filter="url(#nkGlowRed)" />
              {/* Sương mù khí huyết trôi lãng đãng quanh chân núi */}
              <ellipse cx="460" cy="560" rx="460" ry="80" fill="rgba(220, 38, 38, 0.12)" style={{ animation: 'nkMountainMist 7s ease-in-out infinite' }} />
            </g>

            {/* 2. Quầng Huyết Nhật Khí Huyết Chi Viêm */}
            <circle cx="460" cy="290" r="340" fill="rgba(239, 68, 68, 0.15)" style={{ animation: 'nkPulseBreathing 4s ease-in-out infinite' }} />
            <circle cx="460" cy="290" r="220" fill="rgba(220, 38, 38, 0.12)" />

            {/* 3. HỆ THỐNG TIA SÉT KHÍ HUYẾT GIÁNG THẾ (CRIMSON & GOLDEN LIGHTNING BOLTS) */}
            <path
              d="M 460,30 L 442,130 L 476,190 L 452,260 L 468,320"
              stroke="#fef08a"
              strokeWidth="2.8"
              fill="none"
              filter="url(#nkGlowGold)"
              style={{ animation: 'nkLightningFlash1 3.8s ease-in-out infinite' }}
            />
            <path
              d="M 460,30 L 442,130 L 476,190 L 452,260 L 468,320"
              stroke="#ffffff"
              strokeWidth="1.2"
              fill="none"
              style={{ animation: 'nkLightningFlash1 3.8s ease-in-out infinite' }}
            />

            <path
              d="M 220,60 L 245,140 L 210,210 L 238,290 L 215,380"
              stroke="#fca5a5"
              strokeWidth="2.2"
              fill="none"
              filter="url(#nkGlowRed)"
              style={{ animation: 'nkLightningFlash2 4.6s ease-in-out infinite', animationDelay: '0.8s' }}
            />
            <path
              d="M 245,140 L 270,175 M 210,210 L 180,240"
              stroke="#fef08a"
              strokeWidth="1.4"
              fill="none"
              style={{ animation: 'nkLightningFlash2 4.6s ease-in-out infinite', animationDelay: '0.8s' }}
            />

            <path
              d="M 700,50 L 672,135 L 712,205 L 680,285 L 710,370"
              stroke="#fef08a"
              strokeWidth="2.4"
              fill="none"
              filter="url(#nkGlowGold)"
              style={{ animation: 'nkLightningFlash3 5.2s ease-in-out infinite', animationDelay: '1.6s' }}
            />
            <path
              d="M 672,135 L 640,165 M 712,205 L 740,235"
              stroke="#ffffff"
              strokeWidth="1.3"
              fill="none"
              style={{ animation: 'nkLightningFlash3 5.2s ease-in-out infinite', animationDelay: '1.6s' }}
            />

            {/* 4. Các đốm lửa Huyết Khí bốc lên từ lòng đất & đỉnh núi */}
            {Array.from({ length: 20 }).map((_, idx) => (
              <circle
                key={idx}
                cx={120 + (idx * 35) + ((idx % 3) * 12)}
                cy={520 + ((idx % 4) * 14)}
                r={2.5 + (idx % 3)}
                fill={idx % 2 === 0 ? '#fca5a5' : '#ef4444'}
                opacity="0.85"
                style={{
                  animation: `${idx % 2 === 0 ? 'nkEmberFloat1' : 'nkEmberFloat2'} ${2.4 + (idx % 4) * 0.5}s ease-in-out infinite`,
                  animationDelay: `${idx * 0.18}s`,
                  willChange: 'transform, opacity'
                }}
              />
            ))}
          </g>
        )}

        {/* ========================================================
            HIỆU ỨNG NỀN 2: HÓA HẢI KINH (CẤM HẢI HUYỀN ẢO CHÂN THỰC)
           ======================================================== */}
        {viewMode === 'phap' && (
          <g>
            {/* Vầng sáng đại dương trung tâm */}
            <circle cx="460" cy="290" r="350" fill="rgba(6, 182, 212, 0.15)" style={{ animation: 'nkPulseBreathing 4.5s ease-in-out infinite' }} />
            <circle cx="460" cy="290" r="230" fill="rgba(3, 105, 161, 0.14)" />

            {/* Chùm tia sáng thần thánh chiếu từ mặt biển xuống vực sâu */}
            <g style={{ animation: 'causticsShimmer 6s ease-in-out infinite' }}>
              <polygon points="180,0 260,0 360,640 220,640" fill="url(#causticRay1)" />
              <polygon points="360,0 460,0 600,640 440,640" fill="url(#causticRay2)" />
              <polygon points="580,0 680,0 810,640 660,640" fill="url(#causticRay1)" />
              <polygon points="70,0 130,0 210,640 120,640" fill="url(#causticRay2)" />
            </g>

            {/* Các dải hải lưu mềm mại trôi lơ lửng giữa tầng nước */}
            <g style={{ animation: 'currentDrift1 8s ease-in-out infinite', willChange: 'transform' }}>
              <path
                d="M -50,450 Q 240,410 460,460 T 970,420"
                fill="none"
                stroke="url(#oceanRibbon1)"
                strokeWidth="48"
                strokeLinecap="round"
              />
            </g>
            <g style={{ animation: 'currentDrift2 6.5s ease-in-out infinite', willChange: 'transform' }}>
              <path
                d="M -50,510 Q 280,550 520,500 T 970,530"
                fill="none"
                stroke="url(#oceanRibbon2)"
                strokeWidth="56"
                strokeLinecap="round"
              />
            </g>

            {/* Hạt linh lực phù du phát quang trôi nổi tự nhiên */}
            {Array.from({ length: 20 }).map((_, idx) => (
              <circle
                key={idx}
                cx={120 + (idx * 38) + ((idx % 4) * 14)}
                cy={410 + ((idx % 5) * 26)}
                r={2.2 + (idx % 3) * 0.8}
                fill={idx % 3 === 0 ? '#ffffff' : idx % 2 === 0 ? '#a5f3fc' : '#38bdf8'}
                opacity="0.85"
                style={{
                  animation: `nkDeepBubbleFloat ${3.5 + (idx % 4) * 0.7}s ease-in-out infinite`,
                  animationDelay: `${idx * 0.28}s`,
                  willChange: 'transform, opacity'
                }}
              />
            ))}
          </g>
        )}

        {/* ========================================================
            TRẬN ĐỒ ĐAN ĐIỀN TRUNG TÂM — PHÁP TRẬN TIÊN HIỆP CAO CẤP
           ======================================================== */}
        <g transform="translate(460, 290)">
          {/* 1. TIA LINH MẠCH BÁT HƯỚNG TỎA SÁNG */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, idx) => {
            const rad = (deg * Math.PI) / 180;
            const x1 = 55 * Math.cos(rad);
            const y1 = 55 * Math.sin(rad);
            const x2 = 250 * Math.cos(rad);
            const y2 = 250 * Math.sin(rad);
            const mainColor = viewMode === 'the' ? '#f59e0b' : '#38bdf8';
            return (
              <g key={`ray-${idx}`}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={mainColor}
                  strokeWidth="1.2"
                  strokeOpacity="0.32"
                />
                <circle
                  cx={x2}
                  cy={y2}
                  r="2.5"
                  fill={mainColor}
                  opacity="0.75"
                />
              </g>
            );
          })}

          {/* 2. VÒNG BÁT QUÁI CỔ NGỮ XOAY HUYỀN ẢO */}
          <g style={{ transformOrigin: '0 0', animation: 'nkRuneSpinSlow 55s linear infinite', willChange: 'transform' }}>
            <circle cx="0" cy="0" r="256" fill="none" stroke={viewMode === 'the' ? '#f59e0b' : '#38bdf8'} strokeWidth="1.4" opacity="0.45" />
            <circle cx="0" cy="0" r="248" fill="none" stroke={viewMode === 'the' ? '#ef4444' : '#0284c7'} strokeWidth="0.8" opacity="0.3" />

            {['☰', '☱', '☲', '☳', '☴', '☵', '☶', '☷'].map((sym, sIdx) => {
              const sAngle = (sIdx * 45 * Math.PI) / 180;
              const symX = 252 * Math.cos(sAngle);
              const symY = 252 * Math.sin(sAngle);
              return (
                <text
                  key={`trigram-${sIdx}`}
                  x={symX}
                  y={symY + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="900"
                  fill={viewMode === 'the' ? '#fef08a' : '#a5f3fc'}
                  opacity="0.8"
                  style={{ userSelect: 'none' }}
                >
                  {sym}
                </text>
              );
            })}
          </g>

          {/* 3. 10 VÒNG LINH MẠCH PHÂN TẦNG NGHỆ THUẬT */}
          {Array.from({ length: 10 }).map((_, i) => {
            const layerNum = i + 1;
            const isReached = viewMode === 'the' ? theLvl >= layerNum : phapLvl >= layerNum;
            const isCurrent = viewMode === 'the' ? theLvl === layerNum : phapLvl === layerNum;
            const ringR = 55 + layerNum * 19;

            const strokeFill = isReached
              ? (viewMode === 'the' ? 'url(#layerReachedThe)' : 'url(#layerReachedPhap)')
              : (viewMode === 'the' ? '#331518' : '#0e243a');

            const strokeWidth = isCurrent ? 2.4 : (isReached ? 1.8 : 0.85);
            const strokeOpacity = isCurrent ? 1 : (isReached ? 0.88 : 0.35);

            return (
              <g key={layerNum}>
                {isReached && (
                  <circle
                    cx="0"
                    cy="0"
                    r={ringR}
                    fill="none"
                    stroke={viewMode === 'the' ? '#f59e0b' : '#38bdf8'}
                    strokeWidth={strokeWidth + 2.5}
                    strokeOpacity="0.15"
                  />
                )}
                <circle
                  cx="0"
                  cy="0"
                  r={ringR}
                  fill="none"
                  stroke={strokeFill}
                  strokeWidth={strokeWidth}
                  strokeOpacity={strokeOpacity}
                />
                {isCurrent && (
                  <g style={{ transformOrigin: '0 0', animation: 'nkOrbitStar1 8s linear infinite', willChange: 'transform' }}>
                    <circle
                      cx={ringR}
                      cy="0"
                      r="5.5"
                      fill="#ffffff"
                      filter="url(#nkGlowGold)"
                    />
                    <circle
                      cx={-ringR}
                      cy="0"
                      r="4"
                      fill={viewMode === 'the' ? '#fde047' : '#7dd3fc'}
                    />
                  </g>
                )}
              </g>
            );
          })}

          {/* 4. VÒNG XOÁY NĂNG LƯỢNG ĐAN ĐIỀN ĐA TẦNG */}
          {viewMode === 'the' ? (
            <g style={{ transformOrigin: '0 0', animation: 'nkSpinSlow 14s linear infinite', willChange: 'transform' }}>
              <circle cx="0" cy="0" r="50" fill="url(#bloodVortexCore)" />
              <circle cx="0" cy="0" r="53" fill="none" stroke="#f59e0b" strokeWidth="1.8" opacity="0.9" />
              <circle cx="0" cy="0" r="46" fill="none" stroke="#ef4444" strokeWidth="1.2" opacity="0.75" />
              <path d="M 0,-48 Q 28,-28 0,0 Q 28,28 0,48 Q -28,28 0,0 Q -28,-28 0,-48 Z" fill="rgba(239, 68, 68, 0.45)" />
              <circle cx="0" cy="0" r="20" fill="#ffffff" filter="url(#nkGlowRed)" />
            </g>
          ) : (
            <g style={{ transformOrigin: '0 0', animation: 'nkSpinReverse 16s linear infinite', willChange: 'transform' }}>
              <circle cx="0" cy="0" r="52" fill="url(#abyssOceanCore)" />
              <circle cx="0" cy="0" r="55" fill="none" stroke="#38bdf8" strokeWidth="1.8" opacity="0.9" />
              <circle cx="0" cy="0" r="48" fill="none" stroke="#06b6d4" strokeWidth="1.2" opacity="0.75" />
              <path d="M 0,-50 Q 34,-18 0,0 Q 34,18 0,50 Q -34,18 0,0 Q -34,-18 0,-50 Z" fill="rgba(6, 182, 212, 0.45)" />
              <circle cx="0" cy="0" r="22" fill="#ffffff" filter="url(#nkGlowCyan)" />
            </g>
          )}

          {/* DỊ TƯỢNG 1: THẦN THÚ HUYẾT HỔ */}
          {viewMode === 'the' && hasTiger && (
            <g
              transform="translate(0, -25)"
              style={{
                animation: 'nkTigerMajestic 4s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite',
                transformOrigin: '0px 0px',
                willChange: 'transform'
              }}
            >
              <circle cx="0" cy="0" r="195" fill="url(#tigerAuraGlow)" />
              <g style={{ animation: 'nkTigerClawSlash 2.2s ease-in-out infinite', willChange: 'transform, opacity' }}>
                <path d="M -165,-100 Q -120,-60 -90,-35" stroke="#fef08a" strokeWidth="4.2" strokeLinecap="round" opacity="0.95" filter="url(#nkGlowGold)" />
                <path d="M -145,-118 Q -105,-78 -75,-50" stroke="#fef08a" strokeWidth="4.2" strokeLinecap="round" opacity="0.95" filter="url(#nkGlowGold)" />
                <path d="M -180,-80 Q -140,-45 -110,-15" stroke="#fef08a" strokeWidth="4.2" strokeLinecap="round" opacity="0.95" filter="url(#nkGlowGold)" />
                <path d="M 165,-100 Q 120,-60 90,-35" stroke="#fef08a" strokeWidth="4.2" strokeLinecap="round" opacity="0.95" filter="url(#nkGlowGold)" />
                <path d="M 145,-118 Q 105,-78 75,-50" stroke="#fef08a" strokeWidth="4.2" strokeLinecap="round" opacity="0.95" filter="url(#nkGlowGold)" />
                <path d="M 180,-80 Q 140,-45 110,-15" stroke="#fef08a" strokeWidth="4.2" strokeLinecap="round" opacity="0.95" filter="url(#nkGlowGold)" />
              </g>

              <image
                href={imgHuyetHoGod}
                x="-225"
                y="-115"
                width="450"
                height="210"
                preserveAspectRatio="xMidYMid meet"
                style={{
                  filter: 'drop-shadow(0 0 14px rgba(245, 158, 11, 0.85)) drop-shadow(0 0 28px rgba(239, 68, 68, 0.6))',
                  pointerEvents: 'none',
                  willChange: 'transform'
                }}
              />

              <g transform="translate(0, 116)">
                <rect x="-115" y="-14" width="230" height="28" rx="14" fill="rgba(69, 10, 10, 0.95)" stroke="#f59e0b" strokeWidth="1.8" filter="url(#nkGlowGold)" />
                <text y="5" textAnchor="middle" fontSize="12.5" fontWeight="900" fill="#fef08a" letterSpacing="1">
                  {theLvl >= 10 ? 'THẦN THÚ HUYẾT HỔ' : 'HUYẾT HỔ HÓA HÌNH'}
                </text>
              </g>
            </g>
          )}

          {/* DỊ TƯỢNG 2: THẦN THÚ CẤM HẢI LONG KÌNH */}
          {viewMode === 'phap' && hasWhale && (
            <g
              transform="translate(0, -22)"
              style={{
                animation: 'nkWhaleMajestic 5.6s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite',
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
                  filter: 'drop-shadow(0 0 16px rgba(56, 189, 248, 0.9)) drop-shadow(0 0 32px rgba(6, 182, 212, 0.6))',
                  pointerEvents: 'none',
                  willChange: 'transform'
                }}
              />

              <circle cx="-165" cy="20" r="4.5" fill="#a5f3fc" opacity="0.8" />
              <circle cx="-185" cy="40" r="3" fill="#ffffff" opacity="0.9" />
              <circle cx="160" cy="-30" r="3.5" fill="#38bdf8" opacity="0.75" />
              <circle cx="180" cy="-10" r="2.5" fill="#ffffff" opacity="0.85" />

              <g transform="translate(0, 116)">
                <rect x="-115" y="-14" width="230" height="28" rx="14" fill="rgba(8, 47, 73, 0.95)" stroke="#06b6d4" strokeWidth="1.8" filter="url(#nkGlowCyan)" />
                <text y="5" textAnchor="middle" fontSize="12.5" fontWeight="900" fill="#a5f3fc" letterSpacing="1">
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
                color: '#fef08a',
                fontWeight: 900,
                background: 'rgba(239, 68, 68, 0.25)',
                padding: '2px 6px',
                borderRadius: 8,
                border: '1px solid rgba(254, 240, 138, 0.5)',
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
            <span style={{ color: '#7dd3fc', fontWeight: 900, whiteSpace: 'nowrap' }}>Tầng {phapLvl}/10</span>
            <span style={{ fontSize: isMobile ? 10 : 11, color: '#cbd5e1', whiteSpace: 'nowrap' }}>({phapExp.toLocaleString()}/4.500)</span>
            {activePath === 'phap' && (
              <span style={{
                fontSize: 9,
                color: '#bae6fd',
                fontWeight: 900,
                background: 'rgba(6, 182, 212, 0.25)',
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
