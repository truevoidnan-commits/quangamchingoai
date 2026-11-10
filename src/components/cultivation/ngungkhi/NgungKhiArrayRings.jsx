import React, { useMemo } from 'react';

/**
 * NgungKhiArrayRings
 * Vòng linh trận cổ kính chạm khắc trên đá:
 * - Vành đo độ (60 ticks thiên văn, mỗi 5 vạch dài hơn)
 * - Vành Bát Quái cổ văn xoay chậm rãi
 * - Các đường nét ngắt quãng vành thiên bàn
 * - 10 Tầng cảnh giới: đã mở (sáng màu trầm quý phái), chưa mở (nét sợi tóc mờ), hiện tại (sáng dịu + tinh sao hộ trận)
 * - Lõi đan điền cổ ấn thái cực tinh mỹ
 */
export default function NgungKhiArrayRings({
  viewMode,
  theLvl,
  phapLvl,
  playStarChime,
}) {
  const isThe = viewMode === 'the';
  const currentLvl = isThe ? theLvl : phapLvl;
  const isMaxLvl = currentLvl >= 10;

  // Tính toán 60 vạch đo độ cổ kính
  const degreeTicks = useMemo(() => {
    const ticks = [];
    const R = 244;
    for (let i = 0; i < 60; i++) {
      const angle = (i * 6 * Math.PI) / 180;
      const isMajor = i % 5 === 0;
      const len = isMajor ? 5.5 : 2.8;
      const x1 = (R - len) * Math.cos(angle);
      const y1 = (R - len) * Math.sin(angle);
      const x2 = R * Math.cos(angle);
      const y2 = R * Math.sin(angle);
      ticks.push({
        id: i,
        x1,
        y1,
        x2,
        y2,
        isMajor
      });
    }
    return ticks;
  }, []);

  const trigrams = ['☰', '☱', '☲', '☳', '☴', '☵', '☶', '☷'];

  return (
    <g transform="translate(460, 290)" className="ngung-khi-array-disc">
      {/* 1. TIA LINH MẠCH BÁT HƯỚNG MẢNH MAI */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, idx) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 48 * Math.cos(rad);
        const y1 = 48 * Math.sin(rad);
        const x2 = 246 * Math.cos(rad);
        const y2 = 246 * Math.sin(rad);
        const rayColor = isThe ? '#d9a441' : '#5fb8c4';
        return (
          <g key={`ray-${idx}`}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={rayColor}
              strokeWidth="0.8"
              strokeOpacity="0.22"
              strokeDasharray="6 4"
            />
            <circle
              cx={x2}
              cy={y2}
              r="1.8"
              fill={rayColor}
              opacity="0.5"
            />
          </g>
        );
      })}

      {/* 2. VÀNH THIÊN BÀN ĐO ĐỘ CỔ KÍNH */}
      <g opacity="0.45">
        <circle
          cx="0"
          cy="0"
          r="245"
          fill="none"
          stroke={isThe ? '#d9a441' : '#5fb8c4'}
          strokeWidth="0.75"
        />
        {degreeTicks.map((t) => (
          <line
            key={t.id}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={isThe ? (t.isMajor ? '#d9a441' : '#9b2226') : (t.isMajor ? '#5fb8c4' : '#1c4e6b')}
            strokeWidth={t.isMajor ? 1.2 : 0.65}
            strokeOpacity={t.isMajor ? 0.75 : 0.4}
          />
        ))}
      </g>

      {/* 3. VÒNG BÁT QUÁI CỔ NGỮ (XOAY CHẬM RÃI 90S) */}
      <g style={{ transformOrigin: '0 0', animation: 'nkTrigramRotate 90s linear infinite', willChange: 'transform' }}>
        <circle
          cx="0"
          cy="0"
          r="256"
          fill="none"
          stroke={isThe ? '#d9a441' : '#5fb8c4'}
          strokeWidth="0.8"
          strokeDasharray="18 8 4 8"
          opacity="0.38"
        />
        <circle
          cx="0"
          cy="0"
          r="234"
          fill="none"
          stroke={isThe ? '#e8743b' : '#38bdf8'}
          strokeWidth="0.65"
          strokeDasharray="4 6"
          opacity="0.25"
        />

        {trigrams.map((sym, sIdx) => {
          const sAngle = (sIdx * 45 * Math.PI) / 180;
          const symX = 252 * Math.cos(sAngle);
          const symY = 252 * Math.sin(sAngle);
          return (
            <text
              key={`trigram-${sIdx}`}
              x={symX}
              y={symY + 4}
              textAnchor="middle"
              fontSize="10"
              fill={isThe ? '#e9d8c4' : '#cfe9ee'}
              opacity="0.65"
              style={{
                fontFamily: 'serif',
                userSelect: 'none'
              }}
            >
              {sym}
            </text>
          );
        })}
      </g>

      {/* VÒNG NGOẠI VI VIÊN MÃN (KHI ĐẠT ĐẠI THÀNH TẦNG 10) */}
      {isMaxLvl && (
        <g style={{ transformOrigin: '0 0', animation: 'nkPulseAura 6s ease-in-out infinite' }}>
          <circle
            cx="0"
            cy="0"
            r="268"
            fill="none"
            stroke={isThe ? '#d9a441' : '#5fb8c4'}
            strokeWidth="1.2"
            strokeDasharray="6 12 24 12"
            opacity="0.55"
          />
          <circle
            cx="0"
            cy="0"
            r="270"
            fill="none"
            stroke={isThe ? '#e8743b' : '#cfe9ee'}
            strokeWidth="0.5"
            opacity="0.3"
          />
        </g>
      )}

      {/* 4. 10 VÒNG LINH MẠCH CẢNH GIỚI TIẾP NỐI */}
      {Array.from({ length: 10 }).map((_, i) => {
        const layerNum = i + 1;
        const isReached = currentLvl >= layerNum;
        const isCurrent = currentLvl === layerNum;
        const ringR = 52 + layerNum * 17.5;

        const strokeWidth = isCurrent ? 1.8 : (isReached ? 1.2 : 0.55);
        const strokeOpacity = isCurrent ? 0.95 : (isReached ? 0.65 : 0.16);
        const strokeColor = isReached
          ? (isThe ? 'url(#nkRingReachedThe)' : 'url(#nkRingReachedPhap)')
          : (isThe ? 'rgba(155, 34, 38, 0.22)' : 'rgba(28, 78, 107, 0.22)');

        return (
          <g key={`ring-layer-${layerNum}`}>
            {/* Vòng nền mờ hoặc vầng sáng khi đạt */}
            {isReached && (
              <circle
                cx="0"
                cy="0"
                r={ringR}
                fill="none"
                stroke={isThe ? '#d9a441' : '#5fb8c4'}
                strokeWidth={strokeWidth + 1.6}
                strokeOpacity="0.08"
              />
            )}
            <circle
              cx="0"
              cy="0"
              r={ringR}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeOpacity={strokeOpacity}
              strokeDasharray={isReached ? undefined : '2 4'}
            />

            {/* Tinh sao hộ trận trên tầng hiện tại */}
            {isCurrent && (
              <g style={{ transformOrigin: '0 0', animation: 'nkOrbitStar 12s linear infinite', willChange: 'transform' }}>
                <circle
                  cx={ringR}
                  cy="0"
                  r="3.5"
                  fill="#ffffff"
                  filter="url(#nkGlowSoft)"
                />
                <circle
                  cx={ringR}
                  cy="0"
                  r="1.8"
                  fill={isThe ? '#d9a441' : '#5fb8c4'}
                />
                <circle
                  cx={-ringR}
                  cy="0"
                  r="2.2"
                  fill={isThe ? '#e8743b' : '#cfe9ee'}
                  opacity="0.75"
                />
              </g>
            )}
          </g>
        );
      })}

      {/* 5. CỔ TRẬN ĐAN ĐIỀN TRUNG TÂM (ANCIENT SEAL CORE) */}
      <g
        style={{
          transformOrigin: '0 0',
          animation: isThe ? 'nkSpinSlow 28s linear infinite' : 'nkSpinReverse 32s linear infinite',
          willChange: 'transform'
        }}
      >
        {/* Nền lõi đan điền với chuyển sắc nhiều tầng */}
        <circle cx="0" cy="0" r="46" fill={isThe ? 'url(#nkCoreGradThe)' : 'url(#nkCoreGradPhap)'} />
        {/* Viền kim loại cổ */}
        <circle
          cx="0"
          cy="0"
          r="48"
          fill="none"
          stroke={isThe ? '#d9a441' : '#5fb8c4'}
          strokeWidth="1.2"
          opacity="0.7"
        />
        <circle
          cx="0"
          cy="0"
          r="42"
          fill="none"
          stroke={isThe ? '#9b2226' : '#1c4e6b'}
          strokeWidth="0.8"
          strokeDasharray="6 3"
          opacity="0.5"
        />

        {/* Họa tiết Cổ Khí / Âm Dương Thái Cực thanh nhã */}
        <path
          d="M 0,-38 C 21,-38 21,0 0,0 C -21,0 -21,38 0,38 C 21,38 21,0 0,0 C -21,0 -21,-38 0,-38 Z"
          fill={isThe ? 'rgba(217, 164, 65, 0.16)' : 'rgba(95, 184, 196, 0.16)'}
          stroke={isThe ? '#d9a441' : '#5fb8c4'}
          strokeWidth="0.7"
          strokeOpacity="0.45"
        />
        <circle
          cx="0"
          cy="-18"
          r="3"
          fill={isThe ? '#d9a441' : '#cfe9ee'}
          opacity="0.75"
        />
        <circle
          cx="0"
          cy="18"
          r="3"
          fill={isThe ? '#9b2226' : '#1c4e6b'}
          opacity="0.75"
        />
        <circle
          cx="0"
          cy="0"
          r="6"
          fill={isThe ? '#e8743b' : '#5fb8c4'}
          opacity="0.8"
        />
      </g>
    </g>
  );
}
