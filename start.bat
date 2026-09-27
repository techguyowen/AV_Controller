@echo off
setlocal EnableDelayedExpansion
title Sanctuary AV Controller — 1-Click Windows Launcher
cd /d "%~dp0"

echo ================================================================
echo           SANCTUARY AV CONTROLLER — 1-CLICK LAUNCHER
echo ================================================================
echo.

:: 1. Check for Node.js in PATH or common directories
where node >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set "PATH=%ProgramFiles%\nodejs;%PATH%"
    ) else if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
        set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
    ) else if exist "%LocalAppData%\Programs\node\node.exe" (
        set "PATH=%LocalAppData%\Programs\node;%PATH%"
    ) else (
        echo [ERROR] Node.js is not installed or not in your PATH.
        echo Please run install.bat or download Node.js LTS from https://nodejs.org
        echo.
        pause
        exit /b 1
    )
)

:: 2. Check for Git in common directories if not in PATH
where git >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%ProgramFiles%\Git\cmd\git.exe" (
        set "PATH=%ProgramFiles%\Git\cmd;%PATH%"
    )
)

:: 3. Check for updates via Git if available
where git >nul 2>&1
if %errorlevel% equ 0 (
    if exist "%~dp0.git" (
        echo [UPDATE CHECK] Checking GitHub for updates...
        git fetch origin main >nul 2>&1
        for /f %%i in ('git rev-list HEAD..origin/main --count 2^>nul') do set BEHIND=%%i
        if defined BEHIND (
            if not "!BEHIND!"=="0" (
                echo.
                echo ================================================================
                echo [UPDATE AVAILABLE] !BEHIND! new update(s) found on GitHub!
                echo ================================================================
                echo Press U to update now, or press Enter to launch current version.
                set "USER_CHOICE="
                set /p USER_CHOICE="Your choice (U/Enter): "
                if /i "!USER_CHOICE!"=="U" (
                    echo.
                    echo [UPDATING] Pulling latest changes from GitHub...
                    git pull origin main
                    echo [UPDATING] Installing dependencies...
                    call npm install --no-audit --no-fund
                    echo [UPDATING] Update complete!
                    echo.
                )
            )
        )
    )
)

:: 4. Check if first-time run (node_modules missing)
if not exist "%~dp0node_modules" (
    echo ================================================================
    echo [FIRST-TIME SETUP] Dependencies not found. Installing packages...
    echo This only happens once and takes about 45-60 seconds.
    echo ================================================================
    echo.
    call npm install --no-audit --no-fund
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Failed to install dependencies. Check your internet connection.
        pause
        exit /b 1
    )
    echo.
    echo [FIRST-TIME SETUP] Dependencies installed successfully!
    echo.
)

echo Starting Sanctuary AV Controller daemon on port 3050...
echo.

start "" "http://localhost:3050"
node server.js

pause
