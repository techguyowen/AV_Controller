# 🪟 Sanctuary AV Controller — Windows 10/11 Setup Guide

A complete, step-by-step setup guide for installing, configuring, and deploying the **Sanctuary AV Controller** on a Windows 10 or Windows 11 church broadcast PC.

---

## 📋 Table of Contents
1. [Prerequisites](#1-prerequisites)
2. [Step 1: Install Node.js on Windows](#step-1-install-nodejs-on-windows)
3. [Step 2: Place the AV Controller Folder](#step-2-place-the-av-controller-folder)
4. [Step 3: 1-Click Launch (`start.bat`)](#step-3-1-click-launch-startbat)
5. [Step 4: Windows Firewall Setup (Allowing Phones & iPads)](#step-4-windows-firewall-setup)
6. [Step 5: Configuring Church Software on Windows](#step-5-configuring-church-software-on-windows)
   - [5A. Soundcraft USB ASIO Drivers](#5a-soundcraft-usb-asio-drivers)
   - [5B. REAPER DAW on Windows (OSC Port 9000)](#5b-reaper-daw-on-windows)
   - [5C. OBS Studio on Windows (WebSocket Port 4455)](#5c-obs-studio-on-windows)
   - [5D. Faithlife Proclaim on Windows (Port 52195)](#5d-faithlife-proclaim-on-windows)
7. [Step 6: Auto-Start on Windows Boot](#step-6-auto-start-on-windows-boot)
8. [Step 7: Stopping the Server (`stop.bat`)](#step-7-stopping-the-server)
9. [Troubleshooting Common Windows Issues](#9-troubleshooting-common-windows-issues)

---

## 1. Prerequisites

* **Operating System**: Windows 10 (64-bit) or Windows 11.
* **Administrator Rights**: Needed once to install Node.js and configure firewall rules.
* **Network**: Wired Ethernet connection to your church production network switch (e.g. `192.168.1.X`).

---

## ⚡ Option A: 1-Click Automated Installer (Recommended)

We provide an automated installer script (`install.bat` / `install.ps1`) that does everything for you in 60 seconds:

1. Copy or clone the `AV_Controller` folder to `C:\AV_Controller`.
2. **Right-click `install.bat` ➔ "Run as administrator"** (or double-click it and approve the UAC prompt).

### What `install.bat` does automatically:
* 📦 **Uses Windows Package Manager (`winget`)** to automatically install **Node.js LTS** and **Git** if missing.
* 🔄 **Refreshes environment variables** so `node` and `npm` are immediately recognized.
* 📥 **Runs `npm install`** to pull down all broadcast controller dependencies.
* 🛡️ **Configures Windows Defender Firewall rules** for port `3050` (Web & WebSocket) and UDP port `9000` (REAPER OSC Metering).
* 🖥️ **Creates a Desktop Shortcut** for 1-click launching.
* 🚀 **Configures Windows Auto-Start** (prompts to auto-launch on Sunday morning PC boots).
* ▶️ **Offers to launch** the system immediately upon completion!

---

## 🛠️ Option B: Manual Installation Step-by-Step

If you prefer to install manually or if your PC is on an offline restricted network, follow these steps:

### Step 1: Install Node.js on Windows

Node.js is the lightweight engine that runs the AV Controller server in the background.

1. Open your web browser and go to: **[https://nodejs.org](https://nodejs.org)**
2. Click the green button that says **"LTS (Recommended For Most Users)"** to download the Windows Installer (`.msi`).
3. Run the downloaded `.msi` file.
4. Click **Next**, accept the license agreement, and keep clicking **Next** with all default paths.
5. On the screen titled *"Tools for Native Modules"*, **leave the checkbox UNCHECKED** (you do not need Python or Chocolatey).
6. Click **Install**, and when Windows asks for permission, click **Yes**.
7. Once finished, click **Finish**.

#### Verify Node.js is Installed:
1. Press `Windows Key + R` on your keyboard.
2. Type `cmd` and hit `Enter` to open Command Prompt.
3. Type:
   ```cmd
   node -v
   ```
   *You should see a version number like `v20.x.x`.*

---

### Step 2: Place the AV Controller Folder

Do not leave the folder in your temporary Downloads or inside a OneDrive synced folder (OneDrive can lock files during live broadcasts).

**Recommended Permanent Location:**
* `C:\AV_Controller` or `C:\Users\%USERNAME%\Desktop\AV_Controller`

Copy or move the `AV_Controller` folder to `C:\AV_Controller`.

---

## Step 3: 1-Click Launch (`start.bat`)

We have created an automated 1-click Windows launcher:

1. Open `C:\AV_Controller`.
2. **Double-click `start.bat`**.

### What happens automatically:
* **First-Time Detection**: If packages haven't been installed yet, `start.bat` will automatically run `npm install` for you in about 60 seconds.
* **Server Boot**: It starts the server on port `3050`.
* **Browser Launch**: It automatically opens your default browser to **`http://localhost:3050`**.

> [!NOTE]
> If Windows Defender SmartScreen pops up saying *"Windows protected your PC"*, simply click **"More info"** and then **"Run anyway"**. This is normal for custom `.bat` scripts.

---

## Step 4: Windows Firewall Setup

To allow sound booth volunteers to open the dashboard, checklist, and camera joystick on their phones or iPads connected to the church Wi-Fi:

### 1. Set Church Network to "Private"
1. Open Windows **Settings** (`Win + I`).
2. Go to **Network & Internet** ➔ **Ethernet** (or **Wi-Fi**).
3. Ensure Network Profile Type is set to **Private network** (NOT Public).

### 2. Allow Node.js through Windows Firewall
The first time you run `start.bat`, a Windows Defender Firewall prompt may appear asking:
*"Windows Defender Firewall has blocked some features of Node.js: Server-side JavaScript"*:
- Check the box for **"Private networks, such as my home or work network"**.
- Click **"Allow access"**.

### 3. Optional: Open Port 3050 & 9000 manually (PowerShell)
If volunteers cannot connect from their phones, open PowerShell as Administrator and run:
```powershell
New-NetFirewallRule -DisplayName "Sanctuary AV Controller (Web & WS)" -Direction Inbound -Protocol TCP -LocalPort 3050 -Action Allow
New-NetFirewallRule -DisplayName "Sanctuary AV Controller (REAPER OSC)" -Direction Inbound -Protocol UDP -LocalPort 9000 -Action Allow
```

Now any device on the church Wi-Fi can navigate to:
`http://<CHURCH_PC_IP>:3050` (e.g. `http://192.168.1.100:3050`).

---

## Step 5: Configuring Church Software on Windows

### 5A. Soundcraft USB ASIO Drivers
1. Install the official **Soundcraft Si Multi-Digital / USB ASIO Driver** for Windows from [Soundcraft.com](https://www.soundcraft.com).
2. Connect the Soundcraft Si Impact to the Windows PC via USB.

### 5B. REAPER DAW on Windows
REAPER sends live stereo volume meters to the controller:
1. Open REAPER.
2. Press `Ctrl + P` to open **Preferences**.
3. Under **Audio** ➔ **Device**:
   - Audio system: **ASIO**
   - ASIO Driver: **Soundcraft USB Audio ASIO Driver**
4. Under **Control/OSC/web**:
   - Click **Add**.
   - Mode: **OSC (Open Sound Control)**
   - Device name: `Sanctuary AV Controller`
   - Mode: `Configure device IP+local port`
   - Device IP: `127.0.0.1`
   - Device port: `9000` *(Must match AV Controller)*
   - Local listen port: `8000`
   - Check **"Send feedback"**.
   - Click **OK**, then **Apply**.

### 5C. OBS Studio on Windows
1. Open OBS Studio.
2. Go to **Tools** ➔ **WebSocket Server Settings**.
3. Check **"Enable WebSocket server"**.
4. Set **Server Port** to `4455`.
5. If password is set, enter it in the AV Controller Settings modal.
6. Click **Apply** and **OK**.

### 5D. Faithlife Proclaim on Windows
1. On the presentation PC running Proclaim, go to **Settings** ➔ **Remote**.
2. Check **"Enable Proclaim Remote"**.
3. Enter a network password (e.g. `waypoint2026`).
4. In the AV Controller dashboard, click ⚙️ **Settings** ➔ **Tab 2: Hardware & Modules** ➔ Enter the Proclaim PC's IP and password.

---

## Step 6: Auto-Start on Windows Boot

To have the AV Controller automatically turn on whenever the church Windows PC boots:

### Method 1: Windows Startup Folder (Easiest)
1. Press `Windows Key + R` on your keyboard.
2. Type `shell:startup` and press `Enter`. *(This opens your user's Startup folder)*.
3. Right-click in the empty space ➔ **New** ➔ **Shortcut**.
4. Click **Browse** and select `C:\AV_Controller\start.bat`.
5. Click **Next**, name it `Sanctuary AV Controller`, and click **Finish**.
6. Done! Whenever the computer is turned on on Sunday morning, the controller launches automatically.

### Method 2: Running Headless via PM2 Windows Service (Advanced)
If you do NOT want a Command Prompt window open on screen:
1. Open Command Prompt as Administrator and run:
   ```cmd
   npm install -g pm2
   npm install -g pm2-windows-service
   pm2-service-install
   ```
2. Navigate to `C:\AV_Controller` and run:
   ```cmd
   pm2 start server.js --name "sanctuary-av"
   pm2 save
   ```

---

## Step 7: Stopping the Server (`stop.bat`)

If you need to restart or shut down the AV Controller:
1. Double-click `stop.bat` in `C:\AV_Controller`.
2. It automatically finds any process running on port `3050` and cleanly terminates it.

---

## 9. Troubleshooting Common Windows Issues

### ❓ Issue 1: `start.bat` says "Node.js is not installed or not in your PATH"
* **Solution**: You need to install Node.js from [nodejs.org](https://nodejs.org). If you just installed it, close all Command Prompt windows and run `start.bat` again so Windows refreshes its system PATH.

### ❓ Issue 2: "EADDRINUSE: address already in use :::3050"
* **Solution**: An old instance of the controller is still running in the background. Double-click **`stop.bat`** to kill it, then double-click **`start.bat`** again.

### ❓ Issue 3: Phone or iPad cannot connect to `http://192.168.1.100:3050`
* **Solution**:
  1. Verify the phone is on the **church staff/production Wi-Fi**, not a guest Wi-Fi network (guest Wi-Fi blocks LAN device-to-device communication).
  2. Follow [Step 4](#step-4-windows-firewall-setup) above to set your Windows network to **Private** and allow inbound TCP port `3050`.

### ❓ Issue 4: REAPER Audio meters are not bouncing
* **Solution**:
  1. Make sure REAPER is running.
  2. In REAPER Preferences ➔ Control/OSC/web, ensure Device port is set to `9000`.
  3. Ensure UDP port 9000 is not blocked by Windows Firewall.

---

*Sanctuary AV Controller — Built for rock-solid church broadcasting on Windows 10 & 11.*
