/**
 * public/js/client.js
 * Sanctuary AV Controller — Shared Real-Time Frontend Client Engine
 *
 * Provides a unified WebSocket telemetry stream, REST API helpers,
 * state distribution, and toast notifications across all mobile and desktop station pages.
 */

window.SanctuaryClient = {
    ws: null,
    connected: false,
    reconnectAttempts: 0,
    maxReconnectDelay: 10000,
    lastState: null,
    listeners: new Set(),

    init() {
        this.connect();
    },

    /**
     * Subscribe to real-time state updates
     * @param {Function} callback - Called with (state, type)
     */
    subscribe(callback) {
        if (typeof callback === 'function') {
            this.listeners.add(callback);
            if (this.lastState) {
                callback(this.lastState, 'INITIAL_STATE');
            }
        }
    },

    unsubscribe(callback) {
        this.listeners.delete(callback);
    },

    _notify(state, type = 'STATE_UPDATE') {
        this.lastState = state;
        for (const listener of this.listeners) {
            try {
                listener(state, type);
            } catch (err) {
                console.error('[Client] Listener error:', err);
            }
        }
    },

    connect() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${location.host}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.connected = true;
            this.reconnectAttempts = 0;
            console.log('[SanctuaryClient] ✓ Connected to live broadcast telemetry');
            const dot = document.getElementById('global-conn-dot');
            if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'STATE_UPDATE') {
                    this._notify(msg.data, 'STATE_UPDATE');
                } else if (msg.type === 'CONFIG_UPDATE') {
                    this._notify(msg.data, 'CONFIG_UPDATE');
                } else if (msg.type === 'EMERGENCY_REOPEN_SCREEN_TRIGGERED') {
                    this.showToast('✅ ' + (msg.data?.message || 'LONTIUM Screen & Captions Restored!'), 'success');
                } else if (msg.type === 'CAPTIONER_PANIC_TRIGGERED') {
                    this.showToast('🚨 ' + (msg.data?.message || 'Captions Panic Active: Muted'), 'warning');
                }
            } catch (err) {
                console.warn('[SanctuaryClient] Parse error:', err);
            }
        };

        this.ws.onclose = () => {
            this.connected = false;
            const dot = document.getElementById('global-conn-dot');
            if (dot) dot.className = 'w-2 h-2 rounded-full bg-red-500';
            this.scheduleReconnect();
        };

        this.ws.onerror = () => {
            this.connected = false;
        };
    },

    scheduleReconnect() {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
        setTimeout(() => this.connect(), delay);
    },

    send(type, data = {}) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, data }));
            return true;
        }
        return false;
    },

    async post(path, body = {}) {
        try {
            const res = await fetch(path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            return await res.json();
        } catch (err) {
            console.warn(`[Client] POST ${path} failed:`, err.message);
            throw err;
        }
    },

    async get(path) {
        try {
            const res = await fetch(path);
            return await res.json();
        } catch (err) {
            console.warn(`[Client] GET ${path} failed:`, err.message);
            throw err;
        }
    },

    // ── ATEM Video Switching API Helpers ──────────────
    async setAtemProgram(input) {
        try {
            await this.post('/api/atem/program', { input });
        } catch (e) {
            this.send('ATEM_SET_PROGRAM', { input });
        }
    },

    async setAtemPreview(input) {
        try {
            await this.post('/api/atem/preview', { input });
        } catch (e) {
            this.send('ATEM_SET_PREVIEW', { input });
        }
    },

    async atemCut() {
        try {
            await this.post('/api/atem/cut');
        } catch (e) {
            this.send('ATEM_CUT');
        }
    },

    async atemAuto() {
        try {
            await this.post('/api/atem/auto');
        } catch (e) {
            this.send('ATEM_AUTO');
        }
    },

    async atemFtb() {
        try {
            await this.post('/api/atem/ftb');
        } catch (e) {
            this.send('ATEM_FTB');
        }
    },

    // ── PTZOptics Camera API Helpers ──────────────────
    async ptzMove(camera, direction, speed = 12) {
        try {
            await this.post('/api/ptz/control', { camera, direction, speed });
        } catch (e) {
            this.send('PTZ_PAN_TILT', { camera, direction, speed });
        }
    },

    async ptzStop(camera) {
        try {
            await this.post('/api/ptz/control', { camera, direction: 'stop' });
        } catch (e) {
            this.send('PTZ_PAN_TILT', { camera, direction: 'stop' });
        }
    },

    async ptzZoom(camera, action, speed = 4) {
        try {
            await this.post('/api/ptz/control', { camera, action: 'zoom', zoomAction: action, speed });
        } catch (e) {
            this.send('PTZ_ZOOM', { camera, action, speed });
        }
    },

    async ptzRecallPreset(camera, preset) {
        try {
            const res = await this.post('/api/ptz/preset/recall', { camera, preset });
            this.showToast(`🎯 ${res.message || `Recalled Preset ${preset}`}`, 'success');
            return res;
        } catch (e) {
            this.send('PTZ_RECALL_PRESET', { camera, preset });
        }
    },

    async ptzSavePreset(camera, preset, name) {
        const res = await this.post('/api/ptz/preset/save', { camera, preset, name });
        this.showToast(`💾 ${res.message || `Saved Preset ${preset}`}`, 'success');
        return res;
    },

    // ── ATEM Broadcast & Recording Controls ──────────
    async toggleAtemStream() {
        try {
            const res = await this.post('/api/atem/stream/toggle', {});
            if (res && res.error) {
                this.showToast(`⚠️ ATEM: ${res.error}`, 'warning');
                return res;
            }
            this.showToast(res && res.isStreaming ? '🔴 ATEM Broadcast Started' : '⏹️ ATEM Broadcast Stopped', res && res.isStreaming ? 'warning' : 'info');
            return res;
        } catch (e) {
            console.error('ATEM Stream toggle error:', e);
        }
    },

    async toggleAtemRecord() {
        try {
            const res = await this.post('/api/atem/record/toggle', {});
            if (res && res.error) {
                this.showToast(`⚠️ ATEM: ${res.error}`, 'warning');
                return res;
            }
            this.showToast(res && res.isRecording ? '📼 ATEM USB Recording Started' : '⏹️ ATEM USB Recording Stopped', res && res.isRecording ? 'warning' : 'info');
            return res;
        } catch (e) {
            console.error('ATEM Record toggle error:', e);
        }
    },

    // ── OBS Broadcast & Recording Controls ───────────
    async toggleObsStream() {
        try {
            const res = await this.post('/api/obs/stream/toggle', {});
            if (res && res.error) {
                this.showToast(`⚠️ OBS: ${res.error}`, 'warning');
                return res;
            }
            this.showToast(res && res.isStreaming ? '🔴 OBS Stream Started' : '⏹️ OBS Stream Stopped', res && res.isStreaming ? 'warning' : 'info');
            return res;
        } catch (e) {
            console.error('OBS Stream toggle error:', e);
        }
    },

    async toggleObsRecord() {
        try {
            const res = await this.post('/api/obs/record/toggle', {});
            if (res && res.error) {
                this.showToast(`⚠️ OBS: ${res.error}`, 'warning');
                return res;
            }
            this.showToast(res && res.isRecording ? '📼 OBS Recording Started' : '⏹️ OBS Recording Stopped', res && res.isRecording ? 'warning' : 'info');
            return res;
        } catch (e) {
            console.error('OBS Record toggle error:', e);
        }
    },

    // ── Emergency & Screen Controls ───────────────────
    async triggerReopenScreen() {
        try {
            const res = await this.post('/api/control/reopen-screen', {});
            this.showToast('✅ LONTIUM Screen (Monitor 1) & Captions Active!', 'success');
            return res;
        } catch (e) {
            this.send('REOPEN_SCREEN');
        }
    },

    async triggerPanic() {
        if (!confirm('🚨 EMERGENCY PANIC:\nAre you sure you want to instantly blank all screen captions and mute output?')) return;
        try {
            const res = await this.post('/api/control/panic', {});
            this.showToast('🚨 Captions Panic Triggered: Screens Blanked & Muted', 'warning');
            return res;
        } catch (e) {
            this.send('PANIC_CAPTIONS');
        }
    },

    async clearCaptions() {
        try {
            const res = await this.post('/api/control/clear', {});
            this.showToast('🧹 Live Captions Preview Cleared', 'info');
            return res;
        } catch (e) {
            console.error('Clear captions error:', e);
        }
    },

    async toggleCaptions() {
        try {
            const res = await this.post('/api/control/toggle', {});
            this.showToast(res.isCapturing ? '▶️ Live Transcription Started' : '⏸️ Live Transcription Paused', 'info');
            return res;
        } catch (e) {
            this.send('TOGGLE_CAPTIONS');
        }
    },

    // ── Toast Notification Manager ────────────────────
    showToast(message, type = 'info') {
        let toast = document.getElementById('global-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'global-toast';
            toast.className = 'fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 font-bold px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs transition-all transform translate-y-20 opacity-0 pointer-events-none';
            document.body.appendChild(toast);
        }

        const colors = {
            success: 'bg-emerald-500 text-slate-950',
            warning: 'bg-red-500 text-white',
            info: 'bg-cyan-500 text-slate-950',
        };

        toast.className = `fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 font-bold px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs transition-all duration-300 transform ${colors[type] || colors.info}`;
        toast.textContent = message;

        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
        }, 3500);
    }
};

document.addEventListener('DOMContentLoaded', () => window.SanctuaryClient.init());
