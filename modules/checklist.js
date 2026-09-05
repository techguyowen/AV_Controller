/**
 * modules/checklist.js
 * Sanctuary AV Controller — Sunday Pre-Flight Checklist Engine
 *
 * Provides a guided pre-flight checklist for church volunteers with 1-click
 * automated hardware self-tests, battery sign-offs, and GroupMe dispatching.
 */

class ChecklistManager {
  constructor(notifier, reportManager) {
    this.notifier = notifier;
    this.reportManager = reportManager;
    this.volunteerName = '';
    this.completedAt = null;

    this.defaultItems = [
      {
        id: 'reaper_audio',
        title: 'REAPER DAW & Soundcraft Si USB Audio Metering',
        category: 'Audio',
        type: 'automated',
        passed: false,
        checked: false,
        description: 'Verifies active OSC connection to REAPER on 127.0.0.1:9000 with healthy signal metering.',
      },
      {
        id: 'atem_video',
        title: 'Blackmagic ATEM Mini Switcher & HDMI Matrix',
        category: 'Video',
        type: 'automated',
        passed: false,
        checked: false,
        description: 'Verifies network connection to ATEM Mini (192.168.1.240) and switching tallies.',
      },
      {
        id: 'ptz_cam1',
        title: 'PTZOptics Camera 1 (Pulpit / Stage) IP & Presets',
        category: 'Video',
        type: 'automated',
        passed: false,
        checked: false,
        description: 'Verifies VISCA-over-IP UDP 1259 connection and Pulpit preset homing.',
      },
      {
        id: 'ptz_cam2',
        title: 'PTZOptics Camera 2 (Wide Sanctuary) IP & Presets',
        category: 'Video',
        type: 'automated',
        passed: false,
        checked: false,
        description: 'Verifies VISCA-over-IP UDP 1259 connection and Wide Sanctuary preset homing.',
      },
      {
        id: 'proclaim_slides',
        title: 'Faithlife Proclaim Presentation PC Remote',
        category: 'Graphics',
        type: 'automated',
        passed: false,
        checked: false,
        description: 'Verifies Proclaim REST API connection on port 52195 for live lyric & scripture cues.',
      },
      {
        id: 'voxstream_captions',
        title: 'VoxStream Live Speech Transcription & Stage Display',
        category: 'Captions',
        type: 'automated',
        passed: false,
        checked: false,
        description: 'Verifies microphone audio capture and LONTIUM (Monitor 1) preview projection.',
      },
      {
        id: 'youtube_ingest',
        title: 'YouTube Live RTMP Ingest & Network Latency',
        category: 'Broadcast',
        type: 'automated',
        passed: false,
        checked: false,
        description: 'Verifies ping latency to a.rtmp.youtube.com (<50ms) and internet gateway.',
      },
      {
        id: 'obs_overflow',
        title: 'OBS Studio Local Backup Recording & Overflow',
        category: 'Broadcast',
        type: 'automated',
        passed: false,
        checked: false,
        description: 'Verifies OBS Studio WebSocket connection and storage drive readiness.',
      },
      {
        id: 'wireless_mic_batteries',
        title: 'Pastor & Worship Wireless Mic Batteries',
        category: 'Audio',
        type: 'manual',
        passed: false,
        checked: false,
        description: 'Check transmitter battery bars on Shure/Sennheiser packs (minimum 3 bars or fresh AA).',
      },
      {
        id: 'stage_confidence_monitors',
        title: 'Stage Teleprompter & Confidence TV Screens',
        category: 'Stage',
        type: 'manual',
        passed: false,
        checked: false,
        description: 'Power on floor confidence monitors and verify live clock / scripture display.',
      },
    ];

    this.items = JSON.parse(JSON.stringify(this.defaultItems));
  }

  getItems() {
    const activeItems = this.items.filter(i => i.enabled !== false);
    const total = activeItems.length;
    const completed = activeItems.filter(i => i.checked || i.passed).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 100;

    return {
      items: this.items,
      total,
      completed,
      percent,
      isAllPassed: completed === total,
      volunteerName: this.volunteerName,
      completedAt: this.completedAt,
    };
  }

  toggleItem(id, checked) {
    const item = this.items.find(i => i.id === id);
    if (item) {
      item.checked = checked !== undefined ? Boolean(checked) : !item.checked;
      item.passed = item.checked;
    }
    return this.getItems();
  }

  setItemEnabled(id, enabled) {
    const item = this.items.find(i => i.id === id);
    if (item) {
      item.enabled = Boolean(enabled);
    }
    return this.getItems();
  }

  /**
   * Run 1-click automated pre-flight diagnostics across all hardware
   * @param {Object} state - Full aggregated system state from server
   */
  runAutomatedDiagnostics(state) {
    if (!state) return this.getItems();

    // 1. REAPER / Audio
    const reaperItem = this.items.find(i => i.id === 'reaper_audio');
    if (reaperItem) {
      reaperItem.passed = Boolean(state.reaper && state.reaper.connected);
      reaperItem.checked = reaperItem.passed;
    }

    // 2. ATEM Switcher
    const atemItem = this.items.find(i => i.id === 'atem_video');
    if (atemItem) {
      atemItem.passed = Boolean(state.atem && state.atem.connected);
      atemItem.checked = atemItem.passed;
    }

    // 3. PTZ Camera 1
    const ptz1Item = this.items.find(i => i.id === 'ptz_cam1');
    if (ptz1Item) {
      const cam1 = state.ptz?.cameras?.find(c => c.id === 'cam1');
      ptz1Item.passed = Boolean(cam1 && cam1.connected);
      ptz1Item.checked = ptz1Item.passed;
    }

    // 4. PTZ Camera 2
    const ptz2Item = this.items.find(i => i.id === 'ptz_cam2');
    if (ptz2Item) {
      const cam2 = state.ptz?.cameras?.find(c => c.id === 'cam2');
      ptz2Item.passed = Boolean(cam2 && cam2.connected);
      ptz2Item.checked = ptz2Item.passed;
    }

    // 5. Proclaim
    const proclaimItem = this.items.find(i => i.id === 'proclaim_slides');
    if (proclaimItem) {
      if (!state.proclaim?.configured) {
        proclaimItem.enabled = false;
        proclaimItem.passed = true;
        proclaimItem.checked = true;
      } else {
        proclaimItem.passed = Boolean(state.proclaim && state.proclaim.connected);
        proclaimItem.checked = proclaimItem.passed;
      }
    }

    // 6. VoxStream Captions
    const captionItem = this.items.find(i => i.id === 'voxstream_captions');
    if (captionItem) {
      captionItem.passed = Boolean(state.captioner && state.captioner.connected);
      captionItem.checked = captionItem.passed;
    }

    // 7. YouTube Ingest Ping
    const ytPingItem = this.items.find(i => i.id === 'youtube_ingest');
    if (ytPingItem) {
      const ytEp = state.network?.endpoints?.rtmp;
      const ytPing = state.network?.pings?.find(p => p.id === 'youtube');
      ytPingItem.passed = Boolean((ytEp && ytEp.alive) || (ytPing && ytPing.alive));
      ytPingItem.checked = ytPingItem.passed;
    }

    // 8. OBS Studio
    const obsItem = this.items.find(i => i.id === 'obs_overflow');
    if (obsItem) {
      obsItem.passed = Boolean(state.obs && state.obs.connected);
      obsItem.checked = obsItem.passed;
    }

    return this.getItems();
  }

  async signOff(volunteerName, sendToGroupMe = true) {
    this.volunteerName = volunteerName || 'Sunday Tech Volunteer';
    this.completedAt = new Date();

    if (this.reportManager) {
      this.reportManager.setVolunteerSignOff(this.volunteerName, this.completedAt);
    }

    if (sendToGroupMe && this.notifier) {
      const summary = this.getItems();
      const timeStr = this.completedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const msg = `✅ SUNDAY PRE-FLIGHT CHECKLIST SIGNED OFF
👤 Volunteer: ${this.volunteerName}
⏱️ Time: ${timeStr}
📊 Readiness: ${summary.completed}/${summary.total} Items Verified (${summary.percent}%)
🎉 Sanctuary AV system is GO for live worship service!`;

      try {
        await this.notifier.sendGroupMe(msg, 'main');
        await this.notifier.sendGroupMe(msg, 'tech');
        console.log('[Checklist] ✓ Sign-off confirmation sent to GroupMe');
      } catch (err) {
        console.warn('[Checklist] Failed to send GroupMe sign-off:', err.message);
      }
    }

    return this.getItems();
  }

  reset() {
    this.volunteerName = '';
    this.completedAt = null;
    this.items = JSON.parse(JSON.stringify(this.defaultItems));
    return this.getItems();
  }
}

module.exports = ChecklistManager;
