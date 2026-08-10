import { useState } from 'react';
import BottomSheet from '../ui/BottomSheet';
import { useCultivation } from '../../hooks/useCultivation';
import RealmPreviewVisualizer from './RealmPreviewVisualizer';
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
    activateKimDanTrial,
    endKimDanTrial,
    activateNguyenAnhTrial,
    endNguyenAnhTrial,
    breakthroughToTrucCo,
    breakthroughToKimDan,
    attemptUnlock121,
    manifestDaoAnh,
    injectThienMenh,
    attemptTribulationSingle,
    attemptTribulationAll,
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

  const triggerAction = (fn, successMsg) => {
    try {
      const res = fn();
      if (res && res.message) {
        setActionMsg(res.message);
      } else if (res && res.resultMsg) {
        setActionMsg(res.resultMsg);
      } else if (successMsg) {
        setActionMsg(successMsg);
      }
      setTimeout(() => setActionMsg(''), 5000);
    } catch (err) {
      alert(err.message || 'Chưa đủ điều kiện.');
    }
  };

  const selfHoa = cultivation.selfMenhHoa || Math.floor(cultivation.phapKhieu / 30);
  const absorbedCount = (cultivation.absorbedLamps || []).length;
  const artifactCount = (cultivation.inventoryArtifacts || []).length;
  const isNguyenAnhStage = cultivation.realm === 'gia_anh' || cultivation.realm === 'nguyen_anh';
  const isTrialActive = cultivation.isNguyenAnhTrial || cultivation.isKimDanTrial;
  const currentTienTinh = cultivation.tienTinh !== undefined ? cultivation.tienTinh : (cultivation.dangDiem || 0);

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="✦ ĐẠO LỘ TU TIÊN ✦" fullHeight>
      <div className={styles.container}>
        {/* BANNER THẺ TRẢI NGHIỆM KIM ĐAN (NẾU ĐANG KÍCH HOẠT) */}
        {cultivation.isKimDanTrial && (
          <div className={styles.trialActiveBanner}>
            <div className={styles.trialBannerLeft}>
              <span className={styles.trialBannerIcon}>✨</span>
              <div>
                <h4 style={{ margin: 0, color: '#ffcc00', fontSize: 13 }}>ĐANG TRẢI NGHIỆM CẢNH GIỚI KIM ĐAN (TẠM THỜI)</h4>
                <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  Đang trải nghiệm Tòa Thiên Lâu 9 Cung và Khảm Nạm Trấn Cung Vật. Kết thúc bất cứ lúc nào để về lại cảnh giới cũ (Thẻ sẽ tiêu biến vĩnh viễn)!
                </p>
              </div>
            </div>
            <button
              className="btn-ghost"
              style={{
                borderColor: '#ef4444',
                color: '#ef4444',
                background: 'rgba(239, 68, 68, 0.12)',
                fontSize: 11.5,
                padding: '6px 12px',
                fontWeight: 700,
                flexShrink: 0,
              }}
              onClick={() => {
                if (confirm('KẾT THÚC TRẢI NGHIỆM KIM ĐAN:\n\n• Bạn có muốn kết thúc trải nghiệm và khôi phục lại cảnh giới & tu vi ban đầu?\n• Lưu ý: Thẻ trải nghiệm sẽ tiêu biến vĩnh viễn và không xuất hiện lại nữa!')) {
                  triggerAction(endKimDanTrial);
                }
              }}
            >
              ↩️ Kết Thúc & Hủy Thẻ
            </button>
          </div>
        )}

        {/* Realm Hero Card with Dedicated Visual Animation */}
        <div className={styles.realmHeroCard}>
          <div className={styles.realmGlowCircle} />

          <div className={styles.realmBadge}>
            {cultivation.realm === 'ngung_khi' && 'CẢNH GIỚI: NGƯNG KHÍ'}
            {cultivation.realm === 'truc_co' && 'CẢNH GIỚI: TRÚC CƠ'}
            {cultivation.realm === 'kim_dan' && (cultivation.isKimDanTrial ? 'CẢNH GIỚI: KIM ĐAN (TRẢI NGHIỆM)' : 'CẢNH GIỚI: KIM ĐAN')}
            {cultivation.realm === 'gia_anh' && 'CẢNH GIỚI: GIẢ ANH'}
            {cultivation.realm === 'nguyen_anh' && 'CẢNH GIỚI: NGUYÊN ANH'}
          </div>

          <h2 className={styles.realmTitle}>{displayName}</h2>

          {/* REALM-SPECIFIC ANIMATED VISUALIZER */}
          <RealmPreviewVisualizer cultivation={cultivation} />

          <div className={styles.statsRow}>
            <div className={styles.statBox}>
              <span className={styles.statLabel}>Chương đã đọc</span>
              <span className={styles.statVal}>{cultivation.chaptersReadCount}</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statLabel}>Số dư Tiên Tinh</span>
              <span className={styles.statValCyan}>{currentTienTinh.toLocaleString()} TT</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statLabel}>Chiến Lực</span>
              <span className={styles.statValGold}>{combatPowerDisplay}</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statLabel}>
                {isNguyenAnhStage ? 'Lực Thiên Mệnh' : 'Mệnh Đăng Hấp Thụ'}
              </span>
              {isNguyenAnhStage ? (
                <span className={styles.statValCyan}>{(cultivation.totalThienMenh || 0).toLocaleString()} TM</span>
              ) : (
                <span className={styles.statVal}>{absorbedCount} Đăng</span>
              )}
            </div>
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
          {isNguyenAnhStage && (
            <button
              className={`${styles.tabBtn} ${activeTab === 'nguyen_anh' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('nguyen_anh')}
            >
              Độ Kiếp Đài
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
            {/* THẺ TRẢI NGHIỆM KIM ĐAN (KHI CHƯA DÙNG VÀ CHƯA Ở KIM ĐAN) */}
            {!cultivation.hasUsedKimDanTrial && !cultivation.isKimDanTrial && cultivation.realm !== 'kim_dan' && cultivation.realm !== 'gia_anh' && cultivation.realm !== 'nguyen_anh' && (
              <div className={styles.trialCardOffer}>
                <div className={styles.trialCardOfferInfo}>
                  <span className={styles.trialOfferIcon}>📜</span>
                  <div>
                    <h4 style={{ color: '#ffcc00', margin: 0, fontSize: 13 }}>THẺ TRẢI NGHIỆM CẢNH GIỚI KIM ĐAN (1 LẦN DUY NHẤT)</h4>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                      Dùng thử cảnh giới Kim Đan, trải nghiệm Tòa Thiên Lâu 9 Cung và Khảm Nạm Trấn Cung Bảo Vật (Kết thúc sẽ khôi phục cảnh giới ban đầu và thẻ sẽ tiêu biến vĩnh viễn).
                    </p>
                  </div>
                </div>
                <button
                  className="btn-gold"
                  style={{ fontSize: 11.5, padding: '7px 14px', fontWeight: 700 }}
                  onClick={() => {
                    if (confirm('SỬ DỤNG THẺ TRẢI NGHIỆM KIM ĐAN:\n\n• Tạm thời thăng hoa lên cảnh giới Kim Đan (4 Cung Thật, Cung 5 đạt 99.99% chờ khảm nạm Trấn Cung Bảo Vật).\n• Cung cấp sẵn bảo vật và Tiên Tinh dùng thử.\n• Khi kết thúc sẽ khôi phục 100% cảnh giới và tu vi ban đầu của bạn!\n• Lưu ý: Thẻ chỉ dùng 1 lần duy nhất, kết thúc xong sẽ tiêu biến vĩnh viễn không xuất hiện lại nữa!\n\nĐạo hữu có muốn kích hoạt trải nghiệm ngay?')) {
                      triggerAction(activateKimDanTrial);
                    }
                  }}
                >
                  ✨ Dùng Thẻ Trải Nghiệm
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

                {/* 10 Meridian Rings Preview */}
                <div className={styles.levelsGrid}>
                  {Array.from({ length: 10 }).map((_, idx) => {
                    const lvl = idx + 1;
                    const isReached = cultivation.ngungKhiLevel >= lvl;
                    const isCurrent = cultivation.ngungKhiLevel === lvl;
                    return (
                      <div
                        key={lvl}
                        className={`${styles.levelPill} ${isReached ? styles.pillReached : ''} ${isCurrent ? styles.pillCurrent : ''}`}
                      >
                        <span>Tầng {lvl}</span>
                        <strong>{lvl === 10 ? '1 Bạt' : lvl >= 5 ? `1 Tiêu ${lvl - 5 || ''}` : `${lvl} Hổ`}</strong>
                      </div>
                    );
                  })}
                </div>

                {/* Breakthrough Button */}
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
                            {lamp?.icon || '🏮'}
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
                            {lamp5?.icon || '🏮'}
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
                <div className={styles.progressContainer}>
                  <div className={styles.progressInfo}>
                    <span>Pháp Khiếu tự thân khai mở:</span>
                    <strong>{cultivation.phapKhieu}/120 {cultivation.has121st && '(+ Khiếu 121)'}</strong>
                  </div>
                  <div className={styles.progressBarBg}>
                    <div
                      className={styles.progressBarFillGold}
                      style={{ width: `${Math.min(100, (cultivation.phapKhieu / 120) * 100)}%` }}
                    />
                  </div>
                </div>

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
                          <strong>{cultivation.attemptExp121}/800 Linh Lực</strong>
                        </div>
                        <div className={styles.progressBarBg}>
                          <div
                            className={styles.progressBarFillCyan}
                            style={{ width: `${Math.min(100, (cultivation.attemptExp121 / 800) * 100)}%` }}
                          />
                        </div>
                        {cultivation.attemptExp121 >= 800 ? (
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
                          <p className={styles.hintTextSmall}>Đọc thêm chương để tích tụ đủ 800 linh lực xung kích Pháp Khiếu 121 (Tỉ lệ: 50% thành công / 50% đóng kín vĩnh viễn).</p>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Breakthrough Kim Đan Buttons */}
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
              <div className={styles.realmDetailCard}>
                <h3 className={styles.cardHeader}>Thiên Cung Kim Đan</h3>
                <p className={styles.subtext}>
                  • Chiến lực ở Kim Đan tính bằng <strong>Cung</strong> (Chỉ những cung nào đã hóa thành <strong>Cung Thật</strong> mới tính là chiến lực chân chính).
                  <br />
                  • Đã Hóa Thực: <strong>{cultivation.realizedThienCung}/{cultivation.maxThienCung} Cung Thật</strong>.
                  <br />
                  • <strong>Quy Tắc Trấn Cung</strong>: Cung tự thân khi đạt 99.99% tích lũy linh lực sẽ dừng lại, cần khảm nạm <strong>1 Vật Trấn Áp</strong> để đạt 100% Cung Thật!
                </p>

                {/* Palace Grid */}
                <div className={styles.palaceGrid}>
                  {Array.from({ length: cultivation.maxThienCung }).map((_, i) => {
                    const palaceNum = i + 1;
                    const isRealized = cultivation.realizedThienCung >= palaceNum;
                    const isLampPalace = i >= (cultivation.maxThienCung - (cultivation.absorbedLamps || []).length);
                    const da = (cultivation.daoAnhs || []).find(d => d.palaceIndex === i);
                    const anchor = cultivation.palaceAnchors?.[i];
                    const isBottleneck = !isRealized && i === cultivation.realizedThienCung && cultivation.currentThienCungExp >= 799;

                    return (
                      <div
                        key={palaceNum}
                        className={`${styles.palaceCard} ${isRealized ? styles.palaceRealized : isBottleneck ? styles.palaceBottleneck : ''} ${da ? styles.palaceDaoAnh : ''}`}
                      >
                        <span className={styles.palaceIcon}>{da ? '👑' : anchor ? anchor.icon : isLampPalace ? '🏮' : isRealized ? '🏛️' : isBottleneck ? '🔑' : '☁️'}</span>
                        <span className={styles.palaceName}>
                          {da ? `${da.name} (${da.currentKiep}K)` : anchor ? `Cung ${palaceNum} (${anchor.shortName})` : `Thiên Cung ${palaceNum}`}
                        </span>
                        <span className={styles.palaceStatus}>
                          {da ? `✦ ${da.currentKiep} Anh` : anchor ? `✦ Trấn: ${anchor.name}` : isLampPalace ? 'Chân Cung Đăng (Thật)' : isRealized ? '✦ Cung Thật' : isBottleneck ? '⚠️ Cần Trấn Vật (99.9%)' : 'Hư Ảo'}
                        </span>

                        {/* Button Hóa Đạo Anh khi toàn bộ cung đã hóa thật 100% */}
                        {isRealized && !da && (
                          cultivation.realizedThienCung === cultivation.maxThienCung ? (
                            <button
                              className={styles.miniManifestBtn}
                              onClick={() => {
                                if (
                                  confirm(
                                    `XÁC NHẬN HÓA ĐẠO ANH:\n\n• Thiên Cung: Cung ${palaceNum}\n• Chi phí: 1.000 Tu Vi (Linh lực thai nghén Đạo Anh)\n\nĐạo hữu có muốn tiêu hao 1.000 Tu Vi để thai nghén và khai sinh Đạo Anh tại Thiên Cung này?`
                                  )
                                ) {
                                  triggerAction(() => manifestDaoAnh(i), `Đã chuyển hóa thành công Thiên Cung ${palaceNum} thành Đạo Anh!`);
                                }
                              }}
                            >
                              👑 Hóa Đạo Anh (1k EXP)
                            </button>
                          ) : (
                            <span style={{ fontSize: 8.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              Chờ Hóa Thật Hết
                            </span>
                          )
                        )}

                        {/* Button Khảm Nạm nhanh khi cung đang ở 99.99% */}
                        {isBottleneck && (
                          <button
                            className={styles.miniAnchorBtn}
                            onClick={() => setAnchorModalPalace(i)}
                          >
                            🔑 Khảm Nạm Trấn Vật
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Progress or Bottleneck Banner */}
                {cultivation.realizedThienCung < cultivation.maxThienCung ? (
                  cultivation.currentThienCungExp >= 799 ? (
                    <div className={styles.bottleneckNoticeCard}>
                      <div className={styles.bottleneckNoticeHead}>
                        <span style={{ fontSize: 18 }}>⚠️</span>
                        <div>
                          <h4 style={{ color: '#f97316', margin: 0, fontSize: 13.5 }}>
                            THIÊN CUNG {cultivation.realizedThienCung + 1} ĐÃ ĐẠT 99.99% TÍCH LŨY!
                          </h4>
                          <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--text-secondary)' }}>
                            Linh lực đã đạt cực hạn (799/800 EXP). Cần khảm nạm một <strong>Vật Trấn Áp (Pháp Khí, Dị Khí, Công Pháp...)</strong> để phá vỡ bình cảnh, hoàn tất <strong>100% Cung Thật</strong>!
                          </p>
                        </div>
                      </div>
                      <button
                        className={`btn-gold ${styles.breakthroughBtn}`}
                        onClick={() => setAnchorModalPalace(cultivation.realizedThienCung)}
                        style={{ marginTop: 8 }}
                      >
                        <div className={styles.btnContentWrap}>
                          <span className={styles.btnMainTitle}>👑 KHẢM NẠM VẬT TRẤN ÁP NGAY</span>
                          <span className={styles.btnSubInfo}>Chọn bảo vật trong túi hoặc đổi bằng Tiên Tinh để đạt 100% Cung Thật</span>
                        </div>
                      </button>
                    </div>
                  ) : (
                    <div className={styles.progressContainer}>
                      <div className={styles.progressInfo}>
                        <span>Tiến độ Hóa Thực Thiên Cung {cultivation.realizedThienCung + 1} thành Cung Thật:</span>
                        <strong>{cultivation.currentThienCungExp}/800 Linh Lực</strong>
                      </div>
                      <div className={styles.progressBarBg}>
                        <div
                          className={styles.progressBarFillCyan}
                          style={{ width: `${Math.min(100, (cultivation.currentThienCungExp / 800) * 100)}%` }}
                        />
                      </div>
                      <p className={styles.hintText}>📖 Đọc thêm chương để ngưng tụ linh lực Hóa Thực Thiên Cung tiếp theo (+1 Cung chiến lực)!</p>
                    </div>
                  )
                ) : (
                  <div className={styles.maxRankBadge}>
                    ✨ TOÀN BỘ {cultivation.maxThienCung} THIÊN CUNG ĐÃ HÓA THÀNH CUNG THẬT 100%!
                    {cultivation.realm === 'kim_dan' && (
                      <p style={{ marginTop: 6, fontSize: 12, color: 'var(--accent-cyan)', fontWeight: 'normal' }}>
                        👉 Nhấn "👑 Hóa Đạo Anh" trên từng cung để ngưng tụ Đạo Anh Thần Thể mở khóa cảnh giới <strong>Nguyên Anh (Chiến lực tính bằng Anh)</strong>!
                      </p>
                    )}
                  </div>
                )}
              </div>
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
            <div className={styles.tierFilterRow}>
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

            {/* List of 72 Life Lamps */}
            <div className={styles.lampCardsGrid}>
              {LIFE_LAMPS.filter(lamp => tierFilter === 'all' || lamp.tier === tierFilter).map(lamp => {
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
                      <span className={styles.lampIcon} style={{ textShadow: `0 0 12px ${tierInfo.color}` }}>
                        {lamp.icon}
                      </span>
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
                            (cultivation.realm === 'truc_co' && selfHoa < 1)
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
                            if (
                              confirm(
                                `XÁC NHẬN BÁN MỆNH ĐĂNG:\n\n• Mệnh Đăng: [${tierInfo.name}] ${lamp.name}\n• Nhận lại: +${totalCostTienTinh.toLocaleString()} Tiên Tinh (Tỉ lệ 1:5)\n\nĐạo hữu có muốn bán chiếc đèn này để tích lũy Tiên Tinh?`
                              )
                            ) {
                              triggerAction(() => sellLamp(lamp.id), `Đã bán thành công ${lamp.name}! Nhận +${totalCostTienTinh.toLocaleString()} Tiên Tinh.`);
                            }
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
            <div className={styles.tierFilterRow}>
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

            {/* List of 96 Suppressing Artifacts */}
            <div className={styles.lampCardsGrid}>
              {(SUPPRESSING_ARTIFACTS || []).filter(a => artifactTierFilter === 'all' || a.tier === artifactTierFilter).map(art => {
                const invCount = (cultivation.inventoryArtifacts || []).filter(id => id === art.id).length;
                const isInInventory = invCount > 0;
                const tierInfo = LAMP_TIERS[art.tier] || LAMP_TIERS.ha_pham;
                const costTienTinh = tierInfo.tienTinh || tierInfo.dangDiem || (tierInfo.priceExp * 5);
                const canCover = currentTienTinh >= costTienTinh;
                const deficitExp = Math.max(0, Math.ceil((costTienTinh - currentTienTinh) / 5));

                return (
                  <div
                    key={art.id}
                    className={`${styles.lampCard} ${isInInventory ? styles.lampEquipped : styles.lampLocked}`}
                    style={{ borderColor: isInInventory ? tierInfo.color : 'var(--border-subtle)' }}
                  >
                    <div className={styles.lampCardTop}>
                      <span className={styles.lampIcon} style={{ textShadow: `0 0 12px ${tierInfo.color}` }}>
                        {art.icon}
                      </span>
                      <div className={styles.lampNameCol}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <h4 className={styles.lampName} style={{ color: isInInventory ? tierInfo.color : 'var(--text-muted)' }}>
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
                        {isInInventory ? (
                          <span className="badge badge-gold">Sở Hữu x{invCount}</span>
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
                              if (confirm(`BÁN VẬT TRẤN ÁP:\n\n• Vật phẩm: [${tierInfo.name}] ${art.name}\n• Nhận lại: +${costTienTinh.toLocaleString()} Tiên Tinh\n\nBạn có muốn bán vật phẩm này?`)) {
                                triggerAction(() => sellArtifact(art.id), `Đã bán ${art.name}, nhận +${costTienTinh.toLocaleString()} Tiên Tinh!`);
                              }
                            }}
                          >
                            💰 Bán (+{costTienTinh.toLocaleString()} TT)
                          </button>
                        </>
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
                            ? `✨ Đổi (${costTienTinh.toLocaleString()} TT)`
                            : currentTienTinh > 0
                            ? `🔥 ${currentTienTinh.toLocaleString()} TT + Đốt ${deficitExp.toLocaleString()} EXP`
                            : `🔥 Đốt ${(tierInfo.priceExp || 500).toLocaleString()} Tu Vi Đổi`}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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
                  <h3 className={styles.cardHeader}>Độ Kiếp Đài</h3>
                  <p className={styles.subtext}>
                    Chiến lực ở Nguyên Anh tính bằng <strong>Anh</strong> (Tối đa 65 Anh). Tích tụ Thiên Mệnh vào từng Đạo Anh để vượt qua <strong>5 Kiếp Luân Hồi</strong> (Mỗi kiếp = +1 Anh chiến lực).
                  </p>
                </div>
              </div>

              {/* Vạn Kiếp Tề Phi button */}
              <button
                className={`btn-gold ${styles.massTribulationBtn}`}
                onClick={() => triggerAction(attemptTribulationAll)}
              >
                ⚡ VẠN KIẾP TỀ PHI (TOÀN BỘ ĐẠO ANH CÙNG VƯỢT KIẾP · THƯỞNG +50% THIÊN MỆNH)
              </button>
            </div>

            {/* List of Dao Anhs */}
            {(!cultivation.daoAnhs || cultivation.daoAnhs.length === 0) ? (
              <div className={styles.emptyDaoAnhNotice}>
                <p>Chưa có Đạo Anh nào. Hãy Hóa Thực toàn bộ Thiên Cung ở Kim Đan rồi Hóa Đạo Anh để bắt đầu hành trình Độ Kiếp!</p>
              </div>
            ) : (
              <div className={styles.daoAnhCardsGrid}>
                {cultivation.daoAnhs.map(da => {
                  const percent = Math.min(100, Math.floor((da.currentThienMenh / da.maxThienMenh) * 100));
                  const isEligible = percent >= 70;
                  const successChance = Math.min(100, 50 + (percent - 70));

                  return (
                    <div
                      key={da.id}
                      className={`${styles.daoAnhCard} ${da.currentKiep >= 5 ? styles.daoAnhMax : ''} ${da.fromLamp ? styles.daoAnhLampProtected : ''}`}
                    >
                      <div className={styles.daoAnhTop}>
                        <span className={styles.daoAnhIcon}>{da.fromLamp ? '🏮' : '👑'}</span>
                        <div className={styles.daoAnhInfo}>
                          <h4 className={styles.daoAnhTitle}>{da.name}</h4>
                          <span className={styles.daoAnhBadge}>
                            Kiếp {da.currentKiep}/5 · {da.currentKiep} Anh Chiến Lực
                            {da.fromLamp && ' · (Mệnh Đăng Bảo Hộ)'}
                          </span>
                        </div>
                      </div>

                      {/* Kiep Progress Rings */}
                      <div className={styles.kiepRingsRow}>
                        {[1, 2, 3, 4, 5].map(k => (
                          <div
                            key={k}
                            className={`${styles.kiepDot} ${da.currentKiep >= k ? styles.kiepPassed : ''}`}
                            title={`Kiếp thứ ${k}`}
                          >
                            <span>{k}K</span>
                          </div>
                        ))}
                      </div>

                      {da.currentKiep < 5 ? (
                        <>
                          {/* Progress Bar Thiên Mệnh */}
                          <div className={styles.progressContainer}>
                            <div className={styles.progressInfo}>
                              <span>Tiến độ nạp Thiên Mệnh:</span>
                              <strong>{da.currentThienMenh.toLocaleString()}/{da.maxThienMenh.toLocaleString()} TM ({percent}%)</strong>
                            </div>
                            <div className={styles.progressBarBg}>
                              <div
                                className={styles.progressBarFillCyan}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className={styles.daoAnhActions}>
                            {/* Quick Inject Buttons */}
                            <div className={styles.injectGroup}>
                              <button
                                className="btn-ghost"
                                style={{ fontSize: 11, padding: '4px 8px' }}
                                onClick={() => triggerAction(() => injectThienMenh(da.id, 500), `Đã nạp +500 Thiên Mệnh vào ${da.name}`)}
                                disabled={(cultivation.totalThienMenh || 0) < 500 || da.currentThienMenh >= da.maxThienMenh}
                              >
                                +500 TM
                              </button>
                              <button
                                className="btn-ghost"
                                style={{ fontSize: 11, padding: '4px 8px' }}
                                onClick={() => triggerAction(() => injectThienMenh(da.id, 1000), `Đã nạp +1.000 Thiên Mệnh vào ${da.name}`)}
                                disabled={(cultivation.totalThienMenh || 0) < 1000 || da.currentThienMenh >= da.maxThienMenh}
                              >
                                +1000 TM
                              </button>
                              <button
                                className="btn-ghost"
                                style={{ fontSize: 11, padding: '4px 8px' }}
                                onClick={() => triggerAction(() => injectThienMenh(da.id, da.maxThienMenh - da.currentThienMenh), `Đã nạp đầy Thiên Mệnh vào ${da.name}`)}
                                disabled={(cultivation.totalThienMenh || 0) <= 0 || da.currentThienMenh >= da.maxThienMenh}
                              >
                                Nạp Đầy
                              </button>
                            </div>

                            {/* Tribulation Button */}
                            <button
                              className={isEligible ? 'btn-gold' : 'btn-ghost'}
                              style={{ fontSize: 12, padding: '6px 14px', fontWeight: 600 }}
                              onClick={() => triggerAction(() => attemptTribulationSingle(da.id))}
                              disabled={!isEligible}
                            >
                              {isEligible ? `⚡ Độ Kiếp (${successChance}% Thành Công)` : `Độ Kiếp (Cần >= 70% TM)`}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className={styles.maxDaoAnhNotice}>
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
              <p>• <strong>Tỉ lệ rơi</strong>: Cơ duyên nhặt được Mệnh Đăng (~7.5%) và Vật Trấn Áp (~12%) khi ngộ đạo 60s.</p>
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
            {cultivation.logs.map((log, idx) => (
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
                    👑 KHẢM NẠM VẬT TRẤN ÁP · THIÊN CUNG {anchorModalPalace + 1}
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
                            <span className="badge" style={{ fontSize: 8.5, padding: '1px 5px', color: tierInfo.color, borderColor: tierInfo.border, backgroundColor: tierInfo.bg }}>
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
    </BottomSheet>
  );
}
