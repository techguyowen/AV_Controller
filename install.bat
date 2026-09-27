@echo off
title Sanctuary AV Controller — Windows Installer
cd /d "%~dp0"

echo ================================================================
echo      SANCTUARY AV CONTROLLER — 1-CLICK WINDOWS INSTALLER
echo             Waypoint Church Broadcast System
echo ================================================================
echo.

:: 1. Verify we are not running inside an unextracted ZIP
if not exist "%~dp0package.json" goto missing_package

:: 2. Check for Administrator Privileges
net session >nul 2>&1
if %errorlevel% neq 0 goto need_admin

echo [OK] Running with Administrator privileges.
echo [*] Folder: %~dp0
echo.

:: 3. Check for Node.js
echo ================================================================
echo   STEP 1: Checking Node.js Environment
echo ================================================================
echo.

where node >nul 2>&1
if %errorlevel% equ 0 goto node_in_path

if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
    goto node_found
)
if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
    set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
    goto node_found
)
if exist "%LocalAppData%\Programs\node\node.exe" (
    set "PATH=%LocalAppData%\Programs\node;%PATH%"
    goto node_found
)

echo [*] Node.js is not installed. Installing Node.js LTS (v20)...
echo.

:: Try winget
where winget >nul 2>&1
if %errorlevel% equ 0 (
    echo [*] Attempting automated install via Windows Package Manager (winget)...
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set "PATH=%ProgramFiles%\nodejs;%PATH%"
        goto node_found
    )
)

:: Direct MSI download fallback
echo [*] Downloading official Node.js installer from nodejs.org...
set "MSI_PATH=%TEMP%\node-lts-x64.msi"

where curl >nul 2>&1
if %errorlevel% equ 0 (
    curl -fSL -o "%MSI_PATH%" "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi" 2>nul
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi', '%MSI_PATH%')" 2>nul
)

if not exist "%MSI_PATH%" goto node_error

echo [*] Installing Node.js (please wait ~30 seconds)...
start /wait msiexec /i "%MSI_PATH%" /qn /norestart
del /f /q "%MSI_PATH%" >nul 2>&1

if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
    goto node_found
)

where node >nul 2>&1
if %errorlevel% equ 0 goto node_in_path

goto node_error

:node_in_path
for /f "tokens=*" %%v in ('node -v 2^>nul') do echo [OK] Node.js is ready (%%v).
goto check_git

:node_found
echo [OK] Node.js located and loaded into session PATH.
for /f "tokens=*" %%v in ('node -v 2^>nul') do echo [OK] Node.js version: %%v
goto check_git

:: 4. Check for Git (optional)
:check_git
echo.
echo ================================================================
echo   STEP 2: Checking Git (Optional for Auto-Updates)
echo ================================================================
echo.

where git >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('git --version 2^>nul') do echo [OK] Git is ready (%%v).
    goto install_packages
)

if exist "%ProgramFiles%\Git\cmd\git.exe" (
    set "PATH=%ProgramFiles%\Git\cmd;%PATH%"
    echo [OK] Found Git in Program Files.
    goto install_packages
)

echo [*] Git not found. (Optional - used for automatic GitHub updates).
where winget >nul 2>&1
if %errorlevel% equ 0 (
    echo [*] Installing Git via winget...
    winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements --silent
    if exist "%ProgramFiles%\Git\cmd\git.exe" set "PATH=%ProgramFiles%\Git\cmd;%PATH%"
) else (
    echo [!] Skipping Git installation. (Node.js alone is sufficient).
)

:: 5. Install Dependencies
:install_packages
echo.
echo ================================================================
echo   STEP 3: Installing Dependencies (npm install)
echo ================================================================
echo.

cd /d "%~dp0"
echo [*] Installing broadcast packages (takes ~45 seconds)...
echo.

call npm install --no-audit --no-fund
if not exist "%~dp0node_modules" (
    echo.
    echo [!] First attempt had warnings. Retrying npm install...
    call npm install
)

if not exist "%~dp0node_modules" goto npm_error

echo.
echo [OK] All dependencies installed successfully in node_modules!

:: 6. Windows Firewall
echo.
echo ================================================================
echo   STEP 4: Configuring Windows Defender Firewall Rules
echo ================================================================
echo.

netsh advfirewall firewall show rule name="Sanctuary AV Controller (Web 3050)" >nul 2>&1
if %errorlevel% neq 0 (
    netsh advfirewall firewall add rule name="Sanctuary AV Controller (Web 3050)" dir=in action=allow protocol=TCP localport=3050 profile=any description="Allows sound booth iPads and mobile devices on church Wi-Fi to access Sanctuary AV Controller" >nul 2>&1
)
echo [OK] Inbound rule for Port 3050 (Web & WebSocket) configured.

netsh advfirewall firewall show rule name="Sanctuary AV Controller (OSC 9000)" >nul 2>&1
if %errorlevel% neq 0 (
    netsh advfirewall firewall add rule name="Sanctuary AV Controller (OSC 9000)" dir=in action=allow protocol=UDP localport=9000 profile=any description="Allows REAPER DAW to transmit OSC master stereo meter telemetry" >nul 2>&1
)
echo [OK] Inbound rule for Port 9000 (REAPER OSC) configured.

:: 7. Shortcuts
echo.
echo ================================================================
echo   STEP 5: Creating Desktop & Startup Shortcuts
echo ================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$w=New-Object -ComObject WScript.Shell; $d=[Environment]::GetFolderPath('Desktop'); $s=$w.CreateShortcut(\"$d\Sanctuary AV Controller.lnk\"); $s.TargetPath='%~dp0start.bat'; $s.WorkingDirectory='%~dp0'; $s.Description='Launch Sanctuary AV Controller'; $s.Save()" >nul 2>&1
if exist "%USERPROFILE%\Desktop\Sanctuary AV Controller.lnk" (
    echo [OK] Desktop shortcut created: "Sanctuary AV Controller.lnk"
) else (
    echo [!] Desktop shortcut creation skipped.
)

echo.
set "AUTO_START=Y"
set /p AUTO_START="Do you want Sanctuary AV Controller to start automatically when Windows boots? (Y/N) [Default: Y]: "
if /i "%AUTO_START%"=="Y" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$w=New-Object -ComObject WScript.Shell; $st=[Environment]::GetFolderPath('Startup'); $s=$w.CreateShortcut(\"$st\Sanctuary AV Controller.lnk\"); $s.TargetPath='%~dp0start.bat'; $s.WorkingDirectory='%~dp0'; $s.Description='Auto-start Sanctuary AV Controller'; $s.Save()" >nul 2>&1
    echo [OK] Auto-start shortcut added to Windows Startup folder.
) else (
    echo [*] Skipped Windows auto-start.
)

:: 8. Complete
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
if /i "%LAUNCH_NOW%"=="Y" (
    echo.
    echo [*] Launching Sanctuary AV Controller...
    start "" "%~dp0start.bat"
)

echo.
echo Press any key to exit installer...
pause >nul
exit /b 0

:: ================================================================
:: Error Handlers
:: ================================================================

:missing_package
echo ================================================================
echo [ERROR] package.json was not found in this folder!
echo ================================================================
echo.
echo Did you open install.bat directly inside a ZIP file?
echo.
echo Please EXTRACT the zip file first:
echo   1. Right-click the downloaded ZIP file.
echo   2. Select "Extract All...".
echo   3. Open the extracted folder and right-click install.bat.
echo.
pause
exit /b 1

:need_admin
echo ================================================================
echo   ADMINISTRATOR PRIVILEGES REQUIRED
echo ================================================================
echo.
echo   To install Node.js and configure Windows Firewall:
echo.
echo   1. Right-click "install.bat"
echo   2. Click "Run as administrator"
echo.
echo ================================================================
echo.
pause
exit /b 1

:node_error
echo ================================================================
echo [ERROR] Node.js could not be installed automatically.
echo ================================================================
echo.
echo Please install Node.js manually:
echo   1. Open: https://nodejs.org
echo   2. Download and run the LTS Windows Installer (.msi)
echo   3. After installation completes, run install.bat again.
echo.
pause
exit /b 1

:npm_error
echo ================================================================
echo [ERROR] Failed to install application dependencies.
echo ================================================================
echo.
echo Please check your internet connection and try running:
echo   npm install
echo.
pause
exit /b 1
