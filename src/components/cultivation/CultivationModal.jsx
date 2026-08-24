import { useState } from 'react';
import BottomSheet from '../ui/BottomSheet';
import { useCultivation } from '../../hooks/useCultivation';
import { calculateDaoAnhTribulationReward, getDaoAnhTierKey, KIEP_EXP_REQUIREMENTS } from '../../lib/cultivation';
import RealmPreviewVisualizer from './RealmPreviewVisualizer';
import BreakthroughModal from './BreakthroughModal';
import TribulationModal from './TribulationModal';
import ArtifactIcon from './ArtifactIcon';
import styles from './CultivationModal.module.css';

export default function CultivationModal({ isOpen, onClose }) {
  const {
    cultivation,
    displayName,
    combatPowerDisplay,
    absorbLamp,
    burnExpForLamp,
    sellLamp,
    anchorPalace,
    sellArtifact,
    buyArtifact,
    activateKimDanTrialV2,
    endKimDanTrialV2,
    thangCung,
    getLampPalaceName,
    getPalaceNameFromArtifact,
    getPalaceElementTheme,
    getDaoAnhTheme,
    formatDaoAnhTitle,
    breakthroughToTrucCo,
    breakthroughToKimDan,
    attemptUnlock121,
    manifestDaoAnh,
    injectExpToDaoAnh,
    injectThienMenh,
    attemptTribulationSingle,
    attemptTribulationAll,
    fillAllDaoAnhThienMenh,
    resetCultivation,
    LIFE_LAMPS,
    SUPPRESSING_ARTIFACTS,
    LAMP_TIERS,
    constants,
  } = useCultivation();

  const [activeTab, setActiveTab] = useState('status'); // 'status' | 'lamps' | 'artifacts' | 'nguyen_anh' | 'rules' | 'logs'
  const [tierFilter, setTierFilter] = useState('all');
  const [artifactTierFilter, setArtifactTierFilter] = useState('all');
  const [anchorModalPalace, setAnchorModalPalace] = useState(null);
  const [actionMsg, setActionMsg] = useState('');
  const [breakthroughData, setBreakthroughData] = useState(null);
  const [tribulationModalData, setTribulationModalData] = useState(null);

  const handleSingleTribulation = (daoAnhId) => {
    try {
      const res = attemptTribulationSingle(daoAnhId);
      if (res) {
        setTribulationModalData(res);
      }
    } catch (err) {
      alert(err.message || 'Không thể độ kiếp.');
    }
  };

  const handleAllTribulation = () => {
    try {
      const res = attemptTribulationAll();
      if (res) {
        setTribulationModalData({
          isSuccess: res.successCount > 0,
          tribulationName: 'Vạn Kiếp Tề Phi (Toàn Bộ Đạo Anh)',
          daoAnhName: `Toàn Bộ ${cultivation.daoAnhs?.length || 0} Đạo Anh`,
          element: 'Thiên Cơ Lôi Kiếp',
          message: res.resultMsg,
          successChance: 100,
        });
      }
    } catch (err) {
      alert(err.message || 'Không thể vạn kiếp tề phi.');
    }
  };

  const triggerAction = (fn, successMsg, customBreakthrough) => {
    try {
      const res = fn();
      const msg = (res && (res.message || res.resultMsg)) || successMsg;
      if (msg) {
        setActionMsg(msg);
        setTimeout(() => setActionMsg(''), 5000);

        if (customBreakthrough || (msg && (msg.includes('thành công') || msg.includes('kích hoạt') || msg.includes('Đột phá')))) {
          setBreakthroughData(customBreakthrough || {
            title: msg.includes('Trúc Cơ') ? 'ĐỘT PHÁ TRÚC CƠ CẢNH!' : msg.includes('Kim Đan') ? 'ĐỘT PHÁ KIM ĐAN CẢNH!' : 'ĐỘT PHÁ CẢNH GIỚI!',
            subtitle: msg,
            icon: msg.includes('Trúc Cơ') ? '🔥' : msg.includes('Kim Đan') ? '✨' : msg.includes('Nguyện Anh') ? '👑' : '⚡',
            cpStr: combatPowerDisplay,
          });
        }
      }
    } catch (err) {
      alert(err.message || 'Chưa đủ điều kiện.');
    }
  };

  const selfHoa = cultivation.selfMenhHoa || Math.floor(cultivation.phapKhieu / 30);
  const absorbedCount = (cultivation.absorbedLamps || []).length;
  const artifactCount = (cultivation.inventoryArtifacts || []).length;
  const isNguyenAnhStage = cultivation.realm === 'gia_anh' || cultivation.realm === 'nguyen_anh';
  const isStrictNguyenAnh = cultivation.realm === 'nguyen_anh';
  const currentTienTinh = cultivation.tienTinh !== undefined ? cultivation.tienTinh : (cultivation.dangDiem || 0);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="✦ ĐẠO LỘ TU TIÊN ✦" fullHeight>
      <div className={styles.container}>
        {/* BANNER THỬ NGHIỆM KIM ĐAN V2 VỚI NÚT KẾT THÚC THỬ NGHIỆM */}
        {cultivation.isKimDanTrialV2 && (
          <div style={{
            marginBottom: 12,
            padding: '8px 12px',
            background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.25), rgba(249, 115, 22, 0.25))',
            border: '1px solid rgba(239, 68, 68, 0.6)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>🧪</span>
              <div>
                <div style={{ fontSize: 11.5, color: '#f87171', fontWeight: 700 }}>ĐANG TRẢI NGHIỆM KIM ĐAN V2</div>
                <div style={{ fontSize: 9.5, color: 'var(--text-secondary)' }}>Thẻ đã kích hoạt 1 lần duy nhất · Bấm Kết Thúc để khôi phục Tu Vi ban đầu</div>
              </div>
            </div>
            <button
              className="btn-ghost"
              style={{
                fontSize: 10.5,
                padding: '4px 10px',
                color: '#f87171',
                borderColor: 'rgba(248, 113, 113, 0.6)',
                background: 'rgba(239, 68, 68, 0.15)',
                fontWeight: 700,
              }}
              onClick={() => {
                if (confirm('❌ BẠN CÓ CHẮC CHẮN MUỐN KẾT THÚC THỬ NGHIỆM?\n\n• Thẻ thử nghiệm sẽ tiêu biến vĩnh viễn.\n• Tu Vi và cảnh giới sẽ được khôi phục về trạng thái trước khi dùng thẻ.')) {
                  triggerAction(endKimDanTrialV2, 'Đã kết thúc chế độ Thử Nghiệm Kim Đan.');
                }
              }}
            >
              ❌ Kết Thúc Thử Nghiệm
            </button>
          </div>
        )}

        {/* Realm Hero Card with Dedicated Visual Animation */}
        <div className={styles.realmHeroCard}>
          <div className={styles.realmGlowCircle} />

          <div className={styles.realmBadge}>
            {cultivation.realm === 'ngung_khi' && 'CẢNH GIỚI: NGƯNG KHÍ'}
            {cultivation.realm === 'truc_co' && 'CẢNH GIỚI: TRÚC CƠ'}
            {cultivation.realm === 'kim_dan' && 'CẢNH GIỚI: KIM ĐAN'}
            {cultivation.realm === 'gia_anh' && 'CẢNH GIỚI: GIẢ ANH'}
            {cultivation.realm === 'nguyen_anh' && 'CẢNH GIỚI: NGUYÊN ANH'}
          </div>

          <h2 className={styles.realmTitle}>{displayName}</h2>

          {/* REALM-SPECIFIC ANIMATED VISUALIZER (FULL-BLEED SEAMLESS) */}
          <div className={styles.realmVisualizerWrapper}>
            <RealmPreviewVisualizer
              cultivation={{
                ...cultivation,
                targetPalaceExp: constants.getPalaceCost ? constants.getPalaceCost((cultivation.realizedThienCung || 0) + 1) : 2000,
              }}
              onSetAnchorModalPalace={(sIdx) => setAnchorModalPalace(sIdx)}
              onThangCung={() => triggerAction(thangCung)}
              onManifestDaoAnh={(palaceIdx) => triggerAction(() => manifestDaoAnh(palaceIdx))}
              onInjectExpToDaoAnh={(palaceIdx, amount) => triggerAction(() => injectExpToDaoAnh(palaceIdx, amount))}
              onInjectThienMenh={(id, amount) => triggerAction(() => injectThienMenh(id, amount))}
            />
          </div>

          <div className={styles.statsRow}>
            <div className={styles.statBox}>
              <span className={styles.statLabel}>Chương đã đọc</span>
              <span className={styles.statVal}>{cultivation.chaptersReadCount}</span>
            </div>
            {isNguyenAnhStage ? (
              <div className={styles.statBox}>
                <span className={styles.statLabel}>Lực Thiên Mệnh</span>
                <span className={styles.statValGold}>{(cultivation.totalThienMenh || 0).toLocaleString()} TM</span>
              </div>
            ) : (
              <>
                <div className={styles.statBox}>
                  <span className={styles.statLabel}>Số dư Tiên Tinh</span>
                  <span className={styles.statValCyan}>{currentTienTinh.toLocaleString()} TT</span>
                </div>
                <div className={styles.statBox}>
                  <span className={styles.statLabel}>Chiến Lực</span>
                  <span className={styles.statValGold}>{combatPowerDisplay}</span>
                </div>
                <div className={styles.statBox}>
                  <span className={styles.statLabel}>Tu Vi</span>
                  <span className={styles.statValCyan}>{(cultivation.totalExp || 0).toLocaleString()} Tu Vi</span>
                </div>
              </>
            )}
            {isNguyenAnhStage && (
              <div className={styles.statBox}>
                <span className={styles.statLabel}>Chiến Lực</span>
                <span className={styles.statValGold}>{combatPowerDisplay}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tab navigation */}
        <div className={styles.tabRow}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'status' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('status')}
          >
            Cảnh Giới
          </button>
          {!isStrictNguyenAnh && (
            <>
              <button
                className={`${styles.tabBtn} ${activeTab === 'lamps' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('lamps')}
              >
                Mệnh Đăng ({absorbedCount} Đã Hấp Thụ)
              </button>
              <button
                className={`${styles.tabBtn} ${activeTab === 'artifacts' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('artifacts')}
              >
                Trấn Cung Vật ({artifactCount})
              </button>
            </>
          )}
          {isNguyenAnhStage && (
            <button
              className={`${styles.tabBtn} ${activeTab === 'nguyen_anh' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('nguyen_anh')}
            >
              ⚡ Độ Kiếp Đài
            </button>
          )}
          <button
            className={`${styles.tabBtn} ${activeTab === 'rules' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('rules')}
          >
            Quy Tắc
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'logs' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            Nhật Ký ({cultivation.logs.length})
          </button>
        </div>

        {actionMsg && (
          <div className={styles.actionNotice}>
            ✨ {actionMsg}
          </div>
        )}

        {/* ========================================================
            TAB 1: TIẾN ĐỘ CẢNH GIỚI (STATUS)
           ======================================================== */}
        {activeTab === 'status' && (
          <div className={styles.statusSection}>

            {/* THẺ TRẢI NGHIỆM KIM ĐAN (1 lần duy nhất – tiêu biến ngay khi dùng) */}
            {!cultivation.hasUsedKimDanTrialV2 && (
              <div
                className={styles.trialCardOffer}
                style={{ borderColor: 'rgba(255,204,0,0.5)', boxShadow: '0 0 14px rgba(255,204,0,0.2)', marginBottom: 12 }}
              >
                <div className={styles.trialCardOfferInfo}>
                  <span className={styles.trialOfferIcon}>🏮</span>
                  <div>
                    <h4 style={{ color: '#ffcc00', margin: 0, fontSize: 13 }}>THẺ TRẢI NGHIỆM KIM ĐAN (1 LẦN DUY NHẤT · TIÊU BIẾN NGAY)</h4>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                      Thiết lập trạng thái <strong>Trúc Cơ 4 Mệnh Hỏa · 120 Pháp Khiếu (121 thất bại) · 4 Mệnh Đăng ngẫu nhiên</strong>.
                      Tự tay đột phá Kim Đan, thử khảm nạm Vật Trấn Áp và đặt tên Cung với nút <strong>Thăng Cung</strong>.
                    </p>
                  </div>
                </div>
                <button
                  className="btn-gold"
                  style={{ fontSize: 11.5, padding: '7px 14px', fontWeight: 700, flexShrink: 0 }}
                  onClick={() => {
                    if (confirm('KÍCH HOẠT THẺ TRẢI NGHIỆM KIM ĐAN:\n\n• Trạng thái hiện tại sẽ bị XÓA SẠCH và thay bằng:\n  – Trúc Cơ 4 Mệnh Hỏa, 120 Pháp Khiếu (121 thất bại)\n  – 4 Mệnh Đăng ngẫu nhiên đã hấp thụ\n  – Random Vật Trấn Áp đủ dùng trong túi\n• Thẻ tiêu biến NGAY SAU KHI bấm nút này.\n• Khi lên Kim Đan sẽ có nút [Thăng Cung] để test trực tiếp.\n\nĐạo hữu có muốn kích hoạt?')) {
                      triggerAction(activateKimDanTrialV2, 'Thẻ đã kích hoạt! Hãy tự Đột Phá lên Kim Đan.');
                    }
                  }}
                >
                  🏮 Kích Hoạt Thẻ Trải Nghiệm
                </button>
              </div>
            )}

            {cultivation.isKimDanTrialV2 && (
              <div
                className={styles.trialCardOffer}
                style={{ borderColor: 'rgba(239, 68, 68, 0.6)', boxShadow: '0 0 14px rgba(239, 68, 68, 0.2)', marginBottom: 12, background: 'rgba(239, 68, 68, 0.08)' }}
              >
                <div className={styles.trialCardOfferInfo}>
                  <span className={styles.trialOfferIcon}>🧪</span>
                  <div>
                    <h4 style={{ color: '#f87171', margin: 0, fontSize: 13 }}>ĐANG THỬ NGHIỆM KIM ĐAN V2</h4>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                      Thẻ thử nghiệm đã dùng 1 lần duy nhất. Bấm nút bên để kết thúc thử nghiệm và khôi phục tu vi ban đầu bất kỳ lúc nào.
                    </p>
                  </div>
                </div>
                <button
                  className="btn-ghost"
                  style={{ fontSize: 11.5, padding: '7px 14px', fontWeight: 700, flexShrink: 0, color: '#f87171', borderColor: 'rgba(248, 113, 113, 0.6)', background: 'rgba(239, 68, 68, 0.15)' }}
                  onClick={() => {
                    if (confirm('❌ BẠN CÓ CHẮC CHẮN MUỐN KẾT THÚC THỬ NGHIỆM?\n\n• Thẻ thử nghiệm sẽ tiêu biến vĩnh viễn.\n• Tu Vi và cảnh giới sẽ được khôi phục về trạng thái trước khi dùng thẻ.')) {
                      triggerAction(endKimDanTrialV2, 'Đã kết thúc chế độ Thử Nghiệm Kim Đan.');
                    }
                  }}
                >
                  ❌ Kết Thúc Thử Nghiệm
                </button>
              </div>
            )}

            {/* NGƯNG KHÍ VIEW */}
            {cultivation.realm === 'ngung_khi' && (
              <div className={styles.realmDetailCard}>
                <h3 className={styles.cardHeader}>Khí Hải Ngưng Khí</h3>
                <p className={styles.subtext}>
                  • Cảnh giới ban đầu gồm 10 tầng khí hải (1 Tầng = 1 Hổ, 5 Hổ = 1 Tiêu, 2 Tiêu = 1 Bạt).
                  <br />
                  • Đọc chương truyện để hấp thu thiên địa linh khí, rèn luyện kinh mạch.
                </p>

                {/* Progress bar to next level */}
                <div className={styles.progressContainer}>
                  <div className={styles.progressInfo}>
                    <span>Tiến độ tầng {cultivation.ngungKhiLevel}/10:</span>
                    <strong>{cultivation.expCurrentRealm} / {constants.NGUNG_KHI_THRESHOLDS[cultivation.ngungKhiLevel] || constants.NGUNG_KHI_THRESHOLDS[10]} Tu Vi</strong>
                  </div>
                  <div className={styles.progressBarBg}>
                    <div
                      className={styles.progressBarFillCyan}
                      style={{
                        width: `${Math.min(
                          100,
                          (cultivation.expCurrentRealm / (constants.NGUNG_KHI_THRESHOLDS[cultivation.ngungKhiLevel] || 4500)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>



                {/* 10 Khung Tầng Ngưng Khí (5 Khung Trên, 5 Khung Dưới) */}
                <div className={styles.ngungKhiTiersGrid}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(lvl => {
                    const isReached = (cultivation.ngungKhiLevel || 1) >= lvl;
                    const isCurrent = (cultivation.ngungKhiLevel || 1) === lvl;
                    const isMax = lvl === 10 && isReached;
                    const powerStr =
                      lvl === 10 ? '1 Bạt' : lvl === 5 ? '1 Tiêu' : lvl > 5 ? `1 Tiêu ${lvl - 5} Hổ` : `${lvl} Hổ`;

                    return (
                      <div
                        key={lvl}
                        className={`${styles.ngungKhiTierCard} ${isReached ? styles.ngungKhiTierCardReached : ''} ${
                          isCurrent ? styles.ngungKhiTierCardCurrent : ''
                        } ${isMax ? styles.ngungKhiTierCardMax : ''}`}
                      >
                        <span className={styles.tierCardLevel}>Tầng {lvl}</span>
                        <span className={styles.tierCardPower}>{powerStr}</span>
                      </div>
                    );
                  })}
                </div>
                <div className={styles.actionsGroup}>
                  {cultivation.readyBreakthroughTrucCo && (
                    <button
                      className={`btn-gold ${styles.breakthroughBtn}`}
                      onClick={() =>
                        triggerAction(
                          breakthroughToTrucCo,
                          'Trúc Cơ thành công! Tẩy kinh phạt tủy, mở ra Pháp Khiếu đầu tiên!'
                        )
                      }
                    >
                      <div className={styles.btnContentWrap}>
                        <span className={styles.btnMainTitle}>🔥 ĐỘT PHÁ TRÚC CƠ</span>
                        <span className={styles.btnSubInfo}>Đạt Ngưng Khí Tầng 10 Đại Viên Mãn</span>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* TRÚC CƠ VIEW */}
            {cultivation.realm === 'truc_co' && (
              <div className={styles.realmDetailCard}>
                <h3 className={styles.cardHeader}>Đạo Cơ Pháp Khiếu</h3>
                <p className={styles.subtext}>
                  • Chiến lực tính bằng <strong>Hỏa</strong> (Mệnh Hỏa).
                  <br />
                  • Mệnh Hỏa tự thân: <strong>{selfHoa} Hỏa</strong> ({cultivation.phapKhieu}/120 khiếu) {cultivation.has121st ? '+ 1 Hỏa (Khiếu 121)' : ''}.
                  <br />
                  • Mệnh Đăng đã hấp thụ: <strong>{absorbedCount} Đăng</strong> (+{absorbedCount} Hỏa chiến lực).
                </p>

                {/* 5 Vị Trí Mệnh Hỏa & Mệnh Đăng Thay Thế */}
                <div className={styles.flameSlotsRow}>
                  {[1, 2, 3, 4].map(idx => {
                    const lampId = (cultivation.absorbedLamps || [])[idx - 1];
                    if (lampId) {
                      const lamp = LIFE_LAMPS.find(l => l.id === lampId);
                      const tier = lamp ? (LAMP_TIERS[lamp.tier] || LAMP_TIERS.ha_pham) : null;
                      return (
                        <div
                          key={idx}
                          className={`${styles.flameSlotCard} ${styles.flameSlotLamp}`}
                          style={{ borderColor: tier?.color || '#ffcc00', boxShadow: `0 0 12px ${tier?.border || 'rgba(255, 204, 0, 0.4)'}` }}
                          title={`[${tier?.name}] ${lamp?.name || 'Mệnh Đăng'}`}
                        >
                          <span className={styles.slotIconAnimated} style={{ filter: `drop-shadow(0 0 6px ${tier?.color})` }}>
                            {lamp ? (
                              <ArtifactIcon item={lamp} isLamp={true} size={28} />
                            ) : (
                              '🏮'
                            )}
                          </span>
                          <span className={styles.slotTitleText} style={{ color: tier?.color }}>
                            {lamp?.shortName || lamp?.name || `Đăng ${idx}`}
                          </span>
                          <span className={styles.slotStatusText} style={{ color: tier?.color }}>
                            ✦ Đã Hấp Thụ
                          </span>
                        </div>
                      );
                    }

                    const isLit = selfHoa >= idx;
                    return (
                      <div
                        key={idx}
                        className={`${styles.flameSlotCard} ${isLit ? styles.flameSlotLit : styles.flameSlotUnlit}`}
                      >
                        <span
                          className={styles.slotIconAnimated}
                          style={{ filter: isLit ? 'drop-shadow(0 0 6px #f97316)' : 'none' }}
                        >
                          {isLit ? '🔥' : '🕯️'}
                        </span>
                        <span className={styles.slotTitleText} style={{ color: isLit ? '#f97316' : 'var(--text-secondary)' }}>
                          Mệnh Hỏa {idx}
                        </span>
                        <span className={styles.slotStatusText} style={{ color: isLit ? '#10b981' : 'var(--text-muted)' }}>
                          {isLit ? 'Đã Thắp' : 'Chưa Mở'}
                        </span>
                      </div>
                    );
                  })}

                  {/* Slot 5 (Khiếu 121 / Cực Cảnh hoặc Mệnh Đăng 5) */}
                  {(() => {
                    const lampId5 = (cultivation.absorbedLamps || [])[4];
                    if (lampId5) {
                      const lamp5 = LIFE_LAMPS.find(l => l.id === lampId5);
                      const tier5 = lamp5 ? (LAMP_TIERS[lamp5.tier] || LAMP_TIERS.ha_pham) : null;
                      return (
                        <div
                          className={`${styles.flameSlotCard} ${styles.flameSlotLamp}`}
                          style={{ borderColor: tier5?.color || '#ffcc00', boxShadow: `0 0 12px ${tier5?.border || 'rgba(255, 204, 0, 0.4)'}` }}
                          title={`[${tier5?.name}] ${lamp5?.name || 'Mệnh Đăng 5'}`}
                        >
                          <span className={styles.slotIconAnimated} style={{ filter: `drop-shadow(0 0 6px ${tier5?.color})` }}>
                            {lamp5 ? (
                              <ArtifactIcon item={lamp5} isLamp={true} size={28} />
                            ) : (
                              '🏮'
                            )}
                          </span>
                          <span className={styles.slotTitleText} style={{ color: tier5?.color }}>
                            {lamp5?.shortName || lamp5?.name || 'Đăng 5'}
                          </span>
                          <span className={styles.slotStatusText} style={{ color: tier5?.color }}>
                            ✦ Đã Hấp Thụ
                          </span>
                        </div>
                      );
                    }

                    const isSecretLit = !!cultivation.has121st;
                    const isSecretFailed = !!cultivation.failed121st;
                    return (
                      <div
                        className={`${styles.flameSlotCard} ${styles.flameSlotSecret} ${isSecretLit ? styles.flameSlotSecretLit : ''}`}
                      >
                        <span
                          className={styles.slotIconAnimated}
                          style={{ filter: isSecretLit ? 'drop-shadow(0 0 8px #eab308)' : 'none' }}
                        >
                          {isSecretLit ? '🔥' : isSecretFailed ? '❌' : '🔒'}
                        </span>
                        <span className={styles.slotTitleText} style={{ color: isSecretLit ? '#eab308' : 'var(--text-secondary)' }}>
                          Khiếu 121
                        </span>
                        <span className={styles.slotStatusText} style={{ color: isSecretLit ? '#eab308' : isSecretFailed ? '#ef4444' : 'var(--text-muted)' }}>
                          {isSecretLit ? '✦ Cực Cảnh' : isSecretFailed ? 'Đã Khóa' : 'Bí Mật'}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {/* Phap Khieu Progress */}
                {(() => {
                  const currentKhieuIndex = Math.min(120, cultivation.phapKhieu + 1);
                  const currentKhieuReq = constants.getExpForPhapKhieuIndex ? constants.getExpForPhapKhieuIndex(currentKhieuIndex) : 70;
                  const prevThreshold = (constants.TRUC_CO_KHIEU_THRESHOLDS && constants.TRUC_CO_KHIEU_THRESHOLDS[cultivation.phapKhieu]) || 0;
                  const expInCurrentKhieu = Math.max(0, (cultivation.expCurrentRealm || 0) - prevThreshold);
                  const percent = cultivation.phapKhieu >= 120 ? 100 : Math.min(100, Math.floor((expInCurrentKhieu / currentKhieuReq) * 100));

                  return (
                    <div className={styles.progressContainer}>
                      <div className={styles.progressInfo}>
                        <span>Pháp Khiếu tự thân khai mở:</span>
                        <strong>
                          {cultivation.phapKhieu}/120 {cultivation.has121st && '(+ Khiếu 121)'}
                          {cultivation.phapKhieu < 120 && ` · Khiếu ${currentKhieuIndex}: ${expInCurrentKhieu}/${currentKhieuReq} Tu Vi`}
                        </strong>
                      </div>
                      <div className={styles.progressBarBg}>
                        <div
                          className={styles.progressBarFillGold}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* Secret 121st progress if at 120 khiếu */}
                {cultivation.phapKhieu >= 120 && !cultivation.has121st && (
                  <div className={styles.secret121Box}>
                    {cultivation.failed121st ? (
                      <div className={styles.failed121Notice}>
                        <strong>⚠️ XUNG KÍCH THẤT BẠI:</strong> Pháp khiếu 121 đã đóng kín vĩnh viễn do nghịch thiên thất bại. Bạn sẽ kết đan dựa trên 4 Mệnh Hỏa tự thân (trần 7 Cung).
                      </div>
                    ) : (
                      <>
                        <div className={styles.secret121Header}>
                          <span>✨ Cơ Duyên Xung Kích Pháp Khiếu 121:</span>
                          <strong>{cultivation.attemptExp121}/{(constants.EXP_FOR_121_ATTEMPT || 800)} Linh Lực</strong>
                        </div>
                        <div className={styles.progressBarBg}>
                          <div
                            className={styles.progressBarFillCyan}
                            style={{ width: `${Math.min(100, (cultivation.attemptExp121 / (constants.EXP_FOR_121_ATTEMPT || 800)) * 100)}%` }}
                          />
                        </div>
                        {cultivation.attemptExp121 >= (constants.EXP_FOR_121_ATTEMPT || 800) ? (
                          <button
                            className={`btn-gold ${styles.breakthroughBtn}`}
                            onClick={() => {
                              if (confirm('CẢNH BÁO NGHỊCH THIÊN:\n\nXung kích Pháp Khiếu 121 có 50% tỉ lệ thành công và 50% tỉ lệ thất bại.\nNếu thất bại, căn cơ pháp khiếu sẽ ĐÓNG KÍN VĨNH VIỄN và bạn không bao giờ có thể mở Khiếu 121 nữa!\n\nBạn có muốn mượn cơ duyên xung kích ngay?')) {
                                triggerAction(attemptUnlock121);
                              }
                            }}
                            style={{ marginTop: 10 }}
                          >
                            <div className={styles.btnContentWrap}>
                              <span className={styles.btnMainTitle}>🌟 XUNG KÍCH PHÁP KHIẾU 121</span>
                              <span className={styles.btnSubInfo}>50% Thành Công · 50% Đóng Kín Vĩnh Viễn</span>
                            </div>
                          </button>
                        ) : (
                          <p className={styles.hintTextSmall}>Đọc thêm chương để tích tụ đủ {(constants.EXP_FOR_121_ATTEMPT || 800)} linh lực xung kích Pháp Khiếu 121 (Tỉ lệ: 50% thành công / 50% đóng kín vĩnh viễn).</p>
                        )}
                      </>
                    )}
                  </div>
                )}
                <div className={styles.actionsGroup}>
                  {(selfHoa + (cultivation.has121st ? 1 : 0)) >= 3 && (
                    <button
                      className={`btn-gold ${styles.breakthroughBtn}`}
                      onClick={() =>
                        triggerAction(
                          breakthroughToKimDan,
                          `Đột phá Kim Đan thành công! Sở hữu tổng cộng ${cultivation.maxThienCung} Thiên Cung!`
                        )
                      }
                    >
                      <div className={styles.btnContentWrap}>
                        <span className={styles.btnMainTitle}>🏛️ ĐỘT PHÁ KIM ĐAN</span>
                        <span className={styles.btnSubInfo}>
                          Trần {(selfHoa + (cultivation.has121st ? 1 : 0)) === 3 ? '6' : (selfHoa + (cultivation.has121st ? 1 : 0)) === 4 ? '7' : '8'} Cung Tự Thân + {absorbedCount} Chân Cung Mệnh Đăng
                        </span>
                      </div>
                    </button>
                  )}

                  {(selfHoa + (cultivation.has121st ? 1 : 0)) < 3 && (
                    <p className={styles.hintText}>
                      💡 Cần tối thiểu <strong>3 Mệnh Hỏa tự thân</strong> (90 Pháp Khiếu) để mở khóa Đột Phá Kim Đan.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* KIM ĐAN / GIẢ ANH / NGUYÊN ANH VIEW */}
            {(cultivation.realm === 'kim_dan' || cultivation.realm === 'gia_anh' || cultivation.realm === 'nguyen_anh') && (
              <>
                {(() => {
                  const lampList = cultivation.absorbedLamps || [];
                  const lampCount = lampList.length;
                  const selfPalacesTotal = Math.max(1, cultivation.maxThienCung - lampCount);
                  const selfRealized = cultivation.realizedThienCung || 0;
                  const totalRealizedCung = lampCount + selfRealized;
                  const targetPalaceExp = constants.getPalaceCost ? constants.getPalaceCost(selfRealized + 1) : 2000;
                  const bottleneckExp = targetPalaceExp - 1;

                  return (
                    <>
                      {isNguyenAnhStage && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 6 }}>
                            <h4 style={{ margin: 0, color: '#ffcc00', fontSize: 13, fontWeight: 700 }}>
                              ⚡ LỰC THIÊN MỆNH HIỆN CÓ: {(cultivation.totalThienMenh || 0).toLocaleString()} TM
                            </h4>
                            <span style={{ fontSize: 10.5, color: '#38bdf8' }}>📖 Đọc 1 chương: +30 ~ 50 TM</span>
                          </div>
                          <p className={styles.subtext} style={{ margin: 0 }}>
                            Nạp Lực Thiên Mệnh vào từng Đạo Anh để thai nghén rèn luyện chuẩn bị nghênh tiếp Thiên Kiếp trên <strong>Độ Kiếp Đài</strong>!
                          </p>
                        </div>
                      )}

                      {selfRealized >= selfPalacesTotal && (
                        <div className={styles.maxRankBadge}>
                          ✨ TOÀN BỘ {cultivation.maxThienCung} THIÊN CUNG ĐÃ HÓA THÀNH CUNG THẬT 100%!
                          {cultivation.realm === 'kim_dan' && (
                            <p style={{ marginTop: 6, fontSize: 12, color: 'var(--accent-cyan)', fontWeight: 'normal' }}>
                              👉 Nhấn "👑 Khai Sinh Đạo Anh" trên từng cung ở Tòa Thiên Lâu để ngưng tụ Đạo Anh Thần Thể mở khóa cảnh giới <strong>Nguyên Anh</strong>!
                            </p>
                          )}
                        </div>
                      )}
                      {/* Nút Nạp Đầy 100% Thiên Mệnh cho Toàn Bộ Đạo Anh khi ở Giả Anh / Nguyên Anh */}
                      {isNguyenAnhStage && (cultivation.daoAnhs || []).length > 0 && (
                        <button
                          className="btn-gold"
                          style={{
                            width: '100%',
                            marginTop: 14,
                            padding: '11px 16px',
                            fontSize: 12.5,
                            fontWeight: 800,
                            letterSpacing: '0.5px',
                            boxShadow: '0 0 16px rgba(255, 204, 0, 0.4)',
                            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                            border: '1px solid #ffcc00',
                          }}
                          onClick={() => triggerAction(fillAllDaoAnhThienMenh)}
                        >
                          ⚡ NẠP ĐẦY 100% THIÊN MỆNH
                        </button>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* ========================================================
            TAB 2: HỆ THỐNG 72 MỆNH ĐĂNG & ĐỔI BÁN TIÊN TINH
           ======================================================== */}
        {activeTab === 'lamps' && (
          <div className={styles.lampsSection}>
            {/* Top Info Card */}
            <div className={styles.lampHeroCard}>
              <div className={styles.lampHeroGlow} />
              <div className={styles.lampHeroTop}>
                <div>
                  <h3 className={styles.cardHeader}>Bách Khoa 72 Mệnh Đăng · Thu Thập & Tiên Tinh</h3>
                  <p className={styles.subtext}>
                    • Đã Hấp Thụ: <strong>{absorbedCount}/5 Mệnh Đăng</strong> (Tối đa 5 Đèn, không thể hoàn trả).
                    <br />
                    • Đổi Tu Vi : Tiên Tinh là <strong>1:5</strong>. Có thể bán đèn trong túi lấy Tiên Tinh hoặc dùng Tiên Tinh mua đèn!
                  </p>
                </div>
              </div>
            </div>

            {/* Tier Filters Bar */}
            {(() => {
              const ownedLampsCount = LIFE_LAMPS.filter(l => (cultivation.absorbedLamps || []).includes(l.id) || (cultivation.inventoryLamps || []).includes(l.id)).length;

              return (
                <div className={styles.tierFilterRow}>
                  <button
                    className={`${styles.tierFilterBtn} ${tierFilter === 'owned' ? styles.tierFilterActive : ''}`}
                    onClick={() => setTierFilter('owned')}
                    style={{ borderColor: tierFilter === 'owned' ? '#ffcc00' : 'rgba(255, 204, 0, 0.4)', color: '#ffcc00' }}
                  >
                    ✦ Đã Sở Hữu ({ownedLampsCount})
                  </button>
                  <button
                    className={`${styles.tierFilterBtn} ${tierFilter === 'all' ? styles.tierFilterActive : ''}`}
                    onClick={() => setTierFilter('all')}
                  >
                    Tất Cả (72)
                  </button>
                  {Object.entries(LAMP_TIERS || {}).map(([key, t]) => {
                    const count = LIFE_LAMPS.filter(l => l.tier === key).length;
                    return (
                      <button
                        key={key}
                        className={`${styles.tierFilterBtn} ${tierFilter === key ? styles.tierFilterActive : ''}`}
                        onClick={() => setTierFilter(key)}
                        style={{ borderColor: tierFilter === key ? t.color : 'var(--border-subtle)', color: t.color }}
                      >
                        {t.name} ({count})
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {/* List of 72 Life Lamps */}
            {(() => {
              const filteredLamps = LIFE_LAMPS.filter(lamp => {
                const isAbsorbed = (cultivation.absorbedLamps || []).includes(lamp.id);
                const isInInventory = (cultivation.inventoryLamps || []).includes(lamp.id);
                const isOwned = isAbsorbed || isInInventory;
                if (tierFilter === 'owned') return isOwned;
                return tierFilter === 'all' || lamp.tier === tierFilter;
              });

              if (filteredLamps.length === 0) {
                return (
                  <div className={styles.emptyNoticeCard}>
                    <span>🏮 Chưa sở hữu Mệnh Đăng nào trong danh mục này. Hãy đọc thêm chương để nhặt cơ duyên!</span>
                  </div>
                );
              }

              return (
                <div className={styles.lampCardsGrid}>
                  {filteredLamps.map(lamp => {
                    const isAbsorbed = (cultivation.absorbedLamps || []).includes(lamp.id);
                    const isInInventory = (cultivation.inventoryLamps || []).includes(lamp.id);
                    const isOwned = isAbsorbed || isInInventory;
                    const tierInfo = LAMP_TIERS[lamp.tier] || { name: 'Hạ Phẩm', color: '#e2e8f0', bg: 'rgba(226, 232, 240, 0.1)', border: 'rgba(226, 232, 240, 0.3)', priceExp: 500, priceTM: 50, tienTinh: 2500 };

                    // Tính toán chi phí Tiên Tinh & phần thiếu cần bù
                    const totalCostTienTinh = tierInfo.tienTinh || tierInfo.dangDiem || (tierInfo.priceExp * 5);
                    const canCoverWithPoints = currentTienTinh >= totalCostTienTinh;
                    const deficitExp = Math.max(0, Math.ceil((totalCostTienTinh - currentTienTinh) / 5));
                    const deficitTM = Math.ceil(deficitExp / 10);

                    return (
                      <div
                        key={lamp.id}
                        className={`${styles.lampCard} ${isAbsorbed ? styles.lampEquipped : ''} ${!isOwned ? styles.lampLocked : ''}`}
                        style={{ borderColor: isOwned ? tierInfo.color : 'var(--border-subtle)' }}
                      >
                        <div className={styles.lampCardTop}>
                          <ArtifactIcon item={lamp} isLamp={true} size={28} />
                          <div className={styles.lampNameCol}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <h4 className={styles.lampName} style={{ color: isOwned ? tierInfo.color : 'var(--text-muted)' }}>
                                {lamp.name}
                              </h4>
                              <span
                                className="badge"
                                style={{
                                  fontSize: 9,
                                  padding: '1px 6px',
                                  backgroundColor: tierInfo.bg,
                                  color: tierInfo.color,
                                  borderColor: tierInfo.border,
                                }}
                              >
                                {tierInfo.name}
                              </span>
                            </div>
                            <span className={styles.lampPoem}>"{lamp.poem}"</span>
                          </div>
                          <div className={styles.lampStatusBadge}>
                            {isAbsorbed && <span className="badge badge-gold">✦ Đã Hấp Thụ</span>}
                            {isInInventory && <span className="badge badge-cyan">Trong Túi</span>}
                            {!isOwned && <span className="badge" style={{ opacity: 0.45 }}>Chưa Sở Hữu</span>}
                          </div>
                        </div>

                        <p className={styles.lampDesc}>{lamp.desc}</p>

                        {/* Action buttons khi đèn đang ở trong túi */}
                        {isInInventory && (
                          <div className={styles.lampActions} style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="btn-gold"
                              style={{ fontSize: 11.5, padding: '6px 10px', flex: 1.4 }}
                              disabled={
                                absorbedCount >= 5 ||
                                cultivation.realm === 'ngung_khi' ||
                                isNguyenAnhStage ||
                                (cultivation.realm === 'truc_co' && (selfHoa < 1 || absorbedCount >= selfHoa))
                              }
                              onClick={() => {
                                const realmBenefit = cultivation.realm === 'truc_co' ? '+1 Hỏa chiến lực' : '+1 Cung Thật chiến lực';
                                if (confirm(`XÁC NHẬN HẤP THỤ [${lamp.name}] (${tierInfo.name})?\n\n• Lưu ý: Một khi hấp thụ sẽ vĩnh viễn dung nhập đạo cơ, KHÔNG THỂ HOÀN TRẢ!\n• Tác dụng: ${realmBenefit}.\n• Đã hấp thụ: ${absorbedCount} Mệnh Đăng.`)) {
                                  triggerAction(() => absorbLamp(lamp.id), `Đã hấp thụ thành công ${lamp.name}! (${realmBenefit})`);
                                }
                              }}
                            >
                              {isNguyenAnhStage
                                ? 'Nguyên Anh Khóa'
                                : cultivation.realm === 'ngung_khi'
                                ? 'Ngưng Khí Khóa'
                                : cultivation.realm === 'truc_co' && selfHoa < 1
                                ? 'Cần 1 Hỏa'
                                : cultivation.realm === 'truc_co' && absorbedCount >= selfHoa
                                ? `Cần ${absorbedCount + 1} Hỏa`
                                : absorbedCount >= 5
                                ? 'Đã Đạt 5 Đăng'
                                : cultivation.realm === 'truc_co'
                                ? '🏮 Hấp Thụ (+1 Hỏa)'
                                : '🏮 Hấp Thụ (+1 Cung)'}
                            </button>

                            {/* Nút Bán Mệnh Đăng lấy Tiên Tinh */}
                            <button
                              className="btn-ghost"
                              style={{
                                fontSize: 11.5,
                                padding: '6px 10px',
                                color: '#10b981',
                                borderColor: 'rgba(16, 185, 129, 0.5)',
                                background: 'rgba(16, 185, 129, 0.08)',
                                flex: 1,
                              }}
                              onClick={() => {
                                const isRare = lamp.tier === 'tien_pham' || lamp.tier === 'than_pham';
                                if (isRare) {
                                  if (
                                    !confirm(
                                      `⚠️ XÁC NHẬN BÁN MỆNH ĐĂNG CAO CẤP:\n\n• Mệnh Đăng: [${tierInfo.name}] ${lamp.name}\n• Nhận lại: +${totalCostTienTinh.toLocaleString()} Tiên Tinh\n\nĐạo hữu có chắc chắn muốn bán chiếc đèn quý hiếm này?`
                                    )
                                  ) return;
                                }
                                triggerAction(() => sellLamp(lamp.id), `Đã bán thành công ${lamp.name}! Nhận +${totalCostTienTinh.toLocaleString()} Tiên Tinh.`);
                              }}
                            >
                              💰 Bán (+{totalCostTienTinh.toLocaleString()} TT)
                            </button>
                          </div>
                        )}

                        {/* Nút Đổi Mệnh Đăng bằng Tiên Tinh & Đốt Tu Vi bù khi chưa sở hữu */}
                        {!isOwned && (
                          <div className={styles.lampActions}>
                            <button
                              className={styles.burnExpBtn}
                              onClick={() => {
                                const paymentMsg = canCoverWithPoints
                                  ? `Tiêu hao: ${totalCostTienTinh.toLocaleString()} Tiên Tinh (Không tổn hao tu vi)`
                                  : currentTienTinh > 0
                                  ? `Tiêu hao: ${currentTienTinh.toLocaleString()} Tiên Tinh + Đốt ${isNguyenAnhStage ? `${deficitTM.toLocaleString()} Thiên Mệnh` : `${deficitExp.toLocaleString()} Tu Vi`} bù thiếu`
                                  : `Tiêu hao: Đốt ${isNguyenAnhStage ? `${deficitTM.toLocaleString()} Thiên Mệnh` : `${deficitExp.toLocaleString()} Tu Vi`}`;

                                const consequenceText = canCoverWithPoints
                                  ? 'An toàn: Đủ Tiên Tinh chi trả, không ảnh hưởng cảnh giới!'
                                  : cultivation.realm === 'ngung_khi'
                                  ? 'Cảnh báo: Tu vi bù thiếu có thể làm rơi tầng Ngưng Khí!'
                                  : cultivation.realm === 'truc_co'
                                  ? 'Cảnh báo: Tu vi bù thiếu sẽ ngắt bớt Pháp Khiếu (Pháp Khiếu 121 bảo toàn)!'
                                  : cultivation.realm === 'kim_dan'
                                  ? 'Cảnh báo: Tu vi bù thiếu sẽ làm Thiên Cung tự thân bị hư hóa (Chân Cung Mệnh Đăng bất tử)!'
                                  : 'Cảnh báo: Tiêu hao Thiên Mệnh bù thiếu theo tỉ lệ 10:1!';

                                if (
                                  confirm(
                                    `✨ NGHỊCH MỆNH HOÁN ĐĂNG:\n\n• Mệnh Đăng: [${tierInfo.name}] ${lamp.name}\n• ${paymentMsg}\n• ${consequenceText}\n\nĐạo hữu có muốn đổi Mệnh Đăng này vào Túi Trữ Vật?`
                                  )
                                ) {
                                  triggerAction(() => burnExpForLamp(lamp.id));
                                }
                              }}
                            >
                              {canCoverWithPoints
                                ? `✨ Đổi Đèn (${totalCostTienTinh.toLocaleString()} TT)`
                                : currentTienTinh > 0
                                ? `🔥 ${currentTienTinh.toLocaleString()} TT + Đốt ${isNguyenAnhStage ? `${deficitTM.toLocaleString()} TM` : `${deficitExp.toLocaleString()} Tu Vi`}`
                                : `🔥 Đốt ${isNguyenAnhStage ? `${(tierInfo.priceTM || 50).toLocaleString()} TM` : `${(tierInfo.priceExp || 500).toLocaleString()} Tu Vi`} Đổi Đèn`}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* ========================================================
            TAB 3: 96 VẬT TRẤN ÁP THIÊN CUNG (TRẤN CUNG BẢO VẬT)
           ======================================================== */}
        {activeTab === 'artifacts' && (
          <div className={styles.lampsSection}>
            {/* Top Artifacts Info Card */}
            <div className={styles.lampHeroCard}>
              <div className={styles.lampHeroGlow} />
              <div className={styles.lampHeroTop}>
                <div>
                  <h3 className={styles.cardHeader}>Trấn Cung Bảo Vật & Công Pháp (96 Mục) · Khảm Nạm & Tiên Tinh</h3>
                  <p className={styles.subtext}>
                    • Trong Túi Trữ Vật: <strong>{artifactCount} Vật Trấn Áp</strong>.
                    <br />
                    • Khi Thiên Cung tự thân đạt <strong>99.99%</strong>, khảm nạm 1 Bảo Vật hoặc Công Pháp để đạt <strong>100% Cung Thật</strong>!
                    <br />
                    • Có thể bán Vật Trấn Áp không dùng để lấy Tiên Tinh hoặc dùng Tiên Tinh đổi bảo vật mới!
                  </p>
                </div>
              </div>
            </div>

            {/* Tier Filters Bar */}
            {(() => {
              const anchoredIds = Object.values(cultivation.palaceAnchors || {}).map(a => a?.id);
              const ownedArtifactsCount = (SUPPRESSING_ARTIFACTS || []).filter(art => (cultivation.inventoryArtifacts || []).includes(art.id) || anchoredIds.includes(art.id)).length;

              return (
                <div className={styles.tierFilterRow}>
                  <button
                    className={`${styles.tierFilterBtn} ${artifactTierFilter === 'owned' ? styles.tierFilterActive : ''}`}
                    onClick={() => setArtifactTierFilter('owned')}
                    style={{ borderColor: artifactTierFilter === 'owned' ? '#ffcc00' : 'rgba(255, 204, 0, 0.4)', color: '#ffcc00' }}
                  >
                    ✦ Đã Sở Hữu ({ownedArtifactsCount})
                  </button>
                  <button
                    className={`${styles.tierFilterBtn} ${artifactTierFilter === 'all' ? styles.tierFilterActive : ''}`}
                    onClick={() => setArtifactTierFilter('all')}
                  >
                    Tất Cả ({(SUPPRESSING_ARTIFACTS || []).length})
                  </button>
                  {Object.entries(LAMP_TIERS || {}).map(([key, t]) => {
                    const count = (SUPPRESSING_ARTIFACTS || []).filter(a => a.tier === key).length;
                    return (
                      <button
                        key={key}
                        className={`${styles.tierFilterBtn} ${artifactTierFilter === key ? styles.tierFilterActive : ''}`}
                        onClick={() => setArtifactTierFilter(key)}
                        style={{ borderColor: artifactTierFilter === key ? t.color : 'var(--border-subtle)', color: t.color }}
                      >
                        {t.name} ({count})
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {/* List of 96 Suppressing Artifacts */}
            {(() => {
              const anchoredIds = Object.values(cultivation.palaceAnchors || {}).map(a => a?.id);
              const filteredArtifacts = (SUPPRESSING_ARTIFACTS || []).filter(art => {
                const isInInv = (cultivation.inventoryArtifacts || []).includes(art.id);
                const isAnchored = anchoredIds.includes(art.id);
                const isOwned = isInInv || isAnchored;
                if (artifactTierFilter === 'owned') return isOwned;
                return artifactTierFilter === 'all' || art.tier === artifactTierFilter;
              });

              if (filteredArtifacts.length === 0) {
                return (
                  <div className={styles.emptyNoticeCard}>
                    <span>🗝️ Chưa sở hữu Vật Trấn Áp nào trong danh mục này. Hãy đọc thêm chương để nhặt cơ duyên!</span>
                  </div>
                );
              }

              return (
                <div className={styles.lampCardsGrid}>
                  {filteredArtifacts.map(art => {
                    const invCount = (cultivation.inventoryArtifacts || []).filter(id => id === art.id).length;
                    const isAnchored = anchoredIds.includes(art.id);
                    const isInInventory = invCount > 0;
                    const isOwned = isInInventory || isAnchored;
                    const tierInfo = LAMP_TIERS[art.tier] || LAMP_TIERS.ha_pham;
                    const costTienTinh = tierInfo.tienTinh || tierInfo.dangDiem || (tierInfo.priceExp * 5);
                    const canCover = currentTienTinh >= costTienTinh;
                    const deficitExp = Math.max(0, Math.ceil((costTienTinh - currentTienTinh) / 5));

                    return (
                      <div
                        key={art.id}
                        className={`${styles.lampCard} ${isOwned ? styles.lampEquipped : styles.lampLocked}`}
                        style={{ borderColor: isOwned ? tierInfo.color : 'var(--border-subtle)' }}
                      >
                        <div className={styles.lampCardTop}>
                          <ArtifactIcon item={art} size={28} />
                          <div className={styles.lampNameCol}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <h4 className={styles.lampName} style={{ color: isOwned ? tierInfo.color : 'var(--text-muted)' }}>
                                {art.name}
                              </h4>
                              <span
                                className="badge"
                                style={{
                                  fontSize: 9,
                                  padding: '1px 6px',
                                  backgroundColor: tierInfo.bg,
                                  color: tierInfo.color,
                                  borderColor: tierInfo.border,
                                }}
                              >
                                {tierInfo.name} · {art.type}
                              </span>
                            </div>
                            <span className={styles.lampPoem}>"{art.poem}"</span>
                          </div>
                          <div className={styles.lampStatusBadge}>
                            {isAnchored ? (
                              <span className="badge badge-gold">✦ Đã Trấn Cung</span>
                            ) : isInInventory ? (
                              <span className="badge badge-cyan">Sở Hữu x{invCount}</span>
                            ) : (
                              <span className="badge" style={{ opacity: 0.45 }}>Chưa Có</span>
                            )}
                          </div>
                        </div>

                        <p className={styles.lampDesc}>{art.desc}</p>

                        {/* Actions */}
                        <div className={styles.lampActions} style={{ display: 'flex', gap: 6 }}>
                          {isInInventory ? (
                            <>
                              {/* Nút Khảm Nạm nếu đang ở Kim Đan và có cung cần trấn áp */}
                              {cultivation.realm === 'kim_dan' && cultivation.currentThienCungExp >= 799 && (
                                <button
                                  className="btn-gold"
                                  style={{ fontSize: 11.5, padding: '6px 10px', flex: 1.3 }}
                                  onClick={() => {
                                    triggerAction(
                                      () => anchorPalace(cultivation.realizedThienCung, art.id),
                                      `Đã khảm nạm ${art.name} vào Thiên Cung ${cultivation.realizedThienCung + 1} thành Cung Thật 100%!`
                                    );
                                  }}
                                >
                                  👑 Khảm Nạm Ngay
                                </button>
                              )}

                              {/* Nút Bán lấy Tiên Tinh */}
                              <button
                                className="btn-ghost"
                                style={{
                                  fontSize: 11.5,
                                  padding: '6px 10px',
                                  color: '#10b981',
                                  borderColor: 'rgba(16, 185, 129, 0.5)',
                                  background: 'rgba(16, 185, 129, 0.08)',
                                  flex: 1,
                                }}
                                onClick={() => {
                                  const isRare = art.tier === 'tien_pham' || art.tier === 'than_pham';
                                  if (isRare) {
                                    if (!confirm(`⚠️ XÁC NHẬN BÁN BẢO VẬT CAO CẤP:\n\n• Vật phẩm: [${tierInfo.name}] ${art.name}\n• Nhận lại: +${costTienTinh.toLocaleString()} Tiên Tinh\n\nBạn có chắc chắn muốn bán vật phẩm quý hiếm này?`)) {
                                      return;
                                    }
                                  }
                                  triggerAction(() => sellArtifact(art.id), `Đã bán ${art.name}, nhận +${costTienTinh.toLocaleString()} Tiên Tinh!`);
                                }}
                              >
                                💰 Bán (+{costTienTinh.toLocaleString()} TT)
                              </button>
                            </>
                          ) : isAnchored ? (
                            <span style={{ fontSize: 11, color: '#ffcc00', fontStyle: 'italic' }}>
                              ✦ Đã tọa trấn vĩnh cửu tại Thiên Cung
                            </span>
                          ) : (
                            /* Nút Đổi Vật Trấn Áp */
                            <button
                              className={styles.burnExpBtn}
                              onClick={() => {
                                const paymentMsg = canCover
                                  ? `Tiêu hao: ${costTienTinh.toLocaleString()} Tiên Tinh`
                                  : currentTienTinh > 0
                                  ? `Tiêu hao: ${currentTienTinh.toLocaleString()} TT + Đốt ${deficitExp.toLocaleString()} Tu Vi bù thiếu`
                                  : `Tiêu hao: Đốt ${(tierInfo.priceExp || 500).toLocaleString()} Tu Vi`;

                                if (confirm(`ĐỔI VẬT TRẤN ÁP:\n\n• Vật phẩm: [${tierInfo.name}] ${art.name} (${art.type})\n• ${paymentMsg}\n\nĐạo hữu có muốn đổi bảo vật này vào Túi Trữ Vật?`)) {
                                  triggerAction(() => buyArtifact(art.id));
                                }
                              }}
                            >
                              {canCover
                                ? `✨ Đổi Bảo Vật (${costTienTinh.toLocaleString()} TT)`
                                : currentTienTinh > 0
                                ? `🔥 ${currentTienTinh.toLocaleString()} TT + Đốt ${deficitExp.toLocaleString()} Tu Vi`
                                : `🔥 Đốt ${(tierInfo.priceExp || 500).toLocaleString()} Tu Vi Đổi`}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* ========================================================
            TAB 4: ĐỘ KIẾP ĐÀI (NGUYÊN ANH & ĐẠO ANH)
           ======================================================== */}
        {activeTab === 'nguyen_anh' && isNguyenAnhStage && (
          <div className={styles.tribulationSection}>
            {/* Top summary card */}
            <div className={styles.tribulationHero}>
              <div className={styles.tribulationHeaderRow}>
                <div>
                  <h3 className={styles.cardHeader}>⚡ CỬU THIÊN ĐỘ KIẾP ĐÀI</h3>
                  <p className={styles.subtext}>
                    Tích lũy <strong>Linh Lực (Tu Vi)</strong> khi đọc truyện để nuôi dưỡng Đạo Anh. Đạt từ <strong>80% Linh Lực</strong> trở lên để Nghênh Tiếp Thiên Kiếp, độ kiếp thành công sẽ <strong>thu hoạch Lực Thiên Mệnh</strong> tương ứng phẩm cấp Đạo Anh!
                  </p>
                </div>
              </div>

              {/* Nạp Đầy 100% & Vạn Kiếp Tề Thăng buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                <button
                  className="btn-gold"
                  style={{ width: '100%', padding: '10px 14px', fontSize: 12.5, fontWeight: 800, background: 'linear-gradient(135deg, #0284c7, #38bdf8)' }}
                  onClick={() => triggerAction(fillAllDaoAnhThienMenh)}
                >
                  ⚡ NẠP ĐẦY 100% LINH LỰC TOÀN BỘ
                </button>
                <button
                  className={`btn-gold ${styles.massTribulationBtn}`}
                  style={{ width: '100%', padding: '10px 14px', fontSize: 12.5, fontWeight: 700 }}
                  onClick={handleAllTribulation}
                >
                  👑 VẠN KIẾP TỀ THĂNG (+50% BONUS THIÊN MỆNH)
                </button>
              </div>
            </div>

            {/* List of Dao Anhs */}
            {(!cultivation.daoAnhs || cultivation.daoAnhs.length === 0) ? (
              <div className={styles.emptyDaoAnhNotice}>
                <p>Chưa có Đạo Anh nào. Hãy Hóa Thực toàn bộ Thiên Cung ở Kim Đan rồi Hóa Đạo Anh để bắt đầu hành trình Độ Kiếp!</p>
              </div>
            ) : (
              <div className={styles.daoAnhCardsGrid}>
                {(cultivation?.daoAnhs || []).map(da => {
                  const daTheme = getDaoAnhTheme(da, cultivation);
                  const curExp = da.currentExp !== undefined ? da.currentExp : (da.currentThienMenh || 0);
                  const maxExp = da.maxExp || KIEP_EXP_REQUIREMENTS[da.currentKiep || 0] || 5000;
                  const percent = Math.min(100, Math.floor((curExp / maxExp) * 100));
                  const isEligible = percent >= 80;
                  const successChance = Math.min(100, 80 + (percent - 80));
                  const tierKey = getDaoAnhTierKey(da, cultivation);
                  const tierInfo = LAMP_TIERS[tierKey] || LAMP_TIERS.than_pham;
                  const rewardTM = calculateDaoAnhTribulationReward(da, (da.currentKiep || 0) + 1, cultivation);

                  return (
                    <div
                      key={da.id}
                      className={`${styles.daoAnhCard} ${da.currentKiep >= 5 ? styles.daoAnhMax : ''}`}
                      style={{ borderColor: isEligible ? '#c084fc' : daTheme.color, boxShadow: `0 0 14px ${daTheme.glow}`, background: daTheme.bg }}
                    >
                      <div className={styles.daoAnhTop}>
                        <span className={styles.daoAnhIcon} style={{ textShadow: `0 0 10px ${daTheme.color}` }}>
                          {daTheme.icon}
                        </span>
                        <div className={styles.daoAnhInfo}>
                          <h4 className={styles.daoAnhTitle} style={{ color: daTheme.color, fontWeight: 700 }}>
                            {formatDaoAnhTitle(da.name)}
                          </h4>
                          <span className={styles.daoAnhBadge} style={{ color: daTheme.color }}>
                            [{tierInfo.name}] · {da.element || 'Thần Thể'} · Kiếp {da.currentKiep}/5 ({da.currentKiep} Anh)
                            {daTheme.isLamp && ' · 🏮 Chân Hỏa'}
                          </span>
                        </div>
                      </div>

                      {/* Kiep Indicators (Icons without ugly text) */}
                      <div className={styles.kiepRingsRow}>
                        {[1, 2, 3, 4, 5].map(k => (
                          <div
                            key={k}
                            className={`${styles.kiepDot} ${da.currentKiep >= k ? styles.kiepPassed : ''}`}
                            style={da.currentKiep >= k ? { borderColor: daTheme.color, background: daTheme.color, color: '#000' } : {}}
                            title={`Kiếp thứ ${k}`}
                          >
                            <span>{da.currentKiep >= k ? '⚡' : '◦'}</span>
                          </div>
                        ))}
                      </div>

                      {da.currentKiep < 5 ? (
                        <>
                          {/* Progress Bar Linh Lực (Tu Vi) */}
                          <div className={styles.progressContainer} style={{ marginTop: 8 }}>
                            <div className={styles.progressInfo}>
                              <span>Linh Lực tích lũy (Tu Vi):</span>
                              <strong style={{ color: isEligible ? '#f0abfc' : daTheme.color }}>
                                {curExp.toLocaleString()}/{maxExp.toLocaleString()} ({percent}%)
                              </strong>
                            </div>
                            <div className={styles.progressBarBg}>
                              <div
                                className={styles.progressBarFillCyan}
                                style={{ width: `${percent}%`, background: isEligible ? 'linear-gradient(90deg, #a855f7, #ff3fd5)' : 'linear-gradient(90deg, #0284c7, #38bdf8)' }}
                              />
                            </div>
                          </div>

                          <div style={{ fontSize: 11, color: '#fde047', marginTop: 4, fontWeight: 700 }}>
                            🎁 Thưởng vượt kiếp: +{rewardTM.toLocaleString()} Thiên Mệnh
                          </div>

                          {/* Single Clean Action Button for Độ Kiếp */}
                          <div className={styles.daoAnhActions} style={{ marginTop: 8 }}>
                            <button
                              className={isEligible ? 'btn-gold' : 'btn-ghost'}
                              style={{ width: '100%', fontSize: 11.5, padding: '8px 12px', fontWeight: 700 }}
                              onClick={() => handleSingleTribulation(da.id)}
                              disabled={!isEligible}
                            >
                              {isEligible 
                                ? `⚡ NGHÊNH TIẾP THIÊN KIẾP (Thành công: ${successChance}% ➔ +${rewardTM.toLocaleString()} TM)` 
                                : `🔒 CẦN TÍCH LŨY ≥ 80% LINH LỰC ĐỂ ĐỘ KIẾP (Hiện: ${percent}%)`}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className={styles.maxDaoAnhNotice} style={{ color: '#ffcc00', fontWeight: 700, textAlign: 'center', padding: '10px 0' }}>
                          👑 ĐẠO ANH ĐÃ VƯỢT QUA CỬU TRÙNG 5 KIẾP ĐẠI VIÊN MÃN (5 ANH CHIẾN LỰC)!
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================
            TAB 5: QUY TẮC TU TIÊN (RULES)
           ======================================================== */}
        {activeTab === 'rules' && (
          <div className={styles.rulesSection}>
            <div className={styles.ruleCard}>
              <h4>1. Quy Tắc Hấp Thu Linh Khí & Đường Cong EXP Lũy Tiến</h4>
              <p>• <strong>Luật Tĩnh Tâm Ngộ Đạo (60 Giây)</strong>: Đạo hữu ở lại đọc chương truyện đủ <strong>60 giây</strong> sẽ hấp thu ngẫu nhiên từ <strong>50 đến 100 Tu Vi</strong> (chu kỳ 60s lặp lại liên tục).</p>
              <p>• <strong>Đường Cong Tu Vi</strong>: Tu vi càng cao thì lượng linh lực cần để phá cảnh càng lớn (Ngưng Khí 1-10 tầng tăng lũy tiến, Trúc Cơ 120 pháp khiếu cần 8.400 EXP, Kim Đan cần 800 EXP/cung).</p>
            </div>

            <div className={styles.ruleCard}>
              <h4>2. Chiến Lực Theo Từng Cảnh Giới</h4>
              <p>• <strong>Ngưng Khí</strong>: Tính bằng <strong>Hổ</strong> (1 Tầng = 1 Hổ, 5 Hổ = 1 Tiêu, 2 Tiêu [10 Hổ] = 1 Bạt).</p>
              <p>• <strong>Trúc Cơ</strong>: Tính bằng <strong>Hỏa</strong> (Mệnh Hỏa, tối đa <strong>10 Hỏa</strong> gồm 5 hỏa tự thân + 5 Mệnh Đăng hấp thụ).</p>
              <p>• <strong>Kim Đan</strong>: Tính bằng <strong>Cung</strong> (Chỉ những cung nào đã hóa thành <strong>Cung Thật</strong> mới tính chiến lực, tối đa <strong>13 Cung</strong>).</p>
              <p>• <strong>Nguyên Anh</strong>: Tính bằng <strong>Anh</strong> (Tối đa 13 Đạo Anh × 5 Kiếp = <strong>65 Anh</strong>).</p>
            </div>

            <div className={styles.ruleCard}>
              <h4>3. Kim Đan Thiên Cung & Vật Trấn Áp</h4>
              <p>• <strong>Cung Tự Thân</strong>: Khi tích lũy linh lực đến <strong>99.99% (799/800 EXP)</strong> sẽ dừng lại, cần khảm nạm <strong>1 Vật Trấn Áp</strong> từ Túi Trữ Vật để đạt <strong>100% Cung Thật</strong>.</p>
              <p>• <strong>Chân Cung Mệnh Đăng</strong>: Cung hình thành từ Mệnh Đăng luôn luôn đạt <strong>100% Cung Thật</strong> tự động vì chính Mệnh Đăng là thần vật trấn áp tối thượng.</p>
              <p>• <strong>Hóa Đạo Anh</strong>: Bắt buộc toàn bộ 100% Thiên Cung phải hóa thành Cung Thật và tích lũy đủ 1.000 Tu Vi/cung để khai sinh Đạo Anh.</p>
            </div>

            <div className={styles.ruleCard}>
              <h4>4. Hệ Thống 72 Mệnh Đăng & 96 Vật Trấn Áp</h4>
              <p>• <strong>Phân Cấp Phẩm</strong>: <strong>Hạ Phẩm</strong> (Trắng) · <strong>Trung Phẩm</strong> (Xanh Lá) · <strong>Thượng Phẩm</strong> (Xanh Lam) · <strong>Cực Phẩm</strong> (Tím) · <strong>Tiên Phẩm</strong> (Kim Sắc) · <strong>Thần Phẩm</strong> (Đỏ Thần Thánh).</p>
              <p>• <strong>Tỉ lệ rơi</strong>: Cơ duyên nhặt được Mệnh Đăng (~15%) và Vật Trấn Áp (~20%) khi ngộ đạo 60s.</p>
              <p>• <strong>Tỉ Lệ Tiên Tinh</strong>: 1 Tu Vi = 5 Tiên Tinh. Có thể bán đèn / trấn vật không dùng để tích lũy Tiên Tinh mua bảo vật cấp cao!</p>
            </div>

            <div className={styles.ruleCard}>
              <h4>5. Lực Lượng Thiên Mệnh & Độ Kiếp Nguyên Anh</h4>
              <p>• <strong>Lực Thiên Mệnh</strong>: Đến cảnh giới <strong>Nguyên Anh / Giả Anh mới mở khóa</strong>, các cảnh dưới chưa có.</p>
              <p>• Quy đổi: 1 EXP = 10 Thiên Mệnh khi đọc sách ở Nguyên Anh.</p>
              <p>• <strong>Quy tắc độ kiếp</strong>: Đạt từ 70% Thiên Mệnh mở độ kiếp (50% thành công, mỗi +10% TM = +10% tỉ lệ).</p>
              <p>• <strong>Vạn Kiếp Tề Phi</strong>: Cùng lúc độ kiếp tất cả Đạo Anh, nhận thưởng thêm <strong>+50% Thiên Mệnh</strong>!</p>
            </div>
          </div>
        )}

        {/* ========================================================
            TAB 6: NHẬT KÝ CƠ DUYÊN (LOGS)
           ======================================================== */}
        {activeTab === 'logs' && (
          <div className={styles.logsSection}>
            {(cultivation?.logs || []).map((log, idx) => (
              <div key={idx} className={styles.logItem}>
                <span className={styles.logTime}>{new Date(log.time).toLocaleTimeString('vi-VN')}</span>
                <span className={styles.logText}>{log.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* ========================================================
            MODAL KHẢM NẠM VẬT TRẤN ÁP
           ======================================================== */}
        {anchorModalPalace !== null && (
          <div className={styles.anchorModalOverlay} onClick={() => setAnchorModalPalace(null)}>
            <div className={styles.anchorModalContent} onClick={e => e.stopPropagation()}>
              <div className={styles.anchorModalHeader}>
                <div>
                  <h3 style={{ margin: 0, color: '#ffcc00', fontSize: 16 }}>
                    👑 KHẢM NẠM VẬT TRẤN ÁP · THIÊN CUNG TỰ THÂN {anchorModalPalace + 1}
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                    Chọn một Pháp Khí, Công Pháp hoặc Dị Khí trong Túi Trữ Vật để trấn áp, hoàn tất 100% Cung Thật (+1 Cung chiến lực).
                  </p>
                </div>
                <button className={styles.modalCloseBtn} onClick={() => setAnchorModalPalace(null)}>✕</button>
              </div>

              {/* Danh sách vật phẩm có trong túi */}
              <div className={styles.anchorItemsList}>
                {(cultivation.inventoryArtifacts || []).length === 0 ? (
                  <div className={styles.emptyAnchorNotice}>
                    <p>Trong Túi Trữ Vật chưa có Vật Trấn Áp nào!</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Bạn có thể đọc thêm chương để nhặt cơ duyên hoặc sang tab <strong>"Trấn Cung Vật"</strong> để đổi bằng Tiên Tinh!
                    </p>
                    <button
                      className="btn-gold"
                      style={{ marginTop: 10, fontSize: 12 }}
                      onClick={() => {
                        setAnchorModalPalace(null);
                        setActiveTab('artifacts');
                      }}
                    >
                      👉 Đi Đến Cửa Hàng Trấn Cung Vật
                    </button>
                  </div>
                ) : (
                  (cultivation.inventoryArtifacts || []).map((artId, idx) => {
                    const art = (SUPPRESSING_ARTIFACTS || []).find(a => a.id === artId);
                    if (!art) return null;
                    const tierInfo = LAMP_TIERS[art.tier] || LAMP_TIERS.ha_pham;

                    return (
                      <div
                        key={`${artId}_${idx}`}
                        className={styles.anchorItemCard}
                        style={{ borderColor: tierInfo.color }}
                        onClick={() => {
                          triggerAction(
                            () => anchorPalace(anchorModalPalace, art.id),
                            `Đã khảm nạm thành công [${art.name}] vào Thiên Cung ${anchorModalPalace + 1}!`
                          );
                          setAnchorModalPalace(null);
                        }}
                      >
                        <span className={styles.anchorItemIcon}>{art.icon}</span>
                        <div className={styles.anchorItemMeta}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <strong style={{ color: tierInfo.color }}>{art.name}</strong>
                            <span
                              className="badge"
                              style={{
                                fontSize: 9.5,
                                padding: '2px 8px',
                                color: tierInfo.color,
                                borderColor: tierInfo.border,
                                backgroundColor: tierInfo.bg,
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                                borderRadius: 10,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {tierInfo.name}
                            </span>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{art.type} · "{art.poem}"</span>
                        </div>
                        <button className="btn-gold" style={{ fontSize: 11, padding: '4px 10px' }}>
                          Khảm Nạm
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            DANGER ZONE: TẢN ĐI TU VI (TRÙNG TU TỪ ĐẦU)
           ======================================================== */}
        <div className={styles.dangerZoneCard}>
          <div className={styles.dangerZoneHeader}>
            <span>💀 NGHỊCH THIÊN HÓA PHÀM · TẢN ĐI TU VI</span>
          </div>
          <p className={styles.dangerZoneDesc}>
            Tản đi toàn bộ tu vi hiện có, tán sạch toàn bộ 72 Mệnh Đăng và 96 Vật Trấn Áp đã thu thập và khảm nạm để hóa phàm trùng tu đạo lộ lại từ đầu.
          </p>
          <button
            className={styles.resetCultivationBtn}
            onClick={() => {
              if (
                confirm(
                  '⚠️ CẢNH BÁO TẢN ĐI TU VI:\n\nBạn có chắc chắn muốn TẢN ĐI TOÀN BỘ TU VI?\n\n• Toàn bộ cảnh giới, chiến lực, EXP, Tiên Tinh và Thiên Mệnh sẽ về 0 (Phàm Nhân / Ngưng Khí 1 Tầng).\n• Toàn bộ Mệnh Đăng và Vật Trấn Áp trong túi và đã khảm nạm sẽ MẤT HẾT VĨNH VIỄN!\n• Hành động này KHÔNG THỂ HOÀN TÁC!\n\nĐạo hữu có muốn tản công trùng tu lại từ đầu?'
                )
              ) {
                triggerAction(resetCultivation, 'Đã tản đi toàn bộ tu vi! Hóa phàm trùng tu đạo lộ từ đầu.');
              }
            }}
          >
            💀 TẢN ĐI TU VI (TRÙNG TU TỪ ĐẦU)
          </button>
        </div>
      </div>

      {/* Full-Screen Breakthrough Celebration Overlay */}
      {breakthroughData && (
        <BreakthroughModal data={breakthroughData} onClose={() => setBreakthroughData(null)} />
      )}

      {/* Interactive Tribulation Thunderstorm Overlay */}
      {tribulationModalData && (
        <TribulationModal activeData={tribulationModalData} onClose={() => setTribulationModalData(null)} />
      )}
    </BottomSheet>
  );
}
