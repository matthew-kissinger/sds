// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Vector2D } from './Vector2D.js';
import { checkGatePassage } from './BoundaryCollision.js';
import {
    generateCompetitiveGateLayout,
    assignGatesToPlayers,
    competitiveBoundsFromBoundary
} from './CompetitiveLayout.js';

/**
 * Competitive-mode scoring, completion, and game-state construction
 * (P3-GSV-SPLIT: moved verbatim from GameStateValidation.js). Stateless and
 * deterministic - no external dependencies.
 */

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
    const { totalSheep = 200, boundary = null, bounds = null } = config;

    // Cycle 122: `bounds` used to default to Home Field's rect, and because
    // only Home Field declares a legacy `bounds` field at all, EVERY island
    // silently took that default - a 200 m square inside a 360 m island, about
    // 39% of it, with the outer ring unreachable. The boundary is now the
    // primary input and `bounds` is derived from it, matching what
    // `createGameState` has always done on the cooperative path.
    const effectiveBoundary = boundary ?? (bounds ? { kind: 'rect', ...bounds } : null);
    const effectiveBounds = competitiveBoundsFromBoundary(effectiveBoundary);

    const playerCount = playerIds.length;
    if (playerCount < 2 || playerCount > 4) {
        throw new Error('Competitive mode requires 2-4 players');
    }

    // Generate competitive gate layout from the scene's own geometry
    const competitiveGates = generateCompetitiveGateLayout(playerCount, effectiveBoundary ?? undefined);
    const assignedGates = assignGatesToPlayers(competitiveGates, playerIds);
    
    // Initialize player scores
    const playerScores = {};
    for (const playerId of playerIds) {
        playerScores[playerId] = 0;
    }
    
    return {
        gameMode: 'racing',
        bounds: effectiveBounds,
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