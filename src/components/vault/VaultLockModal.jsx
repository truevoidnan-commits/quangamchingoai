import Icon from '../ui/Icon';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  hasVaultPassword,
  setVaultPassword,
  verifyVaultPassword,
  changeVaultPassword,
  getVaultHint
} from '../../lib/storage';
import styles from './VaultLockModal.module.css';

/**
 * Calculate password strength (0: none, 1: weak, 2: medium, 3: strong)
 */
function getPasswordStrength(pwd) {
  if (!pwd) return 0;
  if (pwd.length < 3) return 1;
  let score = 1;
  if (pwd.length >= 6) score++;
  if (/[0-9]/.test(pwd) && /[a-zA-Z]/.test(pwd)) score++;
  if (/[^a-zA-Z0-9]/.test(pwd) || pwd.length >= 10) score++;
  return Math.min(3, score);
}

/**
 * VaultLockModal
 * Frosted glass aesthetic matching Tàng Kinh purple + soft gold.
 * Supports: 'unlock' | 'set' | 'first_hide' | 'change'
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
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [showHintText, setShowHintText] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const modalRef = useRef(null);
  const inputRef = useRef(null);
  const existingHint = getVaultHint();

  const isSetupMode = mode === 'set' || mode === 'first_hide';
  const pwdStrength = getPasswordStrength(password);

  // Initialize and focus
  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setConfirmPassword('');
      setOldPassword('');
      setHint('');
      setError('');
      setShake(false);
      setShowHintText(false);
      setIsSuccess(false);
      setShowPassword(false);
      setShowOldPassword(false);
      setShowConfirmPassword(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, mode]);

  // Focus trap and Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const triggerError = (msg) => {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (isSuccess) return;
    setError('');

    if (mode === 'unlock') {
      if (!password.trim()) {
        triggerError('Vui lòng nhập mật khẩu Mật Thất');
        return;
      }
      if (verifyVaultPassword(password.trim())) {
        setIsSuccess(true);
        setTimeout(() => {
          onSuccess?.(password.trim());
        }, 380);
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
      setIsSuccess(true);
      setTimeout(() => {
        onSuccess?.(password.trim());
      }, 350);
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
        setIsSuccess(true);
        setTimeout(() => {
          onSuccess?.(password.trim());
        }, 350);
      } else {
        triggerError(res.message);
      }
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        ref={modalRef}
        className={`${styles.modal} ${shake ? styles.shake : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vault-modal-title"
      >
        {/* Mobile drag handle */}
        <div className={styles.dragHandle} aria-hidden="true" />

        {/* Ambient backlight glow */}
        <div className={styles.ambientGlow} aria-hidden="true" />

        {/* Close Button */}
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          title="Đóng hộp thoại"
          aria-label="Đóng hộp thoại"
        >
          <Icon name="close" size={18} />
        </button>

        {/* Header with animated rotating conic border */}
        <div className={styles.header}>
          <div className={styles.iconCircleWrap}>
            <div
              className={`${styles.iconCircleRing} ${isSuccess ? styles.iconCircleRingSuccess : ''}`}
              aria-hidden="true"
            />
            <div
              className={`${styles.iconCircle} ${isSuccess ? styles.iconCircleSuccess : ''}`}
              aria-hidden="true"
            >
              <Icon
                name={
                  isSuccess
                    ? 'unlock'
                    : isSetupMode
                    ? 'key'
                    : mode === 'change'
                    ? 'settings'
                    : 'lock'
                }
                size={30}
              />
            </div>
          </div>

          <h3 id="vault-modal-title" className={styles.title}>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          {/* Old Password (only in change mode) */}
          {mode === 'change' && (
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="vault-old-password">
                Mật khẩu hiện tại
              </label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon} aria-hidden="true">
                  <Icon name="lock" size={18} />
                </span>
                <input
                  id="vault-old-password"
                  ref={inputRef}
                  type={showOldPassword ? 'text' : 'password'}
                  className={styles.input}
                  placeholder="Nhập mật khẩu cũ..."
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowOldPassword(!showOldPassword)}
                  title={showOldPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  aria-label={showOldPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  <Icon name={showOldPassword ? 'eye-off' : 'eye'} size={18} />
                </button>
              </div>
            </div>
          )}

          {/* Main Password Input */}
          <div className={styles.inputGroup}>
            <label className={styles.label} htmlFor="vault-main-password">
              {mode === 'change'
                ? 'Mật khẩu mới'
                : isSetupMode
                ? 'Mật khẩu mới'
                : 'Mật khẩu Mật Thất'}
            </label>
            <div className={styles.inputWrap}>
              <span className={styles.inputIcon} aria-hidden="true">
                <Icon name={isSetupMode ? 'key' : 'lock'} size={18} />
              </span>
              <input
                id="vault-main-password"
                ref={mode !== 'change' ? inputRef : null}
                type={showPassword ? 'text' : 'password'}
                className={styles.input}
                placeholder={isSetupMode ? 'Nhập mật khẩu (PIN hoặc chữ)...' : 'Nhập mật khẩu...'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'unlock' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                className={styles.eyeBtn}
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} />
              </button>
            </div>

            {/* Password strength bar for setup or change mode */}
            {(isSetupMode || mode === 'change') && password.length > 0 && (
              <div className={styles.strengthMeter}>
                <div className={styles.strengthBars}>
                  <div
                    className={`${styles.strengthBar} ${
                      pwdStrength >= 1
                        ? pwdStrength === 1
                          ? styles.strengthWeak
                          : pwdStrength === 2
                          ? styles.strengthMedium
                          : styles.strengthStrong
                        : ''
                    }`}
                  />
                  <div
                    className={`${styles.strengthBar} ${
                      pwdStrength >= 2
                        ? pwdStrength === 2
                          ? styles.strengthMedium
                          : styles.strengthStrong
                        : ''
                    }`}
                  />
                  <div
                    className={`${styles.strengthBar} ${
                      pwdStrength >= 3 ? styles.strengthStrong : ''
                    }`}
                  />
                </div>
                <span className={styles.strengthLabel}>
                  {pwdStrength === 1
                    ? 'Độ mạnh: Yếu'
                    : pwdStrength === 2
                    ? 'Độ mạnh: Tương đối'
                    : 'Độ mạnh: Rất tốt'}
                </span>
              </div>
            )}
          </div>

          {/* Confirm Password & Hint (in setup or change mode) */}
          {isSetupMode || mode === 'change' ? (
            <>
              <div className={styles.inputGroup}>
                <label className={styles.label} htmlFor="vault-confirm-password">
                  Xác nhận mật khẩu
                </label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon} aria-hidden="true">
                    <Icon name="check" size={18} />
                  </span>
                  <input
                    id="vault-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    className={styles.input}
                    placeholder="Nhập lại mật khẩu..."
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    title={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    aria-label={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    <Icon name={showConfirmPassword ? 'eye-off' : 'eye'} size={18} />
                  </button>
                </div>

                {/* Match indicator */}
                {confirmPassword.length > 0 && (
                  <div
                    className={
                      password === confirmPassword ? styles.matchSuccess : styles.matchMismatch
                    }
                  >
                    <Icon
                      name={password === confirmPassword ? 'check' : 'alert'}
                      size={13}
                    />
                    <span>
                      {password === confirmPassword
                        ? 'Mật khẩu trùng khớp'
                        : 'Mật khẩu xác nhận chưa khớp'}
                    </span>
                  </div>
                )}
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.label} htmlFor="vault-hint">
                  Gợi ý mật khẩu (Tùy chọn)
                </label>
                <div className={styles.inputWrap}>
                  <span className={styles.inputIcon} aria-hidden="true">
                    <Icon name="lightbulb" size={18} />
                  </span>
                  <input
                    id="vault-hint"
                    type="text"
                    className={`${styles.input} ${styles.inputNoRightBtn}`}
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
                  <Icon name="lightbulb" size={14} />
                  <span>{showHintText ? 'Ẩn gợi ý mật khẩu' : 'Xem gợi ý mật khẩu'}</span>
                </button>
              </div>
            )
          )}

          {/* Hint Card */}
          {showHintText && existingHint && (
            <div className={styles.hintCard}>
              <Icon name="lightbulb" size={16} />
              <div>
                <strong>Gợi ý mật khẩu:</strong> {existingHint}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className={styles.errorMsg} role="alert">
              <Icon name="alert" size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className={styles.actions}>
            <button
              type="submit"
              className={`${styles.submitBtn} ${isSuccess ? styles.submitBtnSuccess : ''}`}
              disabled={isSuccess}
              id="btn-vault-submit"
            >
              {isSuccess ? (
                <>
                  <Icon name="check" size={18} />
                  <span>Thành Công</span>
                </>
              ) : (
                <>
                  <Icon
                    name={isSetupMode ? 'key' : mode === 'change' ? 'save' : 'lock'}
                    size={17}
                  />
                  <span>
                    {isSetupMode
                      ? 'Tạo Mật Khẩu & Xác Nhận'
                      : mode === 'change'
                      ? 'Lưu Mật Khẩu Mới'
                      : 'Mở Khóa Mật Thất'}
                  </span>
                </>
              )}
            </button>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={isSuccess}
            >
              Hủy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
