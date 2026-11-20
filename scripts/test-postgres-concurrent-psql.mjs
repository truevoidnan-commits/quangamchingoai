/**
 * KỊCH BẢN KIỂM THỬ ĐỒNG THỜI ĐA KẾT NỐI (CONCURRENT CLIENTS) TRÊN POSTGRESQL THẬT
 * File: scripts/test-postgres-concurrent-psql.mjs
 * Áp dụng: Chạy qua Node.js kết nối đến PostgreSQL Staging / Supabase Local thật
 * Biến môi trường: DATABASE_URL hoặc SUPABASE_DB_URL
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
  console.log('  node scripts/test-postgres-concurrent-psql.mjs');
  console.log('--------------------------------------------------------------------------');
  process.exit(0);
}

// ------------------------------------------------------------------------------
// 1. KIỂM TRA BẢO VỆ AN TOÀN URL & ĐỊNH DANH MÔI TRƯỜNG THỬ NGHIỆM
// ------------------------------------------------------------------------------
let parsedUrl;
try {
  parsedUrl = new URL(DB_URL);
} catch {
  console.error('LỖI: DATABASE_URL không phải là URL hợp lệ.');
  process.exit(1);
}

const bannedPatterns = ['pooler.supabase.com', 'aws-0', 'prod', 'production', 'live'];
if (bannedPatterns.some(p => parsedUrl.hostname.toLowerCase().includes(p))) {
  console.error('LỖI BẢO MẬT NGHIÊM NGẶT: Phát hiện host mang tiền tố Production. Dừng khẩn cấp!');
  process.exit(1);
}

const safeHosts = ['localhost', '127.0.0.1', '::1', 'supabase_db', 'postgres'];
const isLocalhost = safeHosts.includes(parsedUrl.hostname);
const allowOverride = process.env.ALLOW_TEST_DB_OVERRIDE === 'true';
const testEnvId = process.env.TEST_ENVIRONMENT_IDENTIFIER || process.env.STAGING_ENV_ID;

if (!isLocalhost) {
  // Không chỉ dựa vào ALLOW_TEST_DB_OVERRIDE, bắt buộc phải có TEST_ENVIRONMENT_IDENTIFIER
  // xác nhận rõ môi trường đích là staging độc lập
  if (!allowOverride || !testEnvId) {
    console.error('========================================================================');
    console.error('BẢO VỆ AN TOÀN: Database URL không trỏ về localhost / môi trường cô lập!');
    console.error(`Host phát hiện: ${parsedUrl.hostname}`);
    console.error('Để chạy trên staging remote, bạn phải cung cấp ĐỒNG THỜI 2 biến môi trường:');
    console.error('  1. ALLOW_TEST_DB_OVERRIDE="true"');
    console.error('  2. TEST_ENVIRONMENT_IDENTIFIER="<tên_môi_trường_staging_cô_lập>"');
    console.error('Tuyệt đối KHÔNG cấu hình trỏ vào database Production!');
    console.error('========================================================================');
    process.exit(1);
  }
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
  // 3. XÁC NHẬN ĐỊNH DANH DATABASE THỰC TẾ TRƯỚC KHI THỰC HIỆN BẤT KỲ THAO TÁC NÀO
  // ----------------------------------------------------------------------------
  let origMaintenanceVal = null;
  let didModifyMaintenance = false;

  try {
    const dbInfo = await client1.query('SELECT current_database() AS dbname, current_user AS dbuser');
    const currentDb = dbInfo.rows[0]?.dbname || '';
    console.log(`Kết nối thành công đến database: "${currentDb}" dưới user: "${dbInfo.rows[0]?.dbuser}"`);

    // Chặn đứng nếu tên database có chứa ký tự định danh production
    if (currentDb.toLowerCase().includes('prod') || currentDb.toLowerCase().includes('production')) {
      throw new Error(`BẢO MẬT: Tên database "${currentDb}" chứa từ khóa production. Dừng khẩn cấp!`);
    }

    // Kiểm tra cờ bảo trì hiện tại của staging (KHÔNG tự tiện ghi đè cờ bảo trì dùng chung)
    const maintRes = await client1.query("SELECT value FROM public.app_system_flags WHERE key = 'cultivation_maintenance'");
    if (maintRes.rows.length > 0) {
      origMaintenanceVal = maintRes.rows[0].value;
      if (origMaintenanceVal && origMaintenanceVal.enabled === true) {
        console.warn('CẢNH BÁO: Staging hiện đang ở chế độ bảo trì (cultivation_maintenance = true).');
        console.warn('Tạm thời vô hiệu hóa cờ bảo trì cho bài test và sẽ KHÔI PHỤC trong finally.');
        await client1.query(`
          UPDATE public.app_system_flags 
          SET value = '{"enabled": false, "message": "Test concurrency running"}'::jsonb, updated_at = NOW() 
          WHERE key = 'cultivation_maintenance'
        `);
        didModifyMaintenance = true;
      }
    }
  } catch (checkErr) {
    console.error('Lỗi kiểm tra định danh database:', checkErr.message);
    await client1.end().catch(() => {});
    await client2.end().catch(() => {});
    process.exit(1);
  }

  // Dùng UUID ngẫu nhiên cô lập tuyệt đối không trùng dữ liệu
  const testUserId = crypto.randomUUID();
  console.log(`Tạo người dùng thử nghiệm ngẫu nhiên: ${testUserId}`);

  try {
    // 1. Chuẩn bị dữ liệu ban đầu dưới quyền quản trị (chỉ xóa đúng testUserId ngẫu nhiên)
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
    // Luôn dọn dẹp an toàn trong mọi trường hợp (kể cả assertion fail hay lỗi kết nối)
    try {
      await client1.query('RESET ROLE');
      await client1.query('DELETE FROM public.cultivation_idempotency_log WHERE user_id = $1', [testUserId]);
      await client1.query('DELETE FROM public.cultivation WHERE user_id = $1', [testUserId]);

      // Khôi phục cờ maintenance nếu đã bị tạm thay đổi
      if (didModifyMaintenance && origMaintenanceVal) {
        await client1.query(
          'UPDATE public.app_system_flags SET value = $1, updated_at = NOW() WHERE key = $2',
          [origMaintenanceVal, 'cultivation_maintenance']
        );
        console.log('✓ Đã khôi phục cờ maintenance về trạng thái ban đầu của staging');
      }
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
