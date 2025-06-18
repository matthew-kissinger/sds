import { Vector2D } from './Vector2D.js';
import { OptimizedSheepSystem } from './OptimizedSheep.js';

/**
 * GameState - Handles game configuration, boundaries, and state management
 */
export class GameState {
    constructor() {
        // Field boundaries
        this.bounds = {
            minX: -100,
            maxX: 100,
            minZ: -100,
            maxZ: 100
        };
        
        // Game mode ('solo', 'multiplayer', 'competitive')
        this.gameMode = 'solo';
        
        // Gate and pasture configuration (cooperative mode)
        this.gate = {
            position: new Vector2D(0, 100), // At the fence border
            width: 8,
            height: 4,
            // Gate passage zone (invisible box for detection)
            passageZone: {
                minX: -4,
                maxX: 4,
                minZ: 98,
                maxZ: 102
            }
        };
        
        // Sleeping pasture area (beyond the gate)
        this.pasture = {
            centerZ: 115, // Beyond the gate
            minX: -30,
            maxX: 30,
            minZ: 102,
            maxZ: 130
        };
        
        // Competitive mode support
        this.competitiveGates = []; // Array of gate configurations for competitive mode
        this.playerScores = {}; // playerId -> sheep count for competitive mode
        
        // Simulation parameters
        this.params = {
            speed: 0.1,  // Sheep movement speed
            cohesion: 1.0,
            separationDistance: 2.0
        };
        
        // Game state
        this.sheep = [];
        this.sheepdog = null;
        this.sheepRetired = 0;
        this.gameCompleted = false;
        this.totalSheep = 200;
        this.gameActive = false; // New: tracks if game is actively being played
        this.isPaused = false; // New: tracks if game is paused
        this.audioManager = null;
        
        // Always use optimized sheep system
        this.optimizedSheepSystem = null;
    }
    
    createSheepFlock(scene) {
        // Create optimized sheep system
        this.optimizedSheepSystem = new OptimizedSheepSystem(scene, this.totalSheep);
        this.sheep = this.optimizedSheepSystem.getSheep();
        
        // Set bounds for each sheep instance
        this.sheep.forEach(sheep => sheep.setBounds(this.bounds));
        
        // Set audio manager if available
        if (this.audioManager) {
            this.optimizedSheepSystem.setAudioManager(this.audioManager);
        }
        
        return null; // No individual meshes to return
    }
    
    setPaused(paused) {
        this.isPaused = paused;
    }
    
    isPausedState() {
        return this.isPaused;
    }
    
    updateSheepBehaviors(deltaTime = 0.016) {
        // Don't update sheep behaviors if paused
        if (this.isPaused) {
            return this.sheepRetired;
        }
        
        // Always update sheep behaviors for visual effect
        // In multiplayer mode, server handles state transitions, client handles visual behavior
        this.optimizedSheepSystem.update(
            deltaTime,
            this.gameActive ? this.sheepdog : null, // Only pass sheepdog if game is active
            this.gameActive ? this.getGateForSheepBehavior() : null,     // Use appropriate gate for current mode
            this.gameActive ? this.getPastureForSheepBehavior() : null,  // Use appropriate pasture for current mode
            this.bounds,  // Always pass bounds so sheep stay in field
            this.params,  // Always pass params so sheep can flock
            true, // enableIndividualBleating
            this.gameMode === 'multiplayer' // isMultiplayer flag
        );
        
        // Only count retired sheep if game is active
        if (this.gameActive) {
            // In multiplayer mode, sheep count is managed by server
            if (this.gameMode !== 'multiplayer') {
                this.sheepRetired = 0;
                
                // Count retired sheep
                for (let sheep of this.sheep) {
                    // Check if sheep has passed gate
                    if (!sheep.hasPassedGate && !sheep.isRetiring) {
                        if (sheep.checkGatePassageAndRetire(this.getGateForSheepBehavior().passageZone, this.getPastureForSheepBehavior())) {
                            // Sheep just passed through the gate
                            this.sheepRetired++;
                            
                            // Play rewarding chime sound
                            if (this.audioManager) {
                                this.audioManager.playRewardingChime();
                            }
                        }
                    }
                    
                    // Count all sheep that have passed or are retiring
                    if (sheep.hasPassedGate || sheep.isRetiring) {
                        this.sheepRetired++;
                    }
                }
            }
        }
        
        return this.sheepRetired;
    }
    
    checkCompletion() {
        // Only check completion if game is active and not paused
        if (!this.gameActive || this.isPaused) return false;
        
        if (this.sheepRetired === this.sheep.length && !this.gameCompleted) {
            this.gameCompleted = true;
            
            // Play completion sound and win music
            if (this.audioManager) {
                this.audioManager.playRewardingChime();
                
                // Stop gameplay music and start win music
                setTimeout(() => {
                    this.audioManager.stopAllMusic();
                    this.audioManager.playWinMusic();
                }, 500); // Small delay for the chime to play
            }
            
            return true;
        }
        return false;
    }
    
    updateUI() {
        // Only update UI if game is active and not paused
        if (!this.gameActive || this.isPaused) return;
        
        if (this.gameMode === 'competitive') {
            this.updateCompetitiveUI();
        } else {
            this.updateCooperativeUI();
        }
    }
    
    updateCooperativeUI() {
        // Update desktop sheep count
        const sheepCountElement = document.getElementById('sheep-count');
        if (sheepCountElement) {
            sheepCountElement.textContent = this.sheepRetired;
        }
        
        // Update mobile sheep count
        const mobileSheepCountElement = document.getElementById('mobile-sheep-count');
        if (mobileSheepCountElement) {
            mobileSheepCountElement.textContent = `Sheep: ${this.sheepRetired} / ${this.totalSheep}`;
        }
    }
    
    updateCompetitiveUI() {
        // In competitive mode, show "your sheep" count vs total
        const myPlayerId = this.getCurrentPlayerId();
        const myScore = this.getPlayerScore(myPlayerId) || 0;
        const totalRetired = Object.values(this.playerScores).reduce((sum, score) => sum + score, 0);
        
        // Update desktop sheep count to show personal score
        const sheepCountElement = document.getElementById('sheep-count');
        if (sheepCountElement) {
            sheepCountElement.textContent = `${myScore} (yours)`;
        }
        
        // Update mobile sheep count with competitive info
        const mobileSheepCountElement = document.getElementById('mobile-sheep-count');
        if (mobileSheepCountElement) {
            const playerCount = Object.keys(this.playerScores).length;
            
            if (playerCount === 2) {
                // 2-player mode: show race progress
                const winThreshold = Math.ceil(this.totalSheep / 2); // 101 for 200 sheep
                mobileSheepCountElement.textContent = `Your sheep: ${myScore}/${winThreshold}`;
            } else {
                // 3-4 player mode: show total progress
                mobileSheepCountElement.textContent = `Yours: ${myScore} | Total: ${totalRetired}/${this.totalSheep}`;
            }
        }
    }
    
    // Helper method to get current player ID (used by multiplayer UI)
    getCurrentPlayerId() {
        // This should be set by the multiplayer system
        return this.currentPlayerId || null;
    }
    
    setCurrentPlayerId(playerId) {
        this.currentPlayerId = playerId;
    }
    
    showCompletionMessage(finalTime, isNewRecord, competitiveData = null) {
        if (this.gameMode === 'competitive' && competitiveData) {
            this.showCompetitiveCompletionMessage(competitiveData, finalTime);
        } else {
            this.showCooperativeCompletionMessage(finalTime, isNewRecord);
        }
    }
    
    showCooperativeCompletionMessage(finalTime, isNewRecord) {
        let message = 'All sheep have been guided to the pasture!';
        
        if (finalTime !== null) {
            const timeStr = this.formatTime(finalTime);
            message += `\nTime: ${timeStr}`;
            
            if (isNewRecord) {
                message += '\n🎉 NEW BEST TIME! 🎉';
            }
        }
        
        const completionElement = document.getElementById('completion-message');
        if (completionElement) {
            completionElement.innerHTML = 
                message.replace(/\n/g, '<br>') + '<br><button id="restart-button">Play Again</button>';
            completionElement.style.display = 'block';
            
            // Add event listener for restart button
            const restartButton = document.getElementById('restart-button');
            if (restartButton) {
                restartButton.addEventListener('click', () => {
                    // Trigger a full restart to start screen
                    location.reload();
                });
            }
        }
    }
    
    showCompetitiveCompletionMessage(competitiveData, finalTime = null) {
        const { winner, winType, finalScores, isComplete } = competitiveData;
        
        if (!isComplete) {
            console.warn('showCompetitiveCompletionMessage called but game not complete');
            return;
        }
        
        const myPlayerId = this.getCurrentPlayerId();
        const isWinner = winner === myPlayerId;
        
        // Build completion message
        let message = '';
        let title = '';
        
        if (isWinner) {
            title = '🏆 VICTORY! 🏆';
            message = 'You won the competition!';
        } else {
            title = '🥈 Game Complete';
            message = `Player ${winner} won the competition!`;
        }
        
        // Add win condition explanation
        if (winType === 'race') {
            const winThreshold = Math.ceil(this.totalSheep / 2);
            message += `\nFirst to ${winThreshold} sheep wins!`;
        } else {
            message += '\nHighest score when all sheep collected!';
        }
        
        // Add time information if available
        if (finalTime !== null) {
            const timeStr = this.formatTime(finalTime);
            message += `\nTime: ${timeStr}`;
        }
        
        // Build final scores display
        const scoresArray = Object.entries(finalScores).sort(([,a], [,b]) => b - a);
        message += '\n\nFinal Scores:';
        scoresArray.forEach(([playerId, score], index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '  ';
            const isYou = playerId === myPlayerId;
            message += `\n${medal} Player ${playerId}${isYou ? ' (You)' : ''}: ${score} sheep`;
        });
        
        const completionElement = document.getElementById('completion-message');
        if (completionElement) {
            completionElement.innerHTML = 
                `<h2 class="competitive-title ${isWinner ? 'winner' : 'participant'}">${title}</h2>` +
                message.replace(/\n/g, '<br>') + 
                '<br><br><button id="competitive-restart-button">Play Again</button>';
            completionElement.style.display = 'block';
            
            // Add competitive completion styling
            completionElement.classList.add('competitive-completion');
            if (isWinner) {
                completionElement.classList.add('winner');
            }
            
            // Add event listener for restart button
            const restartButton = document.getElementById('competitive-restart-button');
            if (restartButton) {
                restartButton.addEventListener('click', () => {
                    // Trigger a full restart to start screen
                    location.reload();
                });
            }
        }
    }
    
    formatTime(timeInSeconds) {
        const minutes = Math.floor(timeInSeconds / 60);
        const seconds = Math.floor(timeInSeconds % 60);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    // Getters
    getBounds() {
        return this.bounds;
    }
    
    getGate() {
        // For competitive mode, return all gates; for cooperative, return single gate
        if (this.gameMode === 'competitive' && this.competitiveGates.length > 0) {
            return this.competitiveGates;
        }
        return this.gate;
    }
    
    getPasture() {
        // For competitive mode, return all pastures; for cooperative, return single pasture
        if (this.gameMode === 'competitive' && this.competitiveGates.length > 0) {
            return this.competitiveGates.map(gate => gate.pasture);
        }
        return this.pasture;
    }
    
    // New getters for competitive mode
    getCompetitiveGates() {
        return this.competitiveGates;
    }
    
    getPlayerScores() {
        return this.playerScores;
    }
    
    // Support both single gate (cooperative) and multiple gates (competitive)
    getGateForSheepBehavior() {
        // For sheep behavior, we need to determine the closest gate
        if (this.gameMode === 'competitive' && this.competitiveGates.length > 0) {
            // Return all competitive gates - sheep will use closest gate logic
            return this.competitiveGates;
        }
        return this.gate;
    }
    
    getPastureForSheepBehavior() {
        // For sheep behavior, we need to determine appropriate pasture
        if (this.gameMode === 'competitive' && this.competitiveGates.length > 0) {
            // Return all competitive pastures - sheep will use appropriate pasture based on gate
            return this.competitiveGates.map(gate => gate.pasture);
        }
        return this.pasture;
    }
    
    getParams() {
        return this.params;
    }
    
    getSheep() {
        return this.sheep;
    }
    
    getSheepdog() {
        return this.sheepdog;
    }
    
    setSheepdog(sheepdog) {
        this.sheepdog = sheepdog;
    }
    
    getSheepRetired() {
        return this.sheepRetired;
    }
    
    getTotalSheep() {
        return this.totalSheep;
    }
    
    isGameCompleted() {
        return this.gameCompleted;
    }
    
    startGame(mode = 'solo', competitiveData = null) {
        this.gameMode = mode; // Store the game mode
        this.gameActive = true;
        this.gameCompleted = false;
        this.sheepRetired = 0;
        this.isPaused = false; // Ensure game starts unpaused
        
        // Initialize competitive mode data if provided
        if (mode === 'competitive' && competitiveData) {
            this.initializeCompetitiveMode(competitiveData);
        }
        
        // Reset all sheep to their starting positions and states
        if (this.optimizedSheepSystem) {
            this.optimizedSheepSystem.resetAllSheep();
        }
        
        if (mode === 'multiplayer') {
            console.log('Game started in multiplayer mode with 200 sheep');
        } else if (mode === 'competitive') {
            console.log(`Game started in competitive mode with ${Object.keys(this.playerScores).length} players`);
        }
    }
    
    // Initialize competitive mode with gates and player scores
    initializeCompetitiveMode(competitiveData) {
        const { competitiveGates, playerScores } = competitiveData;
        
        if (!competitiveGates || !Array.isArray(competitiveGates)) {
            throw new Error('Competitive mode requires valid gates array');
        }
        
        if (!playerScores || typeof playerScores !== 'object') {
            throw new Error('Competitive mode requires valid player scores object');
        }
        
        this.competitiveGates = competitiveGates;
        this.playerScores = { ...playerScores }; // Create a copy
        
        console.log(`Competitive mode initialized with ${competitiveGates.length} gates and ${Object.keys(playerScores).length} players`);
    }
    
    // Update player score in competitive mode
    updatePlayerScore(playerId, increment = 1) {
        if (this.gameMode !== 'competitive') {
            console.warn('updatePlayerScore called in non-competitive mode');
            return;
        }
        
        if (!this.playerScores.hasOwnProperty(playerId)) {
            console.warn(`Player ${playerId} not found in player scores`);
            return;
        }
        
        this.playerScores[playerId] += increment;
        
        // Update total retired count
        this.sheepRetired = Object.values(this.playerScores).reduce((sum, score) => sum + score, 0);
    }
    
    // Get player's score in competitive mode
    getPlayerScore(playerId) {
        if (this.gameMode !== 'competitive') {
            return 0;
        }
        
        return this.playerScores[playerId] || 0;
    }
    
    // Check if competitive mode win conditions are met
    checkCompetitiveCompletion() {
        if (this.gameMode !== 'competitive') {
            return { isComplete: false };
        }
        
        const playerCount = Object.keys(this.playerScores).length;
        const scores = Object.values(this.playerScores);
        const maxScore = Math.max(...scores);
        const totalRetired = scores.reduce((sum, score) => sum + score, 0);
        
        // 2 players: First to 101 sheep wins (or 50.5% of total)
        if (playerCount === 2) {
            const winThreshold = Math.ceil(this.totalSheep / 2); // 101 for 200 sheep
            if (maxScore >= winThreshold) {
                const winner = Object.keys(this.playerScores).find(playerId => this.playerScores[playerId] === maxScore);
                return {
                    isComplete: true,
                    winner,
                    winType: 'race',
                    finalScores: { ...this.playerScores }
                };
            }
        }
        
        // 3-4 players: Highest score when all sheep collected
        if (playerCount >= 3) {
            if (totalRetired >= this.totalSheep) {
                const winner = Object.keys(this.playerScores).find(playerId => this.playerScores[playerId] === maxScore);
                return {
                    isComplete: true,
                    winner,
                    winType: 'highest_score',
                    finalScores: { ...this.playerScores }
                };
            }
        }
        
        return {
            isComplete: false,
            winner: null,
            winType: null
        };
    }
    
    isGameActive() {
        return this.gameActive;
    }
    
    setAudioManager(audioManager) {
        this.audioManager = audioManager;
        
        // If sheep system already exists, pass audio manager to it
        if (this.optimizedSheepSystem) {
            this.optimizedSheepSystem.setAudioManager(audioManager);
        }
    }
    
    setGameMode(mode) {
        this.gameMode = mode;
        console.log(`GameState mode set to: ${mode}`);
    }
    
    reset() {
        this.sheep = [];
        this.sheepdog = null;
        this.sheepRetired = 0;
        this.gameCompleted = false;
        this.gameActive = false;
        this.isPaused = false;
        this.optimizedSheepSystem = null;
        
        // Reset competitive mode data
        this.gameMode = 'solo';
        this.competitiveGates = [];
        this.playerScores = {};
        this.currentPlayerId = null;
    }
} 