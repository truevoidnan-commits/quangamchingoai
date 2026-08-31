import React from 'react';
import { getDaoAnhEvolutionImage, getDaoAnhTransformStyle, getAssetUrl } from '../../lib/daoAnhData';

/**
 * DAO ANH AVATAR RENDERER
 * Vector SVG tái hiện chân thân Chibi Tiên Thai Lưu Ly (Nguyên Anh Thần Thể)
 * Dựa trên cấu trúc 2 hình mẫu gốc:
 * - Thân thể lưu ly trong suốt có gradient bóng mờ và phản quang ánh sáng
 * - Đôi mắt thần dị (Dao Eyes / Ma Nhãn Huyết Đồng / Lôi Viêm Nhãn / Tinh Thần Nhãn)
 * - Đạo ấn trán (Chân Linh Đạo Ấn / Ma Văn / Lôi Phù / Long Giác)
 * - Dải lụa năng lượng (Spirit Ribbons) cuộn quanh 2 bên vai và thân dưới
 * - Lõi Đan Điền / Tâm Mạch (Core Singularity) xoay động
 * - Hào quang tiến hóa theo 5 Tầng Độ Kiếp
 */
export default function DaoAnhAvatarRenderer({
  daoAnh,
  size = 120,
  currentKiep = 0,
  animate = true,
  showAura = true,
  showTitle = false,
  className = '',
  style = {},
  onClick = null,
}) {
  if (!daoAnh) return null;

  const uid = `da_${daoAnh.id || 'def'}`;
  const pColor = daoAnh.primaryColor || '#fbbf24';
  const sColor = daoAnh.secondaryColor || '#f97316';
  const glow = daoAnh.glowColor || 'rgba(251, 191, 36, 0.8)';
  const isDemon = daoAnh.category === 'ma_dao' || daoAnh.eyeStyle === 'demon_red_veins' || daoAnh.bodyStyle?.includes('demon');
  const isCosmic = daoAnh.category === 'hon_don' || daoAnh.bodyStyle?.includes('cosmic') || daoAnh.bodyStyle?.includes('nebula');
  const isThunder = daoAnh.category === 'loi_dinh' || daoAnh.bodyStyle?.includes('thunder') || daoAnh.bodyStyle?.includes('electric');
  const isLife = daoAnh.category === 'tao_hoa' || daoAnh.bodyStyle?.includes('jade') || daoAnh.bodyStyle?.includes('sprout');
  const isMaxKiep = currentKiep >= 5;
  const [imgError, setImgError] = React.useState(false);

  // Reset imgError if daoAnh or currentKiep changes
  React.useEffect(() => {
    setImgError(false);
  }, [daoAnh?.id, daoAnh?.image, currentKiep]);

  const hasAiImage = Boolean(daoAnh.image) && !imgError;

  if (hasAiImage) {
    return (
      <div
        className={`dao-anh-avatar-container ${className}`}
        onClick={onClick}
        style={{
          width: size,
          height: size,
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: onClick ? 'pointer' : 'default',
          userSelect: 'none',
          ...style,
        }}
      >
        {/* 1. NỀN QUẦNG SÁNG AURA DỊU ÊM THANH THOÁT PHÍA SAU */}
        {showAura && (
          <svg
            viewBox="-100 -100 200 200"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              overflow: 'visible',
              zIndex: 1,
            }}
          >
            <defs>
              <radialGradient id={`${uid}_aiAura`} cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor={pColor} stopOpacity="0.4" />
                <stop offset="45%" stopColor={sColor} stopOpacity="0.18" />
                <stop offset="80%" stopColor={pColor} stopOpacity="0.04" />
                <stop offset="100%" stopColor={pColor} stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Quầng sáng êm dịu */}
            <circle
              cx="0"
              cy="0"
              r="85"
              fill={`url(#${uid}_aiAura)`}
              style={{
                opacity: 0.8,
                transformOrigin: '0 0',
              }}
            />
          </svg>
        )}

        {/* 2. HÌNH ẢNH ĐẠO ANH TO RÕ - TRUNG TÂM TRIỂN LÃM */}
        <div
          style={{
            width: '94%',
            height: '94%',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
          }}
        >
          <img
            key={`${daoAnh.id || 'da'}_kiep_${currentKiep}`}
            src={getDaoAnhEvolutionImage(daoAnh, currentKiep)}
            alt={daoAnh.name}
            decoding="async"
            onError={() => setImgError(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              userSelect: 'none',
              imageRendering: '-webkit-optimize-contrast',
              transform: getDaoAnhTransformStyle(daoAnh, currentKiep),
              transformOrigin: 'center center',
              backfaceVisibility: 'hidden',
              pointerEvents: 'none',
              filter: showAura ? `drop-shadow(0 0 10px ${glow})` : 'none',
            }}
          />
        </div>

        {/* 4. HIỂN THỊ TÊN ĐẠO ANH NẾU YÊU CẦU */}
        {showTitle && (
          <div
            style={{
              position: 'absolute',
              bottom: -18,
              left: '50%',
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
              fontSize: 10,
              fontWeight: 800,
              color: pColor,
              textShadow: `0 0 6px ${glow}`,
              fontFamily: 'var(--font-serif)',
              letterSpacing: 0.5,
              zIndex: 3,
            }}
          >
            {daoAnh.name?.replace('Đạo Anh', '').trim()}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`dao-anh-avatar-container ${className}`}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        contain: 'layout paint',
        ...style,
      }}
    >
      <svg
        viewBox="-100 -100 200 200"
        width="100%"
        height="100%"
        style={{
          overflow: 'visible',
          transform: 'translateZ(0)',
        }}
      >
        <defs>
          {/* Shaders & Gradients */}
          <radialGradient id={`${uid}_bodyGrad`} cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="35%" stopColor={pColor} stopOpacity="0.85" />
            <stop offset="85%" stopColor={sColor} stopOpacity="0.7" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.4" />
          </radialGradient>

          <radialGradient id={`${uid}_auraGrad`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={pColor} stopOpacity="0.35" />
            <stop offset="70%" stopColor={sColor} stopOpacity="0.1" />
            <stop offset="100%" stopColor={pColor} stopOpacity="0" />
          </radialGradient>

          <linearGradient id={`${uid}_ribbonGrad`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="40%" stopColor={pColor} stopOpacity="0.8" />
            <stop offset="80%" stopColor={sColor} stopOpacity="0.4" />
            <stop offset="100%" stopColor={pColor} stopOpacity="0" />
          </linearGradient>

          <linearGradient id={`${uid}_eyeGrad`} x1="0" y1="0" x2="0" y2="1">
            {isDemon ? (
              <>
                <stop offset="0%" stopColor="#ef4444" />
                <stop offset="100%" stopColor="#7f1d1d" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="40%" stopColor={pColor} />
                <stop offset="100%" stopColor={sColor} />
              </>
            )}
          </linearGradient>
        </defs>

        {/* Nền Hào Quang Gradient Siêu Nhẹ Thay Cho DropShadow */}
        {showAura && (
          <circle cx="0" cy="0" r="90" fill={`url(#${uid}_auraGrad)`} />
        )}

        <g style={{
          animation: animate ? 'spiritBreathing 3.6s ease-in-out infinite alternate' : 'none',
          transformOrigin: '0 0',
          willChange: animate ? 'transform' : 'auto',
        }}>
          
          {/* ========================================================
              1. VẦNG HÀO QUANG ĐỘ KIẾP (KIEP 1 - 5)
             ======================================================== */}
          {currentKiep >= 1 && (
            <g style={{
              animation: animate ? 'haloSpinSlow 40s linear infinite' : 'none',
              transformOrigin: '0 0',
              willChange: animate ? 'transform' : 'auto',
            }}>
              <circle cx="0" cy="0" r="74" fill="none" stroke={pColor} strokeWidth="1.2" strokeDasharray="4 6" opacity="0.5" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, idx) => {
                const rad = (deg * Math.PI) / 180;
                return (
                  <circle key={`runic-dot-${idx}`} cx={Math.cos(rad) * 74} cy={Math.sin(rad) * 74} r="2.2" fill={sColor} />
                );
              })}
            </g>
          )}

          {currentKiep >= 3 && (
            <g style={{
              animation: animate ? 'haloSpinReverse 25s linear infinite' : 'none',
              transformOrigin: '0 0',
              willChange: animate ? 'transform' : 'auto',
            }}>
              <circle cx="0" cy="0" r="82" fill="none" stroke={sColor} strokeWidth="0.8" strokeDasharray="8 6" opacity="0.6" />
              <polygon points="0,-86 4,-82 0,-78 -4,-82" fill="#ffffff" />
              <polygon points="0,86 4,82 0,78 -4,82" fill="#ffffff" />
              <polygon points="-86,0 -82,4 -78,0 -82,-4" fill="#ffffff" />
              <polygon points="86,0 82,4 78,0 82,-4" fill="#ffffff" />
            </g>
          )}

          {currentKiep >= 4 && (
            <g opacity="0.9">
              <path d="M -55,-40 L -45,-25 L -52,-18 L -36,0" fill="none" stroke={pColor} strokeWidth="2" strokeLinecap="round" />
              <path d="M 55,-40 L 45,-25 L 52,-18 L 36,0" fill="none" stroke={sColor} strokeWidth="2" strokeLinecap="round" />
            </g>
          )}

          {isMaxKiep && (
            <g>
              <g style={{
                animation: animate ? 'haloSpinSlow 50s linear infinite' : 'none',
                transformOrigin: '0 0',
                willChange: animate ? 'transform' : 'auto',
              }} opacity="0.75">
                {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg, idx) => {
                  const rad = (deg * Math.PI) / 180;
                  return (
                    <line
                      key={`sun-ray-${idx}`}
                      x1={Math.cos(rad) * 60}
                      y1={Math.sin(rad) * 60}
                      x2={Math.cos(rad) * 88}
                      y2={Math.sin(rad) * 88}
                      stroke="#fde047"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  );
                })}
              </g>
              {/* Vương Miện Chí Tôn */}
              <g transform="translate(0, -68)">
                <polygon points="0,-14 9,-4 6,-4 0,-9 -6,-4 -9,-4" fill="#fde047" stroke="#b45309" strokeWidth="1.2" />
                <circle cx="0" cy="-14" r="2.5" fill="#ef4444" />
                <circle cx="-9" cy="-4" r="1.8" fill={pColor} />
                <circle cx="9" cy="-4" r="1.8" fill={pColor} />
              </g>
            </g>
          )}

          {/* ========================================================
              2. DẢI LỤA LINH QUANG NĂNG LƯỢNG (SPIRIT RIBBONS)
             ======================================================== */}
          {/* Dải năng lượng bên trái vút lên */}
          <path
            d="M -22,25 C -55,30 -65,-15 -42,-45 C -25,-68 -15,-80 -10,-85 C -20,-70 -35,-50 -45,-20 C -52,10 -35,35 -15,40 Z"
            fill={`url(#${uid}_ribbonGrad)`}
            opacity="0.85"
          />
          {/* Dải năng lượng bên phải vút lên */}
          <path
            d="M 22,25 C 55,30 65,-15 42,-45 C 25,-68 15,-80 10,-85 C 20,-70 35,-50 45,-20 C 52,10 35,35 15,40 Z"
            fill={`url(#${uid}_ribbonGrad)`}
            opacity="0.85"
          />
          {/* Vòng lụa năng lượng cuộn trước ngực và dưới chân */}
          <path
            d="M -30,-5 C -45,15 -35,50 0,65 C 35,50 45,15 30,-5 C 20,15 0,35 -30,-5 Z"
            fill={`url(#${uid}_ribbonGrad)`}
            opacity="0.6"
          />

          {/* ========================================================
              3. THÂN THỂ CHIBI TIÊN THAI LƯU LY (SPIRIT BODY)
             ======================================================== */}
          {/* Chân & Bàn Tọa Bay */}
          <g transform="translate(0, 28)">
            {/* Chân Trái */}
            <ellipse cx="-12" cy="18" rx="8" ry="14" fill={`url(#${uid}_bodyGrad)`} transform="rotate(-15 -12 18)" />
            {/* Chân Phải */}
            <ellipse cx="12" cy="18" rx="8" ry="14" fill={`url(#${uid}_bodyGrad)`} transform="rotate(15 12 18)" />
            {/* Mũi chân tí hon */}
            <circle cx="-16" cy="30" r="4.5" fill={pColor} opacity="0.85" />
            <circle cx="16" cy="30" r="4.5" fill={pColor} opacity="0.85" />
          </g>

          {/* Bụng & Ngực Lưu Ly Trong Suốt */}
          <ellipse cx="0" cy="20" rx="22" ry="24" fill={`url(#${uid}_bodyGrad)`} stroke="#ffffff" strokeWidth="0.8" strokeOpacity="0.5" />
          
          {/* Tay Trái Mở Rộng */}
          <g transform="translate(-18, 14)">
            <path d="M 0,0 C -12,4 -22,10 -26,14 C -28,16 -24,20 -20,18 C -14,14 -6,8 0,4 Z" fill={`url(#${uid}_bodyGrad)`} />
            <circle cx="-25" cy="16" r="3.2" fill="#ffffff" opacity="0.75" />
          </g>
          {/* Tay Phải Mở Rộng */}
          <g transform="translate(18, 14)">
            <path d="M 0,0 C 12,4 22,10 26,14 C 28,16 24,20 20,18 C 14,14 6,8 0,4 Z" fill={`url(#${uid}_bodyGrad)`} />
            <circle cx="25" cy="16" r="3.2" fill="#ffffff" opacity="0.75" />
          </g>

          {/* LÕI BẢN NGUYÊN TRUNG TÂM / VÒNG XOÁY ĐAN ĐIỀN */}
          <g transform="translate(0, 18)">
            {isCosmic ? (
              // Xoáy tinh hà vũ trụ
              <g style={{
                animation: animate ? 'haloSpinSlow 15s linear infinite' : 'none',
                transformOrigin: '0 0',
                willChange: animate ? 'transform' : 'auto',
              }}>
                <circle cx="0" cy="0" r="10" fill="none" stroke="#fde047" strokeWidth="1.2" strokeDasharray="3 3" />
                <circle cx="0" cy="0" r="6" fill="#ffffff" stroke="#38bdf8" strokeWidth="1" />
                <path d="M -8,0 C -4,-6 4,-6 8,0 C 4,6 -4,6 -8,0 Z" fill={pColor} opacity="0.8" />
              </g>
            ) : isDemon ? (
              // Ma hắc liên / Huyết hạch
              <g>
                <circle cx="0" cy="0" r="9" fill="#000000" stroke="#ef4444" strokeWidth="1.5" />
                <circle cx="0" cy="0" r="4.5" fill="#ef4444" stroke="#fecdd3" strokeWidth="1" />
                <path d="M 0,-7 L 2,-2 L 7,0 L 2,2 L 0,7 L -2,2 L -7,0 L -2,-2 Z" fill="#ffffff" />
              </g>
            ) : isThunder ? (
              // Lôi hạch / Điểm sét
              <g>
                <circle cx="0" cy="0" r="8" fill="#38bdf8" stroke="#ffffff" strokeWidth="1" opacity="0.9" />
                <polygon points="0,-8 3,-1 0,0 2,7 -4,1 0,0" fill="#ffffff" />
              </g>
            ) : (
              // Đan hỏa / Kim đan chân linh
              <g>
                <circle cx="0" cy="0" r="9" fill="none" stroke="#ffffff" strokeWidth="1" strokeDasharray="2 2" />
                <circle cx="0" cy="0" r="6" fill="#ffffff" stroke="#fde047" strokeWidth="1" />
                <circle cx="0" cy="0" r="3.5" fill={sColor} />
              </g>
            )}
          </g>

          {/* ========================================================
              4. ĐẦU CHIBI TRÒN TRĨNH LƯU LY PHÁT QUANG (HEAD)
             ======================================================== */}
          {/* Đầu tròn Chibi */}
          <circle cx="0" cy="-22" r="32" fill={`url(#${uid}_bodyGrad)`} stroke="#ffffff" strokeWidth="1" strokeOpacity="0.6" />
          {/* Điểm phản quang bóng tròn trên trán trái */}
          <ellipse cx="-12" cy="-38" rx="8" ry="4.5" fill="#ffffff" opacity="0.8" transform="rotate(-30 -12 -38)" />
          <circle cx="16" cy="-40" r="2.5" fill="#ffffff" opacity="0.55" />

          {/* Tai Tí Hon 2 Bên */}
          <ellipse cx="-33" cy="-20" rx="4.5" ry="7" fill={`url(#${uid}_bodyGrad)`} transform="rotate(-15 -33 -20)" />
          <ellipse cx="33" cy="-20" rx="4.5" ry="7" fill={`url(#${uid}_bodyGrad)`} transform="rotate(15 33 -20)" />

          {/* ========================================================
              5. ĐÔI MẮT THẦN DỊ (TRANSCENDENT EYES)
             ======================================================== */}
          {/* Mắt Trái Sắc Sảo */}
          <g transform="translate(-14, -20)">
            {/* Viền mắt hạnh xếch */}
            <path d="M -12,2 Q 0,-8 10,-2 Q 2,4 -12,2 Z" fill="#ffffff" />
            {/* Nhãn đồng sắc bén */}
            <path d="M -8,1 Q 0,-6 6,-2 Q 0,3 -8,1 Z" fill={`url(#${uid}_eyeGrad)`} />
            {/* Tơ máu ma đạo nếu là Ma Phẩm */}
            {isDemon && (
              <g stroke="#ef4444" strokeWidth="0.8" fill="none">
                <path d="M -14,4 L -10,2 M -12,-2 L -8,-4 M -14,0 L -9,0" />
              </g>
            )}
            {/* Con ngươi sáng lạn */}
            <ellipse cx="-1" cy="-1.5" rx="2.2" ry="3.5" fill={isDemon ? '#450a0a' : '#ffffff'} />
            <circle cx="1" cy="-3" r="1.2" fill="#ffffff" />
          </g>

          {/* Mắt Phải Sắc Sảo */}
          <g transform="translate(14, -20)">
            {/* Viền mắt hạnh xếch */}
            <path d="M 12,2 Q 0,-8 -10,-2 Q -2,4 12,2 Z" fill="#ffffff" />
            {/* Nhãn đồng sắc bén */}
            <path d="M 8,1 Q 0,-6 -6,-2 Q 0,3 8,1 Z" fill={`url(#${uid}_eyeGrad)`} />
            {/* Tơ máu ma đạo nếu là Ma Phẩm */}
            {isDemon && (
              <g stroke="#ef4444" strokeWidth="0.8" fill="none">
                <path d="M 14,4 L 10,2 M 12,-2 L 8,-4 M 14,0 L 9,0" />
              </g>
            )}
            {/* Con ngươi sáng lạn */}
            <ellipse cx="1" cy="-1.5" rx="2.2" ry="3.5" fill={isDemon ? '#450a0a' : '#ffffff'} />
            <circle cx="-1" cy="-3" r="1.2" fill="#ffffff" />
          </g>

          {/* ========================================================
              6. ĐẠO ẤN / MA ẤN TRÊN TRÁN (FOREHEAD SEAL)
             ======================================================== */}
          <g transform="translate(0, -36)">
            {isDemon ? (
              // Ma Ấn Cổ Xưa
              <g>
                <path d="M 0,-8 C 3,-4 5,-2 0,6 C -5,-2 -3,-4 0,-8 Z" fill="#ef4444" stroke="#fee2e2" strokeWidth="0.5" />
                <path d="M -5,-3 C -2,-1 2,-1 5,-3 M -3,-6 L 3,-6" stroke="#ffffff" strokeWidth="0.9" fill="none" />
                <circle cx="0" cy="0" r="1.2" fill="#ffffff" />
              </g>
            ) : isThunder ? (
              // Lôi Phù Trấn Thiên
              <g>
                <polygon points="0,-8 4,-2 0,0 3,8 -4,1 0,-1" fill="#fde047" stroke="#38bdf8" strokeWidth="1" />
              </g>
            ) : isLife ? (
              // Sinh Mệnh Đạo Liên / Mộc Diệp
              <g>
                <path d="M 0,-8 C 6,-4 6,4 0,7 C -6,4 -6,-4 0,-8 Z" fill="#34d399" stroke="#ecfdf5" strokeWidth="0.5" />
                <circle cx="0" cy="0" r="2" fill="#ffffff" />
              </g>
            ) : (
              // Đạo Ấn Ngọn Lửa / Thái Cực / Giọt Nước Thuần Dương
              <g>
                <path d="M 0,-9 C 4,-5 6,-2 0,7 C -6,-2 -4,-5 0,-9 Z" fill="#ffffff" stroke={pColor} strokeWidth="0.6" />
                <circle cx="0" cy="1" r="2.2" fill={pColor} />
                <path d="M 0,-6 Q 2,-2 0,2 Q -2,-2 0,-6 Z" fill="#fde047" />
              </g>
            )}
          </g>

          {/* Các Hạt Linh Quang Lơ Lửng Thở */}
          {[-28, 28, -20, 20].map((xPos, idx) => (
            <circle
              key={`sparkle-${idx}`}
              cx={xPos}
              cy={idx % 2 === 0 ? -48 : 38}
              r={1.5}
              fill="#ffffff"
              opacity="0.85"
            />
          ))}

        </g>
      </svg>

      {/* Hiển thị Tên Đạo Anh nếu yêu cầu */}
      {showTitle && (
        <div style={{
          position: 'absolute',
          bottom: -18,
          left: '50%',
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
          fontSize: 10,
          fontWeight: 800,
          color: pColor,
          textShadow: `0 0 6px ${glow}`,
          fontFamily: 'var(--font-serif)',
          letterSpacing: 0.5,
        }}>
          {daoAnh.name?.replace('Đạo Anh', '').trim()}
        </div>
      )}
    </div>
  );
}
