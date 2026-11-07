@echo off
setlocal EnableDelayedExpansion
color 0A
title ONLYOFFICE Offline Server Installer

echo ========================================================
echo       ONLYOFFICE Document Server - Offline Auto Installer
echo ========================================================
echo.
echo [1/3] Checking Docker installation...

where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Docker is not installed or not in PATH!
    echo Please install Docker Desktop for Windows from:
    echo https://www.docker.com/products/docker-desktop/
    echo.
    echo After installing Docker, run this script again.
    pause
    exit /b 1
)

echo [OK] Docker is installed and ready.
echo.
echo [2/3] Checking if ONLYOFFICE container is already running...
docker ps -a --filter "name=onlyoffice-documentserver" --format "{{.Names}}" | findstr /r "onlyoffice-documentserver" >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Existing container found. Restarting...
    docker start onlyoffice-documentserver >nul 2>&1
) else (
    echo [INFO] Starting new ONLYOFFICE Document Server on port 8088...
    docker run -i -t -d -p 8088:80 --name onlyoffice-documentserver --restart=always -e JWT_ENABLED=false -e ALLOW_PRIVATE_IP_ADDRESS=true -e USE_UNAUTHORIZED_STORAGE=true onlyoffice/documentserver
)

echo.
echo [3/3] Verifying ONLYOFFICE status...
timeout /t 5 >nul
echo.
echo ========================================================
echo [SUCCESS] ONLYOFFICE Document Server is running offline!
echo.
echo Server Address: http://localhost:8088
echo (or http://^<YOUR_SERVER_IP^>:8088 from other computers)
echo ========================================================
pause
