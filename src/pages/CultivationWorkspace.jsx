import React, { useState } from 'react';
import { useCultivationContext } from '../context/CultivationContext';
import RealmTimeline from '../components/cultivation/RealmTimeline';
import SidePanelInfo from '../components/cultivation/SidePanelInfo';
import RealmPreviewVisualizer from '../components/cultivation/RealmPreviewVisualizer';
import DaoAnhGalleryModal from '../components/cultivation/DaoAnhGalleryModal';
import TribulationModal from '../components/cultivation/TribulationModal';
import { getRealmDisplayName } from '../lib/cultivation';
import { findDaoAnhDefinition } from '../lib/daoAnhData';
import { useNavigate } from 'react-router-dom';

export default function CultivationWorkspace() {
  const { 
    isFocusMode, 
    toggleFocusMode, 
    cultivation, 
    gainReadingExp,
    activeRealmView,
    thangCung,
    galleryModalOpen,
    setGalleryModalOpen,
    chooseSwitchDaoAnhAfter80,
    chooseContinueDaoAnhTo100,
    dismissPromptAllDaoAnhFull,
    attemptTribulationAll
  } = useCultivationContext();

  const navigate = useNavigate();
  const [mobileTab, setMobileTab] = useState('visualizer'); // 'visualizer' | 'actions' | 'realm'
  const [tribulationModalData, setTribulationModalData] = useState(null);

  const handleGoToTribulation = () => {
    if (dismissPromptAllDaoAnhFull) dismissPromptAllDaoAnhFull();
    setMobileTab('actions');
  };

  const handleSmartBack = () => {
    const lastReadingUrl = sessionStorage.getItem('last_reading_url');
    const fromReader = sessionStorage.getItem('from_reader');
    if (fromReader && lastReadingUrl) {
      sessionStorage.removeItem('from_reader');
      navigate(lastReadingUrl, { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  };

  const currentRealm = cultivation?.realm || 'truc_co';
  const activeView = activeRealmView || currentRealm;

  return (
    <div className={`cultivation-workspace ${isFocusMode ? 'focus-mode' : ''} mobile-tab-${mobileTab}`}>
      
      {/* Mobile Top Navigation Tabs */}
      <div className="cultivation-mobile-tabs">
        <button
          className={`mobile-tab-btn ${mobileTab === 'visualizer' ? 'active' : ''}`}
          onClick={() => setMobileTab('visualizer')}
        >
          <span>🪐 TRẬN ĐỒ</span>
        </button>
        <button
          className={`mobile-tab-btn ${mobileTab === 'actions' ? 'active' : ''}`}
          onClick={() => setMobileTab('actions')}
        >
          <span>⚡ THAO TÁC / CUNG</span>
        </button>
        <button
          className={`mobile-tab-btn ${mobileTab === 'realm' ? 'active' : ''}`}
          onClick={() => setMobileTab('realm')}
        >
          <span>📜 CẢNH GIỚI</span>
        </button>
      </div>

      {/* 1. LEFT COLUMN: Realm Timeline & Navigation */}
      <div className={`cultivation-col-left ${mobileTab === 'realm' ? 'mobile-show' : ''}`}>
        {/* Navigation Back to Library */}
        <div 
          onClick={handleSmartBack}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 10, 
            marginBottom: 16, 
            cursor: 'pointer',
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(34, 195, 240, 0.08)',
            border: '1px solid var(--cult-border)',
            transition: 'all 0.2s ease'
          }}
          title="Quay lại"
        >
          <span style={{ fontSize: 16, color: 'var(--accent-cyan)' }}>←</span>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 13.5, fontWeight: 700, letterSpacing: 1, color: 'var(--text-main)' }}>
            QUAY LẠI
          </span>
        </div>

        <div style={{ fontSize: 11, letterSpacing: 1.5, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>
          CẢNH GIỚI TU LUYỆN
        </div>
        
        {/* Realm Timeline Switcher */}
        <RealmTimeline />

        {/* Dedicated Tàng Bảo Điện Button */}
        <button
          onClick={() => navigate('/sanctum')}
          style={{
            marginTop: 14,
            padding: '9px 12px',
            borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(255, 204, 0, 0.16) 0%, rgba(34, 195, 240, 0.12) 100%)',
            border: '1.5px solid var(--color-kim)',
            color: 'var(--color-kim)',
            fontSize: 11.5,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            width: '100%',
            boxShadow: '0 0 10px rgba(255, 204, 0, 0.2)'
          }}
          title="Mở Tàng Bảo Điện (Mệnh Đăng, Bảo Vật Trấn Áp & Túi Đồ)"
        >
          <span>🏛️ TÀNG BẢO ĐIỆN</span>
        </button>

        {/* Quick Tu Linh Tran */}
        <button
          onClick={() => gainReadingExp(500)}
          style={{
            marginTop: 8,
            padding: '8px 12px',
            borderRadius: 8,
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px dashed rgba(255, 204, 0, 0.4)',
            color: 'var(--color-kim)',
            fontSize: 11.5,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            width: '100%'
          }}
          title="Kích hoạt Tụ Linh Trận bổ sung nhanh linh khí"
        >
          <span>⚡ Tụ Linh Trận (+500 EXP)</span>
        </button>
      </div>

      {/* 2. CENTER COLUMN: Celestial Array Visualizer (100% Tối Giản & Tràn Viền Tuyệt Đối) */}
      <div className={`cultivation-col-center ${mobileTab === 'visualizer' ? 'mobile-show' : ''}`}>
        {/* Nút Quay Lại Thư Viện Nổi Siêu Nhỏ Gọn (Chỉ có icon mũi tên) */}
        <button
          className="floating-back-library-btn"
          onClick={handleSmartBack}
          title="Quay lại Thư Viện"
        >
          <span className="floating-back-arrow">←</span>
        </button>

        {/* Dynamic Canvas Container (100% Chiều Cao Sạch Sẽ) */}
        <div 
          className="cultivation-canvas-container" 
          style={{ 
            flex: 1, 
            width: '100%', 
            height: '100%',
            position: 'relative', 
            display: 'flex', 
            flexDirection: 'column', 
            padding: 0,
            margin: 0,
            overflow: 'hidden'
          }}
        >
          <RealmPreviewVisualizer
            cultivation={{ ...cultivation, realm: activeView }}
          />
        </div>
      </div>

      {/* 3. RIGHT COLUMN: Inspector & Actions Panel */}
      <div className={`cultivation-col-right ${mobileTab === 'actions' ? 'mobile-show' : ''}`}>
        <SidePanelInfo setTribulationModalData={setTribulationModalData} />
      </div>

      {/* Đạo Anh Đồ Lục Modal */}
      <DaoAnhGalleryModal
        isOpen={galleryModalOpen}
        onClose={() => setGalleryModalOpen && setGalleryModalOpen(false)}
      />

      {/* MODAL THÔNG BÁO TIÊN KIẾP: ĐẠO ANH ĐẠT 80% LINH LỰC */}
      {cultivation?.prompt80DaoAnh && (() => {
        const promptTargetDa = (cultivation?.daoAnhs || []).find(d => d.id === cultivation.prompt80DaoAnh?.daoAnhId);
        const resolvedDaoAnhName = findDaoAnhDefinition(promptTargetDa, cultivation)?.name || promptTargetDa?.name || cultivation.prompt80DaoAnh.daoAnhName;
        return (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(2, 6, 23, 0.85)',
            backdropFilter: 'blur(10px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20
          }}>
            <div style={{
              background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.95) 100%)',
              border: '1.5px solid #fde047',
              boxShadow: '0 0 40px rgba(253, 224, 71, 0.35), 0 20px 40px rgba(0, 0, 0, 0.8)',
              borderRadius: 20,
              maxWidth: 480,
              width: '100%',
              padding: '28px 24px',
              textAlign: 'center',
              color: '#f8fafc',
              animation: 'fadeIn 0.25s ease-out'
            }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>⚡</div>
              <h3 style={{
                fontSize: 18,
                fontWeight: 900,
                color: '#fde047',
                margin: '0 0 10px 0',
                letterSpacing: '0.5px'
              }}>
                ĐẠO ANH ĐÃ ĐẠT 80% LINH LỰC!
              </h3>
              <p style={{
                fontSize: 13.5,
                lineHeight: 1.6,
                color: '#cbd5e1',
                margin: '0 0 14px 0'
              }}>
                <strong style={{ color: '#38bdf8' }}>[{resolvedDaoAnhName}]</strong> đã tích lũy đủ <strong style={{ color: '#fde047' }}>80% Linh Lực</strong> ({cultivation.prompt80DaoAnh.currentExp?.toLocaleString()} / {cultivation.prompt80DaoAnh.maxExp?.toLocaleString()} Tu Vi), sẵn sàng nghênh tiếp Thiên Kiếp!
              </p>
            <p style={{
              fontSize: 12.5,
              color: '#94a3b8',
              margin: '0 0 24px 0',
              fontStyle: 'italic'
            }}>
              Đạo hữu có muốn chuyển quyền nạp sang Đạo Anh khác không, hay tiếp tục nạp đến 100% để đảm bảo độ kiếp viên mãn?
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => chooseSwitchDaoAnhAfter80 && chooseSwitchDaoAnhAfter80(cultivation.prompt80DaoAnh.daoAnhId)}
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
                  border: '1px solid #7dd3fc',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 0 16px rgba(56, 189, 248, 0.35)'
                }}
              >
                🔄 Chuyển Đạo Anh Khác
              </button>

              <button
                onClick={() => chooseContinueDaoAnhTo100 && chooseContinueDaoAnhTo100(cultivation.prompt80DaoAnh.daoAnhId)}
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
                  border: '1px solid #fde047',
                  color: '#0f172a',
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 0 16px rgba(253, 224, 71, 0.35)'
                }}
              >
                ⚡ Tiếp Tục Nạp Đến 100%
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* MODAL THÔNG BÁO TIÊN KIẾP: TOÀN BỘ ĐẠO ANH ĐÃ VIÊN MÃN 100% */}
      {cultivation?.promptAllDaoAnhFull && !cultivation?.promptAllDaoAnhFullDismissed && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(2, 6, 23, 0.85)',
          backdropFilter: 'blur(10px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20
        }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.95) 100%)',
            border: '1.5px solid #a855f7',
            boxShadow: '0 0 45px rgba(168, 85, 247, 0.4), 0 20px 40px rgba(0, 0, 0, 0.8)',
            borderRadius: 20,
            maxWidth: 500,
            width: '100%',
            padding: '28px 24px',
            textAlign: 'center',
            color: '#f8fafc',
            animation: 'fadeIn 0.25s ease-out'
          }}>
            <div style={{ fontSize: 38, marginBottom: 8 }}>⛈️</div>
            <h3 style={{
              fontSize: 18,
              fontWeight: 900,
              color: '#f0abfc',
              margin: '0 0 10px 0',
              letterSpacing: '0.5px'
            }}>
              TOÀN BỘ ĐẠO ANH ĐÃ VIÊN MÃN 100%!
            </h3>
            <p style={{
              fontSize: 13.5,
              lineHeight: 1.6,
              color: '#cbd5e1',
              margin: '0 0 12px 0'
            }}>
              Toàn bộ các Đạo Anh đều đã tích lũy đạt <strong style={{ color: '#fde047' }}>100% Linh Lực viên mãn</strong>, sẵn sàng cùng nhau tiến hành Vạn Kiếp Tề Thăng!
            </p>
            <p style={{
              fontSize: 12.5,
              color: '#94a3b8',
              margin: '0 0 24px 0',
              fontStyle: 'italic',
              lineHeight: 1.5
            }}>
              Nếu đạo hữu chưa muốn độ kiếp lúc này, Tu Vi nhận được từ việc đọc truyện và Tụ Linh Trận sẽ được chuyển dồn tích lũy vào <strong style={{ color: '#f59e0b' }}>Uẩn Tích Bình Cảnh</strong>.
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={handleGoToTribulation}
                style={{
                  flex: 1.2,
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
                  border: '1px solid #f0abfc',
                  color: '#ffffff',
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 0 18px rgba(240, 171, 252, 0.4)'
                }}
              >
                ⚡ Đến Độ Kiếp Đài
              </button>

              <button
                onClick={() => dismissPromptAllDaoAnhFull && dismissPromptAllDaoAnhFull()}
                style={{
                  flex: 0.8,
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#cbd5e1',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                ❌ Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL HOẠT ẢNH THIÊN LÔI ĐỘ KIẾP */}
      {tribulationModalData && (
        <TribulationModal
          activeData={tribulationModalData}
          onClose={() => setTribulationModalData(null)}
        />
      )}

    </div>
  );
}
