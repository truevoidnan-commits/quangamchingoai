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

  // Tạo 4 Trận Pháp Lục Mang Tinh tại 4 góc (Mỗi góc 1 Lục Mang Tinh chứa đúng 30 Pháp Khiếu)
  const { cornerHexagrams, activeLampObj } = useMemo(() => {
    const corners = [
      { id: 'corner_1', name: 'Mệnh Hỏa 1', cx: 75,  cy: 75,  range: '1-30',   startIdx: 0,  color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.9)' },
      { id: 'corner_2', name: 'Mệnh Hỏa 2', cx: 265, cy: 75,  range: '31-60',  startIdx: 30, color: '#f97316', glow: 'rgba(249, 115, 22, 0.9)' },
      { id: 'corner_3', name: 'Mệnh Hỏa 3', cx: 75,  cy: 265, range: '61-90',  startIdx: 60, color: '#fef08a', glow: 'rgba(254, 240, 138, 0.9)' },
      { id: 'corner_4', name: 'Mệnh Hỏa 4', cx: 265, cy: 265, range: '91-120', startIdx: 90, color: '#c084fc', glow: 'rgba(192, 132, 252, 0.9)' },
    ];

    const R_tip = 46; // Bán kính đỉnh Lục Mang Tinh góc
    const h = R_tip * 0.5; // 23
    const w = R_tip * Math.sqrt(3) * 0.5; // ~39.84

    const result = corners.map((c, cornerIdx) => {
      const { cx, cy, startIdx, color } = c;
      const stars = [];

      // 6 Đỉnh của Lục Mang Tinh tại góc này
      // Tam Giác Dương (▲): Top, Right-Bottom, Left-Bottom
      const pTop = { x: cx, y: cy - R_tip };
      const pRB  = { x: cx + w, y: cy + h };
      const pLB  = { x: cx - w, y: cy + h };

      // Tam Giác Âm (▼): Bottom, Left-Top, Right-Top
      const pBot = { x: cx, y: cy + R_tip };
      const pLT  = { x: cx - w, y: cy - h };
      const pRT  = { x: cx + w, y: cy - h };

      // 6 Cạnh Thẳng của 2 Tam Giác (Mỗi cạnh 4 sao = 24 sao)
      const edges = [
        { from: pLB, to: pTop },
        { from: pTop, to: pRB },
        { from: pRB, to: pLB },
        { from: pLT, to: pRT },
        { from: pRT, to: pBot },
        { from: pBot, to: pLT },
      ];

      // 1. Rải 24 sao trên 6 cạnh tam giác (mỗi cạnh 4 sao)
      let localIdx = 0;
      edges.forEach((edge) => {
        for (let s = 0; s < 4; s++) {
          const t = (s + 0.5) / 4;
          const sx = edge.from.x + t * (edge.to.x - edge.from.x);
          const sy = edge.from.y + t * (edge.to.y - edge.from.y);
          const globalIdx = startIdx + localIdx;

          stars.push({
            idx: globalIdx,
            cx: Number(sx.toFixed(1)),
            cy: Number(sy.toFixed(1)),
            isLit: globalIdx < phapKhieu,
            color,
          });
          localIdx++;
        }
      });

      // 2. Rải 6 sao tại 6 đỉnh nằm trên đường viền vòng tròn (6 sao) => Tổng đúng 30 sao!
      const outerVertices = [pTop, pRT, pRB, pBot, pLB, pLT];
      outerVertices.forEach((v) => {
        const globalIdx = startIdx + localIdx;
        stars.push({
          idx: globalIdx,
          cx: Number(v.x.toFixed(1)),
          cy: Number(v.y.toFixed(1)),
          isLit: globalIdx < phapKhieu,
          color,
          isVertex: true,
        });
        localIdx++;
      });

      // Sắp xếp các sao theo thứ tự idx tăng dần (1 đến 30 của góc này)
      stars.sort((a, b) => a.idx - b.idx);

      const triUp = `M ${pTop.x.toFixed(1)},${pTop.y.toFixed(1)} L ${pRB.x.toFixed(1)},${pRB.y.toFixed(1)} L ${pLB.x.toFixed(1)},${pLB.y.toFixed(1)} Z`;
      const triDown = `M ${pBot.x.toFixed(1)},${pBot.y.toFixed(1)} L ${pLT.x.toFixed(1)},${pLT.y.toFixed(1)} L ${pRT.x.toFixed(1)},${pRT.y.toFixed(1)} Z`;

      const litCount = Math.max(0, Math.min(30, phapKhieu - startIdx));
      const isComplete = litCount === 30;

      // Kiểm tra Mệnh Đăng hoặc Mệnh Hỏa tương ứng tại góc này
      const lampId = (cultivation?.absorbedLamps || [])[cornerIdx];
      const lampObj = lampId ? LIFE_LAMPS.find(l => l.id === lampId) : null;
      const isFireLit = (cultivation?.selfHoa || 0) >= (cornerIdx + 1);

      return {
        ...c,
        R_tip,
        stars,
        triUp,
        triDown,
        litCount,
        isComplete,
        lampObj,
        isFireLit,
      };
    });

    const absorbedLampObjs = (cultivation?.absorbedLamps || []).map(id => LIFE_LAMPS.find(l => l.id === id)).filter(Boolean);
    const activeLamp = absorbedLampObjs[0] || LIFE_LAMPS[0];

    return {
      cornerHexagrams: result,
      activeLampObj: activeLamp,
    };
  }, [phapKhieu, cultivation?.absorbedLamps, cultivation?.selfHoa]);

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
          2. TRÚC CƠ VISUALIZER: 4 LỤC MANG TINH TẠI 4 GÓC & ĐẠI MỆNH ĐĂNG TRUNG TÂM
         ======================================================== */}
      {realm === 'truc_co' && (
        <div className={styles.trucCoStage}>
          {/* A. BỨC TINH ĐỒ 4 GÓC LỤC MANG TINH (4 CORNER HEXAGRAMS SVG) */}
          <div className={styles.starChartBackdrop}>
            <svg viewBox="0 0 340 340" className={styles.starChartSvg}>
              <defs>
                <radialGradient id="centerAltarGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#fbbf24" stopOpacity={phapKhieu >= 120 ? 0.65 : 0.25} />
                  <stop offset="60%" stopColor="#f59e0b" stopOpacity={phapKhieu >= 120 ? 0.35 : 0.08} />
                  <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                </radialGradient>

                {/* Glow Filter for Stars */}
                <filter id="starGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Đường Kinh Mạch Nối Từ Tâm Tới 4 Góc Lục Mang Tinh */}
              {cornerHexagrams.map((c) => (
                <line
                  key={`meridian_${c.id}`}
                  x1="170"
                  y1="170"
                  x2={c.cx}
                  y2={c.cy}
                  stroke={c.isComplete ? c.color : c.litCount > 0 ? c.color : 'rgba(255, 255, 255, 0.08)'}
                  strokeWidth={c.isComplete ? 1.5 : c.litCount > 0 ? 1 : 0.6}
                  strokeDasharray={c.isComplete ? 'none' : '3, 4'}
                  opacity={c.isComplete ? 0.8 : c.litCount > 0 ? 0.5 : 0.2}
                />
              ))}

              {/* Vòng Đại Bát Quái Bao Quanh Tâm Trận */}
              <circle
                cx="170"
                cy="170"
                r="36"
                fill="url(#centerAltarGlow)"
                stroke={phapKhieu >= 120 ? '#ffcc00' : 'rgba(255, 204, 0, 0.35)'}
                strokeWidth={phapKhieu >= 120 ? 1.5 : 0.8}
                strokeDasharray={phapKhieu >= 120 ? 'none' : '3, 3'}
              />

              {/* VẼ 4 LỤC MANG TINH TẠI 4 GÓC */}
              {cornerHexagrams.map((c) => (
                <g key={c.id}>
                  {/* Vòng Tròn Ngoại Tiếp Của Lục Mang Tinh Góc */}
                  <circle
                    cx={c.cx}
                    cy={c.cy}
                    r={c.R_tip}
                    fill="rgba(15, 23, 42, 0.6)"
                    stroke={c.isComplete ? c.color : c.litCount > 0 ? c.color : 'rgba(56, 189, 248, 0.25)'}
                    strokeWidth={c.isComplete ? 1.5 : 0.8}
                    strokeDasharray={c.isComplete ? 'none' : '2, 3'}
                    opacity={c.isComplete ? 0.95 : c.litCount > 0 ? 0.7 : 0.3}
                  />

                  {/* 2 Tam Giác Tạo Lục Mang Tinh (▲ và ▼) */}
                  <path
                    d={c.triUp}
                    fill="none"
                    stroke={c.litCount >= 15 ? c.color : 'rgba(255, 255, 255, 0.12)'}
                    strokeWidth={c.litCount >= 15 ? 1.2 : 0.6}
                  />
                  <path
                    d={c.triDown}
                    fill="none"
                    stroke={c.isComplete ? c.color : 'rgba(255, 255, 255, 0.12)'}
                    strokeWidth={c.isComplete ? 1.2 : 0.6}
                  />

                  {/* Tâm Nhỏ Của Lục Mang Tinh Góc */}
                  <circle
                    cx={c.cx}
                    cy={c.cy}
                    r="12"
                    fill="rgba(10, 16, 26, 0.8)"
                    stroke={c.isComplete ? c.color : 'rgba(255, 255, 255, 0.15)'}
                    strokeWidth="0.8"
                  />

                  {/* 30 Ngôi Sao Pháp Khiếu Của Góc Này (Nằm Im Tuyệt Đối) */}
                  {c.stars.map((star) => (
                    <circle
                      key={star.idx}
                      cx={star.cx}
                      cy={star.cy}
                      r={star.isLit ? (star.isVertex ? 3.2 : 2.2) : 1.2}
                      fill={star.isLit ? star.color : 'rgba(255, 255, 255, 0.16)'}
                      filter={star.isLit ? 'url(#starGlow)' : 'none'}
                      className={`${styles.starDot} ${star.isLit ? styles.starLit : styles.starDim}`}
                      style={{
                        '--star-color': star.color,
                      }}
                    />
                  ))}
                </g>
              ))}

              {/* Hào Quang Cực Cảnh 121 (Nếu Mở Khóa) */}
              {has121st && (
                <g>
                  <line x1="170" y1="134" x2="170" y2="45" stroke="#ec4899" strokeWidth="2" strokeDasharray="3,2" className={styles.lightningBeam121} />
                  <circle cx="170" cy="45" r="8" fill="none" stroke="#f472b6" strokeWidth="1.5" className={styles.crownAuraRing} />
                  <circle cx="170" cy="45" r="4.5" fill="#ec4899" />
                </g>
              )}
            </svg>
          </div>

          {/* B. ICON TRUNG TÂM CỦA 4 LỤC MANG TINH GÓC (HIỂN THỊ MỆNH ĐĂNG / MỆNH HỎA GÓC) */}
          <div className={styles.cornerHexagramIconsLayer}>
            {cornerHexagrams.map((c) => (
              <div
                key={`badge_${c.id}`}
                className={styles.cornerHexBadge}
                style={{
                  top: `${c.cy}px`,
                  left: `${c.cx}px`,
                  borderColor: c.isComplete ? c.color : 'rgba(255, 255, 255, 0.15)',
                  boxShadow: c.isComplete ? `0 0 10px ${c.glow}` : 'none',
                }}
                title={`${c.name} (${c.litCount}/30 Khiếu)`}
              >
                {c.lampObj ? (
                  <ArtifactIcon item={c.lampObj} isLamp={true} size={20} />
                ) : (
                  <span className={styles.cornerHexFlameText} style={{ color: c.isFireLit ? c.color : 'var(--text-muted)' }}>
                    {c.isFireLit ? '🔥' : '🕯️'}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* C. ĐẠI MỆNH ĐĂNG TỌA TRẤN TRUNG TÂM TOÀN TRẬN */}
          <div
            className={styles.centerHexagramLampWrap}
            style={{
              top: '170px',
              left: '170px',
              opacity: phapKhieu === 0 ? 0.45 : Math.min(1, 0.5 + 0.5 * (phapKhieu / 120)),
              filter: phapKhieu >= 120
                ? 'drop-shadow(0 0 18px rgba(255, 204, 0, 0.95)) drop-shadow(0 0 30px rgba(249, 115, 22, 0.75))'
                : phapKhieu > 0
                ? `drop-shadow(0 0 ${4 + Math.floor(phapKhieu / 10)}px rgba(255, 204, 0, 0.6))`
                : 'none',
            }}
          >
            <div className={`${styles.hexagramLampCore} ${phapKhieu >= 120 ? styles.hexagramLampBlazing : ''}`}>
              <ArtifactIcon
                item={activeLampObj}
                isLamp={true}
                size={48}
              />
              {phapKhieu >= 120 && (
                <div className={styles.hexagramBlazeAura}>
                  <span className={styles.sparkle} style={{ top: -6, right: -6 }}>✦</span>
                  <span className={styles.sparkle} style={{ bottom: -6, left: -6 }}>✨</span>
                </div>
              )}
            </div>
            <span className={styles.hexagramLampName} style={{ color: phapKhieu >= 120 ? '#ffcc00' : 'var(--text-secondary)' }}>
              {activeLampObj?.shortName || activeLampObj?.name || 'Mệnh Đăng'}
            </span>
          </div>

          {/* D. MỆNH HỎA CỰC CẢNH THỨ 5 (KHIẾU 121) - NGAY TRÊN ĐỈNH ĐẦU */}
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
