/**
 * Room Management System for Multiplayer Sheepdog Simulation
 * Handles room creation, player management, and state transitions
 */

export class RoomManager {
    constructor() {
        this.rooms = new Map(); // roomCode -> Room
        this.playerRooms = new Map(); // playerId -> roomCode
        this.publicRooms = new Set(); // Set of public room codes for quick match
    }

    /**
     * Generate a unique 6-digit room code (ABC123 format)
     */
    generateRoomCode() {
        const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const numbers = '0123456789';
        
        let code;
        let attempts = 0;
        const maxAttempts = 100;
        
        do {
            code = '';
            // Generate 3 letters
            for (let i = 0; i < 3; i++) {
                code += letters.charAt(Math.floor(Math.random() * letters.length));
            }
            // Generate 3 numbers
            for (let i = 0; i < 3; i++) {
                code += numbers.charAt(Math.floor(Math.random() * numbers.length));
            }
            attempts++;
        } while (this.rooms.has(code) && attempts < maxAttempts);
        
        if (attempts >= maxAttempts) {
            throw new Error('Failed to generate unique room code');
        }
        
        return code;
    }

    /**
     * Validate room code format (ABC123)
     */
    validateRoomCode(roomCode) {
        if (typeof roomCode !== 'string' || roomCode.length !== 6) {
            return false;
        }
        
        // Check format: 3 letters followed by 3 numbers
        const pattern = /^[A-Z]{3}[0-9]{3}$/;
        return pattern.test(roomCode.toUpperCase());
    }

    /**
     * Create a new room
     */
    createRoom(hostPlayerId, roomSettings = {}, hostDogType = 'jep') {
        const {
            name = 'Sheepdog Game',
            maxPlayers = 4,
            isPublic = false
        } = roomSettings;

        // Validate maxPlayers
        if (maxPlayers < 2 || maxPlayers > 4) {
            throw new Error('Room must allow 2-4 players');
        }

        // Check if player is already in a room
        if (this.playerRooms.has(hostPlayerId)) {
            throw new Error('Player is already in a room');
        }

        const roomCode = this.generateRoomCode();
        const room = new Room(roomCode, hostPlayerId, { name, maxPlayers, isPublic }, hostDogType);
        
        this.rooms.set(roomCode, room);
        this.playerRooms.set(hostPlayerId, roomCode);
        
        if (isPublic) {
            this.publicRooms.add(roomCode);
        }

        console.log(`✅ Room ${roomCode} created by ${hostPlayerId} (${isPublic ? 'public' : 'private'})`);
        return room;
    }

    /**
     * Join an existing room
     */
    joinRoom(roomCode, playerId, playerName = 'Anonymous', dogType = 'jep') {
        roomCode = roomCode.toUpperCase();
        
        if (!this.validateRoomCode(roomCode)) {
            throw new Error('Invalid room code format');
        }

        if (!this.rooms.has(roomCode)) {
            throw new Error('Room not found');
        }

        if (this.playerRooms.has(playerId)) {
            throw new Error('Player is already in a room');
        }

        const room = this.rooms.get(roomCode);
        
        if (room.state !== 'waiting') {
            throw new Error('Room is not accepting new players');
        }

        if (room.players.size >= room.maxPlayers) {
            throw new Error('Room is full');
        }

        room.addPlayer(playerId, playerName, dogType);
        this.playerRooms.set(playerId, roomCode);

        console.log(`✅ Player ${playerId} joined room ${roomCode}`);
        return room;
    }

    /**
     * Leave a room
     */
    leaveRoom(playerId) {
        if (!this.playerRooms.has(playerId)) {
            return null; // Player not in any room
        }

        const roomCode = this.playerRooms.get(playerId);
        const room = this.rooms.get(roomCode);
        
        if (!room) {
            this.playerRooms.delete(playerId);
            return null;
        }

        room.removePlayer(playerId);
        this.playerRooms.delete(playerId);

        // Handle host migration or room cleanup
        if (room.hostId === playerId) {
            if (room.players.size > 0) {
                // Migrate host to another player
                const newHostId = Array.from(room.players.keys())[0];
                room.hostId = newHostId;
                console.log(`🔄 Host migrated to ${newHostId} in room ${roomCode}`);
            } else {
                // Room is empty, clean it up
                this.cleanupRoom(roomCode);
                return null;
            }
        }

        console.log(`👋 Player ${playerId} left room ${roomCode}`);
        return room;
    }

    /**
     * Get a room for quick match (public rooms with space)
     */
    findQuickMatchRoom() {
        for (const roomCode of this.publicRooms) {
            const room = this.rooms.get(roomCode);
            if (room && room.state === 'waiting' && room.players.size < room.maxPlayers) {
                return room;
            }
        }
        return null;
    }

    /**
     * Get room by code
     */
    getRoom(roomCode) {
        return this.rooms.get(roomCode?.toUpperCase());
    }

    /**
     * Get room by player ID
     */
    getPlayerRoom(playerId) {
        const roomCode = this.playerRooms.get(playerId);
        return roomCode ? this.rooms.get(roomCode) : null;
    }

    /**
     * Start a game in a room
     */
    startGame(roomCode, hostId) {
        const room = this.getRoom(roomCode);
        
        if (!room) {
            throw new Error('Room not found');
        }

        if (room.hostId !== hostId) {
            throw new Error('Only the host can start the game');
        }

        if (room.players.size < 2) {
            throw new Error('Need at least 2 players to start');
        }

        if (room.state !== 'waiting') {
            throw new Error('Game cannot be started in current room state');
        }

        room.startGame();
        console.log(`🎮 Game started in room ${roomCode} with ${room.players.size} players`);
        return room;
    }

    /**
     * Clean up an empty room
     */
    cleanupRoom(roomCode) {
        const room = this.rooms.get(roomCode);
        if (room) {
            this.rooms.delete(roomCode);
            this.publicRooms.delete(roomCode);
            
            // Clean up any simulation resources
            if (room.simulation) {
                room.simulation.cleanup();
            }
            
            console.log(`🧹 Cleaned up empty room ${roomCode}`);
        }
    }

    /**
     * Get room statistics
     */
    getStats() {
        const totalRooms = this.rooms.size;
        const publicRooms = this.publicRooms.size;
        const totalPlayers = this.playerRooms.size;
        
        let waitingRooms = 0;
        let activeGames = 0;
        let finishedGames = 0;
        
        for (const room of this.rooms.values()) {
            switch (room.state) {
                case 'waiting': waitingRooms++; break;
                case 'in-game': activeGames++; break;
                case 'finished': finishedGames++; break;
            }
        }

        return {
            totalRooms,
            publicRooms,
            totalPlayers,
            waitingRooms,
            activeGames,
            finishedGames
        };
    }

    /**
     * Periodic cleanup of stale rooms
     */
    performMaintenance() {
        const now = Date.now();
        const staleRoomThreshold = 30 * 60 * 1000; // 30 minutes
        
        for (const [roomCode, room] of this.rooms.entries()) {
            if (now - room.lastActivity > staleRoomThreshold) {
                console.log(`🧹 Cleaning up stale room ${roomCode}`);
                this.cleanupRoom(roomCode);
            }
        }
    }
}

/**
 * Individual Room class
 */
export class Room {
    constructor(roomCode, hostId, settings = {}, hostDogType = 'jep') {
        this.roomCode = roomCode;
        this.hostId = hostId;
        this.name = settings.name || 'Sheepdog Game';
        this.maxPlayers = settings.maxPlayers || 4;
        this.isPublic = settings.isPublic || false;
        
        this.players = new Map(); // playerId -> PlayerInfo
        this.state = 'waiting'; // 'waiting', 'in-game', 'finished'
        this.createdAt = Date.now();
        this.lastActivity = Date.now();
        
        // Game simulation will be initialized when game starts
        this.simulation = null;
        
        // Add the host as the first player
        this.addPlayer(hostId, 'Host', hostDogType);
    }

    addPlayer(playerId, playerName = 'Anonymous', dogType = 'jep') {
        const playerInfo = {
            id: playerId,
            name: playerName,
            dogType: dogType, // Store the player's selected dog type
            isHost: playerId === this.hostId,
            isReady: true, // All players are ready by default for testing
            joinedAt: Date.now(),
            // Game-specific data will be added when game starts
            dogPosition: null,
            dogStamina: 100,
            inputSequence: 0
        };
        
        this.players.set(playerId, playerInfo);
        this.lastActivity = Date.now();
        
        return playerInfo;
    }

    removePlayer(playerId) {
        this.players.delete(playerId);
        this.lastActivity = Date.now();
    }

    getPlayer(playerId) {
        return this.players.get(playerId);
    }

    setPlayerReady(playerId, ready = true) {
        const player = this.players.get(playerId);
        if (player) {
            player.isReady = ready;
            this.lastActivity = Date.now();
        }
    }

    areAllPlayersReady() {
        for (const player of this.players.values()) {
            if (!player.isReady) {
                return false;
            }
        }
        return this.players.size >= 2; // Need at least 2 players
    }

    startGame() {
        if (this.state !== 'waiting') {
            throw new Error('Game cannot be started in current state');
        }

        if (!this.areAllPlayersReady()) {
            throw new Error('Not all players are ready');
        }

        this.state = 'in-game';
        this.lastActivity = Date.now();
        
        // Game simulation will be initialized by the server
        this.simulation = null;
        
        return true;
    }

    finishGame() {
        this.state = 'finished';
        this.lastActivity = Date.now();
        
        if (this.simulation) {
            this.simulation.stop();
        }
    }

    getSerializableState() {
        return {
            roomCode: this.roomCode,
            name: this.name,
            hostId: this.hostId,
            maxPlayers: this.maxPlayers,
            isPublic: this.isPublic,
            state: this.state,
            playerCount: this.players.size,
            players: Array.from(this.players.values()).map(p => ({
                id: p.id,
                name: p.name,
                dogType: p.dogType, // Include dog type in serialized state
                isHost: p.isHost,
                isReady: p.isReady
            })),
            createdAt: this.createdAt,
            lastActivity: this.lastActivity
        };
    }
} 