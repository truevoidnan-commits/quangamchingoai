// =========================================================================
// ARTIFACT ICON MAPPING
// Native Vite-bundled image resolution for zero-delay loading & perfect CDN caching.
// =========================================================================

const iconModules = import.meta.glob('../assets/icons/than_pham/*.jpg', { eager: true, import: 'default' });
const bundledIcons = {};

for (const [filepath, mod] of Object.entries(iconModules)) {
  const filename = filepath.split(/[\/\\]/).pop().split('.')[0];
  bundledIcons[filename] = mod;
}

/** Map of all Thần Phẩm artifact IDs to bundled JPG icons */
export const THAN_PHAM_AI_ICONS = {
  tao_hoa_ngoc_diep:            bundledIcons['art_tao_hoa_ngoc_diep'],
  kim_o_luyen_van_linh:         bundledIcons['art_kim_o_luyen_van_linh'],
  nguyen_thuy_thai_so_ma_kinh:  bundledIcons['art_nguyen_thuy_thai_so_ma_kinh'],
  dao_menh_thien_ma_cong:       bundledIcons['art_dao_menh_thien_ma_cong'],
  ngu_hanh_dai_dong_thien:      bundledIcons['art_ngu_hanh_dai_dong_thien'],
  mac_sat_tien_phach:           bundledIcons['art_mac_sat_tien_phach'],
  huyen_hoang_diet_the_bien:    bundledIcons['art_huyen_hoang_diet_the_bien'],
  am_duong_hon_don_nguyen_can:  bundledIcons['art_am_duong_hon_don_nguyen_can'],
  luc_dao_luan_hoi_tien_can:    bundledIcons['art_luc_dao_luan_hoi_tien_can'],
  tam_sinh_luan_hoi_an:         bundledIcons['art_tam_sinh_luan_hoi_an'],
  tran_nguc_minh_vuong_the:     bundledIcons['art_tran_nguc_minh_vuong_the'],
  thai_so_than_vuong_the:       bundledIcons['art_thai_so_than_vuong_the'],
  tien_thien_thanh_the_dao_thai: bundledIcons['art_tien_thien_thanh_the_dao_thai'],
  hon_don_diet_the_loi_tri:     bundledIcons['art_hon_don_diet_the_loi_tri'],
  khoi_nguyen_vu_tru_ban_nguyen: bundledIcons['art_khoi_nguyen_vu_tru_ban_nguyen'],
  tha_hoa_tu_tai_dai_phap:      bundledIcons['art_tha_hoa_tu_tai_dai_phap'],
  tieu_tuc_menh_thuat:          bundledIcons['art_tieu_tuc_menh_thuat'],
  con_bang_tien_phap:           bundledIcons['art_con_bang_tien_phap'],
  can_khon_luong_nghi_ho:       bundledIcons['art_can_khon_luong_nghi_ho'],
  cuu_kiep_loi_nguc_kiem_phap:  bundledIcons['art_cuu_kiep_loi_nguc_kiem_phap'],
  van_de_tran_ma_quyen:         bundledIcons['art_van_de_tran_ma_quyen'],
  nhat_khi_hoa_tam_thanh:       bundledIcons['art_nhat_khi_hoa_tam_thanh'],
  vo_thuy_vo_chung_vo_vi_than:  bundledIcons['art_vo_thuy_vo_chung_vo_vi_than'],
  diet_the_loi_viem_dong:       bundledIcons['art_diet_the_loi_viem_dong'],
};

/** Map of Thần Phẩm Life Lamp IDs to bundled JPG icons (18 Chí Tôn Mệnh Đăng) */
export const LAMP_THAN_PHAM_AI_ICONS = {
  nguyen_thuy_thien_ma:         bundledIcons['lamp_nguyen_thuy_thien_ma'],
  hon_don_so_khai:              bundledIcons['lamp_hon_don_so_khai'],
  hong_mong_bat_diet:           bundledIcons['lamp_hong_mong_bat_diet'],
  cuu_chuyen_luan_hoi:          bundledIcons['lamp_cuu_chuyen_luan_hoi'],
  thuong_thuong_loi_kiep:       bundledIcons['lamp_thuong_thuong_loi_kiep'],
  sang_the_ban_nguyen:          bundledIcons['lamp_sang_the_ban_nguyen'],
  van_menh_hu_vo:               bundledIcons['lamp_van_menh_hu_vo'],
  tuc_menh_nhan_qua:            bundledIcons['lamp_tuc_menh_nhan_qua'],
  thai_co_than_long:            bundledIcons['lamp_thai_co_than_long'],
  khoi_nguyen_thoi_khong:       bundledIcons['lamp_khoi_nguyen_thoi_khong'],
  van_gioi_quy_nhat:            bundledIcons['lamp_van_gioi_quy_nhat'],
  toi_cao_thien_menh:           bundledIcons['lamp_toi_cao_thien_menh'],
  cuu_khieu_linh_lung:          bundledIcons['lamp_cuu_khieu_linh_lung'],
  thien_dao_chi_ton:            bundledIcons['lamp_thien_dao_chi_ton'],
  nguyen_gioi_hon_co:           bundledIcons['lamp_nguyen_gioi_hon_co'],
  cam_ky_cuc_dao:               bundledIcons['lamp_cam_ky_cuc_dao'],
  dao_tam_chung_ma:             bundledIcons['lamp_dao_tam_chung_ma'],
  tan_tien_phe_than:            bundledIcons['lamp_tan_tien_phe_than'],
};

export function getLampImageUrl(lampId) {
  return LAMP_THAN_PHAM_AI_ICONS[lampId] || bundledIcons['lamp_tan_tien_phe_than'] || '';
}

export function getArtifactImageUrl(artId) {
  return THAN_PHAM_AI_ICONS[artId] || bundledIcons['art_tao_hoa_ngoc_diep'] || '';
}

/** Preload all 42 core Thần Phẩm icons into browser memory for instant 0ms rendering */
let _hasPreloaded = false;
export function preloadCoreArtifactIcons() {
  if (typeof window === 'undefined' || _hasPreloaded) return;
  _hasPreloaded = true;

  const runner = () => {
    const urls = [
      ...Object.values(LAMP_THAN_PHAM_AI_ICONS),
      ...Object.values(THAN_PHAM_AI_ICONS),
    ].filter(Boolean);
    
    urls.forEach(url => {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
    });
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(runner, { timeout: 1000 });
  } else {
    setTimeout(runner, 100);
  }
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
