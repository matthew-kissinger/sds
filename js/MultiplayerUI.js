/**
 * MultiplayerUI - Manages multiplayer-specific UI elements
 * - Player list display during gameplay
 * - Connection status indicator
 * - Ping/latency display
 * - Multiplayer-specific notifications
 */
export class MultiplayerUI {
    constructor() {
        // UI Elements
        this.multiplayerHUD = document.getElementById('multiplayer-hud');
        this.multiplayerPlayers = document.getElementById('multiplayer-players');
        this.connectionIcon = document.getElementById('connection-icon');
        this.pingDisplay = document.getElementById('ping-display');
        
        // State
        this.currentPlayers = [];
        this.connectionState = 'disconnected';
        this.currentPing = null;
        this.playerId = null;
        
        // Ping measurement
        this.lastPingTime = 0;
        this.pingHistory = [];
        this.maxPingHistory = 10;
    }
    
    // Main UI Control
    show() {
        if (this.multiplayerHUD) {
            this.multiplayerHUD.style.display = 'block';
        }
    }
    
    hide() {
        if (this.multiplayerHUD) {
            this.multiplayerHUD.style.display = 'none';
        }
    }
    
    // Player Management
    updatePlayers(players, currentPlayerId = null) {
        this.currentPlayers = players || [];
        this.playerId = currentPlayerId;
        this.renderPlayerList();
    }
    
    renderPlayerList() {
        if (!this.multiplayerPlayers) return;
        
        this.multiplayerPlayers.innerHTML = '';
        
        if (this.currentPlayers.length === 0) {
            const noPlayersDiv = document.createElement('div');
            noPlayersDiv.className = 'multiplayer-player';
            noPlayersDiv.innerHTML = '<span class="player-name">No players</span>';
            this.multiplayerPlayers.appendChild(noPlayersDiv);
            return;
        }
        
        this.currentPlayers.forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'multiplayer-player';
            
            const playerName = document.createElement('span');
            playerName.className = 'player-name';
            playerName.textContent = player.name || player.id || 'Unknown';
            
            const playerStatus = document.createElement('span');
            playerStatus.className = 'player-status';
            
            // Determine status
            if (player.id === this.playerId) {
                playerStatus.textContent = 'You';
                playerStatus.classList.add('you');
            } else if (player.isHost) {
                playerStatus.textContent = 'Host';
                playerStatus.classList.add('host');
            } else {
                playerStatus.textContent = 'Player';
            }
            
            playerDiv.appendChild(playerName);
            playerDiv.appendChild(playerStatus);
            this.multiplayerPlayers.appendChild(playerDiv);
        });
    }
    
    // Connection Status
    updateConnectionStatus(state) {
        this.connectionState = state;
        this.updateConnectionIndicator();
    }
    
    updateConnectionIndicator() {
        if (!this.connectionIcon) return;
        
        // Remove all state classes
        this.connectionIcon.classList.remove('connected', 'disconnected', 'reconnecting');
        
        switch (this.connectionState) {
            case 'connected':
                this.connectionIcon.textContent = '🔗';
                this.connectionIcon.classList.add('connected');
                break;
            case 'disconnected':
                this.connectionIcon.textContent = '❌';
                this.connectionIcon.classList.add('disconnected');
                break;
            case 'connecting':
            case 'reconnecting':
                this.connectionIcon.textContent = '⏳';
                this.connectionIcon.classList.add('reconnecting');
                break;
            default:
                this.connectionIcon.textContent = '❓';
                this.connectionIcon.classList.add('disconnected');
        }
    }
    
    // Ping Management
    updatePing(pingMs) {
        if (typeof pingMs === 'number' && !isNaN(pingMs)) {
            this.currentPing = pingMs;
            
            // Add to history for averaging
            this.pingHistory.push(pingMs);
            if (this.pingHistory.length > this.maxPingHistory) {
                this.pingHistory.shift();
            }
            
            this.updatePingDisplay();
        }
    }
    
    updatePingDisplay() {
        if (!this.pingDisplay) return;
        
        if (this.currentPing === null || this.connectionState !== 'connected') {
            this.pingDisplay.textContent = 'Ping: --ms';
            return;
        }
        
        // Calculate average ping from history
        const avgPing = this.pingHistory.reduce((sum, ping) => sum + ping, 0) / this.pingHistory.length;
        const roundedPing = Math.round(avgPing);
        
        // Color code based on ping quality
        let pingClass = '';
        if (roundedPing < 50) {
            pingClass = 'ping-good';
        } else if (roundedPing < 100) {
            pingClass = 'ping-ok';
        } else {
            pingClass = 'ping-poor';
        }
        
        this.pingDisplay.textContent = `Ping: ${roundedPing}ms`;
        this.pingDisplay.className = pingClass;
    }
    
    // Ping measurement helpers
    startPingMeasurement() {
        this.lastPingTime = performance.now();
    }
    
    completePingMeasurement() {
        if (this.lastPingTime > 0) {
            const pingTime = performance.now() - this.lastPingTime;
            this.updatePing(pingTime);
            this.lastPingTime = 0;
        }
    }
    
    // Utility methods
    addPlayer(player) {
        const existingIndex = this.currentPlayers.findIndex(p => p.id === player.id);
        if (existingIndex >= 0) {
            // Update existing player
            this.currentPlayers[existingIndex] = { ...this.currentPlayers[existingIndex], ...player };
        } else {
            // Add new player
            this.currentPlayers.push(player);
        }
        this.renderPlayerList();
    }
    
    removePlayer(playerId) {
        this.currentPlayers = this.currentPlayers.filter(p => p.id !== playerId);
        this.renderPlayerList();
    }
    
    updatePlayer(playerId, updates) {
        const playerIndex = this.currentPlayers.findIndex(p => p.id === playerId);
        if (playerIndex >= 0) {
            this.currentPlayers[playerIndex] = { ...this.currentPlayers[playerIndex], ...updates };
            this.renderPlayerList();
        }
    }
    
    // Game state updates
    updatePlayerGameState(playerId, gameState) {
        // Could be used to show player-specific game info (score, position, etc.)
        // For now, just update basic player info
        this.updatePlayer(playerId, gameState);
    }
    
    // Reset/cleanup
    reset() {
        this.currentPlayers = [];
        this.connectionState = 'disconnected';
        this.currentPing = null;
        this.playerId = null;
        this.pingHistory = [];
        this.lastPingTime = 0;
        
        this.renderPlayerList();
        this.updateConnectionIndicator();
        this.updatePingDisplay();
    }
    
    // Get current state
    getPlayers() {
        return [...this.currentPlayers];
    }
    
    getConnectionState() {
        return this.connectionState;
    }
    
    getCurrentPing() {
        return this.currentPing;
    }
} 