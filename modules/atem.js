/**
 * modules/atem.js
 * Blackmagic ATEM Mini Extreme integration via atem-connection
 * (reverse-engineered ATEM UDP binary protocol client, port 9910).
 *
 * Connects to the ATEM switcher on the local network and monitors
 * streaming/recording status, program/preview inputs, model/capabilities,
 * SuperSource, Aux outputs, macros, and Fairlight audio state.
 *
 * Control-method contract:
 *  - Invalid arguments reject with RangeError/TypeError (programmer error),
 *    regardless of connection state, so input validation is always testable.
 *  - Valid calls while disconnected resolve with
 *    `{ success: false, connected: false, error }` (operational state),
 *    never with an unhandled TypeError.
 *  - Valid calls while connected resolve with `{ success: true, ... }`.
 */

const { Atem, Enums } = require('atem-connection');

// Numeric ATEM model ids (atem-connection Model enum).
const MODEL_NAMES = {
  14: 'ATEM Mini Pro',
  15: 'ATEM Mini Pro ISO',
  16: 'ATEM Mini Extreme',
  17: 'ATEM Mini Extreme ISO',
  33: 'ATEM Mini Extreme ISO G2',
};

// Special (non-HDMI) input ids.
const SPECIAL_INPUTS = {
  BLACK: 0,
  COLOR_BARS: 1000,
  MEDIA_PLAYER_1: 3010,
  MEDIA_PLAYER_2: 3020,
  SUPERSOURCE: 6000,
};
const VALID_SPECIAL_INPUTS = new Set(Object.values(SPECIAL_INPUTS));

// SuperSource box geometry presets (box coords: x/y roughly -9..9, size 0..1).
const SUPERSOURCE_PRESETS = {
  sideBySide: [
    { box: 0, enabled: true, inputSource: 1, x: -4.5, y: 0, size: 0.5 },
    { box: 1, enabled: true, inputSource: 2, x: 4.5, y: 0, size: 0.5 },
    { box: 2, enabled: false, inputSource: 1 },
    { box: 3, enabled: false, inputSource: 1 },
  ],
  pip: [
    { box: 0, enabled: true, inputSource: 1, x: 0, y: 0, size: 1.0 },
    { box: 1, enabled: true, inputSource: 2, x: 6, y: 4.5, size: 0.25 },
    { box: 2, enabled: false, inputSource: 1 },
    { box: 3, enabled: false, inputSource: 1 },
  ],
  split: [
    { box: 0, enabled: true, inputSource: 1, x: -4.5, y: 0, size: 0.5 },
    { box: 1, enabled: true, inputSource: 3, x: 4.5, y: 0, size: 0.5 },
    { box: 2, enabled: false, inputSource: 1 },
    { box: 3, enabled: false, inputSource: 1 },
  ],
};

class AtemSwitcher {
  constructor(config = {}) {
    this.ip = config.ip || '192.168.1.240';

    // Connection / transport state
    this.connected = false;
    this.isStreaming = false;
    this.isRecording = false;
    this.streamDuration = 0;
    this.programInput = 0;
    this.previewInput = 0;
    this.streamingState = 'idle'; // idle, connecting, streaming, stopping

    // Model & capability detection (populated from state.info on connect)
    this.modelName = null;
    this.modelId = null;
    this.inputsCount = 8; // ATEM Mini Extreme default; 4 for Mini Pro
    this.hasSuperSource = true;
    this.hasMacros = true;
    this.hasAuxOutputs = true;

    // SuperSource / Aux / Macro / Audio state
    this.superSourceEnabled = false;
    this.aux1Source = 1;
    this.aux2Source = 1;
    this.macros = [];
    this.macroPlayer = { isRunning: false, isWaiting: false, loop: false, macroIndex: 0 };
    this.audioMuted = false; // Fairlight input-master mute
    this.audioChannels = {}; // { [channelId]: { muted } }

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

  // ── Validation helpers ──────────────────────────────────────────

  /** Validate a video source id: HDMI 1..inputsCount or a known special input. */
  _validateInput(input) {
    const inputNum = parseInt(input, 10);
    if (!Number.isInteger(inputNum)) {
      throw new TypeError(`ATEM input must be an integer, got: ${input}`);
    }
    const maxHdmi = this.inputsCount || 8;
    const isHdmi = inputNum >= 1 && inputNum <= maxHdmi;
    if (!isHdmi && !VALID_SPECIAL_INPUTS.has(inputNum)) {
      throw new RangeError(
        `Invalid ATEM input: ${inputNum} (expected 1-${maxHdmi}, or one of ${[...VALID_SPECIAL_INPUTS].join(', ')})`
      );
    }
    return inputNum;
  }

  _validateMe(me) {
    const meNum = parseInt(me, 10);
    if (!Number.isInteger(meNum) || meNum < 0) {
      throw new RangeError(`Invalid mix-effect index: ${me} (expected 0-based ME index)`);
    }
    return meNum;
  }

  _notConnectedResult(action) {
    return { success: false, connected: false, action, error: 'ATEM switcher is not connected' };
  }

  _isReady() {
    return this.connected && this.atem;
  }

  // ── Model & capability detection ────────────────────────────────

  _updateModelInfo(info) {
    if (!info) return;
    const modelId = typeof info.model === 'number' ? info.model : this.modelId;
    this.modelId = modelId;
    this.modelName =
      info.productIdentifier || MODEL_NAMES[modelId] || this.modelName || 'ATEM Switcher';

    const caps = info.capabilities || {};
    if (typeof caps.superSources === 'number') this.hasSuperSource = caps.superSources > 0;
    if (typeof caps.auxilliaries === 'number') this.hasAuxOutputs = caps.auxilliaries > 0;
    if (info.macroPool && typeof info.macroPool.macroCount === 'number') {
      this.hasMacros = info.macroPool.macroCount > 0;
    }

    // HDMI input count by model family (Extreme = 8, Pro = 4).
    if (modelId === 16 || modelId === 17 || modelId === 33) {
      this.inputsCount = 8;
    } else if (modelId === 14 || modelId === 15) {
      this.inputsCount = 4;
    } else if (typeof caps.sources === 'number' && caps.sources >= 4) {
      this.inputsCount = Math.min(caps.sources, 8);
    }
  }

  // ── State sync ──────────────────────────────────────────────────

  _readInitialState() {
    try {
      const state = this.atem.state;
      if (!state) return;

      this._updateModelInfo(state.info);

      if (state.video?.mixEffects?.[0]) {
        this.programInput = state.video.mixEffects[0].programInput || 0;
        this.previewInput = state.video.mixEffects[0].previewInput || 0;
      }

      this._syncAux(state);
      this._syncSuperSource(state);
      this._syncMacros(state);
      this._syncAudio(state);

      if (state.streaming?.status) {
        this._updateStreamingState(state.streaming.status.state);
      }

      if (state.recording?.status) {
        this.isRecording = state.recording.status.state === 'recording';
      }
    } catch (err) {
      console.warn('[ATEM] Error reading initial state:', err.message);
    }
  }

  _handleStateChange(state, pathsChanged) {
    for (const path of pathsChanged || []) {
      if (path.startsWith('info')) {
        this._updateModelInfo(state.info);
      }

      if (path.startsWith('video.mixEffects')) {
        const me = state.video?.mixEffects?.[0];
        if (me) {
          if (path.includes('programInput')) this.programInput = me.programInput;
          else if (path.includes('previewInput')) this.previewInput = me.previewInput;
          else {
            this.programInput = me.programInput;
            this.previewInput = me.previewInput;
          }
        }
        this._syncSuperSourceOnAir();
      }

      if (path.startsWith('video.auxilliaries') || path.startsWith('video.aux')) {
        this._syncAux(state);
      }

      if (path.toLowerCase().includes('supersource')) {
        this._syncSuperSource(state);
      }

      if (path.startsWith('macro')) {
        this._syncMacros(state);
      }

      if (path.startsWith('fairlight') || path.startsWith('audio')) {
        this._syncAudio(state);
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

  _syncAux(state) {
    const aux = state.video?.auxilliaries;
    if (Array.isArray(aux)) {
      if (typeof aux[0] === 'number') this.aux1Source = aux[0];
      if (typeof aux[1] === 'number') this.aux2Source = aux[1];
    }
  }

  _syncSuperSource(state) {
    const ssrc = state.video?.superSources?.[0];
    if (ssrc && Array.isArray(ssrc.boxes)) {
      const anyBoxOn = ssrc.boxes.some((box) => box?.enabled);
      if (anyBoxOn) this.superSourceEnabled = true;
    }
    this._syncSuperSourceOnAir();
  }

  /** SuperSource counts as enabled while it is cued or on air. */
  _syncSuperSourceOnAir() {
    if (this.programInput === SPECIAL_INPUTS.SUPERSOURCE || this.previewInput === SPECIAL_INPUTS.SUPERSOURCE) {
      this.superSourceEnabled = true;
    }
  }

  _syncMacros(state) {
    const macro = state.macro;
    if (!macro) return;
    if (macro.macroPlayer) {
      this.macroPlayer = {
        isRunning: Boolean(macro.macroPlayer.isRunning),
        isWaiting: Boolean(macro.macroPlayer.isWaiting),
        loop: Boolean(macro.macroPlayer.loop),
        macroIndex: macro.macroPlayer.macroIndex || 0,
      };
    }
    if (Array.isArray(macro.macroProperties)) {
      this.macros = macro.macroProperties
        .map((props, index) => ({ index, name: props?.name || `Macro ${index + 1}`, isUsed: Boolean(props?.isUsed) }))
        .filter((m) => m.isUsed);
    }
  }

  _syncAudio(state) {
    // Fairlight (ATEM Mini Extreme) master mute.
    const monitor = state.fairlight?.monitor;
    if (monitor && typeof monitor.inputMasterMuted === 'boolean') {
      this.audioMuted = monitor.inputMasterMuted;
    }
    // Fairlight per-input mix options: mixOption Off (1) counts as muted.
    const fairlightOff = Enums?.FairlightAudioMixOption?.Off ?? 1;
    const inputs = state.fairlight?.inputs;
    if (inputs && typeof inputs === 'object') {
      for (const [inputId, input] of Object.entries(inputs)) {
        const sources = input?.sources;
        if (!sources) continue;
        const firstSource = Object.values(sources)[0];
        const mixOption = firstSource?.properties?.mixOption;
        if (typeof mixOption === 'number') {
          this.audioChannels[inputId] = { muted: mixOption === fairlightOff };
        }
      }
    }
    // Classic mixer fallback (older firmware): mixOption Off (0) counts as muted.
    const classicOff = Enums?.AudioMixOption?.Off ?? 0;
    const channels = state.audio?.channels;
    if (channels && typeof channels === 'object') {
      for (const [channelId, channel] of Object.entries(channels)) {
        if (typeof channel?.mixOption === 'number' && !this.audioChannels[channelId]) {
          this.audioChannels[channelId] = { muted: channel.mixOption === classicOff };
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

  // ── Program / Preview (inputs 1-8 + special inputs) ─────────────

  /**
   * Set Program Video Input.
   * @param {number} input 1-8 (HDMI), 0 = Black, 1000 = Bars, 3010/3020 = Media, 6000 = SuperSource
   * @param {number} [me=0]
   */
  async changeProgramInput(input, me = 0) {
    const inputNum = this._validateInput(input);
    const meNum = this._validateMe(me);
    if (!this._isReady()) return this._notConnectedResult('program');
    console.log(`[ATEM] 🔴 Switching PROGRAM to Input ${inputNum}...`);
    await this.atem.changeProgramInput(inputNum, meNum);
    this.programInput = inputNum;
    this._syncSuperSourceOnAir();
    return { success: true, programInput: inputNum, me: meNum };
  }

  /**
   * Set Preview Video Input.
   * @param {number} input 1-8 (HDMI), 0 = Black, 1000 = Bars, 3010/3020 = Media, 6000 = SuperSource
   * @param {number} [me=0]
   */
  async changePreviewInput(input, me = 0) {
    const inputNum = this._validateInput(input);
    const meNum = this._validateMe(me);
    if (!this._isReady()) return this._notConnectedResult('preview');
    console.log(`[ATEM] 🟢 Switching PREVIEW to Input ${inputNum}...`);
    await this.atem.changePreviewInput(inputNum, meNum);
    this.previewInput = inputNum;
    this._syncSuperSourceOnAir();
    return { success: true, previewInput: inputNum, me: meNum };
  }

  /**
   * Execute Instant Hard Cut between Preview and Program
   * @param {number} [me=0]
   */
  async cut(me = 0) {
    const meNum = this._validateMe(me);
    if (!this._isReady()) return this._notConnectedResult('cut');
    console.log(`[ATEM] ⚡ CUT Triggered (ME ${meNum})`);
    await this.atem.cut(meNum);
    return { success: true, action: 'cut', me: meNum };
  }

  /**
   * Execute Smooth Auto Transition (Mix / Dissolve)
   * @param {number} [me=0]
   */
  async autoTransition(me = 0) {
    const meNum = this._validateMe(me);
    if (!this._isReady()) return this._notConnectedResult('auto');
    console.log(`[ATEM] ✨ AUTO Transition Triggered (ME ${meNum})`);
    await this.atem.autoTransition(meNum);
    return { success: true, action: 'auto', me: meNum };
  }

  /**
   * Execute Fade to Black (FTB)
   * @param {number} [me=0]
   */
  async fadeToBlack(me = 0) {
    const meNum = this._validateMe(me);
    if (!this._isReady()) return this._notConnectedResult('ftb');
    console.log(`[ATEM] 🌑 Fade to Black (FTB) Triggered (ME ${meNum})`);
    await this.atem.fadeToBlack(meNum);
    return { success: true, action: 'ftb', me: meNum };
  }

  // ── SuperSource (ATEM Mini Extreme) ─────────────────────────────

  /**
   * Enable/disable the SuperSource. Enabling cues SuperSource (6000) to the
   * Preview bus so the operator can take it live with CUT/AUTO; disabling
   * only clears the flag and leaves the buses untouched.
   * @param {boolean} [enable=true]
   */
  async enableSuperSource(enable = true) {
    const wantEnabled = Boolean(enable);
    if (!this._isReady()) {
      if (!wantEnabled) this.superSourceEnabled = false;
      return this._notConnectedResult('supersource');
    }
    if (wantEnabled) {
      console.log('[ATEM] 🖼️ Enabling SuperSource (cueing 6000 to Preview)...');
      await this.atem.changePreviewInput(SPECIAL_INPUTS.SUPERSOURCE, 0);
      this.previewInput = SPECIAL_INPUTS.SUPERSOURCE;
    } else {
      console.log('[ATEM] 🖼️ Disabling SuperSource flag (buses untouched)');
    }
    this.superSourceEnabled = wantEnabled;
    return { success: true, superSourceEnabled: this.superSourceEnabled };
  }

  /**
   * Configure one SuperSource box.
   * @param {number} boxIndex 0-based box index (0-3)
   * @param {boolean} enabled
   * @param {number} inputSource video source id (validated like program input)
   */
  async setSuperSourceBox(boxIndex, enabled, inputSource) {
    const box = parseInt(boxIndex, 10);
    if (!Number.isInteger(box) || box < 0 || box > 3) {
      throw new RangeError(`Invalid SuperSource box index: ${boxIndex} (expected 0-3)`);
    }
    const source = this._validateInput(inputSource);
    if (!this._isReady()) return this._notConnectedResult('supersource-box');
    const props = { enabled: Boolean(enabled), source };
    console.log(`[ATEM] 🖼️ SuperSource box ${box}: ${props.enabled ? 'ON' : 'OFF'} <- input ${source}`);
    await this.atem.setSuperSourceBoxSettings(props, box, 0);
    if (props.enabled) this.superSourceEnabled = true;
    return { success: true, box, enabled: props.enabled, inputSource: source };
  }

  /**
   * Apply a named SuperSource layout preset.
   * @param {string} layoutName 'sideBySide' | 'pip' | 'split'
   */
  async setSuperSourcePreset(layoutName) {
    const preset = SUPERSOURCE_PRESETS[layoutName];
    if (!preset) {
      throw new RangeError(
        `Unknown SuperSource preset: ${layoutName} (expected one of ${Object.keys(SUPERSOURCE_PRESETS).join(', ')})`
      );
    }
    if (!this._isReady()) return this._notConnectedResult('supersource-preset');
    console.log(`[ATEM] 🖼️ Applying SuperSource preset: ${layoutName}`);
    for (const entry of preset) {
      const props = { enabled: entry.enabled, source: entry.inputSource };
      if (typeof entry.x === 'number') props.x = entry.x;
      if (typeof entry.y === 'number') props.y = entry.y;
      if (typeof entry.size === 'number') props.size = entry.size;
      await this.atem.setSuperSourceBoxSettings(props, entry.box, 0); // eslint-disable-line no-await-in-loop
    }
    this.superSourceEnabled = true;
    return { success: true, preset: layoutName, superSourceEnabled: true };
  }

  // ── Macros ──────────────────────────────────────────────────────

  /**
   * Run a macro by index. Accepts the 0-based protocol index directly
   * (Macro 1 on the switcher UI is index 0).
   * @param {number} macroIndex 0-based macro index (0-99)
   */
  async runMacro(macroIndex) {
    const index = parseInt(macroIndex, 10);
    if (!Number.isInteger(index) || index < 0 || index > 99) {
      throw new RangeError(`Invalid macro index: ${macroIndex} (expected 0-99, 0-based)`);
    }
    if (!this._isReady()) return this._notConnectedResult('macro');
    console.log(`[ATEM] ▶️ Running macro ${index} (Macro ${index + 1})...`);
    await this.atem.macroRun(index);
    this.macroPlayer = { ...this.macroPlayer, isRunning: true, macroIndex: index };
    return { success: true, macroIndex: index };
  }

  // ── Aux outputs ─────────────────────────────────────────────────

  /**
   * Switch an Aux output source (e.g. stage confidence monitor, lobby overflow).
   * @param {number} [auxIndex=0] 0 = Aux 1, 1 = Aux 2
   * @param {number} [inputSource=1] video source id
   */
  async setAuxSource(auxIndex = 0, inputSource = 1) {
    const aux = parseInt(auxIndex, 10);
    if (!Number.isInteger(aux) || aux < 0 || aux > 1) {
      throw new RangeError(`Invalid Aux index: ${auxIndex} (expected 0 = Aux 1, 1 = Aux 2)`);
    }
    const source = this._validateInput(inputSource);
    if (!this._isReady()) return this._notConnectedResult('aux');
    console.log(`[ATEM] 📺 Setting Aux ${aux + 1} source to input ${source}...`);
    await this.atem.setAuxSource(source, aux);
    if (aux === 0) this.aux1Source = source;
    else this.aux2Source = source;
    return { success: true, auxIndex: aux, inputSource: source };
  }

  // ── Fairlight audio ─────────────────────────────────────────────

  /**
   * Mute/unmute the Fairlight input master.
   * @param {boolean} [muted=false]
   */
  async setAudioInputMaster(muted = false) {
    const wantMuted = Boolean(muted);
    if (!this._isReady()) return this._notConnectedResult('audio-master');
    console.log(`[ATEM] 🔊 Fairlight input master ${wantMuted ? 'MUTED' : 'UNMUTED'}`);
    await this.atem.setFairlightAudioMixerMonitorProps({ inputMasterMuted: wantMuted });
    this.audioMuted = wantMuted;
    return { success: true, audioMuted: this.audioMuted };
  }

  /**
   * Mute/unmute one Fairlight audio channel (1-based input id).
   * Uses the classic mixer API when the switcher exposes classic audio
   * state, otherwise the Fairlight source mix option (Off = muted).
   * @param {number} channelId
   * @param {boolean} [muted=true]
   */
  async setAudioChannelMute(channelId, muted = true) {
    const channel = parseInt(channelId, 10);
    if (!Number.isInteger(channel) || channel < 0 || channel > 64) {
      throw new RangeError(`Invalid audio channel id: ${channelId} (expected 0-64)`);
    }
    const wantMuted = Boolean(muted);
    if (!this._isReady()) return this._notConnectedResult('audio-mute');
    const liveState = this.atem.state;
    if (liveState?.audio && typeof this.atem.setClassicAudioMixerInputProps === 'function') {
      const mixOption = wantMuted ? (Enums?.AudioMixOption?.Off ?? 0) : (Enums?.AudioMixOption?.On ?? 1);
      await this.atem.setClassicAudioMixerInputProps(channel, { mixOption });
    } else {
      const mixOption = wantMuted
        ? (Enums?.FairlightAudioMixOption?.Off ?? 1)
        : (Enums?.FairlightAudioMixOption?.On ?? 2);
      const sourceKey = this._fairlightSourceKey(liveState, channel);
      await this.atem.setFairlightAudioMixerSourceProps(channel, sourceKey, { mixOption });
    }
    this.audioChannels[channel] = { muted: wantMuted };
    console.log(`[ATEM] 🔊 Audio channel ${channel} ${wantMuted ? 'MUTED' : 'UNMUTED'}`);
    return { success: true, channelId: channel, muted: wantMuted };
  }

  /** Resolve the Fairlight source key for an input from live state (fallback: input id). */
  _fairlightSourceKey(liveState, channel) {
    try {
      const sources = liveState?.fairlight?.inputs?.[channel]?.sources;
      const keys = sources ? Object.keys(sources) : [];
      if (keys.length > 0) return keys[0];
    } catch (_) {
      // fall through to default
    }
    return String(channel);
  }

  // ── Streaming / recording ───────────────────────────────────────

  /**
   * Start Live Streaming on ATEM Mini Extreme
   */
  async startStreaming() {
    if (!this._isReady()) return this._notConnectedResult('stream-start');
    console.log('[ATEM] ▶️ Starting Live Stream...');
    await this.atem.startStreaming();
    this.isStreaming = true;
    this.streamingState = 'streaming';
    this._streamStartTime = Date.now();
    return { success: true, isStreaming: true };
  }

  /**
   * Stop Live Streaming on ATEM Mini Extreme
   */
  async stopStreaming() {
    if (!this._isReady()) return this._notConnectedResult('stream-stop');
    console.log('[ATEM] ⏹️ Stopping Live Stream...');
    await this.atem.stopStreaming();
    this.isStreaming = false;
    this.streamingState = 'idle';
    this._streamStartTime = null;
    return { success: true, isStreaming: false };
  }

  /**
   * Toggle Live Streaming on ATEM Mini Extreme
   */
  async toggleStreaming() {
    if (this.isStreaming) {
      return this.stopStreaming();
    }
    return this.startStreaming();
  }

  /**
   * Start Recording on ATEM Mini Extreme USB
   */
  async startRecording() {
    if (!this._isReady()) return this._notConnectedResult('record-start');
    console.log('[ATEM] ⏺️ Starting USB Recording...');
    await this.atem.startRecording();
    this.isRecording = true;
    return { success: true, isRecording: true };
  }

  /**
   * Stop Recording on ATEM Mini Extreme USB
   */
  async stopRecording() {
    if (!this._isReady()) return this._notConnectedResult('record-stop');
    console.log('[ATEM] ⏹️ Stopping USB Recording...');
    await this.atem.stopRecording();
    this.isRecording = false;
    return { success: true, isRecording: false };
  }

  /**
   * Toggle Recording on ATEM Mini Extreme USB
   */
  async toggleRecording() {
    if (this.isRecording) {
      return this.stopRecording();
    }
    return this.startRecording();
  }

  getState() {
    return {
      connected: this.connected,
      modelName: this.modelName || 'ATEM Switcher',
      modelId: this.modelId,
      inputsCount: this.inputsCount || 8,
      hasSuperSource: this.hasSuperSource,
      hasMacros: this.hasMacros,
      hasAuxOutputs: this.hasAuxOutputs,
      programInput: this.programInput,
      previewInput: this.previewInput,
      isStreaming: this.isStreaming,
      isRecording: this.isRecording,
      streamingState: this.streamingState,
      streamDuration: this.streamDuration,
      superSourceEnabled: this.superSourceEnabled,
      aux1Source: this.aux1Source,
      aux2Source: this.aux2Source,
      macros: this.macros || [],
      macroPlayer: this.macroPlayer,
      audioMuted: this.audioMuted,
      audioChannels: this.audioChannels || {},
    };
  }

  stop() {
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout);
    if (this._durationInterval) clearInterval(this._durationInterval);
    if (this.atem) {
      try {
        const result = typeof this.atem.disconnect === 'function' ? this.atem.disconnect() : null;
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch (_) {
        // ignore teardown errors
      }
      this.atem = null;
    }
    console.log('[ATEM] Stopped');
  }
}

module.exports = AtemSwitcher;
module.exports.SPECIAL_INPUTS = SPECIAL_INPUTS;
module.exports.SUPERSOURCE_PRESETS = SUPERSOURCE_PRESETS;
module.exports.MODEL_NAMES = MODEL_NAMES;
