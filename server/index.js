/**
 * Multiplayer Sheepdog Simulation Server
 * Main entry point with Geckos.io networking
 */

import geckos from '@geckos.io/server';
import { RoomManager } from './RoomManager.js';
import { GameSimulation } from './GameSimulation.js';

class MultiplayerServer {
    constructor(options = {}) {
        this.port = options.port || 3001;
        this.host = options.host || 'localhost';
        
        // Initialize systems
        this.roomManager = new RoomManager();
        this.io = null;
        this.players = new Map(); // socketId -> playerInfo
        
        // Server statistics
        this.stats = {
            startTime: Date.now(),
            connectionsTotal: 0,
            connectionsActive: 0,
            messagesReceived: 0,
            messagesSent: 0
        };
        
        // Maintenance interval
        this.maintenanceInterval = null;
        
        // Game state broadcast interval
        this.broadcastInterval = null;
    }

    async start() {
        try {
            console.log(`🔧 Configuring Geckos.io server with host: ${this.host}, port: ${this.port}`);
            
            // Create Geckos.io server with proper configuration for production
            this.io = geckos({
                authorization: false,
                cors: {
                    origin: '*',
                    allowAuthorization: false
                },
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ],
                // Production settings for Fly.io proxy
                maxPayload: 200000,
                pingTimeout: 60000,
                pingInterval: 25000
            });

            this.setupEventHandlers();
            this.startMaintenanceLoop();
            this.startBroadcastLoop();
            
            // Add a simple health check endpoint for server wake-up
            this.setupHealthCheck();
            
            // Listen on the specified port and host
            this.io.listen(this.port, this.host);
            
            console.log(`🚀 Multiplayer server started on ${this.host}:${this.port}`);
            console.log(`🎮 Ready for connections!`);
            console.log(`🔗 WebRTC signaling available at http://${this.host}:${this.port}/.wrtc/v2/connections`);
            console.log(`📍 Server process ID: ${process.pid}`);
            
        } catch (error) {
            console.error('❌ Failed to start server:', error);
            console.error('Stack trace:', error.stack);
            process.exit(1);
        }
    }

    setupHealthCheck() {
        // Add a delay to ensure Geckos.io server is fully initialized
        setTimeout(() => {
            if (this.io && this.io.server) {
                console.log('🏥 Setting up health check endpoint');
                this.io.server.on('request', (req, res) => {
                    if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
                        res.writeHead(200, { 
                            'Content-Type': 'text/plain',
                            'Access-Control-Allow-Origin': '*'
                        });
                        res.end('OK');
                        console.log(`🏥 Health check from ${req.headers['x-forwarded-for'] || req.connection.remoteAddress}`);
                    } else {
                        res.writeHead(404);
                        res.end('Not found');
                    }
                });
                console.log('✅ Health check endpoint ready');
            } else {
                console.warn('⚠️ Cannot set up health check - Geckos.io server not available');
            }
        }, 1000);
    }

    setupEventHandlers() {
        this.io.onConnection((channel) => {
            const playerId = channel.id;
            
            console.log(`👤 Player ${playerId} connected`);
            this.stats.connectionsTotal++;
            this.stats.connectionsActive++;
            
            // Initialize player data
            this.players.set(playerId, {
                id: playerId,
                channel: channel,
                name: 'Anonymous',
                dogType: 'jep', // Default dog type
                roomCode: null,
                connectedAt: Date.now(),
                lastActivity: Date.now()
            });

            // Set up player event handlers
            this.setupPlayerEventHandlers(channel, playerId);
        });
    }

    setupPlayerEventHandlers(channel, playerId) {
        // Handle player disconnection
        channel.onDisconnect(() => {
            console.log(`👋 Player ${playerId} disconnected`);
            this.handlePlayerDisconnect(playerId);
        });

        // Room management events
        channel.on('createRoom', (data) => {
            this.handleCreateRoom(playerId, data);
        });

        channel.on('joinRoom', (data) => {
            this.handleJoinRoom(playerId, data);
        });

        channel.on('leaveRoom', () => {
            this.handleLeaveRoom(playerId);
        });

        channel.on('quickMatch', (data) => {
            this.handleQuickMatch(playerId, data);
        });

        channel.on('startGame', () => {
            this.handleStartGame(playerId);
        });

        channel.on('setReady', (data) => {
            this.handleSetReady(playerId, data.ready);
        });

        // Game input events
        channel.on('playerInput', (data) => {
            this.handlePlayerInput(playerId, data);
        });

        // Dog type updates
        channel.on('setDogType', (data) => {
            this.handleSetDogType(playerId, data);
        });

        // Utility events
        channel.on('ping', () => {
            channel.emit('pong', { timestamp: Date.now() });
        });

        channel.on('getStats', () => {
            channel.emit('serverStats', this.getServerStats());
        });
    }

    handleCreateRoom(playerId, data) {
        try {
            const player = this.players.get(playerId);
            if (!player) return;

            console.log(`🔍 DEBUG: createRoom data for ${playerId}:`, JSON.stringify(data, null, 2));
            const { roomSettings, dogType } = data;
            const room = this.roomManager.createRoom(playerId, roomSettings, dogType || 'jep');
            
            player.roomCode = room.roomCode;
            player.name = data.playerName || 'Host';
            player.dogType = dogType || 'jep'; // Store dog type in player data
            player.lastActivity = Date.now();

            // Send success response
            player.channel.emit('roomCreated', {
                success: true,
                playerId: playerId,
                room: room.getSerializableState()
            });

            console.log(`🏠 Room ${room.roomCode} created by ${playerId}`);
            
        } catch (error) {
            console.error(`❌ Error creating room for ${playerId}:`, error.message);
            this.sendError(playerId, 'createRoom', error.message);
        }
    }

    handleJoinRoom(playerId, data) {
        try {
            const player = this.players.get(playerId);
            if (!player) return;

            console.log(`🔍 DEBUG: joinRoom data for ${playerId}:`, JSON.stringify(data, null, 2));
            const { roomCode, playerName, dogType } = data;
            console.log(`🔍 DEBUG: Extracted roomCode: "${roomCode}", playerName: "${playerName}", dogType: "${dogType}"`);
            const room = this.roomManager.joinRoom(roomCode, playerId, playerName, dogType || 'jep');
            
            player.roomCode = room.roomCode;
            player.name = playerName || 'Anonymous';
            player.dogType = dogType || 'jep'; // Store dog type in player data
            player.lastActivity = Date.now();

            // Send success response to joining player
            player.channel.emit('roomJoined', {
                success: true,
                playerId: playerId,
                room: room.getSerializableState()
            });

            // Broadcast player joined to all players in room
            this.broadcastToRoom(room.roomCode, 'playerJoined', {
                playerId: playerId,
                playerName: player.name,
                room: room.getSerializableState()
            });

            console.log(`✅ Player ${playerId} joined room ${room.roomCode}`);
            
        } catch (error) {
            console.error(`❌ Error joining room for ${playerId}:`, error.message);
            this.sendError(playerId, 'joinRoom', error.message);
        }
    }

    handleLeaveRoom(playerId) {
        try {
            const player = this.players.get(playerId);
            if (!player || !player.roomCode) return;

            const oldRoomCode = player.roomCode;
            const room = this.roomManager.leaveRoom(playerId);
            
            player.roomCode = null;
            player.lastActivity = Date.now();

            // Send confirmation to leaving player
            player.channel.emit('roomLeft', { success: true });

            // If room still exists, broadcast to remaining players
            if (room) {
                this.broadcastToRoom(room.roomCode, 'playerLeft', {
                    playerId: playerId,
                    playerName: player.name,
                    room: room.getSerializableState()
                });
            }

            console.log(`👋 Player ${playerId} left room ${oldRoomCode}`);
            
        } catch (error) {
            console.error(`❌ Error leaving room for ${playerId}:`, error.message);
            this.sendError(playerId, 'leaveRoom', error.message);
        }
    }

    handleQuickMatch(playerId, data = {}) {
        try {
            const player = this.players.get(playerId);
            if (!player) return;

            const { playerName, dogType } = data;
            
            // Try to find an existing public room
            let room = this.roomManager.findQuickMatchRoom();
            
            if (!room) {
                // Create a new public room
                room = this.roomManager.createRoom(playerId, {
                    name: 'Quick Match Game',
                    maxPlayers: 4,
                    isPublic: true
                }, dogType || 'jep');
                
                player.roomCode = room.roomCode;
                player.name = playerName || 'Host';
                player.dogType = dogType || 'jep';

                player.channel.emit('roomCreated', {
                    success: true,
                    playerId: playerId,
                    room: room.getSerializableState(),
                    isQuickMatch: true
                });
            } else {
                // Join existing room
                this.roomManager.joinRoom(room.roomCode, playerId, playerName || 'Quick Match Player', dogType || 'jep');
                
                player.roomCode = room.roomCode;
                player.name = playerName || 'Quick Match Player';
                player.dogType = dogType || 'jep';

                player.channel.emit('roomJoined', {
                    success: true,
                    playerId: playerId,
                    room: room.getSerializableState(),
                    isQuickMatch: true
                });

                // Broadcast to room
                this.broadcastToRoom(room.roomCode, 'playerJoined', {
                    playerId: playerId,
                    playerName: player.name,
                    room: room.getSerializableState()
                });
            }

            player.lastActivity = Date.now();
            console.log(`⚡ Quick match for ${playerId} -> room ${room.roomCode} with dog type: ${dogType || 'jep'}`);
            
        } catch (error) {
            console.error(`❌ Error with quick match for ${playerId}:`, error.message);
            this.sendError(playerId, 'quickMatch', error.message);
        }
    }

    handleStartGame(playerId) {
        try {
            const player = this.players.get(playerId);
            if (!player || !player.roomCode) return;

            const room = this.roomManager.startGame(player.roomCode, playerId);
            
            // Add server reference to room for broadcasting
            room.server = this;
            
            // Initialize game simulation
            room.simulation = new GameSimulation(room);
            room.simulation.start();

            // Broadcast game start to all players in room
            this.broadcastToRoom(room.roomCode, 'gameStarted', {
                room: room.getSerializableState(),
                gameState: room.simulation.createGameStateSnapshot()
            });

            console.log(`🎮 Game started in room ${room.roomCode}`);
            
        } catch (error) {
            console.error(`❌ Error starting game for ${playerId}:`, error.message);
            this.sendError(playerId, 'startGame', error.message);
        }
    }

    handleSetReady(playerId, ready) {
        try {
            const player = this.players.get(playerId);
            if (!player || !player.roomCode) return;

            const room = this.roomManager.getRoom(player.roomCode);
            if (!room) return;

            room.setPlayerReady(playerId, ready);
            player.lastActivity = Date.now();

            // Broadcast ready state change to all players in room
            this.broadcastToRoom(room.roomCode, 'playerReadyChanged', {
                playerId: playerId,
                ready: ready,
                room: room.getSerializableState()
            });

            console.log(`${ready ? '✅' : '❌'} Player ${playerId} ready state: ${ready}`);
            
        } catch (error) {
            console.error(`❌ Error setting ready state for ${playerId}:`, error.message);
        }
    }

    handlePlayerInput(playerId, inputData) {
        try {
            const player = this.players.get(playerId);
            if (!player || !player.roomCode) return;

            const room = this.roomManager.getRoom(player.roomCode);
            if (!room || !room.simulation) return;

            // Forward input to game simulation
            room.simulation.handlePlayerInput(playerId, inputData);
            player.lastActivity = Date.now();
            this.stats.messagesReceived++;
            
        } catch (error) {
            console.error(`❌ Error handling input for ${playerId}:`, error.message);
        }
    }

    handleSetDogType(playerId, data) {
        try {
            const player = this.players.get(playerId);
            if (!player || !player.roomCode) return;

            const { dogType } = data;
            if (!dogType || !['jep', 'rory', 'pip'].includes(dogType)) {
                console.warn(`Invalid dog type received from ${playerId}: ${dogType}`);
                return;
            }

            const room = this.roomManager.getRoom(player.roomCode);
            if (!room) return;

            // Update player's dog type in server data
            player.dogType = dogType;
            
            // Update room player data
            const roomPlayer = room.getPlayer(playerId);
            if (roomPlayer) {
                roomPlayer.dogType = dogType;
            }

            // Update game simulation if it exists (during gameplay)
            if (room.simulation && room.simulation.sheepdogs.has(playerId)) {
                const sheepdog = room.simulation.sheepdogs.get(playerId);
                sheepdog.dogType = dogType;
            }

            player.lastActivity = Date.now();
            console.log(`🐕 Player ${playerId} changed dog type to: ${dogType}`);
            
        } catch (error) {
            console.error(`❌ Error setting dog type for ${playerId}:`, error.message);
        }
    }

    handlePlayerDisconnect(playerId) {
        this.stats.connectionsActive--;
        
        // Clean up player from room
        this.handleLeaveRoom(playerId);
        
        // Remove player data
        this.players.delete(playerId);
    }

    broadcastToRoom(roomCode, event, data) {
        const room = this.roomManager.getRoom(roomCode);
        if (!room) return;

        let messagesSent = 0;
        for (const playerId of room.players.keys()) {
            const player = this.players.get(playerId);
            if (player && player.channel) {
                player.channel.emit(event, data);
                messagesSent++;
            }
        }
        
        this.stats.messagesSent += messagesSent;
    }

    sendError(playerId, context, message) {
        const player = this.players.get(playerId);
        if (player) {
            player.channel.emit('error', {
                context: context,
                message: message,
                timestamp: Date.now()
            });
        }
    }

    startMaintenanceLoop() {
        // Run maintenance every 5 minutes
        this.maintenanceInterval = setInterval(() => {
            this.performMaintenance();
        }, 5 * 60 * 1000);
    }

    startBroadcastLoop() {
        // Broadcast game state updates every 16ms (60 FPS)
        this.broadcastInterval = setInterval(() => {
            this.broadcastGameStates();
        }, 16);
    }

    broadcastGameStates() {
        // Broadcast game state updates for all active rooms
        for (const room of this.roomManager.rooms.values()) {
            if (room.state === 'in-game' && room.simulation) {
                const gameState = room.simulation.getLatestGameState();
                if (gameState) {
                    this.broadcastToRoom(room.roomCode, 'gameStateUpdate', gameState);
                }
                
                // Note: Game completion is now handled immediately in GameSimulation.broadcastGameCompletion()
                // No need to check for completion here to avoid race conditions
            }
        }
    }

    performMaintenance() {
        console.log('🧹 Performing server maintenance...');
        
        // Clean up stale rooms
        this.roomManager.performMaintenance();
        
        // Clean up inactive players
        const now = Date.now();
        const inactiveThreshold = 10 * 60 * 1000; // 10 minutes
        
        for (const [playerId, player] of this.players.entries()) {
            if (now - player.lastActivity > inactiveThreshold) {
                console.log(`🧹 Removing inactive player ${playerId}`);
                this.handlePlayerDisconnect(playerId);
            }
        }
        
        // Log server stats
        const stats = this.getServerStats();
        console.log(`📊 Server Stats:`, stats);
    }

    getServerStats() {
        const roomStats = this.roomManager.getStats();
        const uptime = Date.now() - this.stats.startTime;
        
        return {
            uptime: uptime,
            uptimeHours: Math.floor(uptime / (1000 * 60 * 60)),
            connectionsTotal: this.stats.connectionsTotal,
            connectionsActive: this.stats.connectionsActive,
            messagesReceived: this.stats.messagesReceived,
            messagesSent: this.stats.messagesSent,
            ...roomStats
        };
    }

    stop() {
        console.log('🛑 Stopping multiplayer server...');
        
        if (this.maintenanceInterval) {
            clearInterval(this.maintenanceInterval);
        }
        
        if (this.broadcastInterval) {
            clearInterval(this.broadcastInterval);
        }
        
        // Stop all room simulations
        for (const room of this.roomManager.rooms.values()) {
            if (room.simulation) {
                room.simulation.cleanup();
            }
        }
        
        // Disconnect all players
        for (const player of this.players.values()) {
            if (player.channel) {
                player.channel.disconnect();
            }
        }
        
        if (this.io) {
            // Geckos.io server cleanup
            try {
                if (this.io.server) {
                    this.io.server.close();
                }
            } catch (error) {
                console.log('Server cleanup completed');
            }
        }
        
        console.log('✅ Server stopped');
    }
}

// Production environment logging
console.log(`🚀 Starting server in ${process.env.NODE_ENV || 'development'} mode`);
console.log(`🌐 Server will bind to ${process.env.HOST || '0.0.0.0'}:${process.env.PORT || 9208}`);
console.log(`🔧 Environment variables:`);
console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`   HOST: ${process.env.HOST}`);
console.log(`   PORT: ${process.env.PORT}`);
console.log(`   PWD: ${process.env.PWD}`);

// Create and start server
const server = new MultiplayerServer({
    port: parseInt(process.env.PORT) || 9208,
    host: process.env.HOST || '0.0.0.0'  // Bind to all interfaces for Fly.io
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    server.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    server.stop();
    process.exit(0);
});

// Start the server
server.start().catch((error) => {
    console.error('💥 Fatal error starting server:', error);
    process.exit(1);
}); 