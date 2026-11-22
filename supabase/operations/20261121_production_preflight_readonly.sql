-- ==============================================================================
-- THIÊN CƠ LÂU — PRODUCTION PREFLIGHT READ-ONLY VERIFICATION SCRIPT
-- File: supabase/operations/20261121_production_preflight_readonly.sql
-- 
-- MỤC ĐÍCH:
-- Thu thập 100% thông tin cấu trúc, quyền hạn, chính sách và dữ liệu thống kê
-- trên môi trường Supabase Production TRƯỚC KHI thực hiện bất kỳ migration nào.
-- 
-- AN TOÀN TUYỆT ĐỐI (ZERO RUNTIME / SYNTAX RISK):
-- 1. Chạy trong transaction READ ONLY (cấm hoàn toàn mọi thao tác thay đổi dữ liệu/DDL).
-- 2. Cài đặt statement_timeout = 10s chống treo truy vấn.
-- 3. Không tham chiếu trực tiếp bất kỳ cột hoặc bảng nào chưa được xác minh.
-- 4. Sử dụng information_schema, system catalogs và dynamic SQL an toàn.
-- 5. Kết thúc bằng ROLLBACK để đảm bảo 100% không lưu trạng thái.
-- ==============================================================================

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '10s';

-- ------------------------------------------------------------------------------
-- 1. THÔNG TIN MÔI TRƯỜNG & HỆ QUẢN TRỊ CSDL
-- ------------------------------------------------------------------------------
SELECT 
    current_database() AS database_name,
    current_user AS connected_user,
    version() AS postgres_version,
    now() AS server_time,
    pg_is_in_recovery() AS is_read_replica;

-- ------------------------------------------------------------------------------
-- 2. KIỂM TRA LỊCH SỬ MIGRATION SUPABASE (SCHEMA_MIGRATIONS) QUA DYNAMIC SQL
-- ------------------------------------------------------------------------------
SELECT 
    column_name, 
    data_type 
FROM information_schema.columns 
WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
ORDER BY ordinal_position;

DO $$
DECLARE
    v_has_migrations_table boolean;
    v_has_name_col boolean;
    r record;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations'
    ) INTO v_has_migrations_table;

    IF NOT v_has_migrations_table THEN
        RAISE NOTICE '>>> MIGRATIONS: Bảng supabase_migrations.schema_migrations CHƯA TỒN TẠI.';
        RETURN;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations' AND column_name = 'name'
    ) INTO v_has_name_col;

    IF v_has_name_col THEN
        FOR r IN EXECUTE 'SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 10' LOOP
            RAISE NOTICE '>>> MIGRATION ĐÃ ÁP DỤNG: version = %, name = %', r.version, r.name;
        END LOOP;
    ELSE
        FOR r IN EXECUTE 'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 10' LOOP
            RAISE NOTICE '>>> MIGRATION ĐÃ ÁP DỤNG: version = %', r.version;
        END LOOP;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3. KIỂM TRA SỰ TỒN TẠI CỦA CÁC BẢNG LIÊN QUAN ĐẾN OCC
-- ------------------------------------------------------------------------------
SELECT 
    table_schema,
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('cultivation', 'cultivation_idempotency_log', 'app_system_flags')
ORDER BY table_name;

-- ------------------------------------------------------------------------------
-- 4. CẤU TRÚC CHI TIẾT CÁC CỘT CỦA BẢNG public.cultivation
-- ------------------------------------------------------------------------------
SELECT 
    c.ordinal_position AS pos,
    c.column_name,
    c.data_type,
    c.udt_name,
    c.is_nullable,
    c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public' 
  AND c.table_name = 'cultivation'
ORDER BY c.ordinal_position;

-- ------------------------------------------------------------------------------
-- 5. RÀNG BUỘC (CONSTRAINTS) & KHÓA CHÍNH (PRIMARY KEY) TRÊN BẢNG cultivation
-- ------------------------------------------------------------------------------
SELECT 
    con.conname AS constraint_name,
    CASE con.contype
        WHEN 'p' THEN 'PRIMARY KEY'
        WHEN 'u' THEN 'UNIQUE'
        WHEN 'f' THEN 'FOREIGN KEY'
        WHEN 'c' THEN 'CHECK'
        ELSE con.contype::text
    END AS constraint_type,
    pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class cls ON con.conrelid = cls.oid
JOIN pg_namespace ns ON cls.relnamespace = ns.oid
WHERE ns.nspname = 'public' AND cls.relname = 'cultivation'
ORDER BY con.contype, con.conname;

-- ------------------------------------------------------------------------------
-- 6. CHỈ MỤC (INDEXES) HIỆN HỮU TRÊN BẢNG cultivation
-- ------------------------------------------------------------------------------
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'cultivation'
ORDER BY indexname;

-- ------------------------------------------------------------------------------
-- 7. TRẠNG THÁI ROW LEVEL SECURITY (RLS) VÀ CHÍNH SÁCH BẢO MẬT (POLICIES)
-- ------------------------------------------------------------------------------
SELECT 
    cls.relname AS table_name,
    cls.relrowsecurity AS rls_enabled,
    cls.relforcerowsecurity AS rls_forced
FROM pg_class cls
JOIN pg_namespace ns ON cls.relnamespace = ns.oid
WHERE ns.nspname = 'public' AND cls.relname = 'cultivation';

SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'cultivation'
ORDER BY policyname;

-- ------------------------------------------------------------------------------
-- 8. QUYỀN TRUY CẬP BẢNG (PRIVILEGES) CHO CÁC ROLE SUPABASE
-- ------------------------------------------------------------------------------
SELECT 
    grantee,
    privilege_type,
    is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public' 
  AND table_name = 'cultivation'
  AND grantee IN ('anon', 'authenticated', 'service_role', 'postgres')
ORDER BY grantee, privilege_type;

-- ------------------------------------------------------------------------------
-- 9. KIỂM TRA HÀM RPC sync_cultivation_occ HIỆN HỮU
-- ------------------------------------------------------------------------------
SELECT 
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS arguments,
    pg_get_function_result(p.oid) AS return_type,
    p.prosecdef AS is_security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'sync_cultivation_occ';

-- ------------------------------------------------------------------------------
-- 10. DỮ LIỆU THỐNG KÊ AN TOÀN QUA DYNAMIC SQL (KHÔNG GÂY LỖI CÚ PHÁP)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_table_exists boolean;
    v_has_rev boolean;
    v_has_state boolean;
    v_has_user_id boolean;
    v_total_rows bigint := 0;
    v_null_rev_rows bigint := 0;
    v_min_rev bigint := 0;
    v_max_rev bigint := 0;
    v_avg_state_size numeric := 0;
    v_user_id_type text;
BEGIN
    -- 1. Kiểm tra bảng cultivation
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'cultivation'
    ) INTO v_table_exists;

    IF NOT v_table_exists THEN
        RAISE NOTICE '>>> THỐNG KÊ: Bảng public.cultivation CHƯA TỒN TẠI trên môi trường này.';
        RETURN;
    END IF;

    EXECUTE 'SELECT count(*) FROM public.cultivation' INTO v_total_rows;
    RAISE NOTICE '>>> THỐNG KÊ: Tổng số dòng dữ liệu trong public.cultivation = %', v_total_rows;

    -- 2. Kiểm tra cột user_id
    SELECT data_type INTO v_user_id_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'cultivation' AND column_name = 'user_id';
    RAISE NOTICE '>>> THỐNG KÊ: Kiểu dữ liệu cột user_id = %', COALESCE(v_user_id_type, 'KHÔNG TỒN TẠI');

    -- 3. Kiểm tra cột rev an toàn
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'cultivation' AND column_name = 'rev'
    ) INTO v_has_rev;

    IF v_has_rev THEN
        EXECUTE 'SELECT count(*) FROM public.cultivation WHERE rev IS NULL' INTO v_null_rev_rows;
        EXECUTE 'SELECT COALESCE(min(rev), 0), COALESCE(max(rev), 0) FROM public.cultivation' INTO v_min_rev, v_max_rev;
        RAISE NOTICE '>>> THỐNG KÊ: Cột "rev" ĐÃ TỒN TẠI. Min rev: %, Max rev: %, Số dòng có rev IS NULL: %', v_min_rev, v_max_rev, v_null_rev_rows;
    ELSE
        RAISE NOTICE '>>> THỐNG KÊ: Cột "rev" CHƯA TỒN TẠI trong bảng public.cultivation.';
    END IF;

    -- 4. Kiểm tra kích thước payload cột state an toàn
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'cultivation' AND column_name = 'state'
    ) INTO v_has_state;

    IF v_has_state AND v_total_rows > 0 THEN
        EXECUTE 'SELECT round(avg(octet_length(state::text)), 2) FROM public.cultivation' INTO v_avg_state_size;
        RAISE NOTICE '>>> THỐNG KÊ: Kích thước payload trung bình của cột "state" = % bytes', v_avg_state_size;
    END IF;

    -- 5. Kiểm tra bảng cờ app_system_flags
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_system_flags') THEN
        RAISE NOTICE '>>> THỐNG KÊ: Bảng public.app_system_flags ĐÃ TỒN TẠI.';
    ELSE
        RAISE NOTICE '>>> THỐNG KÊ: Bảng public.app_system_flags CHƯA TỒN TẠI.';
    END IF;

    -- 6. Kiểm tra bảng nhật ký cultivation_idempotency_log
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cultivation_idempotency_log') THEN
        RAISE NOTICE '>>> THỐNG KÊ: Bảng public.cultivation_idempotency_log ĐÃ TỒN TẠI.';
    ELSE
        RAISE NOTICE '>>> THỐNG KÊ: Bảng public.cultivation_idempotency_log CHƯA TỒN TẠI.';
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- KẾT THÚC TRANSACTION (ROLLBACK ĐẢM BẢO 100% READ ONLY KHÔNG LƯU BẤT KỲ TRẠNG THÁI NÀO)
-- ------------------------------------------------------------------------------
ROLLBACK;
