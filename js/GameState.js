// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Vector2D } from './Vector2D.js';
import { OptimizedSheepSystem } from './OptimizedSheep.js';
import { FieldConfig } from './FieldConfig.js';
import { resetFenceCollisionSystem } from './FenceCollisionSystem.js';
import { resetExtremeBoidSystem } from './ExtremeBoidSystem.js';
import { emptyObstacles } from '../shared/SceneObstacles.js';
import { coastlineBounds } from '../shared/CoastlineField.js';
import { getCurrentRoom } from './GameBridge.js';
import {
    isExtremeBoidCount,
    getModeCapabilities,
} from './gamestate/modes.js';
import { getSoloCount } from '../shared/difficulty.js';
import { getSceneById } from '../shared/scenes/index.js';
import { COUNTING_GAME_MODE, COUNTING_HARD_CEILING } from '../shared/countingModes.js';
import { createRoundState, advanceRound } from './gamestate/countingMode.js';
import { calculatePolygonSpawnConfig } from './gamestate/polygonSpawn.js';
import { applySandboxConfig } from './gamestate/sandboxStart.js';
import { isSoloComplete, isSandboxComplete, resolveCompetitiveCompletion } from './gamestate/winConditions.js';
import { createObjective, refreshObjective, tickObjective, isCorralOpen } from './gamestate/objective.js';
import {
    formatTime as formatTimeImpl,
    submitScoreToLeaderboard as submitScoreToLeaderboardImpl,
    showCompletionMessage as showCompletionMessageImpl,
} from './gamestate/completion.js';

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

        // Cycle 59 (Counting Sheep): round-controller state. Null for every
        // other mode. Set in startGame when mode === 'counting'; the curve rides
        // in via singlePlayerMode ('incremental' | 'exponential').
        /** @type {import('./gamestate/countingMode.js').CountingRoundState | null} */
        this.countingState = null;
        this.countingCurve = null;

        // Always use optimized sheep system
        this.optimizedSheepSystem = null;
    }
    
    getSheepSpawnConfig() {
        let spawnConfig;

        // Cycle 8 Phase 2: derive maxRadius (the cap on density-driven spawn
        // expansion in OptimizedSheepSystem). For island scenes use the safe
        // radius (boundary minus falloff minus a 4m buffer); for rect bounds,
        // 40% of the smaller dimension keeps spawn well inside fences.
        let maxRadius;
        if (this.boundary?.kind === 'island') {
            const safe = this.boundary.radius - (this.boundary.falloff || 0) - 4;
            maxRadius = Math.max(safe, 30);
        } else if (this.boundary?.kind === 'coastline') {
            // Cycle 64: cap density-driven spawn expansion at 40% of the smaller
            // bbox dimension; the scene's sceneSpawnDef owns the actual centre.
            const bb = coastlineBounds(this.boundary);
            maxRadius = Math.max(Math.min(bb.maxX - bb.minX, bb.maxZ - bb.minZ) * 0.4, 30);
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

        return spawnConfig;
    }

    createSheepFlock(scene) {
        // Cycle 59 (Counting Sheep): a counting run pre-sizes the flock to the
        // proven 5000 ceiling and starts with a single sheep (round 1 is 1 for
        // both curves); later rounds bring batches online via activateSheepBatch.
        // Standard modes pass no maxCapacity, so the system sizes to exactly
        // totalSheep and spawns one-shot, byte-identical to before.
        const isCounting = this.gameMode === COUNTING_GAME_MODE;
        // Cycle 66 P3: a survival scene (Newsheepdogland) starts with a fixed
        // small flock and grows it at runtime via activateSheepBatch, so it
        // pre-sizes the InstancedMesh to a survival ceiling (like counting does).
        const sceneDef = getSceneById(this.sceneId);
        const survival = sceneDef?.survival || null;
        this.survival = survival;
        if (survival) this.totalSheep = survival.startFlock ?? 10;
        const initialActive = isCounting ? 1 : this.totalSheep;
        const maxCapacity = isCounting
            ? COUNTING_HARD_CEILING
            : (survival ? (survival.maxFlock ?? 80) : this.totalSheep);
        console.log(`Creating sheep flock: ${initialActive} active / capacity ${maxCapacity} (mode=${this.gameMode}${survival ? ', survival' : ''})`);

        const spawnConfig = this.getSheepSpawnConfig();

        // Enable extreme boid optimization for large flocks (Cycle 58: gated on
        // the resolved count, not the difficulty id, so a 600-sheep island run
        // gets the spatial-hash path and a 200-sheep run does not) or sandbox.
        // Counting gates on the capacity so the spatial-hash path is ready for
        // the full flock from the first frame.
        const useExtremeBoids = isExtremeBoidCount(maxCapacity) || this.useExtremeBoids === true;

        this.optimizedSheepSystem = new OptimizedSheepSystem(scene, initialActive, spawnConfig, useExtremeBoids, {
            heightfield: this.heightfield,
            ...((isCounting || survival) ? { maxCapacity } : {}),
        });
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
                            // Cycle 58 P1: do NOT count the sheep here. The
                            // "count all passed/retiring" pass below is the single
                            // authoritative tally. Incrementing here too counted a
                            // freshly-retired sheep twice on its retire frame, so
                            // sheepRetired reached the flock size one tail-sheep
                            // early and isSoloComplete fired with a sheep still in
                            // the field (the "199 of 200" completion). Keep only
                            // the one-shot side effects (chime + corral zap).
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
        // Cycle 59 (Counting Sheep): round-based modes never auto-end. The
        // player banks the score explicitly (bankCountingScore). Gate on the
        // capability flag, not the mode id, so any future round-based mode
        // inherits the bypass. checkCompletion would otherwise fire once all
        // 5000 instances are penned.
        if (getModeCapabilities(this.gameMode).autoCompletes === false) {
            return false;
        }
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

    /**
     * Cycle 59 (Counting Sheep): once every active sheep is penned, bring the
     * next batch online. Solo + client-side only; self-guards to a no-op for
     * every standard / MP mode and once the run hits the 5000 ceiling. Returns
     * the number of sheep activated this tick (0 when nothing changed).
     *
     * The round controller and the engine's activeCount stay in lock-step:
     * after round 1 both read 1, and each batch grows both by the same k, so
     * `sheepRetired >= activeCount` is exactly "the current batch is fully
     * penned". Newly-activated sheep carry hasPassedGate=false, so they do not
     * inflate the authoritative retirement tally until the player herds them.
     */
    advanceCountingRound() {
        if (this.gameMode !== COUNTING_GAME_MODE) return 0;
        if (!this.countingState || this.countingState.done) return 0;
        if (!this.optimizedSheepSystem) return 0;

        const activeCount = this.optimizedSheepSystem.activeCount;
        // Wait until the whole active batch is penned before spawning the next.
        if (this.sheepRetired < activeCount) return 0;

        const batch = advanceRound(this.countingState);
        if (batch <= 0) return 0;

        const activated = this.optimizedSheepSystem.activateSheepBatch(batch, (sheep) => {
            sheep.setBounds(this.bounds);
            if (this.boundary) {
                sheep.setBoundary(this.boundary);
            }
            if (this.borderPoints && this.borderPoints.length >= 3) {
                sheep.setBorderPoints(this.borderPoints);
            }
        });
        // activateSheepBatch appends to the system's internal array in place, so
        // this.sheep (same reference) already grew; reassign for clarity.
        this.sheep = this.optimizedSheepSystem.getSheep();

        window.dispatchEvent(new CustomEvent('counting-round-advanced', {
            detail: { round: this.countingState.round, counted: this.sheepRetired, activated },
        }));
        return activated;
    }

    /**
     * Cycle 66 P3: grow the survival flock at runtime (the +N/day lambs). Brings
     * `count` more sheep online via the same batch-activation path counting uses;
     * they spawn in the grazing field (boundary-aware) for the player to herd in.
     * @param {number} count
     * @returns {number} number actually activated (0 at the survival ceiling)
     */
    growSurvivalFlock(count) {
        if (!this.optimizedSheepSystem || count <= 0) return 0;
        const activated = this.optimizedSheepSystem.activateSheepBatch(count, (sheep) => {
            sheep.setBounds(this.bounds);
            if (this.boundary) sheep.setBoundary(this.boundary);
            if (this.borderPoints && this.borderPoints.length >= 3) sheep.setBorderPoints(this.borderPoints);
        });
        this.sheep = this.optimizedSheepSystem.getSheep();
        this.totalSheep += activated;
        return activated;
    }

    updateUI() {
        // UI is owned by React (since Cycle 3+); main.js calls this from
        // animate() and expects a safe no-op. The Cycle 28 per-mode dispatch
        // had three variant methods that all computed-and-discarded values;
        // Cycle 29 B5 collapsed them to this single guard.
        if (!this.gameActive || this.isPaused) return;
    }

    // Helper method to get current player ID (used by multiplayer UI)
    getCurrentPlayerId() {
        return this.currentPlayerId || null;
    }

    setCurrentPlayerId(playerId) {
        this.currentPlayerId = playerId;
    }

    showCompletionMessage(finalTime, isNewRecord, competitiveData = null) {
        showCompletionMessageImpl(this, finalTime, isNewRecord, competitiveData);
    }

    formatTime(timeInSeconds) {
        return formatTimeImpl(timeInSeconds);
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
    
    startGame(mode = 'solo', competitiveData = null, singlePlayerMode = 'classic', options = {}) {
        const previousMode = this.gameMode; // captured before the overwrite below
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
            // Cycle 58: solo sheep count is resolved from the armed scene's
            // difficulty ladder (per-biome), not a flat per-id table. The two
            // islands run smaller, faster tiers than Home Field; an unknown
            // scene falls back to the legacy default counts.
            const scene = getSceneById(this.sceneId);
            if (scene?.survival) {
                // Cycle 66 P3: survival scenes ignore the difficulty ladder; the
                // run always starts at survival.startFlock (no count selection).
                this.survival = scene.survival;
                this.totalSheep = scene.survival.startFlock ?? 10;
                console.log(`Survival run started on ${this.sceneId} with ${this.totalSheep} sheep`);
            } else {
                this.totalSheep = getSoloCount(scene, singlePlayerMode);
                console.log(`Game started in ${singlePlayerMode} mode on ${this.sceneId} with ${this.totalSheep} sheep`);
            }
            // Cycle 26 v2.1.0: first-visit flag drives the pulsing-glow
            // hint on the Practice tile in SinglePlayerModes. Set on any
            // solo start (not just practice) so the hint stops pulsing
            // once the player engages with any mode.
            try { localStorage.setItem('sds.has-played', '1'); } catch {}
        } else if (mode === COUNTING_GAME_MODE) {
            // Cycle 59 (Counting Sheep): the curve rides in via singlePlayerMode
            // ('incremental' | 'exponential'). The flock pre-sizes to the proven
            // 5000 ceiling (so the spatial-hash boid path and the InstancedMesh
            // are ready for the full run from frame one) and starts with a single
            // sheep; round 1 is 1 sheep for both curves. The round controller is
            // advanced to round 1 here so it stays in lock-step with the one
            // already-spawned sheep that createSheepFlock brings online.
            this.totalSheep = COUNTING_HARD_CEILING;
            this.countingCurve = singlePlayerMode;
            this.countingState = createRoundState(singlePlayerMode);
            advanceRound(this.countingState); // -> round 1, cumulative 1
            console.log(`Counting Sheep started: ${singlePlayerMode} curve on ${this.sceneId}`);
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
        // Cycle 59: a counting flock has a different structure (capacity 5000,
        // one active) than a same-count standard flock, so force recreation on
        // any transition into or out of counting. Without this, Chaos (5000) ->
        // Counting would skip recreation on the equal count and Counting -> Chaos
        // would leave the 1-active counting flock in place.
        const countingTransition = mode === COUNTING_GAME_MODE || previousMode === COUNTING_GAME_MODE;
        const needsFlockRecreation = !!this.optimizedSheepSystem
            && (previousSheepCount !== this.totalSheep || options.forceFlockRecreation === true || countingTransition);
        const skipVisibleFlockReset = options.skipVisibleFlockReset === true && needsFlockRecreation;
        if (this.optimizedSheepSystem) {
            if (previousSheepCount !== this.totalSheep) {
                console.log(`Sheep count changed from ${previousSheepCount} to ${this.totalSheep} - needs recreation`);
            }
            this.needsFlockRecreation = needsFlockRecreation;
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

        // Set extreme boids optimization based on the resolved flock size
        // (Cycle 58: count threshold in js/gamestate/modes.js).
        this.useExtremeBoids = isExtremeBoidCount(this.totalSheep);

        // Clear fence collision system (remove any sandbox fences from previous game)
        resetFenceCollisionSystem();

        if (this.optimizedSheepSystem && !skipVisibleFlockReset) {
            this.optimizedSheepSystem.setSpawnConfig(this.getSheepSpawnConfig());
            this.optimizedSheepSystem.resetAllSheep();

            this.sheep.forEach(sheep => {
                sheep.setBorderPoints(null);
            });

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
     * Start a sandbox game with custom configuration. Body lives in
     * js/gamestate/sandboxStart.js so this orchestrator stays slim.
     * @param {Object} sandboxConfig - The sandbox configuration object
     */
    startSandboxGame(sandboxConfig) {
        applySandboxConfig(this, sandboxConfig);
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
    
    submitScoreToLeaderboard(score, gameMode = null) {
        submitScoreToLeaderboardImpl(this, score, gameMode);
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

        // Cycle 59: clear the counting round controller.
        this.countingState = null;
        this.countingCurve = null;

        // Reset competitive mode data
        this.gameMode = 'solo';
        this.competitiveGates = [];
        this.playerScores = {};
        this.currentPlayerId = null;
    }
}
