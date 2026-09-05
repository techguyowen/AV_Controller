@echo off
title Sanctuary AV Controller — 1-Click Windows Launcher
cd /d "%~dp0"

echo ================================================================
echo           SANCTUARY AV CONTROLLER — 1-CLICK LAUNCHER
echo ================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in your PATH.
    echo Please download and install Node.js LTS from https://nodejs.org
    echo.
    pause
    exit /b 1
)

REM Check if first-time run (node_modules missing)
if not exist "%~dp0node_modules" (
    echo ================================================================
    echo [FIRST-TIME SETUP] Dependencies not found. Installing packages...
    echo This only happens once and takes about 1 minute.
    echo ================================================================
    echo.
    call npm install
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
