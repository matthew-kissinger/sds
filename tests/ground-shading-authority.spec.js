// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The two Cycle 114 acceptance lines that shipped without their specs.
 *
 * Phase 1 asked for "a new spec shall pin the keep-probability curve at the zone
 * edge, mid-band and beyond the band". Phase 2 asked that "the grass
 * colour-variation frequencies and rotation constant shall equal the terrain's,
 * verified by a spec that reads both files". Neither was written; an adversarial
 * review after the close found both missing.
 *
 * The second is the load-bearing one. js/world/groundShading.js exists so that
 * four render paths (WebGL terrain, WebGPU terrain, WebGL grass, WebGPU grass)
 * compute the SAME ground field, and it generates its GLSL from its constants so
 * they cannot drift by retyping. What a generator cannot prevent is a path
 * quietly going around it, so this reads the shipped files and checks they use
 * the shared symbols rather than a private copy of the numbers.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    GROUND_VARIATION,
    GROUND_VARIATION_GLSL,
    sampleGroundVariation01,
    groundContactFalloff,
    resolveEntityFacing,
} from '../js/world/groundShading.js';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

/** A GrassSystem with only what exclusionKeepProbability touches. */
async function grassWithZones(zones) {
    const { GrassSystem } = await import('../js/GrassSystem.js');
    const host = Object.create(GrassSystem.prototype);
    host.exclusionZones = zones;
    host.heightfield = null;
    return host;
}

describe('Phase 1: the exclusion keep-probability curve', () => {
    const RECT = [{ type: 'rect', minX: -10, maxX: 10, minZ: -10, maxZ: 10 }];

    it('is exactly 0 inside the zone', async () => {
        const g = await grassWithZones(RECT);
        expect(g.exclusionKeepProbability(0, 0)).toBe(0);
        expect(g.exclusionKeepProbability(9.9, 0)).toBe(0);
    });

    it('is 0 exactly at the zone edge', async () => {
        const g = await grassWithZones(RECT);
        expect(g.exclusionKeepProbability(10, 0)).toBe(0);
    });

    it('is strictly between 0 and 1 inside the falloff band', async () => {
        const g = await grassWithZones(RECT);
        const mid = g.exclusionKeepProbability(12, 0);
        expect(mid).toBeGreaterThan(0);
        expect(mid).toBeLessThan(1);
    });

    it('is exactly 1 beyond the band', async () => {
        const g = await grassWithZones(RECT);
        expect(g.exclusionKeepProbability(40, 0)).toBe(1);
    });

    it('increases monotonically across the band', async () => {
        const g = await grassWithZones(RECT);
        let prev = -1;
        for (let d = 10; d <= 15; d += 0.25) {
            const k = g.exclusionKeepProbability(d, 0);
            expect(k).toBeGreaterThanOrEqual(prev);
            prev = k;
        }
        expect(prev).toBe(1);
    });

    it('composes overlapping zones by minimum, not by product', async () => {
        // A product would drive an overlap toward zero and reinstate the bald
        // patch the falloff exists to remove.
        const a = { type: 'rect', minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
        const b = { type: 'rect', minX: -10, maxX: 10, minZ: 12, maxZ: 30 };
        const g = await grassWithZones([a, b]);
        const solo = (await grassWithZones([a])).exclusionKeepProbability(0, 11);
        const both = g.exclusionKeepProbability(0, 11);
        const other = (await grassWithZones([b])).exclusionKeepProbability(0, 11);
        expect(both).toBe(Math.min(solo, other));
        expect(both).toBeGreaterThan(solo * other);
    });

    it('follows a rotated zone\'s own edge rather than its bounding box', async () => {
        const angle = Math.PI / 4;
        const zone = {
            type: 'rotated', centerX: 0, centerZ: 0, width: 20, depth: 20,
            cosAngle: Math.cos(-angle), sinAngle: Math.sin(-angle),
        };
        const g = await grassWithZones([zone]);
        // A point past the corner of the axis-aligned bounding box but only just
        // outside the rotated square's own edge.
        const alongEdge = g.exclusionKeepProbability(Math.SQRT1_2 * 11, Math.SQRT1_2 * 11);
        expect(alongEdge).toBeGreaterThan(0);
        expect(alongEdge).toBeLessThan(1);
    });
});

describe('Phase 2: the four ground paths read one authority', () => {
    it('the WebGL terrain uses the generated chunk, not its own noise', () => {
        const src = read('js/TerrainBuilder.js');
        expect(src).toContain('GROUND_VARIATION_GLSL');
        expect(src).toContain('sdsGroundVariation01(vWorldPos.xz)');
        // The LOW-FREQUENCY term specifically, which is the one grass reads, must
        // come from the shared field. The terrain keeps its own higher-frequency
        // fbm for n2/n3, deliberately: those are terrain detail, not the field
        // grass has to agree with. Asserting fbm() is gone entirely would be
        // asserting the wrong thing.
        expect(src).toMatch(/float\s+n1\s*=\s*sdsGroundVariation01\(/);
    });

    it('the WebGL grass uses the same generated chunk', () => {
        const src = read('js/GrassSystem.js');
        expect(src).toContain('GROUND_VARIATION_GLSL');
        expect(src).toContain('sdsGroundVariation01(vWorldPos.xz)');
    });

    it('the WebGPU terrain and grass both build from the shared node helpers', () => {
        expect(read('js/world/webgpuTerrainNodeMaterial.js')).toContain('buildGroundVariationNode');
        expect(read('js/world/webgpuGrassBladeNodeMaterial.js')).toContain('buildGroundVariationNode');
    });

    it('no path re-declares the octave frequencies as literals', () => {
        // The generator interpolates these; a literal in a shader file means a
        // path went around the authority.
        const a = String(GROUND_VARIATION.octaveA?.frequency ?? 0.012);
        for (const f of ['js/TerrainBuilder.js', 'js/GrassSystem.js']) {
            const src = read(f);
            // The value may appear inside the imported GLSL chunk at runtime but
            // must not be typed into the source.
            const typed = src.split('GROUND_VARIATION_GLSL')[0];
            expect(typed).not.toContain(`* ${a}`);
        }
    });

    it('the generated GLSL carries the constants it was built from', () => {
        expect(GROUND_VARIATION_GLSL).toContain(String(GROUND_VARIATION.hashVector[0]));
        expect(GROUND_VARIATION_GLSL).toContain(String(GROUND_VARIATION.hashVector[1]));
        expect(GROUND_VARIATION_GLSL).toContain('sdsGroundVariation01');
    });

    it('the JS reference produces a bounded, spatially coherent field', () => {
        let min = 1, max = 0;
        for (let i = 0; i < 3000; i++) {
            const v = sampleGroundVariation01(i * 0.7, i * 1.3);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
            min = Math.min(min, v); max = Math.max(max, v);
        }
        expect(max - min).toBeGreaterThan(0.3); // it actually varies
        // Coherent: one metre apart differs less than eighty metres apart.
        let near = 0, far = 0;
        for (let i = 0; i < 300; i++) {
            const x = i * 5.1, z = i * 2.7;
            near += Math.abs(sampleGroundVariation01(x, z) - sampleGroundVariation01(x + 1, z));
            far += Math.abs(sampleGroundVariation01(x, z) - sampleGroundVariation01(x + 80, z));
        }
        expect(far).toBeGreaterThan(near);
    });
});

describe('resolveEntityFacing is the one place the three entity shapes are decoded', () => {
    it('maps a sheep scalar angle as (cos, sin)', () => {
        const f = resolveEntityFacing({ facingDirection: 0 });
        expect(f.x).toBeCloseTo(1, 6);
        expect(f.z).toBeCloseTo(0, 6);
    });

    it('maps a dog yaw as (sin, cos), which is NOT the sheep mapping', () => {
        // Swapping these rotates the dog's contact footprint by 90 degrees, so
        // the shadow points sideways. The two mappings differing is deliberate.
        const dog = resolveEntityFacing({ currentRotation: 0 });
        expect(dog.x).toBeCloseTo(0, 6);
        expect(dog.z).toBeCloseTo(1, 6);
        const sheep = resolveEntityFacing({ facingDirection: 0 });
        expect(dog.x).not.toBeCloseTo(sheep.x, 3);
    });

    it('normalises a supplied vector and rejects a zero-length one', () => {
        expect(resolveEntityFacing({ facing: { x: 0, z: 9 } }).z).toBeCloseTo(1, 6);
        expect(resolveEntityFacing({ facing: { x: 0, z: 0 } })).toEqual({ x: 0, z: 1 });
    });

    it('falls back to +Z for an entity carrying no facing at all', () => {
        expect(resolveEntityFacing({})).toEqual({ x: 0, z: 1 });
        expect(resolveEntityFacing(null)).toEqual({ x: 0, z: 1 });
    });

    it('decodes the real production dog slot, which carries currentRotation', () => {
        // js/main.js:734 builds { position, type: 'player', currentRotation }.
        // The first _syncGroundContact handled only facingDirection, so this
        // shape fell through to the default and the terrain contact never turned.
        const f = resolveEntityFacing({ position: {}, type: 'player', currentRotation: Math.PI / 2 });
        expect(f.x).toBeCloseTo(1, 6);
        expect(f.z).toBeCloseTo(0, 6);
    });
});

describe('the contact falloff is shared, so grass and terrain cannot pop at the grass line', () => {
    it('peaks under the body and decays outward', () => {
        expect(groundContactFalloff(0, 0)).toBeGreaterThan(groundContactFalloff(2, 0));
        expect(groundContactFalloff(0, 0)).toBeGreaterThan(groundContactFalloff(0, 2));
    });

    it('reaches zero well outside the footprint', () => {
        expect(groundContactFalloff(50, 50)).toBe(0);
    });

    it('never returns a negative shade', () => {
        for (let a = -6; a <= 6; a += 0.5) {
            for (let c = -6; c <= 6; c += 0.5) {
                expect(groundContactFalloff(a, c)).toBeGreaterThanOrEqual(0);
            }
        }
    });
});
