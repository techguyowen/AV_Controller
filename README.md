# 🎛️ Sanctuary AV Controller & Mobile Multi-Station Broadcast Suite

A professional, real-time A/V telemetry monitoring dashboard, camera switching console, emergency display suite, and automated pre-flight checklist designed specifically for church live production.

Built for **Soundcraft Si / REAPER DAW**, **Blackmagic ATEM Mini (2-Camera Setup)**, **PTZOptics VISCA-over-IP Cameras**, **OBS Studio**, **Faithlife Proclaim**, **VoxStream Live Captioning PRO (Port 8765)**, **YouTube Live**, and **Dual GroupMe Incident Bots**.

---

## 📚 Complete Guides & Documentation
* 🪟 **[Windows 10/11 Dedicated Setup Guide](WINDOWS_SETUP_GUIDE.md)**: Fast, step-by-step instructions for Windows church PCs, 1-click `start.bat` launch, Windows Firewall configuration, and auto-boot setup.
* 🛠️ **[Computer Installation & First-Time Setup Guide](INSTALL_AND_SETUP_GUIDE.md)**: Complete step-by-step instructions for installing Node.js, static IP planning, configuring REAPER OSC, ATEM, PTZ, OBS, and setting up auto-boot across macOS & Windows.
* 📖 **[Volunteer Training Manual & Sunday Playbook](VOLUNTEER_TRAINING_MANUAL.md)**: Beginner-friendly training walkthrough for Sunday morning volunteers, including the 8:30 AM pre-flight routine, PTZ presets, audio sweet spots, and the emergency troubleshooting cheat sheet.
* 🏗️ **[Master System Architecture & Operator's Guide](SYSTEM_GUIDE.md)**: Technical overview of the signal flow, hardware connections, and automated post-service reports.
* ⚡ **[REST, WebSocket & Stream Deck API Reference](API_GUIDE.md)**: Full API documentation for hardware integration, Stream Deck buttons, Companion, and cURL commands.

---

## 📱 Mobile-First Station Pages

Open any of these URLs on your phone, iPad, or soundbooth monitor:

| Station | URL | Purpose & Target User |
| :--- | :--- | :--- |
| **🎛️ Master Hub** | `http://localhost:3050/` | Full dashboard, signal chain pipeline, and 4-tab settings configurator. |
| **📋 Sunday Checklist** | `http://localhost:3050/checklist` | Pre-flight 1-click automated hardware diagnostics & volunteer sign-off. |
| **🎥 Camera & Switcher** | `http://localhost:3050/cameras` | ATEM 2-Camera Program/Preview tallies, 8-way PTZ D-Pad & Church Presets. |
| **🎙️ Audio Mix** | `http://localhost:3050/audio` | Dual high-precision VU meters, silence alarm watchdog timer & AAC health. |
| **📺 Real-Time Captions** | `http://localhost:3050/captions` | Live speech-to-text teleprompter, interim glowing speech & font scaling. |
| **📡 Broadcast Telemetry** | `http://localhost:3050/broadcast` | Live bitrates, FPS, dropped frame percentage & 5-node latency pings. |
| **🪟 Mini-HUD Bar** | `http://localhost:3050/hud` | Ultra-compact floating status bar for Mixing Station & OBS Studio. |

---

## 🚀 Quick Start (Installation & Launch)

### 🪟 Windows 10 / 11 (1-Click Automated Setup)
1. Clone or download this repository to `C:\AV_Controller`.
2. Right-click **`install.bat`** ➔ **Run as administrator**.
   *(Automatically installs Node.js via `winget`, runs `npm install`, configures Windows Firewall rules for port 3050/9000, and creates desktop/startup shortcuts).*
3. To start anytime: double-click **`start.bat`** or your desktop shortcut!

### 🍎 macOS (Quick Start)
1. Ensure **Node.js LTS (v18+)** is installed from [nodejs.org](https://nodejs.org).
2. Double-click **`start.command`** or run:
```bash
cd path/to/AV_Controller
npm install
npm start
```

---

## 🚨 Emergency Volunteer Safeguards

* **📺 Reopen Screen (`POST /api/control/reopen-screen`)**: Forcefully sends OBS Fullscreen Video Preview to the **LONTIUM screen (Monitor 1)** and resumes captions.
* **🚨 Emergency Panic Mute (`POST /api/control/panic`)**: Instantly blanks all screen captions and mutes audio output.
* **⏸️ Toggle Transcription (`POST /api/control/toggle`)**: Toggles the speech recognition engine between Capturing and Standby.

---

## 💾 Auto-Starting on Computer Boot (macOS / Windows)

### macOS (PM2 Daemon)
```bash
npm install -g pm2
cd path/to/AV_Controller
pm2 start server.js --name "sanctuary-av"
pm2 save
pm2 startup
```

---

*Sanctuary AV Controller — Built for reliable, volunteer-proof church broadcasting.*
