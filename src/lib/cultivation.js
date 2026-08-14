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
export const THIEN_MENH_PER_EXP = 10;
export const MAX_ABSORBED_LAMPS = 5;

// Đường cong EXP lũy tiến cho 10 tầng Ngưng Khí
export const NGUNG_KHI_THRESHOLDS = [
  0,     // Tầng 1 (1 Hổ)
  80,    // Tầng 2 (2 Hổ)
  200,   // Tầng 3 (3 Hổ)
  380,   // Tầng 4 (4 Hổ)
  620,   // Tầng 5 (1 Tiêu)
  940,   // Tầng 6 (1 Tiêu 1 Hổ)
  1360,  // Tầng 7 (1 Tiêu 2 Hổ)
  1900,  // Tầng 8 (1 Tiêu 3 Hổ)
  2580,  // Tầng 9 (1 Tiêu 4 Hổ)
  3420,  // Tầng 10 (1 Bạt - Đại Viên Mãn)
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

// Chi phí Tu Vi lũy tiến cho 9 Thiên Cung Kim Đan (Khởi điểm Cung 1: 2.000 Tu Vi -> Cung 9: 27.000 Tu Vi)
export const KIM_DAN_PALACE_COSTS = [
  0,
  2000,  // Cung 1
  3000,  // Cung 2
  4500,  // Cung 3
  6500,  // Cung 4
  9000,  // Cung 5
  12000, // Cung 6
  16000, // Cung 7
  21000, // Cung 8
  27000, // Cung 9
];

export function getPalaceCost(palaceNum) {
  const num = Math.min(9, Math.max(1, palaceNum));
  return KIM_DAN_PALACE_COSTS[num] || 2000;
}

export const EXP_PER_THIEN_CUNG = 2000; // Giữ để tương thích ngược
export const EXP_PER_DAO_ANH = 1000; // 1000 EXP để thai nghén hóa sinh 1 Đạo Anh vào Thiên Cung Thật

// Ngưỡng Thiên Mệnh chuẩn cho 5 Kiếp của mỗi Đạo Anh
export const KIEP_THIEN_MENH_REQUIREMENTS = [
  3000,  // Kiếp 1: 3000 TM
  7000,  // Kiếp 2: 7000 TM
  13000, // Kiếp 3: 13000 TM
  22000, // Kiếp 4: 22000 TM
  35000, // Kiếp 5: 35000 TM
];

export const TIEN_TINH_RATIO = 5; // Tỉ lệ quy đổi 1 Tu Vi = 5 Tiên Tinh
export const DANG_DIEM_RATIO = TIEN_TINH_RATIO; // alias tương thích ngược

// 6 Phẩm cấp độ hiếm của Mệnh Đăng kèm giá Tu Vi, Thiên Mệnh (10:1) và Tiên Tinh (1:5)
export const LAMP_TIERS = {
  ha_pham: { id: 'ha_pham', name: 'Hạ Phẩm', color: '#e2e8f0', bg: 'rgba(226, 232, 240, 0.12)', border: 'rgba(226, 232, 240, 0.4)', weight: 0.45, priceExp: 500, priceTM: 50, tienTinh: 2500, dangDiem: 2500 },
  trung_pham: { id: 'trung_pham', name: 'Trung Phẩm', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.4)', weight: 0.28, priceExp: 1200, priceTM: 120, tienTinh: 6000, dangDiem: 6000 },
  thuong_pham: { id: 'thuong_pham', name: 'Thượng Phẩm', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)', border: 'rgba(6, 182, 212, 0.4)', weight: 0.15, priceExp: 2500, priceTM: 250, tienTinh: 12500, dangDiem: 12500 },
  cuc_pham: { id: 'cuc_pham', name: 'Cực Phẩm', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.4)', weight: 0.08, priceExp: 5000, priceTM: 500, tienTinh: 25000, dangDiem: 25000 },
  tien_pham: { id: 'tien_pham', name: 'Tiên Phẩm', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.6)', weight: 0.032, priceExp: 10000, priceTM: 1000, tienTinh: 50000, dangDiem: 50000 },
  than_pham: { id: 'than_pham', name: 'Thần Phẩm', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.18)', border: 'rgba(239, 68, 68, 0.7)', weight: 0.008, priceExp: 25000, priceTM: 2500, tienTinh: 125000, dangDiem: 125000 },
};

// Danh sách 72 Mệnh Đăng Thần Thoại (12 Đèn / Cấp Phẩm)
export const LIFE_LAMPS = [
  // ==================== I. HẠ PHẨM (TRẮNG · 12 ĐĂNG) ====================
  {
    id: 'thanh_du',
    name: 'Thanh Du Mệnh Đăng',
    shortName: 'Thanh Du Đăng',
    tier: 'ha_pham',
    icon: '🕯️',
    color: '#e2e8f0',
    desc: 'Linh du thanh tịnh đúc kết từ linh thảo sơ cấp, thắp sáng đạo cơ sơ khai.',
    poem: 'Thanh du linh hỏa, sơ nhập tiên đồ.',
  },
  {
    id: 'bach_thach',
    name: 'Bạch Thạch Mệnh Đăng',
    shortName: 'Bạch Thạch Đăng',
    tier: 'ha_pham',
    icon: '🪨',
    color: '#e2e8f0',
    desc: 'Đá trắng hấp thu địa khí trăm năm, thạch tâm kiên định, bất động như sơn.',
    poem: 'Bạch thạch ngưng tụ, đạo tâm kiên cường.',
  },
  {
    id: 'han_thiet',
    name: 'Hàn Thiết Mệnh Đăng',
    shortName: 'Hàn Thiết Đăng',
    tier: 'ha_pham',
    icon: '⚔️',
    color: '#e2e8f0',
    desc: 'Đúc từ huyền thiết lạnh giá dưới đáy sâu, ngưng tụ phong mang sắc bén.',
    poem: 'Hàn thiết thấu cốt, phong mang sơ lộ.',
  },
  {
    id: 'tung_moc',
    name: 'Tùng Mộc Mệnh Đăng',
    shortName: 'Tùng Mộc Đăng',
    tier: 'ha_pham',
    icon: '🌲',
    color: '#e2e8f0',
    desc: 'Nhựa tùng bách niên tích tụ sinh khí rừng thiêng, duy trì sinh cơ ổn định.',
    poem: 'Cổ tùng nghênh phong, trường thanh bất biến.',
  },
  {
    id: 'pham_tran',
    name: 'Phàm Trần Mệnh Đăng',
    shortName: 'Phàm Trần Đăng',
    tier: 'ha_pham',
    icon: '🏮',
    color: '#e2e8f0',
    desc: 'Tích tụ từ khói lửa nhân gian và ý chí phàm nhân nghịch thiên cầu đạo.',
    poem: 'Hồng trần vạn dặm, soi sáng đêm đen.',
  },
  {
    id: 'huong_hoa',
    name: 'Hương Hỏa Mệnh Đăng',
    shortName: 'Hương Hỏa Đăng',
    tier: 'ha_pham',
    icon: '🪔',
    color: '#e2e8f0',
    desc: 'Hương hỏa miếu hoang trăm năm vương vấn lòng người thành kính nơi thế tục.',
    poem: 'Khói hương nghi ngút, nguyện lực sơ khai.',
  },
  {
    id: 'hoang_tho',
    name: 'Hoàng Thổ Mệnh Đăng',
    shortName: 'Hoàng Thổ Đăng',
    tier: 'ha_pham',
    icon: '🏜️',
    color: '#e2e8f0',
    desc: 'Đất cằn cỗi hấp thu linh khí nhật nguyệt, tích tụ bồi dưỡng gốc rễ tu vi.',
    poem: 'Đại địa bao la, bồi đắp căn cơ.',
  },
  {
    id: 'tram_huong',
    name: 'Trầm Hương Mệnh Đăng',
    shortName: 'Trầm Hương Đăng',
    tier: 'ha_pham',
    icon: '🪵',
    color: '#e2e8f0',
    desc: 'Khúc gỗ trầm ngàn năm tỏa hương thơm dịu nhẹ, an định thần hồn tránh tẩu hỏa.',
    poem: 'Trầm hương u uất, tĩnh tâm ngưng thần.',
  },
  {
    id: 'thao_moc',
    name: 'Thảo Mộc Mệnh Đăng',
    shortName: 'Thảo Mộc Đăng',
    tier: 'ha_pham',
    icon: '🌿',
    color: '#e2e8f0',
    desc: 'Trăm loại cỏ dại gom chút linh quang đom đóm, kiên trì sinh trưởng giữa đá sỏi.',
    poem: 'Cỏ non bất diệt, gió xuân lại sinh.',
  },
  {
    id: 'xich_dong',
    name: 'Xích Đồng Mệnh Đăng',
    shortName: 'Xích Đồng Đăng',
    tier: 'ha_pham',
    icon: '🪙',
    color: '#e2e8f0',
    desc: 'Đồng đỏ tôi luyện trăm lần trong lò phàm hỏa, tạo lớp giáp đồng sơ cấp.',
    poem: 'Xích đồng bách luyện, tráng kiện thân cốt.',
  },
  {
    id: 'tam_duong',
    name: 'Tam Dương Mệnh Đăng',
    shortName: 'Tam Dương Đăng',
    tier: 'ha_pham',
    icon: '☀️',
    color: '#e2e8f0',
    desc: 'Ba luồng dương khí bình minh sưởi ấm kinh mạch, xua tan hàn khí mùa đông.',
    poem: 'Tam dương khai thái, chiếu rọi kinh mạch.',
  },
  {
    id: 'thanh_tuyen',
    name: 'Thanh Tuyền Mệnh Đăng',
    shortName: 'Thanh Tuyền Đăng',
    tier: 'ha_pham',
    icon: '💧',
    color: '#e2e8f0',
    desc: 'Suối nguồn thanh khiết chốn sơn dã, tưới mát đan điền loại bỏ tạp chất.',
    poem: 'Thanh tuyền róc rách, gột rửa phàm trần.',
  },

  // ==================== II. TRUNG PHẨM (XANH LÁ · 12 ĐĂNG) ====================
  {
    id: 'bich_ba',
    name: 'Bích Ba Mệnh Đăng',
    shortName: 'Bích Ba Đăng',
    tier: 'trung_pham',
    icon: '🌊',
    color: '#10b981',
    desc: 'Làn sóng xanh biếc ngưng tụ từ ngọc thủy ngàn năm, lưu chuyển linh hoạt như nước.',
    poem: 'Bích ba đãng dạng, thủy vận trường lưu.',
  },
  {
    id: 'linh_diep',
    name: 'Linh Diệp Mệnh Đăng',
    shortName: 'Linh Diệp Đăng',
    tier: 'trung_pham',
    icon: '🍃',
    color: '#10b981',
    desc: 'Lá bích ngọc của linh thụ ngàn năm, trợ giúp phục hồi kinh mạch và pháp khiếu.',
    poem: 'Linh diệp phiêu dao, sinh cơ dạt dào.',
  },
  {
    id: 'huyen_quy',
    name: 'Huyền Quy Mệnh Đăng',
    shortName: 'Huyền Quy Đăng',
    tier: 'trung_pham',
    icon: '🐢',
    color: '#10b981',
    desc: 'Mai rùa cổ thụ ngàn năm hóa hình, ngự phòng kiên cố, thọ dữ thiên tề.',
    poem: 'Huyền quy trấn hải, vững như bàn thạch.',
  },
  {
    id: 'thuy_truc',
    name: 'Thúy Trúc Mệnh Đăng',
    shortName: 'Thúy Trúc Đăng',
    tier: 'trung_pham',
    icon: '🎋',
    color: '#10b981',
    desc: 'Đốt trúc xanh biếc thấu thiên thanh, dẻo dai kiên cường trước cuồng phong bão táp.',
    poem: 'Thúy trúc nghênh phong, ngạo nghễ sương tuyết.',
  },
  {
    id: 'thanh_loi',
    name: 'Thanh Lôi Mệnh Đăng',
    shortName: 'Thanh Lôi Đăng',
    tier: 'trung_pham',
    icon: '⚡',
    color: '#10b981',
    desc: 'Mộc lôi xanh biếc ngưng kết từ cây sét đánh, chứa uy lực chấn nhiếp tà khí sơ cấp.',
    poem: 'Thanh lôi rền vang, tà ma thoái tán.',
  },
  {
    id: 'ngoc_dung',
    name: 'Ngọc Dung Mệnh Đăng',
    shortName: 'Ngọc Dung Đăng',
    tier: 'trung_pham',
    icon: '💎',
    color: '#10b981',
    desc: 'Ngọc tủy tan chảy trong linh tuyền ngàn năm, thanh lọc cơ thể tỏa ánh ngọc bích.',
    poem: 'Ngọc tủy hóa dịch, thân như lưu ly.',
  },
  {
    id: 'phi_phong',
    name: 'Phi Phong Mệnh Đăng',
    shortName: 'Phi Phong Đăng',
    tier: 'trung_pham',
    icon: '🌪️',
    color: '#10b981',
    desc: 'Cơn gió lốc luồn lách qua ngàn khe núi, gia tăng sự nhanh nhẹn khi xuất chiêu.',
    poem: 'Gió cuốn mây trôi, thân hình thoăn thoắt.',
  },
  {
    id: 'da_xoa',
    name: 'Dạ Xoa Mệnh Đăng',
    shortName: 'Dạ Xoa Đăng',
    tier: 'trung_pham',
    icon: '👹',
    color: '#10b981',
    desc: 'Dạ xoa canh giữ rừng sâu nước độc, hấp thu chướng khí hóa thành hộ giáp.',
    poem: 'Dạ xoa trấn trạch, bách quỷ lui xa.',
  },
  {
    id: 'phuc_ho',
    name: 'Phục Hổ Mệnh Đăng',
    shortName: 'Phục Hổ Đăng',
    tier: 'trung_pham',
    icon: '🐅',
    color: '#10b981',
    desc: 'Khí phách mãnh hổ tung hoành sơn lâm, chấn áp thú dữ bộc phát nội lực.',
    poem: 'Mãnh hổ hạ sơn, tiếng gầm vang dội.',
  },
  {
    id: 'linh_xoa',
    name: 'Linh Xà Mệnh Đăng',
    shortName: 'Linh Xà Đăng',
    tier: 'trung_pham',
    icon: '🐍',
    color: '#10b981',
    desc: 'Linh xà nghìn năm lột xác trốn trong đầm sâu, linh hoạt né tránh thế công hiểm ác.',
    poem: 'Xà vũ cửu khúc, biến hóa khôn lường.',
  },
  {
    id: 'thanh_lien',
    name: 'Thanh Liên Mệnh Đăng',
    shortName: 'Thanh Liên Đăng',
    tier: 'trung_pham',
    icon: '🪷',
    color: '#10b981',
    desc: 'Sen xanh mọc giữa đầm lầy u tịch mà không nhiễm bùn nhơ, giữ tâm trong sạch.',
    poem: 'Thanh liên xuất thủy, bất nhiễm trần ai.',
  },
  {
    id: 'tran_hai',
    name: 'Trấn Hải Mệnh Đăng',
    shortName: 'Trấn Hải Đăng',
    tier: 'trung_pham',
    icon: '⚓',
    color: '#10b981',
    desc: 'Neo sắt ngàn cân trấn áp thủy triều cuồng phong nơi cửa biển, giữ đạo tâm bình thản.',
    poem: 'Trấn áp sóng cuộn, biển cả phẳng lặng.',
  },

  // ==================== III. THƯỢNG PHẨM (XANH LAM · 12 ĐĂNG) ====================
  {
    id: 'minh_linh_huyet_si_trai',
    name: 'Minh Linh Huyết Sí Đăng (Tả)',
    shortName: 'Huyết Sí (Tả)',
    tier: 'thuong_pham',
    icon: '🪽',
    color: '#06b6d4',
    desc: 'Huyết sí minh linh bên trái, tốc độ tuyệt thế, sáp nhập thiên địa phong lôi.',
    poem: 'Tả dực minh linh, huyết phong rít gào.',
  },
  {
    id: 'bang_phach_huyen',
    name: 'Băng Phách Huyền Đăng',
    shortName: 'Băng Phách Đăng',
    tier: 'thuong_pham',
    icon: '❄️',
    color: '#06b6d4',
    desc: 'Băng phách vạn năm nơi bắc cực hàn uyên, đóng băng pháp lực địch nhân trong sát na.',
    poem: 'Hàn băng vạn cổ, phong tỏa lục hợp.',
  },
  {
    id: 'thuong_hai_da_quang',
    name: 'Thương Hải Dạ Quang Đăng',
    shortName: 'Dạ Quang Đăng',
    tier: 'thuong_pham',
    icon: '🌕',
    color: '#06b6d4',
    desc: 'Minh châu tuyệt mỹ dưới đáy biển sâu, chiếu sáng u minh vực thẳm ngàn trượng.',
    poem: 'Thương hải nguyệt minh, châu hữu lệ.',
  },
  {
    id: 'thien_lan_than',
    name: 'Thiên Lân Thần Đăng',
    shortName: 'Thiên Lân Đăng',
    tier: 'thuong_pham',
    icon: '🐉',
    color: '#06b6d4',
    desc: 'Vảy rồng thanh long cửu thiên ngưng tụ, tạo lớp phòng hộ giáp lân long uy.',
    poem: 'Long lân hiển thánh, hộ thể vô song.',
  },
  {
    id: 'lac_ha_than',
    name: 'Lạc Hà Mệnh Đăng',
    shortName: 'Lạc Hà Đăng',
    tier: 'thuong_pham',
    icon: '🌅',
    color: '#06b6d4',
    desc: 'Ánh chiều tà cửu trùng nhuộm đỏ mây ngàn, dung hợp âm dương nhị khí lúc hoàng hôn.',
    poem: 'Lạc hà dữ cô vụ tề phi.',
  },
  {
    id: 'hanh_van',
    name: 'Hành Vân Mệnh Đăng',
    shortName: 'Hành Vân Đăng',
    tier: 'thuong_pham',
    icon: '☁️',
    color: '#06b6d4',
    desc: 'Lượn lờ cùng mây gió ngàn dặm, phiêu diêu tự tại thoát ly gông cùm thế gian.',
    poem: 'Mây trôi ngàn dặm, tiêu dao tự tại.',
  },
  {
    id: 'tinh_ha',
    name: 'Tinh Hà Mệnh Đăng',
    shortName: 'Tinh Hà Đăng',
    tier: 'thuong_pham',
    icon: '🌌',
    color: '#06b6d4',
    desc: 'Mượn ánh sáng của muôn vàn tinh tú dệt nên sông ngân sáng rực trên vòm trời.',
    poem: 'Tinh hà lấp lánh, ngưng tụ linh quang.',
  },
  {
    id: 'cuu_u_han',
    name: 'Cửu U Hàn Đăng',
    shortName: 'Cửu U Đăng',
    tier: 'thuong_pham',
    icon: '🧊',
    color: '#06b6d4',
    desc: 'Băng hàn cực độ từ đáy tầng thứ chín lòng đất, đóng băng cả thần niệm đối thủ.',
    poem: 'Cửu u hàn khí, tịch diệt sinh cơ.',
  },
  {
    id: 'khong_tuoc',
    name: 'Khổng Tước Thần Đăng',
    shortName: 'Khổng Tước Đăng',
    tier: 'thuong_pham',
    icon: '🦚',
    color: '#06b6d4',
    desc: 'Lông khổng tước ngũ sắc chớp lóa, vô hiệu hóa các đòn công ngũ hành sơ cấp.',
    poem: 'Ngũ sắc thần quang, quét sạch ngũ hành.',
  },
  {
    id: 'tram_long',
    name: 'Trảm Long Mệnh Đăng',
    shortName: 'Trảm Long Đăng',
    tier: 'thuong_pham',
    icon: '🗡️',
    color: '#06b6d4',
    desc: 'Thanh kiếm chém rồng nhuốm máu chân long, chứa khí phách sát phạt dũng mãnh.',
    poem: 'Kiếm xuất trảm long, thiên địa biến sắc.',
  },
  {
    id: 'duong_kiem',
    name: 'Dưỡng Kiếm Mệnh Đăng',
    shortName: 'Dưỡng Kiếm Đăng',
    tier: 'thuong_pham',
    icon: '⚔️',
    color: '#06b6d4',
    desc: 'Đan điền nuôi dưỡng kiếm ý trăm năm, mỗi lần xuất vỏ là một lần chấn động.',
    poem: 'Bách niên dưỡng kiếm, nhất kiếm định càn khôn.',
  },
  {
    id: 'dien_quang',
    name: 'Điện Quang Mệnh Đăng',
    shortName: 'Điện Quang Đăng',
    tier: 'thuong_pham',
    icon: '⚡',
    color: '#06b6d4',
    desc: 'Tia chớp nhanh như chớp mắt, xuyên thủng mọi phòng ngự trong gang tấc.',
    poem: 'Điện quang lóe sáng, phá toang màn đêm.',
  },

  // ==================== IV. CỰC PHẨM (TÍM · 12 ĐĂNG) ====================
  {
    id: 'hac_tan',
    name: 'Hắc Tản Mệnh Đăng',
    shortName: 'Hắc Tản Đăng',
    tier: 'cuc_pham',
    icon: '☂️',
    color: '#a855f7',
    desc: 'Bảo tán hắc ám bao bọc cửu u tử khí, hộ thể bất diệt, thôn phệ ma sát quy tắc.',
    poem: 'Hắc tản che trời, tử khí triền miên.',
  },
  {
    id: 'minh_linh_huyet_si_phai',
    name: 'Minh Linh Huyết Sí Đăng (Hữu)',
    shortName: 'Huyết Sí (Hữu)',
    tier: 'cuc_pham',
    icon: '🪽',
    color: '#a855f7',
    desc: 'Huyết sí minh linh bên phải, sát phạt vô song, chém đứt hư không quy tắc.',
    poem: 'Hữu dực minh linh, sát kiếm trảm không.',
  },
  {
    id: 'tu_nguyet_thien',
    name: 'Tử Nguyệt Thiên Đăng',
    shortName: 'Tử Nguyệt Đăng',
    tier: 'cuc_pham',
    icon: '🌙',
    color: '#a855f7',
    desc: 'Vầng trăng tím ngút ngàn trên cửu thiên, soi rọi thần thức, diễn hóa vạn biến.',
    poem: 'Tử nguyệt treo cao, thiên địa mênh mang.',
  },
  {
    id: 'u_minh_hon',
    name: 'U Minh Hồn Đăng',
    shortName: 'U Minh Đăng',
    tier: 'cuc_pham',
    icon: '👻',
    color: '#a855f7',
    desc: 'Ngọn đèn dẫn lối vong hồn chốn cửu u hoàng tuyền, nhiếp phục quỷ thần ma chướng.',
    poem: 'Hoàng tuyền lộ thượng, dẫn hồn quy xứ.',
  },
  {
    id: 'cuu_tieu_loi_dinh',
    name: 'Cửu Tiêu Lôi Đình Đăng',
    shortName: 'Lôi Đình Đăng',
    tier: 'cuc_pham',
    icon: '🌩️',
    color: '#a855f7',
    desc: 'Tụ tập tử lôi cuồng bạo tầng thứ 9 cửu thiên, vạn tà quy phục trước thiên kiếp.',
    poem: 'Lôi phạt cửu thiên, tịch diệt vạn tà.',
  },
  {
    id: 'am_duong_nghich',
    name: 'Âm Dương Nghịch Mệnh Đăng',
    shortName: 'Nghịch Mệnh Đăng',
    tier: 'cuc_pham',
    icon: '☯️',
    color: '#a855f7',
    desc: 'Hai luồng hắc bạch xoay chuyển, nghịch chuyển sinh tử trong gang tấc.',
    poem: 'Âm dương điên đảo, càn khôn dịch chuyển.',
  },
  {
    id: 'ma_tam',
    name: 'Ma Tâm Chấn Đăng',
    shortName: 'Ma Tâm Đăng',
    tier: 'cuc_pham',
    icon: '🖤',
    color: '#a855f7',
    desc: 'Đốt cháy ma niệm chốn tâm ma thành nguồn sức mạnh cuồng bạo tôi rèn đạo tâm.',
    poem: 'Tâm ma bất diệt, đạo tâm càng kiên.',
  },
  {
    id: 'thien_sat',
    name: 'Thiên Sát Cô Tinh Đăng',
    shortName: 'Thiên Sát Đăng',
    tier: 'cuc_pham',
    icon: '⭐',
    color: '#a855f7',
    desc: 'Mang theo sát khí độc tôn của sao Thiên Sát, chiến đấu càng lâu uy lực càng tăng.',
    poem: 'Cô tinh độc bộ, thiên hạ vô song.',
  },
  {
    id: 'tu_la_huyet',
    name: 'Tu La Huyết Đăng',
    shortName: 'Tu La Đăng',
    tier: 'cuc_pham',
    icon: '🩸',
    color: '#a855f7',
    desc: 'Lửa máu từ chiến trường tu la bất tận, bùng nổ sát ý áp đảo tinh thần kẻ địch.',
    poem: 'Huyết hải tu la, sát ý ngập trời.',
  },
  {
    id: 'dia_tang',
    name: 'Địa Tạng U Minh Đăng',
    shortName: 'Địa Tạng Đăng',
    tier: 'cuc_pham',
    icon: '🪔',
    color: '#a855f7',
    desc: 'Được hộ niệm bởi đại nguyện Địa Tạng, bảo vệ tâm trí không bị ma đạo xâm chiếm.',
    poem: 'Địa ngục vị không, thệ bất thành Phật.',
  },
  {
    id: 'chan_hon',
    name: 'Trấn Hồn Tỏa Phách Đăng',
    shortName: 'Trấn Hồn Đăng',
    tier: 'cuc_pham',
    icon: '⛓️',
    color: '#a855f7',
    desc: 'Xích sắt vô hình phong tỏa ba hồn bảy vía, ngăn ngừa việc bị kẻ địch đoạt xá.',
    poem: 'Tỏa hồn phong phách, cố thủ bản nguyên.',
  },
  {
    id: 'hoang_co',
    name: 'Hoang Cổ Thánh Đăng',
    shortName: 'Hoang Cổ Đăng',
    tier: 'cuc_pham',
    icon: '🏛️',
    color: '#a855f7',
    desc: 'Cột trụ tàn tích từ thời hoang cổ, tỏa ra khí tức thâm trầm áp chế vạn vật.',
    poem: 'Hoang cổ di tích, vạn thế trường tồn.',
  },

  // ==================== V. TIÊN PHẨM (KIM SẮC · 12 ĐĂNG) ====================
  {
    id: 'that_thai_phuong',
    name: 'Thất Thải Phượng Đăng',
    shortName: 'Phượng Đăng',
    tier: 'tien_pham',
    icon: '🦚',
    color: '#f59e0b',
    desc: 'Lông vũ phượng hoàng bất tử ngưng tụ bảy sắc thần quang, niết bàn dục hỏa trùng sinh.',
    poem: 'Phượng minh cửu thiên, thất thải thần viêm.',
  },
  {
    id: 'bach_son_thanh_hoa',
    name: 'Bạch Sơn Thánh Hỏa Đăng',
    shortName: 'Bạch Sơn Đăng',
    tier: 'tien_pham',
    icon: '🏔️',
    color: '#f59e0b',
    desc: 'Thánh hỏa tinh khiết ngàn năm trên đỉnh Bạch Sơn, thiêu đốt vạn tà, tĩnh tâm ngưng thần.',
    poem: 'Bạch sơn tuyết tịnh, thánh hỏa trường tồn.',
  },
  {
    id: 'nhat_quy_thoi',
    name: 'Nhật Quỹ Thời Đăng',
    shortName: 'Nhật Quỹ Đăng',
    tier: 'tien_pham',
    icon: '⏳',
    color: '#f59e0b',
    desc: 'Đồng hồ mặt trời khắc ghi tuế nguyệt chi đạo, gia tốc tu hành, đảo ngược sát na.',
    poem: 'Nhật quỹ lưu chuyển, tuế nguyệt như thoi.',
  },
  {
    id: 'dai_la_thai_hu',
    name: 'Đại La Thái Hư Đăng',
    shortName: 'Thái Hư Đăng',
    tier: 'tien_pham',
    icon: '🌌',
    color: '#f59e0b',
    desc: 'Thái hư vô cực ngưng tụ tinh hoa đại la thiên giới, dung chứa tinh tú vũ trụ.',
    poem: 'Đại la thái hư, vạn pháp quy nguyên.',
  },
  {
    id: 'bat_hoang_can_khon',
    name: 'Bát Hoang Càn Khôn Đăng',
    shortName: 'Càn Khôn Đăng',
    tier: 'tien_pham',
    icon: '🪐',
    color: '#f59e0b',
    desc: 'Luyện hóa càn khôn bát hoang nhật nguyệt, trấn áp vạn cổ sơn hà xã tắc.',
    poem: 'Bát hoang càn khôn, chưởng trung thế giới.',
  },
  {
    id: 'thai_thuong_dan',
    name: 'Thái Thượng Đan Tâm Đăng',
    shortName: 'Thái Thượng Đăng',
    tier: 'tien_pham',
    icon: '🫀',
    color: '#f59e0b',
    desc: 'Đạo tâm thuần khiết như lò luyện đan bát quái, thiêu rụi mọi si mê dục vọng.',
    poem: 'Thái thượng vong tình, đạo tâm thuần nhất.',
  },
  {
    id: 'tien_vuong_tram',
    name: 'Tiên Vương Trảm Tiên Đăng',
    shortName: 'Trảm Tiên Đăng',
    tier: 'tien_pham',
    icon: '👑',
    color: '#f59e0b',
    desc: 'Mang theo ý chí tiên vương hạ phàm, một kiếm trảm tiên kinh động chư thiên.',
    poem: 'Tiên vương giáng thế, chém đứt trần duyên.',
  },
  {
    id: 'van_co_bat_diet',
    name: 'Vạn Cổ Bất Diệt Đăng',
    shortName: 'Bất Diệt Đăng',
    tier: 'tien_pham',
    icon: '🌟',
    color: '#f59e0b',
    desc: 'Ánh sáng vĩnh hằng chiếu xuyên qua dòng sông thời gian, trường tồn cùng vũ trụ.',
    poem: 'Vạn cổ luân chuyển, ngọn đèn bất diệt.',
  },
  {
    id: 'thien_dia_huyen_hoang',
    name: 'Huyền Hoàng Công Đức Đăng',
    shortName: 'Huyền Hoàng Đăng',
    tier: 'tien_pham',
    icon: '🛡️',
    color: '#f59e0b',
    desc: 'Khí huyền hoàng dày đặc tích tụ công đức vô lượng, vạn pháp không thể xuyên thủng.',
    poem: 'Huyền hoàng chi khí, hộ trì đạo thân.',
  },
  {
    id: 'chu_tuoc_than_viem',
    name: 'Chu Tước Thần Viêm Đăng',
    shortName: 'Chu Tước Đăng',
    tier: 'tien_pham',
    icon: '🦅',
    color: '#f59e0b',
    desc: 'Ngọn lửa nam minh ly hỏa của thần thú Chu Tước, thiêu đốt cả hư không vô tận.',
    poem: 'Chu tước hót vang, thần viêm cháy rực.',
  },
  {
    id: 'thai_at_thuan_duong',
    name: 'Thái Ất Thuần Dương Đăng',
    shortName: 'Thuần Dương Đăng',
    tier: 'tien_pham',
    icon: '☀️',
    color: '#f59e0b',
    desc: 'Khí thuần dương chí cương chí chính của trời đất, tà ma nhìn thấy đều tan biến.',
    poem: 'Thuần dương vô cực, tà ma tiêu tán.',
  },
  {
    id: 'thanh_de_truong_sinh',
    name: 'Thanh Đế Trường Sinh Đăng',
    shortName: 'Trường Sinh Đăng',
    tier: 'tien_pham',
    icon: '🍃',
    color: '#f59e0b',
    desc: 'Sinh mệnh lực vô tận do Thanh Đế thượng cổ lưu lại, tự động chữa lành mọi vết thương.',
    poem: 'Thanh đế ban phúc, trường sinh bất tử.',
  },

  // ==================== VI. THẦN PHẨM (ĐỎ THẦN THÁNH · 12 ĐĂNG) ====================
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
  {
    id: 'thon_thien_ma_de',
    name: 'Sáng Thế Bản Nguyên Đăng',
    shortName: 'Sáng Thế Đăng',
    tier: 'than_pham',
    icon: '🌌',
    color: '#ef4444',
    desc: 'Ngọn đèn chứa đựng sức mạnh bản nguyên sáng thế tạo lập vũ trụ vạn vật.',
    poem: 'Sáng thế bản nguyên, diễn hóa vạn linh.',
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
    id: 'thien_dao_trung_phat',
    name: 'Thượng Thương Lôi Kiếp Đăng',
    shortName: 'Thượng Thương Đăng',
    tier: 'than_pham',
    icon: '⚡',
    color: '#ef4444',
    desc: 'Ngưng tụ uy áp của lôi kiếp thượng thương chí cao, trừng phạt kẻ nghịch thiên chấn động tam giới.',
    poem: 'Thượng thương lôi kiếp, thần phạt giáng lâm.',
  },
  {
    id: 'vo_cuc_ma_ton',
    name: 'Vận Mệnh Hư Vô Đăng',
    shortName: 'Hư Vô Đăng',
    tier: 'than_pham',
    icon: '🔮',
    color: '#ef4444',
    desc: 'Chứa đựng sức mạnh hư vô của vận mệnh thái cổ, nhìn thấu hư thực sinh tử của vạn giới.',
    poem: 'Vận mệnh hư vô, chư thiên quy tịch.',
  },
  {
    id: 'khai_thien_tich_dia',
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
    id: 'bat_hu_thoi_khong',
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
];

// =========================================================================
// DANH SÁCH 96 VẬT TRẤN ÁP THIÊN CUNG (BẢO VẬT & CÔNG PHÁP · 6 CẤP PHẨM · 16 MỤC/PHẨM)
// - Gồm đầy đủ: Pháp Khí, Cổ Bảo, Dị Khí, Công Pháp, Kiếm Quyết, Thần Điển, Thể Thuật, Thần Dược, Trận Đồ
// - Dùng để trấn áp Thiên Cung khi đạt ngưỡng 99.99% để đạt 100% Hóa Thực thành Cung Thật
// =========================================================================
export const SUPPRESSING_ARTIFACTS = [
  // ---------- I. HẠ PHẨM (TRẮNG · 16 BẢO VẬT & CÔNG PHÁP) ----------
  { id: 'bang_phach', name: 'Huyền Băng Hàn Phách', shortName: 'Hàn Phách', tier: 'ha_pham', type: 'Bảo Vật Hàn Băng', icon: '❄️', color: '#e2e8f0', desc: 'Khối hàn phách ngưng tụ vạn năm dưới đáy tuyết sơn, trấn áp hỏa khí, giữ tâm linh tĩnh lặng.', poem: 'Hàn phách băng tâm, vạn cổ bất suy.' },
  { id: 'tinh_thiet', name: 'Bách Luyện Tinh Thiết', shortName: 'Tinh Thiết', tier: 'ha_pham', type: 'Pháp Khí Bách Luyện', icon: '⚔️', color: '#e2e8f0', desc: 'Thiết khoáng trải qua trăm lần tôi luyện trong địa hỏa, kiên cố bất khả xâm phạm.', poem: 'Bách luyện thành cương, kiên định như thạch.' },
  { id: 'thanh_phong', name: 'Thanh Phong Linh Khí', shortName: 'Thanh Phong', tier: 'ha_pham', type: 'Thiên Địa Dị Khí', icon: '🌪️', color: '#e2e8f0', desc: 'Một luồng linh phong thuần khiết thu thập trên chín tầng mây, giúp đan điện lưu chuyển thông suốt.', poem: 'Thanh phong nhập điện, linh mạch tự thông.' },
  { id: 'kho_moc', name: 'Khô Mộc Hồi Xuân Quyết', shortName: 'Khô Mộc Quyết', tier: 'ha_pham', type: 'Mộc Hệ Dưỡng Sinh Công', icon: '📜', color: '#e2e8f0', desc: 'Tàn thiên công pháp thượng cổ ghi lại bí quyết niết bàn tái sinh sinh mệnh.', poem: 'Khô mộc phùng xuân, sinh cơ bất tuyệt.' },
  { id: 'dia_hoa', name: 'Địa Hỏa Tinh Thạch', shortName: 'Địa Hỏa Thạch', tier: 'ha_pham', type: 'Địa Mạch Linh Thạch', icon: '🪨', color: '#e2e8f0', desc: 'Hòn đá hấp thu địa hỏa ngàn năm sâu trong lòng đất, tỏa nhiệt lượng ổn định nuôi dưỡng Kim Đan.', poem: 'Địa hỏa thai nghén, kim đan dục thành.' },
  { id: 'quy_nguyen_quyet', name: 'Quy Nguyên Thổ Nạp Pháp', shortName: 'Quy Nguyên Pháp', tier: 'ha_pham', type: 'Sơ Giai Tâm Pháp', icon: '📜', color: '#e2e8f0', desc: 'Tâm pháp thổ nạp dẫn khí sơ khai, điều hòa chân khí ngũ hành trong đan điện thông thuận.', poem: 'Hô hấp thổ nạp, chân khí quy nguyên.' },
  { id: 'tinh_ngan', name: 'Bạch Ngân Linh Châu', shortName: 'Ngân Linh Châu', tier: 'ha_pham', type: 'Linh Châu Tụ Khí', icon: '⚪', color: '#e2e8f0', desc: 'Viên ngọc ngưng tụ ánh trăng bạc, tụ tập linh khí bốn phương làm giàu đan điện.', poem: 'Ngân quang chiếu diệu, linh khí hội tụ.' },
  { id: 'loi_dinh_quyet', name: 'Dẫn Lôi Thối Thể Quyết', shortName: 'Thối Thể Quyết', tier: 'ha_pham', type: 'Lôi Hệ Thể Thuật', icon: '⚡', color: '#e2e8f0', desc: 'Công pháp mượn lôi đình sơ cấp tôi luyện thể phách và củng cố thành trì thiên cung.', poem: 'Lôi đình rèn cốt, thân thể kiên cường.' },
  { id: 'tuyet_lien', name: 'Hàn Sơn Tuyết Liên', shortName: 'Tuyết Liên', tier: 'ha_pham', type: 'Linh Dược Tẩy Tủy', icon: '🪷', color: '#e2e8f0', desc: 'Bông sen tuyết nở trên đỉnh núi băng giá, thanh lọc tạp chất trong đan cung.', poem: 'Băng sơn tuyết liên, thanh tịnh trần tâm.' },
  { id: 'xich_dong', name: 'Xích Đồng Trận Đồ', shortName: 'Xích Đồng Đồ', tier: 'ha_pham', type: 'Trận Đồ Cố Bản', icon: '🛡️', color: '#e2e8f0', desc: 'Trận đồ bằng đồng đỏ cổ xưa, củng cố nền móng thiên cung sơ khai.', poem: 'Xích đồng lập trận, đạo cơ kiên cố.' },
  { id: 'thanh_tam_kinh', name: 'Thanh Tâm Định Thần Kinh', shortName: 'Thanh Tâm Kinh', tier: 'ha_pham', type: 'Đạo Gia Thanh Tâm Quyết', icon: '📖', color: '#e2e8f0', desc: 'Kinh văn đạo gia giúp tâm thần an định, trừ bỏ tạp niệm ma chướng khi ngưng tụ Kim Đan.', poem: 'Tâm tịnh tắc linh, vạn tà bất nhập.' },
  { id: 'thanh_ngoc', name: 'Thanh Ngọc Bội', shortName: 'Thanh Ngọc Bội', tier: 'ha_pham', type: 'Hộ Thân Ngọc Phù', icon: '📿', color: '#e2e8f0', desc: 'Miếng ngọc xanh thanh khiết hộ vệ tâm mạch không bị tẩu hỏa nhập ma.', poem: 'Thanh ngọc ôn nhuận, hộ trì đạo tâm.' },
  { id: 'hac_thiet_kiem_quyet', name: 'Tật Phong Đoạt Mệnh Kiếm', shortName: 'Tật Phong Kiếm', tier: 'ha_pham', type: 'Nhập Môn Kiếm Pháp', icon: '🗡️', color: '#e2e8f0', desc: 'Bộ kiếm pháp nhanh như gió lốc, gia tăng sát phạt kiếm khí bảo vệ thiên cung.', poem: 'Kiếm xuất như phong, đoạn tuyệt sinh cơ.' },
  { id: 'u_lan', name: 'U Lan Uẩn Khí Thảo', shortName: 'U Lan Thảo', tier: 'ha_pham', type: 'Linh Thảo Ôn Dưỡng', icon: '🌿', color: '#e2e8f0', desc: 'Cỏ linh lan mọc nơi hang tối, liên tục cung cấp linh khí êm dịu.', poem: 'U cốc sinh lan, sinh sinh bất tức.' },
  { id: 'tram_thach', name: 'Trầm Hà Đáy Đá', shortName: 'Trầm Hà Thạch', tier: 'ha_pham', type: 'Thạch Phách Trừ Tà', icon: '🪨', color: '#e2e8f0', desc: 'Đá ngâm đáy sông ngàn năm, áp chế vọng niệm dục vọng.', poem: 'Trầm hà vạn trượng, bất động như sơn.' },
  { id: 'linh_vu', name: 'Thanh Điểu Linh Vũ', shortName: 'Thanh Điểu Vũ', tier: 'ha_pham', type: 'Dị Thú Linh Vũ', icon: '🪶', color: '#e2e8f0', desc: 'Lông vũ của Thanh Điểu thượng cổ, mang lại tốc độ luân chuyển linh lực nhanh chóng.', poem: 'Thanh điểu truyền tin, linh động cửu tiêu.' },

  // ---------- II. TRUNG PHẨM (XANH LÁ · 16 BẢO VẬT & CÔNG PHÁP) ----------
  { id: 'thai_hu', name: 'Thái Hư Kiếm Khí', shortName: 'Thái Hư Kiếm', tier: 'trung_pham', type: 'Linh Kiếm Khí', icon: '🗡️', color: '#10b981', desc: 'Kiếm khí ngưng tụ từ hư vô không gian, sắc bén vô song, chém đứt mọi tạp niệm tà ma.', poem: 'Thái Hư kiếm xuất, vạn tà quy tịch.' },
  { id: 'tu_van', name: 'Tử Vân Tiên Kim', shortName: 'Tử Vân Kim', tier: 'trung_pham', type: 'Tiên Thiên Linh Kim', icon: '🪙', color: '#10b981', desc: 'Khoáng thạch màu tím phát ra ánh hào quang mây lành, là thần vật trấn áp điện các bậc nhất.', poem: 'Tử khí đông lai, tiên kim hộ thể.' },
  { id: 'am_loi', name: 'U Minh Âm Lôi Châu', shortName: 'Âm Lôi Châu', tier: 'trung_pham', type: 'Pháp Bảo Lôi Điện', icon: '🔮', color: '#10b981', desc: 'Viên lôi châu ngưng tụ sấm sét u minh, vừa có tính hủy diệt vừa rèn luyện đan điện thêm kiên cố.', poem: 'Âm lôi chấn động, cửu u khiếp đảm.' },
  { id: 'huyet_chi', name: 'Cửu Diệp Huyết Chi', shortName: 'Huyết Chi', tier: 'trung_pham', type: 'Thần Dược Ngàn Năm', icon: '🍄', color: '#10b981', desc: 'Linh chi 9 lá hấp thu tinh hoa nhật nguyệt, bổ sung khí huyết và sinh mệnh lực vô tận.', poem: 'Cửu diệp sinh hoa, thọ nguyên trường cửu.' },
  { id: 'ngu_hanh', name: 'Ngũ Hành Luân Chuyển Quyết', shortName: 'Ngũ Hành Quyết', tier: 'trung_pham', type: 'Ngũ Hành Công Pháp', icon: '🌀', color: '#10b981', desc: 'Công pháp dung hợp năm luồng linh khí Kim Mộc Thủy Hỏa Thổ, giúp thiên cung cân bằng tuyệt đối.', poem: 'Ngũ hành tương sinh, sinh sinh bất tức.' },
  { id: 'bich_hai', name: 'Bích Hải Triều Tịch Châu', shortName: 'Bích Hải Châu', tier: 'trung_pham', type: 'Thủy Mạch Bảo Châu', icon: '🌊', color: '#10b981', desc: 'Hạt ngọc biển xanh chứa đựng sức mạnh sóng trào bất tận, dưỡng dục đan hải.', poem: 'Bích hải cuộn trào, vạn lưu quy hải.' },
  { id: 'phi_loi_quyet', name: 'Cửu Thiên Bôn Lôi Kiếm Quyết', shortName: 'Bôn Lôi Kiếm', tier: 'trung_pham', type: 'Lôi Hệ Kiếm Pháp', icon: '⚡', color: '#10b981', desc: 'Kiếm pháp sấm sét chín tầng trời, vừa phòng ngự vừa trảm sát địch nhân dám xâm lăng thiên cung.', poem: 'Bôn lôi nhất kiếm, chấn triệt cửu tiêu.' },
  { id: 'chieu_hon', name: 'Chiêu Hồn Nhiếp Phách Linh', shortName: 'Nhiếp Phách Linh', tier: 'trung_pham', type: 'Cổ Linh Trấn Hồn', icon: '🔔', color: '#10b981', desc: 'Chuông đồng cổ phát ra thanh âm nhiếp hồn, ổn định thần phách trong thiên cung.', poem: 'Chuông ngân nhiếp phách, vạn quỷ phục tùng.' },
  { id: 'thiet_cot', name: 'Kim Cương Bất Hoại Thần Công', shortName: 'Kim Cương Thần Công', tier: 'trung_pham', type: 'Phật Môn Thể Pháp', icon: '📜', color: '#10b981', desc: 'Mảnh kinh văn luyện thể biến thiên cung và đạo cơ thành kim cương bất hoại.', poem: 'Kim cương bất hoại, vạn kiếp kim thân.' },
  { id: 'hoa_hoang', name: 'Hỏa Hoàng Huyết Tinh', shortName: 'Hoàng Huyết Tinh', tier: 'trung_pham', type: 'Dị Điểu Tinh Huyết', icon: '🩸', color: '#10b981', desc: 'Giọt huyết tinh của Hỏa Hoàng thượng cổ, thổi bùng đan hỏa nuôi dưỡng Kim Đan.', poem: 'Hoàng huyết bốc cháy, dục hỏa trùng sinh.' },
  { id: 'thien_canh', name: 'Hư Không Thiên Kính', shortName: 'Thiên Kính', tier: 'trung_pham', type: 'Hư Không Dị Bảo', icon: '🪞', color: '#10b981', desc: 'Gương thần phản chiếu không gian, bài trừ mọi ảo cảnh và tâm ma xâm nhập.', poem: 'Minh kính chiếu triệt, tâm ma tiêu tán.' },
  { id: 'da_quang_tam_phap', name: 'Tử Vi Tụ Khí Huyền Điển', shortName: 'Tử Vi Huyền Điển', tier: 'trung_pham', type: 'Tụ Khí Tâm Pháp', icon: '📖', color: '#10b981', desc: 'Tâm pháp mượn sao Tử Vi thu hút linh khí ban đêm liên tục tinh luyện đan khí thuần khiết.', poem: 'Tử vi tinh tú, tụ khí thông thần.' },
  { id: 'tram_moc', name: 'Vạn Niên Trầm Hương Mộc', shortName: 'Vạn Niên Trầm', tier: 'trung_pham', type: 'Cổ Mộc Tụ Hồn', icon: '🪵', color: '#10b981', desc: 'Khối gỗ trầm hương vạn năm tuổi, giữ cho đan điện luôn thanh tịnh trang nghiêm.', poem: 'Vạn niên trầm hương, ngưng thần tĩnh khí.' },
  { id: 'hac_ma_cong', name: 'U Minh Thôn Hồn Công', shortName: 'Thôn Hồn Công', tier: 'trung_pham', type: 'Ma Đạo Bí Điển', icon: '📜', color: '#10b981', desc: 'Công pháp ma đạo chuyển hóa năng lượng tử khí thành linh lực tinh khiết nuôi dưỡng đạo đan.', poem: 'U minh thôn phách, ma diễm trùng thiên.' },
  { id: 'bach_xa', name: 'Bạch Xà Nghịch Lân', shortName: 'Bạch Xà Lân', tier: 'trung_pham', type: 'Xà Tộc Di Vật', icon: '🐍', color: '#10b981', desc: 'Vảy trắng của Linh Xà ngàn năm hóa rồng, mang tính nhu hòa bảo bọc đan căn.', poem: 'Bạch xà hóa long, lân giáp hộ thể.' },
  { id: 'phong_loi_quyet', name: 'Ngự Phong Lăng Vân Bộ', shortName: 'Lăng Vân Bộ', tier: 'trung_pham', type: 'Tuyệt Thế Thân Pháp', icon: '🪽', color: '#10b981', desc: 'Bí thuật thân pháp phi hành lướt mây đạp gió, kích thích đan khí luân chuyển cực nhanh.', poem: 'Ngự phong lăng vân, tiêu dao thiên địa.' },

  // ---------- III. THƯỢNG PHẨM (XANH LAM · 16 BẢO VẬT & CÔNG PHÁP) ----------
  { id: 'tran_ma_dinh', name: 'Bát Hoang Trấn Ma Đỉnh', shortName: 'Trấn Ma Đỉnh', tier: 'thuong_pham', type: 'Cổ Khí Bát Hoang', icon: '🏺', color: '#06b6d4', desc: 'Thần đỉnh cổ xưa dùng để trấn áp ma đầu tám phương, đặt vào thiên cung vững vàng như bàn thạch.', poem: 'Bát hoang thần đỉnh, vạn ma phục tùng.' },
  { id: 'bat_quai_do', name: 'Thái Cực Bát Quái Đồ', shortName: 'Bát Quái Đồ', tier: 'thuong_pham', type: 'Trận Đồ Thượng Cổ', icon: '☯️', color: '#06b6d4', desc: 'Bản đồ bát quái diễn biến âm dương càn khôn, tạo thành trận pháp hộ cung vĩnh cửu.', poem: 'Âm dương nhị khí, hóa sinh càn khôn.' },
  { id: 'huyen_suong_cong', name: 'Cửu U Băng Phách Huyền Công', shortName: 'Băng Phách Công', tier: 'thuong_pham', type: 'Băng Hệ Thần Công', icon: '❄️', color: '#06b6d4', desc: 'Huyền công ngưng kết sương lạnh từ tầng mây thứ chín của thượng giới, đóng băng mọi hiểm họa rủi ro.', poem: 'Cửu u băng phách, tịch diệt chư thiên.' },
  { id: 'nghich_lan', name: 'Thanh Long Nghịch Lân', shortName: 'Nghịch Lân', tier: 'thuong_pham', type: 'Thần Thú Di Vật', icon: '🐉', color: '#06b6d4', desc: 'Vảy ngược bất khả xâm phạm của Thượng Cổ Thanh Long, mang uy áp long tộc vô thượng.', poem: 'Long hữu nghịch lân, xúc chi tất nộ.' },
  { id: 'huyen_hoang', name: 'Huyền Hoàng Địa Khí', shortName: 'Huyền Hoàng Khí', tier: 'thuong_pham', type: 'Đại Địa Bản Nguyên', icon: '🌍', color: '#06b6d4', desc: 'Khí Huyền Hoàng dày nặng ngưng tụ từ lòng đất mẹ, mang sức mạnh nâng đỡ cả thiên cung lầu các.', poem: 'Thiên địa huyền hoàng, vũ trụ hồng hoang.' },
  { id: 'phuong_hoang', name: 'Niết Bàn Tái Sinh Thuật', shortName: 'Tái Sinh Thuật', tier: 'thuong_pham', type: 'Thần Cầm Bí Thuật', icon: '🪶', color: '#06b6d4', desc: 'Bí thuật niết bàn của Phượng Hoàng, giúp thiên cung bất diệt trước mọi thử thách lôi kiếp.', poem: 'Phượng hoàng niết bàn, dục hỏa trùng sinh.' },
  { id: 'tu_la_sat_quyet', name: 'Tu La Thất Sát Kiếm Điển', shortName: 'Thất Sát Kiếm', tier: 'thuong_pham', type: 'Sát Lục Kiếm Điển', icon: '⚔️', color: '#06b6d4', desc: 'Kiếm điển sát khí ngút trời của Tu La Vương, chém giết mọi tà niệm cản trở con đường tu tiên.', poem: 'Tu la sát đạo, máu nhuộm chư thiên.' },
  { id: 'thien_mon', name: 'Cửu Trọng Thiên Môn Khóa', shortName: 'Thiên Môn Khóa', tier: 'thuong_pham', type: 'Cấm Chế Thần Khóa', icon: '🔐', color: '#06b6d4', desc: 'Khóa cấm chế chín tầng trời, phong tỏa đan điện ngăn chặn linh khí rò rỉ.', poem: 'Thiên môn cửu trọng, cấm chế vô song.' },
  { id: 'tram_long_quyet', name: 'Ngự Long Trảm Thiên Quyết', shortName: 'Trảm Thiên Quyết', tier: 'thuong_pham', type: 'Cổ Pháp Ngự Long', icon: '🗡️', color: '#06b6d4', desc: 'Công pháp cổ xưa trảm sát ác long thượng cổ và điều khiển long khí hộ trì đạo thể.', poem: 'Trảm long tru ma, uy chấn càn khôn.' },
  { id: 'thai_am', name: 'Thái Âm Chân Hỏa Tinh', shortName: 'Thái Âm Hỏa', tier: 'thuong_pham', type: 'Thái Âm Dị Hỏa', icon: '🌕', color: '#06b6d4', desc: 'Lửa lạnh sinh ra từ lõi mặt trăng, cân bằng hỏa khí dương cương trong Kim Đan.', poem: 'Thái âm u hỏa, cực hàn sinh linh.' },
  { id: 'nam_hai', name: 'Nam Hải Giao Long Châu', shortName: 'Giao Long Châu', tier: 'thuong_pham', type: 'Long Tộc Trấn Châu', icon: '🔮', color: '#06b6d4', desc: 'Hạt châu ngưng kết từ tinh hoa của Giao Long biển Nam, mang lại nguồn nước sinh mệnh vô tận.', poem: 'Giao long thổ châu, ba đào chấn động.' },
  { id: 'van_kiem', name: 'Vạn Kiếm Quy Tông Bí Điển', shortName: 'Vạn Kiếm Điển', tier: 'thuong_pham', type: 'Kiếm Đạo Tông Sư', icon: '📜', color: '#06b6d4', desc: 'Bí điển kiếm đạo diễn biến vạn kiếm hợp nhất, nâng cao uy lực sát phạt của đan điện.', poem: 'Vạn kiếm quy nhất, kiếm khí tung hoành.' },
  { id: 'dai_dia', name: 'Đại Địa Mạch Động Thạch', shortName: 'Mạch Động Thạch', tier: 'thuong_pham', type: 'Địa Mạch Thần Thạch', icon: '🪨', color: '#06b6d4', desc: 'Hòn đá đập theo nhịp tim của đất trời, tạo nền tảng vững bền cho thiên cung.', poem: 'Địa mạch chấn động, thiên địa đồng tâm.' },
  { id: 'quy_coc', name: 'Quỷ Cốc Âm Dương Diễn Nghĩa', shortName: 'Âm Dương Nghĩa', tier: 'thuong_pham', type: 'Thiên Cơ Thần Thuật', icon: '📜', color: '#06b6d4', desc: 'Bí kíp suy tính biến hóa âm dương của Quỷ Cốc Tử, giúp thiên cung thích ứng mọi hoàn cảnh.', poem: 'Quỷ Cốc thần toán, thông hiểu thiên cơ.' },
  { id: 'bac_dau', name: 'Bắc Đẩu Thất Tinh Trận', shortName: 'Thất Tinh Trận', tier: 'thuong_pham', type: 'Tinh Thần Trận Pháp', icon: '🌌', color: '#06b6d4', desc: 'Trận pháp mượn lực lượng 7 ngôi sao Bắc Đẩu soi sáng thiên cung ban đêm.', poem: 'Bắc đẩu thất tinh, chiếu rọi chư thiên.' },
  { id: 'hoang_kim', name: 'Hoàng Kim Thánh Thú Giáp', shortName: 'Thánh Thú Giáp', tier: 'thuong_pham', type: 'Thánh Thú Khải Giáp', icon: '🛡️', color: '#06b6d4', desc: 'Khải giáp mạ vàng ròng đúc từ da Thánh Thú, bảo hộ cửa cung kiên cố bất hoại.', poem: 'Hoàng kim thánh giáp, vạn tiễn nan thương.' },

  // ---------- IV. CỰC PHẨM (TÍM · 16 BẢO VẬT & CÔNG PHÁP) ----------
  { id: 'thon_thien', name: 'Thôn Thiên Ma Bình', shortName: 'Thôn Thiên Bình', tier: 'cuc_pham', type: 'Thần Ma Cổ Bảo', icon: '⚱️', color: '#a855f7', desc: 'Bình ma thượng cổ có khả năng nuốt chửng trời đất, tinh lọc mọi linh khí hỗn tạp thành thuần khiết.', poem: 'Thôn thiên nạp địa, chuyển hóa càn khôn.' },
  { id: 'chu_tuoc_cung', name: 'Chu Tước Chân Hỏa Cung', shortName: 'Chu Tước Cung', tier: 'cuc_pham', type: 'Thần Binh Nam Phương', icon: '🏹', color: '#a855f7', desc: 'Cung thần đúc từ xương cánh Chu Tước, bắn ra chân hỏa thiêu đốt chư thiên ma chướng.', poem: 'Chu tước đề minh, liệt hỏa trùng thiên.' },
  { id: 'luan_hoi_an', name: 'Lục Đạo Luân Hồi Quyết', shortName: 'Luân Hồi Quyết', tier: 'cuc_pham', type: 'Minh Giới Chí Tôn Công Pháp', icon: '🏛️', color: '#a855f7', desc: 'Công pháp nắm giữ bí mật sáu nẻo luân hồi, giúp tu sĩ bảo hộ linh hồn bất diệt khi ngộ đạo.', poem: 'Lục đạo luân hồi, duy ngã độc tôn.' },
  { id: 'hon_don_tuc', name: 'Hỗn Độn Sinh Tức', shortName: 'Sinh Tức Khí', tier: 'cuc_pham', type: 'Hỗn Độn Khí Tức', icon: '🌌', color: '#a855f7', desc: 'Hơi thở sinh mệnh còn sót lại từ thời hỗn độn, giúp thiên cung không ngừng tự mở rộng quy mô.', poem: 'Hỗn độn sơ khai, sinh tức vô cùng.' },
  { id: 'nghich_cot', name: 'Chân Long Hóa Hình Bí Điển', shortName: 'Long Hóa Điển', tier: 'cuc_pham', type: 'Chí Tôn Thần Long Biến', icon: '🦴', color: '#a855f7', desc: 'Bí điển hóa long thượng cổ, biến kết cấu thiên cung thành thần thánh bất hoại.', poem: 'Long cốt trấn cung, vạn kiếp kim thân.' },
  { id: 'cuu_u', name: 'Cửu U Minh Vương Trượng', shortName: 'Minh Vương Trượng', tier: 'cuc_pham', type: 'Minh Giới Chí Tôn', icon: '🪄', color: '#a855f7', desc: 'Cây trượng của Cửu U Minh Vương cai quản cửu tuyền, áp chế vạn quỷ.', poem: 'Minh vương xuất thế, cửu u phục tùng.' },
  { id: 'thai_duong_cong', name: 'Đại Nhật Bất Diệt Thần Công', shortName: 'Đại Nhật Thần Công', tier: 'cuc_pham', type: 'Thái Dương Chí Tôn Công', icon: '☀️', color: '#a855f7', desc: 'Thần công ngưng tụ tinh hoa mặt trời, đốt cháy mọi chướng ngại trên con đường tu tiên.', poem: 'Thái dương chân hỏa, chiếu sáng càn khôn.' },
  { id: 'bat_diet_the', name: 'Bất Diệt Kim Thân Quyết', shortName: 'Kim Thân Quyết', tier: 'cuc_pham', type: 'Thần Thể Thần Công', icon: '📜', color: '#a855f7', desc: 'Bí kíp rèn luyện thân thể bất hoại trước lôi kiếp tam tai cửu nạn.', poem: 'Bất diệt kim thân, ngạo thị thiên lôi.' },
  { id: 'hu_khong_thap', name: 'Hư Không Toái Liệt Tháp', shortName: 'Toái Liệt Tháp', tier: 'cuc_pham', type: 'Không Gian Thần Bảo', icon: '🗼', color: '#a855f7', desc: 'Tòa tháp có khả năng xé rách không gian, giúp thiên cung liên thông với các chiều không gian cao cấp.', poem: 'Hư không toái liệt, xuyên toa vạn giới.' },
  { id: 'bach_ho_sat', name: 'Bạch Hổ Đoạt Mệnh Thần Thông', shortName: 'Đoạt Mệnh Thần Thông', tier: 'cuc_pham', type: 'Tứ Tượng Thần Thông', icon: '🐾', color: '#a855f7', desc: 'Thần thông sát phạt của Bạch Hổ Tây Phương chấn nhiếp quần hùng.', poem: 'Bạch hổ sát phạt, vạn linh kinh hồn.' },
  { id: 'thien_kiem', name: 'Thiên Ý Tru Tiên Kiếm Trận', shortName: 'Tru Tiên Kiếm Trận', tier: 'cuc_pham', type: 'Tuyệt Thế Kiếm Trận', icon: '⚔️', color: '#a855f7', desc: 'Bản đồ kiếm trận mượn thiên ý hành phạt, tuyệt diệt sinh cơ kẻ thù.', poem: 'Thiên ý như đao, tru sát tiên thần.' },
  { id: 'huyen_vu_giap', name: 'Huyền Vũ Bất Hoại Giáp', shortName: 'Huyền Vũ Giáp', tier: 'cuc_pham', type: 'Tứ Tượng Thần Giáp', icon: '🛡️', color: '#a855f7', desc: 'Mai rùa của Huyền Vũ Bắc Phương, phòng ngự tuyệt đối bất khả phá vỡ.', poem: 'Huyền vũ trấn bắc, phòng ngự vô địch.' },
  { id: 'cuc_lac_tam_kinh', name: 'Vạn Phật Triều Tông Tâm Kinh', shortName: 'Vạn Phật Tâm Kinh', tier: 'cuc_pham', type: 'Phật Môn Thần Điển', icon: '🪷', color: '#a855f7', desc: 'Kinh văn tối cao của cõi Phật, xoa dịu tâm trí và tẩy sạch mọi tội nghiệt nghiệp chướng.', poem: 'Phật quang phổ chiếu, vạn vật siêu sinh.' },
  { id: 'thoi_khong_phi', name: 'Thời Không Liệt Phùng Sa', shortName: 'Thời Không Sa', tier: 'cuc_pham', type: 'Tuế Nguyệt Thần Sa', icon: '⏳', color: '#a855f7', desc: 'Hạt cát nhặt được từ khe nứt thời gian, làm chậm tốc độ lão hóa của đạo cơ.', poem: 'Tuế nguyệt như sa, thời không vô tận.' },
  { id: 'van_yeu_quyet', name: 'Vạn Yêu Triều Bái Thiên Thư', shortName: 'Vạn Yêu Thiên Thư', tier: 'cuc_pham', type: 'Yêu Giới Thần Quyết', icon: '🪭', color: '#a855f7', desc: 'Thiên thư của Yêu Hoàng thượng cổ, tu luyện để triệu hoán vạn yêu bảo vệ cung điện.', poem: 'Vạn yêu triều bái, yêu uy cái thế.' },
  { id: 'than_ma_an', name: 'Thần Ma Hỗn Hợp Khí', shortName: 'Hỗn Hợp Khí', tier: 'cuc_pham', type: 'Thần Ma Bản Nguyên', icon: '🌪️', color: '#a855f7', desc: 'Khí bản nguyên dung hợp giữa Thần và Ma, giúp tu sĩ tu luyện cả chính đạo lẫn ma đạo.', poem: 'Thần ma đồng thể, vô địch thiên hạ.' },

  // ---------- V. TIÊN PHẨM (VÀNG KIM · 16 BẢO VẬT & CÔNG PHÁP) ----------
  { id: 'tru_tien_tieu', name: 'Tru Tiên Kiếm Tiêu', shortName: 'Tru Tiên Tiêu', tier: 'tien_pham', type: 'Thượng Tiên Thần Binh', icon: '⚔️', color: '#f59e0b', desc: 'Vỏ kiếm của thanh kiếm Tru Tiên sát phạt đệ nhất tam giới, tỏa sát khí trấn áp vạn tiên.', poem: 'Tru Tiên kiếm xuất, quỷ khốc thần sầu.' },
  { id: 'khai_thien_do', name: 'Bàn Cổ Khai Thiên Đồ', shortName: 'Khai Thiên Đồ', tier: 'tien_pham', type: 'Đại Đạo Tiên Đồ', icon: '📜', color: '#f59e0b', desc: 'Bức họa khắc họa cảnh tượng Bàn Cổ vung rìu chém mở thiên địa, ẩn chứa đại đạo chí cao.', poem: 'Khai thiên tích địa, định lập càn khôn.' },
  { id: 'kim_dan_lo', name: 'Tử Phủ Cửu Chuyển Đan Kinh', shortName: 'Cửu Chuyển Đan Kinh', tier: 'tien_pham', type: 'Thái Thượng Thần Điển', icon: '🪔', color: '#f59e0b', desc: 'Bí điển luyện đan thượng phẩm của Thái Thượng Lão Quân, không ngừng tôi luyện viên Kim Đan đạt cực cảnh.', poem: 'Tử phủ đan kinh, cửu chuyển thành tiên.' },
  { id: 'tien_hon_chau', name: 'Bất Diệt Tiên Hồn Châu', shortName: 'Tiên Hồn Châu', tier: 'tien_pham', type: 'Bất Diệt Tiên Bảo', icon: '💎', color: '#f59e0b', desc: 'Bảo châu nuôi dưỡng chân hồn thần thức, khiến tu vi vĩnh viễn không bị thoái lui hay suy kiệt.', poem: 'Tiên hồn bất diệt, nhật nguyệt đồng huy.' },
  { id: 'than_ma_lenh', name: 'Thái Ất Thần Ma Hiệu Lệnh Thuật', shortName: 'Hiệu Lệnh Thuật', tier: 'tien_pham', type: 'Thái Cổ Thần Thông', icon: '🛡️', color: '#f59e0b', desc: 'Thần thông điều động thần ma chư thiên thượng cổ, trấn giữ cửa cung bất khả xâm phạm.', poem: 'Thần ma hiệu lệnh, mạc cảm bất tòng.' },
  { id: 'bat_tu_duoc', name: 'Bất Tử Tiên Dược Thảo', shortName: 'Bất Tử Thảo', tier: 'tien_pham', type: 'Trường Sinh Tiên Dược', icon: '🌿', color: '#f59e0b', desc: 'Cây cỏ bất tử mọc trên Bồng Lai Tiên Đảo, ban cho người tu tiên thọ nguyên vô tận.', poem: 'Bất tử tiên thảo, trường sinh bất lão.' },
  { id: 'hai_thien', name: 'Khai Thiên Bất Hủ Búa', shortName: 'Khai Thiên Búa', tier: 'tien_pham', type: 'Khai Thiên Di Khí', icon: '🪓', color: '#f59e0b', desc: 'Búa thần mang dư uy chém mở hỗn mang, đập tan mọi nút thắt bình cảnh trong nháy mắt.', poem: 'Thần búa khai thiên, vạn đạo quy nguyên.' },
  { id: 'cung_khong', name: 'Cửu Thiên Cung Khuyết Thần Điển', shortName: 'Cung Khuyết Điển', tier: 'tien_pham', type: 'Thiên Đình Hoàng Cực Kinh', icon: '🏛️', color: '#f59e0b', desc: 'Thần điển cai quản 36 cung 72 điện của Thượng Giới Thiên Đình, mang hoàng uy chí cao.', poem: 'Thiên đình ngọc ấn, chấp chưởng càn khôn.' },
  { id: 'vo_thuong', name: 'Vô Thượng Bồ Đề Tâm Pháp', shortName: 'Bồ Đề Tâm Pháp', tier: 'tien_pham', type: 'Đại Đạo Thánh Công', icon: '🌳', color: '#f59e0b', desc: 'Tâm pháp nơi Đạo Tổ đắc đạo, tỏa bóng mát giác ngộ giúp người tu tiên thấu suốt vạn pháp.', poem: 'Bồ đề bản vô thụ, minh kính diệc phi đài.' },
  { id: 'thai_so', name: 'Thái Sơ Hỗn Độn Kiếm Quyết', shortName: 'Thái Sơ Kiếm Quyết', tier: 'tien_pham', type: 'Tiên Thiên Kiếm Điển', icon: '🗡️', color: '#f59e0b', desc: 'Kiếm quyết sinh ra từ thuở Thái Sơ, chém rách hư không, định hình trật tự vũ trụ.', poem: 'Thái Sơ nhất kiếm, vạn giới quy tông.' },
  { id: 'am_duong_lo', name: 'Âm Dương Lưỡng Nghi Lô', shortName: 'Lưỡng Nghi Lô', tier: 'tien_pham', type: 'Thần Lô Luyện Đạo', icon: '🪔', color: '#f59e0b', desc: 'Lò đúc dung hợp hai khí Âm Dương, luyện hóa Kim Đan thành Cửu Chuyển Thần Đan.', poem: 'Lưỡng nghi diễn hóa, âm dương hợp nhất.' },
  { id: 'nhan_qua_kinh', name: 'Nhân Quả Luân Hồi Kính', shortName: 'Nhân Quả Kính', tier: 'tien_pham', type: 'Thông Triệt Nhân Quả', icon: '🪞', color: '#f59e0b', desc: 'Gương thần soi chiếu tiền kiếp và hậu thế, cắt đứt tơ duyên nhân quả ràng buộc.', poem: 'Nhân quả bất muội, vạn duyên quy nhất.' },
  { id: 'thien_thu', name: 'Vô Tự Thiên Thư', shortName: 'Thiên Thư', tier: 'tien_pham', type: 'Đại Đạo Thần Thư', icon: '📜', color: '#f59e0b', desc: 'Cuốn sách trời không chữ tự động hiện chữ đại đạo tương ứng với căn cơ người tu tiên.', poem: 'Vô tự thiên thư, diễn tận càn khôn.' },
  { id: 'tien_vuong', name: 'Tiên Vương Đăng Tiên Thần Quyết', shortName: 'Đăng Tiên Quyết', tier: 'tien_pham', type: 'Đại La Chí Tôn Công', icon: '⛩️', color: '#f59e0b', desc: 'Thần quyết nơi các vị Tiên Vương phong thần thượng cổ, ban phước lành vô lượng.', poem: 'Đăng tiên trên đài, ngạo nghễ chín tầng mây.' },
  { id: 'chuong_thien', name: 'Chưởng Thiên Hồ Lô', shortName: 'Chưởng Thiên Hồ', tier: 'tien_pham', type: 'Tiên Gia Thần Hồ', icon: '🍶', color: '#f59e0b', desc: 'Hồ lô hút lấy tinh hoa của trời đêm nhỏ ra giọt lục dịch thần kỳ thúc đẩy sinh trưởng.', poem: 'Chưởng thiên nhất hồ, thâu tẫn càn khôn.' },
  { id: 'hoa_sen', name: 'Hỗn Độn Thanh Liên Đạo Quyết', shortName: 'Thanh Liên Đạo Quyết', tier: 'tien_pham', type: 'Hỗn Độn Tiên Công', icon: '🪷', color: '#f59e0b', desc: 'Đạo quyết tu luyện từ đóa Hỗn Độn Thanh Liên nguyên thủy, nở ra đài sen bảo hộ tuyệt đối.', poem: 'Thanh liên xuất thế, bất nhiễm trần ai.' },

  // ---------- VI. THẦN PHẨM (ĐỎ · 16 BẢO VẬT & CÔNG PHÁP TỐI THƯỢNG) ----------
  { id: 'hong_mong_khi', name: 'Hồng Mông Tử Khí', shortName: 'Hồng Mông Khí', tier: 'than_pham', type: 'Đại Đạo Bản Nguyên', icon: '🟣', color: '#ef4444', desc: 'Luồng khí tím nguyên thủy sinh ra trước khi trời đất phân định, là nền tảng để chứng đạo thành Thánh.', poem: 'Hồng mông tử khí, chứng đạo thành thần.' },
  { id: 'van_menh_chau', name: 'Thiên Đạo Vận Mệnh Châu', shortName: 'Vận Mệnh Châu', tier: 'than_pham', type: 'Vũ Trụ Vận Mệnh', icon: '🔮', color: '#ef4444', desc: 'Viên ngọc xoay vần số phận của hàng tỉ tinh cầu vũ trụ, mang lại phúc duyên bất tận cho tu sĩ.', poem: 'Vận mệnh sở quy, vạn kiếp bất diệt.' },
  { id: 'hon_don_so_khai', name: 'Hỗn Độn Sơ Khai Quyết', shortName: 'Sơ Khai Quyết', tier: 'than_pham', type: 'Khai Thiên Chí Tôn Công', icon: '🌌', color: '#ef4444', desc: 'Công pháp bản nguyên đầu tiên của vũ trụ, có thể nuôi dưỡng Kim Đan biến hóa thành Thần Đan vô địch.', poem: 'Sơ khai nhất khí, diễn hóa vạn linh.' },
  { id: 'ngoc_diep', name: 'Tạo Hóa Ngọc Điệp Tàn Phiến', shortName: 'Ngọc Điệp', tier: 'than_pham', type: 'Đạo Tổ Di Vật', icon: '🪞', color: '#ef4444', desc: 'Mảnh vỡ ngọc điệp của Đạo Tổ ghi chép 3000 đại đạo, mở ra con đường tu tiên siêu việt cảnh giới.', poem: 'Tạo hóa ngọc điệp, thông hiểu vạn đạo.' },
  { id: 'bat_hu_dinh', name: 'Vạn Cổ Bất Hủ Đỉnh', shortName: 'Bất Hủ Đỉnh', tier: 'than_pham', type: 'Chí Tôn Thần Khí', icon: '👑', color: '#ef4444', desc: 'Chiếc đỉnh thần tồn tại trường tồn cùng thời gian vũ trụ, vĩnh viễn không bao giờ bị tàn phá hay lay chuyển.', poem: 'Vạn cổ bất hủ, duy ngã trường tồn.' },
  { id: 'thien_dao_an', name: 'Thiên Đạo Sơ Tâm Quyết', shortName: 'Sơ Tâm Quyết', tier: 'than_pham', type: 'Quyền Bính Vũ Trụ Tâm Pháp', icon: '🏛️', color: '#ef4444', desc: 'Tâm pháp tượng trưng cho ý chí nguyên thủy của Thiên Đạo, hiệu lệnh muôn loài vạn vật.', poem: 'Thiên đạo sơ tâm, thống ngự vạn giới.' },
  { id: 'hu_vo_ban_nguyen', name: 'Hư Vô Tịch Diệt Ma Điển', shortName: 'Tịch Diệt Ma Điển', tier: 'than_pham', type: 'Tịch Diệt Thần Công', icon: '🌫️', color: '#ef4444', desc: 'Ma điển hư vô nuốt trọn mọi quy tắc vật lý, đưa tu sĩ chạm đến cảnh giới vô vi tối cao.', poem: 'Hư vô tịch diệt, vạn pháp quy không.' },
  { id: 'khoi_nguyen_moc', name: 'Khởi Nguyên Thế Giới Mộc', shortName: 'Thế Giới Mộc', tier: 'than_pham', type: 'Nâng Đỡ Vạn Giới', icon: '🌳', color: '#ef4444', desc: 'Nhánh cây Thế Giới nâng đỡ hàng ngàn vũ trụ, rễ cây đâm sâu vào bản nguyên thời gian.', poem: 'Thế giới thần mộc, nâng đỡ chư thiên.' },
  { id: 'luan_hoi_ban', name: 'Lục Đạo Luân Hồi Chân Kinh', shortName: 'Luân Hồi Chân Kinh', tier: 'than_pham', type: 'Quy Tắc Sinh Tử Chí Cao Điển', icon: '☯️', color: '#ef4444', desc: 'Chân kinh xoay chuyển bánh xe luân hồi sinh tử của muôn vàn sinh linh trong vũ trụ.', poem: 'Bánh xe luân hồi, sinh tử tuần hoàn.' },
  { id: 'tuc_menh_toa', name: 'Túc Mệnh Thần Tỏa', shortName: 'Túc Mệnh Tỏa', tier: 'than_pham', type: 'Trói Buộc Chư Thiên', icon: '⛓️', color: '#ef4444', desc: 'Sợi xích vàng trói buộc số mệnh của cả thần ma, không kẻ nào có thể thoát khỏi.', poem: 'Túc mệnh thần tỏa, khóa chặt thiên mệnh.' },
  { id: 'thuong_thuong_kiem', name: 'Thượng Thương Phạt Thiên Kiếm Điển', shortName: 'Phạt Thiên Kiếm Điển', tier: 'than_pham', type: 'Nghịch Mệnh Kiếm Quyết', icon: '⚔️', color: '#ef4444', desc: 'Kiếm điển được Thượng Thương tôi luyện từ thiên kiếp, chém đứt mọi ràng buộc số phận.', poem: 'Phạt thiên nhất kiếm, nghịch chuyển càn khôn.' },
  { id: 'dai_la_chuong', name: 'Đại La Thiên Cương Chướng', shortName: 'Thiên Cương Chướng', tier: 'than_pham', type: 'Phòng Ngự Tối Thượng', icon: '🛡️', color: '#ef4444', desc: 'Bức tường khí giới hạn bảo hộ tối cao của cõi Đại La, miễn nhiễm mọi đòn tấn công hủy diệt.', poem: 'Đại La hộ thể, vạn kiếp bất xâm.' },
  { id: 'thoi_khong_chau', name: 'Khởi Nguyên Thời Không Thần Thuật', shortName: 'Thời Không Thần Thuật', tier: 'than_pham', type: 'Chủ Tể Thời Gian Bí Pháp', icon: '⏳', color: '#ef4444', desc: 'Bí pháp chứa đựng dòng sông thời gian từ thuở khai thiên, làm chủ quá khứ và tương lai.', poem: 'Chưởng quản thời không, vĩnh hằng bất diệt.' },
  { id: 'van_co_long_to', name: 'Vạn Cổ Tổ Long Quyết', shortName: 'Tổ Long Quyết', tier: 'than_pham', type: 'Tổ Long Nguyên Thủy Thần Công', icon: '🐉', color: '#ef4444', desc: 'Thần công bất tử của Tổ Long sinh ra từ hỗn mang, mang long uy cái thế áp đảo chư thần.', poem: 'Tổ long xuất thế, vạn long triều bái.' },
  { id: 'sang_the_quang', name: 'Sáng Thế Thần Quang', shortName: 'Sáng Thế Quang', tier: 'than_pham', type: 'Ánh Sáng Khởi Nguyên', icon: '☀️', color: '#ef4444', desc: 'Tia sáng đầu tiên xua tan bóng tối hỗn mang, khai sinh ra toàn bộ thế giới và sự sống.', poem: 'Sáng thế thần quang, chiếu sáng vạn cổ.' },
  { id: 'dai_dao_tieu_dao', name: 'Đại Đạo Tiêu Dao Thiên', shortName: 'Tiêu Dao Thiên', tier: 'than_pham', type: 'Chí Cao Đạo Quả Thần Điển', icon: '📜', color: '#ef4444', desc: 'Bản trường thi đại đạo ghi lại cảnh giới tiêu dao tự tại siêu việt mọi định luật vũ trụ.', poem: 'Đại đạo tiêu dao, ngạo thị hồng trần.' },
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

  // Mệnh Đăng, Vật Trấn Áp & Tiên Tinh
  tienTinh: 0, // Tiên Tinh thu được từ việc phân giải/bán Mệnh Đăng hoặc Vật Trấn Áp (1 Tu Vi = 5 Tiên Tinh)
  dangDiem: 0, // Alias tương thích ngược
  inventoryLamps: [], // Danh sách id đèn trong túi
  absorbedLamps: [],  // Danh sách id đèn đã hấp thụ (tối đa 5, không hoàn trả)

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
 * Lấy state tu vi từ LocalStorage
 */
export function getCultivationState() {
  try {
    const raw = localStorage.getItem(CULTIVATION_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    const state = { ...DEFAULT_STATE, ...parsed };
    // Đồng bộ hóa Tiên Tinh & Đăng Điểm
    if (state.tienTinh === undefined) {
      state.tienTinh = state.dangDiem || 0;
    }
    state.dangDiem = state.tienTinh;

    // Tự động khôi phục nếu người dùng bị kẹt ở trạng thái trial cũ trên Safari / iPhone
    if (state.isNguyenAnhTrial) {
      state.isNguyenAnhTrial = false;
      if (state.preTrialBackup) {
        state.realm = state.preTrialBackup.realm || 'truc_co';
        state.maxThienCung = state.preTrialBackup.maxThienCung || 6;
        state.realizedThienCung = state.preTrialBackup.realizedThienCung || 0;
        state.preTrialBackup = null;
      } else if (state.realm === 'nguyen_anh') {
        state.realm = 'truc_co';
      }
    }

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
 * = Mệnh hỏa tự thân (pháp khiếu / 30) + khiếu 121 (nếu có) + số Mệnh Đăng đã hấp thụ
 * Tối đa 10 Hỏa
 */
export function getTotalMenhHoa(state) {
  const selfHoa = state.selfMenhHoa || Math.floor((state.phapKhieu || 0) / 30);
  const secretHoa = state.has121st ? 1 : 0;
  const lampCount = (state.absorbedLamps || []).length;
  return Math.min(10, selfHoa + secretHoa + lampCount);
}

/**
 * Tính tổng chiến lực ở cảnh giới Nguyên Anh (tính bằng Anh)
 * = Tổng số kiếp của toàn bộ Đạo Anh (Tối đa 13 Đạo Anh x 5 Kiếp = 65 Anh)
 */
export function getTotalCombatPowerAnh(state) {
  if (!state.daoAnhs || state.daoAnhs.length === 0) return 0;
  return state.daoAnhs.reduce((sum, da) => sum + (da.currentKiep || 0), 0);
}

/**
 * Trả về chuỗi chiến lực chuẩn xác theo từng cảnh giới:
 * - Ngưng Khí: X Hổ / 1 Tiêu Y Hổ / 1 Bạt
 * - Trúc Cơ: X Hỏa (tối đa 10 Hỏa)
 * - Kim Đan: X Cung (chỉ tính Cung Thật, tối đa 13 Cung)
 * - Nguyên Anh: X Anh (tối đa 65 Anh)
 */
export function getCombatPowerDisplay(state) {
  if (!state) state = getCultivationState();

  if (state.realm === 'ngung_khi') {
    const lvl = state.ngungKhiLevel || 1;
    if (lvl === 10) return '1 Bạt';
    if (lvl >= 5) {
      const remainingHo = lvl - 5;
      return remainingHo > 0 ? `1 Tiêu ${remainingHo} Hổ` : '1 Tiêu';
    }
    return `${lvl} Hổ`;
  }

  if (state.realm === 'truc_co') {
    const totalHoa = getTotalMenhHoa(state);
    return `${totalHoa} Hỏa`;
  }

  if (state.realm === 'kim_dan') {
    const lampCount = (state.absorbedLamps || []).length;
    const selfRealized = state.realizedThienCung !== undefined ? state.realizedThienCung : 0;
    const totalRealizedCung = lampCount + selfRealized;
    return `${totalRealizedCung} Cung`;
  }

  if (state.realm === 'gia_anh' || state.realm === 'nguyen_anh') {
    const totalAnh = getTotalCombatPowerAnh(state);
    return `${totalAnh} Anh`;
  }

  return '0 Hổ';
}

/**
 * Kiểm tra xem cảnh giới hiện tại đã đạt Đại Viên Mãn (cực hạn) chưa:
 * - Ngưng Khí: Tầng 10 và đủ điều kiện Trúc Cơ
 * - Trúc Cơ: 120 pháp khiếu (4 hỏa) và (đã mở 121 / đã khóa 121 / đã tích lũy max EXP xung kích 121)
 * - Kim Đan: 100% Thiên Cung đã hóa thực thành Cung Thật (realizedThienCung >= maxThienCung)
 * - Nguyên Anh: Toàn bộ Đạo Anh đã đạt Kiếp thứ 5
 */
export function isGrandCompletion(state) {
  if (!state) state = getCultivationState();

  if (state.realm === 'ngung_khi') {
    return state.ngungKhiLevel >= 10 && (state.readyBreakthroughTrucCo || state.expCurrentRealm >= NGUNG_KHI_THRESHOLDS[10]);
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
    return state.realizedThienCung >= state.maxThienCung;
  }

  if (state.realm === 'gia_anh' || state.realm === 'nguyen_anh') {
    if (!state.daoAnhs || state.daoAnhs.length === 0) return false;
    return state.daoAnhs.every(da => (da.currentKiep || 0) >= 5);
  }

  return false;
}

/**
 * Ghi nhận tiến độ đọc chương và cộng Tu Vi & Rơi Mệnh Đăng quý hiếm
 * Chỉ được gọi khi người đọc đã ở lại chương ít nhất 60 giây!
 * QUY TẮC ĐẠI VIÊN MÃN: Nếu cảnh giới đã đạt Đại Viên Mãn mà chưa đột phá,
 * toàn bộ Tu Vi thu được sẽ tự động chuyển hóa thành TIÊN TINH!
 */
export function addReadingProgress(novelId, chapterId, wordCount = 2000) {
  const state = getCultivationState();
  const key = `${novelId}_${chapterId}`;

  const isFirstRead = !state.readChapterIds[key];
  // Random mức tăng tu vi từ 50 đến 100 mỗi chu kỳ 60s
  const gainedExp = Math.floor(Math.random() * (MAX_EXP_PER_CYCLE - MIN_EXP_PER_CYCLE + 1)) + MIN_EXP_PER_CYCLE;

  state.readChapterIds[key] = Date.now();
  state.chaptersReadCount = Object.keys(state.readChapterIds).length;

  const isGrand = isGrandCompletion(state);
  let convertedToTienTinh = 0;

  if (isGrand) {
    // ĐẠI VIÊN MÃN: Tu vi không cộng vào cảnh giới nữa mà tự động chuyển hóa thành Tiên Tinh!
    convertedToTienTinh = gainedExp;
    state.tienTinh = (state.tienTinh || 0) + gainedExp;
    state.dangDiem = state.tienTinh;
    state.logs.unshift({
      text: `✨ ĐẠI VIÊN MÃN HÓA TIÊN TINH! Cảnh giới đã đạt cực hạn viên mãn, +${gainedExp} Tu Vi thu được tự động chuyển hóa thành +${gainedExp} Tiên Tinh!`,
      time: Date.now(),
    });
  } else {
    state.totalExp += gainedExp;
  }

  // LỰC THIÊN MỆNH: Chỉ mở khóa và tích lũy khi ở Giả Anh hoặc Nguyên Anh!
  let gainedThienMenh = 0;
  if (state.realm === 'gia_anh' || state.realm === 'nguyen_anh') {
    state.isThienMenhUnlocked = true;
    gainedThienMenh = gainedExp * THIEN_MENH_PER_EXP;
    state.totalThienMenh = (state.totalThienMenh || 0) + gainedThienMenh;
  }

  let droppedLamp = null;
  let droppedArtifact = null;
  let breakthrough = null;

  // ĐẾN CHÍNH THỨC NGUYÊN ANH: Mệnh Đăng và Vật Trấn Áp sẽ KHÔNG RƠI NỮA! (Giả Anh vẫn rơi bình thường)
  const isNguyenAnh = state.realm === 'nguyen_anh';

  // TỈ LỆ RƠI MỆNH ĐĂNG THEO 6 CẤP BẬC HIẾM (~20% mỗi chu kỳ 60s) - Vẫn rơi ở Giả Anh, chỉ ngừng khi lên Nguyên Anh
  if (!isNguyenAnh) {
    const allOwnedLamps = [...(state.inventoryLamps || []), ...(state.absorbedLamps || [])];
    if (allOwnedLamps.length < LIFE_LAMPS.length) {
      const unownedLamps = LIFE_LAMPS.filter(l => !allOwnedLamps.includes(l.id));

      if (unownedLamps.length > 0) {
        const dropRoll = Math.random();
        if (dropRoll < 0.20) {
          const tierRoll = Math.random();
          let selectedTier = 'ha_pham';
          if (tierRoll < 0.45) selectedTier = 'ha_pham';
          else if (tierRoll < 0.73) selectedTier = 'trung_pham';
          else if (tierRoll < 0.88) selectedTier = 'thuong_pham';
          else if (tierRoll < 0.96) selectedTier = 'cuc_pham';
          else if (tierRoll < 0.992) selectedTier = 'tien_pham';
          else selectedTier = 'than_pham';

          let candidateLamps = unownedLamps.filter(l => l.tier === selectedTier);
          if (candidateLamps.length === 0) candidateLamps = unownedLamps;

          const randomIndex = Math.floor(Math.random() * candidateLamps.length);
          droppedLamp = candidateLamps[randomIndex];
          state.inventoryLamps = [...(state.inventoryLamps || []), droppedLamp.id];

          const tierInfo = LAMP_TIERS[droppedLamp.tier] || LAMP_TIERS.ha_pham;
          state.logs.unshift({
            text: `Cơ duyên nghịch thiên! Đạt được [${tierInfo.name}] ${droppedLamp.name} (Đã thêm vào túi trữ vật)!`,
            time: Date.now(),
          });
        }
      }
    }
  }

  // 25% tỉ lệ nhặt được Vật Trấn Áp Thiên Cung - Vẫn rơi ở Giả Anh, chỉ ngừng khi lên Nguyên Anh
  if (!isNguyenAnh) {
    const artifactRoll = Math.random();
    if (artifactRoll < 0.25) {
      const tierRoll = Math.random();
      let selectedTier = 'ha_pham';
      if (tierRoll < 0.45) selectedTier = 'ha_pham';
      else if (tierRoll < 0.73) selectedTier = 'trung_pham';
      else if (tierRoll < 0.88) selectedTier = 'thuong_pham';
      else if (tierRoll < 0.96) selectedTier = 'cuc_pham';
      else if (tierRoll < 0.992) selectedTier = 'tien_pham';
      else selectedTier = 'than_pham';

      const anchoredIds = Object.values(state.palaceAnchors || {}).map(a => a?.id).filter(Boolean);
      const allOwnedArtifacts = [...(state.inventoryArtifacts || []), ...anchoredIds];
      const unownedArtifacts = SUPPRESSING_ARTIFACTS.filter(a => !allOwnedArtifacts.includes(a.id));
      const pool = unownedArtifacts.length > 0 ? unownedArtifacts : SUPPRESSING_ARTIFACTS;

      let candidateArtifacts = pool.filter(a => a.tier === selectedTier);
      if (candidateArtifacts.length === 0) candidateArtifacts = pool;

      if (candidateArtifacts.length > 0) {
        const randomIdx = Math.floor(Math.random() * candidateArtifacts.length);
        droppedArtifact = candidateArtifacts[randomIdx];
        state.inventoryArtifacts = [...(state.inventoryArtifacts || []), droppedArtifact.id];
        const tierInfo = LAMP_TIERS[droppedArtifact.tier] || LAMP_TIERS.ha_pham;
        state.logs.unshift({
          text: `✨ Kỳ duyên xuất hiện! Nhặt được Vật Trấn Áp [${tierInfo.name}] ${droppedArtifact.name} (${droppedArtifact.type}) - Đã cất vào túi trữ vật!`,
          time: Date.now(),
        });
      }
    }
  }

  if (droppedLamp || droppedArtifact) {
    state.unreadDropsCount = (state.unreadDropsCount || 0) + 1;
  }

  // Xử lý tiến độ theo từng cảnh giới với đường cong EXP lũy tiến (Chỉ tăng khi CHƯA ĐẠT ĐẠI VIÊN MÃN)
  if (!isGrand) {
    if (state.realm === 'ngung_khi') {
      state.expCurrentRealm += gainedExp;

      for (let lvl = 10; lvl >= 1; lvl--) {
        if (state.expCurrentRealm >= NGUNG_KHI_THRESHOLDS[lvl - 1]) {
          if (lvl > state.ngungKhiLevel) {
            state.ngungKhiLevel = lvl;
            const cpStr = getCombatPowerDisplay({ ...state, ngungKhiLevel: lvl });
            breakthrough = {
              type: 'layer',
              title: `ĐỘT PHÁ NGƯNG KHÍ TẦNG ${lvl}!`,
              subtitle: `Chiến lực: ${cpStr}`,
              icon: '⚡',
            };
            state.logs.unshift({
              text: `Đột phá thành công! Tiến nhập Ngưng Khí Tầng ${lvl} (Chiến lực: ${cpStr}).`,
              time: Date.now(),
            });
          }
          break;
        }
      }

      if (state.expCurrentRealm >= NGUNG_KHI_THRESHOLDS[10] && !state.readyBreakthroughTrucCo) {
        state.readyBreakthroughTrucCo = true;
        breakthrough = {
          type: 'realm',
          title: 'NGƯNG KHÍ ĐẠI VIÊN MÃN!',
          subtitle: 'Đã sẵn sàng đột phá Trúc Cơ',
          icon: '🔥',
        };
      }
    } else if (state.realm === 'truc_co') {
      state.expCurrentRealm += gainedExp;

      if (state.phapKhieu < 120) {
        const opened = getOpenedPhapKhieuFromExp(state.expCurrentRealm);
        if (opened > state.phapKhieu) {
          state.phapKhieu = opened;
          const newSelfHoa = Math.floor(state.phapKhieu / 30);
          if (newSelfHoa > state.selfMenhHoa) {
            state.selfMenhHoa = newSelfHoa;
            breakthrough = {
              type: 'hoa',
              title: `THẮP SÁNG ${newSelfHoa} HỎA TỰ THÂN!`,
              subtitle: `Pháp khiếu: ${state.phapKhieu}/120 khiếu`,
              icon: '🔥',
            };
            state.logs.unshift({
              text: `Thắp sáng Mệnh Hỏa tự thân thứ ${newSelfHoa}! Pháp khiếu đã khai mở ${state.phapKhieu}/120 khiếu.`,
              time: Date.now(),
            });
          }
        }
      } else if (state.phapKhieu === 120 && !state.has121st && !state.failed121st) {
        state.attemptExp121 = Math.min(EXP_FOR_121_ATTEMPT, (state.attemptExp121 || 0) + gainedExp);
      }
    } else if (state.realm === 'kim_dan') {
      if (state.realizedThienCung < state.maxThienCung) {
        const lampBonusCount = (state.absorbedLamps || []).length;
        const lampPalaceStartIndex = state.maxThienCung - lampBonusCount;
        const isCurrentLampPalace = state.realizedThienCung >= lampPalaceStartIndex;

        if (isCurrentLampPalace) {
          // Cung hình thành từ Mệnh Đăng luôn luôn đạt 100% Hóa Thực tự động (Vật Trấn Áp chính là Mệnh Đăng)
          state.realizedThienCung += 1;
          state.currentThienCungExp = 0;
          breakthrough = {
            type: 'cung',
            title: `HÓA THỰC CHÂN CUNG MỆNH ĐĂNG!`,
            subtitle: `Chiến lực: ${state.realizedThienCung} Cung Thật`,
            icon: '🏮',
          };
          state.logs.unshift({
            text: `Mệnh Đăng Thượng Cổ tỏa hào quang! Đã Hóa Thực thành công Chân Cung thứ ${state.realizedThienCung}/${state.maxThienCung} thành Cung Thật 100% (+1 Cung chiến lực)!`,
            time: Date.now(),
          });
        } else {
          // Cung tự thân: Tích lũy tới 99.99% (targetPalaceExp - 1) và dừng lại chờ Vật Trấn Áp
          const targetPalaceExp = getPalaceCost(state.realizedThienCung + 1);
          const bottleneckExp = targetPalaceExp - 1;
          if (state.currentThienCungExp < bottleneckExp) {
            state.currentThienCungExp = Math.min(bottleneckExp, state.currentThienCungExp + gainedExp);
            if (state.currentThienCungExp >= bottleneckExp) {
              state.logs.unshift({
                text: `⚠️ THIÊN CUNG ${state.realizedThienCung + 1} ĐẠT 99.99%! Đã tích lũy đủ ${bottleneckExp}/${targetPalaceExp} EXP linh lực, cần khảm nạm một Vật Trấn Áp để đạt 100% Hóa Thực thành Cung Thật!`,
                time: Date.now(),
              });
            }
          }
        }
      }
    }
  }

  saveCultivationState(state);
  return { state, gainedExp, gainedThienMenh, convertedToTienTinh, isFirstRead, droppedLamp, droppedArtifact, breakthrough };
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

  const currentAbsorbed = state.absorbedLamps || [];

  if (state.realm === 'truc_co') {
    const selfHoa = state.selfMenhHoa || Math.floor((state.phapKhieu || 0) / 30);
    if (selfHoa < 1) {
      throw new Error('Cần thắp sáng ít nhất 1 Mệnh Hỏa tự thân ở Trúc Cơ mới có thể hấp thụ Mệnh Đăng.');
    }
    if (currentAbsorbed.length >= selfHoa) {
      throw new Error(`Bạn đang có ${selfHoa} Mệnh Hỏa tự thân, chỉ có thể hấp thụ tối đa ${selfHoa} Mệnh Đăng. Hãy mở thêm pháp khiếu để thắp sáng Mệnh Hỏa tiếp theo!`);
    }
  }

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
 * HÀM HỖ TRỢ ĐỐT TU VI / THIÊN MỆNH CHUNG
 */
function applyExpBurn(state, deficitExp) {
  const isNguyenAnhStage = state.realm === 'gia_anh' || state.realm === 'nguyen_anh';

  if (isNguyenAnhStage) {
    const deficitTM = Math.ceil(deficitExp / 10);
    const totalTMStored = (state.totalThienMenh || 0) + (state.daoAnhs || []).reduce((sum, da) => sum + (da.currentThienMenh || 0), 0);
    if (totalTMStored < deficitTM) {
      throw new Error(`Không đủ tài nguyên! Cần thêm ${deficitTM.toLocaleString()} Thiên Mệnh để bù thiếu. (Hiện có: ${totalTMStored.toLocaleString()} TM)`);
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
          if (da.currentThienMenh > 0) {
            const deduct = Math.min(da.currentThienMenh, remainingCostTM);
            da.currentThienMenh -= deduct;
            remainingCostTM -= deduct;
          }
        }
      }
    }
    return { deficitExp, deficitTM };
  } else {
    if (state.totalExp < deficitExp) {
      throw new Error(`Không đủ tài nguyên! Cần thêm ${deficitExp.toLocaleString()} Tu Vi để bù thiếu. (Hiện có: ${state.totalExp.toLocaleString()} Tu Vi)`);
    }

    state.totalExp = Math.max(0, state.totalExp - deficitExp);

    if (state.realm === 'ngung_khi') {
      state.expCurrentRealm = Math.max(0, state.expCurrentRealm - deficitExp);
      let newLevel = 1;
      for (let lvl = 10; lvl >= 1; lvl--) {
        if (state.expCurrentRealm >= NGUNG_KHI_THRESHOLDS[lvl - 1]) {
          newLevel = lvl;
          break;
        }
      }
      state.ngungKhiLevel = newLevel;
      if (state.expCurrentRealm < NGUNG_KHI_THRESHOLDS[10]) {
        state.readyBreakthroughTrucCo = false;
      }
    } else if (state.realm === 'truc_co') {
      state.expCurrentRealm = Math.max(0, state.expCurrentRealm - deficitExp);
      state.phapKhieu = Math.min(120, Math.max(0, Math.floor(state.expCurrentRealm / EXP_PER_PHAP_KHIEU)));
      state.selfMenhHoa = Math.floor(state.phapKhieu / 30);
      // PHÁP KHIẾU 121 BẢO TOÀN
    } else if (state.realm === 'kim_dan') {
      const absorbedLampCount = (state.absorbedLamps || []).length;
      const minRealizedPalaces = 1 + absorbedLampCount;

      let remainingCost = deficitExp;
      if (state.currentThienCungExp >= remainingCost) {
        state.currentThienCungExp -= remainingCost;
        remainingCost = 0;
      } else {
        remainingCost -= state.currentThienCungExp;
        state.currentThienCungExp = 0;

        while (remainingCost > 0 && state.realizedThienCung > minRealizedPalaces) {
          if (remainingCost >= EXP_PER_THIEN_CUNG) {
            state.realizedThienCung -= 1;
            remainingCost -= EXP_PER_THIEN_CUNG;
          } else {
            state.realizedThienCung -= 1;
            state.currentThienCungExp = EXP_PER_THIEN_CUNG - remainingCost;
            remainingCost = 0;
          }
        }
      }
    }
    return { deficitExp, deficitTM: 0 };
  }
}

/**
 * BÁN MỆNH ĐĂNG TRONG TÚI TRỮ VẬT LẤY TIÊN TINH
 * - Chỉ có thể bán Mệnh Đăng nằm trong Túi Trữ Vật (inventoryLamps).
 * - Đèn đã hấp thụ vào Đạo Cơ (absorbedLamps) không thể bán!
 * - Nhận về Tiên Tinh theo phẩm chất đèn (Tỉ lệ 1 Tu Vi = 5 Tiên Tinh).
 */
export function sellLampForTienTinh(lampId) {
  const state = getCultivationState();
  const lamp = LIFE_LAMPS.find(l => l.id === lampId);
  if (!lamp) throw new Error('Mệnh Đăng không tồn tại.');

  if (!(state.inventoryLamps || []).includes(lampId)) {
    throw new Error(`Bạn không có [${lamp.name}] trong Túi Trữ Vật để bán.`);
  }

  const tier = LAMP_TIERS[lamp.tier] || LAMP_TIERS.ha_pham;
  const gainedTienTinh = tier.tienTinh || tier.dangDiem || (tier.priceExp * TIEN_TINH_RATIO);

  // Xóa khỏi túi trữ vật
  state.inventoryLamps = state.inventoryLamps.filter(id => id !== lampId);
  // Cộng Tiên Tinh
  state.tienTinh = (state.tienTinh || 0) + gainedTienTinh;
  state.dangDiem = state.tienTinh;

  state.logs.unshift({
    text: `💰 Đã phân giải bán [${tier.name}] ${lamp.name} thu hồi +${gainedTienTinh.toLocaleString()} Tiên Tinh (Hiện có: ${state.tienTinh.toLocaleString()} TT).`,
    time: Date.now(),
  });

  saveCultivationState(state);
  return {
    state,
    gainedTienTinh,
    gainedDangDiem: gainedTienTinh,
    message: `Đã bán [${tier.name}] ${lamp.name}, nhận +${gainedTienTinh.toLocaleString()} Tiên Tinh!`,
  };
}

export const sellLampForPoints = sellLampForTienTinh;

/**
 * MUA MỆNH ĐĂNG BẰNG TIÊN TINH & ĐỐT TU VI BÙ THIẾU (Nghịch Thiên Hoán Đăng)
 * - Ưu tiên trừ Tiên Tinh trước (1 Tu Vi = 5 Tiên Tinh).
 * - Nếu Tiên Tinh không đủ: Tự động trừ hết Tiên Tinh hiện có và đốt phần Tu Vi (hoặc Thiên Mệnh) còn thiếu!
 */
export function buyLampWithTienTinhAndExp(lampId) {
  const state = getCultivationState();
  const lamp = LIFE_LAMPS.find(l => l.id === lampId);
  if (!lamp) throw new Error('Mệnh Đăng không tồn tại.');

  const allOwned = [...(state.inventoryLamps || []), ...(state.absorbedLamps || [])];
  if (allOwned.includes(lampId)) {
    throw new Error(`Đạo hữu đã sở hữu [${lamp.name}] rồi!`);
  }

  const tier = LAMP_TIERS[lamp.tier] || LAMP_TIERS.ha_pham;
  const totalCostTienTinh = tier.tienTinh || tier.dangDiem || (tier.priceExp * TIEN_TINH_RATIO);
  const userTienTinh = state.tienTinh || state.dangDiem || 0;
  const isNguyenAnhStage = state.realm === 'gia_anh' || state.realm === 'nguyen_anh';

  let usedTienTinh = 0;
  let deficitExp = 0;
  let deficitTM = 0;

  if (userTienTinh >= totalCostTienTinh) {
    // Đủ Tiên Tinh
    usedTienTinh = totalCostTienTinh;
    state.tienTinh = userTienTinh - totalCostTienTinh;
    state.dangDiem = state.tienTinh;
  } else {
    // Không đủ Tiên Tinh: Dùng hết Tiên Tinh hiện có + Đốt tu vi bù
    usedTienTinh = userTienTinh;
    state.tienTinh = 0;
    state.dangDiem = 0;
    const remainingTienTinhDeficit = totalCostTienTinh - userTienTinh;
    deficitExp = Math.ceil(remainingTienTinhDeficit / TIEN_TINH_RATIO);

    const burnRes = applyExpBurn(state, deficitExp);
    deficitTM = burnRes.deficitTM;
  }

  // Thêm Mệnh Đăng vào túi trữ vật
  state.inventoryLamps = [...(state.inventoryLamps || []), lamp.id];

  const payDesc = usedTienTinh > 0 && (deficitExp > 0 || deficitTM > 0)
    ? `${usedTienTinh.toLocaleString()} TT + Đốt ${isNguyenAnhStage ? `${deficitTM.toLocaleString()} TM` : `${deficitExp.toLocaleString()} Tu Vi`}`
    : usedTienTinh > 0
    ? `${usedTienTinh.toLocaleString()} Tiên Tinh`
    : `Đốt ${isNguyenAnhStage ? `${deficitTM.toLocaleString()} TM` : `${deficitExp.toLocaleString()} Tu Vi`}`;

  state.logs.unshift({
    text: `✨ Nghịch Mệnh Hoán Đăng: Dùng ${payDesc} ngưng tụ thành công [${tier.name}] ${lamp.name} vào Túi Trữ Vật!`,
    time: Date.now(),
  });

  saveCultivationState(state);
  return {
    state,
    lamp,
    message: `Đã đổi thành công [${tier.name}] ${lamp.name} (Tiêu hao: ${payDesc})!`,
  };
}

export const buyLampWithPointsAndExp = buyLampWithTienTinhAndExp;
export const burnExpForLamp = buyLampWithTienTinhAndExp;

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

  // Trừ vật phẩm khỏi túi trữ vật
  invArtifacts.splice(artIndex, 1);
  state.inventoryArtifacts = invArtifacts;

  // Khảm nạm vào Thiên Cung
  if (!state.palaceAnchors) state.palaceAnchors = {};
  state.palaceAnchors[palaceIndex] = {
    id: artObj.id,
    name: artObj.name,
    shortName: artObj.shortName || artObj.name,
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
    text: `👑 TRẤN CUNG THÀNH CÔNG! Đã dùng [${tierInfo.name}] ${artObj.name} (${artObj.type}) trấn áp Thiên Cung ${palaceIndex + 1}, hoàn tất Hóa Thực thành Cung Thật 100% (+1 Cung chiến lực)!`,
    time: Date.now(),
  });

  saveCultivationState(state);
  return {
    state,
    artifact: artObj,
    message: `👑 Trấn Cung Thành Công! Đã dùng [${artObj.name}] hoàn tất 100% Cung Thật thứ ${state.realizedThienCung}!`,
  };
}

/**
 * BÁN VẬT TRẤN ÁP TRONG TÚI TRỮ VẬT LẤY TIÊN TINH
 */
export function sellArtifactForTienTinh(artifactId) {
  const state = getCultivationState();
  const art = SUPPRESSING_ARTIFACTS.find(a => a.id === artifactId);
  if (!art) throw new Error('Vật Trấn Áp không tồn tại.');

  const inv = state.inventoryArtifacts || [];
  const idx = inv.indexOf(artifactId);
  if (idx === -1) {
    throw new Error(`Bạn không có [${art.name}] trong Túi Trữ Vật để bán.`);
  }

  const tier = LAMP_TIERS[art.tier] || LAMP_TIERS.ha_pham;
  const gainedTienTinh = tier.tienTinh || tier.dangDiem || (tier.priceExp * TIEN_TINH_RATIO);

  inv.splice(idx, 1);
  state.inventoryArtifacts = inv;
  state.tienTinh = (state.tienTinh || 0) + gainedTienTinh;
  state.dangDiem = state.tienTinh;

  state.logs.unshift({
    text: `💰 Đã phân giải bán Vật Trấn Áp [${tier.name}] ${art.name} thu hồi +${gainedTienTinh.toLocaleString()} Tiên Tinh (Hiện có: ${state.tienTinh.toLocaleString()} TT).`,
    time: Date.now(),
  });

  saveCultivationState(state);
  return {
    state,
    gainedTienTinh,
    gainedDangDiem: gainedTienTinh,
    message: `Đã bán [${tier.name}] ${art.name}, nhận +${gainedTienTinh.toLocaleString()} Tiên Tinh!`,
  };
}

export const sellArtifactForPoints = sellArtifactForTienTinh;

/**
 * MUA VẬT TRẤN ÁP BẰNG TIÊN TINH & ĐỐT TU VI BÙ THIẾU
 */
export function buyArtifactWithTienTinhAndExp(artifactId) {
  const state = getCultivationState();
  const art = SUPPRESSING_ARTIFACTS.find(a => a.id === artifactId);
  if (!art) throw new Error('Vật Trấn Áp không tồn tại.');

  const tier = LAMP_TIERS[art.tier] || LAMP_TIERS.ha_pham;
  const priceTienTinh = tier.tienTinh || tier.dangDiem || (tier.priceExp * TIEN_TINH_RATIO);
  const userTienTinh = state.tienTinh || state.dangDiem || 0;

  if (userTienTinh >= priceTienTinh) {
    state.tienTinh = userTienTinh - priceTienTinh;
    state.dangDiem = state.tienTinh;
    state.inventoryArtifacts = [...(state.inventoryArtifacts || []), artifactId];
    state.logs.unshift({
      text: `✨ Đã dùng ${priceTienTinh.toLocaleString()} Tiên Tinh mua [${tier.name}] ${art.name} (Đã thêm vào túi trữ vật)!`,
      time: Date.now(),
    });
    saveCultivationState(state);
    return {
      state,
      usedPoints: priceTienTinh,
      burnedExp: 0,
      message: `✨ Đổi thành công [${tier.name}] ${art.name} bằng ${priceTienTinh.toLocaleString()} Tiên Tinh!`,
    };
  }

  // Tiên Tinh không đủ -> Dùng hết Tiên Tinh + Đốt phần Tu Vi còn thiếu
  const remainingPoints = priceTienTinh - userTienTinh;
  const neededExp = Math.ceil(remainingPoints / TIEN_TINH_RATIO);

  state.tienTinh = 0;
  state.dangDiem = 0;
  applyExpBurn(state, neededExp);

  state.inventoryArtifacts = [...(state.inventoryArtifacts || []), artifactId];
  state.logs.unshift({
    text: `🔥 NGHỊCH THIÊN HOÁN BẢO! Dùng toàn bộ ${userTienTinh.toLocaleString()} Tiên Tinh + Đốt ${neededExp.toLocaleString()} Tu Vi mua [${tier.name}] ${art.name}!`,
    time: Date.now(),
  });

  saveCultivationState(state);
  return {
    state,
    usedPoints: userTienTinh,
    burnedExp: neededExp,
    message: `🔥 Đổi thành công [${tier.name}] ${art.name} (Dùng ${userTienTinh.toLocaleString()} TT + Đốt ${neededExp.toLocaleString()} Tu Vi)!`,
  };
}

export const buyArtifactWithPointsAndExp = buyArtifactWithTienTinhAndExp;

/**
 * KÍCH HOẠT THẺ TRẢI NGHIỆM CẢNH GIỚI NGƯNG KHÍ
 * - Lưu bản sao toàn bộ trạng thái trước khi trải nghiệm (preTrialBackup).
 * - Tạm thời nâng cảnh giới lên Ngưng Khí Tầng 10 (Đại Viên Mãn - 1 Bạt / 10 Hổ, sẵn sàng Trúc Cơ).
 * - Cung cấp sẵn 1.000 Tiên Tinh để trải nghiệm.
 * - Sau khi dùng và kết thúc, thẻ sẽ tự hủy vĩnh viễn không xuất hiện lại nữa!
 */
export function activateNgungKhiTrial() {
  const state = getCultivationState();
  if (state.hasUsedNgungKhiTrial) {
    throw new Error('Thẻ trải nghiệm Ngưng Khí đã được sử dụng trước đó và đã tiêu biến vĩnh viễn!');
  }

  // Backup trạng thái thực tế của người dùng nếu chưa có backup
  if (!state.preTrialBackup) {
    const preTrialBackup = {
      realm: state.realm,
      totalExp: state.totalExp,
      expCurrentRealm: state.expCurrentRealm,
      ngungKhiLevel: state.ngungKhiLevel,
      readyBreakthroughTrucCo: state.readyBreakthroughTrucCo,
      phapKhieu: state.phapKhieu,
      selfMenhHoa: state.selfMenhHoa,
      has121st: state.has121st,
      failed121st: state.failed121st,
      attemptExp121: state.attemptExp121,
      maxThienCung: state.maxThienCung,
      realizedThienCung: state.realizedThienCung,
      currentThienCungExp: state.currentThienCungExp,
      palaceAnchors: { ...(state.palaceAnchors || {}) },
      isThienMenhUnlocked: state.isThienMenhUnlocked,
      totalThienMenh: state.totalThienMenh,
      daoAnhs: [...(state.daoAnhs || [])],
    };
    state.preTrialBackup = preTrialBackup;
  }

  state.isNgungKhiTrial = true;
  state.isKimDanTrial = false;
  state.isNguyenAnhTrial = false;
  state.realm = 'ngung_khi';
  state.ngungKhiLevel = 10;
  state.expCurrentRealm = NGUNG_KHI_THRESHOLDS[10];
  state.readyBreakthroughTrucCo = true;
  state.tienTinh = Math.max(state.tienTinh || 0, 1000);
  state.dangDiem = state.tienTinh;

  state.logs.unshift({
    text: '📜 ĐÃ SỬ DỤNG [THẺ TRẢI NGHIỆM NGƯNG KHÍ]! Thăng hoa lên Ngưng Khí Tầng 10 (Đại Viên Mãn - 1 Bạt / 10 Hổ, sẵn sàng Trúc Cơ). Thẻ sẽ tiêu biến vĩnh viễn sau khi kết thúc.',
    time: Date.now(),
  });

  saveCultivationState(state);
  return {
    state,
    message: '✨ Đã kích hoạt Thẻ Trải Nghiệm Ngưng Khí thành công! Đạt Ngưng Khí Tầng 10 Đại Viên Mãn (1 Bạt).',
  };
}

/**
 * KẾT THÚC TRẢI NGHIỆM NGƯNG KHÍ (TRỞ VỀ CẢNH GIỚI BAN ĐẦU)
 * - Khôi phục 100% cảnh giới và trạng thái tu vi ban đầu được sao lưu trước đó.
 * - Thẻ trải nghiệm dùng xong sẽ tự động tiêu biến vĩnh viễn không xuất hiện lại nữa!
 */
export function endNgungKhiTrial() {
  const state = getCultivationState();
  if (!state.isNgungKhiTrial && !state.preTrialBackup) {
    throw new Error('Đạo hữu hiện không trong trạng thái trải nghiệm!');
  }

  if (state.preTrialBackup) {
    const backup = state.preTrialBackup;
    state.realm = backup.realm || 'ngung_khi';
    state.totalExp = backup.totalExp || 0;
    state.expCurrentRealm = backup.expCurrentRealm || 0;
    state.ngungKhiLevel = backup.ngungKhiLevel || 1;
    state.readyBreakthroughTrucCo = backup.readyBreakthroughTrucCo || false;
    state.phapKhieu = backup.phapKhieu || 0;
    state.selfMenhHoa = backup.selfMenhHoa || 0;
    state.has121st = backup.has121st || false;
    state.failed121st = backup.failed121st || false;
    state.attemptExp121 = backup.attemptExp121 || 0;
    state.maxThienCung = backup.maxThienCung || 6;
    state.realizedThienCung = backup.realizedThienCung || 0;
    state.currentThienCungExp = backup.currentThienCungExp || 0;
    state.palaceAnchors = backup.palaceAnchors || {};
    state.isThienMenhUnlocked = backup.isThienMenhUnlocked || false;
    state.totalThienMenh = backup.totalThienMenh || 0;
    state.daoAnhs = backup.daoAnhs || [];
  }

  state.isNgungKhiTrial = false;
  state.hasUsedNgungKhiTrial = true; // Tiêu biến vĩnh viễn, không xuất hiện lại nữa!
  state.preTrialBackup = null;

  state.logs.unshift({
    text: '↩️ Đã kết thúc trải nghiệm Ngưng Khí. Thẻ trải nghiệm đã tiêu biến vĩnh viễn, khôi phục 100% cảnh giới và đạo cơ ban đầu.',
    time: Date.now(),
  });

  saveCultivationState(state);
  return {
    state,
    message: '↩️ Đã kết thúc trải nghiệm Ngưng Khí và trở về cảnh giới ban đầu! Thẻ trải nghiệm đã tiêu biến.',
  };
}

/**
 * KÍCH HOẠT THẺ TRẢI NGHIỆM CẢNH GIỚI KIM ĐAN
 * - Lưu bản sao toàn bộ trạng thái trước khi trải nghiệm (preTrialBackup).
 * - Tạm thời nâng cảnh giới lên Kim Đan 4 Cung Thật, 9 Thiên Cung, tiến độ cung thứ 5 đạt 99.99% (799/800 EXP).
 * - Cung cấp sẵn 2 vật phẩm trấn áp và 5.000 Tiên Tinh để trải nghiệm toàn bộ cơ chế Kim Đan & Trấn Cung!
 * - Sau khi dùng và kết thúc, thẻ sẽ tự hủy vĩnh viễn không xuất hiện lại nữa!
 */
export function activateKimDanTrial() {
  const state = getCultivationState();
  if (state.hasUsedKimDanTrial) {
    throw new Error('Thẻ trải nghiệm Kim Đan đã được sử dụng trước đó và đã tiêu biến vĩnh viễn!');
  }

  // Backup trạng thái thực tế của người dùng nếu chưa có backup
  if (!state.preTrialBackup) {
    const preTrialBackup = {
      realm: state.realm === 'kim_dan' ? 'truc_co' : state.realm,
      totalExp: state.totalExp,
      expCurrentRealm: state.expCurrentRealm,
      ngungKhiLevel: state.ngungKhiLevel,
      readyBreakthroughTrucCo: state.readyBreakthroughTrucCo,
      phapKhieu: state.phapKhieu,
      selfMenhHoa: state.selfMenhHoa,
      has121st: state.has121st,
      failed121st: state.failed121st,
      attemptExp121: state.attemptExp121,
      maxThienCung: state.maxThienCung,
      realizedThienCung: state.realizedThienCung,
      currentThienCungExp: state.currentThienCungExp,
      palaceAnchors: { ...(state.palaceAnchors || {}) },
      isThienMenhUnlocked: state.isThienMenhUnlocked,
      totalThienMenh: state.totalThienMenh,
      daoAnhs: [...(state.daoAnhs || [])],
    };
    state.preTrialBackup = preTrialBackup;
  }

  state.isKimDanTrial = true;
  state.isNguyenAnhTrial = false;
  state.realm = 'kim_dan';
  state.maxThienCung = 9;
  state.realizedThienCung = 4;
  state.currentThienCungExp = 799; // Cung 5 ở 99.99% chờ khảm nạm Trấn Cung Vật
  
  if (!state.inventoryArtifacts || state.inventoryArtifacts.length === 0) {
    state.inventoryArtifacts = ['thai_hu', 'bang_phach'];
  }
  state.tienTinh = Math.max(state.tienTinh || 0, 5000);
  state.dangDiem = state.tienTinh;

  state.logs.unshift({
    text: '📜 ĐÃ SỬ DỤNG [THẺ TRẢI NGHIỆM KIM ĐAN]! Thăng hoa lên Kim Đan Cảnh (4 Cung Thật, Cung 5 đạt 99.99% chờ khảm nạm). Thẻ sẽ tiêu biến vĩnh viễn sau khi kết thúc.',
    time: Date.now(),
  });

  saveCultivationState(state);
  return {
    state,
    message: '✨ Đã kích hoạt Thẻ Trải Nghiệm Kim Đan thành công! Bạn có thể trải nghiệm toàn bộ Tòa Thiên Lâu Kim Đan và Trấn Cung Bảo Vật.',
  };
}

export const activateNguyenAnhTrial = activateKimDanTrial;

/**
 * KẾT THÚC TRẢI NGHIỆM KIM ĐAN (TRỞ VỀ CẢNH GIỚI BAN ĐẦU)
 * - Khôi phục 100% cảnh giới và trạng thái tu vi ban đầu được sao lưu trước đó.
 * - Thẻ trải nghiệm dùng xong sẽ tự động tiêu biến vĩnh viễn không xuất hiện lại nữa!
 */
export function endKimDanTrial() {
  const state = getCultivationState();
  if (!state.isKimDanTrial && !state.preTrialBackup) {
    throw new Error('Đạo hữu hiện không trong trạng thái trải nghiệm!');
  }

  if (state.preTrialBackup) {
    const backup = state.preTrialBackup;
    state.realm = backup.realm || 'truc_co';
    state.totalExp = backup.totalExp || 0;
    state.expCurrentRealm = backup.expCurrentRealm || 0;
    state.ngungKhiLevel = backup.ngungKhiLevel || 1;
    state.readyBreakthroughTrucCo = backup.readyBreakthroughTrucCo || false;
    state.phapKhieu = backup.phapKhieu || 0;
    state.selfMenhHoa = backup.selfMenhHoa || 0;
    state.has121st = backup.has121st || false;
    state.failed121st = backup.failed121st || false;
    state.attemptExp121 = backup.attemptExp121 || 0;
    state.maxThienCung = backup.maxThienCung || 6;
    state.realizedThienCung = backup.realizedThienCung || 0;
    state.currentThienCungExp = backup.currentThienCungExp || 0;
    state.palaceAnchors = backup.palaceAnchors || {};
    state.isThienMenhUnlocked = backup.isThienMenhUnlocked || false;
    state.totalThienMenh = backup.totalThienMenh || 0;
    state.daoAnhs = backup.daoAnhs || [];
  } else {
    state.realm = 'truc_co';
    state.maxThienCung = 6;
    state.realizedThienCung = 0;
    state.currentThienCungExp = 0;
  }

  state.isKimDanTrial = false;
  state.isNguyenAnhTrial = false;
  state.hasUsedKimDanTrial = true; // Tiêu biến vĩnh viễn, không xuất hiện lại nữa!
  state.preTrialBackup = null;

  state.logs.unshift({
    text: '↩️ Đã kết thúc trải nghiệm Kim Đan. Thẻ trải nghiệm đã tiêu biến vĩnh viễn, khôi phục 100% cảnh giới và đạo cơ ban đầu.',
    time: Date.now(),
  });

  saveCultivationState(state);
  return {
    state,
    message: '↩️ Đã kết thúc trải nghiệm Kim Đan và trở về cảnh giới ban đầu! Thẻ trải nghiệm đã tiêu biến.',
  };
}

export const endNguyenAnhTrial = endKimDanTrial;

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
 * Chuyển hóa 1 Thiên Cung đã Hóa Thực thành Đạo Anh
 */
export function manifestDaoAnh(palaceIndex) {
  const state = getCultivationState();
  if (state.realm !== 'kim_dan' && state.realm !== 'gia_anh' && state.realm !== 'nguyen_anh') {
    throw new Error('Cảnh giới chưa đủ để ngưng tụ Đạo Anh.');
  }

  // Điều kiện 1: Toàn bộ Thiên Cung phải được Hóa Thực thành Cung Thật 100%
  if (state.realizedThienCung < state.maxThienCung) {
    throw new Error(`Chưa đủ điều kiện! Cần Hóa Thực toàn bộ ${state.maxThienCung}/${state.maxThienCung} Thiên Cung thành Cung Thật trước khi bắt đầu Hóa Đạo Anh.`);
  }

  if (!state.daoAnhs) state.daoAnhs = [];
  const existing = state.daoAnhs.find(d => d.palaceIndex === palaceIndex);
  if (existing) {
    throw new Error('Thiên Cung này đã chuyển hóa thành Đạo Anh.');
  }

  // Điều kiện 2: Thiên Cung Thật phải tích lũy đủ Linh Lực (1000 Tu Vi) để thai nghén Đạo Anh
  if ((state.totalExp || 0) < EXP_PER_DAO_ANH) {
    throw new Error(`Linh lực chưa đủ để thai nghén Đạo Anh! Cần tích lũy tối thiểu ${EXP_PER_DAO_ANH.toLocaleString()} Tu Vi (Hiện có: ${(state.totalExp || 0).toLocaleString()} Tu Vi).`);
  }

  // Tiêu hao Linh Lực để thai nghén Đạo Anh
  state.totalExp -= EXP_PER_DAO_ANH;

  const absorbed = state.absorbedLamps || [];
  const lampCount = absorbed.length;
  const isLampPalace = palaceIndex < lampCount;

  let lampObj = null;
  let elementAttr = 'Ngũ Hành Thần Thể';
  let daoAnhTitle = '';

  if (isLampPalace) {
    const lampId = absorbed[palaceIndex];
    lampObj = LIFE_LAMPS.find(l => l.id === lampId);
    const shortName = lampObj ? (lampObj.shortName || lampObj.name.replace('Đăng', '')) : `Mệnh Đăng ${palaceIndex + 1}`;
    daoAnhTitle = `Đạo Anh [${shortName}]`;
    elementAttr = lampObj ? `${shortName} Thần Thể` : 'Chân Đăng Thần Thể';
  } else {
    const selfNum = palaceIndex - lampCount + 1;
    const elements = [
      'Kim Nguyên Thần Thể',
      'Mộc Nguyên Thần Thể',
      'Thủy Nguyên Thần Thể',
      'Hỏa Nguyên Thần Thể',
      'Thổ Nguyên Thần Thể',
      'Băng Nguyên Thần Thể',
      'Phong Nguyên Thần Thể',
      'Lôi Nguyên Thần Thể',
    ];
    elementAttr = elements[(selfNum - 1) % elements.length];
    daoAnhTitle = `Đạo Anh Tự Thân ${selfNum}`;
  }

  const newDaoAnh = {
    id: `da_${palaceIndex}_${Date.now()}`,
    palaceIndex,
    name: daoAnhTitle,
    element: elementAttr,
    fromLamp: isLampPalace,
    currentKiep: 1, // Khởi tạo ở Kiếp 1 (= 1 Anh chiến lực)
    currentThienMenh: 0,
    maxThienMenh: KIEP_THIEN_MENH_REQUIREMENTS[1],
  };

  state.daoAnhs.push(newDaoAnh);

  if (state.daoAnhs.length === state.maxThienCung) {
    state.realm = 'nguyen_anh';
    state.logs.unshift({
      text: `👑 NGUYÊN ANH ĐẠI THÀNH! Toàn bộ ${state.maxThienCung} Thiên Cung đã hóa thành Đạo Anh! Tụ đỉnh ngưng tụ chiến lực Anh (tối đa 65 Anh)!`,
      time: Date.now(),
    });
  } else {
    state.realm = 'gia_anh';
    state.logs.unshift({
      text: `Ngưng tụ thành công ${newDaoAnh.name} (${elementAttr}, +1 Anh chiến lực)! Đạt cảnh giới Giả Anh.`,
      time: Date.now(),
    });
  }

  saveCultivationState(state);
  return state;
}

/**
 * Nạp Lực Thiên Mệnh vào Đạo Anh
 */
export function injectThienMenhToDaoAnh(daoAnhId, amount) {
  const state = getCultivationState();
  if ((state.totalThienMenh || 0) < amount) {
    throw new Error('Lực Thiên Mệnh không đủ để nạp.');
  }

  const da = (state.daoAnhs || []).find(d => d.id === daoAnhId);
  if (!da) throw new Error('Không tìm thấy Đạo Anh.');
  if (da.currentKiep >= 5) throw new Error('Đạo Anh đã đạt Kiếp 5 Đại Viên Mãn.');

  const needed = da.maxThienMenh - da.currentThienMenh;
  const actualInject = Math.min(amount, needed);

  da.currentThienMenh += actualInject;
  state.totalThienMenh -= actualInject;

  state.logs.unshift({
    text: `Đã nạp +${actualInject.toLocaleString()} Thiên Mệnh vào ${da.name} (${da.currentThienMenh}/${da.maxThienMenh}).`,
    time: Date.now(),
  });

  saveCultivationState(state);
  return state;
}

/**
 * Độ Kiếp cho 1 Đạo Anh
 */
export function attemptTribulationSingle(daoAnhId) {
  const state = getCultivationState();
  const da = (state.daoAnhs || []).find(d => d.id === daoAnhId);
  if (!da) throw new Error('Không tìm thấy Đạo Anh.');
  if (da.currentKiep >= 5) throw new Error('Đạo Anh này đã đạt Kiếp 5 Đại Viên Mãn.');

  const targetKiep = da.currentKiep;
  const tribulationName = TRIBULATION_NAMES[targetKiep] || `Thiên Kiếp ${targetKiep}`;

  const percent = Math.floor((da.currentThienMenh / da.maxThienMenh) * 100);
  if (percent < 70) {
    throw new Error(`Đạo Anh mới đạt ${percent}% Thiên Mệnh. Cần tối thiểu 70% Thiên Mệnh để nghênh tiếp ${tribulationName}.`);
  }

  const successChance = Math.min(100, 50 + (percent - 70));
  const roll = Math.random() * 100;
  const isSuccess = roll <= successChance;

  let message = '';
  if (isSuccess) {
    da.currentKiep += 1;
    da.currentThienMenh = 0;
    da.maxThienMenh = KIEP_THIEN_MENH_REQUIREMENTS[Math.min(4, da.currentKiep)];
    message = `⚡ ĐỘ KIẾP THÀNH CÔNG! ${da.name} (${da.element || 'Thần Thể'}) đã vượt qua [${tribulationName}], thăng hoa lên Kiếp thứ ${da.currentKiep} (+1 Anh chiến lực)!`;
    state.logs.unshift({ text: message, time: Date.now() });

    if (state.daoAnhs.length === state.maxThienCung && state.daoAnhs.every(d => d.currentKiep >= 1)) {
      state.realm = 'nguyen_anh';
    }
  } else {
    if (da.fromLamp) {
      da.currentThienMenh = Math.round(da.maxThienMenh * 0.5);
      message = `⚡ ĐỘ KIẾP THẤT BẠI! Nhờ có Chân Hỏa Mệnh Đăng bảo vệ, ${da.name} không bị thương hại nặng, chỉ lui về 50% Thiên Mệnh!`;
    } else {
      da.currentThienMenh = 0;
      message = `⚡ ĐỘ KIẾP THẤT BẠI! Thiên lôi đánh tan thần niệm, ${da.name} bị tiêu hao toàn bộ Thiên Mệnh tích lũy!`;
    }
    state.logs.unshift({ text: message, time: Date.now() });
  }

  saveCultivationState(state);
  return { state, isSuccess, successChance, tribulationName, daoAnhName: da.name, element: da.element, message };
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

  const resultMsg = `🌟 VẠN KIẾP TỀ PHI KẾT THÚC: ${successCount} Đạo Anh vượt kiếp thành công, ${failCount} Đạo Anh thất bại. Nhận thưởng +${totalBonusThienMenh.toLocaleString()} Thiên Mệnh!`;
  state.logs.unshift({ text: resultMsg, time: Date.now() });

  saveCultivationState(state);
  return { state, successCount, failCount, totalBonusThienMenh, resultMsg };
}

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
