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
import { resolveWornGroundZones } from './groundShading.js';

/**
 * Re-resolve the builder's worn-ground zones and push them to both consumers.
 *
 * Cycle 121. Before this, both rebuild paths hand-rolled their own zone list:
 * they cleared `grassSystem.exclusionZones` and re-added the farmhouse rect plus
 * whatever `pasture` they were handed. That is how a second description of the
 * same ground got in, and the runtime proved it - probed live on 2026-07-26,
 * EVERY scene came out of `startGame` carrying `{-30,30,102,125}`, which is
 * js/FieldConfig.js's default rect off Home Field's medium bounds. It is two
 * metres off Home Field's real fence line (Cycle 114 measured z[100,128]) and
 * about a kilometre from Newsheepdogland's homestead. Nothing re-scattered
 * afterwards, so it never showed; the moment the terrain reads the zone list it
 * would show as a brown rectangle in the middle of an island.
 *
 * @param {object} builder TerrainBuilder instance.
 * @param {object | null} [pastureOverride] Only from the genuine sandbox resize.
 */
function syncWornZones(builder, pastureOverride = null) {
    builder.wornZones = resolveWornGroundZones(builder.sceneDef, {
        farmHouseArea: builder.farmHouseExclusionArea,
        pasture: pastureOverride,
    });
    builder.grassSystem?.setWornZones?.(builder.wornZones);
    builder._syncWornZones?.();
}

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

        // Cycle 82: this is the mode-start "reset to default bounds" path, the
        // ONLY caller of setDynamicBounds. The genuine sandbox RESIZE goes through
        // rebuildEnvironment (main.js), which is already skipped for island
        // scenes. A scene that pins its homestead must keep that position here:
        // Newsheepdogland's house sits flush against the pen at (640,-956), but
        // this path used to re-derive the farmhouse from the medium-field default
        // bounds (±100 → (180,160)) and drop the house into the sea. Home Field
        // pins the same (180,160) the default bounds derive, so this is a no-op
        // there; the real Field sandbox resize still tracks bounds via
        // rebuildEnvironment.
        const pinnedFarmHouse = builder.sceneDef?.farmHouse?.position;
        if (pinnedFarmHouse) {
            builder.farmHousePosition = { x: pinnedFarmHouse.x, z: pinnedFarmHouse.z };
            builder.farmHouseExclusionArea = builder.sceneDef.farmHouse.exclusionArea
                ? { ...builder.sceneDef.farmHouse.exclusionArea }
                : {
                    minX: pinnedFarmHouse.x - 40,
                    maxX: pinnedFarmHouse.x + 40,
                    minZ: pinnedFarmHouse.z - 40,
                    maxZ: pinnedFarmHouse.z + 40
                };
        } else {
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
        }
        console.log('[TERRAIN] Updated farmhouse position:', builder.farmHousePosition);

        // Actually MOVE the existing farmhouse to the new position
        updateFarmhousePosition(builder);
    }

    if (pasture) {
        builder.currentPasture = pasture;
        console.log('[TERRAIN] Updated pasture area:', pasture);
    }

    // Cycle 121: re-resolve the worn zones from scene data. Deliberately NO
    // pasture override here, even though one was handed in. This is the
    // mode-start "reset to default bounds" path (js/main.js#startGame), and the
    // `pasture` it carries is `gameState.pasture`, which is js/FieldConfig.js's
    // default rect on every scene - not the pen any of them actually has. The
    // genuine sandbox resize passes its own pasture through regenerateGrass
    // below, which is the one caller that legitimately moves a pen.
    //
    // NOTE: we want grass INSIDE the field, so no bounds exclusion.
    syncWornZones(builder);
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

    // Cycle 115 Phase 4: carry the scene's worn gate approach across the
    // rebuild. This is a fresh GrassSystem, so without the line the terrain
    // would keep shading the approach while the regenerated grass stopped
    // thinning over it, and the two would disagree about the same ground.
    builder.grassSystem.setGateApproach(builder.gateApproach ?? null);

    // Cycle 121: the farmhouse yard and the pen, from the one resolved list.
    // This IS the genuine sandbox resize (rebuildEnvironment is the only caller
    // and js/main.js skips it on island scenes), so the pasture it was handed is
    // authoritative and overrides the scene's declared pen. Must land before
    // init(), which is when the scatter runs.
    //
    // NOTE: we DO want grass inside the play area. Only the yard and the pen.
    syncWornZones(builder, pasture ?? null);

    await builder.grassSystem.init();

    builder.grassMaterial = builder.grassSystem.grassMaterial;
    const stats = builder.grassSystem.getStats();
    builder.grassInstanceCount = stats.totalClumps * (builder.isMobile ? 3 : 5);

    console.log(`[TERRAIN] Grass regenerated: ${stats.totalClumps} clumps`);
}
