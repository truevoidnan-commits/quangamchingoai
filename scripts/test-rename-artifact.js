import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';

import {
  SUPPRESSING_ARTIFACTS,
  getPalaceNameFromArtifact,
  getLinhTangNameFromDaoAnh,
  normalizeCultivationDisplayNames,
  TINH_TRUNG_ARTIFACT_POEM,
  TINH_TRUNG_ARTIFACT_DESC,
} from '../src/lib/cultivation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Nạp module daoAnhData.js an toàn trong môi trường Node.js:
// Mã nguồn thật trong src/lib/daoAnhData.js giữ nguyên 100% cú pháp chuẩn Vite (import.meta.glob, import không đuôi .js).
// Tại test runner của Node, ta đọc file và tạo bản sao tạm thời trong os.tmpdir() để nạp module thực thi mà KHÔNG thêm bất kỳ workaround nào vào production code.
const daoAnhSourcePath = path.join(rootDir, 'src', 'lib', 'daoAnhData.js');
const rawDaoAnhSource = fs.readFileSync(daoAnhSourcePath, 'utf8');

const assetHelperPath = path.join(rootDir, 'src', 'lib', 'assetHelper.js');
const assetHelperUrl = pathToFileURL(assetHelperPath).href;
const daoAnhFitPath = path.join(rootDir, 'src', 'lib', 'daoAnhFit.generated.js');
const daoAnhFitUrl = pathToFileURL(daoAnhFitPath).href;
const daoAnhBBoxPath = path.join(rootDir, 'src', 'lib', 'daoAnhBBox.generated.js');
const daoAnhBBoxUrl = pathToFileURL(daoAnhBBoxPath).href;

const transformedSource = rawDaoAnhSource
  .replace(/const daoAnh\w+Modules = import\.meta\.glob\([^)]*\);/g, (m) => m.split('=')[0] + '= {};')
  .replace(/from\s+['"]\.\/assetHelper['"]/g, `from '${assetHelperUrl}'`)
  .replace(/from\s+['"]\.\/daoAnhFit\.generated\.js['"]/g, `from '${daoAnhFitUrl}'`)
  .replace(/from\s+['"]\.\/daoAnhBBox\.generated\.js['"]/g, `from '${daoAnhBBoxUrl}'`);

const tempFile = path.join(os.tmpdir(), `daoAnhData_test_${crypto.randomBytes(8).toString('hex')}.mjs`);
fs.writeFileSync(tempFile, transformedSource, 'utf8');

let daoAnhMod;
try {
  daoAnhMod = await import(pathToFileURL(tempFile).href);
} finally {
  try {
    fs.unlinkSync(tempFile);
  } catch {}
}

const {
  DAO_ANH_LIST,
  TINH_TRUNG_LAO_NGUYET_POEM,
  TINH_TRUNG_LAO_NGUYET_DESC,
} = daoAnhMod;

console.log('=== BẮT ĐẦU KIỂM THỬ ĐỔI TÊN THẦN VẬT "TỈNH TRUNG LAO NGUYỆT" ===\n');

let passedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    passedTests++;
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name} THẤT BẠI:`, err);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 1. Kiểm tra SUPPRESSING_ARTIFACTS
// ---------------------------------------------------------------------------
runTest('1. SUPPRESSING_ARTIFACTS: tên mới, ID cũ, ảnh/icon/tier nguyên vẹn', () => {
  const art = SUPPRESSING_ARTIFACTS.find(a => a.id === 'hong_tran_ngung_vong_anh_hao_nguyet');
  assert.ok(art, 'Vật phẩm ID hong_tran_ngung_vong_anh_hao_nguyet phải tồn tại');

  assert.strictEqual(art.id, 'hong_tran_ngung_vong_anh_hao_nguyet', 'ID phải giữ nguyên');
  assert.strictEqual(art.name, 'Tỉnh Trung Lao Nguyệt', 'Tên đầy đủ phải là "Tỉnh Trung Lao Nguyệt"');
  assert.strictEqual(art.shortName, 'Tỉnh Trung Nguyệt', 'Tên rút gọn phải là "Tỉnh Trung Nguyệt"');
  assert.strictEqual(art.desc, 'Dị tượng vô thượng tỉnh trung lao nguyệt, vớt vầng trăng sáng từ đáy giếng sâu, ánh trăng chiếu rọi thế gian xua tan mọi ma chướng cõi phàm.');
  assert.strictEqual(art.poem, 'Tỉnh trung lao nguyệt, hạo nguyệt chiếu chư thiên.');
  assert.strictEqual(art.tier, 'than_pham', 'Tier phải giữ nguyên than_pham');
  assert.strictEqual(art.type, 'Vô Thượng Dị Tượng', 'Type phải giữ nguyên');
  assert.strictEqual(art.icon, '🌕', 'Icon phải giữ nguyên');
  assert.strictEqual(art.color, '#ef4444', 'Color phải giữ nguyên');

  // Kiểm tra hằng số tách riêng
  assert.strictEqual(TINH_TRUNG_ARTIFACT_POEM, 'Tỉnh trung lao nguyệt, hạo nguyệt chiếu chư thiên.');
  assert.strictEqual(TINH_TRUNG_ARTIFACT_DESC, 'Dị tượng vô thượng tỉnh trung lao nguyệt, vớt vầng trăng sáng từ đáy giếng sâu, ánh trăng chiếu rọi thế gian xua tan mọi ma chướng cõi phàm.');
});

// ---------------------------------------------------------------------------
// 2. Kiểm tra tên Cung từ getPalaceNameFromArtifact
// ---------------------------------------------------------------------------
runTest('2. getPalaceNameFromArtifact: trả về "Tỉnh Trung Lao Nguyệt Cung"', () => {
  const art = SUPPRESSING_ARTIFACTS.find(a => a.id === 'hong_tran_ngung_vong_anh_hao_nguyet');
  const palaceName = getPalaceNameFromArtifact(art);
  assert.strictEqual(palaceName, 'Tỉnh Trung Lao Nguyệt Cung', 'Tên Cung phải là "Tỉnh Trung Lao Nguyệt Cung"');
});

// ---------------------------------------------------------------------------
// 3. Kiểm tra DAO_ANH_LIST
// ---------------------------------------------------------------------------
runTest('3. DAO_ANH_LIST: Đạo Anh có tên mới, ID cũ, ảnh/skill nguyên vẹn', () => {
  const da = DAO_ANH_LIST.find(d => d.id === 'da_hong_tran_ngung_vong_anh_hao_nguyet');
  assert.ok(da, 'Đạo Anh da_hong_tran_ngung_vong_anh_hao_nguyet phải tồn tại');

  assert.strictEqual(da.id, 'da_hong_tran_ngung_vong_anh_hao_nguyet', 'ID Đạo Anh phải giữ nguyên');
  assert.strictEqual(da.sourceId, 'hong_tran_ngung_vong_anh_hao_nguyet', 'sourceId phải giữ nguyên');
  assert.strictEqual(da.name, 'Tỉnh Trung Lao Nguyệt Đạo Anh', 'Tên Đạo Anh phải là "Tỉnh Trung Lao Nguyệt Đạo Anh"');
  assert.strictEqual(da.title, 'Tỉnh Trung Lao Nguyệt', 'Title Đạo Anh phải là "Tỉnh Trung Lao Nguyệt"');
  assert.strictEqual(da.poem, 'Tỉnh trung lao nguyệt, hạo nguyệt chiếu chư thiên.');
  assert.strictEqual(da.desc, 'Đạo Anh ngưng tụ từ dị tượng vô thượng tỉnh trung lao nguyệt, vầng trăng vằng vặc vớt lên từ đáy giếng, xua tan mọi tà niệm ma chướng cõi phàm.');
  assert.strictEqual(da.tribulationForm, 'Tỉnh Trung Tiên Nguyệt Đạo Thể', 'tribulationForm phải là "Tỉnh Trung Tiên Nguyệt Đạo Thể"');
  assert.strictEqual(da.skillName, 'Hạo Nguyệt Tịnh Hóa Quang', 'skillName phải giữ nguyên');
  assert.strictEqual(da.image, '/images/dao_anh/hong_tran_ngung_vong_anh_hao_nguyet.png', 'Đường dẫn ảnh chính phải giữ nguyên');
  assert.ok(da.evolutionImages.includes('/images/dao_anh/hong_tran_ngung_vong_anh_hao_nguyet.png'), 'evolutionImages phải giữ nguyên đường dẫn');

  // Kiểm tra hằng số tách riêng trong daoAnhData
  assert.strictEqual(TINH_TRUNG_LAO_NGUYET_POEM, 'Tỉnh trung lao nguyệt, hạo nguyệt chiếu chư thiên.');
  assert.strictEqual(TINH_TRUNG_LAO_NGUYET_DESC, 'Đạo Anh ngưng tụ từ dị tượng vô thượng tỉnh trung lao nguyệt, vầng trăng vằng vặc vớt lên từ đáy giếng, xua tan mọi tà niệm ma chướng cõi phàm.');
});

// ---------------------------------------------------------------------------
// 4. Kiểm tra getLinhTangNameFromDaoAnh
// ---------------------------------------------------------------------------
runTest('4. getLinhTangNameFromDaoAnh: trả về "Tỉnh Trung" cho cả tên mới và tên cũ (backward compatibility)', () => {
  // Tên mới
  assert.strictEqual(getLinhTangNameFromDaoAnh({ name: 'Tỉnh Trung Lao Nguyệt Đạo Anh' }, 0), 'Tỉnh Trung');
  assert.strictEqual(getLinhTangNameFromDaoAnh({ palaceName: 'Tỉnh Trung Lao Nguyệt Cung' }, 0), 'Tỉnh Trung');
  assert.strictEqual(getLinhTangNameFromDaoAnh({ name: 'Tỉnh Trung Lao Nguyệt' }, 0), 'Tỉnh Trung');
  assert.strictEqual(getLinhTangNameFromDaoAnh({ name: 'Đạo Anh [Tỉnh Trung Lao Nguyệt]' }, 0), 'Tỉnh Trung');

  // Tương thích ngược tên cũ
  assert.strictEqual(getLinhTangNameFromDaoAnh({ name: 'Hồng Trần Hạo Nguyệt Đạo Anh' }, 0), 'Tỉnh Trung');
  assert.strictEqual(getLinhTangNameFromDaoAnh({ name: 'Hồng Trần Đạo Anh' }, 0), 'Tỉnh Trung');
  assert.strictEqual(getLinhTangNameFromDaoAnh({ palaceName: 'Hồng Trần Hạo Nguyệt Cung' }, 0), 'Tỉnh Trung');
  assert.strictEqual(getLinhTangNameFromDaoAnh({ name: 'Ánh Hảo Nguyệt Đạo Anh' }, 0), 'Tỉnh Trung');

  // Đảm bảo không nuốt nhầm các Đạo Anh khác
  assert.strictEqual(getLinhTangNameFromDaoAnh({ name: 'Thái Cổ Thần Long Đạo Anh' }, 0), 'Thần Long');
  assert.strictEqual(getLinhTangNameFromDaoAnh({ name: 'Chí Tôn Đế Kiếm Đạo Anh' }, 0), 'Kiếm Thai');
  assert.strictEqual(getLinhTangNameFromDaoAnh({ name: 'Côn Bằng Tiên Pháp Đạo Anh' }, 0), 'Côn Bằng');
  assert.strictEqual(getLinhTangNameFromDaoAnh({ name: 'Tam Thu Đao Đạo Anh' }, 0), 'Tam Thu');
});

// ---------------------------------------------------------------------------
// 5. Kiểm tra Chuẩn hóa dữ liệu đã lưu (State Normalization)
// ---------------------------------------------------------------------------
runTest('5. Chuẩn hóa state mẫu có chuỗi cũ: đổi chuỗi, giữ nguyên ID/exp/_rev/_updatedAt, idempotent', () => {
  const sampleState = {
    _rev: 42,
    _updatedAt: 1718000000000,
    realm: 'linh_tang',
    totalExp: 987654,
    linhTangs: [
      {
        id: 1,
        name: 'Hồng Trần Bí Tàng',
        originName: 'Hồng Trần',
        sourceDaoAnhName: 'Hồng Trần Hạo Nguyệt Đạo Anh',
        thienDaoName: 'Hồng Trần Thiên Đạo',
        exp: 50000,
        maxExp: 50000,
        hasThienDao: true,
      },
      {
        id: 2,
        name: 'Hồng Trần Thần Tàng',
        originName: 'Hồng Trần',
        sourceDaoAnhName: 'Hồng Trần Đạo Anh',
        thienDaoName: 'Hồng Trần Thiên Đạo',
        exp: 30000,
        maxExp: 50000,
        hasThienDao: false,
      },
      {
        id: 3,
        name: 'Thần Long Bí Tàng',
        originName: 'Thần Long',
        sourceDaoAnhName: 'Thần Long Đạo Anh',
        thienDaoName: 'Thần Long Thiên Đạo',
        exp: 10000,
        maxExp: 50000,
        hasThienDao: false,
      }
    ],
    daoAnhs: [
      {
        id: 'da_hong_tran_ngung_vong_anh_hao_nguyet',
        sourceId: 'hong_tran_ngung_vong_anh_hao_nguyet',
        name: 'Hồng Trần Hạo Nguyệt Đạo Anh',
        title: 'Hồng Trần Ngưng Vọng Hạo Nguyệt',
        palaceName: 'Hồng Trần Hạo Nguyệt Cung',
        tribulationForm: 'Hồng Trần Tiên Hạo Nguyệt Đạo Thể',
        element: 'Hồng Trần Hạo Nguyệt Thần Thể',
        poem: 'Hồng trần ngưng vọng, hạo nguyệt chiếu chư thiên.',
        desc: 'Đạo Anh ngưng tụ từ dị tượng vô thượng hồng trần ngưng vọng ánh trăng vằng vặc, xua tan mọi tà niệm ma chướng cõi phàm.',
        currentKiep: 3,
        currentExp: 45000,
      }
    ],
    palaceAnchors: {
      '0': {
        id: 'hong_tran_ngung_vong_anh_hao_nguyet',
        name: 'Hồng Trần Ngưng Vọng Ánh Hạo Nguyệt',
        shortName: 'Hồng Trần Hạo Nguyệt',
        palaceName: 'Hồng Trần Hạo Nguyệt Cung',
        poem: 'Hồng trần ngưng vọng, hạo nguyệt chiếu chư thiên.',
        desc: 'Dị tượng vô thượng hồng trần ngưng vọng trăng sáng rực rỡ, ánh trăng chiếu rọi thế gian xua tan mọi ma chướng cõi phàm.',
      }
    },
    inventoryArtifacts: [
      {
        id: 'hong_tran_ngung_vong_anh_hao_nguyet',
        name: 'Hồng Trần Ngưng Vọng Ánh Hạo Nguyệt',
        shortName: 'Hồng Trần Hạo Nguyệt',
      }
    ]
  };

  // Bản chụp trước chuẩn hóa
  const prevRev = sampleState._rev;
  const prevUpdatedAt = sampleState._updatedAt;
  const prevExp = sampleState.totalExp;

  // Chạy chuẩn hóa lần 1
  normalizeCultivationDisplayNames(sampleState);

  // 1. Kiểm tra _rev, _updatedAt, exp không đổi
  assert.strictEqual(sampleState._rev, prevRev, '_rev tuyệt đối KHÔNG được tăng');
  assert.strictEqual(sampleState._updatedAt, prevUpdatedAt, '_updatedAt tuyệt đối KHÔNG được đổi');
  assert.strictEqual(sampleState.totalExp, prevExp, 'totalExp không được đổi');

  // 2. Kiểm tra linhTangs[0]
  const lt0 = sampleState.linhTangs[0];
  assert.strictEqual(lt0.name, 'Tỉnh Trung Bí Tàng');
  assert.strictEqual(lt0.originName, 'Tỉnh Trung');
  assert.strictEqual(lt0.sourceDaoAnhName, 'Tỉnh Trung Lao Nguyệt Đạo Anh');
  assert.strictEqual(lt0.thienDaoName, 'Tỉnh Trung Thiên Đạo');
  assert.strictEqual(lt0.exp, 50000);
  assert.strictEqual(lt0.id, 1);

  // 3. Kiểm tra linhTangs[1]
  const lt1 = sampleState.linhTangs[1];
  assert.strictEqual(lt1.name, 'Tỉnh Trung Thần Tàng');
  assert.strictEqual(lt1.originName, 'Tỉnh Trung');
  assert.strictEqual(lt1.sourceDaoAnhName, 'Tỉnh Trung Lao Nguyệt Đạo Anh');
  assert.strictEqual(lt1.thienDaoName, 'Tỉnh Trung Thiên Đạo');

  // 4. Kiểm tra linhTangs[2] không bị ảnh hưởng
  const lt2 = sampleState.linhTangs[2];
  assert.strictEqual(lt2.name, 'Thần Long Bí Tàng');
  assert.strictEqual(lt2.originName, 'Thần Long');

  // 5. Kiểm tra daoAnhs[0]
  const da0 = sampleState.daoAnhs[0];
  assert.strictEqual(da0.id, 'da_hong_tran_ngung_vong_anh_hao_nguyet', 'ID Đạo Anh không đổi');
  assert.strictEqual(da0.sourceId, 'hong_tran_ngung_vong_anh_hao_nguyet', 'sourceId không đổi');
  assert.strictEqual(da0.name, 'Tỉnh Trung Lao Nguyệt Đạo Anh');
  assert.strictEqual(da0.title, 'Tỉnh Trung Lao Nguyệt');
  assert.strictEqual(da0.palaceName, 'Tỉnh Trung Lao Nguyệt Cung');
  assert.strictEqual(da0.tribulationForm, 'Tỉnh Trung Tiên Nguyệt Đạo Thể');
  assert.strictEqual(da0.element, 'Tỉnh Trung Nguyệt Thần Thể');
  assert.strictEqual(da0.poem, 'Tỉnh trung lao nguyệt, hạo nguyệt chiếu chư thiên.');
  assert.strictEqual(da0.desc, 'Đạo Anh ngưng tụ từ dị tượng vô thượng tỉnh trung lao nguyệt, vầng trăng vằng vặc vớt lên từ đáy giếng, xua tan mọi tà niệm ma chướng cõi phàm.');
  assert.strictEqual(da0.currentKiep, 3);
  assert.strictEqual(da0.currentExp, 45000);

  // 6. Kiểm tra palaceAnchors
  const anchor0 = sampleState.palaceAnchors['0'];
  assert.strictEqual(anchor0.id, 'hong_tran_ngung_vong_anh_hao_nguyet');
  assert.strictEqual(anchor0.name, 'Tỉnh Trung Lao Nguyệt');
  assert.strictEqual(anchor0.shortName, 'Tỉnh Trung Nguyệt');
  assert.strictEqual(anchor0.palaceName, 'Tỉnh Trung Lao Nguyệt Cung');
  assert.strictEqual(anchor0.poem, 'Tỉnh trung lao nguyệt, hạo nguyệt chiếu chư thiên.');
  assert.strictEqual(anchor0.desc, 'Dị tượng vô thượng tỉnh trung lao nguyệt, vớt vầng trăng sáng từ đáy giếng sâu, ánh trăng chiếu rọi thế gian xua tan mọi ma chướng cõi phàm.');

  // 7. Kiểm tra inventoryArtifacts
  const invArt = sampleState.inventoryArtifacts[0];
  assert.strictEqual(invArt.id, 'hong_tran_ngung_vong_anh_hao_nguyet');
  assert.strictEqual(invArt.name, 'Tỉnh Trung Lao Nguyệt');
  assert.strictEqual(invArt.shortName, 'Tỉnh Trung Nguyệt');

  // 8. Chạy chuẩn hóa lần 2 (IDEMPOTENT CHECK)
  const jsonAfterFirst = JSON.stringify(sampleState);
  normalizeCultivationDisplayNames(sampleState);
  const jsonAfterSecond = JSON.stringify(sampleState);
  assert.strictEqual(jsonAfterSecond, jsonAfterFirst, 'Chuẩn hóa lần 2 phải là idempotent hoàn toàn, không thay đổi gì');
  assert.strictEqual(sampleState._rev, prevRev);
  assert.strictEqual(sampleState._updatedAt, prevUpdatedAt);
});

// ---------------------------------------------------------------------------
// 6. Kiểm tra state không có tên cũ
// ---------------------------------------------------------------------------
runTest('6. State không chứa chuỗi cũ: giữ nguyên 100%', () => {
  const cleanState = {
    _rev: 7,
    _updatedAt: 1719000000000,
    linhTangs: [
      { id: 1, name: 'Tỉnh Trung Bí Tàng', originName: 'Tỉnh Trung', sourceDaoAnhName: 'Tỉnh Trung Lao Nguyệt Đạo Anh' },
      { id: 2, name: 'Kiếm Thai Bí Tàng', originName: 'Kiếm Thai', sourceDaoAnhName: 'Đế Kiếm Đạo Anh' }
    ]
  };

  const beforeJson = JSON.stringify(cleanState);
  normalizeCultivationDisplayNames(cleanState);
  const afterJson = JSON.stringify(cleanState);

  assert.strictEqual(afterJson, beforeJson, 'State sạch không được bị biến đổi gì');
});

// ---------------------------------------------------------------------------
// 7. Quét repo kiểm tra không còn 'Hồng Trần Ngưng Vọng' / 'Hồng Trần Hạo Nguyệt'
//    ngoại trừ các vị trí chuẩn hóa / tương thích ngược được phép
// ---------------------------------------------------------------------------
runTest('7. Quét src/ không còn chuỗi cũ ngoài logic chuẩn hóa tương thích', () => {
  const srcDir = path.join(rootDir, 'src');

  function scanDir(dir, results = []) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      const fullPath = path.join(dir, f);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath, results);
      } else if (/\.(js|jsx|ts|tsx)$/.test(f)) {
        results.push(fullPath);
      }
    }
    return results;
  }

  const allFiles = scanDir(srcDir);
  const forbiddenPhrases = [
    'Hồng Trần Ngưng Vọng',
    'Hồng Trần Hạo Nguyệt',
  ];

  const unexpectedOccurrences = [];

  for (const file of allFiles) {
    const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((line, lineIdx) => {
      for (const phrase of forbiddenPhrases) {
        if (line.includes(phrase)) {
          // Chỉ cho phép xuất hiện trong hàm normalizeCultivationDisplayNames của src/lib/cultivation.js
          const isAllowedCultivationMigration = relPath === 'src/lib/cultivation.js' && lineIdx >= 820 && lineIdx <= 980;
          if (!isAllowedCultivationMigration) {
            unexpectedOccurrences.push({
              file: relPath,
              line: lineIdx + 1,
              phrase,
              content: line.trim()
            });
          }
        }
      }
    });
  }

  assert.strictEqual(
    unexpectedOccurrences.length,
    0,
    `Tìm thấy chuỗi cũ chưa xử lý: ${JSON.stringify(unexpectedOccurrences, null, 2)}`
  );
});

console.log(`\n🎉 TOÀN BỘ ${passedTests} BÀI KIỂM THỬ ĐỔI TÊN THẦN VẬT ĐÃ VƯỢT QUA XUẤT SẮC!`);
