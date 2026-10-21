/**
 * src/lib/cultivationBackup.js
 * CHỈ ĐỌC (READ-ONLY) - Tuyệt đối không thay đổi bất kỳ state nào trong localStorage hay bộ nhớ.
 */
import { getActiveProfile, getCultivationKey } from './cultivation.js';

/**
 * Đóng gói dữ liệu sao lưu của hồ sơ đang dùng:
 * Cấu trúc: { profile, state, pending, exportedAt }
 */
export function getCultivationBackupData() {
  const profile = getActiveProfile();
  const stateKey = getCultivationKey('state', profile);
  const pendingKey = getCultivationKey('pending_seconds', profile);

  let state = {};
  try {
    const rawState = localStorage.getItem(stateKey);
    state = rawState ? JSON.parse(rawState) : {};
  } catch {
    state = {};
  }

  let pending = 0;
  try {
    const rawPending = localStorage.getItem(pendingKey);
    pending = rawPending && !isNaN(parseInt(rawPending, 10)) ? parseInt(rawPending, 10) : 0;
  } catch {
    pending = 0;
  }

  return {
    profile,
    exportedAt: new Date().toISOString(),
    pending,
    state,
  };
}

/**
 * Tạo tên tệp sao lưu: tu-vi-backup-<profile>-<YYYY-MM-DD>.json
 */
export function getCultivationBackupFilename(profile = getActiveProfile()) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `tu-vi-backup-${profile}-${year}-${month}-${day}.json`;
}

/**
 * Cách 1: Tải tệp JSON xuống thiết bị (Blob + thẻ a download)
 */
export function triggerDownloadBackup(backupData) {
  const data = backupData || getCultivationBackupData();
  const filename = getCultivationBackupFilename(data.profile);
  const jsonStr = JSON.stringify(data, null, 2);

  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { filename, jsonStr };
}
