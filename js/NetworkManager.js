import geckos from '@geckos.io/client';

/**
 * NetworkManager - Handles all multiplayer networking functionality
 * - Room management (create, join, leave)
 * - Input synchronization (send player inputs to server)
 * - State synchronization (receive game state from server)
 * - Connection handling (connect, disconnect, reconnect)
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
        
        // Server configuration - Environment specific
        const isLocalDevelopment = window.location.hostname === 'localhost' || 
                                  window.location.hostname === '127.0.0.1' ||
                                  window.location.hostname === '';
        
        if (isLocalDevelopment) {
            // Local development configuration
            this.serverHost = '127.0.0.1';
            this.serverPort = 9208; // Local development port
        } else {
            // Production configuration - DigitalOcean Droplet with HTTPS
            this.serverHost = '147.182.185.185'; // DigitalOcean Droplet IP
            this.serverPort = 443; // HTTPS port via nginx proxy
        }
        
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
    }
    
    // Connection Management
    async connect() {
        if (this.connected || this.connecting) {
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
                console.log(`🔗 DEBUG: Connecting to ${serverUrl}:${this.serverPort} (Local)`);
            } else {
                // DigitalOcean Droplet - use HTTPS with nginx proxy
                const serverUrl = `https://${this.serverHost}`;
                geckosConfig = { 
                    url: serverUrl,
                    port: this.serverPort
                };
                console.log(`🔗 DEBUG: Connecting to ${serverUrl}:${this.serverPort} (Production HTTPS)`);
            }
            
            console.log(`🔗 DEBUG: Environment: ${this.serverHost === '127.0.0.1' ? 'Local Development' : 'Production'}`);
            console.log(`🔗 DEBUG: Geckos config:`, geckosConfig);
                
            this.channel = geckos(geckosConfig);
            
            console.log(`🔗 DEBUG: Geckos client created`);
            this.setupEventHandlers();
            console.log(`🔗 DEBUG: Event handlers set up`);
            
            return new Promise((resolve, reject) => {
                console.log(`🔗 DEBUG: Setting up connection promise with 30s timeout`);
                
                // Use different timeouts for local vs production
                const timeoutDuration = this.serverHost === '127.0.0.1' || this.serverHost === 'localhost' ? 5000 : 15000;
                const timeout = setTimeout(() => {
                    console.log(`🔗 DEBUG: Connection timeout after ${timeoutDuration/1000} seconds`);
                    this.connecting = false;
                    reject(new Error(`Connection timeout - ${this.serverHost === '127.0.0.1' ? 'is local server running?' : 'server may not support WebRTC'}`));
                }, timeoutDuration);
                
                this.channel.onConnect(error => {
                    console.log(`🔗 DEBUG: onConnect callback triggered, error:`, error);
                    clearTimeout(timeout);
                    this.connecting = false;
                    
                    if (error) {
                        console.error('🔗 DEBUG: Connection failed with error:', error);
                        this.notifyError('Failed to connect to server');
                        reject(error);
                    } else {
                        console.log('🔗 DEBUG: Connection successful!');
                        this.connected = true;
                        this.reconnectAttempts = 0;
                        console.log('Connected to multiplayer server');
                        this.notifyConnectionStateChange('connected');
                        this.startPingMeasurement();
                        resolve();
                    }
                });
            });
        } catch (error) {
            this.connecting = false;
            console.error('Network connection error:', error);
            this.notifyError('Network connection failed');
            throw error;
        }
    }
    
    disconnect() {
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
            console.log('Disconnected from server');
            this.connected = false;
            this.notifyConnectionStateChange('disconnected');
            this.attemptReconnect();
        });
        
        // Room management events
        this.channel.on('roomCreated', (data) => {
            console.log('Room created:', data);
            this.currentRoom = data.room;
            this.playerId = data.playerId;
            this.isHost = true;
            this.notifyRoomUpdate(data.room);
        });
        
        this.channel.on('roomJoined', (data) => {
            console.log('Room joined:', data);
            this.currentRoom = data.room;
            this.playerId = data.playerId;
            this.isHost = data.isHost;
            this.notifyRoomUpdate(data.room);
        });
        
        this.channel.on('roomUpdated', (data) => {
            console.log('Room updated:', data);
            this.currentRoom = data.room;
            this.notifyRoomUpdate(data.room);
        });
        
        this.channel.on('playerJoined', (data) => {
            console.log('Player joined:', data);
            // Update current room state
            this.currentRoom = data.room;
            this.notifyRoomUpdate(data.room);
            this.notifyPlayerUpdate({ 
                type: 'joined', 
                player: { id: data.playerId, name: data.playerName }
            });
        });
        
        this.channel.on('playerLeft', (data) => {
            console.log('Player left:', data);
            // Update current room state
            this.currentRoom = data.room;
            this.notifyRoomUpdate(data.room);
            this.notifyPlayerUpdate({ 
                type: 'left', 
                player: { id: data.playerId, name: data.playerName }
            });
        });
        
        this.channel.on('hostChanged', (data) => {
            console.log('Host changed:', data);
            this.isHost = data.isHost;
            this.notifyPlayerUpdate({ type: 'hostChanged', newHost: data.newHost });
        });
        
        // Game state events
        this.channel.on('gameStarted', (data) => {
            console.log('Game started:', data);
            this.notifyPlayerUpdate({ type: 'gameStarted', gameState: data });
        });
        
        this.channel.on('gameStateUpdate', (data) => {
            this.handleGameStateUpdate(data);
        });
        
        this.channel.on('gameComplete', (data) => {
            console.log('🎉 Game completed:', data);
            console.log('NetworkManager received gameComplete event with data:', JSON.stringify(data, null, 2));
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
    
    // Room Management
    async createRoom(playerName, roomSettings = {}, dogType = 'jep') {
        if (!this.connected) {
            throw new Error('Not connected to server');
        }
        
        this.playerName = playerName;
        this.dogType = dogType;
        
        const roomData = {
            playerName,
            dogType,
            roomSettings: {
                maxPlayers: roomSettings.maxPlayers || 4,
                isPublic: roomSettings.isPublic !== false,
                roomName: roomSettings.roomName || `${playerName}'s Room`
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
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Room join timeout'));
            }, 5000);
            
            console.log(`🔍 DEBUG: Sending joinRoom with roomCode: "${roomCode}", playerName: "${playerName}", dogType: "${dogType}"`);
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
        if (this.connected && this.currentRoom) {
            this.channel.emit('leaveRoom');
            this.currentRoom = null;
            this.playerId = null;
            this.isHost = false;
        }
    }
    
    startGame() {
        if (this.connected && this.isHost && this.currentRoom) {
            this.channel.emit('startGame');
        }
    }
    
    // Send dog type information to server
    sendDogType(dogType) {
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
                    await this.joinRoom(this.currentRoom.code, this.playerName, this.dogType);
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
} 