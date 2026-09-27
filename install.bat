@echo off
setlocal EnableDelayedExpansion
title Sanctuary AV Controller — Windows Installer
cd /d "%~dp0"

echo ================================================================
echo      SANCTUARY AV CONTROLLER — 1-CLICK WINDOWS INSTALLER
echo             Waypoint Church Broadcast System
echo ================================================================
echo.

:: 1. Check for Administrator Privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Administrator privileges are required to configure Windows Firewall
    echo     and install dependencies.
    echo.
    echo Requesting administrator elevation...
    echo.
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd.exe -ArgumentList '/k cd /d \"\"%~dp0\"\" && \"\"%~f0\"\"' -Verb RunAs"
    exit /b 0
)

echo [OK] Running with Administrator privileges.
echo [*] Installation directory: %CD%
echo.

:: 2. Check for Node.js
echo ================================================================
echo   STEP 1: Checking Node.js Environment
echo ================================================================
echo.

:: Check default PATH first
where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VERSION=%%v"
    echo [OK] Node.js is already installed (!NODE_VERSION!).
    goto check_git
)

:: Check common install locations if not in PATH
if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
    for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VERSION=%%v"
    echo [OK] Found Node.js in Program Files (!NODE_VERSION!). Added to session PATH.
    goto check_git
)

if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
    set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
    for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VERSION=%%v"
    echo [OK] Found Node.js in Program Files (x86) (!NODE_VERSION!). Added to session PATH.
    goto check_git
)

if exist "%LocalAppData%\Programs\node\node.exe" (
    set "PATH=%LocalAppData%\Programs\node;%PATH%"
    for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VERSION=%%v"
    echo [OK] Found Node.js in LocalAppData (!NODE_VERSION!). Added to session PATH.
    goto check_git
)

echo [*] Node.js not found. Installing Node.js LTS (v20)...
echo.

set "NODE_INSTALLED=0"

:: Try winget first if available
where winget >nul 2>&1
if %errorlevel% equ 0 (
    echo [*] Attempting automated install via Windows Package Manager (winget)...
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set "PATH=%ProgramFiles%\nodejs;%PATH%"
        set "NODE_INSTALLED=1"
    )
)

:: If winget was not available or failed, download official MSI directly
if "!NODE_INSTALLED!"=="0" (
    echo [*] Downloading official Node.js LTS installer from nodejs.org...
    set "MSI_PATH=%TEMP%\node-lts-x64.msi"

    where curl >nul 2>&1
    if %errorlevel% equ 0 (
        curl -fSL -o "!MSI_PATH!" "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
    ) else (
        powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi', '$env:TEMP\node-lts-x64.msi')"
    )

    if exist "!MSI_PATH!" (
        echo [*] Installing Node.js silently (this takes ~30 seconds)...
        msiexec /i "!MSI_PATH!" /qn /norestart
        del /f /q "!MSI_PATH!" >nul 2>&1
        if exist "%ProgramFiles%\nodejs\node.exe" (
            set "PATH=%ProgramFiles%\nodejs;%PATH%"
            set "NODE_INSTALLED=1"
        )
    )
)

:: Re-verify node
where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VERSION=%%v"
    echo [OK] Node.js successfully installed (!NODE_VERSION!)!
) else if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
    for /f "tokens=*" %%v in ('"%ProgramFiles%\nodejs\node.exe" -v 2^>nul') do set "NODE_VERSION=%%v"
    echo [OK] Node.js installed (!NODE_VERSION!)!
) else (
    echo [ERROR] Could not install Node.js automatically.
    echo Please download and install Node.js LTS manually from https://nodejs.org
    echo Once installed, run install.bat again.
    echo.
    pause
    exit /b 1
)

:: 3. Check for Git (optional)
:check_git
echo.
echo ================================================================
echo   STEP 2: Checking Git (Optional for Auto-Updates)
echo ================================================================
echo.

where git >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('git --version 2^>nul') do echo [OK] Git is installed (%%v).
    goto install_packages
)

if exist "%ProgramFiles%\Git\cmd\git.exe" (
    set "PATH=%ProgramFiles%\Git\cmd;%PATH%"
    echo [OK] Found Git in Program Files. Added to session PATH.
    goto install_packages
)

echo [*] Git is not installed (optional, used for Git-based auto-updates).
where winget >nul 2>&1
if %errorlevel% equ 0 (
    echo [*] Installing Git via Windows Package Manager (winget)...
    winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements --silent
    if exist "%ProgramFiles%\Git\cmd\git.exe" (
        set "PATH=%ProgramFiles%\Git\cmd;%PATH%"
        echo [OK] Git installed successfully!
    )
) else (
    echo [!] Skipping Git installation. (Node.js alone is sufficient to run Sanctuary AV Controller).
)

:: 4. Install NPM Packages
:install_packages
echo.
echo ================================================================
echo   STEP 3: Installing Application Dependencies (npm install)
echo ================================================================
echo.

cd /d "%~dp0"
echo [*] Working directory: %CD%
echo [*] Installing required npm packages (takes ~45-60 seconds)...
echo.

call npm install --no-audit --no-fund
if %errorlevel% neq 0 (
    echo.
    echo [!] First attempt had warnings. Retrying npm install...
    call npm install
)

if exist "%~dp0node_modules" (
    echo.
    echo [OK] All dependencies installed successfully in node_modules!
) else (
    echo.
    echo [ERROR] Failed to install dependencies.
    echo Please verify your internet connection and try running:
    echo     npm install
    echo.
    pause
    exit /b 1
)

:: 5. Configure Windows Defender Firewall
echo.
echo ================================================================
echo   STEP 4: Configuring Windows Defender Firewall Rules
echo ================================================================
echo.

netsh advfirewall firewall show rule name="Sanctuary AV Controller (Web 3050)" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Inbound rule for Port 3050 (Web & WebSocket) already exists.
) else (
    netsh advfirewall firewall add rule name="Sanctuary AV Controller (Web 3050)" dir=in action=allow protocol=TCP localport=3050 profile=any description="Allows sound booth iPads and mobile devices on church Wi-Fi to access Sanctuary AV Controller" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [OK] Created Inbound Firewall Rule for TCP Port 3050.
    ) else (
        echo [!] Could not create rule for Port 3050. Check Windows Firewall settings.
    )
)

netsh advfirewall firewall show rule name="Sanctuary AV Controller (OSC 9000)" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Inbound rule for Port 9000 (REAPER OSC) already exists.
) else (
    netsh advfirewall firewall add rule name="Sanctuary AV Controller (OSC 9000)" dir=in action=allow protocol=UDP localport=9000 profile=any description="Allows REAPER DAW to transmit OSC master stereo meter telemetry" >nul 2>&1
    if %errorlevel% equ 0 (
        echo [OK] Created Inbound Firewall Rule for UDP Port 9000.
    ) else (
        echo [!] Could not create rule for Port 9000. Check Windows Firewall settings.
    )
)

:: 6. Create Desktop & Startup Shortcuts
echo.
echo ================================================================
echo   STEP 5: Creating Desktop & Startup Shortcuts
echo ================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$wsh = New-Object -ComObject WScript.Shell; " ^
    "$desktop = [Environment]::GetFolderPath('Desktop'); " ^
    "$s = $wsh.CreateShortcut(\"$desktop\Sanctuary AV Controller.lnk\"); " ^
    "$s.TargetPath = '%~dp0start.bat'; " ^
    "$s.WorkingDirectory = '%~dp0'; " ^
    "$s.Description = 'Launch Sanctuary AV Controller & Mobile Broadcast Suite'; " ^
    "$s.Save()" >nul 2>&1

if exist "%USERPROFILE%\Desktop\Sanctuary AV Controller.lnk" (
    echo [OK] Desktop shortcut created: "Sanctuary AV Controller.lnk"
) else (
    echo [!] Desktop shortcut creation skipped.
)

echo.
set "AUTO_START=Y"
set /p AUTO_START="Do you want Sanctuary AV Controller to start automatically when Windows boots? (Y/N) [Default: Y]: "
if /i "!AUTO_START!"=="Y" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$wsh = New-Object -ComObject WScript.Shell; " ^
        "$startup = [Environment]::GetFolderPath('Startup'); " ^
        "$s = $wsh.CreateShortcut(\"$startup\Sanctuary AV Controller.lnk\"); " ^
        "$s.TargetPath = '%~dp0start.bat'; " ^
        "$s.WorkingDirectory = '%~dp0'; " ^
        "$s.Description = 'Auto-start Sanctuary AV Controller on Windows boot'; " ^
        "$s.Save()" >nul 2>&1
    echo [OK] Auto-start shortcut added to Windows Startup folder.
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$startup = [Environment]::GetFolderPath('Startup'); " ^
        "$target = \"$startup\Sanctuary AV Controller.lnk\"; " ^
        "if (Test-Path $target) { Remove-Item $target -Force }" >nul 2>&1
    echo [*] Skipped Windows auto-start.
)

:: 7. Complete & offer to launch
echo.
echo ================================================================
echo           INSTALLATION COMPLETED SUCCESSFULLY!
echo ================================================================
echo.
echo   Sanctuary AV Controller is fully installed and ready for production.
echo.
echo   - Master Dashboard:  http://localhost:3050
echo   - Volunteer Guide:   http://localhost:3050/guide
echo   - Start Controller:  Double-click "start.bat" or Desktop Shortcut
echo   - Stop Controller:   Double-click "stop.bat"
echo.

set "LAUNCH_NOW=Y"
set /p LAUNCH_NOW="Launch Sanctuary AV Controller now? (Y/N) [Default: Y]: "
if /i "!LAUNCH_NOW!"=="Y" (
    echo.
    echo [*] Launching Sanctuary AV Controller...
    start "" "%~dp0start.bat"
)

echo.
echo Press any key to exit installer...
pause >nul
exit /b 0
