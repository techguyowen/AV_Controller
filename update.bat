@echo off
title Sanctuary AV Controller — 1-Click Updater
cd /d "%~dp0"

echo ================================================================
echo           SANCTUARY AV CONTROLLER — 1-CLICK UPDATER
echo ================================================================
echo.
echo Preserving your config.json and .env settings...
echo.

where git >nul 2>nul
if %errorlevel% equ 0 (
    if exist "%~dp0.git" (
        echo [GIT] Pulling latest updates from GitHub...
        git pull origin main
        goto install_deps
    )
)

echo [ZIP] Downloading and updating via Node.js updater...
node -e "const AutoUpdater = require('./modules/updater'); const u = new AutoUpdater(); u.performUpdate().then(() => console.log('Update complete!')).catch(e => { console.error('Update error:', e.message); process.exit(1); });"
if %errorlevel% neq 0 (
    echo [ERROR] Update failed.
    pause
    exit /b 1
)
goto finish

:install_deps
echo [NPM] Updating dependencies...
call npm install --no-audit --no-fund

:finish
echo.
echo ================================================================
echo [SUCCESS] Sanctuary AV Controller has been updated!
echo Launching server...
echo ================================================================
echo.
call "%~dp0start.bat"
