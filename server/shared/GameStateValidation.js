import { Vector2D } from './Vector2D.js';
import { isWithinArea, checkGatePassage } from './BoundaryCollision.js';

/**
 * Pure game state validation functions
 * Stateless and deterministic - no external dependencies
 */

/**
 * Validate and update sheep retirement status
 * @param {Array} sheep - Array of sheep entities
 * @param {Object} gate - Gate configuration
 * @param {Object} pasture - Pasture configuration
 * @returns {Object} - Retirement status {newRetirements, totalRetired}
 */
export function updateSheepRetirements(sheep, gate, pasture) {
    let newRetirements = 0;
    let totalRetired = 0;
    
    for (let sheepEntity of sheep) {
        // Check if sheep just passed through the gate
        if (!sheepEntity.hasPassedGate && !sheepEntity.isRetiring) {
            if (checkGatePassage(sheepEntity.position, sheepEntity.velocity, gate.passageZone)) {
                sheepEntity.hasPassedGate = true;
                sheepEntity.isRetiring = true;
                
                // Set retirement target in pasture
                sheepEntity.retirementTarget = new Vector2D(
                    pasture.minX + Math.random() * (pasture.maxX - pasture.minX),
                    pasture.centerZ + Math.random() * 20
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
 * @returns {Array} - Array of initial positions
 */
export function generateInitialSheepPositions(sheepCount, bounds, config = {}) {
    const {
        spreadRadius = 30,
        centerX = -30,
        centerZ = -30,
        avoidAreas = []
    } = config;
    
    const positions = [];
    
    for (let i = 0; i < sheepCount; i++) {
        let position;
        let attempts = 0;
        const maxAttempts = 50;
        
        do {
            // Random position in a cluster
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * spreadRadius;
            const x = centerX + Math.cos(angle) * distance;
            const z = centerZ + Math.sin(angle) * distance;
            
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
    
    return positions;
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