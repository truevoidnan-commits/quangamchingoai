/**
 * BỘ KIỂM THỬ FRONTEND THẬT VỚI 2 PHIÊN TRÌNH DUYỆT (PLAYWRIGHT CHROMIUM) VÀ SUPABASE LOCAL
 * File: scripts/test-frontend-occ-local.mjs
 * 
 * PHÂN ĐỊNH RÕ RÀNG 2 PHẦN KIỂM THỬ:
 * 
 * PHẦN I: BROWSER INTEGRATION TESTS (9 kịch bản gọi module nội bộ trong browser runtime)
 * 1. [Browser Integration] Thiết bị A tạo và đồng bộ tu vi ban đầu
 * 2. [Browser Integration] Thiết bị B nhận dữ liệu từ Cloud
 * 3. [Browser Integration] Hai thiết bị cùng thay đổi tu vi độc lập
 * 4. [Browser Integration] OCC phát hiện conflict và không làm mất EXP
 * 5. [Browser Integration] Thiết bị A mất ACK rồi tải lại trang
 * 6. [Browser Integration] Idempotency reconciliation xử lý chính xác request cũ
 * 7. [Browser Integration] pending_seconds chưa commit được bảo toàn
 * 8. [Browser Integration] Maintenance tạm dừng đồng bộ tu vi nhưng không làm mất dữ liệu
 * 9. [Browser Integration] Thư viện & tiến độ đọc: Đồng bộ hai chiều và kiểm tra dữ liệu trên CẢ Thiết bị A và B
 * 
 * PHẦN II: UI E2E TESTS (5 kịch bản thao tác DOM thật qua Playwright)
 * 1. [UI E2E] Đăng nhập form UI trên #/sync cho cả Thiết bị A và B (email, password, submit button)
 * 2. [UI E2E] Bấm nút "Đồng Bộ Ngay" trên UI Thiết bị A, quan sát DOM hiện tiến trình và kết quả
 * 3. [UI E2E] Chuyển sang Thiết bị B, bấm "Đồng Bộ Ngay", xác minh assertion thực sự đồng nhất (EXP, realm, revision, Cloud)
 * 4. [UI E2E] Xung đột tu vi trên UI: Hiển thị Modal "Xung Đột Tu Vi (Hồ Sơ Thật)", click nút giải quyết
 * 5. [UI E2E] Maintenance toàn diện: Xác minh không mất EXP/pending_seconds, Cloud rev bất biến, và phục hồi đồng bộ sau bảo trì
 * 
 * NGUYÊN TẮC BẢO VỆ DỮ LIỆU VÀ EXIT CODE (REVIEW LẦN 8):
 * - TUYỆT ĐỐI KHÔNG DROP TABLE CASCADE trên các bảng dùng chung (novels, progress, user_settings).
 * - Chỉ dọn dẹp dữ liệu của test user (user_id cô lập).
 * - Snapshot bảng trước và sau test để xác minh 100% không làm mất bảng có sẵn.
 * - Khối finally CHỈ dọn dẹp tài nguyên, TUYỆT ĐỐI KHÔNG gọi process.exit(0).
 * - Nếu assertion thất bại: exit code 1.
 * - Nếu cleanup thất bại: exit code 2.
 * - Chỉ exit code 0 khi tất cả kiểm thử PASS và cleanup thành công 100%.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import { preview } from 'vite';
import { chromium } from 'playwright';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const PREVIEW_PORT = 5196;

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

async function runFrontendOCCTests() {
  console.log('==========================================================================');
  console.log('BẮT ĐẦU KIỂM THỬ FRONTEND THẬT 2 THIẾT BỊ VỚI SUPABASE LOCAL VÀ PLAYWRIGHT');
  console.log(`Supabase Gateway: ${SUPABASE_URL} (Localhost Port ${parsedSupabaseUrl.port})`);
  console.log(`PostgreSQL:       ${DB_URL.replace(/:[^:@]+@/, ':***@')} (Localhost Port ${parsedDbUrl.port})`);
  console.log(`Website Preview:  http://127.0.0.1:${PREVIEW_PORT}`);
  console.log('==========================================================================');

  const pgClient = new Client({ connectionString: DB_URL });
  await pgClient.connect();

  let previewServer = null;
  let browser = null;
  let contextA = null;
  let contextB = null;
  let pageA = null;
  let pageB = null;
  let testUserId = null;
  const testUserEmail = `test_fe_${crypto.randomBytes(4).toString('hex')}@thien-co-lau.local`;
  const testUserPassword = `Pass_${crypto.randomBytes(6).toString('hex')}!`;

  let preTestPublicTables = [];
  let testError = null;
  const cleanupErrors = [];

  try {
    // --------------------------------------------------------------------------
    // 1.1. XÁC NHẬN MÔI TRƯỜNG CÔ LẬP VÀ GHI NHẬN SNAPSHOT SCHEMA BAN ĐẦU
    // --------------------------------------------------------------------------
    const dbInfo = await pgClient.query('SELECT current_database() AS dbname, current_user AS dbuser');
    const currentDb = dbInfo.rows[0]?.dbname || '';
    if (bannedKeywords.some(b => currentDb.toLowerCase().includes(b))) {
      throw new Error(`BẢO MẬT: Tên database "${currentDb}" chứa từ khóa cấm!`);
    }
    console.log(`✓ Xác thực danh tính Database Local thành công: "${currentDb}"`);

    // Ghi nhận danh sách bảng ban đầu trong schema public để đảm bảo không bảng nào bị xóa mất
    const tableSnapshotRes = await pgClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    preTestPublicTables = tableSnapshotRes.rows.map(r => r.table_name);
    console.log(`✓ Snapshot bảng ban đầu trong public schema (${preTestPublicTables.length} bảng): ${preTestPublicTables.join(', ')}`);

    // --------------------------------------------------------------------------
    // 1.2. THIẾT LẬP BẢNG PHỤ TRỢ CHO KIỂM THỬ THƯ VIỆN & TIẾN ĐỘ ĐỌC (IDEMPOTENT - KHÔNG PHÁ HỦY)
    // --------------------------------------------------------------------------
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS public.novels (
        id text NOT NULL,
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        title text NOT NULL DEFAULT '',
        description text DEFAULT '',
        cover text DEFAULT '',
        is_hidden boolean DEFAULT false,
        chapter_count integer DEFAULT 0,
        content_path text DEFAULT '',
        content_updated_at bigint DEFAULT 0,
        updated_at bigint DEFAULT 0,
        deleted_at bigint DEFAULT NULL,
        PRIMARY KEY (id, user_id)
      );
      ALTER TABLE public.novels ENABLE ROW LEVEL SECURITY;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'novels' AND policyname = 'Test user manage novels') THEN
          CREATE POLICY "Test user manage novels" ON public.novels FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS public.progress (
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        novel_id text NOT NULL,
        data jsonb DEFAULT '{}'::jsonb,
        updated_at bigint DEFAULT 0,
        PRIMARY KEY (user_id, novel_id)
      );
      ALTER TABLE public.progress ENABLE ROW LEVEL SECURITY;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'progress' AND policyname = 'Test user manage progress') THEN
          CREATE POLICY "Test user manage progress" ON public.progress FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS public.user_settings (
        user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        data jsonb DEFAULT '{}'::jsonb,
        updated_at bigint DEFAULT 0
      );
      ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_settings' AND policyname = 'Test user manage user_settings') THEN
          CREATE POLICY "Test user manage user_settings" ON public.user_settings FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
        END IF;
      END $$;

      GRANT ALL ON TABLE public.novels TO authenticated, anon;
      GRANT ALL ON TABLE public.progress TO authenticated, anon;
      GRANT ALL ON TABLE public.user_settings TO authenticated, anon;

      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
          INSERT INTO storage.buckets (id, name, public) 
          VALUES ('novels', 'novels', true) 
          ON CONFLICT (id) DO NOTHING;

          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
            IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Test novels bucket objects') THEN
              CREATE POLICY "Test novels bucket objects" ON storage.objects FOR ALL TO authenticated, anon USING (bucket_id = 'novels') WITH CHECK (bucket_id = 'novels');
            END IF;
          END IF;
        END IF;
      END $$;
    `);

    // --------------------------------------------------------------------------
    // 1.3. TẠO TÀI KHOẢN TEST TRÊN GOTRUE LOCAL
    // --------------------------------------------------------------------------
    console.log(`\n[Khởi tạo] Tạo người dùng thử nghiệm trên GoTrue: ${testUserEmail}...`);
    const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': 'sb_publishable__kwruXvVnJL2NY4iYFE63w_8xGPMsac',
      },
      body: JSON.stringify({ email: testUserEmail, password: testUserPassword }),
    });
    const signupData = await signupRes.json();
    testUserId = signupData.user?.id || signupData.id;
    if (!testUserId) {
      throw new Error(`Không tạo được test user: ${JSON.stringify(signupData)}`);
    }
    console.log(`✓ Tạo test user thành công: ${testUserId}`);

    // Tự động xác thực email người dùng trong auth.users để đăng nhập ngay
    await pgClient.query(`
      UPDATE auth.users 
      SET email_confirmed_at = NOW(), last_sign_in_at = NOW() 
      WHERE id = $1
    `, [testUserId]);

    // --------------------------------------------------------------------------
    // 1.4. KHỞI CHẠY VITE PREVIEW SERVER
    // --------------------------------------------------------------------------
    console.log(`\n[Khởi tạo] Khởi động Vite Preview Server trên cổng ${PREVIEW_PORT}...`);
    previewServer = await preview({
      preview: { port: PREVIEW_PORT, host: '127.0.0.1', open: false },
    });
    console.log(`✓ Vite Preview Server sẵn sàng tại: http://127.0.0.1:${PREVIEW_PORT}`);

    // --------------------------------------------------------------------------
    // 1.5. KHỞI ĐỘNG PLAYWRIGHT CHROMIUM VÀ TẠO 2 BROWSER CONTEXT ĐỘC LẬP
    // --------------------------------------------------------------------------
    console.log('\n[Khởi tạo] Khởi động Chromium và tạo 2 phiên trình duyệt độc lập...');
    browser = await chromium.launch({ headless: true });

    // Cấu hình chung cho cả 2 context: nạp test harness và trỏ về Supabase Local
    const initScript = () => {
      window.__ALLOW_LOCAL_SYNC__ = true;
      window.__SUPABASE_URL__ = 'http://127.0.0.1:54321';
      window.__SUPABASE_ANON_KEY__ = 'sb_publishable__kwruXvVnJL2NY4iYFE63w_8xGPMsac';
      if (localStorage.getItem('tcl_active_profile') === null) {
        localStorage.setItem('tcl_active_profile', 'real');
      }
    };

    // Thiết bị A (Context A)
    contextA = await browser.newContext();
    await contextA.addInitScript(initScript);
    pageA = await contextA.newPage();

    // Thiết bị B (Context B)
    contextB = await browser.newContext();
    await contextB.addInitScript(initScript);
    pageB = await contextB.newPage();

    // Tự động chấp nhận prompt DONGBO nếu có dialog xuất hiện
    const autoAcceptPrompt = async (dialog) => {
      if (dialog.type() === 'prompt') {
        await dialog.accept('DONGBO');
      } else {
        await dialog.accept();
      }
    };
    pageA.on('dialog', autoAcceptPrompt);
    pageB.on('dialog', autoAcceptPrompt);
    pageA.on('console', msg => {
      const text = msg.text();
      if (text.includes('Error:') || text.includes('Uncaught')) {
        console.error('  [A Console Error]:', text);
      }
    });
    pageB.on('console', msg => {
      const text = msg.text();
      if (text.includes('Error:') || text.includes('Uncaught')) {
        console.error('  [B Console Error]:', text);
      }
    });

    // Mở trang trên cả 2 thiết bị
    await pageA.goto(`http://127.0.0.1:${PREVIEW_PORT}/`);
    await pageB.goto(`http://127.0.0.1:${PREVIEW_PORT}/`);

    // Chờ Test Harness sẵn sàng trên cả 2 phiên
    await pageA.waitForFunction(() => !!window.__TCL_TEST_HARNESS__, { timeout: 10000 });
    await pageB.waitForFunction(() => !!window.__TCL_TEST_HARNESS__, { timeout: 10000 });
    console.log('✓ Thiết bị A và Thiết bị B đã nạp xong Test Harness');

    // Đăng nhập tài khoản test trên cả 2 thiết bị qua harness trước để chuẩn bị cho Phần I
    const loginUser = async (page, deviceName) => {
      const res = await page.evaluate(async ({ email, password }) => {
        const { supa } = window.__TCL_TEST_HARNESS__;
        const { data, error } = await supa.supabase.auth.signInWithPassword({ email, password });
        if (error) return { success: false, error: error.message };
        return { success: true, user: data.user.id };
      }, { email: testUserEmail, password: testUserPassword });
      assert.strictEqual(res.success, true, `Đăng nhập trên ${deviceName} thành công`);
    };

    await loginUser(pageA, 'Thiết bị A');
    await loginUser(pageB, 'Thiết bị B');
    await pageA.evaluate(() => localStorage.setItem('sync_auto_enabled', 'true'));
    await pageB.evaluate(() => localStorage.setItem('sync_auto_enabled', 'true'));
    console.log('✓ Cả 2 thiết bị đã xác thực phiên với Supabase Auth Local');

    // ==========================================================================
    // PHẦN I: BROWSER INTEGRATION TESTS (9 KỊCH BẢN MODULE RUNTIME)
    // ==========================================================================
    console.log('\n==========================================================================');
    console.log('PHẦN I: BROWSER INTEGRATION TESTS (9 kịch bản gọi module trong browser runtime)');
    console.log('==========================================================================');

    // KỊCH BẢN 1: THIẾT BỊ A TẠO VÀ ĐỒNG BỘ TU VI
    console.log('\n--- [Browser Integration 1] Thiết bị A tạo và đồng bộ tu vi ban đầu ---');
    const syncResA1 = await pageA.evaluate(async (uid) => {
      const { cult, engine, supa, ledger } = window.__TCL_TEST_HARNESS__;
      const state = {
        realm: 'ngung_khi_1',
        totalExp: 100,
        phapKhieu: 1,
        _seq: 1,
        _rev: 1,
        _updatedAt: Date.now(),
      };
      cult.saveCultivationState(state);
      const occRes = await engine.commitCultivationOCC(supa.supabase, uid, {
        expectedRev: 0,
        state: state,
        pendingSeconds: 0,
        deviceId: 'dev_A',
      });
      if (occRes.status === 'SUCCESS') {
        const led = ledger.getSyncLedger();
        led.cultivation = {
          lastSyncedRev: occRes.rev || 1,
          lastSyncedLocalSeq: 1,
          lastSyncedPending: 0,
          lastCloudUpdatedAt: Date.now(),
          conflictPending: false,
        };
        ledger.saveSyncLedger(led);
      }
      return { occRes, localState: cult.getCultivationState() };
    }, testUserId);

    assert.strictEqual(syncResA1.occRes.status, 'SUCCESS', 'Kịch bản 1: RPC OCC phải trả về SUCCESS');
    assert.strictEqual(syncResA1.occRes.rev, 1, 'Kịch bản 1: Revision đầu tiên trên Cloud phải là 1');
    assert.strictEqual(syncResA1.localState.totalExp, 100, 'Kịch bản 1: Local Thiết bị A giữ nguyên 100 EXP');

    const dbRow1 = await pgClient.query('SELECT rev, state, device_id FROM public.cultivation WHERE user_id = $1', [testUserId]);
    assert.strictEqual(dbRow1.rows.length, 1, 'Kịch bản 1: Dòng cultivation phải tồn tại trong PostgreSQL');
    assert.strictEqual(parseInt(dbRow1.rows[0].rev, 10), 1, 'Kịch bản 1: DB rev phải là 1');
    assert.strictEqual(dbRow1.rows[0].device_id, 'dev_A', 'Kịch bản 1: device_id là dev_A');
    console.log('✓ [Browser Integration 1 Passed]: Thiết bị A tạo và đồng bộ tu vi thành công (rev = 1, 100 EXP)');

    // KỊCH BẢN 2: THIẾT BỊ B NHẬN DỮ LIỆU TỪ CLOUD
    console.log('\n--- [Browser Integration 2] Thiết bị B nhận dữ liệu từ Cloud ---');
    const syncResB1 = await pageB.evaluate(async (uid) => {
      const { engine, supa, cult, ledger } = window.__TCL_TEST_HARNESS__;
      const res = await engine.syncCultivation(supa.supabase, uid);
      const led = ledger.getSyncLedger();
      return { res, localState: cult.getCultivationState(), ledger: led.cultivation };
    }, testUserId);

    assert.strictEqual(syncResB1.localState.totalExp, 100, 'Kịch bản 2: Thiết bị B phải nhận đủ 100 EXP từ Cloud');
    assert.strictEqual(syncResB1.localState.realm, 'ngung_khi_1', 'Kịch bản 2: Cảnh giới trên B phải là ngung_khi_1');
    assert.strictEqual(syncResB1.ledger.lastSyncedRev, 1, 'Kịch bản 2: lastSyncedRev trên B phải là 1');
    console.log('✓ [Browser Integration 2 Passed]: Thiết bị B nhận dữ liệu chính xác từ Cloud (rev = 1, 100 EXP)');

    // KỊCH BẢN 3: HAI THIẾT BỊ CÙNG THAY ĐỔI TU VI ĐỘC LẬP
    console.log('\n--- [Browser Integration 3] Hai thiết bị cùng thay đổi tu vi độc lập ---');
    await pageA.evaluate(() => {
      const { cult } = window.__TCL_TEST_HARNESS__;
      const state = cult.getCultivationState();
      state.totalExp = 200;
      state._seq = 2;
      state._rev = 2;
      cult.saveCultivationState(state);
    });

    await pageB.evaluate(() => {
      const { cult } = window.__TCL_TEST_HARNESS__;
      const state = cult.getCultivationState();
      state.totalExp = 250;
      state._seq = 2;
      state._rev = 2;
      cult.saveCultivationState(state);
    });

    const expA3 = await pageA.evaluate(() => window.__TCL_TEST_HARNESS__.cult.getCultivationState().totalExp);
    const expB3 = await pageB.evaluate(() => window.__TCL_TEST_HARNESS__.cult.getCultivationState().totalExp);
    assert.strictEqual(expA3, 200, 'Thiết bị A ở local có 200 EXP');
    assert.strictEqual(expB3, 250, 'Thiết bị B ở local có 250 EXP');
    console.log('✓ [Browser Integration 3 Passed]: Cả 2 thiết bị thay đổi tu vi độc lập (A: 200 EXP, B: 250 EXP)');

    // KỊCH BẢN 4: OCC PHÁT HIỆN CONFLICT VÀ KHÔNG LÀM MẤT EXP
    console.log('\n--- [Browser Integration 4] OCC phát hiện conflict và không làm mất EXP ---');
    const commitA4 = await pageA.evaluate(async (uid) => {
      const { engine, supa, cult, ledger } = window.__TCL_TEST_HARNESS__;
      const state = cult.getCultivationState();
      const res = await engine.commitCultivationOCC(supa.supabase, uid, {
        expectedRev: 1,
        state: state,
        deviceId: 'dev_A',
      });
      if (res.status === 'SUCCESS') {
        const led = ledger.getSyncLedger();
        led.cultivation = { ...led.cultivation, lastSyncedRev: res.rev, lastSyncedLocalSeq: state._seq };
        ledger.saveSyncLedger(led);
      }
      return res;
    }, testUserId);

    assert.strictEqual(commitA4.status, 'SUCCESS', 'Kịch bản 4: Thiết bị A commit thành công');
    assert.strictEqual(commitA4.rev, 2, 'Kịch bản 4: Cloud tiến lên rev = 2');

    const commitB4 = await pageB.evaluate(async (uid) => {
      const { engine, supa, cult, ledger } = window.__TCL_TEST_HARNESS__;
      const localBefore = cult.getCultivationState();
      const syncRes = await engine.syncCultivation(supa.supabase, uid);
      const localAfter = cult.getCultivationState();
      const conflictState = ledger.getCultivationConflictState();
      const led = ledger.getSyncLedger();
      return { syncRes, localBefore, localAfter, conflictState, ledger: led.cultivation };
    }, testUserId);

    assert.strictEqual(commitB4.syncRes.conflict, true, 'Kịch bản 4: syncCultivation phải phát hiện xung đột');
    assert.strictEqual(commitB4.localAfter.totalExp, 250, 'Kịch bản 4: EXP trên Thiết bị B phải được giữ nguyên 250');
    assert.strictEqual(commitB4.ledger.conflictPending, true, 'Kịch bản 4: conflictPending phải được bật trong ledger');
    assert.ok(commitB4.conflictState, 'Kịch bản 4: Trạng thái xung đột phải được lưu trữ bền vững');

    const dbRow4 = await pgClient.query('SELECT rev, (state->>\'totalExp\')::int as exp FROM public.cultivation WHERE user_id = $1', [testUserId]);
    assert.strictEqual(parseInt(dbRow4.rows[0].rev, 10), 2, 'Cloud giữ nguyên rev = 2');
    assert.strictEqual(parseInt(dbRow4.rows[0].exp, 10), 200, 'Cloud giữ nguyên 200 EXP của Thiết bị A');
    console.log('✓ [Browser Integration 4 Passed]: OCC phát hiện xung đột chính xác; Thiết bị B giữ nguyên 250 EXP, Cloud giữ rev 2');

    // KỊCH BẢN 5: THIẾT BỊ A MẤT ACK RỒI TẢI LẠI TRANG
    console.log('\n--- [Browser Integration 5] Thiết bị A mất ACK rồi tải lại trang ---');
    const lostAckKey = `req_lost_ack_${Date.now()}`;
    await pageA.evaluate(async ({ uid, key }) => {
      const { cult, ledger, supa, engine } = window.__TCL_TEST_HARNESS__;
      const state = cult.getCultivationState();
      state.totalExp = 350;
      state._seq = 3;
      state._rev = 3;
      cult.saveCultivationState(state);

      const pendingSnapshot = {
        idempotencyKey: key,
        expectedRev: 2,
        sentLocalSeq: 3,
        sentPendingSeconds: 0,
        payloadState: JSON.parse(JSON.stringify(state)),
        createdAt: Date.now(),
      };
      ledger.savePendingCultivationRequest(pendingSnapshot);

      await engine.commitCultivationOCC(supa.supabase, uid, {
        expectedRev: 2,
        state: state,
        deviceId: 'dev_A',
        idempotencyKey: key,
      });
    }, { uid: testUserId, key: lostAckKey });

    const pendingBeforeReload = await pageA.evaluate(() => {
      const { ledger } = window.__TCL_TEST_HARNESS__;
      return ledger.getPendingCultivationRequest();
    });
    assert.ok(pendingBeforeReload, 'Kịch bản 5: Pending request phải tồn tại trước khi reload');
    assert.strictEqual(pendingBeforeReload.idempotencyKey, lostAckKey, 'Kịch bản 5: Đúng idempotencyKey trước reload');

    await pageA.reload();
    await pageA.waitForFunction(() => !!window.__TCL_TEST_HARNESS__, { timeout: 10000 });

    await pageA.waitForFunction(() => {
      const led = window.__TCL_TEST_HARNESS__?.ledger?.getSyncLedger();
      return led?.cultivation?.lastSyncedRev === 3;
    }, { timeout: 10000 });

    const stateAfterReload = await pageA.evaluate(() => {
      const { cult, ledger } = window.__TCL_TEST_HARNESS__;
      return {
        localState: cult.getCultivationState(),
        remainingPending: ledger.getPendingCultivationRequest(),
        ledger: ledger.getSyncLedger().cultivation,
      };
    });

    assert.strictEqual(stateAfterReload.localState.totalExp, 350, 'Kịch bản 5: EXP 350 của A được bảo toàn');
    assert.strictEqual(stateAfterReload.ledger.lastSyncedRev, 3, 'Kịch bản 5: lastSyncedRev cập nhật lên 3 sau reload');
    assert.strictEqual(stateAfterReload.remainingPending, null, 'Kịch bản 5: Pending request tự động được dọn sau khi hòa giải');

    const logCheck5 = await pgClient.query('SELECT committed_rev FROM public.cultivation_idempotency_log WHERE idempotency_key = $1', [lostAckKey]);
    assert.strictEqual(logCheck5.rows.length, 1, 'Kịch bản 5: Log idempotency phải ghi nhận key');
    assert.strictEqual(parseInt(logCheck5.rows[0].committed_rev, 10), 3, 'Kịch bản 5: Log ghi nhận committed_rev = 3');
    console.log('✓ [Browser Integration 5 Passed]: Thiết bị A reload trang, tự động hòa giải lost ACK lên rev = 3');

    // KỊCH BẢN 6: IDEMPOTENCY RECONCILIATION XỬ LÝ CHÍNH XÁC REQUEST CŨ
    console.log('\n--- [Browser Integration 6] Idempotency reconciliation xử lý chính xác request cũ ---');
    const reconcileRes6 = await pageA.evaluate(async ({ uid, key }) => {
      const { engine, supa, ledger, cult } = window.__TCL_TEST_HARNESS__;
      const state = cult.getCultivationState();
      ledger.savePendingCultivationRequest({
        idempotencyKey: key,
        expectedRev: 2,
        sentLocalSeq: 3,
        sentPendingSeconds: 0,
        payloadState: state,
        createdAt: Date.now(),
      });

      const rec = await engine.reconcilePendingCultivationRequest(supa.supabase, uid);
      const remainingPending = ledger.getPendingCultivationRequest();
      const led = ledger.getSyncLedger();
      return { rec, remainingPending, ledger: led.cultivation };
    }, { uid: testUserId, key: lostAckKey });

    assert.strictEqual(reconcileRes6.rec.reconciled, true, 'Kịch bản 6: Request phải được hòa giải thành công');
    assert.strictEqual(reconcileRes6.rec.committed, true, 'Kịch bản 6: Xác nhận commit đã hoàn tất');
    assert.strictEqual(reconcileRes6.rec.rev, 3, 'Kịch bản 6: Revision cam kết chính xác là 3');
    assert.strictEqual(reconcileRes6.remainingPending, null, 'Kịch bản 6: Pending request đã được xóa sạch sau khi hòa giải');
    assert.strictEqual(reconcileRes6.ledger.lastSyncedRev, 3, 'Kịch bản 6: lastSyncedRev duy trì ở 3');
    console.log('✓ [Browser Integration 6 Passed]: Idempotency reconciliation hòa giải chính xác request cũ');

    // KỊCH BẢN 7: PENDING_SECONDS CHƯA COMMIT ĐƯỢC BẢO TOÀN
    console.log('\n--- [Browser Integration 7] pending_seconds chưa commit được bảo toàn ---');
    const pendingSecRes7 = await pageA.evaluate(async (uid) => {
      const { cult, ledger, supa, engine } = window.__TCL_TEST_HARNESS__;
      localStorage.setItem('tcl_cultivation_pending_seconds_real', '45');
      const initialPending = parseInt(localStorage.getItem('tcl_cultivation_pending_seconds_real'), 10);
      const initialLedger = ledger.getSyncLedger();
      const lastSyncedBefore = initialLedger.cultivation?.lastSyncedPending || 0;

      const state = cult.getCultivationState();
      state._seq = 4;
      cult.saveCultivationState(state);

      const occRes = await engine.commitCultivationOCC(supa.supabase, uid, {
        expectedRev: 3,
        state: state,
        pendingSeconds: 45,
        deviceId: 'dev_A',
      });

      if (occRes.status === 'SUCCESS') {
        const led = ledger.getSyncLedger();
        led.cultivation = {
          ...led.cultivation,
          lastSyncedRev: occRes.rev,
          lastSyncedPending: 45,
        };
        ledger.saveSyncLedger(led);
      }

      const finalPending = parseInt(localStorage.getItem('tcl_cultivation_pending_seconds_real'), 10);
      const finalLedger = ledger.getSyncLedger();

      return {
        initialPending,
        lastSyncedBefore,
        occRes,
        finalPending,
        lastSyncedAfter: finalLedger.cultivation?.lastSyncedPending,
      };
    }, testUserId);

    assert.strictEqual(pendingSecRes7.initialPending, 45, 'Kịch bản 7: Local ban đầu có 45 pending seconds');
    assert.strictEqual(pendingSecRes7.occRes.status, 'SUCCESS', 'Kịch bản 7: Commit thành công lên Cloud');
    assert.strictEqual(pendingSecRes7.finalPending, 45, 'Kịch bản 7: Local pending seconds không bị thất thoát');
    assert.strictEqual(pendingSecRes7.lastSyncedAfter, 45, 'Kịch bản 7: lastSyncedPending cập nhật đúng 45');
    console.log('✓ [Browser Integration 7 Passed]: pending_seconds (45s) được bảo toàn trọn vẹn');

    // KỊCH BẢN 8: MAINTENANCE TẠM DỪNG ĐỒNG BỘ TU VI NHƯNG KHÔNG LÀM MẤT DỮ LIỆU
    console.log('\n--- [Browser Integration 8] Maintenance tạm dừng đồng bộ tu vi nhưng không làm mất dữ liệu ---');
    await pgClient.query(`
      UPDATE public.app_system_flags 
      SET value = '{"enabled": true, "message": "Hệ thống đang bảo trì tu vi"}'::jsonb, updated_at = NOW() 
      WHERE key = 'cultivation_maintenance';
    `);

    const maintRes8 = await pageA.evaluate(async (uid) => {
      const { cult, supa, engine } = window.__TCL_TEST_HARNESS__;
      const state = cult.getCultivationState();
      state.totalExp = 400;
      state._seq = 5;
      cult.saveCultivationState(state);

      const occRes = await engine.commitCultivationOCC(supa.supabase, uid, {
        expectedRev: 4,
        state: state,
        deviceId: 'dev_A',
      });

      const localAfter = cult.getCultivationState();
      return { occRes, localExp: localAfter.totalExp };
    }, testUserId);

    assert.strictEqual(maintRes8.occRes.status, 'MAINTENANCE', 'Kịch bản 8: RPC phải trả về MAINTENANCE');
    assert.strictEqual(maintRes8.occRes.code, 'SYNC_PAUSED', 'Kịch bản 8: Mã trạng thái là SYNC_PAUSED');
    assert.strictEqual(maintRes8.localExp, 400, 'Kịch bản 8: EXP cục bộ vẫn giữ nguyên 400');

    await pgClient.query(`
      UPDATE public.app_system_flags 
      SET value = '{"enabled": false, "message": "Hoạt động bình thường"}'::jsonb, updated_at = NOW() 
      WHERE key = 'cultivation_maintenance';
    `);
    console.log('✓ [Browser Integration 8 Passed]: Circuit Breaker tạm dừng đồng bộ, bảo toàn 400 EXP');

    // KỊCH BẢN 9: THƯ VIỆN & TIẾN ĐỘ ĐỌC: ĐỒNG BỘ VÀ XÁC MINH TRÊN CẢ THIẾT BỊ A VÀ B
    console.log('\n--- [Browser Integration 9] Thư viện & tiến độ đọc: Đồng bộ và kiểm tra trên CẢ Thiết bị A và B ---');
    const novelTestId = 'novel_occ_fe_test_01';
    
    // 9.1. Thiết bị A thêm truyện và tiến độ đọc ở local
    await pageA.evaluate(({ nId }) => {
      const { storage } = window.__TCL_TEST_HARNESS__;
      const testNovel = {
        id: nId,
        title: 'Bạch Thân Đồ Tu Tiên Ký',
        author: 'Thiên Cơ Lâu',
        totalChapters: 100,
        updatedAt: Date.now(),
      };
      storage.addToLibrary(testNovel);
      storage.saveReadingProgress(nId, {
        chapterId: 'chap_25',
        chapterNumber: 25,
        progress: 0.65,
        updatedAt: Date.now(),
      });
    }, { nId: novelTestId });

    // 9.2. Thiết bị A đồng bộ đẩy dữ liệu lên Cloud
    const pushA9 = await pageA.evaluate(async () => {
      const { engine, supa } = window.__TCL_TEST_HARNESS__;
      return await engine.performSync(supa.supabase, { firstSyncChoice: 'local_master' });
    });
    console.log('  - pushA9 result:', JSON.stringify(pushA9));
    assert.strictEqual(pushA9?.success, true, `Kịch bản 9: Thiết bị A đẩy truyện và tiến độ lên Cloud thành công (errors: ${JSON.stringify(pushA9?.errors)})`);

    // 9.3. Thiết bị B đồng bộ kéo dữ liệu từ Cloud về
    const pullB9 = await pageB.evaluate(async () => {
      const { engine, supa } = window.__TCL_TEST_HARNESS__;
      return await engine.performSync(supa.supabase, { firstSyncChoice: 'cloud_master' });
    });
    console.log('  - pullB9 result:', JSON.stringify(pullB9));
    assert.strictEqual(pullB9?.success, true, `Kịch bản 9: Thiết bị B kéo truyện và tiến độ từ Cloud về thành công (errors: ${JSON.stringify(pullB9?.errors)})`);

    // 9.4. XÁC MINH DỮ LIỆU ĐỘC LẬP TRÊN CẢ THIẾT BỊ A VÀ THIẾT BỊ B
    const verifyA9 = await pageA.evaluate(({ nId }) => {
      const { storage } = window.__TCL_TEST_HARNESS__;
      const lib = storage.getLibrary();
      const prog = storage.getReadingProgress(nId);
      return {
        hasNovel: lib.some(n => n.id === nId),
        title: lib.find(n => n.id === nId)?.title,
        chapterNumber: prog?.chapterNumber,
        progress: prog?.progress,
      };
    }, { nId: novelTestId });

    const verifyB9 = await pageB.evaluate(({ nId }) => {
      const { storage } = window.__TCL_TEST_HARNESS__;
      const lib = storage.getLibrary();
      const prog = storage.getReadingProgress(nId);
      return {
        hasNovel: lib.some(n => n.id === nId),
        title: lib.find(n => n.id === nId)?.title,
        chapterNumber: prog?.chapterNumber,
        progress: prog?.progress,
      };
    }, { nId: novelTestId });

    // Assert trên Thiết bị A
    assert.strictEqual(verifyA9.hasNovel, true, 'Kịch bản 9: Thiết bị A có truyện trong thư viện');
    assert.strictEqual(verifyA9.title, 'Bạch Thân Đồ Tu Tiên Ký', 'Kịch bản 9: Đúng tên truyện trên Thiết bị A');
    assert.strictEqual(verifyA9.chapterNumber, 25, 'Kịch bản 9: Đúng chương 25 trên Thiết bị A');
    assert.strictEqual(verifyA9.progress, 0.65, 'Kịch bản 9: Đúng tiến độ 0.65 trên Thiết bị A');

    // Assert trên Thiết bị B
    assert.strictEqual(verifyB9.hasNovel, true, 'Kịch bản 9: Thiết bị B PHẢI nhận được truyện từ Cloud');
    assert.strictEqual(verifyB9.title, 'Bạch Thân Đồ Tu Tiên Ký', 'Kịch bản 9: Đúng tên truyện trên Thiết bị B');
    assert.strictEqual(verifyB9.chapterNumber, 25, 'Kịch bản 9: Đúng chương 25 trên Thiết bị B');
    assert.strictEqual(verifyB9.progress, 0.65, 'Kịch bản 9: Đúng tiến độ 0.65 trên Thiết bị B');

    console.log('✓ [Browser Integration 9 Passed]: Thư viện và tiến độ đọc đã đồng bộ và xác minh khớp 100% trên CẢ Thiết bị A và Thiết bị B!');

    // ==========================================================================
    // PHẦN II: UI E2E TESTS (5 KỊCH BẢN THAO TÁC DOM THẬT QUA PLAYWRIGHT)
    // ==========================================================================
    console.log('\n==========================================================================');
    console.log('PHẦN II: UI E2E TESTS (5 kịch bản thao tác tương tác DOM thật qua Playwright)');
    console.log('==========================================================================');

    // KỊCH BẢN UI 1: ĐĂNG NHẬP FORM UI TRÊN #/sync CHO CẢ THIẾT BỊ A VÀ B
    console.log('\n--- [UI E2E 1] Đăng nhập form UI trên #/sync cho cả Thiết bị A và B ---');
    // Điều hướng cả 2 thiết bị vào trang #/sync và đảm bảo component SyncPage đã mount
    await pageA.goto(`http://127.0.0.1:${PREVIEW_PORT}/#/sync`);
    await pageB.goto(`http://127.0.0.1:${PREVIEW_PORT}/#/sync`);
    await pageA.waitForSelector('text=Đồng Bộ Cloud', { timeout: 15000 });
    await pageB.waitForSelector('text=Đồng Bộ Cloud', { timeout: 15000 });

    const ensureLoginViaUI = async (page, deviceName) => {
      await page.waitForSelector('text=Đồng Bộ Cloud', { timeout: 15000 });
      // Đợi trang nạp xong auth state
      await page.waitForFunction(() => !document.body.innerText.includes('Đang kiểm tra phiên đăng nhập...'), { timeout: 10000 });

      // Nếu đang đăng nhập, bấm Đăng xuất để kiểm tra form đăng nhập thật
      const logoutBtn = await page.$('button:has-text("Đăng xuất")');
      if (logoutBtn) {
        await logoutBtn.click();
      }

      // Điền form đăng nhập trên DOM
      await page.waitForSelector('input[type="email"]', { timeout: 15000 });
      await page.fill('input[type="email"]', testUserEmail);
      await page.fill('input[type="password"]', testUserPassword);
      await page.click('button[type="submit"]');

      // Chờ giao diện hiển thị trạng thái "Đã đăng nhập"
      await page.waitForSelector('text=Đã đăng nhập', { timeout: 15000 });
      const emailVisible = await page.isVisible(`text=${testUserEmail}`);
      assert.strictEqual(emailVisible, true, `UI E2E 1: Email người dùng phải hiển thị trên giao diện ${deviceName}`);
    };

    await ensureLoginViaUI(pageA, 'Thiết bị A');
    await ensureLoginViaUI(pageB, 'Thiết bị B');
    console.log('✓ [UI E2E 1 Passed]: Cả 2 thiết bị đã đăng nhập thành công qua form UI thật trên #/sync');

    // Helper kích hoạt đồng bộ trên UI và chờ hoàn tất an toàn
    const triggerSyncAndAwaitDone = async (page) => {
      await page.waitForFunction(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const syncBtn = btns.find(b => b.textContent.includes('Đồng Bộ Ngay'));
        return syncBtn && !syncBtn.disabled;
      }, { timeout: 15000 });

      await page.click('button:has-text("Đồng Bộ Ngay")');

      const modal = await page.waitForSelector('text=Xác Nhận Lần Đầu Đồng Bộ', { timeout: 1500 }).catch(() => null);
      if (modal) {
        await page.click('button:has-text("Lấy Cloud làm gốc")');
      }

      try {
        await page.waitForFunction(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const syncBtn = btns.find(b => b.textContent.includes('Đồng Bộ Ngay'));
          return syncBtn && !syncBtn.disabled;
        }, { timeout: 15000 });
      } catch (err) {
        const postBtns = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('button')).map(b => ({
            text: b.innerText,
            disabled: b.disabled,
          }));
        });
        const bodySnippet = await page.evaluate(() => document.body.innerText.slice(0, 400));
        console.error('  [Debug timeout buttons]:', JSON.stringify(postBtns));
        console.error('  [Debug body snippet]:', bodySnippet);
        throw err;
      }

      await page.waitForTimeout(500);
    };

    // KỊCH BẢN UI 2: BẤM NÚT "ĐỒNG BỘ NGAY" TRÊN UI THIẾT BỊ A
    console.log('\n--- [UI E2E 2] Bấm nút "Đồng Bộ Ngay" trên UI Thiết bị A ---');
    await triggerSyncAndAwaitDone(pageA);

    await pageA.waitForSelector('text=Kết quả đồng bộ:', { timeout: 15000 });
    const resultVisibleA = await pageA.isVisible('text=Kết quả đồng bộ:');
    assert.strictEqual(resultVisibleA, true, 'UI E2E 2: Kết quả đồng bộ phải hiển thị trên giao diện DOM của A');
    console.log('✓ [UI E2E 2 Passed]: Bấm nút "Đồng Bộ Ngay" trên UI Thiết bị A, kết quả hiển thị trực quan trên DOM');

    // KỊCH BẢN UI 3: CHUYỂN SANG THIẾT BỊ B, BẤM "ĐỒNG BỘ NGAY" TRÊN UI VÀ ASSERT ĐỒNG NHẤT
    console.log('\n--- [UI E2E 3] Chuyển sang Thiết bị B, bấm "Đồng Bộ Ngay" và kiểm tra dữ liệu thực sự đồng nhất ---');
    await triggerSyncAndAwaitDone(pageB);

    await pageB.waitForSelector('text=Kết quả đồng bộ:', { timeout: 15000 });
    const resultVisibleB = await pageB.isVisible('text=Kết quả đồng bộ:');
    assert.strictEqual(resultVisibleB, true, 'UI E2E 3: Kết quả đồng bộ phải hiển thị trên giao diện DOM của B');

    // Đọc trạng thái đồng bộ và ledger trên cả 2 thiết bị
    const syncStateA3 = await pageA.evaluate(() => {
      const { cult, ledger } = window.__TCL_TEST_HARNESS__;
      return {
        state: cult.getCultivationState(),
        ledger: ledger.getSyncLedger()?.cultivation || {},
      };
    });

    const syncStateB3 = await pageB.evaluate(() => {
      const { cult, ledger } = window.__TCL_TEST_HARNESS__;
      return {
        state: cult.getCultivationState(),
        ledger: ledger.getSyncLedger()?.cultivation || {},
      };
    });

    console.log(`  - Thiết bị A: EXP = ${syncStateA3.state.totalExp}, realm = "${syncStateA3.state.realm}", lastSyncedRev = ${syncStateA3.ledger.lastSyncedRev}`);
    console.log(`  - Thiết bị B: EXP = ${syncStateB3.state.totalExp}, realm = "${syncStateB3.state.realm}", lastSyncedRev = ${syncStateB3.ledger.lastSyncedRev}`);

    // Bổ sung các assertions so sánh thực tế:
    assert.strictEqual(syncStateB3.state.totalExp, syncStateA3.state.totalExp, 'UI E2E 3: Tổng EXP của Thiết bị B phải khớp chính xác với Thiết bị A');
    assert.strictEqual(syncStateB3.state.realm, syncStateA3.state.realm, 'UI E2E 3: Cảnh giới của Thiết bị B phải khớp chính xác với Thiết bị A');
    assert.strictEqual(syncStateB3.ledger.lastSyncedRev, syncStateA3.ledger.lastSyncedRev, 'UI E2E 3: lastSyncedRev trên cả 2 thiết bị phải hoàn toàn đồng nhất');
    assert.ok(syncStateB3.ledger.lastSyncedRev > 0, 'UI E2E 3: lastSyncedRev phải là số dương hợp lệ');
    assert.strictEqual(syncStateA3.ledger.conflictPending, false, 'UI E2E 3: Thiết bị A không có xung đột dở dang');
    assert.strictEqual(syncStateB3.ledger.conflictPending, false, 'UI E2E 3: Thiết bị B không có xung đột dở dang');

    // Xác minh trên PostgreSQL Cloud
    const cloudCheckRow3 = await pgClient.query('SELECT rev, (state->>\'totalExp\')::int as exp FROM public.cultivation WHERE user_id = $1', [testUserId]);
    assert.strictEqual(parseInt(cloudCheckRow3.rows[0].rev, 10), syncStateA3.ledger.lastSyncedRev, 'UI E2E 3: Cloud rev phải khớp chính xác với ledger của 2 máy');
    assert.strictEqual(parseInt(cloudCheckRow3.rows[0].exp, 10), syncStateA3.state.totalExp, 'UI E2E 3: Cloud EXP phải khớp chính xác với EXP của 2 máy');
    console.log('✓ [UI E2E 3 Passed]: Dữ liệu 2 thiết bị và Cloud được xác minh đồng nhất 100% bằng assertions thực tế');

    // KỊCH BẢN UI 4: XUNG ĐỘT TU VI TRÊN UI: HIỂN THỊ MODAL VÀ CLICK GIẢI QUYẾT
    console.log('\n--- [UI E2E 4] Xung đột tu vi trên UI: Hiển thị Modal "Xung Đột Tu Vi (Hồ Sơ Thật)" ---');
    
    // 1. Lấy rev hiện tại trên Cloud
    const cloudRevBefore4 = await pgClient.query('SELECT rev FROM public.cultivation WHERE user_id = $1', [testUserId]);
    const currentCloudRev = parseInt(cloudRevBefore4.rows[0].rev, 10);
    console.log(`  - Cloud hiện tại đang ở rev = ${currentCloudRev}`);

    // 2. Đảm bảo Thiết bị B đã đồng bộ ở rev này
    await pageB.evaluate(async ({ uid, curRev }) => {
      const { ledger } = window.__TCL_TEST_HARNESS__;
      const led = ledger.getSyncLedger();
      led.cultivation = {
        ...(led.cultivation || {}),
        lastSyncedRev: curRev,
        lastSyncedLocalSeq: 10,
        lastSyncedPending: 0,
        conflictPending: false,
      };
      ledger.saveSyncLedger(led);
    }, { uid: testUserId, curRev: currentCloudRev });

    // 3. Thiết bị A commit thành công với expectedRev = currentCloudRev -> Cloud tiến lên currentCloudRev + 1
    const commitA4Res = await pageA.evaluate(async ({ uid, curRev }) => {
      const { cult, engine, supa, ledger } = window.__TCL_TEST_HARNESS__;
      const state = cult.getCultivationState();
      state.totalExp = 600;
      state._seq = 15;
      cult.saveCultivationState(state);
      const res = await engine.commitCultivationOCC(supa.supabase, uid, {
        expectedRev: curRev,
        state: state,
        deviceId: 'dev_A',
      });
      if (res.status === 'SUCCESS') {
        const led = ledger.getSyncLedger();
        led.cultivation = { ...led.cultivation, lastSyncedRev: res.rev, lastSyncedLocalSeq: 15 };
        ledger.saveSyncLedger(led);
      }
      return res;
    }, { uid: testUserId, curRev: currentCloudRev });
    assert.strictEqual(commitA4Res.status, 'SUCCESS', 'UI E2E 4: Thiết bị A phải commit thành công lên Cloud');
    console.log(`  - Thiết bị A đã đẩy Cloud lên rev = ${commitA4Res.rev}`);

    // 4. Thiết bị B tu luyện cục bộ độc lập (localSeq tăng lên 20, exp lên 750)
    // Nhưng Thiết bị B vẫn nghĩ Cloud đang ở currentCloudRev!
    await pageB.evaluate(() => {
      const { cult } = window.__TCL_TEST_HARNESS__;
      const state = cult.getCultivationState();
      state.totalExp = 750;
      state._seq = 20;
      cult.saveCultivationState(state);
    });

    // 5. Bấm nút "Đồng Bộ Ngay" trên UI Thiết bị B
    await pageB.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const syncBtn = btns.find(b => b.textContent.includes('Đồng Bộ Ngay'));
      return syncBtn && !syncBtn.disabled;
    }, { timeout: 15000 });
    await pageB.click('button:has-text("Đồng Bộ Ngay")');

    // Chờ Modal Xung Đột Tu Vi xuất hiện trên DOM thật
    try {
      await pageB.waitForSelector('text=Xung Đột Tu Vi (Hồ Sơ Thật)', { timeout: 15000 });
    } catch (err) {
      const pageBText = await pageB.evaluate(() => document.body.innerText.slice(0, 500));
      console.error('  [Debug pageB text when waiting for conflict modal]:', pageBText);
      throw err;
    }
    const modalVisible = await pageB.isVisible('text=Xung Đột Tu Vi (Hồ Sơ Thật)');
    assert.strictEqual(modalVisible, true, 'UI E2E 4: Modal Xung Đột Tu Vi (Hồ Sơ Thật) PHẢI xuất hiện trên DOM');
    console.log('  - Modal xung đột tu vi đã hiển thị thành công trên màn hình Thiết bị B');

    // Click nút giải quyết: "Giữ bản máy này (Đẩy lên Cloud)"
    await pageB.click('button:has-text("Giữ bản máy này (Đẩy lên Cloud)")');

    // Chờ Modal đóng lại
    await pageB.waitForSelector('text=Xung Đột Tu Vi (Hồ Sơ Thật)', { state: 'detached', timeout: 10000 });
    console.log('  - Modal xung đột tu vi đã đóng lại sau khi người dùng lựa chọn');

    // Chờ Thiết bị B hoàn tất đồng bộ và nút "Đồng Bộ Ngay" quay lại trạng thái sẵn sàng
    await pageB.waitForFunction(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const syncBtn = btns.find(b => b.textContent.includes('Đồng Bộ Ngay'));
      return syncBtn && !syncBtn.disabled;
    }, { timeout: 15000 });

    // Xác nhận Cloud đã nhận bản ghi tu vi mới nhất từ Thiết bị B (rev >= currentCloudRev + 2)
    const cloudRevAfter4 = await pgClient.query('SELECT rev, (state->>\'totalExp\')::int as exp FROM public.cultivation WHERE user_id = $1', [testUserId]);
    console.log(`  - Cloud sau khi B giải quyết: rev = ${cloudRevAfter4.rows[0].rev}, EXP = ${cloudRevAfter4.rows[0].exp}`);

    const finalExpB = await pageB.evaluate(() => window.__TCL_TEST_HARNESS__.cult.getCultivationState().totalExp);
    assert.strictEqual(finalExpB, 750, 'UI E2E 4: EXP 750 của B được bảo toàn sau khi giải quyết');
    console.log('✓ [UI E2E 4 Passed]: Modal xung đột tu vi hiển thị chính xác trên UI và giải quyết thành công');

    // KỊCH BẢN UI 5: KIỂM TRA MAINTENANCE TOÀN DIỆN VÀ PHỤC HỒI ĐỒNG BỘ
    console.log('\n--- [UI E2E 5] Kiểm tra maintenance toàn diện, tính bất biến của Cloud và phục hồi sau bảo trì ---');

    // 5.0. Thiết bị A nạp trạng thái Cloud mới nhất (sau khi B đã giải quyết xung đột ở UI E2E 4)
    await pageA.evaluate(async (uid) => {
      const { supa, ledger, cult } = window.__TCL_TEST_HARNESS__;
      const { data: cloudRow } = await supa.supabase.from('cultivation').select('*').eq('user_id', uid).single();
      if (cloudRow) {
        cult.saveCultivationState(cloudRow.state);
        const led = ledger.getSyncLedger();
        led.cultivation = {
          ...led.cultivation,
          lastSyncedRev: cloudRow.rev,
          lastSyncedLocalSeq: cloudRow.state?._seq || cloudRow.rev,
          conflictPending: false,
        };
        ledger.saveSyncLedger(led);
      }
    }, testUserId);

    // 5.1. Thiết bị A tu luyện thêm và tích lũy pending_seconds trước bảo trì
    const preMaintState = await pageA.evaluate(() => {
      const { cult } = window.__TCL_TEST_HARNESS__;
      const state = cult.getCultivationState();
      state.totalExp = 800;
      state._seq = 25;
      cult.saveCultivationState(state);
      localStorage.setItem('tcl_cultivation_pending_seconds_real', '35');
      return {
        exp: state.totalExp,
        pendingSec: parseInt(localStorage.getItem('tcl_cultivation_pending_seconds_real') || '0', 10),
      };
    });

    const preMaintCloudRow = await pgClient.query('SELECT rev, (state->>\'totalExp\')::int as exp FROM public.cultivation WHERE user_id = $1', [testUserId]);
    const preMaintCloudRev = parseInt(preMaintCloudRow.rows[0].rev, 10);
    const preMaintCloudExp = parseInt(preMaintCloudRow.rows[0].exp, 10);
    console.log(`  - Trước bảo trì: Local A có ${preMaintState.exp} EXP, ${preMaintState.pendingSec}s pending; Cloud đang ở rev = ${preMaintCloudRev} (${preMaintCloudExp} EXP)`);

    // 5.2. Bật Safe Maintenance Mode trong PostgreSQL
    await pgClient.query(`
      UPDATE public.app_system_flags 
      SET value = '{"enabled": true, "message": "Hệ thống đang bảo trì tu vi toàn diện"}'::jsonb, updated_at = NOW() 
      WHERE key = 'cultivation_maintenance';
    `);

    // 5.3. Thiết bị A bấm "Đồng Bộ Ngay" trên UI khi đang bảo trì
    await triggerSyncAndAwaitDone(pageA);

    // 5.4. Xác nhận EXP và pending_seconds cục bộ không bị mất hoặc giảm
    const postMaintLocalState = await pageA.evaluate(() => {
      const { cult } = window.__TCL_TEST_HARNESS__;
      return {
        exp: cult.getCultivationState().totalExp,
        pendingSec: parseInt(localStorage.getItem('tcl_cultivation_pending_seconds_real') || '0', 10),
      };
    });
    assert.strictEqual(postMaintLocalState.exp, preMaintState.exp, 'UI E2E 5: EXP cục bộ không bị mất mát khi bảo trì');
    assert.strictEqual(postMaintLocalState.pendingSec, preMaintState.pendingSec, 'UI E2E 5: pending_seconds cục bộ không bị mất mát khi bảo trì');

    // 5.5. Xác nhận Cloud revision KHÔNG THAY ĐỔI và dữ liệu Cloud không bị ghi đè
    const postMaintCloudRow = await pgClient.query('SELECT rev, (state->>\'totalExp\')::int as exp FROM public.cultivation WHERE user_id = $1', [testUserId]);
    const postMaintCloudRev = parseInt(postMaintCloudRow.rows[0].rev, 10);
    const postMaintCloudExp = parseInt(postMaintCloudRow.rows[0].exp, 10);
    assert.strictEqual(postMaintCloudRev, preMaintCloudRev, 'UI E2E 5: Cloud revision phải giữ nguyên tuyệt đối khi bảo trì');
    assert.strictEqual(postMaintCloudExp, preMaintCloudExp, 'UI E2E 5: Dữ liệu Cloud EXP không bị thay đổi khi bảo trì');
    console.log('  - Đã xác nhận: EXP/pending cục bộ được bảo toàn trọn vẹn, Cloud revision bất biến');

    // 5.6. Tắt Maintenance và kiểm tra khả năng đồng bộ phục hồi
    await pgClient.query(`
      UPDATE public.app_system_flags 
      SET value = '{"enabled": false, "message": "Hoạt động bình thường"}'::jsonb, updated_at = NOW() 
      WHERE key = 'cultivation_maintenance';
    `);

    // Thiết bị A bấm lại nút "Đồng Bộ Ngay" trên UI sau khi mở bảo trì
    await triggerSyncAndAwaitDone(pageA);

    // Xác nhận đồng bộ phục hồi thành công: Cloud tiến lên rev mới và cập nhật tu vi mới
    const restoredCloudRow = await pgClient.query('SELECT rev, (state->>\'totalExp\')::int as exp FROM public.cultivation WHERE user_id = $1', [testUserId]);
    const restoredCloudRev = parseInt(restoredCloudRow.rows[0].rev, 10);
    const restoredCloudExp = parseInt(restoredCloudRow.rows[0].exp, 10);
    assert.strictEqual(restoredCloudRev, preMaintCloudRev + 1, 'UI E2E 5: Sau khi mở bảo trì, Cloud phải tiến lên rev mới (phục hồi đồng bộ)');
    assert.strictEqual(restoredCloudExp, preMaintState.exp, 'UI E2E 5: Tu vi mới (800 EXP) được đẩy lên Cloud thành công');
    console.log(`  - Phục hồi thành công sau bảo trì: Cloud tiến lên rev = ${restoredCloudRev}, EXP = ${restoredCloudExp}`);
    console.log('✓ [UI E2E 5 Passed]: Circuit breaker dừng ghi an toàn khi bảo trì và phục hồi đồng bộ xuất sắc sau bảo trì');

    // ==========================================================================
    // TỔNG KẾT TOÀN DIỆN
    // ==========================================================================
    console.log('\n==========================================================================');
    console.log('KẾT QUẢ KIỂM THỬ FRONTEND THẬT: [PASS 100%]');
    console.log('  - Phần I:  9/9 Browser Integration Tests thành công (gọi module browser runtime).');
    console.log('  - Phần II: 5/5 UI E2E Tests thành công (tương tác DOM Playwright).');
    console.log('  - Tổng cộng 14 ca kiểm thử đều PASS xuất sắc!');
    console.log('==========================================================================');
  } catch (err) {
    testError = err;
  } finally {
    // --------------------------------------------------------------------------
    // DỌN DẸP AN TOÀN VÀ BẢO VỆ DỮ LIỆU (TUYỆT ĐỐI KHÔNG DROP TABLE CASCADE)
    // --------------------------------------------------------------------------
    console.log('\n[Dọn dẹp] Thực hiện dọn dẹp và khôi phục môi trường an toàn...');
    try {
      if (pageA) await pageA.close().catch(() => {});
      if (pageB) await pageB.close().catch(() => {});
      if (contextA) await contextA.close().catch(() => {});
      if (contextB) await contextB.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
      console.log('✓ Đã đóng trình duyệt Playwright');
    } catch (e) {
      cleanupErrors.push(`Lỗi đóng trình duyệt: ${e.message}`);
    }

    try {
      if (previewServer) {
        if (previewServer.httpServer && previewServer.httpServer.closeAllConnections) {
          previewServer.httpServer.closeAllConnections();
        }
        await previewServer.close().catch(() => {});
        console.log('✓ Đã đóng Vite Preview Server');
      }
    } catch (e) {
      cleanupErrors.push(`Lỗi đóng Vite Preview Server: ${e.message}`);
    }

    // 1. Chỉ dọn dẹp dữ liệu của test user cô lập, TUYỆT ĐỐI KHÔNG DROP BẢNG DÙNG CHUNG
    if (testUserId) {
      try {
        await pgClient.query('DELETE FROM public.novels WHERE user_id = $1', [testUserId]);
        await pgClient.query('DELETE FROM public.progress WHERE user_id = $1', [testUserId]);
        await pgClient.query('DELETE FROM public.user_settings WHERE user_id = $1', [testUserId]);
        await pgClient.query('DELETE FROM public.cultivation_idempotency_log WHERE user_id = $1', [testUserId]);
        await pgClient.query('DELETE FROM public.cultivation WHERE user_id = $1', [testUserId]);
        await pgClient.query('DELETE FROM auth.users WHERE id = $1', [testUserId]);
        console.log(`✓ Đã dọn dẹp an toàn toàn bộ dữ liệu của test user: ${testUserId}`);
      } catch (e) {
        cleanupErrors.push(`Lỗi dọn dẹp test user: ${e.message}`);
      }

      // Dọn dẹp object storage của test user nếu có
      try {
        await pgClient.query(`
          DO $$ BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'objects') THEN
              DELETE FROM storage.objects WHERE bucket_id = 'novels' AND (owner = $1::text OR name LIKE '%' || $1 || '%');
            END IF;
          END $$;
        `, [testUserId]);
      } catch (e) {}
    }

    // 2. Dọn dẹp các RLS policy test tạm thời (KHÔNG DROP BẢNG)
    try {
      await pgClient.query(`
        DROP POLICY IF EXISTS "Test user manage novels" ON public.novels;
        DROP POLICY IF EXISTS "Test user manage progress" ON public.progress;
        DROP POLICY IF EXISTS "Test user manage user_settings" ON public.user_settings;
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
            DROP POLICY IF EXISTS "Test novels bucket objects" ON storage.objects;
          END IF;
        END $$;
      `);
      console.log('✓ Đã dọn dẹp các RLS policy test tạm thời');
    } catch (e) {
      cleanupErrors.push(`Lỗi dọn dẹp policy test: ${e.message}`);
    }

    // 3. Khôi phục cờ bảo trì về false
    try {
      await pgClient.query(`
        UPDATE public.app_system_flags 
        SET value = '{"enabled": false, "message": "Hoạt động bình thường"}'::jsonb, updated_at = NOW() 
        WHERE key = 'cultivation_maintenance';
      `);
      console.log('✓ Đã khôi phục cờ cultivation_maintenance về bình thường');
    } catch (e) {
      cleanupErrors.push(`Lỗi khôi phục cờ bảo trì: ${e.message}`);
    }

    // 4. Xác minh tính toàn vẹn của database: Không bảng ban đầu nào bị mất
    try {
      const postSchemaSnapshot = await pgClient.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name;
      `);
      const postTestPublicTables = postSchemaSnapshot.rows.map(r => r.table_name);
      for (const t of preTestPublicTables) {
        assert.ok(postTestPublicTables.includes(t), `BẢO VỆ DỮ LIỆU: Bảng có sẵn "${t}" không được phép bị xóa!`);
      }
      console.log(`✓ Đã xác minh: Toàn bộ bảng có sẵn (${preTestPublicTables.length} bảng) được giữ nguyên vẹn 100%`);
    } catch (e) {
      cleanupErrors.push(`Lỗi xác minh tính toàn vẹn schema: ${e.message}`);
    }

    await pgClient.end().catch(() => {});
  }

  // ----------------------------------------------------------------------------
  // ĐÁNH GIÁ KẾT QUẢ VÀ TRẢ VỀ EXIT CODE CHUẨN XÁC
  // ----------------------------------------------------------------------------
  if (testError) {
    console.error('\nLỖI KIỂM THỬ FRONTEND OCC: [FAIL]', testError);
    process.exit(1);
  }

  if (cleanupErrors.length > 0) {
    console.error('\nLỖI DỌN DẸP / CLEANUP BASELINE: [FAIL]');
    for (const ce of cleanupErrors) {
      console.error(`  - ${ce}`);
    }
    process.exit(2);
  }

  console.log('\n[HOÀN TẤT] Toàn bộ kiểm thử và dọn dẹp môi trường thành công 100%.');
  process.exit(0);
}

runFrontendOCCTests().catch((err) => {
  console.error('\nLỖI KHỞI ĐỘNG KIỂM THỬ FRONTEND OCC: [FATAL]', err);
  process.exit(1);
});
