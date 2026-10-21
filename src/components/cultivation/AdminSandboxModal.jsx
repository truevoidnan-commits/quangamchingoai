import React, { useState, useEffect } from 'react';
import { getActiveProfile, getCultivationState } from '../../lib/cultivation';
import {
  REALM_PRESETS,
  copyRealToSandbox,
  resetSandboxState,
  applyRealmPreset,
  adjustSandboxStats,
  exportSandboxJSON,
  importSandboxJSON,
} from '../../lib/cultivationAdmin';
import styles from './AdminSandboxModal.module.css';

export default function AdminSandboxModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('presets'); // 'presets' | 'stats' | 'manage'
  const [msg, setMsg] = useState(null); // { text: '', type: 'success' | 'error' }
  const [currentState, setCurrentState] = useState(() => {
    try {
      return getCultivationState();
    } catch {
      return null;
    }
  });

  // Inputs for stats
  const [expInput, setExpInput] = useState('');
  const [thienMenhInput, setThienMenhInput] = useState('');
  const [tienTinhInput, setTienTinhInput] = useState('');
  const [jsonInput, setJsonInput] = useState('');

  // Reload current state when opening or when window dispatches event
  const refreshState = () => {
    try {
      setCurrentState(getCultivationState());
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshState();
      setMsg(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const handler = () => refreshState();
    window.addEventListener('cultivation_updated', handler);
    return () => window.removeEventListener('cultivation_updated', handler);
  }, []);

  if (!isOpen) return null;

  // STRICT SECURITY CHECK: Never render in real profile
  if (getActiveProfile() !== 'sandbox') {
    return null;
  }

  const showFeedback = (text, type = 'success') => {
    setMsg({ text, type });
    refreshState();
    setTimeout(() => {
      setMsg((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  const handleApplyPreset = (preset) => {
    if (
      !window.confirm(
        `Áp dụng preset "${preset.name}" vào Hồ Sơ Thử Nghiệm?\n(Tu vi thật của bạn sẽ KHÔNG bị ảnh hưởng)`
      )
    ) {
      return;
    }

    try {
      applyRealmPreset(preset.id);
      showFeedback(`Đã chuyển cảnh giới sang: ${preset.name}!`);
    } catch (err) {
      showFeedback(err.message || 'Lỗi khi áp dụng preset.', 'error');
    }
  };

  const handleQuickAddExp = (amount) => {
    try {
      adjustSandboxStats({ addExp: amount });
      showFeedback(`Đã cộng +${amount.toLocaleString()} Tu Vi (EXP)!`);
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  };

  const handleSetExp = () => {
    const val = parseInt(expInput, 10);
    if (isNaN(val) || val < 0) {
      showFeedback('Vui lòng nhập số Tu Vi hợp lệ (>= 0).', 'error');
      return;
    }
    try {
      adjustSandboxStats({ setExp: val });
      setExpInput('');
      showFeedback(`Đã đặt Tu Vi thành ${val.toLocaleString()}!`);
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  };

  const handleQuickAddThienMenh = (amount) => {
    try {
      adjustSandboxStats({ addThienMenh: amount });
      showFeedback(`Đã cộng +${amount.toLocaleString()} Thiên Mệnh!`);
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  };

  const handleSetThienMenh = () => {
    const val = parseInt(thienMenhInput, 10);
    if (isNaN(val) || val < 0) {
      showFeedback('Vui lòng nhập số Thiên Mệnh hợp lệ (>= 0).', 'error');
      return;
    }
    try {
      adjustSandboxStats({ setThienMenh: val });
      setThienMenhInput('');
      showFeedback(`Đã đặt Thiên Mệnh thành ${val.toLocaleString()}!`);
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  };

  const handleQuickAddTienTinh = (amount) => {
    try {
      adjustSandboxStats({ addTienTinh: amount });
      showFeedback(`Đã cộng +${amount.toLocaleString()} Tiên Tinh!`);
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  };

  const handleSetTienTinh = () => {
    const val = parseInt(tienTinhInput, 10);
    if (isNaN(val) || val < 0) {
      showFeedback('Vui lòng nhập số Tiên Tinh hợp lệ (>= 0).', 'error');
      return;
    }
    try {
      adjustSandboxStats({ setTienTinh: val });
      setTienTinhInput('');
      showFeedback(`Đã đặt Tiên Tinh thành ${val.toLocaleString()}!`);
    } catch (err) {
      showFeedback(err.message, 'error');
    }
  };

  const handleCopyFromReal = () => {
    const confirmed = window.confirm(
      '⚠️ CẢNH BÁO XÁC NHẬN:\n\nThao tác này sẽ SAO CHÉP toàn bộ tiến trình tu luyện từ HỒ SƠ THẬT sang Hồ Sơ Thử Nghiệm và GHI ĐÈ toàn bộ dữ liệu hiện tại của Sandbox.\n\nBạn có muốn tiếp tục không?'
    );
    if (!confirmed) return;

    try {
      copyRealToSandbox();
      showFeedback('Đã sao chép toàn bộ Tu Vi Thật sang Sandbox thành công!');
    } catch (err) {
      showFeedback(err.message || 'Lỗi sao chép.', 'error');
    }
  };

  const handleResetSandbox = () => {
    const confirmed = window.confirm(
      '⚠️ Xác nhận đặt lại toàn bộ Hồ Sơ Thử Nghiệm về Phàm Nhân ban đầu?'
    );
    if (!confirmed) return;

    try {
      resetSandboxState();
      showFeedback('Đã đặt lại Sandbox về trạng thái ban đầu!');
    } catch (err) {
      showFeedback(err.message || 'Lỗi đặt lại.', 'error');
    }
  };

  const handleExportJSON = () => {
    try {
      const json = exportSandboxJSON();
      setJsonInput(json);
      navigator.clipboard?.writeText(json);
      showFeedback('Đã xuất JSON và sao chép vào bộ nhớ tạm (Clipboard)!');
    } catch (err) {
      showFeedback(err.message || 'Lỗi xuất JSON.', 'error');
    }
  };

  const handleImportJSON = () => {
    if (!jsonInput.trim()) {
      showFeedback('Vui lòng dán chuỗi JSON vào ô văn bản trước khi nạp.', 'error');
      return;
    }

    let parsedPreview;
    try {
      parsedPreview = JSON.parse(jsonInput);
    } catch (err) {
      showFeedback('Cú pháp JSON không hợp lệ: ' + err.message, 'error');
      return;
    }

    let confirmMsg = 'Nạp cấu hình JSON này vào Hồ Sơ Thử Nghiệm?';
    if (parsedPreview && parsedPreview.profile === 'real') {
      confirmMsg = 'Đây là bản sao lưu hồ sơ Thật, nạp vào Sandbox (không ảnh hưởng hồ sơ Thật)?';
    }

    if (!window.confirm(confirmMsg)) return;

    try {
      importSandboxJSON(jsonInput);
      showFeedback('Đã nạp dữ liệu JSON vào Sandbox thành công!');
    } catch (err) {
      showFeedback(err.message || 'Lỗi nạp JSON.', 'error');
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <h2 className={styles.title}>
              <span>🛠️</span> BẢNG ĐIỀU KHIỂN ADMIN (SANDBOX)
            </h2>
            <div className={styles.subtitle}>
              Chế độ thử nghiệm an toàn • Dữ liệu Tu Vi Thật được cách ly tuyệt đối
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Đóng">
            ✕
          </button>
        </div>

        {/* Tab switcher */}
        <div className={styles.tabs}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'presets' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('presets')}
          >
            🪐 Cảnh Giới Presets ({REALM_PRESETS.length})
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'stats' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            ⚡ Chỉnh Thông Số
          </button>
          <button
            className={`${styles.tabBtn} ${activeTab === 'manage' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('manage')}
          >
            💾 Quản Lý & Dữ Liệu
          </button>
        </div>

        {/* Feedback message */}
        {msg && (
          <div
            className={`${styles.msgBar} ${
              msg.type === 'error' ? styles.msgError : styles.msgSuccess
            }`}
          >
            <span>{msg.type === 'error' ? '❌' : '✅'}</span>
            <span>{msg.text}</span>
          </div>
        )}

        {/* Tab 1: Presets */}
        {activeTab === 'presets' && (
          <div className={styles.content}>
            <div className={styles.presetsGrid}>
              {REALM_PRESETS.map((p) => (
                <div key={p.id} className={styles.presetCard}>
                  <div className={styles.presetCardHeader}>
                    <h3 className={styles.presetName}>{p.name}</h3>
                    <span className={styles.presetBadge}>{p.badge}</span>
                  </div>
                  <p className={styles.presetDesc}>{p.desc}</p>
                  <button
                    className={styles.applyPresetBtn}
                    onClick={() => handleApplyPreset(p)}
                  >
                    Áp Dụng Preset ➔
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Manual Stats */}
        {activeTab === 'stats' && (
          <div className={styles.content}>
            <div className={styles.statsContainer}>
              {/* Tu Vi / EXP */}
              <div className={styles.statCard}>
                <div className={styles.statCardTitle}>
                  <span>Tu Vi (Total EXP)</span>
                  <span className={styles.currentValue}>
                    {Number(currentState?.totalExp || 0).toLocaleString()}
                  </span>
                </div>
                <div className={styles.quickBtnGroup}>
                  <button className={styles.quickBtn} onClick={() => handleQuickAddExp(10000)}>
                    +10.000
                  </button>
                  <button className={styles.quickBtn} onClick={() => handleQuickAddExp(50000)}>
                    +50.000
                  </button>
                  <button className={styles.quickBtn} onClick={() => handleQuickAddExp(200000)}>
                    +200.000
                  </button>
                  <button className={styles.quickBtn} onClick={() => handleQuickAddExp(1000000)}>
                    +1.000.000
                  </button>
                </div>
                <div className={styles.statInputRow}>
                  <input
                    type="number"
                    min="0"
                    placeholder="Nhập giá trị Tu Vi muốn đặt..."
                    className={styles.statInput}
                    value={expInput}
                    onChange={(e) => setExpInput(e.target.value)}
                  />
                  <button className={styles.setBtn} onClick={handleSetExp}>
                    Đặt Giá Trị
                  </button>
                </div>
              </div>

              {/* Thiên Mệnh */}
              <div className={styles.statCard}>
                <div className={styles.statCardTitle}>
                  <span>Thiên Mệnh</span>
                  <span className={styles.currentValue}>
                    {Number(currentState?.totalThienMenh || 0).toLocaleString()}
                  </span>
                </div>
                <div className={styles.quickBtnGroup}>
                  <button className={styles.quickBtn} onClick={() => handleQuickAddThienMenh(5000)}>
                    +5.000
                  </button>
                  <button className={styles.quickBtn} onClick={() => handleQuickAddThienMenh(20000)}>
                    +20.000
                  </button>
                  <button className={styles.quickBtn} onClick={() => handleQuickAddThienMenh(100000)}>
                    +100.000
                  </button>
                  <button className={styles.quickBtn} onClick={() => handleQuickAddThienMenh(500000)}>
                    +500.000
                  </button>
                </div>
                <div className={styles.statInputRow}>
                  <input
                    type="number"
                    min="0"
                    placeholder="Nhập giá trị Thiên Mệnh..."
                    className={styles.statInput}
                    value={thienMenhInput}
                    onChange={(e) => setThienMenhInput(e.target.value)}
                  />
                  <button className={styles.setBtn} onClick={handleSetThienMenh}>
                    Đặt Giá Trị
                  </button>
                </div>
              </div>

              {/* Tiên Tinh */}
              <div className={styles.statCard}>
                <div className={styles.statCardTitle}>
                  <span>Tiên Tinh</span>
                  <span className={styles.currentValue}>
                    {Number(currentState?.tienTinh || 0).toLocaleString()}
                  </span>
                </div>
                <div className={styles.quickBtnGroup}>
                  <button className={styles.quickBtn} onClick={() => handleQuickAddTienTinh(1000)}>
                    +1.000
                  </button>
                  <button className={styles.quickBtn} onClick={() => handleQuickAddTienTinh(5000)}>
                    +5.000
                  </button>
                  <button className={styles.quickBtn} onClick={() => handleQuickAddTienTinh(20000)}>
                    +20.000
                  </button>
                  <button className={styles.quickBtn} onClick={() => handleQuickAddTienTinh(100000)}>
                    +100.000
                  </button>
                </div>
                <div className={styles.statInputRow}>
                  <input
                    type="number"
                    min="0"
                    placeholder="Nhập số Tiên Tinh..."
                    className={styles.statInput}
                    value={tienTinhInput}
                    onChange={(e) => setTienTinhInput(e.target.value)}
                  />
                  <button className={styles.setBtn} onClick={handleSetTienTinh}>
                    Đặt Giá Trị
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Management & JSON */}
        {activeTab === 'manage' && (
          <div className={styles.content}>
            <div className={styles.manageContainer}>
              {/* Copy Real to Sandbox */}
              <div className={styles.manageCard}>
                <div className={styles.manageCardTitle}>
                  <span>📥</span> Sao chép từ Hồ Sơ Thật sang Sandbox
                </div>
                <p className={styles.manageCardDesc}>
                  Đọc toàn bộ dữ liệu hiện có trong Hồ Sơ Thật và nhân bản vào Sandbox để bạn
                  thử nghiệm đột phá hoặc thao tác từ đúng tiến trình hiện tại mà không lo hỏng tu vi thật.
                </p>
                <button className={styles.copyBtn} onClick={handleCopyFromReal}>
                  Sao Chép Tu Vi Thật Sang Sandbox
                </button>
              </div>

              {/* Reset Sandbox */}
              <div className={styles.manageCard}>
                <div className={styles.manageCardTitle}>
                  <span>🔄</span> Đặt lại Hồ Sơ Thử Nghiệm
                </div>
                <p className={styles.manageCardDesc}>
                  Xóa toàn bộ tiến trình trong Sandbox và đưa về trạng thái Phàm Nhân sơ nhập đạo lộ.
                  Hồ sơ Thật của bạn hoàn toàn nguyên vẹn.
                </p>
                <button className={styles.resetBtn} onClick={handleResetSandbox}>
                  Đặt Lại Về Phàm Nhân
                </button>
              </div>

              {/* Export / Import JSON */}
              <div className={styles.manageCard}>
                <div className={styles.manageCardTitle}>
                  <span>📄</span> Sao lưu & Nạp dữ liệu JSON Sandbox
                </div>
                <p className={styles.manageCardDesc}>
                  Xuất hoặc dán chuỗi JSON trạng thái Sandbox để lưu giữ các tình huống test hoặc khôi phục.
                </p>
                <textarea
                  className={styles.jsonArea}
                  placeholder="Dán mã JSON trạng thái tu luyện vào đây để nạp, hoặc bấm 'Xuất JSON Sandbox' bên dưới..."
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                />
                <div className={styles.jsonBtnRow}>
                  <button className={styles.actionBtn} onClick={handleExportJSON}>
                    📋 Xuất JSON Sandbox
                  </button>
                  <button className={styles.importBtn} onClick={handleImportJSON}>
                    📥 Nạp Dữ Liệu Từ JSON
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
