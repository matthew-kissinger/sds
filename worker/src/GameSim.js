/**
 * Authoritative Game Simulation for Multiplayer Sheepdog
 * Uses shared simulation logic to ensure consistency across all clients
 */

// Import shared simulation logic
import {
    Vector2D,
    calculateFlockingForce,
    calculateFlee,
    getNeighbors,
    updateMovement,
    applyAcceleration,
    updateStamina,
    calculateBoundaryAvoidanceWithGate,
    calculateBoundaryAvoidanceWithMultipleGates,
    applyHardBoundaryConstraints,
    applyHardBoundaryConstraintsWithMultipleGates,
    updateSheepRetirements,
    checkGameCompletion,
    validateEntityState,
    generateInitialSheepPositions,
    createGameState,
    createBoidConfig,
    createMovementConfig,
    generateCompetitiveGateLayout,
    assignGatesToPlayers,
    updateCompetitiveSheepRetirements,
    checkCompetitiveCompletion,
    createCompetitiveGameState,
    checkGatePassage,
    loadScene,
    DEFAULT_SCENE_ID
} from '../../shared/index.js';

export class GameSimulation {
    constructor(room) {
        this.room = room;
        this.isRunning = false;
        this.tickRate = 60; // 60 FPS server simulation
        this.deltaTime = 1 / this.tickRate;
        this.lastTickTime = 0;
        this.tickInterval = null;
        
        // Determine game mode
        this.isCompetitive = room.gameMode === 'competitive';
        this.isTimedMode = room.gameMode === 'timed';
        const playerIds = Array.from(room.players.keys());

        // Load scene (biome data). Room can override via `room.sceneId`; falls back to default.
        this.scene = loadScene(room.sceneId || DEFAULT_SCENE_ID);
        
        // Timed mode specific properties
        if (this.isTimedMode) {
            this.gameStartTime = null;
            this.gameDuration = 3 * 60 * 1000; // 3 minutes in ms
            this.sheepRemovalQueue = []; // Track sheep to remove after 5s
            this.nextSheepId = 200; // For generating new sheep IDs
        }
        
        // Initialize game state based on mode
        if (this.isCompetitive || this.isTimedMode) {
            const modeEmoji = this.isTimedMode ? '⏱️' : '🏆';
            const modeName = this.isTimedMode ? 'timed' : 'competitive';
            console.log(`${modeEmoji} Initializing ${modeName} game for ${playerIds.length} players`);
            this.gameState = createCompetitiveGameState({
                totalSheep: this.scene.sheepSpawn.count,
                bounds: this.scene.bounds
            }, playerIds);
        } else {
            // Use cooperative mode (existing logic)
            this.gameState = createGameState({
                sceneId: this.scene.id,
                totalSheep: this.scene.sheepSpawn.count,
                bounds: this.scene.bounds
            });
        }
        
        // Configuration for entities (2x faster for multiplayer)
        this.sheepConfig = createBoidConfig({
            maxSpeed: 0.24,
            maxForce: 0.05,
            perceptionRadius: 6,
            separationDistance: 2.5
        });
        
        this.dogConfigs = new Map(); // playerId -> movement config
        
        // Game state broadcasting
        this.lastGameState = null;
        this.completionData = null;
        this.completionBroadcast = false;
        
        // Initialize simulation state
        this.initializeSimulation();
        
        const modeName = this.isTimedMode ? 'timed' : (this.isCompetitive ? 'competitive' : 'cooperative');
        console.log(`🎮 Game simulation initialized for room ${room.roomCode} in ${modeName} mode`);
    }

    initializeSimulation() {
        // Create initial sheep positions with competitive balance if needed
        const sheepSpawnConfig = {
            spreadRadius: this.scene.sheepSpawn.spreadRadius,
            centerX: this.scene.sheepSpawn.centerX,
            centerZ: this.scene.sheepSpawn.centerZ
        };
        
        // For competitive mode, use balanced spawning
        if (this.isCompetitive) {
            sheepSpawnConfig.competitiveMode = true;
            sheepSpawnConfig.competitiveGates = this.gameState.competitiveGates;
            sheepSpawnConfig.minDistanceFromGates = 35;
            console.log(`🏆 Using competitive balanced spawning for ${this.gameState.competitiveGates.length} players`);
        }
        
        const sheepPositions = generateInitialSheepPositions(
            this.gameState.totalSheep,
            this.gameState.bounds,
            sheepSpawnConfig
        );

        // Initialize sheep entities
        this.gameState.sheep = [];
        for (let i = 0; i < this.gameState.totalSheep; i++) {
            const position = sheepPositions[i];
            const sheep = {
                id: i,
                position: position.clone(),
                velocity: new Vector2D(0, 0),
                acceleration: new Vector2D(0, 0),
                
                // Sheep-specific properties
                hasPassedGate: false,
                isRetiring: false,
                retirementTarget: null,
                state: 0, // 0: active, 1: retiring, 2: grazing
                fleeRadius: 8,
                gateAttraction: 0.5,
                
                // Competitive mode support
                assignedGate: null, // Track which gate the sheep went through
                
                // Animation properties for client sync
                animationPhase: Math.random() * Math.PI * 2,
                facingDirection: Math.random() * Math.PI * 2
            };
            
            this.gameState.sheep.push(sheep);
        }

        // Initialize sheepdog entities for each player
        this.sheepdogs = new Map(); // playerId -> sheepdog entity
        const playerIds = Array.from(this.room.players.keys());
        
        playerIds.forEach((playerId, index) => {
            // Position dogs in different starting locations
            const angle = (index / playerIds.length) * Math.PI * 2;
            const radius = 15;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            // Get dog type from room player data
            const playerInfo = this.room.getPlayer(playerId);
            const dogType = playerInfo ? playerInfo.dogType : 'jep';

            const sheepdog = {
                id: playerId,
                dogType: dogType, // Store the player's selected dog type
                position: new Vector2D(x, z),
                velocity: new Vector2D(0, 0),
                acceleration: new Vector2D(0, 0),
                
                // Sheepdog properties (2x faster for multiplayer)
                maxSpeed: 30,
                sprintSpeed: 50,
                maxStamina: 100,
                stamina: 100,
                isSprinting: false,
                
                // Add rotation tracking
                rotation: 0,
                targetRotation: 0,
                
                // Player input tracking
                inputSequence: 0,
                lastInputTime: 0,
                pendingInputs: []
            };

            this.sheepdogs.set(playerId, sheepdog);
            
            // Create movement config for this dog (2x faster for multiplayer)
            this.dogConfigs.set(playerId, createMovementConfig({
                maxSpeed: sheepdog.maxSpeed, // Already 2x (30)
                acceleration: 80, // 2x acceleration for responsiveness
                deceleration: 100  // 2x deceleration for snappier stops
            }));
        });

        // Set game as active
        this.gameState.gameActive = true;
        console.log(`🐑 Initialized ${this.gameState.totalSheep} sheep and ${this.sheepdogs.size} sheepdogs`);
    }

    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.lastTickTime = Date.now();
        
        // Start game timer for timed mode
        if (this.isTimedMode) {
            this.gameStartTime = Date.now();
        }
        
        // Start the simulation loop
        this.tickInterval = setInterval(() => {
            this.tick();
        }, 1000 / this.tickRate);
        
        console.log(`🚀 Game simulation started for room ${this.room.roomCode} at ${this.tickRate} FPS`);
    }

    stop() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
        
        console.log(`⏹️ Game simulation stopped for room ${this.room.roomCode}`);
    }

    tick() {
        if (!this.isRunning) return;
        
        const currentTime = Date.now();
        
        // Process player inputs
        this.processPlayerInputs();
        
        // Update sheepdog physics
        this.updateSheepdogs();
        
        // Update sheep behavior and movement
        this.updateSheep();
        
        // Update timed mode specific logic
        if (this.isTimedMode) {
            this.updateTimedMode(currentTime);
        }
        
        // Check game completion
        this.checkGameCompletion();
        
        // Broadcast state to all clients in room
        this.broadcastGameState();
        
        this.lastTickTime = currentTime;
    }

    processPlayerInputs() {
        for (const [playerId, sheepdog] of this.sheepdogs.entries()) {
            // Process any pending inputs for this player
            while (sheepdog.pendingInputs.length > 0) {
                const input = sheepdog.pendingInputs.shift();
                this.applyPlayerInput(playerId, input);
            }
        }
    }

    applyPlayerInput(playerId, input) {
        const sheepdog = this.sheepdogs.get(playerId);
        if (!sheepdog) return;

        const { direction, sprint, inputSequence, timestamp, clientPosition } = input;
        
        // Validate input sequence to prevent old/duplicate inputs
        if (inputSequence <= sheepdog.inputSequence) {
            return; // Ignore old input
        }
        
        sheepdog.inputSequence = inputSequence;
        sheepdog.lastInputTime = timestamp;

        // Apply movement input
        const targetVelocity = new Vector2D(direction.x, direction.z);
        const currentMaxSpeed = sprint && sheepdog.stamina > 10 ? sheepdog.sprintSpeed : sheepdog.maxSpeed;
        
        if (targetVelocity.magnitude() > 0) {
            targetVelocity.normalize().multiply(currentMaxSpeed);
        }

        // Handle client-sent stopping position for smooth reconciliation
        if (clientPosition && targetVelocity.magnitude() === 0) {
            const dx = clientPosition.x - sheepdog.position.x;
            const dz = clientPosition.z - sheepdog.position.z;
            if (dx * dx + dz * dz > 25) {
                console.warn(`[CHEAT] clientPosition ignored for ${playerId}: delta=${Math.sqrt(dx*dx+dz*dz).toFixed(2)}`);
                return;
            }
            // Client is stopping and sent their final position
            // Set up interpolation target instead of normal physics
            sheepdog.clientStopTarget = new Vector2D(clientPosition.x, clientPosition.z);
            sheepdog.isInterpolatingToClient = true;
            
            // Immediately stop velocity to prevent further movement
            sheepdog.velocity.multiply(0);
            sheepdog.acceleration.multiply(0);
        } else {
            // Normal movement - clear any client interpolation
            sheepdog.clientStopTarget = null;
            sheepdog.isInterpolatingToClient = false;
            
            // Apply normal acceleration
            const config = this.dogConfigs.get(playerId);
            applyAcceleration(sheepdog, targetVelocity, this.deltaTime, config);
        }
        
        // Update stamina
        const staminaResult = updateStamina(sheepdog, sprint, this.deltaTime, {
            maxStamina: sheepdog.maxStamina,
            drainRate: 35,
            regenRate: 25,
            minStaminaToConsume: 10
        });
        
        sheepdog.stamina = staminaResult.current;
        sheepdog.isSprinting = staminaResult.isConsuming;
    }

    updateSheepdogs() {
        for (const [playerId, sheepdog] of this.sheepdogs.entries()) {
            // Use time-based movement for sheepdogs (like client)
            this.updateSheepdogMovementTimeStyle(sheepdog);

            // Update rotation based on movement direction
            if (sheepdog.velocity.magnitude() > 0.1) {
                sheepdog.targetRotation = -sheepdog.velocity.angle() + Math.PI / 2;
            }
            
            // Smooth rotation interpolation (similar to client)
            let rotationDiff = sheepdog.targetRotation - sheepdog.rotation;
            while (rotationDiff > Math.PI) rotationDiff -= 2 * Math.PI;
            while (rotationDiff < -Math.PI) rotationDiff += 2 * Math.PI;
            
            const rotationSpeed = 8; // Match client rotation speed
            sheepdog.rotation += rotationDiff * rotationSpeed * this.deltaTime;

            // Apply boundary constraints
            const constrainedPosition = applyHardBoundaryConstraints(
                sheepdog,
                this.gameState.bounds,
                null,
                { margin: 1 }
            );
            
            sheepdog.position = constrainedPosition;
            
            // Validate state to prevent NaN/Infinity
            validateEntityState(sheepdog, new Vector2D(0, 0));
        }
    }

    updateSheepdogMovementTimeStyle(sheepdog) {
        // Handle interpolation to client stopping position
        if (sheepdog.isInterpolatingToClient && sheepdog.clientStopTarget) {
            // Calculate distance to client target
            const targetPos = sheepdog.clientStopTarget;
            const currentPos = sheepdog.position;
            const distance = Math.sqrt(
                (targetPos.x - currentPos.x) ** 2 + 
                (targetPos.z - currentPos.z) ** 2
            );
            
            // If close enough, snap to target and stop interpolating
            if (distance < 0.05) {
                sheepdog.position.x = targetPos.x;
                sheepdog.position.z = targetPos.z;
                sheepdog.velocity.multiply(0);
                sheepdog.isInterpolatingToClient = false;
                sheepdog.clientStopTarget = null;
            } else {
                // Interpolate toward client position with high speed
                const interpolationSpeed = 8.0; // Fast interpolation
                const interpolationFactor = Math.min(interpolationSpeed * this.deltaTime, 0.8);
                
                sheepdog.position.x += (targetPos.x - currentPos.x) * interpolationFactor;
                sheepdog.position.z += (targetPos.z - currentPos.z) * interpolationFactor;
                sheepdog.velocity.multiply(0); // Keep velocity at zero during interpolation
            }
            
            // Reset acceleration during interpolation
            sheepdog.acceleration.multiply(0);
            return;
        }
        
        // Normal time-based physics when not interpolating to client
        const maxSpeed = sheepdog.isSprinting ? sheepdog.sprintSpeed : sheepdog.maxSpeed;
        const dampingFactor = 0.85; // More aggressive damping for snappier stops
        const velocitySmoothing = 0.6; // Less smoothing for more responsive movement
        const minMovementThreshold = 0.1; // Higher threshold for quicker stops
        
        // Store previous velocity for smoothing
        const previousVelocity = sheepdog.velocity.clone();
        
        // Update velocity with acceleration
        sheepdog.velocity.add(sheepdog.acceleration);
        sheepdog.velocity.limit(maxSpeed);
        
        // Apply velocity damping to reduce oscillations
        sheepdog.velocity.multiply(dampingFactor);
        
        // Smooth velocity with previous velocity to reduce jittering
        const smoothedVelocity = previousVelocity
            .multiply(velocitySmoothing)
            .add(sheepdog.velocity.clone().multiply(1 - velocitySmoothing));
        
        // Only apply movement if above threshold to prevent micro-movements
        if (smoothedVelocity.magnitude() > minMovementThreshold) {
            sheepdog.velocity = smoothedVelocity;
            // TIME-BASED position update (WITH deltaTime) - matches client
            sheepdog.position.add(sheepdog.velocity.clone().multiply(this.deltaTime));
        } else {
            // Stop micro-movements
            sheepdog.velocity.multiply(0);
        }
        
        // Reset acceleration for next frame
        sheepdog.acceleration.multiply(0);
    }

    updateSheep() {
        // Update each sheep using shared flocking logic
        for (let sheep of this.gameState.sheep) {
            // Skip sheep that are retiring or grazing (client handles these)
            if (sheep.state === 1 || sheep.state === 2) {
                // Just clear physics to prevent interference
                sheep.velocity.set(0, 0);
                sheep.acceleration.set(0, 0);
                continue;
            }


            // Get neighboring sheep for flocking (only consider active sheep)
            const activeSheep = this.gameState.sheep.filter(s => s.state === 0);
            const neighbors = getNeighbors(sheep, activeSheep, this.sheepConfig.perceptionRadius);
            
            // Apply flocking behavior
            const flockingForce = calculateFlockingForce(sheep, neighbors, this.sheepConfig);
            sheep.acceleration.add(flockingForce);

            // Apply flee behavior from all sheepdogs
            for (const sheepdog of this.sheepdogs.values()) {
                const fleeForce = calculateFlee(
                    sheep,
                    sheepdog.position,
                    sheep.fleeRadius,
                    this.sheepConfig.maxSpeed,
                    this.sheepConfig.maxForce
                );
                
                if (fleeForce.magnitude() > 0) {
                    fleeForce.multiply(1.2); // Stronger flee response
                    sheep.acceleration.add(fleeForce);
                }
            }

            // Gate attraction logic (if sheep is being herded toward gate)
            if (this.shouldSeekGate(sheep)) {
                const gateForce = this.calculateGateAttraction(sheep);
                sheep.acceleration.add(gateForce);
            }

            // Boundary avoidance (skip for sheep actively passing through gates)
            // Check if sheep is in a gate passage zone
            let inGatePassageZone = false;
            if ((this.isCompetitive || this.isTimedMode) && this.gameState.competitiveGates) {
                for (const gate of this.gameState.competitiveGates) {
                    if (sheep.position.x >= gate.passageZone.minX && 
                        sheep.position.x <= gate.passageZone.maxX &&
                        sheep.position.z >= gate.passageZone.minZ && 
                        sheep.position.z <= gate.passageZone.maxZ) {
                        inGatePassageZone = true;
                        break;
                    }
                }
            } else if (this.gameState.gate && this.gameState.gate.passageZone) {
                const zone = this.gameState.gate.passageZone;
                inGatePassageZone = sheep.position.x >= zone.minX && 
                                  sheep.position.x <= zone.maxX &&
                                  sheep.position.z >= zone.minZ && 
                                  sheep.position.z <= zone.maxZ;
            }
            
            // Only apply boundary forces if not in gate passage zone
            if (!inGatePassageZone) {
                let boundaryForce;
                if ((this.isCompetitive || this.isTimedMode) && this.gameState.competitiveGates) {
                    // Use multiple gates boundary avoidance for competitive/timed mode
                    boundaryForce = calculateBoundaryAvoidanceWithMultipleGates(
                        sheep,
                        this.gameState.bounds,
                        this.gameState.competitiveGates,
                        {
                            margin: 4,
                            maxSpeed: this.sheepConfig.maxSpeed,
                            maxForce: this.sheepConfig.maxForce
                        }
                    );
                } else {
                    // Use single gate boundary avoidance for cooperative mode
                    boundaryForce = calculateBoundaryAvoidanceWithGate(
                        sheep,
                        this.gameState.bounds,
                        this.gameState.gate,
                        {
                            margin: 4,
                            maxSpeed: this.sheepConfig.maxSpeed,
                            maxForce: this.sheepConfig.maxForce
                        }
                    );
                }
                sheep.acceleration.add(boundaryForce);
            }

            // Update movement using time-based physics calibrated to 144 FPS
            // This ensures consistent movement speed with client at all frame rates
            this.updateSheepMovementClientStyle(sheep);

            // Apply hard boundary constraints (except for retiring sheep)
            if (!sheep.hasPassedGate && !sheep.isRetiring) {
                let constrainedPosition;
                if ((this.isCompetitive || this.isTimedMode) && this.gameState.competitiveGates) {
                    // Use multiple gates boundary constraints for competitive/timed mode
                    constrainedPosition = applyHardBoundaryConstraintsWithMultipleGates(
                        sheep,
                        this.gameState.bounds,
                        this.gameState.competitiveGates,
                        { margin: 0.5, allowGatePassage: true }
                    );
                } else {
                    // Use single gate boundary constraints for cooperative mode
                    constrainedPosition = applyHardBoundaryConstraints(
                        sheep,
                        this.gameState.bounds,
                        this.gameState.gate,
                        { margin: 0.5, allowGatePassage: true }
                    );
                }
                sheep.position = constrainedPosition;
            } else if (sheep.isRetiring && sheep.retirementTarget) {
                // For retiring sheep, only apply loose constraints to keep them in extended bounds
                const extendedBounds = {
                    minX: this.gameState.bounds.minX - 35,
                    maxX: this.gameState.bounds.maxX + 35,
                    minZ: this.gameState.bounds.minZ - 35,
                    maxZ: this.gameState.bounds.maxZ + 35
                };
                sheep.position.x = Math.max(extendedBounds.minX, Math.min(extendedBounds.maxX, sheep.position.x));
                sheep.position.z = Math.max(extendedBounds.minZ, Math.min(extendedBounds.maxZ, sheep.position.z));
            }

            // Update facing direction for animation
            if (sheep.velocity.magnitude() > 0.001) {
                sheep.facingDirection = sheep.velocity.angle();
            }

            // Validate entity state
            validateEntityState(sheep, new Vector2D(-20, -20));
        }

        // Check for sheep retirement
        if (this.isCompetitive || this.isTimedMode) {
            // Use competitive retirement logic (also for timed mode)
            const retirementResult = this.isTimedMode ? 
                this.updateTimedSheepRetirements(
                    this.gameState.sheep,
                    this.gameState.competitiveGates
                ) :
                updateCompetitiveSheepRetirements(
                    this.gameState.sheep,
                    this.gameState.competitiveGates
                );
            
            // Update player scores
            for (const [playerId, newRetirements] of Object.entries(retirementResult.playerRetirements)) {
                if (this.gameState.playerScores.hasOwnProperty(playerId)) {
                    this.gameState.playerScores[playerId] += newRetirements;
                }
            }
            
            this.gameState.sheepRetired = retirementResult.totalRetired;
        } else {
            // Use cooperative retirement logic
            const retirementResult = updateSheepRetirements(
                this.gameState.sheep,
                this.gameState.gate,
                this.gameState.pasture
            );
            
            this.gameState.sheepRetired = retirementResult.totalRetired;
        }
    }

    updateSheepMovementClientStyle(sheep) {
        // Time-based physics calibrated to 144 FPS baseline
        // This matches client behavior and ensures consistent speed
        
        const maxSpeed = this.sheepConfig.maxSpeed;
        const dampingFactor = 0.98;
        const velocitySmoothing = 0.85;
        const minMovementThreshold = 0.001;
        
        // Store previous velocity for smoothing
        const previousVelocity = sheep.velocity.clone();
        
        // Update velocity with acceleration
        sheep.velocity.add(sheep.acceleration);
        sheep.velocity.limit(maxSpeed);
        
        // Apply velocity damping to reduce oscillations
        sheep.velocity.multiply(dampingFactor);
        
        // Smooth velocity with previous velocity to reduce jittering
        const smoothedVelocity = previousVelocity
            .multiply(velocitySmoothing)
            .add(sheep.velocity.clone().multiply(1 - velocitySmoothing));
        
        // Only apply movement if above threshold to prevent micro-movements
        if (smoothedVelocity.magnitude() > minMovementThreshold) {
            sheep.velocity = smoothedVelocity;
            // Time-based position update calibrated to 60 FPS baseline (server tick rate)
            sheep.position.add(sheep.velocity.clone().multiply(this.deltaTime * 60));
        } else {
            // Stop micro-movements
            sheep.velocity.multiply(0);
        }
        
        // Reset acceleration for next frame
        sheep.acceleration.multiply(0);
    }

    updateGrazingSheep(sheep) {
        // Server doesn't update grazing sheep - client handles it entirely
        // Just clear physics to prevent any interference
        sheep.velocity.set(0, 0);
        sheep.acceleration.set(0, 0);
        // That's it - no position updates, no movement, nothing
    }

    applyPastureContainment(sheep) {
        // Keep sheep within pasture bounds
        const pastureMargin = 2;
        const steer = new Vector2D(0, 0);
        
        let targetPasture;
        
        if ((this.isCompetitive || this.isTimedMode) && this.gameState.competitiveGates && sheep.assignedGate !== null) {
            // Find the pasture for the assigned gate in competitive/timed mode
            const assignedGate = this.gameState.competitiveGates.find(gate => gate.id === sheep.assignedGate);
            targetPasture = assignedGate ? assignedGate.pasture : this.gameState.competitiveGates[0].pasture;
        } else if ((this.isCompetitive || this.isTimedMode) && this.gameState.competitiveGates) {
            // If no assigned gate yet, use the closest pasture
            let closestPasture = this.gameState.competitiveGates[0].pasture;
            let closestDistance = Infinity;
            
            for (const gate of this.gameState.competitiveGates) {
                const centerX = (gate.pasture.minX + gate.pasture.maxX) / 2;
                const centerZ = (gate.pasture.minZ + gate.pasture.maxZ) / 2;
                const distance = Math.sqrt(
                    (sheep.position.x - centerX) ** 2 + 
                    (sheep.position.z - centerZ) ** 2
                );
                
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestPasture = gate.pasture;
                }
            }
            
            targetPasture = closestPasture;
        } else {
            // Use cooperative mode pasture
            targetPasture = this.gameState.pasture;
        }
        
        // Use distance-based forces for smoother boundaries
        const distToMinX = sheep.position.x - targetPasture.minX;
        const distToMaxX = targetPasture.maxX - sheep.position.x;
        const distToMinZ = sheep.position.z - targetPasture.minZ;
        const distToMaxZ = targetPasture.maxZ - sheep.position.z;
        
        if (distToMinX < pastureMargin) {
            steer.x = 0.02 * (1 - distToMinX / pastureMargin);
        } else if (distToMaxX < pastureMargin) {
            steer.x = -0.02 * (1 - distToMaxX / pastureMargin);
        }
        
        if (distToMinZ < pastureMargin) {
            steer.z = 0.02 * (1 - distToMinZ / pastureMargin);
        } else if (distToMaxZ < pastureMargin) {
            steer.z = -0.02 * (1 - distToMaxZ / pastureMargin);
        }
        
        if (steer.magnitude() > 0) {
            sheep.acceleration.add(steer);
        }
    }

    shouldSeekGate(sheep) {
        // Check if any sheepdog is nearby and sheep should be attracted to gate
        for (const sheepdog of this.sheepdogs.values()) {
            // For competitive/timed mode, find the closest gate
            if ((this.isCompetitive || this.isTimedMode) && this.gameState.competitiveGates) {
                let closestGate = null;
                let closestDistance = Infinity;
                
                for (const gate of this.gameState.competitiveGates) {
                    const distanceToGate = sheep.position.distanceTo(gate.position);
                    if (distanceToGate < closestDistance) {
                        closestDistance = distanceToGate;
                        closestGate = gate;
                    }
                }
                
                if (closestGate) {
                    const distanceToDog = sheep.position.distanceTo(sheepdog.position);
                    
                    if (distanceToDog < sheep.fleeRadius * 1.5 && closestDistance < 30) {
                        const toGate = closestGate.position.clone().subtract(sheep.position);
                        const toDog = sheepdog.position.clone().subtract(sheep.position);
                        
                        const dotProduct = toGate.x * toDog.x + toGate.z * toDog.z;
                        if (dotProduct < 0) { // Gate is opposite direction from dog
                            return true;
                        }
                    }
                }
            } else {
                // Cooperative mode - use single gate
                const distanceToGate = sheep.position.distanceTo(this.gameState.gate.position);
                const distanceToDog = sheep.position.distanceTo(sheepdog.position);
                
                if (distanceToDog < sheep.fleeRadius * 1.5 && distanceToGate < 30) {
                    const toGate = this.gameState.gate.position.clone().subtract(sheep.position);
                    const toDog = sheepdog.position.clone().subtract(sheep.position);
                    
                    const dotProduct = toGate.x * toDog.x + toGate.z * toDog.z;
                    if (dotProduct < 0) { // Gate is opposite direction from dog
                        return true;
                    }
                }
            }
        }
        return false;
    }

    calculateGateAttraction(sheep) {
        let targetGate;
        
        if ((this.isCompetitive || this.isTimedMode) && this.gameState.competitiveGates) {
            // Find the closest gate for competitive/timed mode
            let closestGate = null;
            let closestDistance = Infinity;
            
            for (const gate of this.gameState.competitiveGates) {
                const distanceToGate = sheep.position.distanceTo(gate.position);
                if (distanceToGate < closestDistance) {
                    closestDistance = distanceToGate;
                    closestGate = gate;
                }
            }
            
            targetGate = closestGate;
        } else {
            // Use single gate for cooperative mode
            targetGate = this.gameState.gate;
        }
        
        if (!targetGate) {
            return new Vector2D(0, 0);
        }
        
        const desired = targetGate.position.clone().subtract(sheep.position);
        desired.normalize();
        desired.multiply(this.sheepConfig.maxSpeed);
        
        const steer = desired.subtract(sheep.velocity);
        steer.limit(this.sheepConfig.maxForce);
        steer.multiply(sheep.gateAttraction);
        
        return steer;
    }

    checkGameCompletion() {
        if (this.gameState.gameCompleted) return;
        
        let completionResult;
        
        if (this.isCompetitive || this.isTimedMode) {
            // Check competitive/timed completion conditions
            const playerCount = Object.keys(this.gameState.playerScores).length;
            
            // For timed mode, only complete when timer expires
            if (this.isTimedMode) {
                // Timed mode only completes via timer in updateTimedMode
                return;
            }
            
            completionResult = checkCompetitiveCompletion(
                this.gameState.playerScores,
                playerCount,
                this.gameState.totalSheep
            );
            
            if (completionResult.isComplete) {
                this.gameState.gameCompleted = true;
                this.completionData = {
                    completedAt: Date.now(),
                    isCompetitive: true,
                    isTimedMode: this.isTimedMode,
                    competitive: {
                        winner: completionResult.winner,
                        winType: completionResult.winType,
                        finalScores: completionResult.finalScores,
                        playerRankings: this.calculatePlayerRankings(completionResult.finalScores),
                        winCondition: this.calculateWinProgress(),
                        playerCount: Object.keys(this.gameState.playerScores).length,
                        isComplete: true
                    },
                    totalSheep: this.gameState.totalSheep,
                    gameCompleted: true
                };
                
                const modeEmoji = this.isTimedMode ? '⏱️' : '🏆';
                console.log(`${modeEmoji} ${this.isTimedMode ? 'Timed' : 'Competitive'} game completed! Winner: ${completionResult.winner} (${completionResult.winType})`);
                
                // Broadcast completion immediately
                this.broadcastGameCompletion();
            }
        } else {
            // Check cooperative completion conditions
            completionResult = checkGameCompletion(
                this.gameState.sheep,
                this.gameState.totalSheep,
                this.gameState.gameActive
            );
            
            if (completionResult.isComplete) {
                this.gameState.gameCompleted = true;
                this.completionData = {
                    completedAt: Date.now(),
                    isCompetitive: false,
                    sheepRetired: this.gameState.sheepRetired,
                    totalSheep: this.gameState.totalSheep,
                    completionPercentage: completionResult.completionPercentage
                };
                
                console.log(`🎉 Cooperative game completed! All ${this.gameState.sheepRetired} sheep retired.`);
                
                // Broadcast completion immediately
                this.broadcastGameCompletion();
            }
        }
    }

    broadcastGameState() {
        // Create state snapshot for clients
        const gameStateSnapshot = this.createGameStateSnapshot();
        
        // Store last game state for external access
        this.lastGameState = gameStateSnapshot;
        
        // Broadcasting will be handled by the server through periodic polling
        // The server will call getLatestGameState() to get updates
    }

    broadcastGameCompletion() {
        if (!this.gameState.gameCompleted || this.completionBroadcast) return;
        
        this.completionBroadcast = true;
        
        console.log(`📡 Broadcasting game completion for room ${this.room.roomCode}:`, 
                    (this.isCompetitive || this.isTimedMode) ? 
                    `Winner: ${this.completionData.competitive.winner} (${this.completionData.competitive.winType})` : 
                    `${this.completionData.sheepRetired}/${this.completionData.totalSheep} sheep retired`);
        
        // Submit scores to leaderboard for multiplayer games. Delegated to the DO.
        if ((this.isCompetitive || this.isTimedMode) && this.room.onSubmitScores) {
            try { this.room.onSubmitScores(this.gameState.playerScores, this.completionData); }
            catch (e) { console.error('score submission error:', e); }
        }

        if (this.room.broadcastToRoom) {
            this.room.broadcastToRoom('gameComplete', this.completionData);
        }

        setTimeout(() => {
            this.stop();
            if (this.room.finishGame) this.room.finishGame();

            if (this.room.isPublic && this.room.broadcastToRoom) {
                if (!this.room.modeLocked) {
                    const modeCycle = { cooperative: 'competitive', competitive: 'timed', timed: 'cooperative' };
                    this.room.gameMode = modeCycle[this.room.gameMode] || 'cooperative';
                }
                this.room.state = 'waiting';
                this.room.simulation = null;
                this.room.lastActivity = Date.now();
                console.log(`Room ${this.room.roomCode} cycled to mode: ${this.room.gameMode}, state: waiting`);
                this.room.broadcastToRoom('roomUpdated', {
                    room: this.room.getSerializableState ? this.room.getSerializableState() : null,
                });
            }
        }, 1000);
    }

    // Get the latest game state for server broadcasting
    getLatestGameState() {
        return this.lastGameState;
    }

    // Get completion data if game is complete
    getCompletionData() {
        return this.completionData;
    }

    // Handle player input from network
    handlePlayerInput(playerId, inputData) {
        const sheepdog = this.sheepdogs.get(playerId);
        if (!sheepdog) return;

        // Add input to pending queue for processing on next tick
        sheepdog.pendingInputs.push({
            ...inputData,
            timestamp: Date.now()
        });
    }
    
    // Cleanup simulation resources
    cleanup() {
        this.stop();
        this.gameState = null;
        this.sheepdogs.clear();
        this.dogConfigs.clear();
        
        console.log(`🧹 Game simulation cleaned up for room ${this.room.roomCode}`);
    }

    // Get current simulation statistics
    getStats() {
        return {
            isRunning: this.isRunning,
            tickRate: this.tickRate,
            sheepCount: this.gameState.sheep.length,
            sheepRetired: this.gameState.sheepRetired,
            sheepdogCount: this.sheepdogs.size,
            gameCompleted: this.gameState.gameCompleted,
            roomCode: this.room.roomCode
        };
    }
    
    createGameStateSnapshot() {
        // Create a lightweight state snapshot for network transmission
        const snapshot = {
            timestamp: Date.now(),
            sheepRetired: this.gameState.sheepRetired,
            totalSheep: this.gameState.totalSheep,
            gameCompleted: this.gameState.gameCompleted,
            isCompetitive: this.isCompetitive,
            isTimedMode: this.isTimedMode,
            
            // Sheep positions and states (simplified for network efficiency)
            sheep: this.gameState.sheep.map(sheep => ({
                id: sheep.id,
                x: Math.round(sheep.position.x * 100) / 100, // Round to 2 decimal places
                z: Math.round(sheep.position.z * 100) / 100,
                vx: Math.round(sheep.velocity.x * 100) / 100,
                vz: Math.round(sheep.velocity.z * 100) / 100,
                state: sheep.state,
                facing: Math.round(sheep.facingDirection * 100) / 100,
                hasPassedGate: sheep.hasPassedGate,
                isRetiring: sheep.isRetiring,
                ...(sheep.assignedGate !== null && { assignedGate: sheep.assignedGate }), // Include assigned gate for competitive
                // Only send retirement target if it exists (to save bandwidth)
                ...(sheep.retirementTarget && {
                    targetX: Math.round(sheep.retirementTarget.x * 100) / 100,
                    targetZ: Math.round(sheep.retirementTarget.z * 100) / 100
                })
            })),
            
            // Sheepdog positions and states
            sheepdogs: Array.from(this.sheepdogs.entries()).map(([playerId, dog]) => ({
                playerId,
                dogType: dog.dogType || 'jep', // Include dog type for client rendering
                x: Math.round(dog.position.x * 100) / 100,
                z: Math.round(dog.position.z * 100) / 100,
                vx: Math.round(dog.velocity.x * 100) / 100,
                vz: Math.round(dog.velocity.z * 100) / 100,
                rotation: Math.round(dog.rotation * 100) / 100,
                stamina: Math.round(dog.stamina),
                sprinting: dog.isSprinting,
                sequence: dog.inputSequence,
                interpolatingToClient: dog.isInterpolatingToClient || false
            }))
        };
        
        // Add competitive/timed mode data if applicable
        if (this.isCompetitive || this.isTimedMode) {
            snapshot.competitive = {
                // Player gate assignments and scores
                playerScores: { ...this.gameState.playerScores },
                
                // Gate information with player assignments
                gates: this.gameState.competitiveGates.map(gate => ({
                    id: gate.id,
                    x: gate.position.x,
                    z: gate.position.z,
                    playerId: gate.playerId,
                    color: gate.color,
                    direction: gate.direction,
                    pasture: gate.pasture
                })),
                
                // Win condition progress
                winCondition: this.calculateWinProgress(),
                
                // Game mode info
                playerCount: Object.keys(this.gameState.playerScores).length,
                totalSheep: this.gameState.totalSheep
            };
            
            // Add timed mode specific data
            if (this.isTimedMode && this.gameStartTime) {
                const currentTime = Date.now();
                const elapsed = currentTime - this.gameStartTime;
                const remaining = Math.max(0, this.gameDuration - elapsed);
                
                snapshot.timedMode = {
                    timeRemaining: remaining,
                    gameDuration: this.gameDuration
                };
            }
        }
        
        return snapshot;
    }
    
    calculateWinProgress() {
        if (!this.isCompetitive) return null;
        
        const playerCount = Object.keys(this.gameState.playerScores).length;
        const scores = Object.values(this.gameState.playerScores);
        
        if (playerCount === 2) {
            // 2-player mode: race to 101
            const maxScore = Math.max(...scores);
            const winThreshold = 101;
            return {
                type: 'race',
                threshold: winThreshold,
                maxScore: maxScore,
                progress: maxScore / winThreshold,
                isComplete: maxScore >= winThreshold
            };
        } else {
            // 3-4 player mode: highest score when all sheep collected
            const totalCollected = scores.reduce((sum, score) => sum + score, 0);
            const maxScore = Math.max(...scores);
            return {
                type: 'highest_score',
                totalCollected: totalCollected,
                totalSheep: this.gameState.totalSheep,
                maxScore: maxScore,
                progress: totalCollected / this.gameState.totalSheep,
                isComplete: totalCollected >= this.gameState.totalSheep
            };
        }
    }
    
    calculatePlayerRankings(finalScores) {
        // Convert scores object to array with rankings
        return Object.entries(finalScores)
            .map(([playerId, score]) => {
                // DO-friendly lookup: the adapter exposes resolvePlayerName(playerId).
                let playerName = `Player ${playerId}`;
                if (this.room.resolvePlayerName) {
                    const resolved = this.room.resolvePlayerName(playerId);
                    if (resolved) playerName = resolved;
                }
                
                return {
                    playerId,
                    score,
                    playerName
                };
            })
            .sort((a, b) => b.score - a.score) // Sort by score descending
            .map((player, index) => ({
                ...player,
                rank: index + 1,
                medal: index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : ''
            }));
    }
    
    getPlayerRankings() {
        if (!this.isCompetitive && !this.isTimedMode) return [];
        
        return this.calculatePlayerRankings(this.gameState.playerScores);
    }
    
    updateTimedSheepRetirements(sheep, competitiveGates) {
        let totalRetired = 0;
        const playerRetirements = new Map();
        const currentTime = Date.now();
        
        // Initialize player retirement counts
        for (const gate of competitiveGates) {
            if (gate.playerId && !playerRetirements.has(gate.playerId)) {
                playerRetirements.set(gate.playerId, 0);
            }
        }
        
        for (let sheepEntity of sheep) {
            // Check if sheep just passed through any gate
            if (!sheepEntity.hasPassedGate && !sheepEntity.scheduledForRemoval) {
                for (const gate of competitiveGates) {
                    if (checkGatePassage(sheepEntity.position, sheepEntity.velocity, gate.passageZone, gate.direction)) {
                        sheepEntity.hasPassedGate = true;
                        sheepEntity.isRetiring = true;
                        sheepEntity.state = 1; // Set to retiring state
                        sheepEntity.assignedGate = gate.id;
                        
                        // In timed mode, schedule for removal
                        if (this.isTimedMode) {
                            sheepEntity.scheduledForRemoval = true;
                            sheepEntity.disappearTime = currentTime + 5000; // 5 seconds from now
                        }
                        
                        // Set retirement target in the appropriate pasture
                        const targetPasture = gate.pasture;
                        const margin = 3;
                        sheepEntity.retirementTarget = new Vector2D(
                            targetPasture.minX + margin + Math.random() * ((targetPasture.maxX - targetPasture.minX) - 2 * margin),
                            targetPasture.minZ + margin + Math.random() * ((targetPasture.maxZ - targetPasture.minZ) - 2 * margin)
                        );
                        
                        // Award point to the gate's player
                        if (gate.playerId && playerRetirements.has(gate.playerId)) {
                            playerRetirements.set(gate.playerId, playerRetirements.get(gate.playerId) + 1);
                        }
                        
                        // Add to removal queue
                        this.sheepRemovalQueue.push({
                            sheepId: sheepEntity.id,
                            removeTime: sheepEntity.disappearTime
                        });
                        
                        console.log(`🐑 Sheep ${sheepEntity.id} scheduled for removal in 5s (gate ${gate.id})`);
                        break;
                    }
                }
            }
            
            // Count all sheep that have passed gates
            if (sheepEntity.hasPassedGate) {
                totalRetired++;
            }
        }
        
        return {
            playerRetirements: Object.fromEntries(playerRetirements),
            totalRetired
        };
    }
    
    updateTimedMode(currentTime) {
        // Check if 3 minutes have elapsed
        if (this.gameStartTime && currentTime - this.gameStartTime >= this.gameDuration) {
            // Force game completion
            if (!this.gameState.gameCompleted) {
                this.gameState.gameCompleted = true;
                this.gameState.completionTime = this.gameDuration / 1000; // Convert to seconds
                
                // Find winner based on highest score
                const rankings = this.getPlayerRankings();
                if (rankings.length > 0) {
                    this.gameState.winner = rankings[0].playerId;
                    this.gameState.winType = 'timeout';
                    
                    // Set up completion data for broadcast
                    this.completionData = {
                        completedAt: Date.now(),
                        isCompetitive: this.isCompetitive,
                        isTimedMode: this.isTimedMode,
                        competitive: {
                            winner: rankings[0].playerId,
                            winType: 'timeout',
                            finalScores: { ...this.gameState.playerScores },
                            playerRankings: rankings,
                            winCondition: { 
                                type: 'timeout',
                                timeLimit: this.gameDuration / 1000,
                                message: '3 minute timer expired'
                            },
                            playerCount: Object.keys(this.gameState.playerScores).length,
                            isComplete: true
                        },
                        totalSheep: this.gameState.totalSheep,
                        gameCompleted: true
                    };
                    
                    console.log(`⏱️ Timed game completed for room ${this.room.roomCode} - Winner: ${rankings[0].playerName} with ${rankings[0].score} sheep`);
                    
                    // Broadcast completion immediately
                    this.broadcastGameCompletion();
                }
            }
        }
        
        // Process sheep removal queue
        const sheepToRemove = [];
        for (let i = this.sheepRemovalQueue.length - 1; i >= 0; i--) {
            const removal = this.sheepRemovalQueue[i];
            if (currentTime >= removal.removeTime) {
                sheepToRemove.push(removal.sheepId);
                this.sheepRemovalQueue.splice(i, 1);
            }
        }
        
        // Remove sheep and spawn replacements
        for (const sheepId of sheepToRemove) {
            const sheepIndex = this.gameState.sheep.findIndex(s => s.id === sheepId);
            if (sheepIndex !== -1) {
                // Remove the sheep
                const removedSheep = this.gameState.sheep[sheepIndex];
                
                // Create a new sheep at a random spawn location
                const spawnLocations = this.gameState.competitiveSpawnClusters || [{ x: -30, z: -30 }];
                const spawnLocation = spawnLocations[Math.floor(Math.random() * spawnLocations.length)];
                
                // Reuse the sheep object but reset its properties
                removedSheep.id = this.nextSheepId++;
                removedSheep.position.set(
                    spawnLocation.x + (Math.random() - 0.5) * 20,
                    spawnLocation.z + (Math.random() - 0.5) * 20
                );
                removedSheep.velocity.set(0, 0);
                removedSheep.acceleration.set(0, 0);
                removedSheep.hasPassedGate = false;
                removedSheep.isRetiring = false;
                removedSheep.state = 0;
                removedSheep.assignedGate = null;
                removedSheep.retirementTarget = null;
                removedSheep.disappearTime = null;
                removedSheep.scheduledForRemoval = false;
                
                console.log(`🔄 Respawned sheep ${removedSheep.id} at (${removedSheep.position.x.toFixed(1)}, ${removedSheep.position.z.toFixed(1)})`);
            }
        }
    }
}
