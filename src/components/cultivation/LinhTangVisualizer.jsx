import React, { useState } from 'react';
import { useCultivationContext } from '../../context/CultivationContext';
import { 
  EXP_PER_THIEN_DAO, 
  EXP_PER_DI_TIEN_LUU, 
  THIEN_MENH_PER_THAN_TANG, 
  LIFE_LAMPS 
} from '../../lib/cultivation';
import { getArtifactImageUrl, getLampImageUrl, THAN_PHAM_AI_ICONS, LAMP_THAN_PHAM_AI_ICONS } from '../../lib/artifactIcons';
import godEyeImg from '../../assets/images/bg_god_cosmic_eye.jpg';
import styles from './LinhTangVisualizer.module.css';

// Load toàn bộ ảnh AI tùy chỉnh trong thư mục linh_tang
const customLinhTangImages = import.meta.glob('../../assets/images/linh_tang/*.{jpg,png,webp,jpeg}', { eager: true, import: 'default' });
const userImages = {};
for (const [filepath, mod] of Object.entries(customLinhTangImages)) {
  const filename = filepath.split(/[\/\\]/).pop().split('.')[0].toLowerCase();
  userImages[filename] = mod;
}

const SACRED_GATE_ARTIFACTS = [
  { 
    id: 'am_duong_hon_don_nguyen_can', 
    name: 'Thái Cổ Hỗn Độn Nguyên Căn', 
    artId: 'am_duong_hon_don_nguyen_can', 
    desc: 'Gốc rễ thái sơ hỗn độn đúc thành thế giới nguyên sơ, vạn pháp bất xâm' 
  },
  { 
    id: 'tao_hoa_ngoc_diep', 
    name: 'Huyền Thiên Tạo Hóa Ngọc Điệp', 
    artId: 'tao_hoa_ngoc_diep', 
    desc: 'Mảnh vỡ ngọc điệp ghi chép ba ngàn đại đạo thiên quy, dung dưỡng linh tàng' 
  },
  { 
    id: 'hon_don_diet_the_loi_tri', 
    name: 'Cửu Tiêu Lôi Trì Đài', 
    artId: 'hon_don_diet_the_loi_tri', 
    desc: 'Đài lôi kiếp viễn cổ tích tụ thiên uy diệt thế, tinh luyện nhục thân càn khôn' 
  },
  { 
    id: 'thao_tu_kiem_quyet', 
    name: 'Thảo Tự Trảm Tiên Kiếm Thai', 
    artId: 'thao_tu_kiem_quyet', 
    desc: 'Phôi kiếm sát phạt cực hạn trảm toái hư không quy tắc, vạn kiếp bất diệt' 
  },
  { 
    id: 'luc_dao_luan_hoi_tien_can', 
    name: 'Lục Đạo Luân Hồi Tiên Căn', 
    artId: 'luc_dao_luan_hoi_tien_can', 
    desc: 'Nắm giữ sinh tử luân hồi, chuyển biến sinh mệnh thành bất hủ chi tạng' 
  },
  { 
    id: 'tam_sinh_luan_hoi_an', 
    name: 'Hư Không Trấn Thế Ấn', 
    artId: 'tam_sinh_luan_hoi_an', 
    desc: 'Bảo ấn phong cấm vạn dặm càn khôn, trấn áp căn cơ vững như thái sơn' 
  },
  { 
    id: 'thai_so_than_vuong_the', 
    name: 'Thái Sơ Thần Vương Đỉnh', 
    artId: 'thai_so_than_vuong_the', 
    desc: 'Thần đỉnh viễn cổ tôi luyện huyết nhục, đúc thành Bất Hoại Thần Tàng' 
  },
  { 
    id: 'ngu_hanh_dai_dong_thien', 
    name: 'Ngũ Hành Đại Động Thiên', 
    artId: 'ngu_hanh_dai_dong_thien', 
    desc: 'Sinh hoá ngũ hành âm dương càn khôn, sinh sôi bất tức, tự thành vũ trụ' 
  },
];

function resolveGateArtwork(tang, isThanTang, isGateOpen) {
  if (!tang || !tang.isInitialized) {
    return userImages['gate_uninit'] || THAN_PHAM_AI_ICONS['tam_sinh_luan_hoi_an'] || '';
  }

  if (isGateOpen) {
    const specificKeys = [
      tang.worldKey,
      `world_${tang.id}`,
      `world_${tang.artId}`,
      tang.artId ? `world_${tang.artId.replace(/^art_/, '')}` : null,
      tang.artId,
    ].filter(Boolean);

    for (const key of specificKeys) {
      if (userImages[key]) return userImages[key];
    }

    const nameLower = (tang.name || '').toLowerCase();
    if (nameLower.includes('thời không')) {
      if (userImages['world_thoi_khong']) return userImages['world_thoi_khong'];
      return LAMP_THAN_PHAM_AI_ICONS['khoi_nguyen_thoi_khong'] || '';
    }
    if (nameLower.includes('lôi')) {
      if (userImages['world_loi_tri']) return userImages['world_loi_tri'];
      return THAN_PHAM_AI_ICONS['hon_don_diet_the_loi_tri'] || '';
    }
    if (nameLower.includes('hỗn độn')) {
      if (userImages['world_hon_don']) return userImages['world_hon_don'];
      return THAN_PHAM_AI_ICONS['am_duong_hon_don_nguyen_can'] || '';
    }
    if (nameLower.includes('kiếm')) {
      if (userImages['world_kiem_thai']) return userImages['world_kiem_thai'];
      return THAN_PHAM_AI_ICONS['thao_tu_kiem_quyet'] || '';
    }
    if (nameLower.includes('luân hồi')) {
      if (userImages['world_luan_hoi']) return userImages['world_luan_hoi'];
      return THAN_PHAM_AI_ICONS['luc_dao_luan_hoi_tien_can'] || '';
    }
    if (nameLower.includes('tạo hóa')) {
      if (userImages['world_tao_hoa']) return userImages['world_tao_hoa'];
      return THAN_PHAM_AI_ICONS['tao_hoa_ngoc_diep'] || '';
    }

    if (tang.artId && getArtifactImageUrl(tang.artId)) {
      return getArtifactImageUrl(tang.artId);
    }
    return userImages['world_default'] || THAN_PHAM_AI_ICONS['tao_hoa_ngoc_diep'] || '';
  }

  if (isThanTang) {
    if (userImages['gate_closed_god']) return userImages['gate_closed_god'];
    if (userImages['gate_closed']) return userImages['gate_closed'];
    return THAN_PHAM_AI_ICONS['thuong_thuong_hac_huyet'] || '';
  }

  if (userImages['gate_closed']) return userImages['gate_closed'];
  return THAN_PHAM_AI_ICONS['tam_sinh_luan_hoi_an'] || THAN_PHAM_AI_ICONS['tao_hoa_ngoc_diep'] || '';
}

export default function LinhTangVisualizer() {
  const context = useCultivationContext();
  const {
    cultivation,
    initNextLinhTang,
    feedExpToLinhTang,
    attachThienDaoFromInventory,
    convertBiTangToThanTang,
    toggleDiTienLuu,
    feedDiTienLuuExp,
    assignLampHuyenLo,
    unassignLampHuyenLo,
  } = context;

  const currentRealm = cultivation?.realm || 'truc_co';
  const isActualLinhTang = currentRealm === 'linh_tang';
  const linhTangs = cultivation?.linhTangs || [];
  const totalThienMenh = cultivation?.totalThienMenh || 0;
  const thienDaoPhoiCount = cultivation?.inventoryThienDaoPhoi || 0;

  const [selectedTangId, setSelectedTangId] = useState(null);
  const [initSlotIndex, setInitSlotIndex] = useState(null);

  const absorbedLamps = cultivation?.absorbedLamps || [];
  const assignedHuyenLo = cultivation?.assignedHuyenLo || {};
  const selectedTang = linhTangs.find(t => t.id === selectedTangId);

  const cleanName = (name) => {
    if (!name) return '';
    return name.replace(/^\[|\]$/g, '').trim();
  };

  const handleSelectArtifactForInit = (art) => {
    if (!initSlotIndex) return;
    try {
      if (initNextLinhTang) {
        initNextLinhTang(initSlotIndex, art);
      }
      setInitSlotIndex(null);
    } catch (e) {
      alert(e.message || 'Không thể khai mở Tòa Bí Tàng này.');
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.cosmicBg} />
      <div 
        className={styles.godEyeOverlay} 
        style={{ backgroundImage: `url(${godEyeImg})` }} 
      />
      <div className={styles.astralFloorRing} />

      {/* SÂN KHẤU 5 CỰ TỌA TÀNG MÔN */}
      <div className={styles.pantheonStage}>
        <div className={styles.gatesRow}>
          {Array.from({ length: 5 }).map((_, index) => {
            const slotNum = index + 1;
            const tang = linhTangs.find(t => t.id === slotNum);
            const isCenter = slotNum === 3;

            // 1. CỰ TỌA CHƯA KHAI MỞ
            if (!tang || !tang.isInitialized) {
              const prevTang = linhTangs.find(t => t.id === slotNum - 1);
              const canOpen = prevTang && prevTang.isGateOpen && isActualLinhTang;
              const uninitArt = resolveGateArtwork(null, false, false);

              return (
                <div 
                  key={slotNum} 
                  className={`
                    ${styles.celestialGateEntity} 
                    ${isCenter ? styles.centerGateEntity : ''}
                  `}
                  onClick={() => {
                    if (canOpen) setInitSlotIndex(slotNum);
                  }}
                  title={canOpen ? 'Nhấp để chọn bảo vật khai tạng!' : 'Cần nuôi Tòa trước đạt viên mãn'}
                >
                  <div className={`
                    ${styles.gateArchFrame} 
                    ${styles.gateArchFrameUninit}
                    ${canOpen ? styles.gateArchFrameCanOpen : ''}
                  `}>
                    <div className={styles.portalArtCanvas}>
                      <img 
                        src={uninitArt} 
                        alt="Chưa Khai Mở" 
                        className={styles.portalArtImage}
                        style={{ filter: canOpen ? 'grayscale(40%) brightness(0.6)' : 'grayscale(80%) brightness(0.35)' }}
                      />
                      <div className={styles.artVignetteOverlay} />
                      <div className={styles.closedGateChainsLayer}>
                        <div 
                          className={styles.closedSealingAmulet} 
                          style={{ borderColor: canOpen ? '#38bdf8' : '#64748b', color: canOpen ? '#38bdf8' : '#94a3b8' }}
                        >
                          {canOpen ? '啟' : '封'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={styles.gateLabelBlock}>
                    <div className={styles.gateTierIndex}>TÒA {['I', 'II', 'III', 'IV', 'V'][index]}</div>
                    <div className={`${styles.gateMainName} ${styles.gateMainNameLocked}`}>
                      Chưa Khai Mở
                    </div>
                    <div className={styles.gateBadgesRow}>
                      <span className={`${styles.typePill} ${styles.typePillLocked}`}>
                        {canOpen ? 'SẴN SÀNG' : 'PHONG CẤM'}
                      </span>
                    </div>

                    {canOpen ? (
                      <button 
                        className={styles.pedestalInitBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          setInitSlotIndex(slotNum);
                        }}
                      >
                        + Khai Mở
                      </button>
                    ) : (
                      <div className={styles.stateTextLocked}>[ Hỗn Độn Phong Cấm ]</div>
                    )}
                  </div>
                </div>
              );
            }

            // 2. CỰ TỌA ĐÃ KHAI MỞ
            const isThanTang = tang.type === 'than_tang';
            const isGateOpen = tang.isGateOpen;
            const percentThienDao = Math.min(100, Math.floor(((tang.exp || 0) / (tang.maxExp || EXP_PER_THIEN_DAO)) * 100));
            const hasHuyenLo = Boolean(assignedHuyenLo[tang.id]);
            const assignedLamp = hasHuyenLo ? LIFE_LAMPS.find(l => l.id === assignedHuyenLo[tang.id]) : null;
            const gateArtUrl = resolveGateArtwork(tang, isThanTang, isGateOpen);

            return (
              <div 
                key={slotNum} 
                className={`
                  ${styles.celestialGateEntity} 
                  ${isCenter ? styles.centerGateEntity : ''}
                  ${selectedTangId === tang.id ? styles.selectedGateEntity : ''}
                `}
                onClick={() => setSelectedTangId(tang.id)}
                title="Nhấp để vào Tế Đàn quản lý"
              >
                {/* VÒM CỔNG TRỜI VĨ ĐẠI */}
                <div className={`
                  ${styles.gateArchFrame} 
                  ${isThanTang ? (tang.isThanLinhThai ? styles.gateArchFrameThanThai : styles.gateArchFrameThanTang) : ''}
                `}>
                  {/* CANVAS BỨC TRANH AI TRONG LÒNG CỔNG (TRONG TRẺO, KHÔNG BỊ ĐÈ EMOJI VƯƠNG MIỆN HAY VÒNG ĐỨT) */}
                  <div className={styles.portalArtCanvas}>
                    <img 
                      src={gateArtUrl} 
                      alt={tang.name} 
                      className={styles.portalArtImage} 
                    />
                    <div className={isThanTang ? styles.artVignetteOverlayThanTang : styles.artVignetteOverlay} />

                    {/* NẾU CỔNG ĐÓNG (DƯỠNG ĐẠO) */}
                    {!isGateOpen && (
                      <div className={styles.closedGateChainsLayer}>
                        <div className={`${styles.closedSealingAmulet} ${isThanTang ? styles.closedSealingAmuletThanTang : ''}`}>
                          {isThanTang ? '神' : '道'}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* CỔ ĐỈNH THẦN HỎA LÔ (THIẾT KẾ ĐỈNH ĐỒNG 3 CHÂN UY LỰC, BỎ DÒNG +20%) */}
                  {hasHuyenLo && (
                    <div className={styles.sacredFurnacePedestal} title={`Hỏa Lò: ${assignedLamp?.name}`}>
                      <div className={styles.cauldronFlame}>
                        <div className={styles.flameOuter} />
                        <div className={styles.flameCore} />
                      </div>
                      <div className={styles.ancientCauldron}>
                        <div className={styles.cauldronHandleLeft} />
                        <div className={styles.cauldronHandleRight} />
                        <div className={styles.cauldronBody} />
                        <div className={styles.cauldronLegs}>
                          <span className={styles.leg} />
                          <span className={styles.legCenter} />
                          <span className={styles.leg} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* THÔNG TIN CHÂN BỆ ĐÁ (TINH GIẢN, KHÔNG CẮT CHỮ, KHÔNG EMOJI) */}
                <div className={styles.gateLabelBlock}>
                  <div className={styles.gateTierIndex}>TÒA {['I', 'II', 'III', 'IV', 'V'][index]}</div>
                  
                  <div 
                    className={`${styles.gateMainName} ${isThanTang ? styles.gateMainNameGold : ''}`}
                    title={cleanName(tang.name)}
                  >
                    {cleanName(tang.name)}
                  </div>

                  {/* 1 HUY HIỆU DUY NHẤT CÂN ĐỐI */}
                  <div className={styles.gateBadgesRow}>
                    {isThanTang ? (
                      tang.isThanLinhThai ? (
                        <span className={styles.typePillThanThai}>
                          THẦN TÀNG · THẦN THÁI
                        </span>
                      ) : (
                        <span className={styles.typePillThanTang}>
                          THẦN TÀNG
                        </span>
                      )
                    ) : (
                      <span className={styles.typePillBiTang}>
                        BÍ TÀNG
                      </span>
                    )}
                  </div>

                  {/* NẾU CHƯA VIÊN MÃN THÌ HIỆN TIẾN ĐỘ DƯỠNG ĐẠO */}
                  {!isGateOpen && (
                    <>
                      <div className={styles.stateTextProgress}>
                        Dưỡng Đạo: {percentThienDao}%
                      </div>
                      <div className={styles.pedestalProgressTrack}>
                        <div 
                          className={`${styles.pedestalProgressBar} ${isThanTang ? styles.pedestalProgressBarGold : ''}`}
                          style={{ width: `${percentThienDao}%` }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL 1: CHỌN BẢO VẬT CỔ ĐẠI KHAI TẠNG */}
      {initSlotIndex && (
        <div className={styles.modalOverlay} onClick={() => setInitSlotIndex(null)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>
                  🏛️ Khai Mở Cự Tọa Thứ {['Nhất', 'Nhị', 'Tam', 'Tứ', 'Ngũ'][initSlotIndex - 1]} · Định Phôi Thế Giới
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#94a3b8' }}>
                  Chọn một bảo vật thần cấp viễn cổ để đúc thành phôi thai linh tàng:
                </p>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setInitSlotIndex(null)}>✕</button>
            </div>

            <div className={styles.artifactGrid}>
              {SACRED_GATE_ARTIFACTS.map(art => {
                const imgUrl = getArtifactImageUrl(art.artId);
                return (
                  <div 
                    key={art.id} 
                    className={styles.artifactCard}
                    onClick={() => handleSelectArtifactForInit(art)}
                  >
                    <img src={imgUrl} alt={art.name} className={styles.artifactThumb} />
                    <div className={styles.artifactCardName}>{art.name}</div>
                    <div className={styles.artifactCardDesc}>{art.desc}</div>
                    <button className={styles.primaryBtn} style={{ marginTop: 8, width: '100%', fontSize: 11 }}>
                      Khai Mở Tòa Này
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: TẾ ĐÀN QUẢN LÝ CHI TIẾT TÀNG MÔN */}
      {selectedTang && (
        <div className={styles.modalOverlay} onClick={() => setSelectedTangId(null)}>
          <div 
            className={`${styles.modalCard} ${selectedTang.type === 'than_tang' ? styles.modalCardThanTang : ''}`}
            onClick={e => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>
                  {cleanName(selectedTang.name)} (Tòa Thứ {selectedTang.id})
                </h3>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <span className={`${styles.typePill} ${selectedTang.type === 'than_tang' ? styles.typePillThanTang : styles.typePillBiTang}`}>
                    {selectedTang.type === 'than_tang' ? 'THẦN TU · THẦN TÀNG' : 'TIÊN TU · BÍ TÀNG'}
                  </span>
                  {selectedTang.isGateOpen && (
                    <span className={`${styles.typePill} ${styles.typePillBiTang}`} style={{ borderColor: '#4ade80', color: '#4ade80' }}>
                      CỔNG ĐÃ KHAI MỞ
                    </span>
                  )}
                  {selectedTang.isThanLinhThai && (
                    <span className={styles.typePillThanThai}>
                      THẦN LINH THÁI
                    </span>
                  )}
                </div>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setSelectedTangId(null)}>✕</button>
            </div>

            {/* PHẦN 1: THIÊN ĐẠO & DƯỠNG ĐẠO */}
            <div className={`${styles.altarSection} ${selectedTang.type === 'than_tang' ? styles.altarSectionThanTang : ''}`}>
              <div className={`${styles.altarSectionTitle} ${selectedTang.type === 'than_tang' ? styles.altarSectionTitleGold : ''}`}>
                <span>🌟 Thiên Đạo Trấn Tạng & Khai Mở Tàng Môn</span>
              </div>

              {selectedTang.isGateOpen ? (
                <div style={{ color: '#4ade80', fontSize: 13, fontWeight: 700, padding: '6px 0' }}>
                  ✓ ĐÃ VIÊN MÃN: Cánh cổng thế giới đã khai mở hoàn toàn, trấn ngự bởi [{selectedTang.thienDaoName || 'Thiên Đạo'}].
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 8px 0' }}>
                    Tích lũy Tu Vi Dưỡng Đạo để ủ Thiên Đạo phôi thai:
                  </p>

                  <div className={styles.pedestalProgressTrack} style={{ width: '100%', height: 8 }}>
                    <div 
                      className={`${styles.pedestalProgressBar} ${selectedTang.type === 'than_tang' ? styles.pedestalProgressBarGold : ''}`}
                      style={{ width: `${Math.min(100, Math.floor(((selectedTang.exp || 0) / (selectedTang.maxExp || EXP_PER_THIEN_DAO)) * 100))}%` }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    <span>Tiến độ: {Math.min(100, Math.floor(((selectedTang.exp || 0) / (selectedTang.maxExp || EXP_PER_THIEN_DAO)) * 100))}%</span>
                    <span>{(selectedTang.exp || 0).toLocaleString()} / {(selectedTang.maxExp || EXP_PER_THIEN_DAO).toLocaleString()} EXP</span>
                  </div>

                  <div className={styles.altarActionRow}>
                    <button 
                      className={styles.primaryBtn}
                      onClick={() => feedExpToLinhTang(selectedTang.id, 5000)}
                    >
                      + Nạp 5.000 Tu Vi Dưỡng Đạo
                    </button>

                    <button 
                      className={styles.primaryBtn}
                      onClick={() => feedExpToLinhTang(selectedTang.id, selectedTang.maxExp || EXP_PER_THIEN_DAO)}
                    >
                      ⚡ Nạp Đầy Thiên Đạo
                    </button>

                    {thienDaoPhoiCount > 0 && (
                      <button 
                        className={styles.goldBtn}
                        onClick={() => attachThienDaoFromInventory(selectedTang.id)}
                      >
                        🌌 Khảm Nạp 1 Thiên Đạo Phôi (Mở Cổng Tức Thì)
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* PHẦN 2: HỎA LÒ MỆNH ĐĂNG */}
            <div className={`${styles.altarSection} ${selectedTang.type === 'than_tang' ? styles.altarSectionThanTang : ''}`}>
              <div className={`${styles.altarSectionTitle} ${styles.altarSectionTitleGold}`}>
                <span>🔥 Hỏa Lò Mệnh Đăng (+20% Tốc Độ Dưỡng Đạo)</span>
              </div>

              {assignedHuyenLo[selectedTang.id] ? (
                <div>
                  <p style={{ fontSize: 13, color: '#fed7aa', margin: '4px 0 10px 0' }}>
                    Đang nung đốt bởi Hỏa Lò: <strong>{LIFE_LAMPS.find(l => l.id === assignedHuyenLo[selectedTang.id])?.name}</strong>
                  </p>
                  <button 
                    className={styles.dangerBtn}
                    onClick={() => unassignLampHuyenLo(selectedTang.id)}
                  >
                    Tháo Hỏa Lò
                  </button>
                </div>
              ) : (
                <div>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 8px 0' }}>
                    Ghép một Mệnh Đăng đã hấp thụ để hóa thành Hỏa Lò nung nấu Bí Tàng:
                  </p>
                  
                  {absorbedLamps.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                      Chưa hấp thụ Mệnh Đăng nào để hóa Hỏa Lò.
                    </div>
                  ) : (
                    <div className={styles.lampPickerGrid}>
                      {absorbedLamps.map(lId => {
                        const lamp = LIFE_LAMPS.find(l => l.id === lId);
                        const isUsedElsewhere = Object.entries(assignedHuyenLo).some(([tId, id]) => id === lId && Number(tId) !== selectedTang.id);
                        if (isUsedElsewhere) return null;

                        const lampThumb = getLampImageUrl(lId);

                        return (
                          <button 
                            key={lId}
                            className={styles.lampPickerBtn}
                            onClick={() => assignLampHuyenLo(selectedTang.id, lId)}
                          >
                            <img src={lampThumb} alt={lamp?.name} className={styles.lampPickerThumb} />
                            <span>🔥 Ghép {lamp?.shortName || lamp?.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* PHẦN 3: BỒI DƯỠNG THẦN HUYẾT NHỤC */}
            {selectedTang.type !== 'than_tang' && (
              <div className={styles.altarSection}>
                <div className={`${styles.altarSectionTitle} ${styles.altarSectionTitleGold}`}>
                  <span>🩸 Bồi Dưỡng Thần Huyết Nhục (Chuyển Hóa Thần Tàng)</span>
                </div>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 10px 0' }}>
                  Tiêu hao <strong>{THIEN_MENH_PER_THAN_TANG.toLocaleString()} Lực Thiên Mệnh</strong> để nạp Thần Huyết Nhục. Toàn bộ bảo vật sẽ đồng hóa thành Thần Khí, chuyển hóa vĩnh viễn thành Thần Tàng:
                </p>
                <button 
                  className={`${styles.goldBtn} ${(totalThienMenh || 0) < THIEN_MENH_PER_THAN_TANG ? styles.disabledBtn : ''}`}
                  disabled={(totalThienMenh || 0) < THIEN_MENH_PER_THAN_TANG}
                  onClick={() => {
                    try {
                      convertBiTangToThanTang(selectedTang.id);
                    } catch (e) {
                      alert(e.message);
                    }
                  }}
                >
                  {(totalThienMenh || 0) >= THIEN_MENH_PER_THAN_TANG 
                    ? `🩸 Nạp Thần Huyết Nhục (-${THIEN_MENH_PER_THAN_TANG.toLocaleString()} TM)` 
                    : `🔒 Cần ${THIEN_MENH_PER_THAN_TANG.toLocaleString()} TM (Hiện có: ${(totalThienMenh || 0).toLocaleString()})`}
                </button>
              </div>
            )}

            {/* PHẦN 4: DỊ TIÊN LƯU & THẦN LINH THÁI */}
            {selectedTang.type === 'than_tang' && (
              <div className={`${styles.altarSection} ${selectedTang.type === 'than_tang' ? styles.altarSectionThanTang : ''}`}>
                <div className={`${styles.altarSectionTitle} ${styles.altarSectionTitleGold}`}>
                  <span>🔮 Dị Tiên Lưu · Dệt Hồn Ti Thần Linh Thái</span>
                </div>

                {selectedTang.isThanLinhThai ? (
                  <div style={{ color: '#fbbf24', fontSize: 13, fontWeight: 800, padding: '4px 0' }}>
                    👑 ĐÃ GIẢI PHÓNG THẦN LINH THÁI THƯỜNG TRỰC! Thần uy hiển hiện sau lưng, chiến lực tiệm cận Quy Hư.
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: 12, color: '#94a3b8', margin: '4px 0 10px 0' }}>
                      Bật Dị Tiên Lưu để Tu Vi đọc sách tự động tích lũy dệt Hồn Ti (Cần <strong>{EXP_PER_DI_TIEN_LUU.toLocaleString()} EXP</strong>):
                    </p>

                    <div className={styles.altarActionRow}>
                      <button 
                        className={selectedTang.isNurturingDiTienLuu ? styles.dangerBtn : styles.primaryBtn}
                        onClick={() => toggleDiTienLuu(selectedTang.id)}
                      >
                        {selectedTang.isNurturingDiTienLuu ? '⏸ Tạm Dừng Dị Tiên Lưu' : '▶ Bật Tích Lũy Dị Tiên Lưu'}
                      </button>

                      <button 
                        className={styles.goldBtn}
                        onClick={() => feedDiTienLuuExp(selectedTang.id, EXP_PER_DI_TIEN_LUU)}
                      >
                        ⚡ Hoàn Tất Thần Linh Thái Ngay
                      </button>
                    </div>

                    <div className={styles.pedestalProgressTrack} style={{ width: '100%', height: 8, marginTop: 12 }}>
                      <div 
                        className={`${styles.pedestalProgressBar} ${styles.pedestalProgressBarGold}`} 
                        style={{ width: `${Math.min(100, Math.floor(((selectedTang.diTienLuuExp || 0) / (selectedTang.maxDiTienLuuExp || EXP_PER_DI_TIEN_LUU)) * 100))}%` }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                      <span>Tiến độ Hồn Ti: {Math.min(100, Math.floor(((selectedTang.diTienLuuExp || 0) / (selectedTang.maxDiTienLuuExp || EXP_PER_DI_TIEN_LUU)) * 100))}%</span>
                      <span>{(selectedTang.diTienLuuExp || 0).toLocaleString()} / {(selectedTang.maxDiTienLuuExp || EXP_PER_DI_TIEN_LUU).toLocaleString()} EXP</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
