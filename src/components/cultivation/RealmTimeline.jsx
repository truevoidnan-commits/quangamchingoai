import React from 'react';
import { useCultivationContext } from '../../context/CultivationContext';

export default function RealmTimeline() {
  const { cultivation, activeRealmView, setActiveRealmView } = useCultivationContext();
  const currentRealm = cultivation?.realm || 'truc_co';
  const activeView = activeRealmView || currentRealm;
  const opened = cultivation?.phapKhieu !== undefined ? cultivation.phapKhieu : 0;
  const has121st = cultivation?.has121st || false;
  const thienCungCount = (cultivation?.thienCungList || []).length;
  const isNguyenAnh = currentRealm === 'nguyen_anh' || currentRealm === 'gia_anh';

  return (
    <div className="realm-timeline">
      {/* 1. NGƯNG KHÍ */}
      <div 
        className={`timeline-item ${activeView === 'ngung_khi' ? 'active' : ''}`}
        onClick={() => setActiveRealmView('ngung_khi')}
        style={{ cursor: 'pointer' }}
        title="Bấm để xem Khí Hải Ngưng Khí"
      >
        <h3 style={{ color: activeView === 'ngung_khi' ? 'var(--accent-cyan)' : 'var(--text-main)' }}>
          NGƯNG KHÍ KỲ
        </h3>
        <p>
          {currentRealm === 'ngung_khi' 
            ? `Tầng ${cultivation?.ngungKhiLevel || 1}/10 Khí Hải` 
            : '10 Tầng Khí Hải · Viên Mãn ✦'}
        </p>
      </div>
      
      {/* 2. TRÚC CƠ */}
      <div 
        className={`timeline-item ${activeView === 'truc_co' ? 'active' : ''}`}
        onClick={() => setActiveRealmView('truc_co')}
        style={{ cursor: 'pointer' }}
        title="Bấm để xem Trúc Cơ Tinh Đồ 120 Khiếu"
      >
        <h3 style={{ color: activeView === 'truc_co' ? 'var(--color-kim)' : 'var(--text-main)' }}>
          TRÚC CƠ KỲ
        </h3>
        <p>
          {opened}/120 Pháp Khiếu {opened >= 120 ? '✦ Viên Mãn' : ''}
        </p>
      </div>

      {/* 3. CỰC CẢNH 121 */}
      <div 
        className={`timeline-item ${has121st ? 'active' : ''}`}
        onClick={() => setActiveRealmView('truc_co')}
        style={{ cursor: 'pointer' }}
        title="Bấm để xem Cực Cảnh 121 Tử Vi Thiên Đỉnh"
      >
        <h3 style={{ color: has121st ? 'var(--color-cuc-canh, #ff3fd5)' : 'var(--text-muted)' }}>
          CỰC CẢNH 121
        </h3>
        <p style={{ color: has121st ? 'var(--color-cuc-canh, #ff3fd5)' : 'var(--text-muted)' }}>
          {has121st ? '✦ Thiên Đỉnh Thành Tựu' : (opened >= 120 ? '⚡ Sẵn Sàng Xung Kích' : '🔒 Phong Ấn')}
        </p>
      </div>

      {/* 4. KIM ĐAN */}
      <div 
        className={`timeline-item ${activeView === 'kim_dan' ? 'active' : ''}`}
        onClick={() => setActiveRealmView('kim_dan')}
        style={{ cursor: 'pointer' }}
        title="Bấm để xem Tòa Thiên Cung Kim Đan 3D"
      >
        <h3 style={{ color: activeView === 'kim_dan' ? 'var(--color-kim)' : (isNguyenAnh ? 'var(--color-kim)' : 'var(--text-muted)') }}>
          KIM ĐAN KỲ
        </h3>
      </div>

      {/* 5. NGUYÊN ANH / GIẢ ANH */}
      <div 
        className={`timeline-item ${activeView === 'nguyen_anh' || activeView === 'gia_anh' ? 'active' : ''}`}
        onClick={() => setActiveRealmView('nguyen_anh')}
        style={{ cursor: 'pointer' }}
        title="Bấm để xem Đạo Anh & Độ Kiếp Đài"
      >
        <h3 style={{ color: activeView === 'nguyen_anh' || activeView === 'gia_anh' ? 'var(--color-cuc-canh, #ff3fd5)' : 'var(--text-muted)' }}>
          {currentRealm === 'gia_anh' ? 'GIẢ ANH KỲ' : 'NGUYÊN ANH KỲ'}
        </h3>
        <p>
          {isNguyenAnh ? '✦ 11 Đạo Anh Trận' : 'Cửu Thiên Đạo Anh'}
        </p>
      </div>

      {/* 6. LINH TÀNG (PREVIEW / KHÓA) */}
      <div 
        className={`timeline-item ${activeView === 'linh_tang' ? 'active' : ''}`}
        onClick={() => setActiveRealmView('linh_tang')}
        style={{ 
          cursor: 'pointer',
          border: activeView === 'linh_tang' ? '1.5px solid #38bdf8' : '1px solid rgba(56, 189, 248, 0.25)',
          background: activeView === 'linh_tang' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(16, 25, 39, 0.5)'
        }}
        title="Cảnh Giới Tiếp Theo: Linh Tàng Kỳ (Bấm để xem Bí Tàng Nhục Thân)"
      >
        <h3 style={{ color: activeView === 'linh_tang' ? '#38bdf8' : '#7dd3fc' }}>
          LINH TÀNG KỲ
        </h3>
        <p style={{ color: activeView === 'linh_tang' ? '#38bdf8' : 'var(--text-muted)', fontSize: 11 }}>
          🔒 Bí Tàng Nhục Thân (Preview)
        </p>
      </div>
    </div>
  );
}
