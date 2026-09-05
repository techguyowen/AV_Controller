/**
 * modules/captioner.js
 * VoxStream Live Captioner PRO Client for Sanctuary AV Controller
 *
 * Connects to the local VoxStream REST & WebSocket API (default port 8765).
 * Supports real-time live caption streaming, emergency screen & projector restore,
 * panic muting, audio device monitoring, and automated troubleshooting diagnostics.
 */

const http = require('http');
const WebSocket = require('ws');

class CaptionerClient {
  /**
   * @param {Object} config
   * @param {string} [config.apiUrl='http://127.0.0.1:8765'] - Base URL of VoxStream API
   * @param {string} [config.apiKey=''] - Optional API Key
   * @param {number} [config.targetMonitorIndex=1] - Default monitor index (1 = LONTIUM screen)
   * @param {string} [config.defaultMixType='preview'] - Default mix type ('preview' | 'program')
   * @param {boolean} [config.enabled=true] - Whether captioner client is enabled
   */
  constructor(config = {}) {
    this.updateConfig(config);

    this.connected = false;
    this.isCapturing = false;
    this.statusText = 'Standby';
    this.lastTranscript = '';
    this.interimTranscript = '';
    this.activeScripture = null;
    this.audioDb = null;
    this.lastError = null;
    this.uptime = 0;
    this.activeConnections = 0;

    // Speaking pace & WPM statistics
    this.currentWpm = 0;
    this.sessionWpm = 0;
    this.totalWords = 0;
    this.activeSpeakingSeconds = 0;
    this.totalLines = 0;
    this.paceRating = 'Normal';
    this.paceColor = '#10B981';

    this._pollInterval = null;
    this._ws = null;
    this._wsReconnectTimer = null;
  }

  updateConfig(config = {}) {
    const oldUrl = this.apiUrl;
    this.apiUrl = (config.captionerApiUrl || config.apiUrl || 'http://127.0.0.1:8765').replace(/\/+$/, '');
    this.apiKey = config.captionerApiKey || config.apiKey || '';
    this.targetMonitorIndex = parseInt(config.captionerMonitorIndex || config.targetMonitorIndex || 1, 10);
    this.defaultMixType = config.captionerMixType || config.defaultMixType || 'preview';
    this.enabled = config.captionerEnabled !== false && config.enabled !== false;

    if (oldUrl && oldUrl !== this.apiUrl && this.enabled) {
      console.log(`[VoxStream] API URL updated to ${this.apiUrl}, reconnecting WebSocket...`);
      this._connectWebSocket();
    }
  }

  start() {
    if (this._pollInterval) clearInterval(this._pollInterval);
    
    // Initial status poll & recurring 3s check
    this._pollStatus();
    this._pollInterval = setInterval(() => {
      if (this.enabled) {
        this._pollStatus();
      }
    }, 3000);

    // Connect real-time WebSocket for live caption stream
    this._connectWebSocket();

    console.log(`[VoxStream] Live Captioner client initialized (${this.apiUrl})`);
  }

  stop() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
    if (this._wsReconnectTimer) {
      clearTimeout(this._wsReconnectTimer);
      this._wsReconnectTimer = null;
    }
    if (this._ws) {
      this._ws.terminate();
      this._ws = null;
    }
  }

  /**
   * Connect to VoxStream real-time WebSocket stream (ws://127.0.0.1:8765/ws)
   * @private
   */
  _connectWebSocket() {
    if (!this.enabled) return;
    if (this._ws) {
      try { this._ws.terminate(); } catch (e) {}
      this._ws = null;
    }

    try {
      const parsedUrl = new URL(this.apiUrl);
      const protocol = parsedUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${parsedUrl.host}/ws`;

      this._ws = new WebSocket(wsUrl);

      this._ws.on('open', () => {
        console.log(`[VoxStream] ✓ Live Caption stream WebSocket connected (${wsUrl})`);
        this.connected = true;
      });

      this._ws.on('message', (data) => {
        try {
          const event = JSON.parse(data.toString());
          this._handleWsEvent(event);
        } catch (err) {
          // Plain text or non-json message
          if (data && data.length > 0) {
            this.lastTranscript = data.toString();
          }
        }
      });

      this._ws.on('error', (err) => {
        // Suppress noisy logs when VoxStream is offline
      });

      this._ws.on('close', () => {
        this._scheduleWsReconnect();
      });
    } catch (err) {
      this._scheduleWsReconnect();
    }
  }

  /**
   * Handle incoming WebSocket events from VoxStream
   * @private
   */
  _handleWsEvent(event) {
    if (!event) return;
    this.connected = true;

    // 1. Snapshot with history lines array
    if (event.type === 'snapshot' && Array.isArray(event.lines) && event.lines.length > 0) {
      const lastLine = event.lines[event.lines.length - 1];
      if (lastLine && lastLine.text) {
        this.lastTranscript = lastLine.text;
      }
      this.isCapturing = true;
      this.statusText = 'Capturing';
      return;
    }

    // 2. Direct Caption stream (interim or final)
    if (event.text !== undefined || event.type === 'caption') {
      const text = event.text || '';
      if (event.is_final) {
        this.lastTranscript = text;
        this.interimTranscript = '';
      } else {
        this.interimTranscript = text;
      }
      this.isCapturing = true;
      this.statusText = 'Capturing';
      return;
    }

    // 3. Scripture popups
    if (event.type === 'scripture') {
      if (event.action === 'show') {
        this.activeScripture = {
          citation: event.citation,
          version: event.version,
          text: event.text,
          duration: event.duration_seconds || 16,
        };
      } else if (event.action === 'dismiss') {
        this.activeScripture = null;
      }
      return;
    }

    // 4. Clear event
    if (event.type === 'clear') {
      this.lastTranscript = '';
      this.interimTranscript = '';
      this.activeScripture = null;
      return;
    }

    // 5. Status event
    if (event.type === 'status' || event.is_running !== undefined) {
      this.isCapturing = Boolean(event.is_capturing || event.running || event.is_running);
      this.statusText = this.isCapturing ? 'Capturing' : 'Idle';
    }
  }

  _scheduleWsReconnect() {
    if (this._wsReconnectTimer) clearTimeout(this._wsReconnectTimer);
    this._wsReconnectTimer = setTimeout(() => {
      if (this.enabled) {
        this._connectWebSocket();
      }
    }, 5000);
  }

  /**
   * Internal HTTP request helper
   * @private
   */
  _request(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
      try {
        const parsedUrl = new URL(`${this.apiUrl}${path}`);
        const payload = data ? JSON.stringify(data) : null;

        const headers = {
          'Content-Type': 'application/json',
        };

        if (this.apiKey) {
          headers['Authorization'] = `Bearer ${this.apiKey}`;
          headers['X-API-Key'] = this.apiKey;
        }

        if (payload) {
          headers['Content-Length'] = Buffer.byteLength(payload);
        }

        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method,
          headers,
          timeout: 4000,
        };

        const req = http.request(options, (res) => {
          let resBody = '';
          res.on('data', chunk => { resBody += chunk; });
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const json = resBody ? JSON.parse(resBody) : { success: true };
                resolve(json);
              } catch (e) {
                resolve({ success: true, text: resBody });
              }
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${resBody || res.statusMessage}`));
            }
          });
        });

        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('Request timed out'));
        });

        if (payload) req.write(payload);
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Poll VoxStream status (/api/status)
   * @private
   */
  async _pollStatus() {
    if (!this.enabled) {
      this.connected = false;
      return;
    }

    try {
      const res = await this._request('/api/status', 'GET');
      this.connected = true;
      this.isCapturing = Boolean(res.is_running || res.is_capturing || res.isCapturing || res.capturing || res.running || res.active);
      this.statusText = this.isCapturing ? 'Capturing' : 'Idle';
      this.uptime = res.uptime_seconds || res.uptime || this.uptime;
      this.activeConnections = res.active_connections || res.connections || (this.connected ? 1 : 0);
      
      if (res.last_transcript || res.lastTranscript) {
        this.lastTranscript = res.last_transcript || res.lastTranscript;
      }
      this.lastError = null;

      // Poll speech stats (WPM, Pace, Word Count)
      try {
        const stats = await this._request('/api/transcript/stats', 'GET');
        if (stats && typeof stats === 'object') {
          this.currentWpm = typeof stats.current_wpm === 'number' ? Math.round(stats.current_wpm * 10) / 10 : this.currentWpm;
          this.sessionWpm = typeof stats.session_wpm === 'number' ? Math.round(stats.session_wpm * 10) / 10 : this.sessionWpm;
          this.totalWords = stats.total_words ?? this.totalWords;
          this.activeSpeakingSeconds = stats.active_speaking_seconds ?? this.activeSpeakingSeconds;
          this.totalLines = stats.total_lines ?? this.totalLines;
          this.paceRating = stats.pace_rating || this.paceRating;
          this.paceColor = stats.pace_color || this.paceColor;
        }
      } catch (statsErr) {
        // Suppress stats error
      }
    } catch (err) {
      this.connected = false;
      this.isCapturing = false;
      this.statusText = 'Offline';
    }
  }

  /**
   * Emergency Trigger: Forcefully Reopen Screen & Resume Captions
   * Calls POST /api/control/reopen-screen on VoxStream
   */
  async reopenScreen(options = {}) {
    const monitor_index = options.monitor_index !== undefined ? parseInt(options.monitor_index, 10) : this.targetMonitorIndex;
    const mix_type = options.mix_type || this.defaultMixType;

    const payload = {
      monitor_index,
      mix_type,
    };

    console.log(`[VoxStream] 📺 Restoring Display (Monitor ${monitor_index}, Mix: ${mix_type})...`);

    try {
      const res = await this._request('/api/control/reopen-screen', 'POST', payload);
      this.connected = true;
      this.isCapturing = true;
      this.statusText = 'Capturing';
      return {
        success: true,
        message: `LONTIUM Screen (Monitor ${monitor_index}) & Captions Restored`,
        data: res,
      };
    } catch (err) {
      return {
        success: false,
        error: `VoxStream API error at ${this.apiUrl}: ${err.message}`,
      };
    }
  }

  /**
   * Clear active captions preview and transcript history on VoxStream
   */
  async clear() {
    console.log(`[VoxStream] 🧹 Clearing active captions and transcript history...`);
    this.lastTranscript = '';
    this.interimTranscript = '';
    this.activeScripture = null;
    try {
      await this._request('/api/transcript/clear', 'POST', {}).catch(() => {});
      const res = await this._request('/api/control/panic', 'POST', {}).catch(() => {});
      // Resume capturing immediately so the engine stays active with a clean canvas
      await this._request('/api/control/start', 'POST', {}).catch(() => {});
      this.isCapturing = true;
      this.statusText = 'Capturing';
      return { success: true, message: 'Captions Preview & History Cleared', data: res };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Emergency Panic Button: Immediately blanks captions, mutes output, and stops stream
   */
  async panic() {
    console.log(`[VoxStream] 🚨 PANIC TRIGGERED — Blanking captions and muting output...`);
    try {
      const res = await this._request('/api/control/panic', 'POST', {});
      this.isCapturing = false;
      this.statusText = 'Panicked / Muted';
      this.lastTranscript = '';
      this.interimTranscript = '';
      this.activeScripture = null;
      return { success: true, message: 'Captions Panic Triggered: Screens Blanked & Muted', data: res };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Start/Resume Caption Broadcasting
   */
  async startCaptions() {
    try {
      const res = await this._request('/api/control/start', 'POST', {});
      this.isCapturing = true;
      this.statusText = 'Capturing';
      return { success: true, message: 'Live Captions Started', data: res };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Pause/Stop Caption Broadcasting
   */
  async stopCaptions() {
    try {
      const res = await this._request('/api/control/stop', 'POST', {});
      this.isCapturing = false;
      this.statusText = 'Stopped';
      return { success: true, message: 'Live Captions Stopped', data: res };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Toggle Live State
   */
  async toggleCaptions() {
    try {
      const res = await this._request('/api/control/toggle', 'POST', {});
      this.isCapturing = !this.isCapturing;
      this.statusText = this.isCapturing ? 'Capturing' : 'Stopped';
      return { success: true, isCapturing: this.isCapturing, data: res };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Query connected OBS monitors from VoxStream (/api/obs/monitors)
   */
  async getObsMonitors() {
    try {
      const res = await this._request('/api/obs/monitors', 'GET');
      return { success: true, monitors: res.monitors || res || [] };
    } catch (err) {
      return { success: false, error: err.message, monitors: [] };
    }
  }

  /**
   * Query system audio devices from VoxStream (/api/devices)
   */
  async getAudioDevices() {
    try {
      const res = await this._request('/api/devices', 'GET');
      return { success: true, devices: res.devices || res || [] };
    } catch (err) {
      return { success: false, error: err.message, devices: [] };
    }
  }

  /**
   * Deep Diagnostics & Troubleshooting for Reported Issues
   */
  async diagnose() {
    const report = {
      timestamp: new Date().toISOString(),
      apiUrl: this.apiUrl,
      overallStatus: 'healthy',
      checks: [],
      troubleshootingAdvice: [],
    };

    // Check 1: REST API Connection
    try {
      const statusRes = await this._request('/api/status', 'GET');
      report.checks.push({
        name: 'VoxStream REST API Reachability',
        status: 'pass',
        detail: `Connected to ${this.apiUrl} (Uptime: ${statusRes.uptime || 0}s, Capturing: ${Boolean(statusRes.is_capturing || statusRes.running)})`,
      });
    } catch (err) {
      report.overallStatus = 'error';
      report.checks.push({
        name: 'VoxStream REST API Reachability',
        status: 'fail',
        detail: `Could not connect to ${this.apiUrl}: ${err.message}`,
      });
      report.troubleshootingAdvice.push(
        `Ensure VoxStream is running on port 8765. If running on a different port, update the Captioner Suite API URL in Settings Tab 2.`
      );
    }

    // Check 2: Audio Devices
    try {
      const devRes = await this.getAudioDevices();
      if (devRes.success && Array.isArray(devRes.devices) && devRes.devices.length > 0) {
        report.checks.push({
          name: 'Audio Device Enumeration',
          status: 'pass',
          detail: `Detected ${devRes.devices.length} audio input devices (ASIO/WASAPI/CoreAudio)`,
        });
      } else {
        report.checks.push({
          name: 'Audio Device Enumeration',
          status: 'warn',
          detail: 'No active audio devices reported by VoxStream',
        });
        report.troubleshootingAdvice.push(
          'Check that your audio interface (Soundcraft Si USB / REAPER Virtual Cable) is plugged in and recognized.'
        );
      }
    } catch (err) {
      report.checks.push({
        name: 'Audio Device Enumeration',
        status: 'fail',
        detail: err.message,
      });
    }

    // Check 3: Connected OBS Monitors
    try {
      const monRes = await this.getObsMonitors();
      if (monRes.success && Array.isArray(monRes.monitors) && monRes.monitors.length > 0) {
        report.checks.push({
          name: 'OBS Display Projectors',
          status: 'pass',
          detail: `Detected ${monRes.monitors.length} displays. Target Screen = Monitor ${this.targetMonitorIndex}`,
        });
      } else {
        report.checks.push({
          name: 'OBS Display Projectors',
          status: 'warn',
          detail: 'Could not query OBS monitor list from VoxStream',
        });
        report.troubleshootingAdvice.push(
          'Check that OBS Studio is open and WebSocket v5 is enabled on port 4455.'
        );
      }
    } catch (err) {
      report.checks.push({
        name: 'OBS Display Projectors',
        status: 'fail',
        detail: err.message,
      });
    }

    return report;
  }

  /**
   * Get current state
   * @returns {Object}
   */
  getState() {
    return {
      enabled: this.enabled,
      connected: this.connected,
      isCapturing: this.isCapturing,
      statusText: this.statusText,
      apiUrl: this.apiUrl,
      targetMonitorIndex: this.targetMonitorIndex,
      defaultMixType: this.defaultMixType,
      lastTranscript: this.lastTranscript,
      interimTranscript: this.interimTranscript,
      activeScripture: this.activeScripture,
      uptime: this.uptime,
      activeConnections: this.activeConnections,
      currentWpm: this.currentWpm,
      sessionWpm: this.sessionWpm,
      totalWords: this.totalWords,
      activeSpeakingSeconds: this.activeSpeakingSeconds,
      totalLines: this.totalLines,
      paceRating: this.paceRating,
      paceColor: this.paceColor,
    };
  }
}

module.exports = CaptionerClient;
