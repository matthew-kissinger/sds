// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Vector2D } from './Vector2D.js';
import { checkGatePassage } from './BoundaryCollision.js';

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

// P3-GSV-SPLIT: spawn, progress, and competitive logic moved verbatim to
// sibling modules. Re-exported here so every existing importer of
// GameStateValidation.js keeps working unchanged (pure mechanical split).
export { calculateGameProgress, resetGameState, calculateHerdingEffectiveness } from './GameProgress.js';
export { generateInitialSheepPositions, generateCompetitiveBalancedSpawns, calculateBalancedSpawnClusters } from './SpawnLogic.js';
export { generateCompetitiveGateLayout, assignGatesToPlayers } from './CompetitiveLayout.js';
export { updateCompetitiveSheepRetirements, checkCompetitiveCompletion, validateCompetitiveGameState, createCompetitiveGameState } from './CompetitiveMode.js';
