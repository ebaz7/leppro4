@echo off
setlocal EnableDelayedExpansion
color 0B
title Payment System Deployment Manager

:: Change to the directory of this script to avoid running in System32 when launched as Admin
cd /d "%~dp0"

:: Redirect temp and ALL build/package caches to the installation drive so C:\ is NEVER filled
if not exist "%cd%\pgtemp" mkdir "%cd%\pgtemp" >nul 2>&1
if not exist "%cd%\.npm_cache\_logs" mkdir "%cd%\.npm_cache\_logs" >nul 2>&1
if not exist "%cd%\.gradle_home" mkdir "%cd%\.gradle_home" >nul 2>&1
if not exist "%cd%\.android_home" mkdir "%cd%\.android_home" >nul 2>&1
if not exist "%cd%\.electron_cache" mkdir "%cd%\.electron_cache" >nul 2>&1
if not exist "%cd%\.electron_builder_cache" mkdir "%cd%\.electron_builder_cache" >nul 2>&1
if not exist "%cd%\.cache" mkdir "%cd%\.cache" >nul 2>&1
set "TEMP=%cd%\pgtemp"
set "TMP=%cd%\pgtemp"
set "npm_config_cache=%cd%\.npm_cache"
set "npm_config_logs_dir=%cd%\.npm_cache\_logs"
set "GRADLE_USER_HOME=%cd%\.gradle_home"
set "ANDROID_USER_HOME=%cd%\.android_home"
set "ELECTRON_CACHE=%cd%\.electron_cache"
set "ELECTRON_BUILDER_CACHE=%cd%\.electron_builder_cache"
set "XDG_CACHE_HOME=%cd%\.cache"

:: Check for Administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo =======================================================
    echo ERROR: ADMINISTRATOR PRIVILEGES REQUIRED
    echo =======================================================
    echo Please right-click on this script and select
    echo "Run as administrator".
    echo =======================================================
    pause
    exit /b
)

:MENU
cls
echo ========================================================
echo         Payment System - Deployment Manager
echo         Install Drive: %cd:~0,3%  (C:\ Protected)
echo ========================================================
echo 1. Install (Setup App + Install-Drive PostgreSQL + Service)
echo 2. Update (Backup DB/Env, Offline-Safe Pull, Sync SQL, Restart)
echo 3. Uninstall (Backup DB/Env, Stop Services Safely)
echo 4. View Error Logs (Check why it didn't start)
echo 5. Install / Start ONLYOFFICE Document Server (Offline Docker)
echo 6. Setup / Check Local PostgreSQL (Same Install Drive, Offline)
echo 7. Free Up Windows C:\ Drive Space (Safe Cleanup + Redirect Caches)
echo 8. Exit
echo ========================================================
set "choice="
set /p "choice=Select an option (1-8): "
if not defined choice goto MENU
set "choice=!choice: =!"
set "choice=!choice:"=!"

if "!choice!"=="1" goto INSTALL
if "!choice!"=="2" goto UPDATE
if "!choice!"=="3" goto UNINSTALL
if "!choice!"=="4" goto LOGS
if "!choice!"=="5" goto ONLYOFFICE
if "!choice!"=="6" goto POSTGRES
if "!choice!"=="7" goto CLEAN_C
if "!choice!"=="8" goto :eof

goto MENU

:CLEAN_C
cls
if exist "%cd%\scripts\free-c-drive.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%cd%\scripts\free-c-drive.ps1" -InstallDir "%cd%"
) else (
    echo [ERROR] scripts\free-c-drive.ps1 not found.
)
pause
goto MENU

:ONLYOFFICE
cls
call install_onlyoffice.bat
goto MENU

:POSTGRES
cls
echo ========================================================
echo    LOCAL POSTGRESQL SETUP / CHECK (INSTALL DRIVE ONLY)
echo ========================================================
echo Install Directory: %cd%
echo No files or data will be placed on Windows C:\ drive.
echo.
if exist "%cd%\scripts\setup-local-postgres.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%cd%\scripts\setup-local-postgres.ps1" -InstallDir "%cd%" -Mode update
    sc query PaymentSystem >nul 2>&1
    if !errorlevel! equ 0 (
        sc query PaymentSystem | findstr "RUNNING" >nul 2>&1
        if !errorlevel! neq 0 (
            echo [INFO] Starting PaymentSystem Windows Service...
            net start PaymentSystem
        )
    )
) else (
    echo [ERROR] scripts\setup-local-postgres.ps1 not found.
)
pause
goto MENU

:INSTALL
cls
echo ========================================================
echo                      INSTALLATION
echo ========================================================
echo WARNING: This will install into the CURRENT directory.
call :BACKUP

echo.
set /p repo="Enter GitHub repository URL (e.g. https://github.com/user/repo.git): "
if "!repo!"=="" goto MENU
set /p branch="Enter branch name (default: main): "
if "!branch!"=="" set branch=main

echo.
echo [1/7] Cloning repository...
taskkill /F /IM chrome.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
git init
git remote add origin !repo!
git fetch origin
git reset --hard origin/!branch!
git branch -M !branch!
git branch --set-upstream-to=origin/!branch! !branch!
if errorlevel 1 (
    echo [ERROR] Git clone/fetch failed. Make sure git is installed and repo URL is correct.
    pause
    goto MENU
)
git rm -r --cached wauth 2>nul
git rm -r --cached backups 2>nul
git rm -r --cached extracted_excel 2>nul
git rm -r --cached temp 2>nul
git rm -r --cached pgsql 2>nul
git rm -r --cached pgdata 2>nul
git rm -r --cached pglogs 2>nul
git rm -r --cached pgtemp 2>nul
git rm -r --cached pgarchive 2>nul
git rm -r --cached pgsql_offline 2>nul
git rm -r --cached .npm_cache 2>nul
git rm -r --cached .gradle_home 2>nul
git rm -r --cached .android_home 2>nul
git rm -r --cached .electron_cache 2>nul
git rm -r --cached .electron_builder_cache 2>nul
git rm -r --cached .temp 2>nul
git rm -r --cached .cache 2>nul

echo.
echo [2/8] Configuring Port and Proxy (Preserving existing .env if present)...
set /p APP_PORT="Enter Port (Default 80): "
if "!APP_PORT!"=="" set APP_PORT=80
set /p APP_PROXY="Enter Proxy URL (Optional, leave blank for offline/LAN): "

if not exist .env (
    echo PORT=!APP_PORT! > .env
    if not "!APP_PROXY!"=="" echo PROXY_URL=!APP_PROXY! >> .env
    echo Configuration saved to .env
) else (
    echo Existing .env detected and preserved safely ^(not overwritten^).
)

echo.
echo [3/8] Installing Node.js dependencies (Offline-compatible)...
set "PUPPETEER_CACHE_DIR=%cd%\.puppeteer"
set "PUPPETEER_SKIP_DOWNLOAD=true"
call npm install --prefer-offline --no-audit --no-fund
if errorlevel 1 (
    if exist node_modules (
        echo [WARNING] npm install returned an error ^(likely offline^). Checking core SQL drivers...
        if not exist "node_modules\pg" (
            call npm install pg drizzle-orm --no-save --prefer-offline --no-audit --no-fund >nul 2>&1
        ) else if not exist "node_modules\drizzle-orm" (
            call npm install pg drizzle-orm --no-save --prefer-offline --no-audit --no-fund >nul 2>&1
        )
        echo [WARNING] Continuing safely with existing node_modules.
    ) else (
        echo [ERROR] node_modules missing and npm install failed offline.
        pause
        goto MENU
    )
)

echo.
echo [4/8] Patching dependencies (if required)...
if exist patch-dependencies.js node patch-dependencies.js

echo.
echo [5/8] Setting up Local PostgreSQL inside Install Drive (%cd%\pgdata)...
if exist "%cd%\scripts\setup-local-postgres.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%cd%\scripts\setup-local-postgres.ps1" -InstallDir "%cd%" -Mode install -OfflineOnly
    if !errorlevel! equ 2 (
        echo [NOTE] Offline PostgreSQL archive not in pgsql_offline\ yet. Continuing safely with database.json.
    )
)

echo.
echo [6/8] Building Frontend...
call npm run build

echo.
echo [7/8] Setting up the Windows Service...
if exist install-service.js (
    node install-service.js
) else (
    echo [ERROR] install-service.js not found.
)

echo.
echo [8/8] Configuring Windows Firewall...
if exist .env (
    for /f "tokens=2 delims==" %%a in ('findstr "^PORT=" .env') do set APP_PORT=%%a
    if not "!APP_PORT!"=="" (
        echo Opening port !APP_PORT! in Windows Firewall...
        netsh advfirewall firewall add rule name="PaymentSystem" dir=in action=allow protocol=TCP localport=!APP_PORT! >nul 2>&1
    )
)

echo.
echo Checking and activating ONLYOFFICE Offline Document Server...
where docker >nul 2>&1
if %errorlevel% equ 0 (
    docker info >nul 2>&1
    if !errorlevel! equ 0 (
        echo [INFO] Docker is running. Ensuring ONLYOFFICE container is active on port 8088...
        docker ps -a --filter "name=onlyoffice-documentserver" --format "{{.Names}}" 2>nul | findstr /r "onlyoffice-documentserver" >nul 2>&1
        if !errorlevel! equ 0 (
            docker start onlyoffice-documentserver >nul 2>&1
        ) else (
            docker run -i -t -d -p 8088:80 --name onlyoffice-documentserver --restart=always -e JWT_ENABLED=false -e ALLOW_PRIVATE_IP_ADDRESS=true -e USE_UNAUTHORIZED_STORAGE=true onlyoffice/documentserver >nul 2>&1
        )
        netsh advfirewall firewall add rule name="ONLYOFFICE_8088" dir=in action=allow protocol=TCP localport=8088 >nul 2>&1
        echo [OK] ONLYOFFICE Document Server is active on port 8088.
    ) else (
        echo [NOTE] Docker Desktop is installed but not currently running. Skipping ONLYOFFICE container check.
    )
) else (
    echo [NOTE] Docker not detected. To enable offline ONLYOFFICE, install Docker Desktop and choose option 5.
)

echo ========================================================
echo Installation finished!
echo ========================================================
pause
goto MENU

:UPDATE
cls
echo ========================================================
echo              OFFLINE-SAFE UPDATE (C:\ PROTECTED)
echo ========================================================
call :BACKUP update

echo.
set "repo="
set /p "repo=Enter Git repository URL (or press ENTER for offline/local update): "
set "branch="
set /p "branch=Enter branch name (default: main): "
if "!branch!"=="" set "branch=main"

echo.
echo Stopping Windows Service and releasing file locks...
net stop PaymentSystem >nul 2>&1
taskkill /F /IM chrome.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul 2>&1

set "WAUTH_BACKED_UP=0"
if exist wauth (
    if exist _wauth_temp rd /s /q _wauth_temp >nul 2>&1
    ren wauth _wauth_temp >nul 2>&1
    if exist _wauth_temp set "WAUTH_BACKED_UP=1"
)

echo.
echo [1/7] Checking Git updates (Offline-safe; existing DB ^& PGDATA never overwritten)...
if exist .git (
    if not "!repo!"=="" (
        git remote remove origin 2>nul
        git remote add origin !repo!
        git fetch origin
        if !errorlevel! equ 0 (
            git reset --hard origin/!branch!
            git branch -M !branch!
            git branch --set-upstream-to=origin/!branch! !branch!
        ) else (
            echo [NOTE] Offline mode or repo unreachable - skipping git reset to protect local files!
        )
    ) else (
        echo [NOTE] No repo URL entered - running local/offline update without remote fetch.
    )
) else (
    if not "!repo!"=="" (
        git init
        git remote add origin !repo!
        git fetch origin
        if !errorlevel! equ 0 (
            git reset --hard origin/!branch!
            git branch -M !branch!
            git branch --set-upstream-to=origin/!branch! !branch!
        ) else (
            echo [NOTE] Offline mode - skipping git reset cleanly.
        )
    ) else (
        echo [NOTE] Running local offline update cleanly.
    )
)

REM Untrack volatile and install-drive database folders from git index
git rm -r --cached wauth 2>nul
git rm -r --cached backups 2>nul
git rm -r --cached extracted_excel 2>nul
git rm -r --cached temp 2>nul
git rm -r --cached pgsql 2>nul
git rm -r --cached pgdata 2>nul
git rm -r --cached pglogs 2>nul
git rm -r --cached pgtemp 2>nul
git rm -r --cached pgarchive 2>nul
git rm -r --cached pgsql_offline 2>nul
git rm -r --cached .npm_cache 2>nul
git rm -r --cached .gradle_home 2>nul
git rm -r --cached .android_home 2>nul
git rm -r --cached .electron_cache 2>nul
git rm -r --cached .electron_builder_cache 2>nul
git rm -r --cached .temp 2>nul
git rm -r --cached .cache 2>nul

REM Restore wauth session directory
if "!WAUTH_BACKED_UP!"=="1" (
    if exist wauth rd /s /q wauth >nul 2>&1
    ren _wauth_temp wauth >nul 2>&1
)

echo.
echo [2/7] Installing/Updating dependencies (Offline-compatible)...
set "PUPPETEER_CACHE_DIR=%cd%\.puppeteer"
set "PUPPETEER_SKIP_DOWNLOAD=true"
call npm install --prefer-offline --no-audit --no-fund
if errorlevel 1 (
    if exist node_modules (
        echo [NOTE] Offline/partial npm install warning - checking core SQL drivers...
        if not exist "node_modules\pg" (
            call npm install pg drizzle-orm --no-save --prefer-offline --no-audit --no-fund >nul 2>&1
        ) else if not exist "node_modules\drizzle-orm" (
            call npm install pg drizzle-orm --no-save --prefer-offline --no-audit --no-fund >nul 2>&1
        )
        echo [NOTE] Continuing safely with existing node_modules.
    ) else (
        echo [ERROR] Dependency installation failed and node_modules folder does not exist.
        pause
        goto MENU
    )
)

echo.
echo [3/7] Patching dependencies (if required)...
if exist patch-dependencies.js node patch-dependencies.js

echo.
echo [4/7] Setting up / Verifying Local PostgreSQL inside Install Drive (Never touches C:\)...
if exist "%cd%\scripts\setup-local-postgres.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%cd%\scripts\setup-local-postgres.ps1" -InstallDir "%cd%" -Mode update -OfflineOnly
    if !errorlevel! equ 2 (
        echo [NOTE] Local PostgreSQL offline archive not present yet; existing system ^& database.json remain active and safe.
    ) else if errorlevel 1 (
        echo [WARNING] Local PostgreSQL check reported a warning. Your existing organizational database.json remains untouched.
    )
)

echo.
echo [5/7] Building Frontend...
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed!
    pause
    goto MENU
)

echo.
echo [6/7] Updating ^& Restarting Windows Service...
if exist install-service.js (
    node install-service.js >nul 2>&1
    timeout /t 4 /nobreak >nul 2>&1
)
sc query PaymentSystem | findstr /R "RUNNING START_PENDING" >nul 2>&1
if !errorlevel! neq 0 (
    net start PaymentSystem
) else (
    echo [OK] PaymentSystem Windows Service is running.
)

echo.
echo [7/7] Configuring Windows Firewall and ONLYOFFICE...
if exist .env (
    for /f "tokens=2 delims==" %%a in ('findstr "^PORT=" .env') do set APP_PORT=%%a
    if not "!APP_PORT!"=="" (
        echo Opening port !APP_PORT! in Windows Firewall...
        netsh advfirewall firewall add rule name="PaymentSystem" dir=in action=allow protocol=TCP localport=!APP_PORT! >nul 2>&1
    )
)

where docker >nul 2>&1
if %errorlevel% equ 0 (
    docker info >nul 2>&1
    if !errorlevel! equ 0 (
        echo [INFO] Docker is running. Ensuring ONLYOFFICE container is active on port 8088...
        docker ps -a --filter "name=onlyoffice-documentserver" --format "{{.Names}}" 2>nul | findstr /r "onlyoffice-documentserver" >nul 2>&1
        if !errorlevel! equ 0 (
            docker start onlyoffice-documentserver >nul 2>&1
        ) else (
            docker run -i -t -d -p 8088:80 --name onlyoffice-documentserver --restart=always -e JWT_ENABLED=false -e ALLOW_PRIVATE_IP_ADDRESS=true -e USE_UNAUTHORIZED_STORAGE=true onlyoffice/documentserver >nul 2>&1
        )
        netsh advfirewall firewall add rule name="ONLYOFFICE_8088" dir=in action=allow protocol=TCP localport=8088 >nul 2>&1
        echo [OK] ONLYOFFICE Document Server is active on port 8088.
    ) else (
        echo [NOTE] Docker Desktop is installed but not currently running. Skipping ONLYOFFICE container check.
    )
) else (
    echo [NOTE] Docker not detected. If you wish to use ONLYOFFICE offline, install Docker Desktop and choose option 5.
)

echo ========================================================
echo Update finished!
echo ========================================================
pause
goto MENU

:UNINSTALL
cls
echo ========================================================
echo                      UNINSTALL
echo ========================================================
call :BACKUP uninstall

echo.
echo Stopping Delkam Local PostgreSQL safely (pgdata kept intact)...
if exist "%cd%\scripts\setup-local-postgres.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%cd%\scripts\setup-local-postgres.ps1" -InstallDir "%cd%" -Mode stop >nul 2>&1
)

echo.
echo Removing Windows Service...
if exist uninstall-service.js (
    node uninstall-service.js
) else (
    echo [ERROR] uninstall-service.js not found.
)

echo.
echo Removing Firewall Rule...
netsh advfirewall firewall delete rule name="PaymentSystem" >nul 2>&1

echo ========================================================
echo Uninstallation finished!
echo ========================================================
pause
goto MENU

:LOGS
cls
echo ========================================================
echo                   SERVICE ERROR LOGS
echo ========================================================
if exist daemon\paymentsystem.err.log (
    powershell -command "Get-Content daemon\paymentsystem.err.log -Tail 50"
) else (
    echo No error logs found. The service might be running fine or hasn't started yet.
)
echo.
echo ========================================================
echo                  SERVICE OUTPUT LOGS
echo ========================================================
if exist daemon\paymentsystem.out.log (
    powershell -command "Get-Content daemon\paymentsystem.out.log -Tail 50"
) else (
    echo No output logs found.
)
echo ========================================================
pause
goto MENU

:BACKUP
echo.
echo Creating backup of critical files ^(database.json, .env, local SQL^)...
set "timestamp="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd_HHmmss'" 2^>nul`) do set "timestamp=%%I"
if "!timestamp!"=="" (
    for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value 2^>nul') do (
        set "datetime=%%I"
        set "timestamp=!datetime:~0,4!!datetime:~4,2!!datetime:~6,2!_!datetime:~8,2!!datetime:~10,2!!datetime:~12,2!"
    )
)
if "!timestamp!"=="" set "timestamp=manual_%RANDOM%"
set "backup_dir=backup_!timestamp!"
if not exist "!backup_dir!" mkdir "!backup_dir!" >nul 2>&1
if exist database.json copy /y database.json "!backup_dir!\" >nul 2>&1
if exist .env copy /y .env "!backup_dir!\" >nul 2>&1

if exist "%cd%\pgsql\bin\pg_dump.exe" if exist "%cd%\pgdata\PG_VERSION" (
    set "_BK_PORT="
    set "_BK_DB="
    set "_BK_USER="
    set "_BK_PASS="
    for /f "tokens=1,* delims==" %%A in ('findstr "^SQL_PORT=" .env 2^>nul') do set "_BK_PORT=%%B"
    for /f "tokens=1,* delims==" %%A in ('findstr "^SQL_DB_NAME=" .env 2^>nul') do set "_BK_DB=%%B"
    for /f "tokens=1,* delims==" %%A in ('findstr "^SQL_ADMIN_USER=" .env 2^>nul') do set "_BK_USER=%%B"
    for /f "tokens=1,* delims==" %%A in ('findstr "^SQL_ADMIN_PASSWORD=" .env 2^>nul') do set "_BK_PASS=%%B"
    if "!_BK_PORT!"=="" set "_BK_PORT=5439"
    if "!_BK_DB!"=="" set "_BK_DB=delkam_erp"
    if "!_BK_USER!"=="" set "_BK_USER=postgres"
    set "PGPASSWORD=!_BK_PASS!"
    "%cd%\pgsql\bin\pg_dump.exe" -h 127.0.0.1 -p !_BK_PORT! -U !_BK_USER! -d !_BK_DB! -Fc -Z 9 -f "!backup_dir!\!_BK_DB!_!timestamp!.dump" >nul 2>&1
    set "PGPASSWORD="
)

echo Backup saved in !backup_dir! folder.

if not "%~1"=="" (
    if exist "%cd%\send-pre-action-backup.js" (
        where node >nul 2>&1
        if !errorlevel! equ 0 (
            echo Sending local/Bale/Telegram backup safely...
            node send-pre-action-backup.js "%~1"
        )
    )
)
exit /b 0
