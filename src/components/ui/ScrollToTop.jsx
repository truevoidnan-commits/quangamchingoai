import { useEffect, useState } from 'react';
import styles from './ScrollToTop.module.css';

export default function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      
      // Chỉ hiện nút khi đã cuộn đến sát cuối cùng trang (trong vòng 380px tính từ đáy trang)
      const isAtBottom = (scrollY + windowHeight) >= (documentHeight - 380) && documentHeight > windowHeight * 1.25;
      setVisible(isAtBottom);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
