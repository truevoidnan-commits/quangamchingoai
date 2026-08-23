
export function getAssetUrl(p) {
  if (!p) return '';
  if (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:')) return p;
  const cleanPath = p.startsWith('/') ? p.slice(1) : p;
  
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    let path = window.location.pathname;
    if (path.includes('.')) {
      path = path.substring(0, path.lastIndexOf('/') + 1);
    }
    if (!path.endsWith('/')) {
      path = path + '/';
    }
    path = path.replace(/\/(cultivation|sanctum|novel|add-novel|edit-novel|search)\/?$/, '/');
    return `${origin}${path}${cleanPath}`;
  }
  
  const base = import.meta.env.BASE_URL || './';
  return base.endsWith('/') ? `${base}${cleanPath}` : `${base}/${cleanPath}`;
}

import React, { useState, useEffect, useMemo } from 'react';
import { useCultivationContext } from '../../context/CultivationContext';
import { 
  LIFE_LAMPS, 
  LAMP_TIERS, 
  SUPPRESSING_ARTIFACTS, 
  TRUC_CO_KHIEU_THRESHOLDS,
  getLampPalaceName,
  getPalaceCost,
  calculateDaoAnhTribulationReward,
  getDaoAnhTierKey,
  KIEP_EXP_REQUIREMENTS,
  TIER_BASE_THIEN_MENH_REWARDS
} from '../../lib/cultivation';
import ArtifactIcon from './ArtifactIcon';
import styles from './RealmPreviewVisualizer.module.css';

/* ============================================================
   1. CẤU HÌNH TỨ ĐẠI LIÊN — 4 ĐÓA GÓC (12 PHẨM)
   Đây là danh hiệu/thành tựu cố định, KHÔNG phụ thuộc vật phẩm
   người chơi gắn vào — luôn hiển thị đúng tên + màu cố định.
   ============================================================ */
export const CORNER_LOTUS_CONFIGS = {
  topLeft: {
    name: 'Tạo Hóa Thanh Liên',
    grade: '12 Phẩm',
    colorBack: '#0f6e56',
    colorFront: '#5dcaa5',
    petalTip: '#9fe1cb',
    coreGlow: 'rgba(93, 202, 165, 0.35)',
    ringColor: '#5dcaa5',
  },
  topRight: {
    name: 'Diệt Thế Hắc Liên',
    grade: '12 Phẩm',
    colorBack: '#0b0b0f',
    colorFront: '#3c3489',
    petalTip: '#7f77dd',
    coreGlow: 'rgba(60, 52, 137, 0.45)',
    ringColor: '#7f77dd',
  },
  bottomLeft: {
    name: 'Công Đức Kim Liên',
    grade: '12 Phẩm',
    colorBack: '#633806',
    colorFront: '#fac775',
    petalTip: '#fde047',
    coreGlow: 'rgba(250, 199, 117, 0.45)',
    ringColor: '#fac775',
  },
  bottomRight: {
    name: 'Nghiệp Hỏa Hồng Liên',
    grade: '12 Phẩm',
    colorBack: '#501313',
    colorFront: '#e24b4a',
    petalTip: '#f09595',
    coreGlow: 'rgba(226, 75, 74, 0.45)',
    ringColor: '#e24b4a',
  },
};

/* Cấu hình đóa Hỗn Độn 36 phẩm — pháp khiếu #121 */
export const HON_DON_THANH_LIEN = {
  name: 'Hỗn Độn Thanh Liên',
  grade: '36 Phẩm',
  unlockIdx: 121,
};

export const normalizeTier = (t) => {
  if (t === 'than_pham') return 'than_pham';
  if (t === 'tien_pham') return 'tien_pham';
  if (t === 'cuc_pham' || t === 'thien_pham') return 'cuc_pham';
  if (t === 'thuong_pham' || t === 'dia_pham') return 'thuong_pham';
  if (t === 'trung_pham' || t === 'huyen_pham') return 'trung_pham';
  return 'ha_pham';
};

/* ============================================================
   HÀM TIỆN ÍCH: sinh path 1 cánh sen theo góc/bán kính
   (tái dùng công thức lượng giác gốc, tham số hóa để dùng
   được cho cả 2 tầng cũ lẫn 3 tầng mới)
   ============================================================ */
export function buildPetalPath(cx, cy, deg, tipR, baseR, ctrlR, spreadBase, spreadCtrl) {
  const rad = (deg * Math.PI) / 180;
  const tipX = cx + tipR * Math.cos(rad);
  const tipY = cy + tipR * Math.sin(rad);
  const leftRad = ((deg - spreadBase) * Math.PI) / 180;
  const rightRad = ((deg + spreadBase) * Math.PI) / 180;
  const midLeftRad = ((deg - spreadCtrl) * Math.PI) / 180;
  const midRightRad = ((deg + spreadCtrl) * Math.PI) / 180;

  const baseLX = cx + baseR * Math.cos(leftRad);
  const baseLY = cy + baseR * Math.sin(leftRad);
  const baseRX = cx + baseR * Math.cos(rightRad);
  const baseRY = cy + baseR * Math.sin(rightRad);

  const ctrlLX = cx + ctrlR * Math.cos(midLeftRad);
  const ctrlLY = cy + ctrlR * Math.sin(midLeftRad);
  const ctrlRX = cx + ctrlR * Math.cos(midRightRad);
  const ctrlRY = cy + ctrlR * Math.sin(midRightRad);

  return {
    d: `M ${baseLX} ${baseLY} Q ${ctrlLX} ${ctrlLY} ${tipX} ${tipY} Q ${ctrlRX} ${ctrlRY} ${baseRX} ${baseRY} Z`,
    tipX,
    tipY,
  };
}

/* ============================================================
   2. COMPONENT: GradeLotusAltar — dùng cho 4 đóa góc (12 phẩm)
   Vẫn 16 cánh (8 ngoài + 8 trong) như slot gốc, nhưng màu cố
   định theo config + thêm ngọn linh hỏa bốc cháy chân thực
   trên đỉnh + tên Mệnh Đăng đồng màu với Liên Đài.
   ============================================================ */
export function GradeLotusAltar({ config, isFilled, lampObj, ArtifactIcon, idx }) {
  const size = 136;
  const cx = 68;
  const cy = 68;
  const outerAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  const innerAngles = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: '100%', maxWidth: 140 }}>
      {/* KEYFRAME ANIMATION NGỌN LỬA CHÁY BỐC LÊN TỰ NHIÊN (THERMAL SHIMMER & RISING GLOW) */}
      <style>{`
        @keyframes flameBurn-${idx} {
          0% {
            transform: translateX(-50%) scaleY(1) scaleX(1);
            filter: drop-shadow(0 -3px 8px ${config.petalTip}) drop-shadow(0 0 16px ${config.colorFront});
            opacity: 0.92;
          }
          35% {
            transform: translateX(-50%) scaleY(1.08) scaleX(0.96);
            filter: drop-shadow(0 -5px 12px ${config.petalTip}) drop-shadow(0 0 22px ${config.colorFront});
            opacity: 1;
          }
          70% {
            transform: translateX(-50%) scaleY(0.96) scaleX(1.03);
            filter: drop-shadow(0 -2px 6px ${config.petalTip}) drop-shadow(0 0 14px ${config.colorFront});
            opacity: 0.88;
          }
          100% {
            transform: translateX(-50%) scaleY(1) scaleX(1);
            filter: drop-shadow(0 -3px 8px ${config.petalTip}) drop-shadow(0 0 16px ${config.colorFront});
            opacity: 0.92;
          }
        }
        @keyframes flameSoftAura-${idx} {
          0%, 100% { transform: scale(1); opacity: 0.65; }
          50% { transform: scale(1.12); opacity: 0.85; }
        }
      `}</style>

      <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        
        {/* NGỌN LỬA LINH HỎA THẦN THÁNH VƯƠN CAO — DÁNG LỬA CHÂN THỰC BỐC LÊN TỰ NHIÊN */}
        <div style={{
          position: 'absolute',
          top: -24,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 26,
          height: 38,
          transformOrigin: 'bottom center',
          pointerEvents: 'none',
          zIndex: 1,
          animation: `flameBurn-${idx} 2s ease-in-out infinite`
        }}>
          {/* Lớp quầng hào quang tỏa sáng mềm mại */}
          <div style={{
            position: 'absolute',
            inset: -6,
            borderRadius: '50% 50% 30% 30% / 60% 60% 35% 35%',
            background: `radial-gradient(ellipse at 50% 80%, ${config.petalTip} 0%, ${config.colorFront} 50%, transparent 80%)`,
            filter: 'blur(7px)',
            animation: `flameSoftAura-${idx} 2.2s ease-in-out infinite`
          }} />

          {/* Thân ngọn lửa chính — chuyển sắc êm từ đỉnh nhọn xuống đáy */}
          <div style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50% 50% 25% 25% / 60% 60% 35% 35%',
            background: `radial-gradient(ellipse at 50% 85%, #ffffff 5%, ${config.petalTip} 35%, ${config.colorFront} 75%, transparent 100%)`,
            opacity: 0.95
          }} />

          {/* Vệt lõi sâu tạo chiều sâu 3D cho ngọn lửa chân thực */}
          <div style={{
            position: 'absolute',
            bottom: 4,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 8,
            height: 18,
            borderRadius: '50% 50% 30% 30% / 60% 60% 40% 40%',
            background: `radial-gradient(ellipse at 50% 80%, #ffffff 20%, ${config.petalTip} 85%, transparent 100%)`,
            filter: 'blur(0.8px)',
            opacity: 0.95
          }} />
        </div>

        {/* SVG ĐÓA SEN 16 CÁNH 2 TẦNG */}
        <svg width={size} height={size} viewBox="0 0 136 136" style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}>
          <defs>
                  {/* GRADIENTS THỦY TINH LAM NGỌC SÁNG (BRIGHT AZURE GLASS) */}
                  <linearGradient id="azureGlassGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="rgba(14, 65, 115, 0.94)" />
                    <stop offset="50%" stopColor="rgba(8, 38, 74, 0.92)" />
                    <stop offset="100%" stopColor="rgba(3, 20, 44, 0.97)" />
                  </linearGradient>

                  <linearGradient id="azureGlowBorder" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#38bdf8" />
                    <stop offset="50%" stopColor="#7dd3fc" />
                    <stop offset="100%" stopColor="#0284c7" />
                  </linearGradient>

                  <filter id="azureGlassShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0284c7" flood-opacity="0.35" />
                    <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#000000" flood-opacity="0.9" />
                  </filter>
            <linearGradient id={`gradeBack-${idx}`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="rgba(2, 6, 15, 0.98)" />
              <stop offset="55%" stopColor={config.colorBack} stopOpacity="0.7" />
              <stop offset="100%" stopColor={config.petalTip} stopOpacity="0.95" />
            </linearGradient>
            <linearGradient id={`gradeFront-${idx}`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="rgba(4, 12, 24, 0.95)" />
              <stop offset="50%" stopColor={config.colorFront} stopOpacity="0.85" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.98" />
            </linearGradient>
            <radialGradient id={`gradeCore-${idx}`}>
              <stop offset="0%" stopColor={config.coreGlow} />
              <stop offset="70%" stopColor="rgba(4, 10, 20, 0.92)" />
              <stop offset="100%" stopColor="rgba(2, 6, 14, 0.98)" />
            </radialGradient>
            <filter id={`gradeGlow-${idx}`}>
              <feGaussianBlur stdDeviation="2.0" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Hào quang nền */}
          <circle cx={cx} cy={cy} r="62" fill={config.colorFront} opacity="0.32" filter={`url(#gradeGlow-${idx})`} />

          {/* Viền đẳng cấp kép */}
          <circle cx={cx} cy={cy} r="65" fill="none" stroke={config.ringColor} strokeWidth="0.8" opacity="0.55" strokeDasharray="3 3" />
          <circle cx={cx} cy={cy} r="59" fill="none" stroke={config.ringColor} strokeWidth="0.6" opacity="0.4" />

          {/* Lớp 1: 8 cánh ngoài */}
          {outerAngles.map((deg, i) => {
            const { d, tipX, tipY } = buildPetalPath(cx, cy, deg, 62, 25, 44, 18, 22);
            return (
              <g key={`grade-outer-${i}`}>
                <path d={d} fill={`url(#gradeBack-${idx})`} stroke={config.ringColor} strokeWidth="1.2" opacity="0.95" />
                <circle cx={tipX} cy={tipY} r="1.9" fill={config.ringColor} filter={`url(#gradeGlow-${idx})`} />
              </g>
            );
          })}

          {/* Lớp 2: 8 cánh trong */}
          {innerAngles.map((deg, i) => {
            const { d } = buildPetalPath(cx, cy, deg, 49, 22, 35, 16, 19);
            return (
              <path
                key={`grade-inner-${i}`}
                d={d}
                fill={`url(#gradeFront-${idx})`}
                stroke={config.colorFront}
                strokeWidth="1.4"
              />
            );
          })}

          {/* Nhụy trung tâm */}
          <circle cx={cx} cy={cy} r="28" fill={`url(#gradeCore-${idx})`} stroke={config.ringColor} strokeWidth="1.8" filter={`url(#gradeGlow-${idx})`} />
          <circle cx={cx} cy={cy} r="25" fill="none" stroke={config.colorFront} strokeWidth="1.2" opacity="0.85" strokeDasharray="3 1.5" />
        </svg>

        <div style={{
          position: 'relative',
          zIndex: 3,
          width: 50,
          height: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          boxShadow: isFilled ? `0 0 12px ${config.coreGlow}` : 'none'
        }}>
          {isFilled ? (
            <ArtifactIcon item={lampObj} isLamp={true} size={50} />
          ) : (
            <span style={{ fontSize: 28, fontWeight: 800, color: config.petalTip, textShadow: `0 0 10px ${config.coreGlow}` }}>+</span>
          )}
        </div>
      </div>

      {/* Nhãn tên Liên Đài & Tên Mệnh Đăng Gọn Gàng Trong Thẻ Thủy Tinh (Không Bị Chạm Vào Sao) */}
      <div style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        background: 'rgba(6, 12, 24, 0.82)',
        border: `1.2px solid ${config.ringColor}66`,
        borderRadius: 14,
        padding: '4px 12px',
        backdropFilter: 'blur(8px)',
        boxShadow: `0 4px 15px rgba(0,0,0,0.85), 0 0 14px ${config.coreGlow}44`,
        marginTop: 4,
        maxWidth: 155
      }}>
        <div style={{
          fontSize: 12,
          fontWeight: 800,
          color: config.petalTip,
          letterSpacing: 0.4,
          fontFamily: 'var(--font-serif, serif)',
          textShadow: `0 0 8px ${config.coreGlow}`,
          whiteSpace: 'nowrap'
        }}>
          {config.name}
        </div>

        {isFilled && lampObj ? (
          <div style={{
            fontSize: 10.5,
            fontWeight: 800,
            color: config.petalTip,
            marginTop: 1,
            textShadow: `0 0 8px ${config.coreGlow}`,
            whiteSpace: 'nowrap'
          }}>
            {lampObj.name || lampObj.shortName}
          </div>
        ) : (
          <div style={{
            fontSize: 9.5,
            color: 'rgba(255,255,255,0.6)',
            marginTop: 1
          }}>
            {config.grade}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   3. COMPONENT: ChaosLotusThrone — Hỗn Độn Thanh Liên (36 phẩm)
   Slot #121 — 3 tầng x 12 cánh = 36 cánh, gradient ngũ sắc,
   kích thước lớn hơn hẳn, vành hào quang kép xoay ngược chiều.
   ============================================================ */
export function ChaosLotusThrone({ isFilled, lampObj, ArtifactIcon, idx = 'chaos' }) {
  const size = 176;
  const cx = 88;
  const cy = 88;

  const tier1Angles = Array.from({ length: 12 }, (_, i) => i * 30);            // ngoài
  const tier2Angles = Array.from({ length: 12 }, (_, i) => i * 30 + 15);       // giữa
  const tier3Angles = Array.from({ length: 12 }, (_, i) => i * 30);            // trong

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* KEYFRAME ANIMATION ĐỔI MÀU NGŨ SẮC LUNG LINH HUYỀN ẢO */}
      <style>{`
        @keyframes chaosChromaShift {
          0%   { filter: hue-rotate(0deg) brightness(1.2) drop-shadow(0 0 14px rgba(93, 202, 165, 0.8)); }
          25%  { filter: hue-rotate(90deg) brightness(1.3) drop-shadow(0 0 18px rgba(56, 189, 248, 0.85)); }
          50%  { filter: hue-rotate(180deg) brightness(1.25) drop-shadow(0 0 20px rgba(168, 85, 247, 0.9)); }
          75%  { filter: hue-rotate(270deg) brightness(1.35) drop-shadow(0 0 22px rgba(251, 191, 36, 0.95)); }
          100% { filter: hue-rotate(360deg) brightness(1.2) drop-shadow(0 0 14px rgba(93, 202, 165, 0.8)); }
        }
        @keyframes chaosPulseGlow {
          0%, 100% { transform: scale(1); opacity: 0.85; }
          50%      { transform: scale(1.06); opacity: 1; }
        }
        @keyframes chaosRingCW  { from { transform: rotate(0deg);   } to { transform: rotate(360deg);  } }
        @keyframes chaosRingCCW { from { transform: rotate(360deg); } to { transform: rotate(0deg);     } }
      `}</style>

      {/* VÙNG SVG ĐÓA SEN 36 CÁNH TỰ ĐỘNG ĐỔI MÀU LUNG LINH RỰC RỠ */}
      <div style={{
        position: 'absolute',
        inset: 0,
        animation: 'chaosChromaShift 10s ease-in-out infinite',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <svg width={size} height={size} viewBox="0 0 176 176" style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}>
          <defs>
            {/* Tầng ngoài: đen -> lục hỗn mang (Tạo Hóa) */}
            <linearGradient id={`chaosOuter-${idx}`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="rgba(2,6,15,0.98)" />
              <stop offset="45%" stopColor="#0f6e56" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#5dcaa5" stopOpacity="1" />
            </linearGradient>
            {/* Tầng giữa: đen -> tím hắc (Diệt Thế) */}
            <linearGradient id={`chaosMid-${idx}`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="rgba(4,10,22,0.96)" />
              <stop offset="45%" stopColor="#3c3489" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="1" />
            </linearGradient>
            {/* Tầng trong: đen -> kim -> bạch (Công Đức + Nghiệp Hỏa) */}
            <linearGradient id={`chaosInner-${idx}`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="rgba(6,4,2,0.95)" />
              <stop offset="40%" stopColor="#f59e0b" stopOpacity="0.8" />
              <stop offset="75%" stopColor="#fde047" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
            </linearGradient>
            <radialGradient id={`chaosCore-${idx}`}>
              <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
              <stop offset="35%" stopColor="rgba(253,224,71,0.85)" />
              <stop offset="70%" stopColor="rgba(6,8,16,0.95)" />
              <stop offset="100%" stopColor="rgba(2,4,10,0.99)" />
            </radialGradient>
            <filter id={`chaosGlow-${idx}`}>
              <feGaussianBlur stdDeviation="2.5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Hào quang nền sáng lung linh */}
          <circle cx={cx} cy={cy} r="86" fill="#5dcaa5" opacity="0.3" filter={`url(#chaosGlow-${idx})`} style={{ animation: 'chaosPulseGlow 3s ease-in-out infinite' }} />
          <circle cx={cx} cy={cy} r="76" fill="#fde047" opacity="0.25" filter={`url(#chaosGlow-${idx})`} />

          {/* Tầng 1: 12 cánh ngoài (r tip = 85, r base = 42) */}
          {tier1Angles.map((deg, i) => {
            const { d, tipX, tipY } = buildPetalPath(cx, cy, deg, 85, 42, 64, 12, 15);
            return (
              <g key={`t1-${i}`}>
                <path d={d} fill={`url(#chaosOuter-${idx})`} stroke="#a7f3d0" strokeWidth="1.2" opacity="0.98" />
                <circle cx={tipX} cy={tipY} r="2.0" fill="#ffffff" filter={`url(#chaosGlow-${idx})`} />
              </g>
            );
          })}

          {/* Tầng 2: 12 cánh giữa (r tip = 72, r base = 42) */}
          {tier2Angles.map((deg, i) => {
            const { d, tipX, tipY } = buildPetalPath(cx, cy, deg, 72, 42, 57, 11, 14);
            return (
              <g key={`t2-${i}`}>
                <path d={d} fill={`url(#chaosMid-${idx})`} stroke="#c4b5fd" strokeWidth="1.3" opacity="0.98" />
                <circle cx={tipX} cy={tipY} r="1.8" fill="#ffffff" filter={`url(#chaosGlow-${idx})`} />
              </g>
            );
          })}

          {/* Tầng 3: 12 cánh trong (r tip = 58, r base = 42) */}
          {tier3Angles.map((deg, i) => {
            const { d, tipX, tipY } = buildPetalPath(cx, cy, deg, 58, 42, 50, 10, 13);
            return (
              <g key={`t3-${i}`}>
                <path d={d} fill={`url(#chaosInner-${idx})`} stroke="#fef08a" strokeWidth="1.4" />
                <circle cx={tipX} cy={tipY} r="1.8" fill="#ffffff" filter={`url(#chaosGlow-${idx})`} />
              </g>
            );
          })}

          {/* Vành hào quang kép quay ngược chiều */}
          <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'chaosRingCW 14s linear infinite' }}>
            <circle cx={cx} cy={cy} r="45" fill="none" stroke="#fde047" strokeWidth="1.0" opacity="0.85" strokeDasharray="6 4" />
          </g>
          <g style={{ transformOrigin: `${cx}px ${cy}px`, animation: 'chaosRingCCW 18s linear infinite' }}>
            <circle cx={cx} cy={cy} r="43" fill="none" stroke="#ffffff" strokeWidth="0.9" opacity="0.8" strokeDasharray="4 3" />
          </g>

          {/* Nhụy trung tâm mở rộng (Đường kính 82px) */}
          <circle cx={cx} cy={cy} r="41" fill={`url(#chaosCore-${idx})`} stroke="#fde047" strokeWidth="2.4" filter={`url(#chaosGlow-${idx})`} />
          <circle cx={cx} cy={cy} r="39" fill="none" stroke="#ffffff" strokeWidth="1.1" opacity="0.9" strokeDasharray="3 2" />
        </svg>
      </div>

      {/* TÂM KHÍ KHIẾU / MỆNH ĐĂNG THỨ 5 (KÍCH THƯỚC KHỔNG LỒ 78PX RÕ NÉT) */}
      <div style={{
        position: 'relative',
        zIndex: 3,
        width: 78,
        height: 78,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        boxShadow: isFilled 
          ? '0 0 20px rgba(253, 224, 71, 0.95), inset 0 0 10px rgba(255, 255, 255, 0.4)' 
          : '0 0 12px rgba(253, 224, 71, 0.4)',
        background: 'transparent',
        border: isFilled ? '1.5px solid rgba(253, 224, 71, 0.8)' : '1.5px dashed rgba(253, 224, 71, 0.5)'
      }}>
        {isFilled ? (
          <ArtifactIcon item={lampObj} isLamp={true} size={78} />
        ) : (
          <span style={{ fontSize: 36, fontWeight: 900, color: '#ffffff', textShadow: '0 0 14px #fde047, 0 0 24px #ffffff' }}>+</span>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   4. COMPONENT: LockedChaosSlot — hiển thị khi #121 chưa mở khóa
   ============================================================ */
export function LockedChaosSlot() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div
        style={{
          width: 110,
          height: 110,
          borderRadius: '50%',
          border: '1px dashed rgba(255,255,255,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(255,255,255,0.03)',
        }}
      >
        <span style={{ fontSize: 26, color: 'rgba(255,255,255,0.35)' }}>🔒</span>
      </div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>Pháp khiếu #121 — chưa khai mở</div>
    </div>
  );
}

/* ============================================================
   5. COMPONENT GỐC — StandardLotusAltar (giữ nguyên logic cũ,
   dùng flameColor động theo phẩm chất vật phẩm gắn vào slot)
   ============================================================ */
export function StandardLotusAltar({ altar, flameColor = '#fbbf24', isFilled = false, lampObj = null, ArtifactIcon }) {
  const cx = 55;
  const cy = 55;
  const outerAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  const innerAngles = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];

  return (
    <div style={{ position: 'relative', width: 110, height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="110" height="110" viewBox="0 0 110 110" style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}>
        <defs>
          <linearGradient id={`pureLotusBack-${altar?.idx || 0}`} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="rgba(2, 6, 15, 0.98)" />
            <stop offset="55%" stopColor={flameColor} stopOpacity="0.45" />
            <stop offset="100%" stopColor="#fde047" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id={`pureLotusFront-${altar?.idx || 0}`} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="rgba(4, 12, 24, 0.95)" />
            <stop offset="50%" stopColor={flameColor} stopOpacity="0.7" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.95" />
          </linearGradient>
          <radialGradient id={`stamenCore-${altar?.idx || 0}`}>
            <stop offset="0%" stopColor="rgba(251, 191, 36, 0.3)" />
            <stop offset="70%" stopColor="rgba(4, 10, 20, 0.92)" />
            <stop offset="100%" stopColor="rgba(2, 6, 14, 0.98)" />
          </radialGradient>
          <filter id="starBurstGlow">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="laserGlow">
            <feGaussianBlur stdDeviation="1.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <circle cx={cx} cy={cy} r="50" fill={flameColor} opacity="0.3" filter="url(#starBurstGlow)" />

        {outerAngles.map((deg, i) => {
          const rad = (deg * Math.PI) / 180;
          const { d, tipX, tipY } = buildPetalPath(cx, cy, deg, 50, 20, 35, 18, 22);
          return (
            <g key={`outer-petal-${i}`}>
              <path d={d} fill={`url(#pureLotusBack-${altar?.idx || 0})`} stroke="#fbbf24" strokeWidth="1.1" opacity="0.92" />
              <line
                x1={cx + 18 * Math.cos(rad)} y1={cy + 18 * Math.sin(rad)}
                x2={tipX} y2={tipY}
                stroke="#fbbf24" strokeWidth="0.75" opacity="0.8"
              />
              <circle cx={tipX} cy={tipY} r="1.6" fill="#fbbf24" /* no-filter */ />
            </g>
          );
        })}

        {innerAngles.map((deg, i) => {
          const rad = (deg * Math.PI) / 180;
          const { d, tipX, tipY } = buildPetalPath(cx, cy, deg, 40, 18, 28, 16, 19);
          return (
            <g key={`inner-petal-${i}`}>
              <path d={d} fill={`url(#pureLotusFront-${altar?.idx || 0})`} stroke={flameColor} strokeWidth="1.3" />
              <line
                x1={cx + 18 * Math.cos(rad)} y1={cy + 18 * Math.sin(rad)}
                x2={tipX} y2={tipY}
                stroke="#ffffff" strokeWidth="0.85" opacity="0.85"
              />
              <circle cx={tipX} cy={tipY} r="1.3" fill="#ffffff" filter="url(#laserGlow)" />
            </g>
          );
        })}

        {[...Array(16)].map((_, sIdx) => {
          const sAngle = (sIdx * 22.5 * Math.PI) / 180;
          return (
            <line
              key={`stamen-ray-${sIdx}`}
              x1={cx + 20 * Math.cos(sAngle)} y1={cy + 20 * Math.sin(sAngle)}
              x2={cx + 26 * Math.cos(sAngle)} y2={cy + 26 * Math.sin(sAngle)}
              stroke="#fbbf24" strokeWidth="1.2" strokeLinecap="round" filter="url(#laserGlow)"
            />
          );
        })}

        <circle cx={cx} cy={cy} r="23" fill={`url(#stamenCore-${altar?.idx || 0})`} stroke="#fbbf24" strokeWidth="1.6" filter="url(#laserGlow)" />
        <circle cx={cx} cy={cy} r="21" fill="none" stroke={flameColor} strokeWidth="1" opacity="0.8" strokeDasharray="3 1.5" />
      </svg>

      <div style={{ position: 'relative', zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isFilled ? (
          <ArtifactIcon item={lampObj} isLamp={true} size={34} />
        ) : (
          <span style={{ fontSize: 22, fontWeight: 700, color: 'rgba(255, 204, 0, 0.85)', textShadow: '0 0 8px rgba(255, 204, 0, 0.7)' }}>+</span>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   6. DISPATCHER — logic chọn component theo vị trí / trạng thái
   ============================================================ */
export function LotusAltarSlot({ altar, flameColor = '#fbbf24', isFilled = false, lampObj = null, ArtifactIcon, phapKhieuUnlocked = 0 }) {
  const isSpecial121 = altar?.idx === HON_DON_THANH_LIEN.unlockIdx || altar?.position === 'center';
  const isCorner = altar?.position && CORNER_LOTUS_CONFIGS[altar.position];

  if (isSpecial121) {
    if (phapKhieuUnlocked < HON_DON_THANH_LIEN.unlockIdx) {
      return <LockedChaosSlot />;
    }
    return <ChaosLotusThrone isFilled={isFilled} lampObj={lampObj} ArtifactIcon={ArtifactIcon} idx={altar?.idx || 'chaos'} />;
  }

  if (isCorner) {
    return (
      <GradeLotusAltar
        config={isCorner}
        isFilled={isFilled}
        lampObj={lampObj}
        ArtifactIcon={ArtifactIcon}
        idx={altar?.idx || 0}
      />
    );
  }

  return (
    <StandardLotusAltar
      altar={altar}
      flameColor={flameColor}
      isFilled={isFilled}
      lampObj={lampObj}
      ArtifactIcon={ArtifactIcon}
    />
  );
}



export function TitanDharmaAvatar({ da, lampId = '', artifactId = '', name = '', element = '', themeColor = '#facc15', isMax = false }) {
  const rawKey = (artifactId || lampId || name || da?.id || da?.name || '').toLowerCase();
  const normKey = rawKey.replace(/^(lamp_|artifact_)/, '');
  const full = (name || da?.name || '').toLowerCase();

  // Helper matching
  const has = (...keys) => keys.some(k => full.includes(k) || normKey.includes(k));

  /* ============================================================
     1. 🦅 HỆ PHƯỢNG HOÀNG / CHU TƯỚC / HỎA THẦN (Phượng Đăng, Chu Tước)
     ============================================================ */
  if (has('phượng', 'phuong', 'tước', 'tuoc', 'chu tước', 'hỏa phụng')) {
    return (
      <g>
        <defs>
          <radialGradient id="phoenix_aura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffedd5" stopOpacity="0.9"/>
            <stop offset="30%" stopColor="#f97316" stopOpacity="0.8"/>
            <stop offset="70%" stopColor="#dc2626" stopOpacity="0.5"/>
            <stop offset="100%" stopColor="#7f1d1d" stopOpacity="0"/>
          </radialGradient>
          <filter id="phx_glow"><feGaussianBlur stdDeviation="3" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
        </defs>
        {/* Background Hào Quang Phượng Lửa */}
        <circle cx="0" cy="-2" r="32" fill="url(#phoenix_aura)" filter="url(#phx_glow)" style={{ animation: 'pulseAura 2.2s ease-in-out infinite' }}/>
        {/* Đôi Cánh Phượng Hoàng Giang Rộng Phát Quang */}
        <path d="M -6,4 Q -32,-16 -24,-34 Q -16,-22 -6,-10 Q -24,4 -6,4 Z" fill="#ea580c" stroke="#fde047" strokeWidth="1.2" filter="url(#phx_glow)" style={{ transformOrigin: '0 0', animation: 'wingFlutter 2s ease-in-out infinite' }}/>
        <path d="M 6,4 Q 32,-16 24,-34 Q 16,-22 6,-10 Q 24,4 6,4 Z" fill="#ea580c" stroke="#fde047" strokeWidth="1.2" filter="url(#phx_glow)" style={{ transformOrigin: '0 0', animation: 'wingFlutter 2s ease-in-out infinite', animationDelay: '0.2s' }}/>
        {/* Đuôi Phượng Lửa 3 Dải */}
        <path d="M -4,16 Q -12,28 -16,36 M 0,18 Q 0,30 0,40 M 4,16 Q 12,28 16,36" fill="none" stroke="#fde047" strokeWidth="1.8" strokeLinecap="round" filter="url(#phx_glow)"/>
        {/* Kim Thân Ngồi Thiền Phượng Hoàng */}
        <ellipse cx="0" cy="14" rx="14" ry="6" fill="#c2410c" stroke="#fde047" strokeWidth="1.2"/>
        <path d="M -8,12 C -11,0 -8,-10 0,-12 C 8,-10 11,0 8,12 Z" fill="#ea580c" stroke="#fde047" strokeWidth="1.2"/>
        {/* Trái Tim Lửa Phượng Hoàng */}
        <circle cx="0" cy="0" r="4.5" fill="#fff" filter="url(#phx_glow)" style={{ animation: 'danBobbing 1.8s ease-in-out infinite' }}/>
        {/* Đầu & Miện Vương Chu Tước */}
        <circle cx="0" cy="-16" r="6.5" fill="#fef08a" stroke="#ea580c" strokeWidth="1"/>
        <polygon points="0,-26 3,-21 0,-23 -3,-21" fill="#fde047" filter="url(#phx_glow)"/>
      </g>
    );
  }

  /* ============================================================
     2. 😈 HỆ MA TÂM / MA THẦN / TỊCH DIỆT (Ma Tâm Đăng, Hư Vô)
     ============================================================ */
  if (has('ma tâm', 'ma tam', 'ma', 'tịch diệt', 'tich diet', 'thôn thiên', 'hư vô')) {
    return (
      <g>
        <defs>
          <radialGradient id="matam_aura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.8"/>
            <stop offset="40%" stopColor="#9333ea" stopOpacity="0.6"/>
            <stop offset="80%" stopColor="#3b0764" stopOpacity="0.3"/>
            <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
          </radialGradient>
          <filter id="mt_glow"><feGaussianBlur stdDeviation="3" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
        </defs>
        <circle cx="0" cy="-2" r="32" fill="url(#matam_aura)" filter="url(#mt_glow)"/>
        {/* Đôi Cánh Ma Hắc Ám */}
        <path d="M -8,2 Q -34,-14 -26,-30 Q -18,-18 -8,-8 Z" fill="#4c0519" stroke="#f43f5e" strokeWidth="1.4" filter="url(#mt_glow)"/>
        <path d="M 8,2 Q 34,-14 26,-30 Q 18,-18 8,-8 Z" fill="#4c0519" stroke="#f43f5e" strokeWidth="1.4" filter="url(#mt_glow)"/>
        {/* Đôi Sừng Ma Thần */}
        <path d="M -4,-18 Q -16,-28 -12,-36 Q -6,-28 -2,-22" fill="#881337" stroke="#fb7185" strokeWidth="1.2" filter="url(#mt_glow)"/>
        <path d="M 4,-18 Q 16,-28 12,-36 Q 6,-28 2,-22" fill="#881337" stroke="#fb7185" strokeWidth="1.2" filter="url(#mt_glow)"/>
        {/* Thân Ma Thần 4 Tay */}
        <ellipse cx="0" cy="14" rx="14" ry="6" fill="#3b0764" stroke="#f43f5e" strokeWidth="1.2"/>
        <path d="M -8,12 C -12,0 -8,-10 0,-12 C 8,-10 12,0 8,12 Z" fill="#581c87" stroke="#f43f5e" strokeWidth="1.2"/>
        {/* Hạt Nhân Ma Tâm Đỏ Tía Phát Sáng */}
        <circle cx="0" cy="0" r="5.5" fill="#f43f5e" filter="url(#mt_glow)" style={{ animation: 'pulseAura 1.5s ease-in-out infinite' }}/>
        <circle cx="0" cy="0" r="2.5" fill="#fff"/>
        {/* Đầu Ma Thần */}
        <circle cx="0" cy="-16" r="6.5" fill="#e9d5ff" stroke="#9333ea" strokeWidth="1"/>
        <circle cx="0" cy="-16" r="1.5" fill="#ef4444" filter="url(#mt_glow)"/>
      </g>
    );
  }

  /* ============================================================
     3. 🟣 HỆ TỬ VI / HỒNG MÔNG / TỤ KHÍ (Tử Vi Tụ Khí, Hồng Mông)
     ============================================================ */
  if (has('từ vi', 'tu vi', 'tử vi', 'tụ khí', 'tu khi', 'hồng mông', 'hong mong', 'lư khí', 'lu khi')) {
    return (
      <g>
        <defs>
          <radialGradient id="tuvi_aura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f3e8ff" stopOpacity="0.8"/>
            <stop offset="40%" stopColor="#a855f7" stopOpacity="0.7"/>
            <stop offset="80%" stopColor="#581c87" stopOpacity="0.4"/>
            <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
          </radialGradient>
          <filter id="tv_glow"><feGaussianBlur stdDeviation="3" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
        </defs>
        <circle cx="0" cy="-2" r="32" fill="url(#tuvi_aura)" filter="url(#tv_glow)"/>
        {/* Dải Lụa Tử Khí Thiên Hà Bay Lượn */}
        <path d="M -22,12 Q -30,-12 -18,-26 Q -6,-16 -12,2 Z" fill="none" stroke="#c084fc" strokeWidth="2" filter="url(#tv_glow)" style={{ animation: 'wingFlutter 3s ease-in-out infinite' }}/>
        <path d="M 22,12 Q 30,-12 18,-26 Q 6,-16 12,2 Z" fill="none" stroke="#c084fc" strokeWidth="2" filter="url(#tv_glow)" style={{ animation: 'wingFlutter 3s ease-in-out infinite', animationDelay: '0.3s' }}/>
        {/* Kim Thân Đạo Bào Tím Cổ Phong */}
        <ellipse cx="0" cy="14" rx="14" ry="6" fill="#3b0764" stroke="#c084fc" strokeWidth="1.2"/>
        <path d="M -8,12 C -11,0 -8,-10 0,-12 C 8,-10 11,0 8,12 Z" fill="#6b21a8" stroke="#c084fc" strokeWidth="1.2"/>
        {/* Bảo Đỉnh Lư Hương Khói Tím */}
        <path d="M -6,0 L 6,0 L 4,6 L -4,6 Z" fill="#fbbf24" stroke="#d97706" strokeWidth="0.8" filter="url(#tv_glow)"/>
        <circle cx="0" cy="-3" r="3" fill="#e879f9" filter="url(#tv_glow)"/>
        {/* Đầu Đạo Gia Búi Tóc Cài Trâm Tím */}
        <circle cx="0" cy="-16" r="6.5" fill="#f3e8ff" stroke="#7c3aed" strokeWidth="1"/>
        <line x1="-8" y1="-23" x2="8" y2="-23" stroke="#c084fc" strokeWidth="2" strokeLinecap="round" filter="url(#tv_glow)"/>
      </g>
    );
  }

  /* ============================================================
     4. 🎋 HỆ THANH NGỌC BỘI / NGỌC BỘI / BÍCH NGỌC
     ============================================================ */
  if (has('ngọc bội', 'ngoc boi', 'thanh ngọc', 'thanh ngoc', 'ngọc', 'bích ngọc')) {
    return (
      <g>
        <defs>
          <radialGradient id="ngoc_aura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ecfdf5" stopOpacity="0.9"/>
            <stop offset="40%" stopColor="#10b981" stopOpacity="0.7"/>
            <stop offset="80%" stopColor="#064e3b" stopOpacity="0.3"/>
            <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
          </radialGradient>
          <filter id="ng_glow"><feGaussianBlur stdDeviation="3" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
        </defs>
        <circle cx="0" cy="-2" r="32" fill="url(#ngoc_aura)" filter="url(#ng_glow)"/>
        {/* Tấm Ngọc Bội Bát Giác Lơ Lửng Sau Lưng */}
        <polygon points="0,-28 18,-18 24,0 18,18 0,28 -18,18 -24,0 -18,-18" fill="rgba(6, 78, 59, 0.85)" stroke="#34d399" strokeWidth="1.6" filter="url(#ng_glow)" style={{ transformOrigin: '0 0', animation: 'spinSlowReverse 16s linear infinite' }}/>
        {/* Kim Thân Ngồi Thiền Áo Xanh Ngọc */}
        <ellipse cx="0" cy="14" rx="14" ry="6" fill="#064e3b" stroke="#34d399" strokeWidth="1.2"/>
        <path d="M -8,12 C -11,0 -8,-10 0,-12 C 8,-10 11,0 8,12 Z" fill="#047857" stroke="#34d399" strokeWidth="1.2"/>
        {/* Khối Ngọc Phát Quang Ở Ngực */}
        <polygon points="0,-4 5,2 0,8 -5,2" fill="#a7f3d0" stroke="#34d399" strokeWidth="1" filter="url(#ng_glow)"/>
        {/* Đầu & Ngọc Quan */}
        <circle cx="0" cy="-16" r="6.5" fill="#f0fdf4" stroke="#059669" strokeWidth="1"/>
        <path d="M -4,-22 L 0,-27 L 4,-22 Z" fill="#34d399" filter="url(#ng_glow)"/>
      </g>
    );
  }

  /* ============================================================
     5. 📿 HỆ NHIẾP PHÁCH / SƠ TÂM / CỬU U
     ============================================================ */
  if (has('nhiếp phách', 'nhiep phach', 'sơ tâm', 'so tam', 'phách', 'linh')) {
    return (
      <g>
        <defs>
          <radialGradient id="nhiep_aura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fef08a" stopOpacity="0.8"/>
            <stop offset="40%" stopColor="#06b6d4" stopOpacity="0.7"/>
            <stop offset="80%" stopColor="#0e7490" stopOpacity="0.3"/>
            <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
          </radialGradient>
          <filter id="np_glow"><feGaussianBlur stdDeviation="3" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
        </defs>
        <circle cx="0" cy="-2" r="32" fill="url(#nhiep_aura)" filter="url(#np_glow)"/>
        {/* Vòng Tròn 8 Hạt Hồn Châu Nhiếp Phách Xoay Quanh */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return <circle key={deg} cx={24 * Math.cos(rad)} cy={-2 + 24 * Math.sin(rad)} r="3" fill="#22d3ee" stroke="#0891b2" strokeWidth="0.8" filter="url(#np_glow)"/>;
        })}
        {/* Kim Thân Ngồi Thiền */}
        <ellipse cx="0" cy="14" rx="14" ry="6" fill="#083344" stroke="#22d3ee" strokeWidth="1.2"/>
        <path d="M -8,12 C -11,0 -8,-10 0,-12 C 8,-10 11,0 8,12 Z" fill="#0e7490" stroke="#22d3ee" strokeWidth="1.2"/>
        {/* Linh Phù Nhiếp Phách */}
        <rect x="-3" y="-2" width="6" height="10" rx="1" fill="#fde047" stroke="#ca8a04" strokeWidth="0.8" filter="url(#np_glow)"/>
        {/* Đầu & Đạo Mão */}
        <circle cx="0" cy="-16" r="6.5" fill="#ecfeff" stroke="#0891b2" strokeWidth="1"/>
        <circle cx="0" cy="-24" r="2.5" fill="#fde047" filter="url(#np_glow)"/>
      </g>
    );
  }

  /* ============================================================
     6. 🌊 HỆ BÍCH HẢI / TRIỀU TỊCH / CỰ KÌNH
     ============================================================ */
  if (has('bích hải', 'bich hai', 'triều tịch', 'trieu tich', 'hải', 'thủy')) {
    return (
      <g>
        <defs>
          <radialGradient id="bichhai_aura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.9"/>
            <stop offset="40%" stopColor="#0284c7" stopOpacity="0.8"/>
            <stop offset="80%" stopColor="#075985" stopOpacity="0.4"/>
            <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
          </radialGradient>
          <filter id="bh_glow"><feGaussianBlur stdDeviation="3" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
        </defs>
        <circle cx="0" cy="-2" r="32" fill="url(#bichhai_aura)" filter="url(#bh_glow)"/>
        {/* Vòng Xoáy Thủy Triều 3 Tầng */}
        <path d="M -26,10 Q -18,-16 0,-24 Q 18,-16 26,10" fill="none" stroke="#38bdf8" strokeWidth="2.4" filter="url(#bh_glow)" style={{ animation: 'pulseAura 2s ease-in-out infinite' }}/>
        <path d="M -22,18 Q -14,2 0,-6 Q 14,2 22,18" fill="none" stroke="#67e8f9" strokeWidth="1.6"/>
        {/* Kim Thân Thủy Thần */}
        <ellipse cx="0" cy="14" rx="14" ry="6" fill="#0c4a6e" stroke="#38bdf8" strokeWidth="1.2"/>
        <path d="M -8,12 C -11,0 -8,-10 0,-12 C 8,-10 11,0 8,12 Z" fill="#0284c7" stroke="#38bdf8" strokeWidth="1.2"/>
        {/* Hải Thần Châu */}
        <circle cx="0" cy="0" r="4.5" fill="#e0f2fe" filter="url(#bh_glow)" style={{ animation: 'danBobbing 2s ease-in-out infinite' }}/>
        {/* Đầu & Thủy Vương Miện */}
        <circle cx="0" cy="-16" r="6.5" fill="#f0f9ff" stroke="#0284c7" strokeWidth="1"/>
        <polygon points="0,-25 3,-21 0,-22 -3,-21" fill="#38bdf8" filter="url(#bh_glow)"/>
      </g>
    );
  }

  /* ============================================================
     7. 🪞 HỆ HƯ KHÔNG THIÊN KÍNH / THIÊN KÍNH / KÍNH
     ============================================================ */
  if (has('thiên kính', 'thien kinh', 'hư không', 'hu khong', 'kính', 'kinh')) {
    return (
      <g>
        <defs>
          <radialGradient id="kinh_aura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f0fdfa" stopOpacity="0.9"/>
            <stop offset="40%" stopColor="#0d9488" stopOpacity="0.7"/>
            <stop offset="80%" stopColor="#115e59" stopOpacity="0.3"/>
            <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
          </radialGradient>
          <filter id="tk_glow"><feGaussianBlur stdDeviation="3" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
        </defs>
        <circle cx="0" cy="-2" r="32" fill="url(#kinh_aura)" filter="url(#tk_glow)"/>
        {/* Tấm Gương Bát Quái Hư Không Xoay Vần */}
        <polygon points="0,-26 18,-18 26,0 18,18 0,26 -18,18 -26,0 -18,-18" fill="none" stroke="#2dd4bf" strokeWidth="2" strokeDasharray="4 4" filter="url(#tk_glow)" style={{ transformOrigin: '0 0', animation: 'spinSlow 12s linear infinite' }}/>
        {/* Kim Thân Ngồi Thiền */}
        <ellipse cx="0" cy="14" rx="14" ry="6" fill="#134e4a" stroke="#2dd4bf" strokeWidth="1.2"/>
        <path d="M -8,12 C -11,0 -8,-10 0,-12 C 8,-10 11,0 8,12 Z" fill="#0d9488" stroke="#2dd4bf" strokeWidth="1.2"/>
        {/* Gương Nhỏ Trước Ngực Chiếu Hào Quang */}
        <circle cx="0" cy="0" r="5" fill="#ccfbf1" stroke="#2dd4bf" strokeWidth="1.2" filter="url(#tk_glow)"/>
        {/* Đầu */}
        <circle cx="0" cy="-16" r="6.5" fill="#f0fdfa" stroke="#0f766e" strokeWidth="1"/>
        <circle cx="0" cy="-23" r="2.5" fill="#2dd4bf" filter="url(#tk_glow)"/>
      </g>
    );
  }

  /* ============================================================
     8. 🍃 HỆ THANH PHONG LINH / TIÊU DAO / PHONG
     ============================================================ */
  if (has('thanh phong', 'thanh phong linh', 'tiêu dao', 'tieu dao', 'phong')) {
    return (
      <g>
        <defs>
          <radialGradient id="phong_aura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f0fdf4" stopOpacity="0.8"/>
            <stop offset="40%" stopColor="#14b8a6" stopOpacity="0.7"/>
            <stop offset="80%" stopColor="#0f766e" stopOpacity="0.3"/>
            <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
          </radialGradient>
          <filter id="tp_glow"><feGaussianBlur stdDeviation="3" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
        </defs>
        <circle cx="0" cy="-2" r="32" fill="url(#phong_aura)" filter="url(#tp_glow)"/>
        {/* Cánh Bướm Tiên Dạ Quang Phiêu Dật */}
        <path d="M -6,4 Q -28,-14 -20,-28 Q -12,-16 -6,-6 Z" fill="rgba(45, 212, 191, 0.6)" stroke="#5eead4" strokeWidth="1.2" filter="url(#tp_glow)" style={{ animation: 'wingFlutter 2.5s ease-in-out infinite' }}/>
        <path d="M 6,4 Q 28,-14 20,-28 Q 12,-16 6,-6 Z" fill="rgba(45, 212, 191, 0.6)" stroke="#5eead4" strokeWidth="1.2" filter="url(#tp_glow)" style={{ animation: 'wingFlutter 2.5s ease-in-out infinite', animationDelay: '0.3s' }}/>
        {/* Kim Thân Ngồi Thiền Áo Thanh Phong */}
        <ellipse cx="0" cy="14" rx="14" ry="6" fill="#115e59" stroke="#5eead4" strokeWidth="1.2"/>
        <path d="M -8,12 C -11,0 -8,-10 0,-12 C 8,-10 11,0 8,12 Z" fill="#0f766e" stroke="#5eead4" strokeWidth="1.2"/>
        {/* Chuông Gió Thanh Phong Linh */}
        <circle cx="0" cy="0" r="4" fill="#fde047" stroke="#ca8a04" strokeWidth="0.8" filter="url(#tp_glow)"/>
        {/* Đầu */}
        <circle cx="0" cy="-16" r="6.5" fill="#f0fdf4" stroke="#0d9488" strokeWidth="1"/>
        <circle cx="0" cy="-23" r="2.5" fill="#5eead4" filter="url(#tp_glow)"/>
      </g>
    );
  }

  /* ============================================================
     9. ⚡ HỆ LÔI ĐÌNH / THỐI THỂ / LÔI KIẾP
     ============================================================ */
  if (has('lôi đình', 'loi dinh', 'thối thể', 'thoi the', 'lôi', 'loi', 'sét')) {
    return (
      <g>
        <defs>
          <radialGradient id="loi_aura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fef08a" stopOpacity="0.9"/>
            <stop offset="40%" stopColor="#eab308" stopOpacity="0.8"/>
            <stop offset="80%" stopColor="#713f12" stopOpacity="0.4"/>
            <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
          </radialGradient>
          <filter id="ld_glow"><feGaussianBlur stdDeviation="3" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
        </defs>
        <circle cx="0" cy="-2" r="32" fill="url(#loi_aura)" filter="url(#ld_glow)"/>
        {/* Tia Sét Hoàng Kim Xuyên Qua */}
        <path d="M -18,-28 L -8,-12 L -16,0 L -6,16" fill="none" stroke="#fde047" strokeWidth="2.5" strokeLinecap="round" filter="url(#ld_glow)"/>
        <path d="M 18,-28 L 8,-12 L 16,0 L 6,16" fill="none" stroke="#fde047" strokeWidth="2.5" strokeLinecap="round" filter="url(#ld_glow)"/>
        {/* Kim Thân Lôi Thần Chiến Giáp */}
        <ellipse cx="0" cy="14" rx="14" ry="6" fill="#713f12" stroke="#fde047" strokeWidth="1.2"/>
        <path d="M -8,12 C -11,0 -8,-10 0,-12 C 8,-10 11,0 8,12 Z" fill="#ca8a04" stroke="#fde047" strokeWidth="1.2"/>
        {/* Hạt Nhân Lôi Điện */}
        <circle cx="0" cy="0" r="4.5" fill="#ffffff" filter="url(#ld_glow)" style={{ animation: 'danBobbing 1.2s ease-in-out infinite' }}/>
        {/* Đầu & Lôi Vương Miện */}
        <circle cx="0" cy="-16" r="6.5" fill="#fef08a" stroke="#ca8a04" strokeWidth="1"/>
        <polygon points="0,-27 3,-21 0,-23 -3,-21" fill="#fde047" filter="url(#ld_glow)"/>
      </g>
    );
  }

  /* ============================================================
     10. ☀️ HỆ THUẦN DƯƠNG / SÁNG THẾ / THÁI DƯƠNG
     ============================================================ */
  if (has('thuần dương', 'thuan duong', 'sáng thế', 'sang the', 'dương', 'quang')) {
    return (
      <g>
        <defs>
          <radialGradient id="duong_aura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1"/>
            <stop offset="35%" stopColor="#fde047" stopOpacity="0.85"/>
            <stop offset="70%" stopColor="#ea580c" stopOpacity="0.5"/>
            <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
          </radialGradient>
          <filter id="td_glow"><feGaussianBlur stdDeviation="3.5" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
        </defs>
        <circle cx="0" cy="-2" r="32" fill="url(#duong_aura)" filter="url(#td_glow)"/>
        {/* 6 Cánh Lông Vũ Quang Minh Lục Dực */}
        <g style={{ transformOrigin: '0 0', animation: 'wingFlutter 2.4s ease-in-out infinite' }}>
          <path d="M -6,0 Q -32,-12 -28,-30 Q -18,-20 -6,-8 Z" fill="#fef08a" stroke="#f59e0b" strokeWidth="1.2" filter="url(#td_glow)"/>
          <path d="M -6,6 Q -30,10 -24,24 Q -16,14 -6,6 Z" fill="#fde047" stroke="#ea580c" strokeWidth="1"/>
          <path d="M 6,0 Q 32,-12 28,-30 Q 18,-20 6,-8 Z" fill="#fef08a" stroke="#f59e0b" strokeWidth="1.2" filter="url(#td_glow)"/>
          <path d="M 6,6 Q 30,10 24,24 Q 16,14 6,6 Z" fill="#fde047" stroke="#ea580c" strokeWidth="1"/>
        </g>
        {/* Kim Thân Ngồi Thiền Hoàng Kim */}
        <ellipse cx="0" cy="14" rx="14" ry="6" fill="#7c2d12" stroke="#fde047" strokeWidth="1.4"/>
        <path d="M -8,12 C -11,0 -8,-10 0,-12 C 8,-10 11,0 8,12 Z" fill="#ea580c" stroke="#fde047" strokeWidth="1.4"/>
        {/* Vầng Thái Dương Rực Rỡ Trước Ngực */}
        <circle cx="0" cy="0" r="6" fill="#fff" filter="url(#td_glow)" style={{ animation: 'danBobbing 2s ease-in-out infinite' }}/>
        {/* Đầu & Thái Dương Thần Miện */}
        <circle cx="0" cy="-16" r="6.5" fill="#fffbeb" stroke="#d97706" strokeWidth="1"/>
        <polygon points="0,-28 3,-22 0,-24 -3,-22" fill="#fde047" filter="url(#td_glow)"/>
      </g>
    );
  }

  /* ============================================================
     11. ⏳ HỆ NHẬT QUỸ / THỜI KHÔNG / TUẾ NGUYỆT
     ============================================================ */
  if (has('nhật quỹ', 'nhat quy', 'thời không', 'thoi khong', 'tuế nguyệt', 'tue nguyet', 'đồng hồ')) {
    return (
      <g>
        <defs>
          <radialGradient id="thoi_aura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#faf5ff" stopOpacity="0.9"/>
            <stop offset="40%" stopColor="#a855f7" stopOpacity="0.75"/>
            <stop offset="80%" stopColor="#581c87" stopOpacity="0.35"/>
            <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
          </radialGradient>
          <filter id="tk_glow2"><feGaussianBlur stdDeviation="3" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
        </defs>
        <circle cx="0" cy="-2" r="32" fill="url(#thoi_aura)" filter="url(#tk_glow2)"/>
        {/* Bánh Xe Nhật Quỹ Thiên Văn Vạch Giờ */}
        <circle cx="0" cy="-2" r="28" fill="none" stroke="#c084fc" strokeWidth="1.5" strokeDasharray="3 5" filter="url(#tk_glow2)" style={{ transformOrigin: '0 -2px', animation: 'spinSlow 10s linear infinite' }}/>
        {/* Kim Nhật Quỹ Chỉ Thời Gian */}
        <line x1="0" y1="-2" x2="0" y2="-20" stroke="#fde047" strokeWidth="2" strokeLinecap="round" filter="url(#tk_glow2)"/>
        <line x1="0" y1="-2" x2="14" y2="-2" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
        {/* Kim Thân Ngồi Thiền */}
        <ellipse cx="0" cy="14" rx="14" ry="6" fill="#3b0764" stroke="#c084fc" strokeWidth="1.2"/>
        <path d="M -8,12 C -11,0 -8,-10 0,-12 C 8,-10 11,0 8,12 Z" fill="#6b21a8" stroke="#c084fc" strokeWidth="1.2"/>
        {/* Đồng Hồ Cát Thời Gian Ở Ngực */}
        <polygon points="-4,-4 4,-4 0,0 -4,4 4,4 0,0" fill="#fde047" stroke="#ca8a04" strokeWidth="0.8" filter="url(#tk_glow2)"/>
        {/* Đầu */}
        <circle cx="0" cy="-16" r="6.5" fill="#faf5ff" stroke="#7c3aed" strokeWidth="1"/>
        <circle cx="0" cy="-24" r="2.5" fill="#fde047" filter="url(#tk_glow2)"/>
      </g>
    );
  }

  /* ============================================================
     12. 🐉 HỆ THẦN LONG / TỔ LONG / LONG
     ============================================================ */
  if (has('long', 'rồng', 'rong', 'tổ long', 'thần long')) {
    return (
      <g>
        <defs>
          <radialGradient id="long_aura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fef08a" stopOpacity="0.9"/>
            <stop offset="40%" stopColor="#eab308" stopOpacity="0.8"/>
            <stop offset="80%" stopColor="#854d0e" stopOpacity="0.4"/>
            <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
          </radialGradient>
          <filter id="l_glow"><feGaussianBlur stdDeviation="3" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
        </defs>
        <circle cx="0" cy="-2" r="32" fill="url(#long_aura)" filter="url(#l_glow)"/>
        {/* Thần Long Hoàng Kim Uốn Lượn Bao Quanh */}
        <path d="M -16,16 C -28,4 -26,-16 -12,-26 C 6,-32 20,-20 14,-4 C 8,10 -6,20 8,30" fill="none" stroke="#facc15" strokeWidth="2.8" strokeLinecap="round" filter="url(#l_glow)" style={{ animation: 'pulseAura 2.5s ease-in-out infinite' }}/>
        {/* Đầu Rồng & Long Tu */}
        <polygon points="-12,-26 -18,-32 -10,-30" fill="#fde047" filter="url(#l_glow)"/>
        <circle cx="-14" cy="-28" r="1.5" fill="#ef4444"/>
        {/* Kim Thân Ngồi Thiền */}
        <ellipse cx="0" cy="14" rx="14" ry="6" fill="#713f12" stroke="#fde047" strokeWidth="1.2"/>
        <path d="M -8,12 C -11,0 -8,-10 0,-12 C 8,-10 11,0 8,12 Z" fill="#a16207" stroke="#fde047" strokeWidth="1.2"/>
        {/* Long Châu Hoàng Kim Phát Quang */}
        <circle cx="0" cy="0" r="5" fill="#ffffff" filter="url(#l_glow)" style={{ animation: 'danBobbing 1.8s ease-in-out infinite' }}/>
        {/* Đầu */}
        <circle cx="0" cy="-16" r="6.5" fill="#fef08a" stroke="#a16207" strokeWidth="1"/>
        <polygon points="0,-27 3,-21 0,-23 -3,-21" fill="#fde047" filter="url(#l_glow)"/>
      </g>
    );
  }

  /* ============================================================
     13. 🗡️ HỆ THẦN KIẾM / PHẠT THIÊN KIẾM
     ============================================================ */
  if (has('kiếm', 'kiem', 'phạt thiên', 'phat thien')) {
    return (
      <g>
        <defs>
          <radialGradient id="kiem_aura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.9"/>
            <stop offset="40%" stopColor="#0284c7" stopOpacity="0.75"/>
            <stop offset="80%" stopColor="#075985" stopOpacity="0.35"/>
            <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
          </radialGradient>
          <filter id="km_glow"><feGaussianBlur stdDeviation="3" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
        </defs>
        <circle cx="0" cy="-2" r="32" fill="url(#kiem_aura)" filter="url(#km_glow)"/>
        {/* Cự Kiếm Khổng Lồ Cắm Thẳng Sau Lưng */}
        <path d="M -3,-36 L 3,-36 L 4,24 L -4,24 Z M -11,-12 L 11,-12 M 0,-36 L 0,-42" fill="#38bdf8" stroke="#0284c7" strokeWidth="1.6" filter="url(#km_glow)"/>
        {/* Kim Thân Ngồi Thiền */}
        <ellipse cx="0" cy="14" rx="14" ry="6" fill="#0c4a6e" stroke="#38bdf8" strokeWidth="1.2"/>
        <path d="M -8,12 C -11,0 -8,-10 0,-12 C 8,-10 11,0 8,12 Z" fill="#0369a1" stroke="#38bdf8" strokeWidth="1.2"/>
        {/* Kiếm Ý Lơ Lửng Ở Ngực */}
        <polygon points="0,-8 3,0 0,6 -3,0" fill="#fff" filter="url(#km_glow)"/>
        {/* Đầu */}
        <circle cx="0" cy="-16" r="6.5" fill="#f0f9ff" stroke="#0284c7" strokeWidth="1"/>
      </g>
    );
  }

  /* ============================================================
     14. DEFAULT PRECISE DHARMA AVATAR (Nâng Cấp Cao Cấp)
     ============================================================ */
  return (
    <g>
      <defs>
        <radialGradient id="def_aura" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fef08a" stopOpacity="0.9"/>
          <stop offset="40%" stopColor={themeColor || '#facc15'} stopOpacity="0.75"/>
          <stop offset="80%" stopColor="#3b0764" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="transparent" stopOpacity="0"/>
        </radialGradient>
        <filter id="def_glow"><feGaussianBlur stdDeviation="3" result="b"/><feComposite in="SourceGraphic" in2="b" operator="over"/></filter>
      </defs>
      <circle cx="0" cy="-2" r="30" fill="url(#def_aura)" filter="url(#def_glow)"/>
      <circle cx="0" cy="-2" r="26" fill="none" stroke={themeColor || '#facc15'} strokeWidth="1.4" strokeDasharray="4 4" filter="url(#def_glow)" style={{ transformOrigin: '0 -2px', animation: 'spinSlow 14s linear infinite' }}/>
      {/* Kim Thân */}
      <ellipse cx="0" cy="14" rx="14" ry="6" fill="#1e1b4b" stroke={themeColor || '#facc15'} strokeWidth="1.2"/>
      <path d="M -8,12 C -11,0 -8,-10 0,-12 C 8,-10 11,0 8,12 Z" fill="#312e81" stroke={themeColor || '#facc15'} strokeWidth="1.2"/>
      {/* Linh Hạt */}
      <circle cx="0" cy="0" r="4.5" fill="#ffffff" filter="url(#def_glow)" style={{ animation: 'danBobbing 2s ease-in-out infinite' }}/>
      {/* Đầu */}
      <circle cx="0" cy="-16" r="6.5" fill="#fff" stroke={themeColor || '#facc15'} strokeWidth="1"/>
      <circle cx="0" cy="-23" r="2.5" fill={themeColor || '#facc15'} filter="url(#def_glow)"/>
    </g>
  );
}

export const BESPOKE_GALLERY_ITEMS = [
  { id: 'lamp_loi_kiep', type: 'menh_dang', name: 'Thượng Thương Lôi Kiếp Đăng', tier: 'Thần Phẩm', element: 'Cửu Thiên Lôi Điện', color: '#38bdf8' },
  { id: 'lamp_hu_vo', type: 'menh_dang', name: 'Vận Mệnh Hư Vô Đăng', tier: 'Thần Phẩm', element: 'Hư Vô Thấu Thị', color: '#7e22ce' },
  { id: 'lamp_nhan_qua', type: 'menh_dang', name: 'Túc Mệnh Nhân Quả Đăng', tier: 'Thần Phẩm', element: 'Nhân Quả Hồng Tuyến', color: '#f43f5e' },
  { id: 'lamp_than_long', type: 'menh_dang', name: 'Thái Cổ Thần Long Đăng', tier: 'Thần Phẩm', element: 'Long Hồn Chân Hỏa', color: '#eab308' },
  { id: 'lamp_thoi_khong', type: 'menh_dang', name: 'Khởi Nguyên Thời Không Đăng', tier: 'Thần Phẩm', element: 'Tuế Nguyệt Thời Không', color: '#c084fc' },
  { id: 'lamp_quy_nhat', type: 'menh_dang', name: 'Vạn Giới Quy Nhất Đăng', tier: 'Thần Phẩm', element: 'Thập Phương Quy Nhất', color: '#06b6d4' },
  { id: 'lamp_thien_menh', type: 'menh_dang', name: 'Tối Cao Thiên Mệnh Đăng', tier: 'Thần Phẩm', element: 'Chí Tôn Thiên Mệnh', color: '#fbbf24' },
  { id: 'lamp_phuong', type: 'menh_dang', name: 'Phượng Hoàng Thần Đăng', tier: 'Thần Phẩm', element: 'Cửu Hỏa Niết Bàn', color: '#f97316' },
  { id: 'lamp_ma_tam', type: 'menh_dang', name: 'Ma Tâm Cổ Đăng', tier: 'Thần Phẩm', element: 'Ma Tâm Hắc Hỏa', color: '#e11d48' }
];





export const SIX_CONSTELLATIONS = [
  {
    "id": "kim_nguu",
    "name": "Kim Ngưu",
    "westernName": "Taurus",
    "element": "Kim",
    "color": "#ffea00",
    "startIdx": 1,
    "count": 28,
    "origin": {
      "x": 500,
      "y": 500
    },
    "starsRel": [
      {
        "dx": -146.5,
        "dy": -345.2,
        "name": "Alcyone",
        "isMajor": true
      },
      {
        "dx": -139,
        "dy": -362.2,
        "name": "Atlas",
        "isMajor": false
      },
      {
        "dx": -161.4,
        "dy": -346.2,
        "name": "Electra",
        "isMajor": false
      },
      {
        "dx": -119.8,
        "dy": -348,
        "name": "Maia",
        "isMajor": false
      },
      {
        "dx": -140.7,
        "dy": -331.4,
        "name": "Merope",
        "isMajor": false
      },
      {
        "dx": -168.9,
        "dy": -331.5,
        "name": "Taygeta",
        "isMajor": false
      },
      {
        "dx": -159.4,
        "dy": -358.1,
        "name": "Pleione",
        "isMajor": false
      },
      {
        "dx": -81.5,
        "dy": -383.4,
        "name": "Tả Giác Tiêu",
        "isMajor": true
      },
      {
        "dx": -63.4,
        "dy": -359.5,
        "name": "Tả Giác Thượng",
        "isMajor": false
      },
      {
        "dx": -47,
        "dy": -334.7,
        "name": "Tả Giác Trung",
        "isMajor": false
      },
      {
        "dx": -27.2,
        "dy": -310.8,
        "name": "Tả Giác Hạ",
        "isMajor": false
      },
      {
        "dx": 0,
        "dy": -295,
        "name": "Ngưu Ngạch",
        "isMajor": false
      },
      {
        "dx": 27.2,
        "dy": -310.8,
        "name": "Hữu Giác Hạ",
        "isMajor": false
      },
      {
        "dx": 47.3,
        "dy": -336.7,
        "name": "Hữu Giác Trung",
        "isMajor": false
      },
      {
        "dx": 76.5,
        "dy": -360,
        "name": "Hữu Giác Thượng",
        "isMajor": false
      },
      {
        "dx": 101.5,
        "dy": -378.6,
        "name": "Hữu Giác Tiêu",
        "isMajor": true
      },
      {
        "dx": 0,
        "dy": -320,
        "name": "Aldebaran",
        "isMajor": true
      },
      {
        "dx": -17.5,
        "dy": -334.5,
        "name": "Gamma Tauri",
        "isMajor": false
      },
      {
        "dx": 6.1,
        "dy": -347.9,
        "name": "Delta Tauri",
        "isMajor": false
      },
      {
        "dx": 23.6,
        "dy": -337.2,
        "name": "Epsilon Tauri",
        "isMajor": false
      },
      {
        "dx": 16.9,
        "dy": -321.6,
        "name": "Theta Tauri",
        "isMajor": false
      },
      {
        "dx": -24,
        "dy": -274,
        "name": "Ngưu Kiên",
        "isMajor": false
      },
      {
        "dx": -35.5,
        "dy": -252.5,
        "name": "Lưng Trước",
        "isMajor": false
      },
      {
        "dx": -16.7,
        "dy": -239.4,
        "name": "Lưng Giữa",
        "isMajor": false
      },
      {
        "dx": 22,
        "dy": -251,
        "name": "Ngực Trước",
        "isMajor": false
      },
      {
        "dx": 50.3,
        "dy": -236.7,
        "name": "Tiền Chi",
        "isMajor": false
      },
      {
        "dx": 81.4,
        "dy": -223.6,
        "name": "Ngưu Đề",
        "isMajor": false
      },
      {
        "dx": 81.9,
        "dy": -252,
        "name": "Hông Sau",
        "isMajor": false
      }
    ],
    "edges": [
      [
        0,
        1
      ],
      [
        1,
        6
      ],
      [
        6,
        2
      ],
      [
        2,
        5
      ],
      [
        5,
        0
      ],
      [
        0,
        3
      ],
      [
        3,
        4
      ],
      [
        4,
        0
      ],
      [
        3,
        8
      ],
      [
        7,
        8
      ],
      [
        8,
        9
      ],
      [
        9,
        10
      ],
      [
        10,
        11
      ],
      [
        11,
        12
      ],
      [
        12,
        13
      ],
      [
        13,
        14
      ],
      [
        14,
        15
      ],
      [
        11,
        16
      ],
      [
        16,
        17
      ],
      [
        17,
        18
      ],
      [
        18,
        19
      ],
      [
        19,
        20
      ],
      [
        20,
        16
      ],
      [
        11,
        21
      ],
      [
        21,
        22
      ],
      [
        22,
        23
      ],
      [
        21,
        24
      ],
      [
        24,
        25
      ],
      [
        25,
        26
      ],
      [
        24,
        27
      ]
    ]
  },
  {
    "id": "bo_cap",
    "name": "Bọ Cạp",
    "westernName": "Scorpio",
    "element": "Hỏa",
    "color": "#ff4d94",
    "startIdx": 29,
    "count": 22,
    "origin": {
      "x": 500,
      "y": 500
    },
    "starsRel": [
      {
        "dx": 228.1,
        "dy": -313.9,
        "name": "Graffias β",
        "isMajor": true
      },
      {
        "dx": 250.9,
        "dy": -278.7,
        "name": "Dschubba δ",
        "isMajor": false
      },
      {
        "dx": 288.3,
        "dy": -259.6,
        "name": "Pi Scorpii π",
        "isMajor": true
      },
      {
        "dx": 218.6,
        "dy": -279.7,
        "name": "Jabbah ν",
        "isMajor": false
      },
      {
        "dx": 244,
        "dy": -244,
        "name": "Trán Bọ Cạp",
        "isMajor": false
      },
      {
        "dx": 252.8,
        "dy": -212.1,
        "name": "Tau Scorpii",
        "isMajor": false
      },
      {
        "dx": 263.6,
        "dy": -177.8,
        "name": "Antares α",
        "isMajor": true
      },
      {
        "dx": 284.1,
        "dy": -177.5,
        "name": "Al Niyat Hữu",
        "isMajor": false
      },
      {
        "dx": 246.8,
        "dy": -179.3,
        "name": "Al Niyat Tả",
        "isMajor": false
      },
      {
        "dx": 256.1,
        "dy": -136.1,
        "name": "Mu Scorpii μ",
        "isMajor": false
      },
      {
        "dx": 244.8,
        "dy": -109,
        "name": "Zeta Scorpii ζ",
        "isMajor": false
      },
      {
        "dx": 233,
        "dy": -84.8,
        "name": "Eta Scorpii η",
        "isMajor": false
      },
      {
        "dx": 234.8,
        "dy": -58.5,
        "name": "Theta Scorpii",
        "isMajor": false
      },
      {
        "dx": 247.6,
        "dy": -34.8,
        "name": "Iota Scorpii ι",
        "isMajor": false
      },
      {
        "dx": 274,
        "dy": -24,
        "name": "Kappa Scorpii κ",
        "isMajor": false
      },
      {
        "dx": 306.8,
        "dy": -26.8,
        "name": "Shaula λ",
        "isMajor": true
      },
      {
        "dx": 331.7,
        "dy": -46.6,
        "name": "Lesath υ",
        "isMajor": true
      },
      {
        "dx": 347.4,
        "dy": -86.6,
        "name": "G Scorpii",
        "isMajor": false
      },
      {
        "dx": 347.7,
        "dy": -140.5,
        "name": "Độc Châm 1",
        "isMajor": false
      },
      {
        "dx": 326.5,
        "dy": -204,
        "name": "Độc Châm 2",
        "isMajor": false
      },
      {
        "dx": 316.1,
        "dy": -182.5,
        "name": "Độc Tuyến 1",
        "isMajor": false
      },
      {
        "dx": 319.7,
        "dy": -142.4,
        "name": "Độc Tuyến 2",
        "isMajor": false
      }
    ],
    "edges": [
      [
        0,
        1
      ],
      [
        1,
        2
      ],
      [
        0,
        3
      ],
      [
        1,
        4
      ],
      [
        3,
        4
      ],
      [
        4,
        5
      ],
      [
        5,
        6
      ],
      [
        6,
        7
      ],
      [
        6,
        8
      ],
      [
        7,
        5
      ],
      [
        6,
        9
      ],
      [
        9,
        10
      ],
      [
        10,
        11
      ],
      [
        11,
        12
      ],
      [
        12,
        13
      ],
      [
        13,
        14
      ],
      [
        14,
        15
      ],
      [
        15,
        16
      ],
      [
        16,
        17
      ],
      [
        17,
        18
      ],
      [
        18,
        19
      ],
      [
        19,
        20
      ],
      [
        20,
        21
      ],
      [
        21,
        17
      ]
    ]
  },
  {
    "id": "nhan_ma",
    "name": "Nhân Mã",
    "westernName": "Sagittarius",
    "element": "Hỏa",
    "color": "#ff8533",
    "startIdx": 51,
    "count": 21,
    "origin": {
      "x": 500,
      "y": 500
    },
    "starsRel": [
      {
        "dx": 336,
        "dy": 194,
        "name": "Kaus Borealis λ",
        "isMajor": true
      },
      {
        "dx": 366.8,
        "dy": 78,
        "name": "Nunki σ",
        "isMajor": true
      },
      {
        "dx": 341.6,
        "dy": 48,
        "name": "Tau Sgr τ",
        "isMajor": false
      },
      {
        "dx": 308.1,
        "dy": 65.5,
        "name": "Ascella ζ",
        "isMajor": true
      },
      {
        "dx": 318.6,
        "dy": 103.5,
        "name": "Phi Sgr φ",
        "isMajor": false
      },
      {
        "dx": 258.4,
        "dy": 94.1,
        "name": "Kaus Australis ε",
        "isMajor": true
      },
      {
        "dx": 236.3,
        "dy": 159.4,
        "name": "Kaus Media δ",
        "isMajor": false
      },
      {
        "dx": 219.2,
        "dy": 219.2,
        "name": "Alnasl γ",
        "isMajor": true
      },
      {
        "dx": 212.4,
        "dy": 271.9,
        "name": "Delta 2 Sgr",
        "isMajor": false
      },
      {
        "dx": 232.7,
        "dy": 297.9,
        "name": "Spout Top",
        "isMajor": false
      },
      {
        "dx": 280.5,
        "dy": 270.9,
        "name": "Spout Tip",
        "isMajor": true
      },
      {
        "dx": 275.8,
        "dy": 231.4,
        "name": "Spout Mid",
        "isMajor": false
      },
      {
        "dx": 291.4,
        "dy": 154.9,
        "name": "Tâm Ấm Trà",
        "isMajor": false
      },
      {
        "dx": 303.1,
        "dy": 175,
        "name": "Trung Tâm",
        "isMajor": false
      },
      {
        "dx": 357,
        "dy": 144.2,
        "name": "Rho Sgr ρ",
        "isMajor": false
      },
      {
        "dx": 328.9,
        "dy": 146.4,
        "name": "Pi Sgr π",
        "isMajor": false
      },
      {
        "dx": 295.5,
        "dy": 230.9,
        "name": "Tiễn Đỉnh 1",
        "isMajor": false
      },
      {
        "dx": 313.9,
        "dy": 228.1,
        "name": "Tiễn Đỉnh 2",
        "isMajor": true
      },
      {
        "dx": 241.5,
        "dy": 64.7,
        "name": "Mã Thân 1",
        "isMajor": false
      },
      {
        "dx": 213.7,
        "dy": 113.6,
        "name": "Mã Bụng",
        "isMajor": false
      },
      {
        "dx": 187.3,
        "dy": 168.6,
        "name": "Tiền Đề",
        "isMajor": false
      }
    ],
    "edges": [
      [
        0,
        1
      ],
      [
        0,
        11
      ],
      [
        0,
        6
      ],
      [
        1,
        14
      ],
      [
        14,
        2
      ],
      [
        2,
        3
      ],
      [
        3,
        4
      ],
      [
        4,
        1
      ],
      [
        3,
        5
      ],
      [
        5,
        6
      ],
      [
        6,
        7
      ],
      [
        7,
        8
      ],
      [
        8,
        9
      ],
      [
        9,
        10
      ],
      [
        10,
        11
      ],
      [
        11,
        7
      ],
      [
        0,
        16
      ],
      [
        16,
        17
      ],
      [
        17,
        10
      ],
      [
        3,
        18
      ],
      [
        18,
        19
      ],
      [
        19,
        5
      ],
      [
        5,
        20
      ],
      [
        20,
        7
      ]
    ]
  },
  {
    "id": "su_tu",
    "name": "Sư Tử",
    "westernName": "Leo",
    "element": "Kim",
    "color": "#ffd000",
    "startIdx": 72,
    "count": 20,
    "origin": {
      "x": 500,
      "y": 500
    },
    "starsRel": [
      {
        "dx": 102,
        "dy": 313.8,
        "name": "Regulus α",
        "isMajor": true
      },
      {
        "dx": 133,
        "dy": 329.2,
        "name": "Eta Leonis η",
        "isMajor": false
      },
      {
        "dx": 154.6,
        "dy": 347.1,
        "name": "Algieba γ",
        "isMajor": true
      },
      {
        "dx": 107.5,
        "dy": 374.9,
        "name": "Zeta Leonis ζ",
        "isMajor": false
      },
      {
        "dx": 53.6,
        "dy": 381.3,
        "name": "Mu Leonis μ",
        "isMajor": false
      },
      {
        "dx": 38.5,
        "dy": 366,
        "name": "Ras Elased ε",
        "isMajor": false
      },
      {
        "dx": 59.9,
        "dy": 339.8,
        "name": "Lambda Leonis λ",
        "isMajor": false
      },
      {
        "dx": 0,
        "dy": 330,
        "name": "Sư Kiên",
        "isMajor": false
      },
      {
        "dx": -48,
        "dy": 341.6,
        "name": "Zosma δ",
        "isMajor": true
      },
      {
        "dx": -53.8,
        "dy": 305.3,
        "name": "Chertan θ",
        "isMajor": false
      },
      {
        "dx": -140.5,
        "dy": 347.7,
        "name": "Denebola β",
        "isMajor": true
      },
      {
        "dx": -125.5,
        "dy": 310.6,
        "name": "Iota Leonis ι",
        "isMajor": false
      },
      {
        "dx": -104.3,
        "dy": 286.6,
        "name": "Kappa Leonis κ",
        "isMajor": false
      },
      {
        "dx": 88.1,
        "dy": 271.1,
        "name": "Tiền Chi 1",
        "isMajor": false
      },
      {
        "dx": 87.2,
        "dy": 239.6,
        "name": "Tiền Trảo",
        "isMajor": false
      },
      {
        "dx": 9.6,
        "dy": 274.8,
        "name": "Bụng Sư Tử",
        "isMajor": false
      },
      {
        "dx": -53,
        "dy": 249.4,
        "name": "Hậu Chi",
        "isMajor": false
      },
      {
        "dx": -74.8,
        "dy": 230.2,
        "name": "Hậu Trảo",
        "isMajor": false
      },
      {
        "dx": -164,
        "dy": 351.6,
        "name": "Vĩ Mao 1",
        "isMajor": false
      },
      {
        "dx": -155.6,
        "dy": 319.1,
        "name": "Vĩ Mao 2",
        "isMajor": false
      }
    ],
    "edges": [
      [
        0,
        1
      ],
      [
        1,
        2
      ],
      [
        2,
        3
      ],
      [
        3,
        4
      ],
      [
        4,
        5
      ],
      [
        5,
        6
      ],
      [
        6,
        0
      ],
      [
        0,
        7
      ],
      [
        7,
        8
      ],
      [
        8,
        9
      ],
      [
        9,
        7
      ],
      [
        8,
        10
      ],
      [
        10,
        11
      ],
      [
        11,
        9
      ],
      [
        9,
        12
      ],
      [
        12,
        11
      ],
      [
        10,
        18
      ],
      [
        18,
        19
      ],
      [
        0,
        13
      ],
      [
        13,
        14
      ],
      [
        7,
        15
      ],
      [
        15,
        16
      ],
      [
        16,
        17
      ],
      [
        9,
        16
      ]
    ]
  },
  {
    "id": "bach_duong",
    "name": "Bạch Dương",
    "westernName": "Aries",
    "element": "Mộc",
    "color": "#c084fc",
    "startIdx": 92,
    "count": 15,
    "origin": {
      "x": 500,
      "y": 500
    },
    "starsRel": [
      {
        "dx": -265.2,
        "dy": 265.2,
        "name": "Hamal α",
        "isMajor": true
      },
      {
        "dx": -271.9,
        "dy": 212.4,
        "name": "Sheratan β",
        "isMajor": true
      },
      {
        "dx": -271.4,
        "dy": 169.6,
        "name": "Mesarthim γ",
        "isMajor": false
      },
      {
        "dx": -267.4,
        "dy": 124.7,
        "name": "Botein δ",
        "isMajor": false
      },
      {
        "dx": -256.8,
        "dy": 83.4,
        "name": "Epsilon Arietis ε",
        "isMajor": false
      },
      {
        "dx": -250.7,
        "dy": 298.8,
        "name": "Giác Khúc 1",
        "isMajor": false
      },
      {
        "dx": -298.8,
        "dy": 250.7,
        "name": "Giác Đỉnh",
        "isMajor": true
      },
      {
        "dx": -312.1,
        "dy": 195,
        "name": "Giác Khúc 2",
        "isMajor": false
      },
      {
        "dx": -337.3,
        "dy": 179.3,
        "name": "Hữu Giác Tiêu",
        "isMajor": false
      },
      {
        "dx": -202.5,
        "dy": 241.3,
        "name": "Dương Ức",
        "isMajor": false
      },
      {
        "dx": -184,
        "dy": 204.4,
        "name": "Tiền Chi",
        "isMajor": false
      },
      {
        "dx": -182.1,
        "dy": 163.9,
        "name": "Dương Đề 1",
        "isMajor": false
      },
      {
        "dx": -220.8,
        "dy": 127.5,
        "name": "Bụng Cừu",
        "isMajor": false
      },
      {
        "dx": -236.7,
        "dy": 63.4,
        "name": "Hậu Chi",
        "isMajor": false
      },
      {
        "dx": -257.5,
        "dy": 36.2,
        "name": "Dương Vĩ",
        "isMajor": false
      }
    ],
    "edges": [
      [
        0,
        1
      ],
      [
        1,
        2
      ],
      [
        2,
        3
      ],
      [
        3,
        4
      ],
      [
        0,
        5
      ],
      [
        5,
        6
      ],
      [
        6,
        7
      ],
      [
        7,
        1
      ],
      [
        7,
        8
      ],
      [
        0,
        9
      ],
      [
        9,
        10
      ],
      [
        10,
        11
      ],
      [
        9,
        12
      ],
      [
        12,
        13
      ],
      [
        13,
        14
      ],
      [
        3,
        14
      ]
    ]
  },
  {
    "id": "thien_binh",
    "name": "Thiên Bình",
    "westernName": "Libra",
    "element": "Thủy",
    "color": "#38bdf8",
    "startIdx": 107,
    "count": 14,
    "origin": {
      "x": 500,
      "y": 500
    },
    "starsRel": [
      {
        "dx": -337.7,
        "dy": -195,
        "name": "Thiên Xích",
        "isMajor": true
      },
      {
        "dx": -311.8,
        "dy": -180,
        "name": "Huyền Xu",
        "isMajor": false
      },
      {
        "dx": -285.8,
        "dy": -165,
        "name": "Trục Trung Tâm",
        "isMajor": true
      },
      {
        "dx": -338.1,
        "dy": -90.6,
        "name": "Tả Cân Đòn",
        "isMajor": false
      },
      {
        "dx": -247.5,
        "dy": -247.5,
        "name": "Hữu Cân Đòn",
        "isMajor": false
      },
      {
        "dx": -371.4,
        "dy": -52.2,
        "name": "Zubenelgenubi α",
        "isMajor": true
      },
      {
        "dx": -338.1,
        "dy": -35.5,
        "name": "Tả Bàn Khởi",
        "isMajor": false
      },
      {
        "dx": -302,
        "dy": -42.4,
        "name": "Tả Bàn Đáy",
        "isMajor": true
      },
      {
        "dx": -307.6,
        "dy": -88.2,
        "name": "Tả Quai Cân",
        "isMajor": false
      },
      {
        "dx": -230.9,
        "dy": -295.5,
        "name": "Zubeneschamali β",
        "isMajor": true
      },
      {
        "dx": -199.8,
        "dy": -275.1,
        "name": "Hữu Bàn Khởi",
        "isMajor": false
      },
      {
        "dx": -187.8,
        "dy": -240.3,
        "name": "Hữu Bàn Đáy",
        "isMajor": true
      },
      {
        "dx": -230.2,
        "dy": -222.3,
        "name": "Hữu Quai Cân",
        "isMajor": false
      },
      {
        "dx": -225.2,
        "dy": -130,
        "name": "Trọng Chùy Cân",
        "isMajor": true
      }
    ],
    "edges": [
      [
        0,
        1
      ],
      [
        1,
        2
      ],
      [
        2,
        13
      ],
      [
        1,
        3
      ],
      [
        1,
        4
      ],
      [
        3,
        5
      ],
      [
        5,
        6
      ],
      [
        6,
        7
      ],
      [
        7,
        8
      ],
      [
        8,
        3
      ],
      [
        5,
        7
      ],
      [
        4,
        9
      ],
      [
        9,
        10
      ],
      [
        10,
        11
      ],
      [
        11,
        12
      ],
      [
        12,
        4
      ],
      [
        9,
        11
      ]
    ]
  }
];


export default function RealmPreviewVisualizer({ hideModalFrame, cultivation: propCultivation }) {
  const { 
    cultivation: contextCultivation, 
    selectedNode, 
    setSelectedNode, 
    activeMeridian,
    setNgungKhiPath, 
    gainReadingExp,
    absorbLamp,
    attempt121Breakthrough,
    activeRealmView,
    setActiveRealmView,
    thangCung,
    anchorPalace,
    manifestDaoAnh,
    injectThienMenh,
    attemptTribulationAll,
    fillAllDaoAnhThienMenh,
    getDaoAnhTheme,
    galleryModalOpen: contextGalleryModalOpen,
    setGalleryModalOpen: contextSetGalleryModalOpen,
    anchorModalPalace: contextAnchorModalPalace,
    setAnchorModalPalace: contextSetAnchorModalPalace
  } = useCultivationContext();

  const cultivation = propCultivation || contextCultivation;
  const currentRealm = cultivation?.realm || 'truc_co';
  const activeViewRealm = propCultivation?.realm || activeRealmView || currentRealm;

  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [hoveredStar, setHoveredStar] = useState(null);
  const [hoveredPalace, setHoveredPalace] = useState(null);
  const [pulseClickEffect, setPulseClickEffect] = useState(false);
  const [isRotating, setIsRotating] = useState(true);
  const [lampModalOpen, setLampModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [lampFilterTier, setLampFilterTier] = useState('all');
  const [localAnchorModalPalace, setLocalAnchorModalPalace] = useState(null);
  const anchorModalPalace = contextAnchorModalPalace !== undefined ? contextAnchorModalPalace : localAnchorModalPalace;
  const setAnchorModalPalace = contextSetAnchorModalPalace || setLocalAnchorModalPalace;
  const [localGalleryModalOpen, setLocalGalleryModalOpen] = useState(false);
  const galleryModalOpen = contextGalleryModalOpen !== undefined ? contextGalleryModalOpen : localGalleryModalOpen;
  const setGalleryModalOpen = contextSetGalleryModalOpen || setLocalGalleryModalOpen;
  const [focusedDaoAnhId, setFocusedDaoAnhId] = useState(null);
  const [hoveredDaoAnh, setHoveredDaoAnh] = useState(null);
  const [thunderStrikeActive, setThunderStrikeActive] = useState(null);
  const [isBreakthroughAnim, setIsBreakthroughAnim] = useState(false);

  const [viewMode, setViewMode] = useState(cultivation?.ngungKhiActivePath || cultivation?.ngungKhiPath || 'the');

  useEffect(() => {
    if (cultivation?.ngungKhiActivePath) {
      setViewMode(cultivation.ngungKhiActivePath);
    }
  }, [cultivation?.ngungKhiActivePath]);

  const theLvl = cultivation?.ngungKhiTheLevel || cultivation?.theLevel || 1;
  const phapLvl = cultivation?.ngungKhiPhapLevel || cultivation?.phapLevel || 1;
  const theExp = cultivation?.ngungKhiTheExp || cultivation?.theExp || 0;
  const phapExp = cultivation?.ngungKhiPhapExp || cultivation?.phapExp || 0;
  const hasTiger = theLvl >= 7;
  const hasWhale = phapLvl >= 7;

  const exp = cultivation?.totalExp || cultivation?.expCurrentRealm || 0;
  const is121Unlocked = cultivation?.has121st || false;
  const openedCount = cultivation?.phapKhieu !== undefined ? cultivation.phapKhieu : 0;
  const absorbedLamps = cultivation?.absorbedLamps || [];

  // Max lamps
  const maxLamps = is121Unlocked ? 5 : 4;
  const fifthLampId = absorbedLamps[4];
  const fifthLampObj = fifthLampId ? LIFE_LAMPS.find(l => l.id === fifthLampId) : null;
  const fifthTierInfo = fifthLampObj ? (LAMP_TIERS[fifthLampObj.tier] || LAMP_TIERS.ha_pham) : null;

  // Kim Đan Palace Variables
  const maxThienCung = cultivation?.maxThienCung || 6;
  const realizedThienCung = cultivation?.realizedThienCung || 0;
  const lampPalaceCount = absorbedLamps.length;
  const selfPalacesTotal = Math.max(1, maxThienCung - lampPalaceCount);
  const targetPalaceExp = 2000;
  const bottleneckExp = 1999;

  // Dao Anhs list
  const daoAnhs = cultivation?.daoAnhs || [];

  // Center coordinate of SVG
  const cx = 500;
  const cy = 500;

  const formatDaoAnhTitle = (name) => {
    if (!name) return 'Đạo Anh';
    return name.replace(/Đạo Anh\s*\[?|\]/g, '').trim();
  };

  // 8 Bagua Trigrams (Tiên Thiên Bát Quái)
  const BAGUA_LIST = [
    { symbol: '☰', name: 'CÀN', element: 'Thiên', angle: 270 },
    { symbol: '☱', name: 'ĐOÁI', element: 'Trạch', angle: 315 },
    { symbol: '☲', name: 'LY', element: 'Hỏa', angle: 0 },
    { symbol: '☳', name: 'CHẤN', element: 'Lôi', angle: 45 },
    { symbol: '☷', name: 'KHÔN', element: 'Địa', angle: 90 },
    { symbol: '☶', name: 'CẤN', element: 'Sơn', angle: 135 },
    { symbol: '☵', name: 'KHẢM', element: 'Thủy', angle: 180 },
    { symbol: '☴', name: 'TỐN', element: 'Phong', angle: 225 },
  ];

  // 24 Sơn Hướng Bát Quái / Hoàng Đạo Độ Số
  const BAGUA_24_SON = [
    { name: 'TÝ', angle: 270, type: 'chi', label: 'Tý' },
    { name: 'QUÝ', angle: 285, type: 'can', label: 'Quý' },
    { name: 'SỬU', angle: 300, type: 'chi', label: 'Sửu' },
    { name: 'CẤN', angle: 315, type: 'quai', label: 'Cấn' },
    { name: 'DẦN', angle: 330, type: 'chi', label: 'Dần' },
    { name: 'GIÁP', angle: 345, type: 'can', label: 'Giáp' },
    { name: 'MÃO', angle: 0, type: 'chi', label: 'Mão' },
    { name: 'ẤT', angle: 15, type: 'can', label: 'Ất' },
    { name: 'THÌN', angle: 30, type: 'chi', label: 'Thìn' },
    { name: 'TỐN', angle: 45, type: 'quai', label: 'Tốn' },
    { name: 'TỊ', angle: 60, type: 'chi', label: 'Tị' },
    { name: 'BÍNH', angle: 75, type: 'can', label: 'Bính' },
    { name: 'NGỌ', angle: 90, type: 'chi', label: 'Ngọ' },
    { name: 'ĐINH', angle: 105, type: 'can', label: 'Đinh' },
    { name: 'MÙI', angle: 120, type: 'chi', label: 'Mùi' },
    { name: 'KHÔN', angle: 135, type: 'quai', label: 'Khôn' },
    { name: 'THÂN', angle: 150, type: 'chi', label: 'Thân' },
    { name: 'CANH', angle: 165, type: 'can', label: 'Canh' },
    { name: 'DẬU', angle: 180, type: 'chi', label: 'Dậu' },
    { name: 'TÂN', angle: 195, type: 'can', label: 'Tân' },
    { name: 'TUẤT', angle: 210, type: 'chi', label: 'Tuất' },
    { name: 'CÀN', angle: 225, type: 'quai', label: 'Càn' },
    { name: 'HỢI', angle: 240, type: 'chi', label: 'Hợi' },
    { name: 'NHÂM', angle: 255, type: 'can', label: 'Nhâm' },
  ];

  // 4 Mệnh Đăng Lotus Altar Shrines (4 Vị Trí Chuẩn Theo Bản Mẫu)
  const LAMP_ALTARS = [
    { idx: 0, x: 90, y: 165, label: 'Tây Bắc' },
    { idx: 1, x: 910, y: 165, label: 'Đông Bắc' },
    { idx: 2, x: 85, y: 875, label: 'Tây Nam' },
    { idx: 3, x: 885, y: 875, label: 'Đông Nam' },
  ];

  // 6 Great Constellations (120 Stars mapped to astronomical positions - starScale = 0.89 giải phóng không gian thở)
  const { stars, constellationList } = useMemo(() => {
    const starList = [];
    const constList = [];
    const starScale = 0.89; // Thu gọn 11% để tạo khoảng trống cực kỳ rộng rãi cho 4 đài sen

    SIX_CONSTELLATIONS.forEach((c) => {
      const ox = c.origin.x;
      const oy = c.origin.y;

      const mappedStars = c.starsRel.map((s, sIdx) => {
        const starGlobalIdx = c.startIdx + sIdx;
        const x = ox + s.dx * starScale;
        const y = oy + s.dy * starScale;
        const isUnlocked = starGlobalIdx <= openedCount;

        const starObj = {
          index: starGlobalIdx,
          name: `Khiếu #${starGlobalIdx} · ${s.name}`,
          shortName: s.name,
          element: c.element,
          category: `${c.name} (${c.westernName})`,
          constellationId: c.id,
          constellationName: c.name,
          westernName: c.westernName,
          color: c.color,
          isMajor: Boolean(s.isMajor),
          x,
          y,
          isUnlocked
        };

        starList.push(starObj);
        return starObj;
      });

      // Build constellation lines
      const edgePaths = c.edges.map(([i1, i2]) => {
        const s1 = mappedStars[i1];
        const s2 = mappedStars[i2];
        const isConnectedAndUnlocked = s1 && s2 && s1.isUnlocked && s2.isUnlocked;
        return {
          d: s1 && s2 ? `M ${s1.x} ${s1.y} L ${s2.x} ${s2.y}` : '',
          isUnlocked: isConnectedAndUnlocked,
          color: c.color
        };
      });

      constList.push({
        ...c,
        stars: mappedStars,
        edgePaths,
        unlockedCount: mappedStars.filter(s => s.isUnlocked).length
      });
    });

    return { stars: starList, constellationList: constList };
  }, [openedCount]);

  const playStarChime = (freq = 440) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (e) {}
  };

  const handleCenterClick = () => {
    setPulseClickEffect(true);
    setTimeout(() => setPulseClickEffect(false), 400);

    if (is121Unlocked) {
      setSelectedSlot(4);
      setLampModalOpen(true);
    } else {
      if (openedCount >= 120) {
        try {
          setIsBreakthroughAnim(true);
          playStarChime(880);
          setTimeout(() => {
            attempt121Breakthrough();
            setIsBreakthroughAnim(false);
          }, 2000);
        } catch (err) {
          setIsBreakthroughAnim(false);
          alert(err.message || 'Chưa đủ điều kiện khai mở Cực Cảnh 121.');
        }
      } else {
        alert(`Cần đả thông đủ 120 Pháp Khiếu để xung kích Cực Cảnh 121 (Hiện tại: ${openedCount}/120).`);
      }
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '100%', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', margin: 0, padding: 0, border: 'none', borderRadius: 0, overflow: 'hidden' }}>
      {/* ========================================================
          STAGE 1: NGƯNG KHÍ KHÍ HẢI — HẢI SƠN QUYẾT & HÓA HẢI KINH
         ======================================================== */}
      {activeViewRealm === 'ngung_khi' && (
        <div style={{
          width: '100%',
          height: '100%',
          minHeight: '100%',
          flex: 1,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden'
        }}>
          
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
                try { playStarChime(440); } catch(e) {}
              }}
              style={{
                position: 'relative',
                padding: '6px 16px',
                borderRadius: 18,
                fontSize: 12,
                fontWeight: 800,
                border: (cultivation?.ngungKhiActivePath || cultivation?.ngungKhiPath || 'the') === 'the' 
                  ? '1.5px solid #f87171' 
                  : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.25s ease',
                background: viewMode === 'the' ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' : 'transparent',
                color: viewMode === 'the' ? '#ffffff' : '#94a3b8',
                boxShadow: (cultivation?.ngungKhiActivePath || cultivation?.ngungKhiPath || 'the') === 'the' 
                  ? '0 0 16px rgba(239, 68, 68, 0.8)' 
                  : (viewMode === 'the' ? '0 0 12px rgba(239, 68, 68, 0.5)' : 'none'),
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span className="ngung-khi-btn-text">⚔️ Hải Sơn (Thể)</span>
              {(cultivation?.ngungKhiActivePath || cultivation?.ngungKhiPath || 'the') === 'the' && (
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
                  ⚡ Đang Nạp Tu Vi
                </span>
              )}
            </button>

            {/* Nút Hóa Hải Kinh */}
            <button
              onClick={() => {
                setViewMode('phap');
                if (setNgungKhiPath) setNgungKhiPath('phap');
                try { playStarChime(587); } catch(e) {}
              }}
              style={{
                position: 'relative',
                padding: '6px 16px',
                borderRadius: 18,
                fontSize: 12,
                fontWeight: 800,
                border: (cultivation?.ngungKhiActivePath || cultivation?.ngungKhiPath || 'the') === 'phap' 
                  ? '1.5px solid #38bdf8' 
                  : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.25s ease',
                background: viewMode === 'phap' ? 'linear-gradient(135deg, #06b6d4 0%, #0369a1 100%)' : 'transparent',
                color: viewMode === 'phap' ? '#ffffff' : '#94a3b8',
                boxShadow: (cultivation?.ngungKhiActivePath || cultivation?.ngungKhiPath || 'the') === 'phap' 
                  ? '0 0 16px rgba(56, 189, 248, 0.8)' 
                  : (viewMode === 'phap' ? '0 0 12px rgba(6, 182, 212, 0.5)' : 'none'),
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <span className="ngung-khi-btn-text">🌊 Hóa Hải (Pháp)</span>
              {(cultivation?.ngungKhiActivePath || cultivation?.ngungKhiPath || 'the') === 'phap' && (
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
                  ⚡ Đang Nạp Tu Vi
                </span>
              )}
            </button>
          </div>

          {/* 2. KHUNG CANVAS SVG HOẠT ẢNH KHÍ HẢI THẦN THÚ CAO CẤP */}
          <svg
            width="100%"
            height="100%"
            viewBox={isMobile ? "130 10 660 620" : "0 0 920 640"}
            preserveAspectRatio="xMidYMid meet"
            style={{ width: '100%', height: '100%', minHeight: '620px', overflow: 'hidden' }}
            onClick={() => {
              try { playStarChime(523); } catch(e) {}
            }}
          >
            <defs>
              {/* Glow Filters */}
              <filter id="nkGlowRed" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="10" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="nkGlowCyan" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="10" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
              <filter id="nkGlowGold" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="12" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>

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
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0" />
                <stop offset="30%" stopColor="#06b6d4" stopOpacity="0.25" />
                <stop offset="70%" stopColor="#38bdf8" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="oceanRibbon2" x1="100%" y1="0%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#0284c7" stopOpacity="0" />
                <stop offset="40%" stopColor="#38bdf8" stopOpacity="0.28" />
                <stop offset="80%" stopColor="#7dd3fc" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#082f49" stopOpacity="0" />
              </linearGradient>

              {/* CSS Keyframe Animations */}
              <style>{`
                @keyframes nkSpinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes nkSpinReverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
                @keyframes nkPulseBreathing { 0%, 100% { transform: scale(1); opacity: 0.88; } 50% { transform: scale(1.05); opacity: 1; } }
                @keyframes nkTigerMajestic { 0%, 100% { transform: translateY(0px) rotate(0deg) scale(1); } 50% { transform: translateY(-8px) rotate(-1deg) scale(1.02); } }
                @keyframes nkTigerClawSlash { 0%, 100% { opacity: 0.35; transform: scale(0.95); } 50% { opacity: 1; transform: scale(1.08); } }
                @keyframes nkWhaleMajestic { 0%, 100% { transform: translate(0px, 0px) rotate(0deg); } 50% { transform: translate(14px, -12px) rotate(-2deg); } }
                @keyframes nkWhaleSpoutSpray { 0% { opacity: 0.3; transform: scaleY(0.7); } 50% { opacity: 1; transform: scaleY(1.2); } 100% { opacity: 0.3; transform: scaleY(0.7); } }
                @keyframes causticsShimmer { 0%, 100% { opacity: 0.45; transform: skewX(0deg); } 50% { opacity: 0.85; transform: skewX(4deg); } }
                @keyframes currentDrift1 { 0% { transform: translateX(-40px) translateY(0px); } 50% { transform: translateX(40px) translateY(-10px); } 100% { transform: translateX(-40px) translateY(0px); } }
                @keyframes currentDrift2 { 0% { transform: translateX(40px) translateY(0px); } 50% { transform: translateX(-40px) translateY(12px); } 100% { transform: translateX(40px) translateY(0px); } }
                @keyframes nkEmberFloat1 { 0% { transform: translateY(0px) scale(0.8); opacity: 0; } 50% { opacity: 0.85; } 100% { transform: translateY(-190px) scale(1.3); opacity: 0; } }
                @keyframes nkEmberFloat2 { 0% { transform: translateY(0px) scale(1); opacity: 0; } 50% { opacity: 0.9; } 100% { transform: translateY(-230px) scale(1.5); opacity: 0; } }
                @keyframes nkDeepBubbleFloat { 0% { transform: translateY(0px) translateX(0px); opacity: 0; } 50% { opacity: 0.8; transform: translateY(-90px) translateX(8px); } 100% { transform: translateY(-180px) translateX(-6px); opacity: 0; } }
                @keyframes nkMountainMist { 0%, 100% { transform: translateX(-20px); opacity: 0.35; } 50% { transform: translateX(20px); opacity: 0.6; } }
                @keyframes nkLightningFlash1 { 0%, 88%, 100% { opacity: 0; } 90%, 93% { opacity: 0.95; } }
                @keyframes nkLightningFlash2 { 0%, 75%, 100% { opacity: 0; } 78%, 81% { opacity: 0.9; } }
                @keyframes nkLightningFlash3 { 0%, 92%, 100% { opacity: 0; } 94%, 97% { opacity: 0.95; } }
              `}</style>
            </defs>

            {/* NỀN ĐẠI DƯƠNG / KHÍ HUYẾT SÂU THẲM */}
            <rect width="920" height="640" fill={viewMode === 'the' ? 'url(#bloodBgGrad)' : 'url(#oceanBgGrad)'} />

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
                  <ellipse cx="460" cy="560" rx="460" ry="80" fill="rgba(220, 38, 38, 0.12)" filter="url(#nkGlowRed)" style={{ animation: 'nkMountainMist 7s ease-in-out infinite' }} />
                </g>

                {/* 2. Quầng Huyết Nhật Khí Huyết Chi Viêm */}
                <circle cx="460" cy="290" r="340" fill="rgba(239, 68, 68, 0.15)" filter="url(#nkGlowRed)" style={{ animation: 'nkPulseBreathing 4s ease-in-out infinite' }} />
                <circle cx="460" cy="290" r="220" fill="rgba(220, 38, 38, 0.12)" />

                {/* 3. HỆ THỐNG TIA SÉT KHÍ HUYẾT GIÁNG THẾ (CRIMSON & GOLDEN LIGHTNING BOLTS) */}
                {/* Tia Sét 1 (Chính giữa) */}
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

                {/* Tia Sét 2 (Sườn núi bên Trái) */}
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

                {/* Tia Sét 3 (Sườn núi bên Phải) */}
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
                    filter="url(#nkGlowRed)"
                    style={{
                      animation: `${idx % 2 === 0 ? 'nkEmberFloat1' : 'nkEmberFloat2'} ${2.4 + (idx % 4) * 0.5}s ease-in-out infinite`,
                      animationDelay: `${idx * 0.18}s`
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
                <circle cx="460" cy="290" r="350" fill="rgba(6, 182, 212, 0.15)" filter="url(#nkGlowCyan)" style={{ animation: 'nkPulseBreathing 4.5s ease-in-out infinite' }} />
                <circle cx="460" cy="290" r="230" fill="rgba(3, 105, 161, 0.14)" />

                {/* Chùm tia sáng thần thánh (Celestial Caustic Beams) chiếu từ mặt biển xuống vực sâu */}
                <g style={{ animation: 'causticsShimmer 6s ease-in-out infinite' }}>
                  <polygon points="180,0 260,0 360,640 220,640" fill="url(#causticRay1)" />
                  <polygon points="360,0 460,0 600,640 440,640" fill="url(#causticRay2)" />
                  <polygon points="580,0 680,0 810,640 660,640" fill="url(#causticRay1)" />
                  <polygon points="70,0 130,0 210,640 120,640" fill="url(#causticRay2)" />
                </g>

                {/* Các dải hải lưu mềm mại trôi lơ lửng giữa tầng nước (Deep Ocean Current Ribbons) */}
                <g style={{ animation: 'currentDrift1 8s ease-in-out infinite' }}>
                  <path
                    d="M -50,450 Q 240,410 460,460 T 970,420"
                    fill="none"
                    stroke="url(#oceanRibbon1)"
                    strokeWidth="48"
                    strokeLinecap="round"
                    filter="url(#nkGlowCyan)"
                  />
                </g>
                <g style={{ animation: 'currentDrift2 6.5s ease-in-out infinite' }}>
                  <path
                    d="M -50,510 Q 280,550 520,500 T 970,530"
                    fill="none"
                    stroke="url(#oceanRibbon2)"
                    strokeWidth="56"
                    strokeLinecap="round"
                    filter="url(#nkGlowCyan)"
                  />
                </g>

                {/* Hạt linh lực phù du phát quang trôi nổi tự nhiên (Bioluminescent Plankton) */}
                {Array.from({ length: 20 }).map((_, idx) => (
                  <circle
                    key={idx}
                    cx={120 + (idx * 38) + ((idx % 4) * 14)}
                    cy={410 + ((idx % 5) * 26)}
                    r={2.2 + (idx % 3) * 0.8}
                    fill={idx % 3 === 0 ? '#ffffff' : idx % 2 === 0 ? '#a5f3fc' : '#38bdf8'}
                    filter="url(#nkGlowCyan)"
                    style={{
                      animation: `nkDeepBubbleFloat ${3.5 + (idx % 4) * 0.7}s ease-in-out infinite`,
                      animationDelay: `${idx * 0.28}s`
                    }}
                  />
                ))}
              </g>
            )}

            {/* TRẬN ĐỒ ĐAN ĐIỀN TRUNG TÂM (DAN DIEN SPHERE) */}
            <g transform="translate(460, 290)">
              {/* 10 VÒNG LINH MẠCH TƯƠNG ỨNG 10 TẦNG */}
              {Array.from({ length: 10 }).map((_, i) => {
                const layerNum = i + 1;
                const isReached = viewMode === 'the' ? theLvl >= layerNum : phapLvl >= layerNum;
                const isCurrent = viewMode === 'the' ? theLvl === layerNum : phapLvl === layerNum;
                const ringR = 55 + layerNum * 19;

                const strokeColor = viewMode === 'the'
                  ? (isReached ? '#ef4444' : '#334155')
                  : (isReached ? '#06b6d4' : '#1e3a5f');

                const strokeWidth = isReached ? 2.2 : 0.9;
                const strokeOpacity = isReached ? 0.85 : 0.22;

                return (
                  <g key={layerNum}>
                    <circle
                      cx="0"
                      cy="0"
                      r={ringR}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={strokeWidth}
                      strokeOpacity={strokeOpacity}
                      strokeDasharray={layerNum % 2 === 0 ? '6 4' : 'none'}
                    />
                    {/* Điểm Tinh Tú Tụ Linh trên vòng hiện tại */}
                    {isCurrent && (
                      <g>
                        <circle
                          cx={ringR * Math.cos((i * 36) * Math.PI / 180)}
                          cy={ringR * Math.sin((i * 36) * Math.PI / 180)}
                          r="4.5"
                          fill="#ffffff"
                          filter="url(#nkGlowGold)"
                        />
                        <circle
                          cx={ringR * Math.cos((i * 36 + 180) * Math.PI / 180)}
                          cy={ringR * Math.sin((i * 36 + 180) * Math.PI / 180)}
                          r="3.5"
                          fill={viewMode === 'the' ? '#fca5a5' : '#a5f3fc'}
                        />
                      </g>
                    )}
                  </g>
                );
              })}

              {/* VÒNG XOÁY NĂNG LƯỢNG ĐAN ĐIỀN */}
              {viewMode === 'the' ? (
                <g style={{ transformOrigin: '0 0', animation: 'nkSpinSlow 14s linear infinite' }}>
                  <circle cx="0" cy="0" r="50" fill="url(#bloodVortexCore)" />
                  <circle cx="0" cy="0" r="52" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeDasharray="10 6" opacity="0.85" />
                  {/* Các cánh hoa lửa xoáy */}
                  <path d="M 0,-48 Q 28,-28 0,0 Q 28,28 0,48 Q -28,28 0,0 Q -28,-28 0,-48 Z" fill="rgba(239, 68, 68, 0.4)" />
                  <circle cx="0" cy="0" r="20" fill="#ffffff" filter="url(#nkGlowRed)" />
                </g>
              ) : (
                <g style={{ transformOrigin: '0 0', animation: 'nkSpinReverse 16s linear infinite' }}>
                  <circle cx="0" cy="0" r="52" fill="url(#abyssOceanCore)" />
                  <circle cx="0" cy="0" r="54" fill="none" stroke="#38bdf8" strokeWidth="2.2" strokeDasharray="8 6" opacity="0.85" />
                  {/* Các luồng thủy triều xoáy sâu */}
                  <path d="M 0,-50 Q 34,-18 0,0 Q 34,18 0,50 Q -34,18 0,0 Q -34,-18 0,-50 Z" fill="rgba(6, 182, 212, 0.45)" />
                  <circle cx="0" cy="0" r="22" fill="#ffffff" filter="url(#nkGlowCyan)" />
                </g>
              )}

              {/* ========================================================
                  DỊ TƯỢNG 1: THẦN THÚ HUYẾT HỔ TOÀN THÂN (CHỈ HIỂN THỊ KHI TẦNG 7+)
                 ======================================================== */}
              {viewMode === 'the' && hasTiger && (
                <g
                  transform="translate(0, -30)"
                  style={{ animation: 'nkTigerMajestic 3.4s ease-in-out infinite' }}
                >
                  {/* Aura Bão Lửa Khí Huyết */}
                  <circle cx="0" cy="0" r="140" fill="rgba(239, 68, 68, 0.16)" filter="url(#nkGlowRed)" />
                  <circle cx="0" cy="0" r="118" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeDasharray="8 6" opacity="0.75" />

                  {/* Vết cào Huyết Long Trảo (Energy Claws) */}
                  <g style={{ animation: 'nkTigerClawSlash 1.8s ease-in-out infinite' }}>
                    <path d="M -110,-75 L -55,-25 M -95,-85 L -45,-35 M -120,-60 L -70,-10" stroke="#fca5a5" strokeWidth="3.2" strokeLinecap="round" opacity="0.9" />
                    <path d="M 110,-75 L 55,-25 M 95,-85 L 45,-35 M 120,-60 L 70,-10" stroke="#fca5a5" strokeWidth="3.2" strokeLinecap="round" opacity="0.9" />
                  </g>

                  {/* Thân Hổ Uy Mãnh Cơ Bắp */}
                  <path
                    d="M -70,-15 C -95,20 -70,65 -20,70 C 40,75 85,45 75,-10 C 65,-45 20,-50 -20,-45 C -55,-40 -65,-30 -70,-15 Z"
                    fill="url(#tigerBodyGrad)"
                    stroke="#fca5a5"
                    strokeWidth="2.6"
                    filter="url(#nkGlowRed)"
                  />

                  {/* Đuôi Hổ Rực Lửa Cuộn Sóng */}
                  <path
                    d="M 65,30 C 110,60 135,15 110,-10 C 95,-25 80,-5 72,15"
                    fill="url(#tigerBodyGrad)"
                    stroke="#fde047"
                    strokeWidth="2.6"
                  />
                  <polygon points="110,-10 128,-18 118,2" fill="#fde047" filter="url(#nkGlowGold)" />

                  {/* Chân Móng Vuốt Hổ Vồ Mồi */}
                  <path d="M -60,45 L -78,82 L -58,82" stroke="#fca5a5" strokeWidth="3.6" strokeLinecap="round" />
                  <path d="M -25,58 L -32,92 L -12,92" stroke="#fca5a5" strokeWidth="3.6" strokeLinecap="round" />
                  <path d="M 25,58 L 32,92 L 52,92" stroke="#fca5a5" strokeWidth="3.6" strokeLinecap="round" />
                  <path d="M 60,45 L 78,82 L 98,82" stroke="#fca5a5" strokeWidth="3.6" strokeLinecap="round" />

                  {/* ĐẦU HỔ GÓC CẠNH HÙNG DŨNG BÁ KHÍ */}
                  <g transform="translate(0, -22)">
                    {/* Bờm Hổ Gai Nhọn Tỏa Rực 2 Bên */}
                    <path
                      d="M -52,-28 L -68,-15 L -54,0 L -72,18 L -48,30 L -62,46 L -35,42 L 0,60 L 35,42 L 62,46 L 48,30 L 72,18 L 54,0 L 68,-15 L 52,-28 L 36,-50 L 0,-42 L -36,-50 Z"
                      fill="url(#tigerBodyGrad)"
                      stroke="#f87171"
                      strokeWidth="2.8"
                      filter="url(#nkGlowRed)"
                    />

                    {/* Tai Hổ Cương Mãnh Nhọn Hoắt */}
                    <polygon points="-46,-28 -62,-65 -28,-46" fill="#7f1d1d" stroke="#fde047" strokeWidth="2.2" />
                    <polygon points="46,-28 62,-65 28,-46" fill="#7f1d1d" stroke="#fde047" strokeWidth="2.2" />

                    {/* Vầng Trán Hổ & Khung Mặt */}
                    <path d="M -30,-40 L 0,-34 L 30,-40 L 38,-15 L 0,8 L -38,-15 Z" fill="#991b1b" stroke="#fca5a5" strokeWidth="1.8" />

                    {/* Chữ "VƯƠNG" (王) Hoàng Kim Phát Quang Đại Bá Khí */}
                    <g transform="translate(0, -24)">
                      <path d="M -16,-10 L 16,-10 M -12,-3 L 12,-3 M -18,5 L 18,5 M 0,-10 L 0,5" stroke="#fde047" strokeWidth="3.2" strokeLinecap="round" filter="url(#nkGlowGold)" />
                      <circle cx="0" cy="-2.5" r="2.2" fill="#fff" />
                    </g>

                    {/* Vằn Hổ Sát Khí 2 Bên Má */}
                    <path d="M -40,-8 L -20,-2 M -44,8 L -24,10 M 40,-8 L 20,-2 M 44,8 L 24,10" stroke="#fde047" strokeWidth="2.8" strokeLinecap="round" />

                    {/* MẮT HỔ XẾCH SẮC BÉN HÙNG THẦN */}
                    <polygon points="-28,-14 -12,-10 -22,-4" fill="#fde047" filter="url(#nkGlowGold)" stroke="#b45309" strokeWidth="1" />
                    <polygon points="28,-14 12,-10 22,-4" fill="#fde047" filter="url(#nkGlowGold)" stroke="#b45309" strokeWidth="1" />
                    {/* Đồng Tử Sát Phạt */}
                    <ellipse cx="-19" cy="-9" rx="2.5" ry="4" fill="#450a0a" />
                    <ellipse cx="19" cy="-9" rx="2.5" ry="4" fill="#450a0a" />
                    <circle cx="-18" cy="-10" r="1.2" fill="#ffffff" />
                    <circle cx="20" cy="-10" r="1.2" fill="#ffffff" />

                    {/* Mũi Hổ Gầm */}
                    <polygon points="-8,4 8,4 0,14" fill="#450a0a" stroke="#fca5a5" strokeWidth="1.2" />

                    {/* HÀM HỔ MỞ RỘNG GẦM THÉT SẤM SÉT */}
                    <path d="M -24,16 Q 0,10 24,16 Q 28,42 0,46 Q -28,42 -24,16 Z" fill="#280507" stroke="#ef4444" strokeWidth="2.2" />
                    {/* Răng Nanh Cực Đại Dữ Dằn */}
                    <polygon points="-18,17 -13,35 -8,17" fill="#ffffff" stroke="#fca5a5" strokeWidth="1" />
                    <polygon points="18,17 13,35 8,17" fill="#ffffff" stroke="#fca5a5" strokeWidth="1" />
                    <polygon points="-12,42 -8,30 -4,42" fill="#ffffff" />
                    <polygon points="12,42 8,30 4,42" fill="#ffffff" />
                    <polygon points="-4,43 0,32 4,43" fill="#ffffff" />

                    {/* Khí Huyết Chân Hỏa Trong Miệng */}
                    <circle cx="0" cy="28" r="7" fill="#ef4444" filter="url(#nkGlowRed)" />
                    <circle cx="0" cy="28" r="3" fill="#ffffff" />

                    {/* Sóng Âm Gầm Vang Sấm Sét */}
                    <path d="M -34,44 Q 0,62 34,44" fill="none" stroke="#f87171" strokeWidth="2.8" strokeLinecap="round" opacity="0.9" />
                    <path d="M -48,56 Q 0,80 48,56" fill="none" stroke="#fde047" strokeWidth="2.2" strokeLinecap="round" opacity="0.75" />
                  </g>

                  {/* Bảng Nhãn Thần Thú Huyết Hổ */}
                  <g transform="translate(0, 106)">
                    <rect x="-105" y="-14" width="210" height="28" rx="14" fill="rgba(69, 10, 10, 0.95)" stroke="#ef4444" strokeWidth="1.8" filter="url(#nkGlowRed)" />
                    <text y="5" textAnchor="middle" fontSize="12" fontWeight="900" fill="#fef08a" letterSpacing="1">
                      🐯 {theLvl >= 10 ? '👑 THẦN THÚ HUYẾT HỔ' : '🐯 HUYẾT HỔ HÓA HÌNH'}
                    </text>
                  </g>
                </g>
              )}

              {/* ========================================================
                  DỊ TƯỢNG 2: THẦN THÚ CẤM HẢI LONG KÌNH (CHỈ HIỂN THỊ KHI TẦNG 7+)
                 ======================================================== */}
              {viewMode === 'phap' && hasWhale && (
                <g
                  transform="translate(0, -30)"
                  style={{ animation: 'nkWhaleMajestic 5.2s ease-in-out infinite' }}
                >
                  {/* Quầng Linh Hải Xanh Thẳm Quanh Cự Kình */}
                  <ellipse cx="0" cy="0" rx="148" ry="102" fill="rgba(6, 182, 212, 0.18)" filter="url(#nkGlowCyan)" />
                  <ellipse cx="0" cy="0" rx="126" ry="86" fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="8 6" opacity="0.75" />

                  {/* THÂN THỂ THÁI CỔ LONG KÌNH KHỔNG LỒ */}
                  {/* Thân Cá Voi Cổ Đại */}
                  <path
                    d="M -92,-8 Q -55,-60 28,-46 Q 92,-30 108,2 Q 114,35 38,42 Q -55,44 -92,-8 Z"
                    fill="url(#whaleBodyGrad)"
                    stroke="#7dd3fc"
                    strokeWidth="2.8"
                    filter="url(#nkGlowCyan)"
                  />

                  {/* Bụng Kình Phát Quang Ngọc Bích */}
                  <path
                    d="M -76,2 Q -32,32 32,30 Q 86,24 98,2 Q 54,11 -11,9 Q -54,4 -76,2 Z"
                    fill="rgba(165, 243, 252, 0.6)"
                  />

                  {/* Vây Lưng & Cổ Ngữ Long Tộc Phát Sáng */}
                  <path d="M 0,-48 Q 15,-74 30,-46 Z" fill="#0284c7" stroke="#bae6fd" strokeWidth="2" />
                  <path d="M -28,-8 Q 0,-36 20,-8 Q 40,-36 60,-8" fill="none" stroke="#fde047" strokeWidth="2.2" strokeDasharray="3 4" filter="url(#nkGlowGold)" />

                  {/* Vây Bơi Dài Uyển Chuyển (Pectoral Fins) */}
                  <path d="M -28,16 Q -12,52 20,30 Z" fill="#0369a1" stroke="#38bdf8" strokeWidth="2" />
                  <path d="M 6,14 Q 24,46 46,24 Z" fill="#0369a1" stroke="#38bdf8" strokeWidth="1.6" opacity="0.85" />

                  {/* Đuôi Cá Voi Bạt Lãng Uốn Lượn */}
                  <path
                    d="M -92,-8 Q -114,-26 -128,-18 Q -118,-4 -96,-7 Q -118,-4 -128,11 Q -114,20 -92,-8 Z"
                    fill="#0284c7"
                    stroke="#7dd3fc"
                    strokeWidth="2.6"
                  />
                  {/* Bọt nước phát quang sau đuôi */}
                  <circle cx="-134" cy="-5" r="4.5" fill="#a5f3fc" filter="url(#nkGlowCyan)" />
                  <circle cx="-145" cy="2" r="3" fill="#ffffff" />

                  {/* Cặp Mắt Thần Triệt Ngộ Hoàng Kim */}
                  <circle cx="76" cy="-11" r="5" fill="#fde047" filter="url(#nkGlowGold)" />
                  <circle cx="77" cy="-11" r="2.2" fill="#082f49" />

                  {/* Luồng Linh Thủy & Tinh Tú Phun Lên Từ Đỉnh Đầu */}
                  <g style={{ animation: 'nkWhaleSpoutSpray 3.2s ease-in-out infinite' }}>
                    <path d="M 15,-50 Q 18,-92 34,-100 M 15,-50 Q 8,-85 -5,-94 M 15,-50 Q 26,-82 46,-88" fill="none" stroke="#67e8f9" strokeWidth="2.6" strokeLinecap="round" filter="url(#nkGlowCyan)" />
                    <circle cx="34" cy="-100" r="4" fill="#ffffff" filter="url(#nkGlowGold)" />
                    <circle cx="-5" cy="-94" r="3" fill="#ffffff" />
                    <circle cx="46" cy="-88" r="2.8" fill="#fef08a" />
                  </g>

                  {/* Bảng Nhãn Thần Thú Long Kình */}
                  <g transform="translate(0, 106)">
                    <rect x="-105" y="-14" width="210" height="28" rx="14" fill="rgba(8, 47, 73, 0.95)" stroke="#06b6d4" strokeWidth="1.8" filter="url(#nkGlowCyan)" />
                    <text y="5" textAnchor="middle" fontSize="12" fontWeight="900" fill="#a5f3fc" letterSpacing="1">
                      🐋 {phapLvl >= 10 ? '👑 THÁI CỔ LONG KÌNH' : '🐋 CẤM HẢI LONG KÌNH'}
                    </text>
                  </g>
                </g>
              )}
            </g>
          </svg>

          {/* 3. THANH THÔNG SỐ CẢNH GIỚI NGƯNG KHÍ ĐƯỢC TỐI ƯU GỌN GÀNG Ở ĐÁY */}
          <div style={{
            position: 'absolute',
            bottom: 14,
            zIndex: 25,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '6px 16px',
            borderRadius: 24,
            background: 'rgba(8, 14, 24, 0.94)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.6)'
          }}>
            {/* Box Hải Sơn */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 800,
              color: '#f87171',
              padding: '4px 10px',
              borderRadius: 14,
              background: (cultivation?.ngungKhiActivePath || cultivation?.ngungKhiPath || 'the') === 'the' ? 'rgba(239, 68, 68, 0.18)' : 'transparent',
              border: (cultivation?.ngungKhiActivePath || cultivation?.ngungKhiPath || 'the') === 'the' ? '1px solid rgba(248, 113, 113, 0.6)' : '1px solid transparent',
              boxShadow: (cultivation?.ngungKhiActivePath || cultivation?.ngungKhiPath || 'the') === 'the' ? '0 0 10px rgba(239, 68, 68, 0.4)' : 'none'
            }}>
              <span>⚔️ Hải Sơn:</span>
              <span style={{ color: '#fca5a5' }}>Tầng {theLvl}/10</span>
              <span style={{ fontSize: 10.5, color: '#94a3b8' }}>({theExp.toLocaleString()} / 4,500 EXP)</span>
              {(cultivation?.ngungKhiActivePath || cultivation?.ngungKhiPath || 'the') === 'the' && (
                <span style={{ fontSize: 10, color: '#fef08a', fontWeight: 900 }}>⚡ Đang nạp</span>
              )}
            </div>

            <div style={{ width: 1, height: 14, background: 'rgba(255, 255, 255, 0.18)' }} />

            {/* Box Hóa Hải */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 800,
              color: '#38bdf8',
              padding: '4px 10px',
              borderRadius: 14,
              background: (cultivation?.ngungKhiActivePath || cultivation?.ngungKhiPath || 'the') === 'phap' ? 'rgba(56, 189, 248, 0.18)' : 'transparent',
              border: (cultivation?.ngungKhiActivePath || cultivation?.ngungKhiPath || 'the') === 'phap' ? '1px solid rgba(56, 189, 248, 0.6)' : '1px solid transparent',
              boxShadow: (cultivation?.ngungKhiActivePath || cultivation?.ngungKhiPath || 'the') === 'phap' ? '0 0 10px rgba(56, 189, 248, 0.4)' : 'none'
            }}>
              <span>🌊 Hóa Hải:</span>
              <span style={{ color: '#7dd3fc' }}>Tầng {phapLvl}/10</span>
              <span style={{ fontSize: 10.5, color: '#94a3b8' }}>({phapExp.toLocaleString()} / 4,500 EXP)</span>
              {(cultivation?.ngungKhiActivePath || cultivation?.ngungKhiPath || 'the') === 'phap' && (
                <span style={{ fontSize: 10, color: '#bae6fd', fontWeight: 900 }}>⚡ Đang nạp</span>
              )}
            </div>

            {theLvl >= 10 && phapLvl >= 10 && (
              <>
                <div style={{ width: 1, height: 14, background: 'rgba(255, 255, 255, 0.18)' }} />
                <div style={{ fontSize: 11.5, fontWeight: 900, color: '#fde047', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>👑</span>
                  <span>THỂ PHÁP SONG TU VIÊN MÃN</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeViewRealm === 'truc_co' && (
        <div style={{
          width: '100%',
          height: '100%',
          minHeight: '100%',
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          borderRadius: 0,
          border: 'none',
          backgroundColor: '#020617',
          backgroundImage: `radial-gradient(circle at 50% 50%, rgba(2, 6, 23, 0.3) 0%, rgba(2, 6, 23, 0.9) 100%), url('${getAssetUrl('images/truc_co_galaxy_bg.jpg')}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}>
          
          {/* TOÀN CẢNH TINH ĐỒ VŨ TRỤ TRÀN MÀN HÌNH */}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden', borderRadius: 0 }}>
            <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.35 }}>
              <defs>
                <pattern id="celestialGridPattern" width="80" height="80" patternUnits="userSpaceOnUse">
                  <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgba(34, 195, 240, 0.08)" strokeWidth="0.8" />
                  <circle cx="80" cy="80" r="1.2" fill="rgba(34, 195, 240, 0.35)" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#celestialGridPattern)" />
            </svg>
          </div>
          
          {/* 121 CỰC CẢNH THIÊN ĐỈNH (HEADER BADGE TRUNG TÂM — THÔNG THOÁNG KHÔNG CHẠM LỬA) */}
          <div style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 14,
            background: is121Unlocked 
              ? 'linear-gradient(90deg, rgba(255, 63, 213, 0.3), rgba(168, 85, 247, 0.4))'
              : 'rgba(8, 18, 36, 0.88)',
            border: `1px solid ${is121Unlocked ? 'var(--color-cuc-canh, #ff3fd5)' : 'rgba(56, 189, 248, 0.45)'}`,
            backdropFilter: 'blur(12px)',
            boxShadow: is121Unlocked ? '0 0 12px rgba(255, 63, 213, 0.5)' : '0 0 8px rgba(0, 0, 0, 0.5)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            maxWidth: '46%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontSize: 10
          }}>
            <span style={{ 
              fontSize: 11.5, 
              fontWeight: 800, 
              letterSpacing: 0.6,
              color: is121Unlocked ? 'var(--color-cuc-canh, #ff3fd5)' : '#bae6fd',
              textShadow: '0 0 8px rgba(56, 189, 248, 0.6)'
            }}>
              {is121Unlocked ? '✦ CỰC CẢNH 121: HỖN ĐỘN KHAI HOA' : '✦ CỰC CẢNH 121: TỬ VI THIÊN ĐỈNH'}
            </span>
          </div>

          {/* FLOATING HOVER TOOLTIP */}
          {hoveredStar && (
            <div style={{
              position: 'absolute',
              bottom: 18,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 25,
              padding: '8px 18px',
              borderRadius: 8,
              background: 'rgba(8, 18, 36, 0.95)',
              border: `1px solid ${hoveredStar.color}`,
              boxShadow: `0 0 24px ${hoveredStar.color}66`,
              color: '#fff',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              pointerEvents: 'none',
              animation: 'fadeIn 0.2s ease'
            }}>
              <span style={{ color: hoveredStar.color, fontWeight: 700 }}>{hoveredStar.name}</span>
              <span style={{ color: 'var(--text-muted)' }}>·</span>
              <span style={{ color: 'var(--text-sub)' }}>{hoveredStar.category}</span>
              <span style={{ color: 'var(--text-muted)' }}>·</span>
              <span style={{ color: hoveredStar.isUnlocked ? 'var(--color-kim)' : 'var(--text-muted)', fontWeight: 600 }}>
                {hoveredStar.isUnlocked ? '✦ Đã thắp sáng' : `Tu Vi cần: ${TRUC_CO_KHIEU_THRESHOLDS[hoveredStar.index]?.toLocaleString()} EXP`}
              </span>
            </div>
          )}

          {/* TỨ ĐẠI LIÊN ĐÀI 12 PHẨM CỐ ĐỊNH Ở 4 GÓC MÀN HÌNH (HTML ABSOLUTE CORNERS) */}
          {/* Góc Tây Bắc - Tạo Hóa Thanh Liên */}
          <div 
            className="lotus-altar-tl"
            onClick={() => { setSelectedSlot(0); setLampModalOpen(true); }}
          >
            <LotusAltarSlot
              altar={{ idx: 0, position: 'topLeft' }}
              isFilled={Boolean(absorbedLamps[0])}
              lampObj={absorbedLamps[0] ? LIFE_LAMPS.find(l => l.id === absorbedLamps[0]) : null}
              ArtifactIcon={ArtifactIcon}
              phapKhieuUnlocked={openedCount}
            />
          </div>

          {/* Góc Đông Bắc - Diệt Thế Hắc Liên */}
          <div 
            className="lotus-altar-tr"
            onClick={() => { setSelectedSlot(1); setLampModalOpen(true); }}
          >
            <LotusAltarSlot
              altar={{ idx: 1, position: 'topRight' }}
              isFilled={Boolean(absorbedLamps[1])}
              lampObj={absorbedLamps[1] ? LIFE_LAMPS.find(l => l.id === absorbedLamps[1]) : null}
              ArtifactIcon={ArtifactIcon}
              phapKhieuUnlocked={openedCount}
            />
          </div>

          {/* Góc Tây Nam - Công Đức Kim Liên */}
          <div 
            className="lotus-altar-bl"
            onClick={() => { setSelectedSlot(2); setLampModalOpen(true); }}
          >
            <LotusAltarSlot
              altar={{ idx: 2, position: 'bottomLeft' }}
              isFilled={Boolean(absorbedLamps[2])}
              lampObj={absorbedLamps[2] ? LIFE_LAMPS.find(l => l.id === absorbedLamps[2]) : null}
              ArtifactIcon={ArtifactIcon}
              phapKhieuUnlocked={openedCount}
            />
          </div>

          {/* Góc Đông Nam - Nghiệp Hỏa Hồng Liên */}
          <div 
            className="lotus-altar-br"
            onClick={() => { setSelectedSlot(3); setLampModalOpen(true); }}
          >
            <LotusAltarSlot
              altar={{ idx: 3, position: 'bottomRight' }}
              isFilled={Boolean(absorbedLamps[3])}
              lampObj={absorbedLamps[3] ? LIFE_LAMPS.find(l => l.id === absorbedLamps[3]) : null}
              ArtifactIcon={ArtifactIcon}
              phapKhieuUnlocked={openedCount}
            />
          </div>



          {/* SVG TINH ĐỒ LỤC ĐẠI TINH TỌA & BÁT QUÁI TIÊN THIÊN CỬU CUNG ĐẠI TRẬN */}
          <svg 
            viewBox="0 0 1000 1000" 
            preserveAspectRatio="xMidYMid meet" 
            style={{ width: '100%', height: '100%', maxHeight: '100%', zIndex: 5 }}
          >
            <defs>
              <filter id="laserGlow" filterUnits="userSpaceOnUse" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur1" />
                <feMerge>
                  <feMergeNode in="blur1" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <filter id="starBurstGlow" filterUnits="userSpaceOnUse" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="2.0" result="blur1" />
                <feMerge>
                  <feMergeNode in="blur1" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <filter id="flameGlow" filterUnits="userSpaceOnUse" x="-1000" y="-1000" width="3000" height="3000">
                <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur1" />
                <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur2" />
                <feMerge>
                  <feMergeNode in="blur2" />
                  <feMergeNode in="blur1" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <filter id="zenithGlow" filterUnits="userSpaceOnUse" x="-1000" y="-1000" width="3000" height="3000">
                <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur1" />
                <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur2" />
                <feMerge>
                  <feMergeNode in="blur2" />
                  <feMergeNode in="blur1" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <radialGradient id="taijiCoreGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(251, 191, 36, 0.45)" />
                <stop offset="60%" stopColor="rgba(56, 189, 248, 0.2)" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>

              <linearGradient id="taijiYangGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="50%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#0284c7" />
              </linearGradient>

              <linearGradient id="taijiYinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#030712" />
                <stop offset="60%" stopColor="#0b1329" />
                <stop offset="100%" stopColor="#1e1b4b" />
              </linearGradient>
            </defs>

            {/* CSS Keyframes cho hiệu ứng linh hoạt Cực Cảnh */}
            <style>{`
              @keyframes spiritStreamFlow {
                from { stroke-dashoffset: 40; }
                to { stroke-dashoffset: 0; }
              }
              @keyframes celestialChainHum {
                0%, 100% { opacity: 0.85; filter: drop-shadow(0 0 6px #fde047); }
                50% { opacity: 1; filter: drop-shadow(0 0 14px #fde047) drop-shadow(0 0 22px #ffffff); }
              }
              @keyframes shockwaveBreakthrough {
                0% { r: 10px; opacity: 1; stroke-width: 8px; }
                100% { r: 480px; opacity: 0; stroke-width: 1px; }
              }
              @keyframes stellarResonance {
                0%, 100% { transform: scale(1); filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.8)); }
                50% { transform: scale(1.18); filter: drop-shadow(0 0 16px rgba(253, 224, 71, 0.95)) drop-shadow(0 0 24px #ffffff); }
              }
            `}</style>

            {/* A. VÒNG LỤC ĐẠI TINH TỌA 120 KHIẾU */}
            <g 
              className={isRotating ? "smooth-celestial-spin-cw" : undefined}
              style={{ 
                transformOrigin: `${cx}px ${cy}px`
              }}
            >
              {/* Vành Tinh Đồ Ngoại Vi (Outer Astrolabe Rings R=378 & Inner Border R=192) */}
              <circle cx={cx} cy={cy} r="378" fill="none" stroke="rgba(56, 189, 248, 0.95)" strokeWidth="2.2" />
              <circle cx={cx} cy={cy} r="368" fill="none" stroke="rgba(56, 189, 248, 0.55)" strokeWidth="1.2" strokeDasharray="4 2" />
              <circle cx={cx} cy={cy} r="192" fill="none" stroke="rgba(56, 189, 248, 0.85)" strokeWidth="2.0" />

              {/* 6 VẠCH PHÂN CHIA 6 TINH TỌA ĐỒNG NHẤT 100% (192 -> 378) */}
              {[0, 60, 120, 180, 240, 300].map((deg) => (
                <g key={`hex-sector-divider-${deg}`} transform={`rotate(${deg}, ${cx}, ${cy})`}>
                  {/* Lớp 1: Hào quang tỏa rộng quanh tia laser */}
                  <line 
                    x1={cx + 192} 
                    y1={cy} 
                    x2={cx + 378} 
                    y2={cy} 
                    stroke="rgba(56, 189, 248, 0.35)" 
                    strokeWidth="4.0" 
                  />
                  {/* Lớp 2: Tia laser xanh lam ngọc sắc nét */}
                  <line 
                    x1={cx + 192} 
                    y1={cy} 
                    x2={cx + 378} 
                    y2={cy} 
                    stroke="#38bdf8" 
                    strokeWidth="2.4" 
                  />
                  {/* Lớp 3: Lõi năng lượng trắng sáng */}
                  <line 
                    x1={cx + 192} 
                    y1={cy} 
                    x2={cx + 378} 
                    y2={cy} 
                    stroke="#ffffff" 
                    strokeWidth="1.2" 
                  />
                  {/* 3 Chốt Định Vị Ngọc Vàng Kim */}
                  <circle cx={cx + 192} cy={cy} r="4.5" fill="#fbbf24" stroke="#ffffff" strokeWidth="1.3" />
                  <circle cx={cx + 285} cy={cy} r="3.6" fill="#fbbf24" stroke="#ffffff" strokeWidth="1.2" />
                  <circle cx={cx + 378} cy={cy} r="5.5" fill="#fbbf24" stroke="#ffffff" strokeWidth="1.5" />
                </g>
              ))}

              {/* Đường nối chòm sao (Constellation Connecting Edges) */}
              {constellationList.map((c) => {
                const isTarget = activeMeridian === 'all' || activeMeridian === c.element || activeMeridian === c.id;
                return (
                  <g key={c.id} opacity={isTarget ? 1 : 0.25}>
                    {c.edgePaths && c.edgePaths.map((edge, eIdx) => (
                      <path 
                        key={eIdx} 
                        d={edge.d} 
                        fill="none" 
                        stroke={edge.isUnlocked ? c.color : 'rgba(56, 189, 248, 0.45)'} 
                        strokeWidth={edge.isUnlocked ? "2.0" : "1.1"} 
                        strokeDasharray={edge.isUnlocked ? undefined : "3 3"}
                        /* clean vector edge */
                        opacity={edge.isUnlocked ? 0.95 : 0.5}
                      />
                    ))}
                  </g>
                );
              })}

              {/* 120 Stars (Các Quả Cầu Tinh Khiếu Phát Quang Đồng Bộ) */}
              {stars.map((star) => {
                const isSelected = selectedNode?.index === star.index;
                const isNext = !star.isUnlocked && star.index === openedCount + 1;
                const isTarget = activeMeridian === 'all' || activeMeridian === star.element || activeMeridian === star.constellationId;
                const isAll120Ready = openedCount >= 120 && !is121Unlocked;

                let opacity = 0.9;
                if (star.isUnlocked) opacity = 1;
                else if (isNext) opacity = 0.95;
                if (!isTarget) opacity *= 0.25;

                return (
                  <g 
                    key={star.index} 
                    transform={`translate(${star.x}, ${star.y})`}
                    onClick={() => setSelectedNode(star)}
                    onMouseEnter={() => setHoveredStar(star)}
                    onMouseLeave={() => setHoveredStar(null)}
                    style={{ 
                      cursor: 'pointer',
                      animation: isAll120Ready ? 'stellarResonance 2.2s ease-in-out infinite alternate' : 'none'
                    }}
                  >
                    {/* Click Hitbox to rộng dễ bấm */}
                    <circle r="18" fill="transparent" />

                    {/* Vòng đập xung động cho sao kế tiếp */}
                    {isNext && (
                      <circle r="15" fill="none" stroke={star.color} strokeWidth="2.0" opacity="0.95" style={{ animation: 'pulseCore 1.2s ease-in-out infinite alternate' }} />
                    )}

                    {/* Vòng tuyển chọn */}
                    {isSelected && (
                      <circle r="17" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeDasharray="4 3" opacity="0.9" />
                    )}

                    {/* ĐỐM SAO PHÁT QUANG TO RÕ, TRÒN TRỊA & LUNG LINH ĐA TẦNG */}
                    {star.isUnlocked ? (
                      <>
                        {/* Tầng 1: Quầng hào quang rộng tỏa sáng */}
                        <circle r="15" fill={star.color} opacity="0.28" />
                        {/* Tầng 2: Hào quang trung phát sáng đậm */}
                        <circle r="9.5" fill={star.color} opacity="0.55" />
                        {/* Tầng 3: Quả cầu ngọc sao to rõ rực rỡ sắc màu */}
                        <circle r="6.8" fill={star.color} opacity={opacity} />
                        {/* Tầng 4: Lõi sáng ngọc trắng tròn xoe tạo khối 3D rực sáng */}
                        <circle r="3.4" fill="#ffffff" />
                      </>
                    ) : isNext ? (
                      <>
                        <circle r="11" fill={star.color} opacity="0.35" />
                        <circle r="5.8" fill={star.color} stroke="#ffffff" strokeWidth="1.4" opacity={opacity} />
                        <circle r="2.6" fill="#ffffff" />
                      </>
                    ) : (
                      <circle 
                        r="4.2" 
                        fill="rgba(56, 189, 248, 0.45)" 
                        stroke="rgba(255, 255, 255, 0.7)" 
                        strokeWidth="1.0" 
                        opacity={opacity} 
                      />
                    )}
                  </g>
                );
              })}
            </g>

            {/* ========================================================
                C1. VÒNG CON GIÁP / 24 SƠN HƯỚNG — XOAY THEO CHIỀU KIM ĐỒNG HỒ (R=154 -> 192)
               ======================================================== */}
            <g 
              id="conGiap24SonRing"
              style={{ 
                animation: isRotating ? 'celestialRotate 180s linear infinite' : 'none', 
                transformOrigin: `${cx}px ${cy}px` 
              }}
            >
              {/* Vành màu trắng trong suốt thủy tinh (Frosted White Glass Ring R=154 -> 192) */}
              <circle 
                cx={cx} 
                cy={cy} 
                r="192" 
                fill="rgba(255, 255, 255, 0.12)" 
                stroke="rgba(255, 255, 255, 0.55)" 
                strokeWidth="1.8" 
                filter="url(#laserGlow)" 
              />
              <circle 
                cx={cx} 
                cy={cy} 
                r="154" 
                fill="rgba(6, 12, 24, 0.95)" 
                stroke="rgba(251, 191, 36, 0.85)" 
                strokeWidth="1.6" 
                filter="url(#laserGlow)" 
              />

              {/* 24 Sơn Hướng: 4 chữ CÀN TỐN CẤN KHÔN màu vàng phát sáng, các can chi màu xen kẽ */}
              {(() => {
                let chiCount = 0;
                return BAGUA_24_SON.map((son, sIdx) => {
                  const rad = (son.angle * Math.PI) / 180;
                  const isQuai = son.type === 'quai'; // CÀN, TỐN, CẤN, KHÔN

                  // Vạch chia mép ngoài (186 -> 192) và mép trong (154 -> 158), không xuyên qua chữ
                  const xOut1 = cx + 186 * Math.cos(rad);
                  const yOut1 = cy + 186 * Math.sin(rad);
                  const xOut2 = cx + 192 * Math.cos(rad);
                  const yOut2 = cy + 192 * Math.sin(rad);

                  const xIn1 = cx + 154 * Math.cos(rad);
                  const yIn1 = cy + 154 * Math.sin(rad);
                  const xIn2 = cx + 158 * Math.cos(rad);
                  const yIn2 = cy + 158 * Math.sin(rad);

                  const textR = 173;
                  const tx = cx + textR * Math.cos(rad);
                  const ty = cy + textR * Math.sin(rad);

                  let textColor = '#ffffff';
                  let isGlow = false;

                  if (isQuai) {
                    textColor = '#fbbf24'; // 4 chữ CÀN, TỐN, CẤN, KHÔN: Màu vàng kim phát sáng
                    isGlow = true;
                  } else {
                    textColor = chiCount % 2 === 0 ? '#7dd3fc' : '#ffffff'; // Can Chi xen kẽ bắt đầu từ TÝ
                    chiCount++;
                  }

                  const upperLabel = (son.label || son.name).toUpperCase();

                  return (
                    <g key={`son-24-${sIdx}`}>
                      {/* Vạch đánh dấu mép ngoài */}
                      <line
                        x1={xOut1}
                        y1={yOut1}
                        x2={xOut2}
                        y2={yOut2}
                        stroke={isQuai ? "rgba(251, 191, 36, 0.95)" : "rgba(255, 255, 255, 0.45)"}
                        strokeWidth={isQuai ? "1.8" : "0.9"}
                      />
                      {/* Vạch đánh dấu mép trong */}
                      <line
                        x1={xIn1}
                        y1={yIn1}
                        x2={xIn2}
                        y2={yIn2}
                        stroke={isQuai ? "rgba(251, 191, 36, 0.95)" : "rgba(255, 255, 255, 0.35)"}
                        strokeWidth={isQuai ? "1.8" : "0.9"}
                      />
                      {/* Điểm nút hình thoi vàng kim tại 4 quẻ chính */}
                      {isQuai && (
                        <g transform={`translate(${cx + 192 * Math.cos(rad)}, ${cy + 192 * Math.sin(rad)}) rotate(${son.angle + 45})`}>
                          <rect x="-2.5" y="-2.5" width="5" height="5" fill="#fbbf24" stroke="#ffffff" strokeWidth="0.8" filter="url(#laserGlow)" />
                        </g>
                      )}
                      {/* Chữ in hoa xoay hướng về tâm */}
                      <g transform={`translate(${tx}, ${ty}) rotate(${son.angle + 90})`}>
                        <text
                          x="0"
                          y="0"
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize="9.5"
                          fontWeight="900"
                          fill={textColor}
                          filter={isGlow ? "url(#laserGlow)" : "drop-shadow(0 0 2px rgba(0, 0, 0, 0.95))"}
                          style={{ fontFamily: 'var(--font-serif, serif)' }}
                        >
                          {upperLabel}
                        </text>
                      </g>
                    </g>
                  );
                });
              })()}
            </g>

            {/* ========================================================
                C2. VÒNG BÁT QUÁI NỘI CUNG — XOAY NGƯỢC CHIỀU KIM ĐỒNG HỒ (R=129)
               ======================================================== */}
            <g 
              id="sacredBaguaTrigramRing"
              style={{ 
                animation: isRotating ? 'celestialCounterRotate 140s linear infinite' : 'none', 
                transformOrigin: `${cx}px ${cy}px` 
              }}
            >
              <circle cx={cx} cy={cy} r="129" fill="none" stroke="rgba(56, 189, 248, 0.55)" strokeWidth="1.2" />

              {/* Bát Giác Trận Đồ Vàng Kim Nét Đứt & Đường Kinh Tuyến (R=129) */}
              <polygon
                points={Array.from({ length: 8 }).map((_, i) => {
                  const ang = (i * 45 + 22.5) * Math.PI / 180;
                  return `${cx + 129 * Math.cos(ang)},${cy + 129 * Math.sin(ang)}`;
                }).join(' ')}
                fill="rgba(6, 12, 24, 0.55)"
                stroke="rgba(251, 191, 36, 0.9)"
                strokeWidth="2.0"
                strokeDasharray="6 3"
                filter="url(#laserGlow)"
              />

              {/* 8 Nốt Phù Ấn Xanh Lam tại 8 đỉnh Bát Giác */}
              {Array.from({ length: 8 }).map((_, i) => {
                const ang = (i * 45 + 22.5) * Math.PI / 180;
                const px = cx + 129 * Math.cos(ang);
                const py = cy + 129 * Math.sin(ang);
                return (
                  <g key={`octa-node-${i}`}>
                    <line x1={cx} y1={cy} x2={px} y2={py} stroke="rgba(56, 189, 248, 0.25)" strokeWidth="0.8" strokeDasharray="3 3" />
                    <rect x={px - 2.5} y={py - 2.5} width="5" height="5" fill="#38bdf8" stroke="#ffffff" strokeWidth="0.8" filter="url(#laserGlow)" />
                  </g>
                );
              })}

              {/* Vòng Tiên Thiên Bát Quái Nội Cung (Tách rõ ràng, không cắt qua vạch quẻ) */}
              <circle cx={cx} cy={cy} r="121" fill="none" stroke="rgba(251, 191, 36, 0.4)" strokeWidth="1.0" />
              <circle cx={cx} cy={cy} r="95" fill="none" stroke="rgba(251, 191, 36, 0.55)" strokeWidth="1.2" filter="url(#laserGlow)" />
              <circle cx={cx} cy={cy} r="70" fill="none" stroke="rgba(56, 189, 248, 0.6)" strokeWidth="1.2" />

              {/* 8 Quẻ Tiên Thiên Bát Quái: Màu Vàng Hoàng Kim Linh Lực, sắc nét thông thoáng */}
              {BAGUA_LIST.map((bg, idx) => {
                const rotAngle = bg.angle + 90;
                return (
                  <g key={idx} transform={`translate(${cx}, ${cy}) rotate(${rotAngle})`}>
                    {/* Vạch Quẻ Tiên Thiên Vàng Kim Uy Nghiêm (Không bị đường tròn nào cắt qua) */}
                    <text
                      x="0"
                      y="-108"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="21"
                      fontWeight="bold"
                      fill={is121Unlocked ? "#fde047" : "#fbbf24"}
                      filter="url(#laserGlow)"
                      style={{
                        filter: 'drop-shadow(0 0 6px rgba(250, 204, 21, 0.95))'
                      }}
                    >
                      {bg.symbol}
                    </text>
                    {/* Tên Quẻ Màu Xanh Lam Sáng */}
                    <text
                      x="0"
                      y="-82"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="9.5"
                      fontWeight="900"
                      fill="#38bdf8"
                      letterSpacing="1.2"
                      style={{ 
                        fontFamily: 'var(--font-serif, serif)',
                        filter: 'drop-shadow(0 0 4px rgba(56, 189, 248, 0.95))'
                      }}
                    >
                      {bg.name}
                    </text>
                  </g>
                );
              })}
            </g>

            {/* ========================================================
                C3. TRUNG TÂM TINH ĐỒ: 36 PHẨM HỖN ĐỘN THANH LIÊN (KHI MỞ 121) / THÁI CỰC ĐAN ĐIỀN (KHI PHONG ẤN)
               ======================================================== */}
            {is121Unlocked ? (
              /* ĐÓA SEN 36 PHẨM HỖN ĐỘN THANH LIÊN CHÍNH TÂM 100% TINH ĐỒ */
              <foreignObject
                x={cx - 88}
                y={cy - 88}
                width={176}
                height={176}
                style={{ overflow: 'visible', pointerEvents: 'auto', cursor: 'pointer', background: 'transparent' }}
                onClick={() => { setSelectedSlot(4); setLampModalOpen(true); }}
              >
                <ChaosLotusThrone
                  isFilled={Boolean(absorbedLamps[4])}
                  lampObj={fifthLampObj}
                  ArtifactIcon={ArtifactIcon}
                  idx={4}
                />
              </foreignObject>
            ) : (
              /* KHỐI THÁI CỰC THỦY TINH ĐAN ĐIỀN (KHI CỰC CẢNH 121 ĐANG PHONG ẤN) */
              <g onClick={handleCenterClick} style={{ cursor: 'pointer' }}>
                {/* Quầng sáng linh khí xoáy động xung quanh Thái Cực */}
                <circle cx={cx} cy={cy} r="60" fill="url(#taijiCoreGlow)" style={{ animation: 'pulseCore 2s ease-in-out infinite alternate' }} />
                
                {/* Vòng hào quang Thái Cực thủy tinh */}
                <circle 
                  cx={cx} 
                  cy={cy} 
                  r="48" 
                  fill="none" 
                  stroke={openedCount >= 120 ? "#fde047" : "rgba(251, 191, 36, 0.65)"} 
                  strokeWidth={openedCount >= 120 ? "2.2" : "1.5"} 
                  strokeDasharray="10 5" 
                  filter={openedCount >= 120 ? "url(#laserGlow)" : undefined}
                  style={{ animation: isRotating ? 'celestialRotate 14s linear infinite' : 'none', transformOrigin: `${cx}px ${cy}px` }} 
                />

                {/* Vành kính thủy tinh Đan Điền (Frosted Crystal Glass Bezel) */}
                <circle 
                  cx={cx} 
                  cy={cy} 
                  r="38" 
                  fill="rgba(255, 255, 255, 0.1)" 
                  stroke="rgba(255, 255, 255, 0.75)" 
                  strokeWidth="2.0" 
                  filter="url(#laserGlow)" 
                />

                {/* Khối Thái Cực Âm Dương Ngư Thủy Tinh Xoay Theo Chiều Kim Đồng Hồ */}
                <g style={{ animation: isRotating ? 'celestialRotate 16s linear infinite' : 'none', transformOrigin: `${cx}px ${cy}px` }}>
                  {/* Dương Ngư (Thái Dương - Trắng Ngọc Thủy Tinh Ánh Lam) */}
                  <path
                    d={`M ${cx} ${cy - 34} A 34 34 0 0 1 ${cx} ${cy + 34} A 17 17 0 0 1 ${cx} ${cy} A 17 17 0 0 0 ${cx} ${cy - 34} Z`}
                    fill="url(#taijiYangGrad)"
                    filter="url(#laserGlow)"
                  />
                  {/* Âm Ngư (Thái Âm - Hắc Ngọc Thủy Tinh Dạ Lam) */}
                  <path
                    d={`M ${cx} ${cy + 34} A 34 34 0 0 1 ${cx} ${cy - 34} A 17 17 0 0 1 ${cx} ${cy} A 17 17 0 0 0 ${cx} ${cy + 34} Z`}
                    fill="url(#taijiYinGrad)"
                    stroke="rgba(56, 189, 248, 0.55)"
                    strokeWidth="1.0"
                  />
                  {/* Vệt phản quang thủy tinh trong suốt (Glass Sheen Highlight) */}
                  <path
                    d={`M ${cx - 24} ${cy - 12} A 28 28 0 0 1 ${cx + 24} ${cy - 12} A 32 32 0 0 0 ${cx - 24} ${cy - 12} Z`}
                    fill="rgba(255, 255, 255, 0.45)"
                  />
                  {/* Đường cong S phân định Âm Dương phát sáng */}
                  <path
                    d={`M ${cx} ${cy - 34} A 17 17 0 0 1 ${cx} ${cy} A 17 17 0 0 0 ${cx} ${cy + 34}`}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1.2"
                    filter="url(#laserGlow)"
                  />

                  {/* Âm Nhãn (Mắt ngọc Lam Thủy Tinh): Phát quang huyền ảo */}
                  <circle cx={cx} cy={cy + 17} r="6.0" fill="#38bdf8" opacity="0.5" filter="url(#laserGlow)" />
                  <circle cx={cx} cy={cy + 17} r="4.0" fill="#030712" stroke="#38bdf8" strokeWidth="1.5" />
                  <circle cx={cx} cy={cy + 17} r="1.8" fill="#ffffff" filter="url(#laserGlow)" />

                  {/* Dương Nhãn (Mắt ngọc Vàng Kim Thủy Tinh): Phát quang rực rỡ */}
                  <circle cx={cx} cy={cy - 17} r="6.0" fill="#fbbf24" opacity="0.5" filter="url(#laserGlow)" />
                  <circle cx={cx} cy={cy - 17} r="4.0" fill="#fbbf24" stroke="#ffffff" strokeWidth="1.2" />
                  <circle cx={cx} cy={cy - 17} r="1.8" fill="#ffffff" />
                </g>

                {/* Vòng bao viền ngoài Thái Cực */}
                <circle cx={cx} cy={cy} r="34" fill="none" stroke="rgba(255, 255, 255, 0.85)" strokeWidth="1.4" filter="url(#laserGlow)" />

                {/* 4 SỢI XÍCH KHÓA THIÊN ĐẠO HOÀNG KIM (KHI ĐẠT 120 KHIẾU CHỜ PHÁ THIÊN KHAI 121) */}
                {openedCount >= 120 && (
                  <g style={{ animation: 'celestialChainHum 1.6s ease-in-out infinite alternate', transformOrigin: `${cx}px ${cy}px` }}>
                    {/* Xích Chữ X */}
                    <line x1={cx - 38} y1={cy - 38} x2={cx + 38} y2={cy + 38} stroke="#fde047" strokeWidth="2.2" strokeDasharray="6 3" filter="url(#laserGlow)" />
                    <line x1={cx + 38} y1={cy - 38} x2={cx - 38} y2={cy + 38} stroke="#fde047" strokeWidth="2.2" strokeDasharray="6 3" filter="url(#laserGlow)" />
                    {/* Phù ấn Khóa Tâm */}
                    <circle cx={cx} cy={cy} r="14" fill="rgba(253, 224, 71, 0.25)" stroke="#ffffff" strokeWidth="1.5" filter="url(#laserGlow)" />
                    <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fontWeight="900" fill="#ffffff">⚡</text>
                  </g>
                )}
              </g>
            )}

            {/* C4. KHOẢNH KHẮC ĐỘT PHÁ CỰC CẢNH 121 (CINEMATIC BREAKTHROUGH TRANSITION EFFECT) */}
            {isBreakthroughAnim && (
              <g style={{ pointerEvents: 'none' }}>
                {/* 120 Tia Laser Đồng Loạt Bắn Về Tâm */}
                {stars.filter(s => s.isUnlocked).map((s, sIdx) => (
                  <line
                    key={`breakthrough-beam-${sIdx}`}
                    x1={s.x}
                    y1={s.y}
                    x2={cx}
                    y2={cy}
                    stroke={s.color}
                    strokeWidth="2.5"
                    filter="url(#starBurstGlow)"
                    opacity="0.9"
                  />
                ))}

                {/* Sóng Xung Kích Chấn Động Lan Tỏa */}
                <circle
                  cx={cx}
                  cy={cy}
                  r="20"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="6"
                  filter="url(#starBurstGlow)"
                  style={{ animation: 'shockwaveBreakthrough 1.2s ease-out infinite' }}
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r="20"
                  fill="none"
                  stroke="#fde047"
                  strokeWidth="4"
                  filter="url(#starBurstGlow)"
                  style={{ animation: 'shockwaveBreakthrough 1.2s ease-out 0.4s infinite' }}
                />

                {/* Luồng Chớp Sáng Trắng Tuyết Tại Tâm */}
                <circle cx={cx} cy={cy} r="120" fill="url(#taijiCoreGlow)" filter="url(#zenithGlow)" />
                <circle cx={cx} cy={cy} r="60" fill="#ffffff" filter="url(#starBurstGlow)" />
              </g>
            )}
          </svg>
        </div>
      )}

      {activeViewRealm === 'kim_dan' && (() => {
        // Tọa độ tâm quang học chữ thập thực tế của ảnh Thần Nhãn
        
          // TỪ ĐIỂN THÔNG TIN 13 THIÊN CUNG CHI TIẾT
          const PALACE_LORE_INFO = {
            'Vận Mệnh Hư Vô Cung': {
              rank: 'Chí Tôn Thần Phẩm (Mệnh Hỏa Cực Cảnh 121)',
              type: 'Mệnh Hỏa Đăng Tiên',
              power: '+1.500 Lực Chiến Kim Đan · Khai Mở Thiên Mệnh',
              desc: 'Quy tụ quy tắc vận mệnh chi lực, ngự trị trên đỉnh cửu thiên, phá toái hư không, dẫn dắt thai nghén Thiên Mệnh Đạo Anh.'
            },
            'Đại Đạo Tiêu Dao Cung': {
              rank: 'Tiên Phẩm Thượng Thừa (Bảo Vật Trấn Áp)',
              type: 'Pháp Bảo Trấn Cung',
              power: '+1.000 Lực Chiến · +15% Tốc Độ Hấp Thu Linh Khí',
              desc: 'Đại đạo tiêu dao tự tại, ngự phong lăng tuyệt, tâm ma bất xâm, vạn kiếp bất diệt.'
            },
            'Tổ Long Thần Cung': {
              rank: 'Thần Phẩm Đăng Tiên (Mệnh Đăng #5)',
              type: 'Thần Thú Mệnh Đăng',
              power: '+1.200 Lực Chiến · +20% Thể Phách Phòng Ngự',
              desc: 'Chân long chi tức bao phủ thức hải, uy áp bát hoang cửu u, hộ trì đạo cơ Kim Đan bất hoại.'
            },
            'Hư Vô Tịch Diệt Cung': {
              rank: 'Hỗn Độn Thần Phẩm (Mệnh Đăng #6)',
              type: 'Hỗn Độn Mệnh Đăng',
              power: '+1.100 Lực Chiến · Phá Diệt Vạn Pháp',
              desc: 'Tịch diệt vạn vật, đoạn tuyệt nhân quả trần thế, ngưng đọng càn khôn vũ trụ trong một ý niệm.'
            },
            'Túc Mệnh Nhân Quả Cung': {
              rank: 'Thần Phẩm Thượng Thừa (Bảo Vật Trấn Áp)',
              type: 'Nhân Quả Trấn Cung',
              power: '+1.000 Lực Chiến · Nhìn Thấu Thiên Cơ',
              desc: 'Nắm giữ sợi dây nhân quả luân chuyển, nhìn thấu cát hung họa phúc và đại cơ duyên ba cõi.'
            },
            'Phạt Thiên Kiếm Cung': {
              rank: 'Thần Phẩm Thượng Thừa (Ranh Giới Tây)',
              type: 'Kiếm Đạo Trấn Cung',
              power: '+1.200 Lực Chiến · +25% Sát Thương Kiếm Khí',
              desc: 'Nghịch thiên phạt phạt, kiếm xuất tịnh thế, trảm phá hư vọng và lôi kiếp cửu trọng thiên.'
            },
            'Hồng Mông Bất Diệt Cung': {
              rank: 'Hồng Mông Chí Bảo (Ranh Giới Đông)',
              type: 'Hồng Mông Mệnh Đăng',
              power: '+1.300 Lực Chiến · Bất Diệt Kim Thân',
              desc: 'Bất sinh bất diệt, đồng thọ cùng thiên địa, thai nghén hồng mông tử khí hạo nhiên trường tồn.'
            },
            'Lục Đạo Luân Hồi Cung': {
              rank: 'Thần Phẩm Thượng Thừa (Bảo Vật Trấn Áp)',
              type: 'Luân Hồi Trấn Cung',
              power: '+1.000 Lực Chiến · Chưởng Quản Sinh Tử',
              desc: 'Diễn hóa lục đạo luân hồi chuyển thế, vạn linh sinh tử đều nằm trong lòng bàn tay.'
            },
            'Tạo Hóa Ngọc Điệp Cung': {
              rank: 'Thần Phẩm Thượng Thừa (Bảo Vật Trấn Áp)',
              type: 'Tạo Hóa Trấn Cung',
              power: '+1.100 Lực Chiến · Diễn Hóa Tiên Đạo',
              desc: 'Khai thiên tích địa chi đạo vận, ẩn chứa vạn quyển tiên kinh chí cao của Thiên Cơ Lâu.'
            },
            'Hỗn Độn Sơ Khai Cung': {
              rank: 'Thần Phẩm Đăng Tiên (Mệnh Đăng #2)',
              type: 'Hỗn Độn Mệnh Đăng',
              power: '+1.000 Lực Chiến · Vạn Vật Khởi Nguyên',
              desc: 'Vạn vật sơ khai, thiên địa vị phân, ngưng tụ nguyên lực hỗn độn tinh thuần nhất vũ trụ.'
            },
            'Khởi Nguyên Thời Không Cung': {
              rank: 'Thần Phẩm Đăng Tiên (Mệnh Đăng #4)',
              type: 'Thời Không Mệnh Đăng',
              power: '+1.200 Lực Chiến · Ngự Trị Không Thời Gian',
              desc: 'Nắm giữ quy tắc thời gian và không gian, dạo bước qua vạn cổ trường hà vô tận.'
            },
            'Sáng Thế Thần Quang Cung': {
              rank: 'Tiên Phẩm Thượng Thừa (Mệnh Đăng #3)',
              type: 'Quang Huy Mệnh Đăng',
              power: '+1.000 Lực Chiến · Sinh Mệnh Vô Tận',
              desc: 'Sáng thế quang huy tịnh hóa tà ma ô uế, ban phát sinh mệnh lực dồi dào cho toàn bộ thức hải.'
            },
            'Cửu Chuyển Luân Hồi Cung': {
              rank: 'Cổ Tiên Thần Phẩm (Mệnh Đăng #1)',
              type: 'Cổ Tiên Mệnh Đăng',
              power: '+1.200 Lực Chiến · Cửu Chuyển Thành Đan',
              desc: 'Cửu chuyển thành đan, cửu kiếp viên mãn, làm nền tảng vững chắc nhất nâng đỡ Đạo Anh.'
            },
          };

          const centerCanvasX = 646;
        const centerCanvasY = 444;
        const totalPalaces = maxThienCung;

        const palaceCoordinates = (() => {
          // BỐ CỤC 13 THIÊN CUNG ĐỘC BẢN THEO RANH GIỚI PHẠT THIÊN - HỒNG MÔNG:
          // Phía trên ranh giới: 5 Cung Mệnh Đăng/Cực Cảnh
          // - Đỉnh 12h: Vận Mệnh Hư Vô Cung (Mệnh Hỏa thứ 5 - Pháp Khiếu 121)
          // - Tây Bắc Ngoài: Đại Đạo Tiêu Dao Cung
          // - Tây Bắc Trong: Tổ Long Thần Cung
          // - Đông Bắc Ngoài: Hư Vô Tịch Diệt Cung
          // - Đông Bắc Trong: Túc Mệnh Nhân Quả Cung
          // Ranh giới ngang (trục giữa):
          // - Tây Ngoài: Phạt Thiên Kiếm Cung
          // - Đông Ngoài: Hồng Mông Bất Diệt Cung
          // Phía dưới ranh giới (6 Cung):
          // - Tây Nam Trong: Lục Đạo Luân Hồi Cung
          // - Đông Nam Trong: Tạo Hóa Ngọc Điệp Cung
          // - Tây Nam Ngoài: Hỗn Độn Sơ Khai Cung
          // - Đông Nam Ngoài: Khởi Nguyên Thời Không Cung (lùi vào x=1020, nw=224, 0 tràn viền)
          // - Đáy Trái: Sáng Thế Thần Quang Cung
          // - Đáy Phải: Cửu Chuyển Luân Hồi Cung

          const custom13Map = {
            'van_menh_hu_vo':      { x: 646, y: 115, isTop: true, scale: 1.15, nw: 228 }, // Đỉnh
            'dai_dao_tieu_dao':    { x: 245, y: 180, scale: 1.12, nw: 224 },             // TB Ngoài
            'to_long_than_cung':   { x: 440, y: 300, scale: 1.06, nw: 218 },             // TB Trong
            'hu_vo_ban_nguyen':    { x: 1045, y: 180, scale: 1.12, nw: 224 },            // ĐB Ngoài
            'tuc_menh_nhan_qua':   { x: 852, y: 300, scale: 1.06, nw: 226 },             // ĐB Trong
            'phat_thien_kiem':     { x: 215, y: 444, scale: 1.12, nw: 220 },             // Tây Ranh Giới
            'hong_mong_bat_diet':  { x: 1077, y: 444, scale: 1.12, nw: 236 },            // Đông Ranh Giới
            'luan_hoi_ban':        { x: 440, y: 575, scale: 1.06, nw: 228 },             // TN Trong
            'ngoc_diep':           { x: 852, y: 575, scale: 1.06, nw: 224 },             // ĐN Trong
            'hon_don_so_khai':    { x: 245, y: 705, scale: 1.12, nw: 220 },             // TN Ngoài
            'khoi_nguyen_thoi_khong': { x: 1020, y: 695, scale: 1.12, nw: 224 },        // ĐN Ngoài (0 Tràn)
            'sang_the_quang':      { x: 505, y: 765, scale: 1.12, nw: 228 },             // Đáy Trái
            'cuu_chuyen_luan_hoi': { x: 760, y: 765, scale: 1.12, nw: 230 },             // Đáy Phải
          };

          const standard13Positions = [
            { id: 'van_menh_hu_vo',      x: 646, y: 115, isTop: true, scale: 1.15, nw: 228 },
            { id: 'dai_dao_tieu_dao',    x: 245, y: 180, scale: 1.12, nw: 224 },
            { id: 'to_long_than_cung',   x: 440, y: 300, scale: 1.06, nw: 218 },
            { id: 'hu_vo_ban_nguyen',    x: 1045, y: 180, scale: 1.12, nw: 224 },
            { id: 'tuc_menh_nhan_qua',   x: 852, y: 300, scale: 1.06, nw: 226 },
            { id: 'phat_thien_kiem',     x: 215, y: 444, scale: 1.12, nw: 220 },
            { id: 'hong_mong_bat_diet',  x: 1077, y: 444, scale: 1.12, nw: 236 },
            { id: 'luan_hoi_ban',        x: 440, y: 575, scale: 1.06, nw: 228 },
            { id: 'ngoc_diep',           x: 852, y: 575, scale: 1.06, nw: 224 },
            { id: 'hon_don_so_khai',    x: 245, y: 705, scale: 1.12, nw: 220 },
            { id: 'khoi_nguyen_thoi_khong', x: 1020, y: 695, scale: 1.12, nw: 224 },
            { id: 'sang_the_quang',      x: 505, y: 765, scale: 1.12, nw: 228 },
            { id: 'cuu_chuyen_luan_hoi', x: 760, y: 765, scale: 1.12, nw: 230 },
          ];

          if (totalPalaces >= 13) {
            return standard13Positions.map(p => ({
              x: p.x,
              y: p.y,
              scale: p.scale,
              nameWidth: p.nw,
              isTop: !!p.isTop
            }));
          }

          return standard13Positions.slice(0, totalPalaces).map(p => ({
            x: p.x,
            y: p.y,
            scale: p.scale,
            nameWidth: p.nw,
            isTop: !!p.isTop
          }));
        })();

        return (
          <div style={{ 
            width: '100%', 
            height: '100%', 
            minHeight: '100%',
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            position: 'relative',
            borderRadius: 0, 
            margin: 0,
            padding: 0,
            overflow: 'hidden' 
          }}>
            {/* 1. KHUNG CANVAS SVG VŨ TRỤ THỨC HẢI TOÀN CẢNH (CĂN CHUẨN XÁC TÂM QUANG HỌC) */}
            <div style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              minHeight: '100%',
              flex: 1,
              background: 'radial-gradient(circle at 50% 50%, rgba(12, 18, 36, 0.98) 0%, rgba(4, 7, 16, 1) 100%)',
              backgroundImage: `radial-gradient(circle at 50% 50%, rgba(4, 7, 16, 0.25) 0%, rgba(4, 7, 16, 0.85) 100%), url('${getAssetUrl('images/bg_god_cosmic_eye.jpg')}')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              border: 'none',
              borderRadius: 0,
              boxShadow: 'none',
              overflow: 'hidden',
              margin: 0,
              padding: 0
            }}>
              {/* Huy hiệu Chân Cung nổi góc trên bên trái */}
              <div style={{
                position: 'absolute',
                top: 14,
                left: 16,
                zIndex: 20,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(8, 14, 26, 0.92)',
                border: '1.2px solid rgba(251, 191, 36, 0.5)',
                borderRadius: 0,
                padding: '5px 14px',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 0 20px rgba(0, 0, 0, 0.8)'
              }}>
                <span style={{ fontSize: 15 }}>⛩️</span>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 12.5, fontWeight: 900, color: 'var(--color-kim)', letterSpacing: 0.8 }}>
                  THỨC HẢI THIÊN CUNG
                </span>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 0,
                  fontSize: 10,
                  fontWeight: 800,
                  background: 'rgba(251, 191, 36, 0.25)',
                  color: '#fde047',
                  border: '1px solid rgba(251, 191, 36, 0.4)'
                }}>
                  ✦ {lampPalaceCount + realizedThienCung}/{maxThienCung} CHÂN CUNG
                </span>
              </div>

              <svg
                viewBox={isMobile ? "120 20 1040 830" : "0 0 1280 870"}
                preserveAspectRatio="xMidYMid meet"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  display: 'block'
                }}
              >
                <defs>
                  {/* Quầng sáng Kim Quang Vô Cực (Divine Supernova Burst) */}
                  <radialGradient 
                    id="divineSupernovaGrad" 
                    gradientUnits="userSpaceOnUse"
                    cx={centerCanvasX} 
                    cy={centerCanvasY} 
                    r="125"
                  >
                    <stop offset="0%" stopColor="#fffbeb" stopOpacity="1" />
                    <stop offset="35%" stopColor="#fde047" stopOpacity="0.85" />
                    <stop offset="65%" stopColor="#fbbf24" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                  </radialGradient>

                  {/* Quầng sáng Đa Sắc Tinh Vân Siêu Sáng (Super-Radiant Cosmic Aura) */}
                  <radialGradient 
                    id="prismaticAuraGrad" 
                    gradientUnits="userSpaceOnUse"
                    cx={centerCanvasX + 82} 
                    cy={centerCanvasY} 
                    r="11"
                  >
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                    <stop offset="35%" stopColor="#fef08a" stopOpacity="1" />
                    <stop offset="70%" stopColor="#fbbf24" stopOpacity="0.75" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                  </radialGradient>

                  {/* 1. KHỐI CẦU KIM ĐAN 3D HOÀNG KIM 24K */}
                  <radialGradient 
                    id="pureSolidGoldenSphere3D" 
                    gradientUnits="userSpaceOnUse"
                    cx={centerCanvasX - 8.4} 
                    cy={centerCanvasY - 8.4} 
                    r="52"
                  >
                    <stop offset="0%" stopColor="#fff566" stopOpacity="1" />
                    <stop offset="20%" stopColor="#ffea00" stopOpacity="1" />
                    <stop offset="45%" stopColor="#ffd600" stopOpacity="1" />
                    <stop offset="72%" stopColor="#ff9100" stopOpacity="1" />
                    <stop offset="92%" stopColor="#ff6d00" stopOpacity="1" />
                    <stop offset="100%" stopColor="#e65100" stopOpacity="1" />
                  </radialGradient>

                  {/* 2. KHỐI CẦU 3D CHO LINH CHÂU VỆ TINH */}
                  <radialGradient 
                    id="satellite3DPearl" 
                    gradientUnits="userSpaceOnUse"
                    cx={centerCanvasX + 82 - 2} 
                    cy={centerCanvasY - 2} 
                    r="9"
                  >
                    <stop offset="0%" stopColor="#fff566" stopOpacity="1" />
                    <stop offset="30%" stopColor="#ffea00" stopOpacity="1" />
                    <stop offset="65%" stopColor="#ff9100" stopOpacity="1" />
                    <stop offset="100%" stopColor="#e65100" stopOpacity="1" />
                  </radialGradient>

                  {/* Dải sáng chân trời hoàng kim ngang kéo dài 1280px */}
                  <linearGradient id="horizonBeamGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#fde047" stopOpacity="0" />
                    <stop offset="25%" stopColor="#fde047" stopOpacity="0.5" />
                    <stop offset="50%" stopColor="#ffffff" stopOpacity="0.95" />
                    <stop offset="75%" stopColor="#fde047" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#fde047" stopOpacity="0" />
                  </linearGradient>

                  {/* Cột sáng dọc thiên đỉnh xuyên suốt 870px */}
                  <linearGradient id="verticalPillarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fde047" stopOpacity="0" />
                    <stop offset="25%" stopColor="#fde047" stopOpacity="0.55" />
                    <stop offset="50%" stopColor="#ffffff" stopOpacity="0.95" />
                    <stop offset="75%" stopColor="#fde047" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#fde047" stopOpacity="0" />
                  </linearGradient>

                  {/* Kim loại vàng kim cao cấp cho vành đai (Metallic Astrolabe Gold) */}
                  <linearGradient id="metallicAstrolabeGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                    <stop offset="30%" stopColor="#fef08a" stopOpacity="1" />
                    <stop offset="70%" stopColor="#fde047" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="#fbbf24" stopOpacity="1" />
                  </linearGradient>

                  <filter id="godEyeGlow">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>

                  <filter id="coreSuperBloom" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="8" result="blur1" />
                    <feGaussianBlur stdDeviation="18" result="blur2" />
                    <feMerge>
                      <feMergeNode in="blur2" />
                      <feMergeNode in="blur1" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* ─── A. PHONG CẢNH VŨ TRỤ THẦN NHÃN MỚI 3:2 GIỮ NGUYÊN TỈ LỆ 100% ─── */}
                <g>
                  {/* Bức tranh Thần Nhãn Tinh Vân xé toạc không gian hiển thị chuẩn tỉ lệ */}
                  <image
                    href={getAssetUrl('images/bg_god_cosmic_eye.jpg')}
                    x="0"
                    y="0"
                    width="1280"
                    height="870"
                    preserveAspectRatio="xMidYMid slice"
                    opacity="0.98"
                  />

                  {/* Lớp quầng tối viền 4 cạnh tạo độ sâu điện ảnh */}
                  <radialGradient id="vignetteDarkGrad" cx="0.5" cy="0.5" r="0.55">
                    <stop offset="72%" stopColor="#040710" stopOpacity="0" />
                    <stop offset="100%" stopColor="#040710" stopOpacity="0.75" />
                  </radialGradient>
                  <rect x="0" y="0" width="1280" height="870" fill="url(#vignetteDarkGrad)" />
                </g>

                {/* ─── B. TÂM KIM ĐAN: QUẢ CẦU HOÀNG KIM 3D THUẦN TÚY SIÊU SÁNG & VÀNH TRẬN ĐỒ 8 LINH CHÂU ─── */}
                <g style={{ transformOrigin: `${centerCanvasX}px ${centerCanvasY}px` }}>
                  {/* 1. DẢI SÁNG CHÂN TRỜI HOÀNG KIM NGANG DỌC XÉ ĐÔI KHÔNG GIAN (LUMINOUS BEAM AXIS) */}
                  <g>
                    {/* Dải sáng vàng cam ngang rực rỡ kéo dài 1280px */}
                    <rect 
                      x="0" 
                      y={centerCanvasY - 10} 
                      width="1280" 
                      height="20" 
                      fill="url(#horizonBeamGrad)" 
                      opacity="0.85" 
                      filter="url(#coreSuperBloom)" 
                    />
                    <line 
                      x1="0" 
                      y1={centerCanvasY} 
                      x2="1280" 
                      y2={centerCanvasY} 
                      stroke="#ffffff" 
                      strokeWidth="2.0" 
                      filter="url(#godEyeGlow)" 
                    />
                    
                    {/* Cột sáng dọc thiên đỉnh xuyên suốt 870px */}
                    <rect 
                      x={centerCanvasX - 6} 
                      y="0" 
                      width="12" 
                      height="870" 
                      fill="url(#verticalPillarGrad)" 
                      opacity="0.65" 
                      filter="url(#coreSuperBloom)" 
                    />
                    <line 
                      x1={centerCanvasX} 
                      y1="0" 
                      x2={centerCanvasX} 
                      y2={870} 
                      stroke="#ffffff" 
                      strokeWidth="1.2" 
                      opacity="0.85" 
                    />
                  </g>

                  {/* 2. Quầng Hào Quang Hoàng Kim Tỏa Tròn Đa Tầng */}
                  <circle
                    cx={centerCanvasX}
                    cy={centerCanvasY}
                    r="125"
                    fill="url(#divineSupernovaGrad)"
                    filter="url(#coreSuperBloom)"
                    style={{ animation: 'pulseCore 2.6s ease-in-out infinite alternate' }}
                  />

                  {/* 3. HỆ THỐNG VÀNH TRẬN ĐỒ HOÀNG KIM + 8 LINH CHÂU VỆ TINH (XOAY THEO CHIỀU KIM ĐỒNG HỒ 60s) */}
                  <g style={{ transformOrigin: `${centerCanvasX}px ${centerCanvasY}px`, animation: 'celestialRotate 60s linear infinite' }}>
                    {/* Vành 1: Rãnh kép chỉ vàng nội vi (R = 56px & R = 53px) */}
                    <circle 
                      cx={centerCanvasX} 
                      cy={centerCanvasY} 
                      r="56" 
                      fill="none" 
                      stroke="#fef08a" 
                      strokeWidth="1.2" 
                      filter="url(#godEyeGlow)" 
                    />
                    <circle 
                      cx={centerCanvasX} 
                      cy={centerCanvasY} 
                      r="53" 
                      fill="none" 
                      stroke="rgba(253, 224, 71, 0.7)" 
                      strokeWidth="0.8" 
                    />

                    {/* Vành 2: Vành đai hoàng kim chính mang 8 linh châu (R = 82px) */}
                    <circle 
                      cx={centerCanvasX} 
                      cy={centerCanvasY} 
                      r="84" 
                      fill="none" 
                      stroke="rgba(254, 240, 138, 0.6)" 
                      strokeWidth="0.8" 
                    />
                    <circle 
                      cx={centerCanvasX} 
                      cy={centerCanvasY} 
                      r="82" 
                      fill="none" 
                      stroke="url(#metallicAstrolabeGrad)" 
                      strokeWidth="2.2" 
                      filter="url(#godEyeGlow)" 
                    />
                    <circle 
                      cx={centerCanvasX} 
                      cy={centerCanvasY} 
                      r="80" 
                      fill="none" 
                      stroke="rgba(254, 240, 138, 0.6)" 
                      strokeWidth="0.8" 
                    />

                    {/* Vành 3: Vành lam ngọc thanh nhã ngoại vi (R = 104px) */}
                    <circle 
                      cx={centerCanvasX} 
                      cy={centerCanvasY} 
                      r="104" 
                      fill="none" 
                      stroke="rgba(56, 189, 248, 0.85)" 
                      strokeWidth="1.1" 
                    />

                    {/* 8 VIÊN LINH CHÂU / XÁ LỢI VÀNG KIM 24K TẠI R=82px */}
                    {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                      <g key={`satellite-pearl-${deg}`} transform={`rotate(${deg}, ${centerCanvasX}, ${centerCanvasY})`}>
                        {/* Chốt nốt ngọc nhỏ tại vành ngoài R=104 */}
                        <circle 
                          cx={centerCanvasX + 104} 
                          cy={centerCanvasY} 
                          r="1.8" 
                          fill="#38bdf8" 
                          stroke="#ffffff" 
                          strokeWidth="0.6" 
                        />

                        {/* Quầng hào quang quanh linh châu */}
                        <circle 
                          cx={centerCanvasX + 82} 
                          cy={centerCanvasY} 
                          r="11" 
                          fill="url(#prismaticAuraGrad)" 
                          filter="url(#godEyeGlow)" 
                        />
                        {/* Khối cầu 3D linh châu vàng hoàng kim */}
                        <circle 
                          cx={centerCanvasX + 82} 
                          cy={centerCanvasY} 
                          r="6.5" 
                          fill="#e65100" 
                        />
                        <circle 
                          cx={centerCanvasX + 82} 
                          cy={centerCanvasY} 
                          r="6.5" 
                          fill="url(#satellite3DPearl)" 
                          stroke="#fef08a" 
                          strokeWidth="0.9" 
                        />
                        {/* Điểm phản quang cực sáng góc 10h trên linh châu */}
                        <circle 
                          cx={centerCanvasX + 80.2} 
                          cy={centerCanvasY - 1.8} 
                          r="1.8" 
                          fill="#ffffff" 
                        />
                      </g>
                    ))}
                  </g>

                  {/* 4. VÒNG ĐỆM HÀO QUANG ÔM SÁT KIM ĐAN (R = 45px) */}
                  <circle 
                    cx={centerCanvasX} 
                    cy={centerCanvasY} 
                    r="45" 
                    fill="rgba(254, 240, 138, 0.25)" 
                    stroke="rgba(254, 240, 138, 0.95)" 
                    strokeWidth="1.4" 
                    filter="url(#godEyeGlow)" 
                  />

                  {/* 5. KHỐI CẦU KIM ĐAN 3D HOÀNG KIM 24K (CỐ ĐỊNH, ĐỒNG BỘ NGUỒN SÁNG VỚI VỆT LÓA) */}
                  <g>
                    {/* 5.0 Nền đệm cam hổ phách đặc */}
                    <circle
                      cx={centerCanvasX}
                      cy={centerCanvasY}
                      r="35"
                      fill="#e65100"
                    />

                    {/* 5.1 Khối cầu Kim Đan 3D vàng hoàng gia 24K thuần khiết */}
                    <circle
                      cx={centerCanvasX}
                      cy={centerCanvasY}
                      r="35"
                      fill="url(#pureSolidGoldenSphere3D)"
                      stroke="#fef08a"
                      strokeWidth="1.8"
                    />

                    {/* 5.2 Lớp bóng ngọc thủy tinh 3D tinh tế (Đè ngay trên tâm sáng của gradient) */}
                    <ellipse
                      cx={centerCanvasX - 8.4}
                      cy={centerCanvasY - 8.4}
                      rx="9.5"
                      ry="5.5"
                      fill="#ffffff"
                      opacity="0.95"
                      transform={`rotate(-45, ${centerCanvasX - 8.4}, ${centerCanvasY - 8.4})`}
                    />
                    <circle
                      cx={centerCanvasX - 8.4}
                      cy={centerCanvasY - 8.4}
                      r="3.2"
                      fill="#ffffff"
                    />
                    
                    {/* 5.3 Điểm phản quang phụ góc 4h tạo độ nổi 3D khối cầu */}
                    <ellipse
                      cx={centerCanvasX + 9}
                      cy={centerCanvasY + 10}
                      rx="5"
                      ry="2.5"
                      fill="#ffffff"
                      opacity="0.8"
                      transform={`rotate(-45, ${centerCanvasX + 9}, ${centerCanvasY + 10})`}
                    />
                  </g>
                </g>

                {/* ─── D. QUẦN THỂ THIÊN CUNG 6 PHẨM CẤP — BẢN PHÓNG ĐẠI & THẺ TÊN TINH GỌN ─── */}
                <g>
                  <defs>
                    {/* Filter làm mịn hào quang */}
                    <filter id="palaceSoftBlur" x="-60%" y="-60%" width="220%" height="220%">
                      <feGaussianBlur stdDeviation="2.8" />
                    </filter>
                    <filter id="glassGlow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="1.2" />
                    </filter>

                    {/* Vệt quét kim quang bảng tên rộng */}
                    <linearGradient id="shimmerGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
                      <stop offset="50%" stopColor="#ffffff" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                    </linearGradient>

                    {/* 6 Gradients Mái Điện Chuẩn */}
                    <linearGradient id="glowRoofThanPham" x1="0" y1="0" x2="0.3" y2="1">
                      <stop offset="0%" stopColor="#fecaca" />
                      <stop offset="18%" stopColor="#f87171" />
                      <stop offset="55%" stopColor="#ef4444" />
                      <stop offset="100%" stopColor="#7f1d1d" />
                    </linearGradient>
                    <linearGradient id="glowRoofTienPham" x1="0" y1="0" x2="0.3" y2="1">
                      <stop offset="0%" stopColor="#fffbea" />
                      <stop offset="18%" stopColor="#fde047" />
                      <stop offset="55%" stopColor="#eab308" />
                      <stop offset="100%" stopColor="#854d0e" />
                    </linearGradient>
                    <linearGradient id="glowRoofCucPham" x1="0" y1="0" x2="0.3" y2="1">
                      <stop offset="0%" stopColor="#fdf4ff" />
                      <stop offset="18%" stopColor="#f0abfc" />
                      <stop offset="55%" stopColor="#c084fc" />
                      <stop offset="100%" stopColor="#6b21a8" />
                    </linearGradient>
                    <linearGradient id="glowRoofThuongPham" x1="0" y1="0" x2="0.3" y2="1">
                      <stop offset="0%" stopColor="#f0f9ff" />
                      <stop offset="18%" stopColor="#7dd3fc" />
                      <stop offset="55%" stopColor="#38bdf8" />
                      <stop offset="100%" stopColor="#075985" />
                    </linearGradient>
                    <linearGradient id="glowRoofTrungPham" x1="0" y1="0" x2="0.3" y2="1">
                      <stop offset="0%" stopColor="#f0fdf4" />
                      <stop offset="18%" stopColor="#86efac" />
                      <stop offset="55%" stopColor="#4ade80" />
                      <stop offset="100%" stopColor="#14532d" />
                    </linearGradient>
                    <linearGradient id="glowRoofHaPham" x1="0" y1="0" x2="0.3" y2="1">
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="18%" stopColor="#f1f5f9" />
                      <stop offset="55%" stopColor="#94a3b8" />
                      <stop offset="100%" stopColor="#334155" />
                    </linearGradient>
                  </defs>

                  {/* Keyframes CSS */}
                  <style>{`
                    @keyframes floatY { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-5px); } }
                    @keyframes auraPulse { 0%, 100% { opacity: 0.32; } 50% { opacity: 0.65; } }
                    @keyframes shimmerMove { 0% { transform: translateX(-120px); opacity: 0; } 15% { opacity: 0.85; } 85% { opacity: 0.85; } 100% { transform: translateX(120px); opacity: 0; } }
                    @keyframes orbBreathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }
                    @keyframes orbSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                    @keyframes orbImageTremble {
                      0%   { transform: scale(1)     rotate(0deg)    translate(0px, 0px); }
                      22%  { transform: scale(1.02)  rotate(0.6deg)  translate(0.4px, -0.3px); }
                      46%  { transform: scale(0.99)  rotate(-0.5deg) translate(-0.3px, 0.2px); }
                      70%  { transform: scale(1.015) rotate(0.4deg)  translate(0.3px, 0.3px); }
                      100% { transform: scale(1)     rotate(0deg)    translate(0px, 0px); }
                    }
                    .palace-shrine-floating { 
                      animation: floatY 5s ease-in-out infinite; 
                      transform-origin: 0 0;
                    }
                    .aura-pulse-anim { animation: auraPulse 2.4s ease-in-out infinite; transform-origin: center; }
                    .shimmer-sweep-anim { animation: shimmerMove 3.2s linear infinite; }
                    .orb-breathe-anim { animation: orbBreathe 3.6s ease-in-out infinite; transform-origin: 0 0; }
                    .orb-orbit-anim { animation: orbSpin 7s linear infinite; transform-origin: 0 0; }
                    .orb-image-tremble-anim {
                      animation-name: orbImageTremble;
                      animation-timing-function: ease-in-out;
                      animation-iteration-count: infinite;
                      transform-box: fill-box;
                      transform-origin: center;
                    }
                  `}</style>

                  {palaceCoordinates.map((pos, i) => {
                    const floorNum = maxThienCung - i;
                    const isLampPalace = i < lampPalaceCount;
                    const selfLocalIdx = isLampPalace ? null : (maxThienCung - 1) - i;
                    const isRealized = isLampPalace || (selfLocalIdx !== null && selfLocalIdx < realizedThienCung);
                    const anchor = !isLampPalace ? cultivation?.palaceAnchors?.[selfLocalIdx] : null;
                    const currentExp = cultivation?.currentThienCungExp || 0;
                    const isCurrentActiveSelf = !isLampPalace && !isRealized && selfLocalIdx === realizedThienCung;
                    const currentPalaceCost = getPalaceCost((selfLocalIdx !== null ? selfLocalIdx : 0) + 1);
                    const palaceBottleneck = currentPalaceCost - 1;
                    const isBottleneck = isCurrentActiveSelf && currentExp >= palaceBottleneck;
                    const expPercent = isCurrentActiveSelf
                      ? Math.min(99.99, Math.round((currentExp / currentPalaceCost) * 100 * 100) / 100)
                      : 0;

                    const lampId = isLampPalace ? absorbedLamps[i] : null;
                    const lobj = lampId ? LIFE_LAMPS.find(l => l.id === lampId) : null;
                    const artifactObj = anchor
                      ? (SUPPRESSING_ARTIFACTS || []).find(a => a.id === anchor.id) || anchor
                      : null;

                    // Tên Cung Điện (Ép chuẩn mực danh xưng Thần Cung)
                    const palaceName = (() => {
                      if (isLampPalace) return lobj ? getLampPalaceName(lobj) : `Chân Cung #${i + 1}`;
                      if (anchor) {
                        const aId = anchor.id || artifactObj?.id;
                        const aName = anchor.name || artifactObj?.name || '';
                        const pName = anchor.palaceName || '';
                        if (aId === 'luan_hoi_ban' || aName.includes('Luân Hồi') || pName.includes('Luân Hồi')) {
                          return 'Lục Đạo Luân Hồi Cung';
                        }
                        if (aId && typeof getPalaceNameForArtifact === 'function') {
                          const computed = getPalaceNameForArtifact(artifactObj || anchor);
                          if (computed) return computed;
                        }
                        return anchor.palaceName || `${artifactObj?.shortName || artifactObj?.name || 'Bảo Vật'} Cung`;
                      }
                      return `Thiên Cung Tự Thân #${selfLocalIdx !== null ? selfLocalIdx + 1 : ''}`;
                    })();

                    // Phẩm cấp
                    const rawTier = isLampPalace 
                      ? (lobj?.tier || 'than_pham') 
                      : (artifactObj?.tier || (isRealized ? 'thuong_pham' : 'ha_pham'));

                    const normalizeTier = (t) => {
                      if (t === 'than_pham') return 'than_pham';
                      if (t === 'tien_pham') return 'tien_pham';
                      if (t === 'cuc_pham' || t === 'thien_pham') return 'cuc_pham';
                      if (t === 'thuong_pham' || t === 'dia_pham') return 'thuong_pham';
                      if (t === 'trung_pham' || t === 'huyen_pham') return 'trung_pham';
                      return 'ha_pham';
                    };

                    const tierKey = normalizeTier(rawTier);

                    const getTierConfig = (tier) => {
                      switch (tier) {
                        case 'than_pham':
                          return {
                            type: 6,
                            primary: '#ef4444',
                            border: '#fbbf24',
                            starGlow: '#fde047',
                            roofFill: 'url(#glowRoofThanPham)',
                            chamberBg: 'rgba(18,4,6,0.96)',
                            nameColor: '#fde047',
                            pillBorder: '#fbbf24',
                            tag: 'THẦN PHẨM',
                          };
                        case 'tien_pham':
                          return {
                            type: 5,
                            primary: '#eab308',
                            border: '#fde68a',
                            starGlow: '#fef9c3',
                            roofFill: 'url(#glowRoofTienPham)',
                            chamberBg: 'rgba(20,14,4,0.96)',
                            nameColor: '#fef08a',
                            pillBorder: '#eab308',
                            tag: 'TIÊN PHẨM',
                          };
                        case 'cuc_pham':
                          return {
                            type: 4,
                            primary: '#c084fc',
                            border: '#e9d5ff',
                            starGlow: '#f5d0fe',
                            roofFill: 'url(#glowRoofCucPham)',
                            chamberBg: 'rgba(16,6,24,0.96)',
                            nameColor: '#f5d0fe',
                            pillBorder: '#c084fc',
                            tag: 'CỰC PHẨM',
                          };
                        case 'thuong_pham':
                          return {
                            type: 3,
                            primary: '#38bdf8',
                            border: '#bae6fd',
                            starGlow: '#bae6fd',
                            roofFill: 'url(#glowRoofThuongPham)',
                            chamberBg: 'rgba(4,14,24,0.96)',
                            nameColor: '#bae6fd',
                            pillBorder: '#38bdf8',
                            tag: 'THƯỢNG PHẨM',
                          };
                        case 'trung_pham':
                          return {
                            type: 2,
                            primary: '#4ade80',
                            border: '#bbf7d0',
                            starGlow: '#bbf7d0',
                            roofFill: 'url(#glowRoofTrungPham)',
                            chamberBg: 'rgba(4,20,10,0.96)',
                            nameColor: '#bbf7d0',
                            pillBorder: '#4ade80',
                            tag: 'TRUNG PHẨM',
                          };
                        default:
                          return {
                            type: 1,
                            primary: '#94a3b8',
                            border: '#e2e8f0',
                            starGlow: '#f1f5f9',
                            roofFill: 'url(#glowRoofHaPham)',
                            chamberBg: 'rgba(12,18,30,0.96)',
                            nameColor: '#e2e8f0',
                            pillBorder: '#94a3b8',
                            tag: 'HẠ PHẨM',
                          };
                      }
                    };

                    const baseCfg = getTierConfig(tierKey);
                    const stateOverride = isBottleneck 
                      ? { primary: '#fb923c', border: '#fed7aa', starGlow: '#fdba74', roofFill: '#7c2d12', chamberBg: '#180c04', pillBorder: '#fb923c', nameColor: '#fed7aa', tag: 'NÚT THẮT', pulse: true }
                      : (isCurrentActiveSelf 
                          ? { primary: '#38bdf8', border: '#bae6fd', starGlow: '#7dd3fc', roofFill: '#075985', chamberBg: '#041422', pillBorder: '#38bdf8', nameColor: '#bae6fd', tag: 'ĐANG MỞ', pulse: true }
                          : (!isRealized ? { primary: '#475569', border: '#334155', starGlow: '#475569', roofFill: '#1e293b', chamberBg: '#080c14', pillBorder: '#475569', nameColor: '#64748b', tag: 'CUNG HƯ', pulse: false } : null));

                    const cfg = stateOverride ? { ...baseCfg, ...stateOverride } : baseCfg;
                    const pulse = cfg.pulse;

                    // MAPPING ẢNH GEN AI
                    const lampGenMap = {
                      'cuu_chuyen_luan_hoi': getAssetUrl('icons/than_pham/lamp_cuu_chuyen_luan_hoi.jpg'),
                      'hon_don_so_khai': getAssetUrl('icons/than_pham/lamp_hon_don_so_khai.jpg'),
                      'hong_mong_bat_diet': getAssetUrl('icons/than_pham/lamp_hong_mong_bat_diet.jpg'),
                      'khoi_nguyen_thoi_khong': getAssetUrl('icons/than_pham/lamp_khoi_nguyen_thoi_khong.jpg'),
                      'sang_the_ban_nguyen': getAssetUrl('icons/than_pham/lamp_sang_the_ban_nguyen.jpg'),
                      'tan_tien_phe_than': getAssetUrl('icons/than_pham/lamp_tan_tien_phe_than.jpg'),
                      'thai_co_than_long': getAssetUrl('icons/than_pham/lamp_thai_co_than_long.jpg'),
                      'thien_dao_trung_phat': getAssetUrl('icons/than_pham/lamp_thien_dao_trung_phat.jpg'),
                      'thuong_thuong_loi_kiep': getAssetUrl('icons/than_pham/lamp_thuong_thuong_loi_kiep.jpg'),
                      'toi_cao_thien_menh': getAssetUrl('icons/than_pham/lamp_toi_cao_thien_menh.jpg'),
                      'tuc_menh_nhan_qua': getAssetUrl('icons/than_pham/lamp_tuc_menh_nhan_qua.jpg'),
                      'van_gioi_quy_nhat': getAssetUrl('icons/than_pham/lamp_van_gioi_quy_nhat.jpg'),
                      'van_menh_hu_vo': getAssetUrl('icons/than_pham/lamp_van_menh_hu_vo.jpg'),
                    };

                    const artGenMap = {
                      'hong_mong_khi': getAssetUrl('icons/than_pham/hong_mong_tu_khi.jpg'),
                      'van_menh_chau': getAssetUrl('icons/than_pham/van_menh_chau.jpg'),
                      'hon_don_so_khai': getAssetUrl('icons/than_pham/hon_don_so_khai.jpg'),
                      'ngoc_diep': getAssetUrl('icons/than_pham/ngoc_diep.jpg'),
                      'bat_hu_dinh': getAssetUrl('icons/than_pham/bat_hu_dinh.jpg'),
                      'thien_dao_an': getAssetUrl('icons/than_pham/so_tam_quyet.jpg'),
                      'hu_vo_ban_nguyen': getAssetUrl('icons/than_pham/hu_vo_tich_diet.jpg'),
                      'khoi_nguyen_moc': getAssetUrl('icons/than_pham/the_gioi_moc.jpg'),
                      'luan_hoi_ban': getAssetUrl('icons/than_pham/luan_hoi_chan_kinh.jpg'),
                      'tuc_menh_toa': getAssetUrl('icons/than_pham/tuc_menh_toa.jpg'),
                      'thuong_thuong_kiem': getAssetUrl('icons/than_pham/phat_thien_kiem.jpg'),
                      'dai_la_chuong': getAssetUrl('icons/than_pham/thien_cuong_chuong.jpg'),
                      'thoi_khong_chau': getAssetUrl('icons/than_pham/thoi_khong_chau.jpg'),
                      'van_co_long_to': getAssetUrl('icons/than_pham/van_co_long_to.jpg'),
                      'sang_the_quang': getAssetUrl('icons/than_pham/sang_the_quang.jpg'),
                      'dai_dao_tieu_dao': getAssetUrl('icons/than_pham/tieu_dao_thien.jpg'),
                    };

                    const itemObj = isLampPalace ? lobj : artifactObj;
                    const itemImage = (isLampPalace ? (lobj?.image || lampGenMap[lobj?.id]) : (artifactObj?.image || artGenMap[artifactObj?.id])) || null;
                    const itemIcon = itemObj?.icon || (isLampPalace ? '🪔' : (anchor ? '👑' : '✨'));

                    const handleShrineClick = () => {
                      if (selfLocalIdx !== null) {
                        if (isBottleneck || (isCurrentActiveSelf && currentExp >= palaceBottleneck)) {
                          setAnchorModalPalace(selfLocalIdx);
                        } else if (isCurrentActiveSelf) {
                          try {
                            thangCung();
                          } catch (e) {
                            setAnchorModalPalace(selfLocalIdx);
                          }
                        } else if (!isRealized && selfLocalIdx === realizedThienCung) {
                          setAnchorModalPalace(selfLocalIdx);
                        }
                      }
                    };

                    const scale = pos.scale || 1.15;
                    const topRoofY = cfg.type === 6 ? -39 : (cfg.type === 5 || cfg.type === 4 ? -29 : (cfg.type === 3 ? -27 : (cfg.type === 2 ? -17 : -13)));
                    
                    const r = 24;
                    const orbCenterY = topRoofY - 28;
                    const dim = isRealized ? 1 : 0.45;

                    const sphereGradId = `orbSphere3D-${i}`;
                    const clipId = `orbClip3D-${i}`;
                    const rippleId = `orbRipple3D-${i}`;

                    const rippleDur = 3.2 + (i % 4) * 0.45;
                    const trembleDur = 2.5 + (i % 3) * 0.5;
                    const trembleDelay = i * 0.22;
                    const highlight = isRealized ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.12)';

                    // Bảng tên chiều rộng tương ứng từng vành
                    const nw = pos.nameWidth || 172;
                    const halfNw = nw / 2;

                    return (
                      <g
                        key={`palace-shrine-${i}`}
                        transform={`translate(${pos.x}, ${pos.y})`}
                        onClick={handleShrineClick}
                        onMouseEnter={() => {
                          setHoveredPalace({
                            name: palaceName,
                            pos: pos,
                            isLamp: isLampPalace,
                            isRealized: isRealized,
                            isBottleneck: isBottleneck,
                            isCurrentActiveSelf: isCurrentActiveSelf,
                            expPercent: expPercent,
                            currentExp: currentExp,
                            targetExp: currentPalaceCost,
                            type: isLampPalace 
                              ? 'Chân Cung Mệnh Đăng' 
                              : (isRealized ? 'Cung Tự Thân (100% Cung Thật)' : (isBottleneck ? 'Cung Tự Thân (99.99% Chờ Khảm Nạm)' : (isCurrentActiveSelf ? 'Cung Tự Thân (Đang Nạp EXP)' : 'Cung Tự Thân (Chưa Mở)'))),
                            rank: cfg.tag || tierKey.toUpperCase(),
                            item: itemObj?.name || (isLampPalace ? lobj?.name : artifactObj?.name) || 'Chưa Khảm Nạm',
                            desc: isLampPalace 
                              ? (lobj?.desc || 'Mệnh Đăng Thần Phẩm thiên địa khai minh, trấn áp vĩnh cửu không cần khảm nạm.') 
                              : (artifactObj?.poem || artifactObj?.desc || (isRealized ? 'Đã khảm nạm bảo vật trấn áp hoàn tất 100% Cung Thật.' : (isBottleneck ? 'Đã tích lũy đủ 99.99% linh lực! Nhấp vào để khảm nạm Bảo Vật.' : 'Cung tự thân thai nghén từ đan điền, cần nạp đủ linh lực.'))),
                            power: isRealized ? 'Đã Khai Mở Trấn Áp' : (isBottleneck ? '99.99% Sẵn Sàng Khảm Nạm' : `${expPercent}% Linh Lực`)
                          });
                        }}
                        onMouseLeave={() => setHoveredPalace(null)}
                        onTouchStart={() => {
                          setHoveredPalace(prev => prev?.name === palaceName ? null : {
                            name: palaceName,
                            pos: pos,
                            isLamp: isLampPalace,
                            isRealized: isRealized,
                            isBottleneck: isBottleneck,
                            isCurrentActiveSelf: isCurrentActiveSelf,
                            expPercent: expPercent,
                            currentExp: currentExp,
                            targetExp: currentPalaceCost,
                            type: isLampPalace 
                              ? 'Chân Cung Mệnh Đăng' 
                              : (isRealized ? 'Cung Tự Thân (100% Cung Thật)' : (isBottleneck ? 'Cung Tự Thân (99.99% Chờ Khảm Nạm)' : (isCurrentActiveSelf ? 'Cung Tự Thân (Đang Nạp EXP)' : 'Cung Tự Thân (Chưa Mở)'))),
                            rank: cfg.tag || tierKey.toUpperCase(),
                            item: itemObj?.name || (isLampPalace ? lobj?.name : artifactObj?.name) || 'Chưa Khảm Nạm',
                            desc: isLampPalace 
                              ? (lobj?.desc || 'Mệnh Đăng Thần Phẩm thiên địa khai minh, trấn áp vĩnh cửu không cần khảm nạm.') 
                              : (artifactObj?.poem || artifactObj?.desc || (isRealized ? 'Đã khảm nạm bảo vật trấn áp hoàn tất 100% Cung Thật.' : (isBottleneck ? 'Đã tích lũy đủ 99.99% linh lực! Nhấp vào để khảm nạm Bảo Vật.' : 'Cung tự thân thai nghén từ đan điền, cần nạp đủ linh lực.'))),
                            power: isRealized ? 'Đã Khai Mở Trấn Áp' : (isBottleneck ? '99.99% Sẵn Sàng Khảm Nạm' : `${expPercent}% Linh Lực`)
                          });
                        }}
                        style={{ cursor: 'pointer', transition: 'all 0.3s ease' }}
                      >
                        {/* Thẻ con bọc hiệu ứng bay bổng độc lập */}
                        <g className="palace-shrine-floating" style={{ animationDelay: `${i * 0.35}s` }}>
                          <defs>
                            <radialGradient id={sphereGradId} cx="32%" cy="28%" r="72%">
                              <stop offset="0%" stopColor="#ffffff" />
                              <stop offset="22%" stopColor={cfg.starGlow} />
                              <stop offset="55%" stopColor={cfg.primary} />
                              <stop offset="85%" stopColor="#1a0b12" />
                              <stop offset="100%" stopColor="#030206" />
                            </radialGradient>
                            
                            <clipPath id={clipId}>
                              <circle r={r} />
                            </clipPath>

                            {itemImage && (
                              <filter id={rippleId} x="-30%" y="-30%" width="160%" height="160%">
                                <feTurbulence
                                  type="fractalNoise"
                                  baseFrequency="0.95"
                                  numOctaves="2"
                                  seed={i * 7 + 3}
                                  result="noise"
                                >
                                  <animate
                                    attributeName="baseFrequency"
                                    values="0.92;1.02;0.92"
                                    dur={`${rippleDur}s`}
                                    repeatCount="indefinite"
                                  />
                                </feTurbulence>
                                <feDisplacementMap
                                  in="SourceGraphic"
                                  in2="noise"
                                  scale={isRealized ? 2.2 : 0.8}
                                  xChannelSelector="R"
                                  yChannelSelector="G"
                                />
                              </filter>
                            )}
                          </defs>

                          {/* 0. Quầng Hào Quang Nền Dưới Chân Điện */}
                          <ellipse
                            cx="0"
                            cy="12"
                            rx={60 * scale}
                            ry={20 * scale}
                            fill={cfg.primary}
                            opacity={isRealized ? 0.12 : 0.03}
                            filter="url(#palaceSoftBlur)"
                          />
                          <ellipse
                            cx="0"
                            cy="10"
                            rx={44 * scale}
                            ry={15 * scale}
                            fill={cfg.primary}
                            opacity={isRealized ? 0.32 : 0.08}
                            filter="url(#palaceSoftBlur)"
                            className={pulse ? "aura-pulse-anim" : ""}
                          />

                          {/* 1. LÀN MÂY / SÓNG KHÍ UỐN LƯỢN */}
                          <g transform={`scale(${scale})`}>
                            <path
                              d="M -56 16 Q -42 10 -28 16 T 0 16 T 28 16 T 56 16"
                              fill="none"
                              stroke={cfg.primary}
                              strokeWidth="1.6"
                              strokeOpacity={isRealized ? 0.9 : 0.3}
                              filter="url(#palaceSoftBlur)"
                            />
                            <path
                              d="M -48 19 Q -32 13 -16 19 T 16 19 T 48 19"
                              fill="none"
                              stroke={cfg.border}
                              strokeWidth="0.9"
                              strokeOpacity={isRealized ? 0.65 : 0.2}
                            />
                          </g>

                          {/* 2. CỘT TRỤ ĐỈNH & ĐẠI KIM ĐAN 3D */}
                          <g transform={`scale(${scale})`}>
                            <line
                              x1="0"
                              y1={topRoofY}
                              x2="0"
                              y2={orbCenterY + r - 2}
                              stroke={cfg.border}
                              strokeWidth="2"
                            />
                            <polygon
                              points={`-4,${orbCenterY + r} 4,${orbCenterY + r} 0,${orbCenterY + r + 5}`}
                              fill={cfg.border}
                            />

                            <g transform={`translate(0, ${orbCenterY})`}>
                              <g className={isRealized ? "orb-breathe-anim" : ""}>
                                {/* A. Hào quang tỏa tròn 2 lớp */}
                                <circle r={r * 2.0} fill={cfg.primary} opacity={0.35 * dim} filter="url(#palaceSoftBlur)" />
                                <circle r={r * 1.4} fill={cfg.starGlow} opacity={0.48 * dim} filter="url(#palaceSoftBlur)" />

                                {/* B. Vành đai thiên thể năng lượng */}
                                {isRealized && (
                                  <g transform="rotate(-20)">
                                    <ellipse
                                      cx="0"
                                      cy="0"
                                      rx={r * 1.45}
                                      ry={r * 0.46}
                                      fill="none"
                                      stroke={cfg.border}
                                      strokeWidth="1.1"
                                      strokeDasharray="4 2"
                                      opacity="0.85"
                                    />
                                  </g>
                                )}

                                {/* C. Quỹ đạo hạt tinh linh bay quanh */}
                                {isRealized && (
                                  <g className="orb-orbit-anim">
                                    <circle cx={r * 1.65} cy="0" r="1.6" fill={cfg.starGlow} filter="url(#glassGlow)" />
                                    <circle cx={-r * 1.65} cy="0" r="1.2" fill="#ffffff" opacity="0.95" />
                                  </g>
                                )}

                                {/* D. Khối Cầu Nền 3D */}
                                <circle
                                  r={r}
                                  fill={`url(#${sphereGradId})`}
                                  stroke={cfg.border}
                                  strokeWidth="1.4"
                                  opacity={Math.max(dim, 0.7)}
                                  filter="drop-shadow(0 0 8px rgba(0,0,0,0.85))"
                                />

                                {/* E. BÊN TRONG KIM ĐAN: HIỂN THỊ ẢNH GEN AI HOẶC BIỂU TƯỢNG VẬT TRẤN ÁP */}
                                {itemImage ? (
                                  <g
                                    clipPath={`url(#${clipId})`}
                                    opacity={isRealized ? 0.96 : 0.6}
                                    filter={`url(#${rippleId})`}
                                    className="orb-image-tremble-anim"
                                    style={{ animationDuration: `${trembleDur}s`, animationDelay: `${trembleDelay}s` }}
                                  >
                                    <image
                                      href={itemImage}
                                      x={-r}
                                      y={-r}
                                      width={r * 2}
                                      height={r * 2}
                                      preserveAspectRatio="xMidYMid slice"
                                    />
                                    <ellipse cx="0" cy={r * 0.72} rx={r * 0.9} ry={r * 0.45} fill="#000000" opacity="0.32" style={{ mixBlendMode: "multiply" }} />
                                  </g>
                                ) : (
                                  <g clipPath={`url(#${clipId})`}>
                                    <circle r={r} fill={cfg.chamberBg} opacity="0.85" />
                                    <circle r={r * 0.72} fill="none" stroke={cfg.border} strokeWidth="0.8" strokeDasharray="3 2" opacity="0.6" />
                                    <text
                                      x="0"
                                      y="1.5"
                                      textAnchor="middle"
                                      dominantBaseline="central"
                                      fontSize={r * 0.92}
                                      style={{ filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.6))' }}
                                    >
                                      {itemIcon}
                                    </text>
                                  </g>
                                )}

                                {/* F. VỆT BÓNG KÍNH THỦY TINH 3D CHÉO */}
                                <g clipPath={`url(#${clipId})`}>
                                  <ellipse
                                    cx={-r * 0.35}
                                    cy={-r * 0.42}
                                    rx={r * 0.6}
                                    ry={r * 0.26}
                                    fill="#ffffff"
                                    opacity={0.45 * dim + 0.08}
                                    filter="url(#glassGlow)"
                                    transform="rotate(-32)"
                                  />
                                  <ellipse
                                    cx={r * 0.25}
                                    cy={r * 0.65}
                                    rx={r * 0.7}
                                    ry={r * 0.16}
                                    fill={cfg.starGlow}
                                    opacity={0.25 * dim}
                                    filter="url(#glassGlow)"
                                    transform="rotate(-15)"
                                  />
                                </g>

                                {/* G. VIỀN SÁNG GƯƠNG */}
                                <circle r={r} fill="none" stroke={cfg.border} strokeWidth="1.2" opacity={0.7 + 0.3 * dim} />
                                <circle r={r - 1.2} fill="none" stroke="#ffffff" strokeOpacity={0.3 + 0.4 * dim} strokeWidth="0.6" />

                                {/* H. ĐIỂM ĐỐM PHẢN QUANG CỰC QUANG */}
                                <ellipse
                                  cx={-r * 0.38}
                                  cy={-r * 0.44}
                                  rx={r * 0.18}
                                  ry={r * 0.1}
                                  fill="#ffffff"
                                  opacity={0.95}
                                  transform="rotate(-30)"
                                />
                                <circle
                                  cx={-r * 0.52}
                                  cy={-r * 0.52}
                                  r={r * 0.06}
                                  fill="#ffffff"
                                  opacity={0.9}
                                />
                              </g>
                            </g>
                          </g>

                          {/* 3. KIẾN TRÚC SVG CỔ ĐIỆN VẼ CHUẨN XÁC 6 PHẨM CẤP */}
                          <g transform={`scale(${scale})`}>
                            {/* TYPE 6: THÁI SƠ THẦN CUNG (THẦN PHẨM: 3 TẦNG MÁI ĐAO + 2 CÁNH PHỤ) */}
                            {cfg.type === 6 && (
                              <g>
                                <path d="M -20 -30 Q -10 -39 0 -39 Q 10 -39 20 -30 Q 14 -25 0 -26.5 Q -14 -25 -20 -30 Z" fill={cfg.roofFill} stroke={cfg.border} strokeWidth="1.4" />
                                <path d="M -18 -30 Q -9 -36 0 -36 Q 9 -36 18 -30" fill="none" stroke={highlight} strokeWidth="0.9" />
                                <path d="M -20 -30 Q -27 -35 -25 -40 Q -20 -35 -16.5 -31.5 Z" fill={cfg.primary} stroke={cfg.border} strokeWidth="0.8" />
                                <path d="M 20 -30 Q 27 -35 25 -40 Q 20 -35 16.5 -31.5 Z" fill={cfg.primary} stroke={cfg.border} strokeWidth="0.8" />
                                <circle cx="-24" cy="-38.5" r="1.4" fill={cfg.starGlow} />
                                <circle cx="24" cy="-38.5" r="1.4" fill={cfg.starGlow} />
                                <rect x="-12" y="-26.5" width="24" height="9" fill={cfg.chamberBg} stroke={cfg.border} strokeWidth="1" rx="1" />
                                <rect x="-2" y="-26.5" width="4" height="9" fill={cfg.primary} opacity="0.85" />

                                <path d="M -28 -16 Q -14 -25 0 -25 Q 14 -25 28 -16 Q 20 -11 0 -12.5 Q -20 -11 -28 -16 Z" fill={cfg.roofFill} stroke={cfg.border} strokeWidth="1.4" />
                                <path d="M -25 -16.5 Q -13 -22.5 0 -22.5 Q 13 -22.5 25 -16.5" fill="none" stroke={highlight} strokeWidth="0.9" />
                                <path d="M -28 -16 Q -36 -21 -34 -26 Q -28 -21 -23.5 -17.5 Z" fill={cfg.primary} stroke={cfg.border} strokeWidth="0.8" />
                                <path d="M 28 -16 Q 36 -21 34 -26 Q 28 -21 23.5 -17.5 Z" fill={cfg.primary} stroke={cfg.border} strokeWidth="0.8" />
                                <rect x="-18" y="-12.5" width="36" height="10" fill={cfg.chamberBg} stroke={cfg.border} strokeWidth="1" rx="1" />
                                <rect x="-16" y="-11.5" width="2.5" height="8" fill={cfg.border} />
                                <rect x="13.5" y="-11.5" width="2.5" height="8" fill={cfg.border} />

                                <path d="M -38 -1 Q -18 -10 0 -10 Q 18 -10 38 -1 Q 26 5 0 3.5 Q -26 5 -38 -1 Z" fill={cfg.roofFill} stroke={cfg.border} strokeWidth="1.5" />
                                <path d="M -34 -1.5 Q -16 -8 0 -8 Q 16 -8 34 -1.5" fill="none" stroke={highlight} strokeWidth="1" />
                                <path d="M -38 -1 Q -47 -6 -45 -12 Q -38 -6 -33.5 -2.5 Z" fill={cfg.primary} stroke={cfg.border} strokeWidth="0.9" />
                                <path d="M 38 -1 Q 47 -6 45 -12 Q 38 -6 33.5 -2.5 Z" fill={cfg.primary} stroke={cfg.border} strokeWidth="0.9" />
                                <rect x="-24" y="3.5" width="48" height="12" fill={cfg.chamberBg} stroke={cfg.border} strokeWidth="1" rx="1" />
                                <rect x="-22" y="4.5" width="3" height="10" fill={cfg.border} />
                                <rect x="19" y="4.5" width="3" height="10" fill={cfg.border} />
                                <rect x="-5" y="4.5" width="10" height="10" fill={cfg.primary} opacity="0.85" rx="1" />

                                <path d="M -44 4.5 Q -32 0.5 -22 2.5 L -22 13.5 L -44 13.5 Z" fill={cfg.roofFill} stroke={cfg.border} strokeWidth="0.9" />
                                <rect x="-42" y="5.5" width="18" height="8" fill={cfg.chamberBg} stroke={cfg.border} strokeWidth="0.8" rx="1" />
                                <circle cx="-33" cy="2.5" r="2.2" fill={cfg.starGlow} stroke={cfg.border} strokeWidth="0.5" />

                                <path d="M 44 4.5 Q 32 0.5 22 2.5 L 22 13.5 L 44 13.5 Z" fill={cfg.roofFill} stroke={cfg.border} strokeWidth="0.9" />
                                <rect x="24" y="5.5" width="18" height="8" fill={cfg.chamberBg} stroke={cfg.border} strokeWidth="0.8" rx="1" />
                                <circle cx="33" cy="2.5" r="2.2" fill={cfg.starGlow} stroke={cfg.border} strokeWidth="0.5" />

                                <rect x="-36" y="14.5" width="72" height="4.5" rx="2" fill="rgba(8,14,26,0.98)" stroke={cfg.border} strokeWidth="1.3" />
                              </g>
                            )}

                            {/* TYPE 5 & 4: TIÊN CUNG THÁI ẤT / TỬ VÂN BẢO ĐIỆN */}
                            {(cfg.type === 5 || cfg.type === 4) && (
                              <g>
                                <path d="M -24 -20 Q -12 -29 0 -29 Q 12 -29 24 -20 Q 16 -15 0 -16.5 Q -16 -15 -24 -20 Z" fill={cfg.roofFill} stroke={cfg.border} strokeWidth="1.4" />
                                <path d="M -20 -20.5 Q -10 -26 0 -26 Q 10 -26 20 -20.5" fill="none" stroke={highlight} strokeWidth="0.9" />
                                <path d="M -24 -20 Q -31 -25 -29 -30 Q -24 -25 -19.5 -21.5 Z" fill={cfg.primary} stroke={cfg.border} strokeWidth="0.8" />
                                <path d="M 24 -20 Q 31 -25 29 -30 Q 24 -25 19.5 -21.5 Z" fill={cfg.primary} stroke={cfg.border} strokeWidth="0.8" />
                                <circle cx="-27" cy="-28.5" r="1.3" fill={cfg.starGlow} />
                                <circle cx="27" cy="-28.5" r="1.3" fill={cfg.starGlow} />
                                <rect x="-14" y="-16.5" width="28" height="9" fill={cfg.chamberBg} stroke={cfg.border} strokeWidth="1" rx="1" />
                                <rect x="-2" y="-16.5" width="4" height="9" fill={cfg.primary} opacity="0.85" />

                                <path d="M -34 -4 Q -16 -13 0 -13 Q 16 -13 34 -4 Q 24 1.5 0 0 Q -24 1.5 -34 -4 Z" fill={cfg.roofFill} stroke={cfg.border} strokeWidth="1.5" />
                                <path d="M -30 -4.5 Q -14 -10.5 0 -10.5 Q 14 -10.5 30 -4.5" fill="none" stroke={highlight} strokeWidth="1" />
                                <path d="M -34 -4 Q -42 -9 -40 -15 Q -34 -9 -29.5 -5.5 Z" fill={cfg.primary} stroke={cfg.border} strokeWidth="0.9" />
                                <path d="M 34 -4 Q 42 -9 40 -15 Q 34 -9 29.5 -5.5 Z" fill={cfg.primary} stroke={cfg.border} strokeWidth="0.9" />
                                <rect x="-22" y="0" width="44" height="14" fill={cfg.chamberBg} stroke={cfg.border} strokeWidth="1" rx="1" />
                                <rect x="-20" y="1" width="3" height="12" fill={cfg.border} />
                                <rect x="17" y="1" width="3" height="12" fill={cfg.border} />
                                <rect x="-4" y="1" width="8" height="12" fill={cfg.primary} opacity="0.85" rx="1" />

                                <path d="M -42 2.5 Q -30 -1.5 -20 0.5 L -20 12.5 L -42 12.5 Z" fill={cfg.roofFill} stroke={cfg.border} strokeWidth="0.9" />
                                <rect x="-40" y="3.5" width="18" height="8" fill={cfg.chamberBg} stroke={cfg.border} strokeWidth="0.8" rx="1" />
                                <circle cx="-31" cy="0.5" r="2.2" fill={cfg.starGlow} stroke={cfg.border} strokeWidth="0.5" />

                                <path d="M 42 2.5 Q 30 -1.5 20 0.5 L 20 12.5 L 42 12.5 Z" fill={cfg.roofFill} stroke={cfg.border} strokeWidth="0.9" />
                                <rect x="22" y="3.5" width="18" height="8" fill={cfg.chamberBg} stroke={cfg.border} strokeWidth="0.8" rx="1" />
                                <circle cx="31" cy="0.5" r="2.2" fill={cfg.starGlow} stroke={cfg.border} strokeWidth="0.5" />

                                <rect x="-34" y="14.5" width="68" height="4.5" rx="2" fill="rgba(8,14,26,0.98)" stroke={cfg.border} strokeWidth="1.3" />
                              </g>
                            )}

                            {/* TYPE 3: LAM VÂN THÁNH ĐIỆN */}
                            {cfg.type === 3 && (
                              <g>
                                <path d="M -22 -18 Q -11 -27 0 -27 Q 11 -27 22 -18 Q 15 -13 0 -14.5 Q -15 -13 -22 -18 Z" fill={cfg.roofFill} stroke={cfg.border} strokeWidth="1.4" />
                                <path d="M -18 -18.5 Q -9 -24 0 -24 Q 9 -24 18 -18.5" fill="none" stroke={highlight} strokeWidth="0.9" />
                                <path d="M -22 -18 Q -29 -23 -27 -28 Q -22 -23 -17.5 -19.5 Z" fill={cfg.primary} stroke={cfg.border} strokeWidth="0.8" />
                                <path d="M 22 -18 Q 29 -23 27 -28 Q 22 -23 17.5 -19.5 Z" fill={cfg.primary} stroke={cfg.border} strokeWidth="0.8" />
                                <rect x="-14" y="-14.5" width="28" height="9" fill={cfg.chamberBg} stroke={cfg.border} strokeWidth="1" rx="1" />
                                <rect x="-2" y="-14.5" width="4" height="9" fill={cfg.primary} opacity="0.85" />

                                <path d="M -32 -2 Q -16 -11 0 -11 Q 16 -11 32 -2 Q 22 3.5 0 2 Q -22 3.5 -32 -2 Z" fill={cfg.roofFill} stroke={cfg.border} strokeWidth="1.5" />
                                <path d="M -28 -2.5 Q -14 -8.5 0 -8.5 Q 14 -8.5 28 -2.5" fill="none" stroke={highlight} strokeWidth="1" />
                                <path d="M -32 -2 Q -40 -7 -38 -13 Q -32 -7 -27.5 -3.5 Z" fill={cfg.primary} stroke={cfg.border} strokeWidth="0.9" />
                                <path d="M 32 -2 Q 40 -7 38 -13 Q 32 -7 27.5 -3.5 Z" fill={cfg.primary} stroke={cfg.border} strokeWidth="0.9" />
                                <rect x="-22" y="2" width="44" height="12" fill={cfg.chamberBg} stroke={cfg.border} strokeWidth="1" rx="1" />
                                <rect x="-20" y="3" width="3" height="10" fill={cfg.border} />
                                <rect x="17" y="3" width="3" height="10" fill={cfg.border} />
                                <rect x="-4" y="3" width="8" height="10" fill={cfg.primary} opacity="0.85" rx="1" />

                                <rect x="-28" y="14.5" width="56" height="4.5" rx="2" fill="rgba(8,14,26,0.98)" stroke={cfg.border} strokeWidth="1.3" />
                              </g>
                            )}

                            {/* TYPE 2: THANH TRÚC CUNG */}
                            {cfg.type === 2 && (
                              <g>
                                <path d="M -30 -6 Q -14 -17 0 -17 Q 14 -17 30 -6 Q 20 0 0 -1.5 Q -20 0 -30 -6 Z" fill={cfg.roofFill} stroke={cfg.border} strokeWidth="1.5" />
                                <path d="M -25 -6.5 Q -12 -14 0 -14 Q 12 -14 25 -6.5" fill="none" stroke={highlight} strokeWidth="1" />
                                <path d="M -30 -6 Q -38 -11 -36 -16 Q -30 -11 -25.5 -7.5 Z" fill={cfg.primary} stroke={cfg.border} strokeWidth="0.9" />
                                <path d="M 30 -6 Q 38 -11 36 -16 Q 30 -11 25.5 -7.5 Z" fill={cfg.primary} stroke={cfg.border} strokeWidth="0.9" />
                                <rect x="-22" y="-1.5" width="44" height="16" fill={cfg.chamberBg} stroke={cfg.border} strokeWidth="1" rx="1" />
                                <rect x="-19" y="-0.5" width="3" height="14" fill={cfg.border} />
                                <rect x="16" y="-0.5" width="3" height="14" fill={cfg.border} />
                                <rect x="-5" y="-0.5" width="10" height="14" fill={cfg.primary} opacity="0.8" rx="1" />

                                <rect x="-26" y="14.5" width="52" height="4.5" rx="2" fill="rgba(8,14,26,0.98)" stroke={cfg.border} strokeWidth="1.3" />
                              </g>
                            )}

                            {/* TYPE 1: BẠCH NGỌC THẠCH MIẾU */}
                            {cfg.type === 1 && (
                              <g>
                                <path d="M -26 -4 Q -12 -13 0 -13 Q 12 -13 26 -4 Q 18 0.5 0 -1 Q -18 0.5 -26 -4 Z" fill={cfg.roofFill} stroke={cfg.border} strokeWidth="1.4" />
                                <path d="M -21 -4.5 Q -10 -10.5 0 -10.5 Q 10 -10.5 21 -4.5" fill="none" stroke={highlight} strokeWidth="0.8" />
                                <path d="M -26 -4 Q -32 -8 -31 -12 Q -26 -8 -22.5 -5.5 Z" fill={cfg.primary} stroke={cfg.border} strokeWidth="0.8" />
                                <path d="M 26 -4 Q 32 -8 31 -12 Q 26 -8 22.5 -5.5 Z" fill={cfg.primary} stroke={cfg.border} strokeWidth="0.8" />
                                <rect x="-18" y="-1" width="36" height="15" fill={cfg.chamberBg} stroke={cfg.border} strokeWidth="1" rx="1" />
                                <rect x="-16" y="0" width="2.5" height="13" fill={cfg.border} />
                                <rect x="13.5" y="0" width="2.5" height="13" fill={cfg.border} />
                                <rect x="-4" y="0" width="8" height="13" fill={cfg.primary} opacity="0.75" rx="1" />

                                <rect x="-22" y="14.5" width="44" height="4.5" rx="2" fill="rgba(8,14,26,0.98)" stroke={cfg.border} strokeWidth="1.1" />
                              </g>
                            )}
                          </g>

                          {/* 4. BẢNG TÊN NGỌC BÍCH LAM THỦY TINH THẦN PHẨM RỘNG RÃI */}
                          <g transform={`translate(0, ${33 * scale})`}>
                            {/* Khung nền ngọc bích lam thủy tinh cao cấp */}
                            <rect
                              x={-halfNw}
                              y="-14"
                              width={nw}
                              height="28"
                              rx="6"
                              fill="url(#azureGlassGrad)"
                              stroke="rgba(56, 189, 248, 0.92)"
                              strokeWidth={isRealized ? "1.8" : "1.2"}
                              filter="url(#azureGlassShadow)"
                            />

                            {/* Vệt phản quang thủy tinh vòm trên (Specular Glass Highlight) */}
                            <path
                              d={`M ${-halfNw + 3} -14 L ${halfNw - 3} -14 L ${halfNw - 8} -2 L ${-halfNw + 8} -2 Z`}
                              fill="rgba(255, 255, 255, 0.18)"
                            />

                            {/* Viền chỉ lam ngọc song tầng bên trong */}
                            <rect
                              x={-halfNw + 4}
                              y="-10.5"
                              width={nw - 8}
                              height="21"
                              rx="4"
                              fill="none"
                              stroke="rgba(125, 211, 252, 0.5)"
                              strokeWidth="0.9"
                            />

                            {/* 4 Góc Bảo Thạch Lam Băng Mạ Bạc */}
                            {isRealized && (
                              <g stroke="#38bdf8" strokeWidth="1.4" fill="none">
                                <path d={`M ${-halfNw + 7} -14 L ${-halfNw + 1} -14 L ${-halfNw + 1} -8`} />
                                <path d={`M ${halfNw - 7} -14 L ${halfNw - 1} -14 L ${halfNw - 1} -8`} />
                                <path d={`M ${-halfNw + 7} 14 L ${-halfNw + 1} 14 L ${-halfNw + 1} 8`} />
                                <path d={`M ${halfNw - 7} 14 L ${halfNw - 1} 14 L ${halfNw - 1} 8`} />
                              </g>
                            )}

                            {/* Đính Lam Tinh Thần Châu 2 đầu phát sáng */}
                            {isRealized && (
                              <g>
                                <circle cx={-halfNw + 11} cy="0" r="2.5" fill="#38bdf8" stroke="#ffffff" strokeWidth="0.8" style={{ filter: 'drop-shadow(0 0 5px #38bdf8)' }} />
                                <circle cx={halfNw - 11} cy="0" r="2.5" fill="#38bdf8" stroke="#ffffff" strokeWidth="0.8" style={{ filter: 'drop-shadow(0 0 5px #38bdf8)' }} />
                              </g>
                            )}

                            {/* Tên Cung Điện Thần Uy Tuyệt Sắc */}
                            <text
                              x="0"
                              y="1.2"
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize={nw < 225 ? "12" : "12.8"}
                              fontWeight="900"
                              fill={isRealized ? "#ffffff" : "#94a3b8"}
                              letterSpacing="0.8"
                              style={{
                                fontFamily: 'var(--font-serif)',
                                filter: isRealized 
                                  ? 'drop-shadow(0 0 8px rgba(56, 189, 248, 0.95)) drop-shadow(0 2px 4px rgba(0,0,0,0.95))' 
                                  : 'none',
                              }}
                            >
                              {palaceName}
                            </text>
                          </g>
                        </g>
                      </g>
                    );
                  })}
                </g>
              </svg>

              {/* ⛩️ TOOLTIP THÔNG TIN CHI TIẾT KHI DI CHUỘT / CHẠM VÀO THIÊN CUNG */}
              {hoveredPalace && (
                <div style={{
                  position: 'absolute',
                  left: Math.min(950, Math.max(160, (hoveredPalace.pos.x / 1280) * 100 + '%')),
                  top: Math.min(720, Math.max(80, (hoveredPalace.pos.y / 870) * 100 + '%')),
                  transform: 'translate(-50%, -120%)',
                  zIndex: 100,
                  pointerEvents: 'none',
                  minWidth: 260,
                  maxWidth: 320,
                  background: 'linear-gradient(165deg, rgba(8, 14, 28, 0.96) 0%, rgba(3, 7, 18, 0.98) 100%)',
                  border: hoveredPalace.isBottleneck ? '1.5px solid #f97316' : '1.5px solid #38bdf8',
                  boxShadow: hoveredPalace.isBottleneck 
                    ? '0 8px 32px rgba(0, 0, 0, 0.9), 0 0 25px rgba(249, 115, 22, 0.5)' 
                    : '0 8px 32px rgba(0, 0, 0, 0.85), 0 0 20px rgba(56, 189, 248, 0.45)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  backdropFilter: 'blur(12px)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  animation: 'fadeIn 0.2s ease-out'
                }}>
                  {/* Header Tooltip */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: 6 }}>
                    <span style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-kim)', fontWeight: 900, fontSize: 13.5, letterSpacing: 0.8 }}>
                      ⛩️ {hoveredPalace.name}
                    </span>
                    <span style={{
                      fontSize: 9.5,
                      color: hoveredPalace.isBottleneck ? '#fed7aa' : (hoveredPalace.isRealized ? '#4ade80' : '#38bdf8'),
                      background: hoveredPalace.isBottleneck ? 'rgba(234, 88, 12, 0.25)' : 'rgba(56, 189, 248, 0.15)',
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontWeight: 800,
                      border: '1px solid ' + (hoveredPalace.isBottleneck ? '#f97316' : 'rgba(56, 189, 248, 0.3)')
                    }}>
                      {hoveredPalace.type}
                    </span>
                  </div>

                  {/* Phẩm Cấp & Vật Tọa Trấn */}
                  <div style={{ fontSize: 11, color: '#fde047', fontWeight: 800, display: 'flex', justifyContent: 'space-between' }}>
                    <span>✦ Phẩm Cấp: <span style={{ color: '#e0f2fe', fontWeight: 600 }}>{hoveredPalace.rank}</span></span>
                  </div>

                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    <span>🛡️ Vật Trấn Áp: </span>
                    <strong style={{ color: hoveredPalace.isRealized ? '#4ade80' : '#fde047' }}>
                      {hoveredPalace.item}
                    </strong>
                  </div>

                  {hoveredPalace.isCurrentActiveSelf && (
                    <div style={{ fontSize: 11, color: hoveredPalace.isBottleneck ? '#f97316' : '#38bdf8', fontWeight: 700 }}>
                      ⚡ Linh Lực: {hoveredPalace.currentExp?.toLocaleString()} / {hoveredPalace.targetExp?.toLocaleString()} EXP ({hoveredPalace.expPercent}%)
                    </div>
                  )}

                  {/* Lời Bình / Thơ Đạo */}
                  <div style={{ fontSize: 11, color: 'var(--text-sub)', lineHeight: 1.4, marginTop: 2, fontStyle: 'italic', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 4 }}>
                    "{hoveredPalace.desc}"
                  </div>

                  {hoveredPalace.isBottleneck && (
                    <div style={{ fontSize: 10.5, color: '#fde047', fontWeight: 800, textAlign: 'center', marginTop: 2, background: 'rgba(234, 88, 12, 0.2)', padding: '3px 6px', borderRadius: 4 }}>
                      👉 Nhấp vào để mở Khảm Nạm Bảo Vật!
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ========================================================
          STAGE 4: NGUYÊN ANH / GIẢ ANH (CỬU THIÊN THẦN TRẬN · THẬP TAM ĐẠO ANH TỌA TRẤN)
          Thiết kế đỉnh cao Tiên Hiệp Đông Phương hoàn toàn mới
         ======================================================== */}
      {(activeViewRealm === 'nguyen_anh' || activeViewRealm === 'gia_anh') && (() => {
        const centerCanvasX = 646;
        const centerCanvasY = 444;
        const totalPalaces = maxThienCung || 13;
        const lampList = cultivation?.absorbedLamps || [];
        const lampCount = lampList.length;
        const existingDaoAnhs = cultivation?.daoAnhs || [];
        const daoAnhCount = existingDaoAnhs.length;
        const totalThienMenh = cultivation?.totalThienMenh || 0;
        const maxKiepCount = existingDaoAnhs.filter(d => (d.currentKiep || 0) >= 5).length;

        // 13 Vị trí Thiên Cung đối xứng trận đồ Cửu Thiên
        const standard13Positions = [
          { id: 'pos_0',  x: 646, y: 110, isTop: true, scale: 1.15, nw: 230 }, // Đỉnh (Cung 1 - Tối Cao)
          { id: 'pos_1',  x: 235, y: 175, scale: 1.10, nw: 220 },             // Tây Bắc Ngoài
          { id: 'pos_2',  x: 435, y: 295, scale: 1.05, nw: 215 },             // Tây Bắc Trong
          { id: 'pos_3',  x: 1055, y: 175, scale: 1.10, nw: 220 },            // Đông Bắc Ngoài
          { id: 'pos_4',  x: 855, y: 295, scale: 1.05, nw: 225 },             // Đông Bắc Trong
          { id: 'pos_5',  x: 205, y: 444, scale: 1.10, nw: 220 },             // Tây Ranh Giới
          { id: 'pos_6',  x: 1085, y: 444, scale: 1.10, nw: 230 },            // Đông Ranh Giới
          { id: 'pos_7',  x: 435, y: 585, scale: 1.05, nw: 225 },             // Tây Nam Trong
          { id: 'pos_8',  x: 855, y: 585, scale: 1.05, nw: 220 },             // Đông Nam Trong
          { id: 'pos_9',  x: 235, y: 715, scale: 1.10, nw: 220 },             // Tây Nam Ngoài
          { id: 'pos_10', x: 1035, y: 705, scale: 1.10, nw: 220 },            // Đông Nam Ngoài
          { id: 'pos_11', x: 505, y: 775, scale: 1.10, nw: 225 },             // Đáy Trái
          { id: 'pos_12', x: 765, y: 775, scale: 1.10, nw: 225 },             // Đáy Phải
        ];
        const palaceCoordinates = standard13Positions.slice(0, totalPalaces);

        // MAPPING ẢNH GEN AI CHO MỆNH ĐĂNG & VẬT TRẤN ÁP
        const lampGenMap = {
          'cuu_chuyen_luan_hoi': getAssetUrl('icons/than_pham/lamp_cuu_chuyen_luan_hoi.jpg'),
          'hon_don_so_khai': getAssetUrl('icons/than_pham/lamp_hon_don_so_khai.jpg'),
          'hong_mong_bat_diet': getAssetUrl('icons/than_pham/lamp_hong_mong_bat_diet.jpg'),
          'khoi_nguyen_thoi_khong': getAssetUrl('icons/than_pham/lamp_khoi_nguyen_thoi_khong.jpg'),
          'sang_the_ban_nguyen': getAssetUrl('icons/than_pham/lamp_sang_the_ban_nguyen.jpg'),
          'tan_tien_phe_than': getAssetUrl('icons/than_pham/lamp_tan_tien_phe_than.jpg'),
          'thai_co_than_long': getAssetUrl('icons/than_pham/lamp_thai_co_than_long.jpg'),
          'thien_dao_trung_phat': getAssetUrl('icons/than_pham/lamp_thien_dao_trung_phat.jpg'),
          'thuong_thuong_loi_kiep': getAssetUrl('icons/than_pham/lamp_thuong_thuong_loi_kiep.jpg'),
          'toi_cao_thien_menh': getAssetUrl('icons/than_pham/lamp_toi_cao_thien_menh.jpg'),
          'tuc_menh_nhan_qua': getAssetUrl('icons/than_pham/lamp_tuc_menh_nhan_qua.jpg'),
          'van_gioi_quy_nhat': getAssetUrl('icons/than_pham/lamp_van_gioi_quy_nhat.jpg'),
          'van_menh_hu_vo': getAssetUrl('icons/than_pham/lamp_van_menh_hu_vo.jpg'),
        };

        const artGenMap = {
          'hong_mong_khi': getAssetUrl('icons/than_pham/hong_mong_tu_khi.jpg'),
          'van_menh_chau': getAssetUrl('icons/than_pham/van_menh_chau.jpg'),
          'hon_don_so_khai': getAssetUrl('icons/than_pham/hon_don_so_khai.jpg'),
          'ngoc_diep': getAssetUrl('icons/than_pham/ngoc_diep.jpg'),
          'bat_hu_dinh': getAssetUrl('icons/than_pham/bat_hu_dinh.jpg'),
          'thien_dao_an': getAssetUrl('icons/than_pham/so_tam_quyet.jpg'),
          'hu_vo_ban_nguyen': getAssetUrl('icons/than_pham/hu_vo_tich_diet.jpg'),
          'khoi_nguyen_moc': getAssetUrl('icons/than_pham/the_gioi_moc.jpg'),
          'luan_hoi_ban': getAssetUrl('icons/than_pham/luan_hoi_chan_kinh.jpg'),
          'tuc_menh_toa': getAssetUrl('icons/than_pham/tuc_menh_toa.jpg'),
          'thuong_thuong_kiem': getAssetUrl('icons/than_pham/phat_thien_kiem.jpg'),
          'dai_la_chuong': getAssetUrl('icons/than_pham/thien_cuong_chuong.jpg'),
          'thoi_khong_chau': getAssetUrl('icons/than_pham/thoi_khong_chau.jpg'),
          'van_co_long_to': getAssetUrl('icons/than_pham/van_co_long_to.jpg'),
          'sang_the_quang': getAssetUrl('icons/than_pham/sang_the_quang.jpg'),
          'dai_dao_tieu_dao': getAssetUrl('icons/than_pham/tieu_dao_thien.jpg'),
        };

        const getTierConfig = (tier) => {
          switch (tier) {
            case 'than_pham':
              return { primary: '#ef4444', border: '#fbbf24', starGlow: '#fde047', lotusFill: 'url(#lotusGradThanPham)', chamberBg: 'rgba(24,6,10,0.95)', nameColor: '#fde047', tag: 'THẦN PHẨM' };
            case 'tien_pham':
              return { primary: '#eab308', border: '#fde68a', starGlow: '#fef9c3', lotusFill: 'url(#lotusGradTienPham)', chamberBg: 'rgba(26,18,6,0.95)', nameColor: '#fef08a', tag: 'TIÊN PHẨM' };
            case 'cuc_pham':
              return { primary: '#c084fc', border: '#e9d5ff', starGlow: '#f5d0fe', lotusFill: 'url(#lotusGradCucPham)', chamberBg: 'rgba(20,8,30,0.95)', nameColor: '#f5d0fe', tag: 'CỰC PHẨM' };
            case 'thuong_pham':
              return { primary: '#38bdf8', border: '#bae6fd', starGlow: '#bae6fd', lotusFill: 'url(#lotusGradThuongPham)', chamberBg: 'rgba(6,18,32,0.95)', nameColor: '#bae6fd', tag: 'THƯỢNG PHẨM' };
            case 'trung_pham':
              return { primary: '#4ade80', border: '#bbf7d0', starGlow: '#bbf7d0', lotusFill: 'url(#lotusGradTrungPham)', chamberBg: 'rgba(6,24,12,0.95)', nameColor: '#bbf7d0', tag: 'TRUNG PHẨM' };
            default:
              return { primary: '#94a3b8', border: '#e2e8f0', starGlow: '#f1f5f9', lotusFill: 'url(#lotusGradHaPham)', chamberBg: 'rgba(14,20,32,0.95)', nameColor: '#e2e8f0', tag: 'HẠ PHẨM' };
          }
        };

        // ─── HỆ THỐNG 13 PHÁP TƯỚNG BẢN NGUYÊN ĐẠO ANH TINH TUYỂN ĐỘC BẢN ───
        const renderDetailedPrimordialAvatar = (arch, currentKiep, isMaxKiep, isReady80, isModal = false) => {
          return (
            <g style={{ animation: 'spiritBreathing 3.8s ease-in-out infinite alternate' }}>
              
              {/* 1. VẦNG HÀO QUANG CỔ TRẬN ĐỘ KIẾP TIẾN HÓA (KIEP 1 - 5) */}
              {/* Kiếp 1+: Vòng Phù Văn Cổ Tự Xoay */}
              {currentKiep >= 1 && (
                <g style={{ transformOrigin: '0 0', animation: 'haloSpinSlow 45s linear infinite' }}>
                  <circle cx="0" cy="0" r="33" fill="none" stroke={isMaxKiep ? 'rgba(251, 191, 36, 0.75)' : (isReady80 ? 'rgba(240, 171, 252, 0.7)' : 'rgba(255, 255, 255, 0.22)')} strokeWidth="1" strokeDasharray="3 5" />
                  {/* 8 Điểm Phù Tự */}
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, sidx) => {
                    const rad = (deg * Math.PI) / 180;
                    return (
                      <circle key={`runic-dot-${sidx}`} cx={Math.cos(rad) * 33} cy={Math.sin(rad) * 33} r="1.3" fill={arch.glow || '#fde047'} />
                    );
                  })}
                </g>
              )}

              {/* Kiếp 3+: 4 Điểm Linh Quang Thiên Văn Tứ Trụ Xoay Ngược */}
              {currentKiep >= 3 && (
                <g style={{ transformOrigin: '0 0', animation: 'haloSpinReverse 30s linear infinite' }}>
                  <circle cx="0" cy="0" r="37" fill="none" stroke={arch.glow || '#fde047'} strokeWidth="0.8" opacity="0.4" strokeDasharray="6 8" />
                  <polygon points="37,-3 40,0 37,3 34,0" fill="#ffffff" filter="url(#naGlowGold)" />
                  <polygon points="-37,-3 -34,0 -37,3 -40,0" fill="#ffffff" filter="url(#naGlowGold)" />
                  <polygon points="-3,37 0,40 3,37 0,34" fill="#ffffff" filter="url(#naGlowGold)" />
                  <polygon points="-3,-37 0,-40 3,-37 0,-34" fill="#ffffff" filter="url(#naGlowGold)" />
                </g>
              )}

              {/* Kiếp 4+: Tia Sét Linh Kiếp Lôi Đình */}
              {currentKiep >= 4 && (
                <g opacity="0.85">
                  <path d="M -24,-20 L -18,-12 L -22,-8 L -14,0" fill="none" stroke="#fde047" strokeWidth="1.2" strokeLinecap="round" filter="url(#naGlowGold)" />
                  <path d="M 24,-20 L 18,-12 L 22,-8 L 14,0" fill="none" stroke="#c084fc" strokeWidth="1.2" strokeLinecap="round" filter="url(#naGlowPurple)" />
                </g>
              )}

              {/* Kiếp 5 (Đại Viên Mãn): Vương Miện Chí Tôn & Hào Quang Mặt Trời */}
              {isMaxKiep && (
                <g>
                  {/* Hào quang Thái Dương Tỏa Rạng Phía Sau */}
                  <g style={{ transformOrigin: '0 0', animation: 'haloSpinSlow 60s linear infinite' }} opacity="0.65">
                    {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg, sidx) => {
                      const rad = (deg * Math.PI) / 180;
                      return (
                        <line
                          key={`sunray-${sidx}`}
                          x1={Math.cos(rad) * 24}
                          y1={Math.sin(rad) * 24}
                          x2={Math.cos(rad) * 36}
                          y2={Math.sin(rad) * 36}
                          stroke="#fde047"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                        />
                      );
                    })}
                  </g>
                  {/* Vương Miện Chí Tôn Trên Đỉnh */}
                  <g transform="translate(0, -26)">
                    <polygon points="0,-8 5,-2 3,-2 0,-5 -3,-2 -5,-2" fill="#fde047" stroke="#b45309" strokeWidth="0.8" filter="url(#naGlowGold)" />
                    <circle cx="0" cy="-8" r="1.5" fill="#ef4444" />
                    <circle cx="-5" cy="-2" r="1" fill="#38bdf8" />
                    <circle cx="5" cy="-2" r="1" fill="#38bdf8" />
                  </g>
                </g>
              )}

              {/* 2. CHI TIẾT 13 PHÁP TƯỚNG BẢN NGUYÊN ĐỘC BẢN */}
              
              {/* 🐲 A. TỔ LONG (Thái Cổ Kim Long) */}
              {arch.type === 'dragon' && (
                <g filter="url(#naGlowGold)">
                  {/* Tường vân cuộn dưới chân */}
                  <path d="M -20,18 C -14,14 -6,22 2,16 C 10,22 18,16 22,19" fill="none" stroke="rgba(251, 191, 36, 0.45)" strokeWidth="1.6" strokeDasharray="3 3" />
                  {/* Thân Rồng Cuộn Hoàng Kim */}
                  <path d="M -18,12 C -26,2 -16,-12 0,-14 C 16,-16 24,0 18,12 C 12,20 -10,22 -18,12 Z" fill="none" stroke="url(#dragonGoldGrad)" strokeWidth="4.5" strokeLinecap="round" />
                  {/* Vảy Bụng Rồng */}
                  <path d="M -14,10 C -20,2 -12,-8 0,-10 C 12,-12 18,2 14,10" fill="none" stroke="#fef08a" strokeWidth="1.8" strokeDasharray="2 3" />
                  {/* Vây Lưng Gai Rồng */}
                  <path d="M -16,-6 L -20,-10 L -12,-8 L -14,-14 L -4,-12 L -6,-18 L 4,-14 L 6,-20 L 14,-12 L 16,-16 L 20,-8" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
                  {/* Đầu Rồng & Long Giác */}
                  <g transform="translate(0, -14)">
                    <path d="M -6,4 Q 0,-8 6,4 Q 0,8 -6,4 Z" fill="#fbbf24" stroke="#d97706" strokeWidth="0.8" />
                    <path d="M -4,-2 Q -10,-12 -12,-16 M -8,-6 Q -14,-8 -16,-10" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M 4,-2 Q 10,-12 12,-16 M 8,-6 Q 14,-8 16,-10" fill="none" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" />
                    {/* Râu Rồng Uốn Lượn */}
                    <path d="M -3,6 Q -12,12 -18,10" fill="none" stroke="#fde047" strokeWidth="1" strokeLinecap="round" />
                    <path d="M 3,6 Q 12,12 18,10" fill="none" stroke="#fde047" strokeWidth="1" strokeLinecap="round" />
                    {/* Mắt Thần Long */}
                    <circle cx="-2.5" cy="2" r="1" fill="#ef4444" />
                    <circle cx="2.5" cy="2" r="1" fill="#ef4444" />
                  </g>
                  {/* Vuốt Rồng Nâng Thái Cổ Long Châu */}
                  <g transform="translate(0, 4)">
                    <path d="M -6,8 L -2,4 L 0,8 M 6,8 L 2,4 L 0,8" fill="none" stroke="#fbbf24" strokeWidth="1.4" />
                    <circle cx="0" cy="2" r="5" fill="url(#dragonPearlGrad)" filter="url(#naGlowGold)" style={{ animation: 'daoAnhHeartbeat 1.6s ease-in-out infinite' }} />
                    <circle cx="0" cy="2" r="2.5" fill="#ffffff" />
                  </g>
                </g>
              )}

              {/* 🌸 B. HỒNG MÔNG (Hồng Mông Tử Liên) */}
              {arch.type === 'purple_lotus' && (
                <g filter="url(#naGlowPurple)">
                  {/* Làn Khói Hồng Mông Tử Khí */}
                  <path d="M -16,16 Q -22,4 -14,-4 Q -8,-12 0,-18 Q 8,-12 14,-4 Q 22,4 16,16" fill="none" stroke="rgba(192, 132, 252, 0.4)" strokeWidth="1.2" strokeDasharray="3 4" />
                  {/* Tầng Cánh Sen Ngoài (Tím Đậm) */}
                  <path d="M -22,10 C -28,0 -16,-10 0,-4 C 16,-10 28,0 22,10 C 14,18 -14,18 -22,10 Z" fill="url(#violetLotusOuterGrad)" opacity="0.9" />
                  {/* Tầng Cánh Sen Giữa (Hồng Tím) */}
                  <path d="M -16,6 C -20,-4 -8,-14 0,-16 C 8,-14 20,-4 16,6 C 10,14 -10,14 -16,6 Z" fill="url(#violetLotusMidGrad)" />
                  {/* Tầng Cánh Sen Trong (Pha Lê Trắng Tím) */}
                  <path d="M -8,2 C -10,-6 -4,-12 0,-14 C 4,-12 10,-6 8,2 C 4,8 -4,8 -8,2 Z" fill="url(#violetLotusInnerGrad)" />
                  {/* Nhụy Sen & Đạo Thai Chân Linh */}
                  <circle cx="0" cy="-2" r="4.5" fill="#ffffff" filter="url(#naGlowGold)" />
                  <circle cx="0" cy="-2" r="2.5" fill="#fde047" />
                  {/* Các Hạt Sương Linh Tính */}
                  {[-12, -7, 0, 7, 12].map((x, idx) => (
                    <circle key={`dew-${idx}`} cx={x} cy={6 + (idx%2)*2} r="1" fill="#f0abfc" />
                  ))}
                </g>
              )}

              {/* ⚔️ C. PHẠT THIÊN (Vô Thượng Kiếm Thần) */}
              {arch.type === 'sword' && (
                <g filter="url(#naGlowGold)">
                  {/* Kiếm Trận Hào Quang Phía Sau */}
                  <circle cx="0" cy="-2" r="22" fill="none" stroke="rgba(56, 189, 248, 0.35)" strokeWidth="1" strokeDasharray="4 6" style={{ transformOrigin: '0 -2px', animation: 'haloSpinSlow 40s linear infinite' }} />
                  {/* 4 Thanh Phi Kiếm Hộ Thể Nhỏ */}
                  <g style={{ transformOrigin: '0 -2px', animation: 'haloSpinReverse 25s linear infinite' }}>
                    <line x1="-18" y1="-2" x2="-26" y2="-2" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="18" y1="-2" x2="26" y2="-2" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="0" y1="-20" x2="0" y2="-28" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="0" y1="16" x2="0" y2="24" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" />
                  </g>
                  {/* Lưỡi Cự Kiếm Thiên Giới */}
                  <polygon points="0,-28 5,-20 3,12 0,16 -3,12 -5,-20" fill="url(#swordBladeGrad)" stroke="#facc15" strokeWidth="1.2" />
                  {/* Rãnh Kiếm & Cổ Phù Văn Khắc Sâu */}
                  <line x1="0" y1="-24" x2="0" y2="10" stroke="#38bdf8" strokeWidth="1.5" />
                  <circle cx="0" cy="-14" r="1.2" fill="#ffffff" />
                  <circle cx="0" cy="-4" r="1.2" fill="#ffffff" />
                  <circle cx="0" cy="4" r="1.2" fill="#ffffff" />
                  {/* Hộ Thủ Cánh Rồng (Crossguard) */}
                  <path d="M -12,12 Q 0,8 12,12 L 8,15 Q 0,12 -8,15 Z" fill="#b45309" stroke="#fde047" strokeWidth="1" />
                  <circle cx="0" cy="13" r="2.5" fill="#ef4444" filter="url(#naGlowFire)" />
                  {/* Chuôi Kiếm & Núm Cầm */}
                  <line x1="0" y1="15" x2="0" y2="24" stroke="#78350f" strokeWidth="2.2" strokeLinecap="round" />
                  <circle cx="0" cy="25" r="2" fill="#fde047" />
                </g>
              )}

              {/* 🌙 D. VẬN MỆNH (Tử Nguyệt Thần Đồng) */}
              {arch.type === 'destiny_moon' && (
                <g filter="url(#naGlowPurple)">
                  {/* Vòng Tinh Văn Tinh Túc */}
                  <circle cx="0" cy="0" r="24" fill="none" stroke="rgba(232, 121, 249, 0.4)" strokeWidth="0.8" strokeDasharray="2 4" style={{ transformOrigin: '0 0', animation: 'haloSpinSlow 50s linear infinite' }} />
                  {/* Trăng Lưỡi Liềm Khắc Hoa Văn */}
                  <path d="M -16,-20 A 24 24 0 1 0 16,-20 A 18 18 0 1 1 -16,-20 Z" fill="url(#destinyMoonGrad)" stroke="#e879f9" strokeWidth="1.2" />
                  {/* Họa Tiết Nguyệt Thổ */}
                  <circle cx="-12" cy="4" r="2" fill="#c084fc" opacity="0.6" />
                  <circle cx="-6" cy="14" r="2.5" fill="#c084fc" opacity="0.6" />
                  <circle cx="6" cy="12" r="1.8" fill="#c084fc" opacity="0.6" />
                  {/* Tử Nguyệt Thần Đồng - Thần Nhãn Ở Trung Tâm */}
                  <g transform="translate(0, 0)">
                    <ellipse cx="0" cy="0" rx="10" ry="6" fill="rgba(8, 14, 30, 0.95)" stroke="#38bdf8" strokeWidth="1.4" />
                    <circle cx="0" cy="0" r="4.5" fill="url(#voidSingularityGrad)" />
                    <line x1="0" y1="-6" x2="0" y2="6" stroke="#ffffff" strokeWidth="1.2" />
                    <circle cx="0" cy="0" r="1.5" fill="#ffffff" filter="url(#naGlowCyan)" />
                  </g>
                  {/* 4 Ngôi Sao Định Mệnh */}
                  {[[-18, -14], [18, -14], [-20, 10], [20, 10]].map(([sx, sy], sidx) => (
                    <polygon key={`star-${sidx}`} points={`${sx},${sy-3} ${sx+1},${sy-1} ${sx+3},${sy} ${sx+1},${sy+1} ${sx},${sy+3} ${sx-1},${sy+1} ${sx-3},${sy} ${sx-1},${sy-1}`} fill="#fde047" />
                  ))}
                </g>
              )}

              {/* ☯️ E. LUÂN HỒI (Lục Đạo Thái Cực) */}
              {arch.type === 'reincarnation' && (
                <g filter="url(#naGlowCyan)">
                  {/* Bánh Xe Lục Đạo (6 Căm Khắc Cổ Phù) */}
                  <circle cx="0" cy="0" r="22" fill="rgba(6, 12, 28, 0.9)" stroke="#38bdf8" strokeWidth="1.8" />
                  <circle cx="0" cy="0" r="18" fill="none" stroke="rgba(251, 191, 36, 0.6)" strokeWidth="1" strokeDasharray="3 4" />
                  {/* 6 Nan Hoa / 6 Cửa Luân Hồi */}
                  {[0, 60, 120, 180, 240, 300].map((deg, sidx) => {
                    const rad = (deg * Math.PI) / 180;
                    return (
                      <g key={`reinc-spoke-${sidx}`}>
                        <line x1={Math.cos(rad) * 10} y1={Math.sin(rad) * 10} x2={Math.cos(rad) * 22} y2={Math.sin(rad) * 22} stroke="#facc15" strokeWidth="1.2" />
                        <circle cx={Math.cos(rad) * 22} cy={Math.sin(rad) * 22} r="2" fill="#38bdf8" />
                      </g>
                    );
                  })}
                  {/* Tâm Thái Cực Âm Dương Xoáy */}
                  <g style={{ transformOrigin: '0 0', animation: 'haloSpinReverse 30s linear infinite' }}>
                    <circle cx="0" cy="0" r="10" fill="#0f172a" stroke="#ffffff" strokeWidth="1" />
                    <path d="M 0,-10 A 10 10 0 0 1 0,10 A 5 5 0 0 1 0,0 A 5 5 0 0 0 0,-10 Z" fill="#38bdf8" />
                    <path d="M 0,-10 A 10 10 0 0 0 0,10 A 5 5 0 0 0 0,0 A 5 5 0 0 1 0,-10 Z" fill="#e2e8f0" />
                    <circle cx="0" cy="-5" r="1.8" fill="#ffffff" />
                    <circle cx="0" cy="5" r="1.8" fill="#0f172a" />
                  </g>
                </g>
              )}

              {/* 🦅 F. SÁNG THẾ (Sáng Thế Kim Phượng) */}
              {arch.type === 'phoenix' && (
                <g filter="url(#naGlowGold)">
                  {/* Thần Vũ Hào Quang */}
                  <circle cx="0" cy="-4" r="22" fill="none" stroke="rgba(249, 115, 22, 0.4)" strokeWidth="1" strokeDasharray="3 5" />
                  {/* Cánh Phượng Hoàng Lửa 3 Tầng */}
                  <path d="M 0,-12 C -10,-24 -24,-18 -22,-2 C -16,4 -6,2 0,6 Z" fill="url(#phoenixFireGrad)" stroke="#fde047" strokeWidth="1" />
                  <path d="M 0,-12 C 10,-24 24,-18 22,-2 C 16,4 6,2 0,6 Z" fill="url(#phoenixFireGrad)" stroke="#fde047" strokeWidth="1" />
                  <path d="M 0,-8 C -8,-16 -18,-10 -16,0 C -12,4 -4,3 0,6 Z" fill="#fde047" opacity="0.8" />
                  <path d="M 0,-8 C 8,-16 18,-10 16,0 C 12,4 4,3 0,6 Z" fill="#fde047" opacity="0.8" />
                  {/* Đầu Phượng & Mũ Miện Lửa */}
                  <circle cx="0" cy="-14" r="3.5" fill="#fde047" />
                  <polygon points="0,-18 2,-14 -2,-14" fill="#ef4444" />
                  <polygon points="0,-22 1.5,-17 -1.5,-17" fill="#facc15" />
                  <circle cx="-1" cy="-14" r="0.8" fill="#000000" />
                  {/* 3 Chiếc Đuôi Phượng Lộng Lẫy */}
                  <path d="M -3,6 Q -8,18 -10,24" fill="none" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M 0,6 Q 0,18 0,26" fill="none" stroke="#fde047" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M 3,6 Q 8,18 10,24" fill="none" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="-10" cy="24" r="2.2" fill="#ef4444" stroke="#fde047" strokeWidth="0.8" />
                  <circle cx="0" cy="26" r="2.6" fill="#ef4444" stroke="#fde047" strokeWidth="0.8" />
                  <circle cx="10" cy="24" r="2.2" fill="#ef4444" stroke="#fde047" strokeWidth="0.8" />
                  {/* Lửa Sáng Thế Giữa Ngực */}
                  <circle cx="0" cy="-4" r="4.5" fill="#ffffff" filter="url(#naGlowFire)" />
                </g>
              )}

              {/* 🦋 G. TẠO HÓA (Tạo Hóa Bích Điệp) */}
              {arch.type === 'jade_butterfly' && (
                <g filter="url(#naGlowCyan)">
                  {/* Cuộn Trúc Thư / Ngọc Điệp Phía Dưới */}
                  <rect x="-18" y="12" width="36" height="7" rx="2" fill="#065f46" stroke="#34d399" strokeWidth="1" />
                  <line x1="-14" y1="15.5" x2="14" y2="15.5" stroke="#a7f3d0" strokeWidth="1" strokeDasharray="2 2" />
                  {/* Cánh Bướm Ngọc Bích Trên */}
                  <path d="M 0,-4 C -12,-22 -26,-14 -18,2 C -10,4 -2,0 0,4 Z" fill="url(#jadeButterflyGrad)" stroke="#a7f3d0" strokeWidth="1.2" />
                  <path d="M 0,-4 C 12,-22 26,-14 18,2 C 10,4 2,0 0,4 Z" fill="url(#jadeButterflyGrad)" stroke="#a7f3d0" strokeWidth="1.2" />
                  {/* Gân Cánh Bích Điệp */}
                  <path d="M -4,-4 Q -16,-10 -16,-6 M -4,-2 Q -14,-2 -12,2" fill="none" stroke="#ffffff" strokeWidth="0.8" opacity="0.75" />
                  <path d="M 4,-4 Q 16,-10 16,-6 M 4,-2 Q 14,-2 12,2" fill="none" stroke="#ffffff" strokeWidth="0.8" opacity="0.75" />
                  {/* Cánh Bướm Dưới */}
                  <path d="M 0,2 C -10,6 -14,14 -4,12 C -2,10 0,6 0,2 Z" fill="#059669" opacity="0.85" />
                  <path d="M 0,2 C 10,6 14,14 4,12 C 2,10 0,6 0,2 Z" fill="#059669" opacity="0.85" />
                  {/* Thân Bướm & Râu Bướm */}
                  <line x1="0" y1="-10" x2="0" y2="8" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                  <path d="M 0,-10 Q -4,-16 -6,-18 M 0,-10 Q 4,-16 6,-18" fill="none" stroke="#67e8f9" strokeWidth="1.2" strokeLinecap="round" />
                  <circle cx="0" cy="-2" r="3.5" fill="#ffffff" filter="url(#naGlowCyan)" />
                </g>
              )}

              {/* ⏳ H. THỜI KHÔNG (Tuế Nguyệt Bàn Chu) */}
              {arch.type === 'space_time' && (
                <g filter="url(#naGlowPurple)">
                  {/* Vành Thiên Văn Bàn 3 Chiều */}
                  <ellipse cx="0" cy="0" rx="22" ry="10" fill="none" stroke="#818cf8" strokeWidth="1.4" strokeDasharray="3 3" style={{ transformOrigin: '0 0', animation: 'haloSpinSlow 40s linear infinite' }} />
                  <ellipse cx="0" cy="0" rx="18" ry="18" fill="none" stroke="#c7d2fe" strokeWidth="0.8" />
                  {/* Khung Đồng Hồ Cát Thời Không */}
                  <line x1="-12" y1="-16" x2="12" y2="-16" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
                  <line x1="-12" y1="16" x2="12" y2="16" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
                  <line x1="-10" y1="-16" x2="-10" y2="16" stroke="#f59e0b" strokeWidth="1.2" />
                  <line x1="10" y1="-16" x2="10" y2="16" stroke="#f59e0b" strokeWidth="1.2" />
                  {/* Bầu Cát Trên / Dưới */}
                  <polygon points="-8,-14 8,-14 0,-1" fill="url(#astrolabeGrad)" stroke="#818cf8" strokeWidth="1" opacity="0.85" />
                  <polygon points="0,1 8,14 -8,14" fill="url(#astrolabeGrad)" stroke="#818cf8" strokeWidth="1" opacity="0.85" />
                  {/* Hạt Cát Tuế Nguyệt Đảo Chiều */}
                  <circle cx="0" cy="0" r="2.8" fill="#ffffff" filter="url(#naGlowGold)" />
                  <circle cx="0" cy="-6" r="1.5" fill="#fde047" />
                  <circle cx="0" cy="6" r="1.5" fill="#fde047" />
                </g>
              )}

              {/* 🦩 I. TIÊU DAO (Tiêu Dao Tiên Hạc) */}
              {arch.type === 'crane' && (
                <g filter="url(#naGlowCyan)">
                  {/* Tường Vân Tầng Tầng */}
                  <path d="M -18,16 C -24,12 -12,8 -6,14 C 0,10 12,10 16,15 C 22,14 18,18 10,18 Z" fill="rgba(186, 230, 253, 0.4)" stroke="#38bdf8" strokeWidth="0.8" />
                  {/* Cánh Tiên Hạc Sải Dài */}
                  <path d="M -22,-4 Q -10,-18 0,-6 Q 10,-18 22,-4 Q 14,8 0,12 Q -14,8 -22,-4 Z" fill="url(#craneGrad)" stroke="#ffffff" strokeWidth="1.2" />
                  {/* Lông Cánh Đen Điểm Xuyết */}
                  <path d="M -20,-2 L -14,6 M -16,-4 L -10,4 M 20,-2 L 14,6 M 16,-4 L 10,4" stroke="#0f172a" strokeWidth="1.5" strokeLinecap="round" />
                  {/* Cổ Hạc & Đan Đỉnh Đỏ */}
                  <path d="M 0,2 Q 0,-12 0,-18" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
                  <circle cx="0" cy="-18" r="3.2" fill="#ffffff" />
                  <circle cx="0" cy="-20" r="1.6" fill="#ef4444" />
                  {/* Mỏ Hạc Ngậm Hồ Lô Tiên Đan */}
                  <line x1="0" y1="-17" x2="6" y2="-15" stroke="#f59e0b" strokeWidth="1.2" strokeLinecap="round" />
                  <g transform="translate(8, -13)">
                    <circle cx="0" cy="-2" r="1.8" fill="#10b981" />
                    <circle cx="0" cy="2" r="2.6" fill="#10b981" stroke="#fde047" strokeWidth="0.8" />
                  </g>
                  {/* Chân Hạc */}
                  <line x1="-2" y1="12" x2="-4" y2="22" stroke="#64748b" strokeWidth="1.2" />
                  <line x1="2" y1="12" x2="4" y2="22" stroke="#64748b" strokeWidth="1.2" />
                </g>
              )}

              {/* 🌳 J. THẦN MỘC (Khởi Nguyên Thần Mộc) */}
              {arch.type === 'world_tree' && (
                <g filter="url(#naGlowEmerald)">
                  {/* Đảo Nổi Thần Mộc & Rễ Cổ Thụ */}
                  <ellipse cx="0" cy="14" rx="18" ry="5" fill="#14532d" stroke="#22c55e" strokeWidth="1" />
                  <path d="M -12,16 Q -16,24 -18,26 M 0,16 Q 2,24 0,27 M 12,16 Q 16,24 18,26" fill="none" stroke="#86efac" strokeWidth="1.2" strokeLinecap="round" />
                  {/* Thân Cây Cổ Thụ Gồ Ghề */}
                  <path d="M -4,14 Q -2,4 -6,-2 Q -2,-6 0,-10 Q 2,-6 6,-2 Q 2,4 4,14 Z" fill="#78350f" stroke="#b45309" strokeWidth="1" />
                  {/* Tán Lá Sinh Mệnh Tỏa Rộng 3 Vòm */}
                  <circle cx="-10" cy="-10" r="9" fill="url(#worldTreeGrad)" opacity="0.9" />
                  <circle cx="10" cy="-10" r="9" fill="url(#worldTreeGrad)" opacity="0.9" />
                  <circle cx="0" cy="-16" r="11" fill="url(#worldTreeGrad)" opacity="0.95" />
                  {/* Đạo Quả / Giọt Sương Trường Sinh */}
                  <circle cx="-8" cy="-8" r="2.2" fill="#fde047" filter="url(#naGlowGold)" />
                  <circle cx="8" cy="-8" r="2.2" fill="#fde047" filter="url(#naGlowGold)" />
                  <circle cx="0" cy="-16" r="3.2" fill="#ffffff" filter="url(#naGlowGold)" />
                  <circle cx="-3" cy="-13" r="1.5" fill="#f43f5e" />
                  <circle cx="3" cy="-13" r="1.5" fill="#f43f5e" />
                </g>
              )}

              {/* 🏺 K. BẤT HỦ (Cửu Châu Thần Đỉnh) */}
              {arch.type === 'cauldron' && (
                <g filter="url(#naGlowGold)">
                  {/* Đài Bát Giác Hoàng Kim */}
                  <polygon points="-18,18 18,18 14,22 -14,22" fill="#78350f" stroke="#f59e0b" strokeWidth="1" />
                  {/* Làn Khói Tiên Hương Nghi Ngút */}
                  <path d="M -6,-10 Q -12,-20 -4,-26 M 0,-10 Q 4,-18 0,-28 M 6,-10 Q 12,-20 4,-26" fill="none" stroke="rgba(254, 240, 138, 0.6)" strokeWidth="1.4" strokeDasharray="3 3" />
                  {/* Thân Đỉnh Cửu Châu Uy Nghi */}
                  <rect x="-16" y="-8" width="32" height="20" rx="4" fill="url(#cauldronGrad)" stroke="#fde047" strokeWidth="1.6" />
                  <rect x="-18" y="-11" width="36" height="4" rx="1.5" fill="#f59e0b" stroke="#fef08a" strokeWidth="1" />
                  {/* Hai Tai Đỉnh (Quai Cầm) */}
                  <path d="M -16,-8 C -22,-8 -22,-2 -16,-2" fill="none" stroke="#fde047" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M 16,-8 C 22,-8 22,-2 16,-2" fill="none" stroke="#fde047" strokeWidth="2.2" strokeLinecap="round" />
                  {/* Phù Điêu Thao Thiết Giữa Đỉnh */}
                  <rect x="-10" y="-3" width="20" height="10" rx="2" fill="#78350f" stroke="#fde047" strokeWidth="1" />
                  <circle cx="-4" cy="2" r="1.5" fill="#ef4444" />
                  <circle cx="4" cy="2" r="1.5" fill="#ef4444" />
                  <line x1="-6" y1="5" x2="6" y2="5" stroke="#fde047" strokeWidth="1" />
                  {/* 3 Chân Đỉnh Vững Chắc */}
                  <path d="M -12,12 L -12,18 M 0,12 L 0,18 M 12,12 L 12,18" stroke="#b45309" strokeWidth="3" strokeLinecap="round" />
                </g>
              )}

              {/* 🌌 L. HƯ VÔ (Hư Vô Chi Đồng) */}
              {arch.type === 'void_eye' && (
                <g filter="url(#naGlowPurple)">
                  {/* Đĩa Bồi Tụ Hư Vô Nghiêng 3D */}
                  <ellipse cx="0" cy="0" rx="26" ry="12" fill="none" stroke="url(#voidAccretionGrad)" strokeWidth="2.5" strokeDasharray="4 2" style={{ transformOrigin: '0 0', animation: 'haloSpinSlow 25s linear infinite' }} />
                  {/* Tia Plasma 2 Cực */}
                  <line x1="0" y1="-26" x2="0" y2="26" stroke="#c084fc" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="4 3" />
                  {/* Chân Trời Sự Kiện */}
                  <circle cx="0" cy="0" r="14" fill="#020617" stroke="#cbd5e1" strokeWidth="1.8" />
                  <circle cx="0" cy="0" r="10" fill="none" stroke="#e879f9" strokeWidth="1.4" strokeDasharray="3 3" style={{ transformOrigin: '0 0', animation: 'haloSpinReverse 15s linear infinite' }} />
                  {/* Kỳ Điểm Hắc Động */}
                  <circle cx="0" cy="0" r="6" fill="#000000" />
                  <circle cx="0" cy="0" r="2.2" fill="#ffffff" filter="url(#naGlowCyan)" />
                </g>
              )}

              {/* 🪢 M. TÚC MỆNH (Nhân Quả Chi Kết) */}
              {arch.type === 'karma_knot' && (
                <g filter="url(#naGlowCrimson)">
                  {/* Bàn Trận Nhân Quả */}
                  <circle cx="0" cy="0" r="22" fill="none" stroke="rgba(244, 63, 94, 0.4)" strokeWidth="1" strokeDasharray="3 3" />
                  {/* 2 Cây Kim Nhân Quả */}
                  <line x1="-16" y1="-16" x2="16" y2="16" stroke="#fbbf24" strokeWidth="1.6" strokeLinecap="round" />
                  <line x1="16" y1="-16" x2="-16" y2="16" stroke="#fbbf24" strokeWidth="1.6" strokeLinecap="round" />
                  <circle cx="-16" cy="-16" r="2" fill="#fde047" />
                  <circle cx="16" cy="-16" r="2" fill="#fde047" />
                  {/* Nút Thắt Vô Tận Đồng Tâm */}
                  <path d="M -12,-6 C -18,-16 -4,-18 0,-8 C 4,-18 18,-16 12,-6 C 18,4 4,16 0,8 C -4,16 -18,4 -12,-6 Z" fill="none" stroke="url(#karmaRedGrad)" strokeWidth="3.2" strokeLinejoin="round" />
                  <path d="M -6,-12 C -16,-18 -18,-4 -8,0 C -18,4 -16,18 -6,12 C 4,18 16,18 8,0 C 18,-4 18,-18 6,-12" fill="none" stroke="#fbbf24" strokeWidth="1.2" />
                  {/* Chuông & Hạt Châu Mệnh Định */}
                  <circle cx="0" cy="0" r="4" fill="#fbbf24" filter="url(#naGlowGold)" />
                  <circle cx="0" cy="0" r="2" fill="#f43f5e" />
                  <line x1="0" y1="8" x2="0" y2="22" stroke="#f43f5e" strokeWidth="1.8" strokeLinecap="round" />
                  <circle cx="0" cy="22" r="2.5" fill="#fde047" />
                </g>
              )}

              {/* 👑 N. CHÍ TÔN (Default) */}
              {arch.type === 'sovereign_deity' && (
                <g filter="url(#naGlowGold)">
                  <polygon points="0,-22 16,-4 0,18 -16,-4" fill="none" stroke="#fbbf24" strokeWidth="2.2" />
                  <polygon points="0,-16 12,-4 0,12 -12,-4" fill="rgba(251, 191, 36, 0.15)" stroke="#fde047" strokeWidth="1.2" />
                  <circle cx="0" cy="-2" r="6" fill="#ffffff" filter="url(#naGlowGold)" />
                  <circle cx="0" cy="-2" r="3" fill="#fbbf24" />
                </g>
              )}

            </g>
          );
        };

        const focusedDaoAnhObj = focusedDaoAnhId !== null 
          ? (existingDaoAnhs.find(d => d.id === focusedDaoAnhId || d.palaceIndex === focusedDaoAnhId) || { palaceIndex: focusedDaoAnhId })
          : null;

        return (
          <div style={{ 
            width: '100%', 
            height: '100%', 
            minHeight: '100%', 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            position: 'relative', 
            overflow: 'hidden' 
          }}>
            
            {/* KHUNG CANVAS SVG VŨ TRỤ THỨC HẢI & 13 ĐẠO ANH */}
            <div style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              minHeight: '100%',
              flex: 1,
              background: 'radial-gradient(circle at 50% 50%, #0a0e24 0%, #02040a 100%)',
              border: 'none',
              borderRadius: 0,
              overflow: 'hidden'
            }}>
              <svg
                viewBox="0 0 1280 870"
                preserveAspectRatio="xMidYMid meet"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  display: 'block'
                }}
              >
                <defs>
                  <style>{`
                    @keyframes spiritBreathing { 0% { transform: translateY(0px) scale(1); } 50% { transform: translateY(-4px) scale(1.02); } 100% { transform: translateY(0px) scale(1); } }
                    @keyframes haloSpinSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                    @keyframes haloSpinReverse { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
                    @keyframes daoAnhHeartbeat { 0%, 100% { transform: scale(1); opacity: 0.9; } 50% { transform: scale(1.2); opacity: 1; filter: drop-shadow(0 0 8px #fde047); } }
                  `}</style>
                  
                  {/* Filters & Glows */}
                  <filter id="naGlowGold"><feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#fbbf24" floodOpacity="0.8" /></filter>
                  <filter id="naGlowCyan"><feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#38bdf8" floodOpacity="0.8" /></filter>
                  <filter id="naGlowPurple"><feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#c084fc" floodOpacity="0.85" /></filter>
                  <filter id="naGlowEmerald"><feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#34d399" floodOpacity="0.8" /></filter>
                  <filter id="naGlowCrimson"><feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#f43f5e" floodOpacity="0.8" /></filter>
                  <filter id="naGlowFire"><feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#f97316" floodOpacity="0.9" /></filter>

                  {/* Gradient Shaders For Primordial Spirits */}
                  <linearGradient id="dragonGoldGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#fef08a" /><stop offset="50%" stopColor="#f59e0b" /><stop offset="100%" stopColor="#b45309" />
                  </linearGradient>
                  <radialGradient id="dragonPearlGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ffffff" /><stop offset="40%" stopColor="#fde047" /><stop offset="100%" stopColor="#ea580c" />
                  </radialGradient>
                  <linearGradient id="violetLotusOuterGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" /><stop offset="100%" stopColor="#3b0764" />
                  </linearGradient>
                  <linearGradient id="violetLotusMidGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f5d0fe" /><stop offset="100%" stopColor="#9333ea" />
                  </linearGradient>
                  <linearGradient id="violetLotusInnerGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" /><stop offset="100%" stopColor="#e879f9" />
                  </linearGradient>
                  <linearGradient id="swordBladeGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ffffff" /><stop offset="40%" stopColor="#7dd3fc" /><stop offset="100%" stopColor="#0284c7" />
                  </linearGradient>
                  <linearGradient id="destinyMoonGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#f5d0fe" /><stop offset="50%" stopColor="#c084fc" /><stop offset="100%" stopColor="#581c87" />
                  </linearGradient>
                  <linearGradient id="phoenixFireGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fef08a" /><stop offset="45%" stopColor="#f97316" /><stop offset="100%" stopColor="#dc2626" />
                  </linearGradient>
                  <linearGradient id="jadeButterflyGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ccfbf1" /><stop offset="40%" stopColor="#2dd4bf" /><stop offset="100%" stopColor="#065f46" />
                  </linearGradient>
                  <linearGradient id="astrolabeGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#e0e7ff" /><stop offset="50%" stopColor="#818cf8" /><stop offset="100%" stopColor="#3730a3" />
                  </linearGradient>
                  <linearGradient id="craneGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" /><stop offset="60%" stopColor="#f0f9ff" /><stop offset="100%" stopColor="#7dd3fc" />
                  </linearGradient>
                  <radialGradient id="worldTreeGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#86efac" /><stop offset="50%" stopColor="#22c55e" /><stop offset="100%" stopColor="#14532d" />
                  </radialGradient>
                  <linearGradient id="cauldronGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#fef08a" /><stop offset="40%" stopColor="#d97706" /><stop offset="100%" stopColor="#78350f" />
                  </linearGradient>
                  <linearGradient id="voidAccretionGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#f0abfc" /><stop offset="50%" stopColor="#38bdf8" /><stop offset="100%" stopColor="#0284c7" />
                  </linearGradient>
                  <radialGradient id="voidSingularityGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#38bdf8" /><stop offset="40%" stopColor="#7e22ce" /><stop offset="100%" stopColor="#020617" />
                  </radialGradient>
                  <linearGradient id="karmaRedGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#fecdd3" /><stop offset="40%" stopColor="#f43f5e" /><stop offset="100%" stopColor="#881337" />
                  </linearGradient>
                </defs>

                {/* ─── QUẦN THỂ 13 PHÁP TƯỚNG ĐẠO ANH BẢN NGUYÊN TỌA TRẤN ─── */}
                {palaceCoordinates.map((pos, i) => {
                  const isLampPalace = i < lampCount;
                  const selfLocalIdx = isLampPalace ? null : (maxThienCung - 1) - i;
                  const lampId = isLampPalace ? lampList[i] : null;
                  const lobj = lampId ? LIFE_LAMPS.find(l => l.id === lampId) : null;
                  const anchor = !isLampPalace ? (cultivation?.palaceAnchors?.[selfLocalIdx] || cultivation?.palaceAnchors?.[i - lampCount] || cultivation?.palaceAnchors?.[i]) : null;
                  const artifactObj = anchor ? ((SUPPRESSING_ARTIFACTS || []).find(a => a.id === anchor.id) || anchor) : null;

                  // Tên Thần Cung Gốc
                  const palaceName = (() => {
                    if (isLampPalace) return lobj ? getLampPalaceName(lobj) : `Chân Cung #${i + 1}`;
                    if (anchor) {
                      const aId = anchor.id || artifactObj?.id;
                      const aName = anchor.name || artifactObj?.name || '';
                      if (aId === 'luan_hoi_ban' || aName.includes('Luân Hồi')) return 'Lục Đạo Luân Hồi Cung';
                      if (aId && typeof getPalaceNameForArtifact === 'function') {
                        const computed = getPalaceNameForArtifact(artifactObj || anchor);
                        if (computed) return computed;
                      }
                      return anchor.palaceName || `${artifactObj?.shortName || artifactObj?.name || 'Bảo Vật'} Cung`;
                    }
                    return `Thiên Cung Tự Thân #${selfLocalIdx !== null ? selfLocalIdx + 1 : i + 1}`;
                  })();

                  const da = existingDaoAnhs.find(d => d.palaceIndex === i) || existingDaoAnhs[i] || null;
                  const currentKiep = da ? (da.currentKiep || 0) : 0;
                  const isMaxKiep = currentKiep >= 5;
                  const curExp = da ? (da.currentExp !== undefined ? da.currentExp : (da.currentThienMenh || 0)) : 0;
                  const maxExp = da ? (da.maxExp || KIEP_EXP_REQUIREMENTS[currentKiep] || 5000) : 5000;
                  const expPercent = Math.min(100, Math.floor((curExp / maxExp) * 100));
                  const isReady80 = expPercent >= 80 && !isMaxKiep;
                  const isHovered = hoveredPalace === `palace_na_${i}`;

                  // PHÂN GIẢI PHÁP TƯỚNG BẢN NGUYÊN ĐỘC BẢN (13 UNIQUE PRIMORDIAL AVATARS)
                  const arch = (() => {
                    const t = (palaceName + ' ' + (lampId || '') + ' ' + (anchor?.id || '')).toLowerCase();
                    if (t.includes('long') || t.includes('tổ long')) return { type: 'dragon', color: '#f59e0b', glow: '#fde047', name: 'Thái Cổ Kim Long' };
                    if (t.includes('hồng mông') || t.includes('tử khí')) return { type: 'purple_lotus', color: '#c084fc', glow: '#f0abfc', name: 'Hồng Mông Tử Liên' };
                    if (t.includes('kiếm') || t.includes('phạt thiên')) return { type: 'sword', color: '#facc15', glow: '#38bdf8', name: 'Vô Thượng Kiếm Thần' };
                    if (t.includes('vận mệnh') || t.includes('tử nguyệt')) return { type: 'destiny_moon', color: '#a855f7', glow: '#e879f9', name: 'Tử Nguyệt Thần Đồng' };
                    if (t.includes('luân hồi') || t.includes('lục đạo')) return { type: 'reincarnation', color: '#38bdf8', glow: '#e2e8f0', name: 'Lục Đạo Thái Cực' };
                    if (t.includes('sáng thế') || t.includes('bàn nguyên')) return { type: 'phoenix', color: '#fde047', glow: '#4ade80', name: 'Sáng Thế Kim Phượng' };
                    if (t.includes('ngọc điệp') || t.includes('tạo hóa')) return { type: 'jade_butterfly', color: '#67e8f9', glow: '#ffffff', name: 'Tạo Hóa Bích Điệp' };
                    if (t.includes('thời không')) return { type: 'space_time', color: '#818cf8', glow: '#38bdf8', name: 'Tuế Nguyệt Bàn Chu' };
                    if (t.includes('tiêu dao')) return { type: 'crane', color: '#2dd4bf', glow: '#bae6fd', name: 'Tiêu Dao Tiên Hạc' };
                    if (t.includes('mộc') || t.includes('sinh mệnh')) return { type: 'world_tree', color: '#22c55e', glow: '#86efac', name: 'Khởi Nguyên Thần Mộc' };
                    if (t.includes('đỉnh') || t.includes('bất hủ')) return { type: 'cauldron', color: '#eab308', glow: '#fbbf24', name: 'Cửu Châu Thần Đỉnh' };
                    if (t.includes('hư vô') || t.includes('tịch diệt')) return { type: 'void_eye', color: '#94a3b8', glow: '#c084fc', name: 'Hư Vô Chi Đồng' };
                    if (t.includes('túc mệnh') || t.includes('nhân quả')) return { type: 'karma_knot', color: '#f43f5e', glow: '#fde047', name: 'Nhân Quả Chi Kết' };
                    return { type: 'sovereign_deity', color: '#fbbf24', glow: '#fde047', name: 'Chí Tôn Thần Thai' };
                  })();

                  // TÊN ĐẠO ANH CHÍNH DANH (KHÔNG DÙNG CHỮ CUNG NỮA)
                  const daoAnhDisplayName = (() => {
                    if (arch.name) return `Đạo Anh · ${arch.name}`;
                    const clean = palaceName.replace(/Cung$/i, '').trim();
                    return `Đạo Anh · ${clean}`;
                  })();

                  const scale = (pos.scale || 1.0) * 1.05;
                  const arcR = 36;
                  const arcCircumference = 2 * Math.PI * arcR;
                  const arcDashoffset = arcCircumference - (arcCircumference * expPercent) / 100;

                  return (
                    <g
                      key={`na-palace-${i}`}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      style={{ cursor: 'pointer', transition: 'all 0.3s ease' }}
                      onMouseEnter={() => setHoveredPalace(`palace_na_${i}`)}
                      onMouseLeave={() => setHoveredPalace(null)}
                      onClick={() => setFocusedDaoAnhId(da ? da.id : i)}
                    >
                      <g style={{ animation: 'spiritBreathing 3.6s ease-in-out infinite alternate', animationDelay: `${i * 0.35}s` }}>
                        
                        {/* Quầng Hào Quang Dưới Chân */}
                        <ellipse
                          cx="0"
                          cy="16"
                          rx={46 * scale}
                          ry={14 * scale}
                          fill={arch.color}
                          opacity={isReady80 ? 0.45 : (isHovered ? 0.35 : 0.18)}
                          filter="url(#naGlowGold)"
                        />

                        <g transform={`scale(${scale})`}>
                          
                          {/* 1. VÒNG TIẾN ĐỘ EXP LINH LỰC */}
                          <circle
                            cx="0"
                            cy="0"
                            r={arcR}
                            fill="none"
                            stroke="rgba(255, 255, 255, 0.06)"
                            strokeWidth="1.8"
                          />
                          <circle
                            cx="0"
                            cy="0"
                            r={arcR}
                            fill="none"
                            stroke={isMaxKiep ? '#fbbf24' : (isReady80 ? '#c084fc' : arch.color)}
                            strokeWidth="2.2"
                            strokeDasharray={arcCircumference}
                            strokeDashoffset={isMaxKiep ? 0 : arcDashoffset}
                            strokeLinecap="round"
                            transform="rotate(-90)"
                          />

                          {/* 2. PHÁP TƯỚNG BẢN NGUYÊN ĐỘC BẢN */}
                          <g>
                            {renderDetailedPrimordialAvatar(arch, currentKiep, isMaxKiep, isReady80, false)}
                          </g>

                          {/* 3. TÊN ĐẠO ANH TINH TẾ (PHÍA TRÊN ĐẦU) */}
                          <g transform="translate(0, -42)">
                            <text
                              textAnchor="middle"
                              fontSize="9.5"
                              fontWeight="900"
                              fill={isMaxKiep ? '#fde047' : (isReady80 ? '#f0abfc' : 'var(--color-kim)')}
                              fontFamily="var(--font-serif)"
                              letterSpacing="0.6"
                            >
                              {daoAnhDisplayName}
                            </text>
                          </g>

                          {/* 4. HỆ THỐNG 5 LINH KIẾP TINH ẤN / CHÂU QUANG (THAY THẾ CHỮ THÔ) */}
                          <g transform="translate(0, 46)">
                            <rect
                              x="-34"
                              y="-7.5"
                              width="68"
                              height="15"
                              rx="7.5"
                              fill="rgba(6, 12, 28, 0.92)"
                              stroke={isMaxKiep ? 'rgba(251, 191, 36, 0.7)' : (isReady80 ? 'rgba(240, 171, 252, 0.6)' : 'rgba(255, 255, 255, 0.16)')}
                              strokeWidth="0.9"
                            />

                            <line
                              x1="-22"
                              y1="0"
                              x2="22"
                              y2="0"
                              stroke={isMaxKiep ? '#fde047' : 'rgba(255, 255, 255, 0.14)'}
                              strokeWidth="0.8"
                              strokeDasharray={isMaxKiep ? 'none' : '2 2'}
                            />

                            {/* 5 Hạt Tinh Ấn Đại Biểu Cho 5 Kiếp */}
                            {[-22, -11, 0, 11, 22].map((xPos, kIdx) => {
                              const kiepNum = kIdx + 1;
                              const isCompleted = currentKiep >= kiepNum;
                              const isCurrentActive = currentKiep === kIdx && !isMaxKiep;

                              if (isCompleted) {
                                return (
                                  <g key={`kiep-gem-${kIdx}`} transform={`translate(${xPos}, 0)`}>
                                    <polygon
                                      points="0,-3.6 3.6,0 0,3.6 -3.6,0"
                                      fill={isMaxKiep ? '#fde047' : (arch.glow || '#fde047')}
                                      filter="url(#naGlowGold)"
                                    />
                                    <circle cx="0" cy="0" r="1.1" fill="#ffffff" />
                                  </g>
                                );
                              }

                              if (isCurrentActive) {
                                return (
                                  <g key={`kiep-gem-${kIdx}`} transform={`translate(${xPos}, 0)`}>
                                    {isReady80 ? (
                                      <g style={{ animation: 'daoAnhHeartbeat 1.4s ease-in-out infinite' }}>
                                        <polygon
                                          points="0,-4.2 4,0 0,4.2 -4,0"
                                          fill="#f0abfc"
                                          stroke="#c084fc"
                                          strokeWidth="0.8"
                                          filter="url(#naGlowPurple)"
                                        />
                                        <circle cx="0" cy="0" r="1.3" fill="#ffffff" />
                                      </g>
                                    ) : (
                                      <g>
                                        <polygon
                                          points="0,-3.2 3.2,0 0,3.2 -3.2,0"
                                          fill="rgba(56, 189, 248, 0.45)"
                                          stroke="#38bdf8"
                                          strokeWidth="0.8"
                                        />
                                        <circle cx="0" cy="0" r="0.9" fill="#38bdf8" />
                                      </g>
                                    )}
                                  </g>
                                );
                              }

                              return (
                                <g key={`kiep-gem-${kIdx}`} transform={`translate(${xPos}, 0)`}>
                                  <polygon
                                    points="0,-2.8 2.8,0 0,2.8 -2.8,0"
                                    fill="none"
                                    stroke="rgba(255, 255, 255, 0.22)"
                                    strokeWidth="0.7"
                                  />
                                  <circle cx="0" cy="0" r="0.6" fill="rgba(255, 255, 255, 0.25)" />
                                </g>
                              );
                            })}
                          </g>

                          {/* 5. NHÃN PHỤ TRẠNG THÁI (ĐỘ KIẾP HOẶC VIÊN MÃN) */}
                          {isMaxKiep && (
                            <g transform="translate(0, 62)">
                              <text textAnchor="middle" fontSize="7.8" fontWeight="900" fill="#fde047" fontFamily="var(--font-serif)" letterSpacing="0.8">
                                👑 5/5 VIÊN MÃN
                              </text>
                            </g>
                          )}
                          {isReady80 && (
                            <g transform="translate(0, 62)">
                              <text textAnchor="middle" fontSize="8" fontWeight="900" fill="#f0abfc" fontFamily="var(--font-serif)" letterSpacing="0.5">
                                ⚡ ĐỘ KIẾP {expPercent}%
                              </text>
                            </g>
                          )}
                          {!isMaxKiep && !isReady80 && (
                            <g transform="translate(0, 62)">
                              <text textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#64748b">
                                {expPercent}%
                              </text>
                            </g>
                          )}

                        </g>
                      </g>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* 3. MODAL XEM CẬN CẢNH ĐẠO ANH (FOCUS DETAIL MODAL) */}
            {focusedDaoAnhObj && (() => {
              const matchedDaoAnh = existingDaoAnhs.find(d => d.id === focusedDaoAnhId || d.palaceIndex === focusedDaoAnhObj.palaceIndex) || focusedDaoAnhObj;
              const curKiep = matchedDaoAnh.currentKiep || 0;
              const isMax = curKiep >= 5;
              const curExp = matchedDaoAnh.currentExp !== undefined ? matchedDaoAnh.currentExp : (matchedDaoAnh.currentThienMenh || 0);
              const maxExp = matchedDaoAnh.maxExp || KIEP_EXP_REQUIREMENTS[curKiep] || 5000;
              const percent = Math.min(100, Math.floor((curExp / maxExp) * 100));
              const canTribulate = percent >= 80 && !isMax;

              const tierKey = getDaoAnhTierKey(matchedDaoAnh, cultivation);
              const tierInfo = LAMP_TIERS[tierKey] || LAMP_TIERS.than_pham;
              const earnedTMOnSuccess = calculateDaoAnhTribulationReward(matchedDaoAnh, curKiep + 1, cultivation);

              const modalArch = (() => {
                const t = ((matchedDaoAnh.name || '') + ' ' + (matchedDaoAnh.palaceName || '')).toLowerCase();
                if (t.includes('long') || t.includes('tổ long')) return { type: 'dragon', color: '#f59e0b', glow: '#fde047', name: 'Thái Cổ Kim Long' };
                if (t.includes('hồng mông') || t.includes('tử khí')) return { type: 'purple_lotus', color: '#c084fc', glow: '#f0abfc', name: 'Hồng Mông Tử Liên' };
                if (t.includes('kiếm') || t.includes('phạt thiên')) return { type: 'sword', color: '#facc15', glow: '#38bdf8', name: 'Vô Thượng Kiếm Thần' };
                if (t.includes('vận mệnh') || t.includes('tử nguyệt')) return { type: 'destiny_moon', color: '#a855f7', glow: '#e879f9', name: 'Tử Nguyệt Thần Đồng' };
                if (t.includes('luân hồi') || t.includes('lục đạo')) return { type: 'reincarnation', color: '#38bdf8', glow: '#e2e8f0', name: 'Lục Đạo Thái Cực' };
                if (t.includes('sáng thế') || t.includes('bàn nguyên')) return { type: 'phoenix', color: '#fde047', glow: '#4ade80', name: 'Sáng Thế Kim Phượng' };
                if (t.includes('ngọc điệp') || t.includes('tạo hóa')) return { type: 'jade_butterfly', color: '#67e8f9', glow: '#ffffff', name: 'Tạo Hóa Bích Điệp' };
                if (t.includes('thời không')) return { type: 'space_time', color: '#818cf8', glow: '#38bdf8', name: 'Tuế Nguyệt Bàn Chu' };
                if (t.includes('tiêu dao')) return { type: 'crane', color: '#2dd4bf', glow: '#bae6fd', name: 'Tiêu Dao Tiên Hạc' };
                if (t.includes('mộc') || t.includes('sinh mệnh')) return { type: 'world_tree', color: '#22c55e', glow: '#86efac', name: 'Khởi Nguyên Thần Mộc' };
                if (t.includes('đỉnh') || t.includes('bất hủ')) return { type: 'cauldron', color: '#eab308', glow: '#fbbf24', name: 'Cửu Châu Thần Đỉnh' };
                if (t.includes('hư vô') || t.includes('tịch diệt')) return { type: 'void_eye', color: '#94a3b8', glow: '#c084fc', name: 'Hư Vô Chi Đồng' };
                if (t.includes('túc mệnh') || t.includes('nhân quả')) return { type: 'karma_knot', color: '#f43f5e', glow: '#fde047', name: 'Nhân Quả Chi Kết' };
                return { type: 'sovereign_deity', color: '#fbbf24', glow: '#fde047', name: 'Chí Tôn Thần Thai' };
              })();

              const modalDaoAnhDisplayName = `Đạo Anh · ${modalArch.name || matchedDaoAnh.name || 'Bản Nguyên Thần Thể'}`.replace(/^Đạo Anh · Đạo Anh · /, 'Đạo Anh · ');

              return (
                <div
                  onClick={() => setFocusedDaoAnhId(null)}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    background: 'rgba(0, 0, 0, 0.85)',
                    backdropFilter: 'blur(10px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 20
                  }}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: '100%',
                      maxWidth: 680,
                      background: 'linear-gradient(180deg, #0f172a 0%, #030712 100%)',
                      border: '1.5px solid rgba(251, 191, 36, 0.5)',
                      borderRadius: 16,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      boxShadow: '0 0 50px rgba(0, 0, 0, 0.9), 0 0 30px rgba(251, 191, 36, 0.25)'
                    }}
                  >
                    {/* Header */}
                    <div style={{
                      padding: '16px 22px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(15, 23, 42, 0.8)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 24 }}>👑</span>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--color-kim)', fontFamily: 'var(--font-serif)' }}>
                            {modalDaoAnhDisplayName}
                          </div>
                          <div style={{ fontSize: 12, color: modalArch.color || tierInfo.color || '#38bdf8', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>Pháp Tướng: [{modalArch.name}]</span>
                            <span>•</span>
                            <span>Phẩm Cấp: {tierInfo.name}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setFocusedDaoAnhId(null)}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </div>

                    {/* Modal Content */}
                    <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 18, maxHeight: '75vh', overflowY: 'auto' }}>
                      
                      {/* Avatar Phòng Thiền Cận Cảnh */}
                      <div style={{
                        position: 'relative',
                        height: 200,
                        borderRadius: 12,
                        background: 'radial-gradient(circle at center, rgba(30, 41, 75, 0.8) 0%, rgba(8, 12, 24, 0.95) 100%)',
                        border: `1px solid ${modalArch.color || 'rgba(56, 189, 248, 0.3)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden'
                      }}>
                        <svg width="100%" height="100%" viewBox="-100 -75 200 150" style={{ overflow: 'visible' }}>
                          {/* Vành Hào Quang Tinh Tú */}
                          <circle r="48" fill="none" stroke={modalArch.color} strokeWidth="1.6" strokeDasharray="4 4" style={{ transformOrigin: '0 0', animation: 'haloSpinSlow 30s linear infinite' }} />
                          <circle r="56" fill="none" stroke={modalArch.glow} strokeWidth="0.8" opacity="0.5" style={{ transformOrigin: '0 0', animation: 'haloSpinReverse 45s linear infinite' }} />

                          {/* Pháp Tướng Bản Nguyên Phóng To Trong Phòng Thiền */}
                          <g transform="scale(1.4)">
                            {renderDetailedPrimordialAvatar(modalArch, curKiep, isMax, canTribulate, true)}
                          </g>

                          {/* 5 Hạt Tinh Ấn Kiếp trong Modal */}
                          <g transform="translate(0, 52)">
                            {[-30, -15, 0, 15, 30].map((xPos, kIdx) => {
                              const kiepNum = kIdx + 1;
                              const isCompleted = curKiep >= kiepNum;
                              const isCurrentActive = curKiep === kIdx && !isMax;

                              if (isCompleted) {
                                return (
                                  <g key={`modal-kiep-${kIdx}`} transform={`translate(${xPos}, 0)`}>
                                    <polygon
                                      points="0,-4.5 4.5,0 0,4.5 -4.5,0"
                                      fill={isMax ? '#fde047' : (modalArch.glow || '#fde047')}
                                      filter="url(#naGlowGold)"
                                    />
                                    <circle cx="0" cy="0" r="1.3" fill="#ffffff" />
                                  </g>
                                );
                              }

                              if (isCurrentActive) {
                                return (
                                  <g key={`modal-kiep-${kIdx}`} transform={`translate(${xPos}, 0)`}>
                                    <polygon
                                      points="0,-4 4,0 0,4 -4,0"
                                      fill="rgba(56, 189, 248, 0.45)"
                                      stroke="#38bdf8"
                                      strokeWidth="1"
                                    />
                                    <circle cx="0" cy="0" r="1" fill="#38bdf8" />
                                  </g>
                                );
                              }

                              return (
                                <g key={`modal-kiep-${kIdx}`} transform={`translate(${xPos}, 0)`}>
                                  <polygon
                                    points="0,-3.5 3.5,0 0,3.5 -3.5,0"
                                    fill="none"
                                    stroke="rgba(255, 255, 255, 0.25)"
                                    strokeWidth="0.8"
                                  />
                                </g>
                              );
                            })}
                          </g>
                        </svg>

                        <div style={{
                          position: 'absolute',
                          bottom: 10,
                          padding: '3px 14px',
                          borderRadius: 20,
                          background: 'rgba(0, 0, 0, 0.88)',
                          border: `1px solid ${tierInfo.color || 'rgba(251, 191, 36, 0.5)'}`,
                          fontSize: 11,
                          fontWeight: 800,
                          color: isMax ? 'var(--color-kim)' : (canTribulate ? '#f0abfc' : '#38bdf8')
                        }}>
                          {isMax ? '👑 ĐẠO ANH ĐẠI VIÊN MÃN (5/5 KIẾP)' : `⚡ NGUYÊN ANH KIẾP THỨ ${curKiep} (${canTribulate ? 'ĐÃ ĐẠT ≥80% SẴN SÀNG ĐỘ KIẾP' : 'ĐANG TÍCH LŨY LINH LỰC'})`}
                        </div>
                      </div>

                      {/* Thông tin Lore & Phần thưởng Thiên Mệnh */}
                      <div style={{ background: 'rgba(15, 23, 42, 0.6)', borderRadius: 10, padding: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-kim)', marginBottom: 6 }}>
                          📜 Bản Nguyên Bí Lục
                        </div>
                        <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
                          {modalArch.name} là Đạo Anh pháp thân tối thượng thai nghén từ căn cơ thiên địa, trải qua 5 tầng Thiên Kiếp tôi luyện để chứng đạo Đại Viên Mãn.
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 12 }}>
                          <span style={{ color: '#94a3b8' }}>Thiên Mệnh Thưởng Độ Kiếp Kế Tiếp:</span>
                          <span style={{ color: '#fde047', fontWeight: 800 }}>+{earnedTMOnSuccess.toLocaleString()} TM</span>
                        </div>
                      </div>

                      {/* Thanh Tiến Độ EXP Linh Lực */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                          <span style={{ color: '#94a3b8' }}>Tiến Độ Tích Lũy Linh Lực Kiếp Thần:</span>
                          <span style={{ color: isMax ? '#fde047' : '#38bdf8', fontWeight: 800 }}>
                            {curExp.toLocaleString()} / {maxExp.toLocaleString()} ({percent}%)
                          </span>
                        </div>
                        <div style={{ height: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 5, overflow: 'hidden' }}>
                          <div style={{
                            width: `${percent}%`,
                            height: '100%',
                            background: isMax 
                              ? 'linear-gradient(90deg, #f59e0b, #fde047)' 
                              : (canTribulate ? 'linear-gradient(90deg, #c084fc, #f0abfc)' : 'linear-gradient(90deg, #0284c7, #38bdf8)'),
                            borderRadius: 5,
                            transition: 'width 0.4s ease'
                          }} />
                        </div>
                      </div>

                      {/* Các Nút Thao Tác: Bơm Linh Lực / Độ Kiếp */}
                      {!isMax && (
                        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                          <button
                            onClick={() => {
                              if (typeof injectThienMenh === 'function') {
                                injectThienMenh(matchedDaoAnh.id || matchedDaoAnh.palaceIndex, 1000);
                              }
                            }}
                            style={{
                              flex: 1,
                              padding: '10px 14px',
                              borderRadius: 8,
                              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2) 0%, rgba(14, 165, 233, 0.4) 100%)',
                              border: '1px solid #38bdf8',
                              color: '#ffffff',
                              fontSize: 12,
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            ⚡ Quán Chú 1.000 Thiên Mệnh
                          </button>

                          {canTribulate && (
                            <button
                              onClick={() => {
                                if (typeof attemptTribulationAll === 'function') {
                                  attemptTribulationAll();
                                }
                              }}
                              style={{
                                flex: 1,
                                padding: '10px 14px',
                                borderRadius: 8,
                                background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
                                border: '1px solid #f0abfc',
                                color: '#ffffff',
                                fontSize: 12,
                                fontWeight: 900,
                                cursor: 'pointer',
                                boxShadow: '0 0 15px rgba(240, 171, 252, 0.5)'
                              }}
                            >
                              ⚡ Tiến Hành Độ Kiếp ({percent}%)
                            </button>
                          )}
                        </div>
                      )}

                    </div>
                  </div>
                </div>
              );
            })()}

          </div>
        );      })()}
      {/* ========================================================
          MODAL KHẢM NẠM VẬT TRẤN ÁP (KHI THIÊN CUNG ĐẠT 99.99%)
         ======================================================== */}
      {anchorModalPalace !== null && (
        <div
          onClick={() => setAnchorModalPalace(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 640,
              maxHeight: '85vh',
              background: 'linear-gradient(180deg, #0f172a 0%, #030712 100%)',
              border: '1.5px solid rgba(251, 191, 36, 0.6)',
              borderRadius: 16,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 0 50px rgba(0, 0, 0, 0.9), 0 0 30px rgba(251, 191, 36, 0.3)'
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(15, 23, 42, 0.9)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>👑</span>
                <div>
                  <h3 style={{ margin: 0, color: 'var(--color-kim)', fontSize: 16, fontFamily: 'var(--font-serif)', fontWeight: 900 }}>
                    KHẢM NẠM VẬT TRẤN ÁP · THIÊN CUNG TỰ THÂN #{anchorModalPalace + 1}
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#94a3b8' }}>
                    Thiên cung đã tích lũy 99.99% linh lực! Hãy chọn một Bảo Vật trong Túi Trữ Vật để trấn áp, hoàn tất 100% Cung Thật (+1 Cung chiến lực).
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAnchorModalPalace(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Danh sách vật phẩm có trong túi */}
            <div style={{ padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(cultivation?.inventoryArtifacts || []).length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '36px 20px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  borderRadius: 12,
                  border: '1px dashed rgba(251, 191, 36, 0.3)'
                }}>
                  <span style={{ fontSize: 36, display: 'block', marginBottom: 10 }}>📦</span>
                  <p style={{ color: '#fde047', fontWeight: 800, fontSize: 14, margin: '0 0 6px' }}>
                    Trong Túi Trữ Vật chưa có Vật Trấn Áp nào!
                  </p>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 16px', lineHeight: 1.5 }}>
                    Đạo hữu có thể đọc thêm các chương truyện để kỳ ngộ nhận bảo vật, hoặc đổi bằng Tiên Tinh trong Tàng Bảo Điện.
                  </p>
                </div>
              ) : (
                (cultivation?.inventoryArtifacts || []).map((artId, idx) => {
                  const art = (SUPPRESSING_ARTIFACTS || []).find(a => a.id === artId);
                  if (!art) return null;
                  const tierInfo = LAMP_TIERS[art.tier] || LAMP_TIERS.ha_pham;

                  return (
                    <div
                      key={`art-card-${artId}-${idx}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderRadius: 10,
                        background: 'rgba(15, 23, 42, 0.65)',
                        border: `1.5px solid ${tierInfo.border || 'rgba(255, 255, 255, 0.15)'}`,
                        boxShadow: `0 0 15px ${tierInfo.color}22`,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        gap: 12
                      }}
                      onClick={() => {
                        try {
                          if (anchorPalace) {
                            anchorPalace(anchorModalPalace, art.id);
                          }
                          setAnchorModalPalace(null);
                        } catch (e) {
                          alert(e.message || 'Không thể khảm nạm.');
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 26 }}>{art.icon || '👑'}</span>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <strong style={{ color: tierInfo.color || '#fde047', fontSize: 13.5 }}>
                              {art.name}
                            </strong>
                            <span style={{
                              fontSize: 9.5,
                              padding: '2px 8px',
                              borderRadius: 10,
                              fontWeight: 800,
                              color: tierInfo.color,
                              background: tierInfo.bg || 'rgba(255,255,255,0.06)',
                              border: `1px solid ${tierInfo.border || tierInfo.color}`
                            }}>
                              {tierInfo.name || art.tier}
                            </span>
                          </div>
                          <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                            {art.type} {art.poem ? `· "${art.poem}"` : ''}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          try {
                            if (anchorPalace) {
                              anchorPalace(anchorModalPalace, art.id);
                            }
                            setAnchorModalPalace(null);
                          } catch (err) {
                            alert(err.message || 'Không thể khảm nạm.');
                          }
                        }}
                        style={{
                          padding: '7px 16px',
                          borderRadius: 8,
                          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                          border: '1px solid #fde047',
                          color: '#000000',
                          fontWeight: 900,
                          fontSize: 12,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          boxShadow: '0 0 10px rgba(251, 191, 36, 0.4)'
                        }}
                      >
                        👑 Khảm Nạm
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
