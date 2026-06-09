// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Vector2D } from './Vector2D.js';

/**
 * Competitive gate and pasture layout generation (P3-GSV-SPLIT: moved
 * verbatim from GameStateValidation.js). Stateless and deterministic - no
 * external dependencies.
 */

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
