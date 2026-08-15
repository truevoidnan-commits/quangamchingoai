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

  // TỨ TƯỢNG QUY NHẤT TINH VÂN: 4 Dải Ngân Hà Xoắn Ốc (Mỗi nhánh 30 Pháp Khiếu = 120 Khiếu)
  const { spiralArms, activeLampObj, fifthLampObj } = useMemo(() => {
    const armsConfig = [
      { id: 'arm_1', name: 'Mệnh Hỏa 1', startAngle: 0,   color: '#38bdf8', glow: '#00f2fe', startIdx: 0 },   // Nhánh 1 (Xanh Lam - Mệnh Hỏa 1: 1-30)
      { id: 'arm_2', name: 'Mệnh Hỏa 2', startAngle: 90,  color: '#fb923c', glow: '#f97316', startIdx: 30 },  // Nhánh 2 (Đỏ Cam - Mệnh Hỏa 2: 31-60)
      { id: 'arm_3', name: 'Mệnh Hỏa 3', startAngle: 180, color: '#fef08a', glow: '#eab308', startIdx: 60 },  // Nhánh 3 (Hoàng Kim - Mệnh Hỏa 3: 61-90)
      { id: 'arm_4', name: 'Mệnh Hỏa 4', startAngle: 270, color: '#c084fc', glow: '#a855f7', startIdx: 90 },  // Nhánh 4 (Tử Quang - Mệnh Hỏa 4: 91-120)
    ];

    const cx = 180;
    const cy = 185;
    const starsPerArm = 30;
    const rStart = 42;  // Bán kính xuất phát gần Tu Sĩ
    const rEnd = 138;   // Bán kính vươn ra đầu mút Mệnh Đăng
    const totalTheta = 1.6 * Math.PI; // Góc xoắn ốc (~290 độ)

    const arms = armsConfig.map((arm, armIdx) => {
      const stars = [];
      const baseRad = (arm.startAngle * Math.PI) / 180;
      let pathD = '';

      for (let s = 0; s < starsPerArm; s++) {
        const t = (s + 0.5) / starsPerArm; // 0..1
        const r = rStart + (rEnd - rStart) * Math.pow(t, 0.88); // Đường cong xoắn ốc Archimedes mượt mà
        const theta = baseRad + totalTheta * t;

        const sx = cx + r * Math.cos(theta);
        const sy = cy + r * Math.sin(theta);
        const globalIdx = arm.startIdx + s;

        stars.push({
          idx: globalIdx,
          cx: Number(sx.toFixed(1)),
          cy: Number(sy.toFixed(1)),
          isLit: globalIdx < phapKhieu,
          isMilestone: (globalIdx + 1) % 10 === 0,
          color: arm.color,
          glow: arm.glow,
        });

        if (s === 0) {
          pathD += `M ${sx.toFixed(1)} ${sy.toFixed(1)}`;
        } else {
          pathD += ` L ${sx.toFixed(1)} ${sy.toFixed(1)}`;
        }
      }

      // Tọa độ đầu mút ngoài cùng nơi đặt Mệnh Đăng (Outer Tip Lamp Altar)
      const endTheta = baseRad + totalTheta * 1.06;
      const endR = rEnd + 14;
      const lampPos = {
        x: Number((cx + endR * Math.cos(endTheta)).toFixed(1)),
        y: Number((cy + endR * Math.sin(endTheta)).toFixed(1)),
      };

      const litCount = Math.max(0, Math.min(30, phapKhieu - arm.startIdx));
      const isComplete = litCount === 30;

      // Mệnh Đăng / Mệnh Hỏa tương ứng tại nhánh này
      const lampId = (cultivation?.absorbedLamps || [])[armIdx];
      const lampObj = lampId ? LIFE_LAMPS.find(l => l.id === lampId) : null;
      const isFireLit = (cultivation?.selfHoa || 0) >= (armIdx + 1);

      return {
        ...arm,
        stars,
        pathD,
        lampPos,
        litCount,
        isComplete,
        lampObj,
        isFireLit,
      };
    });

    const absorbedLampObjs = (cultivation?.absorbedLamps || []).map(id => LIFE_LAMPS.find(l => l.id === id)).filter(Boolean);
    const activeLamp = absorbedLampObjs[0] || LIFE_LAMPS[0];
    const fifthLamp = absorbedLampObjs[4] || null;

    return {
      spiralArms: arms,
      activeLampObj: activeLamp,
      fifthLampObj: fifthLamp,
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
          2. TRÚC CƠ VISUALIZER: TỨ TƯỢNG QUY NHẤT TINH VÂN (4 NHÁNH XOẮN ỐC + 5 MỆNH ĐĂNG)
         ======================================================== */}
      {realm === 'truc_co' && (
        <div className={styles.trucCoStage}>
          <div className={styles.starChartBackdrop}>
            <svg viewBox="0 0 360 380" className={styles.starChartSvg}>
              <defs>
                <radialGradient id="centerAltarGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#00f2fe" stopOpacity="0.35" />
                  <stop offset="60%" stopColor="#0284c7" stopOpacity="0.1" />
                  <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                </radialGradient>

                <linearGradient id="daoistBodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.95" />
                  <stop offset="60%" stopColor="#0284c7" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0.95" />
                </linearGradient>

                {/* ClipPath cho 4 Mệnh Đăng ở 4 nhánh mút xoắn ốc (r = 18px, đường kính 36px) */}
                <clipPath id="spiralClip_arm_1"><circle cx="0" cy="0" r="18" /></clipPath>
                <clipPath id="spiralClip_arm_2"><circle cx="0" cy="0" r="18" /></clipPath>
                <clipPath id="spiralClip_arm_3"><circle cx="0" cy="0" r="18" /></clipPath>
                <clipPath id="spiralClip_arm_4"><circle cx="0" cy="0" r="18" /></clipPath>
                <clipPath id="spiralClip_crown"><circle cx="180" cy="38" r="16" /></clipPath>

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

              {/* A. BÁT QUÁI THÁI CỰC LA BÀN THUẦN SVG XOAY TRÒN LÀM NỀN */}
              <g className={styles.rotatingBaguaGroup}>
                <g transform="translate(180, 185)">
                  <circle cx="0" cy="0" r="172" fill="none" stroke="rgba(56, 189, 248, 0.2)" strokeWidth="1.2" />
                  <circle cx="0" cy="0" r="166" fill="none" stroke="rgba(56, 189, 248, 0.35)" strokeWidth="0.8" strokeDasharray="3, 4" />
                  <circle cx="0" cy="0" r="148" fill="none" stroke="rgba(56, 189, 248, 0.25)" strokeWidth="0.8" />
                  <circle cx="0" cy="0" r="132" fill="none" stroke="rgba(56, 189, 248, 0.3)" strokeWidth="1" />
                  <circle cx="0" cy="0" r="112" fill="none" stroke="rgba(56, 189, 248, 0.25)" strokeWidth="0.8" strokeDasharray="2, 3" />
                  <circle cx="0" cy="0" r="92" fill="none" stroke="rgba(56, 189, 248, 0.3)" strokeWidth="0.8" />
                  <circle cx="0" cy="0" r="74" fill="none" stroke="rgba(56, 189, 248, 0.35)" strokeWidth="1" />
                  <circle cx="0" cy="0" r="54" fill="none" stroke="rgba(56, 189, 248, 0.25)" strokeWidth="0.8" strokeDasharray="2, 4" />

                  {/* 72 Khắc Vạch Chu Thiên Độ Số */}
                  {Array.from({ length: 72 }).map((_, i) => {
                    const deg = i * 5;
                    const rad = (deg * Math.PI) / 180;
                    const isMajor = i % 6 === 0;
                    const r1 = 172;
                    const r2 = isMajor ? 164 : 167;
                    return (
                      <line
                        key={`tick_${i}`}
                        x1={r1 * Math.cos(rad)}
                        y1={r1 * Math.sin(rad)}
                        x2={r2 * Math.cos(rad)}
                        y2={r2 * Math.sin(rad)}
                        stroke={isMajor ? 'rgba(56, 189, 248, 0.55)' : 'rgba(56, 189, 248, 0.2)'}
                        strokeWidth={isMajor ? 1.2 : 0.6}
                      />
                    );
                  })}

                  {/* 28 Nhị Thập Bát Tú */}
                  {[
                    '角', '亢', '氐', '房', '心', '尾', '箕',
                    '斗', '牛', '女', '虚', '危', '室', '壁',
                    '奎', '娄', '胃', '昴', '毕', '觜', '参',
                    '井', '鬼', '柳', '星', '张', '翼', '轸',
                  ].map((char, i) => {
                    const deg = (i * 360) / 28;
                    return (
                      <g key={`mansion_${i}`} transform={`rotate(${deg})`}>
                        <line x1="0" y1="-166" x2="0" y2="-148" stroke="rgba(56, 189, 248, 0.22)" strokeWidth="0.6" />
                        <text x="0" y="-154" textAnchor="middle" fill="rgba(56, 189, 248, 0.45)" fontSize="7" fontWeight="600" fontFamily="serif">{char}</text>
                      </g>
                    );
                  })}

                  {/* 24 Sơn Hướng */}
                  {[
                    '子', '癸', '丑', '艮', '寅', '甲',
                    '卯', '乙', '辰', '巽', '巳', '丙',
                    '午', '丁', '未', '坤', '申', '庚',
                    '酉', '辛', '戌', '乾', '亥', '壬',
                  ].map((char, i) => {
                    const deg = i * 15;
                    return (
                      <g key={`stem_${i}`} transform={`rotate(${deg})`}>
                        <line x1="0" y1="-132" x2="0" y2="-112" stroke="rgba(56, 189, 248, 0.28)" strokeWidth="0.7" />
                        <text x="0" y="-119" textAnchor="middle" fill="rgba(254, 240, 138, 0.55)" fontSize="8" fontWeight="700" fontFamily="serif">{char}</text>
                      </g>
                    );
                  })}

                  {/* 8 Quẻ Bát Quái */}
                  {[
                    { char: '乾', deg: 0,   lines: [1, 1, 1] },
                    { char: '兌', deg: 45,  lines: [0, 1, 1] },
                    { char: '離', deg: 90,  lines: [1, 0, 1] },
                    { char: '震', deg: 135, lines: [0, 0, 1] },
                    { char: '坤', deg: 180, lines: [0, 0, 0] },
                    { char: '艮', deg: 225, lines: [1, 0, 0] },
                    { char: '坎', deg: 270, lines: [0, 1, 0] },
                    { char: '巽', deg: 315, lines: [1, 1, 0] },
                  ].map((trigram, i) => (
                    <g key={`trigram_${i}`} transform={`rotate(${trigram.deg})`}>
                      <line x1="0" y1="-92" x2="0" y2="-74" stroke="rgba(56, 189, 248, 0.3)" strokeWidth="0.8" />
                      <text x="0" y="-82" textAnchor="middle" fill="rgba(56, 189, 248, 0.65)" fontSize="7.5" fontWeight="700" fontFamily="serif">{trigram.char}</text>
                      {trigram.lines.map((isYang, lineIdx) => {
                        const yPos = -68 - lineIdx * 4.5;
                        return isYang ? (
                          <line key={`yao_${lineIdx}`} x1="-8" y1={yPos} x2="8" y2={yPos} stroke="rgba(56, 189, 248, 0.6)" strokeWidth="1.6" strokeLinecap="round" />
                        ) : (
                          <g key={`yao_${lineIdx}`}>
                            <line x1="-8" y1={yPos} x2="-2" y2={yPos} stroke="rgba(56, 189, 248, 0.6)" strokeWidth="1.6" strokeLinecap="round" />
                            <line x1="2" y1={yPos} x2="8" y2={yPos} stroke="rgba(56, 189, 248, 0.6)" strokeWidth="1.6" strokeLinecap="round" />
                          </g>
                        );
                      })}
                    </g>
                  ))}
                </g>
              </g>

              {/* B. VẼ 4 NHÁNH NGÂN HÀ XOẮN ỐC (TỨ TƯỢNG QUY NHẤT TINH VÂN) */}
              {spiralArms.map((arm) => {
                const aiIconUrl = arm.lampObj?.id ? LAMP_THAN_PHAM_AI_ICONS[arm.lampObj.id] : null;
                const labelText = arm.lampObj?.shortName || arm.name;
                const labelWidth = Math.max(52, labelText.length * 6.5 + 14);

                return (
                  <g key={arm.id}>
                    {/* Dải Quỹ Đạo Xoắn Ốc Tinh Vân */}
                    <path
                      d={arm.pathD}
                      fill="none"
                      stroke={arm.isComplete ? arm.color : arm.litCount > 0 ? arm.color : 'rgba(255, 255, 255, 0.12)'}
                      strokeWidth={arm.isComplete ? 2 : arm.litCount > 0 ? 1.4 : 0.8}
                      strokeDasharray={arm.isComplete ? 'none' : '3, 4'}
                      opacity={arm.isComplete ? 0.9 : arm.litCount > 0 ? 0.65 : 0.25}
                    />

                    {/* 30 Ngôi Sao Pháp Khiếu Dọc Theo Nhánh Xoắn Ốc */}
                    {arm.stars.map((star) => (
                      <g key={star.idx}>
                        {/* Hào quang sao */}
                        <circle
                          cx={star.cx}
                          cy={star.cy}
                          r={star.isLit ? (star.isMilestone ? 4.4 : 3.4) : 1.8}
                          fill={star.isLit ? star.color : 'rgba(255, 255, 255, 0.16)'}
                          filter={star.isLit ? 'url(#superStarGlow)' : 'none'}
                          opacity={star.isLit ? 1 : 0.4}
                        />
                        {/* Nhân sáng trắng lõi sao đã khai mở */}
                        {star.isLit && (
                          <circle
                            cx={star.cx}
                            cy={star.cy}
                            r={star.isMilestone ? 2 : 1.4}
                            fill="#ffffff"
                          />
                        )}
                      </g>
                    ))}

                    {/* MỆNH ĐĂNG ĐẦU MÚT NHÁNH (OUTER TIP LIFE LAMP) */}
                    <g transform={`translate(${arm.lampPos.x}, ${arm.lampPos.y})`}>
                      {/* Nền đài đèn */}
                      <circle
                        cx="0"
                        cy="0"
                        r="18"
                        fill="rgba(10, 16, 26, 0.95)"
                        stroke={arm.isComplete ? arm.color : arm.isFireLit ? arm.color : 'rgba(255, 255, 255, 0.25)'}
                        strokeWidth="1.5"
                      />

                      {/* Ảnh AI Mệnh Đăng (rộng 36px) */}
                      {aiIconUrl ? (
                        <image
                          href={aiIconUrl}
                          x="-18"
                          y="-18"
                          width="36"
                          height="36"
                          clipPath={`url(#spiralClip_${arm.id})`}
                          preserveAspectRatio="xMidYMid slice"
                        />
                      ) : (
                        <text x="0" y="5.5" textAnchor="middle" fontSize="16">
                          {arm.isFireLit ? '🔥' : '🕯️'}
                        </text>
                      )}

                      {/* Viền hào quang */}
                      <circle
                        cx="0"
                        cy="0"
                        r="18"
                        fill="none"
                        stroke={arm.isComplete ? arm.color : arm.isFireLit ? arm.color : 'rgba(255, 255, 255, 0.35)'}
                        strokeWidth={arm.isComplete ? 2 : 1.2}
                      />

                      {/* Khung Badge tên Mệnh Đăng / Mệnh Hỏa */}
                      <g transform="translate(0, 26)">
                        <rect
                          x={-labelWidth / 2}
                          y="-8.5"
                          width={labelWidth}
                          height="17"
                          rx="8.5"
                          fill="rgba(10, 16, 26, 0.88)"
                          stroke={arm.isComplete ? arm.color : arm.isFireLit ? arm.color : 'rgba(255, 255, 255, 0.2)'}
                          strokeWidth="1"
                        />
                        <text
                          x="0"
                          y="3"
                          textAnchor="middle"
                          fill={arm.isComplete ? arm.color : arm.isFireLit ? arm.color : '#94a3b8'}
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

              {/* C. TU SĨ TỌA THIỀN Ở TRUNG TÂM (CENTER DAOIST MEDITATION) */}
              <g transform="translate(180, 185)">
                {/* Hào quang thiền định */}
                <ellipse cx="0" cy="0" rx="34" ry="38" fill="rgba(56, 189, 248, 0.08)" stroke="rgba(56, 189, 248, 0.35)" strokeWidth="1" strokeDasharray="3,3" />

                {/* Đầu tu sĩ */}
                <circle cx="0" cy="-20" r="8.5" fill="url(#daoistBodyGrad)" stroke="#38bdf8" strokeWidth="1" />

                {/* Thân & Dáng Ngồi Kiết Già */}
                <path
                  d="M 0 -12 C -9 -12, -18 -4, -20 4 C -22 13, -30 19, -28 23 C -26 27, -14 27, 0 27 C 14 27, 26 27, 28 23 C 30 19, 22 13, 20 4 C 18 -4, 9 -12, 0 -12 Z"
                  fill="url(#daoistBodyGrad)"
                  stroke="#38bdf8"
                  strokeWidth="1.2"
                />

                {/* Đan Điền Core Vàng Sáng Rực */}
                <circle cx="0" cy="10" r="5.5" fill="#ffcc00" filter="url(#superStarGlow)" className={styles.daoistDanDien} />
                <circle cx="0" cy="10" r="2.2" fill="#ffffff" />
              </g>

              {/* D. MỆNH ĐĂNG THỨ 5 (KHIẾU 121 - CỰC CẢNH THIÊN ĐỈNH ĐĂNG) */}
              <g transform="translate(180, 38)">
                {/* Tia Lôi Kiếp nối từ Thiên Đỉnh Đăng xuống Đỉnh Đầu Tu Sĩ */}
                <line
                  x1="0"
                  y1="18"
                  x2="0"
                  y2="127"
                  stroke={has121st ? '#ec4899' : 'rgba(236, 72, 153, 0.2)'}
                  strokeWidth={has121st ? 2 : 0.8}
                  strokeDasharray="3, 3"
                  className={has121st ? styles.lightningBeam121 : ''}
                />

                {/* Vòng đài Mệnh Đăng thứ 5 */}
                <circle
                  cx="0"
                  cy="0"
                  r="16"
                  fill="rgba(10, 16, 26, 0.95)"
                  stroke={has121st ? '#ec4899' : 'rgba(236, 72, 153, 0.35)'}
                  strokeWidth={has121st ? 2 : 1}
                  filter={has121st ? 'url(#superStarGlow)' : 'none'}
                />

                {/* Ảnh AI hoặc Icon Ngọn Lửa Cực Cảnh */}
                {fifthLampObj?.id && LAMP_THAN_PHAM_AI_ICONS[fifthLampObj.id] ? (
                  <image
                    href={LAMP_THAN_PHAM_AI_ICONS[fifthLampObj.id]}
                    x="-16"
                    y="-16"
                    width="32"
                    height="32"
                    clipPath="url(#spiralClip_crown)"
                    preserveAspectRatio="xMidYMid slice"
                    opacity={has121st ? 1 : 0.4}
                  />
                ) : (
                  <text x="0" y="5" textAnchor="middle" fontSize="14" opacity={has121st ? 1 : 0.4}>
                    {has121st ? '⚡' : '🕯️'}
                  </text>
                )}

                {/* Khung Badge Cực Cảnh */}
                <g transform="translate(0, -22)">
                  <rect
                    x="-42"
                    y="-8"
                    width="84"
                    height="16"
                    rx="8"
                    fill="rgba(10, 16, 26, 0.9)"
                    stroke={has121st ? '#ec4899' : 'rgba(236, 72, 153, 0.4)'}
                    strokeWidth="1"
                  />
                  <text
                    x="0"
                    y="3"
                    textAnchor="middle"
                    fill={has121st ? '#f472b6' : 'var(--text-muted)'}
                    fontSize="7.5"
                    fontWeight="700"
                    fontFamily="var(--font-serif)"
                  >
                    {has121st ? '✦ 121 CỰC CẢNH' : '121 KHIẾU'}
                  </text>
                </g>
              </g>
            </svg>
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
