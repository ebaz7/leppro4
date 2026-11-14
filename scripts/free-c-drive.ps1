param(
    [string]$InstallDir = "",
    [switch]$SkipEnvRedirect
)

$ErrorActionPreference = "SilentlyContinue"

if ([string]::IsNullOrWhiteSpace($InstallDir)) {
    $InstallDir = Split-Path -Parent $PSScriptRoot
}
$InstallDir = $InstallDir.TrimEnd('\', '/')
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}
$InstallDrive = ([System.IO.Path]::GetPathRoot($InstallDir)).TrimEnd('\').ToUpper()

function Get-DriveFreeBytes {
    param([string]$DriveLetter)
    try {
        $d = [System.IO.DriveInfo]::new($DriveLetter)
        if ($d.IsReady) { return [int64]$d.AvailableFreeSpace }
    } catch {}
    return [int64]0
}

function Format-Bytes {
    param([int64]$Bytes)
    if ($Bytes -ge 1GB) { return ("{0:N2} GB" -f ($Bytes / 1GB)) }
    if ($Bytes -ge 1MB) { return ("{0:N1} MB" -f ($Bytes / 1MB)) }
    if ($Bytes -ge 1KB) { return ("{0:N0} KB" -f ($Bytes / 1KB)) }
    return "$Bytes B"
}

function Get-SafeFolderBytes {
    param([string]$TargetPath)
    if (-not (Test-Path $TargetPath)) { return [int64]0 }
    try {
        $sum = (Get-ChildItem -LiteralPath $TargetPath -Recurse -Force -File -ErrorAction SilentlyContinue |
            Measure-Object -Property Length -Sum).Sum
        if ($null -eq $sum) { return [int64]0 }
        return [int64]$sum
    } catch {
        return [int64]0
    }
}

$TotalFreed = [int64]0

function Clear-DirContents {
    param(
        [string]$TargetPath,
        [string]$Label
    )
    if (-not (Test-Path $TargetPath)) { return }
    $before = Get-SafeFolderBytes -TargetPath $TargetPath
    if ($before -le 0) {
        Get-ChildItem -LiteralPath $TargetPath -Force -ErrorAction SilentlyContinue | ForEach-Object {
            try { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue } catch {}
        }
        return
    }
    Get-ChildItem -LiteralPath $TargetPath -Force -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
        } catch {}
    }
    $after = Get-SafeFolderBytes -TargetPath $TargetPath
    $freed = [Math]::Max([int64]0, $before - $after)
    if ($freed -gt 0) {
        $script:TotalFreed += $freed
        Write-Host ("  [FREED {0,9}] {1} ({2})" -f (Format-Bytes $freed), $Label, $TargetPath) -ForegroundColor Green
    } else {
        Write-Host ("  [SKIP/LOCKED ] {0} ({1})" -f $Label, $TargetPath) -ForegroundColor DarkGray
    }
}

function Remove-OldMatchingFiles {
    param(
        [string]$DirectoryPath,
        [string[]]$Patterns,
        [int]$KeepNewest = 1,
        [string]$Label
    )
    if (-not (Test-Path $DirectoryPath)) { return }
    $matches = @()
    foreach ($pat in $Patterns) {
        $found = Get-ChildItem -LiteralPath $DirectoryPath -Filter $pat -File -Force -ErrorAction SilentlyContinue
        if ($found) { $matches += $found }
    }
    $uniqueMatches = $matches | Sort-Object FullName -Unique | Sort-Object LastWriteTimeUtc -Descending
    if (-not $uniqueMatches -or $uniqueMatches.Count -le $KeepNewest) { return }

    $toDelete = $uniqueMatches | Select-Object -Skip $KeepNewest
    $freedHere = [int64]0
    foreach ($f in $toDelete) {
        $sz = [int64]$f.Length
        try {
            Remove-Item -LiteralPath $f.FullName -Force -ErrorAction Stop
            $freedHere += $sz
        } catch {}
    }
    if ($freedHere -gt 0) {
        $script:TotalFreed += $freedHere
        Write-Host ("  [FREED {0,9}] {1} (kept newest {2})" -f (Format-Bytes $freedHere), $Label, $KeepNewest) -ForegroundColor Green
    }
}

$IsAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$BeforeFreeC = Get-DriveFreeBytes -DriveLetter "C"

Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "  Delkam Enterprise - Safe Windows C:\ Drive Cleanup & Cache Relocator" -ForegroundColor Cyan
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "  Install Dir   : $InstallDir (Drive $InstallDrive)"
Write-Host "  Admin Mode    : $IsAdmin"
Write-Host "  C:\ Free Now  : $(Format-Bytes $BeforeFreeC)"
Write-Host "  Safety Policy : NEVER touches pgdata, database.json, .env, wauth, Documents"
Write-Host "------------------------------------------------------------------------"

$UserProfiles = Get-ChildItem -LiteralPath "C:\Users" -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notin @("Public", "Default", "Default User", "All Users") }

# 1. Windows & User Temp Folders
Write-Host "`n[1/7] Cleaning disposable Windows and User Temp caches..." -ForegroundColor Yellow
Clear-DirContents -TargetPath "C:\Windows\Temp" -Label "Windows Temp"
foreach ($prof in $UserProfiles) {
    Clear-DirContents -TargetPath (Join-Path $prof.FullName "AppData\Local\Temp") -Label "User Temp ($($prof.Name))"
}

# 2. Build Tool & Package Manager Caches (npm, pip, Yarn, pnpm, Electron, Gradle, Cargo registry cache)
Write-Host "`n[2/7] Cleaning build & package caches (preserving installed tools & cargo bin)..." -ForegroundColor Yellow
foreach ($prof in $UserProfiles) {
    $u = $prof.Name
    Clear-DirContents -TargetPath (Join-Path $prof.FullName "AppData\Local\npm-cache") -Label "npm cache ($u)"
    Clear-DirContents -TargetPath (Join-Path $prof.FullName "AppData\Local\pip\cache") -Label "pip cache ($u)"
    Clear-DirContents -TargetPath (Join-Path $prof.FullName "AppData\Local\Yarn\Cache") -Label "Yarn cache ($u)"
    Clear-DirContents -TargetPath (Join-Path $prof.FullName "AppData\Local\pnpm\store") -Label "pnpm store ($u)"
    Clear-DirContents -TargetPath (Join-Path $prof.FullName "AppData\Local\electron\Cache") -Label "Electron cache ($u)"
    Clear-DirContents -TargetPath (Join-Path $prof.FullName "AppData\Local\electron-builder\Cache") -Label "Electron Builder cache ($u)"

    # Gradle disposable caches & daemon logs
    Clear-DirContents -TargetPath (Join-Path $prof.FullName ".gradle\caches") -Label "Gradle caches ($u)"
    Clear-DirContents -TargetPath (Join-Path $prof.FullName ".gradle\daemon") -Label "Gradle daemon logs ($u)"
    Clear-DirContents -TargetPath (Join-Path $prof.FullName ".gradle\native") -Label "Gradle native cache ($u)"

    # Cargo registry/git source caches only (NEVER touch .cargo\bin or .rustup)
    Clear-DirContents -TargetPath (Join-Path $prof.FullName ".cargo\registry\cache") -Label "Cargo crate archives ($u)"
    Clear-DirContents -TargetPath (Join-Path $prof.FullName ".cargo\registry\src") -Label "Cargo extracted sources ($u)"
    Clear-DirContents -TargetPath (Join-Path $prof.FullName ".cargo\git\db") -Label "Cargo git cache ($u)"
}

# 3. Delkam Desktop Old Update Installers & WebView2 HTTP/GPU Shader Cache (preserves LocalStorage/Cookies/Auth)
Write-Host "`n[3/7] Removing old Delkam installers & WebView2 HTTP/GPU cache (keeping newest 1)..." -ForegroundColor Yellow
foreach ($prof in $UserProfiles) {
    $u = $prof.Name
    $dlkamFiles = Join-Path $prof.FullName "AppData\Local\ir.dlkam.desktop.app\DlkamFiles"
    Remove-OldMatchingFiles -DirectoryPath $dlkamFiles -Patterns @("*.exe", "*.msi") -KeepNewest 1 -Label "DlkamFiles old installers ($u)"

    $downloads = Join-Path $prof.FullName "Downloads"
    Remove-OldMatchingFiles -DirectoryPath $downloads -Patterns @("dlkam-desktop*.exe", "dlkam-desktop*.msi", "dlkam-electron*.exe", "sayan-desktop*.exe", "dlkam-android*.apk") -KeepNewest 1 -Label "Downloads old Delkam setups ($u)"

    $webviewDefault = Join-Path $prof.FullName "AppData\Local\ir.dlkam.desktop.app\EBWebView\Default"
    Clear-DirContents -TargetPath (Join-Path $webviewDefault "Cache") -Label "WebView2 HTTP Cache ($u)"
    Clear-DirContents -TargetPath (Join-Path $webviewDefault "Code Cache") -Label "WebView2 Code Cache ($u)"
    Clear-DirContents -TargetPath (Join-Path $webviewDefault "GPUCache") -Label "WebView2 GPU Cache ($u)"
    Clear-DirContents -TargetPath (Join-Path $webviewDefault "DawnCache") -Label "WebView2 Dawn Cache ($u)"
}

# 4. Windows Crash Dumps & Error Reporting
Write-Host "`n[4/7] Cleaning Windows crash dumps & WER queues..." -ForegroundColor Yellow
foreach ($prof in $UserProfiles) {
    Clear-DirContents -TargetPath (Join-Path $prof.FullName "AppData\Local\CrashDumps") -Label "CrashDumps ($($prof.Name))"
}
Clear-DirContents -TargetPath "C:\ProgramData\Microsoft\Windows\WER\ReportArchive" -Label "WER Report Archive"
Clear-DirContents -TargetPath "C:\ProgramData\Microsoft\Windows\WER\ReportQueue" -Label "WER Report Queue"

# 5. Windows Update Downloaded Cache (Admin only) & C:\ Recycle Bin
Write-Host "`n[5/7] Cleaning C:\ Recycle Bin and Windows Update download cache..." -ForegroundColor Yellow
if ($IsAdmin) {
    $wuPath = "C:\Windows\SoftwareDistribution\Download"
    $wuBefore = Get-SafeFolderBytes -TargetPath $wuPath
    if ($wuBefore -gt 0) {
        $wuSvc = Get-Service -Name "wuauserv" -ErrorAction SilentlyContinue
        $wasRunning = ($wuSvc -and $wuSvc.Status -eq "Running")
        if ($wasRunning) {
            Stop-Service -Name "wuauserv" -Force -ErrorAction SilentlyContinue
            Start-Sleep -Milliseconds 700
        }
        Clear-DirContents -TargetPath $wuPath -Label "Windows Update Download Cache"
        if ($wasRunning) {
            Start-Service -Name "wuauserv" -ErrorAction SilentlyContinue
        }
    }
} else {
    Write-Host "  [NOTE] Not running as Administrator; skipped C:\Windows\SoftwareDistribution\Download." -ForegroundColor DarkYellow
}

try {
    Clear-RecycleBin -DriveLetter C -Force -ErrorAction SilentlyContinue
    Write-Host "  [DONE] C:\ Recycle Bin emptied." -ForegroundColor Green
} catch {}

# 6. Docker Safe Build Cache Check (NEVER deletes containers/images like ONLYOFFICE)
Write-Host "`n[6/7] Checking Docker / ONLYOFFICE disk footprint on C:\..." -ForegroundColor Yellow
$dockerExe = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerExe) {
    $dockerOk = $false
    try {
        $null = & docker info 2>$null
        if ($LASTEXITCODE -eq 0) { $dockerOk = $true }
    } catch {}
    if ($dockerOk) {
        Write-Host "  Running safe 'docker builder prune -f' (containers & ONLYOFFICE images stay safe)..."
        & docker builder prune -f | Out-Null
    }
}
foreach ($prof in $UserProfiles) {
    $dockerWsl = Join-Path $prof.FullName "AppData\Local\Docker\wsl"
    if (Test-Path $dockerWsl) {
        $vhdxFiles = Get-ChildItem -LiteralPath $dockerWsl -Recurse -Filter "*.vhdx" -File -ErrorAction SilentlyContinue
        foreach ($vh in $vhdxFiles) {
            if ($vh.Length -gt 2GB) {
                Write-Host ("  [INFO] Large Docker WSL2 virtual disk on C:\ -> {0} ({1})" -f $vh.FullName, (Format-Bytes $vh.Length)) -ForegroundColor Cyan
                Write-Host ("         Tip: In Docker Desktop -> Settings -> Resources -> Advanced, move Disk image location to {0}\DockerData" -f $InstallDrive) -ForegroundColor Cyan
            }
        }
    }
}

# 7. Redirect future Gradle / Android / Electron / npm caches off C:\ onto InstallDir
Write-Host "`n[7/7] Redirecting future build/update caches onto $InstallDir..." -ForegroundColor Yellow
if (-not $SkipEnvRedirect -and $InstallDrive -ne "C:") {
    $RedirectMap = @{
        "GRADLE_USER_HOME"       = (Join-Path $InstallDir ".gradle_home")
        "ANDROID_USER_HOME"      = (Join-Path $InstallDir ".android_home")
        "ELECTRON_CACHE"         = (Join-Path $InstallDir ".electron_cache")
        "ELECTRON_BUILDER_CACHE" = (Join-Path $InstallDir ".electron_builder_cache")
        "npm_config_cache"       = (Join-Path $InstallDir ".npm_cache")
    }
    foreach ($kv in $RedirectMap.GetEnumerator()) {
        if (-not (Test-Path $kv.Value)) {
            New-Item -ItemType Directory -Path $kv.Value -Force | Out-Null
        }
        [Environment]::SetEnvironmentVariable($kv.Key, $kv.Value, "User")
        if ($IsAdmin) {
            [Environment]::SetEnvironmentVariable($kv.Key, $kv.Value, "Machine")
        }
        Write-Host ("  [SET ] {0} = {1}" -f $kv.Key, $kv.Value) -ForegroundColor Green
    }
} else {
    Write-Host "  [SKIP] Env redirection skipped (InstallDrive=$InstallDrive)." -ForegroundColor DarkGray
}

$AfterFreeC = Get-DriveFreeBytes -DriveLetter "C"
$NetGainC = [Math]::Max([int64]0, $AfterFreeC - $BeforeFreeC)

Write-Host "`n========================================================================" -ForegroundColor Cyan
Write-Host ("  C:\ Free Before : {0}" -f (Format-Bytes $BeforeFreeC))
Write-Host ("  C:\ Free After  : {0}" -f (Format-Bytes $AfterFreeC)) -ForegroundColor Green
Write-Host ("  Net C:\ Gained  : {0}" -f (Format-Bytes $NetGainC)) -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Cyan
exit 0
