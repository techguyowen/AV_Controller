# ==============================================================================
# ⛪ Sanctuary AV Controller — Automated Windows Setup Script (PowerShell)
# Installs Node.js LTS, Git, NPM dependencies, Firewall rules, and Shortcuts
# ==============================================================================

[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"

function Write-Header {
    param([string]$text)
    Write-Host ""
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor White
    Write-Host "================================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Success {
    param([string]$text)
    Write-Host "  [OK] $text" -ForegroundColor Green
}

function Write-Warn {
    param([string]$text)
    Write-Host "  [!] $text" -ForegroundColor Yellow
}

function Write-Info {
    param([string]$text)
    Write-Host "  [*] $text" -ForegroundColor Cyan
}

function Write-Err {
    param([string]$text)
    Write-Host "  [ERROR] $text" -ForegroundColor Red
}

$scriptDir = Split-Path -Parent $PSCommandPath
if (-not $scriptDir) {
    $scriptDir = (Get-Location).Path
}
Set-Location $scriptDir

# 1. Elevate to Administrator if not already running as Admin
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warn "Administrative privileges required for Windows Firewall & Package Installation."
    Write-Info "Requesting elevation via UAC..."
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -NoExit -Command `"cd -LiteralPath '$scriptDir'; & '$PSCommandPath'`"" -Verb RunAs
    exit 0
}

Clear-Host
Write-Host "╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     ⛪ SANCTUARY AV CONTROLLER — AUTOMATED WINDOWS SETUP     ║" -ForegroundColor White
Write-Host "║     Waypoint Church Broadcast System Installer               ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "  Working Directory: $scriptDir" -ForegroundColor Gray
Write-Host ""

# Function to refresh PATH in the current PowerShell session
function Refresh-EnvPath {
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", [System.EnvironmentVariableTarget]::Machine)
    $userPath    = [System.Environment]::GetEnvironmentVariable("Path", [System.EnvironmentVariableTarget]::User)
    $env:Path    = "$machinePath;$userPath"
    
    # Also add standard Program Files paths if not present
    $standardNode = "C:\Program Files\nodejs"
    if ((Test-Path $standardNode) -and ($env:Path -notlike "*$standardNode*")) {
        $env:Path = "$standardNode;$env:Path"
    }
}

# 2. Check and Install Dependencies
Write-Header "STEP 1: Checking System Dependencies (Node.js & Git)"

$hasWinget = $null -ne (Get-Command winget -ErrorAction SilentlyContinue)
if ($hasWinget) {
    try {
        $wingetVer = (winget --version 2>&1)
        Write-Success "Windows Package Manager (winget $wingetVer) detected."
    } catch {
        $hasWinget = $false
    }
}

# Check Node.js
Refresh-EnvPath
$hasNode = $null -ne (Get-Command node -ErrorAction SilentlyContinue)
if ($hasNode) {
    $nodeVer = (node -v 2>&1)
    Write-Success "Node.js is already installed ($nodeVer)."
} else {
    Write-Info "Node.js not detected. Installing Node.js LTS..."
    if ($hasWinget) {
        Write-Info "Running: winget install -e --id OpenJS.NodeJS.LTS..."
        winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
        Refresh-EnvPath
        $hasNode = $null -ne (Get-Command node -ErrorAction SilentlyContinue)
    }

    # Fallback to direct MSI download
    if (-not $hasNode) {
        Write-Info "Downloading Node.js LTS MSI installer directly from nodejs.org..."
        $msiUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi"
        $msiPath = Join-Path $env:TEMP "nodejs-lts.msi"
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing
            Write-Info "Installing Node.js silently (this takes ~30 seconds)..."
            Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /qn /norestart" -Wait
            Refresh-EnvPath
            Remove-Item $msiPath -Force -ErrorAction SilentlyContinue
            $hasNode = $null -ne (Get-Command node -ErrorAction SilentlyContinue)
        } catch {
            Write-Err "Automated Node.js download failed: $_"
        }
    }

    if ($hasNode) {
        $nodeVer = (node -v 2>&1)
        Write-Success "Node.js successfully installed ($nodeVer)!"
    } else {
        Write-Err "Could not automatically install Node.js."
        Write-Warn "Please download and install Node.js LTS from https://nodejs.org, then re-run this installer."
        Write-Host ""
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Check Git
Refresh-EnvPath
$hasGit = $null -ne (Get-Command git -ErrorAction SilentlyContinue)
if ($hasGit) {
    $gitVer = (git --version 2>&1)
    Write-Success "Git is installed ($gitVer)."
} elseif ($hasWinget) {
    Write-Info "Installing Git for Windows via winget..."
    winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements --silent
    Refresh-EnvPath
    if ($null -ne (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Success "Git successfully installed!"
    } else {
        Write-Info "Git install skipped. Node.js is sufficient to run the app."
    }
} else {
    Write-Info "Git is not installed (optional). Node.js is sufficient to run the app."
}

# 3. Install NPM Packages
Write-Header "STEP 2: Installing Project Node Packages"
Refresh-EnvPath

if (Test-Path "$scriptDir\node_modules") {
    Write-Success "Dependencies folder (node_modules) already exists."
    Write-Info "Verifying / updating packages with npm install..."
} else {
    Write-Info "Running npm install (this takes about 45-60 seconds)..."
}

cmd.exe /c "cd /d `"$scriptDir`" && npm install --no-audit --no-fund"

if (Test-Path "$scriptDir\node_modules") {
    Write-Success "All NPM packages installed successfully!"
} else {
    Write-Err "npm install failed. Please check your internet connection."
}

# 4. Configure Windows Defender Firewall
Write-Header "STEP 3: Configuring Windows Firewall Rules"

try {
    netsh advfirewall firewall show rule name="Sanctuary AV Controller (Web 3050)" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        netsh advfirewall firewall add rule name="Sanctuary AV Controller (Web 3050)" dir=in action=allow protocol=TCP localport=3050 profile=any description="Allows sound booth iPads and mobile devices on church Wi-Fi to access Sanctuary AV Controller" | Out-Null
        Write-Success "Created Inbound TCP Rule for Port 3050 (Web Dashboard & WebSocket)."
    } else {
        Write-Success "Inbound Rule for Port 3050 already exists."
    }

    netsh advfirewall firewall show rule name="Sanctuary AV Controller (OSC 9000)" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        netsh advfirewall firewall add rule name="Sanctuary AV Controller (OSC 9000)" dir=in action=allow protocol=UDP localport=9000 profile=any description="Allows REAPER DAW to transmit OSC master stereo audio meter telemetry" | Out-Null
        Write-Success "Created Inbound UDP Rule for Port 9000 (REAPER OSC Metering)."
    } else {
        Write-Success "Inbound Rule for Port 9000 already exists."
    }
} catch {
    Write-Warn "Could not set firewall rules automatically: $_"
}

# 5. Create Desktop & Startup Shortcuts
Write-Header "STEP 4: Creating Shortcuts"

try {
    $wshShell = New-Object -ComObject WScript.Shell
    $desktopPath = [System.Environment]::GetFolderPath("Desktop")
    $shortcutPath = Join-Path $desktopPath "Sanctuary AV Controller.lnk"
    $targetPath = Join-Path $scriptDir "start.bat"

    $shortcut = $wshShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $targetPath
    $shortcut.WorkingDirectory = $scriptDir
    $shortcut.Description = "Launch Sanctuary AV Controller & Mobile Broadcast Suite"
    $shortcut.Save()

    Write-Success "Desktop shortcut created: 'Sanctuary AV Controller.lnk'"
} catch {
    Write-Warn "Could not create desktop shortcut: $_"
}

# Option for Startup folder
$startupDir = [System.Environment]::GetFolderPath("Startup")
$startupShortcutPath = Join-Path $startupDir "Sanctuary AV Controller.lnk"

Write-Host ""
$autoBootPrompt = Read-Host "  Would you like Sanctuary AV Controller to start automatically when this PC boots? (Y/N) [Default: Y]"
if ([string]::IsNullOrWhiteSpace($autoBootPrompt) -or $autoBootPrompt.Trim().ToUpper() -eq "Y") {
    try {
        $wshShell = New-Object -ComObject WScript.Shell
        $startupShortcut = $wshShell.CreateShortcut($startupShortcutPath)
        $startupShortcut.TargetPath = Join-Path $scriptDir "start.bat"
        $startupShortcut.WorkingDirectory = $scriptDir
        $startupShortcut.Description = "Auto-start Sanctuary AV Controller on Windows boot"
        $startupShortcut.Save()
        Write-Success "Auto-start enabled! Added to Windows Startup folder."
    } catch {
        Write-Warn "Could not configure startup folder: $_"
    }
} else {
    if (Test-Path $startupShortcutPath) {
        Remove-Item $startupShortcutPath -Force -ErrorAction SilentlyContinue
    }
    Write-Info "Skipped automatic boot startup."
}

# 6. Complete
Write-Header "INSTALLATION COMPLETE!"
Write-Host "  Sanctuary AV Controller is fully installed and ready for production." -ForegroundColor Green
Write-Host ""
Write-Host "  Useful Commands & URLs:" -ForegroundColor White
Write-Host "  - Start Dashboard: Double-click 'start.bat' or Desktop shortcut" -ForegroundColor Cyan
Write-Host "  - Master Web Hub:  http://localhost:3050" -ForegroundColor Cyan
Write-Host "  - In-App Guide:    http://localhost:3050/guide" -ForegroundColor Cyan
Write-Host "  - Stop Server:     Double-click 'stop.bat'" -ForegroundColor Cyan
Write-Host ""

$launchNow = Read-Host "  Would you like to launch the Sanctuary AV Controller now? (Y/N) [Default: Y]"
if ([string]::IsNullOrWhiteSpace($launchNow) -or $launchNow.Trim().ToUpper() -eq "Y") {
    Write-Info "Launching Sanctuary AV Controller..."
    Start-Process (Join-Path $scriptDir "start.bat")
}

Write-Host ""
Write-Host "Press any key to exit installer..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
