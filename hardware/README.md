# 🎮 Stream Deck & Bitfocus Companion Integration Guide

The **Sanctuary AV Controller** exposes a high-speed REST API on port `3050` (`http://localhost:3050`). You can control the entire church broadcast rig (ATEM Switcher, PTZOptics cameras, VoxStream captions, Screen Restore, and Panic Mute) from an **Elgato Stream Deck** or **Bitfocus Companion**.

---

## 🚀 1. Elgato Stream Deck Setup (Native App)

In the official Elgato Stream Deck desktop software:

1. In the right panel, find the **System** category.
2. Drag the **Website** action (or install the free **API Request / HTTP Request** plugin from the Stream Deck Store) onto any button.
3. Configure the button:

### 🔴 ATEM Video Switching Buttons
* **CAM 1 (Pulpit)**:
  * URL: `http://127.0.0.1:3050/api/atem/program`
  * Method: `POST`
  * Body (JSON): `{"input": 1}`
* **CAM 2 (Wide)**:
  * URL: `http://127.0.0.1:3050/api/atem/program`
  * Method: `POST`
  * Body (JSON): `{"input": 2}`
* **PROCLAIM (HDMI 3)**:
  * URL: `http://127.0.0.1:3050/api/atem/program`
  * Method: `POST`
  * Body (JSON): `{"input": 3}`
* **⚡ CUT**:
  * URL: `http://127.0.0.1:3050/api/atem/cut`
  * Method: `POST`
* **✨ AUTO (Mix Dissolve)**:
  * URL: `http://127.0.0.1:3050/api/atem/auto`
  * Method: `POST`

---

### 🎯 PTZOptics Preset Buttons
* **Pulpit Preset (Cam 1)**:
  * URL: `http://127.0.0.1:3050/api/ptz/preset/recall`
  * Method: `POST`
  * Body (JSON): `{"camera": "cam1", "preset": 1}`
* **Wide Stage Preset (Cam 1)**:
  * URL: `http://127.0.0.1:3050/api/ptz/preset/recall`
  * Method: `POST`
  * Body (JSON): `{"camera": "cam1", "preset": 2}`
* **Piano / Keys Preset (Cam 1)**:
  * URL: `http://127.0.0.1:3050/api/ptz/preset/recall`
  * Method: `POST`
  * Body (JSON): `{"camera": "cam1", "preset": 4}`

---

### 🎥 OBS Studio Broadcast Buttons
* **🔴 OBS Start / Stop Stream**:
  * URL: `http://127.0.0.1:3050/api/obs/stream/toggle`
  * Method: `POST`
* **📼 OBS Start / Stop Record**:
  * URL: `http://127.0.0.1:3050/api/obs/record/toggle`
  * Method: `POST`
* **🎬 OBS Switch Scene**:
  * URL: `http://127.0.0.1:3050/api/obs/scene`
  * Method: `POST`
  * Body (JSON): `{"sceneName": "Worship"}`

---

### 🚨 Emergency & Display Safeguard Buttons
* **📺 Reopen Screen (LONTIUM Monitor 1 + Captions)**:
  * URL: `http://127.0.0.1:3050/api/control/reopen-screen`
  * Method: `POST`
  * *Tip: Set the button background to Amber/Orange.*
* **🚨 Emergency Panic (Blank Captions & Mute)**:
  * URL: `http://127.0.0.1:3050/api/control/panic`
  * Method: `POST`
  * *Tip: Set the button background to Bright Red.*

---

## 🌐 2. Bitfocus Companion Setup

If you use Bitfocus Companion on a separate Raspberry Pi or Mac:

1. In Companion ➔ **Connections** ➔ Add a **Generic: HTTP Requests** connection.
   * Target Host: `127.0.0.1` (or your controller computer's LAN IP).
   * Target Port: `3050`.
2. In **Buttons** ➔ Select any key:
   * Action: `HTTP: POST (JSON Data)`.
   * URI: `/api/atem/program`
   * JSON Payload: `{"input": 1}`
3. All button endpoints from `streamdeck-key-guide.json` can be pasted directly into Companion!

---

*Sanctuary AV Controller — Built for reliable, volunteer-proof church broadcasting.*
