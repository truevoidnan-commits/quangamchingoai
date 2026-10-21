import React from 'react';
import { getActiveProfile, setActiveProfile } from '../../lib/cultivation';
import styles from './ProfileSwitcher.module.css';

export default function ProfileSwitcher({ compact = false, className = '' }) {
  const profile = getActiveProfile();
  const isSandbox = profile === 'sandbox';

  const handleToggle = () => {
    if (isSandbox) {
      const confirmSwitch = window.confirm(
        'Bạn có muốn quay về HỒ SƠ THẬT (Chính thức)?\n\nDữ liệu trong Hồ sơ Thử nghiệm vẫn được lưu riêng biệt và bạn có thể chuyển lại bất cứ lúc nào.'
      );
      if (confirmSwitch) {
        setActiveProfile('real');
        window.location.reload();
      }
    } else {
      const confirmSwitch = window.confirm(
        'Bạn có muốn chuyển sang HỒ SƠ THỬ NGHIỆM (Sandbox)?\n\n' +
          '• Được mở khóa Bảng Điều Khiển Admin (nhảy cấp, chỉnh tu vi, test tính năng).\n' +
          '• Dữ liệu Tu Vi Thật của bạn được giữ nguyên an toàn 100%.'
      );
      if (confirmSwitch) {
        setActiveProfile('sandbox');
        window.location.reload();
      }
    }
  };

  if (compact) {
    return (
      <button
        type="button"
        className={`${styles.compactSwitcher} ${
          isSandbox ? styles.compactSandbox : styles.compactReal
        } ${className}`}
        onClick={handleToggle}
        title={
          isSandbox
            ? 'Đang ở Sandbox. Bấm để quay về Hồ Sơ Thật'
            : 'Đang ở Hồ Sơ Thật. Bấm để mở Hồ Sơ Thử Nghiệm'
        }
      >
        <span>{isSandbox ? '🧪' : '🛡️'}</span>
        <span>{isSandbox ? 'Thử Nghiệm' : 'Hồ Sơ Thật'}</span>
      </button>
    );
  }

  return (
    <div
      className={`${styles.switcherContainer} ${
        isSandbox ? styles.sandboxContainer : styles.realContainer
      } ${className}`}
    >
      <div className={styles.infoArea}>
        <span className={styles.profileLabel}>Hồ sơ tu luyện</span>
        <div
          className={`${styles.profileValue} ${
            isSandbox ? styles.sandboxText : styles.realText
          }`}
        >
          <span>{isSandbox ? '🧪' : '🛡️'}</span>
          <span>{isSandbox ? 'Thử Nghiệm (Sandbox)' : 'Tu Vi Thật'}</span>
        </div>
      </div>

      <button
        type="button"
        className={styles.switchBtn}
        onClick={handleToggle}
        title={
          isSandbox
            ? 'Bấm để quay về Hồ Sơ Thật'
            : 'Bấm để chuyển sang Hồ Sơ Thử Nghiệm'
        }
      >
        <span>⇄</span>
        <span>{isSandbox ? 'Về Hồ Sơ Thật' : 'Đổi Sang Thử Nghiệm'}</span>
      </button>
    </div>
  );
}
