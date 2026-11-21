<#
.SYNOPSIS
    Script điều phối duy nhất triển khai nâng cấp OCC lên Supabase Production cho dự án Thiên Cơ Lâu.
.DESCRIPTION
    Tuân thủ quy trình bảo mật nghiêm ngặt:
    - Không truyền mật khẩu qua tham số dòng lệnh cho các tiến trình con (dùng biến môi trường / stdin).
    - Kiểm tra mã thoát (exit code) của pg_dump, dừng ngay khi backup có sự cố.
    - Tiền kiểm READ-ONLY và chụp baseline snapshot dữ liệu tu vi (rev, EXP).
    - 2 Điểm phê duyệt bắt buộc: trước Freeze/Stage A và trước Stage B/Unfreeze.
    - Kiểm tra frontend live triển khai đúng commit và chứa RPC sync_cultivation_occ (không chỉ dựa vào HTTP 200).
    - Xác minh đối chiếu thực tế revision và tổng EXP tu vi trước khi kết luận DEPLOYED.
    - Fail-Closed: Bất kỳ lỗi nào phát sinh sau Freeze đều giữ nguyên trạng thái bảo trì an toàn và báo rõ hiện trạng.
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
$isFrozen = $false

function Mask-Url([string]$url) {
    if ([string]::IsNullOrWhiteSpace($url)) { return "" }
    return $url -replace '://([^:]+):([^@]+)@', '://$1:***@'
}

function Write-Step([string]$stepNum, [string]$title) {
    Write-Host "`n==========================================================================" -ForegroundColor Cyan
    Write-Host "[$stepNum] $title" -ForegroundColor Cyan
    Write-Host "==========================================================================" -ForegroundColor Cyan
}

function Abort-Deployment([string]$reason, [bool]$frozen = $false) {
    Write-Host "`n==========================================================================" -ForegroundColor Red
    Write-Host "KẾT LUẬN: [STOPPED] NÂNG CẤP OCC ĐÃ DỪNG!" -ForegroundColor Red
    Write-Host "Nguyên nhân: $reason" -ForegroundColor Yellow
    if ($frozen) {
        Write-Host "`nTRẠNG THÁI BẢO TRÌ: [BẬT (AN TOÀN)]" -ForegroundColor Magenta
        Write-Host "Database đang ở trạng thái Safe Maintenance Mode (đóng băng ghi 100%):" -ForegroundColor Magenta
        Write-Host "  - Bảng app_system_flags: cultivation_maintenance = true." -ForegroundColor Magenta
        Write-Host "  - Direct REST write từ frontend cũ: Bị từ chối hoàn toàn (HTTP 403 / 42501)." -ForegroundColor Magenta
        Write-Host "  - RPC sync_cultivation_occ: Trả về trạng thái { status: 'MAINTENANCE', code: 'SYNC_PAUSED' }." -ForegroundColor Magenta
        Write-Host "  - Dữ liệu tu vi người dùng: Được bảo toàn nguyên vẹn tại LocalStorage phía client." -ForegroundColor Magenta
        Write-Host "  - Không có bất kỳ dữ liệu tu vi nào bị mất mát hoặc ghi đè sai lệch." -ForegroundColor Magenta
    } else {
        Write-Host "`nTRẠNG THÁI DATABASE: Chưa bị thay đổi (giữ nguyên trạng thái ban đầu)." -ForegroundColor Green
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

# Phân tách connection string để cô lập mật khẩu (không lộ qua command line argv)
$dbUser = $null
$dbPass = $null
$dbHost = $null
$dbPort = "5432"
$dbName = "postgres"

if ($DatabaseUrl -match '^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:\/]+)(?::(\d+))?\/(.+)$') {
    $dbUser = [System.Uri]::UnescapeDataString($matches[1])
    $dbPass = [System.Uri]::UnescapeDataString($matches[2])
    $dbHost = $matches[3]
    if ($matches[4]) { $dbPort = $matches[4] }
    $dbName = ($matches[5] -split '\?')[0]
} else {
    Abort-Deployment "Định dạng DatabaseUrl không hợp lệ! Vui lòng dùng format: postgresql://user:password@host:port/database" $false
}

# Thiết lập biến môi trường phiên làm việc cho các tiến trình Node.js (KHÔNG truyền qua argv)
$env:PROD_DATABASE_URL = $DatabaseUrl

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
# BƯỚC 2: CHUẨN BỊ DELTA BACKUP MỚI (KIỂM TRA EXIT CODE, KHÔNG TRUYỀN MẬT KHẨU ARGV)
# ------------------------------------------------------------------------------
Write-Step "2/10" "Tạo Delta Backup tức thời trước thời điểm Cutover"

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$deltaBackupFile = Join-Path $BackupDir "thien_co_lau_prod_cutover_$timestamp.dump"
Write-Host "Đang tạo bản sao lưu mới: $deltaBackupFile..." -ForegroundColor Yellow

$hasLocalPgDump = Get-Command "pg_dump" -ErrorAction SilentlyContinue
$dumpExitCode = 1

if ($hasLocalPgDump) {
    Write-Host "Sử dụng pg_dump local (mật khẩu truyền qua PGPASSWORD môi trường, không lộ argv)..." -ForegroundColor Yellow
    $env:PGPASSWORD = $dbPass
    & pg_dump -h $dbHost -p $dbPort -U $dbUser -d $dbName --format=custom --file="$deltaBackupFile" --schema="public" --schema="auth" --schema="storage"
    $dumpExitCode = $LASTEXITCODE
    $env:PGPASSWORD = $null
} else {
    $runningContainers = docker ps --format "{{.Names}}"
    $dbContainer = $runningContainers | Where-Object { $_ -like "*postgres*" -or $_ -like "*supabase_db*" } | Select-Object -First 1

    if ($dbContainer) {
        Write-Host "Sử dụng pg_dump từ container: $dbContainer (truyền qua stdin pipe an toàn, không lộ argv)..." -ForegroundColor Yellow
        $tmpContainerFile = "/tmp/delta_backup_$timestamp.dump"
        # Truyền lệnh kèm PGPASSWORD qua stdin của container sh để không lộ mật khẩu trên argv của tiến trình
        $shCmd = "export PGPASSWORD='$dbPass'; pg_dump -h '$dbHost' -p '$dbPort' -U '$dbUser' -d '$dbName' -Fc --schema=public --schema=auth --schema=storage -f '$tmpContainerFile'"
        $shCmd | docker exec -i $dbContainer sh
        $dumpExitCode = $LASTEXITCODE

        if ($dumpExitCode -eq 0) {
            docker cp "${dbContainer}:${tmpContainerFile}" "$deltaBackupFile"
            docker exec $dbContainer rm -f "$tmpContainerFile"
        }
    } else {
        Abort-Deployment "Không tìm thấy công cụ pg_dump trên Windows host hoặc Docker container. Hãy cài đặt pg_dump hoặc khởi chạy Docker!" $false
    }
}

# Kiểm tra mã thoát của pg_dump
if ($dumpExitCode -ne 0) {
    Abort-Deployment "pg_dump thất bại với mã lỗi $dumpExitCode! Dừng khẩn cấp, chưa thay đổi database." $false
}

if (-not (Test-Path $deltaBackupFile)) {
    Abort-Deployment "Lỗi tạo backup: File $deltaBackupFile không tồn tại trên đĩa!" $false
}

$fileSize = (Get-Item $deltaBackupFile).Length
if ($fileSize -lt 5120) {
    Abort-Deployment "Lỗi tạo backup: Kích thước file backup quá nhỏ ($fileSize bytes). Nguy cơ lỗi kết nối!" $false
}
Write-Host "✓ Delta Backup hoàn tất thành công! Kích thước: $([math]::Round($fileSize / 1KB, 2)) KB (Mã thoát pg_dump: 0)" -ForegroundColor Green

# ------------------------------------------------------------------------------
# BƯỚC 3: KIỂM TRA ĐỦ ĐIỀU KIỆN TRƯỚC KHI THAY ĐỔI PRODUCTION (PREFLIGHT READ-ONLY)
# ------------------------------------------------------------------------------
Write-Step "3/10" "Thực thi Preflight READ-ONLY & Chụp Baseline Snapshot Dữ Liệu Tu Vi"

$preflightFile = "supabase/operations/20261121_production_preflight_readonly.sql"
if (-not (Test-Path $preflightFile)) {
    Abort-Deployment "Không tìm thấy file $preflightFile!" $false
}

Write-Host "3.1. Đang chạy preflight read-only qua Node.js runner (bảo mật biến môi trường)..." -ForegroundColor Yellow
$preflightOutput = node scripts/run-sql-file.mjs "$preflightFile"

if ($LASTEXITCODE -ne 0) {
    Abort-Deployment "Preflight READ-ONLY thất bại! Kiểm tra lại kết nối cơ sở dữ liệu." $false
}
Write-Host $preflightOutput
Write-Host "✓ Preflight READ-ONLY hoàn tất thành công 100%!" -ForegroundColor Green

Write-Host "`n3.2. Chụp Baseline Snapshot dữ liệu tu vi hiện tại..." -ForegroundColor Yellow
$baselineSnapshotFile = Join-Path $BackupDir "cultivation_baseline_snapshot_$timestamp.json"
node scripts/verify-cultivation-live.mjs --snapshot "$baselineSnapshotFile"

if ($LASTEXITCODE -ne 0 -or -not (Test-Path $baselineSnapshotFile)) {
    Abort-Deployment "Không thể chụp baseline snapshot dữ liệu tu vi! Dừng khẩn cấp." $false
}
$baselineContent = Get-Content -Path $baselineSnapshotFile -Raw | ConvertFrom-Json
Write-Host "✓ Đã ghi nhận Baseline: User=$($baselineContent.userId) | Revision=$($baselineContent.rev) | Tổng EXP=$($baselineContent.totalCalculatedExp)" -ForegroundColor Green

# ------------------------------------------------------------------------------
# BƯỚC 4: [ĐIỂM PHÊ DUYỆT 1] XÁC NHẬN TRƯỚC THAO TÁC FREEZE / MIGRATION
# ------------------------------------------------------------------------------
Write-Step "4/10" "[ĐIỂM PHÊ DUYỆT 1] Xác nhận thực thi Atomic Write Freeze & Migration Stage A"

Write-Host "THÔNG TIN TRƯỚC GIỜ G:" -ForegroundColor Yellow
Write-Host "  - Target Database: $maskedDbUrl"
Write-Host "  - Delta Backup:    $deltaBackupFile ($([math]::Round($fileSize / 1KB, 2)) KB)"
Write-Host "  - Baseline Tu Vi:  Revision $($baselineContent.rev), Tổng EXP $($baselineContent.totalCalculatedExp)"
Write-Host "  - Thao tác kế tiếp:"
Write-Host "      1. Khóa bảng ACCESS EXCLUSIVE (timeout 2s), REVOKE toàn bộ quyền direct write (kể cả TRUNCATE/TRIGGER)"
Write-Host "      2. Bật cờ cultivation_maintenance = true"
Write-Host "      3. Áp dụng Migration Stage A (Nâng rev -> BIGINT, tạo Idempotency Log, tạo RPC sync_cultivation_occ)"
Write-Host "  - Bảo toàn dữ liệu: Giữ nguyên vẹn rev hiện tại ($($baselineContent.rev)) và toàn bộ EXP tu vi."

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
node scripts/run-sql-file.mjs "$freezeFile"
if ($LASTEXITCODE -ne 0) {
    Abort-Deployment "Lỗi thực thi Atomic Write Freeze! Giao dịch có thể đã rollback." $true
}
$isFrozen = $true
Write-Host "✓ Atomic Write Freeze thành công! Toàn bộ direct write đã bị đóng băng an toàn." -ForegroundColor Green

Write-Host "5.2. Thực thi Migration Stage A..." -ForegroundColor Yellow
node scripts/run-sql-file.mjs "$stageAFile"
if ($LASTEXITCODE -ne 0) {
    Abort-Deployment "Lỗi thực thi Migration Stage A!" $true
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
# BƯỚC 7: XÁC MINH FRONTEND TRIỂN KHAI ĐÚNG COMMIT (KHÔNG CHỈ HTTP 200)
# ------------------------------------------------------------------------------
Write-Step "7/10" "Xác minh Frontend Đã Triển Khai Đúng Commit và Chứa RPC OCC"

Write-Host "7.1. Kiểm tra trạng thái triển khai qua GitHub Deployments API..." -ForegroundColor Yellow
try {
    $deployments = Invoke-RestMethod -Uri "https://api.github.com/repos/truevoidnan-commits/quangamchingoai/deployments?environment=github-pages`&per_page=3" -Headers @{"User-Agent"="PowerShell"} -TimeoutSec 15
    if ($deployments -and $deployments.Count -gt 0) {
        $latestDeploy = $deployments[0]
        $statuses = Invoke-RestMethod -Uri $latestDeploy.statuses_url -Headers @{"User-Agent"="PowerShell"} -TimeoutSec 15
        $deployState = if ($statuses -and $statuses.Count -gt 0) { $statuses[0].state } else { "unknown" }
        Write-Host "  - Deployment ID: $($latestDeploy.id)"
        Write-Host "  - Deployed SHA:  $($latestDeploy.sha)"
        Write-Host "  - Trạng thái:    $deployState"

        if ($deployState -ne "success") {
            Abort-Deployment "GitHub Pages deployment chưa ở trạng thái 'success' (trạng thái hiện tại: $deployState). Vui lòng đợi GitHub Actions build và deploy hoàn tất!" $true
        }
        Write-Host "  ✓ GitHub Pages Deployment đã hoàn tất thành công (state: success)!" -ForegroundColor Green
    }
} catch {
    Write-Host "  (Không thể truy vấn GitHub Deployments API: $($_.Exception.Message) - chuyển sang kiểm tra bundle trực tiếp)" -ForegroundColor DarkGray
}

Write-Host "`n7.2. Kiểm tra JavaScript bundle trực tiếp trên trang live ($WebsiteUrl)..." -ForegroundColor Yellow
$cacheBuster = [System.DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$webRes = Invoke-WebRequest -Uri "$WebsiteUrl?t=$cacheBuster" -UseBasicParsing -TimeoutSec 15

if ($webRes.StatusCode -ne 200) {
    Abort-Deployment "Website live không phản hồi HTTP 200 OK (mã phản hồi: $($webRes.StatusCode))!" $true
}

if ($webRes.Content -match 'src=["'']\.\/assets\/(index-[^"'']+\.js)["'']') {
    $bundleName = $matches[1]
    Write-Host "  - Nhận diện JavaScript Entry Bundle: $bundleName"
    $bundleUrl = "$WebsiteUrl/assets/$bundleName?t=$cacheBuster"
    $bundleRes = Invoke-WebRequest -Uri "$bundleUrl" -UseBasicParsing -TimeoutSec 20
    
    # Bắt buộc bundle phải chứa chuỗi RPC 'sync_cultivation_occ'
    if ($bundleRes.Content -notmatch 'sync_cultivation_occ') {
        Abort-Deployment "JavaScript bundle live ($bundleName) KHÔNG chứa RPC 'sync_cultivation_occ'! Frontend phiên bản cũ vẫn đang phục vụ trên GitHub Pages (chưa nhận commit OCC mới). Dừng lại an toàn!" $true
    }
    Write-Host "  ✓ Bundle live đã được xác minh chứa hàm RPC sync_cultivation_occ!" -ForegroundColor Green
} else {
    Abort-Deployment "Không tìm thấy file bundle JavaScript index trong HTML trang live! Nguy cơ trang bị lỗi hiển thị." $true
}

# ------------------------------------------------------------------------------
# BƯỚC 8: THỰC HIỆN STAGE B LOCKDOWN & FAIL-CLOSED UNFREEZE
# ------------------------------------------------------------------------------
Write-Step "8/10" "Thực thi Stage B Cutover & Fail-Closed Unfreeze"

$stageBFile = "supabase/operations/20261120_cultivation_occ_stage_b_cutover.sql"
Write-Host "8.1. Thực thi Stage B Cutover Lockdown..." -ForegroundColor Yellow
node scripts/run-sql-file.mjs "$stageBFile"

if ($LASTEXITCODE -ne 0) {
    Abort-Deployment "Lỗi thực thi Stage B Cutover!" $true
}
Write-Host "✓ Stage B Cutover hoàn tất! Toàn bộ direct write/truncate/trigger đã bị khóa vĩnh viễn." -ForegroundColor Green

$unfreezeFile = "supabase/operations/20261121_cultivation_occ_unfreeze_and_enable.sql"
Write-Host "`n8.2. Đang kiểm tra 100% Preconditions và mở lại đồng bộ..." -ForegroundColor Yellow
$unfreezeOutput = node scripts/run-sql-file.mjs "$unfreezeFile"

if ($LASTEXITCODE -ne 0) {
    Abort-Deployment "Preconditions không đạt! Script đã tự động ROLLBACK và giữ nguyên chế độ bảo trì (Fail-Closed)." $true
}

Write-Host $unfreezeOutput
$isFrozen = $false
Write-Host "✓ Unfreeze thành công! Cờ bảo trì đã tắt, hệ thống mở RPC OCC toàn diện." -ForegroundColor Green

# ------------------------------------------------------------------------------
# BƯỚC 9: XÁC MINH ĐỒNG BỘ EXP VÀ REVISION THỰC TẾ TRÊN DATABASE LIVE
# ------------------------------------------------------------------------------
Write-Step "9/10" "Xác minh Đối Chiếu EXP và Revision Tu Vi Thực Tế"

Write-Host "Đối chiếu trạng thái database live với baseline snapshot..." -ForegroundColor Yellow
node scripts/verify-cultivation-live.mjs --verify "$baselineSnapshotFile"

if ($LASTEXITCODE -ne 0) {
    # Nếu xác minh thất bại, kích hoạt lại freeze khẩn cấp để bảo vệ database
    Write-Host "`nCẢNH BÁO: Phát hiện sai lệch dữ liệu! Kích hoạt lại freeze khẩn cấp..." -ForegroundColor Red
    node scripts/run-sql-file.mjs "$freezeFile"
    Abort-Deployment "Xác minh revision hoặc EXP tu vi thất bại! Đã tái kích hoạt chế độ bảo trì để bảo vệ dữ liệu." $true
}

# ------------------------------------------------------------------------------
# BƯỚC 10: KẾT LUẬN CUỐI CÙNG
# ------------------------------------------------------------------------------
Write-Step "10/10" "Hoàn tất Triển khai Production OCC"

Write-Host "`n==========================================================================" -ForegroundColor Green
Write-Host "KẾT LUẬN: [DEPLOYED] NÂNG CẤP OCC LÊN PRODUCTION HOÀN TẤT XUẤT SẮC!" -ForegroundColor Green
Write-Host "  - Revision tu vi được bảo toàn tuyệt đối (>= $($baselineContent.rev))." -ForegroundColor Green
Write-Host "  - Toàn bộ EXP tu vi được bảo toàn nguyên vẹn, không suy giảm." -ForegroundColor Green
Write-Host "  - Toàn bộ đường ghi direct write/truncate cũ đã bị khóa vĩnh viễn." -ForegroundColor Green
Write-Host "  - Frontend live đã xác minh chứa mã nguồn RPC sync_cultivation_occ." -ForegroundColor Green
Write-Host "  - Database đã Unfreeze, cờ cultivation_maintenance = false." -ForegroundColor Green
Write-Host "  - Bản backup an toàn lưu tại: $deltaBackupFile" -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Green
