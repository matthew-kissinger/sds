// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Sandbox-mode rebuild helpers extracted from `TerrainBuilder` in
 * Cycle 28 Stream B2. Called when the user resizes the play area
 * mid-session via the sandbox editor — clears + rebuilds trees, rocks,
 * grass with new exclusion zones, and moves the existing farmhouse.
 *
 * Each function reads/writes the same builder fields the original
 * methods did. Behavior is unchanged.
 */

import { getSceneManager } from '../GameBridge.js';

/**
 * @param {object} builder TerrainBuilder instance.
 * @param {object | null} bounds
 * @param {object | null} pasture
 */
export function setDynamicBounds(builder, bounds, pasture) {
    if (bounds) {
        builder.zones.playArea = {
            minX: bounds.minX,
            maxX: bounds.maxX,
            minZ: bounds.minZ,
            maxZ: bounds.maxZ
        };
        console.log('[TERRAIN] Updated play area bounds:', builder.zones.playArea);

        // Position farmhouse beyond the northeast corner of the field
        builder.farmHousePosition = {
            x: bounds.maxX + 80,
            z: bounds.maxZ + 60
        };

        builder.farmHouseExclusionArea = {
            minX: builder.farmHousePosition.x - 40,
            maxX: builder.farmHousePosition.x + 40,
            minZ: builder.farmHousePosition.z - 40,
            maxZ: builder.farmHousePosition.z + 40
        };
        console.log('[TERRAIN] Updated farmhouse position:', builder.farmHousePosition);

        // Actually MOVE the existing farmhouse to the new position
        updateFarmhousePosition(builder);
    }

    if (pasture) {
        builder.currentPasture = pasture;
        console.log('[TERRAIN] Updated pasture area:', pasture);
    }

    // Update grass system exclusion zones if available
    if (builder.grassSystem) {
        builder.grassSystem.exclusionZones = [];

        builder.grassSystem.addExclusionZone(
            builder.farmHouseExclusionArea.minX,
            builder.farmHouseExclusionArea.maxX,
            builder.farmHouseExclusionArea.minZ,
            builder.farmHouseExclusionArea.maxZ
        );

        // Add pasture exclusion if available (no grass in pen)
        if (pasture) {
            if (pasture.edgeAngle !== undefined && pasture.edgeAngle !== 0) {
                const centerX = (pasture.minX + pasture.maxX) / 2;
                const centerZ = (pasture.minZ + pasture.maxZ) / 2;
                const width = pasture.maxX - pasture.minX;
                const depth = pasture.maxZ - pasture.minZ;
                builder.grassSystem.addRotatedExclusionZone(centerX, centerZ, width, depth, pasture.edgeAngle);
            } else {
                builder.grassSystem.addExclusionZone(
                    pasture.minX,
                    pasture.maxX,
                    pasture.minZ,
                    pasture.maxZ
                );
            }
        }

        // NOTE: We want grass INSIDE the field, so no bounds exclusion
        console.log('[TERRAIN] Updated grass exclusion zones');
    }
}

/**
 * Move the existing farmhouse to `builder.farmHousePosition`.
 *
 * @param {object} builder
 */
export function updateFarmhousePosition(builder) {
    if (builder.buildings && builder.buildings.length > 0) {
        const farmhouse = builder.buildings[0];
        if (farmhouse) {
            const farmY = builder._groundY(builder.farmHousePosition.x, builder.farmHousePosition.z);
            farmhouse.position.set(builder.farmHousePosition.x, farmY, builder.farmHousePosition.z);
            console.log(`[TERRAIN] Moved farmhouse to (${builder.farmHousePosition.x}, ${builder.farmHousePosition.z})`);
        }
    }
}

/**
 * Clear and rebuild environment for new bounds. Called when switching
 * between game modes with different field sizes.
 *
 * @param {object} builder
 * @param {object | null} bounds
 * @param {object | null} pasture
 */
export async function rebuildEnvironment(builder, bounds, pasture) {
    console.log('[TERRAIN] Rebuilding environment for new bounds');

    // Update bounds first (updates exclusion zones but doesn't regenerate)
    if (bounds) {
        builder.zones.playArea = {
            minX: bounds.minX,
            maxX: bounds.maxX,
            minZ: bounds.minZ,
            maxZ: bounds.maxZ
        };

        builder.farmHousePosition = {
            x: bounds.maxX + 80,
            z: bounds.maxZ + 60
        };

        builder.farmHouseExclusionArea = {
            minX: builder.farmHousePosition.x - 40,
            maxX: builder.farmHousePosition.x + 40,
            minZ: builder.farmHousePosition.z - 40,
            maxZ: builder.farmHousePosition.z + 40
        };

        updateFarmhousePosition(builder);
    }

    if (pasture) {
        builder.currentPasture = pasture;
    }

    // Clear existing trees + rocks
    builder.clearTrees();
    builder.clearRocks();

    // Regenerate grass with new exclusion zones
    await regenerateGrass(builder, bounds, pasture);

    // Rebuild trees + rocks with new exclusion zones
    await builder.createTrees();
    await builder.addEnvironmentDetails();

    console.log('[TERRAIN] Environment rebuild complete');
}

/**
 * Regenerate the grass system with new exclusion zones.
 *
 * @param {object} builder
 * @param {object | null} bounds
 * @param {object | null} pasture
 */
export async function regenerateGrass(builder, bounds, pasture) {
    console.log('[TERRAIN] Regenerating grass with new exclusion zones');

    // Dispose old grass system
    if (builder.grassSystem) {
        builder.grassSystem.dispose();
        builder.grassSystem = null;
    }

    // Cycle 23 Phase D1: hardware tier passed through to GrassSystem for
    // per-tier presets (blade count, meadow-quad enable, wind octaves).
    const tier = getSceneManager()?.getTier?.() ?? (builder.isMobile ? 'low' : 'med');
    const { GrassSystem } = await import('../GrassSystem.js');
    builder.grassSystem = new GrassSystem(
        builder.scene,
        builder.isMobile,
        builder.sceneDef?.grass,
        builder.heightfield,
        builder.sceneDef?.boundary ?? null,
        { tier }
    );

    builder.grassSystem.addExclusionZone(
        builder.farmHouseExclusionArea.minX,
        builder.farmHouseExclusionArea.maxX,
        builder.farmHouseExclusionArea.minZ,
        builder.farmHouseExclusionArea.maxZ
    );

    if (pasture) {
        if (pasture.edgeAngle !== undefined && pasture.edgeAngle !== 0) {
            const centerX = (pasture.minX + pasture.maxX) / 2;
            const centerZ = (pasture.minZ + pasture.maxZ) / 2;
            const width = pasture.maxX - pasture.minX;
            const depth = pasture.maxZ - pasture.minZ;
            builder.grassSystem.addRotatedExclusionZone(centerX, centerZ, width, depth, pasture.edgeAngle);
            console.log(`[TERRAIN] Added rotated pasture exclusion: center(${centerX.toFixed(1)}, ${centerZ.toFixed(1)}), size(${width}x${depth}), angle=${pasture.edgeAngle.toFixed(2)}rad`);
        } else {
            builder.grassSystem.addExclusionZone(
                pasture.minX,
                pasture.maxX,
                pasture.minZ,
                pasture.maxZ
            );
        }
    }

    // NOTE: We DO want grass inside the play area/field. Only exclude
    // farmhouse and pasture.

    await builder.grassSystem.init();

    builder.grassMaterial = builder.grassSystem.grassMaterial;
    const stats = builder.grassSystem.getStats();
    builder.grassInstanceCount = stats.totalClumps * (builder.isMobile ? 3 : 5);

    console.log(`[TERRAIN] Grass regenerated: ${stats.totalClumps} clumps`);
}
