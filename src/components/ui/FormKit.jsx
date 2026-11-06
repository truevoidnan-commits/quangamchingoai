import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon, { GlyphIcon } from './Icon';
import TextBackdrop from '../layout/TextBackdrop';
import ComicsBackdrop from '../comics/ComicsBackdrop';
import styles from './FormKit.module.css';

/**
 * PageShell: Wraps the page in the appropriate atmospheric backdrop
 * with a responsive centered container and horizontal overflow protection.
 */
export function PageShell({
  backdrop = 'text', // 'text' | 'comics' | 'none'
  maxWidth = 880,
  children,
  className = '',
  containerClassName = '',
}) {
  return (
    <div className={`${styles.pageShell} ${className}`}>
      {backdrop === 'comics' && <ComicsBackdrop />}
      {backdrop === 'text' && <TextBackdrop />}
      <div
        className={`${styles.pageContainer} ${containerClassName}`}
        style={{ maxWidth }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * PageHeader: Frosted glass sticky header with pill back button,
 * serif title, subtitle, and action slots.
 */
export function PageHeader({
  onBack,
  backLabel = 'Quay lại',
  title,
  subtitle,
  actions,
  className = '',
}) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  return (
    <header className={`${styles.pageHeaderSticky} ${className}`}>
      <div className={styles.headerInner}>
        <div className={styles.headerLeft}>
          <button
            type="button"
            className={styles.backBtn}
            onClick={handleBack}
            aria-label={backLabel}
          >
            <Icon name="arrow-left" size={14} />
            <span>{backLabel}</span>
          </button>
          {(title || subtitle) && (
            <div className={styles.headerTitles}>
              {title && <h1 className={styles.pageTitle}>{title}</h1>}
              {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
            </div>
          )}
        </div>
        {actions && <div className={styles.headerActions}>{actions}</div>}
      </div>
    </header>
  );
}

/**
 * Card: Multi-layer frosted glass card with 20px radius and gold border.
 */
export function Card({
  icon,
  title,
  subtitle,
  actions,
  children,
  className = '',
  headerClassName = '',
  bodyClassName = '',
  style = {},
}) {
  const hasHeader = icon || title || subtitle || actions;

  return (
    <section className={`${styles.card} ${className}`} style={style}>
      {hasHeader && (
        <div className={`${styles.cardHeader} ${headerClassName}`}>
          <div className={styles.cardTitleWrap}>
            {icon && (
              <div className={styles.cardIconCircle}>
                <GlyphIcon value={icon} size={16} />
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              {title && <h2 className={styles.cardTitle}>{title}</h2>}
              {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}
            </div>
          </div>
          {actions && <div className={styles.cardActions}>{actions}</div>}
        </div>
      )}
      <div className={`${styles.cardBody} ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/**
 * Field: Form group containing label, input slot, hint and error message.
 */
export function Field({
  label,
  optional = false,
  hint,
  error,
  children,
  className = '',
  id,
}) {
  return (
    <div className={`${styles.field} ${className}`}>
      {label && (
        <div className={styles.labelRow}>
          <label htmlFor={id} className={styles.label}>
            {label}
          </label>
          {optional && <span className={styles.labelOptional}>(Không bắt buộc)</span>}
        </div>
      )}
      {children}
      {hint && !error && <span className={styles.hint}>{hint}</span>}
      {error && (
        <div className={styles.errorAlert} role="alert">
          <Icon name="alert-triangle" size={14} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

/**
 * TextInput: 48px height, 14px radius dark glass input.
 */
export function TextInput({
  prefixIcon,
  suffixIcon,
  className = '',
  id,
  ...props
}) {
  return (
    <div className={styles.inputWrap}>
      {prefixIcon && (
        <span className={styles.inputPrefix}>
          <GlyphIcon value={prefixIcon} size={16} />
        </span>
      )}
      <input
        id={id}
        className={`${styles.textInput} ${prefixIcon ? styles.textInputWithPrefix : ''} ${suffixIcon ? styles.textInputWithSuffix : ''} ${className}`}
        {...props}
      />
      {suffixIcon && (
        <span className={styles.inputSuffix}>
          <GlyphIcon value={suffixIcon} size={16} />
        </span>
      )}
    </div>
  );
}

/**
 * TextArea: Frosted dark glass textarea with char counter.
 */
export function TextArea({
  charCount,
  maxLength,
  value,
  className = '',
  id,
  ...props
}) {
  const currentLength = charCount !== undefined ? charCount : (value?.length || 0);

  return (
    <div className={styles.textAreaWrap}>
      <textarea
        id={id}
        value={value}
        maxLength={maxLength}
        className={`${styles.textArea} ${className}`}
        {...props}
      />
      {(maxLength || charCount !== undefined) && (
        <span className={styles.charCounter}>
          {currentLength}{maxLength ? `/${maxLength}` : ''}
        </span>
      )}
    </div>
  );
}

/**
 * SegmentedControl: Pill switcher for modes/tabs.
 */
export function SegmentedControl({
  options = [], // [{ value: 'file', label: 'Tải file lên', icon: 'upload' }, ...]
  value,
  onChange,
  className = '',
}) {
  return (
    <div className={`${styles.segmentedControl} ${className}`} role="tablist">
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isSelected}
            className={`${styles.segmentBtn} ${isSelected ? styles.segmentBtnActive : ''}`}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon && <GlyphIcon value={opt.icon} size={14} />}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Dropzone: Dashed gold border drop area with Lucide icon.
 */
export function Dropzone({
  icon = 'upload',
  title = 'Kéo thả file vào đây hoặc bấm để chọn',
  hint = 'Hỗ trợ định dạng hình ảnh JPG, PNG, WEBP',
  onSelectFile,
  accept,
  children,
  className = '',
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleClick = () => {
    if (inputRef.current) inputRef.current.click();
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (onSelectFile) onSelectFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      if (onSelectFile) onSelectFile(e.target.files[0]);
    }
  };

  return (
    <div
      className={`${styles.dropzone} ${isDragOver ? styles.dropzoneDragover : ''} ${className}`}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={handleChange}
      />
      {children || (
        <>
          <div className={styles.dropzoneIconWrap}>
            <GlyphIcon value={icon} size={24} />
          </div>
          <div>
            <div className={styles.dropzoneTitle}>{title}</div>
            {hint && <div className={styles.dropzoneHint}>{hint}</div>}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * FileButton: Pill file chooser button showing chosen file info.
 */
export function FileButton({
  icon = 'file',
  label = 'Chọn file',
  filename,
  sizeStr,
  onSelect,
  onRemove,
  accept,
  id,
}) {
  const fileInputRef = useRef(null);

  const handleClick = () => {
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      if (onSelect) onSelect(e.target.files[0]);
    }
  };

  return (
    <div className={styles.fileButtonWrap}>
      <input
        ref={fileInputRef}
        id={id}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={handleChange}
      />
      <button
        type="button"
        className={styles.fileButton}
        onClick={handleClick}
      >
        <GlyphIcon value={icon} size={15} />
        <span>{label}</span>
      </button>

      {filename && (
        <div className={styles.fileChosenCard}>
          <GlyphIcon value="check" size={13} />
          <span>{filename}</span>
          {sizeStr && <span style={{ opacity: 0.75 }}>({sizeStr})</span>}
          {onRemove && (
            <button
              type="button"
              className={styles.fileRemoveBtn}
              onClick={(e) => {
                e.stopPropagation();
                if (fileInputRef.current) fileInputRef.current.value = '';
                onRemove();
              }}
              title="Xóa file"
              aria-label="Xóa file đã chọn"
            >
              <GlyphIcon value="close" size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Button: Standard pill button supporting primary, secondary, ghost, and danger variants.
 */
export function Button({
  variant = 'primary', // 'primary' | 'secondary' | 'ghost' | 'danger'
  size = 'medium', // 'small' | 'medium' | 'large'
  loading = false,
  disabled = false,
  icon,
  children,
  className = '',
  type = 'button',
  ...props
}) {
  let variantClass = styles.btnPrimary;
  if (variant === 'secondary') variantClass = styles.btnSecondary;
  else if (variant === 'ghost') variantClass = styles.btnGhost;
  else if (variant === 'danger') variantClass = styles.btnDanger;

  let sizeClass = '';
  if (size === 'small') sizeClass = styles.btnSmall;
  else if (size === 'large') sizeClass = styles.btnLarge;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`${styles.button} ${variantClass} ${sizeClass} ${className}`}
      {...props}
    >
      {loading ? (
        <span className={styles.spinner} aria-hidden="true" />
      ) : (
        icon && <GlyphIcon value={icon} size={size === 'small' ? 13 : 15} />
      )}
      <span>{children}</span>
    </button>
  );
}

/**
 * ActionBar: Sticky bottom frosted action bar for mobile and desktop.
 */
export function ActionBar({
  children,
  className = '',
  innerClassName = '',
}) {
  return (
    <div className={`${styles.actionBar} ${className}`}>
      <div className={`${styles.actionBarInner} ${innerClassName}`}>
        {children}
      </div>
    </div>
  );
}

export default {
  PageShell,
  PageHeader,
  Card,
  Field,
  TextInput,
  TextArea,
  SegmentedControl,
  Dropzone,
  FileButton,
  Button,
  ActionBar,
};
