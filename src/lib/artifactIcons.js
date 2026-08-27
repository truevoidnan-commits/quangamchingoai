// =========================================================================
// ARTIFACT ICON MAPPING
// Maps artifact IDs & life lamp IDs to their custom icon sources.
// =========================================================================

const baseUrl = (typeof import.meta !== 'undefined' && import.meta?.env?.BASE_URL ? import.meta.env.BASE_URL : '/').replace(/\/$/, '') + '/';

/** Map of all Thần Phẩm artifact IDs to AI-generated PNG/JPG icons */
export const THAN_PHAM_AI_ICONS = {
  tao_hoa_ngoc_diep:            baseUrl + 'icons/than_pham/art_tao_hoa_ngoc_diep.jpg',
  kim_o_luyen_van_linh:         baseUrl + 'icons/than_pham/art_kim_o_luyen_van_linh.jpg',
  nguyen_thuy_thai_so_ma_kinh:  baseUrl + 'icons/than_pham/art_nguyen_thuy_thai_so_ma_kinh.jpg',
  dao_menh_thien_ma_cong:       baseUrl + 'icons/than_pham/art_dao_menh_thien_ma_cong.jpg',
  ngu_hanh_dai_dong_thien:      baseUrl + 'icons/than_pham/art_ngu_hanh_dai_dong_thien.jpg',
  mac_sat_tien_phach:           baseUrl + 'icons/than_pham/art_mac_sat_tien_phach.jpg',
  huyen_hoang_diet_the_bien:    baseUrl + 'icons/than_pham/art_huyen_hoang_diet_the_bien.jpg',
  am_duong_hon_don_nguyen_can:  baseUrl + 'icons/than_pham/art_am_duong_hon_don_nguyen_can.jpg',
  luc_dao_luan_hoi_tien_can:    baseUrl + 'icons/than_pham/art_luc_dao_luan_hoi_tien_can.jpg',
  tam_sinh_luan_hoi_an:         baseUrl + 'icons/than_pham/art_tam_sinh_luan_hoi_an.jpg',
  tran_nguc_minh_vuong_the:     baseUrl + 'icons/than_pham/art_tran_nguc_minh_vuong_the.jpg',
  thai_so_than_vuong_the:       baseUrl + 'icons/than_pham/art_thai_so_than_vuong_the.jpg',
  tien_thien_thanh_the_dao_thai: baseUrl + 'icons/than_pham/art_tien_thien_thanh_the_dao_thai.jpg',
  hon_don_diet_the_loi_tri:     baseUrl + 'icons/than_pham/art_hon_don_diet_the_loi_tri.jpg',
  khoi_nguyen_vu_tru_ban_nguyen: baseUrl + 'icons/than_pham/art_khoi_nguyen_vu_tru_ban_nguyen.jpg',
  tha_hoa_tu_tai_dai_phap:      baseUrl + 'icons/than_pham/art_tha_hoa_tu_tai_dai_phap.jpg',
  tieu_tuc_menh_thuat:          baseUrl + 'icons/than_pham/art_tieu_tuc_menh_thuat.jpg',
  con_bang_tien_phap:           baseUrl + 'icons/than_pham/art_con_bang_tien_phap.jpg',
  can_khon_luong_nghi_ho:       baseUrl + 'icons/than_pham/art_can_khon_luong_nghi_ho.jpg',
  cuu_kiep_loi_nguc_kiem_phap:  baseUrl + 'icons/than_pham/art_cuu_kiep_loi_nguc_kiem_phap.jpg',
  van_de_tran_ma_quyen:         baseUrl + 'icons/than_pham/art_van_de_tran_ma_quyen.jpg',
  nhat_khi_hoa_tam_thanh:       baseUrl + 'icons/than_pham/art_nhat_khi_hoa_tam_thanh.jpg',
  vo_thuy_vo_chung_vo_vi_than:  baseUrl + 'icons/than_pham/art_vo_thuy_vo_chung_vo_vi_than.jpg',
  diet_the_loi_viem_dong:       baseUrl + 'icons/than_pham/art_diet_the_loi_viem_dong.jpg',
};

/** Map of Thần Phẩm Life Lamp IDs to AI-generated icons (18 Chí Tôn Mệnh Đăng) */
export const LAMP_THAN_PHAM_AI_ICONS = {
  nguyen_thuy_thien_ma:         baseUrl + 'icons/than_pham/lamp_nguyen_thuy_thien_ma.jpg',
  hon_don_so_khai:              baseUrl + 'icons/than_pham/lamp_hon_don_so_khai.jpg',
  hong_mong_bat_diet:           baseUrl + 'icons/than_pham/lamp_hong_mong_bat_diet.jpg',
  cuu_chuyen_luan_hoi:          baseUrl + 'icons/than_pham/lamp_cuu_chuyen_luan_hoi.jpg',
  thuong_thuong_loi_kiep:       baseUrl + 'icons/than_pham/lamp_thuong_thuong_loi_kiep.jpg',
  sang_the_ban_nguyen:          baseUrl + 'icons/than_pham/lamp_sang_the_ban_nguyen.jpg',
  van_menh_hu_vo:               baseUrl + 'icons/than_pham/lamp_van_menh_hu_vo.jpg',
  tuc_menh_nhan_qua:            baseUrl + 'icons/than_pham/lamp_tuc_menh_nhan_qua.jpg',
  thai_co_than_long:            baseUrl + 'icons/than_pham/lamp_thai_co_than_long.jpg',
  khoi_nguyen_thoi_khong:       baseUrl + 'icons/than_pham/lamp_khoi_nguyen_thoi_khong.jpg',
  van_gioi_quy_nhat:            baseUrl + 'icons/than_pham/lamp_van_gioi_quy_nhat.jpg',
  toi_cao_thien_menh:           baseUrl + 'icons/than_pham/lamp_toi_cao_thien_menh.jpg',
  cuu_khieu_linh_lung:          baseUrl + 'icons/than_pham/lamp_cuu_khieu_linh_lung.jpg',
  thien_dao_chi_ton:            baseUrl + 'icons/than_pham/lamp_thien_dao_chi_ton.jpg',
  nguyen_gioi_hon_co:           baseUrl + 'icons/than_pham/lamp_nguyen_gioi_hon_co.jpg',
  cam_ky_cuc_dao:               baseUrl + 'icons/than_pham/lamp_cam_ky_cuc_dao.jpg',
  dao_tam_chung_ma:             baseUrl + 'icons/than_pham/lamp_dao_tam_chung_ma.jpg',
  tan_tien_phe_than:            baseUrl + 'icons/than_pham/lamp_tan_tien_phe_than.jpg',
};

export function getLampImageUrl(lampId) {
  return LAMP_THAN_PHAM_AI_ICONS[lampId] || (baseUrl + 'icons/than_pham/lamp_tan_tien_phe_than.jpg');
}

export function getArtifactImageUrl(artId) {
  return THAN_PHAM_AI_ICONS[artId] || (baseUrl + 'icons/than_pham/art_tao_hoa_ngoc_diep.jpg');
}


/**
 * Returns the icon config for a given artifact/lamp object.
 * @param {object} item - artifact or lamp object with { id, tier, icon, color }
 * @returns {{ type: 'img'|'svg'|'emoji', src?: string, tier: string, color: string }}
 */
export function getArtifactIconConfig(item) {
  if (!item) return { type: 'emoji', emoji: '🌫️', tier: 'ha_pham', color: '#94a3b8' };

  const tier = item.tier || 'ha_pham';
  const color = item.color || TIER_COLORS[tier] || '#94a3b8';

  // Thần Phẩm: check for AI image first
  if (tier === 'than_pham' && THAN_PHAM_AI_ICONS[item.id]) {
    return { type: 'img', src: THAN_PHAM_AI_ICONS[item.id], tier, color };
  }

  // All items: SVG art by tier
  return { type: 'svg', svgKey: tier, tier, color };
}

export const TIER_COLORS = {
  ha_pham:     '#e2e8f0',
  trung_pham:  '#10b981',
  thuong_pham: '#06b6d4',
  cuc_pham:    '#a855f7',
  tien_pham:   '#f59e0b',
  than_pham:   '#ef4444',
};

export const TIER_GLOW = {
  ha_pham:     'rgba(226,232,240,0.5)',
  trung_pham:  'rgba(16,185,129,0.55)',
  thuong_pham: 'rgba(6,182,212,0.55)',
  cuc_pham:    'rgba(168,85,247,0.55)',
  tien_pham:   'rgba(245,158,11,0.55)',
  than_pham:   'rgba(239,68,68,0.6)',
};

export const LAMP_TIER_COLOR = '#a855f7';
export const LAMP_TIER_GLOW  = 'rgba(168,85,247,0.55)';
