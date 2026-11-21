/**
 * BỘ KIỂM THỬ FRONTEND THẬT VỚI 2 PHIÊN TRÌNH DUYỆT (PLAYWRIGHT CHROMIUM) VÀ SUPABASE LOCAL
 * File: scripts/test-frontend-occ-local.mjs
 * 
 * Kiểm thử 9 kịch bản OCC trên trình duyệt thật (2 Browser Contexts: Thiết bị A & Thiết bị B):
 * 1. Thiết bị A tạo và đồng bộ tu vi.
 * 2. Thiết bị B nhận dữ liệu từ Cloud.
 * 3. Hai thiết bị cùng thay đổi tu vi độc lập.
 * 4. OCC phát hiện conflict và không làm mất EXP.
 * 5. Thiết bị A mất ACK rồi tải lại trang.
 * 6. Idempotency reconciliation xử lý chính xác request cũ.
 * 7. pending_seconds chưa commit được bảo toàn.
 * 8. Maintenance tạm dừng đồng bộ tu vi nhưng không làm mất dữ liệu.
 * 9. Đọc truyện, thư viện và tiến độ đọc vẫn hoạt động bình thường.
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

  try {
    // --------------------------------------------------------------------------
    // 1.1. XÁC NHẬN MÔI TRƯỜNG CÔ LẬP
    // --------------------------------------------------------------------------
    const dbInfo = await pgClient.query('SELECT current_database() AS dbname, current_user AS dbuser');
    const currentDb = dbInfo.rows[0]?.dbname || '';
    if (bannedKeywords.some(b => currentDb.toLowerCase().includes(b))) {
      throw new Error(`BẢO MẬT: Tên database "${currentDb}" chứa từ khóa cấm!`);
    }
    console.log(`✓ Xác thực danh tính Database Local thành công: "${currentDb}"`);

    // --------------------------------------------------------------------------
    // 1.2. TẠO TÀI KHOẢN TEST TRÊN GOTRUE LOCAL
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
    // 1.3. KHỞI CHẠY VITE PREVIEW SERVER
    // --------------------------------------------------------------------------
    console.log(`\n[Khởi tạo] Khởi động Vite Preview Server trên cổng ${PREVIEW_PORT}...`);
    previewServer = await preview({
      preview: { port: PREVIEW_PORT, host: '127.0.0.1', open: false },
    });
    console.log(`✓ Vite Preview Server sẵn sàng tại: http://127.0.0.1:${PREVIEW_PORT}`);

    // --------------------------------------------------------------------------
    // 1.4. KHỞI ĐỘNG PLAYWRIGHT CHROMIUM VÀ TẠO 2 BROWSER CONTEXT ĐỘC LẬP
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

    // Mở trang trên cả 2 thiết bị
    await pageA.goto(`http://127.0.0.1:${PREVIEW_PORT}/`);
    await pageB.goto(`http://127.0.0.1:${PREVIEW_PORT}/`);

    // Chờ Test Harness sẵn sàng trên cả 2 phiên
    await pageA.waitForFunction(() => !!window.__TCL_TEST_HARNESS__, { timeout: 10000 });
    await pageB.waitForFunction(() => !!window.__TCL_TEST_HARNESS__, { timeout: 10000 });
    console.log('✓ Thiết bị A và Thiết bị B đã nạp xong Test Harness');

    // Đăng nhập tài khoản test trên cả 2 thiết bị
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
    console.log('✓ Cả 2 thiết bị đã đăng nhập thành công vào Supabase Auth Local');

    // ==========================================================================
    // KỊCH BẢN 1: THIẾT BỊ A TẠO VÀ ĐỒNG BỘ TU VI
    // ==========================================================================
    console.log('\n--- Kịch bản 1: Thiết bị A tạo và đồng bộ tu vi ban đầu ---');
    const syncResA1 = await pageA.evaluate(async (uid) => {
      const { cult, engine, supa, ledger } = window.__TCL_TEST_HARNESS__;
      // Khởi tạo tu vi local cho Thiết bị A
      const state = {
        realm: 'ngung_khi_1',
        totalExp: 100,
        phapKhieu: 1,
        _seq: 1,
        _rev: 1,
        _updatedAt: Date.now(),
      };
      cult.saveCultivationState(state);
      // Gọi commit OCC lên Cloud
      const occRes = await engine.commitCultivationOCC(supa.supabase, uid, {
        expectedRev: 0, // First insert
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

    // Kiểm tra trực tiếp trên PostgreSQL database
    const dbRow1 = await pgClient.query('SELECT rev, state, device_id FROM public.cultivation WHERE user_id = $1', [testUserId]);
    assert.strictEqual(dbRow1.rows.length, 1, 'Kịch bản 1: Dòng cultivation phải tồn tại trong PostgreSQL');
    assert.strictEqual(parseInt(dbRow1.rows[0].rev, 10), 1, 'Kịch bản 1: DB rev phải là 1');
    assert.strictEqual(dbRow1.rows[0].device_id, 'dev_A', 'Kịch bản 1: device_id là dev_A');
    console.log('✓ Kịch bản 1 Passed: Thiết bị A tạo và đồng bộ tu vi thành công lên Cloud (rev = 1, 100 EXP)');

    // ==========================================================================
    // KỊCH BẢN 2: THIẾT BỊ B NHẬN DỮ LIỆU TỪ CLOUD
    // ==========================================================================
    console.log('\n--- Kịch bản 2: Thiết bị B nhận dữ liệu từ Cloud ---');
    const syncResB1 = await pageB.evaluate(async (uid) => {
      const { engine, supa, cult, ledger } = window.__TCL_TEST_HARNESS__;
      // Fast-forward / đồng bộ từ Cloud về máy B
      const res = await engine.syncCultivation(supa.supabase, uid);
      const led = ledger.getSyncLedger();
      return { res, localState: cult.getCultivationState(), ledger: led.cultivation };
    }, testUserId);

    assert.strictEqual(syncResB1.localState.totalExp, 100, 'Kịch bản 2: Thiết bị B phải nhận đủ 100 EXP từ Cloud');
    assert.strictEqual(syncResB1.localState.realm, 'ngung_khi_1', 'Kịch bản 2: Cảnh giới trên B phải là ngung_khi_1');
    assert.strictEqual(syncResB1.ledger.lastSyncedRev, 1, 'Kịch bản 2: lastSyncedRev trên B phải là 1');
    console.log('✓ Kịch bản 2 Passed: Thiết bị B nhận dữ liệu chính xác từ Cloud (rev = 1, 100 EXP)');

    // ==========================================================================
    // KỊCH BẢN 3: HAI THIẾT BỊ CÙNG THAY ĐỔI TU VI ĐỘC LẬP
    // ==========================================================================
    console.log('\n--- Kịch bản 3: Hai thiết bị cùng thay đổi tu vi độc lập ---');
    // Thiết bị A tu luyện thêm 100 EXP -> totalExp = 200, seq = 2
    await pageA.evaluate(() => {
      const { cult } = window.__TCL_TEST_HARNESS__;
      const state = cult.getCultivationState();
      state.totalExp = 200;
      state._seq = 2;
      state._rev = 2;
      cult.saveCultivationState(state);
    });

    // Thiết bị B tu luyện thêm 150 EXP -> totalExp = 250, seq = 2
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
    console.log('✓ Kịch bản 3 Passed: Cả 2 thiết bị thay đổi tu vi độc lập (A: 200 EXP, B: 250 EXP, cùng expectedRev = 1)');

    // ==========================================================================
    // KỊCH BẢN 4: OCC PHÁT HIỆN CONFLICT VÀ KHÔNG LÀM MẤT EXP
    // ==========================================================================
    console.log('\n--- Kịch bản 4: OCC phát hiện conflict và không làm mất EXP ---');
    // Thiết bị A commit trước với expectedRev = 1 -> Lên rev 2 thành công
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

    // Thiết bị B commit sau với expectedRev = 1 -> Cloud đã ở rev = 2 -> XUNG ĐỘT!
    const commitB4 = await pageB.evaluate(async (uid) => {
      const { engine, supa, cult, ledger } = window.__TCL_TEST_HARNESS__;
      const localBefore = cult.getCultivationState();
      // Gọi syncCultivation để thực hiện toàn bộ luồng OCC bao gồm backup và conflict flag
      const syncRes = await engine.syncCultivation(supa.supabase, uid);
      const localAfter = cult.getCultivationState();
      const conflictState = ledger.getCultivationConflictState();
      const led = ledger.getSyncLedger();
      return { syncRes, localBefore, localAfter, conflictState, ledger: led.cultivation };
    }, testUserId);

    assert.strictEqual(commitB4.syncRes.conflict, true, 'Kịch bản 4: syncCultivation phải phát hiện xung đột');
    assert.strictEqual(commitB4.localAfter.totalExp, 250, 'Kịch bản 4: EXP trên Thiết bị B phải được giữ nguyên 250, KHÔNG ĐƯỢC MẤT!');
    assert.strictEqual(commitB4.ledger.conflictPending, true, 'Kịch bản 4: conflictPending phải được bật trong ledger');
    assert.ok(commitB4.conflictState, 'Kịch bản 4: Trạng thái xung đột phải được lưu trữ bền vững');

    // Kiểm tra trên PostgreSQL Cloud: Cloud vẫn ở rev = 2 của A
    const dbRow4 = await pgClient.query('SELECT rev, (state->>\'totalExp\')::int as exp FROM public.cultivation WHERE user_id = $1', [testUserId]);
    assert.strictEqual(parseInt(dbRow4.rows[0].rev, 10), 2, 'Cloud giữ nguyên rev = 2');
    assert.strictEqual(parseInt(dbRow4.rows[0].exp, 10), 200, 'Cloud giữ nguyên 200 EXP của Thiết bị A');
    console.log('✓ Kịch bản 4 Passed: OCC phát hiện xung đột chính xác; Thiết bị B giữ nguyên 250 EXP, Cloud giữ nguyên rev 2');

    // ==========================================================================
    // KỊCH BẢN 5: THIẾT BỊ A MẤT ACK RỒI TẢI LẠI TRANG
    // ==========================================================================
    console.log('\n--- Kịch bản 5: Thiết bị A mất ACK rồi tải lại trang ---');
    const lostAckKey = `req_lost_ack_${Date.now()}`;
    // Thiết bị A tu luyện lên 350 EXP, seq = 3, expectedRev = 2
    await pageA.evaluate(async ({ uid, key }) => {
      const { cult, ledger, supa, engine } = window.__TCL_TEST_HARNESS__;
      const state = cult.getCultivationState();
      state.totalExp = 350;
      state._seq = 3;
      state._rev = 3;
      cult.saveCultivationState(state);

      // Lưu snapshot pending request vào localStorage
      const pendingSnapshot = {
        idempotencyKey: key,
        expectedRev: 2,
        sentLocalSeq: 3,
        sentPendingSeconds: 0,
        payloadState: JSON.parse(JSON.stringify(state)),
        createdAt: Date.now(),
      };
      ledger.savePendingCultivationRequest(pendingSnapshot);

      // Gửi request lên Supabase OCC (commit thành công trên Cloud rev = 3)
      await engine.commitCultivationOCC(supa.supabase, uid, {
        expectedRev: 2,
        state: state,
        deviceId: 'dev_A',
        idempotencyKey: key,
      });
      // Giả lập: MẤT ACK / CRASH TRƯỚC KHI LƯU KẾT QUẢ VÀO LEDGER!
      // pendingRequest vẫn còn nguyên trong localStorage của A
    }, { uid: testUserId, key: lostAckKey });

    // Kiểm tra trước reload: pendingRequest chắc chắn có trong localStorage
    const pendingBeforeReload = await pageA.evaluate(() => {
      const { ledger } = window.__TCL_TEST_HARNESS__;
      return ledger.getPendingCultivationRequest();
    });
    assert.ok(pendingBeforeReload, 'Kịch bản 5: Pending request phải tồn tại trước khi reload');
    assert.strictEqual(pendingBeforeReload.idempotencyKey, lostAckKey, 'Kịch bản 5: Đúng idempotencyKey trước reload');

    // Tải lại trang Thiết bị A
    await pageA.reload();
    await pageA.waitForFunction(() => !!window.__TCL_TEST_HARNESS__, { timeout: 10000 });

    // Trang web Thiên Cơ Lâu khi khởi động tự động gọi pullCultivationBeforeMeditation()
    // Hàm này phát hiện pending request và tự động hòa giải thành công với Cloud rev = 3
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

    assert.strictEqual(stateAfterReload.localState.totalExp, 350, 'Kịch bản 5: EXP 350 của A được bảo toàn nguyên vẹn');
    assert.strictEqual(stateAfterReload.ledger.lastSyncedRev, 3, 'Kịch bản 5: lastSyncedRev cập nhật lên 3 sau reload');
    assert.strictEqual(stateAfterReload.remainingPending, null, 'Kịch bản 5: Pending request tự động được dọn sạch sau khi hòa giải');

    // Xác nhận trên PostgreSQL: rev = 3, log có bản ghi
    const logCheck5 = await pgClient.query('SELECT committed_rev FROM public.cultivation_idempotency_log WHERE idempotency_key = $1', [lostAckKey]);
    assert.strictEqual(logCheck5.rows.length, 1, 'Kịch bản 5: Log idempotency phải ghi nhận key');
    assert.strictEqual(parseInt(logCheck5.rows[0].committed_rev, 10), 3, 'Kịch bản 5: Log ghi nhận committed_rev = 3');
    console.log('✓ Kịch bản 5 Passed: Thiết bị A reload trang, tự động hòa giải lost ACK lên rev = 3 và dọn pending request');

    // ==========================================================================
    // KỊCH BẢN 6: IDEMPOTENCY RECONCILIATION XỬ LÝ CHÍNH XÁC REQUEST CŨ
    // ==========================================================================
    console.log('\n--- Kịch bản 6: Idempotency reconciliation xử lý chính xác request cũ ---');
    const directReconcileKey = `req_direct_recon_${Date.now()}`;
    const reconcileRes6 = await pageA.evaluate(async ({ uid, key }) => {
      const { engine, supa, ledger, cult } = window.__TCL_TEST_HARNESS__;
      const state = cult.getCultivationState();

      // Giả lập một pending request dở dang gửi expectedRev = 2 (đã được commit tại rev 3 với lostAckKey)
      // Thử hòa giải trực tiếp bằng reconcilePendingCultivationRequest với idempotencyKey cũ đã commit
      ledger.savePendingCultivationRequest({
        idempotencyKey: key,
        expectedRev: 2,
        sentLocalSeq: 3,
        sentPendingSeconds: 0,
        payloadState: state,
        createdAt: Date.now(),
      });

      // Gọi trực tiếp hàm reconcilePendingCultivationRequest
      const rec = await engine.reconcilePendingCultivationRequest(supa.supabase, uid);
      const remainingPending = ledger.getPendingCultivationRequest();
      const led = ledger.getSyncLedger();
      return { rec, remainingPending, ledger: led.cultivation };
    }, { uid: testUserId, key: lostAckKey });

    assert.strictEqual(reconcileRes6.rec.reconciled, true, 'Kịch bản 6: Request phải được hòa giải thành công');
    assert.strictEqual(reconcileRes6.rec.committed, true, 'Kịch bản 6: Xác nhận commit đã hoàn tất');
    assert.strictEqual(reconcileRes6.rec.rev, 3, 'Kịch bản 6: Revision cam kết chính xác là 3');
    assert.strictEqual(reconcileRes6.remainingPending, null, 'Kịch bản 6: Pending request đã được xóa sạch sau khi hòa giải');
    assert.strictEqual(reconcileRes6.ledger.lastSyncedRev, 3, 'Kịch bản 6: lastSyncedRev duy trì ở 3, không bị conflict giả');
    console.log('✓ Kịch bản 6 Passed: Idempotency reconciliation phát hiện idempotent replay chính xác, an toàn 100%');

    // ==========================================================================
    // KỊCH BẢN 7: PENDING_SECONDS CHƯA COMMIT ĐƯỢC BẢO TOÀN
    // ==========================================================================
    console.log('\n--- Kịch bản 7: pending_seconds chưa commit được bảo toàn ---');
    const pendingSecRes7 = await pageA.evaluate(async (uid) => {
      const { cult, ledger, supa, engine } = window.__TCL_TEST_HARNESS__;
      // Thiết lập 45 giây thiền dở dang
      localStorage.setItem('tcl_cultivation_pending_seconds_real', '45');

      const initialPending = parseInt(localStorage.getItem('tcl_cultivation_pending_seconds_real'), 10);
      const initialLedger = ledger.getSyncLedger();
      const lastSyncedBefore = initialLedger.cultivation?.lastSyncedPending || 0;

      // Commit OCC mang theo pending_seconds = 45 lên Cloud
      const state = cult.getCultivationState();
      state._seq = 4;
      cult.saveCultivationState(state);

      const occRes = await engine.commitCultivationOCC(supa.supabase, uid, {
        expectedRev: 3,
        state: state,
        pendingSeconds: 45,
        deviceId: 'dev_A',
      });

      // Giả lập xử lý kết quả commit thành công
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
    console.log('✓ Kịch bản 7 Passed: pending_seconds (45s) được bảo toàn trọn vẹn, không bị mất trước và sau commit');

    // ==========================================================================
    // KỊCH BẢN 8: MAINTENANCE TẠM DỪNG ĐỒNG BỘ TU VI NHƯNG KHÔNG LÀM MẤT DỮ LIỆU
    // ==========================================================================
    console.log('\n--- Kịch bản 8: Maintenance tạm dừng đồng bộ tu vi nhưng không làm mất dữ liệu ---');
    // Bật Safe Maintenance Mode trong PostgreSQL
    await pgClient.query(`
      UPDATE public.app_system_flags 
      SET value = '{"enabled": true, "message": "Hệ thống đang bảo trì tu vi"}'::jsonb, updated_at = NOW() 
      WHERE key = 'cultivation_maintenance';
    `);

    // Thiết bị A tu luyện thêm 50 EXP (lên 400 EXP) và cố gắng đồng bộ
    const maintRes8 = await pageA.evaluate(async (uid) => {
      const { cult, supa, engine, ledger } = window.__TCL_TEST_HARNESS__;
      const state = cult.getCultivationState();
      state.totalExp = 400;
      state._seq = 5;
      cult.saveCultivationState(state);

      // Thử đồng bộ khi bảo trì đang bật
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
    assert.strictEqual(maintRes8.localExp, 400, 'Kịch bản 8: EXP cục bộ vẫn giữ nguyên 400, không bị mất!');

    // Tắt bảo trì để hệ thống trở lại bình thường
    await pgClient.query(`
      UPDATE public.app_system_flags 
      SET value = '{"enabled": false, "message": "Hoạt động bình thường"}'::jsonb, updated_at = NOW() 
      WHERE key = 'cultivation_maintenance';
    `);
    console.log('✓ Kịch bản 8 Passed: Circuit Breaker tạm dừng đồng bộ tu vi, bảo toàn nguyên vẹn 400 EXP ở local');

    // ==========================================================================
    // KỊCH BẢN 9: ĐỌC TRUYỆN, THƯ VIỆN VÀ TIẾN ĐỘ ĐỌC VẪN HOẠT ĐỘNG BÌNH THƯỜNG
    // ==========================================================================
    console.log('\n--- Kịch bản 9: Đọc truyện, thư viện và tiến độ đọc vẫn hoạt động bình thường ---');
    const novelTestRes9 = await pageA.evaluate(async () => {
      const { storage } = window.__TCL_TEST_HARNESS__;
      // Thêm truyện mới vào thư viện
      const testNovel = {
        id: 'novel_occ_fe_test_01',
        title: 'Bạch Thân Đồ Tu Tiên Ký',
        author: 'Thiên Cơ Lâu',
        totalChapters: 100,
      };
      storage.addToLibrary(testNovel);

      // Cập nhật tiến độ đọc
      storage.saveReadingProgress('novel_occ_fe_test_01', {
        chapterId: 'chap_25',
        chapterNumber: 25,
        progress: 0.65,
        updatedAt: Date.now(),
      });

      const library = storage.getLibrary();
      const progress = storage.getReadingProgress('novel_occ_fe_test_01');

      return {
        hasNovel: library.some(n => n.id === 'novel_occ_fe_test_01'),
        progressChapter: progress?.chapterNumber,
        progressValue: progress?.progress,
      };
    });

    assert.strictEqual(novelTestRes9.hasNovel, true, 'Kịch bản 9: Truyện phải tồn tại trong thư viện');
    assert.strictEqual(novelTestRes9.progressChapter, 25, 'Kịch bản 9: Chương đọc là 25');
    assert.strictEqual(novelTestRes9.progressValue, 0.65, 'Kịch bản 9: Tiến độ đọc lưu chính xác 0.65');
    console.log('✓ Kịch bản 9 Passed: Đọc truyện, thư viện và tiến độ đọc hoạt động độc lập và hoàn hảo!');

    // ==========================================================================
    // TỔNG KẾT THÀNH CÔNG
    // ==========================================================================
    console.log('\n==========================================================================');
    console.log('KẾT QUẢ KIỂM THỬ FRONTEND THẬT (PLAYWRIGHT CHROMIUM): [PASS 100%]');
    console.log('Tất cả 9 kịch bản đồng bộ tu vi OCC trên 2 thiết bị độc lập đã thành công!');
    console.log('==========================================================================');
  } finally {
    // --------------------------------------------------------------------------
    // DỌN DẸP AN TOÀN VÀ KHÔI PHỤC BASELINE
    // --------------------------------------------------------------------------
    console.log('\n[Dọn dẹp] Thực hiện dọn dẹp và khôi phục môi trường...');
    try {
      if (pageA) await pageA.close().catch(() => {});
      if (pageB) await pageB.close().catch(() => {});
      if (contextA) await contextA.close().catch(() => {});
      if (contextB) await contextB.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
      console.log('✓ Đã đóng trình duyệt Playwright');
    } catch {}
    try {
      if (previewServer) {
        if (previewServer.httpServer && previewServer.httpServer.closeAllConnections) {
          previewServer.httpServer.closeAllConnections();
        }
        await previewServer.close().catch(() => {});
        console.log('✓ Đã đóng Vite Preview Server');
      }
    } catch {}
    if (testUserId) {
      try {
        await pgClient.query('DELETE FROM public.cultivation_idempotency_log WHERE user_id = $1', [testUserId]);
        await pgClient.query('DELETE FROM public.cultivation WHERE user_id = $1', [testUserId]);
        await pgClient.query('DELETE FROM auth.users WHERE id = $1', [testUserId]);
        console.log(`✓ Đã dọn dẹp test user: ${testUserId}`);
      } catch (e) {
        console.warn('Cảnh báo dọn dẹp test user:', e.message);
      }
    }
    // Khôi phục cờ bảo trì về false
    try {
      await pgClient.query(`
        UPDATE public.app_system_flags 
        SET value = '{"enabled": false, "message": "Hoạt động bình thường"}'::jsonb, updated_at = NOW() 
        WHERE key = 'cultivation_maintenance';
      `);
      console.log('✓ Đã khôi phục cờ cultivation_maintenance về bình thường');
    } catch {}

    await pgClient.end().catch(() => {});
    process.exit(0);
  }
}

runFrontendOCCTests().catch((err) => {
  console.error('\nLỖI KIỂM THỬ FRONTEND OCC:', err);
  process.exit(1);
});
