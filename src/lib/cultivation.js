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

export const EXP_PER_PHAP_KHIEU = 70; // 70 EXP / khiếu (tổng 8400 EXP để mở 120 khiếu)
export const EXP_FOR_121_ATTEMPT = 1200; // Tích lũy 1200 EXP sau 120 khiếu để mượn cơ duyên xung kích
export const EXP_PER_THIEN_CUNG = 800; // 800 EXP để hóa thực 1 Thiên Cung

// Ngưỡng Thiên Mệnh chuẩn cho 5 Kiếp của mỗi Đạo Anh
export const KIEP_THIEN_MENH_REQUIREMENTS = [
  3000,  // Kiếp 1: 3000 TM
  7000,  // Kiếp 2: 7000 TM
  13000, // Kiếp 3: 13000 TM
  22000, // Kiếp 4: 22000 TM
  35000, // Kiếp 5: 35000 TM
];

// 6 Phẩm cấp độ hiếm của Mệnh Đăng
export const LAMP_TIERS = {
  ha_pham: { id: 'ha_pham', name: 'Hạ Phẩm', color: '#e2e8f0', bg: 'rgba(226, 232, 240, 0.12)', border: 'rgba(226, 232, 240, 0.4)', weight: 0.45 },
  trung_pham: { id: 'trung_pham', name: 'Trung Phẩm', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.4)', weight: 0.28 },
  thuong_pham: { id: 'thuong_pham', name: 'Thượng Phẩm', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)', border: 'rgba(6, 182, 212, 0.4)', weight: 0.15 },
  cuc_pham: { id: 'cuc_pham', name: 'Cực Phẩm', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.4)', weight: 0.08 },
  tien_pham: { id: 'tien_pham', name: 'Tiên Phẩm', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.6)', weight: 0.032 },
  than_pham: { id: 'than_pham', name: 'Thần Phẩm', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.18)', border: 'rgba(239, 68, 68, 0.7)', weight: 0.008 },
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
    name: 'Thôn Thiên Ma Đế Đăng',
    shortName: 'Ma Đế Đăng',
    tier: 'than_pham',
    icon: '👁️',
    color: '#ef4444',
    desc: 'Ma nhãn thượng cổ ma đế phong ấn, mở ra hư không hắc động nuốt trọn nhật nguyệt.',
    poem: 'Ma đế giáng lâm, thôn thiên thực địa.',
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
    name: 'Thiên Đạo Trừng Phạt Đăng',
    shortName: 'Trừng Phạt Đăng',
    tier: 'than_pham',
    icon: '⚡',
    color: '#ef4444',
    desc: 'Hiện thân của quy tắc thiên phạt, giáng xuống lôi đình hủy diệt kẻ nghịch thiên chấn động tam giới.',
    poem: 'Thiên đạo vô tình, thần phạt giáng lâm.',
  },
  {
    id: 'vo_cuc_ma_ton',
    name: 'Vô Cực Ma Tôn Đăng',
    shortName: 'Vô Cực Đăng',
    tier: 'than_pham',
    icon: '💀',
    color: '#ef4444',
    desc: 'Chứa đựng ma uy vô thượng của chí tôn ma đạo thời thái cổ, vạn giới đều phải cúi đầu quy phục.',
    poem: 'Vô cực ma tôn, duy ngã độc tôn.',
  },
  {
    id: 'khai_thien_tich_dia',
    name: 'Khai Thiên Tịch Địa Đăng',
    shortName: 'Khai Thiên Đăng',
    tier: 'than_pham',
    icon: '🪓',
    color: '#ef4444',
    desc: 'Khí phách bổ đôi hỗn mang dựng nên trời đất, sức mạnh sáng thế vô song không thể ngăn cản.',
    poem: 'Khai thiên tịch địa, sáng tạo càn khôn.',
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
    name: 'Bất Hủ Thời Không Đăng',
    shortName: 'Thời Không Đăng',
    tier: 'than_pham',
    icon: '⏳',
    color: '#ef4444',
    desc: 'Nắm giữ quy tắc thời gian và không gian, tự do đi lại giữa quá khứ và tương lai không bị hạn định.',
    poem: 'Thời không bất hủ, ngạo thị tuế nguyệt.',
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
  inventoryLamps: [], // Danh sách id đèn trong túi
  absorbedLamps: [],  // Danh sách id đèn đã hấp thụ (tối đa 5, không hoàn trả)

  // Kim Đan (Thiên Cung)
  maxThienCung: 6, // 6 đến 13
  realizedThienCung: 1, // Số cung đã hóa thực thành Cung Thật
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
    return { ...DEFAULT_STATE, ...parsed };
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
    const realPalaces = state.realizedThienCung || 1;
    return `${realPalaces} Cung`;
  }

  if (state.realm === 'gia_anh' || state.realm === 'nguyen_anh') {
    const totalAnh = getTotalCombatPowerAnh(state);
    return `${totalAnh} Anh`;
  }

  return '0 Hổ';
}

/**
 * Ghi nhận tiến độ đọc chương và cộng Tu Vi & Rơi Mệnh Đăng quý hiếm
 * Chỉ được gọi khi người đọc đã ở lại chương ít nhất 60 giây!
 */
export function addReadingProgress(novelId, chapterId, wordCount = 2000) {
  const state = getCultivationState();
  const key = `${novelId}_${chapterId}`;

  const isFirstRead = !state.readChapterIds[key];
  // Random mức tăng tu vi từ 50 đến 100 mỗi chu kỳ 60s
  const gainedExp = Math.floor(Math.random() * (MAX_EXP_PER_CYCLE - MIN_EXP_PER_CYCLE + 1)) + MIN_EXP_PER_CYCLE;

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
  let breakthrough = null;

  // TỈ LỆ RƠI MỆNH ĐĂNG THEO 6 CẤP BẬC HIẾM (~7.5% mỗi chu kỳ 60s)
  const allOwnedLamps = [...(state.inventoryLamps || []), ...(state.absorbedLamps || [])];
  if (allOwnedLamps.length < LIFE_LAMPS.length) {
    const unownedLamps = LIFE_LAMPS.filter(l => !allOwnedLamps.includes(l.id));

    if (unownedLamps.length > 0) {
      const dropRoll = Math.random();
      // Tỉ lệ rơi: 7.5% cơ bản mỗi chu kỳ 60s (tăng hấp dẫn phù hợp 72 Mệnh Đăng)
      if (dropRoll < 0.075) {
        // Chọn tier ngẫu nhiên theo trọng số phẩm cấp tương quan
        const tierRoll = Math.random();
        let selectedTier = 'ha_pham';
        if (tierRoll < 0.45) selectedTier = 'ha_pham';
        else if (tierRoll < 0.73) selectedTier = 'trung_pham';
        else if (tierRoll < 0.88) selectedTier = 'thuong_pham';
        else if (tierRoll < 0.96) selectedTier = 'cuc_pham';
        else if (tierRoll < 0.992) selectedTier = 'tien_pham';
        else selectedTier = 'than_pham';

        // Tìm đèn chưa sở hữu thuộc tier đó (nếu không có thì lấy bất kỳ)
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

  // Xử lý tiến độ theo từng cảnh giới với đường cong EXP lũy tiến
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
      const opened = Math.min(120, Math.floor(state.expCurrentRealm / EXP_PER_PHAP_KHIEU));
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
      state.attemptExp121 += gainedExp;
    }
  } else if (state.realm === 'kim_dan') {
    if (state.realizedThienCung < state.maxThienCung) {
      state.currentThienCungExp += gainedExp;
      if (state.currentThienCungExp >= EXP_PER_THIEN_CUNG) {
        state.currentThienCungExp -= EXP_PER_THIEN_CUNG;
        state.realizedThienCung += 1;
        breakthrough = {
          type: 'cung',
          title: `HÓA THỰC CUNG THỨ ${state.realizedThienCung}!`,
          subtitle: `Chiến lực: ${state.realizedThienCung} Cung Thật`,
          icon: '🏛️',
        };
        state.logs.unshift({
          text: `Thiên địa dị tượng! Đã Hóa Thực thành công Thiên Cung thứ ${state.realizedThienCung}/${state.maxThienCung} thành Cung Thật (+1 Cung chiến lực)!`,
          time: Date.now(),
        });
      }
    }
  }

  saveCultivationState(state);
  return { state, gainedExp, gainedThienMenh, isFirstRead, droppedLamp, breakthrough };
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
  state.realizedThienCung = Math.max(1, lampBonusCung);
  state.currentThienCungExp = 0;

  state.logs.unshift({
    text: `Đột phá Kim Đan thành công! Sở hữu trần ${totalThienCung} Thiên Cung (${baseThienCung} Cung tự thân + ${lampBonusCung} Chân Cung Mệnh Đăng). Chiến lực tính bằng Cung!`,
    time: Date.now(),
  });

  saveCultivationState(state);
  return state;
}

/**
 * Chuyển hóa 1 Thiên Cung đã Hóa Thực thành Đạo Anh
 */
export function manifestDaoAnh(palaceIndex) {
  const state = getCultivationState();
  if (state.realm !== 'kim_dan' && state.realm !== 'gia_anh' && state.realm !== 'nguyen_anh') {
    throw new Error('Cảnh giới chưa đủ để ngưng tụ Đạo Anh.');
  }

  if (palaceIndex >= state.realizedThienCung) {
    throw new Error('Thiên Cung này chưa được Hóa Thực thành Cung Thật.');
  }

  if (!state.daoAnhs) state.daoAnhs = [];
  const existing = state.daoAnhs.find(d => d.palaceIndex === palaceIndex);
  if (existing) {
    throw new Error('Thiên Cung này đã chuyển hóa thành Đạo Anh.');
  }

  const absorbed = state.absorbedLamps || [];
  const totalPalaces = state.maxThienCung;
  const lampStartIndex = totalPalaces - absorbed.length;
  const isLampPalace = palaceIndex >= lampStartIndex;
  let lampName = null;
  if (isLampPalace) {
    const lampId = absorbed[palaceIndex - lampStartIndex];
    const lampObj = LIFE_LAMPS.find(l => l.id === lampId);
    lampName = lampObj ? lampObj.shortName : 'Mệnh Đăng';
  }

  const newDaoAnh = {
    id: `da_${palaceIndex}_${Date.now()}`,
    palaceIndex,
    name: lampName ? `Đạo Anh [${lampName}]` : `Đạo Anh Cung ${palaceIndex + 1}`,
    fromLamp: isLampPalace,
    currentKiep: 1, // Khởi tạo ở Kiếp 1 (= 1 Anh chiến lực)
    currentThienMenh: 0,
    maxThienMenh: KIEP_THIEN_MENH_REQUIREMENTS[1],
  };

  state.daoAnhs.push(newDaoAnh);

  if (state.daoAnhs.length === state.maxThienCung) {
    state.realm = 'nguyen_anh';
    state.logs.unshift({
      text: `👑 NGUYÊN ANH ĐẠI THÀNH! Toàn bộ ${state.maxThienCung} Thiên Cung đã hóa thành Đạo Anh! Chiến lực tính bằng Anh (tối đa 65 Anh)!`,
      time: Date.now(),
    });
  } else {
    state.realm = 'gia_anh';
    state.logs.unshift({
      text: `Ngưng tụ thành công ${newDaoAnh.name} (+1 Anh chiến lực)! Đạt cảnh giới Giả Anh.`,
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

  const percent = Math.floor((da.currentThienMenh / da.maxThienMenh) * 100);
  if (percent < 70) {
    throw new Error(`Đạo Anh mới đạt ${percent}% Thiên Mệnh. Cần tối thiểu 70% Thiên Mệnh để nghênh tiếp Thiên Kiếp.`);
  }

  const successChance = Math.min(100, 50 + (percent - 70));
  const roll = Math.random() * 100;
  const isSuccess = roll <= successChance;

  let message = '';
  if (isSuccess) {
    da.currentKiep += 1;
    da.currentThienMenh = 0;
    da.maxThienMenh = KIEP_THIEN_MENH_REQUIREMENTS[Math.min(4, da.currentKiep)];
    message = `⚡ ĐỘ KIẾP THÀNH CÔNG! ${da.name} đã vượt qua Kiếp thứ ${da.currentKiep} (+1 Anh chiến lực)!`;
    state.logs.unshift({ text: message, time: Date.now() });

    if (state.daoAnhs.length === state.maxThienCung && state.daoAnhs.every(d => d.currentKiep >= 1)) {
      state.realm = 'nguyen_anh';
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

  const resultMsg = `VẠN KIẾP TỀ PHI KẾT THÚC: ${successCount} Đạo Anh vượt kiếp thành công, ${failCount} Đạo Anh thất bại. Nhận thưởng +${totalBonusThienMenh.toLocaleString()} Thiên Mệnh!`;
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
