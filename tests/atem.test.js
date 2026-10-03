/**
 * tests/atem.test.js
 * ATEM Mini Extreme regression tests: initialization/default state, input
 * validation (HDMI 1-8 + special inputs), getState() shape, model/capability
 * detection, SuperSource/Macro/Aux/Audio controls, and graceful behavior
 * with a mocked atem-connection client (connected or disconnected).
 *
 * Run: npm test  (node --test tests/)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const AtemSwitcher = require('../modules/atem');

/** Build a mock atem-connection client that records calls instead of sending UDP. */
function makeMockAtemClient(state = {}) {
  const calls = [];
  const record = (method) => async (...args) => {
    calls.push({ method, args });
  };
  return {
    calls,
    state,
    changeProgramInput: record('changeProgramInput'),
    changePreviewInput: record('changePreviewInput'),
    cut: record('cut'),
    autoTransition: record('autoTransition'),
    fadeToBlack: record('fadeToBlack'),
    setSuperSourceBoxSettings: record('setSuperSourceBoxSettings'),
    macroRun: record('macroRun'),
    setAuxSource: record('setAuxSource'),
    setFairlightAudioMixerMonitorProps: record('setFairlightAudioMixerMonitorProps'),
    setFairlightAudioMixerSourceProps: record('setFairlightAudioMixerSourceProps'),
    setClassicAudioMixerInputProps: record('setClassicAudioMixerInputProps'),
    startStreaming: record('startStreaming'),
    stopStreaming: record('stopStreaming'),
    startRecording: record('startRecording'),
    stopRecording: record('stopRecording'),
  };
}

/** Disconnected switcher (fresh, no client attached). */
function makeDisconnected() {
  return new AtemSwitcher({ ip: '192.168.1.240' });
}

/** Connected switcher with a mocked client. */
function makeConnected(state = {}) {
  const sw = new AtemSwitcher({ ip: '192.168.1.240' });
  const mock = makeMockAtemClient(state);
  sw.atem = mock;
  sw.connected = true;
  return { sw, mock };
}

describe('AtemSwitcher initialization and default state', () => {
  it('starts disconnected with safe Extreme defaults', () => {
    const sw = makeDisconnected();
    assert.equal(sw.connected, false);
    assert.equal(sw.programInput, 0);
    assert.equal(sw.previewInput, 0);
    assert.equal(sw.isStreaming, false);
    assert.equal(sw.isRecording, false);
    assert.equal(sw.inputsCount, 8);
    assert.equal(sw.superSourceEnabled, false);
    assert.equal(sw.audioMuted, false);
    assert.deepEqual(sw.macros, []);
    sw.stop();
  });

  it('getState() exports the full Extreme shape', () => {
    const sw = makeDisconnected();
    try {
      const s = sw.getState();
      assert.equal(s.connected, false);
      assert.equal(s.modelName, 'ATEM Switcher');
      assert.equal(s.inputsCount, 8);
      assert.equal(s.programInput, 0);
      assert.equal(s.previewInput, 0);
      assert.equal(s.superSourceEnabled, false);
      assert.equal(s.isStreaming, false);
      assert.equal(s.isRecording, false);
      assert.equal(s.streamingState, 'idle');
      assert.equal(s.streamDuration, 0);
      assert.equal(s.aux1Source, 1);
      assert.equal(s.aux2Source, 1);
      assert.deepEqual(s.macros, []);
      assert.equal(s.audioMuted, false);
      assert.equal(s.hasSuperSource, true);
      assert.equal(s.hasMacros, true);
      assert.equal(s.hasAuxOutputs, true);
    } finally {
      sw.stop();
    }
  });
});

describe('input validation (1-8, specials)', () => {
  it('accepts HDMI inputs 1 through 8 when connected', async () => {
    const { sw, mock } = makeConnected();
    try {
      for (let input = 1; input <= 8; input++) {
        const res = await sw.changeProgramInput(input);
        assert.equal(res.success, true);
        assert.equal(res.programInput, input);
      }
      assert.equal(mock.calls.filter((c) => c.method === 'changeProgramInput').length, 8);
    } finally {
      sw.stop();
    }
  });

  it('accepts special inputs: Black, Bars, Media Players, SuperSource', async () => {
    const { sw } = makeConnected();
    try {
      for (const input of [0, 1000, 3010, 3020, 6000]) {
        const pgm = await sw.changeProgramInput(input);
        assert.equal(pgm.success, true, `program input ${input} should succeed`);
        const pvw = await sw.changePreviewInput(input);
        assert.equal(pvw.success, true, `preview input ${input} should succeed`);
      }
    } finally {
      sw.stop();
    }
  });

  it('rejects out-of-range inputs with RangeError (even when connected)', async () => {
    const { sw, mock } = makeConnected();
    try {
      for (const bad of [9, 999, 9999, -1, 2000]) {
        await assert.rejects(() => sw.changeProgramInput(bad), RangeError, `input ${bad}`);
        await assert.rejects(() => sw.changePreviewInput(bad), RangeError, `input ${bad}`);
      }
      assert.equal(mock.calls.length, 0, 'no protocol calls for invalid inputs');
    } finally {
      sw.stop();
    }
  });

  it('rejects non-numeric inputs with TypeError', async () => {
    const { sw } = makeConnected();
    try {
      await assert.rejects(() => sw.changeProgramInput('abc'), TypeError);
      await assert.rejects(() => sw.changeProgramInput(undefined), TypeError);
    } finally {
      sw.stop();
    }
  });

  it('rejects invalid mix-effect indices', async () => {
    const { sw } = makeConnected();
    try {
      await assert.rejects(() => sw.changeProgramInput(1, -1), RangeError);
      await assert.rejects(() => sw.cut('nope'), RangeError);
    } finally {
      sw.stop();
    }
  });
});

describe('graceful behavior when disconnected', () => {
  it('valid calls resolve (not reject) with success:false when disconnected', async () => {
    const sw = makeDisconnected();
    try {
      for (const result of [
        await sw.changeProgramInput(1),
        await sw.changePreviewInput(2),
        await sw.cut(),
        await sw.autoTransition(),
        await sw.fadeToBlack(),
        await sw.enableSuperSource(true),
        await sw.setSuperSourceBox(0, true, 1),
        await sw.setSuperSourcePreset('sideBySide'),
        await sw.runMacro(0),
        await sw.setAuxSource(0, 1),
        await sw.setAudioInputMaster(true),
        await sw.setAudioChannelMute(1, true),
        await sw.startStreaming(),
        await sw.stopStreaming(),
        await sw.startRecording(),
        await sw.stopRecording(),
      ]) {
        assert.equal(result.success, false);
        assert.equal(result.connected, false);
        assert.match(result.error, /not connected/);
      }
    } finally {
      sw.stop();
    }
  });

  it('invalid args still reject when disconnected (validation runs first)', async () => {
    const sw = makeDisconnected();
    try {
      await assert.rejects(() => sw.changeProgramInput(42), RangeError);
      await assert.rejects(() => sw.runMacro(500), RangeError);
      await assert.rejects(() => sw.setSuperSourcePreset('bogus'), RangeError);
      await assert.rejects(() => sw.setAuxSource(7, 1), RangeError);
    } finally {
      sw.stop();
    }
  });
});

describe('connected control methods (mocked client)', () => {
  it('cut/auto/ftb resolve and forward the ME index', async () => {
    const { sw, mock } = makeConnected();
    try {
      assert.deepEqual(await sw.cut(), { success: true, action: 'cut', me: 0 });
      assert.deepEqual(await sw.autoTransition(), { success: true, action: 'auto', me: 0 });
      assert.deepEqual(await sw.fadeToBlack(), { success: true, action: 'ftb', me: 0 });
      assert.deepEqual(mock.calls.map((c) => c.method), ['cut', 'autoTransition', 'fadeToBlack']);
    } finally {
      sw.stop();
    }
  });

  it('runMacro forwards the 0-based index and tracks the player', async () => {
    const { sw, mock } = makeConnected();
    try {
      const res = await sw.runMacro(1);
      assert.deepEqual(res, { success: true, macroIndex: 1 });
      assert.deepEqual(mock.calls[0], { method: 'macroRun', args: [1] });
      assert.equal(sw.getState().macroPlayer.macroIndex, 1);
      await assert.rejects(() => sw.runMacro(-1), RangeError);
      await assert.rejects(() => sw.runMacro(100), RangeError);
    } finally {
      sw.stop();
    }
  });

  it('setAuxSource validates aux 0-1 and forwards (source, bus)', async () => {
    const { sw, mock } = makeConnected();
    try {
      const res = await sw.setAuxSource(1, 3);
      assert.deepEqual(res, { success: true, auxIndex: 1, inputSource: 3 });
      assert.deepEqual(mock.calls[0], { method: 'setAuxSource', args: [3, 1] });
      assert.equal(sw.getState().aux2Source, 3);
      await assert.rejects(() => sw.setAuxSource(2, 1), RangeError);
      await assert.rejects(() => sw.setAuxSource(0, 99), RangeError);
    } finally {
      sw.stop();
    }
  });

  it('enableSuperSource(true) cues 6000 to preview and sets the flag', async () => {
    const { sw, mock } = makeConnected();
    try {
      const res = await sw.enableSuperSource(true);
      assert.deepEqual(res, { success: true, superSourceEnabled: true });
      assert.deepEqual(mock.calls[0], { method: 'changePreviewInput', args: [6000, 0] });
      assert.equal(sw.getState().superSourceEnabled, true);
      assert.equal(sw.getState().previewInput, 6000);

      const off = await sw.enableSuperSource(false);
      assert.equal(off.superSourceEnabled, false);
      assert.equal(mock.calls.length, 1, 'disabling sends no bus command');
    } finally {
      sw.stop();
    }
  });

  it('setSuperSourceBox validates box 0-3 and forwards settings', async () => {
    const { sw, mock } = makeConnected();
    try {
      const res = await sw.setSuperSourceBox(1, true, 2);
      assert.deepEqual(res, { success: true, box: 1, enabled: true, inputSource: 2 });
      assert.deepEqual(mock.calls[0], {
        method: 'setSuperSourceBoxSettings',
        args: [{ enabled: true, source: 2 }, 1, 0],
      });
      await assert.rejects(() => sw.setSuperSourceBox(4, true, 1), RangeError);
      await assert.rejects(() => sw.setSuperSourceBox(0, true, 77), RangeError);
    } finally {
      sw.stop();
    }
  });

  it('setSuperSourcePreset applies box sources per layout', async () => {
    const { sw, mock } = makeConnected();
    try {
      const res = await sw.setSuperSourcePreset('sideBySide');
      assert.equal(res.success, true);
      assert.equal(res.preset, 'sideBySide');
      const boxCalls = mock.calls.filter((c) => c.method === 'setSuperSourceBoxSettings');
      assert.equal(boxCalls.length, 4);
      assert.equal(boxCalls[0].args[0].source, 1);
      assert.equal(boxCalls[0].args[0].enabled, true);
      assert.equal(boxCalls[1].args[0].source, 2);
      assert.equal(boxCalls[1].args[0].enabled, true);
      assert.equal(boxCalls[2].args[0].enabled, false);
      assert.equal(sw.getState().superSourceEnabled, true);

      mock.calls.length = 0;
      await sw.setSuperSourcePreset('split');
      const splitCalls = mock.calls.filter((c) => c.method === 'setSuperSourceBoxSettings');
      assert.equal(splitCalls[1].args[0].source, 3);

      await assert.rejects(() => sw.setSuperSourcePreset('quad'), RangeError);
    } finally {
      sw.stop();
    }
  });

  it('audio master mute resolves and tracks audioMuted', async () => {
    const { sw, mock } = makeConnected();
    try {
      const res = await sw.setAudioInputMaster(true);
      assert.deepEqual(res, { success: true, audioMuted: true });
      assert.deepEqual(mock.calls[0], {
        method: 'setFairlightAudioMixerMonitorProps',
        args: [{ inputMasterMuted: true }],
      });
      assert.equal(sw.getState().audioMuted, true);
    } finally {
      sw.stop();
    }
  });

  it('audio channel mute uses Fairlight source props with Off mix option', async () => {
    const state = { fairlight: { inputs: { 1: { sources: { 1: { properties: { mixOption: 2 } } } } } } };
    const { sw, mock } = makeConnected(state);
    try {
      const res = await sw.setAudioChannelMute(1, true);
      assert.deepEqual(res, { success: true, channelId: 1, muted: true });
      assert.equal(mock.calls[0].method, 'setFairlightAudioMixerSourceProps');
      assert.equal(mock.calls[0].args[0], 1);
      assert.equal(mock.calls[0].args[2].mixOption, 1); // FairlightAudioMixOption.Off
      assert.equal(sw.getState().audioChannels[1].muted, true);
      await assert.rejects(() => sw.setAudioChannelMute(-1), RangeError);
      await assert.rejects(() => sw.setAudioChannelMute(65), RangeError);
    } finally {
      sw.stop();
    }
  });

  it('streaming/record toggles resolve with mocked client', async () => {
    const { sw } = makeConnected();
    try {
      assert.equal((await sw.startStreaming()).isStreaming, true);
      assert.equal((await sw.toggleStreaming()).isStreaming, false);
      assert.equal((await sw.startRecording()).isRecording, true);
      assert.equal((await sw.toggleRecording()).isRecording, false);
    } finally {
      sw.stop();
    }
  });
});

describe('model detection and state sync', () => {
  it('detects ATEM Mini Extreme (model 16) with 8 inputs', () => {
    const sw = makeDisconnected();
    try {
      sw._updateModelInfo({
        model: 16,
        productIdentifier: 'ATEM Mini Extreme',
        capabilities: { superSources: 1, auxilliaries: 2, sources: 8 },
        macroPool: { macroCount: 100 },
      });
      const s = sw.getState();
      assert.equal(s.modelName, 'ATEM Mini Extreme');
      assert.equal(s.modelId, 16);
      assert.equal(s.inputsCount, 8);
      assert.equal(s.hasSuperSource, true);
      assert.equal(s.hasAuxOutputs, true);
      assert.equal(s.hasMacros, true);
    } finally {
      sw.stop();
    }
  });

  it('detects ATEM Mini Pro (model 14) with 4 inputs', () => {
    const sw = makeDisconnected();
    try {
      sw._updateModelInfo({ model: 14, capabilities: { superSources: 0, auxilliaries: 1 } });
      const s = sw.getState();
      assert.equal(s.modelName, 'ATEM Mini Pro');
      assert.equal(s.inputsCount, 4);
      assert.equal(s.hasSuperSource, false);
    } finally {
      sw.stop();
    }
  });

  it('syncs program/preview, aux, macros, supersource and fairlight from state changes', () => {
    const sw = makeDisconnected();
    try {
      const state = {
        video: {
          mixEffects: [{ programInput: 5, previewInput: 6000 }],
          auxilliaries: [2, 7],
          superSources: [{ boxes: [{ enabled: true }, { enabled: false }] }],
        },
        macro: {
          macroPlayer: { isRunning: true, isWaiting: false, loop: false, macroIndex: 2 },
          macroProperties: [{ name: 'Intro', isUsed: true }, { name: '', isUsed: false }],
        },
        fairlight: {
          monitor: { inputMasterMuted: true },
          inputs: { 1: { sources: { 1: { properties: { mixOption: 1 } } } } },
        },
        streaming: { status: { state: 'streaming' } },
        recording: { status: { state: 'idle' } },
      };
      sw._handleStateChange(state, [
        'video.mixEffects.0.programInput',
        'video.mixEffects.0.previewInput',
        'video.auxilliaries',
        'video.superSources',
        'macro.macroPlayer',
        'fairlight.monitor',
        'streaming.status',
        'recording.status',
      ]);
      const s = sw.getState();
      assert.equal(s.programInput, 5);
      assert.equal(s.previewInput, 6000);
      assert.equal(s.aux1Source, 2);
      assert.equal(s.aux2Source, 7);
      assert.equal(s.superSourceEnabled, true);
      assert.equal(s.macros.length, 1);
      assert.equal(s.macros[0].name, 'Intro');
      assert.equal(s.macroPlayer.isRunning, true);
      assert.equal(s.audioMuted, true);
      assert.equal(s.audioChannels[1].muted, true);
      assert.equal(s.isStreaming, true);
      assert.equal(s.isRecording, false);
    } finally {
      sw.stop();
    }
  });
});
