# 📖 Sanctuary AV Controller — Volunteer Training Manual & Sunday Playbook

A volunteer-friendly, visual training walkthrough for Sunday morning sound booth operators at Waypoint Church. Designed so anyone—even someone with zero previous broadcast experience—can confidently run the live stream.

---

## 📋 Table of Contents
1. [Welcome to the Sound Booth](#1-welcome-to-the-sound-booth)
2. [The 5 Station Dashboard Tour](#2-the-5-station-dashboard-tour)
3. [Sunday Morning Timeline](#3-sunday-morning-timeline)
4. [Pre-Flight Checklist Walkthrough (8:30 AM - 8:45 AM)](#4-pre-flight-checklist-walkthrough)
5. [Live Service Operations (9:00 AM - 12:00 PM)](#5-live-service-operations)
   - [A. Video Switching (ATEM Mini Pro)](#a-video-switching)
   - [B. Steering the PTZ Cameras](#b-steering-the-ptz-cameras)
   - [C. Monitoring Audio Levels](#c-monitoring-audio-levels)
   - [D. Live Speech Captions](#d-live-speech-captions)
   - [E. YouTube Livestream Management](#e-youtube-livestream-management)
6. [Emergency Cheat Sheet ("If X Happens, Do Y")](#6-emergency-cheat-sheet)
7. [Post-Service Shutdown Checklist (12:00 PM)](#7-post-service-shutdown-checklist)

---

## 1. Welcome to the Sound Booth

Thank you for serving! The **Sanctuary AV Controller** gives you a single screen (`http://localhost:3050`) to monitor and control everything happening in the booth.

### The Golden Rule of Live Streaming:
> **"Check twice, cut once, and don't panic."**
> Everything in this system has an automatic safeguard or a 1-click fix. If anything looks strange, look at the Emergency Cheat Sheet in Section 6.

---

## 2. The 5 Station Dashboard Tour

On the broadcast computer screen, you will see the **Master Hub (`http://localhost:3050/`)**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. 📡 SIGNAL CHAIN ROUTER: 5 green status dots showing audio, video, & stream are connected│
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. 💬 LIVE CAPTIONS: Real-time speech preview from pulpit mic with [Clear] & [Panic]   │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. 📷 VIDEO & CAMERAS: ATEM 5-input switcher + PTZ camera joystick & church presets   │
├─────────────────────────────────────────┬──────────────────────────────────────────────┤
│ 4. 🎙️ AUDIO METERS: Stereo VU levels     │ 6. 📡 BROADCAST ENCODERS: Stream time & rate │
│    Target sweet spot: -18 to -12 dBFS   │    [🔴 ATEM Stream] [⏺️ Rec] [📡 OBS Stream]  │
├─────────────────────────────────────────┼──────────────────────────────────────────────┤
│ 5. 🌐 NETWORK PINGS: Device health <20ms│ 7. 📺 YOUTUBE HEALTH: Viewers & audio stream │
├─────────────────────────────────────────┴──────────────────────────────────────────────┤
│ 8. 📋 THRESHOLDS & INCIDENT LOG: Auto-scrolling live diagnostic activity log           │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

You can also open dedicated full-screen stations from the navigation bar:
* **📋 Checklist**: `http://localhost:3050/checklist` (Sunday morning setup)
* **📷 Cameras**: `http://localhost:3050/cameras` (Dedicated camera joystick)
* **🎙️ Audio**: `http://localhost:3050/audio` (Full-screen vertical VU meters)
* **💬 Captions**: `http://localhost:3050/captions` (Full-screen teleprompter)
* **📡 Broadcast**: `http://localhost:3050/broadcast` (Bitrates & network pings)
* **📖 Booth Ops**: `http://localhost:8085/` (Official Waypoint operations manual)

---

## 3. Sunday Morning Timeline

| Time | Action | Station |
| :--- | :--- | :--- |
| **8:30 AM** | Arrive in booth. Power on displays, soundboard, and broadcast PC. | Booth |
| **8:35 AM** | Launch AV Controller (`start.command` on Mac or `start.bat` on PC). | Broadcast PC |
| **8:45 AM** | Open `/checklist` and click **"⚡ Run Auto-Check"**. Verify all 10 items. | Checklist |
| **8:50 AM** | Soundcheck: Verify audio bounces in the green/yellow `-18 to -12 dBFS` zone. | Audio |
| **8:55 AM** | Cue pre-service countdown slide in Proclaim (`[3] Proclaim` on ATEM). | Switcher |
| **8:58 AM** | Click **"🔴 ATEM Stream"** to start broadcasting to YouTube. | Master Hub |
| **9:00 AM** | Service begins! Follow order of worship. | Cameras / ATEM |
| **12:00 PM** | Service ends. Stop stream, stop recording, sign off checklist. | Master Hub |

---

## 4. Pre-Flight Checklist Walkthrough (8:30 AM - 8:45 AM)

Before the service begins, go to **`http://localhost:3050/checklist`**:

1. Click the big cyan button: **`⚡ Run Auto-Check`**.
2. Watch the automated hardware sweep test all systems in 1 second:
   - ✅ **FOH Soundcraft USB**: Connected & streaming audio.
   - ✅ **REAPER DAW OSC**: Master fader active and listening on port 9000.
   - ✅ **ATEM Mini Pro**: Connected via Ethernet on `192.168.1.240`.
   - ✅ **PTZ Camera 1 (Pulpit)**: VISCA IP responsive on `192.168.1.101`.
   - ✅ **PTZ Camera 2 (Wide)**: VISCA IP responsive on `192.168.1.102`.
   - ✅ **Faithlife Proclaim**: On-air and authenticated.
   - ✅ **OBS Studio**: WebSocket v5 connected on port 4455.
   - ✅ **VoxStream Live Captioner**: WebSocket active on port 8765.
   - ✅ **YouTube RTMP Ingest**: Latency under 50ms.
   - ✅ **GroupMe Incident Bot**: Standby for automated alerts.
3. If all items show **PASS**, type your name in the **Volunteer Operator Name** box and click **"💾 Submit Sunday Sign-Off"**.
4. If an item shows **FAIL**, read the troubleshooting tip displayed on that card or check Section 6 below.

---

## 5. Live Service Operations (9:00 AM - 12:00 PM)

### A. Video Switching
In the **ATEM Video Switcher** card:
* **🔴 PROGRAM (Top Row)**: The camera currently live on YouTube.
* **🟢 PREVIEW (Bottom Row)**: The source cued up next.

```
Inputs:
[1] CAM 1: Pulpit / Center Stage
[2] CAM 2: Wide Sanctuary (Congregation)
[3] HDMI 3: Faithlife Proclaim (Lyrics & Sermon Slides)
[MEDIA]: Church Logo / Graphic Still
[BLACK]: Fade to Black
```

**How to switch:**
1. Click the source you want next in the **PREVIEW (Green)** row.
2. Verify in your booth multiview monitor that the shot looks good.
3. Tap **`✨ AUTO (Mix)`** for a smooth 1-second crossfade, OR tap **`⚡ CUT`** for an instant cut.

---

### B. Steering the PTZ Cameras
In the **PTZOptics Camera Console** card:
1. Select which camera you want to move:
   - Click `[📷 Cam 1 (Pulpit)]` or `[📷 Cam 2 (Wide)]`.
2. **Use Church Position Presets (Fastest & Safest)**:
   - Tap `Pulpit` ➔ Camera snaps to the preacher.
   - Tap `Lectern` ➔ Camera snaps to the scripture reader.
   - Tap `Center Stage` ➔ Camera frames worship leader.
   - Tap `Band` ➔ Camera frames worship musicians.
   - Tap `Wide` ➔ Camera zooms out to full sanctuary.
3. **Manual Joystick Adjustments**:
   - **Click and hold** any D-pad arrow (▲, ▼, ◀, ▶) to pan/tilt.
   - **Release the mouse button** to stop moving.
   - Click and hold `➕ In` to zoom in; release to stop.
   - Click and hold `➖ Out` to zoom out; release to stop.
   - Adjust the **SPEED** slider (1 = slow & gentle, 24 = fast). We recommend `12`.

> [!WARNING]
> **Never adjust a camera while it is live on PROGRAM!** Always switch to another camera first, adjust your shot in Preview, and then cut back.

---

### C. Monitoring Audio Levels
In the **REAPER Audio Metering** card:
* **Target Sweet Spot**: Look at the green/yellow zone between **`-18 dBFS` and `-12 dBFS`**.
* **Dialogue (Sermon/Prayers)**: Should hover around `-18 dBFS`.
* **Worship Music (Band/Singers)**: Should peak around `-12 dBFS` to `-6 dBFS`.
* **Red Warning (0 dB)**: If the meter hits the red zone at `0 dB`, audio is clipping/distorting. Tell the soundboard operator to pull down the livestream master fader.
* **Silence Watchdog**: If audio drops dead below `-50 dB` for more than 30 seconds, a pulsing red banner will appear: **"🚨 SILENCE DETECTED"**.

---

### D. Live Speech Captions
In the **VoxStream Live Captioning** card:
* Real-time words spoken from the pulpit microphone will appear in the quote box.
* The badge shows current speaking speed (e.g. `⚡ 130 WPM`).
* **If speech transcription freezes**: Tap `Start / Stop` once to restart it.
* **If incorrect words appear**: Tap `🧹 Clear Text` to instantly wipe the current sentence.
* **Emergency Panic**: If inappropriate text is displayed, tap **`🚨 Panic`** to instantly black out all captions everywhere.

---

### E. YouTube Livestream Management
In the **Broadcast Encoders** card:
* **To Go Live**: Tap **`🔴 ATEM Stream`**. The status will change to **`● BROADCASTING LIVE`** and the timer will count up.
* **To Start Backup Recording**: Tap **`⏺️ ATEM Rec`** (records high-quality MP4 to the USB-C drive on the ATEM Mini) and/or **`📡 OBS Stream`**.
* **Watchdog Alert (> 2 Hours)**: If the service timer exceeds 120 minutes, a bright red banner will flash: **`🚨 MAX STREAM DURATION EXCEEDED`**. Check if the service is over and stop the stream!

---

## 6. Emergency Cheat Sheet ("If X Happens, Do Y")

### 🚨 Problem 1: "SILENCE DETECTED (>30s)" banner is flashing red
1. Look at the soundboard (Soundcraft Si Impact). Is the **Main L/R Master Fader** pushed up?
2. Is the USB cable between the soundboard and the computer plugged in?
3. Check REAPER DAW on the computer. Is the project playing/monitoring? Is the master track muted?
4. Unmute the master fader in REAPER. The meters will resume bouncing immediately.

---

### 🚨 Problem 2: PTZ Camera is pointing at the ceiling or wall
1. **DO NOT PANIC.** Cut the stream to `[2] Wide` or `[3] Proclaim` so the online audience doesn't see the camera moving.
2. In the PTZ card, select the misbehaving camera.
3. Tap the preset button: **`Pulpit`** or **`Center Stage`**.
4. The camera will motor back to its correct position in 2 seconds.
5. Once framed properly, cut back to it.

---

### 🚨 Problem 3: The stream timer exceeds 2 hours
1. Look at the sanctuary. Has the benediction / postlude finished?
2. If the service is over, tap **`🔴 ATEM Stream`** to stop broadcasting.
3. If the service is intentionally running long (e.g., special baptism service), you can dismiss the warning and let it keep streaming.

---

### 🚨 Problem 4: Live captions show weird words or typos
1. Tap **`🧹 Clear Text`** on the dashboard.
2. If it continues glitching, tap **`🚨 Panic`** to shut off the caption display until the preacher speaks clearly.

---

### 🚨 Problem 5: OBS or ATEM shows "Offline"
1. Check the physical Ethernet cables plugged into the back of the ATEM Mini and computer.
2. If ATEM is unplugged, plug it back in. It will reconnect automatically within 5 seconds.
3. If OBS is closed, launch **OBS Studio** on the desktop. It connects automatically.

---

### 🚨 Problem 6: Confidence / Stage TV monitor goes black
1. Tap the **`📺 Reopen Screen`** button in the top header of the AV Controller.
2. The controller will forcefully send the fullscreen video feed back to the stage monitor and restart speech captions.

---

## 7. Post-Service Shutdown Checklist (12:00 PM)

When the service concludes and people are leaving the sanctuary:

- [ ] **1. Stop Stream**: Tap `🔴 ATEM Stream` on the dashboard. Verify duration stops counting and status returns to `STANDBY`.
- [ ] **2. Stop Recording**: Tap `⏺️ ATEM Rec` on the ATEM Mini to finalize the MP4 video file on the USB drive.
- [ ] **3. Clear Captions**: Tap `🧹 Clear Text` to clear out the last sermon sentence.
- [ ] **4. Fade Switcher**: Cut ATEM to `[MEDIA]` (Church Logo) or `[BLACK]`.
- [ ] **5. Park Cameras**: Tap `Wide` preset on Camera 1 and Camera 2 so they are safely framed for next week.
- [ ] **6. Close Applications**: Leave the AV Controller running or shut down as instructed by your tech director.

---

*Thank you for serving Waypoint Church! You make it possible for people at home and around the world to worship with us.*
