/**
 * modules/atem.js
 * Blackmagic ATEM Mini Pro integration via atem-connection
 *
 * Connects to the ATEM switcher on the local network and monitors
 * streaming status, program/preview inputs, and connection state.
 */

const { Atem } = require('atem-connection');

class AtemSwitcher {
  constructor(config = {}) {
    this.ip = config.ip || '192.168.1.240';

    // State
    this.connected = false;
    this.isStreaming = false;
    this.isRecording = false;
    this.streamDuration = 0;
    this.programInput = 0;
    this.previewInput = 0;
    this.streamingState = 'idle'; // idle, connecting, streaming, stopping

    this.atem = null;
    this._reconnectTimeout = null;
    this._durationInterval = null;
    this._streamStartTime = null;
  }

  updateConfig(config = {}) {
    const newIp = config.ip || '192.168.1.240';
    if (newIp !== this.ip) {
      console.log(`[ATEM] Updating IP from ${this.ip} to ${newIp}`);
      this.ip = newIp;
      if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
      if (this.atem) {
        this.atem.disconnect().catch(() => {});
        this.atem.connect(this.ip).catch((err) => {
          console.warn(`[ATEM] Reconnect to ${this.ip} failed: ${err.message}`);
          this._scheduleReconnect();
        });
      }
    }
  }

  start() {
    return new Promise((resolve) => {
      this.atem = new Atem();

      this.atem.on('connected', () => {
        console.log(`[ATEM] Connected to ${this.ip}`);
        this.connected = true;
        this._readInitialState();
      });

      this.atem.on('disconnected', () => {
        console.log('[ATEM] Disconnected');
        this.connected = false;
        this.isStreaming = false;
        this._scheduleReconnect();
      });

      this.atem.on('stateChanged', (state, pathsChanged) => {
        this._handleStateChange(state, pathsChanged);
      });

      this.atem.on('error', (err) => {
        console.error('[ATEM] Error:', err.message);
      });

      this.atem.connect(this.ip).catch((err) => {
        console.warn(`[ATEM] Could not connect to ${this.ip}: ${err.message}`);
      });

      this._durationInterval = setInterval(() => {
        if (this.isStreaming && this._streamStartTime) {
          this.streamDuration = Math.floor((Date.now() - this._streamStartTime) / 1000);
        }
      }, 1000);

      resolve();
    });
  }

  _readInitialState() {
    try {
      const state = this.atem.state;

      if (state.video?.mixEffects?.[0]) {
        this.programInput = state.video.mixEffects[0].programInput || 0;
        this.previewInput = state.video.mixEffects[0].previewInput || 0;
      }

      if (state.streaming?.status) {
        const streamState = state.streaming.status.state;
        this._updateStreamingState(streamState);
      }

      if (state.recording?.status) {
        this.isRecording = state.recording.status.state === 'recording';
      }
    } catch (err) {
      console.warn('[ATEM] Error reading initial state:', err.message);
    }
  }

  _handleStateChange(state, pathsChanged) {
    for (const path of pathsChanged) {
      if (path.startsWith('video.mixEffects.0.programInput')) {
        this.programInput = state.video.mixEffects[0].programInput;
      }

      if (path.startsWith('video.mixEffects.0.previewInput')) {
        this.previewInput = state.video.mixEffects[0].previewInput;
      }

      if (path.startsWith('streaming')) {
        if (state.streaming?.status) {
          this._updateStreamingState(state.streaming.status.state);
        }
      }

      if (path.startsWith('recording')) {
        if (state.recording?.status) {
          this.isRecording = state.recording.status.state === 'recording';
        }
      }
    }
  }

  _updateStreamingState(state) {
    const wasStreaming = this.isStreaming;

    switch (state) {
      case 'streaming':
        this.isStreaming = true;
        this.streamingState = 'streaming';
        if (!wasStreaming) {
          this._streamStartTime = Date.now();
          this.streamDuration = 0;
          console.log('[ATEM] Streaming started');
        }
        break;

      case 'connecting':
        this.streamingState = 'connecting';
        break;

      case 'stopping':
        this.streamingState = 'stopping';
        break;

      case 'idle':
      default:
        this.isStreaming = false;
        this.streamingState = 'idle';
        if (wasStreaming) {
          console.log('[ATEM] Streaming stopped');
          this._streamStartTime = null;
        }
        break;
    }
  }

  _scheduleReconnect() {
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    this._reconnectTimeout = setTimeout(() => {
      console.log('[ATEM] Attempting reconnection...');
      if (this.atem) {
        this.atem.connect(this.ip).catch((err) => {
          console.warn(`[ATEM] Reconnect failed: ${err.message}`);
          this._scheduleReconnect();
        });
      }
    }, 5000);
  }

  /**
   * Set Program Video Input (e.g. 1 = Cam 1, 2 = Cam 2, 3 = Proclaim, 4 = Media, etc.)
   * @param {number} input
   * @param {number} [me=0]
   */
  async changeProgramInput(input, me = 0) {
    if (!this.connected || !this.atem) {
      throw new Error('ATEM switcher is not connected');
    }
    const inputNum = parseInt(input, 10);
    console.log(`[ATEM] 🔴 Switching PROGRAM to Input ${inputNum}...`);
    await this.atem.changeProgramInput(inputNum, me);
    this.programInput = inputNum;
    return { success: true, programInput: inputNum, me };
  }

  /**
   * Set Preview Video Input
   * @param {number} input
   * @param {number} [me=0]
   */
  async changePreviewInput(input, me = 0) {
    if (!this.connected || !this.atem) {
      throw new Error('ATEM switcher is not connected');
    }
    const inputNum = parseInt(input, 10);
    console.log(`[ATEM] 🟢 Switching PREVIEW to Input ${inputNum}...`);
    await this.atem.changePreviewInput(inputNum, me);
    this.previewInput = inputNum;
    return { success: true, previewInput: inputNum, me };
  }

  /**
   * Execute Instant Hard Cut between Preview and Program
   * @param {number} [me=0]
   */
  async cut(me = 0) {
    if (!this.connected || !this.atem) {
      throw new Error('ATEM switcher is not connected');
    }
    console.log(`[ATEM] ⚡ CUT Triggered (ME ${me})`);
    await this.atem.cut(me);
    return { success: true, action: 'cut', me };
  }

  /**
   * Execute Smooth Auto Transition (Mix / Dissolve)
   * @param {number} [me=0]
   */
  async autoTransition(me = 0) {
    if (!this.connected || !this.atem) {
      throw new Error('ATEM switcher is not connected');
    }
    console.log(`[ATEM] ✨ AUTO Transition Triggered (ME ${me})`);
    await this.atem.autoTransition(me);
    return { success: true, action: 'auto', me };
  }

  /**
   * Execute Fade to Black (FTB)
   * @param {number} [me=0]
   */
  async fadeToBlack(me = 0) {
    if (!this.connected || !this.atem) {
      throw new Error('ATEM switcher is not connected');
    }
    console.log(`[ATEM] 🌑 Fade to Black (FTB) Triggered (ME ${me})`);
    await this.atem.fadeToBlack(me);
    return { success: true, action: 'ftb', me };
  }

  /**
   * Start Live Streaming on ATEM Mini Pro
   */
  async startStreaming() {
    if (!this.connected || !this.atem) {
      throw new Error('ATEM switcher is not connected');
    }
    console.log('[ATEM] ▶️ Starting Live Stream...');
    await this.atem.startStreaming();
    this.isStreaming = true;
    this.streamingState = 'streaming';
    this._streamStartTime = Date.now();
    return { success: true, isStreaming: true };
  }

  /**
   * Stop Live Streaming on ATEM Mini Pro
   */
  async stopStreaming() {
    if (!this.connected || !this.atem) {
      throw new Error('ATEM switcher is not connected');
    }
    console.log('[ATEM] ⏹️ Stopping Live Stream...');
    await this.atem.stopStreaming();
    this.isStreaming = false;
    this.streamingState = 'idle';
    this._streamStartTime = null;
    return { success: true, isStreaming: false };
  }

  /**
   * Toggle Live Streaming on ATEM Mini Pro
   */
  async toggleStreaming() {
    if (this.isStreaming) {
      return this.stopStreaming();
    } else {
      return this.startStreaming();
    }
  }

  /**
   * Start Recording on ATEM Mini Pro USB
   */
  async startRecording() {
    if (!this.connected || !this.atem) {
      throw new Error('ATEM switcher is not connected');
    }
    console.log('[ATEM] ⏺️ Starting USB Recording...');
    await this.atem.startRecording();
    this.isRecording = true;
    return { success: true, isRecording: true };
  }

  /**
   * Stop Recording on ATEM Mini Pro USB
   */
  async stopRecording() {
    if (!this.connected || !this.atem) {
      throw new Error('ATEM switcher is not connected');
    }
    console.log('[ATEM] ⏹️ Stopping USB Recording...');
    await this.atem.stopRecording();
    this.isRecording = false;
    return { success: true, isRecording: false };
  }

  /**
   * Toggle Recording on ATEM Mini Pro USB
   */
  async toggleRecording() {
    if (this.isRecording) {
      return this.stopRecording();
    } else {
      return this.startRecording();
    }
  }

  getState() {
    return {
      connected: this.connected,
      isStreaming: this.isStreaming,
      isRecording: this.isRecording,
      streamingState: this.streamingState,
      streamDuration: this.streamDuration,
      programInput: this.programInput,
      previewInput: this.previewInput,
    };
  }

  stop() {
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    if (this._durationInterval) clearInterval(this._durationInterval);
    if (this.atem) {
      this.atem.disconnect().catch(() => {});
      this.atem = null;
    }
    console.log('[ATEM] Stopped');
  }
}

module.exports = AtemSwitcher;
