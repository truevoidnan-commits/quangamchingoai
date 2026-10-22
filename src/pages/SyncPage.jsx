import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import { performSync, checkFirstSyncCondition } from '../lib/sync/syncEngine.js';
import { getSyncLedger } from '../lib/sync/syncLedger.js';
import styles from './SyncPage.module.css';

export default function SyncPage() {
  const [session, setSession] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [syncError, setSyncError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState(getSyncLedger()?.lastSyncedAt || 0);
  const [needsReload, setNeedsReload] = useState(false);

  // Modals state
  const [firstSyncData, setFirstSyncData] = useState(null);
  const [showConfirmLocalMaster, setShowConfirmLocalMaster] = useState(false);
  const [novelConflictData, setNovelConflictData] = useState(null);
  const [cultivationConflictData, setCultivationConflictData] = useState(null);

  // Conflict resolver promises
  const conflictResolverRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoadingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setAuthError('Vui lòng nhập đầy đủ Email và Mật khẩu.');
      return;
    }

    setAuthSubmitting(true);
    setAuthError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setAuthError('Email hoặc mật khẩu không chính xác.');
        } else {
          setAuthError(`Lỗi đăng nhập: ${error.message}`);
        }
      } else {
        setSession(data.session);
        setPassword(''); // Xóa mật khẩu khỏi state ngay sau khi đăng nhập
      }
    } catch (err) {
      setAuthError(`Lỗi kết nối máy chủ: ${err.message}`);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setSyncResult(null);
    setSyncProgress(null);
  };

  const startSyncProcess = async (firstSyncChoice = null) => {
    setIsSyncing(true);
    setSyncError('');
    setSyncProgress({ percent: 0, message: 'Khởi động quá trình đồng bộ...' });

    try {
      const res = await performSync(supabase, {
        firstSyncChoice,
        onProgress: (p) => setSyncProgress(p),
        onConflictNovel: (novelInfo) => {
          return new Promise((resolve) => {
            setNovelConflictData(novelInfo);
            conflictResolverRef.current = resolve;
          });
        },
        onConflictCultivation: (cultivationInfo) => {
          return new Promise((resolve) => {
            setCultivationConflictData(cultivationInfo);
            conflictResolverRef.current = resolve;
          });
        },
      });

      if (res?.requireFirstSyncChoice) {
        setFirstSyncData(res.firstSyncData);
        setIsSyncing(false);
        return;
      }

      if (res?.cancelled) {
        setIsSyncing(false);
        return;
      }

      setSyncResult(res);
      setLastSyncedAt(res.lastSyncedAt);

      if (res.cultivationUpdatedFromCloud) {
        setNeedsReload(true);
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch (err) {
      console.warn('Sync error:', err);
      setSyncError(`Lỗi đồng bộ: ${err.message || 'Đã xảy ra lỗi không xác định.'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Resolve novel conflict
  const handleResolveNovelConflict = (choice) => {
    setNovelConflictData(null);
    if (conflictResolverRef.current) {
      conflictResolverRef.current(choice);
      conflictResolverRef.current = null;
    }
  };

  // Resolve cultivation conflict
  const handleResolveCultivationConflict = (choice) => {
    setCultivationConflictData(null);
    if (conflictResolverRef.current) {
      conflictResolverRef.current(choice);
      conflictResolverRef.current = null;
    }
  };

  const formatTime = (ts) => {
    if (!ts) return 'Chưa từng đồng bộ';
    return new Date(ts).toLocaleString('vi-VN');
  };

  return (
    <div className={styles.page}>
      <div className={styles.headerTitle}>
        <span className={styles.cloudIcon}>☁️</span>
        <div>
          <h1 className={styles.title}>Đồng Bộ Cloud</h1>
          <div className={styles.subtitle}>Lưu trữ và đồng bộ truyện, tu vi, tiến độ đọc giữa các thiết bị</div>
        </div>
      </div>

      <div className={styles.alertInfo}>
        📱 <strong>Mẹo đồng bộ:</strong> Vui lòng giữ màn hình sáng và ở yên trang này trong suốt quá trình đồng bộ.
        Quá trình xử lý từng truyện một để tối ưu hóa bộ nhớ cho thiết bị di động.
      </div>

      {needsReload && (
        <div className={styles.alertWarning} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            ⚡ <strong>Tu vi đã được cập nhật từ Cloud!</strong> Đang tự động làm mới trang sau giây lát...
          </div>
          <button
            className={styles.btnOutline}
            style={{ borderColor: '#f59e0b', color: '#f59e0b', whiteSpace: 'nowrap' }}
            onClick={() => window.location.reload()}
          >
            Tải lại ngay
          </button>
        </div>
      )}

      {/* Account Section */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Tài Khoản Cloud</h2>
        </div>

        {loadingAuth ? (
          <p style={{ color: '#94a3b8' }}>Đang kiểm tra phiên đăng nhập...</p>
        ) : session?.user ? (
          <div>
            <div className={styles.userBadge}>
              <div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Đã đăng nhập:</div>
                <div className={styles.userEmail}>{session.user.email}</div>
              </div>
              <button className={styles.btnOutline} onClick={handleLogout}>
                Đăng xuất
              </button>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
              Dữ liệu của bạn được phân vùng bảo mật với Row Level Security (RLS) trên Supabase.
            </p>
          </div>
        ) : (
          <form onSubmit={handleLogin}>
            {authError && <div className={styles.alertDanger}>{authError}</div>}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Email đăng nhập:</label>
              <input
                type="email"
                className={styles.input}
                placeholder="tenban@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Mật khẩu:</label>
              <input
                type="password"
                className={styles.input}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              className={styles.btnSync}
              disabled={authSubmitting}
            >
              {authSubmitting ? 'Đang xác thực...' : 'Đăng Nhập Cloud'}
            </button>
          </form>
        )}
      </div>

      {/* Sync Action Section */}
      {session?.user && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Thực Hiện Đồng Bộ</h2>
          </div>

          <button
            className={styles.btnSync}
            disabled={isSyncing}
            onClick={() => startSyncProcess()}
          >
            {isSyncing ? '⏳ Đang đồng bộ dữ liệu...' : '☁️ Đồng Bộ Ngay'}
          </button>

          {/* Progress bar */}
          {syncProgress && (
            <div className={styles.progressContainer}>
              <div className={styles.progressLabel}>
                <span>Tiến trình xử lý:</span>
                <span>{syncProgress.percent || 0}%</span>
              </div>
              <div className={styles.progressBarTrack}>
                <div
                  className={styles.progressBarFill}
                  style={{ width: `${syncProgress.percent || 0}%` }}
                />
              </div>
              <div className={styles.progressMessage}>
                <span>⚙️</span> {syncProgress.message}
              </div>
            </div>
          )}

          {/* Error notice */}
          {syncError && (
            <div className={styles.alertDanger} style={{ marginTop: '16px' }}>
              {syncError}
            </div>
          )}

          {/* Result summary */}
          {syncResult && (
            <div style={{ marginTop: '20px' }}>
              <div className={styles.cardTitle} style={{ fontSize: '1rem', color: syncResult.success ? '#38bdf8' : '#f87171' }}>
                {syncResult.success ? '🎉 Kết quả đồng bộ:' : '⚠️ Đồng bộ chưa hoàn tất (có lỗi xảy ra):'}
              </div>
              <div className={styles.resultGrid}>
                <div className={styles.resultStat}>
                  <div className={styles.resultValue}>{syncResult.pushedNovels || 0}</div>
                  <div className={styles.resultName}>Truyện đã đẩy lên</div>
                </div>
                <div className={styles.resultStat}>
                  <div className={styles.resultValue}>{syncResult.pulledNovels || 0}</div>
                  <div className={styles.resultName}>Truyện đã tải về</div>
                </div>
                <div className={styles.resultStat}>
                  <div className={styles.resultValue}>{syncResult.conflicts || 0}</div>
                  <div className={styles.resultName}>Xung đột đã giải quyết</div>
                </div>
                <div className={styles.resultStat}>
                  <div className={styles.resultValue} style={{ color: syncResult.errors?.length ? '#f87171' : '#34d399' }}>
                    {syncResult.errors?.length || 0}
                  </div>
                  <div className={styles.resultName}>Lỗi ghi nhận</div>
                </div>
              </div>

              {syncResult.errors?.length > 0 && (
                <ul className={styles.errorList}>
                  {syncResult.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className={styles.lastSyncText}>
            Lần đồng bộ thành công gần nhất: {formatTime(lastSyncedAt)}
          </div>
        </div>
      )}

      {/* MODAL 1: Lần đầu đồng bộ khi cả hai bên đều có dữ liệu */}
      {firstSyncData && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>⚠️ Xác Nhận Lần Đầu Đồng Bộ</h3>
            <p style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: '1.5' }}>
              Hệ thống phát hiện cả <strong>Máy này</strong> và <strong>Cloud</strong> đều đang có dữ liệu tu tiên và danh mục truyện. Vui lòng chọn phương án thiết lập gốc:
            </p>

            {firstSyncData.isLocalAhead && (
              <div className={styles.alertDanger}>
                🚨 <strong>Cảnh báo quan trọng:</strong> Máy này đang tiến xa hơn Cloud (Tu vi hoặc số chương đã đọc cao hơn). Nếu chọn "Lấy cloud làm gốc", tiến độ hiện tại sẽ bị ghi đè (hệ thống sẽ tự động sao lưu bản cũ).
              </div>
            )}

            {firstSyncData.duplicatePairs?.length > 0 && (
              <div className={styles.alertWarning}>
                ⚠️ <strong>Phát hiện truyện cùng tiêu đề khác ID:</strong>
                <ul style={{ margin: '8px 0 0 16px', padding: 0, fontSize: '0.85rem' }}>
                  {firstSyncData.duplicatePairs.map((p, idx) => (
                    <li key={idx}>"{p.title}" (Máy: {p.localId} vs Cloud: {p.cloudId})</li>
                  ))}
                </ul>
                <div style={{ marginTop: '4px', fontSize: '0.8rem', color: '#fde68a' }}>
                  Hệ thống không tự xóa truyện. Sau khi đồng bộ bạn có thể tự xóa bản thừa.
                </div>
              </div>
            )}

            <table className={styles.compareTable}>
              <thead>
                <tr>
                  <th>Hạng mục</th>
                  <th>Máy này (Cục bộ)</th>
                  <th>Cloud (Trực tuyến)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Số truyện</td>
                  <td>{firstSyncData.localSummary.novelCount}</td>
                  <td>{firstSyncData.cloudSummary.novelCount}</td>
                </tr>
                <tr>
                  <td>Cảnh giới</td>
                  <td>{firstSyncData.localSummary.realm}</td>
                  <td>{firstSyncData.cloudSummary.realm}</td>
                </tr>
                <tr>
                  <td>Tổng Tu Vi</td>
                  <td style={{ color: firstSyncData.isLocalAhead ? '#38bdf8' : '#e2e8f0', fontWeight: '600' }}>
                    {firstSyncData.localSummary.totalExp.toLocaleString()}
                  </td>
                  <td>{firstSyncData.cloudSummary.totalExp.toLocaleString()}</td>
                </tr>
                <tr>
                  <td>Số chương đã đọc</td>
                  <td>{firstSyncData.localSummary.readChapterCount}</td>
                  <td>{firstSyncData.cloudSummary.readChapterCount}</td>
                </tr>
              </tbody>
            </table>

            <div className={styles.modalActions}>
              <button
                className={styles.btnSecondary}
                onClick={() => {
                  setFirstSyncData(null);
                  startSyncProcess('cancel');
                }}
              >
                Hủy (Mặc định)
              </button>

              <button
                className={styles.btnPrimary}
                onClick={() => {
                  setFirstSyncData(null);
                  startSyncProcess('cloud_master');
                }}
              >
                📥 Lấy Cloud làm gốc (Khuyên dùng cho máy phụ)
              </button>

              <button
                className={styles.btnDanger}
                onClick={() => {
                  setShowConfirmLocalMaster(true);
                }}
              >
                📤 Đẩy máy này làm gốc (Ghi đè Cloud)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1B: Hộp xác nhận thứ hai cho "Đẩy máy này làm gốc" */}
      {showConfirmLocalMaster && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent} style={{ maxWidth: '480px' }}>
            <h3 className={styles.modalTitle} style={{ color: '#ef4444' }}>
              🚨 CẢNH BÁO XÁC NHẬN GHI ĐÈ CLOUD
            </h3>
            <p style={{ color: '#fca5a5', fontSize: '0.9rem', lineHeight: '1.6' }}>
              Bạn đang chọn <strong>"Đẩy máy này làm gốc"</strong>.
              <br /><br />
              Toàn bộ dữ liệu tu vi, nội dung truyện và tiến độ trên Cloud sẽ bị <strong>thay thế hoàn toàn</strong> bằng dữ liệu của máy này.
              <br /><br />
              Bạn có chắc chắn 100% muốn tiếp tục không?
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.btnSecondary}
                onClick={() => setShowConfirmLocalMaster(false)}
              >
                Quay lại
              </button>
              <button
                className={styles.btnDanger}
                onClick={() => {
                  setShowConfirmLocalMaster(false);
                  setFirstSyncData(null);
                  startSyncProcess('local_master');
                }}
              >
                Xác nhận ghi đè Cloud
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Xung đột nội dung truyện */}
      {novelConflictData && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>⚔️ Xung Đột Nội Dung Truyện</h3>
            <p style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>
              Truyện <strong>"{novelConflictData.title}"</strong> đã được chỉnh sửa ở cả hai bên kể từ lần đồng bộ trước:
            </p>
            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem' }}>
              <div>• Sửa đổi trên máy này: {formatTime(novelConflictData.localUpdatedAt)}</div>
              <div>• Sửa đổi trên Cloud: {formatTime(novelConflictData.cloudUpdatedAt)}</div>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
              Vui lòng chọn bản bạn muốn lưu giữ:
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.btnPrimary}
                onClick={() => handleResolveNovelConflict('local')}
              >
                Giữ bản máy này (Đẩy lên Cloud)
              </button>
              <button
                className={styles.btnSecondary}
                onClick={() => handleResolveNovelConflict('cloud')}
              >
                Lấy bản Cloud (Tải về máy)
              </button>
              <button
                className={styles.btnSecondary}
                style={{ opacity: 0.7 }}
                onClick={() => handleResolveNovelConflict('skip')}
              >
                Bỏ qua truyện này (Không đổi gì)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Xung đột Tu Vi */}
      {cultivationConflictData && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}>⚡ Xung Đột Tu Vi (Hồ Sơ Thật)</h3>
            <p style={{ color: '#cbd5e1', fontSize: '0.9rem' }}>
              Cả hai bên đều đã tăng cảnh giới hoặc tu vi kể từ lần đồng bộ trước:
            </p>
            <table className={styles.compareTable}>
              <thead>
                <tr>
                  <th>Chỉ số</th>
                  <th>Máy này</th>
                  <th>Cloud</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Cảnh giới</td>
                  <td>{cultivationConflictData.local.realm}</td>
                  <td>{cultivationConflictData.cloud.realm}</td>
                </tr>
                <tr>
                  <td>Tổng Tu Vi</td>
                  <td style={{ color: '#38bdf8', fontWeight: '600' }}>
                    {cultivationConflictData.local.totalExp.toLocaleString()}
                  </td>
                  <td style={{ color: '#818cf8', fontWeight: '600' }}>
                    {cultivationConflictData.cloud.totalExp.toLocaleString()}
                  </td>
                </tr>
                <tr>
                  <td>Chương đã đọc</td>
                  <td>{cultivationConflictData.local.readChapterCount}</td>
                  <td>{cultivationConflictData.cloud.readChapterCount}</td>
                </tr>
                <tr>
                  <td>Thời điểm cập nhật</td>
                  <td>{formatTime(cultivationConflictData.local.updatedAt)}</td>
                  <td>{formatTime(cultivationConflictData.cloud.updatedAt)}</td>
                </tr>
              </tbody>
            </table>
            <div className={styles.modalActions}>
              <button
                className={styles.btnPrimary}
                onClick={() => handleResolveCultivationConflict('local')}
              >
                Giữ bản máy này (Đẩy lên Cloud)
              </button>
              <button
                className={styles.btnSecondary}
                onClick={() => handleResolveCultivationConflict('cloud')}
              >
                Lấy bản Cloud (Ghi đè máy này, có sao lưu)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
