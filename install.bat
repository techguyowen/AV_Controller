@echo off
title Sanctuary AV Controller — Windows Installer
cd /d "%~dp0"

echo ================================================================
echo      SANCTUARY AV CONTROLLER — 1-CLICK WINDOWS INSTALLER
echo ================================================================
echo.
echo Launching automated setup via PowerShell...
echo If prompted by Windows UAC, please click YES to grant Administrator privileges.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"

if %errorlevel% neq 0 (
    echo.
    echo [NOTE] If PowerShell was blocked, please right-click this file
    echo and select "Run as administrator".
    echo.
    pause
)
