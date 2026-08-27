// =========================================================================
// UNIVERSAL BACKGROUND ASSET PREFETCHER
// Tải ngầm toàn bộ hình ảnh tu luyện mọi lúc mọi nơi (kể cả khi vừa mở web không làm gì).
// Lưu trực tiếp vào Service Worker CacheStorage (Bộ nhớ đệm vĩnh viễn trên ổ cứng).
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

  // 1. All Thần Phẩm Icons
  Object.values(THAN_PHAM_AI_ICONS).forEach((url) => {
    if (url && !urlQueue.includes(url)) urlQueue.push(url);
  });

  // 2. All Life Lamp Icons
  Object.values(LAMP_THAN_PHAM_AI_ICONS).forEach((url) => {
    if (url && !urlQueue.includes(url)) urlQueue.push(url);
  });

  // 3. All Backgrounds
  [bgTrucCoGalaxy, bgGodCosmicEye, imgHuyetHoGod, imgLongKinhGod, imgTuTuongWheelFlow].forEach((url) => {
    if (url && !urlQueue.includes(url)) urlQueue.push(url);
  });

  // 4. All 5 Kiếp Evolution Images of all 42 Đạo Anh
  DAO_ANH_LIST.forEach((da) => {
    for (let kiep = 1; kiep <= 5; kiep++) {
      const url = getDaoAnhEvolutionImage(da, kiep);
      if (url && !urlQueue.includes(url)) urlQueue.push(url);
    }
  });

  // Start preloading after initial paint (600ms)
  setTimeout(() => {
    const runWorker = async () => {
      // Strategy 1: Direct CacheStorage caching (Fastest & Most reliable)
      if ('caches' in window) {
        try {
          const cache = await caches.open('tcl-images-v1');
          for (let i = 0; i < urlQueue.length; i += 3) {
            const batch = urlQueue.slice(i, i + 3);
            await Promise.allSettled(
              batch.map(async (url) => {
                const match = await cache.match(url);
                if (!match) {
                  const res = await fetch(url);
                  if (res.ok) await cache.put(url, res);
                }
              })
            );
          }
          console.log(`[Prefetch] ✅ Đã tải ngầm & lưu vĩnh viễn ${urlQueue.length} ảnh vào ổ cứng!`);
          return;
        } catch (e) {
          // Fallback to Image DOM
        }
      }

      // Strategy 2: Multi-stream Parallel DOM Preloader
      let idx = 0;
      const pump = () => {
        if (idx >= urlQueue.length) return;
        const url = urlQueue[idx++];
        const img = new Image();
        img.decoding = 'async';
        img.src = url;
        img.onload = img.onerror = () => {
          setTimeout(pump, 40);
        };
      };
      for (let c = 0; c < 3; c++) pump();
    };

    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => runWorker(), { timeout: 1000 });
    } else {
      runWorker();
    }
  }, 600);
}
