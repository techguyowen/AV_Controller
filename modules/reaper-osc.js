/**
 * modules/reaper-osc.js
 * REAPER DAW integration via Open Sound Control (OSC) — Read-Only Telemetry Monitor
 *
 * Exclusively listens for meter telemetry and transport state on port 9000.
 * Completely passive; does not send any commands or control REAPER in any way.
 */

const { Server: OscServer } = require('node-osc');

class ReaperOSC {
  constructor(config = {}) {
    this.sendPort = parseInt(config.sendPort, 10) || 9000; // Port where REAPER sends VU packets to us

    // State (Read-Only)
    this.connected = false;
    this.lastMessageTime = 0;
    this.leftVu = 0;
    this.rightVu = 0;
    this.leftPeak = -60;
    this.rightPeak = -60;
    this.leftHold = -60;
    this.rightHold = -60;
    this.leftRms = -60;
    this.rightRms = -60;
    this.isPlaying = false;
    this.isRecording = false;

    this.server = null;
    this._heartbeatInterval = null;
    this._holdDecayInterval = null;
  }

  /**
   * Convert normalized linear float (0.0–1.0) to dBFS.
   */
  linearToDb(value) {
    if (value <= 0.0001) return -60;
    const db = 20 * Math.log10(value);
    return Math.max(-60, Math.min(12, db));
  }

  updateConfig(config = {}) {
    const newSendPort = parseInt(config.sendPort, 10) || 9000;
    if (newSendPort !== this.sendPort) {
      console.log(`[REAPER-OSC] Updating listen port to ${newSendPort}`);
      this.stop();
      this.sendPort = newSendPort;
      this.start().catch((err) => console.error('[REAPER-OSC] Restart failed:', err.message));
    }
  }

  start() {
    return new Promise((resolve, reject) => {
      try {
        // Pure passive UDP listener for incoming REAPER VU meter packets
        this.server = new OscServer(this.sendPort, '0.0.0.0', () => {
          console.log(`[REAPER-OSC] Passive telemetry listener active on port ${this.sendPort}`);
          resolve();
        });

        this.server.on('message', (msg) => {
          this.lastMessageTime = Date.now();
          this.connected = true;
          this._handleMessage(msg);
        });

        this.server.on('error', (err) => {
          console.error('[REAPER-OSC] Server error:', err.message);
        });

        // Heartbeat: check if REAPER is still sending data
        this._heartbeatInterval = setInterval(() => {
          if (Date.now() - this.lastMessageTime > 5000) {
            if (this.connected) {
              console.log('[REAPER-OSC] No data from REAPER for 5s — marking disconnected');
            }
            this.connected = false;
            this.leftPeak = -60;
            this.rightPeak = -60;
            this.leftRms = -60;
            this.rightRms = -60;
          }
        }, 2000);

        // Peak hold decay: decrease hold by 2dB/sec (runs at 10Hz)
        this._holdDecayInterval = setInterval(() => {
          this.leftHold = Math.max(-60, this.leftHold - 0.2);
          this.rightHold = Math.max(-60, this.rightHold - 0.2);

          if (this.leftPeak > this.leftHold) this.leftHold = this.leftPeak;
          if (this.rightPeak > this.rightHold) this.rightHold = this.rightPeak;
        }, 100);

      } catch (err) {
        console.error('[REAPER-OSC] Failed to start:', err.message);
        reject(err);
      }
    });
  }

  _handleMessage(msg) {
    const [address, ...args] = msg;
    const value = args[0];

    switch (address) {
      case '/master/vu/L':
        this.leftVu = value;
        this.leftPeak = this.linearToDb(value);
        this.leftRms = this.leftPeak - 6;
        break;

      case '/master/vu/R':
        this.rightVu = value;
        this.rightPeak = this.linearToDb(value);
        this.rightRms = this.rightPeak - 6;
        break;

      case '/master/vu':
        if (!this.leftVu && !this.rightVu) {
          this.leftPeak = this.linearToDb(value);
          this.rightPeak = this.linearToDb(value);
        }
        break;

      case '/play':
        this.isPlaying = value === 1 || value === true;
        break;

      case '/record':
        this.isRecording = value === 1 || value === true;
        break;

      case '/stop':
        if (value === 1) {
          this.isPlaying = false;
        }
        break;
    }
  }

  getState() {
    return {
      connected: this.connected,
      leftDb: Math.round(this.leftPeak * 10) / 10,
      rightDb: Math.round(this.rightPeak * 10) / 10,
      leftHold: Math.round(this.leftHold * 10) / 10,
      rightHold: Math.round(this.rightHold * 10) / 10,
      leftRms: Math.round(this.leftRms * 10) / 10,
      rightRms: Math.round(this.rightRms * 10) / 10,
      isPlaying: this.isPlaying,
      isRecording: this.isRecording,
    };
  }

  stop() {
    if (this._heartbeatInterval) clearInterval(this._heartbeatInterval);
    if (this._holdDecayInterval) clearInterval(this._holdDecayInterval);
    if (this.server) {
      try { this.server.close(); } catch (_) {}
      this.server = null;
    }
    console.log('[REAPER-OSC] Stopped');
  }
}

module.exports = ReaperOSC;
