@echo off
title Sanctuary AV Controller — Stop Script
echo Stopping Sanctuary AV Controller...

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3050') do (
    taskkill /F /PID %%a >nul 2>nul
)

echo Sanctuary AV Controller stopped.
timeout /t 2 >nul
