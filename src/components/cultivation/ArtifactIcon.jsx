/**
 * ArtifactIcon.jsx
 * Renders a premium icon for any artifact or lamp item.
 * - Thần Phẩm with AI image → <img> with glow (7 items)
 * - Remaining 9 Thần Phẩm items → Dedicated custom SVG art
 * - Lower tiers → SVG tier shapes
 * - Mệnh Đăng (lamp) → animated flame lantern SVG
 */

import React from 'react';
import styles from './ArtifactIcon.module.css';
import { THAN_PHAM_AI_ICONS, TIER_COLORS, TIER_GLOW } from '../../lib/artifactIcons';

// ─── DEDICATED SVG ART FOR THE 9 THẦN PHẨM ITEMS WITHOUT AI IMAGES ───────────

/** 1. Thiên Đạo Vận Mệnh Châu (Cosmic Fate Orb) */
function SvgVanMenhChau({ color, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <radialGradient id="vmcGrad" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95"/>
          <stop offset="45%" stopColor="#c084fc" stopOpacity="0.85"/>
          <stop offset="85%" stopColor="#6b21a8" stopOpacity="0.95"/>
          <stop offset="100%" stopColor="#1e1b4b" stopOpacity="1"/>
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="14" stroke="#e9d5ff" strokeWidth="0.8" strokeOpacity="0.6" />
      <circle cx="16" cy="16" r="12" fill="url(#vmcGrad)" />
      {/* Orbiting fate ring */}
      <ellipse cx="16" cy="16" rx="13" ry="5" stroke="#fef08a" strokeWidth="1" strokeDasharray="3 2" transform="rotate(-25 16 16)" />
      {/* Center fate sparkle */}
      <circle cx="13" cy="12" r="2" fill="#fff" opacity="0.9" />
      <path d="M16 8 Q19 14 22 17" stroke="#f472b6" strokeWidth="0.8" opacity="0.8" />
    </svg>
  );
}

/** 2. Tạo Hóa Ngọc Điệp Tàn Phiến (Jade Tablet Fragment) */
function SvgNgocDiep({ color, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="ndGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a7f3d0" />
          <stop offset="50%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
      </defs>
      {/* Broken Jade Fragment shape */}
      <polygon points="8,4 24,3 28,15 22,28 10,27 4,16" fill="url(#ndGrad)" stroke="#fef08a" strokeWidth="1.2" />
      {/* Glowing crack lines */}
      <path d="M12,5 L16,14 L20,26" stroke="#fef08a" strokeWidth="1" strokeLinecap="round" opacity="0.9" />
      <path d="M16,14 L26,16" stroke="#fef08a" strokeWidth="0.8" opacity="0.8" />
      {/* Dao Runes dots */}
      <circle cx="11" cy="10" r="1" fill="#fff" />
      <circle cx="21" cy="9" r="1" fill="#fff" />
      <circle cx="14" cy="21" r="1" fill="#fff" />
    </svg>
  );
}

/** 3. Vạn Cổ Bất Hủ Đỉnh (Eternal Cauldron) */
function SvgBatHuDinh({ color, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="bhdGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="60%" stopColor="#b45309" />
          <stop offset="100%" stopColor="#451a03" />
        </linearGradient>
      </defs>
      {/* Cauldron Handles */}
      <path d="M4 11 C4 6, 8 6, 8 11" stroke="#fef08a" strokeWidth="1.5" fill="none" />
      <path d="M28 11 C28 6, 24 6, 24 11" stroke="#fef08a" strokeWidth="1.5" fill="none" />
      {/* Main Cauldron Body */}
      <path d="M7 11 H25 L23 23 C23 26, 9 26, 9 23 Z" fill="url(#bhdGrad)" stroke="#fef08a" strokeWidth="1" />
      {/* Legs */}
      <rect x="9" y="23" width="2.5" height="5" rx="1" fill="#b45309" />
      <rect x="20.5" y="23" width="2.5" height="5" rx="1" fill="#b45309" />
      {/* Divine Fire Inside */}
      <path d="M16 6 Q19 11 16 14 Q13 11 16 6 Z" fill="#ef4444" opacity="0.9" />
      <circle cx="16" cy="11" r="1.5" fill="#fef08a" />
    </svg>
  );
}

/** 4. Thiên Đạo Sơ Tâm Quyết (Heavenly Primal Heart) */
function SvgSoTamQuyet({ color, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <radialGradient id="stqGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#f43f5e" />
          <stop offset="90%" stopColor="#881337" />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="14" stroke="#fecdd3" strokeWidth="0.8" strokeDasharray="4 2" />
      {/* Pulsing divine core */}
      <circle cx="16" cy="16" r="9" fill="url(#stqGrad)" />
      {/* Orbiting Seal rings */}
      <polygon points="16,3 20,16 16,29 12,16" stroke="#fef08a" strokeWidth="0.8" fill="none" opacity="0.8" />
      <polygon points="3,16 16,20 29,16 16,12" stroke="#fef08a" strokeWidth="0.8" fill="none" opacity="0.8" />
      <circle cx="16" cy="16" r="3" fill="#fff" />
    </svg>
  );
}

/** 5. Khởi Nguyên Thế Giới Mộc (World Tree Branch) */
function SvgTheGioiMoc({ color, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="tgmGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#78350f" />
          <stop offset="60%" stopColor="#15803d" />
          <stop offset="100%" stopColor="#86efac" />
        </linearGradient>
      </defs>
      {/* Main branch */}
      <path d="M6 26 C10 22, 14 18, 18 13 C22 8, 24 5, 27 4" stroke="url(#tgmGrad)" strokeWidth="3" strokeLinecap="round" />
      {/* Offshoot twig */}
      <path d="M14 18 C16 14, 18 12, 23 10" stroke="url(#tgmGrad)" strokeWidth="2" strokeLinecap="round" />
      {/* Glowing Leaf Orbs */}
      <circle cx="27" cy="4" r="3.5" fill="#4ade80" />
      <circle cx="27" cy="4" r="1.5" fill="#fff" />
      <circle cx="23" cy="10" r="3" fill="#fef08a" />
      <circle cx="18" cy="13" r="2.5" fill="#60a5fa" />
    </svg>
  );
}

/** 6. Túc Mệnh Thần Tỏa (Fate Divine Chain) */
function SvgTucMenhToa({ color, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* Interlocking Chain links */}
      <rect x="5" y="11" width="12" height="10" rx="5" stroke="#fef08a" strokeWidth="2.5" fill="none" transform="rotate(-20 11 16)" />
      <rect x="15" y="11" width="12" height="10" rx="5" stroke="#ef4444" strokeWidth="2.5" fill="none" transform="rotate(20 21 16)" />
      <circle cx="16" cy="16" r="2" fill="#fff" />
      {/* Sparks */}
      <path d="M16 8 L16 4 M16 28 L16 24 M8 16 L4 16 M28 16 L24 16" stroke="#fef08a" strokeWidth="1" />
    </svg>
  );
}

/** 7. Đại La Thiên Cương Chướng (Empyrean Celestial Shield) */
function SvgThienCuongChuong({ color, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <radialGradient id="tccGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="50%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0369a1" />
        </radialGradient>
      </defs>
      {/* Concentric Shield circles */}
      <circle cx="16" cy="16" r="14" stroke="#7dd3fc" strokeWidth="1.2" fill="rgba(3,105,161,0.25)" />
      <circle cx="16" cy="16" r="11" stroke="#fef08a" strokeWidth="0.8" strokeDasharray="6 3" />
      <polygon points="16,6 24.66,21 7.34,21" stroke="#e0f2fe" strokeWidth="1" fill="none" opacity="0.8" />
      <polygon points="16,26 7.34,11 24.66,11" stroke="#e0f2fe" strokeWidth="1" fill="none" opacity="0.8" />
      <circle cx="16" cy="16" r="5" fill="url(#tccGrad)" />
    </svg>
  );
}

/** 8. Khởi Nguyên Thời Không Thần Thuật (Spacetime Hourglass/Vortex) */
function SvgThoiKhongChau({ color, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="tkcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="50%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#e879f9" />
        </linearGradient>
      </defs>
      {/* Hourglass shape */}
      <polygon points="7,5 25,5 16,16 25,27 7,27 16,16" fill="url(#tkcGrad)" opacity="0.85" stroke="#fef08a" strokeWidth="1" />
      {/* Top & Bottom caps */}
      <line x1="5" y1="5" x2="27" y2="5" stroke="#fef08a" strokeWidth="2" strokeLinecap="round" />
      <line x1="5" y1="27" x2="27" y2="27" stroke="#fef08a" strokeWidth="2" strokeLinecap="round" />
      {/* Center time point spark */}
      <circle cx="16" cy="16" r="2.5" fill="#fff" />
    </svg>
  );
}

/** 9. Đại Đạo Tiêu Dao Thiên (Wandering Heaven Scroll) */
function SvgTieuDaoThien({ color, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id="tdtGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>
      {/* Open Scroll Body */}
      <path d="M6 8 C10 6, 22 6, 26 8 L26 24 C22 22, 10 22, 6 24 Z" fill="url(#tdtGrad)" stroke="#fff" strokeWidth="0.8" />
      {/* Scroll Rollers */}
      <rect x="4" y="6" width="3" height="20" rx="1.5" fill="#78350f" stroke="#fef08a" strokeWidth="0.8" />
      <rect x="25" y="6" width="3" height="20" rx="1.5" fill="#78350f" stroke="#fef08a" strokeWidth="0.8" />
      {/* Celestial Lotus Symbol inside */}
      <circle cx="16" cy="15" r="3.5" fill="#ef4444" opacity="0.9" />
      <circle cx="16" cy="15" r="1.5" fill="#fff" />
    </svg>
  );
}


// ─── TIER SHAPES (LOWER TIERS) ─────────────────────────────────────────────

function SvgHaPham({ color, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <radialGradient id="hpGrad" cx="38%" cy="32%" r="65%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.9"/>
          <stop offset="50%" stopColor={color} stopOpacity="0.7"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.25"/>
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="13" fill="url(#hpGrad)" />
      <circle cx="11" cy="11" r="3.5" fill="white" fillOpacity="0.45"/>
    </svg>
  );
}

function SvgTrungPham({ color, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <radialGradient id="tpGrad" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.4"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.9"/>
        </radialGradient>
      </defs>
      <polygon
        points="16,3 25,7 29,16 25,25 16,29 7,25 3,16 7,7"
        fill="url(#tpGrad)"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.8"
      />
      <circle cx="16" cy="16" r="5" fill={color} fillOpacity="0.35"/>
      <circle cx="16" cy="16" r="2" fill={color} fillOpacity="0.85"/>
      <circle cx="12" cy="12" r="2.5" fill="white" fillOpacity="0.3"/>
    </svg>
  );
}

function SvgThuongPham({ color, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <radialGradient id="spGrad" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55"/>
          <stop offset="100%" stopColor={color} stopOpacity="1"/>
        </radialGradient>
      </defs>
      <polygon
        points="16,2 28,16 16,30 4,16"
        fill="url(#spGrad)"
        stroke={color}
        strokeWidth="1"
        strokeOpacity="0.9"
      />
      <polygon points="16,2 28,16 16,16" fill={color} fillOpacity="0.3"/>
      <polygon points="16,2 4,16 16,16"  fill="white"  fillOpacity="0.15"/>
      <polygon points="16,30 28,16 16,16" fill={color} fillOpacity="0.5"/>
      <circle cx="16" cy="16" r="2.5" fill="white" fillOpacity="0.7"/>
    </svg>
  );
}

function SvgCucPham({ color, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <radialGradient id="cpGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.6"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.9"/>
        </radialGradient>
      </defs>
      {[0,60,120,180,240,300].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const x2 = 16 + 13 * Math.sin(rad);
        const y2 = 16 - 13 * Math.cos(rad);
        const lx = 16 + 4 * Math.sin(rad - 0.35);
        const ly = 16 - 4 * Math.cos(rad - 0.35);
        const rx = 16 + 4 * Math.sin(rad + 0.35);
        const ry = 16 - 4 * Math.cos(rad + 0.35);
        return (
          <polygon
            key={i}
            points={`${lx},${ly} ${x2},${y2} ${rx},${ry}`}
            fill="url(#cpGrad)"
            stroke={color}
            strokeWidth="0.5"
            strokeOpacity="0.7"
          />
        );
      })}
      <circle cx="16" cy="16" r="5" fill={color} fillOpacity="0.55"/>
      <circle cx="16" cy="16" r="2.5" fill="white" fillOpacity="0.8"/>
    </svg>
  );
}

function SvgTienPham({ color, size }) {
  const pts = Array.from({ length: 8 }, (_, i) => {
    const outer = (i * Math.PI) / 4;
    const inner = outer + Math.PI / 8;
    const ox = 16 + 13 * Math.cos(outer - Math.PI/2);
    const oy = 16 + 13 * Math.sin(outer - Math.PI/2);
    const ix = 16 + 6 * Math.cos(inner - Math.PI/2);
    const iy = 16 + 6 * Math.sin(inner - Math.PI/2);
    return `${ox},${oy} ${ix},${iy}`;
  }).join(' ');

  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <radialGradient id="tiGrad" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.7"/>
          <stop offset="100%" stopColor={color} stopOpacity="1"/>
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15" stroke={color} strokeWidth="0.8" strokeOpacity="0.4" fill="none"/>
      <polygon points={pts} fill="url(#tiGrad)" stroke={color} strokeWidth="0.5" strokeOpacity="0.9"/>
      <circle cx="16" cy="16" r="3" fill="white" fillOpacity="0.9"/>
    </svg>
  );
}

function SvgThanPhamFallback({ color, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <defs>
        <radialGradient id="thGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.3"/>
          <stop offset="40%" stopColor={color} stopOpacity="0.8"/>
          <stop offset="100%" stopColor="#1a0000" stopOpacity="0.9"/>
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="15" stroke={color} strokeWidth="1.5" strokeOpacity="0.7" fill="none"/>
      <circle cx="16" cy="16" r="12" fill="url(#thGrad)"/>
      {[0,90,180,270].map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const x = 16 + 7 * Math.cos(rad);
        const y = 16 + 7 * Math.sin(rad);
        return <circle key={i} cx={x} cy={y} r="1.5" fill={color} fillOpacity="0.6"/>;
      })}
      <circle cx="16" cy="16" r="3" fill={color} fillOpacity="0.9"/>
      <circle cx="16" cy="16" r="1.5" fill="white" fillOpacity="0.8"/>
    </svg>
  );
}

// Animated flame lantern SVG for Mệnh Đăng lamps
function SvgLamp({ color, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={styles.lampSvg}>
      <defs>
        <radialGradient id="lampGlow" cx="50%" cy="60%" r="55%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.9"/>
          <stop offset="50%" stopColor={color} stopOpacity="0.7"/>
          <stop offset="100%" stopColor={color} stopOpacity="0.0"/>
        </radialGradient>
      </defs>
      <path d="M11,10 Q10,16 11,22 Q16,26 21,22 Q22,16 21,10 Z" fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1" strokeOpacity="0.7"/>
      <rect x="14" y="5" width="4" height="5" rx="1" fill={color} fillOpacity="0.8"/>
      <rect x="15" y="22" width="2" height="5" rx="1" fill={color} fillOpacity="0.6"/>
      <ellipse cx="16" cy="17" rx="4" ry="5" fill="url(#lampGlow)"/>
      <path d="M16,12 Q18,15 16,19 Q14,15 16,12Z" fill="#fff" fillOpacity="0.85" className={styles.flamePath}/>
      <line x1="11" y1="14" x2="21" y2="14" stroke={color} strokeWidth="0.8" strokeOpacity="0.6"/>
      <line x1="11" y1="19" x2="21" y2="19" stroke={color} strokeWidth="0.8" strokeOpacity="0.6"/>
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * @param {object} props
 * @param {object} props.item        - artifact or lamp object { id, tier, color, icon }
 * @param {boolean} props.isLamp     - true if this is a Mệnh Đăng lamp palace
 * @param {number}  [props.size=28]  - icon size in px
 * @param {string}  [props.className]
 */
export default function ArtifactIcon({ item, isLamp = false, size = 28, className = '' }) {
  const tier  = item?.tier  || 'ha_pham';
  const color = item?.color || TIER_COLORS[tier] || '#94a3b8';
  const glow  = TIER_GLOW[tier]  || 'rgba(148,163,184,0.5)';

  // Mệnh Đăng → flame lantern
  if (isLamp) {
    const lampColor = item?.color || '#a855f7';
    const lampGlow  = `rgba(168,85,247,0.6)`;
    return (
      <span
        className={`${styles.iconWrapper} ${styles.lampWrapper} ${className}`}
        style={{ '--icon-glow': lampGlow, width: size, height: size }}
        title={item?.name || 'Mệnh Đăng'}
      >
        <SvgLamp color={lampColor} size={size} />
      </span>
    );
  }

  // Thần Phẩm with AI image
  if (tier === 'than_pham' && item?.id && THAN_PHAM_AI_ICONS[item.id]) {
    return (
      <span
        className={`${styles.iconWrapper} ${styles.imgWrapper} ${className}`}
        style={{ '--icon-glow': glow, width: size, height: size }}
        title={item?.name}
      >
        <img
          src={THAN_PHAM_AI_ICONS[item.id]}
          alt={item?.name}
          className={styles.aiImg}
          style={{ width: size, height: size }}
        />
      </span>
    );
  }

  // Check for dedicated Thần Phẩm SVG icon components
  if (tier === 'than_pham' && item?.id) {
    const svgProps = { color, size };
    let DedicatedSvg = null;
    switch (item.id) {
      case 'van_menh_chau':      DedicatedSvg = SvgVanMenhChau;      break;
      case 'ngoc_diep':          DedicatedSvg = SvgNgocDiep;          break;
      case 'bat_hu_dinh':        DedicatedSvg = SvgBatHuDinh;        break;
      case 'thien_dao_an':
      case 'so_tam_quyet':       DedicatedSvg = SvgSoTamQuyet;       break;
      case 'khoi_nguyen_moc':    DedicatedSvg = SvgTheGioiMoc;      break;
      case 'tuc_menh_toa':       DedicatedSvg = SvgTucMenhToa;       break;
      case 'dai_la_chuong':      DedicatedSvg = SvgThienCuongChuong; break;
      case 'thoi_khong_chau':    DedicatedSvg = SvgThoiKhongChau;    break;
      case 'dai_dao_tieu_dao':  DedicatedSvg = SvgTieuDaoThien;     break;
      default: break;
    }

    if (DedicatedSvg) {
      return (
        <span
          className={`${styles.iconWrapper} ${styles.svgWrapper} ${className}`}
          style={{ '--icon-glow': glow, '--icon-color': color, width: size, height: size }}
          title={item?.name}
        >
          <DedicatedSvg {...svgProps} />
        </span>
      );
    }
  }

  // Generic SVG art by tier
  const svgProps = { color, size };
  let SvgComp;
  switch (tier) {
    case 'than_pham':   SvgComp = SvgThanPhamFallback; break;
    case 'tien_pham':   SvgComp = SvgTienPham;         break;
    case 'cuc_pham':    SvgComp = SvgCucPham;           break;
    case 'thuong_pham': SvgComp = SvgThuongPham;        break;
    case 'trung_pham':  SvgComp = SvgTrungPham;         break;
    default:            SvgComp = SvgHaPham;            break;
  }

  return (
    <span
      className={`${styles.iconWrapper} ${styles.svgWrapper} ${className}`}
      style={{ '--icon-glow': glow, '--icon-color': color, width: size, height: size }}
      title={item?.name}
    >
      <SvgComp {...svgProps} />
    </span>
  );
}
