/**
 * BỘ KIỂM THỬ QUY TRÌNH ATOMIC CUTOVER & SHORT WRITE FREEZE TRÊN SUPABASE LOCAL
 * File: scripts/test-atomic-cutover-local.mjs
 * 
 * Mục tiêu kiểm nghiệm:
 * 1. Cơ chế Atomic Pre-Stage A Write Freeze (trước khi có app_system_flags & RPC)
 * 2. Loại bỏ khoảng hở bằng Access Exclusive lock & lock_timeout
 * 3. Client cũ cố ghi ngay tại thời điểm freeze -> Bị chặn 403 / 42501
 * 4. Client mới cố gọi RPC khi freeze đang bật -> Nhận SYNC_PAUSED
 * 5. Concurrent INSERT / UPDATE / DELETE trong lúc freeze -> Bị chặn 100%
 * 6. Migration Stage A thất bại giữa chừng -> Rollback sạch sẽ 100%
 * 7. Frontend deploy thất bại sau khi đã có OCC commit -> Chặn mở lại direct write, bảo toàn Cloud rev
 * 8. Tiếp tục cutover thành công -> Dữ liệu tăng tuần tự không mất 1 byte
 * 9. Khôi phục hoàn toàn baseline pre-test sau khi kết thúc (Idempotent)
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
// Supabase Local Demo Key (iss: supabase-demo) - Dùng độc quyền cho kiểm thử trên loopback 127.0.0.1 cô lập
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const { Client } = pg;

// ------------------------------------------------------------------------------
// 1. KIỂM TRA BẢO VỆ MÔI TRƯỜNG LOOPBACK CÔ LẬP
// ------------------------------------------------------------------------------
const parsedSupabaseUrl = new URL(SUPABASE_URL);
const parsedDbUrl = new URL(DB_URL);
const safeLoopbacks = ['127.0.0.1', 'localhost', '::1'];

if (!safeLoopbacks.includes(parsedSupabaseUrl.hostname) || !safeLoopbacks.includes(parsedDbUrl.hostname)) {
  console.error('LỖI BẢO MẬT: Chỉ được phép chạy trên Supabase Local (127.0.0.1). Dừng!');
  process.exit(1);
}

const banned = ['prod', 'production', 'live', 'supabase.co', 'supabase.com', 'aws-0'];
if (banned.some(b => parsedSupabaseUrl.hostname.toLowerCase().includes(b) || parsedDbUrl.hostname.toLowerCase().includes(b))) {
  console.error('LỖI: Phát hiện định danh Cloud/Production. Dừng!');
  process.exit(1);
}

async function runAtomicCutoverTests() {
  console.log('==========================================================================');
  console.log('BẮT ĐẦU KIỂM THỬ QUY TRÌNH ATOMIC CUTOVER & SHORT WRITE FREEZE (LOCAL)');
  console.log(`Supabase Gateway: ${SUPABASE_URL}`);
  console.log(`PostgreSQL:       ${DB_URL.replace(/:[^:@]+@/, ':***@')}`);
  console.log('==========================================================================');

  const pgClient = new Client({ connectionString: DB_URL });
  await pgClient.connect();

  let testUserId = null;
  let authToken = null;
  let preTestSnapshot = null;
  const cleanupErrors = [];

  try {
    // 1.1. Xác nhận danh tính môi trường
    const envRes = await pgClient.query('SELECT current_database() AS dbname, current_user AS dbuser');
    const { dbname, dbuser } = envRes.rows[0];
    assert.equal(dbname, 'postgres', 'Database name phải là postgres');
    console.log(`✓ Xác thực danh tính Database Local: "${dbname}" (User: "${dbuser}")`);

    // 1.2. Chụp snapshot baseline trước test
    const privRes = await pgClient.query(`
      SELECT grantee, privilege_type 
      FROM information_schema.table_privileges 
      WHERE table_schema = 'public' AND table_name = 'cultivation' AND grantee IN ('authenticated', 'anon')
      ORDER BY grantee, privilege_type;
    `);
    const flagsExist = await pgClient.query(`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_system_flags') AS exists;
    `);
    let initialMaint = null;
    if (flagsExist.rows[0].exists) {
      const mRes = await pgClient.query(`SELECT value FROM public.app_system_flags WHERE key = 'cultivation_maintenance'`);
      initialMaint = mRes.rows[0]?.value;
    }

    preTestSnapshot = {
      privileges: privRes.rows,
      maintenance: initialMaint || { enabled: false, message: 'Hoạt động bình thường' },
    };
    console.log(`✓ Ghi nhận snapshot baseline ban đầu (${preTestSnapshot.privileges.length} table privileges).`);

    // 1.3. Tạo test user và lấy JWT thật từ GoTrue
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const testEmail = `test_cutover_${randomSuffix}@thien-co-lau.local`;
    const testPassword = `TestPass_${randomSuffix}!123`;

    const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const signupData = await signupRes.json();
    testUserId = signupData.user?.id;
    authToken = signupData.access_token || signupData.session?.access_token;
    assert.ok(testUserId && authToken, 'Phải có user_id và authToken từ GoTrue');
    console.log(`✓ Tạo người dùng thử nghiệm: ${testUserId} (${testEmail})`);

    // --------------------------------------------------------------------------
    // TEST 1: THIẾT LẬP BASELINE GIAI ĐOẠN TIỀN CUTOVER (CLIENT CŨ GHI TRỰC TIẾP ĐƯỢC)
    // --------------------------------------------------------------------------
    console.log('\n--- [TEST 1] Thiết lập trạng thái Tiền Cutover (Direct write mở) ---');
    await pgClient.query(`
      GRANT INSERT, UPDATE, DELETE, SELECT ON TABLE public.cultivation TO authenticated;
      GRANT INSERT, UPDATE, DELETE, SELECT ON TABLE public.cultivation TO anon;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cultivation' AND policyname = 'Test cutover direct insert') THEN
          CREATE POLICY "Test cutover direct insert" ON public.cultivation FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cultivation' AND policyname = 'Test cutover direct update') THEN
          CREATE POLICY "Test cutover direct update" ON public.cultivation FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id);
        END IF;
      END $$;
    `);

    // Client cũ ghi thử 1 bản ghi trước khi freeze
    const preFreezeRes = await fetch(`${SUPABASE_URL}/rest/v1/cultivation`, {
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
        state: { realm: 'ngung_khi_1', totalExp: 100 },
        updated_at: 1700000000,
        device_id: 'legacy_client_dev',
      }),
    });
    assert.ok([200, 201].includes(preFreezeRes.status), `Pre-freeze direct write phải thành công: ${preFreezeRes.status}`);
    console.log('✓ [Test 1 Passed]: Client cũ ghi trực tiếp thành công trước khi đóng băng (rev = 1, EXP = 100)');

    // --------------------------------------------------------------------------
    // TEST 2: THỰC THI ATOMIC PRE-STAGE A WRITE FREEZE (LOẠI BỎ HOÀN TOÀN KHOẢNG HỞ)
    // --------------------------------------------------------------------------
    console.log('\n--- [TEST 2] Kích hoạt Atomic Pre-Stage A Write Freeze (Locking & Revocation) ---');
    
    // Thực thi transaction nguyên tử đóng băng ghi:
    // 1. SET LOCAL lock_timeout để tránh treo nếu có transaction dài
    // 2. LOCK TABLE IN ACCESS EXCLUSIVE MODE để đợi toàn bộ in-flight transactions kết thúc
    // 3. REVOKE quyền direct write
    // 4. Tạo bảng app_system_flags (nếu chưa có) và bật cờ cultivation_maintenance = true
    await pgClient.query(`
      BEGIN;
      SET LOCAL lock_timeout = '5s';
      LOCK TABLE public.cultivation IN ACCESS EXCLUSIVE MODE;

      -- Thu hồi quyền direct write ngay trong transaction
      REVOKE INSERT, UPDATE, DELETE ON TABLE public.cultivation FROM anon, authenticated, public;
      GRANT SELECT ON TABLE public.cultivation TO authenticated;

      -- Đảm bảo bảng app_system_flags tồn tại và cờ bảo trì được BẬT
      CREATE TABLE IF NOT EXISTS public.app_system_flags (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE public.app_system_flags ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON TABLE public.app_system_flags FROM anon, authenticated, public;
      GRANT SELECT ON TABLE public.app_system_flags TO authenticated;

      INSERT INTO public.app_system_flags (key, value, updated_at)
      VALUES ('cultivation_maintenance', '{"enabled": true, "message": "Hệ thống đang bảo trì nâng cấp an toàn."}'::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = '{"enabled": true, "message": "Hệ thống đang bảo trì nâng cấp an toàn."}'::jsonb, updated_at = NOW();

      COMMIT;
    `);

    // Reload PostgREST schema cache để PostgREST đồng bộ tức thì
    await pgClient.query(`NOTIFY pgrst, 'reload schema';`);
    console.log('✓ [Test 2 Passed]: Transaction Atomic Write Freeze đã commit thành công với Access Exclusive Lock.');

    // --------------------------------------------------------------------------
    // TEST 3: CLIENT CŨ CỐ GHI NGAY TẠI THỜI ĐIỂM FREEZE -> BỊ CHẶN 403 / 42501
    // --------------------------------------------------------------------------
    console.log('\n--- [TEST 3] Client cũ cố ghi ngay sau khi freeze kích hoạt ---');
    const directDuringFreezeRes = await fetch(`${SUPABASE_URL}/rest/v1/cultivation`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id: testUserId,
        rev: 2,
        state: { realm: 'ngung_khi_1', totalExp: 150 },
        updated_at: 1700000010,
        device_id: 'legacy_client_dev',
      }),
    });

    assert.notEqual(directDuringFreezeRes.status, 200);
    assert.notEqual(directDuringFreezeRes.status, 201);
    const directErr = await directDuringFreezeRes.json();
    assert.ok(
      directDuringFreezeRes.status === 403 || directErr.code === '42501' || (directErr.message && directErr.message.includes('permission denied')),
      `Direct write phải bị từ chối 403/42501: HTTP ${directDuringFreezeRes.status} (${JSON.stringify(directErr)})`
    );
    console.log(`✓ [Test 3 Passed]: Client cũ cố ghi direct REST bị từ chối chính xác: HTTP ${directDuringFreezeRes.status} (${directErr.code || directErr.message})`);

    // --------------------------------------------------------------------------
    // TEST 4: CLIENT MỚI CỐ GỌI RPC KHI FREEZE ĐANG BẬT -> TRẢ VỀ SYNC_PAUSED
    // --------------------------------------------------------------------------
    console.log('\n--- [TEST 4] Client mới cố gọi RPC OCC khi Freeze đang bật ---');
    const rpcDuringFreezeRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sync_cultivation_occ`, {
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
        p_device_id: 'new_client_occ',
        p_idempotency_key: `key_freeze_test_${randomSuffix}`,
      }),
    });

    const rpcFreezeData = await rpcDuringFreezeRes.json();
    assert.equal(rpcDuringFreezeRes.status, 200, 'RPC HTTP status phải là 200');
    assert.equal(rpcFreezeData.status, 'MAINTENANCE', 'RPC status phải là MAINTENANCE');
    assert.equal(rpcFreezeData.code, 'SYNC_PAUSED', 'RPC code phải là SYNC_PAUSED');
    console.log(`✓ [Test 4 Passed]: Client mới gọi RPC OCC nhận phản hồi an toàn: { status: "MAINTENANCE", code: "SYNC_PAUSED" }`);

    // --------------------------------------------------------------------------
    // TEST 5: CONCURRENT INSERT / UPDATE / DELETE TRONG LÚC FREEZE
    // --------------------------------------------------------------------------
    console.log('\n--- [TEST 5] Kiểm thử Concurrent INSERT/UPDATE/DELETE đồng thời trong lúc freeze ---');
    const concurrentOps = [
      // Direct INSERT từ client cũ
      fetch(`${SUPABASE_URL}/rest/v1/cultivation`, {
        method: 'POST',
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: testUserId, rev: 99, state: {}, updated_at: 1700000099, device_id: 'rogue1' }),
      }),
      // Direct UPDATE từ client cũ
      fetch(`${SUPABASE_URL}/rest/v1/cultivation?user_id=eq.${testUserId}`, {
        method: 'PATCH',
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rev: 99, updated_at: 1700000099 }),
      }),
      // Direct DELETE từ client cũ
      fetch(`${SUPABASE_URL}/rest/v1/cultivation?user_id=eq.${testUserId}`, {
        method: 'DELETE',
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}` },
      }),
      // RPC OCC từ client mới
      fetch(`${SUPABASE_URL}/rest/v1/rpc/sync_cultivation_occ`, {
        method: 'POST',
        headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_expected_rev: 1,
          p_state: { realm: 'ngung_khi_2', totalExp: 300 },
          p_updated_at: 1700000030,
          p_device_id: 'new_client_occ_concurrent',
          p_idempotency_key: `key_concurrent_${randomSuffix}`,
        }),
      }),
    ];

    const results = await Promise.all(concurrentOps);
    // Direct INSERT/UPDATE/DELETE phải thất bại (không phải 200/201/204)
    assert.notEqual(results[0].status, 201, 'Direct INSERT phải bị chặn');
    assert.notEqual(results[1].status, 204, 'Direct UPDATE phải bị chặn');
    assert.notEqual(results[2].status, 204, 'Direct DELETE phải bị chặn');
    
    // RPC phải trả về MAINTENANCE
    const rpcResData = await results[3].json();
    assert.equal(rpcResData.status, 'MAINTENANCE', 'RPC concurrent phải trả về MAINTENANCE');

    // Xác nhận Cloud row hoàn toàn bất biến (vẫn là rev 1, EXP 100)
    const checkRow = await pgClient.query('SELECT rev, state FROM public.cultivation WHERE user_id = $1', [testUserId]);
    assert.equal(checkRow.rows[0].rev, '1');
    assert.equal(checkRow.rows[0].state.totalExp, 100);
    console.log('✓ [Test 5 Passed]: Tất cả direct writes đồng thời bị chặn 100%, RPC trả về MAINTENANCE, Cloud bất biến rev = 1');

    // --------------------------------------------------------------------------
    // TEST 6: MIGRATION STAGE A THẤT BẠI GIỮA CHỪNG (TRANSACTION ROLLBACK)
    // --------------------------------------------------------------------------
    console.log('\n--- [TEST 6] Giả lập Migration Stage A thất bại giữa chừng & Transaction Rollback ---');
    let rollbackSuccess = false;
    try {
      await pgClient.query(`
        BEGIN;
        -- Tạo bảng tạm giả lập một phần của migration
        CREATE TABLE public.test_occ_partial_migration (
          id INT PRIMARY KEY,
          note TEXT
        );
        INSERT INTO public.test_occ_partial_migration VALUES (1, 'Partial data');

        -- Cố tình ném lỗi nghiêm trọng giữa chừng (chia cho 0)
        SELECT 1 / 0;

        COMMIT;
      `);
    } catch (simulatedErr) {
      rollbackSuccess = true;
      await pgClient.query('ROLLBACK;').catch(() => {});
      console.log(`  - Bắt được lỗi cố ý: ${simulatedErr.message}`);
    }

    assert.ok(rollbackSuccess, 'Migration gặp lỗi phải ném exception để kích hoạt rollback');

    // Xác minh bảng tạm không hề tồn tại trong database (đã bị rollback 100%)
    const partialTableCheck = await pgClient.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'test_occ_partial_migration'
      ) AS table_exists;
    `);
    assert.equal(partialTableCheck.rows[0].table_exists, false, 'Bảng dở dang không được tồn tại sau rollback');
    console.log('✓ [Test 6 Passed]: Khi migration lỗi giữa chừng, toàn bộ thay đổi bị ROLLBACK tự động; không để lại schema rác');

    // --------------------------------------------------------------------------
    // TEST 7: FRONTEND DEPLOY THẤT BẠI SAU KHI ĐÃ CÓ OCC COMMIT -> CHẶN MỞ LẠI DIRECT WRITE
    // --------------------------------------------------------------------------
    console.log('\n--- [TEST 7] Frontend deploy thất bại sau khi đã có OCC commit ---');
    
    // Tạm thời mở maintenance để thực hiện 1 OCC commit mẫu (mô phỏng client mới vừa commit)
    await pgClient.query(`
      UPDATE public.app_system_flags 
      SET value = '{"enabled": false, "message": "Hoạt động bình thường"}'::jsonb, updated_at = NOW() 
      WHERE key = 'cultivation_maintenance';
    `);

    // Client mới thực hiện OCC commit lên rev = 2, EXP = 500
    const occCommitRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sync_cultivation_occ`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_expected_rev: 1,
        p_state: { realm: 'ngung_khi_2', totalExp: 500 },
        p_updated_at: 1700000050,
        p_device_id: 'client_new_version',
        p_idempotency_key: `key_occ_commit_${randomSuffix}`,
      }),
    });
    const occCommitData = await occCommitRes.json();
    assert.equal(occCommitData.status, 'SUCCESS');
    assert.equal(occCommitData.rev, 2);
    console.log('  - Client mới đã commit OCC thành công lên rev = 2 (EXP = 500)');

    // Giả lập phát hiện Frontend deploy thất bại: Ngay lập tức bật Circuit Breaker đóng băng
    await pgClient.query(`
      UPDATE public.app_system_flags 
      SET value = '{"enabled": true, "message": "Tạm dừng xử lý sự cố frontend"}'::jsonb, updated_at = NOW() 
      WHERE key = 'cultivation_maintenance';
    `);
    console.log('  - Đã bật Circuit Breaker giữ trạng thái đóng băng.');

    // KIỂM TRA QUY TẮC AN TOÀN TUYỆT ĐỐI:
    // Nếu có ai đó cố tình mở lại direct write khi đã có OCC commit:
    // Script kiểm tra an toàn phải chặn đứng thao tác này!
    let blindRollbackBlocked = false;
    try {
      await pgClient.query(`
        DO $$
        DECLARE
            v_occ_commits_count BIGINT;
            v_occ_cultivation_rows BIGINT;
        BEGIN
            -- 1. Kiểm tra nhật ký idempotency log
            SELECT count(*) INTO v_occ_commits_count FROM public.cultivation_idempotency_log;

            -- 2. Kiểm tra trực tiếp bảng cultivation (vì idempotency_log có thể đã bị dọn dẹp theo retention)
            SELECT count(*) INTO v_occ_cultivation_rows FROM public.cultivation WHERE rev > 1;

            -- LƯU Ý BẢO MẬT: COUNT(*) = 0 trong idempotency_log KHÔNG PHẢI bằng chứng tuyệt đối
            -- chưa từng có OCC commit (do retention cleanup hoặc truncate). 
            -- Tuyệt đối không tự động mở lại direct write dựa trên COUNT(*) = 0!
            IF v_occ_commits_count > 0 OR v_occ_cultivation_rows > 0 THEN
                RAISE EXCEPTION 'BLIND_ROLLBACK_FORBIDDEN: Đã phát hiện % bản ghi nhật ký OCC và % dòng cultivation có rev > 1! Tuyệt đối không mở lại direct write vì sẽ gây mất dữ liệu của người dùng.'
                , v_occ_commits_count, v_occ_cultivation_rows 
                USING ERRCODE = '55000';
            END IF;

            -- Chỉ khi có phê duyệt riêng và chắc chắn 100% chưa có dữ liệu OCC nào mới được xét mở lại
            GRANT INSERT, UPDATE ON TABLE public.cultivation TO authenticated;
        END $$;
      `);
    } catch (guardErr) {
      blindRollbackBlocked = true;
      console.log(`  - Guard đã chặn thao tác mở lại direct write: [${guardErr.code}] ${guardErr.message}`);
    }

    assert.ok(blindRollbackBlocked, 'Thao tác blind rollback mở lại direct write khi đã có OCC commit BẮT BUỘC BỊ CHẶN');

    // Xác nhận Cloud data vẫn nguyên vẹn ở rev = 2, không bị ghi đè
    const verifyRowAfterIncident = await pgClient.query('SELECT rev, state FROM public.cultivation WHERE user_id = $1', [testUserId]);
    assert.equal(verifyRowAfterIncident.rows[0].rev, '2');
    assert.equal(verifyRowAfterIncident.rows[0].state.totalExp, 500);
    console.log('✓ [Test 7 Passed]: Guard đã bảo vệ thành công dữ liệu OCC; Cloud giữ nguyên rev = 2 (500 EXP), không bị ghi đè');

    // --------------------------------------------------------------------------
    // TEST 8: TIẾP TỤC CUTOVER THÀNH CÔNG -> DỮ LIỆU TĂNG TUẦN TỰ KHÔNG MẤT 1 BYTE
    // --------------------------------------------------------------------------
    console.log('\n--- [TEST 8] Tiếp tục Cutover sau khi hotfix Frontend (Forward Fix) ---');
    
    // Quản trị viên mở lại bảo trì sau khi frontend đã ổn định
    await pgClient.query(`
      UPDATE public.app_system_flags 
      SET value = '{"enabled": false, "message": "Hoạt động bình thường"}'::jsonb, updated_at = NOW() 
      WHERE key = 'cultivation_maintenance';
    `);

    // Client mới tiếp tục đồng bộ qua RPC OCC từ expected_rev = 2 lên rev = 3
    const resumeRpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/sync_cultivation_occ`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_expected_rev: 2,
        p_state: { realm: 'ngung_khi_3', totalExp: 800 },
        p_updated_at: 1700000080,
        p_device_id: 'client_new_version',
        p_idempotency_key: `key_resume_${randomSuffix}`,
      }),
    });

    const resumeData = await resumeRpcRes.json();
    assert.equal(resumeRpcRes.status, 200);
    assert.equal(resumeData.status, 'SUCCESS');
    assert.equal(resumeData.rev, 3, 'Rev phải tăng tuần tự lên 3');

    const finalRow = await pgClient.query('SELECT rev, state FROM public.cultivation WHERE user_id = $1', [testUserId]);
    assert.equal(finalRow.rows[0].rev, '3');
    assert.equal(finalRow.rows[0].state.totalExp, 800);
    console.log('✓ [Test 8 Passed]: Cutover tiếp tục thành công lên rev = 3 (800 EXP). Toàn bộ dữ liệu được bảo toàn tuyệt đối 100%!');

    console.log('\n==========================================================================');
    console.log('KẾT QUẢ KIỂM THỬ ATOMIC CUTOVER & SHORT WRITE FREEZE: [PASS 100%]');
    console.log('Tất cả 8 kịch bản kiểm thử bảo mật & transaction đã thành công trọn vẹn!');
    console.log('==========================================================================');

  } finally {
    // --------------------------------------------------------------------------
    // DỌN DẸP & KHÔI PHỤC BASELINE IDEMPOTENT
    // --------------------------------------------------------------------------
    console.log('\n[Dọn dẹp] Khôi phục môi trường về baseline ban đầu...');
    if (testUserId) {
      try {
        await pgClient.query('DELETE FROM public.cultivation_idempotency_log WHERE user_id = $1', [testUserId]);
        await pgClient.query('DELETE FROM public.cultivation WHERE user_id = $1', [testUserId]);
        await pgClient.query('DELETE FROM auth.users WHERE id = $1', [testUserId]);
        console.log(`✓ Đã xóa dữ liệu test user: ${testUserId}`);
      } catch (err) {
        cleanupErrors.push(`Lỗi dọn user: ${err.message}`);
      }
    }

    try {
      await pgClient.query(`
        DROP POLICY IF EXISTS "Test cutover direct insert" ON public.cultivation;
        DROP POLICY IF EXISTS "Test cutover direct update" ON public.cultivation;
      `);
      console.log('✓ Đã xóa policy test tạm thời.');
    } catch (err) {
      cleanupErrors.push(`Lỗi xóa policy: ${err.message}`);
    }

    if (preTestSnapshot?.maintenance) {
      try {
        await pgClient.query(`
          UPDATE public.app_system_flags 
          SET value = $1::jsonb, updated_at = NOW() 
          WHERE key = 'cultivation_maintenance';
        `, [JSON.stringify(preTestSnapshot.maintenance)]);
        console.log('✓ Đã khôi phục cờ cultivation_maintenance về giá trị ban đầu.');
      } catch (err) {
        cleanupErrors.push(`Lỗi khôi phục maintenance: ${err.message}`);
      }
    }

    if (preTestSnapshot?.privileges) {
      try {
        await pgClient.query(`REVOKE ALL PRIVILEGES ON TABLE public.cultivation FROM authenticated, anon;`);
        for (const priv of preTestSnapshot.privileges) {
          const grantee = priv.grantee === 'authenticated' ? 'authenticated' : (priv.grantee === 'anon' ? 'anon' : null);
          const privType = priv.privilege_type.toUpperCase();
          if (grantee && ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'].includes(privType)) {
            await pgClient.query(`GRANT ${privType} ON TABLE public.cultivation TO ${grantee};`);
          }
        }
        console.log(`✓ Đã khôi phục 100% quyền bảng cultivation (${preTestSnapshot.privileges.length} quyền).`);
      } catch (err) {
        cleanupErrors.push(`Lỗi khôi phục privileges: ${err.message}`);
      }
    }

    await pgClient.end().catch(() => {});

    if (cleanupErrors.length > 0) {
      console.error('LỖI DỌN DẸP BASELINE:', cleanupErrors);
      throw new Error(`Dọn dẹp baseline thất bại với ${cleanupErrors.length} lỗi.`);
    }
  }
}

runAtomicCutoverTests().catch(err => {
  console.error('\nLỖI KIỂM THỬ ATOMIC CUTOVER: [FAIL]', err);
  process.exit(1);
});
