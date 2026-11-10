import React from 'react';

/**
 * NgungKhiBackground
 * Lớp cảnh nền khí hải 3 tầng không gian:
 * - Hải Sơn Quyết: Núi xa mờ ảo, núi giữa uy nghiêm, tiền cảnh thẫm sắc; Huyết nhật dịu êm; sương mù trôi chậm; tàn hoả bốc lên; lôi điện xa xăm.
 * - Hóa Hải Kinh: Đại dương sâu thẳm, chùm tia sáng tán xạ (caustics), dải hải lưu lượn sóng, tuyết biển linh lực lơ lửng.
 */
export default function NgungKhiBackground({ viewMode, isMobile }) {
  const isThe = viewMode === 'the';
  const emberCount = isMobile ? 10 : 20;
  const bubbleCount = isMobile ? 10 : 20;

  return (
    <g className="ngung-khi-bg-layer">
      {/* 1. NỀN KHÔNG GIAN SÂU THẲM */}
      <rect
        x="-300"
        y="-300"
        width="1600"
        height="1300"
        fill={isThe ? 'url(#nkBgGradThe)' : 'url(#nkBgGradPhap)'}
      />

      {/* ========================================================
          CẢNH 1: HẢI SƠN QUYẾT — KHÍ HUYẾT THIÊN ĐỊA
         ======================================================== */}
      {isThe && (
        <g>
          {/* Huyết Nhật Dịu Quang (Quầng mặt trời máu vi diệu, không viền cứng) */}
          <circle
            cx="460"
            cy="290"
            r="320"
            fill="url(#nkBloodSunGlow)"
            style={{ animation: 'nkPulseSoft 8s ease-in-out infinite' }}
          />

          {/* Tia lôi điện viễn cảnh (xa xa sau rặng núi, mờ ảo, chu kỳ chậm 10s) */}
          <path
            d="M 450,70 L 438,150 L 462,195 L 445,260 L 458,310"
            stroke="#d9a441"
            strokeWidth="1.2"
            strokeOpacity="0.45"
            fill="none"
            style={{ animation: 'nkFaintLightning 10.5s ease-in-out infinite' }}
          />
          <path
            d="M 438,150 L 420,175 M 462,195 L 478,220"
            stroke="#e9d8c4"
            strokeWidth="0.8"
            strokeOpacity="0.35"
            fill="none"
            style={{ animation: 'nkFaintLightning 10.5s ease-in-out infinite' }}
          />

          {/* DÃY NÚI 3 LỚP NGHỆ THUẬT (3-LAYER MOUNTAINS) */}
          {/* Tầng 1: Núi xa mờ ảo (Pale blood-slate) */}
          <polygon
            points="0,640 120,410 270,520 460,370 650,510 800,400 920,640"
            fill="rgba(42, 14, 18, 0.45)"
          />
          {/* Tầng 2: Núi giữa trầm mặc, viền kim sắc mảnh */}
          <polygon
            points="0,640 90,470 210,570 360,435 520,555 680,425 830,545 920,640"
            fill="rgba(24, 7, 10, 0.78)"
            stroke="rgba(217, 164, 65, 0.18)"
            strokeWidth="1"
          />
          {/* Tầng 3: Tiền cảnh đồi đá sắc nét thẫm màu */}
          <polygon
            points="0,640 140,530 280,600 450,490 620,580 770,510 920,640"
            fill="rgba(12, 3, 5, 0.94)"
          />

          {/* Sương mù khí huyết lãng đãng (Mist layers) */}
          <ellipse
            cx="460"
            cy="540"
            rx="480"
            ry="75"
            fill="rgba(155, 34, 38, 0.08)"
            style={{ animation: 'nkMistDrift1 48s ease-in-out infinite' }}
          />
          <ellipse
            cx="430"
            cy="460"
            rx="360"
            ry="55"
            fill="rgba(232, 116, 59, 0.06)"
            style={{ animation: 'nkMistDrift2 65s ease-in-out infinite' }}
          />

          {/* Tàn hoả khí huyết bốc lên chậm rãi (Rising Embers) */}
          {Array.from({ length: emberCount }).map((_, idx) => {
            const startX = 60 + ((idx * 43) % 800);
            const startY = 480 + ((idx * 29) % 130);
            const size = 1.2 + (idx % 4) * 0.55;
            const duration = 4.5 + (idx % 5) * 0.9;
            const delay = (idx * 0.35) % 4;
            const emberColor = idx % 3 === 0 ? '#d9a441' : (idx % 2 === 0 ? '#e8743b' : '#9b2226');
            return (
              <circle
                key={`ember-${idx}`}
                cx={startX}
                cy={startY}
                r={size}
                fill={emberColor}
                opacity={0.65}
                style={{
                  animation: `nkEmberRise ${duration}s ease-in-out infinite`,
                  animationDelay: `${delay}s`,
                  willChange: 'transform, opacity'
                }}
              />
            );
          })}
        </g>
      )}

      {/* ========================================================
          CẢNH 2: HÓA HẢI KINH — CẤM HẢI THÂM U
         ======================================================== */}
      {!isThe && (
        <g>
          {/* Quầng sáng đáy biển trung tâm */}
          <circle
            cx="460"
            cy="290"
            r="330"
            fill="url(#nkAbyssOceanGlow)"
            style={{ animation: 'nkPulseSoft 9s ease-in-out infinite' }}
          />

          {/* Chùm tia sáng tán xạ từ mặt biển (Caustic beams) */}
          <g style={{ animation: 'nkCausticSway 10s ease-in-out infinite' }}>
            <polygon points="170,0 240,0 340,640 210,640" fill="url(#nkCausticBeam1)" />
            <polygon points="360,0 450,0 570,640 430,640" fill="url(#nkCausticBeam2)" />
            <polygon points="570,0 650,0 760,640 630,640" fill="url(#nkCausticBeam1)" />
            <polygon points="60,0 120,0 190,640 100,640" fill="url(#nkCausticBeam2)" />
          </g>

          {/* Dải hải lưu uốn lượn mềm mại (Ocean current ribbons) */}
          <g style={{ animation: 'nkCurrentDriftA 14s ease-in-out infinite', willChange: 'transform' }}>
            <path
              d="M -40,460 Q 230,420 460,470 T 960,430"
              fill="none"
              stroke="url(#nkCurrentRibbon1)"
              strokeWidth="32"
              strokeLinecap="round"
              opacity="0.55"
            />
          </g>
          <g style={{ animation: 'nkCurrentDriftB 11s ease-in-out infinite', willChange: 'transform' }}>
            <path
              d="M -40,520 Q 270,555 510,510 T 960,540"
              fill="none"
              stroke="url(#nkCurrentRibbon2)"
              strokeWidth="38"
              strokeLinecap="round"
              opacity="0.45"
            />
          </g>

          {/* Tuyết biển & Sinh vật phù du phát quang (Marine snow / plankton) */}
          {Array.from({ length: bubbleCount }).map((_, idx) => {
            const startX = 80 + ((idx * 41) % 760);
            const startY = 380 + ((idx * 27) % 200);
            const size = 1.3 + (idx % 4) * 0.55;
            const duration = 4.2 + (idx % 5) * 0.8;
            const delay = (idx * 0.32) % 3.8;
            const planktonColor = idx % 3 === 0 ? '#cfe9ee' : (idx % 2 === 0 ? '#5fb8c4' : '#1c4e6b');
            return (
              <circle
                key={`plankton-${idx}`}
                cx={startX}
                cy={startY}
                r={size}
                fill={planktonColor}
                opacity={0.7}
                style={{
                  animation: `nkPlanktonDrift ${duration}s ease-in-out infinite`,
                  animationDelay: `${delay}s`,
                  willChange: 'transform, opacity'
                }}
              />
            );
          })}
        </g>
      )}
    </g>
  );
}
