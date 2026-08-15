import React, { useMemo } from 'react';
import { LIFE_LAMPS, LAMP_TIERS, SUPPRESSING_ARTIFACTS, getPalaceNameFromArtifact, getPalaceElementTheme, getLampPalaceName, formatDaoAnhTitle, getDaoAnhTheme } from '../../lib/cultivation';
import ArtifactIcon from './ArtifactIcon';
import styles from './RealmPreviewVisualizer.module.css';

/**
 * RealmPreviewVisualizer — Bộ Hoạt Ảnh Tu Vi Chuyên Biệt Theo Từng Cảnh Giới:
 * 1. Ngưng Khí: Khí Hải Đan Điền & 10 Vòng Linh Mạch luân chuyển.
 * 2. Trúc Cơ: Tu sĩ tĩnh tọa giữa Tinh Đồ 120 Pháp Khiếu + 4 Vị Trí Lơ Lửng (Hỏa / Đăng) + Cực Cảnh 121 trên đỉnh đầu.
 * 3. Kim Đan: Kim Đan trung tâm + Thiên Cung từ Hư Ảo chuyển sang Hóa Thực Hoàng Kim.
 * 4. Nguyên Anh: Thiên Cung mở cửa, Đạo Anh Thần Thể tĩnh tọa với Vòng Hào Quang 5 Kiếp Luân Hồi.
 */
export default function RealmPreviewVisualizer({
  cultivation,
  onSetAnchorModalPalace,
  onThangCung,
  onManifestDaoAnh,
  onInjectExpToDaoAnh,
  onInjectThienMenh,
}) {
  const realm = cultivation?.realm || 'ngung_khi';
  const phapKhieu = cultivation?.phapKhieu || 0;
  const selfHoa = cultivation?.selfMenhHoa || Math.floor(phapKhieu / 30);
  const has121st = !!cultivation?.has121st;
  const absorbedLamps = cultivation?.absorbedLamps || [];
  const absorbedCount = absorbedLamps.length;
  const ngungKhiLevel = cultivation?.ngungKhiLevel || 1;
  const maxThienCung = cultivation?.maxThienCung || 6;
  const lampPalaceCount = (cultivation?.absorbedLamps || []).length;
  const realizedThienCung = cultivation?.realizedThienCung || 0;
  const daoAnhs = cultivation?.daoAnhs || [];

  // Calculate target Palace EXP for current active self palace
  const targetPalaceExp = cultivation?.targetPalaceExp || 2000;
  const bottleneckExp = targetPalaceExp - 1;

  // Tạo danh sách 120 điểm sao tinh đồ theo 4 Đại Chòm Tứ Tượng đối xứng hoàn hảo
  const { constellationStars, constellationPaths, quadrantList } = useMemo(() => {
    const stars = [];
    const paths = [];
    const arms = 4;
    const starsPerArm = 30;

    const QUADRANTS = [
      { id: 'thanh_long', name: 'Thanh Long', range: '1-30',   color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.9)', startAngle: -125, endAngle: -155, icon: '🐉' },
      { id: 'chu_tuoc',   name: 'Chu Tước',   range: '31-60',  color: '#f97316', glow: 'rgba(249, 115, 22, 0.9)',  startAngle: -55,  endAngle: -25,  icon: '🦅' },
      { id: 'bach_ho',    name: 'Bạch Hổ',    range: '61-90',  color: '#fef08a', glow: 'rgba(254, 240, 138, 0.9)', startAngle: 125,  endAngle: 155,  icon: '🐅' },
      { id: 'huyen_vu',   name: 'Huyền Vũ',   range: '91-120', color: '#c084fc', glow: 'rgba(192, 132, 252, 0.9)', startAngle: 55,   endAngle: 25,   icon: '🐢' },
    ];

    for (let a = 0; a < arms; a++) {
      const q = QUADRANTS[a];
      const armPoints = [];
      const litCount = Math.max(0, Math.min(starsPerArm, phapKhieu - a * starsPerArm));
      const isArmComplete = litCount === starsPerArm;

      for (let s = 0; s < starsPerArm; s++) {
        const progress = s / (starsPerArm - 1);
        const radius = 40 + progress * 68;
        const currentAngleDeg = q.startAngle + progress * (q.endAngle - q.startAngle);
        const currentAngleRad = (currentAngleDeg * Math.PI) / 180;

        const cx = 160 + Math.cos(currentAngleRad) * radius;
        const cy = 165 + Math.sin(currentAngleRad) * radius;

        const idx = a * starsPerArm + s; // 0 đến 119
        const isLit = idx < phapKhieu;
        const isMilestone = (s + 1) % 10 === 0;

        stars.push({
          idx,
          armIndex: a,
          quadrant: q,
          starNum: idx + 1,
          cx: Number(cx.toFixed(1)),
          cy: Number(cy.toFixed(1)),
          isLit,
          isMilestone,
        });

        armPoints.push(`${cx.toFixed(1)},${cy.toFixed(1)}`);
      }

      paths.push({
        armIndex: a,
        quadrant: q,
        d: `M ${armPoints.join(' L ')}`,
        isAnyLit: phapKhieu > a * starsPerArm,
        isComplete: isArmComplete,
        litCount,
      });
    }

    return { constellationStars: stars, constellationPaths: paths, quadrantList: QUADRANTS };
  }, [phapKhieu]);

  // 4 Vị Trí Xung Quanh (Tây Bắc, Đông Bắc, Tây Nam, Đông Nam)
  const surroundingSlots = useMemo(() => {
    const slots = [
      { id: 'pos_1', name: 'Thanh Long (Tây Bắc)', posClass: styles.slotTopLeft, quadIdx: 0 },
      { id: 'pos_2', name: 'Chu Tước (Đông Bắc)', posClass: styles.slotTopRight, quadIdx: 1 },
      { id: 'pos_3', name: 'Bạch Hổ (Tây Nam)', posClass: styles.slotBottomLeft, quadIdx: 2 },
      { id: 'pos_4', name: 'Huyền Vũ (Đông Nam)', posClass: styles.slotBottomRight, quadIdx: 3 },
    ];

    return slots.map((slot, index) => {
      const lampId = absorbedLamps[index];
      const q = quadrantList[index];
      if (lampId) {
        const lamp = LIFE_LAMPS.find(l => l.id === lampId);
        const tier = lamp ? (LAMP_TIERS[lamp.tier] || LAMP_TIERS.ha_pham) : null;
        return {
          ...slot,
          type: 'lamp',
          isLit: true,
          lampObj: lamp,
          icon: lamp?.icon || '🏮',
          title: lamp?.shortName || lamp?.name || 'Mệnh Đăng',
          tierName: tier?.name,
          color: tier?.color || q?.color || '#ffcc00',
          glow: tier?.border || q?.glow || 'rgba(255, 204, 0, 0.8)',
          bg: tier?.bg,
        };
      }

      const fireIndex = index + 1;
      const isFireLit = selfHoa >= fireIndex;
      return {
        ...slot,
        type: 'fire',
        isLit: isFireLit,
        icon: isFireLit ? '🔥' : '🕯️',
        title: `Mệnh Hỏa ${fireIndex}`,
        tierName: isFireLit ? 'Đã Thắp' : `${(fireIndex - 1) * 30 + 1}-${fireIndex * 30}`,
        color: isFireLit ? q?.color || '#f97316' : 'rgba(255, 255, 255, 0.3)',
        glow: isFireLit ? q?.glow || 'rgba(249, 115, 22, 0.85)' : 'none',
      };
    });
  }, [absorbedLamps, selfHoa, quadrantList]);

  // Nếu có Mệnh Đăng thứ 5 (vị trí phụ dưới chân tọa đài)
  const fifthLamp = useMemo(() => {
    if (absorbedLamps.length >= 5) {
      const lampId = absorbedLamps[4];
      const lamp = LIFE_LAMPS.find(l => l.id === lampId);
      const tier = lamp ? (LAMP_TIERS[lamp.tier] || LAMP_TIERS.ha_pham) : null;
      return {
        lampObj: lamp,
        icon: lamp?.icon || '🏮',
        title: lamp?.shortName || lamp?.name || 'Mệnh Đăng 5',
        color: tier?.color || '#ffcc00',
        glow: tier?.border || 'rgba(255, 204, 0, 0.8)',
        bg: tier?.bg,
      };
    }
    return null;
  }, [absorbedLamps]);

  return (
    <div className={`${styles.visualizerWrapper} ${realm === 'truc_co' ? styles.visualizerWrapperTrucCo : (realm === 'kim_dan' || realm === 'gia_anh' || realm === 'nguyen_anh') ? styles.visualizerWrapperTall : ''}`}>
      {/* ========================================================
          1. NGƯNG KHÍ VISUALIZER
         ======================================================== */}
      {realm === 'ngung_khi' && (
        <div className={styles.ngungKhiStage}>
          <div className={styles.danDienVortex}>
            <div className={styles.danDienCore} />
            <div className={styles.danDienAura} />
            <div className={styles.danDienLightning} />
          </div>

          {/* 10 Meridian Orbit Rings */}
          <div className={styles.meridianRings}>
            {Array.from({ length: 10 }).map((_, i) => {
              const layer = i + 1;
              const isReached = ngungKhiLevel >= layer;
              const isCurrent = ngungKhiLevel === layer;
              return (
                <div
                  key={layer}
                  className={`${styles.meridianRing} ${isReached ? styles.ringReached : ''} ${isCurrent ? styles.ringCurrent : ''}`}
                  style={{
                    width: `${50 + layer * 18}px`,
                    height: `${50 + layer * 18}px`,
                    animationDelay: `${i * 0.15}s`,
                  }}
                >
                  {isCurrent && <div className={styles.ringSpark} />}
                </div>
              );
            })}
          </div>

          <div className={styles.stageStatusBadge}>
            <span>⚡ KHÍ HẢI TẦNG {ngungKhiLevel}/10</span>
          </div>
        </div>
      )}

      {/* ========================================================
          2. TRÚC CƠ VISUALIZER: TINH ĐỒ PHÁP KHIẾU TỨ TƯỢNG & 4 HỎA/ĐĂNG
         ======================================================== */}
      {realm === 'truc_co' && (
        <div className={styles.trucCoStage}>
          {/* A. BỨC TINH ĐỒ CỬU THIÊN (CELESTIAL STAR CHART BACKGROUND) */}
          <div className={styles.starChartBackdrop}>
            <svg viewBox="0 0 320 330" className={styles.starChartSvg}>
              <defs>
                <radialGradient id="starChartGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#00f2fe" stopOpacity="0.2" />
                  <stop offset="50%" stopColor="#0284c7" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                </radialGradient>

                <linearGradient id="daoistBodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.95" />
                  <stop offset="60%" stopColor="#0284c7" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0.95" />
                </linearGradient>

                {/* Glow Filters */}
                <filter id="starGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Vòng Thiên Bàn Tinh Cầu (Concentric Celestial Rings) */}
              <circle cx="160" cy="165" r="115" fill="url(#starChartGlow)" stroke="rgba(56, 189, 248, 0.18)" strokeWidth="1" strokeDasharray="3,4" />
              <circle cx="160" cy="165" r="82" stroke="rgba(56, 189, 248, 0.12)" strokeWidth="0.8" strokeDasharray="2,3" />
              <circle cx="160" cy="165" r="42" stroke="rgba(56, 189, 248, 0.22)" strokeWidth="0.8" />

              {/* 4 Đường Tinh Mạch Xoắn Ốc Nối Sao */}
              {constellationPaths.map((path) => (
                <path
                  key={path.armIndex}
                  d={path.d}
                  fill="none"
                  stroke={path.isAnyLit ? path.quadrant.color : 'rgba(255, 255, 255, 0.1)'}
                  strokeWidth={path.isComplete ? 2 : path.isAnyLit ? 1.4 : 0.8}
                  strokeDasharray={path.isComplete ? 'none' : '2, 3'}
                  opacity={path.isComplete ? 0.95 : path.isAnyLit ? 0.75 : 0.2}
                />
              ))}

              {/* 120 Ngôi Sao Pháp Khiếu */}
              {constellationStars.map((star) => (
                <circle
                  key={star.idx}
                  cx={star.cx}
                  cy={star.cy}
                  r={star.isLit ? (star.isMilestone ? 3.5 : 2.5) : 1.4}
                  fill={star.isLit ? star.quadrant.color : 'rgba(255, 255, 255, 0.18)'}
                  filter={star.isLit ? 'url(#starGlow)' : 'none'}
                  className={`${styles.starDot} ${star.isLit ? styles.starLit : styles.starDim}`}
                  style={{
                    '--star-color': star.quadrant.color,
                    animationDelay: `${(star.idx % 12) * 0.12}s`,
                  }}
                />
              ))}

              {/* Tu Sĩ Tĩnh Tọa ở Trung Tâm (Serene Meditating Cultivator) */}
              <g>
                {/* Hào quang thiền định */}
                <ellipse cx="160" cy="165" rx="28" ry="32" fill="rgba(56, 189, 248, 0.08)" stroke="rgba(56, 189, 248, 0.3)" strokeWidth="1" strokeDasharray="3,3" />

                {/* Đầu tu sĩ */}
                <circle cx="160" cy="144" r="7.5" fill="url(#daoistBodyGrad)" stroke="#38bdf8" strokeWidth="1" />

                {/* Thân & Tọa Thiền (Lotus Meditating Silhouette) */}
                <path
                  d="M 160 152 C 153 152, 144 158, 142 166 C 140 174, 134 178, 136 182 C 138 186, 148 186, 160 186 C 172 186, 182 186, 184 182 C 186 178, 180 174, 178 166 C 176 158, 167 152, 160 152 Z"
                  fill="url(#daoistBodyGrad)"
                  stroke="#38bdf8"
                  strokeWidth="1.2"
                />

                {/* Đan Điền Core Vàng Sáng Rực */}
                <circle cx="160" cy="170" r="4.5" fill="#ffcc00" filter="url(#starGlow)" className={styles.daoistDanDien} />
              </g>

              {/* Hào Quang Cực Cảnh 121 (Nếu Mở Khóa) */}
              {has121st && (
                <g>
                  <line x1="160" y1="136" x2="160" y2="40" stroke="#ec4899" strokeWidth="1.8" strokeDasharray="3,2" className={styles.lightningBeam121} />
                  <circle cx="160" cy="40" r="10" fill="none" stroke="#f472b6" strokeWidth="1.2" className={styles.crownAuraRing} />
                  <circle cx="160" cy="40" r="5" fill="#ec4899" />
                </g>
              )}
            </svg>
          </div>

          {/* B. MỆNH HỎA CỰC CẢNH THỨ 5 (KHIẾU 121) - NGAY TRÊN ĐỈNH ĐẦU */}
          <div className={styles.crownSlotWrap}>
            {has121st ? (
              <div className={styles.crownFlameActive} title="Pháp Khiếu 121: Cực Cảnh Thần Hỏa">
                <span className={styles.crownIcon}>⚡</span>
                <span className={styles.crownLabel}>✦ 121 CỰC CẢNH</span>
              </div>
            ) : (
              <div className={styles.crownFlameLocked} title="Pháp Khiếu 121: Chưa Khai Mở">
                <span className={styles.crownIconDim}>🕯️</span>
                <span className={styles.crownLabelDim}>121 KHIẾU</span>
              </div>
            )}
          </div>

          {/* C. 4 VỊ TRÍ LƠ LỬNG XUNG QUANH (MỆNH HỎA / THAY BẰNG MỆNH ĐĂNG AI) */}
          <div className={styles.surroundingSlotsLayer}>
            {surroundingSlots.map((slot) => (
              <div
                key={slot.id}
                className={`${styles.floatingElementWrap} ${slot.posClass}`}
                title={slot.title}
              >
                {slot.type === 'lamp' ? (
                  <div
                    className={styles.divineLampCardFloating}
                    style={{
                      borderColor: slot.color,
                      boxShadow: `0 0 14px ${slot.glow}`,
                      backgroundColor: slot.bg || 'rgba(16, 25, 39, 0.9)',
                    }}
                  >
                    <span className={styles.slotIcon} style={{ filter: `drop-shadow(0 0 6px ${slot.color})` }}>
                      {slot.lampObj ? (
                        <ArtifactIcon item={slot.lampObj} isLamp={true} size={28} />
                      ) : (
                        slot.icon
                      )}
                    </span>
                    <span className={styles.slotName} style={{ color: slot.color }}>
                      {slot.title}
                    </span>
                  </div>
                ) : (
                  <div
                    className={`${styles.flameCardFloating} ${slot.isLit ? styles.flameCardLit : styles.flameCardDim}`}
                    style={slot.isLit ? { borderColor: slot.color, boxShadow: `0 0 10px ${slot.glow}` } : {}}
                  >
                    <span className={styles.slotIcon} style={{ filter: slot.isLit ? `drop-shadow(0 0 6px ${slot.color})` : 'none' }}>
                      {slot.icon}
                    </span>
                    <span className={styles.slotName} style={{ color: slot.color }}>
                      {slot.title}
                    </span>
                  </div>
                )}
              </div>
            ))}

            {/* Mệnh Đăng thứ 5 nếu có */}
            {fifthLamp && (
              <div className={styles.fifthLampWrap} title={fifthLamp.title}>
                <div
                  className={styles.divineLampCardFloating}
                  style={{
                    borderColor: fifthLamp.color,
                    boxShadow: `0 0 14px ${fifthLamp.glow}`,
                    backgroundColor: fifthLamp.bg || 'rgba(16, 25, 39, 0.9)',
                  }}
                >
                  <span className={styles.slotIcon}>
                    {fifthLamp.lampObj ? (
                      <ArtifactIcon item={fifthLamp.lampObj} isLamp={true} size={28} />
                    ) : (
                      fifthLamp.icon
                    )}
                  </span>
                  <span className={styles.slotName} style={{ color: fifthLamp.color }}>{fifthLamp.title}</span>
                </div>
              </div>
            )}
          </div>

          <div className={styles.stageStatusBadge}>
            <span>🔥 {phapKhieu}/120 PHÁP KHIẾU {has121st && '· CỰC CẢNH 121'}</span>
          </div>
        </div>
      )}

      {/* ========================================================
          3. KIM ĐAN VISUALIZER: TÒA THIÊN LÂU 3D BẢO THÁP CHUẨN TIÊN HIỆP
         ======================================================== */}
      {realm === 'kim_dan' && (
        <div className={styles.kimDanStage}>
          {/* Mây mù tiên cảnh bao quanh tháp */}
          <div className={styles.towerMistyBackdrop}>
            <div className={styles.floatingCloudLeft}>☁️</div>
            <div className={styles.floatingCloudRight}>☁️</div>
            <div className={styles.mistBaseLayer} />
          </div>

          {/* 3D Pagoda Perspective Container */}
          <div className={styles.lauCacContainer}>
            <div className={styles.lauCac3D}>
              {/* Mái chóp bảo tháp đỉnh cao nhất (Pagoda Crown) */}
              <div className={styles.spire3D}>
                <div className={styles.spireCrownGlow} />
                <div className={styles.spireLotusFinial}>⛩️</div>
                <div className={styles.spireRoofTop} />
              </div>

              {/* Các Tầng Lầu Các (Mệnh Đăng ở tầng đỉnh tháp, Thiên Cung Tự Thân Hóa Thực từ đáy tháp lên trên) */}
              {Array.from({ length: maxThienCung }).map((_, i) => {
                const floorNum = maxThienCung - i;
                const isLampPalace = i < lampPalaceCount;
                const selfLocalIdx = isLampPalace ? null : (maxThienCung - 1) - i;
                const palaceIdx = isLampPalace ? i : lampPalaceCount + selfLocalIdx;

                const isRealized = isLampPalace || (selfLocalIdx !== null && selfLocalIdx < realizedThienCung);
                const da = (daoAnhs || []).find(d => d.palaceIndex === palaceIdx);
                const daTheme = da ? getDaoAnhTheme(da, cultivation) : null;
                const anchor = !isLampPalace ? cultivation?.palaceAnchors?.[selfLocalIdx] : null;
                const currentExp = cultivation?.currentThienCungExp || 0;
                const isCurrentActiveSelf = !isLampPalace && !isRealized && selfLocalIdx === realizedThienCung;
                const isBottleneck = isCurrentActiveSelf && currentExp >= bottleneckExp;
                const expPercent = isCurrentActiveSelf
                  ? Math.min(99.99, Math.round((currentExp / targetPalaceExp) * 100 * 100) / 100)
                  : 0;

                const lampIdx = isLampPalace ? palaceIdx : null;
                const absLamps = cultivation?.absorbedLamps || [];
                const lid = isLampPalace ? absLamps[lampIdx] : null;
                const lobj = lid ? LIFE_LAMPS.find(l => l.id === lid) : null;
                const elemTheme = daTheme || (isLampPalace ? getPalaceElementTheme(lobj) : anchor ? getPalaceElementTheme(anchor) : getPalaceElementTheme(null));

                const artifactObj = anchor
                  ? SUPPRESSING_ARTIFACTS.find(a => a.id === anchor.id) || anchor
                  : null;

                const palaceName = (() => {
                  if (da) return formatDaoAnhTitle(da.name);
                  if (isLampPalace) return lobj ? getLampPalaceName(lobj) : `Mệnh Đăng Cung ${lampIdx + 1}`;
                  if (anchor) return anchor.palaceName || getPalaceNameFromArtifact(anchor, selfLocalIdx, cultivation?.palaceAnchors);
                  return `Thiên Cung Tự Thân ${selfLocalIdx + 1}`;
                })();

                const tierKey = isLampPalace ? (lobj?.tier || 'than_pham') : (artifactObj?.tier || 'ha_pham');

                const auraColor = isLampPalace ? '#fbbf24' : (
                  tierKey === 'than_pham'   ? '#FF2D4D' :
                  tierKey === 'tien_pham'   ? '#FFD700' :
                  tierKey === 'cuc_pham'    ? '#8E44AD' :
                  tierKey === 'thuong_pham' ? '#2E86DE' :
                  tierKey === 'trung_pham'  ? '#4CAF50' : '#B0B0B0'
                );

                const loiColor = isLampPalace ? '#f97316' : (elemTheme?.color || auraColor);
                const trangThai = isRealized ? 'hoan-thien' : isBottleneck ? 'dang-ngung-thuc' : isCurrentActiveSelf ? 'dang-ngung-thuc' : 'hu-ao';
                const loai = isLampPalace ? 'menh-dang' : 'thuong';
                const tierIndex = i;

                return (
                  <div
                    key={floorNum}
                    className={styles.tang}
                    data-tier={floorNum}
                    data-loai={loai}
                    data-trang-thai={trangThai}
                    data-pham-chat={tierKey}
                    style={{
                      '--tier-index': tierIndex,
                      '--aura-color': auraColor,
                      '--loi-color': loiColor,
                      '--tien-do': `${expPercent}%`,
                    }}
                  >
                    {/* Mái ngói cong tháp tiên gia */}
                    <div className={styles.pagodaEaves}>
                      <span className={styles.eaveCornerLeft} />
                      <div className={styles.eaveBody} />
                      <span className={styles.eaveCornerRight} />
                    </div>

                    {/* Gian Điện Thần Tháp (Chamber Body) */}
                    <div className={styles.pagodaChamber}>
                      {/* Nội Điện Chính Giữa (Center Void Realm) */}
                      <div className={styles.centerChamberVoid}>
                        {/* Biển Hiệu Tên Cung Treo Phía Trên */}
                        <div className={styles.palacePlaque}>
                          <span className={styles.plaqueText} style={{ color: auraColor, textShadow: `0 0 8px ${auraColor}` }}>
                            {palaceName}
                          </span>
                        </div>

                        {/* VIÊN KIM ĐAN / ĐÈN MỆNH ĐĂNG 3D Ở CHÍNH GIỮA */}
                        {trangThai === 'hoan-thien' && (
                          <div className={styles.kimDanCenterWrapper}>
                            <div className={styles.kimDanAuraRing} />
                            <div className={styles.kimDan}>
                              <div className={styles.kimDanLoi} />
                              <div className={styles.kimDanIcon}>
                                <ArtifactIcon
                                  item={isLampPalace ? (lobj || { tier: 'than_pham', color: '#fbbf24', name: 'Mệnh Đăng' }) : artifactObj}
                                  isLamp={isLampPalace}
                                  size={42}
                                />
                              </div>
                              <div className={styles.kimDanParticles}>
                                <span className={styles.sparkle} style={{ top: -4, right: -4 }}>✦</span>
                                <span className={styles.sparkle} style={{ bottom: -4, left: -4 }}>✨</span>
                              </div>
                            </div>

                            {/* Status label / Button inside floor */}
                            {da && (
                              <span className={styles.floorStatusLabel} style={{ color: auraColor }}>
                                {da.currentKiep > 0 ? `✦ ${da.currentKiep} Kiếp` : '✦ Giả Anh'}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Tiến độ ngưng thực khi đang luyện */}
                        {trangThai === 'dang-ngung-thuc' && (
                          <div className={styles.ngungThucCenterBox}>
                            <span className={styles.mistCloudCenter}>☁️</span>
                            <span className={styles.ngungThucCenterLabel}>
                              {isBottleneck ? '⚠️ 99.99% · Cần Khảm Nạm' : `Hóa Thực ${expPercent}% (${currentExp.toLocaleString()}/${targetPalaceExp.toLocaleString()} Tu Vi)`}
                            </span>
                            <div className={styles.ngungThucTrack}>
                              <div className={styles.ngungThucBar} style={{ width: `${isBottleneck ? 100 : expPercent}%`, background: isBottleneck ? 'linear-gradient(90deg, #f97316, #ffcc00)' : 'linear-gradient(90deg, #38bdf8, #818cf8)' }} />
                            </div>

                            {/* Clickable button inside floor */}
                            {isBottleneck ? (
                              <button
                                className="btn-gold"
                                style={{ fontSize: 9.5, padding: '3px 8px', marginTop: 3, fontWeight: 700 }}
                                onClick={() => onSetAnchorModalPalace && onSetAnchorModalPalace(selfLocalIdx)}
                              >
                                🔑 Khảm Nạm Trấn Vật Ngay
                              </button>
                            ) : cultivation?.isKimDanTrialV2 ? (
                              <button
                                className="btn-gold"
                                style={{ fontSize: 9, padding: '2px 6px', marginTop: 3, fontWeight: 700 }}
                                onClick={() => onThangCung && onThangCung()}
                              >
                                ⬆️ Thăng Cung (99.99%)
                              </button>
                            ) : null}
                          </div>
                        )}

                        {/* Mây mù khi chưa bắt đầu */}
                        {trangThai === 'hu-ao' && (
                          <div className={styles.ngungThucCenterBox}>
                            <span className={styles.hollowMistCenter}>🌫️ Hư Ảo (0 / {targetPalaceExp.toLocaleString()} Tu Vi)</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Lan Can Đá Ngọc Chân Tầng */}
                    <div className={styles.pagodaBalustrade} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Realm Status Badge */}
          <div className={styles.stageStatusBadge}>
            <span style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#ffcc00', textShadow: '0 0 12px rgba(255,204,0,0.7)' }}>
              ✨ THIÊN CUNG KIM ĐAN ✨
            </span>
          </div>
        </div>
      )}

      {/* ========================================================
          4. NGUYÊN ANH VISUALIZER
         ======================================================== */}
      {(realm === 'gia_anh' || realm === 'nguyen_anh') && (
        <div className={styles.nguyenAnhStage}>
          {/* Celestial Gateway Background */}
          <div className={styles.celestialGateway}>
            <div className={styles.gatewayArch} />
            <div className={styles.tribulationLightning} />
          </div>

          {/* Central Meditating Nascent Soul Showcase */}
          <div className={styles.daoAnhShowcaseWrap}>
            <div className={styles.daoAnhAvatarBox}>
              <div className={styles.daoAnhKiepHalo}>
                {Array.from({ length: 5 }).map((_, k) => {
                  const maxKiep = daoAnhs.length > 0 ? Math.max(...daoAnhs.map(d => d.currentKiep || 0)) : 1;
                  const isPassed = maxKiep >= k + 1;
                  return (
                    <div
                      key={k}
                      className={`${styles.haloRing} ${isPassed ? styles.haloRingPassed : ''}`}
                      style={{
                        width: `${56 + k * 14}px`,
                        height: `${56 + k * 14}px`,
                      }}
                    />
                  );
                })}
              </div>

              {/* Meditating Celestial Infant Body (Đạo Anh Thần Thể Tọa Thiền Bằng Vector SVG) */}
              <div className={styles.infantEntity}>
                <div className={styles.spiritSvgWrap}>
                  <svg viewBox="0 0 100 120" className={styles.spiritSvg}>
                    <defs>
                      <linearGradient id="spiritGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.95" />
                        <stop offset="35%" stopColor="#06b6d4" stopOpacity="0.9" />
                        <stop offset="70%" stopColor="#0284c7" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#1e293b" stopOpacity="0.95" />
                      </linearGradient>

                      <linearGradient id="lotusGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                        <stop offset="50%" stopColor="#ffcc00" stopOpacity="1" />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.8" />
                      </linearGradient>

                      <radialGradient id="haloGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#22c3f0" stopOpacity="0.6" />
                        <stop offset="60%" stopColor="#0284c7" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                      </radialGradient>
                    </defs>

                    {/* Back Aura Circle & Celestial Rings */}
                    <circle cx="50" cy="42" r="32" fill="url(#haloGlow)" />
                    <circle cx="50" cy="42" r="24" fill="none" stroke="rgba(34, 195, 240, 0.4)" strokeWidth="1" strokeDasharray="3,3" className={styles.spiritRingSpin} />

                    {/* Floating Immortal Ribbons */}
                    <path
                      d="M 22 75 Q 14 55 24 38 Q 30 28 36 34 Q 28 48 32 68 Z"
                      fill="rgba(34, 195, 240, 0.3)"
                      className={styles.spiritRibbonLeft}
                    />
                    <path
                      d="M 78 75 Q 86 55 76 38 Q 70 28 64 34 Q 72 48 68 68 Z"
                      fill="rgba(34, 195, 240, 0.3)"
                      className={styles.spiritRibbonRight}
                    />

                    {/* Lotus Seat (Đài Sen Tọa Lạc) */}
                    <g className={styles.lotusSeat}>
                      <path d="M 50 102 Q 35 106 20 98 Q 30 108 50 110 Q 70 108 80 98 Q 65 106 50 102 Z" fill="url(#lotusGrad)" opacity="0.9" />
                      <path d="M 50 104 C 36 102 24 94 22 84 C 30 92 42 98 50 104 Z" fill="#ffcc00" opacity="0.85" />
                      <path d="M 50 104 C 30 100 14 88 12 76 C 24 86 38 96 50 104 Z" fill="#f59e0b" opacity="0.6" />
                      <path d="M 50 104 C 64 102 76 94 78 84 C 70 92 58 98 50 104 Z" fill="#ffcc00" opacity="0.85" />
                      <path d="M 50 104 C 70 100 86 88 88 76 C 76 86 62 96 50 104 Z" fill="#f59e0b" opacity="0.6" />
                      <path d="M 50 82 C 44 92 42 98 50 106 C 58 98 56 92 50 82 Z" fill="#fff" opacity="0.95" />
                    </g>

                    {/* Meditating Daoist Body */}
                    <g>
                      <circle cx="50" cy="32" r="10" fill="url(#spiritGrad)" stroke="#22c3f0" strokeWidth="1" />
                      <path d="M 46 22 Q 50 14 54 22 Z" fill="#67e8f9" stroke="#38bdf8" strokeWidth="0.8" />
                      <circle cx="50" cy="14" r="2.5" fill="#ffcc00" />
                      <circle cx="50" cy="30" r="1.5" fill="#ffcc00" className={styles.thirdEyeMark} />
                      <path
                        d="M 43 43 C 34 46 28 56 26 68 C 24 78 20 86 18 90 C 26 94 36 94 50 94 C 64 94 74 94 82 90 C 80 86 76 78 74 68 C 72 56 66 46 57 43 Z"
                        fill="url(#spiritGrad)"
                        stroke="#22c3f0"
                        strokeWidth="1.2"
                      />
                      <path
                        d="M 22 86 Q 36 100 50 98 Q 64 100 78 86 Q 64 92 50 90 Q 36 92 22 86 Z"
                        fill="#0284c7"
                        stroke="#38bdf8"
                        strokeWidth="0.8"
                      />
                      <ellipse cx="50" cy="74" rx="8" ry="4" fill="#67e8f9" stroke="#22c3f0" strokeWidth="0.8" />
                      <circle cx="50" cy="70" r="4" fill="#ffcc00" className={styles.spiritDanDienCore} />
                    </g>
                  </svg>
                </div>
              </div>
            </div>

            {/* 3D Celestial Astrolabe Ring in Background */}
            <div className={styles.astrolabeRing3D} />

            {/* Orbiting Dao Anh Guardians with Trấn Cung Bảo Vật & Mệnh Đăng AI */}
            <div className={styles.daoAnhsOrbitList}>
              {(daoAnhs || []).slice(0, 11).map((da, idx) => {
                const totalCount = Math.max(1, Math.min(11, daoAnhs.length));
                const angleDeg = (idx / totalCount) * 360 - 90;
                const angleRad = (angleDeg * Math.PI) / 180;
                const radiusX = 124; // Fit perfectly on mobile screen width
                const radiusY = 74;  // Fit perfectly on mobile screen height
                const posX = Math.cos(angleRad) * radiusX;
                const posY = Math.sin(angleRad) * radiusY;

                const daTheme = getDaoAnhTheme(da, cultivation);
                const artifactColor = daTheme.color;
                const artifactName = daTheme.shortName || da.name;

                // Resolve AI image item object for this Dao Anh palace
                const palaceIdx = da.palaceIndex;
                const maxThienCung = cultivation?.maxThienCung || 13;
                const lampPalaceCount = cultivation?.absorbedLamps?.length || 0;
                const selfPalacesTotal = maxThienCung - lampPalaceCount;
                const isLampPalace = palaceIdx >= selfPalacesTotal;

                const lampIdx = isLampPalace ? palaceIdx - selfPalacesTotal : null;
                const absLamps = cultivation?.absorbedLamps || [];
                const lid = isLampPalace ? absLamps[lampIdx] : null;
                const lobj = lid ? LIFE_LAMPS.find(l => l.id === lid) : null;

                const anchor = !isLampPalace ? cultivation?.palaceAnchors?.[palaceIdx] : null;
                const artifactObj = anchor
                  ? ((SUPPRESSING_ARTIFACTS || []).find(a => a.id === anchor.id) || anchor)
                  : null;

                const daItemObj = isLampPalace ? lobj : artifactObj;

                return (
                  <div
                    key={da.id}
                    className={`${styles.orbitDaoAnhMini} ${daTheme.isLamp ? styles.orbitLampProtected : ''}`}
                    style={{
                      transform: `translate(${posX.toFixed(1)}px, ${posY.toFixed(1)}px)`,
                      borderColor: artifactColor,
                      boxShadow: `0 0 16px ${artifactColor}cc, inset 0 0 8px ${artifactColor}44`,
                    }}
                    title={`${da.name} · Trấn Vật: ${artifactName} (${da.currentKiep > 0 ? `${da.currentKiep} Kiếp` : 'Giả Anh 0 Kiếp'})`}
                  >
                    <span className={styles.miniIcon}>
                      {daItemObj ? (
                        <ArtifactIcon item={daItemObj} isLamp={isLampPalace} size={34} />
                      ) : (
                        <span style={{ fontSize: 18, filter: `drop-shadow(0 0 6px ${artifactColor})` }}>
                          {daTheme.icon}
                        </span>
                      )}
                    </span>

                    {/* Biển Hiệu Thẻ Tên Tiên Gia Hiển Thị Trên Hover / Touch */}
                    <div className={styles.daoAnhHoverPlaque} style={{ borderColor: artifactColor, color: artifactColor }}>
                      <span className={styles.plaqueNameText}>{artifactName}</span>
                      <span className={styles.plaqueKiepText}>
                        {da.currentKiep > 0 ? `✦ ${da.currentKiep} Kiếp` : 'Giả Anh'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.stageStatusBadge}>
            <span>👑 {realm === 'nguyen_anh' ? 'NGUYÊN ANH' : 'GIẢ ANH'} · {daoAnhs.length} ĐẠO ANH TỌA TRẤN</span>
          </div>
        </div>
      )}
    </div>
  );
}
