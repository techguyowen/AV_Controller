/**
 * modules/ptzoptics.js
 * PTZOptics VISCA-over-IP & HTTP Camera Control Module
 *
 * Supports multi-camera control (optimized for 2-camera church setups: Cam 1 & Cam 2).
 * Dual-protocol support:
 * 1. VISCA-over-IP (UDP port 1259) — Low-latency broadcast standard (<2ms)
 * 2. HTTP CGI API (/cgi-bin/ptzctrl.cgi) — Fallback web control
 */

const dgram = require('dgram');
const http = require('http');

class PTZCamera {
  /**
   * @param {Object} options
   * @param {string} options.id - Camera identifier ('cam1', 'cam2')
   * @param {string} options.name - Friendly name ('Camera 1 - Center / Pulpit')
   * @param {string} options.ip - Camera IP address (e.g. '192.168.1.101')
   * @param {number} [options.port=1259] - VISCA UDP port (default 1259)
   * @param {number} [options.httpPort=80] - HTTP CGI port (default 80)
   * @param {Array} [options.presets] - Custom preset names [{ id: 1, name: 'Pulpit' }, ...]
   */
  constructor(options = {}) {
    this.id = options.id || 'cam1';
    this.name = options.name || 'Camera 1';
    this.ip = options.ip || '192.168.1.101';
    this.port = options.port || 1259;
    this.httpPort = options.httpPort || 80;
    this.presets = options.presets || this._defaultPresets();
    this.speed = options.speed || 12; // Default pan/tilt speed (1-24)
    this.zoomSpeed = options.zoomSpeed || 4; // Default zoom speed (1-7)

    this.connected = false;
    this.lastAction = 'idle';
    this.lastPreset = null;
    this.sequenceNumber = 1;

    this._socket = null;
    this._initSocket();
  }

  _defaultPresets() {
    return [
      { id: 1, name: 'Pulpit / Pastor' },
      { id: 2, name: 'Full Sanctuary Wide' },
      { id: 3, name: 'Lectern / Reader' },
      { id: 4, name: 'Piano / Keys' },
      { id: 5, name: 'Choir / Worship Team' },
      { id: 6, name: 'Altar / Communion' },
      { id: 7, name: 'Baptistry' },
      { id: 8, name: 'Audience / Congregation' },
    ];
  }

  _initSocket() {
    if (this._socket) {
      try { this._socket.close(); } catch (e) {}
    }
    this._socket = dgram.createSocket('udp4');
    this._socket.on('error', (err) => {
      console.warn(`[PTZ:${this.id}] UDP Socket error: ${err.message}`);
    });
  }

  updateConfig(options = {}) {
    if (options.name) this.name = options.name;
    if (options.ip && options.ip !== this.ip) {
      this.ip = options.ip;
      console.log(`[PTZ:${this.id}] Updated IP to ${this.ip}`);
    }
    if (options.port) this.port = options.port;
    if (options.httpPort) this.httpPort = options.httpPort;
    if (options.presets) this.presets = options.presets;
    if (options.speed) this.speed = options.speed;
  }

  /**
   * Send VISCA over IP UDP packet
   * VISCA over IP header (8 bytes):
   * [0x01, 0x00] Payload type (0x0100 = VISCA command, 0x0110 = VISCA inquiry)
   * [0x00, length] Payload length
   * [seq3, seq2, seq1, seq0] Sequence number (4 bytes)
   * Followed by VISCA payload (starts with 0x81, ends with 0xFF)
   * @param {Buffer|Array<number>} viscaPayload
   */
  sendVisca(viscaPayload) {
    return new Promise((resolve) => {
      const payloadBuf = Buffer.isBuffer(viscaPayload) ? viscaPayload : Buffer.from(viscaPayload);
      const header = Buffer.alloc(8);
      
      // Payload type: 0x0100 (VISCA command)
      header.writeUInt16BE(0x0100, 0);
      // Payload length
      header.writeUInt16BE(payloadBuf.length, 2);
      // Sequence number
      header.writeUInt32BE(this.sequenceNumber++, 4);

      const packet = Buffer.concat([header, payloadBuf]);

      if (!this._socket) this._initSocket();

      this._socket.send(packet, 0, packet.length, this.port, this.ip, (err) => {
        if (err) {
          console.warn(`[PTZ:${this.id}] UDP send error to ${this.ip}:${this.port}: ${err.message}`);
          // Attempt HTTP fallback
          resolve({ success: false, error: err.message });
        } else {
          this.connected = true;
          resolve({ success: true });
        }
      });
    });
  }

  /**
   * Send HTTP CGI Command (Fallback)
   * @param {string} command
   */
  sendHttpCgi(command) {
    return new Promise((resolve) => {
      try {
        const path = `/cgi-bin/ptzctrl.cgi?ptzcmd&${command}`;
        const req = http.request({
          hostname: this.ip,
          port: this.httpPort,
          path,
          method: 'GET',
          timeout: 2000,
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ success: res.statusCode === 200, response: data }));
        });

        req.on('error', (err) => resolve({ success: false, error: err.message }));
        req.on('timeout', () => {
          req.destroy();
          resolve({ success: false, error: 'Timeout' });
        });
        req.end();
      } catch (err) {
        resolve({ success: false, error: err.message });
      }
    });
  }

  /**
   * Pan / Tilt Movement
   * @param {string} direction - 'left'|'right'|'up'|'down'|'upleft'|'upright'|'downleft'|'downright'|'stop'
   * @param {number} [customSpeed] - 1 (slowest) to 24 (fastest)
   */
  async panTilt(direction = 'stop', customSpeed = null) {
    const speed = Math.max(1, Math.min(24, customSpeed || this.speed));
    const pSpeed = speed; // Pan speed 1-24
    const tSpeed = Math.max(1, Math.min(20, Math.round(speed * 0.85))); // Tilt speed 1-20

    let pDir = 0x03; // Stop
    let tDir = 0x03; // Stop

    switch (direction.toLowerCase()) {
      case 'left': pDir = 0x01; tDir = 0x03; break;
      case 'right': pDir = 0x02; tDir = 0x03; break;
      case 'up': pDir = 0x03; tDir = 0x01; break;
      case 'down': pDir = 0x03; tDir = 0x02; break;
      case 'upleft': pDir = 0x01; tDir = 0x01; break;
      case 'upright': pDir = 0x02; tDir = 0x01; break;
      case 'downleft': pDir = 0x01; tDir = 0x02; break;
      case 'downright': pDir = 0x02; tDir = 0x02; break;
      case 'stop': default: pDir = 0x03; tDir = 0x03; break;
    }

    this.lastAction = direction === 'stop' ? 'idle' : `moving_${direction}`;

    // VISCA: 81 01 06 01 [pSpeed] [tSpeed] [pDir] [tDir] FF
    const viscaCmd = [0x81, 0x01, 0x06, 0x01, pSpeed, tSpeed, pDir, tDir, 0xFF];
    const res = await this.sendVisca(viscaCmd);

    // If VISCA UDP failed, execute HTTP fallback
    if (!res.success && direction !== 'stop') {
      const httpCmd = `${direction}&${pSpeed}&${tSpeed}`;
      this.sendHttpCgi(httpCmd).catch(() => {});
    } else if (!res.success && direction === 'stop') {
      this.sendHttpCgi('ptzstop').catch(() => {});
    }

    return { success: true, camera: this.id, action: 'pan_tilt', direction, speed };
  }

  /**
   * Zoom Control
   * @param {string} action - 'in'|'tele'|'out'|'wide'|'stop'
   * @param {number} [customSpeed] - 1 (slow) to 7 (fast)
   */
  async zoom(action = 'stop', customSpeed = null) {
    const speed = Math.max(0, Math.min(7, customSpeed || this.zoomSpeed));
    let viscaCmd;

    switch (action.toLowerCase()) {
      case 'in':
      case 'tele':
        viscaCmd = [0x81, 0x01, 0x04, 0x07, 0x20 + (speed & 0x07), 0xFF];
        this.lastAction = 'zooming_in';
        break;
      case 'out':
      case 'wide':
        viscaCmd = [0x81, 0x01, 0x04, 0x07, 0x30 + (speed & 0x07), 0xFF];
        this.lastAction = 'zooming_out';
        break;
      case 'stop':
      default:
        viscaCmd = [0x81, 0x01, 0x04, 0x07, 0x00, 0xFF];
        this.lastAction = 'idle';
        break;
    }

    const res = await this.sendVisca(viscaCmd);
    if (!res.success) {
      if (action === 'in' || action === 'tele') this.sendHttpCgi(`zoomin&${speed}`).catch(() => {});
      else if (action === 'out' || action === 'wide') this.sendHttpCgi(`zoomout&${speed}`).catch(() => {});
      else this.sendHttpCgi('ptzstop').catch(() => {});
    }

    return { success: true, camera: this.id, action: 'zoom', zoomAction: action, speed };
  }

  /**
   * Focus Control
   * @param {string} action - 'auto'|'manual'|'near'|'far'|'stop'
   */
  async focus(action = 'auto') {
    let viscaCmd;
    switch (action.toLowerCase()) {
      case 'auto':
        viscaCmd = [0x81, 0x01, 0x04, 0x38, 0x02, 0xFF];
        break;
      case 'manual':
        viscaCmd = [0x81, 0x01, 0x04, 0x38, 0x03, 0xFF];
        break;
      case 'near':
        viscaCmd = [0x81, 0x01, 0x04, 0x08, 0x03, 0xFF];
        break;
      case 'far':
        viscaCmd = [0x81, 0x01, 0x04, 0x08, 0x02, 0xFF];
        break;
      case 'stop':
      default:
        viscaCmd = [0x81, 0x01, 0x04, 0x08, 0x00, 0xFF];
        break;
    }

    await this.sendVisca(viscaCmd);
    return { success: true, camera: this.id, action: 'focus', focusAction: action };
  }

  /**
   * Recall Preset Position (1 to 16)
   * @param {number} presetNumber - 1-indexed preset number
   */
  async recallPreset(presetNumber) {
    const num = Math.max(1, Math.min(16, parseInt(presetNumber, 10) || 1));
    const viscaNum = num - 1; // 0-indexed in VISCA standard

    console.log(`[PTZ:${this.id}] 🎯 Recalling Preset ${num} on ${this.name}...`);

    // VISCA: 81 01 04 3F 02 [presetNumber] FF
    const viscaCmd = [0x81, 0x01, 0x04, 0x3F, 0x02, viscaNum, 0xFF];
    const res = await this.sendVisca(viscaCmd);

    if (!res.success) {
      this.sendHttpCgi(`poscall&${num}`).catch(() => {});
    }

    this.lastPreset = num;
    this.lastAction = `preset_${num}`;

    const presetObj = this.presets.find(p => p.id === num);
    const presetName = presetObj ? presetObj.name : `Preset ${num}`;

    return {
      success: true,
      camera: this.id,
      cameraName: this.name,
      preset: num,
      presetName,
      message: `Recalled ${presetName} on ${this.name}`,
    };
  }

  /**
   * Store / Save Current Position as Preset (1 to 16)
   * @param {number} presetNumber
   * @param {string} [name]
   */
  async savePreset(presetNumber, name = null) {
    const num = Math.max(1, Math.min(16, parseInt(presetNumber, 10) || 1));
    const viscaNum = num - 1;

    console.log(`[PTZ:${this.id}] 💾 Saving Preset ${num} (${name || 'Custom'}) on ${this.name}...`);

    // VISCA: 81 01 04 3F 01 [presetNumber] FF
    const viscaCmd = [0x81, 0x01, 0x04, 0x3F, 0x01, viscaNum, 0xFF];
    const res = await this.sendVisca(viscaCmd);

    if (!res.success) {
      this.sendHttpCgi(`posset&${num}`).catch(() => {});
    }

    if (name) {
      const idx = this.presets.findIndex(p => p.id === num);
      if (idx >= 0) this.presets[idx].name = name;
      else this.presets.push({ id: num, name });
    }

    return {
      success: true,
      camera: this.id,
      cameraName: this.name,
      preset: num,
      name: name || `Preset ${num}`,
      message: `Saved position to Preset ${num} on ${this.name}`,
    };
  }

  /**
   * Capture a live frame snapshot from camera HTTP server and save as preset thumbnail
   * @param {number} presetNumber
   */
  async captureSnapshot(presetNumber) {
    const fs = require('fs');
    const path = require('path');
    const presetsDir = path.join(__dirname, '..', 'public', 'presets');
    if (!fs.existsSync(presetsDir)) fs.mkdirSync(presetsDir, { recursive: true });

    const targetFile = path.join(presetsDir, `${this.id}_preset${presetNumber}.jpg`);
    const snapshotUrl = `http://${this.ip}:${this.httpPort}/snapshot.jpg`;

    return new Promise((resolve) => {
      const req = http.get(snapshotUrl, { timeout: 3000 }, (res) => {
        if (res.statusCode === 200) {
          const chunks = [];
          res.on('data', chunk => chunks.push(chunk));
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            fs.writeFileSync(targetFile, buffer);
            console.log(`[PTZ:${this.id}] 📸 Captured live snapshot for Preset ${presetNumber}`);
            resolve({ success: true, camera: this.id, preset: presetNumber, imageUrl: `/presets/${this.id}_preset${presetNumber}.jpg?t=${Date.now()}` });
          });
        } else {
          resolve({ success: false, camera: this.id, preset: presetNumber, error: `Camera returned HTTP ${res.statusCode}`, fallbackUrl: `/presets/${this.id}_preset${presetNumber}.svg` });
        }
      });
      req.on('error', (err) => {
        resolve({ success: false, camera: this.id, preset: presetNumber, error: err.message, fallbackUrl: `/presets/${this.id}_preset${presetNumber}.svg` });
      });
    });
  }

  getState() {
    return {
      id: this.id,
      name: this.name,
      ip: this.ip,
      port: this.port,
      connected: this.connected,
      speed: this.speed,
      zoomSpeed: this.zoomSpeed,
      lastAction: this.lastAction,
      lastPreset: this.lastPreset,
      presets: this.presets,
    };
  }

  stop() {
    if (this._socket) {
      try { this._socket.close(); } catch (e) {}
      this._socket = null;
    }
  }
}

class PTZOpticsManager {
  constructor(config = {}) {
    this.cameras = new Map();
    this.activeCameraId = 'cam1';
    this.updateConfig(config);
  }

  updateConfig(config = {}) {
    const camList = config.ptzCameras || [
      {
        id: 'cam1',
        name: 'Camera 1 (Pulpit / Stage)',
        ip: config.cam1Ip || '192.168.1.101',
        port: 1259,
        presets: [
          { id: 1, name: 'Pulpit / Pastor' },
          { id: 2, name: 'Wide Stage' },
          { id: 3, name: 'Lectern' },
          { id: 4, name: 'Piano / Keys' },
          { id: 5, name: 'Worship Leader' },
          { id: 6, name: 'Altar Table' },
        ]
      },
      {
        id: 'cam2',
        name: 'Camera 2 (Wide Sanctuary)',
        ip: config.cam2Ip || '192.168.1.102',
        port: 1259,
        presets: [
          { id: 1, name: 'Full Sanctuary Wide' },
          { id: 2, name: 'Congregation Center' },
          { id: 3, name: 'Choir Loft' },
          { id: 4, name: 'Baptistry' },
          { id: 5, name: 'Center Aisle' },
          { id: 6, name: 'Soundbooth / Balcony' },
        ]
      }
    ];

    // Initialize or update each camera
    for (const camOpts of camList) {
      if (this.cameras.has(camOpts.id)) {
        this.cameras.get(camOpts.id).updateConfig(camOpts);
      } else {
        this.cameras.set(camOpts.id, new PTZCamera(camOpts));
      }
    }
  }

  getCamera(id = null) {
    const targetId = id || this.activeCameraId || 'cam1';
    return this.cameras.get(targetId) || this.cameras.values().next().value;
  }

  setActiveCamera(id) {
    if (this.cameras.has(id)) {
      this.activeCameraId = id;
      return true;
    }
    return false;
  }

  async panTilt(cameraId, direction, speed) {
    const cam = this.getCamera(cameraId);
    if (!cam) throw new Error(`Camera ${cameraId} not found`);
    return await cam.panTilt(direction, speed);
  }

  async zoom(cameraId, action, speed) {
    const cam = this.getCamera(cameraId);
    if (!cam) throw new Error(`Camera ${cameraId} not found`);
    return await cam.zoom(action, speed);
  }

  async focus(cameraId, action) {
    const cam = this.getCamera(cameraId);
    if (!cam) throw new Error(`Camera ${cameraId} not found`);
    return await cam.focus(action);
  }

  async recallPreset(cameraId, presetNumber) {
    const cam = this.getCamera(cameraId);
    if (!cam) throw new Error(`Camera ${cameraId} not found`);
    return await cam.recallPreset(presetNumber);
  }

  async savePreset(cameraId, presetNumber, name) {
    const cam = this.getCamera(cameraId);
    if (!cam) throw new Error(`Camera ${cameraId} not found`);
    return await cam.savePreset(presetNumber, name);
  }

  async captureSnapshot(cameraId, presetNumber) {
    const cam = this.getCamera(cameraId);
    if (!cam) throw new Error(`Camera ${cameraId} not found`);
    return await cam.captureSnapshot(presetNumber);
  }

  getState() {
    const cameraStates = [];
    for (const cam of this.cameras.values()) {
      cameraStates.push(cam.getState());
    }
    return {
      activeCameraId: this.activeCameraId,
      cameras: cameraStates,
    };
  }

  stop() {
    for (const cam of this.cameras.values()) {
      cam.stop();
    }
  }
}

module.exports = {
  PTZOpticsManager,
  PTZCamera,
};
