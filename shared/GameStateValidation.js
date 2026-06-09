// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Vector2D } from './Vector2D.js';
import { isWithinArea, checkGatePassage } from './BoundaryCollision.js';

/**
 * Pure game state validation functions
 * Stateless and deterministic - no external dependencies
 */

/**
 * Validate and update sheep retirement status for corral-based scenes
 * (Cycle 5+: Rolling Hills). Sheep are retired when they enter a circular
 * corral zone instead of crossing a rectangular gate.
 *
 * @param {Array} sheep - Array of sheep entities
 * @param {Object} corral - Corral configuration {center: {x, z}, radius}
 * @param {() => number} [rng=Math.random] - PRNG returning [0,1). Defaults to
 *   the global Math.random so existing callers (and the client, which never
 *   passes this) stay byte-identical. The Worker passes a per-game seeded
 *   mulberry32 so retirement placement is reproducible for replay.
 * @returns {Object} - Retirement status {newRetirements, totalRetired}
 */
export function updateSheepCorralRetirements(sheep, corral, rng = Math.random) {
    let newRetirements = 0;
    let totalRetired = 0;

    const cx = corral.center.x;
    const cz = corral.center.z;
    const r = corral.radius;
    const rSq = r * r;

    for (let sheepEntity of sheep) {
        if (!sheepEntity.hasPassedGate && !sheepEntity.isRetiring) {
            const dx = sheepEntity.position.x - cx;
            const dz = sheepEntity.position.z - cz;
            if (dx * dx + dz * dz <= rSq) {
                sheepEntity.hasPassedGate = true;  // reuse flag to keep counters working
                sheepEntity.isRetiring = true;
                // Retirement target: random point inside the corral with margin
                const margin = 1;
                const usableR = Math.max(0, r - margin);
                const angle = rng() * Math.PI * 2;
                const dist = Math.sqrt(rng()) * usableR;
                sheepEntity.retirementTarget = new Vector2D(
                    cx + Math.cos(angle) * dist,
                    cz + Math.sin(angle) * dist
                );
                newRetirements++;
            }
        }

        // Reach retirement target → graze
        if (sheepEntity.isRetiring && sheepEntity.retirementTarget) {
            const distanceToTarget = sheepEntity.position.distanceTo(sheepEntity.retirementTarget);
            if (distanceToTarget < 1.5) {
                sheepEntity.retirementTarget = null;
                sheepEntity.state = 2;
                sheepEntity.velocity.set(0, 0);
                sheepEntity.acceleration.set(0, 0);
            }
        }

        if (sheepEntity.hasPassedGate || sheepEntity.isRetiring) {
            totalRetired++;
        }
    }

    return { newRetirements, totalRetired };
}

/**
 * Validate and update sheep retirement status
 * @param {Array} sheep - Array of sheep entities
 * @param {Object} gate - Gate configuration
 * @param {Object} pasture - Pasture configuration
 * @param {() => number} [rng=Math.random] - PRNG returning [0,1). Defaults to
 *   Math.random for byte-identical legacy behavior; the Worker passes a
 *   per-game seeded mulberry32 (see updateSheepCorralRetirements).
 * @returns {Object} - Retirement status {newRetirements, totalRetired}
 */
export function updateSheepRetirements(sheep, gate, pasture, rng = Math.random) {
    let newRetirements = 0;
    let totalRetired = 0;
    
    for (let sheepEntity of sheep) {
        // Check if sheep just passed through the gate
        if (!sheepEntity.hasPassedGate && !sheepEntity.isRetiring) {
            if (checkGatePassage(sheepEntity.position, sheepEntity.velocity, gate.passageZone, 'north')) {
                sheepEntity.hasPassedGate = true;
                sheepEntity.isRetiring = true;
                
                // Set retirement target in pasture (with margin from edges)
                const margin = 3; // Keep 3 units away from edges
                sheepEntity.retirementTarget = new Vector2D(
                    pasture.minX + margin + rng() * (pasture.maxX - pasture.minX - 2 * margin),
                    pasture.minZ + margin + rng() * (pasture.maxZ - pasture.minZ - 2 * margin)
                );
                
                newRetirements++;
            }
        }
        
        // Check if sheep has reached retirement target
        if (sheepEntity.isRetiring && sheepEntity.retirementTarget) {
            const distanceToTarget = sheepEntity.position.distanceTo(sheepEntity.retirementTarget);
            if (distanceToTarget < 2) {
                sheepEntity.retirementTarget = null; // Clear target to enter grazing mode
                sheepEntity.state = 2; // Set to grazing state
                // Clear physics for grazing sheep
                sheepEntity.velocity.set(0, 0);
                sheepEntity.acceleration.set(0, 0);
            }
        }
        
        // Count all retired sheep
        if (sheepEntity.hasPassedGate || sheepEntity.isRetiring) {
            totalRetired++;
        }
    }
    
    return {
        newRetirements,
        totalRetired
    };
}

/**
 * Check if game completion conditions are met
 * @param {Array} sheep - Array of sheep entities
 * @param {number} totalSheep - Total number of sheep in game
 * @param {boolean} gameActive - Whether game is currently active
 * @returns {Object} - Completion status {isComplete, completionPercentage}
 */
export function checkGameCompletion(sheep, totalSheep, gameActive) {
    if (!gameActive) {
        return {
            isComplete: false,
            completionPercentage: 0
        };
    }
    
    const retiredCount = sheep.filter(s => s.hasPassedGate || s.isRetiring).length;
    const completionPercentage = (retiredCount / totalSheep) * 100;
    const isComplete = retiredCount === totalSheep;
    
    return {
        isComplete,
        completionPercentage
    };
}

/**
 * Validate game state consistency
 * @param {Object} gameState - Current game state
 * @returns {Object} - Validation results {isValid, issues}
 */
export function validateGameState(gameState) {
    const issues = [];
    
    // Check sheep array
    if (!Array.isArray(gameState.sheep)) {
        issues.push('sheep_not_array');
    } else {
        // Validate each sheep
        for (let i = 0; i < gameState.sheep.length; i++) {
            const sheep = gameState.sheep[i];
            
            if (!sheep.position || typeof sheep.position.x !== 'number' || typeof sheep.position.z !== 'number') {
                issues.push(`sheep_${i}_invalid_position`);
            }
            
            if (!sheep.velocity || typeof sheep.velocity.x !== 'number' || typeof sheep.velocity.z !== 'number') {
                issues.push(`sheep_${i}_invalid_velocity`);
            }
            
            if (typeof sheep.hasPassedGate !== 'boolean') {
                issues.push(`sheep_${i}_invalid_gate_status`);
            }
            
            if (typeof sheep.isRetiring !== 'boolean') {
                issues.push(`sheep_${i}_invalid_retirement_status`);
            }
        }
    }
    
    // Check sheepdog
    if (gameState.sheepdog) {
        if (!gameState.sheepdog.position || 
            typeof gameState.sheepdog.position.x !== 'number' || 
            typeof gameState.sheepdog.position.z !== 'number') {
            issues.push('sheepdog_invalid_position');
        }
        
        if (!gameState.sheepdog.velocity ||
            typeof gameState.sheepdog.velocity.x !== 'number' || 
            typeof gameState.sheepdog.velocity.z !== 'number') {
            issues.push('sheepdog_invalid_velocity');
        }
        
        if (typeof gameState.sheepdog.stamina !== 'number' || 
            gameState.sheepdog.stamina < 0 || 
            gameState.sheepdog.stamina > gameState.sheepdog.maxStamina) {
            issues.push('sheepdog_invalid_stamina');
        }
    }
    
    // Check boundaries
    if (!gameState.bounds || 
        typeof gameState.bounds.minX !== 'number' ||
        typeof gameState.bounds.maxX !== 'number' ||
        typeof gameState.bounds.minZ !== 'number' ||
        typeof gameState.bounds.maxZ !== 'number') {
        issues.push('invalid_bounds');
    }
    
    // Check gate
    if (!gameState.gate || 
        !gameState.gate.position ||
        typeof gameState.gate.width !== 'number') {
        issues.push('invalid_gate');
    }
    
    // Check numerical values
    if (typeof gameState.sheepRetired !== 'number' || gameState.sheepRetired < 0) {
        issues.push('invalid_sheep_retired_count');
    }
    
    if (typeof gameState.totalSheep !== 'number' || gameState.totalSheep <= 0) {
        issues.push('invalid_total_sheep_count');
    }
    
    return {
        isValid: issues.length === 0,
        issues
    };
}

/**
 * Calculate game progress metrics
 * @param {Array} sheep - Array of sheep entities
 * @param {number} totalSheep - Total number of sheep
 * @param {Object} pasture - Pasture configuration
 * @returns {Object} - Progress metrics
 */
export function calculateGameProgress(sheep, totalSheep, pasture) {
    let inField = 0;
    let passingGate = 0;
    let inPasture = 0;
    let grazing = 0;
    
    for (let sheepEntity of sheep) {
        if (sheepEntity.state === 2) { // Grazing state
            grazing++;
        } else if (sheepEntity.hasPassedGate || sheepEntity.isRetiring) {
            if (isWithinArea(sheepEntity.position, pasture)) {
                inPasture++;
            } else {
                passingGate++;
            }
        } else {
            inField++;
        }
    }
    
    return {
        inField,
        passingGate,
        inPasture,
        grazing,
        totalRetired: passingGate + inPasture + grazing,
        completionPercentage: ((passingGate + inPasture + grazing) / totalSheep) * 100
    };
}

/**
 * Generate initial sheep positions in a clustered formation
 * @param {number} sheepCount - Number of sheep to position
 * @param {Object} bounds - Field boundaries
 * @param {Object} config - Configuration options
 * @param {() => number} [rng=Math.random] - PRNG returning [0,1). Defaults to
 *   Math.random so existing callers + the client stay byte-identical. The
 *   Worker passes a per-game seeded mulberry32 so the spawn layout is
 *   reproducible for a given seed (variety still comes from a fresh seed
 *   per game). Forwarded to generateCompetitiveBalancedSpawns.
 * @returns {Array} - Array of initial positions
 */
export function generateInitialSheepPositions(sheepCount, bounds, config = {}, rng = Math.random) {
    const {
        spreadRadius = 30,
        centerX = -30,
        centerZ = -30,
        avoidAreas = [],
        competitiveMode = false,
        competitiveGates = [],
        // New options for competitive mode
        clusterCount = 1,
        clusterCenters = null
    } = config;
    
    const positions = [];
    
    // For competitive mode, use balanced cluster spawning
    if (competitiveMode && competitiveGates.length > 0) {
        return generateCompetitiveBalancedSpawns(sheepCount, bounds, competitiveGates, config, rng);
    }
    
    // Use cluster centers if provided, otherwise single center
    const centers = clusterCenters || [{ x: centerX, z: centerZ }];
    const sheepPerCluster = Math.ceil(sheepCount / centers.length);
    
    for (let clusterIndex = 0; clusterIndex < centers.length; clusterIndex++) {
        const center = centers[clusterIndex];
        const startIndex = clusterIndex * sheepPerCluster;
        const endIndex = Math.min(startIndex + sheepPerCluster, sheepCount);
        
        for (let i = startIndex; i < endIndex; i++) {
            let position;
            let attempts = 0;
            const maxAttempts = 50;
            
            do {
                // Random position in this cluster
                const angle = rng() * Math.PI * 2;
                const distance = rng() * spreadRadius;
                const x = center.x + Math.cos(angle) * distance;
                const z = center.z + Math.sin(angle) * distance;
                
                position = new Vector2D(x, z);
                attempts++;
                
                // Check if position is valid (within bounds and not in avoid areas)
                const withinBounds = position.x >= bounds.minX + 5 && 
                                    position.x <= bounds.maxX - 5 &&
                                    position.z >= bounds.minZ + 5 && 
                                    position.z <= bounds.maxZ - 5;
                
                let inAvoidArea = false;
                for (const area of avoidAreas) {
                    if (isWithinArea(position, area)) {
                        inAvoidArea = true;
                        break;
                    }
                }
                
                if (withinBounds && !inAvoidArea) {
                    break;
                }
                
            } while (attempts < maxAttempts);
            
            positions.push(position);
        }
    }
    
    return positions;
}

/**
 * Generate balanced sheep spawns for competitive mode
 * Creates multiple spawn clusters equidistant from all gates
 * @param {number} sheepCount - Number of sheep to spawn
 * @param {Object} bounds - Field boundaries
 * @param {Array} competitiveGates - Array of competitive gate configurations
 * @param {Object} config - Additional configuration
 * @param {() => number} [rng=Math.random] - PRNG returning [0,1). Defaults to
 *   Math.random for byte-identical legacy behavior; the Worker passes a
 *   per-game seeded mulberry32.
 * @returns {Array} - Array of balanced spawn positions
 */
export function generateCompetitiveBalancedSpawns(sheepCount, bounds, competitiveGates, config = {}, rng = Math.random) {
    const {
        spreadRadius = 25,
        minDistanceFromGates = 35,
        avoidAreas = []
    } = config;
    
    // Calculate spawn clusters that are equidistant from all gates
    const spawnClusters = calculateBalancedSpawnClusters(competitiveGates, bounds, minDistanceFromGates);
    
    const positions = [];
    const sheepPerCluster = Math.ceil(sheepCount / spawnClusters.length);
    
    console.log(`🐑 Generating competitive spawns: ${spawnClusters.length} clusters, ~${sheepPerCluster} sheep per cluster`);
    
    for (let clusterIndex = 0; clusterIndex < spawnClusters.length; clusterIndex++) {
        const cluster = spawnClusters[clusterIndex];
        const startIndex = clusterIndex * sheepPerCluster;
        const endIndex = Math.min(startIndex + sheepPerCluster, sheepCount);
        
        for (let i = startIndex; i < endIndex; i++) {
            let position;
            let attempts = 0;
            const maxAttempts = 50;
            
            do {
                // Random position within this cluster
                const angle = rng() * Math.PI * 2;
                const distance = rng() * spreadRadius;
                const x = cluster.x + Math.cos(angle) * distance;
                const z = cluster.z + Math.sin(angle) * distance;
                
                position = new Vector2D(x, z);
                attempts++;
                
                // Validate position
                const withinBounds = position.x >= bounds.minX + 5 && 
                                    position.x <= bounds.maxX - 5 &&
                                    position.z >= bounds.minZ + 5 && 
                                    position.z <= bounds.maxZ - 5;
                
                // Check distance from all gates
                let tooCloseToGates = false;
                for (const gate of competitiveGates) {
                    const distanceToGate = position.distanceTo(gate.position);
                    if (distanceToGate < minDistanceFromGates) {
                        tooCloseToGates = true;
                        break;
                    }
                }
                
                // Check avoid areas
                let inAvoidArea = false;
                for (const area of avoidAreas) {
                    if (isWithinArea(position, area)) {
                        inAvoidArea = true;
                        break;
                    }
                }
                
                if (withinBounds && !tooCloseToGates && !inAvoidArea) {
                    break;
                }
                
            } while (attempts < maxAttempts);
            
            positions.push(position);
        }
    }
    
    return positions;
}

/**
 * Calculate balanced spawn cluster positions for competitive mode
 * @param {Array} competitiveGates - Array of gate configurations
 * @param {Object} bounds - Field boundaries
 * @param {number} minDistanceFromGates - Minimum distance from any gate
 * @returns {Array} - Array of spawn cluster centers
 */
export function calculateBalancedSpawnClusters(competitiveGates, bounds, minDistanceFromGates = 35) {
    const clusters = [];
    
    if (competitiveGates.length === 2) {
        // 2 players: Create clusters in neutral areas
        clusters.push(
            { x: -50, z: 0, description: "West neutral zone" },
            { x: 50, z: 0, description: "East neutral zone" },
            { x: 0, z: -50, description: "South-center neutral zone" }
        );
    } else if (competitiveGates.length === 3) {
        // 3 players: Triangular formation with balanced distances from N/E/W gates
        clusters.push(
            { x: 0, z: 0, description: "Central cluster" },
            { x: -40, z: -20, description: "Southwest cluster" },
            { x: 40, z: -20, description: "Southeast cluster" },
            { x: 0, z: -50, description: "South cluster" }
        );
    } else if (competitiveGates.length === 4) {
        // 4 players: Diamond formation in center with balanced distances
        clusters.push(
            { x: 0, z: 0, description: "Center cluster" },
            { x: -30, z: -30, description: "Southwest cluster" },
            { x: 30, z: -30, description: "Southeast cluster" },
            { x: 0, z: -60, description: "South cluster" }
        );
    } else {
        // Fallback: single central cluster
        clusters.push({ x: 0, z: -30, description: "Default central cluster" });
    }
    
    // Validate and adjust clusters to ensure minimum distance from gates
    const validatedClusters = [];
    for (const cluster of clusters) {
        let adjustedCluster = { ...cluster };
        let isValid = false;
        let adjustmentAttempts = 0;
        
        while (!isValid && adjustmentAttempts < 10) {
            // Check distance from all gates
            let minDistanceFromAnyGate = Infinity;
            for (const gate of competitiveGates) {
                const distance = Math.sqrt(
                    (adjustedCluster.x - gate.position.x) ** 2 + 
                    (adjustedCluster.z - gate.position.z) ** 2
                );
                minDistanceFromAnyGate = Math.min(minDistanceFromAnyGate, distance);
            }
            
            // Also check if within bounds
            const withinBounds = adjustedCluster.x >= bounds.minX + 20 && 
                                adjustedCluster.x <= bounds.maxX - 20 &&
                                adjustedCluster.z >= bounds.minZ + 20 && 
                                adjustedCluster.z <= bounds.maxZ - 20;
            
            if (minDistanceFromAnyGate >= minDistanceFromGates && withinBounds) {
                isValid = true;
            } else {
                // Adjust position slightly toward center
                adjustedCluster.x *= 0.9;
                adjustedCluster.z *= 0.9;
                adjustmentAttempts++;
            }
        }
        
        if (isValid) {
            validatedClusters.push(adjustedCluster);
            console.log(`✅ Spawn cluster: ${cluster.description} at (${Math.round(adjustedCluster.x)}, ${Math.round(adjustedCluster.z)})`);
        } else {
            console.warn(`⚠️ Could not validate spawn cluster: ${cluster.description}`);
        }
    }
    
    // Ensure we have at least one cluster
    if (validatedClusters.length === 0) {
        console.warn('No valid spawn clusters found, using fallback center position');
        validatedClusters.push({ x: 0, z: -30, description: "Fallback center" });
    }
    
    return validatedClusters;
}

/**
 * Reset game state to initial conditions
 * @param {Object} gameState - Current game state
 * @param {Array} initialPositions - Initial sheep positions
 * @returns {Object} - Reset game state
 */
export function resetGameState(gameState, initialPositions) {
    // Reset sheep states
    for (let i = 0; i < gameState.sheep.length; i++) {
        const sheep = gameState.sheep[i];
        const initialPos = initialPositions[i] || new Vector2D(-30, -30);
        
        sheep.position = initialPos.clone();
        sheep.velocity = new Vector2D(0, 0);
        sheep.acceleration = new Vector2D(0, 0);
        sheep.hasPassedGate = false;
        sheep.isRetiring = false;
        sheep.retirementTarget = null;
        sheep.state = 0; // Active state
    }
    
    // Reset game counters
    gameState.sheepRetired = 0;
    gameState.gameCompleted = false;
    gameState.gameActive = false;
    
    return gameState;
}

/**
 * Calculate herding effectiveness metrics
 * @param {Object} sheepdog - Sheepdog entity
 * @param {Array} sheep - Array of sheep entities
 * @param {Object} gate - Gate configuration
 * @returns {Object} - Herding effectiveness metrics
 */
export function calculateHerdingEffectiveness(sheepdog, sheep, gate) {
    if (!sheepdog) {
        return {
            sheepInRange: 0,
            sheepFleeing: 0,
            averageDistanceToGate: 0,
            herdingPressure: 0
        };
    }
    
    let sheepInRange = 0;
    let sheepFleeing = 0;
    let totalDistanceToGate = 0;
    
    for (let sheepEntity of sheep) {
        const distanceToSheepdog = sheepEntity.position.distanceTo(sheepdog.position);
        const distanceToGate = sheepEntity.position.distanceTo(gate.position);
        
        if (distanceToSheepdog < 15) { // Within herding range
            sheepInRange++;
        }
        
        if (distanceToSheepdog < sheepEntity.fleeRadius) { // Within flee radius
            sheepFleeing++;
        }
        
        totalDistanceToGate += distanceToGate;
    }
    
    const averageDistanceToGate = totalDistanceToGate / sheep.length;
    const herdingPressure = (sheepFleeing / sheep.length) * 100;
    
    return {
        sheepInRange,
        sheepFleeing,
        averageDistanceToGate,
        herdingPressure
    };
}

/**
 * Generate competitive gate layout for multiple players
 * @param {number} playerCount - Number of players (2-4)
 * @returns {Array} - Array of gate/pasture configurations
 */
export function generateCompetitiveGateLayout(playerCount) {
    const competitiveLayouts = {
        2: [
            {
                gate: { x: 0, z: 100 },
                pasture: { minX: -30, maxX: 30, minZ: 102, maxZ: 130 },
                playerId: null,
                color: 0xFF0000, // Red
                direction: 'north'
            },
            {
                gate: { x: 0, z: -100 },
                pasture: { minX: -30, maxX: 30, minZ: -130, maxZ: -102 },
                playerId: null,
                color: 0x0000FF, // Blue
                direction: 'south'
            }
        ],
        3: [
            {
                gate: { x: 0, z: 100 },
                pasture: { minX: -30, maxX: 30, minZ: 102, maxZ: 130 },
                playerId: null,
                color: 0xFF0000, // Red
                direction: 'north'
            },
            {
                gate: { x: 100, z: 0 },
                pasture: { minX: 102, maxX: 130, minZ: -30, maxZ: 30 },
                playerId: null,
                color: 0x0000FF, // Blue
                direction: 'east'
            },
            {
                gate: { x: -100, z: 0 },
                pasture: { minX: -130, maxX: -102, minZ: -30, maxZ: 30 },
                playerId: null,
                color: 0x00FF00, // Green
                direction: 'west'
            }
        ],
        4: [
            {
                gate: { x: 0, z: 100 },
                pasture: { minX: -30, maxX: 30, minZ: 102, maxZ: 130 },
                playerId: null,
                color: 0xFF0000, // Red
                direction: 'north'
            },
            {
                gate: { x: 0, z: -100 },
                pasture: { minX: -30, maxX: 30, minZ: -130, maxZ: -102 },
                playerId: null,
                color: 0x0000FF, // Blue
                direction: 'south'
            },
            {
                gate: { x: 100, z: 0 },
                pasture: { minX: 102, maxX: 130, minZ: -30, maxZ: 30 },
                playerId: null,
                color: 0x00FF00, // Green
                direction: 'east'
            },
            {
                gate: { x: -100, z: 0 },
                pasture: { minX: -130, maxX: -102, minZ: -30, maxZ: 30 },
                playerId: null,
                color: 0xFFFF00, // Yellow
                direction: 'west'
            }
        ]
    };
    
    if (!competitiveLayouts[playerCount]) {
        throw new Error(`Unsupported player count: ${playerCount}. Must be 2-4 players.`);
    }
    
    // Create full gate objects with passage zones
    return competitiveLayouts[playerCount].map((layout, index) => {
        // Calculate passage zone based on gate direction
        let passageZone;
        const gateWidth = 8;
        const gateDepth = 4; // How deep the passage zone extends
        
        switch (layout.direction) {
            case 'north':
                passageZone = {
                    minX: layout.gate.x - gateWidth / 2,
                    maxX: layout.gate.x + gateWidth / 2,
                    minZ: layout.gate.z - gateDepth,
                    maxZ: layout.gate.z + gateDepth
                };
                break;
            case 'south':
                passageZone = {
                    minX: layout.gate.x - gateWidth / 2,
                    maxX: layout.gate.x + gateWidth / 2,
                    minZ: layout.gate.z - gateDepth,
                    maxZ: layout.gate.z + gateDepth
                };
                break;
            case 'east':
                passageZone = {
                    minX: layout.gate.x - gateDepth,
                    maxX: layout.gate.x + gateDepth,
                    minZ: layout.gate.z - gateWidth / 2,
                    maxZ: layout.gate.z + gateWidth / 2
                };
                break;
            case 'west':
                passageZone = {
                    minX: layout.gate.x - gateDepth,
                    maxX: layout.gate.x + gateDepth,
                    minZ: layout.gate.z - gateWidth / 2,
                    maxZ: layout.gate.z + gateWidth / 2
                };
                break;
            default:
                // Default to north/south style
                passageZone = {
                    minX: layout.gate.x - gateWidth / 2,
                    maxX: layout.gate.x + gateWidth / 2,
                    minZ: layout.gate.z - gateDepth,
                    maxZ: layout.gate.z + gateDepth
                };
        }
        
        return {
            id: index,
            position: new Vector2D(layout.gate.x, layout.gate.z),
            width: gateWidth,
            height: 4,
            // Gate passage zone (invisible box for detection)
            passageZone: passageZone,
            pasture: {
                centerZ: (layout.pasture.minZ + layout.pasture.maxZ) / 2,
                minX: layout.pasture.minX,
                maxX: layout.pasture.maxX,
                minZ: layout.pasture.minZ,
                maxZ: layout.pasture.maxZ
            },
            playerId: layout.playerId,
            color: layout.color,
            direction: layout.direction
        };
    });
}

/**
 * Assign gates to players in competitive mode
 * @param {Array} gates - Array of gate configurations
 * @param {Array} playerIds - Array of player IDs
 * @returns {Array} - Gates with assigned player IDs
 */
export function assignGatesToPlayers(gates, playerIds) {
    if (gates.length !== playerIds.length) {
        throw new Error(`Gate count (${gates.length}) must match player count (${playerIds.length})`);
    }
    
    // Rotate assignment to ensure fairness
    const assignedGates = gates.map((gate, index) => ({
        ...gate,
        playerId: playerIds[index % playerIds.length]
    }));
    
    return assignedGates;
}

/**
 * Update sheep retirements for competitive mode with multiple gates
 * @param {Array} sheep - Array of sheep entities
 * @param {Array} competitiveGates - Array of competitive gate configurations
 * @param {() => number} [rng=Math.random] - PRNG returning [0,1). Defaults to
 *   Math.random for byte-identical legacy behavior; the Worker passes a
 *   per-game seeded mulberry32 so retirement placement is reproducible.
 * @returns {Object} - Retirement status {playerRetirements, totalRetired}
 */
export function updateCompetitiveSheepRetirements(sheep, competitiveGates, rng = Math.random) {
    let totalRetired = 0;
    const playerRetirements = new Map(); // playerId -> retirement count
    
    // Initialize player retirement counts
    for (const gate of competitiveGates) {
        if (gate.playerId && !playerRetirements.has(gate.playerId)) {
            playerRetirements.set(gate.playerId, 0);
        }
    }
    
    for (let sheepEntity of sheep) {
        // Check if sheep just passed through any gate
        if (!sheepEntity.hasPassedGate && !sheepEntity.isRetiring) {
            for (const gate of competitiveGates) {
                if (checkGatePassage(sheepEntity.position, sheepEntity.velocity, gate.passageZone, gate.direction)) {
                    sheepEntity.hasPassedGate = true;
                    sheepEntity.isRetiring = true;
                    sheepEntity.assignedGate = gate.id; // Track which gate sheep went through
                    
                    // Set retirement target in the appropriate pasture (with margin from edges)
                    const margin = 3; // Keep 3 units away from edges
                    sheepEntity.retirementTarget = new Vector2D(
                        gate.pasture.minX + margin + rng() * (gate.pasture.maxX - gate.pasture.minX - 2 * margin),
                        gate.pasture.minZ + margin + rng() * (gate.pasture.maxZ - gate.pasture.minZ - 2 * margin)
                    );
                    
                    // Award point to the gate's player
                    if (gate.playerId && playerRetirements.has(gate.playerId)) {
                        playerRetirements.set(gate.playerId, playerRetirements.get(gate.playerId) + 1);
                    }
                    
                    break; // Sheep can only pass through one gate
                }
            }
        }
        
        // Check if sheep has reached retirement target
        if (sheepEntity.isRetiring && sheepEntity.retirementTarget) {
            const distanceToTarget = sheepEntity.position.distanceTo(sheepEntity.retirementTarget);
            if (distanceToTarget < 2) {
                sheepEntity.retirementTarget = null; // Clear target to enter grazing mode
                sheepEntity.state = 2; // Set to grazing state
                // Clear physics for grazing sheep
                sheepEntity.velocity.set(0, 0);
                sheepEntity.acceleration.set(0, 0);
            }
        }
        
        // Count all retired sheep
        if (sheepEntity.hasPassedGate || sheepEntity.isRetiring) {
            totalRetired++;
        }
    }
    
    return {
        playerRetirements: Object.fromEntries(playerRetirements),
        totalRetired
    };
}

/**
 * Check competitive game completion conditions
 * @param {Object} playerScores - Map of playerId -> score
 * @param {number} playerCount - Number of players
 * @param {number} totalSheep - Total number of sheep
 * @returns {Object} - Completion status {isComplete, winner, winType}
 */
export function checkCompetitiveCompletion(playerScores, playerCount, totalSheep) {
    const scores = Object.values(playerScores);
    const maxScore = Math.max(...scores);
    const totalRetired = scores.reduce((sum, score) => sum + score, 0);
    
    // 2 players: First to ceil(totalSheep/2) sheep wins (100 of 200, i.e. 50% of total)
    if (playerCount === 2) {
        const winThreshold = Math.ceil(totalSheep / 2); // 100 for 200 sheep
        if (maxScore >= winThreshold) {
            // Tie-break: sort player ids so equal scores resolve to the
            // lexicographically lowest id. Object key insertion order is not
            // guaranteed identical between the Worker's live playerScores and
            // a client's reconstructed copy, so an unsorted find() is
            // nondeterministic across the sim boundary (P0-DETBUG).
            const winner = Object.keys(playerScores).sort().find(playerId => playerScores[playerId] === maxScore);
            return {
                isComplete: true,
                winner,
                winType: 'race',
                finalScores: playerScores
            };
        }
    }
    
    // 3-4 players: Highest score when all sheep collected
    if (playerCount >= 3) {
        if (totalRetired >= totalSheep) {
            // Same sorted-playerId tie-break as the 2-player race above.
            const winner = Object.keys(playerScores).sort().find(playerId => playerScores[playerId] === maxScore);
            return {
                isComplete: true,
                winner,
                winType: 'highest_score',
                finalScores: playerScores
            };
        }
    }
    
    return {
        isComplete: false,
        winner: null,
        winType: null
    };
}

/**
 * Validate competitive game state structure
 * @param {Object} gameState - Current game state
 * @returns {Object} - Validation results {isValid, issues}
 */
export function validateCompetitiveGameState(gameState) {
    const issues = [];
    
    // Check if racing mode is enabled
    if (gameState.gameMode !== 'racing') {
        issues.push('not_racing_mode');
        return { isValid: false, issues };
    }
    
    // Check competitive gates array
    if (!Array.isArray(gameState.competitiveGates)) {
        issues.push('competitive_gates_not_array');
    } else {
        // Validate each gate
        for (let i = 0; i < gameState.competitiveGates.length; i++) {
            const gate = gameState.competitiveGates[i];
            
            if (!gate.position || typeof gate.position.x !== 'number' || typeof gate.position.z !== 'number') {
                issues.push(`competitive_gate_${i}_invalid_position`);
            }
            
            if (!gate.pasture || 
                typeof gate.pasture.minX !== 'number' ||
                typeof gate.pasture.maxX !== 'number' ||
                typeof gate.pasture.minZ !== 'number' ||
                typeof gate.pasture.maxZ !== 'number') {
                issues.push(`competitive_gate_${i}_invalid_pasture`);
            }
            
            if (!gate.passageZone ||
                typeof gate.passageZone.minX !== 'number' ||
                typeof gate.passageZone.maxX !== 'number' ||
                typeof gate.passageZone.minZ !== 'number' ||
                typeof gate.passageZone.maxZ !== 'number') {
                issues.push(`competitive_gate_${i}_invalid_passage_zone`);
            }
        }
    }
    
    // Check player scores
    if (!gameState.playerScores || typeof gameState.playerScores !== 'object') {
        issues.push('player_scores_not_object');
    }
    
    // Check gate count matches expected player count
    const expectedGateCount = gameState.competitiveGates ? gameState.competitiveGates.length : 0;
    const playerCount = gameState.playerScores ? Object.keys(gameState.playerScores).length : 0;
    
    if (expectedGateCount !== playerCount) {
        issues.push('gate_count_player_count_mismatch');
    }
    
    return {
        isValid: issues.length === 0,
        issues
    };
}

/**
 * Create a competitive game state structure
 * @param {Object} config - Game configuration
 * @param {Array} playerIds - Array of player IDs
 * @returns {Object} - Competitive game state
 */
export function createCompetitiveGameState(config = {}, playerIds = []) {
    const {
        totalSheep = 200,
        bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 }
    } = config;
    
    const playerCount = playerIds.length;
    if (playerCount < 2 || playerCount > 4) {
        throw new Error('Competitive mode requires 2-4 players');
    }
    
    // Generate competitive gate layout
    const competitiveGates = generateCompetitiveGateLayout(playerCount);
    const assignedGates = assignGatesToPlayers(competitiveGates, playerIds);
    
    // Initialize player scores
    const playerScores = {};
    for (const playerId of playerIds) {
        playerScores[playerId] = 0;
    }
    
            return {
            gameMode: 'racing',
            bounds,
        competitiveGates: assignedGates,
        playerScores,
        params: {
            speed: 0.1,
            cohesion: 1.0,
            separationDistance: 2.0
        },
        sheep: [],
        totalSheep,
        gameCompleted: false,
        gameActive: false
    };
} 