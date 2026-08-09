import { useEffect, useState } from 'react';
import styles from './ScrollToTop.module.css';

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = document.querySelector('.reader-scroll-container') || window;
    const handleScroll = () => {
      const scrollTop = el === window ? window.scrollY : el.scrollTop;
      setVisible(scrollTop > 300);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const handleClick = () => {
    const el = document.querySelector('.reader-scroll-container');
    if (el) {
      el.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (!visible) return null;

  return (
    <button
      className={`${styles.fab} animate-float`}
      onClick={handleClick}
      aria-label="Cuộn lên đầu trang"
      title="Lên đầu trang"
    >
      ↑
    </button>
  );
}
