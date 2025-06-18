/**
 * MultiplayerUI - Manages multiplayer-specific UI elements
 * - Player list display during gameplay
 * - Connection status indicator
 * - Ping/latency display
 * - Multiplayer-specific notifications
 * - Competitive mode scoreboard
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
        
        // Competitive mode state
        this.gameMode = 'cooperative'; // 'cooperative' or 'competitive'
        this.playerScores = {}; // playerId -> sheep count
        this.currentLeader = null;
        this.winThreshold = null; // For 2-player competitive mode
        this.totalSheep = 200;
        
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
    
    // Game Mode Management
    setGameMode(gameMode, playerCount = 0) {
        this.gameMode = gameMode;
        
        if (gameMode === 'competitive') {
            // Set win threshold for 2-player competitive mode
            this.winThreshold = playerCount === 2 ? Math.ceil(this.totalSheep / 2) : null; // 101 for 200 sheep
            
            // Update HUD title for competitive mode
            const titleElement = document.getElementById('multiplayer-title');
            if (titleElement) {
                if (playerCount === 2) {
                    titleElement.textContent = '🏆 Competitive Race (First to 101)';
                } else {
                    titleElement.textContent = '🏆 Competitive Mode (Highest Score)';
                }
            }
        } else {
            this.winThreshold = null;
            const titleElement = document.getElementById('multiplayer-title');
            if (titleElement) {
                titleElement.textContent = 'Players Online';
            }
        }
        
        this.renderPlayerList();
    }
    
    // Competitive Mode Scoreboard
    updatePlayerScores(playerScores) {
        if (this.gameMode !== 'competitive') {
            return;
        }
        
        this.playerScores = { ...playerScores };
        
        // Determine current leader
        this.currentLeader = null;
        let maxScore = -1;
        for (const [playerId, score] of Object.entries(playerScores)) {
            if (score > maxScore) {
                maxScore = score;
                this.currentLeader = playerId;
            }
        }
        
        this.renderCompetitiveScoreboard();
    }
    
    updateWinProgress(winCondition) {
        if (this.gameMode !== 'competitive' || !winCondition) {
            return;
        }
        
        // Update win threshold for progress bars
        if (winCondition.type === 'race' && winCondition.threshold) {
            this.winThreshold = winCondition.threshold;
        }
        
        // Store win condition for UI updates
        this.winCondition = winCondition;
        
        // Update HUD title to show progress
        const titleElement = document.getElementById('multiplayer-title');
        if (titleElement) {
            if (winCondition.type === 'race') {
                const progressPercent = Math.round(winCondition.progress * 100);
                titleElement.textContent = `🏆 Competitive Race (${progressPercent}% to win)`;
            } else if (winCondition.type === 'highest_score') {
                titleElement.textContent = `🏆 Competitive Mode (${winCondition.totalCollected}/${winCondition.totalSheep})`;
            }
        }
        
        // Re-render scoreboard to show updated progress
        this.renderCompetitiveScoreboard();
    }
    
    renderCompetitiveScoreboard() {
        if (!this.multiplayerPlayers || this.gameMode !== 'competitive') {
            return;
        }
        
        this.multiplayerPlayers.innerHTML = '';
        
        if (this.currentPlayers.length === 0) {
            const noPlayersDiv = document.createElement('div');
            noPlayersDiv.className = 'multiplayer-player';
            noPlayersDiv.innerHTML = '<span class="player-name">No players</span>';
            this.multiplayerPlayers.appendChild(noPlayersDiv);
            return;
        }
        
        // Sort players by score (highest first)
        const sortedPlayers = [...this.currentPlayers].sort((a, b) => {
            const scoreA = this.playerScores[a.id] || 0;
            const scoreB = this.playerScores[b.id] || 0;
            return scoreB - scoreA;
        });
        
        // Calculate total sheep collected for progress tracking
        const totalCollected = Object.values(this.playerScores).reduce((sum, score) => sum + score, 0);
        
        sortedPlayers.forEach((player, index) => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'multiplayer-player competitive-player';
            
            const score = this.playerScores[player.id] || 0;
            const isLeader = player.id === this.currentLeader && score > 0;
            const isYou = player.id === this.playerId;
            
            // Player name with ranking
            const playerName = document.createElement('span');
            playerName.className = 'player-name';
            let nameText = `${index + 1}. ${player.name || player.id || 'Unknown'}`;
            if (isYou) nameText += ' (You)';
            playerName.textContent = nameText;
            
            // Score display
            const scoreDisplay = document.createElement('span');
            scoreDisplay.className = 'player-score';
            scoreDisplay.textContent = `${score}`;
            
            // Progress indicator for 2-player mode
            if (this.winThreshold) {
                const progressBar = document.createElement('div');
                progressBar.className = 'score-progress';
                
                const progressFill = document.createElement('div');
                progressFill.className = 'score-progress-fill';
                progressFill.style.width = `${Math.min((score / this.winThreshold) * 100, 100)}%`;
                
                if (isLeader) {
                    progressFill.classList.add('leader');
                }
                if (isYou) {
                    progressFill.classList.add('you');
                }
                
                progressBar.appendChild(progressFill);
                
                playerDiv.appendChild(playerName);
                playerDiv.appendChild(progressBar);
                playerDiv.appendChild(scoreDisplay);
            } else {
                // 3-4 player mode - just show score
                playerDiv.appendChild(playerName);
                playerDiv.appendChild(scoreDisplay);
            }
            
            // Add special styling for leader and current player
            if (isLeader) {
                playerDiv.classList.add('leader');
                playerName.textContent = `👑 ${nameText}`;
            }
            if (isYou) {
                playerDiv.classList.add('you');
            }
            
            this.multiplayerPlayers.appendChild(playerDiv);
        });
        
        // Add progress summary for 3-4 player mode
        if (!this.winThreshold && this.currentPlayers.length >= 3) {
            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'score-summary';
            summaryDiv.innerHTML = `<span>Total: ${totalCollected}/${this.totalSheep}</span>`;
            this.multiplayerPlayers.appendChild(summaryDiv);
        }
    }
    
    // Player Management
    updatePlayers(players, currentPlayerId = null) {
        this.currentPlayers = players || [];
        this.playerId = currentPlayerId;
        
        if (this.gameMode === 'competitive') {
            this.renderCompetitiveScoreboard();
        } else {
            this.renderPlayerList();
        }
    }
    
    renderPlayerList() {
        if (!this.multiplayerPlayers) return;
        
        // Skip rendering if in competitive mode and we have scores
        if (this.gameMode === 'competitive' && Object.keys(this.playerScores).length > 0) {
            this.renderCompetitiveScoreboard();
            return;
        }
        
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
    
    // Win/Loss State Display
    showCompetitiveCompletion(completionData) {
        if (this.gameMode !== 'competitive') {
            return;
        }
        
        const { winner, winType, finalScores } = completionData;
        const isYouWinner = winner === this.playerId;
        
        // Create completion overlay
        let completionOverlay = document.getElementById('competitive-completion-overlay');
        if (!completionOverlay) {
            completionOverlay = document.createElement('div');
            completionOverlay.id = 'competitive-completion-overlay';
            completionOverlay.className = 'competitive-completion';
            document.body.appendChild(completionOverlay);
        }
        
        let title, subtitle, message;
        
        if (isYouWinner) {
            title = '🏆 VICTORY! 🏆';
            subtitle = 'You won the competition!';
        } else {
            title = '🥈 Game Complete';
            const winnerName = this.currentPlayers.find(p => p.id === winner)?.name || winner;
            subtitle = `${winnerName} won the competition!`;
        }
        
        if (winType === 'race') {
            message = `First to ${this.winThreshold} sheep wins!`;
        } else {
            message = 'Highest score when all sheep collected!';
        }
        
        // Build final scores display
        const scoresDisplay = Object.entries(finalScores)
            .sort(([,a], [,b]) => b - a)
            .map(([playerId, score], index) => {
                const player = this.currentPlayers.find(p => p.id === playerId);
                const playerName = player?.name || playerId;
                const isYou = playerId === this.playerId;
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '';
                return `${medal} ${playerName}${isYou ? ' (You)' : ''}: ${score} sheep`;
            })
            .join('<br>');
        
        completionOverlay.innerHTML = `
            <div class="completion-content">
                <h1 class="completion-title ${isYouWinner ? 'winner' : 'participant'}">${title}</h1>
                <h2 class="completion-subtitle">${subtitle}</h2>
                <p class="completion-message">${message}</p>
                <div class="final-scores">
                    <h3>Final Scores:</h3>
                    <div class="scores-list">${scoresDisplay}</div>
                </div>
                <button id="competitive-restart-button" class="restart-button">Play Again</button>
            </div>
        `;
        
        completionOverlay.style.display = 'flex';
        
        // Add restart functionality
        const restartButton = document.getElementById('competitive-restart-button');
        if (restartButton) {
            restartButton.addEventListener('click', () => {
                location.reload();
            });
        }
    }
} 