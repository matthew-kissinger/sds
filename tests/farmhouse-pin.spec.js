// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 82: the mode-start "reset to default bounds" path (setDynamicBounds, the
 * only caller) must not relocate a scene-pinned homestead. Newsheepdogland pins
 * its farmhouse flush against the pen at (640,-956); the path used to re-derive
 * the farmhouse from the medium-field default bounds (±100 → (180,160)) and drop
 * the house into the sea. Scenes without a pinned farmhouse (the Home Field
 * sandbox) still track the bounds. The genuine sandbox resize goes through
 * rebuildEnvironment, which is skipped for island scenes, so it is left deriving.
 */
import { describe, it, expect } from 'vitest';
import { setDynamicBounds } from '../js/world/sandbox.js';

function makeBuilder(sceneDef) {
    return {
        sceneDef,
        zones: {},
        buildings: [{
            position: {
                set(x, y, z) { this.x = x; this.y = y; this.z = z; },
            },
        }],
        grassSystem: null,
        // On-land Y near the pen; the real builder uses the heightfield.
        _groundY: () => 3.58,
    };
}

const MEDIUM_BOUNDS = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };

describe('setDynamicBounds farmhouse pinning (Cycle 82)', () => {
    it('keeps a scene-pinned farmhouse at its scene-def position, not the bounds-derived sea tile', () => {
        const builder = makeBuilder({
            farmHouse: {
                position: { x: 640, z: -956 },
                exclusionArea: { minX: 620, maxX: 660, minZ: -976, maxZ: -936 },
            },
        });

        setDynamicBounds(builder, MEDIUM_BOUNDS, null);

        expect(builder.farmHousePosition).toEqual({ x: 640, z: -956 });
        expect(builder.farmHouseExclusionArea).toEqual({ minX: 620, maxX: 660, minZ: -976, maxZ: -936 });
        // The building mesh was actually moved to the pinned spot (on land).
        expect(builder.buildings[0].position.x).toBe(640);
        expect(builder.buildings[0].position.z).toBe(-956);
        expect(builder.buildings[0].position.y).toBe(3.58);
    });

    it('derives the farmhouse from bounds when the scene does not pin one (sandbox default)', () => {
        const builder = makeBuilder({}); // no farmHouse on the scene def

        setDynamicBounds(builder, MEDIUM_BOUNDS, null);

        // Legacy behavior preserved: northeast of the field corner.
        expect(builder.farmHousePosition).toEqual({ x: 180, z: 160 });
        expect(builder.farmHouseExclusionArea).toEqual({ minX: 140, maxX: 220, minZ: 120, maxZ: 200 });
    });

    it('is a no-op move for Home Field: the pinned position equals the default-bounds derivation', () => {
        const builder = makeBuilder({
            farmHouse: {
                position: { x: 180, z: 160 },
                exclusionArea: { minX: 140, maxX: 220, minZ: 120, maxZ: 200 },
            },
        });

        setDynamicBounds(builder, MEDIUM_BOUNDS, null);

        expect(builder.farmHousePosition).toEqual({ x: 180, z: 160 });
        expect(builder.farmHouseExclusionArea).toEqual({ minX: 140, maxX: 220, minZ: 120, maxZ: 200 });
    });
});
