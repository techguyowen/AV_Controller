/**
 * modules/reports.js
 * Sanctuary AV Controller — Post-Service Incident & Health Analytics Engine
 *
 * Automatically tracks broadcast telemetry during Sunday services (bitrates,
 * dropped frames, audio silence alarms, viewer peaks, camera operations)
 * and generates / dispatches comprehensive post-service summary reports to GroupMe.
 */

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
  try {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  } catch (err) {
    console.error('[Reports] Error creating reports directory:', err.message);
  }
}

class ServiceReportManager {
  constructor(notifier, alertsManager) {
    this.notifier = notifier;
    this.alerts = alertsManager;
    this.sessionActive = false;
    this.sessionStartTime = null;
    this.sessionEndTime = null;
    this.metrics = {
      samples: 0,
      bitrateSum: 0,
      minBitrate: Infinity,
      maxBitrate: 0,
      peakViewers: 0,
      totalDroppedFrames: 0,
      silenceIncidents: 0,
      atemCuts: 0,
      ptzRecalls: 0,
      incidentsLogged: [],
      volunteerSignOff: null,
    };
    this.sampleInterval = null;
  }

  setVolunteerSignOff(name, timestamp = new Date()) {
    this.metrics.volunteerSignOff = {
      name,
      timestamp,
    };
    console.log(`[Reports] Volunteer sign-off recorded: ${name}`);
  }

  recordAtemCut() {
    this.metrics.atemCuts++;
  }

  recordPtzRecall() {
    this.metrics.ptzRecalls++;
  }

  recordIncident(severity, message) {
    this.metrics.incidentsLogged.push({
      time: new Date(),
      severity,
      message,
    });
    if (severity === 'critical' && message.toLowerCase().includes('silence')) {
      this.metrics.silenceIncidents++;
    }
  }

  startSession(getStateFn) {
    if (this.sessionActive) return;
    this.sessionActive = true;
    this.sessionStartTime = new Date();
    this.sessionEndTime = null;
    this.metrics.samples = 0;
    this.metrics.bitrateSum = 0;
    this.metrics.minBitrate = Infinity;
    this.metrics.maxBitrate = 0;
    this.metrics.peakViewers = 0;
    this.metrics.totalDroppedFrames = 0;
    this.metrics.silenceIncidents = 0;
    this.metrics.incidentsLogged = [];

    console.log('[Reports] 🚀 Live service broadcast session started — Tracking telemetry');

    if (this.sampleInterval) clearInterval(this.sampleInterval);
    this.sampleInterval = setInterval(() => {
      if (!this.sessionActive || !getStateFn) return;
      try {
        const state = getStateFn();
        const bitrate = state.obs?.outputBitrate || (state.atem?.isStreaming ? 4500 : 0);
        const viewers = state.youtube?.viewerCount || 0;
        const dropped = state.obs?.droppedFrames || 0;

        if (bitrate > 0) {
          this.metrics.samples++;
          this.metrics.bitrateSum += bitrate;
          if (bitrate < this.metrics.minBitrate) this.metrics.minBitrate = bitrate;
          if (bitrate > this.metrics.maxBitrate) this.metrics.maxBitrate = bitrate;
        }

        if (viewers > this.metrics.peakViewers) {
          this.metrics.peakViewers = viewers;
        }

        if (dropped > this.metrics.totalDroppedFrames) {
          this.metrics.totalDroppedFrames = dropped;
        }
      } catch (err) {
        console.error('[Reports] Sample error:', err.message);
      }
    }, 10000); // Sample every 10 seconds
  }

  async stopSessionAndGenerateReport(sendToGroupMe = true) {
    if (!this.sessionActive && !this.sessionStartTime) {
      // Create a snapshot report if no active session
      this.sessionStartTime = new Date(Date.now() - 3600000); // 1 hr ago
    }
    this.sessionActive = false;
    this.sessionEndTime = new Date();
    if (this.sampleInterval) clearInterval(this.sampleInterval);

    const report = this.generateReportData();
    const savedFile = this.saveReportToFile(report);

    console.log(`[Reports] 📄 Service summary report generated: ${savedFile}`);

    if (sendToGroupMe && this.notifier) {
      try {
        const message = this.formatGroupMeMessage(report);
        // Post to Tech Leads bot
        await this.notifier.sendGroupMe(message, 'tech');
        console.log('[Reports] ✓ Post-service report dispatched to Tech Leads GroupMe');
      } catch (err) {
        console.warn('[Reports] Failed to dispatch report to GroupMe:', err.message);
      }
    }

    return report;
  }

  generateReportData() {
    const start = this.sessionStartTime || new Date();
    const end = this.sessionEndTime || new Date();
    const durMs = Math.max(0, end.getTime() - start.getTime());
    const durHours = Math.floor(durMs / 3600000);
    const durMins = Math.floor((durMs % 3600000) / 60000);
    const durSecs = Math.floor((durMs % 60000) / 1000);
    const durationFormatted = `${durHours}h ${durMins}m ${durSecs}s`;

    const avgBitrate = this.metrics.samples > 0 
      ? Math.round(this.metrics.bitrateSum / this.metrics.samples) 
      : 4500;

    const minBitrate = this.metrics.minBitrate === Infinity ? avgBitrate : this.metrics.minBitrate;

    return {
      id: `report-${Date.now()}`,
      date: start.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' }),
      startTime: start.toLocaleTimeString('en-US'),
      endTime: end.toLocaleTimeString('en-US'),
      duration: durationFormatted,
      durationMs: durMs,
      peakViewers: this.metrics.peakViewers,
      avgBitrateKbps: avgBitrate,
      minBitrateKbps: minBitrate,
      maxBitrateKbps: this.metrics.maxBitrate || avgBitrate,
      totalDroppedFrames: this.metrics.totalDroppedFrames,
      silenceIncidents: this.metrics.silenceIncidents,
      atemCuts: this.metrics.atemCuts,
      ptzRecalls: this.metrics.ptzRecalls,
      volunteerSignOff: this.metrics.volunteerSignOff?.name || 'Unsigned Volunteer',
      signOffTime: this.metrics.volunteerSignOff?.timestamp ? new Date(this.metrics.volunteerSignOff.timestamp).toLocaleTimeString() : 'N/A',
      totalIncidents: this.metrics.incidentsLogged.length,
      incidents: this.metrics.incidentsLogged,
      healthStatus: this.metrics.incidentsLogged.length === 0 ? 'CLEAN_BROADCAST' : (this.metrics.silenceIncidents > 0 ? 'ACTION_REQUIRED' : 'WARNINGS_LOGGED'),
    };
  }

  formatGroupMeMessage(report) {
    const healthEmoji = report.healthStatus === 'CLEAN_BROADCAST' ? '✅' : '⚠️';
    return `📊 SANCTUARY AV — SERVICE BROADCAST REPORT
📅 ${report.date}
⏱️ Duration: ${report.duration} (${report.startTime} - ${report.endTime})
👥 Peak Audience: ${report.peakViewers} live viewers
📡 Avg Bitrate: ${report.avgBitrateKbps.toLocaleString()} kbps (Dropped: ${report.totalDroppedFrames})
🎙️ Audio Silence Alarms: ${report.silenceIncidents}
🎥 Camera Operations: ${report.atemCuts} Video Cuts | ${report.ptzRecalls} PTZ Presets
👤 Pre-Flight Sign-Off: ${report.volunteerSignOff} (${report.signOffTime})
${healthEmoji} Status: ${report.healthStatus === 'CLEAN_BROADCAST' ? '100% Clean Broadcast' : `${report.totalIncidents} Incidents Logged`}`;
  }

  saveReportToFile(report) {
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `report-${dateStr}-${Date.now()}.json`;
    const filePath = path.join(REPORTS_DIR, fileName);

    try {
      fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
      return fileName;
    } catch (err) {
      console.error('[Reports] Error saving report file:', err.message);
      return null;
    }
  }

  getPastReports(limit = 20) {
    try {
      if (!fs.existsSync(REPORTS_DIR)) return [];
      const files = fs.readdirSync(REPORTS_DIR)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit);

      return files.map(file => {
        try {
          const content = fs.readFileSync(path.join(REPORTS_DIR, file), 'utf8');
          return JSON.parse(content);
        } catch (e) {
          return null;
        }
      }).filter(Boolean);
    } catch (err) {
      console.error('[Reports] Error reading past reports:', err.message);
      return [];
    }
  }
}

module.exports = ServiceReportManager;
