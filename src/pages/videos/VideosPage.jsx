import React, { useState, useEffect, useCallback } from 'react';
import LobbyTabs from '../../components/ui/LobbyTabs';
import VideoCard from '../../components/videos/VideoCard';
import VideosBackdrop from '../../components/videos/VideosBackdrop';
import VideoAdminModal from '../../components/videos/VideoAdminModal';
import {
  IconFilm,
  IconSearch,
  IconPlus,
  IconSettings,
  IconAlertTriangle,
  IconSparkles,
} from '../../components/videos/VideoIcons';
import { fetchVideoSeriesList, checkIsVideoAdmin } from '../../lib/video/videoApi';
import { fetchStorageStats } from '../../lib/video/videoCloud';
import styles from './VideosPage.module.css';

export default function VideosPage() {
  const [seriesList, setSeriesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [isAdmin, setIsAdmin] = useState(false);
  const [storageStats, setStorageStats] = useState(null);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  // Check admin status
  useEffect(() => {
    checkIsVideoAdmin().then(setIsAdmin);
  }, []);

  // Fetch series list
  const loadSeries = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchVideoSeriesList({
        search,
        status: selectedStatus === 'all' ? '' : selectedStatus,
        includeUnpublished: isAdmin,
      });
      setSeriesList(data);
    } catch (err) {
      console.error('[VideosPage] Error loading video series:', err);
    } finally {
      setLoading(false);
    }
  }, [search, selectedStatus, isAdmin]);

  useEffect(() => {
    loadSeries();
  }, [loadSeries]);

  // Load R2 storage stats for admin warning
  useEffect(() => {
    if (isAdmin) {
      fetchStorageStats().then(setStorageStats);
    }
  }, [isAdmin]);

  return (
    <div className={styles.page}>
      <VideosBackdrop />
      <div className={styles.container}>
        {/* Navigation Tabs */}
        <LobbyTabs active="videos" />

        {/* Hero Header */}
        <div className={styles.heroHeader}>
          <h1 className={styles.heroTitle}>
            <IconFilm size={32} />
            Thần Thông Ảnh Họa
          </h1>
          <p className={styles.heroSubtitle}>
            Thưởng lãm các kiệt tác truyện video tu tiên huyền huyễn với chất lượng hình ảnh sắc nét và âm thanh chân thực.
          </p>
        </div>

        {/* Admin Bar (Visible to verified admins) */}
        {isAdmin && (
          <div className={styles.adminBar}>
            <div className={styles.adminInfo}>
              <IconSettings size={16} />
              <span>Chế độ Quản Trị Viên Video</span>
            </div>
            <button className={styles.adminBtn} onClick={() => setIsAdminModalOpen(true)}>
              <IconPlus size={16} /> Thêm phim mới
            </button>
          </div>
        )}

        {/* Storage 8GB Warning Banner (for admins) */}
        {isAdmin && storageStats?.isOverThreshold && (
          <div className={styles.storageWarningBanner}>
            <IconAlertTriangle size={20} style={{ color: '#f59e0b', flexShrink: 0 }} />
            <div>
              <strong>Cảnh báo chi phí Cloudflare R2:</strong> Tổng dữ liệu lưu trữ đã đạt hoặc vượt ngưỡng 8 GB.
              Vui lòng kiểm soát dung lượng tải lên để không vượt hạn mức miễn phí 10 GB.
            </div>
          </div>
        )}

        {/* Search Filter Section */}
        <div className={styles.filterSection}>
          <div className={styles.searchRow}>
            <div className={styles.searchBox}>
              <IconSearch size={16} className={styles.searchIcon} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Tìm kiếm bộ phim..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Series List Grid */}
        {loading ? (
          <div className={styles.loadingState}>
            <IconSparkles size={24} />
            <span>Đang tải danh sách phim...</span>
          </div>
        ) : seriesList.length === 0 ? (
          <div className={styles.emptyState}>
            <IconFilm size={56} className={styles.emptyIcon} />
            <h3 className={styles.emptyTitle}>Chưa có truyện video nào</h3>
            <p className={styles.emptySubtitle}>
              Hiện chưa có bộ phim nào được xuất bản trong phân hệ này. Các kiệt tác hình ảnh sẽ sớm được chư vị trưởng lão cập nhật!
            </p>
            {isAdmin && (
              <button className={styles.adminBtn} onClick={() => setIsAdminModalOpen(true)} style={{ marginTop: 12 }}>
                <IconPlus size={16} /> Thêm bộ phim đầu tiên
              </button>
            )}
          </div>
        ) : (
          <div className={styles.grid}>
            {seriesList.map((series) => (
              <VideoCard key={series.id} series={series} />
            ))}
          </div>
        )}

        {/* Admin Modal */}
        <VideoAdminModal
          isOpen={isAdminModalOpen}
          onClose={() => setIsAdminModalOpen(false)}
          onSuccess={() => {
            loadSeries();
            setIsAdminModalOpen(false);
          }}
        />
      </div>
    </div>
  );
}
