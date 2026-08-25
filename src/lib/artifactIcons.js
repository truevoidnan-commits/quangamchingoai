// =========================================================================
// ARTIFACT ICON MAPPING
// Maps artifact IDs & life lamp IDs to their custom icon sources.
// =========================================================================

const baseUrl = (typeof import.meta !== 'undefined' && import.meta?.env?.BASE_URL ? import.meta.env.BASE_URL : '/').replace(/\/$/, '') + '/';

/** Map of all Thần Phẩm artifact IDs to AI-generated PNG/JPG icons */
export const THAN_PHAM_AI_ICONS = {
  tao_hoa_ngoc_diep:            baseUrl + 'icons/than_pham/ngoc_diep.jpg',
  kim_o_luyen_van_linh:         baseUrl + 'icons/than_pham/kim_o_than_tien_cung.jpg',
  nguyen_thuy_thai_so_ma_kinh:  baseUrl + 'icons/than_pham/hong_mong_tu_khi.jpg',
  dao_menh_thien_ma_cong:       baseUrl + 'icons/than_pham/hu_vo_tich_diet.jpg',
  ngu_hanh_dai_dong_thien:      baseUrl + 'icons/than_pham/sang_the_quang.jpg',
  mac_sat_tien_phach:           baseUrl + 'icons/than_pham/phat_thien_kiem.jpg',
  huyen_hoang_diet_the_bien:    baseUrl + 'icons/than_pham/the_gioi_moc.jpg',
  am_duong_hon_don_nguyen_can:  baseUrl + 'icons/than_pham/hon_don_so_khai.jpg',
  luc_dao_luan_hoi_tien_can:    baseUrl + 'icons/than_pham/luan_hoi_chan_kinh.jpg',
  tam_sinh_luan_hoi_an:         baseUrl + 'icons/than_pham/so_tam_quyet.jpg',
  tran_nguc_minh_vuong_the:     baseUrl + 'icons/than_pham/tu_nguyet_phe_hon_kich.jpg',
  thai_so_than_vuong_the:       baseUrl + 'icons/than_pham/bat_hu_dinh.jpg',
  tien_thien_thanh_the_dao_thai: baseUrl + 'icons/than_pham/tieu_dao_thien.jpg',
  hon_don_diet_the_loi_tri:     baseUrl + 'icons/than_pham/nam_minh_than_hoa_dinh.jpg',
  khoi_nguyen_vu_tru_ban_nguyen: baseUrl + 'icons/than_pham/thoi_khong_chau.jpg',
  tha_hoa_tu_tai_dai_phap:      baseUrl + 'icons/than_pham/van_menh_chau.jpg',
  tieu_tuc_menh_thuat:          baseUrl + 'icons/than_pham/tuc_menh_toa.jpg',
  con_bang_tien_phap:           baseUrl + 'icons/than_pham/van_co_long_to.jpg',
  can_khon_luong_nghi_ho:       baseUrl + 'icons/than_pham/hoang_tuyen_dinh_hai_binh.jpg',
  cuu_kiep_loi_nguc_kiem_phap:  baseUrl + 'icons/than_pham/thanh_lam_tran_the_tram.jpg',
  van_de_tran_ma_quyen:         baseUrl + 'icons/than_pham/thien_cuong_chuong.jpg',
  nhat_khi_hoa_tam_thanh:       baseUrl + 'icons/than_pham/bach_ngoc_truong_sinh_thu.jpg',
  vo_thuy_vo_chung_vo_vi_than:  baseUrl + 'icons/than_pham/hac_thien_de_long_bao.jpg',
  diet_the_loi_viem_dong:       baseUrl + 'icons/than_pham/tu_nguyet_phe_hon_kich.jpg',
};

/** Map of Thần Phẩm Life Lamp IDs to AI-generated icons */
export const LAMP_THAN_PHAM_AI_ICONS = {
  tan_tien_phe_than:            baseUrl + 'icons/than_pham/lamp_tan_tien_phe_than.jpg',
  sang_the_ban_nguyen:          baseUrl + 'icons/than_pham/lamp_sang_the_ban_nguyen.jpg',
  hon_don_so_khai:              baseUrl + 'icons/than_pham/lamp_hon_don_so_khai.jpg',
  hong_mong_bat_diet:            baseUrl + 'icons/than_pham/lamp_hong_mong_bat_diet.jpg',
  cuu_chuyen_luan_hoi:           baseUrl + 'icons/than_pham/lamp_cuu_chuyen_luan_hoi.jpg',
  thuong_thuong_loi_kiep:       baseUrl + 'icons/than_pham/lamp_thuong_thuong_loi_kiep.jpg',
  thien_dao_trung_phat:         baseUrl + 'icons/than_pham/lamp_thuong_thuong_loi_kiep.jpg',
  van_menh_hu_vo:               baseUrl + 'icons/than_pham/lamp_van_menh_hu_vo.jpg',
  vo_cuc_ma_ton:                 baseUrl + 'icons/than_pham/lamp_van_menh_hu_vo.jpg',
  tuc_menh_nhan_qua:            baseUrl + 'icons/than_pham/lamp_tuc_menh_nhan_qua.jpg',
  khai_thien_tich_dia:          baseUrl + 'icons/than_pham/lamp_tuc_menh_nhan_qua.jpg',
  thai_co_than_long:            baseUrl + 'icons/than_pham/lamp_thai_co_than_long.jpg',
  khoi_nguyen_thoi_khong:       baseUrl + 'icons/than_pham/lamp_khoi_nguyen_thoi_khong.jpg',
  bat_hu_thoi_khong:           baseUrl + 'icons/than_pham/lamp_khoi_nguyen_thoi_khong.jpg',
  van_gioi_quy_nhat:            baseUrl + 'icons/than_pham/lamp_van_gioi_quy_nhat.jpg',
  toi_cao_thien_menh:          baseUrl + 'icons/than_pham/lamp_toi_cao_thien_menh.jpg',
  nguyen_thuy_thien_ma:         baseUrl + 'icons/than_pham/lamp_nguyen_thuy_thien_ma.jpg',
  cuu_khieu_linh_lung:          baseUrl + 'icons/than_pham/lamp_cuu_khieu_linh_lung.jpg',
  thien_dao_chi_ton:            baseUrl + 'icons/than_pham/lamp_thien_dao_chi_ton.jpg',
  nguyen_gioi_hon_co:           baseUrl + 'icons/than_pham/lamp_nguyen_gioi_hon_co.jpg',
  cam_ky_cuc_dao:               baseUrl + 'icons/than_pham/lamp_cam_ky_cuc_dao.jpg',
  dao_tam_chung_ma:             baseUrl + 'icons/than_pham/lamp_dao_tam_chung_ma.jpg',
};

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
