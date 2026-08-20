import React, { useEffect, useRef } from 'react';
import { LIFE_LAMPS } from '../../lib/cultivation';

// Bảng màu theo phẩm chất Tiên Đạo
const TIER_COLOR_MAP = {
  ha_pham: '#9e9e9e',
  trung_pham: '#4caf50',
  thuong_pham: '#2196f3',
  cuc_pham: '#9c27b0',
  tien_pham: '#ff9800',
  than_pham: '#f44336'
};

class LinhKhiParticle {
  constructor(startX, startY, targetX, targetY, color, pillarIdx) {
    this.startX = startX;
    this.startY = startY;
    this.targetX = targetX;
    this.targetY = targetY;
    this.x = startX;
    this.y = startY;
    this.color = color;
    this.pillarIdx = pillarIdx;
    
    this.vy = 1.4 + Math.random() * 0.9;
    this.swayAmp = 6 + Math.random() * 8;
    this.swayFreq = 0.035 + Math.random() * 0.02;
    this.swayPhase = Math.random() * Math.PI * 2;
    
    this.age = 0;
    this.life = 120;
    this.size = 2.0 + Math.random() * 2.0;
    this.hit = false;
  }

  update() {
    this.age++;
    this.y += this.vy;
    this.vy += 0.025; // Gia tốc trọng lực nhẹ

    // Tiến trình rơi từ startY đến targetY
    const totalDist = Math.max(1, this.targetY - this.startY);
    const progress = Math.min(1, Math.max(0, (this.y - this.startY) / totalDist));
    
    // Nội suy mượt từ startX tới targetX + dao động sóng sin
    const currentBaseX = this.startX + (this.targetX - this.startX) * progress;
    const sway = Math.sin(this.age * this.swayFreq + this.swayPhase) * this.swayAmp * (1 - progress * 0.4);
    this.x = currentBaseX + sway;
  }

  get alpha() {
    const fadeIn = Math.min(this.age / 8, 1);
    const totalDist = Math.max(1, this.targetY - this.startY);
    const progress = (this.y - this.startY) / totalDist;
    const fadeOut = progress > 0.85 ? Math.max(0, 1 - (progress - 0.85) / 0.15) : 1;
    return Math.min(fadeIn, fadeOut);
  }

  get dead() {
    return this.hit || this.y >= this.targetY + 8 || this.age >= this.life;
  }

  draw(ctx) {
    const a = this.alpha;
    if (a <= 0.02) return;
    
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.globalAlpha = a;
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.color;
    ctx.fill();

    // Lõi hạt sáng trắng tâm điểm
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = a * 0.9;
    ctx.fill();
    ctx.restore();
  }
}

export default function ManaWaterfallOverlay({
  containerRef,
  starChartRef,
  pillarRefs,
  absorbedLamps = []
}) {
  const canvasRef = useRef(null);
  const flameHitTimeoutRefs = useRef([null, null, null, null]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let particles = [];
    let frame = 0;

    const onHitFlame = (index) => {
      const el = pillarRefs?.current?.[index];
      if (!el) return;
      const flame = el.querySelector('.menh-dang-flame');
      if (!flame) return;

      flame.style.transform = 'scale(1.22)';
      flame.style.filter = 'drop-shadow(0 0 20px var(--flame-color, #fbbf24)) brightness(1.4)';

      if (flameHitTimeoutRefs.current[index]) {
        clearTimeout(flameHitTimeoutRefs.current[index]);
      }
      flameHitTimeoutRefs.current[index] = setTimeout(() => {
        flame.style.transform = 'scale(1)';
        flame.style.filter = 'none';
      }, 300);
    };

    const render = () => {
      frame++;
      if (!canvas || !containerRef?.current) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const containerRect = containerRef.current.getBoundingClientRect();
      if (containerRect.width <= 0 || containerRect.height <= 0) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // Đảm bảo kích thước buffer của Canvas luôn bằng 100% container
      if (canvas.width !== Math.floor(containerRect.width) || canvas.height !== Math.floor(containerRect.height)) {
        canvas.width = Math.floor(containerRect.width);
        canvas.height = Math.floor(containerRect.height);
      }

      const sources = [];
      const now = Date.now() * 0.003;
      const svg = starChartRef?.current;

      if (pillarRefs?.current && Array.isArray(pillarRefs.current)) {
        pillarRefs.current.forEach((pillarEl, idx) => {
          if (!pillarEl) return;
          const pRect = pillarEl.getBoundingClientRect();
          const flameEl = pillarEl.querySelector('.menh-dang-flame') || pillarEl;
          const fRect = flameEl.getBoundingClientRect();

          const targetX = fRect.left + fRect.width / 2 - containerRect.left;
          const targetY = fRect.top + 6 - containerRect.top;

          let spawnX = targetX;
          let spawnY = targetY - 90;

          // Sử dụng SVG Matrix Transform để lấy toạ độ điểm rìa dưới Tinh Đồ chính xác 100%
          if (svg && svg.getScreenCTM) {
            try {
              const svgCTM = svg.getScreenCTM();
              if (svgCTM) {
                // Tâm SVG là (500, 500), Bán kính vành ngoài là 405
                // 4 nhánh xuất phát ở 4 góc của nửa dưới vòng tròn
                const streamAngles = [142, 114, 66, 38]; // Độ theo chiều kim đồng hồ từ trục +X
                const rad = (streamAngles[idx] * Math.PI) / 180;
                
                // Dao động lắc nhẹ ±3px theo nhịp xoay Tinh Đồ
                const swayOffset = Math.sin(now + idx * 1.5) * 3;
                const ptX = 500 + 405 * Math.cos(rad) + swayOffset;
                const ptY = 500 + 405 * Math.sin(rad);

                const pt = svg.createSVGPoint();
                pt.x = ptX;
                pt.y = ptY;
                const screenPt = pt.matrixTransform(svgCTM);

                spawnX = screenPt.x - containerRect.left;
                spawnY = screenPt.y - containerRect.top;
              }
            } catch {
              // Fallback if matrix transform is unsupported
            }
          }

          // Lấy màu hạt theo phẩm chất của Mệnh Đăng đang lắp
          const lampId = Array.isArray(absorbedLamps) ? absorbedLamps[idx] : absorbedLamps?.[idx];
          const lampObj = lampId ? LIFE_LAMPS.find(l => l.id === lampId) : null;
          const tier = lampObj?.tier || 'ha_pham';
          const color = lampObj ? (TIER_COLOR_MAP[tier] || '#ff9800') : '#38bdf8';

          sources.push({
            spawnX,
            spawnY,
            targetX,
            targetY,
            color,
            idx
          });
        });
      }

      // Xoá nền frame trước
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Vẽ các Dòng Khí Phát Quang Mờ Thần Bí (Ethereal Mana Conduit Streams)
      sources.forEach((src) => {
        if (src.targetY > src.spawnY + 15) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(src.spawnX, src.spawnY);
          const midY = (src.spawnY + src.targetY) / 2;
          ctx.bezierCurveTo(src.spawnX, midY, src.targetX, midY, src.targetX, src.targetY);
          ctx.strokeStyle = src.color;
          ctx.globalAlpha = 0.15;
          ctx.lineWidth = 2.5;
          ctx.shadowBlur = 8;
          ctx.shadowColor = src.color;
          ctx.stroke();
          ctx.restore();
        }
      });

      // Spawn hạt linh khí (liên tục phun thác đổ)
      if (particles.length < 40) {
        sources.forEach((src) => {
          if (src.targetY > src.spawnY + 15 && Math.random() < 0.35) {
            particles.push(
              new LinhKhiParticle(
                src.spawnX,
                src.spawnY,
                src.targetX,
                src.targetY,
                src.color,
                src.idx
              )
            );
          }
        });
      }

      // Cập nhật và kiểm tra va chạm
      particles.forEach((p) => {
        p.update();
        if (!p.hit && p.y >= p.targetY - 8) {
          p.hit = true;
          onHitFlame(p.pillarIdx);
        }
      });

      // Vẽ tất cả các hạt
      particles.forEach((p) => p.draw(ctx));

      // Lọc bỏ hạt đã chạm hoặc chết
      particles = particles.filter((p) => !p.dead);

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      flameHitTimeoutRefs.current.forEach((t) => t && clearTimeout(t));
    };
  }, [containerRef, starChartRef, pillarRefs, absorbedLamps]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 20
      }}
    />
  );
}
