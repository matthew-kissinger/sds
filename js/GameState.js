import { Vector2D } from './Vector2D.js';
import { OptimizedSheepSystem } from './OptimizedSheep.js';
import { FieldConfig, FIELD_SIZES, GATE_DEFAULTS, PASTURE_DEFAULTS } from './FieldConfig.js';
import { getFenceCollisionSystem, resetFenceCollisionSystem } from './FenceCollisionSystem.js';

/**
 * GameState - Handles game configuration, boundaries, and state management
 *
 * Uses FieldConfig as the source of truth for field dimensions.
 * Can be overridden by:
 * - SandboxConfig (for sandbox mode)
 * - Server (for multiplayer mode)
 */
export class GameState {
    constructor() {
        // Get initial config from FieldConfig
        const fieldConfig = FieldConfig.getFullConfig();

        // Field boundaries - from FieldConfig
        this.bounds = fieldConfig.bounds;

        // Game mode ('solo', 'multiplayer', 'competitive', 'sandbox')
        this.gameMode = 'solo';

        // Gate and pasture configuration - from FieldConfig
        this.gate = fieldConfig.gate;
        this.pasture = fieldConfig.pasture;
        
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

        // Calculate spawn position - use polygon-aware spawning for non-rectangular shapes
        let spawnConfig;

        if (this.borderPoints && this.borderPoints.length >= 3 && this.gameMode === 'sandbox') {
            // Polygon shape - calculate centroid and use polygon-aware spawning
            spawnConfig = this.calculatePolygonSpawnConfig();
            console.log(`[SHEEP] Polygon spawn config: center(${spawnConfig.centerX.toFixed(1)}, ${spawnConfig.centerZ.toFixed(1)}), radius=${spawnConfig.spreadRadius.toFixed(1)}`);
        } else {
            // Rectangular bounds - use standard spawning
            const fieldCenterX = (this.bounds.minX + this.bounds.maxX) / 2;
            const fieldCenterZ = (this.bounds.minZ + this.bounds.maxZ) / 2;
            // Spawn slightly south of center (away from gate)
            const spawnCenterZ = fieldCenterZ - (this.bounds.maxZ - this.bounds.minZ) * 0.15;

            // Calculate appropriate spread radius based on field size
            const fieldWidth = this.bounds.maxX - this.bounds.minX;
            const fieldHeight = this.bounds.maxZ - this.bounds.minZ;
            const spreadRadius = Math.min(fieldWidth, fieldHeight) * 0.2;

            spawnConfig = {
                centerX: fieldCenterX,
                centerZ: spawnCenterZ,
                spreadRadius: spreadRadius
            };
            console.log(`[SHEEP] Rect spawn config: center(${spawnConfig.centerX.toFixed(1)}, ${spawnConfig.centerZ.toFixed(1)}), radius=${spawnConfig.spreadRadius.toFixed(1)}`);
        }

        // Pass borderPoints for polygon-aware spawning
        if (this.borderPoints && this.borderPoints.length >= 3) {
            spawnConfig.borderPoints = this.borderPoints;
        }

        this.optimizedSheepSystem = new OptimizedSheepSystem(scene, this.totalSheep, spawnConfig);
        this.sheep = this.optimizedSheepSystem.getSheep();

        // Set bounds and borderPoints for each sheep instance
        this.sheep.forEach(sheep => {
            sheep.setBounds(this.bounds);
            if (this.borderPoints && this.borderPoints.length >= 3) {
                sheep.setBorderPoints(this.borderPoints);
            }
        });

        // Set audio manager if available
        if (this.audioManager) {
            this.optimizedSheepSystem.setAudioManager(this.audioManager);
        }

        return null; // No individual meshes to return
    }

    /**
     * Calculate spawn configuration for polygon-shaped fields
     * Uses the polygon centroid and calculates safe spawn radius
     * Handles concave polygons (like L-shape) by validating spawn center is inside
     */
    calculatePolygonSpawnConfig() {
        const points = this.borderPoints;

        // Calculate centroid of polygon
        let centroidX = 0;
        let centroidZ = 0;
        for (const point of points) {
            centroidX += point.x;
            centroidZ += point.z;
        }
        centroidX /= points.length;
        centroidZ /= points.length;

        // Move spawn center slightly away from gate (toward south)
        const gateZ = this.gate?.position?.z || this.bounds.maxZ;
        let spawnCenterX = centroidX;
        let spawnCenterZ = centroidZ - (gateZ - centroidZ) * 0.3; // Move 30% away from gate

        // For concave polygons, the centroid or adjusted position might be outside
        // Validate and find a valid spawn center if needed
        if (!this.isPointInPolygon(spawnCenterX, spawnCenterZ, points)) {
            console.log(`[SPAWN] Initial spawn center (${spawnCenterX.toFixed(1)}, ${spawnCenterZ.toFixed(1)}) is outside polygon, searching for valid point...`);

            // Try the raw centroid first
            if (this.isPointInPolygon(centroidX, centroidZ, points)) {
                spawnCenterX = centroidX;
                spawnCenterZ = centroidZ;
            } else {
                // Search for a valid point using a grid search within bounds
                const gridSize = 10;
                const stepX = (this.bounds.maxX - this.bounds.minX) / gridSize;
                const stepZ = (this.bounds.maxZ - this.bounds.minZ) / gridSize;
                let bestPoint = null;
                let bestDistFromEdges = 0;

                for (let gx = 1; gx < gridSize; gx++) {
                    for (let gz = 1; gz < gridSize; gz++) {
                        const testX = this.bounds.minX + gx * stepX;
                        const testZ = this.bounds.minZ + gz * stepZ;

                        if (this.isPointInPolygon(testX, testZ, points)) {
                            // Calculate minimum distance to any edge
                            let minDist = Infinity;
                            for (let i = 0; i < points.length; i++) {
                                const start = points[i];
                                const end = points[(i + 1) % points.length];
                                const dist = this.pointToSegmentDistance(testX, testZ, start, end);
                                minDist = Math.min(minDist, dist);
                            }

                            // Prefer points further from edges (more "inside")
                            if (minDist > bestDistFromEdges) {
                                bestDistFromEdges = minDist;
                                bestPoint = { x: testX, z: testZ };
                            }
                        }
                    }
                }

                if (bestPoint) {
                    spawnCenterX = bestPoint.x;
                    spawnCenterZ = bestPoint.z;
                    console.log(`[SPAWN] Found valid spawn center at (${spawnCenterX.toFixed(1)}, ${spawnCenterZ.toFixed(1)}), dist from edge: ${bestDistFromEdges.toFixed(1)}`);
                }
            }
        }

        // Calculate safe spawn radius (distance to nearest edge from spawn center)
        let minDistToEdge = Infinity;
        for (let i = 0; i < points.length; i++) {
            const start = points[i];
            const end = points[(i + 1) % points.length];
            const dist = this.pointToSegmentDistance(spawnCenterX, spawnCenterZ, start, end);
            minDistToEdge = Math.min(minDistToEdge, dist);
        }

        // Use 60% of the distance to edge as spawn radius for safety margin
        const spreadRadius = minDistToEdge * 0.6;

        return {
            centerX: spawnCenterX,
            centerZ: spawnCenterZ,
            spreadRadius: Math.max(spreadRadius, 10) // Minimum 10 units
        };
    }

    /**
     * Calculate distance from a point to a line segment
     */
    pointToSegmentDistance(px, pz, start, end) {
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const length = Math.sqrt(dx * dx + dz * dz);

        if (length === 0) {
            return Math.sqrt(Math.pow(px - start.x, 2) + Math.pow(pz - start.z, 2));
        }

        const t = Math.max(0, Math.min(1,
            ((px - start.x) * dx + (pz - start.z) * dz) / (length * length)
        ));

        const closestX = start.x + t * dx;
        const closestZ = start.z + t * dz;

        return Math.sqrt(Math.pow(px - closestX, 2) + Math.pow(pz - closestZ, 2));
    }

    /**
     * Check if a point is inside the polygon defined by borderPoints
     * Uses ray casting algorithm
     */
    isPointInPolygon(x, z, points = null) {
        const polygon = points || this.borderPoints;
        if (!polygon || polygon.length < 3) return true; // No polygon, assume inside

        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, zi = polygon[i].z;
            const xj = polygon[j].x, zj = polygon[j].z;

            if (((zi > z) !== (zj > z)) &&
                (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
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
                        if (sheep.checkGatePassageAndRetire(this.getGateForSheepBehavior(), this.getPastureForSheepBehavior())) {
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
            console.log('[GAME] GAME COMPLETED! Triggering completion flow...');
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
        console.log('[UI] showCooperativeCompletionMessage called - delegating to React UI:', {
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
        console.log('[UI] showCompetitiveCompletionMessage called - delegating to React UI:', {
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
                    console.log('[GAME] New best score saved:', myScore);
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

        // Clear sandbox-specific settings for non-sandbox modes
        this.borderPoints = null;

        // Reset all sheep to their starting positions and states
        if (this.optimizedSheepSystem) {
            // Reset spawn config to default for classic/extreme (in case user previously played sandbox)
            this.optimizedSheepSystem.setSpawnConfig({
                centerX: -30,
                centerZ: -30,
                spreadRadius: 30,
                borderPoints: null
            });
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

    /**
     * Start a sandbox game with custom configuration
     * @param {Object} sandboxConfig - The sandbox configuration object
     */
    startSandboxGame(sandboxConfig) {
        this.gameMode = 'sandbox';
        this.singlePlayerMode = 'sandbox';
        this.gameActive = true;
        this.gameCompleted = false;
        this.sheepRetired = 0;
        this.isPaused = false;

        // Store sandbox config for reference
        this.sandboxConfig = sandboxConfig;

        // Apply sandbox configuration
        const gameStateConfig = sandboxConfig.toGameStateFormat();

        // Update bounds from sandbox config
        this.bounds = gameStateConfig.bounds;
        this.fieldShape = gameStateConfig.fieldShape || 'square';
        this.borderPoints = gameStateConfig.borderPoints || null;

        // Update gate configuration
        this.gate = gameStateConfig.gate;

        // Update pasture configuration
        this.pasture = gameStateConfig.pasture;

        // Sync FieldConfig so other components get notified
        FieldConfig.setBounds(this.bounds, this.gate, this.pasture);

        // Update sheep count
        const previousSheepCount = this.totalSheep;
        this.totalSheep = gameStateConfig.totalSheep;

        // Update behavior params
        this.params = gameStateConfig.params;

        // Store custom fences for structure builder
        this.customFences = gameStateConfig.customFences || [];

        // Store rules
        this.sandboxRules = gameStateConfig.rules;

        // Check if we need to recreate sheep flock
        if (previousSheepCount !== this.totalSheep && this.optimizedSheepSystem) {
            console.log(`[SANDBOX] Sheep count changed from ${previousSheepCount} to ${this.totalSheep} - needs recreation`);
            this.needsFlockRecreation = true;
        }

        // Calculate spawn config for the new field shape BEFORE resetting sheep
        let spawnConfig;
        if (this.borderPoints && this.borderPoints.length >= 3) {
            // Polygon shape - calculate centroid and use polygon-aware spawning
            spawnConfig = this.calculatePolygonSpawnConfig();
            spawnConfig.borderPoints = this.borderPoints;
            console.log(`[SANDBOX] Polygon spawn config: center(${spawnConfig.centerX.toFixed(1)}, ${spawnConfig.centerZ.toFixed(1)}), radius=${spawnConfig.spreadRadius.toFixed(1)}, points=${this.borderPoints.length}`);
        } else {
            // Rectangular bounds - use standard spawning
            const fieldCenterX = (this.bounds.minX + this.bounds.maxX) / 2;
            const fieldCenterZ = (this.bounds.minZ + this.bounds.maxZ) / 2;
            const spawnCenterZ = fieldCenterZ - (this.bounds.maxZ - this.bounds.minZ) * 0.15;
            const fieldWidth = this.bounds.maxX - this.bounds.minX;
            const fieldHeight = this.bounds.maxZ - this.bounds.minZ;
            const spreadRadius = Math.min(fieldWidth, fieldHeight) * 0.2;

            spawnConfig = {
                centerX: fieldCenterX,
                centerZ: spawnCenterZ,
                spreadRadius: spreadRadius
            };
            console.log(`[SANDBOX] Rect spawn config: center(${spawnConfig.centerX.toFixed(1)}, ${spawnConfig.centerZ.toFixed(1)}), radius=${spawnConfig.spreadRadius.toFixed(1)}`);
        }

        // Reset all sheep with the updated spawn config
        if (this.optimizedSheepSystem) {
            // Update spawn config BEFORE resetting sheep positions
            this.optimizedSheepSystem.setSpawnConfig(spawnConfig);
            this.optimizedSheepSystem.resetAllSheep();
            // Update bounds and borderPoints for all sheep to match new field
            this.sheep.forEach(sheep => {
                sheep.setBounds(this.bounds);
                if (this.borderPoints && this.borderPoints.length >= 3) {
                    sheep.setBorderPoints(this.borderPoints);
                }
            });
        }

        // Initialize fence collision system for sandbox mode
        const fenceSystem = resetFenceCollisionSystem();
        // Add border fences - use polygon if available, otherwise rectangular
        if (this.borderPoints && this.borderPoints.length >= 3) {
            fenceSystem.addPolygonBorder(this.borderPoints, this.gate);
        } else {
            fenceSystem.addBorderFences(this.bounds, this.gate);
        }
        // Add custom internal fences
        if (this.customFences && this.customFences.length > 0) {
            fenceSystem.addCustomFences(this.customFences);
        }
        console.log(`[SANDBOX] Fence collision system (shape: ${this.fieldShape}):`, fenceSystem.getStats());

        console.log(`[SANDBOX] Game started with ${this.totalSheep} sheep`);
        console.log(`[SANDBOX] Bounds:`, this.bounds);
        console.log(`[SANDBOX] Gate:`, { position: this.gate.position, width: this.gate.width, passageZone: this.gate.passageZone });
        console.log(`[SANDBOX] Pasture:`, this.pasture);
        console.log(`[SANDBOX] Custom fences: ${this.customFences.length}, Rules:`, this.sandboxRules);
    }

    /**
     * Get custom fences for sandbox mode
     */
    getCustomFences() {
        return this.customFences || [];
    }

    /**
     * Check if sandbox win condition is met
     */
    checkSandboxCompletion() {
        if (!this.sandboxRules || this.gameMode !== 'sandbox') {
            return this.checkCompletion();
        }

        const rules = this.sandboxRules;

        // Free play mode - no win condition
        if (rules.winCondition === 'none') {
            return false;
        }

        // All sheep mode
        if (rules.winCondition === 'all') {
            return this.sheepRetired >= this.totalSheep;
        }

        // Percentage mode
        if (rules.winCondition === 'percentage') {
            const targetCount = Math.ceil(this.totalSheep * (rules.winPercentage / 100));
            return this.sheepRetired >= targetCount;
        }

        return false;
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
        // IMPORTANT: Never submit sandbox scores to leaderboard
        if (this.gameMode === 'sandbox') {
            console.log('[GAME] Sandbox mode - score submission blocked');
            return;
        }

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

        // Additional safety check - block any sandbox-related modes
        if (leaderboardMode === 'sandbox' || leaderboardMode?.includes?.('sandbox')) {
            console.log('[GAME] Sandbox mode detected in leaderboardMode - score submission blocked');
            return;
        }

        console.log(`[GAME] Submitting score to leaderboard: ${score} for mode: ${leaderboardMode}`);
        
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
