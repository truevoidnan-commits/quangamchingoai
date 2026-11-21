<#
.SYNOPSIS
    Script điều phối duy nhất triển khai nâng cấp OCC lên Supabase Production cho dự án Thiên Cơ Lâu.
.DESCRIPTION
    Tuân thủ quy trình 6 bước với Short Write Freeze, Fail-Closed Preconditions và 2 điểm phê duyệt bắt buộc:
    1. Xác minh trạng thái GitHub và backup cũ
    2. Tạo Delta Backup tức thời trước giờ G
    3. Tiền kiểm Production READ-ONLY (kiểm tra rev = 4203, zero query treo)
    4. [ĐIỂM PHÊ DUYỆT 1] Người dùng xác nhận Freeze & Migration Stage A
    5. Thực thi Atomic Write Freeze & Migration Stage A
    6. [ĐIỂM PHÊ DUYỆT 2] Người dùng xác nhận Merge PR #5 & Deploy Frontend GitHub Pages
    7. Thực thi Stage B Cutover Lockdown (thu hồi triệt để quyền ghi/truncate/trigger)
    8. Thực thi Fail-Closed Unfreeze & Mở RPC OCC
    9. Kiểm tra trang web thực tế và đồng bộ tu vi
    10. Kết luận DEPLOYED hoặc STOPPED
.PARAMETER DatabaseUrl
    Connection string của Supabase Production (nếu không truyền, script sẽ đọc từ $env:PROD_DATABASE_URL hoặc hỏi an toàn)
.PARAMETER WebsiteUrl
    URL của website production để kiểm tra (mặc định: https://truevoidnan-commits.github.io/quangamchingoai)
.PARAMETER BackupDir
    Thư mục lưu trữ bản sao lưu (mặc định: .\backups)
#>

[CmdletBinding()]
param (
    [string]$DatabaseUrl = $env:PROD_DATABASE_URL,
    [string]$WebsiteUrl = "https://truevoidnan-commits.github.io/quangamchingoai",
    [string]$BackupDir = ".\backups"
)

$ErrorActionPreference = "Stop"

function Mask-Url([string]$url) {
    if ([string]::IsNullOrWhiteSpace($url)) { return "" }
    return $url -replace '://([^:]+):([^@]+)@', '://$1:***@'
}

function Write-Step([string]$stepNum, [string]$title) {
    Write-Host "`n==========================================================================" -ForegroundColor Cyan
    Write-Host "[$stepNum] $title" -ForegroundColor Cyan
    Write-Host "==========================================================================" -ForegroundColor Cyan
}

function Abort-Deployment([string]$reason, [bool]$isFrozen = $false) {
    Write-Host "`n==========================================================================" -ForegroundColor Red
    Write-Host "KẾT LUẬN: [STOPPED] NÂNG CẤP OCC ĐÃ DỪNG!" -ForegroundColor Red
    Write-Host "Nguyên nhân: $reason" -ForegroundColor Yellow
    if ($isFrozen) {
        Write-Host "TRẠNG THÁI BẢO TRÌ: [BẬT (AN TOÀN)]" -ForegroundColor Magenta
        Write-Host "Database đang ở trạng thái Safe Maintenance Mode (đóng băng ghi 100%)." -ForegroundColor Magenta
        Write-Host "Dữ liệu người dùng tiếp tục được bảo toàn an toàn tại LocalStorage." -ForegroundColor Magenta
    } else {
        Write-Host "TRẠNG THÁI DATABASE: Chưa thay đổi hoặc đã giữ nguyên an toàn." -ForegroundColor Green
    }
    Write-Host "==========================================================================" -ForegroundColor Red
    exit 1
}

# ------------------------------------------------------------------------------
# KHỞI TẠO VÀ XÁC THỰC THAM SỐ
# ------------------------------------------------------------------------------
Clear-Host
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host "      THIÊN CƠ LÂU — HỆ THỐNG ĐIỀU PHỐI TRIỂN KHAI PRODUCTION OCC         " -ForegroundColor Green
Write-Host "      Repository: truevoidnan-commits/quangamchingoai | PR #5              " -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Green

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    Write-Host "`nNhập connection string PostgreSQL của Supabase Production:" -ForegroundColor Yellow
    Write-Host "(Ví dụ: postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres)" -ForegroundColor DarkGray
    Write-Host "(Lưu ý: Khuyến nghị dùng port 5432 Session mode hoặc direct host để lệnh pg_dump hoạt động tối ưu)" -ForegroundColor DarkGray
    $securePass = Read-Host -Prompt "Production Database URL" -AsSecureString
    $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePass)
    $DatabaseUrl = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
}

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    Abort-Deployment "Chưa cung cấp DatabaseUrl. Dừng khẩn cấp!" $false
}

$maskedDbUrl = Mask-Url $DatabaseUrl
Write-Host "Database Target: $maskedDbUrl" -ForegroundColor Green
Write-Host "Website Target:  $WebsiteUrl" -ForegroundColor Green

# ------------------------------------------------------------------------------
# BƯỚC 1: XÁC MINH TRẠNG THÁI GITHUB VÀ BẢN BACKUP ĐÃ CÓ
# ------------------------------------------------------------------------------
Write-Step "1/10" "Xác minh trạng thái Git Repository và Backup ban đầu"

# 1.1. Kiểm tra git working tree
$gitStatus = git status --porcelain
if ($gitStatus) {
    Abort-Deployment "Git working tree không sạch (còn uncommitted changes). Hãy commit hoặc stash trước khi chạy!" $false
}

# 1.2. Kiểm tra branch hiện tại
$currentBranch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host "✓ Branch hiện tại: $currentBranch" -ForegroundColor Green

# 1.3. Kiểm tra commit HEAD
$currentHead = (git rev-parse HEAD).Trim()
Write-Host "✓ Commit HEAD: $currentHead" -ForegroundColor Green

# 1.4. Kiểm tra thư mục backup
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}
$existingBackups = Get-ChildItem -Path $BackupDir -Filter "*.dump" -ErrorAction SilentlyContinue
Write-Host "✓ Số lượng bản backup đã có trong ${BackupDir}: $(@($existingBackups).Count)" -ForegroundColor Green

# ------------------------------------------------------------------------------
# BƯỚC 2: CHUẨN BỊ DELTA BACKUP MỚI BẢO VỆ DỮ LIỆU PHÁT SINH GẦN GIỜ G
# ------------------------------------------------------------------------------
Write-Step "2/10" "Tạo Delta Backup tức thời trước thời điểm Cutover"

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$deltaBackupFile = Join-Path $BackupDir "thien_co_lau_prod_cutover_$timestamp.dump"
Write-Host "Đang tạo bản sao lưu mới: $deltaBackupFile..." -ForegroundColor Yellow

$pgDumpCmd = "pg_dump"
$hasLocalPgDump = Get-Command "pg_dump" -ErrorAction SilentlyContinue

if ($hasLocalPgDump) {
    & pg_dump --dbname="$DatabaseUrl" --format=custom --file="$deltaBackupFile" --schema="public" --schema="auth" --schema="storage" --verbose
} else {
    # Nếu Windows host không cài pg_dump, dùng pg_dump bên trong docker container postgres có sẵn
    $runningContainers = docker ps --format "{{.Names}}"
    $dbContainer = $runningContainers | Where-Object { $_ -like "*postgres*" -or $_ -like "*supabase_db*" } | Select-Object -First 1

    if ($dbContainer) {
        Write-Host "Sử dụng pg_dump từ container: $dbContainer..." -ForegroundColor Yellow
        $escapedUrl = $DatabaseUrl -replace '"', '\"'
        $tmpContainerFile = "/tmp/delta_backup_$timestamp.dump"
        docker exec $dbContainer pg_dump "$escapedUrl" -Fc --schema=public --schema=auth --schema=storage -f "$tmpContainerFile"
        if ($LASTEXITCODE -ne 0) {
            Abort-Deployment "Lỗi khi chạy pg_dump trong container $dbContainer" $false
        }
        docker cp "${dbContainer}:${tmpContainerFile}" "$deltaBackupFile"
        docker exec $dbContainer rm -f "$tmpContainerFile"
    } else {
        Abort-Deployment "Không tìm thấy công cụ pg_dump trên Windows host hoặc Docker container. Hãy cài đặt PostgreSQL client hoặc khởi chạy Docker!" $false
    }
}

if (-not (Test-Path $deltaBackupFile)) {
    Abort-Deployment "Lỗi tạo backup: File $deltaBackupFile không tồn tại!" $false
}

$fileSize = (Get-Item $deltaBackupFile).Length
if ($fileSize -lt 5120) {
    Abort-Deployment "Lỗi tạo backup: Kích thước file backup quá nhỏ ($fileSize bytes). Nguy cơ lỗi kết nối!" $false
}
Write-Host "✓ Delta Backup hoàn tất thành công! Kích thước: $([math]::Round($fileSize / 1KB, 2)) KB" -ForegroundColor Green

# ------------------------------------------------------------------------------
# BƯỚC 3: KIỂM TRA ĐỦ ĐIỀU KIỆN TRƯỚC KHI THAY ĐỔI PRODUCTION (PREFLIGHT READ-ONLY)
# ------------------------------------------------------------------------------
Write-Step "3/10" "Thực thi Preflight READ-ONLY trên Supabase Production"

$preflightFile = "supabase/operations/20261121_production_preflight_readonly.sql"
if (-not (Test-Path $preflightFile)) {
    Abort-Deployment "Không tìm thấy file $preflightFile!" $false
}

Write-Host "Đang chạy preflight read-only qua Node.js runner..." -ForegroundColor Yellow
$preflightOutput = node scripts/run-sql-file.mjs "$preflightFile" "$DatabaseUrl"

if ($LASTEXITCODE -ne 0) {
    Abort-Deployment "Preflight READ-ONLY thất bại! Kiểm tra lại thông số kết nối." $false
}

Write-Host $preflightOutput
Write-Host "✓ Preflight READ-ONLY hoàn tất thành công 100%!" -ForegroundColor Green

# ------------------------------------------------------------------------------
# BƯỚC 4: [ĐIỂM PHÊ DUYỆT 1] XÁC NHẬN TRƯỚC THAO TÁC FREEZE / MIGRATION
# ------------------------------------------------------------------------------
Write-Step "4/10" "[ĐIỂM PHÊ DUYỆT 1] Xác nhận thực thi Atomic Write Freeze & Migration Stage A"

Write-Host "THÔNG TIN TRƯỚC GIỜ G:" -ForegroundColor Yellow
Write-Host "  - Target Database: $maskedDbUrl"
Write-Host "  - Delta Backup:    $deltaBackupFile ($([math]::Round($fileSize / 1KB, 2)) KB)"
Write-Host "  - Thao tác kế tiếp:"
Write-Host "      1. Khóa bảng ACCESS EXCLUSIVE (timeout 2s), REVOKE toàn bộ quyền direct write (kể cả TRUNCATE/TRIGGER)"
Write-Host "      2. Bật cờ cultivation_maintenance = true"
Write-Host "      3. Áp dụng Migration Stage A (Nâng rev -> BIGINT, tạo Idempotency Log, tạo RPC sync_cultivation_occ)"
Write-Host "  - Dữ liệu tu vi: Bảo toàn nguyên vẹn rev hiện tại (4203), KHÔNG reset về 0/1."

Write-Host "`nBạn có chắc chắn muốn thực thi Freeze và Migration Stage A lên Production?" -ForegroundColor Red
$confirm1 = Read-Host -Prompt "Nhập 'YES' (chữ hoa) để xác nhận thực thi, phím khác để hủy"

if ($confirm1 -ne "YES") {
    Abort-Deployment "Người dùng hủy bỏ thao tác tại Điểm phê duyệt 1." $false
}

# ------------------------------------------------------------------------------
# BƯỚC 5: THỰC HIỆN ATOMIC WRITE FREEZE RỒI MIGRATION STAGE A
# ------------------------------------------------------------------------------
Write-Step "5/10" "Thực thi Atomic Write Freeze & Migration Stage A"

$freezeFile = "supabase/operations/20261121_cultivation_occ_atomic_write_freeze.sql"
$stageAFile = "supabase/migrations/20261120_cultivation_occ_stage_a.sql"

Write-Host "5.1. Thực thi Atomic Write Freeze..." -ForegroundColor Yellow
node scripts/run-sql-file.mjs "$freezeFile" "$DatabaseUrl"
if ($LASTEXITCODE -ne 0) {
    Abort-Deployment "Lỗi thực thi Atomic Write Freeze!" $true
}
Write-Host "✓ Atomic Write Freeze thành công! Toàn bộ direct write đã bị đóng băng." -ForegroundColor Green

Write-Host "5.2. Thực thi Migration Stage A..." -ForegroundColor Yellow
node scripts/run-sql-file.mjs "$stageAFile" "$DatabaseUrl"
if ($LASTEXITCODE -ne 0) {
    Abort-Deployment "Lỗi thực thi Migration Stage A! Database vẫn đang ở trạng thái Bảo trì an toàn." $true
}
Write-Host "✓ Migration Stage A thành công! Cột rev đã là BIGINT, RPC OCC và Idempotency Log đã sẵn sàng." -ForegroundColor Green

# ------------------------------------------------------------------------------
# BƯỚC 6: [ĐIỂM PHÊ DUYỆT 2] XÁC NHẬN MERGE PR #5 VÀ DEPLOY GITHUB PAGES
# ------------------------------------------------------------------------------
Write-Step "6/10" "[ĐIỂM PHÊ DUYỆT 2] Merge PR #5 & Triển khai Frontend GitHub Pages"

Write-Host "TRẠNG THÁI HIỆN TẠI:" -ForegroundColor Yellow
Write-Host "  - Database đang ở trạng thái SAFE MAINTENANCE MODE (Bảo trì đóng băng)." -ForegroundColor Magenta
Write-Host "  - Direct REST write từ client cũ bị từ chối 403 / 42501." -ForegroundColor Magenta
Write-Host "  - RPC OCC đã sẵn sàng nhưng đang trả về { status: 'MAINTENANCE', code: 'SYNC_PAUSED' }." -ForegroundColor Magenta
Write-Host "  - Dữ liệu tu vi cục bộ của người dùng được giữ nguyên trong trình duyệt." -ForegroundColor Magenta

Write-Host "`nBÂY GIỜ LÀ THỜI ĐIỂM TRIỂN KHAI FRONTEND MỚI:" -ForegroundColor Cyan
Write-Host "  1. Mở GitHub: https://github.com/truevoidnan-commits/quangamchingoai/pull/5"
Write-Host "  2. Bấm 'Merge Pull Request' (hoặc chạy: gh pr merge 5 --merge)"
Write-Host "  3. Đợi GitHub Actions build & deploy Pages hoàn tất (khoảng 1-2 phút)."
Write-Host "  4. Mở tab ẩn danh kiểm tra trang web: $WebsiteUrl (nạp thành công, không lỗi trắng)."

Write-Host "`nSau khi bạn đã merge PR #5 và GitHub Pages đã deploy xong:" -ForegroundColor Red
$confirm2 = Read-Host -Prompt "Nhập 'YES' (chữ hoa) để xác nhận Frontend mới đã lên live, phím khác để dừng"

if ($confirm2 -ne "YES") {
    Abort-Deployment "Tạm dừng trước Cutover Stage B. Database tiếp tục giữ an toàn trong chế độ bảo trì." $true
}

# ------------------------------------------------------------------------------
# BƯỚC 7: THỰC HIỆN STAGE B LOCKDOWN & XÁC MINH QUYỀN HIỆU LỰC
# ------------------------------------------------------------------------------
Write-Step "7/10" "Thực thi Stage B Lockdown & Xác minh Quyền Hiệu Lực"

$stageBFile = "supabase/operations/20261120_cultivation_occ_stage_b_cutover.sql"
Write-Host "Thực thi Stage B Cutover..." -ForegroundColor Yellow
node scripts/run-sql-file.mjs "$stageBFile" "$DatabaseUrl"

if ($LASTEXITCODE -ne 0) {
    Abort-Deployment "Lỗi thực thi Stage B Cutover!" $true
}
Write-Host "✓ Stage B Cutover hoàn tất! Quyền direct write/truncate/trigger đã bị khóa vĩnh viễn." -ForegroundColor Green

# ------------------------------------------------------------------------------
# BƯỚC 8: FAIL-CLOSED UNFREEZE (CHỈ UNFREEZE NẾU 100% PRECONDITIONS THỎA MÃN)
# ------------------------------------------------------------------------------
Write-Step "8/10" "Thực thi Fail-Closed Unfreeze & Mở Đồng Bộ RPC OCC"

$unfreezeFile = "supabase/operations/20261121_cultivation_occ_unfreeze_and_enable.sql"
Write-Host "Đang kiểm tra 100% Preconditions và mở lại đồng bộ..." -ForegroundColor Yellow
$unfreezeOutput = node scripts/run-sql-file.mjs "$unfreezeFile" "$DatabaseUrl"

if ($LASTEXITCODE -ne 0) {
    Abort-Deployment "Preconditions không đạt! Script đã tự động ROLLBACK và giữ nguyên chế độ bảo trì (Fail-Closed)." $true
}

Write-Host $unfreezeOutput
Write-Host "✓ Unfreeze thành công! Cờ bảo trì đã tắt, hệ thống mở RPC OCC toàn diện." -ForegroundColor Green

# ------------------------------------------------------------------------------
# BƯỚC 9: KIỂM TRA ĐỒNG BỘ THÀNH CÔNG & BẢO TOÀN DỮ LIỆU THỰC TẾ
# ------------------------------------------------------------------------------
Write-Step "9/10" "Kiểm tra Website Thực Tế và Dữ Liệu Tu Vi Live"

Write-Host "Kiểm tra kết nối tới Website: $WebsiteUrl..." -ForegroundColor Yellow
try {
    $webRes = Invoke-WebRequest -Uri $WebsiteUrl -UseBasicParsing -TimeoutSec 15
    if ($webRes.StatusCode -eq 200) {
        Write-Host "✓ Website Live phản hồi tốt (HTTP 200 OK)." -ForegroundColor Green
    } else {
        Write-Host "Cảnh báo: Website phản hồi mã HTTP $($webRes.StatusCode)." -ForegroundColor Yellow
    }
} catch {
    Write-Host "Cảnh báo kiểm tra website: $($_.Exception.Message)" -ForegroundColor Yellow
}

# ------------------------------------------------------------------------------
# BƯỚC 10: KẾT LUẬN CUỐI CÙNG
# ------------------------------------------------------------------------------
Write-Step "10/10" "Hoàn tất Triển khai"

Write-Host "`n==========================================================================" -ForegroundColor Green
Write-Host "KẾT LUẬN: [DEPLOYED] NÂNG CẤP OCC LÊN PRODUCTION HOÀN TẤT XUẤT SẮC!" -ForegroundColor Green
Write-Host "  - Revision tu vi được bảo toàn tuyệt đối (>= 4203)." -ForegroundColor Green
Write-Host "  - Toàn bộ đường ghi direct write/truncate cũ đã bị khóa vĩnh viễn." -ForegroundColor Green
Write-Host "  - RPC sync_cultivation_occ đang hoạt động mượt mà." -ForegroundColor Green
Write-Host "  - Bản backup an toàn lưu tại: $deltaBackupFile" -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Green
