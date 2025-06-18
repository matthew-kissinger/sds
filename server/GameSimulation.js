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
    createCompetitiveGameState
} from './shared/index.js';

export class GameSimulation {
    constructor(room) {
        this.room = room;
        this.isRunning = false;
        this.tickRate = 60; // 60 FPS server simulation
        this.deltaTime = 1 / this.tickRate;
        this.lastTickTime = 0;
        this.tickInterval = null;
        
        // Determine if this is competitive mode
        this.isCompetitive = room.gameMode === 'competitive';
        const playerIds = Array.from(room.players.keys());
        
        // Initialize game state based on mode
        if (this.isCompetitive) {
            console.log(`🏆 Initializing competitive game for ${playerIds.length} players`);
            this.gameState = createCompetitiveGameState({
                totalSheep: 200,
                bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }
            }, playerIds);
        } else {
            // Use cooperative mode (existing logic)
            this.gameState = createGameState({
                totalSheep: 200, // Full sheep count for multiplayer
                bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 } // Match client field size
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
        
        console.log(`🎮 Game simulation initialized for room ${room.roomCode} in ${this.isCompetitive ? 'competitive' : 'cooperative'} mode`);
    }

    initializeSimulation() {
        // Create initial sheep positions with competitive balance if needed
        const sheepSpawnConfig = {
            spreadRadius: 25,
            centerX: -20,
            centerZ: -20
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
            // Skip sheep that are grazing
            if (sheep.state === 2) {
                this.updateGrazingSheep(sheep);
                continue;
            }

            // Handle retiring sheep (seeking pasture)
            if (sheep.isRetiring) {
                if (sheep.retirementTarget) {
                    // Seek retirement target in pasture
                    const desired = sheep.retirementTarget.clone().subtract(sheep.position);
                    desired.normalize();
                    desired.multiply(this.sheepConfig.maxSpeed * 0.5); // Slower when retiring
                    
                    const steer = desired.subtract(sheep.velocity);
                    steer.limit(this.sheepConfig.maxForce * 0.5);
                    sheep.acceleration.add(steer);
                    
                    // Check if reached target to transition to grazing
                    const distanceToTarget = sheep.position.distanceTo(sheep.retirementTarget);
                    if (distanceToTarget < 2) {
                        sheep.retirementTarget = null;
                        sheep.state = 2; // Set to grazing state
                    }
                }
                
                // Apply pasture containment forces
                this.applyPastureContainment(sheep);
                
                // Skip main flock behavior for retiring sheep
                this.updateSheepMovementClientStyle(sheep);
                continue;
            }

            // Get neighboring sheep for flocking (only for active sheep)
            const neighbors = getNeighbors(sheep, this.gameState.sheep, this.sheepConfig.perceptionRadius);
            
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

            // Boundary avoidance (handle competitive vs cooperative mode)
            let boundaryForce;
            if (this.isCompetitive && this.gameState.competitiveGates) {
                // Use multiple gates boundary avoidance for competitive mode
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

            // Update movement using client-style frame-based physics (no deltaTime)
            // This matches the memory note about sheep using frame-based physics
            this.updateSheepMovementClientStyle(sheep);

            // Apply hard boundary constraints (except in gate area)
            if (!sheep.hasPassedGate) {
                let constrainedPosition;
                if (this.isCompetitive && this.gameState.competitiveGates) {
                    // Use multiple gates boundary constraints for competitive mode
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
            }

            // Update facing direction for animation
            if (sheep.velocity.magnitude() > 0.001) {
                sheep.facingDirection = sheep.velocity.angle();
            }

            // Validate entity state
            validateEntityState(sheep, new Vector2D(-20, -20));
        }

        // Check for sheep retirement
        if (this.isCompetitive) {
            // Use competitive retirement logic
            const retirementResult = updateCompetitiveSheepRetirements(
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
        // Frame-based physics like client Boid.js (no deltaTime multiplication)
        // This ensures consistent movement speed between client and server
        
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
            // Frame-based position update (no deltaTime)
            sheep.position.add(sheep.velocity);
        } else {
            // Stop micro-movements
            sheep.velocity.multiply(0);
        }
        
        // Reset acceleration for next frame
        sheep.acceleration.multiply(0);
    }

    updateGrazingSheep(sheep) {
        // Gentle grazing behavior
        sheep.animationPhase += this.deltaTime;
        
        // Occasional gentle movement
        if (Math.random() < 0.002) {
            const wanderDirection = Vector2D.random();
            wanderDirection.multiply(0.3);
            sheep.acceleration.add(wanderDirection);
        }

        // Stay within pasture bounds
        this.applyPastureContainment(sheep);

        // Gentle movement update (still time-based for grazing)
        updateMovement(sheep, this.deltaTime, {
            maxSpeed: 0.03,
            dampingFactor: 0.95,
            velocitySmoothing: 0.9
        });
    }

    applyPastureContainment(sheep) {
        // Keep sheep within pasture bounds
        const pastureMargin = 2;
        const steer = new Vector2D(0, 0);
        
        let targetPasture;
        
        if (this.isCompetitive && this.gameState.competitiveGates && sheep.assignedGate !== null) {
            // Find the pasture for the assigned gate in competitive mode
            const assignedGate = this.gameState.competitiveGates.find(gate => gate.id === sheep.assignedGate);
            targetPasture = assignedGate ? assignedGate.pasture : this.gameState.competitiveGates[0].pasture;
        } else if (this.isCompetitive && this.gameState.competitiveGates) {
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
        
        if (sheep.position.x < targetPasture.minX + pastureMargin) {
            steer.x = 0.01;
        } else if (sheep.position.x > targetPasture.maxX - pastureMargin) {
            steer.x = -0.01;
        }
        
        if (sheep.position.z < targetPasture.minZ + pastureMargin) {
            steer.z = 0.01;
        } else if (sheep.position.z > targetPasture.maxZ - pastureMargin) {
            steer.z = -0.01;
        }
        
        if (steer.magnitude() > 0) {
            sheep.acceleration.add(steer);
        }
    }

    shouldSeekGate(sheep) {
        // Check if any sheepdog is nearby and sheep should be attracted to gate
        for (const sheepdog of this.sheepdogs.values()) {
            // For competitive mode, find the closest gate
            if (this.isCompetitive && this.gameState.competitiveGates) {
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
        
        if (this.isCompetitive && this.gameState.competitiveGates) {
            // Find the closest gate for competitive mode
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
        
        if (this.isCompetitive) {
            // Check competitive completion conditions
            const playerCount = Object.keys(this.gameState.playerScores).length;
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
                    competitive: {
                        winner: completionResult.winner,
                        winType: completionResult.winType,
                        finalScores: completionResult.finalScores,
                        playerRankings: this.calculatePlayerRankings(completionResult.finalScores),
                        winCondition: this.calculateWinProgress(),
                        playerCount: Object.keys(this.gameState.playerScores).length
                    },
                    totalSheep: this.gameState.totalSheep,
                    gameCompleted: true
                };
                
                console.log(`🏆 Competitive game completed! Winner: ${completionResult.winner} (${completionResult.winType})`);
                
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
                    this.isCompetitive ? 
                    `Winner: ${this.completionData.competitive.winner} (${this.completionData.competitive.winType})` : 
                    `${this.completionData.sheepRetired}/${this.completionData.totalSheep} sheep retired`);
        
        // Broadcast completion event to all players in the room using server
        if (this.room.server) {
            this.room.server.broadcastToRoom(this.room.roomCode, 'gameComplete', this.completionData);
        }
        
        // Stop the simulation after a short delay to allow final state broadcast
        setTimeout(() => {
            this.stop();
            
            // Finish the room (changes room state to 'finished')
            this.room.finishGame();
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
        
        // Add competitive mode data if applicable
        if (this.isCompetitive) {
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
            .map(([playerId, score]) => ({
                playerId,
                score,
                playerName: this.room.getPlayer(playerId)?.name || `Player ${playerId}`
            }))
            .sort((a, b) => b.score - a.score) // Sort by score descending
            .map((player, index) => ({
                ...player,
                rank: index + 1,
                medal: index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : ''
            }));
    }
} 