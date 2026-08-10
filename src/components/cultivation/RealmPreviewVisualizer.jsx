import React, { useMemo } from 'react';
import styles from './RealmPreviewVisualizer.module.css';

/**
 * RealmPreviewVisualizer — Bộ Hoạt Ảnh Tu Vi Chuyên Biệt Theo Từng Cảnh Giới:
 * 1. Ngưng Khí: Khí Hải Đan Điền & 10 Vòng Linh Mạch luân chuyển.
 * 2. Trúc Cơ: Nhân Thể Pháp Khiếu (120 khiếu sáng rực) + Trụ Mệnh Hỏa + Khiếu 121 Tử Phủ Cực Cảnh.
 * 3. Kim Đan: Kim Đan trung tâm + Thiên Cung từ Hư Ảo chuyển sang Hóa Thực Hoàng Kim.
 * 4. Nguyên Anh: Thiên Cung mở cửa, Đạo Anh Thần Thể tĩnh tọa với Vòng Hào Quang 5 Kiếp Luân Hồi.
 */
export default function RealmPreviewVisualizer({ cultivation }) {
  const realm = cultivation?.realm || 'ngung_khi';
  const phapKhieu = cultivation?.phapKhieu || 0;
  const selfHoa = cultivation?.selfMenhHoa || Math.floor(phapKhieu / 30);
  const has121st = !!cultivation?.has121st;
  const absorbedCount = (cultivation?.absorbedLamps || []).length;
  const totalHoa = selfHoa + (has121st ? 1 : 0) + absorbedCount;
  const ngungKhiLevel = cultivation?.ngungKhiLevel || 1;
  const maxThienCung = cultivation?.maxThienCung || 6;
  const realizedThienCung = cultivation?.realizedThienCung || 1;
  const daoAnhs = cultivation?.daoAnhs || [];

  return (
    <div className={styles.visualizerWrapper}>
      {/* 1. NGƯNG KHÍ VISUALIZER */}
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

      {/* 2. TRÚC CƠ VISUALIZER: NHÂN THỂ PHÁP KHIẾU & MỆNH HỎA */}
      {realm === 'truc_co' && (
        <div className={styles.trucCoStage}>
          {/* Flame aura surrounding the body */}
          <div className={styles.flameAuraContainer}>
            {Array.from({ length: Math.min(10, totalHoa) }).map((_, i) => {
              const angle = (i / Math.min(10, totalHoa)) * 360;
              return (
                <div
                  key={i}
                  className={styles.orbitingFlame}
                  style={{
                    transform: `rotate(${angle}deg) translate(95px) rotate(-${angle}deg)`,
                    animationDelay: `${i * 0.3}s`,
                  }}
                >
                  <span className={styles.flameSymbol}>🔥</span>
                </div>
              );
            })}
          </div>

          {/* Human Body Meditating Silhouette with Acupoints */}
          <div className={styles.bodySilhouetteWrap}>
            <svg viewBox="0 0 200 240" className={styles.bodySvg}>
              <defs>
                <radialGradient id="bodyGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#22c3f0" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="meridianLine" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#ffcc00" stopOpacity="0.8" />
                  <stop offset="50%" stopColor="#22c3f0" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#ffcc00" stopOpacity="0.8" />
                </linearGradient>
              </defs>

              {/* Meditating body contour */}
              <path
                d="M 100 45 Q 85 45 85 62 Q 85 75 92 82 L 80 95 Q 60 102 55 125 L 45 155 Q 40 175 60 185 L 80 190 Q 60 205 75 218 Q 100 225 125 218 Q 140 205 120 190 L 140 185 Q 160 175 155 155 L 145 125 Q 140 102 120 95 L 108 82 Q 115 75 115 62 Q 115 45 100 45 Z"
                className={styles.bodyOutline}
              />
              <circle cx="100" cy="140" r="70" fill="url(#bodyGlow)" />

              {/* Central Chong Mai / Ren Mai meridian line */}
              <line x1="100" y1="50" x2="100" y2="195" stroke="url(#meridianLine)" strokeWidth="2" strokeDasharray="3,3" />

              {/* 120 Pháp Khiếu Acupoints Array Map */}
              {Array.from({ length: 60 }).map((_, idx) => {
                // Generate left & right mirrored acupoints (total ~120 points mapped)
                const isLeft = idx % 2 === 0;
                const row = Math.floor(idx / 2);
                const cy = 55 + row * 4.6;
                const spread = Math.sin((row / 30) * Math.PI) * 35;
                const cx = isLeft ? 100 - spread : 100 + spread;
                const pointNum = idx * 2 + 1;
                const isLit = phapKhieu >= pointNum;

                return (
                  <circle
                    key={idx}
                    cx={cx}
                    cy={cy}
                    r={isLit ? 2.5 : 1.2}
                    className={`${styles.phapKhieuDot} ${isLit ? styles.phapKhieuLit : styles.phapKhieuDim}`}
                    style={{ animationDelay: `${(idx % 10) * 0.1}s` }}
                  />
                );
              })}

              {/* Dan Dien Fire Core (Center of chest/abdomen) */}
              <circle cx="100" cy="145" r="8" className={styles.danDienFireCore} />

              {/* Secret 121st Acupoint at Baihui / Crown of head */}
              {has121st ? (
                <g className={styles.secret121GlowGroup}>
                  <circle cx="100" cy="42" r="6" className={styles.secret121Dot} />
                  <circle cx="100" cy="42" r="14" className={styles.secret121Halo} />
                  <text x="100" y="30" textAnchor="middle" className={styles.secret121Label}>✦ 121 KHIẾU</text>
                </g>
              ) : (
                <circle cx="100" cy="42" r="2" className={styles.secret121Unlit} />
              )}
            </svg>
          </div>

          <div className={styles.stageStatusBadge}>
            <span>🔥 {phapKhieu}/120 PHÁP KHIẾU {has121st && '· CỰC CẢNH 121'}</span>
          </div>
        </div>
      )}

      {/* 3. KIM ĐAN VISUALIZER: KIM ĐAN & THIÊN CUNG TỪ HƯ HÓA THẬT */}
      {realm === 'kim_dan' && (
        <div className={styles.kimDanStage}>
          {/* Golden Core Center */}
          <div className={styles.goldenCoreWrap}>
            <div className={styles.goldenCoreCenter} />
            <div className={styles.goldenCoreShimmer} />
            <div className={styles.goldenCoreAura} />
          </div>

          {/* Orbiting Celestial Palaces Array (Hư Ảo -> Hóa Thật) */}
          <div className={styles.palacesOrbitArray}>
            {Array.from({ length: maxThienCung }).map((_, i) => {
              const palaceNum = i + 1;
              const isRealized = realizedThienCung >= palaceNum;
              const isLampPalace = i >= maxThienCung - (cultivation?.absorbedLamps || []).length;
              const angle = (i / maxThienCung) * 360;

              return (
                <div
                  key={palaceNum}
                  className={`${styles.palaceOrbitNode} ${isRealized ? styles.nodeRealized : styles.nodeHollow} ${isLampPalace ? styles.nodeLamp : ''}`}
                  style={{
                    transform: `rotate(${angle}deg) translate(105px) rotate(-${angle}deg)`,
                  }}
                  title={`Thiên Cung ${palaceNum}: ${isRealized ? 'Hóa Thực Cung Thật' : 'Cung Hư Ảo'}`}
                >
                  <div className={styles.palaceIconWrap}>
                    <span className={styles.palaceEmoji}>
                      {isLampPalace ? '🏮' : isRealized ? '🏛️' : '☁️'}
                    </span>
                  </div>
                  <span className={styles.palaceMiniLabel}>
                    {isLampPalace ? `Cung ${palaceNum}★` : isRealized ? `Cung ${palaceNum}` : `Hư ${palaceNum}`}
                  </span>
                </div>
              );
            })}
          </div>

          <div className={styles.stageStatusBadge}>
            <span>🏛️ ĐÃ HÓA THỰC: {realizedThienCung}/{maxThienCung} CUNG THẬT</span>
          </div>
        </div>
      )}

      {/* 4. NGUYÊN ANH / GIẢ ANH VISUALIZER: ĐẠO ANH TỌA TRẤN THIÊN CUNG */}
      {(realm === 'gia_anh' || realm === 'nguyen_anh') && (
        <div className={styles.nguyenAnhStage}>
          {/* Celestial Gateway / Heavenly Tribulation Lightning Backdrop */}
          <div className={styles.celestialGateway}>
            <div className={styles.gatewayArch} />
            <div className={styles.tribulationLightning} />
          </div>

          {/* Central Showcase: Supreme Dao Anh in Lotus Position */}
          <div className={styles.daoAnhShowcaseWrap}>
            <div className={styles.daoAnhAvatarBox}>
              <div className={styles.daoAnhKiepHalo}>
                {/* Halo rings representing 5 Tribulation Kieps */}
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

              {/* Meditating Celestial Infant Body */}
              <div className={styles.infantEntity}>
                <span className={styles.infantCrown}>👑</span>
                <span className={styles.infantBody}>✨</span>
              </div>
            </div>

            {/* Orbiting Dao Anh Guardians */}
            <div className={styles.daoAnhsOrbitList}>
              {(daoAnhs || []).slice(0, 8).map((da, idx) => {
                const angle = (idx / Math.max(1, Math.min(8, daoAnhs.length))) * 360;
                return (
                  <div
                    key={da.id}
                    className={`${styles.orbitDaoAnhMini} ${da.fromLamp ? styles.orbitLampProtected : ''}`}
                    style={{
                      transform: `rotate(${angle}deg) translate(100px) rotate(-${angle}deg)`,
                    }}
                    title={`${da.name} (Kiếp ${da.currentKiep}/5)`}
                  >
                    <span className={styles.miniIcon}>{da.fromLamp ? '🏮' : '👑'}</span>
                    <span className={styles.miniKiep}>{da.currentKiep}K</span>
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
