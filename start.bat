@echo off
title Sanctuary AV Controller — 1-Click Windows Launcher
cd /d "%~dp0"

echo ================================================================
echo           SANCTUARY AV CONTROLLER — 1-CLICK LAUNCHER
echo ================================================================
echo.

:: 1. Verify we are not inside an unextracted ZIP
if not exist "%~dp0package.json" goto missing_package

:: 2. Check for Node.js in PATH or common directories
where node >nul 2>&1
if %errorlevel% equ 0 goto node_ready

if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
    goto node_ready
)
if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
    set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
    goto node_ready
)
if exist "%LocalAppData%\Programs\node\node.exe" (
    set "PATH=%LocalAppData%\Programs\node;%PATH%"
    goto node_ready
)

goto missing_node

:node_ready
:: 3. Check for Git in common directories if not in PATH
where git >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%ProgramFiles%\Git\cmd\git.exe" set "PATH=%ProgramFiles%\Git\cmd;%PATH%"
)

:: 4. Check for updates via Git if repository exists
if not exist "%~dp0.git" goto check_modules
where git >nul 2>&1
if %errorlevel% neq 0 goto check_modules

echo [UPDATE CHECK] Checking GitHub for updates...
git fetch origin main >nul 2>&1
for /f %%i in ('git rev-list HEAD..origin/main --count 2^>nul') do set "BEHIND=%%i"
if "%BEHIND%"=="" goto check_modules
if "%BEHIND%"=="0" goto check_modules

echo.
echo ================================================================
echo [UPDATE AVAILABLE] %BEHIND% new update(s) found on GitHub!
echo ================================================================
echo Press U to update now, or press Enter to launch current version.
set "USER_CHOICE="
set /p USER_CHOICE="Your choice (U/Enter): "
if /i not "%USER_CHOICE%"=="U" goto check_modules

echo.
echo [UPDATING] Pulling latest changes from GitHub...
git pull origin main
echo [UPDATING] Updating dependencies...
call npm install --no-audit --no-fund
echo [UPDATING] Update complete!
echo.

:check_modules
:: 5. First-time run: install node_modules if missing
if exist "%~dp0node_modules" goto launch_app

echo ================================================================
echo [FIRST-TIME SETUP] Dependencies not found. Installing packages...
echo This only happens once and takes about 45-60 seconds.
echo ================================================================
echo.
call npm install --no-audit --no-fund
if not exist "%~dp0node_modules" goto npm_error

echo.
echo [FIRST-TIME SETUP] Dependencies installed successfully!
echo.

:launch_app
echo Starting Sanctuary AV Controller daemon on port 3050...
echo.

start "" "http://localhost:3050"
node server.js

pause
exit /b 0

:missing_package
echo ================================================================
echo [ERROR] package.json was not found in this folder!
echo ================================================================
echo.
echo If you downloaded a ZIP file, please EXTRACT it first:
echo   1. Right-click the downloaded AV_Controller.zip
echo   2. Click "Extract All..."
echo   3. Open the extracted folder and run start.bat
echo.
pause
exit /b 1

:missing_node
echo ================================================================
echo [ERROR] Node.js is not installed or not in your PATH.
echo ================================================================
echo.
echo Please run "install.bat" to install Node.js automatically,
echo or download Node.js LTS from https://nodejs.org
echo.
pause
exit /b 1

:npm_error
echo.
echo [ERROR] Failed to install application dependencies.
echo Please check your internet connection and try running:
echo   npm install
echo.
pause
exit /b 1
