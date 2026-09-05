# ⚡ Sanctuary AV Controller — Complete REST, WebSocket, ATEM & PTZOptics API Guide

The **Sanctuary AV Controller** includes a built-in REST API, real-time WebSocket server on port `3050` (`http://localhost:3050`), deep integration with the **VoxStream Live Captioning Suite** (port `8765`), **ATEM Mini 2-Camera Video Switching**, and **PTZOptics VISCA-over-IP (UDP 1259) Camera Control**.

---

## 📋 Table of Contents
1. [Base URLs & Network Architecture](#1-base-urls--network-architecture)
2. [🎥 ATEM Mini Video & Camera Switching (2-Camera Setup)](#2-🎥-atem-mini-video--camera-switching)
3. [🕹️ PTZOptics VISCA-over-IP Camera Control (UDP 1259)](#3-🕹️-ptzoptics-visca-over-ip-camera-control)
4. [📺 VoxStream Live Captioning & Emergency Display (Port 8765)](#4-📺-voxstream-live-captioning--emergency-display)
5. [🚨 Emergency Control: Reopen Screen & Panic Mute](#5-🚨-emergency-control-reopen-screen--panic-mute)
6. [📊 Subsystem Telemetry & Status Endpoints](#6-📊-subsystem-telemetry--status-endpoints)
7. [🌐 Real-Time WebSockets](#7-🌐-real-time-websockets)
8. [🎮 Hardware Integrations (Stream Deck, Companion, PowerShell, cURL)](#8-🎮-hardware-integrations)

---

## 1. Base URLs & Network Architecture
* **Sanctuary AV Master Controller**: `http://127.0.0.1:3050` (WebSocket: `ws://127.0.0.1:3050`)
* **ATEM Mini Switcher**: Static LAN IP (default: `192.168.1.240`)
* **PTZ Camera 1 (Pulpit / Stage)**: `192.168.1.101` (VISCA UDP: `1259`)
* **PTZ Camera 2 (Wide Sanctuary)**: `192.168.1.102` (VISCA UDP: `1259`)
* **VoxStream Caption Engine**: `http://127.0.0.1:8765` (WebSocket: `ws://127.0.0.1:8765/ws`)

---

## 2. 🎥 ATEM Mini Video & Camera Switching

### 🔴 Set Program Video Input (Live On-Air)
* **Endpoint**: `POST /api/atem/program`
* **JSON Body**:
  ```json
  { "input": 1 }
  ```
  *(Inputs: `1` = Cam 1 Pulpit, `2` = Cam 2 Wide, `3` = Proclaim, `3010` = Media Still 1, `0` = Black)*

### 🟢 Set Preview Video Input (Next Cued)
* **Endpoint**: `POST /api/atem/preview`
* **JSON Body**:
  ```json
  { "input": 2 }
  ```

### ⚡ Transitions
* **Hard Cut**: `POST /api/atem/cut` (Instant cut between Preview & Program)
* **Auto Transition (Mix)**: `POST /api/atem/auto` (Smooth dissolve transition)
* **Fade to Black (FTB)**: `POST /api/atem/ftb`

---

## 3. 🕹️ PTZOptics VISCA-over-IP Camera Control

### 📡 Query Cameras & Presets
* **Endpoint**: `GET /api/ptz/cameras`
* **Response**: Returns list of cameras (`cam1`, `cam2`), IP addresses, connection state, speed, and preset names.

### 🎮 Pan / Tilt / Zoom / Focus Motion
* **Endpoint**: `POST /api/ptz/control`
* **Pan / Tilt Motion**:
  ```json
  {
    "camera": "cam1",
    "direction": "left",
    "speed": 12
  }
  ```
  *(Directions: `"left"`, `"right"`, `"up"`, `"down"`, `"upleft"`, `"upright"`, `"downleft"`, `"downright"`, `"stop"` — Speed: 1 to 24)*
* **Zoom Motion**:
  ```json
  {
    "camera": "cam1",
    "action": "zoom",
    "zoomAction": "in",
    "speed": 4
  }
  ```
  *(Actions: `"in"`, `"out"`, `"stop"` — Speed: 1 to 7)*
* **Focus Control**:
  ```json
  {
    "camera": "cam1",
    "action": "focus",
    "focusAction": "auto"
  }
  ```
  *(Actions: `"auto"`, `"manual"`, `"near"`, `"far"`, `"stop"`)*

### 🎯 Recall Position Preset (1 to 16)
* **Endpoint**: `POST /api/ptz/preset/recall`
* **JSON Body**:
  ```json
  {
    "camera": "cam1",
    "preset": 1
  }
  ```
  *(Presets: `1` = Pulpit, `2` = Wide Stage, `3` = Lectern, `4` = Piano, `5` = Worship Leader, `6` = Altar)*

### 💾 Save Current Position as Preset
* **Endpoint**: `POST /api/ptz/preset/save`
* **JSON Body**:
  ```json
  {
    "camera": "cam1",
    "preset": 1,
    "name": "Pulpit / Pastor"
  }
  ```

---

## 4. 📺 VoxStream Live Captioning & Emergency Display

* **Transparent Stream Overlay**: `http://127.0.0.1:8765/` (OBS Browser Source)
* **PWA Stage Confidence Monitor**: `http://127.0.0.1:8765/display`
* **Bible Scripture Lower-Third**: `http://127.0.0.1:8765/bible`
* **Start / Pause Captions**: `POST /api/control/toggle`
* **Run Self-Diagnostics**: `GET /api/captioner/diagnose`

---

## 5. 🚨 Emergency Control: Reopen Screen & Panic Mute

### 1. 📺 Emergency Restore Screen & Captions (1-Click Trigger)
* **Endpoint**: `POST /api/control/reopen-screen`
* **What it does**: Connects to OBS via WebSocket, forces the fullscreen video preview to **LONTIUM / Monitor 1**, and resumes live captioning.

### 2. 🚨 Emergency Panic Mute
* **Endpoint**: `POST /api/control/panic`
* **What it does**: Instantly blanks all screen captions, mutes audio output, and pauses transcription across overlays and stage monitors.

---

## 6. 📊 Subsystem Telemetry & Status Endpoints

* **Full Status**: `GET /api/status`
* **Mini-HUD Status**: `GET /api/hud-status`
* **PTZ Cameras Status**: `GET /api/ptz/cameras`
* **Audio Devices**: `GET /api/captioner/devices`
* **Connected OBS Monitors**: `GET /api/captioner/monitors`

---

## 7. 🌐 Real-Time WebSockets

### Sanctuary AV Controller Telemetry: `ws://127.0.0.1:3050`
* **Incoming Client Commands**:
  - `ATEM_SET_PROGRAM` `{"input": 1}`
  - `ATEM_SET_PREVIEW` `{"input": 2}`
  - `ATEM_CUT`
  - `ATEM_AUTO`
  - `PTZ_PAN_TILT` `{"camera": "cam1", "direction": "left", "speed": 12}`
  - `PTZ_ZOOM` `{"camera": "cam1", "action": "in", "speed": 4}`
  - `PTZ_RECALL_PRESET` `{"camera": "cam1", "preset": 1}`
  - `REOPEN_SCREEN`
  - `PANIC_CAPTIONS`

---

## 8. 🎮 Hardware Integrations (Stream Deck & Companion)

### 1. Elgato Stream Deck Configuration

| Action | URL | Method | Payload (JSON) |
| :--- | :--- | :--- | :--- |
| **CAM 1 (Pulpit)** | `http://127.0.0.1:3050/api/atem/program` | `POST` | `{"input": 1}` |
| **CAM 2 (Wide)** | `http://127.0.0.1:3050/api/atem/program` | `POST` | `{"input": 2}` |
| **PROCLAIM (HDMI 3)** | `http://127.0.0.1:3050/api/atem/program` | `POST` | `{"input": 3}` |
| **⚡ CUT** | `http://127.0.0.1:3050/api/atem/cut` | `POST` | `{}` |
| **✨ AUTO (Mix)** | `http://127.0.0.1:3050/api/atem/auto` | `POST` | `{}` |
| **🎯 Preset 1: Pulpit** | `http://127.0.0.1:3050/api/ptz/preset/recall` | `POST` | `{"camera": "cam1", "preset": 1}` |
| **🎯 Preset 2: Wide Stage** | `http://127.0.0.1:3050/api/ptz/preset/recall` | `POST` | `{"camera": "cam1", "preset": 2}` |
| **🎯 Preset 3: Piano/Keys** | `http://127.0.0.1:3050/api/ptz/preset/recall` | `POST` | `{"camera": "cam1", "preset": 4}` |
| **📺 Reopen Screen** | `http://127.0.0.1:3050/api/control/reopen-screen` | `POST` | `{}` |
| **🚨 Panic Mute** | `http://127.0.0.1:3050/api/control/panic` | `POST` | `{}` |

### 2. cURL One-Liners
```bash
# Switch to Cam 1
curl -X POST http://127.0.0.1:3050/api/atem/program -H "Content-Type: application/json" -d '{"input":1}'

# Execute Hard Cut
curl -X POST http://127.0.0.1:3050/api/atem/cut

# Recall PTZ Preset 1 (Pulpit) on Cam 1
curl -X POST http://127.0.0.1:3050/api/ptz/preset/recall -H "Content-Type: application/json" -d '{"camera":"cam1","preset":1}'

# Move Cam 1 Left
curl -X POST http://127.0.0.1:3050/api/ptz/control -H "Content-Type: application/json" -d '{"camera":"cam1","direction":"left","speed":14}'
```
