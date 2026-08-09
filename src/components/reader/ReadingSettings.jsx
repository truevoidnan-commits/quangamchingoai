import BottomSheet from '../ui/BottomSheet';
import { READING_THEMES, FONT_OPTIONS } from '../../hooks/useReadingSettings';
import styles from './ReadingSettings.module.css';

/**
 * ReadingSettings — bottom-sheet điều chỉnh font/màu/cỡ chữ
 */
export default function ReadingSettings({ isOpen, onClose, settings, onUpdate }) {
  const currentTheme = READING_THEMES[settings.theme] || READING_THEMES.dark;

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
          <label className={styles.label}>Cỡ chữ — <strong>{settings.fontSize}px</strong></label>
          <div className={styles.sliderRow}>
            <span className={styles.sliderMin}>A</span>
            <input
              type="range"
              min={13}
              max={26}
              step={1}
              value={settings.fontSize}
              onChange={e => onUpdate({ fontSize: Number(e.target.value) })}
              className={styles.slider}
              aria-label="Cỡ chữ"
            />
            <span className={styles.sliderMax}>A</span>
          </div>
        </div>

        {/* Line height */}
        <div className={styles.section}>
          <label className={styles.label}>Giãn dòng — <strong>{settings.lineHeight}</strong></label>
          <div className={styles.sliderRow}>
            <span>≡</span>
            <input
              type="range"
              min={1.4}
              max={2.4}
              step={0.1}
              value={settings.lineHeight}
              onChange={e => onUpdate({ lineHeight: Number(e.target.value) })}
              className={styles.slider}
              aria-label="Giãn dòng"
            />
            <span>≡</span>
          </div>
        </div>

        {/* Font family */}
        <div className={styles.section}>
          <label className={styles.label}>Font chữ</label>
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
          <label className={styles.label}>Màu nền</label>
          <div className={styles.themeRow}>
            {Object.values(READING_THEMES).map(theme => (
              <button
                key={theme.id}
                className={`${styles.themeBtn} ${settings.theme === theme.id ? styles.themeActive : ''}`}
                style={{ backgroundColor: theme.bg, color: theme.text, borderColor: settings.theme === theme.id ? theme.accent : 'transparent' }}
                onClick={() => onUpdate({ theme: theme.id })}
                title={theme.label}
                aria-label={`Màu nền ${theme.label}`}
              >
                {theme.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
