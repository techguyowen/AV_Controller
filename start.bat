@echo off
title Sanctuary AV Controller - Launcher
cd /d "%~dp0"

echo ================================================================
echo          SANCTUARY AV CONTROLLER - 1-CLICK LAUNCHER
echo ================================================================
echo.

:: Check that we are not inside a ZIP
if not exist "%~dp0package.json" goto :missing_package

:: Find node.js
where node >nul 2>&1
if %errorlevel% equ 0 goto :node_ok

if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
    goto :node_ok
)
if exist "%LOCALAPPDATA%\Programs\node\node.exe" (
    set "PATH=%LOCALAPPDATA%\Programs\node;%PATH%"
    goto :node_ok
)
goto :missing_node

:node_ok
:: Find git (optional)
where git >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%ProgramFiles%\Git\cmd\git.exe" set "PATH=%ProgramFiles%\Git\cmd;%PATH%"
)

:: Check for updates
if not exist "%~dp0.git" goto :check_modules
where git >nul 2>&1
if %errorlevel% neq 0 goto :check_modules

echo [*] Checking GitHub for updates...
git fetch origin main >nul 2>&1
for /f %%i in ('git rev-list HEAD..origin/main --count 2^>nul') do set "BEHIND=%%i"
if "%BEHIND%"=="" goto :check_modules
if "%BEHIND%"=="0" (
    echo [OK] Already up to date.
    goto :check_modules
)

echo.
echo ================================================================
echo  UPDATE AVAILABLE: %BEHIND% new update(s) on GitHub!
echo ================================================================
echo  Press U then Enter to update, or just press Enter to skip.
set "CHOICE="
set /p CHOICE=Your choice: 
if /i not "%CHOICE%"=="U" goto :check_modules

echo.
echo [*] Downloading updates from GitHub...
git pull origin main
echo [*] Updating packages...
call npm install --no-audit --no-fund
echo [OK] Update complete!
echo.

:check_modules
if exist "%~dp0node_modules" goto :launch_app

echo ================================================================
echo  FIRST-TIME SETUP: Installing packages (45-60 seconds)...
echo ================================================================
echo.
call npm install --no-audit --no-fund

if not exist "%~dp0node_modules" (
    echo.
    echo [ERROR] Failed to install packages. Check your internet connection.
    pause
    exit /b 1
)
echo.
echo [OK] Packages installed successfully!
echo.

:launch_app
echo [*] Starting Sanctuary AV Controller on port 3050...
echo [*] Opening browser to http://localhost:3050
echo.
echo To stop the server, close this window or press Ctrl+C
echo.

start "" "http://localhost:3050"
node server.js

echo.
echo Server stopped.
pause
exit /b 0

:missing_package
echo.
echo [ERROR] package.json not found!
echo Please extract the ZIP file before running this script.
echo.
pause
exit /b 1

:missing_node
echo.
echo [ERROR] Node.js is not installed!
echo Please run install.bat first, or download Node.js from https://nodejs.org
echo.
pause
exit /b 1
