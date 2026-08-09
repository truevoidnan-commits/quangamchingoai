import styles from './Footer.module.css';

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.divider} />
      <p className={styles.credit}>Thiết kế bởi <span className={styles.name}>Minh Đỗ</span></p>
    </footer>
  );
}
