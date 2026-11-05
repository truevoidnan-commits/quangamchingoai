import BottomSheet from '../ui/BottomSheet';
import { READING_THEMES, FONT_OPTIONS } from '../../hooks/useReadingSettings';
import styles from './ReadingSettings.module.css';

function IconCheck({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * ReadingSettings — bottom-sheet điều chỉnh font/màu/cỡ chữ
 */
export default function ReadingSettings({ isOpen, onClose, settings, onUpdate }) {
  const currentTheme = READING_THEMES[settings.theme] || READING_THEMES.dark;

  const fontPercent = Math.min(100, Math.max(0, ((settings.fontSize - 13) / (26 - 13)) * 100));
  const linePercent = Math.min(100, Math.max(0, ((settings.lineHeight - 1.4) / (2.4 - 1.4)) * 100));

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Tuỳ chỉnh đọc sách">
      <div className={styles.inner}>
        {/* Preview */}
        <div
          className={styles.preview}
          style={{
            backgroundColor: currentTheme.bg,
            color: currentTheme.text,
            fontSize: `${settings.fontSize}px`,
            fontFamily: FONT_OPTIONS.find(f => f.id === settings.fontFamily)?.css,
            lineHeight: settings.lineHeight,
          }}
        >
          Hàn Lập nhìn lên bầu trời cao xanh, trong lòng không khỏi bồi hồi...
        </div>

        {/* Font size */}
        <div className={styles.section}>
          <div className={styles.labelRow}>
            <span className={styles.label}>Cỡ chữ</span>
            <strong className={styles.labelValue}>{settings.fontSize}px</strong>
          </div>
          <div className={styles.sliderRow}>
            <span className={styles.sliderMin} aria-hidden="true">A</span>
            <input
              type="range"
              min={13}
              max={26}
              step={1}
              value={settings.fontSize}
              onChange={e => onUpdate({ fontSize: Number(e.target.value) })}
              className={styles.slider}
              style={{ '--progress': `${fontPercent}%` }}
              aria-label="Cỡ chữ"
            />
            <span className={styles.sliderMax} aria-hidden="true">A</span>
          </div>
        </div>

        {/* Line height */}
        <div className={styles.section}>
          <div className={styles.labelRow}>
            <span className={styles.label}>Giãn dòng</span>
            <strong className={styles.labelValue}>{settings.lineHeight}</strong>
          </div>
          <div className={styles.sliderRow}>
            <span className={styles.lineIconMin} aria-hidden="true">≡</span>
            <input
              type="range"
              min={1.4}
              max={2.4}
              step={0.1}
              value={settings.lineHeight}
              onChange={e => onUpdate({ lineHeight: Number(e.target.value) })}
              className={styles.slider}
              style={{ '--progress': `${linePercent}%` }}
              aria-label="Giãn dòng"
            />
            <span className={styles.lineIconMax} aria-hidden="true">≡</span>
          </div>
        </div>

        {/* Font family */}
        <div className={styles.section}>
          <span className={styles.label}>Font chữ</span>
          <div className={styles.fontRow}>
            {FONT_OPTIONS.map(font => (
              <button
                key={font.id}
                className={`${styles.fontBtn} ${settings.fontFamily === font.id ? styles.fontActive : ''}`}
                style={{ fontFamily: font.css }}
                onClick={() => onUpdate({ fontFamily: font.id })}
              >
                {font.label}
              </button>
            ))}
          </div>
        </div>

        {/* Color themes */}
        <div className={styles.section}>
          <span className={styles.label}>Màu nền</span>
          <div className={styles.themeRow}>
            {Object.values(READING_THEMES).map(theme => {
              const isSelected = settings.theme === theme.id;
              return (
                <button
                  key={theme.id}
                  className={`${styles.themeBtn} ${isSelected ? styles.themeActive : ''}`}
                  onClick={() => onUpdate({ theme: theme.id })}
                  title={theme.label}
                  aria-label={`Màu nền ${theme.label}`}
                >
                  <span
                    className={styles.themeDot}
                    style={{ backgroundColor: theme.bg, borderColor: `${theme.text}50` }}
                    aria-hidden="true"
                  />
                  <span className={styles.themeLabel} style={{ color: isSelected ? '#ffcc00' : theme.text }}>
                    {theme.label}
                  </span>
                  {isSelected && (
                    <span className={styles.themeCheckmark} aria-hidden="true">
                      <IconCheck size={12} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
