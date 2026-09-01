// =========================================================================
// UNIVERSAL BACKGROUND ASSET PREFETCHER (Gentle Drip Throttle)
// Tải ngầm tài nguyên nhẹ nhàng trong thời gian rảnh rỗi (Idle Time).
// Hoàn toàn không chiếm dụng băng thông hay bộ nhớ máy di động.
// =========================================================================

import { THAN_PHAM_AI_ICONS, LAMP_THAN_PHAM_AI_ICONS } from './artifactIcons';
import { DAO_ANH_LIST, getDaoAnhEvolutionImage } from './daoAnhData';
import bgTrucCoGalaxy from '../assets/images/truc_co_galaxy_bg.jpg';
import bgGodCosmicEye from '../assets/images/bg_god_cosmic_eye.jpg';
import imgHuyetHoGod from '../assets/images/huyet_ho_god.png';
import imgLongKinhGod from '../assets/images/long_kinh_god.png';
import imgTuTuongWheelFlow from '../assets/images/tu_tuong_wheel_flow.jpg';

let _prefetchStarted = false;

export function startBackgroundPrefetch() {
  if (typeof window === 'undefined' || _prefetchStarted) return;
  _prefetchStarted = true;

  const urlQueue = [];

  // 1. Core Thần Phẩm & Lamp Icons
  Object.values(THAN_PHAM_AI_ICONS).forEach((url) => {
    if (url && !urlQueue.includes(url)) urlQueue.push(url);
  });
  Object.values(LAMP_THAN_PHAM_AI_ICONS).forEach((url) => {
    if (url && !urlQueue.includes(url)) urlQueue.push(url);
  });

  // 2. Core Backgrounds
  [bgTrucCoGalaxy, bgGodCosmicEye, imgHuyetHoGod, imgLongKinhGod, imgTuTuongWheelFlow].forEach((url) => {
    if (url && !urlQueue.includes(url)) urlQueue.push(url);
  });

  // 3. Đạo Ảnh Kiếp 1 & Kiếp 5
  DAO_ANH_LIST.forEach((da) => {
    const urlK1 = getDaoAnhEvolutionImage(da, 1);
    const urlK5 = getDaoAnhEvolutionImage(da, 5);
    if (urlK1 && !urlQueue.includes(urlK1)) urlQueue.push(urlK1);
    if (urlK5 && !urlQueue.includes(urlK5)) urlQueue.push(urlK5);
  });

  // Tải từ tốn sau khi trang đã render xong (2000ms)
  setTimeout(() => {
    let index = 0;
    const processNext = async () => {
      if (index >= urlQueue.length) return;
      const url = urlQueue[index++];
      
      try {
        if ('caches' in window) {
          const cache = await caches.open('tcl-images-v2');
          const match = await cache.match(url);
          if (!match) {
            const res = await fetch(url);
            if (res && res.status === 200) await cache.put(url, res);
          }
        } else {
          const img = new Image();
          img.decoding = 'async';
          img.src = url;
        }
      } catch {
        // Silent catch to prevent any error bubbling
      }

      // Khoảng nghỉ 150ms giữa mỗi ảnh để CPU và RAM điện thoại luôn mát mẻ
      if (window.requestIdleCallback) {
        window.requestIdleCallback(() => setTimeout(processNext, 120), { timeout: 2000 });
      } else {
        setTimeout(processNext, 150);
      }
    };

    processNext();
  }, 2000);
}
