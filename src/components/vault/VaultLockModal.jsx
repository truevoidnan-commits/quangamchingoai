import React, { useState, useEffect, useRef } from 'react';
import {
  hasVaultPassword,
  setVaultPassword,
  verifyVaultPassword,
  changeVaultPassword,
  getVaultHint
} from '../../lib/storage';
import styles from './VaultLockModal.module.css';

/**
 * VaultLockModal
 * Handles unlocking, first-time PIN/password setup, and changing password for the Hidden Vault.
 */
export default function VaultLockModal({
  isOpen,
  mode = 'unlock', // 'unlock' | 'set' | 'change' | 'first_hide'
  onSuccess,
  onClose,
  novelToHide = null,
}) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [hint, setHint] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [showHintText, setShowHintText] = useState(false);

  const inputRef = useRef(null);
  const existingHint = getVaultHint();

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setConfirmPassword('');
      setOldPassword('');
      setHint('');
      setError('');
      setShake(false);
      setShowHintText(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, mode]);

  if (!isOpen) return null;

  const triggerError = (msg) => {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    setError('');

    if (mode === 'unlock') {
      if (!password.trim()) {
        triggerError('Vui lòng nhập mật khẩu Mật Thất');
        return;
      }
      if (verifyVaultPassword(password.trim())) {
        onSuccess?.(password.trim());
      } else {
        triggerError('Mật khẩu không chính xác. Vui lòng thử lại!');
      }
      return;
    }

    if (mode === 'set' || mode === 'first_hide') {
      if (!password.trim()) {
        triggerError('Vui lòng nhập mật khẩu');
        return;
      }
      if (password.length < 3) {
        triggerError('Mật khẩu nên có ít nhất 3 ký tự');
        return;
      }
      if (password !== confirmPassword) {
        triggerError('Xác nhận mật khẩu không trùng khớp');
        return;
      }
      setVaultPassword(password.trim(), hint.trim());
      onSuccess?.(password.trim());
      return;
    }

    if (mode === 'change') {
      if (!oldPassword.trim()) {
        triggerError('Vui lòng nhập mật khẩu hiện tại');
        return;
      }
      if (!password.trim()) {
        triggerError('Vui lòng nhập mật khẩu mới');
        return;
      }
      if (password.length < 3) {
        triggerError('Mật khẩu mới nên có ít nhất 3 ký tự');
        return;
      }
      if (password !== confirmPassword) {
        triggerError('Xác nhận mật khẩu mới không trùng khớp');
        return;
      }
      const res = changeVaultPassword(oldPassword.trim(), password.trim(), hint.trim());
      if (res.success) {
        onSuccess?.(password.trim());
      } else {
        triggerError(res.message);
      }
    }
  };

  const isSetupMode = mode === 'set' || mode === 'first_hide';

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={`${styles.modal} ${shake ? styles.shake : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.runeBg} />

        <button className={styles.closeBtn} onClick={onClose} title="Đóng">
          ✕
        </button>

        <div className={styles.header}>
          <div className={styles.iconCircle}>
            {isSetupMode ? '🗝️' : mode === 'change' ? '⚙️' : '🔒'}
          </div>

          <h3 className={styles.title}>
            {isSetupMode
              ? 'Thiết Lập Mật Khẩu Mật Thất'
              : mode === 'change'
              ? 'Đổi Mật Khẩu Mật Thất'
              : 'Mở Khóa Mật Thất'}
          </h3>

          <p className={styles.subtitle}>
            {mode === 'first_hide' && novelToHide
              ? `Để ẩn truyện "${novelToHide.title}", vui lòng tạo mật khẩu bảo vệ cho Mật Thất.`
              : isSetupMode
              ? 'Mật Thất dùng để lưu trữ các bộ truyện ẩn riêng tư. Hãy tạo mật khẩu để bảo vệ không gian này.'
              : mode === 'change'
              ? 'Nhập mật khẩu hiện tại và tạo mật khẩu mới cho Mật Thất.'
              : 'Nhập mật khẩu để truy cập vào Tàng Kinh Mật Thất chứa các bộ truyện đã ẩn.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Old Password (only in change mode) */}
          {mode === 'change' && (
            <div className={styles.inputGroup}>
              <label className={styles.label}>Mật khẩu hiện tại</label>
              <div className={styles.inputWrap}>
                <input
                  ref={inputRef}
                  type={showPassword ? 'text' : 'password'}
                  className={styles.input}
                  placeholder="Nhập mật khẩu cũ..."
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Main Password Input */}
          <div className={styles.inputGroup}>
            <label className={styles.label}>
              {mode === 'change'
                ? 'Mật khẩu mới'
                : isSetupMode
                ? 'Mật khẩu mới'
                : 'Mật khẩu Mật Thất'}
            </label>
            <div className={styles.inputWrap}>
              <input
                ref={mode !== 'change' ? inputRef : null}
                type={showPassword ? 'text' : 'password'}
                className={styles.input}
                placeholder={isSetupMode ? 'Nhập mật khẩu (PIN hoặc chữ)...' : 'Nhập mật khẩu...'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          {/* Confirm Password (in setup or change mode) */}
          {isSetupMode || mode === 'change' ? (
            <>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Xác nhận mật khẩu</label>
                <div className={styles.inputWrap}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className={styles.input}
                    placeholder="Nhập lại mật khẩu..."
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.label}>Gợi ý mật khẩu (Tùy chọn)</label>
                <div className={styles.inputWrap}>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Gợi ý phòng khi quên mật khẩu..."
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                  />
                </div>
              </div>
            </>
          ) : (
            existingHint && (
              <div className={styles.hintRow}>
                <button
                  type="button"
                  className={styles.hintBtn}
                  onClick={() => setShowHintText(!showHintText)}
                >
                  {showHintText ? 'Ẩn gợi ý mật khẩu' : '💡 Xem gợi ý mật khẩu'}
                </button>
              </div>
            )
          )}

          {showHintText && existingHint && (
            <div className={styles.hintText}>
              💡 <strong>Gợi ý:</strong> {existingHint}
            </div>
          )}

          {error && (
            <div className={styles.errorMsg}>
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div className={styles.actions}>
            <button type="submit" className={styles.submitBtn}>
              {isSetupMode ? '✨ Tạo Mật Khẩu & Xác Nhận' : mode === 'change' ? '💾 Lưu Mật Khẩu Mới' : '🔓 Mở Khóa Mật Thất'}
            </button>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Hủy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
