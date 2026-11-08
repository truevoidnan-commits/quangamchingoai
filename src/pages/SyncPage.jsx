import Icon, { GlyphIcon } from '../components/ui/Icon';
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PageShell, Card, Button } from '../components/ui/FormKit';
import { supabase } from '../lib/supabaseClient.js';
import { performSync, checkFirstSyncCondition, resyncNovel } from '../lib/sync/syncEngine.js';
import { getSyncLedger } from '../lib/sync/syncLedger.js';
import { deleteNovelDB, getChapters } from '../lib/db.js';
import { removeFromLibrary, getLibrary } from '../lib/storage.js';
import { isProductionHost } from '../lib/sync/envProtection.js';
import { isAutoSyncEnabled, setAutoSyncEnabled, getSyncStatus, setConflictDialogOpen } from '../lib/sync/autoSync.js';
import {
  isRealtimeEnabled,
  setRealtimeEnabled,
  getRealtimeStatus,
  REALTIME_STATUS_CHANGED_EVENT,
} from '../lib/sync/realtimeSignal.js';
import { isBackupOverdue, getLastBackupTimestamp } from '../lib/backup/backupEngine.js';
import {
  getSyncLogs,
  clearSyncLogs,
  exportSyncLogsText,
  isSupabasePausedSuspected,
  getLastSyncSuccessAt,
} from '../lib/sync/syncLog.js';
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

  // Diagnostics: Mismatched novels
  const [mismatchedNovels, setMismatchedNovels] = useState([]);
  const [isScanningMismatches, setIsScanningMismatches] = useState(false);
  const [hasScannedMismatches, setHasScannedMismatches] = useState(false);

  const scanNovelMismatches = async () => {
    if (!session?.user) return;
    setIsScanningMismatches(true);
    try {
      const library = getLibrary();
      if (!library || library.length === 0) {
        setMismatchedNovels([]);
        setHasScannedMismatches(true);
        return;
      }

      const { data: cloudRows, error } = await supabase
        .from('novels')
        .select('id, title, chapter_count')
        .eq('user_id', session.user.id);

      if (error) throw error;
      const cloudMap = new Map((cloudRows || []).map(r => [r.id, r]));

      const results = [];
      for (const item of library) {
        const cloudItem = cloudMap.get(item.id);
        if (!cloudItem) continue;

        let realLocalCount = 0;
        try {
          const chs = await getChapters(item.id);
          realLocalCount = chs.length;
        } catch {
          realLocalCount = item.chapterCount || item.totalChapters || 0;
        }

        const cloudCount = cloudItem.chapter_count || 0;
        if (realLocalCount !== cloudCount) {
          results.push({
            novelId: item.id,
            title: item.title || cloudItem.title || item.id,
            localCount: realLocalCount,
            cloudCount,
            status: 'idle',
            errorMsg: null,
          });
        }
      }
      setMismatchedNovels(results);
      setHasScannedMismatches(true);
    } catch (err) {
      console.warn('Lỗi quét kiểm tra độ lệch:', err);
    } finally {
      setIsScanningMismatches(false);
    }
  };

  const handleResyncSingleNovel = async (novelId) => {
    setMismatchedNovels(prev => prev.map(n => n.novelId === novelId ? { ...n, status: 'resyncing', errorMsg: null } : n));
    try {
      const res = await resyncNovel(novelId, { supabase, userId: session.user.id });
      if (res.success) {
        setMismatchedNovels(prev => prev.map(n => n.novelId === novelId ? {
          ...n,
          status: 'done',
          localCount: res.merged,
          cloudCount: res.merged,
        } : n));
      } else {
        setMismatchedNovels(prev => prev.map(n => n.novelId === novelId ? {
          ...n,
          status: 'error',
          errorMsg: res.error || 'Gộp thất bại',
        } : n));
      }
    } catch (err) {
      setMismatchedNovels(prev => prev.map(n => n.novelId === novelId ? {
        ...n,
        status: 'error',
        errorMsg: err.message || 'Gộp thất bại',
      } : n));
    }
  };

  // Modals state
  const [firstSyncData, setFirstSyncData] = useState(null);
  const [showConfirmLocalMaster, setShowConfirmLocalMaster] = useState(false);
  const [novelConflictData, setNovelConflictData] = useState(null);
  const [cultivationConflictData, setCultivationConflictData] = useState(null);
  const [deletedDuplicateIds, setDeletedDuplicateIds] = useState(new Set());
  const isProd = isProductionHost();
  const [autoSyncOn, setAutoSyncOn] = useState(() => isAutoSyncEnabled());
  const [realtimeOn, setRealtimeOn] = useState(() => isRealtimeEnabled());
  const [realtimeStatus, setRealtimeStatus] = useState(() => getRealtimeStatus());
  const [syncStatus, setSyncStatusState] = useState(() => getSyncStatus());
  const [backupOverdue, setBackupOverdue] = useState(() => isBackupOverdue(14));
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [syncLogs, setSyncLogs] = useState(() => getSyncLogs());
  const [copyLogSuccess, setCopyLogSuccess] = useState(false);


  useEffect(() => {
    const handleStatus = (e) => {
      setSyncStatusState(e.detail || getSyncStatus());
      setSyncLogs(getSyncLogs());
    };
    const handleRealtime = (e) => {
      setRealtimeStatus(e.detail?.status || getRealtimeStatus());
    };
    window.addEventListener('tcl_sync_status_changed', handleStatus);
    window.addEventListener(REALTIME_STATUS_CHANGED_EVENT, handleRealtime);
    return () => {
      window.removeEventListener('tcl_sync_status_changed', handleStatus);
      window.removeEventListener(REALTIME_STATUS_CHANGED_EVENT, handleRealtime);
    };
  }, []);

  useEffect(() => {
    setConflictDialogOpen(Boolean(firstSyncData || novelConflictData || cultivationConflictData));
  }, [firstSyncData, novelConflictData, cultivationConflictData]);

  const handleDeleteDuplicateLocal = async (localId, title) => {
    try {
      await deleteNovelDB(localId);
      removeFromLibrary(localId);
      setDeletedDuplicateIds((prev) => new Set([...prev, localId]));
    } catch (err) {
      console.error('Lỗi xóa bản trùng trên máy:', err);
      alert(`Không thể xóa truyện "${title}": ${err.message}`);
    }
  };

  // Conflict resolver promises
  const conflictResolverRef = useRef(null);
  const progressTimerRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoadingAuth(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => {
      subscription.unsubscribe();
      if (progressTimerRef.current) {
        clearTimeout(progressTimerRef.current);
      }
    };
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
      import('../lib/sync/syncLog.js').then(m => m.recordSyncFailure(err)).catch(() => {});
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    if (progressTimerRef.current) {
      clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    await supabase.auth.signOut();
    setSession(null);
    setSyncResult(null);
    setSyncProgress(null);
  };

  const startSyncProcess = async (firstSyncChoice = null) => {
    if (!isProd && !firstSyncChoice) {
      const confirmPrompt = window.prompt(
        'Bạn đang ở môi trường test (localhost/preview). Thao tác này sẽ ghi đè hoặc thay đổi trực tiếp dữ liệu Cloud thật của bạn.\n\nVui lòng nhập chữ DONGBO để xác nhận thực hiện:'
      );
      if (confirmPrompt !== 'DONGBO') {
        alert('Đã hủy đồng bộ vì chưa nhập đúng chữ DONGBO.');
        return;
      }
    }
    if (progressTimerRef.current) {
      clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setIsSyncing(true);
    setSyncError('');
    setSyncProgress({ percent: 0, message: 'Khởi động quá trình đồng bộ...' });

    try {
      const res = await performSync(supabase, {
        firstSyncChoice,
        onProgress: (p) => setSyncProgress(p),
        onConflictNovel: (novelInfo) => {
          setSyncProgress((prev) => ({
            percent: prev?.percent || 0,
            message: 'Đang chờ bạn chọn ở hộp thoại...',
          }));
          return new Promise((resolve) => {
            setNovelConflictData(novelInfo);
            conflictResolverRef.current = resolve;
          });
        },
        onConflictCultivation: (cultivationInfo) => {
          setSyncProgress((prev) => ({
            percent: prev?.percent || 0,
            message: 'Đang chờ bạn chọn ở hộp thoại...',
          }));
          return new Promise((resolve) => {
            setCultivationConflictData(cultivationInfo);
            conflictResolverRef.current = resolve;
          });
        },
      });

      if (res?.locked) {
        alert(res.message || 'Đang có một lần đồng bộ khác chạy, thử lại sau giây lát.');
        setSyncProgress(null);
        setIsSyncing(false);
      setSyncLogs(getSyncLogs());
        return;
      }

      if (res?.requireFirstSyncChoice) {
        setFirstSyncData(res.firstSyncData);
        setSyncProgress(null);
        setIsSyncing(false);
        return;
      }

      if (res?.cancelled) {
        setSyncProgress(null);
        setIsSyncing(false);
        return;
      }

      setSyncResult(res);
      setLastSyncedAt(res.lastSyncedAt);

      if (res.success) {
        setSyncProgress({ percent: 100, message: 'Hoàn tất đồng bộ.' });
        progressTimerRef.current = setTimeout(() => {
          setSyncProgress(null);
          progressTimerRef.current = null;
        }, 2000);
      } else {
        setSyncProgress(null);
      }

      if (res.cultivationUpdatedFromCloud) {
        setNeedsReload(true);
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch (err) {
      console.warn('Sync error:', err);
      setSyncProgress(null);
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
    <PageShell backdrop="text">
      {/* Page Header */}
      <div className={styles.headerWrap}>
        <div className={styles.headerLeft}>
          <Link to="/" className={styles.btnOutline} style={{ marginRight: 6 }}>
            <Icon name="arrow-left" size={14} /> Quay lại
          </Link>
          <div className={styles.cloudIconCircle}>
            <GlyphIcon value="cloud" size={26} />
          </div>
          <div className={styles.titleArea}>
            <h1 className={styles.title}>Đồng Bộ Cloud</h1>
            <p className={styles.subtitle}>Lưu trữ và đồng bộ truyện, tu vi, tiến độ đọc giữa các thiết bị</p>
          </div>
        </div>
        <div>
          {isSyncing ? (
            <span className={styles.statusPillSyncing}>
              <span className={styles.spinnerIcon} /> Đang đồng bộ...
            </span>
          ) : session?.user ? (
            <span className={styles.statusPillLoggedIn}>
              <GlyphIcon value="check-circle" size={13} /> Đã đăng nhập
            </span>
          ) : (
            <span className={styles.statusPillLoggedOut}>Chưa đăng nhập</span>
          )}
        </div>
      </div>

      {/* Mẹo đồng bộ */}
      <div className={styles.tipCard}>
        <div className={styles.tipIconCircle}>
          <GlyphIcon value="lightbulb" size={18} />
        </div>
        <div className={styles.tipContent}>
          <span className={styles.tipTitle}>Mẹo đồng bộ tối ưu:</span>
          Vui lòng giữ màn hình sáng và ở yên trang này trong suốt quá trình đồng bộ.
          Hệ thống xử lý tuần tự từng tác phẩm để tối ưu hóa bộ nhớ cho thiết bị di động.
        </div>
      </div>

      {needsReload && (
        <div className={styles.alertWarning} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Icon name="bolt" size={14} /> <strong>Tu vi đã được cập nhật từ Cloud!</strong> Đang tự động làm mới trang sau giây lát...
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

      {/* Gentle Backup Overdue Reminder */}
      {backupOverdue && (
        <div className={styles.alertWarning} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <Icon name="lightbulb" size={14} /> <strong>Nhắc nhở sao lưu:</strong> Bạn chưa sao lưu dữ liệu máy gần đây (hoặc đã quá 14 ngày). Hãy tạo bản sao lưu tập tin để phòng ngừa sự cố đám mây.
          </div>
          <Link
            to="/backup"
            className={styles.btnOutline}
            style={{ borderColor: '#f59e0b', color: '#f59e0b', whiteSpace: 'nowrap', textDecoration: 'none' }}
          >
            Sao lưu ngay →
          </Link>
        </div>
      )}

      {/* Backup & Restore Navigation Card */}
      <Card
        icon="save"
        title="Sao Lưu & Khôi Phục (Tập Tin Cục Bộ)"
        subtitle="Hoạt động độc lập hoàn toàn với Cloud, không phụ thuộc vào Internet"
        actions={
          <Link to="/backup" className={styles.btnOutline}>
            Mở Trang Sao Lưu →
          </Link>
        }
      >
        <p style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
          Xuất và nhập toàn bộ truyện, tiến độ đọc và tu vi thành một file nén duy nhất (<code>.tclbackup.json.gz</code>) trên máy của bạn. An toàn khi đổi máy hoặc phòng sự cố đám mây.
        </p>
      </Card>

      {isSupabasePausedSuspected() && (
        <div className={styles.alertWarning} style={{ marginBottom: '16px', background: 'rgba(234, 179, 8, 0.12)', border: '1px solid rgba(234, 179, 8, 0.4)' }}>
          <div style={{ fontWeight: 600, color: '#facc15', marginBottom: '4px' }}>
            <Icon name="alert-triangle" size={14} /> Không kết nối được Supabase
          </div>
          <div style={{ fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 1.5 }}>
            Nếu bạn không dùng khoảng 7 ngày, dự án gói miễn phí có thể đã bị tạm dừng: vào <strong>supabase.com/dashboard</strong>, chọn dự án, bấm <strong>Restore project</strong>.
          </div>
        </div>
      )}

      {/* Account Section */}
      <Card
        icon="user"
        title="Tài Khoản Cloud"
        subtitle="Xác thực danh tính bảo mật qua Row Level Security (RLS)"
      >
        {loadingAuth ? (
          <p style={{ color: '#94a3b8' }}>Đang kiểm tra phiên đăng nhập...</p>
        ) : session?.user ? (
          <div>
            <div className={styles.userAccountRow}>
              <div className={styles.userProfileLeft}>
                <div className={styles.userAvatar}>
                  {(session.user.email || 'U').charAt(0).toUpperCase()}
                </div>
                <div className={styles.userEmailWrap}>
                  <div className={styles.userEmail}>{session.user.email}</div>
                  <div className={styles.userBadgeRow}>
                    <span className={styles.loggedInBadge}>Đã đăng nhập</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>Bảo mật đám mây</span>
                  </div>
                </div>
              </div>
              <button className={styles.btnDanger} onClick={handleLogout}>
                <GlyphIcon value="logout" size={13} />
                <span>Đăng xuất</span>
              </button>
            </div>
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
              className={styles.btnPrimary}
              style={{ width: '100%', marginTop: 6 }}
              disabled={authSubmitting}
            >
              {authSubmitting ? 'Đang xác thực...' : 'Đăng Nhập Cloud'}
            </button>
          </form>
        )}
      </Card>

      {/* Sync Action Section */}
      {session?.user && (
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2 className={styles.cardTitle}>Thực Hiện Đồng Bộ</h2>
          </div>

          {!isProd && (
            <div className={styles.alertWarning} style={{ marginBottom: '16px' }}>
              <Icon name="alert-triangle" size={14} /> Môi trường test: tự động đồng bộ bị tắt để không ghi đè dữ liệu thật.
            </div>
          )}

          {syncStatus.parallelDeviceDetected && (
            <div className={styles.alertInfo} style={{ marginBottom: '16px', fontSize: '0.85rem' }}>
              <Icon name="phone" size={14} /> Thiết bị khác vừa cập nhật tu vi trong 2 phút gần đây.
            </div>
          )}

          {syncStatus.state === 'attention' && (
            <div className={styles.alertWarning} style={{ marginBottom: '16px', fontSize: '0.85rem' }}>
              <Icon name="bell" size={14} /> {syncStatus.message || 'Cần bạn kiểm tra hoặc xử lý xung đột bên dưới.'}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', marginBottom: '16px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>Tự động đồng bộ hai chiều</div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                {!isProd
                  ? 'Bị khóa tắt trên môi trường test để bảo vệ dữ liệu Cloud thật'
                  : 'Tự động đồng bộ tiến độ đọc và tu vi khi chuyển tab hoặc sau khi đọc'}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: !isProd ? 'not-allowed' : 'pointer' }}>
              <input
                type="checkbox"
                disabled={!isProd}
                checked={autoSyncOn}
                onChange={(e) => {
                  const val = e.target.checked;
                  setAutoSyncEnabled(val);
                  setAutoSyncOn(val);
                }}
                style={{ width: '18px', height: '18px', accentColor: '#38bdf8', cursor: !isProd ? 'not-allowed' : 'pointer' }}
              />
            </label>
          </div>

          {/* Tùy chọn Đồng bộ tức thời (Realtime Signal) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', marginBottom: '16px', border: '1px solid rgba(255, 255, 255, 0.06)', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '220px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>Đồng bộ tức thời</span>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontWeight: 500,
                  background: realtimeStatus === 'active' ? 'rgba(52, 211, 153, 0.15)'
                    : realtimeStatus === 'connecting' ? 'rgba(56, 189, 248, 0.15)'
                    : realtimeStatus === 'paused' ? 'rgba(251, 191, 36, 0.15)'
                    : 'rgba(148, 163, 184, 0.15)',
                  color: realtimeStatus === 'active' ? '#34d399'
                    : realtimeStatus === 'connecting' ? '#38bdf8'
                    : realtimeStatus === 'paused' ? '#fbbf24'
                    : '#94a3b8',
                  border: `1px solid ${
                    realtimeStatus === 'active' ? 'rgba(52, 211, 153, 0.3)'
                    : realtimeStatus === 'connecting' ? 'rgba(56, 189, 248, 0.3)'
                    : realtimeStatus === 'paused' ? 'rgba(251, 191, 36, 0.3)'
                    : 'rgba(148, 163, 184, 0.3)'
                  }`,
                }}>
                  {realtimeStatus === 'active' ? '● Đang hoạt động'
                    : realtimeStatus === 'connecting' ? 'Đang kết nối...'
                    : realtimeStatus === 'paused' ? 'Tạm dừng (quay về kiểm tra 3 phút)'
                    : '○ Tắt'}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px', lineHeight: '1.35' }}>
                {!isProd
                  ? 'Bị khóa tắt trên môi trường test'
                  : 'Sử dụng tín hiệu Supabase Realtime để nhận dữ liệu mới ngay khi thiết bị khác lưu. Dùng thêm pin khi ứng dụng đang mở.'}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: !isProd ? 'not-allowed' : 'pointer' }}>
              <input
                type="checkbox"
                disabled={!isProd}
                checked={realtimeOn}
                onChange={(e) => {
                  const val = e.target.checked;
                  setRealtimeEnabled(val);
                  setRealtimeOn(val);
                }}
                style={{ width: '18px', height: '18px', accentColor: '#38bdf8', cursor: !isProd ? 'not-allowed' : 'pointer' }}
              />
            </label>
          </div>

          <button
            className={styles.btnSync}
            disabled={isSyncing}
            onClick={() => startSyncProcess()}
          >
            {isSyncing
              ? ((novelConflictData || cultivationConflictData) ? 'Đang chờ bạn chọn ở hộp thoại...' : 'Đang đồng bộ dữ liệu...')
              : <><Icon name="sync" size={16} /> Đồng Bộ Ngay</>}
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
                <span><Icon name="settings" size={14} /></span> {(novelConflictData || cultivationConflictData) ? 'Đang chờ bạn chọn ở hộp thoại...' : syncProgress.message}
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
                {syncResult.success ? <><Icon name="check-circle" size={18} /> Kết quả đồng bộ:</> : <><Icon name="alert-triangle" size={18} /> Đồng bộ chưa hoàn tất (có lỗi xảy ra):</>}
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
                  <div className={styles.resultValue}>{syncResult.progressPushed || 0}</div>
                  <div className={styles.resultName}>Tiến độ đã đẩy lên</div>
                </div>
                <div className={styles.resultStat}>
                  <div className={styles.resultValue}>{syncResult.progressPulled || 0}</div>
                  <div className={styles.resultName}>Tiến độ đã tải về</div>
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

              {syncResult.duplicateSkipped?.length > 0 && (
                <div className={styles.alertWarning} style={{ marginTop: '16px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '6px' }}>
                    <Icon name="alert-triangle" size={14} /> Nghi trùng truyện: đã bỏ qua, không đẩy lên
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#cbd5e1', marginBottom: '10px', lineHeight: '1.4' }}>
                    Các truyện sau trên máy này có tiêu đề chuẩn hóa trùng với truyện đã có trên Cloud nhưng khác ID. Hệ thống đã giữ lại và không đẩy lên Cloud để tránh nhân đôi. Bạn có thể xóa bản trên máy này nếu muốn:
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '0.85rem' }}>
                    {syncResult.duplicateSkipped.map((dup) => (
                      <li key={dup.localId} style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                        <span>
                          <strong>"{dup.title}"</strong> (Máy này: <code>{dup.localId}</code> vs Cloud: <code>{dup.cloudId}</code>)
                        </span>
                        {deletedDuplicateIds.has(dup.localId) ? (
                          <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem' }}>Đã xóa khỏi máy</span>
                        ) : (
                          <button
                            className={styles.btnDanger}
                            style={{ padding: '3px 8px', fontSize: '0.75rem', borderRadius: '4px' }}
                            onClick={() => handleDeleteDuplicateLocal(dup.localId, dup.title)}
                          >
                            <Icon name="trash" size={14} /> Xóa bản trên máy này
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {syncResult.localOnlySkipped > 0 && (
                <div className={styles.alertInfo} style={{ marginTop: '12px', fontSize: '0.85rem' }}>
                  <Icon name="info" size={14} /> {syncResult.localOnlySkipped} truyện chỉ có trên máy này, chưa đẩy (chế độ "Lấy Cloud làm gốc" giữ nguyên truyện trên máy; bạn có thể đẩy lên ở lần đồng bộ thường sau đó).
                </div>
              )}
            </div>
          )}

          {(() => {
            const lastSuccessTimestamp = getLastSyncSuccessAt() || lastSyncedAt;
            const daysAgo = lastSuccessTimestamp ? Math.floor((Date.now() - lastSuccessTimestamp) / (24 * 60 * 60 * 1000)) : null;
            return (
              <div style={{ marginTop: '16px' }}>
                <div className={styles.lastSyncText}>
                  Lần đồng bộ thành công gần nhất: {formatTime(lastSuccessTimestamp)}
                  {lastSuccessTimestamp > 0 && daysAgo !== null && (
                    <span> ({daysAgo === 0 ? 'hôm nay' : `${daysAgo} ngày trước`})</span>
                  )}
                </div>
                {daysAgo !== null && daysAgo > 5 && (
                  <div style={{ fontSize: '0.82rem', color: '#facc15', marginTop: '6px', fontStyle: 'italic' }}>
                    <Icon name="lightbulb" size={14} /> Nhắc nhẹ: Bạn nên mở ứng dụng và đồng bộ định kỳ để dự án Supabase không bị tự động tạm dừng.
                  </div>
                )}
              </div>
            );
          })()}

          {/* Mục: Chẩn đoán & Cứu dữ liệu truyện lệch số chương */}
          <div style={{
            margin: '20px 0',
            padding: '16px',
            borderRadius: '12px',
            background: 'rgba(234, 179, 8, 0.04)',
            border: '1px solid rgba(234, 179, 8, 0.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="shield" size={18} style={{ color: '#facc15' }} />
                <span style={{ fontWeight: 600, fontSize: '0.98rem', color: '#facc15' }}>
                  Cứu dữ liệu truyện bị lệch số chương
                </span>
              </div>
              <button
                type="button"
                className={styles.btnLogAction}
                style={{ padding: '6px 12px', fontSize: '0.82rem', borderColor: 'rgba(234, 179, 8, 0.4)', color: '#facc15' }}
                onClick={scanNovelMismatches}
                disabled={isScanningMismatches}
              >
                <Icon name="refresh" size={13} className={isScanningMismatches ? styles.spinnerIcon : undefined} />
                <span>{isScanningMismatches ? 'Đang quét...' : 'Quét kiểm tra độ lệch'}</span>
              </button>
            </div>
            <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 10px 0', lineHeight: 1.5 }}>
              Tự động đối chiếu số chương thực tế trong máy với Cloud. Nếu truyện từng bị ghi đè nhầm hoặc kẹt bản nháp, nhấn "Gộp ngay" để hợp nhất đầy đủ cả hai bên mà không mất chương nào.
            </p>

            {hasScannedMismatches && mismatchedNovels.length === 0 && (
              <div className={styles.alertSuccess} style={{ margin: '8px 0', fontSize: '0.84rem' }}>
                <Icon name="check" size={14} /> Tất cả truyện trong Thư viện đều khớp số chương với Cloud!
              </div>
            )}

            {mismatchedNovels.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {mismatchedNovels.map((item) => (
                  <div
                    key={item.novelId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 10,
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid rgba(234, 179, 8, 0.2)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#f8fafc' }}>{item.title}</div>
                      <div style={{ fontSize: '0.82rem', color: '#fbbf24', marginTop: 2 }}>
                        Máy này: <strong>{item.localCount}</strong> chương · Cloud: <strong>{item.cloudCount}</strong> chương
                      </div>
                      {item.errorMsg && (
                        <div style={{ fontSize: '0.78rem', color: '#f87171', marginTop: 2 }}>
                          {item.errorMsg}
                        </div>
                      )}
                    </div>
                    <div>
                      {item.status === 'done' ? (
                        <span style={{ fontSize: '0.84rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Icon name="check" size={14} /> Đã gộp ({item.localCount} chương)
                        </span>
                      ) : (
                        <button
                          type="button"
                          className={styles.btnPrimary}
                          style={{
                            padding: '6px 14px',
                            fontSize: '0.82rem',
                            background: 'linear-gradient(135deg, #d97706, #b45309)',
                            border: '1px solid #f59e0b',
                            borderRadius: '6px',
                            cursor: item.status === 'resyncing' ? 'not-allowed' : 'pointer',
                          }}
                          onClick={() => handleResyncSingleNovel(item.novelId)}
                          disabled={item.status === 'resyncing'}
                        >
                          <Icon name="refresh" size={13} className={item.status === 'resyncing' ? styles.spinnerIcon : undefined} />
                          <span>{item.status === 'resyncing' ? 'Đang gộp...' : 'Gộp ngay'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mục thu gọn: Nhật ký đồng bộ */}
          <div className={styles.logAccordion}>
            <div
              className={styles.logAccordionHeader}
              onClick={() => {
                const next = !isLogOpen;
                setIsLogOpen(next);
                if (next) setSyncLogs(getSyncLogs());
              }}
            >
              <span><Icon name="clipboard" size={14} /> Nhật ký đồng bộ ({syncLogs.length})</span>
              <span>{isLogOpen ? '▲ Thu gọn' : '▼ Mở rộng'}</span>
            </div>
            {isLogOpen && (
              <div className={styles.logBody}>
                <div className={styles.logActions}>
                  <button
                    className={styles.btnLogAction}
                    onClick={() => {
                      const text = exportSyncLogsText();
                      if (navigator?.clipboard?.writeText) {
                        navigator.clipboard.writeText(text);
                        setCopyLogSuccess(true);
                        setTimeout(() => setCopyLogSuccess(false), 2000);
                      }
                    }}
                  >
                    {copyLogSuccess ? <><Icon name="check" size={14} /> Đã sao chép</> : <><Icon name="copy" size={14} /> Sao chép nhật ký</>}
                  </button>
                  <button
                    className={styles.btnLogAction}
                    style={{ color: '#f87171' }}
                    onClick={() => {
                      if (window.confirm('Bạn có chắc chắn muốn xóa toàn bộ nhật ký đồng bộ cục bộ?')) {
                        clearSyncLogs();
                        setSyncLogs([]);
                      }
                    }}
                  >
                    <Icon name="trash" size={14} /> Xóa nhật ký
                  </button>
                </div>
                <div className={styles.logContainer}>
                  {syncLogs.length === 0 ? (
                    <div style={{ color: '#64748b' }}>(Chưa có nhật ký nào được ghi)</div>
                  ) : (
                    syncLogs.slice(-50).reverse().map((entry, idx) => {
                      const d = new Date(entry.t);
                      const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
                      const lineClass = entry.level === 'error'
                        ? styles.logLineError
                        : entry.level === 'warn'
                          ? styles.logLineWarn
                          : styles.logLineInfo;
                      return (
                        <div key={idx} className={lineClass}>
                          [${timeStr}] [{String(entry.level || 'info').toUpperCase()}] [{entry.src}] {entry.evt}
                          {entry.novelId ? ` novel=${entry.novelId}` : ''}
                          {entry.count !== undefined ? ` count=${entry.count}` : ''}
                          {entry.ms !== undefined ? ` ${entry.ms}ms` : ''}
                          {entry.bytes !== undefined ? ` ${entry.bytes}B` : ''}
                          {entry.msg ? ` - ${entry.msg}` : ''}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: Lần đầu đồng bộ khi cả hai bên đều có dữ liệu */}
      {firstSyncData && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}><Icon name="alert-triangle" size={18} /> Xác Nhận Lần Đầu Đồng Bộ</h3>
            <p style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: '1.5' }}>
              Hệ thống phát hiện cả <strong>Máy này</strong> và <strong>Cloud</strong> đều đang có dữ liệu tu tiên và danh mục truyện. Vui lòng chọn phương án thiết lập gốc:
            </p>

            {firstSyncData.isLocalAhead && (
              <div className={styles.alertDanger}>
                <Icon name="alert-triangle" size={16} /> <strong>Cảnh báo quan trọng:</strong> Máy này đang tiến xa hơn Cloud (Tu vi hoặc số chương đã đọc cao hơn). Nếu chọn "Lấy cloud làm gốc", tiến độ hiện tại sẽ bị ghi đè (hệ thống sẽ tự động sao lưu bản cũ).
              </div>
            )}

            {firstSyncData.duplicatePairs?.length > 0 && (
              <div className={styles.alertWarning}>
                <Icon name="alert-triangle" size={16} /> <strong>Phát hiện truyện cùng tiêu đề khác ID:</strong>
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
                <Icon name="cloud-download" size={16} /> Lấy Cloud làm gốc (Khuyên dùng cho máy phụ)
              </button>

              <button
                className={styles.btnDanger}
                onClick={() => {
                  setShowConfirmLocalMaster(true);
                }}
              >
                <Icon name="cloud-upload" size={16} /> Đẩy máy này làm gốc (Ghi đè Cloud)
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
              <Icon name="alert-triangle" size={16} /> CẢNH BÁO XÁC NHẬN GHI ĐÈ CLOUD
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
      {novelConflictData && (() => {
        const localCount = novelConflictData.localChapterCount ?? 0;
        const cloudCount = novelConflictData.cloudChapterCount ?? 0;
        const cloudHasMore = cloudCount > localCount;
        const localHasMore = localCount > cloudCount;
        const diffCloud = cloudCount - localCount;
        const diffLocal = localCount - cloudCount;

        return (
          <div className={styles.modalBackdrop}>
            <div className={styles.modalContent} style={{ maxWidth: '520px' }}>
              <h3 className={styles.modalTitle}><Icon name="sword" size={18} /> Xung Đột Nội Dung Truyện</h3>
              <p style={{ color: '#cbd5e1', fontSize: '0.9rem', marginBottom: '12px', lineHeight: 1.5 }}>
                Truyện <strong>"{novelConflictData.title}"</strong> có nội dung khác nhau giữa máy này và Cloud (có chương mới hoặc chỉnh sửa ở cả hai bên):
              </p>

              <div style={{ background: 'rgba(255,255,255,0.05)', padding: '14px', borderRadius: '10px', marginBottom: '16px', fontSize: '0.88rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontWeight: 700 }}>
                  <span style={{ color: '#38bdf8' }}>• Máy này: {localCount} chương</span>
                  <span style={{ color: '#fbbf24' }}>• Cloud: {cloudCount} chương</span>
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '4px' }}>
                  • Sửa đổi trên máy này: {formatTime(novelConflictData.localUpdatedAt)}
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '10px' }}>
                  • Sửa đổi trên Cloud: {formatTime(novelConflictData.cloudUpdatedAt)}
                </div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px', color: '#cbd5e1', fontSize: '0.82rem', lineHeight: 1.5 }}>
                  Gộp sẽ giữ mọi chương từ cả hai bên, không mất chương nào, tiến độ đọc không bị ảnh hưởng.
                </div>
              </div>

              <div className={styles.modalActions}>
                {/* 1. Nút Gộp khuyên dùng nổi bật nhất */}
                <button
                  className={styles.btnPrimary}
                  style={{
                    padding: '12px 16px',
                    fontSize: '0.95rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: '#000',
                    border: '1px solid #fde047',
                    boxShadow: '0 0 16px rgba(251, 191, 36, 0.3)',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleResolveNovelConflict('merge')}
                >
                  <Icon name="sparkle" size={18} /> Gộp cả hai (Khuyên dùng)
                </button>

                {/* 2. Giữ bản máy này */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <button
                    className={styles.btnSecondary}
                    style={{ fontSize: '0.85rem', padding: '8px 12px' }}
                    onClick={() => handleResolveNovelConflict('local')}
                  >
                    Giữ bản máy này (Đẩy đè lên Cloud)
                  </button>
                  {cloudHasMore && (
                    <span style={{ color: '#ef4444', fontSize: '0.78rem', paddingLeft: '4px' }}>
                      <Icon name="alert-triangle" size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Cloud có nhiều hơn {diffCloud} chương, chọn mục này sẽ làm Cloud mất chúng!
                    </span>
                  )}
                </div>

                {/* 3. Lấy bản Cloud */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <button
                    className={styles.btnSecondary}
                    style={{ fontSize: '0.85rem', padding: '8px 12px' }}
                    onClick={() => handleResolveNovelConflict('cloud')}
                  >
                    Lấy bản Cloud (Tải đè về máy)
                  </button>
                  {localHasMore && (
                    <span style={{ color: '#ef4444', fontSize: '0.78rem', paddingLeft: '4px' }}>
                      <Icon name="alert-triangle" size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />Máy này có nhiều hơn {diffLocal} chương, chọn mục này sẽ làm máy này mất chúng!
                    </span>
                  )}
                </div>

                {/* 4. Bỏ qua */}
                <button
                  className={styles.btnSecondary}
                  style={{ opacity: 0.65, fontSize: '0.82rem', padding: '6px 12px', marginTop: '2px' }}
                  onClick={() => handleResolveNovelConflict('skip')}
                >
                  Bỏ qua truyện này (Không đổi gì)
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 3: Xung đột Tu Vi */}
      {cultivationConflictData && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <h3 className={styles.modalTitle}><Icon name="bolt" size={18} /> Xung Đột Tu Vi (Hồ Sơ Thật)</h3>
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
    </PageShell>
  );
}
