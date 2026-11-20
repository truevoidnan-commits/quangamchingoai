/**
 * KỊCH BẢN KIỂM THỬ ĐỒNG THỜI ĐA KẾT NỐI (CONCURRENT CLIENTS) TRÊN POSTGRESQL THẬT
 * File: scripts/test-postgres-concurrent-psql.mjs
 * Áp dụng: Chạy qua Node.js kết nối đến PostgreSQL Staging / Supabase Local thật
 * Biến môi trường: DATABASE_URL hoặc SUPABASE_DB_URL
 * TUYỆT ĐỐI KHÔNG CHẠY TRÊN DATABASE PRODUCTION!
 */

import assert from 'node:assert/strict';

const DB_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!DB_URL) {
  console.log('--------------------------------------------------------------------------');
  console.log('THÔNG BÁO: Chưa cấu hình biến môi trường DATABASE_URL hoặc SUPABASE_DB_URL.');
  console.log('Script này dùng để nghiệm thu kiểm thử concurrency đa kết nối trên PostgreSQL thật:');
  console.log('Cách chạy khi có Staging PostgreSQL:');
  console.log('  $env:DATABASE_URL="postgres://postgres:password@localhost:54322/postgres"');
  console.log('  node scripts/test-postgres-concurrent-psql.mjs');
  console.log('--------------------------------------------------------------------------');
  process.exit(0);
}

// Nếu có DB_URL, sử dụng dynamic import('pg') để kết nối đa client
let pg;
try {
  pg = await import('pg');
} catch (e) {
  console.error('Lỗi: Cần cài đặt gói "pg" để chạy kiểm thử đa kết nối: npm i pg');
  process.exit(1);
}

const { Client } = pg.default || pg;

async function runConcurrentOccTests() {
  console.log('Bắt đầu kiểm thử Concurrency đa kết nối trên PostgreSQL:', DB_URL.split('@')[1] || 'localhost');

  const client1 = new Client({ connectionString: DB_URL });
  const client2 = new Client({ connectionString: DB_URL });

  await client1.connect();
  await client2.connect();

  const testUserId = 'b0000000-0000-0000-0000-000000000001';

  try {
    // Dọn dẹp dữ liệu test cũ
    await client1.query('DELETE FROM public.cultivation_idempotency_log WHERE user_id = $1', [testUserId]);
    await client1.query('DELETE FROM public.cultivation WHERE user_id = $1', [testUserId]);

    // Thiết lập session auth cho cả 2 client
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

    const checkFinal = await client1.query('SELECT rev FROM public.cultivation WHERE user_id = $1', [testUserId]);
    assert.equal(checkFinal.rows[0].rev, '2', 'Cloud rev phải là 2');
    console.log('✓ Test 2 Passed: Lock FOR UPDATE bảo vệ thành công: đúng 1 máy lên rev 2, máy kia bị từ chối.');

    console.log('=== TOÀN BỘ KIỂM THỬ ĐA KẾT NỐI THẬT ĐÃ HOÀN TẤT THÀNH CÔNG ===');
  } finally {
    // Dọn dẹp dữ liệu test
    try {
      await client1.query('DELETE FROM public.cultivation_idempotency_log WHERE user_id = $1', [testUserId]);
      await client1.query('DELETE FROM public.cultivation WHERE user_id = $1', [testUserId]);
    } catch {}
    await client1.end();
    await client2.end();
  }
}

runConcurrentOccTests().catch(err => {
  console.error('LỖI KIỂM THỬ ĐỒNG THỜI POSTGRESQL:', err);
  process.exit(1);
});
