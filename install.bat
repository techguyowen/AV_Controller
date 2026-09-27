@echo off
title Sanctuary AV Controller - Windows Installer
cd /d "%~dp0"

echo ================================================================
echo      SANCTUARY AV CONTROLLER - 1-CLICK WINDOWS INSTALLER
echo             Waypoint Church Broadcast System
echo ================================================================
echo.

:: Check that we are running from an extracted folder (not inside a ZIP)
if not exist "%~dp0package.json" goto :missing_package

:: Check for Administrator privileges using fsutil (more reliable than net session)
fsutil dirty query %systemdrive% >nul 2>&1
if %errorlevel% neq 0 goto :need_admin

echo [OK] Running with Administrator privileges.
echo [*]  Folder: %~dp0
echo.

:: ================================================================
::   STEP 1: Check for Node.js
:: ================================================================
echo ================================================================
echo   STEP 1: Checking for Node.js
echo ================================================================
echo.

where node >nul 2>&1
if %errorlevel% equ 0 goto :node_ready

:: Check common install locations
if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
    goto :node_ready
)
if exist "%LOCALAPPDATA%\Programs\node\node.exe" (
    set "PATH=%LOCALAPPDATA%\Programs\node;%PATH%"
    goto :node_ready
)

:: Node.js not found - try winget
echo [*] Node.js not found. Attempting automated install via winget...
where winget >nul 2>&1
if %errorlevel% equ 0 (
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
    if exist "%ProgramFiles%\nodejs\node.exe" (
        set "PATH=%ProgramFiles%\nodejs;%PATH%"
        goto :node_ready
    )
)

:: Fallback: download MSI directly
echo [*] Downloading Node.js LTS installer from nodejs.org...
set "MSI=%TEMP%\node-lts.msi"
where curl >nul 2>&1
if %errorlevel% equ 0 (
    curl -fSL -o "%MSI%" "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
) else (
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; (New-Object Net.WebClient).DownloadFile('https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi','%MSI%')"
)

if not exist "%MSI%" goto :node_error

echo [*] Installing Node.js (please wait 30 seconds)...
start /wait msiexec /i "%MSI%" /qn /norestart
del /f /q "%MSI%" >nul 2>&1

if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
    goto :node_ready
)

where node >nul 2>&1
if %errorlevel% equ 0 goto :node_ready

goto :node_error

:node_ready
for /f "tokens=*" %%v in ('node -v 2^>nul') do echo [OK] Node.js ready: %%v

:: ================================================================
::   STEP 2: Check for Git (optional)
:: ================================================================
echo.
echo ================================================================
echo   STEP 2: Checking for Git (optional)
echo ================================================================
echo.

where git >nul 2>&1
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('git --version 2^>nul') do echo [OK] Git ready: %%v
    goto :install_packages
)

if exist "%ProgramFiles%\Git\cmd\git.exe" (
    set "PATH=%ProgramFiles%\Git\cmd;%PATH%"
    echo [OK] Found Git in Program Files.
    goto :install_packages
)

echo [*] Git not found - attempting install via winget...
where winget >nul 2>&1
if %errorlevel% equ 0 (
    winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements --silent
    if exist "%ProgramFiles%\Git\cmd\git.exe" (
        set "PATH=%ProgramFiles%\Git\cmd;%PATH%"
        echo [OK] Git installed successfully.
    )
) else (
    echo [!] Git skipped (optional - Node.js alone is enough to run the app).
)

:: ================================================================
::   STEP 3: Install npm packages
:: ================================================================
:install_packages
echo.
echo ================================================================
echo   STEP 3: Installing application packages (npm install)
echo ================================================================
echo.
cd /d "%~dp0"
echo [*] Installing packages (takes about 45-60 seconds)...
echo.
call npm install --no-audit --no-fund

if not exist "%~dp0node_modules" (
    echo.
    echo [!] Retrying npm install...
    call npm install
)

if not exist "%~dp0node_modules" goto :npm_error
echo.
echo [OK] All packages installed in node_modules!

:: ================================================================
::   STEP 4: Windows Firewall
:: ================================================================
echo.
echo ================================================================
echo   STEP 4: Configuring Windows Defender Firewall
echo ================================================================
echo.

netsh advfirewall firewall show rule name="AV Controller Port 3050" >nul 2>&1
if %errorlevel% neq 0 (
    netsh advfirewall firewall add rule name="AV Controller Port 3050" dir=in action=allow protocol=TCP localport=3050 profile=any >nul 2>&1
)
echo [OK] Firewall rule for TCP port 3050 (Web Dashboard) configured.

netsh advfirewall firewall show rule name="AV Controller Port 9000" >nul 2>&1
if %errorlevel% neq 0 (
    netsh advfirewall firewall add rule name="AV Controller Port 9000" dir=in action=allow protocol=UDP localport=9000 profile=any >nul 2>&1
)
echo [OK] Firewall rule for UDP port 9000 (REAPER OSC) configured.

:: ================================================================
::   STEP 5: Desktop Shortcut
:: ================================================================
echo.
echo ================================================================
echo   STEP 5: Creating Desktop Shortcut
echo ================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Sanctuary AV Controller.lnk'); $s.TargetPath='%~dp0start.bat'; $s.WorkingDirectory='%~dp0'; $s.Save()" >nul 2>&1
echo [OK] Desktop shortcut created.

set "AUTOSTART=Y"
set /p AUTOSTART=Start automatically when Windows boots? (Y/N, default Y): 
if /i not "%AUTOSTART%"=="N" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut([Environment]::GetFolderPath('Startup')+'\Sanctuary AV Controller.lnk'); $s.TargetPath='%~dp0start.bat'; $s.WorkingDirectory='%~dp0'; $s.Save()" >nul 2>&1
    echo [OK] Added to Windows Startup.
) else (
    echo [*] Skipped auto-start.
)

:: ================================================================
::   DONE
:: ================================================================
echo.
echo ================================================================
echo         INSTALLATION COMPLETE!
echo ================================================================
echo.
echo   Dashboard URL  : http://localhost:3050
echo   Guide URL      : http://localhost:3050/guide
echo   Start          : Double-click start.bat or Desktop Shortcut
echo   Stop           : Double-click stop.bat
echo.

set "LAUNCH=Y"
set /p LAUNCH=Launch Sanctuary AV Controller now? (Y/N, default Y): 
if /i not "%LAUNCH%"=="N" (
    echo.
    echo [*] Launching...
    start "" "%~dp0start.bat"
)

echo.
echo Press any key to close this window...
pause >nul
exit /b 0


:: ================================================================
:: Error handlers - all with pause to keep window open
:: ================================================================

:missing_package
echo.
echo ================================================================
echo  ERROR: package.json not found in this folder!
echo ================================================================
echo.
echo  Did you open install.bat directly inside a ZIP file?
echo.
echo  Please EXTRACT the ZIP first:
echo    1. Right-click the downloaded AV_Controller.zip
echo    2. Select "Extract All..."
echo    3. Open the extracted AV_Controller folder
echo    4. Right-click install.bat and choose Run as administrator
echo.
pause
exit /b 1

:need_admin
echo.
echo ================================================================
echo  ERROR: Administrator privileges required!
echo ================================================================
echo.
echo  Please right-click install.bat and choose:
echo       "Run as administrator"
echo.
pause
exit /b 1

:node_error
echo.
echo ================================================================
echo  ERROR: Could not install Node.js automatically.
echo ================================================================
echo.
echo  Please install Node.js manually:
echo    1. Open https://nodejs.org in your browser
echo    2. Download the LTS Windows installer (.msi)
echo    3. Run the installer and follow the prompts
echo    4. Run install.bat again after installation
echo.
pause
exit /b 1

:npm_error
echo.
echo ================================================================
echo  ERROR: Failed to install application packages.
echo ================================================================
echo.
echo  Please check your internet connection, then try:
echo    1. Open a Command Prompt in the AV_Controller folder
echo    2. Run: npm install
echo.
pause
exit /b 1
