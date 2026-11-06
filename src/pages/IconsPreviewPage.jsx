import React, { useState, useMemo } from 'react';
import Icon, { ICON_REGISTRY } from '../components/ui/Icon';
import styles from './IconsPreviewPage.module.css';

export default function IconsPreviewPage() {
  const [theme, setTheme] = useState('darkNavy'); // 'darkNavy' | 'darkPurple' | 'light'
  const [search, setSearch] = useState('');
  const [copiedName, setCopiedName] = useState(null);

  const handleCopy = (name) => {
    const textToCopy = `<Icon name="${name}" size={20} />`;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(textToCopy);
    }
    setCopiedName(name);
    setTimeout(() => setCopiedName(null), 2000);
  };

  const { lucideIcons, giIcons, customIcons } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const l = [];
    const g = [];
    const c = [];

    // Deduplicate unique canonical entries
    const seen = new Set();

    Object.entries(ICON_REGISTRY).forEach(([name, entry]) => {
      if (q && !name.toLowerCase().includes(q)) return;
      if (seen.has(name)) return;
      seen.add(name);

      const item = { name, type: entry.type };
      if (entry.type === 'lucide') l.push(item);
      else if (entry.type === 'gi') g.push(item);
      else c.push(item);
    });

    return {
      lucideIcons: l.sort((a, b) => a.name.localeCompare(b.name)),
      giIcons: g.sort((a, b) => a.name.localeCompare(b.name)),
      customIcons: c.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [search]);

  const themeClass =
    theme === 'darkNavy'
      ? styles.themeDarkNavy
      : theme === 'darkPurple'
      ? styles.themeDarkPurple
      : styles.themeLight;

  return (
    <div className={`${styles.page} ${themeClass}`}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>
              <Icon name="brand-star" size={26} />
              <span>Kho Biểu Tượng Thiên Cơ Lâu</span>
            </h1>

            <div className={styles.themeSwitchRow}>
              <button
                type="button"
                className={`${styles.themeBtn} ${theme === 'darkNavy' ? styles.themeBtnActive : ''}`}
                onClick={() => setTheme('darkNavy')}
              >
                Mực Đêm (Navy)
              </button>
              <button
                type="button"
                className={`${styles.themeBtn} ${theme === 'darkPurple' ? styles.themeBtnActive : ''}`}
                onClick={() => setTheme('darkPurple')}
              >
                Họa Các (Tím)
              </button>
              <button
                type="button"
                className={`${styles.themeBtn} ${theme === 'light' ? styles.themeBtnActive : ''}`}
                onClick={() => setTheme('light')}
              >
                Nền Sáng
              </button>
            </div>
          </div>

          <div className={styles.searchRow}>
            <input
              type="search"
              placeholder="Tìm theo tên icon (vd: cloud, search, dragon...)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={styles.searchInput}
            />
            <span className={styles.statsText}>
              Hiển thị {lucideIcons.length + giIcons.length + customIcons.length} biểu tượng
            </span>
          </div>
        </div>

        {/* Section: Nhận diện Thương hiệu */}
        {customIcons.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <Icon name="brand-star" size={18} />
              <span>Biểu Tượng Thương Hiệu</span>
            </h2>
            <p className={styles.sectionDesc}>
              Ngôi sao 4 cánh hoàng kim đặc trưng của Thiên Cơ Lâu.
            </p>
            <div className={styles.grid}>
              {customIcons.map(({ name }) => (
                <div key={name} className={styles.card} onClick={() => handleCopy(name)}>
                  <div className={styles.iconWrap}>
                    <Icon name={name} size={24} />
                  </div>
                  <span className={styles.iconName}>{name}</span>
                  <span className={styles.badge}>Bespoke SVG</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Section: Lucide General UI */}
        {lucideIcons.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <Icon name="sparkles" size={18} />
              <span>Giao Diện & Đám Mây (Lucide React · ISC License)</span>
            </h2>
            <p className={styles.sectionDesc}>
              Biểu tượng nét mảnh 1.75px, sắc nét, đồng nhất toàn bộ nút bấm, điều hướng và đám mây.
            </p>
            <div className={styles.grid}>
              {lucideIcons.map(({ name }) => (
                <div key={name} className={styles.card} onClick={() => handleCopy(name)}>
                  <div className={styles.iconWrap}>
                    <Icon name={name} size={24} strokeWidth={1.75} />
                  </div>
                  <span className={styles.iconName}>{name}</span>
                  <span className={styles.badge}>Lucide</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Section: Tiên Hiệp & Tu Vi (Game Icons) */}
        {giIcons.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <Icon name="dragon" size={18} />
              <span>Tiên Hiệp & Tu Vi (Game-icons.net · CC BY 3.0)</span>
            </h2>
            <p className={styles.sectionDesc}>
              Biểu tượng dạng fill nghệ thuật cho linh thú, pháp bảo, âm dương và cảnh giới tu luyện.
            </p>
            <div className={styles.grid}>
              {giIcons.map(({ name }) => (
                <div key={name} className={styles.card} onClick={() => handleCopy(name)}>
                  <div className={styles.iconWrap}>
                    <Icon name={name} size={24} />
                  </div>
                  <span className={styles.iconName}>{name}</span>
                  <span className={styles.badge}>Game Icons</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {copiedName && (
          <div className={styles.toast}>
            ✓ Đã chép mã: &lt;Icon name="{copiedName}" size={20} /&gt;
          </div>
        )}
      </div>
    </div>
  );
}
