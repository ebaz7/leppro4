@echo off
chcp 65001 >nul
echo ============================================================================
echo 🚀 ساخت خودکار نسخه جدید دسکتاپ (Tauri)، ارتقای ورژن و انتقال به پوشه دانلود
echo ============================================================================
node setup-desktop-icons.cjs --release %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ خطا در ساخت نسخه دسکتاپ!
    pause
    exit /b %ERRORLEVEL%
)
ie4uinit.exe -show >nul 2>&1
ie4uinit.exe -ClearIconCache >nul 2>&1
echo.
pause
