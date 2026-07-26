// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * One zone list, two consumers (Cycle 121).
 *
 * The pen interior, the farmhouse yard and the gate approach are the same ground
 * with three names, and until this cycle two systems described it without
 * knowing about each other: grass removal was a rect list on `js/GrassSystem.js`
 * and ground wear was a uniform-driven term in the terrain colour graph. Grass
 * thinned over a band around a rect the terrain never shaded, so the eye read
 * the grass boundary as the edge and the ground read as a painted plane.
 *
 * Three failure modes this file exists for.
 *
 * 1. **A zone that only one consumer knows about.** The live case:
 *    `TerrainBuilder` keyed its pen exclusion on `sceneDef.pasture`, which only
 *    Home Field declares, so Rolling Hills' island pasture and
 *    Newsheepdogland's homestead had grass growing inside them. Confirmed in a
 *    browser before the fix (cycle121-validation/before/rh-pasture.png), not
 *    inferred from a grep.
 *
 * 2. **The two render paths drifting.** A term in the node graph and not in the
 *    GLSL twin is a defect regardless of how it looks.
 *
 * 3. **A dead uniform.** Cycle 114 Phase 5 shipped a term that was present in
 *    the shader and never driven, and it had to be caught by eye. So the
 *    assertions below read the values a real TerrainBuilder actually writes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { DoubleSide, MeshLambertNodeMaterial, TSL } from 'three/webgpu';

import {
    GROUND_APPROACH,
    GROUND_WEAR,
    GROUND_WEAR_GLSL,
    WORN_ZONE_SLOTS,
    WORN_ZONE_UNIFORMS,
    groundWear01,
    packWornZones,
    resolveWornGroundZones,
    wornZoneCoverage01,
    wornZoneDistance,
} from '../js/world/groundShading.js';
import { GrassSystem } from '../js/GrassSystem.js';
import { TerrainBuilder } from '../js/TerrainBuilder.js';
import { resolvePenBox } from '../js/StructureBuilder.js';
import { createWebGpuTerrainNodeMaterialFactories } from '../js/world/webgpuTerrainNodeMaterialFactories.js';
import { field } from '../shared/scenes/field.js';
import { rollingHills } from '../shared/scenes/rolling-hills.js';
import { openCountry } from '../shared/scenes/open-country.js';
import { newsheepdogland } from '../shared/scenes/newsheepdogland.js';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

const zoneOfKind = (zones, kind) => zones.find((z) => z.kind === kind) ?? null;

/** The minimum GrassSystem surface `exclusionKeepProbability` touches. */
const grassHost = (zones) => ({
    exclusionZones: zones,
    _exclusionZoneDistance: GrassSystem.prototype._exclusionZoneDistance,
    exclusionKeepProbability: GrassSystem.prototype.exclusionKeepProbability,
});

function withWebGlTerrain(sceneDef, run) {
    const scene = new THREE.Scene();
    const builder = new TerrainBuilder(scene, false, sceneDef);
    const terrain = builder.createTerrain();
    try {
        return run(terrain, builder);
    } finally {
        terrain.geometry?.dispose?.();
        terrain.material?.dispose?.();
        scene.remove(terrain);
    }
}

function withWebGpuTerrain(sceneDef, run) {
    const nodeFactories = createWebGpuTerrainNodeMaterialFactories(
        { ...THREE, MeshLambertNodeMaterial, DoubleSide, TSL }
    );
    const scene = new THREE.Scene();
    const builder = new TerrainBuilder(scene, false, sceneDef, {
        search: '?renderer=webgpu&webgpuTerrain=1',
        webgpuTerrainFactories: nodeFactories,
    });
    const terrain = builder.createTerrain();
    try {
        return run(terrain, builder);
    } finally {
        terrain.geometry?.dispose?.();
        terrain.material?.userData?.heightTexture?.dispose?.();
        terrain.material?.dispose?.();
        scene.remove(terrain);
    }
}

describe('every scene that fences a pen gets worn ground for it', () => {
    it('gives Rolling Hills\' island pasture a zone, which it had none of', () => {
        // The defect: the pen exclusion was keyed on `sceneDef.pasture` and this
        // island declares a nested `pen` rect (Cycle 117 P2). Grass grew inside
        // the pasture that every ranked solo run drives into.
        const zones = resolveWornGroundZones(rollingHills);
        const pen = zoneOfKind(zones, 'pen');
        expect(pen).toEqual({
            kind: 'pen',
            type: 'rect',
            minX: 32,
            maxX: 68,
            minZ: -94,
            maxZ: -58,
            wear: GROUND_WEAR.kindWear.pen,
        });
        // ...and the grass consumer agrees, which is the half that was missing.
        expect(grassHost(zones).exclusionKeepProbability(50, -76)).toBe(0);
    });

    it('gives Newsheepdogland\'s homestead a zone from the square pen form', () => {
        // Same key, different shape: `pen: {center, radius}` where radius is the
        // half-side. Sparse island grass hid it.
        const zones = resolveWornGroundZones(newsheepdogland);
        expect(zoneOfKind(zones, 'pen')).toEqual({
            kind: 'pen',
            type: 'rect',
            minX: 610,
            maxX: 670,
            minZ: -1030,
            maxZ: -970,
            wear: GROUND_WEAR.kindWear.pen,
        });
        expect(grassHost(zones).exclusionKeepProbability(640, -1000)).toBe(0);
    });

    it('normalises both pen forms exactly the way the fence builder does', () => {
        // `shared/PenBarrier.js` is fence-frozen deterministic-sim code, so the
        // render path copies its two-form normalisation rather than importing it.
        // `js/StructureBuilder.js#resolvePenBox` is the copy that raises the
        // actual fence. If the ground and the fence ever disagree about where the
        // pen is, the bare rectangle stops lining up with the posts.
        for (const scene of [rollingHills, newsheepdogland]) {
            const pen = zoneOfKind(resolveWornGroundZones(scene), 'pen');
            const box = resolvePenBox(scene.pen);
            expect(pen).toBeTruthy();
            expect({ minX: pen.minX, maxX: pen.maxX, minZ: pen.minZ, maxZ: pen.maxZ }).toEqual(box);
        }
    });

    it('keeps Home Field\'s pen on the fence line, not on the declared rect', () => {
        // Cycle 114 Phase 1's correction, and it has to survive this refactor.
        // `pasture` gives the pen its dimensions but not its origin: the fence
        // stands at z[bounds.maxZ, bounds.maxZ + depth] = z[100,128] while the
        // scene declares z[102,130]. Excluding the declared rect leaves grass
        // inside the front of the pen and a bald strip behind its back fence.
        const pen = zoneOfKind(resolveWornGroundZones(field), 'pen');
        expect(pen.minZ).toBe(100);
        expect(pen.maxZ).toBe(128);
        expect(field.pasture.minZ).toBe(102);
        expect(field.pasture.maxZ).toBe(130);
        expect(pen.minX).toBe(-30);
        expect(pen.maxX).toBe(30);
    });

    it('gives the farmhouse yard its own, gentler zone', () => {
        // Shape and intensity differ between the three surfaces; the material
        // never does. A pen is small and every sheep in the run stands in it; a
        // yard is an 80m x 80m clearance rect around a building and only the part
        // near the house sees traffic.
        const yard = zoneOfKind(resolveWornGroundZones(field), 'farmyard');
        expect(yard).toEqual({
            kind: 'farmyard',
            type: 'rect',
            minX: 140,
            maxX: 220,
            minZ: 120,
            maxZ: 200,
            wear: GROUND_WEAR.kindWear.farmyard,
        });
        expect(yard.wear).toBeLessThan(GROUND_WEAR.kindWear.pen);
    });

    it('leaves a scene with neither pen nor farmhouse completely alone', () => {
        expect(resolveWornGroundZones(openCountry)).toEqual([]);
        expect(resolveWornGroundZones(null)).toEqual([]);
        expect(resolveWornGroundZones({})).toEqual([]);
    });

    it('resolves no more zones than the shaders have slots for', () => {
        // A zone the grass thins over and the terrain has no slot to shade is
        // the exact disconnect this cycle removes, so the resolver truncates.
        for (const scene of [field, rollingHills, openCountry, newsheepdogland]) {
            expect(resolveWornGroundZones(scene).length).toBeLessThanOrEqual(WORN_ZONE_SLOTS);
        }
    });
});

describe('the grass thinning and the terrain wear are one field', () => {
    const zones = resolveWornGroundZones(field);

    it('makes the grass keep exactly one minus the shared coverage', () => {
        // The identity that makes this one effect rather than two that overlap.
        // A minimum over per-zone smoothsteps is one minus a maximum over their
        // complements, so the grass thins over precisely the band the ground
        // darkens under. Walk across a pen edge and both its falloff bands.
        const host = grassHost(zones);
        let sawPartial = 0;
        for (let z = 90; z <= 140; z += 0.25) {
            for (const x of [-40, -31, -30, -20, 0, 20, 31, 40]) {
                const keep = host.exclusionKeepProbability(x, z);
                expect(keep).toBeCloseTo(1 - wornZoneCoverage01(x, z, zones), 12);
                if (keep > 0.02 && keep < 0.98) sawPartial++;
            }
        }
        expect(sawPartial).toBeGreaterThan(20);
    });

    it('darkens the ground the grass is thinning over, and only there', () => {
        const pen = zoneOfKind(zones, 'pen');
        // Full wear inside the pen, where the grass keep is zero.
        expect(groundWear01(0, 114, zones)).toBeCloseTo(GROUND_WEAR.kindWear.pen, 9);
        expect(grassHost(zones).exclusionKeepProbability(0, 114)).toBe(0);
        // Partway through the falloff band, both are partial.
        const edgeZ = pen.minZ - GROUND_WEAR.falloff / 2;
        expect(groundWear01(0, edgeZ, zones)).toBeGreaterThan(0);
        expect(groundWear01(0, edgeZ, zones)).toBeLessThan(GROUND_WEAR.kindWear.pen);
        // Past the band, the pasture never hears about it.
        expect(groundWear01(0, pen.minZ - GROUND_WEAR.falloff - 0.01, zones)).toBe(0);
        expect(groundWear01(0, 0, zones)).toBe(0);
        expect(grassHost(zones).exclusionKeepProbability(0, 0)).toBe(1);
    });

    it('scales the same shape by each zone\'s own intensity', () => {
        const yard = zoneOfKind(zones, 'farmyard');
        const cx = (yard.minX + yard.maxX) / 2;
        const cz = (yard.minZ + yard.maxZ) / 2;
        expect(groundWear01(cx, cz, zones)).toBeCloseTo(GROUND_WEAR.kindWear.farmyard, 9);
        // The grass is excluded just as hard there, though: intensity is the
        // terrain's business. The yard is bald and always has been.
        expect(grassHost(zones).exclusionKeepProbability(cx, cz)).toBe(0);
    });

    it('composes overlapping zones by maximum, never by sum', () => {
        // Newsheepdogland's farmhouse yard overlaps the north edge of its pen.
        // A sum would push the overlap past full wear and read as a mud slick.
        const nsl = resolveWornGroundZones(newsheepdogland);
        const overlapZ = -972; // inside the pen (maxZ -970) and the yard (minZ -976)
        expect(wornZoneDistance(zoneOfKind(nsl, 'pen'), 640, overlapZ)).toBeLessThan(0);
        expect(wornZoneDistance(zoneOfKind(nsl, 'farmyard'), 640, overlapZ)).toBeLessThan(0);
        expect(groundWear01(640, overlapZ, nsl)).toBe(GROUND_WEAR.kindWear.pen);
        expect(groundWear01(640, overlapZ, nsl)).toBeLessThanOrEqual(1);
    });

    it('leaves Cycle 114\'s falloff at the width it measured', () => {
        // Cycle 121 shaded the ground the grass fades onto and did NOT widen the
        // band. Recorded here so a future change to it has to be deliberate.
        expect(GROUND_WEAR.falloff).toBe(4.0);
    });

    it('wears the ground to the same peak the gate approach does', () => {
        // D26 and D27 are one cycle because the three surfaces are one treatment.
        expect(GROUND_WEAR.dirtBlend).toBe(GROUND_APPROACH.dirtBlend);
    });
});

describe('the packed uniform payload reproduces the CPU field', () => {
    // The one seam through which the resolved list reaches a shader. A swapped
    // half-extent or a dropped rotation term here renders as a rectangle in the
    // wrong place and nothing else notices.
    function evalPacked(pack, x, z) {
        // Transliterated from GROUND_WEAR_GLSL#sdsGroundWearZone, line for line.
        let wear = 0;
        for (let i = 0; i < WORN_ZONE_SLOTS; i++) {
            const [cx, cz, hx, hz] = pack.rect[i];
            const [cos, sin, peak] = pack.shape[i];
            const dx = x - cx;
            const dz = z - cz;
            const localX = dx * cos - dz * sin;
            const localZ = dx * sin + dz * cos;
            const qx = Math.abs(localX) - hx;
            const qz = Math.abs(localZ) - hz;
            const sdf = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
            const t = Math.min(1, Math.max(0, sdf / GROUND_WEAR.falloff));
            wear = Math.max(wear, (1 - t * t * (3 - 2 * t)) * peak);
        }
        return wear;
    }

    it('agrees with groundWear01 across every shipped scene', () => {
        for (const scene of [field, rollingHills, openCountry, newsheepdogland]) {
            const zones = resolveWornGroundZones(scene);
            const pack = packWornZones(zones);
            const probes = zones.length
                ? zones.flatMap((zone) => {
                    const cx = (zone.minX + zone.maxX) / 2;
                    const cz = (zone.minZ + zone.maxZ) / 2;
                    const out = [];
                    for (let dx = -1.4; dx <= 1.4; dx += 0.2) {
                        for (let dz = -1.4; dz <= 1.4; dz += 0.2) {
                            out.push([
                                cx + dx * (zone.maxX - zone.minX) / 2,
                                cz + dz * (zone.maxZ - zone.minZ) / 2,
                            ]);
                        }
                    }
                    return out;
                })
                : [[0, 0], [50, -50]];
            for (const [x, z] of probes) {
                expect(evalPacked(pack, x, z)).toBeCloseTo(groundWear01(x, z, zones), 9);
            }
        }
    });

    it('agrees on a rotated zone, which only the sandbox produces', () => {
        const zones = resolveWornGroundZones(null, {
            pasture: { minX: -30, maxX: 30, minZ: 102, maxZ: 130, edgeAngle: 0.6 },
        });
        expect(zones[0].type).toBe('rotated');
        const pack = packWornZones(zones);
        for (let x = -45; x <= 45; x += 2.5) {
            for (let z = 92; z <= 142; z += 2.5) {
                expect(evalPacked(pack, x, z)).toBeCloseTo(groundWear01(x, z, zones), 9);
            }
        }
    });

    it('parks an unused slot on an identity rotation with zero wear', () => {
        // Never a zero-sized rotation matrix: the shader multiplies by it
        // unconditionally, and a (0,0) pair would collapse every position onto
        // the origin before the SDF ever ran.
        const pack = packWornZones([]);
        expect(pack.used).toBe(0);
        for (let i = 0; i < WORN_ZONE_SLOTS; i++) {
            expect(pack.shape[i]).toEqual([1, 0, 0, 0]);
            expect(evalPacked(pack, 0, 0)).toBe(0);
        }
    });
});

describe('both terrain paths carry the term, and both are driven', () => {
    it('generates its GLSL from the constants, so the two paths cannot drift', () => {
        expect(GROUND_WEAR_GLSL).toContain(String(GROUND_WEAR.falloff));
        expect(GROUND_WEAR_GLSL).toContain(String(GROUND_WEAR.dirtBlend));
        expect(GROUND_WEAR_GLSL).toContain(`[${WORN_ZONE_SLOTS}]`);
        expect(GROUND_WEAR_GLSL).toContain(`i < ${WORN_ZONE_SLOTS}`);
        expect(GROUND_WEAR_GLSL).toContain(WORN_ZONE_UNIFORMS.rect);
        expect(GROUND_WEAR_GLSL).toContain(WORN_ZONE_UNIFORMS.shape);
    });

    it('folds the term into the WebGL dirt mix by maximum', () => {
        const src = read('js/TerrainBuilder.js');
        expect(src).toContain('${GROUND_WEAR_GLSL}');
        expect(src).toContain('float wornDirt = sdsGroundWearDirt(vWorldPos.xz);');
        expect(src).toContain('max(max(dirtMask * 0.4, approachDirt), wornDirt)');
    });

    it('folds the term into the WebGPU dirt mix by maximum', () => {
        // A term in the node graph and not in the GLSL twin, or the other way
        // round, is a defect regardless of how it looks.
        const src = read('js/world/webgpuTerrainNodeMaterial.js');
        expect(src).toContain('buildGroundWearDirtNode(');
        expect(src).toContain('max(max(dirtMask.mul(terrain.dirtStrength ?? 0.26), approachDirt), wornDirt)');
    });

    it('drives the WebGL uniforms from the resolved zones', () => {
        withWebGlTerrain(field, (terrain, builder) => {
            const u = terrain.material.uniforms;
            expect(terrain.material.fragmentShader).toContain('sdsGroundWearDirt(');
            const rects = u[WORN_ZONE_UNIFORMS.rect].value;
            const shapes = u[WORN_ZONE_UNIFORMS.shape].value;
            expect(rects).toHaveLength(WORN_ZONE_SLOTS);
            expect(shapes).toHaveLength(WORN_ZONE_SLOTS);
            const expected = packWornZones(builder.wornZones);
            for (let i = 0; i < WORN_ZONE_SLOTS; i++) {
                expect([rects[i].x, rects[i].y, rects[i].z, rects[i].w]).toEqual(expected.rect[i]);
                expect([shapes[i].x, shapes[i].y, shapes[i].z, shapes[i].w]).toEqual(expected.shape[i]);
            }
            // Not a shader full of zeros: Home Field resolves a yard and a pen.
            expect(expected.used).toBe(2);
        });
    });

    it('holds every WebGL slot at zero wear on a scene with no worn ground', () => {
        withWebGlTerrain(openCountry, (terrain) => {
            for (const shape of terrain.material.uniforms[WORN_ZONE_UNIFORMS.shape].value) {
                expect(shape.z).toBe(0);
                // Identity rotation even unused.
                expect(shape.x).toBe(1);
            }
        });
    });

    it('drives the WebGPU node uniforms from the same resolved zones', () => {
        withWebGpuTerrain(rollingHills, (terrain, builder) => {
            const slots = terrain.material.userData.wornGroundNodeUniforms.slots;
            expect(slots).toHaveLength(WORN_ZONE_SLOTS);
            const expected = packWornZones(builder.wornZones);
            expect(expected.used).toBe(1);
            for (let i = 0; i < WORN_ZONE_SLOTS; i++) {
                const r = slots[i].rect.value;
                const s = slots[i].shape.value;
                expect([r.x, r.y, r.z, r.w]).toEqual(expected.rect[i]);
                expect([s.x, s.y, s.z, s.w]).toEqual(expected.shape[i]);
            }
            // The colour graph built with the wear folded in. This is the half
            // that catches a TSL API mistake, which throws at build time.
            expect(terrain.material.colorNode).toBeTruthy();
        });
    });

    it('hands the grass the SAME array the terrain shades', () => {
        // Not an equal list. One array, two readers: a copy is how the two
        // descriptions of this ground drifted apart in the first place.
        const src = read('js/TerrainBuilder.js');
        expect(src).toContain('this.grassSystem.setWornZones(this.wornZones)');
        expect(src).toContain('wornZones: this.wornZones');
        const seen = [];
        const host = Object.create(TerrainBuilder.prototype);
        host.sceneDef = null;
        host.farmHousePosition = { x: 0, z: 0 };
        host.farmHouseExclusionArea = null;
        host.grassSystem = { setGateApproach() {}, setWornZones: (z) => seen.push(z) };
        TerrainBuilder.prototype.setSceneDef.call(host, rollingHills);
        expect(seen).toHaveLength(1);
        expect(seen[0]).toBe(host.wornZones);
    });

    it('re-resolves on a scene swap instead of inheriting the boot scene', () => {
        // A builder that booted on Home Field would otherwise carry its pen and
        // farmhouse yard onto an island as two brown rectangles in open meadow.
        const host = Object.create(TerrainBuilder.prototype);
        host.sceneDef = null;
        host.farmHousePosition = { x: 0, z: 0 };
        host.farmHouseExclusionArea = null;
        host.grassSystem = null;

        TerrainBuilder.prototype.setSceneDef.call(host, field);
        expect(host.wornZones.map((z) => z.kind)).toEqual(['farmyard', 'pen']);

        TerrainBuilder.prototype.setSceneDef.call(host, openCountry);
        expect(host.wornZones).toEqual([]);

        TerrainBuilder.prototype.setSceneDef.call(host, rollingHills);
        expect(host.wornZones.map((z) => z.kind)).toEqual(['pen']);
    });

    it('pushes a re-resolved list to whichever terrain material is live', () => {
        // Cycle 115 made the approach uniforms live so a later cycle could drive
        // them without a material rebuild. This is that drive. Without it the
        // terrain keeps shading the zones it booted with while the regenerated
        // grass thins over the new ones.
        withWebGlTerrain(openCountry, (terrain, builder) => {
            const shapes = terrain.material.uniforms[WORN_ZONE_UNIFORMS.shape].value;
            expect(shapes[0].z).toBe(0);
            builder.wornZones = resolveWornGroundZones(rollingHills);
            builder._syncWornZones();
            const rects = terrain.material.uniforms[WORN_ZONE_UNIFORMS.rect].value;
            expect(shapes[0].z).toBe(GROUND_WEAR.kindWear.pen);
            expect(rects[0].x).toBe(50);
            expect(rects[0].y).toBe(-76);
        });
    });
});

describe('the rebuild paths stop inventing a second zone list', () => {
    const src = read('js/world/sandbox.js');

    it('routes both rebuilds through the one resolver', () => {
        // Measured live on 2026-07-26: every scene came out of startGame carrying
        // {-30,30,102,125}, js/FieldConfig.js's default rect off Home Field's
        // medium bounds. Two metres off Home Field's real fence line and about a
        // kilometre from Newsheepdogland's homestead. Nothing re-scattered after
        // it, so it never showed - until the terrain started reading the list.
        // Call sites, not the definition: one per rebuild path and no third
        // place that hand-rolls a list.
        expect(src.match(/^\s*syncWornZones\(builder/gm)).toHaveLength(2);
        expect(src).not.toContain('grassSystem.exclusionZones = []');
        expect(src).not.toContain('addRotatedExclusionZone');
    });

    it('takes no pasture override on the mode-start reset path', () => {
        // `setDynamicBounds` is handed `gameState.pasture` and must ignore it.
        expect(src).toMatch(/syncWornZones\(builder\);/);
        // ...while the genuine resize passes its own through.
        expect(src).toMatch(/syncWornZones\(builder, pasture \?\? null\);/);
    });

    it('lets a genuine sandbox pasture override the scene\'s declared pen', () => {
        const moved = { minX: -50, maxX: 50, minZ: 160, maxZ: 190 };
        const zones = resolveWornGroundZones(field, { pasture: moved });
        expect(zoneOfKind(zones, 'pen')).toMatchObject(moved);
    });
});

describe('the render path stays on its own side of the fence', () => {
    it('imports nothing from shared/ into the ground authority', () => {
        // shared/PenBarrier.js normalises the same two pen forms and is
        // fence-frozen deterministic-sim code. This file copies the shape; it
        // does not import from it and it does not push render concerns across.
        const src = read('js/world/groundShading.js');
        expect(src).not.toMatch(/from\s+['"][^'"]*\/shared\//);
        expect(src).not.toMatch(/from\s+['"]three/);
    });
});
