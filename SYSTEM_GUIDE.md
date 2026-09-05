# ⛪ Sanctuary AV Controller — Master System Architecture & Operator's Guide

Welcome to the **Sanctuary AV Controller**, a unified, volunteer-friendly, real-time command center and automated telemetry watchdog engineered specifically for church live production environments.

This guide provides a comprehensive overview of the entire system, hardware connections, mobile-first station pages, emergency controls, and Sunday morning volunteer workflows.

---

## 📋 Table of Contents
1. [System Architecture & Signal Flow](#1-system-architecture--signal-flow)
2. [Connected Hardware & Software Systems](#2-connected-hardware--software-systems)
3. [📱 Mobile-First Station Web Ecosystem](#3-mobile-first-station-web-ecosystem)
4. [⏰ Sunday Volunteer Workflow (Step-by-Step)](#4-sunday-volunteer-workflow-step-by-step)
5. [🚨 Emergency Controls & Volunteer Safeguards](#5-emergency-controls--volunteer-safeguards)
6. [🤖 Dual GroupMe Incident Bots](#6-dual-groupme-incident-bots)
7. [📊 Automated Post-Service Health Reports](#7-automated-post-service-health-reports)
8. [🎮 Hardware Controllers (Stream Deck & Companion)](#8-hardware-controllers-stream-deck--companion)
9. [⚙️ Configuration & Deployment](#9-configuration--deployment)

---

## 1. System Architecture & Signal Flow

The Sanctuary AV Controller acts as the central brain on your church local network (port `3050`), continuously aggregating telemetry via OSC, VISCA over IP, WebSockets, ICMP, and REST APIs, while serving dedicated mobile stations to volunteers.

```mermaid
flowchart TD
    subgraph Audio Chain
        FOH["Soundcraft Si Impact\n(FOH Desk USB)"] -->|"USB Audio Ch 1-2"| REAPER["REAPER DAW\n(Livestream Master Mix)"]
        REAPER -->|"OSC VU Meters (Port 9000/8000)"| SERVER
    end

    subgraph Video Chain
        CAM1["PTZOptics Cam 1\n(Pulpit / Stage)"] -->|"HDMI 1"| ATEM["Blackmagic ATEM Mini\n(Video Switcher)"]
        CAM2["PTZOptics Cam 2\n(Wide Sanctuary)"] -->|"HDMI 2"| ATEM
        PROCLAIM["Faithlife Proclaim\n(Lyrics & Slides)"] -->|"HDMI 3"| ATEM
        STILL["Media Still 1\n(Graphic / Logo)"] -->|"Still 1"| ATEM
        
        SERVER -.->|"VISCA UDP 1259 / CGI"| CAM1
        SERVER -.->|"VISCA UDP 1259 / CGI"| CAM2
        SERVER -.->|"Ethernet State & Tallies"| ATEM
        SERVER -.->|"REST Port 52195"| PROCLAIM
    end

    subgraph Captions & Stage
        MIC["Sanctuary Mic Audio"] --> VOX["VoxStream Live Captioner PRO\n(Port 8765)"]
        VOX -->|"Live Speech-to-Text WS"| SERVER
        SERVER -->|"Monitor 1 Preview"| LONTIUM["LONTIUM Stage / Confidence TV"]
    end

    subgraph Broadcast & Monitoring
        ATEM -->|"Direct RTMP"| YT["YouTube Live Broadcast"]
        ATEM -->|"HDMI Out"| OBS["OBS Studio\n(Local Overflow & Recording)"]
        OBS -.->|"WebSocket v5 (Port 4455)"| SERVER
    end

    subgraph Sanctuary AV Controller (Port 3050)
        SERVER["Node.js Master Controller\n(Express & WebSocket Server)"]
        SERVER -->|"Push State (200ms)"| STATIONS["Mobile-First Web Stations\n(/, /checklist, /cameras, /audio, /captions, /broadcast)"]
        SERVER -->|"Dual Bot Incident Alerts"| GROUPME["GroupMe Team Channels\n(Main Team & Tech Leads)"]
    end
```

---

## 2. Connected Hardware & Software Systems

| Subsystem | Hardware / Software | Connection Protocol | Default Endpoint / Port | Role & Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **🎙️ FOH Audio** | Soundcraft Si Impact | USB Audio Streaming | USB Channels 1–2 | Main sanctuary audio desk sending direct broadcast feed. |
| **🎛️ DAW Mix** | REAPER DAW | Open Sound Control (OSC) | `127.0.0.1:9000` (Send) / `8000` (Recv) | Precision master volume VU metering, silence watchdog alarm. |
| **🎥 Video Switcher** | Blackmagic ATEM Mini | Blackmagic Ethernet API | `192.168.1.240` | 2-Camera program/preview switching, CUT, AUTO, and FTB. |
| **🕹️ Camera 1** | PTZOptics 20X / 30X | VISCA over IP (UDP) + HTTP | `192.168.1.101:1259` | Stage & Pulpit camera with 8-way D-Pad and Church Presets. |
| **🕹️ Camera 2** | PTZOptics 20X / 30X | VISCA over IP (UDP) + HTTP | `192.168.1.102:1259` | Wide sanctuary congregation camera with Church Presets. |
| **📖 Presentation** | Faithlife Proclaim | Local REST API | `192.168.1.X:52195` | Lyric slides, sermon scripture passages, on-air monitor. |
| **📼 Local Overflow** | OBS Studio | WebSocket Protocol v5 | `127.0.0.1:4455` | Local overflow room feed, backup MP4 recording, dropped frames. |
| **🗣️ Live Captions** | VoxStream Captioner PRO | REST & WebSocket | `http://127.0.0.1:8765` | Real-time speech transcription, Bible cards, stage monitor. |
| **📡 Broadcast** | YouTube Live | YouTube Data API v3 | RTMP Ingest `a.rtmp.youtube.com` | Primary public livestream stream health, viewer count. |

---

## 3. 📱 Mobile-First Station Web Ecosystem

All interfaces are **mobile-first, touch-friendly, and responsive**, scaling seamlessly across smartphones (iPhone/Android), tablets (iPad / Mixing Station), and desktop monitors.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    SANCTUARY AV — MOBILE BOTTOM DOCK                       │
│  [ 🎛️ Master ]  [ 📋 Checklist ]  [ 🎥 Cameras ]  [ 🎙️ Audio ]  [ 📺 Captions ]  [ 📡 Broadcast ] │
└────────────────────────────────────────────────────────────────────────────┘
```

### 1. 🎛️ Master Control & Settings Hub (`http://localhost:3050/`)
* **Overview**: Comprehensive master overview displaying the live signal chain flow, ATEM switcher bar, PTZ joystick, VU meters, and YouTube telemetry.
* **4-Tab Configuration Center**: Click ⚙️ **Settings** to customize modules, hardware IP addresses, alert thresholds, dual GroupMe bot IDs, Sunday service hours, and backup/restore.

### 2. 📋 Sunday Pre-Flight Checklist (`http://localhost:3050/checklist`)
* **Overview**: Dedicated station for Sunday morning volunteers before the service begins.
* **Features**:
  * **`⚡ Run Auto-Check`**: Runs a live diagnostic sweep across all hardware in 1 second.
  * **Volunteer Sign-Off**: Enter volunteer name and lock-in pre-service verification.
  * **Broadcast Reports Tab**: View all historical post-service summary reports.

### 3. 🎥 Camera & Video Switcher Station (`http://localhost:3050/cameras`)
* **Overview**: Clean, high-contrast console for Camera Operators and Video Switcher Directors.
* **Features**:
  * **Large ATEM Touch Tallies**: Program (Red glow) and Preview (Green glow) buttons for Cam 1 (Pulpit), Cam 2 (Wide), HDMI 3 (Proclaim), Media 1, and Black.
  * **8-Way PTZ D-Pad Compass**: Hold-to-move, release-to-stop joystick with adjustable speed slider (1–24).
  * **Church Preset Cards**: Instant 1-tap recall for *Pulpit*, *Wide Stage*, *Lectern*, *Piano*, *Altar*, and *Choir*.
  * **Quick CUT & AUTO Buttons**.

### 4. 🎙️ Audio & Livestream Metering Station (`http://localhost:3050/audio`)
* **Overview**: Dedicated audio console for FOH sound engineers and livestream mixers.
* **Features**:
  * **Dual Full-Height VU Meters**: High-precision logarithmic dBFS scales (-60dB to 0dB) with peak-hold decay.
  * **Silence Watchdog Alarm**: Real-time silence timer that pulses when audio drops below -50 dBFS.
  * **YouTube AAC Stream Health**: 128k AAC audio health badge.

### 5. 📺 Real-Time Speech Transcription & Stage Confidence (`http://localhost:3050/captions`)
* **Overview**: Teleprompter display designed for pastors, vocalists, and floor confidence monitors.
* **Features**:
  * **Live Flowing Transcription**: Words appear instantaneously as spoken.
  * **Interim Speech Glow**: Active spoken words in cyan glowing italics before committing.
  * **Font Scaling**: Standard, Large, and Giant font sizing.
  * **Service Clock & Words/Min Pacing Meter**.

### 6. 📡 Broadcast Telemetry & Diagnostics (`http://localhost:3050/broadcast`)
* **Overview**: Tech director station for monitoring live broadcast quality.
* **Features**:
  * Live Bitrate (kbps), FPS, and Dropped Frames meter.
  * 5-node LAN/WAN latency ping monitors (Gateway, Si/REAPER, ATEM, Proclaim, YouTube Ingest).
  * Filterable real-time chronological event log.

### 7. 🪟 Mini-HUD Bar (`http://localhost:3050/hud`)
* **Overview**: Ultra-compact floating status bar that docks above **Mixing Station** or inside OBS Studio.
* **Features**: Live Cam 1, Cam 2, CUT, VU meter, Viewers count, and 1-Click Reopen Screen / Panic buttons.

---

## 4. ⏰ Sunday Volunteer Workflow (Step-by-Step)

```
   9:00 AM                  9:45 AM                  10:00 AM                 11:30 AM
┌──────────────┐         ┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│  PRE-FLIGHT  │ ──────> │ REOPEN SCREEN│ ──────> │ LIVE SERVICE │ ──────> │ POST-SERVICE │
│  CHECKLIST   │         │ (LONTIUM 1)  │         │ TRANSCRIPTION│         │ GROUPME RECAP│
└──────────────┘         └──────────────┘         └──────────────┘         └──────────────┘
```

### Step 1: Pre-Flight Verification (9:00 AM)
1. Open **`http://localhost:3050/checklist`** on your phone or tablet.
2. Tap **`⚡ Run Auto-Check`**. All automated hardware items will instantly turn green.
3. Check wireless microphone batteries and floor confidence screens.
4. Type your name into the **Volunteer Sign-Off** box and tap **`🔒 Sign Off & Notify`**.
   * *GroupMe automatically receives a confirmation that pre-flight is 100% complete!*

### Step 2: Stage Display Verification (9:45 AM)
1. If the side conference room / stage display is showing a blank Windows desktop, tap **`📺 Reopen Screen`** in the top bar.
2. The Sanctuary AV Controller will forcefully send the OBS Fullscreen Video Preview to the **LONTIUM screen (Monitor 1)** and start live captions.

### Step 3: Live Service Operations (10:00 AM – 11:30 AM)
* **Camera Operator**: Uses **`/cameras`** on an iPad to pan/tilt cameras and switch ATEM inputs.
* **Sound Mixer**: Keeps **`/audio`** or **`/hud`** open to monitor VU levels and watch for silence alarms.
* **Pastor / Stage**: Watches **`/captions`** on the stage confidence monitor for live teleprompter text.

### Step 4: Post-Service Automatic Recap (11:30 AM)
* When the YouTube / ATEM broadcast stops, the system automatically calculates all metrics, compiles an archived report, and sends a summary to the **Tech Leads GroupMe Bot**!

---

## 5. 🚨 Emergency Controls & Volunteer Safeguards

| Emergency Action | Dashboard Button | REST Endpoint | What it Does |
| :--- | :--- | :--- | :--- |
| **📺 Reopen Screen** | Top Header Button (All Pages) | `POST /api/control/reopen-screen` | Connects to OBS over WebSocket, forces the fullscreen video preview to **LONTIUM / Monitor 1**, and resumes speech transcription. |
| **🚨 Emergency Panic** | Header & Mini-HUD | `POST /api/control/panic` | Instantly blanks all screen captions, mutes audio output, and pauses transcription across all overlays and stage monitors. |
| **⏸️ Captions Toggle**| Header & Captions Page | `POST /api/control/toggle` | Toggles the speech recognition engine between Capturing and Standby. |

---

## 6. 🤖 Dual GroupMe Incident Bots

The system separates operational alerts so volunteers aren't spammed with network diagnostics:

### 📢 Bot #1: Main Team Group (General Tech & Volunteers)
* **Audio Silence Alarms**: Triggered if audio stays below -50 dBFS for >120 seconds.
* **Stream Overtime Warnings**: Triggered if service exceeds maximum scheduled time (e.g. 120 mins).
* **Pre-Flight Sign-Off Confirmation**: Notifies the team that the pre-service check is complete.

### 🛠️ Bot #2: Tech Leads Group (Engineers & Systems Admins)
* **Hardware Disconnection Alarms**: Triggered if REAPER, ATEM, OBS, or Proclaim disconnects.
* **Network Outage Alarms**: Triggered if the Gateway router or YouTube RTMP server fails ping.
* **Post-Service Summary Reports**: Full broadcast telemetry and incident breakdown at service end.

---

## 7. 📊 Automated Post-Service Health Reports

Every live broadcast session is automatically recorded into `reports/report-YYYY-MM-DD.json`. 

### Sample Post-Service Report:
```text
📊 SANCTUARY AV — SERVICE BROADCAST REPORT
📅 Sunday, Sep 6, 2026
⏱️ Duration: 1h 24m 15s (10:01 AM - 11:25 AM)
👥 Peak Audience: 74 live viewers
📡 Avg Bitrate: 4,510 kbps (Dropped Frames: 0)
🎙️ Audio Silence Alarms: 0
🎥 Camera Operations: 48 Video Cuts | 32 PTZ Presets
👤 Pre-Flight Sign-Off: Sarah Jenkins (Audio Lead) (9:28 AM)
✅ Status: 100% Clean Broadcast
```

---

## 8. 🎮 Hardware Controllers (Stream Deck & Companion)

### Elgato Stream Deck Key Mappings

| Button Title | Action URL | HTTP Method | Payload (JSON) |
| :--- | :--- | :--- | :--- |
| **CAM 1 (Pulpit)** | `http://127.0.0.1:3050/api/atem/program` | `POST` | `{"input": 1}` |
| **CAM 2 (Wide)** | `http://127.0.0.1:3050/api/atem/program` | `POST` | `{"input": 2}` |
| **PROCLAIM (HDMI 3)** | `http://127.0.0.1:3050/api/atem/program` | `POST` | `{"input": 3}` |
| **⚡ CUT** | `http://127.0.0.1:3050/api/atem/cut` | `POST` | `{}` |
| **✨ AUTO (Mix)** | `http://127.0.0.1:3050/api/atem/auto` | `POST` | `{}` |
| **🎯 Pulpit Preset** | `http://127.0.0.1:3050/api/ptz/preset/recall` | `POST` | `{"camera": "cam1", "preset": 1}` |
| **🎯 Wide Stage Preset**| `http://127.0.0.1:3050/api/ptz/preset/recall` | `POST` | `{"camera": "cam1", "preset": 2}` |
| **🎯 Piano Preset** | `http://127.0.0.1:3050/api/ptz/preset/recall` | `POST` | `{"camera": "cam1", "preset": 4}` |
| **📺 Reopen Screen** | `http://127.0.0.1:3050/api/control/reopen-screen` | `POST` | `{}` |
| **🚨 Panic Mute** | `http://127.0.0.1:3050/api/control/panic` | `POST` | `{}` |

---

## 9. ⚙️ Configuration & Deployment

### Starting the Server
```bash
cd path/to/AV_Controller
node server.js
```
The server will initialize all hardware connections and start listening on **`http://localhost:3050`**.

### Configuration File (`config.json`)
All settings can be edited live via the **Settings Modal** on `http://localhost:3050/` or by modifying `config.json`:
```json
{
  "serverPort": 3050,
  "reaperHost": "127.0.0.1",
  "reaperSendPort": 9000,
  "reaperReceivePort": 8000,
  "atemIp": "192.168.1.240",
  "cam1Ip": "192.168.1.101",
  "cam2Ip": "192.168.1.102",
  "gatewayIp": "192.168.1.1",
  "youtubeIngestHost": "a.rtmp.youtube.com",
  "captionerApiUrl": "http://127.0.0.1:8765",
  "captionerMonitorIndex": 1,
  "groupmeEnabled": true,
  "groupmeMainBotId": "your_main_bot_id",
  "groupmeTechBotId": "your_tech_bot_id"
}
```

---

*Sanctuary AV Controller — Built for reliable, volunteer-proof church broadcasting.*
