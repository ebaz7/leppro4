param(
    [string]$InstallDir = (Split-Path -Parent $PSScriptRoot),
    [ValidateSet("install", "update", "start", "stop", "status")]
    [string]$Mode = "update",
    [switch]$OfflineOnly
)

$ErrorActionPreference = "Stop"

# Normalize install directory and drive
$InstallDir = [System.IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
$InstallDrive = [System.IO.Path]::GetPathRoot($InstallDir)
$WinDrive = [System.IO.Path]::GetPathRoot($env:SystemRoot)

$PgBinRoot    = Join-Path $InstallDir "pgsql"
$PgDataDir    = Join-Path $InstallDir "pgdata"
$PgLogsDir    = Join-Path $InstallDir "pglogs"
$PgTempDir    = Join-Path $InstallDir "pgtemp"
$PgOfflineDir = Join-Path $InstallDir "pgsql_offline"
$PgBackupsDir = Join-Path $InstallDir "backups\postgres"
$EnvFilePath  = Join-Path $InstallDir ".env"
$ServiceName  = "DelkamErpPostgres"

# Keep ALL temporary files strictly inside the application install drive (NEVER touch C:\Users\...\Temp)
New-Item -ItemType Directory -Force -Path $PgTempDir | Out-Null
New-Item -ItemType Directory -Force -Path $PgLogsDir | Out-Null
New-Item -ItemType Directory -Force -Path $PgOfflineDir | Out-Null
New-Item -ItemType Directory -Force -Path $PgBackupsDir | Out-Null
$env:TEMP = $PgTempDir
$env:TMP = $PgTempDir
$env:PGDATA = $PgDataDir

function Write-Info($msg) { Write-Host "[PG-SETUP] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "[PG-OK]    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[PG-WARN]  $msg" -ForegroundColor Yellow }

function Read-DotEnv($path) {
    $map = [ordered]@{}
    if (-not (Test-Path $path)) { return $map }
    foreach ($line in (Get-Content -Path $path -Encoding UTF8)) {
        $trimmed = $line.Trim()
        if ($trimmed -eq "" -or $trimmed.StartsWith("#")) { continue }
        $idx = $trimmed.IndexOf("=")
        if ($idx -gt 0) {
            $k = $trimmed.Substring(0, $idx).Trim()
            $v = $trimmed.Substring($idx + 1).Trim()
            if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
                $v = $v.Substring(1, $v.Length - 2)
            }
            $map[$k] = $v
        }
    }
    return $map
}

function Set-DotEnvKeys($path, [hashtable]$updates) {
    $lines = @()
    if (Test-Path $path) {
        $lines = @(Get-Content -Path $path -Encoding UTF8)
    }
    $handled = @{}
    $newLines = @()
    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if ($trimmed -ne "" -and -not $trimmed.StartsWith("#") -and $trimmed.Contains("=")) {
            $k = $trimmed.Substring(0, $trimmed.IndexOf("=")).Trim()
            if ($updates.ContainsKey($k)) {
                $newLines += "$k=$($updates[$k])"
                $handled[$k] = $true
                continue
            }
        }
        $newLines += $line
    }
    foreach ($k in $updates.Keys) {
        if (-not $handled.ContainsKey($k)) {
            $newLines += "$k=$($updates[$k])"
        }
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($path, $newLines, $utf8NoBom)
}

function New-SafePassword {
    $chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    $bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $pw = ""
    foreach ($b in $bytes) { $pw += $chars[$b % $chars.Length] }
    return $pw
}

function Test-TcpPortInUse($port) {
    try {
        $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, [int]$port)
        $listener.Start()
        $listener.Stop()
        return $false
    } catch {
        return $true
    }
}

function Find-FreePort([int]$preferred = 5439) {
    for ($p = $preferred; $p -le ($preferred + 20); $p++) {
        if (-not (Test-TcpPortInUse $p)) { return $p }
    }
    return $preferred
}

function Find-OfflinePgZip {
    $candidates = @()
    foreach ($searchDir in @($PgOfflineDir, $InstallDir, $InstallDrive)) {
        if ($searchDir -and (Test-Path $searchDir)) {
            $found = Get-ChildItem -Path $searchDir -Filter "postgresql*-win*binaries*.zip" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
            if (-not $found) {
                $found = Get-ChildItem -Path $searchDir -Filter "postgresql*.zip" -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
            }
            if ($found) { $candidates += $found }
        }
    }
    if ($candidates.Count -gt 0) { return $candidates[0].FullName }
    return $null
}

$PostgresExe = Join-Path $PgBinRoot "bin\postgres.exe"
$PgCtlExe    = Join-Path $PgBinRoot "bin\pg_ctl.exe"
$InitDbExe   = Join-Path $PgBinRoot "bin\initdb.exe"
$PsqlExe     = Join-Path $PgBinRoot "bin\psql.exe"
$PgIsReady   = Join-Path $PgBinRoot "bin\pg_isready.exe"
$PgDumpExe   = Join-Path $PgBinRoot "bin\pg_dump.exe"

Write-Host "==================================================================" -ForegroundColor DarkCyan
Write-Host "  Delkam ERP - Local PostgreSQL Manager (Drive: $InstallDrive)" -ForegroundColor Cyan
Write-Host "  Install Folder: $InstallDir" -ForegroundColor Gray
Write-Host "  PG Binaries:    $PgBinRoot" -ForegroundColor Gray
Write-Host "  PG Data:        $PgDataDir" -ForegroundColor Gray
Write-Host "==================================================================" -ForegroundColor DarkCyan

if ($Mode -eq "stop") {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc -and $svc.Status -eq "Running") {
        Write-Info "Stopping Windows service '$ServiceName'..."
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    }
    if ((Test-Path $PgCtlExe) -and (Test-Path (Join-Path $PgDataDir "PG_VERSION"))) {
        & $PgCtlExe -D $PgDataDir -m fast stop 2>$null | Out-Null
    }
    Write-Ok "Local PostgreSQL stopped safely (other organizational databases untouched)."
    exit 0
}

if ($Mode -eq "status") {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    Write-Info "PostgreSQL binary installed: $(Test-Path $PostgresExe)"
    Write-Info "PGDATA initialized: $(Test-Path (Join-Path $PgDataDir 'PG_VERSION'))"
    Write-Info "Service '$ServiceName': $(if ($svc) { $svc.Status } else { 'Not registered' })"
    exit 0
}

# Preserve existing .env settings 100%
$envMap = Read-DotEnv $EnvFilePath
$existingHost = $envMap["SQL_HOST"]

# If admin configured a separate external/LAN PostgreSQL server, NEVER override it or install locally
if ($existingHost -and $existingHost -ne "127.0.0.1" -and $existingHost -ne "localhost" -and $Mode -eq "update") {
    Write-Info "External SQL_HOST detected ($existingHost). Preserving existing config and syncing schema non-destructively..."
    Push-Location $InstallDir
    try {
        node (Join-Path $InstallDir "scripts\setup-local-postgres-schema.mjs")
    } finally {
        Pop-Location
    }
    exit 0
}

# Verify disk space on install drive (minimum 600 MB recommended; warns only, doesn't block existing setup)
try {
    $driveInfo = [System.IO.DriveInfo]::new($InstallDrive)
    $freeMb = [math]::Round($driveInfo.AvailableFreeSpace / 1MB)
    Write-Info "Free disk space on $InstallDrive : $freeMb MB (Windows drive $WinDrive will NOT be used for SQL storage)"
    if ($freeMb -lt 350 -and -not (Test-Path $PostgresExe)) {
        Write-Warn "Low disk space on $InstallDrive ($freeMb MB). At least 500 MB is recommended for local PostgreSQL."
    }
} catch {}

# STEP 1: Ensure portable PostgreSQL binaries exist inside $PgBinRoot (Install Drive ONLY)
if (-not (Test-Path $PostgresExe)) {
    $zipPath = Find-OfflinePgZip
    if (-not $zipPath) {
        $mirrorUrl = $envMap["PG_OFFLINE_ZIP_URL"]
        if ($mirrorUrl -and -not $OfflineOnly) {
            $dlTarget = Join-Path $PgOfflineDir "postgresql-offline-binaries.zip"
            Write-Info "Attempting download from configured PG_OFFLINE_ZIP_URL ($mirrorUrl)..."
            try {
                Invoke-WebRequest -Uri $mirrorUrl -OutFile $dlTarget -TimeoutSec 20 -UseBasicParsing
                if (Test-Path $dlTarget) { $zipPath = $dlTarget }
            } catch {
                Write-Warn "Mirror download unreachable offline: $($_.Exception.Message)"
            }
        }
    }

    if (-not $zipPath) {
        Write-Host ""
        Write-Host "==================================================================" -ForegroundColor Yellow
        Write-Host "  [OFFLINE NOTICE] Portable PostgreSQL package not found yet." -ForegroundColor Yellow
        Write-Host "  Zero changes were made to C:\ or your organizational database." -ForegroundColor Yellow
        Write-Host "  To activate multi-user PostgreSQL completely offline:" -ForegroundColor White
        Write-Host "  1) Place 'postgresql-16.x-windows-x64-binaries.zip' into:" -ForegroundColor White
        Write-Host "     $PgOfflineDir" -ForegroundColor Cyan
        Write-Host "  2) Re-run Update (Option 2) or Option 7 in manager.bat." -ForegroundColor White
        Write-Host "  Meanwhile, your existing system & database.json continue working." -ForegroundColor Green
        Write-Host "==================================================================" -ForegroundColor Yellow
        exit 2
    }

    Write-Info "Extracting offline PostgreSQL archive strictly on ${InstallDrive}..."
    $extractStage = Join-Path $PgTempDir "pg_extract_stage"
    if (Test-Path $extractStage) { Remove-Item -Recurse -Force $extractStage }
    New-Item -ItemType Directory -Force -Path $extractStage | Out-Null
    Expand-Archive -Path $zipPath -DestinationPath $extractStage -Force

    $nestedPg = Join-Path $extractStage "pgsql\bin\postgres.exe"
    $directPg = Join-Path $extractStage "bin\postgres.exe"
    New-Item -ItemType Directory -Force -Path $PgBinRoot | Out-Null

    if (Test-Path $nestedPg) {
        Copy-Item -Path (Join-Path $extractStage "pgsql\*") -Destination $PgBinRoot -Recurse -Force
    } elseif (Test-Path $directPg) {
        Copy-Item -Path (Join-Path $extractStage "*") -Destination $PgBinRoot -Recurse -Force
    } else {
        throw "Invalid PostgreSQL ZIP archive: bin\postgres.exe not found inside $zipPath"
    }

    Remove-Item -Recurse -Force $extractStage -ErrorAction SilentlyContinue
    Write-Ok "PostgreSQL binaries extracted to $PgBinRoot (Zero files on $WinDrive)."
}

# STEP 2: Resolve SQL_* settings non-destructively (preserve existing credentials!)
$sqlPort      = if ($envMap["SQL_PORT"]) { [int]$envMap["SQL_PORT"] } else { Find-FreePort 5439 }
$sqlDbName    = if ($envMap["SQL_DB_NAME"]) { $envMap["SQL_DB_NAME"] } else { "delkam_erp" }
$sqlAdminUser = if ($envMap["SQL_ADMIN_USER"]) { $envMap["SQL_ADMIN_USER"] } else { "postgres" }
$sqlAdminPass = if ($envMap["SQL_ADMIN_PASSWORD"]) { $envMap["SQL_ADMIN_PASSWORD"] } else { New-SafePassword }
$sqlAppUser   = if ($envMap["SQL_USER"]) { $envMap["SQL_USER"] } else { "delkam_erp_user" }
$sqlAppPass   = if ($envMap["SQL_PASSWORD"]) { $envMap["SQL_PASSWORD"] } else { New-SafePassword }

# STEP 3: Initialize cluster ONLY if $PgDataDir does NOT exist yet (NEVER wipe existing data!)
$pgVersionFile = Join-Path $PgDataDir "PG_VERSION"
if (-not (Test-Path $pgVersionFile)) {
    Write-Info "Initializing NEW compact PostgreSQL cluster in $PgDataDir (Port $sqlPort)..."
    New-Item -ItemType Directory -Force -Path $PgDataDir | Out-Null
    $pwFile = Join-Path $PgTempDir ("initpw_" + [guid]::NewGuid().ToString("N") + ".txt")
    try {
        [System.IO.File]::WriteAllText($pwFile, $sqlAdminPass, (New-Object System.Text.UTF8Encoding($false)))
        & $InitDbExe -D $PgDataDir -U $sqlAdminUser --encoding=UTF8 --locale=C --auth=scram-sha-256 --pwfile=$pwFile
        if ($LASTEXITCODE -ne 0) {
            throw "initdb failed with exit code $LASTEXITCODE"
        }
    } finally {
        if (Test-Path $pwFile) { Remove-Item -Force $pwFile -ErrorAction SilentlyContinue }
    }

    # Tune postgresql.conf for fast, compact Windows multi-user ERP storage
    $confPath = Join-Path $PgDataDir "postgresql.conf"
    $tuningBlock = @"

# === Delkam ERP Local Drive Tuning (Fast & Compact) ===
listen_addresses = '127.0.0.1'
port = $sqlPort
max_connections = 100
shared_buffers = 128MB
work_mem = 4MB
maintenance_work_mem = 64MB
min_wal_size = 32MB
max_wal_size = 256MB
wal_compression = on
synchronous_commit = on
logging_collector = off
"@
    Add-Content -Path $confPath -Value $tuningBlock -Encoding UTF8

    Set-DotEnvKeys $EnvFilePath @{
        "SQL_HOST"           = "127.0.0.1"
        "SQL_PORT"           = "$sqlPort"
        "SQL_DB_NAME"        = $sqlDbName
        "SQL_USER"           = $sqlAppUser
        "SQL_PASSWORD"       = $sqlAppPass
        "SQL_ADMIN_USER"     = $sqlAdminUser
        "SQL_ADMIN_PASSWORD" = $sqlAdminPass
        "PGDATA"             = $PgDataDir
    }
    Write-Ok "Initialized PostgreSQL cluster safely on ${InstallDrive} and updated .env without touching existing keys."
} else {
    Write-Ok "Existing PGDATA detected at $PgDataDir — preserving 100% of existing database files."
    # Ensure SQL_* keys exist in .env without overwriting existing values
    $toEnsure = @{}
    if (-not $envMap["SQL_HOST"])           { $toEnsure["SQL_HOST"] = "127.0.0.1" }
    if (-not $envMap["SQL_PORT"])           { $toEnsure["SQL_PORT"] = "$sqlPort" }
    if (-not $envMap["SQL_DB_NAME"])        { $toEnsure["SQL_DB_NAME"] = $sqlDbName }
    if (-not $envMap["SQL_USER"])           { $toEnsure["SQL_USER"] = $sqlAppUser }
    if (-not $envMap["SQL_PASSWORD"])       { $toEnsure["SQL_PASSWORD"] = $sqlAppPass }
    if (-not $envMap["SQL_ADMIN_USER"])     { $toEnsure["SQL_ADMIN_USER"] = $sqlAdminUser }
    if (-not $envMap["SQL_ADMIN_PASSWORD"]) { $toEnsure["SQL_ADMIN_PASSWORD"] = $sqlAdminPass }
    if (-not $envMap["PGDATA"])             { $toEnsure["PGDATA"] = $PgDataDir }
    if ($toEnsure.Count -gt 0) {
        Set-DotEnvKeys $EnvFilePath $toEnsure
    }
}

# Re-read final env map so port matches postgresql.conf / .env
$envMap = Read-DotEnv $EnvFilePath
$sqlPort      = if ($envMap["SQL_PORT"]) { [int]$envMap["SQL_PORT"] } else { 5439 }
$sqlDbName    = if ($envMap["SQL_DB_NAME"]) { $envMap["SQL_DB_NAME"] } else { "delkam_erp" }
$sqlAdminUser = if ($envMap["SQL_ADMIN_USER"]) { $envMap["SQL_ADMIN_USER"] } else { "postgres" }
$sqlAdminPass = if ($envMap["SQL_ADMIN_PASSWORD"]) { $envMap["SQL_ADMIN_PASSWORD"] } else { "" }
$sqlAppUser   = if ($envMap["SQL_USER"]) { $envMap["SQL_USER"] } else { "delkam_erp_user" }
$sqlAppPass   = if ($envMap["SQL_PASSWORD"]) { $envMap["SQL_PASSWORD"] } else { "" }

# STEP 4: Ensure isolated Windows Service 'DelkamErpPostgres' is registered & running
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if (-not $svc) {
    Write-Info "Registering Windows Service '$ServiceName' pointing to $PgDataDir..."
    try {
        & $PgCtlExe register -N $ServiceName -D $PgDataDir -S auto | Out-Null
    } catch {
        Write-Warn "Could not register Windows Service (requires Admin); will start via pg_ctl directly."
    }
}

# Check readiness or start service / pg_ctl
$ready = $false
& $PgIsReady -h 127.0.0.1 -p $sqlPort -q 2>$null
if ($LASTEXITCODE -eq 0) { $ready = $true }

if (-not $ready) {
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($svc) {
        Write-Info "Starting Windows Service '$ServiceName'..."
        Start-Service -Name $ServiceName -ErrorAction SilentlyContinue
    } else {
        $pgLogFile = Join-Path $PgLogsDir "postgresql.log"
        Write-Info "Starting PostgreSQL directly via pg_ctl..."
        & $PgCtlExe -D $PgDataDir -l $pgLogFile start | Out-Null
    }

    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1
        & $PgIsReady -h 127.0.0.1 -p $sqlPort -q 2>$null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    }
}

if (-not $ready) {
    throw "Local PostgreSQL did not respond on 127.0.0.1:$sqlPort within 20s. Check $PgLogsDir\postgresql.log."
}
Write-Ok "Local PostgreSQL is active on 127.0.0.1:$sqlPort."

# STEP 5: Ensure role & database exist non-destructively
$env:PGPASSWORD = $sqlAdminPass
try {
    $escapedUser = $sqlAppUser.Replace("'", "''")
    $escapedPass = $sqlAppPass.Replace("'", "''")
    $escapedDb   = $sqlDbName.Replace('"', '""')

    $roleExists = & $PsqlExe -h 127.0.0.1 -p $sqlPort -U $sqlAdminUser -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$escapedUser';"
    if ($roleExists.Trim() -ne "1") {
        Write-Info "Creating ERP database role '$sqlAppUser'..."
        & $PsqlExe -h 127.0.0.1 -p $sqlPort -U $sqlAdminUser -d postgres -c "CREATE USER `"$sqlAppUser`" WITH PASSWORD '$escapedPass';" | Out-Null
    }

    $dbExists = & $PsqlExe -h 127.0.0.1 -p $sqlPort -U $sqlAdminUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$($sqlDbName.Replace("'", "''"))';"
    if ($dbExists.Trim() -ne "1") {
        Write-Info "Creating ERP database '$sqlDbName'..."
        & $PsqlExe -h 127.0.0.1 -p $sqlPort -U $sqlAdminUser -d postgres -c "CREATE DATABASE `"$escapedDb`" OWNER `"$sqlAppUser`" ENCODING 'UTF8';" | Out-Null
    } else {
        & $PsqlExe -h 127.0.0.1 -p $sqlPort -U $sqlAdminUser -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE `"$escapedDb`" TO `"$sqlAppUser`";" | Out-Null
    }
    & $PsqlExe -h 127.0.0.1 -p $sqlPort -U $sqlAdminUser -d $sqlDbName -c "GRANT ALL ON SCHEMA public TO `"$sqlAppUser`";" | Out-Null
} finally {
    $env:PGPASSWORD = ""
}

# STEP 6: Compact pre-update binary dump if updating an existing database
if ($Mode -eq "update" -and (Test-Path $PgDumpExe)) {
    $env:PGPASSWORD = $sqlAdminPass
    try {
        $ts = Get-Date -Format "yyyyMMdd_HHmmss"
        $dumpFile = Join-Path $PgBackupsDir "pre_update_${sqlDbName}_${ts}.dump"
        Write-Info "Creating compact PostgreSQL safety dump before schema sync..."
        & $PgDumpExe -h 127.0.0.1 -p $sqlPort -U $sqlAdminUser -d $sqlDbName -Fc -Z 9 -f $dumpFile 2>$null
        # Retain newest 5 dumps to keep install drive compact
        $oldDumps = Get-ChildItem -Path $PgBackupsDir -Filter "pre_update_*.dump" -File | Sort-Object LastWriteTime -Descending | Select-Object -Skip 5
        if ($oldDumps) { $oldDumps | Remove-Item -Force -ErrorAction SilentlyContinue }
        Write-Ok "Safety PostgreSQL dump saved: $dumpFile"
    } catch {
        Write-Warn "Pre-update pg_dump skipped: $($_.Exception.Message)"
    } finally {
        $env:PGPASSWORD = ""
    }
}

# STEP 7: Run offline idempotent DDL sync (zero internet required, zero destructive operations)
Write-Info "Synchronizing ERP PostgreSQL tables non-destructively (offline DDL)..."
Push-Location $InstallDir
try {
    node (Join-Path $InstallDir "scripts\setup-local-postgres-schema.mjs")
    if ($LASTEXITCODE -ne 0) {
        throw "Schema synchronization exited with code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

Write-Ok "Local PostgreSQL ready on ${InstallDrive} ($PgDataDir) without touching $WinDrive or other databases!"
exit 0
