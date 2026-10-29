// =========================================================================
// ARTIFACT ICON MAPPING
// Lightweight Vite Asset Mapping (Super Fast, Content Hashed, Cached)
// =========================================================================

const iconFullModules = import.meta.glob('../assets/icons/than_pham_webp/*.webp', { eager: true, import: 'default' });
const iconThumbModules = import.meta.glob('../assets/icons/than_pham_thumb/*.webp', { eager: true, import: 'default' });

const bundledFullIcons = {};
for (const [filepath, mod] of Object.entries(iconFullModules)) {
  const filename = filepath.split(/[\/\\]/).pop().split('.')[0];
  bundledFullIcons[filename] = mod;
}

const bundledThumbIcons = {};
for (const [filepath, mod] of Object.entries(iconThumbModules)) {
  const filename = filepath.split(/[\/\\]/).pop().split('.')[0];
  bundledThumbIcons[filename] = mod;
}

/** Map of all Thần Phẩm artifact IDs to bundled WebP icons (Thumbnails) */
export const THAN_PHAM_AI_ICONS = {
  tao_hoa_ngoc_diep:            bundledThumbIcons['art_tao_hoa_ngoc_diep'] || bundledFullIcons['art_tao_hoa_ngoc_diep'] || '',
  kim_o_luyen_van_linh:         bundledThumbIcons['art_kim_o_luyen_van_linh'] || bundledFullIcons['art_kim_o_luyen_van_linh'] || '',
  nguyen_thuy_thai_so_ma_kinh:  bundledThumbIcons['art_nguyen_thuy_thai_so_ma_kinh'] || bundledFullIcons['art_nguyen_thuy_thai_so_ma_kinh'] || '',
  dao_menh_thien_ma_cong:       bundledThumbIcons['art_dao_menh_thien_ma_cong'] || bundledFullIcons['art_dao_menh_thien_ma_cong'] || '',
  ngu_hanh_dai_dong_thien:      bundledThumbIcons['art_ngu_hanh_dai_dong_thien'] || bundledFullIcons['art_ngu_hanh_dai_dong_thien'] || '',
  mac_sat_tien_phach:           bundledThumbIcons['art_mac_sat_tien_phach'] || bundledFullIcons['art_mac_sat_tien_phach'] || '',
  huyen_hoang_diet_the_bien:    bundledThumbIcons['art_huyen_hoang_diet_the_bien'] || bundledFullIcons['art_huyen_hoang_diet_the_bien'] || '',
  am_duong_hon_don_nguyen_can:  bundledThumbIcons['art_am_duong_hon_don_nguyen_can'] || bundledFullIcons['art_am_duong_hon_don_nguyen_can'] || '',
  tam_sinh_luan_hoi_an:         bundledThumbIcons['art_tam_sinh_luan_hoi_an'] || bundledFullIcons['art_tam_sinh_luan_hoi_an'] || '',
  tran_nguc_minh_vuong_the:     bundledThumbIcons['art_tran_nguc_minh_vuong_the'] || bundledFullIcons['art_tran_nguc_minh_vuong_the'] || '',
  thai_so_than_vuong_the:       bundledThumbIcons['art_thai_so_than_vuong_the'] || bundledFullIcons['art_thai_so_than_vuong_the'] || '',
  tien_thien_thanh_the_dao_thai: bundledThumbIcons['art_tien_thien_thanh_the_dao_thai'] || bundledFullIcons['art_tien_thien_thanh_the_dao_thai'] || '',
  hon_don_diet_the_loi_tri:     bundledThumbIcons['art_hon_don_diet_the_loi_tri'] || bundledFullIcons['art_hon_don_diet_the_loi_tri'] || '',
  thao_tu_kiem_quyet:           bundledThumbIcons['art_thao_tu_kiem_quyet'] || bundledFullIcons['art_thao_tu_kiem_quyet'] || '',
  tha_hoa_tu_tai_dai_phap:      bundledThumbIcons['art_tha_hoa_tu_tai_dai_phap'] || bundledFullIcons['art_tha_hoa_tu_tai_dai_phap'] || '',
  tieu_tuc_menh_thuat:          bundledThumbIcons['art_tieu_tuc_menh_thuat'] || bundledFullIcons['art_tieu_tuc_menh_thuat'] || '',
  con_bang_tien_phap:           bundledThumbIcons['art_con_bang_tien_phap'] || bundledFullIcons['art_con_bang_tien_phap'] || '',
  trung_dong:                   bundledThumbIcons['art_trung_dong'] || bundledFullIcons['art_trung_dong'] || '',
  cuu_kiep_loi_nguc_kiem_phap:  bundledThumbIcons['art_cuu_kiep_loi_nguc_kiem_phap'] || bundledFullIcons['art_cuu_kiep_loi_nguc_kiem_phap'] || '',
  hong_tran_ngung_vong_anh_hao_nguyet: bundledThumbIcons['art_hong_tran_ngung_vong_anh_hao_nguyet'] || bundledFullIcons['art_hong_tran_ngung_vong_anh_hao_nguyet'] || '',
  tam_thu_dao:                  bundledThumbIcons['art_tam_thu_dao'] || bundledFullIcons['art_tam_thu_dao'] || '',
  thuong_thuong_hac_huyet:      bundledThumbIcons['art_thuong_thuong_hac_huyet'] || bundledFullIcons['art_thuong_thuong_hac_huyet'] || '',
  diet_the_loi_viem_dong:       bundledThumbIcons['art_diet_the_loi_viem_dong'] || bundledFullIcons['art_diet_the_loi_viem_dong'] || '',
  de_kiem:                      bundledThumbIcons['art_de_kiem'] || bundledFullIcons['art_de_kiem'] || '',
};

/** Map of Thần Phẩm Life Lamp IDs to bundled WebP icons (18 Chí Tôn Mệnh Đăng - Thumbnails) */
export const LAMP_THAN_PHAM_AI_ICONS = {
  nguyen_thuy_thien_ma:         bundledThumbIcons['lamp_nguyen_thuy_thien_ma'] || bundledFullIcons['lamp_nguyen_thuy_thien_ma'] || '',
  hon_don_so_khai:              bundledThumbIcons['lamp_hon_don_so_khai'] || bundledFullIcons['lamp_hon_don_so_khai'] || '',
  hong_mong_bat_diet:           bundledThumbIcons['lamp_hong_mong_bat_diet'] || bundledFullIcons['lamp_hong_mong_bat_diet'] || '',
  cuu_chuyen_luan_hoi:          bundledThumbIcons['lamp_cuu_chuyen_luan_hoi'] || bundledFullIcons['lamp_cuu_chuyen_luan_hoi'] || '',
  chung_yen_tich_diet:          bundledThumbIcons['lamp_chung_yen_tich_diet'] || bundledFullIcons['lamp_chung_yen_tich_diet'] || '',
  sang_the_ban_nguyen:          bundledThumbIcons['lamp_sang_the_ban_nguyen'] || bundledFullIcons['lamp_sang_the_ban_nguyen'] || '',
  van_menh_hu_vo:               bundledThumbIcons['lamp_van_menh_hu_vo'] || bundledFullIcons['lamp_van_menh_hu_vo'] || '',
  tuc_menh_nhan_qua:            bundledThumbIcons['lamp_tuc_menh_nhan_qua'] || bundledFullIcons['lamp_tuc_menh_nhan_qua'] || '',
  thai_co_than_long:            bundledThumbIcons['lamp_thai_co_than_long'] || bundledFullIcons['lamp_thai_co_than_long'] || '',
  khoi_nguyen_thoi_khong:       bundledThumbIcons['lamp_khoi_nguyen_thoi_khong'] || bundledFullIcons['lamp_khoi_nguyen_thoi_khong'] || '',
  tinh_ha_dich_dao:             bundledThumbIcons['lamp_tinh_ha_dich_dao'] || bundledFullIcons['lamp_tinh_ha_dich_dao'] || '',
  toi_cao_thien_menh:           bundledThumbIcons['lamp_toi_cao_thien_menh'] || bundledFullIcons['lamp_toi_cao_thien_menh'] || '',
  hoang_tuyen_bi_ngan:          bundledThumbIcons['lamp_hoang_tuyen_bi_ngan'] || bundledFullIcons['lamp_hoang_tuyen_bi_ngan'] || '',
  thien_dao_chi_ton:            bundledThumbIcons['lamp_thien_dao_chi_ton'] || bundledFullIcons['lamp_thien_dao_chi_ton'] || '',
  nguyen_gioi_hon_co:           bundledThumbIcons['lamp_nguyen_gioi_hon_co'] || bundledFullIcons['lamp_nguyen_gioi_hon_co'] || '',
  cam_ky_cuc_dao:               bundledThumbIcons['lamp_cam_ky_cuc_dao'] || bundledFullIcons['lamp_cam_ky_cuc_dao'] || '',
  dao_tam_chung_ma:             bundledThumbIcons['lamp_dao_tam_chung_ma'] || bundledFullIcons['lamp_dao_tam_chung_ma'] || '',
  tan_tien_phe_than:            bundledThumbIcons['lamp_tan_tien_phe_than'] || bundledFullIcons['lamp_tan_tien_phe_than'] || '',
};

export function getLampImageUrl(lampId, size = 'thumb') {
  const key = `lamp_${lampId}`;
  if (size === 'thumb') {
    return bundledThumbIcons[key] || bundledFullIcons[key] || bundledThumbIcons['lamp_tan_tien_phe_than'] || bundledFullIcons['lamp_tan_tien_phe_than'] || '';
  }
  return bundledFullIcons[key] || bundledThumbIcons[key] || bundledFullIcons['lamp_tan_tien_phe_than'] || '';
}

export function getArtifactImageUrl(artId, size = 'thumb') {
  const key = `art_${artId}`;
  if (size === 'thumb') {
    return bundledThumbIcons[key] || bundledFullIcons[key] || bundledThumbIcons['art_tao_hoa_ngoc_diep'] || bundledFullIcons['art_tao_hoa_ngoc_diep'] || '';
  }
  return bundledFullIcons[key] || bundledThumbIcons[key] || bundledFullIcons['art_tao_hoa_ngoc_diep'] || '';
}

export function preloadCoreArtifactIcons() {
  // Static assets are cached by browser
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
