/**
 * modules/alerts.js
 * Alert threshold engine with GroupMe single-dispatch per incident
 *
 * Monitors aggregated state for threshold violations, maintains an event log,
 * and dispatches single notifications per incident.
 */

class AlertEngine {
  constructor(notifier = null) {
    this.notifier = notifier;

    // Configurable thresholds & alert rule toggles
    this.thresholds = {
      maxDurationMin: 120,
      silenceTimeoutSec: 120, // 2 minutes (120 seconds)
      silenceDbThreshold: -50, // dBFS threshold for silence
      minBitrateKbps: 2000,
      alertsEnabled: true,
      alertSilenceEnabled: true,
      alertOvertimeEnabled: true,
      alertDisconnectEnabled: true,
      alertNetworkEnabled: true,
      modulesEnabled: {
        proclaim: true,
        reaper: true,
        atem: true,
        obs: true,
        youtube: true,
      },
    };

    // Event log (newest first)
    this.events = [];
    this.maxEvents = 100;

    // Internal tracking
    this._silenceStartTime = null;
    this._durationAlerted = false;
    this._silenceAlerted = false;
    this._bitrateAlerted = false;
    this._disconnectAlerted = {};
    this._disconnectFailureCounts = {};
    this._networkFailureCounts = {};
  }

  setNotifier(notifier) {
    this.notifier = notifier;
  }

  start() {
    this.addEvent('info', 'Alert engine initialized');
    console.log('[Alerts] Engine started');
    return Promise.resolve();
  }

  /**
   * Called every tick with the full aggregated state.
   * Checks thresholds and generates alerts (only sends once per incident).
   */
  check(state) {
    if (!this.thresholds.alertsEnabled) return;

    // ── Audio Silence Detection (Configurable Timeout & dBFS) ───────
    if (this.thresholds.alertSilenceEnabled && this.thresholds.modulesEnabled?.reaper !== false) {
      const audioConnected = state.reaper?.connected;
      const leftDb = state.reaper?.leftDb ?? -60;
      const rightDb = state.reaper?.rightDb ?? -60;
      const silenceDb = this.thresholds.silenceDbThreshold || -50;
      const isSilent = audioConnected && leftDb <= silenceDb && rightDb <= silenceDb;

      if (isSilent) {
        if (!this._silenceStartTime) {
          this._silenceStartTime = Date.now();
        }
        const silenceDuration = (Date.now() - this._silenceStartTime) / 1000;
        if (silenceDuration >= this.thresholds.silenceTimeoutSec && !this._silenceAlerted) {
          const mins = Math.round(silenceDuration / 60);
          const msg = `Audio silence detected for ${Math.round(silenceDuration)}s (${mins} min threshold, <= ${silenceDb}dBFS)`;
          this.addEvent('error', msg);
          this._silenceAlerted = true;

          if (this.notifier) {
            this.notifier.sendAlert({
              severity: 'error',
              title: 'Audio Silence Detected',
              message: `The live stream audio has been silent (under ${silenceDb}dBFS) for over ${mins} minutes (${Math.round(silenceDuration)}s). Please check the soundboard master fader and REAPER master track. Triage guide: http://localhost:8085#scenario-sanctuary-speakers-quiet`,
              alertKey: 'audio_silence',
              troubleshootingUrl: 'http://localhost:8085#scenario-sanctuary-speakers-quiet',
            });
          }
        }
      } else {
        if (this._silenceAlerted) {
          this.addEvent('info', 'Audio signal restored');
          if (this.notifier) {
            this.notifier.clearAlert('audio_silence');
          }
        }
        this._silenceStartTime = null;
        this._silenceAlerted = false;
      }
    }

    // ── Stream Duration (Overtime Alert - 2 Hours / 120 Min) ─
    if (this.thresholds.alertOvertimeEnabled) {
      const atemDuration = state.atem?.isStreaming ? (state.atem.streamDuration || 0) : 0;
      const obsDuration = state.obs?.isStreaming ? (state.obs.streamDuration || 0) : 0;
      const isStreaming = state.atem?.isStreaming || state.obs?.isStreaming || (state.youtube?.broadcastState === 'live');
      const streamDuration = Math.max(atemDuration, obsDuration);

      const maxDurationSec = (this.thresholds.maxDurationMin || 120) * 60;
      if (isStreaming && streamDuration > 0 && streamDuration >= maxDurationSec && !this._durationAlerted) {
        const mins = Math.floor(streamDuration / 60);
        const encoderName = atemDuration >= obsDuration && atemDuration > 0 ? 'ATEM Mini Pro' : 'OBS Studio';
        const msg = `⚠️ Live broadcast duration exceeded ${this.thresholds.maxDurationMin} minutes (${mins} mins on air via ${encoderName})`;
        this.addEvent('warn', msg);
        this._durationAlerted = true;

        if (this.notifier) {
          this.notifier.sendAlert({
            severity: 'warn',
            title: '🚨 Max Stream Duration Exceeded (2 Hours)',
            message: `The live broadcast has been streaming for ${mins} minutes (limit: ${this.thresholds.maxDurationMin} min) via ${encoderName}. Please verify if the service has ended and stop the stream.`,
            alertKey: 'duration_exceeded',
          });
        }
      } else if (!isStreaming || streamDuration === 0) {
        if (this._durationAlerted && this.notifier) {
          this.notifier.clearAlert('duration_exceeded');
        }
        this._durationAlerted = false;
      }
    }

    // ── Device Disconnections ────────────────────
    if (this.thresholds.alertDisconnectEnabled) {
      const devices = {};
      if (this.thresholds.modulesEnabled?.reaper !== false) {
        devices.reaper = { name: 'REAPER DAW', connected: state.reaper?.connected };
      }
      if (this.thresholds.modulesEnabled?.atem !== false) {
        devices.atem = { name: 'ATEM Switcher', connected: state.atem?.connected };
      }
      if (this.thresholds.modulesEnabled?.obs !== false) {
        devices.obs = { name: 'OBS Studio', connected: state.obs?.connected };
      }
      if (this.thresholds.modulesEnabled?.proclaim !== false && state.proclaim?.configured) {
        devices.proclaim = { name: 'Proclaim', connected: state.proclaim?.connected };
      }

      for (const [key, device] of Object.entries(devices)) {
        if (!device.connected) {
          this._disconnectFailureCounts[key] = (this._disconnectFailureCounts[key] || 0) + 1;
          // Debounce: must fail for at least 3 consecutive checks (6 seconds)
          if (this._disconnectFailureCounts[key] >= 3 && !this._disconnectAlerted[key]) {
            this.addEvent('warn', `${device.name} disconnected`);
            this._disconnectAlerted[key] = true;

            const isStreaming = state.atem?.isStreaming || state.obs?.isStreaming;
            if (this.notifier && (isStreaming || key === 'atem' || key === 'reaper')) {
              const triageAnchor = key === 'atem' ? 'atem-no-video' : (key === 'obs' ? 'embrace-obs' : 'soundboard-dead-channel');
              this.notifier.sendAlert({
                severity: 'warn',
                title: `${device.name} Disconnected`,
                message: `${device.name} is no longer communicating with the dashboard. Check the network and application status. Triage: http://localhost:8085#scenario-${triageAnchor}`,
                alertKey: `device_${key}`,
                troubleshootingUrl: `http://localhost:8085#scenario-${triageAnchor}`,
              });
            }
          }
        } else {
          if (this._disconnectAlerted[key]) {
            this.addEvent('info', `${device.name} reconnected`);
            this._disconnectAlerted[key] = false;
            if (this.notifier) {
              this.notifier.clearAlert(`device_${key}`);
            }
          }
          this._disconnectFailureCounts[key] = 0;
        }
      }
    }

    // ── Network Endpoints ────────────────────────
    if (this.thresholds.alertNetworkEnabled && state.network?.endpoints) {
      for (const [key, ep] of Object.entries(state.network.endpoints)) {
        const alertKey = `net_${key}`;
        if (!ep.alive) {
          this._networkFailureCounts[key] = (this._networkFailureCounts[key] || 0) + 1;
          // Debounce: must fail for at least 3 consecutive checks (6 seconds)
          if (this._networkFailureCounts[key] >= 3 && !this._disconnectAlerted[alertKey]) {
            this.addEvent('warn', `Network: ${ep.name} unreachable`);
            this._disconnectAlerted[alertKey] = true;
            if (this.notifier) {
              const triageAnchor = key.includes('cam') ? 'atem-no-video' : 'embrace-obs';
              this.notifier.sendAlert({
                severity: 'warn',
                title: `Network Outage: ${ep.name}`,
                message: `Endpoint ${ep.name} (${ep.host}) is unreachable. Check Ubiquiti switch under booth desk. Triage: http://localhost:8085#scenario-${triageAnchor}`,
                alertKey,
                troubleshootingUrl: `http://localhost:8085#scenario-${triageAnchor}`,
              });
            }
          }
        } else {
          if (this._disconnectAlerted[alertKey]) {
            this.addEvent('info', `Network: ${ep.name} restored (${ep.latency}ms)`);
            this._disconnectAlerted[alertKey] = false;
            if (this.notifier) {
              this.notifier.clearAlert(alertKey);
            }
          }
          this._networkFailureCounts[key] = 0;
        }
      }
    }
  }

  /**
   * Add an event to the log.
   * @param {'info'|'warn'|'error'} severity
   * @param {string} message
   */
  addEvent(severity, message) {
    const event = {
      timestamp: new Date().toISOString(),
      severity,
      message,
    };
    this.events.unshift(event);
    if (this.events.length > this.maxEvents) {
      this.events.pop();
    }

    const icon = severity === 'error' ? '🔴' : severity === 'warn' ? '🟡' : '🔵';
    console.log(`[Alerts] ${icon} ${message}`);
  }

  /**
   * Update thresholds from frontend.
   */
  updateThresholds(newThresholds = {}) {
    if (newThresholds.maxDurationMin !== undefined) {
      this.thresholds.maxDurationMin = parseInt(newThresholds.maxDurationMin, 10);
      this._durationAlerted = false;
    }
    if (newThresholds.silenceTimeoutSec !== undefined) {
      this.thresholds.silenceTimeoutSec = parseInt(newThresholds.silenceTimeoutSec, 10);
      this._silenceAlerted = false;
    }
    if (newThresholds.silenceDbThreshold !== undefined) {
      this.thresholds.silenceDbThreshold = parseFloat(newThresholds.silenceDbThreshold);
    }
    if (newThresholds.minBitrateKbps !== undefined) {
      this.thresholds.minBitrateKbps = parseInt(newThresholds.minBitrateKbps, 10);
      this._bitrateAlerted = false;
    }
    if (newThresholds.alertsEnabled !== undefined) {
      this.thresholds.alertsEnabled = Boolean(newThresholds.alertsEnabled);
    }
    if (newThresholds.alertSilenceEnabled !== undefined) {
      this.thresholds.alertSilenceEnabled = Boolean(newThresholds.alertSilenceEnabled);
    }
    if (newThresholds.alertOvertimeEnabled !== undefined) {
      this.thresholds.alertOvertimeEnabled = Boolean(newThresholds.alertOvertimeEnabled);
    }
    if (newThresholds.alertDisconnectEnabled !== undefined) {
      this.thresholds.alertDisconnectEnabled = Boolean(newThresholds.alertDisconnectEnabled);
    }
    if (newThresholds.alertNetworkEnabled !== undefined) {
      this.thresholds.alertNetworkEnabled = Boolean(newThresholds.alertNetworkEnabled);
    }
    if (newThresholds.modulesEnabled !== undefined) {
      this.thresholds.modulesEnabled = { ...this.thresholds.modulesEnabled, ...newThresholds.modulesEnabled };
    }
  }

  getState() {
    return {
      thresholds: { ...this.thresholds },
      events: this.events.slice(0, 50),
      isSilent: this._silenceAlerted,
      isOvertime: this._durationAlerted,
      silenceDuration: this._silenceStartTime
        ? Math.round((Date.now() - this._silenceStartTime) / 1000)
        : 0,
    };
  }

  stop() {
    console.log('[Alerts] Stopped');
  }
}

module.exports = AlertEngine;
