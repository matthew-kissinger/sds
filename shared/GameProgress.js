// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Vector2D } from './Vector2D.js';
import { isWithinArea } from './BoundaryCollision.js';

/**
 * Game progress metrics and game-state reset (P3-GSV-SPLIT: moved verbatim
 * from GameStateValidation.js). Stateless and deterministic - no external
 * dependencies.
 */

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
