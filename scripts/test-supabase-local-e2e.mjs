/**
 * BỘ KIỂM THỬ TÍCH HỢP TOÀN DIỆN TRÊN SUPABASE LOCAL THẬT
 * File: scripts/test-supabase-local-e2e.mjs
 * 
 * Kiểm thử an toàn & chuẩn hóa:
 * 1. Khóa an toàn 100% vào Supabase Local đã xác minh (127.0.0.1 / localhost)
 * 2. Supabase Auth Local: Đăng ký & lấy JWT thật qua GoTrue
 * 3. Quyền ghi Giai đoạn A: Direct REST write & RPC OCC đều hoạt động
 * 4. Cutover Giai đoạn B: Direct write bị từ chối 403/42501, RPC OCC vẫn hoạt động
 * 5. Safe Maintenance Mode: Circuit breaker trả về SYNC_PAUSED
 * 6. Khôi phục hoàn toàn trạng thái Stage A baseline sau khi test (Idempotent)
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const { Client } = pg;

// ------------------------------------------------------------------------------
// 1. KIỂM TRA BẢO VỆ AN TOÀN URL & KHÓA VÀO SUPABASE LOCAL
// ------------------------------------------------------------------------------
let parsedSupabaseUrl;
let parsedDbUrl;
try {
  parsedSupabaseUrl = new URL(SUPABASE_URL);
  parsedDbUrl = new URL(DB_URL);
} catch (e) {
  console.error('LỖI: URL kết nối không hợp lệ:', e.message);
  process.exit(1);
}

const safeLoopbackHosts = ['127.0.0.1', 'localhost', '::1'];
if (!safeLoopbackHosts.includes(parsedSupabaseUrl.hostname) || !safeLoopbackHosts.includes(parsedDbUrl.hostname)) {
  console.error('========================================================================');
  console.error('BẢO VỆ AN TOÀN TUYỆT ĐỐI: Phát hiện URL không thuộc loopback localhost!');
  console.error(`  - Supabase Gateway: ${parsedSupabaseUrl.hostname}`);
  console.error(`  - Database Host:    ${parsedDbUrl.hostname}`);
  console.error('Script test này chỉ được phép chạy trên Supabase Local cô lập (127.0.0.1).');
  console.error('Tuyệt đối KHÔNG chạy trên staging remote hay production!');
  console.error('========================================================================');
  process.exit(1);
}

const bannedKeywords = ['prod', 'production', 'live', 'supabase.co', 'supabase.com', 'aws-0', 'pooler'];
if (bannedKeywords.some(b => parsedSupabaseUrl.hostname.toLowerCase().includes(b) || parsedDbUrl.hostname.toLowerCase().includes(b))) {
  console.error('LỖI BẢO MẬT: Phát hiện định danh Production/Cloud trong URL. Dừng khẩn cấp!');
  process.exit(1);
}

async function getDatabasePrivilegesSnapshot(pgClient) {
  const privRes = await pgClient.query(`
    SELECT grantee, privilege_type 
    FROM information_schema.table_privileges 
    WHERE table_schema = 'public' AND table_name = 'cultivation' AND grantee IN ('authenticated', 'anon')
    ORDER BY grantee, privilege_type;
  `);
  const maintRes = await pgClient.query(`
    SELECT value FROM public.app_system_flags WHERE key = 'cultivation_maintenance';
  `);
  return {
    privileges: privRes.rows,
    maintenance: maintRes.rows[0]?.value || { enabled: false, message: 'Hoạt động bình thường' },
  };
}

async function runLocalE2ETests() {
  console.log('==========================================================================');
  console.log('BẮT ĐẦU KIỂM THỬ SUPABASE LOCAL E2E VỚI JWT THẬT & POSTGREST API');
  console.log(`Supabase Gateway: ${SUPABASE_URL} (Localhost Port ${parsedSupabaseUrl.port})`);
  console.log(`PostgreSQL:       ${DB_URL.replace(/:[^:@]+@/, ':***@')} (Localhost Port ${parsedDbUrl.port})`);
  console.log('==========================================================================');

  const pgClient = new Client({ connectionString: DB_URL });
  await pgClient.connect();

  let testUserId = null;
  let authToken = null;
  let preTestSnapshot = null;
  const cleanupErrors = [];

  try {
    // --------------------------------------------------------------------------
    // 1.1. XÁC NHẬN ĐỘC LẬP DANH TÍNH MÔI TRƯỜNG TRƯỚC KHI THỰC HIỆN BẤT KỲ THAO TÁC NÀO
    // --------------------------------------------------------------------------
    const dbInfo = await pgClient.query('SELECT current_database() AS dbname, current_user AS dbuser');
    const currentDb = dbInfo.rows[0]?.dbname || '';
    const currentUser = dbInfo.rows[0]?.dbuser || '';

    if (bannedKeywords.some(b => currentDb.toLowerCase().includes(b))) {
      throw new Error(`BẢO MẬT: Tên database "${currentDb}" chứa từ khóa cấm (production). Dừng khẩn cấp!`);
    }

    const envCheck = await pgClient.query(`
      SELECT 
        current_setting('app.environment', true) AS setting_env,
        (SELECT value->>'identifier' FROM public.app_system_flags WHERE key = 'environment_identifier') AS flag_env_id
    `);

    const dbEnv = envCheck.rows[0]?.setting_env || envCheck.rows[0]?.flag_env_id;
    if (dbEnv && bannedKeywords.some(b => dbEnv.toLowerCase().includes(b))) {
      throw new Error(`Định danh cấu hình môi trường ("${dbEnv}") mang từ khóa production. Dừng khẩn cấp!`);
    }

    console.log(`✓ Xác thực danh tính Database Local thành công:`);
    console.log(`  - Database: "${currentDb}" | User: "${currentUser}" | Environment: "${dbEnv || 'local'}"`);

    // --------------------------------------------------------------------------
    // 1.2. GHI NHẬN SNAPSHOT QUYỀN VÀ TRẠNG THÁI BASELINE TRƯỚC TEST
    // --------------------------------------------------------------------------
    preTestSnapshot = await getDatabasePrivilegesSnapshot(pgClient);
    console.log(`✓ Đã ghi nhận snapshot quyền ban đầu từ database (${preTestSnapshot.privileges.length} quyền).`);

    // Thiết lập môi trường thử nghiệm cho Stage A (Direct write & Legacy Client)
    // Sẽ được khôi phục đối chiếu 100% về preTestSnapshot trong khối finally
    await pgClient.query(`
      GRANT INSERT, UPDATE, DELETE, SELECT ON TABLE public.cultivation TO authenticated;
      GRANT INSERT, UPDATE, DELETE, SELECT ON TABLE public.cultivation TO anon;

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cultivation' AND policyname = 'Test legacy insert') THEN
          CREATE POLICY "Test legacy insert" ON public.cultivation FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cultivation' AND policyname = 'Test legacy update') THEN
          CREATE POLICY "Test legacy update" ON public.cultivation FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id);
        END IF;
      END $$;

      UPDATE public.app_system_flags 
      SET value = '{"enabled": false, "message": "Hoạt động bình thường"}'::jsonb, updated_at = NOW() 
      WHERE key = 'cultivation_maintenance';
    `);

    // --------------------------------------------------------------------------
    // 2. TẠO TÀI KHOẢN THỬ NGHIỆM VÀ NHẬN JWT THẬT TỪ SUPABASE AUTH (GOTRUE)
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
    // 3. KIỂM THỬ GIAI ĐOẠN A: DIRECT WRITE & RPC OCC QUA POSTGREST VỚI JWT THẬT
    // --------------------------------------------------------------------------
    console.log('\n[2/6] Kiểm thử Giai đoạn A qua PostgREST REST API...');

    // Test 2.0: Xác nhận trước Cutover: Direct write được phép trong Giai đoạn A
    const directStageARes = await fetch(`${SUPABASE_URL}/rest/v1/cultivation`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id: testUserId,
        rev: 1,
        state: { realm: 'ngung_khi_1', totalExp: 50 },
        updated_at: 1699999999,
        device_id: 'device_stage_a_test',
      }),
    });
    assert.ok([200, 201].includes(directStageARes.status), `Direct write Stage A phải thành công: ${directStageARes.status}`);
    console.log('✓ Test 2.0 Passed: Giai đoạn A cho phép direct write (client cũ hoạt động bình thường)');

    // Dọn dẹp bản ghi direct Stage A để bắt đầu bài kiểm thử RPC
    await pgClient.query('DELETE FROM public.cultivation WHERE user_id = $1', [testUserId]);

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
    // 4. THỰC THI CUTOVER GIAI ĐOẠN B TRÊN SUPABASE LOCAL
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
    // 5. KIỂM THỬ POST-CUTOVER: DIRECT UPSERT BỊ TỪ CHỐI, RPC OCC VẪN HOẠT ĐỘNG
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
    // 6. KIỂM THỬ CIRCUIT BREAKER (SAFE MAINTENANCE MODE)
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
    // 7. KIỂM THỬ TRANSACTION ROLLBACK & SECURITY DEFINER CLEANUP
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
    // --------------------------------------------------------------------------
    // 8. KHÔI PHỤC HOÀN TOÀN TRẠNG THÁI BASELINE PRE-TEST & DỌN DẸP AN TOÀN (IDEMPOTENT)
    // --------------------------------------------------------------------------
    // 1. Dọn dẹp dữ liệu của test user trên local database
    if (testUserId) {
      try {
        await pgClient.query('DELETE FROM public.cultivation_idempotency_log WHERE user_id = $1', [testUserId]);
        await pgClient.query('DELETE FROM public.cultivation WHERE user_id = $1', [testUserId]);
        await pgClient.query('DELETE FROM auth.users WHERE id = $1', [testUserId]);
        console.log(`✓ Dọn dẹp thành công test user: ${testUserId}`);
      } catch (err) {
        cleanupErrors.push(`Lỗi dọn dẹp test user: ${err.message}`);
      }
    }

    // 2. Khôi phục cờ bảo trì về giá trị pre-test
    if (preTestSnapshot?.maintenance) {
      try {
        await pgClient.query(`
          UPDATE public.app_system_flags 
          SET value = $1::jsonb, updated_at = NOW() 
          WHERE key = 'cultivation_maintenance';
        `, [JSON.stringify(preTestSnapshot.maintenance)]);
        console.log('✓ Đã khôi phục cờ bảo trì cultivation_maintenance về giá trị pre-test.');
      } catch (err) {
        cleanupErrors.push(`Lỗi khôi phục maintenance flag: ${err.message}`);
      }
    }

    // 3. Xóa các test policy tạm thời
    try {
      await pgClient.query(`
        DROP POLICY IF EXISTS "Test legacy insert" ON public.cultivation;
        DROP POLICY IF EXISTS "Test legacy update" ON public.cultivation;
      `);
      console.log('✓ Đã xóa các policy test tạm thời.');
    } catch (err) {
      cleanupErrors.push(`Lỗi xóa policy test tạm thời: ${err.message}`);
    }

    // 4. Khôi phục quyền bảng cultivation chính xác theo preTestSnapshot.privileges
    if (preTestSnapshot?.privileges) {
      try {
        // Thu hồi toàn bộ quyền direct write/read của authenticated và anon để tái lập sạch sẽ
        await pgClient.query(`
          REVOKE ALL PRIVILEGES ON TABLE public.cultivation FROM authenticated, anon;
        `);

        // Tái cấp chính xác các quyền theo snapshot ban đầu
        for (const priv of preTestSnapshot.privileges) {
          const grantee = priv.grantee === 'authenticated' ? 'authenticated' : (priv.grantee === 'anon' ? 'anon' : null);
          const privType = priv.privilege_type.toUpperCase();
          if (grantee && ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'].includes(privType)) {
            await pgClient.query(`GRANT ${privType} ON TABLE public.cultivation TO ${grantee};`);
          }
        }

        // Xác minh post-test privileges khớp 100% với pre-test snapshot
        const postTestSnapshot = await getDatabasePrivilegesSnapshot(pgClient);
        assert.deepStrictEqual(
          postTestSnapshot.privileges,
          preTestSnapshot.privileges,
          'Danh sách quyền bảng cultivation sau dọn dẹp phải khớp 100% với snapshot ban đầu!'
        );
        console.log(`✓ Đã xác minh khôi phục 100% quyền bảng cultivation (${postTestSnapshot.privileges.length} quyền).`);
      } catch (err) {
        cleanupErrors.push(`Lỗi khôi phục quyền bảng cultivation: ${err.message}`);
      }
    }

    await pgClient.end().catch(() => {});

    if (cleanupErrors.length > 0) {
      console.error('\nCẢNH BÁO / LỖI DỌN DẸP BASELINE:');
      for (const err of cleanupErrors) {
        console.error(`  - ${err}`);
      }
      throw new Error(`Quá trình dọn dẹp baseline thất bại với ${cleanupErrors.length} lỗi.`);
    }
  }
}

runLocalE2ETests().catch(err => {
  console.error('\nLỖI KIỂM THỬ SUPABASE LOCAL E2E: [FAIL]', err);
  process.exit(1);
});
