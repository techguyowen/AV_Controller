/**
 * modules/obs.js
 * OBS Studio integration via obs-websocket-js (v5)
 *
 * Connects to OBS Studio on the local network and monitors
 * streaming/recording status, current scene, and output stats.
 */

const { OBSWebSocket } = require('obs-websocket-js');

class OBSMonitor {
  /**
   * Initialize the OBS Monitor
   * @param {Object} config Configuration object
   * @param {string} [config.host='127.0.0.1:4455'] - OBS WebSocket host and port
   * @param {string} [config.password=''] - OBS WebSocket password
   */
  constructor(config = {}) {
    this.host = config.host || '127.0.0.1:4455';
    this.password = config.password || '';

    // State
    this.connected = false;
    this.currentScene = '';
    
    // Streaming state
    this.isStreaming = false;
    this.streamDuration = 0; // seconds
    this.streamTimecode = '';
    
    // Recording state
    this.isRecording = false;
    this.recordDuration = 0; // seconds
    this.recordTimecode = '';
    
    // Stats
    this.outputBitrate = 0; // kbps
    this.droppedFrames = 0;
    this.totalFrames = 0;
    this.dropPercentage = 0;
    
    this.scenes = [];

    // Internal
    this.obs = new (OBSWebSocket || require('obs-websocket-js').default)();
    this._reconnectTimeout = null;
    this._pollInterval = null;
    
    this._lastBytes = 0;
    this._lastBytesTime = 0;
  }

  /**
   * Update configuration and reconnect if necessary
   * @param {Object} config Configuration object
   */
  updateConfig(config = {}) {
    const newHost = config.host || '127.0.0.1:4455';
    const newPassword = config.password !== undefined ? config.password : this.password;
    
    if (newHost !== this.host || newPassword !== this.password) {
      console.log(`[OBS] Updating config (host: ${newHost})`);
      this.host = newHost;
      this.password = newPassword;
      
      if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
      
      if (this.connected) {
        this.obs.disconnect().catch(() => {});
      } else {
        this._connect();
      }
    }
  }

  /**
   * Start the OBS monitor, connect and begin polling
   * @returns {Promise<void>}
   */
  async start() {
    this._setupEventListeners();
    await this._connect();
    
    // Poll stream/record status every 2 seconds
    this._pollInterval = setInterval(() => {
      if (this.connected) {
        this._pollStatus();
      }
    }, 2000);
  }

  /**
   * Setup OBS WebSocket event listeners
   * @private
   */
  _setupEventListeners() {
    this.obs.on('ConnectionClosed', () => {
      if (this.connected) {
        console.log('[OBS] Disconnected');
      }
      this.connected = false;
      this.isStreaming = false;
      this.isRecording = false;
      this._scheduleReconnect();
    });

    this.obs.on('ConnectionError', (err) => {
      console.error('[OBS] Connection error:', err.message);
    });

    this.obs.on('CurrentProgramSceneChanged', (data) => {
      this.currentScene = data.sceneName;
    });

    this.obs.on('SceneListChanged', (data) => {
      if (data.scenes) {
        this.scenes = data.scenes.map(s => s.sceneName);
      }
    });

    this.obs.on('StreamStateChanged', (data) => {
      this.isStreaming = data.outputActive;
    });

    this.obs.on('RecordStateChanged', (data) => {
      this.isRecording = data.outputActive;
    });
  }

  /**
   * Connect to OBS WebSocket
   * @private
   */
  async _connect() {
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    
    try {
      const url = `ws://${this.host}`;
      await this.obs.connect(url, this.password);
      
      this.connected = true;
      console.log(`[OBS] Connected to ${this.host}`);
      
      await this._readInitialState();
    } catch (err) {
      console.warn(`[OBS] Could not connect to ${this.host}: ${err.message}`);
      this._scheduleReconnect();
    }
  }

  /**
   * Read the initial state upon connection
   * @private
   */
  async _readInitialState() {
    try {
      const sceneList = await this.obs.call('GetSceneList');
      this.currentScene = sceneList.currentProgramSceneName;
      this.scenes = sceneList.scenes.map(s => s.sceneName);
      
      await this._pollStatus();
    } catch (err) {
      console.warn('[OBS] Error reading initial state:', err.message);
    }
  }

  /**
   * Poll streaming and recording status, calculate stats
   * @private
   */
  async _pollStatus() {
    try {
      // --- Stream Status ---
      const streamStatus = await this.obs.call('GetStreamStatus');
      this.isStreaming = streamStatus.outputActive;
      
      if (this.isStreaming) {
        this.streamDuration = streamStatus.outputDuration ? Math.floor(streamStatus.outputDuration / 1000) : 0;
        this.streamTimecode = streamStatus.outputTimecode || '';
        this.droppedFrames = streamStatus.outputSkippedFrames || 0;
        this.totalFrames = streamStatus.outputTotalFrames || 0;
        
        if (this.totalFrames > 0) {
          this.dropPercentage = (this.droppedFrames / this.totalFrames) * 100;
        }

        // Calculate bitrate over the polling interval
        const now = Date.now();
        const currentBytes = streamStatus.outputBytes || 0;
        
        if (this._lastBytesTime > 0 && currentBytes >= this._lastBytes) {
          const timeDiff = (now - this._lastBytesTime) / 1000; // seconds
          const bytesDiff = currentBytes - this._lastBytes;
          
          if (timeDiff > 0) {
            // Convert bytes to kilobits per second
            this.outputBitrate = Math.round(((bytesDiff * 8) / 1000) / timeDiff);
          }
        }
        
        this._lastBytes = currentBytes;
        this._lastBytesTime = now;
      } else {
        this.streamDuration = 0;
        this.streamTimecode = '';
        this.outputBitrate = 0;
        this._lastBytes = 0;
        this._lastBytesTime = 0;
      }

      // --- Record Status ---
      const recordStatus = await this.obs.call('GetRecordStatus');
      this.isRecording = recordStatus.outputActive;
      
      if (this.isRecording) {
        this.recordDuration = recordStatus.outputDuration ? Math.floor(recordStatus.outputDuration / 1000) : 0;
        this.recordTimecode = recordStatus.outputTimecode || '';
      } else {
        this.recordDuration = 0;
        this.recordTimecode = '';
      }
      
    } catch (err) {
      // Graceful error handling - log but do not crash
      console.warn('[OBS] Error polling status:', err.message);
    }
  }

  /**
   * Schedule a reconnection attempt
   * @private
   */
  _scheduleReconnect() {
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    this._reconnectTimeout = setTimeout(() => {
      console.log('[OBS] Attempting reconnection...');
      this._connect();
    }, 5000);
  }

  /**
   * Get the current state of the OBS monitor
   * @returns {Object} State object
   */
  getState() {
    return {
      connected: this.connected,
      currentScene: this.currentScene,
      isStreaming: this.isStreaming,
      streamDuration: this.streamDuration,
      streamTimecode: this.streamTimecode,
      isRecording: this.isRecording,
      recordDuration: this.recordDuration,
      recordTimecode: this.recordTimecode,
      outputBitrate: this.outputBitrate,
      droppedFrames: this.droppedFrames,
      totalFrames: this.totalFrames,
      dropPercentage: this.dropPercentage,
      scenes: this.scenes
    };
  }

  /**
   * Open fullscreen projector on a specific monitor
   * @param {Object} [options]
   * @param {number} [options.monitorIndex=1] - Target monitor index (1 = LONTIUM / secondary display)
   * @param {string} [options.mixType='preview'] - 'preview' or 'program'
   * @param {string} [options.sourceName] - Optional source name to project directly
   * @returns {Promise<Object>}
   */
  async openProjector({ monitorIndex = 1, mixType = 'preview', sourceName = null } = {}) {
    if (!this.connected) {
      throw new Error('OBS is not connected via WebSocket');
    }

    const normMix = (mixType || 'preview').toLowerCase();
    const videoMixType = normMix === 'program' 
      ? 'OBS_WEBSOCKET_VIDEO_MIX_TYPE_PROGRAM' 
      : (normMix === 'multiview' ? 'OBS_WEBSOCKET_VIDEO_MIX_TYPE_MULTIVIEW' : 'OBS_WEBSOCKET_VIDEO_MIX_TYPE_PREVIEW');

    try {
      if (sourceName) {
        console.log(`[OBS] 📺 Opening Source Projector for "${sourceName}" on Monitor ${monitorIndex}...`);
        await this.obs.call('OpenSourceProjector', {
          sourceName,
          monitorIndex: parseInt(monitorIndex, 10),
        });
        return { success: true, type: 'source', sourceName, monitorIndex };
      } else {
        console.log(`[OBS] 📺 Opening Video Mix Projector (${videoMixType}) on Monitor ${monitorIndex}...`);
        await this.obs.call('OpenVideoMixProjector', {
          videoMixType,
          monitorIndex: parseInt(monitorIndex, 10),
        });
        return { success: true, type: 'mix', videoMixType, monitorIndex };
      }
    } catch (err) {
      console.warn(`[OBS] Failed to open projector: ${err.message}`);
      throw err;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ── REMOTE BROADCAST CONTROLS (STREAMING, RECORDING, SCENES) ──────────────
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Start OBS live streaming
   */
  async startStream() {
    if (!this.connected) throw new Error('OBS is not connected');
    console.log('[OBS] 📡 Starting Live Stream...');
    await this.obs.call('StartStream');
    this.isStreaming = true;
    return { success: true, isStreaming: true };
  }

  /**
   * Stop OBS live streaming
   */
  async stopStream() {
    if (!this.connected) throw new Error('OBS is not connected');
    console.log('[OBS] 🛑 Stopping Live Stream...');
    await this.obs.call('StopStream');
    this.isStreaming = false;
    return { success: true, isStreaming: false };
  }

  /**
   * Toggle OBS live stream state
   */
  async toggleStream() {
    if (!this.connected) throw new Error('OBS is not connected');
    const res = await this.obs.call('ToggleStream');
    this.isStreaming = Boolean(res.outputActive);
    console.log(`[OBS] Stream toggled -> ${this.isStreaming ? 'LIVE' : 'STOPPED'}`);
    return { success: true, isStreaming: this.isStreaming };
  }

  /**
   * Start local MP4 recording
   */
  async startRecord() {
    if (!this.connected) throw new Error('OBS is not connected');
    console.log('[OBS] 📼 Starting Local Recording...');
    await this.obs.call('StartRecord');
    this.isRecording = true;
    return { success: true, isRecording: true };
  }

  /**
   * Stop local recording
   */
  async stopRecord() {
    if (!this.connected) throw new Error('OBS is not connected');
    console.log('[OBS] ⏹️ Stopping Local Recording...');
    const res = await this.obs.call('StopRecord');
    this.isRecording = false;
    return { success: true, isRecording: false, outputPath: res.outputPath };
  }

  /**
   * Toggle local recording state
   */
  async toggleRecord() {
    if (!this.connected) throw new Error('OBS is not connected');
    const res = await this.obs.call('ToggleRecord');
    this.isRecording = Boolean(res.outputActive);
    console.log(`[OBS] Recording toggled -> ${this.isRecording ? 'RECORDING' : 'STOPPED'}`);
    return { success: true, isRecording: this.isRecording };
  }

  /**
   * Pause or Resume recording
   */
  async toggleRecordPause() {
    if (!this.connected) throw new Error('OBS is not connected');
    await this.obs.call('ToggleRecordPause');
    return { success: true };
  }

  /**
   * Switch active program scene
   * @param {string} sceneName
   */
  async setScene(sceneName) {
    if (!this.connected) throw new Error('OBS is not connected');
    if (!sceneName) throw new Error('Scene name is required');
    console.log(`[OBS] 🎬 Switching Scene -> "${sceneName}"`);
    await this.obs.call('SetCurrentProgramScene', { sceneName });
    this.currentScene = sceneName;
    return { success: true, currentScene: sceneName };
  }

  /**
   * Switch preview scene (Studio Mode)
   * @param {string} sceneName
   */
  async setPreviewScene(sceneName) {
    if (!this.connected) throw new Error('OBS is not connected');
    await this.obs.call('SetCurrentPreviewScene', { sceneName });
    return { success: true, previewScene: sceneName };
  }

  /**
   * Trigger Studio Mode transition (Cut/Fade preview to program)
   */
  async triggerStudioModeTransition() {
    if (!this.connected) throw new Error('OBS is not connected');
    await this.obs.call('TriggerStudioModeTransition');
    return { success: true };
  }

  /**
   * Toggle Studio Mode
   */
  async toggleStudioMode() {
    if (!this.connected) throw new Error('OBS is not connected');
    const status = await this.obs.call('GetStudioModeEnabled');
    const newStatus = !status.studioModeEnabled;
    await this.obs.call('SetStudioModeEnabled', { studioModeEnabled: newStatus });
    return { success: true, studioModeEnabled: newStatus };
  }

  /**
   * Toggle Virtual Camera
   */
  async toggleVirtualCam() {
    if (!this.connected) throw new Error('OBS is not connected');
    const res = await this.obs.call('ToggleVirtualCam');
    return { success: true, virtualCamActive: res.outputActive };
  }

  /**
   * Mute or Unmute an audio source in OBS
   * @param {string} inputName
   * @param {boolean} [muted]
   */
  async setInputMute(inputName, muted) {
    if (!this.connected) throw new Error('OBS is not connected');
    if (muted !== undefined) {
      await this.obs.call('SetInputMute', { inputName, inputMuted: Boolean(muted) });
      return { success: true, inputName, muted: Boolean(muted) };
    } else {
      const res = await this.obs.call('ToggleInputMute', { inputName });
      return { success: true, inputName, muted: res.inputMuted };
    }
  }

  /**
   * Stop the OBS monitor and clean up intervals/timeouts
   */
  stop() {
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    if (this._pollInterval) clearInterval(this._pollInterval);
    
    if (this.connected) {
      this.obs.disconnect().catch(() => {});
    }
    this.connected = false;
    console.log('[OBS] Stopped');
  }
}

module.exports = OBSMonitor;
