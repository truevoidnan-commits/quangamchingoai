/**
 * KỊCH BẢN KIỂM THỬ ĐỒNG THỜI ĐA KẾT NỐI (CONCURRENT CLIENTS) TRÊN POSTGRESQL THẬT
 * File: scripts/test-postgres-concurrent-psql.mjs
 * Áp dụng: Chạy qua Node.js kết nối đến PostgreSQL Staging / Supabase Local thật
 * Biến môi trường: DATABASE_URL hoặc SUPABASE_DB_URL, kết hợp TEST_ENVIRONMENT_IDENTIFIER
 *
 * TUYỆT ĐỐI KHÔNG CHẠY TRÊN DATABASE PRODUCTION!
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const DB_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!DB_URL) {
  console.log('--------------------------------------------------------------------------');
  console.log('THÔNG BÁO: Chưa cấu hình biến môi trường DATABASE_URL hoặc SUPABASE_DB_URL.');
  console.log('Script này dùng để nghiệm thu kiểm thử concurrency đa kết nối trên PostgreSQL thật:');
  console.log('Cách chạy khi có Staging / Supabase Local PostgreSQL:');
  console.log('  $env:DATABASE_URL="postgres://postgres:postgres@localhost:54322/postgres"');
  console.log('  $env:TEST_ENVIRONMENT_IDENTIFIER="staging-isolated"');
  console.log('  node scripts/test-postgres-concurrent-psql.mjs');
  console.log('--------------------------------------------------------------------------');
  process.exit(0);
}

// ------------------------------------------------------------------------------
// 1. KIỂM TRA BẢO VỆ AN TOÀN URL & YÊU CẦU ĐỊNH DANH MÔI TRƯỜNG
// ------------------------------------------------------------------------------
let parsedUrl;
try {
  parsedUrl = new URL(DB_URL);
} catch {
  console.error('LỖI: DATABASE_URL không phải là URL hợp lệ.');
  process.exit(1);
}

const testEnvId = process.env.TEST_ENVIRONMENT_IDENTIFIER || process.env.STAGING_ENV_ID;

if (!testEnvId) {
  console.error('========================================================================');
  console.error('LỖI AN TOÀN P1: Thiếu biến môi trường TEST_ENVIRONMENT_IDENTIFIER!');
  console.error('Quy tắc an toàn: Không coi hostname hay tên database là bằng chứng xác thực');
  console.error('môi trường production/staging. Bạn bắt buộc phải khai báo biến môi trường:');
  console.error('  TEST_ENVIRONMENT_IDENTIFIER="<định_danh_môi_trường_thử_nghiệm>"');
  console.error('Giá trị này phải khớp với định danh được cấu hình trong chính database.');
  console.error('========================================================================');
  process.exit(1);
}

const bannedKeywords = ['prod', 'production', 'live', 'pooler.supabase.com', 'aws-0'];
if (bannedKeywords.some(b => testEnvId.toLowerCase().includes(b))) {
  console.error('LỖI BẢO MẬT: TEST_ENVIRONMENT_IDENTIFIER chứa từ khóa cấm (production/live). Dừng khẩn cấp!');
  process.exit(1);
}

// ------------------------------------------------------------------------------
// 2. KHỞI TẠO CLIENT POSTGRESQL
// ------------------------------------------------------------------------------
let pg;
try {
  pg = await import('pg');
} catch (e) {
  console.error('Lỗi: Cần cài đặt gói "pg" để chạy kiểm thử đa kết nối: npm i pg');
  process.exit(1);
}

const { Client } = pg.default || pg;

async function runConcurrentOccTests() {
  console.log('--------------------------------------------------------------------------');
  console.log('BẮT ĐẦU KIỂM THỬ CONCURRENCY ĐA KẾT NỐI TRÊN POSTGRESQL');
  console.log(`Database Host: ${parsedUrl.hostname}:${parsedUrl.port || 5432}`);
  console.log(`Kỳ vọng định danh môi trường: "${testEnvId}"`);
  console.log('LƯU Ý: Script này chạy trực tiếp qua kết nối PostgreSQL và sử dụng set_config');
  console.log('để thiết lập session context role/jwt claim nhằm kiểm thử tính nguyên tử của');
  console.log('cơ chế khóa dòng FOR UPDATE và monotonic rev. Thao tác này KHÔNG tương đương');
  console.log('hoàn toàn với kiểm thử JWT thật qua Supabase Auth Gateway (GoTrue/Kong).');
  console.log('--------------------------------------------------------------------------');

  const client1 = new Client({ connectionString: DB_URL });
  const client2 = new Client({ connectionString: DB_URL });

  try {
    await client1.connect();
  } catch (err) {
    console.error('Lỗi kết nối client 1 đến PostgreSQL:', err.message);
    process.exit(1);
  }

  try {
    await client2.connect();
  } catch (err) {
    console.error('Lỗi kết nối client 2 đến PostgreSQL:', err.message);
    await client1.end().catch(() => {});
    process.exit(1);
  }

  // ----------------------------------------------------------------------------
  // 3. XÁC NHẬN ĐỊNH DANH MÔI TRƯỜNG QUA CHÍNH CẤU HÌNH DATABASE ĐÍCH (P1)
  // Tuyệt đối không thay đổi bất kỳ dữ liệu nào trước khi hoàn tất bước này!
  // ----------------------------------------------------------------------------
  try {
    const envCheck = await client1.query(`
      SELECT 
        current_setting('app.environment', true) AS setting_env,
        (SELECT value->>'identifier' FROM public.app_system_flags WHERE key = 'environment_identifier') AS flag_env_id,
        (SELECT value->>'environment' FROM public.app_system_flags WHERE key = 'environment') AS flag_env_name
    `);

    const dbConfiguredEnv = envCheck.rows[0]?.setting_env 
      || envCheck.rows[0]?.flag_env_id 
      || envCheck.rows[0]?.flag_env_name;

    if (!dbConfiguredEnv) {
      throw new Error(
        'Không tìm thấy định danh môi trường trong cấu hình của chính database đích!\n' +
        'Database thử nghiệm cô lập phải được cấu hình định danh môi trường qua:\n' +
        '  1. Setting PostgreSQL: current_setting(\'app.environment\')\n' +
        '  2. Hoặc bảng public.app_system_flags (key = \'environment_identifier\')\n' +
        'Không thể xác minh tính cô lập của database. Dừng khẩn cấp trước khi thay đổi dữ liệu!'
      );
    }

    if (dbConfiguredEnv !== testEnvId) {
      throw new Error(
        `Định danh môi trường trong database ("${dbConfiguredEnv}") KHÔNG KHỚP với ` +
        `TEST_ENVIRONMENT_IDENTIFIER ("${testEnvId}"). Dừng khẩn cấp!`
      );
    }

    if (bannedKeywords.some(b => dbConfiguredEnv.toLowerCase().includes(b))) {
      throw new Error(`Định danh cấu hình trong database ("${dbConfiguredEnv}") mang từ khóa production. Dừng khẩn cấp!`);
    }

    console.log(`✓ Đã xác thực thành công định danh môi trường thử nghiệm cô lập: "${dbConfiguredEnv}"`);

    // --------------------------------------------------------------------------
    // 4. KIỂM TRA CỜ MAINTENANCE DÙNG CHUNG CỦA STAGING (P1)
    // Nếu cờ đang bật, dừng kiểm thử với thông báo rõ ràng; tuyệt đối không tự ý tắt!
    // --------------------------------------------------------------------------
    const maintRes = await client1.query(
      "SELECT value FROM public.app_system_flags WHERE key = 'cultivation_maintenance'"
    );

    if (maintRes.rows.length > 0 && maintRes.rows[0].value?.enabled === true) {
      console.log('--------------------------------------------------------------------------');
      console.log('THÔNG BÁO DỪNG KIỂM THỬ: Hệ thống Staging đang ở chế độ bảo trì!');
      console.log(`Chi tiết cờ cultivation_maintenance: ${JSON.stringify(maintRes.rows[0].value)}`);
      console.log('Theo quy tắc an toàn P1: Tuyệt đối KHÔNG tự ý tắt hoặc ghi đè cờ bảo trì dùng chung của môi trường staging.');
      console.log('Dừng kiểm thử an toàn mà không làm gián đoạn trạng thái môi trường.');
      console.log('--------------------------------------------------------------------------');
      await client1.end().catch(() => {});
      await client2.end().catch(() => {});
      process.exit(0);
    }
  } catch (checkErr) {
    console.error('LỖI XÁC THỰC MÔI TRƯỜNG TRƯỚC KHI TEST:', checkErr.message);
    await client1.end().catch(() => {});
    await client2.end().catch(() => {});
    process.exit(1);
  }

  // ----------------------------------------------------------------------------
  // 5. CHUẨN BỊ TEST DATA: CHỈ THAO TÁC TRÊN UUID NGẪU NHIÊN DO LƯỢT TEST TẠO RA
  // ----------------------------------------------------------------------------
  const testUserId = crypto.randomUUID();
  console.log(`Tạo người dùng thử nghiệm ngẫu nhiên cô lập: ${testUserId}`);

  try {
    // Chỉ xóa dữ liệu liên quan đến đúng testUserId ngẫu nhiên này
    await client1.query('RESET ROLE');
    await client2.query('RESET ROLE');
    await client1.query('DELETE FROM public.cultivation_idempotency_log WHERE user_id = $1', [testUserId]);
    await client1.query('DELETE FROM public.cultivation WHERE user_id = $1', [testUserId]);

    // Thiết lập session auth cho cả 2 client độc lập
    await client1.query(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('role', 'authenticated', false)`, [testUserId]);
    await client2.query(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('role', 'authenticated', false)`, [testUserId]);

    // ------------------------------------------------------------------------
    // TEST 1: FIRST INSERT RACE (2 KẾT NỐI ĐỒNG THỜI GỬI expected_rev = 0)
    // ------------------------------------------------------------------------
    console.log('[Test 1] Chạy đồng thời 2 kết nối tạo bản ghi đầu tiên...');

    const [res1, res2] = await Promise.all([
      client1.query(`SELECT public.sync_cultivation_occ(0, '{"realm":"ngung_khi_1","totalExp":50}'::jsonb, 1000, 'dev_conn_1', 'req_concurrent_1') AS r`),
      client2.query(`SELECT public.sync_cultivation_occ(0, '{"realm":"ngung_khi_1","totalExp":60}'::jsonb, 1000, 'dev_conn_2', 'req_concurrent_2') AS r`),
    ]);

    const out1 = res1.rows[0].r;
    const out2 = res2.rows[0].r;

    const statuses = [out1.status, out2.status];
    assert.ok(statuses.includes('SUCCESS'), 'Phải có đúng 1 client thành công');
    assert.ok(statuses.includes('CONFLICT'), 'Client thứ 2 phải nhận CONFLICT');

    const winnerRev = out1.status === 'SUCCESS' ? out1.rev : out2.rev;
    assert.equal(winnerRev, 1, 'Bản ghi thành công phải có rev = 1');
    console.log('✓ Test 1 Passed: First insert race được PostgreSQL giải quyết chuẩn xác: đúng 1 máy thành công, 1 máy nhận CONFLICT');

    // ------------------------------------------------------------------------
    // TEST 2: CONCURRENT UPDATE RACE (2 KẾT NỐI ĐỒNG THỜI CÙNG GỬI expected_rev = 1)
    // ------------------------------------------------------------------------
    console.log('[Test 2] Chạy đồng thời 2 kết nối cùng nâng cấp từ rev = 1 lên rev = 2...');

    const [up1, up2] = await Promise.all([
      client1.query(`SELECT public.sync_cultivation_occ(1, '{"realm":"ngung_khi_2","totalExp":150}'::jsonb, 2000, 'dev_conn_1', 'req_concurrent_up1') AS r`),
      client2.query(`SELECT public.sync_cultivation_occ(1, '{"realm":"ngung_khi_2","totalExp":160}'::jsonb, 2000, 'dev_conn_2', 'req_concurrent_up2') AS r`),
    ]);

    const upOut1 = up1.rows[0].r;
    const upOut2 = up2.rows[0].r;

    const upStatuses = [upOut1.status, upOut2.status];
    assert.ok(upStatuses.includes('SUCCESS'), 'Phải có đúng 1 client thành công lên rev 2');
    assert.ok(upStatuses.includes('CONFLICT'), 'Client thứ 2 phải nhận CONFLICT');

    // Kiểm tra bản ghi cuối cùng trong database
    await client1.query('RESET ROLE');
    const checkFinal = await client1.query('SELECT rev FROM public.cultivation WHERE user_id = $1', [testUserId]);
    assert.equal(checkFinal.rows[0].rev, '2', 'Cloud rev phải là 2');
    console.log('✓ Test 2 Passed: Lock FOR UPDATE bảo vệ thành công: đúng 1 máy lên rev 2, máy kia bị từ chối.');

    console.log('=== TOÀN BỘ KIỂM THỬ ĐA KẾT NỐI THẬT ĐÃ HOÀN TẤT THÀNH CÔNG ===');
  } finally {
    // Luôn dọn dẹp an toàn: CHỈ XÓA ĐÚNG DỮ LIỆU CỦA testUserId ngẫu nhiên này
    try {
      await client1.query('RESET ROLE');
      await client1.query('DELETE FROM public.cultivation_idempotency_log WHERE user_id = $1', [testUserId]);
      await client1.query('DELETE FROM public.cultivation WHERE user_id = $1', [testUserId]);
      console.log(`✓ Đã dọn dẹp sạch sẽ test data của người dùng ngẫu nhiên: ${testUserId}`);
    } catch (cleanupErr) {
      console.warn('Lỗi dọn dẹp dữ liệu test:', cleanupErr.message);
    }
    await client1.end().catch(() => {});
    await client2.end().catch(() => {});
  }
}

runConcurrentOccTests().catch(err => {
  console.error('LỖI KIỂM THỬ ĐỒNG THỜI POSTGRESQL:', err);
  process.exit(1);
});
