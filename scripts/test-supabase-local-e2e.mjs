/**
 * BỘ KIỂM THỬ TÍCH HỢP TOÀN DIỆN TRÊN SUPABASE LOCAL THẬT
 * File: scripts/test-supabase-local-e2e.mjs
 * 
 * Kiểm thử:
 * 1. Supabase Auth Local: Đăng ký & lấy JWT thật qua GoTrue
 * 2. PostgREST API với JWT thật
 * 3. Quyền ghi Stage A (Direct write & RPC đều hoạt động)
 * 4. Concurrency & Idempotency qua RPC trên PostgreSQL thật
 * 5. Cutover Stage B (Khóa direct upsert nhưng RPC OCC vẫn hoạt động)
 * 6. Maintenance Mode (Trả về SYNC_PAUSED, direct write vẫn bị chặn)
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const { Client } = pg;

async function runLocalE2ETests() {
  console.log('==========================================================================');
  console.log('BẮT ĐẦU KIỂM THỬ SUPABASE LOCAL E2E VỚI JWT THẬT & POSTGREST API');
  console.log(`Supabase Gateway: ${SUPABASE_URL}`);
  console.log(`PostgreSQL: ${DB_URL.replace(/:[^:@]+@/, ':***@')}`);
  console.log('==========================================================================');

  const pgClient = new Client({ connectionString: DB_URL });
  await pgClient.connect();

  let testUserId = null;
  let authToken = null;

  try {
    // --------------------------------------------------------------------------
    // 1. TẠO TÀI KHOẢN THỬ NGHIỆM VÀ NHẬN JWT THẬT TỪ SUPABASE AUTH (GOTRUE)
    // --------------------------------------------------------------------------
    console.log('\n[1/6] Tạo tài khoản thử nghiệm trên Supabase Auth Local...');
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const testEmail = `test_occ_${randomSuffix}@thien-co-lau.local`;
    const testPassword = `TestPass_${randomSuffix}!123`;

    const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });

    const signupData = await signupRes.json();
    assert.equal(signupRes.status, 200, `Signup failed: ${JSON.stringify(signupData)}`);
    testUserId = signupData.user?.id;
    authToken = signupData.access_token || signupData.session?.access_token;

    // Nếu email confirmation bật trên local, login trực tiếp qua admin API để lấy token
    if (!authToken) {
      const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'apikey': ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: testEmail, password: testPassword }),
      });
      const loginData = await loginRes.json();
      authToken = loginData.access_token;
    }

    assert.ok(testUserId, 'Phải có user.id');
    assert.ok(authToken, 'Phải có access_token (JWT thật từ GoTrue)');
    console.log(`✓ Tạo user thành công: ${testUserId} (${testEmail})`);
    console.log(`✓ Nhận JWT thật từ GoTrue (Header length: ${authToken.split('.')[0].length})`);

    // --------------------------------------------------------------------------
    // 2. KIỂM THỬ GIAI ĐOẠN A: DIRECT WRITE & RPC OCC QUA POSTGREST VỚI JWT THẬT
    // --------------------------------------------------------------------------
    console.log('\n[2/6] Kiểm thử Giai đoạn A qua PostgREST REST API...');

    // Đảm bảo cờ maintenance đang tắt
    await pgClient.query(`
      UPDATE public.app_system_flags 
      SET value = '{"enabled": false, "message": "Hoạt động bình thường"}'::jsonb, updated_at = NOW() 
      WHERE key = 'cultivation_maintenance';
    `);

    // Test 2.1: First insert qua RPC sync_cultivation_occ
    const rpcRes1 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sync_cultivation_occ`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_expected_rev: 0,
        p_state: { realm: 'ngung_khi_1', totalExp: 100 },
        p_updated_at: 1700000000,
        p_device_id: 'device_pc_test',
        p_idempotency_key: `key_test_${randomSuffix}_1`,
      }),
    });

    const rpcData1 = await rpcRes1.json();
    assert.equal(rpcRes1.status, 200, `RPC 1 failed: ${JSON.stringify(rpcData1)}`);
    assert.equal(rpcData1.status, 'SUCCESS', 'RPC first insert phải trả về SUCCESS');
    assert.equal(rpcData1.rev, 1, 'Rev đầu tiên phải là 1');
    console.log('✓ Test 2.1 Passed: RPC first insert với JWT thật thành công rev = 1');

    // Test 2.2: Stale write qua RPC (expected_rev = 0 khi Cloud đã là 1) -> CONFLICT
    const rpcRes2 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sync_cultivation_occ`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_expected_rev: 0,
        p_state: { realm: 'ngung_khi_2', totalExp: 200 },
        p_updated_at: 1700000010,
        p_device_id: 'device_mobile_test',
        p_idempotency_key: `key_test_${randomSuffix}_2`,
      }),
    });

    const rpcData2 = await rpcRes2.json();
    assert.equal(rpcRes2.status, 200);
    assert.equal(rpcData2.status, 'CONFLICT', 'Stale write phải trả về CONFLICT');
    assert.equal(rpcData2.reason, 'REV_MISMATCH');
    console.log('✓ Test 2.2 Passed: Stale write qua RPC bị từ chối chính xác (REV_MISMATCH)');

    // Test 2.3: Idempotent replay (cùng key, cùng payload) -> SUCCESS với idempotent_replay = true
    const rpcRes3 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sync_cultivation_occ`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_expected_rev: 0,
        p_state: { realm: 'ngung_khi_1', totalExp: 100 },
        p_updated_at: 1700000000,
        p_device_id: 'device_pc_test',
        p_idempotency_key: `key_test_${randomSuffix}_1`,
      }),
    });

    const rpcData3 = await rpcRes3.json();
    assert.equal(rpcRes3.status, 200);
    assert.equal(rpcData3.status, 'SUCCESS');
    assert.equal(rpcData3.idempotent_replay, true, 'Retry cùng key phải nhận idempotent_replay = true');
    console.log('✓ Test 2.3 Passed: Idempotent replay qua PostgREST thành công');

    // Test 2.4: Đọc dữ liệu qua SELECT REST API
    const selectRes1 = await fetch(`${SUPABASE_URL}/rest/v1/cultivation?select=*`, {
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${authToken}`,
      },
    });
    const selectData1 = await selectRes1.json();
    assert.equal(selectRes1.status, 200);
    assert.equal(selectData1.length, 1);
    assert.equal(selectData1[0].rev, 1);
    console.log('✓ Test 2.4 Passed: Đọc dữ liệu qua PostgREST SELECT với JWT thật thành công');

    // --------------------------------------------------------------------------
    // 3. THỰC THI CUTOVER GIAI ĐOẠN B TRÊN SUPABASE LOCAL
    // --------------------------------------------------------------------------
    console.log('\n[3/6] Thực thi Cutover Giai đoạn B (Thu hồi direct write)...');

    // Chạy các lệnh của Stage B Cutover
    await pgClient.query(`
      REVOKE INSERT, UPDATE, DELETE ON TABLE public.cultivation FROM anon, authenticated, public;
      GRANT SELECT ON TABLE public.cultivation TO authenticated;
      GRANT EXECUTE ON FUNCTION public.sync_cultivation_occ(bigint, jsonb, bigint, text, text, text) TO authenticated;
    `);

    // Kiểm tra privileges trong Postgres
    const privCheck = await pgClient.query(`
      SELECT 
        has_table_privilege('authenticated', 'public.cultivation', 'INSERT') AS can_insert,
        has_table_privilege('authenticated', 'public.cultivation', 'UPDATE') AS can_update,
        has_table_privilege('authenticated', 'public.cultivation', 'SELECT') AS can_select,
        has_function_privilege('authenticated', 'public.sync_cultivation_occ(bigint, jsonb, bigint, text, text, text)', 'EXECUTE') AS can_rpc;
    `);

    const priv = privCheck.rows[0];
    assert.equal(priv.can_insert, false, 'authenticated KHÔNG ĐƯỢC có quyền INSERT sau cutover');
    assert.equal(priv.can_update, false, 'authenticated KHÔNG ĐƯỢC có quyền UPDATE sau cutover');
    assert.equal(priv.can_select, true, 'authenticated PHẢI có quyền SELECT');
    assert.equal(priv.can_rpc, true, 'authenticated PHẢI có quyền EXECUTE RPC');
    console.log('✓ Xác nhận quyền DB sau Cutover: can_insert=false, can_update=false, can_select=true, can_rpc=true');

    // --------------------------------------------------------------------------
    // 4. KIỂM THỬ POST-CUTOVER: DIRECT UPSERT BỊ TỪ CHỐI, RPC OCC VẪN HOẠT ĐỘNG
    // --------------------------------------------------------------------------
    console.log('\n[4/6] Kiểm thử Post-Cutover qua PostgREST API với JWT thật...');

    // Test 4.1: Direct write (POST /rest/v1/cultivation) bằng client cũ BẮT BUỘC BỊ TỪ CHỐI (42501)
    const directRes = await fetch(`${SUPABASE_URL}/rest/v1/cultivation`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id: testUserId,
        rev: 999,
        state: { realm: 'hac_am_dao', totalExp: 999999 },
        updated_at: 1700000099,
        device_id: 'rogue_legacy_device',
      }),
    });

    assert.notEqual(directRes.status, 200, 'Direct write không được phép thành công 200');
    assert.notEqual(directRes.status, 201, 'Direct write không được phép thành công 201');
    const directErrData = await directRes.json();
    console.log(`✓ Test 4.1 Passed: Direct write bị PostgREST từ chối: HTTP ${directRes.status} (${directErrData.code || directErrData.message})`);

    // Test 4.2: RPC OCC (POST /rest/v1/rpc/sync_cultivation_occ) VẪN HOẠT ĐỘNG HOÀN HẢO
    const rpcRes4 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sync_cultivation_occ`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_expected_rev: 1,
        p_state: { realm: 'ngung_khi_2', totalExp: 250 },
        p_updated_at: 1700000020,
        p_device_id: 'device_pc_test',
        p_idempotency_key: `key_test_${randomSuffix}_4`,
      }),
    });

    const rpcData4 = await rpcRes4.json();
    assert.equal(rpcRes4.status, 200, `RPC post-cutover failed: ${JSON.stringify(rpcData4)}`);
    assert.equal(rpcData4.status, 'SUCCESS');
    assert.equal(rpcData4.rev, 2, 'Rev phải được tăng tuần tự lên 2');
    console.log('✓ Test 4.2 Passed: RPC OCC vẫn hoạt động bình thường sau cutover (lên rev = 2)');

    // --------------------------------------------------------------------------
    // 5. KIỂM THỬ CIRCUIT BREAKER (SAFE MAINTENANCE MODE)
    // --------------------------------------------------------------------------
    console.log('\n[5/6] Kiểm thử Safe Maintenance Mode (Circuit Breaker)...');

    // Bật cờ bảo trì trong DB
    await pgClient.query(`
      UPDATE public.app_system_flags 
      SET value = '{"enabled": true, "message": "Bảo trì nâng cấp an toàn"}'::jsonb, updated_at = NOW() 
      WHERE key = 'cultivation_maintenance';
    `);

    // Gọi RPC OCC khi đang bảo trì
    const rpcResMaint = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sync_cultivation_occ`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_expected_rev: 2,
        p_state: { realm: 'ngung_khi_3', totalExp: 400 },
        p_updated_at: 1700000030,
        p_device_id: 'device_pc_test',
        p_idempotency_key: `key_test_${randomSuffix}_5`,
      }),
    });

    const rpcDataMaint = await rpcResMaint.json();
    assert.equal(rpcResMaint.status, 200);
    assert.equal(rpcDataMaint.status, 'MAINTENANCE', 'Circuit breaker phải trả về MAINTENANCE');
    assert.equal(rpcDataMaint.code, 'SYNC_PAUSED', 'Mã lỗi phải là SYNC_PAUSED');
    console.log('✓ Test 5.1 Passed: RPC trả về { status: "MAINTENANCE", code: "SYNC_PAUSED" }');

    // Kiểm tra dữ liệu trên Cloud không bị thay đổi trong lúc bảo trì
    const checkDbAfterMaint = await pgClient.query('SELECT rev FROM public.cultivation WHERE user_id = $1', [testUserId]);
    assert.equal(checkDbAfterMaint.rows[0].rev, '2', 'Cloud rev vẫn giữ nguyên là 2');
    console.log('✓ Test 5.2 Passed: Dữ liệu Cloud giữ nguyên rev = 2, không bị ghi đè khi bảo trì');

    // Tắt lại cờ bảo trì
    await pgClient.query(`
      UPDATE public.app_system_flags 
      SET value = '{"enabled": false, "message": "Hoạt động bình thường"}'::jsonb, updated_at = NOW() 
      WHERE key = 'cultivation_maintenance';
    `);

    // --------------------------------------------------------------------------
    // 6. KIỂM THỬ TRANSACTION ROLLBACK & SECURITY DEFINER CLEANUP
    // --------------------------------------------------------------------------
    console.log('\n[6/6] Kiểm thử Security Definer Cleanup & Rollback...');

    // Test authenticated user gọi hàm cleanup -> Phải bị chặn
    const cleanupUserRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cleanup_cultivation_idempotency_log`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_days: 30 }),
    });
    assert.notEqual(cleanupUserRes.status, 200, 'User authenticated không được phép gọi cleanup');
    console.log(`✓ Test 6.1 Passed: User authenticated bị từ chối gọi cleanup: HTTP ${cleanupUserRes.status}`);

    // Test service_role gọi hàm cleanup với p_days hợp lệ -> Thành công
    const cleanupAdminRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cleanup_cultivation_idempotency_log`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_days: 30 }),
    });
    assert.equal(cleanupAdminRes.status, 200, 'Service role phải gọi được cleanup');
    console.log('✓ Test 6.2 Passed: Service role gọi cleanup thành công 200 OK');

    console.log('\n==========================================================================');
    console.log('KẾT QUẢ KIỂM THỬ SUPABASE LOCAL E2E: [PASS 100%]');
    console.log('Tất cả 6 giai đoạn kiểm thử với JWT thật và PostgREST API đã thành công!');
    console.log('==========================================================================');
  } finally {
    // Dọn dẹp dữ liệu của test user trên local database
    if (testUserId) {
      try {
        await pgClient.query('DELETE FROM public.cultivation_idempotency_log WHERE user_id = $1', [testUserId]);
        await pgClient.query('DELETE FROM public.cultivation WHERE user_id = $1', [testUserId]);
        await pgClient.query('DELETE FROM auth.users WHERE id = $1', [testUserId]);
        console.log(`✓ Dọn dẹp thành công test user: ${testUserId}`);
      } catch (e) {
        console.warn('Lỗi dọn dẹp test user:', e.message);
      }
    }
    await pgClient.end();
  }
}

runLocalE2ETests().catch(err => {
  console.error('\nLỖI KIỂM THỬ SUPABASE LOCAL E2E: [FAIL]', err);
  process.exit(1);
});
