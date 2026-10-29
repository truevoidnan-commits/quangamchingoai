/**
 * src/lib/sync/realtimeSignal.js
 * Đồng bộ gần như tức thời (1–3 giây) bằng Supabase Realtime Broadcast.
 * Realtime chỉ làm "tín hiệu chuông" (doorbell ping) kích hoạt lượt đồng bộ nhẹ,
 * TUYỆT ĐỐI không mang dữ liệu thật và không thay thế lõi đồng bộ.
 */

import { isProductionHost } from './envProtection.js';
import { getDeviceId } from './syncLedger.js';
import { getActiveProfile } from '../cultivation.js';
import { isAutoSyncEnabled, runAutoSync } from './autoSync.js';
import { logSyncEvent } from './syncLog.js';

export const REALTIME_ENABLED_KEY = 'tcl_realtime_enabled';
export const REALTIME_STATUS_CHANGED_EVENT = 'tcl_realtime_status_changed';

// Trạng thái kết nối hiện tại: 'active' | 'connecting' | 'paused' | 'disabled'
let _realtimeStatus = 'disabled';
let _activeChannel = null;
let _supabaseClient = null;
let _currentUserId = null;
let _authSubscription = null;
let _authClient = null;
let _lifecycleListenersAttached = false;

// Chống race condition khi khởi động kênh đồng thời (in-flight startRealtime)
let _startingTopic = null;
let _startPromise = null;
let _startSeq = 0;

// Bộ đếm lỗi và các bộ hẹn giờ
let _consecutiveErrors = 0;
let _retryTimer = null;
let _pauseTimer = null;
let _hideTimer = null;
let _outboundBatchTimer = null;
let _inboundDebounceTimer = null;
let _rateLimitTimer = null;

// Hàng đợi và mốc thời gian
let _batchedOutboundScopes = new Set();
let _lastRealtimeSyncTime = 0;
let _pendingRealtimeSync = false;
let _syncStatusListenerAttached = false;

// Hook hỗ trợ kiểm thử
let _testOverrideDeviceId = null;

export function _setTestDeviceId(id) {
  _testOverrideDeviceId = id;
}

/**
 * Lấy mã định danh thiết bị rút gọn (an toàn, không mang thông tin nhạy cảm)
 */
function getShortDeviceId() {
  if (_testOverrideDeviceId) return _testOverrideDeviceId;
  const fullId = getDeviceId();
  return fullId ? String(fullId).slice(0, 16) : 'dev_unknown';
}

/**
 * Kiểm tra trạng thái bật/tắt công tắc Đồng bộ tức thời của người dùng.
 * Mặc định: BẬT (true).
 */
export function isRealtimeEnabled() {
  try {
    if (typeof localStorage === 'undefined') return true;
    const val = localStorage.getItem(REALTIME_ENABLED_KEY);
    if (val === null) return true;
    return val === 'true' || val === '1';
  } catch {
    return false;
  }
}

/**
 * Bật/tắt công tắc Đồng bộ tức thời. Lưu cục bộ (không đồng bộ lên cloud).
 */
export function setRealtimeEnabled(enabled) {
  const boolVal = Boolean(enabled);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(REALTIME_ENABLED_KEY, boolVal ? 'true' : 'false');
    }
  } catch {}

  reconcileRealtime();
}

/**
 * Điều chỉnh trạng thái kết nối Realtime dựa trên các điều kiện hiện thời.
 * Dùng _supabaseClient và _currentUserId đã lưu.
 * Nếu canEnableRealtime() và chưa active/connecting -> startRealtime.
 * Nếu không được phép và đang chạy -> stopRealtime (cập nhật 'disabled' cho UI).
 */
export function reconcileRealtime() {
  if (canEnableRealtime()) {
    if (_supabaseClient && _currentUserId) {
      if (_realtimeStatus !== 'active' && _realtimeStatus !== 'connecting') {
        startRealtime(_supabaseClient, _currentUserId).catch(() => {});
      }
    }
  } else {
    if (_realtimeStatus !== 'disabled') {
      stopRealtime();
    } else {
      notifyRealtimeStatusChange('disabled');
    }
  }
}

/**
 * Lấy trạng thái hoạt động Realtime hiện tại
 * @returns {'active'|'connecting'|'paused'|'disabled'}
 */
export function getRealtimeStatus() {
  return _realtimeStatus;
}

/**
 * Cập nhật và phát sự kiện thay đổi trạng thái Realtime cho UI (SyncPage)
 */
function notifyRealtimeStatusChange(newStatus) {
  _realtimeStatus = newStatus;
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(
        new CustomEvent(REALTIME_STATUS_CHANGED_EVENT, { detail: { status: _realtimeStatus } })
      );
    } catch {}
  }
}

/**
 * Kiểm tra các điều kiện tiên quyết để được phép kích hoạt Realtime
 */
export function canEnableRealtime() {
  if (!isProductionHost()) return false;
  if (getActiveProfile() !== 'real') return false;
  if (!isAutoSyncEnabled()) return false;
  if (!isRealtimeEnabled()) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
  return true;
}

/**
 * Bắt đầu kết nối kênh Realtime riêng tư cho người dùng
 * @param {Object} client - Supabase Client
 * @param {string} userId - ID người dùng hiện tại
 */
export async function startRealtime(client, userId) {
  if (!client || !userId) {
    stopRealtime();
    return;
  }

  _supabaseClient = client;
  _currentUserId = userId;
  attachLifecycleListeners();
  attachAuthListener(client);

  // Kiểm tra điều kiện tiên quyết (bảo vệ môi trường, sandbox, công tắc, visibility)
  if (!canEnableRealtime()) {
    notifyRealtimeStatusChange('disabled');
    return;
  }

  // Nếu đã có kênh đang kết nối cho đúng user này thì không tạo trùng
  const topic = `sync:${userId}`;
  if (_activeChannel && _activeChannel.topic === topic && (_realtimeStatus === 'active' || _realtimeStatus === 'connecting')) {
    return;
  }

  // Nếu đang có tiến trình kết nối cho cùng topic (chưa gán _activeChannel), tránh race tạo trùng kênh
  if (_startingTopic === topic) {
    return _startPromise || undefined;
  }

  // Dọn kênh cũ nếu khác topic hoặc đang dang dở
  if (_activeChannel) {
    cleanupChannelOnly();
  }

  const currentSeq = ++_startSeq;
  _startingTopic = topic;
  notifyRealtimeStatusChange('connecting');

  const runStart = async () => {
    try {
      // 1. Cập nhật auth token cho Realtime socket nếu có session
      if (client.auth && typeof client.auth.getSession === 'function') {
        try {
          const { data: { session } } = await client.auth.getSession();
          if (session?.access_token && client.realtime && typeof client.realtime.setAuth === 'function') {
            await client.realtime.setAuth(session.access_token);
          }
        } catch (authErr) {
          // Nuốt lỗi auth ở đây để quá trình subscribe tự xử lý qua RLS
        }
      }

      // Hủy bỏ an toàn: sau khi await, kiểm tra lại toàn bộ điều kiện.
      // Nếu stopRealtime() đã được gọi (hoặc phiên start mới thay thế,
      // hoặc trạng thái chuyển sang disabled, hoặc user/profile/công tắc thay đổi):
      if (
        currentSeq !== _startSeq ||
        _startingTopic !== topic ||
        _realtimeStatus === 'disabled' ||
        !canEnableRealtime() ||
        _currentUserId !== userId
      ) {
        return;
      }

      // 2. Khởi tạo kênh riêng tư (private: true, broadcast.self = false)
      const channel = client.channel(topic, {
        config: {
          private: true,
          broadcast: { self: false },
        },
      });

      // 3. Lắng nghe tín hiệu broadcast từ các thiết bị khác
      channel.on('broadcast', { event: 'sync_signal' }, ({ payload }) => {
        handleIncomingSignal(payload);
      });

      // 4. Theo dõi trạng thái kết nối
      channel.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          _consecutiveErrors = 0;
          notifyRealtimeStatusChange('active');
          logSyncEvent({
            level: 'info',
            src: 'realtime',
            evt: 'realtime_subscribed',
          });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          handleChannelFailure(status, err);
        }
      });

      _activeChannel = channel;
    } catch (err) {
      handleChannelFailure('CHANNEL_ERROR', err);
    } finally {
      if (_startingTopic === topic && currentSeq === _startSeq) {
        _startingTopic = null;
        _startPromise = null;
      }
    }
  };

  _startPromise = runStart();
  return _startPromise;
}

/**
 * Xử lý khi kênh gặp sự cố ngắt kết nối hoặc lỗi
 */
function handleChannelFailure(status, err) {
  // Nếu kênh bị đóng có chủ ý (do stopRealtime hoặc visibility timeout) thì không tính lỗi
  if (_realtimeStatus === 'disabled') {
    return;
  }

  _consecutiveErrors++;
  logSyncEvent({
    level: 'warn',
    src: 'realtime',
    evt: 'realtime_error',
    code: status || 'CHANNEL_ERROR',
  });

  cleanupChannelOnly();

  if (_consecutiveErrors <= 3) {
    const delays = [5000, 15000, 60000];
    const delay = delays[_consecutiveErrors - 1] || 60000;
    notifyRealtimeStatusChange('connecting');

    if (_retryTimer) clearTimeout(_retryTimer);
    _retryTimer = setTimeout(() => {
      _retryTimer = null;
      if (canEnableRealtime() && _supabaseClient && _currentUserId) {
        startRealtime(_supabaseClient, _currentUserId).catch(() => {});
      }
    }, delay);
  } else {
    // Thất bại quá 3 lần: tạm dừng thử trong 10 phút để tránh spam socket
    notifyRealtimeStatusChange('paused');

    if (_pauseTimer) clearTimeout(_pauseTimer);
    _pauseTimer = setTimeout(() => {
      _pauseTimer = null;
      _consecutiveErrors = 0;
      if (canEnableRealtime() && _supabaseClient && _currentUserId) {
        startRealtime(_supabaseClient, _currentUserId).catch(() => {});
      }
    }, 10 * 60 * 1000);
  }
}

/**
 * Dọn dẹp kênh socket mà không hủy client/user
 */
function cleanupChannelOnly() {
  if (_activeChannel) {
    try {
      if (_supabaseClient && typeof _supabaseClient.removeChannel === 'function') {
        _supabaseClient.removeChannel(_activeChannel);
      } else if (typeof _activeChannel.unsubscribe === 'function') {
        _activeChannel.unsubscribe();
      }
    } catch {}
    _activeChannel = null;
  }
}

/**
 * Dừng hoàn toàn Realtime, gỡ đăng ký kênh và dọn dẹp bộ hẹn giờ
 */
export function stopRealtime() {
  _startSeq++;
  _startingTopic = null;
  _startPromise = null;

  cleanupChannelOnly();

  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }
  if (_pauseTimer) {
    clearTimeout(_pauseTimer);
    _pauseTimer = null;
  }
  if (_hideTimer) {
    clearTimeout(_hideTimer);
    _hideTimer = null;
  }
  if (_outboundBatchTimer) {
    clearTimeout(_outboundBatchTimer);
    _outboundBatchTimer = null;
  }
  if (_inboundDebounceTimer) {
    clearTimeout(_inboundDebounceTimer);
    _inboundDebounceTimer = null;
  }
  if (_rateLimitTimer) {
    clearTimeout(_rateLimitTimer);
    _rateLimitTimer = null;
  }

  _consecutiveErrors = 0;
  _pendingRealtimeSync = false;
  _lastRealtimeSyncTime = 0;
  _batchedOutboundScopes.clear();

  if (_realtimeStatus !== 'disabled') {
    logSyncEvent({
      level: 'info',
      src: 'realtime',
      evt: 'realtime_closed',
    });
  }

  notifyRealtimeStatusChange('disabled');
}

/**
 * Phát tín hiệu cho các thiết bị khác khi vừa đẩy thành công dữ liệu lên Cloud.
 * Gộp nhiều lần gọi trong 1 giây thành một tin duy nhất.
 * @param {Array<string>} scopes - Danh sách phạm vi: 'progress'|'cultivation'|'library'|'content'|'settings'
 */
export function notifyOtherDevices(scopes = []) {
  if (!isProductionHost() || getActiveProfile() !== 'real' || !isRealtimeEnabled() || !isAutoSyncEnabled()) {
    return;
  }

  const validScopes = ['progress', 'cultivation', 'library', 'content', 'settings'];
  const inputList = Array.isArray(scopes) ? scopes : [scopes];
  for (const s of inputList) {
    if (validScopes.includes(s)) {
      _batchedOutboundScopes.add(s);
    }
  }

  if (_batchedOutboundScopes.size === 0) return;

  if (_outboundBatchTimer) return; // Đang đợi gom trong 1 giây

  _outboundBatchTimer = setTimeout(() => {
    _outboundBatchTimer = null;
    flushOutboundSignal().catch(() => {});
  }, 1000);
}

/**
 * Thực thi gửi gói tin tín hiệu đã gộp qua kênh Realtime
 */
async function flushOutboundSignal() {
  if (_batchedOutboundScopes.size === 0) return;
  const scopesToSend = Array.from(_batchedOutboundScopes);
  _batchedOutboundScopes.clear();

  if (!_activeChannel || _realtimeStatus !== 'active' || !isAutoSyncEnabled()) {
    return; // Kênh chưa sẵn sàng hoặc đã đóng, hoặc autoSync bị tắt, nuốt im lặng
  }

  try {
    const payload = {
      v: 1,
      d: getShortDeviceId(),
      at: Date.now(),
      s: scopesToSend,
    };

    await _activeChannel.send({
      type: 'broadcast',
      event: 'sync_signal',
      payload,
    });

    logSyncEvent({
      level: 'info',
      src: 'realtime',
      evt: 'realtime_signal_sent',
    });
  } catch (err) {
    // Lỗi phát tin (mất kết nối, kênh đóng) nuốt hoàn toàn, không được làm hỏng đồng bộ
  }
}

/**
 * Xử lý gói tin tín hiệu nhận được từ thiết bị khác
 */
function handleIncomingSignal(payload) {
  // 1. Kiểm tra tính hợp lệ cơ bản
  if (!payload || payload.v !== 1) return;

  // 2. Bỏ qua nếu tin phát từ chính thiết bị này (chống lặp và chống tab khác cùng máy)
  const myDeviceId = getShortDeviceId();
  if (payload.d && payload.d === myDeviceId) {
    return;
  }

  // 3. Ghi nhận log (không lưu nội dung tin)
  logSyncEvent({
    level: 'info',
    src: 'realtime',
    evt: 'realtime_signal_received',
  });

  // 4. Debounce 1.5 giây để gộp tin dồn dập
  if (_inboundDebounceTimer) {
    clearTimeout(_inboundDebounceTimer);
  }

  _inboundDebounceTimer = setTimeout(() => {
    _inboundDebounceTimer = null;
    scheduleRealtimeSync();
  }, 1500);
}

/**
 * Lên lịch chạy đồng bộ do Realtime kích hoạt, đảm bảo giới hạn tần suất 5s
 */
function scheduleRealtimeSync() {
  const now = Date.now();
  const timeSinceLastSync = now - _lastRealtimeSyncTime;
  const MIN_INTERVAL = 5000; // Giới hạn tối thiểu 5 giây giữa 2 lượt Realtime

  if (timeSinceLastSync < MIN_INTERVAL) {
    const delay = MIN_INTERVAL - timeSinceLastSync;
    if (_rateLimitTimer) clearTimeout(_rateLimitTimer);
    _rateLimitTimer = setTimeout(() => {
      _rateLimitTimer = null;
      executeRealtimeSync();
    }, delay);
    return;
  }

  executeRealtimeSync();
}

/**
 * Thực thi lượt đồng bộ nhẹ do Realtime kích hoạt
 */
async function executeRealtimeSync() {
  try {
    const res = await runAutoSync(_supabaseClient, { src: 'realtime' });

    // Nếu khóa bận (đang có lượt sync khác chạy) -> đánh dấu chạy lại một lần sau khi xong
    if (res && res.reason === 'locked') {
      _pendingRealtimeSync = true;
      attachSyncStatusListener();
      return;
    }

    _lastRealtimeSyncTime = Date.now();
  } catch {
    // Nuốt lỗi, không ném ra ngoài
  }
}

/**
 * Lắng nghe sự kiện đồng bộ hoàn tất để chạy bù nếu lượt Realtime từng bị khóa bận
 */
function attachSyncStatusListener() {
  if (_syncStatusListenerAttached || typeof window === 'undefined') return;
  _syncStatusListenerAttached = true;

  const handleSyncStatus = (e) => {
    const status = e?.detail;
    if (status && status.state !== 'syncing' && _pendingRealtimeSync) {
      _pendingRealtimeSync = false;
      // Trì hoãn một chút để đảm bảo khóa đã hoàn toàn nhả
      setTimeout(() => {
        executeRealtimeSync();
      }, 100);
    }
  };

  window.addEventListener('tcl_sync_status_changed', handleSyncStatus);
}

/**
 * Gắn các sự kiện vòng đời trình duyệt (Visibility, Online, Auth change, Profile change)
 */
function attachLifecycleListeners() {
  if (_lifecycleListenersAttached || typeof window === 'undefined') return;
  _lifecycleListenersAttached = true;

  // 1. Quản lý tab ẩn / hiện để tiết kiệm pin
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        // Tab bị ẩn: hẹn giờ đóng kênh sau 30 giây
        if (_hideTimer) clearTimeout(_hideTimer);
        _hideTimer = setTimeout(() => {
          _hideTimer = null;
          if (_activeChannel) {
            cleanupChannelOnly();
            notifyRealtimeStatusChange('disabled');
            logSyncEvent({
              level: 'info',
              src: 'realtime',
              evt: 'realtime_closed',
            });
          }
        }, 30000);
      } else if (document.visibilityState === 'visible') {
        // Tab hiện lại: hủy hẹn giờ đóng và kết nối lại nếu cần
        if (_hideTimer) {
          clearTimeout(_hideTimer);
          _hideTimer = null;
        }
        if (canEnableRealtime() && _supabaseClient && _currentUserId) {
          startRealtime(_supabaseClient, _currentUserId).catch(() => {});
        }
      }
    });
  }

  // 2. Sự kiện có mạng trở lại
  window.addEventListener('online', () => {
    if (canEnableRealtime() && _supabaseClient && _currentUserId) {
      _consecutiveErrors = 0;
      startRealtime(_supabaseClient, _currentUserId).catch(() => {});
    }
  });

  // 3. Sự kiện chuyển đổi hồ sơ (Thật <-> Sandbox)
  window.addEventListener('tcl_profile_changed', () => {
    reconcileRealtime();
  });

}

/**
 * Gắn bộ theo dõi phiên đăng nhập Supabase Auth
 */
function attachAuthListener(client) {
  if (!client?.auth?.onAuthStateChange) return;
  if (_authClient === client && _authSubscription) return;

  if (_authSubscription && typeof _authSubscription.unsubscribe === 'function') {
    try {
      _authSubscription.unsubscribe();
    } catch {}
    _authSubscription = null;
  }

  _authClient = client;
  try {
    const { data: { subscription } } = client.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        stopRealtime();
        _currentUserId = null;
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session.access_token && _supabaseClient?.realtime && typeof _supabaseClient.realtime.setAuth === 'function') {
          try {
            await _supabaseClient.realtime.setAuth(session.access_token);
          } catch {}
        }
        if (session.user?.id) {
          _currentUserId = session.user.id;
          if (canEnableRealtime()) {
            startRealtime(_supabaseClient, session.user.id).catch(() => {});
          }
        }
      }
    });
    _authSubscription = subscription;
  } catch {}
}

/**
 * Reset toàn bộ module state phục vụ unit test độc lập
 */
export function _resetRealtimeForTesting() {
  stopRealtime();
  _startSeq = 0;
  _startingTopic = null;
  _startPromise = null;
  _supabaseClient = null;
  _currentUserId = null;
  if (_authSubscription && typeof _authSubscription.unsubscribe === 'function') {
    try {
      _authSubscription.unsubscribe();
    } catch {}
  }
  _authSubscription = null;
  _authClient = null;
  _lifecycleListenersAttached = false;
  _syncStatusListenerAttached = false;
  _consecutiveErrors = 0;
  _testOverrideDeviceId = null;
}
