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
        
        // Gate and pasture configuration
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
        this.optimizedSheepSystem.update(
            deltaTime,
            this.gameActive ? this.sheepdog : null, // Only pass sheepdog if game is active
            this.gameActive ? this.gate : null,     // Only enable gate mechanics if game is active
            this.gameActive ? this.pasture : null,  // Only enable pasture mechanics if game is active
            this.bounds,  // Always pass bounds so sheep stay in field
            this.params   // Always pass params so sheep can flock
        );
        
        // Only count retired sheep if game is active
        if (this.gameActive) {
            this.sheepRetired = 0;
            
            // Count retired sheep
            for (let sheep of this.sheep) {
                // Check if sheep has passed gate
                if (!sheep.hasPassedGate && !sheep.isRetiring) {
                    if (sheep.checkGatePassageAndRetire(this.gate.passageZone, this.pasture)) {
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
    
    showCompletionMessage(finalTime, isNewRecord) {
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
        return this.gate;
    }
    
    getPasture() {
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
    
    startGame() {
        this.gameActive = true;
        this.gameCompleted = false;
        this.sheepRetired = 0;
        this.isPaused = false; // Ensure game starts unpaused
        
        // Reset all sheep to their starting positions and states
        if (this.optimizedSheepSystem) {
            this.optimizedSheepSystem.resetAllSheep();
        }
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
    
    reset() {
        this.sheep = [];
        this.sheepdog = null;
        this.sheepRetired = 0;
        this.gameCompleted = false;
        this.gameActive = false;
        this.isPaused = false;
        this.optimizedSheepSystem = null;
    }
} 