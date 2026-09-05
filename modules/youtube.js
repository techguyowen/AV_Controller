/**
 * modules/youtube.js
 * YouTube Data API v3 integration for live broadcast monitoring & audio stream verification
 *
 * Uses OAuth2 to access broadcast state, stream health, audio stream status, and viewer count.
 * Extracts configuration issues from YouTube's ingest servers (e.g. NO_AUDIO, AUDIO_BITRATE_LOW).
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const TOKEN_PATH = path.join(__dirname, '..', '.youtube-token.json');

class YouTubeMonitor {
  constructor(config = {}) {
    this.clientId = config.clientId || '';
    this.clientSecret = config.clientSecret || '';
    this.redirectUri = config.redirectUri || 'http://localhost:3050/oauth2callback';
    this.videoId = config.videoId || '';
    this.streamId = config.streamId || '';

    // State
    this.authenticated = false;
    this.broadcastState = 'unknown';  // live, ready, complete, testing, created, unknown
    this.streamHealth = 'noData';     // good, ok, bad, noData
    this.audioStatus = 'unknown';     // ok, silent, error, noData, unknown
    this.audioIssues = [];
    this.viewerCount = 0;
    this.chatRate = 0;
    this.broadcastTitle = '';
    this.streamStatus = 'unknown';

    this.oauth2Client = null;
    this.youtube = null;
    this._pollInterval = null;
    this._chatPollInterval = null;
    this._prevChatCount = 0;
    this._lastChatCheck = Date.now();
  }

  async start() {
    if (!this.clientId || !this.clientSecret) {
      console.log('[YouTube] Standby mode: Monitoring broadcast state via ATEM / OBS stream ingest');
      return;
    }

    this.oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );

    this.oauth2Client.on('tokens', (tokens) => {
      const existing = fs.existsSync(TOKEN_PATH)
        ? JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'))
        : {};
      const updated = { ...existing, ...tokens };
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(updated, null, 2));
      console.log('[YouTube] Token refreshed and saved');
    });

    if (fs.existsSync(TOKEN_PATH)) {
      try {
        const tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        this.oauth2Client.setCredentials(tokenData);
        this.authenticated = true;
        console.log('[YouTube] Loaded cached auth token');
      } catch (err) {
        console.warn('[YouTube] Failed to load cached token:', err.message);
      }
    }

    if (!this.authenticated) {
      console.log('[YouTube] Standby mode: OAuth authorization optional; stream monitored via active encoder.');
      this.authenticated = false;
      return;
    }

    this.youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });

    await this._poll();
    this._pollInterval = setInterval(() => this._poll(), 30000);
    console.log('[YouTube] Monitoring started (polling every 30s)');
  }

  /**
   * Generates the Google OAuth consent URL.
   * @returns {string} The URL to redirect the user to for authentication.
   */
  getAuthUrl() {
    if (!this.oauth2Client) {
      this.oauth2Client = new google.auth.OAuth2(
        this.clientId,
        this.clientSecret,
        this.redirectUri
      );
    }
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/youtube.readonly'],
      prompt: 'consent',
    });
  }

  /**
   * Exchanges an authorization code for tokens and starts monitoring.
   * @param {string} code The authorization code from the OAuth callback.
   * @returns {Promise<void>}
   */
  async handleAuthCallback(code) {
    if (!this.oauth2Client) {
      this.oauth2Client = new google.auth.OAuth2(
        this.clientId,
        this.clientSecret,
        this.redirectUri
      );
    }
    try {
      const { tokens } = await this.oauth2Client.getToken(code.trim());
      this.oauth2Client.setCredentials(tokens);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      this.authenticated = true;
      this.youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });
      console.log('[YouTube] Authorization successful — token cached');
      
      // Start monitoring if not already started
      if (!this._pollInterval) {
        await this._poll();
        this._pollInterval = setInterval(() => this._poll(), 30000);
        console.log('[YouTube] Monitoring started (polling every 30s)');
      }
    } catch (err) {
      console.error('[YouTube] Authorization failed:', err.message);
      throw err;
    }
  }

  async _poll() {
    if (!this.youtube) return;

    try {
      let broadcastId = this.videoId;
      let boundStreamId = this.streamId;

      if (!broadcastId) {
        const broadcasts = await this.youtube.liveBroadcasts.list({
          part: ['id', 'snippet', 'status', 'contentDetails'],
          broadcastStatus: 'active',
          mine: true,
        });

        const broadcast = broadcasts.data.items?.[0];
        if (broadcast) {
          broadcastId = broadcast.id;
          boundStreamId = broadcast.contentDetails?.boundStreamId || '';
          this.broadcastState = broadcast.status?.lifeCycleStatus || 'unknown';
          this.broadcastTitle = broadcast.snippet?.title || '';
        } else {
          const upcoming = await this.youtube.liveBroadcasts.list({
            part: ['id', 'snippet', 'status', 'contentDetails'],
            broadcastStatus: 'upcoming',
            mine: true,
          });

          const upcomingBroadcast = upcoming.data.items?.[0];
          if (upcomingBroadcast) {
            broadcastId = upcomingBroadcast.id;
            boundStreamId = upcomingBroadcast.contentDetails?.boundStreamId || '';
            this.broadcastState = upcomingBroadcast.status?.lifeCycleStatus || 'ready';
            this.broadcastTitle = upcomingBroadcast.snippet?.title || '';
          } else {
            this.broadcastState = 'none';
            this.viewerCount = 0;
            this.streamHealth = 'noData';
            this.audioStatus = 'noData';
            return;
          }
        }
      }

      // Check stream health & YouTube Ingest Audio issues
      if (boundStreamId) {
        try {
          const streams = await this.youtube.liveStreams.list({
            part: ['id', 'status', 'cdn'],
            id: [boundStreamId],
          });

          const stream = streams.data.items?.[0];
          if (stream) {
            this.streamStatus = stream.status?.streamStatus || 'unknown';
            this.streamHealth = stream.status?.healthStatus?.status || 'noData';

            const configIssues = stream.status?.healthStatus?.configurationIssues || [];
            this.audioIssues = configIssues.filter(i => 
              i.type?.toLowerCase().includes('audio') || i.description?.toLowerCase().includes('audio')
            );

            if (this.audioIssues.length > 0) {
              this.audioStatus = 'error';
            } else if (this.streamHealth === 'good' || this.streamHealth === 'ok') {
              this.audioStatus = 'ok';
            } else {
              this.audioStatus = 'unknown';
            }
          }
        } catch (err) {
          console.warn('[YouTube] Stream health check failed:', err.message);
        }
      }

      // Check viewer count
      if (broadcastId) {
        try {
          const videos = await this.youtube.videos.list({
            part: ['liveStreamingDetails', 'statistics'],
            id: [broadcastId],
          });

          const video = videos.data.items?.[0];
          if (video?.liveStreamingDetails?.concurrentViewers) {
            this.viewerCount = parseInt(video.liveStreamingDetails.concurrentViewers, 10);
          }

          if (video?.statistics?.commentCount) {
            const currentCount = parseInt(video.statistics.commentCount, 10);
            const elapsed = (Date.now() - this._lastChatCheck) / 60000;
            if (elapsed > 0 && this._prevChatCount > 0) {
              this.chatRate = Math.round((currentCount - this._prevChatCount) / elapsed);
            }
            this._prevChatCount = currentCount;
            this._lastChatCheck = Date.now();
          }

          if (this.videoId && video?.liveStreamingDetails) {
            if (video.liveStreamingDetails.actualEndTime) {
              this.broadcastState = 'complete';
            } else if (video.liveStreamingDetails.actualStartTime) {
              this.broadcastState = 'live';
            }
          }
        } catch (err) {
          console.warn('[YouTube] Viewer count check failed:', err.message);
        }
      }
    } catch (err) {
      if (err.code === 401 || err.code === 403) {
        console.error('[YouTube] Auth error — token may be expired.');
        this.authenticated = false;
      } else {
        console.warn('[YouTube] Poll error:', err.message);
      }
    }
  }

  getState() {
    return {
      authenticated: this.authenticated,
      broadcastState: this.broadcastState,
      streamHealth: this.streamHealth,
      streamStatus: this.streamStatus,
      audioStatus: this.audioStatus,
      audioIssues: this.audioIssues,
      viewerCount: this.viewerCount,
      chatRate: Math.max(0, this.chatRate),
      broadcastTitle: this.broadcastTitle,
      videoId: this.videoId,
    };
  }

  updateConfig(config = {}) {
    const credsChanged = (config.clientId && config.clientId !== this.clientId) || (config.clientSecret && config.clientSecret !== this.clientSecret);
    this.clientId = config.clientId || this.clientId;
    this.clientSecret = config.clientSecret || this.clientSecret;
    this.videoId = config.videoId || '';
    this.streamId = config.streamId || '';

    if (credsChanged) {
      this.stop();
      this.start().catch((err) => console.warn('[YouTube] Restart error:', err.message));
    }
  }

  stop() {
    if (this._pollInterval) clearInterval(this._pollInterval);
    console.log('[YouTube] Stopped');
  }
}

module.exports = YouTubeMonitor;
