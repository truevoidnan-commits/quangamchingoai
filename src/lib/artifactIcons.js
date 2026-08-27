// =========================================================================
// ARTIFACT ICON MAPPING
// Instant Inlined Data-URIs (0ms load time - Zero HTTP Network Latency)
// =========================================================================

import { BAKED_ICONS } from './bakedAssets';

/** Map of all Thần Phẩm artifact IDs to instant Data-URI icons */
export const THAN_PHAM_AI_ICONS = {
  tao_hoa_ngoc_diep:            BAKED_ICONS['art_tao_hoa_ngoc_diep'] || '',
  kim_o_luyen_van_linh:         BAKED_ICONS['art_kim_o_luyen_van_linh'] || '',
  nguyen_thuy_thai_so_ma_kinh:  BAKED_ICONS['art_nguyen_thuy_thai_so_ma_kinh'] || '',
  dao_menh_thien_ma_cong:       BAKED_ICONS['art_dao_menh_thien_ma_cong'] || '',
  ngu_hanh_dai_dong_thien:      BAKED_ICONS['art_ngu_hanh_dai_dong_thien'] || '',
  mac_sat_tien_phach:           BAKED_ICONS['art_mac_sat_tien_phach'] || '',
  huyen_hoang_diet_the_bien:    BAKED_ICONS['art_huyen_hoang_diet_the_bien'] || '',
  am_duong_hon_don_nguyen_can:  BAKED_ICONS['art_am_duong_hon_don_nguyen_can'] || '',
  luc_dao_luan_hoi_tien_can:    BAKED_ICONS['art_luc_dao_luan_hoi_tien_can'] || '',
  tam_sinh_luan_hoi_an:         BAKED_ICONS['art_tam_sinh_luan_hoi_an'] || '',
  tran_nguc_minh_vuong_the:     BAKED_ICONS['art_tran_nguc_minh_vuong_the'] || '',
  thai_so_than_vuong_the:       BAKED_ICONS['art_thai_so_than_vuong_the'] || '',
  tien_thien_thanh_the_dao_thai: BAKED_ICONS['art_tien_thien_thanh_the_dao_thai'] || '',
  hon_don_diet_the_loi_tri:     BAKED_ICONS['art_hon_don_diet_the_loi_tri'] || '',
  khoi_nguyen_vu_tru_ban_nguyen: BAKED_ICONS['art_khoi_nguyen_vu_tru_ban_nguyen'] || '',
  tha_hoa_tu_tai_dai_phap:      BAKED_ICONS['art_tha_hoa_tu_tai_dai_phap'] || '',
  tieu_tuc_menh_thuat:          BAKED_ICONS['art_tieu_tuc_menh_thuat'] || '',
  con_bang_tien_phap:           BAKED_ICONS['art_con_bang_tien_phap'] || '',
  can_khon_luong_nghi_ho:       BAKED_ICONS['art_can_khon_luong_nghi_ho'] || '',
  cuu_kiep_loi_nguc_kiem_phap:  BAKED_ICONS['art_cuu_kiep_loi_nguc_kiem_phap'] || '',
  van_de_tran_ma_quyen:         BAKED_ICONS['art_van_de_tran_ma_quyen'] || '',
  nhat_khi_hoa_tam_thanh:       BAKED_ICONS['art_nhat_khi_hoa_tam_thanh'] || '',
  vo_thuy_vo_chung_vo_vi_than:  BAKED_ICONS['art_vo_thuy_vo_chung_vo_vi_than'] || '',
  diet_the_loi_viem_dong:       BAKED_ICONS['art_diet_the_loi_viem_dong'] || '',
};

/** Map of Thần Phẩm Life Lamp IDs to instant Data-URI icons (18 Chí Tôn Mệnh Đăng) */
export const LAMP_THAN_PHAM_AI_ICONS = {
  nguyen_thuy_thien_ma:         BAKED_ICONS['lamp_nguyen_thuy_thien_ma'] || '',
  hon_don_so_khai:              BAKED_ICONS['lamp_hon_don_so_khai'] || '',
  hong_mong_bat_diet:           BAKED_ICONS['lamp_hong_mong_bat_diet'] || '',
  cuu_chuyen_luan_hoi:          BAKED_ICONS['lamp_cuu_chuyen_luan_hoi'] || '',
  thuong_thuong_loi_kiep:       BAKED_ICONS['lamp_thuong_thuong_loi_kiep'] || '',
  sang_the_ban_nguyen:          BAKED_ICONS['lamp_sang_the_ban_nguyen'] || '',
  van_menh_hu_vo:               BAKED_ICONS['lamp_van_menh_hu_vo'] || '',
  tuc_menh_nhan_qua:            BAKED_ICONS['lamp_tuc_menh_nhan_qua'] || '',
  thai_co_than_long:            BAKED_ICONS['lamp_thai_co_than_long'] || '',
  khoi_nguyen_thoi_khong:       BAKED_ICONS['lamp_khoi_nguyen_thoi_khong'] || '',
  van_gioi_quy_nhat:            BAKED_ICONS['lamp_van_gioi_quy_nhat'] || '',
  toi_cao_thien_menh:           BAKED_ICONS['lamp_toi_cao_thien_menh'] || '',
  cuu_khieu_linh_lung:          BAKED_ICONS['lamp_cuu_khieu_linh_lung'] || '',
  thien_dao_chi_ton:            BAKED_ICONS['lamp_thien_dao_chi_ton'] || '',
  nguyen_gioi_hon_co:           BAKED_ICONS['lamp_nguyen_gioi_hon_co'] || '',
  cam_ky_cuc_dao:               BAKED_ICONS['lamp_cam_ky_cuc_dao'] || '',
  dao_tam_chung_ma:             BAKED_ICONS['lamp_dao_tam_chung_ma'] || '',
  tan_tien_phe_than:            BAKED_ICONS['lamp_tan_tien_phe_than'] || '',
};

export function getLampImageUrl(lampId) {
  return LAMP_THAN_PHAM_AI_ICONS[lampId] || BAKED_ICONS['lamp_tan_tien_phe_than'] || '';
}

export function getArtifactImageUrl(artId) {
  return THAN_PHAM_AI_ICONS[artId] || BAKED_ICONS['art_tao_hoa_ngoc_diep'] || '';
}

export function preloadCoreArtifactIcons() {
  // Already baked into JS memory - zero preload needed!
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

  return { type: 'svg', tier, color };
}

/** Default tier colors */
export const TIER_COLORS = {
  than_pham:    '#f59e0b',
  cuc_pham:     '#ec4899',
  thuong_pham:  '#a855f7',
  trung_pham:   '#3b82f6',
  ha_pham:      '#10b981',
};

/** Default tier glow colors */
export const TIER_GLOW = {
  than_pham:    'rgba(245, 158, 11, 0.45)',
  cuc_pham:     'rgba(236, 72, 153, 0.4)',
  thuong_pham:  'rgba(168, 85, 247, 0.35)',
  trung_pham:   'rgba(59, 130, 246, 0.3)',
  ha_pham:      'rgba(16, 185, 129, 0.25)',
};
