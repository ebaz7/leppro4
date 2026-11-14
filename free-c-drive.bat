@echo off
setlocal
color 0A
title Delkam - Safe Windows C:\ Drive Cleanup

cd /d "%~dp0"

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ========================================================================
    echo [NOTE] Running in standard user mode.
    echo User caches, Temp, Gradle, Cargo cache, WebView2 HTTP cache, and old
    echo installers will be cleaned. Right-click "Run as administrator" to also
    echo clean C:\Windows\Temp and C:\Windows\SoftwareDistribution\Download.
    echo ========================================================================
    echo.
)

if exist "%~dp0scripts\free-c-drive.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\free-c-drive.ps1" -InstallDir "%~dp0"
) else (
    echo [ERROR] scripts\free-c-drive.ps1 not found!
)

echo.
pause
