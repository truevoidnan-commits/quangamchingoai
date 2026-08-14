// =========================================================================
// ARTIFACT ICON MAPPING
// Maps artifact IDs & life lamp IDs to their custom icon sources.
// =========================================================================

const baseUrl = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') + '/';

/** Map of all 16 Thần Phẩm artifact IDs to AI-generated PNG/JPG icons */
export const THAN_PHAM_AI_ICONS = {
  hong_mong_khi:      baseUrl + 'icons/than_pham/hong_mong_tu_khi.jpg',
  van_menh_chau:      baseUrl + 'icons/than_pham/van_menh_chau.jpg',
  hon_don_so_khai:    baseUrl + 'icons/than_pham/hon_don_so_khai.jpg',
  ngoc_diep:          baseUrl + 'icons/than_pham/ngoc_diep.jpg',
  bat_hu_dinh:        baseUrl + 'icons/than_pham/bat_hu_dinh.jpg',
  thien_dao_an:       baseUrl + 'icons/than_pham/so_tam_quyet.jpg',
  hu_vo_ban_nguyen:   baseUrl + 'icons/than_pham/hu_vo_tich_diet.jpg',
  khoi_nguyen_moc:    baseUrl + 'icons/than_pham/the_gioi_moc.jpg',
  luan_hoi_ban:       baseUrl + 'icons/than_pham/luan_hoi_chan_kinh.jpg',
  tuc_menh_toa:       baseUrl + 'icons/than_pham/tuc_menh_toa.jpg',
  thuong_thuong_kiem: baseUrl + 'icons/than_pham/phat_thien_kiem.jpg',
  dai_la_chuong:      baseUrl + 'icons/than_pham/thien_cuong_chuong.jpg',
  thoi_khong_chau:    baseUrl + 'icons/than_pham/thoi_khong_chau.jpg',
  van_co_long_to:     baseUrl + 'icons/than_pham/van_co_long_to.jpg',
  sang_the_quang:     baseUrl + 'icons/than_pham/sang_the_quang.jpg',
  dai_dao_tieu_dao:  baseUrl + 'icons/than_pham/tieu_dao_thien.jpg',
};

/** Map of Thần Phẩm Life Lamp IDs to AI-generated icons */
export const LAMP_THAN_PHAM_AI_ICONS = {
  tan_tien_phe_than:   baseUrl + 'icons/than_pham/lamp_tan_tien_phe_than.jpg',
  sang_the_ban_nguyen: baseUrl + 'icons/than_pham/lamp_sang_the_ban_nguyen.jpg',
  hon_don_so_khai:     baseUrl + 'icons/than_pham/lamp_hon_don_so_khai.jpg',
  hong_mong_bat_diet:   baseUrl + 'icons/than_pham/lamp_hong_mong_bat_diet.jpg',
  cuu_chuyen_luan_hoi:  baseUrl + 'icons/than_pham/lamp_cuu_chuyen_luan_hoi.jpg',
  thien_dao_trung_phat: baseUrl + 'icons/than_pham/lamp_thien_dao_trung_phat.jpg',
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
