import React, { useMemo } from 'react';
import { LIFE_LAMPS, LAMP_TIERS } from '../../lib/cultivation';
import styles from './RealmPreviewVisualizer.module.css';

/**
 * RealmPreviewVisualizer — Bộ Hoạt Ảnh Tu Vi Chuyên Biệt Theo Từng Cảnh Giới:
 * 1. Ngưng Khí: Khí Hải Đan Điền & 10 Vòng Linh Mạch luân chuyển.
 * 2. Trúc Cơ: Tu sĩ tĩnh tọa giữa Tinh Đồ 120 Pháp Khiếu + 4 Vị Trí Lơ Lửng (Hỏa / Đăng) + Cực Cảnh 121 trên đỉnh đầu.
 * 3. Kim Đan: Kim Đan trung tâm + Thiên Cung từ Hư Ảo chuyển sang Hóa Thực Hoàng Kim.
 * 4. Nguyên Anh: Thiên Cung mở cửa, Đạo Anh Thần Thể tĩnh tọa với Vòng Hào Quang 5 Kiếp Luân Hồi.
 */
export default function RealmPreviewVisualizer({ cultivation }) {
  const realm = cultivation?.realm || 'ngung_khi';
  const phapKhieu = cultivation?.phapKhieu || 0;
  const selfHoa = cultivation?.selfMenhHoa || Math.floor(phapKhieu / 30);
  const has121st = !!cultivation?.has121st;
  const absorbedLamps = cultivation?.absorbedLamps || [];
  const absorbedCount = absorbedLamps.length;
  const ngungKhiLevel = cultivation?.ngungKhiLevel || 1;
  const maxThienCung = cultivation?.maxThienCung || 6;
  const realizedThienCung = cultivation?.realizedThienCung || 1;
  const daoAnhs = cultivation?.daoAnhs || [];

  // Tạo danh sách 120 điểm sao tinh đồ theo 4 Nhánh Chòm Sao Xoắn Ốc Thiên Hà (mỗi nhánh 30 sao = 1-120)
  const { constellationStars, constellationPaths } = useMemo(() => {
    const stars = [];
    const paths = [];
    const arms = 4; // 4 nhánh chòm sao (tương ứng 4 giai đoạn Trúc Cơ: 1-30, 31-60, 61-90, 91-120)
    const starsPerArm = 30;

    for (let a = 0; a < arms; a++) {
      const armBaseAngle = (a / arms) * (2 * Math.PI) - Math.PI / 4;
      const armPoints = [];

      for (let s = 0; s < starsPerArm; s++) {
        const progress = s / (starsPerArm - 1);
        // Xoắn ốc thiên hà từ bán kính 38px ra 95px, uốn lượn mượt mà
        const spiralAngle = armBaseAngle + progress * (Math.PI * 0.7);
        const radius = 38 + progress * 56;
        const cx = 100 + Math.cos(spiralAngle) * radius;
        const cy = 110 + Math.sin(spiralAngle) * (radius * 0.88);

        const idx = a * starsPerArm + s; // 0 đến 119
        const isLit = idx < phapKhieu;

        stars.push({
          idx,
          armIndex: a,
          starNum: idx + 1,
          cx,
          cy,
          isLit,
        });

        armPoints.push(`${cx.toFixed(1)},${cy.toFixed(1)}`);
      }

      paths.push({
        armIndex: a,
        d: `M ${armPoints.join(' L ')}`,
        isAnyLit: phapKhieu > a * starsPerArm,
      });
    }

    return { constellationStars: stars, constellationPaths: paths };
  }, [phapKhieu]);

  // 4 Vị Trí Xung Quanh (Tây Bắc, Đông Bắc, Tây Nam, Đông Nam)
  // Quy tắc: Nếu có Mệnh Đăng hấp thụ thì THAY THẾ ngọn hỏa tại vị trí đó bằng Mệnh Đăng!
  const surroundingSlots = useMemo(() => {
    const slots = [
      { id: 'pos_1', name: 'Vị Trí 1 (Tây Bắc)', posClass: styles.slotTopLeft },
      { id: 'pos_2', name: 'Vị Trí 2 (Đông Bắc)', posClass: styles.slotTopRight },
      { id: 'pos_3', name: 'Vị Trí 3 (Tây Nam)', posClass: styles.slotBottomLeft },
      { id: 'pos_4', name: 'Vị Trí 4 (Đông Nam)', posClass: styles.slotBottomRight },
    ];

    return slots.map((slot, index) => {
      // Kiểm tra xem có Mệnh Đăng tương ứng ở vị trí này không
      const lampId = absorbedLamps[index];
      if (lampId) {
        const lamp = LIFE_LAMPS.find(l => l.id === lampId);
        const tier = lamp ? (LAMP_TIERS[lamp.tier] || LAMP_TIERS.ha_pham) : null;
        return {
          ...slot,
          type: 'lamp',
          isLit: true,
          icon: lamp?.icon || '🏮',
          title: lamp?.shortName || lamp?.name || 'Mệnh Đăng',
          tierName: tier?.name,
          color: tier?.color || '#ffcc00',
          glow: tier?.border || 'rgba(255, 204, 0, 0.8)',
          bg: tier?.bg,
        };
      }

      // Nếu không có Mệnh Đăng: Kiểm tra Mệnh Hỏa Tự Thân (1, 2, 3, 4)
      const fireIndex = index + 1;
      const isFireLit = selfHoa >= fireIndex;
      return {
        ...slot,
        type: 'fire',
        isLit: isFireLit,
        icon: isFireLit ? '🔥' : '🕯️',
        title: `Mệnh Hỏa ${fireIndex}`,
        tierName: isFireLit ? 'Đã Thắp' : `${(fireIndex - 1) * 30 + 1}-${fireIndex * 30}`,
        color: isFireLit ? '#f97316' : 'rgba(255, 255, 255, 0.3)',
        glow: isFireLit ? 'rgba(249, 115, 22, 0.85)' : 'none',
      };
    });
  }, [absorbedLamps, selfHoa]);

  // Nếu có Mệnh Đăng thứ 5 (vị trí phụ dưới chân tọa đài)
  const fifthLamp = useMemo(() => {
    if (absorbedLamps.length >= 5) {
      const lampId = absorbedLamps[4];
      const lamp = LIFE_LAMPS.find(l => l.id === lampId);
      const tier = lamp ? (LAMP_TIERS[lamp.tier] || LAMP_TIERS.ha_pham) : null;
      return {
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
    <div className={styles.visualizerWrapper}>
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
          2. TRÚC CƠ VISUALIZER: TINH ĐỒ PHÁP KHIẾU & 4 HỎA / ĐĂNG + 121 ĐỈNH ĐẦU
         ======================================================== */}
      {realm === 'truc_co' && (
        <div className={styles.trucCoStage}>
          {/* A. BỨC TINH ĐỒ CỬU THIÊN (CELESTIAL STAR CHART BACKGROUND) */}
          <div className={styles.starChartBackdrop}>
            <svg viewBox="0 0 200 220" className={styles.starChartSvg}>
              <defs>
                <radialGradient id="starChartGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#00f2fe" stopOpacity="0.22" />
                  <stop offset="50%" stopColor="#0284c7" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Tinh bàn thiên văn */}
              <circle cx="100" cy="110" r="95" fill="url(#starChartGlow)" stroke="rgba(56, 189, 248, 0.18)" strokeWidth="1" strokeDasharray="3,3" />
              <circle cx="100" cy="110" r="70" stroke="rgba(56, 189, 248, 0.14)" strokeWidth="1" />
              <circle cx="100" cy="110" r="42" stroke="rgba(0, 242, 254, 0.2)" strokeWidth="1" strokeDasharray="2,2" />

              {/* Đường Nối Tinh Đồ Giữa Các Ngôi Sao (Constellation Spiral Lines) */}
              {constellationPaths.map((path) => (
                <path
                  key={path.armIndex}
                  d={path.d}
                  fill="none"
                  className={path.isAnyLit ? styles.constellationLineLit : styles.constellationLineDim}
                />
              ))}

              {/* 120 Ngôi Sao Pháp Khiếu Màu Xanh Dương Sáng */}
              {constellationStars.map((star) => (
                <circle
                  key={star.idx}
                  cx={star.cx}
                  cy={star.cy}
                  r={star.isLit ? 2.5 : 1.2}
                  className={`${styles.starDot} ${star.isLit ? styles.starLit : styles.starDim}`}
                  style={{ animationDelay: `${(star.idx % 15) * 0.1}s` }}
                />
              ))}
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

          {/* C. TU SĨ TĨNH TỌA THIỀN ĐỊNH Ở TRUNG TÂM */}
          <div className={styles.daoistCenterSilhouette}>
            <svg viewBox="0 0 100 120" className={styles.daoistSvg}>
              <defs>
                <linearGradient id="daoistBodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#22c3f0" stopOpacity="0.9" />
                  <stop offset="50%" stopColor="#0284c7" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0.95" />
                </linearGradient>
              </defs>
              {/* Meditating body contour */}
              <path
                d="M 50 18 Q 42 18 42 27 Q 42 34 46 38 L 38 45 Q 26 50 24 64 L 18 80 Q 14 90 26 95 L 38 98 Q 26 106 35 112 Q 50 116 65 112 Q 74 106 62 98 L 74 95 Q 86 90 82 80 L 76 64 Q 74 50 62 45 L 54 38 Q 58 34 58 27 Q 58 18 50 18 Z"
                fill="url(#daoistBodyGrad)"
                stroke="#22c3f0"
                strokeWidth="1.2"
              />
              {/* Dan Dien Core Glow */}
              <circle cx="50" cy="74" r="5" fill="#ffcc00" className={styles.daoistDanDien} />
            </svg>
          </div>

          {/* D. 4 VỊ TRÍ LƠ LỬNG XUNG QUANH (MỆNH HỎA / THAY BẰNG MỆNH ĐĂNG) */}
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
                      {slot.icon}
                    </span>
                    <span className={styles.slotName} style={{ color: slot.color }}>
                      {slot.title}
                    </span>
                  </div>
                ) : (
                  <div
                    className={`${styles.flameCardFloating} ${slot.isLit ? styles.flameCardLit : styles.flameCardDim}`}
                    style={slot.isLit ? { borderColor: 'rgba(249, 115, 22, 0.6)', boxShadow: '0 0 10px rgba(249, 115, 22, 0.3)' } : {}}
                  >
                    <span className={styles.slotIcon} style={{ filter: slot.isLit ? 'drop-shadow(0 0 6px #f97316)' : 'none' }}>
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
                  <span className={styles.slotIcon}>{fifthLamp.icon}</span>
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
          3. KIM ĐAN VISUALIZER: TÒA THIÊN LÂU (SỐ TẦNG THEO TRẦN THIÊN CUNG)
         ======================================================== */}
      {realm === 'kim_dan' && (
        <div className={styles.kimDanStage}>
          {/* Mây mù thiên giới bao quanh tòa lầu */}
          <div className={styles.towerMistyBackdrop}>
            <div className={styles.floatingCloudLeft}>☁️</div>
            <div className={styles.floatingCloudRight}>☁️</div>
          </div>

          {/* Tòa Thiên Cung Bảo Tháp */}
          <div className={styles.celestialTowerContainer}>
            {/* Mái chóp đỉnh tháp Cửu Trùng */}
            <div className={styles.towerSpire}>
              <span className={styles.spireGlow}>✦</span>
              <div className={styles.spireRoof} />
            </div>

            {/* Các Tầng Lầu Thiên Cung (Xếp từ tầng cao nhất xuống tầng 1) */}
            <div className={styles.towerFloorsList}>
              {Array.from({ length: maxThienCung }).map((_, i) => {
                // Tầng tính từ trên xuống: tầng maxThienCung -> tầng 1
                const floorNum = maxThienCung - i;
                const isRealized = realizedThienCung >= floorNum;
                const isLampPalace = (floorNum - 1) >= maxThienCung - (cultivation?.absorbedLamps || []).length;
                const da = (daoAnhs || []).find(d => d.palaceIndex === (floorNum - 1));
                const anchor = cultivation?.palaceAnchors?.[floorNum - 1];
                const isBottleneck = !isRealized && floorNum === realizedThienCung + 1 && (cultivation?.currentThienCungExp || 0) >= 799;

                return (
                  <div
                    key={floorNum}
                    className={`${styles.towerFloorRow} ${isRealized ? styles.floorRealized : isBottleneck ? styles.floorBottleneck : styles.floorHollow} ${isLampPalace ? styles.floorLamp : ''}`}
                    title={`Tầng ${floorNum} (Thiên Cung ${floorNum}): ${isRealized ? (anchor ? `Hóa Thực 100% (Trấn Áp: ${anchor.name})` : isLampPalace ? 'Chân Cung Đăng (Hóa Thực 100%)' : 'Hóa Thực Cung Thật') : isBottleneck ? 'Đạt 99.99% (Đang chờ Khảm Nạm Vật Trấn Áp)' : 'Hư Ảo (Mây mù bao phủ)'}`}
                  >
                    {/* Mái ngói nhỏ của tầng */}
                    <div className={styles.floorRoofLine} />

                    {/* Gian phòng đan điện bên trong tầng lầu */}
                    <div className={styles.floorChamber}>
                      {/* Số tầng bên trái */}
                      <span className={styles.floorNumberBadge}>T{floorNum}</span>

                      {/* Nội điện: Đã hóa thật thì có Kim Đan tỏa sáng, 99.99% thì báo chờ vật trấn áp, chưa hóa thật thì có Mây Mù bao phủ */}
                      {isRealized ? (
                        <div className={styles.realizedChamberContent}>
                          {/* Viên Kim Đan tỏa sáng bên trong */}
                          <div className={styles.goldenCoreOrbInside}>
                            <span className={styles.orbGlowCore}>🟡</span>
                            <span className={styles.orbShimmerSparkle}>✨</span>
                          </div>
                          <span className={styles.chamberTitle}>
                            {da ? `${da.name}` : anchor ? `${anchor.icon} ${anchor.shortName}` : isLampPalace ? '🏮 Chân Cung Đăng' : `Cung Thật ${floorNum}`}
                          </span>
                        </div>
                      ) : isBottleneck ? (
                        <div className={styles.bottleneckChamberContent}>
                          <span className={styles.bottleneckIcon}>⚠️</span>
                          <span className={styles.bottleneckText}>99.99% · Cần Vật Trấn Áp</span>
                        </div>
                      ) : (
                        <div className={styles.hollowChamberContent}>
                          <span className={styles.hollowMistIcon}>☁️</span>
                          <span className={styles.hollowMistText}>Mây mù hư ảo...</span>
                        </div>
                      )}

                      {/* Biểu tượng trạng thái bên phải */}
                      <span className={styles.floorRightBadge}>
                        {da ? '👑' : anchor ? anchor.icon : isLampPalace ? '🏮' : isRealized ? '🏛️' : isBottleneck ? '🔑' : '🌫️'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.stageStatusBadge}>
            <span>🏛️ TÒA THIÊN LÂU: {realizedThienCung}/{maxThienCung} TẦNG HÓA THẬT (CÓ KIM ĐAN)</span>
          </div>
        </div>
      )}

      {/* ========================================================
          4. NGUYÊN ANH VISUALIZER
         ======================================================== */}
      {(realm === 'gia_anh' || realm === 'nguyen_anh') && (
        <div className={styles.nguyenAnhStage}>
          {/* Celestial Gateway */}
          <div className={styles.celestialGateway}>
            <div className={styles.gatewayArch} />
            <div className={styles.tribulationLightning} />
          </div>

          {/* Central Showcase */}
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

              {/* Meditating Celestial Infant Body (Đạo Anh Thần Thể Tọa Thiền) */}
              <div className={styles.infantEntity}>
                <span className={styles.infantCrown} style={{ filter: 'drop-shadow(0 0 10px #22c3f0)' }}>🧘</span>
                <span className={styles.infantBody}>✨</span>
              </div>
            </div>

            {/* Orbiting Dao Anh Guardians with Trấn Cung Bảo Vật & Công Pháp */}
            <div className={styles.daoAnhsOrbitList}>
              {(daoAnhs || []).slice(0, 9).map((da, idx) => {
                const totalCount = Math.max(1, Math.min(9, daoAnhs.length));
                const angle = (idx / totalCount) * 360;
                const palaceIdx = da.palaceIndex ?? idx;
                const anchor = cultivation?.palaceAnchors?.[palaceIdx];
                const isLamp = da.fromLamp || palaceIdx >= (maxThienCung - (cultivation?.absorbedLamps || []).length);
                const lampId = isLamp ? (cultivation?.absorbedLamps || [])[palaceIdx - (maxThienCung - (cultivation?.absorbedLamps || []).length)] : null;
                const lamp = lampId ? LIFE_LAMPS.find(l => l.id === lampId) : null;
                const lampTier = lamp ? (LAMP_TIERS[lamp.tier] || LAMP_TIERS.ha_pham) : null;

                // Hoạt ảnh Bảo Vật Trấn Áp / Công Pháp trấn thủ cung
                let artifactIcon = '🗡️';
                let artifactColor = '#ffcc00';
                let artifactName = da.name;

                if (anchor) {
                  artifactIcon = anchor.icon;
                  artifactColor = anchor.color || '#38bdf8';
                  artifactName = anchor.shortName || anchor.name;
                } else if (lamp) {
                  artifactIcon = lamp.icon;
                  artifactColor = lampTier?.color || '#ffcc00';
                  artifactName = lamp.shortName || lamp.name;
                } else {
                  // Mẫu Trấn Cung Bảo Vật & Công Pháp đa dạng luân chuyển
                  const defaultArtifacts = [
                    { icon: '🌌', color: '#ff4d4f', name: 'Hỗn Độn Sơ Khai' },
                    { icon: '🗡️', color: '#38bdf8', name: 'Tru Tiên Kiếm' },
                    { icon: '📜', color: '#ffcc00', name: 'Vô Thượng Tâm Kinh' },
                    { icon: '🏺', color: '#a855f7', name: 'Thôn Thiên Ma Bình' },
                    { icon: '⚡', color: '#22c3f0', name: 'Bôn Lôi Kiếm Quyết' },
                    { icon: '🪷', color: '#34d399', name: 'Hỗn Độn Thanh Liên' },
                    { icon: '⏳', color: '#f59e0b', name: 'Khởi Nguyên Thời Không' },
                    { icon: '🛡️', color: '#60a5fa', name: 'Kim Cương Thần Thể' },
                    { icon: '🔮', color: '#ec4899', name: 'Vận Mệnh Thần Châu' },
                  ];
                  const item = defaultArtifacts[palaceIdx % defaultArtifacts.length];
                  artifactIcon = item.icon;
                  artifactColor = item.color;
                  artifactName = item.name;
                }

                return (
                  <div
                    key={da.id}
                    className={`${styles.orbitDaoAnhMini} ${da.fromLamp ? styles.orbitLampProtected : ''}`}
                    style={{
                      transform: `rotate(${angle}deg) translate(100px) rotate(-${angle}deg)`,
                      borderColor: artifactColor,
                      boxShadow: `0 0 10px ${artifactColor}55`,
                    }}
                    title={`${da.name} · Trấn Vật: ${artifactName} (Kiếp ${da.currentKiep}/5)`}
                  >
                    <span
                      className={styles.miniIcon}
                      style={{
                        filter: `drop-shadow(0 0 6px ${artifactColor})`,
                      }}
                    >
                      {artifactIcon}
                    </span>
                    <span className={styles.miniKiep} style={{ color: artifactColor }}>
                      {da.currentKiep}K
                    </span>
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
