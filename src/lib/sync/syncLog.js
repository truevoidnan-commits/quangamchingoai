/**
 * src/lib/sync/syncLog.js
 * Nhật ký đồng bộ cục bộ (ring buffer) và theo dõi chẩn đoán kết nối Supabase.
 * Tuyệt đối không lưu dữ liệu nhạy cảm (token, mật khẩu, email, tên truyện trong mật thất, nội dung chương).
 */

export const SYNC_LOG_KEY = 'tcl_sync_log';
export const CONSECUTIVE_FAILURES_KEY = 'tcl_consecutive_network_failures';
export const FIRST_FAILURE_KEY = 'tcl_first_network_failure_at';
export const LAST_SUCCESS_KEY = 'tcl_last_sync_success_at';

export const MAX_LOG_ENTRIES = 200;
export const MAX_LOG_BYTES = 40960; // ~40KB

/**
 * Kiểm tra xem một lỗi có phải lỗi mạng hoặc lỗi máy chủ hay không.
 * Chỉ trả về true cho:
 * - 'Failed to fetch', 'NetworkError', 'fetch failed', 'Load failed', 'network request failed'
 * - 'timeout', 'timed out', 'ECONN', 'connection reset'
 * - Mã HTTP 5xx (500-599 gồm 502, 503, 504, 520-540)
 * - 'Bad Gateway', 'Service Unavailable', 'Gateway Timeout'
 * - 'project is paused', 'paused'
 */
export function isNetworkOrServerError(err) {
  if (!err) return false;

  // 1. Mã HTTP status nếu có
  const status = Number(err?.status || err?.statusCode || err?.code);
  if (!isNaN(status) && status >= 500 && status <= 599) {
    return true;
  }

  const msg = (typeof err === 'string' ? err : String(err?.message || err || '')).toLowerCase();

  // 2. Mã HTTP 5xx trong chuỗi lỗi
  if (/\b5\d{2}\b/.test(msg)) {
    return true;
  }

  // 3. Các mẫu lỗi mạng hoặc máy chủ được chỉ định
  const networkPatterns = [
    'failed to fetch',
    'networkerror',
    'network error',
    'fetch failed',
    'load failed',
    'network request failed',
    'timed out',
    'timeout',
    'econn',
    'connection reset',
    'bad gateway',
    'service unavailable',
    'gateway timeout',
    'project is paused',
    'paused',
  ];

  for (const pattern of networkPatterns) {
    if (msg.includes(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Kiểm tra xem lỗi có phải là lỗi xác thực (Auth/JWT/Login/Permission) hay không.
 * Tránh dò substring 'auth' chung chung để không nhận nhầm tiêu đề truyện chứa chữ 'author', v.v.
 */
export function isAuthError(err) {
  if (!err) return false;

  const status = Number(err?.status || err?.statusCode);
  if (status === 401 || status === 403) return true;

  const msg = (typeof err === 'string' ? err : String(err?.message || err || '')).toLowerCase();

  if (/\b(401|403)\b/.test(msg)) return true;
  if (msg.includes('jwt')) return true;
  if (msg.includes('invalid login')) return true;
  if (msg.includes('not logged in') || msg.includes('not_logged_in')) return true;
  if (msg.includes('chưa đăng nhập')) return true;
  if (msg.includes('invalid token') || msg.includes('token expired') || msg.includes('invalid claim')) return true;
  if (msg.includes('unauthorized') || msg.includes('forbidden')) return true;
  // Chỉ kiểm tra từ 'auth' độc lập (word boundary), không khớp 'author'
  if (/\bauth\b/.test(msg)) return true;

  return false;
}

/**
 * Phân loại mã lỗi ngắn cho log event:
 * 'network' | 'server' | 'size_limit' | 'upload' | 'download' | 'db' | 'unknown'
 */
export function classifyErrorCode(errOrMsg) {
  if (!errOrMsg) return 'unknown';

  const status = Number(errOrMsg?.status || errOrMsg?.statusCode || errOrMsg?.code);
  const msg = (typeof errOrMsg === 'string' ? errOrMsg : String(errOrMsg?.message || errOrMsg || '')).toLowerCase();

  // 1. Quá giới hạn kích thước file
  if (
    msg.includes('45mb') ||
    msg.includes('dung lượng') ||
    msg.includes('vượt quá') ||
    msg.includes('quá lớn') ||
    msg.includes('payload too large') ||
    msg.includes('entity too large') ||
    msg.includes('413')
  ) {
    return 'size_limit';
  }

  // 2. Lỗi máy chủ (HTTP 5xx, Paused)
  if (
    (!isNaN(status) && status >= 500 && status <= 599) ||
    /\b5\d{2}\b/.test(msg) ||
    msg.includes('bad gateway') ||
    msg.includes('service unavailable') ||
    msg.includes('gateway timeout') ||
    msg.includes('project is paused') ||
    msg.includes('paused') ||
    msg.includes('server error')
  ) {
    return 'server';
  }

  // 3. Lỗi mạng kết nối
  if (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network error') ||
    msg.includes('fetch failed') ||
    msg.includes('load failed') ||
    msg.includes('network request failed') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('econn') ||
    msg.includes('connection reset') ||
    msg.includes('offline')
  ) {
    return 'network';
  }

  // 4. Lỗi IndexedDB / bộ nhớ cục bộ
  if (
    msg.includes('indexeddb') ||
    msg.includes('quotaexceeded') ||
    msg.includes('database') ||
    msg.includes('cơ sở dữ liệu') ||
    msg.includes('idb')
  ) {
    return 'db';
  }

  // 5. Lỗi tải lên (upload / push)
  if (
    msg.includes('upload') ||
    msg.includes('tải lên') ||
    msg.includes('push')
  ) {
    return 'upload';
  }

  // 6. Lỗi tải về (download / pull)
  if (
    msg.includes('download') ||
    msg.includes('tải về') ||
    msg.includes('pull')
  ) {
    return 'download';
  }

  return 'unknown';
}

/**
 * Lọc và làm sạch chuỗi lỗi hoặc tin nhắn trước khi ghi vào nhật ký:
 * - Thay mọi đoạn trong ngoặc kép "..." của dạng Truyện "<tên>": ... thành "[truyện]"
 * - Ẩn token Bearer, JWT, chuỗi sb_..., base64 dài (>=30 ký tự)
 * - Ẩn email
 * - Cắt tối đa 160 ký tự
 */
export function sanitizeLogMessage(str) {
  if (str === null || str === undefined) return '';
  let msg = typeof str === 'string' ? str : String(str);

  // 0. Thay mọi đoạn tiêu đề trong ngoặc kép / ngoặc trích dẫn thành "[truyện]"
  // Ví dụ: Truyện "Bí Mật Của Tôi": Lỗi tải lên -> Truyện "[truyện]": Lỗi tải lên
  msg = msg.replace(/["“”«»][^"“”«»]*["“”«»]/g, '"[truyện]"');

  // 1. Ẩn Bearer token
  msg = msg.replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [đã ẩn]');

  // 2. Ẩn JWT (thường bắt đầu bằng eyJ...)
  msg = msg.replace(/eyJ[A-Za-z0-9_\-\.]+/g, '[đã ẩn]');

  // 3. Ẩn Supabase key / tokens (bắt đầu bằng sb_ hoặc sb-)
  msg = msg.replace(/sb[_-][A-Za-z0-9_\-]+/g, '[đã ẩn]');

  // 4. Ẩn chuỗi base64 hoặc chuỗi bí mật dài >= 30 ký tự
  msg = msg.replace(/[A-Za-z0-9+/=]{30,}/g, '[đã ẩn]');

  // 5. Ẩn email
  msg = msg.replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, '[email đã ẩn]');

  // 6. Cắt tối đa 160 ký tự
  if (msg.length > 160) {
    msg = msg.slice(0, 160);
  }

  return msg;
}

/**
 * Ghi 1 mục vào nhật ký đồng bộ (ring buffer tối đa 200 mục, ~40KB)
 * @param {Object} param0
 * @param {'info'|'warn'|'error'} [param0.level='info']
 * @param {'manual'|'auto'|'quick'|'visibility'|'online'|'interval'|'startup'} [param0.src='auto']
 * @param {string} param0.evt - Tên sự kiện (sync_started, light_phase_done, novel_push, v.v.)
 * @param {string} [param0.novelId] - ID truyện (tự động cắt còn 8 ký tự, KHÔNG lưu tiêu đề)
 * @param {number} [param0.count] - Số lượng (chương, truyện, ...)
 * @param {number} [param0.ms] - Thời gian thực thi (mili-giây)
 * @param {number} [param0.bytes] - Kích thước byte truyền tải
 * @param {string|number} [param0.code] - Mã trạng thái / lỗi
 * @param {string} [param0.msg] - Thông điệp vắn tắt (tự động lọc & cắt 160 ký tự)
 */
export function logSyncEvent({
  level = 'info',
  src = 'auto',
  evt,
  novelId,
  count,
  ms,
  bytes,
  code,
  msg,
} = {}) {
  try {
    const validLevel = ['info', 'warn', 'error'].includes(level) ? level : 'info';
    const validSrc = ['manual', 'auto', 'quick', 'visibility', 'online', 'interval', 'startup'].includes(src)
      ? src
      : 'auto';

    const entry = {
      t: Date.now(),
      level: validLevel,
      src: validSrc,
      evt: String(evt || 'unknown'),
    };

    if (novelId) {
      entry.novelId = String(novelId).slice(0, 8);
    }
    if (typeof count === 'number' && !isNaN(count)) {
      entry.count = count;
    }
    if (typeof ms === 'number' && !isNaN(ms)) {
      entry.ms = Math.round(ms);
    }
    if (typeof bytes === 'number' && !isNaN(bytes)) {
      entry.bytes = Math.round(bytes);
    }
    if (code !== undefined && code !== null) {
      entry.code = String(code).slice(0, 30);
    } else if (msg && validLevel === 'error') {
      entry.code = classifyErrorCode(msg);
    }
    if (msg) {
      entry.msg = sanitizeLogMessage(msg);
    }

    // Đọc danh sách hiện có
    let list = [];
    const raw = localStorage.getItem(SYNC_LOG_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      } catch {
        list = [];
      }
    }

    list.push(entry);

    // Cắt giảm theo số lượng tối đa 200
    if (list.length > MAX_LOG_ENTRIES) {
      list = list.slice(-MAX_LOG_ENTRIES);
    }

    // Cắt giảm theo dung lượng tối đa 40KB
    let json = JSON.stringify(list);
    while (json.length > MAX_LOG_BYTES && list.length > 5) {
      list = list.slice(Math.max(1, Math.floor(list.length * 0.1)));
      json = JSON.stringify(list);
    }

    try {
      localStorage.setItem(SYNC_LOG_KEY, json);
    } catch (quotaErr) {
      // Trường hợp QuotaExceededError: cắt bỏ một nửa danh sách và thử lại
      try {
        list = list.slice(Math.floor(list.length / 2));
        localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(list));
      } catch {
        // Nuốt lỗi hoàn toàn, không bao giờ làm hỏng hay chặn luồng đồng bộ
      }
    }
  } catch {
    // Không bao giờ để lỗi nhật ký ném ra ngoài
  }
}

/**
 * Lấy danh sách nhật ký hiện tại
 * @returns {Array<Object>}
 */
export function getSyncLogs() {
  try {
    const raw = localStorage.getItem(SYNC_LOG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

/**
 * Xóa sạch nhật ký đồng bộ
 */
export function clearSyncLogs() {
  try {
    localStorage.removeItem(SYNC_LOG_KEY);
  } catch {}
}

/**
 * Xuất nhật ký dưới dạng chuỗi văn bản thuần (plain text)
 */
export function exportSyncLogsText({ appVersion = 'v1.0.0', profile } = {}) {
  const logs = getSyncLogs();
  const timestamp = new Date().toISOString();
  let activeProfile = profile;
  if (!activeProfile && typeof localStorage !== 'undefined') {
    activeProfile = localStorage.getItem('tcl_active_profile') || 'real';
  }

  const header = `# NHẬT KÝ ĐỒNG BỘ - THIÊN CƠ LÂU [${appVersion}] - ${timestamp} - Hồ sơ: ${activeProfile || 'real'}`;
  if (logs.length === 0) {
    return `${header}\n(Chưa có nhật ký)`;
  }

  const lines = logs.map((e) => {
    const d = new Date(e.t);
    const timeStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    let line = `[${timeStr}] [${(e.level || 'INFO').toUpperCase()}] [${e.src || 'auto'}] ${e.evt || ''}`;
    if (e.novelId) line += ` novel=${e.novelId}`;
    if (e.count !== undefined) line += ` count=${e.count}`;
    if (e.ms !== undefined) line += ` ${e.ms}ms`;
    if (e.bytes !== undefined) line += ` ${e.bytes}B`;
    if (e.code !== undefined) line += ` code=${e.code}`;
    if (e.msg) line += ` - ${e.msg}`;
    return line;
  });

  return `${header}\n${lines.join('\n')}`;
}

/**
 * Ghi nhận đồng bộ thành công: reset bộ đếm lỗi mạng, cập nhật mốc thành công
 */
export function recordSyncSuccess() {
  try {
    localStorage.setItem(LAST_SUCCESS_KEY, String(Date.now()));
    localStorage.setItem(CONSECUTIVE_FAILURES_KEY, '0');
    localStorage.removeItem(FIRST_FAILURE_KEY);
  } catch {}
}

/**
 * Ghi nhận thất bại đồng bộ để theo dõi nghi vấn Supabase bị tạm dừng.
 * - Nhận một lỗi đơn lẻ hoặc một mảng các lỗi (errors array).
 * - Phân loại từng lỗi: Chỉ tăng bộ đếm khi có ÍT NHẤT một lỗi là network/server VÀ không phải auth error.
 * - Các lỗi dữ liệu đơn thuần (vượt quá 45MB, xung đột, parse) KHÔNG tăng bộ đếm nhưng cũng KHÔNG reset bộ đếm.
 * - Bỏ qua khi thiết bị đang offline (navigator.onLine === false).
 */
export function recordSyncFailure(errOrErrors) {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return; // Đang offline cục bộ, không tính lỗi mạng máy chủ
    }

    if (!errOrErrors) return;

    const list = Array.isArray(errOrErrors) ? errOrErrors : [errOrErrors];
    if (list.length === 0) return;

    // Phân loại từng lỗi:
    // Cần có ÍT NHẤT một lỗi là network/server VÀ không phải là lỗi auth
    const hasNetworkFailure = list.some((err) => {
      if (isAuthError(err)) return false;
      return isNetworkOrServerError(err);
    });

    if (!hasNetworkFailure) {
      // Các lỗi dữ liệu đơn thuần không làm tăng bộ đếm nhưng cũng KHÔNG reset bộ đếm.
      return;
    }

    const cur = parseInt(localStorage.getItem(CONSECUTIVE_FAILURES_KEY) || '0', 10);
    const next = cur + 1;
    localStorage.setItem(CONSECUTIVE_FAILURES_KEY, String(next));
    if (!localStorage.getItem(FIRST_FAILURE_KEY)) {
      localStorage.setItem(FIRST_FAILURE_KEY, String(Date.now()));
    }
  } catch {}
}

/**
 * Kiểm tra xem có nghi vấn dự án Supabase bị tạm dừng hay không.
 * Điều kiện:
 * - Đang online (navigator.onLine !== false)
 * - Lỗi mạng/máy chủ liên tiếp >= 3 lần
 * - Đã kéo dài > 1 giờ kể từ lần thành công gần nhất (hoặc chưa bao giờ thành công)
 */
export function isSupabasePausedSuspected() {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return false;
    }

    const count = parseInt(localStorage.getItem(CONSECUTIVE_FAILURES_KEY) || '0', 10);
    if (count < 3) return false;

    const lastSuccess = parseInt(localStorage.getItem(LAST_SUCCESS_KEY) || '0', 10);
    const now = Date.now();

    // Nếu đã từng thành công và lần thành công gần nhất chưa quá 1 giờ thì chưa cảnh báo
    if (lastSuccess > 0 && now - lastSuccess <= 3600000) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Lấy mốc thời gian (ms) của lần đồng bộ thành công gần nhất
 */
export function getLastSyncSuccessAt() {
  try {
    const val = localStorage.getItem(LAST_SUCCESS_KEY);
    if (val) return parseInt(val, 10);
  } catch {}
  return 0;
}
