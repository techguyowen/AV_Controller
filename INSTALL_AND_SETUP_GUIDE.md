# 🛠️ Sanctuary AV Controller — Computer Installation & First-Time Setup Guide

A complete, beginner-friendly, step-by-step guide to installing, configuring, and deploying the **Sanctuary AV Controller** on your church broadcast computer (macOS or Windows 10/11).

---

## 📋 Table of Contents
1. [System Requirements](#1-system-requirements)
2. [Step 1: Install Node.js](#step-1-install-nodejs)
3. [Step 2: Place Folder & Install Dependencies](#step-2-place-folder--install-dependencies)
4. [Step 3: Church Network & IP Plan](#step-3-church-network--ip-plan)
5. [Step 4: Configure Hardware & Software Subsystems](#step-4-configure-hardware--software-subsystems)
   - [4A. REAPER DAW (OSC Audio Meters)](#4a-reaper-daw-osc-audio-meters)
   - [4B. Blackmagic ATEM Mini Switcher](#4b-blackmagic-atem-mini-switcher)
   - [4C. PTZOptics Cameras (VISCA over IP)](#4c-ptzoptics-cameras-visca-over-ip)
   - [4D. OBS Studio (WebSocket v5)](#4d-obs-studio-websocket-v5)
   - [4E. Faithlife Proclaim](#4e-faithlife-proclaim)
   - [4F. VoxStream Live Captioner](#4f-voxstream-live-captioner)
   - [4G. YouTube API & Stream Health](#4g-youtube-api--stream-health)
   - [4H. GroupMe Alerting Bots](#4h-groupme-alerting-bots)
6. [Step 5: First Launch & Configuration](#step-5-first-launch--configuration)
7. [Step 6: Auto-Start on Computer Boot (macOS & Windows)](#step-6-auto-start-on-computer-boot)
8. [Step 7: Verification & Testing Checklist](#step-7-verification--testing-checklist)

---

## 1. System Requirements

* **Operating System**: macOS 12 Monterey or newer (Apple Silicon M1/M2/M3/M4 or Intel) OR Windows 10/11 (64-bit).
* **Node.js**: v18.0.0 LTS or newer (v20+ LTS recommended).
* **Network**: Ethernet cable connected to the church production router/switch (do not use guest Wi-Fi; devices need local LAN access).
* **Ports Used Locally**:
  - `3050`: Sanctuary AV Controller Web Server & WebSocket (Dashboard).
  - `9000`: REAPER OSC incoming metering port.
  - `4455`: OBS Studio WebSocket v5 port.
  - `8765`: VoxStream Live Captioning port.
  - `1259`: PTZOptics VISCA over IP UDP port.
  - `52195`: Faithlife Proclaim remote port.
  - `8085`: Waypoint Sound Booth Operations & Troubleshooting Guide.

---

## Step 1: Install Node.js

Node.js is the runtime environment that runs the AV Controller server.

### For macOS:
1. Go to [https://nodejs.org](https://nodejs.org).
2. Download the **LTS (Long Term Support)** installer (e.g., `Node v20.x LTS`).
3. Open the downloaded `.pkg` file and follow the on-screen installer prompts.
4. Open **Terminal** (press `Cmd + Space`, type `Terminal`, and hit `Enter`).
5. Verify the installation by running:
   ```bash
   node -v
   npm -v
   ```
   *You should see version numbers like `v20.x.x` and `10.x.x`.*

### For Windows:
1. Go to [https://nodejs.org](https://nodejs.org).
2. Download the **Windows Installer (.msi) 64-bit LTS**.
3. Run the installer, accept the default settings, and ensure the checkbox **"Automatically install the necessary tools"** is left unchecked (not needed).
4. Open **Command Prompt** (press `Windows Key + R`, type `cmd`, and hit `Enter`).
5. Verify the installation:
   ```cmd
   node -v
   npm -v
   ```

---

## Step 2: Place Folder & Install Dependencies

### 1. Choose a Permanent Location
Place the `AV_Controller` folder in a permanent location on the computer so it doesn't get moved or deleted by volunteers:
* **Windows Recommended**: `C:\AV_Controller`
* **macOS Recommended**: `~/AV_Controller` or `~/Applications/AV_Controller`

### 2. Install Dependencies via NPM
Open Command Prompt (Windows) or Terminal (Mac):
```bash
# Navigate to the folder where you placed AV_Controller
cd path/to/AV_Controller

# Install all required npm packages
npm install
```
*(This installs `ws`, `express`, `obs-websocket-js`, `atem-connection`, `node-osc`, `google-auth-library`, `googleapis`, and other packages listed in `package.json`).*

---

## Step 3: Church Network & IP Plan

For stable operation, give all broadcast equipment static IP addresses or DHCP reservations on your church router:

| Device | Default / Suggested IP | Protocol | Notes |
| :--- | :--- | :--- | :--- |
| **Broadcast Mac/PC** | `192.168.1.100` | Host (Localhost) | Computer running this AV Controller (`:3050`) |
| **ATEM Mini Pro** | `192.168.1.240` | Blackmagic Protocol | Connect via Ethernet to network switch |
| **PTZ Camera 1 (Pulpit)** | `192.168.1.101` | VISCA over IP (UDP 1259) | Camera behind pulpit / center stage |
| **PTZ Camera 2 (Wide)** | `192.168.1.102` | VISCA over IP (UDP 1259) | Wide balcony or back-of-room camera |
| **Proclaim PC** | `192.168.1.105` | REST HTTP (:52195) | Dedicated PC running lyrics / slides |
| **Soundcraft Si Impact** | USB Direct | USB Audio Stream | Plugged directly into Broadcast PC via USB |

> [!TIP]
> Make sure your Broadcast PC's subnet mask matches the rest of the equipment (typically `255.255.255.0` with gateway `192.168.1.1`).

---

## Step 4: Configure Hardware & Software Subsystems

### 4A. REAPER DAW (OSC Audio Meters)
REAPER sends live stereo broadcast volume levels to the AV Controller over OSC (Open Sound Control).

1. Open **REAPER**.
2. Go to **Options** ➔ **Preferences** (or `Cmd + ,` on Mac / `Ctrl + P` on Windows).
3. In the left sidebar, scroll to the bottom and click **Control/OSC/web**.
4. Click **Add**.
5. Set:
   - **Control surface mode**: `OSC (Open Sound Control)`
   - **Device name**: `Sanctuary AV Controller`
   - **Pattern config**: `Default`
   - **Mode**: `Configure device IP+local port`
   - **Device IP**: `127.0.0.1`
   - **Device port**: `9000` *(Must match AV Controller incoming port)*
   - **Local listen port**: `8000`
6. Check the box for **"Send feedback"**.
7. Click **OK**, then **Apply**.

---

### 4B. Blackmagic ATEM Mini Switcher
1. Connect the ATEM Mini Pro to your church Ethernet network switch.
2. Launch **Blackmagic ATEM Setup** software on your computer.
3. Click the settings icon next to your ATEM Mini Pro.
4. In the **Network** tab, choose **Static IP** and assign:
   - IP: `192.168.1.240` (or your chosen static IP)
   - Subnet: `255.255.255.0`
   - Gateway: `192.168.1.1`
5. Connect your HDMI video inputs:
   - **Input 1**: PTZ Camera 1 (Pulpit)
   - **Input 2**: PTZ Camera 2 (Wide)
   - **Input 3**: Proclaim Presentation PC (Slides / Lyrics)
   - **Input 4**: Spare / Media PC
6. In the AV Controller Settings, ensure ATEM IP is set to `192.168.1.240`.

---

### 4C. PTZOptics Cameras (VISCA over IP)
1. Access the web administration page for each PTZ camera in your browser (e.g. `http://192.168.1.101` and `http://192.168.1.102`).
2. Log in (default credentials: `admin` / `admin`).
3. Under **Network**:
   - Verify VISCA over IP is **Enabled**.
   - Verify VISCA Port is set to `1259` (UDP).
4. Save and reboot the cameras if needed.

---

### 4D. OBS Studio (WebSocket v5)
OBS is used for local overflow room display, Zoom/Meeting distribution, and backup recording.

1. Open **OBS Studio**.
2. Go to **Tools** ➔ **WebSocket Server Settings**.
3. Check **"Enable WebSocket server"**.
4. Set **Server Port**: `4455`.
5. If you enable authentication, write down the password (you can enter it into the AV Controller settings modal).
6. Click **Apply** and **OK**.

---

### 4E. Faithlife Proclaim
1. Open Faithlife Proclaim on the lyrics/slides presentation computer.
2. Go to **Settings** ➔ **Remote**.
3. Check the box **"Enable Proclaim Remote"**.
4. Set a network password (e.g. `waypoint2026`).
5. Note the computer's IP address (`192.168.1.105`). Enter this IP and password in the AV Controller settings modal.

---

### 4F. VoxStream Live Captioner
VoxStream provides real-time AI speech-to-text from the pulpit microphone.
1. Ensure VoxStream is running on port `8765`.
2. Test by opening `http://127.0.0.1:8765/` in your browser.
3. The AV Controller automatically connects to `ws://127.0.0.1:8765` and feeds live interim words directly to the dashboard and stage monitor.

---

### 4G. YouTube API & Stream Health (Optional)
To display live viewer counts and stream health directly on the dashboard:
1. Open the AV Controller Settings modal (⚙️ **Settings** on the top right of the dashboard).
2. Go to **Tab 2: Hardware & Modules** ➔ **YouTube Integration**.
3. Enter your **YouTube Live Stream ID** or API Key / OAuth client details.
4. Click **Save Settings**.

---

### 4H. GroupMe Alerting Bots (Optional)
The system can notify sound booth volunteers and tech leads on their phones via GroupMe if the stream dies or silence exceeds 30 seconds.
1. Visit [https://dev.groupme.com](https://dev.groupme.com) and log in with your GroupMe account.
2. Click **Bots** ➔ **Create Bot**.
3. Select your church tech team group chat, name the bot `Sanctuary Watchdog`, and click **Submit**.
4. Copy the resulting **Bot ID**.
5. In the AV Controller dashboard, open ⚙️ **Settings** ➔ **Tab 3: Alerts & GroupMe**.
6. Paste the **GroupMe Bot ID**, set schedule to `Sundays 9am - 3pm`, and click **Save Settings**.

---

## Step 5: First Launch & Configuration

### Starting the Server
* **On macOS**: Double-click `start.command` in the project folder.
* **On Windows**: Double-click `start.bat` in the project folder.

*(A terminal window will open, start the Node.js server, and automatically launch `http://localhost:3050` in your default browser).*

### Initial Dashboard Verification
Once the dashboard opens:
1. Verify the top clock matches current system time.
2. Verify the top status badge reads **"All Systems Online"**.
3. Check the **Signal Chain** nodes at the top:
   - Proclaim, REAPER, ATEM, OBS, YouTube should show green status dots.
4. Test camera switching: Click `[1] Pulpit` or `[2] Wide` on the ATEM matrix and verify the ATEM Mini cuts to that camera.
5. Test PTZ steering: Click the D-pad arrows to confirm camera 1 moves.
6. Make noise into the soundboard mic to confirm the stereo VU meters dance between `-18` and `-12 dBFS`.

---

## Step 6: Auto-Start on Computer Boot

To ensure the Sanctuary AV Controller is always running even if the computer restarts Sunday morning:

### Method A: macOS Auto-Start (Recommended via PM2)
1. Open Terminal and install PM2 globally:
   ```bash
   npm install -g pm2
   ```
2. Start the AV Controller with PM2:
   ```bash
   cd path/to/AV_Controller
   pm2 start server.js --name "sanctuary-av"
   ```
3. Save the process list:
   ```bash
   pm2 save
   ```
4. Configure PM2 to launch on macOS startup:
   ```bash
   pm2 startup
   ```
   *(Copy and paste the sudo command that PM2 prints into the terminal and hit Enter).*

### Method B: macOS Login Items (GUI Method)
1. Open **System Settings** ➔ **General** ➔ **Login Items**.
2. Click the **+** button under "Open at Login".
3. Select the file `start.command` inside your `AV_Controller` folder.

### Method C: Windows Startup Folder
1. Press `Windows Key + R` to open the Run dialog.
2. Type `shell:startup` and hit `Enter`.
3. Right-click inside the Startup folder ➔ **New** ➔ **Shortcut**.
4. Browse to `C:\AV_Controller\start.bat` and click **Finish**.
5. Now, whenever the church Windows PC boots, the controller starts automatically!

---

## Step 7: Verification & Testing Checklist

Before training volunteers, run this quick diagnostic check:

- [ ] Open `http://localhost:3050/` — Main Hub loads with all 8 station cards.
- [ ] Open `http://localhost:3050/checklist` — Click **"⚡ Run Auto-Check"**; all hardware returns green passes.
- [ ] Open `http://localhost:3050/cameras` — ATEM direct switching and PTZ D-pad respond.
- [ ] Open `http://localhost:3050/audio` — REAPER stereo meters bounce during audio playback.
- [ ] Open `http://localhost:3050/captions` — Speaking into pulpit mic generates text preview within 1 second.
- [ ] Open `http://localhost:3050/broadcast` — Ping latencies are green (<20ms).
- [ ] Open `http://localhost:3050/hud` — Compact floating bar opens in a separate mini-window.
- [ ] Open `http://localhost:8085/` — Official Waypoint Sound Booth Operations Guide opens.
