/**
 * server.js
 * Sanctuary AV Controller — Main Server
 *
 * Express HTTP server serving the dashboard frontend,
 * with a WebSocket server pushing aggregated real-time state
 * from REAPER, ATEM, YouTube, and network diagnostics.
 * Includes runtime dynamic configuration management, GroupMe Bot alerts,
 * and scheduled window enforcement (Sundays 9am-3pm with 24/7 duration protection).
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');
const fs = require('fs');

// Integration modules
const ReaperOSC = require('./modules/reaper-osc');
const AtemSwitcher = require('./modules/atem');
const YouTubeMonitor = require('./modules/youtube');
const OBSMonitor = require('./modules/obs');
const ProclaimMonitor = require('./modules/proclaim');
const CaptionerClient = require('./modules/captioner');
const { PTZOpticsManager } = require('./modules/ptzoptics');
const NetworkPing = require('./modules/network-ping');
const AlertEngine = require('./modules/alerts');
const AlertNotifier = require('./modules/notifier');
const ServiceReportManager = require('./modules/reports');
const ChecklistManager = require('./modules/checklist');
const AutoUpdater = require('./modules/updater');

const PORT = parseInt(process.env.PORT, 10) || 3050;
const CONFIG_FILE = path.join(__dirname, 'config.json');

// ── Configuration Manager ───────────────────────
function loadConfig() {
  const defaults = {
    serverPort: PORT,
    reaperHost: process.env.REAPER_HOST || '127.0.0.1',
    reaperSendPort: parseInt(process.env.REAPER_OSC_SEND_PORT, 10) || 9000,
    reaperReceivePort: parseInt(process.env.REAPER_OSC_RECEIVE_PORT, 10) || 8000,
    atemIp: process.env.ATEM_IP || '192.168.1.240',
    gatewayIp: process.env.GATEWAY_IP || '192.168.1.1',
    youtubeIngestHost: process.env.YOUTUBE_INGEST_HOST || 'a.rtmp.youtube.com',
    youtubeClientId: process.env.YOUTUBE_CLIENT_ID || '',
    youtubeClientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
    youtubeVideoId: process.env.YOUTUBE_VIDEO_ID || '',
    // Facility & UI Customization
    facilityName: process.env.FACILITY_NAME || 'SANCTUARY AV',
    facilitySubtitle: process.env.FACILITY_SUBTITLE || 'LIVE RACK',
    facilityDescription: process.env.FACILITY_DESCRIPTION || 'Telemetry & Broadcast Health Monitor',
    clockFormat: process.env.CLOCK_FORMAT || '24h', // '24h' or '12h'
    // Enabled Modules / Signal Chain Nodes
    modulesEnabled: {
      proclaim: true,
      reaper: true,
      atem: true,
      ptz: true,
      obs: true,
      captioner: true,
      youtube: true,
      stations: {
        checklist: true,
        cameras: true,
        audio: true,
        captions: true,
        broadcast: true,
      },
    },
    // Alert Engine Thresholds & Rule Toggles
    maxDurationMin: 120,
    silenceTimeoutSec: 120, // 2 minutes (120 seconds)
    silenceDbThreshold: -50, // dBFS
    minBitrateKbps: 2000,
    alertsEnabled: true,
    alertSilenceEnabled: true,
    alertOvertimeEnabled: true,
    alertDisconnectEnabled: true,
    alertNetworkEnabled: true,
    // GroupMe Dual-Bot Routing
    groupmeEnabled: false,
    groupmeBotId: process.env.GROUPME_BOT_ID || '',
    groupmeMainBotId: process.env.GROUPME_MAIN_BOT_ID || process.env.GROUPME_BOT_ID || '',
    groupmeTechBotId: process.env.GROUPME_TECH_BOT_ID || '',
    // Schedule Window Configuration (Sundays 9am-3pm)
    scheduleEnabled: true,
    scheduleDays: [0], // 0 = Sunday
    scheduleStart: '09:00',
    scheduleEnd: '15:00',
    // OBS Studio Configuration
    obsHost: process.env.OBS_HOST || '127.0.0.1',
    obsPort: parseInt(process.env.OBS_PORT, 10) || 4455,
    obsPassword: process.env.OBS_PASSWORD || '',
    // Proclaim Configuration
    proclaimHost: process.env.PROCLAIM_HOST || '',
    proclaimPort: parseInt(process.env.PROCLAIM_PORT, 10) || 52195,
    proclaimPassword: process.env.PROCLAIM_PASSWORD || '',
    // OBS Live Captioner & Screen Recovery Configuration (VoxStream)
    captionerEnabled: true,
    captionerApiUrl: process.env.CAPTIONER_API_URL || 'http://127.0.0.1:8765',
    captionerApiKey: process.env.CAPTIONER_API_KEY || '',
    captionerMonitorIndex: parseInt(process.env.CAPTIONER_MONITOR_INDEX, 10) || 1,
    captionerMixType: process.env.CAPTIONER_MIX_TYPE || 'preview',
  };

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return { ...defaults, ...saved };
    } catch (e) {
      console.warn('[Config] Failed to parse config.json, using defaults');
    }
  }

  return defaults;
}

let activeConfig = loadConfig();

// ── Initialize Integration Modules ──────────────
const reaper = new ReaperOSC({
  host: activeConfig.reaperHost,
  sendPort: activeConfig.reaperSendPort,
  receivePort: activeConfig.reaperReceivePort,
});

const atem = new AtemSwitcher({
  ip: activeConfig.atemIp,
});

const youtube = new YouTubeMonitor({
  clientId: activeConfig.youtubeClientId,
  clientSecret: activeConfig.youtubeClientSecret,
  redirectUri: `http://localhost:${PORT}/oauth2callback`,
  videoId: activeConfig.youtubeVideoId,
  streamId: activeConfig.youtubeStreamId,
});

const obs = new OBSMonitor({
  host: `${activeConfig.obsHost}:${activeConfig.obsPort}`,
  password: activeConfig.obsPassword,
});

const proclaim = new ProclaimMonitor({
  host: activeConfig.proclaimHost,
  port: activeConfig.proclaimPort,
  password: activeConfig.proclaimPassword,
});

const captioner = new CaptionerClient({
  apiUrl: activeConfig.captionerApiUrl,
  apiKey: activeConfig.captionerApiKey,
  targetMonitorIndex: activeConfig.captionerMonitorIndex,
  defaultMixType: activeConfig.captionerMixType,
  enabled: activeConfig.captionerEnabled,
});

const ptz = new PTZOpticsManager(activeConfig);

const network = new NetworkPing({
  reaperHost: activeConfig.reaperHost,
  atemIp: activeConfig.atemIp,
  youtubeIngestHost: activeConfig.youtubeIngestHost,
  gatewayIp: activeConfig.gatewayIp,
});

const notifier = new AlertNotifier({
  groupmeEnabled: activeConfig.groupmeEnabled,
  groupmeBotId: activeConfig.groupmeBotId,
  groupmeMainBotId: activeConfig.groupmeMainBotId,
  groupmeTechBotId: activeConfig.groupmeTechBotId,
  scheduleEnabled: activeConfig.scheduleEnabled,
  scheduleDays: activeConfig.scheduleDays,
  scheduleStart: activeConfig.scheduleStart,
  scheduleEnd: activeConfig.scheduleEnd,
});

const alerts = new AlertEngine(notifier);
alerts.updateThresholds({
  maxDurationMin: activeConfig.maxDurationMin,
  silenceTimeoutSec: activeConfig.silenceTimeoutSec,
  silenceDbThreshold: activeConfig.silenceDbThreshold,
  minBitrateKbps: activeConfig.minBitrateKbps,
  alertsEnabled: activeConfig.alertsEnabled,
  alertSilenceEnabled: activeConfig.alertSilenceEnabled,
  alertOvertimeEnabled: activeConfig.alertOvertimeEnabled,
  alertDisconnectEnabled: activeConfig.alertDisconnectEnabled,
  alertNetworkEnabled: activeConfig.alertNetworkEnabled,
  modulesEnabled: activeConfig.modulesEnabled,
});

const reports = new ServiceReportManager(notifier, alerts);
const checklist = new ChecklistManager(notifier, reports);
const updater = new AutoUpdater({
  rootDir: __dirname,
  onStateChange: () => {
    broadcastState();
  },
});

function saveConfig(newConfig) {
  activeConfig = { ...activeConfig, ...newConfig };
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(activeConfig, null, 2), 'utf8');
    console.log('[Config] Saved settings to config.json');
  } catch (err) {
    console.error('[Config] Failed to save config.json:', err.message);
  }

  // Update running modules
  reaper.updateConfig({
    host: activeConfig.reaperHost,
    sendPort: activeConfig.reaperSendPort,
    receivePort: activeConfig.reaperReceivePort,
  });

  atem.updateConfig({
    ip: activeConfig.atemIp,
  });

  youtube.updateConfig({
    clientId: activeConfig.youtubeClientId,
    clientSecret: activeConfig.youtubeClientSecret,
    videoId: activeConfig.youtubeVideoId,
    streamId: activeConfig.youtubeStreamId,
  });

  network.updateConfig({
    reaperHost: activeConfig.reaperHost,
    atemIp: activeConfig.atemIp,
    youtubeIngestHost: activeConfig.youtubeIngestHost,
    gatewayIp: activeConfig.gatewayIp,
  });

  obs.updateConfig({
    host: `${activeConfig.obsHost}:${activeConfig.obsPort}`,
    password: activeConfig.obsPassword,
  });

  proclaim.updateConfig({
    host: activeConfig.proclaimHost,
    port: activeConfig.proclaimPort,
    password: activeConfig.proclaimPassword,
  });

  captioner.updateConfig({
    captionerApiUrl: activeConfig.captionerApiUrl,
    captionerApiKey: activeConfig.captionerApiKey,
    captionerMonitorIndex: activeConfig.captionerMonitorIndex,
    captionerMixType: activeConfig.captionerMixType,
    captionerEnabled: activeConfig.captionerEnabled,
  });

  ptz.updateConfig(activeConfig);

  notifier.updateConfig({
    groupmeEnabled: activeConfig.groupmeEnabled,
    groupmeBotId: activeConfig.groupmeBotId,
    groupmeMainBotId: activeConfig.groupmeMainBotId,
    groupmeTechBotId: activeConfig.groupmeTechBotId,
    scheduleEnabled: activeConfig.scheduleEnabled,
    scheduleDays: activeConfig.scheduleDays,
    scheduleStart: activeConfig.scheduleStart,
    scheduleEnd: activeConfig.scheduleEnd,
  });

  alerts.updateThresholds({
    maxDurationMin: activeConfig.maxDurationMin,
    silenceTimeoutSec: activeConfig.silenceTimeoutSec,
    silenceDbThreshold: activeConfig.silenceDbThreshold,
    minBitrateKbps: activeConfig.minBitrateKbps,
    alertsEnabled: activeConfig.alertsEnabled,
    alertSilenceEnabled: activeConfig.alertSilenceEnabled,
    alertOvertimeEnabled: activeConfig.alertOvertimeEnabled,
    alertDisconnectEnabled: activeConfig.alertDisconnectEnabled,
    alertNetworkEnabled: activeConfig.alertNetworkEnabled,
    modulesEnabled: activeConfig.modulesEnabled,
  });

  broadcastConfig();
}

// ── Initialize Express ──────────────────────────
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Reset configuration to factory defaults
app.post('/api/config/reset', (req, res) => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
    activeConfig = loadConfig();
    saveConfig(activeConfig);
    alerts.addEvent('info', 'Configuration reset to factory defaults');
    res.json({ success: true, config: activeConfig });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mini-HUD route
app.get('/hud', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'hud.html'));
});

// Dedicated Mobile-First Station Routes
app.get('/cameras', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cameras.html'));
});

app.get('/audio', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'audio.html'));
});

app.get('/captions', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'captions.html'));
});

app.get('/stage', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'captions.html'));
});

app.get('/broadcast', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'broadcast.html'));
});

app.get('/obs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'broadcast.html'));
});

app.get('/diagnostics', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'broadcast.html'));
});

app.get('/hub', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/checklist', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'checklist.html'));
});

app.get('/guide', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'guide.html'));
});

app.get('/training', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'guide.html'));
});

// ── Sunday Checklist & Reports REST APIs ────────
app.get('/api/checklist', (req, res) => {
  res.json(checklist.getItems());
});

app.post('/api/checklist/toggle', (req, res) => {
  const { id, checked } = req.body;
  res.json(checklist.toggleItem(id, checked));
});

app.post('/api/checklist/verify-all', (req, res) => {
  const state = getAggregatedState();
  res.json(checklist.runAutomatedDiagnostics(state));
});

app.post('/api/checklist/auto-check', (req, res) => {
  const state = getAggregatedState();
  res.json(checklist.runAutomatedDiagnostics(state));
});

app.post('/api/checklist/sign-off', async (req, res) => {
  const { volunteerName } = req.body;
  const result = await checklist.signOff(volunteerName, true);
  res.json(result);
});

app.post('/api/checklist/reset', (req, res) => {
  res.json(checklist.reset());
});

app.post('/api/checklist/enable-item', (req, res) => {
  const { id, enabled } = req.body;
  res.json(checklist.setItemEnabled(id, enabled));
});

app.get('/api/reports', (req, res) => {
  res.json(reports.getPastReports());
});

app.post('/api/reports/generate', async (req, res) => {
  const report = await reports.stopSessionAndGenerateReport(true);
  res.json(report);
});

// ── GitHub AutoUpdater REST Routes ─────────────────────────
app.get('/api/updater/status', (req, res) => {
  res.json(updater.getState());
});

app.post('/api/updater/check', async (req, res) => {
  try {
    const status = await updater.checkForUpdates();
    res.json(status);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/updater/update', async (req, res) => {
  try {
    const result = await updater.performUpdate();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// REST APIs
app.get('/api/status', (req, res) => {
  res.json(getAggregatedState());
});

app.get('/api/config', (req, res) => {
  res.json(activeConfig);
});

app.get('/api/hud-status', (req, res) => {
  const state = getAggregatedState();
  const isLive = Boolean(state.atem?.isStreaming || state.obs?.isStreaming || state.youtube?.broadcastState === 'live');
  const durSec = Math.max(state.atem?.streamDuration || 0, state.obs?.streamDuration || 0);
  const h = Math.floor(durSec / 3600).toString().padStart(2, '0');
  const m = Math.floor((durSec % 3600) / 60).toString().padStart(2, '0');
  const s = (durSec % 60).toString().padStart(2, '0');
  const durStr = `${h}:${m}:${s}`;

  const bitrate = state.obs?.outputBitrate || (state.atem?.isStreaming ? 4500 : 0);
  let summary = isLive ? `LIVE ${durStr}` : 'OFFLINE';
  if (state.alerts?.isOvertime) summary += ' | 🚨 OVERTIME (>2H)';
  else if (state.alerts?.isSilent) summary += ' | ⚠️ SILENCE';
  else if (isLive) summary += ` | ${bitrate}k`;

  res.json({
    summary,
    isLive,
    duration: durStr,
    bitrateKbps: bitrate,
    audioDb: state.reaper.leftDb,
    isSilent: state.alerts.isSilent,
    viewers: state.youtube.viewerCount || 0,
    streamHealth: state.youtube.streamHealth,
    globalStatus: state.global.status,
    obsScene: state.obs.currentScene,
    proclaimOnAir: state.proclaim.onAir
  });
});

app.post('/api/config', (req, res) => {
  saveConfig(req.body);
  res.json({ success: true, config: activeConfig });
});

app.post('/api/test-groupme', async (req, res) => {
  try {
    const botType = req.body?.botType || 'main';
    const result = await notifier.sendTestGroupMe(botType);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── Emergency Display & Captioner Control Endpoints ──
/**
 * Forcefully Reopen Screen (LONTIUM / Monitor 1) and Resume Live Captions
 */
async function executeEmergencyReopenScreen(options = {}) {
  const monitorIndex = options.monitor_index !== undefined ? parseInt(options.monitor_index, 10) : (activeConfig.captionerMonitorIndex || 1);
  const mixType = options.mix_type || activeConfig.captionerMixType || 'preview';

  console.log(`[Emergency] 📺 Restoring Display on Monitor ${monitorIndex} (Mix: ${mixType})...`);

  const results = {
    obsProjector: null,
    captioner: null,
  };

  // 1. Direct OBS Projector trigger via WebSocket
  if (obs.connected) {
    try {
      results.obsProjector = await obs.openProjector({ monitorIndex, mixType });
      console.log(`[Emergency] ✓ OBS Projector triggered successfully`);
    } catch (err) {
      results.obsProjector = { success: false, error: err.message };
    }
  } else {
    results.obsProjector = { success: false, error: 'OBS not connected via WebSocket' };
  }

  // 2. Live Captioner PRO API trigger (port 8080)
  try {
    results.captioner = await captioner.reopenScreen({ monitor_index: monitorIndex, mix_type: mixType });
  } catch (err) {
    results.captioner = { success: false, error: err.message };
  }

  const overallSuccess = Boolean((results.obsProjector && results.obsProjector.success) || (results.captioner && results.captioner.success));

  // Log event to alert stream
  alerts.addEvent('info', `📺 Emergency Screen Restored: Monitor ${monitorIndex} (${mixType}) & Captions Active`);

  // Broadcast toast event to all connected WebSocket clients
  const toastMsg = JSON.stringify({
    type: 'EMERGENCY_REOPEN_SCREEN_TRIGGERED',
    data: {
      success: overallSuccess,
      message: `LONTIUM Screen (Monitor ${monitorIndex}) & Captions Active!`,
      details: results,
    },
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(toastMsg);
    }
  });

  return {
    success: true,
    message: `LONTIUM Screen (Monitor ${monitorIndex}) & Captions Active!`,
    monitor_index: monitorIndex,
    mix_type: mixType,
    details: results,
  };
}

// Emergency REST Routes (Matches OBS Live Captioner PRO API spec)
app.post('/api/control/reopen-screen', async (req, res) => {
  try {
    const opts = { ...req.query, ...req.body };
    const result = await executeEmergencyReopenScreen(opts);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/control/restore-display', async (req, res) => {
  try {
    const opts = { ...req.query, ...req.body };
    const result = await executeEmergencyReopenScreen(opts);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/control/open-projector', async (req, res) => {
  try {
    const monitorIndex = req.body?.monitorIndex || req.query?.monitorIndex || activeConfig.captionerMonitorIndex || 1;
    const mixType = req.body?.mixType || req.query?.mixType || activeConfig.captionerMixType || 'preview';
    const result = await obs.openProjector({ monitorIndex, mixType });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Emergency Panic Button (Blanks all captions and mutes output)
app.post(['/api/control/clear', '/api/captioner/clear'], async (req, res) => {
  try {
    const result = await captioner.clear();
    
    // Broadcast cleared state to all connected clients
    const clearMsg = JSON.stringify({
      type: 'STATE_UPDATE',
      data: getAggregatedState()
    });
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(clearMsg); });

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/control/panic', async (req, res) => {
  try {
    const result = await captioner.panic();
    alerts.addEvent('warn', '🚨 Emergency Panic Triggered: Screen Captions Blanked & Muted');
    
    // Broadcast toast to all WebSocket clients
    const panicToast = JSON.stringify({
      type: 'CAPTIONER_PANIC_TRIGGERED',
      data: { message: '🚨 Captions Panic Active: Screens Blanked & Muted' },
    });
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(panicToast); });

    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/control/start', async (req, res) => {
  try {
    const result = await captioner.startCaptions();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/control/stop', async (req, res) => {
  try {
    const result = await captioner.stopCaptions();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/control/toggle', async (req, res) => {
  try {
    const result = await captioner.toggleCaptions();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/captioner/status', (req, res) => {
  res.json(captioner.getState());
});

app.get('/api/captioner/diagnose', async (req, res) => {
  try {
    const report = await captioner.diagnose();
    res.json(report);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/captioner/monitors', async (req, res) => {
  const result = await captioner.getObsMonitors();
  res.json(result);
});

app.get('/api/captioner/devices', async (req, res) => {
  const result = await captioner.getAudioDevices();
  res.json(result);
});

// ── ATEM Video Switching & Camera Control REST Routes ──────
app.get('/api/control/status', (req, res) => {
  res.json(captioner.getState());
});

app.post('/api/atem/program', async (req, res) => {
  try {
    const input = req.body?.input || req.query?.input || 1;
    const me = req.body?.me || req.query?.me || 0;
    const result = await atem.changeProgramInput(input, me);
    res.json(result);
  } catch (err) {
    res.json({ success: false, connected: false, error: err.message });
  }
});

app.post('/api/atem/preview', async (req, res) => {
  try {
    const input = req.body?.input || req.query?.input || 2;
    const me = req.body?.me || req.query?.me || 0;
    const result = await atem.changePreviewInput(input, me);
    res.json(result);
  } catch (err) {
    res.json({ success: false, connected: false, error: err.message });
  }
});

app.post('/api/atem/cut', async (req, res) => {
  try {
    const me = req.body?.me || req.query?.me || 0;
    reports.recordAtemCut();
    const result = await atem.cut(me);
    res.json(result);
  } catch (err) {
    res.json({ success: false, connected: false, error: err.message });
  }
});

app.post('/api/atem/auto', async (req, res) => {
  try {
    const me = req.body?.me || req.query?.me || 0;
    reports.recordAtemCut();
    const result = await atem.autoTransition(me);
    res.json(result);
  } catch (err) {
    res.json({ success: false, connected: false, error: err.message });
  }
});

app.post('/api/atem/ftb', async (req, res) => {
  try {
    const me = req.body?.me || req.query?.me || 0;
    const result = await atem.fadeToBlack(me);
    res.json(result);
  } catch (err) {
    res.json({ success: false, connected: false, error: err.message });
  }
});

// ATEM Live Stream & Record Endpoints (Primary Broadcast Encoder)
app.post('/api/atem/stream/start', async (req, res) => {
  try {
    const result = await atem.startStreaming();
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/atem/stream/stop', async (req, res) => {
  try {
    const result = await atem.stopStreaming();
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/atem/stream/toggle', async (req, res) => {
  try {
    const result = await atem.toggleStreaming();
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/atem/record/start', async (req, res) => {
  try {
    const result = await atem.startRecording();
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/atem/record/stop', async (req, res) => {
  try {
    const result = await atem.stopRecording();
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/atem/record/toggle', async (req, res) => {
  try {
    const result = await atem.toggleRecording();
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── OBS Studio Remote Broadcast Control REST Routes ───────
app.get('/api/obs/status', (req, res) => {
  res.json(obs.getState());
});

app.post('/api/obs/stream/start', async (req, res) => {
  try {
    const result = await obs.startStream();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/obs/stream/stop', async (req, res) => {
  try {
    const result = await obs.stopStream();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/obs/stream/toggle', async (req, res) => {
  try {
    const result = await obs.toggleStream();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/obs/record/start', async (req, res) => {
  try {
    const result = await obs.startRecord();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/obs/record/stop', async (req, res) => {
  try {
    const result = await obs.stopRecord();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/obs/record/toggle', async (req, res) => {
  try {
    const result = await obs.toggleRecord();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/obs/record/pause', async (req, res) => {
  try {
    const result = await obs.toggleRecordPause();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/obs/scene', async (req, res) => {
  try {
    const { sceneName, scene } = { ...req.query, ...req.body };
    const targetScene = sceneName || scene;
    const result = await obs.setScene(targetScene);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/obs/preview-scene', async (req, res) => {
  try {
    const { sceneName, scene } = { ...req.query, ...req.body };
    const targetScene = sceneName || scene;
    const result = await obs.setPreviewScene(targetScene);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/obs/transition', async (req, res) => {
  try {
    const result = await obs.triggerStudioModeTransition();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/obs/studio-mode/toggle', async (req, res) => {
  try {
    const result = await obs.toggleStudioMode();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/obs/virtual-cam/toggle', async (req, res) => {
  try {
    const result = await obs.toggleVirtualCam();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/obs/mute', async (req, res) => {
  try {
    const { inputName, muted } = { ...req.query, ...req.body };
    const result = await obs.setInputMute(inputName, muted);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PTZOptics Camera Control REST Routes ───────────────────
app.get('/api/ptz/cameras', (req, res) => {
  res.json(ptz.getState());
});

app.post('/api/ptz/control', async (req, res) => {
  try {
    const { camera, action, direction, speed, zoomAction, focusAction } = { ...req.query, ...req.body };
    const camId = camera || ptz.activeCameraId || 'cam1';
    const parsedSpeed = speed !== undefined && speed !== null && speed !== '' ? parseInt(speed, 10) : undefined;
    let result;
    if (action === 'zoom') {
      result = await ptz.zoom(camId, zoomAction || direction || 'stop', Number.isNaN(parsedSpeed) ? undefined : parsedSpeed);
    } else if (action === 'focus') {
      result = await ptz.focus(camId, focusAction || direction || 'auto');
    } else {
      // Pan / Tilt: action === 'pan_tilt' OR action missing/undefined
      result = await ptz.panTilt(camId, direction || 'stop', Number.isNaN(parsedSpeed) ? undefined : parsedSpeed);
    }
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[PTZ] Control error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ptz/preset/recall', async (req, res) => {
  try {
    const { camera, preset } = { ...req.query, ...req.body };
    const camId = camera || ptz.activeCameraId || 'cam1';
    const presetNum = parseInt(preset, 10) || 1;
    reports.recordPtzRecall();
    const result = await ptz.recallPreset(camId, presetNum);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ptz/preset/save', async (req, res) => {
  try {
    const { camera, preset, name } = { ...req.query, ...req.body };
    const camId = camera || ptz.activeCameraId || 'cam1';
    const presetNum = parseInt(preset, 10) || 1;
    const result = await ptz.savePreset(camId, presetNum, name);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ptz/snapshot', async (req, res) => {
  try {
    const { camera, preset } = { ...req.query, ...req.body };
    const camId = camera || ptz.activeCameraId || 'cam1';
    const presetNum = parseInt(preset, 10) || 1;
    const result = await ptz.captureSnapshot(camId, presetNum);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ptz/active-camera', (req, res) => {
  const { camera } = { ...req.query, ...req.body };
  if (camera && ptz.setActiveCamera(camera)) {
    res.json({ success: true, activeCameraId: camera });
  } else {
    res.status(400).json({ success: false, error: 'Invalid camera ID' });
  }
});

// YouTube OAuth2 routes
app.get('/api/youtube-auth-url', (req, res) => {
  const url = youtube.getAuthUrl();
  if (url) {
    res.json({ success: true, url });
  } else {
    res.status(400).json({ success: false, error: 'YouTube credentials not configured' });
  }
});

app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('Missing authorization code');
  }
  try {
    await youtube.handleAuthCallback(code);
    res.send('<html><body style="background:#0a0d13;color:#10b981;font-family:Inter,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh"><div style="text-align:center"><h1>✓ YouTube Authorized</h1><p>You can close this tab and return to the dashboard.</p></div></body></html>');
    alerts.addEvent('info', 'YouTube API authorized successfully');
  } catch (err) {
    res.status(500).send(`<html><body style="background:#0a0d13;color:#ef4444;font-family:Inter,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh"><div style="text-align:center"><h1>✗ Authorization Failed</h1><p>${err.message}</p></div></body></html>`);
  }
});

const server = http.createServer(app);

// ── Initialize WebSocket Server ─────────────────
const wss = new WebSocketServer({ server });

// ── Aggregate State ─────────────────────────────
function getAggregatedState() {
  const modEnabled = activeConfig.modulesEnabled || {};
  const reaperState = reaper.getState();
  const atemState = atem.getState();
  const ytState = youtube.getState();
  const obsState = obs.getState();
  const proclaimState = proclaim.getState();
  const netState = network.getState();
  const alertState = alerts.getState();

  let globalStatus = 'normal';
  let globalMessage = 'All Systems Online';

  const proclaimConfigured = Boolean(activeConfig.proclaimHost && activeConfig.proclaimHost.trim());
  const reaperOk = modEnabled.reaper === false || reaperState.connected;
  const atemOk = modEnabled.atem === false || atemState.connected;
  const obsOk = modEnabled.obs === false || obsState.connected;
  const proclaimOk = !proclaimConfigured || modEnabled.proclaim === false || proclaimState.connected;

  // Derive live YouTube broadcast state from active streaming encoder (ATEM or OBS)
  const isStreamingAny = Boolean(atemState.isStreaming || obsState.isStreaming);
  if (!ytState.authenticated) {
    ytState.broadcastState = isStreamingAny ? 'live' : 'idle';
    ytState.streamHealth = isStreamingAny ? 'good' : 'noData';
  }

  if (alertState.isSilent) {
    globalStatus = 'critical';
    globalMessage = 'Audio Silence Detected';
  } else if (alertState.isOvertime) {
    globalStatus = 'warning';
    globalMessage = 'Stream Duration Exceeded (> 2 Hours)';
  } else if (!reaperOk && !atemOk) {
    globalStatus = 'critical';
    globalMessage = 'Core Systems Offline';
  } else if (!reaperOk) {
    globalStatus = 'warning';
    globalMessage = 'REAPER Disconnected';
  } else if (!atemOk) {
    globalStatus = 'warning';
    globalMessage = 'ATEM Disconnected';
  } else if (!obsOk) {
    globalStatus = 'warning';
    globalMessage = 'OBS Disconnected';
  } else if (proclaimConfigured && !proclaimOk) {
    globalStatus = 'warning';
    globalMessage = 'Proclaim Disconnected';
  } else {
    for (const [, ep] of Object.entries(netState.endpoints)) {
      if (!ep.alive) {
        globalStatus = 'warning';
        globalMessage = `${ep.name} Unreachable`;
        break;
      }
    }
  }

  const allNodes = [
    {
      id: 'proclaim',
      name: 'Proclaim',
      subtitle: 'Presentation',
      status: proclaimConfigured
        ? (proclaimState.connected ? (proclaimState.onAir ? 'ok' : 'warn') : 'error')
        : 'ok',
      statusText: proclaimConfigured
        ? (proclaimState.connected ? (proclaimState.onAir ? 'On Air' : 'Standby') : 'Offline')
        : (proclaimState.onAir ? 'On Air' : 'Standby'),
    },
    {
      id: 'reaper',
      name: 'REAPER DAW',
      subtitle: 'Livestream Mix',
      status: reaperState.connected ? 'ok' : 'error',
      statusText: reaperState.connected
        ? (reaperState.isPlaying ? 'Processing' : 'Online')
        : 'Offline',
    },
    {
      id: 'atem',
      name: 'ATEM Mini Pro',
      subtitle: 'Video Switcher',
      status: atemState.connected
        ? (atemState.isStreaming ? 'ok' : 'warn')
        : 'error',
      statusText: atemState.connected
        ? (atemState.isStreaming ? 'Encoding' : 'Standby')
        : 'Offline',
    },
    {
      id: 'obs',
      name: 'OBS Studio',
      subtitle: 'Local Distribution',
      status: obsState.connected
        ? (obsState.isStreaming || obsState.isRecording ? 'ok' : 'warn')
        : 'error',
      statusText: obsState.connected
        ? (obsState.isStreaming ? 'Streaming' : (obsState.isRecording ? 'Recording' : 'Standby'))
        : 'Offline',
    },
    {
      id: 'youtube',
      name: 'YouTube Live',
      subtitle: 'Broadcast',
      status: ytState.broadcastState === 'live' ? 'ok'
        : ytState.broadcastState === 'ready' ? 'warn'
        : ytState.broadcastState === 'none' ? 'error'
        : 'warn',
      statusText: ytState.broadcastState === 'live' ? 'Live'
        : ytState.broadcastState === 'ready' ? 'Ready'
        : ytState.broadcastState === 'complete' ? 'Complete'
        : ytState.authenticated ? 'No Broadcast' : 'Offline',
    },
  ];

  // Filter nodes according to enabled modules
  const nodes = allNodes.filter(n => modEnabled[n.id] !== false);

  return {
    timestamp: Date.now(),
    global: {
      status: globalStatus,
      message: globalMessage,
    },
    nodes,
    reaper: reaperState,
    atem: atemState,
    youtube: ytState,
    obs: obsState,
    proclaim: proclaimState,
    captioner: captioner.getState(),
    ptz: ptz.getState(),
    network: netState,
    alerts: alertState,
    config: activeConfig,
    updater: updater.getState(),
  };
}

function broadcastState() {
  const state = getAggregatedState();
  const message = JSON.stringify({
    type: 'STATE_UPDATE',
    data: state,
  });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastConfig() {
  const message = JSON.stringify({
    type: 'CONFIG_UPDATE',
    data: activeConfig,
  });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// ── WebSocket Connection Handling ────────────────
wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;

  ws.send(JSON.stringify({
    type: 'STATE_UPDATE',
    data: getAggregatedState(),
  }));

  ws.send(JSON.stringify({
    type: 'CONFIG_UPDATE',
    data: activeConfig,
  }));

  ws.on('message', async (message) => {
    try {
      const msg = JSON.parse(message.toString());
      await handleClientMessage(msg, ws);
    } catch (err) {
      console.warn('[WS] Invalid message from client:', err.message);
    }
  });

  ws.on('close', () => {});

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
});

// WebSocket heartbeat
const wsHeartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(wsHeartbeat));

// ── Handle Frontend Messages ────────────────────
async function handleClientMessage(msg, ws) {
  switch (msg.type) {
    case 'REOPEN_SCREEN':
      try {
        const res = await executeEmergencyReopenScreen(msg.data || {});
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'REOPEN_SCREEN_RESULT', success: true, data: res }));
        }
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'REOPEN_SCREEN_RESULT', success: false, error: err.message }));
        }
      }
      break;

    case 'PANIC_CAPTIONS':
      try {
        const res = await captioner.panic();
        alerts.addEvent('warn', '🚨 Emergency Panic Triggered: Screen Captions Blanked & Muted');
        const panicToast = JSON.stringify({
          type: 'CAPTIONER_PANIC_TRIGGERED',
          data: { message: '🚨 Captions Panic Active: Screens Blanked & Muted' },
        });
        wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(panicToast); });
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'PANIC_RESULT', success: true, data: res }));
        }
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'PANIC_RESULT', success: false, error: err.message }));
        }
      }
      break;

    case 'START_CAPTIONS':
      try {
        const res = await captioner.startCaptions();
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'START_CAPTIONS_RESULT', success: true, data: res }));
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'START_CAPTIONS_RESULT', success: false, error: err.message }));
      }
      break;

    case 'STOP_CAPTIONS':
      try {
        const res = await captioner.stopCaptions();
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'STOP_CAPTIONS_RESULT', success: true, data: res }));
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'STOP_CAPTIONS_RESULT', success: false, error: err.message }));
      }
      break;

    case 'TOGGLE_CAPTIONS':
      try {
        const res = await captioner.toggleCaptions();
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'TOGGLE_CAPTIONS_RESULT', success: true, data: res }));
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'TOGGLE_CAPTIONS_RESULT', success: false, error: err.message }));
      }
      break;

    case 'DIAGNOSE_CAPTIONER':
      try {
        const report = await captioner.diagnose();
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'DIAGNOSE_CAPTIONER_RESULT', success: true, data: report }));
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'DIAGNOSE_CAPTIONER_RESULT', success: false, error: err.message }));
      }
      break;

    // ── ATEM Video Switching Handlers ──────────────
    case 'ATEM_CUT':
      try {
        const res = await atem.cut(msg.data?.me || 0);
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ATEM_CUT_RESULT', success: true, data: res }));
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ATEM_CUT_RESULT', success: false, error: err.message }));
      }
      break;

    case 'ATEM_AUTO':
      try {
        const res = await atem.autoTransition(msg.data?.me || 0);
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ATEM_AUTO_RESULT', success: true, data: res }));
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ATEM_AUTO_RESULT', success: false, error: err.message }));
      }
      break;

    case 'ATEM_FTB':
      try {
        const res = await atem.fadeToBlack(msg.data?.me || 0);
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ATEM_FTB_RESULT', success: true, data: res }));
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ATEM_FTB_RESULT', success: false, error: err.message }));
      }
      break;

    case 'ATEM_SET_PROGRAM':
      try {
        const input = msg.data?.input || 1;
        const res = await atem.changeProgramInput(input, msg.data?.me || 0);
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ATEM_SET_PROGRAM_RESULT', success: true, data: res }));
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ATEM_SET_PROGRAM_RESULT', success: false, error: err.message }));
      }
      break;

    case 'ATEM_SET_PREVIEW':
      try {
        const input = msg.data?.input || 2;
        const res = await atem.changePreviewInput(input, msg.data?.me || 0);
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ATEM_SET_PREVIEW_RESULT', success: true, data: res }));
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ATEM_SET_PREVIEW_RESULT', success: false, error: err.message }));
      }
      break;

    // ── PTZOptics Real-Time Motion & Preset Handlers ─
    case 'PTZ_PAN_TILT':
      try {
        const { camera, direction, speed } = msg.data || {};
        const res = await ptz.panTilt(camera, direction, speed);
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PTZ_RESULT', success: true, data: res }));
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PTZ_RESULT', success: false, error: err.message }));
      }
      break;

    case 'PTZ_ZOOM':
      try {
        const { camera, action, speed } = msg.data || {};
        const res = await ptz.zoom(camera, action, speed);
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PTZ_RESULT', success: true, data: res }));
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PTZ_RESULT', success: false, error: err.message }));
      }
      break;

    case 'PTZ_FOCUS':
      try {
        const { camera, action } = msg.data || {};
        const res = await ptz.focus(camera, action);
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PTZ_RESULT', success: true, data: res }));
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PTZ_RESULT', success: false, error: err.message }));
      }
      break;

    case 'PTZ_RECALL_PRESET':
      try {
        const { camera, preset } = msg.data || {};
        const res = await ptz.recallPreset(camera, preset);
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PTZ_PRESET_RESULT', success: true, data: res }));
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PTZ_PRESET_RESULT', success: false, error: err.message }));
      }
      break;

    case 'PTZ_SAVE_PRESET':
      try {
        const { camera, preset, name } = msg.data || {};
        const res = await ptz.savePreset(camera, preset, name);
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PTZ_PRESET_RESULT', success: true, data: res }));
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PTZ_PRESET_RESULT', success: false, error: err.message }));
      }
      break;

    case 'PTZ_SET_ACTIVE_CAMERA':
      if (msg.data?.camera) {
        ptz.setActiveCamera(msg.data.camera);
      }
      break;

    // ── OBS Remote Broadcast Control Handlers ──────
    case 'OBS_TOGGLE_STREAM':
      try {
        const res = await obs.toggleStream();
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'OBS_RESULT', success: true, action: 'toggleStream', data: res }));
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'OBS_RESULT', success: false, action: 'toggleStream', error: err.message }));
      }
      break;

    case 'OBS_TOGGLE_RECORD':
      try {
        const res = await obs.toggleRecord();
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'OBS_RESULT', success: true, action: 'toggleRecord', data: res }));
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'OBS_RESULT', success: false, action: 'toggleRecord', error: err.message }));
      }
      break;

    case 'OBS_SET_SCENE':
      try {
        const res = await obs.setScene(msg.data?.sceneName || msg.data?.scene);
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'OBS_RESULT', success: true, action: 'setScene', data: res }));
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'OBS_RESULT', success: false, action: 'setScene', error: err.message }));
      }
      break;

    case 'OBS_TRANSITION':
      try {
        const res = await obs.triggerStudioModeTransition();
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'OBS_RESULT', success: true, action: 'transition', data: res }));
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'OBS_RESULT', success: false, action: 'transition', error: err.message }));
      }
      break;

    case 'OBS_TOGGLE_STUDIO_MODE':
      try {
        const res = await obs.toggleStudioMode();
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'OBS_RESULT', success: true, action: 'toggleStudioMode', data: res }));
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'OBS_RESULT', success: false, action: 'toggleStudioMode', error: err.message }));
      }
      break;

    case 'OBS_TOGGLE_VIRTUAL_CAM':
      try {
        const res = await obs.toggleVirtualCam();
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'OBS_RESULT', success: true, action: 'toggleVirtualCam', data: res }));
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'OBS_RESULT', success: false, action: 'toggleVirtualCam', error: err.message }));
      }
      break;

    case 'SAVE_CONFIG':
      if (msg.data) {
        saveConfig(msg.data);
        alerts.addEvent('info', 'Settings updated & applied by user');
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'CONFIG_SAVED', success: true }));
        }
      }
      break;

    case 'TEST_GROUPME':
      try {
        if (msg.data) {
          notifier.updateConfig(msg.data);
        }
        const botType = msg.data?.botType || 'main';
        const result = await notifier.sendTestGroupMe(botType);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'TEST_GROUPME_RESULT', success: true, botType, botLabel: result.botLabel }));
        }
      } catch (err) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'TEST_GROUPME_RESULT', success: false, error: err.message }));
        }
      }
      break;

    case 'GET_CONFIG':
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'CONFIG_UPDATE', data: activeConfig }));
      }
      break;

    case 'UPDATE_THRESHOLDS':
      if (msg.data) {
        saveConfig({
          maxDurationMin: msg.data.maxDurationMin,
          silenceTimeoutSec: msg.data.silenceTimeoutSec,
          minBitrateKbps: msg.data.minBitrateKbps,
          alertsEnabled: msg.data.alertsEnabled,
        });
      }
      break;

    case 'ADD_EVENT':
      alerts.addEvent(msg.severity || 'info', msg.message || 'Manual event');
      break;

    default:
      console.log('[WS] Unknown message type:', msg.type);
  }
}

// ── Broadcast Loop ──────────────────────────────
let tickCount = 0;
let wasLive = false;

const broadcastInterval = setInterval(() => {
  tickCount++;

  if (tickCount % 2 === 0) {
    const state = getAggregatedState();
    alerts.check(state);

    const isLive = Boolean(state.atem?.isStreaming || state.youtube?.broadcastState === 'live');
    if (isLive && !wasLive) {
      wasLive = true;
      reports.startSession(() => getAggregatedState());
    } else if (!isLive && wasLive) {
      wasLive = false;
      reports.stopSessionAndGenerateReport(true);
    }
  }

  broadcastState();
}, 200);

// ── Startup ─────────────────────────────────────
async function startServer() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║          SANCTUARY AV CONTROLLER                 ║');
  console.log('╠══════════════════════════════════════════════════╣');

  const startups = [
    { name: 'REAPER OSC', fn: () => reaper.start() },
    { name: 'ATEM Switcher', fn: () => atem.start() },
    { name: 'OBS Studio', fn: () => obs.start() },
    { name: 'Proclaim', fn: () => proclaim.start() },
    { name: 'Captioner Client', fn: () => captioner.start() },
    { name: 'YouTube Monitor', fn: () => youtube.start() },
    { name: 'Network Ping', fn: () => network.start() },
    { name: 'Alert Engine', fn: () => alerts.start() },
  ];

  for (const s of startups) {
    try {
      await s.fn();
      console.log(`║  ✓ ${s.name.padEnd(20)} Started`);
    } catch (err) {
      console.log(`║  ✗ ${s.name.padEnd(20)} Failed: ${err.message}`);
    }
  }

  const HOST = process.env.HOST || '0.0.0.0';
  server.listen(PORT, HOST, () => {
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  Dashboard: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log('╚══════════════════════════════════════════════════╝\n');
  });
}

function shutdown() {
  console.log('\n[Server] Shutting down...');
  clearInterval(broadcastInterval);

  reaper.stop();
  atem.stop();
  obs.stop();
  proclaim.stop();
  captioner.stop();
  youtube.stop();
  network.stop();
  alerts.stop();

  wss.close();
  server.close(() => {
    console.log('[Server] Goodbye.');
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 3000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startServer().catch((err) => {
  console.error('[Server] Fatal error during startup:', err);
  process.exit(1);
});
