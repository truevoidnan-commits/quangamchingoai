/**
 * Hệ thống Tu Vi, Chiến Lực & Thất Thập Nhị Huyền Môn Mệnh Đăng (72 Mệnh Đăng) – Thiên Cơ Lâu
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
 * HỆ THỐNG 72 MỆNH ĐĂNG (6 CẤP PHẨM ĐỘ HIẾM - MỖI CẤP 12 ĐĂNG):
 * - Hạ Phẩm (Trắng), Trung Phẩm (Xanh Lá), Thượng Phẩm (Xanh Lam), Cực Phẩm (Tím), Tiên Phẩm (Kim Sắc), Thần Phẩm (Đỏ)
 * - Tỉ lệ rơi quý hiếm (~1.8% mỗi chương đọc đủ 60 giây).
 * - Ở Trúc Cơ: Mỗi Mệnh Đăng hấp thụ = +1 Hỏa.
 * - Ở Kim Đan: Mỗi Mệnh Đăng hấp thụ = +1 Cung Thật.
 * - Giới hạn: Tối đa hấp thụ 5 MỆNH ĐĂNG trong suốt quá trình tu luyện.
 * - LƯU Ý: Một khi chọn hấp thụ thì KHÔNG HOÀN TRẢ!
 */

const CULTIVATION_KEY = 'tcl_cultivation_state_v3';

export const MIN_EXP_PER_CYCLE = 50; // Random từ 50 đến 100 Tu Vi mỗi chu kỳ 60s
export const MAX_EXP_PER_CYCLE = 100;
export const EXP_PER_CHAPTER = 75; // Giá trị trung bình
export const MIN_EXP_PER_CYCLE_NGUYEN_ANH = 200; // Random từ 200 đến 300 Tu Vi mỗi chu kỳ khi ở Giả Anh / Nguyên Anh
export const MAX_EXP_PER_CYCLE_NGUYEN_ANH = 300;
export const THIEN_MENH_PER_EXP = 10;
export const MAX_ABSORBED_LAMPS = 5;

// ========================================================
// 1. NGƯNG KHÍ KỲ — HAI CON ĐƯỜNG TU LUYỆN (THỂ & PHÁP)
// ========================================================

// A. Luyện Thể — Hải Sơn Quyết (Khí Huyết Tôi Thân: 1 Hổ -> 1 Bạt)
export const HAI_SON_QUYET_LAYERS = [
  { level: 1, name: '1 Hổ', desc: '1 Hổ Khí Huyết', cost: 80, target: 80 },
  { level: 2, name: '2 Hổ', desc: '2 Hổ Khí Huyết', cost: 120, target: 200 },
  { level: 3, name: '3 Hổ', desc: '3 Hổ Khí Huyết', cost: 180, target: 380 },
  { level: 4, name: '4 Hổ', desc: '4 Hổ Khí Huyết', cost: 240, target: 620 },
  { level: 5, name: '1 Tiêu', desc: '5 Hổ = 1 Tiêu Khí Huyết', cost: 320, target: 940 },
  { level: 6, name: '1 Tiêu 1 Hổ', desc: '6 Hổ Khí Huyết', cost: 420, target: 1360 },
  { level: 7, name: '1 Tiêu 2 Hổ', desc: 'Huyết Hổ Hóa Hình (Khí Huyết Hóa Ảnh)', cost: 540, target: 1900, hasPhantom: true, phantomName: 'Huyết Hổ Hóa Hình' },
  { level: 8, name: '1 Tiêu 3 Hổ', desc: 'Huyết Hổ Cuồng Nộ', cost: 680, target: 2580, hasPhantom: true, phantomName: 'Huyết Hổ Cuồng Nộ' },
  { level: 9, name: '1 Tiêu 4 Hổ', desc: 'Huyết Hổ Thôn Thiên', cost: 840, target: 3420, hasPhantom: true, phantomName: 'Huyết Hổ Thôn Thiên' },
  { level: 10, name: '1 Bạt (Đại Viên Mãn)', desc: '2 Tiêu = 1 Bạt Khí Huyết Đại Viên Mãn', cost: 1080, target: 4500, hasPhantom: true, phantomName: 'Thần Thú Huyết Hổ Hoàn Thiện' }
];

// B. Pháp Tu — Hóa Hải Kinh (Linh Lực Cấm Hải: 1 Lãng -> 1 Cấm Hải)
export const HOA_HAI_KINH_LAYERS = [
  { level: 1, name: '1 Lãng Khí', desc: 'Linh Khí Sơ Khởi (1 Lãng)', cost: 80, target: 80 },
  { level: 2, name: '2 Lãng Khí', desc: 'Linh Lưu Tụ Hội (2 Lãng)', cost: 120, target: 200 },
  { level: 3, name: '3 Lãng Khí', desc: 'Linh Ba Trùng Điệp (3 Lãng)', cost: 180, target: 380 },
  { level: 4, name: '4 Lãng Khí', desc: 'Linh Triều Khởi Ba (4 Lãng)', cost: 240, target: 620 },
  { level: 5, name: '1 Tuyền Hải', desc: 'Linh Tuyền Xuất Thế (1 Tuyền = 5 Lãng)', cost: 320, target: 940 },
  { level: 6, name: '1 Tuyền 1 Lãng', desc: 'Triều Tịch Cuồn Cuộn', cost: 420, target: 1360 },
  { level: 7, name: '1 Tuyền 2 Lãng', desc: 'Cấm Hải Long Kình (Linh Hải Hóa Kình)', cost: 540, target: 1900, hasPhantom: true, phantomName: 'Cấm Hải Long Kình' },
  { level: 8, name: '1 Tuyền 3 Lãng', desc: 'Long Kình Bạt Lãng', cost: 680, target: 2580, hasPhantom: true, phantomName: 'Long Kình Bạt Lãng' },
  { level: 9, name: '1 Tuyền 4 Lãng', desc: 'Vạn Lưu Quy Hải', cost: 840, target: 3420, hasPhantom: true, phantomName: 'Vạn Lưu Quy Hải' },
  { level: 10, name: 'Cấm Hải Viên Mãn', desc: '2 Tuyền = 1 Cấm Hải Đại Viên Mãn', cost: 1080, target: 4500, hasPhantom: true, phantomName: 'Thái Cổ Long Kình Thôn Thiên' }
];

// Đường cong EXP lũy tiến cho 10 tầng Ngưng Khí
export const NGUNG_KHI_THRESHOLDS = [
  0,     // Tầng 1 (1 Hổ / 1 Lãng)
  80,    // Tầng 2 (2 Hổ / 2 Lãng)
  200,   // Tầng 3 (3 Hổ / 3 Lãng)
  380,   // Tầng 4 (4 Hổ / 4 Lãng)
  620,   // Tầng 5 (1 Tiêu / 1 Tuyền)
  940,   // Tầng 6 (1 Tiêu 1 Hổ / 1 Tuyền 1 Lãng)
  1360,  // Tầng 7 (Khí Huyết Hóa Hổ / Cấm Hải Long Kình)
  1900,  // Tầng 8 (1 Tiêu 3 Hổ / 1 Tuyền 3 Lãng)
  2580,  // Tầng 9 (1 Tiêu 4 Hổ / 1 Tuyền 4 Lãng)
  3420,  // Tầng 10 (1 Bạt / 1 Cấm Hải - Đại Viên Mãn)
  4500,  // Sẵn sàng Trúc Cơ
];

// Ngưỡng Tu Vi lũy tiến cho 120 Pháp Khiếu Trúc Cơ (Khởi điểm Khiếu 1: 50 Tu Vi, tăng dần đến Khiếu 120: 192 Tu Vi, tổng ~14.568 Tu Vi)
export function getExpForPhapKhieuIndex(k) {
  const num = Math.min(120, Math.max(1, k));
  return 50 + Math.floor((num - 1) * 1.2);
}

export const TRUC_CO_KHIEU_THRESHOLDS = [0];
let runningKhieuSum = 0;
for (let i = 1; i <= 120; i++) {
  runningKhieuSum += getExpForPhapKhieuIndex(i);
  TRUC_CO_KHIEU_THRESHOLDS.push(runningKhieuSum);
}

export function getOpenedPhapKhieuFromExp(exp) {
  let opened = 0;
  while (opened < 120 && exp >= TRUC_CO_KHIEU_THRESHOLDS[opened + 1]) {
    opened++;
  }
  return opened;
}

export const EXP_PER_PHAP_KHIEU = 70; // Giữ để tương thích ngược
export const EXP_FOR_121_ATTEMPT = 800; // Tích lũy 800 EXP sau 120 khiếu để mượn cơ duyên xung kích

// Chi phí Tu Vi lũy tiến cho các Thiên Cung Tự Thân Kim Đan (Khởi điểm Cung 1: 2.000 Tu Vi -> Cung 8: 20.000 Tu Vi)
export const KIM_DAN_PALACE_COSTS = [
  0,
  2000,  // Cung 1: 2.000 Tu Vi
  3200,  // Cung 2: 3.200 Tu Vi (+1.200)
  4800,  // Cung 3: 4.800 Tu Vi (+1.600)
  6800,  // Cung 4: 6.800 Tu Vi (+2.000)
  9200,  // Cung 5: 9.200 Tu Vi (+2.400)
  12000, // Cung 6: 12.000 Tu Vi (+2.800)
  15500, // Cung 7: 15.500 Tu Vi (+3.500)
  20000, // Cung 8: 20.000 Tu Vi (+4.500)
];

export function getPalaceCost(palaceNum) {
  const num = Math.min(8, Math.max(1, palaceNum));
  return KIM_DAN_PALACE_COSTS[num] || (2000 + (num - 1) * 2000);
}

export const EXP_PER_THIEN_CUNG = 2000; // Giữ để tương thích ngược
export const EXP_PER_DAO_ANH = 10000; // 10.000 Tu Vi để thai nghén hoàn tất 1 Đạo Anh vào Thiên Cung Thật

export const KIEP_EXP_REQUIREMENTS = [
  50,   // Kiếp 1: 50 Thiên Mệnh
  120,  // Kiếp 2: 120 Thiên Mệnh
  250,  // Kiếp 3: 250 Thiên Mệnh
  400,  // Kiếp 4: 400 Thiên Mệnh
  500,  // Kiếp 5: 500 Thiên Mệnh
];

// Phần thưởng Lực Thiên Mệnh cơ bản khi Đạo Anh vượt kiếp thành công
export const TIER_BASE_THIEN_MENH_REWARDS = {
  than_pham: 100,
};

// Giữ để tương thích ngược
export const KIEP_THIEN_MENH_REQUIREMENTS = KIEP_EXP_REQUIREMENTS;

export const TIEN_TINH_RATIO = 1; // Giữ để tương thích ngược
export const DANG_DIEM_RATIO = 1;

// Phẩm cấp Thần Phẩm Tối Thượng (Độc bản & Duy nhất)
export const LAMP_TIERS = {
  than_pham: { 
    id: 'than_pham', 
    name: 'Thần Phẩm', 
    color: '#ef4444', 
    bg: 'rgba(239, 68, 68, 0.18)', 
    border: 'rgba(239, 68, 68, 0.7)', 
    weight: 1.0, 
    priceExp: 10000, 
    priceTM: 200, 
    refineExp: 3000, 
    refineTM: 50,
    tienTinh: 0,
    dangDiem: 0
  },
};

/**
 * Kiểm tra xem phẩm cấp có cần hỏi lại xác nhận khi luyện hóa không
 */
export function shouldConfirmSell() {
  return true;
}

// =========================================================================
// =========================================================================
// DANH SÁCH 18 THẦN PHẨM MỆNH ĐĂNG (CHÍ TÔN THƯỢNG CỔ · ĐỘC BẢN)
// =========================================================================
export const LIFE_LAMPS = [
  {
    id: 'nguyen_thuy_thien_ma',
    name: 'Nguyên Thủy Thiên Ma Đăng',
    shortName: 'Thiên Ma Đăng',
    tier: 'than_pham',
    icon: '🌑',
    color: '#ef4444',
    desc: 'Ma diễm nguyên thủy ngập tràn càn khôn của Nguyên Thủy Thiên Ma thượng cổ, luyện hóa vạn tà thành chân nguyên.',
    poem: 'Nguyên thủy thiên ma, thống ngự vạn ma.',
  },
  {
    id: 'hon_don_so_khai',
    name: 'Hỗn Độn Sơ Khai Đăng',
    shortName: 'Hỗn Độn Đăng',
    tier: 'than_pham',
    icon: '💥',
    color: '#ef4444',
    desc: 'Ngọn lửa nguyên thủy sinh ra khi thiên địa còn là một mảnh hỗn độn trước vạn đạo.',
    poem: 'Hỗn độn vị phân, nhất điểm linh quang.',
  },
  {
    id: 'hong_mong_bat_diet',
    name: 'Hồng Mông Bất Diệt Đăng',
    shortName: 'Hồng Mông Đăng',
    tier: 'than_pham',
    icon: '🔥',
    color: '#ef4444',
    desc: 'Được nuôi dưỡng bởi hồng mông tử khí nguyên thủy, bất tử bất diệt, đồng thọ cùng đạo.',
    poem: 'Hồng mông tử khí, vĩnh hằng bất hủ.',
  },
  {
    id: 'cuu_chuyen_luan_hoi',
    name: 'Cửu Chuyển Luân Hồi Đăng',
    shortName: 'Luân Hồi Đăng',
    tier: 'than_pham',
    icon: '☯️',
    color: '#ef4444',
    desc: 'Bảo vật chí cao chưởng quản sinh tử luân hồi lục đạo, nghịch chuyển càn khôn nhân quả.',
    poem: 'Cửu chuyển luân hồi, nghịch chuyển sinh tử.',
  },
  {
    id: 'thuong_thuong_loi_kiep',
    name: 'Thượng Thương Lôi Kiếp Đăng',
    shortName: 'Thượng Thương Đăng',
    tier: 'than_pham',
    icon: '⚡',
    color: '#ef4444',
    desc: 'Ngưng tụ uy áp của lôi kiếp thượng thương chí cao, trừng phạt kẻ nghịch thiên chấn động tam giới.',
    poem: 'Thượng thương lôi kiếp, thần phạt giáng lâm.',
  },
  {
    id: 'sang_the_ban_nguyen',
    name: 'Sáng Thế Bản Nguyên Đăng',
    shortName: 'Sáng Thế Đăng',
    tier: 'than_pham',
    icon: '🌌',
    color: '#ef4444',
    desc: 'Ngọn đèn chứa đựng sức mạnh bản nguyên sáng thế tạo lập vũ trụ vạn vật.',
    poem: 'Sáng thế bản nguyên, diễn hóa vạn linh.',
  },
  {
    id: 'van_menh_hu_vo',
    name: 'Vận Mệnh Hư Vô Đăng',
    shortName: 'Hư Vô Đăng',
    tier: 'than_pham',
    icon: '🔮',
    color: '#ef4444',
    desc: 'Chứa đựng sức mạnh hư vô của vận mệnh thái cổ, nhìn thấu hư thực sinh tử của vạn giới.',
    poem: 'Vận mệnh hư vô, chư thiên quy tịch.',
  },
  {
    id: 'tuc_menh_nhan_qua',
    name: 'Túc Mệnh Nhân Quả Đăng',
    shortName: 'Nhân Quả Đăng',
    tier: 'than_pham',
    icon: '📜',
    color: '#ef4444',
    desc: 'Nắm giữ sợi dây nhân quả và túc mệnh của ức vạn sinh linh trong thiên địa.',
    poem: 'Túc mệnh nhân quả, thiên đạo luân hồi.',
  },
  {
    id: 'thai_co_than_long',
    name: 'Thái Cổ Thần Long Đăng',
    shortName: 'Thần Long Đăng',
    tier: 'than_pham',
    icon: '🐉',
    color: '#ef4444',
    desc: 'Long hồn nguyên thủy của tổ long thái cổ ngưng tụ, tiếng gầm làm rung chuyển chư thiên vạn giới.',
    poem: 'Tổ long rít gào, uy chấn bát hoang.',
  },
  {
    id: 'khoi_nguyen_thoi_khong',
    name: 'Khởi Nguyên Thời Không Đăng',
    shortName: 'Khởi Nguyên Đăng',
    tier: 'than_pham',
    icon: '⏳',
    color: '#ef4444',
    desc: 'Nắm giữ điểm khởi nguyên của dòng sông thời gian và không gian vũ trụ.',
    poem: 'Khởi nguyên thời không, ngạo thị tuế nguyệt.',
  },
  {
    id: 'van_gioi_quy_nhat',
    name: 'Vạn Giới Quy Nhất Đăng',
    shortName: 'Quy Nhất Đăng',
    tier: 'than_pham',
    icon: '🌀',
    color: '#ef4444',
    desc: 'Dung hợp bản nguyên của mười phương thế giới, hóa vạn pháp thành một thể chí cao vô thượng.',
    poem: 'Vạn giới quy nhất, vạn pháp quy tông.',
  },
  {
    id: 'toi_cao_thien_menh',
    name: 'Tối Cao Thiên Mệnh Đăng',
    shortName: 'Thiên Mệnh Đăng',
    tier: 'than_pham',
    icon: '👑',
    color: '#ef4444',
    desc: 'Được sinh ra từ chính bản nguyên thiên mệnh của vũ trụ, quyết định vận mệnh của ức vạn sinh linh.',
    poem: 'Thiên mệnh sở quy, vạn kiếp bất hủ.',
  },
  {
    id: 'cuu_khieu_linh_lung',
    name: 'Cửu Khiếu Linh Lung Đăng',
    shortName: 'Linh Lung Đăng',
    tier: 'than_pham',
    icon: '💎',
    color: '#ef4444',
    desc: 'Đèn ngọc chín khiếu phát ra ánh sáng thất sắc thông thiên, giúp thần thức thấu suốt tam giới không góc khuất.',
    poem: 'Cửu khiếu linh lung, đắc ngộ đại đạo.',
  },
  {
    id: 'thien_dao_chi_ton',
    name: 'Thiên Đạo Chí Tôn Đăng',
    shortName: 'Chí Tôn Đăng',
    tier: 'than_pham',
    icon: '👑',
    color: '#ef4444',
    desc: 'Ngọn đèn đại diện cho ý chí tối cao của Thiên Đạo, ban cho tu sĩ hoàng uy tuyệt đối trấn áp quần hùng.',
    poem: 'Thiên đạo chí tôn, vạn linh thần phục.',
  },
  {
    id: 'nguyen_gioi_hon_co',
    name: 'Nguyên Giới Hỗn Cổ Đăng',
    shortName: 'Hỗn Cổ Đăng',
    tier: 'than_pham',
    icon: '🌌',
    color: '#ef4444',
    desc: 'Bản nguyên từ cõi Nguyên Giới thời hỗn cổ sơ khai, mở rộng đan hải và dung nạp thiên địa nguyên khí vô tận.',
    poem: 'Hỗn cổ nguyên giới, vạn kiếp bất diệt.',
  },
  {
    id: 'cam_ky_cuc_dao',
    name: 'Cấm Kỵ Cực Đạo Đăng',
    shortName: 'Cực Đạo Đăng',
    tier: 'than_pham',
    icon: '⚡',
    color: '#ef4444',
    desc: 'Lực lượng cực đạo phá vỡ mọi cấm kỵ thiên quy, bộc phát uy lực chiến đấu gấp mười lần trong sát na.',
    poem: 'Cực đạo cấm kỵ, duy ngã độc tôn.',
  },
  {
    id: 'dao_tam_chung_ma',
    name: 'Đạo Tâm Chủng Ma Đăng',
    shortName: 'Chủng Ma Đăng',
    tier: 'than_pham',
    icon: '☯️',
    color: '#ef4444',
    desc: 'Đan xen giữa tiên đạo chí thuần và ma đạo chí cực, nuôi dưỡng ma chủng trong tâm để đoạt thiên tạo hóa.',
    poem: 'Đạo tâm chủng ma, siêu việt luân hồi.',
  },
  {
    id: 'tan_tien_phe_than',
    name: 'Tàn Tiên Phệ Thần Đăng',
    shortName: 'Tàn Tiên Đăng',
    tier: 'than_pham',
    icon: '🪔',
    color: '#ef4444',
    desc: 'Cổ đăng vỡ nát từ thời thượng cổ tàn tiên, chuyên thôn phệ thần niệm địch nhân nghịch thiên.',
    poem: 'Tàn tiên vẫn lạc, phệ thần đoạt phách.',
  },
];

// =========================================================================
// DANH SÁCH 24 THẦN PHẨM VẬT TRẤN ÁP THIÊN CUNG (BẢO VẬT & CÔNG PHÁP TỐI THƯỢNG)
// =========================================================================
export const SUPPRESSING_ARTIFACTS = [
  { id: 'tao_hoa_ngoc_diep', name: 'Tạo Hóa Ngọc Điệp', shortName: 'Ngọc Điệp', tier: 'than_pham', type: 'Đạo Tổ Di Vật', icon: '🪞', color: '#ef4444', desc: 'Mảnh vỡ ngọc điệp của Đạo Tổ ghi chép 3000 đại đạo, mở ra con đường tu tiên siêu việt cảnh giới.', poem: 'Tạo hóa ngọc điệp, thông hiểu vạn đạo.' },
  { id: 'kim_o_luyen_van_linh', name: 'Kim Ô Luyện Vạn Linh', shortName: 'Kim Ô Luyện Linh', tier: 'than_pham', type: 'Thái Dương Thần Công', icon: '☀️', color: '#ef4444', desc: 'Tuyệt kỹ chân hỏa Kim Ô thượng cổ, luyện hóa vạn linh khí tức trời đất thành thuần dương chi khí bảo hộ thiên cung.', poem: 'Kim ô xuất thế, vạn linh quy phục.' },
  { id: 'nguyen_thuy_thai_so_ma_kinh', name: 'Nguyên Thủy Thái Sơ Ma Kinh', shortName: 'Thái Sơ Ma Kinh', tier: 'than_pham', type: 'Nguyên Thủy Ma Điển', icon: '📖', color: '#ef4444', desc: 'Cổ kinh ma đạo sinh ra từ thuở sơ khai trước khi có trời đất, ngưng tụ ma uy cái thế trấn áp bát hoang.', poem: 'Thái sơ vô cực, duy ngã độc tôn.' },
  { id: 'dao_menh_thien_ma_cong', name: 'Đạo Mệnh Thiên Ma Công', shortName: 'Thiên Ma Công', tier: 'than_pham', type: 'Đoạt Mệnh Thần Công', icon: '🌑', color: '#ef4444', desc: 'Công pháp cướp đoạt số mệnh càn khôn của Thiên Ma vực ngoại, chuyển hóa sinh tử nghịch chuyển càn khôn.', poem: 'Đạo mệnh thiên ma, nghịch thiên cải mệnh.' },
  { id: 'ngu_hanh_dai_dong_thien', name: 'Ngũ Hành Đại Động Thiên', shortName: 'Đại Động Thiên', tier: 'than_pham', type: 'Ngũ Hành Bản Nguyên', icon: '🌀', color: '#ef4444', desc: 'Không gian động thiên dung hợp Kim Mộc Thủy Hỏa Thổ viên mãn tuyệt đối, tạo nên thế giới độc lập vững chắc.', poem: 'Ngũ hành tương sinh, động thiên bất hoại.' },
  { id: 'mac_sat_tien_phach', name: 'Mặc Sát Tiên Phách', shortName: 'Mặc Sát Phách', tier: 'than_pham', type: 'Tuyệt Thế Sát Phách', icon: '⚔️', color: '#ef4444', desc: 'Hồn phách ngưng kết từ hắc ám sát khí thượng cổ của tiên nhân, chém tan mọi tà niệm ma chướng trong đan điện.', poem: 'Mặc sát nhất kiếm, tiên phách vô song.' },
  { id: 'huyen_hoang_diet_the_bien', name: 'Huyền Hoàng Diệt Thế Biến', shortName: 'Diệt Thế Biến', tier: 'than_pham', type: 'Huyền Hoàng Tuyệt Kỹ', icon: '🌍', color: '#ef4444', desc: 'Khí Huyền Hoàng hủy thiên diệt địa dung hợp vào thân thể, mang sức mạnh nghiền nát tinh cầu.', poem: 'Huyền hoàng biến ảo, diệt thế trùng sinh.' },
  { id: 'am_duong_hon_don_nguyen_can', name: 'Âm Dương Hỗn Độn Nguyên Căn', shortName: 'Hỗn Độn Nguyên Căn', tier: 'than_pham', type: 'Tiên Thiên Đạo Căn', icon: '☯️', color: '#ef4444', desc: 'Gốc rễ đạo căn sinh ra từ khí hỗn độn âm dương sơ khai, cung cấp linh nguyên bất tận cho thiên cung.', poem: 'Âm dương hỗn độn, đạo căn vĩnh hằng.' },
  { id: 'luc_dao_luan_hoi_tien_can', name: 'Lục Đạo Luân Hồi Tiên Căn', shortName: 'Luân Hồi Tiên Căn', tier: 'than_pham', type: 'Luân Hồi Thần Vật', icon: '🏛️', color: '#ef4444', desc: 'Tiên căn nắm giữ bí mật sáu cõi luân hồi, giúp tu sĩ vĩnh viễn không bị thoái lui cảnh giới.', poem: 'Lục đạo tiên căn, vạn kiếp bất diệt.' },
  { id: 'tam_sinh_luan_hoi_an', name: 'Tam Sinh Luân Hồi Ấn', shortName: 'Tam Sinh Ấn', tier: 'than_pham', type: 'Luân Hồi Chí Bảo', icon: '🔱', color: '#ef4444', desc: 'Con dấu luân hồi kết tinh từ nhân quả ba đời tiền kiếp - hiện thế - tương lai, trấn định linh hồn tuyệt đối.', poem: 'Tam sinh ấn tích, định đoạn tiền trần.' },
  { id: 'tran_nguc_minh_vuong_the', name: 'Trấn Ngục Minh Vương Thể', shortName: 'Minh Vương Thể', tier: 'than_pham', type: 'Chí Tôn Thể Thuật', icon: '🥋', color: '#ef4444', desc: 'Thể chất thần thoại trấn áp vạn ngục u minh, thể phách kiên cố bất hoại trước lôi kiếp tam tai.', poem: 'Minh vương trấn ngục, vạn ma phủ phục.' },
  { id: 'thai_so_than_vuong_the', name: 'Thái Sơ Thần Vương Thể', shortName: 'Thần Vương Thể', tier: 'than_pham', type: 'Thần Vương Đạo Thể', icon: '👑', color: '#ef4444', desc: 'Thần thể tối thượng của Thần Vương thời Thái Sơ, mỗi bước đi chấn động mười phương tinh không.', poem: 'Thái sơ thần vương, ngạo thị chư thiên.' },
  { id: 'tien_thien_thanh_the_dao_thai', name: 'Tiên Thiên Thánh Thể Đạo Thai', shortName: 'Thánh Thể Đạo Thai', tier: 'than_pham', type: 'Vô Địch Thể Chất', icon: '✨', color: '#ef4444', desc: 'Sự kết hợp hoàn mỹ giữa Hoang Cổ Thánh Thể và Tiên Thiên Đạo Thai, thể chất vô địch vạn cổ xưng tôn.', poem: 'Thánh thể đạo thai, vạn cổ vô song.' },
  { id: 'hon_don_diet_the_loi_tri', name: 'Hỗn Độn Diệt Thế Lôi Trì', shortName: 'Diệt Thế Lôi Trì', tier: 'than_pham', type: 'Hỗn Độn Thần Khí', icon: '⚡', color: '#ef4444', desc: 'Bể sấm sét diệt thế sinh ra từ hỗn độn, tôi luyện thiên cung đạt tới cảnh giới kim cương bất hoại.', poem: 'Hỗn độn lôi trì, thối luyện thần khu.' },
  { id: 'khoi_nguyen_vu_tru_ban_nguyen', name: 'Khởi Nguyên Vũ Trụ Bản Nguyên', shortName: 'Vũ Trụ Bản Nguyên', tier: 'than_pham', type: 'Đại Đạo Bản Nguyên', icon: '🌌', color: '#ef4444', desc: 'Khối năng lượng bản nguyên đầu tiên của vũ trụ sơ khai, nâng đỡ toàn bộ lầu các thiên cung.', poem: 'Khởi nguyên bản nguyên, diễn sinh vạn giới.' },
  { id: 'tha_hoa_tu_tai_dai_phap', name: 'Tha Hóa Tự Tại Đại Pháp', shortName: 'Tha Hóa Tự Tại', tier: 'than_pham', type: 'Vô Thượng Tiên Công', icon: '📜', color: '#ef4444', desc: 'Đại pháp cái thế biến hóa vạn cổ thời không, hóa ra vô số phân thân chân thân bảo vệ đạo quả.', poem: 'Tha hóa tự tại, tha hóa vạn cổ.' },
  { id: 'tieu_tuc_menh_thuat', name: 'Tiểu Túc Mệnh Thuật', shortName: 'Túc Mệnh Thuật', tier: 'than_pham', type: 'Nghịch Thiên Bí Pháp', icon: '⛓️', color: '#ef4444', desc: 'Bí thuật tối cao thiêu đốt thọ nguyên để triệu hoán lực lượng túc mệnh vĩ đại, cắt đứt mọi gông cùm.', poem: 'Túc mệnh sở hướng, vạn pháp quy phục.' },
  { id: 'con_bang_tien_phap', name: 'Côn Bằng Tiên Pháp', shortName: 'Côn Bằng Pháp', tier: 'than_pham', type: 'Thập Hung Tuyệt Kỹ', icon: '🦅', color: '#ef4444', desc: 'Tiên pháp của Thái Cổ Thập Hung Côn Bằng, chưởng khống cực hạn âm dương và tốc độ vô địch thiên hạ.', poem: 'Côn bằng giương cánh, xé toạc cửu thiên.' },
  { id: 'can_khon_luong_nghi_ho', name: 'Càn Khôn Lưỡng Nghi Hồ', shortName: 'Lưỡng Nghi Hồ', tier: 'than_pham', type: 'Tiên Thiên Thần Hồ', icon: '🍶', color: '#ef4444', desc: 'Hồ lô càn khôn thu nạp hai khí âm dương đất trời, chuyển hóa thành linh dịch cửu chuyển ôn dưỡng Kim Đan.', poem: 'Càn khôn lưỡng nghi, thâu tẫn càn khôn.' },
  { id: 'cuu_kiep_loi_nguc_kiem_phap', name: 'Cửu Kiếp Lôi Ngục Kiếm Pháp', shortName: 'Lôi Ngục Kiếm Pháp', tier: 'than_pham', type: 'Sát Phạt Kiếm Quyết', icon: '⚔️', color: '#ef4444', desc: 'Kiếm pháp triệu hoán chín tầng ngục lôi đình, trảm diệt sinh cơ và phong tỏa hoàn toàn kẻ địch.', poem: 'Cửu kiếp lôi ngục, kiếm trảm thần ma.' },
  { id: 'van_de_tran_ma_quyen', name: 'Vạn Đế Trấn Ma Quyền', shortName: 'Trấn Ma Quyền', tier: 'than_pham', type: 'Chí Tôn Quyền Pháp', icon: '👊', color: '#ef4444', desc: 'Quyền pháp mang uy thế hợp nhất của vạn vị cổ đế, một quyền xuất ra thiên băng địa liệt, ma thần tan biến.', poem: 'Vạn đế hợp lực, nhất quyền trấn ma.' },
  { id: 'nhat_khi_hoa_tam_thanh', name: 'Nhất Khí Hóa Tam Thanh', shortName: 'Tam Thanh Quyết', tier: 'than_pham', type: 'Đạo Môn Đỉnh Cao Thần Thông', icon: '🪷', color: '#ef4444', desc: 'Thần thông tối cao của Đạo Môn, một luồng chân khí phân hóa thành ba đạo thân tương đương bản thể.', poem: 'Nhất khí hóa tam thanh, vạn cổ duy ngã tôn.' },
  { id: 'vo_thuy_vo_chung_vo_vi_than', name: 'Vô Thủy Vô Chung Vô Vi Thân', shortName: 'Vô Thủy Vô Chung', tier: 'than_pham', type: 'Vĩnh Hằng Bất Hủ Đạo Thể', icon: '🛡️', color: '#ef4444', desc: 'Thân xác bất tử không có điểm bắt đầu cũng không có điểm kết thúc, miễn nhiễm tuyệt đối mọi đòn sát phạt.', poem: 'Vô thủy vô chung, vĩnh hằng bất diệt.' },
  { id: 'diet_the_loi_viem_dong', name: 'Diệt Thế Lôi Viêm Đồng', shortName: 'Lôi Viêm Đồng', tier: 'than_pham', type: 'Thần Thông Cực Hạn Nhãn Đồng', icon: '👁️', color: '#ef4444', desc: 'Đồng tử thần thoại ngưng tụ lôi đình và ngọn lửa diệt thế, một ánh nhìn thiêu rụi hư không và cấm chế.', poem: 'Lôi viêm đồng tử, chiếu rọi chư thiên.' },
];

const DEFAULT_STATE = {
  totalExp: 0,
  expCurrentRealm: 0,
  chaptersReadCount: 0,
  readChapterIds: {},

  // Cảnh giới: 'ngung_khi' | 'truc_co' | 'kim_dan' | 'gia_anh' | 'nguyen_anh'
  realm: 'ngung_khi',

  // Ngưng khí: Hai con đường Luyện Thể (Hải Sơn) & Pháp Tu (Hóa Hải)
  ngungKhiLevel: 1, // 1 to 10 (tổng quát)
  ngungKhiTheLevel: 1, // 1 to 10 (Luyện Thể - Hải Sơn Quyết)
  ngungKhiPhapLevel: 1, // 1 to 10 (Pháp Tu - Hóa Hải Kinh)
  ngungKhiTheExp: 0, // 0 to 4500
  ngungKhiPhapExp: 0, // 0 to 4500
  ngungKhiActivePath: 'the', // 'the' | 'phap'
  isSongTuVienMan: false, // Cả 2 đường đạt 10 tầng
  hasSongTuBonus: false, // Nhận đặc quyền Thể Pháp Song Tuyệt
  readyBreakthroughTrucCo: false,

  // Trúc cơ
  phapKhieu: 0, // 0 to 120
  selfMenhHoa: 0, // 0 to 4 (tự thân từ 120 khiếu)
  has121st: false, // Pháp khiếu 121
  failed121st: false, // Đã xung kích thất bại (vĩnh viễn không mở được nữa)
  attemptExp121: 0,

  // Mệnh Đăng, Vật Trấn Áp & Uẩn Tích Tu Vi
  storedExp: 0,           // Tu Vi uẩn tích khi kẹt bình cảnh (sẽ xả ra khi đột phá)
  pityReadingCycles: 0,   // Bộ đếm chu kỳ bảo hiểm rơi đồ (45 chu kỳ = 100% nhận Thần Vật)
  inventoryLamps: [],     // Danh sách id đèn trong túi
  absorbedLamps: [],      // Danh sách id đèn đã hấp thụ (tối đa 5, không hoàn trả)

  // Vật Trấn Áp Thiên Cung (Kim Đan)
  inventoryArtifacts: [], // Danh sách id vật trấn áp trong túi trữ vật
  palaceAnchors: {},      // Khảm nạm vật trấn áp vào từng Thiên Cung { [palaceIndex]: artifactData }

  // Thẻ Trải Nghiệm (Dùng 1 lần duy nhất, kết thúc sẽ tiêu biến vĩnh viễn)
  isNgungKhiTrial: false,
  hasUsedNgungKhiTrial: false,
  isKimDanTrial: false,
  hasUsedKimDanTrial: false,
  preTrialBackup: null,

  // Kim Đan (Thiên Cung)
  maxThienCung: 6, // 6 đến 13
  realizedThienCung: 0, // Số cung đã hóa thực thành Cung Thật (0 Cung tự thân ban đầu, chỉ có từ Mệnh Đăng hoặc đã trấn áp)
  currentThienCungExp: 0, // EXP đang nạp vào cung tiếp theo

  // Giả Anh & Nguyên Anh
  isThienMenhUnlocked: false,
  totalThienMenh: 0,
  daoAnhs: [],

  // Lịch sử tu tiên
  logs: [
    { text: 'Bắt đầu bước chân vào đạo lộ tu tiên tại Thiên Cơ Lâu.', time: Date.now() },
  ],
};

/**
 * Mở khóa cờ Thiên Mệnh khi ở Giả Anh hoặc Nguyên Anh
 * (Điểm Thiên Mệnh CHỈ được nhận khi Đạo Anh Độ Kiếp thành công)
 */
export function convertToThienMenhIfInAnhRealm(state) {
  if (!state) return;
  const isNguyenAnhStage = state.realm === 'gia_anh' || state.realm === 'nguyen_anh';
  if (!isNguyenAnhStage) return;

  state.isThienMenhUnlocked = true;
  if (state.totalThienMenh === undefined || state.totalThienMenh === null) {
    state.totalThienMenh = 0;
  }
}

/**
 * Trả về Icon độc bản và hiệu ứng màu sắc tương ứng cho Đạo Anh dựa trên Mệnh Đăng hoặc Vật Trấn Áp nguồn gốc
 */
export function getDaoAnhTheme(daoAnh, state) {
  if (!daoAnh) return { icon: '👑', color: '#ffcc00', glow: 'rgba(255, 204, 0, 0.4)', bg: 'rgba(255, 204, 0, 0.08)' };

  const pIdx = daoAnh.palaceIndex;
  const maxThienCung = state?.maxThienCung || 13;
  const lampList = state?.absorbedLamps || [];
  const lampCount = lampList.length;
  const selfPalacesTotal = maxThienCung - lampCount;

  const isLampPalace = pIdx >= selfPalacesTotal;

  if (isLampPalace) {
    const lampIdx = pIdx - selfPalacesTotal;
    const lampId = lampList[lampIdx];
    const lampObj = LIFE_LAMPS.find(l => l.id === lampId);
    if (lampObj) {
      const tierInfo = LAMP_TIERS[lampObj.tier] || LAMP_TIERS.than_pham;
      const color = tierInfo.color || '#FF2D4D';
      return {
        icon: lampObj.icon || '🏮',
        color: color,
        glow: tierInfo.border || `${color}aa`,
        bg: `${color}18`,
        isLamp: true,
        tier: lampObj.tier || 'than_pham',
        shortName: lampObj.shortName || lampObj.name,
      };
    }
  } else {
    const anchor = state?.palaceAnchors?.[pIdx];
    if (anchor) {
      const artObj = SUPPRESSING_ARTIFACTS.find(a => a.id === anchor.id) || anchor;
      const tierKey = artObj.tier || anchor.tier || 'than_pham';
      const tierInfo = LAMP_TIERS[tierKey] || LAMP_TIERS.than_pham;
      const color = artObj.color || tierInfo?.color || '#FF2D4D';
      return {
        icon: artObj.icon || '🏛️',
        color,
        glow: tierInfo?.border || `${color}aa`,
        bg: tierInfo?.bg || `${color}18`,
        isLamp: false,
        tier: tierKey,
        shortName: artObj.shortName || artObj.name,
      };
    }
  }

  return {
    icon: '🏛️',
    color: '#38bdf8',
    glow: 'rgba(56, 189, 248, 0.4)',
    bg: 'rgba(56, 189, 248, 0.08)',
    isLamp: false,
    shortName: daoAnh.name,
  };
}

/**
 * Lấy state tu vi từ LocalStorage
 */
export function getCultivationState() {
  try {
    const raw = localStorage.getItem(CULTIVATION_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    const state = { ...DEFAULT_STATE, ...parsed };

    // Khởi tạo các chỉ số Ngưng Khí Thể & Pháp nếu chưa có
    if (state.ngungKhiTheExp === undefined) {
      state.ngungKhiTheExp = state.realm === 'ngung_khi' ? (state.expCurrentRealm || state.totalExp || 0) : 4500;
    }
    if (state.ngungKhiPhapExp === undefined) {
      state.ngungKhiPhapExp = state.realm === 'ngung_khi' ? (state.expCurrentRealm || state.totalExp || 0) : 4500;
    }
    if (!state.ngungKhiActivePath || state.ngungKhiActivePath === 'song_tu') {
      state.ngungKhiActivePath = 'the';
    }
    if (!state.ngungKhiTheLevel) {
      state.ngungKhiTheLevel = state.ngungKhiLevel || 1;
    }
    if (!state.ngungKhiPhapLevel) {
      state.ngungKhiPhapLevel = state.ngungKhiLevel || 1;
    }

    if (state.has121st || state.phapKhieu >= 121) {
      state.has121st = true;
      state.selfMenhHoa = Math.max(state.selfMenhHoa || 0, 5);
    }

    if (state.realm === 'truc_co') {
      const minThreshold = TRUC_CO_KHIEU_THRESHOLDS[state.phapKhieu || 0] || 0;
      if (state.expCurrentRealm === undefined || state.expCurrentRealm < minThreshold) {
        state.expCurrentRealm = minThreshold;
      }
      // Đồng bộ chuẩn xác số Pháp Khiếu đã mở theo tổng Tu Vi tích lũy Trúc Cơ
      if (!state.has121st && state.phapKhieu < 120) {
        const opened = getOpenedPhapKhieuFromExp(state.expCurrentRealm);
        if (opened > (state.phapKhieu || 0)) {
          state.phapKhieu = Math.min(120, opened);
          const newSelfHoa = Math.floor(state.phapKhieu / 30);
          if (newSelfHoa > (state.selfMenhHoa || 0)) {
            state.selfMenhHoa = newSelfHoa;
          }
        }
      }
    }

    if (state.realm === 'kim_dan') {
      const lampCount = (state.absorbedLamps || []).length;
      const selfPalacesMax = Math.max(1, (state.maxThienCung || 6) - lampCount);
      if ((state.realizedThienCung || 0) > selfPalacesMax) {
        state.realizedThienCung = selfPalacesMax;
      }
    }

    convertToThienMenhIfInAnhRealm(state);

    return state;
  } catch (err) {
    return DEFAULT_STATE;
  }
}

/**
 * Lưu state tu vi
 */
export function saveCultivationState(state) {
  try {
    localStorage.setItem(CULTIVATION_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('cultivation_updated', { detail: state }));
  } catch (err) {}
}

export function clearUnreadDrops() {
  const state = getCultivationState();
  if (state.unreadDropsCount > 0) {
    state.unreadDropsCount = 0;
    saveCultivationState(state);
  }
  return state;
}

/**
 * Tính tổng số Mệnh Hỏa sở hữu ở Trúc Cơ
 */
export function getTotalMenhHoa(state) {
  const baseHoa = Math.floor(Math.min(120, state.phapKhieu || 0) / 30);
  const secretHoa = (state.has121st || (state.phapKhieu || 0) >= 121) ? 1 : 0;
  const selfHoa = state.selfMenhHoa !== undefined ? Math.min(5, Math.max(state.selfMenhHoa, baseHoa + secretHoa)) : (baseHoa + secretHoa);
  const lampCount = (state.absorbedLamps || []).length;
  return Math.min(10, selfHoa + lampCount);
}

/**
 * Tính tổng chiến lực ở cảnh giới Nguyên Anh (tính bằng Anh)
 */
export function getTotalCombatPowerAnh(state) {
  if (!state.daoAnhs || state.daoAnhs.length === 0) return 0;
  return state.daoAnhs.reduce((sum, da) => sum + (da.currentKiep || 0), 0);
}

/**
 * Trả về chuỗi chiến lực chuẩn xác theo từng cảnh giới
 */
export function getCombatPowerDisplay(state) {
  if (!state) state = getCultivationState();

  if (state.realm === 'ngung_khi') {
    const theLvl = state.ngungKhiTheLevel || state.ngungKhiLevel || 1;
    const phapLvl = state.ngungKhiPhapLevel || state.ngungKhiLevel || 1;

    const theDesc = theLvl === 10 ? '1 Bạt' : theLvl >= 5 ? (theLvl - 5 > 0 ? `1 Tiêu ${theLvl - 5} Hổ` : '1 Tiêu') : `${theLvl} Hổ`;
    const phapDesc = phapLvl === 10 ? '1 Cấm Hải' : phapLvl >= 5 ? (phapLvl - 5 > 0 ? `1 Tuyền ${phapLvl - 5} Lãng` : '1 Tuyền') : `${phapLvl} Lãng`;

    if (state.isSongTuVienMan || (theLvl >= 10 && phapLvl >= 10)) {
      return '1 Bạt · 1 Cấm Hải (👑 Song Tuyệt)';
    }

    if (state.ngungKhiActivePath === 'the') {
      return `${theDesc} Khí Huyết`;
    } else if (state.ngungKhiActivePath === 'phap') {
      return `${phapDesc} Linh Lực`;
    } else {
      return `Thể: ${theDesc} · Pháp: ${phapDesc}`;
    }
  }

  if (state.realm === 'truc_co') {
    const totalHoa = getTotalMenhHoa(state);
    return `${totalHoa} Hỏa`;
  }

  if (state.realm === 'kim_dan') {
    const lampCount = (state.absorbedLamps || []).length;
    const selfPalacesMax = Math.max(1, (state.maxThienCung || 6) - lampCount);
    const selfRealized = Math.min(selfPalacesMax, state.realizedThienCung !== undefined ? state.realizedThienCung : 0);
    const totalRealizedCung = Math.min(state.maxThienCung || 13, lampCount + selfRealized);
    return `${totalRealizedCung} Cung`;
  }

  if (state.realm === 'gia_anh' || state.realm === 'nguyen_anh') {
    const totalAnh = getTotalCombatPowerAnh(state);
    return `${totalAnh} Anh`;
  }

  return '0 Hổ';
}

/**
 * Kiểm tra xem cảnh giới hiện tại đã đạt Đại Viên Mãn (cực hạn) chưa
 */
export function isGrandCompletion(state) {
  if (!state) state = getCultivationState();

  if (state.realm === 'ngung_khi') {
    const theExp = state.ngungKhiTheExp !== undefined ? state.ngungKhiTheExp : (state.expCurrentRealm || state.totalExp || 0);
    const phapExp = state.ngungKhiPhapExp !== undefined ? state.ngungKhiPhapExp : (state.expCurrentRealm || state.totalExp || 0);
    return theExp >= 4500 && phapExp >= 4500;
  }

  if (state.realm === 'truc_co') {
    if (state.phapKhieu >= 120) {
      if (state.has121st || state.failed121st || state.attemptExp121 >= EXP_FOR_121_ATTEMPT) {
        return true;
      }
    }
    return false;
  }

  if (state.realm === 'kim_dan') {
    const lampCount = (state.absorbedLamps || []).length;
    const selfPalacesMax = Math.max(1, (state.maxThienCung || 6) - lampCount);
    const isAllPalacesReal = (state.realizedThienCung || 0) >= selfPalacesMax;
    return isAllPalacesReal && (state.daoAnhExp || 0) >= EXP_PER_DAO_ANH;
  }

  if (state.realm === 'gia_anh' || state.realm === 'nguyen_anh') {
    if (!state.daoAnhs || state.daoAnhs.length === 0) return false;
    return state.daoAnhs.every(da => (da.currentKiep || 0) >= 5);
  }

  return false;
}

/**
 * TÍCH LŨY EXP TU VI KHI ĐỌC TRUYỆN
 * - Mỗi chu kỳ đọc đủ 60s: Nhận ngẫu nhiên 50 - 100 Tu Vi (ở Nguyên Anh: 200 - 300 Tu Vi + 1~3 Điểm Thiên Mệnh).
 * - Tỉ lệ rơi Thần Vật: Mệnh Đăng (~3.0%), Vật Trấn Áp (~4.5%).
 * - Cơ chế Bảo Hiểm (Pity): Sau 45 chu kỳ liên tiếp chưa rơi đồ, kích hoạt 100% nhận 1 Thần Vật chưa có.
 * - Cơ chế Uẩn Tích Bình Cảnh (storedExp): Khi đạt ngưỡng tối đa của cảnh giới mà chưa đột phá, Tu Vi không bị mất mà uẩn tích lại, xả ra ngay khi phá cảnh thành công!
 */
export function addReadingProgress(novelId, chapterId, wordCount = 2000) {
  const state = getCultivationState();
  let gainedExp = 0;

  if (typeof novelId === 'number') {
    gainedExp = novelId;
  } else {
    const key = `${novelId}_${chapterId}`;
    state.readChapterIds[key] = Date.now();
    state.chaptersReadCount = Object.keys(state.readChapterIds).length;
    const isAnhRealm = state.realm === 'gia_anh' || state.realm === 'nguyen_anh';
    const minExp = isAnhRealm ? 200 : 50;
    const maxExp = isAnhRealm ? 300 : 100;
    gainedExp = Math.floor(Math.random() * (maxExp - minExp + 1)) + minExp;
  }

  const isGrand = isGrandCompletion(state);

  // TÍCH LŨY THIÊN MỆNH SỐ NHỎ KHI Ở NGUYÊN ANH / GIẢ ANH (+1 ~ +3 TM mỗi chu kỳ)
  let gainedThienMenh = 0;
  if (state.realm === 'gia_anh' || state.realm === 'nguyen_anh') {
    state.isThienMenhUnlocked = true;
    gainedThienMenh = Math.floor(Math.random() * 3) + 1; // 1 đến 3 Thiên Mệnh
    state.totalThienMenh = (state.totalThienMenh || 0) + gainedThienMenh;

    // Tự động nạp vào Đạo Anh đang độ kiếp (nếu có)
    const daoAnhs = state.daoAnhs || [];
    const activeDaoAnhs = daoAnhs.filter(da => (da.currentKiep || 0) < 5);
    if (activeDaoAnhs.length > 0) {
      const targetDa = activeDaoAnhs[0];
      const maxExp = targetDa.maxExp || 50;
      targetDa.maxExp = maxExp;
      targetDa.currentExp = Math.min(maxExp, (targetDa.currentExp || 0) + gainedThienMenh);
    }
  }

  // TỔNG TU VI
  state.totalExp = (state.totalExp || 0) + gainedExp;

  let droppedLamp = null;
  let droppedArtifact = null;
  let breakthrough = null;

  // ĐẾN CHÍNH THỨC NGUYÊN ANH: Mệnh Đăng và Vật Trấn Áp sẽ KHÔNG RƠI NỮA
  const isNguyenAnh = state.realm === 'nguyen_anh';

  if (!isNguyenAnh) {
    // Tăng bộ đếm bảo hiểm (Pity counter)
    state.pityReadingCycles = (state.pityReadingCycles || 0) + 1;

    const allOwnedLamps = [...(state.inventoryLamps || []), ...(state.absorbedLamps || [])];
    const unownedLamps = LIFE_LAMPS.filter(l => !allOwnedLamps.includes(l.id));

    const anchoredIds = Object.values(state.palaceAnchors || {}).map(a => a?.id).filter(Boolean);
    const allOwnedArtifacts = [...(state.inventoryArtifacts || []), ...anchoredIds];
    const unownedArtifacts = SUPPRESSING_ARTIFACTS.filter(a => !allOwnedArtifacts.includes(a.id));

    const dropLampRoll = Math.random();
    const dropArtRoll = Math.random();

    // 1. Tỉ lệ rơi tự nhiên: Mệnh Đăng (3%), Vật Trấn Áp (4.5%)
    if (dropLampRoll < 0.03 && unownedLamps.length > 0) {
      const randomIndex = Math.floor(Math.random() * unownedLamps.length);
      droppedLamp = unownedLamps[randomIndex];
      state.inventoryLamps = [...(state.inventoryLamps || []), droppedLamp.id];
      state.logs.unshift({
        text: `✨ KỲ DUYÊN THẦN VẬT! Ngộ ra Mệnh Đăng [${droppedLamp.name}] (Thần Phẩm) - Đã thêm vào túi trữ vật!`,
        time: Date.now(),
      });
      state.pityReadingCycles = 0; // Reset bảo hiểm
    } else if (dropArtRoll < 0.045 && unownedArtifacts.length > 0) {
      const randomIdx = Math.floor(Math.random() * unownedArtifacts.length);
      droppedArtifact = unownedArtifacts[randomIdx];
      state.inventoryArtifacts = [...(state.inventoryArtifacts || []), droppedArtifact.id];
      state.logs.unshift({
        text: `✨ KỲ DUYÊN XUẤT HIỆN! Nhặt được Vật Trấn Áp [${droppedArtifact.name}] (${droppedArtifact.type}) - Đã cất vào túi trữ vật!`,
        time: Date.now(),
      });
      state.pityReadingCycles = 0; // Reset bảo hiểm
    }

    // 2. Cơ chế Bảo Hiểm (Pity): 45 chu kỳ liên tiếp chưa rơi đồ
    if (!droppedLamp && !droppedArtifact && state.pityReadingCycles >= 45) {
      if (unownedLamps.length > 0 && (unownedArtifacts.length === 0 || Math.random() < 0.5)) {
        const randomIndex = Math.floor(Math.random() * unownedLamps.length);
        droppedLamp = unownedLamps[randomIndex];
        state.inventoryLamps = [...(state.inventoryLamps || []), droppedLamp.id];
        state.logs.unshift({
          text: `🏮 CƠ DUYÊN TẤT THÀNH (BẢO HIỂM)! Trời cao không phụ lòng người, ban tặng [${droppedLamp.name}] (Thần Phẩm) vào túi trữ vật!`,
          time: Date.now(),
        });
        state.pityReadingCycles = 0;
      } else if (unownedArtifacts.length > 0) {
        const randomIdx = Math.floor(Math.random() * unownedArtifacts.length);
        droppedArtifact = unownedArtifacts[randomIdx];
        state.inventoryArtifacts = [...(state.inventoryArtifacts || []), droppedArtifact.id];
        state.logs.unshift({
          text: `🏛️ CƠ DUYÊN TẤT THÀNH (BẢO HIỂM)! Đạo tâm kiên định kết tinh Vật Trấn Áp [${droppedArtifact.name}] vào túi trữ vật!`,
          time: Date.now(),
        });
        state.pityReadingCycles = 0;
      }
    }
  }

  if (droppedLamp || droppedArtifact) {
    state.unreadDropsCount = (state.unreadDropsCount || 0) + 1;
  }

  // XỬ LÝ TIẾN ĐỘ TU VI VÀ UẨN TÍCH BÌNH CẢNH
  if (!isGrand) {
    if (state.realm === 'ngung_khi') {
      const path = state.ngungKhiActivePath === 'phap' ? 'phap' : 'the';
      const theGained = path === 'the' ? gainedExp : 0;
      const phapGained = path === 'phap' ? gainedExp : 0;

      const prevTheLvl = state.ngungKhiTheLevel || 1;
      const prevPhapLvl = state.ngungKhiPhapLevel || 1;

      if (path === 'the' && (state.ngungKhiTheExp || 0) >= 4500) {
        state.storedExp = (state.storedExp || 0) + gainedExp;
      } else if (path === 'phap' && (state.ngungKhiPhapExp || 0) >= 4500) {
        state.storedExp = (state.storedExp || 0) + gainedExp;
      } else {
        if (theGained > 0) {
          const newExp = (state.ngungKhiTheExp || 0) + theGained;
          if (newExp > 4500) {
            state.storedExp = (state.storedExp || 0) + (newExp - 4500);
            state.ngungKhiTheExp = 4500;
          } else {
            state.ngungKhiTheExp = newExp;
          }
          for (let lvl = 10; lvl >= 1; lvl--) {
            if (state.ngungKhiTheExp >= 450) {
              state.ngungKhiTheLevel = lvl;
              break;
            }
          }
        }

        if (phapGained > 0) {
          const newExp = (state.ngungKhiPhapExp || 0) + phapGained;
          if (newExp > 4500) {
            state.storedExp = (state.storedExp || 0) + (newExp - 4500);
            state.ngungKhiPhapExp = 4500;
          } else {
            state.ngungKhiPhapExp = newExp;
          }
          for (let lvl = 10; lvl >= 1; lvl--) {
            if (state.ngungKhiPhapExp >= 450) {
              state.ngungKhiPhapLevel = lvl;
              break;
            }
          }
        }
      }

      state.ngungKhiLevel = Math.max(state.ngungKhiTheLevel || 1, state.ngungKhiPhapLevel || 1);
      state.expCurrentRealm = Math.max(state.ngungKhiTheExp || 0, state.ngungKhiPhapExp || 0);

      const isTheMax = (state.ngungKhiTheExp || 0) >= 4500;
      const isPhapMax = (state.ngungKhiPhapExp || 0) >= 4500;

      if ((isTheMax || isPhapMax) && !state.readyBreakthroughTrucCo) {
        state.readyBreakthroughTrucCo = true;
      }
    } else if (state.realm === 'truc_co') {
      const maxExp120 = TRUC_CO_KHIEU_THRESHOLDS[120] || 14568;
      if (state.phapKhieu < 120) {
        state.expCurrentRealm = (state.expCurrentRealm || 0) + gainedExp;
        const opened = getOpenedPhapKhieuFromExp(state.expCurrentRealm);
        if (opened > state.phapKhieu) {
          state.phapKhieu = Math.min(120, opened);
          const newSelfHoa = Math.floor(state.phapKhieu / 30);
          if (newSelfHoa > (state.selfMenhHoa || 0)) {
            state.selfMenhHoa = newSelfHoa;
          }
        }

        // Nếu đã chạm/vượt ngưỡng 120 khiếu, phần dư nạp vào Khiếu 121 hoặc Uẩn Tích
        if (state.expCurrentRealm >= maxExp120) {
          const excess = state.expCurrentRealm - maxExp120;
          state.expCurrentRealm = maxExp120;
          if (!state.has121st && !state.failed121st) {
            state.attemptExp121 = Math.min(EXP_FOR_121_ATTEMPT, (state.attemptExp121 || 0) + excess);
            if ((state.attemptExp121 || 0) >= EXP_FOR_121_ATTEMPT) {
              const rem = state.attemptExp121 - EXP_FOR_121_ATTEMPT;
              state.storedExp = (state.storedExp || 0) + rem;
            }
          } else {
            state.storedExp = (state.storedExp || 0) + excess;
          }
        }
      } else if (state.phapKhieu >= 120 && !state.has121st && !state.failed121st) {
        if ((state.attemptExp121 || 0) < EXP_FOR_121_ATTEMPT) {
          const needed = EXP_FOR_121_ATTEMPT - (state.attemptExp121 || 0);
          if (gainedExp >= needed) {
            state.attemptExp121 = EXP_FOR_121_ATTEMPT;
            state.storedExp = (state.storedExp || 0) + (gainedExp - needed);
          } else {
            state.attemptExp121 = (state.attemptExp121 || 0) + gainedExp;
          }
        } else {
          state.storedExp = (state.storedExp || 0) + gainedExp;
        }
      } else {
        state.storedExp = (state.storedExp || 0) + gainedExp;
      }
    } else if (state.realm === 'kim_dan') {
      const lampBonusCount = (state.absorbedLamps || []).length;
      const selfPalacesMax = Math.max(1, state.maxThienCung - lampBonusCount);

      if (state.realizedThienCung < selfPalacesMax) {
        const targetPalaceExp = 1000;
        const bottleneckExp = targetPalaceExp - 1;
        if (state.currentThienCungExp < bottleneckExp) {
          const needed = bottleneckExp - state.currentThienCungExp;
          if (gainedExp > needed) {
            state.currentThienCungExp = bottleneckExp;
            state.storedExp = (state.storedExp || 0) + (gainedExp - needed);
          } else {
            state.currentThienCungExp += gainedExp;
          }
        } else {
          state.storedExp = (state.storedExp || 0) + gainedExp;
        }
      } else {
        const prevDaoAnhExp = state.daoAnhExp || 0;
        if (prevDaoAnhExp < 10000) {
          state.daoAnhExp = Math.min(10000, prevDaoAnhExp + gainedExp);
          state.currentThienCungExp = state.daoAnhExp;
        } else {
          state.storedExp = (state.storedExp || 0) + gainedExp;
        }
      }
    }
  }

  saveCultivationState(state);
  return { state, gainedExp, gainedThienMenh, convertedToTienTinh: 0, isFirstRead: false, droppedLamp, droppedArtifact, breakthrough };
}

/**
 * HẤP THỤ MỆNH ĐĂNG (Vĩnh viễn, KHÔNG HOÀN TRẢ, Tối đa 5 Mệnh Đăng)
 */
export function absorbLifeLamp(lampId) {
  const state = getCultivationState();

  if (state.realm === 'ngung_khi') {
    throw new Error('Cảnh giới Ngưng Khí chưa thể hấp thụ Mệnh Đăng.');
  }

  if (state.realm === 'gia_anh' || state.realm === 'nguyen_anh') {
    throw new Error('Đến cảnh giới Nguyên Anh đạo cơ đã định hình, KHÔNG THỂ hấp thụ thêm Mệnh Đăng!');
  }

  const currentAbsorbed = state.absorbedLamps || [];
  if (currentAbsorbed.length >= 5) {
    throw new Error('Đã đạt giới hạn tối đa 5 Mệnh Đăng.');
  }

  if (!state.inventoryLamps.includes(lampId)) {
    throw new Error('Bạn không có Mệnh Đăng này trong túi trữ vật.');
  }

  state.inventoryLamps = state.inventoryLamps.filter(id => id !== lampId);
  state.absorbedLamps = [...currentAbsorbed, lampId];

  if (state.realm === 'kim_dan') {
    state.maxThienCung = (state.maxThienCung || 6) + 1;
    state.realizedThienCung = (state.realizedThienCung || 0) + 1;
  }

  saveCultivationState(state);
  return state;
}

/**
 * HÀM HỖ TRỢ ĐỐT TU VI / THIÊN MỆNH GÂY NGÃ CẢNH
 */
function applyExpBurn(state, deficitExp = 10000) {
  const isNguyenAnhStage = state.realm === 'gia_anh' || state.realm === 'nguyen_anh';

  if (isNguyenAnhStage) {
    const deficitTM = 200; 
    const totalTMStored = (state.totalThienMenh || 0) + (state.daoAnhs || []).reduce((sum, da) => sum + (da.currentExp || 0), 0);
    if (totalTMStored < deficitTM) {
      throw new Error(`Không đủ tài nguyên! Cần 200 Lực Thiên Mệnh (Hiện có: ${totalTMStored} TM).`);
    }

    let remainingCostTM = deficitTM;
    if ((state.totalThienMenh || 0) >= remainingCostTM) {
      state.totalThienMenh -= remainingCostTM;
      remainingCostTM = 0;
    } else {
      remainingCostTM -= (state.totalThienMenh || 0);
      state.totalThienMenh = 0;
      if (state.daoAnhs && state.daoAnhs.length > 0) {
        for (const da of state.daoAnhs) {
          if (remainingCostTM <= 0) break;
          if ((da.currentExp || 0) > 0) {
            const deduct = Math.min(da.currentExp, remainingCostTM);
            da.currentExp -= deduct;
            remainingCostTM -= deduct;
          }
        }
      }
    }
    return { deficitExp: 0, deficitTM };
  } else {
    const costExp = 10000;
    if ((state.totalExp || 0) < costExp) {
      throw new Error(`Không đủ tài nguyên! Cần 10.000 Tu Vi.`);
    }

    state.totalExp = Math.max(0, state.totalExp - costExp);

    if (state.realm === 'ngung_khi') {
      state.expCurrentRealm = Math.max(0, (state.expCurrentRealm || 0) - costExp);
      if (state.ngungKhiActivePath === 'the') {
        state.ngungKhiTheExp = Math.max(0, (state.ngungKhiTheExp || 0) - costExp);
      } else {
        state.ngungKhiPhapExp = Math.max(0, (state.ngungKhiPhapExp || 0) - costExp);
      }
    } else if (state.realm === 'truc_co') {
      state.expCurrentRealm = Math.max(0, (state.expCurrentRealm || 0) - costExp);
      state.phapKhieu = Math.min(120, getOpenedPhapKhieuFromExp(state.expCurrentRealm));
    } else if (state.realm === 'kim_dan') {
      state.currentThienCungExp = Math.max(0, (state.currentThienCungExp || 0) - costExp);
    }
    return { deficitExp: costExp, deficitTM: 0 };
  }
}

/**
 * LUYỆN HÓA MỆNH ĐĂNG TRONG TÚI TRỮ VẬT HOÀN TRẢ TU VI / THIÊN MỆNH (+3.000 Tu Vi / +50 TM)
 */
export function refineLampForExp(lampId) {
  const state = getCultivationState();
  const lamp = LIFE_LAMPS.find(l => l.id === lampId);
  if (!lamp) throw new Error('Mệnh Đăng không tồn tại.');

  if (!(state.inventoryLamps || []).includes(lampId)) {
    throw new Error(`Bạn không có [${lamp.name}] trong Túi Trữ Vật để luyện hóa.`);
  }

  const isNguyenAnhStage = state.realm === 'gia_anh' || state.realm === 'nguyen_anh';
  state.inventoryLamps = state.inventoryLamps.filter(id => id !== lampId);

  if (isNguyenAnhStage) {
    state.totalThienMenh = (state.totalThienMenh || 0) + 50;
    state.logs.unshift({
      text: `✨ Đã luyện hóa Thần Đăng [${lamp.name}] hoàn trả +50 Lực Thiên Mệnh!`,
      time: Date.now(),
    });
    saveCultivationState(state);
    return { state, gainedExp: 0, gainedThienMenh: 50, message: `✨ Đã luyện hóa [${lamp.name}], nhận +50 Lực Thiên Mệnh!` };
  } else {
    state.totalExp = (state.totalExp || 0) + 3000;
    state.expCurrentRealm = (state.expCurrentRealm || 0) + 3000;
    state.logs.unshift({
      text: `✨ Đã luyện hóa Thần Đăng [${lamp.name}] hoàn trả +3,000 Tu Vi!`,
      time: Date.now(),
    });
    saveCultivationState(state);
    return { state, gainedExp: 3000, gainedThienMenh: 0, message: `✨ Đã luyện hóa [${lamp.name}], nhận +3,000 Tu Vi!` };
  }
}

export const sellLampForTienTinh = refineLampForExp;
export const sellLampForPoints = refineLampForExp;
export const sellLamp = refineLampForExp;

/**
 * ĐỔI MỆNH ĐĂNG BẰNG CÁCH ĐỐT TU VI / THIÊN MỆNH (Nghịch Mệnh Hoán Đăng)
 */
export function buyLampWithExp(lampId) {
  const state = getCultivationState();
  const lamp = LIFE_LAMPS.find(l => l.id === lampId);
  if (!lamp) throw new Error('Mệnh Đăng không tồn tại.');

  const allOwned = [...(state.inventoryLamps || []), ...(state.absorbedLamps || [])];
  if (allOwned.includes(lampId)) throw new Error('Đạo hữu đã sở hữu vật này!');

  applyExpBurn(state, 10000);
  state.inventoryLamps = [...(state.inventoryLamps || []), lamp.id];

  saveCultivationState(state);
  return { state, lamp, message: `🔥 Đổi thành công [${lamp.name}]!` };
}

export const buyLampWithTienTinhAndExp = buyLampWithExp;
export const buyLampWithPointsAndExp = buyLampWithExp;
export const burnExpForLamp = buyLampWithExp;

/**
 * Format tên Đạo Anh chuẩn ngắn gọn không dính từ "Cung", "Đăng", "Mệnh Đăng"
 */
export function formatDaoAnhTitle(rawName) {
  if (!rawName) return 'Đạo Anh';
  let core = rawName.replace(/^Đạo Anh\s*\[?|\]?$/g, '').trim();
  core = core.replace(/Mệnh Đăng|Thần Đăng|Đăng|Cung/g, '').trim();
  return `Đạo Anh [${core}]`;
}

/**
 * Chuyển đổi tên Mệnh Đăng thành tên Chân Cung chuẩn Tiên Hiệp
 */
export function getLampPalaceName(lamp) {
  if (!lamp) return 'Chân Cung';
  let name = lamp.name || lamp.shortName || '';
  name = name.replace(/Mệnh Đăng|Thần Đăng|Đăng Cung|Đăng/g, '').trim();
  if (!name.endsWith('Cung')) {
    name = `${name} Cung`;
  }
  return name;
}

/**
 * Trả về phong cách Hoàng Kim Tiên Gia đồng nhất cho Thiên Cung
 */
export function getPalaceElementTheme(item) {
  if (!item) {
    return {
      name: 'Thần Quang',
      color: '#ffcc00',
      glow: 'rgba(255, 204, 0, 0.4)',
      bg: 'rgba(255, 204, 0, 0.08)',
      icon: '🏛️'
    };
  }

  const tierKey = item.tier;
  const tierInfo = LAMP_TIERS[tierKey] || LAMP_TIERS.than_pham;

  const color = item.color || tierInfo?.color || '#ffcc00';
  const glow = tierInfo?.border || `${color}66`;
  const bg = tierInfo?.bg || `${color}15`;
  const icon = item.icon || '🏛️';

  return {
    name: tierInfo?.name || 'Thần Quang',
    color,
    glow,
    bg,
    icon
  };
}

/**
 * Chuyển đổi tên Vật Trấn Áp thành tên Thiên Cung chuẩn Tiên Hiệp gọn gàng (VD: Bàn Cổ Khai Thiên Đồ -> Bàn Cổ Khai Thiên Cung)
 */
export function getPalaceNameFromArtifact(artifact, palaceIdx = 0, allAnchors = {}) {
  if (!artifact) return `Thiên Cung Tự Thân ${palaceIdx + 1}`;
  if (artifact.palaceName) return artifact.palaceName;

  let baseName = artifact.name || artifact.shortName || '';
  if (!baseName) return `Thiên Cung Tự Thân ${palaceIdx + 1}`;

  const customMap = {
    'bang_phach': 'Huyền Băng Cung',
    'tinh_thiet': 'Bách Luyện Tinh Cung',
    'thanh_phong': 'Thanh Phong Linh Cung',
    'kho_moc': 'Khô Mộc Hồi Xuân Cung',
    'dia_hoa': 'Địa Hỏa Tinh Cung',
    'quy_nguyen_quyet': 'Quy Nguyên Cung',
    'tinh_ngan': 'Ngân Linh Châu Cung',
    'loi_dinh_quyet': 'Lôi Đình Thối Thể Cung',
    'tuyet_lien': 'Băng Sơn Tuyết Cung',
    'xich_dong': 'Xích Đồng Trận Cung',
    'thanh_tam_kinh': 'Thanh Tâm Định Thần Cung',
    'thanh_ngoc': 'Thanh Ngọc Bội Cung',
    'hac_thiet_kiem_quyet': 'Tật Phong Kiếm Cung',
    'u_lan': 'U Lan Uẩn Khí Cung',
    'tram_thach': 'Trầm Hà Thạch Cung',
    'linh_vu': 'Thanh Điểu Linh Cung',
    
    'thai_hu': 'Thái Hư Kiếm Cung',
    'tu_van': 'Tử Vân Tiên Cung',
    'am_loi': 'U Minh Âm Lôi Cung',
    'huyet_chi': 'Cửu Diệp Huyết Cung',
    'ngu_hanh': 'Ngũ Hành Luân Chuyển Cung',
    'bich_hai': 'Bích Hải Triều Tịch Cung',
    'phi_loi_quyet': 'Bôn Lôi Kiếm Cung',
    'chieu_hon': 'Nhiếp Phách Cung',
    'thiet_cot': 'Kim Cương Bất Hoại Cung',
    'hoa_hoang': 'Hỏa Hoàng Huyết Cung',
    'thien_canh': 'Hư Không Thiên Kính Cung',
    'da_quang_tam_phap': 'Tử Vi Tụ Khí Cung',
    'tram_moc': 'Vạn Niên Trầm Cung',
    'hac_ma_cong': 'U Minh Thôn Hồn Cung',
    'bach_xa': 'Bạch Xà Long Cung',
    'phong_loi_quyet': 'Lăng Vân Bộ Cung',
    
    'tran_ma_dinh': 'Trấn Ma Đỉnh Cung',
    'bat_quai_do': 'Bát Quái Cung',
    'huyen_suong_cong': 'Cửu U Băng Phách Cung',
    'nghich_lan': 'Thanh Long Nghịch Lân Cung',
    'huyen_hoang': 'Huyền Hoàng Địa Cung',
    'phuong_hoang': 'Phượng Hoàng Niết Bàn Cung',
    'tu_la_sat_quyet': 'Tu La Thất Sát Cung',
    'thien_mon': 'Thiên Môn Khóa Cung',
    'tram_long_quyet': 'Trảm Thiên Cung',
    'thai_am': 'Thái Âm Chân Hỏa Cung',
    'nam_hai': 'Nam Hải Giao Long Cung',
    'van_kiem': 'Vạn Kiếm Quy Tông Cung',
    'dai_dia': 'Địa Mạch Thần Cung',
    'quy_coc': 'Quỷ Cốc Âm Dương Cung',
    'bac_dau': 'Bắc Đẩu Thất Tinh Cung',
    'hoang_kim': 'Hoàng Kim Thánh Giáp Cung',

    'thon_thien': 'Thôn Thiên Ma Cung',
    'chu_tuoc_cung': 'Chu Tước Chân Hỏa Cung',
    'luan_hoi_an': 'Lục Đạo Luân Hồi Cung',
    'hon_don_tuc': 'Hỗn Độn Sinh Tức Cung',
    'nghich_cot': 'Chân Long Hóa Hình Cung',
    'cuu_u': 'Minh Vương Trượng Cung',
    'thai_duong_cong': 'Đại Nhật Thần Cung',
    'bat_diet_the': 'Bất Diệt Kim Thân Cung',
    'hu_khong_thap': 'Hư Không Toái Liệt Cung',
    'bach_ho_sat': 'Bạch Hổ Đoạt Mệnh Cung',
    'thien_kiem': 'Tru Tiên Kiếm Trận Cung',
    'huyen_vu_giap': 'Huyền Vũ Bất Hoại Cung',
    'cuc_lac_tam_kinh': 'Vạn Phật Triều Tông Cung',
    'thoi_khong_phi': 'Thời Không Liệt Phùng Cung',
    'van_yeu_quyet': 'Vạn Yêu Thiên Thư Cung',
    'than_ma_an': 'Thần Ma Hỗn Hợp Cung',

    'tru_tien_tieu': 'Tru Tiên Kiếm Cung',
    'khai_thien_do': 'Bàn Cổ Khai Thiên Cung',
    'kim_dan_lo': 'Cửu Chuyển Đan Cung',
    'tien_hon_chau': 'Bất Diệt Tiên Hồn Cung',
    'than_ma_lenh': 'Thần Ma Hiệu Lệnh Cung',
    'bat_tu_duoc': 'Bất Tử Tiên Dược Cung',
    'hai_thien': 'Khai Thiên Búa Cung',
    'cung_khong': 'Cửu Thiên Cung Khuyết Cung',
    'vo_thuong': 'Bồ Đề Tâm Pháp Cung',
    'thai_so': 'Thái Sơ Hỗn Độn Kiếm Cung',
    'am_duong_lo': 'Âm Dương Lưỡng Nghi Cung',
    'nhan_qua_kinh': 'Nhân Quả Luân Hồi Cung',
    'thien_thu': 'Vô Tự Thiên Thư Cung',
    'tien_vuong': 'Đăng Tiên Thần Cung',
    'chuong_thien': 'Chưởng Thiên Cung',
    'hoa_sen': 'Thanh Liên Đạo Cung',

    'tao_hoa_ngoc_diep': 'Tạo Hóa Ngọc Điệp Cung',
    'kim_o_luyen_van_linh': 'Kim Ô Long Liễn Cung',
    'nguyen_thuy_thai_so_ma_kinh': 'Nguyên Thủy Thiên Ma Cung',
    'dao_menh_thien_ma_cong': 'Đạo Mệnh Thiên Ma Cung',
    'ngu_hanh_dai_dong_thien': 'Ngũ Hành Luân Chuyển Cung',
    'mac_sat_tien_phach': 'Mặc Sát Tiên Phách Cung',
    'huyen_hoang_diet_the_bien': 'Huyền Hoàng Diệt Thế Cung',
    'am_duong_hon_don_nguyen_can': 'Âm Dương Hỗn Độn Cung',
    'luc_dao_luan_hoi_tien_can': 'Lục Đạo Luân Hồi Cung',
    'tam_sinh_luan_hoi_an': 'Tam Sinh Luân Hồi Cung',
    'tran_nguc_minh_vuong_the': 'Trấn Ngục Minh Vương Cung',
    'thai_so_than_vuong_the': 'Thái Sơ Thần Vương Cung',
    'tien_thien_thanh_the_dao_thai': 'Thánh Thể Đạo Thai Cung',
    'hon_don_diet_the_loi_tri': 'Diệt Thế Lôi Trì Cung',
    'khoi_nguyen_vu_tru_ban_nguyen': 'Khởi Nguyên Vũ Trụ Cung',
    'tha_hoa_tu_tai_dai_phap': 'Tha Hóa Tự Tại Cung',
    'tieu_tuc_menh_thuat': 'Tiểu Túc Mệnh Cung',
    'con_bang_tien_phap': 'Côn Bằng Tiên Cung',
    'can_khon_luong_nghi_ho': 'Càn Khôn Lưỡng Nghi Cung',
    'cuu_kiep_loi_nguc_kiem_phap': 'Cửu Kiếp Lôi Ngục Cung',
    'van_de_tran_ma_quyen': 'Vạn Đế Trấn Ma Cung',
    'nhat_khi_hoa_tam_thanh': 'Nhất Khí Tam Thanh Cung',
    'vo_thuy_vo_chung_vo_vi_than': 'Vô Thủy Vô Chung Cung',
    'diet_the_loi_viem_dong': 'Diệt Thế Lôi Viêm Cung',
  };

  if (artifact.id && customMap[artifact.id]) {
    baseName = customMap[artifact.id];
  } else {
    if (!baseName.endsWith(' Cung')) {
      const stripSuffixes = [
        ' Ma Điển', ' Thần Điển', ' Bí Điển', ' Đạo Kinh', ' Tâm Kinh', ' Chân Kinh',
        ' Đan Kinh', ' Thần Kinh', ' Bí Quyết', ' Kiếm Quyết', ' Lôi Quyết', ' Thể Quyết',
        ' Kiếm Trận', ' Thần Công', ' Ma Công', ' Lô', ' Đồ', ' Quyết', ' Pháp',
        ' Kinh', ' Điển', ' Thuật', ' Công', ' Trận', ' Kính', ' Đỉnh', ' Bình',
        ' Châu', ' Tháp', ' Ấn', ' Hồ Lô', ' Lồng Đèn', ' Kiếm', ' Búa', ' Chuông',
        ' Trượng', ' Giáp', ' Xích', ' Bội', ' Phách', ' Thiết', ' Thảo'
      ];
      for (const suf of stripSuffixes) {
        if (baseName.endsWith(suf)) {
          baseName = baseName.slice(0, -suf.length);
          break;
        }
      }
      baseName = `${baseName} Cung`;
    }
  }

  // Xử lý chống trùng tên nếu có nhiều cung trấn áp trùng tên vật phẩm
  const existingNames = Object.entries(allAnchors || {})
    .filter(([pIdx, a]) => String(pIdx) !== String(palaceIdx) && a)
    .map(([_, a]) => a.palaceName || a.name);

  if (existingNames.includes(baseName)) {
    const rankWords = ['Đệ Nhất', 'Đệ Nhị', 'Đệ Tam', 'Đệ Tứ', 'Đệ Ngũ', 'Đệ Lục', 'Đệ Thất', 'Đệ Bát'];
    const rankTag = rankWords[palaceIdx] || `Cung ${palaceIdx + 1}`;
    baseName = `${baseName} (${rankTag})`;
  }

  return baseName;
}

/**
 * KHẢM NẠM VẬT TRẤN ÁP VÀO THIÊN CUNG (Đạt 100% Hóa Thực Cung Thật)
 * - Khi Thiên Cung đạt 99.99% (799/800 EXP), tu sĩ cần khảm nạm 1 Vật Trấn Áp từ Túi Trữ Vật.
 * - Vật Trấn Áp sẽ trấn thủ thiên cung vĩnh viễn, đưa Thiên Cung đạt 100% Cung Thật (+1 Cung chiến lực).
 * - Thiên Cung từ Mệnh Đăng luôn luôn đạt 100% không cần khảm nạm.
 */
export function anchorPalaceWithArtifact(palaceIndex, artifactId) {
  const state = getCultivationState();
  if (state.realm !== 'kim_dan' && state.realm !== 'gia_anh' && state.realm !== 'nguyen_anh') {
    throw new Error('Chỉ cảnh giới Kim Đan mới có thể khảm nạm Vật Trấn Áp vào Thiên Cung.');
  }

  const lampBonusCount = (state.absorbedLamps || []).length;
  const lampPalaceStartIndex = state.maxThienCung - lampBonusCount;
  const isLampPalace = palaceIndex >= lampPalaceStartIndex;

  if (isLampPalace) {
    throw new Error('Thiên Cung này hình thành từ Mệnh Đăng, đã sở hữu Thần Đăng trấn áp vĩnh cửu không cần khảm nạm.');
  }

  if (palaceIndex < state.realizedThienCung) {
    throw new Error('Thiên Cung này đã Hóa Thực thành Cung Thật hoàn tất.');
  }

  if (palaceIndex > state.realizedThienCung) {
    throw new Error('Hãy tích lũy và Hóa Thực tuần tự từ Thiên Cung trước.');
  }

  // Cần đạt ngưỡng nút thắt (targetPalaceExp - 1)
  const targetPalaceExp = getPalaceCost(palaceIndex + 1);
  const bottleneckExp = targetPalaceExp - 1;
  if (state.currentThienCungExp < bottleneckExp) {
    throw new Error(`Thiên Cung này chưa đạt ngưỡng tích lũy 99.99% (${state.currentThienCungExp}/${targetPalaceExp} EXP). Hãy đọc thêm chương để tích lũy linh lực trước khi trấn áp.`);
  }

  // Tìm artifact trong túi trữ vật
  const invArtifacts = state.inventoryArtifacts || [];
  const artIndex = invArtifacts.findIndex(id => id === artifactId);
  if (artIndex === -1) {
    throw new Error('Không tìm thấy Vật Trấn Áp này trong Túi Trữ Vật.');
  }

  const artObj = SUPPRESSING_ARTIFACTS.find(a => a.id === artifactId);
  if (!artObj) throw new Error('Dữ liệu Vật Trấn Áp không hợp lệ.');

  const tierInfo = LAMP_TIERS[artObj.tier] || LAMP_TIERS.ha_pham;
  const palaceName = getPalaceNameFromArtifact(artObj, palaceIndex, state.palaceAnchors || {});

  // Trừ vật phẩm khỏi túi trữ vật
  invArtifacts.splice(artIndex, 1);
  state.inventoryArtifacts = invArtifacts;

  // Khảm nạm vào Thiên Cung
  if (!state.palaceAnchors) state.palaceAnchors = {};
  state.palaceAnchors[palaceIndex] = {
    id: artObj.id,
    name: artObj.name,
    shortName: artObj.shortName || artObj.name,
    palaceName: palaceName,
    tier: artObj.tier,
    type: artObj.type,
    icon: artObj.icon,
    color: artObj.color,
    anchoredAt: Date.now(),
  };

  // Hoàn tất 100% Hóa Thực Cung Thật
  state.realizedThienCung += 1;
  state.currentThienCungExp = 0;

  state.logs.unshift({
    text: `👑 TRẤN CUNG THÀNH CÔNG! Đã dùng [${artObj.name}] trấn áp thành công, khởi sinh [${palaceName}] (100% Cung Thật, +1 Cung chiến lực)!`,
    time: Date.now(),
  });

  saveCultivationState(state);
  return {
    state,
    artifact: artObj,
    message: `👑 Trấn Cung Thành Công! Đã dùng [${artObj.name}] hoàn tất 100% Hóa Thực [${palaceName}]!`,
  };
}

/**
 * LUYỆN HÓA VẬT TRẤN ÁP TRONG TÚI TRỮ VẬT HOÀN TRẢ TU VI / THIÊN MỆNH (+3.000 Tu Vi / +50 TM)
 */
export function refineArtifactForExp(artifactId) {
  const state = getCultivationState();
  const art = SUPPRESSING_ARTIFACTS.find(a => a.id === artifactId);
  if (!art) throw new Error('Vật Trấn Áp không tồn tại.');

  const inv = state.inventoryArtifacts || [];
  const idx = inv.indexOf(artifactId);
  if (idx === -1) {
    throw new Error(`Bạn không có [${art.name}] trong Túi Trữ Vật để luyện hóa.`);
  }

  inv.splice(idx, 1);
  state.inventoryArtifacts = inv;

  const isNguyenAnhStage = state.realm === 'gia_anh' || state.realm === 'nguyen_anh';
  const gainedExp = 3000;
  const gainedTM = 50;

  if (isNguyenAnhStage) {
    state.totalThienMenh = (state.totalThienMenh || 0) + gainedTM;
    state.logs.unshift({
      text: `✨ Đã luyện hóa Bảo Vật [${art.name}] hoàn trả +${gainedTM} Lực Thiên Mệnh!`,
      time: Date.now(),
    });
    saveCultivationState(state);
    return {
      state,
      gainedThienMenh: gainedTM,
      gainedExp: 0,
      message: `✨ Đã luyện hóa [${art.name}], nhận +${gainedTM} Lực Thiên Mệnh!`,
    };
  } else {
    state.totalExp = (state.totalExp || 0) + gainedExp;
    state.expCurrentRealm = (state.expCurrentRealm || 0) + gainedExp;
    state.logs.unshift({
      text: `✨ Đã luyện hóa Bảo Vật [${art.name}] hoàn trả +${gainedExp.toLocaleString()} Tu Vi!`,
      time: Date.now(),
    });
    saveCultivationState(state);
    return {
      state,
      gainedExp,
      gainedThienMenh: 0,
      message: `✨ Đã luyện hóa [${art.name}], nhận +${gainedExp.toLocaleString()} Tu Vi!`,
    };
  }
}

/**
 * ĐỔI VẬT TRẤN ÁP BẰNG CÁCH ĐỐT TU VI / THIÊN MỆNH (Nghịch Thiên Hoán Bảo)
 */
export function buyArtifactWithExp(artifactId) {
  const state = getCultivationState();
  const art = SUPPRESSING_ARTIFACTS.find(a => a.id === artifactId);
  if (!art) throw new Error('Vật Trấn Áp không tồn tại.');

  const isAnchored = Object.values(state.palaceAnchors || {}).some(anc => (anc?.id || anc) === artifactId);
  const isInBag = (state.inventoryArtifacts || []).includes(artifactId);
  if (isAnchored || isInBag) throw new Error('Đạo hữu đã sở hữu bảo vật này!');

  applyExpBurn(state, 10000);
  state.inventoryArtifacts = [...(state.inventoryArtifacts || []), art.id];

  saveCultivationState(state);
  return { state, artifact: art, message: `🔥 Đổi thành công [${art.name}]!` };
}

export const sellArtifactForTienTinh = refineArtifactForExp;
export const sellArtifactForPoints = refineArtifactForExp;
export const buyArtifactWithTienTinhAndExp = buyArtifactWithExp;
export const buyArtifactWithPointsAndExp = buyArtifactWithExp;
export const buyArtifact = buyArtifactWithExp;
export const sellArtifact = refineArtifactForExp;



/**
 * LUYỆN HÓA NHIỀU MỆNH ĐĂNG VÀ VẬT TRẤN ÁP TRONG TÚI TRỮ VẬT CÙNG LÚC
 */
export function refineMultipleItemsForExp({ lampIds = [], artifactIds = [] }) {
  const state = getCultivationState();
  const isNguyenAnhStage = state.realm === 'gia_anh' || state.realm === 'nguyen_anh';
  let totalGainedExp = 0;
  let totalGainedTM = 0;
  const refinedLamps = [];
  const refinedArtifacts = [];

  // 1. Xử lý luyện hóa Mệnh Đăng
  if (lampIds && lampIds.length > 0) {
    let currentLamps = [...(state.inventoryLamps || [])];
    for (const lampId of lampIds) {
      const idx = currentLamps.indexOf(lampId);
      if (idx !== -1) {
        const lamp = LIFE_LAMPS.find(l => l.id === lampId);
        if (lamp) {
          if (isNguyenAnhStage) totalGainedTM += 50;
          else totalGainedExp += 3000;
          currentLamps.splice(idx, 1);
          refinedLamps.push(lamp);
        }
      }
    }
    state.inventoryLamps = currentLamps;
  }

  // 2. Xử lý luyện hóa Vật Trấn Áp
  if (artifactIds && artifactIds.length > 0) {
    let currentArtifacts = [...(state.inventoryArtifacts || [])];
    for (const artifactId of artifactIds) {
      const idx = currentArtifacts.indexOf(artifactId);
      if (idx !== -1) {
        const art = SUPPRESSING_ARTIFACTS.find(a => a.id === artifactId);
        if (art) {
          if (isNguyenAnhStage) totalGainedTM += 50;
          else totalGainedExp += 3000;
          currentArtifacts.splice(idx, 1);
          refinedArtifacts.push(art);
        }
      }
    }
    state.inventoryArtifacts = currentArtifacts;
  }

  const totalCount = refinedLamps.length + refinedArtifacts.length;
  if (totalCount === 0) {
    throw new Error('Không có vật phẩm hợp lệ nào trong Túi Trữ Vật để luyện hóa.');
  }

  if (isNguyenAnhStage) {
    state.totalThienMenh = (state.totalThienMenh || 0) + totalGainedTM;
    state.logs.unshift({
      text: `✨ Luyện Hóa Hàng Loạt: Đã phân giải ${totalCount} Thần Vật, nhận +${totalGainedTM} Lực Thiên Mệnh!`,
      time: Date.now(),
    });
  } else {
    state.totalExp = (state.totalExp || 0) + totalGainedExp;
    state.logs.unshift({
      text: `✨ Luyện Hóa Hàng Loạt: Đã phân giải ${totalCount} Thần Vật, nhận +${totalGainedExp.toLocaleString()} Tu Vi!`,
      time: Date.now(),
    });
  }

  saveCultivationState(state);
  return {
    state,
    totalGainedExp,
    totalGainedTM,
    totalGainedTienTinh: 0,
    soldCount: totalCount,
    refinedCount: totalCount,
    refinedLamps,
    refinedArtifacts,
    message: isNguyenAnhStage 
      ? `Đã luyện hóa thành công ${totalCount} Thần Vật, nhận +${totalGainedTM} Thiên Mệnh!`
      : `Đã luyện hóa thành công ${totalCount} Thần Vật, nhận +${totalGainedExp.toLocaleString()} Tu Vi!`,
  };
}

export const sellMultipleItems = refineMultipleItemsForExp;

/**
 * THẺ TRẢI NGHIỆM KIM ĐAN V2 (Tiêu biến ngay lập tức sau khi dùng)
 * - Đặt trạng thái: Trúc Cơ 4 Mệnh Hỏa, 120 Pháp Khiếu, 121 thất bại, 4 Mệnh Đăng random.
 * - Cho random Vật Trấn Áp đủ dùng vào túi.
 * - Thẻ tiêu biến NGAY khi bấm (hasUsedKimDanTrialV2 = true).
 * - Mở cờ isKimDanTrialV2 = true để hiện nút "Thăng Cung" trong Kim Đan.
 */
export function activateKimDanTrialV2() {
  const state = getCultivationState();
  if (state.hasUsedKimDanTrialV2) {
    throw new Error('Thẻ Trải Nghiệm Kim Đan đã tiêu biến vĩnh viễn!');
  }

  // Sao lưu trạng thái hiện tại trước khi kích hoạt thẻ thử nghiệm
  const backup = {
    realm: state.realm,
    expCurrentRealm: state.expCurrentRealm,
    totalExp: state.totalExp,
    phapKhieu: state.phapKhieu,
    selfMenhHoa: state.selfMenhHoa,
    has121st: state.has121st,
    failed121st: state.failed121st,
    attemptExp121: state.attemptExp121,
    tienTinh: state.tienTinh,
    inventoryLamps: state.inventoryLamps ? [...state.inventoryLamps] : [],
    absorbedLamps: state.absorbedLamps ? [...state.absorbedLamps] : [],
    inventoryArtifacts: state.inventoryArtifacts ? [...state.inventoryArtifacts] : [],
    palaceAnchors: state.palaceAnchors ? { ...state.palaceAnchors } : {},
    maxThienCung: state.maxThienCung,
    realizedThienCung: state.realizedThienCung,
    currentThienCungExp: state.currentThienCungExp,
    totalThienMenh: state.totalThienMenh,
    daoAnhs: state.daoAnhs ? [...state.daoAnhs] : [],
    daoAnhProgress: state.daoAnhProgress ? { ...state.daoAnhProgress } : {},
    chaptersReadCount: state.chaptersReadCount || 0,
  };
  state.preTrialBackupV2 = backup;

  // Chọn 4 Mệnh Đăng random không trùng nhau
  const allLampIds = LIFE_LAMPS.map(l => l.id);
  const shuffled = [...allLampIds].sort(() => Math.random() - 0.5);
  const randomLamps = shuffled.slice(0, 4);

  // Chọn random Vật Trấn Áp – cần tối thiểu 7 cái (cho 7 Cung Tự Thân tối đa)
  const allArtIds = SUPPRESSING_ARTIFACTS.map(a => a.id);
  const shuffledArts = [...allArtIds].sort(() => Math.random() - 0.5);
  const randomArts = shuffledArts.slice(0, Math.min(9, shuffledArts.length));

  // Thiết lập trạng thái Trúc Cơ 4 Mệnh Hỏa – pháp khiếu 121 thất bại, 4 Mệnh Đăng đã hấp thụ
  state.realm = 'truc_co';
  state.phapKhieu = 120;
  state.selfMenhHoa = 4;
  state.has121st = false;
  state.failed121st = true;         // 121 đã thất bại
  state.attemptExp121 = 0;
  state.absorbedLamps = randomLamps;  // 4 Mệnh Đăng đã hấp thụ
  state.inventoryLamps = [];          // Không còn mệnh đăng chờ trong túi
  state.expCurrentRealm = 0;
  state.totalExp = 0;
  state.tienTinh = 0;
  state.dangDiem = 0;

  // Vật Trấn Áp random đủ dùng
  state.inventoryArtifacts = randomArts;

  // Điểm Thiên Mệnh khởi đầu là 0 (chỉ nhận khi Đạo Anh độ kiếp)
  state.totalThienMenh = 0;

  // Tiêu biến ngay lập tức + cờ hiện nút Thăng Cung
  state.hasUsedKimDanTrialV2 = true;
  state.isKimDanTrialV2 = true;

  state.logs = [{
    text: '📜 KÍCH HOẠT THẺ TRẢI NGHIỆM KIM ĐAN! Đã thiết lập Trúc Cơ 4 Mệnh Hỏa, 120 Pháp Khiếu (121 thất bại), 4 Mệnh Đăng ngẫu nhiên. Hãy tự đột phá lên Kim Đan!',
    time: Date.now(),
  }];

  saveCultivationState(state);
  return {
    state,
    message: '✨ Thẻ Trải Nghiệm Kim Đan đã kích hoạt! Đã thiết lập Trúc Cơ 4 Hỏa + 4 Mệnh Đăng random. Thẻ đã tiêu biến vĩnh viễn. Hãy tự Đột Phá Kim Đan!',
    randomLamps,
    randomArts,
  };
}

/**
 * KẾT THÚC THỬ NGHIỆM KIM ĐAN V2
 * - Tắt cờ isKimDanTrialV2 = false.
 * - Khôi phục trạng thái backup nếu có (hoặc reset về ban đầu nếu không có backup).
 * - Thẻ tiêu biến vĩnh viễn (hasUsedKimDanTrialV2 = true).
 */
export function endKimDanTrialV2() {
  const state = getCultivationState();
  if (!state.isKimDanTrialV2) {
    throw new Error('Hiện tại không ở trong chế độ Thử Nghiệm Kim Đan!');
  }

  if (state.preTrialBackupV2) {
    const backup = state.preTrialBackupV2;
    state.realm = backup.realm || 'phap_khieu';
    state.expCurrentRealm = backup.expCurrentRealm || 0;
    state.totalExp = backup.totalExp || 0;
    state.phapKhieu = backup.phapKhieu || 0;
    state.selfMenhHoa = backup.selfMenhHoa || 0;
    state.has121st = backup.has121st || false;
    state.failed121st = backup.failed121st || false;
    state.attemptExp121 = backup.attemptExp121 || 0;
    state.tienTinh = backup.tienTinh || 0;
    state.inventoryLamps = backup.inventoryLamps || [];
    state.absorbedLamps = backup.absorbedLamps || [];
    state.inventoryArtifacts = backup.inventoryArtifacts || [];
    state.palaceAnchors = backup.palaceAnchors || {};
    state.maxThienCung = backup.maxThienCung || 6;
    state.realizedThienCung = backup.realizedThienCung || 0;
    state.currentThienCungExp = backup.currentThienCungExp || 0;
    state.totalThienMenh = backup.totalThienMenh || 0;
    state.daoAnhs = backup.daoAnhs || [];
    state.daoAnhProgress = backup.daoAnhProgress || {};
    state.chaptersReadCount = backup.chaptersReadCount || 0;
    state.preTrialBackupV2 = null;
  } else {
    state.realm = 'phap_khieu';
    state.expCurrentRealm = 0;
    state.totalExp = 0;
    state.phapKhieu = 0;
    state.selfMenhHoa = 0;
    state.has121st = false;
    state.failed121st = false;
    state.attemptExp121 = 0;
    state.tienTinh = 0;
    state.inventoryLamps = [];
    state.absorbedLamps = [];
    state.inventoryArtifacts = [];
    state.palaceAnchors = {};
    state.maxThienCung = 6;
    state.realizedThienCung = 0;
    state.currentThienCungExp = 0;
    state.totalThienMenh = 0;
    state.daoAnhs = [];
    state.daoAnhProgress = {};
  }

  state.isKimDanTrialV2 = false;
  state.hasUsedKimDanTrialV2 = true;

  state.logs.unshift({
    text: '🚪 ĐÃ KẾT THÚC CHẾ ĐỘ THỬ NGHIỆM KIM ĐAN! Đã khôi phục cảnh giới tu vi ban đầu.',
    time: Date.now(),
  });

  saveCultivationState(state);
  return {
    state,
    message: '🚪 Đã kết thúc chế độ Thử Nghiệm Kim Đan và khôi phục tu vi ban đầu!',
  };
}

/**
 * THĂNG CUNG – Đẩy tiến độ Thiên Cung hiện tại lên 99.99% (bottleneck chờ Vật Trấn Áp)
 * Chỉ hoạt động trong Kim Đan và khi còn Cung Tự Thân chưa hóa thực.
 */
export function thangCungKimDan() {
  const state = getCultivationState();
  if (state.realm !== 'kim_dan') {
    throw new Error('Chỉ dùng được khi đang ở cảnh giới Kim Đan!');
  }

  const lampCount = (state.absorbedLamps || []).length;
  const selfPalacesTotal = (state.maxThienCung || 0) - lampCount;
  const selfRealized = state.realizedThienCung || 0;

  if (selfRealized >= selfPalacesTotal) {
    throw new Error('Toàn bộ Cung Tự Thân đã hóa thực! Không cần Thăng Cung nữa.');
  }

  const nextSelfPalaceNum = selfRealized + 1; // 1-indexed trong self palaces
  const targetExp = getPalaceCost(nextSelfPalaceNum) - 1; // 99.99%

  if ((state.currentThienCungExp || 0) >= targetExp) {
    throw new Error('Cung Tự Thân hiện tại đã đạt 99.99%! Hãy khảm nạm Vật Trấn Áp.');
  }

  state.currentThienCungExp = targetExp;

  state.logs.unshift({
    text: `⬆️ THĂNG CUNG! Đã đẩy Cung Tự Thân ${nextSelfPalaceNum} lên 99.99% linh lực (${targetExp} Tu Vi). Hãy khảm nạm Vật Trấn Áp để hoàn tất 100% Cung Thật!`,
    time: Date.now(),
  });

  saveCultivationState(state);
  return {
    state,
    message: `⬆️ Thăng Cung thành công! Cung ${nextSelfPalaceNum} đạt 99.99% — cần Khảm Nạm Vật Trấn Áp để hoàn tất!`,
  };
}

/**
 * Chuyển đổi con đường tu luyện Ngưng Khí ('the' | 'phap')
 */
export function setNgungKhiActivePath(path) {
  const state = getCultivationState();
  if (['the', 'phap'].includes(path)) {
    state.ngungKhiActivePath = path;
    saveCultivationState(state);
  }
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

  const theLvl = state.ngungKhiTheLevel || state.ngungKhiLevel || 1;
  const phapLvl = state.ngungKhiPhapLevel || state.ngungKhiLevel || 1;
  const isSongTu = theLvl >= 10 && phapLvl >= 10;

  state.realm = 'truc_co';
  state.expCurrentRealm = TRUC_CO_KHIEU_THRESHOLDS[1]; // Khởi đầu 50 EXP tương ứng Khiếu 1 đã mở
  state.phapKhieu = 1;
  state.selfMenhHoa = 0;
  state.has121st = false;
  state.failed121st = false;
  state.attemptExp121 = 0;

  if (isSongTu) {
    state.hasSongTuBonus = true;
    state.logs.unshift({
      text: '👑 THỂ PHÁP SONG TU ĐẠI THÀNH! Đột phá Trúc Cơ với nền tảng Vô Thượng Cực Cảnh! Kích hoạt hiệu ứng "Thể Pháp Song Tuyệt": Giảm 15% Tu Vi tiêu hao khi mở 120 Pháp Khiếu và +20% Tốc độ tu luyện vĩnh viễn!',
      time: Date.now(),
    });
  } else {
    state.logs.unshift({
      text: `Trúc Cơ thành công! Nền móng (${theLvl >= 10 ? 'Luyện Thể Hải Sơn Quyết' : 'Pháp Tu Hóa Hải Kinh'}) vững chắc, tẩy kinh phạt tủy, mở ra Pháp Khiếu đầu tiên.`,
      time: Date.now(),
    });
  }

  // Xả storedExp nếu có
  if ((state.storedExp || 0) > 0) {
    const expToFlush = state.storedExp;
    state.storedExp = 0;
    state.expCurrentRealm = (state.expCurrentRealm || 0) + expToFlush;
    state.phapKhieu = Math.min(120, getOpenedPhapKhieuFromExp(state.expCurrentRealm));
    state.selfMenhHoa = Math.floor(state.phapKhieu / 30);
    state.logs.unshift({
      text: `🌊 UẨN TÍCH PHÁ CẢNH XẢ RA! +${expToFlush.toLocaleString()} Tu Vi uẩn tích từ bình cảnh Ngưng Khí đã xả vào Trúc Cơ, khai mở ${state.phapKhieu}/120 Pháp Khiếu!`,
      time: Date.now(),
    });
  }

  saveCultivationState(state);
  return state;
}

/**
 * Xung kích khai mở Pháp Khiếu tiếp theo ở Trúc Cơ Kỳ
 */
export function unlockNextPhapKhieu() {
  const state = getCultivationState();
  if (state.realm !== 'truc_co' || state.phapKhieu >= 120) {
    throw new Error('Chưa thể khai mở pháp khiếu tiếp theo.');
  }
  const next = (state.phapKhieu || 0) + 1;
  const cost = getExpForPhapKhieuIndex(next);
  const neededCumulative = TRUC_CO_KHIEU_THRESHOLDS[next] || 0;
  if (state.expCurrentRealm < neededCumulative) {
    const currentProg = Math.max(0, state.expCurrentRealm - (TRUC_CO_KHIEU_THRESHOLDS[state.phapKhieu] || 0));
    throw new Error(`Linh lực chưa đầy (${currentProg}/${cost} EXP) để xung kích Pháp Khiếu #${next}. Hãy đọc truyện hoặc tĩnh tọa tụ khí thêm!`);
  }
  state.phapKhieu = next;
  const newSelfHoa = Math.floor(next / 30);
  if (newSelfHoa > (state.selfMenhHoa || 0)) {
    state.selfMenhHoa = newSelfHoa;
    state.logs.unshift({
      text: `🔥 THẮP SÁNG ${newSelfHoa} HỎA TỰ THÂN! Pháp khiếu đã khai mở ${next}/120 khiếu (+1 Hỏa chiến lực)!`,
      time: Date.now()
    });
  } else {
    state.logs.unshift({
      text: `⚡ Khai mở thành công Pháp Khiếu #${next}!`,
      time: Date.now()
    });
  }
  saveCultivationState(state);
  return state;
}

/**
 * Xung kích mở Pháp Khiếu thứ 121
 * - Tỉ lệ thành công: 60%
 * - Thất bại: Căn cơ đóng kín vĩnh viễn (không thể mở 121 nữa)
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
  const isSuccess = roll < 0.60; // 60% thành công

  if (isSuccess) {
    state.has121st = true;
    state.failed121st = false;
    state.phapKhieu = 121;
    state.selfMenhHoa = 5;
    const successMsg = '⚡ NGHỊCH THIÊN KHAI KHIẾU · CỰC CẢNH SINH TỬ!\n\n"Tìm đường sống trong cõi chết, đắc đạo giữa lằn ranh sinh tử. Đập nát gông cùm thiên đạo, ngộ ra Pháp Khiếu thứ 121 cấm kỵ vạn cổ!"\n\n✦ Đan Điền hóa sinh 36 Phẩm Hỗn Độn Thanh Liên.\n✦ Ngưng tụ Mệnh Hỏa tự thân thứ 5 (+1 Hỏa Chiến Lực, đạt Ngũ Hỏa Cực Cảnh)!';
    state.logs.unshift({
      text: successMsg,
      time: Date.now(),
    });
    saveCultivationState(state);
    return { state, isSuccess: true, message: successMsg };
  } else {
    state.failed121st = true; // Thất bại: Đóng vĩnh viễn
    const failMsg = '⚠️ CỰC CẢNH SINH TỬ · THẤT BẠI!\n\n"Lằn ranh sinh tử mỏng manh như sợi tóc. Pháp khiếu 121 tan biến trong hư vô, căn cơ đóng kín, vĩnh viễn không thể khai mở Khiếu 121 nữa!"';
    state.logs.unshift({
      text: failMsg,
      time: Date.now(),
    });
    saveCultivationState(state);
    return { state, isSuccess: false, message: failMsg };
  }
}

/**
 * Đột phá từ Trúc Cơ lên Kim Đan
 */
export function breakthroughToKimDan() {
  const state = getCultivationState();
  const selfHoa = state.selfMenhHoa || Math.floor((state.phapKhieu || 0) / 30);
  const totalBaseHoa = selfHoa + (state.has121st ? 1 : 0);

  if (state.realm !== 'truc_co' || totalBaseHoa < 3) {
    throw new Error('Cần tối thiểu 3 Mệnh Hỏa tự thân để kết đan.');
  }

  let baseThienCung = 6;
  if (totalBaseHoa === 4) baseThienCung = 7;
  else if (totalBaseHoa >= 5) baseThienCung = 8;

  const lampBonusCung = (state.absorbedLamps || []).length;
  const totalThienCung = Math.min(13, baseThienCung + lampBonusCung);

  state.realm = 'kim_dan';
  state.expCurrentRealm = 0;
  state.maxThienCung = totalThienCung;
  state.realizedThienCung = 0; // 0 Cung tự thân đã hóa thực ban đầu (toàn bộ Cung Tự Thân ban đầu đều HƯ ẢO 0%, cần nạp linh lực & khảm nạm Trấn Cung Vật)
  state.currentThienCungExp = 0;

  // Xả storedExp vào Cung 1 nếu có
  if ((state.storedExp || 0) > 0) {
    const targetPalaceExp = getPalaceCost(1);
    const bottleneckExp = targetPalaceExp - 1;
    const flushExp = Math.min(bottleneckExp, state.storedExp);
    state.currentThienCungExp = flushExp;
    state.storedExp -= flushExp;
    state.logs.unshift({
      text: `🌊 UẨN TÍCH PHÁ CẢNH XẢ RA! +${flushExp.toLocaleString()} Tu Vi uẩn tích từ Trúc Cơ đã rót vào Thiên Cung Đệ Nhất (${flushExp}/${targetPalaceExp} EXP)!`,
      time: Date.now(),
    });
  }

  state.logs.unshift({
    text: `Đột phá Kim Đan thành công! Sở hữu trần ${totalThienCung} Thiên Cung (${baseThienCung} Cung tự thân hư ảo + ${lampBonusCung} Chân Cung Mệnh Đăng thật). Chiến lực tính bằng Cung Thật!`,
    time: Date.now(),
  });

  saveCultivationState(state);
  return state;
}

export const TRIBULATION_NAMES = {
  1: 'Ngũ Hành Lôi Kiếp (1K ➔ 2K)',
  2: 'Tâm Ma Hỏa Kiếp (2K ➔ 3K)',
  3: 'Vẫn Tinh Âm Kiếp (3K ➔ 4K)',
  4: 'Cửu Thiên Trọng Kiếp (4K ➔ 5K)',
  5: 'Nguyên Anh Đại Viên Mãn (5 Kiếp Luân Hồi)',
};

/**
 * NẠP TU VI THAI NGHÉN ĐẠO ANH (10.000 Tu Vi)
 */
export function injectExpToThaiNghen(palaceIndex, expAmount = 10000) {
  const state = getCultivationState();
  const lampCount = (state.absorbedLamps || []).length;
  const selfRealized = state.realizedThienCung || 0;
  const totalRealized = lampCount + selfRealized;

  if (totalRealized < state.maxThienCung) {
    throw new Error(`Cần Hóa Thực toàn bộ ${state.maxThienCung}/${state.maxThienCung} Thiên Cung thành Cung Thật trước!`);
  }

  if (!state.daoAnhProgress) state.daoAnhProgress = {};
  const currentProgress = state.daoAnhProgress[palaceIndex] || 0;

  if (currentProgress >= EXP_PER_DAO_ANH) {
    return { state, message: 'Đã đạt 10.000/10.000 Tu Vi thai nghén Đạo Anh! Hãy bấm Khai Sinh Đạo Anh.' };
  }

  const needed = EXP_PER_DAO_ANH - currentProgress;
  const availableExp = state.totalExp || 0;

  // Cho phép nạp đủ 10k nếu có cờ isKimDanTrialV2 hoặc từ tu vi tích lũy
  let addExp = needed;
  if (!state.isKimDanTrialV2) {
    if (availableExp <= 0) {
      throw new Error('Chưa có đủ Tu Vi linh lực! Hãy đọc thêm chương sách để tích lũy Tu Vi.');
    }
    addExp = Math.min(needed, Math.min(expAmount, availableExp));
    state.totalExp -= addExp;
  }

  state.daoAnhProgress[palaceIndex] = currentProgress + addExp;

  state.logs.unshift({
    text: `✨ THAI NGHÉN ĐẠO ANH! Đã tích lũy +${addExp.toLocaleString()} Tu Vi linh lực vào Thiên Cung ${palaceIndex + 1} (${state.daoAnhProgress[palaceIndex].toLocaleString()}/${EXP_PER_DAO_ANH.toLocaleString()} Tu Vi).`,
    time: Date.now(),
  });

  saveCultivationState(state);
  return {
    state,
    progress: state.daoAnhProgress[palaceIndex],
    message: state.daoAnhProgress[palaceIndex] >= EXP_PER_DAO_ANH 
      ? `✨ Đã tích lũy đủ 10.000 Tu Vi linh lực! Đạo Anh đã sẵn sàng Khai Sinh!`
      : `✨ Đã tích lũy +${addExp.toLocaleString()} Tu Vi thai nghén Đạo Anh (${state.daoAnhProgress[palaceIndex].toLocaleString()}/10.000 Tu Vi)!`,
  };
}

/**
 * Helper: Xác định Phẩm Cấp của Đạo Anh dựa theo Mệnh Đăng hoặc Vật Trấn Áp nguồn gốc
 */
export function getDaoAnhTierKey(da, state) {
  if (!da) return 'than_pham';
  if (da.tier) return da.tier;
  if (da.fromLamp && da.lampId) {
    const lamp = LIFE_LAMPS.find(l => l.id === da.lampId);
    if (lamp?.tier) return lamp.tier;
  }
  if (da.artifactId) {
    const art = SUPPRESSING_ARTIFACTS.find(a => a.id === da.artifactId);
    if (art?.tier) return art.tier;
  }
  if (state?.palaceAnchors) {
    const anchor = state.palaceAnchors[da.palaceIndex] || state.palaceAnchors[da.palaceIndex - (state.absorbedLamps?.length || 0)];
    if (anchor?.tier) return anchor.tier;
  }
  return 'than_pham';
}

/**
 * Helper: Tính toán Lực Thiên Mệnh nhận được khi Đạo Anh vượt kiếp thành công
 */
export function calculateDaoAnhTribulationReward(da, targetKiep, state) {
  const tierKey = getDaoAnhTierKey(da, state);
  const baseTM = TIER_BASE_THIEN_MENH_REWARDS[tierKey] || 5000;
  const kiepMultipliers = [1.0, 1.5, 2.0, 3.0, 5.0];
  const mult = kiepMultipliers[Math.min(4, Math.max(0, (targetKiep || 1) - 1))] || 1.0;
  return Math.round(baseTM * mult);
}

/**
 * Chuyển hóa 1 Thiên Cung đã Hóa Thực thành Đạo Anh
 */
export function manifestDaoAnh(palaceIndex) {
  const state = getCultivationState();
  if (state.realm !== 'kim_dan' && state.realm !== 'gia_anh' && state.realm !== 'nguyen_anh') {
    throw new Error('Cảnh giới chưa đủ để ngưng tụ Đạo Anh.');
  }

  // Điều kiện 1: Toàn bộ Thiên Cung phải được Hóa Thực thành Cung Thật 100%
  const lampCount = (state.absorbedLamps || []).length;
  const selfRealized = state.realizedThienCung || 0;
  const totalRealized = lampCount + selfRealized;

  if (totalRealized < state.maxThienCung) {
    throw new Error(`Chưa đủ điều kiện! Cần Hóa Thực toàn bộ ${state.maxThienCung}/${state.maxThienCung} Thiên Cung thành Cung Thật trước khi bắt đầu Hóa Đạo Anh.`);
  }

  // Điều kiện 2: Kiểm tra tiến độ Thai Nghén Đạo Anh (10.000 Tu Vi)
  const totalThaiNghenExp = state.daoAnhExp || state.currentThienCungExp || 0;
  if (totalThaiNghenExp < EXP_PER_DAO_ANH && !state.isKimDanTrialV2) {
    throw new Error(`Cần tích lũy đủ ${EXP_PER_DAO_ANH.toLocaleString()} Tu Vi linh lực thai nghén (Hiện có: ${totalThaiNghenExp.toLocaleString()}/${EXP_PER_DAO_ANH.toLocaleString()} Tu Vi). Hãy đọc thêm chương để tích lũy!`);
  }

  if (!state.daoAnhs) state.daoAnhs = [];

  const absorbed = state.absorbedLamps || [];
  const maxThienCung = state.maxThienCung || 13;

  const buildDaoAnhObj = (idx) => {
    const isLampPalace = idx < lampCount;
    let lampObj = null;
    let elementAttr = 'Ngũ Hành Thần Thể';
    let daoAnhTitle = '';
    let tier = 'than_pham';
    let lampId = null;
    let artifactId = null;
    let palaceName = '';

    if (isLampPalace) {
      lampId = absorbed[idx];
      lampObj = LIFE_LAMPS.find(l => l.id === lampId);
      tier = lampObj ? lampObj.tier : 'ha_pham';
      palaceName = lampObj ? getLampPalaceName(lampObj) : `Chân Cung #${idx + 1}`;
      daoAnhTitle = formatDaoAnhTitle(palaceName);
      let shortName = lampObj ? (lampObj.shortName || lampObj.name) : `Đăng ${idx + 1}`;
      shortName = shortName.replace(/Mệnh Đăng|Thần Đăng|Đăng|Cung/g, '').trim();
      elementAttr = `${shortName} Thần Thể`;
    } else {
      const selfLocalIdx = (maxThienCung - 1) - idx;
      const anchor = state.palaceAnchors?.[selfLocalIdx] || state.palaceAnchors?.[idx - lampCount] || state.palaceAnchors?.[idx];
      const artObj = anchor ? ((SUPPRESSING_ARTIFACTS || []).find(a => a.id === anchor.id) || anchor) : null;
      artifactId = anchor?.id || null;
      tier = anchor?.tier || artObj?.tier || 'than_pham';
      
      if (anchor) {
        const aId = anchor.id || artObj?.id;
        const aName = anchor.name || artObj?.name || '';
        const pName = anchor.palaceName || '';
        if (aId === 'luan_hoi_ban' || aName.includes('Luân Hồi') || pName.includes('Luân Hồi')) {
          palaceName = 'Lục Đạo Luân Hồi Cung';
        } else if (aId && typeof getPalaceNameForArtifact === 'function') {
          palaceName = getPalaceNameForArtifact(artObj || anchor) || anchor.palaceName || `${artObj?.shortName || artObj?.name} Cung`;
        } else {
          palaceName = anchor.palaceName || `${artObj?.shortName || artObj?.name || 'Bảo Vật'} Cung`;
        }
      } else {
        palaceName = `Thiên Cung Tự Thân #${selfLocalIdx >= 0 ? selfLocalIdx + 1 : idx + 1}`;
      }
      daoAnhTitle = formatDaoAnhTitle(palaceName);
      elementAttr = anchor ? `${anchor.shortName || anchor.name} Thần Thể` : 'Thiên Địa Thần Thể';
    }

    return {
      id: `da_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      palaceIndex: idx,
      palaceName: palaceName,
      name: daoAnhTitle,
      element: elementAttr,
      fromLamp: isLampPalace,
      lampId,
      artifactId,
      tier,
      currentKiep: 0, // Khởi tạo ở 0 Kiếp (Giả Anh sơ khai)
      currentExp: 0, // Linh Lực / Tu Vi tích lũy
      maxExp: KIEP_EXP_REQUIREMENTS[0] || 5000,
      currentThienMenh: 0, // Tương thích ngược
      maxThienMenh: KIEP_EXP_REQUIREMENTS[0] || 5000,
    };
  };

  if (palaceIndex !== undefined && palaceIndex !== null) {
    const existing = state.daoAnhs.find(d => d.palaceIndex === palaceIndex);
    if (existing) {
      throw new Error('Thiên Cung này đã chuyển hóa thành Đạo Anh.');
    }
    state.daoAnhs.push(buildDaoAnhObj(palaceIndex));
  } else {
    // Khai sinh ĐỒNG LOẠT toàn bộ Đạo Anh cho tất cả Thiên Cung Thật
    state.daoAnhs = [];
    for (let i = 0; i < totalRealized; i++) {
      state.daoAnhs.push(buildDaoAnhObj(i));
    }
  }

  // Khi mới ngưng tụ Đạo Anh (chưa độ Kiếp nào), luôn là cảnh giới Giả Anh
  const hasPassedKiep1 = state.daoAnhs.some(d => (d.currentKiep || 0) >= 1);
  state.realm = hasPassedKiep1 ? 'nguyen_anh' : 'gia_anh';
  state.isThienMenhUnlocked = true;
  state.daoAnhExp = 0;
  state.currentThienCungExp = 0;

  // Tự động chuyển đổi toàn bộ Tiên Tinh thành Thiên Mệnh (1 Tiên Tinh = 2 Thiên Mệnh)
  convertToThienMenhIfInAnhRealm(state);

  state.logs.unshift({
    text: `👑 KHAI SINH ĐẠO ANH THÀNH CÔNG! Đồng loạt ${state.daoAnhs.length} Tôn Đạo Anh Thần Thể giáng thế tương ứng ${totalRealized} Thiên Cung Thật! Chính thức bước vào cảnh giới Giả Anh.`,
    time: Date.now(),
  });

  saveCultivationState(state);
  return state;
}

/**
 * Nạp Linh Lực (Tu Vi / EXP) vào Đạo Anh
 */
export function injectExpToDaoAnh(daoAnhId, amount = 1000) {
  if (typeof daoAnhId === 'number') {
    return injectExpToThaiNghen(daoAnhId, amount);
  }
  const state = getCultivationState();
  const da = (state.daoAnhs || []).find(d => d.id === daoAnhId || d.palaceIndex === daoAnhId);
  if (!da) throw new Error('Không tìm thấy Đạo Anh.');
  if (da.currentKiep >= 5) throw new Error('Đạo Anh đã đạt Kiếp 5 Đại Viên Mãn.');

  if (!da.maxExp) da.maxExp = KIEP_EXP_REQUIREMENTS[da.currentKiep || 0] || 5000;
  const curExp = da.currentExp !== undefined ? da.currentExp : (da.currentThienMenh || 0);
  const needed = da.maxExp - curExp;
  if (needed <= 0) throw new Error('Đạo Anh này đã nạp đầy 100% Linh Lực!');

  const availableExp = state.totalExp || 0;
  if (availableExp <= 0 && !state.isKimDanTrialV2) {
    throw new Error('Chưa có đủ Tu Vi linh lực! Hãy đọc thêm chương sách để tích lũy.');
  }

  const actualInject = state.isKimDanTrialV2 ? Math.min(amount, needed) : Math.min(amount, Math.min(needed, availableExp));
  if (!state.isKimDanTrialV2) {
    state.totalExp -= actualInject;
  }

  da.currentExp = curExp + actualInject;
  da.currentThienMenh = da.currentExp; // Đồng bộ tương thích ngược

  state.logs.unshift({
    text: `Đã nạp +${actualInject.toLocaleString()} Tu Vi linh lực vào ${da.name} (${da.currentExp}/${da.maxExp}).`,
    time: Date.now(),
  });

  saveCultivationState(state);
  return state;
}

// Alias tương thích ngược
export const injectThienMenhToDaoAnh = injectExpToDaoAnh;

/**
 * Độ Kiếp cho 1 Đạo Anh
 */
export function attemptTribulationSingle(daoAnhId) {
  const state = getCultivationState();
  const da = (state.daoAnhs || []).find(d => d.id === daoAnhId);
  if (!da) throw new Error('Không tìm thấy Đạo Anh.');
  if (da.currentKiep >= 5) throw new Error('Đạo Anh này đã đạt Kiếp 5 Đại Viên Mãn.');

  if (!da.maxExp) da.maxExp = KIEP_EXP_REQUIREMENTS[da.currentKiep || 0] || 5000;
  const curExp = da.currentExp !== undefined ? da.currentExp : (da.currentThienMenh || 0);

  const targetKiep = (da.currentKiep || 0) + 1;
  const tribulationName = TRIBULATION_NAMES[targetKiep] || `Thiên Kiếp ${targetKiep}`;

  const percent = Math.floor((curExp / da.maxExp) * 100);
  if (percent < 80) {
    throw new Error(`Đạo Anh mới đạt ${percent}% Linh Lực. Cần tối thiểu 80% Linh Lực để nghênh tiếp ${tribulationName}.`);
  }

  // Tỉ lệ thành công: 80% Linh Lực = 80% thành công, 100% Linh Lực = 100% thành công
  const successChance = Math.min(100, 80 + (percent - 80));
  const roll = Math.random() * 100;
  const isSuccess = roll <= successChance;

  let message = '';
  let earnedTM = 0;
  if (isSuccess) {
    da.currentKiep += 1;
    da.currentExp = 0;
    da.currentThienMenh = 0;
    da.maxExp = KIEP_EXP_REQUIREMENTS[Math.min(4, da.currentKiep)];
    da.maxThienMenh = da.maxExp;

    // Tính phần thưởng Thiên Mệnh nhận được theo Phẩm Cấp
    earnedTM = calculateDaoAnhTribulationReward(da, da.currentKiep, state);
    state.totalThienMenh = (state.totalThienMenh || 0) + earnedTM;

    const tierInfo = LAMP_TIERS[getDaoAnhTierKey(da, state)] || LAMP_TIERS.than_pham;
    message = `⚡ ĐỘ KIẾP THÀNH CÔNG! ${formatDaoAnhTitle(da.name)} [${tierInfo.name}] đã vượt qua [${tribulationName}], thăng hoa lên Kiếp thứ ${da.currentKiep} (+1 Anh chiến lực) và thu hoạch +${earnedTM.toLocaleString()} Thiên Mệnh!`;
    state.logs.unshift({ text: message, time: Date.now() });

    if (state.daoAnhs.some(d => d.currentKiep >= 1)) {
      state.realm = 'nguyen_anh';
    }
  } else {
    if (da.fromLamp) {
      da.currentExp = Math.round(da.maxExp * 0.5);
      da.currentThienMenh = da.currentExp;
      message = `⚡ ĐỘ KIẾP THẤT BẠI! Nhờ có Chân Hỏa Mệnh Đăng bảo vệ, ${da.name} không bị thương hại nặng, chỉ lui về 50% Linh Lực!`;
    } else {
      da.currentExp = 0;
      da.currentThienMenh = 0;
      message = `⚡ ĐỘ KIẾP THẤT BẠI! Thiên lôi đánh tan linh lực, ${da.name} bị tiêu hao toàn bộ Linh Lực tích lũy!`;
    }
    state.logs.unshift({ text: message, time: Date.now() });
  }

  saveCultivationState(state);
  return { state, isSuccess, successChance, tribulationName, daoAnhName: da.name, element: da.element, earnedTM, message };
}

/**
 * Vạn Kiếp Tề Phi / Vạn Kiếp Tề Thăng: Toàn bộ Đạo Anh cùng vượt kiếp
 */
export function attemptTribulationAll() {
  const state = getCultivationState();
  if (!state.daoAnhs || state.daoAnhs.length === 0) {
    throw new Error('Chưa có Đạo Anh nào.');
  }

  const activeDaoAnhs = state.daoAnhs.filter(da => (da.currentKiep || 0) < 5);
  if (activeDaoAnhs.length === 0) {
    throw new Error('Toàn bộ Đạo Anh đã đạt Kiếp 5 Đại Viên Mãn!');
  }

  // 1. KIỂM TRA ĐIỀU KIỆN CÙNG CẤP BẬC (CÙNG SỐ KIẾP)
  const firstKiep = activeDaoAnhs[0].currentKiep || 0;
  const isSameKiep = activeDaoAnhs.every(da => (da.currentKiep || 0) === firstKiep);
  if (!isSameKiep) {
    throw new Error('Vạn Kiếp Tề Thăng yêu cầu TOÀN BỘ Đạo Anh phải CÙNG CẤP BẬC KIẾP (Ví dụ: Tất cả cùng ở 0 Kiếp, hoặc tất cả cùng ở 1 Kiếp). Hãy độ kiếp lẻ cho các Đạo Anh cấp thấp để đồng bộ số kiếp trước!');
  }

  // 2. KIỂM TRA TẤT CẢ ĐẠO ANH ĐÃ ĐẠT ĐỦ LINH LỰC TỐI THIỂU 80% CHƯA
  const notReady = activeDaoAnhs.filter(da => {
    if (!da.maxExp) da.maxExp = KIEP_EXP_REQUIREMENTS[da.currentKiep || 0] || 5000;
    const curExp = da.currentExp !== undefined ? da.currentExp : (da.currentThienMenh || 0);
    const percent = Math.floor((curExp / da.maxExp) * 100);
    return percent < 80;
  });

  if (notReady.length > 0) {
    const notReadyNames = notReady.map(d => formatDaoAnhTitle(d.name)).slice(0, 3).join(', ');
    throw new Error(`Chưa thể Vạn Kiếp Tề Thăng! Còn ${notReady.length} Đạo Anh chưa đạt tối thiểu 80% Linh Lực (${notReadyNames}...). Hãy nạp thêm Linh Lực!`);
  }

  // 3. TÍNH TỈ LỆ THÀNH CÔNG TỪNG ĐẠO ANH (80% Linh Lực = 80% tỉ lệ thành công)
  const rollResults = activeDaoAnhs.map(da => {
    const curExp = da.currentExp !== undefined ? da.currentExp : (da.currentThienMenh || 0);
    const percent = Math.floor((curExp / da.maxExp) * 100);
    const successChance = Math.min(100, 80 + (percent - 80));
    const passed = Math.random() * 100 <= successChance;
    return { da, percent, successChance, passed };
  });

  const allPassed = rollResults.every(r => r.passed);

  let resultMsg = '';
  let totalEarnedTM = 0;
  if (allPassed) {
    let baseTotalTM = 0;
    activeDaoAnhs.forEach(da => {
      da.currentKiep = (da.currentKiep || 0) + 1;
      da.currentExp = 0;
      da.currentThienMenh = 0;
      da.maxExp = KIEP_EXP_REQUIREMENTS[Math.min(4, da.currentKiep)];
      da.maxThienMenh = da.maxExp;
      baseTotalTM += calculateDaoAnhTribulationReward(da, da.currentKiep, state);
    });

    if (state.daoAnhs.some(d => (d.currentKiep || 0) >= 1)) {
      state.realm = 'nguyen_anh';
    }

    // ÁP DỤNG +50% BONUS CỘNG HƯỞNG ĐẠI TRẬN
    const bonusTM = Math.round(baseTotalTM * 0.5);
    totalEarnedTM = baseTotalTM + bonusTM;
    state.totalThienMenh = (state.totalThienMenh || 0) + totalEarnedTM;

    resultMsg = `⚡ VẠN KIẾP TỀ THĂNG ĐẠI THÀNH CÔNG! Đồng loạt ${activeDaoAnhs.length} Đạo Anh thăng hoa lên Kiếp thứ ${firstKiep + 1}! Kích hoạt cộng hưởng nhận +${totalEarnedTM.toLocaleString()} Thiên Mệnh (Gồm +${bonusTM.toLocaleString()} TM Bonus +50%)!`;
    state.logs.unshift({ text: resultMsg, time: Date.now() });
  } else {
    // Thất bại
    activeDaoAnhs.forEach(da => {
      if (da.fromLamp) {
        da.currentExp = Math.round(da.maxExp * 0.5);
        da.currentThienMenh = da.currentExp;
      } else {
        da.currentExp = 0;
        da.currentThienMenh = 0;
      }
    });

    const failedNames = rollResults.filter(r => !r.passed).map(r => formatDaoAnhTitle(r.da.name)).join(', ');
    resultMsg = `⚡ VẠN KIẾP TỀ THĂNG THẤT BẠI! Do [${failedNames}] bị thiên lôi đánh lui, toàn bộ ${activeDaoAnhs.length} Đạo Anh đều không thể lên kiếp!`;
    state.logs.unshift({ text: resultMsg, time: Date.now() });
  }

  saveCultivationState(state);
  return {
    state,
    isSuccess: allPassed,
    totalCount: activeDaoAnhs.length,
    totalEarnedTM,
    message: resultMsg,
  };
}

/**
 * NẠP ĐẦY TẤT CẢ LINH LỰC (100%) CHO TOÀN BỘ ĐẠO ANH
 */
export function fillAllDaoAnhExp() {
  const state = getCultivationState();
  if (!state.daoAnhs || state.daoAnhs.length === 0) {
    throw new Error('Chưa có Đạo Anh nào để nạp Linh Lực.');
  }

  let filledCount = 0;
  state.daoAnhs.forEach(da => {
    if (da.currentKiep < 5) {
      da.maxExp = KIEP_EXP_REQUIREMENTS[da.currentKiep || 0] || 5000;
      da.currentExp = da.maxExp;
      da.currentThienMenh = da.maxExp;
      filledCount++;
    }
  });

  const msg = `⚡ ĐẠI TRẬN BỒI DƯỠNG! Đã nạp đầy 100% Linh Lực cho ${filledCount} Đạo Anh! Sẵn sàng nghênh tiếp Lôi Kiếp!`;
  state.logs.unshift({ text: msg, time: Date.now() });

  saveCultivationState(state);
  return { state, filledCount, message: msg };
}

// Alias tương thích ngược
export const fillAllDaoAnhThienMenh = fillAllDaoAnhExp;

/**
 * Format tên cảnh giới hiển thị súc tích:
 * - Ngưng Khí X Tầng
 * - Trúc Cơ X Hỏa
 * - Kim Đan X Cung
 * - Nguyên Anh X Kiếp (lấy số kiếp cao nhất của Đạo Anh đã độ qua)
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
    const lampCount = (state.absorbedLamps || []).length;
    const selfRealized = state.realizedThienCung || 0;
    const totalRealCung = lampCount + selfRealized;
    return `Kim Đan ${totalRealCung || 1} Cung`;
  }

  if (state.realm === 'gia_anh' || state.realm === 'nguyen_anh') {
    const daoAnhs = state.daoAnhs || [];
    const maxKiep = daoAnhs.length > 0 ? Math.max(...daoAnhs.map(da => da.currentKiep || 0)) : 0;
    if (maxKiep === 0) {
      return 'Giả Anh';
    }
    return `Nguyên Anh ${maxKiep} Kiếp`;
  }

  return 'Phàm Nhân';
}

export function resetCultivationState() {
  const freshState = {
    ...DEFAULT_STATE,
    readChapterIds: {},
    inventoryLamps: [],
    absorbedLamps: [],
    inventoryArtifacts: [],
    palaceAnchors: {},
    daoAnhs: [],
    logs: [
      { text: '💀 Đã tản đi toàn bộ tu vi, tán sạch 72 Mệnh Đăng và Vật Trấn Áp, hóa phàm trùng tu đạo lộ lại từ đầu.', time: Date.now() },
    ],
  };
  saveCultivationState(freshState);
  return freshState;
}
