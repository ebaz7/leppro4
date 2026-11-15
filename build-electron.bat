@echo off
chcp 65001 >nul
echo ============================================================================
echo 🚀 ساخت خودکار نسخه جدید ویندوز (Electron)، ارتقای ورژن و انتقال به پوشه downloads
echo ============================================================================
node build-electron.cjs %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ خطا در ساخت نسخه الکترون!
    pause
    exit /b %ERRORLEVEL%
)
ie4uinit.exe -show >nul 2>&1
ie4uinit.exe -ClearIconCache >nul 2>&1
echo.
pause
