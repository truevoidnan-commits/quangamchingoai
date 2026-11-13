import React from 'react';
import imgHuyetHoGod from '../../../assets/images/huyet_ho_god.webp';
import imgLongKinhGod from '../../../assets/images/long_kinh_god.webp';

/**
 * NgungKhiBeast
 * Hiển thị Thần thú Huyết Hổ (Hải Sơn) và Thái Cổ Long Kình (Hóa Hải)
 * - Khử hiệu ứng drop-shadow nhựa gắt
 * - Quầng sáng nền dịu nhẹ (soft radial aura)
 * - Hòa trộn đáy bằng dải sương mù/sóng nước (mist fade)
 * - Chuyển động lơ lửng 60fps mượt mà
 * - Biển hiệu khắc kim thạch cổ kính (engraved plaques) viền mảnh, ký hiệu hoa thị ◇
 */
export default function NgungKhiBeast({
  viewMode,
  theLvl,
  phapLvl,
  hasTiger,
  hasWhale,
}) {
  const isThe = viewMode === 'the';

  if (isThe && !hasTiger) return null;
  if (!isThe && !hasWhale) return null;

  return (
    <g transform="translate(460, 290)" className="ngung-khi-beast-layer">
      {/* ========================================================
          THẦN THÚ HUYẾT HỔ — HẢI SƠN QUYẾT
         ======================================================== */}
      {isThe && hasTiger && (
        <g
          transform="translate(0, -25)"
          style={{
            animation: 'nkTigerMajestic 5.2s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite',
            transformOrigin: '0px 0px',
            willChange: 'transform'
          }}
        >
          {/* Quầng sáng dịu nhẹ tự nhiên sau lưng Huyết Hổ */}
          <circle cx="0" cy="0" r="190" fill="url(#nkTigerSoftAura)" />

          {/* Vết cào khí huyết thanh nhã mờ ảo */}
          <g style={{ animation: 'nkClawShimmer 3.2s ease-in-out infinite', opacity: 0.7 }}>
            <path
              d="M -155,-90 Q -115,-55 -85,-32"
              stroke="#d9a441"
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
              strokeOpacity="0.65"
            />
            <path
              d="M -135,-106 Q -98,-70 -70,-44"
              stroke="#e8743b"
              strokeWidth="1.4"
              strokeLinecap="round"
              fill="none"
              strokeOpacity="0.55"
            />
            <path
              d="M 155,-90 Q 115,-55 85,-32"
              stroke="#d9a441"
              strokeWidth="1.6"
              strokeLinecap="round"
              fill="none"
              strokeOpacity="0.65"
            />
            <path
              d="M 135,-106 Q 98,-70 70,-44"
              stroke="#e8743b"
              strokeWidth="1.4"
              strokeLinecap="round"
              fill="none"
              strokeOpacity="0.55"
            />
          </g>

          {/* Hình ảnh Huyết Hổ với ánh sáng viền screen và bóng đổ dịu */}
          <image
            href={imgHuyetHoGod}
            x="-225"
            y="-115"
            width="450"
            height="210"
            preserveAspectRatio="xMidYMid meet"
            style={{
              filter: 'drop-shadow(0 4px 18px rgba(217, 164, 65, 0.35)) drop-shadow(0 8px 32px rgba(155, 34, 38, 0.3))',
              pointerEvents: 'none',
              willChange: 'transform'
            }}
          />

          {/* Dải sương mù che nhẹ chân hổ tạo hiệu ứng đạp mây đạp sương */}
          <ellipse
            cx="0"
            cy="75"
            rx="180"
            ry="24"
            fill="url(#nkTigerMistFade)"
          />

          {/* Biển hiệu tên Thần Thú: Tấm thẻ ngọc cổ khắc chữ kim thạch */}
          <g transform="translate(0, 118)">
            {/* Tấm nền đá sẫm viền kim loại mảnh */}
            <rect
              x="-110"
              y="-13"
              width="220"
              height="26"
              rx="4"
              fill="rgba(20, 8, 10, 0.92)"
              stroke="rgba(217, 164, 65, 0.5)"
              strokeWidth="1"
            />
            <rect
              x="-107"
              y="-10"
              width="214"
              height="20"
              rx="2"
              fill="none"
              stroke="rgba(232, 116, 59, 0.22)"
              strokeWidth="0.65"
            />

            {/* Họa tiết hoa thị ◇ ở hai đầu */}
            <text x="-95" y="4.5" textAnchor="middle" fontSize="9" fill="#d9a441" opacity="0.8">◇</text>
            <text x="95" y="4.5" textAnchor="middle" fontSize="9" fill="#d9a441" opacity="0.8">◇</text>

            {/* Danh hiệu khắc chữ */}
            <text
              y="4.5"
              textAnchor="middle"
              fontSize="11.5"
              fontWeight="700"
              fill="#e9d8c4"
              style={{
                fontFamily: 'serif',
                letterSpacing: '0.16em',
                userSelect: 'none'
              }}
            >
              {theLvl >= 10 ? 'THẦN THÚ HUYẾT HỔ' : 'HUYẾT HỔ HÓA HÌNH'}
            </text>
          </g>
        </g>
      )}

      {/* ========================================================
          THÁI CỔ LONG KÌNH — HÓA HẢI KINH
         ======================================================== */}
      {!isThe && hasWhale && (
        <g
          transform="translate(0, -22)"
          style={{
            animation: 'nkWhaleMajestic 6.4s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite',
            transformOrigin: '0px 0px',
            willChange: 'transform'
          }}
        >
          {/* Quầng sáng vực sâu dịu dàng quanh Long Kình */}
          <ellipse cx="0" cy="0" rx="215" ry="115" fill="url(#nkWhaleSoftAura)" />

          {/* Dải sóng nước lượn quanh thân kình */}
          <g style={{ animation: 'nkWaveRipple 4.5s ease-in-out infinite', opacity: 0.65 }}>
            <ellipse
              cx="0"
              cy="25"
              rx="170"
              ry="26"
              fill="none"
              stroke="rgba(95, 184, 196, 0.35)"
              strokeWidth="0.8"
              strokeDasharray="16 10"
            />
            <ellipse
              cx="0"
              cy="35"
              rx="210"
              ry="32"
              fill="none"
              stroke="rgba(28, 78, 107, 0.28)"
              strokeWidth="0.8"
            />
          </g>

          {/* Hình ảnh Long Kình với ánh sáng xanh ngọc vực thẳm */}
          <image
            href={imgLongKinhGod}
            x="-235"
            y="-103"
            width="470"
            height="206"
            preserveAspectRatio="xMidYMid meet"
            style={{
              filter: 'drop-shadow(0 4px 18px rgba(95, 184, 196, 0.35)) drop-shadow(0 8px 34px rgba(28, 78, 107, 0.3))',
              pointerEvents: 'none',
              willChange: 'transform'
            }}
          />

          {/* Đáy nước sâu mờ ảo phủ nhẹ phần bụng */}
          <ellipse
            cx="0"
            cy="70"
            rx="190"
            ry="22"
            fill="url(#nkWhaleAbyssFade)"
          />

          {/* Tinh hoa ngọc phù du quanh thân kình */}
          <circle cx="-160" cy="15" r="2.2" fill="#cfe9ee" opacity="0.6" />
          <circle cx="-180" cy="35" r="1.6" fill="#5fb8c4" opacity="0.5" />
          <circle cx="155" cy="-25" r="1.8" fill="#cfe9ee" opacity="0.55" />
          <circle cx="175" cy="-8" r="1.4" fill="#5fb8c4" opacity="0.65" />

          {/* Biển hiệu tên Thần Thú: Tấm thẻ u ngọc khắc chữ */}
          <g transform="translate(0, 118)">
            {/* Tấm nền ngọc thẫm viền ngọc bích mảnh */}
            <rect
              x="-110"
              y="-13"
              width="220"
              height="26"
              rx="4"
              fill="rgba(5, 20, 28, 0.92)"
              stroke="rgba(95, 184, 196, 0.5)"
              strokeWidth="1"
            />
            <rect
              x="-107"
              y="-10"
              width="214"
              height="20"
              rx="2"
              fill="none"
              stroke="rgba(28, 78, 107, 0.3)"
              strokeWidth="0.65"
            />

            {/* Họa tiết hoa thị ◇ ở hai đầu */}
            <text x="-95" y="4.5" textAnchor="middle" fontSize="9" fill="#5fb8c4" opacity="0.8">◇</text>
            <text x="95" y="4.5" textAnchor="middle" fontSize="9" fill="#5fb8c4" opacity="0.8">◇</text>

            {/* Danh hiệu khắc chữ */}
            <text
              y="4.5"
              textAnchor="middle"
              fontSize="11.5"
              fontWeight="700"
              fill="#cfe9ee"
              style={{
                fontFamily: 'serif',
                letterSpacing: '0.16em',
                userSelect: 'none'
              }}
            >
              {phapLvl >= 10 ? 'THÁI CỔ LONG KÌNH' : 'CẤM HẢI LONG KÌNH'}
            </text>
          </g>
        </g>
      )}
    </g>
  );
}
