/**
 * modules/notifier.js
 * Dual-GroupMe Bot Alert Dispatcher for Sanctuary AV
 *
 * Routes alerts to separate channels:
 * 1. Main Team Bot: Broadcast alerts (Audio Silence, Stream Overtime)
 * 2. Tech Lead Bot: System & Hardware alerts (Device Disconnections, Network Issues)
 *
 * Supports schedule filtering (e.g. Sundays 9am - 3pm) with 24/7 exemption for
 * "stream left on too long" (duration_exceeded).
 */

const https = require('https');

class AlertNotifier {
  constructor(config = {}) {
    this.updateConfig(config);
    this.activeAlerts = new Set(); // Tracks active incidents so each alert sends ONLY ONCE
  }

  updateConfig(config = {}) {
    this.enabled = config.groupmeEnabled === true || config.groupmeEnabled === 'true';
    this.mainBotId = (config.groupmeMainBotId || config.groupmeBotId || '').trim();
    this.techBotId = (config.groupmeTechBotId || '').trim();

    // Schedule configuration (defaults: Sundays between 09:00 and 15:00)
    this.scheduleEnabled = config.scheduleEnabled !== false;
    this.scheduleDays = Array.isArray(config.scheduleDays)
      ? config.scheduleDays.map(Number)
      : [0]; // 0 = Sunday
    this.scheduleStart = config.scheduleStart || '09:00';
    this.scheduleEnd = config.scheduleEnd || '15:00';
  }

  /**
   * Check if current time is within active schedule window.
   * "duration_exceeded" (stream left on too long) is ALWAYS exempt and alerts 24/7.
   * @param {string} alertKey
   * @returns {boolean}
   */
  isWithinSchedule(alertKey) {
    // 1. Duration exceeded is ALWAYS exempt and fires 24/7
    if (alertKey === 'duration_exceeded') {
      return true;
    }

    // 2. If schedule restriction is turned off, allow all
    if (!this.scheduleEnabled) {
      return true;
    }

    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

    // 3. Day of week check
    if (Array.isArray(this.scheduleDays) && this.scheduleDays.length > 0) {
      if (!this.scheduleDays.includes(currentDay)) {
        return false;
      }
    }

    // 4. Time window check (HH:MM)
    const currentTotalMin = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = (this.scheduleStart || '09:00').split(':').map(Number);
    const [endH, endM] = (this.scheduleEnd || '15:00').split(':').map(Number);

    const startTotalMin = (startH || 0) * 60 + (startM || 0);
    const endTotalMin = (endH || 0) * 60 + (endM || 0);

    return currentTotalMin >= startTotalMin && currentTotalMin <= endTotalMin;
  }

  /**
   * Post a message to GroupMe via bot_id
   * @param {string} text
   * @param {string} targetBotId
   */
  postToGroupMe(text, targetBotId) {
    return new Promise((resolve, reject) => {
      const botId = targetBotId || this.mainBotId || this.techBotId;
      if (!botId) {
        return reject(new Error('No GroupMe Bot ID is configured for this alert category'));
      }

      const postData = JSON.stringify({
        bot_id: botId,
        text: text,
      });

      const options = {
        hostname: 'api.groupme.com',
        port: 443,
        path: '/v3/bots/post',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode === 202 || res.statusCode === 200 || res.statusCode === 201) {
            resolve({ success: true });
          } else {
            reject(new Error(`GroupMe API returned status ${res.statusCode}: ${body || 'Invalid Bot ID'}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Send an alert notification to GroupMe (strictly once per incident, respecting schedule)
   * Automatically routes to Main Team Bot or Tech Lead Bot.
   * @param {Object} alert
   * @param {'error'|'warn'|'info'} alert.severity
   * @param {string} alert.title
   * @param {string} alert.message
   * @param {string} alert.alertKey
   */
  async sendAlert({ severity = 'error', title, message, alertKey }) {
    if (!this.enabled) {
      return { sent: false, reason: 'GroupMe notifications are disabled in settings' };
    }

    const key = alertKey || `${severity}_${title}`;

    // STRICT ONCE-PER-INCIDENT CHECK
    if (this.activeAlerts.has(key)) {
      return { sent: false, reason: 'Alert already sent for this incident' };
    }

    // SCHEDULE WINDOW CHECK (Sundays 9am - 3pm, duration_exceeded exempt)
    if (!this.isWithinSchedule(key)) {
      const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      console.log(`[Notifier] ⏳ Suppressed alert "${title}" (${now}) — outside scheduled broadcast window (${this.scheduleStart}-${this.scheduleEnd})`);
      return { sent: false, reason: 'Outside scheduled broadcast window' };
    }

    // CATEGORY ROUTING:
    // Silence & Stream Duration -> Main Team Bot
    // Device Disconnects & Network -> Tech Lead Bot (falls back to Main Bot if Tech Bot not set)
    const isBroadcastIncident = key === 'audio_silence' || key === 'duration_exceeded';
    let targetBotId = isBroadcastIncident ? this.mainBotId : this.techBotId;
    let targetChannelName = isBroadcastIncident ? 'Main AV Team' : 'Tech Leads';

    // Fallback: If tech bot is empty, send tech alerts to main bot
    if (!targetBotId) {
      targetBotId = this.mainBotId || this.techBotId;
      targetChannelName = 'Default Bot';
    }

    if (!targetBotId) {
      return { sent: false, reason: 'No Bot ID configured for this alert category' };
    }

    const isCritical = severity === 'error';
    const icon = isCritical ? '🚨' : '⚠️';
    const badgeText = isCritical ? 'CRITICAL ALERT' : 'SYSTEM WARNING';
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    const gmText = `${icon} [${badgeText}] ${title}\n\n${message}\n\n🕒 Time: ${timeStr}\n📊 Dashboard: http://localhost:3050`;

    try {
      await this.postToGroupMe(gmText, targetBotId);
      this.activeAlerts.add(key); // Mark as sent for this incident
      console.log(`[Notifier] 💬 Single alert posted to GroupMe (${targetChannelName}): ${title}`);
      return { sent: true, channel: targetChannelName };
    } catch (err) {
      console.error(`[Notifier] GroupMe alert post failed (${targetChannelName}):`, err.message);
      return { sent: false, error: err.message };
    }
  }

  /**
   * Clear an active incident so it can trigger again on future occurrences
   * @param {string} alertKey
   */
  clearAlert(alertKey) {
    if (this.activeAlerts.has(alertKey)) {
      this.activeAlerts.delete(alertKey);
      console.log(`[Notifier] Cleared alert state for: ${alertKey}`);
    }
  }

  /**
   * Send a test message to a specific GroupMe Bot to verify Bot ID
   * @param {'main'|'tech'} botType
   */
  async sendTestGroupMe(botType = 'main') {
    const isTech = botType === 'tech';
    const botId = isTech ? this.techBotId : this.mainBotId;
    const botLabel = isTech ? 'Tech Leads Bot (Hardware/System Alerts)' : 'Main Team Bot (Broadcast/Silence Alerts)';

    if (!botId) {
      throw new Error(`Please enter a Bot ID for ${botLabel} first`);
    }

    const timeStr = new Date().toLocaleTimeString('en-US');
    const text = `✓ [Sanctuary AV] Test Notification: Your ${botLabel} is successfully connected! (${timeStr})`;
    await this.postToGroupMe(text, botId);
    console.log(`[Notifier] 💬 Test message sent successfully to ${botLabel}`);
    return { success: true, botType, botLabel };
  }
}

module.exports = AlertNotifier;
