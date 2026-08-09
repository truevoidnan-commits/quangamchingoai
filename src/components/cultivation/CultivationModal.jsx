import { useState } from 'react';
import BottomSheet from '../ui/BottomSheet';
import { useCultivation } from '../../hooks/useCultivation';
import styles from './CultivationModal.module.css';

export default function CultivationModal({ isOpen, onClose }) {
  const {
    cultivation,
    displayName,
    combatPowerDisplay,
    absorbLamp,
    breakthroughToTrucCo,
    breakthroughToKimDan,
    attemptUnlock121,
    manifestDaoAnh,
    injectThienMenh,
    attemptTribulationSingle,
    attemptTribulationAll,
    debugAddChapter,
    debugGiveAllLamps,
    resetCultivation,
    LIFE_LAMPS,
    LAMP_TIERS,
  } = useCultivation();

  const [activeTab, setActiveTab] = useState('status'); // 'status' | 'lamps' | 'nguyen_anh' | 'rules' | 'logs'
  const [tierFilter, setTierFilter] = useState('all');
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
  const isNguyenAnhStage = cultivation.realm === 'gia_anh' || cultivation.realm === 'nguyen_anh';

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="✦ ĐẠO LỘ TU TIÊN ✦" fullHeight>
      <div className={styles.container}>
        {/* Realm Hero Card */}
        <div className={styles.realmHeroCard}>
          <div className={styles.realmGlowCircle} />

          <div className={styles.realmIconRow}>
            {cultivation.realm === 'ngung_khi' && <span className={styles.realmIcon}>⚡</span>}
            {cultivation.realm === 'truc_co' && <span className={styles.realmIcon}>🔥</span>}
            {cultivation.realm === 'kim_dan' && <span className={styles.realmIcon}>🏛️</span>}
            {cultivation.realm === 'gia_anh' && <span className={styles.realmIcon}>✨</span>}
            {cultivation.realm === 'nguyen_anh' && <span className={styles.realmIcon}>👑</span>}
          </div>

          <div className={styles.realmBadge}>
            {cultivation.realm === 'ngung_khi' && 'CẢNH GIỚI: NGƯNG KHÍ'}
            {cultivation.realm === 'truc_co' && 'CẢNH GIỚI: TRÚC CƠ'}
            {cultivation.realm === 'kim_dan' && 'CẢNH GIỚI: KIM ĐAN'}
            {cultivation.realm === 'gia_anh' && 'CẢNH GIỚI: GIẢ ANH'}
            {cultivation.realm === 'nguyen_anh' && 'CẢNH GIỚI: NGUYÊN ANH'}
          </div>

          <h2 className={styles.realmTitle}>{displayName}</h2>

          <div className={styles.statsRow}>
            <div className={styles.statBox}>
              <span className={styles.statLabel}>Chương đã đọc</span>
              <span className={styles.statVal}>{cultivation.chaptersReadCount}</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statLabel}>Tổng Tu Vi</span>
              <span className={styles.statVal}>{cultivation.totalExp.toLocaleString()}</span>
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
                <span className={styles.statVal}>{absorbedCount}/5 Đăng</span>
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
            Mệnh Đăng ({absorbedCount}/5 Đã Hấp Thụ)
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
            TAB 1: CẢNH GIỚI TIẾN TRÌNH (STATUS)
           ======================================================== */}
        {activeTab === 'status' && (
          <div className={styles.statusSection}>
            {/* NGƯNG KHÍ VIEW */}
            {cultivation.realm === 'ngung_khi' && (
              <div className={styles.realmDetailCard}>
                <h3 className={styles.cardHeader}>
                  Ngưng Khí Thập Tầng · Chiến Lực: <span style={{ color: '#ffcc00' }}>{combatPowerDisplay}</span>
                </h3>
                <p className={styles.subtext}>
                  • Chiến lực tính bằng <strong>Hổ</strong> (1 tầng = 1 Hổ, 5 Hổ = 1 Tiêu, 2 Tiêu [10 Hổ] = 1 Bạt).
                  <br />
                  • Đọc thêm chương để hấp thu thiên địa linh khí thăng cấp kinh mạch.
                </p>

                <div className={styles.gridSteps}>
                  {Array.from({ length: 10 }).map((_, i) => {
                    const lvl = i + 1;
                    const isReached = cultivation.ngungKhiLevel >= lvl;
                    const isCurrent = cultivation.ngungKhiLevel === lvl;
                    const hoStr = lvl === 10 ? '1 Bạt' : lvl >= 5 ? `1 Tiêu ${lvl - 5 > 0 ? `${lvl - 5}H` : ''}` : `${lvl} Hổ`;

                    return (
                      <div
                        key={lvl}
                        className={`${styles.stepDot} ${isReached ? styles.stepDotReached : ''} ${isCurrent ? styles.stepDotCurrent : ''}`}
                      >
                        <span className={styles.stepNum}>{lvl}</span>
                        <span className={styles.stepName}>{hoStr}</span>
                      </div>
                    );
                  })}
                </div>

                <div className={styles.progressContainer}>
                  <div className={styles.progressInfo}>
                    <span>Tiến độ Ngưng Khí:</span>
                    <strong>{Math.min(100, Math.round((cultivation.expCurrentRealm / 1500) * 100))}%</strong>
                  </div>
                  <div className={styles.progressBarBg}>
                    <div
                      className={styles.progressBarFill}
                      style={{ width: `${Math.min(100, (cultivation.expCurrentRealm / 1500) * 100)}%` }}
                    />
                  </div>
                </div>

                {cultivation.readyBreakthroughTrucCo ? (
                  <button
                    className={`btn-gold ${styles.breakthroughBtn}`}
                    onClick={() => triggerAction(breakthroughToTrucCo, 'Trúc Cơ Thành Công! Tẩy kinh phạt tủy mở Pháp Khiếu đầu tiên!')}
                  >
                    🔥 ĐỘT PHÁ TRÚC CƠ
                  </button>
                ) : (
                  <p className={styles.hintText}>
                    💡 Cần đọc thêm để đạt <strong>Ngưng Khí Tầng 10 Đại Viên Mãn (1 Bạt)</strong> trước khi Trúc Cơ.
                  </p>
                )}
              </div>
            )}

            {/* TRÚC CƠ VIEW */}
            {cultivation.realm === 'truc_co' && (
              <div className={styles.realmDetailCard}>
                <h3 className={styles.cardHeader}>
                  Trúc Cơ: {cultivation.phapKhieu}/120 Pháp Khiếu · Chiến Lực: <span style={{ color: '#ffcc00' }}>{combatPowerDisplay} (Tối đa 10 Hỏa)</span>
                </h3>
                <p className={styles.subtext}>
                  • Chiến lực tính bằng <strong>Hỏa</strong> (Mệnh Hỏa).
                  <br />
                  • Mệnh Hỏa tự thân: <strong>{selfHoa} Hỏa</strong> ({cultivation.phapKhieu}/120 khiếu) {cultivation.has121st && '+ 1 Hỏa (Khiếu 121)'}.
                  <br />
                  • Mệnh Đăng đã hấp thụ: <strong>{absorbedCount}/5 Đăng</strong> (+{absorbedCount} Hỏa chiến lực).
                </p>

                {/* 5 Flames Visual */}
                <div className={styles.flameRow}>
                  {[1, 2, 3, 4, 5].map((num) => {
                    const totalHoa = (selfHoa + (cultivation.has121st ? 1 : 0) + absorbedCount);
                    const isLit = totalHoa >= num;
                    const isSecret = num === 5;
                    return (
                      <div
                        key={num}
                        className={`${styles.flameCard} ${isLit ? styles.flameLit : ''} ${isSecret ? styles.flameSecret : ''}`}
                      >
                        <span className={styles.flameIcon}>{isLit ? '🔥' : '🕯️'}</span>
                        <span className={styles.flameName}>
                          {isSecret ? 'Khiếu 121' : `Mệnh Hỏa ${num}`}
                        </span>
                        <span className={styles.flameStatus}>
                          {isLit ? (isSecret ? '✦ Cực Cảnh' : 'Đã Thắp') : isSecret ? 'Bí Ẩn' : `${(num - 1) * 30 + 1}-${num * 30}`}
                        </span>
                      </div>
                    );
                  })}
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
                            🌟 XUNG KÍCH MỞ PHÁP KHIẾU 121 (50% Thành Công / 50% Đóng Kín Vĩnh Viễn)
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
                      🏛️ ĐỘT PHÁ KIM ĐAN (Trần {(selfHoa + (cultivation.has121st ? 1 : 0)) === 3 ? '6' : (selfHoa + (cultivation.has121st ? 1 : 0)) === 4 ? '7' : '8'} Cung Tự Thân + {absorbedCount} Chân Cung Mệnh Đăng)
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
                <h3 className={styles.cardHeader}>
                  Thiên Cung Kim Đan · Chiến Lực: <span style={{ color: '#ffcc00' }}>{combatPowerDisplay} (Tối đa 13 Cung)</span>
                </h3>
                <p className={styles.subtext}>
                  • Chiến lực ở Kim Đan tính bằng <strong>Cung</strong> (Chỉ những cung nào đã hóa thành <strong>Cung Thật</strong> mới tính là chiến lực chân chính).
                  <br />
                  • Đã Hóa Thực: <strong>{cultivation.realizedThienCung}/{cultivation.maxThienCung} Cung Thật</strong>.
                </p>

                {/* Palace Grid */}
                <div className={styles.palaceGrid}>
                  {Array.from({ length: cultivation.maxThienCung }).map((_, i) => {
                    const palaceNum = i + 1;
                    const isRealized = cultivation.realizedThienCung >= palaceNum;
                    const isLampPalace = i >= (cultivation.maxThienCung - (cultivation.absorbedLamps || []).length);
                    const da = (cultivation.daoAnhs || []).find(d => d.palaceIndex === i);

                    return (
                      <div
                        key={palaceNum}
                        className={`${styles.palaceCard} ${isRealized ? styles.palaceRealized : ''} ${da ? styles.palaceDaoAnh : ''}`}
                      >
                        <span className={styles.palaceIcon}>{da ? '👑' : isLampPalace ? '🏮' : isRealized ? '🏛️' : '☁️'}</span>
                        <span className={styles.palaceName}>
                          {da ? `${da.name} (${da.currentKiep}K)` : `Thiên Cung ${palaceNum}`}
                        </span>
                        <span className={styles.palaceStatus}>
                          {da ? `✦ ${da.currentKiep} Anh` : isLampPalace ? 'Chân Cung Đăng (Thật)' : isRealized ? '✦ Cung Thật' : 'Hư Ảo'}
                        </span>
                        {isRealized && !da && (
                          <button
                            className={styles.miniManifestBtn}
                            onClick={() => triggerAction(() => manifestDaoAnh(i), `Đã chuyển hóa Thiên Cung ${palaceNum} thành Đạo Anh!`)}
                          >
                            Hóa Đạo Anh
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {cultivation.realizedThienCung < cultivation.maxThienCung ? (
                  <div className={styles.progressContainer}>
                    <div className={styles.progressInfo}>
                      <span>Tiến độ Hóa Thực Thiên Cung {cultivation.realizedThienCung + 1} thành Cung Thật:</span>
                      <strong>{cultivation.currentThienCungExp}/500 Linh Lực</strong>
                    </div>
                    <div className={styles.progressBarBg}>
                      <div
                        className={styles.progressBarFillCyan}
                        style={{ width: `${Math.min(100, (cultivation.currentThienCungExp / 500) * 100)}%` }}
                      />
                    </div>
                    <p className={styles.hintText}>📖 Đọc thêm chương để ngưng tụ linh lực Hóa Thực Thiên Cung tiếp theo (+1 Cung chiến lực)!</p>
                  </div>
                ) : (
                  <div className={styles.maxRankBadge}>
                    ✨ TOÀN BỘ {cultivation.maxThienCung} THIÊN CUNG ĐÃ HÓA THÀNH CUNG THẬT 100%!
                    {cultivation.realm === 'kim_dan' && (
                      <p style={{ marginTop: 6, fontSize: 12, color: 'var(--accent-cyan)', fontWeight: 'normal' }}>
                        👉 Nhấn "Hóa Đạo Anh" trên từng cung để mở khóa cảnh giới <strong>Nguyên Anh (Chiến lực tính bằng Anh)</strong>!
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Quick Test Toolbar */}
            <div className={styles.devToolsBox}>
              <span className={styles.devToolsTitle}>Trải nghiệm nhanh tu vi:</span>
              <div className={styles.devBtnsRow}>
                <button className="btn-ghost" onClick={() => triggerAction(debugAddChapter, '+60 Tu Vi')}>
                  ⚡ Đọc 1 Chương
                </button>
                <button className="btn-ghost" onClick={() => triggerAction(debugGiveAllLamps, 'Đã nhận đủ 8 Mệnh Đăng!')}>
                  🎁 Nhận 8 Mệnh Đăng
                </button>
                <button className="btn-ghost" onClick={() => triggerAction(() => debugGiveThienMenh(5000), '+5000 Thiên Mệnh!')}>
                  ✨ +5000 Thiên Mệnh
                </button>
                <button
                  className="btn-danger"
                  style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => {
                    if (confirm('Khởi tạo lại toàn bộ tu vi về ban đầu?')) {
                      resetCultivation();
                      setActionMsg('Đã khởi tạo lại tu vi.');
                    }
                  }}
                >
                  ↺ Reset
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            TAB 2: KHO MỆNH ĐĂNG (LIFE LAMPS)
           ======================================================== */}
        {activeTab === 'lamps' && (
          <div className={styles.lampsSection}>
            <div className={styles.lampsBannerCard}>
              <img src="/menh-dang-collection.png" alt="Bộ sưu tập Mệnh Đăng" className={styles.lampsArtImg} />
              <div className={styles.lampsBannerInfo}>
                <h3 className={styles.lampsBannerTitle}>Tam Thập Mệnh Đăng Thần Thoại (30 Thần Đăng)</h3>
                <p className={styles.subtext}>
                  • <strong>6 Cấp Phẩm Độ Hiếm</strong>: <span style={{ color: '#e2e8f0' }}>Hạ Phẩm (Trắng)</span> · <span style={{ color: '#10b981' }}>Trung Phẩm (Xanh Lá)</span> · <span style={{ color: '#06b6d4' }}>Thượng Phẩm (Xanh Lam)</span> · <span style={{ color: '#a855f7' }}>Cực Phẩm (Tím)</span> · <span style={{ color: '#f59e0b' }}>Tiên Phẩm (Kim)</span> · <span style={{ color: '#ef4444' }}>Thần Phẩm (Đỏ)</span>.
                  <br />
                  • <strong>Quy tắc Hấp Thụ</strong>: Tối đa hấp thụ <strong>5 Mệnh Đăng</strong>. Một khi chọn hấp thụ thì <strong>KHÔNG HOÀN TRẢ</strong>!
                  <br />
                  • Ở Trúc Cơ: Mỗi Mệnh Đăng hấp thụ = <strong>+1 Hỏa</strong>.
                  <br />
                  • Ở Kim Đan: Mỗi Mệnh Đăng hấp thụ = <strong>+1 Cung Thật</strong> (hóa thực sẵn 100% không tốn EXP).
                  <br />
                  • Ở Nguyên Anh: Đạo Anh từ Mệnh Đăng khi vượt kiếp thất bại <strong>chỉ giảm về 50% Thiên Mệnh</strong> thay vì mất trắng!
                </p>
                <div style={{ marginTop: 8 }}>
                  <span className="badge badge-gold">Đã Hấp Thụ: {absorbedCount}/5 Mệnh Đăng</span>
                </div>
              </div>
            </div>

            {/* Tier Filters Bar */}
            <div className={styles.tierFilterRow}>
              <button
                className={`${styles.tierFilterBtn} ${tierFilter === 'all' ? styles.tierFilterActive : ''}`}
                onClick={() => setTierFilter('all')}
              >
                Tất Cả (30)
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

            {/* List of 30 Life Lamps */}
            <div className={styles.lampCardsGrid}>
              {LIFE_LAMPS.filter(lamp => tierFilter === 'all' || lamp.tier === tierFilter).map(lamp => {
                const isAbsorbed = (cultivation.absorbedLamps || []).includes(lamp.id);
                const isInInventory = (cultivation.inventoryLamps || []).includes(lamp.id);
                const isOwned = isAbsorbed || isInInventory;
                const tierInfo = LAMP_TIERS[lamp.tier] || { name: 'Hạ Phẩm', color: '#e2e8f0', bg: 'rgba(226, 232, 240, 0.1)', border: 'rgba(226, 232, 240, 0.3)' };

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
                        {!isOwned && <span className="badge" style={{ opacity: 0.4 }}>Chưa Nhặt Được</span>}
                      </div>
                    </div>

                    <p className={styles.lampDesc}>{lamp.desc}</p>

                    {/* Action buttons */}
                    {isInInventory && (
                      <div className={styles.lampActions}>
                        <button
                          className="btn-gold"
                          style={{ fontSize: 12, padding: '6px 12px', width: '100%' }}
                          disabled={
                            absorbedCount >= 5 ||
                            cultivation.realm === 'ngung_khi' ||
                            isNguyenAnhStage ||
                            (cultivation.realm === 'truc_co' && selfHoa < 1)
                          }
                          onClick={() => {
                            const realmBenefit = cultivation.realm === 'truc_co' ? '+1 Hỏa chiến lực' : '+1 Cung Thật chiến lực';
                            if (confirm(`XÁC NHẬN HẤP THỤ [${lamp.name}] (${tierInfo.name})?\n\n• Lưu ý: Một khi hấp thụ sẽ vĩnh viễn dung nhập đạo cơ, KHÔNG THỂ HOÀN TRẢ!\n• Tác dụng: ${realmBenefit}.\n• Giới hạn: ${absorbedCount}/5 Mệnh Đăng.`)) {
                              triggerAction(() => absorbLamp(lamp.id), `Đã hấp thụ thành công ${lamp.name}! (${realmBenefit})`);
                            }
                          }}
                        >
                          {isNguyenAnhStage
                            ? 'Nguyên Anh Không Thể Hấp Thụ'
                            : cultivation.realm === 'ngung_khi'
                            ? 'Ngưng Khí Chưa Dùng Được'
                            : cultivation.realm === 'truc_co' && selfHoa < 1
                            ? 'Cần Mở Mệnh Hỏa ở Trúc Cơ'
                            : absorbedCount >= 5
                            ? 'Đã Đạt Tối Đa 5 Mệnh Đăng'
                            : cultivation.realm === 'truc_co'
                            ? '🏮 Hấp Thụ (+1 Hỏa · Không Hoàn Trả)'
                            : '🏮 Hấp Thụ (+1 Cung Thật · Không Hoàn Trả)'}
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
            TAB 3: ĐỘ KIẾP ĐÀI (NGUYÊN ANH & ĐẠO ANH)
           ======================================================== */}
        {activeTab === 'nguyen_anh' && isNguyenAnhStage && (
          <div className={styles.tribulationSection}>
            {/* Top summary card */}
            <div className={styles.tribulationHero}>
              <div className={styles.tribulationHeaderRow}>
                <div>
                  <h3 className={styles.cardHeader}>Độ Kiếp Đài · Chiến Lực: <span style={{ color: '#ffcc00' }}>{combatPowerDisplay} (Tối đa 65 Anh)</span></h3>
                  <p className={styles.subtext}>
                    Chiến lực ở Nguyên Anh tính bằng <strong>Anh</strong>. Tích tụ Thiên Mệnh vào từng Đạo Anh để vượt qua <strong>5 Kiếp Luân Hồi</strong> (Mỗi kiếp = +1 Anh chiến lực).
                  </p>
                </div>
                <div className={styles.thienMenhBank}>
                  <span className={styles.thienMenhLabel}>Lực Thiên Mệnh:</span>
                  <span className={styles.thienMenhVal}>{(cultivation.totalThienMenh || 0).toLocaleString()} TM</span>
                </div>
              </div>

              {/* Mass Tribulation Button (Vạn Kiếp Tề Phi) */}
              {(cultivation.daoAnhs || []).length > 0 && (
                <button
                  className={`btn-gold ${styles.massTribulationBtn}`}
                  onClick={() => triggerAction(attemptTribulationAll)}
                >
                  ⚡ VẠN KIẾP TỀ PHI (Độ Kiếp Tất Cả Đạo Anh Đủ Điều Kiện · Thưởng +50% Thiên Mệnh)
                </button>
              )}
            </div>

            {/* List of Dao Anhs */}
            {(cultivation.daoAnhs || []).length === 0 ? (
              <div className={styles.emptyDaoAnhs}>
                <p>Chưa có Đạo Anh nào được ngưng kết.</p>
                <p className={styles.hintText}>
                  Hãy vào tab <strong>Cảnh Giới</strong> và bấm "Hóa Đạo Anh" trên các Thiên Cung đã hóa thực để tạo Đạo Anh!
                </p>
              </div>
            ) : (
              <div className={styles.daoAnhList}>
                {cultivation.daoAnhs.map(da => {
                  const percent = Math.floor((da.currentThienMenh / da.maxThienMenh) * 100);
                  const isEligible = da.currentKiep < 5 && percent >= 70;
                  const successChance = Math.min(100, 50 + Math.max(0, percent - 70));

                  return (
                    <div
                      key={da.id}
                      className={`${styles.daoAnhCard} ${da.fromLamp ? styles.daoAnhLampProtected : ''}`}
                    >
                      <div className={styles.daoAnhTop}>
                        <div className={styles.daoAnhTitleRow}>
                          <span className={styles.daoAnhIcon}>{da.fromLamp ? '🏮' : '👑'}</span>
                          <div>
                            <h4 className={styles.daoAnhName}>{da.name}</h4>
                            <span className={styles.daoAnhMeta}>
                              {da.fromLamp ? '✦ Đạo Anh Mệnh Đăng (Bảo vệ 50% TM khi thất bại)' : 'Đạo Anh Thiên Cung Thường'}
                            </span>
                          </div>
                        </div>

                        <div className={styles.daoAnhPowerBadge}>
                          <span className={styles.kiepBadge}>Kiếp {da.currentKiep}/5</span>
                          <span className={styles.powerNum}>{da.currentKiep} Anh</span>
                        </div>
                      </div>

                      {/* 5 Kiep Dots */}
                      <div className={styles.kiepDotsRow}>
                        {[1, 2, 3, 4, 5].map(k => (
                          <div
                            key={k}
                            className={`${styles.kiepDot} ${da.currentKiep >= k ? styles.kiepDotPassed : ''}`}
                          >
                            <span>Kiếp {k}</span>
                          </div>
                        ))}
                      </div>

                      {da.currentKiep < 5 ? (
                        <>
                          {/* Progress bar */}
                          <div className={styles.progressContainer}>
                            <div className={styles.progressInfo}>
                              <span>Thiên Mệnh Tích Tụ (Kiếp {da.currentKiep + 1}):</span>
                              <strong>
                                {da.currentThienMenh.toLocaleString()}/{da.maxThienMenh.toLocaleString()} ({percent}%)
                              </strong>
                            </div>
                            <div className={styles.progressBarBg}>
                              <div
                                className={styles.progressBarFillCyan}
                                style={{ width: `${Math.min(100, percent)}%` }}
                              />
                            </div>
                          </div>

                          {/* Controls Row */}
                          <div className={styles.daoAnhControls}>
                            <div className={styles.injectBtnsRow}>
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
                                onClick={() => triggerAction(() => injectThienMenh(da.id, 1000), `Đã nạp +1000 Thiên Mệnh vào ${da.name}`)}
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
            TAB 4: QUY TẮC TU TIÊN (RULES)
           ======================================================== */}
        {activeTab === 'rules' && (
          <div className={styles.rulesSection}>
            <div className={styles.ruleCard}>
              <h4>1. Quy Tắc Hấp Thu Linh Khí & Đường Cong EXP Lũy Tiến</h4>
              <p>• <strong>Luật Tĩnh Tâm Ngộ Đạo (60 Giây)</strong>: Đạo hữu phải ở lại đọc chương sách ít nhất <strong>60 giây</strong> mới có thể cảm ngộ thiên địa và hấp thu linh lực (+Tu Vi).</p>
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
              <h4>3. Hệ Thống 30 Mệnh Đăng (6 Cấp Phẩm Độ Hiếm)</h4>
              <p>• <strong>Phân Cấp Phẩm</strong>: <strong>Hạ Phẩm</strong> (Trắng) · <strong>Trung Phẩm</strong> (Xanh Lá) · <strong>Thượng Phẩm</strong> (Xanh Lam) · <strong>Cực Phẩm</strong> (Tím) · <strong>Tiên Phẩm</strong> (Kim Sắc) · <strong>Thần Phẩm</strong> (Đỏ Thần Thánh).</p>
              <p>• <strong>Tỉ lệ rơi</strong>: Cơ duyên ngẫu nhiên quý hiếm (~1.8% mỗi chương đọc đủ 60s). Mệnh Đăng phẩm càng cao càng hiếm có khó tìm!</p>
              <p>• <strong>Giới hạn hấp thụ</strong>: Tối đa <strong>5 Mệnh Đăng</strong>. Một khi đã hấp thụ thì <strong>KHÔNG HOÀN TRẢ</strong>!</p>
              <p>• <strong>Ở Trúc Cơ</strong>: Mỗi Mệnh Đăng hấp thụ = <strong>+1 Hỏa</strong>.</p>
              <p>• <strong>Ở Kim Đan</strong>: Mỗi Mệnh Đăng hấp thụ = <strong>+1 Cung Thật</strong> (hóa thực sẵn 100% không tốn EXP).</p>
              <p>• <strong>Ở Nguyên Anh</strong>: Đạo Anh từ Mệnh Đăng khi vượt kiếp thất bại <strong>chỉ giảm về 50% Thiên Mệnh</strong> thay vì mất trắng!</p>
            </div>

            <div className={styles.ruleCard}>
              <h4>4. Lực Lượng Thiên Mệnh & Độ Kiếp Nguyên Anh</h4>
              <p>• <strong>Lực Thiên Mệnh</strong>: Đến cảnh giới <strong>Nguyên Anh / Giả Anh mới mở khóa</strong>, các cảnh dưới chưa có.</p>
              <p>• Quy đổi: 1 EXP = 10 Thiên Mệnh khi đọc sách ở Nguyên Anh.</p>
              <p>• <strong>Quy tắc độ kiếp</strong>: Đạt từ 70% Thiên Mệnh mở độ kiếp (50% thành công, mỗi +10% TM = +10% tỉ lệ).</p>
              <p>• <strong>Vạn Kiếp Tề Phi</strong>: Cùng lúc độ kiếp tất cả Đạo Anh, nhận thưởng thêm <strong>+50% Thiên Mệnh</strong>!</p>
            </div>
          </div>
        )}

        {/* ========================================================
            TAB 5: NHẬT KÝ CƠ DUYÊN (LOGS)
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
      </div>
    </BottomSheet>
  );
}
