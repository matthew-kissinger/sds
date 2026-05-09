import { Vector2D } from './Vector2D.js';
import { OptimizedSheepSystem } from './OptimizedSheep.js';
import { FieldConfig, FIELD_SIZES, GATE_DEFAULTS, PASTURE_DEFAULTS } from './FieldConfig.js';
import { getFenceCollisionSystem, resetFenceCollisionSystem } from './FenceCollisionSystem.js';
import { getExtremeBoidSystem, resetExtremeBoidSystem } from './ExtremeBoidSystem.js';
import { emptyObstacles } from '../shared/SceneObstacles.js';
import { getCurrentRoom } from './GameBridge.js';
import {
    SOLO_MODE_SHEEP_COUNT,
    SOLO_MODE_TO_LEADERBOARD,
    isExtremeBoidMode,
    getModeCapabilities,
} from './gamestate/modes.js';
import { calculatePolygonSpawnConfig } from './gamestate/polygonSpawn.js';
import { isSoloComplete, isSandboxComplete, resolveCompetitiveCompletion } from './gamestate/winConditions.js';
import { createObjective, refreshObjective, tickObjective, isCorralOpen } from './gamestate/objective.js';

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
        // Optional heightfield, set by main.js after async load. Propagated to
        // OptimizedSheepSystem when the sheep are spawned (startGame).
        /** @type {import('../shared/terrain/Heightfield.js').Heightfield | null} */
        this.heightfield = null;

        // Get initial config from FieldConfig
        const fieldConfig = FieldConfig.getFullConfig();

        // Field boundaries - from FieldConfig
        this.bounds = fieldConfig.bounds;

        // Discriminated boundary (Cycle 5+). Defaults to null; main.js sets
        // it from currentScene.boundary after loadScene. When set with
        // kind='island', sheep + dog use radial math instead of rect.
        /** @type {import('../shared/scenes/types.js').Boundary | null} */
        this.boundary = null;

        // Corral (Cycle 5+ Rolling Hills). When set, sheep retire on entering
        // the corral disc instead of crossing a gate. Replaces gate+pasture
        // for the win condition.
        /** @type {import('../shared/scenes/types.js').CorralDef | null} */
        this.corral = null;

        // Multi-stage objective state. Null on scenes without an `objective`
        // def (RH, Field). Shape + transitions live in js/gamestate/objective.js.
        /** @type {import('./gamestate/objective.js').ObjectiveState | null} */
        this.objective = null;

        // Cycle 6 Phase 2: scene obstacles (trees + rocks + buildings) for
        // sheep/dog routing. Built in main.js after terrain creation, then
        // attached here. Empty until then; sheep + dog read this via
        // getGameState() and skip query when trees.length === 0 (Field).
        /** @type {import('../shared/SceneObstacles.js').SceneObstacleSet} */
        this.obstacles = emptyObstacles();

        // Game mode ('solo', 'multiplayer', 'competitive', 'sandbox')
        this.gameMode = 'solo';

        // Gate and pasture configuration - from FieldConfig
        this.gate = fieldConfig.gate;
        this.pasture = fieldConfig.pasture;
        
        // Competitive mode support
        this.competitiveGates = []; // Array of gate configurations for competitive mode
        this.playerScores = {}; // playerId -> sheep count for competitive mode
        
        // Simulation parameters (source of truth for flocking/difficulty).
        // Core keys used everywhere: speed, cohesion, separationDistance.
        // Optional tuning keys (extreme/insane panel): perception, separationWeight,
        // alignmentWeight, fleeMultiplier, fleeRadius, gateAttraction, maxForce,
        // edgeMargin, edgeTurnForce.
        this.params = {
            speed: 0.1,
            cohesion: 0.1,
            separationDistance: 2,
            perception: 5,
            separationWeight: 1.6,
            alignmentWeight: 1.6,
            fleeMultiplier: 4,
            fleeRadius: 8,
            gateAttraction: 2,
            maxForce: 0.02,
            edgeMargin: 2.5,
            edgeTurnForce: 0.05
        };
        
        // Game state
        this.sheep = [];
        this.sheepdog = null;
        this.sheepdog2 = null; // Secondary sheepdog for local 2-player mode
        this.sheepRetired = 0;
        this.gameCompleted = false;
        this.totalSheep = 200; // Default to classic mode
        this.gameActive = false; // New: tracks if game is actively being played
        this.isPaused = false; // New: tracks if game is paused
        this.audioManager = null;
        this.singlePlayerMode = 'classic'; // Single player difficulty: 'classic', 'extreme', or 'insane'
        this.useExtremeBoids = false; // Flag for sandbox to enable extreme boid optimization
        
        // Always use optimized sheep system
        this.optimizedSheepSystem = null;
    }
    
    createSheepFlock(scene) {
        // Create optimized sheep system with correct sheep count
        console.log(`Creating sheep flock with ${this.totalSheep} sheep`);

        // Calculate spawn position - use polygon-aware spawning for non-rectangular shapes
        let spawnConfig;

        // Cycle 8 Phase 2: derive maxRadius (the cap on density-driven spawn
        // expansion in OptimizedSheepSystem). For island scenes use the safe
        // radius (boundary minus falloff minus a 4m buffer); for rect bounds,
        // 40% of the smaller dimension keeps spawn well inside fences.
        let maxRadius;
        if (this.boundary?.kind === 'island') {
            const safe = this.boundary.radius - (this.boundary.falloff || 0) - 4;
            maxRadius = Math.max(safe, 30);
        } else if (this.bounds) {
            const w = this.bounds.maxX - this.bounds.minX;
            const h = this.bounds.maxZ - this.bounds.minZ;
            maxRadius = Math.min(w, h) * 0.4;
        }

        if (this.borderPoints && this.borderPoints.length >= 3 && this.gameMode === 'sandbox') {
            // Polygon shape - calculate centroid and use polygon-aware spawning
            spawnConfig = calculatePolygonSpawnConfig({
                borderPoints: this.borderPoints,
                bounds: this.bounds,
                gate: this.gate,
            });
            console.log(`[SHEEP] Polygon spawn config: center(${spawnConfig.centerX.toFixed(1)}, ${spawnConfig.centerZ.toFixed(1)}), radius=${spawnConfig.spreadRadius.toFixed(1)}`);
        } else if (this.sceneSpawnDef) {
            // Cycle 7: scene-provided spawn def (centerX/centerZ/spreadRadius
            // and optional clusterCenters). Lets island scenes override the
            // bounds-derived defaults to spread sheep across more of the
            // playable area, which gives the player a real gathering task
            // rather than a tight pre-formed flock at spawn.
            spawnConfig = {
                centerX: this.sceneSpawnDef.centerX,
                centerZ: this.sceneSpawnDef.centerZ,
                spreadRadius: this.sceneSpawnDef.spreadRadius,
                defaultCount: this.sceneSpawnDef.count,
            };
            if (this.sceneSpawnDef.clusterCenters) {
                spawnConfig.clusterCenters = this.sceneSpawnDef.clusterCenters;
            }
            console.log(`[SHEEP] Scene spawn config: center(${spawnConfig.centerX.toFixed(1)}, ${spawnConfig.centerZ.toFixed(1)}), radius=${spawnConfig.spreadRadius.toFixed(1)}, clusters=${spawnConfig.clusterCenters?.length ?? 1}, defaultCount=${spawnConfig.defaultCount}`);
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

        if (maxRadius != null) {
            spawnConfig.maxRadius = maxRadius;
        }

        // Pass borderPoints for polygon-aware spawning
        if (this.borderPoints && this.borderPoints.length >= 3) {
            spawnConfig.borderPoints = this.borderPoints;
        }

        // Enable extreme boid optimization for extreme/insane/chaos mode or sandbox with useExtremeBoids flag
        const useExtremeBoids = isExtremeBoidMode(this.singlePlayerMode) || this.useExtremeBoids === true;

        this.optimizedSheepSystem = new OptimizedSheepSystem(scene, this.totalSheep, spawnConfig, useExtremeBoids);
        if (this.heightfield) {
            this.optimizedSheepSystem.heightfield = this.heightfield;
        }
        this.sheep = this.optimizedSheepSystem.getSheep();

        if (useExtremeBoids) {
            console.log('[GameState] Extreme boid optimization enabled');
        }

        // Set bounds and borderPoints for each sheep instance
        this.sheep.forEach(sheep => {
            sheep.setBounds(this.bounds);
            if (this.boundary) {
                sheep.setBoundary(this.boundary);
            }
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
            this.getBoundary(),  // Pass boundary (Cycle 5+) or bounds (legacy rect) — sheep avoid functions accept either
            this.params,  // Always pass params so sheep can flock
            true, // enableIndividualBleating
            this.gameMode === 'multiplayer', // isMultiplayer flag
            this.gameActive ? this.sheepdog2 : null // Second sheepdog for local 2-player
        );
        
        // Cycle 7 Phase 3 / Cycle 29 B4: tick the multi-stage objective
        // state machine. Implementation lives in js/gamestate/objective.js.
        if (this.gameActive) {
            tickObjective(this.objective, this.sheep, deltaTime, () => {
                window.dispatchEvent(new CustomEvent('objective-stage-changed', {
                    detail: { stage: 'drive' }
                }));
            });
        }

        // Only count retired sheep if game is active
        if (this.gameActive) {
            // In multiplayer mode, sheep count is managed by server
            if (this.gameMode !== 'multiplayer') {
                this.sheepRetired = 0;

                // Corral retirement is gated on the multi-stage objective:
                // while stage === 'roundup', sheep entering the portal
                // radius walk through; once stage flips to 'drive', the
                // gate opens. RH/Field have no objective — always open.
                const corralOpen = isCorralOpen(this.objective);

                // Count retired sheep
                for (let sheep of this.sheep) {
                    // Check retirement trigger:
                    //   - Cycle 5+: corral entry (Rolling Hills) when scene has `corral`
                    //   - Legacy: gate passage (Field, Open Country)
                    if (!sheep.hasPassedGate && !sheep.isRetiring) {
                        let triggered = false;
                        if (this.corral && corralOpen) {
                            triggered = sheep.checkCorralAndRetire(this.corral);
                        } else if (!this.corral) {
                            triggered = sheep.checkGatePassageAndRetire(this.getGateForSheepBehavior(), this.getPastureForSheepBehavior());
                        }
                        if (triggered) {
                            this.sheepRetired++;
                            if (this.audioManager) {
                                this.audioManager.playRewardingChime();
                            }
                            // Cycle 5+: corral entry triggers a lightning zap
                            // effect. main.js listens and fires CorralZapEffect.
                            if (this.corral) {
                                window.dispatchEvent(new CustomEvent('corral-retired', {
                                    detail: { x: sheep.position.x, z: sheep.position.z, y: sheep.mesh?.position?.y ?? 0 }
                                }));
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
        // Universal completion check for all modes. Delegates the predicate
        // to js/gamestate/winConditions.js; the gameCompleted single-shot
        // mutation stays here.
        if (isSoloComplete(this) && !this.gameCompleted) {
            this.gameCompleted = true;
            console.log('[GAME] GAME COMPLETED! Triggering completion flow...');
            return true;
        }
        return false;
    }
    
    updateUI() {
        // Only update UI if game is active and not paused
        if (!this.gameActive || this.isPaused) return;

        const variant = getModeCapabilities(this.gameMode).uiVariant;
        if (variant === 'competitive') this.updateCompetitiveUI();
        else if (variant === 'timed') this.updateTimedUI();
        else this.updateCooperativeUI();
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

    /**
     * Returns the discriminated boundary if set (Cycle 5+ scenes), else the
     * legacy rect bounds. Both shapes are accepted by Sheepdog.applyBoundaryConstraints
     * and OptimizedSheep.avoidBoundariesWithGate.
     * @returns {import('../shared/scenes/types.js').Boundary | Object}
     */
    getBoundary() {
        return this.boundary || this.bounds;
    }

    /**
     * Set the discriminated boundary and propagate to existing sheep.
     * Call this after loading a scene def whose boundary is `island` or
     * any other non-rect shape.
     * @param {import('../shared/scenes/types.js').Boundary} boundary
     */
    setBoundary(boundary) {
        this.boundary = boundary;
        if (this.optimizedSheepSystem) {
            const sheepArr = this.optimizedSheepSystem.getSheep();
            for (const sheep of sheepArr) {
                sheep.setBoundary(boundary);
            }
        }
    }

    /**
     * Apply a per-scene flocking override (Cycle 5+). Merges the override
     * keys into `this.params`. Field stays untouched (no override → no merge).
     * Call after loadScene, before startGame.
     * @param {import('../shared/scenes/types.js').FlockingOverride} [override]
     */
    setFlockingOverride(override) {
        if (!override) return;
        Object.assign(this.params, override);
    }

    /**
     * Set the corral (Cycle 5+ Rolling Hills). Triggers corral-based
     * retirement instead of gate-based. Pass null to revert.
     * @param {import('../shared/scenes/types.js').CorralDef | null} corral
     */
    setCorral(corral) {
        this.corral = corral;
    }

    /**
     * Cycle 7: set the scene's sheepSpawn definition for the next
     * createSheepFlock call. Pass null to revert to the bounds-derived
     * defaults.
     * @param {import('../shared/scenes/types.js').SheepSpawnDef | null} sheepSpawn
     */
    setSheepSpawn(sheepSpawn) {
        this.sceneSpawnDef = sheepSpawn || null;
    }

    /**
     * Set the multi-stage objective. Stash the def so startGame's
     * _refreshObjective can recompute requiredSheep against the per-mode
     * totalSheep once it's set. Pass null on scenes without an objective
     * (RH/Field) — the retirement path then runs unchanged.
     * @param {import('../shared/scenes/types.js').ObjectiveDef | null} objective
     */
    setObjective(objective) {
        this._objectiveDef = objective || null;
        this.objective = createObjective(objective, this.totalSheep);
    }

    _refreshObjective() {
        refreshObjective(this.objective, this._objectiveDef, this.totalSheep);
    }
    
    getGate() {
        // For competitive mode, return all gates; for cooperative, return single gate
        if (getModeCapabilities(this.gameMode).usesCompetitiveGates && this.competitiveGates.length > 0) {
            return this.competitiveGates;
        }
        return this.gate;
    }

    getPasture() {
        // For competitive mode, return all pastures; for cooperative, return single pasture
        if (getModeCapabilities(this.gameMode).usesCompetitiveGates && this.competitiveGates.length > 0) {
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
        if (getModeCapabilities(this.gameMode).usesCompetitiveGates && this.competitiveGates.length > 0) {
            // Return all competitive gates - sheep will use closest gate logic
            return this.competitiveGates;
        }
        return this.gate;
    }

    getPastureForSheepBehavior() {
        // For sheep behavior, we need to determine appropriate pasture
        if (getModeCapabilities(this.gameMode).usesCompetitiveGates && this.competitiveGates.length > 0) {
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

    setSheepdog2(sheepdog2) {
        this.sheepdog2 = sheepdog2;
    }

    getSheepdog2() {
        return this.sheepdog2;
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

        // Cycle 10 Phase 6: capture wall-clock start so the score submission
        // can include clientStartedAt + clientFinishedAt. The worker compares
        // their delta against the claimed score (= duration in seconds for
        // time modes); >10s skew flags a score_anomalies entry.
        this._clientStartedAt = Date.now();

        // Store previous sheep count to check if we need to recreate the flock
        const previousSheepCount = this.totalSheep;

        // Cycle 9 Phase 1: solo sheep count is owned by mode, not scene def
        // (table lives in js/gamestate/modes.js). Classic=200, Extreme=1000,
        // Insane=3000, Chaos=5000, Practice=30. Scene defs keep
        // `sheepSpawn.count` only as a density hint forwarded via
        // spawnConfig.defaultCount for radius scaling. Multiplayer reads
        // the host-configured count from the room (server authoritative).
        if (mode === 'solo') {
            this.totalSheep = SOLO_MODE_SHEEP_COUNT[singlePlayerMode] ?? 200;
            console.log(`Game started in ${singlePlayerMode} mode with ${this.totalSheep} sheep`);
            // Cycle 26 v2.1.0: first-visit flag drives the pulsing-glow
            // hint on the Practice tile in SinglePlayerModes. Set on any
            // solo start (not just practice) so the hint stops pulsing
            // once the player engages with any mode.
            try { localStorage.setItem('sds.has-played', '1'); } catch {}
        } else {
            const room = getCurrentRoom();
            const roomSheepCount = room?.sheepCount;
            this.totalSheep = (typeof roomSheepCount === 'number' && roomSheepCount > 0)
                ? roomSheepCount
                : (this.sceneSpawnDef?.count ?? 200);
            console.log(`MP game started with ${this.totalSheep} sheep (room=${roomSheepCount ?? 'n/a'}, sceneDef=${this.sceneSpawnDef?.count ?? 'n/a'})`);
        }

        // Cycle 18 Phase 2 (Q6 resolution): always recreate the flock on
        // `startGame`. The previous gate (`previousSheepCount !== totalSheep`)
        // skipped recreation on same-count restarts (Classic→Classic, or any
        // mode-cycle that returned to the same count), leaving sheep at the
        // prior session's positions and any previously-set spawnConfig
        // stickiness — observed as sheep stuck out-of-bounds on OC after a
        // restart from another scene/mode. Fresh recreation costs ~ms in the
        // common case and is bulletproof across mode-cycle paths.
        if (this.optimizedSheepSystem) {
            if (previousSheepCount !== this.totalSheep) {
                console.log(`Sheep count changed from ${previousSheepCount} to ${this.totalSheep} - needs recreation`);
            }
            this.needsFlockRecreation = true;
        }

        // Cycle 17 Phase 6: now that totalSheep reflects the chosen mode,
        // recompute the round-up gating count via the fraction/min formula.
        // Pre-fix the OC objective hardcoded `requiredSheep: 40` regardless
        // of mode; now Classic 200→80, Extreme 1000→400, etc.
        this._refreshObjective();

        // Initialize competitive/timed mode data if provided
        if ((mode === 'competitive' || mode === 'timed') && competitiveData) {
            this.initializeCompetitiveMode(competitiveData);
        }

        // Clear sandbox-specific settings for non-sandbox modes
        this.borderPoints = null;
        this.customFences = [];

        // Set extreme boids optimization based on mode (table in js/gamestate/modes.js)
        this.useExtremeBoids = isExtremeBoidMode(singlePlayerMode);

        // Clear fence collision system (remove any sandbox fences from previous game)
        resetFenceCollisionSystem();

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

            // Clear borderPoints on each sheep (sandbox mode setting)
            this.sheep.forEach(sheep => {
                sheep.setBorderPoints(null);
            });

            // Enable/disable extreme boid system based on mode
            this.optimizedSheepSystem.setUseExtremeBoids(this.useExtremeBoids, this.bounds);
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

        // Cycle 8 Phase 4: island-scene sandbox path. When sandbox runs on
        // Rolling Hills or Open Country, the scene's heightfield + island
        // boundary are authoritative — we don't rebuild bounds, fences, or
        // gate. Just override sheep count and behavior params, then recreate
        // the flock if needed. Custom fences are intentionally not supported
        // on island heightfields in this cycle (Q3 carry-over).
        const islandScene = sandboxConfig.sceneId && sandboxConfig.sceneId !== 'field';
        if (islandScene) {
            const previousSheepCount = this.totalSheep;
            this.totalSheep = sandboxConfig.sheep?.count ?? this.totalSheep;
            this.params = sandboxConfig.sheep?.behavior || this.params;
            this.useExtremeBoids = sandboxConfig.useExtremeBoids === true;
            this.sandboxRules = {
                timerEnabled: sandboxConfig.rules?.timerEnabled ?? false,
                timerMode: sandboxConfig.rules?.timerMode || 'countup',
                timeLimit: sandboxConfig.rules?.timeLimit || 180,
                winCondition: sandboxConfig.rules?.winCondition || 'all',
                winPercentage: sandboxConfig.rules?.winPercentage || 100,
                trackBestTime: sandboxConfig.rules?.trackBestTime ?? true,
            };
            this.customFences = [];
            // Force recreation if count changed; the scene-driven sceneSpawnDef
            // (already wired via setSheepSpawn at scene init) is the spawn
            // source. recreateSheepFlock will pull it through createSheepFlock.
            if (previousSheepCount !== this.totalSheep && this.optimizedSheepSystem) {
                this.needsFlockRecreation = true;
            }
            // Don't touch bounds, gate, pasture, fences, or borderPoints — the
            // scene owns those.
            console.log(`[SANDBOX] Island scene ${sandboxConfig.sceneId}: ${this.totalSheep} sheep, extremeBoids=${this.useExtremeBoids}, rules=`, this.sandboxRules);
            return;
        }

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

        // Check if sandbox wants to use extreme boid optimization
        this.useExtremeBoids = sandboxConfig.useExtremeBoids === true;

        // Check if we need to recreate sheep flock
        if (previousSheepCount !== this.totalSheep && this.optimizedSheepSystem) {
            console.log(`[SANDBOX] Sheep count changed from ${previousSheepCount} to ${this.totalSheep} - needs recreation`);
            this.needsFlockRecreation = true;
        }

        // Calculate spawn config for the new field shape BEFORE resetting sheep
        let spawnConfig;
        if (this.borderPoints && this.borderPoints.length >= 3) {
            // Polygon shape - calculate centroid and use polygon-aware spawning
            spawnConfig = calculatePolygonSpawnConfig({
                borderPoints: this.borderPoints,
                bounds: this.bounds,
                gate: this.gate,
            });
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
                if (this.boundary) {
                    sheep.setBoundary(this.boundary);
                }
                if (this.borderPoints && this.borderPoints.length >= 3) {
                    sheep.setBorderPoints(this.borderPoints);
                }
            });

            // Enable/disable extreme boid system based on sandbox config
            this.optimizedSheepSystem.setUseExtremeBoids(this.useExtremeBoids, this.bounds);
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
        console.log(`[SANDBOX] Extreme boid optimization: ${this.useExtremeBoids ? 'ENABLED' : 'disabled'}`);
    }

    /**
     * Get custom fences for sandbox mode
     */
    getCustomFences() {
        return this.customFences || [];
    }

    /**
     * Check if sandbox win condition is met. Falls through to the
     * gameCompleted-mutating checkCompletion path for non-sandbox or
     * rules-less states; otherwise the pure predicate in winConditions.js
     * decides.
     */
    checkSandboxCompletion() {
        if (!this.sandboxRules || this.gameMode !== 'sandbox') {
            return this.checkCompletion();
        }
        return isSandboxComplete(this);
    }
    
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
    
    updatePlayerScore(playerId, increment = 1) {
        if (!getModeCapabilities(this.gameMode).tracksPlayerScores) {
            console.warn('updatePlayerScore called in non-score-tracking mode');
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

    getPlayerScore(playerId) {
        if (!getModeCapabilities(this.gameMode).tracksPlayerScores) {
            return 0;
        }
        return this.playerScores[playerId] || 0;
    }
    
    // Check if competitive mode win conditions are met. Delegates to
    // shared/GameStateValidation via the winConditions resolver — the
    // Worker DO uses the same pure function authoritatively, so client
    // and server agree by construction.
    checkCompetitiveCompletion() {
        return resolveCompetitiveCompletion(this);
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
    
    // Submit score to leaderboard system. The MODE_CAPABILITIES table in
    // js/gamestate/modes.js gates sandbox out via submitsToLeaderboard:false;
    // practice is gated separately because it's a singlePlayerMode under solo.
    submitScoreToLeaderboard(score, gameMode = null) {
        if (!getModeCapabilities(this.gameMode).submitsToLeaderboard) {
            console.log(`[GAME] ${this.gameMode} mode does not submit to leaderboard - blocked`);
            return;
        }
        // Cycle 26 v2.1.0: Practice Paddock is a no-pressure mode — never
        // submit to leaderboard regardless of the score path that calls in.
        if (this.singlePlayerMode === 'practice') {
            console.log('[GAME] Practice mode - score submission blocked');
            return;
        }

        // Determine game mode if not provided
        let leaderboardMode = gameMode;
        if (!leaderboardMode) {
            if (this.gameMode === 'solo') {
                leaderboardMode = SOLO_MODE_TO_LEADERBOARD[this.singlePlayerMode]
                    || 'soloClassic';
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

        // Cycle 8 Phase 3: include sceneId + sheepCount so the worker can lift
        // them into score_submissions columns for partitioned leaderboards.
        const sceneId = this.sceneId
            || this.sceneSpawnDef?.sceneId
            || (typeof window !== 'undefined' && window.__currentSceneId)
            || 'field';

        console.log(`[GAME] Submitting score to leaderboard: ${score} for mode: ${leaderboardMode}, scene: ${sceneId}, sheep: ${this.totalSheep}`);

        // Call the global score submission function
        if (window.submitGameScore) {
            window.submitGameScore(leaderboardMode, score, {
                gameMode: this.gameMode,
                singlePlayerMode: this.singlePlayerMode,
                sceneId,
                sheepCount: this.totalSheep,
                totalSheep: this.totalSheep,
                timestamp: Date.now(),
                // Cycle 10 Phase 6: client wall-clock window. Worker compares
                // (clientFinishedAt - clientStartedAt) against the claimed
                // score (= duration in seconds for time modes); >10s skew
                // flags a score_anomalies row.
                clientStartedAt: this._clientStartedAt || null,
                clientFinishedAt: Date.now()
            });
        } else {
            console.warn('Score submission function not available');
        }

        // Cycle 11 Phase 5: telemetry — fire-and-forget, never blocks UX.
        try {
            import('./telemetry.js').then(({ emitEvent }) => {
                emitEvent('game_completed', {
                    mode: leaderboardMode,
                    sceneId,
                    sheepCount: this.totalSheep,
                    score: typeof score === 'number' ? Math.round(score * 100) / 100 : 0,
                });
            });
        } catch {}
    }
    
    reset() {
        this.sheep = [];
        this.sheepdog = null;
        this.sheepRetired = 0;
        this.gameCompleted = false;
        this.gameActive = false;
        this.isPaused = false;
        this.optimizedSheepSystem = null;

        // Reset extreme boid system
        resetExtremeBoidSystem();
        this.useExtremeBoids = false;

        // Reset competitive mode data
        this.gameMode = 'solo';
        this.competitiveGates = [];
        this.playerScores = {};
        this.currentPlayerId = null;
    }
}
