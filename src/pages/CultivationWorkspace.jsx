import React, { useState } from 'react';
import { useCultivationContext } from '../context/CultivationContext';
import RealmTimeline from '../components/cultivation/RealmTimeline';
import SidePanelInfo from '../components/cultivation/SidePanelInfo';
import RealmPreviewVisualizer from '../components/cultivation/RealmPreviewVisualizer';
import { getRealmDisplayName } from '../lib/cultivation';
import { useNavigate } from 'react-router-dom';

export default function CultivationWorkspace() {
  const { 
    isFocusMode, 
    toggleFocusMode, 
    cultivation, 
    gainReadingExp,
    activeRealmView,
    thangCung
  } = useCultivationContext();

  const navigate = useNavigate();
  const [mobileTab, setMobileTab] = useState('visualizer'); // 'visualizer' | 'actions' | 'realm'

  const currentRealm = cultivation?.realm || 'truc_co';
  const activeView = activeRealmView || currentRealm;

  return (
    <div className={`cultivation-workspace ${isFocusMode ? 'focus-mode' : ''} mobile-tab-${mobileTab}`}>
      
      {/* Mobile Top Navigation Tabs (visible only on screens <= 1024px) */}
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
          onClick={() => navigate('/')}
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
          title="Quay lại Thư Viện"
        >
          <span style={{ fontSize: 16, color: 'var(--accent-cyan)' }}>←</span>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 13.5, fontWeight: 700, letterSpacing: 1, color: 'var(--text-main)' }}>
            QUAY LẠI THƯ VIỆN
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

      {/* 2. CENTER COLUMN: Celestial Array Visualizer */}
      <div className={`cultivation-col-center ${mobileTab === 'visualizer' ? 'mobile-show' : ''}`}>
        {/* Workspace Top Header */}
        <div className="cultivation-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Mobile quick back */}
            <span 
              className="mobile-back-icon"
              onClick={() => navigate('/')}
              style={{ cursor: 'pointer', fontSize: 18, color: 'var(--accent-cyan)' }}
              title="Quay lại Thư Viện"
            >
              ←
            </span>
            <h1 style={{ margin: 0, fontSize: 'clamp(13px, 3.8vw, 19px)' }}>
              <span>
                {activeView === 'ngung_khi' && '💭 KHÍ HẢI NGƯNG KHÍ'}
                {activeView === 'truc_co' && '🔥 TRÚC CƠ TINH ĐỒ'}
                {activeView === 'kim_dan' && '🏛️ THIÊN CUNG KIM ĐAN'}
                {(activeView === 'nguyen_anh' || activeView === 'gia_anh') && '👑 ĐẠO ANH THẦN THỂ'}
              </span>
            </h1>
          </div>

          {/* Top Right Header Elements */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => navigate('/sanctum')}
              className="cultivation-header-sanctum-btn"
              style={{
                padding: '4px 10px',
                borderRadius: 20,
                background: 'linear-gradient(135deg, rgba(255, 204, 0, 0.16) 0%, rgba(34, 195, 240, 0.12) 100%)',
                border: '1.5px solid var(--color-kim)',
                color: 'var(--color-kim)',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                boxShadow: '0 0 10px rgba(255, 204, 0, 0.2)',
                transition: 'all 0.2s ease'
              }}
              title="Mở Tàng Bảo Điện trưng bày toàn cảnh 72 Mệnh Đăng & 13 Thiên Cung"
            >
              <span>🏛️ TÀNG BẢO ĐIỆN</span>
            </button>

            <span style={{
              fontFamily: "'Noto Serif', serif",
              fontSize: 11,
              fontWeight: 800,
              color: 'var(--color-kim)',
              background: 'rgba(255, 204, 0, 0.1)',
              padding: '4px 8px',
              borderRadius: 20,
              border: '1px solid rgba(255, 204, 0, 0.3)',
              whiteSpace: 'nowrap'
            }}>
              🪐 {getRealmDisplayName({ ...cultivation, realm: activeView || currentRealm })}
            </span>
          </div>
        </div>

        {/* Dynamic Canvas Container */}
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

          {/* Floating Mobile Quick Switcher Bar */}
          <div className="mobile-floating-switch">
            <button
              onClick={() => setMobileTab('actions')}
              className="mobile-floating-btn"
            >
              <span>⚡ Mở Bảng Nạp Linh & Khảm Bảo Vật ➔</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. RIGHT COLUMN: Inspector & Actions Panel */}
      <div className={`cultivation-col-right ${mobileTab === 'actions' ? 'mobile-show' : ''}`}>
        <SidePanelInfo />
      </div>

    </div>
  );
}
