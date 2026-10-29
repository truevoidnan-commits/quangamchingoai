import React, { useState, useEffect, Suspense } from 'react';
import { getActiveProfile, setActiveProfile } from '../../lib/cultivation';
import { lazyWithRetry } from '../../lib/lazyWithRetry';
import styles from './SandboxBanner.module.css';

const AdminSandboxModal = lazyWithRetry(
  () => import('./AdminSandboxModal'),
  'AdminSandboxModal'
);

export default function SandboxBanner() {
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const activeProfile = getActiveProfile();
  const isSandbox = activeProfile === 'sandbox';

  useEffect(() => {
    if (isSandbox) {
      document.body.classList.add('has-sandbox-banner');
      return () => {
        document.body.classList.remove('has-sandbox-banner');
      };
    }
  }, [isSandbox]);

  if (!isSandbox) {
    return null;
  }

  const handleSwitchToReal = () => {
    const confirmed = window.confirm(
      'Bạn có chắc chắn muốn quay về HỒ SƠ THẬT không?\n\nTiến trình trong Hồ Sơ Thử Nghiệm vẫn được lưu riêng biệt và bạn có thể chuyển lại bất cứ lúc nào.'
    );
    if (confirmed) {
      setActiveProfile('real');
      window.location.reload();
    }
  };

  return (
    <>
      <aside className={styles.banner} aria-label="Cảnh báo Hồ Sơ Thử Nghiệm">
        <div className={styles.leftInfo}>
          <span className={styles.icon}>⚠️</span>
          <span className={styles.tag}>SANDBOX</span>
          <span className={styles.text}>
            ĐANG Ở HỒ SƠ THỬ NGHIỆM – không ảnh hưởng tu vi thật
          </span>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.adminBtn}
            onClick={() => setIsAdminModalOpen(true)}
            title="Mở Bảng Điều Khiển Admin (chỉ có trong Sandbox)"
          >
            <span>⚡</span>
            <span>Bảng Admin</span>
          </button>

          <button
            type="button"
            className={styles.switchBackBtn}
            onClick={handleSwitchToReal}
            title="Quay lại Hồ Sơ Thật"
          >
            <span>↩</span>
            <span>Quay về Hồ Sơ Thật</span>
          </button>
        </div>
      </aside>

      {isAdminModalOpen && (
        <Suspense fallback={null}>
          <AdminSandboxModal
            isOpen={isAdminModalOpen}
            onClose={() => setIsAdminModalOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}
