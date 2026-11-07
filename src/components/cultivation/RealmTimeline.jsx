import React from 'react';
import Icon from '../ui/Icon';
import { useCultivationContext } from '../../context/CultivationContext';

const REALM_DATA = [
  {
    key: 'ngung_khi',
    order: 1,
    name: 'NGƯNG KHÍ KỲ',
    icon: 'wave',
    getDetails: (cultivation) => {
      const level = cultivation?.ngungKhiLevel || 1;
      const path = cultivation?.ngungKhiActivePath === 'the' ? 'Hải Sơn' : 'Hóa Hải';
      return {
        completedText: '10 Tầng Khí Hải · Viên Mãn',
        currentText: `Tầng ${level}/10 Khí Hải (${path})`,
        lockedText: '10 Tầng Khí Hải',
      };
    },
  },
  {
    key: 'truc_co',
    order: 2,
    name: 'TRÚC CƠ KỲ',
    icon: 'yin-yang',
    getDetails: (cultivation) => {
      const opened = cultivation?.phapKhieu !== undefined ? cultivation.phapKhieu : 0;
      const percent = Math.min(100, Math.round((opened / 120) * 100));
      return {
        completedText: '120/120 Pháp Khiếu · Viên Mãn',
        currentText: `${opened}/120 Pháp Khiếu`,
        lockedText: '120 Pháp Khiếu',
        hasProgress: true,
        progressPercent: percent,
        has121Badge: cultivation?.has121st,
        is121Ready: opened >= 120 && !cultivation?.has121st && !cultivation?.failed121st,
      };
    },
  },
  {
    key: 'kim_dan',
    order: 3,
    name: 'KIM ĐAN KỲ',
    icon: 'crown',
    getDetails: (cultivation) => {
      const maxCung = cultivation?.maxThienCung || 13;
      const realized = cultivation?.realizedThienCung || 0;
      const lampCount = (cultivation?.absorbedLamps || []).length;
      const selfCount = maxCung - lampCount;
      const isAll = realized >= selfCount;
      return {
        completedText: 'Thập Tam Cung · Viên Mãn',
        currentText: isAll ? 'Đang thai nghén Đạo Anh' : `${realized}/${maxCung} Cung Thật`,
        lockedText: 'Thập Tam Thiên Cung',
      };
    },
  },
  {
    key: 'nguyen_anh',
    order: 4,
    getName: (cultivation) => (cultivation?.realm === 'gia_anh' ? 'GIẢ ANH KỲ' : 'NGUYÊN ANH KỲ'),
    icon: 'meditation',
    getDetails: (cultivation) => {
      const daoAnhCount = cultivation?.daoAnhs?.length || 13;
      return {
        completedText: `${daoAnhCount} Đạo Anh · Viên Mãn`,
        currentText: `${daoAnhCount} Đạo Anh Trận`,
        lockedText: 'Cửu Thiên Đạo Anh',
      };
    },
  },
  {
    key: 'linh_tang',
    order: 5,
    name: 'LINH TÀNG KỲ',
    icon: 'shield',
    getDetails: (cultivation) => {
      const tangs = cultivation?.linhTangs || [];
      const openedCount = tangs.filter((t) => t.isGateOpen).length;
      const percent = Math.min(100, Math.round((openedCount / 5) * 100));
      return {
        completedText: `${openedCount}/5 Tàng Môn · Viên Mãn`,
        currentText: `${openedCount}/5 Tàng Môn`,
        lockedText: 'Bí Tàng Nhục Thân',
        hasProgress: true,
        progressPercent: percent,
      };
    },
  },
];

const REALM_RANKS = {
  ngung_khi: 1,
  truc_co: 2,
  kim_dan: 3,
  gia_anh: 4,
  nguyen_anh: 4,
  linh_tang: 5,
};

export default function RealmTimeline() {
  const { cultivation, activeRealmView, setActiveRealmView } = useCultivationContext();
  const currentRealm = cultivation?.realm || 'truc_co';
  const activeView = activeRealmView || currentRealm;
  const currentRank = REALM_RANKS[currentRealm] || 1;

  return (
    <div className="realm-timeline realm-stepper-container">
      <div className="realm-stepper-connector" />
      {REALM_DATA.map((item) => {
        const isCompleted = item.order < currentRank;
        const isCurrent = item.order === currentRank;
        const isLocked = item.order > currentRank;
        const isViewing = activeView === item.key || (item.key === 'nguyen_anh' && activeView === 'gia_anh');
        const details = item.getDetails(cultivation);
        const displayName = item.getName ? item.getName(cultivation) : item.name;

        return (
          <button
            key={item.key}
            type="button"
            className={`timeline-item stepper-card ${isCurrent ? 'current' : isCompleted ? 'completed' : 'locked'} ${isViewing ? 'viewing' : ''}`}
            onClick={() => setActiveRealmView(item.key)}
            title={`Bấm để xem ${displayName}`}
            aria-current={isCurrent ? 'step' : undefined}
          >
            <div className="stepper-card-header">
              <div className="stepper-icon-wrap">
                <Icon name={item.icon} size={15} />
              </div>
              <div className="stepper-title-wrap">
                <div className="stepper-title">
                  {displayName}
                </div>
                <div className="stepper-sub">
                  {isCompleted ? details.completedText : isCurrent ? details.currentText : details.lockedText}
                </div>
              </div>
            </div>

            {/* Status row below title: Left = status badge, Right = viewing tag */}
            <div className="stepper-status-row">
              <div className="stepper-badge-wrap">
                {isCurrent ? (
                  <span className="stepper-badge badge-current" aria-label="Cảnh giới hiện tại">
                    <span className="pulsing-glow-dot" /> Hiện tại
                  </span>
                ) : isCompleted ? (
                  <span className="stepper-badge badge-completed" aria-label="Đã hoàn thành">
                    <Icon name="check" size={11} /> Đã đạt
                  </span>
                ) : (
                  <span className="stepper-badge badge-locked" aria-label="Chưa mở">
                    <Icon name="lock" size={11} /> Chưa mở
                  </span>
                )}
              </div>

              {/* Viewing Indicator Tag */}
              {isViewing && (
                <div className="stepper-viewing-tag" aria-label="Đang xem cảnh giới này">
                  <Icon name="eye" size={10} /> ĐANG XEM
                </div>
              )}
            </div>

            {/* Cực Cảnh 121 Badge inside Trúc Cơ */}
            {details.has121Badge && (
              <div className="cuc-canh-badge-row">
                <span className="cuc-canh-chip achieved">
                  <Icon name="sparkles" size={10} /> Cực Cảnh 121: Thiên Đỉnh
                </span>
              </div>
            )}
            {details.is121Ready && (
              <div className="cuc-canh-badge-row">
                <span className="cuc-canh-chip ready">
                  <Icon name="bolt" size={10} /> Cực Cảnh 121: Sẵn Sàng
                </span>
              </div>
            )}

            {/* Mini Progress Bar */}
            {details.hasProgress && (isCurrent || isViewing) && (
              <div className="stepper-progress-wrap">
                <div className="stepper-progress-bar" style={{ width: `${details.progressPercent}%` }} />
              </div>
            )}


          </button>
        );
      })}
    </div>
  );
}
