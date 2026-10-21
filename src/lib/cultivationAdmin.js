/**
 * src/lib/cultivationAdmin.js
 * Admin and Sandbox control tools for testing cultivation realms safely.
 * GUARANTEE: Functions in this module only operate when getActiveProfile() === 'sandbox'
 * and will strictly throw an error if attempted in 'real' profile.
 */
import {
  getActiveProfile,
  getCultivationKey,
  getCultivationState,
  saveCultivationState,
  resetCultivationState,
  EXP_PER_THIEN_DAO,
  EXP_PER_DI_TIEN_LUU,
  THIEN_MENH_PER_THAN_TANG,
} from './cultivation.js';

function assertSandbox() {
  if (getActiveProfile() !== 'sandbox') {
    throw new Error('HÀNH ĐỘNG BỊ TỪ CHỐI: Chỉ được phép thực hiện trên Hồ Sơ Thử Nghiệm (Sandbox)!');
  }
}

/**
 * Danh sách định nghĩa các Cảnh Giới Preset để nhảy cấp nhanh trong Sandbox
 */
export const REALM_PRESETS = [
  {
    id: 'ngung_khi_1',
    name: 'Ngưng Khí Tầng 1',
    group: 'Ngưng Khí Kỳ',
    desc: 'Trạng thái phàm nhân sơ nhập đạo lộ, mới ngưng tụ chút ít linh khí ban đầu.',
    badge: 'Phàm Nhân',
  },
  {
    id: 'ngung_khi_10',
    name: 'Ngưng Khí Tầng 10 (Song Tu Viên Mãn)',
    group: 'Ngưng Khí Kỳ',
    desc: 'Luyện Thể Hải Sơn Quyết 10 tầng & Pháp Tu Hóa Hải Kinh 10 tầng, sẵn sàng Trúc Cơ.',
    badge: 'Song Tu Cực Cảnh',
  },
  {
    id: 'truc_co_so_ky',
    name: 'Trúc Cơ Sơ Kỳ (30 Khiếu)',
    group: 'Trúc Cơ Kỳ',
    desc: 'Đột phá Trúc Cơ, khai mở 30 Pháp Khiếu đầu tiên, ngưng tụ 1 Mệnh Hỏa tự thân.',
    badge: '1 Mệnh Hỏa',
  },
  {
    id: 'truc_co_120',
    name: 'Trúc Cơ Viên Mãn (120 Khiếu)',
    group: 'Trúc Cơ Kỳ',
    desc: 'Khai thông trọn vẹn 120 Pháp Khiếu, 4 Mệnh Hỏa tự thân rực rỡ, sẵn sàng Kết Đan.',
    badge: '4 Mệnh Hỏa',
  },
  {
    id: 'truc_co_121',
    name: 'Trúc Cơ Cực Cảnh (121 Khiếu - 10 Hỏa)',
    group: 'Trúc Cơ Kỳ',
    desc: 'Phá vỡ gông xiềng mở Pháp Khiếu 121 ẩn tàng + 5 Mệnh Đăng Thần Phẩm (10 Mệnh Hỏa Huyền Diệu).',
    badge: '10 Mệnh Hỏa Cực Cảnh',
  },
  {
    id: 'kim_dan_so_ky',
    name: 'Kim Đan Sơ Kỳ (6 Thiên Cung)',
    group: 'Kim Đan Kỳ',
    desc: 'Bước vào Kim Đan Kỳ, 6 Thiên Cung hình thành với 1 Cung Thật ban đầu.',
    badge: '6 Thiên Cung',
  },
  {
    id: 'kim_dan_13',
    name: 'Kim Đan Cực Cảnh (13 Thiên Cung Thật)',
    group: 'Kim Đan Kỳ',
    desc: 'Trần 13 Thiên Cung, toàn bộ 13 Cung đều hóa thực và khảm nạm Trấn Cung Thần Vật uy chấn chư thiên.',
    badge: '13 Cung Thật',
  },
  {
    id: 'gia_anh_so_khai',
    name: 'Giả Anh Kỳ (Đạo Anh Khai Sinh)',
    group: 'Giả Anh Kỳ',
    desc: 'Toàn bộ Thiên Cung thăng hoa giáng thế thành Đạo Anh Thần Thể (0 Kiếp), mở khóa Thiên Mệnh.',
    badge: 'Đạo Anh Giáng Thế',
  },
  {
    id: 'nguyen_anh_so_ky',
    name: 'Nguyên Anh Sơ Kỳ (1 Kiếp)',
    group: 'Nguyên Anh Kỳ',
    desc: 'Đạo Anh vượt qua thiên kiếp đầu tiên, chính thức ngưng tụ Bản Nguyên Nguyên Anh.',
    badge: '1 Kiếp Đạo Anh',
  },
  {
    id: 'nguyen_anh_5_kiep',
    name: 'Nguyên Anh Đại Viên Mãn (5 Kiếp)',
    group: 'Nguyên Anh Kỳ',
    desc: 'Toàn bộ Đạo Anh đạt 5 Kiếp hoàn mỹ, uy áp cái thế, sẵn sàng khai mở Tàng Môn Bí Tàng.',
    badge: '5 Kiếp Hoàn Mỹ',
  },
  {
    id: 'linh_tang_so_ky',
    name: 'Linh Tàng Sơ Kỳ (1 Tạng Mở)',
    group: 'Linh Tàng Kỳ',
    desc: 'Đúc 5 Tòa Tàng Môn từ 5 Đạo Anh nổi bật nhất, Tòa 1 tự động mở Bí Tàng.',
    badge: '1 Tạng Bí Tàng',
  },
  {
    id: 'linh_tang_dai_vien_man',
    name: 'Linh Tàng Đại Viên Mãn (5 Thần Tàng)',
    group: 'Linh Tàng Kỳ',
    desc: 'Toàn bộ 5 Tòa Tàng Môn chuyển hóa thành Thần Tàng viên mãn, đứng trên đỉnh cao đại đạo.',
    badge: '5 Tạng Thần Tàng',
  },
];

/**
 * Sao chép toàn bộ state và pending seconds từ Hồ Sơ Thật sang Sandbox
 */
export function copyRealToSandbox() {
  assertSandbox();

  const realStateRaw = localStorage.getItem(getCultivationKey('state', 'real'));
  const realSeconds = localStorage.getItem(getCultivationKey('pending_seconds', 'real')) || '0';

  let realState;
  try {
    realState = realStateRaw ? JSON.parse(realStateRaw) : {};
  } catch {
    realState = {};
  }

  const copiedState = {
    ...realState,
    _rev: ((realState && realState._rev) || 0) + 1,
    _updatedAt: Date.now(),
  };

  localStorage.setItem(getCultivationKey('state', 'sandbox'), JSON.stringify(copiedState));
  localStorage.setItem(getCultivationKey('pending_seconds', 'sandbox'), realSeconds);

  window.dispatchEvent(new CustomEvent('cultivation_updated', { detail: copiedState }));
  return copiedState;
}

/**
 * Đặt lại Hồ Sơ Thử Nghiệm về trạng thái ban đầu (Phàm Nhân)
 */
export function resetSandboxState() {
  assertSandbox();
  const fresh = resetCultivationState();
  localStorage.setItem(getCultivationKey('pending_seconds', 'sandbox'), '0');
  return fresh;
}

/**
 * Nhảy thẳng tới Cảnh Giới Preset trong Sandbox
 */
export function applyRealmPreset(presetId) {
  assertSandbox();

  const now = Date.now();
  const cur = getCultivationState();

  const baseLamps = [
    'thien_dao_chi_ton',
    'khoi_nguyen_thoi_khong',
    'cuu_khieu_linh_lung',
    'am_duong_hon_don_nguyen_can',
    'hong_mong_bat_diet',
  ];

  const defaultDaoAnhs = [
    {
      id: 'da_1_thien_dao',
      palaceIndex: 0,
      palaceName: 'Thiên Đạo Cung',
      name: 'Thiên Đạo Chi Tôn Đạo Anh',
      element: 'Chí Tôn Thần Thể',
      fromLamp: true,
      lampId: 'thien_dao_chi_ton',
      artifactId: null,
      tier: 'than_pham',
      currentKiep: 0,
      currentExp: 0,
      maxExp: 10000,
      currentThienMenh: 0,
      maxThienMenh: 10000,
    },
    {
      id: 'da_2_thoi_khong',
      palaceIndex: 1,
      palaceName: 'Khởi Nguyên Thời Không Cung',
      name: 'Khởi Nguyên Thời Không Đạo Anh',
      element: 'Thời Không Thần Thể',
      fromLamp: true,
      lampId: 'khoi_nguyen_thoi_khong',
      artifactId: null,
      tier: 'than_pham',
      currentKiep: 0,
      currentExp: 0,
      maxExp: 10000,
      currentThienMenh: 0,
      maxThienMenh: 10000,
    },
    {
      id: 'da_3_cuu_khieu',
      palaceIndex: 2,
      palaceName: 'Cửu Khiếu Linh Lung Cung',
      name: 'Cửu Khiếu Linh Lung Đạo Anh',
      element: 'Thất Sắc Thần Thể',
      fromLamp: true,
      lampId: 'cuu_khieu_linh_lung',
      artifactId: null,
      tier: 'than_pham',
      currentKiep: 0,
      currentExp: 0,
      maxExp: 10000,
      currentThienMenh: 0,
      maxThienMenh: 10000,
    },
    {
      id: 'da_4_am_duong',
      palaceIndex: 3,
      palaceName: 'Âm Dương Hỗn Độn Cung',
      name: 'Âm Dương Hỗn Độn Đạo Anh',
      element: 'Hỗn Độn Thần Thể',
      fromLamp: true,
      lampId: 'am_duong_hon_don_nguyen_can',
      artifactId: null,
      tier: 'than_pham',
      currentKiep: 0,
      currentExp: 0,
      maxExp: 10000,
      currentThienMenh: 0,
      maxThienMenh: 10000,
    },
    {
      id: 'da_5_hong_mong',
      palaceIndex: 4,
      palaceName: 'Hồng Mông Bất Diệt Cung',
      name: 'Hồng Mông Bất Diệt Đạo Anh',
      element: 'Hồng Mông Thần Thể',
      fromLamp: true,
      lampId: 'hong_mong_bat_diet',
      artifactId: null,
      tier: 'than_pham',
      currentKiep: 0,
      currentExp: 0,
      maxExp: 10000,
      currentThienMenh: 0,
      maxThienMenh: 10000,
    },
  ];

  let nextState = {
    ...cur,
    logs: [
      {
        text: `🛠️ [ADMIN SANDBOX] Đã áp dụng preset cảnh giới: ${presetId}`,
        time: now,
      },
      ...(cur.logs || []),
    ],
  };

  switch (presetId) {
    case 'ngung_khi_1':
      nextState = {
        ...nextState,
        realm: 'ngung_khi',
        totalExp: 0,
        expCurrentRealm: 0,
        ngungKhiLevel: 1,
        ngungKhiTheLevel: 1,
        ngungKhiPhapLevel: 1,
        ngungKhiTheExp: 0,
        ngungKhiPhapExp: 0,
        ngungKhiActivePath: 'the',
        isSongTuVienMan: false,
        hasSongTuBonus: false,
        readyBreakthroughTrucCo: false,
        phapKhieu: 0,
        selfMenhHoa: 0,
        has121st: false,
        absorbedLamps: [],
        inventoryLamps: [],
        inventoryArtifacts: [],
        palaceAnchors: {},
        daoAnhs: [],
        linhTangs: [],
      };
      break;

    case 'ngung_khi_10':
      nextState = {
        ...nextState,
        realm: 'ngung_khi',
        totalExp: 9000,
        expCurrentRealm: 9000,
        ngungKhiLevel: 10,
        ngungKhiTheLevel: 10,
        ngungKhiPhapLevel: 10,
        ngungKhiTheExp: 4500,
        ngungKhiPhapExp: 4500,
        ngungKhiActivePath: 'the',
        isSongTuVienMan: true,
        hasSongTuBonus: true,
        readyBreakthroughTrucCo: true,
      };
      break;

    case 'truc_co_so_ky':
      nextState = {
        ...nextState,
        realm: 'truc_co',
        totalExp: 25000,
        expCurrentRealm: 16000,
        ngungKhiTheLevel: 10,
        ngungKhiPhapLevel: 10,
        isSongTuVienMan: true,
        hasSongTuBonus: true,
        readyBreakthroughTrucCo: false,
        phapKhieu: 30,
        selfMenhHoa: 1,
        has121st: false,
        failed121st: false,
        attemptExp121: 0,
        absorbedLamps: [],
      };
      break;

    case 'truc_co_120':
      nextState = {
        ...nextState,
        realm: 'truc_co',
        totalExp: 150000,
        expCurrentRealm: 120000,
        ngungKhiTheLevel: 10,
        ngungKhiPhapLevel: 10,
        isSongTuVienMan: true,
        hasSongTuBonus: true,
        phapKhieu: 120,
        selfMenhHoa: 4,
        has121st: false,
        failed121st: false,
        attemptExp121: 0,
      };
      break;

    case 'truc_co_121':
      nextState = {
        ...nextState,
        realm: 'truc_co',
        totalExp: 280000,
        expCurrentRealm: 200000,
        ngungKhiTheLevel: 10,
        ngungKhiPhapLevel: 10,
        isSongTuVienMan: true,
        hasSongTuBonus: true,
        phapKhieu: 121,
        selfMenhHoa: 5,
        has121st: true,
        hasEverUnlocked121: true,
        failed121st: false,
        attemptExp121: 0,
        absorbedLamps: [...baseLamps],
      };
      break;

    case 'kim_dan_so_ky':
      nextState = {
        ...nextState,
        realm: 'kim_dan',
        totalExp: 380000,
        expCurrentRealm: 50000,
        maxThienCung: 6,
        realizedThienCung: 1,
        currentThienCungExp: 0,
        phapKhieu: 120,
        selfMenhHoa: 4,
      };
      break;

    case 'kim_dan_13':
      nextState = {
        ...nextState,
        realm: 'kim_dan',
        totalExp: 900000,
        expCurrentRealm: 300000,
        maxThienCung: 13,
        realizedThienCung: 13,
        currentThienCungExp: 0,
        phapKhieu: 121,
        selfMenhHoa: 5,
        has121st: true,
        hasEverUnlocked121: true,
        absorbedLamps: [...baseLamps],
      };
      break;

    case 'gia_anh_so_khai':
      nextState = {
        ...nextState,
        realm: 'gia_anh',
        totalExp: 1200000,
        expCurrentRealm: 0,
        isThienMenhUnlocked: true,
        totalThienMenh: 50000,
        maxThienCung: 13,
        realizedThienCung: 13,
        absorbedLamps: [...baseLamps],
        daoAnhs: defaultDaoAnhs.map(d => ({ ...d, currentKiep: 0, currentExp: 0 })),
      };
      break;

    case 'nguyen_anh_so_ky':
      nextState = {
        ...nextState,
        realm: 'nguyen_anh',
        totalExp: 1800000,
        expCurrentRealm: 0,
        isThienMenhUnlocked: true,
        totalThienMenh: 150000,
        maxThienCung: 13,
        realizedThienCung: 13,
        absorbedLamps: [...baseLamps],
        daoAnhs: defaultDaoAnhs.map(d => ({ ...d, currentKiep: 1, currentExp: 0 })),
      };
      break;

    case 'nguyen_anh_5_kiep':
      nextState = {
        ...nextState,
        realm: 'nguyen_anh',
        totalExp: 3500000,
        expCurrentRealm: 0,
        isThienMenhUnlocked: true,
        totalThienMenh: 500000,
        maxThienCung: 13,
        realizedThienCung: 13,
        absorbedLamps: [...baseLamps],
        daoAnhs: defaultDaoAnhs.map(d => ({ ...d, currentKiep: 5, currentExp: 0 })),
      };
      break;

    case 'linh_tang_so_ky':
      nextState = {
        ...nextState,
        realm: 'linh_tang',
        totalExp: 4500000,
        expCurrentRealm: 0,
        isThienMenhUnlocked: true,
        totalThienMenh: 600000,
        maxThienCung: 13,
        realizedThienCung: 13,
        absorbedLamps: [...baseLamps],
        daoAnhs: defaultDaoAnhs.map(d => ({ ...d, currentKiep: 5, currentExp: 0 })),
        linhTangs: defaultDaoAnhs.map((da, idx) => ({
          id: idx + 1,
          name: `${da.palaceName.replace(' Cung', '')} Bí Tàng`,
          originName: da.palaceName.replace(' Cung', ''),
          sourceDaoAnhId: da.id,
          sourceDaoAnhName: da.name,
          sourceLampId: da.lampId,
          type: 'bi_tang',
          exp: idx === 0 ? EXP_PER_THIEN_DAO : 0,
          maxExp: EXP_PER_THIEN_DAO,
          hasThienDao: idx === 0,
          thienDaoName: `${da.palaceName.replace(' Cung', '')} Thiên Đạo`,
          isGateOpen: idx === 0,
          thanHuyetNhuc: 0,
          maxThanHuyetNhuc: THIEN_MENH_PER_THAN_TANG,
          diTienLuuExp: 0,
          maxDiTienLuuExp: EXP_PER_DI_TIEN_LUU,
          isNurturingDiTienLuu: false,
          isThanLinhThai: false,
          assignedLampId: null,
          isInitialized: true,
        })),
        targetLinhTangIndex: 2,
      };
      break;

    case 'linh_tang_dai_vien_man':
      nextState = {
        ...nextState,
        realm: 'linh_tang',
        totalExp: 9000000,
        expCurrentRealm: 0,
        isThienMenhUnlocked: true,
        totalThienMenh: 1500000,
        maxThienCung: 13,
        realizedThienCung: 13,
        absorbedLamps: [...baseLamps],
        daoAnhs: defaultDaoAnhs.map(d => ({ ...d, currentKiep: 5, currentExp: 0 })),
        linhTangs: defaultDaoAnhs.map((da, idx) => ({
          id: idx + 1,
          name: `${da.palaceName.replace(' Cung', '')} Thần Tàng`,
          originName: da.palaceName.replace(' Cung', ''),
          sourceDaoAnhId: da.id,
          sourceDaoAnhName: da.name,
          sourceLampId: da.lampId,
          type: 'than_tang',
          exp: EXP_PER_THIEN_DAO,
          maxExp: EXP_PER_THIEN_DAO,
          hasThienDao: true,
          thienDaoName: `${da.palaceName.replace(' Cung', '')} Thiên Đạo`,
          isGateOpen: true,
          thanHuyetNhuc: THIEN_MENH_PER_THAN_TANG,
          maxThanHuyetNhuc: THIEN_MENH_PER_THAN_TANG,
          diTienLuuExp: EXP_PER_DI_TIEN_LUU,
          maxDiTienLuuExp: EXP_PER_DI_TIEN_LUU,
          isNurturingDiTienLuu: false,
          isThanLinhThai: true,
          assignedLampId: da.lampId,
          isInitialized: true,
        })),
        targetLinhTangIndex: 5,
      };
      break;

    default:
      throw new Error(`Preset không hợp lệ: ${presetId}`);
  }

  saveCultivationState(nextState);
  return nextState;
}

/**
 * Tinh chỉnh thông số thủ công trong Sandbox (Tu Vi, Thiên Mệnh, EXP Uẩn Tích)
 */
export function adjustSandboxStats(params = {}) {
  assertSandbox();

  const state = getCultivationState();
  const { addExp, setExp, addThienMenh, setThienMenh, addStoredExp, setStoredExp, addTienTinh, setTienTinh } = params;

  if (typeof addExp === 'number') {
    state.totalExp = Math.max(0, (state.totalExp || 0) + addExp);
    state.expCurrentRealm = Math.max(0, (state.expCurrentRealm || 0) + addExp);
  }
  if (typeof setExp === 'number') {
    state.totalExp = Math.max(0, setExp);
    state.expCurrentRealm = Math.max(0, setExp);
  }

  if (typeof addThienMenh === 'number') {
    state.totalThienMenh = Math.max(0, (state.totalThienMenh || 0) + addThienMenh);
  }
  if (typeof setThienMenh === 'number') {
    state.totalThienMenh = Math.max(0, setThienMenh);
  }

  if (typeof addStoredExp === 'number') {
    state.storedExp = Math.max(0, (state.storedExp || 0) + addStoredExp);
  }
  if (typeof setStoredExp === 'number') {
    state.storedExp = Math.max(0, setStoredExp);
  }

  if (typeof addTienTinh === 'number') {
    state.tienTinh = Math.max(0, (state.tienTinh || 0) + addTienTinh);
  }
  if (typeof setTienTinh === 'number') {
    state.tienTinh = Math.max(0, setTienTinh);
  }

  state.logs.unshift({
    text: `🛠️ [ADMIN SANDBOX] Đã tinh chỉnh thông số: ${JSON.stringify(params)}`,
    time: Date.now(),
  });

  saveCultivationState(state);
  return state;
}

/**
 * Xuất dữ liệu Sandbox ra chuỗi JSON
 */
export function exportSandboxJSON() {
  assertSandbox();
  const state = getCultivationState();
  return JSON.stringify(state, null, 2);
}

/**
 * Nhập dữ liệu JSON vào Sandbox
 */
export function importSandboxJSON(jsonStr) {
  assertSandbox();

  if (!jsonStr || typeof jsonStr !== 'string') {
    throw new Error('Dữ liệu JSON rỗng hoặc không đúng định dạng chuỗi.');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error('Cú pháp JSON không hợp lệ: ' + err.message);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Dữ liệu JSON phải là một đối tượng (Object) hợp lệ.');
  }

  parsed.logs = [
    {
      text: `🛠️ [ADMIN SANDBOX] Đã nạp dữ liệu từ file JSON bên ngoài.`,
      time: Date.now(),
    },
    ...(parsed.logs || []),
  ];

  saveCultivationState(parsed);
  return parsed;
}
