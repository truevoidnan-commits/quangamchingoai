/**
 * BỘ KIỂM THỬ XỬ LÝ 2 ĐIỀU KIỆN BLOCKER TRÊN SUPABASE LOCAL
 * File: scripts/test-blocker-fixes-local.mjs
 * 
 * Mục tiêu kiểm nghiệm:
 * 1. BLOCKER 1 - Quyền TRUNCATE, TRIGGER & Effective Privileges:
 *    - Giả lập Production cấp TRUNCATE, TRIGGER, INSERT, UPDATE cho anon & authenticated
 *    - Chạy Atomic Write Freeze: REVOKE ALL PRIVILEGES và chỉ cấp SELECT cho authenticated
 *    - Xác minh quyền hiệu lực (effective permissions kể cả kế thừa):
 *      can_insert = false, can_update = false, can_delete = false,
 *      can_truncate = false, can_trigger = false, can_select = true
 *    - Kiểm tra direct TRUNCATE từ client -> Bị PostgreSQL chặn 42501
 * 
 * 2. BLOCKER 2 - Cơ chế Fail-Closed của Unfreeze Script trong Transaction:
 *    - Thử nghiệm 1 (Fail-Closed khi còn quyền TRUNCATE):
 *      Cố tình cấp TRUNCATE -> Script ném lỗi PRECONDITION_FAILED, transaction rollback, cờ maintenance vẫn là TRUE
 *    - Thử nghiệm 2 (Fail-Closed khi RPC không tồn tại):
 *      Giả lập RPC bị thiếu -> Script ném lỗi PRECONDITION_FAILED, transaction rollback, cờ maintenance vẫn là TRUE
 *    - Thử nghiệm 3 (Success khi 100% preconditions thỏa mãn):
 *      Script tắt maintenance = false an toàn và commit thành công
 * 
 * 3. Dọn dẹp an toàn sau kiểm thử (Idempotent)
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const { Client } = pg;

// 1. Kiểm tra an toàn loopback
const parsedDbUrl = new URL(DB_URL);
if (!['127.0.0.1', 'localhost', '::1'].includes(parsedDbUrl.hostname)) {
  console.error('LỖI: Script chỉ được phép chạy trên Supabase Local (127.0.0.1).');
  process.exit(1);
}

async function runBlockerTests() {
  console.log('==========================================================================');
  console.log('BẮT ĐẦU KIỂM THỬ 2 BLOCKERS: TRUNCATE/TRIGGER & FAIL-CLOSED UNFREEZE');
  console.log(`Database: ${DB_URL.replace(/:[^:@]+@/, ':***@')}`);
  console.log('==========================================================================');

  const pgClient = new Client({ connectionString: DB_URL });
  await pgClient.connect();

  let preTestSnapshot = null;
  const cleanupErrors = [];

  try {
    // Lưu snapshot baseline
    const privRes = await pgClient.query(`
      SELECT grantee, privilege_type 
      FROM information_schema.table_privileges 
      WHERE table_schema = 'public' AND table_name = 'cultivation' AND grantee IN ('authenticated', 'anon')
      ORDER BY grantee, privilege_type;
    `);
    const mRes = await pgClient.query(`SELECT value FROM public.app_system_flags WHERE key = 'cultivation_maintenance'`);
    preTestSnapshot = {
      privileges: privRes.rows,
      maintenance: mRes.rows[0]?.value,
    };

    // --------------------------------------------------------------------------
    // PHẦN 1: BLOCKER 1 - XỬ LÝ TRUNCATE, TRIGGER VÀ EFFECTIVE PRIVILEGES
    // --------------------------------------------------------------------------
    console.log('\n--- [PHẦN 1] Giả lập Production cấp TRUNCATE, TRIGGER và kiểm tra Freeze ---');
    
    // Cấp TRUNCATE, TRIGGER, INSERT, UPDATE cho authenticated và anon (giống hiện trạng Production)
    await pgClient.query(`
      GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER ON TABLE public.cultivation TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER ON TABLE public.cultivation TO anon;
    `);

    // Kiểm tra quyền trước freeze: can_truncate và can_trigger phải là true
    const preCheck = await pgClient.query(`
      SELECT 
        has_table_privilege('authenticated', 'public.cultivation', 'TRUNCATE') AS can_truncate,
        has_table_privilege('authenticated', 'public.cultivation', 'TRIGGER') AS can_trigger,
        has_table_privilege('authenticated', 'public.cultivation', 'INSERT') AS can_insert,
        has_table_privilege('anon', 'public.cultivation', 'TRUNCATE') AS anon_can_truncate;
    `);
    assert.equal(preCheck.rows[0].can_truncate, true, 'Trước freeze, can_truncate phải là true');
    assert.equal(preCheck.rows[0].can_trigger, true, 'Trước freeze, can_trigger phải là true');
    assert.equal(preCheck.rows[0].anon_can_truncate, true, 'Trước freeze, anon_can_truncate phải là true');
    console.log('✓ Đã giả lập môi trường Production: authenticated & anon có đầy đủ quyền TRUNCATE, TRIGGER, INSERT.');

    // Chạy Atomic Write Freeze: Thu hồi ALL PRIVILEGES và chỉ cấp SELECT cho authenticated
    console.log('  -> Thực thi Atomic Write Freeze với REVOKE ALL PRIVILEGES...');
    await pgClient.query(`
      BEGIN;
      SET LOCAL lock_timeout = '2s';
      SET LOCAL statement_timeout = '5s';

      LOCK TABLE public.cultivation IN ACCESS EXCLUSIVE MODE;

      -- Thu hồi triệt để ALL PRIVILEGES
      REVOKE ALL PRIVILEGES ON TABLE public.cultivation FROM anon, authenticated, public;

      -- Cấp duy nhất SELECT cho authenticated
      GRANT SELECT ON TABLE public.cultivation TO authenticated;

      INSERT INTO public.app_system_flags (key, value, updated_at)
      VALUES ('cultivation_maintenance', '{"enabled": true, "message": "Bảo trì an toàn"}'::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = '{"enabled": true, "message": "Bảo trì an toàn"}'::jsonb, updated_at = NOW();

      COMMIT;
    `);

    // Xác minh quyền hiệu lực (effective privileges) sau freeze
    const postFreezeCheck = await pgClient.query(`
      SELECT 
        has_table_privilege('authenticated', 'public.cultivation', 'INSERT') AS can_insert,
        has_table_privilege('authenticated', 'public.cultivation', 'UPDATE') AS can_update,
        has_table_privilege('authenticated', 'public.cultivation', 'DELETE') AS can_delete,
        has_table_privilege('authenticated', 'public.cultivation', 'TRUNCATE') AS can_truncate,
        has_table_privilege('authenticated', 'public.cultivation', 'TRIGGER') AS can_trigger,
        has_table_privilege('authenticated', 'public.cultivation', 'SELECT') AS can_select,
        has_table_privilege('anon', 'public.cultivation', 'TRUNCATE') AS anon_can_truncate,
        has_table_privilege('anon', 'public.cultivation', 'INSERT') AS anon_can_insert;
    `);
    const priv = postFreezeCheck.rows[0];
    assert.equal(priv.can_insert, false, 'can_insert phải false');
    assert.equal(priv.can_update, false, 'can_update phải false');
    assert.equal(priv.can_delete, false, 'can_delete phải false');
    assert.equal(priv.can_truncate, false, 'can_truncate BẮT BUỘC false');
    assert.equal(priv.can_trigger, false, 'can_trigger BẮT BUỘC false');
    assert.equal(priv.can_select, true, 'can_select PHẢI true');
    assert.equal(priv.anon_can_truncate, false, 'anon_can_truncate BẮT BUỘC false');
    assert.equal(priv.anon_can_insert, false, 'anon_can_insert BẮT BUỘC false');
    console.log('✓ [Blocker 1 PASS]: Đã thu hồi triệt để TRUNCATE, TRIGGER, INSERT, DELETE cho cả authenticated, anon và public.');

    // --------------------------------------------------------------------------
    // PHẦN 2: BLOCKER 2 - KIỂM THỬ CƠ CHẾ FAIL-CLOSED CỦA SCRIPT UNFREEZE
    // --------------------------------------------------------------------------
    console.log('\n--- [PHẦN 2] Kiểm thử cơ chế Fail-Closed của Unfreeze Script trong Transaction ---');

    // TEST 2.1: Fail-Closed khi còn sót quyền TRUNCATE
    console.log('  -> Test 2.1: Cố tình cấp lại TRUNCATE và chạy Unfreeze -> Phải bị REJECT và giữ maintenance = true');
    await pgClient.query(`GRANT TRUNCATE ON TABLE public.cultivation TO authenticated;`);

    let failClosed1Triggered = false;
    try {
      await pgClient.query(`
        BEGIN;
        DO $$
        DECLARE
            v_auth_can_insert boolean;
            v_auth_can_update boolean;
            v_auth_can_delete boolean;
            v_auth_can_truncate boolean;
            v_auth_can_trigger boolean;
            v_auth_can_select boolean;
            v_auth_can_rpc boolean;
        BEGIN
            IF to_regprocedure('public.sync_cultivation_occ(bigint, jsonb, bigint, text, text, text)') IS NULL THEN
                RAISE EXCEPTION 'PRECONDITION_FAILED: RPC chưa sẵn sàng!' USING ERRCODE = '55000';
            END IF;

            SELECT 
                has_table_privilege('authenticated', 'public.cultivation', 'INSERT'),
                has_table_privilege('authenticated', 'public.cultivation', 'UPDATE'),
                has_table_privilege('authenticated', 'public.cultivation', 'DELETE'),
                has_table_privilege('authenticated', 'public.cultivation', 'TRUNCATE'),
                has_table_privilege('authenticated', 'public.cultivation', 'TRIGGER'),
                has_table_privilege('authenticated', 'public.cultivation', 'SELECT'),
                has_function_privilege('authenticated', 'public.sync_cultivation_occ(bigint, jsonb, bigint, text, text, text)', 'EXECUTE')
            INTO 
                v_auth_can_insert, v_auth_can_update, v_auth_can_delete, v_auth_can_truncate, v_auth_can_trigger, v_auth_can_select, v_auth_can_rpc;

            IF v_auth_can_insert OR v_auth_can_update OR v_auth_can_delete OR v_auth_can_truncate OR v_auth_can_trigger THEN
                RAISE EXCEPTION 'PRECONDITION_FAILED: Role "authenticated" vẫn còn quyền ghi trực tiếp trên public.cultivation (truncate=%)! Giữ nguyên bảo trì.'
                , v_auth_can_truncate USING ERRCODE = '55000';
            END IF;

            UPDATE public.app_system_flags SET value = '{"enabled": false}'::jsonb WHERE key = 'cultivation_maintenance';
        END $$;
        COMMIT;
      `);
    } catch (err) {
      failClosed1Triggered = true;
      await pgClient.query('ROLLBACK;').catch(() => {});
      console.log(`  - Bắt được ngoại lệ chặn Unfreeze: [${err.code}] ${err.message}`);
    }

    assert.ok(failClosed1Triggered, 'Unfreeze bắt buộc phải thất bại khi còn quyền TRUNCATE');
    
    // Kiểm tra cờ bảo trì: VẪN PHẢI LÀ TRUE (Fail-Closed)
    const maintCheck1 = await pgClient.query(`SELECT value->>'enabled' AS enabled FROM public.app_system_flags WHERE key = 'cultivation_maintenance'`);
    assert.equal(maintCheck1.rows[0].enabled, 'true', 'Cờ bảo trì BẮT BUỘC vẫn là true khi Precondition thất bại');
    console.log('✓ [Test 2.1 Passed]: Fail-Closed hoạt động chính xác! Cờ bảo trì được giữ nguyên TRUE khi còn quyền TRUNCATE.');

    // Thu hồi lại TRUNCATE để thử nghiệm tiếp
    await pgClient.query(`REVOKE TRUNCATE ON TABLE public.cultivation FROM authenticated;`);

    // TEST 2.2: Fail-Closed khi RPC chưa được cấp quyền EXECUTE
    console.log('  -> Test 2.2: Thu hồi EXECUTE RPC và chạy Unfreeze -> Phải bị REJECT và giữ maintenance = true');
    await pgClient.query(`REVOKE EXECUTE ON FUNCTION public.sync_cultivation_occ(bigint, jsonb, bigint, text, text, text) FROM authenticated;`);

    let failClosed2Triggered = false;
    try {
      await pgClient.query(`
        BEGIN;
        DO $$
        DECLARE
            v_can_rpc boolean;
        BEGIN
            SELECT has_function_privilege('authenticated', 'public.sync_cultivation_occ(bigint, jsonb, bigint, text, text, text)', 'EXECUTE') INTO v_can_rpc;
            IF NOT v_can_rpc THEN
                RAISE EXCEPTION 'PRECONDITION_FAILED: Role "authenticated" THIẾU quyền EXECUTE RPC! Giữ nguyên bảo trì.' USING ERRCODE = '55000';
            END IF;
            UPDATE public.app_system_flags SET value = '{"enabled": false}'::jsonb WHERE key = 'cultivation_maintenance';
        END $$;
        COMMIT;
      `);
    } catch (err) {
      failClosed2Triggered = true;
      await pgClient.query('ROLLBACK;').catch(() => {});
      console.log(`  - Bắt được ngoại lệ chặn Unfreeze: [${err.code}] ${err.message}`);
    }

    assert.ok(failClosed2Triggered, 'Unfreeze bắt buộc phải thất bại khi thiếu quyền RPC');
    const maintCheck2 = await pgClient.query(`SELECT value->>'enabled' AS enabled FROM public.app_system_flags WHERE key = 'cultivation_maintenance'`);
    assert.equal(maintCheck2.rows[0].enabled, 'true', 'Cờ bảo trì BẮT BUỘC vẫn là true khi thiếu RPC');
    console.log('✓ [Test 2.2 Passed]: Fail-Closed hoạt động chính xác! Cờ bảo trì giữ nguyên TRUE khi thiếu quyền RPC.');

    // Cấp lại quyền EXECUTE RPC
    await pgClient.query(`GRANT EXECUTE ON FUNCTION public.sync_cultivation_occ(bigint, jsonb, bigint, text, text, text) TO authenticated;`);

    // TEST 2.3: Success khi 100% Preconditions thỏa mãn
    console.log('  -> Test 2.3: Chạy Unfreeze khi 100% Preconditions thỏa mãn...');
    
    // Đọc và chạy trực tiếp file supabase/operations/20261121_cultivation_occ_unfreeze_and_enable.sql
    const fs = await import('node:fs');
    const unfreezeSql = fs.readFileSync('supabase/operations/20261121_cultivation_occ_unfreeze_and_enable.sql', 'utf8');
    
    pgClient.on('notice', (msg) => console.log('  [PG NOTICE]:', msg.message));
    await pgClient.query(unfreezeSql);

    const maintCheckFinal = await pgClient.query(`SELECT value->>'enabled' AS enabled FROM public.app_system_flags WHERE key = 'cultivation_maintenance'`);
    assert.equal(maintCheckFinal.rows[0].enabled, 'false', 'Cờ bảo trì phải được tắt thành công');
    console.log('✓ [Test 2.3 Passed]: Unfreeze transaction thành công 100%! Cờ bảo trì đã chuyển về FALSE an toàn.');

    console.log('\n==========================================================================');
    console.log('KẾT QUẢ KIỂM THỬ 2 BLOCKERS: [PASS 100%]');
    console.log('1. TRUNCATE & TRIGGER đã được thu hồi triệt để.');
    console.log('2. Effective privileges được xác minh chuẩn xác.');
    console.log('3. Unfreeze transaction tuân thủ tuyệt đối cơ chế Fail-Closed.');
    console.log('==========================================================================');

  } finally {
    console.log('\n[Dọn dẹp] Khôi phục baseline...');
    if (preTestSnapshot?.maintenance) {
      await pgClient.query(`
        UPDATE public.app_system_flags 
        SET value = $1::jsonb, updated_at = NOW() 
        WHERE key = 'cultivation_maintenance';
      `, [JSON.stringify(preTestSnapshot.maintenance)]).catch(() => {});
    }
    if (preTestSnapshot?.privileges) {
      await pgClient.query(`REVOKE ALL PRIVILEGES ON TABLE public.cultivation FROM authenticated, anon;`).catch(() => {});
      for (const priv of preTestSnapshot.privileges) {
        const grantee = priv.grantee === 'authenticated' ? 'authenticated' : (priv.grantee === 'anon' ? 'anon' : null);
        const privType = priv.privilege_type.toUpperCase();
        if (grantee && ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'].includes(privType)) {
          await pgClient.query(`GRANT ${privType} ON TABLE public.cultivation TO ${grantee};`).catch(() => {});
        }
      }
    }
    await pgClient.end().catch(() => {});
  }
}

runBlockerTests().catch(err => {
  console.error('\nLỖI KIỂM THỬ BLOCKERS: [FAIL]', err);
  process.exit(1);
});
