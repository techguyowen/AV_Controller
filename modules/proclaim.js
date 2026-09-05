/**
 * modules/proclaim.js
 * Faithlife Proclaim health monitoring module
 *
 * Connects to the Proclaim remote REST API on the local network.
 * Authenticates with a network password and polls for status.
 */

const http = require('http');

class ProclaimMonitor {
  /**
   * Initialize ProclaimMonitor
   * @param {Object} config - Configuration object
   */
  constructor(config = {}) {
    this.host = (config.proclaimHost || config.host || '').trim();
    this.port = parseInt(config.proclaimPort || config.port, 10) || 52195;
    this.password = config.proclaimPassword || '';

    // State (Passive on-air monitoring only)
    this.connected = false;
    this.onAir = false;
    this.currentServiceItem = '';
    this.currentSlideIndex = 0;

    this.authToken = null;
    this._pollInterval = null;
    this._isPolling = false;
  }

  /**
   * Update configuration at runtime
   * @param {Object} config - New configuration object
   */
  updateConfig(config = {}) {
    const newHost = (config.proclaimHost || config.host || '').trim();
    const newPort = parseInt(config.proclaimPort || config.port, 10) || this.port;
    const newPassword = config.proclaimPassword !== undefined ? config.proclaimPassword : this.password;

    let changed = false;
    if (newHost !== this.host || newPort !== this.port || newPassword !== this.password) {
      changed = true;
      console.log(`[Proclaim] Updated configuration. Host: ${newHost ? `${newHost}:${newPort}` : 'Unconfigured'}`);
      this.host = newHost;
      this.port = newPort;
      this.password = newPassword;
      
      this.authToken = null;
      this.connected = false;
      this.onAir = false;
    }
  }

  /**
   * Start the monitoring loop
   */
  async start() {
    if (this.host) {
      console.log(`[Proclaim] Passive on-air monitor active on ${this.host}:${this.port}`);
    } else {
      console.log('[Proclaim] Standby mode: No host configured (passive status only)');
    }
    this._pollInterval = setInterval(() => this._poll(), 5000);
    this._poll();
  }

  /**
   * Stop the monitoring loop
   */
  stop() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
    this.connected = false;
    this.onAir = false;
    this.authToken = null;
    console.log('[Proclaim] Stopped');
  }

  /**
   * Get current aggregated state for the dashboard
   * @returns {Object} State object
   */
  getState() {
    return {
      connected: this.connected,
      onAir: this.onAir,
      configured: !!this.host,
      statusText: !this.host ? 'Not Configured' : (this.connected ? (this.onAir ? 'ON AIR' : 'Standby') : 'Offline'),
      currentServiceItem: this.currentServiceItem,
      currentSlideIndex: this.currentSlideIndex
    };
  }

  /**
   * Perform authentication with Proclaim to get an auth token
   * @returns {Promise<boolean>} Success status
   */
  async _authenticate() {
    return new Promise((resolve) => {
      const postData = JSON.stringify({ Password: this.password });
      const options = {
        hostname: this.host,
        port: this.port,
        path: '/appCommand/authenticate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const parsed = JSON.parse(body);
              if (parsed && parsed.proclaimAuthToken) {
                this.authToken = parsed.proclaimAuthToken;
                resolve(true);
              } else {
                resolve(false);
              }
            } catch (err) {
              console.warn(`[Proclaim] Auth parsing error: ${err.message}`);
              resolve(false);
            }
          } else {
            resolve(false);
          }
        });
      });

      req.on('error', (e) => {
        resolve(false);
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Fetch status from Proclaim REST API
   * @returns {Promise<Object|null>} Parsed status object or null on error
   */
  async _fetchStatus() {
    return new Promise((resolve) => {
      if (!this.authToken) {
        resolve(null);
        return;
      }

      const options = {
        hostname: this.host,
        port: this.port,
        path: '/appCommand/status', // Using conventional status endpoint
        method: 'GET',
        headers: {
          'ProclaimAuthToken': this.authToken
        }
      };

      const req = http.request(options, (res) => {
        if (res.statusCode === 401) {
          // Token expired or invalid
          this.authToken = null;
          resolve({ _authFailed: true });
          return;
        }

        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch (err) {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        });
      });

      req.on('error', (e) => {
        resolve(null);
      });

      req.end();
    });
  }

  /**
   * Internal polling loop iteration
   */
  async _poll() {
    if (!this.host) {
      this.connected = false;
      this.onAir = false;
      return;
    }
    if (this._isPolling) return;
    this._isPolling = true;

    try {
      // 1. Authenticate if missing token
      if (!this.authToken) {
        const authSuccess = await this._authenticate();
        if (!authSuccess) {
          this._setDisconnected();
          this._isPolling = false;
          return;
        }
      }

      // 2. Fetch Status
      const status = await this._fetchStatus();

      if (!status) {
        this._setDisconnected();
      } else if (status._authFailed) {
        this._setDisconnected();
      } else {
        if (!this.connected) {
          console.log(`[Proclaim] Connected to ${this.host}:${this.port}`);
        }
        this.connected = true;
        this.onAir = !!status.onAir;
        this.currentServiceItem = status.currentServiceItem || '';
        this.currentSlideIndex = typeof status.currentSlideIndex === 'number' ? status.currentSlideIndex : 0;
      }
    } catch (err) {
      this._setDisconnected();
    }

    this._isPolling = false;
  }

  /**
   * Helper to handle disconnect state
   */
  _setDisconnected() {
    if (this.connected) {
      console.log(`[Proclaim] Disconnected from ${this.host}:${this.port}`);
    }
    this.connected = false;
    this.onAir = false;
    this.currentServiceItem = '';
    this.currentSlideIndex = 0;
  }
}

module.exports = ProclaimMonitor;
