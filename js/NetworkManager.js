import geckos from '@geckos.io/client';
import { encode as msgpackEncode, decode as msgpackDecode } from '@msgpack/msgpack';

// Feature flag: set VITE_USE_DO_BACKEND=true in .env.local to activate DO/WebSocket path
const USE_DO_BACKEND = import.meta.env.VITE_USE_DO_BACKEND === 'true';

/**
 * NetworkManager - Handles all multiplayer networking functionality
 * - Room management (create, join, leave)
 * - Input synchronization (send player inputs to server)
 * - State synchronization (receive game state from server)
 * - Connection handling (connect, disconnect, reconnect)
 *
 * Two transport paths coexist via VITE_USE_DO_BACKEND feature flag:
 *   false (default) - Geckos.io WebRTC path (legacy DigitalOcean droplet)
 *   true            - Native WebSocket + MessagePack path (Cloudflare DO backend)
 */
export class NetworkManager {
    constructor() {
        this.channel = null;
        this.connected = false;
        this.connecting = false;
        this.currentRoom = null;
        this.playerId = null;
        this.playerName = null;
        this.isHost = false;

        // --- DO backend state (used when USE_DO_BACKEND=true) ---
        this._ws = null;           // native WebSocket
        this._wsRoomCode = null;   // room code the WS is connected to
        this._doApiBase = null;    // base URL for /api/* fetch calls
        this._doWsBase = null;     // base URL for ws:// connections
        this._doEventHandlers = new Map(); // event-name -> [handler, ...]

        // Server configuration - Environment specific
        const isLocalDevelopment = window.location.hostname === 'localhost' ||
                                  window.location.hostname === '127.0.0.1' ||
                                  window.location.hostname === '';

        this._isLocalDevelopment = isLocalDevelopment;

        if (USE_DO_BACKEND) {
            if (isLocalDevelopment) {
                this._doApiBase = 'http://localhost:8787';
                this._doWsBase = 'ws://localhost:8787';
            } else {
                this._doApiBase = 'https://sheepdogsim.com';
                this._doWsBase = 'wss://sheepdogsim.com';
            }
        }

        if (isLocalDevelopment) {
            // Local development configuration
            this.serverHost = '127.0.0.1';
            this.serverPort = 9208;
        } else {
            // Production configuration - DigitalOcean Droplet with Cloudflare SSL
            this.serverHost = 'api.sheepdogsim.com';
            this.serverPort = null; // Use full URL instead of separate port
        }

        // Debug mode - disabled in production
        this.debugMode = isLocalDevelopment;
        
        // Callbacks
        this.onConnectionStateChange = null;
        this.onRoomUpdate = null;
        this.onGameStateUpdate = null;
        this.onPlayerUpdate = null;
        this.onError = null;
        this.onPingUpdate = null;
        
        // Client-side prediction and interpolation
        this.lastServerState = null;
        this.previousServerState = null;
        this.serverUpdateTimestamp = 0;
        this.interpolationDelay = 100; // ms
        
        // Input buffering
        this.inputBuffer = [];
        this.lastInputSequence = 0;
        
        // Connection retry
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000; // ms
        
        // Ping measurement
        this.pingInterval = null;
        this.pingRequestId = 0;
        this.pendingPings = new Map();
        this.lastPing = null;
        
        // Competitive mode state
        this.lastCompetitionResult = null;
        this.competitiveModeData = null;
    }
    
    // =========================================================================
    // DO Backend helpers (USE_DO_BACKEND=true path)
    // =========================================================================

    /**
     * Open (or reuse) a WebSocket to /r/:roomCode/ws.
     * Returns a Promise that resolves when the socket is open.
     */
    _doOpenRoomWs(roomCode) {
        if (this._ws && this._wsRoomCode === roomCode && this._ws.readyState === WebSocket.OPEN) {
            return Promise.resolve();
        }
        this._doCloseRoomWs();
        const url = `${this._doWsBase}/r/${roomCode}/ws`;
        if (this.debugMode) console.log('[DO] Opening WS:', url);
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(url);
            ws.binaryType = 'arraybuffer';

            const openTimeout = setTimeout(() => {
                ws.close();
                reject(new Error('DO WebSocket connection timeout'));
            }, 10000);

            ws.addEventListener('open', () => {
                clearTimeout(openTimeout);
                this._ws = ws;
                this._wsRoomCode = roomCode;
                this._setupDoEventListeners();
                resolve();
            });

            ws.addEventListener('error', (ev) => {
                clearTimeout(openTimeout);
                reject(new Error('DO WebSocket error'));
            });
        });
    }

    _doCloseRoomWs() {
        if (this._ws) {
            this._ws.close();
            this._ws = null;
            this._wsRoomCode = null;
        }
    }

    /**
     * Attach message/close/error listeners to this._ws.
     * Reconnect logic lives here.
     */
    _setupDoEventListeners() {
        const ws = this._ws;
        ws.addEventListener('message', (ev) => {
            let msg;
            try {
                if (ev.data instanceof ArrayBuffer) {
                    msg = msgpackDecode(new Uint8Array(ev.data));
                } else {
                    msg = JSON.parse(ev.data);
                }
            } catch (e) {
                console.error('[DO] Failed to decode message:', e);
                return;
            }
            this._doDispatch(msg);
        });

        ws.addEventListener('close', () => {
            if (this.debugMode) console.log('[DO] WS closed');
            this.connected = false;
            this.notifyConnectionStateChange('disconnected');
            this._doAttemptReconnect();
        });

        ws.addEventListener('error', () => {
            console.error('[DO] WS error');
            this.notifyError('WebSocket error');
        });
    }

    /**
     * Dispatch a decoded server message to registered DO event handlers.
     * Maps the DO protocol message types to the existing callback surface.
     */
    _doDispatch(msg) {
        if (!msg || !msg.t) return;
        const t = msg.t;

        if (t === 'state') {
            // Adapt DO StateMsg to the shape handleMultiplayerGameState expects
            const adapted = this._doAdaptStateMsg(msg);
            this.handleGameStateUpdate(adapted);
            return;
        }

        if (t === 'lobby') {
            // Map LobbyMsg to the room shape the Geckos path uses
            const room = this._doAdaptLobbyMsg(msg);
            this.currentRoom = room;
            // Determine if I am now host
            if (this.playerId) {
                this.isHost = msg.hostId === this.playerId;
            }
            this.notifyRoomUpdate(room);
            // Emit to raw DO listeners too
            this._doEmitEvent('lobby', msg);
            return;
        }

        if (t === 'start') {
            // Store player ID if present (server may assign on join)
            this.notifyPlayerUpdate({ type: 'gameStarted', gameState: msg });
            this._doEmitEvent('start', msg);
            return;
        }

        if (t === 'complete') {
            const data = {
                isCompetitive: false,
                winner: msg.winner,
                scores: msg.scores,
                winType: msg.winType,
                sheepRetired: msg.sheepRetired,
                totalSheep: msg.totalSheep
            };
            this.notifyPlayerUpdate({ type: 'gameComplete', data });
            this._doEmitEvent('complete', msg);
            return;
        }

        if (t === 'hostChanged') {
            const isNowHost = msg.newHost === this.playerId;
            this.isHost = isNowHost;
            if (this.currentRoom) {
                this.currentRoom.hostId = msg.newHost;
            }
            this.notifyPlayerUpdate({
                type: 'hostChanged',
                newHostId: msg.newHost,
                newHostName: null,
                isHost: isNowHost
            });
            this._doEmitEvent('hostChanged', msg);
            return;
        }

        if (t === 'error') {
            this.notifyError(msg.msg || 'Server error');
            this._doEmitEvent('error', msg);
            return;
        }

        // Forward unrecognised types to any raw listeners
        this._doEmitEvent(t, msg);
    }

    /**
     * Adapt DO StateMsg ({ t:'state', tick, sheepDeltas, dogs, scores, time })
     * to the shape handleMultiplayerGameState expects:
     *   { sheep: [{x,z,vx,vz,state,hasPassedGate,isRetiring,assignedGate,facing,targetX,targetZ}],
     *     sheepdogs: [{playerId,x,z,vx,vz,rotation,stamina,sprinting,sequence}],
     *     sheepRetired: number,
     *     time: number }
     */
    _doAdaptStateMsg(msg) {
        // sheepDeltas is a sparse array of changed sheep; rebuild full state by merging with _sheepCache
        if (!this._sheepCache) this._sheepCache = {};

        const deltas = msg.sheepDeltas || [];
        for (const d of deltas) {
            this._sheepCache[d.id] = d;
        }

        // Build sheep array sorted by id for stable indexing
        const sheep = Object.values(this._sheepCache).sort((a, b) => a.id - b.id);

        // dogs array from protocol: {playerId, dogType, x, z, vx, vz, rotation, stamina, sprinting, sequence}
        const sheepdogs = (msg.dogs || []).map(d => ({
            playerId: d.playerId,
            dogType: d.dogType,
            x: d.x,
            z: d.z,
            vx: d.vx,
            vz: d.vz,
            rotation: d.rotation,
            stamina: d.stamina,
            sprinting: d.sprinting,
            sequence: d.sequence
        }));

        // Compute cooperative sheepRetired from sheep state
        const sheepRetired = sheep.filter(s => s.state === 2).length;

        // scores from protocol
        const scores = msg.scores || null;

        const adapted = {
            sheep,
            sheepdogs,
            sheepRetired,
            tick: msg.tick
        };

        if (scores) {
            adapted.competitive = {
                playerScores: scores,
                gates: null,
                winCondition: null
            };
        }

        if (msg.time !== undefined) {
            adapted.timedMode = {
                timeRemaining: msg.time,
                gameDuration: 180000 // 3 minutes default; server may override in future
            };
        }

        return adapted;
    }

    /**
     * Adapt DO LobbyMsg to the room shape the Geckos path produced.
     */
    _doAdaptLobbyMsg(msg) {
        return {
            code: msg.roomCode,
            gameMode: msg.mode,
            state: msg.state,
            hostId: msg.hostId,
            modeLocked: msg.modeLocked,
            players: (msg.players || []).map(p => ({
                id: p.id,
                name: p.name,
                dogType: p.dogType,
                isHost: p.isHost
            }))
        };
    }

    /** Register a one-time or persistent DO event listener. */
    _doOn(event, handler) {
        if (!this._doEventHandlers.has(event)) {
            this._doEventHandlers.set(event, []);
        }
        this._doEventHandlers.get(event).push(handler);
    }

    /** Remove a DO event listener. */
    _doOff(event, handler) {
        const list = this._doEventHandlers.get(event);
        if (list) {
            const idx = list.indexOf(handler);
            if (idx !== -1) list.splice(idx, 1);
        }
    }

    /** Emit a decoded message to DO listeners. */
    _doEmitEvent(event, data) {
        const list = this._doEventHandlers.get(event);
        if (list) {
            for (const fn of list.slice()) {
                fn(data);
            }
        }
    }

    /**
     * Send a MessagePack-encoded message over the room WebSocket.
     */
    _doSend(obj) {
        if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
            if (this.debugMode) console.warn('[DO] _doSend called but WS not open');
            return;
        }
        const payload = msgpackEncode({ v: 1, ...obj });
        this._ws.send(payload);
    }

    /**
     * Exponential backoff reconnect for the DO WebSocket path.
     */
    async _doAttemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.notifyError('Connection lost. Please refresh the page.');
            return;
        }
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;
        if (this.debugMode) console.log(`[DO] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        setTimeout(async () => {
            try {
                if (this._wsRoomCode) {
                    await this._doOpenRoomWs(this._wsRoomCode);
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this.notifyConnectionStateChange('connected');
                    // Re-join room after reconnect
                    if (this.playerName && this.dogType) {
                        this._doSend({ t: 'ready' });
                    }
                }
            } catch (e) {
                console.error('[DO] Reconnect failed:', e);
                this._doAttemptReconnect();
            }
        }, delay);
    }

    // =========================================================================
    // Connection Management
    // =========================================================================
    async connect() {
        if (this.connected || this.connecting) {
            return Promise.resolve();
        }

        // DO backend path: connect() is a no-op - rooms connect via joinRoom/createRoom
        if (USE_DO_BACKEND) {
            this.connected = true;
            this.connecting = false;
            this.notifyConnectionStateChange('connected');
            return Promise.resolve();
        }
        
        // Environment-specific server configuration already set in constructor
        
        this.connecting = true;
        this.notifyConnectionStateChange('connecting');
        
        try {
            // Configure Geckos connection based on environment
            let geckosConfig;
            
            if (this.serverHost === '127.0.0.1' || this.serverHost === 'localhost') {
                // Local development - use http with port
                const serverUrl = `http://${this.serverHost}`;
                geckosConfig = { 
                    url: serverUrl,
                    port: this.serverPort
                };
                if (this.debugMode) {
                    console.log(`[NET] DEBUG: Connecting to ${serverUrl}:${this.serverPort} (Local)`);
                }
            } else {
                // DigitalOcean Droplet - HTTPS with Let's Encrypt certificate via nip.io
                const serverUrl = `https://${this.serverHost}`;
                geckosConfig = { 
                    url: serverUrl,
                    port: null  // Use full URL as per Geckos.io docs for proxy setup
                };
                if (this.debugMode) {
                    console.log(`[NET] DEBUG: Connecting to ${serverUrl} (Cloudflare HTTPS)`);
                }
            }
            
            if (this.debugMode) {
                console.log(`[NET] DEBUG: Environment: ${this.serverHost === '127.0.0.1' ? 'Local Development' : 'Production'}`);
                console.log(`[NET] DEBUG: Geckos config:`, geckosConfig);
            }
            
            // Check for mixed content issue (HTTPS page trying to connect to HTTP server)
            if (window.location.protocol === 'https:' && geckosConfig.url.startsWith('http:')) {
                const errorMsg = 'Cannot connect to HTTP game server from HTTPS GitHub Pages. The game server needs HTTPS configuration.';
                console.error('[WARN] Mixed Content Error:', errorMsg);
                this.connecting = false;
                this.notifyConnectionStateChange('error');
                this.notifyError(errorMsg);
                throw new Error(errorMsg);
            }
                
            this.channel = geckos(geckosConfig);
            
            if (this.debugMode) {
                console.log(`[NET] DEBUG: Geckos client created`);
            }
            this.setupEventHandlers();
            if (this.debugMode) {
                console.log(`[NETWORK] DEBUG: Event handlers set up`);
            }
            
            return new Promise((resolve, reject) => {
                if (this.debugMode) {
                    console.log(`[NETWORK] DEBUG: Setting up connection promise with 30s timeout`);
                }
                
                // Use different timeouts for local vs production
                const timeoutDuration = this.serverHost === '127.0.0.1' || this.serverHost === 'localhost' ? 5000 : 15000;
                const timeout = setTimeout(() => {
                    if (this.debugMode) {
                        console.log(`[NETWORK] DEBUG: Connection timeout after ${timeoutDuration/1000} seconds`);
                    }
                    this.connecting = false;
                    reject(new Error(`Connection timeout - ${this.serverHost === '127.0.0.1' ? 'is local server running?' : 'server may not support WebRTC'}`));
                }, timeoutDuration);
                
                this.channel.onConnect(error => {
                    if (this.debugMode) {
                        console.log(`[NETWORK] DEBUG: onConnect callback triggered, error:`, error);
                    }
                    clearTimeout(timeout);
                    this.connecting = false;
                    
                    if (error) {
                        if (this.debugMode) {
                            console.error('[NETWORK] DEBUG: Connection failed with error:', error);
                        }
                        this.notifyError('Failed to connect to server');
                        reject(error);
                    } else {
                        if (this.debugMode) {
                            console.log('[NETWORK] DEBUG: Connection successful!');
                        }
                        this.connected = true;
                        this.reconnectAttempts = 0;
                        this.notifyConnectionStateChange('connected');
                        this.startPingMeasurement();
                        resolve();
                    }
                });
            });
        } catch (error) {
            this.connecting = false;
            if (this.debugMode) {
                console.error('Network connection error:', error);
            }
            this.notifyError('Network connection failed');
            throw error;
        }
    }
    
    disconnect() {
        if (USE_DO_BACKEND) {
            this._doCloseRoomWs();
            this.connected = false;
            this.connecting = false;
            this.currentRoom = null;
            this.playerId = null;
            this.isHost = false;
            this._sheepCache = null;
            this.stopPingMeasurement();
            this.notifyConnectionStateChange('disconnected');
            return;
        }
        if (this.channel) {
            this.channel.close();
        }
        this.connected = false;
        this.connecting = false;
        this.currentRoom = null;
        this.playerId = null;
        this.isHost = false;
        this.stopPingMeasurement();
        this.notifyConnectionStateChange('disconnected');
    }
    
    setupEventHandlers() {
        if (!this.channel) return;
        
        // Connection events
        this.channel.onDisconnect(() => {
            if (this.debugMode) {
                console.log('Disconnected from server');
            }
            this.connected = false;
            this.notifyConnectionStateChange('disconnected');
            this.attemptReconnect();
        });
        
        // Room management events
        this.channel.on('roomCreated', (data) => {
            if (this.debugMode) {
                console.log('Room created:', data);
            }
            this.currentRoom = data.room;
            this.playerId = data.playerId;
            this.isHost = true;
            this.notifyRoomUpdate(data.room);
        });
        
        this.channel.on('roomJoined', (data) => {
            if (this.debugMode) {
                console.log('Room joined:', data);
            }
            this.currentRoom = data.room;
            this.playerId = data.playerId;
            this.isHost = data.isHost;
            this.notifyRoomUpdate(data.room);
        });
        
        this.channel.on('roomUpdated', (data) => {
            if (this.debugMode) {
                console.log('Room updated:', data);
            }
            this.currentRoom = data.room;
            this.notifyRoomUpdate(data.room);
        });
        
        this.channel.on('playerJoined', (data) => {
            if (this.debugMode) {
                console.log('Player joined:', data);
            }
            // Update current room state
            this.currentRoom = data.room;
            this.notifyRoomUpdate(data.room);
            this.notifyPlayerUpdate({ 
                type: 'joined', 
                player: { id: data.playerId, name: data.playerName }
            });
        });
        
        this.channel.on('playerLeft', (data) => {
            if (this.debugMode) {
                console.log('Player left:', data);
            }
            // Update current room state
            this.currentRoom = data.room;
            this.notifyRoomUpdate(data.room);
            this.notifyPlayerUpdate({ 
                type: 'left', 
                player: { id: data.playerId, name: data.playerName }
            });
        });
        
        this.channel.on('hostChanged', (data) => {
            if (this.debugMode) {
                console.log('Host changed:', data);
            }
            this.isHost = data.isHost;
            if (data.room) this.currentRoom = data.room;
            this.notifyPlayerUpdate({ type: 'hostChanged', newHostId: data.newHostId, newHostName: data.newHostName, isHost: data.isHost });
        });

        this.channel.on('modeLockChanged', (data) => {
            if (this.debugMode) {
                console.log('Mode lock changed:', data);
            }
            if (this.currentRoom) {
                this.currentRoom.modeLocked = data.modeLocked;
                this.currentRoom.gameMode = data.gameMode;
            }
            this.notifyRoomUpdate(this.currentRoom);
        });
        
        // Game state events
        this.channel.on('gameStarted', (data) => {
            if (this.debugMode) {
                console.log('Game started:', data);
            }
            this.notifyPlayerUpdate({ type: 'gameStarted', gameState: data });
        });
        
        this.channel.on('gameStateUpdate', (data) => {
            this.handleGameStateUpdate(data);
        });
        
        this.channel.on('gameComplete', (data) => {
            console.log('[GAME] Game completed:', data);
            console.log('NetworkManager received gameComplete event with data:', JSON.stringify(data, null, 2));
            
            // Handle competitive vs cooperative completion
            if (data.isCompetitive && data.competitive) {
                console.log('[RACING] Competitive game completion detected');
                console.log('Winner:', data.competitive.winner);
                console.log('Final scores:', data.competitive.finalScores);
                
                // Store competitive completion data for reconnection
                this.lastCompetitionResult = data.competitive;
            }
            
            this.notifyPlayerUpdate({ type: 'gameComplete', data: data });
        });
        
        // Error handling
        this.channel.on('error', (error) => {
            console.error('Server error:', error);
            this.notifyError(error.message || 'Server error occurred');
        });
        
        this.channel.on('roomError', (error) => {
            console.error('Room error:', error);
            this.notifyError(error.message || 'Room error occurred');
        });
        
        // Ping measurement
        this.channel.on('ping', (data) => {
            // Respond to server ping
            this.channel.emit('pong', data);
        });
        
        this.channel.on('pong', (data) => {
            // Handle ping response
            this.handlePingResponse(data);
        });
    }
    
    // =========================================================================
    // Room Management
    // =========================================================================
    async createRoom(playerName, roomSettings = {}, dogType = 'jep') {
        if (!this.connected) {
            throw new Error('Not connected to server');
        }

        this.playerName = playerName;
        this.dogType = dogType;

        if (USE_DO_BACKEND) {
            // POST /api/rooms to create a room, then connect WS
            const mode = roomSettings.gameMode || 'cooperative';
            const isPublic = roomSettings.isPublic !== false;
            const resp = await fetch(`${this._doApiBase}/api/rooms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerName, dogType, mode, isPublic })
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: 'Room creation failed' }));
                throw new Error(err.error || 'Room creation failed');
            }
            const { roomCode, playerId } = await resp.json();
            this.playerId = playerId;
            this.isHost = true;
            this._sheepCache = null;
            // Open WS and wait for initial lobby message
            await this._doOpenRoomWs(roomCode);
            // Send join intent over WS (server expects it after WS upgrade)
            this._doSend({ t: 'ready' });
            // Await first lobby message
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this._doOff('lobby', onLobby);
                    this._doOff('error', onError);
                    reject(new Error('Room creation timeout'));
                }, 8000);
                const onLobby = (msg) => {
                    clearTimeout(timeout);
                    this._doOff('lobby', onLobby);
                    this._doOff('error', onError);
                    resolve({ room: this.currentRoom, playerId: this.playerId });
                };
                const onError = (msg) => {
                    clearTimeout(timeout);
                    this._doOff('lobby', onLobby);
                    this._doOff('error', onError);
                    reject(new Error(msg.msg || 'Room error'));
                };
                this._doOn('lobby', onLobby);
                this._doOn('error', onError);
            });
        }

        const roomData = {
            playerName,
            dogType,
            roomSettings: {
                maxPlayers: roomSettings.maxPlayers || 4,
                isPublic: roomSettings.isPublic !== false,
                roomName: roomSettings.roomName || `${playerName}'s Room`,
                gameMode: roomSettings.gameMode || 'cooperative'
            }
        };

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Room creation timeout'));
            }, 5000);

            this.channel.emit('createRoom', roomData);

            const handleRoomCreated = (data) => {
                clearTimeout(timeout);
                resolve(data);
            };

            const handleRoomError = (error) => {
                clearTimeout(timeout);
                reject(new Error(error.message));
            };

            this.channel.on('roomCreated', handleRoomCreated);
            this.channel.on('roomError', handleRoomError);
        });
    }

    async joinRoom(roomCode, playerName, dogType = 'jep') {
        if (!this.connected) {
            throw new Error('Not connected to server');
        }

        this.playerName = playerName;
        this.dogType = dogType;

        if (USE_DO_BACKEND) {
            if (this.debugMode) console.log(`[DO] joinRoom ${roomCode} as ${playerName}`);
            // POST to join room then open WS
            const resp = await fetch(`${this._doApiBase}/api/rooms/${roomCode}/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playerName, dogType })
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: 'Room join failed' }));
                throw new Error(err.error || 'Room join failed');
            }
            const { playerId } = await resp.json();
            this.playerId = playerId;
            this.isHost = false;
            this._sheepCache = null;
            await this._doOpenRoomWs(roomCode);
            this._doSend({ t: 'ready' });
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this._doOff('lobby', onLobby);
                    this._doOff('error', onError);
                    reject(new Error('Room join timeout'));
                }, 8000);
                const onLobby = (msg) => {
                    clearTimeout(timeout);
                    this._doOff('lobby', onLobby);
                    this._doOff('error', onError);
                    resolve({ room: this.currentRoom, playerId: this.playerId, isHost: this.isHost });
                };
                const onError = (msg) => {
                    clearTimeout(timeout);
                    this._doOff('lobby', onLobby);
                    this._doOff('error', onError);
                    reject(new Error(msg.msg || 'Room error'));
                };
                this._doOn('lobby', onLobby);
                this._doOn('error', onError);
            });
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Room join timeout'));
            }, 5000);

            console.log(`[NETWORK] DEBUG: Sending joinRoom with roomCode: "${roomCode}", playerName: "${playerName}", dogType: "${dogType}"`);
            this.channel.emit('joinRoom', { roomCode, playerName, dogType });

            const handleRoomJoined = (data) => {
                clearTimeout(timeout);
                resolve(data);
            };

            const handleRoomError = (error) => {
                clearTimeout(timeout);
                reject(new Error(error.message));
            };

            this.channel.on('roomJoined', handleRoomJoined);
            this.channel.on('roomError', handleRoomError);
        });
    }

    async quickMatch(playerName, dogType = 'jep') {
        if (!this.connected) {
            throw new Error('Not connected to server');
        }

        this.playerName = playerName;
        this.dogType = dogType;

        if (USE_DO_BACKEND) {
            // Fetch public lobbies and pick one with space, or create a new public room
            const resp = await fetch(`${this._doApiBase}/api/lobbies`);
            if (resp.ok) {
                const lobbies = await resp.json();
                const available = lobbies.filter(l => l.state === 'waiting' && l.playerCount < l.maxPlayers);
                if (available.length > 0) {
                    // Join the one with most players
                    available.sort((a, b) => b.playerCount - a.playerCount);
                    return this.joinRoom(available[0].roomCode, playerName, dogType);
                }
            }
            // Create a new public room
            return this.createRoom(playerName, { isPublic: true, gameMode: 'cooperative' }, dogType);
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Quick match timeout'));
            }, 10000);

            this.channel.emit('quickMatch', { playerName, dogType });

            const handleRoomJoined = (data) => {
                clearTimeout(timeout);
                resolve(data);
            };

            const handleRoomError = (error) => {
                clearTimeout(timeout);
                reject(new Error(error.message));
            };

            this.channel.on('roomJoined', handleRoomJoined);
            this.channel.on('roomError', handleRoomError);
        });
    }
    
    leaveRoom() {
        if (USE_DO_BACKEND) {
            if (this._ws && this.currentRoom) {
                this._doSend({ t: 'leave' });
            }
            this._doCloseRoomWs();
            this.currentRoom = null;
            this.playerId = null;
            this.isHost = false;
            this._sheepCache = null;
            return;
        }
        if (this.connected && this.currentRoom) {
            this.channel.emit('leaveRoom');
            this.currentRoom = null;
            this.playerId = null;
            this.isHost = false;
        }
    }

    /**
     * Join a room by invite code. Auto-leaves any current room first.
     */
    async joinRoomByInvite(roomCode, playerName, dogType = 'jep') {
        if (this.currentRoom) {
            this.leaveRoom();
        }
        return this.joinRoom(roomCode, playerName, dogType);
    }

    /**
     * Request the list of public lobbies from the server.
     * For DO backend: fetches /api/lobbies and calls callback with the result.
     * For Geckos: emits getPublicLobbies event.
     */
    requestPublicLobbies() {
        if (USE_DO_BACKEND) {
            fetch(`${this._doApiBase}/api/lobbies`)
                .then(r => r.json())
                .then(data => this._doEmitEvent('publicLobbies', data))
                .catch(e => console.error('[DO] requestPublicLobbies failed:', e));
            return;
        }
        if (this.connected && this.channel) {
            this.channel.emit('getPublicLobbies');
        }
    }

    /**
     * Listen for a single 'publicLobbies' response.
     * Returns a cleanup function to remove the listener.
     */
    onPublicLobbies(callback) {
        if (USE_DO_BACKEND) {
            const handler = (data) => callback(data);
            this._doOn('publicLobbies', handler);
            return () => this._doOff('publicLobbies', handler);
        }
        if (!this.channel) return () => {};
        const handler = (data) => callback(data);
        this.channel.on('publicLobbies', handler);
        return () => {
            // geckos does not expose removeListener; we store and replace with noop if needed
        };
    }

    /**
     * Emit setModeLock to server (host only).
     */
    setModeLock(locked) {
        if (USE_DO_BACKEND) {
            if (this._ws && this.currentRoom) {
                this._doSend({ t: 'modeLock', locked });
            }
            return;
        }
        if (this.connected && this.currentRoom) {
            this.channel.emit('setModeLock', { locked });
        }
    }

    startGame() {
        if (USE_DO_BACKEND) {
            if (this._ws && this.isHost && this.currentRoom) {
                this._doSend({ t: 'start' });
            }
            return;
        }
        if (this.connected && this.isHost && this.currentRoom) {
            this.channel.emit('startGame');
        }
    }

    // Send dog type information to server
    sendDogType(dogType) {
        if (USE_DO_BACKEND) {
            this.dogType = dogType;
            if (this._ws && this.currentRoom) {
                this._doSend({ t: 'setDog', dogType });
            }
            return;
        }
        if (this.connected && this.currentRoom) {
            this.dogType = dogType;
            this.channel.emit('setDogType', { dogType });
        }
    }

    // Input Handling
    sendPlayerInput(input) {
        if (!this.connected || !this.currentRoom) return;

        // Add sequence number for client-side prediction
        const inputWithSequence = {
            ...input,
            sequence: ++this.lastInputSequence,
            timestamp: performance.now()
        };
        
        // Store in buffer for prediction
        this.inputBuffer.push(inputWithSequence);

        // Keep buffer size manageable
        if (this.inputBuffer.length > 60) { // ~1 second at 60fps
            this.inputBuffer.shift();
        }

        if (USE_DO_BACKEND) {
            // Map to DO protocol InputMsg shape
            this._doSend({
                t: 'input',
                seq: inputWithSequence.sequence,
                dir: { x: input.x || 0, z: input.z || 0 },
                sprint: input.sprint || false,
                clientPos: input.clientPosition
                    ? { x: input.clientPosition.x, z: input.clientPosition.z }
                    : undefined
            });
            return;
        }

        // Send to server
        this.channel.emit('playerInput', inputWithSequence);
    }
    
    // Game State Handling
    handleGameStateUpdate(data) {
        // Store previous state for interpolation
        this.previousServerState = this.lastServerState;
        this.lastServerState = data;
        this.serverUpdateTimestamp = performance.now();
        
        // Notify game of new state
        this.notifyGameStateUpdate(data);
    }
    
    // Get interpolated game state for smooth rendering
    getInterpolatedGameState() {
        if (!this.lastServerState || !this.previousServerState) {
            return this.lastServerState;
        }
        
        const now = performance.now();
        const timeSinceUpdate = now - this.serverUpdateTimestamp;
        const serverTickRate = 1000 / 60; // 60 FPS server
        
        // Calculate interpolation factor
        let alpha = timeSinceUpdate / serverTickRate;
        alpha = Math.max(0, Math.min(1, alpha)); // Clamp between 0 and 1
        
        // Interpolate between previous and current state
        return this.interpolateGameState(this.previousServerState, this.lastServerState, alpha);
    }
    
    interpolateGameState(prevState, currState, alpha) {
        if (!prevState || !currState) return currState;
        
        const interpolated = JSON.parse(JSON.stringify(currState));
        
        // Interpolate sheep positions
        if (prevState.sheep && currState.sheep) {
            for (let i = 0; i < Math.min(prevState.sheep.length, currState.sheep.length); i++) {
                const prevSheep = prevState.sheep[i];
                const currSheep = currState.sheep[i];
                
                if (prevSheep && currSheep) {
                    interpolated.sheep[i].position.x = this.lerp(prevSheep.position.x, currSheep.position.x, alpha);
                    interpolated.sheep[i].position.z = this.lerp(prevSheep.position.z, currSheep.position.z, alpha);
                }
            }
        }
        
        // Interpolate dog positions
        if (prevState.dogs && currState.dogs) {
            for (const dogId in currState.dogs) {
                if (prevState.dogs[dogId] && currState.dogs[dogId]) {
                    interpolated.dogs[dogId].position.x = this.lerp(
                        prevState.dogs[dogId].position.x, 
                        currState.dogs[dogId].position.x, 
                        alpha
                    );
                    interpolated.dogs[dogId].position.z = this.lerp(
                        prevState.dogs[dogId].position.z, 
                        currState.dogs[dogId].position.z, 
                        alpha
                    );
                }
            }
        }
        
        return interpolated;
    }
    
    lerp(a, b, t) {
        return a + (b - a) * t;
    }
    
    // Connection Recovery
    async attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnect attempts reached');
            this.notifyError('Connection lost. Please refresh the page.');
            return;
        }
        
        this.reconnectAttempts++;
        console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        
        setTimeout(async () => {
            try {
                await this.connect();
                
                // If we were in a room, try to rejoin
                if (this.currentRoom && this.playerName) {
                    console.log('[NETWORK] Reconnecting to room:', this.currentRoom.code);
                    
                        // Check if it was a racing room for special handling
        const wasRacing = this.currentRoom.gameMode === 'racing';
        if (wasRacing) {
            console.log('[RACING] Reconnecting to racing room');
        }
                    
                    await this.joinRoom(this.currentRoom.code, this.playerName, this.dogType);
                    
                            // If we had racing data and it was completed, restore it
        if (wasRacing && this.lastCompetitionResult) {
            console.log('[RACING] Restoring racing completion state');
                        // Notify the game about the previous competition result
                        this.notifyPlayerUpdate({ 
                            type: 'competitiveStateRestored', 
                            data: this.lastCompetitionResult 
                        });
                    }
                }
            } catch (error) {
                console.error('Reconnection failed:', error);
                this.attemptReconnect();
            }
        }, this.reconnectDelay * this.reconnectAttempts); // Exponential backoff
    }
    
    // Ping Measurement
    startPingMeasurement() {
        this.stopPingMeasurement(); // Clear any existing interval
        
        // Send ping every 5 seconds
        this.pingInterval = setInterval(() => {
            this.sendPing();
        }, 5000);
        
        // Send initial ping
        this.sendPing();
    }
    
    stopPingMeasurement() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        this.pendingPings.clear();
    }
    
    sendPing() {
        if (!this.connected || !this.channel) return;
        
        const pingId = ++this.pingRequestId;
        const timestamp = performance.now();
        
        this.pendingPings.set(pingId, timestamp);
        this.channel.emit('ping', { id: pingId, timestamp });
        
        // Clean up old pending pings (older than 10 seconds)
        const cutoff = timestamp - 10000;
        for (const [id, time] of this.pendingPings.entries()) {
            if (time < cutoff) {
                this.pendingPings.delete(id);
            }
        }
    }
    
    handlePingResponse(data) {
        if (!data || !data.id) return;
        
        const sendTime = this.pendingPings.get(data.id);
        if (sendTime) {
            const roundTripTime = performance.now() - sendTime;
            this.lastPing = roundTripTime;
            this.pendingPings.delete(data.id);
            
            // Notify about ping update (for UI)
            this.notifyPingUpdate(roundTripTime);
        }
    }
    
    // Event Notification Helpers
    notifyConnectionStateChange(state) {
        if (this.onConnectionStateChange) {
            this.onConnectionStateChange(state);
        }
    }
    
    notifyRoomUpdate(room) {
        if (this.onRoomUpdate) {
            this.onRoomUpdate(room);
        }
    }
    
    notifyGameStateUpdate(gameState) {
        if (this.onGameStateUpdate) {
            this.onGameStateUpdate(gameState);
        }
    }
    
    notifyPlayerUpdate(update) {
        if (this.onPlayerUpdate) {
            this.onPlayerUpdate(update);
        }
    }
    
    notifyError(message) {
        if (this.onError) {
            this.onError(message);
        }
    }
    
    notifyPingUpdate(pingMs) {
        if (this.onPingUpdate) {
            this.onPingUpdate(pingMs);
        }
    }
    
    // Getters
    isConnected() {
        return this.connected;
    }
    
    isInRoom() {
        return this.currentRoom !== null;
    }
    
    getCurrentRoom() {
        return this.currentRoom;
    }
    
    getPlayerId() {
        return this.playerId;
    }
    
    getPlayerName() {
        return this.playerName;
    }
    
    getDogType() {
        return this.dogType;
    }
    
    isCurrentHost() {
        return this.isHost;
    }
    
    // Lightweight connection for leaderboard-only operations
    async connectForLeaderboard() {
        if (this.connected) {
            console.log('[NETWORK] Already connected, reusing existing session for leaderboard');
            return Promise.resolve();
        }

        console.log('[NETWORK] Establishing leaderboard-only connection...');

        // DO backend: connect() is a no-op (leaderboard uses fetch)
        // Geckos path: open the channel
        try {
            await this.connect();
            console.log('[OK] Leaderboard connection established successfully');
        } catch (error) {
            console.error('[ERROR] Failed to establish leaderboard connection:', error.message);
            throw error;
        }
    }

    // =========================================================================
    // Leaderboard API Methods
    // =========================================================================
    async registerPlayer(persistentId, displayName, nameType = 'custom') {
        if (USE_DO_BACKEND) {
            const resp = await fetch(`${this._doApiBase}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ persistentId, displayName, nameType })
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: 'Registration failed' }));
                throw new Error(err.error || 'Registration failed');
            }
            return resp.json();
        }

        if (!this.connected) {
            throw new Error('Not connected to server');
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Player registration timeout'));
            }, 5000);

            this.channel.emit('registerPlayer', { persistentId, displayName, nameType });

            const handleRegistered = (data) => {
                clearTimeout(timeout);
                resolve(data);
            };

            const handleError = (error) => {
                clearTimeout(timeout);
                reject(new Error(error.message));
            };

            this.channel.on('playerRegistered', handleRegistered);
            this.channel.on('leaderboardError', handleError);
        });
    }

    async submitScore(gameMode, score, additionalData = {}) {
        if (USE_DO_BACKEND) {
            const token = this._doAuthToken || null;
            const resp = await fetch(`${this._doApiBase}/api/score`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ gameMode, score, ...additionalData })
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: 'Score submission failed' }));
                throw new Error(err.error || 'Score submission failed');
            }
            return resp.json();
        }

        if (!this.connected) {
            throw new Error('Not connected to server');
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Score submission timeout'));
            }, 5000);

            this.channel.emit('submitScore', { gameMode, score, additionalData });

            const handleSubmitted = (data) => {
                clearTimeout(timeout);
                resolve(data);
            };

            const handleError = (error) => {
                clearTimeout(timeout);
                reject(new Error(error.message));
            };

            this.channel.on('scoreSubmitted', handleSubmitted);
            this.channel.on('leaderboardError', handleError);
        });
    }

    async getLeaderboard(gameMode, limit = 10) {
        if (USE_DO_BACKEND) {
            const resp = await fetch(`${this._doApiBase}/api/leaderboard?mode=${encodeURIComponent(gameMode)}&limit=${limit}`);
            if (!resp.ok) throw new Error('Failed to fetch leaderboard');
            return resp.json();
        }

        if (!this.connected) {
            throw new Error('Not connected to server');
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Leaderboard fetch timeout'));
            }, 5000);

            this.channel.emit('getLeaderboard', { gameMode, limit });

            const handleLeaderboard = (data) => {
                clearTimeout(timeout);
                resolve(data);
            };

            const handleError = (error) => {
                clearTimeout(timeout);
                reject(new Error(error.message));
            };

            this.channel.on('leaderboardData', handleLeaderboard);
            this.channel.on('leaderboardError', handleError);
        });
    }

    async getAllLeaderboards(limit = 10) {
        if (USE_DO_BACKEND) {
            const modes = ['soloClassic', 'soloExtreme', 'timed', 'competitive', 'cooperative'];
            const results = {};
            await Promise.all(modes.map(async (mode) => {
                try {
                    results[mode] = await this.getLeaderboard(mode, limit);
                } catch (e) {
                    results[mode] = [];
                }
            }));
            return results;
        }

        if (!this.connected) {
            throw new Error('Not connected to server');
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('All leaderboards fetch timeout'));
            }, 5000);

            this.channel.emit('getAllLeaderboards', { limit });

            const handleAllLeaderboards = (data) => {
                clearTimeout(timeout);
                console.log('[LEADERBOARD] NetworkManager received leaderboard data:', data);
                // Return the leaderboards object directly
                resolve(data.leaderboards || data);
            };

            const handleError = (error) => {
                clearTimeout(timeout);
                reject(new Error(error.message));
            };

            this.channel.on('allLeaderboardsData', handleAllLeaderboards);
            this.channel.on('leaderboardError', handleError);
        });
    }

    // Racing mode helpers
    isRacingMode() {
        return this.currentRoom && this.currentRoom.gameMode === 'racing';
    }
    
    getLastCompetitionResult() {
        return this.lastCompetitionResult;
    }
    
    clearCompetitiveState() {
        this.lastCompetitionResult = null;
        this.competitiveModeData = null;
    }
}
