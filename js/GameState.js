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
            maxZ: 125  // Reduced from 130 to keep sheep away from back fence
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
        this.totalSheep = 200; // Default to classic mode
        this.gameActive = false; // New: tracks if game is actively being played
        this.isPaused = false; // New: tracks if game is paused
        this.audioManager = null;
        this.singlePlayerMode = 'classic'; // Track single player mode: 'classic' or 'extreme'
        
        // Always use optimized sheep system
        this.optimizedSheepSystem = null;
    }
    
    createSheepFlock(scene) {
        // Create optimized sheep system with correct sheep count
        console.log(`Creating sheep flock with ${this.totalSheep} sheep`);
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
    
    // Helper method to recreate sheep flock when count changes
    recreateSheepFlock(scene) {
        // Remove old sheep system from scene if it exists
        if (this.optimizedSheepSystem && this.optimizedSheepSystem.instancedMesh) {
            scene.remove(this.optimizedSheepSystem.instancedMesh);
        }
        
        // Create new sheep system with updated count
        this.createSheepFlock(scene);
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
        
        // Check if sheep system is initialized
        if (!this.optimizedSheepSystem) {
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
        // Universal completion check for all modes
        if (this.sheepRetired >= this.sheep.length && !this.gameCompleted) {
            this.gameCompleted = true;
            console.log('🎉 GAME COMPLETED! Triggering completion flow...');
            return true;
        }
        return false;
    }
    
    updateUI() {
        // Only update UI if game is active and not paused
        if (!this.gameActive || this.isPaused) return;
        
        if (this.gameMode === 'competitive') {
            this.updateCompetitiveUI();
        } else if (this.gameMode === 'timed') {
            this.updateTimedUI();
        } else {
            this.updateCooperativeUI();
        }
    }
    
    updateCooperativeUI() {
        // UI updates now handled by React components
        // This method preserved for backward compatibility
        return;
    }
    
    updateCompetitiveUI() {
        // UI updates now handled by React components
        // Game state data is still tracked for React to access
        const myPlayerId = this.getCurrentPlayerId();
        const myScore = this.getPlayerScore(myPlayerId) || 0;
        const totalRetired = Object.values(this.playerScores).reduce((sum, score) => sum + score, 0);
        
        // Data is available for React components to access via game state
        return;
    }
    
    updateTimedUI() {
        // UI updates now handled by React components
        // Game state data is still tracked for React to access
        const myPlayerId = this.getCurrentPlayerId();
        const myScore = this.getPlayerScore(myPlayerId) || 0;
        
        // Data is available for React components to access via game state
        return;
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
        console.log('showCompletionMessage called with:', {
            gameMode: this.gameMode,
            hasCompetitiveData: !!competitiveData,
            competitiveData: competitiveData
        });
        
        // Use server data to determine completion type, fallback to client gameMode
        if (competitiveData && (competitiveData.isComplete || competitiveData.winner)) {
            this.showCompetitiveCompletionMessage(competitiveData, finalTime);
        } else {
            this.showCooperativeCompletionMessage(finalTime, isNewRecord);
        }
    }
    
    showCooperativeCompletionMessage(finalTime, isNewRecord) {
        // Completion messages now handled by React components and main.js showCompletionOverlay
        // This method preserved for backward compatibility
        console.log('📢 showCooperativeCompletionMessage called - delegating to React UI:', {
            finalTime: finalTime,
            isNewRecord: isNewRecord
        });
        
        // Submit score to leaderboard
        this.submitScoreToLeaderboard(finalTime);
        
        // Data is tracked here for React components to access if needed
        return;
    }
    
    showCompetitiveCompletionMessage(competitiveData, finalTime = null) {
        // Completion messages now handled by React components and main.js showCompletionOverlay
        // This method preserved for backward compatibility
        console.log('📢 showCompetitiveCompletionMessage called - delegating to React UI:', {
            competitiveData: competitiveData,
            finalTime: finalTime
        });
        
        // Best score tracking logic is preserved for data consistency
        const { winner, winType, finalScores, isComplete } = competitiveData;
        
        if (!isComplete) {
            console.warn('showCompetitiveCompletionMessage called but game not complete');
            return;
        }
        
        const myPlayerId = this.getCurrentPlayerId();
        const myScore = finalScores[myPlayerId] || 0;
        const isTimedMode = winType === 'timeout' || winType === 'timed';
        
        // Submit score to leaderboard
        if (isTimedMode) {
            this.submitScoreToLeaderboard(myScore, 'timed');
        } else if (winner === myPlayerId) {
            // Player won a competitive match
            this.submitScoreToLeaderboard(1, 'competitive');
        }
        
        // Preserve best score tracking for timed mode
        if (isTimedMode) {
            try {
                const previousBest = localStorage.getItem('timedModeBestScore');
                const prevBestNum = previousBest ? parseInt(previousBest) : 0;
                const isNewBestScore = myScore > prevBestNum;
                
                if (isNewBestScore) {
                    localStorage.setItem('timedModeBestScore', myScore.toString());
                    console.log('🏆 New best score saved:', myScore);
                }
            } catch (e) {
                console.warn('Could not check best score:', e);
            }
        }
        
        // Data is tracked here for React components to access if needed
        return;
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
    
    startGame(mode = 'solo', competitiveData = null, singlePlayerMode = 'classic') {
        this.gameMode = mode; // Store the game mode
        this.singlePlayerMode = singlePlayerMode; // Store single player mode
        this.gameActive = true;
        this.gameCompleted = false;
        this.sheepRetired = 0;
        this.isPaused = false; // Ensure game starts unpaused
        
        // Store previous sheep count to check if we need to recreate the flock
        const previousSheepCount = this.totalSheep;
        
        // Set sheep count based on single player mode
        if (mode === 'solo') {
            if (singlePlayerMode === 'extreme') {
                this.totalSheep = 1000;
                console.log('Game started in extreme mode with 1000 sheep!');
            } else {
                this.totalSheep = 200;
                console.log('Game started in classic mode with 200 sheep');
            }
        } else {
            // Multiplayer modes always use 200 sheep
            this.totalSheep = 200;
        }
        
        // If sheep count changed, we need to recreate the sheep flock
        if (previousSheepCount !== this.totalSheep && this.optimizedSheepSystem) {
            console.log(`Sheep count changed from ${previousSheepCount} to ${this.totalSheep} - needs recreation`);
            // We need the scene reference to recreate - store it for later use
            this.needsFlockRecreation = true;
        }
        
        // Initialize competitive/timed mode data if provided
        if ((mode === 'competitive' || mode === 'timed') && competitiveData) {
            this.initializeCompetitiveMode(competitiveData);
        }
        
        // Reset all sheep to their starting positions and states
        if (this.optimizedSheepSystem) {
            this.optimizedSheepSystem.resetAllSheep();
        }
        
        // Log game start
        if (mode === 'timed') {
            console.log('Game started in timed mode - 3 minute countdown!');
        } else if (mode === 'multiplayer') {
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
        if (this.gameMode !== 'competitive' && this.gameMode !== 'timed') {
            console.warn('updatePlayerScore called in non-competitive/timed mode');
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
        if (this.gameMode !== 'competitive' && this.gameMode !== 'timed') {
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
    
    // Submit score to leaderboard system
    submitScoreToLeaderboard(score, gameMode = null) {
        // Determine game mode if not provided
        let leaderboardMode = gameMode;
        if (!leaderboardMode) {
            if (this.gameMode === 'solo') {
                leaderboardMode = this.singlePlayerMode === 'extreme' ? 'soloExtreme' : 'soloClassic';
            } else if (this.gameMode === 'multiplayer') {
                leaderboardMode = 'cooperative';
            } else {
                leaderboardMode = this.gameMode; // competitive, timed, etc.
            }
        }
        
        console.log(`📊 Submitting score to leaderboard: ${score} for mode: ${leaderboardMode}`);
        
        // Call the global score submission function
        if (window.submitGameScore) {
            window.submitGameScore(leaderboardMode, score, {
                gameMode: this.gameMode,
                singlePlayerMode: this.singlePlayerMode,
                totalSheep: this.totalSheep,
                timestamp: Date.now()
            });
        } else {
            console.warn('Score submission function not available');
        }
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
