/**
 * modules/network-ping.js
 * Network diagnostics via ICMP ping
 *
 * Pings configured endpoints periodically and maintains
 * a rolling history of latency readings.
 */

const ping = require('ping');

class NetworkPing {
  constructor(config = {}) {
    this.updateConfig(config);
    this._pollInterval = null;
    this.historySize = 20;
  }

  updateConfig(config = {}) {
    this.endpoints = [
      {
        key: 'reaper',
        name: 'REAPER DAW',
        host: config.reaperHost || '127.0.0.1',
      },
      {
        key: 'atem',
        name: 'ATEM Switcher',
        host: config.atemIp || '192.168.1.240',
      },
      {
        key: 'rtmp',
        name: 'YouTube Ingest',
        host: config.youtubeIngestHost || 'a.rtmp.youtube.com',
      },
      {
        key: 'gateway',
        name: 'Internet Gateway',
        host: config.gatewayIp || '192.168.1.1',
      },
    ];

    if (!this.state) {
      this.state = {};
    }

    // Initialize or keep existing state
    for (const ep of this.endpoints) {
      if (!this.state[ep.key]) {
        this.state[ep.key] = {
          name: ep.name,
          host: ep.host,
          alive: false,
          latency: null,
          history: new Array(20).fill(null),
        };
      } else {
        this.state[ep.key].name = ep.name;
        this.state[ep.key].host = ep.host;
      }
    }

    // Remove deleted endpoints from state
    for (const key of Object.keys(this.state)) {
      if (!this.endpoints.some((ep) => ep.key === key)) {
        delete this.state[key];
      }
    }
  }

  start() {
    this._pingAll();
    this._pollInterval = setInterval(() => this._pingAll(), 2000);
    console.log(`[Network] Ping diagnostics started (${this.endpoints.length} endpoints, every 2s)`);
    return Promise.resolve();
  }

  async _pingAll() {
    const promises = this.endpoints.map((ep) => this._pingOne(ep));
    await Promise.allSettled(promises);
  }

  async _pingOne(ep) {
    try {
      const result = await ping.promise.probe(ep.host, {
        timeout: 2,
        extra: process.platform === 'darwin' ? ['-c', '1'] : ['-c', '1', '-W', '2'],
      });

      const state = this.state[ep.key];
      if (!state) return;

      state.alive = result.alive;
      state.latency = result.alive && result.time !== 'unknown'
        ? Math.round(parseFloat(result.time))
        : null;

      state.history.push(state.latency);
      if (state.history.length > this.historySize) {
        state.history.shift();
      }
    } catch (err) {
      const state = this.state[ep.key];
      if (!state) return;
      state.alive = false;
      state.latency = null;
      state.history.push(null);
      if (state.history.length > this.historySize) {
        state.history.shift();
      }
    }
  }

  getState() {
    const endpoints = {};
    for (const key in this.state) {
      const s = this.state[key];
      endpoints[key] = {
        name: s.name,
        host: s.host,
        alive: s.alive,
        latency: s.latency,
        history: [...s.history],
      };
    }
    return { endpoints };
  }

  stop() {
    if (this._pollInterval) clearInterval(this._pollInterval);
    console.log('[Network] Stopped');
  }
}

module.exports = NetworkPing;
