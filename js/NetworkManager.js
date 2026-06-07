// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// Native WebSocket + MessagePack + fetch client for the Cloudflare Workers backend.
// Preserves the external API that js/main.js and the UI components rely on —
// `on*` callback surface, room/join/leave methods, leaderboard methods, and
// client-side prediction/jitter-buffer helpers are all unchanged.

import { encode as msgpackEncode, decode as msgpackDecode } from '@msgpack/msgpack';
import { getApiBase, getWsBase, isLocalRuntime } from './runtimeConfig.js';
import { PROTOCOL_VERSION } from '../shared/protocol.js';

export class NetworkManager {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.connecting = false;
        this.currentRoom = null;
        this.playerId = null;
        this.playerName = null;
        this.dogType = 'jep';
        this.isHost = false;
        this.token = null;

        this.apiBase = getApiBase();
        this.wsBase = getWsBase();
        this.debugMode = isLocalRuntime();

        // Callbacks
        this.onConnectionStateChange = null;
        this.onRoomUpdate = null;
        this.onGameStateUpdate = null;
        this.onPlayerUpdate = null;
        this.onError = null;
        this.onPingUpdate = null;

        // Client-side prediction / interpolation (kept for main.js compatibility)
        this.lastServerState = null;
        this.previousServerState = null;
        this.serverUpdateTimestamp = 0;
        this.interpolationDelay = 100;
        this.baseInterpolationDelay = 100;
        this.expandedInterpolationDelay = 150;

        this.packetArrivalTimes = [];
        this.maxArrivalSamples = 20;
        this.jitterExpandThreshold = 30;
        this.jitterShrinkThreshold = 15;

        // Input buffering
        this.inputBuffer = [];
        this.lastInputSequence = 0;

        // Ping measurement
        this.pingInterval = null;
        this.pingRequestId = 0;
        this.pendingPings = new Map();
        this.lastPing = null;

        // One-shot listeners for events delivered over WS (internal event bus).
        this._oneShot = new Map(); // event -> [cb, cb...]

        // Public-lobby WS listener (optional — server may not push lobbies over WS)
        this._publicLobbyCallback = null;

        // Competitive mode state
        this.lastCompetitionResult = null;
        this.competitiveModeData = null;

        // Pending room session (set after REST create/join, used to open WS)
        this.pendingSession = null;
    }

    // ---------- REST helpers ----------
    async _postJson(path, body) {
        const res = await fetch(`${this.apiBase}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body || {}),
        });
        const text = await res.text();
        let parsed;
        try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
        if (!res.ok) {
            throw new Error(parsed?.error || parsed?.message || `HTTP ${res.status}`);
        }
        return parsed;
    }

    async _getJson(path) {
        const res = await fetch(`${this.apiBase}${path}`, { method: 'GET' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    // ---------- Connection Management ----------
    // Backward-compat stub: no persistent "connection" exists outside a room now.
    // Called by legacy startup code before room operations.
    async connect() {
        this.connected = true;
        this.notifyConnectionStateChange('connected');
        return Promise.resolve();
    }

    // Leaderboard path uses fetch directly, so no connection needed.
    async connectForLeaderboard() {
        return this.connect();
    }

    disconnect() {
        if (this.ws) {
            try { this.ws.close(1000, 'client disconnect'); } catch {}
            this.ws = null;
        }
        this.connected = false;
        this.connecting = false;
        this.currentRoom = null;
        this.playerId = null;
        this.isHost = false;
        this.stopPingMeasurement();
        this.notifyConnectionStateChange('disconnected');
    }

    _openRoomSocket(roomCode, playerId, ticket = null) {
        return new Promise((resolve, reject) => {
            // P-SEC-2: ride the WS admission ticket (minted by the REST
            // create/join handler) on the upgrade URL. The Worker verifies it
            // before forwarding to the room DO; without it the upgrade is 401.
            // Fall back to the pending-session ticket so reconnect paths that
            // re-call this with two args still authenticate.
            const wsTicket = ticket ?? this.pendingSession?.ticket ?? null;
            const params = new URLSearchParams({ playerId });
            if (wsTicket) params.set('ticket', wsTicket);
            const url = `${this.wsBase}/r/${encodeURIComponent(roomCode)}/ws?${params.toString()}`;
            const ws = new WebSocket(url);
            ws.binaryType = 'arraybuffer';

            const timeout = setTimeout(() => {
                try { ws.close(); } catch {}
                reject(new Error('WebSocket connection timeout'));
            }, 10000);

            ws.addEventListener('open', () => {
                clearTimeout(timeout);
                this.ws = ws;
                this.connected = true;
                this.notifyConnectionStateChange('connected');
                this.startPingMeasurement();
                resolve();
            });

            ws.addEventListener('message', (evt) => this._onWsMessage(evt));
            ws.addEventListener('close', (evt) => {
                clearTimeout(timeout);
                if (this.ws === ws) this.ws = null;
                this.connected = false;
                this.stopPingMeasurement();
                this.notifyConnectionStateChange('disconnected');
                if (evt && evt.code !== 1000) {
                    // Non-clean close — fire error for UI but keep currentRoom so
                    // reconnect logic in the app can try again if desired.
                    this.notifyError(`Connection lost (code ${evt.code})`);
                }
            });
            ws.addEventListener('error', (_e) => {
                clearTimeout(timeout);
                reject(new Error('WebSocket error'));
            });
        });
    }

    _onWsMessage(evt) {
        let msg;
        try {
            const buf = evt.data instanceof ArrayBuffer ? new Uint8Array(evt.data) : null;
            if (!buf) return;
            msg = msgpackDecode(buf);
        } catch (e) {
            console.error('[NET] msgpack decode error:', e);
            return;
        }
        if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;

        const t = msg.t;
        switch (t) {
            case 'roomCreated':
                this.currentRoom = msg.room;
                this.playerId = msg.playerId || this.playerId;
                this.isHost = true;
                this.notifyRoomUpdate(msg.room);
                break;
            case 'roomJoined':
                this.currentRoom = msg.room;
                this.playerId = msg.playerId || this.playerId;
                this.isHost = !!msg.isHost;
                this.notifyRoomUpdate(msg.room);
                break;
            case 'roomUpdated':
                this.currentRoom = msg.room || this.currentRoom;
                this.notifyRoomUpdate(this.currentRoom);
                break;
            case 'playerJoined':
                this.currentRoom = msg.room || this.currentRoom;
                this.notifyRoomUpdate(this.currentRoom);
                this.notifyPlayerUpdate({ type: 'joined', player: { id: msg.playerId, name: msg.playerName } });
                break;
            case 'playerLeft':
                this.currentRoom = msg.room || this.currentRoom;
                this.notifyRoomUpdate(this.currentRoom);
                this.notifyPlayerUpdate({ type: 'left', player: { id: msg.playerId, name: msg.playerName } });
                break;
            case 'hostChanged':
                this.isHost = !!msg.isHost;
                if (msg.room) this.currentRoom = msg.room;
                this.notifyPlayerUpdate({
                    type: 'hostChanged',
                    newHostId: msg.newHostId,
                    newHostName: msg.newHostName,
                    isHost: this.isHost,
                });
                break;
            case 'modeLockChanged':
                if (this.currentRoom) {
                    this.currentRoom.modeLocked = msg.modeLocked;
                    this.currentRoom.gameMode = msg.gameMode;
                }
                this.notifyRoomUpdate(this.currentRoom);
                break;
            case 'gameStarted':
                this.notifyPlayerUpdate({ type: 'gameStarted', gameState: msg });
                break;
            case 'gameStateUpdate':
                this._handleGameStateUpdate(msg);
                break;
            case 'gameComplete':
                if (msg.isCompetitive && msg.competitive) {
                    this.lastCompetitionResult = msg.competitive;
                }
                this.notifyPlayerUpdate({ type: 'gameComplete', data: msg });
                break;
            case 'publicLobbies':
                if (this._publicLobbyCallback) this._publicLobbyCallback({ lobbies: msg.lobbies || [] });
                break;
            case 'pong':
                this._handlePingResponse(msg);
                break;
            case 'error':
                this.notifyError(msg.message || 'Server error');
                break;
            case 'roomError':
                console.warn('[NET] roomError:', msg.message);
                this.notifyError(msg.message || 'Room error');
                break;
            default:
                if (this.debugMode) console.warn('[NET] unknown t:', t, msg);
                break;
        }
    }

    _send(t, data = {}) {
        if (!this.ws || this.ws.readyState !== 1) return false;
        try {
            const buf = msgpackEncode({ t, ...data });
            this.ws.send(buf);
            return true;
        } catch (e) {
            console.error(`[NET] send(${t}) failed:`, e);
            return false;
        }
    }

    // ---------- Leaderboard / registration (REST) ----------
    // P-SEC-1: device-local identity. A returning client passes its stored
    // persistentId + authSecret to prove ownership; the worker rejects a
    // persistent_id presented without its matching secret (401). A NEW client
    // passes persistentId=null so the worker mints the id server-side - the
    // server-returned persistent_id + authSecret are surfaced here for the
    // caller (PlayerIdentitySetup) to persist. authSecret is returned only when
    // freshly issued (new identity or a trust-on-first-use bind of a legacy
    // row); on a matching re-register the worker omits it and we keep ours.
    async registerPlayer(persistentId, displayName, nameType = 'custom', authSecret = null) {
        const data = await this._postJson('/api/register', {
            // Omit persistent_id entirely for a brand-new identity so the
            // worker mints it (and ignores any attacker-chosen value).
            ...(persistentId ? { persistent_id: persistentId } : {}),
            ...(authSecret ? { auth_secret: authSecret } : {}),
            display_name: displayName,
            name_type: nameType,
        });
        this.token = data.token || this.token;
        // Surface the same shape the old client stored, plus the freshly-issued
        // authSecret (undefined on a matching re-register) and the canonical
        // persistent_id the worker assigned.
        return {
            success: true,
            playerProfile: data.playerProfile,
            authSecret: data.authSecret,
            persistentId: data.playerProfile?.persistentId
                ?? data.playerProfile?.persistent_id
                ?? persistentId,
        };
    }

    // Cycle 57: change the leaderboard display name. Auth-gated server-side
    // (the worker derives persistent_id from the token, never the body), so we
    // ensure a token first - that also TOFU-binds + captures a secret for a
    // legacy identity. Resolves to the updated profile; rejects with
    // Error(serverCode) for a bad name ('name_empty' / 'name_too_long') since
    // _postJson throws the parsed error message on a non-2xx.
    async renamePlayer(displayName) {
        await this._ensureToken();
        const data = await this._postJson('/api/rename', {
            token: this.token,
            display_name: displayName,
        });
        return {
            success: !!data.success,
            playerProfile: data.playerProfile || null,
            displayName: data.playerProfile?.displayName,
            fullName: data.playerProfile?.fullName,
            discriminator: data.playerProfile?.discriminator,
        };
    }

    async submitScore(gameMode, score, additionalData = {}) {
        if (!this.token) throw new Error('Not registered; call registerPlayer first.');
        const data = await this._postJson('/api/score', {
            token: this.token,
            gameMode,
            score,
            additionalData,
        });
        return {
            success: !!data.success,
            updated: !!data.updated,
            isNewRecord: !!data.isNewRecord,
            playerProfile: data.playerProfile || null,
        };
    }

    // Cycle 35 Phase 4: sceneId is required. The worker returns 400 with
    // {error:'scene_required'} when missing. Throw at the boundary so the
    // caller can't silently regress to the cross-scene mash-up.
    async getLeaderboard(gameMode, limit = 10, filters = {}) {
        const sceneId = filters.sceneId;
        if (!sceneId || sceneId === 'any') {
            throw new Error('getLeaderboard requires filters.sceneId (one of field, rolling-hills, open-country).');
        }
        const params = new URLSearchParams({ mode: gameMode, limit: String(limit), scene: sceneId });
        if (filters.sheepCount && filters.sheepCount > 0) params.set('sheepCount', String(filters.sheepCount));
        const data = await this._getJson(`/api/leaderboard?${params}`);
        return { success: true, gameMode, leaderboard: data.entries || [] };
    }

    async getAllLeaderboards(limit = 10, filters = {}) {
        const sceneId = filters.sceneId;
        if (!sceneId || sceneId === 'any') {
            throw new Error('getAllLeaderboards requires filters.sceneId (one of field, rolling-hills, open-country).');
        }
        const params = new URLSearchParams({ limit: String(limit), scene: sceneId });
        if (filters.sheepCount && filters.sheepCount > 0) params.set('sheepCount', String(filters.sheepCount));
        const data = await this._getJson(`/api/leaderboards?${params}`);
        return data.leaderboards || {};
    }

    // If we don't have a JWT yet, try to register from the identity stored in
    // localStorage so that returning users can create/join rooms without
    // re-entering a display name.
    async _ensureToken() {
        if (this.token) return;
        let identity = null;
        try {
            const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('playerIdentity') : null;
            identity = raw ? JSON.parse(raw) : null;
        } catch {}
        if (!identity || !identity.persistentId) {
            throw new Error('Register the player before creating a room.');
        }
        // P-SEC-1: returning identity - send the stored authSecret so the
        // worker re-issues a token. A persistent_id without its secret is 401.
        const result = await this.registerPlayer(
            identity.persistentId,
            identity.displayName || 'Player',
            identity.nameType || 'custom',
            identity.authSecret || null,
        );
        // Capture a freshly-issued secret (trust-on-first-use bind of a legacy
        // row that predated device-local auth) back into localStorage.
        if (result?.authSecret && typeof localStorage !== 'undefined') {
            try {
                identity.authSecret = result.authSecret;
                if (result.persistentId) identity.persistentId = result.persistentId;
                localStorage.setItem('playerIdentity', JSON.stringify(identity));
            } catch {}
        }
    }

    // ---------- Room Management ----------
    async createRoom(playerName, roomSettings = {}, dogType = 'jep') {
        await this._ensureToken();
        this.playerName = playerName;
        this.dogType = dogType;

        // Carry the client's current scene (URL param) into the room. Worker
        // validates against its registry and falls back to default on unknown.
        const sceneId = roomSettings.sceneId
            || new URLSearchParams(location.search).get('scene')
            || undefined;

        const body = {
            token: this.token,
            playerName,
            dogType,
            // Cycle 67 P5: protocol version so the DO can gate survival rooms.
            protocolVersion: PROTOCOL_VERSION,
            roomSettings: {
                maxPlayers: roomSettings.maxPlayers || 4,
                isPublic: roomSettings.isPublic !== false,
                name: roomSettings.roomName || `${playerName}'s Room`,
                gameMode: roomSettings.gameMode || 'cooperative',
                ...(sceneId ? { sceneId } : {}),
                // Cycle 8 Phase 5: forward room-level sheep count picked by host.
                ...(typeof roomSettings.sheepCount === 'number' ? { sheepCount: roomSettings.sheepCount } : {}),
            },
        };
        const data = await this._postJson('/api/rooms', body);
        this.currentRoom = data.room;
        this.playerId = data.playerId;
        this.isHost = true;
        this.pendingSession = { roomCode: data.roomCode, playerId: data.playerId, ticket: data.wsTicket };

        await this._openRoomSocket(data.roomCode, data.playerId, data.wsTicket);
        this.notifyRoomUpdate(this.currentRoom);

        return {
            success: true,
            playerId: data.playerId,
            room: data.room,
        };
    }

    async joinRoom(roomCode, playerName, dogType = 'jep') {
        await this._ensureToken();
        this.playerName = playerName;
        this.dogType = dogType;

        const data = await this._postJson(`/api/rooms/${encodeURIComponent(roomCode)}/join`, {
            token: this.token,
            playerName,
            dogType,
            // Cycle 67 P5: protocol version so the DO can refuse a too-old client
            // from a survival room (clean error before the WS upgrade).
            protocolVersion: PROTOCOL_VERSION,
        });
        this.currentRoom = data.room;
        this.playerId = data.playerId;
        this.isHost = !!data.isHost;
        this.pendingSession = { roomCode: data.roomCode, playerId: data.playerId, ticket: data.wsTicket };

        await this._openRoomSocket(data.roomCode, data.playerId, data.wsTicket);
        this.notifyRoomUpdate(this.currentRoom);

        return {
            success: true,
            playerId: data.playerId,
            room: data.room,
        };
    }

    async joinRoomByInvite(roomCode, playerName, dogType = 'jep') {
        if (this.currentRoom) this.leaveRoom();
        return this.joinRoom(roomCode, playerName, dogType);
    }

    async quickMatch(playerName, dogType = 'jep', gameMode = 'cooperative') {
        await this._ensureToken();
        this.playerName = playerName;
        this.dogType = dogType;

        const data = await this._postJson('/api/rooms/quick-match', {
            token: this.token,
            playerName,
            dogType,
            gameMode,
        });
        this.currentRoom = data.room;
        this.playerId = data.playerId;
        this.isHost = !!data.isHost;
        this.pendingSession = { roomCode: data.roomCode, playerId: data.playerId, ticket: data.wsTicket };
        await this._openRoomSocket(data.roomCode, data.playerId, data.wsTicket);
        this.notifyRoomUpdate(this.currentRoom);
        return {
            success: true,
            playerId: data.playerId,
            room: data.room,
            isQuickMatch: !!data.isQuickMatch,
        };
    }

    leaveRoom() {
        this._send('leaveRoom', {});
        if (this.ws) { try { this.ws.close(1000, 'leave'); } catch {} }
        this.currentRoom = null;
        this.playerId = null;
        this.isHost = false;
        this.pendingSession = null;
    }

    startGame() {
        console.log('[START] NetworkManager.startGame isHost=', this.isHost, 'room=', this.currentRoom?.roomCode, 'wsState=', this.ws?.readyState);
        if (!this.isHost || !this.currentRoom) {
            console.warn('[START] NetworkManager.startGame bailed');
            return;
        }
        const sent = this._send('startGame', {});
        console.log('[START] startGame _send returned', sent);
    }

    sendDogType(dogType) {
        if (!this.currentRoom) return;
        this.dogType = dogType;
        this._send('setDogType', { dogType });
    }

    setModeLock(locked) {
        if (!this.currentRoom) return;
        this._send('setModeLock', { locked: !!locked });
    }

    // Public-lobby listing. Over REST rather than over WS — simpler and stateless.
    async requestPublicLobbies() {
        try {
            const data = await this._getJson('/api/lobbies');
            if (this._publicLobbyCallback) this._publicLobbyCallback(data);
            return data;
        } catch (e) {
            if (this.debugMode) console.warn('[NET] requestPublicLobbies failed:', e);
            if (this._publicLobbyCallback) this._publicLobbyCallback({ lobbies: [] });
            return { lobbies: [] };
        }
    }

    onPublicLobbies(callback) {
        this._publicLobbyCallback = callback;
        return () => { if (this._publicLobbyCallback === callback) this._publicLobbyCallback = null; };
    }

    // ---------- Input ----------
    sendPlayerInput(input) {
        if (!this.connected || !this.currentRoom) return;
        const seq = ++this.lastInputSequence;
        const payload = {
            direction: input.direction,
            sprint: !!input.sprint,
            sequence: seq,
            inputSequence: seq, // server GameSim reads inputSequence
            timestamp: performance.now(),
            clientPosition: input.clientPosition ?? null,
            bark: !!input.bark, // Cycle 61 P5: optional one-shot bark edge
        };
        this.inputBuffer.push(payload);
        if (this.inputBuffer.length > 60) this.inputBuffer.shift();
        this._send('playerInput', payload);
    }

    // ---------- Game State ----------
    _handleGameStateUpdate(data) {
        // Strip the `t` tag so the rest of the client sees the same shape the
        // Geckos backend sent before (a raw snapshot object).
        const { t: _t, ...state } = data;
        this.previousServerState = this.lastServerState;
        this.lastServerState = state;
        const now = performance.now();
        this.serverUpdateTimestamp = now;
        this.recordPacketArrival(now);
        this.notifyGameStateUpdate(state);
    }

    recordPacketArrival(now) {
        this.packetArrivalTimes.push(now);
        if (this.packetArrivalTimes.length > this.maxArrivalSamples) {
            this.packetArrivalTimes.shift();
        }
        if (this.packetArrivalTimes.length < 5) return;
        const intervals = [];
        for (let i = 1; i < this.packetArrivalTimes.length; i++) {
            intervals.push(this.packetArrivalTimes[i] - this.packetArrivalTimes[i - 1]);
        }
        const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        let variance = 0;
        for (const v of intervals) variance += (v - mean) * (v - mean);
        variance /= intervals.length;
        const stddev = Math.sqrt(variance);
        if (stddev > this.jitterExpandThreshold) this.interpolationDelay = this.expandedInterpolationDelay;
        else if (stddev < this.jitterShrinkThreshold) this.interpolationDelay = this.baseInterpolationDelay;
    }

    getInterpolatedGameState() {
        if (!this.lastServerState || !this.previousServerState) return this.lastServerState;
        const now = performance.now();
        const delayWindow = Math.max(1, this.interpolationDelay);
        let alpha = (now - this.serverUpdateTimestamp) / delayWindow;
        alpha = Math.max(0, Math.min(1, alpha));
        return this._interpolateGameState(this.previousServerState, this.lastServerState, alpha);
    }

    _interpolateGameState(prev, curr, alpha) {
        if (!prev || !curr) return curr;
        const out = JSON.parse(JSON.stringify(curr));
        if (prev.sheep && curr.sheep) {
            for (let i = 0; i < Math.min(prev.sheep.length, curr.sheep.length); i++) {
                const a = prev.sheep[i];
                const b = curr.sheep[i];
                if (a && b && out.sheep[i]) {
                    out.sheep[i].x = this._lerp(a.x, b.x, alpha);
                    out.sheep[i].z = this._lerp(a.z, b.z, alpha);
                }
            }
        }
        return out;
    }

    _lerp(a, b, t) { return a + (b - a) * t; }

    // ---------- Ping ----------
    startPingMeasurement() {
        this.stopPingMeasurement();
        this.pingInterval = setInterval(() => this._sendPing(), 5000);
        this._sendPing();
    }

    stopPingMeasurement() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        this.pendingPings.clear();
    }

    _sendPing() {
        if (!this.connected) return;
        const id = ++this.pingRequestId;
        const ts = performance.now();
        this.pendingPings.set(id, ts);
        this._send('ping', { id, timestamp: ts });
        // Clean stale pings
        const cutoff = ts - 10000;
        for (const [pid, pts] of this.pendingPings) if (pts < cutoff) this.pendingPings.delete(pid);
    }

    _handlePingResponse(msg) {
        if (!msg || msg.id === undefined) return;
        const sent = this.pendingPings.get(msg.id);
        if (sent !== undefined) {
            const rtt = performance.now() - sent;
            this.lastPing = rtt;
            this.pendingPings.delete(msg.id);
            this.notifyPingUpdate(rtt);
        }
    }

    // ---------- Event Notifications ----------
    notifyConnectionStateChange(state) { if (this.onConnectionStateChange) this.onConnectionStateChange(state); }
    notifyRoomUpdate(room) { if (this.onRoomUpdate) this.onRoomUpdate(room); }
    notifyGameStateUpdate(state) { if (this.onGameStateUpdate) this.onGameStateUpdate(state); }
    notifyPlayerUpdate(update) { if (this.onPlayerUpdate) this.onPlayerUpdate(update); }
    notifyError(message) { if (this.onError) this.onError(message); }
    notifyPingUpdate(ms) { if (this.onPingUpdate) this.onPingUpdate(ms); }

    // ---------- Getters / Misc ----------
    isConnected() { return this.connected; }
    isInRoom() { return this.currentRoom !== null; }
    getCurrentRoom() { return this.currentRoom; }
    getPlayerId() { return this.playerId; }
    getPlayerName() { return this.playerName; }
    getDogType() { return this.dogType; }
    isCurrentHost() { return this.isHost; }

    isRacingMode() { return this.currentRoom && this.currentRoom.gameMode === 'racing'; }
    getLastCompetitionResult() { return this.lastCompetitionResult; }
    clearCompetitiveState() {
        this.lastCompetitionResult = null;
        this.competitiveModeData = null;
    }
}
