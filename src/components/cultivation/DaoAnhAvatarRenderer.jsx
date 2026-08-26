import React from 'react';

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

  // Reset imgError if daoAnh.image changes
  React.useEffect(() => {
    setImgError(false);
  }, [daoAnh?.image]);

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
        <style>{`
          @keyframes haloSpinSlow {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes haloSpinReverse {
            from { transform: rotate(360deg); }
            to { transform: rotate(0deg); }
          }
          @keyframes spiritBreathing {
            0% { transform: scale(0.97); opacity: 0.88; }
            100% { transform: scale(1.03); opacity: 1; }
          }
          @keyframes flamePulse {
            0% { transform: scale(0.98) rotate(0deg); opacity: 0.75; }
            50% { transform: scale(1.02) rotate(2deg); opacity: 0.95; }
            100% { transform: scale(0.98) rotate(0deg); opacity: 0.75; }
          }
        `}</style>

        {/* 1. CELESTIAL SVG SPIRIT MANDALA & AURA */}
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
            {/* Atmospheric Spirit Glow Disc */}
            <radialGradient id={`${uid}_aiAura`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={pColor} stopOpacity="0.45" />
              <stop offset="40%" stopColor={sColor} stopOpacity="0.22" />
              <stop offset="75%" stopColor={pColor} stopOpacity="0.06" />
              <stop offset="96%" stopColor={pColor} stopOpacity="0" />
            </radialGradient>

            {/* Radiant Stroke Gradients */}
            <linearGradient id={`${uid}_goldGrad`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="35%" stopColor={pColor} stopOpacity="0.95" />
              <stop offset="70%" stopColor={sColor} stopOpacity="0.8" />
              <stop offset="100%" stopColor={pColor} stopOpacity="0.95" />
            </linearGradient>

            <linearGradient id={`${uid}_flameGrad`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={sColor} stopOpacity="0.1" />
              <stop offset="50%" stopColor={pColor} stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.85" />
            </linearGradient>

            <linearGradient id={`${uid}_sunrayGrad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
              <stop offset="40%" stopColor={pColor} stopOpacity="0.85" />
              <stop offset="85%" stopColor={sColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={sColor} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* ========================================================
              KIẾP 0: NGUYÊN THAI LINH QUANG (Primordial Nebula Glow)
             ======================================================== */}
          {showAura && (
            <circle
              cx="0"
              cy="0"
              r="92"
              fill={`url(#${uid}_aiAura)`}
              style={{
                animation: animate ? 'spiritBreathing 4s ease-in-out infinite alternate' : 'none',
                transformOrigin: '0 0',
              }}
            />
          )}

          {/* Floating stardust motes */}
          {showAura && (
            <g opacity="0.75" style={{ animation: animate ? 'spiritBreathing 3s ease-in-out infinite alternate' : 'none', transformOrigin: '0 0' }}>
              <circle cx="-55" cy="-50" r="1.2" fill="#ffffff" />
              <circle cx="58" cy="-45" r="1.5" fill="#fde047" />
              <circle cx="-50" cy="55" r="1.3" fill="#ffffff" />
              <circle cx="52" cy="52" r="1.4" fill={pColor} />
            </g>
          )}

          {/* ========================================================
              KIẾP 1: TINH HÀ LINH HOÀN (Astral Halo & 4 Cardinal Stars)
             ======================================================== */}
          {currentKiep >= 1 && (
            <g
              style={{
                animation: animate ? 'haloSpinSlow 40s linear infinite' : 'none',
                transformOrigin: '0 0',
              }}
            >
              {/* Inner fine halo */}
              <circle
                cx="0"
                cy="0"
                r="76"
                fill="none"
                stroke={`url(#${uid}_goldGrad)`}
                strokeWidth="1.2"
                opacity="0.75"
              />
              <circle
                cx="0"
                cy="0"
                r="79"
                fill="none"
                stroke={pColor}
                strokeWidth="0.6"
                strokeDasharray="2 4"
                opacity="0.5"
              />

              {/* 4 Cardinal Diamond Stars (✦) */}
              {[0, 90, 180, 270].map((deg, idx) => (
                <g key={`k1-star-${idx}`} transform={`rotate(${deg}) translate(0, -76)`}>
                  <path d="M 0,-4.5 Q 0,0 4.5,0 Q 0,0 0,4.5 Q 0,0 -4.5,0 Q 0,0 0,-4.5 Z" fill="#ffffff" />
                  <circle cx="0" cy="0" r="1.2" fill={sColor} />
                </g>
              ))}

              {/* 4 Intermediary Pearls */}
              {[45, 135, 225, 315].map((deg, idx) => (
                <g key={`k1-dot-${idx}`} transform={`rotate(${deg}) translate(0, -76)`}>
                  <circle cx="0" cy="0" r="2.2" fill={sColor} />
                  <circle cx="0" cy="0" r="1" fill="#ffffff" />
                </g>
              ))}
            </g>
          )}

          {/* ========================================================
              KIẾP 2: ÂM DƯƠNG SONG LUÂN (Yin-Yang Twin Crescent Wisps)
             ======================================================== */}
          {currentKiep >= 2 && (
            <g
              style={{
                animation: animate ? 'haloSpinReverse 28s linear infinite' : 'none',
                transformOrigin: '0 0',
              }}
              opacity="0.7"
            >
              {/* Twin Crescent Curved Spirit Blades */}
              <path
                d="M -70,-20 C -78,15 -50,68 0,72 C 35,74 65,50 68,20 C 60,45 30,62 0,60 C -40,58 -62,15 -58,-15 Z"
                fill={`url(#${uid}_flameGrad)`}
              />
              <path
                d="M 70,20 C 78,-15 50,-68 0,-72 C -35,-74 -65,-50 -68,-20 C -60,-45 -30,-62 0,-60 C 40,-58 62,-15 58,15 Z"
                fill={`url(#${uid}_flameGrad)`}
              />
              {/* Concentric Runic Ring */}
              <circle
                cx="0"
                cy="0"
                r="68"
                fill="none"
                stroke={sColor}
                strokeWidth="0.8"
                strokeDasharray="8 4 2 4"
                opacity="0.6"
              />
            </g>
          )}

          {/* ========================================================
              KIẾP 3: BÁCH THẦN BÁT QUÁI TRẬN (8-Petal Sacred Lotus Mandala)
             ======================================================== */}
          {currentKiep >= 3 && (
            <g
              style={{
                animation: animate ? 'haloSpinSlow 50s linear infinite' : 'none',
                transformOrigin: '0 0',
              }}
              opacity="0.8"
            >
              {/* 8-Petal Sacred Lotus Outer Geometry */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, idx) => (
                <g key={`k3-petal-${idx}`} transform={`rotate(${deg})`}>
                  {/* Lotus Petal Arc */}
                  <path
                    d="M -9,-78 C -4,-86 0,-89 0,-89 C 0,-89 4,-86 9,-78 C 5,-74 0,-73 -9,-78 Z"
                    fill={pColor}
                    stroke="#ffffff"
                    strokeWidth="0.4"
                    opacity="0.85"
                  />
                  <circle cx="0" cy="-88" r="1.3" fill="#ffffff" />
                </g>
              ))}

              {/* Outer Star Dial */}
              <circle
                cx="0"
                cy="0"
                r="84"
                fill="none"
                stroke={`url(#${uid}_goldGrad)`}
                strokeWidth="1"
                opacity="0.75"
              />

              {/* 16 Celestial Ticks */}
              {[0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5].map((deg, idx) => (
                <line
                  key={`k3-tick-${idx}`}
                  x1="0"
                  y1="-81"
                  x2="0"
                  y2="-85"
                  stroke={sColor}
                  strokeWidth="0.8"
                  transform={`rotate(${deg})`}
                />
              ))}
            </g>
          )}

          {/* ========================================================
              KIẾP 4: TỨ TƯỢNG THẦN VIÊM (Four Celestial Beasts Flame Wings)
             ======================================================== */}
          {currentKiep >= 4 && (
            <g
              style={{
                animation: animate ? 'flamePulse 3.5s ease-in-out infinite' : 'none',
                transformOrigin: '0 0',
              }}
              opacity="0.85"
            >
              {/* 4 Majestic Auroral Wing Wisps at 4 Diagonals */}
              {[35, 125, 215, 305].map((deg, idx) => (
                <g key={`k4-wing-${idx}`} transform={`rotate(${deg})`}>
                  <path
                    d="M 0,-70 C 15,-78 28,-88 32,-82 C 34,-76 22,-68 12,-62 Z"
                    fill={`url(#${uid}_goldGrad)`}
                    opacity="0.8"
                  />
                  <path
                    d="M 0,-70 C -15,-78 -28,-88 -32,-82 C -34,-76 -22,-68 -12,-62 Z"
                    fill={`url(#${uid}_goldGrad)`}
                    opacity="0.8"
                  />
                </g>
              ))}

              {/* Electric Lôi Quang Ring */}
              <circle
                cx="0"
                cy="0"
                r="82"
                fill="none"
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeDasharray="16 10 4 10"
                opacity="0.85"
              />
            </g>
          )}

          {/* ========================================================
              KIẾP 5: VẠN CỔ CHÍ TÔN THẦN LUÂN (Solar Sovereign Mandorla & Crown)
             ======================================================== */}
          {isMaxKiep && (
            <g>
              {/* Radiant Sunburst Solar Corona Rays (16 Blades) */}
              <g
                style={{
                  animation: animate ? 'haloSpinSlow 60s linear infinite' : 'none',
                  transformOrigin: '0 0',
                }}
                opacity="0.9"
              >
                {[0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5].map((deg, idx) => (
                  <g key={`k5-ray-${idx}`} transform={`rotate(${deg})`}>
                    {/* Tapered Sunray Blade */}
                    <polygon
                      points="0,-92 2.2,-78 0,-70 -2.2,-78"
                      fill={`url(#${uid}_sunrayGrad)`}
                    />
                    <circle cx="0" cy="-92" r="1.2" fill="#ffffff" />
                  </g>
                ))}
              </g>

              {/* Vương Miện Chí Tôn / Tiên Đính Bảo Quang (Crown above head) */}
              <g
                transform="translate(0, -68)"
                style={{
                  animation: animate ? 'spiritBreathing 3s ease-in-out infinite alternate' : 'none',
                  transformOrigin: '0 0',
                }}
              >
                {/* Crown Lotus Crest */}
                <path
                  d="M 0,-14 C 4,-8 8,-3 0,4 C -8,-3 -4,-8 0,-14 Z"
                  fill="#fde047"
                  stroke="#ffffff"
                  strokeWidth="0.8"
                />
                <circle cx="0" cy="-6" r="2.5" fill="#ef4444" stroke="#ffffff" strokeWidth="0.6" />
                {/* Crest Wings */}
                <path
                  d="M -3,-6 Q -12,-10 -16,-4 Q -10,-2 -4,-3"
                  fill="#fbbf24"
                  opacity="0.85"
                />
                <path
                  d="M 3,-6 Q 12,-10 16,-4 Q 10,-2 4,-3"
                  fill="#fbbf24"
                  opacity="0.85"
                />
              </g>
            </g>
          )}
        </svg>

        {/* 2. CHARACTER CUTOUT DISPLAY (Centered & Scaled to fit comfortably inside Aura) */}
        <div
          style={{
            width: '78%',
            height: '78%',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
          }}
        >
          <img
            src={daoAnh.image}
            alt={daoAnh.name}
            onError={() => setImgError(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              userSelect: 'none',
              filter: showAura ? `drop-shadow(0 0 10px ${glow})` : 'none',
              animation: animate ? 'spiritBreathing 3.6s ease-in-out infinite alternate' : 'none',
              willChange: animate ? 'transform' : 'auto',
            }}
          />
        </div>

        {/* 3. HIỂN THỊ TÊN ĐẠO ANH NẾU YÊU CẦU */}
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
