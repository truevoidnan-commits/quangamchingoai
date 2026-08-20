import { useMemo } from 'react';

/**
 * 6 ĐẠI TINH TỌA PHÂN BỔ TRÊN VÒNG TRÒN TOÁN HỌC CHÍNH XÁC (R = 270)
 * Các góc chia đều 60°: 270° (Đỉnh), 330° (Trên Phải), 30° (Dưới Phải), 90° (Đáy), 150° (Dưới Trái), 210° (Trên Trái)
 * 1. KIM NGƯU (Taurus): 28 Sao -> Góc 270° (Chính Bắc / Đỉnh): (500, 230)
 * 2. BỌ CẠP (Scorpio): 22 Sao -> Góc 330° (Đông Bắc / Trên Phải): (734, 365)
 * 3. NHÂN MÃ (Sagittarius): 21 Sao -> Góc 30° (Đông Nam / Dưới Phải): (734, 635)
 * 4. SƯ TỬ (Leo): 20 Sao -> Góc 90° (Chính Nam / Đáy): (500, 770)
 * 5. BẠCH DƯƠNG (Aries): 15 Sao -> Góc 150° (Tây Nam / Dưới Trái): (266, 635)
 * 6. THIÊN BÌNH (Libra): 14 Sao -> Góc 210° (Tây Bắc / Trên Trái): (266, 365)
 * Tổng cộng: 28 + 22 + 21 + 20 + 15 + 14 = 120 Tinh Thần!
 */

export const SIX_CONSTELLATIONS = [
  // ========================================================
  // 1. KIM NGƯU (TAURUS) - 28 STARS (KHIẾU 1 - 28)
  // Góc 270° (Chính Bắc) - Origin (500, 230)
  // ========================================================
  {
    id: 'kim_nguu',
    name: 'Kim Ngưu',
    westernName: 'Taurus',
    element: 'Kim',
    color: '#ffcc00',
    startIdx: 1,
    count: 28,
    starsRel: [
      // Sừng Trái (Left Horn: 5 sao)
      { dx: -35, dy: -55, name: 'Elnath Tả Giác' },
      { dx: -28, dy: -42, name: 'Tả Giác 1' },
      { dx: -20, dy: -30, name: 'Tả Giác 2' },
      { dx: -12, dy: -18, name: 'Tả Giác 3' },
      { dx: -5, dy: -8, name: 'Tả Giác Căn' },

      // Sừng Phải (Right Horn: 4 sao)
      { dx: 35, dy: -50, name: 'Tianguan Hữu Giác' },
      { dx: 26, dy: -38, name: 'Hữu Giác 1' },
      { dx: 18, dy: -25, name: 'Hữu Giác 2' },
      { dx: 8, dy: -12, name: 'Hữu Giác Căn' },

      // Mặt Chữ V Hyades & Mắt Aldebaran (Face: 6 sao)
      { dx: 0, dy: 0, name: 'Ngưu Ngạch Trán' },
      { dx: 18, dy: 10, name: 'Aldebaran Đại Tinh' },
      { dx: 10, dy: 22, name: 'Hyades Hữu' },
      { dx: -4, dy: 26, name: 'Ngưu Tỵ Mũi' },
      { dx: -16, dy: 18, name: 'Hyades Tả' },
      { dx: -12, dy: 4, name: 'Tả Ngưu Nhãn' },

      // Thất Tinh Pleiades (Pleiades: 7 sao)
      { dx: -50, dy: -25, name: 'Alcyone' },
      { dx: -58, dy: -30, name: 'Atlas' },
      { dx: -45, dy: -36, name: 'Electra' },
      { dx: -54, dy: -18, name: 'Maia' },
      { dx: -62, dy: -22, name: 'Merope' },
      { dx: -40, dy: -24, name: 'Taygeta' },
      { dx: -66, dy: -34, name: 'Pleione' },

      // Thân & Chân Trước (Body & Leg: 6 sao)
      { dx: -30, dy: 10, name: 'Ngưu Kiên Vai' },
      { dx: -48, dy: 16, name: 'Lưng Trước' },
      { dx: -64, dy: 20, name: 'Lưng Giữa' },
      { dx: -28, dy: 28, name: 'Ngực Trước' },
      { dx: -20, dy: 44, name: 'Tiền Chi' },
      { dx: -15, dy: 58, name: 'Ngưu Đề Móng' },
    ],
    edges: [
      [0,1],[1,2],[2,3],[3,4],[4,9],
      [5,6],[6,7],[7,8],[8,9],
      [9,10],[10,11],[11,12],[12,13],[13,14],[14,9],
      [15,16],[16,17],[17,18],[18,19],[19,20],[20,21],[21,15],[15,22],
      [9,22],[22,23],[23,24],[22,25],[25,26],[26,27]
    ],
    origin: { x: 500, y: 208 }
  },

  // ========================================================
  // 2. BỌ CẠP (SCORPIO) - 22 STARS (KHIẾU 29 - 50)
  // Góc 330° (Đông Bắc / Trên Phải) - Origin (753, 354)
  // ========================================================
  {
    id: 'bo_cap',
    name: 'Bọ Cạp',
    westernName: 'Scorpio',
    element: 'Hỏa',
    color: '#ff4d6d',
    startIdx: 29,
    count: 22,
    starsRel: [
      // Đầu & 3 Sao Vương Miện (Head: 5 sao)
      { dx: -10, dy: -50, name: 'Graffias' },
      { dx: 4, dy: -46, name: 'Dschubba' },
      { dx: 16, dy: -35, name: 'Pi Scorpii' },
      { dx: -20, dy: -38, name: 'Jabbah' },
      { dx: -4, dy: -28, name: 'Hạt Ngạch' },

      // Tim Đỏ Antares & Ngực (Heart: 5 sao)
      { dx: 0, dy: -14, name: 'Antares Đại Tinh' },
      { dx: 10, dy: -2, name: 'Al Niyat Hữu' },
      { dx: -12, dy: -4, name: 'Al Niyat Tả' },
      { dx: 0, dy: 8, name: 'Hạt Hung' },
      { dx: -4, dy: 22, name: 'Hạt Yêu' },

      // Đuôi Lưỡi Câu Shaula (Tail: 12 sao)
      { dx: -10, dy: 36, name: 'Vĩ Đoạn 1' },
      { dx: -20, dy: 48, name: 'Vĩ Đoạn 2' },
      { dx: -34, dy: 54, name: 'Larawag' },
      { dx: -48, dy: 52, name: 'Sargas' },
      { dx: -58, dy: 42, name: 'Vĩ Khúc 1' },
      { dx: -62, dy: 28, name: 'Vĩ Khúc 2' },
      { dx: -56, dy: 14, name: 'Vĩ Khúc 3' },
      { dx: -44, dy: 6, name: 'Shaula Độc Châm' },
      { dx: -32, dy: 0, name: 'Lesath' },
      { dx: -26, dy: 10, name: 'Độc Tuyến 1' },
      { dx: -34, dy: 18, name: 'Độc Tuyến 2' },
      { dx: -44, dy: 22, name: 'Hạt Vĩ Đỉnh' },
    ],
    edges: [
      [0,1],[1,2],[1,4],[3,4],[4,5],[5,6],[5,7],[6,8],[7,8],[8,9],
      [9,10],[10,11],[11,12],[12,13],[13,14],[14,15],[15,16],[16,17],[17,18],[18,19],[19,20],[20,21],[21,17]
    ],
    origin: { x: 753, y: 354 }
  },

  // ========================================================
  // 3. NHÂN MÃ (SAGITTARIUS) - 21 STARS (KHIẾU 51 - 71)
  // Góc 30° (Đông Nam / Dưới Phải) - Origin (753, 646)
  // ========================================================
  {
    id: 'nhan_ma',
    name: 'Nhân Mã',
    westernName: 'Sagittarius',
    element: 'Hỏa',
    color: '#ff7a29',
    startIdx: 51,
    count: 21,
    starsRel: [
      // Ấm Trà Teapot & Cung Kaus (10 sao)
      { dx: 12, dy: -38, name: 'Kaus Borealis' },
      { dx: 38, dy: -18, name: 'Alnasl Mũi Tên' },
      { dx: 20, dy: 4, name: 'Kaus Media' },
      { dx: 8, dy: 25, name: 'Kaus Australis' },
      { dx: -16, dy: 20, name: 'Ascella Quai' },
      { dx: -36, dy: -4, name: 'Nunki Quai' },
      { dx: -20, dy: -20, name: 'Kaus Nắp' },
      { dx: 0, dy: -8, name: 'Tâm Ấm Trà' },
      { dx: 24, dy: -28, name: 'Cung Thượng' },
      { dx: 20, dy: 16, name: 'Cung Hạ' },

      // Quai & Thân Mã (6 sao)
      { dx: -48, dy: -20, name: 'Tau Sagittarii' },
      { dx: -60, dy: -8, name: 'Tay Cung' },
      { dx: -48, dy: 12, name: 'Thần Thân 1' },
      { dx: -60, dy: 28, name: 'Thần Thân 2' },
      { dx: -36, dy: 36, name: 'Lưng Mã' },
      { dx: -24, dy: 44, name: 'Mã Bụng' },

      // Mũi Tên & Đuôi (5 sao)
      { dx: 52, dy: -25, name: 'Tiễn Đầu 1' },
      { dx: 66, dy: -32, name: 'Tiễn Đầu 2' },
      { dx: 44, dy: -5, name: 'Tiễn Thân 1' },
      { dx: 56, dy: -12, name: 'Tiễn Thân 2' },
      { dx: -48, dy: 48, name: 'Mã Vĩ Đuôi' },
    ],
    edges: [
      [0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,0],[0,7],[7,3],[7,5],[0,8],[8,1],[3,9],[9,1],
      [5,10],[10,11],[11,12],[12,13],[13,14],[14,4],[14,15],[15,3],
      [1,16],[16,17],[2,18],[18,19],[17,19],[13,20]
    ],
    origin: { x: 753, y: 646 }
  },

  // ========================================================
  // 4. SƯ TỬ (LEO) - 20 STARS (KHIẾU 72 - 91)
  // Góc 90° (Chính Nam / Đáy) - Origin (500, 792)
  // ========================================================
  {
    id: 'su_tu',
    name: 'Sư Tử',
    westernName: 'Leo',
    element: 'Kim',
    color: '#ffcc00',
    startIdx: 72,
    count: 20,
    starsRel: [
      // Liềm Bờm Sickle (6 sao)
      { dx: 36, dy: -44, name: 'Rasalas' },
      { dx: 48, dy: -30, name: 'Adhafera' },
      { dx: 38, dy: -14, name: 'Algieba' },
      { dx: 20, dy: -6, name: 'Hạ Ngạc' },
      { dx: 12, dy: -24, name: 'Bờm Tả' },
      { dx: 24, dy: -38, name: 'Đỉnh Bờm' },

      // Regulus & Thân (4 sao)
      { dx: 22, dy: 12, name: 'Regulus Đế Tinh' },
      { dx: 40, dy: 24, name: 'Tiền Chi' },
      { dx: 36, dy: 42, name: 'Tiền Trảo' },
      { dx: 4, dy: 10, name: 'Sư Kiên' },

      // Thân & Đuôi Denebola (10 sao)
      { dx: -14, dy: 6, name: 'Lưng Giữa' },
      { dx: -34, dy: 8, name: 'Zosma' },
      { dx: -28, dy: 24, name: 'Chertan' },
      { dx: -54, dy: 16, name: 'Denebola Đuôi' },
      { dx: -40, dy: 38, name: 'Hậu Chi' },
      { dx: -36, dy: 54, name: 'Hậu Trảo' },
      { dx: -65, dy: 6, name: 'Vĩ Mao 1' },
      { dx: -74, dy: -4, name: 'Vĩ Mao 2' },
      { dx: -64, dy: -14, name: 'Vĩ Đỉnh' },
      { dx: -52, dy: -4, name: 'Vĩ Khúc' },
    ],
    edges: [
      [0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[2,6],[6,7],[7,8],[6,9],
      [9,10],[10,11],[11,12],[12,9],[11,13],[12,13],[12,14],[14,15],
      [13,16],[16,17],[17,18],[18,19],[19,13]
    ],
    origin: { x: 500, y: 792 }
  },

  // ========================================================
  // 5. BẠCH DƯƠNG (ARIES) - 15 STARS (KHIẾU 92 - 106)
  // Góc 150° (Tây Nam / Dưới Trái) - Origin (247, 646)
  // ========================================================
  {
    id: 'bach_duong',
    name: 'Bạch Dương',
    westernName: 'Aries',
    element: 'Mộc',
    color: '#a855f7',
    startIdx: 92,
    count: 15,
    starsRel: [
      // 3 Sao Chủ & Sừng Xoắn (7 sao)
      { dx: 28, dy: -32, name: 'Hamal Alpha' },
      { dx: 12, dy: -20, name: 'Sheratan Beta' },
      { dx: -4, dy: -16, name: 'Mesarthim Gamma' },
      { dx: -16, dy: -28, name: 'Botein' },
      { dx: 20, dy: -48, name: 'Giác Khúc 1' },
      { dx: 4, dy: -52, name: 'Giác Đỉnh' },
      { dx: -10, dy: -44, name: 'Giác Khúc 2' },

      // Thân Dương & Chân (8 sao)
      { dx: 40, dy: -16, name: 'Dương Tỵ' },
      { dx: 32, dy: 0, name: 'Dương Hầu' },
      { dx: 12, dy: 4, name: 'Tiền Kiên' },
      { dx: -12, dy: 4, name: 'Lưng Giữa' },
      { dx: -34, dy: 0, name: 'Dương Mông' },
      { dx: 18, dy: 24, name: 'Tiền Chi' },
      { dx: -24, dy: 20, name: 'Hậu Chi' },
      { dx: -44, dy: -10, name: 'Dương Vĩ' },
    ],
    edges: [
      [0,1],[1,2],[2,3],[0,4],[4,5],[5,6],[6,3],[0,7],[7,8],[8,9],[9,10],[10,11],
      [9,12],[10,13],[11,14]
    ],
    origin: { x: 247, y: 646 }
  },

  // ========================================================
  // 6. THIÊN BÌNH (LIBRA) - 14 STARS (KHIẾU 107 - 120)
  // Góc 210° (Tây Bắc / Trên Trái) - Origin (247, 354)
  // ========================================================
  {
    id: 'thien_binh',
    name: 'Thiên Bình',
    westernName: 'Libra',
    element: 'Thủy',
    color: '#22c3f0',
    startIdx: 107,
    count: 14,
    starsRel: [
      // Trục Cân (4 sao)
      { dx: 0, dy: -44, name: 'Thiên Xích Đỉnh' },
      { dx: 0, dy: -24, name: 'Huyền Xu Trục' },
      { dx: -28, dy: -16, name: 'Tả Đòn Cân' },
      { dx: 28, dy: -16, name: 'Hữu Đòn Cân' },

      // Đĩa Bắc Zubeneschamali (5 sao)
      { dx: -44, dy: -4, name: 'Zubeneschamali' },
      { dx: -56, dy: 12, name: 'Tả Bàn Khởi' },
      { dx: -32, dy: 20, name: 'Tả Bàn Đáy' },
      { dx: -48, dy: 32, name: 'Tả Trọng Chùy' },
      { dx: -20, dy: 8, name: 'Tả Móc Cân' },

      // Đĩa Nam Zubenelgenubi (5 sao)
      { dx: 44, dy: -4, name: 'Zubenelgenubi' },
      { dx: 56, dy: 12, name: 'Brachium' },
      { dx: 32, dy: 20, name: 'Hữu Bàn Đáy' },
      { dx: 48, dy: 32, name: 'Zubenelhakrabi' },
      { dx: 20, dy: 8, name: 'Hữu Móc Cân' },
    ],
    edges: [
      [0,1],[1,2],[1,3],[2,4],[4,5],[5,6],[6,8],[8,2],[6,7],[5,7],
      [3,9],[9,10],[10,11],[11,13],[13,3],[11,12],[10,12]
    ],
    origin: { x: 247, y: 354 }
  }
];

export default function useCelestialStarMap(openedCount = 0) {
  const { stars, constellationList } = useMemo(() => {
    const starList = [];
    const constList = [];
    const SCALE_FACTOR = 1.36; // Phóng to 36% giúp các pháp khiếu thoáng đãng, không bị chồng lên nhau

    SIX_CONSTELLATIONS.forEach((c) => {
      const ox = c.origin.x;
      const oy = c.origin.y;

      const mappedStars = c.starsRel.map((s, sIdx) => {
        const starGlobalIdx = c.startIdx + sIdx;
        const x = ox + s.dx * SCALE_FACTOR;
        const y = oy + s.dy * SCALE_FACTOR;
        const isUnlocked = starGlobalIdx <= openedCount;

        const starObj = {
          index: starGlobalIdx,
          name: `Khiếu #${starGlobalIdx} · ${s.name}`,
          shortName: s.name,
          element: c.element,
          category: `${c.name} (${c.westernName})`,
          constellationId: c.id,
          constellationName: c.name,
          westernName: c.westernName,
          color: c.color,
          x,
          y,
          isUnlocked,
          cost: 50 + Math.floor(starGlobalIdx * 1.2)
        };

        starList.push(starObj);
        return starObj;
      });

      // Build constellation lines
      const edgePaths = c.edges.map(([i1, i2]) => {
        const s1 = mappedStars[i1];
        const s2 = mappedStars[i2];
        const isConnectedAndUnlocked = s1 && s2 && s1.isUnlocked && s2.isUnlocked;
        return {
          d: s1 && s2 ? `M ${s1.x} ${s1.y} L ${s2.x} ${s2.y}` : '',
          isUnlocked: isConnectedAndUnlocked,
          color: c.color
        };
      });

      constList.push({
        ...c,
        stars: mappedStars,
        edgePaths,
        unlockedCount: mappedStars.filter(s => s.isUnlocked).length
      });
    });

    return { stars: starList, constellationList: constList };
  }, [openedCount]);

  return { stars, constellationList };
}
