import React, { useMemo } from 'react';
import { LIFE_LAMPS, LAMP_TIERS, SUPPRESSING_ARTIFACTS, getPalaceNameFromArtifact, getPalaceElementTheme, getLampPalaceName, formatDaoAnhTitle, getDaoAnhTheme } from '../../lib/cultivation';
import { LAMP_THAN_PHAM_AI_ICONS } from '../../lib/artifactIcons';
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

  // Tạo 4 Trận Pháp Lục Mang Tinh tại 4 góc (Mỗi góc 1 Lục Mang Tinh chứa đúng 30 Pháp Khiếu với khoảng cách thoáng đãng)
  const { cornerHexagrams, activeLampObj } = useMemo(() => {
    const corners = [
      { id: 'corner_1', name: 'Mệnh Hỏa 1', cx: 82,  cy: 82,  startIdx: 0,  color: '#38bdf8', glow: '#00f2fe' },
      { id: 'corner_2', name: 'Mệnh Hỏa 2', cx: 278, cy: 82,  startIdx: 30, color: '#fb923c', glow: '#f97316' },
      { id: 'corner_3', name: 'Mệnh Hỏa 3', cx: 82,  cy: 278, startIdx: 60, color: '#fef08a', glow: '#eab308' },
      { id: 'corner_4', name: 'Mệnh Hỏa 4', cx: 278, cy: 278, startIdx: 90, color: '#c084fc', glow: '#a855f7' },
    ];

    const R_tip = 56; // Bán kính đỉnh Lục Mang Tinh góc (Mở rộng cho không gian thoáng đãng)
    const R_circle = 60; // Vòng tròn ngoại tiếp
    const h = R_tip * 0.5; // 28
    const w = R_tip * Math.sqrt(3) * 0.5; // ~48.5

    const result = corners.map((c, cornerIdx) => {
      const { cx, cy, startIdx, color, glow } = c;
      const stars = [];

      // 6 Đỉnh của 2 Tam Giác Lục Mang Tinh
      // Tam Giác Dương (▲): Top, Right-Bottom, Left-Bottom
      const pTop = { x: cx, y: cy - R_tip };
      const pRB  = { x: cx + w, y: cy + h };
      const pLB  = { x: cx - w, y: cy + h };

      // Tam Giác Âm (▼): Bottom, Left-Top, Right-Top
      const pBot = { x: cx, y: cy + R_tip };
      const pLT  = { x: cx - w, y: cy - h };
      const pRT  = { x: cx + w, y: cy - h };

      // 6 Cạnh Thẳng của 2 Tam Giác (Mỗi cạnh 3 sao phân bố đều = 18 sao)
      const edges = [
        { from: pLB, to: pTop }, // Cạnh 1 (▲ Trái -> Đỉnh)
        { from: pTop, to: pRB }, // Cạnh 2 (▲ Đỉnh -> Phải)
        { from: pRB, to: pLB }, // Cạnh 3 (▲ Đáy Ngang)
        { from: pLT, to: pRT }, // Cạnh 4 (▼ Đỉnh Ngang)
        { from: pRT, to: pBot },// Cạnh 5 (▼ Phải -> Đáy)
        { from: pBot, to: pLT },// Cạnh 6 (▼ Đáy -> Trái)
      ];

      let localIdx = 0;
      // 1. 18 Sao trên 6 cạnh của 2 tam giác (mỗi cạnh 3 sao tại t = 0.25, 0.5, 0.75)
      edges.forEach((edge) => {
        for (let s = 1; s <= 3; s++) {
          const t = s / 4;
          const sx = edge.from.x + t * (edge.to.x - edge.from.x);
          const sy = edge.from.y + t * (edge.to.y - edge.from.y);
          const globalIdx = startIdx + localIdx;

          stars.push({
            idx: globalIdx,
            cx: Number(sx.toFixed(1)),
            cy: Number(sy.toFixed(1)),
            isLit: globalIdx < phapKhieu,
            color,
            glow,
            type: 'edge',
          });
          localIdx++;
        }
      });

      // 2. 12 Sao trên vòng tròn ngoại tiếp (cách đều nhau 30 độ quanh vòng tròn = 12 sao) => Tổng đúng 30 sao!
      for (let k = 0; k < 12; k++) {
        const rad = (k * 30 - 90) * (Math.PI / 180);
        const sx = cx + R_circle * Math.cos(rad);
        const sy = cy + R_circle * Math.sin(rad);
        const globalIdx = startIdx + localIdx;

        stars.push({
          idx: globalIdx,
          cx: Number(sx.toFixed(1)),
          cy: Number(sy.toFixed(1)),
          isLit: globalIdx < phapKhieu,
          color,
          glow,
          isVertex: k % 2 === 0,
          type: 'circle',
        });
        localIdx++;
      }

      // Sắp xếp theo thứ tự khiếu tăng dần
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
        R_circle,
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
          2. TRÚC CƠ VISUALIZER: 4 LỤC MANG TINH TẠI 4 GÓC & TU SĨ TỌA THIỀN TRUNG TÂM
         ======================================================== */}
      {realm === 'truc_co' && (
        <div className={styles.trucCoStage}>
          <div className={styles.starChartBackdrop}>
            <svg viewBox="0 0 360 380" className={styles.starChartSvg}>
              <defs>
                <radialGradient id="centerAltarGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#00f2fe" stopOpacity="0.3" />
                  <stop offset="60%" stopColor="#0284c7" stopOpacity="0.1" />
                  <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                </radialGradient>

                <linearGradient id="daoistBodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.95" />
                  <stop offset="60%" stopColor="#0284c7" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0.95" />
                </linearGradient>

                {/* ClipPath cho 4 hình tròn Mệnh Đăng ở 4 góc (r = 19px, đường kính 38px) */}
                <clipPath id="cornerClip_corner_1">
                  <circle cx="82" cy="82" r="19" />
                </clipPath>
                <clipPath id="cornerClip_corner_2">
                  <circle cx="278" cy="82" r="19" />
                </clipPath>
                <clipPath id="cornerClip_corner_3">
                  <circle cx="82" cy="278" r="19" />
                </clipPath>
                <clipPath id="cornerClip_corner_4">
                  <circle cx="278" cy="278" r="19" />
                </clipPath>

                {/* Super Glow Filter cho các Pháp Khiếu Rực Sáng */}
                <filter id="superStarGlow" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* BÁT QUÁI THÁI CỰC LA BÀN THUẦN SVG TỰ TẠO XOAY TRÒN LÀM NỀN */}
              <g className={styles.rotatingBaguaGroup}>
                <g transform="translate(180, 180)">
                  {/* 1. Các Vòng Tròn Đồng Tâm Đậm Chất Trận Pháp (Concentric Celestial Rings) */}
                  <circle cx="0" cy="0" r="172" fill="none" stroke="rgba(56, 189, 248, 0.15)" strokeWidth="1.2" />
                  <circle cx="0" cy="0" r="166" fill="none" stroke="rgba(56, 189, 248, 0.35)" strokeWidth="0.8" strokeDasharray="3, 4" />
                  <circle cx="0" cy="0" r="148" fill="none" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="0.8" />
                  <circle cx="0" cy="0" r="132" fill="none" stroke="rgba(56, 189, 248, 0.25)" strokeWidth="1" />
                  <circle cx="0" cy="0" r="112" fill="none" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="0.8" strokeDasharray="2, 3" />
                  <circle cx="0" cy="0" r="92" fill="none" stroke="rgba(56, 189, 248, 0.25)" strokeWidth="0.8" />
                  <circle cx="0" cy="0" r="74" fill="none" stroke="rgba(56, 189, 248, 0.3)" strokeWidth="1" />
                  <circle cx="0" cy="0" r="54" fill="none" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="0.8" strokeDasharray="2, 4" />
                  <circle cx="0" cy="0" r="38" fill="none" stroke="rgba(255, 204, 0, 0.35)" strokeWidth="1.2" />

                  {/* 2. Vành Ngoài: 72 Khắc Vạch Chu Thiên Độ Số (72 Outer Tick Marks) */}
                  {Array.from({ length: 72 }).map((_, i) => {
                    const deg = i * 5;
                    const rad = (deg * Math.PI) / 180;
                    const isMajor = i % 6 === 0;
                    const isSemi = i % 3 === 0;
                    const r1 = 166;
                    const r2 = isMajor ? 148 : isSemi ? 154 : 160;
                    return (
                      <line
                        key={`tick_${i}`}
                        x1={r1 * Math.cos(rad)}
                        y1={r1 * Math.sin(rad)}
                        x2={r2 * Math.cos(rad)}
                        y2={r2 * Math.sin(rad)}
                        stroke={isMajor ? 'rgba(56, 189, 248, 0.5)' : 'rgba(56, 189, 248, 0.2)'}
                        strokeWidth={isMajor ? 1.2 : 0.6}
                      />
                    );
                  })}

                  {/* 3. Vành Giữa: 24 Cung Phương Vị La Bàn (24 Celestial Sectors) */}
                  {Array.from({ length: 24 }).map((_, i) => {
                    const deg = i * 15;
                    const rad = (deg * Math.PI) / 180;
                    return (
                      <line
                        key={`sector_${i}`}
                        x1={132 * Math.cos(rad)}
                        y1={132 * Math.sin(rad)}
                        x2={112 * Math.cos(rad)}
                        y2={112 * Math.sin(rad)}
                        stroke="rgba(56, 189, 248, 0.22)"
                        strokeWidth="0.7"
                      />
                    );
                  })}

                  {/* 4. Vành Bát Quái Cổ: 8 Quẻ Tiên Thiên Bát Quái (8 Trigrams: Càn, Khảm, Cấn, Chấn, Tốn, Ly, Khôn, Đoài) */}
                  {[
                    { name: '☰ CÀN', deg: 0,   lines: [1, 1, 1] }, // Dương - Dương - Dương
                    { name: '☱ ĐOÀI', deg: 45,  lines: [0, 1, 1] }, // Âm - Dương - Dương
                    { name: '☲ LY',   deg: 90,  lines: [1, 0, 1] }, // Dương - Âm - Dương
                    { name: '☳ CHẤN', deg: 135, lines: [0, 0, 1] }, // Âm - Âm - Dương
                    { name: '☷ KHÔN', deg: 180, lines: [0, 0, 0] }, // Âm - Âm - Âm
                    { name: '☶ CẤN',  deg: 225, lines: [1, 0, 0] }, // Dương - Âm - Âm
                    { name: '☵ KHẢM', deg: 270, lines: [0, 1, 0] }, // Âm - Dương - Âm
                    { name: '☴ TỐN',  deg: 315, lines: [1, 1, 0] }, // Dương - Dương - Âm
                  ].map((trigram, i) => (
                    <g key={`trigram_${i}`} transform={`rotate(${trigram.deg})`}>
                      {/* Đường phân cung Bát Quái */}
                      <line x1="0" y1="-92" x2="0" y2="-74" stroke="rgba(56, 189, 248, 0.25)" strokeWidth="0.8" />

                      {/* Vẽ 3 Hào của Quẻ (3 Yao Bars) */}
                      {trigram.lines.map((isYang, lineIdx) => {
                        const yPos = -76 - lineIdx * 5;
                        return isYang ? (
                          /* Hào Dương: Vạch Liền ─── */
                          <line
                            key={`yao_${lineIdx}`}
                            x1="-10"
                            y1={yPos}
                            x2="10"
                            y2={yPos}
                            stroke="rgba(56, 189, 248, 0.6)"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        ) : (
                          /* Hào Âm: Vạch Đứt ─ ─ */
                          <g key={`yao_${lineIdx}`}>
                            <line x1="-10" y1={yPos} x2="-2" y2={yPos} stroke="rgba(56, 189, 248, 0.6)" strokeWidth="1.8" strokeLinecap="round" />
                            <line x1="2" y1={yPos} x2="10" y2={yPos} stroke="rgba(56, 189, 248, 0.6)" strokeWidth="1.8" strokeLinecap="round" />
                          </g>
                        );
                      })}
                    </g>
                  ))}

                  {/* 5. Tâm Thái Cực Âm Dương (Taiji Yin-Yang Core) */}
                  <g opacity="0.45">
                    <circle cx="0" cy="0" r="26" fill="rgba(15, 23, 42, 0.9)" stroke="rgba(56, 189, 248, 0.4)" strokeWidth="1" />
                    {/* Nửa Dương Trắng */}
                    <path d="M 0 -26 A 26 26 0 0 1 0 26 A 13 13 0 0 1 0 0 A 13 13 0 0 0 0 -26 Z" fill="rgba(56, 189, 248, 0.25)" />
                    {/* Mắt Âm & Mắt Dương */}
                    <circle cx="0" cy="-13" r="3.5" fill="rgba(15, 23, 42, 0.95)" stroke="rgba(56, 189, 248, 0.5)" strokeWidth="0.8" />
                    <circle cx="0" cy="13" r="3.5" fill="rgba(56, 189, 248, 0.5)" />
                  </g>
                </g>
              </g>

              {/* Đường Kinh Mạch Nối Từ Tâm Tới 4 Góc Lục Mang Tinh */}
              {cornerHexagrams.map((c) => (
                <line
                  key={`meridian_${c.id}`}
                  x1="180"
                  y1="180"
                  x2={c.cx}
                  y2={c.cy}
                  stroke={c.isComplete ? c.color : c.litCount > 0 ? c.color : 'rgba(255, 255, 255, 0.12)'}
                  strokeWidth={c.isComplete ? 1.6 : c.litCount > 0 ? 1.2 : 0.6}
                  strokeDasharray={c.isComplete ? 'none' : '3, 4'}
                  opacity={c.isComplete ? 0.9 : c.litCount > 0 ? 0.6 : 0.25}
                />
              ))}

              {/* VÒNG ĐẠI BÁT QUÁI BAO QUANH TU SĨ TRUNG TÂM */}
              <circle
                cx="180"
                cy="180"
                r="38"
                fill="url(#centerAltarGlow)"
                stroke={phapKhieu >= 120 ? '#ffcc00' : 'rgba(56, 189, 248, 0.4)'}
                strokeWidth={phapKhieu >= 120 ? 2 : 1}
                strokeDasharray={phapKhieu >= 120 ? 'none' : '3, 3'}
              />

              {/* VẼ 4 LỤC MANG TINH TẠI 4 GÓC (CHỨA MỆNH ĐĂNG / MỆNH HỎA GÓC) */}
              {cornerHexagrams.map((c) => {
                const aiIconUrl = c.lampObj?.id ? LAMP_THAN_PHAM_AI_ICONS[c.lampObj.id] : null;
                const labelText = c.lampObj?.shortName || c.name;
                const labelWidth = Math.max(54, labelText.length * 6.5 + 14);

                return (
                  <g key={c.id}>
                    {/* Vòng Tròn Ngoại Tiếp Của Lục Mang Tinh Góc */}
                    <circle
                      cx={c.cx}
                      cy={c.cy}
                      r={c.R_circle}
                      fill="rgba(15, 23, 42, 0.6)"
                      stroke={c.isComplete ? c.color : c.litCount > 0 ? c.color : 'rgba(56, 189, 248, 0.25)'}
                      strokeWidth={c.isComplete ? 1.6 : 0.8}
                      strokeDasharray={c.isComplete ? 'none' : '2, 3'}
                      opacity={c.isComplete ? 0.95 : c.litCount > 0 ? 0.75 : 0.3}
                    />

                    {/* 2 Tam Giác Tạo Lục Mang Tinh (▲ và ▼) */}
                    <path
                      d={c.triUp}
                      fill="none"
                      stroke={c.litCount >= 15 ? c.color : 'rgba(255, 255, 255, 0.15)'}
                      strokeWidth={c.litCount >= 15 ? 1.4 : 0.7}
                    />
                    <path
                      d={c.triDown}
                      fill="none"
                      stroke={c.isComplete ? c.color : 'rgba(255, 255, 255, 0.15)'}
                      strokeWidth={c.isComplete ? 1.4 : 0.7}
                    />

                    {/* 30 Ngôi Sao Pháp Khiếu Của Góc Này (Nằm Im Tuyệt Đối, Sáng Rực Rỡ) */}
                    {c.stars.map((star) => (
                      <g key={star.idx}>
                        {/* Hào quang sao */}
                        <circle
                          cx={star.cx}
                          cy={star.cy}
                          r={star.isLit ? (star.isVertex ? 4.2 : 3.2) : 1.8}
                          fill={star.isLit ? star.color : 'rgba(255, 255, 255, 0.16)'}
                          filter={star.isLit ? 'url(#superStarGlow)' : 'none'}
                          opacity={star.isLit ? 1 : 0.4}
                        />
                        {/* Nhân sáng trắng bên trong sao đã mở */}
                        {star.isLit && (
                          <circle
                            cx={star.cx}
                            cy={star.cy}
                            r={star.isVertex ? 1.8 : 1.3}
                            fill="#ffffff"
                          />
                        )}
                      </g>
                    ))}

                    {/* TÂM MỆNH ĐĂNG / MỆNH HỎA TẠI GÓC NÀY (RỘNG 38px RÕ NÉT) */}
                    <g>
                      {/* Nền tròn tâm */}
                      <circle
                        cx={c.cx}
                        cy={c.cy}
                        r="19"
                        fill="rgba(10, 16, 26, 0.95)"
                        stroke={c.isComplete ? c.color : c.isFireLit ? c.color : 'rgba(255, 255, 255, 0.25)'}
                        strokeWidth="1.5"
                      />

                      {/* Nếu có ảnh AI của Mệnh Đăng -> vẽ thẳng bằng SVG <image> (rộng 38px) */}
                      {aiIconUrl ? (
                        <image
                          href={aiIconUrl}
                          x={c.cx - 19}
                          y={c.cy - 19}
                          width="38"
                          height="38"
                          clipPath={`url(#cornerClip_${c.id})`}
                          preserveAspectRatio="xMidYMid slice"
                        />
                      ) : (
                        /* Nếu là Mệnh Hỏa / Chưa có Mệnh Đăng AI */
                        <text
                          x={c.cx}
                          y={c.cy + 5.5}
                          textAnchor="middle"
                          fontSize="16"
                        >
                          {c.isFireLit ? '🔥' : '🕯️'}
                        </text>
                      )}

                      {/* Viền sáng bảo hộ bên ngoài Mệnh Đăng */}
                      <circle
                        cx={c.cx}
                        cy={c.cy}
                        r="19"
                        fill="none"
                        stroke={c.isComplete ? c.color : c.isFireLit ? c.color : 'rgba(255, 255, 255, 0.35)'}
                        strokeWidth={c.isComplete ? 2 : 1.2}
                      />

                      {/* KHUNG BADGE TÊN MỆNH ĐĂNG / MỆNH HỎA GÓC (ĐẶT BÊN NGOÀI KHÔNG BỊ CHE) */}
                      <g transform={`translate(${c.cx}, ${c.cy + c.R_circle + 13})`}>
                        <rect
                          x={-labelWidth / 2}
                          y="-9"
                          width={labelWidth}
                          height="18"
                          rx="9"
                          fill="rgba(10, 16, 26, 0.88)"
                          stroke={c.isComplete ? c.color : c.isFireLit ? c.color : 'rgba(255, 255, 255, 0.2)'}
                          strokeWidth="1"
                        />
                        <text
                          x="0"
                          y="3.5"
                          textAnchor="middle"
                          fill={c.isComplete ? c.color : c.isFireLit ? c.color : '#94a3b8'}
                          fontSize="8.5"
                          fontWeight="700"
                          fontFamily="var(--font-serif)"
                        >
                          {labelText}
                        </text>
                      </g>
                    </g>
                  </g>
                );
              })}

              {/* TU SĨ TỌA THIỀN Ở CHÍNH GIỮA TRẬN PHÁP (CENTER DAOIST SILHOUETTE) */}
              <g transform="translate(180, 180)">
                {/* Hào quang thiền định */}
                <ellipse cx="0" cy="0" rx="32" ry="36" fill="rgba(56, 189, 248, 0.08)" stroke="rgba(56, 189, 248, 0.35)" strokeWidth="1" strokeDasharray="3,3" />

                {/* Đầu tu sĩ */}
                <circle cx="0" cy="-19" r="8" fill="url(#daoistBodyGrad)" stroke="#38bdf8" strokeWidth="1" />

                {/* Thân & Dáng Ngồi Kiết Già (Lotus Silhouette) */}
                <path
                  d="M 0 -11 C -8 -11, -17 -4, -19 4 C -21 12, -29 18, -27 22 C -25 26, -13 26, 0 26 C 13 26, 25 26, 27 22 C 29 18, 21 12, 19 4 C 17 -4, 8 -11, 0 -11 Z"
                  fill="url(#daoistBodyGrad)"
                  stroke="#38bdf8"
                  strokeWidth="1.2"
                />

                {/* Đan Điền Core Vàng Sáng Rực */}
                <circle cx="0" cy="9" r="5" fill="#ffcc00" filter="url(#superStarGlow)" className={styles.daoistDanDien} />
                <circle cx="0" cy="9" r="2" fill="#ffffff" />
              </g>

              {/* Hào Quang Cực Cảnh 121 (Nếu Mở Khóa) */}
              {has121st && (
                <g>
                  <line x1="180" y1="142" x2="180" y2="40" stroke="#ec4899" strokeWidth="2" strokeDasharray="3,2" className={styles.lightningBeam121} />
                  <circle cx="180" cy="40" r="9" fill="none" stroke="#f472b6" strokeWidth="1.5" className={styles.crownAuraRing} />
                  <circle cx="180" cy="40" r="5" fill="#ec4899" />
                  <circle cx="180" cy="40" r="2" fill="#ffffff" />
                </g>
              )}
            </svg>
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
