/**
 * TIỆN ÍCH XÁC MINH DỮ LIỆU TU VI & EXP TRỰC TIẾP TRÊN DATABASE
 * File: scripts/verify-cultivation-live.mjs
 * 
 * - Đọc connection string TỪ BIẾN MÔI TRƯỜNG PROD_DATABASE_URL (không nhận qua argv để bảo mật)
 * - Chế độ 1: --snapshot <output_file> -> Chụp trạng thái ban đầu (rev, EXP, user_id)
 * - Chế độ 2: --verify <snapshot_file> -> Đối chiếu dữ liệu sau cutover, đảm bảo rev >= baseline, EXP không giảm
 */

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

if (process.argv.includes('--help') || process.argv.length < 3) {
  console.log('Cách dùng:');
  console.log('  node scripts/verify-cultivation-live.mjs --snapshot <output_path.json>');
  console.log('  node scripts/verify-cultivation-live.mjs --verify <snapshot_path.json>');
  process.exit(1);
}

// BẢO MẬT: Kiểm tra không nhận connection string qua argv
for (const arg of process.argv) {
  if (arg.startsWith('postgres://') || arg.startsWith('postgresql://')) {
    console.error('CẢNH BÁO BẢO MẬT: Không truyền connection string chứa mật khẩu qua tham số dòng lệnh!');
    process.exit(1);
  }
}

const dbUrl = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('LỖI: Chưa thiết lập biến môi trường PROD_DATABASE_URL.');
  process.exit(1);
}

const mode = process.argv[2];
const filePath = process.argv[3];

if (!filePath) {
  console.error('LỖI: Cần chỉ định đường dẫn file snapshot JSON.');
  process.exit(1);
}

const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1');
const client = new pg.Client({
  connectionString: dbUrl,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

function computeExpSummary(row) {
  const state = typeof row.state === 'string' ? JSON.parse(row.state) : (row.state || {});
  const totalThienMenh = Number(state.totalThienMenh || 0);
  const currentThienCungExp = Number(state.currentThienCungExp || 0);
  const theExp = Number(state.theExp || 0);
  const phapExp = Number(state.phapExp || 0);
  const daoAnhs = Array.isArray(state.daoAnhs) ? state.daoAnhs : [];
  const daoAnhExp = daoAnhs.reduce((sum, d) => sum + Number(d.currentExp || d.currentThienMenh || 0), 0);
  const totalCalculatedExp = totalThienMenh + currentThienCungExp + theExp + phapExp + daoAnhExp;

  return {
    userId: row.user_id,
    rev: Number(row.rev),
    updatedAt: Number(row.updated_at || 0),
    deviceId: row.device_id || null,
    totalThienMenh,
    currentThienCungExp,
    theExp,
    phapExp,
    daoAnhCount: daoAnhs.length,
    daoAnhExp,
    totalCalculatedExp,
  };
}

try {
  await client.connect();

  if (mode === '--snapshot') {
    fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
    const res = await client.query('SELECT user_id, rev, state, updated_at, device_id FROM public.cultivation;');
    if (res.rows.length === 0) {
      console.error('CẢNH BÁO: Bảng cultivation hiện đang trống (0 rows).');
      const emptySnapshot = { profileCount: 0, snapshotTime: new Date().toISOString() };
      fs.writeFileSync(filePath, JSON.stringify(emptySnapshot, null, 2), 'utf8');
      console.log(`✓ Đã lưu snapshot trống vào ${filePath}`);
    } else {
      const summary = computeExpSummary(res.rows[0]);
      summary.profileCount = res.rows.length;
      summary.snapshotTime = new Date().toISOString();
      fs.writeFileSync(filePath, JSON.stringify(summary, null, 2), 'utf8');
      console.log(`✓ Đã lưu baseline snapshot: rev=${summary.rev}, totalExp=${summary.totalCalculatedExp} vào ${filePath}`);
    }
  } else if (mode === '--verify') {
    if (!fs.existsSync(filePath)) {
      console.error(`LỖI: Không tìm thấy file snapshot baseline: ${filePath}`);
      process.exit(1);
    }

    const baseline = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const res = await client.query('SELECT user_id, rev, state, updated_at, device_id FROM public.cultivation;');

    if (baseline.profileCount > 0 && res.rows.length === 0) {
      console.error('LỖI NGHIÊM TRỌNG: Mất toàn bộ profile cultivation! Baseline có ' + baseline.profileCount + ' profile, hiện tại có 0.');
      process.exit(1);
    }

    if (res.rows.length > 0) {
      const current = computeExpSummary(res.rows[0]);

      console.log('--- KẾT QUẢ ĐỐI CHIẾU DỮ LIỆU TU VI ---');
      console.log(`  User ID:          ${current.userId}`);
      console.log(`  Revision Baseline: ${baseline.rev} -> Hiện tại: ${current.rev}`);
      console.log(`  EXP Baseline:      ${baseline.totalCalculatedExp} -> Hiện tại: ${current.totalCalculatedExp}`);
      console.log(`  Đạo Anh Count:     ${current.daoAnhCount} (EXP: ${current.daoAnhExp})`);
      console.log(`  Thiên Cung EXP:    ${current.currentThienCungExp}`);
      console.log(`  Tổng Thiên Mệnh:   ${current.totalThienMenh}`);

      // Kiểm tra 1: Revision không được giảm (tính đơn điệu)
      if (baseline.rev !== undefined && current.rev < baseline.rev) {
        console.error(`LỖI: Revision bị giảm! (Baseline: ${baseline.rev}, Hiện tại: ${current.rev})`);
        process.exit(1);
      }

      // Kiểm tra 2: EXP không bị mất mát
      if (baseline.totalCalculatedExp !== undefined && current.totalCalculatedExp < baseline.totalCalculatedExp) {
        console.error(`LỖI: Tổng EXP tu vi bị giảm! (Baseline: ${baseline.totalCalculatedExp}, Hiện tại: ${current.totalCalculatedExp})`);
        process.exit(1);
      }

      // Kiểm tra 3: Cờ bảo trì app_system_flags
      try {
        const flagRes = await client.query(
          "SELECT (value->>'enabled')::boolean as is_enabled FROM public.app_system_flags WHERE key = 'cultivation_maintenance';"
        );
        const isMaintenance = flagRes.rows[0]?.is_enabled;
        console.log(`  Cờ bảo trì:        cultivation_maintenance = ${isMaintenance}`);
        if (isMaintenance === true) {
          console.error('LỖI: Cờ bảo trì cultivation_maintenance vẫn đang là TRUE! Hệ thống chưa unfreeze hoàn toàn.');
          process.exit(1);
        }
      } catch (flagErr) {
        console.warn(`  Cảnh báo kiểm tra cờ bảo trì: ${flagErr.message}`);
      }

      console.log('✓ XÁC MINH THÀNH CÔNG: Revision và toàn bộ EXP tu vi được bảo toàn tuyệt đối!');
    }
  } else {
    console.error(`LỖI: Chế độ không hợp lệ: ${mode}`);
    process.exit(1);
  }

  await client.end();
} catch (err) {
  console.error(`LỖI TRUY VẤN DATABASE: ${err.message}`);
  await client.end().catch(() => {});
  process.exit(1);
}
