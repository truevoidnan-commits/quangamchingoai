/**
 * Hệ thống Tu Vi & Chiến Lực Toàn Diện – Thiên Cơ Lâu
 *
 * CHIẾN LỰC THEO TỪNG CẢNH GIỚI:
 * 1. Ngưng Khí (1 - 10 tầng): Tính bằng HỔ (1 Tầng = 1 Hổ, 5 Hổ = 1 Tiêu, 2 Tiêu [10 Hổ] = 1 Bạt)
 * 2. Trúc Cơ (1 - 120 khiếu + khiếu 121 + Mệnh Đăng): Tính bằng HỎA (Mệnh Hỏa, tối đa 10 Hỏa)
 * 3. Kim Đan (Thiên Cung): Tính bằng CUNG (Chỉ những cung nào đã hóa thành Cung Thật mới tính chiến lực, tối đa 13 Cung)
 * 4. Giả Anh & Nguyên Anh (5 Kiếp): Tính bằng ANH (Mỗi Đạo Anh qua 1 kiếp = 1 Anh, 13 Đạo Anh qua 5 kiếp = Tối đa 65 Anh)
 *
 * LỰC LƯỢNG THIÊN MỆNH:
 * - Đến cảnh giới Nguyên Anh / Giả Anh mới mở khóa! Các cảnh dưới chưa có.
 * - Quy đổi: 1 EXP = 10 Thiên Mệnh để tích lũy độ kiếp.
 *
 * HỆ THỐNG MỆNH ĐĂNG (Bát Đại Thần Đăng):
 * - Rơi ngẫu nhiên khi đọc sách.
 * - Người đọc có thể chọn HẤP THỤ hoặc KHÔNG.
 * - Ở Trúc Cơ: Mỗi Mệnh Đăng hấp thụ = +1 Hỏa.
 * - Ở Kim Đan: Mỗi Mệnh Đăng hấp thụ = +1 Cung (biến thành Chân Cung thật ngay lập tức).
 * - Giới hạn: Tối đa hấp thụ 5 MỆNH ĐĂNG trong suốt quá trình tu luyện.
 * - LƯU Ý: Một khi chọn hấp thụ thì KHÔNG HOÀN TRẢ!
 */

const CULTIVATION_KEY = 'tcl_cultivation_state_v3';

export const EXP_PER_CHAPTER = 60;
export const THIEN_MENH_PER_EXP = 10;
export const MAX_ABSORBED_LAMPS = 5;

// Ngưỡng EXP cho 10 tầng Ngưng Khí
export const NGUNG_KHI_THRESHOLDS = [
  0,     // Tầng 1 (1 Hổ)
  60,    // Tầng 2 (2 Hổ)
  140,   // Tầng 3 (3 Hổ)
  240,   // Tầng 4 (4 Hổ)
  360,   // Tầng 5 (1 Tiêu)
  500,   // Tầng 6 (1 Tiêu 1 Hổ)
  660,   // Tầng 7 (1 Tiêu 2 Hổ)
  840,   // Tầng 8 (1 Tiêu 3 Hổ)
  1040,  // Tầng 9 (1 Tiêu 4 Hổ)
  1260,  // Tầng 10 (1 Bạt - Đại Viên Mãn)
  1500,  // Sẵn sàng Trúc Cơ
];

export const EXP_PER_PHAP_KHIEU = 35;
export const EXP_FOR_121_ATTEMPT = 800;
export const EXP_PER_THIEN_CUNG = 500;

// Ngưỡng Thiên Mệnh chuẩn cho 5 Kiếp của mỗi Đạo Anh
export const KIEP_THIEN_MENH_REQUIREMENTS = [
  1000, // Kiếp 1: 1000 TM
  2000, // Kiếp 2: 2000 TM
  3500, // Kiếp 3: 3500 TM
  5500, // Kiếp 4: 5500 TM
  8000, // Kiếp 5: 8000 TM
];

// Danh sách 8 Đại Mệnh Đăng Thần Thoại
export const LIFE_LAMPS = [
  {
    id: 'hac_tan',
    name: 'Hắc Tản Mệnh Đăng',
    shortName: 'Hắc Tản Đăng',
    type: 'dark',
    icon: '☂️',
    color: '#a855f7',
    desc: 'Bảo tán hắc ám bao bọc cửu u tử khí, hộ thể bất diệt, thôn phệ ma sát.',
    poem: 'Hắc tản che trời, tử khí triền miên.',
  },
  {
    id: 'that_thai_phuong',
    name: 'Thất Thải Phượng Đăng',
    shortName: 'Phượng Đăng',
    type: 'rainbow',
    icon: '🪶',
    color: '#ec4899',
    desc: 'Lông vũ phượng hoàng bất tử ngưng tụ bảy sắc thần quang, niết bàn trùng sinh.',
    poem: 'Phượng minh cửu thiên, thất thải thần viêm.',
  },
  {
    id: 'tan_tien_phe_than',
    name: 'Tàn Tiên Phệ Thần Đăng',
    shortName: 'Tàn Tiên Đăng',
    type: 'ancient',
    icon: '🏮',
    color: '#10b981',
    desc: 'Cổ đăng vỡ nát từ thời thượng cổ tàn tiên, chuyên thôn phệ thần niệm địch nhân.',
    poem: 'Tàn tiên vẫn lạc, phệ thần đoạt phách.',
  },
  {
    id: 'minh_linh_huyet_si_trai',
    name: 'Minh Linh Huyết Sí Đăng (Cánh Trái)',
    shortName: 'Huyết Sí (Trái)',
    type: 'blood_wing',
    icon: '🪽',
    color: '#ef4444',
    desc: 'Huyết sí minh linh bên trái, tốc độ tuyệt thế, sáp nhập thiên địa phong lôi.',
    poem: 'Tả dực minh linh, huyết phong rít gào.',
  },
  {
    id: 'minh_linh_huyet_si_phai',
    name: 'Minh Linh Huyết Sí Đăng (Cánh Phải)',
    shortName: 'Huyết Sí (Phải)',
    type: 'blood_wing',
    icon: '🪽',
    color: '#f43f5e',
    desc: 'Huyết sí minh linh bên phải, sát phạt vô song, chém đứt hư không quy tắc.',
    poem: 'Hữu dực minh linh, sát kiếm trảm không.',
  },
  {
    id: 'bach_son_thanh_hoa',
    name: 'Bạch Sơn Thánh Hỏa Đăng',
    shortName: 'Bạch Sơn Đăng',
    type: 'holy_fire',
    icon: '🏔️',
    color: '#38bdf8',
    desc: 'Thánh hỏa tinh khiết ngàn năm trên đỉnh Bạch Sơn, thiêu đốt vạn tà, tĩnh tâm ngưng thần.',
    poem: 'Bạch sơn tuyết tịnh, thánh hỏa trường tồn.',
  },
  {
    id: 'nhat_quy_thoi',
    name: 'Nhật Quỹ Thời Đăng',
    shortName: 'Nhật Quỹ Đăng',
    type: 'time',
    icon: '⏳',
    color: '#f59e0b',
    desc: 'Đồng hồ mặt trời khắc ghi thời gian chi đạo, gia tốc tu hành, đảo ngược sát na.',
    poem: 'Nhật quỹ lưu chuyển, tuế nguyệt như thoi.',
  },
  {
    id: 'tu_nguyet_thien',
    name: 'Tử Nguyệt Thiên Đăng',
    shortName: 'Tử Nguyệt Đăng',
    type: 'moon',
    icon: '🌙',
    color: '#8b5cf6',
    desc: 'Vầng trăng tím ngút ngàn trên cửu thiên, soi rọi thần thức, diễn hóa vạn biến.',
    poem: 'Tử nguyệt treo cao, thiên địa mênh mang.',
  },
];

const DEFAULT_STATE = {
  totalExp: 0,
  expCurrentRealm: 0,
  chaptersReadCount: 0,
  readChapterIds: {},

  // Cảnh giới: 'ngung_khi' | 'truc_co' | 'kim_dan' | 'gia_anh' | 'nguyen_anh'
  realm: 'ngung_khi',

  // Ngưng khí
  ngungKhiLevel: 1, // 1 to 10
  readyBreakthroughTrucCo: false,

  // Trúc cơ
  phapKhieu: 0, // 0 to 120
  selfMenhHoa: 0, // 0 to 4 (tự thân từ 120 khiếu)
  has121st: false, // Pháp khiếu 121
  failed121st: false, // Đã xung kích thất bại (vĩnh viễn không mở được nữa)
  attemptExp121: 0,

  // Mệnh Đăng
  inventoryLamps: [], // Danh sách id Mệnh Đăng trong túi (chưa hấp thụ)
  absorbedLamps: [],  // Danh sách id Mệnh Đăng ĐÃ HẤP THỤ (tối đa 5, không hoàn trả)

  // Kim Đan
  trucCoMenhHoaAtBreakthrough: 0, // Mệnh hỏa tự thân khi kết đan
  baseMaxPalaces: 0,              // Trần cung hư ảo tự thân (6, 7 hoặc 8)
  maxThienCung: 0,                // Tổng số Thiên Cung (baseMaxPalaces + số Mệnh Đăng đã hấp thụ, tối đa 13)
  realizedThienCung: 0,           // Số Thiên Cung đã hóa thành Cung Thật (Chân Cung, tối đa 13)
  currentThienCungExp: 0,

  // Lực lượng Thiên Mệnh (chỉ mở khóa ở Giả Anh / Nguyên Anh)
  isThienMenhUnlocked: false,
  totalThienMenh: 0,

  // Danh sách Đạo Anh (Nguyên Anh / Giả Anh)
  daoAnhs: [], // Array<{ id, name, fromLamp, fromLampId, palaceIndex, currentKiep: 0-5, currentThienMenh: number, maxThienMenh: number }>

  logs: [
    { text: 'Bước chân vào Thiên Cơ Lâu, bắt đầu con đường ngưng khí cảm ứng thiên địa linh lực.', time: Date.now() }
  ],
};

export function getCultivationState() {
  try {
    const raw = localStorage.getItem(CULTIVATION_KEY);
    if (!raw) {
      // Migrate from older state versions
      const oldV2 = localStorage.getItem('tcl_cultivation_state_v2') || localStorage.getItem('tcl_cultivation_state');
      if (oldV2) {
        const oldState = JSON.parse(oldV2);
        const migrated = {
          ...DEFAULT_STATE,
          ...oldState,
          absorbedLamps: oldState.absorbedLamps || oldState.equippedLamps || oldState.lampPalaces || [],
        };
        saveCultivationState(migrated);
        return migrated;
      }
      return DEFAULT_STATE;
    }
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveCultivationState(state) {
  try {
    localStorage.setItem(CULTIVATION_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('cultivation_updated', { detail: state }));
  } catch (e) {
    console.error('Save cultivation error:', e);
  }
}

/**
 * Tính tổng số Mệnh Hỏa ở Trúc Cơ (Tự thân + Khiếu 121 + Mệnh Đăng đã hấp thụ, tối đa 10 Hỏa)
 */
export function getTotalMenhHoa(state) {
  const selfHoa = Math.floor(state.phapKhieu / 30);
  const bonus121 = state.has121st ? 1 : 0;
  const lampHoa = (state.absorbedLamps || []).length;
  return Math.min(10, selfHoa + bonus121 + lampHoa);
}

/**
 * Tính tổng Chiến Lực "Anh" ở cảnh giới Nguyên Anh / Giả Anh (Tối đa 65 Anh)
 */
export function getTotalCombatPowerAnh(state) {
  if (!state.daoAnhs || state.daoAnhs.length === 0) return 0;
  return state.daoAnhs.reduce((total, da) => total + (da.currentKiep || 0), 0);
}

/**
 * Tính và format Chiến Lực theo đúng chuẩn từng cảnh giới:
 * - Ngưng Khí: Hổ / Tiêu / Bạt (1 tầng = 1 Hổ, 5 Hổ = 1 Tiêu, 10 Hổ = 1 Bạt)
 * - Trúc Cơ: Hỏa (Mệnh Hỏa, tối đa 10 Hỏa)
 * - Kim Đan: Cung (Chỉ những cung đã hóa thành Cung Thật, tối đa 13 Cung)
 * - Nguyên Anh / Giả Anh: Anh (Tối đa 65 Anh)
 */
export function getCombatPowerDisplay(state) {
  if (!state) state = getCultivationState();

  if (state.realm === 'ngung_khi') {
    const lvl = state.ngungKhiLevel || 1;
    if (lvl === 10) return '1 Bạt';
    if (lvl >= 5) {
      const remainHo = lvl - 5;
      return remainHo > 0 ? `1 Tiêu ${remainHo} Hổ` : '1 Tiêu';
    }
    return `${lvl} Hổ`;
  }

  if (state.realm === 'truc_co') {
    const totalHoa = getTotalMenhHoa(state);
    return `${totalHoa} Hỏa`;
  }

  if (state.realm === 'kim_dan') {
    const realPalaces = state.realizedThienCung || 0;
    return `${realPalaces} Cung`;
  }

  if (state.realm === 'gia_anh' || state.realm === 'nguyen_anh') {
    const cpAnh = getTotalCombatPowerAnh(state);
    return `${cpAnh} Anh`;
  }

  return '0 Hổ';
}

/**
 * Thêm EXP / Tu Vi khi đọc chương + Cơ hội rơi Mệnh Đăng + Quy đổi Thiên Mệnh nếu đã ở Nguyên Anh
 */
export function addReadingProgress(novelId, chapterId, wordCount = 0) {
  const state = getCultivationState();
  const key = `${novelId}_${chapterId}`;

  const isFirstRead = !state.readChapterIds[key];
  const gainedExp = isFirstRead ? EXP_PER_CHAPTER : Math.round(EXP_PER_CHAPTER * 0.3);

  state.readChapterIds[key] = Date.now();
  state.chaptersReadCount = Object.keys(state.readChapterIds).length;
  state.totalExp += gainedExp;

  // LỰC THIÊN MỆNH: Chỉ mở khóa và tích lũy khi ở Giả Anh hoặc Nguyên Anh!
  let gainedThienMenh = 0;
  if (state.realm === 'gia_anh' || state.realm === 'nguyen_anh') {
    state.isThienMenhUnlocked = true;
    gainedThienMenh = gainedExp * THIEN_MENH_PER_EXP;
    state.totalThienMenh = (state.totalThienMenh || 0) + gainedThienMenh;
  }

  let droppedLamp = null;

  // Cơ chế Rơi Mệnh Đăng ngẫu nhiên khi đọc sách (Tỉ lệ 35% cho chương mới nếu chưa đủ bộ 8 đèn)
  const allOwnedLamps = [...(state.inventoryLamps || []), ...(state.absorbedLamps || [])];
  if (isFirstRead && allOwnedLamps.length < LIFE_LAMPS.length) {
    const unownedLamps = LIFE_LAMPS.filter(l => !allOwnedLamps.includes(l.id));

    if (unownedLamps.length > 0) {
      const roll = Math.random();
      if (roll < 0.35 || state.chaptersReadCount === 1) {
        const randomIndex = Math.floor(Math.random() * unownedLamps.length);
        droppedLamp = unownedLamps[randomIndex];
        state.inventoryLamps = [...(state.inventoryLamps || []), droppedLamp.id];

        state.logs.unshift({
          text: `Cơ duyên nghịch thiên! Khi đọc chương sách đã phát hiện bảo vật thượng cổ: [${droppedLamp.name}] (Có thể chọn hấp thụ hoặc cất giữ)!`,
          time: Date.now(),
        });
      }
    }
  }

  // Xử lý tiến độ theo từng cảnh giới
  if (state.realm === 'ngung_khi') {
    state.expCurrentRealm += gainedExp;

    for (let lvl = 10; lvl >= 1; lvl--) {
      if (state.expCurrentRealm >= NGUNG_KHI_THRESHOLDS[lvl - 1]) {
        if (lvl > state.ngungKhiLevel) {
          state.ngungKhiLevel = lvl;
          const cpStr = getCombatPowerDisplay({ ...state, ngungKhiLevel: lvl });
          state.logs.unshift({
            text: `Đột phá thành công! Tiến nhập Ngưng Khí Tầng ${lvl} (Chiến lực: ${cpStr}).`,
            time: Date.now(),
          });
        }
        break;
      }
    }

    if (state.expCurrentRealm >= NGUNG_KHI_THRESHOLDS[10]) {
      state.readyBreakthroughTrucCo = true;
    }
  } else if (state.realm === 'truc_co') {
    state.expCurrentRealm += gainedExp;

    if (state.phapKhieu < 120) {
      const opened = Math.min(120, Math.floor(state.expCurrentRealm / EXP_PER_PHAP_KHIEU));
      if (opened > state.phapKhieu) {
        state.phapKhieu = opened;
        const newSelfHoa = Math.floor(state.phapKhieu / 30);
        if (newSelfHoa > state.selfMenhHoa) {
          state.selfMenhHoa = newSelfHoa;
          state.logs.unshift({
            text: `Thắp sáng Mệnh Hỏa tự thân thứ ${newSelfHoa}! Pháp khiếu đã khai mở ${state.phapKhieu}/120 khiếu.`,
            time: Date.now(),
          });
        }
      }
    } else if (state.phapKhieu === 120 && !state.has121st) {
      state.attemptExp121 += gainedExp;
    }
  } else if (state.realm === 'kim_dan') {
    // Tích lũy EXP để Hóa Thực các Thiên Cung hư ảo thành Cung Thật
    if (state.realizedThienCung < state.maxThienCung) {
      state.currentThienCungExp += gainedExp;
      if (state.currentThienCungExp >= EXP_PER_THIEN_CUNG) {
        state.currentThienCungExp -= EXP_PER_THIEN_CUNG;
        state.realizedThienCung += 1;
        state.logs.unshift({
          text: `Thiên địa dị tượng! Đã Hóa Thực thành công Thiên Cung thứ ${state.realizedThienCung}/${state.maxThienCung} thành Cung Thật (+1 Cung chiến lực)!`,
          time: Date.now(),
        });
      }
    }
  }

  saveCultivationState(state);
  return { state, gainedExp, gainedThienMenh, isFirstRead, droppedLamp };
}

/**
 * HẤP THỤ MỆNH ĐĂNG (Vĩnh viễn, KHÔNG HOÀN TRẢ, Tối đa 5 Mệnh Đăng)
 * - Chỉ Trúc Cơ (đã mở Mệnh Hỏa) và Kim Đan mới có thể hấp thụ.
 * - Nguyên Anh / Giả Anh: KHÔNG THỂ HẤP THỤ THÊM NỮA!
 * - Ở Trúc Cơ: Mỗi Mệnh Đăng hấp thụ = +1 Hỏa
 * - Ở Kim Đan: Mỗi Mệnh Đăng hấp thụ = +1 Cung Thật (biến thành Chân Cung thật ngay lập tức)
 */
export function absorbLifeLamp(lampId) {
  const state = getCultivationState();

  if (state.realm === 'ngung_khi') {
    throw new Error('Cảnh giới Ngưng Khí chưa thể hấp thụ Mệnh Đăng (hãy cất trong túi trữ vật).');
  }

  if (state.realm === 'gia_anh' || state.realm === 'nguyen_anh') {
    throw new Error('Đến cảnh giới Nguyên Anh (hoặc Giả Anh) đạo cơ đã định hình Đạo Anh, KHÔNG THỂ hấp thụ thêm Mệnh Đăng nữa!');
  }

  if (state.realm === 'truc_co') {
    const selfHoa = state.selfMenhHoa || Math.floor(state.phapKhieu / 30);
    if (selfHoa < 1) {
      throw new Error('Cần thắp sáng ít nhất 1 Mệnh Hỏa tự thân ở Trúc Cơ mới có thể hấp thụ Mệnh Đăng.');
    }
  }

  const currentAbsorbed = state.absorbedLamps || [];
  if (currentAbsorbed.length >= MAX_ABSORBED_LAMPS) {
    throw new Error(`Đã đạt giới hạn tối đa 5 Mệnh Đăng có thể hấp thụ trong suốt đạo lộ tu tiên.`);
  }

  if (!state.inventoryLamps.includes(lampId)) {
    throw new Error('Bạn không có Mệnh Đăng này trong túi trữ vật.');
  }

  // Chuyển từ túi sang danh sách đã hấp thụ
  state.inventoryLamps = state.inventoryLamps.filter(id => id !== lampId);
  state.absorbedLamps = [...currentAbsorbed, lampId];

  const lampObj = LIFE_LAMPS.find(l => l.id === lampId);
  const lampName = lampObj ? lampObj.name : lampId;

  if (state.realm === 'truc_co') {
    state.logs.unshift({
      text: `Hấp thụ thành công [${lampName}] vào đạo cơ! Tăng trực tiếp +1 Mệnh Hỏa (+1 Hỏa chiến lực, không thể hoàn trả).`,
      time: Date.now(),
    });
  } else if (state.realm === 'kim_dan') {
    // Nếu hấp thụ ở Kim Đan: Trực tiếp diễn hóa thêm 1 Chân Cung Thật!
    state.maxThienCung = (state.maxThienCung || 6) + 1;
    state.realizedThienCung = (state.realizedThienCung || 1) + 1;
    state.logs.unshift({
      text: `Hấp thụ thành công [${lampName}] vào Kim Đan! Trực tiếp diễn hóa thêm 1 Chân Thiên Cung thực thể hóa (+1 Cung chiến lực, không thể hoàn trả).`,
      time: Date.now(),
    });
  }

  saveCultivationState(state);
  return state;
}

/**
 * Đột phá Ngưng Khí lên Trúc Cơ
 */
export function breakthroughToTrucCo() {
  const state = getCultivationState();
  if (state.realm !== 'ngung_khi' || !state.readyBreakthroughTrucCo) {
    throw new Error('Chưa đạt Ngưng Khí Đại Viên Mãn để trúc cơ.');
  }

  state.realm = 'truc_co';
  state.expCurrentRealm = 0;
  state.phapKhieu = 1;
  state.selfMenhHoa = 0;
  state.has121st = false;
  state.failed121st = false;
  state.attemptExp121 = 0;

  state.logs.unshift({
    text: 'Trúc Cơ thành công! Tẩy kinh phạt tủy, mở ra Pháp Khiếu đầu tiên, bắt đầu tích tụ Mệnh Hỏa (Chiến lực tính bằng Hỏa).',
    time: Date.now(),
  });

  saveCultivationState(state);
  return state;
}

/**
 * Xung kích mở Pháp Khiếu thứ 121
 * - Tỉ lệ thành công: 50%
 * - Thất bại: Vĩnh viễn không mở được Pháp Khiếu 121 nữa!
 */
export function attemptUnlock121st() {
  const state = getCultivationState();

  if (state.failed121st) {
    throw new Error('Bạn đã xung kích thất bại trước đó. Căn cơ pháp khiếu đã đóng kín, vĩnh viễn không thể mở Pháp Khiếu thứ 121 nữa!');
  }

  if (state.realm !== 'truc_co' || state.phapKhieu < 120 || state.has121st) {
    throw new Error('Chưa đủ điều kiện xung kích Pháp Khiếu 121.');
  }

  if (state.attemptExp121 < EXP_FOR_121_ATTEMPT) {
    throw new Error(`Cần tích lũy thêm tu vi (${state.attemptExp121}/${EXP_FOR_121_ATTEMPT}) để xung kích Khiếu 121.`);
  }

  const roll = Math.random();
  const isSuccess = roll < 0.5; // 50% thành công / 50% thất bại

  if (isSuccess) {
    state.has121st = true;
    state.phapKhieu = 121;
    state.logs.unshift({
      text: '✨ KỲ TÍCH VẠN CỔ! Xung kích thành công mở ra Pháp Khiếu thứ 121 bí mật, ngưng tụ Mệnh Hỏa thứ 5 (+1 Hỏa chiến lực), đạt Trúc Cơ Cực Cảnh!',
      time: Date.now(),
    });
    saveCultivationState(state);
    return { state, isSuccess: true, message: '✨ Kỳ tích vạn cổ! Đã mở thành công Pháp Khiếu thứ 121 đạt 5 Mệnh Hỏa Cực Cảnh!' };
  } else {
    state.failed121st = true;
    state.logs.unshift({
      text: '⚠️ XUNG KÍCH THẤT BẠI! Pháp khiếu 121 tan biến trong hư vô, căn cơ đóng kín, vĩnh viễn không thể khai mở Khiếu 121 nữa!',
      time: Date.now(),
    });
    saveCultivationState(state);
    return { state, isSuccess: false, message: '⚠️ Xung kích thất bại (50%)! Căn cơ pháp khiếu đã đóng kín, vĩnh viễn không thể mở Pháp Khiếu 121 nữa.' };
  }
}

/**
 * Đột phá từ Trúc Cơ lên Kim Đan
 * - 3 Hỏa tự thân -> Trần 6 Cung
 * - 4 Hỏa tự thân -> Trần 7 Cung
 * - 5 Hỏa tự thân (khiếu 121) -> Trần 8 Cung
 * - Cộng thêm số lượng Mệnh Đăng đã hấp thụ (tối đa 5 Mệnh Đăng = +5 Cung thật) -> Tổng tối đa 13 Cung!
 */
export function breakthroughToKimDan() {
  const state = getCultivationState();
  const selfHoa = state.selfMenhHoa || Math.floor(state.phapKhieu / 30);
  const totalSelfAnd121 = selfHoa + (state.has121st ? 1 : 0);

  if (state.realm !== 'truc_co' || totalSelfAnd121 < 3) {
    throw new Error('Cần tối thiểu 3 Mệnh Hỏa tự thân để kết xuất Kim Đan.');
  }

  let baseMax = 6;
  if (totalSelfAnd121 === 3) baseMax = 6;
  else if (totalSelfAnd121 === 4) baseMax = 7;
  else if (totalSelfAnd121 >= 5) baseMax = 8;

  const absorbedCount = (state.absorbedLamps || []).length;

  state.realm = 'kim_dan';
  state.trucCoMenhHoaAtBreakthrough = totalSelfAnd121;
  state.baseMaxPalaces = baseMax;

  // Tổng số Thiên Cung = Trần tự thân + Mệnh Đăng đã hấp thụ (Tối đa 13)
  state.maxThienCung = Math.min(13, baseMax + absorbedCount);
  // Số Cung Thật đã hóa thực = 1 cung khởi đầu + toàn bộ Chân Cung từ Mệnh Đăng đã hấp thụ
  state.realizedThienCung = Math.min(state.maxThienCung, 1 + absorbedCount);
  state.currentThienCungExp = 0;
  state.expCurrentRealm = 0;

  state.logs.unshift({
    text: `Đan thành cửu chuyển! Dựa trên ${totalSelfAnd121} Mệnh Hỏa kết đan mở ra ${baseMax} Thiên Cung, cùng ${absorbedCount} Mệnh Đăng biến thành ${absorbedCount} Chân Cung thật. Tổng cộng sở hữu ${state.maxThienCung} Thiên Cung (${state.realizedThienCung} Cung Thật chiến lực)!`,
    time: Date.now(),
  });

  saveCultivationState(state);
  return state;
}

/**
 * Chuyển hóa 1 Thiên Cung đã hóa thành Cung Thật thành Đạo Anh
 */
export function manifestDaoAnh(palaceIndex) {
  const state = getCultivationState();
  if (state.realm !== 'kim_dan' && state.realm !== 'gia_anh') {
    throw new Error('Chỉ có thể ngưng kết Đạo Anh khi ở Kim Đan hoặc Giả Anh.');
  }

  if (state.realizedThienCung < state.maxThienCung) {
    throw new Error(`Cần Hóa Thực toàn bộ ${state.maxThienCung} Thiên Cung thành Cung Thật trước khi ngưng kết Đạo Anh.`);
  }

  const existing = (state.daoAnhs || []).find(da => da.palaceIndex === palaceIndex);
  if (existing) {
    throw new Error('Thiên Cung này đã chuyển hóa thành Đạo Anh.');
  }

  // Kiểm tra xem Thiên Cung này có nguồn gốc từ Mệnh Đăng đã hấp thụ không
  const absorbedLamps = state.absorbedLamps || [];
  const isFromLamp = palaceIndex >= (state.baseMaxPalaces || (state.maxThienCung - absorbedLamps.length));
  const lampId = isFromLamp ? absorbedLamps[palaceIndex - state.baseMaxPalaces] : null;
  const lampObj = lampId ? LIFE_LAMPS.find(l => l.id === lampId) : null;

  const newDaoAnh = {
    id: `dao_anh_${palaceIndex}_${Date.now()}`,
    name: lampObj ? `Đạo Anh (${lampObj.shortName})` : `Đạo Anh Thứ ${palaceIndex + 1}`,
    fromLamp: Boolean(isFromLamp),
    fromLampId: lampId,
    palaceIndex,
    currentKiep: 0,
    currentThienMenh: 0,
    maxThienMenh: KIEP_THIEN_MENH_REQUIREMENTS[0],
  };

  state.daoAnhs = [...(state.daoAnhs || []), newDaoAnh];

  // Mở khóa lực lượng Thiên Mệnh ngay khi bắt đầu bước vào Giả Anh / Nguyên Anh
  state.isThienMenhUnlocked = true;

  if (state.daoAnhs.length === state.maxThienCung) {
    const allPassedKiep1 = state.daoAnhs.every(da => da.currentKiep >= 1);
    state.realm = allPassedKiep1 ? 'nguyen_anh' : 'gia_anh';
  } else {
    state.realm = 'gia_anh';
  }

  state.logs.unshift({
    text: `Thiên Cung thứ ${palaceIndex + 1} chuyển hóa thành ${newDaoAnh.name}! Đã mở khóa Lực Thiên Mệnh phục vụ độ kiếp. ${isFromLamp ? '(Đạo Anh Mệnh Đăng có phúc trạch bảo hộ khi độ kiếp)' : ''}`,
    time: Date.now(),
  });

  saveCultivationState(state);
  return state;
}

/**
 * Nạp Thiên Mệnh vào Đạo Anh
 */
export function injectThienMenhToDaoAnh(daoAnhId, amount) {
  const state = getCultivationState();
  if (!state.daoAnhs) return state;

  const da = state.daoAnhs.find(d => d.id === daoAnhId);
  if (!da) throw new Error('Không tìm thấy Đạo Anh.');

  const available = state.totalThienMenh || 0;
  if (available < amount) {
    throw new Error(`Không đủ Thiên Mệnh (Hiện có: ${available}, cần: ${amount}).`);
  }

  const needed = da.maxThienMenh - da.currentThienMenh;
  const actualAdd = Math.min(amount, needed);

  if (actualAdd <= 0) {
    throw new Error('Đạo Anh này đã tích tụ đầy Thiên Mệnh cho kiếp hiện tại.');
  }

  state.totalThienMenh -= actualAdd;
  da.currentThienMenh += actualAdd;

  saveCultivationState(state);
  return state;
}

/**
 * Độ Kiếp Đơn Lẻ cho 1 Đạo Anh
 */
export function attemptTribulationSingle(daoAnhId) {
  const state = getCultivationState();
  const da = (state.daoAnhs || []).find(d => d.id === daoAnhId);
  if (!da) throw new Error('Không tìm thấy Đạo Anh.');

  if (da.currentKiep >= 5) {
    throw new Error('Đạo Anh này đã vượt qua đủ 5 Kiếp (Đại Viên Mãn).');
  }

  const percent = Math.floor((da.currentThienMenh / da.maxThienMenh) * 100);
  if (percent < 70) {
    throw new Error(`Thiên Mệnh mới đạt ${percent}% (yêu cầu tối thiểu 70% để mở độ kiếp).`);
  }

  const successChance = Math.min(100, 50 + (percent - 70));
  const roll = Math.random() * 100;
  const isSuccess = roll <= successChance;

  let message = '';

  if (isSuccess) {
    da.currentKiep += 1;
    const nextKiep = da.currentKiep;
    const bonusThienMenh = Math.round(da.maxThienMenh * 0.3);
    state.totalThienMenh += bonusThienMenh;

    da.currentThienMenh = 0;
    da.maxThienMenh = KIEP_THIEN_MENH_REQUIREMENTS[Math.min(4, nextKiep)];

    message = `VƯỢT KIẾP THÀNH CÔNG! ${da.name} đã vượt qua Kiếp thứ ${nextKiep} (+1 Anh chiến lực, nhận thưởng +${bonusThienMenh} Thiên Mệnh)!`;
    state.logs.unshift({ text: message, time: Date.now() });

    if (state.daoAnhs.length === state.maxThienCung && state.daoAnhs.every(d => d.currentKiep >= 1)) {
      if (state.realm !== 'nguyen_anh') {
        state.realm = 'nguyen_anh';
        state.logs.unshift({
          text: `👑 NGUYÊN ANH XUẤT THẾ! Toàn bộ ${state.maxThienCung} Đạo Anh đã vượt qua Kiếp 1, chính thức bước vào cảnh giới Nguyên Anh chân chính!`,
          time: Date.now(),
        });
      }
    }
  } else {
    if (da.fromLamp) {
      da.currentThienMenh = Math.round(da.maxThienMenh * 0.5);
      message = `Độ kiếp thất bại! Nhờ có chân hỏa của Mệnh Đăng bảo vệ, ${da.name} chỉ bị tiêu hao lui về 50% Thiên Mệnh!`;
    } else {
      da.currentThienMenh = 0;
      message = `Độ kiếp thất bại! Thiên lôi đánh tan thần niệm, ${da.name} bị trừ toàn bộ Thiên Mệnh tích lũy!`;
    }
    state.logs.unshift({ text: message, time: Date.now() });
  }

  saveCultivationState(state);
  return { state, isSuccess, successChance, message };
}

/**
 * Vạn Kiếp Tề Phi: Toàn bộ Đạo Anh cùng vượt kiếp
 */
export function attemptTribulationAll() {
  const state = getCultivationState();
  if (!state.daoAnhs || state.daoAnhs.length === 0) {
    throw new Error('Chưa có Đạo Anh nào.');
  }

  const eligibleDaoAnhs = state.daoAnhs.filter(
    da => da.currentKiep < 5 && Math.floor((da.currentThienMenh / da.maxThienMenh) * 100) >= 70
  );

  if (eligibleDaoAnhs.length === 0) {
    throw new Error('Không có Đạo Anh nào đạt từ 70% Thiên Mệnh trở lên để độ kiếp.');
  }

  let successCount = 0;
  let failCount = 0;
  let totalBonusThienMenh = 0;

  eligibleDaoAnhs.forEach(da => {
    const percent = Math.floor((da.currentThienMenh / da.maxThienMenh) * 100);
    const successChance = Math.min(100, 50 + (percent - 70));
    const isSuccess = Math.random() * 100 <= successChance;

    if (isSuccess) {
      successCount++;
      da.currentKiep += 1;
      const bonus = Math.round(da.maxThienMenh * 0.5);
      totalBonusThienMenh += bonus;
      da.currentThienMenh = 0;
      da.maxThienMenh = KIEP_THIEN_MENH_REQUIREMENTS[Math.min(4, da.currentKiep)];
    } else {
      failCount++;
      if (da.fromLamp) {
        da.currentThienMenh = Math.round(da.maxThienMenh * 0.5);
      } else {
        da.currentThienMenh = 0;
      }
    }
  });

  state.totalThienMenh = (state.totalThienMenh || 0) + totalBonusThienMenh;

  if (state.daoAnhs.length === state.maxThienCung && state.daoAnhs.every(d => d.currentKiep >= 1)) {
    state.realm = 'nguyen_anh';
  }

  const resultMsg = `VẠN KIẾP TỀ PHI KẾT THÚC: ${successCount} Đạo Anh vượt kiếp thành công, ${failCount} Đạo Anh thất bại. Nhận thưởng +${totalBonusThienMenh} Thiên Mệnh!`;
  state.logs.unshift({ text: resultMsg, time: Date.now() });

  saveCultivationState(state);
  return { state, successCount, failCount, totalBonusThienMenh, resultMsg };
}

/**
 * Format tên cảnh giới hiển thị súc tích theo chuẩn người dùng yêu cầu:
 * - Ngưng Khí X Tầng (ví dụ: Ngưng Khí 1 Tầng)
 * - Trúc Cơ X Hỏa (ví dụ: Trúc Cơ 2 Hỏa)
 * - Kim Đan X Cung (ví dụ: Kim Đan 3 Cung)
 * - Nguyên Anh X Kiếp (lấy số kiếp cao nhất của Đạo Anh đã độ qua, ví dụ: Nguyên Anh 4 Kiếp)
 */
export function getRealmDisplayName(state) {
  if (!state) state = getCultivationState();

  if (state.realm === 'ngung_khi') {
    return `Ngưng Khí ${state.ngungKhiLevel || 1} Tầng`;
  }

  if (state.realm === 'truc_co') {
    const totalHoa = getTotalMenhHoa(state);
    return `Trúc Cơ ${totalHoa} Hỏa`;
  }

  if (state.realm === 'kim_dan') {
    const realPalaces = state.realizedThienCung || 1;
    return `Kim Đan ${realPalaces} Cung`;
  }

  if (state.realm === 'gia_anh') {
    const daoAnhs = state.daoAnhs || [];
    const maxKiep = daoAnhs.length > 0 ? Math.max(...daoAnhs.map(da => da.currentKiep || 0)) : 0;
    return maxKiep > 0 ? `Giả Anh ${maxKiep} Kiếp` : `Giả Anh`;
  }

  if (state.realm === 'nguyen_anh') {
    const daoAnhs = state.daoAnhs || [];
    const maxKiep = daoAnhs.length > 0 ? Math.max(...daoAnhs.map(da => da.currentKiep || 0)) : 1;
    return `Nguyên Anh ${maxKiep} Kiếp`;
  }

  return 'Phàm Nhân';
}

export function resetCultivationState() {
  saveCultivationState(DEFAULT_STATE);
  return DEFAULT_STATE;
}
