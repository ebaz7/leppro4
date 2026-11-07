@echo off
chcp 65001 >nul
echo ==========================================
echo    Android Signed Release APK Builder
echo ==========================================

echo Running integrated Android construction container...
call node build-android.js --release

pause
